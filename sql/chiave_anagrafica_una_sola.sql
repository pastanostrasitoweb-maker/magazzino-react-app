-- LA CHIAVE DELL'ANAGRAFICA: UNA REGOLA SOLA, E MAI IL SEGNAPOSTO.
--
-- Luca, 24/08/2026: "se ti sistemo un'anagrafica devi registrare la modifica.
-- Se te la modifico quando sta in ordine perche' manca qualcosa, poi te la devi
-- ricordare per sempre".
--
-- Non se la ricordava, per due motivi:
--   1. 1.028 clienti hanno "00000000000" al posto della P.IVA (privati e
--      clienti senza partita IVA). Con la vecchia regola finivano TUTTI sulla
--      chiave 'piva:00000000000', cioe' su UNA anagrafica sola: chi sistemava
--      l'indirizzo di uno lo scriveva addosso agli altri mille, e il dato del
--      cliente giusto non si trovava piu'.
--   2. Un'anagrafica salvata quando il cliente non aveva ancora la P.IVA
--      finiva sotto 'nome:...'. Appena la P.IVA arrivava, l'app cercava
--      'piva:...' e non trovava piu' niente: tutto da riscrivere.
--
-- Questa funzione e' l'unica regola, e la usano tutti i trigger.
create or replace function chiave_anagrafica(p_piva text, p_nome text)
returns text language sql immutable as $$
  select case
    when coalesce(regexp_replace(coalesce(p_piva, ''), '\D', '', 'g'), '') <> ''
     and length(regexp_replace(coalesce(p_piva, ''), '\D', '', 'g')) >= 8
     and regexp_replace(coalesce(p_piva, ''), '\D', '', 'g') !~ '^0+$'
    then 'piva:' || regexp_replace(p_piva, '\D', '', 'g')
    when coalesce(btrim(p_nome), '') <> ''
    then 'nome:' || lower(btrim(p_nome))
    else null
  end;
$$;
grant execute on function chiave_anagrafica(text, text) to anon, authenticated;
