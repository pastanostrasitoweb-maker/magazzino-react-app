-- UN OK RESTA OK (03/09/2026)
--
-- Domanda di Luca dopo la diagnosi dei segnaposto: "adesso non succede piu,
-- se e OK rimane OK?". La risposta onesta era: solo per i dati veri. La
-- guardia in ingresso `_niente_segnaposto_in_anagrafica` copriva P.IVA,
-- codice univoco, PEC, email, telefono, CAP, citta, sede legale e provincia,
-- ma NON `giorno_chiusura` e `orari_consegna`. Li restavano 99 campi con
-- dentro una "x": ognuno di quelli e un OK che cade il giorno in cui qualcuno
-- tocca la scheda.
--
-- E c'e un secondo errore, piu insidioso: **su questi due campi "nessuno" NON
-- e un segnaposto, e una risposta**. "Giorno di chiusura: nessuno" vuol dire
-- che il negozio non chiude mai. Trattarlo come una x avrebbe cancellato
-- l'informazione a 27 clienti e li avrebbe fatti risultare incompleti per
-- sempre, senza che nessuno potesse rimediare scrivendo la verita.

-- ---------------------------------------------------------------------------
-- 1. La risposta "non chiude mai" diventa un valore vero
-- ---------------------------------------------------------------------------
create or replace function risposta_o_segnaposto(p_campo text, p_valore text)
returns text
language sql
immutable
as $$
  select case
    when coalesce(btrim(p_valore), '') = '' then null
    -- "nessuno" e una risposta quando la domanda ammette il nulla
    when p_campo = 'giorno_chiusura'
     and lower(btrim(p_valore)) in ('nessuno','nessuna','nessun','mai','nessun giorno')
      then 'Nessuna chiusura'
    when p_campo = 'orari_consegna'
     and lower(btrim(p_valore)) in ('nessuno','nessuna','nessun','sempre','qualsiasi')
      then 'Nessun vincolo di orario'
    when e_un_segnaposto(p_valore) then null
    else btrim(p_valore)
  end;
$$;

grant execute on function risposta_o_segnaposto(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. La guardia in ingresso copre anche i due campi del camion
-- ---------------------------------------------------------------------------
create or replace function _niente_segnaposto_in_anagrafica()
returns trigger
language plpgsql
as $$
begin
  -- PRIMA SI PULISCE, POI SI GIUDICA. "40699 " con lo spazio in fondo (EDDY
  -- CASH, Germania) passava tutti i controlli e restava sporco: gli incroci per
  -- partita IVA e le tabelle delle zone non lo riconoscono. E' lo stesso errore
  -- trovato nel preventivo: si valida il valore pulito e si salva quello sporco.
  new.cap            := nullif(btrim(coalesce(new.cap,'')), '');
  new.partita_iva    := nullif(btrim(coalesce(new.partita_iva,'')), '');
  new.codice_univoco := nullif(btrim(coalesce(new.codice_univoco,'')), '');
  new.pec            := nullif(btrim(coalesce(new.pec,'')), '');
  new.email          := nullif(btrim(coalesce(new.email,'')), '');

  if e_un_segnaposto(new.partita_iva)    then new.partita_iva    := null; end if;
  if e_un_segnaposto(new.codice_univoco) then new.codice_univoco := null; end if;
  if e_un_segnaposto(new.pec)            then new.pec            := null; end if;
  if e_un_segnaposto(new.email)          then new.email          := null; end if;
  if e_un_segnaposto(new.telefono)       then new.telefono       := null; end if;
  -- Il CAP: fuori i segnaposto E i numeri troppo corti. "35" era il civico di
  -- Delizie del palato, e il preventivo gli aveva trovato una zona. Da quattro
  -- cifre in su si tiene (la Svizzera ne usa quattro), sotto non e' un CAP in
  -- nessun paese. Trovato in verifica: "12" entrava ancora.
  if e_un_segnaposto(new.cap) or (coalesce(btrim(new.cap),'') <> '' and btrim(new.cap) !~ '^[0-9]{4,5}$')
    then new.cap := null; end if;
  if e_un_segnaposto(new.citta)          then new.citta          := null; end if;
  if e_un_segnaposto(new.sede_legale)    then new.sede_legale    := null; end if;
  -- la provincia si normalizza, non si giudica: NA e NO sono sigle vere
  if lower(btrim(coalesce(new.provincia,''))) = 'x' then
    new.provincia := null;
  elsif new.provincia is not null then
    new.provincia := upper(btrim(new.provincia));
  end if;

  -- I DUE CAMPI DEL CAMION (03/09/2026). Una "x" qui faceva risultare
  -- l'anagrafica completa esattamente come nelle email: erano gli ultimi due
  -- campi controllati dall'app e non filtrati in ingresso. "Nessuno" invece e
  -- una risposta e diventa un valore leggibile, non un buco.
  new.giorno_chiusura := risposta_o_segnaposto('giorno_chiusura', new.giorno_chiusura);
  new.orari_consegna  := risposta_o_segnaposto('orari_consegna',  new.orari_consegna);

  return new;
end;
$$;
