-- IL GUARDIANO DEL PREZZO CONCORDATO.
--
-- Luca, 24/08/2026, con davanti la conferma d'ordine e il DDT 1908 de Il
-- Celiaco: "non deve piu' accadere, e mettici un guardiano a controllo".
--
-- Cos'era successo: l'agente aveva venduto a cascata 40+5 (43% netto),
-- l'anagrafica del cliente aveva uno sconto 35% scritto a mano, e la
-- rivalorizzazione ha fatto vincere l'anagrafica. Il cliente si e' visto
-- addebitare 43,00 EUR piu' del pattuito, su un documento gia' emesso.
--
-- Il guardiano confronta RIGA PER RIGA (per codice articolo) il netto scritto
-- nel magazzino con quello concordato dall'agente. Non confronta i totali,
-- perche' un totale piu' basso puo' essere semplicemente merce non evasa (il
-- DDT 1857 ha 5 righe contro le 17 dell'ordine) e non e' un errore di prezzo.
create or replace view v_prezzi_traditi as
with app as (
  select oa.id_ordine_magazzino as id_ordine,
         upper(regexp_replace(coalesce(r->>'codice', ''), '[^A-Za-z0-9]', '', 'g')) as cod,
         sum( (r->>'prezzo_finale')::numeric
              * coalesce((r->>'colli')::numeric, 0)
              * coalesce(nullif((r->>'pezzi_collo')::numeric, 0), 1) ) as netto_agente
    from ordini_agenti oa
    cross join lateral jsonb_array_elements(oa.righe) r
   where oa.id_ordine_magazzino is not null
     and coalesce(r->>'prezzo_finale', '') <> ''
     and coalesce((r->>'colli')::numeric, 0) > 0
   group by 1, 2
  having upper(regexp_replace(coalesce(r->>'codice', ''), '[^A-Za-z0-9]', '', 'g')) <> ''
),
mag as (
  select ri.id_ordine,
         upper(regexp_replace(coalesce(p.codice_prodotto, ''), '[^A-Za-z0-9]', '', 'g')) as cod,
         sum( ri.quantita_ordinata * coalesce(ri.prezzo_unitario, 0)
              * (1 - coalesce(ri.sconto_pct, 0) / 100)
              * (1 - coalesce(ri.sconto2_pct, 0) / 100)
              * (1 - coalesce(ri.sconto3_pct, 0) / 100) ) as netto_magazzino
    from righe_ordine ri
    join prodotti p on p.id_prodotto::text = ri.id_prodotto::text
   group by 1, 2
)
select o.id_ordine, o.cliente, o.ddt_numero, o.archiviato, o.stato,
       coalesce(o.data_preparato, o.data_ordine)::date as data,
       a.cod as codice,
       round(a.netto_agente, 2)    as concordato,
       round(m.netto_magazzino, 2) as fatturato,
       round(m.netto_magazzino - a.netto_agente, 2) as scarto
  from app a
  join mag m on m.id_ordine = a.id_ordine and m.cod = a.cod
  join ordini o on o.id_ordine = a.id_ordine
 where abs(m.netto_magazzino - a.netto_agente) > 0.01;

-- Il riassunto per ordine, quello che si guarda in app.
create or replace view v_ordini_prezzo_tradito as
  select id_ordine, max(cliente) cliente, max(ddt_numero) ddt_numero,
         bool_or(archiviato) archiviato, max(data) data,
         count(*) righe_sbagliate,
         round(sum(scarto), 2) as scarto_totale
    from v_prezzi_traditi
   group by id_ordine
   order by abs(sum(scarto)) desc;
grant select on v_prezzi_traditi, v_ordini_prezzo_tradito to anon, authenticated;

-- IL CANCELLO: un ordine con prezzi diversi da quelli concordati NON si
-- archivia. L'archiviazione e' il punto di non ritorno (il DDT prende il
-- numero e il documento parte): dopo, correggere significa nota di credito.
-- Soglia 50 centesimi, per non inciampare negli arrotondamenti da due
-- centesimi che nascono dal prezzo al pezzo moltiplicato per i colli.
create or replace function prezzo_concordato_prima_di_archiviare()
returns trigger language plpgsql as $$
declare
  v_scarto numeric;
  v_righe  int;
begin
  if not (new.archiviato is true and coalesce(old.archiviato, false) is false) then
    return new;
  end if;
  select count(*), coalesce(sum(scarto), 0) into v_righe, v_scarto
    from v_prezzi_traditi where id_ordine = new.id_ordine and abs(scarto) > 0.50;
  if v_righe > 0 then
    raise exception
      'PREZZI DIVERSI DA QUELLI CONCORDATI DALL''AGENTE: % righe, % EUR di scarto. '
      'L''ordine resta fra i Preparati finche'' qualcuno non decide. '
      'Guarda la vista v_prezzi_traditi per il dettaglio riga per riga.',
      v_righe, round(v_scarto, 2);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prezzo_concordato on ordini;
create trigger trg_prezzo_concordato
  before update of archiviato on ordini
  for each row execute function prezzo_concordato_prima_di_archiviare();
