-- PONTI FRA LE APP, 23/09/2026 (parte A: allineamenti certi, tutti reversibili).
-- Revisione "nodo per nodo, ponte per ponte" chiesta da Luca. Fotografia delle
-- righe toccate nel daily del 23/09 e in Departments/it/ponti-fra-le-app-2026-09-23.md.
begin;

-- 1. Il ponte scrive l'alias CLI-NEW -> codice registro in clienti_alias, ma
--    18 clienti dell'app avevano l'alias e non il codice_master (il backfill del
--    17/09 ha scritto solo la tabella alias). Torna indietro: set codice_master=null
--    per gli id elencati nel daily.
update clienti_agenti ca
   set codice_master = al.codice
  from clienti_alias al
 where al.alias = ca.id and ca.codice_master is null;

-- 2. Dieci ordini nati in magazzino (ORD-MG) di agosto risultano "Spedito" nello
--    specchio dell'app ma senza spedito_il: archiviati prima che il trigger
--    scrivesse la data. Torna indietro: spedito_il=null sui 10 id nel daily.
update ordini_agenti a
   set spedito_il = o.archiviato_il
  from ordini o
 where o.id_ordine = a.id_ordine_magazzino
   and a.spedito_il is null
   and a.stato_magazzino = 'Spedito'
   and o.archiviato is true
   and nullif(o.ddt_numero,'') is not null;

-- 3. La vista v_ddt_da_fatturare mostra TUTTI i DDT emessi (415), anche i 279
--    gia' fatturati: il cashflow la usa come ponte e divide "in attesa" e
--    "fatturati" con una data di confine, non con la fattura vera. Si AGGIUNGE
--    in coda la colonna fattura_numero (left join ddt_fatturati): chi legge puo'
--    filtrare sul dato, nessuna colonna cambia posto. Torna indietro: create or
--    replace view con la definizione precedente (in sql/15_ddt_da_fatturare.sql
--    di magazzino-supabase/teamsystem).
create or replace view v_ddt_da_fatturare as
 SELECT o.id_ordine AS id,
    NULLIF(TRIM(BOTH FROM o.ddt_numero), ''::text) AS ddt_numero,
    COALESCE(o.data_preparato, o.data_ordine)::date AS data,
    o.cliente,
    oa.cliente_id AS cliente_codice,
    oa.canale,
    COALESCE(oa.totale, o.totale_imponibile) AS importo,
    COALESCE(o.metodo_pagamento, ov_piva.metodo_pagamento, ov_nome.metodo_pagamento) AS metodo_pagamento,
    o.stato_pagamento,
    o.contrassegno_importo,
    COALESCE(o.contrassegno_importo, 0::numeric) > 0::numeric OR (lower(COALESCE(o.stato_pagamento, ''::text)) = ANY (ARRAY['pagato'::text, 'incassato'::text, 'saldato'::text])) AS incassato,
    o.stato,
    o.archiviato,
    f.numero AS fattura_numero,
    f.data_fattura AS fattura_data
   FROM ordini o
     LEFT JOIN ordini_agenti oa ON oa.id_ordine_magazzino = o.id_ordine
     LEFT JOIN clienti_gestionale g ON g.codice_cliente = o.id_cliente
     LEFT JOIN clienti_override ov_piva ON ov_piva.chiave = ('piva:'::text || regexp_replace(COALESCE(g.piva, ''::text), '\D'::text, ''::text, 'g'::text)) AND COALESCE(g.piva, ''::text) <> ''::text
     LEFT JOIN clienti_override ov_nome ON ov_nome.chiave = ('nome:'::text || lower(regexp_replace(TRIM(BOTH FROM COALESCE(o.cliente, ''::text)), '\s+'::text, ' '::text, 'g'::text)))
     LEFT JOIN LATERAL (select numero, data_fattura from ddt_fatturati df where df.id_ordine = o.id_ordine order by df.creata_il desc limit 1) f ON true
  WHERE NULLIF(TRIM(BOTH FROM o.ddt_numero), ''::text) IS NOT NULL AND (o.archiviato IS TRUE OR lower(COALESCE(o.stato, ''::text)) = 'spedito'::text);

commit;
notify pgrst, 'reload schema';
