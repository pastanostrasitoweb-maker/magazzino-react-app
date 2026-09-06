-- IL PREZZO DIVERSO SI SEGNALA, NON BLOCCA PER SEMPRE.
--
-- Luca, 31/08/2026: "risultano ancora fermi in Spediti ordini che non possono
-- essere archiviati perche' il prezzo e' diverso. Segnalalo ma non bloccarlo:
-- se ti diciamo ok, prosegui".
--
-- Il guardiano faceva il suo lavoro (fermare un documento con un prezzo che il
-- cliente non ha accettato), ma non aveva la porta d'uscita: una volta guardato
-- lo scostamento e deciso che va bene, non c'era modo di dirglielo, e l'ordine
-- restava fermo in eterno. Con la merce gia' partita, un ordine bloccato non
-- protegge piu' niente: la fattura semplicemente non si fa.
--
-- Adesso: blocca la PRIMA volta e dice cosa non torna; una persona guarda,
-- decide, e l'ok resta scritto col suo nome. Non e' un bypass silenzioso, e'
-- una decisione firmata che si puo' rileggere fra sei mesi.
ALTER TABLE ordini ADD COLUMN IF NOT EXISTS prezzo_ok_da text;
ALTER TABLE ordini ADD COLUMN IF NOT EXISTS prezzo_ok_il timestamptz;
ALTER TABLE ordini ADD COLUMN IF NOT EXISTS prezzo_ok_scarto numeric;

CREATE OR REPLACE FUNCTION prezzo_concordato_prima_di_archiviare()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_sovrapprezzo numeric;
  v_righe        int;
  v_dettaglio    text;
BEGIN
  IF NOT (new.archiviato IS TRUE AND coalesce(old.archiviato, false) IS FALSE) THEN
    RETURN new;
  END IF;

  -- GIA' AUTORIZZATO: qualcuno ha guardato e ha detto ok. Si passa.
  IF coalesce(btrim(new.prezzo_ok_da), '') <> '' THEN
    RETURN new;
  END IF;

  -- Si guardano SOLO le righe dove il cliente pagherebbe di piu'. Uno sconto
  -- concesso non e' un errore (regola Luca 26/08).
  SELECT count(*), coalesce(sum(scarto), 0),
         string_agg(codice || ' (+' || round(scarto, 2) || ' EUR)', '; ' ORDER BY scarto DESC)
    INTO v_righe, v_sovrapprezzo, v_dettaglio
    FROM v_prezzi_traditi
   WHERE id_ordine = new.id_ordine AND scarto > 0.50;

  IF v_righe > 0 THEN
    RAISE EXCEPTION
      'PREZZO_DA_AUTORIZZARE: % righe costano al cliente % EUR in piu'' del concordato con l''agente. %. '
      'Guarda e, se va bene cosi'', conferma: l''ordine si archivia e resta scritto chi ha deciso.',
      v_righe, round(v_sovrapprezzo, 2), v_dettaglio;
  END IF;
  RETURN new;
END;
$$;

-- L'OK SI DA' QUI, E PORTA UNA FIRMA. Ritorna quello che si sta autorizzando,
-- cosi' chi conferma vede il numero che sta accettando.
CREATE OR REPLACE FUNCTION autorizza_prezzo_ordine(p_id_ordine text, p_operatore text)
RETURNS TABLE (id_ordine text, righe int, sovrapprezzo numeric, dettaglio text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_righe int; v_sov numeric; v_det text; v_chi text;
BEGIN
  v_chi := coalesce(nullif(btrim(p_operatore), ''), 'non firmato');

  SELECT count(*), coalesce(sum(scarto), 0),
         string_agg(codice || ' (+' || round(scarto, 2) || ' EUR)', '; ' ORDER BY scarto DESC)
    INTO v_righe, v_sov, v_det
    FROM v_prezzi_traditi
   WHERE v_prezzi_traditi.id_ordine = p_id_ordine AND scarto > 0.50;

  UPDATE ordini o
     SET prezzo_ok_da = v_chi,
         prezzo_ok_il = now(),
         prezzo_ok_scarto = round(coalesce(v_sov, 0), 2)
   WHERE o.id_ordine = p_id_ordine;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ordine % inesistente', p_id_ordine; END IF;

  RETURN QUERY SELECT p_id_ordine, coalesce(v_righe, 0), round(coalesce(v_sov, 0), 2), coalesce(v_det, '');
END;
$$;

GRANT EXECUTE ON FUNCTION autorizza_prezzo_ordine(text, text) TO anon, authenticated;

-- CHI HA DETTO OK, SU COSA E QUANDO. Il registro delle decisioni: un prezzo
-- fuori accordo che passa non deve sparire dai radar solo perche' e' passato.
CREATE OR REPLACE VIEW v_prezzi_autorizzati AS
SELECT o.id_ordine, o.cliente, o.ddt_numero, o.data_ordine::date AS data,
       o.prezzo_ok_da AS autorizzato_da, o.prezzo_ok_il AS autorizzato_il,
       o.prezzo_ok_scarto AS sovrapprezzo_accettato
FROM ordini o
WHERE coalesce(btrim(o.prezzo_ok_da), '') <> ''
ORDER BY o.prezzo_ok_il DESC;

GRANT SELECT ON v_prezzi_autorizzati TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
