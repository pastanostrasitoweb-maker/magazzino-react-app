-- UN SEGNAPOSTO NON VA IN BOLLA.
--
-- Luca, 03/09/2026: "il flusso del cartone bollinato funzionava perfettamente,
-- adesso quando carichi il lotto dell'articolo bollinato scompare il fatto che
-- sia un CT bollinato. Vedi cosa e' successo e FIXALO".
--
-- Cos'era. La riga del cartone bollinato nasce con un SEGNAPOSTO al posto
-- dell'articolo (`BOLLINATO-<numero>`): non e' ancora merce, e' una promessa.
-- Diventa merce vera solo scegliendo un lotto DALL'ELENCO dei bollinati, ed e'
-- quella scelta che le mette sopra il prodotto, il listino, lo sconto 100 e il
-- marchio "DA BOLLINARE".
--
-- Il buco: il bottone "Crea lotto al volo" assegnava il lotto usando il
-- productId della riga, cioe' IL SEGNAPOSTO. Nasceva un lotto intestato a un
-- prodotto che non esiste (LOT-1788422432447, quantita -1), il magazzino del
-- prodotto vero non si scaricava, e al cliente arrivava una bolla con scritto
-- "CARTONE BOLLINATO · scegli il lotto dalla riga": DDT 2052, Farmacie
-- Comunali Torino S.p.A.
--
-- L'app adesso non lo permette piu'. Ma un controllo che vive solo nel browser
-- e' un controllo che prima o poi si aggira: qui il documento si rifiuta di
-- nascere se una riga porta ancora un segnaposto.

create or replace function riga_e_un_segnaposto(p_id_prodotto text)
returns boolean
language sql
immutable
as $$
  select coalesce(p_id_prodotto, '') like 'BOLLINATO-%';
$$;

comment on function riga_e_un_segnaposto(text) is
  'Vero per le righe che aspettano ancora di sapere quale articolo sono (cartone bollinato non ancora scelto).';

-- Le righe ferme al segnaposto, per vederle prima che diventino un documento.
create or replace view v_righe_senza_articolo as
select r.id_riga,
       r.id_ordine,
       o.cliente,
       o.stato,
       coalesce(o.ddt_numero, '') as ddt_numero,
       r.descrizione_prodotto,
       r.quantita_ordinata,
       r.quantita_assegnata
  from righe_ordine r
  join ordini o on o.id_ordine = r.id_ordine
 where riga_e_un_segnaposto(r.id_prodotto);

comment on view v_righe_senza_articolo is
  'Righe che porterebbero in bolla un segnaposto invece di un articolo. Vuota e'' come deve stare.';

grant select on v_righe_senza_articolo to anon, authenticated;

-- IL CANCELLO. Il numero del DDT si brucia alla generazione: se una riga non sa
-- ancora cosa e', il documento non deve nascere per niente.
create or replace function _niente_segnaposto_sul_documento()
returns trigger
language plpgsql
as $$
declare v_riga text;
begin
  if coalesce(new.ddt_numero, '') = '' or new.ddt_numero is not distinct from old.ddt_numero then
    return new;
  end if;
  select left(r.descrizione_prodotto, 60) into v_riga
    from righe_ordine r
   where r.id_ordine = new.id_ordine
     and riga_e_un_segnaposto(r.id_prodotto)
   limit 1;
  if v_riga is not null then
    raise exception 'Questa riga non sa ancora quale articolo e'': "%". Scegli il lotto dall''elenco dei bollinati, poi rifai il documento.', v_riga
      using hint = 'Il cartone bollinato diventa merce solo scegliendo un lotto dall''elenco.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_niente_segnaposto_sul_documento on ordini;
create trigger trg_niente_segnaposto_sul_documento
before update on ordini
for each row execute function _niente_segnaposto_sul_documento();
