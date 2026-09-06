-- QUELLO CHE E' IN PRODUZIONE, SU DISCO.
--
-- Queste definizioni vivevano solo nel database: la meta' piu' difficile da
-- tenere allineata era quella che nessuno poteva confrontare. Scritte qui il
-- 02/09/2026 leggendole dal server, cosi' si vedono nei diff come tutto il resto.

-- QUELLO CHE BLOCCA LA FATTURA ENTRA NELLA LISTA ROSSA DELL'ARCHIVIO.
--
-- La lista diceva gia' cosa manca per lavorare (codice, pagamento, agente,
-- indirizzo, citta', provincia), ma non diceva le tre cose che fermano la
-- fattura elettronica: partita IVA o codice fiscale, CAP, e dove mandarla.
-- Cosi' un cliente risultava a posto in Archivio e poi il documento restava
-- fermo in Cashflow senza che nessuno lo sapesse.
--
-- Le nuove voci guardano dove guarda il generatore delle fatture: prima la
-- scheda del magazzino, poi l'anagrafica del gestionale, e per il destinatario
-- anche Sibill. Una cosa che si trova da qualche parte non e' mancante.
create or replace view public.v_clienti_allineamento as
-- Le partite IVA di Sibill che hanno un destinatario vero, normalizzate una
-- volta: prima la stessa espressione girava per ogni riga di Sibill per ogni
-- cliente da controllare, centinaia di migliaia di volte a scansione.
with sib_con_destinatario as (
  select distinct regexp_replace(coalesce(piva, ''), '\D', '', 'g') as piva_n
  from sibill_anagrafiche
  where e_un_codice_destinatario(codice_destinatario)
    and regexp_replace(coalesce(piva, ''), '\D', '', 'g') <> ''
)
select
  co.chiave,
  co.codice_cliente,
  coalesce(co.ragione_sociale, m.ragione_sociale) as ragione_sociale,
  co.metodo_pagamento,
  co.agente_nome,
  co.allineato_il,
  array_remove(array[
    case when coalesce(btrim(co.codice_cliente), '') = '' then 'codice cliente' end,
    case when metodo_pagamento_canonico(co.metodo_pagamento) is null then
      case when coalesce(btrim(co.metodo_pagamento), '') = '' then 'metodo di pagamento'
           else 'termini di pagamento (c''e'' "' || co.metodo_pagamento || '", non dice quando si incassa)' end
    end,
    case when coalesce(btrim(co.agente_nome), '') = '' then 'agente' end,
    -- da qui in giu': quello che ferma la fattura elettronica
    -- "x" non e' una partita IVA: contano solo le cifre, come fa il generatore.
    case when coalesce(nullif(regexp_replace(coalesce(co.partita_iva, ''), '\D', '', 'g'), ''),
                       nullif(regexp_replace(coalesce(g.piva, ''), '\D', '', 'g'), ''),
                       nullif(btrim(g.codice_fiscale), '')) is null
         then 'FATTURA: partita IVA o codice fiscale' end,
    case when coalesce(nullif(btrim(co.sede_cap), ''), nullif(btrim(co.cap), ''),
                       nullif(btrim(g.cap), '')) is null
         then 'FATTURA: CAP' end,
    case when coalesce(nullif(btrim(co.sede_via), ''), nullif(btrim(co.sede_legale), ''),
                       nullif(btrim(co.indirizzo_spedizione), ''), nullif(btrim(g.indirizzo), '')) is null
         then 'FATTURA: indirizzo' end,
    case when coalesce(nullif(btrim(co.sede_localita), ''), nullif(btrim(co.citta), ''),
                       nullif(btrim(g.citta), '')) is null
         then 'FATTURA: comune' end,
    case when coalesce(nullif(btrim(co.sede_provincia), ''), nullif(btrim(co.provincia), ''),
                       nullif(btrim(g.provincia), '')) is null
         then 'FATTURA: provincia' end,
    -- Dove arriva la fattura: un codice di 7 caratteri, oppure una PEC.
    -- 0000000 non e' un recapito: vuol dire "cercatela nel cassetto fiscale".
    case when not e_un_codice_destinatario(co.codice_univoco)
         and not (e_una_pec(co.pec) or e_una_pec(g.email) or e_una_pec(co.email))
         and not exists (
           select 1 from sib_con_destinatario s
           where s.piva_n = regexp_replace(coalesce(nullif(btrim(co.partita_iva), ''), g.piva, ''), '\D', '', 'g')
         )
         then 'FATTURA: codice destinatario o PEC' end,
    -- DUE SCHEDE PER LO STESSO CLIENTE. Nasce quando arriva la partita IVA:
    -- la chiave passa da 'nome:' a 'piva:' e invece di aggiornare la scheda
    -- ne compare una seconda. Non e' roba da riempire, e' roba da unire.
    case when coalesce(dupc.n_codice, 1) > 1
         then 'SCHEDA DOPPIA: questo cliente ha due schede, vanno unite' end,
    -- STESSO NOME SU DUE SCHEDE. Non e' detto siano lo stesso cliente: due
    -- Bellavista con partita IVA diversa sono due aziende. Qui si segnala e
    -- basta, decide chi guarda.
    case when coalesce(dupn.n_nome, 1) > 1 and coalesce(dupc.n_codice, 1) = 1
         then 'ALTRA SCHEDA CON LO STESSO NOME: guarda se e'' lo stesso cliente' end
  ], null) as mancano
