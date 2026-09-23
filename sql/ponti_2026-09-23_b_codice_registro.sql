-- PONTI FRA LE APP, 23/09/2026 (parte B: il codice del registro arriva all'ordine e all'app).
--
-- IL BUCO. L'app agenti crea il cliente nuovo con un codice provvisorio CLI-NEW-...
-- e l'ordine parte con quello. Il magazzino, quando compila la scheda e assegna
-- il codice del registro (PN-...), lo scrive sull'ordine SOLO se l'ordine non ha
-- gia' un codice (`.is("id_cliente", null)` in supabase-adapter.js): un CLI-NEW
-- non e' null, quindi il codice vero non arriva mai all'ordine, e il trigger
-- alias_cliente_dal_ponte (che legge ordini.id_cliente) non trova niente da
-- scrivere indietro nell'app. Risultato al 23/09: 24 ordini in magazzino con un
-- CLI-NEW, 22 clienti con ordini e senza codice, invisibili a CRM, cashflow ed
-- esposizione, che incrociano per codice.
begin;

-- 1. Tre clienti dell'app esistono GIA' nel registro con la stessa P.IVA (una
--    riga sola ciascuno): l'alias e' sicuro. Torna indietro: delete from
--    clienti_alias where alias in (...); update clienti_agenti set codice_master=null;
--    update ordini set id_cliente = <CLI-NEW> where id_ordine in (...).
insert into clienti_alias (alias, codice, origine) values
  ('CLI-NEW-1788523964957', 'CLI-879',   'piva-uguale-23-09'),
  ('CLI-NEW-1787859951898', 'PN-000092', 'piva-uguale-23-09'),
  ('CLI-NEW-1789368980479', 'PN-000070', 'piva-uguale-23-09')
on conflict (alias) do nothing;
update clienti_agenti ca set codice_master = al.codice from clienti_alias al where al.alias = ca.id and ca.codice_master is null and al.origine = 'piva-uguale-23-09';
update ordini o set id_cliente = al.codice from clienti_alias al where al.alias = o.id_cliente and al.origine = 'piva-uguale-23-09';

-- 2. LA PORTA: l'ordine prende il codice del registro. Sostituisce solo un
--    codice provvisorio (null, CLI-NEW-..., CLI-<32 esadecimali> generati al volo)
--    o uno che nel registro non esiste, mai un codice vero; e scrive solo un
--    codice che nel registro esiste. Il client propone, il database decide.
create or replace function ordine_prende_codice_registro(p_id_ordine text, p_codice text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if p_codice is null or not exists (select 1 from clienti_master m where m.codice = p_codice) then
    return false;
  end if;
  update ordini
     set id_cliente = p_codice
   where id_ordine = p_id_ordine
     and (id_cliente is null
          or (id_cliente <> p_codice
              and not exists (select 1 from clienti_master m where m.codice = ordini.id_cliente)));
  return found;
end $$;
grant execute on function ordine_prende_codice_registro(text, text) to anon, authenticated, service_role;

-- 3. IL RITORNO: quando un ordine passa da un codice provvisorio a uno del
--    registro (da qualunque strada), l'alias si scrive da solo e l'app agenti
--    riceve il codice_master. Copre anche il caso che alias_cliente_dal_ponte
--    non vede (quel trigger sta su ordini_agenti e legge il codice al momento
--    dell'import, quando e' ancora CLI-NEW).
create or replace function ordine_alias_quando_prende_il_codice() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.id_cliente is null or new.id_cliente is null or old.id_cliente = new.id_cliente then return new; end if;
  if exists (select 1 from clienti_master m where m.codice = old.id_cliente) then return new; end if;  -- era gia' un codice vero: non e' un alias
  if not exists (select 1 from clienti_master m where m.codice = new.id_cliente) then return new; end if;
  insert into clienti_alias (alias, codice, origine) values (old.id_cliente, new.id_cliente, 'magazzino-conferma')
  on conflict (alias) do nothing;
  update clienti_agenti set codice_master = new.id_cliente where id = old.id_cliente and codice_master is null;
  return new;
end $$;
drop trigger if exists trg_alias_quando_prende_il_codice on ordini;
create trigger trg_alias_quando_prende_il_codice after update of id_cliente on ordini
  for each row execute function ordine_alias_quando_prende_il_codice();

-- 4. LA CODA MORTA. ddt_sibill_invii si riempie a ogni DDT (trigger
--    trg_accoda_ddt_sibill) per un invio a Sibill spento dal 03/08: 427 righe
--    "da_inviare" che nessuno invia, 79 nell'ultima settimana. Le fatture nascono
--    dal ciclo interno (fatture-genera). Si segna superato quello che c'e' e si
--    spegne l'alimentazione. Torna indietro: alter table ordini enable trigger
--    trg_accoda_ddt_sibill; e il CSV in Departments/it/allegati/ponti-2026-09-23/.
update ddt_sibill_invii
   set stato = 'superato',
       errore = coalesce(errore || ' | ', '') || 'superato il 23/09/2026: invio DDT a Sibill spento dal 03/08, le fatture nascono da fatture-genera'
 where stato in ('da_inviare', 'errore');
alter table ordini disable trigger trg_accoda_ddt_sibill;

commit;
notify pgrst, 'reload schema';
