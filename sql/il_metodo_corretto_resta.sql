-- IL METODO CORRETTO DAL BOTTONE ROSSO RESTA.
--
-- Luca, 27/08/2026: "quando modifico il metodo di pagamento tramite il bottone
-- rosso, deve venire sovrascritto e rimanere cosi'". E il giorno prima:
-- "quelli con la R alla fine sono perfetti".
--
-- COM'ERA, E PERCHE' NON RESTAVA. La correzione dal bottone rosso scriveva
-- bene ordine + anagrafica + scadenza. Ma il PRIMO ordine successivo del
-- cliente nasceva senza metodo, e il trigger ordine_metodo_da_storia lo
-- riempiva col codice grezzo del gestionale ("TRANSFER", "RIBA"), IGNORANDO
-- l'anagrafica appena corretta. Poi trg_ordine_insegna_al_cliente ricopiava
-- quel grezzo sull'anagrafica, cancellando la correzione. Giro completo:
-- correggi, arriva un ordine, sei punto e a capo. ESSENZAGLUTINE stamattina
-- alle 08:05: "Ri.Ba 30gg FM" scritto da 'da ordine' sopra l'anagrafica.
--
-- ADESSO, in ordine di fiducia:
--   1. il metodo scritto sull'ordine (normalizzato se si puo');
--   2. l'anagrafica del cliente, cioe' l'ultima parola di chi ha corretto;
--   3. la storia del gestionale, ma SOLO in forma canonica: "TRANSFER" secco
--      non dice quando si incassa, e un campo vuoto in rosso e' piu' onesto
--      di un codice che sembra compilato.
-- E l'ordine insegna all'anagrafica solo cio' che e' CAMBIATO su di lui, solo
-- con un valore leggibile: il grezzo riempie i buchi, non sovrascrive mai.

-- ============================================================================
-- 1. L'ordine nuovo nasce col metodo del CLIENTE, non col codice del gestionale
-- ============================================================================
CREATE OR REPLACE FUNCTION ordine_metodo_da_storia()
RETURNS trigger
LANGUAGE plpgsql
-- SECURITY DEFINER: legge cf_partite, che l'utente dell'app non puo' leggere.
-- Senza, ogni insert/update su ordini muore in "permission denied" (07/08).
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cod   text;
  modo  text;
  v_can text;
BEGIN
  BEGIN
    -- C'e' gia' qualcosa: si porta in forma canonica se si puo'. Non si
    -- cancella mai quello che ha scritto una persona.
    IF coalesce(trim(new.metodo_pagamento), '') <> '' THEN
      new.metodo_pagamento := coalesce(metodo_pagamento_canonico(new.metodo_pagamento),
                                       new.metodo_pagamento);
      RETURN new;
    END IF;

    -- 1) PRIMA L'ANAGRAFICA: se il cliente ha un metodo leggibile (magari
    --    corretto ieri dal bottone rosso), l'ordine nasce con quello.
    IF coalesce(trim(new.id_cliente), '') <> '' THEN
      SELECT metodo_pagamento_canonico(co.metodo_pagamento) INTO v_can
      FROM clienti_master m
      JOIN clienti_override co
        ON co.chiave = chiave_anagrafica(nullif(m.piva, ''),
                                         coalesce(m.ragione_sociale, new.cliente))
      WHERE m.codice = new.id_cliente
      LIMIT 1;
      IF v_can IS NOT NULL THEN
        new.metodo_pagamento := v_can;
        RETURN new;
      END IF;
    END IF;

    -- 2) POI LA STORIA DEL GESTIONALE, ma solo se produce una forma canonica.
    --    I giorni medi di ritardo NON si scrivono come accordo (non lo sono).
    cod := ltrim(regexp_replace(coalesce(new.id_cliente, ''), '^CLI-', ''), '0');
    IF cod = '' OR cod !~ '^\d+$' THEN RETURN new; END IF;

    SELECT p.effetto INTO modo
    FROM cf_partite p
    WHERE p.tipo = 'cliente'
      AND ltrim(coalesce(p.codice, ''), '0') = cod
      AND coalesce(p.effetto, '') <> ''
    GROUP BY p.effetto
    ORDER BY count(*) DESC, max(p.data_doc) DESC NULLS LAST
    LIMIT 1;

    IF modo IS NULL THEN
      SELECT c.metodo INTO modo
      FROM clienti_metodo_pagamento c
      WHERE c.codice_cliente = cod;
    END IF;

    v_can := metodo_pagamento_canonico(modo);
    IF v_can IS NOT NULL THEN
      new.metodo_pagamento := v_can;
    END IF;

  EXCEPTION WHEN OTHERS THEN
    -- L'ordine si salva comunque: il bollino rosso chiedera' il metodo.
    INSERT INTO log_trigger_errori (trigger_nome, id_ordine, messaggio, dettaglio)
    VALUES ('ordine_metodo_da_storia', new.id_ordine, SQLERRM, SQLSTATE);
  END;
  RETURN new;
END;
$$;

