-- IL DOCUMENTO NON CAMBIA DOPO CHE E' STATO EMESSO.
--
-- Luca, 31/08/2026: "Bongusto ha una fattura diversa dal DDT: gli hai
-- assegnato 7 lasagne. E altri hanno il metodo di pagamento diverso dal DDT.
-- Fixalo all'origine e fai in modo che non succeda piu'".
--
-- DUE CAUSE DIVERSE, LO STESSO EFFETTO: la fattura nasce rileggendo l'ordine
-- di ADESSO, mentre il DDT dice quello che c'era al momento della stampa. Se
-- fra i due momenti qualcosa cambia, i due documenti divergono e il cliente se
-- ne accorge prima di noi.
--
-- CAUSA 1, la quantita' (Bongusto, DDT 1958). Il "lotto al volo" assegnava la
-- quantita' scritta nel riquadro senza guardare quanto ne chiedeva la riga:
-- una riga da 1 lasagna si e' presa 7 pezzi (l'operatore scriveva la quantita'
-- del lotto prodotto, non quella da spedire). Il magazzino ha scaricato 7, il
-- DDT ne ha stampata 1. L'assegnazione normale il controllo ce l'aveva, quella
-- al volo no: la guardia va messa DOVE PASSANO TUTTE, cioe' qui.
--
-- CAUSA 2, il metodo di pagamento. Il DDT lo stampa al momento della stampa;
-- se dopo cambia (e fino a oggi cambiava da solo: tre automatismi lo
-- riscrivevano), la fattura riporta l'altro. Il metodo di un documento emesso
-- si congela: la ristampa deve restituire lo stesso foglio che ha firmato il
-- cliente.

-- ===========================================================================
-- 1. NON SI SPEDISCE PIU' DI QUANTO ORDINATO (senza dirlo)
-- ===========================================================================
CREATE OR REPLACE FUNCTION assegna_lotto(
  p_id_riga text, p_id_lotto text, p_quantita numeric, p_operatore text DEFAULT '',
  p_allow_negative boolean DEFAULT false, p_aggiungi boolean DEFAULT false,
  p_oltre_ordinato boolean DEFAULT false)
RETURNS assegnazioni_lotti
LANGUAGE plpgsql
AS $$
declare
  v_lotto lotti%rowtype; v_prenotato_altri numeric; v_disp numeric;
  v_existing assegnazioni_lotti%rowtype; v_result assegnazioni_lotti%rowtype;
  v_nuova numeric; v_ordinata numeric; v_altre numeric; v_descr text;
begin
  if p_quantita <= 0 then raise exception 'Quantita non valida: %', p_quantita; end if;

  select * into v_lotto from lotti where id_lotto = p_id_lotto for update;
  if not found then raise exception 'Lotto % inesistente', p_id_lotto; end if;

  select * into v_existing from assegnazioni_lotti
   where id_riga = p_id_riga and id_lotto = p_id_lotto;

  if v_existing.id_assegnazione is not null and p_aggiungi then
    v_nuova := v_existing.quantita_assegnata + p_quantita;
  else
    v_nuova := p_quantita;
  end if;

  -- LA MERCE CHE ESCE E' QUELLA DEL DOCUMENTO. Assegnare piu' pezzi di quelli
  -- ordinati vuol dire scaricare merce che sulla bolla non compare: la
  -- giacenza cala e la fattura non torna. Si puo' fare (a volte la riga si
  -- corregge dopo), ma va chiesto: p_oltre_ordinato lo dice a voce alta.
  if not p_oltre_ordinato then
    select r.quantita_ordinata, r.descrizione_prodotto into v_ordinata, v_descr
      from righe_ordine r where r.id_riga = p_id_riga;
    if v_ordinata is not null then
      select coalesce(sum(a.quantita_assegnata), 0) into v_altre
        from assegnazioni_lotti a
       where a.id_riga = p_id_riga and a.id_lotto <> p_id_lotto;
      if (v_nuova + v_altre) > v_ordinata then
        raise exception
          'OLTRE_ORDINATO: % ne ordina % ma ne staresti assegnando %. '
          'La merce in piu'' esce dal magazzino senza comparire in bolla.',
          coalesce(v_descr, p_id_riga), v_ordinata, (v_nuova + v_altre);
      end if;
    end if;
  end if;

  if not p_allow_negative then
    select coalesce(sum(a.quantita_assegnata), 0) into v_prenotato_altri
      from assegnazioni_lotti a
      join righe_ordine r on r.id_riga = a.id_riga
      join ordini o on o.id_ordine = r.id_ordine
     where a.id_lotto = p_id_lotto and a.id_riga <> p_id_riga
       and lower(btrim(o.stato)) <> 'preparato' and o.archiviato = false;
    v_disp := v_lotto.quantita_caricata - v_prenotato_altri;
    if v_nuova > v_disp then
      raise exception 'Disponibilita insufficiente sul lotto % (disponibile %, richiesti %).',
        p_id_lotto, v_disp, v_nuova;
    end if;
  end if;

  if v_existing.id_assegnazione is not null then
    update assegnazioni_lotti
       set quantita_assegnata = v_nuova, data_ora = now(), operatore = p_operatore,
           id_prodotto = v_lotto.id_prodotto, codice_lotto = v_lotto.codice_lotto,
           lotto = v_lotto.lotto
     where id_assegnazione = v_existing.id_assegnazione
     returning * into v_result;
  else
    insert into assegnazioni_lotti (id_assegnazione, id_riga, id_lotto, id_prodotto,
                                    codice_lotto, lotto, quantita_assegnata, data_ora, operatore)
    values ('ASS-' || (extract(epoch from clock_timestamp()) * 1000)::bigint,
            p_id_riga, p_id_lotto, v_lotto.id_prodotto, v_lotto.codice_lotto,
            v_lotto.lotto, v_nuova, now(), p_operatore)
    returning * into v_result;
  end if;

  update righe_ordine r
     set quantita_assegnata = (select coalesce(sum(a.quantita_assegnata), 0)
                                 from assegnazioni_lotti a where a.id_riga = r.id_riga)
   where r.id_riga = p_id_riga;

  return v_result;
