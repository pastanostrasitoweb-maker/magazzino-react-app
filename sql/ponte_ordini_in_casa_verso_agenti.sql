-- L'AGENTE VEDE ANCHE GLI ORDINI CARICATI IN CASA.
--
-- Luca, 24/08/2026: "devi comunicare con l'APP agenti per assegnare l'ordine
-- all'agente cosi' che lui se lo vede da APP".
--
-- L'app agenti legge ordini_agenti filtrando per agente_id. Gli ordini che
-- nascono dall'app ci finiscono da soli; quelli caricati in sede (72 su 124 dal
-- 03/08) no, quindi l'agente non li vedeva mai, nemmeno sui suoi clienti.
--
-- IL CANALE E' 'sede', E NON E' UNA DIMENTICANZA. Le provvigioni dell'app si
-- calcolano sul canale (rate[o.canale]: farmaceutico, horeca, gdo): sugli
-- ordini caricati in casa il canale non c'e' scritto da nessuna parte, e
-- dedurlo vorrebbe dire far maturare una provvigione su una supposizione.
-- 'sede' non e' fra quelli tariffati, quindi l'agente VEDE l'ordine e nessun
-- euro si muove finche' non lo decide qualcuno.
create or replace function ponte_ordine_verso_agente(p_id_ordine text)
returns text language plpgsql as $$
declare
  o        ordini%rowtype;
  v_cli    jsonb;
  v_righe  jsonb;
  v_id     text;
  v_tot    numeric;
begin
  select * into o from ordini where id_ordine = p_id_ordine;
  if not found then return null; end if;
  -- Senza agente non c'e' nessuno a cui mostrarlo.
  if coalesce(trim(o.agente_id), '') = '' then return null; end if;
  -- SENZA CODICE CLIENTE NON SI PASSA. L'app agenti tiene insieme ordini,
  -- storico e provvigioni per codice cliente: un ordine intestato a un nome e
  -- basta non si aggancia a niente, e comparirebbe scollegato dal cliente.
  if coalesce(trim(o.id_cliente), '') = '' then return null; end if;
  -- Gli ordini nati dall'app ci sono gia': non si duplicano.
  if exists (select 1 from ordini_agenti where id_ordine_magazzino = o.id_ordine) then return null; end if;
  -- Prima della linea di demarcazione i documenti li faceva TeamSystem.
  if coalesce(o.data_preparato, o.data_ordine) < '2026-08-03' then return null; end if;

  select jsonb_strip_nulls(jsonb_build_object(
           'id', o.id_cliente, 'ragione_sociale', coalesce(co.ragione_sociale, m.ragione_sociale, o.cliente),
           'insegna', coalesce(co.ragione_sociale, m.ragione_sociale, o.cliente),
           'partita_iva', coalesce(nullif(co.partita_iva, ''), m.piva),
           'indirizzo', co.sede_legale, 'citta', co.citta, 'provincia', co.provincia,
           'cap', coalesce(nullif(co.cap, ''), o.cap),
           'codice_univoco', co.codice_univoco, 'metodo_pagamento', o.metodo_pagamento,
           'agente_id', o.agente_id))
    into v_cli
    from clienti_master m
    left join clienti_override co
      on co.chiave = case when coalesce(nullif(m.piva, ''), '') <> ''
                          then 'piva:' || regexp_replace(m.piva, '\D', '', 'g')
                          else 'nome:' || lower(btrim(coalesce(m.ragione_sociale, o.cliente))) end
   where m.codice = o.id_cliente;
  v_cli := coalesce(v_cli, jsonb_build_object('id', o.id_cliente, 'ragione_sociale', o.cliente));

  select coalesce(jsonb_agg(jsonb_build_object(
           'codice', p.codice_prodotto, 'descrizione_prodotto', r.descrizione_prodotto,
           'quantita_ordinata', r.quantita_ordinata, 'colli', r.quantita_ordinata,
           'prezzo_unitario', r.prezzo_unitario, 'sconto_pct', coalesce(r.sconto_pct, 0),
           'iva_pct', r.iva_pct, 'promo', false,
           'prodotto', jsonb_build_object('id', r.id_prodotto, 'codice', p.codice_prodotto,
                                          'nome', r.descrizione_prodotto, 'categoria', p.categoria)
         ) order by r.ordine_riga), '[]'::jsonb)
    into v_righe
    from righe_ordine r left join prodotti p on p.id_prodotto::text = r.id_prodotto::text
   where r.id_ordine = o.id_ordine;

  -- Il totale: quello dell'ordine se c'e', altrimenti si somma dalle righe
  -- (sconti in cascata, come li calcola il magazzino). Un ordine senza totale
  -- esiste: e' uno che nessuno ha ancora valorizzato.
  select coalesce(o.totale_imponibile, sum(
           r.quantita_ordinata * coalesce(r.prezzo_unitario, 0)
           * (1 - coalesce(r.sconto_pct, 0) / 100)
           * (1 - coalesce(r.sconto2_pct, 0) / 100)
           * (1 - coalesce(r.sconto3_pct, 0) / 100)), 0)
    into v_tot
    from righe_ordine r where r.id_ordine = o.id_ordine;
  v_tot := coalesce(v_tot, 0);

  -- Il prefisso dice da dove viene: questa riga l'ha creata il magazzino, non
  -- l'agente. Serve a distinguerle e, se serve, a toglierle tutte insieme.
  v_id := 'ORD-MG-' || o.id_ordine;
  insert into ordini_agenti (
      id_ordine, agente_id, agente_nome, cliente_id, cliente, canale, righe, totale,
      stato, id_ordine_magazzino, stato_magazzino, aggiornato_magazzino_il,
      ddt_numero, corriere, colli_spediti, creato_il, note)
  values (
      v_id, o.agente_id, o.agente_nome, o.id_cliente, v_cli, 'sede', v_righe,
      v_tot, 'Importato', o.id_ordine, o.stato, now(),
      o.ddt_numero, coalesce(o.corriere_spedizione, o.corriere), o.colli, o.data_ordine,
      'Caricato in sede')
  on conflict (id_ordine) do nothing;
  return v_id;
end;
$$;

-- Il ponte si costruisce da solo quando l'ordine prende un agente.
create or replace function ponte_agente_automatico()
returns trigger language plpgsql as $$
begin
  perform ponte_ordine_verso_agente(new.id_ordine);
  return null;
end;
$$;
drop trigger if exists trg_ponte_agente on ordini;
create trigger trg_ponte_agente
  after insert or update of agente_id on ordini
  for each row when (new.agente_id is not null)
  execute function ponte_agente_automatico();
