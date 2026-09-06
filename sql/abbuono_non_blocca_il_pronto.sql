-- L'ABBUONO NON BLOCCA IL PRONTO, E L'ERRORE DICE QUALI RIGHE MANCANO.
--
-- Luca, 27/08/2026: "l'Intolleranti SNC e' fermo per un articolo che non si
-- riesce a capire, sembra che sia a 0. Quando succede dicci il motivo
-- dell'errore cosi' possiamo sbloccarlo".
--
-- L'articolo misterioso era l'ABBUONO ("Rimborso scaduti 4 tagliolini",
-- -14,72 euro). L'interfaccia dal 24/08 sa che l'abbuono non e' un articolo
-- (rigaAbbuono in App.jsx: niente lotti, niente colli, niente peso), ma
-- prepara_ordine nel database escludeva solo FUORI_MAGAZZINO%: la riga
-- abbuono risultava "scoperta" (ordinata 1, assegnata 0) e il PRONTO moriva
-- con "non completamente assegnato (1 righe scoperte)". Senza dire quale:
-- e siccome nell'interfaccia l'abbuono non compare fra le righe da
-- assegnare, il magazzino non poteva capirlo. ORD-1787731404789 fermo un
-- giorno intero per uno sconto.
--
-- Due cose, qui:
--   1. l'abbuono esce dal conteggio delle righe scoperte (stesso
--      riconoscimento del frontend: id ABBUONO-, codice ABBUONO, origine
--      abbuono);
--   2. quando il PRONTO viene rifiutato davvero, l'errore NOMINA le righe
--      e dice quanti pezzi mancano, invece di dare solo un conteggio.
CREATE OR REPLACE FUNCTION prepara_ordine(p_id_ordine text)
RETURNS ordini
LANGUAGE plpgsql
AS $$
DECLARE
  v_ordine   ordini%rowtype;
  v_scoperte text;
  v_result   ordini%rowtype;
  rec        record;
BEGIN
  SELECT * INTO v_ordine FROM ordini WHERE id_ordine = p_id_ordine FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ordine % inesistente', p_id_ordine; END IF;
  IF lower(btrim(v_ordine.stato)) = 'preparato' THEN
    RAISE EXCEPTION 'Ordine % gia preparato', p_id_ordine;
  END IF;

  -- Le righe di MERCE non coperte dai lotti. L'abbuono e' uno sconto in euro
  -- e il fuori magazzino non ha lotti: nessuno dei due puo' fermare il pronto.
  SELECT string_agg(
           t.descrizione_prodotto || ' (assegnati ' || t.assegnata || ' su ' || t.quantita_ordinata || ')',
           '; ' ORDER BY t.descrizione_prodotto)
    INTO v_scoperte
  FROM (
    SELECT r.descrizione_prodotto, r.quantita_ordinata,
           coalesce(sum(a.quantita_assegnata), 0) AS assegnata
    FROM righe_ordine r
    LEFT JOIN assegnazioni_lotti a ON a.id_riga = r.id_riga
    WHERE r.id_ordine = p_id_ordine
      AND r.id_prodotto NOT LIKE 'FUORI_MAGAZZINO%'
      AND r.id_prodotto NOT LIKE 'ABBUONO-%'
      AND upper(btrim(coalesce(r.id_prodotto, ''))) <> 'ABBUONO'
      AND lower(coalesce(r.prezzo_origine, '')) <> 'abbuono'
    GROUP BY r.id_riga, r.descrizione_prodotto, r.quantita_ordinata
  ) t
  WHERE t.assegnata < t.quantita_ordinata;

  IF v_scoperte IS NOT NULL THEN
    -- Il motivo per esteso: chi legge deve poter sbloccare da solo.
    RAISE EXCEPTION 'Righe senza lotto assegnato: %', v_scoperte;
  END IF;

  PERFORM set_config('app.movimento_tipo', 'scarico_ordine', true);
  PERFORM set_config('app.movimento_id_ordine', p_id_ordine, true);
  FOR rec IN
    SELECT a.id_lotto, sum(a.quantita_assegnata) AS q
    FROM assegnazioni_lotti a
    JOIN righe_ordine r ON r.id_riga = a.id_riga
    WHERE r.id_ordine = p_id_ordine
    GROUP BY a.id_lotto
  LOOP
    UPDATE lotti SET quantita_caricata = quantita_caricata - rec.q WHERE id_lotto = rec.id_lotto;
  END LOOP;
  PERFORM set_config('app.movimento_tipo', '', true);
  PERFORM set_config('app.movimento_id_ordine', '', true);

  UPDATE ordini SET stato = 'Preparato', data_preparato = now(), stato_lavorazione = ''
   WHERE id_ordine = p_id_ordine
   RETURNING * INTO v_result;
  RETURN v_result;
END;
$$;

NOTIFY pgrst, 'reload schema';
