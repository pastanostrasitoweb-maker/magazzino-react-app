-- Il documento di trasporto nasce con l'ARCHIVIAZIONE, e da li' non si torna.
--
-- REGOLE DI LUCA (03/08, corrette il 04/08/2026):
--   1. Il DDT nasce con l'ARCHIVIAZIONE, non con la spedizione.
--   2. Da Spedito si torna indietro: e' ancora una fase di lavoro, capita di
--      accorgersi di qualcosa e di dover riportare l'ordine ai preparati.
--   3. Il punto di non ritorno e' l'ARCHIVIAZIONE: da li' il documento e'
--      emesso e l'ordine non si disarchivia.
--
-- Prima il numero si staccava al passaggio a Spedito, e quello chiudeva subito
-- la porta: troppo presto. Il numero ora si stacca in due momenti soli, con lo
-- stesso meccanismo: quando qualcuno STAMPA il DDT (perche' lo consegna
-- all'autista) e, se nessuno l'ha stampato, quando l'ordine si ARCHIVIA, cosi'
-- niente finisce in archivio senza documento.
--
-- Perche' qui e non solo nei pulsanti: un pulsante nascosto si aggira, e
-- soprattutto non copre le altre strade (correzione a mano, script, un'altra
-- app sullo stesso database). Un DDT emesso e' un documento fiscale: la
-- garanzia deve stare dove stanno i dati.
--
-- NOTA sulla regola precedente. Fino al 02/08 valeva "ogni azione reversibile,
-- il torna-indietro sempre disponibile": e' il motivo per cui esisteva
-- Disarchivia senza PIN. Questa e' una deroga voluta e circoscritta, e vale
-- SOLO per l'archiviazione. Tutto il resto resta reversibile, Spedito compreso.

-- ============================================================
-- 1. Il numero DDT si stacca all'archiviazione
-- ============================================================
-- Rete di sicurezza, non la strada normale: di solito il numero se lo prende
-- chi STAMPA il DDT (assegna_numero_ddt, sql/numero_ddt.sql) perche' lo
-- consegna all'autista. Questo serve al caso in cui nessuno l'abbia stampato:
-- in archivio non deve finire niente senza documento.
-- Non chiama assegna_numero_ddt(): quella fa una UPDATE su ordini e da dentro
-- un trigger su ordini si rientrerebbe. Qui si scrive direttamente su NEW,
-- sotto lo STESSO lock, cosi' le due strade non possono darsi lo stesso numero.
CREATE OR REPLACE FUNCTION ddt_alla_spedizione() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_nuovo int;
BEGIN
  IF NEW.archiviato IS NOT TRUE THEN RETURN NEW; END IF;
  IF COALESCE(TRIM(NEW.ddt_numero), '') <> '' THEN
    RETURN NEW;   -- ce l'ha gia': non se ne consuma un altro
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('numero_ddt'));
  SELECT COALESCE(MAX(ddt_numero::int), 0) + 1 INTO v_nuovo
  FROM ordini WHERE ddt_numero ~ '^[0-9]+$';
  NEW.ddt_numero := v_nuovo::text;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ddt_alla_spedizione ON ordini;
CREATE TRIGGER trg_ddt_alla_spedizione
  BEFORE INSERT OR UPDATE OF archiviato ON ordini
  FOR EACH ROW EXECUTE FUNCTION ddt_alla_spedizione();

-- ============================================================
-- 2. Solo l'archiviazione e' a senso unico
-- ============================================================
-- Da Spedito si torna indietro: e' ancora una fase di lavoro. Blocca SOLO il
-- disarchivia. Tutto il resto di un ordine archiviato resta modificabile:
-- prezzi, colli, peso, anagrafica. Serve proprio perche' fra l'archiviazione e
-- l'invio a Sibill (mezzanotte del giorno dopo) c'e' la finestra per
-- correggere quello che ci si e' dimenticati.
CREATE OR REPLACE FUNCTION spedito_non_torna_indietro() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF COALESCE(OLD.archiviato, false) AND NOT COALESCE(NEW.archiviato, false) THEN
    RAISE EXCEPTION
      'Ordine % archiviato con DDT %: non si disarchivia. Il documento e'' gia'' emesso.',
      OLD.id_ordine, COALESCE(NULLIF(OLD.ddt_numero, ''), 'assente');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_spedito_non_torna_indietro ON ordini;
