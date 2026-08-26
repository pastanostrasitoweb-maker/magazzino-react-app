-- I CLIENTI CONFERMATI: quelli che un operatore ha guardato in faccia.
--
-- Luca, 26/08/2026: "tutte le volte che riceverai una modifica me li vai a
-- mettere dentro una tabella in cui sono quelli che sono stati modificati.
-- Quindi li diamo per certo che sono corretti... magari al codice cliente
-- aggiungi una R alla fine, cosi' sappiamo per certo che quello e' un codice
-- cliente che e' stato registrato".
--
-- LA "R" SI VEDE, MA LA CHIAVE NON SI TOCCA. Il codice cliente e' l'aggancio
-- di ordini, fatture, CRM, storico e provvigioni: cambiarlo in "CLI-1234-R"
-- spezzerebbe tutti quei collegamenti in un colpo solo, e ce ne accorgeremmo
-- dalla prima fattura che non trova piu' il suo cliente. Quindi il codice resta
-- CLI-1234 e la R e' un'ETICHETTA che l'app mostra accanto: stesso segnale a
-- colpo d'occhio, zero rotture.
--
-- La differenza con allineato_il: quello dice "i dati sono completi" e lo
-- calcola il database. Questo dice "una persona ci ha messo mano", che e' una
-- cosa diversa e piu' forte: un'anagrafica puo' essere completa e sbagliata.
create table if not exists clienti_confermati (
  chiave           text primary key,
  codice_cliente   text,
  codice_r         text,                    -- CLI-1234-R: l'etichetta da mostrare
  ragione_sociale  text,
  confermato_il    timestamptz not null default now(),
  confermato_da    text,
  campi_toccati    text[],                  -- cosa e' stato cambiato l'ultima volta
  volte            int not null default 1   -- quante volte ci hanno messo mano
);
alter table clienti_confermati enable row level security;
drop policy if exists clienti_confermati_tutti on clienti_confermati;
create policy clienti_confermati_tutti on clienti_confermati for all to anon, authenticated
  using (true) with check (true);
grant select, insert, update on clienti_confermati to anon, authenticated;

-- OGNI MODIFICA FATTA DA UNA PERSONA CONFERMA IL CLIENTE.
-- Le scritture automatiche no: se un trigger copia il metodo dall'ordine,
-- quello non e' qualcuno che ha verificato, e segnarlo come confermato sarebbe
-- una bugia comoda. Si riconoscono dall'operatore ('automatico', 'da ordine',
-- 'importazione', 'correzione scambio', 'ripristino').
create or replace function conferma_cliente_su_modifica()
returns trigger language plpgsql as $$
declare
  v_chi    text;
  v_campi  text[] := '{}';
begin
  v_chi := nullif(btrim(coalesce(new.operatore, '')), '');
  if v_chi is null or lower(v_chi) in
     ('automatico', 'da ordine', 'importazione', 'correzione scambio', 'ripristino', 'test')
  then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.metodo_pagamento is distinct from old.metodo_pagamento then v_campi := array_append(v_campi, 'metodo di pagamento'); end if;
    if new.agente_nome     is distinct from old.agente_nome     then v_campi := array_append(v_campi, 'agente'); end if;
    if new.sede_legale     is distinct from old.sede_legale     then v_campi := array_append(v_campi, 'indirizzo'); end if;
    if new.citta           is distinct from old.citta           then v_campi := array_append(v_campi, 'citta'); end if;
    if new.provincia       is distinct from old.provincia       then v_campi := array_append(v_campi, 'provincia'); end if;
    if new.cap             is distinct from old.cap             then v_campi := array_append(v_campi, 'cap'); end if;
    if new.partita_iva     is distinct from old.partita_iva     then v_campi := array_append(v_campi, 'partita iva'); end if;
    if new.codice_univoco  is distinct from old.codice_univoco  then v_campi := array_append(v_campi, 'codice destinatario'); end if;
    if new.pec             is distinct from old.pec             then v_campi := array_append(v_campi, 'pec'); end if;
    if cardinality(v_campi) = 0 then return new; end if;   -- salvato senza cambiare niente
  else
    v_campi := array['anagrafica creata'];
  end if;

  insert into clienti_confermati (chiave, codice_cliente, codice_r, ragione_sociale,
                                  confermato_il, confermato_da, campi_toccati, volte)
  values (new.chiave, new.codice_cliente,
          case when coalesce(btrim(new.codice_cliente), '') <> ''
               then new.codice_cliente || '-R' end,
          new.ragione_sociale, now(), v_chi, v_campi, 1)
  on conflict (chiave) do update
    set codice_cliente  = excluded.codice_cliente,
        codice_r        = excluded.codice_r,
        ragione_sociale = excluded.ragione_sociale,
        confermato_il   = now(),
        confermato_da   = excluded.confermato_da,
        campi_toccati   = excluded.campi_toccati,
        volte           = clienti_confermati.volte + 1;
  return new;
end;
$$;

drop trigger if exists trg_conferma_cliente on clienti_override;
create trigger trg_conferma_cliente
  after insert or update on clienti_override
  for each row execute function conferma_cliente_su_modifica();

-- DA SISTEMARE IN ARCHIVIO: i clienti che hanno ordinato dal 03/08 e che
-- nessuno ha ancora confermato. Sono quelli che vanno in rosso.
create or replace view v_clienti_da_confermare as
  select distinct on (a.chiave)
         a.chiave, a.codice_cliente, a.ragione_sociale,
         a.metodo_pagamento, a.agente_nome, a.mancano,
         (select max(coalesce(o.data_preparato, o.data_ordine))
            from ordini o where o.id_cliente = a.codice_cliente) as ultimo_ordine
    from v_clienti_allineamento a
   where not exists (select 1 from clienti_confermati c where c.chiave = a.chiave)
     and exists (select 1 from ordini o
                  where o.id_cliente = a.codice_cliente
                    and coalesce(o.data_preparato, o.data_ordine) >= '2026-08-03')
   order by a.chiave;
grant select on v_clienti_da_confermare to anon, authenticated;
