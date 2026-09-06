-- Tabella append-only del carico di produzione giornaliera.
-- Alimenta l'APP MARGINE (app-food-cost) col dato EFFETTIVO di produzione (kg/mese).
-- Da eseguire nel SQL editor di Supabase (progetto wwjgjiybyrrkafymiuew).

create table if not exists public.carichi_produzione (
  id           bigint generated always as identity primary key,
  data         date        not null default current_date,
  id_prodotto  text        not null default '',
  codice_prodotto text     not null default '',
  descrizione_prodotto text not null default '',
  lotto        text        not null default '',
  scadenza     date,
  ct           numeric     not null default 0,   -- unita' realizzate (CT/vaschette/...)
  kg           numeric     not null default 0,   -- ct * peso unitario del prodotto
  operatore    text        not null default '',
  creato_il    timestamptz not null default now()
);

-- Indice per l'aggregazione mensile richiesta dall'app margine.
create index if not exists carichi_produzione_data_idx
  on public.carichi_produzione (data);

-- Vista comoda: kg prodotti per mese (quello che legge l'app margine).
create or replace view public.produzione_kg_mese as
select
  to_char(date_trunc('month', data), 'YYYY-MM') as mese,
  round(sum(kg)::numeric, 2)                     as kg_prodotti,
  round(sum(ct)::numeric, 2)                     as ct_prodotti
from public.carichi_produzione
group by 1
order by 1;

-- RLS: coerente col resto del vault (anon puo' inserire/leggere i propri carichi).
-- NOTA: la sicurezza RLS del progetto e' in remediation (vedi audit). Per ora,
-- l'app usa la anon key come le altre tabelle operative.
alter table public.carichi_produzione enable row level security;

drop policy if exists carichi_produzione_all on public.carichi_produzione;
create policy carichi_produzione_all
  on public.carichi_produzione
  for all
  to anon
  using (true)
  with check (true);
