-- La scadenza si calcola dal METODO PATTUITO, e "certa" vuol dire certa.
--
-- REGOLA DI LUCA (06/08/2026): "dobbiamo essere certi, quindi metti linearita'
-- in merito ai metodi di pagamento. Se sei insicuro dallo non conforme, metti in
-- modo tale che debba essere inserito bene."
--
-- COM'ERA, ED ERA IL PUNTO DEBOLE DI TUTTO IL GIRO. Il trigger che apre la
-- partita a Cashflow non guardava affatto il metodo di pagamento dell'ordine:
-- pescava i giorni da cf_condizioni_cliente, che sono la MEDIA DEI RITARDI
-- osservati sulle fatture passate, spesso su un solo campione. Cosi' nascevano
-- scadenze a 47, 41, 74 e 9 giorni: numeri che descrivono come quel cliente ha
-- pagato, non cosa e' stato concordato. E la riga veniva marcata
-- condizione_certa = true, quindi il Cashflow si fidava di una media.
-- Quando il cliente non si trovava, metteva 30 giorni fissi.
--
-- ORA: prima il metodo pattuito, e solo quello fa "certa".
--   1. metodo di pagamento dell'ordine in forma canonica -> scadenza vera, certa
--   2. niente metodo leggibile -> si tiene la stima di prima, ma NON e' certa
-- Cosi' "condizione_certa" torna a significare quello che dice, e le righe non
-- certe si vedono e si correggono col bollino sull'ordine.

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

  d := coalesce(new.data_ordine, new.data_preparato, now())::date;

  -- 1. IL METODO PATTUITO. E' l'unica fonte che dice quando si incassa perche'
  -- cosi' e' stato deciso, e non perche' cosi' e' andata l'ultima volta.
  v_metodo := metodo_pagamento_canonico(new.metodo_pagamento);
  v_scad := scadenza_da_metodo(d, new.metodo_pagamento);

  IF v_metodo IS NOT NULL AND v_scad IS NOT NULL THEN
    gg := (v_scad - d)::int;
    certa := true;
  ELSE
    -- 2. Ripiego: la storia di quel cliente. Resta utile per non avere la
    -- colonna vuota, ma NON si chiama certa: e' una media di ritardi.
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
-- Il trigger non scrive piu' valori che non sa leggere.
-- ---------------------------------------------------------------------------
-- Prima, quando la normalizzazione non riusciva, ripiegava sul valore grezzo
-- ("TRANSFER"): un dato che sembra compilato ma non produce scadenza, cioe' la
-- cosa peggiore delle due. Meglio lasciarlo vuoto: un campo vuoto si vede.
CREATE OR REPLACE FUNCTION ordine_metodo_da_storia()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  cod text;
  modo text;
  gg int;
  v_can text;
BEGIN
  IF coalesce(trim(new.metodo_pagamento), '') <> '' THEN
    -- C'e' gia' qualcosa: si normalizza. Se non si capisce si lascia com'e', non
    -- si cancella quello che ha scritto una persona: "TRANSFER" almeno dice che
    -- e' un bonifico, e chi corregge parte da li'. Il rosso lo mette l'app.
    new.metodo_pagamento := coalesce(metodo_pagamento_canonico(new.metodo_pagamento),
                                     new.metodo_pagamento);
    RETURN new;
  END IF;

  -- 'CLI-1647' -> '1647'. I clienti nuovi ('PN-000015') non hanno storia.
  cod := ltrim(regexp_replace(coalesce(new.id_cliente, ''), '^CLI-', ''), '0');
  IF cod = '' OR cod !~ '^\d+$' THEN RETURN new; END IF;

  SELECT p.effetto INTO modo
  FROM cf_partite p
  WHERE p.tipo = 'cliente'
    AND ltrim(coalesce(p.codice, ''), '0') = cod
    AND coalesce(p.effetto, '') <> ''
  GROUP BY p.effetto
  ORDER BY count(*) DESC, max(p.data_doc) DESC NULLS LAST
  LIMIT 1;

  IF modo IS NULL THEN RETURN new; END IF;

  SELECT c.giorni INTO gg FROM cf_condizioni_cliente c WHERE c.codice = cod;

  v_can := coalesce(
    metodo_pagamento_canonico(modo || CASE WHEN coalesce(gg, 0) > 0
                                           THEN ' ' || gg || ' gg' ELSE '' END),
    metodo_pagamento_canonico(modo)
  );

  -- QUI si lascia vuoto invece di scrivere il codice grezzo del gestionale.
  -- Il campo lo compila una persona che sa cosa e' stato concordato: i giorni
  -- che avremmo scritto noi sono una media di ritardi, non un accordo.
  IF v_can IS NOT NULL THEN
    new.metodo_pagamento := v_can;
  END IF;
  RETURN new;
END;
$$;

-- ---------------------------------------------------------------------------
-- Rimetti in riga le partite dal 03/08 che ora hanno un metodo leggibile.
-- ---------------------------------------------------------------------------
-- Sono quelle nate con la media dei ritardi. Dove l'ordine porta un metodo
-- pattuito, la scadenza si rifa' da quello: e' la ragione per cui si e' fatto
-- tutto questo giro.
UPDATE cf_fatture_attese f
   SET scadenza_prevista = scadenza_da_metodo(f.data_doc, o.metodo_pagamento),
       giorni = (scadenza_da_metodo(f.data_doc, o.metodo_pagamento) - f.data_doc)::int,
       effetto = split_part(metodo_pagamento_canonico(o.metodo_pagamento), ' ', 1),
       condizione_certa = true
  FROM ordini o
 WHERE o.id_ordine = f.id
   AND f.data_doc >= '2026-08-03'
   AND metodo_pagamento_canonico(o.metodo_pagamento) IS NOT NULL;

-- E quelle che un metodo pattuito non ce l'hanno smettono di dirsi certe.
UPDATE cf_fatture_attese f
   SET condizione_certa = false
  FROM ordini o
 WHERE o.id_ordine = f.id
   AND f.data_doc >= '2026-08-03'
   AND metodo_pagamento_canonico(o.metodo_pagamento) IS NULL
   AND f.condizione_certa IS TRUE;

NOTIFY pgrst, 'reload schema';
