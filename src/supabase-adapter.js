// Supabase adapter for the magazzino app.
// Mantiene la stessa firma e shape di risposta del vecchio backend Apps Script
// (callSheetsApi) per evitare di toccare i call sites in App.jsx.
//
// NOTA: `stockMovements` (ritornato da markOrderPrepared) viene ricalcolato
// lato adapter ri-leggendo `quantita_caricata` dei lotti coinvolti dopo la rpc.
// Il DB e' la fonte di verita': la rpc prepara_ordine non torna i movimenti,
// li deriviamo qui per aggiornare lo stock in UI senza full refresh.
//
// Tutte le tabelle/funzioni RPC vivono in Supabase (project ref:
// wwjgjiybyrrkafymiuew). Schema atteso:
//
//   tabelle: prodotti, lotti, ordini, righe_ordine, assegnazioni_lotti
//   viste:   v_lotti_disponibilita, v_righe_assegnazione
//   rpc:     assegna_lotto, rimuovi_assegnazione, prepara_ordine

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // Non blocco l'import: lascio fallire la prima chiamata con un messaggio chiaro.
  console.warn("[supabase-adapter] VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY non impostate.");
}

// CHI HA TOCCATO L'ORDINE (Luca 13/08/2026).
//
// Lo storico degli stati registra ogni passaggio, ma senza un nome resta
// "non registrato": l'app lavora con la chiave pubblica e il database non sa
// chi c'e' dietro. Invece di infilare l'operatore in 31 punti diversi, lo si
// dichiara UNA volta con un'intestazione della richiesta: PostgREST la passa
// al database, e il trigger dello storico la legge.
let operatoreCorrente = "";
const testataOperatore = {
  get "x-operatore"() {
    return operatoreCorrente;
  },
};

export function impostaOperatore(nome) {
  operatoreCorrente = String(nome || "");
}

// UNA RICHIESTA NON PUO' RESTARE APPESA PER SEMPRE (Luca 26/08/2026,
// screenshot con "Salvataggio..." ancora acceso: un'assegnazione lotto era
// rimasta in sospeso, la riga sembrava completa nell'interfaccia ma il server
// non aveva mai ricevuto o mai risposto, e "Prepara ordine" ha trovato lo
// stato vero: 1 pezzo assegnato su 3). Su una rete lenta o instabile (un
// iPad in magazzino, non un ufficio) una fetch puo' restare "in volo" senza
// mai risolversi ne' fallire: senza timeout lo stato ottimistico dell'app
// resta un fantasma, e chi guarda lo schermo non ha modo di saperlo. Dopo 20
// secondi si arrende e fa scattare il rollback che il chiamante gia' prevede.
const fetchConTimeout = (url, opzioni = {}) => {
  const controllo = new AbortController();
  const timeout = setTimeout(() => controllo.abort(), 20000);
  return fetch(url, { ...opzioni, signal: controllo.signal }).finally(() => clearTimeout(timeout));
};

const supabase = createClient(SUPABASE_URL || "", SUPABASE_ANON_KEY || "", {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { headers: testataOperatore, fetch: fetchConTimeout },
});

// Il client nudo, per chi deve leggere tabelle che l'adapter non conosce
// (la generazione delle fatture legge anagrafiche, righe e registri tutti
// insieme, e passarle una per una da qui sarebbe solo giro lungo).
export { supabase };

// ---------- helpers ----------

const boolToSiNo = (v) => (v === true ? "SI" : "NO");
const siNoToBool = (v) => {
  if (v === true || v === false) return v;
  const s = String(v ?? "").trim().toLowerCase();
  return ["si", "sì", "yes", "true", "1"].includes(s);
};
const toIsoString = (v) => {
  if (v === null || v === undefined || v === "") return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toISOString();
};

const parsePayload = (params) => {
  // I call site mandano `payload: JSON.stringify(...)`. Se non c'è, uso direttamente params.
  if (params && typeof params.payload === "string") {
    try {
      return JSON.parse(params.payload);
    } catch (_) {
      return {};
    }
  }
  if (params && params.payload && typeof params.payload === "object") {
    return params.payload;
  }
  return params || {};
};

const failure = (e) => {
  const msg = (e && (e.message || e.error || e.details)) || String(e || "errore sconosciuto");
  return { success: false, error: msg };
};

// Fetch con .in() a blocchi (PostgREST/URL-length safe) su liste di id.
async function selectIn(table, col, ids, cols = "*") {
  const out = [];
  const CHUNK = 150;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const batch = ids.slice(i, i + CHUNK);
    if (!batch.length) continue;
    const { data, error } = await supabase.from(table).select(cols).in(col, batch);
    if (error) throw error;
    out.push(...(data || []));
  }
  return out;
}

// Il netto di una riga. I tre sconti vanno IN CASCATA: ognuno si applica al
// prezzo gia' scontato dal precedente, quindi 100 con 10+10+10 fa 72,90 e non
// 70,00. Sommarli darebbe un prezzo piu' basso del dovuto su ogni riga.
// Stessa formula della netto_riga() sul database
// (sql/sconti_cliente_e_listino.sql): se cambia una, va cambiata l'altra.
export function nettoRiga(qta, prezzo, sconto1, sconto2, sconto3) {
  return (
    Number(qta || 0) * Number(prezzo || 0) *
    (1 - Number(sconto1 || 0) / 100) *
    (1 - Number(sconto2 || 0) / 100) *
    (1 - Number(sconto3 || 0) / 100)
  );
}

// Mapper riga DB -> forma usata dal frontend (condivisi tra bulkLoad e archivio).
const mapOrdineRow = (row) => ({
  ID_Ordine: String(row.id_ordine ?? ""),
  Cliente: row.cliente ?? "",
  ID_Cliente: String(row.id_cliente ?? ""),
  Note: row.note ?? "",
  Data_Preparato: toIsoString(row.data_preparato),
  Archiviato: boolToSiNo(row.archiviato),
  Stato: row.stato ?? "Da preparare",
  Stato_Lavorazione: row.stato_lavorazione ?? "",
  Stato_Pagamento: row.stato_pagamento ?? "",
  Cap: row.cap ?? "",
  Corriere: row.corriere ?? "",
  // Il corriere con cui l'ordine e' PARTITO davvero (lo scrive la spedizione).
  // Diverso da `corriere`, che e' quello scelto in fase di preparazione: sugli
  // ordini del 03/08 il primo era pieno e il secondo vuoto, e il DDT usciva
  // senza vettore perche' l'app questa colonna non la leggeva proprio.
  Corriere_Spedizione: row.corriere_spedizione ?? "",
  Id_Destinazione: row.id_destinazione ?? "",
  // Peso scritto a mano: vince sulla somma dei pesi delle righe. Serve perche'
  // il calcolo somma solo i prodotti a catalogo con peso noto, e chi spedisce
  // ha la bilancia davanti (Luca 03/08/2026).
  Peso_Manuale: row.peso_manuale === null || row.peso_manuale === undefined
    ? null
    : Number(row.peso_manuale),
  DDT_Numero: row.ddt_numero ?? "",
  Motivo_Fermo: row.motivo_fermo ?? "",
  Listino: row.listino ?? "",
  Sconto_Cliente_Pct: row.sconto_cliente_pct === null || row.sconto_cliente_pct === undefined
    ? null
    : Number(row.sconto_cliente_pct),
  Totale_Imponibile: row.totale_imponibile === null || row.totale_imponibile === undefined
    ? null
    : Number(row.totale_imponibile),
  Regime_Iva: row.regime_iva ?? "",
  Agente_Id: row.agente_id ?? "",
  Agente_Nome: row.agente_nome ?? "",
  Unito_In: row.unito_in ?? "",
  Data_Ordine: toIsoString(row.data_ordine),
  // Il metodo di pagamento dell'ordine: serve al magazzino per accorgersi se e'
  // in una forma che non produce scadenza. Non arrivava al frontend, quindi il
  // campo non si poteva ne' vedere ne' correggere da qui (Luca 06/08/2026).
  Metodo_Pagamento: row.metodo_pagamento ?? "",
  // Riga descrittiva stampata nel corpo del DDT dopo l'ultimo articolo: sono le
  // istruzioni per accettare la merce su QUESTA consegna (Luca 07/08/2026).
  Nota_DDT: row.nota_ddt ?? "",
  // Campionatura, a pagamento o gratuita: serve alle metriche commerciali
  // (Luca 11/08/2026). Prima si riconosceva solo dalla parola scritta nelle note.
  Campionatura: row.campionatura === true,
  // Pedana surgelata: la merce va a -18 con Stef surgelati e senza poly box. Lo
  // dichiara l'agente e comanda sulla temperatura di spedizione, quindi sul
  // corriere che il motore propone (Luca 17/08/2026).
  Pedana_Frozen: row.pedana_frozen === true,
  Colli: row.colli === null || row.colli === undefined ? "" : Number(row.colli),
});
const mapRigaRow = (row) => ({
  ID_Riga: String(row.id_riga ?? ""),
  ID_Ordine: String(row.id_ordine ?? ""),
  ID_Prodotto: String(row.id_prodotto ?? ""),
  Descrizione_Prodotto: row.descrizione_prodotto ?? "",
  Ordine_Riga: Number(row.ordine_riga ?? 0),
  "Quantità_Ordinata": Number(row.quantita_ordinata ?? 0),
  Quantita_Assegnata: Number(row.quantita_assegnata ?? 0),
  // Valorizzazione: null = riga non valorizzata (diverso da prezzo 0).
  Prezzo_Unitario: row.prezzo_unitario === null || row.prezzo_unitario === undefined
    ? null
    : Number(row.prezzo_unitario),
  Sconto_Pct: Number(row.sconto_pct ?? 0),
  Sconto2_Pct: Number(row.sconto2_pct ?? 0),
  Sconto3_Pct: Number(row.sconto3_pct ?? 0),
  Prezzo_Origine: row.prezzo_origine ?? "",
  // Avviso rosso quando il listino e le fatture non dicono lo stesso prezzo.
  Prezzo_Avviso: row.prezzo_avviso ?? "",
  Iva_Pct: row.iva_pct === null || row.iva_pct === undefined ? null : Number(row.iva_pct),
  Natura_Iva: row.natura_iva ?? "",
});
const mapAssegRow = (row) => ({
  ID_Assegnazione: String(row.id_assegnazione ?? ""),
  ID_Riga: String(row.id_riga ?? ""),
  ID_Lotto: String(row.id_lotto ?? ""),
  Codice_Lotto: row.codice_lotto ?? row.lotto ?? "",
  "Quantità_Assegnata": Number(row.quantita_assegnata ?? 0),
});

// ---- VALORIZZAZIONE RIGHE DALL'APP AGENTI ----
// TRAPPOLA DELLE UNITA' (il bug "1 crt -> 8 crt" del 2026-07-17 nasceva qui):
//   l'app agenti manda  prezzo_unitario = prezzo al PEZZO
//                       quantita_ordinata = PEZZI
//                       colli = CARTONI  ·  pezzi_collo = pezzi in un cartone
//   il magazzino conta in CARTONI (qtyOrdered = colli).
// Quindi il prezzo va riportato all'unita' del magazzino:
//   prezzo_cartone = prezzo_pezzo x pezzi_collo
// I pezzi sciolti (polybox frozen) hanno colli null: restano a pezzi e il
// prezzo al pezzo va bene com'e'.
// Regola verificata su TUTTI i 31 ordini reali del ponte: la somma
// qty x prezzo x (1 - sconto) coincide al centesimo con ordini_agenti.totale.
function valorizzaRigaApp(r) {
  const pezzi = Number(r.quantita_ordinata || 0);
  const colli = r.colli === null || r.colli === undefined ? null : Number(r.colli);
  const aCartoni = colli !== null && colli > 0;
  // pezzi_collo dichiarato dall'app; se manca lo si deduce dai pezzi.
  const pezziCollo = aCartoni
    ? Number(r.pezzi_collo) || (pezzi > 0 ? pezzi / colli : 1)
    : 1;
  const prezzoPezzo = Number(r.prezzo_unitario || 0);
  // MASSIMO DUE DECIMALI (Luca 27/08/2026): i prezzi si parlano in centesimi.
  // Il listino di canale dell'app e' per pezzo con 4 decimali, e riportato a
  // cartone si portava dietro la coda (45,3080 invece di 45,31 in bolla).
  const prezzo = Math.round(prezzoPezzo * pezziCollo * 100) / 100;

  // REGOLA DI LUCA (11/08/2026): "ogni cosa che viene scontata NON modifica il
  // prezzo di listino ma aggiunge lo sconto nella riga sconti. Adesso abbiamo uno
  // sconto solo, ma preparati: ci sono clienti che hanno il secondo sconto."
  //
  // Il prezzo che si scrive e' quindi SEMPRE il listino, e gli sconti si scrivono
  // nelle loro colonne. Prima si scriveva il netto e la colonna Sconto restava
  // vuota: sulla conferma d'ordine di Gluten Free Sans Soucci il listino era
  // 45,31 al cartone e il prezzo stampato 25,83, senza dire da nessuna parte che
  // era un 43%. Chi la legge non sa che prezzo gli abbiamo fatto e chi la
  // controlla non sa se e' giusto.
  //
  // Il ponte agenti manda due sconti distinti:
  //   sconto_pct        lo sconto del cliente
  //   promo_sconto_pct  quello della promozione (verificato: 70% su NFARMA 011)
  // e NON sono dentro il prezzo: `prezzo_unitario` e' il listino meno il solo
  // sconto del LIVELLO cliente, e questi due si applicano sopra. Qui sotto il
  // prezzo arriva da `prezzo_unitario`, non da `prezzo_netto`: quel campo era un
  // duplicato letterale del primo e dal 17/08/2026 il ponte non lo manda piu'.
  // (Il commento diceva "gia' applicati dentro prezzo_netto, in cascata": era
  // falso e avrebbe fatto sbagliare chi lo legge fra sei mesi.)
  //
  // Se i due dichiarati non ricostruiscono il netto, la differenza e' uno sconto
  // che l'app non ha dichiarato (il 43% di Sans Soucci arrivava con sconto_pct a
  // zero): si ricava e si mette nel primo sconto. Se anche cosi' i conti non
  // tornano al centesimo non si tocca niente: un prezzo giusto scritto male e'
  // meglio di un prezzo sbagliato scritto bene.
  const listinoPezzo = Number(r.prezzo_listino || 0);
  const sc1Dichiarato = Number(r.sconto_pct || 0);
  const sc2Dichiarato = Number(r.promo_sconto_pct || 0);

  // LA SCOMPOSIZIONE DICHIARATA DALL'APP AGENTI (dal 11/08/2026).
  //
  // Il ponte manda listino, i due sconti e il prezzo finale, e la
  // moltiplicazione deve tornare:
  //
  //   prezzo_listino x (1 - sconto1_pct) x (1 - sconto2_pct) = prezzo_finale
  //
  // Se torna si prende quella e non si indovina niente: e' chi fa il prezzo che
  // dice com'e' fatto. Il primo sconto e' quello del cliente (il suo livello),
  // il secondo tutto il resto in cascata: sconto di riga, sconto di canale, 5%
  // extra dell'agente, sconto sull'ordine di una promozione.
  //
  // Se non torna, o se l'app e' una versione vecchia che non li manda, si
  // continua col ricavo dai due prezzi qui sotto: gli ordini non si fermano
  // perche' un telefono ha in cache il bundle di ieri.
  const finalePezzo = r.prezzo_finale === null || r.prezzo_finale === undefined
    ? null
    : Number(r.prezzo_finale);
  if (finalePezzo !== null && listinoPezzo > 0) {
    const s1 = Number(r.sconto1_pct || 0);
    const s2 = Number(r.sconto2_pct || 0);
    const atteso = listinoPezzo * (1 - s1 / 100) * (1 - s2 / 100);
    if (
      s1 >= 0 && s1 <= 100 && s2 >= 0 && s2 <= 100 &&
      Math.abs(atteso - finalePezzo) < 0.0001
    ) {
      return {
        qty: aCartoni ? colli : pezzi,
        prezzo: Math.round(listinoPezzo * pezziCollo * 100) / 100,
        sconto: s1,
        sconto2: s2,
      };
    }
  }

  // L'APP DI OGGI MANDA UN SOLO SCONTO DICHIARATO (`sconto_pct`): l'extra
  // dell'agente o la promo di riga. Lo sconto del livello cliente e' dentro
  // `prezzo_finale` ma non e' dichiarato, e `prezzo_unitario` NON contiene la
  // promo: il ramo qui sotto, ricostruendo da prezzo_unitario, la perdeva.
  // Maison Della Salute 26/08/2026: promo 50% e omaggi 100% spariti dal DDT,
  // il cliente avrebbe pagato 102,62 euro piu' del concordato. Il guardiano
  // l'ha fermato, ma il prezzo deve nascere giusto, non essere fermato dopo.
  // Qui: il dichiarato va nel secondo sconto, il primo si ricava dal rapporto
  // finale/listino. Se la moltiplicazione non ridà il finale al centesimo,
  // si lascia fare ai rami successivi.
  if (finalePezzo !== null && listinoPezzo > 0) {
    // L'app manda 5.000000000000004: nella colonna sconti va scritto 5.
    const scDich = Math.round(Number(r.sconto_pct || 0) * 100) / 100;
    if (scDich === 100) {
      // Omaggio: netto zero comunque, ma il listino resta scritto e lo
      // sconto sta nella sua colonna, come vuole la regola di Luca.
      return {
        qty: aCartoni ? colli : pezzi,
        prezzo: Math.round(listinoPezzo * pezziCollo * 100) / 100,
        sconto: 0,
        sconto2: 100,
      };
    }
    if (scDich > 0 && scDich < 100) {
      const resto = 1 - scDich / 100;
      const sc1 = Math.round((1 - finalePezzo / listinoPezzo / resto) * 10000) / 100;
      const netto = listinoPezzo * pezziCollo * (1 - sc1 / 100) * resto;
      if (sc1 >= 0 && sc1 < 100 && Math.abs(netto - finalePezzo * pezziCollo) < 0.01) {
        return {
          qty: aCartoni ? colli : pezzi,
          prezzo: Math.round(listinoPezzo * pezziCollo * 100) / 100,
          sconto: sc1,
          sconto2: scDich,
        };
      }
    }
  }

  if (listinoPezzo > 0 && prezzoPezzo > 0 && listinoPezzo >= prezzoPezzo) {
    const lordo = Math.round(listinoPezzo * pezziCollo * 100) / 100;
    const cascata = (a, b) => 1 - (1 - a / 100) * (1 - b / 100);
    const scontoVero = 1 - prezzoPezzo / listinoPezzo;

    // Quanto deve valere il primo sconto perche' la cascata col secondo
    // dichiarato ridia il netto vero.
    const restante = 1 - sc2Dichiarato / 100;
    let sc1 = restante > 0
      ? Math.round((1 - (1 - scontoVero) / restante) * 10000) / 100
      : sc1Dichiarato;
    if (Math.abs(sc1) < 0.005) sc1 = 0;

    const netto = lordo * (1 - cascata(sc1, sc2Dichiarato));
    if (sc1 >= 0 && sc1 < 100 && Math.abs(netto - prezzo) < 0.01) {
      return { qty: aCartoni ? colli : pezzi, prezzo: lordo, sconto: sc1, sconto2: sc2Dichiarato };
    }
  }

  return {
    qty: aCartoni ? colli : pezzi,
    prezzo,
    sconto: sc1Dichiarato,
    sconto2: sc2Dichiarato,
  };
}

// Ricalcola l'imponibile di un ordine dalle SUE righe (non dal ponte agenti):
// le quantita' in magazzino si correggono a mano, quindi la testata deve
// sempre rispecchiare le righe che partono davvero. Best-effort.
async function ricalcolaImponibile(idOrdine) {
  if (!idOrdine) return;
  try {
    const { data, error } = await supabase
      .from("righe_ordine")
      .select("quantita_ordinata,prezzo_unitario,sconto_pct,sconto2_pct,sconto3_pct")
      .eq("id_ordine", String(idOrdine));
    if (error) return;
    const righe = data || [];
    if (!righe.some((r) => r.prezzo_unitario != null)) return; // ordine non valorizzato
    const tot = righe.reduce(
      (s, r) => s + nettoRiga(r.quantita_ordinata, r.prezzo_unitario, r.sconto_pct,
                              r.sconto2_pct, r.sconto3_pct),
      0
    );
    await supabase
      .from("ordini")
      .update({ totale_imponibile: Math.round(tot * 100) / 100 })
      .eq("id_ordine", String(idOrdine));
  } catch (_) {}
}

