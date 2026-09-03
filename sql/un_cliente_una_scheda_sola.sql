-- UN CLIENTE, UNA SCHEDA SOLA.
--
-- 03/09/2026, Delizie del palato. Elisabetta apre la scheda, aggiunge la partita
-- IVA e corregge il CAP (era finito "35" nel CAP: il civico di "Via lungomare
-- Colombo 35"). Salva. Il magazzino continua a mostrare CAP 35 e a preventivare
-- il corriere su un CAP che non esiste.
--
-- Il motivo: la chiave della scheda veniva RICALCOLATA dai campi al salvataggio.
-- Un cliente agganciato per nome che riceve la partita IVA cambia chiave, e il
-- salvataggio finisce su una riga nuova. Da quel momento le ragazze scrivono su
-- una scheda e l'app ne legge un'altra: e' la "scrittura che non funziona" di
-- cui Luca parlava da giorni.
--
-- L'app ora salva sulla chiave della scheda che ha aperto. Qui si chiude la
-- porta anche per chiunque altro scriva su questa tabella: due schede con lo
-- stesso codice cliente non si possono piu' fare.

-- Il vincolo si crea VALIDO: se ci fossero doppioni residui deve fallire adesso,
-- rumorosamente, non restare una mina che blocca le modifiche di domani.
create unique index if not exists clienti_override_un_codice_una_scheda
  on clienti_override (codice_cliente)
  where coalesce(codice_cliente, '') <> '';

comment on index clienti_override_un_codice_una_scheda is
  'Un cliente ha una scheda sola. Le schede senza codice restano fuori: sono quelle non ancora agganciate a un cliente del registro.';
