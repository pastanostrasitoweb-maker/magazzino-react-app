# Come non fermare l'azienda

Il 07/08/2026 una mia modifica ha bloccato per due ore la creazione, la
preparazione, la spedizione e l'archiviazione degli ordini. Due errori:

1. riscrivendo un trigger ho perso il `SECURITY DEFINER`, e il trigger leggeva
   `cf_partite` che l'utente dell'app non puo' leggere
2. un record letto in un solo ramo e citato sempre nell'INSERT
   (`record "c" is not assigned yet`)

Da amministratore funzionava tutto: **i permessi sono diversi e il ramo critico
non passava**. Le SELECT non vedono nessuno dei due problemi.

## Le tre barriere, in ordine di importanza

### 1. Quello che e' accessorio non blocca quello che e' essenziale

Il difetto vero non erano i bachi, era che **un errore nel calcolo di una
scadenza fermava una spedizione**. Sugli ordini ci sono trigger che calcolano
cose accessorie (la scadenza per il Cashflow, il metodo di pagamento dedotto
dalla storia): nessuna serve a spedire la merce.

Ora il corpo di quei trigger sta dentro un gestore di eccezioni: se sbaglia,
l'errore va in `log_trigger_errori` e **l'ordine passa comunque**. Il costo di un
baco futuro e' una scadenza mancante, che si vede e si rifa', invece dell'azienda
ferma.

Le scadenze non scritte non si perdono: restano elencate in
`v_scadenze_da_rifare`, con l'ultimo errore accanto.

Verificato rompendo di proposito il calcolo dentro una transazione annullata:
l'ordine si archivia, l'errore si registra, la scadenza risulta da rifare.

**Regola: un trigger su `ordini` che calcola qualcosa di accessorio deve avere il
suo `EXCEPTION WHEN OTHERS`. Senza, non si pubblica.**

### 2. Provare a SCRIVERE, con la chiave dell'app

```bash
bash scripts/controllo-scritture.sh
```

Gira creare/preparare/spedire con la chiave anon, cioe' con gli stessi permessi
del magazzino: e' l'unico modo di vedere un `SECURITY DEFINER` perso. Cancella la
prova prima di archiviare (cosi' non consuma un numero DDT) e prova
l'archiviazione da amministratore in una transazione annullata.

Verificato che sappia anche **fallire**: su una scrittura rifiutata dice NON
PUBBLICARE. Un controllo che passa sempre non serve a niente.

### 3. Il file SQL e il database devono dire la stessa cosa

Dopo il guasto avevo corretto solo il database: il file `sql/` conteneva ancora la
versione col baco, pronta a rimetterlo in produzione al primo che la rilancia.

**Regola: la correzione si scrive nel file del repo, poi si applica. Mai il
contrario.**

## Il promemoria in cinque righe

- il pezzo accessorio ha il suo `EXCEPTION`, altrimenti ferma tutto
- si prova a scrivere, non solo a leggere, e con la chiave dell'app
- la correzione sta nel file, non solo nel database
- se la prova consuma un numero DDT, va restituito e verificato con
  `prossimo_numero_ddt()`
- le modifiche al database si fanno **fuori** dall'orario in cui il magazzino
  spedisce, quando si puo' scegliere
