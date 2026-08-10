// Telemetria d'uso — i sensori del consulente migliorie.
//
// COSA REGISTRA
// Quali schermate si aprono, quali bottoni si premono, quanto ci mette una
// schermata a comparire, quali errori JavaScript scoppiano. SOLO questo.
//
// COSA NON REGISTRA, MAI
// Il contenuto: niente testi digitati, niente nomi di clienti, niente importi.
// Di un bottone si salva l'etichetta, di un campo NON si salva il valore.
// La regola e' che da questi dati si deve capire COME si usa l'app, non COSA
// c'e' dentro l'azienda.
//
// A COSA SERVE
// Una routine notturna legge il riassunto e propone migliorie: la schermata
// lenta, il giro di click ripetuto cento volte che merita una scorciatoia,
// il bottone che nessuno preme, l'errore che nessuno ha segnalato.

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

function registra(tipo, nome, dettaglio = '', valore = null) {
  if (!nome) return
  coda.push({
    app: appNome,
    dispositivo: dispositivo(),
    tipo,
    nome: String(nome).slice(0, 120),
    dettaglio: String(dettaglio).slice(0, 200),
    valore
  })
  if (coda.length >= MAX_CODA) invia(false)
}

function invia(keepalive) {
  if (!coda.length || !URL_BASE || !CHIAVE) return
  const blocco = coda
  coda = []
  fetch(`${URL_BASE}/rest/v1/telemetria_uso`, {
    method: 'POST',
    keepalive,
    headers: {
      apikey: CHIAVE,
      Authorization: `Bearer ${CHIAVE}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    },
    body: JSON.stringify(blocco)
  }).catch(() => { /* offline: questi eventi si perdono, e va bene cosi' */ })
}

// L'etichetta di quello che si e' premuto, senza mai leggere valori di campi.
function etichetta(el) {
  if (!el || !el.closest) return ''
  const b = el.closest('button, a, [role="button"], [role="tab"], summary, input[type="submit"]')
  if (!b) return ''
  if (b.id === 'pn-segnala') return 'segnala-problema'
  const t = (b.getAttribute('aria-label') || b.title || b.textContent || '').trim().replace(/\s+/g, ' ')
  return t.slice(0, 60)
}

export function avviaTelemetria(app, chi) {
  if (typeof document === 'undefined' || !URL_BASE || !CHIAVE) return
  appNome = app

  document.addEventListener('click', (e) => {
    const n = etichetta(e.target)
    if (n) registra('azione', n)
  }, { capture: true, passive: true })

  // Cambio schermata nelle PWA: si osserva l'hash o il testo del titolo attivo.
  let ultima = ''
  const schermata = () => {
    const h = (location.hash || location.pathname || '').slice(0, 80) || 'home'
    if (h !== ultima) { ultima = h; registra('schermata', h) }
  }
  window.addEventListener('hashchange', schermata)
  window.addEventListener('popstate', schermata)
  schermata()

  window.addEventListener('error', (e) => {
    registra('errore', String(e.message || 'errore').slice(0, 120), String(e.filename || '').split('/').pop())
  })
  window.addEventListener('unhandledrejection', (e) => {
    registra('errore', 'promessa: ' + String(e.reason && e.reason.message || e.reason || '').slice(0, 100))
  })

  // Quanto ci ha messo l'app a diventare usabile.
  window.addEventListener('load', () => {
    try {
      const nav = performance.getEntriesByType('navigation')[0]
      if (nav) registra('tempo', 'avvio', '', Math.round(nav.domContentLoadedEventEnd))
    } catch { /* senza performance API si vive lo stesso */ }
  })

  timer = setInterval(() => invia(false), OGNI_MS)
  window.addEventListener('pagehide', () => { clearInterval(timer); invia(true) })
}
