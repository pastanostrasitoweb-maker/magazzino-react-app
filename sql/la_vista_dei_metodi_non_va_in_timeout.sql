-- LA FATTURAZIONE SI ERA BLOCCATA (03/09/2026)
--
-- Trovato provando ad aprire "Genera fatture" sull'app vera: il pannello non
-- si apriva affatto, con l'errore
--   "Non riesco a leggere: metodi_fattura: canceling statement due to statement timeout".
--
-- Causa: la vista `metodi_fattura` chiama `metodo_pagamento_effettivo(id_ordine)`
-- DUE VOLTE per riga, su tutti i 489 ordini archiviati con DDT. Quella funzione
-- e' diventata una cascata a sei fonti (ordine -> anagrafica -> snapshot app ->
-- fatture emesse -> Sibill -> storia grezza) col lavoro del 02/09 sui metodi di
-- pagamento: da sola costa ~10 ms per riga, quindi 489 x 2 = circa dieci
-- secondi, oltre il tetto di PostgREST. Il pannello e' rimasto chiuso da
-- allora, e nessuno lo ha collegato a quel lavoro.
--
-- Il rimedio non tocca il risultato, tocca quante volte si paga:
--   1. la funzione si chiama UNA volta per riga, non due;
--   2. si chiama SOLO dove serve. Su 489 documenti, 233 hanno gia' un metodo
--      leggibile sull'ordine e altri 77 lo hanno sulla scheda del cliente:
--      quelli si prendono con una join, che costa zero. La cascata resta per i
--      179 davvero scoperti.
--   `coalesce` valuta in ordine e si ferma al primo valore non nullo, quindi la
--   funzione non viene nemmeno chiamata sulle righe gia' risolte.

create or replace view metodi_fattura as
select
  x.ddt_numero,
  x.id_ordine,
  x.effettivo,
  metodo_pagamento_canonico(x.effettivo) as canonico
from (
  select
    o.ddt_numero,
    o.id_ordine,
    coalesce(
      -- 1. quello scritto sull'ordine, se e' in una forma che fa una scadenza
      case when metodo_pagamento_canonico(o.metodo_pagamento) is not null
           then o.metodo_pagamento end,
      -- 2. quello della scheda del cliente: una join, non una funzione
      case when metodo_pagamento_canonico(c.metodo_pagamento) is not null
           then c.metodo_pagamento end,
      -- 3. e solo per chi resta scoperto si paga la cascata intera
      metodo_pagamento_effettivo(o.id_ordine)
    ) as effettivo
  from ordini o
  left join clienti_override c on c.codice_cliente = o.id_cliente
  where o.archiviato and o.ddt_numero is not null
) x;

grant select on metodi_fattura to anon, authenticated;
