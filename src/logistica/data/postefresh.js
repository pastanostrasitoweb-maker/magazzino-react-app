// COPIA GENERATA — non modificare qui.
// Il file buono sta in app-logistica; questa copia si aggiorna con
//   node scripts/sync-motore.mjs --scrivi
// Modificarlo a mano fa tornare i due applicativi a dire prezzi diversi.

// POSTE FRESH (MLK Fresh S.r.l. / postegofresh) — corriere refrigerato.
// Dati reali dal contratto MLK Fresh firmato. Servizio a temperatura
// controllata (-1 / +7 gradi), alimenti freschi e secchi. Tempi 24/48 ore.
//
// Servizio FRESCO (-1/+7). Classificato 'fresh' nell'app. Confermato Luca 2026-07-22.
//
// TARIFFA flat per ZONA fino a 15 kg per collo:
//   Zona 1 (Lombardia, Lazio, Piemonte): 13 EUR
//   Zona 2 (Emilia, Toscana, Veneto):    15 EUR
//   Zona 3 (Liguria e altre zone):       16 EUR
// Collo aggiuntivo oltre il secondo (per spedizione): 2,50 EUR.
// Assicurazione vettoriale 1 EUR/kg inclusa. Ritiro: 0 EUR con >=3 ordini, 15 EUR sotto.
// IVA esclusa.

import { regioneDaCap } from './regioni.js'
import { POSTE_FRESH_CAP } from './postefresh-copertura.js'

export const ZONE_POSTE_FRESH = {
  zona1: { prezzo: 13.0, regioni: ['LOMBARDIA', 'LAZIO', 'PIEMONTE'], nome: 'Zona 1 (Lombardia/Lazio/Piemonte)' },
  zona2: { prezzo: 15.0, regioni: ['EMILIA ROMAGNA', 'TOSCANA', 'VENETO'], nome: 'Zona 2 (Emilia/Toscana/Veneto)' },
  zona3: { prezzo: 16.0, regioni: [], nome: 'Zona 3 (Liguria e altre zone)' }
}

export const PARAMETRI_POSTE_FRESH = {
  pesoMaxCollo: 15,
  colloAggiuntivo: 2.5, // oltre il secondo, per spedizione
  ritiroSottoSoglia: 15.0, // con meno di 3 ordini
  ritiroSogliaOrdini: 3,
  tempiConsegna: '24/48 ore',
  assicurazione: 'vettoriale 1 €/kg inclusa'
}

function zonaDaRegione(regione) {
  if (ZONE_POSTE_FRESH.zona1.regioni.includes(regione)) return ZONE_POSTE_FRESH.zona1
  if (ZONE_POSTE_FRESH.zona2.regioni.includes(regione)) return ZONE_POSTE_FRESH.zona2
  return ZONE_POSTE_FRESH.zona3
}

export function coperturaPosteFresh(cap) {
  return POSTE_FRESH_CAP.has(normalizza(cap))
}

// Prezzo consegna Poste Fresh per (cap, peso). null se fuori copertura.
export function costoPosteFresh(cap, peso) {
  if (!POSTE_FRESH_CAP.has(normalizza(cap))) return null
  const regione = regioneDaCap(cap)
  const zona = zonaDaRegione(regione)
  const kg = Number(peso) || 0
  const colli = Math.max(1, Math.ceil(kg / PARAMETRI_POSTE_FRESH.pesoMaxCollo))
  const extra = Math.max(0, colli - 2) * PARAMETRI_POSTE_FRESH.colloAggiuntivo
  return {
    prezzo: round2(zona.prezzo + extra),
    giorni: 2, // 24/48 ore
    zona: zona.nome,
    colli
  }
}

function normalizza(cap) {
  return String(cap || '').replace(/\D/g, '').padStart(5, '0').slice(0, 5)
}

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100
}
