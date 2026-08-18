// Lo sconto in chiaro sulle righe GIA' importate dall'app agenti.
//
// REGOLA DI LUCA (11/08/2026): "ogni cosa che viene scontata non modifica il
// prezzo di listino ma aggiunge lo sconto nella riga sconti".
//
// Dal 11/08 il ponte agenti manda la scomposizione (listino, due sconti, prezzo
// finale) e il magazzino la scrive cosi' com'e'. Gli ordini importati PRIMA
// hanno ancora il prezzo netto nella colonna prezzo e lo sconto del livello
// cliente da nessuna parte: sulla conferma di Gluten Free Sans Soucci il listino
// era 45,31 al cartone e il prezzo stampato 25,83, senza che niente dicesse che
// in mezzo c'era un 43%.
//
// Questo script rimette il listino nella colonna prezzo e gli sconti nelle loro
// colonne, A NETTO INVARIATO: se la riscrittura sposta il netto della riga anche
// di un centesimo la riga NON si tocca e viene elencata. Nessun totale si muove,
// nessun documento cambia importo: cambia solo cosa c'e' scritto e quindi cosa
// si capisce leggendolo.
//
//   node scripts/sconto-in-chiaro-righe-gia-importate.mjs           (prova)
//   node scripts/sconto-in-chiaro-righe-gia-importate.mjs --applica
//
// Le chiavi si leggono da .env.local, le stesse dell'app: si scrive con la
// chiave anon perche' e' quella che deve funzionare davvero (una SELECT non vede
// i permessi, una UPDATE si').
import { readFileSync } from 'node:fs'

const APPLICA = process.argv.includes('--applica')
const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((r) => r.includes('='))
    .map((r) => [r.slice(0, r.indexOf('=')).trim(), r.slice(r.indexOf('=') + 1).trim()])
)
const URL_DB = env.VITE_SUPABASE_URL
const KEY = env.VITE_SUPABASE_ANON_KEY
const H = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' }

