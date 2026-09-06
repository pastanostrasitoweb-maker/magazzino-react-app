-- L'ANAGRAFICA HA UN AGGANCIO SOLO: IL CODICE CLIENTE.
--
-- Luca, 02/09/2026: "quando facciamo le modifiche all'anagrafica vengono
-- variate e perse, c'e' una scrittura che non funziona". Le scritture
-- funzionavano; a non funzionare erano gli AGGANCI. Le schede (clienti_override)
-- si trovano per una chiave ricavata da P.IVA o nome, e quella chiave la
-- calcolavano in due: il database dalla P.IVA del registro, l'app da quella
-- dello snapshot dell'app agenti. Quando il registro non ha la P.IVA (1.205
-- clienti su 2.236) il database usa il nome e l'app la P.IVA: due chiavi per lo
-- stesso cliente, la scheda scritta da una parte non si vede dall'altra, e chi
-- corregge dall'app crea una SECONDA scheda. FIORDILATTE e Delizie del palato
-- ne avevano due ciascuno. Ecco le "modifiche perse".
--
-- E LA CONFERMA (la R) SCATTAVA ANCHE PER LE SCRITTURE DI MASSA: alle 12:27 di
-- oggi un'istruzione ha toccato 141 schede e ne sono nate 94 conferme false
-- ("controllato senza modifiche") a nome di chi risultava sulla riga.
--
-- Tre regole, tutte qui:
--   1. ogni scheda porta il CODICE CLIENTE, e chiunque la scriva lo mette;
--   2. la conferma umana e' ESPLICITA: scatta solo se chi scrive dichiara
--      `conferma_umana_il` (lo fanno la scheda e il bottone rosso, mai i
--      trigger, mai le migrazioni);
--   3. la chiave si calcola in un modo solo, uguale nell'app (spazi doppi
--      collassati), e il registro prende la P.IVA dalla scheda dove ce l'ha.

-- ---------------------------------------------------------------------------
-- 1. La chiave: stessa regola dell'app (spazi multipli -> uno)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION chiave_anagrafica(p_piva text, p_nome text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN coalesce(regexp_replace(coalesce(p_piva, ''), '\D', '', 'g'), '') <> ''
     AND length(regexp_replace(coalesce(p_piva, ''), '\D', '', 'g')) >= 8
     AND regexp_replace(coalesce(p_piva, ''), '\D', '', 'g') !~ '^0+$'
    THEN 'piva:' || regexp_replace(p_piva, '\D', '', 'g')
    WHEN coalesce(btrim(p_nome), '') <> ''
    THEN 'nome:' || regexp_replace(lower(btrim(p_nome)), '\s+', ' ', 'g')
    ELSE NULL
  END;
$$;

-- Le schede scritte con spazi doppi nel nome si riallineano alla chiave nuova
-- (se la chiave pulita esiste gia', si lascia stare: la fusione e' a mano).
UPDATE clienti_override c
   SET chiave = regexp_replace(c.chiave, '\s+', ' ', 'g')
 WHERE c.chiave ~ '\s\s'
   AND NOT EXISTS (SELECT 1 FROM clienti_override x WHERE x.chiave = regexp_replace(c.chiave, '\s+', ' ', 'g'));

-- ---------------------------------------------------------------------------
-- 2. Il registro prende la P.IVA dalla scheda dove il registro non ce l'ha
-- ---------------------------------------------------------------------------
-- Cosi' database e app calcolano la STESSA chiave (piva:...) anche per i
-- clienti nati fuori dal gestionale. Solo dove la scheda e' una e la P.IVA e'
-- usabile: niente indovinelli.
UPDATE clienti_master m
   SET piva = regexp_replace(co.partita_iva, '\D', '', 'g')
  FROM clienti_override co
 WHERE co.codice_cliente = m.codice
   AND regexp_replace(coalesce(co.partita_iva, ''), '\D', '', 'g') ~ '^[0-9]{8,}$'
   AND regexp_replace(co.partita_iva, '\D', '', 'g') !~ '^0+$'
   AND (coalesce(regexp_replace(coalesce(m.piva, ''), '\D', '', 'g'), '') !~ '^[0-9]{8,}$'
        OR regexp_replace(coalesce(m.piva, ''), '\D', '', 'g') ~ '^0+$')
   AND (SELECT count(*) FROM clienti_override x WHERE x.codice_cliente = m.codice
          AND regexp_replace(coalesce(x.partita_iva, ''), '\D', '', 'g') ~ '^[0-9]{8,}$') = 1;

