-- APRIRE, CONTROLLARE E SALVARE E' UNA CONFERMA. ANCHE SENZA MODIFICHE.
--
-- Luca, 26/08/2026: "abbiamo allineato tutto e adesso mi ridice cosi'".
-- Avevano fatto esattamente quello che il pannello rosso chiede: aprire la
-- scheda, controllare, salvare. Ma il trigger contava solo i salvataggi che
-- CAMBIAVANO qualcosa: se i dati erano gia' giusti, il controllo umano non
-- lasciava traccia e il cliente restava rosso per sempre.
--
-- Adesso: se una persona (non un processo) salva la scheda, il cliente e'
-- confermato. Se non ha toccato niente, la conferma dice "controllato senza
-- modifiche": e' l'esito migliore possibile, non un non-evento.
create or replace function conferma_cliente_al_salvataggio()
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
    if cardinality(v_campi) = 0 then
      v_campi := array['controllato senza modifiche'];
    end if;
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
