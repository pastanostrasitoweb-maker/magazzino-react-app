-- SIGILLO 31/08/2026 · due promesse che il sistema deve mantenere DA SOLO:
--   A. la sede scelta dall'agente arriva intatta al documento e alla tariffa;
--   B. nessuna riga senza aliquota finisce in fattura: si ferma e chiede.
-- Additivo: non tocca documenti archiviati ne' ordini col DDT gia' staccato.

-- ---------------------------------------------------------------------------
-- 1) UNA SEDE NON SI PRESTA: deve essere del cliente dell'ordine.
--
-- Finora lo impediva solo la tendina della schermata. Dal database si poteva
-- scrivere su un ordine "Gruppo Bassano" una sede di ELIOR, e la merce sarebbe
-- partita all'indirizzo di un'altra azienda senza che niente lo dicesse.
-- Provato PRIMA di scrivere la guardia: dei 36 ordini che oggi hanno una sede,
-- zero puntano a una sede di un altro cliente e zero puntano a una sede che non
-- esiste. La guardia quindi non rompe niente di quello che c'e' gia'.
create or replace function public.cap_dalla_destinazione()
returns trigger
language plpgsql
as $function$
DECLARE
  v_cap text;
  v_di  text;
  v_trovata boolean;
BEGIN
  IF coalesce(btrim(new.id_destinazione), '') = '' THEN RETURN new; END IF;

  -- Documento gia' emesso: non si tocca. La bolla stampata resta com'e'.
  IF coalesce(new.archiviato, false) OR coalesce(btrim(new.ddt_numero), '') <> '' THEN
    RETURN new;
  END IF;

  SELECT nullif(btrim(d.cap), ''), d.codice_cliente, true
    INTO v_cap, v_di, v_trovata
  FROM clienti_destinazioni d
  WHERE d.id = new.id_destinazione;

  IF NOT coalesce(v_trovata, false) THEN
    RAISE EXCEPTION
      'La sede di consegna "%" non esiste in anagrafica: l''ordine % non puo'' puntare a un indirizzo che non c''e''.',
      new.id_destinazione, new.id_ordine;
  END IF;

  IF coalesce(btrim(new.id_cliente), '') <> ''
     AND v_di IS DISTINCT FROM new.id_cliente THEN
    RAISE EXCEPTION
      'La sede "%" e'' del cliente %, mentre l''ordine % e'' del cliente %. Una sede di consegna non si presta fra clienti diversi: la merce arriverebbe a un''altra azienda.',
      new.id_destinazione, coalesce(v_di, 'sconosciuto'), new.id_ordine, new.id_cliente;
  END IF;

  -- Se la sede non ha CAP NON si svuota quello che c'e' gia': meglio un CAP
  -- vecchio ma valido che nessun CAP e il preventivo cieco.
  IF v_cap IS NOT NULL THEN
    new.cap := v_cap;
  END IF;
  RETURN new;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 2) L'ALIQUOTA IVA NON SI INVENTA, E NON SI LASCIA PASSARE.
--
-- Dove finiva il buco: la riga senza aliquota attraversava tutto il magazzino
-- in silenzio e si fermava solo alla generazione dell'XML ("riga a IVA zero
-- senza natura"), cioe' DOPO che il DDT era staccato e la merce partita. Li'
-- non e' piu' una domanda, e' un guaio.
--
-- Qui la domanda arriva nel momento giusto: l'archiviazione, che e' quando si
-- brucia il numero di DDT. Prima di fermare si prova a DEDURRE (catalogo per le
-- righe di magazzino, descrizione parola per parola per le righe fuori
-- magazzino): dedurre dal catalogo non e' indovinare. Se dopo il tentativo
-- l'aliquota manca ancora, l'ordine non si archivia e il messaggio dice QUALE
-- articolo.
--
-- ESENZIONE PROVATA, NON SUPPOSTA: la campionatura gratuita non va in fattura
-- (il generatore la scarta: "campionatura gratuita: non c'e' niente da
-- fatturare"). I 10 DDT gia' partiti con righe senza aliquota (1844, 1849,
-- 1864, 1909, 1915, 1941, 1944, 1945, 1950, 1970) sono TUTTI campionature a
-- imponibile zero, e nessuno di loro e' fermo in attesa di fattura. Senza
-- questa esenzione la guardia fermerebbe merce che non ha nessun problema.
create or replace function public.iva_prima_di_archiviare()
returns trigger
language plpgsql
as $function$
DECLARE
  v_quante   int;
  v_mancanti text;
