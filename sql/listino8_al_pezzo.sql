-- Listino 8 (Ho.Re.Ca.): gli articoli che si vendono al PEZZO.
--
-- REGOLA DI LUCA (05/08/2026): "nel listino horeca ci sono dei prodotti che
-- vengono venduti a cartone e altri al pezzo. Quelli che hai elencato e' meglio
-- venderli tutti al pezzo."
--
-- COS'ERA. Il listino 8 portava questi articoli a CARTONE (HORECA 122 = 23,00,
-- um = 'CT') mentre il listino 1, le fatture emesse e le righe d'ordine li
-- trattano al PEZZO (2,30). Dieci pezzi per cartone. Un cliente su listino 8
-- avrebbe preso 23,00 per un pezzo: dieci volte tanto, su 152 clienti.
--
-- NON TUTTI GLI HORECA SONO COSI'. HOR 001-006 e HORECA 212/213/214 sono
-- davvero a cartone e il prezzo di listino coincide al centesimo con quello
-- fatturato (35,20 = 35,20). Quelli non si toccano: sono i "prodotti venduti a
-- cartone" di cui parla Luca.
--
-- COME SI DECIDE QUALI. Non si divide per dieci a occhio: il rapporto non e'
-- costante e HORECA 211 sta a 22,40 contro 1,40, che farebbe sedici. Si divide
-- per dieci SOLO dove fra le fatture emesse esiste davvero una riga a quel
-- prezzo: e' il dato a confermare la conversione, non l'aritmetica.
--
-- Non basta guardare il prezzo piu' usato. HORECA 113 ha due prezzi commerciali,
-- 2,50 su 27 fatture e 2,80 su 24: il piu' frequente e' 2,50, ma quello di
-- listino e' 2,80, ed e' 2,80 che moltiplicato per dieci ritorna i 28,00 del
-- cartone. Il piu' usato avrebbe fatto fallire la prova su un articolo giusto.
--
-- E non basta nemmeno che UNA fattura a un decimo esista. HOR 005 e' fatturato
-- 11 volte a 43,40 e una sola volta a 4,34: quel 4,34 e' uno zero perso da
-- qualcuno, e da solo avrebbe convertito al pezzo un articolo che si vende a
-- cartone, dividendo per dieci il suo prezzo. Quindi si confrontano le
-- frequenze: si converte solo se il prezzo al pezzo e' stato fatturato PIU'
-- volte di quello a cartone.
--
-- RIESEGUIBILE. I listini sono stati caricati una volta (01/08/2026, fonte
-- 'gamma' per il listino 1 e 'catalogo-app' per l'8) e nessuno script li
-- riscrive. Se un domani si reimportano, questo file va rilanciato: e'
-- idempotente e si riconosce dalla fonte che scrive.

WITH conteggi AS (
  SELECT l.codice_articolo,
         l.prezzo AS prezzo_cartone,
         round(l.prezzo / 10.0, 4) AS prezzo_pezzo,
         COUNT(*) FILTER (WHERE abs(f.prezzo_unitario - l.prezzo / 10.0) < 0.005) AS volte_al_pezzo,
         COUNT(*) FILTER (WHERE abs(f.prezzo_unitario - l.prezzo) < 0.005) AS volte_a_cartone
    FROM listini_gestionale l
    LEFT JOIN fatture_righe f
           ON upper(regexp_replace(COALESCE(f.codice_articolo, ''), '[^A-Za-z0-9]', '', 'g'))
            = upper(regexp_replace(COALESCE(l.codice_articolo, ''), '[^A-Za-z0-9]', '', 'g'))
          AND f.prezzo_unitario > 0
   WHERE l.listino = '8' AND COALESCE(l.um, '') = 'CT' AND l.prezzo > 0
   GROUP BY l.codice_articolo, l.prezzo
)
UPDATE listini_gestionale l
   SET prezzo = c.prezzo_pezzo,
       um = 'PZ',
       -- La fonte dice da dove viene il numero: serve a chi lo ritrovera' fra
       -- sei mesi chiedendosi perche' 2,30 e non 23,00.
       fonte = 'catalogo-app+al-pezzo-2026-08-05',
       aggiornato_il = now()
  FROM conteggi c
 WHERE l.listino = '8'
   AND l.codice_articolo = c.codice_articolo
   AND c.volte_al_pezzo > c.volte_a_cartone
   AND c.volte_al_pezzo >= 3;

NOTIFY pgrst, 'reload schema';
