// COPIA GENERATA — non modificare qui.
// Il file buono sta in app-logistica; questa copia si aggiorna con
//   node scripts/sync-motore.mjs --scrivi
// Modificarlo a mano fa tornare i due applicativi a dire prezzi diversi.

// BRT FRESH (brt@smart fresh) — corriere refrigerato NAZIONALE.
// Dati reali dal contratto tariffario firmato (BRT S.p.A. / GEOPOST).
// Filiale Roma Aurelio · rif. Dario Valla dario.valla@brt.it.
// Pagamento RIBA 30gg. Tariffa scalare a peso fino a 31 kg (monocollo).
//
// Ambito NAZIONALE vs REGIONALE: la tariffa regionale si applica alle
// destinazioni nella regione del mittente. GFE / Pasta Nostra spedisce da
// ROMA, quindi Regionale = LAZIO (RM, VT, RI, FR, LT). Tutte le altre regioni
// = Nazionale. (Confermato Luca 2026-07-22.)

import { BRT_FRESH_CAP } from './brtfresh-copertura.js'

export const TARIFFA_BRT_FRESH = {
  nazionale: { f5: 12.65, f10: 13.5, perKg: 0.85 },
  regionale: { f5: 11.45, f10: 12.8, perKg: 0.75 },
  pesoMaxMonocollo: 31,
  arrotondamento: '1 kg in 1 kg',
  fuelSurchargeMin: 0.03, // minimo 3% su tutte le spedizioni
  validita: '01/06/2023 - 31/12/2023 (adeguata annualmente indice NIC ISTAT dal 01/01/2024)'
}

// Prefissi CAP Lazio (regione mittente: spediamo da Roma) -> tariffa regionale.
const PREFISSI_REGIONALE = ['00', '01', '02', '03', '04'] // RM, VT, RI, FR, LT

// Supplementi (applicati secondo evento). Fuel surcharge e' l'unico su TUTTE.
export const SUPPLEMENTI_BRT_FRESH = {
  fuelSurchargeMin: 0.03, // minimo 3%
  consegnaZtl: 0.1, // 10% sul prezzo di trasporto
  giacenze: 10.0, // per collo
  smaltimento: 10.0, // per collo
  richiamoAllertaSanitaria: 10.0, // per collo
  rietichettatura: 3.0, // a collo
  oversizeOverweight: 25.0, // a collo
  ritiroAnnullato: 10.0 // a collo
}

// Servizi accessori on demand.
export const ACCESSORI_BRT_FRESH = {
  appuntamento: 3.0,
  assicurazioneAcBase: 0.007, // EUR/kg
  assicurazioneAcPlus: 0.004, // 0,4% sul valore, min 5 EUR
  assicurazioneAcPlusMin: 5.0,
  consegnaPianiOltre10kg: 7.0 // a collo (>10 kg); fino a 10 kg inclusa
}

export function coperturaBrtFresh(cap) {
  return BRT_FRESH_CAP.has(normalizza(cap))
}

// Prezzo consegna BRT Fresh per (cap, peso). null se fuori copertura.
export function costoBrtFresh(cap, peso) {
  const c = normalizza(cap)
  if (!BRT_FRESH_CAP.has(c)) return null
  const regionale = PREFISSI_REGIONALE.includes(c.slice(0, 2))
  const t = regionale ? TARIFFA_BRT_FRESH.regionale : TARIFFA_BRT_FRESH.nazionale
  const kg = Math.max(1, Math.ceil(Number(peso) || 0)) // arrotondamento al kg superiore

  let base
  if (kg <= 5) base = t.f5
  else if (kg <= 10) base = t.f10
  else base = t.f10 + (Math.min(kg, 31) - 10) * t.perKg // banda oltre, per kg fino a 31

  const fuel = round2(base * TARIFFA_BRT_FRESH.fuelSurchargeMin)
  const totale = round2(base + fuel)
  return {
    prezzo: totale,
    base: round2(base),
    fuel,
    giorni: regionale ? 1 : 2,
    ambito: regionale ? 'Regionale (Lazio)' : 'Nazionale',
    oltre31: kg > 31 // monocollo non oltre 31 kg: stima
  }
}

function normalizza(cap) {
  return String(cap || '').replace(/\D/g, '').padStart(5, '0').slice(0, 5)
}

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100
}
