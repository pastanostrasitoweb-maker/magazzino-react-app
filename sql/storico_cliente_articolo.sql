-- Storico articoli/prezzi per cliente, ricostruito dalle fatture elettroniche 2025-2026.
-- Serve al pannello "Gia' ordinato da questo cliente" in fase di inserimento ordine:
-- mostra a colpo d'occhio cosa quel cliente ha gia' comprato e a che prezzo,
-- inclusi gli articoli fatti ad hoc per lui che in magazzino non esistono.
-- Il prezzo proposto e' sempre modificabile a mano: qui e' solo un suggerimento.

CREATE TABLE IF NOT EXISTS storico_cliente_articolo (
  id              bigserial PRIMARY KEY,
  piva            text NOT NULL,
  cliente         text NOT NULL,
  codice          text NOT NULL DEFAULT '',
  descrizione     text NOT NULL,
  unita_misura    text,
  ultimo_prezzo   numeric(12,4),
  ultimo_sconto   numeric(6,2) DEFAULT 0,
  ultimo_ordine   date,
  primo_ordine    date,
  volte           integer DEFAULT 0,
  qta_totale      numeric(14,2),
  valore_totale   numeric(14,2),
  prezzo_medio    numeric(12,4),
  prezzo_min      numeric(12,4),
  prezzo_max      numeric(12,4),
  fonte           text DEFAULT 'fatture-sibill',
  aggiornato_il   timestamptz DEFAULT now()
);

-- Una riga per cliente + articolo: il reload sovrascrive invece di duplicare.
CREATE UNIQUE INDEX IF NOT EXISTS storico_cli_art_uq
  ON storico_cliente_articolo (piva, codice, lower(descrizione));
CREATE INDEX IF NOT EXISTS storico_cli_art_piva ON storico_cliente_articolo (piva);
CREATE INDEX IF NOT EXISTS storico_cli_art_cod  ON storico_cliente_articolo (codice);

-- Stessa cosa lato acquisti: cosa compriamo da chi e a quanto.
CREATE TABLE IF NOT EXISTS storico_fornitore_articolo (
  id              bigserial PRIMARY KEY,
  piva            text NOT NULL,
  fornitore       text NOT NULL,
  codice          text NOT NULL DEFAULT '',
  descrizione     text NOT NULL,
  unita_misura    text,
  ultimo_prezzo   numeric(12,4),
  ultimo_acquisto date,
  primo_acquisto  date,
  volte           integer DEFAULT 0,
  qta_totale      numeric(14,2),
  spesa_totale    numeric(14,2),
  prezzo_medio    numeric(12,4),
  prezzo_min      numeric(12,4),
  prezzo_max      numeric(12,4),
  fonte           text DEFAULT 'fatture-sibill',
  aggiornato_il   timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS storico_forn_art_uq
  ON storico_fornitore_articolo (piva, codice, lower(descrizione));
CREATE INDEX IF NOT EXISTS storico_forn_art_piva ON storico_fornitore_articolo (piva);

-- Lettura libera per le app (dato commerciale interno, nessuna credenziale).
ALTER TABLE storico_cliente_articolo   ENABLE ROW LEVEL SECURITY;
ALTER TABLE storico_fornitore_articolo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS storico_cli_art_read ON storico_cliente_articolo;
CREATE POLICY storico_cli_art_read ON storico_cliente_articolo FOR SELECT USING (true);

DROP POLICY IF EXISTS storico_forn_art_read ON storico_fornitore_articolo;
CREATE POLICY storico_forn_art_read ON storico_fornitore_articolo FOR SELECT USING (true);

-- Scrittura solo dal caricamento massivo (service role): nessuna policy di INSERT/UPDATE
-- per il ruolo anon, cosi' l'app non puo' sporcare lo storico.
