-- Il metodo di pagamento deve essere SEMPRE leggibile, e deve produrre una
-- scadenza vera.
--
-- REGOLA DI LUCA (06/08/2026): "tutte le volte che hai un ordine di un cliente
-- che non ha ancora ordinato dal gestionale, ci dobbiamo avere la sicurezza del
-- metodo di pagamento, che lo leggi. Fai in modo che i contrassegni e le riba
-- siano perfettamente allineati: o lo metti all'inizio o lo metti alla fine."
-- E: "a me interessa che sia allineato dal 03.08."
--
-- COM'ERA. Testo libero, e nessuno che combaciasse: su 321 ordini, 290 col campo
-- vuoto e gli altri scritti in undici modi diversi. "Ri.Ba 30gg FM",
-- "Ricevuta bancaria a 60ggDF", "Ricevuta Bancaria 30 GG FM", "Bonifico 30FM",
-- "TRANSFER", "CHECK", "CONTRASSEGNO", "Bonifico Anticipato" e "Bonifico
-- anticipato" come due valori distinti. Nessuno di questi produce una scadenza.
--
-- E il TRANSFER non lo scriveva un umano: lo scrive il trigger
-- ordine_metodo_da_storia, che pesca da cf_partite.effetto, dove il gestionale
-- tiene i suoi codici in inglese. Cioe' l'app sporcava il dato da sola.
--
-- LA FORMA CANONICA: <MEZZO> <giorni> gg <decorrenza>
-- Il mezzo sempre in TESTA, la decorrenza sempre in CODA, "gg" sempre scritto
-- cosi', "data fattura" e "fine mese" sempre per esteso. Chi legge trova il
-- mezzo dove se lo aspetta e il termine dove se lo aspetta, e il parser pure.
--   Contrassegno contanti
--   Ri.Ba. 60 gg fine mese
--   Bonifico 30 gg data fattura
--
-- PERCHE' LA DECORRENZA NON E' UN DETTAGLIO. "30 gg data fattura" su una fattura
-- del 3 agosto scade il 2 settembre; "30 gg fine mese" scade il 30 settembre.
-- Ventotto giorni di differenza sullo stesso pezzo di carta: e' esattamente il
-- buco in cui i soldi si perdono di vista.

-- ---------------------------------------------------------------------------
-- 1. Da qualunque cosa alla forma canonica.
-- ---------------------------------------------------------------------------
-- Ritorna NULL quando non si capisce: un NULL si vede e si corregge, un valore
-- inventato no. Meglio dire "non lo so" che dire 30 giorni per caso.
CREATE OR REPLACE FUNCTION metodo_pagamento_canonico(p_metodo text)
RETURNS text
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  t text;
  v_mezzo text;
  v_gg int;
  v_fine_mese boolean;
