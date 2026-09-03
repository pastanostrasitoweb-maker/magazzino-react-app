-- UN REGISTRO CHE FALLISCE IN SILENZIO NON E' UN REGISTRO.
--
-- Luca, 02/09/2026: "questo non funziona benissimo", sulla parte in cui avevo
-- scritto che se lo storico fallisce l'operazione va avanti lo stesso. La
-- critica e' giusta ed e' esattamente il difetto che avevo trovato stamattina
-- nella telemetria: la coda si svuotava prima di sapere com'era andata, quindi
-- poteva smettere di funzionare senza che nessuno se ne accorgesse.
--
-- Avevo scritto `EXCEPTION WHEN OTHERS THEN NULL`: l'errore veniva ingoiato e
-- sparito. Cosi' la promessa "dalle anagrafiche non si perde piu' niente"
-- sarebbe potuta diventare falsa in qualunque momento, in silenzio, e ce ne
-- saremmo accorti il giorno in cui serviva recuperare un dato.
--
-- Adesso vale ancora che lo storico NON blocca il lavoro, ma quando fallisce
-- lo dice: l'errore finisce in `log_trigger_errori`, dove gia' finiscono
-- quelli degli altri trigger, e la vista qui sotto dice se il registro sta
-- lavorando davvero.
CREATE OR REPLACE FUNCTION anagrafica_non_perde_niente()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_campi text[] := ARRAY['metodo_pagamento','agente_nome','agente_id','sede_legale','cap',
                          'citta','provincia','telefono','email','pec','codice_univoco',
                          'partita_iva','ragione_sociale','corriere_abituale','listino_standard',
                          'tipologia','insegna','note','giorno_chiusura','orari_consegna'];
  v_campo text; v_prima text; v_dopo text;
  v_new jsonb := to_jsonb(new);
  v_old jsonb := to_jsonb(old);
BEGIN
  FOREACH v_campo IN ARRAY v_campi LOOP
    IF NOT (v_old ? v_campo) THEN CONTINUE; END IF;
    v_prima := v_old ->> v_campo;
    v_dopo  := v_new ->> v_campo;
    IF v_prima IS NOT DISTINCT FROM v_dopo THEN CONTINUE; END IF;

    IF coalesce(btrim(coalesce(v_dopo, '')), '') = '' AND coalesce(btrim(v_prima), '') <> '' THEN
      -- Un metodo che il database stesso rifiuta non si difende: tenerlo
      -- lascerebbe la scheda bloccata per sempre.
      IF v_campo = 'metodo_pagamento' AND metodo_pagamento_canonico(v_prima) IS NULL THEN
        NULL;
      ELSE
        v_new := jsonb_set(v_new, ARRAY[v_campo], to_jsonb(v_prima));
        CONTINUE;
      END IF;
    END IF;

    BEGIN
      INSERT INTO clienti_override_storico (chiave, codice_cliente, campo, valore_prima, valore_dopo, operatore)
      VALUES (new.chiave, coalesce(new.codice_cliente, old.codice_cliente), v_campo, v_prima, v_dopo,
              coalesce(nullif(btrim(coalesce(new.operatore,'')), ''), 'non firmato'));
    EXCEPTION WHEN OTHERS THEN
      -- Non blocca chi sta lavorando, ma NON sparisce: si scrive dove si
      -- guardano i guasti, col dato che stava per essere registrato.
      BEGIN
        INSERT INTO log_trigger_errori (trigger_nome, id_ordine, messaggio, dettaglio)
        VALUES ('storico_anagrafiche', new.chiave,
                'storia non registrata su ' || v_campo || ': ' || SQLERRM,
                left(coalesce(v_prima,'(vuoto)') || ' -> ' || coalesce(v_dopo,'(vuoto)'), 300));
      EXCEPTION WHEN OTHERS THEN NULL;  -- se anche il registro dei guasti e' rotto, il lavoro continua
      END;
    END;
  END LOOP;

  RETURN jsonb_populate_record(new, v_new);
END; $$;

-- IL REGISTRO STA LAVORANDO? Si controlla confrontando le schede modificate
-- con le righe di storia scritte. Se le schede cambiano e la storia no, il
-- registro e' morto e va guardato.
CREATE OR REPLACE VIEW v_storico_anagrafiche_salute AS
SELECT
  (SELECT count(*) FROM clienti_override WHERE aggiornato_il > now() - interval '24 hours') AS schede_toccate_24h,
  (SELECT count(*) FROM clienti_override_storico WHERE quando > now() - interval '24 hours') AS righe_di_storia_24h,
  (SELECT max(quando) FROM clienti_override_storico) AS ultima_riga_scritta,
  (SELECT count(*) FROM log_trigger_errori WHERE trigger_nome = 'storico_anagrafiche' AND quando > now() - interval '24 hours') AS guasti_24h,
  CASE
    WHEN (SELECT count(*) FROM log_trigger_errori WHERE trigger_nome = 'storico_anagrafiche' AND quando > now() - interval '24 hours') > 0
      THEN 'GUASTO: la storia non viene registrata, guarda log_trigger_errori'
    WHEN (SELECT count(*) FROM clienti_override WHERE aggiornato_il > now() - interval '24 hours') > 0
     AND (SELECT count(*) FROM clienti_override_storico WHERE quando > now() - interval '24 hours') = 0
      THEN 'SOSPETTO: schede modificate ma nessuna riga di storia'
    ELSE 'il registro sta lavorando'
  END AS stato;

GRANT SELECT ON v_storico_anagrafiche_salute TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
