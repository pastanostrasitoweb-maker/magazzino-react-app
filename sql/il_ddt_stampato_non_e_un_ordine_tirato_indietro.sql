-- IL DDT STAMPATO NON E' UN ORDINE TIRATO INDIETRO.
--
-- Luca, 22/09/2026: "possibile che sono ancora in standby da preparati anche se
-- abbiamo mandato in archiviati e spediti?" e "il flusso e' semplice: preparato,
-- si genera DDT dal bottone, da quel momento in poi va avanti in spedito e poi
-- archiviato. E' sempre stato cosi'".
--
-- COM'ERA. Questa funzione saltava ogni ordine con un numero di DDT, col
-- commento "tirato indietro a mano: il numero lo stacca solo l'archiviazione".
-- LA PREMESSA ERA SBAGLIATA: il numero lo stacca la RPC assegna_numero_ddt,
-- chiamata dal tasto "Genera DDT" quando si stampa la bolla, PRIMA
-- dell'archiviazione. Il trigger ddt_alla_spedizione e' solo la rete per chi
-- archivia senza aver stampato.
--
-- Conseguenza: siccome nel flusso vero la bolla si stampa sempre, quella guardia
-- escludeva TUTTI gli ordini, e l'archiviazione notturna non chiudeva piu'
-- niente. Il 22/09 erano fermi 22 ordini, i piu' vecchi dal 04/09.
--
-- PERCHE' TOGLIERLA NON RIAPRE IL CASO DEL 21/08 (corriere non passato, DDT
-- della notte riportati in Preparati). Due ragioni indipendenti:
--   1. chi tira indietro un ordine lo rimette in "Da preparare", e il filtro
--      sullo stato qui sotto lo esclude gia';
--   2. un ordine ARCHIVIATO non si puo' piu' disarchiviare: ci pensa il trigger
--      spedito_non_torna_indietro, che alza eccezione. Lo scenario che quella
--      guardia proteggeva non puo' piu' verificarsi.
--
-- Restano in piedi i cancelli che riguardano i soldi e la merce: colli,
-- metodo di pagamento, IVA, prezzo, prezzo concordato con l'agente.
CREATE OR REPLACE FUNCTION archive_old_prepared_orders()
RETURNS integer
LANGUAGE plpgsql
-- SECURITY DEFINER E search_path VANNO RIMESSI OGNI VOLTA (22/09/2026).
-- CREATE OR REPLACE non eredita niente: riscrivendo la funzione senza queste
-- due righe l'avevo trasformata in SECURITY INVOKER, cioe' girava coi permessi
-- di chi la chiama (anon compreso, che ha l'EXECUTE). E un SECURITY DEFINER
-- senza search_path fisso e' la strada classica per farsi eseguire una
-- funzione altrui: le due righe viaggiano sempre insieme.
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_count int;
BEGIN
  WITH archived AS (
    UPDATE ordini o SET archiviato = true
     WHERE lower(btrim(o.stato)) = 'preparato'
       AND (o.archiviato IS NULL OR o.archiviato = false)
       AND o.data_preparato < date_trunc('day', now() AT TIME ZONE 'Europe/Rome')
       -- 1. i colli li conferma chi spedisce
       AND (o.colli IS NOT NULL
            OR coalesce(to_char(coalesce(o.data_ordine, o.data_preparato), 'YYYY-MM-DD'), '') < '2026-08-17')
       -- 2. il pagamento deve dire quando si incassa
       AND (metodo_pagamento_canonico(metodo_pagamento_effettivo(o.id_ordine)) IS NOT NULL
            OR coalesce(to_char(coalesce(o.data_ordine, o.data_preparato), 'YYYY-MM-DD'), '') < '2026-08-03'
            OR (o.campionatura IS TRUE AND coalesce(o.totale_imponibile, 0) = 0))
     RETURNING 1)
  SELECT count(*) INTO v_count FROM archived;
  RETURN v_count;
END;
$function$;

-- UN ORDINE MALATO NON FERMA GLI ALTRI (22/09/2026).
-- La versione sopra archivia con un solo UPDATE: basta un ordine che un trigger
-- rifiuta (IVA mancante, prezzo mancante, prezzo da autorizzare) e l'intera
-- istruzione fallisce, quindi NON si archivia nessuno. E' lo stesso difetto
-- corretto il 21/09 dentro l'app (archivePreparedOrders ripiega uno per uno) e
-- mai qui: il giro notturno e' l'altra strada, e faceva ancora tutto o niente.
-- Provato il 22/09: due righe "cartone bollinato" senza aliquota bloccavano
-- l'archiviazione di tutti e quindici i Preparati.
CREATE OR REPLACE FUNCTION archive_old_prepared_orders()
RETURNS integer
LANGUAGE plpgsql
-- SECURITY DEFINER E search_path VANNO RIMESSI OGNI VOLTA (22/09/2026).
-- CREATE OR REPLACE non eredita niente: riscrivendo la funzione senza queste
-- due righe l'avevo trasformata in SECURITY INVOKER, cioe' girava coi permessi
-- di chi la chiama (anon compreso, che ha l'EXECUTE). E un SECURITY DEFINER
-- senza search_path fisso e' la strada classica per farsi eseguire una
-- funzione altrui: le due righe viaggiano sempre insieme.
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_count   int := 0;
  v_ordine  record;
  v_errore  text;
BEGIN
  FOR v_ordine IN
    SELECT o.id_ordine FROM ordini o
     WHERE lower(btrim(o.stato)) = 'preparato'
       AND (o.archiviato IS NULL OR o.archiviato = false)
       AND o.data_preparato < date_trunc('day', now() AT TIME ZONE 'Europe/Rome')
       AND (o.colli IS NOT NULL
            OR coalesce(to_char(coalesce(o.data_ordine, o.data_preparato), 'YYYY-MM-DD'), '') < '2026-08-17')
       AND (metodo_pagamento_canonico(metodo_pagamento_effettivo(o.id_ordine)) IS NOT NULL
            OR coalesce(to_char(coalesce(o.data_ordine, o.data_preparato), 'YYYY-MM-DD'), '') < '2026-08-03'
            OR (o.campionatura IS TRUE AND coalesce(o.totale_imponibile, 0) = 0))
     ORDER BY o.data_preparato
  LOOP
    BEGIN
      UPDATE ordini SET archiviato = true WHERE id_ordine = v_ordine.id_ordine;
      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      -- CHI RESTA INDIETRO SI LEGGE. Un ordine che il database rifiuta non
      -- sparisce in silenzio: il motivo finisce nel log, col nome dell'ordine.
      v_errore := SQLERRM;
      -- UNA RIGA PER ORDINE, NON UNA PER NOTTE. Senza la cancellazione questa
      -- tabella accumulava lo stesso ordine tutte le notti e diventava
      -- illeggibile: non si distingueva piu' cosa e' ancora rotto da cosa e'
      -- stato sistemato. Qui resta sempre e solo l'ultimo motivo noto.
      DELETE FROM archiviazione_notturna_scarti WHERE id_ordine = v_ordine.id_ordine;
      INSERT INTO archiviazione_notturna_scarti (id_ordine, motivo)
        VALUES (v_ordine.id_ordine, left(v_errore, 500));
    END;
  END LOOP;
  RETURN v_count;
END;
$function$;

CREATE TABLE IF NOT EXISTS archiviazione_notturna_scarti (
  id         bigserial PRIMARY KEY,
  id_ordine  text NOT NULL,
  motivo     text NOT NULL,
  quando     timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE archiviazione_notturna_scarti IS
  'Ordini che il giro notturno non e'' riuscito ad archiviare, col motivo detto dal database. Una riga per ordine: ogni giro riscrive la sua. La riga resta anche dopo che l''ordine e'' stato archiviato a mano, quindi si legge insieme allo stato dell''ordine.';
GRANT SELECT ON archiviazione_notturna_scarti TO anon, authenticated;
GRANT INSERT ON archiviazione_notturna_scarti TO service_role;
GRANT USAGE, SELECT ON SEQUENCE archiviazione_notturna_scarti_id_seq TO service_role;

-- E QUANDO L'ORDINE SI ARCHIVIA, LA SEGNALAZIONE SE NE VA.
-- Altrimenti la tabella elenca per sempre ordini gia' sistemati e chi la
-- guarda non sa piu' cosa e' aperto davvero. Vale [[feedback-un-controllo-e-un-controllo]].
CREATE OR REPLACE FUNCTION scarto_via_quando_archiviato()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  IF NEW.archiviato IS TRUE AND coalesce(OLD.archiviato, false) IS FALSE THEN
    DELETE FROM archiviazione_notturna_scarti WHERE id_ordine = NEW.id_ordine;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_zz_scarto_via_quando_archiviato ON public.ordini;
CREATE TRIGGER trg_zz_scarto_via_quando_archiviato
  AFTER UPDATE OF archiviato ON public.ordini
  FOR EACH ROW EXECUTE FUNCTION scarto_via_quando_archiviato();
