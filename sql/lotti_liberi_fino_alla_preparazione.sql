-- IL LOTTO NON SI IMPEGNA PRIMA DELLA PREPARAZIONE.
--
-- Luca, 24/08/2026: "mi deve impegnare solo ed esclusivamente l'articolo e non
-- i lotti fino a quando non vengono assegnati e preparati".
--
-- L'assegnazione di un ordine ancora da preparare e' una proposta di prelievo,
-- non merce prenotata: l'impegno vive sul PRODOTTO (somma degli ordini aperti).
-- Il lotto resta a giacenza piena finche' la merce non esce: alla preparazione
-- lo scarico riduce quantita_caricata, e i conti tornano da soli.
--
-- Prima la vista sottraeva le assegnazioni degli ordini aperti, e "spesso non
-- ci torna dove stanno": la stessa quantita' appariva sia come giacenza del
-- lotto sia come impegno, e nessuno capiva piu' cosa fosse libero.
create or replace view v_lotti_disponibilita as
  select l.id_lotto,
         l.id_prodotto,
         l.codice_lotto,
         l.lotto,
         l.scadenza,
         l.quantita_caricata,
         l.archiviato,
         0::numeric as prenotato,
         l.quantita_caricata as disponibile
    from lotti l;

-- La funzione che controlla i fermi alla riapertura ragiona sulla giacenza
-- fisica: un'assegnazione non regge se chiede piu' pezzi di quanti il lotto
-- ne ha davvero, non piu' "di quanti ne restano dopo gli impegni".
create or replace function assegnazioni_che_non_reggono(p_id_ordine text)
returns table (id_assegnazione text, codice_lotto text, descrizione text,
               chiesti numeric, liberi numeric)
language sql stable as $$
  select a.id_assegnazione, a.codice_lotto, r.descrizione_prodotto,
         a.quantita_assegnata, l.quantita_caricata
    from assegnazioni_lotti a
    join righe_ordine r on r.id_riga = a.id_riga
    join lotti l on l.id_lotto = a.id_lotto
   where r.id_ordine = p_id_ordine
     and a.quantita_assegnata > l.quantita_caricata;
$$;
