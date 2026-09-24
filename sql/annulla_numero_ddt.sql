-- ANNULLARE UN NUMERO DI BOLLA SENZA CANCELLARE L'ORDINE.
--
-- Il caso, vero, del 24/09/2026: l'ordine di HAPPY SG S.R.L. e' una
-- campionatura del 21 luglio, partita e archiviata da due mesi. Oggi alle 12:52
-- le si e' attaccato il DDT 2264 per sbaglio. Il numero non e' suo: quel
-- documento con quel numero non e' mai esistito.
--
-- Le due porte che c'erano non bastavano:
--   libera_numero_ddt  restituisce il numero al prossimo documento, ma si
--                      rifiuta se l'ordine e' spedito o archiviato, e qui lo e'
--                      (la merce e' uscita a luglio, e giustamente non lo sa che
--                      il numero e' nato dopo);
--   registra_ddt_annullato  scatta solo quando si CANCELLA l'ordine, e questo
--                      ordine e' una spedizione vera che deve restare.
--
-- Quindi: si stacca il numero e lo si BRUCIA, scrivendolo in ddt_annullati col
-- motivo. Il numero non torna in circolo. E' la scelta prudente: un buco nella
-- numerazione si spiega in una riga, due documenti diversi con lo stesso numero
-- no. Se si e' sicuri che non sia mai uscita carta, resta libera_numero_ddt.

create or replace function annulla_numero_ddt(
  p_ddt text,
  p_motivo text default '',
  p_operatore text default ''
) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_ordine text; v_cliente text; v_data date; v_importo numeric;
begin
  if p_ddt !~ '^[0-9]+$' then
    raise exception 'Il numero % non e'' un numero.', p_ddt;
  end if;

  select id_ordine, cliente, coalesce(data_preparato, data_ordine)::date, totale_imponibile
    into v_ordine, v_cliente, v_data, v_importo
    from ordini where ddt_numero = p_ddt;
  if v_ordine is null then
    raise exception 'Il numero % non e'' su nessun ordine: non c''e'' niente da annullare.', p_ddt;
  end if;

  -- OLTRE QUESTE DUE SOGLIE IL NUMERO NON E' PIU' NOSTRO. Se e' gia' in una
  -- fattura o e' gia' partito verso Sibill, il documento vive anche fuori di
  -- qui e staccarlo da una parte sola lascerebbe due verita' diverse.
  if exists (select 1 from ddt_fatturati where ddt_numero = p_ddt) then
    raise exception 'Il DDT % e'' gia'' fatturato: si annulla la fattura, non il numero.', p_ddt;
  end if;
  if exists (select 1 from ddt_sibill_invii where ddt_numero = p_ddt) then
    raise exception 'Il DDT % e'' gia'' stato mandato a Sibill: prima si sistema li''.', p_ddt;
  end if;

  insert into ddt_annullati (ddt_numero, id_ordine, cliente, ddt_data, importo, motivo)
  values (p_ddt, v_ordine, v_cliente, v_data, v_importo,
          nullif(btrim(p_motivo), '') || case when nullif(btrim(p_operatore),'') is null then ''
                                              else ' (' || btrim(p_operatore) || ')' end)
  on conflict (ddt_numero) do nothing;

  -- La guardia ddt_numero_non_si_tocca riconosce solo le porte dichiarate.
  perform set_config('gfe.numero_annullato', p_ddt, true);
  update ordini set ddt_numero = '' where id_ordine = v_ordine;
  delete from ddt_congelati where ddt_numero = p_ddt;

  return format('Numero %s annullato e non piu'' riusabile. Ordine %s (%s) resta senza bolla.',
                p_ddt, v_ordine, v_cliente);
end $$;

-- La guardia impara la porta nuova. Restano vietate tutte le altre strade:
-- cambiare un numero con un altro, o cancellarlo con una update a mano.
create or replace function ddt_numero_non_si_tocca() returns trigger
language plpgsql as $$
DECLARE vecchio text := NULLIF(TRIM(COALESCE(OLD.ddt_numero, '')), '');
        nuovo   text := NULLIF(TRIM(COALESCE(NEW.ddt_numero, '')), '');
BEGIN
  IF vecchio IS NULL THEN RETURN NEW; END IF;      -- non ne aveva: libero
  IF nuovo IS NOT DISTINCT FROM vecchio THEN RETURN NEW; END IF;

  IF nuovo IS NULL THEN
    -- Le uniche due vie: libera_numero_ddt (il numero torna al prossimo
    -- documento) e annulla_numero_ddt (il numero si brucia e resta scritto).
    IF current_setting('gfe.numero_restituito', true) = vecchio THEN
      RETURN NEW;
    END IF;
    IF current_setting('gfe.numero_annullato', true) = vecchio THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION
      'Il DDT % e'' gia'' stato emesso per l''ordine %: il numero non si cancella. Il documento e'' in mano al cliente o sul camion. Se era una prova e il numero e'' l''ultimo: select libera_numero_ddt(''%''). Se quel numero non e'' mai stato suo: select annulla_numero_ddt(''%'', il motivo).',
      vecchio, OLD.id_ordine, vecchio, vecchio;
  END IF;
  RAISE EXCEPTION
    'L''ordine % ha gia'' il DDT %: non si puo'' cambiare in %. Un numero emesso resta quello.',
    OLD.id_ordine, vecchio, nuovo;
END $$;
