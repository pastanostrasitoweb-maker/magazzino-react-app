-- ELIMINARE UN ORDINE E' UNA COSA SOLA, NON SEI.
--
-- Review avversariale del 02/09/2026. Cancellare un ordine gia' preparato
-- significa rimettere in magazzino la merce che era stata scalata. Il codice
-- lo faceva a passi separati: leggeva la giacenza di un lotto, la riscriveva
-- sommando l'assegnato, passava al lotto dopo, e solo alla fine cancellava
-- l'ordine. Se qualcosa si rompeva a meta' (rete, permesso, timeout) una parte
-- della merce era gia' rientrata ma l'ordine c'era ancora: al secondo
-- tentativo rientrava di nuovo. Due click ravvicinati facevano lo stesso.
-- Il risultato e' una giacenza gonfiata in silenzio, e da li' si promette a un
-- cliente merce che non c'e'.
--
-- Qui e' una transazione sola: o rientra tutto e l'ordine sparisce, o non
-- cambia niente. E la riga si blocca, quindi due chiamate insieme si mettono
-- in fila invece di sovrapporsi.
-- Il tipo di ritorno cambia: la vecchia va tolta prima.
DROP FUNCTION IF EXISTS elimina_ordine(text);

CREATE OR REPLACE FUNCTION elimina_ordine(p_id_ordine text)
-- I nomi in uscita sono diversi da quelli delle colonne: dentro la funzione
-- `id_lotto` sarebbe insieme una variabile e una colonna, e Postgres si ferma.
RETURNS TABLE (lotto_id text, quantita_nuova numeric)
LANGUAGE plpgsql
AS $$
DECLARE
  v_ordine ordini%rowtype;
  v_scalato boolean;
BEGIN
  SELECT * INTO v_ordine FROM ordini WHERE id_ordine = p_id_ordine FOR UPDATE;
  IF NOT FOUND THEN
    -- Gia' cancellato: chi ripete la richiesta trova la stessa risposta e non
    -- riaccredita niente. E' questo che rende sicuro premere due volte.
    RETURN;
  END IF;

  -- La merce e' stata scalata solo se l'ordine era arrivato a preparato.
  v_scalato := lower(btrim(coalesce(v_ordine.stato, ''))) IN ('preparato', 'spedito')
               OR coalesce(v_ordine.archiviato, false);

  IF v_scalato THEN
    RETURN QUERY
    WITH da_rimettere AS (
      SELECT a.id_lotto, sum(a.quantita_assegnata) AS q
      FROM assegnazioni_lotti a
      JOIN righe_ordine r ON r.id_riga = a.id_riga
      WHERE r.id_ordine = p_id_ordine
      GROUP BY a.id_lotto
    ),
    bloccati AS (
      SELECT l.id_lotto FROM lotti l
      JOIN da_rimettere d ON d.id_lotto = l.id_lotto
      ORDER BY l.id_lotto
      FOR UPDATE
    ),
    aggiornati AS (
      UPDATE lotti l
         SET quantita_caricata = l.quantita_caricata + d.q
        FROM da_rimettere d
       WHERE l.id_lotto = d.id_lotto
         AND l.id_lotto IN (SELECT id_lotto FROM bloccati)
      RETURNING l.id_lotto, l.quantita_caricata
    )
    SELECT a.id_lotto::text, a.quantita_caricata FROM aggiornati a;
  END IF;

  DELETE FROM ordini WHERE id_ordine = p_id_ordine;
END;
$$;

GRANT EXECUTE ON FUNCTION elimina_ordine(text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
