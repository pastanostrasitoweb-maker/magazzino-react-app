// BIO TUSCIA TRASPORTI — corriere refrigerato ATP (fresh), REGIONALE.
// Dati reali dall'accordo ricevuto 2026-03-12 (email + 4 listini allegati).
// Contatto: Fabrizio Pompei +39 392 4436872 · biotusciatrasporti@gmail.com
//
// Areale: province di Viterbo, Roma (+ Castelli), Rieti, Terni, Grosseto
// (Bassa Maremma), fino a Latina previo accordo. Sede Viterbo (Poggino).
// Servizio AxB: ritiro il giorno prima, consegna il giorno dopo al 90%.
//
// Tariffe IVA ESCLUSA. Scaglioni a step di 40 kg con incremento lineare oltre
// l'ultimo scaglione esplicito. Struttura diversa dai listini "a collo"
// nazionali: qui il prezzo cresce di ~5,50 EUR ogni 40 kg.

// Calendario consegne per zona (dall'email).
// Roma metropolitana + Viterbo: tutti i giorni. Le altre zone a giorno fisso.
export const LISTINI_BIOTUSCIA = {
  'base-a': {
    nome: 'Roma / Viterbo (base A)',
    giorno: 'Tutti i giorni (Roma metrop. + Viterbo)',
    brackets: [
      { max: 40, prezzo: 12.5 },
      { max: 80, prezzo: 15.5 },
      { max: 120, prezzo: 20.5 },
      { max: 160, prezzo: 25.5 },
      { max: 200, prezzo: 30.5 },
      { max: 240, prezzo: 35.5 }
    ],
    incremento: 5.5, // per ogni 40 kg oltre 240
    contrassegnoContanti: 0.02
  },
  rieti: {
    nome: 'Provincia Rieti',
    giorno: 'Venerdì',
    brackets: [
      { max: 40, prezzo: 15.5 },
      { max: 80, prezzo: 20.5 }
    ],
    incremento: 5.5,
    contrassegnoContanti: 0.02
  },
  umbria: {
    nome: 'Umbria / prov. Terni (incl. Orvieto)',
    giorno: 'Venerdì (Terni) · Martedì (Orvieto)',
    brackets: [
      { max: 40, prezzo: 14.5 },
      { max: 80, prezzo: 19.5 }
    ],
    incremento: 5.5,
    contrassegnoContanti: 0.02
  },
  toscana: {
    nome: 'Toscana / prov. Grosseto (Bassa Maremma)',
    giorno: 'Martedì',
    brackets: [
      { max: 40, prezzo: 19.5 },
      { max: 80, prezzo: 24.5 }
    ],
    incremento: 5.0, // Toscana: +5 EUR (non 5,50)
    contrassegnoContanti: 0.04 // Toscana: commissione 4%
  },
  latina: {
    nome: 'Provincia Latina (previo accordo)',
    giorno: 'Su accordo',
    brackets: [
      { max: 40, prezzo: 12.5 },
      { max: 80, prezzo: 15.5 },
      { max: 120, prezzo: 20.5 },
      { max: 160, prezzo: 25.5 },
      { max: 200, prezzo: 30.5 },
      { max: 240, prezzo: 35.5 }
    ],
    incremento: 5.5,
    contrassegnoContanti: 0.02,
    suAccordo: true
  }
}

// Servizi accessori comuni a tutti i listini.
export const ACCESSORI_BIOTUSCIA = {
  ritiroUnico: 10.0, // ritiro merce per unica consegna
  contrassegnoAssegno: 4.0 // commissione fissa su pagamento con assegno
}

// CAP (2 cifre) -> zona listino. Copertura regionale: fuori areale = null.
export function zonaBiotuscia(cap) {
  const p = String(cap || '').padStart(5, '0').slice(0, 2)
  switch (p) {
    case '00': // Roma citta e provincia
    case '01': // Viterbo
      return 'base-a'
    case '02': // Rieti
      return 'rieti'
    case '05': // Terni / Umbria (incl. Orvieto 05018)
      return 'umbria'
    case '58': // Grosseto / Bassa Maremma
      return 'toscana'
    case '04': // Latina, previo accordo
      return 'latina'
    default:
      return null // fuori copertura Biotuscia
  }
}

// Prezzo consegna Biotuscia per (cap, peso). null se fuori copertura.
export function costoBiotuscia(cap, peso) {
  const zonaId = zonaBiotuscia(cap)
  if (!zonaId) return null
  const l = LISTINI_BIOTUSCIA[zonaId]
  const prezzo = tariffaScaglione(l, Number(peso) || 0)
  return {
    prezzo,
    giorni: 1, // servizio AxB: consegna il giorno dopo
    zona: l.nome,
    giorno: l.giorno,
    suAccordo: Boolean(l.suAccordo)
  }
}

function tariffaScaglione(listino, peso) {
  for (const b of listino.brackets) {
    if (peso <= b.max) return b.prezzo
  }
  // oltre l'ultimo scaglione: incremento lineare ogni 40 kg
  const last = listino.brackets[listino.brackets.length - 1]
  const blocchiExtra = Math.ceil((peso - last.max) / 40)
  return round2(last.prezzo + blocchiExtra * listino.incremento)
}

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100
}
