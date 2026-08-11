-- L'IVA non si inventa piu'.
--
-- DOMANDA DI LUCA (07/08/2026): "l'IVA della burrata e' al 4 invece che al 10,
-- il polybox di Service Tour ha 4 invece di 22. Perche' avviene questo? Come
-- possiamo risolvere il problema per sempre?"
--
-- PERCHE' AVVIENE. Entrambe erano righe FUORI MAGAZZINO, cioe' scritte a mano
-- senza collegamento a un prodotto del catalogo. Senza prodotto non c'e'
-- prodotti.iva_pct da leggere, e restava il 4% che l'interfaccia metteva come
-- valore di partenza. Il 4% non era una scelta di nessuno: era un default che si
-- e' travestito da dato.
--
-- Il catalogo, quello, era giusto: la burrata sta al 10% su tutti e tre i suoi
-- codici, e le fatture emesse lo confermano su 1.856 righe. Il polybox e'
-- fatturato 22% su tutte e 15 le volte che compare.
--
-- LA SOLUZIONE, IN TRE STRATI
--   1. il polybox ha un'aliquota fissa: 22%. E' un servizio di imballo, non un
--      alimento, e ricorre su quasi ogni ordine a temperatura controllata.
--   2. una riga scritta a mano che corrisponde a un prodotto del catalogo prende
--      la SUA aliquota, ma solo se tutti i prodotti che le somigliano sono
--      d'accordo. "Ricotta e spinaci" pesca quattro codici, tutti al 10%: si
--      applica. Se invece i candidati litigano, non si sceglie a caso.
--   3. quando non si sa, l'aliquota resta VUOTA e blocca il documento. Un campo
--      vuoto si vede e si compila; un 4% messo di default no, e finisce in
--      fattura.
--
-- Lo strato 3 e' quello che risolve "per sempre": gli altri due riducono le volte
-- in cui bisogna scegliere a mano, ma e' il rifiuto di indovinare che impedisce
-- all'errore di arrivare al cliente.

-- ---------------------------------------------------------------------------
-- L'aliquota di una riga scritta a mano, dedotta dal catalogo.
-- ---------------------------------------------------------------------------
-- Ritorna NULL quando non si puo' sapere: nessun prodotto somigliante, oppure
-- prodotti somiglianti con aliquote diverse fra loro.
CREATE OR REPLACE FUNCTION iva_da_descrizione(p_descrizione text)
RETURNS numeric
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  d text;
  v_aliquote int;
  v_iva numeric;
