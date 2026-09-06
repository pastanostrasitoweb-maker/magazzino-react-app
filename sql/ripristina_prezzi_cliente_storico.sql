-- RIPRISTINO di prezzi_cliente_storico, eliminata il 03/08/2026 perche' vuota
-- e non usata da nessuno (il suo lavoro lo fa storico_cliente_articolo, che
-- nasce dalle fatture Sibill).
--
-- Serve SOLO se un giorno arriva da GAMMA il web service coi prezzi delle
-- righe dei documenti, che era il motivo per cui era stata creata. In quel
-- caso, valutare prima se non convenga alimentare direttamente
-- storico_cliente_articolo invece di riaprire una seconda strada.

CREATE TABLE IF NOT EXISTS prezzi_cliente_storico (
  id_cliente      text          NOT NULL,
  codice_articolo text          NOT NULL,
  data_doc        date          NOT NULL,
  prezzo_unitario numeric(12,4) NOT NULL,
  sconto_pct      numeric(5,2)  DEFAULT 0,
  um              text,
  documento       text,                         -- numero DDT/fattura di origine
  fonte           text          DEFAULT 'gestionale',
  PRIMARY KEY (id_cliente, codice_articolo, data_doc, documento)
);

CREATE INDEX IF NOT EXISTS prezzi_cliente_storico_lookup_idx
  ON prezzi_cliente_storico (id_cliente, codice_articolo, data_doc DESC);

ALTER TABLE prezzi_cliente_storico ENABLE ROW LEVEL SECURITY;
CREATE POLICY prezzi_storico_lettura ON prezzi_cliente_storico FOR SELECT USING (true);
