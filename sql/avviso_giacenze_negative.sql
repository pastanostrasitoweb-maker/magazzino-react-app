-- Le giacenze sotto zero si fanno sentire, invece di aspettare che qualcuno se
-- ne accorga davanti allo scaffale.
--
-- COSA E' SUCCESSO (21/08/2026). "C'erano gli articoli in magazzino ma non
-- potevano essere assegnati, poi tutto si e' risolto." Il risolto erano 156
-- rettifiche a mano nel corso della mattina, per 194 pezzi rimessi dentro.
--
-- La causa e' che il magazzino lascia andare le giacenze in negativo: se esce
-- merce che non era mai stata caricata, il lotto va sotto zero. Da li' in poi il
-- carico della produzione nuova PRIMA riempie il buco e solo dopo diventa
-- disponibile, quindi lo scaffale ha merce che il sistema non conta. Oggi i buchi
-- aperti sono quattro, i due grossi sui Tagliolini -18: -140 e -60 pezzi.
--
-- Il negativo in se' non si vieta: serve, perche' permette di far partire la
-- merce quando il carico non e' ancora stato registrato. Quello che mancava e'
-- che qualcuno lo sapesse. L'avviso della piattaforma gira gia' ogni due ore e
-- ha gia' i suoi destinatari: qui si aggiunge una riga.
CREATE OR REPLACE FUNCTION avviso_da_mandare() RETURNS text
LANGUAGE plpgsql
AS $$
declare righe text := ''; r record; s record; n_neg int; tot_neg numeric;
begin
  for r in select nome, stato from piattaforma_silenzi
           where stato in ('mai partita','ferma da troppo','ultimo giro fallito') and critico order by nome loop
    righe := righe || '• ' || r.nome || ': ' || r.stato || E'\n';
  end loop;
  for r in select tipo, count(*) c from cf_anomalie where gravita = 'alta' group by tipo order by 2 desc loop
    righe := righe || '• ' || r.c || ' ' || replace(r.tipo, '_', ' ') || E'\n';
  end loop;

  -- GIACENZE SOTTO ZERO: merce uscita che non era mai stata caricata.
  select count(*), coalesce(sum(-quantita_caricata), 0)
    into n_neg, tot_neg
    from lotti
   where coalesce(archiviato, false) = false and quantita_caricata < 0;
  if n_neg > 0 then
    righe := righe || '• ' || n_neg || ' lotti in negativo, ' || round(tot_neg) ||
             ' pezzi usciti senza carico: il magazzino conta meno dello scaffale' || E'\n';
  end if;

  select * into s from segnalazioni_aperte();
  if s.n_aperte > 0 then
    righe := righe || '• ' || s.n_aperte || ' segnalazioni aperte'
             || case when s.n_azione > 0 then ' (' || s.n_azione || ' con AGISCI)' else '' end || E'\n';
  end if;
  if righe = '' then return null; end if;
  return 'Pasta Nostra · controllo piattaforma' || E'\n\n' || righe ||
         E'\nDettaglio nel cashflow, scheda Controlli.';
end
$$;

-- L'elenco dei buchi aperti, per chi li deve chiudere con la produzione.
CREATE OR REPLACE VIEW v_giacenze_negative AS
SELECT l.codice_lotto,
       p.descrizione_prodotto,
       l.quantita_caricata AS giacenza,
       -l.quantita_caricata AS pezzi_da_recuperare,
       l.scadenza
  FROM lotti l
  LEFT JOIN prodotti p ON p.id_prodotto::text = l.id_prodotto::text
 WHERE coalesce(l.archiviato, false) = false AND l.quantita_caricata < 0
 ORDER BY l.quantita_caricata;

GRANT SELECT ON v_giacenze_negative TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
