-- L'IVA CORRETTA A MANO SI IMPARA.
--
-- Luca, 24/08/2026: "quando un ordine va in archiviato e viene modificato,
-- quello che e' in rosso registralo per le volte future, altrimenti stiamo
-- sempre a fare modifiche".
--
-- Correggere l'aliquota su una riga scriveva SOLO quella riga: il catalogo
-- restava com'era, e l'ordine dopo riproponeva l'aliquota sbagliata. La stessa
-- correzione si rifaceva all'infinito.
--
-- Adesso la correzione insegna al catalogo. Con tre paletti:
--   1. una riga con NATURA IVA non insegna niente: quella e' un'operazione
--      particolare (export, non imponibile), non l'aliquota dell'articolo
--   2. si impara solo un'aliquota valida (0 esclusa: se e' zero deve esserci
--      una natura, e allora vale il paletto 1)
--   3. resta scritto chi ha cambiato cosa, cosi' un errore si ritrova
create table if not exists iva_correzioni (
  id           bigserial primary key,
  id_prodotto  text not null,
  descrizione  text,
  da_iva       numeric,
  a_iva        numeric not null,
  id_ordine    text,
  id_riga      text,
  quando       timestamptz not null default now()
);
alter table iva_correzioni enable row level security;
drop policy if exists iva_correzioni_tutti on iva_correzioni;
create policy iva_correzioni_tutti on iva_correzioni for all to anon, authenticated
  using (true) with check (true);
grant select, insert on iva_correzioni to anon, authenticated;

create or replace function iva_impara_dalla_riga()
returns trigger language plpgsql as $$
declare
  v_catalogo numeric;
begin
  if new.iva_pct is null then return new; end if;
  if coalesce(trim(new.natura_iva), '') <> '' then return new; end if;
  if new.iva_pct <= 0 then return new; end if;
  if new.id_prodotto is null then return new; end if;

  select p.iva_pct into v_catalogo from prodotti p
   where p.id_prodotto::text = new.id_prodotto::text;
  if not found then return new; end if;
  if v_catalogo is not distinct from new.iva_pct then return new; end if;

  update prodotti set iva_pct = new.iva_pct
   where id_prodotto::text = new.id_prodotto::text;

  insert into iva_correzioni (id_prodotto, descrizione, da_iva, a_iva, id_ordine, id_riga)
  values (new.id_prodotto::text, new.descrizione_prodotto, v_catalogo, new.iva_pct,
          new.id_ordine, new.id_riga);
  return new;
end;
$$;

drop trigger if exists trg_iva_impara on righe_ordine;
create trigger trg_iva_impara
  after update of iva_pct on righe_ordine
  for each row when (new.iva_pct is distinct from old.iva_pct)
  execute function iva_impara_dalla_riga();
