-- UNA "X" NON E' UN DATO.
--
-- 03/09/2026, guardando l'elenco dei clienti da confermare prima di fatturare.
-- Nei campi che finiscono in fattura elettronica c'era scritto "x", "xx",
-- "nessuna", "nessuno": partita IVA "x" su 15 schede, codice destinatario "x" o
-- "xx" su 23, PEC su 16, email su 38.
--
-- Chi compilava intendeva "non ce l'ha". Ma un campo con dentro "x" per il
-- sistema e' un campo PIENO: nessun controllo si accende, e il documento esce
-- con "x" al posto della partita IVA. Lo SDI lo scarta, e la fattura non viene
-- pagata perche' non e' mai arrivata.
--
-- Meglio un campo onestamente vuoto, che blocca e si vede, di un campo pieno di
-- niente che passa. Qui i segnaposto diventano vuoto, in scrittura e nello
-- storico gia' scritto.
--
-- ATTENZIONE ALLE PROVINCE: "NA" e' Napoli e "NO" e' Novara. Sono state
-- controllate una per una (44 righe): tutte le "na" sono citta' napoletane,
-- tutte le "no" sono nel novarese. Non si cancellano, si scrivono maiuscole.
-- L'unica provincia davvero segnaposto era la "x" di LAFARGES.

create or replace function e_un_segnaposto(p_valore text)
returns boolean
language sql
immutable
as $$
  select lower(btrim(coalesce(p_valore, ''))) in
    ('x','xx','xxx','n/a','na.','nessuno','nessuna','nessun','none','null','//','--','?','vuoto','manca','non ce l''ha','non ha');
$$;

comment on function e_un_segnaposto(text) is
  'Vero quando il campo contiene un "non ce l''ha" travestito da dato. Le sigle di provincia NA e NO restano fuori: sono Napoli e Novara.';

-- In scrittura: un segnaposto entra come vuoto, senza rifiutare il salvataggio.
-- Chi sta compilando non viene bloccato, ma il dato non esiste e si vede.
create or replace function _niente_segnaposto_in_anagrafica()
returns trigger
language plpgsql
as $$
begin
  if e_un_segnaposto(new.partita_iva)    then new.partita_iva    := null; end if;
  if e_un_segnaposto(new.codice_univoco) then new.codice_univoco := null; end if;
  if e_un_segnaposto(new.pec)            then new.pec            := null; end if;
  if e_un_segnaposto(new.email)          then new.email          := null; end if;
  if e_un_segnaposto(new.telefono)       then new.telefono       := null; end if;
  if e_un_segnaposto(new.cap)            then new.cap            := null; end if;
  if e_un_segnaposto(new.citta)          then new.citta          := null; end if;
  if e_un_segnaposto(new.sede_legale)    then new.sede_legale    := null; end if;
  -- la provincia si normalizza, non si giudica: NA e NO sono sigle vere
  if lower(btrim(coalesce(new.provincia,''))) = 'x' then
    new.provincia := null;
  elsif new.provincia is not null then
    new.provincia := upper(btrim(new.provincia));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_a_niente_segnaposto on clienti_override;
create trigger trg_a_niente_segnaposto
before insert or update on clienti_override
for each row execute function _niente_segnaposto_in_anagrafica();
