-- SULLA SCHEDA CI VA SOLO UN METODO DELLA LISTA, MAI IL TESTO DELL'ORDINE.
--
-- Quando la scheda era vuota questo trigger ci scriveva quello che c'era
-- scritto sull'ordine, cosi' com'era: e' cosi' che sono finiti in anagrafica
-- 235 "Bonifico" e 163 "Ri.Ba." secchi, che dicono il mezzo e non il termine.
-- E da li' tornavano indietro sugli ordini nuovi, perche' l'altro trigger
-- legge proprio la scheda: un giro chiuso che si autoalimentava.
--
-- Adesso se il metodo non e' nella lista la scheda resta VUOTA. Una casella
-- vuota si vede in Archivio ed e' vera; "Bonifico" secco sembra compilata e
-- non lo e', e nessuno la va piu' a guardare.

CREATE OR REPLACE FUNCTION public.ordine_insegna_al_cliente()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE v_chiave text; v_piva text; v_rag text; v_met text; v_lst text; v_met_can text; v_met_cambiato boolean; v_lst_cambiato boolean;
BEGIN
  IF new.id_cliente IS NULL THEN RETURN new; END IF;
  SELECT nullif(m.piva, ''), m.ragione_sociale INTO v_piva, v_rag FROM clienti_master m WHERE m.codice = new.id_cliente;
  IF NOT FOUND THEN RETURN new; END IF;
  v_chiave := chiave_anagrafica(v_piva, coalesce(v_rag, new.cliente));
  IF v_chiave IS NULL THEN RETURN new; END IF;
  v_met := nullif(trim(coalesce(new.metodo_pagamento, '')), ''); v_lst := nullif(trim(coalesce(new.listino, '')), '');
  v_met_can := metodo_pagamento_canonico(v_met);
  IF tg_op = 'UPDATE' THEN
    v_met_cambiato := new.metodo_pagamento IS DISTINCT FROM old.metodo_pagamento;
    v_lst_cambiato := new.listino IS DISTINCT FROM old.listino;
  ELSE v_met_cambiato := true; v_lst_cambiato := true; END IF;
  INSERT INTO clienti_override (chiave, codice_cliente, ragione_sociale, metodo_pagamento, listino_standard, operatore, aggiornato_il)
  VALUES (v_chiave, new.id_cliente, coalesce(v_rag, new.cliente), v_met_can, v_lst, 'da ordine', now())
  ON CONFLICT (chiave) DO UPDATE
    SET metodo_pagamento = CASE WHEN v_met_cambiato AND v_met_can IS NOT NULL THEN v_met_can ELSE clienti_override.metodo_pagamento END,
        listino_standard = CASE WHEN v_lst_cambiato AND v_lst IS NOT NULL THEN v_lst ELSE coalesce(clienti_override.listino_standard, v_lst) END,
        codice_cliente   = coalesce(clienti_override.codice_cliente, new.id_cliente),
        operatore = 'da ordine', aggiornato_il = now()
  WHERE (CASE WHEN v_met_cambiato AND v_met_can IS NOT NULL THEN v_met_can ELSE clienti_override.metodo_pagamento END) IS DISTINCT FROM clienti_override.metodo_pagamento
     OR (CASE WHEN v_lst_cambiato AND v_lst IS NOT NULL THEN v_lst ELSE coalesce(clienti_override.listino_standard, v_lst) END) IS DISTINCT FROM clienti_override.listino_standard
     OR clienti_override.codice_cliente IS NULL;
  RETURN new;
END; $function$


-- LA SERRATURA: in anagrafica non si scrive piu' un metodo fuori lista.
--
-- I trigger corretti bastano finche' nessuno scrive per un'altra strada.
-- Questo vincolo vale per le scritture NUOVE (NOT VALID: le 398 schede col
-- mezzo secco restano dove sono, sono clienti fermi da mesi e si sistemano
-- quando tornano a ordinare). Vuoto e' ammesso: una casella vuota e' vera,
-- "Bonifico" secco sembra compilata e non lo e'.
alter table public.clienti_override drop constraint if exists metodo_solo_dalla_lista;
alter table public.clienti_override add constraint metodo_solo_dalla_lista
  check (
    coalesce(btrim(metodo_pagamento), '') = ''
    -- ATTENZIONE ALL'IGNOTO: un CHECK che vale NULL passa. Senza il coalesce,
    -- "Bonifico" (che la funzione non sa interpretare, quindi torna NULL)
    -- faceva valere NULL a tutto il confronto e il vincolo lo lasciava entrare.
    or btrim(metodo_pagamento) = coalesce(metodo_pagamento_canonico(metodo_pagamento), '')
  ) not valid;
