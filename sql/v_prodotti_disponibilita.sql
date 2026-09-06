-- Il semaforo dell'app agenti mostrava verde su merce gia' promessa.
-- Causa: leggeva v_lotti_disponibilita.disponibile, che e' la giacenza LORDA
-- (prenotato e' 0::numeric per scelta, regola Luca 24/08/2026: "mi deve
-- impegnare solo ed esclusivamente l'articolo e non i lotti").
-- Quella vista NON si tocca: la leggono anche produzione e direzione, e per
-- il magazzino il lotto a giacenza piena e' la proposta di prelievo.
-- L'impegno vive sull'ARTICOLO. Qui lo si espone con la STESSA definizione
-- che il magazzino usa gia' a video (App.jsx productCommittedMap):
-- quantita_ordinata sugli ordini non archiviati il cui stato non e'
-- preparato / spedito (merce gia' scalata dalla giacenza: contarla di nuovo
-- la peserebbe due volte) ne' fermo (sospeso, la sua merce e' di nuovo di tutti).

create or replace view public.v_prodotti_disponibilita as
with impegno as (
  select r.id_prodotto as pid,
         sum(coalesce(r.quantita_ordinata, 0)) as impegnato
  from public.righe_ordine r
  join public.ordini o on o.id_ordine = r.id_ordine
  where o.archiviato is not true
    and lower(trim(coalesce(o.stato, ''))) not in ('preparato', 'spedito', 'fermo')
  group by r.id_prodotto
),
giacenza as (
  select l.id_prodotto as pid,
         sum(coalesce(l.quantita_caricata, 0)) as giacenza
  from public.lotti l
  where l.archiviato is not true
  group by l.id_prodotto
)
select p.id_prodotto,
       p.codice_prodotto,
       p.descrizione_prodotto,
       p.categoria,
       coalesce(g.giacenza, 0)::numeric   as giacenza,
       coalesce(i.impegnato, 0)::numeric  as impegnato,
       -- Netto VERO, negativo compreso: chi decide la luce deve vedere il -8.
       -- Clampare qui trasformerebbe un -8 in uno 0 "neutro".
       (coalesce(g.giacenza, 0) - coalesce(i.impegnato, 0))::numeric as disponibile,
       -- Quanto si puo' ancora vendere davvero: mai sotto zero.
       greatest(0, coalesce(g.giacenza, 0) - coalesce(i.impegnato, 0))::numeric as vendibile
from public.prodotti p
left join giacenza g on g.pid = p.id_prodotto::text
left join impegno  i on i.pid = p.id_prodotto::text;

comment on view public.v_prodotti_disponibilita is
  'Disponibilita'' per ARTICOLO. disponibile = giacenza - impegnato e puo'' essere negativo (merce promessa piu'' di quella che c''e''). vendibile e'' lo stesso valore mai sotto zero. Definizione di impegnato allineata a productCommittedMap del magazzino.';

-- Vista di controllo per la sede: cosa e' scoperto adesso.
create or replace view public.v_giacenze_scoperte as
select id_prodotto,
       codice_prodotto,
       descrizione_prodotto,
       categoria,
       giacenza,
       impegnato,
       disponibile,
       case when disponibile < 0 then 'SOTTO ZERO: promesso piu'' del disponibile'
            else 'ESAURITO: tutto impegnato' end as situazione
from public.v_prodotti_disponibilita
where impegnato > 0 and disponibile <= 0;

comment on view public.v_giacenze_scoperte is
  'Articoli con impegni aperti e disponibile netto <= 0. Sotto zero = merce gia'' promessa a piu'' clienti di quanta ne esista.';

grant select on public.v_prodotti_disponibilita to anon, authenticated;
grant select on public.v_giacenze_scoperte      to anon, authenticated;
