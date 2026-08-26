-- IL PONTE NON DEVE CREARE ORDINI VUOTI, NE' DOPPIONI.
--
-- Difetto mio, trovato il 26/08/2026 mentre cercavo perche' DE.FI.MA. e
-- Service Tour non si archiviavano.
--
-- trg_ponte_agente scatta sull'INSERT dell'ordine, cioe' PRIMA che le righe
-- vengano scritte: quindi costruiva una riga in ordini_agenti con zero righe e
-- totale 0. Risultato: 53 righe vuote, e l'agente che nella sua app vede
-- ordini da 0 euro. Peggio: quando poi arrivava l'import vero dall'app agenti,
-- lo stesso ordine si ritrovava DUE righe (13 casi), e il guardiano del prezzo
-- si trovava due versioni della stessa verita'.
--
-- Adesso il ponte si crea solo quando c'e' qualcosa da mostrare, e sparisce da
-- solo se arriva l'ordine vero dall'app.
create or replace function ponte_agente_automatico()
returns trigger language plpgsql as $$
begin
  -- Niente righe, niente ponte: si rifara' quando l'ordine avra' un contenuto.
  if not exists (select 1 from righe_ordine r where r.id_ordine = new.id_ordine) then
    return null;
  end if;
  perform ponte_ordine_verso_agente(new.id_ordine);
  return null;
end;
$$;

-- E il ponte si costruisce anche quando le righe arrivano dopo l'ordine, che e'
-- il caso normale: prima si crea la testata, poi le righe.
create or replace function ponte_agente_da_riga()
returns trigger language plpgsql as $$
declare v_ag text;
begin
  select agente_id into v_ag from ordini where id_ordine = new.id_ordine;
  if coalesce(btrim(v_ag), '') = '' then return null; end if;
  perform ponte_ordine_verso_agente(new.id_ordine);
  return null;
end;
$$;
drop trigger if exists trg_ponte_da_riga on righe_ordine;
create trigger trg_ponte_da_riga
  after insert on righe_ordine
  for each row execute function ponte_agente_da_riga();

-- QUANDO ARRIVA L'ORDINE VERO DALL'APP, IL PONTE FATTO IN CASA SI TOGLIE.
-- Quello dell'app ha i prezzi concordati con l'agente; il mio e' una copia di
-- quello che sa il magazzino. Tenerli tutti e due vuol dire avere due risposte
-- alla stessa domanda.
create or replace function ponte_via_se_arriva_quello_vero()
returns trigger language plpgsql as $$
begin
  if new.id_ordine_magazzino is null then return new; end if;
  if new.id_ordine like 'ORD-MG-%' then return new; end if;
  delete from ordini_agenti
   where id_ordine_magazzino = new.id_ordine_magazzino
     and id_ordine like 'ORD-MG-%';
  return new;
end;
$$;
drop trigger if exists trg_ponte_via on ordini_agenti;
create trigger trg_ponte_via
  after insert or update of id_ordine_magazzino on ordini_agenti
  for each row execute function ponte_via_se_arriva_quello_vero();
