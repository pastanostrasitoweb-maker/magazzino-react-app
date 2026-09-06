-- IL PRONTO NON RISPEDISCE IL METODO VECCHIO DELL'APP.
--
-- Luca, 27/08/2026: "prendi un ordine, modifica il metodo di pagamento e
-- mettilo in Preparati: vedrai che lo perde ancora". Aveva ragione.
--
-- IL GIRO CHE LO PERDEVA. `trg_propaga_pagamento` su ordini_agenti era
-- AFTER INSERT OR UPDATE senza lista colonne: a OGNI scrittura sulla riga
-- dell'app agenti ricopiava il suo metodo_pagamento sull'ordine magazzino
-- collegato. E il magazzino su quella riga ci scrive di continuo i ping di
-- ritorno (stato_magazzino='Preso in gestione' all'import, 'Preparato' al
-- pronto, 'Spedito' alla spedizione): ogni ping rispediva indietro il metodo
-- STANTIO dell'app, cancellando la correzione appena fatta col bottone
-- rosso. Il database teneva il valore giusto per qualche secondo, poi il
-- ping lo ricopriva.
--
-- ADESSO: il metodo viaggia dall'app al magazzino solo quando c'e' una
-- NOVITA' VERA (la riga si aggancia all'ordine magazzino, o il metodo
-- cambia davvero sull'ordine app). Un ping di stato non porta notizie sul
-- pagamento e non lo tocca. E il bottone rosso scrive anche sulla riga
-- dell'app agenti, cosi' le due facce dell'ordine dicono la stessa cosa.

-- ============================================================================
-- 1. La propaga scatta solo sulle novita', e un metodo vuoto non cancella
-- ============================================================================
CREATE OR REPLACE FUNCTION _propaga_pagamento()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_metodo_nuovo boolean;
BEGIN
  IF coalesce(NEW.id_ordine_magazzino, '') = '' THEN RETURN NEW; END IF;

  IF tg_op = 'INSERT' THEN
    v_metodo_nuovo := true;
  ELSE
    v_metodo_nuovo := (NEW.metodo_pagamento IS DISTINCT FROM OLD.metodo_pagamento)
                   OR (NEW.id_ordine_magazzino IS DISTINCT FROM OLD.id_ordine_magazzino);
  END IF;
  -- Un metodo vuoto non e' una notizia: non cancella quello che c'e'.
  IF coalesce(btrim(NEW.metodo_pagamento), '') = '' THEN
    v_metodo_nuovo := false;
  END IF;

  IF v_metodo_nuovo THEN
    UPDATE ordini o SET
      metodo_pagamento = NEW.metodo_pagamento,
      contrassegno_importo = CASE WHEN NEW.metodo_pagamento ~* 'contrass'
                                  THEN coalesce(NEW.contrassegno_importo, NEW.totale)
                                  ELSE null END,
      polybox = coalesce(NEW.polybox, o.polybox)
    WHERE o.id_ordine = NEW.id_ordine_magazzino;
  ELSE
    -- L'importo del contrassegno puo' cambiare da solo (a metodo fermo).
    IF tg_op = 'UPDATE'
       AND NEW.contrassegno_importo IS DISTINCT FROM OLD.contrassegno_importo
       AND coalesce(NEW.metodo_pagamento, '') ~* 'contrass' THEN
      UPDATE ordini SET contrassegno_importo = coalesce(NEW.contrassegno_importo, NEW.totale)
       WHERE id_ordine = NEW.id_ordine_magazzino;
    END IF;
    -- Il polybox e' un fatto logistico, viaggia per conto suo.
    IF NEW.polybox IS NOT NULL
       AND (tg_op = 'INSERT' OR NEW.polybox IS DISTINCT FROM OLD.polybox) THEN
      UPDATE ordini SET polybox = NEW.polybox WHERE id_ordine = NEW.id_ordine_magazzino;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Il trigger ora ha la lista colonne: i ping di stato non lo svegliano nemmeno.
DROP TRIGGER IF EXISTS trg_propaga_pagamento ON ordini_agenti;
CREATE TRIGGER trg_propaga_pagamento
  AFTER INSERT OR UPDATE OF metodo_pagamento, id_ordine_magazzino, contrassegno_importo, polybox
  ON ordini_agenti
  FOR EACH ROW EXECUTE FUNCTION _propaga_pagamento();

