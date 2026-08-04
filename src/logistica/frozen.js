// COPIA GENERATA — non modificare qui.
// Il file buono sta in app-logistica; questa copia si aggiorna con
//   node scripts/sync-motore.mjs --scrivi
// Modificarlo a mano fa tornare i due applicativi a dire prezzi diversi.

// REGOLA FROZEN (Luca 2026-07-24, versione corretta).
//
// Il frozen viaggia nel poly box con ghiaccio secco, insieme al fresco (+4).
// Il ghiaccio secco tiene per pochi giorni, quindi:
//
//   1. L'assegnazione (ritiro) del frozen si fa dal LUNEDÌ al VENERDÌ.
//   2. La consegna deve avvenire ENTRO 3 GIORNI dall'assegnazione.
//   3. La merce non deve restare ferma nel weekend: la consegna deve cadere
//      entro il sabato della stessa settimana (niente domenica, niente
//      scavallamento alla settimana dopo).
//
// Per capire se una zona regge, si incrocia il calendario di consegna del
// corriere in quel CAP (dai PTO reali) con i suoi giorni di transito: si cerca
// un giorno di ritiro lun-ven da cui la prima consegna utile arrivi entro 3
// giorni e non oltre il sabato. Se nessun corriere refrigerato ci riesce, il
// frozen NON è ordinabile in quella zona.

import { GIORNI_STEF, GIORNI_POSTE } from './data/calendario-consegne.js'
import { LISTINI_BIOTUSCIA, zonaBiotuscia } from './data/biotuscia.js'
import { coperturaBrtFresh } from './data/brtfresh.js'
import { costoConsegna } from './data/pto.js'

export const NOMI_GIORNI = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom']
export const NOMI_GIORNI_ESTESI = ['lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica']

export const MAX_GIORNI_CONSEGNA = 3 // tenuta del ghiaccio secco
const ULTIMO_GIORNO_CONSEGNA = 5 // sabato: oltre si entra nel weekend
const TUTTI_FERIALI = 0b0111111 // lun-sab

// Poste Fresh ritira solo il martedì; gli altri tutti i giorni feriali.
const RITIRI = { 'poste-fresh': [1] }
const RITIRI_DEFAULT = [0, 1, 2, 3, 4] // lun-ven

function normalizza(cap) {
  return String(cap || '').replace(/\D/g, '').padStart(5, '0').slice(0, 5)
}

function giorniBiotuscia(cap) {
  const zonaId = zonaBiotuscia(cap)
  if (!zonaId) return 0
  const testo = (LISTINI_BIOTUSCIA[zonaId]?.giorno || '').toLowerCase()
  if (testo.includes('tutti i giorni')) return TUTTI_FERIALI
  let mask = 0
  NOMI_GIORNI_ESTESI.forEach((g, i) => {
    if (testo.includes(g)) mask |= 1 << i
  })
  NOMI_GIORNI.forEach((g, i) => {
    if (new RegExp(`\\b${g}`, 'i').test(testo)) mask |= 1 << i
  })
  return mask
}

// Bitmask dei giorni in cui il corriere consegna a quel CAP. 0 = non servito.
export function giorniConsegna(corriereId, cap) {
  const c = normalizza(cap)
  switch (corriereId) {
    case 'stef':
    case 'stef-surgelati':
      return GIORNI_STEF[c] || 0
    case 'poste-fresh':
      return GIORNI_POSTE[c] || 0
    case 'biotuscia':
      return giorniBiotuscia(c)
    case 'brt-fresh':
      return coperturaBrtFresh(c) ? TUTTI_FERIALI : 0
    case 'brt':
      return TUTTI_FERIALI
    default:
      return 0
  }
}

export function elencoGiorni(mask) {
  return NOMI_GIORNI.filter((_, i) => mask & (1 << i))
}

// Giorni di transito del corriere verso quel CAP (dal listino).
function transito(corriereId, cap) {
  const c = costoConsegna(corriereId, cap, 5)
  return Math.max(1, c?.giorni || 2)
}

// Il corriere riesce a consegnare frozen in quella zona entro i limiti?
// Cerca il ritiro (lun-ven) con la consegna utile più rapida.
export function analisiCorriereFrozen(corriereId, cap) {
  const mask = giorniConsegna(corriereId, cap)
  const base = { corriereId, servito: mask > 0, giorni: elencoGiorni(mask), ok: false, piano: null }
  if (!mask) return base

  const tr = transito(corriereId, cap)
  const ritiri = RITIRI[corriereId] || RITIRI_DEFAULT
  let migliore = null

  for (const r of ritiri) {
    // prima consegna possibile dopo il transito, senza superare il sabato
    for (let d = r + tr; d <= ULTIMO_GIORNO_CONSEGNA; d++) {
      if (!(mask & (1 << d))) continue
      const gg = d - r
      if (gg <= MAX_GIORNI_CONSEGNA && (!migliore || gg < migliore.giorni)) {
        migliore = { ritiro: NOMI_GIORNI[r], consegna: NOMI_GIORNI[d], giorni: gg }
      }
      break // la prima consegna disponibile è quella che conta
    }
  }

  return { ...base, transito: tr, ok: Boolean(migliore), piano: migliore }
}

export function corriereAmmetteFrozen(corriereId, cap) {
  return analisiCorriereFrozen(corriereId, cap).ok
}

// VERDETTO DI ZONA: il frozen è ordinabile per quel CAP?
// Basta che un corriere refrigerato consegni entro 3 giorni, ritirando lun-ven.
export function frozenAmmesso(cap) {
  const c = normalizza(cap)
  const dettaglio = ['stef', 'brt-fresh', 'biotuscia', 'poste-fresh']
    .map((id) => analisiCorriereFrozen(id, c))
    .filter((d) => d.servito)

  const abilitanti = dettaglio.filter((d) => d.ok)
  return {
    cap: c,
    ammesso: abilitanti.length > 0,
    corrieriAbilitanti: abilitanti.map((d) => d.corriereId),
    pianoMigliore: abilitanti.map((d) => d.piano).sort((a, b) => a.giorni - b.giorni)[0] || null,
    dettaglio,
    motivo: abilitanti.length
      ? null
      : dettaglio.length
        ? `In questa zona nessun corriere consegna entro ${MAX_GIORNI_CONSEGNA} giorni dal ritiro senza fermarsi nel weekend: il ghiaccio secco non regge.`
        : 'Zona non servita dai corrieri refrigerati.'
  }
}
