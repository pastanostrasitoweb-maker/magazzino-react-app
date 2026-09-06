-- L'ORDINE FERMO NON TIENE LA MERCE.
--
-- Luca, 24/08/2026: "quando l'ordine e' fermo non impegna le giacenze!".
-- Aveva ragione e non era teoria: 99 pezzi su 50 righe erano bloccati da
-- ordini fermi dal 31/07 e dall'11/08. Merce sullo scaffale che l'app
-- dichiarava non disponibile, e che quindi nessun altro poteva vendere.
--
-- Un ordine fermo e' un ordine sospeso: aspetta un pagamento da verificare, un
-- prodotto che non c'e', una risposta. Fino a quando non riparte, la merce che
-- aveva prenotato torna a disposizione di tutti. Le assegnazioni NON si
-- cancellano (si deve poter tornare indietro): smettono solo di contare.
create or replace view v_lotti_disponibilita as
  select l.id_lotto,
         l.id_prodotto,
         l.codice_lotto,
         l.lotto,
         l.scadenza,
         l.quantita_caricata,
         l.archiviato,
         coalesce(p.prenotato, 0::numeric) as prenotato,
         l.quantita_caricata - coalesce(p.prenotato, 0::numeric) as disponibile
    from lotti l
    left join (
      select a.id_lotto, sum(a.quantita_assegnata) as prenotato
        from assegnazioni_lotti a
        join righe_ordine r on r.id_riga = a.id_riga
        join ordini o on o.id_ordine = r.id_ordine
       where lower(btrim(o.stato)) not in ('preparato', 'fermo')
         and o.archiviato = false
       group by a.id_lotto
    ) p on p.id_lotto = l.id_lotto;

-- QUANDO L'ORDINE RIPARTE, LA MERCE POTREBBE NON ESSERCI PIU'.
-- Se mentre era fermo qualcun altro ha preso quei pezzi, l'assegnazione vecchia
-- e' una bugia: il lotto andrebbe sotto zero. Questa funzione dice, PRIMA di
-- riaprire, quali assegnazioni non stanno piu' in piedi e di quanto.
create or replace function assegnazioni_che_non_reggono(p_id_ordine text)
returns table (id_assegnazione text, codice_lotto text, descrizione text,
               chiesti numeric, liberi numeric)
language sql stable as $$
  select a.id_assegnazione, a.codice_lotto, r.descrizione_prodotto,
         a.quantita_assegnata, d.disponibile
    from assegnazioni_lotti a
    join righe_ordine r on r.id_riga = a.id_riga
    join v_lotti_disponibilita d on d.id_lotto = a.id_lotto
   where r.id_ordine = p_id_ordine
     and a.quantita_assegnata > d.disponibile;
$$;
grant execute on function assegnazioni_che_non_reggono(text) to anon, authenticated;
