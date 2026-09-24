-- La bolla e' quella dell'archivio (24/09/2026).
--
-- Regola di Luca: "l'agente inserisce l'ordine, poi ci possono essere delle
-- modifiche che la sede fa. Quando confermiamo che il DDT arriva in archivio,
-- gli arriva l'importo corretto. L'importo corretto e' sempre ed
-- esclusivamente il totale del DDT che si trova in archivio."
--
-- Prima la bolla si congelava quando nasceva il numero, cioe' alla stampa del
-- mattino, mentre l'ordine era ancora nei Preparati. Le correzioni della sede
-- fatte dopo la stampa e prima dell'archivio (sconti della scheda, righe
-- aggiunte o tolte) restavano fuori, e il controllo le segnalava come
-- "ordine cambiato dopo il DDT" quando erano il DDT giusto.
--
-- Da oggi: quando l'ordine va in archivio la bolla si rifotografa. Dopo
-- l'archivio non si rifotografa piu': quello che cambia dopo e' una
-- differenza da spiegare, e il controllo quotidiano la segnala.

begin;

create or replace function public.ricongela_ddt_in_archivio()
 returns trigger
 language plpgsql
as $function$
BEGIN
  IF coalesce(btrim(new.ddt_numero), '') = '' THEN RETURN new; END IF;

  INSERT INTO ddt_congelati (ddt_numero, id_ordine, cliente, metodo_pagamento, colli,
                             totale_imponibile, righe)
  SELECT btrim(new.ddt_numero), new.id_ordine, new.cliente, new.metodo_pagamento, new.colli,
         -- Il totale dalle righe, non dalla testata: la testata a volte resta
         -- indietro, le righe sono quello che si stampa e si fattura.
         round(coalesce(sum(netto_riga(r.quantita_ordinata, r.prezzo_unitario,
                                       r.sconto_pct, r.sconto2_pct, r.sconto3_pct)), 0), 2),
         coalesce(jsonb_agg(jsonb_build_object(
           'id_riga', r.id_riga, 'prodotto', r.id_prodotto,
           'descrizione', r.descrizione_prodotto, 'quantita', r.quantita_ordinata,
           'prezzo', r.prezzo_unitario, 'sconto', r.sconto_pct, 'sconto2', r.sconto2_pct,
           'sconto3', r.sconto3_pct,
           'iva', r.iva_pct, 'natura_iva', r.natura_iva
         ) ORDER BY r.ordine_riga) FILTER (WHERE r.id_riga IS NOT NULL), '[]'::jsonb)
  FROM (SELECT 1) uno
  LEFT JOIN righe_ordine r ON r.id_ordine = new.id_ordine
  ON CONFLICT (ddt_numero) DO UPDATE
     SET cliente = excluded.cliente,
         metodo_pagamento = excluded.metodo_pagamento,
         colli = excluded.colli,
         totale_imponibile = excluded.totale_imponibile,
         righe = excluded.righe;
     -- emesso_il resta quello della stampa: e' la data del documento.
  RETURN new;
END;
$function$;

drop trigger if exists trg_ricongela_ddt_in_archivio on ordini;
create trigger trg_ricongela_ddt_in_archivio after update on ordini
  for each row when (new.archiviato is true and old.archiviato is distinct from new.archiviato)
  execute function ricongela_ddt_in_archivio();

-- Il passato. La foto alla stampa si tiene da parte, non si butta.
create table if not exists ddt_congelati_alla_stampa as
  select d.*, now() as messa_da_parte_il from ddt_congelati d where false;
revoke all on ddt_congelati_alla_stampa from anon;
grant select on ddt_congelati_alla_stampa to authenticated, service_role;

-- Si riallineano SOLO le bolle per cui c'e' la prova di cosa era l'ordine in
-- archivio: l'importo mandato alla coda Sibill al momento dell'archiviazione
-- (ddt_sibill_invii) coincide con le righe di oggi. Se non coincide l'ordine
-- e' cambiato dopo l'archivio, e la bolla non si tocca.
create temp table da_riallineare on commit drop as
select d.ddt_numero, d.id_ordine
from ddt_congelati d
join ordini o on o.id_ordine = d.id_ordine and coalesce(o.archiviato, false)
cross join lateral (select importo from ddt_sibill_invii s where s.ddt_numero = d.ddt_numero
                    order by creato_il desc limit 1) s
cross join lateral (select round(coalesce(sum(netto_riga(r.quantita_ordinata, r.prezzo_unitario,
                                   r.sconto_pct, r.sconto2_pct, r.sconto3_pct)),0),2) somma
                    from righe_ordine r where r.id_ordine = d.id_ordine) oggi
where d.emesso_il >= '2026-08-01'
  and abs(coalesce(d.totale_imponibile,0) - oggi.somma) >= 0.05
  and abs(s.importo - oggi.somma) < 0.05;

insert into ddt_congelati_alla_stampa
select d.*, now() from ddt_congelati d join da_riallineare x using (ddt_numero);

update ddt_congelati d
   set totale_imponibile = n.totale, righe = n.righe
from (
  select x.ddt_numero,
         round(coalesce(sum(netto_riga(r.quantita_ordinata, r.prezzo_unitario,
                        r.sconto_pct, r.sconto2_pct, r.sconto3_pct)),0),2) totale,
         coalesce(jsonb_agg(jsonb_build_object(
           'id_riga', r.id_riga, 'prodotto', r.id_prodotto,
           'descrizione', r.descrizione_prodotto, 'quantita', r.quantita_ordinata,
           'prezzo', r.prezzo_unitario, 'sconto', r.sconto_pct, 'sconto2', r.sconto2_pct,
           'sconto3', r.sconto3_pct, 'iva', r.iva_pct, 'natura_iva', r.natura_iva
         ) order by r.ordine_riga) filter (where r.id_riga is not null), '[]'::jsonb) righe
  from da_riallineare x left join righe_ordine r on r.id_ordine = x.id_ordine
  group by x.ddt_numero
) n
where n.ddt_numero = d.ddt_numero;

commit;
