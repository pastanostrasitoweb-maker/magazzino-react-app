-- Aggancio tra il cliente scritto sull'ordine di magazzino e il cliente in fattura.
-- In magazzino spesso c'e' l'insegna ("MAMA EAT BORGO PIO"), in fattura la ragione
-- sociale ("GIOIA SRL"): il match automatico non basta, serve poterlo dire a mano.

CREATE TABLE IF NOT EXISTS clienti_storico_link (
  cliente_magazzino text PRIMARY KEY,   -- come scritto su ordini.cliente
  piva              text NOT NULL,      -- controparte nello storico fatture
  cliente_fattura   text,
  origine           text DEFAULT 'auto', -- 'auto' | 'manuale'
  creato_il         timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS clienti_storico_link_piva ON clienti_storico_link (piva);

ALTER TABLE clienti_storico_link ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS clienti_storico_link_read ON clienti_storico_link;
CREATE POLICY clienti_storico_link_read ON clienti_storico_link FOR SELECT USING (true);
-- L'app deve poter salvare il collegamento fatto a mano dall'operatore.
DROP POLICY IF EXISTS clienti_storico_link_write ON clienti_storico_link;
CREATE POLICY clienti_storico_link_write ON clienti_storico_link FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS clienti_storico_link_upd ON clienti_storico_link;
CREATE POLICY clienti_storico_link_upd ON clienti_storico_link FOR UPDATE USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS clienti_storico_link_del ON clienti_storico_link;
CREATE POLICY clienti_storico_link_del ON clienti_storico_link FOR DELETE USING (true);

-- Normalizzazione dei nomi: via la citta' dopo il separatore, via tutto cio' che
-- non e' lettera o numero. "LAGABI s.r.l. - ROMA" e "LAGABI SRL" collassano uguali.
CREATE OR REPLACE FUNCTION norm_nome(t text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT regexp_replace(upper(split_part(coalesce(t, ''), '·', 1)), '[^A-Z0-9]', '', 'g')
$$;

-- Precarica i collegamenti sicuri: nome identico, oppure uno prefisso dell'altro
-- ma con UNA sola controparte candidata (se sono due, meglio chiedere).
INSERT INTO clienti_storico_link (cliente_magazzino, piva, cliente_fattura, origine)
SELECT o.cliente, s.piva, s.cliente, 'auto'
FROM (SELECT DISTINCT cliente FROM ordini WHERE coalesce(cliente,'') <> '') o
CROSS JOIN LATERAL (
  SELECT x.piva, x.cliente
  FROM (SELECT DISTINCT piva, cliente FROM storico_cliente_articolo) x
  WHERE norm_nome(x.cliente) = norm_nome(o.cliente)
     OR (length(norm_nome(o.cliente)) >= 6 AND
         (norm_nome(x.cliente) LIKE norm_nome(o.cliente) || '%'
          OR norm_nome(o.cliente) LIKE norm_nome(x.cliente) || '%'))
) s
WHERE (
  SELECT count(DISTINCT x.piva)
  FROM (SELECT DISTINCT piva, cliente FROM storico_cliente_articolo) x
  WHERE norm_nome(x.cliente) = norm_nome(o.cliente)
     OR (length(norm_nome(o.cliente)) >= 6 AND
         (norm_nome(x.cliente) LIKE norm_nome(o.cliente) || '%'
          OR norm_nome(o.cliente) LIKE norm_nome(x.cliente) || '%'))
) = 1
ON CONFLICT (cliente_magazzino) DO NOTHING;
