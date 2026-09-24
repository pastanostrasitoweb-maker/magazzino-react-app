-- IL PREZZO DELLE FATTURE E' AL CARTONE, LA RIGA PUO' ESSERE A PEZZI (Luca 24/09/2026).
--
-- Tessieri: 20 colli di Tagliolini e Mezzi Paccheri HORECA a 14 EUR il sacchetto
-- da 10. In sede l'ordine e' nato giusto (200 pezzi a 1,40). Poi dal pannello
-- Preparati e' arrivato il suggerimento "ultimo 16,50" preso dallo storico delle
-- fatture Sibill: 16,50 e' il prezzo del SACCHETTO pagato a giugno, ma la riga
-- e' a pezzi. Salvato cosi': 200 x 16,50 x 2 = 6.600 EUR invece di 560.
-- Lo storico delle fatture (storico_cliente_articolo, fonte fatture-sibill) ha
-- l'unita' nella colonna unita_misura: 4.445 righe su 4.840 sono 'CT', 218 sono
-- vuote (fra cui le due di Tessieri). Su un prodotto con pezzi_collo > 1 quel
-- prezzo puo' valere per il cartone o per il pezzo, e nessuno qui lo sa: non si
-- propone. Resta il ripiego quando il prodotto e' a collo singolo (cartone =
-- pezzo) o quando la fattura dice esplicitamente 'PZ'. I nostri DDT
-- (v_ultimo_prezzo_documento) restano la prima fonte e non cambiano: sono nella
-- stessa unita' delle righe.
-- Un suggerimento che manca si vede; un suggerimento al cartone applicato al
-- pezzo finisce in bolla a 11 volte il prezzo.

CREATE OR REPLACE FUNCTION public.prezzi_gia_fatti(p_codice_cliente text)
 RETURNS TABLE(id_prodotto text, codice_prodotto text, prezzo numeric, sconto1_pct numeric, sconto2_pct numeric, sconto3_pct numeric, netto_unitario numeric, fonte text, documento text, quando date)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select d.id_prodotto, d.codice_prodotto, d.prezzo,
         d.sconto1_pct, d.sconto2_pct, d.sconto3_pct, d.netto_unitario,
         'documento'::text, ('DDT ' || d.ddt_numero)::text, d.data_documento
  from v_ultimo_prezzo_documento d
  where d.codice_cliente = btrim(p_codice_cliente)
  union all
  select p.id_prodotto::text, p.codice_prodotto, s.ultimo_prezzo,
         coalesce(s.ultimo_sconto, 0), 0, 0,
         round(s.ultimo_prezzo * (1 - coalesce(s.ultimo_sconto, 0) / 100.0), 4),
         'fattura'::text, ('fatture fino al ' || to_char(s.ultimo_ordine, 'DD/MM/YYYY'))::text, s.ultimo_ordine
  from storico_cliente_articolo s
  join prodotti p on upper(regexp_replace(coalesce(p.codice_prodotto, ''), '[^A-Za-z0-9]', '', 'g'))
                   = upper(regexp_replace(coalesce(s.codice, ''), '[^A-Za-z0-9]', '', 'g'))
  left join clienti_master m on m.codice = btrim(p_codice_cliente)
  left join clienti_override ov on ov.chiave = 'piva:' || coalesce(m.piva, '')
  where s.piva = coalesce(nullif(ov.partita_iva, ''), m.piva)
    and coalesce(s.ultimo_prezzo, 0) > 0
    -- al cartone su un multi-pezzo non si propone (vedi in testa al file)
    and (coalesce(p.pezzi_collo, 1) <= 1 or upper(coalesce(s.unita_misura, '')) = 'PZ')
    and not exists (
      select 1 from v_ultimo_prezzo_documento d2
      where d2.codice_cliente = btrim(p_codice_cliente)
        and d2.id_prodotto = p.id_prodotto::text);
$function$;

CREATE OR REPLACE FUNCTION public.ultimo_prezzo_cliente(p_codice_cliente text, p_id_prodotto text)
 RETURNS TABLE(prezzo numeric, sconto1_pct numeric, sconto2_pct numeric, sconto3_pct numeric, netto_unitario numeric, fonte text, documento text, quando date)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- 1) l'ultimo documento nostro: e' il prezzo che il cliente ha visto in bolla
  select d.prezzo, d.sconto1_pct, d.sconto2_pct, d.sconto3_pct, d.netto_unitario,
         'documento'::text, ('DDT ' || d.ddt_numero)::text, d.data_documento
  from v_ultimo_prezzo_documento d
  where d.codice_cliente = btrim(p_codice_cliente)
    and d.id_prodotto = btrim(p_id_prodotto)
  union all
  -- 2) e se non gli abbiamo mai fatto quella riga, la memoria delle fatture
  select s.ultimo_prezzo, coalesce(s.ultimo_sconto, 0), 0, 0,
         round(s.ultimo_prezzo * (1 - coalesce(s.ultimo_sconto, 0) / 100.0), 4),
         'fattura'::text, ('fatture fino al ' || to_char(s.ultimo_ordine, 'DD/MM/YYYY'))::text, s.ultimo_ordine
  from storico_cliente_articolo s
  join prodotti p on upper(regexp_replace(coalesce(p.codice_prodotto, ''), '[^A-Za-z0-9]', '', 'g'))
                   = upper(regexp_replace(coalesce(s.codice, ''), '[^A-Za-z0-9]', '', 'g'))
  left join clienti_master m on m.codice = btrim(p_codice_cliente)
  left join clienti_override ov on ov.chiave = 'piva:' || coalesce(m.piva, '')
  where p.id_prodotto::text = btrim(p_id_prodotto)
    and s.piva = coalesce(nullif(ov.partita_iva, ''), m.piva)
    and coalesce(s.ultimo_prezzo, 0) > 0
    -- al cartone su un multi-pezzo non si propone (vedi in testa al file)
    and (coalesce(p.pezzi_collo, 1) <= 1 or upper(coalesce(s.unita_misura, '')) = 'PZ')
    and not exists (
      select 1 from v_ultimo_prezzo_documento d2
      where d2.codice_cliente = btrim(p_codice_cliente) and d2.id_prodotto = btrim(p_id_prodotto))
  limit 1;
$function$;

NOTIFY pgrst, 'reload schema';
