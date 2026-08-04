-- Valorizzazione automatica delle righe: prezzo, sconto e IVA.
--
-- REGOLA DI LUCA (03/08/2026): "prendi il listino dal cliente e associa prezzi
-- e sconti su tutti, non si puo' mettere tutto a mano, e anche l'IVA".
--
-- DA DOVE ARRIVA OGNI COSA, in ordine di fiducia:
--   1. Storico del cliente  - quello che QUEL cliente ha davvero pagato negli
--      ultimi 12 mesi. E' il piu' preciso e vince su tutto: se gli abbiamo
--      fatto 48,00 meno 40%, quello e' il suo prezzo, non quello di listino.
--   2. Listino assegnato al cliente (clienti_listino) - per gli articoli che
--      non ha mai comprato.
--   3. Listino 1 - l'ultima spiaggia, meglio di lasciare zero.
--   L'IVA arriva SEMPRE dal prodotto (prodotti.iva_pct), ricavata a sua volta
--   dalle aliquote davvero applicate sulle fatture 2025-2026. Non e' una
--   scelta a mano: NFARMA 010 e' al 10%, NFARMA 017 al 4%, e si vede dalle
--   22.869 righe di fattura emesse.
--
-- NON tocca le righe gia' valorizzate: se qualcuno ha scritto un prezzo a mano
-- sapeva qualcosa che il listino non sa. Per rifare tutto da capo si passa
-- p_forza := true.

