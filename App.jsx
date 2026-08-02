// hotfix assegnazione prodotti senza lotto su ID disponibilità reale
import React, { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { callSheetsApi, aggiornaStatoOrdineApp } from "./src/supabase-adapter.js";
import { PESI_PRODOTTI } from "./src/pesi-prodotti.js";
import { calcolaPreventivo, temperaturaLabel } from "./src/logistica/preventivo.js";
import {
  Package,
  ClipboardList,
  Search,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Boxes,
  Trash2,
  Lock,
  Pencil,
  RefreshCw,
  Clock,
  Archive,
  RotateCcw,
  Users,
  Smartphone,
  ThumbsUp,
  ThumbsDown,
  Camera,
  MessageCircle,
  Mic,
  Send,
  Truck,
} from "lucide-react";

// Storico: backend Apps Script (JSONP) usato fino al 2026-06-09, ora sostituito
// da Supabase via ./src/supabase-adapter.js. URL mantenuto come riferimento
// per il commit history e per eventuale rollback.
// const SHEETS_API_URL =
//   "https://script.google.com/macros/s/AKfycbxNom4UmYHZhcUNKBJt5BOtDEWzRiCKdiiXl-_3Na3qAONmzLqTRpxyU0gOaLLuffQE/exec";
const ADMIN_PIN = "1234";

const fallbackProducts = [
  { id: "1", code: "NFARMA 013", name: "Pici 250", uom: "pz", category: "", subcategory: "" },
  { id: "2", code: "NFARMA 007", name: "Tonnarelli 250", uom: "pz", category: "", subcategory: "" },
];

const fallbackLots = [
  { id: "1", productId: "1", lot: "2604104", expiry: "2026-05-06", loadedQty: 34 },
  { id: "2", productId: "2", lot: "2604108", expiry: "2026-05-08", loadedQty: 18 },
];

// callSheetsApi è ora importato da ./src/supabase-adapter.js (vedi top file).
// Mantiene la firma originale: chiamata senza args = bulk load, con
// { action, ...payload } = singola azione. Il body interno è cambiato (Supabase
// invece di JSONP→Apps Script) ma lo shape di risposta è identico, quindi i
// 27 call sites non richiedono modifiche.

function getField(row, keys) {
  for (const key of keys) {
    if (row?.[key] !== undefined && row?.[key] !== null && row?.[key] !== "") return row[key];
  }
  return "";
}

function fmtDate(date) {
  if (!date) return "";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return String(date);
  return d.toLocaleDateString("it-IT");
}

function cardStyle(extra = {}) {
  return {
    background: "rgba(255,255,255,0.96)",
    border: "1px solid #dce4f0",
    borderRadius: 26,
    boxShadow: "0 10px 30px rgba(15,23,42,0.06)",
    minWidth: 0,
    boxSizing: "border-box",
    ...extra,
  };
}

function btnStyle(variant = "primary", disabled = false) {
  const base = {
    height: 50,
    borderRadius: 16,
    border: "1px solid transparent",
    padding: "0 18px",
    fontSize: 15,
    fontWeight: 850,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
    whiteSpace: "nowrap",
    boxSizing: "border-box",
    transition: "transform 120ms ease, box-shadow 120ms ease, background 120ms ease",
  };

  if (variant === "outline") {
    return {
      ...base,
      background: "#fff",
      color: "#0b1638",
      border: "1px solid #cfd8e6",
      boxShadow: "0 4px 12px rgba(15,23,42,0.04)",
    };
  }

  if (variant === "soft") {
    return {
      ...base,
      background: "#edf2f8",
      color: "#1d2a44",
    };
  }

  if (variant === "success") {
    return {
      ...base,
      background: "linear-gradient(135deg, #16813d, #0f6b32)",
      color: "#fff",
      boxShadow: "0 10px 22px rgba(22,129,61,0.22)",
    };
  }

  if (variant === "danger") {
    return {
      ...base,
      background: "#fff",
      color: "#991b1b",
      border: "1px solid #fecaca",
    };
  }

  return {
    ...base,
    background: "linear-gradient(135deg, #07153a, #0d225d)",
    color: "#fff",
    boxShadow: "0 8px 18px rgba(7,21,58,0.16)",
  };
}


function compactBtnStyle(variant = "primary", disabled = false) {
  const base = btnStyle(variant, disabled);

  return {
    ...base,
    height: 40,
    borderRadius: 14,
    padding: "0 12px",
    fontSize: 13,
    fontWeight: 800,
  };
}

function inputStyle() {
  return {
    width: "100%",
    height: 50,
    borderRadius: 16,
    border: "1px solid #cfd8e6",
    padding: "0 14px",
    fontSize: 15,
    outline: "none",
    background: "#fff",
    boxSizing: "border-box",
  };
}


function compactInputStyle() {
  return {
    ...inputStyle(),
    height: 42,
    borderRadius: 14,
    fontSize: 14,
    padding: "0 10px",
  };
}

function labelStyle() {
  return {
    display: "block",
    fontSize: 15,
    fontWeight: 700,
    marginBottom: 8,
    color: "#1f2937",
  };
}

function badgeStyle(kind = "outline") {
  const variants = {
    outline: { border: "1px solid #d8dee8", background: "#fff", color: "#243043" },
    success: { border: "1px solid #bfe7c8", background: "#eefbf2", color: "#166534" },
    warning: { border: "1px solid #fed7aa", background: "#fff7ed", color: "#b45309" },
    dark: { border: "1px solid #07153a", background: "#07153a", color: "#fff" },
    danger: { border: "1px solid #fecaca", background: "#fff1f2", color: "#991b1b" },
  };

  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    padding: "6px 12px",
    fontSize: 12,
    fontWeight: 850,
    lineHeight: 1,
    ...(variants[kind] || variants.outline),
  };
}


// Formatta un peso in kg all'italiana (max 2 decimali).
function fmtKg(kg) {
  return Number(kg || 0).toLocaleString("it-IT", { maximumFractionDigits: 2 });
}

// Euro all'italiana.
function fmtEur(n) {
  return Number(n || 0).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Temperatura di spedizione dell'ordine, dedotta dai prodotti (vince il piu'
// freddo): surgelato -18 → frozen (a collo/poly box), pasta fresca → fresh,
// resto → secco. Ordini misti: se c'e' del surgelato tutto va gestito frozen.
function temperaturaOrdine(lines) {
  const txt = (lines || [])
    .map((l) => `${l.category || ""} ${l.productName || ""}`)
    .join(" ")
    .toLowerCase();
  if (/-18|frozen|surgel/.test(txt)) return "frozen";
  if (/fresc|frigo|refriger/.test(txt)) return "fresh";
  return "secco";
}

// Aspetto del badge trasporto: verde col corriere+costo se calcolato,
// grigio con il motivo se manca un dato (CAP/peso).
function transportBadgeInfo(transport) {
  if (!transport || transport.errore) {
    return { kind: "outline", label: `Trasporto: ${transport?.errore || "n/d"}`, ok: false };
  }
  const c = transport.consigliato;
  return { kind: "success", label: `${c.corriere} · ${fmtEur(c.totale)} €`, ok: true };
}

// Campi anagrafici OBBLIGATORI per un cliente arrivato dall'APP agenti
// (lista Luca 2026-07-23). Se ne manca uno l'anagrafica e' in errore e
// l'ordine non puo' caricare i lotti finche' non viene completata.
// L'insegna e' richiesta solo se diversa dalla ragione sociale: non blocca.
function checkAnagraficaApp(cli) {
  const has = (v) => String(v ?? "").trim() !== "";
  const mancanti = [];
  if (!has(cli.ragione_sociale)) mancanti.push("Ragione sociale");
  if (!has(cli.partita_iva)) mancanti.push("Partita IVA");
  if (!has(cli.sede_legale) && !has(cli.indirizzo)) mancanti.push("Sede legale");
  if (!has(cli.cap)) mancanti.push("CAP");
  if (!has(cli.indirizzo_spedizione)) mancanti.push("Indirizzo di spedizione");
  if (!has(cli.orari_consegna) && !has(cli.orario_scarico))
    mancanti.push("Orario di scarico (finestra di almeno 3 ore)");
  if (!has(cli.giorno_chiusura)) mancanti.push("Giorno di chiusura");
  if (!has(cli.codice_univoco) && !has(cli.pec)) mancanti.push("Codice univoco o PEC");
  if (!has(cli.email)) mancanti.push("Email");
  if (!has(cli.telefono)) mancanti.push("Telefono referente");
  if (!has(cli.metodo_pagamento)) mancanti.push("Metodo di pagamento");
  return mancanti;
}

// Tipologie cliente allineabili a mano (richiesta Luca 2026-07-24).
const TIPOLOGIE = ["HORECA", "FARMA", "GDO", "EXPORT", "BIOLOGICO"];

// IVA. Le prime tre sono aliquote vere, le altre sono REGIMI che valgono per
// tutto il documento e azzerano l'imposta (regola di Luca 02/08/2026).
// Aliquote scegliibili sulla singola riga. Con aliquota 0 la fattura
// elettronica NON basta a zero: vuole la NATURA, altrimenti lo SdI scarta il
// documento. Percio' le due voci a zero portano gia' il codice giusto
// (Luca 02/08/2026).
//   N3.1 = esportazioni fuori UE, art. 8 DPR 633/72
//   N3.2 = cessioni intracomunitarie, art. 41 DL 331/93
const ALIQUOTE_IVA = [
  { valore: 4, natura: "", etichetta: "4%" },
  { valore: 10, natura: "", etichetta: "10%" },
  { valore: 22, natura: "", etichetta: "22%" },
  { valore: 0, natura: "N3.1", etichetta: "0% Extra UE · non imp. art. 8 (N3.1)" },
  { valore: 0, natura: "N3.2", etichetta: "0% UE · non imp. art. 41 (N3.2)" },
];

// Chiave della tendina: con due voci a zero il solo numero non basta.
const chiaveAliquota = (a) => `${a.valore}|${a.natura || ""}`;
// Regimi del documento. Attenzione: lo split payment NON e' una natura e NON
// azzera l'aliquota. In fattura elettronica l'IVA resta quella normale e cambia
// solo l'esigibilita' (EsigibilitaIVA = "S", scissione dei pagamenti): il
// cliente la versa allo Stato invece che a noi. Quindi qui non si tocca
// l'aliquota, si toglie solo dal totale che il cliente ci paga.
const REGIMI_IVA = [
  { key: "normale", label: "IVA normale", natura: "", esigibilita: "", ivaEsiste: true, ivaAlCliente: true },
  {
    key: "split",
    label: "Split payment · scissione dei pagamenti (EsigibilitaIVA S)",
    natura: "",
    esigibilita: "S",
    ivaEsiste: true,      // l'imposta c'e'...
    ivaAlCliente: false,  // ...ma la versa il cliente allo Stato, non a noi
  },
  {
    key: "estero_extra_ue",
    label: "Estero Extra UE · non imponibile art. 8 (N3.1)",
    natura: "N3.1",
    esigibilita: "",
    ivaEsiste: false,
    ivaAlCliente: false,
  },
  {
    key: "estero_ue",
    label: "Estero UE · non imponibile art. 41 (N3.2)",
    natura: "N3.2",
    esigibilita: "",
    ivaEsiste: false,
    ivaAlCliente: false,
  },
];

// UN CLICK, UNA AZIONE (regola di Luca 02/08/2026). Fra il click e la risposta
// del server passano un paio di secondi: se l'operatore clicca tre volte non
// devono nascere tre ordini. Questo hook tiene una chiave "in corso" e scarta
// i click successivi finche' il primo non ha finito.
function useUnaAzioneAllaVolta() {
  const inCorso = useRef(new Set());
  const [attive, setAttive] = useState({});

  const esegui = useCallback(async (chiave, fn) => {
    if (inCorso.current.has(chiave)) return undefined; // click ripetuto: si ignora
    inCorso.current.add(chiave);
    setAttive((p) => ({ ...p, [chiave]: true }));
    try {
      return await fn();
    } finally {
      inCorso.current.delete(chiave);
      setAttive((p) => {
        const n = { ...p };
        delete n[chiave];
        return n;
      });
    }
  }, []);

  return { esegui, attive };
}

// Metodi di pagamento: lista CHIUSA, niente campo libero (regola di Luca
// 02/08/2026). A campo libero la stessa cosa era scritta in quattro modi:
// "Bonifico Fine Mese", "bonifico 30gg", "Bonifico 30FM", "Bonifico bancario a
// 30gg FM". Cosi' non si capiva niente e il Cashflow non poteva calcolare le
// scadenze. La lista ricalca gli strumenti che usiamo davvero in fattura
// (MP05 bonifico, MP12 Ri.Ba., MP02 assegno, MP01 contanti, MP08 carta)
// incrociati con i termini che pratichiamo.
const METODI_PAGAMENTO = [
  "Contrassegno contanti",
  "Contrassegno assegno",
  "Bonifico anticipato",
  "Bonifico alla consegna",
  "Bonifico 30 gg",
  "Bonifico 30 gg fine mese",
  "Bonifico 60 gg fine mese",
  "Bonifico 90 gg fine mese",
  "Ri.Ba. 30 gg fine mese",
  "Ri.Ba. 60 gg fine mese",
  "Ri.Ba. 90 gg fine mese",
  "Assegno",
  "Carta / POS",
  "Da concordare",
];

// Motivi rapidi per cui un ordine resta FERMO (Luca 2026-07-24). Il magazziniere
// tocca il motivo o lo scrive a mano; produzione e logistica lo vedono sul badge.
const MOTIVI_FERMO = [
  "Commessa: prodotto ad hoc da produrre",
  "In attesa di produzione",
  "Merce mancante / lotto non disponibile",
  "In attesa di conferma dal cliente",
  "Pagamento da verificare",
];

// Anagrafica incompleta: SEGNALA ma NON BLOCCA (decisione Luca 2026-07-28:
// "manda l'alert ma non bloccare il processo, segnalami la mancanza e vai
// avanti"). L'operativita' non si ferma mai per un dato mancante: l'ordine
// prosegue, il badge rosso e l'avviso al momento di segnare pronto ricordano
// di completarla.
// Per tornare a bloccare basta rimettere true (nessun'altra modifica serve).
const ANAGRAFICA_BLOCCA = false;

// Campi anagrafica completabili a mano (i 12 obbligatori della checklist Luca).
const ANAG_FIELDS = [
  { key: "ragione_sociale", label: "Ragione sociale" },
  { key: "partita_iva", label: "Partita IVA" },
  { key: "sede_legale", label: "Sede legale" },
  { key: "cap", label: "CAP" },
  { key: "indirizzo_spedizione", label: "Indirizzo di spedizione" },
  { key: "insegna", label: "Insegna (se diversa)" },
  { key: "orari_consegna", label: "Orario di scarico (finestra min 3 ore)" },
  { key: "giorno_chiusura", label: "Giorno di chiusura" },
  { key: "codice_univoco", label: "Codice univoco (SdI)" },
  { key: "pec", label: "PEC" },
  { key: "email", label: "Email" },
  { key: "telefono", label: "Telefono referente" },
  { key: "metodo_pagamento", label: "Metodo di pagamento" },
];

// Normalizza un canale/settore grezzo verso una delle tipologie standard.
function normalizeTipologia(raw) {
  const s = String(raw || "").toLowerCase();
  if (!s) return "";
  if (/horeca|ho\.?re\.?ca|ristora|hotel|\bbar\b|catering|pizzer/.test(s)) return "HORECA";
  if (/farma|pharma|farmacia|parafarm/.test(s)) return "FARMA";
  if (/gdo|grande distribuzione|supermerc|iper\b|discount/.test(s)) return "GDO";
  if (/export|estero|foreign|sagl|gmbh|s\.?a\.?r\.?l|ltd/.test(s)) return "EXPORT";
  if (/biolog|\bbio\b|naturasi|erboris/.test(s)) return "BIOLOGICO";
  return "";
}

// Riduce una foto (File) a data URL JPEG, lato lungo max ~1400px, qualita' 0.7:
// la bolla resta leggibile ma pesa poco (~100-250KB) in acq_ricevimenti_foto.
function riduciImmagine(file, maxLato = 1400, qualita = 0.7) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("lettura file fallita"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("immagine non valida"));
      img.onload = () => {
        let { width, height } = img;
        if (width >= height && width > maxLato) {
          height = Math.round((height * maxLato) / width);
          width = maxLato;
        } else if (height > width && height > maxLato) {
          width = Math.round((width * maxLato) / height);
          height = maxLato;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", qualita));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// ---- BOLLINO SCADENZA SUI LOTTI (Luca 2026-07-31) ----
// Serve a vedere a colpo d'occhio, nella vista magazzino, cosa resta davvero
// vendibile a PREZZO PIENO e cosa invece e' ormai da bollinare.
// Regola cartoni bollati: sotto i 30 giorni di vita residua il lotto non si
// vende, si regala. Fra 30 e 45 giorni e' in avvicinamento: si segnala prima,
// cosi' ci si organizza (e' il "ormai da bollinare").
// Guardia sui dati sporchi: scadenza assente o con anno < 2020 (es. il lotto
// "000000") NON e' attendibile -> nessun bollino, non si declassa niente.
const GIORNI_BOLLATO = 30;
const GIORNI_PREAVVISO_BOLLATO = 45;

function bollinoScadenza(expiry, oggiMs) {
  if (!expiry) return null;
  const d = new Date(expiry);
  if (Number.isNaN(d.getTime()) || d.getFullYear() < 2020) return null;
  const giorni = Math.floor((d.getTime() - oggiMs) / 86400000);
  if (giorni < 0) {
    return { tipo: "scaduto", giorni, kind: "danger", label: "⛔ SCADUTO" };
  }
  if (giorni < GIORNI_BOLLATO) {
    return {
      tipo: "bollato",
      giorni,
      kind: "danger",
      label: `🏷️ DA BOLLINARE · ${giorni} gg`,
    };
  }
  if (giorni < GIORNI_PREAVVISO_BOLLATO) {
    return {
      tipo: "in-avvicinamento",
      giorni,
      kind: "warning",
      label: `⏳ ${giorni} gg`,
    };
  }
  return null; // vendibile a prezzo pieno: nessun bollino, la riga resta pulita
}

// Stato pagamento di un ordine → aspetto del badge. "ok" verde, "ko" rosso,
// vuoto = "Da verificare" (grigio).
function paymentBadgeInfo(status) {
  const s = String(status || "").trim().toLowerCase();
  if (s === "ok") return { kind: "success", label: "Pagamento OK" };
  if (s === "ko") return { kind: "danger", label: "Pagamento KO" };
  return { kind: "outline", label: "Pagamento da verificare" };
}

// ---- Badge pagamento AUTO dallo scaduto TeamSystem (Luca 2026-07-16) ----
// Il flag manuale (ok/ko) VINCE SEMPRE. Se non impostato, il badge si colora
// da solo: cliente con scaduto a gestionale → rosso; cliente pulito → verde.
// Il match ordine→cliente e' per NOME (il magazzino scrive il cliente a testo
// libero) con criterio CONSERVATIVO a token: tutte le parole significative
// devono stare nel nome gestionale (o viceversa) e il candidato deve essere
// UNICO. Niente match → resta "Da verificare" (come oggi). Misurato: ~70%
// dei nomi ordine matcha; i non matchati sono per lo piu' non-clienti
// (campionature, spedizioni interne).
const PAYMENT_MATCH_STOPWORDS = new Set([
  "SRL", "SRLS", "SAS", "SNC", "SPA", "DI", "DEI", "DEL", "DELLA", "DELLE",
  "LA", "IL", "LO", "E", "C", "SOCIETA", "A", "RESPONSABILITA", "LIMITATA",
  "SEMPLIFICATA", "RIST", "RISTORANTE", "FARMACIA",
]);

function paymentNameTokens(name) {
  const clean = String(name || "").toUpperCase().replace(/[^A-Z0-9À-Ù ]/g, " ");
  return new Set(
    clean.split(/\s+/).filter((t) => t.length >= 3 && !PAYMENT_MATCH_STOPWORDS.has(t))
  );
}

const isSubset = (a, b) => [...a].every((t) => b.has(t));

// Costruisce il matcher nome-ordine → codice cliente gestionale (con cache:
// gli stessi nomi tornano a ogni render). anagrafica = [{codice, nome}].
function buildPaymentMatcher(anagrafica) {
  const indice = (anagrafica || [])
    .map((c) => ({ codice: c.codice, tokens: paymentNameTokens(c.nome) }))
    .filter((c) => c.tokens.size > 0);
  const cache = new Map();
  return (nomeOrdine) => {
    const key = String(nomeOrdine || "").trim().toUpperCase();
    if (!key) return null;
    if (cache.has(key)) return cache.get(key);
    const T = paymentNameTokens(key);
    let result = null;
    if (T.size > 0) {
      let diretti = new Set();
      for (const c of indice) if (isSubset(T, c.tokens)) diretti.add(c.codice);
      if (diretti.size === 1) result = [...diretti][0];
      else if (diretti.size === 0) {
        const inversi = new Set();
        for (const c of indice) if (isSubset(c.tokens, T)) inversi.add(c.codice);
        if (inversi.size === 1) result = [...inversi][0];
      }
    }
    cache.set(key, result);
    return result;
  };
}

// "CLI-1668" -> "1668" · "1668" -> "1668". Gli ordini che arrivano dall'app
// agenti portano il codice cliente GESTIONALE (tutto numerico) in clientId:
// match ESATTO al 100%, senza ambiguita' di nome.
// ATTENZIONE: gli ordini creati nel magazzino usano un id INTERNO tipo
// "CLI-fa68...c031551" (hex): NON e' un codice gestionale. Quindi si accetta
// SOLO "CLI-<solo cifre>" (o solo cifre); tutto il resto -> null -> match nome.
function codiceDaClientId(clientId) {
  const id = String(clientId || "").trim();
  const m = id.match(/^(?:CLI-)?(\d+)$/i);
  return m ? m[1] : null;
}

// Badge effettivo di un ordine: manuale se impostato, altrimenti auto dallo
// scaduto. gest = { scaduti: {codice:{importo,num}}, matcher } oppure null.
// Match cliente: prima per CODICE (ordini app agenti, esatto), poi per NOME.
function paymentBadgeFor(order, gest) {
  const manual = String(order?.paymentStatus || "").trim().toLowerCase();
  if (manual === "ok" || manual === "ko" || !gest) return paymentBadgeInfo(manual);
  const codice = codiceDaClientId(order?.clientId) || gest.matcher(order?.customer);
  if (!codice) return paymentBadgeInfo("");
  const sc = gest.scaduti[codice];
  if (sc) {
    const importo = sc.importo.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    // La fonte NON e' il gestionale: clienti_scaduto viene riscritta ogni ora da
    // cf_pubblica_esposizione() a partire dalle partite del Cashflow, cioe' da
    // Sibill piu' le chiusure fatte a mano. L'etichetta diceva "a gestionale" ed
    // era fuorviante: fa credere che ignori le riconciliazioni, mentre le usa.
    return { kind: "danger", label: `Scaduto a Cashflow · ${importo} €`, auto: true };
  }
  return { kind: "success", label: "Pagamento OK · auto", auto: true };
}

function productCategoryLabel(product) {
  return [product?.category, product?.subcategory].filter(Boolean).join(" › ");
}

function productOptionLabel(product) {
  const categoryLabel = productCategoryLabel(product);
  const baseLabel = [product?.code, product?.name].filter(Boolean).join(" · ");

  return categoryLabel ? `${categoryLabel} · ${baseLabel}` : baseLabel;
}


function productManagesLots(product) {
  // Decisione operativa: TUTTI gli articoli gestiscono il lotto. In carica
  // lotto ogni prodotto deve poter caricare codice lotto + scadenza, non solo
  // quelli marcati "gestione lotti". (Richiesta Luca, riunione magazziniere.)
  return true;
}

function productStockModeLabel(product) {
  return productManagesLots(product) ? "Gestione lotti" : "Lotto DISPONIBILITA";
}

const OUTSIDE_STOCK_PRODUCT_ID = "FUORI_MAGAZZINO";

function isOutsideStockLine(line) {
  return (
    line?.isOutsideStock ||
    String(line?.productId || "").startsWith(OUTSIDE_STOCK_PRODUCT_ID)
  );
}

// Codici a lotto FACOLTATIVO (HORECA, BIS): articoli di magazzino a tutti gli
// effetti (giacenza, impegnato, disponibile) ma senza obbligo di lotto. Se c'e'
// un lotto lo si usa; altrimenti si movimenta il codice articolo senza lotto.
// (Richiesta Luca.)
const LOT_OPTIONAL_PREFIXES = ["HORECA", "BIS"];

function isLotOptionalProduct(product) {
  const key = String(product?.code || product?.id || "").trim().toUpperCase();
  return LOT_OPTIONAL_PREFIXES.some((prefix) => key.startsWith(prefix));
}

function miniStatStyle(tone = "neutral") {
  const variants = {
    neutral: { background: "#f3f6fb", color: "#0f172a", border: "1px solid #dce4f0" },
    success: { background: "#eefbf2", color: "#166534", border: "1px solid #bfe7c8" },
    warning: { background: "#fff7ed", color: "#b45309", border: "1px solid #fed7aa" },
  };

  return {
    borderRadius: 16,
    padding: "9px 7px",
    textAlign: "center",
    minWidth: 54,
    boxShadow: "inset 0 -1px 0 rgba(15,23,42,0.04)",
    ...(variants[tone] || variants.neutral),
  };
}

function normalizeProducts(rows) {
  return rows
    .map((row, index) => ({
      id: String(
        getField(row, [
          "ID_Prodotto",
          "Id_Prodotto",
          "id",
          "Codice_Prodotto",
          "Codice prodotto",
        ]) || `PROD-${index + 1}`
      ),
      code: String(getField(row, ["Codice_Prodotto", "Codice prodotto", "Codice", "code"])).trim(),
      name: String(
        getField(row, ["Descrizione_Prodotto", "Descrizione prodotto", "Descrizione", "name"])
      ).trim(),
      uom: String(
        getField(row, ["UM", "U_M", "Unità_Misura", "Unità di misura", "uom"]) || "pz"
      ).trim(),
      category: String(
        getField(row, ["Categoria", "category", "Categoria_Prodotto", "Categoria prodotto"])
      ).trim(),
      subcategory: String(
        getField(row, [
          "Sottocategoria",
          "Sotto_Categoria",
          "Sotto categoria",
          "Subcategoria",
          "subcategory",
          "Sottocategoria_Prodotto",
        ])
      ).trim(),
      managesLots: !["no", "n", "false", "falso", "0", "generica", "solo disponibilita", "solo disponibilità"].includes(
        String(getField(row, ["Gestione_Lotti", "Gestione lotti", "Lotti"]) || "SI")
          .trim()
          .toLowerCase()
      ),
      // Peso in kg per 1 unita' d'ordine (per l'UM del prodotto: peso del
      // cartone per i CT, del pezzo per i PZ). Fonte: tabella statica
      // PESI_PRODOTTI (dai cataloghi app agenti); fallback colonna peso_kg se
      // un giorno esistera'. 0 se non noto.
      weightKg:
        Number(
          PESI_PRODOTTI[String(getField(row, ["Codice_Prodotto", "Codice prodotto", "Codice", "code"])).trim()] ??
            getField(row, ["peso_kg", "Peso_Kg", "peso", "Peso"])
        ) || 0,
    }))
    .filter((product) => product.code || product.name);
}

function normalizeLots(rows, products) {
  const productByCode = Object.fromEntries(products.map((p) => [String(p.code), p.id]));
  const productById = Object.fromEntries(products.map((p) => [String(p.id), p.id]));

  return rows
    .map((row, index) => {
      const productCode = String(
        getField(row, ["Codice_Prodotto", "Codice prodotto", "Codice", "Prodotto"])
      ).trim();

      const productIdRaw = String(
        getField(row, ["ID_Prodotto", "Id_Prodotto", "ProductId"])
      ).trim();

      return {
        id: String(
          getField(row, ["ID_Lotto", "Id_Lotto", "id"]) || `LOT-MISSING-${index + 1}`
        ),
        productId: productByCode[productCode] || productById[productIdRaw] || productIdRaw,
        lot: String(getField(row, ["Codice_Lotto", "Codice lotto", "Lotto"])).trim(),
        expiry: getField(row, ["Scadenza", "Data_Scadenza", "Data scadenza"]),
        archived: ["si", "sì", "yes", "true"].includes(
          String(getField(row, ["Lotto_Archiviato", "Archiviato_Lotto", "Archived_Lot", "Archiviato"])).trim().toLowerCase()
        ),
        loadedQty: Number(
          getField(row, [
            "Quantità_Caricata",
            "Quantita_Caricata",
            "Quantità caricata",
            "Quantita caricata",
            "Qta",
          ]) || 0
        ),
      };
    })
    .filter((lot) => lot.lot && lot.productId);
}

function normalizeOrders(rows) {
  return rows
    .map((row, index) => ({
      id: String(getField(row, ["ID_Ordine", "Id_Ordine", "Ordine", "id"]) || `ORD-${index + 1}`),
      customer: String(getField(row, ["Cliente", "Customer", "cliente"])).trim(),
      clientId: String(getField(row, ["ID_Cliente", "Id_Cliente", "id_cliente"]) || "").trim(),
      notes: String(getField(row, ["Note", "Note_Ordine", "Descrizione", "notes"])).trim(),
      dataPrepared: getField(row, ["Data_Preparato", "Data preparato", "Prepared_At"]),
      archived: ["si", "sì", "yes", "true"].includes(
        String(getField(row, ["Archiviato", "Archivio", "Archived"])).trim().toLowerCase()
      ),
      status: String(getField(row, ["Stato", "status"]) || "Da preparare"),
      workStatus: String(
        getField(row, ["Stato_Lavorazione", "Stato lavorazione", "WorkStatus"]) || "In lavorazione"
      ),
      paymentStatus: String(
        getField(row, ["Stato_Pagamento", "Stato pagamento", "PaymentStatus"]) || ""
      ).trim().toLowerCase(),
      date: getField(row, ["Data_Ordine", "Data ordine", "Data", "date"]),
      // CAP di destinazione salvato sull'ordine (congelato alla creazione).
      cap: String(getField(row, ["Cap", "cap", "CAP"]) || "").trim(),
      // Corriere scelto per la spedizione + numero DDT (se generato).
      courier: String(getField(row, ["Corriere", "corriere"]) || "").trim(),
      ddtNumero: String(getField(row, ["DDT_Numero", "ddt_numero"]) || "").trim(),
      regimeIva: String(getField(row, ["Regime_Iva", "regime_iva"]) || "").trim(),
      // Perche' l'ordine e' fermo (lo scrive il magazziniere; lo leggono
      // produzione, logistica e amministrazione sul badge).
      motivoFermo: String(getField(row, ["Motivo_Fermo", "motivo_fermo"]) || "").trim(),
      // Se valorizzato, questo ordine e' stato UNITO in un altro (id).
      unitoIn: String(getField(row, ["Unito_In", "unito_in"]) || "").trim(),
      colliManual: (() => {
        const raw = getField(row, ["Colli", "Numero_Colli", "Colli_Ordine"]);
        if (raw === undefined || raw === null || String(raw).trim() === "") return null;
        const n = Number(raw);
        return Number.isFinite(n) && n >= 0 ? n : null;
      })(),
      lines: [],
    }))
    .filter((order) => order.id);
}

// Timestamp di caricamento dell'ordine, per l'ordinamento cronologico. L'ora
// precisa vive nell'ID (ORD-<ms>); il campo date e' solo la data. Uso il primo
// blocco di 10+ cifre nell'ID come millisecondi; fallback sulla data.
function orderLoadTs(order) {
  const match = String(order?.id || "").match(/(\d{10,})/);
  if (match) return Number(match[1]);
  const parsed = Date.parse(String(order?.date || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeClients(rows) {
  return (rows || [])
    .map((row) => ({
      id: String(getField(row, ["ID_Cliente", "Id_Cliente", "id_cliente"]) || "").trim(),
      name: String(getField(row, ["Ragione_Sociale", "ragione_sociale", "Cliente"]) || "").trim(),
      category: String(getField(row, ["Categoria", "categoria"]) || "").trim(),
      categoryTs: String(getField(row, ["Categoria_TS", "categoria_ts"]) || "").trim(),
      codeTs: String(getField(row, ["Codice_Cliente_TS", "codice_cliente_ts"]) || "").trim(),
      piva: String(getField(row, ["PIVA", "piva"]) || "").trim(),
      codiceFiscale: String(getField(row, ["Codice_Fiscale", "codice_fiscale"]) || "").trim(),
      codiceDestinatarioTs: String(getField(row, ["Codice_Destinatario_TS", "codice_destinatario_ts"]) || "").trim(),
      source: String(getField(row, ["Fonte", "fonte"]) || "").trim(),
      active: getField(row, ["Attivo", "attivo"]) === false ? false : true,
      notes: String(getField(row, ["Note", "note"]) || "").trim(),
      cap: String(getField(row, ["Cap", "cap", "CAP"]) || "").trim(),
      provincia: String(getField(row, ["Provincia", "provincia"]) || "").trim(),
      citta: String(getField(row, ["Citta", "citta", "Città"]) || "").trim(),
      indirizzo: String(getField(row, ["Indirizzo", "indirizzo"]) || "").trim(),
      telefono: String(getField(row, ["Telefono", "telefono"]) || "").trim(),
      email: String(getField(row, ["Email", "email"]) || "").trim(),
    }))
    .filter((c) => c.id && c.name);
}

function normalizeOrderLines(rows, products) {
  const productByCode = Object.fromEntries(products.map((p) => [String(p.code), p.id]));
  const productById = Object.fromEntries(products.map((p) => [String(p.id), p.id]));

  return rows
    .map((row, index) => {
      const productCode = String(
        getField(row, ["Codice_Prodotto", "Codice prodotto", "Codice", "Prodotto"])
      ).trim();

      const productIdRaw = String(
        getField(row, ["ID_Prodotto", "Id_Prodotto", "ProductId"])
      ).trim();

      const productName = String(
        getField(row, ["Descrizione_Prodotto", "Descrizione prodotto", "Descrizione", "productName"])
      ).trim();

      const resolvedProductId = productByCode[productCode] || productById[productIdRaw] || productIdRaw;

      return {
        lineId: String(getField(row, ["ID_Riga", "Id_Riga", "id"]) || `RIGA-${index + 1}`),
        orderId: String(getField(row, ["ID_Ordine", "Id_Ordine", "Ordine"])).trim(),
        productId: resolvedProductId,
        productName,
        rowOrder: Number(getField(row, ["Ordine_Riga", "Ordine riga", "Row_Order"]) || index + 1),
        isOutsideStock: String(resolvedProductId).startsWith(OUTSIDE_STOCK_PRODUCT_ID),
        qtyOrdered: Number(
          getField(row, [
            "Quantità_Ordinata",
            "Quantita_Ordinata",
            "Quantità ordinata",
            "Quantita ordinata",
          ]) || 0
        ),
        qtyAssignedFromSheet: Number(
          getField(row, [
            "Quantita_Assegnata",
            "Quantità_Assegnata",
            "Quantita assegnata",
            "Quantità assegnata",
          ]) || 0
        ),
        // Valorizzazione della riga: serve nei Preparati, prima che l'ordine
        // vada in archivio. Senza, il documento parte a zero.
        prezzoUnitario: (() => {
          const v = getField(row, ["Prezzo_Unitario", "prezzo_unitario"]);
          return v === "" || v === null || v === undefined ? null : Number(v);
        })(),
        scontoPct: Number(getField(row, ["Sconto_Pct", "sconto_pct"]) || 0),
        prezzoOrigine: String(getField(row, ["Prezzo_Origine", "prezzo_origine"]) || ""),
        naturaIva: String(getField(row, ["Natura_Iva", "natura_iva"]) || ""),
        ivaPct: (() => {
          const v = getField(row, ["Iva_Pct", "iva_pct"]);
          return v === "" || v === null || v === undefined ? null : Number(v);
        })(),
      };
    })
    .filter((line) => line.lineId && line.orderId && line.productId);
}

function normalizeAssignments(rows, lines, lots) {
  const lineIds = new Set(lines.map((line) => String(line.lineId)));
  const lineById = Object.fromEntries(lines.map((line) => [String(line.lineId), line]));
  const lotById = Object.fromEntries(lots.map((lot) => [String(lot.id), lot]));
  const lotsByCode = {};

  lots.forEach((lot) => {
    const code = String(lot.lot || "");

    if (!lotsByCode[code]) lotsByCode[code] = [];
    lotsByCode[code].push(lot);
  });

  const grouped = {};

  rows.forEach((row, index) => {
    const lineId = String(getField(row, ["ID_Riga", "Id_Riga", "Riga"])).trim();
    if (!lineIds.has(lineId)) return;

    const line = lineById[lineId];

    const lotIdRaw = String(getField(row, ["ID_Lotto", "Id_Lotto", "id"])).trim();
    const lotCode = String(
      getField(row, ["Codice_Lotto", "Codice lotto", "Lotto"])
    ).trim();

    let lot = lotById[lotIdRaw];

    if (!lot && lotCode) {
      const candidates = lotsByCode[lotCode] || [];
      lot =
        candidates.find((candidate) => String(candidate.productId) === String(line.productId)) ||
        (candidates.length === 1 ? candidates[0] : null);
    }

    const lotId = lot?.id || lotIdRaw || lotCode;
    if (!lotId) return;

    const item = {
      assignmentId: String(
        getField(row, ["ID_Assegnazione", "Id_Assegnazione", "id"]) || `ASS-${index + 1}`
      ),
      lotId,
      productId: String(line.productId),
      qty: Number(
        getField(row, [
          "Quantità_Assegnata",
          "Quantita_Assegnata",
          "Quantità assegnata",
          "Quantita assegnata",
          "Quantita_A",
        ]) || 0
      ),
    };

    if (!grouped[lineId]) grouped[lineId] = [];
    grouped[lineId].push(item);
  });

  return grouped;
}


function buildOrdersWithLines(orders, lines) {
  return orders.map((order) => ({
    ...order,
    lines: lines.filter((line) => String(line.orderId) === String(order.id)),
  }));
}


// Ricerca sugli articoli FUORI MAGAZZINO gia' venduti a un cliente: quelli che
// nel nostro catalogo non esistono (piu'), presi dalle sue fatture degli ultimi
// 12 mesi. Si scrive l'inizio di una parola e sotto compaiono, esattamente come
// per i prodotti di magazzino. Scegliendone uno la riga si compila da sola con
// il nome e con il prezzo e lo sconto dell'ultima volta.
function StoricoFuoriMagazzinoSelect({ articoli, caricando, testo, onTesto, onScegli }) {
  const [open, setOpen] = useState(false);
  const query = String(testo || "").trim().toLowerCase();

  const suggerimenti = articoli
    .filter((a) => {
      if (!query) return true;
      return `${a.codice} ${a.descrizione}`.toLowerCase().includes(query);
    })
    .slice(0, 12);

  return (
    <div style={{ position: "relative", minWidth: 0 }}>
      <input
        style={inputStyle()}
        value={testo}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          onTesto(e.target.value);
          setOpen(true);
        }}
        placeholder={
          caricando
            ? "Cerco cosa gli abbiamo gia' venduto..."
            : articoli.length
              ? `Scrivi o scegli tra i ${articoli.length} gia' venduti a questo cliente`
              : "Nome articolo fuori magazzino"
        }
      />

      {open && !caricando && articoli.length > 0 ? (
        <div
          style={{
            position: "absolute",
            zIndex: 40,
            top: "100%",
            left: 0,
            right: 0,
            marginTop: 6,
            background: "#fff",
            border: "1px solid #bbf7d0",
            borderRadius: 14,
            boxShadow: "0 18px 40px rgba(16,24,40,.16)",
            maxHeight: 300,
            overflowY: "auto",
          }}
          onMouseLeave={() => setOpen(false)}
        >
          <div
            style={{
              padding: "8px 12px",
              fontSize: 12,
              fontWeight: 800,
              color: "#166534",
              background: "#f0fdf4",
              borderBottom: "1px solid #dcfce7",
            }}
          >
            Già venduti a questo cliente · ultimi 12 mesi
          </div>
          {suggerimenti.length === 0 ? (
            <div style={{ padding: 12, color: "#6b7280" }}>Nessuno con questo testo.</div>
          ) : (
            suggerimenti.map((a, i) => (
              <button
                key={`${a.codice}-${i}`}
                type="button"
                onClick={() => {
                  onScegli(a);
                  setOpen(false);
                }}
                style={{
                  width: "100%",
                  textAlign: "left",
                  border: "none",
                  borderBottom: "1px solid #f1f5f9",
                  background: "transparent",
                  padding: "10px 12px",
                  cursor: "pointer",
                  display: "grid",
                  gap: 3,
                }}
              >
                <div style={{ fontWeight: 800, fontSize: 13 }}>
                  {a.codice ? <span style={{ color: "#16a34a" }}>{a.codice} </span> : null}
                  {a.descrizione}
                </div>
                <div style={{ fontSize: 12, color: "#4b5563", fontWeight: 700 }}>
                  {a.ultimoPrezzo != null ? `${a.ultimoPrezzo.toFixed(2)} €` : "—"}
                  {a.ultimoSconto ? ` · sconto ${a.ultimoSconto}%` : ""}
                  {a.unitaMisura ? ` · ${a.unitaMisura}` : ""}
                  {` · ${a.ultimoOrdine}`}
                  {a.volte > 1 ? ` · ${a.volte} volte` : ""}
                  {a.prezzoVariato ? (
                    <span style={{ color: "#b45309" }}>
                      {` · variato ${a.prezzoMin?.toFixed(2)}-${a.prezzoMax?.toFixed(2)}`}
                    </span>
                  ) : null}
                </div>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

// Carica una volta sola gli articoli fuori magazzino di un cliente e li tiene
// pronti per tutte le righe dell'ordine che si sta scrivendo.
function useStoricoFuoriMagazzino({ cliente, codiceCliente, prodotti, attivo }) {
  const [stato, setStato] = useState({ caricando: false, articoli: [], tutti: [] });

  useEffect(() => {
    let vivo = true;
    if (!attivo || (!cliente && !codiceCliente)) {
      setStato({ caricando: false, articoli: [], tutti: [] });
      return () => { vivo = false; };
    }
    setStato({ caricando: true, articoli: [], tutti: [] });
    (async () => {
      try {
        const r = await callSheetsApi({
          action: "getStoricoCliente",
          payload: JSON.stringify({ cliente, codiceCliente }),
        });
        if (!vivo) return;
        const norm = (v) => String(v || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
        const inMagazzino = (a) => {
          const c = norm(a.codice);
          if (!c) return false; // senza codice e' per definizione fuori magazzino
          return (prodotti || []).some((p) => norm(p.code) === c || norm(p.id) === c);
        };
        const tutti = (r && r.articoli) || [];
        setStato({
          caricando: false,
          articoli: tutti.filter((a) => !inMagazzino(a)), // solo fuori catalogo
          tutti,                                          // tutto lo storico
        });
      } catch (_) {
        if (vivo) setStato({ caricando: false, articoli: [], tutti: [] });
      }
    })();
    return () => { vivo = false; };
  }, [cliente, codiceCliente, prodotti, attivo]);

  return stato;
}

// Valorizzazione dell'ordine nei PREPARATI, cioe' l'ultimo momento utile prima
// che finisca in archivio (regola di Luca 02/08/2026: gli ordini caricati in
// casa arrivavano in archivio a zero). Per ogni riga si mette prezzo e sconto,
// e il bottone "Proponi dallo storico" li riempie tutti insieme con quello che
// quel cliente ha pagato l'ultima volta. Tutto resta correggibile a mano.
function ValorizzazioneOrdine({ order, onSalvato, listini }) {
  const [bozza, setBozza] = useState({});
  const [storico, setStorico] = useState({ caricando: true, articoli: [] });
  const [salvando, setSalvando] = useState(false);
  const [aperto, setAperto] = useState(false);
  const [regime, setRegime] = useState(order.regimeIva || "normale");

  const righe = order.lines || [];

  useEffect(() => {
    const iniziale = {};
    for (const l of righe) {
      iniziale[l.lineId] = {
        prezzo: l.prezzoUnitario === null || l.prezzoUnitario === undefined ? "" : String(l.prezzoUnitario),
        sconto: l.scontoPct ? String(l.scontoPct) : "",
        // Il nostro prodotto sta al 4%: e' il caso normale, si cambia dove serve.
        iva: l.ivaPct === null || l.ivaPct === undefined ? "4" : String(l.ivaPct),
        natura: l.naturaIva || "",
      };
    }
    setBozza(iniziale);
  }, [order.id, righe.length]);

  useEffect(() => {
    let vivo = true;
    if (!aperto) return () => { vivo = false; };
    (async () => {
      try {
        const r = await callSheetsApi({
          action: "getStoricoCliente",
          payload: JSON.stringify({ cliente: order.customer, codiceCliente: order.clientId || "" }),
        });
        if (vivo) setStorico({ caricando: false, articoli: (r && r.articoli) || [] });
      } catch (_) {
        if (vivo) setStorico({ caricando: false, articoli: [] });
      }
    })();
    return () => { vivo = false; };
  }, [aperto, order.id, order.customer, order.clientId]);

  const norm = (v) => String(v || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

  // Cerca nello storico l'articolo della riga: prima per codice, poi per nome.
  const suggerimentoPer = (l) => {
    const nome = String(l.productName || "");
    const perCodice = storico.articoli.find(
      (a) => a.codice && norm(nome).startsWith(norm(a.codice))
    );
    if (perCodice) return perCodice;
    return storico.articoli.find(
      (a) => norm(a.descrizione) && norm(nome).includes(norm(a.descrizione).slice(0, 14))
    );
  };

  const proponiTutti = () => {
    setBozza((prev) => {
      const next = { ...prev };
      let riempite = 0;
      for (const l of righe) {
        const a = suggerimentoPer(l);
        if (!a || a.ultimoPrezzo == null) continue;
        // Non sovrascrivo un prezzo gia' messo a mano.
        if (String(next[l.lineId]?.prezzo || "") !== "") continue;
        next[l.lineId] = {
          ...(next[l.lineId] || {}),
          prezzo: String(a.ultimoPrezzo),
          sconto: a.ultimoSconto ? String(a.ultimoSconto) : "",
        };
        riempite++;
      }
      if (riempite === 0) {
        alert(
          "Nessun prezzo da proporre: di questi articoli non risultano vendite a questo cliente negli ultimi 12 mesi."
        );
      }
      return next;
    });
  };

  const regimeCorrente = REGIMI_IVA.find((r) => r.key === regime) || REGIMI_IVA[0];

  const imponibile = righe.reduce((s, l) => {
    const p = Number(bozza[l.lineId]?.prezzo || 0);
    const sc = Number(bozza[l.lineId]?.sconto || 0);
    return s + Number(l.qtyOrdered || 0) * p * (1 - sc / 100);
  }, 0);

  // Con split payment o estero l'imposta non si somma al totale del cliente.
  const iva = !regimeCorrente.ivaEsiste
    ? 0
    : righe.reduce((s, l) => {
        const p = Number(bozza[l.lineId]?.prezzo || 0);
        const sc = Number(bozza[l.lineId]?.sconto || 0);
        const al = Number(bozza[l.lineId]?.iva || 0);
        return s + Number(l.qtyOrdered || 0) * p * (1 - sc / 100) * (al / 100);
      }, 0);

  // Quello che il cliente ci paga davvero: con lo split l'IVA la versa allo Stato.
  const totale = imponibile + (regimeCorrente.ivaAlCliente ? iva : 0);

  const salva = async () => {
    setSalvando(true);
    try {
      for (const l of righe) {
        const p = String(bozza[l.lineId]?.prezzo ?? "").trim();
        const sc = String(bozza[l.lineId]?.sconto ?? "").trim();
        const prima = l.prezzoUnitario === null || l.prezzoUnitario === undefined ? "" : String(l.prezzoUnitario);
        if (p === prima && sc === (l.scontoPct ? String(l.scontoPct) : "")) continue;
        await callSheetsApi({
          action: "updateOrderLine",
          payload: JSON.stringify({
            lineId: l.lineId,
            prezzoUnitario: p === "" ? null : Number(p),
            scontoPct: sc === "" ? 0 : Number(sc),
            ivaPct: Number(bozza[l.lineId]?.iva ?? 4),
            naturaIva: bozza[l.lineId]?.natura || "",
            prezzoOrigine: "valorizzazione-preparati",
          }),
        });
      }
      if (regime !== (order.regimeIva || "normale")) {
        await callSheetsApi({
          action: "updateOrder",
          payload: JSON.stringify({ orderId: order.id, regimeIva: regime }),
        });
      }
      if (onSalvato) await onSalvato();
    } catch (e) {
      alert("Errore nel salvataggio dei prezzi: " + String(e));
    } finally {
      setSalvando(false);
    }
  };

  const valorizzato = righe.some((l) => l.prezzoUnitario != null);

  return (
    <div
      style={{
        border: `1px solid ${valorizzato ? "#bbf7d0" : "#fecaca"}`,
        background: valorizzato ? "#f0fdf4" : "#fef2f2",
        borderRadius: 14,
        padding: 12,
        display: "grid",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontWeight: 900, color: valorizzato ? "#166534" : "#b91c1c" }}>
          {valorizzato
            ? `Valorizzato · ${fmtEur(imponibile)} € + IVA ${fmtEur(iva)} € = ${fmtEur(totale)} €`
            : "⚠️ Ordine non valorizzato: andrebbe in archivio a zero"}
        </span>
        <button
          style={{ ...btnStyle("outline"), padding: "6px 12px", fontSize: 13 }}
          onClick={() => setAperto((v) => !v)}
        >
          {aperto ? "Chiudi prezzi" : valorizzato ? "Rivedi prezzi" : "Metti i prezzi"}
        </button>
      </div>

      {aperto ? (
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button
              style={{ ...btnStyle("primary"), padding: "6px 12px", fontSize: 13 }}
              disabled={storico.caricando}
              onClick={proponiTutti}
            >
              {storico.caricando
                ? "Cerco lo storico..."
                : `Proponi dallo storico (${storico.articoli.length} articoli)`}
            </button>
            <span style={{ fontSize: 12, color: "#6b7280" }}>
              Prezzi dell'ultima volta a questo cliente. Sempre correggibili.
            </span>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: "#40516a" }}>Regime IVA</span>
            <select
              style={{ ...inputStyle(), padding: "6px 8px", maxWidth: 340 }}
              value={regime}
              onChange={(e) => setRegime(e.target.value)}
            >
              {REGIMI_IVA.map((r) => (
                <option key={r.key} value={r.key}>{r.label}</option>
              ))}
            </select>
            {!regimeCorrente.ivaAlCliente ? (
              <span style={{ fontSize: 12, color: "#b45309", fontWeight: 700 }}>
                {regimeCorrente.ivaEsiste
                  ? "L'IVA c'e' ma la versa il cliente allo Stato: non la incassiamo noi"
                  : "Operazione non imponibile: l'imposta non c'e'"}
              </span>
            ) : null}
          </div>

          {righe.map((l) => {
            const a = suggerimentoPer(l);
            return (
              <div
                key={l.lineId}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 110px 80px 90px",
                  gap: 8,
                  alignItems: "center",
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>
                  {l.productName}
                  <span style={{ color: "#6b7280", fontWeight: 600 }}> · {l.qtyOrdered}</span>
                  {a && a.ultimoPrezzo != null ? (
                    <span style={{ color: "#16a34a", fontWeight: 600, fontSize: 12 }}>
                      {` · ultimo ${a.ultimoPrezzo.toFixed(2)} €${a.ultimoSconto ? ` -${a.ultimoSconto}%` : ""}`}
                    </span>
                  ) : null}
                  <PrezziDisponibili
                    compatto
                    codice={a?.codice || String(l.productName || "").split(" ").slice(0, 2).join(" ")}
                    storico={a}
                    listini={listini}
                    onScegli={(prezzo, sconto) =>
                      setBozza((prev) => ({
                        ...prev,
                        [l.lineId]: {
                          ...(prev[l.lineId] || {}),
                          prezzo: String(prezzo),
                          sconto: sconto ? String(sconto) : "",
                        },
                      }))
                    }
                  />
                </div>
                <input
                  style={{ ...inputStyle(), padding: "6px 8px" }}
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Prezzo €"
                  value={bozza[l.lineId]?.prezzo ?? ""}
                  onChange={(e) =>
                    setBozza((prev) => ({
                      ...prev,
                      [l.lineId]: { ...(prev[l.lineId] || {}), prezzo: e.target.value },
                    }))
                  }
                />
                <input
                  style={{ ...inputStyle(), padding: "6px 8px" }}
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  placeholder="Sc %"
                  value={bozza[l.lineId]?.sconto ?? ""}
                  onChange={(e) =>
                    setBozza((prev) => ({
                      ...prev,
                      [l.lineId]: { ...(prev[l.lineId] || {}), sconto: e.target.value },
                    }))
                  }
                />
                <select
                  style={{ ...inputStyle(), padding: "6px 8px" }}
                  value={`${bozza[l.lineId]?.iva ?? "4"}|${bozza[l.lineId]?.natura ?? ""}`}
                  disabled={!regimeCorrente.ivaEsiste}
                  title={!regimeCorrente.ivaEsiste ? "Con questo regime l'imposta non c'e'" : "Aliquota IVA della riga"}
                  onChange={(e) =>
                    setBozza((prev) => ({
                      ...prev,
                      [l.lineId]: (() => {
                        const [al, nat] = String(e.target.value).split("|");
                        return { ...(prev[l.lineId] || {}), iva: al, natura: nat || "" };
                      })(),
                    }))
                  }
                >
                  {ALIQUOTE_IVA.map((a) => (
                    <option key={chiaveAliquota(a)} value={chiaveAliquota(a)}>{a.etichetta}</option>
                  ))}
                </select>
              </div>
            );
          })}

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <span style={{ fontWeight: 900, color: "#07153a" }}>
              Imponibile {fmtEur(imponibile)} € · IVA {fmtEur(iva)} €
              {regimeCorrente.ivaAlCliente ? "" : " (non incassata)"} · Da incassare {fmtEur(totale)} €
            </span>
            <button style={btnStyle("success", salvando)} disabled={salvando} onClick={salva}>
              {salvando ? "Salvo..." : "Salva prezzi"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// Carica una volta sola i prezzi dei listini 1 e 8 per tutti gli articoli.
function useListiniPrezzi(attivo) {
  const [listini, setListini] = useState({});

  useEffect(() => {
    let vivo = true;
    if (!attivo) return () => { vivo = false; };
    (async () => {
      try {
        const r = await callSheetsApi({ action: "getListiniPrezzi" });
        if (vivo) setListini((r && r.listini) || {});
      } catch (_) {
        if (vivo) setListini({});
      }
    })();
    return () => { vivo = false; };
  }, [attivo]);

  return listini;
}

// Le tre fonti di prezzo per un articolo, una accanto all'altra: quello che il
// cliente ha davvero pagato l'ultima volta, il listino 1 e il listino 8. Si
// tocca quella che si vuole e il prezzo entra nella riga. Serve sugli ordini
// caricati a mano, dove nessuno ti dice quanto vale quell'articolo per quel
// cliente (Luca 02/08/2026).
function PrezziDisponibili({ codice, storico, listini, onScegli, compatto }) {
  const k = String(codice || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const l = (listini || {})[k] || {};
  const voci = [];

  if (storico && storico.ultimoPrezzo != null) {
    voci.push({
      etichetta: "ultimo a questo cliente",
      prezzo: storico.ultimoPrezzo,
      sconto: storico.ultimoSconto || 0,
      nota: storico.ultimoOrdine,
      colore: "#166534",
      sfondo: "#f0fdf4",
      bordo: "#bbf7d0",
    });
  }
  if (l.l1) {
    voci.push({ etichetta: "listino 1", prezzo: l.l1.prezzo, sconto: l.l1.sconto, colore: "#3730a3", sfondo: "#eef2ff", bordo: "#c7d2fe" });
  }
  if (l.l8) {
    voci.push({ etichetta: "listino 8 Ho.Re.Ca.", prezzo: l.l8.prezzo, sconto: l.l8.sconto, colore: "#9a3412", sfondo: "#fff7ed", bordo: "#fed7aa" });
  }

  if (voci.length === 0) return null;

  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: compatto ? 4 : 8 }}>
      {voci.map((v) => (
        <button
          key={v.etichetta}
          type="button"
          onClick={() => onScegli(v.prezzo, v.sconto)}
          title={`Usa ${v.etichetta}`}
          style={{
            border: `1px solid ${v.bordo}`,
            background: v.sfondo,
            color: v.colore,
            borderRadius: 999,
            padding: "4px 10px",
            fontSize: 12,
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          {v.etichetta} {Number(v.prezzo).toFixed(2)} €
          {v.sconto ? ` −${v.sconto}%` : ""}
          {v.nota ? ` · ${v.nota}` : ""}
        </button>
      ))}
    </div>
  );
}

function ProductSearchSelect({
  products,
  value,
  onChange,
  search,
  onSearchChange,
  placeholder = "Cerca per codice o descrizione",
}) {
  const [open, setOpen] = useState(false);

  const selectedProduct = products.find((product) => String(product.id) === String(value));
  const query = String(search || "").trim().toLowerCase();

  const suggestions = products
    .filter((product) => {
      if (!query) return true;

      const haystack = [
        product.code,
        product.name,
        product.category,
        product.subcategory,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    })
    .slice(0, 12);

  return (
    <div style={{ position: "relative", minWidth: 0 }}>
      <input
        style={inputStyle()}
        value={search}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          onSearchChange(event.target.value);
          setOpen(true);
        }}
        placeholder={selectedProduct ? productOptionLabel(selectedProduct) : placeholder}
      />

      {selectedProduct ? (
        <div style={{ marginTop: 7, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={badgeStyle("dark")}>{selectedProduct.code}</span>
          <span style={{ color: "#40516a", fontSize: 13, fontWeight: 750 }}>
            {selectedProduct.name}
          </span>
          <button
            type="button"
            style={{ ...compactBtnStyle("outline"), height: 30, padding: "0 10px" }}
            onClick={() => {
              onChange("");
              onSearchChange("");
              setOpen(true);
            }}
          >
            Cambia
          </button>
        </div>
      ) : null}

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            left: 0,
            right: 0,
            zIndex: 1200,
            background: "#fff",
            border: "1px solid #dbe2ea",
            borderRadius: 18,
            boxShadow: "0 18px 44px rgba(15,23,42,0.16)",
            overflow: "hidden",
            maxHeight: 330,
            overflowY: "auto",
          }}
        >
          {suggestions.length === 0 ? (
            <div style={{ padding: 14, color: "#66758b", fontWeight: 750 }}>
              Nessun prodotto trovato
            </div>
          ) : (
            suggestions.map((product) => (
              <button
                key={product.id}
                type="button"
                style={{
                  width: "100%",
                  display: "block",
                  textAlign: "left",
                  padding: "12px 14px",
                  border: 0,
                  borderBottom: "1px solid #eef2f7",
                  background: String(product.id) === String(value) ? "#f8fafc" : "#fff",
                  cursor: "pointer",
                }}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(String(product.id));
                  onSearchChange(productOptionLabel(product));
                  setOpen(false);
                }}
              >
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 950, color: "#07153a" }}>{product.code}</span>
                  <span style={{ color: "#40516a", fontWeight: 750 }}>{product.name}</span>
                </div>

                {(product.category || product.subcategory) ? (
                  <div style={{ marginTop: 5, color: "#7a8699", fontSize: 12, fontWeight: 750 }}>
                    {[product.category, product.subcategory].filter(Boolean).join(" › ")}
                  </div>
                ) : null}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// Pannello "Gia' ordinato da questo cliente": elenca gli articoli che quel
// cliente ha davvero comprato, dalle fatture 2025-2026, con l'ultimo prezzo e
// l'ultimo sconto praticati. Serve soprattutto per i clienti che hanno articoli
// fatti apposta per loro, che in magazzino non esistono. Il prezzo che propone
// e' un suggerimento: chi carica lo puo' sempre cambiare prima di salvare.
function StoricoClientePanel({ cliente, codiceCliente, onScegli, soloFuoriMagazzino, prodotti, titolo }) {
  const [stato, setStato] = useState({ caricando: true });
  const [filtro, setFiltro] = useState("");
  const [ricerca, setRicerca] = useState("");
  const [candidati, setCandidati] = useState([]);
  const [cercando, setCercando] = useState(false);

  const carica = useCallback(async () => {
    if (!cliente && !codiceCliente) {
      setStato({ caricando: false, articoli: [] });
      return;
    }
    setStato({ caricando: true });
    try {
      const r = await callSheetsApi({
        action: "getStoricoCliente",
        payload: JSON.stringify({ cliente, codiceCliente }),
      });
      setStato({ caricando: false, ...(r || {}) });
      setCandidati((r && r.candidati) || []);
    } catch (e) {
      setStato({ caricando: false, error: String(e) });
    }
  }, [cliente, codiceCliente]);

  useEffect(() => {
    carica();
  }, [carica]);

  const collega = async (piva, clienteFattura) => {
    await callSheetsApi({
      action: "collegaClienteStorico",
      payload: JSON.stringify({ cliente, piva, clienteFattura }),
    });
    setRicerca("");
    carica();
  };

  const cerca = async (q) => {
    setRicerca(q);
    if (q.trim().length < 2) return;
    setCercando(true);
    try {
      const r = await callSheetsApi({
        action: "cercaClienteStorico",
        payload: JSON.stringify({ q }),
      });
      setCandidati((r && r.clienti) || []);
    } finally {
      setCercando(false);
    }
  };

  if (stato.caricando) {
    return (
      <div style={{ ...cardStyle({ background: "#f8fafc" }), padding: 14, color: "#66758b" }}>
        Cerco cosa ha gia' ordinato...
      </div>
    );
  }

  // Cliente non ancora agganciato allo storico: si sceglie a mano, una volta sola.
  if (!stato.collegato) {
    return (
      <details style={{ ...cardStyle({ background: "#fffbeb" }), padding: 14 }}>
        <summary style={{ fontWeight: 800, cursor: "pointer", color: "#92400e" }}>
          Storico non collegato — collega questo cliente
        </summary>
        <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
          <div style={{ color: "#78716c", fontSize: 13 }}>
            In magazzino il cliente si chiama <b>{cliente}</b>. In fattura puo' avere la
            ragione sociale, non l'insegna. Scegli quale e', lo ricordo per sempre.
          </div>
          <input
            style={inputStyle()}
            value={ricerca}
            onChange={(e) => cerca(e.target.value)}
            placeholder="Cerca il cliente nelle fatture..."
          />
          <div style={{ maxHeight: 220, overflowY: "auto", display: "grid", gap: 6 }}>
            {cercando ? (
              <div style={{ color: "#78716c" }}>Cerco...</div>
            ) : candidati.length === 0 ? (
              <div style={{ color: "#78716c" }}>
                {ricerca.trim().length >= 2 ? "Nessun cliente trovato." : "Scrivi almeno 2 lettere."}
              </div>
            ) : (
              candidati.map((c) => (
                <button
                  key={c.piva}
                  style={{ ...btnStyle("ghost"), textAlign: "left", justifyContent: "flex-start" }}
                  onClick={() => collega(c.piva, c.cliente)}
                >
                  {c.cliente}
                  <span style={{ marginLeft: 8, color: "#7a8699", fontWeight: 600 }}>{c.piva}</span>
                </button>
              ))
            )}
          </div>
        </div>
      </details>
    );
  }

  // Con soloFuoriMagazzino restano solo gli articoli che nel nostro catalogo NON
  // esistono: quelli fatti apposta per quel cliente. Sono esattamente i casi in
  // cui chi carica non sa cosa scrivere ne' a che prezzo.
  const normCodice = (v) => String(v || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const inMagazzino = (a) => {
    const c = normCodice(a.codice);
    if (!c || !Array.isArray(prodotti)) return false;
    return prodotti.some(
      (p) => normCodice(p.code) === c || normCodice(p.id) === c
    );
  };

  const base = soloFuoriMagazzino
    ? (stato.articoli || []).filter((a) => !inMagazzino(a))
    : stato.articoli || [];

  const articoli = base.filter((a) => {
    const q = filtro.trim().toLowerCase();
    if (!q) return true;
    return `${a.codice} ${a.descrizione}`.toLowerCase().includes(q);
  });

  return (
    <details open style={{ ...cardStyle({ background: "#f0fdf4" }), padding: 14 }}>
      <summary style={{ fontWeight: 800, cursor: "pointer", color: "#166534" }}>
        {titolo || "Già ordinato da questo cliente"} ({base.length}){" "}
        <span style={{ fontWeight: 600, color: "#4b5563", fontSize: 12 }}>
          · ultimi 12 mesi
        </span>
      </summary>

      <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <input
            style={{ ...inputStyle(), flex: 1, minWidth: 180 }}
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            placeholder="Filtra per codice o nome..."
          />
          <button
            style={{ ...btnStyle("ghost"), fontSize: 12 }}
            onClick={() => collega("", "")}
            title="Se il cliente collegato e' sbagliato, puoi sempre rifarlo"
          >
            Cambia cliente
          </button>
        </div>

        {stato.clienteFattura ? (
          <div style={{ color: "#4b5563", fontSize: 12 }}>
            In fattura: <b>{stato.clienteFattura}</b> · P.IVA {stato.piva}
          </div>
        ) : null}

        <div style={{ maxHeight: 300, overflowY: "auto", display: "grid", gap: 6 }}>
          {articoli.length === 0 ? (
            <div style={{ color: "#4b5563" }}>
              {filtro.trim()
                ? "Nessun articolo trovato con questo filtro."
                : soloFuoriMagazzino
                  ? "Questo cliente non ha comprato articoli fuori catalogo negli ultimi 12 mesi."
                  : "Questo cliente non ha comprato niente negli ultimi 12 mesi."}
            </div>
          ) : (
            articoli.map((a, i) => (
              <button
                key={`${a.codice}-${i}`}
                onClick={() => onScegli(a)}
                style={{
                  textAlign: "left",
                  border: "1px solid #bbf7d0",
                  background: "#fff",
                  borderRadius: 12,
                  padding: "10px 12px",
                  cursor: "pointer",
                  display: "grid",
                  gap: 3,
                }}
              >
                <div style={{ fontWeight: 800, fontSize: 13 }}>
                  {a.codice ? <span style={{ color: "#16a34a" }}>{a.codice} </span> : null}
                  {a.descrizione}
                </div>
                <div style={{ fontSize: 12, color: "#4b5563", fontWeight: 700 }}>
                  {a.ultimoPrezzo != null ? `${a.ultimoPrezzo.toFixed(2)} €` : "—"}
                  {a.ultimoSconto ? ` · sconto ${a.ultimoSconto}%` : ""}
                  {a.unitaMisura ? ` · ${a.unitaMisura}` : ""}
                  {" · "}
                  {a.ultimoOrdine}
                  {a.volte > 1 ? ` · ${a.volte} volte` : ""}
                  {a.prezzoVariato ? (
                    <span style={{ color: "#b45309" }}>
                      {` · prezzo variato ${a.prezzoMin?.toFixed(2)}-${a.prezzoMax?.toFixed(2)}`}
                    </span>
                  ) : null}
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </details>
  );
}

function Modal({ open, title, children, onClose, maxWidth = 720 }) {
  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        zIndex: 1000,
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          ...cardStyle(),
          width: "100%",
          maxWidth,
          padding: 24,
          maxHeight: "90vh",
          overflow: "auto",
        }}
      >
        <div style={{ fontSize: 28, fontWeight: 800, marginBottom: 18 }}>{title}</div>
        {children}
      </div>
    </div>
  );
}

function applyStockMovementsToLots(lots, movements = []) {
  if (!Array.isArray(movements) || movements.length === 0) return lots;

  const flattenedMovements = movements.flatMap((movement) =>
    Array.isArray(movement?.movements) ? movement.movements : [movement]
  );

  return lots.map((lot) => {
    const movement = flattenedMovements.find((item) => {
      if (item.genericStock) {
        return String(item.productId) === String(lot.productId);
      }

      if (item.lotId) {
        return String(item.lotId) === String(lot.id);
      }

      const sameLot = String(item.lot) === String(lot.lot) || String(item.lot) === String(lot.id);
      const sameProduct = !item.productId || String(item.productId) === String(lot.productId);

      return sameLot && sameProduct;
    });

    if (!movement || movement.newQty === undefined || movement.newQty === null) {
      return lot;
    }

    return {
      ...lot,
      loadedQty: Number(movement.newQty),
    };
  });
}

// Pannello chat riutilizzabile su un canale (tabella) qualsiasi. Gestisce da
// solo polling, invio testo/vocale e beep all'arrivo di un messaggio altrui.
function ChatPanel({ tabella, authUser, height = "42vh", vuotoLabel = "Nessun messaggio." }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [rec, setRec] = useState(false);
  const mrRef = useRef(null);
  const endRef = useRef(null);
  const newestRef = useRef("");

  const beep = () => {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g);
      g.connect(ctx.destination);
      o.type = "sine";
      o.frequency.setValueAtTime(880, ctx.currentTime);
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
      o.start();
      o.stop(ctx.currentTime + 0.4);
    } catch (_) {}
  };

  useEffect(() => {
    let stop = false;
    const poll = async () => {
      const res = await callSheetsApi({
        action: "getChatMessaggi",
        payload: JSON.stringify({ tabella }),
      });
      if (stop || !res || !res.success) return;
      const msgs = res.messaggi || [];
      const altrui = msgs.filter((m) => String(m.mittente) !== String(authUser?.username));
      const newestAltrui = altrui.length ? String(altrui[altrui.length - 1].creato_il) : "";
      if (newestAltrui && newestRef.current && newestAltrui > newestRef.current) beep();
      const newest = msgs.length ? String(msgs[msgs.length - 1].creato_il) : "";
      if (newest > newestRef.current) newestRef.current = newest;
      setMessages(msgs);
    };
    poll();
    const iv = setInterval(poll, 4000);
    return () => {
      stop = true;
      clearInterval(iv);
    };
  }, [tabella, authUser]);

  useEffect(() => {
    if (endRef.current) endRef.current.scrollIntoView({ block: "end" });
  }, [messages]);

  const send = async ({ testo = "", tipo = "testo", audio = "" }) => {
    if (sending) return;
    const t = String(testo || "").trim();
    if (tipo === "testo" && !t) return;
    if (tipo === "audio" && !audio) return;
    setSending(true);
    try {
      const res = await callSheetsApi({
        action: "inviaChatMessaggio",
        payload: JSON.stringify({
          tabella,
          mittente: authUser?.username || "",
          etichetta: authUser?.etichetta || authUser?.username || "",
          tipo,
          testo: tipo === "testo" ? t : "",
          audio,
        }),
      });
      if (res && res.success) {
        if (tipo === "testo") setText("");
        if (res.messaggio) {
          setMessages((p) => [...p, res.messaggio]);
          newestRef.current = String(res.messaggio.creato_il || newestRef.current);
        }
      } else {
        alert(
          "Messaggio non inviato: " + ((res && res.error) || "errore") +
            "\n\nControlla che la tabella " + tabella + " esista su Supabase."
        );
      }
    } finally {
      setSending(false);
    }
  };

  const startRec = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      const chunks = [];
      mr.ondataavailable = (e) => {
        if (e.data && e.data.size) chunks.push(e.data);
      };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: mr.mimeType || "audio/webm" });
        const dataUrl = await new Promise((resolve) => {
          const rd = new FileReader();
          rd.onload = () => resolve(rd.result);
          rd.readAsDataURL(blob);
        });
        await send({ tipo: "audio", audio: String(dataUrl) });
      };
      mrRef.current = mr;
      mr.start();
      setRec(true);
    } catch (e) {
      alert("Microfono non disponibile o permesso negato: " + String(e));
    }
  };
  const stopRec = () => {
    const mr = mrRef.current;
    if (mr && mr.state !== "inactive") mr.stop();
    setRec(false);
  };

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div
        style={{
          maxHeight: height,
          minHeight: 160,
          overflowY: "auto",
          display: "grid",
          gap: 8,
          padding: 4,
          background: "#f8fafc",
          borderRadius: 12,
          border: "1px solid #e5edf6",
        }}
      >
        {messages.length === 0 ? (
          <div style={{ color: "#66758b", textAlign: "center", padding: 20 }}>{vuotoLabel}</div>
        ) : (
          messages.map((m) => {
            const mio = String(m.mittente) === String(authUser?.username);
            let ora = "";
            try {
              ora = new Date(m.creato_il).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
            } catch (_) {}
            return (
              <div key={m.id} style={{ display: "flex", justifyContent: mio ? "flex-end" : "flex-start" }}>
                <div
                  style={{
                    maxWidth: "82%",
                    background: mio ? "#0f172a" : "#fff",
                    color: mio ? "#fff" : "#0f172a",
                    border: mio ? "none" : "1px solid #e2e8f0",
                    borderRadius: 14,
                    padding: "8px 12px",
                  }}
                >
                  <div style={{ fontSize: 11, fontWeight: 800, opacity: 0.7, marginBottom: 3 }}>
                    {mio ? "Tu" : m.mittente_etichetta || m.mittente}
                    {ora ? " · " + ora : ""}
                  </div>
                  {m.tipo === "audio" && m.audio ? (
                    <audio controls src={m.audio} style={{ width: 220, maxWidth: "100%" }} />
                  ) : (
                    <div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{m.testo}</div>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          style={{ ...inputStyle(), flex: 1, minWidth: 0 }}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !rec) send({ testo: text });
          }}
          placeholder={rec ? "Registrazione in corso..." : "Scrivi cosa riordinare"}
          disabled={rec}
        />
        {rec ? (
          <button style={btnStyle("danger")} onClick={stopRec} title="Ferma e invia il vocale">
            ■ Stop
          </button>
        ) : (
          <button style={btnStyle("outline")} onClick={startRec} disabled={sending} title="Registra un vocale">
            <Mic size={18} />
          </button>
        )}
        <button
          style={btnStyle("primary", sending)}
          disabled={sending || rec || !text.trim()}
          onClick={() => send({ testo: text })}
          title="Invia"
        >
          <Send size={18} />
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [page, setPage] = useState("ordini");
  const [orders, setOrders] = useState([]);
  // Ordini da APP (staging degli ordini dell'app agenti, reparto separato).
  const [ordiniApp, setOrdiniApp] = useState([]);
  // Situazione gestionale (scaduto + anagrafica TeamSystem) per il badge
  // pagamento AUTO. null = non ancora caricata → i badge restano manuali.
  const [gestionale, setGestionale] = useState(null);
  const [ordiniAppBusy, setOrdiniAppBusy] = useState("");
  const [lots, setLots] = useState([]);
  const [products, setProducts] = useState([]);
  const [clients, setClients] = useState([]);
  // Anagrafiche snapshot degli ordini arrivati dall'APP agenti
  // (id ordine magazzino -> oggetto cliente). Per semaforo Anagrafica e DDT.
  const [appAnagrafiche, setAppAnagrafiche] = useState({});
  // Layer di arricchimento nostro (chiave cliente -> override): tipologia + campi
  // anagrafica completati a mano. Si sovrappone allo snapshot senza toccarlo.
  const [clientiOverride, setClientiOverride] = useState({});
  const [savingOverride, setSavingOverride] = useState("");
  const [anagOpen, setAnagOpen] = useState(false);
  const [anagOrderId, setAnagOrderId] = useState("");
  const [anagForm, setAnagForm] = useState({});
  const [savingAnag, setSavingAnag] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [selectedLineId, setSelectedLineId] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [productCategoryFilter, setProductCategoryFilter] = useState("");
  const [productSubcategoryFilter, setProductSubcategoryFilter] = useState("");
  const [openProductSections, setOpenProductSections] = useState({});
  const [orderSearch, setOrderSearch] = useState("");
  const [magazzinoSearch, setMagazzinoSearch] = useState("");
  const [assignments, setAssignments] = useState({});
  // Login applicativo: utente collegato (etichetta + username), persistito
  // in localStorage finche' non si fa "Esci".
  const [authUser, setAuthUser] = useState(() => {
    try {
      const raw = localStorage.getItem("magazzino_auth") || sessionStorage.getItem("magazzino_auth");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [loginUsers, setLoginUsers] = useState([]);
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginRemember, setLoginRemember] = useState(true);
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [savingPreparedOrderId, setSavingPreparedOrderId] = useState("");
  const [expandedPreparedOrders, setExpandedPreparedOrders] = useState({});

  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedLotId, setSelectedLotId] = useState("");
  const [assignQty, setAssignQty] = useState("");

  const [orderDialogOpen, setOrderDialogOpen] = useState(false);
  const [addLineDialogOpen, setAddLineDialogOpen] = useState(false);
  const [editLineDialogOpen, setEditLineDialogOpen] = useState(false);
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [lotDialogOpen, setLotDialogOpen] = useState(false);
  const [editLotDialogOpen, setEditLotDialogOpen] = useState(false);
  const [adminDialogOpen, setAdminDialogOpen] = useState(false);
  const [editProductDialogOpen, setEditProductDialogOpen] = useState(false);

  // La modalita' Admin resta attiva finche' la scheda e' aperta. Prima stava
  // solo in memoria: bastava un ricaricamento (e ogni pubblicazione ne provoca
  // uno) e i bottoni Modifica/Riga sparivano senza dire niente. Si usa
  // sessionStorage e non localStorage: chiudendo la scheda si esce.
  const [isAdmin, setIsAdmin] = useState(() => {
    try {
      return sessionStorage.getItem("magazzino_admin") === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      if (isAdmin) sessionStorage.setItem("magazzino_admin", "1");
      else sessionStorage.removeItem("magazzino_admin");
    } catch {}
  }, [isAdmin]);
  const [adminPinInput, setAdminPinInput] = useState("");
  const [adminError, setAdminError] = useState("");

  const [newOrderCustomer, setNewOrderCustomer] = useState("");
  const [newOrderClientId, setNewOrderClientId] = useState("");
  // Cliente a mano SOLO come eccezione dichiarata (Luca 2026-07-17):
  // la normalita' e' selezionarlo dall'anagrafica (ora c'e' quella GAMMA).
  const [newOrderManual, setNewOrderManual] = useState(false);
  // CAP a mano per il cliente scritto a mano (serve al costo trasporto, che
  // altrimenti non ha destinazione per gli ordini a testo libero).
  const [newOrderCap, setNewOrderCap] = useState("");
  const [newOrderCategory, setNewOrderCategory] = useState("");
  const [newOrderNotes, setNewOrderNotes] = useState("");
  const [newOrderLines, setNewOrderLines] = useState([{ productId: "", productSearch: "", customName: "", isOutsideStock: false, qtyOrdered: "", lotId: "", prezzoUnitario: "", scontoPct: "", ivaPct: "4", naturaIva: "" }]);
  // Un click, una azione: vedi useUnaAzioneAllaVolta.
  const { esegui: azioneUnica, attive: azioniInCorso } = useUnaAzioneAllaVolta();
  // Cosa abbiamo gia' venduto a questo cliente FUORI dal nostro catalogo, negli
  // ultimi 12 mesi. Caricato una volta per tutto l'ordine che si sta scrivendo.
  // Prezzi dei listini 1 e 8, per affiancarli allo storico sulle righe.
  const listiniPrezzi = useListiniPrezzi(orderDialogOpen || page === "preparati");

  const storicoFuoriMag = useStoricoFuoriMagazzino({
    cliente: newOrderCustomer.trim(),
    codiceCliente: newOrderClientId,
    prodotti: products,
    attivo: orderDialogOpen,
  });

  const [editOrderDialogOpen, setEditOrderDialogOpen] = useState(false);
  const [editOrderCustomer, setEditOrderCustomer] = useState("");
  const [editOrderClientId, setEditOrderClientId] = useState("");
  const [editOrderCategory, setEditOrderCategory] = useState("");
  const [editOrderNotes, setEditOrderNotes] = useState("");
  const [savingEditedOrder, setSavingEditedOrder] = useState(false);
  const [colliDrafts, setColliDrafts] = useState({});
  const [savingColliOrderId, setSavingColliOrderId] = useState("");
  const [savingPaymentOrderId, setSavingPaymentOrderId] = useState("");
  const [transportModalOrderId, setTransportModalOrderId] = useState("");

  // Anagrafica clienti (gestione) + filtri picker ordine.
  const [clientDialogOpen, setClientDialogOpen] = useState(false);
  const [clientSearch, setClientSearch] = useState("");
  const [editingClientId, setEditingClientId] = useState("");
  const [clientForm, setClientForm] = useState({
    ragioneSociale: "", categoria: "", codiceClienteTs: "", piva: "", codiceFiscale: "", note: "",
  });
  const [savingClient, setSavingClient] = useState(false);

  // Canali suggeriti + quelli realmente presenti nei clienti.
  const SUGGESTED_CHANNELS = ["GDO", "Farmacia", "Horeca", "Export", "Ingrosso", "B2C", "Altro"];
  const clientCategories = useMemo(() => {
    const set = new Set(SUGGESTED_CHANNELS);
    for (const c of clients) if (c.category) set.add(c.category);
    return Array.from(set);
  }, [clients]);

  const activeClients = useMemo(
    () => clients.filter((c) => c.active).sort((a, b) => a.name.localeCompare(b.name)),
    [clients]
  );
  const clientsById = useMemo(() => {
    const m = {};
    for (const c of clients) m[c.id] = c;
    return m;
  }, [clients]);

  // Semaforo anagrafica di un ordine.
  // - Ordine dall'APP agenti: checklist COMPLETA (lista Luca) sullo snapshot.
  // - Cliente GAMMA: check sui campi che il gestionale espone (PIVA,
  //   indirizzo, CAP): GAMMA e' la fonte ufficiale per il resto.
  // - Cliente scritto a mano: anagrafica assente (avviso, non blocca).
  // Chiave cliente per il layer di arricchimento: P.IVA se disponibile, altrimenti
  // ragione sociale normalizzata. Stessa chiave = stesso cliente su ordini diversi,
  // cosi' tipologia e anagrafica completata valgono anche per gli ordini futuri.
  const clientKeyFor = (order) => {
    const app = appAnagrafiche[String(order?.id || "")];
    const gamma = clientsById[String(order?.clientId || "")];
    const piva = String(app?.partita_iva || gamma?.piva || "").replace(/\D/g, "");
    if (piva) return "piva:" + piva;
    const nome = String(app?.ragione_sociale || gamma?.name || order?.customer || "")
      .trim().toLowerCase().replace(/\s+/g, " ");
    return nome ? "nome:" + nome : "";
  };

  // Dato cliente EFFETTIVO = base (snapshot APP o GAMMA) + il nostro override.
  const effectiveCliente = (order) => {
    const app = appAnagrafiche[String(order?.id || "")];
    const gamma = clientsById[String(order?.clientId || "")];
    let base = {};
    let fonte = "";
    if (app) {
      base = { ...app };
      fonte = "APP";
    } else if (gamma) {
      base = {
        ragione_sociale: gamma.name,
        partita_iva: gamma.piva,
        sede_legale: gamma.indirizzo,
        indirizzo: gamma.indirizzo,
        cap: gamma.cap || order?.cap,
        email: gamma.email,
        telefono: gamma.telefono,
      };
      fonte = "GAMMA";
    }
    const ov = clientiOverride[clientKeyFor(order)] || null;
    const merged = { ...base };
    if (ov) {
      for (const k of Object.keys(ov)) {
        if (["chiave", "tipologia", "operatore", "aggiornato_il", "id", "note"].includes(k)) continue;
        if (String(ov[k] ?? "").trim() !== "") merged[k] = ov[k];
      }
    }
    return { base, ov, merged, fonte };
  };

  // Tipologia cliente: prima il nostro override, poi il dato dedotto dallo
  // snapshot/GAMMA (canale/settore), altrimenti vuota (da assegnare a mano).
  const tipologiaFor = (order) => {
    const ov = clientiOverride[clientKeyFor(order)];
    if (ov?.tipologia) return ov.tipologia;
    const app = appAnagrafiche[String(order?.id || "")];
    const gamma = clientsById[String(order?.clientId || "")];
    return normalizeTipologia(
      app?.settore || app?.tipologia || app?.canale || app?.categoria || gamma?.category || ""
    );
  };

  const anagraficaFor = (order) => {
    const { merged, ov, fonte } = effectiveCliente(order);
    // APP (o cliente a mano con override): checklist completa sul dato unito.
    if (fonte === "APP" || (fonte === "" && ov)) {
      const mancanti = checkAnagraficaApp(merged);
      const f = fonte === "APP" ? "APP" : "MANUALE";
      return mancanti.length
        ? { stato: "ko", label: "Anagrafica incompleta", mancanti, fonte: f }
        : { stato: "ok", label: "Anagrafica OK", mancanti: [], fonte: f };
    }
    // GAMMA fonte ufficiale per il resto: check leggero (PIVA/indirizzo/CAP).
    if (fonte === "GAMMA") {
      const has = (v) => String(v ?? "").trim() !== "";
      const mancanti = [];
      if (!has(merged.partita_iva)) mancanti.push("Partita IVA");
      if (!has(merged.indirizzo) && !has(merged.sede_legale)) mancanti.push("Indirizzo");
      if (!has(merged.cap) && !has(order?.cap)) mancanti.push("CAP");
      return mancanti.length
        ? { stato: "ko", label: "Anagrafica incompleta", mancanti, fonte: "GAMMA" }
        : { stato: "ok", label: "Anagrafica OK", mancanti: [], fonte: "GAMMA" };
    }
    return { stato: "assente", label: "Anagrafica assente", mancanti: [], fonte: "" };
  };

  // Assegna a mano la tipologia cliente (HORECA/FARMA/GDO) e la registra.
  const assignTipologia = async (order, tipologia) => {
    const chiave = clientKeyFor(order);
    if (!chiave) {
      alert("Cliente non identificabile: manca sia P.IVA sia ragione sociale.");
      return;
    }
    setSavingOverride(chiave);
    try {
      const res = await callSheetsApi({
        action: "saveClienteOverride",
        payload: JSON.stringify({ chiave, tipologia, operatore: authUser?.username || "" }),
      });
      if (res && res.success) {
        setClientiOverride((prev) => ({
          ...prev,
          [chiave]: { ...(prev[chiave] || {}), ...(res.override || {}), chiave, tipologia },
        }));
      } else {
        alert(
          "Tipologia non salvata: " + (res?.error || "errore") +
            "\n\nControlla che la tabella clienti_override esista su Supabase."
        );
      }
    } catch (e) {
      alert("Errore di collegamento nel salvataggio della tipologia.");
    } finally {
      setSavingOverride("");
    }
  };

  // Apre il modale per completare a mano l'anagrafica del cliente dell'ordine.
  const openCompletaAnagrafica = (order) => {
    if (!order) return;
    const { merged } = effectiveCliente(order);
    const form = {};
    for (const f of ANAG_FIELDS) form[f.key] = String(merged[f.key] ?? "");
    if (!form.cap && order?.cap) form.cap = String(order.cap);
    if (!form.sede_legale && merged.indirizzo) form.sede_legale = String(merged.indirizzo);
    setAnagForm(form);
    setAnagOrderId(String(order.id));
    setAnagOpen(true);
  };

  const saveCompletaAnagrafica = async () => {
    const order = orders.find((o) => String(o.id) === String(anagOrderId));
    if (!order) return;
    const chiave = clientKeyFor(order);
    if (!chiave) {
      alert("Cliente non identificabile: manca sia P.IVA sia ragione sociale.");
      return;
    }
    setSavingAnag(true);
    try {
      const payload = { chiave, operatore: authUser?.username || "" };
      for (const f of ANAG_FIELDS) payload[f.key] = anagForm[f.key] ?? "";
      const res = await callSheetsApi({
        action: "saveClienteOverride",
        payload: JSON.stringify(payload),
      });
      if (res && res.success) {
        setClientiOverride((prev) => ({
          ...prev,
          [chiave]: { ...(prev[chiave] || {}), ...payload, ...(res.override || {}), chiave },
        }));
        setAnagOpen(false);
      } else {
        alert(
          "Anagrafica non salvata: " + (res?.error || "errore") +
            "\n\nControlla che la tabella clienti_override esista su Supabase."
        );
      }
    } catch (e) {
      alert("Errore di collegamento nel salvataggio dell'anagrafica.");
    } finally {
      setSavingAnag(false);
    }
  };

  // Anagrafica incompleta sul caricamento lotti: NON blocca (vedi
  // ANAGRAFICA_BLOCCA). Qui nessun alert, altrimenti scatterebbe a ogni riga
  // assegnata: la segnalazione vive sul badge rosso e sull'avviso in "Segna
  // pronto", che e' il momento in cui serve davvero.
  const anagraficaBloccaLotti = (order) => {
    if (!ANAGRAFICA_BLOCCA) return false;
    const a = anagraficaFor(order);
    if (a.stato !== "ko") return false;
    alert(
      "ANAGRAFICA INCOMPLETA (" + a.fonte + ") - ordine bloccato.\n\n" +
        "Campi mancanti:\n- " + a.mancanti.join("\n- ") +
        "\n\nCompleta l'anagrafica del cliente prima di caricare i lotti."
    );
    return true;
  };
  // Tutti i clienti attivi raggruppati per canale (quelli senza canale in coda).
  const activeClientsGrouped = useMemo(() => {
    const groups = new Map();
    for (const c of activeClients) {
      const key = c.category || "Senza categoria";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(c);
    }
    const named = Array.from(groups.keys())
      .filter((k) => k !== "Senza categoria")
      .sort((a, b) => a.localeCompare(b));
    if (groups.has("Senza categoria")) named.push("Senza categoria");
    return named.map((k) => ({ category: k, clients: groups.get(k) }));
  }, [activeClients]);

  const [newLineProductId, setNewLineProductId] = useState("");
  const [newLineProductSearch, setNewLineProductSearch] = useState("");
  const [newLineIsOutsideStock, setNewLineIsOutsideStock] = useState(false);
  const [newLineCustomName, setNewLineCustomName] = useState("");
  const [newLineQty, setNewLineQty] = useState("");
  // Prezzo e sconto proposti dallo storico del cliente, sempre correggibili.
  const [newLinePrezzo, setNewLinePrezzo] = useState("");
  const [newLineSconto, setNewLineSconto] = useState("");
  const [savingNewLine, setSavingNewLine] = useState(false);

  const [editingLineId, setEditingLineId] = useState("");
  const [editingLineQty, setEditingLineQty] = useState("");
  const [savingEditedLine, setSavingEditedLine] = useState(false);

  const [newProductCode, setNewProductCode] = useState("");
  const [newProductName, setNewProductName] = useState("");
  const [newProductUom, setNewProductUom] = useState("pz");
  const [newProductManagesLots, setNewProductManagesLots] = useState(true);
  const [savingNewProduct, setSavingNewProduct] = useState(false);

  const [newLotProductId, setNewLotProductId] = useState("");
  const [newLotProductSearch, setNewLotProductSearch] = useState("");
  const [newLotCode, setNewLotCode] = useState("");
  const [newLotExpiry, setNewLotExpiry] = useState("");
  const [newLotQty, setNewLotQty] = useState("");
  const [savingNewLot, setSavingNewLot] = useState(false);

  // Carico di PRODUZIONE giornaliera: form semplice per la produzione.
  const [prodLoadOpen, setProdLoadOpen] = useState(false);
  const [prodProductId, setProdProductId] = useState("");
  const [prodProductSearch, setProdProductSearch] = useState("");
  const [prodCode, setProdCode] = useState("");
  const [prodExpiry, setProdExpiry] = useState("");
  const [prodQty, setProdQty] = useState("");
  const [savingProdLoad, setSavingProdLoad] = useState(false);
  const [prodTodayList, setProdTodayList] = useState([]);

  // Foto bolle (solo produzione): scatti la foto della bolla ricevuta e la mandi
  // alla coda dell'app acquisti. bollaPreview = data URL ridotta pronta all'invio.
  const [bollaPreview, setBollaPreview] = useState("");
  const [bollaCaption, setBollaCaption] = useState("");
  const [savingBolla, setSavingBolla] = useState(false);
  const [bolleInviate, setBolleInviate] = useState([]);
  // Ordini fornitore in arrivo (da Acquisti) per abbinare la foto della bolla.
  const [ordiniArrivo, setOrdiniArrivo] = useState([]);
  const [fotoOrdineId, setFotoOrdineId] = useState("");
  // Storico ordini caricato a richiesta (la vista principale carica solo l'attivo).
  const [archivedLoaded, setArchivedLoaded] = useState(false);
  const [loadingArchive, setLoadingArchive] = useState(false);
  // Modale "perche' l'ordine e' fermo": mode 'nuovo' (mette in fermo) o 'modifica'.
  const [fermoDialog, setFermoDialog] = useState({ open: false, orderId: "", mode: "nuovo" });
  const [fermoMotivo, setFermoMotivo] = useState("");
  const [savingFermo, setSavingFermo] = useState(false);

  // Chat interna produzione <-> amministrazione (+ ordini). Vocali + notifica.
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatText, setChatText] = useState("");
  const [chatUnread, setChatUnread] = useState(0);
  const [chatSending, setChatSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const chatOpenRef = useRef(false);
  const chatSeenRef = useRef(
    (typeof localStorage !== "undefined" && localStorage.getItem("chat_last_seen")) || ""
  );
  const chatNewestRef = useRef("");
  const mediaRecorderRef = useRef(null);
  const chatEndRef = useRef(null);

  const [editingLotId, setEditingLotId] = useState("");
  const [editingLotCode, setEditingLotCode] = useState("");
  const [editingLotExpiry, setEditingLotExpiry] = useState("");
  const [editingLotQty, setEditingLotQty] = useState("");
  const [addProductionQty, setAddProductionQty] = useState("");
  const [savingEditedLot, setSavingEditedLot] = useState(false);

  const [editingProductId, setEditingProductId] = useState(null);
  const [editProductCode, setEditProductCode] = useState("");
  const [editProductName, setEditProductName] = useState("");
  const [editProductUom, setEditProductUom] = useState("pz");
  const [editProductManagesLots, setEditProductManagesLots] = useState(true);
  const [savingProduct, setSavingProduct] = useState(false);
  const [deletingProductId, setDeletingProductId] = useState("");
  const [inlineAssignmentForms, setInlineAssignmentForms] = useState({});
  const [savingAssignmentLineId, setSavingAssignmentLineId] = useState("");

  // "Lotto al volo": dialog per creare un nuovo lotto al momento dell'evasione,
  // anche con quantita' fisica non ancora caricata. Il lotto viene creato con
  // quantita = quantita da assegnare (workaround senza modificare la rpc),
  // assegnato subito, e l'operatore aggiusta la quantita caricata reale piu'
  // tardi dalla pagina Prodotti/Magazzino.
  const [lotOnFlyDialog, setLotOnFlyDialog] = useState({
    open: false,
    lineId: "",
    code: "",
    expiry: "",
    qty: "",
  });
  const [savingLotOnFly, setSavingLotOnFly] = useState(false);
  const [windowWidth, setWindowWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : 1280
  );

  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
    };

    handleResize();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  // Carica l'elenco utenti per il menu a tendina della login.
  useEffect(() => {
    let annullato = false;
    (async () => {
      try {
        const res = await callSheetsApi({ action: "listAppUsers" });
        if (annullato) return;
        const users = res && res.success ? res.users || [] : [];
        setLoginUsers(users);
        setLoginUsername((prev) => prev || (users[0] ? users[0].username : ""));
      } catch {
        /* la login accetta anche username digitato a mano come fallback */
      }
    })();
    return () => {
      annullato = true;
    };
  }, []);

  const isIPadLayout = windowWidth <= 1100;
  const isSmallLayout = windowWidth <= 760;

  // Ruolo PRODUZIONE (accesso Magazzino): interfaccia snella e mirata al loro
  // lavoro (preparare gli ordini, caricare la produzione, foto bolle). Vede una
  // navigazione ridotta e puo' assegnare i lotti senza il PIN admin, ma non ha
  // le funzioni amministrative (eliminare, prodotti, anagrafica, ordini da APP).
  const isProduzione = String(authUser?.username || "").toLowerCase() === "produzione";
  // Chi puo' abbinare i lotti agli ordini: admin oppure la produzione.
  const canAssign = isAdmin || isProduzione;

  // Con la lista ordini affiancata, la colonna dettaglio e' stretta: la riga
  // ordine a 3 colonne (min ~724px) entra solo su desktop ampio. Sotto, impila.
  const isOrderRowWide = windowWidth > 1200;

  const responsiveTwoColumns = isSmallLayout
    ? "1fr"
    : isIPadLayout
      ? "300px minmax(0, 1fr)"
      : "360px minmax(0, 1fr)";
  const responsiveOrderDetailColumns = isIPadLayout ? "1fr" : "1.1fr 0.9fr";
  const responsiveProductColumns = isIPadLayout ? "1fr" : "repeat(2, minmax(0, 1fr))";
  const responsiveOrderLineColumns = isSmallLayout ? "1fr" : "1fr 140px 110px";

  const loadDataFromSheets = async () => {
    setLoadingData(true);
    setLoadError("");

    try {
      await callSheetsApi({ action: "archivePreparedOrders" }).catch(() => null);

      const raw = await callSheetsApi();

      const normalizedProducts = normalizeProducts(raw.prodotti || []);
      const safeProducts = normalizedProducts;
      const normalizedLots = normalizeLots(raw.lotti || [], safeProducts);
      const safeLots = normalizedLots;
      const normalizedOrders = normalizeOrders(raw.ordini || []);
      const normalizedLines = normalizeOrderLines(raw.righeOrdine || [], safeProducts);
      const mergedOrders = buildOrdersWithLines(normalizedOrders, normalizedLines);
      const normalizedAssignments = normalizeAssignments(
        raw.assegnazioniLotti || [],
        normalizedLines,
        safeLots
      );

      const normalizedClients = normalizeClients(raw.clienti || []);

      setProducts(safeProducts);
      setLots(safeLots);
      setOrders(mergedOrders);
      setClients(normalizedClients);
      setAppAnagrafiche(raw.anagraficheApp || {});
      setClientiOverride(raw.overridesClienti || {});
      setAssignments(normalizedAssignments);
      // Il reload riporta lo stato agli ordini ATTIVI: l'archivio si ricaricherà
      // a richiesta quando si riapre la pagina Archivio.
      setArchivedLoaded(false);
      setSelectedOrderId(mergedOrders[0]?.id ?? "");
      setSelectedLineId(mergedOrders[0]?.lines?.[0]?.lineId ?? "");
    } catch (error) {
      setLoadError(
        "Non sono riuscito a leggere i dati dal Google Sheet. Per ora vedi una demo locale."
      );
      setProducts(fallbackProducts);
      setLots(fallbackLots);
      setOrders([]);
      setClients([]);
      setAssignments({});
      setSelectedOrderId("");
      setSelectedLineId("");
    } finally {
      setLoadingData(false);
    }
  };

  // Carica lo STORICO (ordini archiviati) a richiesta e lo fonde nello stato.
  // La vista principale resta snella (solo attivo); qui aggiungiamo gli archiviati
  // con le loro righe/assegnazioni/anagrafiche solo quando serve (pagina Archivio).
  const loadArchivedOrders = async () => {
    if (loadingArchive) return;
    setLoadingArchive(true);
    try {
      const res = await callSheetsApi({
        action: "getOrdiniArchiviati",
        payload: JSON.stringify({ limit: 500 }),
      });
      if (!res || !res.success) {
        alert("Non sono riuscito a caricare l'archivio: " + ((res && res.error) || "errore"));
        return;
      }
      const normLines = normalizeOrderLines(res.righeOrdine || [], products);
      const normOrders = normalizeOrders(res.ordini || []);
      const merged = buildOrdersWithLines(normOrders, normLines);
      const normAssign = normalizeAssignments(res.assegnazioniLotti || [], normLines, lots);
      setOrders((prev) => {
        const have = new Set(prev.map((o) => String(o.id)));
        return [...prev, ...merged.filter((o) => !have.has(String(o.id)))];
      });
      setAssignments((prev) => ({ ...prev, ...normAssign }));
      setAppAnagrafiche((prev) => ({ ...prev, ...(res.anagraficheApp || {}) }));
      setArchivedLoaded(true);
    } catch (e) {
      alert("Errore di collegamento nel caricamento dell'archivio.");
    } finally {
      setLoadingArchive(false);
    }
  };

  // All'apertura della pagina Archivio, carica lo storico una volta.
  useEffect(() => {
    if (page === "archivio" && !archivedLoaded && !loadingArchive) loadArchivedOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, archivedLoaded]);

  // Carica gli ordini in arrivo dall'app agenti (reparto "Ordini da APP").
  const loadOrdiniApp = async () => {
    try {
      const res = await callSheetsApi({ action: "getOrdiniDaApp" });
      setOrdiniApp(res?.ordini || []);
    } catch (_) {
      setOrdiniApp([]);
    }
  };

  // "Sposta in ordini": importa l'ordine da app nelle tabelle operative.
  const spostaOrdineInOrdini = async (idApp) => {
    setOrdiniAppBusy(idApp);
    try {
      const res = await callSheetsApi({
        action: "spostaOrdineInOrdini",
        payload: JSON.stringify({ idOrdine: idApp }),
      });
      if (!res?.success) {
        alert("Spostamento non riuscito: " + (res?.error || "sconosciuto"));
        return;
      }
      await loadOrdiniApp();
      await loadDataFromSheets();
      setPage("ordini");
      setSelectedOrderId(res.idOrdine || "");
    } finally {
      setOrdiniAppBusy("");
    }
  };

  const rifiutaOrdineApp = async (idApp) => {
    const motivo = window.prompt("Motivo del rifiuto (opzionale):", "");
    if (motivo === null) return;
    setOrdiniAppBusy(idApp);
    try {
      await callSheetsApi({
        action: "rifiutaOrdineApp",
        payload: JSON.stringify({ idOrdine: idApp, motivo }),
      });
      await loadOrdiniApp();
    } finally {
      setOrdiniAppBusy("");
    }
  };

  useEffect(() => {
    loadOrdiniApp();
    const t = setInterval(loadOrdiniApp, 60000); // aggiorna il reparto ogni minuto
    return () => clearInterval(t);
  }, []);

  // Scaduto + anagrafica dal gestionale (sincronizzati dalle ts-sync-*):
  // alimentano il badge pagamento auto. Refresh ogni 10 minuti; se le
  // tabelle mancano o la rete cade, i badge restano manuali (niente rotture).
  useEffect(() => {
    const carica = async () => {
      try {
        const res = await callSheetsApi({ action: "getSituazioneGestionale" });
        if (res?.success) {
          setGestionale({ scaduti: res.scaduti || {}, matcher: buildPaymentMatcher(res.anagrafica) });
        }
      } catch (_) { /* badge restano manuali */ }
    };
    carica();
    const t = setInterval(carica, 10 * 60000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    loadDataFromSheets();
  }, []);

  useEffect(() => {
    if (!selectedOrderId || orders.length === 0) return;

    const selected = orders.find((order) => String(order.id) === String(selectedOrderId));

    if (String(selected?.workStatus || "").trim().toLowerCase() === "nuovo") {
      persistOrderViewed(selectedOrderId);
    }
  }, [selectedOrderId, orders]);

  useEffect(() => {
    setProductSubcategoryFilter("");
  }, [productCategoryFilter]);

  const productMap = useMemo(() => {
    const map = {};

    products.forEach((product) => {
      map[String(product.id)] = product;
      if (product.code) map[String(product.code)] = product;
    });

    return map;
  }, [products]);

  const categoryOptions = useMemo(() => {
    return Array.from(new Set(products.map((product) => product.category).filter(Boolean))).sort();
  }, [products]);

  const subcategoryOptions = useMemo(() => {
    return Array.from(
      new Set(
        products
          .filter(
            (product) =>
              !productCategoryFilter || String(product.category) === String(productCategoryFilter)
          )
          .map((product) => product.subcategory)
          .filter(Boolean)
      )
    ).sort();
  }, [products, productCategoryFilter]);

  const lotAssignedMap = useMemo(() => {
    const openLineIds = new Set();

    orders.forEach((order) => {
      // Solo ordini ancora aperti: gli evasi (Preparato/Spedito) e gli
      // archiviati hanno gia' scalato lo stock, le loro assegnazioni non sono
      // piu' "impegno" pendente sul lotto (coerente con productCommittedMap).
      if (order.archived) return;
      const st = String(order.status || "").trim().toLowerCase();
      if (st === "preparato" || st === "spedito") return;

      (order.lines || []).forEach((line) => {
        openLineIds.add(String(line.lineId));
      });
    });

    const assignedByLot = {};

    Object.entries(assignments).forEach(([lineId, lineAssignments]) => {
      if (!openLineIds.has(String(lineId))) return;

      (lineAssignments || []).forEach((assignment) => {
        assignedByLot[String(assignment.lotId)] =
          (assignedByLot[String(assignment.lotId)] || 0) + Number(assignment.qty || 0);
      });
    });

    return Object.fromEntries(
      lots.map((lot) => {
        const total = Number(lot.loadedQty || 0);
        const assigned = Number(assignedByLot[String(lot.id)] || 0);
        const assignable = Math.max(0, total - assigned);

        return [
          String(lot.id),
          {
            total,
            assigned,
            assignable,
          },
        ];
      })
    );
  }, [lots, assignments, orders]);

  const productCommittedMap = useMemo(() => {
    const committedByProduct = {};

    orders.forEach((order) => {
      // "Impegnato" = ordinato ma NON ancora evaso. Escludi gli ordini gia'
      // usciti dal magazzino: archiviati, Preparato e Spedito (per questi la
      // merce e' gia' stata scalata dalla giacenza quando furono preparati,
      // contarli come impegnati li peserebbe due volte). Contano solo gli
      // ordini ancora aperti (Da preparare, Fermo).
      if (order.archived) return;
      const st = String(order.status || "").trim().toLowerCase();
      if (st === "preparato" || st === "spedito") return;

      (order.lines || []).forEach((line) => {
        const productKey = String(line.productId);
        committedByProduct[productKey] =
          (committedByProduct[productKey] || 0) + Number(line.qtyOrdered || 0);
      });
    });

    return committedByProduct;
  }, [orders]);

  const activeLots = useMemo(() => lots.filter((lot) => !lot.archived), [lots]);


  const productStatsMap = useMemo(() => {
    return Object.fromEntries(
      products.map((product) => {
        const productLots = activeLots.filter((lot) => String(lot.productId) === String(product.id));
        const total = productLots.reduce((sum, lot) => sum + Number(lot.loadedQty || 0), 0);
        const committed = Number(productCommittedMap[String(product.id)] || 0);
        const available = Math.max(0, total - committed);

        return [
          String(product.id),
          {
            total,
            committed,
            available,
          },
        ];
      })
    );
  }, [products, activeLots, productCommittedMap]);

  const lotsAvailableMap = useMemo(() => {
    return Object.fromEntries(
      lots.map((lot) => [String(lot.id), lotAssignedMap[String(lot.id)]?.assignable || 0])
    );
  }, [lots, lotAssignedMap]);

  // Vista "magazzino a prima vista": una riga per lotto attivo con la referenza
  // e accanto la quantita' disponibile secondo il lotto (come il modulo cartaceo).
  // Lotti esauriti (giacenza=0 E impegnato=0, ovvero "tutto evaso") esclusi:
  // sono lotti morti, non servono in vista. Restano visibili quelli con
  // giacenza > 0 anche se completamente impegnati (utile sapere che ci sono).
  const magazzinoRows = useMemo(() => {
    return lots
      .filter((lot) => !lot.archived)
      .map((lot) => {
        const product = products.find(
          (item) => String(item.id) === String(lot.productId)
        );
        const info = lotAssignedMap[String(lot.id)] || {};
        return {
          lotId: String(lot.id),
          lotCode: String(lot.lot || ""),
          productId: String(lot.productId || ""),
          productName: product?.name || "(prodotto sconosciuto)",
          productCode: product?.code || "",
          category: product?.category || "",
          expiry: lot.expiry ? String(lot.expiry).slice(0, 10) : "",
          loaded: Number(info.total ?? lot.loadedQty ?? 0),
          committed: Number(info.assigned ?? 0),
          available: Number(info.assignable ?? 0),
        };
      })
      .filter((row) => row.loaded > 0 || row.committed > 0)
      .sort((a, b) => {
        const byName = a.productName.localeCompare(b.productName);
        if (byName !== 0) return byName;
        return String(a.expiry).localeCompare(String(b.expiry));
      });
  }, [lots, products, lotAssignedMap]);

  // Raggruppa per prodotto: 1 header con totali + righe lotto sotto.
  // L'IMPEGNATO del PRODOTTO e' la somma delle qtyOrdered su righe in ordini
  // non preparati (productCommittedMap), indipendentemente da quanto e' gia'
  // stato assegnato a un lotto. L'impegnato del singolo LOTTO resta la quota
  // gia' assegnata al lotto (row.committed). DISPONIBILE prodotto = giacenza
  // totale - impegnato del prodotto (puo' essere negativo se sono stati
  // ordinati piu' pezzi di quanti ce ne sono fisicamente: utile per accorgersene).
  const magazzinoGrouped = useMemo(() => {
    const groups = new Map();
    // 1. Semina un gruppo per OGNI prodotto a catalogo, cosi' anche i prodotti
    //    a giacenza 0 (senza lotti) restano visibili: si vede l'impegnato e,
    //    con la disponibile negativa, quanto bisogna produrre. (Richiesta Luca.)
    for (const product of products) {
      const key = String(product.id);
      groups.set(key, {
        productId: String(product.id),
        productName: product.name || "(senza nome)",
        productCode: product.code || "",
        category: product.category || "",
        lots: [],
        totalLoaded: 0,
        totalCommitted: 0, // ricalcolato da productCommittedMap dopo
        totalAvailable: 0,
      });
    }
    // 2. Attacca i lotti attivi (non esauriti) al gruppo del prodotto. Se un
    //    lotto punta a un prodotto non piu' a catalogo, crea comunque un gruppo.
    for (const row of magazzinoRows) {
      const key = row.productId || row.productCode || row.productName;
      if (!groups.has(key)) {
        groups.set(key, {
          productId: row.productId,
          productName: row.productName,
          productCode: row.productCode,
          category: row.category,
          lots: [],
          totalLoaded: 0,
          totalCommitted: 0,
          totalAvailable: 0,
        });
      }
      const g = groups.get(key);
      g.lots.push(row);
      g.totalLoaded += Number(row.loaded || 0);
    }
    // 3. Ricalcolo totalCommitted e totalAvailable usando productCommittedMap.
    const out = [...groups.values()].map((g) => {
      const productCommitted = Number(productCommittedMap[String(g.productId)] || 0);
      return {
        ...g,
        totalCommitted: productCommitted,
        totalAvailable: g.totalLoaded - productCommitted,
      };
    });
    return out.sort((a, b) => {
      const byCat = (a.category || "ZZZ Senza categoria").localeCompare(b.category || "ZZZ Senza categoria");
      if (byCat !== 0) return byCat;
      return a.productName.localeCompare(b.productName);
    });
  }, [products, magazzinoRows, productCommittedMap]);

  // ---- CARTONI BOLLATI (regola Luca 2026-07-28) ----
  // Un lotto sotto i 30 giorni di vita residua e' "bollato": non si vende, si
  // regala (l'app agenti lo offre come omaggio oltre i 10 cartoni ordinati).
  // Questa e' la riga bollati dell'operatore: cosa sta scadendo, quanto ne
  // resta e quanti cartoni interi si possono ancora dare via.
  // Guardie sui dati sporchi: scadenza mancante o con anno < 2020 (es. il lotto
  // "000000") NON e' attendibile e non entra; i lotti gia' scaduti si segnalano
  // a parte perche' vanno distrutti, non regalati.
  // Mezzanotte di oggi: base per i giorni residui dei bollini (stabile durante
  // il render, cosi' tutte le righe usano lo stesso "oggi").
  const oggiMagazzinoMs = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, []);

  const bollatiRows = useMemo(() => {
    const oggi = new Date();
    oggi.setHours(0, 0, 0, 0);
    const out = [];
    for (const row of magazzinoRows) {
      const disponibile = Number(row.available || 0);
      if (disponibile <= 0) continue;
      if (!row.expiry) continue;
      const d = new Date(row.expiry);
      if (Number.isNaN(d.getTime()) || d.getFullYear() < 2020) continue;
      const giorni = Math.floor((d - oggi) / 86400000);
      if (giorni >= GIORNI_BOLLATO) continue;
      // I cartoni interi li calcola l'app agenti (ha i pezzi/collo del
      // listino): qui si ragiona in pezzi, che e' il dato del magazzino.
      out.push({ ...row, giorni, scaduto: giorni < 0, disponibile });
    }
    return out.sort((a, b) => a.giorni - b.giorni);
  }, [magazzinoRows]);

  const bollatiTotali = useMemo(() => ({
    lotti: bollatiRows.length,
    pezzi: bollatiRows.reduce((t, r) => t + r.disponibile, 0),
    scaduti: bollatiRows.filter((r) => r.scaduto).length,
    daRegalare: bollatiRows.filter((r) => !r.scaduto).reduce((t, r) => t + r.disponibile, 0),
  }), [bollatiRows]);

  // Ricerca a livello di prodotto: filtra i gruppi (referenza, codice,
  // categoria) o per codice lotto tra i lotti del prodotto.
  const filteredMagazzinoGrouped = useMemo(() => {
    const q = magazzinoSearch.trim().toLowerCase();
    if (!q) return magazzinoGrouped;
    return magazzinoGrouped.filter(
      (g) =>
        g.productName.toLowerCase().includes(q) ||
        g.productCode.toLowerCase().includes(q) ||
        (g.category || "").toLowerCase().includes(q) ||
        g.lots.some((l) => l.lotCode.toLowerCase().includes(q))
    );
  }, [magazzinoGrouped, magazzinoSearch]);

  const ordersWithComputed = useMemo(() => {
    return orders.map((order) => {
      const lines = (order.lines || []).map((line) => {
        const product = products.find((item) => String(item.id) === String(line.productId));
        const outsideStock = isOutsideStockLine(line);
        const lotOptional = isLotOptionalProduct(product);
        // Sempre selettore lotti per le righe di magazzino. Anche i prodotti
        // a "disponibilita' generica" hanno il loro lotto DISPONIBILITA da
        // scegliere esplicitamente: cosi' su TUTTI gli ordini Luca puo' vedere
        // e selezionare il lotto. Escluse le righe fuori magazzino e i codici
        // a lotto facoltativo (HORECA, BIS): se c'e' un lotto lo si usa,
        // altrimenti si movimenta senza lotto.
        const requiresLots = !outsideStock && !lotOptional;

        const assignedFromAssignments = (assignments[line.lineId] || []).reduce(
          (sum, assignment) => sum + assignment.qty,
          0
        );

        const assignedQty = assignedFromAssignments;

        const qtyToAssign = Math.max(0, line.qtyOrdered - assignedQty);

        const weightKg = Number(product?.weightKg || 0);
        return { ...line, assignedQty, qtyToAssign, requiresLots, isOutsideStock: outsideStock, lotOptional, weightKg, category: String(product?.category || "") };
      });

      const totalToAssign = lines.reduce((sum, line) => sum + line.qtyToAssign, 0);
      const totalOrdered = lines.reduce((sum, line) => sum + line.qtyOrdered, 0);
      // C'e' merce DA BOLLINARE in questo ordine? Il marker viaggia nel nome
      // riga scritto dall'import (l'app agenti manda bollato:true). Serve a
      // far vedere il cartone bollato anche a ordine gia' spostato in
      // preparazione, senza dover riaprire l'ordine app. (Luca 2026-07-30.)
      const righeDaBollinare = lines.filter((l) => /DA BOLLINARE/i.test(String(l.productName || "")));
      // Peso totale ordine = somma di (quantita' ordinata × peso unitario) per
      // ogni riga di magazzino con peso noto.
      const pesoTotale = lines.reduce(
        (sum, line) => sum + Number(line.qtyOrdered || 0) * Number(line.weightKg || 0),
        0
      );
      // Trasporto: preventivo corriere dal motore logistica, con peso ordine +
      // CAP + temperatura dedotta dai prodotti. Il CAP e' quello SALVATO
      // sull'ordine (order.cap, congelato alla creazione, vale per ogni cliente
      // anche agenti/testo libero); in mancanza, ripiego sull'anagrafica GAMMA.
      const temperatura = temperaturaOrdine(lines);
      const capDest = String(
        order.cap || clientsById[String(order.clientId)]?.cap || ""
      ).trim();
      const transport =
        pesoTotale > 0 && capDest
          ? calcolaPreventivo({ peso: pesoTotale, cap: capDest, temperatura })
          : { errore: !capDest ? "CAP destinazione mancante" : "Peso ordine 0" };

      // Colli: suggerito = somma delle quantità di tutte le righe. Se l'utente ha
      // inserito un valore manuale (colliManual) quello prevale.
      const colliSuggested = lines.reduce(
        (sum, line) => sum + Number(line.qtyOrdered || 0),
        0
      );
      const colli =
        order.colliManual !== null && order.colliManual !== undefined
          ? Number(order.colliManual)
          : colliSuggested;

      const explicitStatus = String(order.status || "").trim();
      const explicitStatusLower = explicitStatus.toLowerCase();
      const workStatusLower = String(order.workStatus || "").trim().toLowerCase();
      // "Fermo" anche se solo stato_lavorazione='Fermato' (ordini messi in fermo
      // prima del fix che scriveva solo stato_lavorazione): cosi' non tornano
      // tra gli ordini da preparare al refresh.
      const computedStatus =
        explicitStatusLower === "fermo" || workStatusLower === "fermato"
          ? "Fermo"
          : explicitStatusLower === "spedito"
            ? "Spedito"
            : explicitStatusLower === "preparato"
              ? "Preparato"
              : totalToAssign === 0
                ? "Pronto"
                : totalToAssign < totalOrdered
                  ? "Parziale"
                  : "Da preparare";

      return {
        ...order,
        lines,
        totalToAssign,
        computedStatus,
        colliSuggested,
        colli,
        pesoTotale,
        temperatura,
        capDest,
        transport,
        righeDaBollinare,
        daBollinare: righeDaBollinare.length > 0,
        colliIsManual: order.colliManual !== null && order.colliManual !== undefined,
      };
    });
  }, [orders, assignments, products, clientsById]);

  const filteredOrders = useMemo(() => {
    const q = orderSearch.trim().toLowerCase();
    const visibleOrders = ordersWithComputed
      .filter((order) => !order.archived)
      .filter((order) => String(order.computedStatus) !== "Fermo")
      .filter((order) => String(order.computedStatus) !== "Preparato")
      .filter((order) => String(order.computedStatus) !== "Spedito")
      // Sempre in ordine cronologico di caricamento: i piu' recenti in cima.
      // (Richiesta Luca.)
      .sort((a, b) => orderLoadTs(b) - orderLoadTs(a));

    if (!q) return visibleOrders;

    return visibleOrders.filter(
      (order) =>
        String(order.id).toLowerCase().includes(q) ||
        String(order.customer).toLowerCase().includes(q) ||
        String(order.computedStatus).toLowerCase().includes(q)
    );
  }, [ordersWithComputed, orderSearch]);

  const activeOrders = useMemo(
    () =>
      ordersWithComputed.filter(
        (order) =>
          !order.archived &&
          String(order.computedStatus) !== "Fermo" &&
          String(order.computedStatus) !== "Preparato" &&
          String(order.computedStatus) !== "Spedito"
      ),
    [ordersWithComputed]
  );

  const stoppedOrders = useMemo(() => {
    const q = orderSearch.trim().toLowerCase();

    const ordersToShow = ordersWithComputed
      .filter((order) => !order.archived && String(order.computedStatus) === "Fermo")
      .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));

    if (!q) return ordersToShow;

    return ordersToShow.filter(
      (order) =>
        String(order.id).toLowerCase().includes(q) ||
        String(order.customer).toLowerCase().includes(q) ||
        String(order.notes).toLowerCase().includes(q)
    );
  }, [ordersWithComputed, orderSearch]);

  // Contatore per il badge di menu: NON filtrato dalla ricerca (il numero deve
  // restare quello vero anche mentre si cerca).
  const stoppedCount = useMemo(
    () =>
      ordersWithComputed.filter(
        (order) => !order.archived && String(order.computedStatus) === "Fermo"
      ).length,
    [ordersWithComputed]
  );

  const preparedOrders = useMemo(() => {
    const q = orderSearch.trim().toLowerCase();

    const ordersToShow = ordersWithComputed
      .filter((order) => !order.archived && String(order.computedStatus) === "Preparato")
      .sort((a, b) => String(b.dataPrepared || b.date || "").localeCompare(String(a.dataPrepared || a.date || "")));

    if (!q) return ordersToShow;

    return ordersToShow.filter(
      (order) =>
        String(order.id).toLowerCase().includes(q) ||
        String(order.customer).toLowerCase().includes(q) ||
        String(order.notes).toLowerCase().includes(q)
    );
  }, [ordersWithComputed, orderSearch]);

  // Ordini SPEDITI del giorno (non archiviati): la sezione dedicata dove si
  // vede cosa e' uscito e con quale corriere. A mezzanotte si archiviano.
  const speditiOrders = useMemo(
    () =>
      ordersWithComputed
        .filter((order) => !order.archived && String(order.computedStatus) === "Spedito")
        .sort((a, b) => String(b.dataPrepared || b.date || "").localeCompare(String(a.dataPrepared || a.date || ""))),
    [ordersWithComputed]
  );

  const selectedOrder =
    activeOrders.find((order) => String(order.id) === String(selectedOrderId)) ||
    activeOrders[0];

  const selectedLine =
    selectedOrder?.lines.find((line) => String(line.lineId) === String(selectedLineId)) ||
    selectedOrder?.lines[0];

  const selectedLotProduct = products.find(
    (product) => String(product.id) === String(newLotProductId)
  );

  const selectedOrderLines = useMemo(() => {
    if (!selectedOrder?.lines) return [];

    return [...selectedOrder.lines].sort((a, b) => {
      const aDone = a.qtyToAssign <= 0 ? 1 : 0;
      const bDone = b.qtyToAssign <= 0 ? 1 : 0;
      if (aDone !== bDone) return aDone - bDone;

      const aOrder = Number(a.rowOrder || 0);
      const bOrder = Number(b.rowOrder || 0);
      if (aOrder !== bOrder) return aOrder - bOrder;

      return String(a.lineId).localeCompare(String(b.lineId));
    });
  }, [selectedOrder]);

  const selectedOrderCompletedLines = selectedOrderLines.filter(
    (line) => line.qtyToAssign <= 0
  ).length;

  const availableLotsForSelectedLine = useMemo(() => {
    if (!selectedLine) return [];

    // Mostriamo tutti i lotti con giacenza fisica (total > 0), anche se la
    // disponibilita' e' a 0 perche' impegnata in altri ordini non ancora evasi.
    // L'operatore decide se assegnare comunque (la merce potrebbe essere presente).
    return activeLots
      .filter(
        (lot) =>
          String(lot.productId) === String(selectedLine.productId) &&
          (lotAssignedMap[String(lot.id)]?.total || 0) > 0
      )
      .sort((a, b) => new Date(a.expiry) - new Date(b.expiry));
  }, [selectedLine, lots, lotAssignedMap]);

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();

    return products
      .map((product) => {
        const productLots = activeLots.filter((lot) => String(lot.productId) === String(product.id));
        const productStats = productStatsMap[String(product.id)] || {
          total: 0,
          committed: 0,
          available: 0,
        };

        return {
          ...product,
          productLots,
          totalLoaded: productStats.total,
          totalCommitted: productStats.committed,
          totalAvailable: productStats.available,
        };
      })
      .filter((product) => {
        const matchesSearch =
          !q ||
          String(product.code).toLowerCase().includes(q) ||
          String(product.name).toLowerCase().includes(q) ||
          String(product.category).toLowerCase().includes(q) ||
          String(product.subcategory).toLowerCase().includes(q);

        const matchesCategory =
          !productCategoryFilter || String(product.category) === String(productCategoryFilter);

        const matchesSubcategory =
          !productSubcategoryFilter ||
          String(product.subcategory) === String(productSubcategoryFilter);

        return matchesSearch && matchesCategory && matchesSubcategory;
      });
  }, [
    products,
    activeLots,
    lotsAvailableMap,
    productStatsMap,
    productSearch,
    productCategoryFilter,
    productSubcategoryFilter,
  ]);

  const groupedProducts = useMemo(() => {
    const groups = {};

    filteredProducts.forEach((product) => {
      const category = product.category || "Senza categoria";

      if (!groups[category]) {
        groups[category] = {
          category,
          products: [],
          totalLoaded: 0,
          totalCommitted: 0,
          totalAvailable: 0,
          totalLots: 0,
          subcategories: {},
        };
      }

      groups[category].products.push(product);
      groups[category].totalLoaded += Number(product.totalLoaded || 0);
      groups[category].totalCommitted += Number(product.totalCommitted || 0);
      groups[category].totalAvailable += Number(product.totalAvailable || 0);
      groups[category].totalLots += (product.productLots || []).length;

      const subcategory = product.subcategory || "Senza sottocategoria";

      if (!groups[category].subcategories[subcategory]) {
        groups[category].subcategories[subcategory] = [];
      }

      groups[category].subcategories[subcategory].push(product);
    });

    return Object.values(groups).sort((a, b) => a.category.localeCompare(b.category));
  }, [filteredProducts]);

  const toggleProductSection = (category) => {
    setOpenProductSections((prev) => ({
      ...prev,
      [category]: !prev[category],
    }));
  };

  const openAssignDialog = (lineId) => {
    setSelectedLineId(lineId);
    setSelectedLotId("");
    setAssignQty("");
    setAssignDialogOpen(true);
  };

  const handleLotSelect = (lotId) => {
    setSelectedLotId(lotId);

    if (!selectedLine) return;

    const available = lotsAvailableMap[String(lotId)] || 0;
    const suggestedQty = Math.min(selectedLine.qtyToAssign, available);

    setAssignQty(String(suggestedQty));
  };

  const getInlineAssignmentForm = (lineId) => {
    return inlineAssignmentForms[String(lineId)] || { lotId: "", qty: "" };
  };

  // Apri il dialog "lotto al volo" per la riga: la qty di default e' il
  // residuo da assegnare. Resta editabile.
  const openLotOnFlyDialog = (line) => {
    const form = getInlineAssignmentForm(line.lineId);
    const defaultQty = Number(form.qty) > 0 ? form.qty : String(line.qtyToAssign || "");
    setLotOnFlyDialog({
      open: true,
      lineId: String(line.lineId),
      code: "",
      expiry: "",
      qty: defaultQty,
    });
  };

  // Crea lotto al volo + assegnazione immediata. Il lotto nasce con qty
  // caricata = qty da assegnare cosi' assegna_lotto non rifiuta per
  // disponibilita' insufficiente. Dopo prepara_ordine la giacenza va a 0;
  // operatore corregge la giacenza reale dalla pagina Prodotti (puo' anche
  // diventare negativa se ne ha consegnati piu' di quanti ne ha prodotti).
  const createLotOnFly = async () => {
    const { lineId, code, expiry, qty } = lotOnFlyDialog;
    if (!lineId) return;
    const ordineDellaRiga = ordersWithComputed.find((o) =>
      (o.lines || []).some((l) => String(l.lineId) === String(lineId))
    );
    if (ordineDellaRiga && anagraficaBloccaLotti(ordineDellaRiga)) return;
    const line = ordersWithComputed
      .flatMap((o) => o.lines)
      .find((l) => String(l.lineId) === String(lineId));
    if (!line) {
      alert("Riga non trovata");
      return;
    }
    const codeTrim = String(code || "").trim();
    if (!codeTrim) {
      alert("Inserisci il codice del lotto");
      return;
    }
    // REGOLA: per prodotti a gestione lotti il codice 'DISPONIBILITA' e'
    // vietato. La gestione generica e' riservata ai soli prodotti che hanno
    // gestione_lotti=NO nella matrice.
    if (codeTrim.toLowerCase() === "disponibilita") {
      const prod = products.find((p) => String(p.id) === String(line.productId));
      if (prod && productManagesLots(prod)) {
        alert(
          `Questo prodotto (${prod.code} ${prod.name}) ha gestione lotti attiva. ` +
          `Non puoi usare il codice generico DISPONIBILITA: inserisci un codice lotto reale.`
        );
        return;
      }
    }
    const qtyN = Number(qty);
    if (!qtyN || qtyN <= 0) {
      alert("Inserisci la quantita da assegnare (>0)");
      return;
    }

    setSavingLotOnFly(true);
    try {
      // ACCORPAMENTO: se esiste gia' un lotto con stesso codice (case-insensitive)
      // sullo stesso prodotto e non archiviato, lo riusiamo. La giacenza fisica
      // resta quella che ha, e ci aggiungiamo la qty richiesta come ulteriore
      // assegnazione (sommata a quella eventualmente esistente sulla stessa riga).
      // I lotti dello stesso codice ma su prodotti diversi NON si toccano.
      const existingLot = lots.find(
        (l) =>
          !l.archived &&
          String(l.productId) === String(line.productId) &&
          String(l.lot || "").trim().toLowerCase() === codeTrim.toLowerCase()
      );

      let targetLotId;
      if (existingLot) {
        targetLotId = String(existingLot.id);
      } else {
        // Crea il lotto con giacenza fisica = 0 (la produzione vera arrivera' dopo).
        const created = await callSheetsApi({
          action: "createLot",
          payload: JSON.stringify({
            idProdotto: String(line.productId),
            codiceLotto: codeTrim,
            scadenza: expiry || "",
            quantita: 0,
          }),
        });
        if (!created?.success) {
          alert("Errore creazione lotto: " + (created?.error || "sconosciuto"));
          return;
        }
        targetLotId = created.idLotto || created.id_lotto;
        if (!targetLotId) {
          alert("Lotto creato ma id mancante. Ricarico i dati e riprova.");
          await loadDataFromSheets();
          return;
        }
      }

      // Calcolo qty totale da assegnare alla coppia (riga, lotto target):
      // se esiste gia' un'assegnazione su questa riga per questo lotto,
      // sommo la nuova qty (l'rpc/adapter fa upsert, quindi devo passare il totale).
      const currentAssignedOnThisLot = (assignments[line.lineId] || [])
        .filter((a) => String(a.lotId) === String(targetLotId))
        .reduce((s, a) => s + Number(a.qty || 0), 0);
      const totalQty = currentAssignedOnThisLot + qtyN;

      // Assegna (allowNegative=true: il lotto puo' andare in negativo dopo
      // prepara_ordine se la giacenza fisica e' inferiore a quanto assegnato).
      const assigned = await callSheetsApi({
        action: "assignLot",
        payload: JSON.stringify({
          lineId: String(line.lineId),
          lotId: String(targetLotId),
          qty: totalQty,
          operatore: existingLot ? "lotto al volo (accorpato)" : "lotto al volo",
          allowNegative: true,
        }),
      });
      if (!assigned?.success) {
        alert(
          "Lotto creato ma assegnazione fallita: " +
            (assigned?.error || "sconosciuto") +
            "\nIl lotto resta caricato col valore inserito. Puoi assegnarlo manualmente."
        );
        await loadDataFromSheets();
        return;
      }

      // 3) Refresh dati e chiusura dialog.
      await loadDataFromSheets();
      setLotOnFlyDialog({ open: false, lineId: "", code: "", expiry: "", qty: "" });
    } catch (err) {
      alert("Errore: " + String(err));
    } finally {
      setSavingLotOnFly(false);
    }
  };

  const updateInlineAssignmentForm = (lineId, field, value) => {
    setInlineAssignmentForms((prev) => ({
      ...prev,
      [String(lineId)]: {
        ...(prev[String(lineId)] || { lotId: "", qty: "" }),
        [field]: value,
      },
    }));
  };

  const getAvailableLotsForLine = (line) => {
    if (!line) return [];

    // Stesso criterio della vista dettaglio: lotti con giacenza fisica > 0,
    // anche se la disponibilita' calcolata e' 0 (impegnata altrove).
    return activeLots
      .filter(
        (lot) =>
          String(lot.productId) === String(line.productId) &&
          (lotAssignedMap[String(lot.id)]?.total || 0) > 0
      )
      .sort((a, b) => new Date(a.expiry) - new Date(b.expiry));
  };

  const handleInlineLotSelect = (line, lotId) => {
    if (!line) return;

    const available = lotsAvailableMap[String(lotId)] || 0;
    const suggestedQty = Math.min(line.qtyToAssign, available);

    setInlineAssignmentForms((prev) => ({
      ...prev,
      [String(line.lineId)]: {
        lotId: String(lotId || ""),
        qty: lotId ? String(suggestedQty) : "",
      },
    }));
  };

  const confirmInlineAssignment = async (line) => {
    if (!line) return;
    if (selectedOrder && anagraficaBloccaLotti(selectedOrder)) return;

    const form = getInlineAssignmentForm(line.lineId);
    const requiresLots = line.requiresLots !== false;

    if (requiresLots && !form.lotId) {
      alert("Seleziona lotto");
      return;
    }

    if (!form.qty) {
      alert("Inserisci la quantità");
      return;
    }

    const qty = Number(form.qty);

    if (!qty || qty <= 0) {
      alert("Inserisci una quantità valida");
      return;
    }

    let selectedLot = null;
    let lotId = "";
    let lotCode = "";

    if (form.lotId) {
      // Un lotto e' stato scelto: usalo (vale anche per gli HORECA, "se
      // presente il lotto bene"). Quando requiresLots e' true il lotto e' gia'
      // obbligatorio (return sopra se manca).
      selectedLot = lots.find((lot) => String(lot.id) === String(form.lotId));

      if (!selectedLot) {
        alert("Lotto non trovato");
        return;
      }

      const lotInfo = lotAssignedMap[String(form.lotId)] || {};
      const available = Number(lotInfo.assignable ?? (lotsAvailableMap[String(form.lotId)] || 0));

      if (qty > available) {
        const giacenza = Number(lotInfo.total || 0);
        const impegnato = Number(lotInfo.assigned || 0);
        const ok = window.confirm(
          "Disponibili solo " + available + " pz di questo lotto (giacenza " + giacenza +
            ", gia' impegnati " + impegnato + " in altri ordini non ancora evasi).\n\n" +
            "La disponibilita' a 0 non vuol dire giacenza a 0: se la merce e' fisicamente presente " +
            "puoi assegnarne comunque " + qty + ". Gli altri ordini impegnati potrebbero non uscire prima di questo.\n\n" +
            "Assegnare comunque " + qty + " pz?"
        );
        if (!ok) return;
      }

      lotId = String(form.lotId);
      lotCode = selectedLot.lot;
    } else {
      if (isOutsideStockLine(line)) {
        lotId = "FUORI_MAGAZZINO";
        lotCode = "FUORI_MAGAZZINO";
      } else if (line.lotOptional) {
        // Codice a lotto facoltativo (HORECA, BIS) senza lotto selezionato:
        // movimento il codice articolo senza lotto. L'assegnazione tiene il
        // productId reale (resta un articolo di magazzino), non passa dalla
        // rpc assegna_lotto.
        lotId = "SENZA_LOTTO";
        lotCode = "SENZA_LOTTO";
      } else {
        const genericLots = activeLots
          .filter(
            (lot) =>
              String(lot.productId) === String(line.productId) &&
              String(lot.lot || "").trim().toLowerCase() === "disponibilita"
          )
          .sort((a, b) => Number(lotsAvailableMap[String(b.id)] || 0) - Number(lotsAvailableMap[String(a.id)] || 0));

        const genericLot = genericLots.find(
          (lot) => Number(lotsAvailableMap[String(lot.id)] || 0) >= qty
        );

        const totalGenericAvailable = genericLots.reduce(
          (sum, lot) => sum + Number(lotsAvailableMap[String(lot.id)] || 0),
          0
        );

        if (!genericLot) {
          alert(
            totalGenericAvailable > 0
              ? "Lotto DISPONIBILITA insufficiente per questo prodotto. Disponibile: " + totalGenericAvailable
              : "Lotto DISPONIBILITA non caricato per questo prodotto. Caricalo prima dal magazzino."
          );
          return;
        }

        lotId = String(genericLot.id);
        lotCode = "DISPONIBILITA";
      }
    }

    if (qty > line.qtyToAssign) {
      alert("La quantità supera il residuo da assegnare");
      return;
    }

    const newAssignment = {
      assignmentId: `ASS-${Date.now()}`,
      lineId: String(line.lineId),
      lotId,
      lotCode,
      productId: String(line.productId),
      qty,
    };

    // Aggiornamento immediato dell'interfaccia: l'operatore non aspetta Google Sheet.
    setAssignments((prev) => ({
      ...prev,
      [line.lineId]: [
        ...(prev[line.lineId] || []),
        { assignmentId: newAssignment.assignmentId, lotId, productId: String(line.productId), qty },
      ],
    }));

    setInlineAssignmentForms((prev) => ({
      ...prev,
      [String(line.lineId)]: { lotId: "", qty: "" },
    }));

    setSelectedLineId(line.lineId);
    setSavingAssignmentLineId(String(line.lineId));

    try {
      const result = await callSheetsApi({
        action: "assignLot",
        payload: JSON.stringify(newAssignment),
      });

      if (!result || !result.success) {
        setAssignments((prev) => ({
          ...prev,
          [line.lineId]: (prev[line.lineId] || []).filter(
            (assignment) =>
              String(assignment.assignmentId) !== String(newAssignment.assignmentId)
          ),
        }));

        setInlineAssignmentForms((prev) => ({
          ...prev,
          [String(line.lineId)]: form,
        }));

        alert(
          "Errore nel salvataggio assegnazione sul foglio: " +
            ((result && result.error) || "errore sconosciuto")
        );
        // Riga non piu' allineata col database: ricarico cosi' l'ordine si
        // aggiorna con gli id reali e la nuova prova va a buon fine.
        if (result && result.code === "RIGA_INESISTENTE") {
          await loadDataFromSheets();
        }
      } else if (
        result.assignmentId &&
        String(result.assignmentId) !== String(newAssignment.assignmentId)
      ) {
        // Bug fix: il backend ha generato un suo id_assegnazione (diverso da
        // quello locale ottimistico). Sostituisco l'id locale con quello reale,
        // altrimenti la successiva deleteAssignment fallisce con "inesistente".
        setAssignments((prev) => ({
          ...prev,
          [line.lineId]: (prev[line.lineId] || []).map((assignment) =>
            String(assignment.assignmentId) === String(newAssignment.assignmentId)
              ? { ...assignment, assignmentId: String(result.assignmentId) }
              : assignment
          ),
        }));
      }
    } catch (error) {
      setAssignments((prev) => ({
        ...prev,
        [line.lineId]: (prev[line.lineId] || []).filter(
          (assignment) =>
            String(assignment.assignmentId) !== String(newAssignment.assignmentId)
        ),
      }));

      setInlineAssignmentForms((prev) => ({
        ...prev,
        [String(line.lineId)]: form,
      }));

      alert("Errore di collegamento con Google Sheet: " + String(error));
    } finally {
      setSavingAssignmentLineId("");
    }
  };


  const confirmAssignment = async () => {
    if (!selectedLine || !selectedLotId || !assignQty) return;
    if (selectedOrder && anagraficaBloccaLotti(selectedOrder)) return;

    const qty = Number(assignQty);

    if (!qty || qty <= 0) {
      alert("Inserisci una quantità valida");
      return;
    }

    const selectedLot = lots.find((lot) => String(lot.id) === String(selectedLotId));

    if (!selectedLot) {
      alert("Lotto non trovato");
      return;
    }

    const lotInfo = lotAssignedMap[String(selectedLotId)] || {};
    const available = Number(lotInfo.assignable ?? (lotsAvailableMap[String(selectedLotId)] || 0));

    if (qty > available) {
      const giacenza = Number(lotInfo.total || 0);
      const impegnato = Number(lotInfo.assigned || 0);
      const ok = window.confirm(
        "Disponibili solo " + available + " pz di questo lotto (giacenza " + giacenza +
          ", gia' impegnati " + impegnato + " in altri ordini non ancora evasi).\n\n" +
          "La disponibilita' a 0 non vuol dire giacenza a 0: se la merce e' fisicamente presente " +
          "puoi assegnarne comunque " + qty + ". Gli altri ordini impegnati potrebbero non uscire prima di questo.\n\n" +
          "Assegnare comunque " + qty + " pz?"
      );
      if (!ok) return;
    }

    if (qty > selectedLine.qtyToAssign) {
      alert("La quantità supera il residuo da assegnare");
      return;
    }

    const newAssignment = {
      assignmentId: `ASS-${Date.now()}`,
      lineId: String(selectedLine.lineId),
      lotId: String(selectedLotId),
      lotCode: selectedLot.lot,
      productId: String(selectedLine.productId),
      qty,
    };

    const previousLotId = selectedLotId;
    const previousQty = assignQty;

    setAssignments((prev) => ({
      ...prev,
      [selectedLine.lineId]: [
        ...(prev[selectedLine.lineId] || []),
        { assignmentId: newAssignment.assignmentId, lotId: String(selectedLotId), productId: String(selectedLine.productId), qty },
      ],
    }));

    setAssignDialogOpen(false);
    setSelectedLotId("");
    setAssignQty("");

    try {
      const result = await callSheetsApi({
        action: "assignLot",
        payload: JSON.stringify(newAssignment),
      });

      if (!result || !result.success) {
        setAssignments((prev) => ({
          ...prev,
          [selectedLine.lineId]: (prev[selectedLine.lineId] || []).filter(
            (assignment) =>
              String(assignment.assignmentId) !== String(newAssignment.assignmentId)
          ),
        }));

        setSelectedLotId(previousLotId);
        setAssignQty(previousQty);

        alert(
          "Errore nel salvataggio assegnazione sul foglio: " +
            ((result && result.error) || "errore sconosciuto")
        );
        if (result && result.code === "RIGA_INESISTENTE") {
          await loadDataFromSheets();
        }
      } else if (
        result.assignmentId &&
        String(result.assignmentId) !== String(newAssignment.assignmentId)
      ) {
        // Stesso fix dell'inline: sostituisco l'id locale ottimistico con
        // quello reale ritornato dal DB cosi' la successiva delete funziona.
        setAssignments((prev) => ({
          ...prev,
          [selectedLine.lineId]: (prev[selectedLine.lineId] || []).map((assignment) =>
            String(assignment.assignmentId) === String(newAssignment.assignmentId)
              ? { ...assignment, assignmentId: String(result.assignmentId) }
              : assignment
          ),
        }));
      }
    } catch (error) {
      setAssignments((prev) => ({
        ...prev,
        [selectedLine.lineId]: (prev[selectedLine.lineId] || []).filter(
          (assignment) =>
            String(assignment.assignmentId) !== String(newAssignment.assignmentId)
        ),
      }));

      setSelectedLotId(previousLotId);
      setAssignQty(previousQty);

      alert("Errore di collegamento con Google Sheet: " + String(error));
    }
  };

  const archivedGroups = useMemo(() => {
    const q = orderSearch.trim().toLowerCase();

    const archivedOrders = ordersWithComputed
      .filter((order) => order.archived)
      .filter((order) => {
        if (!q) return true;

        return (
          String(order.id).toLowerCase().includes(q) ||
          String(order.customer).toLowerCase().includes(q) ||
          String(order.notes).toLowerCase().includes(q)
        );
      })
      .sort((a, b) => String(b.dataPrepared || b.date || "").localeCompare(String(a.dataPrepared || a.date || "")));

    const groups = {};

    archivedOrders.forEach((order) => {
      const key = fmtDate(order.dataPrepared || order.date || "Senza data");

      if (!groups[key]) {
        groups[key] = [];
      }

      groups[key].push(order);
    });

    return groups;
  }, [ordersWithComputed, orderSearch]);

  const unarchiveOrder = async (orderId) => {
    if (!orderId) return;

    const conferma = window.confirm("Vuoi disarchiviare questo ordine?");
    if (!conferma) return;

    const previousOrders = orders;

    setOrders((prev) =>
      prev.map((order) =>
        String(order.id) === String(orderId) ? { ...order, archived: false } : order
      )
    );

    try {
      const result = await callSheetsApi({
        action: "unarchiveOrder",
        orderId,
      });

      if (!result || !result.success) {
        setOrders(previousOrders);
        alert(
          "Errore nel disarchiviare l'ordine: " +
            ((result && result.error) || "errore sconosciuto")
        );
        return;
      }

      setPage("ordini");
      setSelectedOrderId(orderId);
    } catch (error) {
      setOrders(previousOrders);
      alert("Errore di collegamento con Google Sheet: " + String(error));
    }
  };

  const openEditOrderDialog = () => {
    if (!selectedOrder) return;

    setEditOrderCustomer(selectedOrder.customer || "");
    setEditOrderClientId(selectedOrder.clientId || "");
    setEditOrderCategory(clientsById[selectedOrder.clientId]?.category || "");
    setEditOrderNotes(selectedOrder.notes || "");
    setEditOrderDialogOpen(true);
  };

  const saveEditedOrder = async () => {
    if (!selectedOrder) return;

    if (!editOrderCustomer.trim()) {
      alert("Inserisci il nome ordine/cliente");
      return;
    }

    setSavingEditedOrder(true);

    const previousOrder = selectedOrder;

    setOrders((prev) =>
      prev.map((order) =>
        String(order.id) === String(selectedOrder.id)
          ? {
              ...order,
              customer: editOrderCustomer.trim(),
              clientId: editOrderClientId || "",
              notes: editOrderNotes.trim(),
            }
          : order
      )
    );

    try {
      const result = await callSheetsApi({
        action: "updateOrder",
        payload: JSON.stringify({
          orderId: selectedOrder.id,
          customer: editOrderCustomer.trim(),
          clienteId: editOrderClientId || "",
          notes: editOrderNotes.trim(),
        }),
      });

      if (!result || !result.success) {
        setOrders((prev) =>
          prev.map((order) =>
            String(order.id) === String(previousOrder.id)
              ? {
                  ...order,
                  customer: previousOrder.customer,
                  notes: previousOrder.notes,
                }
              : order
          )
        );

        alert(
          "Errore nel salvataggio ordine sul foglio: " +
            ((result && result.error) || "errore sconosciuto")
        );
        return;
      }

      setEditOrderDialogOpen(false);
    } catch (error) {
      setOrders((prev) =>
        prev.map((order) =>
          String(order.id) === String(previousOrder.id)
            ? {
                ...order,
                customer: previousOrder.customer,
                notes: previousOrder.notes,
              }
            : order
        )
      );

      alert("Errore di collegamento con Google Sheet: " + String(error));
    } finally {
      setSavingEditedOrder(false);
    }
  };

  const saveOrderColli = async (orderId, rawValue) => {
    if (!orderId) return;

    const trimmed = String(rawValue ?? "").trim();
    // Vuoto = ripristina il valore suggerito (cancella il manuale).
    let colliManual = null;
    let payloadColli = "";

    if (trimmed !== "") {
      const n = Number(trimmed);
      if (!Number.isFinite(n) || n < 0) {
        alert("Inserisci un numero di colli valido.");
        return;
      }
      colliManual = Math.round(n);
      payloadColli = colliManual;
    }

    const previousOrders = orders;
    setSavingColliOrderId(orderId);

    setOrders((prev) =>
      prev.map((order) =>
        String(order.id) === String(orderId) ? { ...order, colliManual } : order
      )
    );

    try {
      const result = await callSheetsApi({
        action: "updateOrder",
        payload: JSON.stringify({ orderId, colli: payloadColli }),
      });

      if (!result || !result.success) {
        setOrders(previousOrders);
        alert(
          "Errore nel salvataggio colli sul foglio: " +
            ((result && result.error) || "errore sconosciuto")
        );
        return;
      }

      // Allinea il draft al valore salvato.
      setColliDrafts((prev) => {
        const next = { ...prev };
        delete next[orderId];
        return next;
      });
    } catch (error) {
      setOrders(previousOrders);
      alert("Errore di collegamento con Google Sheet: " + String(error));
    } finally {
      setSavingColliOrderId("");
    }
  };

  const doLogin = async (event) => {
    if (event && event.preventDefault) event.preventDefault();
    const username = String(loginUsername || "").trim().toLowerCase();
    const password = String(loginPassword || "");
    if (!username || !password) {
      setLoginError("Inserisci nome utente e password.");
      return;
    }
    setLoggingIn(true);
    setLoginError("");
    try {
      const res = await callSheetsApi({
        action: "appLogin",
        payload: JSON.stringify({ username, password }),
      });
      const user = res && res.success ? res.user : null;
      if (!user) {
        setLoginError("Nome utente o password non validi.");
        return;
      }
      const session = { username: user.username, etichetta: user.etichetta || user.username };
      try {
        const raw = JSON.stringify(session);
        if (loginRemember) {
          localStorage.setItem("magazzino_auth", raw);
          sessionStorage.removeItem("magazzino_auth");
        } else {
          sessionStorage.setItem("magazzino_auth", raw);
          localStorage.removeItem("magazzino_auth");
        }
      } catch {}
      setAuthUser(session);
      setLoginPassword("");
    } catch (err) {
      setLoginError("Errore di collegamento. Riprova.");
    } finally {
      setLoggingIn(false);
    }
  };

  const doLogout = () => {
    try {
      localStorage.removeItem("magazzino_auth");
      sessionStorage.removeItem("magazzino_auth");
    } catch {}
    setAuthUser(null);
    setIsAdmin(false);
  };

  // Stato pagamento (flag manuale contabilità, solo Admin). Valori: "ok",
  // "ko", "" (= da verificare). Cliccando lo stato gia' attivo lo si azzera
  // (torna a "da verificare"). Campo predisposto per futura API dal gestionale.
  // Corriere scelto per l'ordine (dal modale Opzioni trasporto). Persiste su
  // ordini.corriere: e' quello che poi finisce su Spedito e sul DDT.
  const setOrderCourier = async (orderId, corriere) => {
    if (!orderId) return;
    const previousOrders = orders;
    setOrders((prev) =>
      prev.map((o) => (String(o.id) === String(orderId) ? { ...o, courier: corriere } : o))
    );
    try {
      const result = await callSheetsApi({
        action: "updateOrder",
        payload: JSON.stringify({ orderId, corriere }),
      });
      if (!result || !result.success) {
        setOrders(previousOrders);
        alert("Errore nel salvataggio del corriere: " + ((result && result.error) || "sconosciuto"));
      }
    } catch (error) {
      setOrders(previousOrders);
      alert("Errore di collegamento: " + String(error));
    }
  };

  // SPEDITO: l'ordine preparato esce fisicamente dalle celle. Salva stato +
  // corriere (quello scelto, altrimenti il consigliato del preventivo).
  const markOrderShipped = async (order) => {
    if (!order) return;
    const corriere =
      order.courier || order.transport?.consigliato?.corriere || "";
    const conferma = window.confirm(
      `Segnare come SPEDITO l'ordine di ${order.customer || order.id}?` +
        (corriere ? `\nCorriere: ${corriere}` : "\nNessun corriere selezionato.")
    );
    if (!conferma) return;
    const previousOrders = orders;
    setOrders((prev) =>
      prev.map((o) =>
        String(o.id) === String(order.id)
          ? { ...o, status: "Spedito", courier: corriere }
          : o
      )
    );
    try {
      const result = await callSheetsApi({
        action: "updateOrder",
        payload: JSON.stringify({ orderId: order.id, status: "Spedito", corriere }),
      });
      if (!result || !result.success) {
        setOrders(previousOrders);
        alert("Errore nel segnare spedito: " + ((result && result.error) || "sconosciuto"));
      } else {
        // Avvisa l'app agenti: l'ordine risulta "Spedito" in "I tuoi ordini".
        aggiornaStatoOrdineApp(order.id, "Spedito").catch(() => {});
      }
    } catch (error) {
      setOrders(previousOrders);
      alert("Errore di collegamento: " + String(error));
    }
  };

  // Riporta un ordine SPEDITO indietro tra i Preparati (errore, modifica).
  // Corriere e DDT restano associati; l'ordine esce dalla sezione Spediti.
  const reopenShippedOrder = async (order) => {
    if (!order) return;
    const conferma = window.confirm(
      `Riportare tra i PREPARATI l'ordine di ${order.customer || order.id}?\n\n` +
        "Esce dalla sezione Spediti e torna tra i preparati, così puoi modificarlo. " +
        "Corriere e DDT restano associati."
    );
    if (!conferma) return;
    const previousOrders = orders;
    setOrders((prev) =>
      prev.map((o) => (String(o.id) === String(order.id) ? { ...o, status: "Preparato" } : o))
    );
    try {
      const result = await callSheetsApi({
        action: "updateOrder",
        payload: JSON.stringify({ orderId: order.id, status: "Preparato" }),
      });
      if (!result || !result.success) {
        setOrders(previousOrders);
        alert("Errore nel riportare in preparati: " + ((result && result.error) || "sconosciuto"));
      } else {
        // Riporta l'agente da "Spedito" a "Ricevuto · in gestione".
        aggiornaStatoOrdineApp(order.id, "Importato").catch(() => {});
        setPage("preparati");
      }
    } catch (error) {
      setOrders(previousOrders);
      alert("Errore di collegamento: " + String(error));
    }
  };

  // DDT: genera (o ristampa) il documento di trasporto in una finestra
  // stampabile. Numerazione progressiva per anno, salvata su ordini.ddt_numero.
  const generaDDT = async (order) => {
    if (!order) return;
    const anag = anagraficaFor(order);
    if (anag.stato === "ko") {
      if (ANAGRAFICA_BLOCCA) {
        alert(
          "Anagrafica incompleta, DDT non generabile.\n\nCampi mancanti:\n- " +
            anag.mancanti.join("\n- ")
        );
        return;
      }
      // Segnala e prosegue: il DDT esce comunque, i campi mancanti saranno
      // vuoti sul documento e vanno completati appena possibile.
      alert(
        "ATTENZIONE: anagrafica incompleta (" + anag.fonte + ").\n\n" +
          "Mancano:\n- " + anag.mancanti.join("\n- ") +
          "\n\nIl DDT viene generato comunque: questi dati resteranno vuoti sul documento."
      );
    }
    let numero = order.ddtNumero;
    if (!numero) {
      const anno = new Date().getFullYear();
      const prefisso = `DDT-${anno}-`;
      // Il numero si calcola sul DB (non sugli ordini in memoria): col
      // caricamento snello lo storico dei DDT non e' caricato, contarlo a video
      // darebbe numeri duplicati.
      const nres = await callSheetsApi({
        action: "prossimoNumeroDDT",
        payload: JSON.stringify({ anno }),
      });
      if (nres && nres.success && nres.numero) {
        numero = nres.numero;
      } else {
        const seq =
          orders.filter((o) => String(o.ddtNumero || "").startsWith(prefisso)).length + 1;
        numero = `${prefisso}${String(seq).padStart(3, "0")}`;
      }
      const result = await callSheetsApi({
        action: "updateOrder",
        payload: JSON.stringify({ orderId: order.id, ddt_numero: numero }),
      });
      if (!result || !result.success) {
        alert("Errore nel salvataggio numero DDT: " + ((result && result.error) || "sconosciuto"));
        return;
      }
      setOrders((prev) =>
        prev.map((o) => (String(o.id) === String(order.id) ? { ...o, ddtNumero: numero } : o))
      );
    }

    // Dati destinatario: snapshot APP / GAMMA arricchito col nostro override.
    const app = effectiveCliente(order).merged || {};
    const cli = clientsById[String(order.clientId)] || {};
    const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
    const dest = {
      ragione: app.ragione_sociale || cli.name || order.customer || "",
      piva: app.partita_iva || cli.piva || "",
      sedeLegale: app.sede_legale || cli.indirizzo || "",
      indirizzo: app.indirizzo_spedizione || app.sede_legale || app.indirizzo || cli.indirizzo || "",
      cap: app.cap || cli.cap || order.cap || "",
      citta: app.citta || cli.citta || "",
      provincia: app.provincia || cli.provincia || "",
      insegna: app.insegna || "",
      telefono: app.telefono || cli.telefono || "",
      email: app.email || cli.email || "",
      pec: app.pec || "",
      codiceUnivoco: app.codice_univoco || "",
      giornoChiusura: app.giorno_chiusura || "",
      orari: app.orari_consegna || app.orario_scarico || "",
      pagamento: app.metodo_pagamento || "",
    };
    const corriere = order.courier || order.transport?.consigliato?.corriere || "";
    const oggi = new Date().toLocaleDateString("it-IT");
    // Mappa lotto: codice + scadenza, per riportarli nella descrizione riga.
    const lotById = Object.fromEntries(
      lots.map((l) => [String(l.id), { code: l.lot || "", expiry: l.expiry || "" }])
    );
    const righeHtml = (order.lines || [])
      .map((line) => {
        // Codice interno REALE del prodotto (dal catalogo), non l'id/riga.
        const prod = products.find((p) => String(p.id) === String(line.productId));
        const codice =
          prod?.code ||
          line.productCode ||
          (String(line.productId).startsWith("FUORI_MAGAZZINO") ? "" : line.productId) ||
          "";
        // Lotto + scadenza assegnati, riportati nella descrizione.
        const lottiParts = (assignments[line.lineId] || [])
          .map((a) => {
            const li = lotById[String(a.lotId)];
            if (!li || !li.code) {
              return String(a.lotId).startsWith("LOT-") ? "" : String(a.lotId || "");
            }
            return li.expiry ? `${li.code} (scad. ${fmtDate(li.expiry)})` : li.code;
          })
          .filter(Boolean);
        const lottoStr = lottiParts.join(" · ");
        const descr = esc(line.productName || "") + (lottoStr ? ` — Lotto: ${esc(lottoStr)}` : "");
        return `<tr><td>${esc(codice)}</td><td>${descr}</td><td style="text-align:right">${line.qtyOrdered}</td></tr>`;
      })
      .join("");
    const anagRows = [
      dest.insegna ? `<b>Insegna:</b> ${esc(dest.insegna)}` : "",
      dest.pagamento ? `<b>Pagamento:</b> ${esc(dest.pagamento)}` : "",
      dest.codiceUnivoco ? `<b>Codice SdI:</b> ${esc(dest.codiceUnivoco)}` : "",
      dest.pec ? `<b>PEC:</b> ${esc(dest.pec)}` : "",
      dest.email ? `<b>Email:</b> ${esc(dest.email)}` : "",
      dest.orari ? `<b>Orario scarico:</b> ${esc(dest.orari)}` : "",
      dest.giornoChiusura ? `<b>Giorno chiusura:</b> ${esc(dest.giornoChiusura)}` : "",
    ].filter(Boolean).join(" &nbsp;·&nbsp; ");
    const sedeDiversa =
      dest.sedeLegale && dest.sedeLegale.trim() && dest.sedeLegale.trim() !== dest.indirizzo.trim();
    const html = `<!doctype html><html lang="it"><head><meta charset="utf-8"><title>${numero}</title>
<style>body{font-family:Arial,sans-serif;margin:32px;color:#111}h1{font-size:20px;margin:0}
.top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #111;padding-bottom:12px;margin-bottom:16px}
.box{border:1px solid #999;border-radius:6px;padding:10px 12px;margin-bottom:12px;font-size:13px;line-height:1.5}
table{width:100%;border-collapse:collapse;margin-top:8px}th,td{border:1px solid #999;padding:6px 8px;font-size:13px;text-align:left}
th{background:#eee}.tot{display:flex;gap:24px;margin-top:12px;font-weight:bold}
.firma{display:flex;gap:40px;margin-top:40px}.firma div{flex:1;border-top:1px solid #111;padding-top:6px;font-size:12px}
@media print{.noprint{display:none}}</style></head><body>
<div class="top"><div><h1>GLUTEN FREE EXPERIENCE SRL</h1><div style="font-size:12px">Documento di Trasporto (D.d.T.) — D.P.R. 472/96</div></div>
<div style="text-align:right"><div style="font-size:18px;font-weight:bold">${numero}</div><div>Data: ${oggi}</div></div></div>
<div class="box"><b>Destinatario</b><br>${esc(dest.ragione)}<br>${esc(dest.indirizzo)}<br>${esc(dest.cap)} ${esc(dest.citta)}${dest.provincia ? " (" + esc(dest.provincia) + ")" : ""}${sedeDiversa ? "<br><span style='color:#555'>Sede legale: " + esc(dest.sedeLegale) + "</span>" : ""}<br>${dest.piva ? "P.IVA: " + esc(dest.piva) : ""}${dest.telefono ? " · Tel: " + esc(dest.telefono) : ""}${anagRows ? "<br>" + anagRows : ""}</div>
<div class="box"><b>Trasporto a mezzo:</b> ${esc(corriere) || "vettore"} · <b>Causale:</b> Vendita · <b>Porto:</b> franco · <b>Ordine:</b> ${esc(order.id)}${dest.pagamento ? " · <b>Pagamento:</b> " + esc(dest.pagamento) : ""}</div>
<table><thead><tr><th>Codice</th><th>Descrizione (lotto e scadenza)</th><th style="text-align:right">Qta</th></tr></thead><tbody>${righeHtml}</tbody></table>
<div class="tot"><span>Colli: ${order.colli ?? ""}</span><span>Peso lordo: ${fmtKg(order.pesoTotale)} kg</span></div>
<div class="firma"><div>Firma conducente</div><div>Firma destinatario</div></div>
<button class="noprint" onclick="window.print()" style="margin-top:24px;padding:10px 18px;font-size:14px">Stampa</button>
</body></html>`;
    const w = window.open("", "_blank");
    if (!w) {
      alert("Il browser ha bloccato la finestra del DDT: consenti i popup e riprova.");
      return;
    }
    w.document.write(html);
    w.document.close();
  };

  const setOrderPayment = async (orderId, status) => {
    if (!isAdmin || !orderId) return;

    const current = orders.find((o) => String(o.id) === String(orderId))?.paymentStatus || "";
    const next = current === status ? "" : status;

    const previousOrders = orders;
    setSavingPaymentOrderId(String(orderId));
    setOrders((prev) =>
      prev.map((order) =>
        String(order.id) === String(orderId) ? { ...order, paymentStatus: next } : order
      )
    );

    try {
      const result = await callSheetsApi({
        action: "updateOrder",
        payload: JSON.stringify({ orderId, paymentStatus: next }),
      });
      if (!result || !result.success) {
        setOrders(previousOrders);
        alert(
          "Errore nel salvataggio dello stato pagamento: " +
            ((result && result.error) || "errore sconosciuto")
        );
      }
    } catch (error) {
      setOrders(previousOrders);
      alert("Errore di collegamento con Google Sheet: " + String(error));
    } finally {
      setSavingPaymentOrderId("");
    }
  };

  const persistOrderViewed = async (orderId) => {
    if (!orderId) return;

    // Aggiorna subito lo stato locale: l'ordine non e' piu' "nuovo".
    setOrders((prev) =>
      prev.map((order) =>
        String(order.id) === String(orderId)
          ? { ...order, workStatus: "In lavorazione" }
          : order
      )
    );

    // Salva sul foglio. Se fallisce non deve mai far crollare la pagina.
    try {
      await callSheetsApi({
        action: "markOrderViewed",
        orderId,
      });
    } catch (error) {
      console.warn("Errore markOrderViewed", orderId, error);
    }
  };

  const openOrderFromList = async (order) => {
    if (!order) return;

    setSelectedOrderId(order.id);
    setSelectedLineId(order.lines?.[0]?.lineId || "");

    if (String(order.workStatus || "").trim().toLowerCase() === "nuovo") {
      persistOrderViewed(order.id);
    }
  };

  const markVisibleOrdersAsViewed = async () => {
    const visibleNewOrders = filteredOrders.filter(
      (order) => String(order.workStatus || "").trim().toLowerCase() === "nuovo"
    );

    if (visibleNewOrders.length === 0) {
      alert("Non ci sono ordini nuovi da segnare come letti.");
      return;
    }

    const conferma = window.confirm(
      `Vuoi segnare come letti ${visibleNewOrders.length} ordini visibili?`
    );

    if (!conferma) return;

    setOrders((prev) =>
      prev.map((order) =>
        visibleNewOrders.some((visible) => String(visible.id) === String(order.id))
          ? { ...order, workStatus: "In lavorazione" }
          : order
      )
    );

    for (const order of visibleNewOrders) {
      try {
        await callSheetsApi({
          action: "markOrderViewed",
          orderId: order.id,
        });
      } catch (error) {
        console.warn("Errore markOrderViewed bulk", order.id, error);
      }
    }
  };

  const archiveAllPreparedOrders = async () => {
    const conferma = window.confirm(
      "Vuoi archiviare tutti gli ordini preparati non ancora archiviati?"
    );

    if (!conferma) return;

    try {
      const result = await callSheetsApi({
        action: "archiveAllPreparedOrders",
      });

      if (!result || !result.success) {
        alert(
          "Errore nell'archiviazione ordini preparati: " +
            ((result && result.error) || "errore sconosciuto")
        );
        return;
      }

      setOrders((prev) =>
        prev.map((order) =>
          String(order.status || "").trim().toLowerCase() === "preparato"
            ? { ...order, archived: true }
            : order
        )
      );

      setPage("archivio");
    } catch (error) {
      alert("Errore di collegamento con Google Sheet: " + String(error));
    }
  };

  const archivePreparedOrder = async (orderId) => {
    if (!orderId) return;

    const conferma = window.confirm("Vuoi archiviare questo ordine preparato?");
    if (!conferma) return;

    try {
      const result = await callSheetsApi({
        action: "archiveOrder",
        orderId,
      });

      if (!result || !result.success) {
        alert(
          "Errore nell'archiviazione ordine: " +
            ((result && result.error) || "errore sconosciuto")
        );
        return;
      }

      setOrders((prev) =>
        prev.map((order) =>
          String(order.id) === String(orderId) ? { ...order, archived: true } : order
        )
      );
    } catch (error) {
      alert("Errore di collegamento con Google Sheet: " + String(error));
    }
  };

  const togglePreparedDetails = (orderId) => {
    setExpandedPreparedOrders((prev) => ({
      ...prev,
      [String(orderId)]: !prev[String(orderId)],
    }));
  };

  // Chiave con cui riconosciamo "lo stesso cliente": il codice anagrafica se
  // c'e', altrimenti la ragione sociale normalizzata (conservativo: mai per
  // email o telefono).
  const chiaveCliente = (order) =>
    String(order?.clientId || "").startsWith("CLI-")
      ? String(order.clientId)
      : "nome:" + String(order?.customer || "").trim().toLowerCase();

  // Altri ordini APERTI dello stesso cliente in uscita lo stesso giorno: sono i
  // candidati all'unione (due ordini = due documenti e due spedizioni).
  const ordiniUnibiliCon = (order) => {
    if (!order) return [];
    const st = (o) => String(o.status || "").trim().toLowerCase();
    const unibile = (o) => !o.archived && !o.unitoIn && ["da preparare", "parziale", "fermo", ""].includes(st(o));
    if (!unibile(order)) return [];
    const k = chiaveCliente(order);
    const giorno = String(order.date || "").slice(0, 10);
    return orders.filter(
      (o) =>
        String(o.id) !== String(order.id) &&
        unibile(o) &&
        chiaveCliente(o) === k &&
        String(o.date || "").slice(0, 10) === giorno
    );
  };

  // Unisce l'ordine `src` dentro `dst`: le righe passano a dst, src viene
  // archiviato e marcato "unito". Reversibile con separaOrdine.
  const unisciOrdine = async (src, dst) => {
    if (!src || !dst) return;
    const conferma = window.confirm(
      `Unire l'ordine di ${src.customer || src.id} in un unico ordine?\n\n` +
        `Le righe di ${src.id} passano a ${dst.id}: un solo documento e una sola spedizione.\n` +
        `Si può separare in qualsiasi momento.`
    );
    if (!conferma) return;
    try {
      const res = await callSheetsApi({
        action: "unisciOrdini",
        payload: JSON.stringify({ sorgente: src.id, destinazione: dst.id }),
      });
      if (!res || !res.success) {
        alert("Unione non eseguita: " + ((res && res.error) || "errore sconosciuto"));
        return;
      }
      await loadDataFromSheets();
      setSelectedOrderId(String(dst.id));
      alert(`Ordini uniti: ${res.righeSpostate} righe spostate in ${dst.id}.`);
    } catch (e) {
      alert("Errore di collegamento nell'unione: " + String(e));
    }
  };

  // Annulla l'unione: le righe tornano all'ordine di origine.
  const separaOrdine = async (order) => {
    if (!order?.unitoIn) return;
    const conferma = window.confirm(
      `Separare di nuovo l'ordine ${order.id} da ${order.unitoIn}?\n\n` +
        "Le sue righe tornano su questo ordine, che torna tra quelli da preparare."
    );
    if (!conferma) return;
    try {
      const res = await callSheetsApi({
        action: "separaOrdine",
        payload: JSON.stringify({ sorgente: order.id }),
      });
      if (!res || !res.success) {
        alert("Separazione non eseguita: " + ((res && res.error) || "errore sconosciuto"));
        return;
      }
      await loadDataFromSheets();
      setSelectedOrderId(String(order.id));
    } catch (e) {
      alert("Errore di collegamento nella separazione: " + String(e));
    }
  };

  // Click su "Fermo": chiede PRIMA il motivo (modale coi motivi rapidi), cosi'
  // produzione e logistica sanno sempre perche' l'ordine e' bloccato.
  const markOrderStopped = () => {
    if (!selectedOrder) return;
    if (String(selectedOrder.status || "").trim().toLowerCase() === "preparato") {
      alert("Non puoi mettere in fermo un ordine già preparato.");
      return;
    }
    setFermoMotivo("");
    setFermoDialog({ open: true, orderId: String(selectedOrder.id), mode: "nuovo" });
  };

  // Apre il modale per scrivere/correggere il motivo di un ordine gia' fermo.
  const openEditMotivoFermo = (order) => {
    if (!order) return;
    setFermoMotivo(String(order.motivoFermo || ""));
    setFermoDialog({ open: true, orderId: String(order.id), mode: "modifica" });
  };

  const closeFermoDialog = () => setFermoDialog({ open: false, orderId: "", mode: "nuovo" });

  // Conferma: mette in fermo col motivo, oppure aggiorna solo il motivo.
  const confirmFermo = async () => {
    const orderId = fermoDialog.orderId;
    if (!orderId || savingFermo) return;
    const motivo = String(fermoMotivo || "").trim();
    if (!motivo) {
      alert("Scrivi (o scegli) il motivo del fermo: serve a produzione e logistica.");
      return;
    }
    setSavingFermo(true);
    try {
      if (fermoDialog.mode === "modifica") {
        const res = await callSheetsApi({
          action: "setMotivoFermo",
          payload: JSON.stringify({ orderId, motivo }),
        });
        if (!res || !res.success) {
          alert("Motivo non salvato: " + ((res && res.error) || "errore sconosciuto"));
          return;
        }
        setOrders((prev) =>
          prev.map((o) => (String(o.id) === String(orderId) ? { ...o, motivoFermo: motivo } : o))
        );
        closeFermoDialog();
        return;
      }

      const result = await callSheetsApi({
        action: "markOrderStopped",
        payload: JSON.stringify({ orderId, motivo }),
      });
      if (!result || !result.success) {
        alert(
          "Errore nello spostamento in Ordini fermi: " +
            ((result && result.error) || "errore sconosciuto")
        );
        return;
      }
      if (result.warning) alert(result.warning);

      setOrders((prev) =>
        prev.map((order) =>
          String(order.id) === String(orderId)
            ? { ...order, status: "Fermo", dataPrepared: "", archived: false, motivoFermo: motivo }
            : order
        )
      );

      const nextOrder = activeOrders.find((order) => String(order.id) !== String(orderId));
      setSelectedOrderId(nextOrder?.id || "");
      setSelectedLineId(nextOrder?.lines?.[0]?.lineId || "");
      closeFermoDialog();
      setPage("fermi");
    } catch (error) {
      alert("Errore di collegamento: " + String(error));
    } finally {
      setSavingFermo(false);
    }
  };

  const restoreStoppedOrder = async (orderId) => {
    if (!orderId) return;

    try {
      const result = await callSheetsApi({
        action: "reopenOrder",
        orderId,
      });

      if (!result || !result.success) {
        alert(
          "Errore nel riportare l'ordine da preparare: " +
            ((result && result.error) || "errore sconosciuto")
        );
        return;
      }

      setOrders((prev) =>
        prev.map((order) =>
          String(order.id) === String(orderId)
            ? { ...order, status: "Da preparare", workStatus: "In lavorazione", dataPrepared: "", archived: false }
            : order
        )
      );

      // Se l'ordine era preparato, l'adapter ha rincrementato i lotti.
      if (result.stockMovements && result.stockMovements.length) {
        setLots((prev) => applyStockMovementsToLots(prev, result.stockMovements));
      }

      setSelectedOrderId(orderId);
      setPage("ordini");
    } catch (error) {
      alert("Errore di collegamento con Google Sheet: " + String(error));
    }
  };

  const reopenPreparedOrderForEditing = async (orderId) => {
    if (!orderId) return;

    const conferma = window.confirm(
      "Vuoi modificare questo ordine preparato? Verrà riportato in Da preparare e le quantità già scaricate verranno ripristinate."
    );

    if (!conferma) return;

    try {
      const result = await callSheetsApi({
        action: "reopenOrder",
        orderId,
      });

      if (!result || !result.success) {
        alert(
          "Errore nel riaprire l'ordine preparato: " +
            ((result && result.error) || "errore sconosciuto")
        );
        return;
      }

      setOrders((prev) =>
        prev.map((order) =>
          String(order.id) === String(orderId)
            ? {
                ...order,
                status: "Da preparare",
                dataPrepared: "",
                archived: false,
              }
            : order
        )
      );

      if (result.stockMovements && result.stockMovements.length) {
        setLots((prev) => applyStockMovementsToLots(prev, result.stockMovements || []));
      }

      setSelectedOrderId(orderId);
      setPage("ordini");
    } catch (error) {
      alert("Errore di collegamento con Google Sheet: " + String(error));
    }
  };

  const markOrderPrepared = async () => {
    if (!selectedOrder) return;

    if (selectedOrder.totalToAssign > 0) {
      alert("Prima assegna tutti i lotti dell'ordine.");
      return;
    }

    // Anagrafica incompleta: SEGNALA e VA AVANTI (Luca 2026-07-28). Questo e' il
    // momento giusto per l'avviso: l'ordine sta uscendo, ma non lo fermiamo.
    const anagPrep = anagraficaFor(selectedOrder);
    if (anagPrep.stato === "ko") {
      alert(
        "ATTENZIONE: anagrafica incompleta (" + anagPrep.fonte + ").\n\n" +
          "Mancano:\n- " + anagPrep.mancanti.join("\n- ") +
          "\n\nL'ordine viene segnato PRONTO comunque. Completa l'anagrafica dal tasto Anagrafica appena puoi."
      );
    }

    setSavingPreparedOrderId(String(selectedOrder.id));

    try {
      const result = await callSheetsApi({
        action: "markOrderPrepared",
        orderId: selectedOrder.id,
      });

      if (!result || !result.success) {
        alert(
          "Errore nel salvataggio stato ordine sul foglio: " +
            ((result && result.error) || "errore sconosciuto")
        );
        return;
      }

      setOrders((prev) =>
        prev.map((order) =>
          String(order.id) === String(selectedOrder.id)
            ? {
                ...order,
                status: "Preparato",
                dataPrepared: new Date().toISOString(),
                archived: false,
              }
            : order
        )
      );

      setLots((prev) => applyStockMovementsToLots(prev, result.stockMovements || []));

      // Dopo il "Preparato" si atterra sulla pagina Preparati: e' li' che
      // vivono i bottoni Spedito e Genera DDT per quest'ordine (flusso Luca:
      // preparato -> spedito -> documento, tutto nello stesso posto).
      setPage("preparati");

      // L'ordine viene evaso anche se per qualche lotto la giacenza fisica era
      // inferiore (es. merce gia' uscita ma non scaricata). Avvisiamo l'operatore
      // di quali lotti sono andati sotto zero cosi' puo' sistemare la giacenza.
      const warnings = Array.isArray(result.stockWarnings) ? result.stockWarnings : [];
      if (warnings.length > 0) {
        const righe = warnings
          .map((w) => {
            const prod = products.find((p) => String(p.id) === String(w.productId));
            const nome = prod ? prod.name : String(w.productId);
            const lotto = w.lot ? " (lotto " + w.lot + ")" : "";
            return "- " + nome + lotto + ": mancavano " + w.shortfall + " pz";
          })
          .join("\n");
        alert(
          "Ordine evaso. Attenzione: alcuni lotti non avevano giacenza sufficiente e sono stati " +
            "portati a 0 (scarico forzato):\n\n" + righe + "\n\n" +
            "Controlla la giacenza di questi lotti dalla pagina Magazzino e correggila se necessario."
        );
      }
    } catch (error) {
      alert("Errore di collegamento con Google Sheet: " + String(error));
    } finally {
      setSavingPreparedOrderId("");
    }
  };

  const startNewClient = () => {
    setEditingClientId("");
    setClientForm({ ragioneSociale: "", categoria: "", codiceClienteTs: "", piva: "", codiceFiscale: "", note: "" });
  };

  const startEditClient = (c) => {
    setEditingClientId(c.id);
    setClientForm({
      ragioneSociale: c.name || "",
      categoria: c.category || "",
      codiceClienteTs: c.codeTs || "",
      piva: c.piva || "",
      codiceFiscale: c.codiceFiscale || "",
      note: c.notes || "",
    });
  };

  const saveClient = async () => {
    const ragione = String(clientForm.ragioneSociale || "").trim();
    if (!ragione) {
      alert("Inserisci la ragione sociale del cliente");
      return;
    }
    setSavingClient(true);
    try {
      const isEdit = !!editingClientId;
      const result = await callSheetsApi({
        action: isEdit ? "updateCliente" : "createCliente",
        payload: JSON.stringify({
          id: editingClientId || undefined,
          ragioneSociale: ragione,
          categoria: clientForm.categoria,
          codiceClienteTs: clientForm.codiceClienteTs,
          piva: clientForm.piva,
          codiceFiscale: clientForm.codiceFiscale,
          note: clientForm.note,
        }),
      });
      if (!result || !result.success) {
        alert("Errore nel salvataggio cliente: " + ((result && result.error) || "sconosciuto"));
        return;
      }
      const saved = result.cliente || {};
      const savedId = String(saved.id_cliente || editingClientId || "");
      const normalized = {
        id: savedId,
        name: saved.ragione_sociale ?? ragione,
        category: saved.categoria ?? clientForm.categoria ?? "",
        categoryTs: saved.categoria_ts ?? "",
        codeTs: saved.codice_cliente_ts ?? clientForm.codiceClienteTs ?? "",
        piva: saved.piva ?? clientForm.piva ?? "",
        codiceFiscale: saved.codice_fiscale ?? clientForm.codiceFiscale ?? "",
        codiceDestinatarioTs: saved.codice_destinatario_ts ?? "",
        source: saved.fonte ?? "manuale",
        active: saved.attivo === false ? false : true,
        notes: saved.note ?? clientForm.note ?? "",
      };
      setClients((prev) => {
        const exists = prev.some((c) => c.id === normalized.id);
        return exists
          ? prev.map((c) => (c.id === normalized.id ? normalized : c))
          : [...prev, normalized];
      });
      startNewClient();
    } catch (error) {
      alert("Errore di collegamento: " + String(error));
    } finally {
      setSavingClient(false);
    }
  };

  const deactivateClient = async (c) => {
    if (!c || !c.id) return;
    if (!window.confirm(`Disattivare "${c.name}"? Sparisce dai menu ma resta sugli ordini storici.`)) return;
    try {
      const result = await callSheetsApi({
        action: "deleteCliente",
        payload: JSON.stringify({ id: c.id }),
      });
      if (!result || !result.success) {
        alert("Errore: " + ((result && result.error) || "sconosciuto"));
        return;
      }
      setClients((prev) => prev.map((x) => (x.id === c.id ? { ...x, active: false } : x)));
    } catch (error) {
      alert("Errore di collegamento: " + String(error));
    }
  };

  const addEmptyOrderLine = () => {
    setNewOrderLines((prev) => [...prev, { productId: "", productSearch: "", customName: "", isOutsideStock: false, qtyOrdered: "", lotId: "", prezzoUnitario: "", scontoPct: "", ivaPct: "4", naturaIva: "" }]);
  };

  const updateNewOrderLine = (index, field, value) => {
    setNewOrderLines((prev) =>
      prev.map((line, i) => (i === index ? { ...line, [field]: value } : line))
    );
  };

  const removeNewOrderLine = (index) => {
    setNewOrderLines((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)));
  };

  const createOrder = async () => {
    if (!newOrderClientId && !newOrderManual) {
      alert("Seleziona il cliente dall'anagrafica. Se proprio non c'e', attiva \"scrivi a mano\".");
      return;
    }
    if (!newOrderCustomer.trim()) {
      alert(newOrderManual ? "Scrivi il nome del cliente" : "Seleziona il cliente dall'anagrafica");
      return;
    }

    const validLines = newOrderLines
      .filter((line) => {
        const hasQty = Number(line.qtyOrdered) > 0;
        const hasProduct = line.isOutsideStock
          ? String(line.customName || "").trim()
          : line.productId;

        return hasQty && hasProduct;
      })
      .map((line, index) => {
        // Prezzo e sconto suggeriti dallo storico del cliente: viaggiano con la
        // riga cosi' l'ordine nasce gia' valorizzato. Restano modificabili.
        const prezzo = String(line.prezzoUnitario ?? "").trim();
        const valorizzazione =
          prezzo === ""
            ? {}
            : {
                prezzoUnitario: Number(prezzo),
                scontoPct: Number(String(line.scontoPct ?? "").trim() || 0),
                ivaPct: Number(String(line.ivaPct ?? "").trim() || 4),
                naturaIva: String(line.naturaIva ?? ""),
                prezzoOrigine: "storico-cliente",
              };

        if (line.isOutsideStock) {
          return {
            lineId: `RIGA-${Date.now()}-${index}`,
            productId: `${OUTSIDE_STOCK_PRODUCT_ID}-${Date.now()}-${index}`,
            productCode: OUTSIDE_STOCK_PRODUCT_ID,
            productName: String(line.customName || "").trim(),
            isOutsideStock: true,
            rowOrder: index + 1,
            qtyOrdered: Number(line.qtyOrdered),
            ...valorizzazione,
          };
        }

        const product = products.find((p) => String(p.id) === String(line.productId));

        return {
          lineId: `RIGA-${Date.now()}-${index}`,
          productId: String(line.productId),
          productCode: product?.code || "",
          productName: product?.name || "",
          isOutsideStock: false,
          rowOrder: index + 1,
          qtyOrdered: Number(line.qtyOrdered),
          preassignedLotId: line.lotId ? String(line.lotId) : "",
          ...valorizzazione,
        };
      });

    if (validLines.length === 0) {
      alert("Inserisci almeno una riga valida con articolo e quantità");
      return;
    }

    const newOrder = {
      id: `ORD-${Date.now()}`,
      customer: newOrderCustomer.trim(),
      clientId: newOrderClientId || "",
      notes: newOrderNotes.trim(),
      status: "Da preparare",
      workStatus: "Nuovo",
      date: new Date().toISOString().slice(0, 10),
      // CAP di destinazione congelato: dall'anagrafica del cliente scelto,
      // oppure quello digitato a mano (ordine a testo libero). Per il costo
      // trasporto.
      cap: String(newOrderCap || clientsById[newOrderClientId]?.cap || "").trim(),
      lines: validLines,
    };

    try {
      const result = await callSheetsApi({
        action: "createOrder",
        payload: JSON.stringify({
          id: newOrder.id,
          customer: newOrder.customer,
          clienteId: newOrder.clientId,
          notes: newOrder.notes,
          status: newOrder.status,
          workStatus: newOrder.workStatus,
          date: newOrder.date,
          cap: newOrder.cap,
          lines: newOrder.lines,
        }),
      });

      if (!result || !result.success) {
        alert(
          "Errore nel salvataggio ordine sul foglio: " +
            ((result && result.error) || "errore sconosciuto")
        );
        return;
      }

      setOrders((prev) => [newOrder, ...prev]);
      setSelectedOrderId(newOrder.id);
      setSelectedLineId(newOrder.lines[0]?.lineId || "");
      setNewOrderCustomer("");
      setNewOrderClientId("");
      setNewOrderCap("");
      setNewOrderCategory("");
      setNewOrderNotes("");
      setNewOrderLines([{ productId: "", productSearch: "", customName: "", isOutsideStock: false, qtyOrdered: "", lotId: "", prezzoUnitario: "", scontoPct: "", ivaPct: "4", naturaIva: "" }]);
      setOrderDialogOpen(false);
      setPage("ordini");

      // Auto-assegnazione lotti pre-selezionati al volo. Se la disp del lotto
      // non basta, assegno il minimo possibile e lascio il resto da assegnare
      // manualmente; segnalo a fine ciclo con un alert riepilogativo.
      const preassignedTasks = validLines.filter((l) => l.preassignedLotId && Number(l.qtyOrdered) > 0);
      if (preassignedTasks.length > 0) {
        const errorsRecap = [];
        for (const task of preassignedTasks) {
          try {
            const r = await callSheetsApi({
              action: "assignLot",
              payload: JSON.stringify({
                lineId: task.lineId,
                lotId: task.preassignedLotId,
                qty: task.qtyOrdered,
                operatore: "creazione ordine",
              }),
            });
            if (!r?.success) {
              errorsRecap.push(`- ${task.productName}: ${r?.error || "assegnazione fallita"}`);
            }
          } catch (err) {
            errorsRecap.push(`- ${task.productName}: ${String(err)}`);
          }
        }
        // Refresh dati: il piu' affidabile dopo assegnazioni multiple e' ricaricare.
        await loadDataFromSheets();
        if (errorsRecap.length > 0) {
          alert(
            "Ordine creato. Alcuni lotti non sono stati assegnati automaticamente:\n\n" +
              errorsRecap.join("\n") +
              "\n\nPuoi assegnarli a mano dalla pagina Ordini."
          );
        }
      }
    } catch (error) {
      alert("Errore di collegamento con Google Sheet: " + String(error));
    }
  };

  const deleteOrder = async (orderId) => {
    if (!orderId) return;

    const orderToDelete = orders.find((order) => String(order.id) === String(orderId));
    const wasPreparato =
      String(orderToDelete?.status || "").trim().toLowerCase() === "preparato";

    // Conferma esplicita: messaggi diversi a seconda dello stato.
    const conferma = window.confirm(
      wasPreparato
        ? "Questo ordine era PREPARATO. Eliminandolo, le quantità scaricate vengono RIMESSE in magazzino sui lotti coinvolti. Procedo?"
        : "Vuoi eliminare davvero questo ordine? Eventuali assegnazioni vengono rimosse, lo stock fisico non e' stato ancora scalato."
    );
    if (!conferma) return;

    try {
      const result = await callSheetsApi({
        action: "deleteOrder",
        orderId,
      });

      if (!result || !result.success) {
        alert(
          "Errore nell'eliminazione ordine: " +
            ((result && result.error) || "errore sconosciuto")
        );
        return;
      }

      // Se l'ordine era preparato, l'adapter ha ripristinato lo stock dei
      // lotti. Aggiorno lo state locale dei lotti per riflettere subito le
      // nuove quantita_caricata (no flicker / nessuna attesa del reload).
      if (Array.isArray(result.stockMovements) && result.stockMovements.length > 0) {
        setLots((prev) => applyStockMovementsToLots(prev, result.stockMovements));
      }

      setAssignments((prev) => {
        const next = { ...prev };

        if (orderToDelete?.lines) {
          orderToDelete.lines.forEach((line) => {
            delete next[line.lineId];
          });
        }

        return next;
      });

      const remainingOrders = orders.filter((order) => String(order.id) !== String(orderId));

      setOrders(remainingOrders);

      const nextOrder = remainingOrders[0];

      setSelectedOrderId(nextOrder?.id ?? "");
      setSelectedLineId(nextOrder?.lines?.[0]?.lineId ?? "");


    } catch (error) {
      alert("Errore di collegamento con Google Sheet: " + String(error));
    }
  };


  const createLot = async () => {
    if (savingNewLot) return;

    if (!newLotProductId) {
      alert("Seleziona il prodotto");
      return;
    }

    const selectedProduct = products.find(
      (product) => String(product.id) === String(newLotProductId)
    );
    const managesLots = productManagesLots(selectedProduct);

    if (managesLots && !newLotCode.trim()) {
      alert("Inserisci il codice lotto");
      return;
    }

    if (managesLots && !newLotExpiry) {
      alert("Inserisci la scadenza");
      return;
    }

    if (!Number(newLotQty) || Number(newLotQty) <= 0) {
      alert("Inserisci una quantità valida");
      return;
    }

    const newLot = {
      id: `LOT-${Date.now()}`,
      productId: String(newLotProductId),
      lot: managesLots ? newLotCode.trim() : "DISPONIBILITA",
      expiry: managesLots ? newLotExpiry : "",
      loadedQty: Number(newLotQty),
    };

    setSavingNewLot(true);

    try {
      const result = await callSheetsApi({
        action: "createLot",
        payload: JSON.stringify(newLot),
      });

      if (!result || !result.success) {
        alert(
          "Errore nel salvataggio disponibilità sul foglio: " +
            ((result && result.error) || "errore sconosciuto")
        );
        return;
      }

      const returnedLotId = String(result.lotId || newLot.id);
      const returnedLotCode = String(result.lotCode || newLot.lot);
      const returnedQty =
        result.newQty !== undefined && result.newQty !== null && result.newQty !== ""
          ? Number(result.newQty)
          : Number(newLot.loadedQty);

      setLots((prev) => {
        const exists = prev.some(
          (lot) =>
            String(lot.id) === returnedLotId ||
            (String(lot.productId) === String(newLot.productId) &&
              String(lot.lot) === returnedLotCode)
        );

        if (exists) {
          return prev.map((lot) =>
            String(lot.id) === returnedLotId ||
            (String(lot.productId) === String(newLot.productId) &&
              String(lot.lot) === returnedLotCode)
              ? {
                  ...lot,
                  id: returnedLotId || lot.id,
                  lot: returnedLotCode || lot.lot,
                  expiry: newLot.expiry || lot.expiry,
                  loadedQty: returnedQty,
                }
              : lot
          );
        }

        return [
          {
            ...newLot,
            id: returnedLotId,
            lot: returnedLotCode,
            loadedQty: returnedQty,
          },
          ...prev,
        ];
      });

      setNewLotProductId("");
      setNewLotProductSearch("");
      setNewLotCode("");
      setNewLotExpiry("");
      setNewLotQty("");
      setLotDialogOpen(false);
      setPage("prodotti");
    } catch (error) {
      alert("Errore di collegamento con Google Sheet: " + String(error));
    } finally {
      setSavingNewLot(false);
    }
  };

  // Carico di produzione giornaliera: crea il lotto (giacenza) E registra la
  // produzione lorda in carichi_produzione (per l'app margine). Aggiunge alla
  // lista "caricati oggi" e pulisce il form per il prossimo articolo.
  // Foto bolla: legge il file scelto/scattato e ne tiene la versione ridotta.
  const onBollaFile = async (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = ""; // consente di riscattare/riscegliere lo stesso file
    if (!file) return;
    try {
      setBollaPreview(await riduciImmagine(file));
    } catch (err) {
      alert("Non sono riuscito a leggere la foto: " + String(err));
    }
  };

  // Ordini fornitore in arrivo (da Acquisti) per abbinare la foto della bolla.
  const loadOrdiniArrivo = async () => {
    const res = await callSheetsApi({ action: "getOrdiniAcquistiInArrivo" });
    if (res && res.success) setOrdiniArrivo(res.ordini || []);
  };

  // Quando si apre la pagina Foto bolle, carica gli ordini fornitore in arrivo.
  useEffect(() => {
    if (page === "foto-bolle") loadOrdiniArrivo();
  }, [page]);

  // Invia la foto della bolla alla coda dell'app acquisti (acq_ricevimenti_foto).
  const inviaBolla = async () => {
    if (savingBolla) return;
    if (!bollaPreview) {
      alert("Scatta o scegli prima la foto della bolla.");
      return;
    }
    setSavingBolla(true);
    try {
      const ordineSel = ordiniArrivo.find((o) => String(o.id) === String(fotoOrdineId));
      const res = await callSheetsApi({
        action: "salvaFotoBolla",
        payload: JSON.stringify({
          foto: bollaPreview,
          caption: bollaCaption.trim(),
          operatore: authUser?.etichetta || authUser?.username || "magazzino",
          ordineId: ordineSel ? ordineSel.id : "",
          fornitoreId: ordineSel ? ordineSel.fornitoreId : "",
        }),
      });
      if (res && res.success) {
        setBolleInviate((prev) => [
          { id: res.id, caption: bollaCaption.trim(), thumb: bollaPreview, ordine: ordineSel ? ordineSel.id : "" },
          ...prev,
        ]);
        setBollaPreview("");
        setBollaCaption("");
        setFotoOrdineId("");
      } else {
        alert("Foto non inviata: " + ((res && res.error) || "errore sconosciuto"));
      }
    } catch (err) {
      alert("Errore di collegamento nell'invio della foto.");
    } finally {
      setSavingBolla(false);
    }
  };

  // ---- Chat interna ----
  // Suono di notifica (beep) via Web Audio, senza asset esterni.
  const playChatBeep = () => {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g);
      g.connect(ctx.destination);
      o.type = "sine";
      o.frequency.setValueAtTime(880, ctx.currentTime);
      o.frequency.setValueAtTime(1175, ctx.currentTime + 0.12);
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
      o.start();
      o.stop(ctx.currentTime + 0.5);
    } catch (_) {}
  };

  // Polling dei messaggi ogni 4s finche' si e' loggati.
  useEffect(() => {
    if (!authUser) return;
    let stop = false;
    const poll = async () => {
      const res = await callSheetsApi({ action: "getChatMessaggi" });
      if (stop || !res || !res.success) return;
      const msgs = res.messaggi || [];
      setChatMessages(msgs);
      const seen = chatSeenRef.current;
      const nonMei = msgs.filter(
        (m) => String(m.mittente) !== String(authUser.username)
      );
      const unread = nonMei.filter((m) => !seen || String(m.creato_il) > String(seen)).length;
      const newest = msgs.length ? String(msgs[msgs.length - 1].creato_il) : "";
      const newestFromOther = nonMei.length ? String(nonMei[nonMei.length - 1].creato_il) : "";
      // Suono solo quando arriva un messaggio NUOVO da un altro e la chat e' chiusa.
      if (
        newestFromOther &&
        chatNewestRef.current &&
        newestFromOther > chatNewestRef.current &&
        !chatOpenRef.current
      ) {
        playChatBeep();
      }
      chatNewestRef.current = newest > chatNewestRef.current ? newest : chatNewestRef.current;
      if (!chatOpenRef.current) setChatUnread(unread);
    };
    poll();
    const iv = setInterval(poll, 4000);
    return () => {
      stop = true;
      clearInterval(iv);
    };
  }, [authUser]);

  // Auto-scroll in fondo quando arrivano messaggi o si apre la chat.
  useEffect(() => {
    if (chatOpen && chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ block: "end" });
    }
  }, [chatMessages, chatOpen]);

  const openChat = () => {
    setChatOpen(true);
    chatOpenRef.current = true;
    const now = new Date().toISOString();
    chatSeenRef.current = now;
    try {
      localStorage.setItem("chat_last_seen", now);
    } catch (_) {}
    setChatUnread(0);
  };

  const closeChat = () => {
    setChatOpen(false);
    chatOpenRef.current = false;
    const now = new Date().toISOString();
    chatSeenRef.current = now;
    try {
      localStorage.setItem("chat_last_seen", now);
    } catch (_) {}
  };

  const sendChat = async ({ testo = "", tipo = "testo", audio = "" }) => {
    if (chatSending) return;
    const t = String(testo || "").trim();
    if (tipo === "testo" && !t) return;
    if (tipo === "audio" && !audio) return;
    setChatSending(true);
    try {
      const res = await callSheetsApi({
        action: "inviaChatMessaggio",
        payload: JSON.stringify({
          mittente: authUser?.username || "",
          etichetta: authUser?.etichetta || authUser?.username || "",
          tipo,
          testo: tipo === "testo" ? t : "",
          audio,
        }),
      });
      if (res && res.success) {
        if (tipo === "testo") setChatText("");
        if (res.messaggio) {
          setChatMessages((prev) => [...prev, res.messaggio]);
          chatNewestRef.current = String(res.messaggio.creato_il || chatNewestRef.current);
        }
      } else {
        alert(
          "Messaggio non inviato: " + ((res && res.error) || "errore") +
            "\n\nControlla che la tabella chat_messaggi esista su Supabase."
        );
      }
    } catch (err) {
      alert("Errore di collegamento nell'invio del messaggio.");
    } finally {
      setChatSending(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      const chunks = [];
      mr.ondataavailable = (e) => {
        if (e.data && e.data.size) chunks.push(e.data);
      };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: mr.mimeType || "audio/webm" });
        const dataUrl = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.readAsDataURL(blob);
        });
        await sendChat({ tipo: "audio", audio: String(dataUrl) });
      };
      mediaRecorderRef.current = mr;
      mr.start();
      setRecording(true);
    } catch (e) {
      alert("Microfono non disponibile o permesso negato: " + String(e));
    }
  };

  const stopRecording = () => {
    const mr = mediaRecorderRef.current;
    if (mr && mr.state !== "inactive") mr.stop();
    setRecording(false);
  };

  const addProductionLoad = async () => {
    if (savingProdLoad) return;
    const prod = products.find((p) => String(p.id) === String(prodProductId));
    if (!prod) {
      alert("Seleziona l'articolo prodotto.");
      return;
    }
    if (!prodCode.trim()) {
      alert("Inserisci il codice lotto.");
      return;
    }
    if (!prodExpiry) {
      alert("Inserisci la scadenza.");
      return;
    }
    const qty = Number(prodQty);
    if (!qty || qty <= 0) {
      alert("Inserisci quante unità sono state prodotte.");
      return;
    }
    const kg = Math.round(qty * Number(prod.weightKg || 0) * 100) / 100;

    setSavingProdLoad(true);
    try {
      const result = await callSheetsApi({
        action: "createLot",
        payload: JSON.stringify({
          id: `LOT-${Date.now()}`,
          productId: String(prod.id),
          lot: prodCode.trim(),
          codiceLotto: prodCode.trim(),
          expiry: prodExpiry,
          scadenza: prodExpiry,
          quantita: qty,
          loadedQty: qty,
        }),
      });
      if (!result || !result.success) {
        alert("Errore nel carico: " + ((result && result.error) || "sconosciuto"));
        return;
      }

      const returnedLotId = String(result.lotId || result.idLotto || `LOT-${Date.now()}`);
      const returnedQty =
        result.newQty !== undefined && result.newQty !== null && result.newQty !== ""
          ? Number(result.newQty)
          : qty;
      setLots((prev) => {
        const exists = prev.some(
          (lot) =>
            String(lot.id) === returnedLotId ||
            (String(lot.productId) === String(prod.id) && String(lot.lot) === prodCode.trim())
        );
        if (exists) {
          return prev.map((lot) =>
            String(lot.id) === returnedLotId ||
            (String(lot.productId) === String(prod.id) && String(lot.lot) === prodCode.trim())
              ? { ...lot, id: returnedLotId, lot: prodCode.trim(), expiry: prodExpiry, loadedQty: returnedQty }
              : lot
          );
        }
        return [
          { id: returnedLotId, productId: String(prod.id), lot: prodCode.trim(), expiry: prodExpiry, loadedQty: returnedQty, archived: false },
          ...prev,
        ];
      });

      // Log produzione per l'app margine (best-effort: se la tabella non c'e'
      // ancora, il carico lotto resta comunque valido).
      try {
        await callSheetsApi({
          action: "logProduzione",
          payload: JSON.stringify({
            productId: String(prod.id),
            code: prod.code,
            name: prod.name,
            lot: prodCode.trim(),
            expiry: prodExpiry,
            ct: qty,
            kg,
            operatore: authUser?.etichetta || authUser?.username || "",
          }),
        });
      } catch (_) {}

      setProdTodayList((prev) => [
        { code: prod.code, name: prod.name, lot: prodCode.trim(), expiry: prodExpiry, qty, kg, uom: prod.uom },
        ...prev,
      ]);
      setProdProductId("");
      setProdProductSearch("");
      setProdCode("");
      setProdExpiry("");
      setProdQty("");
    } catch (error) {
      alert("Errore di collegamento: " + String(error));
    } finally {
      setSavingProdLoad(false);
    }
  };


  const createProduct = async () => {
    if (!newProductCode.trim()) {
      alert("Inserisci il codice prodotto");
      return;
    }

    if (!newProductName.trim()) {
      alert("Inserisci la descrizione prodotto");
      return;
    }

    const newProduct = {
      id: newProductCode.trim(),
      productId: newProductCode.trim(),
      code: newProductCode.trim(),
      Codice_Prodotto: newProductCode.trim(),
      name: newProductName.trim(),
      productName: newProductName.trim(),
      Descrizione_Prodotto: newProductName.trim(),
      uom: newProductUom.trim() || "pz",
      UM: newProductUom.trim() || "pz",
      managesLots: newProductManagesLots,
      Gestione_Lotti: newProductManagesLots ? "SI" : "NO",
    };

    setSavingNewProduct(true);

    try {
      const result = await callSheetsApi({
        action: "createProduct",
        payload: JSON.stringify(newProduct),
      });

      if (!result || !result.success) {
        alert(
          "Errore nel salvataggio prodotto sul foglio: " +
            ((result && result.error) || "errore sconosciuto")
        );
        return;
      }

      setProducts((prev) => [
        {
          id: newProduct.code,
          code: newProduct.code,
          name: newProduct.name,
          uom: newProduct.uom,
          managesLots: newProduct.managesLots,
        },
        ...prev,
      ]);

      setNewProductCode("");
      setNewProductName("");
      setNewProductUom("pz");
      setNewProductManagesLots(true);
      setProductDialogOpen(false);
      setPage("prodotti");

      
    } catch (error) {
      alert("Errore di collegamento con Google Sheet: " + String(error));
    } finally {
      setSavingNewProduct(false);
    }
  };

  const openEditProductDialog = (product) => {
    if (!isAdmin) return;

    setEditingProductId(product.id);
    setEditProductCode(product.code);
    setEditProductName(product.name);
    setEditProductUom(product.uom || "pz");
    setEditProductManagesLots(productManagesLots(product));
    setEditProductDialogOpen(true);
  };

  const saveEditedProduct = async () => {
    if (!editingProductId || !editProductCode.trim() || !editProductName.trim()) {
      alert("Compila codice prodotto e descrizione");
      return;
    }

    const payload = {
      productId: String(editingProductId),
      id: String(editingProductId),
      code: editProductCode.trim(),
      Codice_Prodotto: editProductCode.trim(),
      name: editProductName.trim(),
      productName: editProductName.trim(),
      Descrizione_Prodotto: editProductName.trim(),
      uom: editProductUom.trim() || "pz",
      UM: editProductUom.trim() || "pz",
      managesLots: editProductManagesLots,
      Gestione_Lotti: editProductManagesLots ? "SI" : "NO",
    };

    setSavingProduct(true);

    try {
      const result = await callSheetsApi({
        action: "updateProduct",
        payload: JSON.stringify(payload),
      });

      if (!result || !result.success) {
        alert(
          "Errore nel salvataggio prodotto sul foglio: " +
            ((result && result.error) || "errore sconosciuto")
        );
        return;
      }

      setProducts((prev) =>
        prev.map((product) =>
          String(product.id) === String(editingProductId)
            ? {
                ...product,
                code: editProductCode.trim(),
                name: editProductName.trim(),
                uom: editProductUom.trim() || "pz",
                managesLots: editProductManagesLots,
              }
            : product
        )
      );

      setEditProductDialogOpen(false);
      setEditingProductId(null);
      setEditProductCode("");
      setEditProductName("");
      setEditProductUom("pz");
      setEditProductManagesLots(true);

      
    } catch (error) {
      alert("Errore di collegamento con Google Sheet: " + String(error));
    } finally {
      setSavingProduct(false);
    }
  };

  const deleteProduct = async (product) => {
    if (!isAdmin) {
      alert("Solo admin può eliminare un prodotto.");
      return;
    }

    if (!product) return;

    if ((product.productLots || []).length > 0) {
      alert("Impossibile eliminare questo prodotto perché ha lotti collegati.");
      return;
    }

    const productIdToDelete = product.id || product.code;

    const conferma = window.confirm(
      `Vuoi eliminare davvero il prodotto ${product.code} · ${product.name} dal Google Sheet?`
    );

    if (!conferma) return;

    setDeletingProductId(String(productIdToDelete));

    try {
      const result = await callSheetsApi({
        action: "deleteProduct",
        productId: productIdToDelete,
        adminPin: ADMIN_PIN,
      });

      if (!result || !result.success) {
        alert(
          "Errore nell'eliminazione prodotto sul foglio: " +
            ((result && result.error) || "errore sconosciuto")
        );
        return;
      }

      setProducts((prev) => prev.filter((item) => String(item.id) !== String(product.id)));

      
    } catch (error) {
      alert("Errore di collegamento con Google Sheet: " + String(error));
    } finally {
      setDeletingProductId("");
    }
  };

  const handleAdminAccess = () => {
    if (adminPinInput === ADMIN_PIN) {
      setIsAdmin(true);
      setAdminDialogOpen(false);
      setAdminPinInput("");
      setAdminError("");
      return;
    }

    setAdminError("PIN non corretto");
  };

  const exitAdminMode = () => {
    setIsAdmin(false);
    setAdminPinInput("");
    setAdminError("");
    setAdminDialogOpen(false);
  };

  const openAddLineDialog = () => {
    if (!isAdmin || !selectedOrder) return;

    setNewLineProductId("");
    setNewLineQty("");
    setNewLinePrezzo("");
    setNewLineSconto("");
    setAddLineDialogOpen(true);
  };

  const openEditLineDialog = (line) => {
    if (!isAdmin || !line) return;

    setEditingLineId(line.lineId);
    setEditingLineQty(String(line.qtyOrdered || ""));
    setEditLineDialogOpen(true);
  };

  const createOrderLine = async () => {
    if (!isAdmin || !selectedOrder) return;

    const qtyOrdered = Number(newLineQty);

    if (!qtyOrdered || qtyOrdered <= 0) {
      alert("Inserisci una quantità valida");
      return;
    }

    const nextRowOrder =
      Math.max(0, ...((selectedOrder.lines || []).map((line) => Number(line.rowOrder || 0)))) + 1;

    let newLine;

    if (newLineIsOutsideStock) {
      if (!newLineCustomName.trim()) {
        alert("Inserisci il nome dell'articolo fuori magazzino");
        return;
      }

      newLine = {
        lineId: `RIGA-${Date.now()}`,
        orderId: selectedOrder.id,
        productId: `${OUTSIDE_STOCK_PRODUCT_ID}-${Date.now()}`,
        productCode: OUTSIDE_STOCK_PRODUCT_ID,
        productName: newLineCustomName.trim(),
        isOutsideStock: true,
        rowOrder: nextRowOrder,
        qtyOrdered,
        qtyAssignedFromSheet: 0,
      };
    } else {
      if (!newLineProductId) {
        alert("Seleziona il prodotto");
        return;
      }

      const product = products.find((item) => String(item.id) === String(newLineProductId));

      if (!product) {
        alert("Prodotto non trovato");
        return;
      }

      newLine = {
        lineId: `RIGA-${Date.now()}`,
        orderId: selectedOrder.id,
        productId: String(product.id),
        productCode: product.code || product.id,
        productName: product.name || "",
        isOutsideStock: false,
        rowOrder: nextRowOrder,
        qtyOrdered,
        qtyAssignedFromSheet: 0,
      };
    }

    setSavingNewLine(true);

    setOrders((prev) =>
      prev.map((order) =>
        String(order.id) === String(selectedOrder.id)
          ? { ...order, lines: [...(order.lines || []), newLine] }
          : order
      )
    );

    const prezzoRiga = String(newLinePrezzo).trim();
    const scontoRiga = String(newLineSconto).trim();

    setAddLineDialogOpen(false);
    setNewLineProductId("");
    setNewLineProductSearch("");
    setNewLineIsOutsideStock(false);
    setNewLineCustomName("");
    setNewLineQty("");
    setNewLinePrezzo("");
    setNewLineSconto("");

    try {
      const result = await callSheetsApi({
        action: "addOrderLine",
        payload: JSON.stringify({
          orderId: selectedOrder.id,
          lineId: newLine.lineId,
          productId: newLine.productId,
          productCode: newLine.productCode,
          productName: newLine.productName,
          isOutsideStock: newLine.isOutsideStock,
          rowOrder: newLine.rowOrder,
          qtyOrdered,
          ...(prezzoRiga !== ""
            ? {
                prezzoUnitario: Number(prezzoRiga),
                scontoPct: scontoRiga === "" ? 0 : Number(scontoRiga),
                prezzoOrigine: "storico-cliente",
              }
            : {}),
        }),
      });

      if (!result || !result.success) {
        setOrders((prev) =>
          prev.map((order) =>
            String(order.id) === String(selectedOrder.id)
              ? {
                  ...order,
                  lines: (order.lines || []).filter(
                    (line) => String(line.lineId) !== String(newLine.lineId)
                  ),
                }
              : order
          )
        );

        alert(
          "Errore nel salvataggio riga ordine sul foglio: " +
            ((result && result.error) || "errore sconosciuto")
        );
      }
    } catch (error) {
      setOrders((prev) =>
        prev.map((order) =>
          String(order.id) === String(selectedOrder.id)
            ? {
                ...order,
                lines: (order.lines || []).filter(
                  (line) => String(line.lineId) !== String(newLine.lineId)
                ),
              }
            : order
        )
      );

      alert("Errore di collegamento con Google Sheet: " + String(error));
    } finally {
      setSavingNewLine(false);
    }
  };

  const saveEditedOrderLine = async () => {
    if (!isAdmin || !editingLineId) return;

    const qtyOrdered = Number(editingLineQty);

    if (!qtyOrdered || qtyOrdered <= 0) {
      alert("Inserisci una quantità valida");
      return;
    }

    const previousOrders = orders;
    const assignedQty = (assignments[editingLineId] || []).reduce(
      (sum, assignment) => sum + Number(assignment.qty || 0),
      0
    );

    if (qtyOrdered < assignedQty) {
      alert("La quantità non può essere minore della quantità già assegnata");
      return;
    }

    const lineIdToUpdate = editingLineId;

    setSavingEditedLine(true);

    setOrders((prev) =>
      prev.map((order) => ({
        ...order,
        lines: (order.lines || []).map((line) =>
          String(line.lineId) === String(lineIdToUpdate)
            ? { ...line, qtyOrdered }
            : line
        ),
      }))
    );

    setEditLineDialogOpen(false);
    setEditingLineId("");
    setEditingLineQty("");

    try {
      const result = await callSheetsApi({
        action: "updateOrderLine",
        payload: JSON.stringify({
          lineId: lineIdToUpdate,
          qtyOrdered,
        }),
      });

      if (!result || !result.success) {
        setOrders(previousOrders);

        alert(
          "Errore nel salvataggio modifica riga sul foglio: " +
            ((result && result.error) || "errore sconosciuto")
        );
      }
    } catch (error) {
      setOrders(previousOrders);

      alert("Errore di collegamento con Google Sheet: " + String(error));
    } finally {
      setSavingEditedLine(false);
    }
  };

  const deleteLine = async (orderId, lineId) => {
    if (!orderId || !lineId) return;

    const conferma = window.confirm(
      "Vuoi eliminare davvero questa riga ordine? Verranno eliminate anche eventuali assegnazioni collegate."
    );

    if (!conferma) return;

    try {
      const result = await callSheetsApi({
        action: "deleteLine",
        lineId,
      });

      if (!result || !result.success) {
        alert(
          "Errore nell'eliminazione riga ordine: " +
            ((result && result.error) || "errore sconosciuto")
        );
        return;
      }

      // Se l'ordine era preparato e l'adapter ha ripristinato lo stock dei
      // lotti coinvolti + riaperto l'ordine, applichiamo i movimenti e il
      // ricaricamento e' gestito dal flag orderReopened.
      if (Array.isArray(result.stockMovements) && result.stockMovements.length > 0) {
        setLots((prev) => applyStockMovementsToLots(prev, result.stockMovements));
      }
      if (result.orderReopened) {
        await loadDataFromSheets();
        return;
      }

      setAssignments((prev) => {
        const next = { ...prev };
        delete next[lineId];
        return next;
      });

      const updatedOrders = orders
        .map((order) =>
          String(order.id) === String(orderId)
            ? {
                ...order,
                lines: (order.lines || []).filter(
                  (line) => String(line.lineId) !== String(lineId)
                ),
              }
            : order
        )
        .filter((order) => (order.lines || []).length > 0);

      setOrders(updatedOrders);

      const sameOrder = updatedOrders.find((order) => String(order.id) === String(orderId));

      setSelectedOrderId(sameOrder?.id ?? updatedOrders[0]?.id ?? "");
      setSelectedLineId(
        sameOrder?.lines?.[0]?.lineId ?? updatedOrders[0]?.lines?.[0]?.lineId ?? ""
      );

      
    } catch (error) {
      alert("Errore di collegamento con Google Sheet: " + String(error));
    }
  };

  const deleteAssignment = async (lineId, assignmentId) => {
    if (!lineId || !assignmentId) return;

    const conferma = window.confirm("Vuoi eliminare questa assegnazione lotto?");
    if (!conferma) return;

    const assignmentToDelete = (assignments[lineId] || []).find(
      (assignment) => String(assignment.assignmentId) === String(assignmentId)
    );

    setAssignments((prev) => ({
      ...prev,
      [lineId]: (prev[lineId] || []).filter(
        (assignment) => String(assignment.assignmentId) !== String(assignmentId)
      ),
    }));

    try {
      const result = await callSheetsApi({
        action: "deleteAssignment",
        assignmentId,
      });

      if (!result || !result.success) {
        if (assignmentToDelete) {
          setAssignments((prev) => ({
            ...prev,
            [lineId]: [...(prev[lineId] || []), assignmentToDelete],
          }));
        }

        alert(
          "Errore nell'eliminazione assegnazione sul foglio: " +
            ((result && result.error) || "errore sconosciuto")
        );
        return;
      }

      // Se l'ordine era "preparato" ed e' stato riaperto, il backend ha
      // ripristinato lo stock di TUTTE le assegnazioni dell'ordine. Per evitare
      // qualsiasi disallineamento (causa del bug "tutto non disponibile"),
      // ricarichiamo lo stato completo dal foglio invece di applicare le patch
      // ottimistiche una per una.
      if (result.orderReopened) {
        await loadDataFromSheets();
        return;
      }

      if (result.stockRestored) {
        setLots((prev) => applyStockMovementsToLots(prev, [result.stockRestored]));
      }
    } catch (error) {
      if (assignmentToDelete) {
        setAssignments((prev) => ({
          ...prev,
          [lineId]: [...(prev[lineId] || []), assignmentToDelete],
        }));
      }

      alert("Errore di collegamento con Google Sheet: " + String(error));
    }
  };


  const openEditLotDialog = (lot) => {
    if (!lot) return;

    setEditingLotId(String(lot.id || lot.lot));
    setEditingLotCode(String(lot.lot || ""));
    setEditingLotExpiry(lot.expiry ? String(lot.expiry).slice(0, 10) : "");
    setEditingLotQty(String(Number(lot.loadedQty || 0)));
    setEditLotDialogOpen(true);
  };

  // Aggiunge alla giacenza del lotto la produzione appena fatta.
  // Esempio: giacenza attuale -3, produzione +20 -> giacenza nuova = 17.
  const addProductionToLot = () => {
    const delta = Number(addProductionQty);
    if (!delta || delta <= 0 || isNaN(delta)) {
      alert("Inserisci una quantità prodotta positiva");
      return;
    }
    const current = Number(editingLotQty) || 0;
    const next = current + delta;
    setEditingLotQty(String(next));
    setAddProductionQty("");
  };

  const saveEditedLot = async () => {
    if (!editingLotId) return;

    if (editingLotQty === "" || isNaN(Number(editingLotQty))) {
      alert("Inserisci una quantità valida");
      return;
    }

    setSavingEditedLot(true);

    const previousLots = lots;

    setLots((prev) =>
      prev.map((lot) =>
        String(lot.id) === String(editingLotId)
          ? {
              ...lot,
              lot: editingLotCode.trim() || lot.lot,
              expiry: editingLotExpiry,
              loadedQty: Number(editingLotQty),
            }
          : lot
      )
    );

    try {
      const result = await callSheetsApi({
        action: "updateLot",
        payload: JSON.stringify({
          lotId: editingLotId,
          expiry: editingLotExpiry,
          loadedQty: Number(editingLotQty),
        }),
      });

      if (!result || !result.success) {
        setLots(previousLots);
        alert(
          "Errore nella modifica lotto sul foglio: " +
            ((result && result.error) || "errore sconosciuto")
        );
        return;
      }

      setEditLotDialogOpen(false);
      setEditingLotId("");
      setEditingLotCode("");
      setEditingLotExpiry("");
      setEditingLotQty("");
    } catch (error) {
      setLots(previousLots);
      alert("Errore di collegamento con Google Sheet: " + String(error));
    } finally {
      setSavingEditedLot(false);
    }
  };

  const archiveLot = async (lotId) => {
    if (!lotId) return;

    const lotToArchive = lots.find((lot) => String(lot.id) === String(lotId));
    const lotCode = lotToArchive?.lot || lotId;
    const qty = Number(lotToArchive?.loadedQty || 0);
    const assigned = Number(lotAssignedMap[String(lotId)]?.assigned || 0);

    if (qty > 0) {
      alert("Puoi archiviare solo lotti con quantità a zero.");
      return;
    }

    if (assigned > 0) {
      alert("Non puoi archiviare un lotto ancora impegnato in ordini non preparati.");
      return;
    }

    const conferma = window.confirm(
      `Vuoi archiviare il lotto ${lotCode}? Non sarà più visibile nel magazzino attivo.`
    );

    if (!conferma) return;

    try {
      const result = await callSheetsApi({
        action: "archiveLot",
        lotId,
      });

      if (!result || !result.success) {
        alert(
          "Errore nell'archiviazione lotto sul foglio: " +
            ((result && result.error) || "errore sconosciuto")
        );
        return;
      }

      setLots((prev) =>
        prev.map((lot) =>
          String(lot.id) === String(lotId) ? { ...lot, archived: true } : lot
        )
      );
    } catch (error) {
      alert("Errore di collegamento con Google Sheet: " + String(error));
    }
  };

  const deleteLot = async (lotId) => {
    if (!lotId) return;

    const lotToDelete = lots.find((lot) => String(lot.id) === String(lotId));
    const lotCodeToDelete = lotToDelete?.lot || lotId;
    const lotIdToDelete = lotToDelete?.id || lotId;

    // Blocco SOLO se il lotto e' assegnato a ordini NON ancora preparati
    // (lotAssignedMap.assigned filtra gia' su questo). Le assegnazioni
    // storiche su ordini preparati/usciti sono normali: l'adapter le pulisce
    // automaticamente quando si elimina il lotto.
    const activeAssigned = Number(lotAssignedMap[String(lotIdToDelete)]?.assigned || 0);
    if (activeAssigned > 0) {
      alert("Impossibile eliminare questo lotto: è assegnato a un ordine non ancora preparato.");
      return;
    }

    const conferma = window.confirm(
      `Vuoi eliminare davvero il lotto ${lotCodeToDelete}? Verranno rimosse anche le sue assegnazioni storiche su ordini già preparati (lo storico ordine resta intatto).`
    );

    if (!conferma) return;

    try {
      let result = await callSheetsApi({
        action: "deleteLot",
        lotId: lotIdToDelete,
      });

      if (!result || !result.success) {
        alert(
          "Errore nell'eliminazione lotto sul foglio: " +
            ((result && result.error) || "errore sconosciuto")
        );
        return;
      }

      // Rimuovi SOLO il lotto eliminato, per id univoco. Mai per codice:
      // piu' lotti possono condividere lo stesso codice e non vanno toccati.
      setLots((prev) => prev.filter((lot) => String(lot.id) !== String(lotIdToDelete)));
    } catch (error) {
      alert("Errore di collegamento con Google Sheet: " + String(error));
    }
  };

  if (!authUser) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "linear-gradient(180deg, #eef3f9 0%, #f7f9fc 42%, #eef3f9 100%)",
          fontFamily: "Arial, sans-serif",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 20,
          boxSizing: "border-box",
        }}
      >
        <form
          onSubmit={doLogin}
          style={{ ...cardStyle(), padding: 28, width: "100%", maxWidth: 380, display: "grid", gap: 14 }}
        >
          <div>
            <div style={{ fontSize: 22, fontWeight: 950, color: "#07153a", fontStyle: "italic" }}>
              Gluten Free Experience Srl
            </div>
            <div style={{ marginTop: 4, color: "#617086", fontSize: 13, letterSpacing: 0.5, textTransform: "uppercase", fontWeight: 800 }}>
              Gestione ordini · lotti · disponibilità
            </div>
          </div>

          <div style={{ marginTop: 6 }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 800, color: "#40516a", marginBottom: 6 }}>
              Utente
            </label>
            {loginUsers.length > 0 ? (
              <select
                style={inputStyle()}
                value={loginUsername}
                onChange={(e) => setLoginUsername(e.target.value)}
              >
                {loginUsers.map((u) => (
                  <option key={u.username} value={u.username}>
                    {u.etichetta || u.username}
                  </option>
                ))}
              </select>
            ) : (
              <input
                style={inputStyle()}
                value={loginUsername}
                onChange={(e) => setLoginUsername(e.target.value)}
                placeholder="es. produzione"
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="username"
              />
            )}
          </div>

          <div>
            <label style={{ display: "block", fontSize: 13, fontWeight: 800, color: "#40516a", marginBottom: 6 }}>
              Password
            </label>
            <input
              style={inputStyle()}
              type="password"
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              placeholder="password"
              autoComplete="current-password"
            />
          </div>

          {loginError ? (
            <div style={{ ...cardStyle({ background: "#fff1f2" }), padding: 10, color: "#991b1b", fontSize: 13, border: "1px solid #fecaca" }}>
              {loginError}
            </div>
          ) : null}

          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: "#40516a", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={loginRemember}
              onChange={(e) => setLoginRemember(e.target.checked)}
              style={{ width: 18, height: 18 }}
            />
            Rimani collegato su questo dispositivo
          </label>

          <button type="submit" style={btnStyle("primary", loggingIn)} disabled={loggingIn}>
            <Lock size={16} /> {loggingIn ? "Accesso..." : "Entra"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg, #eef3f9 0%, #f7f9fc 42%, #eef3f9 100%)",
        padding: isSmallLayout ? 10 : 20,
        fontFamily: "Arial, sans-serif",
        overflowX: "hidden",
        boxSizing: "border-box",
      }}
    >
      <div style={{ maxWidth: 1320, margin: "0 auto", width: "100%", boxSizing: "border-box", minWidth: 0 }}>
        <div
          style={{
            ...cardStyle({ background: "rgba(255,255,255,0.88)" }),
            padding: isSmallLayout ? 14 : 18,
            marginBottom: 20,
            position: "sticky",
            top: 10,
            zIndex: 20,
            backdropFilter: "blur(18px)",
            border: "1px solid rgba(207,216,230,0.85)",
            boxShadow: "0 18px 42px rgba(15,23,42,0.08)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 14,
              marginBottom: 14,
              flexWrap: "wrap",
            }}
          >
            <div>
              <div
                style={{
                  fontFamily: "Georgia, 'Times New Roman', serif",
                  fontStyle: "italic",
                  fontSize: isSmallLayout ? 20 : 24,
                  fontWeight: 700,
                  color: "#07153a",
                  letterSpacing: "-0.03em",
                  lineHeight: 1.05,
                }}
              >
                Gluten Free Experience Srl
              </div>
              <div
                style={{
                  marginTop: 4,
                  color: "#7a8699",
                  fontSize: 12,
                  fontWeight: 750,
                  textTransform: "uppercase",
                  letterSpacing: "0.12em",
                }}
              >
                gestione ordini · lotti · disponibilità
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
              {authUser ? (
                <span style={{ ...badgeStyle("outline"), display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <Users size={14} /> {authUser.etichetta || authUser.username}
                </span>
              ) : null}
              <span style={badgeStyle(isAdmin ? "dark" : "outline")}>
                {isAdmin ? "ADMIN" : "OPERATORE"}
              </span>
              <button
                style={{
                  ...btnStyle(chatUnread > 0 ? "warning" : "outline"),
                  position: "relative",
                }}
                onClick={openChat}
                title="Chat interna produzione / amministrazione"
              >
                <MessageCircle size={16} /> Chat
                {chatUnread > 0 ? (
                  <span
                    style={{
                      marginLeft: 4,
                      background: "#dc2626",
                      color: "#fff",
                      borderRadius: 999,
                      fontSize: 12,
                      fontWeight: 900,
                      minWidth: 20,
                      height: 20,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "0 5px",
                    }}
                  >
                    {chatUnread}
                  </span>
                ) : null}
              </button>
              <button style={btnStyle("outline")} onClick={doLogout} title="Esci dall'account">
                <Lock size={16} /> Esci
              </button>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: isSmallLayout ? "stretch" : "space-between",
            }}
          >
            <div
              style={{
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
                flex: "1 1 auto",
              }}
            >
              <button
                style={{
                  ...btnStyle(page === "ordini" ? "primary" : "soft"),
                  borderRadius: 999,
                  minWidth: isSmallLayout ? "calc(50% - 5px)" : 128,
                }}
                onClick={() => setPage("ordini")}
              >
                <ClipboardList size={18} /> {isProduzione ? "Da preparare" : "Ordini"}
              </button>

              {!isProduzione && (
              <button
                style={{
                  ...btnStyle(page === "ordini-app" ? "primary" : "soft"),
                  borderRadius: 999,
                  minWidth: isSmallLayout ? "calc(50% - 5px)" : 128,
                  position: "relative",
                }}
                onClick={() => { setPage("ordini-app"); loadOrdiniApp(); }}
              >
                <Smartphone size={18} /> Ordini da APP
                {ordiniApp.length > 0 && (
                  <span
                    style={{
                      marginLeft: 6, background: "#dc2626", color: "#fff",
                      borderRadius: 999, fontSize: 12, fontWeight: 800,
                      minWidth: 20, height: 20, display: "inline-flex",
                      alignItems: "center", justifyContent: "center", padding: "0 5px",
                    }}
                  >
                    {ordiniApp.length}
                  </span>
                )}
              </button>
              )}

              {!isProduzione && (
              <button
                style={{
                  ...btnStyle(page === "prodotti" ? "primary" : "soft"),
                  borderRadius: 999,
                  minWidth: isSmallLayout ? "calc(50% - 5px)" : 128,
                }}
                onClick={() => setPage("prodotti")}
              >
                <Package size={18} /> Prodotti
              </button>
              )}

              {/* Visibile anche alla PRODUZIONE: e' lei che produce le commesse
                  ad hoc per cui l'ordine e' fermo, quindi deve leggere il motivo. */}
              <button
                style={{
                  ...btnStyle(page === "fermi" ? "primary" : "soft"),
                  borderRadius: 999,
                  minWidth: isSmallLayout ? "calc(50% - 5px)" : 138,
                  position: "relative",
                }}
                onClick={() => setPage("fermi")}
              >
                <AlertTriangle size={18} /> Ordini fermi
                {stoppedCount > 0 ? (
                  <span
                    style={{
                      marginLeft: 6,
                      background: "#f59e0b",
                      color: "#fff",
                      borderRadius: 999,
                      fontSize: 12,
                      fontWeight: 900,
                      minWidth: 20,
                      height: 20,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "0 5px",
                    }}
                  >
                    {stoppedCount}
                  </span>
                ) : null}
              </button>

              <button
                style={{
                  ...btnStyle(page === "preparati" ? "primary" : "soft"),
                  borderRadius: 999,
                  minWidth: isSmallLayout ? "calc(50% - 5px)" : 128,
                }}
                onClick={() => setPage("preparati")}
              >
                <CheckCircle2 size={18} /> {isProduzione ? "Pronti" : "Preparati"}
              </button>

              {!isProduzione && (
              <button
                style={{
                  ...btnStyle(page === "spediti" ? "primary" : "soft"),
                  borderRadius: 999,
                  minWidth: isSmallLayout ? "calc(50% - 5px)" : 128,
                }}
                onClick={() => setPage("spediti")}
              >
                🚚 Spediti
                {speditiOrders.length > 0 ? (
                  <span
                    style={{
                      background: "#16a34a",
                      color: "#fff",
                      borderRadius: 999,
                      padding: "2px 8px",
                      fontSize: 12,
                      fontWeight: 900,
                    }}
                  >
                    {speditiOrders.length}
                  </span>
                ) : null}
              </button>
              )}

              {!isProduzione && (
              <button
                style={{
                  ...btnStyle(page === "archivio" ? "primary" : "soft"),
                  borderRadius: 999,
                  minWidth: isSmallLayout ? "calc(50% - 5px)" : 128,
                }}
                onClick={() => setPage("archivio")}
              >
                <Archive size={18} /> Archivio
              </button>
              )}

              <button
                style={{
                  ...btnStyle(page === "magazzino" ? "primary" : "soft"),
                  borderRadius: 999,
                  minWidth: isSmallLayout ? "calc(50% - 5px)" : 158,
                }}
                onClick={() => setPage("magazzino")}
              >
                <Boxes size={18} /> Magazzino
              </button>

              {/* Riga bollati: cosa sta scadendo (< 30 gg) e si regala. */}
              <button
                style={{
                  ...btnStyle(page === "bollati" ? "primary" : "soft"),
                  borderRadius: 999,
                  minWidth: isSmallLayout ? "calc(50% - 5px)" : 148,
                }}
                onClick={() => setPage("bollati")}
              >
                🏷️ Bollati
                {bollatiTotali.lotti > 0 && (
                  <span style={{ ...badgeStyle(bollatiTotali.scaduti > 0 ? "danger" : "warning"), marginLeft: 6 }}>
                    {bollatiTotali.lotti}
                  </span>
                )}
              </button>

              {isProduzione && (
              <button
                style={{
                  ...btnStyle(page === "foto-bolle" ? "primary" : "soft"),
                  borderRadius: 999,
                  minWidth: isSmallLayout ? "calc(50% - 5px)" : 148,
                }}
                onClick={() => setPage("foto-bolle")}
              >
                <Camera size={18} /> Foto bolle
              </button>
              )}

              {!isProduzione && (
              <button
                style={{
                  ...btnStyle("primary"),
                  borderRadius: 999,
                  minWidth: isSmallLayout ? "100%" : 154,
                }}
                onClick={() => setOrderDialogOpen(true)}
              >
                <Plus size={18} /> Nuovo ordine
              </button>
              )}

              {isAdmin && (
                <>
                  <button
                    style={{
                      ...btnStyle("soft"),
                      borderRadius: 999,
                      minWidth: isSmallLayout ? "calc(50% - 5px)" : 158,
                    }}
                    onClick={() => setProductDialogOpen(true)}
                  >
                    <Plus size={18} /> Nuovo prodotto
                  </button>

                  <button
                    style={{
                      ...btnStyle("soft"),
                      borderRadius: 999,
                      minWidth: isSmallLayout ? "calc(50% - 5px)" : 142,
                    }}
                    onClick={() => setLotDialogOpen(true)}
                  >
                    <Boxes size={18} /> Carica lotto
                  </button>

                  <button
                    style={{
                      ...btnStyle("soft"),
                      borderRadius: 999,
                      minWidth: isSmallLayout ? "calc(50% - 5px)" : 142,
                    }}
                    onClick={() => { startNewClient(); setClientSearch(""); setClientDialogOpen(true); }}
                  >
                    <Users size={18} /> Clienti
                  </button>
                </>
              )}
            </div>

            <div
              style={{
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
                justifyContent: isSmallLayout ? "stretch" : "flex-end",
                flex: isSmallLayout ? "1 1 100%" : "0 0 auto",
              }}
            >
              <button
                style={{
                  ...btnStyle("outline"),
                  borderRadius: 999,
                  minWidth: isSmallLayout ? "calc(50% - 5px)" : 128,
                }}
                onClick={loadDataFromSheets}
              >
                <RefreshCw size={18} /> Aggiorna
              </button>

              {!isAdmin && !isProduzione ? (
                <button
                  style={{
                    ...btnStyle("outline"),
                    borderRadius: 999,
                    minWidth: isSmallLayout ? "calc(50% - 5px)" : 112,
                  }}
                  onClick={() => setAdminDialogOpen(true)}
                >
                  <Lock size={18} /> Admin
                </button>
              ) : isAdmin ? (
                <button
                  style={{
                    ...btnStyle("outline"),
                    borderRadius: 999,
                    minWidth: isSmallLayout ? "calc(50% - 5px)" : 132,
                  }}
                  onClick={exitAdminMode}
                >
                  <Lock size={18} /> Esci admin
                </button>
              ) : null}
            </div>
          </div>
        </div>

        {loadError ? (
          <div
            style={{
              ...cardStyle(),
              padding: 16,
              marginBottom: 16,
              background: "#fff8e6",
              color: "#8a5a00",
            }}
          >
            {loadError}
          </div>
        ) : null}

        {loadingData ? (
          <div style={{ ...cardStyle(), padding: 16, marginBottom: 16, color: "#6b7280" }}>
            Caricamento dati dal Google Sheet...
          </div>
        ) : null}

        {page === "ordini" && (
          <div style={{ display: "grid", gridTemplateColumns: responsiveTwoColumns, gap: 18, minWidth: 0 }}>
            <div style={{ ...cardStyle(), padding: isSmallLayout ? 16 : 20, alignSelf: "start" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 18,
                }}
              >
                <div style={{ fontSize: 20, fontWeight: 800 }}>Ordini</div>

                <button style={btnStyle("outline")} onClick={markVisibleOrdersAsViewed}>
                  Letti
                </button>

                <button style={btnStyle("primary")} onClick={() => setOrderDialogOpen(true)}>
                  <Plus size={16} /> Nuovo
                </button>
              </div>

              <div style={{ position: "relative", marginBottom: 16 }}>
                <Search
                  size={16}
                  style={{ position: "absolute", left: 14, top: 18, color: "#97a3b6" }}
                />

                <input
                  style={{ ...inputStyle(), paddingLeft: 40 }}
                  value={orderSearch}
                  onChange={(event) => setOrderSearch(event.target.value)}
                  placeholder="Cerca nome ordine, cliente o ID"
                />
              </div>

              <div style={{ display: "grid", gap: 12 }}>
                {filteredOrders.map((order) => (
                  <button
                    key={order.id}
                    onClick={() => openOrderFromList(order)}
                    style={{
                      textAlign: "left",
                      padding: 18,
                      borderRadius: 24,
                      border:
                        selectedOrderId === order.id
                          ? "2px solid #07153a"
                          : String(order.workStatus || "").trim().toLowerCase() === "nuovo"
                            ? "2px solid #f59e0b"
                            : "1px solid #dbe2ea",
                      background:
                        selectedOrderId === order.id
                          ? "linear-gradient(135deg, #f8fbff, #eef4ff)"
                          : String(order.workStatus || "").trim().toLowerCase() === "nuovo"
                            ? "linear-gradient(135deg, #fff7ed, #ffffff)"
                            : "#fff",
                      cursor: "pointer",
                      boxShadow: selectedOrderId === order.id ? "0 12px 24px rgba(7,21,58,0.10)" : "0 5px 14px rgba(15,23,42,0.04)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                      <div>
                        <div style={{ fontSize: 18, fontWeight: 950, color: "#07153a", overflowWrap: "anywhere" }}>
                          {order.customer || "Ordine senza nome"}
                        </div>
                        <div style={{ color: "#66758b", marginTop: 4, fontSize: 12, overflowWrap: "anywhere" }}>
                          {fmtDate(order.date)} · ID {order.id}
                        </div>
                        {order.notes ? (
                          <div style={{ marginTop: 8, color: "#40516a", fontSize: 13, lineHeight: 1.35 }}>
                            {order.notes}
                          </div>
                        ) : null}
                      </div>

                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                        {String(order.workStatus || "").trim().toLowerCase() === "nuovo" ? (
                          <span style={badgeStyle("warning")}>NUOVO</span>
                        ) : null}
                        {order.daBollinare ? (
                          <span
                            style={badgeStyle("warning")}
                            title={"Da bollinare: " + order.righeDaBollinare.map((l) => l.productName).join(" · ")}
                          >
                            🏷️ DA BOLLINARE
                          </span>
                        ) : null}
                        <span style={badgeStyle(order.totalToAssign > 0 ? "warning" : "success")}>{order.computedStatus}</span>
                        <span
                          style={badgeStyle(paymentBadgeFor(order, gestionale).kind)}
                          title={paymentBadgeFor(order, gestionale).auto ? "Calcolato in automatico dallo scaduto TeamSystem. Il flag manuale (OK/KO nel dettaglio) ha la precedenza." : undefined}
                        >
                          {paymentBadgeFor(order, gestionale).label}
                        </span>
                        {(() => {
                          const a = anagraficaFor(order);
                          return (
                            <span
                              style={badgeStyle(a.stato === "ok" ? "success" : a.stato === "ko" ? "danger" : "outline")}
                              title={a.stato === "ko" ? "Mancano: " + a.mancanti.join(", ") : undefined}
                            >
                              {a.label}
                            </span>
                          );
                        })()}
                        {(() => {
                          const t = tipologiaFor(order);
                          return (
                            <span
                              style={badgeStyle(t ? "dark" : "outline")}
                              title={t ? "Tipologia cliente" : "Tipologia da assegnare (apri l'ordine)"}
                            >
                              {t ? "🏷️ " + t : "🏷️ Tipologia?"}
                            </span>
                          );
                        })()}
                      </div>
                    </div>

                    <div style={{ marginTop: 14, color: "#66758b" }}>
                      Da assegnare: {order.totalToAssign}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div style={{ ...cardStyle(), padding: isSmallLayout ? 16 : 20, alignSelf: "start" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
                <div style={{ fontSize: 24, fontWeight: 950, color: "#07153a", letterSpacing: "-0.02em" }}>
                  Preparazione ordine
                </div>
                {selectedOrder ? (
                  <span style={badgeStyle(selectedOrder.totalToAssign > 0 ? "warning" : "success")}>
                    {selectedOrderCompletedLines}/{selectedOrderLines.length} righe complete
                  </span>
                ) : null}
              </div>

              {selectedOrder ? (
                <>
                  <div
                    style={{
                      ...cardStyle({ background: "linear-gradient(135deg, #f8fbff, #eef4ff)" }),
                      padding: isSmallLayout ? 16 : 20,
                      marginBottom: 16,
                      border: "1px solid #d4e0f2",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 12,
                        alignItems: "flex-start",
                        flexWrap: "wrap",
                      }}
                    >
                      <div style={{ flex: "1 1 240px", minWidth: 0 }}>
                        <div style={{ fontSize: isSmallLayout ? 24 : 30, fontWeight: 950, color: "#07153a", overflowWrap: "anywhere" }}>
                          {selectedOrder.customer || "Ordine senza nome"}
                        </div>

                        <div style={{ marginTop: 6, color: "#66758b", fontSize: 13, overflowWrap: "anywhere" }}>
                          {fmtDate(selectedOrder.date)} · ID ordine {selectedOrder.id}
                        </div>

                        <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                          <span
                            style={badgeStyle(paymentBadgeFor(selectedOrder, gestionale).kind)}
                            title={paymentBadgeFor(selectedOrder, gestionale).auto ? "Calcolato in automatico dallo scaduto TeamSystem. I bottoni OK/KO lo sovrascrivono; ri-cliccando il bottone attivo si torna all'automatico." : undefined}
                          >
                            {paymentBadgeFor(selectedOrder, gestionale).label}
                          </span>
                          {(() => {
                            const a = anagraficaFor(selectedOrder);
                            // Sempre cliccabile: l'anagrafica si deve poter
                            // correggere anche quando e' completa (telefono
                            // cambiato, orario nuovo, pagamento diverso).
                            return (
                              <span
                                style={{ ...badgeStyle(a.stato === "ok" ? "success" : a.stato === "ko" ? "danger" : "outline"), cursor: "pointer" }}
                                onClick={() => openCompletaAnagrafica(selectedOrder)}
                                title="Clicca per vedere e modificare l'anagrafica"
                              >
                                {a.label}
                              </span>
                            );
                          })()}
                          {(() => {
                            const a = anagraficaFor(selectedOrder);
                            const completa = a.stato === "ok";
                            return (
                              <button
                                style={compactBtnStyle(completa ? "outline" : "primary")}
                                onClick={() => openCompletaAnagrafica(selectedOrder)}
                                title={completa ? "Vedi e modifica l'anagrafica del cliente" : "Inserisci i dati mancanti dell'anagrafica"}
                              >
                                {completa ? <Pencil size={16} /> : <Plus size={16} />}
                                {completa ? " Anagrafica" : " Completa anagrafica"}
                              </button>
                            );
                          })()}
                          {(() => {
                            const t = tipologiaFor(selectedOrder);
                            const chiave = clientKeyFor(selectedOrder);
                            const busy = savingOverride === chiave;
                            if (t) {
                              return (
                                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                  <span style={badgeStyle("dark")} title="Tipologia cliente">🏷️ {t}</span>
                                  {TIPOLOGIE.filter((x) => x !== t).map((x) => (
                                    <button
                                      key={x}
                                      style={compactBtnStyle("outline", busy)}
                                      disabled={busy}
                                      onClick={() => assignTipologia(selectedOrder, x)}
                                      title={"Cambia in " + x}
                                    >
                                      {x}
                                    </button>
                                  ))}
                                </span>
                              );
                            }
                            return (
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                <span style={{ color: "#66758b", fontSize: 13, fontWeight: 700 }}>Tipologia:</span>
                                {TIPOLOGIE.map((x) => (
                                  <button
                                    key={x}
                                    style={compactBtnStyle("dark", busy)}
                                    disabled={busy}
                                    onClick={() => assignTipologia(selectedOrder, x)}
                                    title={"Assegna " + x}
                                  >
                                    {x}
                                  </button>
                                ))}
                              </span>
                            );
                          })()}
                          {isAdmin ? (
                            <div style={{ display: "flex", gap: 8 }}>
                              <button
                                style={compactBtnStyle(
                                  selectedOrder.paymentStatus === "ok" ? "success" : "outline",
                                  savingPaymentOrderId === String(selectedOrder.id)
                                )}
                                disabled={savingPaymentOrderId === String(selectedOrder.id)}
                                onClick={() => setOrderPayment(selectedOrder.id, "ok")}
                                title="Segna pagamento OK"
                              >
                                <ThumbsUp size={16} /> OK
                              </button>
                              <button
                                style={compactBtnStyle(
                                  selectedOrder.paymentStatus === "ko" ? "danger" : "outline",
                                  savingPaymentOrderId === String(selectedOrder.id)
                                )}
                                disabled={savingPaymentOrderId === String(selectedOrder.id)}
                                onClick={() => setOrderPayment(selectedOrder.id, "ko")}
                                title="Segna pagamento non ricevuto"
                              >
                                <ThumbsDown size={16} /> KO
                              </button>
                            </div>
                          ) : null}
                        </div>

                        {/* Stesso cliente con un altro ordine in uscita oggi:
                            due documenti e due spedizioni. Si uniscono. */}
                        {(() => {
                          const gemelli = ordiniUnibiliCon(selectedOrder);
                          if (!gemelli.length) return null;
                          return (
                            <div
                              style={{
                                marginTop: 12,
                                padding: "12px 14px",
                                borderRadius: 14,
                                background: "#fff7ed",
                                border: "1px solid #fdba74",
                                display: "flex",
                                gap: 12,
                                alignItems: "center",
                                justifyContent: "space-between",
                                flexWrap: "wrap",
                              }}
                            >
                              <div style={{ minWidth: 0, color: "#9a3412", fontSize: 13, lineHeight: 1.45 }}>
                                <b>
                                  Questo cliente ha {gemelli.length === 1 ? "un altro ordine" : gemelli.length + " altri ordini"} in
                                  uscita {fmtDate(selectedOrder.date)}
                                </b>
                                <div style={{ marginTop: 2 }}>
                                  {gemelli
                                    .map((g) => {
                                      const n = g.lines?.length || 0;
                                      return `${g.id} (${n} ${n === 1 ? "riga" : "righe"})`;
                                    })
                                    .join(" · ")}
                                  . Unendoli fai <b>un solo documento e una sola spedizione</b>.
                                </div>
                              </div>
                              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                {gemelli.map((g) => (
                                  <button
                                    key={g.id}
                                    style={compactBtnStyle("warning")}
                                    onClick={() => unisciOrdine(g, selectedOrder)}
                                    title={`Sposta le righe di ${g.id} in questo ordine`}
                                  >
                                    ⇢ Unisci {gemelli.length > 1 ? g.id : "ordine"}
                                  </button>
                                ))}
                              </div>
                            </div>
                          );
                        })()}

                        <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                          <button
                            onClick={() => setTransportModalOrderId(String(selectedOrder.id))}
                            style={{
                              ...badgeStyle(transportBadgeInfo(selectedOrder.transport).kind),
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                              cursor: "pointer",
                            }}
                            title="Vedi opzioni corriere, tempi e costi"
                          >
                            <Truck size={14} /> {transportBadgeInfo(selectedOrder.transport).label}
                          </button>
                          {selectedOrder.transport && !selectedOrder.transport.errore ? (
                            <span style={{ color: "#8595a8", fontSize: 12 }}>
                              {temperaturaLabel(selectedOrder.temperatura)} · {selectedOrder.transport.consigliato.giorni} gg
                            </span>
                          ) : null}
                        </div>

                        {selectedOrder.notes ? (
                          <div
                            style={{
                              marginTop: 12,
                              padding: 12,
                              borderRadius: 16,
                              background: "#f8fafc",
                              border: "1px solid #e5edf6",
                              color: "#40516a",
                              lineHeight: 1.45,
                              whiteSpace: "pre-wrap",
                            }}
                          >
                            {selectedOrder.notes}
                          </div>
                        ) : null}

                        <div
                          style={{
                            marginTop: 12,
                            padding: 12,
                            borderRadius: 16,
                            background: "#eef6ff",
                            border: "1px solid #d3e6fb",
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            flexWrap: "wrap",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <Boxes size={18} style={{ color: "#1d6fd0" }} />
                            <span style={{ fontWeight: 800, color: "#0f3b73" }}>Colli</span>
                          </div>

                          <input
                            type="number"
                            min={0}
                            step={1}
                            style={{
                              ...inputStyle(),
                              width: 90,
                              padding: "8px 10px",
                              fontWeight: 800,
                              fontSize: 18,
                              textAlign: "center",
                            }}
                            value={
                              colliDrafts[selectedOrder.id] !== undefined
                                ? colliDrafts[selectedOrder.id]
                                : String(selectedOrder.colli)
                            }
                            onChange={(event) =>
                              setColliDrafts((prev) => ({
                                ...prev,
                                [selectedOrder.id]: event.target.value,
                              }))
                            }
                          />

                          <span style={{ color: "#5b6b82", fontSize: 13 }}>
                            suggerito {selectedOrder.colliSuggested}
                            {selectedOrder.colliIsManual ? " · modificato a mano" : ""}
                          </span>

                          <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
                            <button
                              style={btnStyle("primary", savingColliOrderId === String(selectedOrder.id))}
                              disabled={savingColliOrderId === String(selectedOrder.id)}
                              onClick={() =>
                                saveOrderColli(
                                  selectedOrder.id,
                                  colliDrafts[selectedOrder.id] !== undefined
                                    ? colliDrafts[selectedOrder.id]
                                    : String(selectedOrder.colli)
                                )
                              }
                            >
                              {savingColliOrderId === String(selectedOrder.id) ? "Salvo..." : "Salva colli"}
                            </button>

                            {selectedOrder.colliIsManual ? (
                              <button
                                style={btnStyle("outline")}
                                disabled={savingColliOrderId === String(selectedOrder.id)}
                                onClick={() => saveOrderColli(selectedOrder.id, "")}
                              >
                                Usa suggerito
                              </button>
                            ) : null}
                          </div>
                        </div>

                        <div
                          style={{
                            marginTop: 12,
                            padding: 12,
                            borderRadius: 16,
                            background: "#f0fdf4",
                            border: "1px solid #bbf7d0",
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            flexWrap: "wrap",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <Package size={18} style={{ color: "#15803d" }} />
                            <span style={{ fontWeight: 800, color: "#14532d" }}>Peso totale</span>
                          </div>
                          <span style={{ fontSize: 20, fontWeight: 950, color: "#14532d" }}>
                            {fmtKg(selectedOrder.pesoTotale)} kg
                          </span>
                          <span style={{ color: "#5b6b82", fontSize: 13, marginLeft: "auto" }}>
                            {selectedOrder.colli} colli
                          </span>
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                        {isAdmin ? (
                          <>
                            <button style={btnStyle("outline")} onClick={openEditOrderDialog}>
                              <Pencil size={16} /> Modifica
                            </button>

                            <button style={btnStyle("primary")} onClick={openAddLineDialog}>
                              <Plus size={16} /> Riga
                            </button>

                          </>
                        ) : (
                          // Meglio un bottone che spiega di un bottone che sparisce.
                          <button
                            style={{ ...btnStyle("soft"), opacity: 0.85 }}
                            title="Modificare le righe richiede la modalita' Admin"
                            onClick={() => setAdminDialogOpen(true)}
                          >
                            <Plus size={16} /> Riga · sblocca con Admin
                          </button>
                        )}

                        {String(selectedOrder.status || "").trim().toLowerCase() !== "preparato" ? (
                          <button style={btnStyle("warning")} onClick={markOrderStopped}>
                            <AlertTriangle size={16} /> Fermo
                          </button>
                        ) : null}

                        <button style={btnStyle("outline")} onClick={() => deleteOrder(selectedOrder.id)}>
                          <Trash2 size={16} /> Elimina ordine
                        </button>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "grid", gap: 10, minWidth: 0 }}>
                    {selectedOrderLines.map((line) => {
                      const product = productMap[String(line.productId)];
                      const lineAssignments = assignments[line.lineId] || [];
                      const availableLots = getAvailableLotsForLine(line);
                      const form = getInlineAssignmentForm(line.lineId);
                      const savingThisLine = savingAssignmentLineId === String(line.lineId);
                      const completed = line.qtyToAssign <= 0;

                      return (
                        <div
                          key={line.lineId}
                          style={{
                            ...cardStyle({
                              background: completed ? "linear-gradient(135deg, #f8fff9, #ffffff)" : "#fff",
                            }),
                            padding: isSmallLayout ? 14 : 16,
                            border: completed ? "1px solid #bfe7c8" : "1px solid #dbe2ea",
                            borderLeft: completed ? "6px solid #16a34a" : "6px solid #f59e0b",
                            boxShadow: completed ? "0 8px 18px rgba(22,163,74,0.07)" : "0 8px 18px rgba(245,158,11,0.07)",
                          }}
                        >
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: isOrderRowWide
                                ? "minmax(220px, 1.1fr) 180px minmax(300px, 1.4fr)"
                                : "1fr",
                              gap: 12,
                              alignItems: "center",
                            }}
                          >
                            <div style={{ minWidth: 0 }}>
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 8,
                                  flexWrap: "wrap",
                                  marginBottom: 3,
                                }}
                              >
                                <span style={{ fontSize: 17, fontWeight: 950, color: "#07153a" }}>
                                  {isOutsideStockLine(line) ? "FUORI MAGAZZINO" : product?.code || line.productId}
                                </span>
                                {isOutsideStockLine(line) ? (
                                  <span style={{ ...badgeStyle("warning"), padding: "4px 9px", fontSize: 12 }}>
                                    Articolo libero
                                  </span>
                                ) : null}
                                {completed ? (
                                  <span
                                    style={{
                                      ...badgeStyle("success"),
                                      padding: "4px 9px",
                                      fontSize: 12,
                                      color: "#166534",
                                    }}
                                  >
                                    Completa
                                  </span>
                                ) : null}
                              </div>

                              <div
                                style={{
                                  color: "#55657a",
                                  fontSize: 14,
                                  lineHeight: 1.25,
                                  overflowWrap: "anywhere",
                                }}
                              >
                                {isOutsideStockLine(line) ? line.productName : product?.name}
                              </div>
                            </div>

                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns: "repeat(3, 1fr)",
                                gap: 6,
                              }}
                            >
                              <div
                                style={{
                                  ...miniStatStyle("neutral"),
                                }}
                              >
                                <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 700 }}>
                                  Ord.
                                </div>
                                <div style={{ fontSize: 17, fontWeight: 900 }}>{line.qtyOrdered}</div>
                              </div>

                              <div
                                style={{
                                  ...miniStatStyle("neutral"),
                                }}
                              >
                                <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 700 }}>
                                  Ass.
                                </div>
                                <div style={{ fontSize: 17, fontWeight: 900 }}>{line.assignedQty}</div>
                              </div>

                              <div
                                style={{
                                  ...miniStatStyle(completed ? "success" : "warning"),
                                }}
                              >
                                <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 700 }}>
                                  Res.
                                </div>
                                <div
                                  style={{
                                    fontSize: 17,
                                    fontWeight: 900,
                                    color: completed ? "#166534" : "#a16207",
                                  }}
                                >
                                  {line.qtyToAssign}
                                </div>
                              </div>
                            </div>

                            <div style={{ minWidth: 0 }}>
                              {completed ? (
                                <div
                                  style={{
                                    display: "grid",
                                    gridTemplateColumns: isSmallLayout ? "1fr" : "minmax(0, 1fr) auto",
                                    alignItems: "center",
                                    gap: 8,
                                    minWidth: 0,
                                    width: "100%",
                                  }}
                                >
                                  <span
                                    style={{
                                      color: "#166534",
                                      fontWeight: 800,
                                      fontSize: 14,
                                      minWidth: 0,
                                      overflowWrap: "anywhere",
                                      lineHeight: 1.25,
                                    }}
                                  >
                                    {line.requiresLots === false
                                      ? "Quantità assegnata"
                                      : "Quantità completata"}
                                  </span>
                                  {(isAdmin || line.requiresLots === false) ? (
                                    <div
                                      style={{
                                        display: "flex",
                                        gap: 8,
                                        width: isSmallLayout ? "100%" : "auto",
                                      }}
                                    >
                                      {isAdmin ? (
                                        <button
                                          style={{
                                            ...compactBtnStyle("outline"),
                                            width: isSmallLayout ? "100%" : "auto",
                                          }}
                                          onClick={() => openEditLineDialog(line)}
                                        >
                                          Qtà
                                        </button>
                                      ) : null}

                                      <button
                                        style={{
                                          ...compactBtnStyle("outline"),
                                          width: isSmallLayout ? "100%" : "auto",
                                        }}
                                        onClick={() => deleteLine(selectedOrder.id, line.lineId)}
                                      >
                                        <Trash2 size={15} /> Riga
                                      </button>
                                    </div>
                                  ) : null}
                                </div>
                              ) : !line.requiresLots && !line.lotOptional ? (
                                <div
                                  style={{
                                    display: "grid",
                                    gridTemplateColumns: isIPadLayout ? "1fr" : "minmax(0, 1fr) 76px 96px 92px",
                                    gap: 8,
                                    alignItems: "center",
                                  }}
                                >
                                  <div
                                    style={{
                                      ...compactInputStyle(),
                                      display: "flex",
                                      alignItems: "center",
                                      color: "#40516a",
                                      fontWeight: 800,
                                      minWidth: 0,
                                    }}
                                  >
                                    {isOutsideStockLine(line)
                                      ? "Fuori magazzino"
                                      : "Lotto DISPONIBILITA"}
                                  </div>

                                  <input
                                    style={{ ...compactInputStyle(), minWidth: 0 }}
                                    type="number"
                                    min="1"
                                    value={form.qty}
                                    onChange={(event) =>
                                      updateInlineAssignmentForm(
                                        line.lineId,
                                        "qty",
                                        event.target.value
                                      )
                                    }
                                    placeholder="Qtà"
                                  />

                                  <button
                                    style={{
                                      ...compactBtnStyle("primary", savingThisLine),
                                      minWidth: 0,
                                      width: "100%",
                                    }}
                                    disabled={savingThisLine}
                                    onClick={() => confirmInlineAssignment(line)}
                                  >
                                    {savingThisLine ? "Salvo..." : "Assegna"}
                                  </button>

                                  <button
                                    style={{
                                      ...compactBtnStyle("outline"),
                                      minWidth: 0,
                                      width: "100%",
                                    }}
                                    onClick={() => deleteLine(selectedOrder.id, line.lineId)}
                                  >
                                    <Trash2 size={15} /> Riga
                                  </button>
                                </div>
                              ) : availableLots.length === 0 && line.lotOptional ? (
                                <div
                                  style={{
                                    display: "grid",
                                    gridTemplateColumns: isIPadLayout ? "1fr" : "minmax(0, 1fr) 76px 96px 92px",
                                    gap: 8,
                                    alignItems: "center",
                                  }}
                                >
                                  <div
                                    style={{
                                      ...compactInputStyle(),
                                      display: "flex",
                                      alignItems: "center",
                                      color: "#40516a",
                                      fontWeight: 800,
                                      minWidth: 0,
                                    }}
                                  >
                                    Senza lotto
                                  </div>

                                  <input
                                    style={{ ...compactInputStyle(), minWidth: 0 }}
                                    type="number"
                                    min="1"
                                    value={form.qty}
                                    onChange={(event) =>
                                      updateInlineAssignmentForm(
                                        line.lineId,
                                        "qty",
                                        event.target.value
                                      )
                                    }
                                    placeholder="Qtà"
                                  />

                                  <button
                                    style={{
                                      ...compactBtnStyle("primary", savingThisLine),
                                      minWidth: 0,
                                      width: "100%",
                                    }}
                                    disabled={savingThisLine}
                                    onClick={() => confirmInlineAssignment(line)}
                                  >
                                    {savingThisLine ? "Salvo..." : "Assegna"}
                                  </button>

                                  <button
                                    style={{
                                      ...compactBtnStyle("outline"),
                                      minWidth: 0,
                                      width: "100%",
                                    }}
                                    onClick={() => deleteLine(selectedOrder.id, line.lineId)}
                                  >
                                    <Trash2 size={15} /> Riga
                                  </button>
                                </div>
                              ) : availableLots.length === 0 ? (
                                <div
                                  style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    gap: 8,
                                    flexWrap: "wrap",
                                  }}
                                >
                                  <span style={{ color: "#b45309", fontWeight: 800, fontSize: 14 }}>
                                    Nessun lotto disponibile
                                  </span>
                                  {isAdmin ? (
                                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                      <button
                                        style={compactBtnStyle("outline")}
                                        onClick={() => openEditLineDialog(line)}
                                      >
                                        Qtà
                                      </button>

                                      <button
                                        style={compactBtnStyle("outline")}
                                        onClick={() => deleteLine(selectedOrder.id, line.lineId)}
                                      >
                                        <Trash2 size={15} /> Riga
                                      </button>
                                    </div>
                                  ) : null}
                                </div>
                              ) : (
                                <div
                                  style={{
                                    display: "grid",
                                    gridTemplateColumns: isIPadLayout ? "1fr" : "minmax(0, 1fr) 76px 96px",
                                    gap: 8,
                                    alignItems: "center",
                                  }}
                                >
                                  <div style={{ display: "grid", gap: 4, minWidth: 0 }}>
                                    <select
                                      style={{ ...compactInputStyle(), minWidth: 0 }}
                                      value={form.lotId}
                                      onChange={(event) =>
                                        handleInlineLotSelect(line, event.target.value)
                                      }
                                    >
                                      <option value="">{line.lotOptional ? "Senza lotto" : "Lotto"}</option>
                                      {availableLots.map((lot) => {
                                        const info = lotAssignedMap[String(lot.id)] || {};
                                        const disp = Number(info.assignable ?? 0);
                                        const giac = Number(info.total || 0);
                                        return (
                                          <option key={lot.id} value={String(lot.id)}>
                                            {lot.lot} · scad. {fmtDate(lot.expiry)} · disp. {disp}
                                            {disp === 0 && giac > 0 ? ` (giac. ${giac})` : ""}
                                          </option>
                                        );
                                      })}
                                    </select>
                                    {!isOutsideStockLine(line) ? (
                                      <button
                                        type="button"
                                        style={{
                                          background: "#eef2ff",
                                          border: "1px dashed #6366f1",
                                          color: "#3730a3",
                                          fontSize: 12,
                                          fontWeight: 900,
                                          padding: "6px 10px",
                                          cursor: "pointer",
                                          textAlign: "center",
                                          borderRadius: 8,
                                          width: "100%",
                                        }}
                                        onClick={() => openLotOnFlyDialog(line)}
                                        title="Crea un lotto nuovo al volo (giacenza in negativo)"
                                      >
                                        + Crea lotto al volo
                                      </button>
                                    ) : null}
                                  </div>

                                  <input
                                    style={{ ...compactInputStyle(), minWidth: 0 }}
                                    type="number"
                                    min="1"
                                    value={form.qty}
                                    onChange={(event) =>
                                      updateInlineAssignmentForm(
                                        line.lineId,
                                        "qty",
                                        event.target.value
                                      )
                                    }
                                    placeholder="Qtà"
                                  />

                                  <div
                                    style={{
                                      display: "flex",
                                      gap: 8,
                                      justifyContent: "stretch",
                                      minWidth: 0,
                                    }}
                                  >
                                    <button
                                      style={{
                                        ...compactBtnStyle("primary", savingThisLine),
                                        flex: 1,
                                        minWidth: 0,
                                        width: "100%",
                                      }}
                                      disabled={savingThisLine}
                                      onClick={() => confirmInlineAssignment(line)}
                                    >
                                      {savingThisLine ? "Salvo..." : "Assegna"}
                                    </button>

                                    {isAdmin ? (
                                      <>
                                        <button
                                          style={compactBtnStyle("outline")}
                                          onClick={() => openEditLineDialog(line)}
                                        >
                                          Qtà
                                        </button>

                                        <button
                                          style={compactBtnStyle("outline")}
                                          onClick={() => deleteLine(selectedOrder.id, line.lineId)}
                                        >
                                          <Trash2 size={15} />
                                        </button>
                                      </>
                                    ) : null}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>

                          {lineAssignments.length > 0 ? (
                            <div
                              style={{
                                marginTop: 10,
                                paddingTop: 10,
                                borderTop: "1px solid #e5e7eb",
                                display: "flex",
                                gap: 8,
                                alignItems: "center",
                                flexWrap: "wrap",
                              }}
                            >
                              <span style={{ color: "#66758b", fontSize: 13, fontWeight: 800 }}>
                                Assegnati:
                              </span>

                              {lineAssignments.map((assignment) => {
                                const lot = lots.find(
                                  (item) => String(item.id) === String(assignment.lotId)
                                );

                                return (
                                  <span
                                    key={assignment.assignmentId}
                                    style={{
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: 6,
                                      border: "1px solid #cfd8e6",
                                      background: "#fff",
                                      borderRadius: 999,
                                      padding: "5px 7px 5px 10px",
                                      fontSize: 13,
                                      fontWeight: 800,
                                    }}
                                  >
                                    {lot?.lot || assignment.lotId} x {assignment.qty}
                                    <button
                                      onClick={() =>
                                        deleteAssignment(line.lineId, assignment.assignmentId)
                                      }
                                      style={{
                                        border: "none",
                                        background: "transparent",
                                        cursor: "pointer",
                                        padding: 0,
                                        display: "inline-flex",
                                        alignItems: "center",
                                        color: "#991b1b",
                                      }}
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  </span>
                                );
                              })}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>

                  <div style={{ marginTop: 18, display: "flex", justifyContent: "flex-end" }}>
                    {String(selectedOrder.status || "").trim().toLowerCase() === "preparato" ? (
                      <button style={btnStyle("success", true)} disabled>
                        <CheckCircle2 size={18} /> Pronto
                      </button>
                    ) : selectedOrder.totalToAssign === 0 ? (
                      <button
                        style={btnStyle("success", savingPreparedOrderId === String(selectedOrder.id))}
                        disabled={savingPreparedOrderId === String(selectedOrder.id)}
                        onClick={markOrderPrepared}
                      >
                        <CheckCircle2 size={18} />
                        {savingPreparedOrderId === String(selectedOrder.id)
                          ? "Salvataggio..."
                          : "Segna pronto"}
                      </button>
                    ) : (
                      <button style={btnStyle("outline", true)} disabled>
                        <Clock size={18} /> Completa i lotti
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <div style={{ color: "#66758b" }}>Seleziona un ordine.</div>
              )}
            </div>
          </div>
        )}

        {page === "preparati" && (
          <div style={{ ...cardStyle(), padding: isSmallLayout ? 16 : 20 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                alignItems: "center",
                flexWrap: "wrap",
                marginBottom: 18,
              }}
            >
              <div>
                <div style={{ fontSize: 22, fontWeight: 900, color: "#07153a" }}>
                  {isProduzione ? "Ordini pronti" : "Ordini preparati non archiviati"}
                </div>
                <div style={{ marginTop: 4, color: "#66758b", fontSize: 14 }}>
                  {isProduzione
                    ? "Ordini pronti, in attesa che la logistica generi le etichette. Attacca le etichette, prepara le pedane e mettile pronte per la spedizione. Lo stato Spedito lo dà la logistica."
                    : "Qui trovi gli ordini già usciti/preparati. Puoi aprirli, controllare le righe e riaprirli per modificarli: se aggiungi una riga tornano da preparare."}
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button style={btnStyle("outline")} onClick={loadDataFromSheets}>
                  <RefreshCw size={18} /> Aggiorna
                </button>
                <button style={btnStyle("primary")} onClick={() => azioneUnica("archivia-tutti", archiveAllPreparedOrders)}>
                  <Archive size={18} /> Archivia preparati
                </button>
              </div>
            </div>

            <div style={{ position: "relative", marginBottom: 18 }}>
              <Search
                size={16}
                style={{ position: "absolute", left: 14, top: 18, color: "#97a3b6" }}
              />

              <input
                style={{ ...inputStyle(), paddingLeft: 40 }}
                value={orderSearch}
                onChange={(event) => setOrderSearch(event.target.value)}
                placeholder="Cerca ordine preparato per cliente, note o ID"
              />
            </div>

            <div style={{ display: "grid", gap: 12 }}>
              {preparedOrders.length === 0 ? (
                <div style={{ color: "#66758b" }}>Nessun ordine preparato non archiviato.</div>
              ) : (
                preparedOrders.map((order) => {
                  const expanded = !!expandedPreparedOrders[String(order.id)];

                  return (
                    <div
                      key={order.id}
                      style={{
                        ...cardStyle({ background: "linear-gradient(135deg, #eefbf2, #ffffff)" }),
                        padding: 16,
                        borderLeft: "6px solid #22c55e",
                        display: "grid",
                        gap: 14,
                      }}
                    >
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: isSmallLayout ? "1fr" : "1fr auto",
                          gap: 12,
                          alignItems: "center",
                        }}
                      >
                        <div>
                          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                            <div style={{ fontSize: 19, fontWeight: 950, color: "#07153a" }}>
                              {order.customer || "Ordine senza nome"}
                            </div>
                            {order.computedStatus === "Spedito" ? (
                              <span style={badgeStyle("dark")}>🚚 SPEDITO{order.courier ? ` · ${order.courier}` : ""}</span>
                            ) : (
                              <span style={badgeStyle("success")}>Preparato</span>
                            )}
                            {order.ddtNumero ? <span style={badgeStyle("outline")}>{order.ddtNumero}</span> : null}
                            {order.daBollinare ? (
                              <span style={badgeStyle("warning")} title={"Da bollinare: " + order.righeDaBollinare.map((l) => l.productName).join(" · ")}>
                                🏷️ DA BOLLINARE
                              </span>
                            ) : null}
                            {order.transport && !order.transport.errore ? (
                              <button
                                style={{ ...badgeStyle(order.courier ? "dark" : "outline"), border: "1px solid #cfd8e6", cursor: "pointer" }}
                                onClick={() => setTransportModalOrderId(order.id)}
                                title="Opzioni trasporto: scegli il corriere"
                              >
                                {order.courier
                                  ? `${order.courier} ✓`
                                  : `${order.transport.consigliato.corriere} · ${fmtEur(order.transport.consigliato.totale)} €`}
                              </button>
                            ) : null}
                            {(() => {
                              const a = anagraficaFor(order);
                              return a.stato === "ko" ? (
                                <span style={badgeStyle("danger")} title={"Mancano: " + a.mancanti.join(", ")}>
                                  {a.label}
                                </span>
                              ) : null;
                            })()}
                          </div>

                          <div style={{ marginTop: 4, color: "#66758b", fontSize: 12 }}>
                            {fmtDate(order.dataPrepared || order.date)} · ID {order.id}
                          </div>

                          {order.notes ? (
                            <div style={{ marginTop: 8, color: "#40516a", fontSize: 13, lineHeight: 1.4 }}>
                              {order.notes}
                            </div>
                          ) : null}

                          <div style={{ marginTop: 8, color: "#66758b", fontSize: 13 }}>
                            {order.lines?.length || 0} righe
                          </div>

                          {/* Ultimo momento utile per mettere i prezzi: dopo va in
                              archivio e il documento parte a zero. */}
                          {!isProduzione ? (
                            <div style={{ marginTop: 10 }}>
                              <ValorizzazioneOrdine order={order} onSalvato={loadDataFromSheets} listini={listiniPrezzi} />
                            </div>
                          ) : null}

                          <div
                            style={{
                              marginTop: 10,
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              flexWrap: "wrap",
                            }}
                          >
                            <Boxes size={16} style={{ color: "#1d6fd0" }} />
                            <span style={{ fontWeight: 800, color: "#0f3b73", fontSize: 13 }}>Colli</span>
                            <input
                              type="number"
                              min={0}
                              step={1}
                              style={{
                                ...inputStyle(),
                                width: 76,
                                padding: "6px 8px",
                                fontWeight: 800,
                                textAlign: "center",
                              }}
                              value={
                                colliDrafts[order.id] !== undefined
                                  ? colliDrafts[order.id]
                                  : String(order.colli)
                              }
                              onChange={(event) =>
                                setColliDrafts((prev) => ({ ...prev, [order.id]: event.target.value }))
                              }
                            />
                            <button
                              style={btnStyle("primary", savingColliOrderId === String(order.id))}
                              disabled={savingColliOrderId === String(order.id)}
                              onClick={() =>
                                saveOrderColli(
                                  order.id,
                                  colliDrafts[order.id] !== undefined
                                    ? colliDrafts[order.id]
                                    : String(order.colli)
                                )
                              }
                            >
                              {savingColliOrderId === String(order.id) ? "Salvo..." : "Salva"}
                            </button>
                            <span style={{ color: "#5b6b82", fontSize: 12 }}>
                              suggerito {order.colliSuggested}
                            </span>
                          </div>
                        </div>

                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                          <button style={btnStyle("outline")} onClick={() => togglePreparedDetails(order.id)}>
                            {expanded ? "Nascondi" : "Apri"} dettagli
                          </button>

                          <button style={btnStyle("warning")} onClick={() => reopenPreparedOrderForEditing(order.id)}>
                            <Pencil size={16} /> Modifica
                          </button>

                          {order.computedStatus !== "Spedito" ? (
                            <button
                              style={btnStyle("success")}
                              onClick={() => markOrderShipped(order)}
                              title={order.courier ? `Corriere: ${order.courier}` : order.transport?.consigliato ? `Corriere consigliato: ${order.transport.consigliato.corriere}` : "Nessun corriere selezionato"}
                            >
                              🚚 Spedito
                            </button>
                          ) : null}

                          <button
                            style={btnStyle("outline")}
                            onClick={() => generaDDT(order)}
                            title={order.ddtNumero ? `Ristampa ${order.ddtNumero}` : "Genera Documento di Trasporto"}
                          >
                            📄 {order.ddtNumero ? "Ristampa DDT" : "Genera DDT"}
                          </button>

                          <button style={btnStyle("primary")} onClick={() => archivePreparedOrder(order.id)}>
                            <Archive size={16} /> Archivia
                          </button>
                        </div>
                      </div>

                      {expanded ? (
                        <div
                          style={{
                            borderTop: "1px solid #dbeafe",
                            paddingTop: 14,
                            display: "grid",
                            gap: 10,
                          }}
                        >
                          {(order.lines || []).map((line) => {
                            const product = productMap[String(line.productId)];
                            const lineAssignments = assignments[line.lineId] || [];

                            return (
                              <div
                                key={line.lineId}
                                style={{
                                  ...cardStyle({ background: "#fff" }),
                                  padding: 12,
                                  display: "grid",
                                  gap: 8,
                                }}
                              >
                                <div
                                  style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    gap: 12,
                                    flexWrap: "wrap",
                                    alignItems: "center",
                                  }}
                                >
                                  <div>
                                    <div style={{ fontWeight: 950, color: "#07153a" }}>
                                      {isOutsideStockLine(line)
                                        ? line.productName
                                        : product?.name || line.productName || line.productId}
                                    </div>
                                    <div style={{ marginTop: 3, color: "#66758b", fontSize: 12 }}>
                                      {isOutsideStockLine(line)
                                        ? "FUORI MAGAZZINO"
                                        : product?.code || line.productId}
                                    </div>
                                  </div>

                                  <span style={badgeStyle("outline")}>
                                    Ordinati {Number(line.qtyOrdered || 0)}
                                  </span>
                                </div>

                                {lineAssignments.length > 0 ? (
                                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                    {lineAssignments.map((assignment) => {
                                      const assignedLot = lots.find(
                                        (lot) => String(lot.id) === String(assignment.lotId)
                                      );

                                      return (
                                        <span key={assignment.assignmentId} style={badgeStyle("success")}>
                                          {assignedLot?.lot || assignment.lotId} · {Number(assignment.qty || 0)}
                                        </span>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  <div style={{ color: "#66758b", fontSize: 13 }}>
                                    Nessuna assegnazione lotto collegata a questa riga.
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {page === "fermi" && (
          <div style={{ ...cardStyle(), padding: isSmallLayout ? 16 : 20 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                alignItems: "center",
                flexWrap: "wrap",
                marginBottom: 18,
              }}
            >
              <div>
                <div style={{ fontSize: 22, fontWeight: 900, color: "#07153a" }}>
                  Ordini fermi
                </div>
                <div style={{ marginTop: 4, color: "#66758b", fontSize: 14 }}>
                  Ordini bloccati per mancanze, problemi o verifiche prima dell’evasione.
                </div>
              </div>

              <button style={btnStyle("outline")} onClick={loadDataFromSheets}>
                <RefreshCw size={18} /> Aggiorna
              </button>
            </div>

            <div style={{ position: "relative", marginBottom: 18 }}>
              <Search
                size={16}
                style={{ position: "absolute", left: 14, top: 18, color: "#97a3b6" }}
              />

              <input
                style={{ ...inputStyle(), paddingLeft: 40 }}
                value={orderSearch}
                onChange={(event) => setOrderSearch(event.target.value)}
                placeholder="Cerca ordine fermo per cliente, note o ID"
              />
            </div>

            <div style={{ display: "grid", gap: 12 }}>
              {stoppedOrders.length === 0 ? (
                <div style={{ color: "#66758b" }}>Nessun ordine fermo.</div>
              ) : (
                stoppedOrders.map((order) => (
                  <div
                    key={order.id}
                    style={{
                      ...cardStyle({ background: "linear-gradient(135deg, #fff7ed, #ffffff)" }),
                      padding: 16,
                      borderLeft: "6px solid #f59e0b",
                      display: "grid",
                      gridTemplateColumns: isSmallLayout ? "1fr" : "1fr auto",
                      gap: 12,
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <div style={{ fontSize: 19, fontWeight: 950, color: "#07153a" }}>
                          {order.customer || "Ordine senza nome"}
                        </div>
                        <span style={badgeStyle("warning")}>⛔ Fermo</span>
                        {order.daBollinare ? (
                          <span style={badgeStyle("warning")} title={"Da bollinare: " + order.righeDaBollinare.map((l) => l.productName).join(" · ")}>
                            🏷️ DA BOLLINARE
                          </span>
                        ) : null}
                      </div>

                      <div style={{ marginTop: 4, color: "#66758b", fontSize: 12 }}>
                        {fmtDate(order.date)} · ID {order.id}
                      </div>

                      {/* Perche' e' fermo: in evidenza, cliccabile per correggerlo. */}
                      <div
                        onClick={() => openEditMotivoFermo(order)}
                        title="Clicca per scrivere o correggere il motivo"
                        style={{
                          marginTop: 10,
                          padding: "10px 12px",
                          borderRadius: 12,
                          cursor: "pointer",
                          background: order.motivoFermo ? "#fffbeb" : "#fef2f2",
                          border: "1px solid " + (order.motivoFermo ? "#fcd34d" : "#fecaca"),
                          color: order.motivoFermo ? "#92400e" : "#b91c1c",
                          fontSize: 14,
                          fontWeight: 800,
                          lineHeight: 1.4,
                          overflowWrap: "anywhere",
                        }}
                      >
                        {order.motivoFermo
                          ? `Motivo: ${order.motivoFermo}`
                          : "⚠️ Motivo non indicato — clicca per scriverlo"}
                      </div>

                      {order.notes ? (
                        <div style={{ marginTop: 8, color: "#40516a", fontSize: 13, lineHeight: 1.4 }}>
                          {order.notes}
                        </div>
                      ) : null}

                      <div style={{ marginTop: 8, color: "#66758b", fontSize: 13 }}>
                        {order.lines?.length || 0} righe · {order.totalToAssign || 0} pezzi ancora da completare
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                      <button style={btnStyle("outline")} onClick={() => openEditMotivoFermo(order)}>
                        <Pencil size={16} /> Motivo
                      </button>
                      <button style={btnStyle("success")} onClick={() => restoreStoppedOrder(order.id)}>
                        <CheckCircle2 size={16} /> Riporta da preparare
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {page === "spediti" && (
          <div style={{ ...cardStyle(), padding: 20 }}>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 22, fontWeight: 800 }}>🚚 Ordini spediti</div>
              <div style={{ marginTop: 4, color: "#617086", fontSize: 14 }}>
                Gli ordini usciti, ciascuno col suo corriere. Restano qui finché non premi Archivia.
              </div>
            </div>

            {speditiOrders.length > 0 ? (
              <div
                style={{
                  ...cardStyle({ background: "linear-gradient(135deg, #f0fdf4, #ffffff)" }),
                  padding: 14,
                  marginBottom: 16,
                  display: "flex",
                  gap: 18,
                  flexWrap: "wrap",
                  fontWeight: 800,
                  color: "#14532d",
                }}
              >
                <span>{speditiOrders.length} {speditiOrders.length === 1 ? "ordine spedito" : "ordini spediti"}</span>
                <span>{speditiOrders.reduce((s, o) => s + Number(o.colli || 0), 0)} colli</span>
                <span>{fmtKg(speditiOrders.reduce((s, o) => s + Number(o.pesoTotale || 0), 0))} kg</span>
              </div>
            ) : null}

            {speditiOrders.length === 0 ? (
              <div style={{ color: "#66758b" }}>Nessun ordine spedito oggi.</div>
            ) : (
              <div style={{ display: "grid", gap: 12 }}>
                {speditiOrders.map((order) => (
                  <div
                    key={order.id}
                    style={{
                      ...cardStyle({ background: "linear-gradient(135deg, #f8fbff, #ffffff)" }),
                      padding: 16,
                      borderLeft: "6px solid #07153a",
                      display: "grid",
                      gridTemplateColumns: isSmallLayout ? "1fr" : "1fr auto",
                      gap: 12,
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <div style={{ fontSize: 18, fontWeight: 950, color: "#07153a" }}>
                          {order.customer || "Ordine senza nome"}
                        </div>
                        <span style={badgeStyle("dark")}>🚚 {order.courier || "spedito"}</span>
                        {order.ddtNumero ? <span style={badgeStyle("outline")}>{order.ddtNumero}</span> : null}
                        {order.daBollinare ? (
                          <span style={badgeStyle("warning")} title={"Da bollinare: " + order.righeDaBollinare.map((l) => l.productName).join(" · ")}>
                            🏷️ DA BOLLINARE
                          </span>
                        ) : null}
                      </div>
                      <div style={{ marginTop: 4, color: "#66758b", fontSize: 12 }}>
                        {fmtDate(order.dataPrepared || order.date)} · ID {order.id}
                      </div>
                      <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ ...badgeStyle("success"), display: "inline-flex", alignItems: "center", gap: 6 }}>
                          <Package size={13} /> {fmtKg(order.pesoTotale)} kg
                        </span>
                        <span style={badgeStyle("outline")}>{order.colli} colli</span>
                      </div>
                      {order.notes ? (
                        <div style={{ marginTop: 8, color: "#40516a", fontSize: 13, lineHeight: 1.4 }}>
                          {order.notes}
                        </div>
                      ) : null}
                    </div>

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                      <button
                        style={btnStyle("outline")}
                        onClick={() => reopenShippedOrder(order)}
                        title="Riporta l'ordine tra i preparati per modificarlo"
                      >
                        <RotateCcw size={16} /> Riporta in preparati
                      </button>
                      <button
                        style={btnStyle("outline")}
                        onClick={() => generaDDT(order)}
                        title={order.ddtNumero ? `Ristampa ${order.ddtNumero}` : "Genera Documento di Trasporto"}
                      >
                        📄 {order.ddtNumero ? "Ristampa DDT" : "Genera DDT"}
                      </button>
                      <button style={btnStyle("primary")} onClick={() => archivePreparedOrder(order.id)}>
                        <Archive size={16} /> Archivia
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {page === "foto-bolle" && (
          <div style={{ ...cardStyle(), padding: isSmallLayout ? 16 : 20, maxWidth: 640 }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: "#07153a" }}>
              📸 Foto bolle ricevute
            </div>
            <div style={{ marginTop: 4, color: "#66758b", fontSize: 14, lineHeight: 1.4 }}>
              Scatta la foto della bolla / DDT del fornitore appena arriva la merce. La mando all'ufficio acquisti, che la ritrova nella sua app pronta da verificare.
            </div>

            <div style={{ marginTop: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <label style={labelStyle()}>Abbina all'ordine in arrivo (da Acquisti)</label>
                <button style={compactBtnStyle("outline")} onClick={loadOrdiniArrivo} title="Aggiorna gli ordini in arrivo">
                  <RefreshCw size={14} /> Aggiorna
                </button>
              </div>
              {ordiniArrivo.length === 0 ? (
                <div style={{ ...cardStyle({ background: "#f8fafc" }), padding: 12, color: "#66758b", fontSize: 13, border: "1px solid #e5edf6" }}>
                  Nessun ordine fornitore in arrivo al momento. Puoi comunque inviare la foto: l'ufficio acquisti la abbina.
                </div>
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  {ordiniArrivo.map((o) => {
                    const sel = String(fotoOrdineId) === String(o.id);
                    return (
                      <div
                        key={o.id}
                        style={{
                          background: sel ? "#ecfdf5" : "#fff",
                          border: sel ? "2px solid #16a34a" : "1px solid #e2e8f0",
                          borderRadius: 12,
                          padding: "10px 12px",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: 10,
                          flexWrap: "wrap",
                        }}
                      >
                        <div
                          onClick={() => setFotoOrdineId(sel ? "" : o.id)}
                          style={{ minWidth: 0, flex: "1 1 180px", cursor: "pointer" }}
                        >
                          <div style={{ fontWeight: 900, color: "#07153a" }}>
                            {sel ? "✅ " : ""}{o.fornitore || o.fornitoreId}
                          </div>
                          <div style={{ color: "#66758b", fontSize: 12 }}>
                            {o.id} · {o.nRighe} {o.nRighe === 1 ? "riga" : "righe"}
                            {o.consegna ? " · consegna " + fmtDate(o.consegna) : ""}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <span style={badgeStyle(o.stato === "In consegna" ? "warning" : "outline")}>{o.stato}</span>
                          <label
                            style={{ ...compactBtnStyle("success"), cursor: "pointer" }}
                            title="Scatta la foto della bolla di questo ordine"
                          >
                            <Camera size={16} /> Scatta bolla
                            <input
                              type="file"
                              accept="image/*"
                              capture="environment"
                              style={{ display: "none" }}
                              onChange={(e) => {
                                setFotoOrdineId(o.id);
                                onBollaFile(e);
                              }}
                            />
                          </label>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {(() => {
                const o = ordiniArrivo.find((x) => String(x.id) === String(fotoOrdineId));
                if (!o) return null;
                return (
                  <div style={{ marginTop: 8, ...cardStyle({ background: "#f0fdf4" }), padding: 12, border: "1px solid #bbf7d0" }}>
                    <div style={{ fontWeight: 900, color: "#14532d", marginBottom: 6 }}>
                      Dettaglio ordine {o.id} · {o.fornitore || o.fornitoreId}
                    </div>
                    {o.righe && o.righe.length ? (
                      <div style={{ display: "grid", gap: 4 }}>
                        {o.righe.map((r, i) => (
                          <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#14532d", gap: 8 }}>
                            <span style={{ overflowWrap: "anywhere" }}>{r.articolo}</span>
                            <span style={{ whiteSpace: "nowrap", fontWeight: 800 }}>
                              {r.qta} {r.um}{r.prezzo != null ? ` · ${r.prezzo}€` : ""}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ color: "#4d7c5a", fontSize: 13 }}>Nessuna riga sull'ordine.</div>
                    )}
                    <div style={{ marginTop: 8, color: "#4d7c5a", fontSize: 12, lineHeight: 1.4 }}>
                      Confronta con quello che è arrivato. La foto viene inviata già abbinata a questo ordine: l'ufficio acquisti rileva in automatico le non conformità (quantità o prezzi diversi tra ordine e bolla).
                    </div>
                  </div>
                );
              })()}
            </div>

            <div style={{ marginTop: 18, display: "grid", gap: 14 }}>
              {bollaPreview ? (
                <div style={{ display: "grid", gap: 10 }}>
                  <img
                    src={bollaPreview}
                    alt="bolla"
                    style={{ width: "100%", borderRadius: 12, border: "1px solid #e5edf6" }}
                  />
                  <button style={btnStyle("outline")} onClick={() => setBollaPreview("")}>
                    <RotateCcw size={16} /> Rifai la foto
                  </button>
                </div>
              ) : (
                <label
                  style={{
                    ...btnStyle("primary"),
                    justifyContent: "center",
                    cursor: "pointer",
                    padding: 20,
                  }}
                >
                  <Camera size={20} /> Scatta la foto (merce senza ordine)
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(e) => {
                      setFotoOrdineId("");
                      onBollaFile(e);
                    }}
                    style={{ display: "none" }}
                  />
                </label>
              )}

              <div>
                <label style={labelStyle()}>Nota (facoltativa)</label>
                <input
                  style={inputStyle()}
                  value={bollaCaption}
                  onChange={(e) => setBollaCaption(e.target.value)}
                  placeholder="Es. fornitore o numero bolla"
                />
              </div>

              {fotoOrdineId ? (
                <div style={{ color: "#166534", fontSize: 13, fontWeight: 700 }}>
                  {(() => {
                    const o = ordiniArrivo.find((x) => String(x.id) === String(fotoOrdineId));
                    return o ? `Abbinata all'ordine ${o.id} · ${o.fornitore || o.fornitoreId}` : "";
                  })()}
                </div>
              ) : null}

              <button
                style={btnStyle("success", savingBolla)}
                disabled={savingBolla || !bollaPreview}
                onClick={inviaBolla}
              >
                <Plus size={18} /> {savingBolla ? "Invio..." : "Invia all'ufficio acquisti"}
              </button>

              {bolleInviate.length > 0 ? (
                <div style={{ ...cardStyle({ background: "#f0fdf4" }), padding: 12, border: "1px solid #bbf7d0" }}>
                  <div style={{ fontWeight: 900, color: "#14532d", marginBottom: 8 }}>
                    Inviate in questa sessione: {bolleInviate.length}
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {bolleInviate.map((b, i) => (
                      <img
                        key={i}
                        src={b.thumb}
                        alt="inviata"
                        title={b.caption || "bolla inviata"}
                        style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 8, border: "1px solid #86efac" }}
                      />
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <div style={{ marginTop: 22, borderTop: "1px solid #eef2f7", paddingTop: 18 }}>
              <div style={{ fontSize: 18, fontWeight: 900, color: "#07153a" }}>
                📦 Nuovi ordini → Ufficio acquisti
              </div>
              <div style={{ marginTop: 4, marginBottom: 12, color: "#66758b", fontSize: 13, lineHeight: 1.4 }}>
                Segnala qui la merce da riordinare: i messaggi arrivano direttamente all'ufficio acquisti, che può risponderti nello stesso filo. Puoi anche mandare un vocale.
              </div>
              <ChatPanel
                tabella="chat_nuovi_ordini"
                authUser={authUser}
                height="38vh"
                vuotoLabel="Nessun messaggio. Scrivi cosa serve riordinare."
              />
            </div>
          </div>
        )}

        {page === "archivio" && (
          <div style={{ ...cardStyle(), padding: isSmallLayout ? 16 : 20 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                alignItems: "center",
                flexWrap: "wrap",
                marginBottom: 18,
              }}
            >
              <div>
                <div style={{ fontSize: 22, fontWeight: 900, color: "#07153a" }}>Archivio ordini</div>
                <div style={{ marginTop: 4, color: "#66758b", fontSize: 14 }}>
                  Storico ordini (ultimi 500), caricato solo qui per tenere leggera l'app. {loadingArchive ? "Carico l'archivio…" : ""}
                </div>
              </div>

              <button style={btnStyle("outline", loadingArchive)} disabled={loadingArchive} onClick={loadArchivedOrders}>
                <RefreshCw size={18} /> {loadingArchive ? "Carico…" : "Aggiorna"}
              </button>
            </div>

            <div style={{ position: "relative", marginBottom: 18 }}>
              <Search
                size={16}
                style={{ position: "absolute", left: 14, top: 18, color: "#97a3b6" }}
              />

              <input
                style={{ ...inputStyle(), paddingLeft: 40 }}
                value={orderSearch}
                onChange={(event) => setOrderSearch(event.target.value)}
                placeholder="Cerca in archivio per nome, note o ID"
              />
            </div>

            <div style={{ display: "grid", gap: 16 }}>
              {Object.keys(archivedGroups).length === 0 ? (
                <div style={{ color: "#66758b" }}>
                  {loadingArchive ? "Carico l'archivio…" : "Nessun ordine archiviato."}
                </div>
              ) : (
                Object.entries(archivedGroups).map(([dateLabel, dayOrders]) => (
                  <div
                    key={dateLabel}
                    style={{
                      border: "1px solid #e5edf6",
                      borderRadius: 24,
                      overflow: "hidden",
                      background: "#fff",
                    }}
                  >
                    <div
                      style={{
                        padding: 16,
                        background: "#f8fafc",
                        borderBottom: "1px solid #e5edf6",
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 12,
                        alignItems: "center",
                      }}
                    >
                      <div style={{ fontWeight: 900, color: "#07153a" }}>{dateLabel}</div>
                      <div style={{ color: "#66758b", fontSize: 13 }}>
                        {dayOrders.length} ordini
                      </div>
                    </div>

                    <div style={{ display: "grid", gap: 10, padding: 14 }}>
                      {dayOrders.map((order) => (
                        <div
                          key={order.id}
                          style={{
                            ...cardStyle({ background: "linear-gradient(135deg, #ffffff, #fbfdff)" }),
                            padding: 16,
                            display: "grid",
                            gridTemplateColumns: isSmallLayout ? "1fr" : "1fr auto",
                            gap: 12,
                            alignItems: "center",
                          }}
                        >
                          <div>
                            <div style={{ fontSize: 18, fontWeight: 950, color: "#07153a" }}>
                              {order.customer || "Ordine senza nome"}
                            </div>
                            <div style={{ marginTop: 4, color: "#66758b", fontSize: 12 }}>
                              ID {order.id} · preparato {fmtDate(order.dataPrepared || order.date)}
                            </div>
                            {order.notes ? (
                              <div style={{ marginTop: 8, color: "#40516a", fontSize: 13, lineHeight: 1.4 }}>
                                {order.notes}
                              </div>
                            ) : null}
                            <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                              <span style={{ ...badgeStyle("success"), display: "inline-flex", alignItems: "center", gap: 6 }}>
                                <Package size={13} /> {fmtKg(order.pesoTotale)} kg
                              </span>
                              <span style={badgeStyle("outline")}>{order.colli} colli</span>
                            </div>
                          </div>

                          {/* Ordine UNITO in un altro: si separa, non si disarchivia
                              (le sue righe stanno sull'altro ordine). */}
                          {order.unitoIn ? (
                            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                              <span style={badgeStyle("warning")} title={"Le righe sono nell'ordine " + order.unitoIn}>
                                ⇢ unito in {order.unitoIn}
                              </span>
                              <button style={btnStyle("outline")} onClick={() => separaOrdine(order)}>
                                <RotateCcw size={16} /> Separa
                              </button>
                            </div>
                          ) : (
                            /* Disarchiviare e' un'azione reversibile: sempre disponibile
                               (anche senza PIN admin). Si deve poter tornare indietro. */
                            <button style={btnStyle("outline")} onClick={() => unarchiveOrder(order.id)}>
                              <RotateCcw size={16} /> Disarchivia
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {page === "bollati" && (
          <div style={{ ...cardStyle(), padding: 20 }}>
            <div style={{ fontSize: 22, fontWeight: 800 }}>🏷️ Cartoni bollati</div>
            <div style={{ marginTop: 4, color: "#617086", fontSize: 14 }}>
              Lotti con meno di {GIORNI_BOLLATO} giorni di vita residua. Questa merce non si vende:
              l'app agenti la offre come <b>cartone bollato in omaggio</b> oltre i 10 cartoni ordinati.
              I lotti già scaduti sono segnati in rosso e vanno tolti, non regalati.
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "16px 0" }}>
              <span style={badgeStyle("outline")}>{bollatiTotali.lotti} lotti</span>
              <span style={badgeStyle("warning")}>{bollatiTotali.daRegalare} pz da regalare</span>
              {bollatiTotali.scaduti > 0 && (
                <span style={badgeStyle("danger")}>{bollatiTotali.scaduti} lotti scaduti</span>
              )}
            </div>

            {bollatiRows.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: "#617086" }}>
                Nessun lotto sotto i {GIORNI_BOLLATO} giorni. Niente da bollare.
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: "#617086" }}>
                      <th style={{ padding: "8px 6px" }}>Referenza</th>
                      <th style={{ padding: "8px 6px" }}>Codice</th>
                      <th style={{ padding: "8px 6px" }}>Lotto</th>
                      <th style={{ padding: "8px 6px" }}>Scadenza</th>
                      <th style={{ padding: "8px 6px", textAlign: "right" }}>Giorni</th>
                      <th style={{ padding: "8px 6px", textAlign: "right" }}>Disponibili</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bollatiRows.map((r) => (
                      <tr key={r.lotId} style={{ borderTop: "1px solid #eef1f6", background: r.scaduto ? "#fff1f2" : "transparent" }}>
                        <td style={{ padding: "8px 6px", fontWeight: 700 }}>{r.productName}</td>
                        <td style={{ padding: "8px 6px", color: "#617086" }}>{r.productCode}</td>
                        <td style={{ padding: "8px 6px" }}>{r.lotCode}</td>
                        <td style={{ padding: "8px 6px" }}>{fmtDate(r.expiry)}</td>
                        <td style={{ padding: "8px 6px", textAlign: "right", fontWeight: 800, color: r.scaduto ? "#991b1b" : r.giorni <= 10 ? "#b45309" : "#243043" }}>
                          {r.scaduto ? "scaduto" : r.giorni}
                        </td>
                        <td style={{ padding: "8px 6px", textAlign: "right" }}>{r.disponibile}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {page === "magazzino" && (
          <div style={{ ...cardStyle(), padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 22, fontWeight: 800 }}>Magazzino a prima vista</div>
                <div style={{ marginTop: 4, color: "#617086", fontSize: 14 }}>
                  Tutti i prodotti a catalogo, anche a giacenza 0: totale complessivo + dettaglio per ciascun lotto. Disponibile negativa = da produrre.
                </div>
              </div>
              <button
                style={{
                  ...btnStyle("success"),
                  fontSize: 16,
                  height: 56,
                  padding: "0 22px",
                  boxShadow: "0 10px 22px rgba(22,163,74,0.22)",
                }}
                onClick={() => {
                  setProdProductId("");
                  setProdProductSearch("");
                  setProdCode("");
                  setProdExpiry("");
                  setProdQty("");
                  setProdTodayList([]);
                  setProdLoadOpen(true);
                }}
              >
                <Package size={20} /> Carico di produzione giornaliera
              </button>
            </div>

            <div style={{ position: "relative", marginBottom: 16, maxWidth: 420 }}>
              <Search
                size={16}
                style={{ position: "absolute", left: 14, top: 18, color: "#97a3b6" }}
              />
              <input
                style={{ ...inputStyle(), paddingLeft: 40 }}
                value={magazzinoSearch}
                onChange={(event) => setMagazzinoSearch(event.target.value)}
                placeholder="Cerca referenza, codice o lotto"
              />
            </div>

            {filteredMagazzinoGrouped.length === 0 ? (
              <div style={{ ...cardStyle({ background: "#fff7ed" }), padding: 18, color: "#b45309" }}>
                Nessun prodotto trovato.
              </div>
            ) : (
              <div style={{ display: "grid", gap: 0, border: "1px solid #e7ecf3", borderRadius: 12, overflow: "hidden" }}>
                {!isSmallLayout && (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(220px, 2.2fr) minmax(110px, 1fr) minmax(110px, 1fr) 90px 90px 110px",
                      gap: 10,
                      padding: "12px 16px",
                      background: "#07153a",
                      color: "#fff",
                      fontWeight: 800,
                      fontSize: 13,
                    }}
                  >
                    <div>Referenza</div>
                    <div>Lotto</div>
                    <div>Scadenza</div>
                    <div style={{ textAlign: "right" }}>Giacenza</div>
                    <div style={{ textAlign: "right" }}>Impegnato</div>
                    <div style={{ textAlign: "right" }}>Disponibile</div>
                  </div>
                )}

                {filteredMagazzinoGrouped.map((group, gIndex) => {
                  // Header categoria: appare solo quando la categoria cambia
                  // rispetto al gruppo precedente. Counter dei prodotti nella
                  // categoria mostrato a fianco.
                  const prevCategory = gIndex > 0 ? (filteredMagazzinoGrouped[gIndex - 1].category || "Senza categoria") : null;
                  const currentCategory = group.category || "Senza categoria";
                  const showCategoryHeader = prevCategory !== currentCategory;
                  const productsInCategory = filteredMagazzinoGrouped.filter(
                    (g) => (g.category || "Senza categoria") === currentCategory
                  ).length;
                  return (
                  <React.Fragment key={`${group.productId}-${gIndex}`}>
                    {showCategoryHeader && (
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr",
                          padding: "14px 16px 10px",
                          background: "#07153a",
                          color: "#fff",
                          fontWeight: 900,
                          fontSize: 14,
                          letterSpacing: 0.4,
                          textTransform: "uppercase",
                          borderTop: gIndex === 0 ? "none" : "3px solid #c6d0e2",
                        }}
                      >
                        {currentCategory} · {productsInCategory} {productsInCategory === 1 ? "prodotto" : "prodotti"}
                      </div>
                    )}
                    {/* Riga prodotto: totali aggregati. Sfondo evidenziato. */}
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: isSmallLayout
                          ? "1fr auto"
                          : "minmax(220px, 2.2fr) minmax(110px, 1fr) minmax(110px, 1fr) 90px 90px 110px",
                        gap: 10,
                        padding: isSmallLayout ? "12px 14px" : "12px 16px",
                        alignItems: "center",
                        background: "#e8eef9",
                        borderTop: gIndex === 0 ? "none" : "2px solid #c6d0e2",
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 900, color: "#07153a", fontSize: 15 }}>{group.productName}</div>
                        <div style={{ fontSize: 12, color: "#5a6e90", marginTop: 2 }}>
                          {group.productCode}
                          {` · ${group.lots.length} ${group.lots.length === 1 ? "lotto" : "lotti"}`}
                          {isSmallLayout ? ` · Giac. ${group.totalLoaded} · Imp. ${group.totalCommitted}` : ""}
                        </div>
                        {/* Quanto di questo prodotto e' ancora vendibile a prezzo
                            pieno e quanto invece e' ormai da bollinare. */}
                        {(() => {
                          let pieno = 0, daBollinare = 0, scaduto = 0;
                          for (const l of group.lots) {
                            const b = bollinoScadenza(l.expiry, oggiMagazzinoMs);
                            const q = Number(l.available || 0);
                            if (q <= 0) continue;
                            if (b && b.tipo === "scaduto") scaduto += q;
                            else if (b && b.tipo === "bollato") daBollinare += q;
                            else pieno += q;
                          }
                          if (daBollinare === 0 && scaduto === 0) return null;
                          return (
                            <div style={{ marginTop: 5, display: "flex", gap: 6, flexWrap: "wrap" }}>
                              <span style={{ ...badgeStyle("success"), fontSize: 11, padding: "2px 8px" }}>
                                {pieno} a prezzo pieno
                              </span>
                              {daBollinare > 0 ? (
                                <span style={{ ...badgeStyle("danger"), fontSize: 11, padding: "2px 8px" }}>
                                  🏷️ {daBollinare} da bollinare
                                </span>
                              ) : null}
                              {scaduto > 0 ? (
                                <span style={{ ...badgeStyle("outline"), fontSize: 11, padding: "2px 8px" }}>
                                  ⛔ {scaduto} scaduti
                                </span>
                              ) : null}
                            </div>
                          );
                        })()}
                      </div>

                      {!isSmallLayout && <div />}
                      {!isSmallLayout && <div />}
                      {!isSmallLayout && (
                        <div style={{ textAlign: "right", color: "#07153a", fontWeight: 800 }}>{group.totalLoaded}</div>
                      )}
                      {!isSmallLayout && (
                        <div style={{ textAlign: "right", color: group.totalCommitted > 0 ? "#b45309" : "#9aa7b8", fontWeight: 800 }}>
                          {group.totalCommitted}
                        </div>
                      )}

                      <div
                        style={{
                          textAlign: "right",
                          fontWeight: 900,
                          fontSize: isSmallLayout ? 20 : 18,
                          color: group.totalAvailable > 0 ? "#0a7d34" : "#b91c1c",
                        }}
                      >
                        {group.totalAvailable}
                      </div>
                    </div>

                    {/* Righe lotto sotto al prodotto */}
                    {group.lots.map((row, index) => {
                      const bol = bollinoScadenza(row.expiry, oggiMagazzinoMs);
                      return (
                      <div
                        key={row.lotId}
                        style={{
                          display: "grid",
                          gridTemplateColumns: isSmallLayout
                            ? "1fr auto"
                            : "minmax(220px, 2.2fr) minmax(110px, 1fr) minmax(110px, 1fr) 90px 90px 110px",
                          gap: 10,
                          padding: isSmallLayout ? "10px 14px 10px 26px" : "10px 16px 10px 32px",
                          alignItems: "center",
                          // Sfondo ambra sui lotti da bollinare: si vedono al volo.
                          background: bol && bol.tipo !== "in-avvicinamento"
                            ? "#fff7ed"
                            : index % 2 === 0 ? "#fff" : "#f7f9fc",
                          borderTop: "1px solid #eef2f7",
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div style={{ color: "#3a4658", fontSize: 13, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                            <span>
                              ↳ Lotto {row.lotCode || "—"}
                              {row.expiry ? ` · Scad. ${row.expiry}` : ""}
                              {isSmallLayout ? ` · Giac. ${row.loaded} · Imp. ${row.committed}` : ""}
                            </span>
                            {bol ? (
                              <span
                                style={{ ...badgeStyle(bol.kind), fontSize: 11, padding: "2px 8px" }}
                                title={
                                  bol.tipo === "scaduto"
                                    ? "Lotto scaduto: va distrutto, non si regala"
                                    : bol.tipo === "bollato"
                                    ? "Sotto i 30 giorni: non si vende a prezzo pieno, si regala come omaggio"
                                    : "In avvicinamento ai 30 giorni: presto sarà da bollinare"
                                }
                              >
                                {bol.label}
                              </span>
                            ) : null}
                          </div>
                        </div>

                        {!isSmallLayout && <div style={{ color: "#3a4658" }}>{row.lotCode || "—"}</div>}
                        {!isSmallLayout && <div style={{ color: "#3a4658" }}>{row.expiry || "—"}</div>}
                        {!isSmallLayout && (
                          <div style={{ textAlign: "right", color: "#55657a" }}>{row.loaded}</div>
                        )}
                        {!isSmallLayout && (
                          <div style={{ textAlign: "right", color: row.committed > 0 ? "#b45309" : "#9aa7b8" }}>
                            {row.committed}
                          </div>
                        )}

                        <div
                          style={{
                            textAlign: "right",
                            fontWeight: 700,
                            fontSize: isSmallLayout ? 18 : 16,
                            color: row.available > 0 ? "#0a7d34" : "#b91c1c",
                          }}
                        >
                          {row.available}
                        </div>
                      </div>
                      );
                    })}
                  </React.Fragment>
                  );
                })}
              </div>
            )}

            {(() => {
              // Totale di fondo pagina: quanto del disponibile e' ancora
              // vendibile a prezzo pieno e quanto e' ormai da bollinare.
              let pieno = 0, daBollinare = 0, scaduto = 0;
              for (const g of filteredMagazzinoGrouped) {
                for (const l of g.lots) {
                  const q = Number(l.available || 0);
                  if (q <= 0) continue;
                  const b = bollinoScadenza(l.expiry, oggiMagazzinoMs);
                  if (b && b.tipo === "scaduto") scaduto += q;
                  else if (b && b.tipo === "bollato") daBollinare += q;
                  else pieno += q;
                }
              }
              return (
                <div style={{ marginTop: 14, color: "#617086", fontSize: 13, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                  <span>
                    {filteredMagazzinoGrouped.length} {filteredMagazzinoGrouped.length === 1 ? "prodotto" : "prodotti"} ·{" "}
                    {filteredMagazzinoGrouped.reduce((sum, g) => sum + g.lots.length, 0)} lotti · Disponibili totali{" "}
                    {filteredMagazzinoGrouped.reduce((sum, g) => sum + g.totalAvailable, 0)}
                  </span>
                  <span style={{ ...badgeStyle("success"), fontSize: 12 }}>{pieno} vendibili a prezzo pieno</span>
                  {daBollinare > 0 ? (
                    <span style={{ ...badgeStyle("danger"), fontSize: 12 }}>🏷️ {daBollinare} da bollinare</span>
                  ) : null}
                  {scaduto > 0 ? (
                    <span style={{ ...badgeStyle("outline"), fontSize: 12 }}>⛔ {scaduto} scaduti</span>
                  ) : null}
                </div>
              );
            })()}
          </div>
        )}

        {page === "ordini-app" && (
          <div style={{ ...cardStyle(), padding: isSmallLayout ? 16 : 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 800 }}>Ordini da APP</div>
                <div style={{ fontSize: 13, color: "#64748b" }}>
                  Ordini in arrivo dall'app agenti. Controllali e premi "Sposta in ordini": da lì seguono il flusso normale.
                </div>
              </div>
              <button style={btnStyle("outline")} onClick={loadOrdiniApp}>
                <RefreshCw size={16} /> Aggiorna
              </button>
            </div>

            {ordiniApp.length === 0 && (
              <div style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>
                Nessun ordine da controllare.
              </div>
            )}

            <div style={{ display: "grid", gap: 12 }}>
              {ordiniApp.map((o) => {
                const cli = o.cliente || {};
                const righe = o.righe || [];
                const totPezzi = righe.reduce((t, r) => t + Number(r.quantita_ordinata || 0), 0);
                const busy = ordiniAppBusy === o.id_ordine;
                return (
                  <div key={o.id_ordine} style={{ ...cardStyle(), padding: 14, border: "1px solid #e2e8f0" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 800, fontSize: 16 }}>
                          {cli.nuovo && (
                            <span style={{ background: "#fde68a", color: "#92400e", borderRadius: 6, fontSize: 11, fontWeight: 800, padding: "2px 6px", marginRight: 6 }}>
                              NUOVO CLIENTE
                            </span>
                          )}
                          {cli.ragione_sociale || o.cliente_id || "Cliente app"}
                        </div>
                        <div style={{ fontSize: 12.5, color: "#64748b", marginTop: 3 }}>
                          {o.agente_nome} · {o.canale}
                          {cli.citta ? ` · ${cli.citta}` : ""}
                          {" · "}{new Date(o.creato_il).toLocaleDateString("it-IT")}
                          {o.data_consegna ? ` · consegna ${new Date(o.data_consegna).toLocaleDateString("it-IT")}` : ""}
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontWeight: 800 }}>{Number(o.totale || 0).toFixed(2)} €</div>
                        <div style={{ fontSize: 12, color: "#64748b" }}>{righe.length} righe · {totPezzi} pz</div>
                      </div>
                    </div>

                    <div style={{ marginTop: 10, borderTop: "1px solid #f1f5f9", paddingTop: 8 }}>
                      {righe.map((r, i) => (
                        <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "2px 0" }}>
                          <span style={{ minWidth: 0 }}>
                            {r.colli ? `${r.colli} crt · ` : ""}{r.quantita_ordinata} pz — {r.descrizione_prodotto}
                            {r.promo && (r.sconto_pct === 100 ? <b style={{ color: "#16a34a" }}> · OMAGGIO</b> : <b style={{ color: "#16a34a" }}> · PROMO</b>)}
                            {r.su_richiesta && <b style={{ color: "#dc2626" }}> · SU RICHIESTA</b>}
                            {r.id_prodotto_magazzino == null && <span style={{ color: "#b45309" }}> · fuori magazzino</span>}
                          </span>
                        </div>
                      ))}
                      {(o.promozioni_applicate || []).length > 0 && (
                        <div style={{ fontSize: 12.5, color: "#16a34a", marginTop: 4 }}>
                          🎁 {(o.promozioni_applicate || []).map((p) => p.etichetta || p.nome).join(" · ")}
                        </div>
                      )}
                      {cli.nuovo && (
                        <div style={{ fontSize: 12, color: "#b45309", marginTop: 6 }}>
                          🆕 Da registrare: {cli.ragione_sociale}{cli.partita_iva ? ` · P.IVA ${cli.partita_iva}` : ""}
                          {cli.referente ? ` · Ref. ${cli.referente}` : ""}{cli.telefono ? ` · ${cli.telefono}` : ""}
                          {cli.email ? ` · ${cli.email}` : ""}{cli.orari_consegna ? ` · consegne ${cli.orari_consegna}` : ""}
                        </div>
                      )}
                      {o.note && <div style={{ fontSize: 12.5, color: "#64748b", marginTop: 6 }}>📝 {o.note}</div>}
                    </div>

                    <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                      <button
                        style={btnStyle("primary", busy)}
                        disabled={busy}
                        onClick={() => spostaOrdineInOrdini(o.id_ordine)}
                      >
                        <RotateCcw size={16} /> {busy ? "Sposto…" : "Sposta in ordini"}
                      </button>
                      <button
                        style={{ ...btnStyle("soft", busy), color: "#dc2626" }}
                        disabled={busy}
                        onClick={() => rifiutaOrdineApp(o.id_ordine)}
                      >
                        <Trash2 size={16} /> Rifiuta
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {page === "prodotti" && (
          <div style={{ ...cardStyle(), padding: 20 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                alignItems: "center",
                flexWrap: "wrap",
                marginBottom: 18,
              }}
            >
              <div style={{ fontSize: 22, fontWeight: 800 }}>Prodotti e disponibilità</div>

              {isAdmin && (
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button style={btnStyle("primary")} onClick={() => setProductDialogOpen(true)}>
                    <Plus size={16} /> Nuovo prodotto
                  </button>

                  <button style={btnStyle("primary")} onClick={() => setLotDialogOpen(true)}>
                    <Boxes size={16} /> Carica lotto
                  </button>
                </div>
              )}
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: isSmallLayout
                  ? "1fr"
                  : "minmax(260px, 1.4fr) minmax(180px, 0.8fr) minmax(180px, 0.8fr)",
                gap: 12,
                marginBottom: 18,
              }}
            >
              <div style={{ position: "relative" }}>
                <Search
                  size={16}
                  style={{ position: "absolute", left: 14, top: 18, color: "#97a3b6" }}
                />

                <input
                  style={{ ...inputStyle(), paddingLeft: 40 }}
                  value={productSearch}
                  onChange={(event) => setProductSearch(event.target.value)}
                  placeholder="Cerca prodotto, codice o categoria"
                />
              </div>

              <select
                style={inputStyle()}
                value={productCategoryFilter}
                onChange={(event) => setProductCategoryFilter(event.target.value)}
              >
                <option value="">Tutte le categorie</option>
                {categoryOptions.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>

              <select
                style={inputStyle()}
                value={productSubcategoryFilter}
                onChange={(event) => setProductSubcategoryFilter(event.target.value)}
              >
                <option value="">Tutte le sottocategorie</option>
                {subcategoryOptions.map((subcategory) => (
                  <option key={subcategory} value={subcategory}>
                    {subcategory}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: "grid", gap: 14 }}>
              {groupedProducts.length === 0 ? (
                <div style={{ ...cardStyle({ background: "#fff7ed" }), padding: 18, color: "#b45309" }}>
                  Nessun prodotto trovato con i filtri selezionati.
                </div>
              ) : (
                groupedProducts.map((group) => {
                  const isOpen =
                    openProductSections[group.category] ??
                    Boolean(productCategoryFilter || productSubcategoryFilter || productSearch);

                  return (
                    <div key={group.category} style={{ ...cardStyle(), overflow: "hidden" }}>
                      <button
                        onClick={() => toggleProductSection(group.category)}
                        style={{
                          width: "100%",
                          border: 0,
                          background: isOpen ? "#07153a" : "#fff",
                          color: isOpen ? "#fff" : "#07153a",
                          padding: isSmallLayout ? 16 : 20,
                          cursor: "pointer",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: 14,
                          textAlign: "left",
                        }}
                      >
                        <div>
                          <div style={{ fontSize: isSmallLayout ? 20 : 24, fontWeight: 950 }}>
                            {group.category}
                          </div>
                          <div
                            style={{
                              marginTop: 6,
                              color: isOpen ? "rgba(255,255,255,0.72)" : "#617086",
                              fontSize: 14,
                            }}
                          >
                            {group.products.length} prodotti · Totale {group.totalLoaded} · Impegnati {group.totalCommitted} · Disponibili {group.totalAvailable}
                          </div>
                        </div>

                        <div
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: 42,
                            height: 42,
                            borderRadius: 16,
                            background: isOpen ? "rgba(255,255,255,0.14)" : "#eef3f9",
                            fontSize: 24,
                            fontWeight: 900,
                            flex: "0 0 auto",
                          }}
                        >
                          {isOpen ? "−" : "+"}
                        </div>
                      </button>

                      {isOpen ? (
                        <div style={{ padding: isSmallLayout ? 14 : 18, display: "grid", gap: 18 }}>
                          {Object.entries(group.subcategories)
                            .sort(([a], [b]) => a.localeCompare(b))
                            .map(([subcategory, productsInSubcategory]) => (
                              <div key={subcategory} style={{ display: "grid", gap: 12 }}>
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    gap: 10,
                                    flexWrap: "wrap",
                                  }}
                                >
                                  <div style={{ fontSize: 16, fontWeight: 900, color: "#243043" }}>
                                    {subcategory}
                                  </div>
                                  <span style={badgeStyle("outline")}>
                                    {productsInSubcategory.length} prodotti
                                  </span>
                                </div>

                                <div
                                  style={{
                                    display: "grid",
                                    gridTemplateColumns: responsiveProductColumns,
                                    gap: 16,
                                    minWidth: 0,
                                  }}
                                >
                                  {productsInSubcategory.map((product) => (
                                    <div key={product.id} style={{ ...cardStyle(), padding: 20 }}>
                                      <div
                                        style={{
                                          display: "flex",
                                          justifyContent: "space-between",
                                          gap: 12,
                                          alignItems: "flex-start",
                                        }}
                                      >
                                        <div>
                                          <div style={{ fontSize: 18, fontWeight: 900 }}>
                                            {product.code}
                                          </div>
                                          <div style={{ marginTop: 4, color: "#55657a" }}>
                                            {product.name}
                                          </div>

                                          {(product.category || product.subcategory) && (
                                            <div
                                              style={{
                                                display: "flex",
                                                gap: 8,
                                                flexWrap: "wrap",
                                                marginTop: 10,
                                              }}
                                            >
                                              {product.category ? (
                                                <span style={badgeStyle("dark")}>{product.category}</span>
                                              ) : null}

                                              {product.subcategory ? (
                                                <span style={badgeStyle("outline")}>
                                                  {product.subcategory}
                                                </span>
                                              ) : null}
                                            </div>
                                          )}
                                        </div>

                                        <div
                                          style={{
                                            display: "flex",
                                            gap: 8,
                                            alignItems: "center",
                                            flexWrap: "wrap",
                                            justifyContent: "flex-end",
                                          }}
                                        >
                                          <span style={badgeStyle("outline")}>
                                            Totale {product.totalLoaded}
                                          </span>
                                          <span style={badgeStyle("warning")}>
                                            Impegnati {product.totalCommitted}
                                          </span>
                                          <span style={badgeStyle("success")}>
                                            Disponibili {product.totalAvailable}
                                          </span>

                                          {isAdmin && (
                                            <>
                                              <button
                                                style={btnStyle("outline")}
                                                onClick={() => openEditProductDialog(product)}
                                              >
                                                <Pencil size={16} />
                                              </button>

                                              <button
                                                style={btnStyle(
                                                  "danger",
                                                  deletingProductId === String(product.id)
                                                )}
                                                disabled={deletingProductId === String(product.id)}
                                                onClick={() => deleteProduct(product)}
                                              >
                                                <Trash2 size={16} />
                                              </button>
                                            </>
                                          )}
                                        </div>
                                      </div>

                                      <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
                                        {product.productLots.length === 0 ? (
                                          <div
                                            style={{
                                              ...cardStyle({ background: "#fff7ed" }),
                                              padding: 14,
                                              color: "#b45309",
                                            }}
                                          >
                                            <div
                                              style={{
                                                display: "flex",
                                                alignItems: "center",
                                                gap: 8,
                                              }}
                                            >
                                              <AlertTriangle size={16} />{" "}
                                              {productManagesLots(product)
                                                ? "Nessun lotto disponibile"
                                                : "Nessuna disponibilità caricata"}
                                            </div>
                                          </div>
                                        ) : (
                                          product.productLots
                                            .sort((a, b) =>
                                              productManagesLots(product)
                                                ? new Date(a.expiry || "2099-12-31") - new Date(b.expiry || "2099-12-31")
                                                : 0
                                            )
                                            .map((lot) => (
                                              <div
                                                key={lot.id}
                                                style={{
                                                  ...cardStyle({ background: "#f8fafc" }),
                                                  padding: 16,
                                                }}
                                              >
                                                <div
                                                  style={{
                                                    display: "flex",
                                                    justifyContent: "space-between",
                                                    gap: 12,
                                                  }}
                                                >
                                                  <div>
                                                    <div style={{ fontWeight: 800 }}>
                                                      Lotto {lot.lot || "(senza codice)"}
                                                    </div>
                                                    {lot.expiry ? (
                                                      <div style={{ marginTop: 6, color: "#66758b" }}>
                                                        Scadenza {fmtDate(lot.expiry)}
                                                      </div>
                                                    ) : null}
                                                  </div>

                                                  <div
                                                    style={{
                                                      display: "flex",
                                                      gap: 8,
                                                      alignItems: "center",
                                                    }}
                                                  >
                                                    <div
                                                      style={{
                                                        display: "grid",
                                                        gap: 6,
                                                        minWidth: 96,
                                                        textAlign: "right",
                                                      }}
                                                    >
                                                      <span style={badgeStyle("outline")}>
                                                        Totale lotto {Number(lot.loadedQty || 0)}
                                                      </span>
                                                    </div>

                                                    <button
                                                      style={btnStyle("outline")}
                                                      onClick={() => openEditLotDialog(lot)}
                                                    >
                                                      <Pencil size={16} />
                                                    </button>

                                                    {Number(lot.loadedQty || 0) <= 0 ? (
                                                      <button
                                                        style={btnStyle("outline")}
                                                        onClick={() => archiveLot(lot.id)}
                                                        disabled={
                                                          (lotAssignedMap[String(lot.id)]?.assigned || 0) > 0
                                                        }
                                                        title="Archivia lotto a zero"
                                                      >
                                                        <Archive size={16} />
                                                      </button>
                                                    ) : null}

                                                    <button
                                                      style={btnStyle("outline")}
                                                      onClick={() => deleteLot(lot.id)}
                                                      disabled={
                                                        (lotAssignedMap[String(lot.id)]?.assigned || 0) > 0
                                                      }
                                                    >
                                                      <Trash2 size={16} />
                                                    </button>
                                                  </div>
                                                </div>
                                              </div>
                                            ))
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        <Modal
          open={assignDialogOpen}
          title="Assegna lotto"
          onClose={() => setAssignDialogOpen(false)}
          maxWidth={560}
        >
          {selectedLine && (
            <div style={{ display: "grid", gap: 18 }}>
              <div style={{ ...cardStyle({ background: "#f8fafc" }), padding: 16 }}>
                <div style={{ fontWeight: 800 }}>
                  {productMap[String(selectedLine.productId)]?.name}
                </div>
                <div style={{ color: "#66758b", marginTop: 6 }}>
                  Da assegnare: {selectedLine.qtyToAssign}
                </div>
              </div>

              <div style={{ display: "grid", gap: 8 }}>
                <label style={labelStyle()}>Lotto</label>

                <select
                  style={inputStyle()}
                  value={selectedLotId}
                  onChange={(event) => handleLotSelect(event.target.value)}
                >
                  <option value="">Seleziona lotto</option>

                  {availableLotsForSelectedLine.map((lot) => {
                    const info = lotAssignedMap[String(lot.id)] || {};
                    const disp = Number(info.assignable ?? 0);
                    const giac = Number(info.total || 0);
                    return (
                      <option key={lot.id} value={String(lot.id)}>
                        {lot.lot} · scad. {fmtDate(lot.expiry)} · disp. {disp}
                        {disp === 0 && giac > 0 ? ` (giac. ${giac})` : ""}
                      </option>
                    );
                  })}
                </select>

                <button
                  type="button"
                  style={{
                    background: "#eef2ff",
                    border: "1px dashed #6366f1",
                    color: "#3730a3",
                    fontSize: 13,
                    fontWeight: 900,
                    padding: "8px 12px",
                    cursor: "pointer",
                    borderRadius: 10,
                    textAlign: "center",
                  }}
                  onClick={() => {
                    setAssignDialogOpen(false);
                    openLotOnFlyDialog(selectedLine);
                  }}
                  title="Crea un lotto nuovo al volo (per stesso codice viene accorpato)"
                >
                  + Crea lotto al volo
                </button>
              </div>

              <div>
                <label style={labelStyle()}>Quantità</label>

                <input
                  style={inputStyle()}
                  type="number"
                  min="0"
                  value={assignQty}
                  onChange={(event) => setAssignQty(event.target.value)}
                  placeholder="0"
                />

                <div style={{ marginTop: 8, color: "#66758b", fontSize: 14 }}>
                  Quantità proposta in automatico, ma modificabile a mano.
                </div>
              </div>

              <button style={btnStyle("primary")} onClick={confirmAssignment}>
                Conferma lotto
              </button>
            </div>
          )}
        </Modal>

        <Modal
          open={orderDialogOpen}
          title="Nuovo ordine"
          onClose={() => setOrderDialogOpen(false)}
          maxWidth={760}
        >
          <div style={{ display: "grid", gap: 18 }}>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <label style={labelStyle()}>Cliente</label>
                <button
                  type="button"
                  style={{ ...btnStyle("outline"), padding: "4px 10px", fontSize: 13 }}
                  onClick={() => {
                    setEditingClientId("");
                    setClientForm({ ragioneSociale: "", categoria: newOrderCategory || "", codiceClienteTs: "", piva: "", codiceFiscale: "", note: "" });
                    setClientDialogOpen(true);
                  }}
                >
                  + Nuovo cliente
                </button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <select
                  style={inputStyle()}
                  value={newOrderCategory}
                  onChange={(event) => {
                    setNewOrderCategory(event.target.value);
                    // Cambiando categoria, se il cliente selezionato non e' piu' coerente, lo svuoto.
                    const cur = clientsById[newOrderClientId];
                    if (cur && event.target.value && cur.category !== event.target.value) {
                      setNewOrderClientId("");
                      setNewOrderCustomer("");
                    }
                  }}
                >
                  <option value="">Tutte le categorie</option>
                  {clientCategories.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>

                <select
                  style={inputStyle()}
                  value={newOrderClientId}
                  onChange={(event) => {
                    const id = event.target.value;
                    setNewOrderClientId(id);
                    const c = clientsById[id];
                    if (c) {
                      setNewOrderCustomer(c.name);
                      if (c.category) setNewOrderCategory(c.category);
                      // CAP auto-compilato dall'anagrafica del cliente scelto.
                      setNewOrderCap(String(c.cap || ""));
                    } else {
                      setNewOrderCap("");
                    }
                  }}
                >
                  <option value="">— seleziona cliente —</option>
                  {activeClientsGrouped.map((g) => (
                    <optgroup key={g.category} label={g.category}>
                      {g.clients.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}{c.codeTs ? ` (${c.codeTs})` : ""}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, fontSize: 13, color: "#475569", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={newOrderManual}
                  onChange={(e) => {
                    setNewOrderManual(e.target.checked);
                    if (e.target.checked) {
                      setNewOrderClientId("");
                      setNewOrderCustomer("");
                      setNewOrderCap("");
                    } else if (!newOrderClientId) {
                      setNewOrderCustomer("");
                      setNewOrderCap("");
                    }
                  }}
                />
                ✍️ Non trovo il cliente in lista: scrivilo a mano (eccezione)
              </label>

              {newOrderManual && (
                <input
                  style={{ ...inputStyle(), marginTop: 8 }}
                  value={newOrderCustomer}
                  onChange={(event) => {
                    setNewOrderCustomer(event.target.value);
                    setNewOrderClientId("");
                  }}
                  placeholder="Nome cliente (scritto a mano, non collegato all'anagrafica)"
                />
              )}

              {/* CAP destinazione: auto-compilato dal cliente scelto, oppure a
                  mano per il testo libero. Serve al costo trasporto. */}
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 12, color: "#5a6e90", fontWeight: 700, marginBottom: 4 }}>
                  CAP destinazione {newOrderClientId ? "(dall'anagrafica, correggibile)" : "(per il costo trasporto)"}
                </div>
                <input
                  style={inputStyle()}
                  value={newOrderCap}
                  onChange={(event) => setNewOrderCap(event.target.value.replace(/[^0-9]/g, "").slice(0, 5))}
                  inputMode="numeric"
                  placeholder="Es. 00185"
                />
              </div>

              {newOrderClientId && clientsById[newOrderClientId] ? (
                <div style={{ fontSize: 12, color: "#475569", marginTop: 6 }}>
                  {clientsById[newOrderClientId].codeTs
                    ? `Codice GAMMA: ${clientsById[newOrderClientId].codeTs} · agganciato all'anagrafica ✓`
                    : "Cliente in anagrafica senza codice GAMMA (verra' agganciato quando arriva il ponte)."}
                </div>
              ) : newOrderManual && newOrderCustomer.trim() ? (
                <div style={{ fontSize: 12, color: "#b45309", marginTop: 6 }}>
                  ⚠ Cliente scritto a mano, NON collegato all'anagrafica: niente aggancio pagamenti/ultima vendita.
                </div>
              ) : null}
            </div>

            <div>
              <label style={labelStyle()}>Note ordine</label>

              <textarea
                style={{ ...inputStyle(), minHeight: 94, resize: "vertical" }}
                value={newOrderNotes}
                onChange={(event) => setNewOrderNotes(event.target.value)}
                placeholder="Es. urgenze, consegna, corriere, indicazioni operatore..."
              />
            </div>

            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ fontSize: 18, fontWeight: 800 }}>Righe ordine</div>

              {/* Cosa ha gia' ordinato questo cliente, TUTTO: sia roba di
                  magazzino sia articoli fatti apposta per lui. Toccandone uno
                  si riempie la prima riga libera. E' la stessa comodita' che
                  c'e' aggiungendo una riga a un ordine gia' aperto. */}
              {newOrderClientId || newOrderCustomer.trim() ? (
                <StoricoClientePanel
                  cliente={newOrderCustomer.trim()}
                  codiceCliente={newOrderClientId}
                  prodotti={products}
                  onScegli={(a) => {
                    const normC = (v) => String(v || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
                    const cod = normC(a.codice);
                    const prod = cod
                      ? products.find((p) => normC(p.code) === cod || normC(p.id) === cod)
                      : null;
                    // Prima riga ancora vuota, altrimenti se ne aggiunge una.
                    const libera = newOrderLines.findIndex(
                      (l) => !l.productId && !String(l.customName || "").trim()
                    );
                    const scrivi = (idx) => {
                      if (prod) {
                        updateNewOrderLine(idx, "isOutsideStock", false);
                        updateNewOrderLine(idx, "productId", String(prod.id));
                        updateNewOrderLine(idx, "productSearch", prod.name || "");
                        updateNewOrderLine(idx, "customName", "");
                      } else {
                        updateNewOrderLine(idx, "isOutsideStock", true);
                        updateNewOrderLine(idx, "productId", "");
                        updateNewOrderLine(idx, "productSearch", "");
                        updateNewOrderLine(
                          idx,
                          "customName",
                          [a.codice, a.descrizione].filter(Boolean).join(" ")
                        );
                      }
                      updateNewOrderLine(
                        idx,
                        "prezzoUnitario",
                        a.ultimoPrezzo != null ? String(a.ultimoPrezzo) : ""
                      );
                      updateNewOrderLine(idx, "scontoPct", a.ultimoSconto ? String(a.ultimoSconto) : "");
                    };
                    if (libera >= 0) {
                      scrivi(libera);
                    } else {
                      // Nessuna riga libera: ne aggiungo una e ci scrivo dentro
                      // appena React l'ha montata.
                      const nuovoIndice = newOrderLines.length;
                      addEmptyOrderLine();
                      setTimeout(() => scrivi(nuovoIndice), 0);
                    }
                  }}
                />
              ) : null}

              {newOrderLines.map((line, index) => (
                <div
                  key={index}
                  style={{
                    border: "1px solid #dbe2ea",
                    borderRadius: 18,
                    padding: 14,
                    display: "grid",
                    gap: 12,
                  }}
                >
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      fontWeight: 800,
                      color: "#40516a",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={!!line.isOutsideStock}
                      onChange={(event) => {
                        updateNewOrderLine(index, "isOutsideStock", event.target.checked);
                        updateNewOrderLine(index, "productId", "");
                        updateNewOrderLine(index, "productSearch", "");
                      }}
                    />
                    Riga fuori magazzino
                  </label>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: responsiveOrderLineColumns,
                      gap: 12,
                    }}
                  >
                    {line.isOutsideStock ? (
                      <StoricoFuoriMagazzinoSelect
                        articoli={storicoFuoriMag.articoli}
                        caricando={storicoFuoriMag.caricando}
                        testo={line.customName || ""}
                        onTesto={(v) => updateNewOrderLine(index, "customName", v)}
                        onScegli={(a) => {
                          updateNewOrderLine(
                            index,
                            "customName",
                            [a.codice, a.descrizione].filter(Boolean).join(" ")
                          );
                          updateNewOrderLine(
                            index,
                            "prezzoUnitario",
                            a.ultimoPrezzo != null ? String(a.ultimoPrezzo) : ""
                          );
                          updateNewOrderLine(
                            index,
                            "scontoPct",
                            a.ultimoSconto ? String(a.ultimoSconto) : ""
                          );
                        }}
                      />
                    ) : (
                      <ProductSearchSelect
                        products={products}
                        value={line.productId}
                        search={line.productSearch || ""}
                        onSearchChange={(value) =>
                          updateNewOrderLine(index, "productSearch", value)
                        }
                        onChange={(value) => {
                          updateNewOrderLine(index, "productId", value);
                          // se cambio prodotto, resetto la selezione lotto.
                          updateNewOrderLine(index, "lotId", "");
                        }}
                      />
                    )}

                    <input
                      style={inputStyle()}
                      type="number"
                      min="1"
                      value={line.qtyOrdered}
                      onChange={(event) =>
                        updateNewOrderLine(index, "qtyOrdered", event.target.value)
                      }
                      placeholder="Quantità"
                    />

                    <button style={btnStyle("outline")} onClick={() => removeNewOrderLine(index)}>
                      Rimuovi
                    </button>
                  </div>

                  {/* Prezzo, sconto e IVA della riga: precompilati da quello che il
                      cliente ha pagato l'ultima volta, e sempre correggibili a mano.
                      Si vedono su TUTTE le righe, non solo su quelle fuori magazzino:
                      altrimenti l'ordine parte senza valore. */}
                  {line.productId || String(line.customName || "").trim() ? (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                      <div>
                        <label style={{ fontSize: 12, color: "#5a6e90", fontWeight: 700 }}>
                          Prezzo € (ultimo fatto a questo cliente)
                        </label>
                        <input
                          style={inputStyle()}
                          type="number"
                          step="0.01"
                          min="0"
                          value={line.prezzoUnitario || ""}
                          onChange={(e) => updateNewOrderLine(index, "prezzoUnitario", e.target.value)}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: 12, color: "#5a6e90", fontWeight: 700 }}>
                          Sconto %
                        </label>
                        <input
                          style={inputStyle()}
                          type="number"
                          step="0.1"
                          min="0"
                          max="100"
                          value={line.scontoPct || ""}
                          onChange={(e) => updateNewOrderLine(index, "scontoPct", e.target.value)}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: 12, color: "#5a6e90", fontWeight: 700 }}>IVA</label>
                        <select
                          style={inputStyle()}
                          value={`${line.ivaPct || "4"}|${line.naturaIva || ""}`}
                          onChange={(e) => {
                            const [al, nat] = String(e.target.value).split("|");
                            updateNewOrderLine(index, "ivaPct", al);
                            updateNewOrderLine(index, "naturaIva", nat || "");
                          }}
                        >
                          {ALIQUOTE_IVA.map((a) => (
                            <option key={chiaveAliquota(a)} value={chiaveAliquota(a)}>{a.etichetta}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ) : null}

                  {/* Le tre fonti di prezzo per questo articolo: cosa ha pagato
                      il cliente l'ultima volta, listino 1 e listino 8. Un tocco
                      e il prezzo entra nella riga. */}
                  {(line.productId || String(line.customName || "").trim()) &&
                  (newOrderClientId || newOrderCustomer.trim()) ? (() => {
                    const prod = products.find((x) => String(x.id) === String(line.productId));
                    const codice = prod?.code || String(line.customName || "").split(" ").slice(0, 2).join(" ");
                    const stor = (storicoFuoriMag.tutti || []).find((a) => {
                      const nz = (v) => String(v || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
                      return a.codice && nz(a.codice) === nz(codice);
                    });
                    return (
                      <PrezziDisponibili
                        codice={codice}
                        storico={stor}
                        listini={listiniPrezzi}
                        onScegli={(prezzo, sconto) => {
                          updateNewOrderLine(index, "prezzoUnitario", String(prezzo));
                          updateNewOrderLine(index, "scontoPct", sconto ? String(sconto) : "");
                        }}
                      />
                    );
                  })() : null}

                  {/* Selettore lotto: visibile solo per righe di magazzino con prodotto scelto. */}
                  {!line.isOutsideStock && line.productId && (() => {
                    const prod = products.find((p) => String(p.id) === String(line.productId));
                    if (!prod || !productManagesLots(prod)) return null;
                    const productLots = lots
                      .filter((lot) => !lot.archived && String(lot.productId) === String(line.productId))
                      .map((lot) => {
                        const info = lotAssignedMap[String(lot.id)] || {};
                        return {
                          id: String(lot.id),
                          lot: lot.lot || "",
                          expiry: lot.expiry ? String(lot.expiry).slice(0, 10) : "",
                          available: Number(info.assignable ?? lot.loadedQty ?? 0),
                        };
                      })
                      .filter((l) => l.available > 0)
                      .sort((a, b) => String(a.expiry).localeCompare(String(b.expiry)));
                    const qtyN = Number(line.qtyOrdered) || 0;
                    const selectedLot = productLots.find((l) => l.id === String(line.lotId));
                    const tooLittle = selectedLot && qtyN > 0 && selectedLot.available < qtyN;
                    return (
                      <div style={{ display: "grid", gap: 6 }}>
                        <label style={{ fontSize: 12, color: "#5a6e90", fontWeight: 700 }}>
                          Lotto da assegnare (opzionale, scadenza più vicina prima)
                        </label>
                        <select
                          style={inputStyle()}
                          value={line.lotId || ""}
                          onChange={(event) => updateNewOrderLine(index, "lotId", event.target.value)}
                        >
                          <option value="">— Assegna dopo (lasciamo libero) —</option>
                          {productLots.map((l) => (
                            <option key={l.id} value={l.id} disabled={l.available <= 0}>
                              {l.lot || "(senza codice)"} {l.expiry ? `· scad. ${l.expiry}` : ""} · disp. {l.available}
                              {l.available <= 0 ? " (esaurito)" : ""}
                            </option>
                          ))}
                          {productLots.length === 0 && (
                            <option value="" disabled>
                              Nessun lotto disponibile per questo prodotto
                            </option>
                          )}
                        </select>
                        {tooLittle && (
                          <div style={{ fontSize: 12, color: "#b45309" }}>
                            Disponibilità del lotto selezionato ({selectedLot.available}) inferiore alla quantità richiesta ({qtyN}). Verrà assegnato il massimo possibile, il resto resta da assegnare.
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              ))}

              <button style={btnStyle("outline")} onClick={addEmptyOrderLine}>
                <Plus size={16} /> Aggiungi riga
              </button>

              {/* Quanto vale l'ordine, prima di crearlo. */}
              {(() => {
                const imponibile = newOrderLines.reduce((acc, l) => {
                  const q = Number(l.qtyOrdered || 0);
                  const p = Number(l.prezzoUnitario || 0);
                  const sc = Number(l.scontoPct || 0);
                  return acc + q * p * (1 - sc / 100);
                }, 0);
                const iva = newOrderLines.reduce((acc, l) => {
                  const q = Number(l.qtyOrdered || 0);
                  const p = Number(l.prezzoUnitario || 0);
                  const sc = Number(l.scontoPct || 0);
                  const al = Number(l.ivaPct || 4);
                  return acc + q * p * (1 - sc / 100) * (al / 100);
                }, 0);
                if (imponibile <= 0) return null;
                return (
                  <div
                    style={{
                      ...cardStyle({ background: "#f0fdf4" }),
                      padding: 12,
                      fontWeight: 900,
                      color: "#07153a",
                      textAlign: "right",
                    }}
                  >
                    Imponibile {fmtEur(imponibile)} € · IVA {fmtEur(iva)} € ·{" "}
                    Totale {fmtEur(imponibile + iva)} €
                  </div>
                );
              })()}
            </div>

            <button
              style={btnStyle("primary", !!azioniInCorso["crea-ordine"])}
              disabled={!!azioniInCorso["crea-ordine"]}
              onClick={() => azioneUnica("crea-ordine", createOrder)}
            >
              {azioniInCorso["crea-ordine"] ? "Sto creando l'ordine..." : "Crea ordine"}
            </button>
          </div>
        </Modal>

        <Modal
          open={clientDialogOpen}
          title="Anagrafica clienti"
          onClose={() => setClientDialogOpen(false)}
          maxWidth={760}
        >
          <div style={{ display: "grid", gap: 16 }}>
            <div style={{
              border: "1px solid #dbe2ea", borderRadius: 12, padding: 14,
              display: "grid", gap: 10, background: "#f8fafc",
            }}>
              <div style={{ fontSize: 16, fontWeight: 800 }}>
                {editingClientId ? "Modifica cliente" : "Nuovo cliente"}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={labelStyle()}>Ragione sociale</label>
                  <input
                    style={inputStyle()}
                    value={clientForm.ragioneSociale}
                    onChange={(e) => setClientForm((f) => ({ ...f, ragioneSociale: e.target.value }))}
                    placeholder="Es. Farmacia Rossi srl"
                  />
                </div>
                <div>
                  <label style={labelStyle()}>Categoria (canale)</label>
                  <input
                    list="client-categories"
                    style={inputStyle()}
                    value={clientForm.categoria}
                    onChange={(e) => setClientForm((f) => ({ ...f, categoria: e.target.value }))}
                    placeholder="GDO, Farmacia, Horeca..."
                  />
                  <datalist id="client-categories">
                    {clientCategories.map((cat) => <option key={cat} value={cat} />)}
                  </datalist>
                </div>
                <div>
                  <label style={labelStyle()}>Codice cliente GAMMA</label>
                  <input
                    style={inputStyle()}
                    value={clientForm.codiceClienteTs}
                    onChange={(e) => setClientForm((f) => ({ ...f, codiceClienteTs: e.target.value }))}
                    placeholder="Codice anagrafica GAMMA"
                  />
                </div>
                <div>
                  <label style={labelStyle()}>Partita IVA</label>
                  <input
                    style={inputStyle()}
                    value={clientForm.piva}
                    onChange={(e) => setClientForm((f) => ({ ...f, piva: e.target.value }))}
                  />
                </div>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button style={btnStyle("primary", savingClient)} disabled={savingClient} onClick={saveClient}>
                  {editingClientId ? "Salva modifiche" : "Aggiungi cliente"}
                </button>
                {editingClientId ? (
                  <button style={btnStyle("outline")} onClick={startNewClient}>Annulla modifica</button>
                ) : null}
              </div>
            </div>

            <input
              style={inputStyle()}
              value={clientSearch}
              onChange={(e) => setClientSearch(e.target.value)}
              placeholder="Cerca cliente per nome, categoria o codice..."
            />

            <div style={{ maxHeight: 320, overflowY: "auto", display: "grid", gap: 6 }}>
              {activeClients
                .filter((c) => {
                  const q = clientSearch.trim().toLowerCase();
                  if (!q) return true;
                  return [c.name, c.category, c.codeTs, c.piva].join(" ").toLowerCase().includes(q);
                })
                .map((c) => (
                  <div key={c.id} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    border: "1px solid #e2e8f0", borderRadius: 10, padding: "8px 12px",
                  }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {c.name}
                      </div>
                      <div style={{ fontSize: 12, color: "#64748b" }}>
                        {c.category || "senza categoria"}
                        {c.codeTs ? ` · GAMMA ${c.codeTs}` : " · no codice GAMMA"}
                        {c.source === "seed" ? " · da ordini" : ""}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <button style={{ ...btnStyle("outline"), padding: "4px 10px", fontSize: 13 }} onClick={() => startEditClient(c)}>
                        Modifica
                      </button>
                      <button style={{ ...btnStyle("outline"), padding: "4px 10px", fontSize: 13, color: "#b91c1c" }} onClick={() => deactivateClient(c)}>
                        Disattiva
                      </button>
                    </div>
                  </div>
                ))}
              {activeClients.length === 0 ? (
                <div style={{ color: "#64748b", fontSize: 14, padding: 8 }}>
                  Nessun cliente in anagrafica. Aggiungine uno qui sopra.
                </div>
              ) : null}
            </div>
          </div>
        </Modal>

        <Modal
          open={editOrderDialogOpen}
          title="Modifica ordine"
          onClose={() => setEditOrderDialogOpen(false)}
          maxWidth={620}
        >
          <div style={{ display: "grid", gap: 18 }}>
            <div>
              <label style={labelStyle()}>Cliente</label>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <select
                  style={inputStyle()}
                  value={editOrderCategory}
                  onChange={(event) => {
                    setEditOrderCategory(event.target.value);
                    const cur = clientsById[editOrderClientId];
                    if (cur && event.target.value && cur.category !== event.target.value) {
                      setEditOrderClientId("");
                      setEditOrderCustomer("");
                    }
                  }}
                >
                  <option value="">Tutte le categorie</option>
                  {clientCategories.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>

                <select
                  style={inputStyle()}
                  value={editOrderClientId}
                  onChange={(event) => {
                    const id = event.target.value;
                    setEditOrderClientId(id);
                    const c = clientsById[id];
                    if (c) {
                      setEditOrderCustomer(c.name);
                      if (c.category) setEditOrderCategory(c.category);
                    }
                  }}
                >
                  <option value="">— seleziona cliente —</option>
                  {activeClientsGrouped.map((g) => (
                    <optgroup key={g.category} label={g.category}>
                      {g.clients.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}{c.codeTs ? ` (${c.codeTs})` : ""}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              <input
                style={{ ...inputStyle(), marginTop: 10 }}
                value={editOrderCustomer}
                onChange={(event) => {
                  setEditOrderCustomer(event.target.value);
                  setEditOrderClientId("");
                }}
                placeholder="Nome ordine o cliente (oppure scrivi a mano)"
              />

              {editOrderClientId && clientsById[editOrderClientId] ? (
                <div style={{ fontSize: 12, color: "#475569", marginTop: 6 }}>
                  {clientsById[editOrderClientId].codeTs
                    ? `Codice GAMMA: ${clientsById[editOrderClientId].codeTs}`
                    : "Cliente in anagrafica senza codice GAMMA."}
                </div>
              ) : null}
            </div>

            <div>
              <label style={labelStyle()}>Note ordine</label>

              <textarea
                style={{ ...inputStyle(), minHeight: 120, resize: "vertical" }}
                value={editOrderNotes}
                onChange={(event) => setEditOrderNotes(event.target.value)}
                placeholder="Note descrittive per admin/operatore"
              />
            </div>

            <button
              style={btnStyle("primary", savingEditedOrder)}
              disabled={savingEditedOrder}
              onClick={saveEditedOrder}
            >
              {savingEditedOrder ? "Salvataggio..." : "Salva ordine"}
            </button>
          </div>
        </Modal>

        <Modal
          open={adminDialogOpen}
          title="Accesso admin"
          onClose={() => setAdminDialogOpen(false)}
          maxWidth={420}
        >
          <div style={{ display: "grid", gap: 18 }}>
            <div>
              <label style={labelStyle()}>PIN</label>

              <input
                style={inputStyle()}
                type="password"
                value={adminPinInput}
                onChange={(event) => setAdminPinInput(event.target.value)}
                placeholder="Inserisci PIN"
              />
            </div>

            {adminError ? <div style={{ color: "#dc2626" }}>{adminError}</div> : null}

            <button style={btnStyle("primary")} onClick={handleAdminAccess}>
              Entra in admin
            </button>
          </div>
        </Modal>

        <Modal
          open={editProductDialogOpen}
          title="Modifica prodotto"
          onClose={() => setEditProductDialogOpen(false)}
          maxWidth={560}
        >
          <div style={{ display: "grid", gap: 18 }}>
            <div>
              <label style={labelStyle()}>Codice prodotto</label>

              <input
                style={inputStyle()}
                value={editProductCode}
                onChange={(event) => setEditProductCode(event.target.value)}
              />
            </div>

            <div>
              <label style={labelStyle()}>Descrizione</label>

              <input
                style={inputStyle()}
                value={editProductName}
                onChange={(event) => setEditProductName(event.target.value)}
              />
            </div>

            <div>
              <label style={labelStyle()}>Unità di misura</label>

              <input
                style={inputStyle()}
                value={editProductUom}
                onChange={(event) => setEditProductUom(event.target.value)}
              />
            </div>

            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: 14,
                border: "1px solid #dbe2ea",
                borderRadius: 16,
                background: "#f8fafc",
                fontWeight: 800,
              }}
            >
              <input
                type="checkbox"
                checked={editProductManagesLots}
                onChange={(event) => setEditProductManagesLots(event.target.checked)}
              />
              Gestisci lotti e scadenze per questo prodotto
            </label>

            <button
              style={btnStyle("primary", savingProduct)}
              disabled={savingProduct}
              onClick={saveEditedProduct}
            >
              {savingProduct ? "Salvataggio..." : "Salva modifiche"}
            </button>
          </div>
        </Modal>

        <Modal open={addLineDialogOpen} title="Aggiungi riga ordine" onClose={() => setAddLineDialogOpen(false)} maxWidth={560}>
          <div style={{ display: "grid", gap: 18 }}>
            <div style={{ ...cardStyle({ background: "#f8fafc" }), padding: 14 }}>
              <div style={{ fontWeight: 800 }}>Ordine {selectedOrder?.id}</div>
              <div style={{ marginTop: 4, color: "#66758b" }}>
                {selectedOrder?.customer}
              </div>
            </div>

            {addLineDialogOpen && selectedOrder?.customer ? (
              <StoricoClientePanel
                cliente={selectedOrder.customer}
                onScegli={(a) => {
                  // Se l'articolo esiste in magazzino lo selezioniamo, altrimenti
                  // diventa una riga fuori magazzino con la descrizione della fattura.
                  // In magazzino lo stesso codice si scrive "HORECA 122" o
                  // "HORECA122": confrontiamo senza spazi ne' punteggiatura.
                  const normCod = (v) =>
                    String(v || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
                  const cod = normCod(a.codice);
                  const inMagazzino = cod
                    ? products.find(
                        (p) => normCod(p.code) === cod || normCod(p.id) === cod
                      )
                    : null;
                  if (inMagazzino) {
                    setNewLineIsOutsideStock(false);
                    setNewLineProductId(String(inMagazzino.id));
                    setNewLineProductSearch(inMagazzino.name || "");
                    setNewLineCustomName("");
                  } else {
                    setNewLineIsOutsideStock(true);
                    setNewLineProductId("");
                    setNewLineProductSearch("");
                    setNewLineCustomName(
                      [a.codice, a.descrizione].filter(Boolean).join(" ")
                    );
                  }
                  setNewLinePrezzo(a.ultimoPrezzo != null ? String(a.ultimoPrezzo) : "");
                  setNewLineSconto(a.ultimoSconto ? String(a.ultimoSconto) : "");
                }}
              />
            ) : null}

            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: 14,
                border: "1px solid #dbe2ea",
                borderRadius: 16,
                background: "#f8fafc",
                fontWeight: 800,
              }}
            >
              <input
                type="checkbox"
                checked={newLineIsOutsideStock}
                onChange={(event) => {
                  setNewLineIsOutsideStock(event.target.checked);
                  setNewLineProductId("");
                  setNewLineProductSearch("");
                  setNewLineCustomName("");
                }}
              />
              Riga fuori magazzino
            </label>

            {newLineIsOutsideStock ? (
              <div>
                <label style={labelStyle()}>Nome articolo fuori magazzino</label>
                <input
                  style={inputStyle()}
                  value={newLineCustomName}
                  onChange={(event) => setNewLineCustomName(event.target.value)}
                  placeholder="Es. prodotto speciale / omaggio / extra"
                />
              </div>
            ) : (
              <div>
                <label style={labelStyle()}>Prodotto</label>
                <ProductSearchSelect
                  products={products}
                  value={newLineProductId}
                  search={newLineProductSearch}
                  onSearchChange={setNewLineProductSearch}
                  onChange={setNewLineProductId}
                />
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              <div>
                <label style={labelStyle()}>Quantità ordinata</label>
                <input
                  style={inputStyle()}
                  type="number"
                  min="1"
                  value={newLineQty}
                  onChange={(event) => setNewLineQty(event.target.value)}
                  placeholder="0"
                />
              </div>
              <div>
                <label style={labelStyle()}>Prezzo €</label>
                <input
                  style={inputStyle()}
                  type="number"
                  step="0.01"
                  min="0"
                  value={newLinePrezzo}
                  onChange={(event) => setNewLinePrezzo(event.target.value)}
                  placeholder="—"
                />
              </div>
              <div>
                <label style={labelStyle()}>Sconto %</label>
                <input
                  style={inputStyle()}
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={newLineSconto}
                  onChange={(event) => setNewLineSconto(event.target.value)}
                  placeholder="0"
                />
              </div>
            </div>

            <button
              style={btnStyle("primary", savingNewLine)}
              disabled={savingNewLine}
              onClick={() => azioneUnica("aggiungi-riga", createOrderLine)}
            >
              {savingNewLine ? "Salvataggio..." : "Aggiungi riga"}
            </button>
          </div>
        </Modal>

        <Modal open={editLineDialogOpen} title="Modifica quantità riga" onClose={() => setEditLineDialogOpen(false)} maxWidth={460}>
          <div style={{ display: "grid", gap: 18 }}>
            <div>
              <label style={labelStyle()}>Quantità ordinata</label>
              <input
                style={inputStyle()}
                type="number"
                min="1"
                value={editingLineQty}
                onChange={(event) => setEditingLineQty(event.target.value)}
                placeholder="0"
              />
            </div>

            <button
              style={btnStyle("primary", savingEditedLine)}
              disabled={savingEditedLine}
              onClick={saveEditedOrderLine}
            >
              {savingEditedLine ? "Salvataggio..." : "Salva quantità"}
            </button>
          </div>
        </Modal>

        <Modal
          open={!!transportModalOrderId}
          title="Opzioni trasporto"
          onClose={() => setTransportModalOrderId("")}
          maxWidth={560}
        >
          {(() => {
            const ord = ordersWithComputed.find((o) => String(o.id) === String(transportModalOrderId));
            if (!ord) return null;
            const t = ord.transport;
            if (!t || t.errore) {
              return (
                <div style={{ display: "grid", gap: 12 }}>
                  <div style={{ color: "#40516a", fontWeight: 700 }}>{ord.customer || "Ordine"}</div>
                  <div style={{ ...cardStyle({ background: "#fff7ed" }), padding: 14, color: "#b45309" }}>
                    Impossibile calcolare il trasporto: {t?.errore || "dati mancanti"}.
                    {t?.errore === "CAP destinazione mancante"
                      ? " Il cliente non ha un CAP nell'anagrafica GAMMA."
                      : ""}
                  </div>
                </div>
              );
            }
            const opzioni = [t.consigliato, ...t.alternative];
            return (
              <div style={{ display: "grid", gap: 12 }}>
                <div style={{ color: "#40516a", fontSize: 14 }}>
                  {ord.customer} · {fmtKg(ord.pesoTotale)} kg · {temperaturaLabel(ord.temperatura)} · CAP {ord.capDest}
                </div>
                {opzioni.map((o, i) => (
                  <div
                    key={o.corriereId}
                    style={{
                      ...cardStyle({ background: i === 0 ? "linear-gradient(135deg,#f0fdf4,#ffffff)" : "#fff" }),
                      padding: 14,
                      border: i === 0 ? "1px solid #bbf7d0" : "1px solid #e5edf6",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 12,
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 900, color: "#07153a", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        {o.corriere}
                        {i === 0 ? <span style={badgeStyle("success")}>consigliato</span> : null}
                        {ord.courier === o.corriere ? <span style={badgeStyle("dark")}>SCELTO ✓</span> : null}
                      </div>
                      <div style={{ color: "#66758b", fontSize: 12, marginTop: 2 }}>
                        consegna {o.giorni} gg · zona {o.zona} · {o.scaglione}
                        {o.componenti.imballo > 0 ? ` · imballo ${fmtEur(o.componenti.imballo)} €` : ""}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ fontSize: 20, fontWeight: 950, color: i === 0 ? "#15803d" : "#07153a" }}>
                        {fmtEur(o.totale)} €
                      </div>
                      <button
                        style={compactBtnStyle(ord.courier === o.corriere ? "dark" : "outline")}
                        onClick={() => setOrderCourier(ord.id, o.corriere)}
                        title="Usa questo corriere per la spedizione"
                      >
                        {ord.courier === o.corriere ? "Scelto" : "Usa"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </Modal>

        <Modal
          open={productDialogOpen}
          title="Nuovo prodotto"
          onClose={() => setProductDialogOpen(false)}
          maxWidth={560}
        >
          <div style={{ display: "grid", gap: 18 }}>
            <div>
              <label style={labelStyle()}>Codice prodotto</label>

              <input
                style={inputStyle()}
                value={newProductCode}
                onChange={(event) => setNewProductCode(event.target.value)}
                placeholder="Es. NFARMA 014"
              />
            </div>

            <div>
              <label style={labelStyle()}>Descrizione</label>

              <input
                style={inputStyle()}
                value={newProductName}
                onChange={(event) => setNewProductName(event.target.value)}
                placeholder="Es. Mezzi paccheri 250"
              />
            </div>

            <div>
              <label style={labelStyle()}>Unità di misura</label>

              <input
                style={inputStyle()}
                value={newProductUom}
                onChange={(event) => setNewProductUom(event.target.value)}
                placeholder="pz"
              />
            </div>

            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: 14,
                border: "1px solid #dbe2ea",
                borderRadius: 16,
                background: "#f8fafc",
                fontWeight: 800,
              }}
            >
              <input
                type="checkbox"
                checked={newProductManagesLots}
                onChange={(event) => setNewProductManagesLots(event.target.checked)}
              />
              Gestisci lotti e scadenze per questo prodotto
            </label>

            <button
              style={btnStyle("primary", savingNewProduct)}
              disabled={savingNewProduct}
              onClick={createProduct}
            >
              {savingNewProduct ? "Salvataggio..." : "Salva prodotto"}
            </button>
          </div>
        </Modal>

        <Modal
          open={editLotDialogOpen}
          title="Modifica lotto / disponibilità"
          onClose={() => setEditLotDialogOpen(false)}
          maxWidth={560}
        >
          <div style={{ display: "grid", gap: 18 }}>
            <div>
              <label style={labelStyle()}>Codice lotto (solo lettura)</label>

              <input
                style={inputStyle()}
                value={editingLotCode}
                readOnly
                placeholder="Codice lotto non modificabile dall'app"
              />
            </div>

            <div>
              <label style={labelStyle()}>Scadenza</label>

              <input
                style={inputStyle()}
                type="date"
                value={editingLotExpiry}
                onChange={(event) => setEditingLotExpiry(event.target.value)}
              />
            </div>

            <div>
              <label style={labelStyle()}>Quantità presente (giacenza)</label>

              <input
                style={inputStyle()}
                type="number"
                value={editingLotQty}
                onChange={(event) => setEditingLotQty(event.target.value)}
                placeholder="0"
              />
              <div style={{ fontSize: 12, color: "#617086", marginTop: 6 }}>
                Imposta direttamente la giacenza (può essere anche negativa se il lotto è stato evaso prima di essere caricato).
              </div>
            </div>

            <div style={{ background: "#eefbf2", border: "1px solid #bfe7c8", padding: 12, borderRadius: 12 }}>
              <label style={{ ...labelStyle(), color: "#166534" }}>Aggiungi produzione</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
                <input
                  style={inputStyle()}
                  type="number"
                  min="1"
                  value={addProductionQty}
                  onChange={(e) => setAddProductionQty(e.target.value)}
                  placeholder="Quantità prodotta da aggiungere"
                />
                <button style={btnStyle("outline")} onClick={addProductionToLot} type="button">
                  + Aggiungi
                </button>
              </div>
              <div style={{ fontSize: 12, color: "#166534", marginTop: 6 }}>
                Esempio: giacenza attuale {Number(editingLotQty) || 0}, produzione +N → nuova giacenza {Number(editingLotQty) || 0} + N. Poi premi "Salva" per confermare.
              </div>
            </div>

            <button
              style={btnStyle("primary", savingEditedLot)}
              disabled={savingEditedLot}
              onClick={saveEditedLot}
            >
              {savingEditedLot ? "Salvataggio..." : "Salva modifiche lotto"}
            </button>
          </div>
        </Modal>

        <Modal
          open={lotOnFlyDialog.open}
          title="Crea lotto al volo"
          onClose={() => setLotOnFlyDialog({ open: false, lineId: "", code: "", expiry: "", qty: "" })}
          maxWidth={520}
        >
          <div style={{ display: "grid", gap: 16 }}>
            <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", padding: 12, borderRadius: 12, color: "#7c2d12", fontSize: 13, lineHeight: 1.4 }}>
              Crei un nuovo lotto e gli assegni subito la quantità indicata, anche se in magazzino non c'è ancora la giacenza fisica. Dopo che l'ordine sarà preparato, ricordati di aggiornare la quantità reale del lotto dalla pagina <strong>Prodotti</strong> (può diventare negativa se hai consegnato più di quanto hai prodotto).
            </div>

            <div>
              <label style={labelStyle()}>Codice lotto</label>
              <input
                style={inputStyle()}
                value={lotOnFlyDialog.code}
                onChange={(e) => setLotOnFlyDialog((s) => ({ ...s, code: e.target.value }))}
                placeholder="Es. 2607010"
                autoFocus
              />
            </div>

            <div>
              <label style={labelStyle()}>Scadenza (opzionale)</label>
              <input
                style={inputStyle()}
                type="date"
                value={lotOnFlyDialog.expiry}
                onChange={(e) => setLotOnFlyDialog((s) => ({ ...s, expiry: e.target.value }))}
              />
            </div>

            <div>
              <label style={labelStyle()}>Quantità da assegnare</label>
              <input
                style={inputStyle()}
                type="number"
                min="1"
                value={lotOnFlyDialog.qty}
                onChange={(e) => setLotOnFlyDialog((s) => ({ ...s, qty: e.target.value }))}
                placeholder="0"
              />
              <div style={{ fontSize: 12, color: "#617086", marginTop: 6 }}>
                Il lotto nascerà con questa quantità caricata. La giacenza reale la inserirai dopo, quando avrai prodotto il lotto.
              </div>
            </div>

            <button
              style={btnStyle("primary", savingLotOnFly)}
              disabled={savingLotOnFly}
              onClick={createLotOnFly}
            >
              {savingLotOnFly ? "Creazione in corso..." : "Crea lotto e assegna"}
            </button>
          </div>
        </Modal>

        <Modal
          open={lotDialogOpen}
          title={selectedLotProduct && !productManagesLots(selectedLotProduct) ? "Carica disponibilità" : "Carica lotto"}
          onClose={() => setLotDialogOpen(false)}
          maxWidth={560}
        >
          <div style={{ display: "grid", gap: 18 }}>
            <div>
              <label style={labelStyle()}>Prodotto</label>

              <ProductSearchSelect
                products={products}
                value={newLotProductId}
                search={newLotProductSearch}
                onSearchChange={setNewLotProductSearch}
                onChange={setNewLotProductId}
                placeholder="Cerca prodotto per codice o descrizione"
              />
            </div>

            {selectedLotProduct && productManagesLots(selectedLotProduct) ? (
              <>
                <div>
                  <label style={labelStyle()}>Codice lotto</label>

                  <input
                    style={inputStyle()}
                    value={newLotCode}
                    onChange={(event) => setNewLotCode(event.target.value)}
                    placeholder="Es. 2604110"
                  />
                </div>

                <div>
                  <label style={labelStyle()}>Scadenza</label>

                  <input
                    style={inputStyle()}
                    type="date"
                    value={newLotExpiry}
                    onChange={(event) => setNewLotExpiry(event.target.value)}
                  />
                </div>
              </>
            ) : (
              <div style={{ ...cardStyle({ background: "#f8fafc" }), padding: 14, color: "#40516a" }}>
                Questo prodotto è impostato su disponibilità generica: carichi solo una quantità, senza lotto e senza scadenza.
              </div>
            )}

            <div>
              <label style={labelStyle()}>Quantità caricata</label>

              <input
                style={inputStyle()}
                type="number"
                min="1"
                value={newLotQty}
                onChange={(event) => setNewLotQty(event.target.value)}
                placeholder="0"
              />
            </div>

            <button style={btnStyle("primary")} onClick={createLot}>
              {selectedLotProduct && !productManagesLots(selectedLotProduct) ? "Salva disponibilità" : "Salva lotto"}
            </button>
          </div>
        </Modal>

        <Modal
          open={prodLoadOpen}
          title="📦 Carico di produzione giornaliera"
          onClose={() => setProdLoadOpen(false)}
          maxWidth={620}
        >
          {(() => {
            const prod = products.find((p) => String(p.id) === String(prodProductId));
            const qtyN = Number(prodQty) || 0;
            const kg = prod ? Math.round(qtyN * Number(prod.weightKg || 0) * 100) / 100 : 0;
            const totKgOggi = prodTodayList.reduce((s, r) => s + Number(r.kg || 0), 0);
            return (
              <div style={{ display: "grid", gap: 16 }}>
                <div style={{ ...cardStyle({ background: "#f0fdf4" }), padding: 12, color: "#14532d", fontSize: 13, lineHeight: 1.4, border: "1px solid #bbf7d0" }}>
                  A fine giornata segna cosa è stato prodotto: scegli l'articolo, metti lotto e scadenza, e quante unità sono state realizzate. Aggiorna il magazzino e alimenta il dato di produzione per l'app margini.
                </div>

                <div>
                  <label style={labelStyle()}>Articolo prodotto</label>
                  <ProductSearchSelect
                    products={products}
                    value={prodProductId}
                    search={prodProductSearch}
                    onSearchChange={setProdProductSearch}
                    onChange={(id) => {
                      setProdProductId(id);
                      const p = products.find((x) => String(x.id) === String(id));
                      // Suggerisci la scadenza dell'ultimo lotto dello stesso codice, se c'e'.
                    }}
                    placeholder="Cerca l'articolo per codice o nome"
                  />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: isSmallLayout ? "1fr" : "1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={labelStyle()}>Codice lotto</label>
                    <input
                      style={inputStyle()}
                      value={prodCode}
                      onChange={(e) => setProdCode(e.target.value)}
                      placeholder="Es. 2604110"
                    />
                  </div>
                  <div>
                    <label style={labelStyle()}>Scadenza</label>
                    <input
                      style={inputStyle()}
                      type="date"
                      value={prodExpiry}
                      onChange={(e) => setProdExpiry(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <label style={labelStyle()}>
                    Quantità realizzata {prod ? `(${prod.uom || "unità"})` : ""}
                  </label>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <input
                      style={{ ...inputStyle(), width: 140 }}
                      type="number"
                      min="1"
                      value={prodQty}
                      onChange={(e) => setProdQty(e.target.value)}
                      placeholder="0"
                    />
                    {prod ? (
                      <span style={{ ...badgeStyle(kg > 0 ? "success" : "outline"), fontSize: 14, padding: "8px 14px" }}>
                        = {fmtKg(kg)} kg {Number(prod.weightKg || 0) === 0 ? "· peso non impostato" : `· ${fmtKg(prod.weightKg)} kg/${prod.uom || "unità"}`}
                      </span>
                    ) : null}
                  </div>
                </div>

                <button
                  style={btnStyle("success", savingProdLoad)}
                  disabled={savingProdLoad}
                  onClick={addProductionLoad}
                >
                  <Plus size={18} /> {savingProdLoad ? "Salvo..." : "Aggiungi al carico di oggi"}
                </button>

                {prodTodayList.length > 0 ? (
                  <div style={{ ...cardStyle(), padding: 14, border: "1px solid #e5edf6" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
                      <div style={{ fontWeight: 900, color: "#07153a" }}>Caricati in questa sessione</div>
                      <span style={{ ...badgeStyle("success"), fontSize: 14 }}>
                        {prodTodayList.length} {prodTodayList.length === 1 ? "carico" : "carichi"} · {fmtKg(totKgOggi)} kg
                      </span>
                    </div>
                    <div style={{ display: "grid", gap: 8 }}>
                      {prodTodayList.map((r, i) => (
                        <div
                          key={i}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: 10,
                            padding: "8px 10px",
                            background: i % 2 === 0 ? "#f8fafc" : "#fff",
                            borderRadius: 10,
                            fontSize: 13,
                            flexWrap: "wrap",
                          }}
                        >
                          <div style={{ minWidth: 0 }}>
                            <b style={{ color: "#07153a" }}>{r.code}</b> {r.name}
                            <div style={{ color: "#66758b", fontSize: 12 }}>
                              lotto {r.lot} · scad. {fmtDate(r.expiry)}
                            </div>
                          </div>
                          <div style={{ textAlign: "right", fontWeight: 800, color: "#14532d", whiteSpace: "nowrap" }}>
                            {r.qty} {r.uom || ""} · {fmtKg(r.kg)} kg
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                <button style={btnStyle("outline")} onClick={() => setProdLoadOpen(false)}>
                  Chiudi
                </button>
              </div>
            );
          })()}
        </Modal>

        <Modal
          open={anagOpen}
          title="🗂️ Completa anagrafica cliente"
          onClose={() => setAnagOpen(false)}
          maxWidth={640}
        >
          {(() => {
            const order = orders.find((o) => String(o.id) === String(anagOrderId));
            const a = order ? anagraficaFor(order) : null;
            const mancantiSet = new Set(a?.mancanti || []);
            return (
              <div style={{ display: "grid", gap: 14 }}>
                <div style={{ ...cardStyle({ background: "#eff6ff" }), padding: 12, color: "#1e3a8a", fontSize: 13, lineHeight: 1.4, border: "1px solid #bfdbfe" }}>
                  Inserisci qui i dati mancanti. Restano registrati sul cliente e valgono anche per i suoi ordini futuri: a mano a mano l'anagrafica si completa da sola. In rosso i campi che oggi bloccano l'ordine.
                </div>

                {order ? (
                  <div style={{ color: "#66758b", fontSize: 13 }}>
                    Cliente: <b style={{ color: "#07153a" }}>{order.customer || "—"}</b>
                    {a ? <span style={{ marginLeft: 8, ...badgeStyle(a.stato === "ok" ? "success" : a.stato === "ko" ? "danger" : "outline") }}>{a.label}</span> : null}
                  </div>
                ) : null}

                <div style={{ display: "grid", gridTemplateColumns: isSmallLayout ? "1fr" : "1fr 1fr", gap: 12 }}>
                  {ANAG_FIELDS.map((f) => {
                    const missing = [...mancantiSet].some((m) => m.toLowerCase().startsWith(f.label.split(" (")[0].toLowerCase().slice(0, 10)));
                    return (
                      <div key={f.key}>
                        <label style={{ ...labelStyle(), color: missing ? "#b91c1c" : undefined }}>
                          {f.label}{missing ? " *" : ""}
                        </label>
                        {f.key === "metodo_pagamento" ? (() => {
                          // Lista chiusa. Se il cliente ha gia' un valore scritto a
                          // mano che non e' in lista lo teniamo visibile, marcato:
                          // non si perde il dato e si vede che va sistemato.
                          const attuale = String(anagForm[f.key] ?? "");
                          const fuoriLista = attuale && !METODI_PAGAMENTO.includes(attuale);
                          return (
                            <select
                              style={{ ...inputStyle(), borderColor: missing ? "#fca5a5" : undefined }}
                              value={attuale}
                              onChange={(e) =>
                                setAnagForm((prev) => ({ ...prev, [f.key]: e.target.value }))
                              }
                            >
                              <option value="">— Scegli il metodo —</option>
                              {METODI_PAGAMENTO.map((m) => (
                                <option key={m} value={m}>{m}</option>
                              ))}
                              {fuoriLista ? (
                                <option value={attuale}>{attuale} (vecchio, da sistemare)</option>
                              ) : null}
                            </select>
                          );
                        })() : (
                          <input
                            style={{ ...inputStyle(), borderColor: missing ? "#fca5a5" : undefined }}
                            value={anagForm[f.key] ?? ""}
                            onChange={(e) => setAnagForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                            placeholder={f.label}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>

                <button
                  style={btnStyle("success", savingAnag)}
                  disabled={savingAnag}
                  onClick={saveCompletaAnagrafica}
                >
                  <Plus size={18} /> {savingAnag ? "Salvo..." : "Salva anagrafica"}
                </button>
                <button style={btnStyle("outline")} onClick={() => setAnagOpen(false)}>
                  Annulla
                </button>
              </div>
            );
          })()}
        </Modal>

        <Modal open={chatOpen} title="💬 Chat interna" onClose={closeChat} maxWidth={560}>
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ color: "#66758b", fontSize: 12 }}>
              Chat tra produzione, amministrazione e ordini. Puoi scrivere o inviare un vocale.
            </div>
            <div
              style={{
                maxHeight: "52vh",
                minHeight: 200,
                overflowY: "auto",
                display: "grid",
                gap: 10,
                padding: 4,
                background: "#f8fafc",
                borderRadius: 12,
                border: "1px solid #e5edf6",
              }}
            >
              {chatMessages.length === 0 ? (
                <div style={{ color: "#66758b", textAlign: "center", padding: 24 }}>
                  Nessun messaggio. Scrivi il primo.
                </div>
              ) : (
                chatMessages.map((m) => {
                  const mio = String(m.mittente) === String(authUser?.username);
                  let ora = "";
                  try {
                    ora = new Date(m.creato_il).toLocaleTimeString("it-IT", {
                      hour: "2-digit",
                      minute: "2-digit",
                    });
                  } catch (_) {}
                  return (
                    <div
                      key={m.id}
                      style={{ display: "flex", justifyContent: mio ? "flex-end" : "flex-start" }}
                    >
                      <div
                        style={{
                          maxWidth: "82%",
                          background: mio ? "#0f172a" : "#ffffff",
                          color: mio ? "#fff" : "#0f172a",
                          border: mio ? "none" : "1px solid #e2e8f0",
                          borderRadius: 14,
                          padding: "8px 12px",
                        }}
                      >
                        <div style={{ fontSize: 11, fontWeight: 800, opacity: 0.7, marginBottom: 3 }}>
                          {mio ? "Tu" : m.mittente_etichetta || m.mittente}
                          {ora ? " · " + ora : ""}
                        </div>
                        {m.tipo === "audio" && m.audio ? (
                          <audio controls src={m.audio} style={{ width: 230, maxWidth: "100%" }} />
                        ) : (
                          <div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                            {m.testo}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={chatEndRef} />
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                style={{ ...inputStyle(), flex: 1, minWidth: 0 }}
                value={chatText}
                onChange={(e) => setChatText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !recording) sendChat({ testo: chatText });
                }}
                placeholder={recording ? "Registrazione in corso..." : "Scrivi un messaggio"}
                disabled={recording}
              />
              {recording ? (
                <button style={btnStyle("danger")} onClick={stopRecording} title="Ferma e invia il vocale">
                  ■ Stop
                </button>
              ) : (
                <button
                  style={btnStyle("outline")}
                  onClick={startRecording}
                  title="Registra un messaggio vocale"
                  disabled={chatSending}
                >
                  <Mic size={18} />
                </button>
              )}
              <button
                style={btnStyle("primary", chatSending)}
                disabled={chatSending || recording || !chatText.trim()}
                onClick={() => sendChat({ testo: chatText })}
                title="Invia"
              >
                <Send size={18} />
              </button>
            </div>
          </div>
        </Modal>

        <Modal
          open={fermoDialog.open}
          title={fermoDialog.mode === "modifica" ? "⛔ Motivo del fermo" : "⛔ Perché fermi questo ordine?"}
          onClose={closeFermoDialog}
          maxWidth={560}
        >
          {(() => {
            const ord = orders.find((o) => String(o.id) === String(fermoDialog.orderId));
            return (
              <div style={{ display: "grid", gap: 14 }}>
                <div style={{ ...cardStyle({ background: "#fffbeb" }), padding: 12, color: "#92400e", fontSize: 13, lineHeight: 1.4, border: "1px solid #fcd34d" }}>
                  Scrivi il motivo: lo vedono <b>produzione e logistica</b> sul badge dell'ordine, così sanno perché è bloccato (es. commessa di prodotto ad hoc da fare).
                </div>

                {ord ? (
                  <div style={{ color: "#66758b", fontSize: 13 }}>
                    Ordine: <b style={{ color: "#07153a" }}>{ord.customer || ord.id}</b>
                  </div>
                ) : null}

                <div>
                  <label style={labelStyle()}>Motivi rapidi</label>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {MOTIVI_FERMO.map((m) => (
                      <button
                        key={m}
                        style={compactBtnStyle(fermoMotivo === m ? "dark" : "outline")}
                        onClick={() => setFermoMotivo(m)}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label style={labelStyle()}>Motivo (puoi scriverlo o modificarlo)</label>
                  <textarea
                    style={{ ...inputStyle(), minHeight: 84, resize: "vertical", fontFamily: "inherit" }}
                    value={fermoMotivo}
                    onChange={(e) => setFermoMotivo(e.target.value)}
                    placeholder="Es. commessa 250g personalizzata per il cliente: si produce giovedì"
                  />
                </div>

                <button
                  style={btnStyle("warning", savingFermo)}
                  disabled={savingFermo}
                  onClick={confirmFermo}
                >
                  <AlertTriangle size={18} />
                  {savingFermo
                    ? "Salvo..."
                    : fermoDialog.mode === "modifica"
                    ? "Salva motivo"
                    : "Metti in fermo con questo motivo"}
                </button>
                <button style={btnStyle("outline")} onClick={closeFermoDialog}>
                  Annulla
                </button>
              </div>
            );
          })()}
        </Modal>
      </div>
    </div>
  );
}
