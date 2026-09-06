// COPIA GENERATA — non modificare qui.
// Il file buono sta in app-logistica; questa copia si aggiorna con
//   node scripts/sync-motore.mjs --scrivi
// Modificarlo a mano fa tornare i due applicativi a dire prezzi diversi.

// STEF Italia — quotazioni DEDICATE a un singolo cliente, valide dal 03.08.2026.
//
// Stef quota alcune destinazioni per punto di consegna e non per provincia:
// sono tratte che fa comunque, quindi ci fa il prezzo del Lazio anche fuori
// regione. Vale solo per quel cliente: un altro cliente nello stesso CAP paga
// la griglia nazionale.
//
// Fonte: tabella PDM del listino Stef consegnato il 07.08.2026.

// Fasce: [ <50 kg (EUR/consegna), 50-100 kg (EUR/consegna),
//          100-500 kg (EUR/kg), 500-1000 kg (EUR/kg) ]
export const STEF_DEDICATI = [
  {
    id: 'sidi-piccolo',
    // Come compare nel listino Stef: "SI.DI. PICCOL CASTELLO D (IO6297)"
    codiceStef: 'IO6297',
    cliente: 'SI.D.I. PICCOLO S.R.L.',
    zona: 'CAMPANIA · NA · NAPOLI',
    // Riconoscimento sul nome del documento. "SI.D.I." e "SIDI" si scrivono in
    // piu' modi, quindi si normalizza via togliendo punti e spazi. NON basta
    // "piccolo": esiste anche PICCOLI PASSI PER LA FELICITA', un altro cliente.
    riconosci: (nome) => {
      const n = String(nome || '').toUpperCase().replace(/[^A-Z]/g, '')
      return n.includes('SIDIPICCOLO')
    },
    fasce: [14.0, 16.0, 0.15, 0.09]
  }
]

// Prezzo dedicato per (cliente, peso). null se il cliente non ne ha uno.
export function costoStefDedicato(cliente, peso) {
  const d = STEF_DEDICATI.find((x) => x.riconosci(cliente))
  if (!d) return null
  const kg = Number(peso) || 0
  const [f1, f2, f3, f4] = d.fasce
  let prezzo
  let modo
  if (kg < 50) {
    prezzo = f1
    modo = '<50 kg'
  } else if (kg <= 100) {
    prezzo = f2
    modo = '50-100 kg'
  } else if (kg <= 500) {
    prezzo = round2(f3 * kg)
    modo = `${f3} €/kg`
  } else if (kg <= 1000) {
    prezzo = round2(f4 * kg)
    modo = `${f4} €/kg`
  } else {
    return null // oltre 1000 kg non e' quotato: decide il chiamante
  }
  return {
    prezzo: round2(prezzo),
    giorni: 2,
    regione: 'CAMPANIA',
    modo,
    pesoTassato: kg,
    dedicato: d.cliente,
    codiceStef: d.codiceStef
  }
}

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100
}
