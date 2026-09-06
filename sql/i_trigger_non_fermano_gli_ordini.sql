-- I TRIGGER NON FERMANO PIU' GLI ORDINI.
--
-- DOMANDA DI LUCA (07/08/2026): "come facciamo affinche' da oggi ogni modifica
-- non deve assolutamente bloccare l'operativita'?"
--
-- IL DIFETTO NON ERANO I DUE BACHI, ERA L'ARCHITETTURA. Sugli ordini ci sono due
-- trigger che calcolano cose ACCESSORIE: la scadenza per il Cashflow e il metodo
-- di pagamento dedotto dalla storia del cliente. Nessuna delle due serve a
-- spedire la merce. Ma essendo trigger BEFORE, se sbagliano fanno fallire tutta
-- l'operazione: il 07/08/2026 un record non assegnato e un SECURITY DEFINER
-- perso hanno impedito di creare, preparare, spedire e archiviare per due ore.
--
-- Cioe' un errore nel calcolo di una SCADENZA fermava una SPEDIZIONE. Sono due
-- cose che non devono dipendere l'una dall'altra.
--
-- DA ORA: quello che e' accessorio non puo' bloccare quello che e' essenziale.
-- Il corpo dei due trigger sta dentro un gestore di eccezioni. Se qualcosa va
-- storto, l'errore finisce in log_trigger_errori e l'ordine passa comunque.
-- Il costo di un baco futuro diventa una scadenza mancante, che si vede e si
-- rifa', invece dell'azienda ferma.
--
-- E LE SCADENZE MANCANTI NON SI PERDONO: chi non e' riuscito a scriverla resta
-- elencato in v_scadenze_da_rifare, quindi si recupera invece di scoprirla a
-- fine mese.

CREATE TABLE IF NOT EXISTS log_trigger_errori (
  id bigserial PRIMARY KEY,
  quando timestamptz NOT NULL DEFAULT now(),
  trigger_nome text,
  id_ordine text,
  messaggio text,
  dettaglio text
);

CREATE INDEX IF NOT EXISTS log_trigger_errori_quando ON log_trigger_errori (quando DESC);
GRANT SELECT ON log_trigger_errori TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- La scadenza a Cashflow: se non si riesce a calcolare, l'ordine si archivia.
-- ---------------------------------------------------------------------------
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
  v_cond_pag text := NULL;
  v_effetto_storico text := NULL;
BEGIN
  IF NOT (new.archiviato IS TRUE AND coalesce(old.archiviato, false) IS FALSE) THEN
    RETURN new;
  END IF;

  -- Questo si scrive SEMPRE, anche se il resto fallisce: e' il momento in cui
  -- l'ordine e' stato archiviato, e da quel giorno partono le scadenze.
  new.archiviato_il := now();

  BEGIN
    IF current_date < cf_controllo_dal() THEN RETURN new; END IF;
    IF coalesce(new.stato, '') = 'Fermo' THEN RETURN new; END IF;

    cod := cf_codice_da_magazzino(new.id_cliente);
    IF cod IS NULL THEN RETURN new; END IF;

    -- Il giorno zero e' l'archiviazione (regola di Luca 06/08/2026).
    d := new.archiviato_il::date;

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

  EXCEPTION WHEN OTHERS THEN
    -- LA MERCE PARTE COMUNQUE. La scadenza si recupera da
    -- v_scadenze_da_rifare, l'azienda ferma no.
    INSERT INTO log_trigger_errori (trigger_nome, id_ordine, messaggio, dettaglio)
    VALUES ('cf_scadenza_da_magazzino', new.id_ordine, SQLERRM, SQLSTATE);
  END;

  RETURN new;
END;
$$;

-- ---------------------------------------------------------------------------
-- Il metodo dedotto dalla storia: se non si riesce, l'ordine si salva comunque.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION ordine_metodo_da_storia()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cod text;
  modo text;
  gg int;
  v_can text;
BEGIN
  BEGIN
    IF coalesce(trim(new.metodo_pagamento), '') <> '' THEN
      new.metodo_pagamento := coalesce(metodo_pagamento_canonico(new.metodo_pagamento),
                                       new.metodo_pagamento);
      RETURN new;
    END IF;

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

    -- Vuoto invece del codice grezzo del gestionale: lo compila chi sa cosa e'
    -- stato concordato.
    IF v_can IS NOT NULL THEN
      new.metodo_pagamento := v_can;
    END IF;

  EXCEPTION WHEN OTHERS THEN
    -- L'ordine si salva senza metodo: il bollino rosso lo segnala e si mette a
    -- mano. Meglio un campo da compilare che un ordine che non si crea.
    INSERT INTO log_trigger_errori (trigger_nome, id_ordine, messaggio, dettaglio)
    VALUES ('ordine_metodo_da_storia', new.id_ordine, SQLERRM, SQLSTATE);
  END;

  RETURN new;
END;
$$;

-- ---------------------------------------------------------------------------
-- Le scadenze che non sono state scritte non si perdono.
-- ---------------------------------------------------------------------------
-- Un ordine archiviato che non ha la sua riga a Cashflow e' un incasso che
-- nessuno sta aspettando. Qui si vedono, e si rifanno con
-- imposta_metodo_pagamento oppure riarchiviando.
CREATE OR REPLACE VIEW v_scadenze_da_rifare AS
SELECT o.id_ordine,
       o.cliente,
       o.archiviato_il::date AS archiviato_il,
       o.ddt_numero,
       o.totale_imponibile,
       o.metodo_pagamento,
       (SELECT max(l.messaggio) FROM log_trigger_errori l
         WHERE l.id_ordine = o.id_ordine
           AND l.trigger_nome = 'cf_scadenza_da_magazzino') AS ultimo_errore
  FROM ordini o
 WHERE o.archiviato IS TRUE
   AND o.archiviato_il IS NOT NULL
   AND o.archiviato_il::date >= cf_controllo_dal()
   AND coalesce(o.stato, '') <> 'Fermo'
   AND cf_codice_da_magazzino(o.id_cliente) IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM cf_fatture_attese f WHERE f.id = o.id_ordine);

GRANT SELECT ON v_scadenze_da_rifare TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
