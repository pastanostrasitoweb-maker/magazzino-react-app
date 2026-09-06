-- IL METODO SI CERCA DOVE QUALCUNO L'HA GIA' SCRITTO.
--
-- Luca, 02/09/2026: "quelli nati fuori, sicuro che nessuno ti ha mai dato il
-- dato?". No, non era sicuro: su 18 clienti "senza metodo" il dato c'era per
-- sei di loro, e la mia cascata non lo guardava.
--   - 100 PER CENTO DI MEA: "Bonifico anticipato" scritto sull'ordine, sullo
--     snapshot dell'agente e sull'ordine agenti. Tre volte, e lo dicevo mancante.
--   - TRUFFLE ENJOY: "Bonifico 30 gg fine mese" dall'app agenti.
--   - LA BOTTEGA GLUTEN FREE SAGL: "Bonifico 30 gg data fattura" dall'agente.
--   - FARMACIA BONGIORNO: "Ri.Ba. 30 gg fine mese" sull'ordine.
--   - Angela Tagliabue: "Carta di credito" sull'ordine.
-- Piu' quelli che si ricavano dai documenti Sibill, che hanno metodo e scadenza
-- come le fatture emesse (TRANSFER + scadenza a 30 gg = Bonifico 30 gg).
--
-- Le fonti diventano cinque, in ordine di autorita':
--   1. la scheda del cliente        (una persona ha deciso)
--   2. i suoi ORDINI                (qualcuno l'ha scritto lavorando)
--   3. le fatture emesse            (il documento fiscale)
--   4. i documenti Sibill           (idem, altra strada)
--   5. la storia grezza             (solo se per caso e' leggibile)
CREATE OR REPLACE VIEW v_metodo_da_sibill AS
WITH base AS (
  SELECT regexp_replace(coalesce(d.piva,''), '\D', '', 'g') AS piva, d.metodo,
         (d.scadenza - d.data_doc) AS g_df,
         (d.scadenza - (date_trunc('month', d.data_doc) + interval '1 month - 1 day')::date) AS g_fm
  FROM sibill_documenti d
  WHERE coalesce(d.metodo,'') <> '' AND d.scadenza IS NOT NULL AND d.data_doc IS NOT NULL
    AND regexp_replace(coalesce(d.piva,''), '\D', '', 'g') ~ '^[0-9]{8,}$'
    AND coalesce(d.direzione,'') <> 'passiva'
),
classificata AS (
  SELECT piva, metodo,
    CASE WHEN abs(g_fm - round(g_fm/30.0)*30) <= 3 AND round(g_fm/30.0)*30 BETWEEN 0 AND 90
              AND abs(g_df - round(g_df/30.0)*30) > 3 THEN 'fine mese' ELSE 'data fattura' END AS decorrenza,
    CASE WHEN abs(g_fm - round(g_fm/30.0)*30) <= 3 AND round(g_fm/30.0)*30 BETWEEN 0 AND 90
              AND abs(g_df - round(g_df/30.0)*30) > 3
         THEN (round(g_fm/30.0)*30)::int ELSE (round(g_df/30.0)*30)::int END AS giorni
  FROM base
),
per_piva AS (
  SELECT piva, metodo, decorrenza, giorni, count(*) AS volte,
         row_number() OVER (PARTITION BY piva ORDER BY count(*) DESC) AS rango,
         sum(count(*)) OVER (PARTITION BY piva) AS documenti
  FROM classificata GROUP BY 1,2,3,4
),
proposta AS (
  SELECT piva, documenti, volte, decorrenza, giorni,
         CASE upper(metodo) WHEN 'RIBA' THEN 'Ri.Ba.' WHEN 'TRANSFER' THEN 'Bonifico'
              WHEN 'CHECK' THEN 'Assegno' WHEN 'CASH' THEN 'Contrassegno contanti'
              WHEN 'CARD' THEN 'Carta di credito' END AS mezzo
  FROM per_piva WHERE rango = 1
)
SELECT piva,
       metodo_pagamento_canonico(
         CASE WHEN mezzo IN ('Assegno','Carta di credito','Contrassegno contanti') THEN mezzo
              WHEN giorni = 0 AND decorrenza = 'fine mese' THEN mezzo || ' fine mese'
              WHEN giorni = 0 THEN mezzo || ' anticipato'
              ELSE mezzo || ' ' || giorni || ' gg ' || decorrenza END) AS metodo,
       documenti, volte,
       (volte::numeric / nullif(documenti,0) >= 0.7) AS certo
FROM proposta WHERE mezzo IS NOT NULL;

GRANT SELECT ON v_metodo_da_sibill TO anon, authenticated;

CREATE OR REPLACE FUNCTION metodo_del_cliente(p_codice text)
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    -- 1. la scheda: l'ultima parola di una persona
    (SELECT metodo_pagamento_canonico(co.metodo_pagamento) FROM clienti_override co
      WHERE co.codice_cliente = p_codice AND metodo_pagamento_canonico(co.metodo_pagamento) IS NOT NULL LIMIT 1),
    -- 2. i suoi ordini nel magazzino: qualcuno l'ha scritto lavorando
    (SELECT metodo_pagamento_canonico(o.metodo_pagamento) FROM ordini o
      WHERE o.id_cliente = p_codice AND metodo_pagamento_canonico(o.metodo_pagamento) IS NOT NULL
      ORDER BY o.data_ordine DESC NULLS LAST LIMIT 1),
    -- 3. lo snapshot che l'agente manda con l'ordine, e l'ordine agenti stesso
    (SELECT metodo_pagamento_canonico(a.cliente->>'metodo_pagamento') FROM ordini_agenti a
      WHERE a.cliente_id = p_codice AND metodo_pagamento_canonico(a.cliente->>'metodo_pagamento') IS NOT NULL
      ORDER BY a.creato_il DESC LIMIT 1),
    (SELECT metodo_pagamento_canonico(a.metodo_pagamento) FROM ordini_agenti a
      WHERE a.cliente_id = p_codice AND metodo_pagamento_canonico(a.metodo_pagamento) IS NOT NULL
      ORDER BY a.creato_il DESC LIMIT 1),
    -- 4. le fatture emesse, per codice e per partita IVA
    (SELECT f.metodo FROM v_metodo_da_fatture f WHERE f.codice_cliente = p_codice AND f.certo AND f.metodo IS NOT NULL LIMIT 1),
    (SELECT f.metodo FROM clienti_master m
       JOIN fatture_emesse fe ON regexp_replace(coalesce(fe.controparte_piva,''), '\D', '', 'g') = regexp_replace(coalesce(m.piva,''), '\D', '', 'g')
       JOIN v_metodo_da_fatture f ON f.codice_gestionale = fe.codice_cliente
      WHERE m.codice = p_codice AND regexp_replace(coalesce(m.piva,''), '\D', '', 'g') ~ '^[0-9]{8,}$'
        AND f.certo AND f.metodo IS NOT NULL LIMIT 1),
    -- 5. i documenti Sibill (stessa logica: metodo + scadenza dichiarata)
    (SELECT s.metodo FROM clienti_master m
       JOIN v_metodo_da_sibill s ON s.piva = regexp_replace(coalesce(m.piva,''), '\D', '', 'g')
      WHERE m.codice = p_codice AND s.certo AND s.metodo IS NOT NULL LIMIT 1),
    -- 6. la storia grezza del gestionale, se per caso e' leggibile
    (SELECT metodo_pagamento_canonico(c.metodo) FROM clienti_metodo_pagamento c
      WHERE c.codice_cliente = ltrim(regexp_replace(p_codice, '^CLI-', ''), '0') LIMIT 1)
  );
$$;

NOTIFY pgrst, 'reload schema';
