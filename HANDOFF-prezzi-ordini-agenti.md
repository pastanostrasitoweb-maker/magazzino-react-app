# I prezzi degli ordini agenti arrivano giusti, ma vengono sovrascritti

**Segnalato da Luca il 05/08/2026 sull'ordine di Villa Beccaris.**

## Cosa è successo

| | app agenti | magazzino |
|---|---:|---:|
| Totale imponibile | **206,03 €** | **346,83 €** |

Riga per riga (`ORD-AG-1785871524126` → `ORD-1785927821075`):

| Articolo | app: prezzo × qtà | magazzino |
|---|---|---|
| Tonnarello all'uovo 125g | 1,99 × 12 pz = 23,88 | 34,08 × 1 = **34,08** |
| Panino monoporzione | 1,40 × 16 pz = 22,40 | 21,00 × 1 = 21,00 |
| Frollamore vaniglia | 0,80 × 30 pz = 24,00 | 57,00 × 1 = **57,00** |
| Palatini (×3 gusti) | 0,80 × 30 pz = 24,00 | 57,00 × 1 = **57,00** |

Su tutte le righe `righe_ordine.prezzo_origine = 'listino_1'`.

## Il motivo

L'import **scarta il prezzo che arriva dall'ordine agente e riapplica il listino 1**, che è al **cartone**, mentre l'app ragiona al **pezzo**. Le due cose non sono confrontabili: 30 pezzi a 0,80 € non sono 1 cartone a 57,00 €.

Il prezzo dell'app non è un prezzo qualsiasi: è il listino del canale meno lo sconto del livello cliente, più gli sconti che l'agente ha applicato al checkout (3% ho.re.ca., 6% doppio ordine GDO, 5% promo punto vendita, e il 5% personale di Giusy). Sovrascriverlo vuol dire mandare al cliente un prezzo diverso da quello concordato.

## Cosa manda l'app adesso, per riga

Dal 05/08 ogni riga porta le tre cose **separate**, come chiesto da Luca:

| campo | significato |
|---|---|
| `prezzo_listino` | prezzo pieno di listino del canale, **al pezzo** |
| `sconto_pct` | sconto complessivo applicato, in percentuale (100 = OMAGGIO) |
| `prezzo_netto` | prezzo effettivo al pezzo, cioè quello che paga il cliente |
| `prezzo_unitario` | uguale a `prezzo_netto`, resta per compatibilità |
| `iva_pct` | aliquota dell'articolo (4 o 10) |
| `unita_prezzo` | `'pezzo'` — sempre, per non confondersi col cartone |
| `pezzi_collo` | quanti pezzi ci sono in un cartone |
| `quantita_ordinata` | **pezzi**, non cartoni |
| `colli` | cartoni |

## Cosa serve dal magazzino

Quando l'ordine arriva da `ordini_agenti`, i prezzi devono venire **da lì**, non dal listino:

- `righe_ordine.prezzo_unitario` ← `prezzo_netto` (oppure `prezzo_listino` con `sconto_pct` valorizzato, se si preferisce tenere lo sconto visibile)
- `righe_ordine.sconto_pct` ← `sconto_pct`
- `righe_ordine.iva_pct` ← `iva_pct`
- `righe_ordine.prezzo_origine` ← `'app'` invece di `'listino_1'`
- la quantità va letta in **pezzi** (`quantita_ordinata`), con `pezzi_collo` per ricavare i cartoni

Il listino 1 resta il ripiego giusto per gli ordini che **non** arrivano dall'app (telefono, mail): lì un prezzo non c'è e va preso da qualche parte.

## Come verificare che sia a posto

Sull'ordine `ORD-1785927821075` il totale imponibile deve diventare **206,03 €**, e `prezzo_origine` deve dire `app` su tutte le righe.
