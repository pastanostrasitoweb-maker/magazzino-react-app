-- LA CASCATA DEL METODO PASSA DA UNA PORTA SOLA.
--
-- `ordine_metodo_da_storia` ripeteva a mano il giro delle fonti (scheda, poi
-- cf_partite, poi clienti_metodo_pagamento) e non conosceva le fatture emesse.
-- Ora chiama `metodo_del_cliente`, che le mette in fila una volta per tutte:
-- scheda -> fatture emesse -> storia grezza. Una regola, un posto.
CREATE OR REPLACE FUNCTION ordine_metodo_da_storia()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_can text; v_cli text;
BEGIN
  BEGIN
    IF coalesce(trim(new.id_cliente), '') <> '' THEN
      v_cli := metodo_del_cliente(new.id_cliente);
    END IF;

    IF coalesce(trim(new.metodo_pagamento), '') <> '' THEN
      v_can := metodo_pagamento_canonico(new.metodo_pagamento);
      -- Scritto e leggibile: si normalizza. Scritto ma grezzo ("CONTRASSEGNO"
      -- dall'app agenti): vince quello del cliente, se il cliente ne ha uno.
      new.metodo_pagamento := coalesce(v_can, v_cli, new.metodo_pagamento);
      RETURN new;
    END IF;

    IF v_cli IS NOT NULL THEN new.metodo_pagamento := v_cli; END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO log_trigger_errori (trigger_nome, id_ordine, messaggio, dettaglio)
    VALUES ('ordine_metodo_da_storia', new.id_ordine, SQLERRM, SQLSTATE);
  END;
  RETURN new;
END; $$;

-- Gli ordini vivi senza metodo leggibile prendono quello del cliente, adesso
-- che le fonti sono tutte in fila. Documenti gia' emessi non si toccano.
UPDATE ordini o SET metodo_pagamento = metodo_del_cliente(o.id_cliente)
 WHERE coalesce(o.archiviato, false) = false
   AND coalesce(o.ddt_numero, '') = ''
   AND metodo_pagamento_canonico(o.metodo_pagamento) IS NULL
   AND metodo_del_cliente(o.id_cliente) IS NOT NULL;

-- CHI RESTA SENZA, E PERCHE'. Un rosso deve poter essere spiegato: qui si
-- vede se il cliente non ha mai avuto una fattura (e allora il metodo va
-- semplicemente deciso) o se le sue fatture dicono cose diverse fra loro.
CREATE OR REPLACE VIEW v_clienti_senza_metodo AS
SELECT m.codice, m.ragione_sociale, m.piva,
       (SELECT count(*) FROM ordini o WHERE o.id_cliente = m.codice) AS ordini,
       (SELECT max(o.data_ordine)::date FROM ordini o WHERE o.id_cliente = m.codice) AS ultimo_ordine,
       CASE
         WHEN m.codice LIKE 'PN-%' THEN 'nato fuori dal gestionale: nessuna fattura da cui dedurlo'
         WHEN EXISTS (SELECT 1 FROM v_metodo_da_fatture f WHERE f.codice_cliente = m.codice)
           THEN 'ha fatture ma dicono cose diverse: va deciso'
         ELSE 'mai fatturato: il metodo non esiste ancora, va deciso'
       END AS perche
FROM clienti_master m
WHERE EXISTS (SELECT 1 FROM ordini o WHERE o.id_cliente = m.codice)
  AND metodo_del_cliente(m.codice) IS NULL;

GRANT SELECT ON v_clienti_senza_metodo TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
