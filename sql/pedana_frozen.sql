-- La pedana surgelata: il gelo a cartoni, senza poly box.
--
-- RICHIESTA DI LUCA (17/08/2026): "quando carichi l'ordine non da' la
-- possibilita' di aggiungere la linea gelo, immagino perche' sia vincolata al
-- polybox. Allora dagli sia la possibilita' di comporre il polybox oppure la
-- possibilita' di inserire i CT frozen, e quando lo fai assicurati che sia una
-- consegna che va con Stef Frozen. Altrimenti non farglieli inserire."
-- E subito dopo: "il concetto dei polybox dal momento che scegli la logistica
-- frozen non esiste piu', perche' ovviamente deve essere tutto frozen dentro la
-- pedana."
--
-- COM'ERA. Il gelo aveva una sola strada: a collo, nel poly box col ghiaccio
-- secco, dentro una spedizione refrigerata. Il ghiaccio tiene tre giorni, quindi
-- l'app dei surgelati li mostrava solo dove un corriere refrigerato consegna
-- entro tre giorni senza fermarsi nel weekend. Dove non ci riusciva, il gelo
-- SPARIVA dal catalogo: ed e' esattamente quello che Luca ha visto.
--
-- Il paradosso e' che Stef surgelati, il camion a -18 dedicato, quelle zone le
-- serve: il ghiaccio secco non c'entra niente quando il vano frigo sta a -18 per
-- tutto il viaggio. Mancava solo il modo di dirlo.
--
-- Sono DUE STRADE ALTERNATIVE, non due strade che si sommano:
--   a collo    poly box + ghiaccio secco, dentro una spedizione fresh, a PEZZI
--   in pedana  Stef surgelati, tutto il carico a -18, a CARTONI
-- In pedana il poly box non esiste e l'ordine e' tutto gelo: il fresco caricato
-- su una pedana a -18 si rovina.
--
-- Una colonna sola per parte, booleana, default falso: gli ordini di ieri
-- restano quello che erano (a collo), e nessun calcolo cambia per loro.

-- Il ponte: e' l'agente che sceglie come viaggia la merce che sta vendendo.
ALTER TABLE ordini_agenti ADD COLUMN IF NOT EXISTS pedana_frozen boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN ordini_agenti.pedana_frozen IS
  'La consegna viaggia su pedana surgelata (Stef surgelati) invece che a collo nel poly box. In pedana l''ordine e'' tutto gelo, a cartoni.';

-- Il magazzino: la scelta arriva con l''ordine e decide la temperatura di
-- spedizione, quindi quali corrieri il motore puo' proporre.
ALTER TABLE ordini ADD COLUMN IF NOT EXISTS pedana_frozen boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN ordini.pedana_frozen IS
  'Ordine da spedire su pedana surgelata: temperatura frozen-pedana, corriere Stef surgelati, nessun poly box.';

NOTIFY pgrst, 'reload schema';