BEGIN
  t := lower(btrim(coalesce(p_metodo, '')));
  IF t = '' THEN RETURN NULL; END IF;

  -- Via accenti, punti e spazi doppi: "Ri.Ba.", "RI BA", "riba" sono la stessa
  -- cosa scritta da tre persone diverse.
  t := translate(t, 'àèéìòù', 'aeeiou');
  t := regexp_replace(t, '[^a-z0-9]+', ' ', 'g');
  -- Cifre e lettere si separano: "30FM" e "60ggDF" arrivano attaccati, e senza
  -- questo taglio il "fm" non ha un confine di parola davanti, quindi la
  -- decorrenza fine mese non veniva riconosciuta e la scadenza cadeva 28 giorni
  -- troppo presto. Era il baco piu' costoso dei tre.
  t := regexp_replace(t, '(\d)([a-z])', '\1 \2', 'g');
  t := regexp_replace(t, '([a-z])(\d)', '\1 \2', 'g');
  t := btrim(regexp_replace(t, '\s+', ' ', 'g'));

  -- IL MEZZO. Si riconosce anche dai codici del gestionale (TRANSFER, CHECK,
  -- RIBA, CASH), che sono quelli che il trigger ci scriveva dentro.
  -- ATTENZIONE all'ordine dei test: "contrASSEGno" contiene "assegno". Cercare
  -- l'assegno prima del contrassegno faceva diventare "Contrassegno contanti"
  -- un "Contrassegno assegno", cioe' cambiava da solo chi tiene i soldi.
  IF t ~ 'contrass' OR t ~ '\mcod\M' THEN
    IF t ~ 'contant' OR t ~ 'cash' THEN RETURN 'Contrassegno contanti'; END IF;
    IF t ~ '\masseg' OR t ~ 'check' THEN RETURN 'Contrassegno assegno'; END IF;
    -- "CONTRASSEGNO" secco: la scadenza sarebbe comunque immediata, ma contanti
    -- e assegno non sono la stessa cosa (l'assegno post datato finisce in
    -- cassaforte, i contanti vanno riversati). Non lo indovino: resta da
    -- scegliere, e si vede in archivio.
    RETURN NULL;
  ELSIF t ~ 'riba' OR t ~ 'ricevuta bancaria' OR t ~ 'ri ba' THEN
    v_mezzo := 'Ri.Ba.';
  ELSIF t ~ 'bonific' OR t ~ 'transfer' OR t ~ 'rimessa' THEN
    v_mezzo := 'Bonifico';
  ELSIF t ~ '\masseg' OR t ~ 'check' THEN
    RETURN 'Assegno';
  ELSIF t ~ 'carta di credito' THEN
    RETURN 'Carta di credito';
  ELSIF t ~ 'carta' OR t ~ 'pos' OR t ~ 'bancomat' THEN
    RETURN 'Carta / POS';
  ELSIF t ~ 'contant' OR t ~ 'cash' THEN
    RETURN 'Contrassegno contanti';
  ELSE
    -- "Da concordare" e tutto il resto: NON e' un metodo, e non fa scadenza.
    RETURN NULL;
  END IF;

  -- I GIORNI. Si prende il primo numero: "30gg", "a 60 gg", "60ggDF".
  v_gg := NULLIF(substring(t from '(\d+)'), '')::int;

  -- LA DECORRENZA. "fm", "fine mese", "f m" -> fine mese. "df", "data fattura"
  -- -> data fattura. Senza indicazione si assume data fattura, che e' la piu'
  -- corta delle due: se si sbaglia si sollecita presto, non tardi.
  v_fine_mese := t ~ '\mfm\M' OR t ~ 'fine mese' OR t ~ '\mf m\M';

  -- Anticipato e alla consegna: zero giorni, e il numero se c'e' non conta.
  IF t ~ 'anticip' THEN RETURN v_mezzo || ' anticipato'; END IF;
  IF t ~ 'consegna' THEN RETURN v_mezzo || ' alla consegna'; END IF;

  -- Bonifico a fine mese senza giorni: esiste, ed e' diverso da 30 gg fine mese.
  IF v_gg IS NULL AND v_fine_mese THEN RETURN v_mezzo || ' fine mese'; END IF;

  -- Un mezzo senza termine non fa scadenza: "Bonifico" e "RIBA" da soli non
  -- dicono quando si incassa, ed e' proprio il caso da segnalare.
  IF v_gg IS NULL THEN RETURN NULL; END IF;

  RETURN v_mezzo || ' ' || v_gg || ' gg ' ||
         CASE WHEN v_fine_mese THEN 'fine mese' ELSE 'data fattura' END;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Dalla forma canonica alla scadenza vera.
-- ---------------------------------------------------------------------------
-- Il calcolo "fine mese" non e' data + giorni: e' fine del mese del documento,
-- POI i giorni. Il giro di prima faceva data_doc + giorni per tutti, quindi su
-- ogni condizione a fine mese la scadenza cadeva sempre troppo presto.
CREATE OR REPLACE FUNCTION scadenza_da_metodo(p_data date, p_metodo text)
RETURNS date
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  c text;
  v_gg int;
  v_base date;
BEGIN
  IF p_data IS NULL THEN RETURN NULL; END IF;
  c := metodo_pagamento_canonico(p_metodo);
  IF c IS NULL THEN RETURN NULL; END IF;

  -- Incasso immediato: la merce e i soldi si incrociano sul furgone.
  IF c LIKE 'Contrassegno%' OR c LIKE '%anticipato' OR c LIKE '%alla consegna'
     OR c IN ('Assegno', 'Carta di credito', 'Carta / POS') THEN
    RETURN p_data;
  END IF;

  v_gg := COALESCE(NULLIF(substring(c from '(\d+)'), '')::int, 0);
  v_base := CASE
    WHEN c LIKE '%fine mese'
      THEN (date_trunc('month', p_data) + interval '1 month - 1 day')::date
    ELSE p_data
  END;
  RETURN v_base + v_gg;
END;
$$;

-- Quanti giorni di dilazione, per la colonna giorni del Cashflow.
CREATE OR REPLACE FUNCTION giorni_da_metodo(p_data date, p_metodo text)
RETURNS int
LANGUAGE sql IMMUTABLE AS $$
  SELECT (scadenza_da_metodo(p_data, p_metodo) - p_data)::int;
