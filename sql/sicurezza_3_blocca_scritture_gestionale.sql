-- SICUREZZA — PASSO 3: rendere di SOLA LETTURA i dati del gestionale.
--
-- PROBLEMA (verificato 2026-07-27): con la chiave pubblica dell'app si possono
-- MODIFICARE e CANCELLARE dati che nessuna app deve toccare, tra cui
-- l'anagrafica clienti (2.026), lo scaduto (314), lo storico vendite (8.405).
--
-- PERCHE' E' SICURO:
-- 1) Verificato che TUTTE le 7 app fanno solo LETTURE su queste tabelle.
-- 2) Le sincronizzazioni notturne sono Edge Function di Supabase che usano
--    SUPABASE_SERVICE_ROLE_KEY: il service_role IGNORA questi permessi, quindi
--    i cron (ts_sync_clienti_notte, ts_sync_scaduto_4h, ecc.) continuano a
--    scrivere regolarmente.
-- 3) La lettura resta invariata: le app non cambiano comportamento.
--
-- Il DO block salta le tabelle che non esistono, così non da' errori.

do $$
declare
  t text;
  tabelle text[] := array[
    'vendite_gestionale',
    'clienti_gestionale',
    'clienti_scaduto',
    'clienti_ultima_vendita',
    'log_fatture'
  ];
begin
  foreach t in array tabelle loop
    if exists (
      select 1 from information_schema.tables
       where table_schema = 'public' and table_name = t
    ) then
      execute format('revoke insert, update, delete on public.%I from anon', t);
      execute format('revoke insert, update, delete on public.%I from public', t);
      raise notice 'sola lettura applicata a %', t;
    else
      raise notice 'tabella % non presente, saltata', t;
    end if;
  end loop;
end $$;