-- ============================================================================
-- 2. L'ordine insegna al cliente solo cio' che e' CAMBIATO su di lui,
--    e sovrascrive solo con un valore che si sa leggere
-- ============================================================================
-- Il caso che cancellava le correzioni: un ordine VECCHIO (nato col metodo
-- sbagliato) veniva toccato per tutt'altro, e il trigger ricopiava il suo
-- metodo stantio sull'anagrafica appena corretta. Adesso: se il metodo non e'
-- cambiato IN QUESTA scrittura, non insegna niente; e se il valore non e'
-- canonico, al massimo riempie un buco.
create or replace function ordine_insegna_al_cliente()
returns trigger language plpgsql as $$
declare
  v_chiave text; v_piva text; v_rag text;
  v_met text; v_lst text; v_met_can text;
  v_met_cambiato boolean; v_lst_cambiato boolean;
begin
  if new.id_cliente is null then return new; end if;
  select nullif(m.piva, ''), m.ragione_sociale into v_piva, v_rag
    from clienti_master m where m.codice = new.id_cliente;
  if not found then return new; end if;
  v_chiave := chiave_anagrafica(v_piva, coalesce(v_rag, new.cliente));
  if v_chiave is null then return new; end if;

  v_met := nullif(trim(coalesce(new.metodo_pagamento, '')), '');
  v_lst := nullif(trim(coalesce(new.listino, '')), '');
  v_met_can := metodo_pagamento_canonico(v_met);

  if tg_op = 'UPDATE' then
    v_met_cambiato := new.metodo_pagamento is distinct from old.metodo_pagamento;
    v_lst_cambiato := new.listino is distinct from old.listino;
  else
    v_met_cambiato := true;
    v_lst_cambiato := true;
  end if;

  insert into clienti_override (chiave, ragione_sociale, metodo_pagamento, listino_standard, operatore, aggiornato_il)
  values (v_chiave, coalesce(v_rag, new.cliente), coalesce(v_met_can, v_met), v_lst, 'da ordine', now())
  on conflict (chiave) do update
    set metodo_pagamento = case
          when v_met_cambiato and v_met_can is not null then v_met_can
          else coalesce(clienti_override.metodo_pagamento, v_met)
        end,
        listino_standard = case
          when v_lst_cambiato and v_lst is not null then v_lst
          else coalesce(clienti_override.listino_standard, v_lst)
        end,
        -- La scrittura automatica si firma da sola: cosi' non passa per una
        -- conferma umana (la R scatta solo per le persone).
        operatore = 'da ordine',
        aggiornato_il = now()
  -- Niente scritture a vuoto: se non cambia niente, la riga non si tocca
  -- (e non scatta nessuna conferma).
  where (case when v_met_cambiato and v_met_can is not null then v_met_can
              else coalesce(clienti_override.metodo_pagamento, v_met) end)
        is distinct from clienti_override.metodo_pagamento
     or (case when v_lst_cambiato and v_lst is not null then v_lst
              else coalesce(clienti_override.listino_standard, v_lst) end)
        is distinct from clienti_override.listino_standard;
  return new;
end;
$$;

-- ============================================================================
-- 3. Il bottone rosso firma la correzione e la scrive sul cliente (con la R)
-- ============================================================================
-- La firma cambia (2 -> 3 parametri): si butta la vecchia e si ricrea.
DROP FUNCTION IF EXISTS imposta_metodo_pagamento(text, text);

