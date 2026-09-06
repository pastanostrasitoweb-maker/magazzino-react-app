-- UN ABBUONO PROMESSO NON SI DIMENTICA (03/09/2026)
--
-- DDT 2035, UNA VITA SENZA SPIGA: era concordato un abbuono di 33,50 euro
-- (rimborso scaduti + promo 50%) e sul documento non c'e' finito niente.
-- Verificato: nelle righe dell'ordine non esiste nessuna riga di abbuono, il
-- DDT congelato ne ha 15 e nessuna e' un abbuono, il totale e 306,25 cioe' la
-- somma piena delle merci. L'abbuono non e' stato "perso dall'app": non e mai
-- entrato. Viveva fuori dal sistema, e il sistema non aveva modo di ricordarlo.
--
-- Il danno che si e evitato: la fattura sarebbe uscita a 306,25 invece di
-- 272,75, e il cliente avrebbe pagato 33,50 euro che gli erano stati promessi.
--
-- Qui si crea il posto dove un abbuono promesso vive FINCHE' NON E' DATO.
-- Chi lo concorda lo scrive, e da quel momento e l'app a ricordarselo: appare
-- su ogni ordine di quel cliente, e al momento di chiudere il documento
-- chiede conto se non e stato applicato.

create table if not exists abbuoni_promessi (
  id                  bigserial primary key,
  codice_cliente      text        not null,
  importo             numeric     not null check (importo > 0),
  motivo              text        not null,
  iva_pct             numeric,
  promesso_da         text,
  promesso_il         timestamptz not null default now(),
  stato               text        not null default 'in attesa'
                      check (stato in ('in attesa','applicato','annullato')),
  applicato_su_ordine text,
  applicato_il        timestamptz,
  applicato_da        text,
  ddt_riferimento     text,
  note                text
);

comment on table abbuoni_promessi is
  'Abbuoni concordati col cliente e non ancora dati. Restano in attesa finche una riga di abbuono non finisce su un documento.';
comment on column abbuoni_promessi.ddt_riferimento is
  'Il documento a cui si riferisce il rimborso, o quello su cui l abbuono e stato dimenticato.';

create index if not exists idx_abbuoni_promessi_cliente
  on abbuoni_promessi (codice_cliente) where stato = 'in attesa';

-- ---------------------------------------------------------------------------
-- Registrare la promessa. Il motivo e obbligatorio: fra sei mesi nessuno
-- ricorda perche un cliente pagava 33,50 in meno.
-- ---------------------------------------------------------------------------
create or replace function prometti_abbuono(
  p_codice_cliente text,
  p_importo        numeric,
  p_motivo         text,
  p_iva_pct        numeric default null,
  p_promesso_da    text    default '',
  p_ddt_riferimento text   default null,
  p_note           text    default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
  v_cliente text;
begin
  if coalesce(btrim(p_codice_cliente), '') = '' then
    return jsonb_build_object('ok', false, 'errore', 'Serve il codice del cliente.');
  end if;
  if coalesce(p_importo, 0) <= 0 then
    return jsonb_build_object('ok', false, 'errore', 'L''importo dell''abbuono deve essere maggiore di zero.');
  end if;
  if coalesce(btrim(p_motivo), '') = '' then
    return jsonb_build_object('ok', false, 'errore', 'Serve il motivo: e quello che il cliente legge sul documento.');
  end if;

  select coalesce(nullif(btrim(ragione_sociale), ''), p_codice_cliente) into v_cliente
  from clienti_override where codice_cliente = p_codice_cliente;

  insert into abbuoni_promessi
    (codice_cliente, importo, motivo, iva_pct, promesso_da, ddt_riferimento, note)
  values
    (btrim(p_codice_cliente), round(p_importo, 2), btrim(p_motivo), p_iva_pct,
     coalesce(nullif(btrim(coalesce(p_promesso_da,'')), ''), 'non firmato'),
     nullif(btrim(coalesce(p_ddt_riferimento,'')), ''), nullif(btrim(coalesce(p_note,'')), ''))
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'cliente', coalesce(v_cliente, p_codice_cliente));
end;
$$;

-- ---------------------------------------------------------------------------
-- Gli abbuoni che questo cliente deve ancora ricevere
-- ---------------------------------------------------------------------------
create or replace function abbuoni_in_attesa(p_codice_cliente text)
returns table (
  id bigint, importo numeric, motivo text, iva_pct numeric,
  promesso_da text, promesso_il timestamptz, ddt_riferimento text, note text
)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, a.importo, a.motivo, a.iva_pct, a.promesso_da, a.promesso_il,
         a.ddt_riferimento, a.note
  from abbuoni_promessi a
  where a.stato = 'in attesa'
    and a.codice_cliente = btrim(p_codice_cliente)
  order by a.promesso_il;
$$;

