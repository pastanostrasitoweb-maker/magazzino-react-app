-- IL PREZZO CHE ARRIVA DALL'APP AGENTI NON SI SOVRASCRIVE (Luca 06/08/2026)
--
-- Rimpiazza valorizza_ordine tenendo tutto com'era, tranne una riga: le righe
-- che hanno gia' un prezzo con prezzo_origine = 'app' restano come sono, anche
-- quando la valorizzazione viene chiamata forzata. Da magazzino il prezzo si
-- cambia dalla tendina dei listini, che e' una scelta di chi guarda l'ordine,
-- non un ricalcolo automatico alle sue spalle.

CREATE OR REPLACE FUNCTION valorizza_ordine(p_id_ordine text, p_forza boolean DEFAULT false)
RETURNS TABLE (righe_toccate int, da_storico int, da_listino_cliente int, da_listino_1 int, senza_prezzo int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_piva      text;
  v_listino   text;
  v_fonte_prezzi text;
  v_sc1 numeric; v_sc2 numeric; v_sc3 numeric;
  v_sc_storico numeric;
  v_tocc int := 0; v_sto int := 0; v_lcl int := 0; v_l1 int := 0; v_no int := 0;
  r record;
  v_prezzo numeric; v_sconto numeric; v_fonte text;
  v_fonti text[]; v_f text;
  v_netto_storico numeric; v_netto_nuovo numeric; v_avviso text;
  v_prezzo_storico numeric; v_sconto_storico numeric;
BEGIN
  -- Chi e' il cliente e come va valorizzato.
  -- Il codice del gestionale e' la chiave dei listini: clienti_listino lo porta
  -- nudo ("11"), i nostri ordini vestito ("CLI-11"). Si spoglia e si aggancia.
  SELECT COALESCE(NULLIF(ov.partita_iva, ''), NULLIF(m.piva, ''), NULLIF(g.piva, '')),
         COALESCE(NULLIF(ov.listino_standard, ''), NULLIF(cl.listino, '')),
         -- fonte_prezzi non c'era: per chi ha ancora solo il vecchio booleano si
         -- rispetta quello che aveva scelto, e chi non ha scelto niente prende
         -- la regola nuova (listino prima dello storico).
         COALESCE(NULLIF(ov.fonte_prezzi, ''),
                  CASE WHEN ov.usa_storico IS FALSE THEN 'solo-listino' ELSE 'listino' END),
         ov.sconto1_pct, ov.sconto2_pct, ov.sconto3_pct
    INTO v_piva, v_listino, v_fonte_prezzi, v_sc1, v_sc2, v_sc3
    FROM ordini o
    LEFT JOIN clienti_master m ON m.codice = o.id_cliente
    LEFT JOIN clienti_gestionale g
           ON g.codice_cliente = COALESCE(NULLIF(m.codice_gestionale, ''),
                                          replace(COALESCE(o.id_cliente, ''), 'CLI-', ''))
    LEFT JOIN clienti_override ov ON ov.chiave = 'piva:' || COALESCE(m.piva, g.piva, '')
    LEFT JOIN clienti_listino cl
           ON cl.id_cliente = COALESCE(NULLIF(m.codice_gestionale, ''),
                                       replace(COALESCE(o.id_cliente, ''), 'CLI-', ''))
   WHERE o.id_ordine = p_id_ordine;

  -- La rete: se in anagrafica non c'e' nessuno sconto, si usa quello che il
  -- cliente ha davvero avuto in fattura. Senza questo, invertire la precedenza
  -- vorrebbe dire mandare a prezzo pieno chi da sempre compra scontato.
  IF COALESCE(v_sc1,0) = 0 AND COALESCE(v_sc2,0) = 0 AND COALESCE(v_sc3,0) = 0
     AND v_piva IS NOT NULL THEN
    SELECT sconto_pct INTO v_sc_storico FROM sconto_dominante_cliente WHERE piva = v_piva;
    v_sc1 := COALESCE(v_sc_storico, 0);
  END IF;
  v_sc1 := COALESCE(v_sc1, 0); v_sc2 := COALESCE(v_sc2, 0); v_sc3 := COALESCE(v_sc3, 0);

  -- Un listino che non abbiamo non e' un listino. Il gestionale assegna il 2 a
  -- 20 clienti, il 3 a uno e il 4 a due, ma di quei listini non ci ha mai
  -- mandato i prezzi: meglio accorgersene qui e ripiegare, che scrivere zero.
  IF v_listino IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM listini_gestionale WHERE listino = v_listino AND prezzo > 0) THEN
    v_listino := NULL;
  END IF;

  -- L'IVA PRIMA DI TUTTO, e su TUTTE le righe: l'aliquota e' una proprieta' del
  -- prodotto, non una scelta commerciale, e va allineata anche dove il prezzo
  -- c'e' gia'. Il giro che saltava queste righe lasciava il 4% di default su
  -- articoli al 10%: su un raviolo sono 6 punti di IVA sbagliati.
  UPDATE righe_ordine ri
     SET iva_pct = COALESCE(p.iva_pct, (
           SELECT l.iva FROM listini_gestionale l
            WHERE upper(regexp_replace(COALESCE(l.codice_articolo,''), '[^A-Za-z0-9]', '', 'g'))
                = upper(regexp_replace(COALESCE(p.codice_prodotto,''), '[^A-Za-z0-9]', '', 'g'))
              AND COALESCE(l.iva,0) > 0
            LIMIT 1))
    FROM prodotti p
   WHERE p.id_prodotto::text = ri.id_prodotto
     AND ri.id_ordine = p_id_ordine
     AND COALESCE(p.iva_pct, (
           SELECT l.iva FROM listini_gestionale l
            WHERE upper(regexp_replace(COALESCE(l.codice_articolo,''), '[^A-Za-z0-9]', '', 'g'))
                = upper(regexp_replace(COALESCE(p.codice_prodotto,''), '[^A-Za-z0-9]', '', 'g'))
              AND COALESCE(l.iva,0) > 0
            LIMIT 1)) IS NOT NULL
     -- Il regime estero azzera l'imposta per tutto il documento: li' lo zero e'
     -- voluto e non va sovrascritto con l'aliquota del prodotto.
     AND COALESCE(ri.natura_iva, '') = ''
     AND ri.iva_pct IS DISTINCT FROM COALESCE(p.iva_pct, (
           SELECT l.iva FROM listini_gestionale l
            WHERE upper(regexp_replace(COALESCE(l.codice_articolo,''), '[^A-Za-z0-9]', '', 'g'))
                = upper(regexp_replace(COALESCE(p.codice_prodotto,''), '[^A-Za-z0-9]', '', 'g'))
              AND COALESCE(l.iva,0) > 0
            LIMIT 1));

  -- In che ordine si cercano i prezzi. Scritto come elenco e non come catena di
  -- IF perche' l'ordine e' esattamente la decisione commerciale: leggerlo qui
  -- deve bastare a sapere chi comanda.
  v_fonti := CASE v_fonte_prezzi
    WHEN 'storico'      THEN ARRAY['storico', 'storico-descrizione', 'listino_cliente', 'listino_1']
    WHEN 'solo-listino' THEN ARRAY['listino_cliente', 'listino_1']
    ELSE                     ARRAY['listino_cliente', 'storico', 'storico-descrizione', 'listino_1']
  END;

  FOR r IN
    SELECT ri.id_riga,
           -- Chiave articolo senza spazi ne' punteggiatura: "HORECA 122" e
           -- "HORECA122" sono lo stesso articolo scritto in due modi.
           upper(regexp_replace(COALESCE(p.codice_prodotto, ''), '[^A-Za-z0-9]', '', 'g')) AS cod,
           -- Le righe fuori magazzino non hanno codice: resta il nome scritto a
           -- mano, che nello storico invece c'e'.
           upper(regexp_replace(COALESCE(ri.descrizione_prodotto, ''), '[^A-Za-z0-9]', '', 'g')) AS descr,
           p.iva_pct
      FROM righe_ordine ri
      LEFT JOIN prodotti p ON p.id_prodotto::text = ri.id_prodotto
     WHERE ri.id_ordine = p_id_ordine
       AND (p_forza OR COALESCE(ri.prezzo_unitario, 0) = 0)
       -- IL PREZZO DELL'APP AGENTI NON SI TOCCA (Luca 06/08/2026).
       -- E' il prezzo che l'agente ha concordato col cliente: listino del
       -- canale meno lo sconto del livello, piu' gli sconti dati al checkout.
       -- Prima bastava una valorizzazione forzata per sostituirlo col listino
       -- 1, che oltretutto e' al cartone: sull'ordine di Villa Beccaris sono
       -- diventati 346,83 EUR invece di 206,03. Se il prezzo dall'app manca
       -- (zero) la riga si valorizza lo stesso: li' non c'e' niente da salvare.
       AND (COALESCE(ri.prezzo_origine, '') <> 'app' OR COALESCE(ri.prezzo_unitario, 0) = 0)
  LOOP
    v_prezzo := NULL; v_sconto := NULL; v_fonte := NULL;

    FOREACH v_f IN ARRAY v_fonti LOOP
      EXIT WHEN v_fonte IS NOT NULL;

      IF v_f = 'listino_cliente' AND v_listino IS NOT NULL AND r.cod <> '' THEN
        SELECT l.prezzo INTO v_prezzo
          FROM listini_gestionale l
         WHERE l.listino = v_listino
           AND upper(regexp_replace(COALESCE(l.codice_articolo, ''), '[^A-Za-z0-9]', '', 'g')) = r.cod
           AND l.prezzo > 0
         LIMIT 1;
        IF v_prezzo IS NOT NULL AND v_prezzo > 0 THEN v_fonte := 'listino_cliente'; END IF;

      -- Cosa ha pagato QUESTO cliente per QUESTO articolo. Prezzo e sconto
      -- vengono presi in coppia: sono le due meta' di un prezzo concordato e
      -- separarle darebbe un netto che il cliente non ha mai visto.
      ELSIF v_f = 'storico' AND v_piva IS NOT NULL AND r.cod <> '' THEN
        SELECT s.ultimo_prezzo, s.ultimo_sconto INTO v_prezzo, v_sconto
          FROM storico_cliente_articolo s
         WHERE s.piva = v_piva
           AND upper(regexp_replace(COALESCE(s.codice, ''), '[^A-Za-z0-9]', '', 'g')) = r.cod
         ORDER BY s.ultimo_ordine DESC NULLS LAST
         LIMIT 1;
        IF v_prezzo IS NOT NULL AND v_prezzo > 0 THEN v_fonte := 'storico'; END IF;

      -- Righe fuori magazzino: niente codice, si aggancia sul nome, ma solo
      -- dentro lo storico di QUESTO cliente. Due clienti diversi possono
      -- chiamare "Sfoglia" due cose diverse; lo stesso cliente che riordina
      -- "Sfoglia" intende quella di sempre.
      ELSIF v_f = 'storico-descrizione' AND v_piva IS NOT NULL AND r.descr <> '' THEN
        SELECT s.ultimo_prezzo, s.ultimo_sconto INTO v_prezzo, v_sconto
          FROM storico_cliente_articolo s
         WHERE s.piva = v_piva
           AND upper(regexp_replace(COALESCE(s.descrizione, ''), '[^A-Za-z0-9]', '', 'g')) = r.descr
           AND s.ultimo_prezzo > 0
         ORDER BY s.ultimo_ordine DESC NULLS LAST
         LIMIT 1;
        IF v_prezzo IS NOT NULL AND v_prezzo > 0 THEN v_fonte := 'storico-descrizione'; END IF;

      ELSIF v_f = 'listino_1' AND r.cod <> '' THEN
        SELECT l.prezzo INTO v_prezzo
          FROM listini_gestionale l
         WHERE l.listino = '1'
           AND upper(regexp_replace(COALESCE(l.codice_articolo, ''), '[^A-Za-z0-9]', '', 'g')) = r.cod
           AND l.prezzo > 0
         LIMIT 1;
        IF v_prezzo IS NOT NULL AND v_prezzo > 0 THEN v_fonte := 'listino_1'; END IF;
      END IF;
    END LOOP;

    -- LA GUARDIA. Il prezzo di listino si confronta con quello che il cliente ha
    -- davvero pagato: se il netto si scosta di oltre un quarto, il listino non
    -- e' credibile e non lo si applica di nascosto.
    v_avviso := NULL;
    IF v_fonte LIKE 'listino%' AND v_piva IS NOT NULL AND r.cod <> '' THEN
      -- Gli omaggi restano fuori dal confronto: un netto storico di zero fa
      -- sembrare enorme qualsiasi scostamento, e su un articolo regalato una
      -- volta il prezzo giusto e' proprio quello di listino.
      SELECT s.ultimo_prezzo, COALESCE(s.ultimo_sconto, 0)
        INTO v_prezzo_storico, v_sconto_storico
        FROM storico_cliente_articolo s
       WHERE s.piva = v_piva
         AND upper(regexp_replace(COALESCE(s.codice, ''), '[^A-Za-z0-9]', '', 'g')) = r.cod
         AND s.ultimo_prezzo > 0
         AND COALESCE(s.ultimo_sconto, 0) < 100
       ORDER BY s.ultimo_ordine DESC NULLS LAST
       LIMIT 1;

      IF v_prezzo_storico IS NOT NULL THEN
        v_netto_storico := v_prezzo_storico * (1 - v_sconto_storico / 100.0);
        v_netto_nuovo   := netto_riga(1, v_prezzo, v_sc1, v_sc2, v_sc3);
        IF v_netto_storico > 0
           AND abs(v_netto_nuovo - v_netto_storico) / v_netto_storico > 0.25 THEN
          v_avviso := 'Listino ' || COALESCE(v_listino, '1') || ': '
                   || to_char(v_netto_nuovo, 'FM999990.00') || ' EUR, ma in fattura '
                   || to_char(v_netto_storico, 'FM999990.00') || ' EUR. Da controllare.';
          -- Si tiene il prezzo delle fatture, tranne per chi ha scelto
          -- esplicitamente "solo listino": quella e' una decisione presa.
          IF v_fonte_prezzi <> 'solo-listino' THEN
            v_prezzo := v_prezzo_storico;
            v_sconto := v_sconto_storico;
            v_fonte  := 'storico-guardia';
          END IF;
        END IF;
      END IF;
    END IF;

    -- L'IVA si scrive comunque, anche quando il prezzo non si trova: e' un dato
    -- del prodotto, non del prezzo, e serve lo stesso in fattura.
    -- Sui prezzi di listino gli sconti sono quelli dell'anagrafica, tutti e
    -- tre. Sui prezzi storici resta lo sconto storico, che del prezzo storico
    -- e' l'altra meta'.
    UPDATE righe_ordine
       SET iva_pct = COALESCE(r.iva_pct, iva_pct),
           prezzo_unitario = CASE WHEN v_fonte IS NULL THEN prezzo_unitario ELSE v_prezzo END,
           sconto_pct = CASE
                          WHEN v_fonte IS NULL THEN sconto_pct
                          WHEN v_fonte LIKE 'storico%' THEN COALESCE(v_sconto, 0)
                          ELSE v_sc1 END,
           sconto2_pct = CASE
                          WHEN v_fonte IS NULL THEN sconto2_pct
                          WHEN v_fonte LIKE 'storico%' THEN 0
                          ELSE v_sc2 END,
           sconto3_pct = CASE
                          WHEN v_fonte IS NULL THEN sconto3_pct
                          WHEN v_fonte LIKE 'storico%' THEN 0
                          ELSE v_sc3 END,
           prezzo_origine = COALESCE(v_fonte, prezzo_origine),
           -- L'avviso si riscrive sempre, anche a NULL: quando il prezzo torna
           -- a quadrare il rosso deve sparire da solo, senza che nessuno se ne
           -- ricordi.
           prezzo_avviso = v_avviso
     WHERE id_riga = r.id_riga;

    v_tocc := v_tocc + 1;
    IF v_fonte IN ('storico', 'storico-descrizione', 'storico-guardia') THEN v_sto := v_sto + 1;
    ELSIF v_fonte = 'listino_cliente' THEN v_lcl := v_lcl + 1;
    ELSIF v_fonte = 'listino_1' THEN v_l1 := v_l1 + 1;
    ELSE v_no := v_no + 1; END IF;
  END LOOP;

  -- Il totale si rifa' sempre: e' quello che arriva al Cashflow e alla coda
  -- Sibill, e non deve mai restare indietro rispetto alle righe.
  UPDATE ordini o
     SET totale_imponibile = (
           SELECT ROUND(SUM(netto_riga(ri.quantita_ordinata, ri.prezzo_unitario,
                                       ri.sconto_pct, ri.sconto2_pct, ri.sconto3_pct)), 2)
             FROM righe_ordine ri WHERE ri.id_ordine = p_id_ordine)
   WHERE o.id_ordine = p_id_ordine;

  RETURN QUERY SELECT v_tocc, v_sto, v_lcl, v_l1, v_no;
END;
$$;
