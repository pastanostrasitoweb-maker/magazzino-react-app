-- Motivo per cui un ordine e' FERMO (es. commessa di prodotto ad hoc da
-- produrre, attesa cliente, merce mancante). Lo scrive il magazziniere e lo
-- vedono produzione, logistica e amministrazione sul badge dell'ordine.
-- Da eseguire nel SQL editor di Supabase. Idempotente.

alter table public.ordini add column if not exists motivo_fermo text;
