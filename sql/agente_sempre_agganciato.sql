-- L'ORDINE SI AGGANCIA SEMPRE A UN AGENTE.
--
-- Luca, 24/08/2026: "l'ordine che viene caricato da sede deve comunque
-- agganciarsi all'agente, anche se e' direzionale, ma deve sempre agganciarsi e
-- comunicare con l'app agenti".
--
-- Il buco: 562 anagrafiche su 670 non hanno un agente scritto. Per quei clienti
-- l'ordine nasceva orfano e non arrivava a nessuno. Adesso, quando nessuno lo
-- reclama, l'ordine e' della direzione: e' la verita' (l'ha venduto la sede) ed
-- e' comunque qualcuno a cui agganciarlo.
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

  if new.id_cliente is not null then
    -- Stessa chiave che usa l'app (clientKeyFor): P.IVA se c'e', altrimenti il
    -- nome normalizzato. Se non combacia, l'anagrafica non si trova piu'.
    select nullif(m.piva, ''), m.ragione_sociale into v_piva, v_rag
      from clienti_master m where m.codice = new.id_cliente;

    if found then
      v_chiave := case when coalesce(v_piva, '') <> ''
                       then 'piva:' || regexp_replace(v_piva, '\D', '', 'g')
                       else 'nome:' || lower(btrim(coalesce(v_rag, new.cliente))) end;
      select co.agente_id, co.agente_nome into v_id, v_nome
        from clienti_override co where co.chiave = v_chiave;
    end if;
  end if;

  -- NESSUNO LO RECLAMA: e' della direzione. Meglio un ordine che si vede in
  -- casa che un ordine che non vede nessuno.
  if coalesce(trim(v_nome), '') = '' then
    v_id := 'AG-999'; v_nome := 'Direzionale';
  end if;

  new.agente_id   := nullif(trim(coalesce(v_id, '')), '');
  new.agente_nome := trim(v_nome);
  return new;
end;
$$;

-- DIREZIONALE NON SI IMPARA.
-- L'altro trigger (agente_impara_dal_ordine) scrive in anagrafica l'agente che
-- vede sull'ordine, quando l'anagrafica non ne ha. Ma "Direzionale" ora e'
-- anche il ripiego di quando non si sa: impararlo vorrebbe dire congelare in
-- anagrafica una supposizione, e da quel momento il cliente non sarebbe piu'
-- assegnabile all'agente vero senza correggerlo a mano.
create or replace function agente_impara_dal_ordine()
returns trigger language plpgsql as $$
declare
  v_chiave text;
  v_piva   text;
  v_rag    text;
begin
  if coalesce(trim(new.agente_nome), '') = '' then return new; end if;
  if new.id_cliente is null then return new; end if;
  if lower(btrim(new.agente_nome)) = 'direzionale' then return new; end if;

  select nullif(m.piva, ''), m.ragione_sociale into v_piva, v_rag
    from clienti_master m where m.codice = new.id_cliente;
  if not found then return new; end if;

  v_chiave := case when coalesce(v_piva, '') <> ''
                   then 'piva:' || regexp_replace(v_piva, '\D', '', 'g')
                   else 'nome:' || lower(btrim(coalesce(v_rag, new.cliente))) end;

  insert into clienti_override (chiave, ragione_sociale, agente_id, agente_nome, operatore, aggiornato_il)
  values (v_chiave, coalesce(v_rag, new.cliente),
          nullif(trim(coalesce(new.agente_id, '')), ''), trim(new.agente_nome),
          'automatico', now())
  on conflict (chiave) do update
    set agente_nome = trim(new.agente_nome),
        agente_id   = coalesce(nullif(trim(coalesce(new.agente_id,'')), ''), clienti_override.agente_id),
        aggiornato_il = now()
   where coalesce(trim(clienti_override.agente_nome), '') = '';

  return new;
end;
$$;
