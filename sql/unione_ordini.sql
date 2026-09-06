-- UNIONE ORDINI dello stesso cliente in uscita nello stesso giorno
-- (richiesta Luca 2026-07-28): due ordini separati per lo stesso cliente
-- significano due documenti e due spedizioni. Si uniscono in uno.
--
-- Serve poter tornare indietro (regola Luca): teniamo traccia di COSA e' stato
-- unito e DA DOVE veniva ogni riga, cosi' "Separa" ripristina esattamente.
--
-- Da eseguire nel SQL editor di Supabase. Idempotente.

-- Sull'ordine ASSORBITO: in quale ordine e' finito (null = non unito).
alter table public.ordini
  add column if not exists unito_in text;

-- Sulle righe SPOSTATE: da quale ordine provenivano (null = riga nativa).
alter table public.righe_ordine
  add column if not exists id_ordine_originale text;

create index if not exists idx_ordini_unito_in
  on public.ordini (unito_in);
create index if not exists idx_righe_ordine_originale
  on public.righe_ordine (id_ordine_originale);

-- NOTA: le assegnazioni lotto NON vanno toccate. Puntano a id_riga, quindi
-- seguono automaticamente la riga spostata. L'unione non muove giacenze.
