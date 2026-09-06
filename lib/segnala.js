// Segnala un problema — bottone presente in tutte le app della piattaforma.
//
// PERCHE' ESISTE
// Chi usa un'app e' l'unico che vede davvero cosa non va, ma finora per dirlo
// doveva ricordarsene fino a sera e trovare Luca. Cosi' la maggior parte delle
// cose non arrivava mai. Qui la segnalazione parte in dieci secondi, dal punto
// esatto in cui e' successa, e resta in coda finche' qualcuno non la lavora.
//
// COME E' FATTO
// Niente React e nessuna dipendenza: si attacca al documento da solo. Cosi' lo
// stesso file entra in ogni app senza toccarne il codice, indipendentemente da
// come e' costruita, e se qualcosa va storto non puo' rompere la schermata.
//
// DOVE FINISCE
// Tabella `segnalazioni` su Supabase: il ruolo anonimo puo' solo INSERIRE, non
// rileggere. Chi scrive AGISCI davanti al testo chiede un intervento, non un
// appunto: quelle righe vengono lavorate per prime.

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

const K_CHI = 'pn-segnala.chi'

function el(tag, stile, testo) {
  const n = document.createElement(tag)
  if (stile) n.setAttribute('style', stile)
  if (testo != null) n.textContent = testo
  return n
}

function leggiChi() {
  try { return localStorage.getItem(K_CHI) || '' } catch { return '' }
}

async function invia(app, chi, testo) {
  const azione = /^agisci\b/i.test(testo.trim())
  const r = await fetch(`${URL_BASE}/rest/v1/segnalazioni`, {
    method: 'POST',
    headers: {
      apikey: CHIAVE,
      Authorization: `Bearer ${CHIAVE}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    },
    body: JSON.stringify({
      origine: 'app',
      app,
      chi: chi.slice(0, 60),
      testo: (azione ? testo.trim().replace(/^agisci\b[:,\s-]*/i, '') || testo.trim() : testo.trim()).slice(0, 2000),
      azione
    })
  })
  if (!r.ok) throw new Error(`${r.status}`)
  return azione
}

export function montaSegnala(app) {
  if (typeof document === 'undefined') return
  if (!URL_BASE || !CHIAVE) return // senza credenziali il bottone resta spento
  if (document.getElementById('pn-segnala')) return

  const monta = () => {
    const bottone = el(
      'button',
      'position:fixed;right:14px;bottom:14px;z-index:2147483000;width:44px;height:44px;' +
      'border-radius:999px;border:1px solid rgba(0,0,0,.12);background:#fff;color:#1f2933;' +
      'box-shadow:0 2px 10px rgba(0,0,0,.18);cursor:pointer;font-size:20px;line-height:1;' +
      'display:flex;align-items:center;justify-content:center;padding:0'
    )
    bottone.id = 'pn-segnala'
    bottone.type = 'button'
    bottone.title = 'Segnala un problema'
    bottone.setAttribute('aria-label', 'Segnala un problema')
    bottone.innerHTML =
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.2A8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5z"/>' +
      '<path d="M12 8v4"/><path d="M12 16h.01"/></svg>'

    let aperto = null

    const chiudi = () => {
      if (aperto) { aperto.remove(); aperto = null }
      bottone.style.display = 'flex'
    }

    const apri = () => {
      bottone.style.display = 'none'
      const box = el(
        'div',
        'position:fixed;right:14px;bottom:14px;z-index:2147483000;width:min(340px,calc(100vw - 28px));' +
        'background:#fff;color:#1f2933;border:1px solid rgba(0,0,0,.12);border-radius:12px;' +
        'box-shadow:0 8px 28px rgba(0,0,0,.22);padding:14px;font:14px/1.5 system-ui,-apple-system,sans-serif'
      )

      const titolo = el('div', 'font-weight:600;margin-bottom:2px', 'Segnala un problema')
      const sotto = el(
        'div',
        'font-size:12px;color:#6b7280;margin-bottom:10px',
        'Scrivi cosa non va. Se metti AGISCI all’inizio, chiedi un intervento e non solo un appunto.'
      )

      const chi = el('input', 'width:100%;box-sizing:border-box;padding:8px 10px;margin-bottom:8px;' +
        'border:1px solid #d1d5db;border-radius:8px;font:inherit')
      chi.placeholder = 'Chi sei (facoltativo)'
      chi.value = leggiChi()

      const testo = el('textarea', 'width:100%;box-sizing:border-box;padding:8px 10px;height:96px;resize:vertical;' +
        'border:1px solid #d1d5db;border-radius:8px;font:inherit')
      testo.placeholder = 'Cosa e’ successo?'

      const esito = el('div', 'font-size:12px;min-height:16px;margin-top:6px;color:#6b7280', '')
      const riga = el('div', 'display:flex;gap:8px;justify-content:flex-end;margin-top:10px')

      const annulla = el('button', 'padding:8px 12px;border-radius:8px;border:1px solid #d1d5db;' +
        'background:#fff;cursor:pointer;font:inherit', 'Annulla')
      annulla.type = 'button'
      const manda = el('button', 'padding:8px 14px;border-radius:8px;border:0;background:#1c5d68;' +
        'color:#fff;cursor:pointer;font:inherit;font-weight:600', 'Manda')
      manda.type = 'button'

      annulla.onclick = chiudi
      manda.onclick = async () => {
        const t = testo.value.trim()
        if (!t) { esito.textContent = 'Scrivi almeno una riga.'; return }
        manda.disabled = true
        manda.textContent = 'Invio...'
        esito.style.color = '#6b7280'
        esito.textContent = ''
        try {
          try { localStorage.setItem(K_CHI, chi.value.trim()) } catch { /* storage negato */ }
          const azione = await invia(app, chi.value.trim(), t)
          esito.style.color = '#0f6e56'
          esito.textContent = azione
            ? 'Ricevuto, messo in coda come intervento da fare.'
            : 'Segnalazione registrata, grazie.'
          testo.value = ''
          setTimeout(chiudi, 1600)
        } catch (e) {
          esito.style.color = '#a32d2d'
          esito.textContent = 'Non e’ partita: riprova fra poco. (' + e.message + ')'
          manda.disabled = false
          manda.textContent = 'Manda'
        }
      }

      riga.append(annulla, manda)
      box.append(titolo, sotto, chi, testo, esito, riga)
      document.body.appendChild(box)
      aperto = box
      testo.focus()
    }

    bottone.onclick = apri
    document.body.appendChild(bottone)
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', monta, { once: true })
  } else {
    monta()
  }
}
