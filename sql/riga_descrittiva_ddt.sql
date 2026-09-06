-- Una riga descrittiva nel corpo del DDT, dopo l'ultimo articolo.
--
-- RICHIESTA DI LUCA (07/08/2026): "ho delle note che vanno in un determinato modo
-- per accettare la merce, e il miglior modo e' dare la possibilita' di inserire
-- una riga descrittiva che vada dopo l'ultimo articolo nel DDT. La possibilita'
-- di aggiungere la riga deve esserci quando l'ordine si trova in ordini, prima
-- ancora di essere preparato."
--
-- Sta sull'ORDINE e non sull'anagrafica del cliente: e' un'istruzione per QUESTA
-- consegna (un magazzino che accetta solo su pallet, un numero d'ordine del
-- cliente da riportare, un orario concordato per quella volta). La nota che vale
-- sempre per quel cliente esiste gia' ed e' clienti_override.note, che pure
-- finisce sul documento: sono due cose diverse e devono restare separate.
--
-- Una sola colonna, nessuna tabella nuova, nessun trigger: e' testo che viene
-- scritto da chi guarda l'ordine e letto da chi stampa il documento. Non entra in
-- nessun calcolo, quindi non puo' rompere niente di quello che c'e'.
ALTER TABLE ordini ADD COLUMN IF NOT EXISTS nota_ddt text;

COMMENT ON COLUMN ordini.nota_ddt IS
  'Riga descrittiva stampata nel corpo del DDT dopo l''ultimo articolo. Istruzione per questa consegna, non per il cliente in generale.';

NOTIFY pgrst, 'reload schema';
