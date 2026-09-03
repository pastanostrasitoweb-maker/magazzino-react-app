-- LO STORICO NON DEVE BLOCCARE IL LAVORO.
--
-- Errore in produzione, 02/09/2026 sera: "new row violates row-level security
-- policy for table clienti_override_storico" allo spostamento di un ordine.
-- Colpa mia: ho creato la tabella dello storico con la RLS accesa e una sola
-- policy di LETTURA. Il trigger che ci scrive gira con i permessi di chi lo ha
-- scatenato (l'utente anonimo dell'app), quindi l'inserimento veniva rifiutato
-- e faceva fallire l'intera operazione. Un presidio che doveva proteggere i
-- dati stava fermando il magazzino.
--
-- La funzione del trigger diventa SECURITY DEFINER: scrive lei con i propri
-- permessi. Cosi' lo storico si riempie sempre, e resta NON scrivibile
-- direttamente dalle app (nessuno puo' inventarsi una riga di storia).
CREATE OR REPLACE FUNCTION anagrafica_non_perde_niente()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

    -- Il vuoto non cancella il pieno.
    IF coalesce(btrim(coalesce(v_dopo, '')), '') = '' AND coalesce(btrim(v_prima), '') <> '' THEN
      v_new := jsonb_set(v_new, ARRAY[v_campo], to_jsonb(v_prima));
      CONTINUE;
    END IF;

    -- E se anche lo storico fallisse, l'operazione NON si ferma: perdere una
    -- riga di cronaca e' meno grave che bloccare chi sta lavorando.
    BEGIN
      INSERT INTO clienti_override_storico (chiave, codice_cliente, campo, valore_prima, valore_dopo, operatore)
      VALUES (new.chiave, coalesce(new.codice_cliente, old.codice_cliente), v_campo, v_prima, v_dopo,
              coalesce(nullif(btrim(coalesce(new.operatore,'')), ''), 'non firmato'));
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;

  RETURN jsonb_populate_record(new, v_new);
END; $$;

NOTIFY pgrst, 'reload schema';