CREATE TRIGGER trg_spedito_non_torna_indietro
  BEFORE UPDATE OF archiviato ON ordini
  FOR EACH ROW EXECUTE FUNCTION spedito_non_torna_indietro();

-- ============================================================
-- 2b. Il trigger del Cashflow deve poter scrivere
-- ============================================================
-- Girava con i permessi di CHI archivia (anon), e cf_fatture_attese ha RLS
-- accesa senza policy, cioe' e' chiusa a tutti: archiviare falliva, con un
-- errore che parlava di una tabella del Cashflow e non era interpretabile.
-- Non se ne erano accorti perche' il trigger esce prima se il cliente non e'
-- mappato nel Cashflow: falliva SOLO sui clienti che il Cashflow conosce.
ALTER FUNCTION cf_scadenza_da_magazzino() SECURITY DEFINER;
ALTER FUNCTION cf_scadenza_da_magazzino() SET search_path = public;

-- ============================================================
-- 3. A Sibill si manda a mezzanotte del giorno DOPO
-- ============================================================
-- Non appena spedito: fra le due cose ci sta la giornata per accorgersi di un
-- prezzo dimenticato o di un'anagrafica incompleta. Una volta partito verso
-- Sibill diventa una fattura, e li' correggere costa una nota di credito.
ALTER TABLE ddt_sibill_invii ADD COLUMN IF NOT EXISTS inviabile_dal timestamptz;

-- Mezzanotte del giorno dopo la data del DDT, ora italiana.
CREATE OR REPLACE FUNCTION ddt_inviabile_dal(p_data date) RETURNS timestamptz
LANGUAGE sql IMMUTABLE AS $$
  SELECT ((p_data + interval '2 day')::timestamp AT TIME ZONE 'Europe/Rome');
$$;
-- +2 e non +1: un DDT del 3 agosto si manda alle 24:00 del 4, cioe' all'inizio
-- del 5. "Le 24:00 del giorno dopo" e' la mezzanotte che CHIUDE il giorno dopo.

UPDATE ddt_sibill_invii
   SET inviabile_dal = ddt_inviabile_dal(ddt_data)
 WHERE inviabile_dal IS NULL AND ddt_data IS NOT NULL;

CREATE OR REPLACE FUNCTION accoda_ddt_per_sibill() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF COALESCE(TRIM(NEW.ddt_numero), '') = '' THEN RETURN NEW; END IF;
  IF lower(COALESCE(NEW.stato, '')) <> 'spedito' AND NEW.archiviato IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  INSERT INTO ddt_sibill_invii (id_ordine, ddt_numero, ddt_data, cliente, cliente_piva, importo, inviabile_dal)
  SELECT NEW.id_ordine,
         TRIM(NEW.ddt_numero),
         COALESCE(NEW.data_preparato, NEW.data_ordine, CURRENT_DATE)::date,
         NEW.cliente,
         g.piva,
         NEW.totale_imponibile,
         ddt_inviabile_dal(COALESCE(NEW.data_preparato, NEW.data_ordine, CURRENT_DATE)::date)
  FROM (SELECT 1) x
  -- Il codice cliente e' 'CLI-<numero>', la chiave del gestionale e' il numero
  -- nudo: senza il replace il join non aggancia mai e la P.IVA resta vuota.
  LEFT JOIN clienti_master m ON m.codice = NEW.id_cliente
  LEFT JOIN clienti_gestionale g
         ON g.codice_cliente = COALESCE(m.codice_gestionale, replace(COALESCE(NEW.id_cliente, ''), 'CLI-', ''))
  -- DO UPDATE, non DO NOTHING: finche' il DDT non e' partito la coda deve
  -- seguire l'ordine. Se durante la finestra si corregge un prezzo o si cambia
  -- il numero, a Sibill deve arrivare il dato nuovo, non quello congelato al
  -- momento della spedizione. La clausola WHERE protegge cio' che e' gia'
  -- partito: quello non si tocca piu'.
  ON CONFLICT (id_ordine) DO UPDATE SET
    ddt_numero    = EXCLUDED.ddt_numero,
    ddt_data      = EXCLUDED.ddt_data,
    cliente       = EXCLUDED.cliente,
    cliente_piva  = COALESCE(EXCLUDED.cliente_piva, ddt_sibill_invii.cliente_piva),
    importo       = EXCLUDED.importo,
    inviabile_dal = EXCLUDED.inviabile_dal
  WHERE ddt_sibill_invii.stato IN ('da_inviare', 'errore');

  RETURN NEW;