const get = async (p) => {
  const r = await fetch(`${URL_DB}/rest/v1/${p}`, { headers: H })
  if (!r.ok) throw new Error(`GET ${p}: ${r.status} ${await r.text()}`)
  return r.json()
}
const patch = async (p, body) => {
  const r = await fetch(`${URL_DB}/rest/v1/${p}`, {
    method: 'PATCH',
    headers: { ...H, Prefer: 'return=representation' },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(`PATCH ${p}: ${r.status} ${await r.text()}`)
  return r.json()
}

const pct4 = (n) => Math.round(n * 10000) / 10000
const netto = (prezzo, s1, s2) => prezzo * (1 - s1 / 100) * (1 - s2 / 100)
const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '')

const ordini = await get(
  'ordini_agenti?select=id_ordine,cliente,canale,livello_cliente,id_ordine_magazzino,righe' +
    '&id_ordine_magazzino=not.is.null&order=creato_il.desc&limit=500'
)

let riscritte = 0
const saltate = []
const ordiniToccati = new Set()

for (const o of ordini) {
  const conListino = (o.righe || []).filter((r) => Number(r.prezzo_listino || 0) > 0)
  if (!conListino.length) continue
  const idm = o.id_ordine_magazzino
  const stato = await get(`ordini?select=stato,archiviato,ddt_numero&id_ordine=eq.${encodeURIComponent(idm)}`)
  // Un ordine con il DDT emesso e' merce partita: la carta che il cliente ha in
  // mano riporta quei numeri e non la si riscrive alle sue spalle.
  if (stato[0]?.ddt_numero) {
    saltate.push(`${idm} intero: DDT ${stato[0].ddt_numero} gia' emesso`)
    continue
  }
  const magazzino = await get(
    `righe_ordine?select=id_riga,descrizione_prodotto,prezzo_unitario,sconto_pct,sconto2_pct,sconto3_pct` +
      `&id_ordine=eq.${encodeURIComponent(idm)}&order=ordine_riga`
  )
  const usate = new Set()

  for (const r of conListino) {
    const pezziCollo = Number(r.pezzi_collo || 1) || 1
    const listino = Number(r.prezzo_listino)
    // Il prezzo al pezzo con cui la riga e' stata scritta nel magazzino: e'
    // `prezzo_netto`, e dal 17/08/2026 il ponte non lo manda piu' perche' era un
    // duplicato letterale di `prezzo_unitario`. Gli ordini vecchi hanno il primo,
    // i nuovi il secondo, e sono lo stesso numero. NON si usa `prezzo_finale`: quello
    // ha dentro anche il secondo sconto, e non corrisponde a quello che c'e' scritto
    // oggi nella colonna prezzo, quindi la riga non si aggancerebbe piu'.
    const nettoPezzo = Number(r.prezzo_netto ?? r.prezzo_unitario ?? 0)
    const lordoCollo = Math.round(listino * pezziCollo * 10000) / 10000
    // Come la riga sta OGGI nel magazzino: prezzo = netto al cartone.
    const prezzoOggi = Math.round(nettoPezzo * pezziCollo * 10000) / 10000

    // La riga giusta e' quella con la stessa descrizione E lo stesso prezzo di
    // adesso: la descrizione da sola non basta, in un ordine la stessa referenza
    // compare anche due volte (una a listino e una in promozione).
    const d = norm(r.descrizione_prodotto)
    const riga = magazzino.find(
      (m) =>
        !usate.has(m.id_riga) &&
        (norm(m.descrizione_prodotto).startsWith(d.slice(0, 18)) || d.startsWith(norm(m.descrizione_prodotto).slice(0, 18))) &&
        Math.abs(Number(m.prezzo_unitario || 0) - prezzoOggi) < 0.01
    )
    if (!riga) continue
    usate.add(riga.id_riga)

    // Se il prezzo e' gia' il listino, la riga e' a posto.
    if (Math.abs(Number(riga.prezzo_unitario || 0) - lordoCollo) < 0.01) continue

    const s1Ora = Number(riga.sconto_pct || 0)
    const s2Ora = Number(riga.sconto2_pct || 0)
    const s3Ora = Number(riga.sconto3_pct || 0)
    const nettoOra = netto(Number(riga.prezzo_unitario || 0), s1Ora, s2Ora) * (1 - s3Ora / 100)

    // Il primo sconto e' quello nascosto nel prezzo (il livello del cliente, o
    // la percentuale di una promozione a prezzo fisso), il secondo resta quello
    // che c'era gia' dichiarato.
    //
    // Una riga in OMAGGIO fa eccezione: la si scrive listino + 100%, e basta.
    // Dichiarare "43% e poi 100%" sarebbe vero e illeggibile, e su un documento
    // conta che si capisca al primo sguardo che quella riga e' regalata.
    const inOmaggio = s1Ora >= 100 || s2Ora >= 100 || s3Ora >= 100
    const s1 = inOmaggio ? 100 : pct4((1 - nettoPezzo / listino) * 100)
    const s2 = inOmaggio ? 0 : pct4(s1Ora)
    const nettoNuovo = netto(lordoCollo, s1, s2) * (1 - s3Ora / 100)

    if (!(s1 >= 0 && s1 <= 100) || Math.abs(nettoNuovo - nettoOra) > 0.01) {
      saltate.push(
        `${idm} ${riga.id_riga} ${r.descrizione_prodotto}: netto ${nettoOra.toFixed(4)} -> ${nettoNuovo.toFixed(4)}`
      )
      continue
    }

    console.log(
      `${APPLICA ? 'riscrivo' : 'riscriverei'} ${idm} ${String(r.descrizione_prodotto).slice(0, 30).padEnd(30)} ` +
        `${Number(riga.prezzo_unitario).toFixed(4)} sc=${s1Ora} -> ${lordoCollo.toFixed(4)} sc=${s1}+${s2} (netto ${nettoOra.toFixed(2)})`
    )
    if (APPLICA) {
      const out = await patch(`righe_ordine?id_riga=eq.${encodeURIComponent(riga.id_riga)}`, {
        prezzo_unitario: lordoCollo,
        sconto_pct: s1,
        sconto2_pct: s2,
      })
      if (!out.length) throw new Error(`la riga ${riga.id_riga} non e' stata scritta (permessi?)`)
    }
    riscritte++
    ordiniToccati.add(idm)
  }
}

console.log(`\nrighe ${APPLICA ? 'riscritte' : 'da riscrivere'}: ${riscritte} su ${ordiniToccati.size} ordini`)
if (saltate.length) {
  console.log(`saltate ${saltate.length}:`)
  for (const s of saltate) console.log('  ' + s)
}
if (!APPLICA) console.log('\nprova: nessuna scrittura. Con --applica scrive.')
