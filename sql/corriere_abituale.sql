-- IL CORRIERE SI RICORDA COME TUTTO IL RESTO.
--
-- Luca, 25/08/2026: "qualsiasi modifica che ci dici in rosso che c'e' un dato
-- mancante, noi te la modifichiamo e tu te la ricordi per sempre".
--
-- Il corriere e' uno dei dati che il magazzino segnala in rosso (blocca il DDT),
-- ma non era scritto da nessuna parte sul cliente: si sceglieva su OGNI ordine,
-- e la volta dopo ricompariva in rosso. Adesso l'ordine lo insegna
-- all'anagrafica e l'anagrafica lo passa agli ordini nuovi.
--
-- Resta una PROPOSTA, non una regola: il corriere vero dipende anche da dove va
-- la merce e dalla temperatura, e il motore del preventivo continua a dire la
-- sua. Ma non si riparte piu' da zero ogni volta.
alter table clienti_override add column if not exists corriere_abituale text;

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

  -- Si riempie il buco, non si sovrascrive: se qualcuno ha gia' scelto il
  -- corriere abituale di questo cliente, comanda quello.
  update clienti_override
     set corriere_abituale = v_corr, aggiornato_il = now()
   where chiave = v_chiave
     and coalesce(btrim(corriere_abituale), '') = '';
  return new;
end;
$$;

drop trigger if exists trg_corriere_impara on ordini;
create trigger trg_corriere_impara
  after insert or update of corriere, corriere_spedizione on ordini
  for each row execute function corriere_impara_dal_ordine();

-- E l'ordine nuovo se lo prende, se non ne ha gia' uno.
create or replace function corriere_dal_cliente()
returns trigger language plpgsql as $$
declare
  v_chiave text; v_piva text; v_rag text; v_corr text;
begin
  if coalesce(btrim(coalesce(new.corriere, '')), '') <> '' then return new; end if;
  if new.id_cliente is null then return new; end if;
  select nullif(m.piva, ''), m.ragione_sociale into v_piva, v_rag
    from clienti_master m where m.codice = new.id_cliente;
  if not found then return new; end if;
  v_chiave := chiave_anagrafica(v_piva, coalesce(v_rag, new.cliente));
  if v_chiave is null then return new; end if;
  select nullif(btrim(coalesce(corriere_abituale, '')), '') into v_corr
    from clienti_override where chiave = v_chiave;
  if v_corr is not null then new.corriere := v_corr; end if;
  return new;
end;
$$;

drop trigger if exists trg_corriere_dal_cliente on ordini;
create trigger trg_corriere_dal_cliente
  before insert on ordini
  for each row execute function corriere_dal_cliente();
