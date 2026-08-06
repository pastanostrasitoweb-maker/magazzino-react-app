-- La scadenza parte dal giorno in cui l'ordine va IN ARCHIVIO.
--
-- REGOLA DI LUCA (06/08/2026): "ricordati che le scadenze da abbinare partono da
-- quando l'ordine va in archivio, non prima."
--
-- COS'ERA SBAGLIATO. Il trigger usava la data dell'ORDINE:
--   d := coalesce(new.data_ordine, new.data_preparato, now())::date;
-- Ma l'ordine si scrive un giorno, si prepara il giorno dopo e si archivia
-- magari il terzo: e' l'archiviazione il momento in cui il documento diventa
-- fattura, quindi e' da li' che si contano i giorni. Su quindici partite dal
-- 03/08, NOVE erano state archiviate un giorno dopo la data dell'ordine e
-- contavano dal giorno prima.
--
-- QUANTO PESA. Su "30 gg fine mese" un giorno di scarto spesso non cambia
-- niente, perche' si cade nello stesso mese. Ma un ordine preparato il 31 e
-- archiviato il 1 del mese dopo sposta la scadenza di un mese intero, e un
-- contrassegno segnato al giorno prima risulta incassato quando la merce era
-- ancora in magazzino.
--
-- La data si congela qui e non si muove piu': imposta_metodo_pagamento riusa il
-- data_doc della partita, quindi correggere il metodo dopo non sposta il giorno
-- zero. Altrimenti ogni correzione allungherebbe la dilazione.

-- ---------------------------------------------------------------------------
-- Il metodo di pagamento non si scrive due volte.
-- ---------------------------------------------------------------------------
-- REGOLA DI LUCA (06/08/2026): "non far inserire le informazioni due volte: se
-- il metodo di pagamento lo metto sull'anagrafica deve essere quello, non me lo
-- deve richiedere in fase di ordine. Richiedilo solo se non e' conforme."
--
-- Quindi il metodo di un ordine e':
--   1. quello scritto sull'ORDINE, se leggibile (la deroga: capita che una
--      singola vendita si incassi in modo diverso dal solito)
--   2. altrimenti quello dell'ANAGRAFICA del cliente, che e' il posto dove si
--      scrive una volta e vale per tutti i suoi ordini
--   3. altrimenti NULL, e allora si chiede.
--
-- Cerca l'anagrafica per P.IVA, che e' la chiave con cui e' indicizzata
-- (clienti_override.chiave = 'piva:<numero>'), passando dal registro clienti.
CREATE OR REPLACE FUNCTION metodo_pagamento_effettivo(p_id_ordine text)
RETURNS text
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE(
           metodo_pagamento_canonico(o.metodo_pagamento),
           metodo_pagamento_canonico(ov.metodo_pagamento)
         )
    FROM ordini o
    LEFT JOIN clienti_master m ON m.codice = o.id_cliente
    LEFT JOIN clienti_gestionale g
           ON g.codice_cliente = COALESCE(NULLIF(m.codice_gestionale, ''),
                                          replace(COALESCE(o.id_cliente, ''), 'CLI-', ''))
    LEFT JOIN clienti_override ov
           ON ov.chiave = 'piva:' || COALESCE(NULLIF(m.piva, ''), NULLIF(g.piva, ''), '')
   WHERE o.id_ordine = p_id_ordine;
$$;

