-- IL CAP DELL'ORDINE E' QUELLO DOVE VA LA MERCE.
--
-- Segnalazione incrociata del 27/08/2026, verificata qui: su 28 ordini con una
-- sede di consegna scelta, 19 avevano `ordini.cap` diverso dal CAP di quella
-- sede e 13 in una zona completamente diversa. Il CAP arrivava dall'ANAGRAFICA
-- del cliente, non dalla destinazione: BLUSERENA quotata su Pescara mentre la
-- merce andava a Castellaneta Marina (TA), TRUFFLE ENJOY su Pontedera invece
-- che Campi Bisenzio (FI).
--
-- Il CAP non e' un dato descrittivo: la logistica ci calcola la tariffa del
-- corriere e la copertura del gelo (Stef si legge per provincia, BRT Fresh ha
-- la lista dei CAP serviti). Col CAP della sede legale il preventivo e' su una
-- tratta che non esiste, e il costo che si controlla in fattura e' un altro.
--
-- UN SOLO PRODUTTORE: si risolve qui, non in ogni app che rifa' il suo join.
-- Scelta una destinazione, il suo CAP diventa quello dell'ordine.
--
-- Cosa NON tocca:
--   - gli ordini ARCHIVIATI e quelli col numero DDT gia' staccato: la bolla
--     e' stampata e il documento non si riscrive (i conti di ieri restano
--     quelli di ieri);
--   - le destinazioni senza CAP: meglio il CAP dell'anagrafica che nessuno.
--     Quelle vanno completate in anagrafica, e si vedono nella vista in fondo.
CREATE OR REPLACE FUNCTION cap_dalla_destinazione()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_cap text;
BEGIN
  IF coalesce(btrim(new.id_destinazione), '') = '' THEN RETURN new; END IF;
  -- Documento gia' emesso: non si tocca.
  IF coalesce(new.archiviato, false) OR coalesce(btrim(new.ddt_numero), '') <> '' THEN
    RETURN new;
  END IF;

  SELECT nullif(btrim(d.cap), '') INTO v_cap
  FROM clienti_destinazioni d
  WHERE d.id = new.id_destinazione;

  IF v_cap IS NOT NULL THEN
    new.cap := v_cap;
  END IF;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS trg_cap_dalla_destinazione ON ordini;
CREATE TRIGGER trg_cap_dalla_destinazione
  BEFORE INSERT OR UPDATE OF id_destinazione ON ordini
  FOR EACH ROW EXECUTE FUNCTION cap_dalla_destinazione();

-- LE DESTINAZIONI SENZA CAP SI VEDONO. Senza CAP nessuno sa quanto costa
-- portarcela, e il buco non e' dell'ordine ma dell'anagrafica del negozio.
CREATE OR REPLACE VIEW v_destinazioni_senza_cap AS
SELECT d.id, d.codice_cliente, d.etichetta, d.localita, d.provincia,
       count(o.id_ordine) FILTER (WHERE coalesce(o.archiviato, false) = false) AS ordini_vivi
FROM clienti_destinazioni d
LEFT JOIN ordini o ON o.id_destinazione = d.id
WHERE coalesce(btrim(d.cap), '') = ''
  AND coalesce(d.attiva, true)
GROUP BY d.id, d.codice_cliente, d.etichetta, d.localita, d.provincia;

GRANT SELECT ON v_destinazioni_senza_cap TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
