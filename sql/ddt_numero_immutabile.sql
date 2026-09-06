-- Il numero DDT, una volta assegnato, non si tocca più.
--
-- REGOLA DI LUCA (04/08/2026): "una volta generato un DDT col suo numero,
-- anche se l'ordine viene riportato da preparare e modificato per qualsiasi
-- motivo, non cambiare il numero. Dai solo l'avviso se l'ordine viene
-- cancellato e il DDT era già stato emesso: avvisa che ci sarà un buco".
--
-- Il numero è su un foglio che sta viaggiando col camion o è già in mano al
-- cliente. Riportare indietro l'ordine si può, modificarlo si può: quello che
-- non si può è riscrivere o cancellare il numero, perché avremmo due verità
-- diverse per la stessa consegna.

CREATE OR REPLACE FUNCTION ddt_numero_non_si_tocca() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE vecchio text := NULLIF(TRIM(COALESCE(OLD.ddt_numero, '')), '');
        nuovo   text := NULLIF(TRIM(COALESCE(NEW.ddt_numero, '')), '');
BEGIN
  IF vecchio IS NULL THEN RETURN NEW; END IF;      -- non ne aveva: libero
  IF nuovo IS NOT DISTINCT FROM vecchio THEN RETURN NEW; END IF;
  IF nuovo IS NULL THEN
    RAISE EXCEPTION
      'Il DDT % e'' gia'' stato emesso per l''ordine %: il numero non si cancella.',
      vecchio, OLD.id_ordine;
  END IF;
  RAISE EXCEPTION
    'L''ordine % ha gia'' il DDT %: non si puo'' cambiare in %.',
    OLD.id_ordine, vecchio, nuovo;
END;
$$;

DROP TRIGGER IF EXISTS trg_ddt_numero_non_si_tocca ON ordini;
CREATE TRIGGER trg_ddt_numero_non_si_tocca
  BEFORE UPDATE OF ddt_numero ON ordini
  FOR EACH ROW EXECUTE FUNCTION ddt_numero_non_si_tocca();

-- ------------------------------------------------------------
-- I numeri rimasti senza ordine
-- ------------------------------------------------------------
-- Un buco che nessuno sa spiegare è il problema; un buco con accanto data,
-- cliente e motivo è un fatto. Al commercialista che chiede "e il 1841?" si
-- risponde, invece di indagare.
CREATE TABLE IF NOT EXISTS ddt_annullati (
  ddt_numero   text PRIMARY KEY,
  id_ordine    text,
  cliente      text,
  ddt_data     date,
  importo      numeric,
  annullato_il timestamptz NOT NULL DEFAULT now(),
  motivo       text
);
ALTER TABLE ddt_annullati ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ddt_annullati_all ON ddt_annullati;
CREATE POLICY ddt_annullati_all ON ddt_annullati FOR ALL USING (true) WITH CHECK (true);

-- Scatta da solo alla cancellazione: se dipendesse dall'app, basterebbe uno
-- script o una correzione a mano per perdere la traccia.
CREATE OR REPLACE FUNCTION registra_ddt_annullato() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF COALESCE(TRIM(OLD.ddt_numero), '') = '' THEN RETURN OLD; END IF;
  INSERT INTO ddt_annullati (ddt_numero, id_ordine, cliente, ddt_data, importo, motivo)
  VALUES (TRIM(OLD.ddt_numero), OLD.id_ordine, OLD.cliente,
          COALESCE(OLD.data_preparato, OLD.data_ordine)::date, OLD.totale_imponibile,
          'ordine eliminato')
  ON CONFLICT (ddt_numero) DO NOTHING;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_registra_ddt_annullato ON ordini;
CREATE TRIGGER trg_registra_ddt_annullato
  BEFORE DELETE ON ordini
  FOR EACH ROW EXECUTE FUNCTION registra_ddt_annullato();

-- ------------------------------------------------------------
-- Un numero bruciato resta bruciato
-- ------------------------------------------------------------
-- Senza questo, un numero rimasto senza ordine tornava libero e veniva
-- riusato: DUE documenti diversi con lo stesso numero, che è molto peggio di
-- un buco. Il prossimo numero guarda anche gli annullati.
CREATE OR REPLACE FUNCTION prossimo_numero_ddt() RETURNS int
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT GREATEST(
    COALESCE((SELECT MAX(ddt_numero::int) FROM ordini WHERE ddt_numero ~ '^[0-9]+$'), 0),
    COALESCE((SELECT MAX(ddt_numero::int) FROM ddt_annullati WHERE ddt_numero ~ '^[0-9]+$'), 0)
  ) + 1;
$$;
GRANT EXECUTE ON FUNCTION prossimo_numero_ddt() TO anon, authenticated;
