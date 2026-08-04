// COPIA GENERATA — non modificare qui.
// Il file buono sta in app-logistica; questa copia si aggiorna con
//   node scripts/sync-motore.mjs --scrivi
// Modificarlo a mano fa tornare i due applicativi a dire prezzi diversi.

// Listino PTO DEMO (Prezzi/Tempi Consegna) per corriere.
//
// STRUTTURA REALE: l'Excel di Luca arriva a grana CAP x corriere x scaglione
// peso. Qui la modelliamo come `tariffe[corriereId][zona][scaglione]` dove la
// zona si ricava dal CAP (funzione `zonaDaCap`). Sostituire questo file con
// l'import dell'Excel non tocca il motore preventivo: cambia solo la fonte dati.
//
// I numeri qui sotto sono PLACEHOLDER realistici per far girare la demo.
// NON sono le tariffe reali: verranno rimpiazzate dagli accordi quadro.

import { costoBiotuscia } from './biotuscia.js'
import { costoBrtFresh } from './brtfresh.js'
import { costoStef } from './stef.js'
import { costoPosteFresh } from './postefresh.js'

// CAP -> zona tariffaria (prime 2 cifre del CAP).
export const ZONE = {
  Z1: { nome: 'Nord', prefissi: ['10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23', '24', '25', '26', '27', '28', '29', '30', '31', '32', '33', '34', '35', '36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46', '47', '48'] },
  Z2: { nome: 'Centro', prefissi: ['50', '51', '52', '53', '54', '55', '56', '57', '58', '59', '60', '61', '62', '63', '64', '65', '66', '00', '01', '02', '03', '04', '05', '06', '07'] },
  Z3: { nome: 'Sud', prefissi: ['70', '71', '72', '73', '74', '75', '80', '81', '82', '83', '84', '85', '86', '87', '88', '89'] },
  Z4: { nome: 'Isole', prefissi: ['90', '91', '92', '93', '94', '95', '96', '97', '98', '99', '07', '08', '09'] }
}

export function zonaDaCap(cap) {
  const p = String(cap || '').padStart(5, '0').slice(0, 2)
  for (const [z, def] of Object.entries(ZONE)) {
    if (def.prefissi.includes(p)) return z
  }
  return 'Z2' // fallback prudente = Centro
}

// Scaglioni di peso (kg). Il preventivo sceglie il primo che contiene il peso.
export const SCAGLIONI = [
  { id: 's5', max: 5, label: '0-5 kg' },
  { id: 's10', max: 10, label: '5-10 kg' },
  { id: 's25', max: 25, label: '10-25 kg' },
  { id: 's50', max: 50, label: '25-50 kg' },
  { id: 's100', max: Infinity, label: '50+ kg' }
]

export function scaglioneDaPeso(peso) {
  return SCAGLIONI.find((s) => peso <= s.max) || SCAGLIONI[SCAGLIONI.length - 1]
}

// Tariffe DEMO: euro per [corriere][zona][scaglione].
// `giorni` = tempo di consegna standard in giorni lavorativi.
export const TARIFFE = {
  brt: {
    giorni: 2,
    prezzi: {
      Z1: { s5: 6.5, s10: 8.0, s25: 11.5, s50: 17.0, s100: 26.0 },
      Z2: { s5: 7.2, s10: 9.0, s25: 13.0, s50: 19.0, s100: 29.0 },
      Z3: { s5: 8.5, s10: 10.8, s25: 15.5, s50: 23.0, s100: 35.0 },
      Z4: { s5: 11.0, s10: 14.0, s25: 20.0, s50: 30.0, s100: 46.0 }
    }
  },
  'stef-surgelati': {
    giorni: 2,
    prezzi: {
      // servizio pedana: tariffa a pedana, meno sensibile allo scaglione collo
      Z1: { s5: 45.0, s10: 45.0, s25: 55.0, s50: 70.0, s100: 90.0 },
      Z2: { s5: 50.0, s10: 50.0, s25: 60.0, s50: 78.0, s100: 100.0 },
      Z3: { s5: 62.0, s10: 62.0, s25: 74.0, s50: 95.0, s100: 120.0 },
      Z4: { s5: 82.0, s10: 82.0, s25: 98.0, s50: 125.0, s100: 160.0 }
    }
  }
}

// Costi imballo frozen a collo (default configurabili). Confermati da Luca:
// poly box (stirolo) 7 EUR + ghiaccio secco >= 5 EUR per box.
export const COSTI_FROZEN = {
  polyBox: 7.0,
  ghiaccioSecco: 5.0,
  // Quanti kg di prodotto stanno in una scatola. Serve a stimare quante ne
  // servono quando l'agente non l'ha dichiarato: l'imballo si paga a scatola,
  // e un ordine da 40 kg non viaggia in una sola.
  capacitaBoxKg: 12
}

// Costo consegna di un corriere per (cap, peso). null se il corriere non ha
// listino per quella zona.
//
// Biotuscia usa il suo listino REALE per zona (data/biotuscia.js): copertura
// regionale, fuori areale ritorna null e il preventivo lo esclude. Gli altri
// corrieri usano ancora le TARIFFE placeholder demo finche non arriva l'Excel.
export function costoConsegna(corriereId, cap, peso) {
  if (corriereId === 'biotuscia') {
    const b = costoBiotuscia(cap, peso)
    if (!b) return null
    return {
      prezzo: b.prezzo,
      giorni: b.giorni,
      zona: b.zona,
      scaglione: { label: `${b.giorno}${b.suAccordo ? ' · su accordo' : ''}` }
    }
  }
  if (corriereId === 'brt-fresh') {
    const b = costoBrtFresh(cap, peso)
    if (!b) return null
    return {
      prezzo: b.prezzo,
      giorni: b.giorni,
      zona: b.ambito,
      scaglione: {
        label: `${b.ambito} · fuel +${b.fuel.toFixed(2)}€${b.oltre31 ? ' · >31kg monocollo' : ''}`
      }
    }
  }
  if (corriereId === 'stef') {
    const b = costoStef(cap, peso)
    if (!b) return null
    return {
      prezzo: b.prezzo,
      giorni: b.giorni,
      zona: b.regione,
      scaglione: { label: `${b.modo} · tass. ${b.pesoTassato}kg` }
    }
  }
  if (corriereId === 'poste-fresh') {
    const b = costoPosteFresh(cap, peso)
    if (!b) return null
    return {
      prezzo: b.prezzo,
      giorni: b.giorni,
      zona: b.zona,
      scaglione: { label: `${b.zona}${b.colli > 1 ? ` · ${b.colli} colli` : ''}` }
    }
  }
  const t = TARIFFE[corriereId]
  if (!t) return null
  const zona = zonaDaCap(cap)
  const sc = scaglioneDaPeso(peso)
  const prezzo = t.prezzi[zona]?.[sc.id]
  if (prezzo == null) return null
  return { prezzo, giorni: t.giorni, zona, scaglione: sc }
}
