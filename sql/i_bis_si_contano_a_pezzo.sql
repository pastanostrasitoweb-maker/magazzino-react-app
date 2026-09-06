-- I BIS SI CONTANO A PEZZO (04/09/2026)
--
-- Regola di Luca: "per tutti i BIS metti PZ, ragioniamo non a CT ma a PZ".
--
-- Non e' un capriccio, e' una correzione: il magazzino i BIS li conta GIA' a
-- pezzo e l'anagrafica diceva un'altra cosa. Prove raccolte prima di toccare:
--   - il carico di BIS 03 lotto L305 e' stato di 3600 (120 cartoni da 30), e la
--     giacenza di BIS 03 e' 4058: numeri da pezzi, non da cartoni;
--   - negli ordini convivono le due unita' sullo stesso articolo: c'e' chi
--     scrive 1 x 27,00 euro (un cartone) e chi 60 x 0,55 euro (pezzi).
-- Conseguenza: chi ordinava "1 cartone" scaricava UN PEZZO dalla giacenza, e il
-- peso spedito usava il peso del cartone su una quantita' in pezzi.
--
-- `peso_kg` e' il peso di UNA UNITA' D'ORDINE: cambiando l'unita' cambia anche
-- lui, da peso del cartone a peso del pezzo. `pezzi_collo` NON si cancella:
-- dice ancora com'e' fatto il cartone e serve a chi prepara i colli.

-- ---------------------------------------------------------------------------
-- 1. Il vincolo vecchio diceva una cosa vera solo meta' delle volte
--    (`peso_kg = peso_pezzo x pezzi_collo` vale se si ordina a CARTONE; se si
--    ordina a pezzo il peso dell'unita' e' il peso del pezzo). Al suo posto non
--    si mette un vincolo piu' stretto: sei articoli surgelati lo violerebbero
--    gia' oggi, e un vincolo che blocca anche le correzioni giuste e' una mina
--    (lezione del 03/09). Si mette una VISTA che li fa vedere.
-- ---------------------------------------------------------------------------
alter table prodotti drop constraint if exists prodotti_peso_collo_coerente;

create or replace view v_pesi_incoerenti as
select
  p.codice_prodotto,
  p.descrizione_prodotto,
  p.um,
  p.peso_kg,
  p.peso_pezzo_kg,
  p.pezzi_collo,
  case
    when upper(btrim(coalesce(p.um,''))) = 'PZ' and p.peso_kg > p.peso_pezzo_kg * 1.5
      then 'si ordina a PEZZO ma il peso e quello del CARTONE: ogni spedizione pesa ' ||
           round(p.peso_kg / nullif(p.peso_pezzo_kg,0)) || ' volte tanto'
    when upper(btrim(coalesce(p.um,''))) <> 'PZ' and abs(p.peso_kg - p.peso_pezzo_kg * p.pezzi_collo) > 0.001
      then 'si ordina a CARTONE ma il peso non e quello del cartone'
    else null
  end as problema
from prodotti p
where p.peso_pezzo_kg is not null
  and p.pezzi_collo is not null
  and p.peso_kg is not null
  and (
    (upper(btrim(coalesce(p.um,''))) = 'PZ' and abs(p.peso_kg - p.peso_pezzo_kg) > 0.001)
    or (upper(btrim(coalesce(p.um,''))) <> 'PZ' and abs(p.peso_kg - (p.peso_pezzo_kg * p.pezzi_collo)) > 0.001)
  );

grant select on v_pesi_incoerenti to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. I BIS passano a pezzo, e il peso li segue
-- ---------------------------------------------------------------------------
update prodotti
   set peso_pezzo_kg = coalesce(peso_pezzo_kg, round(peso_kg / pezzi_collo, 4)),
       peso_kg       = coalesce(peso_pezzo_kg, round(peso_kg / pezzi_collo, 4)),
       um            = 'PZ'
 where codice_prodotto ilike 'BIS%'
   and coalesce(pezzi_collo, 0) > 0
   and upper(btrim(coalesce(um, ''))) <> 'PZ';