// Imponibile di un ordine dalle sue righe valorizzate.
function imponibileDaRighe(righe) {
  const tot = (righe || []).reduce((s, r) => {
    const q = Number(r.quantita_ordinata ?? r.qtyOrdered ?? 0);
    const p = Number(r.prezzo_unitario ?? r.prezzoUnitario ?? 0);
    const sc = Number(r.sconto_pct ?? r.scontoPct ?? 0);
    return s + q * p * (1 - sc / 100);
  }, 0);
  return Math.round(tot * 100) / 100;
}

// Snapshot anagrafica cliente (da ordini_agenti) per una lista di ordini.
async function anagrafichePerOrdini(orderIds) {
  const map = {};
  if (!orderIds || !orderIds.length) return map;
  try {
    const rows = await selectIn(
      "ordini_agenti",
      "id_ordine_magazzino",
      orderIds,
      "id_ordine_magazzino,cliente"
    );
    for (const r of rows) {
      if (r.id_ordine_magazzino && r.cliente && typeof r.cliente === "object") {
        map[String(r.id_ordine_magazzino)] = r.cliente;
      }
    }
  } catch (_) {}
  return map;
}

// ---------- bulk load ----------

// IL NODO VIVO: quello che il lavoro cambia (prodotti, lotti, ordini attivi
// con righe e assegnazioni, snapshot anagrafiche degli ordini app). Sta in una
// funzione sua perche' dopo un'operazione si ricarica SOLO questo (action
// getDatiVivi): le anagrafiche complete (registro clienti, destinazioni,
// schede arricchite) pesano ~4.500 righe e restano in memoria.
async function caricaNodoVivo() {
  const [prodottiR, lottiR, ordiniR] = await Promise.all([
    supabase.from("prodotti").select("*"),
    supabase.from("lotti").select("*").order("scadenza", { ascending: true, nullsFirst: false }),
    // Solo ordini ATTIVI (non archiviati): lo storico si carica a richiesta
    // (getOrdiniArchiviati), senza tagli silenziosi al tetto dei 1000.
    supabase.from("ordini").select("*").or("archiviato.is.null,archiviato.eq.false"),
  ]);

  for (const r of [prodottiR, lottiR, ordiniR]) {
    if (r.error) throw r.error;
  }
  const prodotti = (prodottiR.data || []).map((row) => ({
    ID_Prodotto: String(row.id_prodotto ?? ""),
    Codice_Prodotto: row.codice_prodotto ?? "",
    Descrizione_Prodotto: row.descrizione_prodotto ?? "",
    UM: row.um ?? "",
    Categoria: row.categoria ?? "",
    Sottocategoria: row.sottocategoria ?? "",
    Gestione_Lotti: boolToSiNo(row.gestione_lotti),
    IVA_Pct: row.iva_pct ?? "",
  }));

  // Mappa id_prodotto -> codice_prodotto (dai prodotti caricati).
  // Serve a passare anche Codice_Prodotto al normalizeLots/normalizeOrderLines,
  // così i lotti il cui id_prodotto e' un codice testuale (es. "NFARMA 054")
  // vengono comunque risolti via productByCode invece di restare orfani.
  const codiceByIdProd = new Map();
  for (const p of prodottiR.data || []) {
    codiceByIdProd.set(String(p.id_prodotto), p.codice_prodotto ?? "");
  }
  const codiceFor = (idProd) => {
    const raw = String(idProd ?? "");
    return codiceByIdProd.get(raw) || raw; // se non risolve, raw e' gia' il codice testuale
  };

  const lotti = (lottiR.data || []).map((row) => ({
    ID_Lotto: String(row.id_lotto ?? ""),
    ID_Prodotto: String(row.id_prodotto ?? ""),
    Codice_Prodotto: codiceFor(row.id_prodotto),
    Codice_Lotto: row.codice_lotto ?? row.lotto ?? "",
    Scadenza: toIsoString(row.scadenza),
    Archiviato: boolToSiNo(row.archiviato),
    "Quantità_Caricata": Number(row.quantita_caricata ?? 0),
  }));

  const ordini = (ordiniR.data || []).map(mapOrdineRow);

  // Righe e assegnazioni SOLO degli ordini attivi (caricamento snello): niente
  // storico in memoria, niente taglio a 1000 righe.
  const activeOrderIds = (ordiniR.data || []).map((o) => String(o.id_ordine)).filter(Boolean);
  const righeRows = activeOrderIds.length
    ? await selectIn("righe_ordine", "id_ordine", activeOrderIds)
    : [];
  const activeRigheIds = righeRows.map((r) => String(r.id_riga)).filter(Boolean);
  const assegRows = activeRigheIds.length
    ? await selectIn("assegnazioni_lotti", "id_riga", activeRigheIds)
    : [];
  const righeOrdine = righeRows.map(mapRigaRow);
  const assegnazioniLotti = assegRows.map(mapAssegRow);

  // Anagrafiche degli ordini arrivati dall'APP agenti: lo snapshot JSON del
  // cliente (crm_clienti non e' leggibile da anon, ma lo snapshot viaggia
  // con l'ordine). Serve al semaforo "Anagrafica OK/KO" e al DDT.
  // Mappa: id_ordine_magazzino -> oggetto cliente.
  // Solo per gli ordini attivi (lo storico porta le sue anagrafiche a richiesta).
  const anagraficheApp = await anagrafichePerOrdini(activeOrderIds);
  return { prodotti, lotti, ordini, righeOrdine, assegnazioniLotti, anagraficheApp };
}

async function bulkLoad() {
  const vivo = await caricaNodoVivo();
  // clienti: tabella nuova (06_clienti.sql). maybe non esiste su ambienti
  // non ancora migrati -> tollerante: se errore, lista vuota, app gira lo stesso.
  const clientiR = await supabase.from("clienti").select("*").order("ragione_sociale", { ascending: true });

  // clienti: tollerante alla tabella mancante (clientiR.error -> lista vuota).
  const clientiLocali = (clientiR && !clientiR.error ? clientiR.data || [] : []).map((row) => ({
    ID_Cliente: String(row.id_cliente ?? ""),
    Ragione_Sociale: row.ragione_sociale ?? "",
    Categoria: row.categoria ?? "",
    Categoria_TS: row.categoria_ts ?? "",
    Codice_Cliente_TS: row.codice_cliente_ts ?? "",
    PIVA: row.piva ?? "",
    Codice_Fiscale: row.codice_fiscale ?? "",
    Codice_Destinatario_TS: row.codice_destinatario_ts ?? "",
    Fonte: row.fonte ?? "",
    Attivo: row.attivo === false ? false : true,
    Note: row.note ?? "",
  }));

  // REGISTRO CLIENTI UNICO nel selettore (dal 2026-08-02, prima era
  // clienti_gestionale). `clienti_master` e' un superset: i ~2041 clienti a
  // gestionale con codice 'CLI-<B-CODCLI>' PIU' quelli nati fuori dal
  // gestionale (agenti, magazzino) con codice proprio. Quindi ogni scelta nel
  // selettore porta un codice, anche per i clienti che a gestionale non ci
  // sono ancora. Il codice sull'ordine e' quello che permette al CRM di
  // sapere quando quel cliente ha ordinato l'ultima volta.
  const clienti = [...clientiLocali];
  try {
    const codici = new Set(clientiLocali.map((c) => String(c.Codice_Cliente_TS || "")));
    // UN CLIENTE, UNA RIGA NEL SELETTORE. Il cliente creato dall'app sta sia
    // nella tabella clienti sia nel registro (il registro gli ha dato il
    // codice): senza questo filtro compariva DUE volte per ogni creazione, e
    // coi click ripetuti si arrivava alle "6-7 copie" viste da Luca (24/08).
    const idVisti = new Set(clientiLocali.map((c) => String(c.ID_Cliente)));
    const pivaViste = new Set(
      clientiLocali.map((c) => String(c.PIVA || "").replace(/\D/g, "")).filter((x) => x.length === 11)
    );
    const PAGE = 1000;
    for (let from = 0; from < 20000; from += PAGE) {
      const { data, error } = await supabase
        .from("clienti_master")
        .select("codice,codice_gestionale,ragione_sociale,piva,citta,provincia,telefono,email,origine")
        .order("ragione_sociale")
        .range(from, from + PAGE - 1);
      if (error) break;
      for (const r of data || []) {
        const cod = String(r.codice || "");
        if (!cod || !r.ragione_sociale) continue;
        if (r.codice_gestionale && codici.has(String(r.codice_gestionale))) continue;
        if (idVisti.has(cod)) continue;
        const pivaReg = String(r.piva || "").replace(/\D/g, "");
        if (pivaReg.length === 11 && pivaViste.has(pivaReg)) continue;
        clienti.push({
          ID_Cliente: cod,
          Ragione_Sociale: r.citta ? `${r.ragione_sociale} · ${r.citta}` : r.ragione_sociale,
          Categoria: r.origine === "gestionale" ? "Anagrafica GAMMA" : `Registro · ${r.origine || ""}`,
          Categoria_TS: "",
          Codice_Cliente_TS: r.codice_gestionale || "",
          PIVA: r.piva || "",
          Codice_Fiscale: "",
          Codice_Destinatario_TS: "",
          Fonte: r.origine === "gestionale" ? "GAMMA" : "REGISTRO",
          Attivo: true,
          Note: "",
          Cap: "",
          Provincia: r.provincia || "",
          Citta: r.citta || "",
          Indirizzo: "",
          Telefono: r.telefono || "",
          Email: r.email || "",
        });
      }
      if (!data || data.length < PAGE) break;
    }
  } catch (_) {
    // registro non disponibile: il selettore resta coi clienti locali
  }

  // Anagrafica agenti: serve al selettore sugli ordini caricati in casa.
  let agenti = [];
  try {
    const r = await supabase
      .from("agenti")
      .select("agente_id, nome, canali, zona")
      .eq("attivo", true)
      .order("nome");
    agenti = (r.data || []).map((a) => ({
      Agente_Id: a.agente_id,
      Nome: a.nome,
      Canali: a.canali || "",
      Zona: a.zona || "",
    }));
  } catch (_) {
    // senza anagrafica agenti il selettore resta vuoto, l'ordine si salva lo stesso
  }


  // Layer di ARRICCHIMENTO nostro: tipologia cliente (HORECA/FARMA/GDO) e campi
  // anagrafica completati a mano, indicizzati per chiave cliente (P.IVA o nome).
  // Si sovrappone allo snapshot/GAMMA senza toccare la fonte. Best-effort.
  const overridesClienti = {};
  try {
    // A PAGINE, come le destinazioni. Le anagrafiche corrette a mano sono 653 e
    // crescono ogni giorno: al millesimo PostgREST taglia senza dire niente e i
    // clienti oltre quella soglia si ritroverebbero l'anagrafica vuota, agente e
    // sconti compresi. Il taglio non da' errore, quindi non si vedrebbe finche'
    // qualcuno non se ne accorge su un DDT.
    const PAGINA = 1000;
    for (let da = 0; ; da += PAGINA) {
      const { data, error } = await supabase
        .from("clienti_override")
        .select("*")
        .order("chiave")
        .range(da, da + PAGINA - 1);
      if (error) {
        console.warn("clienti_override:", error.message);
        break;
      }
      for (const r of data || []) {
        if (r && r.chiave) overridesClienti[String(r.chiave)] = r;
      }
      if (!data || data.length < PAGINA) break;
    }
  } catch (_) {
    // tabella non ancora creata: nessun override
  }

  // Destinazioni merci: un cliente puo' avere piu' punti di consegna (3-4
  // negozi), e chi spedisce deve poter scegliere dove mandare la merce
  // (regola di Luca 03/08/2026). Solo quelle attive, gia' con le righe
  // composte pronte da stampare sul DDT.
  const destinazioni = {};
  try {
    // A PAGINE. PostgREST taglia a 1000 righe senza dire niente: le
    // destinazioni sono gia' 1.519, e senza paginare i clienti oltre il
    // millesimo restavano senza indirizzo di consegna. Il taglio e' silenzioso,
    // quindi non si vede finche' qualcuno non se ne accorge sul campo.
    const PAGINA = 1000;
    for (let da = 0; ; da += PAGINA) {
      const { data, error: errDest } = await supabase
        .from("v_destinazioni")
        .select("*")
        .order("codice_cliente")
        .order("predefinita", { ascending: false })
        .order("etichetta")
        .range(da, da + PAGINA - 1);
      if (errDest) {
        console.warn("v_destinazioni:", errDest.message, errDest.hint || "");
        break;
      }
      for (const d of data || []) {
        const k = String(d.codice_cliente || "");
        if (!k) continue;
        (destinazioni[k] = destinazioni[k] || []).push(d);
      }
      if (!data || data.length < PAGINA) break;
    }
  } catch (e) {
    // vista non ancora creata: si va avanti con l'indirizzo unico di prima
    console.warn("destinazioni non caricate:", e);
  }

  return { ...vivo, clienti, agenti, overridesClienti, destinazioni };
}


// ---------- action handlers ----------

// La stessa forma canonica dei metodi di pagamento che usa App.jsx, e la stessa
// data di allineamento. E' l'unica cosa duplicata fra i due file, e sta qui
// perche' il cancello dell'archiviazione deve reggere anche quando parte da solo
// dopo la mezzanotte, senza nessuna interfaccia davanti. Se cambia una lista,
// cambia l'altra: il database rifiuta comunque i metodi che non sa leggere
// (imposta_metodo_pagamento), quindi una divergenza si vede subito.
const METODI_PAGAMENTO_CANONICI = new Set([
  "Contrassegno contanti", "Contrassegno assegno",
  "Ri.Ba. 30 gg data fattura", "Ri.Ba. 30 gg fine mese",
  "Ri.Ba. 60 gg data fattura", "Ri.Ba. 60 gg fine mese",
  "Ri.Ba. 90 gg data fattura", "Ri.Ba. 90 gg fine mese",
  "Bonifico anticipato", "Bonifico alla consegna", "Bonifico fine mese",
  "Bonifico 30 gg data fattura", "Bonifico 30 gg fine mese",
  "Bonifico 60 gg data fattura", "Bonifico 60 gg fine mese",
  "Bonifico 90 gg data fattura", "Bonifico 90 gg fine mese",
  "Assegno", "Carta di credito", "Carta / POS",
]);
const PAGAMENTI_ALLINEATI_DAL_ADAPTER = "2026-08-03";
const COLLI_CONFERMATI_DAL_ADAPTER = "2026-08-17";

async function archivePreparedOrders() {
  // REGOLA: gli ordini preparati NON si archiviano subito. Si archiviano solo
  // alla prima esecuzione del bulk-load successiva alla mezzanotte locale: in
  // pratica, oggi gli ordini preparati restano visibili nella tab "Preparati";
  // domani mattina, alla prima apertura dell'app, finiscono in Archivio.
  // Filtro: stato preparato + non archiviato + data_preparato < mezzanotte di oggi.
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  const midnightIso = midnight.toISOString();

  const { data, error } = await supabase
    .from("ordini")
    // id_cliente DEVE esserci: senza, il ripiego sul metodo dell'anagrafica
    // era morto (codiciCandidati sempre vuoto) e un ordine col metodo grezzo
    // restava in Preparati anche col cliente corretto. BIOCELIA, 27/08/2026:
    // "TRANSFER" sull'ordine, "Bonifico 30 gg fine mese" sul cliente, e il
    // cancello la segnalava lo stesso.
    .select("id_ordine, id_cliente, stato, archiviato, data_preparato, data_ordine, metodo_pagamento, campionatura, totale_imponibile, colli, ddt_numero")
    .or("archiviato.is.null,archiviato.eq.false")
    .lt("data_preparato", midnightIso);
  if (error) return failure(error);

  // Solo i PREPARATO si auto-archiviano a mezzanotte. Gli SPEDITI restano
  // nella loro sezione finche' non si preme Archivia (richiesta Luca: la
  // vista degli ordini usciti deve restare consultabile, es. review col team).
  // CHI E' STATO TIRATO INDIETRO A MANO RESTA DOV'E' (Luca 21/08/2026).
  // Il corriere non e' passato a caricare, i DDT della notte sono stati riportati
  // in Preparati perche' la merce e' ancora qui, e trentasette secondi dopo
  // questa funzione ne ha ri-archiviati cinque da sola: gira a ogni apertura
  // dell'app e vedeva solo "preparato di ieri, quindi archivialo".
  //
  // Il segno di riconoscimento non ha avuto bisogno di una colonna nuova: il
  // numero di DDT lo stacca SOLO l'archiviazione. Un ordine che ha un numero ma
  // non e' archiviato e' quindi un ordine che qualcuno ha deliberatamente tirato
  // indietro. Tornera' in archivio quando lo si archivia davvero, con il numero
  // che ha gia': la numerazione non fa buchi.
  // La stessa guardia sta nel lavoro notturno del database
  // (archive_old_prepared_orders), che e' l'altra strada per cui passa.
  const candidati = (data || []).filter(
    (r) =>
      String(r.stato || "").trim().toLowerCase() === "preparato" &&
      String(r.ddt_numero || "").trim() === ""
  );

  // IL CANCELLO DEL PAGAMENTO, e sta QUI e non solo sul bottone.
  // Questa funzione non la chiama solo chi premo "Archivia": parte da sola alla
  // prima apertura dopo la mezzanotte. Archiviare apre la partita a Cashflow, e
  // se il metodo di pagamento non e' leggibile la scadenza nasce STIMATA, cioe'
  // un incasso che nessuno aspetta al giorno giusto. Senza il controllo qui,
  // stanotte quelle scadenze sarebbero nate da sole, senza che nessuno scegliesse
  // (Luca 06/08/2026: "metti in modo tale che debba essere inserito bene").
  //
  // Gli ordini scoperti non si perdono: restano in "Preparati" col bollino 💸
  // rosso, e si archiviano appena qualcuno mette il metodo giusto.
  // Il metodo NON si chiede due volte: se l'ordine non ne porta uno leggibile
  // vale quello scritto sull'anagrafica del cliente (Luca 06/08/2026). Qui si
  // rifa' lo stesso giro di metodo_pagamento_effettivo() sul database: codice
  // cliente -> P.IVA dal registro -> anagrafica indicizzata per 'piva:<numero>'.
  const metodiCliente = {};
  const codiciCandidati = [...new Set(candidati.map((r) => String(r.id_cliente || "")).filter(Boolean))];
  if (codiciCandidati.length) {
    try {
      const mstR = await selectIn("clienti_master", "codice", codiciCandidati, "codice,piva");
      const chiavi = [...new Set(
        (mstR || []).map((m) => "piva:" + String(m.piva || "").replace(/\D/g, "")).filter((k) => k !== "piva:")
      )];
      const perCodice = {};
      for (const m of mstR || []) {
        perCodice[String(m.codice)] = "piva:" + String(m.piva || "").replace(/\D/g, "");
      }
      if (chiavi.length) {
        const ovR = await selectIn("clienti_override", "chiave", chiavi, "chiave,metodo_pagamento");
        const perChiave = {};
        for (const o of ovR || []) perChiave[String(o.chiave)] = String(o.metodo_pagamento || "").trim();
        for (const [cod, ch] of Object.entries(perCodice)) metodiCliente[cod] = perChiave[ch] || "";
      }
    } catch (e) {
      // Se le anagrafiche non si leggono si resta prudenti: senza il metodo del
      // cliente qualche ordine resta in Preparati, che e' il male minore.
      console.warn("archiviazione: anagrafiche non lette", e);
    }
  }

  const scoperti = [];
  const senzaColli = [];
  const prezzoTradito = [];
  // Chi ha prezzi diversi da quelli concordati dall'agente: lo dice il
  // guardiano nel database, cosi' la regola e' una sola.
  const traditi = new Set();
  try {
    const tr = await supabase
      .from("v_ordini_prezzo_tradito")
      .select("id_ordine, scarto_totale");
    for (const t of tr.data || []) {
      if (Math.abs(Number(t.scarto_totale || 0)) > 0.5) traditi.add(String(t.id_ordine));
    }
  } catch (_) {
    // guardiano non raggiungibile: non si blocca l'archiviazione per questo,
    // il cancello del database interviene comunque.
  }
  const toArchive = [];
  for (const r of candidati) {
    const data0 = String(r.data_ordine || r.data_preparato || "").slice(0, 10);
    const daAllineare = !data0 || data0 >= PAGAMENTI_ALLINEATI_DAL_ADAPTER;
    const suOrdine = String(r.metodo_pagamento || "").trim();
    const suCliente = String(metodiCliente[String(r.id_cliente || "")] || "").trim();
    const leggibile =
      METODI_PAGAMENTO_CANONICI.has(suOrdine) || METODI_PAGAMENTO_CANONICI.has(suCliente);
    // Campionatura gratuita: niente da incassare, quindi il cancello non si
    // applica (Luca 11/08/2026). A imponibile zero non c'e' nessuna scadenza da
    // sbagliare, e chiedere il metodo le terrebbe bloccate per sempre.
    const campionaturaGratis =
      r.campionatura === true && Number(r.totale_imponibile || 0) === 0;
    if (daAllineare && !leggibile && !campionaturaGratis) {
      scoperti.push(r.id_ordine);
      continue;
    }
    // I COLLI SI CONFERMANO (Luca 17/08/2026). Il numero automatico e' la somma
    // delle quantita' di riga, cioe' pezzi, non scatole: se nessuno lo conferma
    // in bolla finisce un conteggio che nessuno ha guardato, ed e' il numero su
    // cui il corriere fattura. Anche questo cancello sta QUI e non solo sul
    // bottone, perche' l'archiviazione parte da sola dopo la mezzanotte.
    // Vale dagli ordini di oggi in poi: gli archiviati di prima restano come
    // sono, sono due terzi e riaprirli non servirebbe a nessuno.
    if (data0 >= COLLI_CONFERMATI_DAL_ADAPTER && (r.colli === null || r.colli === undefined)) {
      senzaColli.push(r.id_ordine);
      continue;
    }
    // IL PREZZO CONCORDATO DALL'AGENTE E' UN ACCORDO COL CLIENTE. Se quello
    // scritto nel magazzino non coincide, l'ordine resta fra i Preparati:
    // archiviarlo vorrebbe dire emettere un documento con un prezzo che il
    // cliente non ha mai accettato (Il Celiaco, DDT 1908: 43 EUR in piu').
    // Anche qui il controllo sta nell'adapter E nel database, perche'
    // l'archiviazione notturna parte da sola.
    if (traditi.has(String(r.id_ordine))) {
      prezzoTradito.push(r.id_ordine);
      continue;
    }
    toArchive.push(r.id_ordine);
  }

  if (prezzoTradito.length) {
    console.warn(
      `Archiviazione: ${prezzoTradito.length} ordini restano in Preparati, prezzi diversi da quelli concordati dall'agente`,
      prezzoTradito
    );
  }

  if (senzaColli.length) {
    console.warn(
      `Archiviazione: ${senzaColli.length} ordini restano in Preparati, colli da confermare`,
      senzaColli
    );
  }

  if (scoperti.length) {
    console.warn(
      `Archiviazione: ${scoperti.length} ordini restano in Preparati, metodo di pagamento da sistemare`,
      scoperti
    );
  }

  if (toArchive.length === 0) {
    return { success: true, archiviati: 0, scopertiPagamento: scoperti.length };
  }

  const up = await supabase
    .from("ordini")
    .update({ archiviato: true })
    .in("id_ordine", toArchive);
  if (up.error) return failure(up.error);
  return { success: true, archiviati: toArchive.length, scopertiPagamento: scoperti.length };
}

