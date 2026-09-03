-- QUELLO CHE L'AGENTE HA GIA' SCRITTO DIVENTA SCHEDA.
--
-- Luca, 03/09/2026, mostrando il DDT 2004: "ecco mea libera tutti, lo hai..".
-- Aveva ragione. Sul documento c'erano partita IVA, PEC, telefono, orari di
-- scarico, giorno di chiusura e "Bonifico 30FM". Nella scheda del cliente non
-- c'era niente: la riga era nata vuota, con i soli flag, cinque minuti dopo la
-- stampa del DDT.
--
-- Il motivo: l'anagrafica che l'agente compila resta dentro il JSON dell'ordine
-- e nessuno la travasa nella scheda. Il documento la legge da li' e la stampa,
-- ma il cliente successivo riparte da zero e finisce nell'elenco di quelli
-- "senza metodo di pagamento". Il dato non mancava: non era mai stato messo al
-- suo posto.
--
-- Qui si travasa, con tre prudenze:
--   1. NON SI SOVRASCRIVE MAI. Si riempie solo cio' che e' vuoto: quello che ha
--      scritto una persona vale piu' di quello che arriva dall'ordine.
--   2. Il metodo passa da metodo_pagamento_canonico: se non e' abbastanza per
--      fare una scadenza ("Come convenuto") resta vuoto e in rosso.
--   3. Se qualcosa va storto l'ordine entra lo stesso. Un'anagrafica non e' un
--      buon motivo per fermare il magazzino.

create or replace function scheda_dai_dati_ordine(p_cliente jsonb, p_operatore text default 'da ordine agente')
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_piva     text := nullif(regexp_replace(coalesce(p_cliente->>'partita_iva',''), '[^0-9]', '', 'g'), '');
  v_codice   text := nullif(trim(coalesce(p_cliente->>'id','')), '');
  v_chiave   text;
  v_metodo   text := metodo_pagamento_canonico(nullif(p_cliente->>'metodo_pagamento',''));
begin
  if p_cliente is null then return null; end if;

  -- L'aggancio e' quello di sempre: prima il codice, poi la partita IVA.
  select chiave into v_chiave from clienti_override
   where v_codice is not null and codice_cliente = v_codice
   limit 1;

  if v_chiave is null and v_piva is not null then
    select chiave into v_chiave from clienti_override
     where chiave = 'piva:'||v_piva
        or regexp_replace(coalesce(partita_iva,''), '[^0-9]', '', 'g') = v_piva
     limit 1;
  end if;

  if v_chiave is null then
    v_chiave := case when v_piva is not null then 'piva:'||v_piva
                     else 'nome:'||lower(trim(coalesce(p_cliente->>'ragione_sociale','')))
                end;
    if v_chiave in ('nome:', 'piva:') then return null; end if;
    insert into clienti_override (chiave, operatore) values (v_chiave, p_operatore)
    on conflict (chiave) do nothing;
  end if;

  update clienti_override c set
    ragione_sociale      = coalesce(nullif(c.ragione_sociale,''),      nullif(p_cliente->>'ragione_sociale','')),
    insegna              = coalesce(nullif(c.insegna,''),              nullif(p_cliente->>'insegna','')),
    partita_iva          = coalesce(nullif(c.partita_iva,''),          v_piva),
    pec                  = coalesce(nullif(c.pec,''),                  nullif(p_cliente->>'pec','')),
    email                = coalesce(nullif(c.email,''),                nullif(p_cliente->>'email','')),
    telefono             = coalesce(nullif(c.telefono,''),             nullif(p_cliente->>'telefono','')),
    codice_univoco       = coalesce(nullif(c.codice_univoco,''),       nullif(p_cliente->>'codice_univoco','')),
    citta                = coalesce(nullif(c.citta,''),                nullif(p_cliente->>'citta','')),
    provincia            = coalesce(nullif(c.provincia,''),            nullif(p_cliente->>'provincia','')),
    cap                  = coalesce(nullif(c.cap,''),                  nullif(p_cliente->>'cap','')),
    sede_legale          = coalesce(nullif(c.sede_legale,''),          nullif(p_cliente->>'sede_legale',''), nullif(p_cliente->>'indirizzo','')),
    indirizzo_spedizione = coalesce(nullif(c.indirizzo_spedizione,''), nullif(p_cliente->>'indirizzo_spedizione','')),
    orari_consegna       = coalesce(nullif(c.orari_consegna,''),       nullif(p_cliente->>'orario_scarico','')),
    giorno_chiusura      = coalesce(nullif(c.giorno_chiusura,''),      nullif(p_cliente->>'giorno_chiusura','')),
    metodo_pagamento     = coalesce(nullif(c.metodo_pagamento,''),     v_metodo),
    codice_cliente       = coalesce(nullif(c.codice_cliente,''),       v_codice),
    agente_nome          = coalesce(nullif(c.agente_nome,''),          nullif(p_cliente->>'agente_nome','')),
    agente_id            = coalesce(nullif(c.agente_id,''),            nullif(p_cliente->>'agente_id','')),
    operatore            = coalesce(nullif(c.operatore,''),            p_operatore),
    aggiornato_il        = now()
  where c.chiave = v_chiave;

  return v_chiave;
end;
$$;

comment on function scheda_dai_dati_ordine(jsonb, text) is
  'Travasa nella scheda cliente i dati che l''agente ha gia'' scritto sull''ordine. Riempie solo i campi vuoti: non sovrascrive mai una persona.';

-- Da qui in avanti succede da solo, all'arrivo dell'ordine.
create or replace function _scheda_dall_ordine_agente()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    perform scheda_dai_dati_ordine(new.cliente, 'da ordine agente');
  exception when others then
    null; -- l'ordine entra lo stesso
  end;
  return new;
end;
$$;

drop trigger if exists trg_scheda_dall_ordine on ordini_agenti;
create trigger trg_scheda_dall_ordine
after insert or update of cliente on ordini_agenti
for each row execute function _scheda_dall_ordine_agente();
