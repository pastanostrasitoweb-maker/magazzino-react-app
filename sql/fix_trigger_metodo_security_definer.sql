-- SECURITY DEFINER: il trigger legge cf_partite e cf_condizioni_cliente, che
-- l'utente dell'app (anon) non ha il permesso di leggere. Riscrivendo la
-- funzione ho perso questa riga, e da quel momento QUALSIASI insert o update su
-- ordini rispondeva "permission denied for table cf_partite": non si creavano
-- ordini, non si preparavano, non si spedivano, non si archiviavano.
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

  -- Si lascia vuoto invece di scrivere il codice grezzo del gestionale: il campo
  -- lo compila chi sa cosa e' stato concordato.
  IF v_can IS NOT NULL THEN
    new.metodo_pagamento := v_can;
  END IF;
  RETURN new;
END;
$$;
