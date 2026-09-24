-- La bolla congelata tiene anche il terzo sconto (24/09/2026).
-- congela_ddt() fotografava sconto e sconto2 ma non sconto3: sulle tre bolle
-- con il terzo sconto (2089, 2099, 2151) il totale scritto non tornava piu'
-- con le righe fotografate. Il totale era giusto, la foto era incompleta.

begin;

create or replace function public.congela_ddt()
 returns trigger
 language plpgsql
as $function$
BEGIN
  IF coalesce(btrim(new.ddt_numero), '') = '' THEN RETURN new; END IF;
  IF tg_op = 'UPDATE' AND coalesce(old.ddt_numero, '') = coalesce(new.ddt_numero, '') THEN
    RETURN new;   -- il numero non e' cambiato: la foto e' gia' stata scattata
  END IF;

  INSERT INTO ddt_congelati (ddt_numero, id_ordine, cliente, metodo_pagamento, colli,
                             totale_imponibile, righe)
  SELECT btrim(new.ddt_numero), new.id_ordine, new.cliente, new.metodo_pagamento,
         new.colli, new.totale_imponibile,
         coalesce(jsonb_agg(jsonb_build_object(
           'id_riga', r.id_riga, 'prodotto', r.id_prodotto,
           'descrizione', r.descrizione_prodotto, 'quantita', r.quantita_ordinata,
           'prezzo', r.prezzo_unitario, 'sconto', r.sconto_pct, 'sconto2', r.sconto2_pct,
           'sconto3', r.sconto3_pct,
           'iva', r.iva_pct, 'natura_iva', r.natura_iva
         ) ORDER BY r.ordine_riga), '[]'::jsonb)
  FROM righe_ordine r WHERE r.id_ordine = new.id_ordine
  ON CONFLICT (ddt_numero) DO NOTHING;   -- un documento si fotografa una volta sola
  RETURN new;
END;
$function$;

-- Le tre bolle gia' scattate: si aggiunge il terzo sconto preso dalla riga
-- dell'ordine con lo stesso id_riga, ma SOLO se con quel dato la somma delle
-- righe torna col totale scritto sulla bolla. Se non torna, non si tocca.
with proposta as (
  select d.ddt_numero,
         jsonb_agg(e || jsonb_build_object('sconto3', r.sconto3_pct) order by ord) righe_nuove,
         round(sum(coalesce((e->>'quantita')::numeric,0)*coalesce((e->>'prezzo')::numeric,0)
           *(1-coalesce((e->>'sconto')::numeric,0)/100)*(1-coalesce((e->>'sconto2')::numeric,0)/100)
           *(1-coalesce(r.sconto3_pct,0)/100)),2) somma
  from ddt_congelati d
  cross join lateral jsonb_array_elements(d.righe) with ordinality as x(e, ord)
  left join righe_ordine r on r.id_riga::text = e->>'id_riga'
  where d.righe::text not like '%sconto3%'
    and exists (select 1 from righe_ordine r2 where r2.id_ordine = d.id_ordine and coalesce(r2.sconto3_pct,0) <> 0)
  group by d.ddt_numero
)
update ddt_congelati d set righe = p.righe_nuove
from proposta p
where p.ddt_numero = d.ddt_numero and abs(p.somma - d.totale_imponibile) < 0.05;

commit;