from clienti_override co
-- I due conteggi si fanno una volta sola: prima erano tre sottoquery
-- correlate, una delle quali scritta due volte identica.
-- I due conteggi si fanno in una passata sola, non una scansione della
-- tabella per ogni riga: prima erano tre sottoquery correlate, di cui una
-- scritta due volte identica.
left join (
  select codice_cliente, count(*) as n_codice from clienti_override
  where codice_cliente is not null group by 1
) dupc on dupc.codice_cliente = co.codice_cliente
left join (
  select lower(btrim(ragione_sociale)) as nome, count(*) as n_nome from clienti_override
  where coalesce(btrim(ragione_sociale), '') <> '' group by 1
) dupn on dupn.nome = lower(btrim(co.ragione_sociale))
left join clienti_master m on m.codice = co.codice_cliente
left join clienti_gestionale g on regexp_replace(coalesce(g.codice_cliente::text, ''), '^0+', '')
                                = regexp_replace(coalesce(co.codice_cliente, ''), '^0+', '');

-- --- e le due funzioni che la vista usa, definite via dashboard e mai su file
CREATE OR REPLACE FUNCTION public.e_un_codice_destinatario(v text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select btrim(upper(coalesce(v, ''))) ~ '^[A-Z0-9]{7}$'
     and btrim(upper(coalesce(v, ''))) <> '0000000'
$function$
;

CREATE OR REPLACE FUNCTION public.e_una_pec(v text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select coalesce(btrim(v), '') like '%@%'
     and lower(btrim(v)) not in ('x', 'xx', 'xxx', 'nessuno', 'xxx@xxx.com')
     and btrim(v) ~* '@.*(legalmail|pec|postecert|sicurezzapostale|cert\.|arubapec|registerpec|arubabusiness)'
$function$
;

-- --- la lista rossa dell'Archivio, che legge la vista qui sopra
create or replace view public.v_clienti_da_confermare as  WITH ordinanti AS (
         SELECT regexp_replace(COALESCE(o.id_cliente, ''::text), '^0+'::text, ''::text) AS cod,
            max(COALESCE(o.data_preparato, o.data_ordine)) AS ultimo_ordine,
            max(o.cliente) AS nome_ordine
           FROM ordini o
          WHERE COALESCE(o.data_preparato, o.data_ordine) >= '2026-08-03 00:00:00+00'::timestamp with time zone AND COALESCE(btrim(o.id_cliente), ''::text) <> ''::text
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
    metodo_pagamento_canonico(a.metodo_pagamento) IS NULL AS pagamento_da_sistemare,
    x.ultimo_ordine
   FROM ordinanti x
     LEFT JOIN v_clienti_allineamento a ON regexp_replace(COALESCE(a.codice_cliente, ''::text), '^0+'::text, ''::text) = x.cod
     LEFT JOIN clienti_gestionale g ON regexp_replace(COALESCE(g.codice_cliente, ''::text), '^0+'::text, ''::text) = x.cod
     LEFT JOIN clienti_confermati c ON c.chiave = a.chiave
  WHERE c.chiave IS NULL OR cardinality(COALESCE(a.mancano, ARRAY['x'::text])) > 0;
