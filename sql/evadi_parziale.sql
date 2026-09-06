-- Evadi solo il parziale: l'ordine si spacca in due.
--
-- RICHIESTA DI LUCA (04/08/2026): "metto i lotti su quello che voglio
-- effettivamente evadere, poi se voglio evadere solo il parziale devo poterlo
-- fare. Le quantità che rimangono non evase creano un altro ordine che resta
-- fra gli ordini da preparare."
--
-- COSA SUCCEDE
--   - quello che è stato ASSEGNATO ai lotti resta sull'ordine di partenza,
--     che va avanti e diventa il documento;
--   - quello che NON è stato assegnato si stacca su un ordine NUOVO, che nasce
--     "Da preparare" e aspetta la merce.
--
-- Sta tutto qui e non nell'app perché è una spaccatura: fermarsi a metà (righe
-- ridotte sull'originale ma residuo non ancora creato) vorrebbe dire merce
-- sparita dai conti senza che nessuno abbia sbagliato niente. O si fa tutta, o
-- non si fa.
--
-- NON tocca le assegnazioni ai lotti: restano attaccate alle righe originali,
-- che restano sull'ordine di partenza. La giacenza non si muove.

CREATE OR REPLACE FUNCTION evadi_parziale(p_id_ordine text)
RETURNS TABLE (id_residuo text, righe_spostate int, righe_ridotte int, pezzi_residui numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o           ordini%ROWTYPE;
  v_residuo   text;
  v_spostate  int := 0;
  v_ridotte   int := 0;
  v_pezzi     numeric := 0;
  r           record;
BEGIN
  SELECT * INTO o FROM ordini WHERE id_ordine = p_id_ordine;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ordine % inesistente', p_id_ordine;
  END IF;
  IF COALESCE(o.archiviato, false) THEN
    RAISE EXCEPTION 'Ordine % archiviato: non si spacca piu''', p_id_ordine;
  END IF;

  -- Niente da staccare: si dice, invece di creare un ordine vuoto.
  IF NOT EXISTS (
    SELECT 1 FROM righe_ordine ri
     WHERE ri.id_ordine = p_id_ordine
       AND COALESCE(ri.quantita_ordinata,0) - COALESCE(ri.quantita_assegnata,0) > 0
  ) THEN
    RAISE EXCEPTION 'Sull''ordine % è già assegnato tutto: non c''è nessun residuo da staccare', p_id_ordine;
  END IF;

  -- Serve almeno una riga assegnata, altrimenti "evadi il parziale" vorrebbe
  -- dire spostare tutto su un ordine nuovo e lasciare qui il vuoto.
  IF NOT EXISTS (
    SELECT 1 FROM righe_ordine ri
     WHERE ri.id_ordine = p_id_ordine AND COALESCE(ri.quantita_assegnata,0) > 0
  ) THEN
    RAISE EXCEPTION 'Sull''ordine % non è assegnato niente: assegna prima i lotti di quello che vuoi far partire', p_id_ordine;
  END IF;

  v_residuo := p_id_ordine || '-R' || to_char(now(), 'HH24MISS');

  -- L'ordine residuo è una copia della testata: stesso cliente, stessa
  -- destinazione, stesso agente, stesse condizioni. Quello che NON si copia è
  -- il numero DDT: il documento è dell'ordine che parte, non del residuo.
  INSERT INTO ordini (
    id_ordine, data_ordine, cliente, id_cliente, stato, stato_lavorazione,
    cap, id_destinazione, corriere, corriere_spedizione, metodo_pagamento,
    listino, sconto_cliente_pct, regime_iva, agente_id, agente_nome,
    note, archiviato
  ) VALUES (
    v_residuo, CURRENT_DATE, o.cliente, o.id_cliente, 'Da preparare', 'Nuovo',
    o.cap, o.id_destinazione, o.corriere, o.corriere_spedizione, o.metodo_pagamento,
    o.listino, o.sconto_cliente_pct, o.regime_iva, o.agente_id, o.agente_nome,
    -- La nota dice da dove viene: fra un mese nessuno si ricorda perché
    -- esistono due ordini per lo stesso cliente lo stesso giorno.
    TRIM(COALESCE(o.note,'') || CASE WHEN COALESCE(o.note,'') <> '' THEN E'\n' ELSE '' END ||
         'Residuo non evaso dell''ordine ' || p_id_ordine ||
         CASE WHEN COALESCE(NULLIF(o.ddt_numero,''),'') <> ''
              THEN ' (DDT ' || o.ddt_numero || ')' ELSE '' END),
    false
  );

  FOR r IN
    SELECT ri.*, COALESCE(ri.quantita_ordinata,0) - COALESCE(ri.quantita_assegnata,0) AS residuo
      FROM righe_ordine ri
     WHERE ri.id_ordine = p_id_ordine
       AND COALESCE(ri.quantita_ordinata,0) - COALESCE(ri.quantita_assegnata,0) > 0
     ORDER BY ri.ordine_riga
  LOOP
    v_pezzi := v_pezzi + r.residuo;

    IF COALESCE(r.quantita_assegnata,0) = 0 THEN
      -- Niente assegnato: la riga si SPOSTA intera, non si duplica. Così le
      -- note e la storia della riga restano una sola cosa.
      UPDATE righe_ordine SET id_ordine = v_residuo WHERE id_riga = r.id_riga;
      v_spostate := v_spostate + 1;
    ELSE
      -- Assegnato in parte: sull'originale resta quello che parte davvero, il
      -- resto nasce come riga nuova sul residuo, con prezzi e sconti identici.
      UPDATE righe_ordine
         SET quantita_ordinata = r.quantita_assegnata
       WHERE id_riga = r.id_riga;

      INSERT INTO righe_ordine (
        id_riga, id_ordine, id_prodotto, descrizione_prodotto,
        quantita_ordinata, quantita_assegnata, ordine_riga, id_ordine_originale,
        prezzo_unitario, sconto_pct, sconto2_pct, prezzo_origine, iva_pct, natura_iva
      ) VALUES (
        r.id_riga || '-R', v_residuo, r.id_prodotto, r.descrizione_prodotto,
        r.residuo, 0, r.ordine_riga, p_id_ordine,
        r.prezzo_unitario, r.sconto_pct, r.sconto2_pct, r.prezzo_origine, r.iva_pct, r.natura_iva
      );
      v_ridotte := v_ridotte + 1;
    END IF;
  END LOOP;

  -- I totali si rifanno su tutti e due: quello che parte vale meno di prima.
  PERFORM valorizza_ordine(p_id_ordine);
  PERFORM valorizza_ordine(v_residuo);

  RETURN QUERY SELECT v_residuo, v_spostate, v_ridotte, v_pezzi;
END;
$$;

GRANT EXECUTE ON FUNCTION evadi_parziale(text) TO anon, authenticated;
