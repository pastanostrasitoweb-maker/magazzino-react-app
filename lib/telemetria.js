// Telemetria d'uso — i sensori del consulente migliorie.
//
// COSA REGISTRA
// Quali schermate si aprono, quali comandi si premono, quanto ci mette una
// schermata a comparire, quali errori JavaScript scoppiano. SOLO questo.
//
// COSA NON REGISTRA, MAI
// Il contenuto: niente testi digitati, niente nomi di clienti, niente importi.
//
// PERCHE' ADESSO E' VERO (02/09/2026)
// Fino a ieri il nome dell'azione si ricavava dal TESTO del bottone premuto, e
// il testo di un bottone contiene quello che c'e' scritto a schermo: in
// `telemetria_uso` sono finite 533 righe con importi ("vai al checkout 408,29
// EUR") e 728 con ragioni sociali ("Kairos S.r.l. 00187 Roma"). Sull'app del
// personale le barre del cruscotto contengono il costo del personale, quindi
// premerle lo spediva. L'invariante scritta qui sopra era falsa.
//
// Adesso il nome dell'azione si DICHIARA, non si indovina: vale
// `data-telemetria="salva-ordine"` (oppure l'id del comando, che e' scritto da
// noi e non contiene dati). Un comando senza dichiarazione non viene tracciato:
// meglio un buco nelle statistiche che un dato del cliente in chiaro.
//
// A COSA SERVE
// Una routine notturna legge il riassunto e propone migliorie: la schermata
// lenta, il giro di click ripetuto cento volte che merita una scorciatoia,
// il comando che nessuno preme, l'errore che nessuno ha segnalato.

const URL_BASE = (
  import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.VITE_MAG_SUPABASE_URL ||
  import.meta.env.VITE_SNAPSHOT_URL ||
  ''
).replace(/\/$/, '')

const CHIAVE =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.VITE_MAG_SUPABASE_ANON_KEY ||
  import.meta.env.VITE_SNAPSHOT_KEY ||
  ''

const K_DISP = 'pn-telemetria.dispositivo'
const MAX_CODA = 40
const OGNI_MS = 30000
const MAX_TENTATIVI = 5

let coda = []
let appNome = ''
let timer = null

function dispositivo() {
  try {
    let d = localStorage.getItem(K_DISP)
    if (!d) {
      d = (globalThis.crypto && crypto.randomUUID ? crypto.randomUUID() : 'd-' + Math.random().toString(36).slice(2))
      localStorage.setItem(K_DISP, d)
    }
    return d
  } catch { return '' }
}

// Ultima rete di sicurezza: se per una svista un nome contenesse una cifra con
// i decimali (un importo) o una forma societaria, non parte. Costa un confronto
// e vale un dato del cliente in meno in giro.
const SEMBRA_CONTENUTO = /\d+[.,]\d{2}|\b(s\.?r\.?l|s\.?p\.?a|s\.?n\.?c|s\.?a\.?s|sagl|lda)\b|€/i

// OGNI EVENTO HA IL SUO CODICE, DECISO QUI E MAI PIU' CAMBIATO.
// Serve ai tentativi ripetuti: se il server salva ma la risposta si perde per
// strada, il client crede di aver fallito e rispedisce lo stesso lotto. Con un
// codice per evento e un indice unico sul database, il secondo arrivo e' un
// doppione da ignorare invece di un click contato due volte.
function codiceEvento() {
  try {
    if (globalThis.crypto && crypto.randomUUID) return crypto.randomUUID()
  } catch { /* niente crypto: si ripiega sotto */ }
  const r = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0')
  return `${r()}${r()}-${r()}-4${r().slice(1)}-a${r().slice(1)}-${r()}${r()}${r()}`
}

function registra(tipo, nome, dettaglio = '', valore = null) {
  if (!nome) return
  const n = String(nome).slice(0, 120)
  const d = String(dettaglio).slice(0, 200)
  if (SEMBRA_CONTENUTO.test(n) || SEMBRA_CONTENUTO.test(d)) return
  coda.push({
    evento_id: codiceEvento(),
    app: appNome,
    dispositivo: dispositivo(),
    tipo,
    nome: n,
    dettaglio: d,
    valore
  })
  if (coda.length >= MAX_CODA) invia(false)
}

