-- UN MAGAZZINO SOLO, DUE FACCE COMMERCIALI.
--
-- Luca, 07/09/2026: "unisci i codici, sapendo che la verita' attuale di giacenza
-- e' quello che sta dentro NFARMA. Pero' i codici devono rimanere separati,
-- devono avere la stessa quantita' e devono essere scalati in ugual modo,
-- perche' fanno parte di due listini e di prezzi diversi".
--
-- Il tonnarello e' UN prodotto. Che si venda a una farmacia o a un ristorante
-- cambia il prezzo, non il cartone che esce dalla cella. Finora invece erano due
-- articoli con due magazzini: 74 cartoni fermi sui codici HORECA (48 tonnarelli
-- 250, 20 ricotta e spinaci, 6 tonnarelli 125) con ZERO vendite, mentre le
-- vendite passavano tutte dai gemelli NFARMA. Chi prepara vedeva meta' della
-- merce e poteva dire "non disponibile" col magazzino pieno.
--
-- Come si fa: il codice commerciale resta, la MERCE ha una casa sola.
--   - `stock_di` dice quale articolo tiene fisicamente la merce;
--   - i lotti stanno solo li', e chi vende il codice HORECA scarica quelli;
--   - la giacenza si legge dal padrone dello stock, quindi i due codici mostrano
--     sempre lo stesso numero e scalano insieme, senza doverli tenere allineati
--     a mano (due verita' che devono restare uguali si disallineano sempre).
--
-- I lotti oggi appesi ai codici HORECA NON si sommano: si archiviano. La verita'
-- e' NFARMA, l'ha detto Luca, e sommarli gonfierebbe il magazzino di 74 cartoni
-- che non esistono.

alter table prodotti add column if not exists stock_di int references prodotti(id_prodotto);

comment on column prodotti.stock_di is
  'Il prodotto che tiene fisicamente la merce. Valorizzato sui codici commerciali (HORECA) il cui articolo vero e'' un altro (NFARMA): stesso cartone, listino diverso. NULL = questo articolo ha il suo magazzino.';

-- L'articolo che tiene la merce: se stock_di e' pieno e' quello, altrimenti se stesso.
create or replace function prodotto_del_magazzino(p_id_prodotto text)
returns int
language sql
stable
as $$
  select coalesce(p.stock_di, p.id_prodotto)
    from prodotti p
   where p.id_prodotto::text = p_id_prodotto;
$$;

comment on function prodotto_del_magazzino(text) is
  'Dove sta davvero la merce di questo codice. Serve a leggere la giacenza e a trovare i lotti da assegnare.';

-- I gemelli, per far vedere a chi guarda che i due codici condividono la cella.
create or replace view v_articoli_stock_condiviso as
select c.id_prodotto      as id_commerciale,
       c.codice_prodotto  as codice_commerciale,
       c.descrizione_prodotto as nome_commerciale,
       m.id_prodotto      as id_magazzino,
       m.codice_prodotto  as codice_magazzino,
       m.descrizione_prodotto as nome_magazzino,
       (select coalesce(sum(l.quantita_caricata), 0) from lotti l
         where l.id_prodotto::text = m.id_prodotto::text
           and not coalesce(l.archiviato, false)) as giacenza_condivisa
  from prodotti c
  join prodotti m on m.id_prodotto = c.stock_di
 where c.stock_di is not null;

comment on view v_articoli_stock_condiviso is
  'I codici commerciali che si servono dal magazzino di un altro articolo, con la giacenza che vedono entrambi.';

grant select on v_articoli_stock_condiviso to anon, authenticated;

-- NIENTE LOTTI SUI CODICI CHE NON HANNO MAGAZZINO. Se un lotto nascesse qui, la
-- merce tornerebbe a essere in due posti e il conto si spaccherebbe di nuovo.
create or replace function _lotto_solo_dove_vive_la_merce()
returns trigger
language plpgsql
as $$
declare v_vero int; v_cod text;
begin
  select stock_di, codice_prodotto into v_vero, v_cod
    from prodotti where id_prodotto::text = new.id_prodotto::text;
  if v_vero is not null then
    raise exception 'Il codice % non tiene magazzino: la sua merce sta sull''articolo %. Carica il lotto li'', lo vedranno tutti e due.',
      v_cod, (select codice_prodotto from prodotti where id_prodotto = v_vero);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_lotto_solo_dove_vive_la_merce on lotti;
create trigger trg_lotto_solo_dove_vive_la_merce
before insert on lotti
for each row execute function _lotto_solo_dove_vive_la_merce();

-- ---------------------------------------------------------------------------
-- LE OTTO COPPIE, E LA MERCE CHE TORNA IN UN POSTO SOLO.
--
-- Abbinate per formato identico (stesso peso pezzo, stessi pezzi collo, stessa
-- categoria) e nome corrispondente. Restano fuori HORECA222 (Grana Padano 250g)
-- e HORECA235 (Scialatielli 125g): quei formati in farmacia non esistono, quindi
-- tengono il loro magazzino.
-- ---------------------------------------------------------------------------

update prodotti c
   set stock_di = m.id_prodotto
  from prodotti m
 where (c.codice_prodotto, m.codice_prodotto) in (
        ('HORECA200','NFARMA 007'),  -- Tonnarelli 250g
        ('HORECA201','NFARMA 011'),  -- Ravioli ricotta e spinaci 250g
        ('HORECA204','NFARMA 010'),  -- Cappelletti prosciutto crudo 250g
        ('HORECA210','NFARMA 067'),  -- Mezzi Paccheri 125g
        ('HORECA223','NFARMA 066'),  -- Tonnarelli 125g
        ('HORECA224','NFARMA 059'),  -- Ravioli Grana Padano 125g
        ('HORECA236','NFARMA 056'),  -- Cappelletti prosciutto crudo 125g
        ('HORECA237','NFARMA 057')   -- Ravioli ricotta e spinaci 125g
       );

-- I lotti appesi ai codici commerciali NON si sommano: la verita' di giacenza e'
-- quella di NFARMA (regola di Luca). Sommarli gonfierebbe il magazzino di 74
-- cartoni che non esistono. Si archiviano, con una riga che dice perche'.
create table if not exists lotti_archiviati_motivo (
  id_lotto text primary key,
  id_prodotto text,
  codice_lotto text,
  quantita numeric,
  motivo text,
  quando timestamptz not null default now()
);

insert into lotti_archiviati_motivo (id_lotto, id_prodotto, codice_lotto, quantita, motivo)
select l.id_lotto, l.id_prodotto::text, l.codice_lotto, l.quantita_caricata,
       'magazzino unificato 07/09/2026: la merce di questo codice vive sul gemello NFARMA'
  from lotti l
  join prodotti p on p.id_prodotto::text = l.id_prodotto::text
 where p.stock_di is not null
   and not coalesce(l.archiviato, false)
on conflict (id_lotto) do nothing;

update lotti l
   set archiviato = true, data_archiviazione = now()
  from prodotti p
 where p.id_prodotto::text = l.id_prodotto::text
   and p.stock_di is not null
   and not coalesce(l.archiviato, false);
