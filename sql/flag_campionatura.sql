-- Il flag campionatura sull'ordine.
--
-- RICHIESTA DI LUCA (11/08/2026): "abbiamo un FLAG in ordini che dice che si
-- parla di una campionatura? Che sia a pagamento o no non ci interessa, ma a me
-- serve per metriche."
--
-- COM'ERA. Un flag non c'era. Le campionature si riconoscevano solo dal testo
-- libero: 8 scritte nel nome del cliente ("Fausto Scarponi CAMPIONATURA",
-- "DANIELE BRIZZI (campionatura agente)") e 12 nelle note, dove convivono con
-- tutto il resto: "BRT AMBIENT - CAMPIONATURA - ETICHETTE DA STAMPARE",
-- "stef - e' una campionatura in pezzi". Con quel testo non si conta niente: chi
-- scrive "campionatura" a volte lo abbrevia, a volte lo mette nel nome, a volte
-- lo dimentica.
--
-- Un booleano e non una lista di tipi, perche' Luca ha detto che a pagamento o
-- gratis non interessa: la domanda e' una sola, "e' una campionatura?". Se un
-- giorno servira' distinguere omaggi e resi si aggiungera' allora, con la
-- ragione davanti.
ALTER TABLE ordini ADD COLUMN IF NOT EXISTS campionatura boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN ordini.campionatura IS
  'Ordine di campionatura, a pagamento o gratuito. Serve alle metriche commerciali: quante campionature, a chi, per quale agente.';

-- ---------------------------------------------------------------------------
-- I casi che il testo dichiara gia': si accende il flag su quelli.
-- ---------------------------------------------------------------------------
-- Non e' un'interpretazione: sono ordini dove qualcuno ha scritto la parola
-- "campionatura" nel nome del cliente o nelle note. Cosi' la metrica parte con lo
-- storico dentro invece che da zero.
UPDATE ordini
   SET campionatura = true
 WHERE campionatura IS FALSE
   AND (cliente ILIKE '%campionat%' OR note ILIKE '%campionat%');

-- ---------------------------------------------------------------------------
-- La metrica, pronta da leggere.
-- ---------------------------------------------------------------------------
-- Per mese, quante campionature e quanto valgono. L'imponibile c'e' perche' una
-- campionatura a pagamento vale come vendita, e una gratuita e' un costo
-- commerciale: separarli serve, anche se il flag e' uno solo.
CREATE OR REPLACE VIEW v_campionature_per_mese AS
SELECT to_char(coalesce(o.data_ordine, o.data_preparato), 'YYYY-MM') AS mese,
       count(*) AS campionature,
       count(*) FILTER (WHERE coalesce(o.totale_imponibile, 0) > 0) AS a_pagamento,
       count(*) FILTER (WHERE coalesce(o.totale_imponibile, 0) = 0) AS gratuite,
       round(sum(coalesce(o.totale_imponibile, 0)), 2) AS imponibile,
       count(DISTINCT o.id_cliente) AS clienti,
       count(DISTINCT nullif(o.agente_nome, '')) AS agenti
  FROM ordini o
 WHERE o.campionatura IS TRUE
 GROUP BY 1
 ORDER BY 1 DESC;

GRANT SELECT ON v_campionature_per_mese TO anon, authenticated;

-- Chi le chiede: utile per capire se un agente campiona molto e converte poco.
CREATE OR REPLACE VIEW v_campionature_per_agente AS
SELECT coalesce(nullif(o.agente_nome, ''), '(senza agente)') AS agente,
       count(*) AS campionature,
       count(DISTINCT o.id_cliente) AS clienti_diversi,
       round(sum(coalesce(o.totale_imponibile, 0)), 2) AS imponibile,
       min(coalesce(o.data_ordine, o.data_preparato))::date AS dalla,
       max(coalesce(o.data_ordine, o.data_preparato))::date AS alla
  FROM ordini o
 WHERE o.campionatura IS TRUE
 GROUP BY 1
 ORDER BY 2 DESC;

GRANT SELECT ON v_campionature_per_agente TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
