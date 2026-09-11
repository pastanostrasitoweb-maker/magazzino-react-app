-- IL PREZZO DELL'ULTIMO DOCUMENTO (10/09/2026)
--
-- Regola di Luca, dal caso F&G Carni: "nel documento di agosto aveva 12 euro al
-- chilo, quindi 24 al cartone. Nell'inserimento di un riordino non gli e' stato
-- proposto il prezzo del documento precedente. Devi SEMPRE proporre lo storico
-- del documento di trasporto precedente o della fattura." Vale nel magazzino e
-- nell'app agenti.
--
-- Cosa c'era gia' e perche' non bastava: `storico_cliente_articolo` conosce il
-- prezzo giusto (NFARMA 012 a 24,00 per quel cliente), ma e' una **fotografia
-- ferma**: fonte `fatture-sibill`, ultimo aggiornamento **02/08/2026**, ultimo
-- ordine registrato 15/07. I DDT di agosto e settembre non la toccano. Un
-- prezzo concordato oggi non lo vedrebbe il riordino di domani, ed e' il modo
-- in cui i prezzi si perdono.
--
-- Qui si guarda dove il prezzo e' successo davvero: le righe dei **documenti
-- emessi** (ordini con un numero di DDT, campionature escluse). Sono 1.566
-- righe su 195 clienti dal 24/07 a oggi, e si aggiornano da sole a ogni bolla.
-- La fotografia Sibill resta come memoria del prima.

-- ---------------------------------------------------------------------------
-- 1. L'ultimo prezzo che QUESTO cliente ha pagato per QUESTO articolo,
--    con il documento da cui viene: un prezzo proposto deve poter essere
--    spiegato ("DDT 1995 del 31/08"), se no nessuno si fida.
-- ---------------------------------------------------------------------------
create or replace view v_ultimo_prezzo_documento as
select distinct on (o.id_cliente, r.id_prodotto)
  o.id_cliente                                   as codice_cliente,
  r.id_prodotto,
  p.codice_prodotto,
  r.descrizione_prodotto,
  r.prezzo_unitario                              as prezzo,
  coalesce(r.sconto_pct, 0)                      as sconto1_pct,
  coalesce(r.sconto2_pct, 0)                     as sconto2_pct,
  coalesce(r.sconto3_pct, 0)                     as sconto3_pct,
  round(netto_riga(1, r.prezzo_unitario, r.sconto_pct, r.sconto2_pct, r.sconto3_pct), 4) as netto_unitario,
  r.iva_pct,
  o.ddt_numero,
  o.data_preparato::date                         as data_documento,
  o.id_ordine
from righe_ordine r
join ordini o   on o.id_ordine = r.id_ordine
left join prodotti p on p.id_prodotto::text = r.id_prodotto
where coalesce(btrim(o.ddt_numero), '') <> ''
  and coalesce(r.prezzo_unitario, 0) > 0
  and coalesce(o.campionatura, false) = false
  and coalesce(btrim(o.id_cliente), '') <> ''
  -- Gli omaggi e i bollinati non sono un prezzo: proporli come storico
  -- vorrebbe dire regalare per sempre quello che si e' regalato una volta.
  and coalesce(r.sconto2_pct, 0) < 100
  and coalesce(r.sconto_pct, 0) < 100
order by o.id_cliente, r.id_prodotto, o.data_preparato desc nulls last, o.id_ordine desc;