// LA CODA SI LIBERA SOLO A CONSEGNA AVVENUTA. Prima si svuotava PRIMA di
// sapere com'era andata, e siccome fetch non fallisce sugli errori del server
// (401, 403, 500), un lotto poteva sparire in silenzio: la telemetria smetteva
// di funzionare e nessuno lo sapeva.
function invia(keepalive) {
  if (!coda.length || !URL_BASE || !CHIAVE) return
  const blocco = coda
  coda = []
  const rimetti = () => {
    for (const r of blocco) {
      r._tentativi = (r._tentativi || 0) + 1
      if (r._tentativi <= MAX_TENTATIVI && coda.length < MAX_CODA * 4) coda.push(r)
    }
  }
  // Si passa da `telemetria_registra`, una funzione del database: e' lei a
  // scartare i doppioni (ON CONFLICT DO NOTHING sul codice evento). L'upsert
  // fatto da qui pretenderebbe il permesso di LEGGERE la telemetria, e leggere
  // la telemetria vuol dire vedere come lavora l'azienda: alla chiave pubblica
  // resta solo la facolta' di scrivere.
  fetch(`${URL_BASE}/rest/v1/rpc/telemetria_registra`, {
    method: 'POST',
    keepalive,
    headers: {
      apikey: CHIAVE,
      Authorization: `Bearer ${CHIAVE}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ p_eventi: blocco.map(({ _tentativi, ...r }) => r) })
  })
    .then((r) => { if (!r.ok) rimetti() })
    .catch(() => { rimetti() })
}

// IL NOME DELL'AZIONE SI DICHIARA, NON SI LEGGE DALLO SCHERMO.
// Vale `data-telemetria` (il modo giusto) oppure l'id del comando, che lo
// scriviamo noi nel codice. Niente aria-label, niente title, niente
// textContent: quelli contengono i dati dell'azienda.
function etichetta(el) {
  if (!el || !el.closest) return ''
  const b = el.closest('[data-telemetria], button, a, [role="button"], [role="tab"], summary, input[type="submit"]')
  if (!b) return ''
  const dichiarato = b.getAttribute && b.getAttribute('data-telemetria')
  if (dichiarato) return String(dichiarato).trim().slice(0, 60)
  if (b.id) return String(b.id).trim().slice(0, 60)
  return ''
}

// Le schermate: la ROTTA, non quello che c'e' dentro. Un hash come
// #/cliente/CLI-1234?cerca=rossi porta con se' un codice cliente e una
// ricerca: si tiene la prima parte e i pezzi che sembrano dati diventano ":id".
function rotta() {
  const grezza = (location.hash || location.pathname || '').split('?')[0] || 'home'
  return grezza
    .split('/')
    .map((p) => (/^[A-Z]{2,4}-?\d|^\d/.test(p) ? ':id' : p))
    .join('/')
    .slice(0, 80) || 'home'
}

export function avviaTelemetria(app, chi) {
  if (typeof document === 'undefined' || !URL_BASE || !CHIAVE) return
  appNome = app

  document.addEventListener('click', (e) => {
    const n = etichetta(e.target)
    if (n) registra('azione', n)
  }, { capture: true, passive: true })

  let ultima = ''
  const schermata = () => {
    const h = rotta()
    if (h !== ultima) { ultima = h; registra('schermata', h) }
  }
  window.addEventListener('hashchange', schermata)
  window.addEventListener('popstate', schermata)
  schermata()

  // DEGLI ERRORI SI TIENE IL TIPO E DOVE, NON IL MESSAGGIO: dentro un messaggio
  // di errore finiscono le risposte del server e i valori che l'utente ha
  // scritto, ed e' esattamente cio' che non deve viaggiare.
  window.addEventListener('error', (e) => {
    const tipo = (e.error && e.error.name) || 'Error'
    registra('errore', String(tipo).slice(0, 40), String(e.filename || '').split('/').pop())
  })
  window.addEventListener('unhandledrejection', (e) => {
    const tipo = (e.reason && e.reason.name) || 'Rejection'
    registra('errore', 'promessa: ' + String(tipo).slice(0, 40))
  })

  window.addEventListener('load', () => {
    try {
      const nav = performance.getEntriesByType('navigation')[0]
      if (nav) registra('tempo', 'avvio', '', Math.round(nav.domContentLoadedEventEnd))
    } catch { /* senza performance API si vive lo stesso */ }
  })

  timer = setInterval(() => invia(false), OGNI_MS)
  window.addEventListener('pagehide', () => { clearInterval(timer); invia(true) })
}
