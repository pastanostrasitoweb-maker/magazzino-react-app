// COPIA GENERATA — non modificare qui.
// Il file buono sta in app-logistica; questa copia si aggiorna con
//   node scripts/sync-motore.mjs --scrivi
// Modificarlo a mano fa tornare i due applicativi a dire prezzi diversi.

// Anagrafica corrieri DEMO dell'app logistica.
// Confermata da Luca 2026-07-22.
//
// temperatura del servizio:
//   - 'ambient'   = secco / temperatura ambiente
//   - 'fresh'     = refrigerato
//   - 'frozen'    = surgelato (pedane dedicate)
//
// Il SURGELATO a collo viaggia coi corrieri 'fresh' + imballo poly box:
// solo le PEDANE frozen usano il servizio 'frozen' (Stef surgelati).
//
// Prima della produzione: contratti quadro + listino PTO (Excel per CAP)
// caricati da Luca -> popolano `pto.js` e i PDF contratto in supabase storage.

export const CORRIERI = [
  {
    id: 'brt',
    nome: 'BRT',
    servizio: 'ambient',
    temperature: ['secco'],
    descrizione: 'Consegna ambient (secco). Corriere principale per il secco.',
    contratto: null, // { url, scadenza } quando caricato
    pto: null // popolato da Excel
  },
  {
    id: 'poste-fresh',
    nome: 'Poste Fresh',
    servizio: 'fresh',
    temperature: ['fresh'],
    descrizione:
      'MLK Fresh / postegofresh, temperatura controllata -1/+7°C. Flat per zona fino a 15 kg (Z1 13€, Z2 15€, Z3 16€). Tempi 24/48h.',
    contratto: { fonte: 'Contratto MLK Fresh firmato' },
    pto: { fonte: 'Tariffa per zona + copertura 1405 CAP' }
  },
  {
    id: 'biotuscia',
    nome: 'Bio Tuscia Trasporti',
    servizio: 'fresh',
    // Il surgelato viaggia col fresco dentro il poly box col ghiaccio secco:
    // vale per tutti i refrigerati, quindi anche per Bio Tuscia. Ometterlo la
    // escludeva dal frozen e sui Castelli Romani (dove passa ogni giorno ed e'
    // la piu' economica) l'operatore non se la vedeva nemmeno proporre.
    temperature: ['fresh', 'frozen-collo'],
    regionale: true,
    descrizione:
      'Refrigerato ATP regionale (VT, RM+Castelli, RI, TR, GR, fino a LT), già "Tacos". Servizio AxB: ritiro il giorno prima, consegna il giorno dopo al 90%. Contatto: Fabrizio Pompei +39 392 4436872.',
    contratto: { fonte: 'Accordo email 2026-03-12', scadenza: null },
    pto: { fonte: '4 listini per zona (base A, Rieti, Umbria/Terni, Toscana/Grosseto)' }
  },
  {
    id: 'brt-fresh',
    nome: 'BRT Fresh',
    servizio: 'fresh',
    temperature: ['fresh', 'frozen-collo'],
    descrizione:
      'Refrigerato nazionale (brt@smart fresh). Tariffa monocollo scalare fino a 31 kg, Nazionale/Regionale. Fuel surcharge min 3%. Filiale Roma Aurelio, rif. Dario Valla.',
    contratto: { fonte: 'Contratto tariffario firmato (mod. 01/2023)', pagamento: 'RIBA 30gg' },
    pto: { fonte: 'Tariffa brt@smart fresh + copertura 857 CAP (Luglio 2026)' }
  },
  {
    id: 'stef',
    nome: 'Stef',
    servizio: 'fresh',
    temperature: ['fresh', 'frozen-collo'],
    descrizione:
      'STEF Italia, refrigerato nazionale. Griglia per regione (€/sped fino 100kg, €/kg oltre), min 25kg. Ritiro Roma 15€/viaggio. Usato anche per surgelato a collo (poly box).',
    contratto: { fonte: 'Offerta tariffaria trasporti nazionali (01/12/2023)', pagamento: 'RiBA 30gg' },
    pto: { fonte: 'Griglia tariffaria 20 regioni + coperture PTO (giorni/agenzia)' }
  },
  {
    id: 'stef-surgelati',
    nome: 'Stef surgelati',
    servizio: 'frozen',
    temperature: ['frozen-pedana'],
    descrizione: 'Servizio surgelato dedicato. Solo pedane frozen, niente poly box.',
    contratto: null,
    pto: null
  }
]

export function corriereById(id) {
  return CORRIERI.find((c) => c.id === id) || null
}

// Corrieri ammessi per una data classe di temperatura dell'ordine.
export function corrieriPerTemperatura(temp) {
  switch (temp) {
    case 'secco':
      return CORRIERI.filter((c) => c.servizio === 'ambient')
    case 'fresh':
      return CORRIERI.filter((c) => c.servizio === 'fresh')
    case 'frozen': // frozen a collo -> corrieri fresh (con poly box)
      return CORRIERI.filter((c) => c.temperature.includes('frozen-collo'))
    case 'frozen-pedana':
      return CORRIERI.filter((c) => c.temperature.includes('frozen-pedana'))
    default:
      return []
  }
}
