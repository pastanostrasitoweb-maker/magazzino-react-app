-- TRE CORREZIONI CHIESTE DA LUCA IL 24/09/2026.
--
-- 1. LE CAMPIONATURE NON SI ARCHIVIAVANO PER UN PREZZO CHE NON SI PUO' METTERE.
--    L'app, dal 17/08, non chiede prezzi a una campionatura gratuita ("quando
--    e' flaggata campionatura non devono esserci i prezzi") e non li fa
--    nemmeno inserire. Il database invece rifiutava l'archiviazione con
--    PREZZO MANCANTE su ogni riga col prezzo vuoto. L'app diceva "va bene", il
--    database diceva di no. Adesso il database applica la stessa regola:
--    campionatura con valore zero -> le righe senza prezzo diventano 0, che e'
--    esattamente quanto valgono. Una campionatura VALORIZZATA (il cliente ha
--    comprato qualcosa insieme) resta sotto il controllo: li' un prezzo che
--    manca e' un prezzo che manca.
--
-- 2. IL PESO SCRITTO A MANO NON ARRIVAVA ALLA LOGISTICA.
--    Il magazzino permette di correggere il peso (peso_manuale) e ricalcola il
--    preventivo, ma v_spedizioni e v_da_spedire, da cui legge l'app Logistica,
--    ricalcolavano il peso dalle righe e ignoravano la correzione. Il costo
--    del trasporto quindi non seguiva il peso vero. Adesso, se c'e', comanda
--    il peso scritto a mano, come gia' fa la bolla.
--
-- 3. LE BUSTINE GELO PESAVANO COME UN CARTONE.
--    Per le bustine vendute a PEZZO, prodotti.peso_kg conteneva il peso del
--    cartone da 10 (1,25-1,30 kg), e le viste della logistica fanno pezzi x
--    peso_kg: ogni bustina pesava dieci volte tanto. v_pesi_incoerenti lo
--    segnalava gia' ("ogni spedizione pesa 10 volte tanto") ma il dato non era
--    mai stato corretto. Regola di Luca: 1 bustina = 140 g circa. Per le due
--    vendute a CARTONE da 10, il cartone vale 1,4 kg.
--    Restano fuori, da confermare: Fette di Pane -18 (80 g) e Cappelletti
--    bustine (250 g), che non sono bustine di pasta da 125-130 g.

create or replace function public.prezzo_prima_di_archiviare()
returns trigger
language plpgsql
as $function$
declare v_mancanti text;
begin
  if coalesce(new.archiviato,false) = true and coalesce(old.archiviato,false) = false then
    -- CAMPIONATURA GRATUITA: il prezzo che manca vale zero (vedi sopra).
    if coalesce(new.campionatura, false) and coalesce(new.totale_imponibile, 0) = 0 then
      update righe_ordine r
         set prezzo_unitario = 0
       where r.id_ordine = new.id_ordine
         and r.prezzo_unitario is null
         and r.id_prodotto not like 'ABBUONO%'
         and lower(coalesce(r.prezzo_origine,'')) <> 'abbuono';
      return new;
    end if;

    select string_agg(r.descrizione_prodotto, '; ' order by r.descrizione_prodotto)
      into v_mancanti
    from righe_ordine r
    where r.id_ordine = new.id_ordine
      and r.prezzo_unitario is null
      and r.id_prodotto not like 'ABBUONO%'
      and lower(coalesce(r.prezzo_origine,'')) <> 'abbuono';
    if v_mancanti is not null then
      raise exception 'PREZZO MANCANTE sull''ordine %: %. Un prezzo che non si sa non vale zero: scrivilo sulla riga, oppure metti zero se e'' un omaggio.',
        new.id_ordine, v_mancanti;
    end if;
  end if;
  return new;
end
$function$;

-- Le bustine gelo: 140 g a pezzo (Luca 24/09/2026).
update prodotti set peso_kg = 0.14, peso_pezzo_kg = 0.14
 where codice_prodotto in ('HORECA113','HORECA122','HORECA128','HORECA129','HORECA130','HORECA136')
   and upper(btrim(coalesce(um,''))) = 'PZ';
update prodotti set peso_kg = 1.4, peso_pezzo_kg = 0.14
 where codice_prodotto in ('HORECA103','HORECA125')
   and upper(btrim(coalesce(um,''))) = 'CT' and pezzi_collo = 10;

