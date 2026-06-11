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

// ---------- bulk load ----------

async function bulkLoad() {
  const [prodottiR, lottiR, ordiniR, righeR, assegR] = await Promise.all([
    supabase.from("prodotti").select("*"),
    supabase.from("lotti").select("*").order("scadenza", { ascending: true, nullsFirst: false }),
    supabase.from("ordini").select("*"),
    supabase.from("righe_ordine").select("*"),
    supabase.from("assegnazioni_lotti").select("*"),
  ]);

  for (const r of [prodottiR, lottiR, ordiniR, righeR, assegR]) {
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

  const ordini = (ordiniR.data || []).map((row) => ({
    ID_Ordine: String(row.id_ordine ?? ""),
    Cliente: row.cliente ?? "",
    Note: row.note ?? "",
    Data_Preparato: toIsoString(row.data_preparato),
    Archiviato: boolToSiNo(row.archiviato),
    Stato: row.stato ?? "Da preparare",
    Stato_Lavorazione: row.stato_lavorazione ?? "",
    Data_Ordine: toIsoString(row.data_ordine),
    Colli: row.colli === null || row.colli === undefined ? "" : Number(row.colli),
  }));

  const righeOrdine = (righeR.data || []).map((row) => ({
    ID_Riga: String(row.id_riga ?? ""),
    ID_Ordine: String(row.id_ordine ?? ""),
    ID_Prodotto: String(row.id_prodotto ?? ""),
    Descrizione_Prodotto: row.descrizione_prodotto ?? "",
    Ordine_Riga: Number(row.ordine_riga ?? 0),
    "Quantità_Ordinata": Number(row.quantita_ordinata ?? 0),
    Quantita_Assegnata: Number(row.quantita_assegnata ?? 0),
  }));

  const assegnazioniLotti = (assegR.data || []).map((row) => ({
    ID_Assegnazione: String(row.id_assegnazione ?? ""),
    ID_Riga: String(row.id_riga ?? ""),
    ID_Lotto: String(row.id_lotto ?? ""),
    Codice_Lotto: row.codice_lotto ?? row.lotto ?? "",
    "Quantità_Assegnata": Number(row.quantita_assegnata ?? 0),
  }));

  return { prodotti, lotti, ordini, righeOrdine, assegnazioniLotti };
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

  if (!allowNegative) {
    const { data, error } = await supabase.rpc("assegna_lotto", {
      p_id_riga: String(idRiga),
      p_id_lotto: String(idLotto),
      p_quantita: quantita,
      p_operatore: String(operatore),
    });
    if (error) return failure(error);
    const row = Array.isArray(data) ? data[0] : data;
    return {
      success: true,
      assignmentId: row?.id_assegnazione || row?.ID_Assegnazione || null,
      row,
    };
  }

  // allowNegative=true: bypassa il check disponibilita della rpc.
  // Scrive direttamente in assegnazioni_lotti (upsert per coppia id_riga+id_lotto)
  // poi riallinea righe_ordine.quantita_assegnata. Usato per "lotto al volo"
  // dove la giacenza fisica e' inferiore alla quantita assegnata: il lotto andra'
  // in negativo dopo prepara_ordine ed e' un comportamento voluto.
  const lottoR = await supabase
    .from("lotti")
    .select("id_lotto, id_prodotto, codice_lotto, lotto")
    .eq("id_lotto", String(idLotto))
    .maybeSingle();
  if (lottoR.error) return failure(lottoR.error);
  if (!lottoR.data) return { success: false, error: `Lotto ${idLotto} inesistente` };

  const existing = await supabase
    .from("assegnazioni_lotti")
    .select("id_assegnazione")
    .eq("id_riga", String(idRiga))
    .eq("id_lotto", String(idLotto))
    .maybeSingle();
  if (existing.error) return failure(existing.error);

  let row;
  if (existing.data) {
    const upd = await supabase
      .from("assegnazioni_lotti")
      .update({
        quantita_assegnata: quantita,
        data_ora: new Date().toISOString(),
        operatore: String(operatore),
        id_prodotto: lottoR.data.id_prodotto,
        codice_lotto: lottoR.data.codice_lotto,
        lotto: lottoR.data.lotto,
      })
      .eq("id_assegnazione", existing.data.id_assegnazione)
      .select()
      .single();
    if (upd.error) return failure(upd.error);
    row = upd.data;
  } else {
    const ins = await supabase
      .from("assegnazioni_lotti")
      .insert({
        id_assegnazione: "ASS-" + Date.now(),
        id_riga: String(idRiga),
        id_lotto: String(idLotto),
        id_prodotto: lottoR.data.id_prodotto,
        codice_lotto: lottoR.data.codice_lotto,
        lotto: lottoR.data.lotto,
        quantita_assegnata: quantita,
        data_ora: new Date().toISOString(),
        operatore: String(operatore),
      })
      .select()
      .single();
    if (ins.error) return failure(ins.error);
    row = ins.data;
  }

  // Riallinea righe_ordine.quantita_assegnata
  const sumR = await supabase
    .from("assegnazioni_lotti")
    .select("quantita_assegnata")
    .eq("id_riga", String(idRiga));
  if (!sumR.error) {
    const tot = (sumR.data || []).reduce((s, r) => s + Number(r.quantita_assegnata || 0), 0);
    await supabase.from("righe_ordine").update({ quantita_assegnata: tot }).eq("id_riga", String(idRiga));
  }

  return {
    success: true,
    assignmentId: row?.id_assegnazione || null,
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
  if (p.notes !== undefined) patch.note = p.notes;
  if (p.note !== undefined) patch.note = p.note;
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

async function markOrderStopped(params) {
  const idOrdine = params.orderId || params.idOrdine;
  if (!idOrdine) return { success: false, error: "orderId mancante" };
  const { error } = await supabase
    .from("ordini")
    .update({ stato_lavorazione: "Fermato" })
    .eq("id_ordine", String(idOrdine));
  if (error) return failure(error);
  return { success: true };
}

async function reopenOrder(params) {
  const idOrdine = params.orderId || params.idOrdine;
  if (!idOrdine) return { success: false, error: "orderId mancante" };
  // NOTA: NON ripristina lo stock dei lotti. Le quantità già scalate restano
  // così — l'ordine torna "Da preparare" ma la giacenza fisica già rimossa
  // dai lotti rimane scalata. Confronta con il vecchio backend Apps Script
  // che invece ripristinava le quantità. Da rivedere se serve symmetry.
  const { error } = await supabase
    .from("ordini")
    .update({
      stato: "Da preparare",
      data_preparato: null,
      stato_lavorazione: "In lavorazione",
    })
    .eq("id_ordine", String(idOrdine));
  if (error) return failure(error);
  return { success: true };
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

  return { success: true, ordine: row, stockMovements, stockWarnings: [] };
}

async function createOrder(params) {
  const p = parsePayload(params);
  const idOrdine = p.id || p.idOrdine || p.orderId || `ORD-${Date.now()}`;
  const cliente = p.customer || p.cliente || "";
  const note = p.notes || p.note || "";
  const dataOrdine = p.date || p.data_ordine || null;
  const stato = p.status || p.stato || "Da preparare";
  const statoLav = p.workStatus || p.stato_lavorazione || "Nuovo";

  const insOrder = await supabase
    .from("ordini")
    .insert({
      id_ordine: String(idOrdine),
      cliente,
      note,
      data_ordine: dataOrdine,
      stato,
      stato_lavorazione: statoLav,
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

async function deleteOrder(params) {
  const idOrdine = params.orderId || params.idOrdine;
  if (!idOrdine) return { success: false, error: "orderId mancante" };
  const { error } = await supabase
    .from("ordini")
    .delete()
    .eq("id_ordine", String(idOrdine));
  if (error) return failure(error);
  return { success: true };
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

async function deleteLine(params) {
  const idRiga = params.lineId || params.idRiga;
  if (!idRiga) return { success: false, error: "lineId mancante" };
  const { error } = await supabase
    .from("righe_ordine")
    .delete()
    .eq("id_riga", String(idRiga));
  if (error) return failure(error);
  return { success: true };
}

async function deleteAssignment(params) {
  const idAss = params.assignmentId || params.idAssegnazione;
  if (!idAss) return { success: false, error: "assignmentId mancante" };
  const { error } = await supabase.rpc("rimuovi_assegnazione", {
    p_id_assegnazione: String(idAss),
  });
  if (error) return failure(error);
  return { success: true };
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

// ---------- public entry ----------

export async function callSheetsApi(params = {}) {
  try {
    // Bulk load: nessuna action.
    if (!params || !params.action) {
      return await bulkLoad();
    }

    switch (params.action) {
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
      default:
        return { success: false, error: `Azione non supportata: ${params.action}` };
    }
  } catch (e) {
    return failure(e);
  }
}

export default callSheetsApi;
