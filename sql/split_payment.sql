-- LO SPLIT PAYMENT (scissione dei pagamenti, art. 17-ter DPR 633/72).
--
-- Chiesto da Luca il 24/09/2026 per FARMAVALDARNO s.p.a. (DDT 2132), societa'
-- a partecipazione pubblica: la fattura espone l'IVA come sempre, ma il
-- cliente NON ce la paga, la versa allo Stato per conto nostro.
--
-- QUELLO CHE CAMBIA DAVVERO, ed e' tutto qui dentro:
--   * in fattura elettronica ogni <DatiRiepilogo> porta EsigibilitaIVA = "S"
--     invece di "I" (src/fatture.js);
--   * <ImportoPagamento> e' il solo IMPONIBILE: e' quello che incassiamo;
--   * <ImportoTotaleDocumento> resta il totale con l'IVA dentro, perche' il
--     documento la espone lo stesso;
--   * ci va la dicitura dell'articolo 17-ter, se no la fattura non si spiega.
--
-- PERCHE' IL REGIME STA SUL CLIENTE E NON SOLO SULL'ORDINE: lo split non e'
-- una scelta dell'ordine, e' una qualita' del cliente. Messo una volta sulla
-- scheda, ogni ordine nuovo nasce gia' giusto. Sull'ordine resta modificabile
-- perche' la deroga sul singolo documento deve restare possibile.

-- 1. Il regime sulla scheda del cliente.
alter table clienti_override add column if not exists regime_iva text;
comment on column clienti_override.regime_iva is
  'Regime IVA abituale del cliente: null/normale, split (art. 17-ter), estero_ue, estero_extra_ue. Lo eredita ogni ordine nuovo.';

-- 2. Lista chiusa, di qua e di la'. Un regime scritto a mano che il motore
--    delle fatture non conosce verrebbe ignorato in silenzio, e la fattura
--    uscirebbe con l'IVA addebitata al cliente senza che nessuno se ne accorga.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'clienti_override_regime_iva_noto') then
    alter table clienti_override add constraint clienti_override_regime_iva_noto
      check (regime_iva is null or regime_iva in ('normale','split','estero_ue','estero_extra_ue'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ordini_regime_iva_noto') then
    alter table ordini add constraint ordini_regime_iva_noto
      check (regime_iva is null or regime_iva in ('normale','split','estero_ue','estero_extra_ue'));
  end if;
end $$;

-- 3. L'ordine nuovo eredita il regime del cliente. Stessa porta di
--    agente_dal_cliente: si passa da clienti_master per il codice e da
--    chiave_anagrafica per trovare la scheda.
create or replace function regime_iva_dal_cliente() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_piva text; v_rag text; v_regime text;
begin
  -- Se chi crea l'ordine ha gia' detto il regime, comanda lui.
  if coalesce(trim(new.regime_iva), '') <> '' then return new; end if;
  if new.id_cliente is null then return new; end if;
  select nullif(m.piva, ''), m.ragione_sociale into v_piva, v_rag
    from clienti_master m where m.codice = new.id_cliente;
  if not found then return new; end if;
  select co.regime_iva into v_regime
    from clienti_override co
   where co.chiave = chiave_anagrafica(v_piva, coalesce(v_rag, new.cliente));
  new.regime_iva := nullif(trim(coalesce(v_regime, '')), '');
  return new;
end $$;

drop trigger if exists trg_regime_iva_dal_cliente on ordini;
create trigger trg_regime_iva_dal_cliente
  before insert on ordini
  for each row execute function regime_iva_dal_cliente();

-- 4. Il registro delle fatture dice anche con che regime e' uscita e quanto
--    c'e' davvero da incassare. Senza, una fattura split sembra incassata a
--    meta' per sempre: il totale dice 220 e in banca ne arrivano 200.
alter table fatture_generate add column if not exists regime_iva text;
alter table fatture_generate add column if not exists da_incassare numeric;
comment on column fatture_generate.da_incassare is
  'Quanto paga il cliente. Uguale a totale, tranne con lo split payment dove e'' il solo imponibile.';
