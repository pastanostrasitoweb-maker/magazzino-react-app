// COPIA GENERATA — non modificare qui.
// Il file buono sta in app-logistica; questa copia si aggiorna con
//   node scripts/sync-motore.mjs --scrivi
// Modificarlo a mano fa tornare i due applicativi a dire prezzi diversi.

// STEF Italia — quotazioni NUOVE per il Lazio, valide dal 03.08.2026.
//
// Sostituiscono per il Lazio la griglia nazionale del contratto 2023
// (`stef.js`). La differenza che conta non e' il prezzo, e' la struttura:
// **sparisce il minimo tassabile di 25 kg**. Il vecchio contratto faceva pagare
// 25 kg anche su una spedizione da 8 kg, e il 68% delle nostre spedizioni Stef
// sta sotto quella soglia.
//
// Fonte: file PTO consegnato da Stef il 07.08.2026, 517 righe, 187 localita'.
//
// IL PREZZO E' PER PROVINCIA, NON PER CAP. Il file elenca i comuni della
// provincia di Roma (000xx) ma della citta' usa il codice generico 00100: se
// si abbinasse per CAP esatto, ogni consegna a Roma centro (00184, 00195...)
// cadrebbe fuori dalla quotazione e pagherebbe il vecchio listino. Nel Lazio le
// prime due cifre del CAP sono la provincia, quindi si legge quella.
//
// Fasce: [ <50 kg (EUR/consegna), 50-100 kg (EUR/consegna), 100-500 kg (EUR/kg) ]
// Oltre i 500 kg il Lazio non e' quotato: si ricade sulla griglia nazionale.
export const GRIGLIA_STEF_LAZIO = {
  ROMA: [11.5, 12.5, 0.13],
  FROSINONE: [14.0, 15.5, 0.16],
  LATINA: [14.0, 15.5, 0.16],
  RIETI: [14.5, 16.0, 0.16],
  VITERBO: [14.5, 16.0, 0.16]
}

// Prefisso CAP -> provincia del Lazio.
const PREFISSO_PROVINCIA = {
  '00': 'ROMA',
  '01': 'VITERBO',
  '02': 'RIETI',
  '03': 'FROSINONE',
  '04': 'LATINA'
}

// Le localita' che Stef dichiara di servire, prese dal file. Non decidono il
// prezzo (quello e' per provincia): servono a sapere se una consegna e' su una
// tratta gia' battuta o va concordata, e a rispondere quando Stef contesta.
export const LOCALITA_SERVITE = new Set([
  '00010', '00012', '00013', '00015', '00017', '00018', '00019', '00020', '00021', '00022',
  '00023', '00024', '00025', '00026', '00027', '00028', '00029', '00030', '00031', '00032',
  '00033', '00034', '00035', '00036', '00037', '00038', '00039', '00040', '00041', '00042',
  '00043', '00044', '00045', '00046', '00047', '00048', '00049', '00051', '00052', '00053',
  '00054', '00055', '00058', '00059', '00060', '00061', '00062', '00063', '00065', '00066',
  '00067', '00068', '00069', '00071', '00072', '00073', '00074', '00075', '00076', '00077',
  '00078', '00100', '00120', '01010', '01011', '01012', '01014', '01015', '01016', '01017',
  '01018', '01019', '01020', '01021', '01022', '01023', '01024', '01025', '01027', '01028',
  '01030', '01032', '01033', '01034', '01035', '01036', '01037', '01038', '01039', '01100',
  '02010', '02011', '02012', '02013', '02014', '02015', '02016', '02018', '02019', '02020',
  '02021', '02022', '02023', '02024', '02025', '02026', '02030', '02031', '02032', '02033',
  '02034', '02035', '02037', '02038', '02039', '02040', '02041', '02042', '02043', '02044',
  '02045', '02046', '02047', '02048', '02049', '02100', '03010', '03011', '03012', '03013',
  '03014', '03016', '03017', '03018', '03019', '03020', '03021', '03022', '03023', '03024',
  '03025', '03026', '03027', '03028', '03029', '03030', '03031', '03032', '03033', '03034',
  '03035', '03036', '03037', '03038', '03039', '03040', '03041', '03042', '03043', '03044',
  '03045', '03046', '03047', '03048', '03049', '03100', '04010', '04011', '04012', '04013',
  '04014', '04015', '04016', '04017', '04018', '04019', '04020', '04021', '04022', '04023',
  '04024', '04025', '04026', '04027', '04029', '04031', '04100'
])

export function provinciaLazio(cap) {
  const c = String(cap || '').trim().padStart(5, '0')
  if (!/^\d{5}$/.test(c)) return null
  return PREFISSO_PROVINCIA[c.slice(0, 2)] || null
}

// Prezzo Stef con la quotazione nuova. null fuori dal Lazio o sopra i 500 kg,
// e allora chi chiama ricade sulla griglia nazionale.
export function costoStefLazio(cap, peso) {
  const p = provinciaLazio(cap)
  if (!p) return null
  const g = GRIGLIA_STEF_LAZIO[p]
  const kg = Number(peso) || 0
  if (kg > 500) return null // fuori quotazione: decide il chiamante
  let prezzo
  let modo
  if (kg < 50) {
    prezzo = g[0]
    modo = '<50 kg'
  } else if (kg <= 100) {
    prezzo = g[1]
    modo = '50-100 kg'
  } else {
    prezzo = round2(g[2] * kg)
    modo = `${g[2]} €/kg`
  }
  // Niente peso minimo e niente arrotondamento: la quotazione nuova non li ha.
  return {
    prezzo: round2(prezzo),
    giorni: 1,
    regione: 'LAZIO',
    provincia: p,
    modo,
    pesoTassato: kg,
    localitaServita: LOCALITA_SERVITE.has(String(cap || '').trim().padStart(5, '0'))
  }
}

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100
}
