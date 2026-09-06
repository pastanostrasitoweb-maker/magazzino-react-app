-- I METODI DI PAGAMENTO CI SONO GIA': STANNO NELLE FATTURE CHE ABBIAMO EMESSO.
--
-- Luca, 02/09/2026: "risolviamo una volta per tutte questa storia dei metodi di
-- pagamento, dovresti averli di tutti e pure mi dici che non ci sono, li hai
-- tutti". Ha ragione, e la fonte buona era sotto il naso.
--
-- Fino a oggi, quando sull'ordine il metodo mancava, si guardava:
--   1. la scheda del cliente (giusto, ma e' compilata solo per chi l'ha aperta);
--   2. `cf_partite.effetto` e `clienti_metodo_pagamento`, che portano il codice
--      grezzo del gestionale (TRANSFER, RIBA, CHECK): dicono il MEZZO ma non
--      QUANDO si incassa, quindi non producono una scadenza e restano rossi.
--
-- Ma in `fatture_emesse` ci sono **3.942 fatture** con la modalita' di
-- pagamento SDI *e la data di scadenza scritta sul documento*, per **601
-- clienti**. Quella scadenza non e' un ritardo osservato: e' la condizione che
-- abbiamo dichiarato noi al cliente sul documento fiscale. Dalla differenza fra
-- data documento e data scadenza si ricava il termine, e dal fatto che cada o
-- no all'ultimo giorno del mese si capisce se decorre da fine mese.
--
-- Regola di prudenza: si guarda la combinazione piu' frequente per ogni
-- cliente, e si dichiara "certa" solo quando le sue fatture sono concordi.
-- Chi ha una storia contraddittoria resta da decidere a mano: meglio un rosso
-- onesto di una scadenza inventata.
-- Le colonne cambiano ordine e nome: CREATE OR REPLACE non lo consente.
DROP VIEW IF EXISTS v_metodo_da_fatture CASCADE;
CREATE VIEW v_metodo_da_fatture AS
WITH base AS (
  SELECT codice_cliente, modalita_pagamento AS mp, data_doc, data_scadenza,
         (data_scadenza - data_doc) AS g_df,
         (data_scadenza - (date_trunc('month', data_doc) + interval '1 month - 1 day')::date) AS g_fm
  FROM fatture_emesse
  WHERE coalesce(modalita_pagamento, '') <> ''
    AND data_scadenza IS NOT NULL AND data_doc IS NOT NULL
    AND coalesce(codice_cliente, '') <> ''
),
classificata AS (
  -- "fine mese" quando il conto fatto da fine mese e' tondo (0/30/60/90, con
  -- tre giorni di tolleranza per i week-end) e quello da data fattura non lo e'.
  SELECT codice_cliente, mp,
    CASE WHEN abs(g_fm - round(g_fm/30.0)*30) <= 3 AND round(g_fm/30.0)*30 BETWEEN 0 AND 90
              AND abs(g_df - round(g_df/30.0)*30) > 3
         THEN 'fine mese' ELSE 'data fattura' END AS decorrenza,
    CASE WHEN abs(g_fm - round(g_fm/30.0)*30) <= 3 AND round(g_fm/30.0)*30 BETWEEN 0 AND 90
              AND abs(g_df - round(g_df/30.0)*30) > 3
         THEN (round(g_fm/30.0)*30)::int ELSE (round(g_df/30.0)*30)::int END AS giorni
  FROM base
),
per_cliente AS (
  SELECT codice_cliente, mp, decorrenza, giorni, count(*) AS volte,
         row_number() OVER (PARTITION BY codice_cliente ORDER BY count(*) DESC, max(giorni) DESC) AS rango,
         sum(count(*)) OVER (PARTITION BY codice_cliente) AS fatture
  FROM classificata GROUP BY 1,2,3,4
),
proposta AS (
  SELECT codice_cliente, fatture, volte, decorrenza, giorni,
         CASE mp WHEN 'MP12' THEN 'Ri.Ba.' WHEN 'MP05' THEN 'Bonifico' WHEN 'MP02' THEN 'Assegno'
                 WHEN 'MP01' THEN 'Contrassegno contanti' WHEN 'MP08' THEN 'Carta di credito' END AS mezzo
  FROM per_cliente WHERE rango = 1
)
SELECT
       -- IL CODICE VA TRADOTTO. In `fatture_emesse` il cliente e' il numero
       -- nudo del gestionale ("1012"), negli ordini e nel registro e'
       -- "CLI-1012": senza questa riga l'aggancio non trovava nessuno e la
       -- vista restava un bell'elenco inutilizzabile.
       'CLI-' || ltrim(codice_cliente, '0') AS codice_cliente,
       codice_cliente AS codice_gestionale,
       metodo_pagamento_canonico(
         CASE
           WHEN mezzo IN ('Assegno','Carta di credito','Contrassegno contanti') THEN mezzo
           WHEN giorni = 0 AND decorrenza = 'fine mese' THEN mezzo || ' fine mese'
           WHEN giorni = 0 THEN mezzo || ' anticipato'
           ELSE mezzo || ' ' || giorni || ' gg ' || decorrenza
         END) AS metodo,
       fatture AS fatture_del_cliente,
       volte AS fatture_concordi,
       round(volte::numeric / nullif(fatture,0), 2) AS concordia,
       (volte::numeric / nullif(fatture,0) >= 0.7) AS certo
