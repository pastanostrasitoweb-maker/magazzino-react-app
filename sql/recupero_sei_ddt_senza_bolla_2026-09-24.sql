-- Recupero dei sei DDT nati in archiviazione senza bolla congelata (24/09/2026).
-- Causa e correzione in il_numero_nato_in_archiviazione.sql.
--
-- ATTENZIONE: la bolla ricostruita qui e' la foto dell'ordine DI OGGI, non
-- quella del giorno in cui e' uscita la merce. Per costruzione v_ddt_in_bolla
-- la dara' uguale all'ordine. La prova che coincida con la carta la fa Elisa
-- confrontandola con la copia del DDT stampato.

begin;

-- 1. La bolla, con la data vera di uscita (l'archiviazione), non quella di oggi.
insert into ddt_congelati (ddt_numero, id_ordine, cliente, emesso_il, metodo_pagamento,
                           colli, totale_imponibile, righe)
select btrim(o.ddt_numero), o.id_ordine, o.cliente, o.archiviato_il, o.metodo_pagamento,
       o.colli, o.totale_imponibile,
       coalesce((select jsonb_agg(jsonb_build_object(
                  'id_riga', r.id_riga, 'prodotto', r.id_prodotto,
                  'descrizione', r.descrizione_prodotto, 'quantita', r.quantita_ordinata,
                  'prezzo', r.prezzo_unitario, 'sconto', r.sconto_pct, 'sconto2', r.sconto2_pct,
                  'iva', r.iva_pct, 'natura_iva', r.natura_iva) order by r.ordine_riga)
                 from righe_ordine r where r.id_ordine = o.id_ordine), '[]'::jsonb)
from ordini o
where o.id_ordine in ('ORD-1789390585629','ORD-1788951365733','ORD-1789481062367',
                      'ORD-1788964895568','ORD-1788963336589','ORD-1790080064724')
  and not exists (select 1 from ddt_congelati dc where dc.id_ordine = o.id_ordine)
on conflict (ddt_numero) do nothing;

-- 2. Le due ricevute mai nate: 2168 L'officina degli intolleranti (da fatturare)
--    e 2169 Celiachiamo (fattura 1941, 457,75, scadenza 30/10).
insert into cf_riba (id, stato, tipo, aggiornata, note, ultimo_autore)
select o.id_ordine, 'da_presentare', '', now(),
       'Nata il 24/09: il numero del DDT era nato in archiviazione e la ricevuta non era partita.',
       'claude'
from ordini o
where o.id_ordine in ('ORD-1788951365733','ORD-1789481062367')
  and o.metodo_pagamento ~* '(ri\.?\s?ba|ricevut\w*\s+banc)'
  and not coalesce(o.campionatura, false)
on conflict (id) do nothing;

-- 3. Il documento nello scadenzario col numero del DDT (solo chi ha un codice cashflow).
insert into cf_documenti (codice, documento, data_doc, importo, origine)
select cf_codice_da_magazzino(o.id_cliente), btrim(o.ddt_numero), o.data_ordine::date, null, 'magazzino'
from ordini o
where o.id_ordine in ('ORD-1789390585629','ORD-1788951365733','ORD-1789481062367',
                      'ORD-1788964895568','ORD-1788963336589','ORD-1790080064724')
  and cf_codice_da_magazzino(o.id_cliente) is not null
on conflict (codice, documento) do nothing;

commit;
