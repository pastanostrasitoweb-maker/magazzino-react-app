-- Layer di ARRICCHIMENTO cliente (nostro, sopra lo snapshot APP / GAMMA).
-- Tipologia cliente (HORECA/FARMA/GDO) + campi anagrafica completati a mano.
-- Indicizzato per "chiave" cliente: P.IVA quando c'e', altrimenti nome normalizzato.
-- Vale anche per gli ordini FUTURI dello stesso cliente: l'allineamento si accumula.
-- Da eseguire nel SQL editor di Supabase (progetto wwjgjiybyrrkafymiuew).

create table if not exists public.clienti_override (
  chiave               text primary key,     -- 'piva:01234567890' oppure 'nome:ristorante rossi'
  ragione_sociale      text,
  partita_iva          text,
  sede_legale          text,
  cap                  text,
  indirizzo_spedizione text,
  insegna              text,
  orari_consegna       text,
  giorno_chiusura      text,
  codice_univoco       text,
  pec                  text,
  email                text,
  telefono             text,
  metodo_pagamento     text,
  tipologia            text,                  -- HORECA | FARMA | GDO
  note                 text,
  operatore            text,
  aggiornato_il        timestamptz not null default now()
);

alter table public.clienti_override enable row level security;

drop policy if exists clienti_override_all on public.clienti_override;
create policy clienti_override_all
  on public.clienti_override
  for all
  to anon
  using (true)
  with check (true);