CREATE OR REPLACE FUNCTION imposta_metodo_pagamento(p_id_ordine text, p_metodo text, p_operatore text DEFAULT NULL)
RETURNS TABLE (metodo text, scadenza date, giorni int, aggiornata_cashflow boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_can    text;
  v_data   date;
  v_scad   date;
  v_gg     int;
  v_tocc   int := 0;
  v_chiave text;
  v_rag    text;
  v_cod    text;
  v_chi    text;
BEGIN
  v_can := metodo_pagamento_canonico(p_metodo);
  IF v_can IS NULL THEN
    RAISE EXCEPTION 'Metodo "%" non riconosciuto: non produrrebbe una scadenza', p_metodo;
  END IF;

  -- LA FIRMA. Chi clicca il bottone rosso e' una persona che ha verificato:
  -- la correzione parte firmata e il cliente si conferma (la R di ieri).
  -- I frontend vecchi chiamano ancora senza firma: resta una conferma, ma
  -- si vede che il nome manca.
  v_chi := coalesce(nullif(trim(p_operatore), ''), 'bottone rosso');

  -- PRIMA IL CLIENTE: e' dove il dato vive (Luca 25/08: "ogni modifica che
  -- faccio vale per quell'ordine E per quelli futuri"). Upsert, non update:
  -- il cliente senza scheda arricchita la guadagna qui.
  SELECT chiave_anagrafica(nullif(m.piva, ''), coalesce(m.ragione_sociale, o.cliente)),
         coalesce(m.ragione_sociale, o.cliente),
         o.id_cliente
    INTO v_chiave, v_rag, v_cod
  FROM ordini o
  LEFT JOIN clienti_master m ON m.codice = o.id_cliente
  WHERE o.id_ordine = p_id_ordine AND o.id_cliente IS NOT NULL;

  IF v_chiave IS NOT NULL THEN
    -- Il codice cliente viaggia con la correzione: senza, la conferma nasce
    -- monca e la R non si vede in elenco.
    INSERT INTO clienti_override (chiave, codice_cliente, ragione_sociale, metodo_pagamento, operatore, aggiornato_il)
    VALUES (v_chiave, v_cod, v_rag, v_can, v_chi, now())
    ON CONFLICT (chiave) DO UPDATE
      SET metodo_pagamento = v_can,   -- l'ultima parola e' l'ultima scritta
          codice_cliente   = coalesce(clienti_override.codice_cliente, v_cod),
          operatore        = v_chi,
          aggiornato_il    = now();
  END IF;

  -- POI L'ORDINE.
  UPDATE ordini SET metodo_pagamento = v_can WHERE id_ordine = p_id_ordine;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ordine % inesistente', p_id_ordine; END IF;

  -- E LA SCADENZA, nello stesso colpo: e' il motivo per cui si corregge.
  -- La data resta quella con cui il Cashflow ha aperto la partita.
  SELECT f.data_doc INTO v_data FROM cf_fatture_attese f WHERE f.id = p_id_ordine;
  IF v_data IS NULL THEN
    SELECT coalesce(o.data_ordine, o.data_preparato, now())::date
      INTO v_data FROM ordini o WHERE o.id_ordine = p_id_ordine;
  END IF;

  v_scad := scadenza_da_metodo(v_data, v_can);
  v_gg := (v_scad - v_data)::int;

  UPDATE cf_fatture_attese f
     SET scadenza_prevista = v_scad,
         giorni = v_gg,
         effetto = split_part(v_can, ' ', 1),
         condizione_certa = true
   WHERE f.id = p_id_ordine;
  v_tocc := (SELECT count(*)::int FROM cf_fatture_attese WHERE id = p_id_ordine);

  RETURN QUERY SELECT v_can, v_scad, v_gg, v_tocc > 0;
END;
$$;

GRANT EXECUTE ON FUNCTION imposta_metodo_pagamento(text, text, text) TO anon, authenticated;

-- ============================================================================
-- 4. Il pezzo di ieri rimasto a meta': il trigger della conferma puntava
--    ancora alla funzione vecchia (che ignorava i salvataggi senza modifiche).
--    La funzione nuova era nel repo, ma nessuno aveva rifatto l'aggancio.
-- ============================================================================
create or replace function conferma_cliente_al_salvataggio()
returns trigger language plpgsql as $$
declare
  v_chi    text;
  v_campi  text[] := '{}';
begin
  v_chi := nullif(btrim(coalesce(new.operatore, '')), '');
  if v_chi is null or lower(v_chi) in
     ('automatico', 'da ordine', 'importazione', 'correzione scambio', 'ripristino', 'test')
  then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.metodo_pagamento is distinct from old.metodo_pagamento then v_campi := array_append(v_campi, 'metodo di pagamento'); end if;
    if new.agente_nome     is distinct from old.agente_nome     then v_campi := array_append(v_campi, 'agente'); end if;
    if new.sede_legale     is distinct from old.sede_legale     then v_campi := array_append(v_campi, 'indirizzo'); end if;
    if new.citta           is distinct from old.citta           then v_campi := array_append(v_campi, 'citta'); end if;
    if new.provincia       is distinct from old.provincia       then v_campi := array_append(v_campi, 'provincia'); end if;
    if new.cap             is distinct from old.cap             then v_campi := array_append(v_campi, 'cap'); end if;
    if new.partita_iva     is distinct from old.partita_iva     then v_campi := array_append(v_campi, 'partita iva'); end if;
    if new.codice_univoco  is distinct from old.codice_univoco  then v_campi := array_append(v_campi, 'codice destinatario'); end if;
    if new.pec             is distinct from old.pec             then v_campi := array_append(v_campi, 'pec'); end if;
    if cardinality(v_campi) = 0 then
      v_campi := array['controllato senza modifiche'];
    end if;
  else
    v_campi := array['anagrafica creata'];
  end if;

  insert into clienti_confermati (chiave, codice_cliente, codice_r, ragione_sociale,
                                  confermato_il, confermato_da, campi_toccati, volte)
  values (new.chiave, new.codice_cliente,
          case when coalesce(btrim(new.codice_cliente), '') <> ''
               then new.codice_cliente || '-R' end,
          new.ragione_sociale, now(), v_chi, v_campi, 1)
  on conflict (chiave) do update
    set codice_cliente  = excluded.codice_cliente,
        codice_r        = excluded.codice_r,
        ragione_sociale = excluded.ragione_sociale,
        confermato_il   = now(),
        confermato_da   = excluded.confermato_da,
        campi_toccati   = excluded.campi_toccati,
        volte           = clienti_confermati.volte + 1;
  return new;
end;
$$;

drop trigger if exists trg_conferma_cliente on clienti_override;
create trigger trg_conferma_cliente
  after insert or update on clienti_override
  for each row execute function conferma_cliente_al_salvataggio();

NOTIFY pgrst, 'reload schema';
