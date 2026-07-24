-- Canale chat "Nuovi ordini": dal magazzino/produzione verso l'APP ACQUISTI.
-- Il magazzino segnala qui la merce da riordinare; l'agente/ufficio acquisti
-- legge questa tabella e puo' rispondere nello stesso filo (chat a doppio senso).
-- Stessa struttura di chat_messaggi. Da eseguire nel SQL editor di Supabase.

create table if not exists public.chat_nuovi_ordini (
  id                 bigint generated always as identity primary key,
  mittente           text not null default '',        -- 'magazzino' / 'acquisti' / username
  mittente_etichetta text not null default '',
  tipo               text not null default 'testo',    -- 'testo' | 'audio'
  testo              text not null default '',
  audio              text not null default '',         -- data URL (audio/webm) per i vocali
  creato_il          timestamptz not null default now()
);

create index if not exists idx_chat_nuovi_ordini_creato on public.chat_nuovi_ordini (creato_il);

alter table public.chat_nuovi_ordini enable row level security;

drop policy if exists chat_nuovi_ordini_all on public.chat_nuovi_ordini;
create policy chat_nuovi_ordini_all
  on public.chat_nuovi_ordini
  for all
  to anon
  using (true)
  with check (true);
