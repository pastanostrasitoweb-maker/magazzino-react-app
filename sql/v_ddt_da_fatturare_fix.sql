-- La vista che il Cashflow legge per sapere quali DDT sono da fatturare.
--
-- Due buchi trovati con la simulazione completa del processo (01/08/2026):
--
-- 1. IMPORTO. Veniva preso solo da `ordini_agenti.totale`, cioe' solo dagli
--    ordini arrivati dall'app agenti. Un ordine caricato in casa dal magazzino
--    arrivava al Cashflow con importo NULL anche se in magazzino era
--    valorizzato. Da agosto gli ordini in casa sono la norma, quindi era il
--    caso piu' frequente. Ora: se manca il totale dell'app agenti si usa
--    `ordini.totale_imponibile`, che e' ricalcolato dalle righe a ogni modifica.
--
-- 2. METODO DI PAGAMENTO. La vista lo cercava su `ordini.metodo_pagamento`,
--    colonna che nessuno scrive mai (0 ordini su 274). Il metodo vive in
--    anagrafica, in `clienti_override`, con chiave "piva:<partita iva>" oppure
--    "nome:<ragione sociale minuscola>" (vedi clientKeyFor in App.jsx).
--    Senza metodo il Cashflow non sa calcolare la scadenza.

CREATE OR REPLACE VIEW v_ddt_da_fatturare AS
SELECT
  o.id_ordine AS id,
  NULLIF(TRIM(BOTH FROM o.ddt_numero), ''::text) AS ddt_numero,
  COALESCE(o.data_preparato, o.data_ordine)::date AS data,
  o.cliente,
  oa.cliente_id AS cliente_codice,
  oa.canale,
  -- L'ordine dell'app agenti porta il suo totale; quello caricato in casa
  -- porta il totale ricalcolato dalle righe di magazzino.
  COALESCE(oa.totale, o.totale_imponibile) AS importo,
  COALESCE(o.metodo_pagamento, ov_piva.metodo_pagamento, ov_nome.metodo_pagamento)
    AS metodo_pagamento,
  o.stato_pagamento,
  o.contrassegno_importo,
  COALESCE(o.contrassegno_importo, 0::numeric) > 0::numeric
    OR (lower(COALESCE(o.stato_pagamento, ''::text)) = ANY (ARRAY['pagato'::text, 'incassato'::text, 'saldato'::text]))
    AS incassato,
  o.stato,
  o.archiviato
FROM ordini o
  LEFT JOIN ordini_agenti oa ON oa.id_ordine_magazzino = o.id_ordine
  -- Anagrafica per P.IVA (ha la precedenza), poi per ragione sociale.
  LEFT JOIN clienti_gestionale g ON g.codice_cliente = o.id_cliente
  LEFT JOIN clienti_override ov_piva
    ON ov_piva.chiave = 'piva:' || regexp_replace(COALESCE(g.piva, ''), '\D', '', 'g')
   AND COALESCE(g.piva, '') <> ''
  LEFT JOIN clienti_override ov_nome
    ON ov_nome.chiave = 'nome:' || lower(regexp_replace(TRIM(BOTH FROM COALESCE(o.cliente, '')), '\s+', ' ', 'g'))
WHERE NULLIF(TRIM(BOTH FROM o.ddt_numero), ''::text) IS NOT NULL
  AND (o.archiviato IS TRUE OR lower(COALESCE(o.stato, ''::text)) = 'spedito'::text);