FROM proposta
WHERE mezzo IS NOT NULL;

GRANT SELECT ON v_metodo_da_fatture TO anon, authenticated;

-- IL METODO DEL CLIENTE, UNA DOMANDA SOLA.
-- L'ordine di fiducia: chi ha deciso a mano batte tutto, poi i documenti che
-- abbiamo emesso, poi la storia grezza del gestionale (che pero' da sola non
-- dice quando si incassa, quindi quasi sempre non produce nulla).
CREATE OR REPLACE FUNCTION metodo_del_cliente(p_codice text)
RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    -- 1. la scheda: e' l'ultima parola di una persona
    (SELECT metodo_pagamento_canonico(co.metodo_pagamento)
       FROM clienti_override co WHERE co.codice_cliente = p_codice
        AND metodo_pagamento_canonico(co.metodo_pagamento) IS NOT NULL LIMIT 1),
    -- 2. le fatture che abbiamo emesso a questo cliente: prima per codice,
    --    poi per partita IVA (i clienti nati fuori dal gestionale hanno un
    --    codice PN-xxxxx che nelle fatture non compare, ma la P.IVA si').
    (SELECT f.metodo FROM v_metodo_da_fatture f
      WHERE f.codice_cliente = p_codice AND f.certo AND f.metodo IS NOT NULL LIMIT 1),
    (SELECT f.metodo
       FROM clienti_master m
       JOIN fatture_emesse fe ON regexp_replace(coalesce(fe.controparte_piva,''), '\D', '', 'g')
                               = regexp_replace(coalesce(m.piva,''), '\D', '', 'g')
       JOIN v_metodo_da_fatture f ON f.codice_gestionale = fe.codice_cliente
      WHERE m.codice = p_codice
        AND regexp_replace(coalesce(m.piva,''), '\D', '', 'g') ~ '^[0-9]{8,}$'
        AND f.certo AND f.metodo IS NOT NULL
      LIMIT 1),
    -- 3. la storia grezza, solo se per miracolo produce una forma leggibile
    (SELECT metodo_pagamento_canonico(c.metodo) FROM clienti_metodo_pagamento c
      WHERE c.codice_cliente = ltrim(regexp_replace(p_codice, '^CLI-', ''), '0') LIMIT 1)
  );
$$;

GRANT EXECUTE ON FUNCTION metodo_del_cliente(text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
