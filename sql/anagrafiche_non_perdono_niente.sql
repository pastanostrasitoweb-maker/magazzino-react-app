-- DALLE ANAGRAFICHE NON SI PERDE PIU' NIENTE.
--
-- Luca, 02/09/2026: "assicurati che anagrafiche e metodo di pagamento siano
-- allineati una volta per tutte e in futuro non perderemo piu' nessun dato
-- dalle anagrafiche che ti caricano le ragazze".
--
-- Oggi un dato si puo' perdere in due modi, e li chiudiamo tutti e due.
--
-- MODO 1: qualcuno riscrive la scheda e il valore di prima sparisce senza
-- lasciare traccia. Da adesso ogni versione precedente finisce nello storico:
-- anche se una scrittura sbagliata passa, il dato vero e' sempre recuperabile,
-- con la data e il nome di chi ha scritto.
CREATE TABLE IF NOT EXISTS clienti_override_storico (
  id            bigserial PRIMARY KEY,
  chiave        text NOT NULL,
  codice_cliente text,
  campo         text NOT NULL,
  valore_prima  text,
  valore_dopo   text,
  operatore     text,
  quando        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS clienti_override_storico_chiave ON clienti_override_storico (chiave, quando DESC);
ALTER TABLE clienti_override_storico ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS storico_lettura ON clienti_override_storico;
CREATE POLICY storico_lettura ON clienti_override_storico FOR SELECT TO anon, authenticated USING (true);
GRANT SELECT ON clienti_override_storico TO anon, authenticated;

-- MODO 2: una scrittura automatica SVUOTA un campo che una persona aveva
-- compilato. Un import che manda il campo vuoto, un ponte che non conosce quel
-- dato, una riga a meta': il campo pieno diventa vuoto e nessuno se ne accorge.
-- Da adesso il vuoto non cancella il pieno: per togliere un dato bisogna
-- scrivere qualcos'altro, non lasciare la casella in bianco.
CREATE OR REPLACE FUNCTION anagrafica_non_perde_niente()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_campi text[] := ARRAY['metodo_pagamento','agente_nome','agente_id','sede_legale','cap',
                          'citta','provincia','telefono','email','pec','codice_univoco',
                          'partita_iva','ragione_sociale','corriere_abituale','listino_standard',
                          'tipologia','insegna','note','giorno_chiusura','orari_consegna'];
  v_campo text;
  v_prima text;
  v_dopo  text;
  v_new   jsonb := to_jsonb(new);
  v_old   jsonb := to_jsonb(old);
BEGIN
  FOREACH v_campo IN ARRAY v_campi LOOP
    IF NOT (v_old ? v_campo) THEN CONTINUE; END IF;   -- colonna non presente: si salta
    v_prima := v_old ->> v_campo;
    v_dopo  := v_new ->> v_campo;
    IF v_prima IS NOT DISTINCT FROM v_dopo THEN CONTINUE; END IF;

    -- IL VUOTO NON CANCELLA IL PIENO.
    IF coalesce(btrim(coalesce(v_dopo, '')), '') = '' AND coalesce(btrim(v_prima), '') <> '' THEN
      v_new := jsonb_set(v_new, ARRAY[v_campo], to_jsonb(v_prima));
      CONTINUE;
    END IF;

    INSERT INTO clienti_override_storico (chiave, codice_cliente, campo, valore_prima, valore_dopo, operatore)
    VALUES (new.chiave, coalesce(new.codice_cliente, old.codice_cliente), v_campo, v_prima, v_dopo,
            coalesce(nullif(btrim(coalesce(new.operatore,'')), ''), 'non firmato'));
  END LOOP;

  RETURN jsonb_populate_record(new, v_new);
END; $$;

-- Prima di tutti gli altri (il nome inizia per 'aa'): quello che passa di qui
-- e' gia' ripulito dai vuoti distruttivi.
DROP TRIGGER IF EXISTS trg_aa_anagrafica_non_perde ON clienti_override;
CREATE TRIGGER trg_aa_anagrafica_non_perde
  BEFORE UPDATE ON clienti_override
  FOR EACH ROW EXECUTE FUNCTION anagrafica_non_perde_niente();

-- E IL METODO RESTA ALLINEATO DA SOLO.
-- Quando una fonte nuova porta un metodo per un cliente che non ne ha (un
-- ordine appena arrivato, una fattura appena emessa), la scheda si aggiorna
-- senza che nessuno debba ricordarsene. Chi ha gia' un metodo non si tocca.
CREATE OR REPLACE FUNCTION allinea_metodi_clienti()
RETURNS TABLE (schede_aggiornate int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n int;
BEGIN
  WITH da_scrivere AS (
    SELECT m.codice, coalesce(m.ragione_sociale,'') AS rag,
           chiave_anagrafica(nullif(m.piva,''), m.ragione_sociale) AS chiave,
           metodo_del_cliente(m.codice) AS metodo
    FROM clienti_master m
    WHERE EXISTS (SELECT 1 FROM ordini o WHERE o.id_cliente = m.codice)
      AND metodo_del_cliente(m.codice) IS NOT NULL
      AND chiave_anagrafica(nullif(m.piva,''), m.ragione_sociale) IS NOT NULL
  ), scritte AS (
    INSERT INTO clienti_override (chiave, codice_cliente, ragione_sociale, metodo_pagamento, operatore, aggiornato_il)
    SELECT chiave, codice, rag, metodo, 'allineamento', now() FROM da_scrivere
    ON CONFLICT (chiave) DO UPDATE
      SET metodo_pagamento = CASE WHEN metodo_pagamento_canonico(clienti_override.metodo_pagamento) IS NOT NULL
                                  THEN clienti_override.metodo_pagamento ELSE excluded.metodo_pagamento END,
          codice_cliente = coalesce(clienti_override.codice_cliente, excluded.codice_cliente)
    WHERE metodo_pagamento_canonico(clienti_override.metodo_pagamento) IS NULL
    RETURNING 1
  )
  SELECT count(*)::int INTO v_n FROM scritte;

  UPDATE ordini o SET metodo_pagamento = metodo_del_cliente(o.id_cliente)
   WHERE coalesce(o.archiviato,false) = false AND coalesce(o.ddt_numero,'') = ''
     AND metodo_pagamento_canonico(o.metodo_pagamento) IS NULL
     AND metodo_del_cliente(o.id_cliente) IS NOT NULL;

  RETURN QUERY SELECT v_n;
END; $$;

GRANT EXECUTE ON FUNCTION allinea_metodi_clienti() TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