-- ---------------------------------------------------------------------------
-- 3. Le due schede doppie si fondono sulla chiave che ora calcolano tutti
-- ---------------------------------------------------------------------------
-- Per ogni codice con piu' schede: si tiene quella la cui chiave coincide con
-- chiave_anagrafica(registro), ci si versano i valori non vuoti dell'altra
-- (l'ultima scritta vince sui campi che ha), e l'altra si toglie.
DO $$
DECLARE r record; v_buona text; v_altra record;
BEGIN
  FOR r IN SELECT codice_cliente FROM clienti_override WHERE coalesce(codice_cliente,'') <> ''
           GROUP BY codice_cliente HAVING count(*) > 1 LOOP
    SELECT chiave_anagrafica(nullif(m.piva,''), m.ragione_sociale) INTO v_buona
      FROM clienti_master m WHERE m.codice = r.codice_cliente;
    IF v_buona IS NULL OR NOT EXISTS (SELECT 1 FROM clienti_override WHERE chiave = v_buona AND codice_cliente = r.codice_cliente) THEN
      CONTINUE;  -- non si sa quale tenere: resta com'e', si vede in v_schede_doppie
    END IF;
    FOR v_altra IN SELECT * FROM clienti_override WHERE codice_cliente = r.codice_cliente AND chiave <> v_buona ORDER BY aggiornato_il LOOP
      UPDATE clienti_override b SET
        metodo_pagamento  = coalesce(nullif(b.metodo_pagamento,''),  v_altra.metodo_pagamento),
        agente_nome       = coalesce(nullif(b.agente_nome,''),       v_altra.agente_nome),
        agente_id         = coalesce(nullif(b.agente_id,''),         v_altra.agente_id),
        sede_legale       = coalesce(nullif(b.sede_legale,''),       v_altra.sede_legale),
        cap               = coalesce(nullif(b.cap,''),               v_altra.cap),
        citta             = coalesce(nullif(b.citta,''),             v_altra.citta),
        provincia         = coalesce(nullif(b.provincia,''),         v_altra.provincia),
        telefono          = coalesce(nullif(b.telefono,''),          v_altra.telefono),
        email             = coalesce(nullif(b.email,''),             v_altra.email),
        pec               = coalesce(nullif(b.pec,''),               v_altra.pec),
        codice_univoco    = coalesce(nullif(b.codice_univoco,''),    v_altra.codice_univoco),
        partita_iva       = coalesce(nullif(b.partita_iva,''),       v_altra.partita_iva),
        corriere_abituale = coalesce(nullif(b.corriere_abituale,''), v_altra.corriere_abituale),
        listino_standard  = coalesce(nullif(b.listino_standard,''),  v_altra.listino_standard),
        tipologia         = coalesce(nullif(b.tipologia,''),         v_altra.tipologia),
        sconto1_pct       = coalesce(b.sconto1_pct, v_altra.sconto1_pct),
        sconto2_pct       = coalesce(b.sconto2_pct, v_altra.sconto2_pct),
        sconto3_pct       = coalesce(b.sconto3_pct, v_altra.sconto3_pct)
      WHERE b.chiave = v_buona;
      UPDATE clienti_confermati SET chiave = v_buona WHERE chiave = v_altra.chiave
        AND NOT EXISTS (SELECT 1 FROM clienti_confermati WHERE chiave = v_buona);
      DELETE FROM clienti_confermati WHERE chiave = v_altra.chiave;
      DELETE FROM clienti_override WHERE chiave = v_altra.chiave;
    END LOOP;
  END LOOP;
END $$;

CREATE OR REPLACE VIEW v_schede_doppie AS
SELECT codice_cliente, count(*) AS schede, string_agg(chiave, ' | ') AS chiavi
FROM clienti_override WHERE coalesce(codice_cliente,'') <> ''
GROUP BY codice_cliente HAVING count(*) > 1;
GRANT SELECT ON v_schede_doppie TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. La conferma umana e' esplicita
-- ---------------------------------------------------------------------------
ALTER TABLE clienti_override ADD COLUMN IF NOT EXISTS conferma_umana_il timestamptz;

CREATE OR REPLACE FUNCTION conferma_cliente_al_salvataggio()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_chi text; v_campi text[] := '{}';
BEGIN
  -- Senza dichiarazione esplicita nessuna conferma: un trigger, una migrazione,
  -- un'importazione non possono piu' far comparire la R a nome di nessuno.
  IF new.conferma_umana_il IS NULL THEN RETURN new; END IF;
  IF tg_op = 'UPDATE' AND new.conferma_umana_il IS NOT DISTINCT FROM old.conferma_umana_il THEN RETURN new; END IF;

  v_chi := nullif(btrim(coalesce(new.operatore, '')), '');
  IF v_chi IS NULL OR lower(v_chi) IN ('automatico','da ordine','importazione','correzione scambio','ripristino','test') THEN
    RETURN new;
  END IF;

  IF tg_op = 'UPDATE' THEN
    IF new.metodo_pagamento IS DISTINCT FROM old.metodo_pagamento THEN v_campi := array_append(v_campi, 'metodo di pagamento'); END IF;
    IF new.agente_nome     IS DISTINCT FROM old.agente_nome     THEN v_campi := array_append(v_campi, 'agente'); END IF;
    IF new.sede_legale     IS DISTINCT FROM old.sede_legale     THEN v_campi := array_append(v_campi, 'indirizzo'); END IF;
    IF new.citta           IS DISTINCT FROM old.citta           THEN v_campi := array_append(v_campi, 'citta'); END IF;
    IF new.provincia       IS DISTINCT FROM old.provincia       THEN v_campi := array_append(v_campi, 'provincia'); END IF;
    IF new.cap             IS DISTINCT FROM old.cap             THEN v_campi := array_append(v_campi, 'cap'); END IF;
    IF new.partita_iva     IS DISTINCT FROM old.partita_iva     THEN v_campi := array_append(v_campi, 'partita iva'); END IF;
    IF new.codice_univoco  IS DISTINCT FROM old.codice_univoco  THEN v_campi := array_append(v_campi, 'codice destinatario'); END IF;
    IF new.pec             IS DISTINCT FROM old.pec             THEN v_campi := array_append(v_campi, 'pec'); END IF;
    IF cardinality(v_campi) = 0 THEN v_campi := array['controllato senza modifiche']; END IF;
  ELSE
    v_campi := array['anagrafica creata'];
  END IF;

  INSERT INTO clienti_confermati (chiave, codice_cliente, codice_r, ragione_sociale, confermato_il, confermato_da, campi_toccati, volte)
  VALUES (new.chiave, new.codice_cliente,
          CASE WHEN coalesce(btrim(new.codice_cliente), '') <> '' THEN new.codice_cliente || '-R' END,
          new.ragione_sociale, now(), v_chi, v_campi, 1)
  ON CONFLICT (chiave) DO UPDATE
    SET codice_cliente = excluded.codice_cliente, codice_r = excluded.codice_r,
        ragione_sociale = excluded.ragione_sociale, confermato_il = now(),
        confermato_da = excluded.confermato_da, campi_toccati = excluded.campi_toccati,
        volte = clienti_confermati.volte + 1;
  RETURN new;
END;
$$;

-- Il bottone rosso e' un atto umano: dichiara la conferma.
CREATE OR REPLACE FUNCTION imposta_metodo_pagamento(p_id_ordine text, p_metodo text, p_operatore text DEFAULT NULL)
RETURNS TABLE (metodo text, scadenza date, giorni int, aggiornata_cashflow boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_can text; v_data date; v_scad date; v_gg int; v_tocc int := 0; v_chiave text; v_rag text; v_cod text; v_chi text;
BEGIN
  v_can := metodo_pagamento_canonico(p_metodo);
  IF v_can IS NULL THEN RAISE EXCEPTION 'Metodo "%" non riconosciuto: non produrrebbe una scadenza', p_metodo; END IF;
  v_chi := coalesce(nullif(trim(p_operatore), ''), 'bottone rosso');
  SELECT chiave_anagrafica(nullif(m.piva, ''), coalesce(m.ragione_sociale, o.cliente)), coalesce(m.ragione_sociale, o.cliente), o.id_cliente
    INTO v_chiave, v_rag, v_cod
  FROM ordini o LEFT JOIN clienti_master m ON m.codice = o.id_cliente
  WHERE o.id_ordine = p_id_ordine AND o.id_cliente IS NOT NULL;
  IF v_chiave IS NOT NULL THEN
    INSERT INTO clienti_override (chiave, codice_cliente, ragione_sociale, metodo_pagamento, operatore, aggiornato_il, conferma_umana_il)
    VALUES (v_chiave, v_cod, v_rag, v_can, v_chi, now(), now())
    ON CONFLICT (chiave) DO UPDATE
      SET metodo_pagamento = v_can, codice_cliente = coalesce(clienti_override.codice_cliente, v_cod),
          operatore = v_chi, aggiornato_il = now(), conferma_umana_il = now();
  END IF;
  UPDATE ordini SET metodo_pagamento = v_can WHERE id_ordine = p_id_ordine;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ordine % inesistente', p_id_ordine; END IF;
  UPDATE ordini_agenti a SET metodo_pagamento = v_can WHERE a.id_ordine_magazzino = p_id_ordine AND a.metodo_pagamento IS DISTINCT FROM v_can;
  SELECT f.data_doc INTO v_data FROM cf_fatture_attese f WHERE f.id = p_id_ordine;
  IF v_data IS NULL THEN SELECT coalesce(o.data_ordine, o.data_preparato, now())::date INTO v_data FROM ordini o WHERE o.id_ordine = p_id_ordine; END IF;
  v_scad := scadenza_da_metodo(v_data, v_can); v_gg := (v_scad - v_data)::int;
  UPDATE cf_fatture_attese f SET scadenza_prevista = v_scad, giorni = v_gg, effetto = split_part(v_can, ' ', 1), condizione_certa = true WHERE f.id = p_id_ordine;
  v_tocc := (SELECT count(*)::int FROM cf_fatture_attese WHERE id = p_id_ordine);
  RETURN QUERY SELECT v_can, v_scad, v_gg, v_tocc > 0;
END; $$;

-- ---------------------------------------------------------------------------
-- 5. Chi scrive una scheda ci mette il codice
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION ordine_insegna_al_cliente()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_chiave text; v_piva text; v_rag text; v_met text; v_lst text; v_met_can text; v_met_cambiato boolean; v_lst_cambiato boolean;
BEGIN
  IF new.id_cliente IS NULL THEN RETURN new; END IF;
  SELECT nullif(m.piva, ''), m.ragione_sociale INTO v_piva, v_rag FROM clienti_master m WHERE m.codice = new.id_cliente;
  IF NOT FOUND THEN RETURN new; END IF;
  v_chiave := chiave_anagrafica(v_piva, coalesce(v_rag, new.cliente));
  IF v_chiave IS NULL THEN RETURN new; END IF;
  v_met := nullif(trim(coalesce(new.metodo_pagamento, '')), ''); v_lst := nullif(trim(coalesce(new.listino, '')), '');
  v_met_can := metodo_pagamento_canonico(v_met);
  IF tg_op = 'UPDATE' THEN
    v_met_cambiato := new.metodo_pagamento IS DISTINCT FROM old.metodo_pagamento;
    v_lst_cambiato := new.listino IS DISTINCT FROM old.listino;
  ELSE v_met_cambiato := true; v_lst_cambiato := true; END IF;
  INSERT INTO clienti_override (chiave, codice_cliente, ragione_sociale, metodo_pagamento, listino_standard, operatore, aggiornato_il)
  VALUES (v_chiave, new.id_cliente, coalesce(v_rag, new.cliente), coalesce(v_met_can, v_met), v_lst, 'da ordine', now())
  ON CONFLICT (chiave) DO UPDATE
    SET metodo_pagamento = CASE WHEN v_met_cambiato AND v_met_can IS NOT NULL THEN v_met_can ELSE coalesce(clienti_override.metodo_pagamento, v_met) END,
        listino_standard = CASE WHEN v_lst_cambiato AND v_lst IS NOT NULL THEN v_lst ELSE coalesce(clienti_override.listino_standard, v_lst) END,
        codice_cliente   = coalesce(clienti_override.codice_cliente, new.id_cliente),
        operatore = 'da ordine', aggiornato_il = now()
  WHERE (CASE WHEN v_met_cambiato AND v_met_can IS NOT NULL THEN v_met_can ELSE coalesce(clienti_override.metodo_pagamento, v_met) END) IS DISTINCT FROM clienti_override.metodo_pagamento
     OR (CASE WHEN v_lst_cambiato AND v_lst IS NOT NULL THEN v_lst ELSE coalesce(clienti_override.listino_standard, v_lst) END) IS DISTINCT FROM clienti_override.listino_standard
     OR clienti_override.codice_cliente IS NULL;
  RETURN new;
END; $$;

CREATE OR REPLACE FUNCTION agente_impara_dal_ordine()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_chiave text; v_piva text; v_rag text;
BEGIN
  IF coalesce(trim(new.agente_nome), '') = '' THEN RETURN new; END IF;
  IF new.id_cliente IS NULL THEN RETURN new; END IF;
  IF lower(btrim(new.agente_nome)) = 'direzionale' THEN RETURN new; END IF;
  SELECT nullif(m.piva, ''), m.ragione_sociale INTO v_piva, v_rag FROM clienti_master m WHERE m.codice = new.id_cliente;
  IF NOT FOUND THEN RETURN new; END IF;
  v_chiave := chiave_anagrafica(v_piva, coalesce(v_rag, new.cliente));
  IF v_chiave IS NULL THEN RETURN new; END IF;
  INSERT INTO clienti_override (chiave, codice_cliente, ragione_sociale, agente_id, agente_nome, operatore, aggiornato_il)
  VALUES (v_chiave, new.id_cliente, coalesce(v_rag, new.cliente), nullif(trim(coalesce(new.agente_id, '')), ''), trim(new.agente_nome), 'da ordine', now())
  ON CONFLICT (chiave) DO UPDATE
    SET agente_nome = trim(new.agente_nome),
        agente_id = coalesce(nullif(trim(coalesce(new.agente_id, '')), ''), clienti_override.agente_id),
        codice_cliente = coalesce(clienti_override.codice_cliente, new.id_cliente),
        operatore = 'da ordine', aggiornato_il = now();
  RETURN new;
END; $$;

-- Le schede che ancora non hanno il codice ma il cui cliente e' uno solo lo prendono.
UPDATE clienti_override co SET codice_cliente = (SELECT m.codice FROM clienti_master m WHERE chiave_anagrafica(nullif(m.piva,''), m.ragione_sociale) = co.chiave)
 WHERE coalesce(co.codice_cliente,'') = ''
   AND (SELECT count(*) FROM clienti_master m WHERE chiave_anagrafica(nullif(m.piva,''), m.ragione_sociale) = co.chiave) = 1;

-- ---------------------------------------------------------------------------
-- 6. Un metodo grezzo in ingresso non batte la scheda corretta
-- ---------------------------------------------------------------------------
-- "CONTRASSEGNO" secco arriva dall'app agenti: non si sa se contanti o
-- assegno, quindi restava grezzo sull'ordine e in bolla. Ma se la scheda del
-- cliente dice "Contrassegno assegno", quella e' la risposta.
CREATE OR REPLACE FUNCTION ordine_metodo_da_storia()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cod text; modo text; v_can text; v_cli text;
BEGIN
  BEGIN
    IF coalesce(trim(new.id_cliente), '') <> '' THEN
      SELECT metodo_pagamento_canonico(co.metodo_pagamento) INTO v_cli
      FROM clienti_master m JOIN clienti_override co
        ON co.chiave = chiave_anagrafica(nullif(m.piva, ''), coalesce(m.ragione_sociale, new.cliente))
      WHERE m.codice = new.id_cliente LIMIT 1;
    END IF;
    IF coalesce(trim(new.metodo_pagamento), '') <> '' THEN
      v_can := metodo_pagamento_canonico(new.metodo_pagamento);
      -- leggibile: si normalizza; grezzo: vince la scheda se ne ha uno leggibile
      new.metodo_pagamento := coalesce(v_can, v_cli, new.metodo_pagamento);
      RETURN new;
    END IF;
    IF v_cli IS NOT NULL THEN new.metodo_pagamento := v_cli; RETURN new; END IF;
    cod := ltrim(regexp_replace(coalesce(new.id_cliente, ''), '^CLI-', ''), '0');
    IF cod = '' OR cod !~ '^\d+$' THEN RETURN new; END IF;
    SELECT p.effetto INTO modo FROM cf_partite p
     WHERE p.tipo = 'cliente' AND ltrim(coalesce(p.codice, ''), '0') = cod AND coalesce(p.effetto, '') <> ''
     GROUP BY p.effetto ORDER BY count(*) DESC, max(p.data_doc) DESC NULLS LAST LIMIT 1;
    IF modo IS NULL THEN SELECT c.metodo INTO modo FROM clienti_metodo_pagamento c WHERE c.codice_cliente = cod; END IF;
    v_can := metodo_pagamento_canonico(modo);
    IF v_can IS NOT NULL THEN new.metodo_pagamento := v_can; END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO log_trigger_errori (trigger_nome, id_ordine, messaggio, dettaglio) VALUES ('ordine_metodo_da_storia', new.id_ordine, SQLERRM, SQLSTATE);
  END;
  RETURN new;
END; $$;

-- Gli ordini vivi con metodo grezzo prendono quello della scheda, se leggibile.
UPDATE ordini o SET metodo_pagamento = x.can
  FROM (SELECT o2.id_ordine, metodo_pagamento_canonico(co.metodo_pagamento) AS can
          FROM ordini o2 JOIN clienti_master m ON m.codice = o2.id_cliente
          JOIN clienti_override co ON co.chiave = chiave_anagrafica(nullif(m.piva,''), coalesce(m.ragione_sociale, o2.cliente))
         WHERE coalesce(o2.archiviato,false) = false AND coalesce(o2.ddt_numero,'') = ''
           AND metodo_pagamento_canonico(o2.metodo_pagamento) IS NULL
           AND metodo_pagamento_canonico(co.metodo_pagamento) IS NOT NULL) x
 WHERE x.id_ordine = o.id_ordine;

-- ---------------------------------------------------------------------------
-- 7. Via "-18" dai nomi delle referenze a sacchetto (la categoria resta Frozen)
-- ---------------------------------------------------------------------------
UPDATE prodotti SET descrizione_prodotto = btrim(regexp_replace(descrizione_prodotto, '\s*-18\s*', ' ', 'g'))
 WHERE codice_prodotto IN ('HORECA122','HORECA125','HORECA128','HORECA129','HORECA130','HORECA103','HORECA113','HORECA136','HORECA138')
   AND descrizione_prodotto ILIKE '%-18%';

NOTIFY pgrst, 'reload schema';
