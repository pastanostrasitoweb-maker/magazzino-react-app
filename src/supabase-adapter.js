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

const supabase = createClient(SUPABASE_URL || "", SUPABASE_ANON_KEY || "", {
  auth: { persistSession: false, autoRefreshToken: false },
});

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
  DDT_Numero: row.ddt_numero ?? "",
  Motivo_Fermo: row.motivo_fermo ?? "",
  Unito_In: row.unito_in ?? "",
  Data_Ordine: toIsoString(row.data_ordine),
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
});
const mapAssegRow = (row) => ({
  ID_Assegnazione: String(row.id_assegnazione ?? ""),
  ID_Riga: String(row.id_riga ?? ""),
  ID_Lotto: String(row.id_lotto ?? ""),
  Codice_Lotto: row.codice_lotto ?? row.lotto ?? "",
  "Quantità_Assegnata": Number(row.quantita_assegnata ?? 0),
});

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

async function bulkLoad() {
  const [prodottiR, lottiR, ordiniR, clientiR] = await Promise.all([
    supabase.from("prodotti").select("*"),
    supabase.from("lotti").select("*").order("scadenza", { ascending: true, nullsFirst: false }),
    // Solo ordini ATTIVI (non archiviati): lo storico si carica a richiesta
    // (getOrdiniArchiviati). Niente scarico di 227+ ordini e ~1000 righe a ogni
    // apertura, e nessun taglio silenzioso al tetto di 1000 righe di PostgREST.
    supabase.from("ordini").select("*").or("archiviato.is.null,archiviato.eq.false"),
    // clienti: tabella nuova (06_clienti.sql). maybe non esiste su ambienti
    // non ancora migrati -> tollerante: se errore, lista vuota, app gira lo stesso.
    supabase.from("clienti").select("*").order("ragione_sociale", { ascending: true }),
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

  // ANAGRAFICA GAMMA nel selettore clienti (Luca 2026-07-17): la tabella
  // clienti locale e' vuota, ma clienti_gestionale (sync notturna TeamSystem,
  // ~2000 record) ha tutto. Si aggiunge come fonte del selettore ordini:
  // ID 'CLI-<codice>' cosi' l'ordine salva un id_cliente aggan ciabile da
  // badge pagamento e app agenti. Dedup sui codici gia' presenti in locale.
  const clienti = [...clientiLocali];
  try {
    const codici = new Set(clientiLocali.map((c) => String(c.Codice_Cliente_TS || "")));
    const PAGE = 1000;
    for (let from = 0; from < 20000; from += PAGE) {
      const { data, error } = await supabase
        .from("clienti_gestionale")
        .select("codice_cliente,ragione_sociale,piva,citta,cap,provincia,indirizzo,telefono,email")
        .order("codice_num")
        .range(from, from + PAGE - 1);
      if (error) break;
      for (const r of data || []) {
        const cod = String(r.codice_cliente || "");
        if (!cod || codici.has(cod) || !r.ragione_sociale) continue;
        clienti.push({
          ID_Cliente: `CLI-${cod}`,
          Ragione_Sociale: r.citta ? `${r.ragione_sociale} · ${r.citta}` : r.ragione_sociale,
          Categoria: "Anagrafica GAMMA",
          Categoria_TS: "",
          Codice_Cliente_TS: cod,
          PIVA: r.piva || "",
          Codice_Fiscale: "",
          Codice_Destinatario_TS: "",
          Fonte: "GAMMA",
          Attivo: true,
          Note: "",
          Cap: r.cap || "",
          Provincia: r.provincia || "",
          Citta: r.citta || "",
          Indirizzo: r.indirizzo || "",
          Telefono: r.telefono || "",
          Email: r.email || "",
        });
      }
      if (!data || data.length < PAGE) break;
    }
  } catch (_) {
    // anagrafica gestionale non disponibile: il selettore resta coi locali
  }

  // Anagrafiche degli ordini arrivati dall'APP agenti: lo snapshot JSON del
  // cliente (crm_clienti non e' leggibile da anon, ma lo snapshot viaggia
  // con l'ordine). Serve al semaforo "Anagrafica OK/KO" e al DDT.
  // Mappa: id_ordine_magazzino -> oggetto cliente.
  // Solo per gli ordini attivi (lo storico porta le sue anagrafiche a richiesta).
  const anagraficheApp = await anagrafichePerOrdini(activeOrderIds);

  // Layer di ARRICCHIMENTO nostro: tipologia cliente (HORECA/FARMA/GDO) e campi
  // anagrafica completati a mano, indicizzati per chiave cliente (P.IVA o nome).
  // Si sovrappone allo snapshot/GAMMA senza toccare la fonte. Best-effort.
  const overridesClienti = {};
  try {
    const { data } = await supabase.from("clienti_override").select("*");
    for (const r of data || []) {
      if (r && r.chiave) overridesClienti[String(r.chiave)] = r;
    }
  } catch (_) {
    // tabella non ancora creata: nessun override
  }

  return { prodotti, lotti, ordini, righeOrdine, assegnazioniLotti, clienti, anagraficheApp, overridesClienti };
}

// ---------- action handlers ----------

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
    .select("id_ordine, stato, archiviato, data_preparato")
    .or("archiviato.is.null,archiviato.eq.false")
    .lt("data_preparato", midnightIso);
  if (error) return failure(error);

  // Solo i PREPARATO si auto-archiviano a mezzanotte. Gli SPEDITI restano
  // nella loro sezione finche' non si preme Archivia (richiesta Luca: la
  // vista degli ordini usciti deve restare consultabile, es. review col team).
  const toArchive = (data || [])
    .filter((r) => String(r.stato || "").trim().toLowerCase() === "preparato")
    .map((r) => r.id_ordine);

  if (toArchive.length === 0) return { success: true };

  const up = await supabase
    .from("ordini")
    .update({ archiviato: true })
    .in("id_ordine", toArchive);
  if (up.error) return failure(up.error);
  return { success: true, archiviati: toArchive.length };
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
  const { data, error } = await supabase.rpc("assegna_lotto", {
    p_id_riga: String(idRiga),
    p_id_lotto: String(idLotto),
    p_quantita: quantita,
    p_operatore: String(operatore),
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

async function unarchiveOrder(params) {
  const idOrdine = params.orderId || params.idOrdine || params.ID_Ordine;
  if (!idOrdine) return { success: false, error: "orderId mancante" };
  const { error } = await supabase
    .from("ordini")
    .update({ archiviato: false })
    .eq("id_ordine", String(idOrdine));
  if (error) return failure(error);
  return { success: true };
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

  // Se l'ordine era PREPARATO, ripristino lo stock dei lotti (somma delle
  // assegnazioni per lotto, rincrementata su lotti.quantita_caricata).
  // Comportamento simmetrico a deleteOrder: l'ordine torna "Da preparare"
  // e il magazzino vede lo stock come prima della preparazione.
  const ordR = await supabase
    .from("ordini")
    .select("stato")
    .eq("id_ordine", String(idOrdine))
    .maybeSingle();
  if (ordR.error) return failure(ordR.error);
  const wasPreparato =
    String(ordR.data?.stato || "").trim().toLowerCase() === "preparato";

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

async function createOrder(params) {
  const p = parsePayload(params);
  const idOrdine = p.id || p.idOrdine || p.orderId || `ORD-${Date.now()}`;
  const cliente = p.customer || p.cliente || "";
  const idCliente = p.clienteId || p.idCliente || p.id_cliente || "";
  const note = p.notes || p.note || "";
  const dataOrdine = p.date || p.data_ordine || null;
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
    return {
      id_riga: String(lineId),
      id_ordine: String(idOrdine),
      id_prodotto: String(productId),
      descrizione_prodotto: descrizione,
      quantita_ordinata: qtaOrdinata,
      quantita_assegnata: 0,
      ordine_riga: ordineRiga,
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
  "indirizzo_spedizione", "insegna", "orari_consegna", "giorno_chiusura",
  "codice_univoco", "pec", "email", "telefono", "metodo_pagamento",
  "tipologia", "note",
];

async function saveClienteOverride(params) {
  const p = parsePayload(params);
  const chiave = String(p.chiave || "").trim();
  if (!chiave) return failure("chiave cliente mancante");
  const row = { chiave };
  for (const f of OVERRIDE_CLIENTE_FIELDS) {
    if (p[f] !== undefined) row[f] = p[f] === null ? null : String(p[f]);
  }
  row.operatore = p.operatore || "";
  row.aggiornato_il = new Date().toISOString();
  const { data, error } = await supabase
    .from("clienti_override")
    .upsert(row, { onConflict: "chiave" })
    .select()
    .maybeSingle();
  if (error) return failure(error);
  return { success: true, override: data || row };
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

// Prossimo numero DDT dell'anno, calcolato sul DB (con il caricamento snello lo
// storico non e' in memoria, quindi non si puo' contare sugli ordini caricati).
async function prossimoNumeroDDT(params) {
  const p = parsePayload(params);
  const anno = String(p.anno || new Date().getFullYear());
  const prefisso = `DDT-${anno}-`;
  try {
    const { data, error } = await supabase
      .from("ordini")
      .select("ddt_numero")
      .like("ddt_numero", `${prefisso}%`)
      .order("ddt_numero", { ascending: false })
      .limit(1);
    if (error) return failure(error);
    let seq = 1;
    const ultimo = data && data[0] && data[0].ddt_numero;
    if (ultimo) {
      const n = parseInt(String(ultimo).slice(prefisso.length), 10);
      if (!Number.isNaN(n)) seq = n + 1;
    }
    return { success: true, numero: `${prefisso}${String(seq).padStart(3, "0")}` };
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

  // Se l'ordine era gia' PREPARATO, lo stock dei lotti era stato scalato
  // da prepara_ordine. Eliminando l'ordine ripristiniamo lo stock (somma
  // delle assegnazioni per lotto, rincrementata su lotti.quantita_caricata).
  // Se l'ordine non era preparato, nessuna ripristino (lo stock fisico non
  // era stato toccato).
  const ordR = await supabase
    .from("ordini")
    .select("stato")
    .eq("id_ordine", String(idOrdine))
    .maybeSingle();
  if (ordR.error) return failure(ordR.error);
  const isPreparato =
    String(ordR.data?.stato || "").trim().toLowerCase() === "preparato";

  const stockMovements = [];

  if (isPreparato) {
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

  return { success: true, stockMovements, orderWasPrepared: isPreparato };
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

  const { data, error } = await supabase
    .from("righe_ordine")
    .insert({
      id_riga: String(idRiga),
      id_ordine: String(idOrdine),
      id_prodotto: String(idProdotto),
      descrizione_prodotto: descrizione,
      quantita_ordinata: qty,
      quantita_assegnata: 0,
      ordine_riga: rowOrder,
    })
    .select()
    .maybeSingle();
  if (error) return failure(error);
  return { success: true, lineId: String(idRiga), riga: data };
}

async function updateOrderLine(params) {
  const p = parsePayload(params);
  const idRiga = p.lineId || p.idRiga || p.ID_Riga;
  if (!idRiga) return { success: false, error: "lineId mancante" };

  const patch = {};
  if (p.qtyOrdered !== undefined) patch.quantita_ordinata = Number(p.qtyOrdered);
  if (p.quantita !== undefined) patch.quantita_ordinata = Number(p.quantita);
  if (p.productName !== undefined) patch.descrizione_prodotto = p.productName;
  if (p.descrizione !== undefined) patch.descrizione_prodotto = p.descrizione;
  if (p.rowOrder !== undefined) patch.ordine_riga = Number(p.rowOrder);

  const { error } = await supabase
    .from("righe_ordine")
    .update(patch)
    .eq("id_riga", String(idRiga));
  if (error) return failure(error);
  return { success: true };
}

// Helper: se l'ordine collegato a una riga era PREPARATO, ripristina lo stock
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
  const wasPreparato =
    String(ordR.data?.stato || "").trim().toLowerCase() === "preparato";
  if (!wasPreparato) return { stockMovements: [], orderReopened: false };

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

async function createCliente(params) {
  const p = parsePayload(params);
  const ragione = (p.ragioneSociale || p.ragione_sociale || p.nome || "").trim();
  if (!ragione) return { success: false, error: "Ragione sociale mancante" };

  const idCliente = p.id || p.idCliente || `CLI-${Date.now()}`;
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
  if (error) return failure(error);
  return { success: true, cliente: data };
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
async function getSituazioneGestionale() {
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
    // CARTONE BOLLATO (Luca 2026-07-30): la merce sotto i 30 giorni si regala
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
    return {
      lineId: `RIGA-${Date.now()}-${i}`,
      productId,
      productName: `${r.descrizione_prodotto || r.codice || ""}${marker}${sr}`,
      // Il magazzino conta in CARTONI: l'app manda r.colli (cartoni) e
      // r.quantita_ordinata (pezzi). I pezzi sciolti dei polybox frozen
      // hanno colli null e restano a pezzi. (Bug 1 crt -> 8 crt, 2026-07-17.)
      qtyOrdered: Number(r.colli ?? r.quantita_ordinata ?? 0),
      rowOrder: i + 1,
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
      case "prossimoNumeroDDT":
        return await prossimoNumeroDDT(params);
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
        return await getSituazioneGestionale();
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