end;
$$;

GRANT EXECUTE ON FUNCTION assegna_lotto(text, text, numeric, text, boolean, boolean, boolean) TO anon, authenticated;

-- ===========================================================================
-- 2. IL DDT SI CONGELA QUANDO NASCE
-- ===========================================================================
-- Quando si stacca il numero, si fotografa quello che il documento dice:
-- righe, quantita', prezzi, IVA, metodo di pagamento, colli. Da li' in poi la
-- ristampa e la fattura leggono la FOTO, non l'ordine di oggi. Cosi' il
-- documento firmato dal cliente resta uno solo, anche se domani qualcuno
-- corregge l'ordine.
CREATE TABLE IF NOT EXISTS ddt_congelati (
  ddt_numero        text PRIMARY KEY,
  id_ordine         text NOT NULL,
  cliente           text,
  emesso_il         timestamptz NOT NULL DEFAULT now(),
  metodo_pagamento  text,
  colli             int,
  totale_imponibile numeric,
  righe             jsonb NOT NULL
);
ALTER TABLE ddt_congelati ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ddt_congelati_tutti ON ddt_congelati;
CREATE POLICY ddt_congelati_tutti ON ddt_congelati FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE ON ddt_congelati TO anon, authenticated;

CREATE OR REPLACE FUNCTION congela_ddt()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF coalesce(btrim(new.ddt_numero), '') = '' THEN RETURN new; END IF;
  IF tg_op = 'UPDATE' AND coalesce(old.ddt_numero, '') = coalesce(new.ddt_numero, '') THEN
    RETURN new;   -- il numero non e' cambiato: la foto e' gia' stata scattata
  END IF;

  INSERT INTO ddt_congelati (ddt_numero, id_ordine, cliente, metodo_pagamento, colli,
                             totale_imponibile, righe)
  SELECT btrim(new.ddt_numero), new.id_ordine, new.cliente, new.metodo_pagamento,
         new.colli, new.totale_imponibile,
         coalesce(jsonb_agg(jsonb_build_object(
           'id_riga', r.id_riga, 'prodotto', r.id_prodotto,
           'descrizione', r.descrizione_prodotto, 'quantita', r.quantita_ordinata,
           'prezzo', r.prezzo_unitario, 'sconto', r.sconto_pct, 'sconto2', r.sconto2_pct,
           'iva', r.iva_pct, 'natura_iva', r.natura_iva
         ) ORDER BY r.ordine_riga), '[]'::jsonb)
  FROM righe_ordine r WHERE r.id_ordine = new.id_ordine
  ON CONFLICT (ddt_numero) DO NOTHING;   -- un documento si fotografa una volta sola
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS trg_congela_ddt ON ordini;
CREATE TRIGGER trg_congela_ddt
  AFTER INSERT OR UPDATE OF ddt_numero ON ordini
  FOR EACH ROW EXECUTE FUNCTION congela_ddt();