CREATE OR REPLACE VIEW public.v_spedizioni AS  SELECT o.id_ordine AS id,
    o.id_ordine AS ordine,
    o.cliente,
    COALESCE(NULLIF(TRIM(BOTH FROM o.cap), ''::text), NULL::text) AS cap,
    COALESCE(NULLIF(TRIM(BOTH FROM o.corriere), ''::text), NULLIF(TRIM(BOTH FROM o.corriere_spedizione), ''::text)) AS corriere_id,
    COALESCE(max(o.peso_manuale)::numeric, round(COALESCE(sum(r.quantita_ordinata * p.peso_kg), 0::numeric), 1)) AS peso,
    COALESCE(o.colli, 1) AS colli,
    o.polybox,
        CASE
            WHEN o.note ~* 'polibox|polybox|ghiaccio|surgelat|frozen'::text THEN 'frozen'::text
            WHEN COALESCE(NULLIF(TRIM(BOTH FROM o.corriere), ''::text), NULLIF(TRIM(BOTH FROM o.corriere_spedizione), ''::text)) = 'brt'::text THEN 'secco'::text
            WHEN COALESCE(NULLIF(TRIM(BOTH FROM o.corriere), ''::text), NULLIF(TRIM(BOTH FROM o.corriere_spedizione), ''::text)) IS NULL THEN NULL::text
            ELSE 'fresh'::text
        END AS temperatura,
    o.costo_trasporto AS costo_logistico,
    o.costo_stimato,
        CASE
            WHEN lower(COALESCE(o.stato, ''::text)) = 'spedito'::text THEN 'spedita'::text
            WHEN o.archiviato THEN 'spedita'::text
            ELSE 'assegnata'::text
        END AS stato,
    o.data_ordine::date AS data,
    o.metodo_pagamento,
    o.contrassegno_importo,
    o.contrassegno_tipo,
    o.archiviato
   FROM ordini o
     JOIN righe_ordine r ON r.id_ordine = o.id_ordine
     LEFT JOIN prodotti p ON p.id_prodotto::text = r.id_prodotto
  WHERE lower(COALESCE(o.stato, ''::text)) = 'spedito'::text OR o.archiviato IS TRUE
  GROUP BY o.id_ordine, o.cliente, o.cap, o.corriere_spedizione, o.corriere, o.colli, o.polybox, o.note, o.costo_trasporto, o.costo_stimato, o.stato, o.data_ordine, o.metodo_pagamento, o.contrassegno_importo, o.contrassegno_tipo, o.archiviato;

CREATE OR REPLACE VIEW public.v_da_spedire AS  SELECT o.id_ordine AS id,
    o.cliente,
    COALESCE(NULLIF(TRIM(BOTH FROM o.cap), ''::text), NULL::text) AS cap,
    COALESCE(NULLIF(TRIM(BOTH FROM o.corriere), ''::text), NULLIF(TRIM(BOTH FROM o.corriere_spedizione), ''::text)) AS corriere_id,
    NULLIF(TRIM(BOTH FROM o.corriere), ''::text) AS corriere_scelto,
    COALESCE(max(o.peso_manuale)::numeric, round(COALESCE(sum(r.quantita_ordinata * p.peso_kg), 0::numeric), 1)) AS peso,
    COALESCE(o.colli, 1) AS colli,
    o.polybox,
        CASE
            WHEN o.note ~* 'polibox|polybox|ghiaccio|surgelat|frozen'::text THEN 'frozen'::text
            WHEN COALESCE(NULLIF(TRIM(BOTH FROM o.corriere), ''::text), NULLIF(TRIM(BOTH FROM o.corriere_spedizione), ''::text)) = 'brt'::text THEN 'secco'::text
            ELSE 'fresh'::text
        END AS temperatura,
    o.stato,
    o.data_ordine::date AS data,
    o.costo_stimato,
    o.metodo_pagamento,
    o.contrassegno_importo
   FROM ordini o
     JOIN righe_ordine r ON r.id_ordine = o.id_ordine
     LEFT JOIN prodotti p ON p.id_prodotto::text = r.id_prodotto
  WHERE COALESCE(o.archiviato, false) = false AND lower(COALESCE(o.stato, ''::text)) <> 'spedito'::text
  GROUP BY o.id_ordine, o.cliente, o.cap, o.corriere_spedizione, o.corriere, o.colli, o.polybox, o.note, o.stato, o.data_ordine, o.costo_stimato, o.metodo_pagamento, o.contrassegno_importo;

notify pgrst, 'reload schema';
