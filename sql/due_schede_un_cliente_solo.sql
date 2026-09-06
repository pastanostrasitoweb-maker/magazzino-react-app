-- DUE SCHEDE, UN CLIENTE SOLO.
--
-- MEA Libera Tutti aveva due schede: quella del CRM di Giusy (PH-IV-0213, con
-- il nome e basta) e quella nata dall'app agenti sulla partita IVA, che dopo il
-- travaso ha tutto: IVA, PEC, telefono, orari, "Bonifico 30 gg fine mese".
-- Gli ordini nuovi entrano con il codice del CRM e trovano la scheda vuota:
-- percio' il cliente risultava senza metodo di pagamento mentre il suo DDT lo
-- stampava a chiare lettere.
--
-- Unire due schede e' un'operazione da fare con le mani ferme (un doppione si
-- corregge, una fusione sbagliata mescola due clienti veri). Quindi:
--   - si tiene la scheda indicata, mai si sceglie da soli;
--   - si riempiono solo i campi VUOTI di quella che resta;
--   - la scheda assorbita viene messa da parte prima di sparire, cosi' si puo'
--     sempre tornare indietro;
--   - gli ordini della scheda assorbita passano al codice che resta, tranne i
--     documenti gia' emessi, che non si toccano mai.

create table if not exists clienti_override_assorbite (
  id            bigserial primary key,
  chiave        text not null,
  riga          jsonb not null,
  assorbita_in  text not null,
  operatore     text,
  quando        timestamptz not null default now()
);

create or replace function unisci_schede_cliente(p_tenere text, p_assorbire text, p_operatore text default 'unione')
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_a clienti_override;  -- quella che resta
  v_b clienti_override;  -- quella che viene assorbita
  v_ordini int := 0;
begin
  select * into v_a from clienti_override where chiave = p_tenere;
  select * into v_b from clienti_override where chiave = p_assorbire;
  if v_a.chiave is null then raise exception 'La scheda da tenere non esiste: %', p_tenere; end if;
  if v_b.chiave is null then raise exception 'La scheda da assorbire non esiste: %', p_assorbire; end if;
  if p_tenere = p_assorbire then raise exception 'Sono la stessa scheda'; end if;

  insert into clienti_override_assorbite (chiave, riga, assorbita_in, operatore)
  values (v_b.chiave, to_jsonb(v_b), v_a.chiave, p_operatore);

  update clienti_override c set
    ragione_sociale      = coalesce(nullif(c.ragione_sociale,''),      nullif(v_b.ragione_sociale,'')),
    insegna              = coalesce(nullif(c.insegna,''),              nullif(v_b.insegna,'')),
    partita_iva          = coalesce(nullif(c.partita_iva,''),          nullif(v_b.partita_iva,'')),
    pec                  = coalesce(nullif(c.pec,''),                  nullif(v_b.pec,'')),
    email                = coalesce(nullif(c.email,''),                nullif(v_b.email,'')),
    telefono             = coalesce(nullif(c.telefono,''),             nullif(v_b.telefono,'')),
    codice_univoco       = coalesce(nullif(c.codice_univoco,''),       nullif(v_b.codice_univoco,'')),
    citta                = coalesce(nullif(c.citta,''),                nullif(v_b.citta,'')),
    provincia            = coalesce(nullif(c.provincia,''),            nullif(v_b.provincia,'')),
    cap                  = coalesce(nullif(c.cap,''),                  nullif(v_b.cap,'')),
    sede_legale          = coalesce(nullif(c.sede_legale,''),          nullif(v_b.sede_legale,'')),
    indirizzo_spedizione = coalesce(nullif(c.indirizzo_spedizione,''), nullif(v_b.indirizzo_spedizione,'')),
    orari_consegna       = coalesce(nullif(c.orari_consegna,''),       nullif(v_b.orari_consegna,'')),
    giorno_chiusura      = coalesce(nullif(c.giorno_chiusura,''),      nullif(v_b.giorno_chiusura,'')),
    metodo_pagamento     = coalesce(nullif(c.metodo_pagamento,''),     nullif(v_b.metodo_pagamento,'')),
    tipologia            = coalesce(nullif(c.tipologia,''),            nullif(v_b.tipologia,'')),
    agente_id            = coalesce(nullif(c.agente_id,''),            nullif(v_b.agente_id,'')),
    agente_nome          = coalesce(nullif(c.agente_nome,''),          nullif(v_b.agente_nome,'')),
    corriere_abituale    = coalesce(nullif(c.corriere_abituale,''),    nullif(v_b.corriere_abituale,'')),
    note                 = case when coalesce(nullif(c.note,''),'') = '' then v_b.note
                                when coalesce(nullif(v_b.note,''),'') = '' then c.note
                                else c.note || E'\n' || v_b.note end,
    ddt_con_prezzi       = c.ddt_con_prezzi or coalesce(v_b.ddt_con_prezzi,false),
    aggiornato_il        = now(),
    operatore            = p_operatore
  where c.chiave = p_tenere;

  -- Gli ordini passano al codice che resta. Quelli con un documento gia'
  -- emesso restano dove sono: il DDT e' stampato e non si riscrive.
  if nullif(v_b.codice_cliente,'') is not null and nullif(v_a.codice_cliente,'') is not null then
    update ordini set id_cliente = v_a.codice_cliente
     where id_cliente = v_b.codice_cliente
       and coalesce(ddt_numero,'') = '';
    get diagnostics v_ordini = row_count;
  end if;

  delete from clienti_override where chiave = p_assorbire;

  return format('Tenuta %s, assorbita %s, ordini spostati: %s', p_tenere, p_assorbire, v_ordini);
end;
$$;

comment on function unisci_schede_cliente(text, text, text) is
  'Unisce due schede dello stesso cliente. Riempie solo i vuoti, mette da parte la scheda assorbita in clienti_override_assorbite e non tocca gli ordini con DDT emesso.';
