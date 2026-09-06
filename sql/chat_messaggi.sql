-- Chat interna tra gli utenti dell'app (produzione, amministrazione, ordini).
-- Messaggi di testo e vocali (audio come data URL). Da eseguire nel SQL editor
-- di Supabase (progetto wwjgjiybyrrkafymiuew).

create table if not exists public.chat_messaggi (
  id                 bigint generated always as identity primary key,
  mittente           text not null default '',        -- username: produzione/amministrazione/ordini
  mittente_etichetta text not null default '',        -- nome mostrato
  tipo               text not null default 'testo',    -- 'testo' | 'audio'
  testo              text not null default '',
  audio              text not null default '',         -- data URL (audio/webm) per i vocali
  creato_il          timestamptz not null default now()
);

create index if not exists idx_chat_messaggi_creato on public.chat_messaggi (creato_il);

alter table public.chat_messaggi enable row level security;

drop policy if exists chat_messaggi_all on public.chat_messaggi;
create policy chat_messaggi_all
  on public.chat_messaggi
  for all
  to anon
  using (true)
  with check (true);
