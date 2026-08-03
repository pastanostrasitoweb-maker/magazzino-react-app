-- Ripristino dei doppioni eliminati il 03/08/2026.
-- Un comando solo e tornano tutti, con i dati esatti che avevano.

INSERT INTO clienti_master (codice, codice_gestionale, ragione_sociale, citta, provincia, piva, telefono, email, origine, creato_il) VALUES ('CLI-24', '24', 'ARTGALLERY srl', '', '', '05157031005', '', 'saltimbocca-roma@tiscali.it', 'gestionale', '2026-08-01 16:37:48.122596+00');
INSERT INTO clienti_master (codice, codice_gestionale, ragione_sociale, citta, provincia, piva, telefono, email, origine, creato_il) VALUES ('CLI-1248', '1248', 'TESSIERI SRL', 'PONSACCO', 'PI', '00000000000', '', '', 'gestionale', '2026-08-01 16:37:48.122596+00');
INSERT INTO clienti_master (codice, codice_gestionale, ragione_sociale, citta, provincia, piva, telefono, email, origine, creato_il) VALUES ('CLI-1250', '1250', 'C&G SRL', 'AREZZO', 'AR', '00000000000', '', '', 'gestionale', '2026-08-01 16:37:48.122596+00');
INSERT INTO clienti_master (codice, codice_gestionale, ragione_sociale, citta, provincia, piva, telefono, email, origine, creato_il) VALUES ('CLI-198', '198', 'SHOW FOOD.srl', '', '', '13401961001', '', '', 'gestionale', '2026-08-01 16:37:48.122596+00');
INSERT INTO clienti_master (codice, codice_gestionale, ragione_sociale, citta, provincia, piva, telefono, email, origine, creato_il) VALUES ('CLI-1155', '1155', 'COMMERCIALE OCSA SRL', 'CAPURSO', 'BA', '00000000000', '', '', 'gestionale', '2026-08-01 16:37:48.122596+00');
INSERT INTO clienti_master (codice, codice_gestionale, ragione_sociale, citta, provincia, piva, telefono, email, origine, creato_il) VALUES ('CLI-620', '620', 'LAZZINI SENZA GLUTINE SRL', '', '', '01375870456', '585251323', '', 'gestionale', '2026-08-01 16:37:48.122596+00');
INSERT INTO clienti_master (codice, codice_gestionale, ragione_sociale, citta, provincia, piva, telefono, email, origine, creato_il) VALUES ('CLI-1346', '1346', 'BRACE SRL', '', '', '00000000000', '', '', 'gestionale', '2026-08-01 16:37:48.122596+00');
INSERT INTO clienti_master (codice, codice_gestionale, ragione_sociale, citta, provincia, piva, telefono, email, origine, creato_il) VALUES ('PH-IV-0070', NULL, 'Celiachia E Gusto S.R.L.', 'Cagliari', 'CA', NULL, '070 513628', NULL, 'agenti', '2026-08-01 16:37:48.122596+00');

-- Il task CRM era su PH-IV-0070, spostato su CLI-1486.
UPDATE crm_task SET cliente_id = 'PH-IV-0070' WHERE id = 'fu-PH-IV-0070';
