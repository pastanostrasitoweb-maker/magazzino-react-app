-- Il lavoro notturno archivia con le stesse regole del bottone.
--
-- COSA E' SUCCESSO (21/08/2026). Il corriere non e' passato a caricare e i 18
-- ordini archiviati alle 02:30 sono stati riportati in Preparati. Guardandoli si
-- e' visto che DODICI erano usciti col numero di colli mai confermato: il
-- cancello che Luca aveva chiesto ("chi spedisce ha il bancale davanti e sa
-- quanti colli partono") vive nell'app, e il lavoro notturno gira nel database,
-- dove quel cancello non c'era. Stessa cosa per il metodo di pagamento: il
-- controllo che impedisce di aprire a Cashflow una scadenza stimata stava solo
-- da una parte.
--
-- Un controllo che vale solo su una delle due strade non e' un controllo: e'
-- una cortesia che si applica quando capita.
--
-- Le tre condizioni sono le stesse della funzione dell'app (archivePreparedOrders):
--   1. il numero di DDT non c'e' ancora  -> se c'e', l'ordine e' stato tirato
--      indietro a mano e si lascia dov'e'
--   2. i colli sono confermati           -> dagli ordini del 17/08 in poi, come
--      nell'app: l'archivio ne ha 202 senza conferma e non si rincorrono
--   3. il metodo di pagamento e' leggibile -> dagli ordini del 03/08 in poi, con
--      l'esenzione delle campionature gratuite (a imponibile zero non c'e'
--      nessuna scadenza da sbagliare)
--
-- Gli ordini che non passano NON si perdono: restano in Preparati, esattamente
-- come fa l'app, e si archiviano appena qualcuno mette a posto quello che manca.
CREATE OR REPLACE FUNCTION archive_old_prepared_orders() RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count int;
BEGIN
  WITH archived AS (
    UPDATE ordini o SET archiviato = true
     WHERE lower(btrim(o.stato)) = 'preparato'
       AND (o.archiviato IS NULL OR o.archiviato = false)
       AND o.data_preparato < date_trunc('day', now() AT TIME ZONE 'Europe/Rome')
       -- 1. tirato indietro a mano: il numero lo stacca solo l'archiviazione
       AND coalesce(btrim(o.ddt_numero), '') = ''
       -- 2. i colli li conferma chi spedisce
       AND (o.colli IS NOT NULL
            OR coalesce(to_char(coalesce(o.data_ordine, o.data_preparato), 'YYYY-MM-DD'), '') < '2026-08-17')
       -- 3. il pagamento deve dire quando si incassa
       AND (metodo_pagamento_canonico(metodo_pagamento_effettivo(o.id_ordine)) IS NOT NULL
            OR coalesce(to_char(coalesce(o.data_ordine, o.data_preparato), 'YYYY-MM-DD'), '') < '2026-08-03'
            OR (o.campionatura IS TRUE AND coalesce(o.totale_imponibile, 0) = 0))
     RETURNING 1)
  SELECT count(*) INTO v_count FROM archived;
  RETURN v_count;
END;
$$;