GRANT EXECUTE ON FUNCTION metodo_pagamento_effettivo(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION cf_scadenza_da_magazzino()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cod text;
  c record;
  gg int;
  certa boolean;
  d date;
  v_metodo text;
  v_scad date;
BEGIN
  IF NOT (new.archiviato IS TRUE AND coalesce(old.archiviato, false) IS FALSE) THEN
    RETURN new;
  END IF;

  new.archiviato_il := now();

  IF current_date < cf_controllo_dal() THEN RETURN new; END IF;
  IF coalesce(new.stato, '') = 'Fermo' THEN RETURN new; END IF;

  cod := cf_codice_da_magazzino(new.id_cliente);
  IF cod IS NULL THEN RETURN new; END IF;

  -- IL GIORNO ZERO E' L'ARCHIVIAZIONE, cioe' adesso: e' il momento in cui questo
  -- ordine diventa un documento da incassare. Non la data dell'ordine, che puo'
  -- essere di due giorni prima.
  d := new.archiviato_il::date;

  -- Il metodo dell'ordine, e in mancanza quello dell'anagrafica del cliente:
  -- scritto una volta la' vale per tutti i suoi ordini, e non lo si richiede.
  v_metodo := COALESCE(
    metodo_pagamento_canonico(new.metodo_pagamento),
    (SELECT metodo_pagamento_canonico(ov.metodo_pagamento)
       FROM clienti_master m
       LEFT JOIN clienti_override ov ON ov.chiave = 'piva:' || COALESCE(NULLIF(m.piva,''), '')
      WHERE m.codice = new.id_cliente),
    (SELECT metodo_pagamento_canonico(ov.metodo_pagamento)
       FROM clienti_gestionale g
       LEFT JOIN clienti_override ov ON ov.chiave = 'piva:' || COALESCE(NULLIF(g.piva,''), '')
      WHERE g.codice_cliente = replace(COALESCE(new.id_cliente, ''), 'CLI-', ''))
  );
  v_scad := scadenza_da_metodo(d, v_metodo);

  IF v_metodo IS NOT NULL AND v_scad IS NOT NULL THEN
    gg := (v_scad - d)::int;
    certa := true;
  ELSE
    -- Ripiego: la storia di quel cliente. Utile per non avere la colonna vuota,
    -- ma NON si chiama certa: e' una media di ritardi, non un accordo.
    SELECT * INTO c FROM cf_condizioni_cliente WHERE codice = cod;
    IF found THEN gg := c.giorni; ELSE gg := 30; END IF;
    v_scad := d + gg;
    certa := false;
  END IF;

  INSERT INTO cf_fatture_attese
    (id, codice, cliente, documento, data_doc, giorni, cond_pag, effetto,
     scadenza_prevista, condizione_certa)
  VALUES
    (new.id_ordine, cod, coalesce(new.cliente, ''),
     coalesce(nullif(trim(new.ddt_numero), ''), new.id_ordine),
     d, gg, c.cond_pag,
     coalesce(split_part(v_metodo, ' ', 1), c.effetto),
     v_scad, certa)
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$;

-- ---------------------------------------------------------------------------
-- Rimetti in riga le partite gia' aperte: giorno zero = archiviazione.
-- ---------------------------------------------------------------------------
UPDATE cf_fatture_attese f
   SET data_doc = o.archiviato_il::date,
       scadenza_prevista = CASE
         WHEN metodo_pagamento_effettivo(o.id_ordine) IS NOT NULL
           THEN scadenza_da_metodo(o.archiviato_il::date, metodo_pagamento_effettivo(o.id_ordine))
         -- Senza metodo leggibile si tiene la dilazione stimata che c'era, ma
         -- spostata sul giorno giusto: non si inventa un termine nuovo.
         ELSE o.archiviato_il::date + f.giorni
       END,
       giorni = CASE
         WHEN metodo_pagamento_effettivo(o.id_ordine) IS NOT NULL
           THEN (scadenza_da_metodo(o.archiviato_il::date, metodo_pagamento_effettivo(o.id_ordine))
                 - o.archiviato_il::date)::int
         ELSE f.giorni
       END
  FROM ordini o
 WHERE o.id_ordine = f.id
   AND o.archiviato_il IS NOT NULL
   AND f.data_doc >= '2026-08-03'
   AND f.data_doc IS DISTINCT FROM o.archiviato_il::date;

NOTIFY pgrst, 'reload schema';
