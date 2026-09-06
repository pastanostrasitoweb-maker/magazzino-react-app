-- LO STESSO EVENTO CONTA UNA VOLTA SOLA.
--
-- Review avversariale del 02/09/2026, secondo rilievo. Da oggi la coda della
-- telemetria non si svuota piu' prima della risposta: se l'invio fallisce, il
-- lotto si rimette in coda e si riprova. Giusto, ma con un buco: se il server
-- SALVA e poi la risposta si perde per strada (rete che cade, proxy, timeout),
-- il client crede di aver fallito e rispedisce lo stesso lotto, fino a cinque
-- volte. I click risulterebbero gonfiati, e le statistiche su cui si decide
-- cosa migliorare direbbero il falso.
--
-- Ogni evento nasce quindi con un suo codice, deciso dal browser PRIMA del
-- primo invio e mantenuto in tutti i tentativi. Qui c'e' il vincolo che rende
-- il secondo arrivo un doppione da ignorare, non una riga in piu'.
ALTER TABLE telemetria_uso ADD COLUMN IF NOT EXISTS evento_id uuid;

-- Indice unico SENZA condizione: un indice parziale (WHERE evento_id IS NOT
-- NULL) non e' utilizzabile da ON CONFLICT, e il server rispondeva "there is
-- no unique or exclusion constraint matching" a ogni invio. Senza condizione
-- va bene lo stesso: in Postgres due valori nulli non si considerano uguali,
-- quindi le 24.507 righe gia' raccolte, che il codice non ce l'hanno,
-- convivono senza dare fastidio.
DROP INDEX IF EXISTS telemetria_uso_evento_id_unico;
CREATE UNIQUE INDEX IF NOT EXISTS telemetria_uso_evento_id_unico
  ON telemetria_uso (evento_id);

NOTIFY pgrst, 'reload schema';

-- LA SCRITTURA PASSA DA UNA PORTA STRETTA.
--
-- L'upsert fatto dal browser (`on_conflict=` + ignore-duplicates) pretende il
-- permesso di LEGGERE la tabella, e leggere la telemetria vuol dire vedere
-- come lavora l'azienda: non si concede a chi ha solo la chiave pubblica.
-- La deduplicazione si fa quindi qui dentro, dove i permessi ce li ha la
-- funzione e non il chiamante. Il browser manda il suo lotto e basta.
CREATE OR REPLACE FUNCTION telemetria_registra(p_eventi jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_scritti integer;
BEGIN
  IF p_eventi IS NULL OR jsonb_typeof(p_eventi) <> 'array' THEN RETURN 0; END IF;

  WITH nuovi AS (
    INSERT INTO telemetria_uso (evento_id, app, chi, dispositivo, tipo, nome, dettaglio, valore)
    SELECT (e->>'evento_id')::uuid,
           left(coalesce(e->>'app', ''), 40),
           left(coalesce(e->>'chi', ''), 40),
           left(coalesce(e->>'dispositivo', ''), 60),
           left(coalesce(e->>'tipo', 'azione'), 20),
           left(coalesce(e->>'nome', ''), 120),
           left(coalesce(e->>'dettaglio', ''), 200),
           CASE WHEN e->>'valore' ~ '^-?[0-9]+(\.[0-9]+)?$' THEN (e->>'valore')::numeric END
    FROM jsonb_array_elements(p_eventi) e
    WHERE coalesce(e->>'nome', '') <> ''
      AND (e->>'evento_id') ~* '^[0-9a-f-]{36}$'
    ON CONFLICT (evento_id) DO NOTHING   -- il secondo arrivo e' un doppione
    RETURNING 1
  )
  SELECT count(*)::int INTO v_scritti FROM nuovi;
  RETURN v_scritti;
END;
$$;

REVOKE ALL ON FUNCTION telemetria_registra(jsonb) FROM public;
GRANT EXECUTE ON FUNCTION telemetria_registra(jsonb) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
