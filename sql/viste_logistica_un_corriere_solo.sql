-- LE VISTE DELLA LOGISTICA LEGGONO IL CORRIERE DOVE STA.
--
-- Analisi 02/09/2026. Le tre viste esponevano `corriere_spedizione`, cioe' il
-- vettore CONGELATO alla partenza. Ma prima che il documento parta quel campo
-- e' vuoto: per vedere il corriere appena scelto, l'app logistica lo scriveva
-- anche li', in anticipo, congelando una scelta ancora modificabile. Due mani
-- sullo stesso campo, e l'ultima cancellava l'altra.
--
-- Regola: il corriere si scrive in `corriere` (la scelta) e il congelamento in
-- `corriere_spedizione` lo fa SOLO il magazzino quando la merce parte. Le
-- viste leggono il congelato se c'e', altrimenti la scelta: cosi' il dato sta
-- in un posto solo e si vede lo stesso da tutte le parti.
CREATE OR REPLACE VIEW v_spedizioni AS
SELECT o.id_ordine AS id,
       o.id_ordine AS ordine,
       o.cliente,
       COALESCE(NULLIF(TRIM(BOTH FROM o.cap), ''), NULL) AS cap,
       COALESCE(NULLIF(TRIM(o.corriere_spedizione), ''), NULLIF(TRIM(o.corriere), '')) AS corriere_id,
       round(COALESCE(sum(r.quantita_ordinata * p.peso_kg), 0), 1) AS peso,
       COALESCE(o.colli, 1) AS colli,
       o.polybox,
       CASE
         WHEN o.note ~* 'polibox|polybox|ghiaccio|surgelat|frozen' THEN 'frozen'
         WHEN COALESCE(NULLIF(TRIM(o.corriere_spedizione), ''), NULLIF(TRIM(o.corriere), '')) = 'brt' THEN 'secco'
         WHEN COALESCE(NULLIF(TRIM(o.corriere_spedizione), ''), NULLIF(TRIM(o.corriere), '')) IS NULL THEN NULL
         ELSE 'fresh'
       END AS temperatura,
       o.costo_trasporto AS costo_logistico,
       o.costo_stimato,
       CASE
         WHEN lower(COALESCE(o.stato, '')) = 'spedito' THEN 'spedita'
         WHEN o.archiviato THEN 'spedita'
         ELSE 'assegnata'
       END AS stato,
       (o.data_ordine)::date AS data,
       o.metodo_pagamento,
       o.contrassegno_importo,
       o.contrassegno_tipo,
       o.archiviato
FROM ordini o
JOIN righe_ordine r ON r.id_ordine = o.id_ordine
LEFT JOIN prodotti p ON (p.id_prodotto)::text = r.id_prodotto
WHERE lower(COALESCE(o.stato, '')) = 'spedito' OR o.archiviato IS TRUE
GROUP BY o.id_ordine, o.cliente, o.cap, o.corriere_spedizione, o.corriere, o.colli,
         o.polybox, o.note, o.costo_trasporto, o.costo_stimato, o.stato, o.data_ordine,
         o.metodo_pagamento, o.contrassegno_importo, o.contrassegno_tipo, o.archiviato;

CREATE OR REPLACE VIEW v_da_spedire AS
SELECT o.id_ordine AS id,
       o.cliente,
       COALESCE(NULLIF(TRIM(BOTH FROM o.cap), ''), NULL) AS cap,
       COALESCE(NULLIF(TRIM(o.corriere_spedizione), ''), NULLIF(TRIM(o.corriere), '')) AS corriere_id,
       NULLIF(TRIM(o.corriere), '') AS corriere_scelto,
       round(COALESCE(sum(r.quantita_ordinata * p.peso_kg), 0), 1) AS peso,
       COALESCE(o.colli, 1) AS colli,
       o.polybox,
       CASE
         WHEN o.note ~* 'polibox|polybox|ghiaccio|surgelat|frozen' THEN 'frozen'
         WHEN COALESCE(NULLIF(TRIM(o.corriere_spedizione), ''), NULLIF(TRIM(o.corriere), '')) = 'brt' THEN 'secco'
         ELSE 'fresh'
       END AS temperatura,
       o.stato,
       (o.data_ordine)::date AS data,
       o.costo_stimato,
       o.metodo_pagamento,
       o.contrassegno_importo
FROM ordini o
JOIN righe_ordine r ON r.id_ordine = o.id_ordine
LEFT JOIN prodotti p ON (p.id_prodotto)::text = r.id_prodotto
WHERE COALESCE(o.archiviato, false) = false AND lower(COALESCE(o.stato, '')) <> 'spedito'
GROUP BY o.id_ordine, o.cliente, o.cap, o.corriere_spedizione, o.corriere, o.colli,
         o.polybox, o.note, o.stato, o.data_ordine, o.costo_stimato,
         o.metodo_pagamento, o.contrassegno_importo;

-- Il contrassegno: stesso corriere, piu' il momento dell'incasso nel suo campo.
CREATE OR REPLACE VIEW v_contrassegni AS
SELECT id_ordine,
       cliente,
       (data_ordine)::date AS data,
       COALESCE(NULLIF(TRIM(corriere_spedizione), ''), NULLIF(TRIM(corriere), '')) AS corriere_spedizione,
       round(COALESCE(contrassegno_importo, 0), 2) AS importo,
       COALESCE(contrassegno_tipo, 'contanti') AS tipo,
       metodo_pagamento,
       contrassegno_riversato_il,
       GREATEST(0, (CURRENT_DATE - COALESCE((data_preparato)::date, (data_ordine)::date))) AS giorni_fuori,
       stato,
       archiviato,
       stato_pagamento,
       -- in fondo: CREATE OR REPLACE VIEW non sa infilare una colonna in mezzo
       contrassegno_incassato_il
FROM ordini o
WHERE metodo_pagamento ~* 'contrass' AND COALESCE(contrassegno_importo, 0) > 0;

GRANT SELECT ON v_spedizioni, v_da_spedire, v_contrassegni TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
