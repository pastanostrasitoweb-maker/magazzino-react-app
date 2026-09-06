-- UN CARICO, UNA PORTA SOLA (03/09/2026)
--
-- Confessione raccolta da Luca: la produzione carica i lotti dalla pagina
-- ARTICOLI del magazzino, non dalla pagina Produzione. Motivo dichiarato:
-- "quando carico piu volte lo stesso lotto non me li accorpa".
--
-- Cosa si e trovato davvero:
--   1. l'accorpamento c'era gia (adapter magazzino e app-produzione), ma
--      NESSUNA delle due maschere lo DICEVA: chi caricava non vedeva la somma
--      e credeva di aver sbagliato;
--   2. la maschera Articoli scrive SOLO su `lotti`. Non lascia traccia in
--      `carichi_produzione`. Quindi quei carichi non esistono per l'app
--      Produzione ne per i kg prodotti del mese: "da quell'altra parte tu non
--      li vedi". Verificato: 45 lotti nati negli ultimi 45 giorni senza una
--      riga di carico corrispondente (NFARMA 025 Scialatielli di oggi incluso).
--
-- Da qui in avanti il carico e UNA operazione sola, e passa da qui. Chiunque
-- carichi (pagina Articoli, pagina Produzione del magazzino, app Produzione,
-- lotto al volo dentro l'ordine) fa la stessa cosa e lascia la stessa traccia.

-- ---------------------------------------------------------------------------
-- 1. Il registro dei carichi dice anche DA DOVE e COSA
-- ---------------------------------------------------------------------------
alter table carichi_produzione add column if not exists origine text;
alter table carichi_produzione add column if not exists tipo_carico text;

comment on column carichi_produzione.origine is
  'Da quale maschera e entrato il carico: articoli, produzione-magazzino, app-produzione, lotto-al-volo.';
comment on column carichi_produzione.tipo_carico is
  'produzione = uscito dal nostro laboratorio; acquisto = merce comprata; da_verificare = il catalogo non basta a dirlo.';

create index if not exists idx_carichi_produzione_prodotto_lotto
  on carichi_produzione (id_prodotto, lower(btrim(lotto)));

-- ---------------------------------------------------------------------------
-- 2. Nostro o comprato: l'elenco si scrive AL POSITIVO
--    (stessa direzione dell'errore gia scelta nell'app agenti: una categoria
--    nuova o rinominata cade fra i "da verificare", non fra le nostre)
-- ---------------------------------------------------------------------------
create or replace function tipo_carico_prodotto(p_id_prodotto text)
returns text
language sql
stable
as $$
  select case
    -- Commercializzato certo, qualunque cosa dica la categoria:
    when p.codice_prodotto ilike 'BIS%' then 'acquisto'
    -- Hotellerie HOR 001-008 (cornetti, fagottini, baguette): panetteria
    -- comprata. Attenzione: HORECA1xx sono le nostre paste, non matchano
    -- perche dopo HOR seguono lettere.
    when p.codice_prodotto ~* '^hor[[:space:]]*[0-9]+$' then 'acquisto'
    when btrim(p.categoria) in ('Snack Linea Gioia', 'Panificati', 'Espositori') then 'acquisto'
    when btrim(p.categoria) in (
      'Pasta Fresca +4', 'Pasta Secca', 'Frozen -18°C',
      'Pasta Stabilizzata', 'Piatti Pronti +4', 'Formati Speciali'
    ) then 'produzione'
    else 'da_verificare'
  end
  from prodotti p
  where p.id_prodotto::text = p_id_prodotto;
$$;

-- ---------------------------------------------------------------------------
-- 3. LA PORTA. Accorpa, registra, e RACCONTA cosa ha fatto.
-- ---------------------------------------------------------------------------
create or replace function carica_lotto(
  p_id_prodotto text,
  p_codice_lotto text,
  p_scadenza     date,
  p_quantita     numeric,
  p_operatore    text default '',
  p_origine      text default 'articoli'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prod        record;
  v_codice      text := btrim(coalesce(p_codice_lotto, ''));
  v_qta         numeric := coalesce(p_quantita, 0);
  v_lotto       record;
  v_id_lotto    text;
  v_prima       numeric := 0;
  v_dopo        numeric;
  v_accorpato   boolean := false;
  v_kg          numeric;
  v_tipo        text;
  v_id_carico   bigint;
  v_tentativo   int := 0;
  v_gemello_scadenza text;
begin
  select id_prodotto, codice_prodotto, descrizione_prodotto, gestione_lotti, peso_kg
    into v_prod
  from prodotti
  where id_prodotto::text = p_id_prodotto;

  if not found then
    return jsonb_build_object('ok', false, 'errore', 'Articolo non trovato: ' || coalesce(p_id_prodotto, '(vuoto)'));
  end if;

  -- Zero e ammesso, ma non e un carico: serve al "lotto al volo" dentro
  -- l'ordine, che apre il contenitore prima che la merce arrivi davvero. In
  -- quel caso non si scrive nessuna riga nel registro dei carichi: una riga da
  -- zero sarebbe produzione che non e mai uscita dal reparto.
  if v_qta < 0 then
    return jsonb_build_object('ok', false, 'errore', 'Le unita caricate non possono essere negative.');
  end if;

  -- Il codice lotto e la scadenza li scrive la persona: qui non si inventano.
  if coalesce(v_prod.gestione_lotti, true) then
    if v_codice = '' then
      return jsonb_build_object('ok', false, 'errore',
        'Serve il codice lotto: ' || v_prod.codice_prodotto || ' ha la gestione lotti attiva.');
    end if;
    if lower(v_codice) = 'disponibilita' then
      return jsonb_build_object('ok', false, 'errore',
        v_prod.codice_prodotto || ' ha la gestione lotti attiva: non si carica come DISPONIBILITA, serve il lotto vero.');
    end if;
  elsif v_codice = '' then
    v_codice := 'DISPONIBILITA';
  end if;

  -- ACCORPAMENTO. Stesso articolo + stesso codice (ignorando maiuscole e
  -- spazi) + non archiviato = e lo stesso lotto, si somma. Caricare piu volte
  -- e permesso: e il modo normale di lavorare quando la produzione esce a
  -- ondate durante la giornata.
  select * into v_lotto
  from lotti
  where id_prodotto = p_id_prodotto
    and coalesce(archiviato, false) = false
    and lower(btrim(coalesce(codice_lotto, lotto, ''))) = lower(v_codice)
  order by id_lotto
  limit 1
  for update;

  if found then
    v_accorpato := true;
    v_id_lotto  := v_lotto.id_lotto;
    v_prima     := coalesce(v_lotto.quantita_caricata, 0);
    -- Il codice buono e quello gia a magazzino, non come l'ha digitato adesso
    -- chi carica: se no la stessa merce compare con due grafie diverse fra
    -- giacenza, registro dei carichi e bolla.
    v_codice    := coalesce(nullif(btrim(v_lotto.codice_lotto), ''), nullif(btrim(v_lotto.lotto), ''), v_codice);
    v_dopo      := v_prima + v_qta;
    update lotti
       set quantita_caricata = v_dopo,
           scadenza = coalesce(p_scadenza::timestamptz, scadenza),
           codice_lotto = coalesce(nullif(btrim(codice_lotto), ''), v_codice),
           lotto = coalesce(nullif(btrim(lotto), ''), v_codice)
     where id_lotto = v_id_lotto;
  else
    v_dopo := v_qta;
    loop
      v_tentativo := v_tentativo + 1;
      v_id_lotto := 'LOT-' || ((extract(epoch from clock_timestamp()) * 1000)::bigint + v_tentativo - 1)::text;
      exit when not exists (select 1 from lotti where id_lotto = v_id_lotto) or v_tentativo > 20;
    end loop;
    insert into lotti (id_lotto, id_prodotto, codice_lotto, lotto, scadenza, quantita_caricata, archiviato)
    values (v_id_lotto, p_id_prodotto, v_codice, v_codice, p_scadenza::timestamptz, v_qta, false);
  end if;

  -- IL LOTTO SCRITTO DUE VOLTE IN DUE MODI (03/09/2026).
  -- HORECA201 Ricotta e Spinaci: 2609243 e 2608243, stessa scadenza, stesso
  -- giorno, stesso operatore, 10 CT ognuno. Una cifra sola di differenza, e a
  -- occhio non si vede. La scadenza pero li tradisce: due lotti dello stesso
  -- articolo che scadono lo stesso giorno sono quasi sempre lo stesso lotto
  -- battuto in due modi. Non si blocca (puo succedere davvero), si dice.
  if not v_accorpato and p_scadenza is not null then
    select string_agg(distinct coalesce(nullif(btrim(codice_lotto), ''), lotto), ', ')
      into v_gemello_scadenza
    from lotti
    where id_prodotto = p_id_prodotto
      and coalesce(archiviato, false) = false
      and id_lotto <> v_id_lotto
      and scadenza::date = p_scadenza;
  end if;

  -- I kg: unita x peso del collo. Senza peso a catalogo restano VUOTI, non
  -- zero: uno zero finirebbe nei kg prodotti del mese come numero vero.
  v_kg := case when coalesce(v_prod.peso_kg, 0) > 0
               then round(v_qta * v_prod.peso_kg, 3)
               else null end;
  v_tipo := tipo_carico_prodotto(p_id_prodotto);

  -- Il registro: append-only, una riga per ogni carico, anche il secondo sullo
  -- stesso lotto. Cosi la produzione della giornata si legge da un posto solo,
  -- da qualunque maschera sia entrata.
  if v_qta > 0 then
    insert into carichi_produzione
      (data, id_prodotto, codice_prodotto, descrizione_prodotto, lotto, scadenza, ct, kg, operatore, origine, tipo_carico)
    values
      (current_date, p_id_prodotto, v_prod.codice_prodotto, v_prod.descrizione_prodotto,
       v_codice, p_scadenza, v_qta, v_kg, coalesce(p_operatore, ''), coalesce(p_origine, 'articoli'), v_tipo)
    returning id into v_id_carico;
  end if;

  return jsonb_build_object(
    'ok', true,
    'id_lotto', v_id_lotto,
    'codice_lotto', v_codice,
    'accorpato', v_accorpato,
    'prima', v_prima,
    'aggiunte', v_qta,
    'dopo', v_dopo,
    'kg', v_kg,
    'tipo_carico', v_tipo,
    'id_carico_produzione', v_id_carico,
    'carico_registrato', (v_qta > 0),
    'gemello_per_scadenza', v_gemello_scadenza,
    'avviso', case
      when v_gemello_scadenza is not null then
        'Attenzione: di questo articolo c''e gia il lotto ' || v_gemello_scadenza ||
        ' con la STESSA scadenza. E lo stesso lotto scritto in due modi? Se si, correggi il codice invece di tenerne due.'
      when v_qta = 0 then null
      when v_kg is null then 'Manca il peso del collo a catalogo: i kg di questo carico restano vuoti.'
      when v_tipo = 'da_verificare' then 'Non e chiaro dal catalogo se questo articolo lo produciamo o lo compriamo.'
      else null end
  );
end;
$$;

grant execute on function carica_lotto(text, text, date, numeric, text, text) to anon, authenticated;
grant execute on function tipo_carico_prodotto(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Le due viste di controllo
-- ---------------------------------------------------------------------------

-- La produzione lorda vera: fuori la merce comprata e i dubbi.
create or replace view v_produzione_lorda as
select cp.*
from carichi_produzione cp
where coalesce(cp.tipo_carico, tipo_carico_prodotto(cp.id_prodotto)) = 'produzione';

-- Chi carica senza lasciare traccia. Da qui in avanti deve restare vuota:
-- se si ripopola, qualcuno sta scrivendo su `lotti` senza passare dalla porta.
create or replace view v_lotti_senza_carico as
select
  l.id_lotto,
  (to_timestamp((regexp_replace(l.id_lotto, '^LOT-', ''))::bigint / 1000.0) at time zone 'Europe/Rome')::date as nato_il,
  p.codice_prodotto,
  p.descrizione_prodotto,
  p.categoria,
  l.codice_lotto,
  l.quantita_caricata as giacenza_oggi,
  coalesce(l.archiviato, false) as archiviato
from lotti l
join prodotti p on p.id_prodotto::text = l.id_prodotto
where l.id_lotto ~ '^LOT-[0-9]{13}$'
  and not exists (
    select 1 from carichi_produzione cp
    where cp.id_prodotto = l.id_prodotto
      and lower(btrim(cp.lotto)) = lower(btrim(coalesce(l.codice_lotto, l.lotto, '')))
  );

grant select on v_produzione_lorda, v_lotti_senza_carico to anon, authenticated;

-- ---------------------------------------------------------------------------
-- LA VISTA DEVE DIRE QUALE DEI TRE CASI E' (04/09/2026)
-- Il giorno dopo la porta unica, `v_lotti_senza_carico` segnalava 4 lotti nati
-- in mattinata. Guardandoli uno per uno non erano la stessa cosa:
--   - due con giacenza 0: contenitori aperti dal "lotto al volo" dentro un
--     ordine, che per costruzione non registrano un carico. Innocui.
--   - due con giacenza NEGATIVA: da quel lotto e' uscita merce che non e' mai
--     entrata. Quello si', va sistemato.
-- Quattro allarmi identici per tre situazioni diverse sono un allarme che
-- nessuno guarda: la vista adesso dice quale.
-- ---------------------------------------------------------------------------
drop view if exists v_lotti_senza_carico;
create view v_lotti_senza_carico as
select
  l.id_lotto,
  (to_timestamp((regexp_replace(l.id_lotto, '^LOT-', ''))::bigint / 1000.0) at time zone 'Europe/Rome')::date as nato_il,
  p.codice_prodotto,
  p.descrizione_prodotto,
  p.categoria,
  l.codice_lotto,
  l.quantita_caricata as giacenza_oggi,
  coalesce(l.archiviato, false) as archiviato,
  case
    when l.quantita_caricata < 0 then 'MERCE USCITA SENZA CARICO: da sistemare'
    when l.quantita_caricata = 0 then 'contenitore vuoto (lotto al volo): la merce non e ancora entrata'
    else 'caricato scavalcando la porta: la produzione non lo vede'
  end as situazione
from lotti l
join prodotti p on p.id_prodotto::text = l.id_prodotto
where l.id_lotto ~ '^LOT-[0-9]{13}$'
  and not exists (
    select 1 from carichi_produzione cp
    where cp.id_prodotto = l.id_prodotto
      and lower(btrim(cp.lotto)) = lower(btrim(coalesce(l.codice_lotto, l.lotto, '')))
  );

grant select on v_lotti_senza_carico to anon, authenticated;
