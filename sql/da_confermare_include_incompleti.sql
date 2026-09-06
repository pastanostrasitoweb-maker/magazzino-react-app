-- CONFERMATO NON VUOL DIRE COMPLETO.
--
-- Difetto mio, trovato il 26/08/2026 controllando i primi dieci confermati:
-- Farmacia Domegliara risultava confermata (qualcuno aveva sistemato il metodo
-- di pagamento) ma le mancavano ancora citta' e provincia. E siccome la lista
-- rossa escludeva TUTTI i confermati, era sparita dall'elenco pur avendo due
-- buchi che domani mattina bloccano il documento.
--
-- Sono due cose diverse e servono tutte e due:
--   confermato = una persona ci ha messo mano
--   completo   = i dati bastano a fare il documento
-- Un cliente puo' essere confermato e incompleto: e' il caso peggiore, perche'
-- sembra a posto. Quindi resta in elenco finche' non e' tutte e due le cose.
drop view if exists v_clienti_da_confermare;
create view v_clienti_da_confermare as
  select a.chiave, a.codice_cliente, a.ragione_sociale,
         a.metodo_pagamento, a.agente_nome, a.mancano,
         (c.chiave is not null) as gia_confermato,
         c.codice_r,
         (select max(coalesce(o.data_preparato, o.data_ordine))
            from ordini o where o.id_cliente = a.codice_cliente) as ultimo_ordine
    from v_clienti_allineamento a
    left join clienti_confermati c on c.chiave = a.chiave
   where exists (select 1 from ordini o
                  where o.id_cliente = a.codice_cliente
                    and coalesce(o.data_preparato, o.data_ordine) >= '2026-08-03')
     -- resta in lista se: non l'ha confermato nessuno, OPPURE e' confermato ma
     -- ha ancora dei buchi
     and (c.chiave is null or cardinality(a.mancano) > 0);
grant select on v_clienti_da_confermare to anon, authenticated;
