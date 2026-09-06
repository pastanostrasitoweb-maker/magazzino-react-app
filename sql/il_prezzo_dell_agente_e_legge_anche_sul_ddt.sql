-- IL PREZZO DELL'AGENTE E' LEGGE, ANCHE SUL DDT.
--
-- Luca, 03/09/2026, Farmacia Squarti: "risulta al 40+5%, l'ultimo ordine ci e'
-- arrivato con 35%. Degli articoli risultano al 50% perche' in promozione
-- sull'app agenti e qui sono al 35%. Quello che segna l'agente e' legge e deve
-- rimanere uguale a meno che non modificato da noi."
--
-- Cosa succedeva. C'era gia' un guardiano (prezzo_concordato_prima_di_archiviare)
-- che confronta il netto del magazzino col netto concordato dall'agente e blocca
-- se il cliente pagherebbe di piu'. MA scattava solo all'ARCHIVIAZIONE, che
-- arriva DOPO la stampa del DDT. Il DDT di Squarti (2044) e' uscito con la promo
-- BOX HOT -50% degradata a 35% (tre righe ATM, +4,08 EUR l'una): il documento
-- era gia' stampato e spedito, e il guardiano non aveva ancora parlato.
--
-- Il DDT e' il documento che arriva al cliente. Il controllo del prezzo va fatto
-- PRIMA che il numero venga bruciato, non dopo. Qui lo stesso confronto scatta
-- quando il DDT nasce: se una riga costa al cliente piu' del concordato con
-- l'agente e nessuno l'ha autorizzato, il DDT non si emette.
--
-- Lo sconto CONCESSO (il cliente paga meno) non blocca: e' una scelta
-- commerciale (regola Luca 26/08). Si guarda solo il sovrapprezzo.

create or replace function prezzo_concordato_prima_del_ddt()
returns trigger
language plpgsql
as $$
DECLARE
  v_sovrapprezzo numeric;
  v_righe        int;
  v_dettaglio    text;
BEGIN
  -- Solo quando il DDT NASCE: da vuoto a numero. Le ristampe non consumano un
  -- numero nuovo e non ripassano di qui.
  IF NOT (coalesce(btrim(new.ddt_numero), '') <> ''
          AND coalesce(btrim(old.ddt_numero), '') = '') THEN
    RETURN new;
  END IF;

  -- GIA' AUTORIZZATO: qualcuno ha guardato e ha detto ok. E' il "modificato da
  -- noi" della regola. Si passa.
  IF coalesce(btrim(new.prezzo_ok_da), '') <> '' THEN
    RETURN new;
  END IF;

  SELECT count(*), coalesce(sum(scarto), 0),
         string_agg(codice || ' (+' || round(scarto, 2) || ' EUR)', '; ' ORDER BY scarto DESC)
    INTO v_righe, v_sovrapprezzo, v_dettaglio
    FROM v_prezzi_traditi
   WHERE id_ordine = new.id_ordine AND scarto > 0.50;

  IF v_righe > 0 THEN
    RAISE EXCEPTION
      'PREZZO_DA_AUTORIZZARE: % righe costano al cliente % EUR in piu'' del concordato con l''agente. %. '
      'Il DDT non si emette finche'' non guardi e confermi: quello che segna l''agente e'' legge.',
      v_righe, round(v_sovrapprezzo, 2), v_dettaglio;
  END IF;
  RETURN new;
END;
$$;

-- Il nome mette il guardiano DOPO 'trg_ddt_alla_spedizione' (che assegna il
-- numero) e prima che la transazione chiuda: cosi' vede il numero appena nato e
-- lo puo' rifiutare senza bruciarlo.
drop trigger if exists trg_ddt_bz_prezzo_concordato on ordini;
create trigger trg_ddt_bz_prezzo_concordato
before update on ordini
for each row execute function prezzo_concordato_prima_del_ddt();
