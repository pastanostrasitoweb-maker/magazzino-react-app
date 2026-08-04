// COPIA GENERATA — non modificare qui.
// Il file buono sta in app-logistica; questa copia si aggiorna con
//   node scripts/sync-motore.mjs --scrivi
// Modificarlo a mano fa tornare i due applicativi a dire prezzi diversi.

// MOTORE PREVENTIVO — il cuore dell'app logistica.
//
// Dato un ordine (peso, CAP destinazione, temperatura, modo frozen), calcola:
//   - il corriere CONSIGLIATO (piu economico ammesso per quella temperatura)
//   - le ALTERNATIVE ordinate, ciascuna con costo scomposto e giorni consegna
//
// Cosi sul magazzino si sceglie in modo consapevole: "questo costa X in piu
// ma consegna il giorno dopo". Regola di segmentazione confermata Luca 2026-07-22.

import { corrieriPerTemperatura } from './data/corrieri.js'
import { COSTI_FROZEN, costoConsegna } from './data/pto.js'
import { corriereAmmetteFrozen, frozenAmmesso } from './frozen.js'

// Classi di temperatura gestite dall'ordine.
export const TEMPERATURE = [
  { id: 'secco', label: 'Secco / ambient', ico: '📦' },
  { id: 'fresh', label: 'Fresh / refrigerato', ico: '❄️' },
  { id: 'frozen', label: 'Frozen a collo (poly box)', ico: '🧊' },
  { id: 'frozen-pedana', label: 'Frozen a pedana', ico: '🚛' }
]

export function temperaturaLabel(id) {
  return TEMPERATURE.find((t) => t.id === id)?.label || id
}

// Componente imballo frozen a collo: poly box + ghiaccio secco, PER SCATOLA.
export function costoImballoFrozen(nBox = 1) {
  return round2((COSTI_FROZEN.polyBox + COSTI_FROZEN.ghiaccioSecco) * Math.max(1, nBox))
}

// Quante scatole servono. Se l'agente le ha dichiarate vale quel numero,
// altrimenti si stima dal peso: l'imballo si paga a scatola, e dare per scontata
// una sola scatola su un ordine da 40 kg sottostima il costo di due terzi.
export function numeroBoxFrozen(peso, boxDichiarati) {
  const dich = Number(boxDichiarati) || 0
  if (dich > 0) return { n: dich, stimato: false }
  const kg = Number(peso) || 0
  const n = Math.max(1, Math.ceil(kg / COSTI_FROZEN.capacitaBoxKg))
  return { n, stimato: true }
}

// ---------- Previsionale di arrivo ----------
// Regola (Luca 2026-07-22): dall'ingresso ordine, se la merce è in magazzino
// viene preparato il GIORNO DOPO. Poi il corriere ritira. Poste Fresh ritira
// SOLO il martedì; tutti gli altri ritirano tutti i giorni. Consegna = ritiro
// + giorni di transito del corriere (salta la domenica).
const RITIRO_SOLO_MARTEDI = new Set(['poste-fresh'])
const GG = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab']

