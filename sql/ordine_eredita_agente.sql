-- L'ORDINE SI PRENDE L'AGENTE DAL CLIENTE.
--
-- Luca, 25/08/2026: "Eccellenze Nolane non risulta assegnato all'agente".
-- L'anagrafica del cliente lo sapeva benissimo (Francesco Romaggioli, AG-056):
-- era l'ordine che non se lo portava dietro. Succede a tutti gli ordini
-- caricati in casa, perche' l'agente viaggia solo con gli ordini che arrivano
-- dall'app agenti. Dal 03/08 erano 23 su 124, e per tutti e 23 l'agente era
-- gia' scritto in anagrafica.
--
-- Il verso opposto esisteva gia' (agente_impara_dal_ordine: l'ordine insegna
-- all'anagrafica). Mancava questo: l'anagrafica insegna all'ordine.
--
-- Non sovrascrive MAI un agente gia' scritto sull'ordine: se quell'ordine l'ha
-- fatto qualcun altro, comanda quello che c'e' scritto sull'ordine.
create or replace function agente_dal_cliente()
returns trigger language plpgsql as $$
declare
  v_chiave text;
  v_piva   text;
  v_rag    text;
  v_id     text;
  v_nome   text;
begin
  if coalesce(trim(new.agente_nome), '') <> '' then return new; end if;
  if new.id_cliente is null then return new; end if;

  -- Stessa chiave che usa l'app (clientKeyFor): P.IVA se c'e', altrimenti il
  -- nome normalizzato. Se non combacia, l'anagrafica non si trova piu'.
  select nullif(m.piva, ''), m.ragione_sociale into v_piva, v_rag
    from clienti_master m where m.codice = new.id_cliente;
  if not found then return new; end if;

  v_chiave := case when coalesce(v_piva, '') <> ''
                   then 'piva:' || regexp_replace(v_piva, '\D', '', 'g')
                   else 'nome:' || lower(btrim(coalesce(v_rag, new.cliente))) end;

  select co.agente_id, co.agente_nome into v_id, v_nome
    from clienti_override co where co.chiave = v_chiave;

  if coalesce(trim(v_nome), '') = '' then return new; end if;

  new.agente_id   := nullif(trim(coalesce(v_id, '')), '');
  new.agente_nome := trim(v_nome);
  return new;
end;
$$;

drop trigger if exists trg_agente_dal_cliente on ordini;
create trigger trg_agente_dal_cliente
  before insert or update of id_cliente, agente_nome on ordini
  for each row execute function agente_dal_cliente();
