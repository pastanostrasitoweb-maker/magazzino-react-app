-- Magazzino di file (Supabase Storage): bucket unico 'documenti' con cartelle
-- per tipo (bolle/, ddt/, fatture/). I record nel DB tengono solo il link.
-- Da eseguire nel SQL editor di Supabase. Idempotente.
--
-- NOTA sicurezza: per ora il bucket e' PUBBLICO (URL diretti) e l'anon puo'
-- caricare/leggere, coerente col posture attuale del progetto. Da restringere
-- nell'audit sicurezza (bucket privato + URL firmati a scadenza).

-- 1) Crea il bucket pubblico 'documenti'.
insert into storage.buckets (id, name, public)
values ('documenti', 'documenti', true)
on conflict (id) do update set public = true;

-- 2) Permessi sull'oggetto: anon puo' fare tutto SOLO dentro il bucket documenti.
drop policy if exists documenti_all on storage.objects;
create policy documenti_all
  on storage.objects
  for all
  to anon
  using (bucket_id = 'documenti')
  with check (bucket_id = 'documenti');
