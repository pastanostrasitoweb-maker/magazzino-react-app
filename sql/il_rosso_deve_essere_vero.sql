-- IL ROSSO DEVE ESSERE VERO.
--
-- L'elenco dei clienti da confermare diceva "PAGAMENTO: c'e' niente" a 17
-- clienti. Per 11 di loro il pagamento c'era: sulla scheda sotto l'altro codice,
-- sui loro ordini, nelle fatture gia' emesse. La vista guardava un posto solo,
-- la scheda agganciata al codice esatto, e chiamava "niente" tutto il resto.
--
-- Un rosso che non e' vero e' peggio di nessun rosso: chi lavora impara a
-- ignorarlo, e il giorno che e' vero passa inosservato. Ora il rosso si accende
-- quando NESSUNA fonte sa dire quando si incassa, e accanto compare quello che
-- risulta, da confermare con un click invece che da riscrivere a mano.

drop view if exists v_clienti_da_confermare;

create view v_clienti_da_confermare as
 WITH ordinanti AS (
         SELECT regexp_replace(COALESCE(o.id_cliente, ''::text), '^0+'::text, ''::text) AS cod,
            max(COALESCE(o.data_preparato, o.data_ordine)) AS ultimo_ordine,
            max(o.cliente) AS nome_ordine
           FROM ordini o
          WHERE COALESCE(o.data_preparato, o.data_ordine) >= '2026-08-03 00:00:00+00'::timestamp with time zone
            AND COALESCE(btrim(o.id_cliente), ''::text) <> ''::text
          GROUP BY (regexp_replace(COALESCE(o.id_cliente, ''::text), '^0+'::text, ''::text))
        )
 SELECT COALESCE(a.chiave, chiave_anagrafica(g.piva, COALESCE(g.ragione_sociale, x.nome_ordine)), 'cod:'::text || x.cod) AS chiave,
    COALESCE(a.codice_cliente, x.cod) AS codice_cliente,
    COALESCE(a.ragione_sociale, g.ragione_sociale, x.nome_ordine) AS ragione_sociale,
    a.metodo_pagamento,
    a.agente_nome,
    COALESCE(a.mancano, ARRAY['SCHEDA CLIENTE mai compilata'::text]) AS mancano,
    c.chiave IS NOT NULL AS gia_confermato,
    c.codice_r,
    -- ROSSO SOLO SE NESSUNO SA DIRLO. Prima bastava che mancasse sulla scheda.
    metodo_del_cliente(COALESCE(a.codice_cliente, x.cod)) IS NULL AS pagamento_da_sistemare,
    x.ultimo_ordine,
    -- Quello che risulta dalle altre fonti quando la scheda tace: si conferma,
    -- non si riscrive.
    CASE WHEN metodo_pagamento_canonico(a.metodo_pagamento) IS NULL
         THEN metodo_del_cliente(COALESCE(a.codice_cliente, x.cod))
    END AS metodo_ricavato
   FROM ordinanti x
     LEFT JOIN v_clienti_allineamento a ON regexp_replace(COALESCE(a.codice_cliente, ''::text), '^0+'::text, ''::text) = x.cod
     LEFT JOIN clienti_gestionale g ON regexp_replace(COALESCE(g.codice_cliente, ''::text), '^0+'::text, ''::text) = x.cod
     LEFT JOIN clienti_confermati c ON c.chiave = a.chiave
  WHERE c.chiave IS NULL OR cardinality(COALESCE(a.mancano, ARRAY['x'::text])) > 0;

grant select on v_clienti_da_confermare to anon, authenticated;
