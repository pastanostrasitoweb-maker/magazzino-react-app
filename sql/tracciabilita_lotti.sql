-- Dove è finito un lotto: da quale articolo, a quali clienti.
--
-- Richiesta di Luca (04/08/2026): nell'archivio, digitando un articolo si
-- scelgono i lotti usciti di quella referenza e si vede dove sono andati.
-- Solo i lotti usciti DAL 03/08: prima i documenti li faceva TeamSystem e la
-- catena riga-lotto-cliente non passava di qui, quindi mostrare quel periodo
-- vorrebbe dire mostrare una tracciabilità che non è nostra e non è completa.
--
-- Serve davvero: se un lotto va richiamato, questa è la lista delle telefonate
-- da fare. Va guardata la QUANTITA' per cliente, non solo il nome: chi ne ha
-- presi 40 cartoni non è come chi ne ha preso uno.

CREATE OR REPLACE VIEW v_tracciabilita_lotti AS
SELECT
  COALESCE(NULLIF(TRIM(al.codice_lotto), ''), NULLIF(TRIM(al.lotto), ''),
           NULLIF(TRIM(l.codice_lotto), ''), NULLIF(TRIM(l.lotto), '')) AS lotto,
  l.scadenza,
  p.codice_prodotto,
  COALESCE(NULLIF(TRIM(p.descrizione_prodotto), ''), r.descrizione_prodotto) AS prodotto,
  o.id_ordine,
  o.cliente,
  o.id_cliente,
  NULLIF(TRIM(o.ddt_numero), '')                    AS ddt,
  COALESCE(o.data_preparato, o.data_ordine)::date   AS data_uscita,
  al.quantita_assegnata                             AS quantita,
  o.stato,
  o.archiviato
FROM assegnazioni_lotti al
JOIN righe_ordine r ON r.id_riga = al.id_riga
JOIN ordini o       ON o.id_ordine = r.id_ordine
LEFT JOIN lotti l   ON l.id_lotto = al.id_lotto
LEFT JOIN prodotti p ON p.id_prodotto::text = COALESCE(al.id_prodotto::text, r.id_prodotto)
WHERE COALESCE(o.data_preparato, o.data_ordine)::date >= DATE '2026-08-03'
  AND COALESCE(NULLIF(TRIM(al.codice_lotto), ''), NULLIF(TRIM(al.lotto), ''),
               NULLIF(TRIM(l.codice_lotto), ''), NULLIF(TRIM(l.lotto), '')) IS NOT NULL;
