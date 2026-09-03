-- UNA CASCATA SOLA PER IL METODO.
--
-- metodo_pagamento_effettivo cercava la scheda del cliente in un modo solo:
-- 'piva:' + partita IVA, passando per clienti_master. Chi ha la scheda agganciata
-- al CODICE (tutti i clienti nati fuori dal gestionale, come MEA Libera Tutti)
-- non veniva trovato: il metodo era scritto nero su bianco sulla scheda e sul
-- DDT, e l'ordine restava rosso "senza metodo".
--
-- E' la stessa lezione dell'anagrafica: la scheda si trova per codice cliente,
-- non per una chiave ricalcolata. Qui la cascata smette di essere doppia e
-- delega a metodo_del_cliente, che le fonti le mette gia' in fila.

create or replace function metodo_pagamento_effettivo(p_id_ordine text)
returns text
language sql
stable
as $$
  SELECT COALESCE(
           -- 1. quello scritto sull'ordine: e' la deroga per la singola vendita
           metodo_pagamento_canonico(o.metodo_pagamento),
           -- 2. tutto il resto lo sa gia' metodo_del_cliente (scheda, ordini,
           --    app agenti, fatture emesse, Sibill, storia del gestionale)
           metodo_del_cliente(o.id_cliente)
         )
    FROM ordini o
   WHERE o.id_ordine = p_id_ordine;
$$;
