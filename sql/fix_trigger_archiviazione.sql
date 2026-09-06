CREATE OR REPLACE FUNCTION cf_scadenza_da_magazzino()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cod text;
  gg int;
  certa boolean;
  d date;
  v_metodo text;
  v_scad date;
  -- Variabili normali, NON un record. Il giro di prima leggeva
  -- cf_condizioni_cliente in un record `c` dentro il solo ramo del ripiego, e poi
  -- l'INSERT citava c.cond_pag sempre: quando il metodo di pagamento era
  -- leggibile quel ramo non passava, `c` restava non assegnato e Postgres
  -- rifiutava l'intera UPDATE. Risultato: nessun ordine si poteva archiviare.
  v_cond_pag text := NULL;
  v_effetto_storico text := NULL;
BEGIN
  IF NOT (new.archiviato IS TRUE AND coalesce(old.archiviato, false) IS FALSE) THEN
    RETURN new;
  END IF;

  new.archiviato_il := now();

  IF current_date < cf_controllo_dal() THEN RETURN new; END IF;
  IF coalesce(new.stato, '') = 'Fermo' THEN RETURN new; END IF;

  cod := cf_codice_da_magazzino(new.id_cliente);
  IF cod IS NULL THEN RETURN new; END IF;

  -- Il giorno zero e' l'archiviazione: e' adesso che l'ordine diventa un
  -- documento da incassare (regola di Luca 06/08/2026).
  d := new.archiviato_il::date;

  -- Il metodo dell'ordine, e in mancanza quello dell'anagrafica del cliente.
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
    -- Ripiego: la storia di quel cliente. Non si chiama certa, e' una media di
    -- ritardi. Le due colonne si leggono qui e restano NULL se il cliente non
    -- c'e': un NULL sull'INSERT non fa danno, un record non assegnato si.
    SELECT co.giorni, co.cond_pag, co.effetto
      INTO gg, v_cond_pag, v_effetto_storico
      FROM cf_condizioni_cliente co WHERE co.codice = cod;
    IF gg IS NULL THEN gg := 30; END IF;
    v_scad := d + gg;
    certa := false;
  END IF;

  INSERT INTO cf_fatture_attese
    (id, codice, cliente, documento, data_doc, giorni, cond_pag, effetto,
     scadenza_prevista, condizione_certa)
  VALUES
    (new.id_ordine, cod, coalesce(new.cliente, ''),
     coalesce(nullif(trim(new.ddt_numero), ''), new.id_ordine),
     d, gg, v_cond_pag,
     coalesce(split_part(v_metodo, ' ', 1), v_effetto_storico),
     v_scad, certa)
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$;
