-- Indirizzi strutturati e destinazioni multiple.
--
-- REGOLE DI LUCA (03/08/2026):
--   1. I campi indirizzo devono essere specifici: via, numero civico, localita',
--      provincia e CAP. Sia per la SEDE LEGALE sia per la DESTINAZIONE MERCI.
--   2. Le destinazioni possono essere piu' di una: un cliente puo' avere 3-4
--      negozi, e chi spedisce deve poter scegliere dove mandare la merce.
--
-- PERCHE' SPEZZATI. Finora l'indirizzo era una stringa unica ("VIA AQUARELLA 4
-- TREVIGNANO ROMANO"): dentro c'erano via, civico e pure il comune, tutti
-- appiccicati. Cosi' non si puo' fare una fattura elettronica (lo SdI vuole
-- Indirizzo e NumeroCivico separati), non si puo' ordinare per CAP, e chi
-- guarda il DDT legge il comune due volte.

-- ---------- 1. Sede legale, spezzata ----------
ALTER TABLE clienti_override ADD COLUMN IF NOT EXISTS sede_via        text;
ALTER TABLE clienti_override ADD COLUMN IF NOT EXISTS sede_civico     text;
ALTER TABLE clienti_override ADD COLUMN IF NOT EXISTS sede_cap        text;
ALTER TABLE clienti_override ADD COLUMN IF NOT EXISTS sede_localita   text;
ALTER TABLE clienti_override ADD COLUMN IF NOT EXISTS sede_provincia  text;
ALTER TABLE clienti_override ADD COLUMN IF NOT EXISTS sede_nazione    text;

COMMENT ON COLUMN clienti_override.sede_legale IS
  'Vecchio campo unico, tenuto per non rompere niente. Il dato buono sta in sede_via + sede_civico.';

-- ---------- 2. Destinazioni merci, quante ne servono ----------
CREATE TABLE IF NOT EXISTS clienti_destinazioni (
  id              text PRIMARY KEY,
  codice_cliente  text NOT NULL,
  -- Come la chiama chi spedisce: "Negozio Centro", "Magazzino", "Sede".
  etichetta       text NOT NULL DEFAULT 'Sede',
  -- Se il negozio ha un'insegna diversa dalla ragione sociale, va sul DDT:
  -- l'autista cerca l'insegna sulla vetrina, non la ragione sociale.
  insegna         text,
  via             text,
  civico          text,
  cap             text,
  localita        text,
  provincia       text,
  nazione         text NOT NULL DEFAULT 'IT',
  -- Questi tre cambiano da negozio a negozio, non sono del cliente:
  -- il punto vendita di via Roma chiude il lunedi', quello del centro no.
  telefono        text,
  orari_consegna  text,
  giorno_chiusura text,
  note            text,
  -- Quella proposta quando si carica un ordine. Una sola per cliente.
  predefinita     boolean NOT NULL DEFAULT false,
  attiva          boolean NOT NULL DEFAULT true,
  fonte           text,
  creato_il       timestamptz NOT NULL DEFAULT now(),
  aggiornato_il   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dest_cliente ON clienti_destinazioni (codice_cliente) WHERE attiva;
-- Una sola predefinita per cliente: senza questo vincolo, due predefinite e
-- l'app ne sceglie una a caso, cioe' la merce puo' partire per il negozio
-- sbagliato senza che nessuno abbia sbagliato niente.
CREATE UNIQUE INDEX IF NOT EXISTS idx_dest_una_predefinita
  ON clienti_destinazioni (codice_cliente) WHERE predefinita AND attiva;

ALTER TABLE clienti_destinazioni ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dest_all ON clienti_destinazioni;
CREATE POLICY dest_all ON clienti_destinazioni FOR ALL USING (true) WITH CHECK (true);

-- ---------- 3. L'ordine ricorda DOVE va ----------
ALTER TABLE ordini ADD COLUMN IF NOT EXISTS id_destinazione text;
COMMENT ON COLUMN ordini.id_destinazione IS
  'Quale destinazione del cliente (clienti_destinazioni). Vuoto = la predefinita.';

-- ---------- 4. Vista comoda: indirizzo gia' composto ----------
CREATE OR REPLACE VIEW v_destinazioni AS
SELECT d.*,
       TRIM(BOTH ' ' FROM COALESCE(d.via, '') || ' ' || COALESCE(d.civico, '')) AS riga_via,
       TRIM(BOTH ' ' FROM COALESCE(d.cap, '') || ' ' || COALESCE(d.localita, '') ||
            CASE WHEN COALESCE(d.provincia, '') <> '' THEN ' (' || d.provincia || ')' ELSE '' END) AS riga_localita,
       (SELECT count(*) FROM clienti_destinazioni x
         WHERE x.codice_cliente = d.codice_cliente AND x.attiva) AS quante_per_cliente
FROM clienti_destinazioni d
WHERE d.attiva;