BEGIN
  d := upper(regexp_replace(coalesce(p_descrizione, ''), '[^A-Za-z0-9]', '', 'g'));
  IF length(d) < 6 THEN RETURN NULL; END IF;

  -- IL POLYBOX. Imballo isotermico: e' un servizio, non un alimento, e in
  -- fattura e' sempre al 22%. Sta prima di tutto perche' il suo nome non
  -- somiglia a nessun prodotto del catalogo e altrimenti resterebbe scoperto.
  IF d LIKE '%POLYBOX%' OR d LIKE '%POLIBOX%' OR d LIKE '%ISOTERMIC%' THEN
    RETURN 22;
  END IF;

  -- Il confronto e' PAROLA PER PAROLA, non per stringa contenuta: il catalogo
  -- dice "Ravioli Burrata 250g" e a mano si scrive "ravioli alla burrata 250g
  -- pz". Nessuna delle due contiene l'altra per via di quell'"alla" in mezzo, ed
  -- era esattamente il caso di Green Door.
  -- Si pretende che TUTTE le parole importanti del prodotto (almeno quattro
  -- lettere, oppure con dentro un numero, che e' la pezzatura) compaiano nella
  -- riga scritta a mano. Cosi' "Ravioli Ricotta e Spinaci 250" non aggancia
  -- "RICOTTA E SPINACI AL POMODORO", che non dice ne' ravioli ne' 250: e' giusto
  -- che resti da scegliere invece di prendere un'aliquota per assonanza.
  WITH parole_riga AS (
    SELECT array_agg(w) AS ws
      FROM regexp_split_to_table(
             upper(regexp_replace(coalesce(p_descrizione, ''), '[^A-Za-z0-9]', ' ', 'g')),
             '\s+') AS w
     WHERE w <> ''
  ), candidati AS (
    SELECT pr.iva_pct
      FROM prodotti pr, parole_riga
     WHERE pr.iva_pct IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
           FROM regexp_split_to_table(
                  upper(regexp_replace(coalesce(pr.descrizione_prodotto, ''), '[^A-Za-z0-9]', ' ', 'g')),
                  '\s+') AS pw
          WHERE pw <> ''
            AND (length(pw) >= 4 OR pw ~ '[0-9]')
            AND NOT (pw = ANY (parole_riga.ws))
       )
       -- Un prodotto senza parole importanti aggancerebbe tutto: fuori.
       AND EXISTS (
         SELECT 1
           FROM regexp_split_to_table(
                  upper(regexp_replace(coalesce(pr.descrizione_prodotto, ''), '[^A-Za-z0-9]', ' ', 'g')),
                  '\s+') AS pw
          WHERE pw <> '' AND (length(pw) >= 4 OR pw ~ '[0-9]')
       )
  )
  SELECT count(DISTINCT iva_pct), min(iva_pct) INTO v_aliquote, v_iva FROM candidati;

  IF v_aliquote = 1 THEN RETURN v_iva; END IF;
  RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION iva_da_descrizione(text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- La valorizzazione la usa sulle righe senza prodotto.
-- ---------------------------------------------------------------------------
-- Prima queste righe uscivano dal giro dell'IVA senza che nessuno se ne
-- accorgesse: l'UPDATE dell'aliquota si aggancia a prodotti.id_prodotto, e una
-- riga fuori magazzino quel prodotto non ce l'ha.
CREATE OR REPLACE FUNCTION iva_righe_fuori_magazzino(p_id_ordine text)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_tocc int;
BEGIN
  UPDATE righe_ordine ri
     SET iva_pct = iva_da_descrizione(ri.descrizione_prodotto)
   WHERE ri.id_ordine = p_id_ordine
     AND (ri.id_prodotto LIKE 'FUORI_MAGAZZINO%' OR ri.id_prodotto IS NULL)
     -- Il regime estero azzera l'imposta per tutto il documento: li' lo zero e'
     -- voluto e non si tocca.
     AND coalesce(ri.natura_iva, '') = ''
     AND iva_da_descrizione(ri.descrizione_prodotto) IS NOT NULL
     AND ri.iva_pct IS DISTINCT FROM iva_da_descrizione(ri.descrizione_prodotto);
  GET DIAGNOSTICS v_tocc = ROW_COUNT;
  RETURN v_tocc;
END;
$$;

GRANT EXECUTE ON FUNCTION iva_righe_fuori_magazzino(text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Le righe che oggi hanno un'aliquota che nessuno ha scelto.
-- ---------------------------------------------------------------------------
-- Serve a vedere il danno fatto finora, e a rimediarlo dove il catalogo sa
-- rispondere. Sono le righe fuori magazzino la cui aliquota non coincide con
-- quella che il catalogo o la regola del polybox indicano.
CREATE OR REPLACE VIEW v_iva_da_controllare AS
SELECT ri.id_riga,
       ri.id_ordine,
       o.cliente,
       o.stato,
       coalesce(o.archiviato, false) AS archiviato,
       o.ddt_numero,
       ri.descrizione_prodotto,
       ri.iva_pct AS iva_sulla_riga,
       iva_da_descrizione(ri.descrizione_prodotto) AS iva_suggerita
  FROM righe_ordine ri
  JOIN ordini o ON o.id_ordine = ri.id_ordine
 WHERE (ri.id_prodotto LIKE 'FUORI_MAGAZZINO%' OR ri.id_prodotto IS NULL)
   AND coalesce(ri.natura_iva, '') = ''
   AND iva_da_descrizione(ri.descrizione_prodotto) IS NOT NULL
   AND ri.iva_pct IS DISTINCT FROM iva_da_descrizione(ri.descrizione_prodotto);

GRANT SELECT ON v_iva_da_controllare TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
