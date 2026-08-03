-- Policy RLS sulla tabella `clienti` (anagrafica dell'app).
--
-- PERCHE' ESISTE QUESTO FILE
-- Il 03/08/2026 si e' scoperto che `clienti` aveva RLS **attiva con zero
-- policy**: in Postgres questo non vuol dire "aperta", vuol dire "chiusa a
-- tutti". Il pulsante "+ Aggiungi cliente" falliva sempre con
--   new row violates row-level security policy for table "clienti"
-- e lo stesso valeva per la modifica e per il "Disattiva" (che e' una update).
-- Era l'unica tabella operativa in questo stato: `ordini`, `righe_ordine`,
-- `prodotti` e `lotti` hanno RLS spenta del tutto.
--
-- Qui si allinea `clienti` al modello gia' usato da `clienti_master`: RLS
-- accesa con policy esplicite. Non e' piu' permissivo di com'e' il resto del
-- database oggi, ed e' piu' facile da stringere domani (basta cambiare il
-- `using`/`with check`) rispetto a una tabella con RLS spenta.
--
-- Nota: NON serve una policy di DELETE. L'app non cancella mai un cliente:
-- "Disattiva" scrive `attivo = false`, cosi' gli ordini storici che puntano a
-- quell'id_cliente non restano orfani.

ALTER TABLE clienti ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS clienti_read   ON clienti;
DROP POLICY IF EXISTS clienti_insert ON clienti;
DROP POLICY IF EXISTS clienti_update ON clienti;

CREATE POLICY clienti_read   ON clienti FOR SELECT USING (true);
CREATE POLICY clienti_insert ON clienti FOR INSERT WITH CHECK (true);
CREATE POLICY clienti_update ON clienti FOR UPDATE USING (true) WITH CHECK (true);
