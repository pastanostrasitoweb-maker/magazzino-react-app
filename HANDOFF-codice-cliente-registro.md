# Consegna lavoro: CODICE CLIENTE UNICO SU OGNI ORDINE

Scritto dalla sessione che segue **CRM / app agenti**, il 2026-08-01, per la sessione che segue l'**app magazzino**.
NON ho toccato il vostro codice (questo file è untracked, committatelo voi se vi serve). Qui: la richiesta, cosa è GIÀ a terra sul DB condiviso, e cosa resta da fare lato codice magazzino.

---

## 1. Cosa ha chiesto Luca

Ogni ordine deve portare un **codice cliente** — non si perde nulla. Problema emerso nel CRM: nel magazzino **151 ordini su 273 hanno `id_cliente` nullo** (salvati solo per NOME), e i nomi tra app sono troppo inconsistenti per matcharli (es. "La Bottega del Celiaco di Gianluca Grappone" vs "Gianluca Grappone (La Bottega Del Celiaco)"). Risultato: nel CRM quei clienti risultano "senza ultimo ordine" anche se hanno ordinato.

Regola ferma di Luca: **dal 03.08 il magazzino è il riferimento delle vendite** (tutto ciò che l'azienda vende passa da lì) e **ogni ordine deve avere il codice cliente**.

Buona notizia: il vostro selettore ordine GIÀ salva `id_cliente = 'CLI-<codice>'` quando si sceglie un cliente da `clienti_gestionale` (vedi `supabase-adapter.js` ~riga 299). Manca solo: (a) includere i clienti creati da NOI (non ancora a gestionale), (b) creare al volo un cliente con codice quando non è in elenco, (c) impedire ordini senza cliente selezionato.

---

## 2. GIÀ FATTO (non rifare) — DB condiviso `wwjgjiybyrrkafymiuew`

### 2.1 Registro clienti unico: tabella `clienti_master`

Spina dorsale dei codici. Una riga per cliente. **2195 clienti** già dentro (2041 dal gestionale + 154 creati da noi via CRM). Leggibile e scrivibile dall'anon key (policy `clienti_master_read` select + `clienti_master_insert`).

| colonna | note |
|---|---|
| `codice` (PK) | id universale: `CLI-<B-CODCLI>` per i clienti a gestionale, `PN-000042` per quelli creati da noi |
| `codice_gestionale` | B-CODCLI, nullable (si valorizza quando il cliente viene registrato a gestionale) |
| `ragione_sociale`, `citta`, `provincia`, `piva`, `telefono`, `email` | anagrafica |
| `origine` | `gestionale` \| `agenti` \| `magazzino` |
| `creato_il` | timestamptz |

`clienti_master` è un **SUPERSET** di `clienti_gestionale`: contiene gli stessi clienti gestionale (codice `CLI-<code>`, con `codice_gestionale` valorizzato) PIÙ i clienti creati da noi (codice `PN-xxxxxx`). Quindi potete sostituire la fonte del selettore.

### 2.2 Funzione per creare un cliente al volo (con codice PN)

```
select nuovo_cliente_registro(
  p_ragione_sociale := 'Nuovo Cliente Srl',
  p_citta := 'Roma', p_provincia := 'RM',
  p_piva := '...', p_telefono := '...', p_email := '...',
  p_origine := 'magazzino'
);   -- ritorna es. 'PN-000001'
```

RPC `security definer`, eseguibile dall'anon key: assegna il prossimo `PN-xxxxxx` (sequenza `clienti_master_pn_seq`), inserisce la riga e **restituisce il codice**. Testata: ritorna `PN-000001`.

### 2.3 Codice applicativo magazzino

**Nessuna modifica fatta da me.** È vostro.

---

## 3. DA FARE lato codice magazzino (vostro)

1. **Fonte del selettore ordine → `clienti_master`** (al posto di, o in aggiunta a, `clienti_gestionale` in `supabase-adapter.js`). Mappate `ID_Cliente = codice` (già `CLI-<code>` o `PN-<n>`), `Codice_Cliente_TS = codice_gestionale`. Così i clienti creati da noi (PN) compaiono nel selettore e ogni scelta porta un codice. Dedup: `clienti_master` è già deduplicato, potete togliere il merge con clienti_gestionale.

2. **Creazione cliente al volo**: se durante l'inserimento ordine il cliente non è in elenco, chiamate la RPC `nuovo_cliente_registro(...)`, prendete il `PN-xxxxxx` restituito e usatelo come `id_cliente` dell'ordine. Il cliente entra nel registro e sarà agganciabile ovunque.

3. **Vincolo**: un ordine NON si salva senza cliente selezionato (niente più `cliente` a testo libero con `id_cliente` nullo). `id_cliente` = sempre il `codice` del registro.

4. (Opzionale) **Bonifica dei 151 ordini name-only esistenti**: NON fate match automatico sui nomi (troppi falsi: "Farmacia Scoppito" vs "Farmacia Sciacca"). Se serve, lista a Luca per conferma manuale. 2 già agganciati a mano dal CRM (Grappone, Drago).

---

## 4. Perché conta (lato CRM/agenti)

Il CRM (`crm_v_clienti`) calcola la data ultimo ordine con `max(ordini.data_ordine)` per `id_cliente`. Appena il magazzino scrive **sempre** il codice, i clienti "NEW/senza data" si popolano da soli, senza altri interventi. Fonte unica di verità sulle vendite = magazzino, come vuole Luca.