END;
$$;

-- Il trigger ascolta anche il totale e il cliente, non solo lo stato: senza,
-- un prezzo corretto durante la finestra non arrivava mai in coda.
DROP TRIGGER IF EXISTS trg_accoda_ddt_sibill ON ordini;
CREATE TRIGGER trg_accoda_ddt_sibill
  AFTER INSERT OR UPDATE OF stato, ddt_numero, archiviato, totale_imponibile, cliente, id_cliente
  ON ordini
  FOR EACH ROW EXECUTE FUNCTION accoda_ddt_per_sibill();

-- Vista per l'invio: solo quelli maturi. Finche' l'aggancio a Sibill non c'e',
-- serve comunque a vedere cosa partirebbe e quando.
CREATE OR REPLACE VIEW v_ddt_sibill_pronti AS
SELECT i.*, o.stato AS stato_ordine, o.archiviato
FROM ddt_sibill_invii i
JOIN ordini o ON o.id_ordine = i.id_ordine
WHERE i.stato IN ('da_inviare', 'errore')
  AND (i.inviabile_dal IS NULL OR i.inviabile_dal <= now())
ORDER BY i.ddt_numero;

-- ============================================================
-- 4. Un ordine senza data non riusciva ad archiviarsi
-- ============================================================
-- Scoperto simulando il flusso completo il 03/08/2026. Il trigger del Cashflow
-- provava a scrivere NULL in cf_fatture_attese.data_doc, che e' NOT NULL, e
-- l'errore che arrivava a video parlava di una tabella che con l'ordine non
-- c'entra niente. Adesso ripiega sulla data di preparazione e poi su oggi: la
-- scadenza va calcolata da qualcosa, e il giorno in cui la merce esce e'
-- l'approssimazione giusta. La causa a monte e' chiusa in supabase-adapter.js,
-- dove createOrder non lascia piu' la data vuota.
CREATE OR REPLACE FUNCTION cf_scadenza_da_magazzino() RETURNS trigger
LANGUAGE plpgsql AS $$
declare cod text; c record; gg int; certa boolean; d date;
begin
  if not (new.archiviato is true and coalesce(old.archiviato, false) is false) then
    return new;
  end if;

  new.archiviato_il := now();

  if current_date < cf_controllo_dal() then return new; end if;
  if coalesce(new.stato,'') = 'Fermo' then return new; end if;

  cod := cf_codice_da_magazzino(new.id_cliente);
  if cod is null then return new; end if;

  select * into c from cf_condizioni_cliente where codice = cod;
  if found then gg := c.giorni; certa := true; else gg := 30; certa := false; end if;

  d := coalesce(new.data_ordine, new.data_preparato, now())::date;

  insert into cf_fatture_attese
    (id, codice, cliente, documento, data_doc, giorni, cond_pag, effetto, scadenza_prevista, condizione_certa)
  values
    (new.id_ordine, cod, coalesce(new.cliente,''),
     coalesce(nullif(trim(new.ddt_numero),''), new.id_ordine),
     d, gg, c.cond_pag, c.effetto, (d + gg), certa)
  on conflict (id) do nothing;
  return new;
end $$;
