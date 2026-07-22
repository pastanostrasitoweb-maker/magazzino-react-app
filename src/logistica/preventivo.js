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

// Componente imballo frozen a collo: poly box + ghiaccio secco.
export function costoImballoFrozen() {
  return COSTI_FROZEN.polyBox + COSTI_FROZEN.ghiaccioSecco
}

// Calcola tutte le opzioni per un ordine. Ritorna:
// { consigliato, alternative, temperatura, imballo } oppure { errore }.
export function calcolaPreventivo({ peso, cap, temperatura }) {
  const kg = Number(peso) || 0
  if (!cap) return { errore: 'CAP destinazione mancante' }
  if (kg <= 0) return { errore: 'Peso ordine mancante' }

  const ammessi = corrieriPerTemperatura(temperatura)
  if (!ammessi.length) return { errore: `Nessun corriere per "${temperatura}"` }

  const isFrozenCollo = temperatura === 'frozen'
  const imballo = isFrozenCollo
    ? { polyBox: COSTI_FROZEN.polyBox, ghiaccio: COSTI_FROZEN.ghiaccioSecco, totale: costoImballoFrozen() }
    : null

  const opzioni = []
  for (const c of ammessi) {
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
export function costoSpedizione({ corriereId, peso, cap, temperatura }) {
  const p = calcolaPreventivo({ peso, cap, temperatura })
  if (p.errore) return null
  const tutte = [p.consigliato, ...p.alternative]
  return tutte.find((o) => o.corriereId === corriereId) || p.consigliato
}

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100
}