BEGIN
  IF NOT (new.archiviato IS TRUE AND coalesce(old.archiviato, false) IS FALSE) THEN
    RETURN new;
  END IF;

  IF coalesce(new.campionatura, false) AND coalesce(new.totale_imponibile, 0) = 0 THEN
    RETURN new;
  END IF;

  -- Tentativo 1: il catalogo. E' il dato del PRODOTTO, non del prezzo.
  UPDATE righe_ordine ri
     SET iva_pct = p.iva_pct
    FROM prodotti p
   WHERE ri.id_ordine = new.id_ordine
     AND ri.iva_pct IS NULL
     AND p.id_prodotto::text = ri.id_prodotto::text
     AND p.iva_pct IS NOT NULL;

  -- Tentativo 2: le righe fuori magazzino, parola per parola sul catalogo
  -- (polybox 22%, e NULL se i candidati non concordano).
  PERFORM iva_righe_fuori_magazzino(new.id_ordine);

  SELECT count(*),
         string_agg(d, ', ')
    INTO v_quante, v_mancanti
    FROM (
      SELECT coalesce(nullif(btrim(ri.descrizione_prodotto), ''), ri.id_riga) AS d
        FROM righe_ordine ri
       WHERE ri.id_ordine = new.id_ordine
         AND ri.iva_pct IS NULL
       ORDER BY ri.ordine_riga
       LIMIT 8
    ) x;

  IF coalesce(v_quante, 0) > 0 THEN
    RAISE EXCEPTION
      'ALIQUOTA IVA MANCANTE sull''ordine %: %. L''IVA non si inventa: scrivila sulla riga, o mettila a catalogo sull''articolo. Senza aliquota la fattura elettronica non si genera, e a quel punto il DDT sarebbe gia'' partito.',
      new.id_ordine, v_mancanti;
  END IF;

  RETURN new;
END;
$function$;

-- Il nome comincia per "aa" APPOSTA: i trigger BEFORE scattano in ordine
-- alfabetico, e questo deve chiedere l'aliquota PRIMA che
-- trg_ddt_alla_spedizione bruci il numero del documento.
drop trigger if exists trg_aa_iva_prima_di_archiviare on ordini;
create trigger trg_aa_iva_prima_di_archiviare
  before update of archiviato on ordini
  for each row execute function iva_prima_di_archiviare();

-- ---------------------------------------------------------------------------
-- 3) LE DUE VISTE DI CONTROLLO. Se domani si riempiono, si vede.

-- Righe vive senza aliquota. `blocca` dice se quella riga fermerebbe davvero
-- l'archiviazione: la campionatura gratuita compare ma non blocca, cosi' chi
-- guarda non confonde "da sistemare" con "va bene cosi'".
create or replace view public.v_righe_senza_iva as
SELECT o.id_ordine,
       o.cliente,
       o.stato,
       o.data_ordine::date              AS data_ordine,
       nullif(btrim(o.ddt_numero), '')  AS ddt_numero,
       r.id_riga,
       r.descrizione_prodotto,
       r.quantita_ordinata,
       r.prezzo_unitario,
       coalesce(o.campionatura, false)  AS campionatura,
       iva_da_descrizione(r.descrizione_prodotto) AS iva_deducibile,
       NOT (coalesce(o.campionatura, false) AND coalesce(o.totale_imponibile, 0) = 0) AS blocca
  FROM righe_ordine r
  JOIN ordini o ON o.id_ordine = r.id_ordine
 WHERE r.iva_pct IS NULL
   AND coalesce(o.archiviato, false) = false;

comment on view public.v_righe_senza_iva is
  'Righe vive senza aliquota IVA. blocca=true: l''archiviazione si ferma finche'' non la scrivi. Deve restare vuota.';

-- Ordini vivi che non sanno dove va la merce: nessuna sede scelta. `deducibile`
-- e' true quando il cliente ha UNA sola sede attiva, cioe' quando la risposta
-- non e' un'opinione. Quando le sedi sono piu' di una la scelta la fa una
-- persona: qui il sistema non indovina.
create or replace view public.v_ordini_senza_destinazione as
SELECT o.id_ordine,
       o.cliente,
       o.id_cliente,
       o.stato,
       o.data_ordine::date AS data_ordine,
       o.cap,
       (SELECT count(*) FROM clienti_destinazioni d
         WHERE d.codice_cliente = o.id_cliente AND coalesce(d.attiva, true)) AS sedi_attive,
       (SELECT count(*) = 1 FROM clienti_destinazioni d
         WHERE d.codice_cliente = o.id_cliente AND coalesce(d.attiva, true)) AS deducibile
  FROM ordini o
 WHERE coalesce(o.archiviato, false) = false
   AND coalesce(btrim(o.ddt_numero), '') = ''
   AND coalesce(btrim(o.id_destinazione), '') = '';

comment on view public.v_ordini_senza_destinazione is
  'Ordini vivi senza sede di consegna scelta. deducibile=true: il cliente ha una sola sede, si aggancia senza decidere niente.';
