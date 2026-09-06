// COPIA GENERATA — non modificare qui.
// Il file buono sta in app-logistica; questa copia si aggiorna con
//   node scripts/sync-motore.mjs --scrivi
// Modificarlo a mano fa tornare i due applicativi a dire prezzi diversi.

// Mappa CAP (prime 2 cifre) -> REGIONE italiana.
// Usata dai listini per regione: Stef (griglia tariffaria) e Poste Fresh (zone).
// I nomi regione combaciano con le chiavi della griglia Stef.

const PREFISSO_REGIONE = {
  '00': 'LAZIO', '01': 'LAZIO', '02': 'LAZIO', '03': 'LAZIO', '04': 'LAZIO',
  '05': 'UMBRIA', '06': 'UMBRIA',
  '07': 'SARDEGNA', '08': 'SARDEGNA', '09': 'SARDEGNA',
  '10': 'PIEMONTE', '12': 'PIEMONTE', '13': 'PIEMONTE', '14': 'PIEMONTE', '15': 'PIEMONTE', '28': 'PIEMONTE',
  '11': "VALLE D'AOSTA",
  '16': 'LIGURIA', '17': 'LIGURIA', '18': 'LIGURIA', '19': 'LIGURIA',
  '20': 'LOMBARDIA', '21': 'LOMBARDIA', '22': 'LOMBARDIA', '23': 'LOMBARDIA', '24': 'LOMBARDIA',
  '25': 'LOMBARDIA', '26': 'LOMBARDIA', '27': 'LOMBARDIA', '46': 'LOMBARDIA',
  '29': 'EMILIA ROMAGNA', '40': 'EMILIA ROMAGNA', '41': 'EMILIA ROMAGNA', '42': 'EMILIA ROMAGNA',
  '43': 'EMILIA ROMAGNA', '44': 'EMILIA ROMAGNA', '47': 'EMILIA ROMAGNA', '48': 'EMILIA ROMAGNA',
  '30': 'VENETO', '31': 'VENETO', '32': 'VENETO', '35': 'VENETO', '36': 'VENETO', '37': 'VENETO', '45': 'VENETO',
  '33': 'FRIULI V.G.', '34': 'FRIULI V.G.',
  '38': 'TRENTINO A.A.', '39': 'TRENTINO A.A.',
  '50': 'TOSCANA', '51': 'TOSCANA', '52': 'TOSCANA', '53': 'TOSCANA', '54': 'TOSCANA',
  '55': 'TOSCANA', '56': 'TOSCANA', '57': 'TOSCANA', '58': 'TOSCANA', '59': 'TOSCANA',
  '60': 'MARCHE', '61': 'MARCHE', '62': 'MARCHE', '63': 'MARCHE',
  '64': 'ABRUZZO', '65': 'ABRUZZO', '66': 'ABRUZZO', '67': 'ABRUZZO',
  '70': 'PUGLIA', '71': 'PUGLIA', '72': 'PUGLIA', '73': 'PUGLIA', '74': 'PUGLIA', '76': 'PUGLIA',
  '75': 'BASILICATA', '85': 'BASILICATA',
  '80': 'CAMPANIA', '81': 'CAMPANIA', '82': 'CAMPANIA', '83': 'CAMPANIA', '84': 'CAMPANIA',
  '86': 'MOLISE',
  '87': 'CALABRIA', '88': 'CALABRIA', '89': 'CALABRIA',
  '90': 'SICILIA', '91': 'SICILIA', '92': 'SICILIA', '93': 'SICILIA', '94': 'SICILIA',
  '95': 'SICILIA', '96': 'SICILIA', '97': 'SICILIA', '98': 'SICILIA'
}

export function regioneDaCap(cap) {
  const p = String(cap || '').replace(/\D/g, '').padStart(5, '0').slice(0, 2)
  return PREFISSO_REGIONE[p] || null
}