CREATE OR REPLACE FUNCTION valorizza_ordine(p_id_ordine text, p_forza boolean DEFAULT false)
RETURNS TABLE (righe_toccate int, da_storico int, da_listino_cliente int, da_listino_1 int, senza_prezzo int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_piva      text;
  v_listino   text;
  v_tocc int := 0; v_sto int := 0; v_lcl int := 0; v_l1 int := 0; v_no int := 0;
  r record;
  v_prezzo numeric; v_sconto numeric; v_fonte text;
BEGIN
  -- P.IVA del cliente: serve per pescare nello storico, che e' indicizzato
  -- per partita IVA e non per codice cliente.
  SELECT COALESCE(NULLIF(ov.partita_iva, ''), NULLIF(m.piva, ''), NULLIF(g.piva, '')),
         NULLIF(cl.listino, '')
    INTO v_piva, v_listino
    FROM ordini o
    LEFT JOIN clienti_master m ON m.codice = o.id_cliente
    LEFT JOIN clienti_gestionale g
           ON g.codice_cliente = COALESCE(m.codice_gestionale, replace(COALESCE(o.id_cliente, ''), 'CLI-', ''))
    LEFT JOIN clienti_override ov ON ov.chiave = 'piva:' || COALESCE(m.piva, g.piva, '')
    LEFT JOIN clienti_listino cl ON cl.id_cliente = o.id_cliente
   WHERE o.id_ordine = p_id_ordine;

  FOR r IN
    SELECT ri.id_riga,
           -- Chiave articolo senza spazi ne' punteggiatura: "HORECA 122" e
           -- "HORECA122" sono lo stesso articolo scritto in due modi.
           upper(regexp_replace(COALESCE(p.codice_prodotto, ''), '[^A-Za-z0-9]', '', 'g')) AS cod,
           -- Le righe fuori magazzino non hanno codice: restano solo il nome
           -- scritto a mano e lo storico, dove pero' il nome c'e'.
           upper(regexp_replace(COALESCE(ri.descrizione_prodotto, ''), '[^A-Za-z0-9]', '', 'g')) AS descr,
           p.iva_pct
      FROM righe_ordine ri
      LEFT JOIN prodotti p ON p.id_prodotto::text = ri.id_prodotto
     WHERE ri.id_ordine = p_id_ordine
       AND (p_forza OR COALESCE(ri.prezzo_unitario, 0) = 0)
  LOOP
    v_prezzo := NULL; v_sconto := NULL; v_fonte := NULL;

    -- 1. Cosa ha pagato QUESTO cliente per QUESTO articolo.
    IF v_piva IS NOT NULL AND r.cod <> '' THEN
      SELECT s.ultimo_prezzo, s.ultimo_sconto INTO v_prezzo, v_sconto
        FROM storico_cliente_articolo s
       WHERE s.piva = v_piva
         AND upper(regexp_replace(COALESCE(s.codice, ''), '[^A-Za-z0-9]', '', 'g')) = r.cod
       ORDER BY s.ultimo_ordine DESC NULLS LAST
       LIMIT 1;
      IF v_prezzo IS NOT NULL AND v_prezzo > 0 THEN v_fonte := 'storico'; END IF;
    END IF;

    -- 1b. Righe FUORI MAGAZZINO: niente codice, quindi si aggancia sul nome.
    -- Solo dentro lo storico di QUESTO cliente: due clienti diversi possono
    -- chiamare "Sfoglia" due cose diverse, ma lo stesso cliente che riordina
    -- "Sfoglia" intende quella di sempre.
    IF v_fonte IS NULL AND v_piva IS NOT NULL AND r.descr <> '' THEN
      SELECT s.ultimo_prezzo, s.ultimo_sconto INTO v_prezzo, v_sconto
        FROM storico_cliente_articolo s
       WHERE s.piva = v_piva
         AND upper(regexp_replace(COALESCE(s.descrizione, ''), '[^A-Za-z0-9]', '', 'g')) = r.descr
         AND s.ultimo_prezzo > 0
       ORDER BY s.ultimo_ordine DESC NULLS LAST
       LIMIT 1;
      IF v_prezzo IS NOT NULL AND v_prezzo > 0 THEN v_fonte := 'storico-descrizione'; END IF;
    END IF;

    -- 2. Il listino assegnato al cliente.
    IF v_fonte IS NULL AND v_listino IS NOT NULL AND r.cod <> '' THEN
      SELECT l.prezzo, l.sconto_pct INTO v_prezzo, v_sconto
        FROM listini_gestionale l
       WHERE l.listino = v_listino
         AND upper(regexp_replace(COALESCE(l.codice_articolo, ''), '[^A-Za-z0-9]', '', 'g')) = r.cod
         AND l.prezzo > 0
       LIMIT 1;
      IF v_prezzo IS NOT NULL AND v_prezzo > 0 THEN v_fonte := 'listino_cliente'; END IF;
    END IF;

    -- 3. Listino 1.
    IF v_fonte IS NULL AND r.cod <> '' THEN
      SELECT l.prezzo, l.sconto_pct INTO v_prezzo, v_sconto
        FROM listini_gestionale l
       WHERE l.listino = '1'
         AND upper(regexp_replace(COALESCE(l.codice_articolo, ''), '[^A-Za-z0-9]', '', 'g')) = r.cod
         AND l.prezzo > 0
       LIMIT 1;
      IF v_prezzo IS NOT NULL AND v_prezzo > 0 THEN v_fonte := 'listino_1'; END IF;
    END IF;

    -- L'IVA si scrive comunque, anche quando il prezzo non si trova: e' un
    -- dato del prodotto, non del prezzo, e serve lo stesso in fattura.
    UPDATE righe_ordine
       SET iva_pct = COALESCE(r.iva_pct, iva_pct),
           prezzo_unitario = CASE WHEN v_fonte IS NULL THEN prezzo_unitario ELSE v_prezzo END,
           sconto_pct = CASE WHEN v_fonte IS NULL THEN sconto_pct ELSE COALESCE(v_sconto, 0) END,
           prezzo_origine = COALESCE(v_fonte, prezzo_origine)
     WHERE id_riga = r.id_riga;

    v_tocc := v_tocc + 1;
    IF v_fonte IN ('storico', 'storico-descrizione') THEN v_sto := v_sto + 1;
    ELSIF v_fonte = 'listino_cliente' THEN v_lcl := v_lcl + 1;
    ELSIF v_fonte = 'listino_1' THEN v_l1 := v_l1 + 1;
    ELSE v_no := v_no + 1; END IF;
  END LOOP;

  -- Il totale dell'ordine si rifa' sempre: e' quello che arriva al Cashflow e
  -- alla coda Sibill, e non deve mai restare indietro rispetto alle righe.
  UPDATE ordini o
     SET totale_imponibile = (
           SELECT ROUND(SUM(COALESCE(ri.quantita_ordinata, 0) * COALESCE(ri.prezzo_unitario, 0)
                            * (1 - COALESCE(ri.sconto_pct, 0) / 100.0)), 2)
             FROM righe_ordine ri WHERE ri.id_ordine = p_id_ordine)
   WHERE o.id_ordine = p_id_ordine;

  RETURN QUERY SELECT v_tocc, v_sto, v_lcl, v_l1, v_no;
END;
$$;

GRANT EXECUTE ON FUNCTION valorizza_ordine(text, boolean) TO anon, authenticated;
