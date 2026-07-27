-- PONTE MAGAZZINO -> APP AGENTI: lo stato di lavorazione del magazzino torna
-- all'app agenti, così l'agente sa che il suo ordine è stato preso in gestione
-- e come sta procedendo (e può avvisare il cliente).
--
-- Campo DEDICATO: non tocchiamo 'stato', che l'app agenti usa per la sua logica
-- (Ordinato / Da controllare / Importato / Annullato).
--
-- Valori scritti dal magazzino in stato_magazzino:
--   'Preso in gestione'  -> ordine importato dallo staging in Ordini
--   'Preparato'          -> ordine completato e pronto
--   'Spedito'            -> ordine partito (col corriere)
--   'Fermo: <motivo>'    -> ordine bloccato, col motivo (es. commessa ad hoc)
--
-- Da eseguire nel SQL editor di Supabase. Idempotente.

alter table public.ordini_agenti add column if not exists stato_magazzino text;
alter table public.ordini_agenti add column if not exists aggiornato_magazzino_il timestamptz;

create index if not exists idx_ordini_agenti_stato_mag
  on public.ordini_agenti (stato_magazzino);
