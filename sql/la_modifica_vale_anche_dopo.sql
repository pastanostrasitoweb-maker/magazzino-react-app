-- OGNI MODIFICA VALE PER QUELL'ORDINE E PER QUELLI FUTURI.
--
-- Luca, 25/08/2026: "ogni modifica che faccio vale per quell'ordine e per quelli
-- futuri. Se voglio modificare qualcosa sui futuri ordini lo rimodifichero'".
--
-- Fin qui i trigger riempivano solo i BUCHI: se l'anagrafica aveva gia' un
-- valore, la correzione fatta sull'ordine restava li' e non risaliva. L'avevo
-- deciso io per prudenza, e la prudenza era sbagliata: chi corregge sa quello
-- che fa, e se cambia idea corregge di nuovo. Adesso l'ultima parola e' sempre
-- l'ultima scritta.

-- (imposta_metodo_pagamento e' stata aggiornata a parte: la sua firma
--  esisteva gia' e non si puo' ricreare con nomi diversi)

-- METODO E LISTINO SCRITTI SULL'ORDINE
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
    set metodo_pagamento = coalesce(nullif(trim(coalesce(new.metodo_pagamento, '')), ''),
                                    clienti_override.metodo_pagamento),
        listino_standard = coalesce(nullif(trim(coalesce(new.listino, '')), ''),
                                    clienti_override.listino_standard),
        aggiornato_il = now();
  return new;
end;
$$;

-- IL CORRIERE
create or replace function corriere_impara_dal_ordine()
returns trigger language plpgsql as $$
declare
  v_chiave text; v_piva text; v_rag text; v_corr text;
begin
  v_corr := nullif(btrim(coalesce(new.corriere_spedizione, new.corriere, '')), '');
  if v_corr is null then return new; end if;
  if new.id_cliente is null then return new; end if;
  select nullif(m.piva, ''), m.ragione_sociale into v_piva, v_rag
    from clienti_master m where m.codice = new.id_cliente;
  if not found then return new; end if;
  v_chiave := chiave_anagrafica(v_piva, coalesce(v_rag, new.cliente));
  if v_chiave is null then return new; end if;
  update clienti_override set corriere_abituale = v_corr, aggiornato_il = now()
   where chiave = v_chiave;
  return new;
end;
$$;

-- L'AGENTE. Unica eccezione che resta: "Direzionale" non si impara, perche' non
-- e' una scelta ma il ripiego di quando non si sa chi segue il cliente.
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
          nullif(trim(coalesce(new.agente_id, '')), ''), trim(new.agente_nome), 'da ordine', now())
  on conflict (chiave) do update
    set agente_nome = trim(new.agente_nome),
        agente_id = coalesce(nullif(trim(coalesce(new.agente_id, '')), ''), clienti_override.agente_id),
        aggiornato_il = now();
  return new;
end;
$$;