const OUTSIDE_STOCK_LOT = "FUORI_MAGAZZINO";
// Codici HORECA senza lotto: articolo di magazzino movimentato senza lotto.
// Come il fuori magazzino non passa dalla rpc (non c'e' un lotto reale), ma
// conserva il productId reale perche' resta un articolo di magazzino.
const NO_LOT_MARK = "SENZA_LOTTO";

// Righe senza lotto reale (fuori magazzino / articolo libero, oppure codice
// HORECA senza lotto). Non hanno un lotto reale su cui movimentare: l'assegna-
// zione marca la riga come evasa cosi' l'ordine si puo' chiudere. Non passa
// dalla rpc assegna_lotto (che pretende il lotto): scrive direttamente
// l'assegnazione e aggiorna il totale sulla riga.
async function assignOutsideStock({ idRiga, idProdotto, quantita, operatore, lotMark = OUTSIDE_STOCK_LOT }) {
  // Idempotente come la rpc: una sola assegnazione senza lotto per riga.
  const { data: esist } = await supabase
    .from("assegnazioni_lotti")
    .select("id_assegnazione")
    .eq("id_riga", String(idRiga))
    .eq("id_lotto", lotMark)
    .maybeSingle();

  const row = {
    id_riga: String(idRiga),
    id_lotto: lotMark,
    id_prodotto: String(idProdotto || ""),
    codice_lotto: lotMark,
    lotto: lotMark,
    quantita_assegnata: quantita,
    data_ora: new Date().toISOString(),
    operatore: String(operatore || ""),
  };

  let result;
  if (esist) {
    result = await supabase
      .from("assegnazioni_lotti")
      .update(row)
      .eq("id_assegnazione", esist.id_assegnazione)
      .select()
      .maybeSingle();
  } else {
    row.id_assegnazione = `ASS-${Date.now()}`;
    result = await supabase.from("assegnazioni_lotti").insert(row).select().maybeSingle();
  }
  if (result.error) return failure(result.error);

  // Aggiorna quantita_assegnata sulla riga = somma delle assegnazioni.
  const { data: sommaRows } = await supabase
    .from("assegnazioni_lotti")
    .select("quantita_assegnata")
    .eq("id_riga", String(idRiga));
  const somma = (sommaRows || []).reduce((s, r) => s + Number(r.quantita_assegnata || 0), 0);
  await supabase.from("righe_ordine").update({ quantita_assegnata: somma }).eq("id_riga", String(idRiga));

  const data = result.data;
  return { success: true, assignmentId: data?.id_assegnazione || null, row: data };
}

async function assignLot(params) {
  const p = parsePayload(params);
  const idRiga = p.lineId || p.idRiga || p.ID_Riga;
  const idLotto = p.lotId || p.idLotto || p.ID_Lotto;
  const quantita = Number(p.qty ?? p.quantita ?? 0);
  const operatore = p.operatore || "";
  const allowNegative = !!(p.allowNegative ?? p.allow_negative);

  if (!idRiga || !idLotto || !quantita) {
    return { success: false, error: "Parametri mancanti per assignLot" };
  }

  // Guardia FK: la riga deve esistere davvero in righe_ordine, altrimenti
  // l'insert nell'assegnazione viola il vincolo id_riga (errore criptico).
  // Capita con schermate rimaste aperte mentre l'ordine cambiava altrove o con
  // una riga aggiunta al volo non salvata. Diamo un messaggio chiaro e gestibile.
  const rigaCheck = await supabase
    .from("righe_ordine")
    .select("id_riga")
    .eq("id_riga", String(idRiga))
    .maybeSingle();
  if (rigaCheck.error) return failure(rigaCheck.error);
  if (!rigaCheck.data) {
    return {
      success: false,
      code: "RIGA_INESISTENTE",
      error:
        "Questa riga d'ordine non risulta più salvata (l'ordine è stato aggiornato altrove). " +
        "Premi Aggiorna / ricarica l'ordine e riprova l'assegnazione.",
    };
  }

  // Senza lotto reale, nessuna rpc: fuori magazzino/articolo libero, oppure
  // codice HORECA movimentato senza lotto.
  const idProdotto = p.productId || p.idProdotto || p.ID_Prodotto || "";
  const isOutside =
    String(idLotto) === OUTSIDE_STOCK_LOT ||
    String(idProdotto).startsWith(OUTSIDE_STOCK_LOT);
  const isNoLot = String(idLotto) === NO_LOT_MARK;
  if (isOutside || isNoLot) {
    return await assignOutsideStock({
      idRiga,
      idProdotto,
      quantita,
      operatore,
      lotMark: isNoLot ? NO_LOT_MARK : OUTSIDE_STOCK_LOT,
    });
  }

  // Sempre via rpc (atomica, con lock del lotto). allowNegative passa il flag
  // p_allow_negative=true alla rpc, che salta il check disponibilita.
  //
  // p_aggiungi: assegnare due volte lo STESSO lotto sulla stessa riga deve
  // SOMMARE (Luca 26/08/2026: due chip "2608236 x1" e "2608236 x2" a schermo,
  // ma nel database una riga sola da 2, e l'ordine non si preparava). Chi
  // manda gia' il totale calcolato (il "lotto al volo") passa aggiungi=false;
  // chi manda la quantita' nuova - cioe' i due flussi normali - passa true.
  const aggiungi = p.aggiungi === undefined ? true : !!p.aggiungi;
  const { data, error } = await supabase.rpc("assegna_lotto", {
    p_id_riga: String(idRiga),
    p_id_lotto: String(idLotto),
    p_quantita: quantita,
    p_operatore: String(operatore),
    p_aggiungi: aggiungi,
    p_allow_negative: !!allowNegative,
  });
  if (error) return failure(error);
  const row = Array.isArray(data) ? data[0] : data;
  return {
    success: true,
    assignmentId: row?.id_assegnazione || row?.ID_Assegnazione || null,
    row,
  };
}

// Disarchiviare non si fa piu' (regola di Luca 03/08/2026): un ordine
// archiviato ha il DDT emesso, che e' un documento fiscale. Il divieto vero sta
// nel database (sql/ddt_alla_spedizione.sql); questa resta solo per rispondere
// con una frase comprensibile a chi la chiama ancora, invece di far arrivare
// l'errore grezzo di Postgres a video.
async function unarchiveOrder() {
  return {
    success: false,
    error:
      "L'ordine e' archiviato e il documento di trasporto e' gia' stato emesso: " +
      "non si puo' disarchiviare. I dati restano modificabili fino all'invio a Sibill.",
  };
}

async function updateOrder(params) {
  const p = parsePayload(params);
  const idOrdine = p.orderId || p.idOrdine || p.ID_Ordine;
  if (!idOrdine) return { success: false, error: "orderId mancante" };

  const patch = {};
  if (p.customer !== undefined) patch.cliente = p.customer;
  if (p.cliente !== undefined) patch.cliente = p.cliente;
  if (p.clienteId !== undefined) patch.id_cliente = p.clienteId ? String(p.clienteId) : null;
  if (p.idCliente !== undefined) patch.id_cliente = p.idCliente ? String(p.idCliente) : null;
  if (p.id_cliente !== undefined) patch.id_cliente = p.id_cliente ? String(p.id_cliente) : null;
  if (p.notes !== undefined) patch.note = p.notes;
  if (p.note !== undefined) patch.note = p.note;
  if (p.cap !== undefined) patch.cap = p.cap ? String(p.cap).trim() : null;
  if (p.colli !== undefined) {
    // colli "" significa "ripristina default" (campo nullable).
    patch.colli = p.colli === "" || p.colli === null ? null : Number(p.colli);
  }
  if (p.campionatura !== undefined) patch.campionatura = !!p.campionatura;
  if (p.pedana_frozen !== undefined || p.pedanaFrozen !== undefined) {
    patch.pedana_frozen = !!(p.pedana_frozen !== undefined ? p.pedana_frozen : p.pedanaFrozen);
  }
  if (p.nota_ddt !== undefined || p.notaDdt !== undefined) {
    const v = p.nota_ddt !== undefined ? p.nota_ddt : p.notaDdt;
    patch.nota_ddt = String(v ?? "").trim() || null;
  }
  if (p.id_destinazione !== undefined) {
    patch.id_destinazione = p.id_destinazione ? String(p.id_destinazione) : null;
  }
  if (p.peso_manuale !== undefined) {
    // Come i colli: "" vuol dire "torna a calcolarlo tu".
    patch.peso_manuale =
      p.peso_manuale === "" || p.peso_manuale === null ? null : Number(p.peso_manuale);
  }
  if (p.data_ordine !== undefined) patch.data_ordine = p.data_ordine || null;
  if (p.date !== undefined) patch.data_ordine = p.date || null;
  if (p.stato !== undefined) patch.stato = p.stato;
  if (p.status !== undefined) patch.stato = p.status;
  if (p.stato_lavorazione !== undefined) patch.stato_lavorazione = p.stato_lavorazione;
  if (p.workStatus !== undefined) patch.stato_lavorazione = p.workStatus;
  if (p.statoPagamento !== undefined) patch.stato_pagamento = p.statoPagamento || null;
  if (p.paymentStatus !== undefined) patch.stato_pagamento = p.paymentStatus || null;
  if (p.corriere !== undefined) patch.corriere = p.corriere;
  if (p.ddt_numero !== undefined) patch.ddt_numero = p.ddt_numero;
  // Regime IVA: split payment ed esteri non sono aliquote, valgono per tutto
  // il documento e azzerano l'imposta.
  const regime = p.regimeIva ?? p.regime_iva;
  if (regime !== undefined) patch.regime_iva = regime || null;
  // L'agente si puo' assegnare o correggere anche dopo aver creato l'ordine.
  if (p.agenteId !== undefined) patch.agente_id = p.agenteId || null;
  if (p.agenteNome !== undefined) patch.agente_nome = p.agenteNome || null;

  if (Object.keys(patch).length === 0) return { success: true };

  const { data, error } = await supabase
    .from("ordini")
    .update(patch)
    .eq("id_ordine", String(idOrdine))
    .select()
    .maybeSingle();
  if (error) return failure(error);
  // Se e' cambiato lo stato (es. Spedito / Preparato / Fermo), avvisa l'app agenti.
  if (patch.stato) await notificaStatoAgenti(idOrdine, patch.stato);
  return { success: true, ordine: data };
}

async function markOrderViewed(params) {
  const idOrdine = params.orderId || params.idOrdine;
  if (!idOrdine) return { success: false, error: "orderId mancante" };

  // (lower(btrim(stato_lavorazione))='nuovo' OR is null) → filtro app-side.
  const { data, error } = await supabase
    .from("ordini")
    .select("id_ordine, stato_lavorazione")
    .eq("id_ordine", String(idOrdine))
    .maybeSingle();
  if (error) return failure(error);
  if (!data) return { success: true };

  const sl = String(data.stato_lavorazione || "").trim().toLowerCase();
  if (sl !== "nuovo" && sl !== "") return { success: true };

  const up = await supabase
    .from("ordini")
    .update({ stato_lavorazione: "In lavorazione" })
    .eq("id_ordine", String(idOrdine));
  if (up.error) return failure(up.error);
  return { success: true };
}

async function archiveOrder(params) {
  const idOrdine = params.orderId || params.idOrdine;
  if (!idOrdine) return { success: false, error: "orderId mancante" };
  const { error } = await supabase
    .from("ordini")
    .update({ archiviato: true })
    .eq("id_ordine", String(idOrdine));
  if (error) return failure(error);
  return { success: true };
}

// PONTE VERSO L'APP AGENTI: quando il magazzino fa avanzare un ordine nato
// dall'app agenti, scriviamo lo stato indietro su ordini_agenti in un campo
// DEDICATO (stato_magazzino) per non toccare 'stato', che l'app agenti usa per
// la sua logica (Ordinato / Da controllare / Importato / Annullato).
// Best-effort e silenzioso: se la colonna non c'e', il flusso magazzino continua.
async function notificaStatoAgenti(idOrdineMagazzino, statoMagazzino) {
  if (!idOrdineMagazzino || !statoMagazzino) return;
  try {
    await supabase
      .from("ordini_agenti")
      .update({
        stato_magazzino: String(statoMagazzino),
        aggiornato_magazzino_il: new Date().toISOString(),
      })
      .eq("id_ordine_magazzino", String(idOrdineMagazzino));
  } catch (_) {
    // colonna non ancora creata o tabella assente: nessun impatto sul magazzino
  }
}

// Errore Postgres "colonna inesistente" (schema non ancora migrato).
const isMissingColumn = (err, col) =>
  !!err && /column/i.test(String(err.message || "")) && String(err.message || "").includes(col);

async function markOrderStopped(params) {
  const p = parsePayload(params);
  const idOrdine = p.orderId || p.idOrdine || params.orderId || params.idOrdine;
  if (!idOrdine) return { success: false, error: "orderId mancante" };
  const motivo = String(p.motivo ?? p.motivoFermo ?? "").trim();
  // Lo stato "Fermo" e' derivato dalla colonna stato (il frontend guarda
  // stato === 'fermo'). Va scritto anche stato, non solo stato_lavorazione,
  // altrimenti al refresh l'ordine ricarica come "Da preparare" e ricompare
  // tra gli ordini da evadere.
  const base = { stato: "Fermo", stato_lavorazione: "Fermato" };
  const { error } = await supabase
    .from("ordini")
    .update(motivo ? { ...base, motivo_fermo: motivo } : base)
    .eq("id_ordine", String(idOrdine));
  if (error) {
    // Colonna motivo_fermo non ancora creata: salva lo stato comunque (il
    // motivo lo riproviamo a parte, cosi' l'ordine non resta non-fermo).
    if (motivo && isMissingColumn(error, "motivo_fermo")) {
      const retry = await supabase
        .from("ordini")
        .update(base)
        .eq("id_ordine", String(idOrdine));
      if (retry.error) return failure(retry.error);
      await notificaStatoAgenti(idOrdine, "Fermo");
      return {
        success: true,
        warning:
          "Ordine messo in fermo, ma il motivo non e' stato salvato: manca la colonna motivo_fermo (esegui sql/motivo_fermo.sql).",
      };
    }
    return failure(error);
  }
  // L'agente vede che l'ordine e' fermo E perche' (utile per avvisare il cliente).
  await notificaStatoAgenti(idOrdine, motivo ? `Fermo: ${motivo}` : "Fermo");
  return { success: true };
}

// Aggiorna (o cancella) il motivo del fermo su un ordine gia' fermo.
async function setMotivoFermo(params) {
  const p = parsePayload(params);
  const idOrdine = p.orderId || p.idOrdine;
  if (!idOrdine) return failure("orderId mancante");
  const motivo = String(p.motivo ?? "").trim();
  const { error } = await supabase
    .from("ordini")
    .update({ motivo_fermo: motivo || null })
    .eq("id_ordine", String(idOrdine));
  if (error) {
    if (isMissingColumn(error, "motivo_fermo")) {
      return failure(
        "Manca la colonna motivo_fermo sul database: esegui sql/motivo_fermo.sql nel SQL editor di Supabase."
      );
    }
    return failure(error);
  }
  return { success: true };
}

async function reopenOrder(params) {
  const idOrdine = params.orderId || params.idOrdine;
  if (!idOrdine) return { success: false, error: "orderId mancante" };

  // Se l'ordine aveva lo stock gia' scalato (preparato, o spedito che e' lo
  // stato successivo), lo ripristino: somma delle assegnazioni per lotto,
  // rincrementata su lotti.quantita_caricata. Comportamento simmetrico a
  // deleteOrder: l'ordine torna "Da preparare" e il magazzino vede lo stock
  // come prima della preparazione.
  const ordR = await supabase
    .from("ordini")
    .select("stato")
    .eq("id_ordine", String(idOrdine))
    .maybeSingle();
  if (ordR.error) return failure(ordR.error);
  const wasPreparato = stockScalato(ordR.data?.stato);

  const stockMovements = [];

  if (wasPreparato) {
    const righeR = await supabase
      .from("righe_ordine")
      .select("id_riga")
      .eq("id_ordine", String(idOrdine));
    if (righeR.error) return failure(righeR.error);
    const righeIds = (righeR.data || []).map((r) => r.id_riga);

    if (righeIds.length > 0) {
      const assR = await supabase
        .from("assegnazioni_lotti")
        .select("id_lotto, quantita_assegnata")
        .in("id_riga", righeIds);
      if (assR.error) return failure(assR.error);

      const sumByLot = {};
      for (const a of assR.data || []) {
        const k = String(a.id_lotto);
        sumByLot[k] = (sumByLot[k] || 0) + Number(a.quantita_assegnata || 0);
      }

      for (const [lotId, qty] of Object.entries(sumByLot)) {
        const curLotR = await supabase
          .from("lotti")
          .select("quantita_caricata")
          .eq("id_lotto", lotId)
          .maybeSingle();
        if (curLotR.error || !curLotR.data) continue;
        const newQty = Number(curLotR.data.quantita_caricata || 0) + qty;
        const updR = await supabase
          .from("lotti")
          .update({ quantita_caricata: newQty })
          .eq("id_lotto", lotId);
        if (updR.error) return failure(updR.error);
        stockMovements.push({ lotId, newQty });
      }
    }
  }

  // L'ordine torna in lavorazione: il motivo del fermo non serve piu'.
  const riapri = {
    stato: "Da preparare",
    data_preparato: null,
    stato_lavorazione: "In lavorazione",
  };
  let { error } = await supabase
    .from("ordini")
    .update({ ...riapri, motivo_fermo: null })
    .eq("id_ordine", String(idOrdine));
  if (error && isMissingColumn(error, "motivo_fermo")) {
    const retry = await supabase
      .from("ordini")
      .update(riapri)
      .eq("id_ordine", String(idOrdine));
    error = retry.error;
  }
  if (error) return failure(error);
  return { success: true, stockMovements, orderReopened: true };
}