function addGiorni(d, n) {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}
function isoData(d) {
  // componenti locali: toISOString() convertirebbe in UTC sfasando di un giorno
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function previsioneConsegna(dataOrdineISO, corriereId, giorniTransito) {
  if (!dataOrdineISO) return null
  const base = new Date(dataOrdineISO + 'T00:00:00')
  if (isNaN(base)) return null
  const pronto = addGiorni(base, 1) // preparato il giorno dopo l'ingresso
  let ritiro = new Date(pronto)
  if (RITIRO_SOLO_MARTEDI.has(corriereId)) {
    while (ritiro.getDay() !== 2) ritiro = addGiorni(ritiro, 1) // avanza al martedì
  }
  let consegna = new Date(ritiro)
  let g = Math.max(1, giorniTransito || 1)
  while (g > 0) {
    consegna = addGiorni(consegna, 1)
    if (consegna.getDay() !== 0) g -= 1 // niente consegne di domenica
  }
  const attesaRitiro = Math.round((ritiro - pronto) / 86400000)
  return {
    pronto: isoData(pronto),
    ritiro: isoData(ritiro),
    consegna: isoData(consegna),
    giornoConsegna: GG[consegna.getDay()],
    attesaRitiro // giorni di attesa extra per il calendario ritiri (Poste)
  }
}

// Calcola tutte le opzioni per un ordine. Ritorna:
// { consigliato, alternative, temperatura, imballo } oppure { errore }.
export function calcolaPreventivo({ peso, cap, temperatura, box }) {
  const kg = Number(peso) || 0
  if (!cap) return { errore: 'CAP destinazione mancante' }
  if (kg <= 0) return { errore: 'Peso ordine mancante' }

  const ammessi = corrieriPerTemperatura(temperatura)
  if (!ammessi.length) return { errore: `Nessun corriere per "${temperatura}"` }

  const isFrozenCollo = temperatura === 'frozen'
  const box_ = isFrozenCollo ? numeroBoxFrozen(kg, box) : null
  const imballo = isFrozenCollo
    ? {
        polyBox: COSTI_FROZEN.polyBox,
        ghiaccio: COSTI_FROZEN.ghiaccioSecco,
        nBox: box_.n,
        stimato: box_.stimato,
        totale: costoImballoFrozen(box_.n)
      }
    : null

  // REGOLA FROZEN PER ZONA: servono >=2 giorni di consegna tra mer e sab,
  // altrimenti il ghiaccio secco non regge (vedi lib/frozen.js).
  if (isFrozenCollo) {
    const verdetto = frozenAmmesso(cap)
    if (!verdetto.ammesso) return { errore: verdetto.motivo, frozenBloccato: true, verdetto }
  }

  const opzioni = []
  for (const c of ammessi) {
    // sul frozen restano solo i corrieri che rispettano la regola di zona
    if (isFrozenCollo && !corriereAmmetteFrozen(c.id, cap)) continue
    const cons = costoConsegna(c.id, cap, kg)
    if (!cons) continue // corriere senza listino per quella zona
    const componenti = {
      consegna: cons.prezzo,
      imballo: imballo ? imballo.totale : 0
    }
    const totale = componenti.consegna + componenti.imballo
    opzioni.push({
      corriereId: c.id,
      corriere: c.nome,
      totale: round2(totale),
      componenti: { consegna: round2(componenti.consegna), imballo: round2(componenti.imballo) },
      giorni: cons.giorni,
      zona: cons.zona,
      scaglione: cons.scaglione.label
    })
  }

  if (!opzioni.length) return { errore: 'Nessun listino disponibile per questa destinazione' }

  // Ordine: prima il piu economico. A parita, il piu veloce.
  opzioni.sort((a, b) => a.totale - b.totale || a.giorni - b.giorni)

  return {
    temperatura,
    imballo,
    consigliato: opzioni[0],
    alternative: opzioni.slice(1)
  }
}

// Costo di una spedizione gia assegnata (per il consuntivo), dato il corriere scelto.
// Costo di una spedizione già assegnata, dato il corriere realmente usato.
// Se quel corriere non ha listino per quel CAP NON si inventa un prezzo preso
// da un altro: si dichiara. Su un centro di costo un prezzo attribuito al
// vettore sbagliato falsa il confronto con la fattura, che è il motivo per cui
// esiste tutto il resto.
export function costoSpedizione({ corriereId, peso, cap, temperatura, box }) {
  const p = calcolaPreventivo({ peso, cap, temperatura, box })
  if (p.errore) return null
  const tutte = [p.consigliato, ...p.alternative]
  const esatto = tutte.find((o) => o.corriereId === corriereId)
  if (esatto) return esatto
  return p.consigliato ? { ...p.consigliato, fallback: true, corriereRichiesto: corriereId } : null
}

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100
}
