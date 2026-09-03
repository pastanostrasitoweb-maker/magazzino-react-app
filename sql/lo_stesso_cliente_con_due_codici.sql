-- LO STESSO CLIENTE CON DUE CODICI.
--
-- 03/09/2026, elenco dei clienti da confermare prima di fatturare. SAN PIETRO,
-- ROMA SRL, IL MELOGRANO, TRUFFLE ENJOY risultavano "PAGAMENTO: c'e' niente".
-- Il pagamento invece c'era, scritto sulla loro scheda: solo che la scheda sta
-- sotto il codice del magazzino (PN-000032) e l'ordine porta quello del
-- gestionale (CLI-1036). Due codici, stessa partita IVA, stesso cliente.
--
-- Nel registro sono 9 casi: una riga di origine 'gestionale' e una di origine
-- 'magazzino' con la stessa partita IVA. Unire i codici e' un'operazione da
-- fare con calma e con chi comanda; far parlare i due mondi si puo' fare
-- subito, e la partita IVA e' identita': se coincide, il cliente e' quello.

create or replace function codici_dello_stesso_cliente(p_codice text)
returns setof text
language sql
stable
as $$
  with mio as (
    select regexp_replace(coalesce(piva,''), '\D', '', 'g') as piva
      from clienti_master where codice = p_codice
  )
  select m.codice from clienti_master m, mio
   where regexp_replace(coalesce(m.piva,''), '\D', '', 'g') = mio.piva
     and mio.piva ~ '^[0-9]{9,}$'
     and mio.piva <> '00000000000'
     and m.codice <> p_codice;
$$;

comment on function codici_dello_stesso_cliente(text) is
  'Gli altri codici dello stesso cliente, riconosciuti dalla partita IVA. La P.IVA 00000000000 e quelle troppo corte non sono identita'' e restano fuori.';

create or replace function metodo_del_cliente(p_codice text)
returns text
language sql
stable
as $$
  SELECT coalesce(
    -- 1. la scheda: l'ultima parola di una persona
    (SELECT metodo_pagamento_canonico(co.metodo_pagamento) FROM clienti_override co
      WHERE co.codice_cliente = p_codice AND metodo_pagamento_canonico(co.metodo_pagamento) IS NOT NULL LIMIT 1),
    -- 1-bis. la scheda dello stesso cliente sotto l'altro suo codice: e' la
    -- stessa partita IVA, e il dato l'ha scritto una persona lo stesso
    (SELECT metodo_pagamento_canonico(co.metodo_pagamento) FROM clienti_override co
      WHERE co.codice_cliente IN (SELECT codici_dello_stesso_cliente(p_codice))
        AND metodo_pagamento_canonico(co.metodo_pagamento) IS NOT NULL LIMIT 1),
    -- 2. i suoi ordini nel magazzino: qualcuno l'ha scritto lavorando
    (SELECT metodo_pagamento_canonico(o.metodo_pagamento) FROM ordini o
      WHERE o.id_cliente = p_codice AND metodo_pagamento_canonico(o.metodo_pagamento) IS NOT NULL
      ORDER BY o.data_ordine DESC NULLS LAST LIMIT 1),
    -- 3. lo snapshot che l'agente manda con l'ordine, e l'ordine agenti stesso
    (SELECT metodo_pagamento_canonico(a.cliente->>'metodo_pagamento') FROM ordini_agenti a
      WHERE a.cliente_id = p_codice AND metodo_pagamento_canonico(a.cliente->>'metodo_pagamento') IS NOT NULL
      ORDER BY a.creato_il DESC LIMIT 1),
    (SELECT metodo_pagamento_canonico(a.metodo_pagamento) FROM ordini_agenti a
      WHERE a.cliente_id = p_codice AND metodo_pagamento_canonico(a.metodo_pagamento) IS NOT NULL
      ORDER BY a.creato_il DESC LIMIT 1),
    -- 4. le fatture emesse, per codice e per partita IVA
    (SELECT f.metodo FROM v_metodo_da_fatture f WHERE f.codice_cliente = p_codice AND f.certo AND f.metodo IS NOT NULL LIMIT 1),
    (SELECT f.metodo FROM clienti_master m
       JOIN fatture_emesse fe ON regexp_replace(coalesce(fe.controparte_piva,''), '\D', '', 'g') = regexp_replace(coalesce(m.piva,''), '\D', '', 'g')
       JOIN v_metodo_da_fatture f ON f.codice_gestionale = fe.codice_cliente
      WHERE m.codice = p_codice AND regexp_replace(coalesce(m.piva,''), '\D', '', 'g') ~ '^[0-9]{8,}$'
        AND f.certo AND f.metodo IS NOT NULL LIMIT 1),
    -- 5. i documenti Sibill (stessa logica: metodo + scadenza dichiarata)
    (SELECT s.metodo FROM clienti_master m
       JOIN v_metodo_da_sibill s ON s.piva = regexp_replace(coalesce(m.piva,''), '\D', '', 'g')
      WHERE m.codice = p_codice AND s.certo AND s.metodo IS NOT NULL LIMIT 1),
    -- 6. la storia grezza del gestionale, se per caso e' leggibile
    (SELECT metodo_pagamento_canonico(c.metodo) FROM clienti_metodo_pagamento c
      WHERE c.codice_cliente = ltrim(regexp_replace(p_codice, '^CLI-', ''), '0') LIMIT 1)
  );
$$;
