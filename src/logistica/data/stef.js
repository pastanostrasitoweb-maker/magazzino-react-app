// COPIA GENERATA — non modificare qui.
// Il file buono sta in app-logistica; questa copia si aggiorna con
//   node scripts/sync-motore.mjs --scrivi
// Modificarlo a mano fa tornare i due applicativi a dire prezzi diversi.

// STEF Italia S.p.A. — corriere refrigerato NAZIONALE (offerta tariffaria trasporti nazionali).
// Dati reali dal contratto "OFFERTA TARIFFARIA TRASPORTI NAZIONALI" (dal 01/12/2023).
// Cliente spedisce da ROMA (RM). Servizio fresco (categoria froid FR).
//
// GRIGLIA per REGIONE, scalare a peso. Colonne:
//   - <25 kg   -> EUR/spedizione (flat)
//   - 25-50 kg -> EUR/spedizione (flat)
//   - 50-100 kg-> EUR/spedizione (flat)
//   - 100-500 kg -> EUR/kg
//   - >500 kg  -> EUR/kg
// Peso arrotondato ai 10 kg superiori. Peso minimo 25 kg per consegna.
// Presa presso magazzino ROMA: 15 EUR/viaggio. Min fatturabile 300 EUR/fattura.
// Contrassegno: 2,5% del valore, min 20 EUR. + adeguamento gasolio (Allegato 1).

// [ <25(EUR/sped), 25-50(EUR/sped), 50-100(EUR/sped), 100-500(EUR/kg), >500(EUR/kg) ]
export const GRIGLIA_STEF = {
  "VALLE D'AOSTA": [29.0, 31.0, 61.0, 0.61, 0.565],
  PIEMONTE: [27.0, 29.0, 56.0, 0.565, 0.52],
  LIGURIA: [24.0, 26.0, 50.0, 0.5, 0.46],
  LOMBARDIA: [21.0, 23.0, 45.0, 0.45, 0.415],
  VENETO: [20.0, 22.0, 44.0, 0.44, 0.4],
  'FRIULI V.G.': [26.0, 28.0, 54.0, 0.54, 0.5],
  'TRENTINO A.A.': [26.0, 28.0, 55.0, 0.545, 0.505],
  'EMILIA ROMAGNA': [22.0, 24.0, 47.0, 0.465, 0.43],
  TOSCANA: [20.0, 22.0, 43.0, 0.43, 0.385],
  UMBRIA: [24.0, 26.0, 51.0, 0.505, 0.46],
  MARCHE: [21.0, 23.0, 42.0, 0.425, 0.38],
  ABRUZZO: [20.0, 22.0, 41.0, 0.405, 0.36],
  MOLISE: [19.0, 21.0, 39.0, 0.385, 0.345],
  LAZIO: [15.0, 17.0, 28.0, 0.28, 0.235],
  PUGLIA: [22.0, 24.0, 47.0, 0.465, 0.42],
  BASILICATA: [22.0, 24.0, 48.0, 0.475, 0.43],
  CAMPANIA: [18.0, 20.0, 38.0, 0.375, 0.335],
  CALABRIA: [28.0, 30.0, 60.0, 0.6, 0.56],
  SARDEGNA: [40.0, 42.0, 84.0, 0.835, 0.795],
  SICILIA: [43.0, 45.0, 89.0, 0.885, 0.845]
}

export const PARAMETRI_STEF = {
  presaRomaViaggio: 15.0, // ritiro presso magazzino Roma, per viaggio (non per collo)
  pesoMinimoKg: 25,
  arrotondamentoKg: 10,
  minFatturabile: 300.0, // per fattura, cumulabile
  contrassegnoPct: 0.025,
  contrassegnoMin: 20.0,
  validita: 'dal 01/12/2023, rivalutazione annuale + adeguamento gasolio (Allegato 1)'
}

import { regioneDaCap } from './regioni.js'
import { costoStefLazio } from './stef-lazio.js'
import { costoStefDedicato } from './stef-dedicati.js'

// Prezzo consegna Stef per (cap, peso, cliente). null se regione non mappata.
//
// Ordine di precedenza, dal piu' specifico al piu' generico:
//   1. quotazione dedicata al cliente (dal 03.08.2026)
//   2. quotazione Lazio per provincia (dal 03.08.2026)
//   3. griglia nazionale del contratto 2023
// Le prime due non hanno il minimo tassabile di 25 kg, la terza si': e' la
// ragione per cui esistono.
export function costoStef(cap, peso, cliente) {
  const ded = costoStefDedicato(cliente, peso)
  if (ded) return ded
  const laz = costoStefLazio(cap, peso)
  if (laz) return laz

  const regione = regioneDaCap(cap)
  if (!regione || !GRIGLIA_STEF[regione]) return null
  const g = GRIGLIA_STEF[regione]
  // arrotondamento ai 10 kg superiori (minimo un blocco da 10 kg).
  // La fascia "<25 kg" (EUR/sped flat) copre gia le spedizioni leggere.
  const kg = Math.max(10, Math.ceil((Number(peso) || 0) / 10) * 10)

  let prezzo
  let modo
  if (kg <= 20) {
    prezzo = g[0]
    modo = '<25 kg'
  } else if (kg <= 40) {
    prezzo = g[1]
    modo = '25-50 kg'
  } else if (kg <= 100) {
    prezzo = g[2]
    modo = '50-100 kg'
  } else if (kg <= 500) {
    prezzo = round2(g[3] * kg)
    modo = `${g[3]} €/kg`
  } else {
    prezzo = round2(g[4] * kg)
    modo = `${g[4]} €/kg`
  }

  return {
    prezzo: round2(prezzo),
    giorni: 2,
    regione,
    modo,
    pesoTassato: kg
  }
}

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100
}
