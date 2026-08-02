-- Coda degli invii dei DDT verso Sibill.
--
-- Quando un ordine viene spedito con un numero di DDT, oggi finisce nel
-- Cashflow (v_ddt_da_fatturare). Da qui in avanti deve finire ANCHE in Sibill.
-- Questa tabella e' la coda: una riga per ordine, con dentro il payload
-- costruito e l'esito. Serve a poter rimandare quello che fallisce senza
-- perdere niente, e a non mandare due volte lo stesso DDT.
--
-- L'invio vero e' SPENTO finche' Luca non conferma il formato definitivo.
-- Con l'invio spento la riga si crea lo stesso, con stato 'da_inviare' e il
-- payload gia' pronto: cosi' si vede esattamente cosa partirebbe.

CREATE TABLE IF NOT EXISTS ddt_sibill_invii (
  id             bigserial PRIMARY KEY,
  id_ordine      text NOT NULL,
  ddt_numero     text NOT NULL,
  ddt_data       date,
  cliente        text,
  cliente_piva   text,
  importo        numeric(14,2),

  -- 'da_inviare' → in coda | 'inviato' → Sibill ha accettato
  -- 'errore'     → rifiutato, vedi errore | 'annullato' → non va mandato
  stato          text NOT NULL DEFAULT 'da_inviare',

  -- Il corpo esatto che partirebbe, in formato fattura elettronica FPR12
  -- JSON (lo schema di POST /companies/{id}/documents/invoice). Salvato
  -- sempre, anche a invio spento: e' il modo per controllarlo prima.
  payload        jsonb,

  -- Cosa ha risposto Sibill, buono o cattivo che sia.
  risposta       jsonb,
  documento_id   text,          -- id del documento creato in Sibill
  errore         text,
  tentativi      integer NOT NULL DEFAULT 0,
  ultimo_tentativo timestamptz,
  inviato_il     timestamptz,
  creato_il      timestamptz NOT NULL DEFAULT now()
);

-- Un DDT si manda una volta sola. Se serve rimandarlo si cambia stato,
-- non si crea una riga nuova.
CREATE UNIQUE INDEX IF NOT EXISTS ddt_sibill_invii_uq
  ON ddt_sibill_invii (id_ordine);
CREATE INDEX IF NOT EXISTS ddt_sibill_invii_stato
  ON ddt_sibill_invii (stato, creato_il);

ALTER TABLE ddt_sibill_invii ENABLE ROW LEVEL SECURITY;

-- L'app puo' vedere lo stato dell'invio (serve mostrare "inviato a Sibill"
-- accanto al DDT) e puo' accodare. Non puo' invece dichiarare inviato
-- qualcosa: lo stato finale lo scrive solo la Edge Function col service role.
DROP POLICY IF EXISTS ddt_sibill_read ON ddt_sibill_invii;
CREATE POLICY ddt_sibill_read ON ddt_sibill_invii FOR SELECT USING (true);
DROP POLICY IF EXISTS ddt_sibill_enqueue ON ddt_sibill_invii;
CREATE POLICY ddt_sibill_enqueue ON ddt_sibill_invii FOR INSERT
  WITH CHECK (stato = 'da_inviare');

-- Vista comoda: cosa e' rimasto indietro.
CREATE OR REPLACE VIEW v_ddt_sibill_da_inviare AS
SELECT i.*, o.stato AS stato_ordine, o.archiviato
FROM ddt_sibill_invii i
JOIN ordini o ON o.id_ordine = i.id_ordine
WHERE i.stato IN ('da_inviare', 'errore')
ORDER BY i.creato_il;

-- Accodamento automatico. Non lo mettiamo nell'app: il trigger scatta
-- qualunque sia la strada con cui l'ordine diventa spedito (app, correzione a
-- mano, script), cosi' non si puo' dimenticare un DDT.
CREATE OR REPLACE FUNCTION accoda_ddt_per_sibill() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  -- Serve un DDT vero e lo stato spedito (o archiviato, che e' il dopo).
  IF COALESCE(TRIM(NEW.ddt_numero), '') = '' THEN RETURN NEW; END IF;
  IF lower(COALESCE(NEW.stato, '')) <> 'spedito' AND NEW.archiviato IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  INSERT INTO ddt_sibill_invii (id_ordine, ddt_numero, ddt_data, cliente, cliente_piva, importo)
  SELECT NEW.id_ordine,
         TRIM(NEW.ddt_numero),
         COALESCE(NEW.data_preparato, NEW.data_ordine, CURRENT_DATE)::date,
         NEW.cliente,
         g.piva,
         NEW.totale_imponibile
  FROM (SELECT 1) x
  LEFT JOIN clienti_gestionale g ON g.codice_cliente = NEW.id_cliente
  ON CONFLICT (id_ordine) DO NOTHING;   -- un DDT si accoda una volta sola

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_accoda_ddt_sibill ON ordini;
CREATE TRIGGER trg_accoda_ddt_sibill
  AFTER INSERT OR UPDATE OF stato, ddt_numero, archiviato ON ordini
  FOR EACH ROW EXECUTE FUNCTION accoda_ddt_per_sibill();
