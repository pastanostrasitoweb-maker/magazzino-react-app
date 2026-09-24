-- Controllo quotidiano dei documenti di trasporto (24/09/2026).
--
-- Una riga per ogni cosa fuori posto, con chi la deve sistemare e come.
-- La legge ogni giorno lo script Resources/scripts/controllo-documenti.py
-- del vault, che la manda a commerciale@ (Elisa) e in copia ad amministrazione@.
-- Fonte unica: la bolla congelata (v_ddt_in_bolla), come vuole la regola 25.
-- Si guarda dal 01/08/2026: prima c'era il gestionale vecchio.
--
-- Un caso deciso si chiude scrivendo in controllo_documenti_chiusi: da quel
-- momento non torna piu' nell'elenco. Chiuderlo non cambia il documento, dice
-- solo che qualcuno l'ha guardato e ha deciso.

begin;

create table if not exists controllo_documenti_chiusi (
  controllo   text not null,
  ddt_numero  text not null,
  esito       text not null,
  nota        text,
  chi         text not null,
  quando      timestamptz not null default now(),
  primary key (controllo, ddt_numero)
);
revoke all on controllo_documenti_chiusi from anon;
grant select, insert, update on controllo_documenti_chiusi to authenticated, service_role;

create or replace view v_controllo_documenti as
with bolle as (
  select b.*, o.campionatura, o.stato, o.totale_imponibile as totale_ordine,
         (select round(sum(coalesce((r->>'quantita')::numeric,0) * coalesce((r->>'prezzo')::numeric,0)
                 * (1 - coalesce((r->>'sconto')::numeric,0)/100) * (1 - coalesce((r->>'sconto2')::numeric,0)/100)
                 * (1 - coalesce((r->>'sconto3')::numeric,0)/100)), 2)
            from jsonb_array_elements(b.righe) r) as somma_bolla,
         (select round(sum(coalesce(ro.quantita_ordinata,0) * coalesce(ro.prezzo_unitario,0)
                 * (1 - coalesce(ro.sconto_pct,0)/100) * (1 - coalesce(ro.sconto2_pct,0)/100)
                 * (1 - coalesce(ro.sconto3_pct,0)/100)), 2)
            from righe_ordine ro where ro.id_ordine = b.id_ordine) as somma_ordine,
         f.numero as fattura,
         (select round(sum((m[1])::numeric), 2)
            from regexp_matches(coalesce(f.xml,''), '<ImponibileImporto>([0-9.]+)</ImponibileImporto>', 'g') m) as imponibile_fattura
  from v_ddt_in_bolla b
  join ordini o on o.id_ordine = b.id_ordine
  left join ddt_fatturati f on f.id_ordine = b.id_ordine
  where b.emesso_il >= '2026-08-01'
),
righe as (
  -- 1. Uscito dal magazzino con il numero, ma la bolla non e' registrata.
  select 'bolla_mancante'::text controllo, 1 gravita, 'amministrazione'::text per_chi,
         btrim(o.ddt_numero) ddt_numero, o.id_ordine, o.cliente, o.archiviato_il::date data_ddt, o.totale_imponibile importo,
         'Il DDT e'' uscito ma la sua bolla non e'' registrata: non si puo'' fatturare.'::text dettaglio,
         'Nessuna azione in magazzino: lo sistema l''amministrazione.'::text cosa_fare
  from ordini o
  where coalesce(btrim(o.ddt_numero),'') <> '' and coalesce(o.archiviato,false) and o.archiviato_il >= '2026-08-01'
    and not exists (select 1 from ddt_congelati d where d.id_ordine = o.id_ordine)

  union all
  -- 2. Merce partita senza numero di documento.
  select 'spedito_senza_numero', 1, 'Elisa', '(nessuno)', o.id_ordine, o.cliente, coalesce(o.archiviato_il, o.data_ordine)::date, o.totale_imponibile,
         'L''ordine risulta spedito ma non ha un numero di DDT.',
         'Controlla se la merce e'' partita davvero: se si'', serve il DDT; se no, l''ordine va rimesso in preparazione.'
  from ordini o
  where (coalesce(o.archiviato,false) or o.stato in ('Spedito','Consegnato'))
    and coalesce(btrim(o.ddt_numero),'') = '' and coalesce(o.archiviato_il, o.data_ordine) >= '2026-08-01'

  union all
  -- 3. Numero saltato: non e' su nessun ordine e non e' registrato come annullato.
  select 'numero_saltato', 1, 'Elisa', n.k::text, null, null, null::date, null::numeric,
         'Il numero ' || n.k || ' non e'' su nessun ordine e non risulta annullato.',
         'Cerca la copia cartacea del DDT ' || n.k || ': se esiste, dimmi a che ordine appartiene; se non e'' mai stato stampato, va registrato come annullato.'
  from generate_series(1840, (select max(ddt_numero::int) from ordini where ddt_numero ~ '^[0-9]+$')) n(k)
  where not exists (select 1 from ordini where ddt_numero = n.k::text)
    and not exists (select 1 from ddt_annullati where ddt_numero = n.k::text)

  union all
  -- 4. L'ordine e' stato cambiato DOPO L'ARCHIVIAZIONE, e non e' ancora fatturato.
  --    Regola di Luca (24/09): l'importo giusto e' sempre ed esclusivamente
  --    quello del DDT in archivio. Le correzioni della sede prima di archiviare
  --    sono legittime e la bolla le prende (ricongela_ddt_in_archivio); quello
  --    che cambia dopo e' una differenza da spiegare.
  select 'ordine_cambiato_dopo_ddt', 2, 'Elisa', b.ddt_numero, b.id_ordine, b.cliente, b.emesso_il::date, b.totale_imponibile,
         'Nel DDT in archivio ' || coalesce(b.somma_bolla,0) || ', nell''ordine oggi ' || coalesce(b.somma_ordine,0)
           || ' (differenza ' || round(coalesce(b.somma_ordine,0) - coalesce(b.somma_bolla,0), 2) || ').',
         'L''ordine e'' stato toccato dopo l''archiviazione. Fa fede il DDT in archivio: se la modifica e'' voluta (reso, prezzo sbagliato) scrivilo ad amministrazione@, che decide se serve una nota di credito; altrimenti riporta l''ordine com''era.'
  from bolle b
  join ordini oa on oa.id_ordine = b.id_ordine and coalesce(oa.archiviato, false)
  where b.fattura is null and not coalesce(b.campionatura,false)
    and abs(coalesce(b.somma_ordine,0) - coalesce(b.somma_bolla,0)) >= 0.05

  union all
  -- 5. Gia' fatturato con un imponibile diverso dalla bolla che la fattura richiama.
  select 'fattura_diversa_dal_ddt', 2, 'amministrazione', b.ddt_numero, b.id_ordine, b.cliente, b.emesso_il::date, b.totale_imponibile,
         'Fattura ' || b.fattura || ' con imponibile ' || b.imponibile_fattura || ', la bolla dice ' || b.somma_bolla
           || ' (differenza ' || round(b.imponibile_fattura - b.somma_bolla, 2) || ').',
         'Decide Luca: fa fede il DDT in archivio, la differenza si chiude con una nota di credito o di debito.'
  from bolle b
  where b.fattura is not null and b.imponibile_fattura is not null
    and abs(b.imponibile_fattura - coalesce(b.somma_bolla,0)) >= 0.05

  union all
  -- 6. La bolla non torna con se stessa: il totale scritto non e' la somma delle sue righe.
  select 'bolla_incoerente', 1, 'amministrazione', b.ddt_numero, b.id_ordine, b.cliente, b.emesso_il::date, b.totale_imponibile,
         'La bolla porta un totale di ' || coalesce(b.totale_imponibile,0) || ' ma le sue righe fanno ' || coalesce(b.somma_bolla,0) || '.',
         'Serve la copia cartacea per sapere quale dei due e'' stato stampato.'
  from bolle b
  where abs(coalesce(b.totale_imponibile,0) - coalesce(b.somma_bolla,0)) >= 0.05

  union all
  -- 7. Cliente a Ri.Ba. senza ricevuta: non entrerebbe mai in una distinta.
  select 'riba_senza_ricevuta', 1, 'amministrazione', b.ddt_numero, b.id_ordine, b.cliente, b.emesso_il::date, b.totale_imponibile,
         'Pagamento ' || b.metodo_pagamento || ' ma nessuna ricevuta da presentare.',
         'Confermare il mandato Ri.Ba. del cliente: senza ricevuta non entra in nessuna distinta.'
  from bolle b
  where b.metodo_pagamento ~* '(ri\.?\s?ba|ricevut\w*\s+banc)' and not coalesce(b.campionatura,false)
    and coalesce(b.totale_imponibile,0) > 0
    and not exists (select 1 from cf_riba r where r.id = b.id_ordine)
    and not exists (select 1 from cf_partite p join cf_riba r on r.id = p.id
                    where p.tipo = 'cliente' and b.fattura is not null and p.documento = b.fattura::text)

  union all
  -- 8. Riga a prezzo zero che non e' un omaggio dichiarato.
  select 'riga_a_zero', 2, 'Elisa', b.ddt_numero, b.id_ordine, b.cliente, b.emesso_il::date, b.totale_imponibile,
         'Riga a prezzo zero: ' || left(r->>'descrizione', 60),
         'Se e'' un omaggio scrivilo nella descrizione (OMAGGIO); se e'' merce venduta manca il prezzo.'
  from bolle b, jsonb_array_elements(b.righe) r
  where not coalesce(b.campionatura,false)
    and coalesce((r->>'prezzo')::numeric,0) = 0
    and coalesce((r->>'sconto')::numeric,0) < 100
    and coalesce(r->>'descrizione','') !~* '(omaggi|bollinato|espositor|^lotto|inserire)'
    and b.fattura is null

  union all
  -- 9. DDT di un mese chiuso ancora da fatturare: la differita scade il 15 del mese dopo.
  select 'da_fatturare_mese_chiuso', case when extract(day from now()) > 15 then 1 else 2 end, 'amministrazione',
         b.ddt_numero, b.id_ordine, b.cliente, b.emesso_il::date, b.totale_imponibile,
         'DDT del ' || to_char(b.emesso_il, 'DD/MM') || ' non ancora fatturato.',
         'La fattura differita di questo DDT andava emessa entro il 15 del mese successivo.'
  from bolle b
  where b.fattura is null and not coalesce(b.campionatura,false) and coalesce(b.totale_imponibile,0) > 0
    and b.emesso_il < date_trunc('month', now())
)
select r.* from righe r
where not exists (select 1 from controllo_documenti_chiusi c
                  where c.controllo = r.controllo and c.ddt_numero = r.ddt_numero);

revoke all on v_controllo_documenti from anon;
grant select on v_controllo_documenti to authenticated, service_role;

commit;
