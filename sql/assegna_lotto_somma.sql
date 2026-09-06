-- ASSEGNARE DUE VOLTE LO STESSO LOTTO DEVE SOMMARE, NON SOSTITUIRE.
--
-- Luca, 26/08/2026: "Ordine ORD-1787727840638 non completamente assegnato",
-- con la schermata che mostrava Ord. 3 / Ass. 3 e due chip sullo stesso lotto
-- (2608236 x1 e 2608236 x2), ma nel database una riga sola da 2.
--
-- L'upsert su (id_riga, id_lotto) SOSTITUIVA la quantita': assegni 1, poi
-- assegni 2 sullo stesso lotto, e resta 2 invece di 3. Il client mostrava due
-- assegnazioni separate e la somma a schermo diceva 3: due verita' diverse
-- sullo stesso dato, e prepara_ordine (che legge il database) bloccava
-- giustamente.
--
-- Perche' era cosi': dei tre punti dell'app che assegnano, solo il "lotto al
-- volo" calcolava il totale prima di chiamare. Gli altri due mandavano la
-- quantita' nuova. Invece di chiedere a tre chiamanti di ricordarsi una
-- convenzione non scritta, adesso lo dice la funzione: p_aggiungi = true somma.
--
-- Le firme esistenti non si toccano (sono gia' chiamate da PostgREST): il
-- parametro nuovo va in coda, con default false = comportamento di prima.

-- Versione con controllo disponibilita' (quella usata dai flussi normali).
create or replace function assegna_lotto(
  p_id_riga text, p_id_lotto text, p_quantita numeric,
  p_operatore text default ''::text, p_allow_negative boolean default false,
  p_aggiungi boolean default false
)
returns assegnazioni_lotti
language plpgsql
as $function$
declare
  v_lotto lotti%rowtype; v_prenotato_altri numeric; v_disp numeric;
  v_existing assegnazioni_lotti%rowtype; v_result assegnazioni_lotti%rowtype;
  v_nuova numeric;
begin
  if p_quantita <= 0 then raise exception 'Quantita non valida: %', p_quantita; end if;

  select * into v_lotto from lotti where id_lotto = p_id_lotto for update;
  if not found then raise exception 'Lotto % inesistente', p_id_lotto; end if;

  select * into v_existing from assegnazioni_lotti
   where id_riga = p_id_riga and id_lotto = p_id_lotto;

  -- Quanto avra' la riga DOPO questa operazione.
  if v_existing.id_assegnazione is not null and p_aggiungi then
    v_nuova := v_existing.quantita_assegnata + p_quantita;
  else
    v_nuova := p_quantita;
  end if;

  -- Il controllo guarda il totale che risultera', non solo il pezzo aggiunto.
  if not p_allow_negative then
    select coalesce(sum(a.quantita_assegnata), 0) into v_prenotato_altri
      from assegnazioni_lotti a
      join righe_ordine r on r.id_riga = a.id_riga
      join ordini o on o.id_ordine = r.id_ordine
     where a.id_lotto = p_id_lotto and a.id_riga <> p_id_riga
       and lower(btrim(o.stato)) <> 'preparato' and o.archiviato = false;
    v_disp := v_lotto.quantita_caricata - v_prenotato_altri;
    if v_nuova > v_disp then
      raise exception 'Disponibilita insufficiente sul lotto % (disponibile %, richiesti %).',
        p_id_lotto, v_disp, v_nuova;
    end if;
  end if;

  if v_existing.id_assegnazione is not null then
    update assegnazioni_lotti
       set quantita_assegnata = v_nuova, data_ora = now(), operatore = p_operatore,
           id_prodotto = v_lotto.id_prodotto, codice_lotto = v_lotto.codice_lotto,
           lotto = v_lotto.lotto
     where id_assegnazione = v_existing.id_assegnazione
     returning * into v_result;
  else
    insert into assegnazioni_lotti (
      id_assegnazione, id_riga, id_lotto, id_prodotto, codice_lotto,
      lotto, quantita_assegnata, data_ora, operatore
    ) values (
      'ASS-' || (extract(epoch from clock_timestamp()) * 1000)::bigint,
      p_id_riga, p_id_lotto, v_lotto.id_prodotto, v_lotto.codice_lotto,
      v_lotto.lotto, v_nuova, now(), p_operatore
    ) returning * into v_result;
  end if;

  update righe_ordine
     set quantita_assegnata = coalesce((
       select sum(quantita_assegnata) from assegnazioni_lotti where id_riga = p_id_riga), 0)
   where id_riga = p_id_riga;

  return v_result;
end;
$function$;

-- La firma a 4 parametri resta, e inoltra a quella completa: cosi' esiste UNA
-- sola logica, non due che possono divergere.
create or replace function assegna_lotto(
  p_id_riga text, p_id_lotto text, p_quantita numeric, p_operatore text default ''::text
)
returns assegnazioni_lotti
language sql
as $function$
  select assegna_lotto(p_id_riga, p_id_lotto, p_quantita, p_operatore, false, false);
$function$;