-- ===========================================================================
-- 3. SE L'ORDINE SI ALLONTANA DAL SUO DOCUMENTO, SI VEDE
-- ===========================================================================
-- Non basta congelare: bisogna sapere QUANDO l'ordine e il suo documento non
-- dicono piu' la stessa cosa, perche' e' li' che nasce la fattura sbagliata.
CREATE OR REPLACE VIEW v_ddt_divergenti AS
SELECT c.ddt_numero, c.id_ordine, c.cliente, c.emesso_il::date AS emesso_il,
       CASE WHEN coalesce(c.metodo_pagamento,'') IS DISTINCT FROM coalesce(o.metodo_pagamento,'')
            THEN 'pagamento: ' || coalesce(c.metodo_pagamento,'(vuoto)') || ' -> ' || coalesce(o.metodo_pagamento,'(vuoto)') END AS pagamento_cambiato,
       CASE WHEN coalesce(c.colli,0) IS DISTINCT FROM coalesce(o.colli,0)
            THEN 'colli: ' || coalesce(c.colli,0) || ' -> ' || coalesce(o.colli,0) END AS colli_cambiati,
       CASE WHEN round(coalesce(c.totale_imponibile,0),2) IS DISTINCT FROM round(coalesce(o.totale_imponibile,0),2)
            THEN 'totale: ' || round(coalesce(c.totale_imponibile,0),2) || ' -> ' || round(coalesce(o.totale_imponibile,0),2) END AS totale_cambiato,
       (SELECT count(*) FROM righe_ordine r
         WHERE r.id_ordine = c.id_ordine
           AND r.quantita_ordinata IS DISTINCT FROM
               (SELECT (x->>'quantita')::numeric FROM jsonb_array_elements(c.righe) x
                 WHERE x->>'id_riga' = r.id_riga)) AS righe_cambiate
FROM ddt_congelati c
JOIN ordini o ON o.id_ordine = c.id_ordine
WHERE coalesce(c.metodo_pagamento,'') IS DISTINCT FROM coalesce(o.metodo_pagamento,'')
   OR coalesce(c.colli,0) IS DISTINCT FROM coalesce(o.colli,0)
   OR round(coalesce(c.totale_imponibile,0),2) IS DISTINCT FROM round(coalesce(o.totale_imponibile,0),2);

GRANT SELECT ON v_ddt_divergenti TO anon, authenticated;

-- LA MERCE USCITA CHE NON STA IN BOLLA. Il caso Bongusto, e chiunque altro.
CREATE OR REPLACE VIEW v_righe_oltre_ordinato AS
SELECT o.id_ordine, o.cliente, o.ddt_numero, o.stato, coalesce(o.archiviato,false) AS archiviato,
       r.id_riga, r.descrizione_prodotto,
       r.quantita_ordinata AS in_bolla, r.quantita_assegnata AS scaricate,
       (r.quantita_assegnata - r.quantita_ordinata) AS pezzi_in_piu,
       round((r.quantita_assegnata - r.quantita_ordinata) * coalesce(r.prezzo_unitario,0), 2) AS valore
FROM righe_ordine r
JOIN ordini o ON o.id_ordine = r.id_ordine
WHERE r.quantita_assegnata > r.quantita_ordinata;

GRANT SELECT ON v_righe_oltre_ordinato TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

-- ===========================================================================
-- 4. UNA SOLA assegna_lotto
-- ===========================================================================
-- Ne convivevano quattro versioni (4, 5, 6 e 7 parametri): le vecchie NON
-- hanno la guardia dell'oltre-ordinato, e chi chiamava con meno argomenti
-- finiva su quelle, scavalcando il controllo senza saperlo. Un solo produttore
-- per un dato, una sola funzione per un'operazione: restano i default a
-- coprire le chiamate corte.
DROP FUNCTION IF EXISTS assegna_lotto(text, text, numeric, text);
DROP FUNCTION IF EXISTS assegna_lotto(text, text, numeric, text, boolean);
DROP FUNCTION IF EXISTS assegna_lotto(text, text, numeric, text, boolean, boolean);

NOTIFY pgrst, 'reload schema';
