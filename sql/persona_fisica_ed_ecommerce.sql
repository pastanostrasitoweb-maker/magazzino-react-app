-- Persona fisica e ordini dal sito: due segni, non piu' il testo libero.
--
-- RICHIESTA DI LUCA (22/08/2026): "quando sono ordini e-commerce tramite il
-- nostro sito dobbiamo trovare il modo di segnalarli, perche' ho bisogno che nel
-- flusso di fatturazione siano persona fisica e non azienda, altrimenti mi da'
-- errore ovviamente."
--
-- Ha ragione due volte. La fattura elettronica a una persona ha una struttura
-- DIVERSA da quella a un'azienda: vuole Nome e Cognome separati al posto della
-- Denominazione, e NON vuole la partita IVA, solo il codice fiscale. Mandare una
-- persona come azienda non e' una imprecisione: lo SDI scarta il documento.
--
-- COM'ERA. Gli ordini dal sito si riconoscevano solo dal testo scritto a mano, e
-- in otto ordini erano scritti in cinque modi: "ORDINE ECOMMERCE Rita Panella",
-- "COLI SIMONE (cliente ecommerce)", "STEFANO BATTAGLIA (cliente ecomm...",
-- "ANDREA FALDINI (ORDINE ECOMMERCE)", e "ecommerce - ordine in pezzi" nelle
-- note. Con quel testo non si puo' decidere niente in automatico.
--
-- DUE SEGNI DISTINTI, perche' sono due fatti diversi:
--   persona_fisica  sul CLIENTE: dice come si intesta la fattura. Vale per
--                   sempre e per tutti i suoi ordini.
--   ecommerce       sull'ORDINE: dice da dove e' arrivato. Serve alle metriche,
--                   e un privato puo' ordinare anche per telefono.
ALTER TABLE clienti_override ADD COLUMN IF NOT EXISTS persona_fisica boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN clienti_override.persona_fisica IS
  'Il cliente e'' una persona, non un''azienda: in fattura elettronica vanno Nome e Cognome separati e il solo codice fiscale, senza partita IVA.';

ALTER TABLE ordini ADD COLUMN IF NOT EXISTS ecommerce boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN ordini.ecommerce IS
  'Ordine arrivato dal sito. Segno di provenienza per le metriche: non decide da solo come si fattura, quello lo dice persona_fisica sul cliente.';

-- Nome e cognome separati: la fattura li vuole distinti, e da "Rita Panella" non
-- si indovinano sempre (i cognomi composti esistono). Le colonne ci sono, si
-- riempiono quando servono; se restano vuote il generatore spacca il nome e lo
-- segnala.
ALTER TABLE clienti_override ADD COLUMN IF NOT EXISTS nome text;
ALTER TABLE clienti_override ADD COLUMN IF NOT EXISTS cognome text;

-- Gli otto ordini che il testo dichiara gia': si accende il segno su quelli.
-- Non e' interpretazione, e' quello che qualcuno ha scritto a mano.
UPDATE ordini
   SET ecommerce = true
 WHERE ecommerce IS FALSE
   AND (cliente ~* 'e-?commerce' OR note ~* 'e-?commerce');

-- Chi compra dal sito e' una persona finche' non risulta il contrario: gli
-- ordini e-commerce senza partita IVA valida accendono persona_fisica sul
-- cliente. Chi ha una partita IVA vera resta azienda.
UPDATE clienti_override ov
   SET persona_fisica = true
 WHERE persona_fisica IS FALSE
   AND coalesce(regexp_replace(coalesce(ov.partita_iva,''), '\D', '', 'g'), '') !~ '^\d{11}$'
   AND EXISTS (
     SELECT 1 FROM ordini o
      WHERE o.ecommerce IS TRUE
        AND lower(btrim(split_part(o.cliente, '·', 1))) LIKE '%' || lower(btrim(ov.ragione_sociale)) || '%'
   );

NOTIFY pgrst, 'reload schema';
