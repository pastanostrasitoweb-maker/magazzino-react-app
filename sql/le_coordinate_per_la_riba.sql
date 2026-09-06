-- LE COORDINATE PER LA RI.BA.
--
-- Luca, 03/09/2026: "in anagrafica inserire IBAN ABI e CAB obbligatorio per
-- metodi di pagamento Ri.Ba.".
--
-- Cosa serve davvero: il tracciato CBI della Ri.Ba. porta **ABI e CAB del
-- debitore** (posizioni 69-74 e 74-79 del record 14), non l'IBAN. Se sbagliano,
-- l'addebito parte dal conto di un altro. L'IBAN si tiene lo stesso perche' e'
-- la forma in cui il cliente lo scrive sulla sua carta intestata, ed e' l'unico
-- modo perche' chi compila non debba spacchettarlo a mano: da qui ABI e CAB si
-- ricavano da soli.
--
-- Dove NON prenderlo: l'IBAN non esiste ne' in TeamSystem (WS 1000 espone solo
-- CFBANCA e CFAGENZIA) ne' in Sibill (vuoto per tutti). Quello va scritto a
-- mano, cliente per cliente. ABI e CAB invece il gestionale li ha per 299
-- clienti, e si importano.

alter table clienti_override add column if not exists iban text;
alter table clienti_override add column if not exists abi  text;
alter table clienti_override add column if not exists cab  text;

comment on column clienti_override.iban is 'IBAN del cliente, come lo scrive lui. ABI e CAB si ricavano da qui.';
comment on column clienti_override.abi  is 'ABI del debitore, 5 cifre: va nel flusso Ri.Ba. (record 14, pos. 69-74).';
comment on column clienti_override.cab  is 'CAB del debitore, 5 cifre: va nel flusso Ri.Ba. (record 14, pos. 74-79).';

-- Un IBAN italiano: IT + 2 di controllo + 1 CIN + 5 ABI + 5 CAB + 12 di conto.
create or replace function abi_cab_da_iban(p_iban text)
returns table (abi text, cab text)
language sql
immutable
as $$
  select substr(pulito, 6, 5), substr(pulito, 11, 5)
    from (select upper(regexp_replace(coalesce(p_iban,''), '[^A-Za-z0-9]', '', 'g')) as pulito) z
   where pulito ~ '^IT[0-9]{2}[A-Z][0-9]{10}[0-9A-Z]{12}$';
$$;

comment on function abi_cab_da_iban(text) is
  'ABI e CAB estratti da un IBAN italiano. Torna niente se l''IBAN non ha la forma giusta: meglio vuoto che una banca sbagliata.';

-- Le coordinate si puliscono e si completano da sole, come tutto il resto
-- dell'anagrafica: chi compila scrive l'IBAN e non deve contare i caratteri.
create or replace function _coordinate_bancarie()
returns trigger
language plpgsql
as $$
declare v_abi text; v_cab text;
begin
  new.iban := nullif(upper(regexp_replace(coalesce(new.iban,''), '[^A-Za-z0-9]', '', 'g')), '');
  new.abi  := nullif(btrim(coalesce(new.abi,'')), '');
  new.cab  := nullif(btrim(coalesce(new.cab,'')), '');
  if e_un_segnaposto(new.iban) then new.iban := null; end if;

  -- ABI e CAB si scrivono a 5 cifre: il gestionale li tiene senza gli zeri
  -- davanti, e nel flusso ci vanno pieni.
  if new.abi ~ '^[0-9]{1,5}$' then new.abi := lpad(new.abi, 5, '0'); else new.abi := null; end if;
  if new.cab ~ '^[0-9]{1,5}$' then new.cab := lpad(new.cab, 5, '0'); else new.cab := null; end if;
  if coalesce(new.abi,'00000') = '00000' then new.abi := null; end if;
  if coalesce(new.cab,'00000') = '00000' then new.cab := null; end if;

  -- L'IBAN comanda: se c'e' ed e' valido, ABI e CAB vengono da li'. Due fonti
  -- per lo stesso dato litigano sempre, e sul conto di un cliente non si litiga.
  if new.iban is not null then
    select a.abi, a.cab into v_abi, v_cab from abi_cab_da_iban(new.iban) a;
    if v_abi is not null then new.abi := v_abi; new.cab := v_cab; end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_ab_coordinate_bancarie on clienti_override;
create trigger trg_ab_coordinate_bancarie
before insert or update on clienti_override
for each row execute function _coordinate_bancarie();

-- CHI PAGA CON RI.BA. SENZA COORDINATE NON SI PUO' PRESENTARE IN BANCA.
-- Non blocca il magazzino: la merce parte lo stesso, e il documento pure. Si
-- accende dove serve, cioe' quando si prepara la distinta e nell'elenco delle
-- anagrafiche da sistemare.
create or replace function riba_senza_coordinate(p_codice text)
returns boolean
language sql
stable
as $$
  select coalesce(
    (select metodo_del_cliente(p_codice) ilike 'Ri.Ba.%'
        and not exists (
              select 1 from clienti_override co
               where (co.codice_cliente = p_codice
                      or co.codice_cliente in (select codici_dello_stesso_cliente(p_codice)))
                 and co.abi is not null and co.cab is not null)),
    false);
$$;

comment on function riba_senza_coordinate(text) is
  'Vero quando il cliente paga con Ri.Ba. e non abbiamo ABI/CAB: la ricevuta non si puo'' presentare in banca.';
