# Motore tariffe: questa è una copia, non l'originale

I file in questa cartella (`preventivo.js`, `frozen.js`, `data/*`) sono una **copia generata**
dall'app logistica. Il file buono sta in `~/Desktop/app-logistica/src/`.

**Non modificarli qui.** Una modifica fatta solo da un lato fa dire ai due applicativi due
prezzi diversi sullo stesso ordine, e nessuno dei due segnala niente.

## Cos'è successo il 03/08/2026

Un ordine di **Gentlemen S.r.l.** (Castelli Romani, CAP 00040, frozen a collo, 9,6 kg) mostrava
solo due opzioni: BRT Fresh 25,18 € e Stef 27,00 €. **Bio Tuscia / Tacos non compariva**, e
l'operatore ha dovuto scriverlo a mano nel campo "un altro corriere".

Era la scelta migliore: Bio Tuscia passa **tutti i giorni** su Roma e Castelli, consegna in
**1 giorno** e costava **24,50 €**, cioè meno di entrambe le opzioni proposte.

La causa: in questa copia Bio Tuscia era dichiarata solo `['fresh']`, quindi sul **frozen**
veniva scartata prima ancora del confronto prezzi. La regola vera è che il surgelato viaggia
col fresco dentro il poly box col ghiaccio secco, quindi vale per tutti i refrigerati.

Insieme a quello mancavano anche: il conteggio dei **poly box a scatola** (prima ne contava
sempre una sola, sottostimando i frozen pesanti), la **regola dei 3 giorni** sul frozen, e il
divieto di attribuire a un corriere il prezzo di un altro.

## Come si aggiorna

Dall'app logistica:

```
cd ~/Desktop/app-logistica
npm run sync      # copia i file qui e sistema i percorsi degli import
```

Poi ricostruire e pubblicare l'app magazzino, altrimenti l'operatore continua a vedere la
versione vecchia.

Il controllo è automatico: `npm run build` sull'app logistica **si ferma** se le due copie sono
diverse, così non può più succedere che una resti indietro senza che nessuno se ne accorga.

## La regola che conta

Le logistiche disponibili **devono vedersi tutte**. Se un corriere non compare, o l'operatore
sceglie più caro, o scrive a mano: in entrambi i casi il costo vero non lo sa più nessuno.
