-- LO STORICO DEVE DIRE DA DOVE (03/09/2026)
--
-- Oggi tre scritture di massa hanno cambiato le anagrafiche (10:43 metodi di
-- pagamento, 11:37 arricchimento, 12:25 pulizia dei segnaposto) e alla domanda
-- "chi e stato?" lo storico non ha saputo rispondere: registrava `operatore`
-- preso dalla riga, cioe la firma di chi aveva scritto la volta PRIMA. Chi fa
-- un UPDATE diretto sul database non tocca quel campo, e cosi la modifica
-- risulta firmata da un altro.
--
-- Da qui in avanti ogni riga di storia porta anche l'utente del database e il
-- nome dell'applicazione che ha aperto la connessione: l'app che passa da
-- PostgREST e uno script lanciato a mano non si confondono piu.

alter table clienti_override_storico add column if not exists db_user text;
alter table clienti_override_storico add column if not exists sorgente text;

comment on column clienti_override_storico.db_user is
  'Utente del database che ha eseguito la modifica (anon = una delle app, postgres = SQL diretto).';
comment on column clienti_override_storico.sorgente is
  'application_name della connessione: dice quale strumento ha scritto.';

create or replace function anagrafica_non_perde_niente()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
DECLARE
  v_campi text[] := ARRAY['metodo_pagamento','agente_nome','agente_id','sede_legale','cap',
                          'citta','provincia','telefono','email','pec','codice_univoco',
                          'partita_iva','ragione_sociale','corriere_abituale','listino_standard',
                          'tipologia','insegna','note','giorno_chiusura','orari_consegna'];
  v_campo text; v_prima text; v_dopo text;
  v_new jsonb := to_jsonb(new);
  v_old jsonb := to_jsonb(old);
  -- ATTENZIONE: dentro una funzione SECURITY DEFINER `current_user` e sempre
  -- il proprietario della funzione, quindi non dice niente. Chi ha scritto
  -- davvero lo dicono `session_user` (chi ha aperto la connessione) e il ruolo
  -- attivo (anon = una delle app, postgres = SQL lanciato a mano).
  v_user text := session_user ||
    case when coalesce(current_setting('role', true), 'none') not in ('none', '')
         then ' come ' || current_setting('role', true) else '' end;
  v_app  text := coalesce(nullif(btrim(current_setting('application_name', true)), ''), '(senza nome)');
BEGIN
  FOREACH v_campo IN ARRAY v_campi LOOP
    IF NOT (v_old ? v_campo) THEN CONTINUE; END IF;
    v_prima := v_old ->> v_campo;
    v_dopo  := v_new ->> v_campo;
    IF v_prima IS NOT DISTINCT FROM v_dopo THEN CONTINUE; END IF;

    IF coalesce(btrim(coalesce(v_dopo, '')), '') = '' AND coalesce(btrim(v_prima), '') <> '' THEN
      IF v_campo = 'metodo_pagamento' AND metodo_pagamento_canonico(v_prima) IS NULL THEN
        NULL;  -- un metodo che il database rifiuta non si difende
      ELSIF v_campo = 'cap' AND btrim(v_prima) !~ '^[0-9]{4,5}$' THEN
        NULL;  -- e nemmeno un CAP che CAP non e'
      ELSIF e_un_segnaposto(v_prima) THEN
        NULL;  -- una "x" non e' un dato: toglierla non e' perdere niente
      ELSE
        v_new := jsonb_set(v_new, ARRAY[v_campo], to_jsonb(v_prima));
        CONTINUE;
      END IF;
    END IF;

    BEGIN
      INSERT INTO clienti_override_storico
        (chiave, codice_cliente, campo, valore_prima, valore_dopo, operatore, db_user, sorgente)
      VALUES (new.chiave, coalesce(new.codice_cliente, old.codice_cliente), v_campo, v_prima, v_dopo,
              coalesce(nullif(btrim(coalesce(new.operatore,'')), ''), 'non firmato'),
              v_user, v_app);
    EXCEPTION WHEN OTHERS THEN
      BEGIN
        INSERT INTO log_trigger_errori (trigger_nome, id_ordine, messaggio, dettaglio)
        VALUES ('storico_anagrafiche', new.chiave,
                'storia non registrata su ' || v_campo || ': ' || SQLERRM,
                left(coalesce(v_prima,'(vuoto)') || ' -> ' || coalesce(v_dopo,'(vuoto)'), 300));
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END;
  END LOOP;

  RETURN jsonb_populate_record(new, v_new);
END;
$$;

-- Le anagrafiche che oggi bloccano un ordine, con il motivo scritto: un rosso
-- deve poter essere spiegato senza aprire il database.
create or replace view v_anagrafiche_che_bloccano as
select
  o.id_ordine,
  o.stato,
  o.cliente,
  o.id_cliente,
  concat_ws(' + ',
    case when coalesce(btrim(c.ragione_sociale),'') = '' then 'ragione sociale' end,
    case when coalesce(btrim(c.partita_iva),'')     = '' then 'P.IVA' end,
    case when coalesce(btrim(c.sede_legale),'')     = '' then 'sede legale' end,
    case when coalesce(btrim(c.citta),'')           = '' then 'citta' end,
    case when coalesce(btrim(c.email),'')           = '' then 'email' end,
    case when coalesce(btrim(c.telefono),'')        = '' then 'telefono' end,
    case when coalesce(btrim(c.orari_consegna),'')  = '' then 'orario di scarico' end,
    case when coalesce(btrim(c.giorno_chiusura),'') = '' then 'giorno di chiusura' end,
    case when (coalesce(btrim(c.codice_univoco),'') = '' or btrim(c.codice_univoco) ~ '^0+$')
          and coalesce(btrim(c.pec),'') = '' then 'PEC o codice destinatario' end,
    case when metodo_pagamento_canonico(coalesce(nullif(btrim(o.metodo_pagamento),''), c.metodo_pagamento)) is null
         then 'metodo di pagamento' end
  ) as manca,
  (select string_agg(distinct s.campo || ' (era "' || s.valore_prima || '")', ', ')
     from clienti_override_storico s
    where s.codice_cliente = o.id_cliente
      and s.quando >= current_date - 7
      and coalesce(btrim(s.valore_prima),'') <> ''
      and coalesce(btrim(s.valore_dopo),'')  = ''
  ) as tolto_di_recente
from ordini o
left join clienti_override c on c.codice_cliente = o.id_cliente
where coalesce(o.archiviato, false) = false
  and o.stato in ('Da preparare','Preparato','Fermo');

grant select on v_anagrafiche_che_bloccano to anon, authenticated;
