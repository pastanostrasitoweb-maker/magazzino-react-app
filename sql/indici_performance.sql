-- Indici per tenere veloci le query anche con archivio grande (migliaia di
-- documenti). Da eseguire nel SQL editor di Supabase. Idempotenti.

-- Vista principale: ordini attivi (archiviato false/null).
create index if not exists idx_ordini_archiviato on public.ordini (archiviato);
-- Archivio a richiesta: ordini archiviati ordinati per data.
create index if not exists idx_ordini_arch_data on public.ordini (archiviato, data_preparato desc);
-- Numerazione DDT dell'anno.
create index if not exists idx_ordini_ddt on public.ordini (ddt_numero);
-- Caricamento righe/assegnazioni per ordine (fetch .in()).
create index if not exists idx_righe_ordine_id on public.righe_ordine (id_ordine);
create index if not exists idx_asseg_id_riga on public.assegnazioni_lotti (id_riga);
-- Snapshot anagrafiche per ordine.
create index if not exists idx_ordini_agenti_magazzino on public.ordini_agenti (id_ordine_magazzino);