async function markOrderPrepared(params) {
  const idOrdine = params.orderId || params.idOrdine;
  if (!idOrdine) return { success: false, error: "orderId mancante" };

  // 1) Raccolgo gli id_lotto coinvolti PRIMA della rpc (due step, niente !inner).
  const righeR = await supabase
    .from("righe_ordine")
    .select("id_riga")
    .eq("id_ordine", String(idOrdine));
  if (righeR.error) return failure(righeR.error);
  const righeIds = (righeR.data || []).map((r) => r.id_riga);

  let lotIdsUsati = [];
  if (righeIds.length > 0) {
    const assR = await supabase
      .from("assegnazioni_lotti")
      .select("id_lotto")
      .in("id_riga", righeIds);
    if (assR.error) return failure(assR.error);
    lotIdsUsati = Array.from(new Set((assR.data || []).map((a) => String(a.id_lotto))));
  }

  // 2) Eseguo la rpc.
  const { data, error } = await supabase.rpc("prepara_ordine", {
    p_id_ordine: String(idOrdine),
  });
  if (error) return failure(error);
  const row = Array.isArray(data) ? data[0] : data;

  // 3) Re-fetch quantita_caricata aggiornata SOLO dei lotti usati.
  let stockMovements = [];
  if (lotIdsUsati.length > 0) {
    const lottiR = await supabase
      .from("lotti")
      .select("id_lotto, quantita_caricata")
      .in("id_lotto", lotIdsUsati);
    if (lottiR.error) return failure(lottiR.error);
    stockMovements = (lottiR.data || []).map((l) => ({
      lotId: String(l.id_lotto),
      newQty: Number(l.quantita_caricata ?? 0),
    }));
  }

  // Avvisa l'app agenti che l'ordine e' stato preparato.
  await notificaStatoAgenti(idOrdine, "Preparato");
  return { success: true, ordine: row, stockMovements, stockWarnings: [] };
}

// Registra un cliente nuovo nel registro unico e restituisce il suo codice.
// Serve quando si carica un ordine per un cliente che non e' ancora in
// anagrafica: invece di lasciare l'ordine senza codice (e sparire dal CRM),
// il cliente entra nel registro e il codice esiste da subito.
async function registraClienteRegistro(params) {
  const p = parsePayload(params);
  const ragione = String(p.ragioneSociale || p.cliente || p.customer || "").trim();
  if (!ragione) return { ok: false, error: "ragione sociale mancante" };
  try {
    const { data, error } = await supabase.rpc("nuovo_cliente_registro", {
      p_ragione_sociale: ragione,
      p_citta: p.citta || null,
      p_provincia: p.provincia || null,
      p_piva: p.piva || null,
      p_telefono: p.telefono || null,
      p_email: p.email || null,
      p_origine: p.origine || "magazzino",
    });
    if (error) return failure(error);
    return { ok: true, success: true, codice: data };
  } catch (e) {
    return failure(e);
  }
}

// Trova il codice di un cliente gia' nel registro, per nome esatto.
// "IL MELOGRANO S.R.L. · PALMANOVA" e "Il Melograno S.r.l." collassano uguali.
async function cercaCodiceRegistro(nome) {
  const k = String(nome || "").split("·")[0].trim();
  if (!k) return "";
  const { data } = await supabase
    .from("clienti_master")
    .select("codice, ragione_sociale")
    .ilike("ragione_sociale", k)
    .limit(2);
  if (data && data.length === 1) return String(data[0].codice);
  return "";
}

async function createOrder(params) {
  const p = parsePayload(params);
  const idOrdine = p.id || p.idOrdine || p.orderId || `ORD-${Date.now()}`;
  const cliente = p.customer || p.cliente || "";
  let idCliente = p.clienteId || p.idCliente || p.id_cliente || "";

  // Ogni ordine deve portare il codice cliente: e' il filo che tiene insieme
  // magazzino, CRM e fatturazione. Se chi carica ha scritto solo il nome,
  // NON blocchiamo (regola di Luca: segnala ma vai avanti): cerchiamo il
  // cliente nel registro e, se non c'e', lo registriamo al volo prendendo il
  // codice che torna. L'ordine parte comunque, ma con il codice attaccato.
  if (!idCliente && cliente) {
    try {
      idCliente = await cercaCodiceRegistro(cliente);
      if (!idCliente) {
        const r = await registraClienteRegistro({
          ragioneSociale: String(cliente).split("·")[0].trim(),
          citta: p.citta || null,
          piva: p.piva || null,
          origine: "magazzino",
        });
        if (r.ok && r.codice) idCliente = String(r.codice);
      }
    } catch (_) {
      // Registro non raggiungibile: l'ordine si salva lo stesso, senza codice.
      // Meglio un ordine senza codice che un ordine perso.
    }
  }
  const note = p.notes || p.note || "";
  // Mai null: un ordine senza data non riesce ad archiviarsi (il Cashflow ci
  // calcola la scadenza sopra e la vuole per forza), e l'errore che si vede a
  // video parla di una tabella che con l'ordine non c'entra niente. Se chi
  // carica non la scrive, vale oggi.
  const dataOrdine = p.date || p.data_ordine || new Date().toISOString().slice(0, 10);
  const stato = p.status || p.stato || "Da preparare";
  const statoLav = p.workStatus || p.stato_lavorazione || "Nuovo";
  const cap = (p.cap ?? p.Cap ?? "") ? String(p.cap ?? p.Cap).trim() : null;

  const insOrder = await supabase
    .from("ordini")
    .insert({
      id_ordine: String(idOrdine),
      cliente,
      id_cliente: idCliente ? String(idCliente) : null,
      note,
      data_ordine: dataOrdine,
      stato,
      stato_lavorazione: statoLav,
      cap,
      archiviato: false,
      ...(p.agenteId ? { agente_id: String(p.agenteId) } : {}),
      ...(p.agenteNome ? { agente_nome: String(p.agenteNome) } : {}),
      ...(p.listino ? { listino: String(p.listino) } : {}),
      // PEDANA SURGELATA: la merce viaggia a -18 con Stef surgelati, non a collo
      // nel poly box. Decide la temperatura di spedizione, quindi quali corrieri
      // il motore puo' proporre (Luca 17/08/2026).
      ...(p.pedanaFrozen ? { pedana_frozen: true } : {}),
      ...(p.scontoClientePct === undefined || p.scontoClientePct === null
        ? {}
        : { sconto_cliente_pct: Number(p.scontoClientePct) }),
    })
    .select()
    .maybeSingle();
  if (insOrder.error) return failure(insOrder.error);

  const linesIn = Array.isArray(p.lines) ? p.lines : [];
  const righe = linesIn.map((line, i) => {
    const lineId = line.lineId || line.idRiga || line.ID_Riga || `RIGA-${Date.now()}-${i}`;
    const productId = line.productId || line.idProdotto || line.ID_Prodotto;
    const descrizione = line.productName || line.descrizione || line.Descrizione_Prodotto || "";
    const qtaOrdinata = Number(line.qtyOrdered ?? line.quantita ?? line.Quantita_Ordinata ?? 0);
    const ordineRiga = Number(line.rowOrder ?? line.ordineRiga ?? line.Ordine_Riga ?? i + 1);
    // Valorizzazione (facoltativa): se la riga porta un prezzo lo salviamo,
    // con lo sconto e l'indicazione di DOVE viene il numero (app, listino1,
    // listino8, dedicato, storico, manuale). Senza prezzo la riga resta com'e'.
    const prezzo = line.prezzoUnitario ?? line.prezzo_unitario;
    const sconto = line.scontoPct ?? line.sconto_pct;
    const origine = line.prezzoOrigine ?? line.prezzo_origine;
    return {
      id_riga: String(lineId),
      id_ordine: String(idOrdine),
      id_prodotto: String(productId),
      descrizione_prodotto: descrizione,
      quantita_ordinata: qtaOrdinata,
      quantita_assegnata: 0,
      ordine_riga: ordineRiga,
      ...(prezzo === undefined || prezzo === null
        ? {}
        : {
            prezzo_unitario: Number(prezzo),
            sconto_pct: Number(sconto || 0),
            iva_pct: Number(line.ivaPct ?? line.iva_pct ?? 4),
            natura_iva: line.naturaIva ?? line.natura_iva ?? null,
            prezzo_origine: origine || "manuale",
          }),
    };
  });

  let righeInserted = [];
  if (righe.length > 0) {
    const insR = await supabase.from("righe_ordine").insert(righe).select();
    if (insR.error) {
      // rollback best-effort dell'ordine.
      await supabase.from("ordini").delete().eq("id_ordine", String(idOrdine));
      return failure(insR.error);
    }
    righeInserted = insR.data || [];
  }

  // Imponibile dell'ordine dalle righe valorizzate (0 righe con prezzo -> resta
  // null: meglio "non valorizzato" che un falso zero).
  const conPrezzo = righe.filter((r) => r.prezzo_unitario != null);
  if (conPrezzo.length > 0) {
    await supabase
      .from("ordini")
      .update({ totale_imponibile: imponibileDaRighe(righe) })
      .eq("id_ordine", String(idOrdine));
  }

  return { success: true, idOrdine: String(idOrdine), righe: righeInserted };
}

// Log del carico di PRODUZIONE giornaliera: riga append-only in
// carichi_produzione (data, prodotto, lotto, scadenza, ct, kg). E' il dato
// reale di produzione letto dall'app margine (kg prodotti del mese). Distinto
// dai lotti (che scalano con l'evasione): qui la produzione lorda non cala mai.
// Best-effort: se la tabella non esiste ancora, il carico lotto resta valido.
async function logProduzione(params) {
  const p = parsePayload(params);
  const { error } = await supabase.from("carichi_produzione").insert({
    data: p.data || new Date().toISOString().slice(0, 10),
    id_prodotto: String(p.productId ?? ""),
    codice_prodotto: p.code || "",
    descrizione_prodotto: p.name || "",
    lotto: p.lot || "",
    scadenza: p.expiry || null,
    ct: Number(p.ct ?? p.quantita ?? 0),
    kg: Number(p.kg ?? 0),
    operatore: p.operatore || "",
  });
  if (error) return failure(error);
  return { success: true };
}

// Layer di arricchimento cliente: salva/aggiorna tipologia + campi anagrafica
// completati a mano. Upsert per chiave (P.IVA o nome normalizzato). Scrive solo
// i campi passati, cosi' un salvataggio parziale non cancella il resto.
const OVERRIDE_CLIENTE_FIELDS = [
  "ragione_sociale", "partita_iva", "sede_legale", "cap",
  // CITTA' E PROVINCIA: obbligatorie per lo SDI (Luca 21/08/2026). La fattura
  // elettronica vuole l'indirizzo completo, comune e sigla provincia compresi.
  // Le colonne c'erano gia' in clienti_override, ma non essendo nell'elenco non
  // venivano MAI salvate: il modulo poteva anche mostrarle, il salvataggio le
  // buttava via.
  "citta", "provincia",
  // Persona fisica: nome e cognome separati, che la fattura elettronica vuole
  // distinti (Luca 22/08/2026).
  "nome", "cognome",
  "indirizzo_spedizione", "insegna", "orari_consegna", "giorno_chiusura",
  "codice_univoco", "pec", "email", "telefono", "metodo_pagamento",
  "tipologia", "note",
  // L'agente e' un dato del cliente: si sceglie una volta e vale per tutti i
  // suoi ordini (Luca 04/08/2026).
  "agente_id", "agente_nome",
  // Come si valorizza: quale listino, e in che ordine si guardano listino e
  // storico (Luca 04/08 e 05/08/2026).
  "listino_standard", "fonte_prezzi",
];

// Gli sconti sono NUMERI e stanno fuori dal ciclo di sopra, che passa tutto da
// String(): "0" e' una stringa piena, quindi un cliente che azzera lo sconto
// se lo ritroverebbe scritto invece che cancellato. Vuoto vuol dire "non lo
// sappiamo" e lascia lavorare la rete di sicurezza; zero vuol dire "prezzo
// pieno, e' voluto". Sono due cose diverse e devono restare distinguibili.
const OVERRIDE_CLIENTE_SCONTI = ["sconto1_pct", "sconto2_pct", "sconto3_pct"];

async function saveClienteOverride(params) {
  const p = parsePayload(params);
  const chiave = String(p.chiave || "").trim();
  if (!chiave) return failure("chiave cliente mancante");
  const row = { chiave };
  for (const f of OVERRIDE_CLIENTE_FIELDS) {
    if (p[f] !== undefined) row[f] = p[f] === null ? null : String(p[f]);
  }
  // Fuori dal ciclo perche' e' un booleano: passato da String() diventerebbe
  // "false", che in JavaScript e' vero. Un cliente si ritroverebbe i prezzi
  // sul documento proprio dopo averli tolti.
  if (p.ddt_con_prezzi !== undefined) row.ddt_con_prezzi = !!p.ddt_con_prezzi;
  // UNA PERSONA NON E' UN'AZIENDA. Cambia la struttura della fattura
  // elettronica: Nome e Cognome al posto della Denominazione, e solo il codice
  // fiscale senza partita IVA. Mandare un privato come azienda fa scartare il
  // documento dallo SDI (Luca 22/08/2026, sugli ordini dal sito).
  if (p.persona_fisica !== undefined) row.persona_fisica = !!p.persona_fisica;
  // Booleano anche questo: passato da String() diventerebbe "false", che
  // in JavaScript e' vero, e il cliente si ritroverebbe lo storico acceso
  // proprio dopo averlo spento.
  if (p.usa_storico !== undefined) row.usa_storico = !!p.usa_storico;
  for (const f of OVERRIDE_CLIENTE_SCONTI) {
    if (p[f] === undefined) continue;
    const grezzo = String(p[f] ?? "").trim().replace(",", ".");
    row[f] = grezzo === "" ? null : Number(grezzo);
    if (Number.isNaN(row[f])) row[f] = null;
  }
  // Se il chiamante non dice chi e', vale chi e' loggato: senza un nome la
  // conferma dell'anagrafica viene scartata dal trigger, e il lavoro di chi
  // apre e controlla le schede sparisce (Luca 26/08/2026: "abbiamo allineato
  // tutto e me li ridici da sistemare").
  row.operatore = p.operatore || operatoreCorrente || "";
  row.aggiornato_il = new Date().toISOString();

  // IL CODICE CLIENTE LO ASSEGNA IL REGISTRO, NON L'OPERATORE.
  // "Essendo un nuovo cliente il codice cliente lo assegni tu" (Luca
  // 21/08/2026). Il bollino rosso chiedeva "Codice cliente" e mandava a questo
  // modulo, dove non c'e' nessuna casella per scriverlo: giustamente, perche'
  // un codice inventato a mano non e' nel registro e al primo ordine il cliente
  // verrebbe registrato una seconda volta con un codice diverso.
  // Qui si fa la stessa cosa che si fa quando un cliente nasce dal pulsante
  // "Nuovo cliente": si chiede il codice a clienti_master, che riusa quello
  // esistente se il nome c'e' gia' e ne sforna uno nuovo solo se serve davvero.
  //
  // MA SI ASSEGNA SOLO QUANDO NON C'E' DUBBIO. Provandolo su ROMA SRL e' venuto
  // fuori il pericolo: a registro ci sono CLI-1577 "ROMA SRL" (P.IVA
  // 13238551009), CLI-137 "OPERA VIVA ROMA SRL", CLI-2012 "TRATTORIA PIZZERIA
  // ROMA SRL" e PN-000003 "ROMA SRL - RISTORANTE HOTEL LA PERGOLA". L'ordine
  // parlava dell'Hotel La Pergola, ma il nome scritto sull'ordine e' "ROMA SRL"
  // e basta: agganciarlo al nome avrebbe attaccato la merce, e domani la
  // fattura, a un'azienda diversa con un'altra partita IVA.
  //
  // Quindi: con la P.IVA si aggancia (quella e' identita', il nome e' solo
  // conferma). Senza P.IVA si aggancia solo se a registro non somiglia niente,
  // e in quel caso nasce un codice nuovo. Se ci sono candidati e non c'e' la
  // P.IVA NON si sceglie: un doppione si fonde a mente fredda, un aggancio
  // sbagliato lo si scopre dalla fattura del cliente sbagliato.
  const ragioneReg = String(row.ragione_sociale || "").trim();
  let codiceAssegnato = null;
  let candidatiRegistro = null;
  if (ragioneReg && !String(p.codice_cliente || "").trim()) {
    const pivaPulita = String(row.partita_iva || "").replace(/\D/g, "");
    let sicuro = false;
    if (pivaPulita.length >= 11) {
      sicuro = true; // la partita IVA identifica: si puo' agganciare
    } else {
      // COMANDA IL CODICE CLIENTE, E IL NOME ESATTO E' UN CODICE (Luca
      // 25/08/2026: "segui sempre il codice cliente, non e' possibile che
      // vengano sovrapposte anagrafiche diverse tra loro").
      //
      // Qui si cercavano i "simili" con la PRIMA PAROLA del nome: per
      // "VITTORIO POGGI" si cercava "VITTORIO" e uscivano Vittorio Zulian e
      // Vittorio Quagliata, che non c'entrano niente. Peggio: fra i candidati
      // compariva PN-000030 VITTORIO POGGI, cioe' proprio il cliente che si
      // stava salvando, e il codice non veniva assegnato lo stesso.
      //
      // Adesso: se a registro c'e' UNA corrispondenza ESATTA sul nome, quello
      // e' il cliente e il codice e' il suo. Si chiede solo quando davvero non
      // si sa, e non si cerca piu' per nome proprio.
      const stessoNome = (x) =>
        String(x.ragione_sociale || "").trim().toLowerCase().replace(/\s+/g, " ") ===
        ragioneReg.toLowerCase().replace(/\s+/g, " ");

      const { data: simili } = await supabase
        .from("clienti_master")
        .select("codice, ragione_sociale, citta, provincia, piva")
        .ilike("ragione_sociale", `%${ragioneReg}%`)
        .limit(10);
      const tutti = (simili || []).filter(
        (x, i, a) => a.findIndex((y) => y.codice === x.codice) === i
      );
      const esatti = tutti.filter(stessoNome);

      if (esatti.length === 1) {
        // E' lui: stesso nome, identico. Il codice e' gia' a registro, e va
        // scritto sull'anagrafica: trovarlo e non salvarlo sarebbe come non
        // averlo trovato.
        codiceAssegnato = String(esatti[0].codice);
        row.codice_cliente = codiceAssegnato;
      } else if (esatti.length > 1) {
        // Due clienti con lo STESSO identico nome: qui si sceglie a mano, ed e'
        // giusto chiederlo (due negozi con la stessa insegna esistono).
        candidatiRegistro = esatti;
      } else if (tutti.length === 0) {
        sicuro = true; // davvero nuovo
      } else {
        candidatiRegistro = tutti;
      }
    }
    if (sicuro) {
      const reg = await assegnaCodiceRegistro(
        { piva: row.partita_iva, citta: row.citta, provincia: row.provincia,
          telefono: row.telefono, email: row.email },
        ragioneReg
      );
      if (reg.codice) {
        codiceAssegnato = reg.codice;
        row.codice_cliente = reg.codice;
      }
      // Se il registro non risponde si salva lo stesso il resto: meglio
      // un'anagrafica completa senza codice che perdere anche citta' e provincia.
    }
  } else if (String(p.codice_cliente || "").trim()) {
    row.codice_cliente = String(p.codice_cliente).trim();
  }

  const { data, error } = await supabase
    .from("clienti_override")
    .upsert(row, { onConflict: "chiave" })
    .select()
    .maybeSingle();
  if (error) return failure(error);

  // "Se inserisco un listino a mano i prezzi devono automaticamente cambiare"
  // (Luca 05/08/2026). Cambiare listino o sconti in anagrafica e' una decisione
  // commerciale: gli ordini ancora da preparare la devono recepire subito,
  // altrimenti si scopre il vecchio prezzo in fattura.
  // Con FORZA, perche' quelle righe hanno gia' un prezzo: senza, la
  // valorizzazione le salterebbe e non cambierebbe niente.
  // Gli id li manda l'interfaccia, che sa quali ordini sono di questo cliente:
  // la chiave override si costruisce da dati che vivono solo nel frontend
  // (snapshot APP e anagrafiche GAMMA) e qui non si potrebbe rifare uguale.
  // L'ordine da cui si e' aperta l'anagrafica prende il codice appena
  // assegnato: e' il filo che lega l'ordine al cliente, e senza quello il
  // bollino "Codice cliente" resterebbe rosso anche dopo aver salvato.
  if (codiceAssegnato && String(p.orderId || "").trim()) {
    await supabase
      .from("ordini")
      .update({ id_cliente: codiceAssegnato })
      .eq("id_ordine", String(p.orderId).trim())
      .is("id_cliente", null);
  }

  const daRivalorizzare = Array.isArray(p.rivalorizza) ? p.rivalorizza : [];
  const rivalorizzati = [];
  for (const idOrdine of daRivalorizzare) {
    const id = String(idOrdine || "").trim();
    if (!id) continue;
    const { error: errVal } = await supabase.rpc("valorizza_ordine", {
      p_id_ordine: id,
      p_forza: true,
    });
    if (errVal) console.warn("rivalorizzazione", id, errVal.message);
    else rivalorizzati.push(id);
  }

  // Il dubbio non resta muto: se non si e' potuto assegnare il codice perche' a
  // registro c'e' piu' di un candidato, si dice chi sono e decide una persona.
  return {
    success: true,
    override: data || row,
    rivalorizzati,
    codiceAssegnato,
    candidatiRegistro,
  };
}