-- ============================================================================
-- 2. Il bottone rosso corregge TUTTE E DUE le facce dell'ordine
-- ============================================================================
-- Senza questo pezzo la riga dell'app agenti resterebbe col metodo vecchio:
-- un cambio futuro vero su quella riga lo rimetterebbe in circolo, e l'agente
-- vedrebbe un metodo diverso da quello del magazzino.
CREATE OR REPLACE FUNCTION imposta_metodo_pagamento(p_id_ordine text, p_metodo text, p_operatore text DEFAULT NULL)
RETURNS TABLE (metodo text, scadenza date, giorni int, aggiornata_cashflow boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_can    text;
  v_data   date;
  v_scad   date;
  v_gg     int;
  v_tocc   int := 0;
  v_chiave text;
  v_rag    text;
  v_cod    text;
  v_chi    text;
BEGIN
  v_can := metodo_pagamento_canonico(p_metodo);
  IF v_can IS NULL THEN
    RAISE EXCEPTION 'Metodo "%" non riconosciuto: non produrrebbe una scadenza', p_metodo;
  END IF;

  -- LA FIRMA. Chi clicca il bottone rosso e' una persona che ha verificato:
  -- la correzione parte firmata e il cliente si conferma (la R).
  v_chi := coalesce(nullif(trim(p_operatore), ''), 'bottone rosso');

  -- PRIMA IL CLIENTE: e' dove il dato vive (Luca 25/08: "ogni modifica che
  -- faccio vale per quell'ordine E per quelli futuri").
  SELECT chiave_anagrafica(nullif(m.piva, ''), coalesce(m.ragione_sociale, o.cliente)),
         coalesce(m.ragione_sociale, o.cliente),
         o.id_cliente
    INTO v_chiave, v_rag, v_cod
  FROM ordini o
  LEFT JOIN clienti_master m ON m.codice = o.id_cliente
  WHERE o.id_ordine = p_id_ordine AND o.id_cliente IS NOT NULL;

  IF v_chiave IS NOT NULL THEN
    INSERT INTO clienti_override (chiave, codice_cliente, ragione_sociale, metodo_pagamento, operatore, aggiornato_il)
    VALUES (v_chiave, v_cod, v_rag, v_can, v_chi, now())
    ON CONFLICT (chiave) DO UPDATE
      SET metodo_pagamento = v_can,   -- l'ultima parola e' l'ultima scritta
          codice_cliente   = coalesce(clienti_override.codice_cliente, v_cod),
          operatore        = v_chi,
          aggiornato_il    = now();
  END IF;

  -- POI L'ORDINE.
  UPDATE ordini SET metodo_pagamento = v_can WHERE id_ordine = p_id_ordine;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ordine % inesistente', p_id_ordine; END IF;

  -- E LA RIGA GEMELLA SU ordini_agenti, se c'e': altrimenti il metodo vecchio
  -- resta li' in agguato e l'agente legge un'altra verita'.
  UPDATE ordini_agenti a
     SET metodo_pagamento = v_can
   WHERE a.id_ordine_magazzino = p_id_ordine
     AND a.metodo_pagamento IS DISTINCT FROM v_can;

  -- E LA SCADENZA, nello stesso colpo: e' il motivo per cui si corregge.
  -- La data resta quella con cui il Cashflow ha aperto la partita.
  SELECT f.data_doc INTO v_data FROM cf_fatture_attese f WHERE f.id = p_id_ordine;
  IF v_data IS NULL THEN
    SELECT coalesce(o.data_ordine, o.data_preparato, now())::date
      INTO v_data FROM ordini o WHERE o.id_ordine = p_id_ordine;
  END IF;

  v_scad := scadenza_da_metodo(v_data, v_can);
  v_gg := (v_scad - v_data)::int;

  UPDATE cf_fatture_attese f
     SET scadenza_prevista = v_scad,
         giorni = v_gg,
         effetto = split_part(v_can, ' ', 1),
         condizione_certa = true
   WHERE f.id = p_id_ordine;
  v_tocc := (SELECT count(*)::int FROM cf_fatture_attese WHERE id = p_id_ordine);

  RETURN QUERY SELECT v_can, v_scad, v_gg, v_tocc > 0;
END;
$$;

GRANT EXECUTE ON FUNCTION imposta_metodo_pagamento(text, text, text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
