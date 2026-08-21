-- Un ordine DA PREPARARE non si archivia. Mai, da nessuna strada.
--
-- COSA E' SUCCESSO (21/08/2026). Il corriere non e' passato, i DDT della notte
-- sono stati riportati indietro, e per due volte cinque di quegli ordini sono
-- tornati archiviati da soli nel giro di pochi secondi. Non li toccava nessuno:
-- l'archiviazione automatica dell'app gira a ogni apertura, e i telefoni e i
-- computer del magazzino hanno in memoria la versione precedente del programma,
-- quella senza la guardia. Correggere il programma non basta finche' qualcuno
-- lo tiene aperto da ieri.
--
-- Questo controllo sta nel DATABASE, che e' l'unico posto dove passano tutti:
-- l'app aggiornata, l'app vecchia rimasta aperta, il lavoro notturno e chiunque
-- scriva da fuori.
--
-- La regola in se' e' sana a prescindere dall'incidente: archiviare vuol dire
-- che la merce e' uscita, e un ordine ancora DA PREPARARE non e' uscito. Il giro
-- normale passa per Preparato e Spedito, quindi non tocca niente di legittimo.
CREATE OR REPLACE FUNCTION da_preparare_non_si_archivia() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.archiviato IS TRUE
     AND COALESCE(OLD.archiviato, false) IS FALSE
     AND lower(btrim(COALESCE(NEW.stato, ''))) = 'da preparare' THEN
    RAISE EXCEPTION
      'Ordine % e'' ancora DA PREPARARE: non si archivia. La merce non e'' uscita.',
      NEW.id_ordine;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_da_preparare_non_si_archivia ON ordini;
CREATE TRIGGER trg_da_preparare_non_si_archivia
  BEFORE UPDATE OF archiviato ON ordini
  FOR EACH ROW EXECUTE FUNCTION da_preparare_non_si_archivia();
