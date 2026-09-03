-- UN CAP SBAGLIATO SI PUO' TOGLIERE.
--
-- Il presidio che impedisce alle anagrafiche di perdere dati difendeva anche
-- "X" e "35": una volta entrata, una sciocchezza nel campo CAP non si poteva
-- piu' cancellare, si poteva solo sostituire. Chi corregge non sempre sa il CAP
-- giusto: deve poter svuotare la casella e lasciarla in rosso.
--
-- Stessa deroga che c'e' gia' per il metodo di pagamento: quello che il sistema
-- stesso rifiuta non si difende, altrimenti la scheda resta bloccata per sempre.
-- Un CAP con meno di quattro cifre non e' un CAP in nessun paese; da quattro in
-- su resta protetto (la Svizzera ne usa quattro, l'Italia cinque).

create or replace function anagrafica_non_perde_niente()
returns trigger
language plpgsql
as $$
DECLARE
  v_campi text[] := ARRAY['metodo_pagamento','agente_nome','agente_id','sede_legale','cap',
                          'citta','provincia','telefono','email','pec','codice_univoco',
                          'partita_iva','ragione_sociale','corriere_abituale','listino_standard',
                          'tipologia','insegna','note','giorno_chiusura','orari_consegna'];
  v_campo text; v_prima text; v_dopo text;
  v_new jsonb := to_jsonb(new);
  v_old jsonb := to_jsonb(old);
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
      INSERT INTO clienti_override_storico (chiave, codice_cliente, campo, valore_prima, valore_dopo, operatore)
      VALUES (new.chiave, coalesce(new.codice_cliente, old.codice_cliente), v_campo, v_prima, v_dopo,
              coalesce(nullif(btrim(coalesce(new.operatore,'')), ''), 'non firmato'));
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
