-- L'anagrafica impara l'agente dagli ordini, da sola.
--
-- REGOLA DI LUCA (05/08/2026): "se un agente manda un ordine dal proprio
-- applicativo, lui deve essere l'agente del cliente. Non ci dovrebbe essere
-- bisogno che lo facciamo noi. Vale per tutti gli agenti."
--
-- Sta nel DATABASE e non nell'importazione perché gli ordini arrivano da più
-- strade: l'app agenti, il caricamento a mano in azienda, una correzione. Il
-- risultato dev'essere lo stesso da tutte.
--
-- RIEMPIE SOLO SE VUOTO, mai sovrascrive. Se il cliente ha già un agente e
-- arriva un ordine di un altro, non si cambia niente: capita che una vendita
-- la chiuda la direzione o un collega, e riassegnare il cliente vorrebbe dire
-- spostare le provvigioni a chi non le ha fatte. Quella è una decisione di
-- Luca, non di un trigger.

CREATE OR REPLACE FUNCTION agente_impara_dal_ordine() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_chiave text;
  v_piva   text;
  v_rag    text;
BEGIN
  IF COALESCE(TRIM(NEW.agente_nome), '') = '' THEN RETURN NEW; END IF;
  IF NEW.id_cliente IS NULL THEN RETURN NEW; END IF;

  -- Stessa chiave che usa l'app (clientKeyFor): P.IVA se c'è, altrimenti il
  -- nome normalizzato. Se non combacia, l'anagrafica non si trova più.
  SELECT NULLIF(m.piva, ''), m.ragione_sociale INTO v_piva, v_rag
    FROM clienti_master m WHERE m.codice = NEW.id_cliente;
  IF NOT FOUND THEN RETURN NEW; END IF;

  v_chiave := CASE WHEN COALESCE(v_piva, '') <> ''
                   THEN 'piva:' || regexp_replace(v_piva, '\D', '', 'g')
                   ELSE 'nome:' || lower(btrim(COALESCE(v_rag, NEW.cliente))) END;

  INSERT INTO clienti_override (chiave, ragione_sociale, agente_id, agente_nome, operatore, aggiornato_il)
  VALUES (v_chiave, COALESCE(v_rag, NEW.cliente),
          NULLIF(TRIM(COALESCE(NEW.agente_id, '')), ''), TRIM(NEW.agente_nome),
          'automatico', now())
  ON CONFLICT (chiave) DO UPDATE
    SET agente_nome = TRIM(NEW.agente_nome),
        agente_id   = COALESCE(NULLIF(TRIM(COALESCE(NEW.agente_id,'')), ''), clienti_override.agente_id),
        aggiornato_il = now()
   -- SOLO se l'anagrafica non ne aveva già uno.
   WHERE COALESCE(TRIM(clienti_override.agente_nome), '') = '';

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agente_impara_dal_ordine ON ordini;
CREATE TRIGGER trg_agente_impara_dal_ordine
  AFTER INSERT OR UPDATE OF agente_nome, id_cliente ON ordini
  FOR EACH ROW EXECUTE FUNCTION agente_impara_dal_ordine();