-- ---------------------------------------------------------------------------
-- Segnare che e stato dato. Lo chiama l'app dopo aver messo la riga: se il
-- documento e GIA emesso lo dice, perche la carta consegnata al cliente non
-- lo conterra e la differenza va spiegata in fattura.
-- ---------------------------------------------------------------------------
create or replace function segna_abbuono_applicato(
  p_id bigint,
  p_id_ordine text,
  p_da text default ''
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ord record;
  v_gia_emesso boolean := false;
begin
  select id_ordine, ddt_numero, archiviato into v_ord
  from ordini where id_ordine = p_id_ordine;

  if not found then
    return jsonb_build_object('ok', false, 'errore', 'Ordine non trovato: ' || coalesce(p_id_ordine,'(vuoto)'));
  end if;

  v_gia_emesso := coalesce(btrim(v_ord.ddt_numero), '') <> '';

  update abbuoni_promessi
     set stato = 'applicato',
         applicato_su_ordine = p_id_ordine,
         applicato_il = now(),
         applicato_da = coalesce(nullif(btrim(coalesce(p_da,'')), ''), 'non firmato')
   where id = p_id and stato = 'in attesa';

  if not found then
    return jsonb_build_object('ok', false, 'errore', 'Questo abbuono non risulta piu in attesa: qualcuno lo ha gia applicato o annullato.');
  end if;

  return jsonb_build_object(
    'ok', true,
    'ddt_numero', v_ord.ddt_numero,
    'documento_gia_emesso', v_gia_emesso,
    'avviso', case when v_gia_emesso then
      'Il DDT ' || v_ord.ddt_numero || ' e gia stato emesso: la copia consegnata al cliente non porta questo abbuono. In fattura va citato il documento.'
      else null end
  );
end;
$$;

grant execute on function prometti_abbuono(text, numeric, text, numeric, text, text, text) to anon, authenticated;
grant execute on function abbuoni_in_attesa(text) to anon, authenticated;
grant execute on function segna_abbuono_applicato(bigint, text, text) to anon, authenticated;
grant select on abbuoni_promessi to anon, authenticated;

-- ---------------------------------------------------------------------------
-- LE DUE VISTE DI CONTROLLO
-- ---------------------------------------------------------------------------

-- Chi ha un abbuono in attesa e un ordine aperto che non lo porta: e la lista
-- degli errori che stanno per succedere.
create or replace view v_abbuoni_dimenticati as
select
  o.id_ordine,
  o.stato,
  o.ddt_numero,
  o.cliente,
  o.id_cliente,
  a.id            as id_abbuono,
  a.importo,
  a.motivo,
  a.promesso_il::date as promesso_il,
  coalesce(btrim(o.ddt_numero), '') <> '' as documento_gia_emesso
from ordini o
join abbuoni_promessi a
  on a.codice_cliente = o.id_cliente
 and a.stato = 'in attesa'
where coalesce(o.archiviato, false) = false
  and not exists (
    select 1 from righe_ordine r
    where r.id_ordine = o.id_ordine
      and (r.prezzo_origine = 'abbuono' or r.descrizione_prodotto ilike 'ABBUONO%')
  );

-- Gli abbuoni promessi e mai dati, per cliente: il debito commerciale aperto.
create or replace view v_abbuoni_da_dare as
select
  a.codice_cliente,
  coalesce(nullif(btrim(c.ragione_sociale), ''), a.codice_cliente) as cliente,
  count(*)      as quanti,
  sum(a.importo) as totale_da_dare,
  min(a.promesso_il)::date as il_piu_vecchio,
  string_agg(a.motivo || ' (' || to_char(a.importo, 'FM999990.00') || ' €)', ' · ' order by a.promesso_il) as dettaglio
from abbuoni_promessi a
left join clienti_override c on c.codice_cliente = a.codice_cliente
where a.stato = 'in attesa'
group by 1, 2;

grant select on v_abbuoni_dimenticati, v_abbuoni_da_dare to anon, authenticated;

-- ---------------------------------------------------------------------------
-- I PERMESSI. Trovato provando l'app vera (03/09/2026): la tabella nuova nasce
-- con RLS attiva e zero policy, quindi la GRANT non basta e l'app leggeva un
-- elenco VUOTO — cioe' "nessun abbuono da dare", che e' la bugia peggiore che
-- questa tabella potesse raccontare. Le SELECT fatte da amministratore non lo
-- mostravano: passano sopra RLS.
-- La lettura si apre come sulle altre tabelle del magazzino; le SCRITTURE no,
-- passano solo dalle funzioni (prometti_abbuono / segna_abbuono_applicato),
-- che validano importo e motivo e firmano chi ha fatto cosa.
-- ---------------------------------------------------------------------------
drop policy if exists abbuoni_promessi_lettura on abbuoni_promessi;
create policy abbuoni_promessi_lettura on abbuoni_promessi
  for select to anon, authenticated using (true);
