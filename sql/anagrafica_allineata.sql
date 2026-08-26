-- L'ANAGRAFICA ALLINEATA: UNA TABELLA SOLA, E SI SA CHI E' A POSTO.
--
-- Luca, 26/08/2026: "tra un passaggio e un altro lo perde, a volte lo cambi...
-- ho bisogno che arriviamo ad avere una sola tabella contenente tutti i clienti
-- e che sia allineata... man mano che i clienti ordinano li metti in una tabella
-- definitiva in cui sappiamo che il cliente e' perfettamente allineato".
--
-- COSA SUCCEDEVA DAVVERO. Il metodo non si perdeva: non veniva RICONOSCIUTO.
-- In anagrafica c'erano 31 modi di scrivere la stessa cosa ("Bonifico" secco,
-- "Ri.Ba." secco, e perfino TRANSFER / RIBA / CHECK / CARD / CC in inglese).
-- 466 clienti su 659 avevano un metodo che metodo_pagamento_canonico() non sa
-- leggere, perche' non dice QUANDO si incassa: "Bonifico" non e' una condizione
-- di pagamento, "Bonifico 30 gg fine mese" si'. Ogni controllo li trattava come
-- vuoti e li richiedeva daccapo, a ogni passaggio.
--
-- La cura non e' indovinare i termini mancanti (sarebbe inventare una scadenza:
-- stessa regola dell'IVA mai inventata). E' segnare CHI E' GIA' A POSTO, cosi'
-- l'operatore lo sistema UNA volta - quando quel cliente ordina, che e' quando
-- serve davvero - e da li' in avanti non gli viene piu' chiesto.

alter table clienti_override add column if not exists allineato_il  timestamptz;
alter table clienti_override add column if not exists allineato_da  text;

-- I codici stranieri e le abbreviazioni si traducono: il MEZZO e' certo, e
-- tenere due vocabolari e' proprio la causa del problema. I termini no: quelli
-- non si inventano, restano da chiedere all'operatore.
update clienti_override set metodo_pagamento = case upper(btrim(metodo_pagamento))
    when 'TRANSFER' then 'Bonifico'
    when 'RIBA'     then 'Ri.Ba.'
    when 'CHECK'    then 'Assegno'
    when 'CARD'     then 'Carta di credito'
    when 'CC'       then 'Carta di credito'
    else metodo_pagamento end,
  aggiornato_il = now()
 where upper(btrim(coalesce(metodo_pagamento,''))) in ('TRANSFER','RIBA','CHECK','CARD','CC');

-- UN CLIENTE E' ALLINEATO quando ha tutto quello che serve a fare un documento
-- senza chiedere niente a nessuno. Non e' un'opinione: e' la stessa checklist
-- che blocca il DDT.
create or replace view v_clienti_allineamento as
select co.chiave,
       co.codice_cliente,
       coalesce(co.ragione_sociale, m.ragione_sociale) as ragione_sociale,
       co.metodo_pagamento,
       co.agente_nome,
       co.allineato_il,
       -- Cosa manca, in chiaro: e' l'elenco che l'operatore deve riempire.
       array_remove(array[
         case when coalesce(btrim(co.codice_cliente), '') = '' then 'codice cliente' end,
         case when metodo_pagamento_canonico(co.metodo_pagamento) is null
              then case when coalesce(btrim(co.metodo_pagamento), '') = ''
                        then 'metodo di pagamento'
                        else 'termini di pagamento (c''e'' "' || co.metodo_pagamento || '", non dice quando si incassa)' end
         end,
         case when coalesce(btrim(co.agente_nome), '') = '' then 'agente' end,
         case when coalesce(btrim(co.citta), '') = '' then 'citta' end,
         case when coalesce(btrim(co.provincia), '') = '' then 'provincia' end,
         case when coalesce(btrim(co.sede_legale), '') = '' then 'indirizzo' end
       ], null) as mancano
  from clienti_override co
  left join clienti_master m on m.codice = co.codice_cliente;

-- La tabella definitiva che chiede Luca: i clienti perfettamente allineati.
create or replace view v_clienti_ok as
  select * from v_clienti_allineamento where cardinality(mancano) = 0;

-- E chi manca, ordinato per urgenza: prima quelli che hanno ordinato di recente,
-- perche' sono quelli che bloccheranno un documento domani mattina.
create or replace view v_clienti_da_allineare as
  select a.*,
         (select max(coalesce(o.data_preparato, o.data_ordine))
            from ordini o where o.id_cliente = a.codice_cliente) as ultimo_ordine
    from v_clienti_allineamento a
   where cardinality(a.mancano) > 0
   order by ultimo_ordine desc nulls last;

grant select on v_clienti_allineamento, v_clienti_ok, v_clienti_da_allineare to anon, authenticated;

-- SI TIMBRA DA SOLO. Appena un'anagrafica diventa completa, resta segnata come
-- allineata con la data: cosi' "allineato" e' un fatto verificato dal database,
-- non una spunta che qualcuno mette a mano e poi non corrisponde piu'.
create or replace function timbra_allineamento()
returns trigger language plpgsql as $$
begin
  if coalesce(btrim(new.codice_cliente), '') <> ''
     and metodo_pagamento_canonico(new.metodo_pagamento) is not null
     and coalesce(btrim(new.agente_nome), '') <> ''
     and coalesce(btrim(new.citta), '') <> ''
     and coalesce(btrim(new.provincia), '') <> ''
     and coalesce(btrim(new.sede_legale), '') <> ''
  then
    if new.allineato_il is null then
      new.allineato_il := now();
      new.allineato_da := coalesce(nullif(btrim(new.operatore), ''), 'automatico');
    end if;
  else
    -- Se qualcosa torna incompleto, il timbro cade: meglio saperlo che avere
    -- una lista di "allineati" che non lo sono piu'.
    new.allineato_il := null;
    new.allineato_da := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_timbra_allineamento on clienti_override;
create trigger trg_timbra_allineamento
  before insert or update on clienti_override
  for each row execute function timbra_allineamento();
