-- IL METODO DI UN DOCUMENTO SI CALCOLA UNA VOLTA (03/09/2026)
--
-- Il pannello "Genera fatture" non si apriva piu': `metodi_fattura` chiamava
-- `metodo_pagamento_effettivo()` due volte per riga su 489 documenti, e la
-- cascata a sei fonti costa ~10 ms a chiamata. Dieci secondi, contro un tetto
-- di PostgREST che qui misura circa TRE secondi: il pannello restava chiuso e
-- l'errore parlava di un timeout, non del suo motivo.
--
-- Ridurre le chiamate non bastava (179 documenti restavano scoperti anche
-- prendendo ordine e scheda con una join: siamo comunque al limite, e un
-- pannello che si apre "a volte" e' un pannello rotto).
--
-- Il punto vero: **il metodo di un documento archiviato e' storia**. Il DDT e'
-- uscito, la data e' congelata, la cascata dara' sempre lo stesso risultato.
-- Quindi si calcola una volta e si tiene. Non si scrive su `ordini`, perche'
-- quel campo e' dove l'operatore CORREGGE a mano e un valore dedotto lo
-- sporcherebbe: si tiene in una tabella a parte, che e' una copia di comodo e
-- si puo' buttare e rifare quando si vuole.

create table if not exists metodi_fattura_cache (
  ddt_numero   text primary key,
  id_ordine    text not null,
  effettivo    text,
  canonico     text,
  calcolato_il timestamptz not null default now()
);

comment on table metodi_fattura_cache is
  'Copia di comodo del metodo di pagamento per documento emesso. Si puo cancellare: aggiorna_metodi_fattura() la rifa.';

-- Ricalcola le righe che mancano (e, se glielo si chiede, anche quelle vecchie).
create or replace function aggiorna_metodi_fattura(p_rifai_tutto boolean default false)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fatte integer := 0;
begin
  if p_rifai_tutto then
    delete from metodi_fattura_cache;
  end if;

  with mancanti as (
    select o.ddt_numero, o.id_ordine
    from ordini o
    where o.archiviato
      and coalesce(btrim(o.ddt_numero), '') <> ''
      and not exists (select 1 from metodi_fattura_cache m where m.ddt_numero = btrim(o.ddt_numero))
  ), calcolate as (
    select
      btrim(m.ddt_numero) as ddt_numero,
      m.id_ordine,
      metodo_pagamento_effettivo(m.id_ordine) as effettivo
    from mancanti m
  )
  insert into metodi_fattura_cache (ddt_numero, id_ordine, effettivo, canonico)
  select c.ddt_numero, c.id_ordine, c.effettivo, metodo_pagamento_canonico(c.effettivo)
  from calcolate c
  on conflict (ddt_numero) do update
     set id_ordine = excluded.id_ordine,
         effettivo = excluded.effettivo,
         canonico  = excluded.canonico,
         calcolato_il = now();

  get diagnostics v_fatte = row_count;
  return v_fatte;
end;
$$;

-- Un documento appena emesso entra subito: non si aspetta il giro dell'ora.
create or replace function metodo_fattura_al_documento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(btrim(new.ddt_numero), '') = '' then return new; end if;
  if tg_op = 'UPDATE'
     and coalesce(old.ddt_numero,'') = coalesce(new.ddt_numero,'')
     and coalesce(old.metodo_pagamento,'') = coalesce(new.metodo_pagamento,'') then
    return new;   -- niente di nuovo da ricalcolare
  end if;

  begin
    insert into metodi_fattura_cache (ddt_numero, id_ordine, effettivo, canonico)
    values (btrim(new.ddt_numero), new.id_ordine,
            metodo_pagamento_effettivo(new.id_ordine),
            metodo_pagamento_canonico(metodo_pagamento_effettivo(new.id_ordine)))
    on conflict (ddt_numero) do update
       set effettivo = excluded.effettivo,
           canonico = excluded.canonico,
           calcolato_il = now();
  exception when others then
    -- La copia di comodo non deve mai fermare un documento: se salta, la
    -- rifa' il giro dell'ora. Ma si lascia scritto che e' saltata.
    begin
      insert into log_trigger_errori (trigger_nome, id_ordine, messaggio, dettaglio)
      values ('metodo_fattura_al_documento', new.id_ordine,
              'cache metodo non aggiornata: ' || SQLERRM, btrim(coalesce(new.ddt_numero,'')));
    exception when others then null;
    end;
  end;
  return new;
end;
$$;

drop trigger if exists trg_metodo_fattura_cache on ordini;
create trigger trg_metodo_fattura_cache
  after insert or update of ddt_numero, metodo_pagamento on ordini
  for each row execute function metodo_fattura_al_documento();

-- La vista tiene il nome di prima: l'app non cambia una riga, ma adesso legge
-- una tabella invece di calcolare 978 volte una cascata.
create or replace view metodi_fattura as
select m.ddt_numero, m.id_ordine, m.effettivo, m.canonico
from metodi_fattura_cache m;

grant select on metodi_fattura, metodi_fattura_cache to anon, authenticated;
grant execute on function aggiorna_metodi_fattura(boolean) to anon, authenticated;
