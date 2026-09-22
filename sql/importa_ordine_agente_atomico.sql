-- Import atomico di un ordine dall'app agenti a magazzino: crea l'ordine,
-- le righe e riscrive il collegamento su ordini_agenti in UN'UNICA
-- transazione. Prima erano tre scritture separate dal browser (create ordine
-- -> create righe -> aggiorna ordini_agenti): se la terza falliva (rete,
-- timeout), l'ordine magazzino restava vero ma orfano, senza che nessuno lo
-- sapesse. Qui, se una parte fallisce, Postgres annulla tutto: o l'ordine
-- nasce collegato, o non nasce affatto. (Luca 22/09/2026, dopo gli ordini
-- persi di Gerati/Porta Fiorentina, Ivan/Piga e Ivan/Da Davidino.)
create or replace function importa_ordine_agente_atomico(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id_ordine text := p->>'id_ordine';
  v_id_app text := p->>'id_ordine_app_link';
  v_righe jsonb := coalesce(p->'righe', '[]'::jsonb);
  v_upd_count int;
begin
  if v_id_ordine is null or v_id_ordine = '' or v_id_app is null or v_id_app = '' then
    return jsonb_build_object('success', false, 'error', 'id ordine mancante');
  end if;

  insert into ordini (
    id_ordine, cliente, id_cliente, note, data_ordine, stato, stato_lavorazione,
    cap, archiviato, id_destinazione, id_ordine_app, agente_id, agente_nome,
    listino, pedana_frozen, sconto_cliente_pct
  ) values (
    v_id_ordine,
    p->>'cliente',
    nullif(p->>'id_cliente', ''),
    coalesce(p->>'note', ''),
    coalesce(nullif(p->>'data_ordine', '')::date, current_date),
    coalesce(nullif(p->>'stato', ''), 'Da preparare'),
    coalesce(nullif(p->>'stato_lavorazione', ''), 'Nuovo'),
    nullif(p->>'cap', ''),
    false,
    nullif(p->>'id_destinazione', ''),
    v_id_app,
    nullif(p->>'agente_id', ''),
    nullif(p->>'agente_nome', ''),
    nullif(p->>'listino', ''),
    coalesce((p->>'pedana_frozen')::boolean, false),
    nullif(p->>'sconto_cliente_pct', '')::numeric
  );

  if jsonb_array_length(v_righe) > 0 then
    insert into righe_ordine (
      id_riga, id_ordine, id_prodotto, descrizione_prodotto, quantita_ordinata,
      quantita_assegnata, ordine_riga, iva_pct, prezzo_unitario, sconto_pct,
      sconto2_pct, natura_iva, prezzo_origine
    )
    select
      r->>'lineId',
      v_id_ordine,
      r->>'productId',
      r->>'productName',
      coalesce(nullif(r->>'qtyOrdered', '')::numeric, 0),
      0,
      (r->>'rowOrder')::text,
      nullif(r->>'ivaPct', '')::numeric,
      nullif(r->>'prezzoUnitario', '')::numeric,
      coalesce(nullif(r->>'scontoPct', '')::numeric, 0),
      coalesce(nullif(r->>'sconto2Pct', '')::numeric, 0),
      nullif(r->>'naturaIva', ''),
      coalesce(nullif(r->>'prezzoOrigine', ''), 'app')
    from jsonb_array_elements(v_righe) r;
  end if;

  if (p->>'totale_imponibile') is not null and nullif(p->>'totale_imponibile', '') is not null then
    update ordini set totale_imponibile = (p->>'totale_imponibile')::numeric where id_ordine = v_id_ordine;
  end if;

  update ordini_agenti
  set id_ordine_magazzino = v_id_ordine,
      stato_magazzino = 'Preso in gestione',
      aggiornato_magazzino_il = now()
  where id_ordine = v_id_app;
  get diagnostics v_upd_count = row_count;

  if v_upd_count = 0 then
    raise exception 'collegamento a ordini_agenti fallito: riga % non trovata', v_id_app;
  end if;

  return jsonb_build_object('success', true, 'idOrdine', v_id_ordine);
end;
$$;

grant execute on function importa_ordine_agente_atomico(jsonb) to anon, authenticated, service_role;
