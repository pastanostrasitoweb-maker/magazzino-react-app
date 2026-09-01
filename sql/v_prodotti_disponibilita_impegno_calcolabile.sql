-- "Un impegno che non si riesce a calcolare NON e' un impegno pari a zero."
-- Il difetto appena chiuso era prenotato = 0 fisso: tutto sembrava libero e il
-- semaforo era verde. Se domani una riga d'ordine perde quantita_ordinata,
-- l'impegnato torna a essere sottostimato e il verde ricompare, ma stavolta
-- con un meccanismo che "funziona" e che quindi nessuno va a controllare.
-- Qui si separa "impegnato 0 perche' calcolato e davvero zero" da "impegnato
-- ignoto". Chi legge decide: l'app agenti, se l'impegno non e' calcolabile,
-- NON accende il verde, TACE (un articolo senza luce fa chiedere, un verde
-- sbagliato fa vendere merce che non c'e').
-- Colonna aggiunta IN FONDO: create or replace view non consente di cambiare
-- nome o ordine di quelle che ci sono gia'.

create or replace view public.v_prodotti_disponibilita as
with impegno as (
  select r.id_prodotto as pid,
         sum(coalesce(r.quantita_ordinata, 0)) as impegnato,
         -- Righe che dovrebbero pesare ma non si sanno pesare.
         count(*) filter (where r.quantita_ordinata is null) as righe_incerte
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
       (coalesce(g.giacenza, 0) - coalesce(i.impegnato, 0))::numeric as disponibile,
       greatest(0, coalesce(g.giacenza, 0) - coalesce(i.impegnato, 0))::numeric as vendibile,
       -- false = c'e' almeno una riga aperta di questo articolo che non si sa
       -- quantificare, quindi il netto qui sopra e' una SOTTOSTIMA dell'impegno.
       (coalesce(i.righe_incerte, 0) = 0) as impegno_calcolabile
from public.prodotti p
left join giacenza g on g.pid = p.id_prodotto::text
left join impegno  i on i.pid = p.id_prodotto::text;

create or replace view public.v_giacenze_scoperte as
select id_prodotto,
       codice_prodotto,
       descrizione_prodotto,
       categoria,
       giacenza,
       impegnato,
       disponibile,
       case when disponibile < 0 then 'SOTTO ZERO: promesso piu'' del disponibile'
            else 'ESAURITO: tutto impegnato' end as situazione,
       impegno_calcolabile
from public.v_prodotti_disponibilita
where impegnato > 0 and disponibile <= 0;

-- Sentinella: gli articoli il cui impegno NON si sa calcolare. Oggi e' vuota
-- (0 righe aperte senza quantita_ordinata). Se un giorno si popola, il
-- semaforo di quegli articoli si spegne invece di mentire, e qui si vede chi.
create or replace view public.v_impegno_incerto as
select id_prodotto, codice_prodotto, descrizione_prodotto, giacenza, impegnato, disponibile
from public.v_prodotti_disponibilita
where impegno_calcolabile is not true;

grant select on public.v_prodotti_disponibilita to anon, authenticated;
grant select on public.v_giacenze_scoperte      to anon, authenticated;
grant select on public.v_impegno_incerto        to anon, authenticated;
