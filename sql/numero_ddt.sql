-- Numerazione dei DDT: crescente, senza buchi, senza doppioni.
--
-- REGOLA (Luca, 03/08/2026): "una volta che generi il DDT deve avere una
-- numerazione crescente, non lasciare buchi".
--
-- Il vecchio modo la bucava, e non per sbadataggine: leggeva il prossimo numero
-- con una query, poi lo scriveva con una seconda chiamata. In mezzo ci stanno
-- due guai:
--   1. due postazioni che generano insieme leggono lo STESSO numero (doppione);
--   2. se la scrittura fallisce, quel numero l'ha visto qualcuno e nessuno lo
--      usa piu' (buco).
-- Qui leggere e scrivere sono la STESSA istruzione, dentro un lock: nessuno
-- puo' infilarsi in mezzo, e il numero esiste solo se e' finito su un ordine.
--
-- E' anche IDEMPOTENTE: se l'ordine ha gia' un numero, torna quello. Ristampare
-- un DDT non consuma mai un numero nuovo.
--
-- Formato: numero puro e progressivo (1822, 1823, ...), che continua la serie
-- del gestionale. Il vecchio 'DDT-2026-nnn' resta solo sugli 8 documenti di
-- prova del 24 e 31 luglio, che sono di epoca TeamSystem.

CREATE OR REPLACE FUNCTION assegna_numero_ddt(p_id_ordine text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_esistente text;
  v_nuovo     int;
BEGIN
  SELECT NULLIF(TRIM(ddt_numero), '') INTO v_esistente
  FROM ordini WHERE id_ordine = p_id_ordine;

  -- L'ordine non esiste: meglio dirlo che inventare un numero.
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ordine % inesistente', p_id_ordine;
  END IF;

  -- Ce l'ha gia': si ristampa, non si numera di nuovo.
  IF v_esistente IS NOT NULL THEN
    RETURN v_esistente;
  END IF;

  -- Da qui in poi uno alla volta. Il lock si sblocca da solo a fine
  -- transazione, anche se qualcosa va storto.
  PERFORM pg_advisory_xact_lock(hashtext('numero_ddt'));

  SELECT COALESCE(MAX(ddt_numero::int), 0) + 1 INTO v_nuovo
  FROM ordini
  WHERE ddt_numero ~ '^[0-9]+$';

  UPDATE ordini SET ddt_numero = v_nuovo::text WHERE id_ordine = p_id_ordine;

  RETURN v_nuovo::text;
END;
$$;

GRANT EXECUTE ON FUNCTION assegna_numero_ddt(text) TO anon, authenticated;

-- Rete di sicurezza: due ordini non possono portare lo stesso numero, nemmeno
-- se qualcuno lo scrivesse a mano da fuori l'app.
CREATE UNIQUE INDEX IF NOT EXISTS ordini_ddt_numero_unico
  ON ordini (ddt_numero)
  WHERE COALESCE(TRIM(ddt_numero), '') <> '';