$$;

GRANT EXECUTE ON FUNCTION metodo_pagamento_canonico(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION scadenza_da_metodo(date, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION giorni_da_metodo(date, text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. L'app non sporca piu' il dato da sola.
-- ---------------------------------------------------------------------------
-- Il trigger che pesca il metodo dalla storia del cliente ora scrive la forma
-- canonica. Prima ci infilava l'effetto grezzo del gestionale ("TRANSFER"), che
-- la lista chiusa dell'anagrafica non conosce: il campo risultava "vecchio, da
-- sistemare" appena scritto.
CREATE OR REPLACE FUNCTION ordine_metodo_da_storia()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  cod text;
  modo text;
  gg int;
BEGIN
  IF coalesce(trim(new.metodo_pagamento), '') <> '' THEN
    -- C'e' gia' qualcosa: si normalizza quello, senza inventare.
    new.metodo_pagamento := coalesce(metodo_pagamento_canonico(new.metodo_pagamento),
                                     new.metodo_pagamento);
    RETURN new;
  END IF;

  -- 'CLI-1647' -> '1647'. I clienti nuovi ('PN-000015') non hanno storia.
  cod := ltrim(regexp_replace(coalesce(new.id_cliente, ''), '^CLI-', ''), '0');
  IF cod = '' OR cod !~ '^\d+$' THEN RETURN new; END IF;

  -- Come ha pagato finora, il modo piu' frequente. Le sue fatture sono la fonte
  -- piu' onesta che abbiamo: dicono cosa e' successo, non cosa e' scritto da
  -- qualche parte. Dal gestionale arriva anche la dilazione, e serve: "RIBA" da
  -- solo non dice quando si incassa.
  SELECT p.effetto INTO modo
  FROM cf_partite p
  WHERE p.tipo = 'cliente'
    AND ltrim(coalesce(p.codice, ''), '0') = cod
    AND coalesce(p.effetto, '') <> ''
  GROUP BY p.effetto
  ORDER BY count(*) DESC, max(p.data_doc) DESC NULLS LAST
  LIMIT 1;

  IF modo IS NULL THEN RETURN new; END IF;

  -- I giorni dalle condizioni ricavate dalle fatture di quel cliente, cosi' il
  -- metodo nasce completo e non come mezzo senza termine.
  SELECT c.giorni INTO gg FROM cf_condizioni_cliente c WHERE c.codice = cod;

  new.metodo_pagamento := coalesce(
    metodo_pagamento_canonico(modo || CASE WHEN coalesce(gg, 0) > 0
                                           THEN ' ' || gg || ' gg' ELSE '' END),
    metodo_pagamento_canonico(modo),
    modo
  );
  RETURN new;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Cambiare il metodo dall'archivio, e rifare la scadenza.
-- ---------------------------------------------------------------------------
-- "Se putacaso e' stato caricato male un metodo di pagamento, abbiamo la
-- possibilita' di cliccare li' e metterci uno che tu vedi e ci crei una corretta
-- scadenza. Altrimenti perdiamo i soldi."
--
-- Correggere il metodo e lasciare la scadenza vecchia non servirebbe a niente:
-- la scadenza e' il motivo per cui si corregge. Quindi si riscrivono insieme, e
-- la riga del Cashflow passa da condizione indovinata a condizione certa.
CREATE OR REPLACE FUNCTION imposta_metodo_pagamento(p_id_ordine text, p_metodo text)
RETURNS TABLE (metodo text, scadenza date, giorni int, aggiornata_cashflow boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_can text;
  v_data date;
  v_scad date;
  v_gg int;
  v_tocc int := 0;
BEGIN
  v_can := metodo_pagamento_canonico(p_metodo);
  IF v_can IS NULL THEN
    RAISE EXCEPTION 'Metodo "%" non riconosciuto: non produrrebbe una scadenza', p_metodo;
  END IF;

  UPDATE ordini SET metodo_pagamento = v_can WHERE id_ordine = p_id_ordine;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ordine % inesistente', p_id_ordine; END IF;

  -- La data del documento e' quella con cui il Cashflow ha aperto la partita:
  -- si riusa quella, non oggi, altrimenti la scadenza si sposterebbe ogni volta
  -- che qualcuno corregge il metodo.
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

GRANT EXECUTE ON FUNCTION imposta_metodo_pagamento(text, text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
