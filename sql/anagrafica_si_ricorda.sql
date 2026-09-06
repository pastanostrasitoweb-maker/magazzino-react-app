-- L'ANAGRAFICA SISTEMATA RESTA SISTEMATA.
--
-- Luca, 24/08/2026: "se ti sistemo un'anagrafica devi registrare la modifica.
-- Non e' possibile che inseriamo le modifiche 100 volte. L'obiettivo e' che
-- abbiamo tutte le anagrafiche allineate e lavoriamo in maniera snella".
--
-- Tutti i trigger che scrivono o leggono l'anagrafica del cliente devono usare
-- LA STESSA chiave: se due punti la calcolano in modo diverso, il dato salvato
-- ieri oggi non si trova e l'app lo richiede daccapo.

-- L'ordine impara l'agente dall'anagrafica (con ripiego Direzionale).
create or replace function agente_dal_cliente()
returns trigger language plpgsql as $$
declare
  v_chiave text; v_piva text; v_rag text; v_id text; v_nome text;
begin
  if coalesce(trim(new.agente_nome), '') <> '' then return new; end if;
  if new.id_cliente is not null then
    select nullif(m.piva, ''), m.ragione_sociale into v_piva, v_rag
      from clienti_master m where m.codice = new.id_cliente;
    if found then
      v_chiave := chiave_anagrafica(v_piva, coalesce(v_rag, new.cliente));
      select co.agente_id, co.agente_nome into v_id, v_nome
        from clienti_override co where co.chiave = v_chiave;
    end if;
  end if;
  if coalesce(trim(v_nome), '') = '' then
    v_id := 'AG-999'; v_nome := 'Direzionale';
  end if;
  new.agente_id := nullif(trim(coalesce(v_id, '')), '');
  new.agente_nome := trim(v_nome);
  return new;
end;
$$;

-- L'anagrafica impara l'agente dall'ordine (mai "Direzionale", che e' il ripiego).
create or replace function agente_impara_dal_ordine()
returns trigger language plpgsql as $$
declare
  v_chiave text; v_piva text; v_rag text;
begin
  if coalesce(trim(new.agente_nome), '') = '' then return new; end if;
  if new.id_cliente is null then return new; end if;
  if lower(btrim(new.agente_nome)) = 'direzionale' then return new; end if;

  select nullif(m.piva, ''), m.ragione_sociale into v_piva, v_rag
    from clienti_master m where m.codice = new.id_cliente;
  if not found then return new; end if;
  v_chiave := chiave_anagrafica(v_piva, coalesce(v_rag, new.cliente));
  if v_chiave is null then return new; end if;

  insert into clienti_override (chiave, ragione_sociale, agente_id, agente_nome, operatore, aggiornato_il)
  values (v_chiave, coalesce(v_rag, new.cliente),
          nullif(trim(coalesce(new.agente_id, '')), ''), trim(new.agente_nome), 'automatico', now())
  on conflict (chiave) do update
    set agente_nome = trim(new.agente_nome),
        agente_id = coalesce(nullif(trim(coalesce(new.agente_id,'')), ''), clienti_override.agente_id),
        aggiornato_il = now()
   where coalesce(trim(clienti_override.agente_nome), '') = '';
  return new;
end;
$$;

-- OGNI DATO SCRITTO SULL'ORDINE CHE E' UN DATO DEL CLIENTE finisce anche in
-- anagrafica, se l'anagrafica non ce l'ha. "Prendilo per vero sempre, poi
-- eventuali nuove modifiche le facciamo noi": non si sovrascrive mai un valore
-- gia' scritto a mano, si riempiono solo i buchi.
create or replace function ordine_insegna_al_cliente()
returns trigger language plpgsql as $$
declare
  v_chiave text; v_piva text; v_rag text;
begin
  if new.id_cliente is null then return new; end if;
  select nullif(m.piva, ''), m.ragione_sociale into v_piva, v_rag
    from clienti_master m where m.codice = new.id_cliente;
  if not found then return new; end if;
  v_chiave := chiave_anagrafica(v_piva, coalesce(v_rag, new.cliente));
  if v_chiave is null then return new; end if;

  insert into clienti_override (chiave, ragione_sociale, metodo_pagamento, listino_standard, operatore, aggiornato_il)
  values (v_chiave, coalesce(v_rag, new.cliente),
          nullif(trim(coalesce(new.metodo_pagamento, '')), ''),
          nullif(trim(coalesce(new.listino, '')), ''), 'da ordine', now())
  on conflict (chiave) do update
    set metodo_pagamento = coalesce(nullif(trim(clienti_override.metodo_pagamento), ''),
                                    nullif(trim(coalesce(new.metodo_pagamento, '')), '')),
        listino_standard = coalesce(nullif(trim(clienti_override.listino_standard), ''),
                                    nullif(trim(coalesce(new.listino, '')), '')),
        aggiornato_il = now();
  return new;
end;
$$;

drop trigger if exists trg_ordine_insegna_al_cliente on ordini;
create trigger trg_ordine_insegna_al_cliente
  after insert or update of metodo_pagamento, listino, id_cliente on ordini
  for each row execute function ordine_insegna_al_cliente();