grant select on v_ultimo_prezzo_documento to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. La domanda che fanno le due app: "che prezzo ho fatto l'ultima volta a
--    questo cliente per questo articolo?". Prima il nostro documento, poi la
--    memoria delle fatture. Torna sempre anche DA DOVE viene.
-- ---------------------------------------------------------------------------
create or replace function ultimo_prezzo_cliente(
  p_codice_cliente text,
  p_id_prodotto    text
) returns table (
  prezzo numeric, sconto1_pct numeric, sconto2_pct numeric, sconto3_pct numeric,
  netto_unitario numeric, fonte text, documento text, quando date
)
language sql
stable
security definer
set search_path = public
as $$
  -- 1) l'ultimo documento nostro: e' il prezzo che il cliente ha visto in bolla
  select d.prezzo, d.sconto1_pct, d.sconto2_pct, d.sconto3_pct, d.netto_unitario,
         'documento'::text, ('DDT ' || d.ddt_numero)::text, d.data_documento
  from v_ultimo_prezzo_documento d
  where d.codice_cliente = btrim(p_codice_cliente)
    and d.id_prodotto = btrim(p_id_prodotto)
  union all
  -- 2) e se non gli abbiamo mai fatto quella riga, la memoria delle fatture
  select s.ultimo_prezzo, coalesce(s.ultimo_sconto, 0), 0, 0,
         round(s.ultimo_prezzo * (1 - coalesce(s.ultimo_sconto, 0) / 100.0), 4),
         'fattura'::text, ('fatture fino al ' || to_char(s.ultimo_ordine, 'DD/MM/YYYY'))::text, s.ultimo_ordine
  from storico_cliente_articolo s
  join prodotti p on upper(regexp_replace(coalesce(p.codice_prodotto, ''), '[^A-Za-z0-9]', '', 'g'))
                   = upper(regexp_replace(coalesce(s.codice, ''), '[^A-Za-z0-9]', '', 'g'))
  left join clienti_master m on m.codice = btrim(p_codice_cliente)
  left join clienti_override ov on ov.chiave = 'piva:' || coalesce(m.piva, '')
  where p.id_prodotto::text = btrim(p_id_prodotto)
    and s.piva = coalesce(nullif(ov.partita_iva, ''), m.piva)
    and coalesce(s.ultimo_prezzo, 0) > 0
    and not exists (
      select 1 from v_ultimo_prezzo_documento d2
      where d2.codice_cliente = btrim(p_codice_cliente) and d2.id_prodotto = btrim(p_id_prodotto))
  limit 1;
$$;

grant execute on function ultimo_prezzo_cliente(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Tutto il listino personale di un cliente in un colpo solo: le app lo
--    chiedono UNA volta quando si apre l'ordine, non una riga per volta.
--    Sul gateway ogni chiamata costa due secondi: il numero di chiamate e' il
--    costo vero (vedi la giornata del 10/09).
-- ---------------------------------------------------------------------------
create or replace function prezzi_gia_fatti(p_codice_cliente text)
returns table (
  id_prodotto text, codice_prodotto text, prezzo numeric,
  sconto1_pct numeric, sconto2_pct numeric, sconto3_pct numeric,
  netto_unitario numeric, fonte text, documento text, quando date
)
language sql
stable
security definer
set search_path = public
as $$
  select d.id_prodotto, d.codice_prodotto, d.prezzo,
         d.sconto1_pct, d.sconto2_pct, d.sconto3_pct, d.netto_unitario,
         'documento'::text, ('DDT ' || d.ddt_numero)::text, d.data_documento
  from v_ultimo_prezzo_documento d
  where d.codice_cliente = btrim(p_codice_cliente)
  union all
  select p.id_prodotto::text, p.codice_prodotto, s.ultimo_prezzo,
         coalesce(s.ultimo_sconto, 0), 0, 0,
         round(s.ultimo_prezzo * (1 - coalesce(s.ultimo_sconto, 0) / 100.0), 4),
         'fattura'::text, ('fatture fino al ' || to_char(s.ultimo_ordine, 'DD/MM/YYYY'))::text, s.ultimo_ordine
  from storico_cliente_articolo s
  join prodotti p on upper(regexp_replace(coalesce(p.codice_prodotto, ''), '[^A-Za-z0-9]', '', 'g'))
                   = upper(regexp_replace(coalesce(s.codice, ''), '[^A-Za-z0-9]', '', 'g'))
  left join clienti_master m on m.codice = btrim(p_codice_cliente)
  left join clienti_override ov on ov.chiave = 'piva:' || coalesce(m.piva, '')
  where s.piva = coalesce(nullif(ov.partita_iva, ''), m.piva)
    and coalesce(s.ultimo_prezzo, 0) > 0
    and not exists (
      select 1 from v_ultimo_prezzo_documento d2
      where d2.codice_cliente = btrim(p_codice_cliente)
        and d2.id_prodotto = p.id_prodotto::text);
$$;

grant execute on function prezzi_gia_fatti(text) to anon, authenticated;
