/* COPIA GENERATA — non modificare qui.
 * La sorgente e' nel vault: Resources/piattaforma-condivisa/movimento.js.
 * Si aggiorna con Resources/scripts/sync-movimento-js.sh --scrivi.
 * Modificarla a mano fa divergere le undici app. */
/* Movimento della piattaforma Pasta Nostra: il "livello 2".
 *
 * SORGENTE UNICA: questo file nel vault. Nelle app arriva come
 * src/lib/movimento.js con in testa "COPIA GENERATA". Si modifica QUI.
 * Le regole CSS che gli servono stanno nella sezione 6 di apple.css.
 *
 * COSA FA
 * Le liste che si riordinano non saltano: ogni riga scivola dalla vecchia
 * posizione alla nuova. La tecnica e' FLIP (First, Last, Invert, Play):
 * si misura dov'era, si lascia ridisegnare, si rimette dov'era con una
 * trasformazione e si toglie la trasformazione lasciando lavorare la
 * transizione CSS. Nessuna libreria.
 *
 * COME SI USA (React)
 *   const lista = useRef(null)
 *   useListaFluida(lista, ordini)          // si rianima quando cambia
 *   <div ref={lista}>
 *     {ordini.map(o => (
 *       <div key={o.id} data-id={o.id} className="card ap-fluido">...</div>
 *     ))}
 *   </div>
 *
 * Servono due cose su ogni riga: `data-id` stabile e la classe `ap-fluido`.
 * Senza `data-id` la riga viene ignorata, non si rompe niente.
 *
 * PERCHE' LE GUARDIE
 * - Se la finestra non e' impaginata (scheda in secondo piano, PWA appena
 *   risvegliata) `getBoundingClientRect()` restituisce zeri: animare quegli
 *   zeri sposta le righe a caso. Meglio non animare.
 * - Se le righe sono tante il guadagno visivo sparisce e il costo resta:
 *   sopra una soglia si salta.
 */

import { useLayoutEffect, useRef } from 'react'

const MAX_RIGHE = 60      // oltre, si ridisegna e basta: nessuno guarda 200 righe muoversi

/** Misura, ridisegna, anima la differenza. Da chiamare dopo il render. */
export function muoviLista(contenitore, memoria) {
  if (!contenitore) return new Map()
  const nuove = new Map()
  // finestra non impaginata: le misure sarebbero tutte zero
  const misurabile = window.innerWidth > 0 && window.innerHeight > 0
  const figli = [...contenitore.children]
  const troppe = figli.length > MAX_RIGHE

  for (const el of figli) {
    const id = el.dataset?.id
    if (!id) continue
    const top = el.getBoundingClientRect().top
    nuove.set(id, top)
    if (!misurabile || troppe || !memoria) continue
    const prima = memoria.get(id)
    if (prima === undefined) continue          // riga nuova: la anima la CSS con .ap-arriva
    const dy = prima - top
    if (!dy || Math.abs(dy) > 4000) continue   // fermo, o salto assurdo da scroll
    el.classList.add('ap-senza-transizione')
    el.style.transform = `translateY(${dy}px)`
    void el.getBoundingClientRect()            // forza il ricalcolo prima di togliere
    el.classList.remove('ap-senza-transizione')
    el.style.transform = ''
  }
  return nuove
}

/** Hook React: rianima la lista ogni volta che `dipendenza` cambia. */
export function useListaFluida(ref, dipendenza) {
  const memoria = useRef(null)
  useLayoutEffect(() => {
    memoria.current = muoviLista(ref.current, memoria.current)
  }, [dipendenza])
}

/* ============================================================
 * AGGANCIO AUTOMATICO
 * ============================================================
 * `useListaFluida` va bene quando si tocca il componente. Per accendere il
 * movimento su undici app senza riscriverle serve un aggancio che lavori da
 * fuori: osserva il DOM e, quando una riga cambia posizione, la fa scivolare.
 *
 * Si accende con una riga sola in main.jsx, dopo l'import di apple.css:
 *   import { avviaMovimento } from './lib/movimento.js'
 *   avviaMovimento()
 *
 * PERCHE' TANTE GUARDIE
 * Un osservatore che anima tutto quello che si sposta e' un modo eccellente
 * per rompere un'applicazione che funziona. Qui si anima solo quando:
 * - l'elemento e' una riga di lista riconoscibile (selettori espliciti);
 * - lo spostamento e' verticale e plausibile (sotto i 4000 px);
 * - la pagina non ha scrollato in mezzo (se no si anima lo scroll);
 * - la finestra e' impaginata (misure a zero = niente da animare);
 * - il contenitore ha fra 2 e 60 righe;
 * - l'utente non ha chiesto "riduci movimento".
 * In ogni caso l'animazione tocca SOLO `transform`, che non sposta niente
 * nel layout: se qualcosa va storto, l'effetto peggiore e' un guizzo.
 */

const SELETTORI_RIGA = '.card, .riga, .voce, .item, tr[data-id], li[data-id]'
const MIN_RIGHE = 2
const SOGLIA_SALTO = 4000

let acceso = false

export function avviaMovimento(opzioni = {}) {
  if (acceso || typeof window === 'undefined') return () => {}
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return () => {}
  acceso = true

  const selettore = opzioni.selettore || SELETTORI_RIGA
  const radice = opzioni.radice || document.body
  const posizioni = new WeakMap()
  let scrollPrecedente = window.scrollY
  let programmato = false

  const misurabile = () => window.innerWidth > 0 && window.innerHeight > 0

  function passa() {
    programmato = false
    if (!misurabile()) return
    const scrollOra = window.scrollY
    const haScrollato = Math.abs(scrollOra - scrollPrecedente) > 2
    scrollPrecedente = scrollOra

    const righe = radice.querySelectorAll(selettore)
    if (righe.length < MIN_RIGHE || righe.length > MAX_RIGHE) {
      righe.forEach((el) => posizioni.set(el, el.getBoundingClientRect().top))
      return
    }
    for (const el of righe) {
      const top = el.getBoundingClientRect().top
      const prima = posizioni.get(el)
      posizioni.set(el, top)
      if (prima === undefined || haScrollato) continue
      const dy = prima - top
      if (!dy || Math.abs(dy) < 1 || Math.abs(dy) > SOGLIA_SALTO) continue
      el.classList.add('ap-fluido', 'ap-senza-transizione')
      el.style.transform = `translateY(${dy}px)`
      void el.getBoundingClientRect()
      el.classList.remove('ap-senza-transizione')
      el.style.transform = ''
    }
  }

  const osservatore = new MutationObserver(() => {
    if (programmato) return
    programmato = true
    // dopo il ridisegno, non durante: qui le posizioni nuove sono gia' valide
    requestAnimationFrame(passa)
  })
  osservatore.observe(radice, { childList: true, subtree: true })
  passa()   // prima misurazione: senza, il primo cambio non ha un "prima"

  return () => { osservatore.disconnect(); acceso = false }
}