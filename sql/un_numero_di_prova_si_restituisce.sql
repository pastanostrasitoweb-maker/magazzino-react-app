-- UN NUMERO DI PROVA SI RESTITUISCE.
--
-- Luca, 05/09/2026: "stavo facendo una prova, questo DDT va reso utilizzabile
-- al prossimo".
--
-- La guardia ddt_numero_non_si_tocca esiste per un motivo serio: un numero
-- emesso e' un documento che sta sul camion o in mano al cliente, e cancellarlo
-- lascia un buco che nessuno sa piu' spiegare. Ma non aveva nessuna via
-- d'uscita, e le prove si fanno: senza una porta legittima si finisce per
-- aprirne una illegittima.
--
-- Questa e' la porta, e si apre solo quando restituire il numero NON crea un
-- buco ne' contraddice un documento gia' uscito:
--   1. dev'essere l'ULTIMO numero emesso: restituire uno in mezzo lascerebbe
--      esattamente il buco che la guardia difende;
--   2. non dev'essere gia' fatturato, ne' mandato a Sibill;
--   3. l'ordine non dev'essere spedito ne' archiviato: se e' partito, il
--      documento e' uscito davvero;
--   4. resta scritto chi l'ha fatto e perche'.

create table if not exists ddt_restituiti (
  id            bigserial primary key,
  ddt_numero    text not null,
  id_ordine     text,
  motivo        text,
  operatore     text,
  quando        timestamptz not null default now()
);

comment on table ddt_restituiti is
  'Numeri DDT tornati disponibili perche'' il documento non era mai uscito (prove). Non e'' un buco: il numero viene riusato.';

create or replace function libera_numero_ddt(
  p_ddt text, p_motivo text default 'prova', p_operatore text default ''
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ordine  text;
  v_stato   text;
  v_arch    boolean;
  v_max     int;
begin
  select id_ordine, stato, coalesce(archiviato,false)
    into v_ordine, v_stato, v_arch
    from ordini where ddt_numero = p_ddt;

  if v_ordine is null then
    raise exception 'Il numero % non e'' su nessun ordine: non c''e'' niente da restituire.', p_ddt;
  end if;
  if p_ddt !~ '^[0-9]+$' then
    raise exception 'Il numero % non e'' un numero.', p_ddt;
  end if;

  -- 1. dev'essere l'ultimo, altrimenti si apre il buco in mezzo
  select greatest(
           coalesce((select max(ddt_numero::int) from ordini where ddt_numero ~ '^[0-9]+$'), 0),
           coalesce((select max(ddt_numero::int) from ddt_annullati where ddt_numero ~ '^[0-9]+$'), 0)
         ) into v_max;
  if p_ddt::int <> v_max then
    raise exception 'Il % non e'' l''ultimo numero emesso (l''ultimo e'' il %): restituirlo lascerebbe un buco in mezzo. Si annulla, non si restituisce.', p_ddt, v_max;
  end if;

  -- 2. il documento non dev'essere andato oltre
  if exists (select 1 from ddt_fatturati where ddt_numero = p_ddt) then
    raise exception 'Il DDT % e'' gia'' fatturato: il numero non torna indietro.', p_ddt;
  end if;
  if exists (select 1 from ddt_sibill_invii where ddt_numero = p_ddt) then
    raise exception 'Il DDT % e'' gia'' stato mandato a Sibill: il numero non torna indietro.', p_ddt;
  end if;

  -- 3. e la merce non dev'essere partita
  if v_arch or v_stato in ('Spedito', 'Archiviato') then
    raise exception 'L''ordine % e'' % : il documento e'' uscito davvero, il numero resta suo.', v_ordine, lower(coalesce(v_stato,'archiviato'));
  end if;

  insert into ddt_restituiti (ddt_numero, id_ordine, motivo, operatore)
  values (p_ddt, v_ordine, nullif(btrim(p_motivo),''), nullif(btrim(p_operatore),''));

  -- La guardia riconosce solo questa porta.
  perform set_config('gfe.numero_restituito', p_ddt, true);
  -- La colonna e' NOT NULL: il "senza numero" qui si scrive stringa vuota, ed
  -- e' la stessa cosa che la guardia legge come "non ne aveva".
  update ordini set ddt_numero = '' where id_ordine = v_ordine;
  delete from ddt_congelati where ddt_numero = p_ddt;

  return format('Numero %s restituito: il prossimo documento lo riusa. Ordine %s.', p_ddt, v_ordine);
end;
$$;

grant execute on function libera_numero_ddt(text, text, text) to anon, authenticated;

-- La guardia, con la sua unica porta.
create or replace function ddt_numero_non_si_tocca()
returns trigger
language plpgsql
as $$
DECLARE vecchio text := NULLIF(TRIM(COALESCE(OLD.ddt_numero, '')), '');
        nuovo   text := NULLIF(TRIM(COALESCE(NEW.ddt_numero, '')), '');
BEGIN
  IF vecchio IS NULL THEN RETURN NEW; END IF;      -- non ne aveva: libero
  IF nuovo IS NOT DISTINCT FROM vecchio THEN RETURN NEW; END IF;

  IF nuovo IS NULL THEN
    -- L'unica via: libera_numero_ddt, che prima controlla che il documento non
    -- sia mai uscito e che il numero sia l'ultimo.
    IF current_setting('gfe.numero_restituito', true) = vecchio THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION
      'Il DDT % e'' gia'' stato emesso per l''ordine %: il numero non si cancella. Il documento e'' in mano al cliente o sul camion. Se era una prova: select libera_numero_ddt(''%'').',
      vecchio, OLD.id_ordine, vecchio;
  END IF;
  RAISE EXCEPTION
    'L''ordine % ha gia'' il DDT %: non si puo'' cambiare in %. Un numero emesso resta quello.',
    OLD.id_ordine, vecchio, nuovo;
END;
$$;