// Carica un file (data URL) nel bucket Storage 'documenti' e ritorna l'URL
// pubblico. Il bucket va creato una volta su Supabase (sql/storage_documenti.sql).
// Cosi' i documenti veri (foto bolle, DDT, fatture) NON stanno dentro al DB.
async function caricaSuStorage(path, dataUrl) {
  const resp = await fetch(dataUrl);
  const blob = await resp.blob();
  const { error } = await supabase.storage
    .from("documenti")
    .upload(path, blob, { contentType: blob.type || "application/octet-stream", upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from("documenti").getPublicUrl(path);
  return data?.publicUrl || "";
}

// Azione generica: carica un documento su Storage e ritorna l'URL (per DDT,
// fatture, ecc.). Best-effort: se il bucket non esiste, ritorna errore gestibile.
async function uploadDocumento(params) {
  const p = parsePayload(params);
  if (!p.path || !p.dataUrl) return failure("path o file mancante");
  try {
    const url = await caricaSuStorage(String(p.path), String(p.dataUrl));
    return { success: true, url, path: String(p.path) };
  } catch (e) {
    return failure(e);
  }
}

// Foto di una bolla/DDT ricevuta, scattata dalla produzione. La scriviamo nella
// coda condivisa dell'APP ACQUISTI (acq_ricevimenti_foto, stesso Supabase): con
// stato 'Da analizzare' entra nella pipeline esistente (la routine la analizza e
// la propone all'ufficio, come le foto del bot Telegram). RLS off su quella tabella.
// La foto va su Storage (bucket documenti/bolle); in foto_locale finisce l'URL,
// non piu' il base64. Se il bucket non c'e' ancora, fallback al base64 nel DB.
async function salvaFotoBolla(params) {
  const p = parsePayload(params);
  if (!p.foto) return failure("foto mancante");
  let fotoField = String(p.foto);
  try {
    const now = new Date();
    const giorno = now.toISOString().slice(0, 10);
    const nome = `${now.getTime()}-${Math.floor(Math.random() * 1e6)}.jpg`;
    fotoField = await caricaSuStorage(`bolle/${giorno}/${nome}`, String(p.foto));
  } catch (_) {
    fotoField = String(p.foto); // bucket non pronto: resta il base64 (retrocompatibile)
  }
  const row = {
    canale: "magazzino",
    mittente: p.operatore || "magazzino",
    caption: p.caption || "",
    foto_locale: fotoField,
    stato: "Da analizzare",
  };
  // Se il magazzino ha abbinato la bolla a un ordine fornitore in arrivo,
  // lo agganciamo direttamente cosi' l'app acquisti lo trova gia' associato.
  if (p.ordineId) row.ordine_id = String(p.ordineId);
  if (p.fornitoreId) row.fornitore_id = String(p.fornitoreId);
  const { data, error } = await supabase
    .from("acq_ricevimenti_foto")
    .insert(row)
    .select("id")
    .maybeSingle();
  if (error) return failure(error);
  return { success: true, id: data?.id ?? null };
}

// Ordini fornitore IN ARRIVO (caricati dall'app acquisti): quelli aperti non
// ancora ricevuti. Servono al magazzino per abbinare la foto della bolla
// selezionando l'ordine giusto. Best-effort (RLS off sulle tabelle acq_).
async function getOrdiniAcquistiInArrivo() {
  try {
    const { data: ordini, error } = await supabase
      .from("acq_ordini")
      .select("id_ordine,fornitore_id,stato,data_ordine,consegna_attesa,righe")
      .in("stato", ["Inviato", "Confermato", "In consegna"])
      .order("consegna_attesa", { ascending: true });
    if (error) return { success: false, error: error.message, ordini: [] };
    const fornIds = [...new Set((ordini || []).map((o) => o.fornitore_id).filter(Boolean))];
    let nomi = {};
    if (fornIds.length) {
      const { data: forn } = await supabase
        .from("acq_fornitori")
        .select("id,nome")
        .in("id", fornIds);
      nomi = Object.fromEntries((forn || []).map((f) => [String(f.id), f.nome]));
    }
    // Nomi articolo leggibili, se esiste il catalogo acq_articoli.
    let artNomi = {};
    try {
      const artIds = [
        ...new Set(
          (ordini || []).flatMap((o) => (Array.isArray(o.righe) ? o.righe : []))
            .map((r) => r && r.articolo_id).filter(Boolean)
        ),
      ];
      if (artIds.length) {
        const { data: arts } = await supabase
          .from("acq_articoli")
          .select("id,nome,descrizione")
          .in("id", artIds);
        artNomi = Object.fromEntries(
          (arts || []).map((a) => [String(a.id), a.nome || a.descrizione || ""])
        );
      }
    } catch (_) {}
    const out = (ordini || []).map((o) => ({
      id: o.id_ordine,
      fornitoreId: o.fornitore_id,
      fornitore: nomi[String(o.fornitore_id)] || o.fornitore_id || "",
      stato: o.stato,
      consegna: o.consegna_attesa || "",
      dataOrdine: o.data_ordine || "",
      nRighe: Array.isArray(o.righe) ? o.righe.length : 0,
      righe: (Array.isArray(o.righe) ? o.righe : []).map((r) => ({
        articolo: artNomi[String(r.articolo_id)] || r.articolo_id || "",
        qta: Number(r.qta ?? 0),
        um: r.um || "",
        prezzo: r.prezzo === undefined || r.prezzo === null ? null : Number(r.prezzo),
      })),
    }));
    return { success: true, ordini: out };
  } catch (e) {
    return { success: false, error: String(e), ordini: [] };
  }
}

// Canali chat consentiti. 'chat_messaggi' = chat interna; 'chat_nuovi_ordini' =
// canale verso l'app acquisti (richieste di nuovi ordini). Whitelist per non
// permettere accessi arbitrari a tabelle via il parametro.
const CHAT_TABLES = new Set(["chat_messaggi", "chat_nuovi_ordini"]);
const chatTable = (p) => {
  const t = String(p.tabella || p.canale || "chat_messaggi");
  return CHAT_TABLES.has(t) ? t : "chat_messaggi";
};

// Chat: legge gli ultimi messaggi di un canale (opzionalmente solo i piu'
// recenti di un timestamp, per il polling). Degrada a lista vuota se manca.
async function getChatMessaggi(params) {
  const p = parsePayload(params);
  try {
    let q = supabase
      .from(chatTable(p))
      .select("*")
      .order("creato_il", { ascending: true })
      .limit(300);
    if (p.since) q = q.gt("creato_il", p.since);
    const { data, error } = await q;
    if (error) return { success: false, error: error.message, messaggi: [] };
    return { success: true, messaggi: data || [] };
  } catch (e) {
    return { success: false, error: String(e), messaggi: [] };
  }
}

async function inviaChatMessaggio(params) {
  const p = parsePayload(params);
  const testo = String(p.testo || "").trim();
  const audio = String(p.audio || "");
  if (!testo && !audio) return failure("messaggio vuoto");
  const { data, error } = await supabase
    .from(chatTable(p))
    .insert({
      mittente: p.mittente || "",
      mittente_etichetta: p.etichetta || p.mittente || "",
      tipo: p.tipo || (audio ? "audio" : "testo"),
      testo,
      audio,
    })
    .select()
    .maybeSingle();
  if (error) return failure(error);
  return { success: true, messaggio: data };
}

// Storico ordini (archiviati) caricato A RICHIESTA dalla pagina Archivio: gli
// ultimi N per data, con righe/assegnazioni/anagrafiche. Cosi' il caricamento
// iniziale resta snello e l'archivio non pesa finche' non lo si apre.
async function getOrdiniArchiviati(params) {
  const p = parsePayload(params);
  const limit = Math.min(Math.max(Number(p.limit || 300), 1), 1000);
  try {
    const { data: ord, error } = await supabase
      .from("ordini")
      .select("*")
      .eq("archiviato", true)
      .order("data_preparato", { ascending: false, nullsFirst: false })
      .limit(limit);
    if (error) return failure(error);
    const ids = (ord || []).map((o) => String(o.id_ordine)).filter(Boolean);
    const righeRows = ids.length ? await selectIn("righe_ordine", "id_ordine", ids) : [];
    const rigaIds = righeRows.map((r) => String(r.id_riga)).filter(Boolean);
    const assegRows = rigaIds.length ? await selectIn("assegnazioni_lotti", "id_riga", rigaIds) : [];
    const anagraficheApp = await anagrafichePerOrdini(ids);
    return {
      success: true,
      ordini: (ord || []).map(mapOrdineRow),
      righeOrdine: righeRows.map(mapRigaRow),
      assegnazioniLotti: assegRows.map(mapAssegRow),
      anagraficheApp,
    };
  } catch (e) {
    return failure(e);
  }
}

// Numero DDT: lo assegna il DATABASE, in una sola istruzione sotto lock.
//
// Regola di Luca (03/08/2026): crescente, senza buchi. Il modo di prima
// leggeva il prossimo numero e poi lo scriveva con una seconda chiamata: due
// postazioni insieme prendevano lo stesso numero, e una scrittura fallita
// bruciava un numero per sempre. Ora legge e scrive insieme, vedi
// `sql/numero_ddt.sql`.
//
// E' idempotente: se l'ordine ha gia' un numero torna quello, quindi
// ristampare un DDT non consuma mai un numero nuovo.
async function assegnaNumeroDDT(params) {
  const p = parsePayload(params);
  const idOrdine = String(p.orderId || p.idOrdine || p.id_ordine || "").trim();
  if (!idOrdine) return { success: false, error: "idOrdine mancante" };
  try {
    const { data, error } = await supabase.rpc("assegna_numero_ddt", {
      p_id_ordine: idOrdine,
    });
    if (error) return failure(error);
    return { success: true, numero: String(data) };
  } catch (e) {
    return failure(e);
  }
}

// UNISCI due ordini dello stesso cliente (stesso giorno di uscita): le righe
// dell'ordine SORGENTE passano al DESTINAZIONE, la sorgente viene archiviata e
// marcata `unito_in`. Le assegnazioni lotto seguono le righe da sole (puntano a
// id_riga), quindi nessuna giacenza si muove.
// Consentito SOLO su ordini ancora aperti: se uno e' Preparato/Spedito lo stock
// e' gia' stato scalato e spostare righe falserebbe i conti.
const STATI_UNIBILI = new Set(["da preparare", "parziale", "fermo", ""]);

async function unisciOrdini(params) {
  const p = parsePayload(params);
  const src = String(p.sorgente || p.from || "").trim();
  const dst = String(p.destinazione || p.to || "").trim();
  if (!src || !dst) return failure("serve ordine sorgente e destinazione");
  if (src === dst) return failure("sorgente e destinazione coincidono");

  const { data: ordini, error } = await supabase
    .from("ordini")
    .select("id_ordine,cliente,stato,archiviato,note,unito_in")
    .in("id_ordine", [src, dst]);
  if (error) return failure(error);
  const o = Object.fromEntries((ordini || []).map((x) => [x.id_ordine, x]));
  if (!o[src] || !o[dst]) return failure("ordine non trovato");
  for (const id of [src, dst]) {
    const st = String(o[id].stato || "").trim().toLowerCase();
    if (!STATI_UNIBILI.has(st)) {
      return failure(
        `L'ordine ${id} e' in stato "${o[id].stato}": si possono unire solo ordini non ancora preparati.`
      );
    }
    if (o[id].unito_in) return failure(`L'ordine ${id} risulta gia' unito in ${o[id].unito_in}.`);
  }

  // 1) righe della sorgente -> destinazione, ricordando la provenienza
  const { data: righe, error: eR } = await supabase
    .from("righe_ordine")
    .select("id_riga")
    .eq("id_ordine", src);
  if (eR) return failure(eR);
  const ids = (righe || []).map((r) => r.id_riga);
  if (ids.length) {
    const up = await supabase
      .from("righe_ordine")
      .update({ id_ordine: dst, id_ordine_originale: src })
      .in("id_riga", ids);
    if (up.error) return failure(up.error);
  }

  // 2) sorgente: archiviata e marcata come unita
  const notaSrc = [o[src].note, `UNITO nell'ordine ${dst}`].filter(Boolean).join(" · ");
  const upSrc = await supabase
    .from("ordini")
    .update({ unito_in: dst, archiviato: true, note: notaSrc })
    .eq("id_ordine", src);
  if (upSrc.error) return failure(upSrc.error);

  // 3) destinazione: nota + colli azzerati (il suggerito si ricalcola sul peso
  //    nuovo; un valore manuale vecchio sarebbe sbagliato)
  const notaDst = [o[dst].note, `include l'ordine ${src}`].filter(Boolean).join(" · ");
  const upDst = await supabase
    .from("ordini")
    .update({ note: notaDst, colli: null })
    .eq("id_ordine", dst);
  if (upDst.error) return failure(upDst.error);

  return { success: true, righeSpostate: ids.length, sorgente: src, destinazione: dst };
}

// SEPARA: annulla l'unione. Le righe che venivano dalla sorgente tornano alla
// sorgente, che viene disarchiviata. Esatto, perche' la provenienza e' salvata.
async function separaOrdine(params) {
  const p = parsePayload(params);
  const src = String(p.sorgente || p.orderId || "").trim();
  if (!src) return failure("serve l'ordine da separare");

  const { data: ord, error } = await supabase
    .from("ordini")
    .select("id_ordine,note,unito_in")
    .eq("id_ordine", src)
    .maybeSingle();
  if (error) return failure(error);
  if (!ord) return failure("ordine non trovato");
  if (!ord.unito_in) return failure("questo ordine non risulta unito a nessun altro");
  const dst = ord.unito_in;

  const back = await supabase
    .from("righe_ordine")
    .update({ id_ordine: src, id_ordine_originale: null })
    .eq("id_ordine_originale", src);
  if (back.error) return failure(back.error);

  const notaSrc = String(ord.note || "").replace(new RegExp(`\\s*·?\\s*UNITO nell'ordine ${dst}`), "").trim();
  const upSrc = await supabase
    .from("ordini")
    .update({ unito_in: null, archiviato: false, note: notaSrc })
    .eq("id_ordine", src);
  if (upSrc.error) return failure(upSrc.error);

  // destinazione: togli la nota e ricalcola i colli
  const { data: d } = await supabase
    .from("ordini")
    .select("note")
    .eq("id_ordine", dst)
    .maybeSingle();
  const notaDst = String(d?.note || "").replace(new RegExp(`\\s*·?\\s*include l'ordine ${src}`), "").trim();
  await supabase.from("ordini").update({ note: notaDst, colli: null }).eq("id_ordine", dst);

  return { success: true, sorgente: src, destinazione: dst };
}

async function deleteOrder(params) {
  const idOrdine = params.orderId || params.idOrdine;
  if (!idOrdine) return { success: false, error: "orderId mancante" };

  // Se l'ordine era passato per la preparazione, lo stock dei lotti era stato
  // scalato da prepara_ordine. Eliminando l'ordine lo ripristiniamo (somma
  // delle assegnazioni per lotto, rincrementata su lotti.quantita_caricata).
  // Se l'ordine non era mai stato preparato non c'e' niente da ripristinare:
  // lo stock fisico non era stato toccato.
  const ordR = await supabase
    .from("ordini")
    .select("stato")
    .eq("id_ordine", String(idOrdine))
    .maybeSingle();
  if (ordR.error) return failure(ordR.error);
  const stockGiaScalato = stockScalato(ordR.data?.stato);

  const stockMovements = [];

  if (stockGiaScalato) {
    const righeR = await supabase
      .from("righe_ordine")
      .select("id_riga")
      .eq("id_ordine", String(idOrdine));
    if (righeR.error) return failure(righeR.error);
    const righeIds = (righeR.data || []).map((r) => r.id_riga);

    if (righeIds.length > 0) {
      const assR = await supabase
        .from("assegnazioni_lotti")
        .select("id_lotto, quantita_assegnata")
        .in("id_riga", righeIds);
      if (assR.error) return failure(assR.error);

      const sumByLot = {};
      for (const a of assR.data || []) {
        const k = String(a.id_lotto);
        sumByLot[k] = (sumByLot[k] || 0) + Number(a.quantita_assegnata || 0);
      }

      for (const [lotId, qty] of Object.entries(sumByLot)) {
        const curLotR = await supabase
          .from("lotti")
          .select("quantita_caricata")
          .eq("id_lotto", lotId)
          .maybeSingle();
        // se il lotto e' stato eliminato non posso ripristinare nulla, salto.
        if (curLotR.error || !curLotR.data) continue;
        const newQty = Number(curLotR.data.quantita_caricata || 0) + qty;
        const updR = await supabase
          .from("lotti")
          .update({ quantita_caricata: newQty })
          .eq("id_lotto", lotId);
        if (updR.error) return failure(updR.error);
        stockMovements.push({ lotId, newQty });
      }
    }
  }

  const { error } = await supabase
    .from("ordini")
    .delete()
    .eq("id_ordine", String(idOrdine));
  if (error) return failure(error);

  return { success: true, stockMovements, orderWasPrepared: stockGiaScalato };
}

async function createLot(params) {
  const p = parsePayload(params);
  const idLotto = p.id || p.idLotto || `LOT-${Date.now()}`;
  const idProdotto = p.productId || p.idProdotto;
  const codiceLotto = p.lot || p.codiceLotto || p.Codice_Lotto || "";
  const scadenza = p.expiry || p.scadenza || null;
  const qty = Number(p.loadedQty ?? p.quantita ?? p.quantitaCaricata ?? 0);

  // REGOLA: per i prodotti con gestione_lotti=true e' VIETATO creare un
  // lotto generico "DISPONIBILITA". I prodotti con gestione_lotti=false
  // possono averlo. Source of truth: colonna prodotti.gestione_lotti.
  const isGenericCode = String(codiceLotto).trim().toLowerCase() === "disponibilita";
  if (isGenericCode && idProdotto) {
    const prodR = await supabase
      .from("prodotti")
      .select("gestione_lotti, codice_prodotto, descrizione_prodotto")
      .eq("id_prodotto", isNaN(+idProdotto) ? -1 : +idProdotto)
      .maybeSingle();
    if (prodR.data?.gestione_lotti === true) {
      return {
        success: false,
        error: `Il prodotto ${prodR.data.codice_prodotto || idProdotto} (${prodR.data.descrizione_prodotto || ""}) ha gestione lotti attiva: non puoi creare un lotto generico DISPONIBILITA. Crea un lotto con codice reale.`,
      };
    }
  }

  // ANTI-DUPLICATO (choke point per TUTTI i chiamanti: carico manuale, on-fly,
  // ecc.): se esiste gia' un lotto NON archiviato con stesso prodotto e stesso
  // codice (case-insensitive), non creare un doppione. Accumula la quantita'
  // sul lotto esistente e restituisci il suo id. Cosi' "reinserire" un lotto
  // gia' presente non genera piu' righe doppie.
  const codeKey = String(codiceLotto).trim().toLowerCase();
  if (codeKey && idProdotto) {
    const existR = await supabase
      .from("lotti")
      .select("id_lotto, codice_lotto, quantita_caricata, scadenza")
      .eq("id_prodotto", String(idProdotto))
      .eq("archiviato", false);
    if (existR.error) return failure(existR.error);
    const match = (existR.data || []).find(
      (l) => String(l.codice_lotto || "").trim().toLowerCase() === codeKey
    );
    if (match) {
      const newTotal = Number(match.quantita_caricata || 0) + qty;
      const patch = { quantita_caricata: newTotal };
      if (scadenza) patch.scadenza = scadenza;
      const upd = await supabase
        .from("lotti")
        .update(patch)
        .eq("id_lotto", String(match.id_lotto))
        .select()
        .maybeSingle();
      if (upd.error) return failure(upd.error);
      return {
        success: true,
        idLotto: String(match.id_lotto),
        lotId: String(match.id_lotto),
        lotCode: match.codice_lotto || codiceLotto,
        newQty: newTotal,
        reused: true,
      };
    }
  }

  const { data, error } = await supabase
    .from("lotti")
    .insert({
      id_lotto: String(idLotto),
      id_prodotto: String(idProdotto),
      codice_lotto: codiceLotto,
      lotto: codiceLotto,
      scadenza: scadenza || null,
      quantita_caricata: qty,
      archiviato: false,
    })
    .select()
    .maybeSingle();
  if (error) return failure(error);
  return {
    success: true,
    idLotto: String(idLotto),
    lotId: String(idLotto),
    lotCode: codiceLotto,
    newQty: qty,
  };
}

async function createProduct(params) {
  const p = parsePayload(params);
  const codice = p.code || p.codiceProdotto || p.Codice_Prodotto;
  const descrizione = p.name || p.descrizioneProdotto || p.Descrizione_Prodotto;
  const um = p.uom || p.um || p.UM || "pz";
  const categoria = p.category || p.categoria || p.Categoria || "";
  const sottocategoria = p.subcategory || p.sottocategoria || p.Sottocategoria || "";
  const gestione =
    p.managesLots !== undefined
      ? !!p.managesLots
      : siNoToBool(p.gestioneLotti ?? p.Gestione_Lotti ?? "SI");

  // Fallback ID se non c'è sequence: max+1.
  const maxR = await supabase
    .from("prodotti")
    .select("id_prodotto")
    .order("id_prodotto", { ascending: false })
    .limit(1);
  if (maxR.error) return failure(maxR.error);
  const nextId = ((maxR.data && maxR.data[0]?.id_prodotto) || 0) + 1;

  const { data, error } = await supabase
    .from("prodotti")
    .insert({
      id_prodotto: nextId,
      codice_prodotto: codice,
      descrizione_prodotto: descrizione,
      um,
      categoria,
      sottocategoria,
      gestione_lotti: gestione,
    })
    .select()
    .maybeSingle();
  if (error) return failure(error);
  return { success: true, idProdotto: nextId };
}

async function updateProduct(params) {
  const p = parsePayload(params);
  const idProdotto = p.productId || p.idProdotto || p.id || p.ID_Prodotto;
  if (!idProdotto) return { success: false, error: "productId mancante" };

  const patch = {};
  if (p.code !== undefined) patch.codice_prodotto = p.code;
  if (p.Codice_Prodotto !== undefined) patch.codice_prodotto = p.Codice_Prodotto;
  if (p.name !== undefined) patch.descrizione_prodotto = p.name;
  if (p.Descrizione_Prodotto !== undefined) patch.descrizione_prodotto = p.Descrizione_Prodotto;
  if (p.uom !== undefined) patch.um = p.uom;
  if (p.UM !== undefined) patch.um = p.UM;
  if (p.category !== undefined) patch.categoria = p.category;
  if (p.subcategory !== undefined) patch.sottocategoria = p.subcategory;
  if (p.managesLots !== undefined) patch.gestione_lotti = !!p.managesLots;
  if (p.gestioneLotti !== undefined) patch.gestione_lotti = siNoToBool(p.gestioneLotti);
  if (p.Gestione_Lotti !== undefined) patch.gestione_lotti = siNoToBool(p.Gestione_Lotti);

  // id_prodotto è int nel DB: serve il cast. Se l'id arriva come "NFARMA 013"
  // (cioè codice), provo prima il match sul codice.
  let q = supabase.from("prodotti").update(patch);
  const asNum = Number(idProdotto);
  if (Number.isFinite(asNum) && String(asNum) === String(idProdotto)) {
    q = q.eq("id_prodotto", asNum);
  } else {
    q = q.eq("codice_prodotto", String(idProdotto));
  }
  const { error } = await q;
  if (error) return failure(error);
  return { success: true };
}

async function deleteProduct(params) {
  const idProdotto = params.productId || params.idProdotto;
  if (!idProdotto) return { success: false, error: "productId mancante" };

  // Check lotti collegati.
  const asNum = Number(idProdotto);
  const colKey = Number.isFinite(asNum) && String(asNum) === String(idProdotto) ? "id_prodotto" : "codice_prodotto";
  const colVal = colKey === "id_prodotto" ? asNum : String(idProdotto);

  // Per cercare i lotti collegati uso comunque id_prodotto stringa (in DB è text).
  const lottiR = await supabase
    .from("lotti")
    .select("id_lotto")
    .eq("id_prodotto", String(idProdotto))
    .limit(1);
  if (lottiR.error) return failure(lottiR.error);
  if ((lottiR.data || []).length > 0) {
    return { success: false, error: "Esistono lotti per questo prodotto" };
  }

  const del = await supabase.from("prodotti").delete().eq(colKey, colVal);
  if (del.error) return failure(del.error);
  return { success: true };
}

async function addOrderLine(params) {
  const p = parsePayload(params);
  const idOrdine = p.orderId || p.idOrdine;
  const idRiga = p.lineId || p.idRiga || `RIGA-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const idProdotto = p.productId || p.idProdotto;
  const descrizione = p.productName || p.descrizione || "";
  const qty = Number(p.qtyOrdered ?? p.quantita ?? 0);
  const rowOrder = Number(p.rowOrder ?? p.ordineRiga ?? 0);

  if (!idOrdine || !idProdotto) return { success: false, error: "orderId/productId mancante" };

  const riga = {
    id_riga: String(idRiga),
    id_ordine: String(idOrdine),
    id_prodotto: String(idProdotto),
    descrizione_prodotto: descrizione,
    quantita_ordinata: qty,
    quantita_assegnata: 0,
    ordine_riga: rowOrder,
  };
  // Prezzo suggerito dallo storico del cliente: nasce gia' valorizzata, e resta
  // modificabile a mano come qualsiasi altra riga.
  const prezzo = p.prezzoUnitario ?? p.prezzo_unitario;
  if (prezzo !== undefined && prezzo !== null && prezzo !== "") {
    riga.prezzo_unitario = Number(prezzo);
    riga.sconto_pct = Number(p.scontoPct ?? p.sconto_pct ?? 0);
    riga.sconto2_pct = Number(p.sconto2Pct ?? p.sconto2_pct ?? 0);
    riga.sconto3_pct = Number(p.sconto3Pct ?? p.sconto3_pct ?? 0);
    riga.prezzo_origine = String(p.prezzoOrigine ?? p.prezzo_origine ?? "storico");
    // L'ALIQUOTA SI PUO' DIRE ALLA NASCITA DELLA RIGA. Serve all'abbuono, che ha
    // la sua aliquota decisa da noi (4%, Luca 22/08/2026) e non ereditata da un
    // prodotto, perche' un prodotto non ce l'ha.
    const ivaNuova = p.ivaPct ?? p.iva_pct;
    if (ivaNuova !== undefined && ivaNuova !== null && ivaNuova !== "") {
      riga.iva_pct = Number(ivaNuova);
    }
  }

  const { data, error } = await supabase
    .from("righe_ordine")
    .insert(riga)
    .select()
    .maybeSingle();
  if (error) return failure(error);

  // Prezzo, sconto e IVA li mette il database, pescando dallo storico del
  // cliente e poi dai listini (sql/valorizza_ordine.sql). Regola di Luca
  // (03/08/2026): "non si puo' mettere tutto a mano, e anche l'IVA".
  // Non tocca le righe gia' valorizzate, quindi il prezzo passato qui sopra
  // resta quello. Se fallisce la riga si salva lo stesso: meglio una riga da
  // valorizzare che una riga persa.
  let valorizzazione = null;
  try {
    const { data: v } = await supabase.rpc("valorizza_ordine", {
      p_id_ordine: String(idOrdine),
      p_forza: false,
    });
    valorizzazione = Array.isArray(v) ? v[0] : v;
  } catch (_) {}

  // L'IVA delle righe FUORI MAGAZZINO. valorizza_ordine non le vede: la sua
  // UPDATE dell'aliquota si aggancia a prodotti.id_prodotto, e una riga scritta a
  // mano quel prodotto non ce l'ha. Erano proprio quelle a restare col 4% di
  // default (la burrata di Green Door, il polybox di Service Tour).
  // Deduce l'aliquota dal catalogo solo quando i prodotti somiglianti sono
  // d'accordo, e per il polybox applica il suo 22% fisso. Quando non si sa lascia
  // vuoto, e il vuoto blocca il documento.
  try {
    await supabase.rpc("iva_righe_fuori_magazzino", { p_id_ordine: String(idOrdine) });
  } catch (_) {}

  await ricalcolaImponibile(idOrdine);
  // Rilegge la riga: l'RPC potrebbe averle appena messo prezzo e IVA, e chi
  // chiama deve vedere i valori veri, non quelli di un istante prima.
  const { data: aggiornata } = await supabase
    .from("righe_ordine")
    .select("*")
    .eq("id_riga", String(idRiga))
    .maybeSingle();
  return {
    success: true,
    lineId: String(idRiga),
    riga: aggiornata || data,
    valorizzazione,
  };
}

// Togliere una riga di ABBUONO. Solo quella: le righe di merce non si
// cancellano da qui (si modificano le quantita'), e una riga con assegnazioni
// addosso lascerebbe orfane le prenotazioni sui lotti.
async function deleteOrderLine(params) {
  const p = parsePayload(params);
  const lineId = String(p.lineId || p.id_riga || "").trim();
  if (!lineId) return { success: false, error: "lineId mancante" };

  const r = await supabase
    .from("righe_ordine")
    .select("id_riga, id_prodotto, prezzo_origine, descrizione_prodotto, quantita_assegnata")
    .eq("id_riga", lineId)
    .maybeSingle();
  if (r.error) return failure(r.error);
  if (!r.data) return { success: false, error: "Riga inesistente" };

  const eAbbuono =
    String(r.data.prezzo_origine || "") === "abbuono" ||
    String(r.data.id_prodotto || "").startsWith("ABBUONO-") ||
    /^ABBUONO\b/i.test(String(r.data.descrizione_prodotto || ""));
  // Il cartone bollinato aggiunto in sede si puo' ripensare, ma solo finche'
  // non ha un lotto assegnato: da li' in poi e' merce impegnata come le altre.
  const eBollinatoSede = String(r.data.prezzo_origine || "") === "bollato-sede";
  if (!eAbbuono && !eBollinatoSede) {
    return { success: false, error: "Da qui si tolgono solo gli abbuoni, non le righe di merce." };
  }
  if (eBollinatoSede && Number(r.data.quantita_assegnata || 0) > 0) {
    return { success: false, error: "Il cartone bollinato ha gia' un lotto assegnato: togli prima l'assegnazione." };
  }

  const del = await supabase.from("righe_ordine").delete().eq("id_riga", lineId);
  if (del.error) return failure(del.error);
  return { success: true };
}

async function updateOrderLine(params) {
  const p = parsePayload(params);
  const idRiga = p.lineId || p.idRiga || p.ID_Riga;
  if (!idRiga) return { success: false, error: "lineId mancante" };

  const patch = {};
  if (p.qtyOrdered !== undefined) patch.quantita_ordinata = Number(p.qtyOrdered);
  if (p.quantita !== undefined) patch.quantita_ordinata = Number(p.quantita);
  if (p.productName !== undefined) patch.descrizione_prodotto = p.productName;
  // Il cartone bollinato generico diventa l'articolo del lotto scelto: e'
  // l'unico caso in cui una riga cambia prodotto.
  if (p.productId !== undefined) patch.id_prodotto = String(p.productId);
  if (p.descrizione !== undefined) patch.descrizione_prodotto = p.descrizione;
  if (p.rowOrder !== undefined) patch.ordine_riga = Number(p.rowOrder);
  // Prezzo e sconto sempre correggibili a mano: se li tocchi, l'origine diventa manuale.
  const prezzoUp = p.prezzoUnitario ?? p.prezzo_unitario;
  if (prezzoUp !== undefined) {
    patch.prezzo_unitario =
      prezzoUp === null || prezzoUp === "" ? null : Math.round(Number(prezzoUp) * 100) / 100;
    patch.prezzo_origine = String(p.prezzoOrigine ?? p.prezzo_origine ?? "manuale");
  }
  const scontoUp = p.scontoPct ?? p.sconto_pct;
  if (scontoUp !== undefined) patch.sconto_pct = Number(scontoUp || 0);
  const sconto2Up = p.sconto2Pct ?? p.sconto2_pct;
  if (sconto2Up !== undefined) patch.sconto2_pct = Number(sconto2Up || 0);
  const sconto3Up = p.sconto3Pct ?? p.sconto3_pct;
  if (sconto3Up !== undefined) patch.sconto3_pct = Number(sconto3Up || 0);
  // Aliquota IVA della riga: nello stesso documento convivono il 4 del cibo e
  // il 22 del trasporto, quindi sta sulla riga e non sulla testata.
  const ivaUp = p.ivaPct ?? p.iva_pct;
  if (ivaUp !== undefined) patch.iva_pct = ivaUp === null || ivaUp === "" ? null : Number(ivaUp);
  // Natura: obbligatoria in fattura elettronica quando l'aliquota e' 0.
  const naturaUp = p.naturaIva ?? p.natura_iva;
  if (naturaUp !== undefined) patch.natura_iva = naturaUp || null;

  const { error } = await supabase
    .from("righe_ordine")
    .update(patch)
    .eq("id_riga", String(idRiga));
  if (error) return failure(error);
  // La quantita' (o il prezzo) e' cambiata: la testata deve seguire.
  const rigaAgg = await supabase
    .from("righe_ordine")
    .select("id_ordine")
    .eq("id_riga", String(idRiga))
    .maybeSingle();
  await ricalcolaImponibile(rigaAgg.data?.id_ordine);
  return { success: true };
}

// Un ordine ha lo stock gia' scalato dal momento in cui viene PREPARATO, e
// resta scalato anche dopo, quando passa a SPEDITO. Guardare solo "preparato"
// lasciava fuori i 49 ordini spediti: cancellarne uno faceva sparire la merce
// dal magazzino senza ripristinarla e senza dirlo a nessuno.
function stockScalato(stato) {
  const s = String(stato || "").trim().toLowerCase();
  return s === "preparato" || s === "spedito";
}

// Helper: se l'ordine collegato a una riga aveva lo stock gia' scalato, lo ripristina
// dei lotti per le quantita indicate e riapre l'ordine ('Da preparare'). Ritorna
// { stockMovements, orderReopened, idOrdine }. Logica unificata: ogni azione che
// "spreparara" un ordine ripristina automaticamente lo stock.
async function maybeRestoreStockAndReopen({ idOrdine, sumByLot }) {
  if (!idOrdine) return { stockMovements: [], orderReopened: false };
  const ordR = await supabase
    .from("ordini")
    .select("stato")
    .eq("id_ordine", String(idOrdine))
    .maybeSingle();
  if (ordR.error) return { error: ordR.error };
  if (!stockScalato(ordR.data?.stato)) return { stockMovements: [], orderReopened: false };

  const stockMovements = [];
  for (const [lotId, qty] of Object.entries(sumByLot)) {
    const curR = await supabase
      .from("lotti")
      .select("quantita_caricata")
      .eq("id_lotto", lotId)
      .maybeSingle();
    if (curR.error || !curR.data) continue;
    const newQty = Number(curR.data.quantita_caricata || 0) + Number(qty || 0);
    const upd = await supabase
      .from("lotti")
      .update({ quantita_caricata: newQty })
      .eq("id_lotto", lotId);
    if (upd.error) return { error: upd.error };
    stockMovements.push({ lotId, newQty });
  }

  const updO = await supabase
    .from("ordini")
    .update({
      stato: "Da preparare",
      data_preparato: null,
      stato_lavorazione: "In lavorazione",
    })
    .eq("id_ordine", String(idOrdine));
  if (updO.error) return { error: updO.error };

  return { stockMovements, orderReopened: true };
}

async function deleteLine(params) {
  const idRiga = params.lineId || params.idRiga;
  if (!idRiga) return { success: false, error: "lineId mancante" };

  // Raccolgo l'ordine + le assegnazioni della riga PRIMA di cancellare:
  // se l'ordine era preparato, devo ripristinare lo stock delle quantita
  // assegnate dalla riga e riaprire l'ordine.
  const rigR = await supabase
    .from("righe_ordine")
    .select("id_ordine")
    .eq("id_riga", String(idRiga))
    .maybeSingle();
  if (rigR.error) return failure(rigR.error);
  const idOrdine = rigR.data?.id_ordine;

  const assR = await supabase
    .from("assegnazioni_lotti")
    .select("id_lotto, quantita_assegnata")
    .eq("id_riga", String(idRiga));
  if (assR.error) return failure(assR.error);

  const sumByLot = {};
  for (const a of assR.data || []) {
    const k = String(a.id_lotto);
    sumByLot[k] = (sumByLot[k] || 0) + Number(a.quantita_assegnata || 0);
  }

  const restored = await maybeRestoreStockAndReopen({ idOrdine, sumByLot });
  if (restored.error) return failure(restored.error);

  const { error } = await supabase
    .from("righe_ordine")
    .delete()
    .eq("id_riga", String(idRiga));
  if (error) return failure(error);

  await ricalcolaImponibile(idOrdine);
  return {
    success: true,
    stockMovements: restored.stockMovements,
    orderReopened: restored.orderReopened,
  };
}

async function deleteAssignment(params) {
  const idAss = params.assignmentId || params.idAssegnazione;
  if (!idAss) return { success: false, error: "assignmentId mancante" };

  // Recupero l'assegnazione PRIMA di cancellarla, per sapere id_riga / id_lotto /
  // qty. Se l'ordine collegato e' preparato, ripristino lo stock di quel lotto
  // e riapro l'ordine, poi cancello.
  const assR = await supabase
    .from("assegnazioni_lotti")
    .select("id_riga, id_lotto, quantita_assegnata")
    .eq("id_assegnazione", String(idAss))
    .maybeSingle();
  if (assR.error) return failure(assR.error);
  if (!assR.data) {
    return { success: false, error: `Assegnazione ${idAss} inesistente` };
  }

  const { id_riga, id_lotto, quantita_assegnata } = assR.data;

  const rigR = await supabase
    .from("righe_ordine")
    .select("id_ordine")
    .eq("id_riga", id_riga)
    .maybeSingle();
  if (rigR.error) return failure(rigR.error);
  const idOrdine = rigR.data?.id_ordine;

  const restored = await maybeRestoreStockAndReopen({
    idOrdine,
    sumByLot: { [String(id_lotto)]: Number(quantita_assegnata || 0) },
  });
  if (restored.error) return failure(restored.error);

  const { error } = await supabase.rpc("rimuovi_assegnazione", {
    p_id_assegnazione: String(idAss),
  });
  if (error) return failure(error);

  // Compat: vecchio backend ritornava 'stockRestored' come singolo oggetto.
  return {
    success: true,
    stockMovements: restored.stockMovements,
    stockRestored: restored.stockMovements[0] || null,
    orderReopened: restored.orderReopened,
  };
}

async function updateLot(params) {
  const p = parsePayload(params);
  const idLotto = p.lotId || p.idLotto || p.ID_Lotto;
  if (!idLotto) return { success: false, error: "lotId mancante" };

  const patch = {};
  if (p.loadedQty !== undefined) patch.quantita_caricata = Number(p.loadedQty);
  if (p.quantita !== undefined) patch.quantita_caricata = Number(p.quantita);
  if (p.quantitaCaricata !== undefined) patch.quantita_caricata = Number(p.quantitaCaricata);
  if (p.expiry !== undefined) patch.scadenza = p.expiry || null;
  if (p.scadenza !== undefined) patch.scadenza = p.scadenza || null;
  if (p.lot !== undefined) {
    patch.codice_lotto = p.lot;
    patch.lotto = p.lot;
  }
  if (p.codiceLotto !== undefined) {
    patch.codice_lotto = p.codiceLotto;
    patch.lotto = p.codiceLotto;
  }

  const { error } = await supabase
    .from("lotti")
    .update(patch)
    .eq("id_lotto", String(idLotto));
  if (error) return failure(error);
  return { success: true };
}

async function archiveLot(params) {
  const idLotto = params.lotId || params.idLotto;
  if (!idLotto) return { success: false, error: "lotId mancante" };
  const { error } = await supabase
    .from("lotti")
    .update({ archiviato: true, data_archiviazione: new Date().toISOString() })
    .eq("id_lotto", String(idLotto));
  if (error) return failure(error);
  return { success: true };
}

async function deleteLot(params) {
  const idLotto = params.lotId || params.idLotto;
  if (!idLotto) return { success: false, error: "lotId mancante" };

  // Check assegnazioni su ordini non preparati.
  const assR = await supabase
    .from("assegnazioni_lotti")
    .select("id_assegnazione, id_riga")
    .eq("id_lotto", String(idLotto));
  if (assR.error) return failure(assR.error);

  const assegnazioni = assR.data || [];
  if (assegnazioni.length > 0) {
    // Recupero gli ordini collegati per capire se ci sono "non preparati".
    const righeIds = assegnazioni.map((a) => a.id_riga);
    const righeR = await supabase
      .from("righe_ordine")
      .select("id_riga, id_ordine")
      .in("id_riga", righeIds);
    if (righeR.error) return failure(righeR.error);
    const ordineIds = Array.from(new Set((righeR.data || []).map((r) => r.id_ordine)));
    if (ordineIds.length > 0) {
      const ordR = await supabase
        .from("ordini")
        .select("id_ordine, stato")
        .in("id_ordine", ordineIds);
      if (ordR.error) return failure(ordR.error);
      const nonPreparato = (ordR.data || []).find(
        (o) => String(o.stato || "").trim().toLowerCase() !== "preparato"
      );
      if (nonPreparato) {
        return {
          success: false,
          error: "Lotto assegnato a un ordine non ancora preparato",
        };
      }
    }

    // Solo storiche su ordini preparati: pulisco le assegnazioni manualmente.
    const cleanup = await supabase
      .from("assegnazioni_lotti")
      .delete()
      .eq("id_lotto", String(idLotto));
    if (cleanup.error) return failure(cleanup.error);
  }

  const del = await supabase.from("lotti").delete().eq("id_lotto", String(idLotto));
  if (del.error) return failure(del.error);
  return { success: true };
}

// ---------- CLIENTI (anagrafica) ----------

// Un cliente nuovo NON puo' nascere senza un codice nostro: e' il filo che
// tiene insieme magazzino, CRM, storico prezzi e fatturazione (regola di Luca,
// vedi il registro unico). Il codice lo assegna sempre `clienti_master`, mai
// l'orologio: un `CLI-<timestamp>` sembra un codice ma non e' nel registro, e
// al primo ordine il cliente verrebbe registrato una seconda volta con un
// codice diverso. Ordine di preferenza:
//   1. codice gestionale scritto a mano  -> CLI-<numero>, quello vero
//   2. cliente gia' nel registro         -> si riusa il suo, niente doppioni
//   3. cliente davvero nuovo             -> PN-xxxxxx dal registro
async function assegnaCodiceRegistro(p, ragione) {
  const codTs = String(p.codiceClienteTs || p.codice_cliente_ts || "").trim();

  // 1. Ha il codice del gestionale: quello comanda.
  if (codTs) {
    const cod = /^CLI-/i.test(codTs) ? codTs.toUpperCase() : `CLI-${codTs}`;
    const { data } = await supabase
      .from("clienti_master")
      .select("codice")
      .eq("codice", cod)
      .maybeSingle();
    if (data) return { codice: cod };
    const ins = await supabase.from("clienti_master").insert({
      codice: cod,
      codice_gestionale: codTs.replace(/^CLI-/i, ""),
      ragione_sociale: ragione,
      piva: (p.piva || "").trim() || null,
      origine: "gestionale",
    });
    if (!ins.error) return { codice: cod };
  }

  // 2. Stesso nome gia' a registro: si riusa, non se ne crea un altro.
  const { data: gia } = await supabase
    .from("clienti_master")
    .select("codice")
    .ilike("ragione_sociale", ragione)
    .limit(2);
  if (gia && gia.length === 1) return { codice: String(gia[0].codice), riusato: true };

  // 3. Nuovo davvero: il registro sforna il PN.
  const { data, error } = await supabase.rpc("nuovo_cliente_registro", {
    p_ragione_sociale: ragione,
    p_citta: p.citta || null,
    p_provincia: p.provincia || null,
    p_piva: (p.piva || "").trim() || null,
    p_telefono: p.telefono || null,
    p_email: p.email || null,
    p_origine: "magazzino",
  });
  if (error || !data) return { errore: error };
  return { codice: String(data), nuovo: true };
}

async function createCliente(params) {
  const p = parsePayload(params);
  const ragione = (p.ragioneSociale || p.ragione_sociale || p.nome || "").trim();
  if (!ragione) return { success: false, error: "Ragione sociale mancante" };

  // CREARE DUE VOLTE LO STESSO CLIENTE NON DEVE ESSERE POSSIBILE (Luca
  // 24/08/2026: "continua a crearne tipo 6-7 copie"). Se un cliente con la
  // stessa P.IVA o con lo stesso identico nome esiste gia', si RESTITUISCE
  // quello: niente codice nuovo, niente riga nuova. Il doppio click, il
  // ritentativo per la rete lenta e il collega che lo ricrea perche' non lo
  // trova diventano tutti la stessa cosa: il cliente che c'era gia'.
  const pivaPulita = String(p.piva || "").replace(/\D/g, "");
  const nomePulito = ragione.toLowerCase().replace(/\s+/g, " ");
  {
    let esistente = null;
    if (pivaPulita.length === 11) {
      const r = await supabase.from("clienti").select("*").eq("piva", pivaPulita).limit(1);
      if (!r.error && r.data && r.data.length) esistente = r.data[0];
      if (!esistente) {
        const m = await supabase.from("clienti_master").select("codice, ragione_sociale")
          .eq("piva", pivaPulita).limit(1);
        if (!m.error && m.data && m.data.length) {
          return { success: true, esistente: true, codice: String(m.data[0].codice),
                   cliente: { id_cliente: String(m.data[0].codice), ragione_sociale: m.data[0].ragione_sociale } };
        }
      }
    }
    if (!esistente) {
      const r = await supabase.from("clienti").select("*").ilike("ragione_sociale", ragione).limit(5);
      if (!r.error && r.data) {
        esistente = r.data.find(
          (c) => String(c.ragione_sociale || "").toLowerCase().replace(/\s+/g, " ") === nomePulito
        ) || null;
      }
    }
    if (esistente) {
      return { success: true, esistente: true, cliente: esistente,
               codice: String(esistente.id_cliente), codiceNuovo: false };
    }
  }

  let idCliente = p.id || p.idCliente || "";
  let codiceNuovo = false;
  if (!idCliente) {
    const reg = await assegnaCodiceRegistro(p, ragione);
    if (!reg.codice) {
      // Meglio non salvare che salvare un cliente senza codice: sarebbe
      // invisibile al CRM e allo storico, e lo si scoprirebbe fra mesi.
      return {
        success: false,
        error:
          "Non riesco ad assegnare il codice cliente dal registro. " +
          "Il cliente NON e' stato salvato: riprova fra un momento. (" +
          ((reg.errore && reg.errore.message) || "registro non raggiungibile") + ")",
      };
    }
    idCliente = reg.codice;
    codiceNuovo = !!reg.nuovo;
  }

  const row = {
    id_cliente: String(idCliente),
    ragione_sociale: ragione,
    categoria: (p.categoria || "").trim(),
    codice_cliente_ts: (p.codiceClienteTs || p.codice_cliente_ts || "").trim(),
    piva: (p.piva || "").trim(),
    codice_fiscale: (p.codiceFiscale || p.codice_fiscale || "").trim(),
    codice_destinatario_ts: (p.codiceDestinatarioTs || p.codice_destinatario_ts || "").trim(),
    fonte: "manuale",
    attivo: true,
    note: (p.note || "").trim(),
  };

  const { data, error } = await supabase
    .from("clienti")
    .insert(row)
    .select()
    .maybeSingle();
  if (error) {
    // Il codice era gia' stato staccato dal registro: se poi l'anagrafica non
    // si salva, quel codice resterebbe li' senza nessuno dietro. Lo ritiro,
    // ma solo se l'ho creato io adesso: se era gia' a registro non si tocca.
    if (codiceNuovo) {
      await supabase.from("clienti_master").delete().eq("codice", String(idCliente));
    }
    return failure(error);
  }
  return { success: true, cliente: data, codice: String(idCliente), codiceNuovo };
}

async function updateCliente(params) {
  const p = parsePayload(params);
  const idCliente = p.id || p.idCliente || p.id_cliente;
  if (!idCliente) return { success: false, error: "idCliente mancante" };

  const patch = {};
  if (p.ragioneSociale !== undefined) patch.ragione_sociale = String(p.ragioneSociale).trim();
  if (p.ragione_sociale !== undefined) patch.ragione_sociale = String(p.ragione_sociale).trim();
  if (p.categoria !== undefined) patch.categoria = String(p.categoria).trim();
  if (p.codiceClienteTs !== undefined) patch.codice_cliente_ts = String(p.codiceClienteTs).trim();
  if (p.codice_cliente_ts !== undefined) patch.codice_cliente_ts = String(p.codice_cliente_ts).trim();
  if (p.piva !== undefined) patch.piva = String(p.piva).trim();
  if (p.codiceFiscale !== undefined) patch.codice_fiscale = String(p.codiceFiscale).trim();
  if (p.codice_fiscale !== undefined) patch.codice_fiscale = String(p.codice_fiscale).trim();
  if (p.codiceDestinatarioTs !== undefined) patch.codice_destinatario_ts = String(p.codiceDestinatarioTs).trim();
  if (p.codice_destinatario_ts !== undefined) patch.codice_destinatario_ts = String(p.codice_destinatario_ts).trim();
  if (p.note !== undefined) patch.note = String(p.note).trim();
  if (p.attivo !== undefined) patch.attivo = !!p.attivo;

  if (Object.keys(patch).length === 0) return { success: true };

  const { data, error } = await supabase
    .from("clienti")
    .update(patch)
    .eq("id_cliente", String(idCliente))
    .select()
    .maybeSingle();
  if (error) return failure(error);
  return { success: true, cliente: data };
}

async function deleteCliente(params) {
  // "Elimina" = disattiva (soft). Non cancelliamo per non rompere gli ordini
  // storici che puntano a questo id_cliente. Sparisce dai menu, resta nei dati.
  const p = parsePayload(params);
  const idCliente = p.id || p.idCliente || p.id_cliente || params.clienteId;
  if (!idCliente) return { success: false, error: "idCliente mancante" };
  const { error } = await supabase
    .from("clienti")
    .update({ attivo: false })
    .eq("id_cliente", String(idCliente));
  if (error) return failure(error);
  return { success: true };
}

// ---------- public entry ----------

// ============================================================
// ORDINI DA APP (reparto staging degli ordini dell'app agenti)
// ============================================================

// SITUAZIONE GESTIONALE (Luca 2026-07-16): scaduto per cliente + anagrafica
// TeamSystem, sincronizzate dalle Edge Function ts-sync-* (~ogni 4h / notte).
// Servono al badge pagamento AUTO degli ordini: il match ordine→cliente
// avviene per nome (token) in App.jsx. clienti_gestionale supera le 1000
// righe → paginato (PostgREST taglia a 1000 per richiesta).
async function getSituazioneGestionale(params) {
  const scaduti = {};
  {
    const { data, error } = await supabase
      .from("clienti_scaduto")
      .select("codice_cliente,importo_scaduto,num_scadute")
      .eq("scaduto", true);
    if (error) return { success: false, error: error.message };
    for (const r of data || []) {
      scaduti[String(r.codice_cliente)] = {
        importo: Number(r.importo_scaduto) || 0,
        num: Number(r.num_scadute) || 0,
      };
    }
  }
  // Ai giri periodici serve solo lo scaduto: l'anagrafica del gestionale
  // (~2.000 righe) non cambia ogni dieci minuti e il matcher resta in memoria.
  if (params && params.soloScaduti) {
    return { success: true, scaduti, anagrafica: [] };
  }
  const anagrafica = [];
  const PAGE = 1000;
  for (let from = 0; from < 20000; from += PAGE) {
    const { data, error } = await supabase
      .from("clienti_gestionale")
      .select("codice_cliente,ragione_sociale")
      .order("codice_cliente")
      .range(from, from + PAGE - 1);
    if (error) return { success: false, error: error.message };
    for (const r of data || []) {
      anagrafica.push({ codice: String(r.codice_cliente), nome: r.ragione_sociale || "" });
    }
    if (!data || data.length < PAGE) break;
  }
  return { success: true, scaduti, anagrafica };
}

// Elenco degli ordini in arrivo dall'app agenti, ancora da controllare.
// Se la tabella non esiste ancora, ritorna lista vuota (non rompe la UI).
async function getOrdiniDaApp() {
  const q = await supabase
    .from("ordini_agenti")
    .select("*")
    .eq("stato", "Da controllare")
    .order("creato_il", { ascending: false });
  if (q.error) {
    // 42P01 = tabella inesistente: reparto vuoto, nessun errore all'utente.
    return { success: true, ordini: [] };
  }
  return { success: true, ordini: q.data || [] };
}

// "Sposta in ordini": crea l'ordine operativo (ordini + righe_ordine) dallo
// staging e marca lo staging come Importato. Da qui segue il flusso normale.
async function spostaOrdineInOrdini(params) {
  const p = parsePayload(params);
  const idApp = p.idOrdine || p.id_ordine || p.id;
  if (!idApp) return { success: false, error: "id ordine mancante" };

  const g = await supabase.from("ordini_agenti").select("*").eq("id_ordine", String(idApp)).maybeSingle();
  if (g.error || !g.data) return { success: false, error: "ordine app non trovato" };
  const src = g.data;
  if (src.stato === "Importato") return { success: false, error: "ordine già spostato" };

  const cli = src.cliente || {};
  const nomeCliente = cli.ragione_sociale || src.cliente_id || "Cliente app";
  // Numero ordine operativo: nuovo, distinto dall'id staging.
  const idOrdine = `ORD-${Date.now()}`;

  // Righe: già appiattite dall'app agenti (cartoni + promo + polybox).
  const lines = (src.righe || []).map((r, i) => {
    const magId = r.id_prodotto_magazzino;
    const productId = magId != null && magId !== "" ? String(magId) : `FUORI_MAGAZZINO-${r.codice || i}`;
    // CARTONE BOLLATO (Luca 2026-07-30, soglia a 33 gg dal 27/08): la merce corta si regala
    // e va BOLLINATA prima di partire. Il marker deve dirlo esplicitamente,
    // con lotto e giorni residui: spostato l'ordine in preparazione, questa
    // riga e' l'unica cosa che l'operatore vede.
    // Il flag arriva dall'app agenti. Rete di sicurezza per gli ordini gia' in
    // coda prima che il flag esistesse: una riga promo a prezzo 0 con un
    // prodotto vero E' un cartone bollato (l'omaggio generico "a scelta della
    // sede" non ha prodotto, la referenza al 70% non e' a prezzo 0).
    const bollato =
      r.bollato === true ||
      r.bollato === "true" ||
      (r.promo === true && Number(r.prezzo_unitario || 0) === 0 && magId != null && magId !== "");
    const marker = bollato
      ? ` 🏷️ DA BOLLINARE${r.bollato_giorni != null ? ` (scad. ${r.bollato_giorni} gg)` : ""}${r.lotto_richiesto ? ` · lotto ${r.lotto_richiesto}` : ""}`
      : r.promo ? (r.sconto_pct === 100 ? " (OMAGGIO)" : " (PROMO)") : "";
    const sr = r.su_richiesta ? " [SU RICHIESTA]" : "";
    const val = valorizzaRigaApp(r);
    return {
      lineId: `RIGA-${Date.now()}-${i}`,
      productId,
      productName: `${r.descrizione_prodotto || r.codice || ""}${marker}${sr}`,
      // Il magazzino conta in CARTONI: l'app manda r.colli (cartoni) e
      // r.quantita_ordinata (pezzi). I pezzi sciolti dei polybox frozen
      // hanno colli null e restano a pezzi. (Bug 1 crt -> 8 crt, 2026-07-17.)
      qtyOrdered: val.qty,
      rowOrder: i + 1,
      // Valorizzazione: prezzo riportato all'UNITA' DEL MAGAZZINO (vedi
      // valorizzaRigaApp). Sconto e origine viaggiano con la riga.
      prezzoUnitario: val.prezzo,
      scontoPct: val.sconto,
      // Il secondo sconto viaggia con la riga: certi clienti ne hanno due, e la
      // promozione e' proprio il caso piu' frequente (Luca 11/08/2026).
      sconto2Pct: val.sconto2 || 0,
      prezzoOrigine: "app",
    };
  });

  const noteParts = [`Da APP · agente ${src.agente_nome || ""} · ${src.canale || ""}`];
  if (src.note) noteParts.push(src.note);
  if (src.data_consegna) noteParts.push(`consegna richiesta ${src.data_consegna}`);
  if (cli.nuovo) noteParts.push(`NUOVO CLIENTE (P.IVA ${cli.partita_iva || "n/d"})`);

  const created = await createOrder({
    payload: JSON.stringify({
      id: idOrdine,
      customer: nomeCliente,
      clienteId: src.cliente_id || "",
      notes: noteParts.join(" · "),
      date: src.creato_il || null,
      status: "Da preparare",
      workStatus: "Nuovo",
      // CAP per il costo trasporto: appena l'app agenti includera' cli.cap
      // nel JSON cliente, l'ordine agente lo salva. (Oggi manda solo citta.)
      cap: cli.cap || cli.CAP || cli.cap_destinazione || "",
      // Il "listino" di un ordine agente e' il canale con cui l'app ha fatto
      // i prezzi (farmaceutico / horeca / gdo): serve a sapere su che base
      // e' stato valorizzato, senza confonderlo coi listini 1/8 del gestionale.
      listino: src.canale ? `app:${src.canale}` : "app",
      // L'AGENTE che ha fatto l'ordine. Finiva solo dentro le note ("Da APP ·
      // agente Ivan Silvestri · farmaceutico") e il campo restava vuoto: 33
      // ordini importati senza agente, che poi qualcuno doveva rimettere a mano
      // uno per uno. Se l'ordine arriva da un agente, l'agente e' quello.
      // (Luca 05/08/2026)
      agenteId: src.agente_id || "",
      agenteNome: src.agente_nome || "",
      // Come viaggia il gelo: la scelta l'ha fatta l'agente, il magazzino la
      // eredita e non deve indovinarla dai nomi dei prodotti.
      pedanaFrozen: src.pedana_frozen === true,
      lines,
    }),
  });
  if (!created?.success) return { success: false, error: created?.error || "errore creazione ordine" };

  // Flag "preso in gestione dal magazzino" verso l'app agenti: stato=Importato
  // (già letto dall'app agenti) + numero ordine magazzino + orario. Aggiungiamo
  // stato_magazzino='Preso in gestione' se la colonna c'e' (best-effort).
  const base = {
    stato: "Importato",
    id_ordine_magazzino: idOrdine,
    importato_il: new Date().toISOString(),
  };
  let upd = await supabase
    .from("ordini_agenti")
    .update({
      ...base,
      stato_magazzino: "Preso in gestione",
      aggiornato_magazzino_il: new Date().toISOString(),
    })
    .eq("id_ordine", String(idApp));
  if (upd.error) {
    upd = await supabase.from("ordini_agenti").update(base).eq("id_ordine", String(idApp));
  }
  if (upd.error) return { success: false, error: upd.error.message };

  return { success: true, idOrdine, idApp: String(idApp) };
}

// Rifiuta un ordine da app senza importarlo (resta tracciato, non sparisce).
async function rifiutaOrdineApp(params) {
  const p = parsePayload(params);
  const idApp = p.idOrdine || p.id_ordine || p.id;
  const motivo = p.motivo || "";
  if (!idApp) return { success: false, error: "id ordine mancante" };
  const upd = await supabase
    .from("ordini_agenti")
    .update({ stato: "Annullato", note: motivo ? `RIFIUTATO: ${motivo}` : "RIFIUTATO dal magazzino" })
    .eq("id_ordine", String(idApp));
  if (upd.error) return { success: false, error: upd.error.message };
  return { success: true };
}

// Elenco utenti per il menu a tendina della schermata di login (solo
// username + etichetta, mai la password). Via RPC SECURITY DEFINER:
// la tabella app_utenti non e' piu' leggibile direttamente dalla anon key.
async function listAppUsers() {
  const { data, error } = await supabase.rpc("lista_utenti_attivi");
  if (error) return failure(error);
  return { success: true, users: data || [] };
}

// Login applicativo: la verifica di username + password avviene lato DB
// nella funzione SECURITY DEFINER verify_login. La anon key non legge piu'
// la tabella app_utenti (ne' le password): il client riceve solo i campi
// sicuri se le credenziali sono corrette.
async function appLogin(params) {
  const p = parsePayload(params);
  const username = String(p.username || "").trim().toLowerCase();
  const password = String(p.password || "");
  if (!username || !password) return { success: true, user: null };
  const { data, error } = await supabase.rpc("verify_login", {
    p_username: username,
    p_password: password,
  });
  if (error) return failure(error);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || row.attivo === false) return { success: true, user: null };
  return { success: true, user: { username: row.username, etichetta: row.etichetta } };
}

// Propaga lo stato all'ordine ORIGINARIO dell'app agenti (tabella
// ordini_agenti, collegata via id_ordine_magazzino) così l'agente vede
// l'avanzamento in "I tuoi ordini": 'Spedito' quando si spedisce,
// 'Importato' quando si riporta indietro. Best-effort: non blocca il flusso.
export async function aggiornaStatoOrdineApp(idOrdineMagazzino, stato) {
  if (!idOrdineMagazzino || !stato) return { ok: false };
  try {
    const { error } = await supabase
      .from("ordini_agenti")
      .update({ stato })
      .eq("id_ordine_magazzino", String(idOrdineMagazzino));
    return { ok: !error, error: error?.message };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

// --- Storico articoli/prezzi per cliente (dalle fatture elettroniche) ---------
// Serve a chi carica l'ordine: vedere a colpo d'occhio cosa quel cliente ha gia'
// preso e a che prezzo, articoli fatti ad hoc per lui compresi. Il prezzo che
// esce di qui e' un SUGGERIMENTO: chi carica lo puo' sempre cambiare.

// "LAGABI s.r.l. · ROMA" e "LAGABI SRL" devono collassare sulla stessa chiave.
function normNome(t) {
  return String(t || "").split("·")[0].toUpperCase().replace(/[^A-Z0-9]/g, "");
}

async function risolviPivaCliente(cliente) {
  const nome = String(cliente || "").trim();
  if (!nome) return { piva: "", clienteFattura: "", origine: "" };

  const link = await supabase
    .from("clienti_storico_link")
    .select("piva, cliente_fattura, origine")
    .eq("cliente_magazzino", nome)
    .maybeSingle();
  if (link.data?.piva) {
    return {
      piva: link.data.piva,
      clienteFattura: link.data.cliente_fattura || "",
      origine: link.data.origine || "auto",
    };
  }
  return { piva: "", clienteFattura: "", origine: "" };
}

// Gli articoli comprati da una P.IVA, il piu' recente per primo. La finestra
// dei 12 mesi e' gia' applicata a monte, quando si costruisce la tabella.
async function articoliPerPiva(piva) {
  const { data, error } = await supabase
    .from("storico_cliente_articolo")
    .select(
      "codice, descrizione, unita_misura, ultimo_prezzo, ultimo_sconto, ultimo_ordine, volte, qta_totale, prezzo_min, prezzo_max"
    )
    .eq("piva", piva)
    .order("ultimo_ordine", { ascending: false })
    .limit(500);
  if (error) return [];
  return (data || []).map((r) => ({
    codice: r.codice || "",
    descrizione: r.descrizione || "",
    unitaMisura: r.unita_misura || "",
    ultimoPrezzo: r.ultimo_prezzo === null ? null : Number(r.ultimo_prezzo),
    ultimoSconto: Number(r.ultimo_sconto || 0),
    ultimoOrdine: r.ultimo_ordine || "",
    volte: Number(r.volte || 0),
    qtaTotale: Number(r.qta_totale || 0),
    // Se il prezzo e' cambiato nel tempo lo segnaliamo: non e' un listino fisso.
    prezzoVariato: Number(r.prezzo_min) !== Number(r.prezzo_max),
    prezzoMin: r.prezzo_min === null ? null : Number(r.prezzo_min),
    prezzoMax: r.prezzo_max === null ? null : Number(r.prezzo_max),
  }));
}

async function getStoricoCliente(params) {
  const p = parsePayload(params);
  let cliente = p.cliente || "";
  const idOrdine = p.orderId || p.idOrdine;
  // In creazione ordine il cliente si sceglie dal registro, quindi abbiamo il
  // CODICE: e' un aggancio esatto, molto meglio del nome. Si passa dal registro
  // per prendere la P.IVA, che e' la chiave dello storico fatture.
  const codiceCliente = String(p.codiceCliente || p.clientId || p.idCliente || "").trim();

  try {
    if (codiceCliente) {
      const reg = await supabase
        .from("clienti_master")
        .select("piva, ragione_sociale")
        .eq("codice", codiceCliente)
        .maybeSingle();
      const pivaReg = String(reg.data?.piva || "").replace(/\D/g, "");
      // "00000000000" e simili sono segnaposto, non partite IVA.
      const pivaVera = pivaReg.replace(/^0+/, "") ? pivaReg : "";
      if (pivaVera) {
        // Il gestionale imbottisce di zeri le P.IVA corte (una svizzera di 9
        // cifre diventa 00262930096), la fattura no. Provo tutte le forme.
        const nudo = pivaVera.replace(/^0+/, "");
        const varianti = [...new Set([pivaVera, nudo, nudo.padStart(11, "0")])];
        const articoli = (
          await Promise.all(varianti.map((v) => articoliPerPiva(v)))
        ).find((lista) => lista.length) || [];
        if (articoli.length) {
          return {
            ok: true,
            cliente: cliente || reg.data?.ragione_sociale || "",
            piva: pivaVera,
            clienteFattura: reg.data?.ragione_sociale || "",
            origine: "codice",
            collegato: true,
            articoli,
          };
        }
      }
      // Codice senza risultati: si prova col nome prima di arrendersi.
    }

    if (!cliente && idOrdine) {
      const ord = await supabase
        .from("ordini")
        .select("cliente")
        .eq("id_ordine", String(idOrdine))
        .maybeSingle();
      cliente = ord.data?.cliente || "";
    }
    if (!cliente) return { ok: true, cliente: "", collegato: false, articoli: [] };

    const { piva, clienteFattura, origine } = await risolviPivaCliente(cliente);
    if (!piva) {
      // Nessun aggancio: proponiamo i candidati piu' vicini per nome, poi
      // l'operatore sceglie e la scelta resta salvata.
      const k = normNome(cliente);
      const primaParola = String(cliente || "").split(/[\s·]+/)[0] || "";
      const cand = primaParola.length >= 3
        ? await supabase
            .from("storico_cliente_articolo")
            .select("piva, cliente")
            .ilike("cliente", `%${primaParola}%`)
            .limit(200)
        : { data: [] };
      const visti = new Set();
      const candidati = [];
      for (const r of cand.data || []) {
        if (visti.has(r.piva)) continue;
        visti.add(r.piva);
        candidati.push({ piva: r.piva, cliente: r.cliente, esatto: normNome(r.cliente) === k });
      }
      candidati.sort((a, b) => (b.esatto ? 1 : 0) - (a.esatto ? 1 : 0));
      return { ok: true, cliente, collegato: false, articoli: [], candidati: candidati.slice(0, 20) };
    }

    const articoli = await articoliPerPiva(piva);
    return { ok: true, cliente, piva, clienteFattura, origine, collegato: true, articoli };
  } catch (e) {
    return failure(e);
  }
}

// I prezzi dei listini per articolo, per metterli accanto allo storico quando
// si carica un ordine a mano. Servono i due che abbiamo davvero: il 1 (base) e
// l'8 (Ho.Re.Ca.). I listini 2, 3 e 4 esistono in anagrafica ma i loro prezzi
// da GAMMA non ci sono ancora, vedi richiesta CONFWS.
async function getListiniPrezzi() {
  try {
    const { data, error } = await supabase
      .from("listini_gestionale")
      .select("codice_articolo, listino, prezzo, sconto_pct")
      .in("listino", ["1", "8"])
      .gt("prezzo", 0)
      .limit(2000);
    if (error) return failure(error);
    // Chiave senza spazi: "HORECA 122" e "HORECA122" sono lo stesso articolo.
    const perCodice = {};
    for (const r of data || []) {
      const k = String(r.codice_articolo || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (!k) continue;
      perCodice[k] = perCodice[k] || {};
      perCodice[k][`l${r.listino}`] = {
        prezzo: Number(r.prezzo),
        sconto: Number(r.sconto_pct || 0),
      };
    }
    return { ok: true, listini: perCodice, articoli: Object.keys(perCodice).length };
  } catch (e) {
    return failure(e);
  }
}

async function cercaClienteStorico(params) {
  const p = parsePayload(params);
  const q = String(p.q || p.query || "").trim();
  if (q.length < 2) return { ok: true, clienti: [] };
  try {
    const { data, error } = await supabase
      .from("storico_cliente_articolo")
      .select("piva, cliente")
      .ilike("cliente", `%${q}%`)
      .limit(300);
    if (error) return failure(error);
    const visti = new Set();
    const clienti = [];
    for (const r of data || []) {
      if (visti.has(r.piva)) continue;
      visti.add(r.piva);
      clienti.push({ piva: r.piva, cliente: r.cliente });
    }
    clienti.sort((a, b) => a.cliente.localeCompare(b.cliente));
    return { ok: true, clienti: clienti.slice(0, 50) };
  } catch (e) {
    return failure(e);
  }
}

async function collegaClienteStorico(params) {
  const p = parsePayload(params);
  const cliente = String(p.cliente || "").trim();
  const piva = String(p.piva || "").trim();
  if (!cliente) return { ok: false, error: "cliente mancante" };
  try {
    if (!piva) {
      // Scollega: si torna alla scelta, non si resta incastrati in un aggancio sbagliato.
      const { error } = await supabase
        .from("clienti_storico_link")
        .delete()
        .eq("cliente_magazzino", cliente);
      if (error) return failure(error);
      return { ok: true, scollegato: true };
    }
    const { error } = await supabase.from("clienti_storico_link").upsert(
      {
        cliente_magazzino: cliente,
        piva,
        cliente_fattura: String(p.clienteFattura || p.cliente_fattura || ""),
        origine: "manuale",
      },
      { onConflict: "cliente_magazzino" }
    );
    if (error) return failure(error);
    return { ok: true };
  } catch (e) {
    return failure(e);
  }
}

export async function callSheetsApi(params = {}) {
  try {
    // Bulk load: nessuna action.
    if (!params || !params.action) {
      return await bulkLoad();
    }

    switch (params.action) {
      case "appLogin":
        return await appLogin(params);
      case "listAppUsers":
        return await listAppUsers();
      case "archivePreparedOrders":
      case "archiveAllPreparedOrders":
        return await archivePreparedOrders();
      case "assignLot":
        return await assignLot(params);
      case "unarchiveOrder":
        return await unarchiveOrder(params);
      case "updateOrder":
        return await updateOrder(params);
      case "markOrderViewed":
        return await markOrderViewed(params);
      case "archiveOrder":
        return await archiveOrder(params);
      case "setMotivoFermo":
        return await setMotivoFermo(params);
      case "unisciOrdini":
        return await unisciOrdini(params);
      case "separaOrdine":
        return await separaOrdine(params);
      case "markOrderStopped":
        return await markOrderStopped(params);
      case "reopenOrder":
        return await reopenOrder(params);
      case "markOrderPrepared":
        return await markOrderPrepared(params);
      case "createOrder":
        return await createOrder(params);
      case "deleteOrder":
        return await deleteOrder(params);
      case "createLot":
        return await createLot(params);
      case "logProduzione":
        return await logProduzione(params);
      case "saveClienteOverride":
        return await saveClienteOverride(params);
      case "salvaFotoBolla":
        return await salvaFotoBolla(params);
      case "uploadDocumento":
        return await uploadDocumento(params);
      case "getOrdiniAcquistiInArrivo":
        return await getOrdiniAcquistiInArrivo();
      case "getOrdiniArchiviati":
        return await getOrdiniArchiviati(params);
      case "registraClienteRegistro":
        return await registraClienteRegistro(params);
      case "getStoricoCliente":
        return await getStoricoCliente(params);
      case "ddtAnnullati": {
        // I numeri rimasti senza ordine, con il perche'. Servono al Registro
        // DDT per spiegare i buchi invece di mostrarli e basta.
        const { data, error } = await supabase
          .from("ddt_annullati")
          .select("*")
          .order("ddt_numero");
        if (error) return failure(error);
        return { success: true, annullati: data || [] };
      }
      case "evadiParziale": {
        // Spacca l'ordine: quello che ha i lotti va avanti, il resto nasce
        // come ordine nuovo "Da preparare". Tutto dentro una funzione sul
        // database: a meta' strada resterebbe merce fuori dai conti.
        const pp = parsePayload(params);
        const idOrdine = String(pp.orderId || pp.idOrdine || "").trim();
        if (!idOrdine) return { success: false, error: "orderId mancante" };
        const { data, error } = await supabase.rpc("evadi_parziale", { p_id_ordine: idOrdine });
        if (error) return failure(error);
        const r = Array.isArray(data) ? data[0] : data;
        return { success: true, ...r };
      }
      case "getDatiVivi":
        // Il nodo vivo da solo: ordini attivi, lotti, prodotti, assegnazioni.
        return await caricaNodoVivo();
      case "impostaMetodoPagamento": {
        // Il metodo di pagamento E la scadenza della partita, insieme. Il
        // database rifiuta un metodo che non sa leggere (metodo_pagamento_canonico
        // ritorna NULL): meglio un errore in faccia che una scadenza inventata.
        const pm = parsePayload(params);
        const idOrdine = String(pm.orderId || pm.idOrdine || "").trim();
        const metodo = String(pm.metodo || pm.metodo_pagamento || "").trim();
        if (!idOrdine) return { success: false, error: "orderId mancante" };
        if (!metodo) return { success: false, error: "metodo mancante" };
        const { data, error } = await supabase.rpc("imposta_metodo_pagamento", {
          p_id_ordine: idOrdine,
          p_metodo: metodo,
          p_operatore: String(pm.operatore || "").trim(),
        });
        if (error) return failure(error);
        const r = Array.isArray(data) ? data[0] : data;
        return {
          success: true,
          metodo: r?.metodo || metodo,
          scadenza: r?.scadenza || "",
          giorni: r?.giorni ?? null,
          aggiornataCashflow: !!r?.aggiornata_cashflow,
        };
      }
      case "salvaDestinazione": {
        // Crea o aggiorna un punto di consegna. Se lo si marca predefinito,
        // gli altri dello stesso cliente smettono di esserlo: un indice unico
        // impedisce che ce ne siano due, e con due la merce puo' partire per
        // il negozio sbagliato senza che nessuno abbia sbagliato.
        const d = parsePayload(params);
        const cod = String(d.codice_cliente || "").trim();
        if (!cod) return { success: false, error: "codice cliente mancante" };
        const id = String(d.id || "").trim() || `DEST-${cod}-${Date.now()}`;
        if (d.predefinita) {
          await supabase.from("clienti_destinazioni")
            .update({ predefinita: false }).eq("codice_cliente", cod).neq("id", id);
        }
        const row = {
          id, codice_cliente: cod,
          etichetta: String(d.etichetta || "Sede").trim() || "Sede",
          insegna: d.insegna || null, via: d.via || null, civico: d.civico || null,
          cap: d.cap || null, localita: d.localita || null, provincia: d.provincia || null,
          telefono: d.telefono || null, orari_consegna: d.orari_consegna || null,
          giorno_chiusura: d.giorno_chiusura || null, note: d.note || null,
          predefinita: !!d.predefinita, attiva: d.attiva === false ? false : true,
          fonte: "manuale", aggiornato_il: new Date().toISOString(),
        };
        const { data, error } = await supabase
          .from("clienti_destinazioni").upsert(row, { onConflict: "id" }).select().maybeSingle();
        if (error) return failure(error);
        return { success: true, destinazione: data || row };
      }
      case "eliminaDestinazione": {
        const d = parsePayload(params);
        const id = String(d.id || "").trim();
        if (!id) return { success: false, error: "id mancante" };
        // Non si cancella: si disattiva. I DDT gia' emessi la nominano, e un
        // documento che rimanda a un indirizzo sparito non si legge piu'.
        const { error } = await supabase
          .from("clienti_destinazioni").update({ attiva: false }).eq("id", id);
        if (error) return failure(error);
        return { success: true };
      }
      case "tracciaLotti": {
        // Dove e' finito un lotto. Si cerca per ARTICOLO (codice o nome) o
        // direttamente per lotto: chi ha in mano un cartone legge il lotto,
        // chi ha una segnalazione parte dal prodotto.
        const pp = parsePayload(params);
        const q = String(pp.q || "").trim();
        if (q.length < 2) return { success: true, righe: [] };
        const like = `%${q}%`;
        const { data, error } = await supabase
          .from("v_tracciabilita_lotti")
          .select("*")
          .or(`lotto.ilike.${like},codice_prodotto.ilike.${like},prodotto.ilike.${like}`)
          .order("lotto")
          .limit(500);
        if (error) return failure(error);
        return { success: true, righe: data || [] };
      }
      case "getListiniPrezzi":
        return await getListiniPrezzi();
      case "cercaClienteStorico":
        return await cercaClienteStorico(params);
      case "collegaClienteStorico":
        return await collegaClienteStorico(params);
      case "assegnaNumeroDDT":
      case "prossimoNumeroDDT": // vecchio nome, stessa funzione
        return await assegnaNumeroDDT(params);
      case "getChatMessaggi":
        return await getChatMessaggi(params);
      case "inviaChatMessaggio":
        return await inviaChatMessaggio(params);
      case "createProduct":
        return await createProduct(params);
      case "updateProduct":
        return await updateProduct(params);
      case "deleteProduct":
        return await deleteProduct(params);
      case "addOrderLine":
        return await addOrderLine(params);
      case "updateOrderLine":
        return await updateOrderLine(params);
      case "deleteOrderLine":
        return await deleteOrderLine(params);
      case "deleteLine":
        return await deleteLine(params);
      case "deleteAssignment":
        return await deleteAssignment(params);
      case "updateLot":
        return await updateLot(params);
      case "archiveLot":
        return await archiveLot(params);
      case "deleteLot":
        return await deleteLot(params);
      case "createCliente":
        return await createCliente(params);
      case "updateCliente":
        return await updateCliente(params);
      case "deleteCliente":
        return await deleteCliente(params);
      case "getSituazioneGestionale":
        return await getSituazioneGestionale(params);
      case "getOrdiniDaApp":
        return await getOrdiniDaApp();
      case "spostaOrdineInOrdini":
        return await spostaOrdineInOrdini(params);
      case "rifiutaOrdineApp":
        return await rifiutaOrdineApp(params);
      default:
        return { success: false, error: `Azione non supportata: ${params.action}` };
    }
  } catch (e) {
    return failure(e);
  }
}

export default callSheetsApi;

// STORICO DEGLI STATI di un ordine: da cosa a cosa, quando, chi. Serve a
// rispondere a "perche' ci ha messo tanto" senza ricostruzioni a posteriori
// (Luca 13/08/2026).
export async function storicoStatiOrdine(idOrdine) {
  if (!idOrdine) return [];
  const { data, error } = await supabase
    .from("ordini_stati_log")
    .select("campo,valore_da,valore_a,quando,chi,dopo_giorni")
    .eq("id_ordine", String(idOrdine))
    .order("quando", { ascending: true })
    .limit(200);
  if (error) return [];
  return data || [];
}
