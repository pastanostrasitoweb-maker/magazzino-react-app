# Consegna lavoro: VALORIZZARE GLI ORDINI

Scritto dalla sessione che segue l'**app agenti**, il 2026-08-01, per la sessione che segue l'**app magazzino**.
Il lavoro è tuo: qui trovi la richiesta, la ricognizione già fatta, e **cosa è già a terra sul database condiviso** (importante: non rifarlo).

---

## 1. Cosa ha chiesto Luca

Valorizzare gli ordini nell'app magazzino, da tre fonti diverse:

1. **Ordini dalle app agenti** → agganciare direttamente listino e prezzi che l'agente ha già mandato con l'ordine.
2. **Ordini caricati in sede** → importare da TeamSystem i **listini 1 e 8** con i relativi sconti (listino e sconto stanno nell'anagrafica di ogni cliente):
   - listino **1** = clienti retail, listino **8** = Ho.re.ca.
   - all'inserimento dell'ordine, poter agganciare il listino + sconto del cliente;
   - per un cliente nuovo, agganciare il listino **in automatico dal tipo cliente** (Horeca o Farma), sempre modificabile dopo;
   - **sempre** possibilità di modificare listino e prezzi a mano.
3. **Clienti con listino dedicato** (es. **La Bottega Gluten Free Sagl**, ma non solo) → importare i **prezzi storici realmente praticati a quel cliente**, articolo per articolo, così chi carica l'ordine non sbaglia i prezzi.

---

## 2. GIÀ FATTO (non rifare)

### 2.1 Schema database — migrazione APPLICATA in produzione

File sorgente: `~/Desktop/magazzino-supabase/15_valorizzazione_ordini.sql`
Applicata al progetto `wwjgjiybyrrkafymiuew` come migrazione `20260801180000_valorizzazione_ordini`. Verificata live.

**Colonne aggiunte:**

| tabella | colonne |
|---|---|
| `righe_ordine` | `prezzo_unitario numeric(12,4)`, `sconto_pct numeric(5,2) default 0`, `prezzo_origine text` |
| `ordini` | `listino text`, `sconto_cliente_pct numeric(5,2)`, `totale_imponibile numeric(12,2)` |

`prezzo_origine` distingue da dove viene il numero: `app` · `listino1` · `listino8` · `dedicato` · `storico` · `manuale`.

**Tabelle nuove** (RLS attiva, policy di sola lettura per anon):

- `listini_gestionale` (`codice_articolo`, `listino`) → `descrizione, um, prezzo, sconto_pct, iva, fonte, aggiornato_il`
- `clienti_listino` (`id_cliente` = codice gestionale) → `listino, sconto_pct, fonte, aggiornato_il`
- `prezzi_cliente_storico` (`id_cliente`, `codice_articolo`, `data_doc`, `documento`) → `prezzo_unitario, sconto_pct, um, fonte`

> **Attenzione all'unità.** In `listini_gestionale` il prezzo è per **CARTONE** (`um = 'CT'`), perché è così che GAMMA espone il listino ed è così che il magazzino conta le quantità (`qtyOrdered` = cartoni). Non confonderlo col prezzo al pezzo dell'app agenti.

### 2.2 Dati già caricati

| tabella | contenuto | fonte | affidabilità |
|---|---|---|---|
| `listini_gestionale` | **521 articoli, listino 1** | TeamSystem WS 1001, campo `M-PREZZO(1)` | `fonte='gamma'` → fidato |
| `listini_gestionale` | **56 articoli, listino 8** | catalogo HO.RE.CA dell'app agenti, convertito ×pezzi_collo | `fonte='catalogo-app'` → **DA CONFERMARE** |
| `clienti_listino` | **1599 clienti** con il loro listino | TeamSystem WS 1000, campo `CF-PRLIST` | fidato, **sconto = null** |

Distribuzione reale dei listini: **1** → 1424 clienti · **8** → 152 · **2** → 20 · **4** → 2 · **3** → 1 · nessun listino → 442.
I listini 2/3/4 sono i **clienti con listino dedicato** di cui parla Luca.

### 2.3 Codice applicativo

**Nessuna modifica fatta.** Il repo magazzino è pulito al commit `9c76ee4`. La valorizzazione lato codice è tutta da scrivere ed è tua.

---

## 3. Ricognizione TeamSystem (fatta dal vivo, risparmia il lavoro)

Endpoint, auth e regole: vedi la memoria `reference-teamsystem-api-bibbia`. Ditta = 2. Il secret PGAUTH **non va mai su file**.

### Cosa il gestionale DÀ

- **WS 1000/1** (anagrafica CLIFOR, 2558 record, 2041 clienti): contiene **`CF-PRLIST`** = listino del cliente. La bibbia diceva di no: è stata aggiornata, adesso c'è.
- **WS 1001/1** (anagrafica articoli, 521 record): `M-CODMAG`, `M-DESCRIZIONE`, `M-UM`, `M-ALIVA`, **`M-PREZZO(1)`**, `M-SCONTO1(1)`, `M-COSTOULA`.
  Verificato contro il nostro catalogo: Tonnarello 45,28 €/CT ÷ 8 pz = 5,66 €/pz ✅, Basi Pizza 36,45 ÷ 9 = 4,05 ✅. **L'indice (1) è il listino 1.**

### Cosa il gestionale NON DÀ (servono modifiche in CONFWS, le chiede Luca)

1. **Prezzi del listino 8.** Il WS 1001 espone solo l'indice `(1)`. Ho provato a chiedere `M-PREZZO(8)` nella `TabellaCampi`: **il WS ignora i campi richiesti** e torna sempre lo stesso set fisso (stesso difetto noto del WS 147).
2. **Sconto del cliente.** Non è esposto da nessun WS trovato: nel 1000 ci sono `CF-PRLIST`, `CF-TIPOIVA`, `CFCODPAG`, ma **nessun campo sconto**.
3. **Storico prezzi per cliente/articolo.** Il **WS 159** ha le righe dei documenti di vendita (`B-CODMAG4`, `B-QUANTITA`, `B-COLLI`, `B-UM`) ma **senza prezzi**. Senza questo, lo storico della Bottega non si può importare.

Sondati anche 1002-1030: 1002 = giacenze, 1009 = condizioni di acquisto fornitore, gli altri vuoti o in errore.

**Da chiedere a Luca (lui apre CONFWS e passa CodiceWS + Schema):**
- estendere il WS articoli con `M-PREZZO(8)` e `M-SCONTO1(8)` (o un WS listini che torni tutti gli indici);
- esporre lo **sconto cliente** nell'anagrafica;
- un WS **righe documenti di vendita CON prezzo e sconto** (per lo storico prezzi per cliente).

---

## 4. Cosa resta da costruire (tuo)

### A. Ordini dalle app agenti → valorizzati automaticamente (sbloccato, alto valore)
In `src/supabase-adapter.js`, dentro `spostaOrdineInOrdini()`: le righe del ponte `ordini_agenti.righe` hanno **già** `prezzo_unitario` e `sconto_pct` (prezzo al **pezzo**), oltre a `colli` e `quantita_ordinata`. Oggi l'import li butta via: costruisce solo `productName` e `qtyOrdered`.
Da fare: portarli in `righe_ordine.prezzo_unitario` / `sconto_pct` con `prezzo_origine='app'`, calcolare `ordini.totale_imponibile`, e valorizzare anche gli ordini già importati (backfill dal ponte).
⚠️ Attenzione all'unità: l'app manda il prezzo **al pezzo** e `qtyOrdered` è in **cartoni**. O converti il prezzo a cartone, o tieni la quantità in pezzi. Decidi e scrivilo, perché è la trappola numero uno (c'è già stato il bug "1 crt → 8 crt" il 2026-07-17).

### B. Ordini caricati in sede (sbloccato per il listino 1)
- Al momento di scegliere il cliente, leggere `clienti_listino` → proporre il suo listino.
- Cliente nuovo senza riga in `clienti_listino`: proporre **1 se Farma/retail, 8 se Horeca**, modificabile.
- Prezzi riga da `listini_gestionale` (`codice_articolo` = `M-CODMAG` = il codice prodotto del magazzino), con `prezzo_origine='listino1'|'listino8'`.
- **Sempre** campo prezzo e sconto editabili a mano → `prezzo_origine='manuale'`.
- Lo sconto cliente oggi è `null`: lo mette a mano chi carica, finché CONFWS non lo espone.

### C. Clienti con listino dedicato (bloccato sui dati)
Struttura pronta (`prezzi_cliente_storico`): quando arriva il WS con i prezzi delle righe, si popola e l'app propone **l'ultimo prezzo praticato a quel cliente su quell'articolo**, con `prezzo_origine='storico'`.
Nel frattempo si può popolare a mano per **La Bottega Gluten Free Sagl** se Luca fornisce i prezzi (o li si estrae dalle fatture).

---

## 5. Note di contesto utili

- La Bottega Gluten Free Sagl è a **Lugano (CH)**, canale `export`, quindi fuori dai listini 1/8: è proprio uno dei casi "listino dedicato".
- Il campo `id_cliente` degli ordini magazzino corrisponde al codice gestionale (`CFCOD` / `B-CODCLI`), stesso join usato da `clienti_scaduto` e `vendite_gestionale`.
- Su questo repo lavora anche un'altra sessione (file `sql/sicurezza_*.sql` non tracciati): allinea il repo prima di editare.
