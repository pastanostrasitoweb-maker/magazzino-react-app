-- UN CORRIERE, UN NOME SOLO.
--
-- Analisi dell'app logistica, 02/09/2026. Nel campo `ordini.corriere` sono
-- finite TREDICI grafie per SEI vettori: il magazzino ci scriveva il nome
-- ("Stef", 117 ordini), l'app logistica l'id ("stef", 23), e a mano sono
-- passati "STEF" (13), "BRT AMBIENT", "Tacos", "TACOS", "Bio Tuscia
-- Trasporti" e "biotuscia". Chi conta le spedizioni per corriere ne contava
-- sei diversi dove ce n'era uno, e il controllo della fattura del corriere
-- confrontava mele con pere.
--
-- La regola della piattaforma dice: un dato, un produttore, una forma. La
-- forma qui e' l'ID (`stef`, `brt`, `biotuscia`...), perche' e' quella che il
-- motore tariffario usa per riconoscere il listino. I nomi restano
-- nell'anagrafica corrieri, e le app li mostrano leggendo l'id.
--
-- Le modalita' che NON sono corrieri ("Ritiro in sede", "ritiro del cliente")
-- non hanno un id e restano scritte com'erano: sono un modo di consegna, non
-- un vettore, e inventargli un codice sarebbe peggio.
CREATE OR REPLACE FUNCTION corriere_una_forma_sola()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_can text;
BEGIN
  IF coalesce(btrim(new.corriere), '') <> '' THEN
    v_can := _corriere_canonico(new.corriere);
    IF v_can IS NOT NULL THEN new.corriere := v_can; END IF;
  END IF;
  IF coalesce(btrim(new.corriere_spedizione), '') <> '' THEN
    v_can := _corriere_canonico(new.corriere_spedizione);
    IF v_can IS NOT NULL THEN new.corriere_spedizione := v_can; END IF;
  END IF;
  RETURN new;
END;
$$;

-- Prima di _freeze_corriere (ordine alfabetico dei nomi): quando il documento
-- si congela, il valore e' gia' in forma canonica.
DROP TRIGGER IF EXISTS trg_aa_corriere_una_forma ON ordini;
CREATE TRIGGER trg_aa_corriere_una_forma
  BEFORE INSERT OR UPDATE OF corriere, corriere_spedizione ON ordini
  FOR EACH ROW EXECUTE FUNCTION corriere_una_forma_sola();

-- Il pregresso si allinea: la lettura passa dall'id, e le app mostrano il nome.
UPDATE ordini o
   SET corriere = _corriere_canonico(o.corriere)
 WHERE coalesce(btrim(o.corriere), '') <> ''
   AND _corriere_canonico(o.corriere) IS NOT NULL
   AND _corriere_canonico(o.corriere) <> o.corriere;

UPDATE ordini o
   SET corriere_spedizione = _corriere_canonico(o.corriere_spedizione)
 WHERE coalesce(btrim(o.corriere_spedizione), '') <> ''
   AND _corriere_canonico(o.corriere_spedizione) IS NOT NULL
   AND _corriere_canonico(o.corriere_spedizione) <> o.corriere_spedizione;

-- Stessa forma anche sul corriere abituale del cliente, che finisce sugli
-- ordini nuovi: se li' resta il nome, ogni ordine nasce di nuovo storto.
UPDATE clienti_override c
   SET corriere_abituale = _corriere_canonico(c.corriere_abituale)
 WHERE coalesce(btrim(c.corriere_abituale), '') <> ''
   AND _corriere_canonico(c.corriere_abituale) IS NOT NULL
   AND _corriere_canonico(c.corriere_abituale) <> c.corriere_abituale;

-- IL CONTRASSEGNO INCASSATO NON E' IL FLAG DELLA CONTABILITA'.
-- L'app logistica scriveva `stato_pagamento = 'ok'` per dire "il corriere ha
-- incassato": ma quel campo nel magazzino significa un'altra cosa (il flag
-- manuale con cui l'amministrazione dice che la partita e' a posto). Due
-- significati sullo stesso campo vuol dire che il primo che scrive cancella
-- quello che intendeva l'altro. Il momento dell'incasso ha il suo posto.
ALTER TABLE ordini ADD COLUMN IF NOT EXISTS contrassegno_incassato_il timestamptz;

NOTIFY pgrst, 'reload schema';
