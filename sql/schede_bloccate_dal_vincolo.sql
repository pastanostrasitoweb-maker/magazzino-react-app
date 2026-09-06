-- 387 SCHEDE CLIENTE ERANO DIVENTATE INTOCCABILI.
--
-- Errore in produzione, 02/09/2026 sera, sull'Isola Celiaca Viterbo:
-- "Spostamento non riuscito". Il primo messaggio parlava dello storico (mio,
-- gia' corretto), ma sotto ce n'era un altro piu' insidioso.
--
-- Sulla tabella delle schede esiste il vincolo `metodo_solo_dalla_lista`: il
-- metodo dev'essere vuoto o in forma canonica. E' stato aggiunto NOT VALID,
-- cioe' senza controllare le righe che c'erano gia': quelle sono rimaste al
-- loro posto con dentro "Ri.Ba.", "Bonifico", "Da concordare". Il guaio e' che
-- il vincolo si applica a ogni riga che viene MODIFICATA: da quel momento
-- qualunque scrittura su quelle 387 schede falliva, e con essa l'operazione
-- che l'aveva scatenata. Spostare un ordine di quel cliente diventava
-- impossibile, e il messaggio parlava d'altro.
--
-- Un vincolo NOT VALID non e' una rete di sicurezza: e' una mina che esplode
-- alla prossima modifica, su dati che nessuno sta guardando in quel momento.
--
-- Qui si bonifica: chi ha un metodo ricavabile dalle sei fonti lo prende, agli
-- altri il campo si svuota (il grezzo non produceva comunque una scadenza, e
-- resta scritto nello storico). Poi il vincolo si valida, cosi' non restano
-- mine in giro.

-- Il presidio "il vuoto non cancella il pieno" deve lasciar passare la
-- bonifica: un valore che il database stesso rifiuta non e' un dato da
-- proteggere, e tenerlo significa lasciare la scheda bloccata per sempre.
CREATE OR REPLACE FUNCTION anagrafica_non_perde_niente()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
      -- ECCEZIONE: un metodo che il database rifiuta non si difende. Tenerlo
      -- vorrebbe dire lasciare la scheda inservibile per sempre.
      IF v_campo = 'metodo_pagamento' AND metodo_pagamento_canonico(v_prima) IS NULL THEN
        NULL;   -- si lascia svuotare
      ELSE
        v_new := jsonb_set(v_new, ARRAY[v_campo], to_jsonb(v_prima));
        CONTINUE;
      END IF;
    END IF;

    BEGIN
      INSERT INTO clienti_override_storico (chiave, codice_cliente, campo, valore_prima, valore_dopo, operatore)
      VALUES (new.chiave, coalesce(new.codice_cliente, old.codice_cliente), v_campo, v_prima, v_dopo,
              coalesce(nullif(btrim(coalesce(new.operatore,'')), ''), 'non firmato'));
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;

  RETURN jsonb_populate_record(new, v_new);
END; $$;

-- 1. Chi ha un metodo ricavabile dalle sei fonti lo prende.
UPDATE clienti_override co
   SET metodo_pagamento = metodo_del_cliente(co.codice_cliente)
 WHERE coalesce(btrim(co.metodo_pagamento), '') <> ''
   AND metodo_pagamento_canonico(co.metodo_pagamento) IS DISTINCT FROM btrim(co.metodo_pagamento)
   AND metodo_del_cliente(co.codice_cliente) IS NOT NULL;

-- 2. Agli altri si svuota il campo: il grezzo non diceva quando si incassa, e
--    ora la scheda torna scrivibile. Il valore resta nello storico.
UPDATE clienti_override co
   SET metodo_pagamento = NULL
 WHERE coalesce(btrim(co.metodo_pagamento), '') <> ''
   AND metodo_pagamento_canonico(co.metodo_pagamento) IS DISTINCT FROM btrim(co.metodo_pagamento);

-- 3. Niente piu' mine: il vincolo vale per tutte le righe, non solo per le nuove.
ALTER TABLE clienti_override VALIDATE CONSTRAINT metodo_solo_dalla_lista;

NOTIFY pgrst, 'reload schema';
