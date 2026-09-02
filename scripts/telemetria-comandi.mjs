// I COMANDI CHE CONTANO DEVONO ESSERE DICHIARATI.
//
// Dal 02/09/2026 la telemetria registra solo i comandi che portano
// `data-telemetria`: e' cio' che le impedisce di spedire nomi clienti e
// importi. Il rovescio e' che un comando non annotato diventa invisibile, e
// quando spariscono proprio anagrafica e pagamenti il consulente migliorie
// lavora al buio senza che nessuno se ne accorga.
//
// Questo controllo elenca i comandi che devono restare tracciati. Se qualcuno
// ne toglie l'annotazione, qui si vede. Girare con: node scripts/telemetria-comandi.mjs
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8')

const ATTESI = [
  'pagamento-scegli',        // il bottone rosso del metodo di pagamento
  'anagrafica-crea',         // scheda cliente: creazione
  'anagrafica-salva',        // scheda cliente: salvataggio
  'anagrafica-sede-salva',   // sede di consegna dentro la scheda
  'anagrafica-apri',         // apertura scheda dall'ordine
  'anagrafica-completa',     // apertura quando mancano dati
  'abbuono-apri',
  'bollinato-aggiungi',
  'ordine-pronto',
  'dati-aggiorna'
]

let mancanti = 0
for (const nome of ATTESI) {
  const c = src.includes(`data-telemetria="${nome}"`) || src.includes(`? "${nome}"`) || src.includes(`: "${nome}"`)
  if (!c) { mancanti++; console.log(`MANCA  ${nome}`) } else { console.log(`ok     ${nome}`) }
}

// E il contrario: nessun evento deve nascere dal testo a schermo.
const telemetria = readFileSync(new URL('../lib/telemetria.js', import.meta.url), 'utf8')
const legge = /textContent|aria-label|\.title\b/.test(telemetria.split('function etichetta')[1]?.split('\n}')[0] || '')
if (legge) { mancanti++; console.log('MANCA  etichetta() non deve leggere il testo dello schermo') }
else console.log('ok     etichetta() non legge il testo dello schermo')

console.log(mancanti ? `\n${mancanti} problemi` : '\nTutti i comandi che contano sono dichiarati')
process.exit(mancanti ? 1 : 0)
