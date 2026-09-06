-- I DOCUMENTI NON STANNO PIU' IN VETRINA.
--
-- Review avversariale del 02/09/2026: il bucket `documenti` era PUBBLICO e la
-- policy dava ad anon ogni operazione su ogni oggetto. Chi indovinava o
-- otteneva un indirizzo poteva leggere DDT e fatture senza login, e perfino
-- sovrascriverli: un documento alterato sarebbe poi passato per l'originale.
--
-- Oggi il danno e' zero perche' dentro non c'e' ancora nessun file, ed e'
-- proprio il momento buono per chiudere: si fa adesso che non rompe niente,
-- non dopo il primo DDT caricato.
--
-- Cosa cambia: bucket PRIVATO (niente piu' indirizzi pubblici che funzionano),
-- e ad anon restano solo caricare e leggere DENTRO quel bucket. Sovrascrivere e
-- cancellare non si puo' piu': un documento emesso non si tocca.
-- L'app genera link firmati a scadenza invece degli indirizzi eterni.
UPDATE storage.buckets SET public = false WHERE id = 'documenti';

DROP POLICY IF EXISTS documenti_all ON storage.objects;
DROP POLICY IF EXISTS documenti_upload ON storage.objects;
DROP POLICY IF EXISTS documenti_lettura ON storage.objects;

CREATE POLICY documenti_upload ON storage.objects
  FOR INSERT TO anon WITH CHECK (bucket_id = 'documenti');

CREATE POLICY documenti_lettura ON storage.objects
  FOR SELECT TO anon USING (bucket_id = 'documenti');
