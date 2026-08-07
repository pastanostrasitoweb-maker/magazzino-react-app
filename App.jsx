// hotfix assegnazione prodotti senza lotto su ID disponibilità reale
import React, { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { callSheetsApi, aggiornaStatoOrdineApp, nettoRiga } from "./src/supabase-adapter.js";
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
  ChevronDown,
  MoreHorizontal,
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
    info: { border: "1px solid #c7d2fe", background: "#eef2ff", color: "#3730a3" },
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
// I METODI DI PAGAMENTO, IN FORMA CANONICA (Luca 06/08/2026)
//
// "Ci dobbiamo avere la sicurezza del metodo di pagamento, che lo leggi. Fai in
// modo che i contrassegni e le riba siano perfettamente allineati: o lo metti
// all'inizio o lo metti alla fine."
//
// La forma e' sempre  <MEZZO> <giorni> gg <decorrenza>
// mezzo in TESTA, decorrenza in CODA, "gg" scritto sempre uguale, "data fattura"
// e "fine mese" per esteso. Cosi' chi legge trova il mezzo dove se lo aspetta e
// il termine dove se lo aspetta, e la stessa forma la sa leggere il database
// (sql/metodo_pagamento_canonico.sql) per calcolarci la scadenza.
//
// Raggruppati per mezzo, e non piu' mescolati: tutti i contrassegni insieme,
// tutte le Ri.Ba. insieme, tutti i bonifici insieme. Prima "Bonifico 30 gg" e
// "Ri.Ba. 30 gg fine mese" erano a due righe di distanza in un elenco unico di
// diciannove voci, ed e' li' che si sbaglia riga.
//
// "Bonifico 30 gg" senza decorrenza NON c'e' piu': era la voce che lasciava il
// dubbio, e fra data fattura e fine mese su una fattura del 3 agosto ballano 28
// giorni di incasso.
const GRUPPI_PAGAMENTO = [
  {
    titolo: "Contrassegno — si incassa alla consegna",
    voci: ["Contrassegno contanti", "Contrassegno assegno"],
  },
  {
    titolo: "Ri.Ba.",
    voci: [
      "Ri.Ba. 30 gg data fattura",
      "Ri.Ba. 30 gg fine mese",
      "Ri.Ba. 60 gg data fattura",
      "Ri.Ba. 60 gg fine mese",
      "Ri.Ba. 90 gg data fattura",
      "Ri.Ba. 90 gg fine mese",
    ],
  },
  {
    titolo: "Bonifico",
    voci: [
      "Bonifico anticipato",
      "Bonifico alla consegna",
      "Bonifico fine mese",
      "Bonifico 30 gg data fattura",
      "Bonifico 30 gg fine mese",
      "Bonifico 60 gg data fattura",
      "Bonifico 60 gg fine mese",
      "Bonifico 90 gg data fattura",
      "Bonifico 90 gg fine mese",
    ],
  },
  {
    titolo: "Altro — si incassa subito",
    voci: ["Assegno", "Carta di credito", "Carta / POS"],
  },
];

const METODI_PAGAMENTO = GRUPPI_PAGAMENTO.flatMap((g) => g.voci);

// Un metodo e' "leggibile" se sta nella lista canonica: solo di quelli il
// database sa dire quando si incassa. "Bonifico" secco, "TRANSFER", "RIBA" e
// "CONTRASSEGNO" non lo sono: dicono il mezzo ma non il termine, e senza termine
// non c'e' scadenza. "Da concordare" e' fuori dalla lista per lo stesso motivo:
// e' un promemoria, non una condizione di pagamento.
function metodoLeggibile(metodo) {
  return METODI_PAGAMENTO.includes(String(metodo || "").trim());
}

// Dal 03/08/2026 comanda il magazzino, e da quella data i metodi devono essere
// in forma canonica. Il pregresso non si rincorre: quegli ordini sono chiusi e
// le loro partite le governa il Cashflow (Luca: "a me interessa che sia
// allineato dal 03.08").
const PAGAMENTI_ALLINEATI_DAL = "2026-08-03";

// Quando si incassa, calcolato come lo calcola il database
// (scadenza_da_metodo in sql/metodo_pagamento_canonico.sql). Serve a scriverlo
// accanto alla scelta: chi mette "60 gg fine mese" deve vedere che data esce,
// non fidarsi. Se le due formule divergono si vede subito, perche' il numero a
// schermo e quello del Cashflow non coinciderebbero.
//
// "fine mese" e' fine del mese del documento, POI i giorni: non data + giorni.
function scadenzaDaMetodo(dataOrdine, metodo) {
  const m = String(metodo || "").trim();
  if (!metodoLeggibile(m) || !dataOrdine) return null;
  const d = new Date(dataOrdine);
  if (Number.isNaN(d.getTime())) return null;

  // Incasso immediato: la merce e i soldi si incrociano sul furgone.
  if (/^Contrassegno/.test(m) || /anticipato$/.test(m) || /alla consegna$/.test(m) ||
      ["Assegno", "Carta di credito", "Carta / POS"].includes(m)) {
    return d;
  }

  const gg = Number((m.match(/(\d+)/) || [0, 0])[1]);
  const base = /fine mese$/.test(m)
    ? new Date(d.getFullYear(), d.getMonth() + 1, 0)
    : new Date(d.getFullYear(), d.getMonth(), d.getDate());
  base.setDate(base.getDate() + gg);
  return base;
}

// Il metodo di un ordine si scrive UNA volta. Vale quello dell'ordine se c'e' ed
// e' leggibile (la deroga: capita che una singola vendita si incassi in modo
// diverso dal solito), altrimenti quello dell'ANAGRAFICA del cliente.
//
// "Non far inserire le informazioni due volte: se il metodo di pagamento lo metto
// sull'anagrafica deve essere quello, non me lo deve richiedere in fase di ordine.
// Richiedilo solo se non e' conforme." (Luca 06/08/2026)
function metodoEffettivo(metodoOrdine, metodoCliente) {
  if (metodoLeggibile(metodoOrdine)) return String(metodoOrdine).trim();
  if (metodoLeggibile(metodoCliente)) return String(metodoCliente).trim();
  // Niente di leggibile: si tiene quello che c'e' scritto sull'ordine, che
  // almeno dice da dove partire per correggere.
  return String(metodoOrdine || metodoCliente || "").trim();
}

function pagamentoDaSistemare(order, metodoCliente) {
  if (!order) return false;
  const data = String(order.date || "").slice(0, 10);
  if (data && data < PAGAMENTI_ALLINEATI_DAL) return false;
  return !metodoLeggibile(metodoEffettivo(order.metodoPagamento, metodoCliente));
}

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

// Un bottone che apre un elenco di scelte, invece di N bottoni in fila.
// Nato perche' la barra in alto era arrivata a 16 voci e quella dell'ordine a
// 7: tutto allo stesso peso, quindi niente in evidenza (Luca 03/08/2026).
// Le voci si passano come array: { label, icona, onClick, attivo, badge,
// pericolo, separatoreSopra }.
function MenuScelte({ titolo, icona, voci, variante = "soft", attivo = false, larghezza = 260, badge = null }) {
  const [aperto, setAperto] = useState(false);
  const box = useRef(null);

  // Si chiude cliccando fuori o con Esc: un menu che resta aperto addosso
  // agli altri comandi e' peggio dei bottoni che voleva sostituire.
  useEffect(() => {
    if (!aperto) return;
    const fuori = (e) => { if (box.current && !box.current.contains(e.target)) setAperto(false); };
    const esc = (e) => { if (e.key === "Escape") setAperto(false); };
    document.addEventListener("mousedown", fuori);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fuori);
      document.removeEventListener("keydown", esc);
    };
  }, [aperto]);

  const visibili = (voci || []).filter(Boolean);
  if (!visibili.length) return null;

  return (
    <div ref={box} style={{ position: "relative", display: "inline-flex" }}>
      <button
        style={{ ...btnStyle(attivo ? "primary" : variante), borderRadius: 999, whiteSpace: "nowrap" }}
        onClick={() => setAperto((v) => !v)}
        aria-expanded={aperto}
      >
        {icona}
        {titolo}
        {badge != null && badge > 0 ? (
          <span style={{ ...badgeStyle("warning"), marginLeft: 2 }}>{badge}</span>
        ) : null}
        <ChevronDown size={16} style={{ transform: aperto ? "rotate(180deg)" : "none", transition: "transform 120ms" }} />
      </button>

      {aperto ? (
        <div
          style={{
            position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 60,
            minWidth: larghezza, background: "#fff", borderRadius: 16,
            border: "1px solid #e5edf6", boxShadow: "0 18px 40px rgba(7,21,58,.16)",
            padding: 6, display: "grid", gap: 2,
          }}
        >
          {visibili.map((v, i) => (
            <React.Fragment key={v.label + i}>
              {v.separatoreSopra ? (
                <div style={{ height: 1, background: "#eef2f7", margin: "4px 6px" }} />
              ) : null}
              <button
                style={{
                  display: "flex", alignItems: "center", gap: 10, width: "100%",
                  padding: "10px 12px", borderRadius: 10, border: "none", cursor: "pointer",
                  textAlign: "left", fontSize: 14, fontWeight: v.attivo ? 900 : 700,
                  background: v.attivo ? "#eef4ff" : "transparent",
                  color: v.pericolo ? "#b91c1c" : v.attivo ? "#07153a" : "#40516a",
                }}
                onMouseEnter={(e) => { if (!v.attivo) e.currentTarget.style.background = "#f6f9fc"; }}
                onMouseLeave={(e) => { if (!v.attivo) e.currentTarget.style.background = "transparent"; }}
                onClick={() => { setAperto(false); v.onClick(); }}
              >
                {v.icona}
                <span style={{ flex: 1 }}>{v.label}</span>
                {v.badge != null && v.badge > 0 ? (
                  <span style={badgeStyle(v.badgeTipo || "warning")}>{v.badge}</span>
                ) : null}
              </button>
            </React.Fragment>
          ))}
        </div>
      ) : null}
    </div>
  );
}


// Le sedi di CONSEGNA di un cliente. Una ragione sociale puo' avere piu'
// negozi, e chi spedisce sceglie dove mandare la merce (Luca 04-05/08/2026).
//
// Qui sta l'UNICA verita' sull'indirizzo di consegna. Prima c'era anche un
// campo "Indirizzo di spedizione" nell'anagrafica, e il DDT leggeva la
// destinazione: due posti per lo stesso dato, quindi su GIOIA S.R.L. il
// documento e' uscito con la sede legale invece che col negozio.
function SediConsegna({ codiceCliente, sedi, onSalva, onDisattiva, apriNuovaSubito = false }) {
  const [apertaId, setApertaId] = useState("");
  const [bozza, setBozza] = useState(null);
  const [salvando, setSalvando] = useState(false);

  const vuota = () => ({
    id: "", codice_cliente: codiceCliente, etichetta: "", insegna: "",
    via: "", civico: "", cap: "", localita: "", provincia: "",
    telefono: "", orari_consegna: "", giorno_chiusura: "",
    predefinita: (sedi || []).length === 0,
  });

  const apri = (d) => {
    setApertaId(d ? String(d.id) : "nuova");
    setBozza(d ? { ...d, codice_cliente: codiceCliente } : vuota());
  };

  // Chi arriva qui dal bollino "+ Aggiungi un negozio" vuole scrivere un
  // indirizzo, non leggere l'elenco di quelli che ha gia': il modulo si apre
  // subito, altrimenti sono due click per la stessa intenzione.
  useEffect(() => {
    if (apriNuovaSubito && !apertaId) {
      setApertaId("nuova");
      setBozza(vuota());
    }
  }, [apriNuovaSubito]);

  const salva = async () => {
    if (!String(codiceCliente || "").trim()) {
      alert(
        "Questo ordine non ha ancora un codice cliente, quindi il negozio non " +
        "saprebbe a chi appartenere. Assegna prima il codice al cliente."
      );
      return;
    }
    if (!String(bozza.via || "").trim()) {
      alert("Serve almeno la via: senza, il documento non dice dove va la merce.");
      return;
    }
    setSalvando(true);
    try {
      await onSalva(bozza);
      setApertaId(""); setBozza(null);
    } finally {
      setSalvando(false);
    }
  };

  const campo = (chiave, etichetta, larghezza) => (
    <div style={{ flex: larghezza || 1, minWidth: 90 }}>
      <label style={{ ...labelStyle(), fontSize: 11 }}>{etichetta}</label>
      <input
        style={{ ...inputStyle(), height: 38 }}
        value={bozza[chiave] ?? ""}
        onChange={(e) => setBozza((p) => ({ ...p, [chiave]: e.target.value }))}
      />
    </div>
  );

  if (!codiceCliente) {
    return (
      <div style={{ fontSize: 12, color: "#8a94a6" }}>
        Il cliente non ha ancora un codice: le sedi di consegna si aggiungono dopo averlo registrato.
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      {(sedi || []).map((d) => (
        <div key={d.id} style={{
          border: "1px solid " + (d.predefinita ? "#bbf7d0" : "#e5edf6"),
          background: d.predefinita ? "#f0fdf4" : "#fff",
          borderRadius: 10, padding: "8px 10px",
          display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap",
        }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#07153a" }}>
              {d.etichetta || "Sede"}
              {d.predefinita ? (
                <span style={{ ...badgeStyle("success"), marginLeft: 6 }}>predefinita</span>
              ) : null}
            </div>
            <div style={{ fontSize: 12, color: "#40516a" }}>
              {[d.via, d.civico].filter(Boolean).join(" ")}
              {d.cap || d.localita ? ` · ${[d.cap, d.localita].filter(Boolean).join(" ")}` : ""}
              {d.provincia ? ` (${d.provincia})` : ""}
            </div>
            {d.orari_consegna || d.giorno_chiusura || d.telefono ? (
              <div style={{ fontSize: 11, color: "#8a94a6", marginTop: 2 }}>
                {[d.orari_consegna && `orario ${d.orari_consegna}`,
                  d.giorno_chiusura && `chiuso ${d.giorno_chiusura}`,
                  d.telefono && `tel ${d.telefono}`].filter(Boolean).join(" · ")}
              </div>
            ) : null}
          </div>
          <button style={compactBtnStyle("outline")} onClick={() => apri(d)}>Modifica</button>
          {!d.predefinita ? (
            <button
              style={compactBtnStyle("outline")}
              onClick={() => onSalva({ ...d, codice_cliente: codiceCliente, predefinita: true })}
              title="Diventa quella proposta sui nuovi ordini"
            >
              Rendi predefinita
            </button>
          ) : null}
          {(sedi || []).length > 1 && !d.predefinita ? (
            <button
              style={{ ...compactBtnStyle("outline"), color: "#b91c1c" }}
              onClick={() => {
                if (window.confirm(`Togliere la sede "${d.etichetta || "Sede"}"?\n\nResta sui documenti gia' emessi, sparisce solo dalle scelte future.`)) {
                  onDisattiva(d.id);
                }
              }}
            >
              Togli
            </button>
          ) : null}
        </div>
      ))}

      {apertaId ? (
        <div style={{ border: "1px solid #dbe2ea", borderRadius: 10, padding: 10, background: "#f8fafc" }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {campo("etichetta", "Come la chiami (es. Negozio Centro)", 2)}
            {campo("insegna", "Insegna, se diversa", 2)}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
            {campo("via", "Indirizzo", 3)}
            {campo("civico", "Civico", 1)}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
            {campo("cap", "CAP", 1)}
            {campo("localita", "Località", 2)}
            {campo("provincia", "Prov.", 1)}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
            {campo("orari_consegna", "Orario di scarico", 2)}
            {campo("giorno_chiusura", "Giorno di chiusura", 1)}
            {campo("telefono", "Telefono del punto", 1)}
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={!!bozza.predefinita}
                onChange={(e) => setBozza((p) => ({ ...p, predefinita: e.target.checked }))}
                style={{ width: 15, height: 15, accentColor: "#15803d" }}
              />
              È la sede predefinita
            </label>
            <button style={{ ...compactBtnStyle("primary"), marginLeft: "auto" }} disabled={salvando} onClick={salva}>
              {salvando ? "Salvo…" : "Salva sede"}
            </button>
            <button style={compactBtnStyle("outline")} onClick={() => { setApertaId(""); setBozza(null); }}>
              Annulla
            </button>
          </div>
        </div>
      ) : (
        <button style={compactBtnStyle("outline")} onClick={() => apri(null)}>
          <Plus size={15} /> Aggiungi una sede di consegna
        </button>
      )}
    </div>
  );
}


// IL bollino del corriere. Uno solo, uguale su Ordini, Preparati, Spediti e
// Archivio (Luca 05/08/2026: "su alcune spedizioni non fa comparire il
// corriere, il layout e i bottoni devono essere uguali per tutti").
//
// Prima ogni schermata aveva il suo, e nei Preparati compariva SOLO se il
// preventivo si riusciva a calcolare: senza CAP o senza peso spariva del
// tutto, quindi non si vedeva che il corriere mancava e non lo si poteva
// nemmeno scegliere. Ora c'e' sempre, in uno di tre stati:
//   scelto      -> nome del corriere, scuro
//   suggerito   -> proposta del preventivo col costo, da confermare
//   mancante    -> rosso, e cliccarlo apre le opzioni
function BadgeCorriere({ order, onApri, compatto = false }) {
  const scelto = String(order?.courier || order?.courierSpedizione || "").trim();
  const suggerito = order?.transport && !order.transport.errore
    ? order.transport.consigliato
    : null;

  const base = {
    border: "1px solid #cfd8e6", cursor: onApri ? "pointer" : "default",
    fontSize: compatto ? 11.5 : 12.5, whiteSpace: "nowrap",
  };

  if (scelto) {
    return (
      <button
        style={{ ...badgeStyle("dark"), ...base }}
        onClick={onApri}
        title="Corriere scelto. Clicca per cambiarlo."
      >
        🚚 {scelto.toUpperCase()}
      </button>
    );
  }
  if (suggerito) {
    return (
      <button
        style={{ ...badgeStyle("outline"), ...base }}
        onClick={onApri}
        title="Proposta del preventivo: va confermata, non e' ancora una scelta."
      >
        🚚 {suggerito.corriere} · {fmtEur(suggerito.totale)} € <b>da confermare</b>
      </button>
    );
  }
  return (
    <button
      style={{ ...badgeStyle("danger"), ...base }}
      onClick={onApri}
      title="Nessun corriere: clicca per sceglierlo o scriverlo a mano"
    >
      ⚠️ CORRIERE MANCANTE
    </button>
  );
}

function SchedaCliente({
  cliente, override, sedi, agenti, listini,
  onCrea, onSalva, onSalvaSede, onDisattivaSede, onChiudi,
}) {
  const nuovo = !cliente;
  const [f, setF] = useState(() => {
    const base = {};
    for (const g of CAMPI_SCHEDA) for (const c of g.campi) base[c.key] = "";
    const ov = override || {};
    for (const k of Object.keys(base)) base[k] = String(ov[k] ?? "");
    if (cliente) {
      if (!base.ragione_sociale) base.ragione_sociale = cliente.name || "";
      if (!base.partita_iva) base.partita_iva = cliente.piva || "";
      if (!base.codice_fiscale) base.codice_fiscale = cliente.codiceFiscale || "";
      if (!base.email) base.email = cliente.email || "";
      if (!base.telefono) base.telefono = cliente.telefono || "";
      if (!base.sede_localita) base.sede_localita = cliente.citta || "";
      if (!base.sede_provincia) base.sede_provincia = cliente.provincia || "";
      if (!base.sede_cap) base.sede_cap = cliente.cap || "";
      if (!base.codice_univoco) base.codice_univoco = cliente.codiceDestinatarioTs || "";
    }
    base.tipologia = String(ov.tipologia || (cliente ? normalizeTipologia(cliente.category) : "") || "");
    base.metodo_pagamento = String(ov.metodo_pagamento || "");
    base.agente_nome = String(ov.agente_nome || "");
    base.listino_standard = String(ov.listino_standard || "");
    base.fonte_prezzi = String(ov.fonte_prezzi || "listino");
    for (const k of ["sconto1_pct", "sconto2_pct", "sconto3_pct"]) {
      base[k] = ov[k] === null || ov[k] === undefined ? "" : String(ov[k]);
    }
    return base;
  });
  const [salvando, setSalvando] = useState(false);

  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  // Manca qualcosa di bloccante? Le stesse cose che bloccano il DDT, dette qui
  // mentre si scrive invece che scoperte al momento di spedire.
  const mancano = [];
  if (!String(f.ragione_sociale || "").trim()) mancano.push("ragione sociale");
  if (!String(f.partita_iva || "").trim()) mancano.push("partita IVA");
  if (!String(f.sede_via || "").trim()) mancano.push("via della sede legale");
  if (!String(f.sede_cap || "").trim()) mancano.push("CAP");
  if (!String(f.sede_localita || "").trim()) mancano.push("localita'");
  if (!String(f.agente_nome || "").trim()) mancano.push("agente");
  if (!metodoLeggibile(f.metodo_pagamento)) mancano.push("metodo di pagamento");

  const salva = async () => {
    if (!String(f.ragione_sociale || "").trim()) {
      alert("La ragione sociale serve: e' quella che finisce sul documento.");
      return;
    }
    setSalvando(true);
    try {
      await (nuovo ? onCrea(f) : onSalva(cliente, f));
    } finally {
      setSalvando(false);
    }
  };

  const riquadro = (titolo, dentro) => (
    <div style={{
      border: "1px solid #dbe2ea", borderRadius: 12, padding: 12,
      background: "#fff", marginBottom: 12,
    }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: "#40516a", marginBottom: 8 }}>{titolo}</div>
      {dentro}
    </div>
  );

  return (
    <div style={{ display: "grid", gap: 0 }}>
      {mancano.length ? (
        <div style={{
          ...cardStyle({ background: "#fef2f2" }), padding: 10, marginBottom: 12,
          border: "1px solid #fecaca", color: "#991b1b", fontSize: 12.5, lineHeight: 1.45,
        }}>
          Senza questi il DDT non si fa e l'ordine non si archivia: <b>{mancano.join(", ")}</b>.
        </div>
      ) : null}

      {CAMPI_SCHEDA.map((g) =>
        riquadro(g.titolo,
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {g.campi.map((c) => (
              <div key={c.key} style={{ flex: c.largo ? "1 1 100%" : "1 1 140px", minWidth: 120 }}>
                <label style={{ ...labelStyle(), fontSize: 11 }}>
                  {c.label}{c.obbligatorio ? " *" : ""}
                </label>
                <input
                  style={{ ...inputStyle(), height: 38 }}
                  value={f[c.key] ?? ""}
                  onChange={set(c.key)}
                />
              </div>
            ))}
          </div>
        )
      )}

      {riquadro("Condizioni commerciali",
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div style={{ flex: "1 1 220px" }}>
              <label style={{ ...labelStyle(), fontSize: 11 }}>Metodo di pagamento *</label>
              <select style={{ ...inputStyle(), height: 38 }} value={f.metodo_pagamento} onChange={set("metodo_pagamento")}>
                <option value="">— scegli —</option>
                {GRUPPI_PAGAMENTO.map((g) => (
                  <optgroup key={g.titolo} label={g.titolo}>
                    {g.voci.map((m) => <option key={m} value={m}>{m}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>
            <div style={{ flex: "1 1 180px" }}>
              <label style={{ ...labelStyle(), fontSize: 11 }}>Agente *</label>
              <select style={{ ...inputStyle(), height: 38 }} value={f.agente_nome} onChange={set("agente_nome")}>
                <option value="">— scegli —</option>
                {(agenti || []).map((a, i) => (
                  <option key={`${a.id || a.nome || a.name || "ag"}-${i}`} value={a.nome || a.name || ""}>
                    {a.nome || a.name}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ flex: "1 1 140px" }}>
              <label style={{ ...labelStyle(), fontSize: 11 }}>Tipologia</label>
              <select style={{ ...inputStyle(), height: 38 }} value={f.tipologia} onChange={set("tipologia")}>
                <option value="">—</option>
                {["HORECA", "FARMA", "GDO", "EXPORT", "BIOLOGICO"].map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div style={{ flex: "1 1 260px" }}>
              <label style={{ ...labelStyle(), fontSize: 11 }}>I prezzi da</label>
              <select style={{ ...inputStyle(), height: 38 }} value={f.fonte_prezzi} onChange={set("fonte_prezzi")}>
                <option value="listino">Listino, storico dove il listino non arriva</option>
                <option value="solo-listino">Solo listino, mai lo storico</option>
                <option value="storico">Storico, listino dove lo storico non arriva</option>
              </select>
            </div>
            <div style={{ flex: "1 1 200px" }}>
              <label style={{ ...labelStyle(), fontSize: 11 }}>Listino</label>
              <select style={{ ...inputStyle(), height: 38 }} value={f.listino_standard} onChange={set("listino_standard")}>
                <option value="">— quello del gestionale —</option>
                <option value="1">Listino 1 · base</option>
                <option value="8">Listino 8 · Ho.Re.Ca.</option>
              </select>
            </div>
            {["sconto1_pct", "sconto2_pct", "sconto3_pct"].map((k, i) => (
              <div key={k} style={{ flex: "0 0 84px" }}>
                <label style={{ ...labelStyle(), fontSize: 11 }}>{`Sc ${i + 1} %`}</label>
                <input style={{ ...inputStyle(), height: 38 }} type="number" step="0.1" min="0" max="100"
                  value={f[k] ?? ""} onChange={set(k)} />
              </div>
            ))}
            {(() => {
              const sc = ["sconto1_pct", "sconto2_pct", "sconto3_pct"]
                .map((k) => Number(String(f[k] ?? "").replace(",", ".")) || 0);
              if (!sc.some((x) => x > 0)) return null;
              const netto = 100 * (1 - sc[0] / 100) * (1 - sc[1] / 100) * (1 - sc[2] / 100);
              return (
                <span style={{ fontSize: 12, color: "#15803d", fontWeight: 700, paddingBottom: 10 }}>
                  su 100 € paga {netto.toFixed(2)} €
                </span>
              );
            })()}
          </div>
          <div style={{ fontSize: 11.5, color: "#66758b", lineHeight: 1.45 }}>
            Gli sconti sono in cascata e valgono sui prezzi di listino. Lasciarli vuoti non e' come
            scrivere zero: vuoto usa lo sconto ricavato dalle fatture di questo cliente, zero vuol
            dire prezzo pieno.
          </div>
        </div>
      )}

      {/* LE SEDI, dentro la scheda e non piu' dentro un ordine. Su un cliente
          nuovo il modulo compare dopo il salvataggio: una sede ha bisogno del
          codice cliente, e il codice lo assegna il registro al primo salvataggio. */}
      {riquadro("Sedi di consegna",
        nuovo ? (
          <div style={{ fontSize: 12.5, color: "#66758b", lineHeight: 1.45 }}>
            Salva prima il cliente: la sede si attacca al suo codice, e il codice lo assegna il
            registro adesso. Appena salvato, il modulo compare qui.
          </div>
        ) : (
          <SediConsegna
            codiceCliente={String(cliente.id)}
            sedi={sedi || []}
            onSalva={onSalvaSede}
            onDisattiva={onDisattivaSede}
          />
        )
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button style={btnStyle("primary")} onClick={salva} disabled={salvando}>
          {salvando ? "Salvo…" : nuovo ? "Crea cliente" : "Salva modifiche"}
        </button>
        <button style={btnStyle("outline")} onClick={onChiudi} disabled={salvando}>
          Chiudi
        </button>
        {!nuovo ? (
          <span style={{ fontSize: 12, color: "#8a94a6", alignSelf: "center" }}>
            Codice cliente <b style={{ color: "#07153a" }}>{cliente.id}</b>
            {cliente.codeTs ? ` · gestionale ${cliente.codeTs}` : ""}
          </span>
        ) : null}
      </div>
    </div>
  );
}

// LA SCHEDA CLIENTE: un posto solo per crearlo e per correggerlo.
//
// RICHIESTA DI LUCA (06/08/2026): "dai in modo ordinato la possibilita' di
// aggiungere un nuovo cliente da app magazzino, con dentro tutti i campi
// necessari per l'anagrafica. Inoltre deve esserci anche la sezione aggiungi sede,
// ma deve essere tutto sotto crea nuovo cliente. Poi serve una sezione clienti
// dove possiamo vederli tutti ed eventualmente modificarli."
//
// PERCHE' SERVIVA. Prima un cliente si poteva completare solo passando da un suo
// ORDINE ("Completa anagrafica"), quindi un cliente nuovo lo si creava a meta' e
// il resto si scriveva la prima volta che ordinava. E le sedi di consegna stavano
// dentro quel modale, cioe' raggiungibili solo da un ordine.
//
// I dati stanno in tre posti diversi e questa scheda li tiene insieme:
//   `clienti` / registro   ragione sociale, P.IVA, codice fiscale, il CODICE nostro
//   `clienti_override`     indirizzi, orari, pagamento, listino, sconti, agente
//   `clienti_destinazioni` i negozi dove va la merce
// Salvando si scrive in tutti e tre nell'ordine giusto, perche' le sedi hanno
// bisogno del codice e il codice lo assegna il registro.
const CAMPI_SCHEDA = [
  {
    titolo: "Chi e'",
    campi: [
      { key: "ragione_sociale", label: "Ragione sociale", largo: true, obbligatorio: true },
      { key: "insegna", label: "Insegna (se diversa)" },
      { key: "partita_iva", label: "Partita IVA", obbligatorio: true },
      { key: "codice_fiscale", label: "Codice fiscale" },
    ],
  },
  {
    titolo: "Sede legale",
    campi: [
      { key: "sede_via", label: "Via", largo: true },
      { key: "sede_civico", label: "Civico" },
      { key: "sede_cap", label: "CAP" },
      { key: "sede_localita", label: "Localita'" },
      { key: "sede_provincia", label: "Provincia" },
    ],
  },
  {
    titolo: "Fatturazione elettronica",
    campi: [
      { key: "codice_univoco", label: "Codice destinatario (SdI)" },
      { key: "pec", label: "PEC" },
    ],
  },
  {
    titolo: "Contatti",
    campi: [
      { key: "email", label: "Email" },
      { key: "telefono", label: "Telefono referente" },
    ],
  },
  {
    titolo: "Consegna",
    campi: [
      { key: "orari_consegna", label: "Orario di scarico (finestra min 3 ore)", largo: true },
      { key: "giorno_chiusura", label: "Giorno di chiusura" },
    ],
  },
  {
    titolo: "Note da stampare sui documenti",
    campi: [{ key: "note", label: "Note (finiscono sul DDT e sulla conferma d'ordine)", largo: true }],
  },
];

// COME si incassa questo ordine, e se la scadenza si sa calcolare.
//
// "Se putacaso e' stato caricato male un metodo di pagamento, abbiamo la
// possibilita' di cliccare li' e metterci uno che tu vedi e ci crei una corretta
// scadenza. Altrimenti perdiamo i soldi." (Luca 06/08/2026)
//
// Rosso quando il metodo non e' leggibile: allora la scadenza nel Cashflow e' un
// 30 giorni messo a caso (condizione_certa = false) e nessuno lo sa. Scegliendo
// dalla tendina si riscrivono insieme il metodo E la scadenza della partita.
// Verde scarico quando e' a posto: si legge senza dover cliccare.
function BadgePagamento({ order, metodoCliente, onScegli, compatto = false }) {
  const attuale = metodoEffettivo(order?.metodoPagamento, metodoCliente);
  const leggibile = metodoLeggibile(attuale);
  const daSistemare = pagamentoDaSistemare(order, metodoCliente);
  // Da dove arriva: serve saperlo, perche' cambiarlo qui vale solo per QUESTO
  // ordine, mentre quello dell'anagrafica vale per tutti i suoi.
  const dallAnagrafica = !metodoLeggibile(order?.metodoPagamento) && metodoLeggibile(metodoCliente);
  const base = {
    fontSize: compatto ? 11.5 : 12.5, whiteSpace: "nowrap",
    border: "1px solid #cfd8e6", cursor: "pointer",
    appearance: "none", WebkitAppearance: "none", paddingRight: 22,
    backgroundImage:
      "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6'><path d='M0 0h10L5 6z' fill='%23667'/></svg>\")",
    backgroundRepeat: "no-repeat",
    backgroundPosition: "right 7px center",
  };

  return (
    <select
      style={{ ...badgeStyle(daSistemare ? "danger" : "outline"), ...base }}
      value={leggibile ? attuale : ""}
      title={
        daSistemare
          ? (attuale
              ? `"${attuale}" non dice quando si incassa: la scadenza a Cashflow e' messa a caso. Scegli il metodo giusto.`
              : "Metodo di pagamento mancante: la scadenza a Cashflow e' messa a caso.")
          : `${attuale}${dallAnagrafica ? " (dall'anagrafica del cliente)" : ""} — la scadenza si calcola da qui. Cambiandolo qui vale solo per questo ordine.`
      }
      onChange={(e) => { if (e.target.value) onScegli(e.target.value); }}
    >
      {/* La voce di testa c'e' ogni volta che il valore attuale non sta nella
          lista: senza, il browser mostrerebbe la PRIMA opzione del menu, e un
          ordine col metodo vuoto sembrerebbe in contrassegno. Un campo vuoto che
          si spaccia per una condizione di pagamento e' peggio di un campo vuoto.
          Prima del 03/08 non e' un errore da correggere, e' solo storia: si dice
          cosi' com'e', senza il rosso e senza chiedere niente. */}
      {leggibile ? null : (
        <option value="">
          {daSistemare
            ? (attuale ? `💸 DA SISTEMARE: ${attuale}` : "💸 PAGAMENTO MANCANTE")
            : (attuale ? `${attuale} (vecchio)` : "— pagamento non indicato")}
        </option>
      )}
      {GRUPPI_PAGAMENTO.map((g) => (
        <optgroup key={g.titolo} label={g.titolo}>
          {g.voci.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

// DOVE va la merce, per QUESTO ordine. Una ragione sociale puo' avere piu'
// negozi, e due ordini dello stesso cliente possono andare in due posti diversi:
// prima si poteva solo eleggere una sede predefinita, che valeva per tutti gli
// ordini insieme, e quindi non si potevano mandare da due parti (Luca 05/08/2026).
//
// Il bollino c'e' SEMPRE, come quello del corriere, anche con un negozio solo:
// chi spedisce deve leggere dove sta mandando la merce senza aprire niente.
// Prima compariva solo da due negozi in su, e siccome su 1.519 clienti solo due
// ne hanno piu' di uno, in pratica non si vedeva mai.
//
// E' una tendina travestita da bollino, non un bottone in piu': la scelta si fa
// dove la si legge. L'ultima voce aggiunge un negozio nuovo, perche' il secondo
// punto vendita quasi sempre non esiste ancora nel momento in cui serve.
function BadgeDestinazione({ order, sedi, scelta, onScegli, onAggiungi, compatto = false }) {
  // Gli ordini archiviati di prima dei codici cliente non hanno un cliente a cui
  // attaccare un negozio: li' il bollino tace, invece di chiedere in rosso una
  // cosa a cui non si puo' rispondere. Sono 151 documenti gia' partiti.
  if (!String(order?.clientId || "").trim()) return null;
  const base = {
    fontSize: compatto ? 11.5 : 12.5, whiteSpace: "nowrap",
    border: "1px solid #cfd8e6", cursor: "pointer",
    appearance: "none", WebkitAppearance: "none",
    paddingRight: 22,
    backgroundImage:
      "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6'><path d='M0 0h10L5 6z' fill='%23667'/></svg>\")",
    backgroundRepeat: "no-repeat",
    backgroundPosition: "right 7px center",
  };

  const NUOVO = "__nuovo__";
  const elenco = sedi || [];

  if (!elenco.length) {
    return (
      <button
        style={{ ...badgeStyle("danger"), ...base, backgroundImage: "none", paddingRight: 10 }}
        onClick={onAggiungi}
        title="Nessun negozio registrato per questo cliente: clicca per aggiungerlo"
      >
        📍 DOVE SPEDIRE?
      </button>
    );
  }

  const etichetta = (d) => {
    const dove = [d.localita, d.provincia ? `(${d.provincia})` : ""].filter(Boolean).join(" ");
    return [d.etichetta, dove].filter(Boolean).join(" · ");
  };

  // In archivio si legge e non si cambia: il DDT e' emesso e la merce e'
  // arrivata, quindi cambiare il negozio di destinazione vorrebbe dire far
  // dire al documento una cosa diversa da quella che e' successa.
  // L'archiviazione e' il punto di non ritorno (Luca 04/08/2026).
  if (order?.archived) {
    return (
      <span
        style={{ ...badgeStyle("outline"), ...base, cursor: "default", backgroundImage: "none", paddingRight: 10 }}
        title={scelta ? `Merce consegnata a: ${etichetta(scelta)}` : ""}
      >
        📍 {scelta ? etichetta(scelta) : "—"}
      </span>
    );
  }

  return (
    <select
      style={{ ...badgeStyle(elenco.length > 1 ? "dark" : "outline"), ...base }}
      value={String(scelta?.id || "")}
      title={
        scelta
          ? `Spedire a: ${etichetta(scelta)}. ${[scelta.via, scelta.civico].filter(Boolean).join(" ")}` +
            (elenco.length > 1 ? " · Cambia negozio da qui, vale solo per questo ordine." : "")
          : "Scegli dove spedire questo ordine"
      }
      onChange={(e) => {
        const v = String(e.target.value);
        if (v === NUOVO) { if (onAggiungi) onAggiungi(); return; }
        if (onScegli) onScegli(v);
      }}
    >
      {elenco.map((d) => (
        <option key={d.id} value={d.id}>
          📍 {etichetta(d)}{d.predefinita && elenco.length > 1 ? " (predefinita)" : ""}
        </option>
      ))}
      <option value={NUOVO}>+ Aggiungi un negozio…</option>
    </select>
  );
}

// IL bollino dell'agente, con la stessa regola del corriere: c'e' SEMPRE.
// L'agente e' obbligatorio per il DDT, quindi quando manca deve vedersi e
// dev'essere cliccabile, non semplicemente assente (Luca 05/08/2026).
// Vale quello scritto sull'ordine, altrimenti quello del cliente in anagrafica.
function BadgeAgente({ nome, onApri, compatto = false }) {
  const base = {
    cursor: onApri ? "pointer" : "default", border: "1px solid #cfd8e6",
    fontSize: compatto ? 11.5 : 12.5, whiteSpace: "nowrap",
  };
  if (String(nome || "").trim()) {
    return (
      <button style={{ ...badgeStyle("info"), ...base }} onClick={onApri}
              title="Agente dell'ordine. Clicca per cambiarlo.">
        👤 {nome}
      </button>
    );
  }
  return (
    <button style={{ ...badgeStyle("danger"), ...base }} onClick={onApri}
            title="Senza agente non si emette il DDT: clicca per sceglierlo">
      ⚠️ AGENTE MANCANTE
    </button>
  );
}

// Spunta "prezzi sul DDT". La preferenza sta sul CLIENTE, non sul documento:
// si spunta una volta e vale per tutti i suoi documenti, anche quelli futuri.
// Certi clienti li vogliono vedere, altri non devono vederli affatto (tipico
// quando a ricevere e' un magazzino terzo). Richiesta di Luca, 03/08/2026.
function SpuntaPrezziDDT({ attivo, onCambia, compatto = false }) {
  return (
    <label
      title="Vale per questo cliente su tutti i suoi documenti, non solo su questo"
      style={{
        display: "inline-flex", alignItems: "center", gap: 7, cursor: "pointer",
        fontSize: compatto ? 11.5 : 12.5, fontWeight: 700,
        color: attivo ? "#15803d" : "#66758b",
        border: "1px solid " + (attivo ? "#86efac" : "#dbe2ea"),
        background: attivo ? "#f0fdf4" : "#fff",
        borderRadius: 8, padding: compatto ? "4px 8px" : "6px 10px",
        whiteSpace: "nowrap", userSelect: "none",
      }}
    >
      <input
        type="checkbox"
        checked={!!attivo}
        onChange={(e) => onCambia(e.target.checked)}
        style={{ width: 15, height: 15, cursor: "pointer", accentColor: "#15803d" }}
      />
      Prezzi sul DDT
    </label>
  );
}

// Peso dell'ordine, sempre correggibile a mano. Il calcolo somma solo le righe
// di magazzino con peso noto: un articolo fuori magazzino pesa 0 e l'ordine
// risulta piu' leggero di com'e'. Chi spedisce ha la bilancia davanti.
function PesoOrdine({ ord, onSalva }) {
  const [valore, setValore] = useState("");
  const [salvando, setSalvando] = useState(false);
  // Riparte dal peso dell'ordine ogni volta che cambia ordine.
  useEffect(() => {
    setValore(ord?.pesoIsManual ? String(ord.pesoManuale) : "");
  }, [ord?.id, ord?.pesoIsManual, ord?.pesoManuale]);

  const salva = async (v) => {
    setSalvando(true);
    try {
      await onSalva(ord.id, v);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div style={{
      border: "1px solid #e5edf6", borderRadius: 12, padding: 12,
      display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
    }}>
      <div style={{ flex: 1, minWidth: 180 }}>
        <div style={{ fontSize: 12, color: "#66758b", fontWeight: 700 }}>Peso della spedizione</div>
        <div style={{ fontSize: 12, color: "#8a94a6", marginTop: 2 }}>
          {ord.pesoIsManual
            ? `Scritto a mano. Calcolato dalle righe: ${fmtKg(ord.pesoCalcolato)} kg`
            : `Calcolato dalle righe: ${fmtKg(ord.pesoCalcolato)} kg`}
        </div>
      </div>
      <input
        style={{ ...inputStyle(), width: 110, height: 42, textAlign: "right" }}
        value={valore}
        inputMode="decimal"
        placeholder={fmtKg(ord.pesoCalcolato)}
        onChange={(e) => setValore(e.target.value.replace(",", "."))}
      />
      <span style={{ fontWeight: 800, color: "#40516a" }}>kg</span>
      <button
        style={{ ...compactBtnStyle("primary"), opacity: salvando ? 0.5 : 1 }}
        disabled={salvando}
        onClick={() => salva(valore.trim())}
      >
        {salvando ? "Salvo…" : "Salva peso"}
      </button>
      {ord.pesoIsManual ? (
        <button
          style={compactBtnStyle("outline")}
          disabled={salvando}
          onClick={() => { setValore(""); salva(""); }}
          title="Torna al peso calcolato dalle righe"
        >
          Ricalcola
        </button>
      ) : null}
    </div>
  );
}

// Corriere fuori elenco. Il motore conosce solo quelli a contratto, ma si
// spedisce anche col corriere locale, col ritiro del cliente o col mezzo
// nostro: dev'essere sempre possibile scriverlo.
function AltroCorriere({ ord, onSalva }) {
  const [valore, setValore] = useState("");
  const noto = (ord.transport && !ord.transport.errore
    ? [ord.transport.consigliato, ...ord.transport.alternative]
    : []
  ).some((o) => o.corriere === ord.courier);
  const fuoriElenco = ord.courier && !noto;

  return (
    <div style={{
      border: "1px dashed #cbd5e1", borderRadius: 12, padding: 12,
      display: "grid", gap: 8,
    }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: "#40516a" }}>
        Un altro corriere
      </div>
      {fuoriElenco ? (
        <div style={{ fontSize: 12.5, color: "#15803d", fontWeight: 700 }}>
          Adesso l'ordine parte con <b>{ord.courier}</b>, scritto a mano.
        </div>
      ) : (
        <div style={{ fontSize: 12, color: "#8a94a6" }}>
          Corriere locale, ritiro del cliente, mezzo nostro: scrivilo qui e finisce sul DDT.
        </div>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          style={{ ...inputStyle(), flex: 1, minWidth: 170, height: 42 }}
          value={valore}
          placeholder="Es. Ritiro del cliente"
          onChange={(e) => setValore(e.target.value)}
        />
        <button
          style={compactBtnStyle("primary")}
          disabled={!valore.trim()}
          onClick={() => { onSalva(ord.id, valore.trim()); setValore(""); }}
        >
          Usa questo
        </button>
      </div>
    </div>
  );
}

// La linea di demarcazione: fino al 31/07/2026 i documenti li faceva
// TeamSystem, dal 02/08 li facciamo noi dal magazzino. I controlli sui campi
// mancanti guardano solo da qui in avanti: il pregresso non si rincorre.
const DAL_QUANDO_SIAMO_NOI = "2026-08-02";

// Campi anagrafica completabili a mano (i 12 obbligatori della checklist Luca).
const ANAG_FIELDS = [
  { key: "ragione_sociale", label: "Ragione sociale" },
  { key: "partita_iva", label: "Partita IVA" },
  { key: "sede_legale", label: "Sede legale" },
  { key: "cap", label: "CAP" },
  { key: "insegna", label: "Insegna (se diversa)" },
  { key: "orari_consegna", label: "Orario di scarico (finestra min 3 ore)" },
  { key: "giorno_chiusura", label: "Giorno di chiusura" },
  { key: "codice_univoco", label: "Codice univoco (SdI)" },
  { key: "pec", label: "PEC" },
  { key: "email", label: "Email" },
  { key: "telefono", label: "Telefono referente" },
  { key: "metodo_pagamento", label: "Metodo di pagamento" },
  // Fondamentale: senza agente non si emette il DDT (Luca 04/08/2026). Sta qui
  // e non sull'ordine perche' e' un dato del cliente: si sceglie una volta e
  // vale per tutti i suoi ordini futuri.
  { key: "agente_nome", label: "Agente" },
  // Finisce STAMPATA sul DDT e sulla conferma d'ordine: il nome del campo lo
  // dice, cosi' nessuno ci scrive dentro cose interne (Luca 05/08/2026).
  { key: "note", label: "Note da stampare sui documenti" },
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

// ---- IL CARTONE BOLLATO IN OMAGGIO (Luca 06/08/2026) ----
// "Quando c'e' il cartone bollato ti deve dare la lista per selezionare quale
// cartone bollato hanno messo all'interno, cosi' ce lo riscarica dal magazzino.
// Altrimenti noi mandiamo i bollati pero' non ce li riscarica, rimangono dentro."
//
// COSA STAVA SUCCEDENDO DAVVERO, e non era solo il mancato scarico. Sulla riga
// in omaggio la tendina proponeva tutti i lotti del prodotto, e quando il lotto
// bollato risultava impegnato l'operatore prendeva il primo con disponibilita':
// cosi' l'omaggio e' uscito con lotti da 52 e 45 giorni mentre i bollati da 18 e
// 27 restavano in magazzino a scadere. Si regalava merce fresca e si buttava
// quella corta: l'esatto contrario della regola.
//
// L'agente sceglie il cartone bollato al checkout e ne scrive il codice nella
// descrizione della riga ("· lotto 2606174P"). Quel codice e' un'istruzione, non
// una nota: e' IL cartone che deve uscire.
const RIGA_OMAGGIO_BOLLATO = /DA BOLLINARE/i;

function rigaBollata(line) {
  return RIGA_OMAGGIO_BOLLATO.test(String(line?.productName || ""));
}

// Il codice lotto scritto dall'agente dentro la descrizione. Il formato che
// manda l'app agenti e' "· lotto 2606174P", a volte seguito dalla scadenza fra
// parentesi, quindi si ferma al primo pezzo alfanumerico dopo la parola.
function lottoChiestoDallAgente(line) {
  const m = String(line?.productName || "").match(/lotto\s+([A-Za-z0-9./-]+)/i);
  return m ? m[1].replace(/[.,;:]+$/, "") : "";
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
      // Come paga questo ordine. Va in forma canonica, altrimenti il Cashflow
      // non sa calcolare la scadenza (vedi GRUPPI_PAGAMENTO).
      metodoPagamento: String(
        getField(row, ["Metodo_Pagamento", "metodo_pagamento"]) || ""
      ).trim(),
      // CAP di destinazione salvato sull'ordine (congelato alla creazione).
      cap: String(getField(row, ["Cap", "cap", "CAP"]) || "").trim(),
      // Corriere scelto per la spedizione + numero DDT (se generato).
      courier: String(getField(row, ["Corriere", "corriere"]) || "").trim(),
      // Corriere con cui e' partito davvero (scritto alla spedizione).
      courierSpedizione: String(
        getField(row, ["Corriere_Spedizione", "corriere_spedizione"]) || ""
      ).trim(),
      // Dove va la merce: quale delle destinazioni del cliente.
      idDestinazione: String(getField(row, ["Id_Destinazione", "id_destinazione"]) || "").trim(),
      ddtNumero: String(getField(row, ["DDT_Numero", "ddt_numero"]) || "").trim(),
      regimeIva: String(getField(row, ["Regime_Iva", "regime_iva"]) || "").trim(),
      agenteId: String(getField(row, ["Agente_Id", "agente_id"]) || "").trim(),
      agenteNome: String(getField(row, ["Agente_Nome", "agente_nome"]) || "").trim(),
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
      // Peso scritto a mano: vince sulla somma delle righe.
      pesoManuale: (() => {
        const raw = getField(row, ["Peso_Manuale", "peso_manuale"]);
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
        // Secondo sconto, IN CASCATA sul prezzo gia' scontato dal primo:
        // 100 con 30+10 fa 63,00, non 60,00 (Luca 04/08/2026).
        sconto2Pct: Number(getField(row, ["Sconto2_Pct", "sconto2_pct"]) || 0),
        // Terzo sconto, ancora in cascata: 100 con 10+10+10 fa 72,90
        // (Luca 05/08/2026).
        sconto3Pct: Number(getField(row, ["Sconto3_Pct", "sconto3_pct"]) || 0),
        prezzoOrigine: String(getField(row, ["Prezzo_Origine", "prezzo_origine"]) || ""),
        // Avviso quando il prezzo di listino e quello delle fatture non
        // coincidono: si stampa in rosso accanto alla riga.
        prezzoAvviso: String(getField(row, ["Prezzo_Avviso", "prezzo_avviso"]) || ""),
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
        sconto2: l.sconto2Pct ? String(l.sconto2Pct) : "",
        sconto3: l.sconto3Pct ? String(l.sconto3Pct) : "",
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

  // Con nettoRiga e non a mano: qui si contava solo il primo sconto, quindi il
  // totale a schermo era piu' alto di quello che finiva in fattura appena si
  // metteva un secondo sconto. La formula sta in un posto solo.
  const imponibile = righe.reduce((s, l) => nettoRiga(
    l.qtyOrdered,
    bozza[l.lineId]?.prezzo,
    bozza[l.lineId]?.sconto,
    bozza[l.lineId]?.sconto2,
    bozza[l.lineId]?.sconto3
  ) + s, 0);

  // Con split payment o estero l'imposta non si somma al totale del cliente.
  const iva = !regimeCorrente.ivaEsiste
    ? 0
    : righe.reduce((s, l) => {
        const netto = nettoRiga(
          l.qtyOrdered, bozza[l.lineId]?.prezzo, bozza[l.lineId]?.sconto,
          bozza[l.lineId]?.sconto2, bozza[l.lineId]?.sconto3
        );
        return s + netto * (Number(bozza[l.lineId]?.iva || 0) / 100);
      }, 0);

  // Quello che il cliente ci paga davvero: con lo split l'IVA la versa allo Stato.
  const totale = imponibile + (regimeCorrente.ivaAlCliente ? iva : 0);

  const salva = async () => {
    setSalvando(true);
    try {
      for (const l of righe) {
        const p = String(bozza[l.lineId]?.prezzo ?? "").trim();
        const sc = String(bozza[l.lineId]?.sconto ?? "").trim();
        const sc2 = String(bozza[l.lineId]?.sconto2 ?? "").trim();
        const sc3 = String(bozza[l.lineId]?.sconto3 ?? "").trim();
        const prima = l.prezzoUnitario === null || l.prezzoUnitario === undefined ? "" : String(l.prezzoUnitario);
        if (
          p === prima &&
          sc === (l.scontoPct ? String(l.scontoPct) : "") &&
          sc2 === (l.sconto2Pct ? String(l.sconto2Pct) : "") &&
          sc3 === (l.sconto3Pct ? String(l.sconto3Pct) : "")
        ) continue;
        await callSheetsApi({
          action: "updateOrderLine",
          payload: JSON.stringify({
            lineId: l.lineId,
            prezzoUnitario: p === "" ? null : Number(p),
            scontoPct: sc === "" ? 0 : Number(sc),
            sconto2Pct: sc2 === "" ? 0 : Number(sc2),
            sconto3Pct: sc3 === "" ? 0 : Number(sc3),
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
            // La riga con un problema si vede subito, in rosso, mentre la si
            // lavora: senza, l'errore compariva solo dopo, in fondo, e diceva
            // "1 riga senza aliquota" senza dire QUALE (Luca 04/08/2026).
            const bz = bozza[l.lineId] || {};
            const senzaPrezzo = !(Number(bz.prezzo ?? l.prezzoUnitario) > 0);
            const senzaIva = String(bz.iva ?? (l.ivaPct ?? "")).trim() === "";
            // Avviso dalla valorizzazione: listino e fatture non dicono lo
            // stesso prezzo su questo articolo. Non e' un campo mancante, e'
            // un prezzo da guardare in faccia prima di spedire.
            const avviso = String(l.prezzoAvviso || "").trim();
            const inErrore = senzaPrezzo || senzaIva || !!avviso;
            const perche = [
              senzaPrezzo ? "manca il prezzo" : "",
              senzaIva ? "manca l'aliquota IVA" : "",
              avviso,
            ].filter(Boolean).join(" · ");
            return (
              <div
                key={l.lineId}
                title={inErrore ? `Da sistemare: ${perche}` : undefined}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 110px 72px 72px 72px 90px",
                  gap: 8,
                  alignItems: "center",
                  ...(inErrore
                    ? {
                        background: "#fef2f2",
                        border: "1px solid #fecaca",
                        borderRadius: 10,
                        padding: "6px 8px",
                        margin: "0 -8px",
                      }
                    : {}),
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 700, color: inErrore ? "#991b1b" : "#0f172a" }}>
                  {inErrore ? <span title={perche}>⚠️ </span> : null}
                  {l.productName}
                  <span style={{ color: "#6b7280", fontWeight: 600 }}> · {l.qtyOrdered}</span>
                  {avviso ? (
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: "#b91c1c", marginTop: 2 }}>
                      {avviso}
                    </div>
                  ) : null}
                  {a && a.ultimoPrezzo != null ? (
                    <span style={{ color: "#16a34a", fontWeight: 600, fontSize: 12 }}>
                      {` · ultimo ${a.ultimoPrezzo.toFixed(2)} €${a.ultimoSconto ? ` -${a.ultimoSconto}%` : ""}`}
                    </span>
                  ) : null}
                  {/* Il prezzo dell'app agenti resta quello che e': da qui si
                      cambia listino solo se serve, e si vede prima quanto costa. */}
                  {l.prezzoOrigine === "app" && l.prezzoUnitario != null ? (
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: "#166534", marginTop: 2 }}>
                      prezzo dall'app agenti
                    </div>
                  ) : null}
                  <TendinaListini
                    codice={a?.codice || String(l.productName || "").split(" ").slice(0, 2).join(" ")}
                    storico={a}
                    listini={listini}
                    dallApp={
                      l.prezzoOrigine === "app" && l.prezzoUnitario != null
                        ? { prezzo: l.prezzoUnitario, sconto: l.scontoPct }
                        : null
                    }
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
                  placeholder="Sc 1 %"
                  title="Primo sconto, sul prezzo di listino"
                  value={bozza[l.lineId]?.sconto ?? ""}
                  onChange={(e) =>
                    setBozza((prev) => ({
                      ...prev,
                      [l.lineId]: { ...(prev[l.lineId] || {}), sconto: e.target.value },
                    }))
                  }
                />
                {/* Sconti 2 e 3, IN CASCATA: ognuno si applica al prezzo gia'
                    scontato dal precedente. 100 con 10+10+10 fa 72,90. */}
                <input
                  style={{ ...inputStyle(), padding: "6px 8px" }}
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  placeholder="Sc 2 %"
                  title="Secondo sconto, sul prezzo gia' scontato dal primo"
                  value={bozza[l.lineId]?.sconto2 ?? ""}
                  onChange={(e) =>
                    setBozza((prev) => ({
                      ...prev,
                      [l.lineId]: { ...(prev[l.lineId] || {}), sconto2: e.target.value },
                    }))
                  }
                />
                <input
                  style={{ ...inputStyle(), padding: "6px 8px" }}
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  placeholder="Sc 3 %"
                  title="Terzo sconto, sul prezzo gia' scontato dai primi due"
                  value={bozza[l.lineId]?.sconto3 ?? ""}
                  onChange={(e) =>
                    setBozza((prev) => ({
                      ...prev,
                      [l.lineId]: { ...(prev[l.lineId] || {}), sconto3: e.target.value },
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

// TENDINA DEI LISTINI (Luca 06/08/2026).
//
// Il prezzo che arriva dall'app agenti si tiene sempre com'e': e' quello che
// l'agente ha concordato col cliente. Da qui pero' si deve poter passare a un
// altro listino quando serve, vedendo prima quanto costa: la tendina dice il
// nome del listino E il prezzo, cosi' si sceglie sapendo, non a memoria.
function TendinaListini({ codice, storico, listini, dallApp, onScegli }) {
  const k = String(codice || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const l = (listini || {})[k] || {};
  const voci = [];

  if (dallApp && dallApp.prezzo != null) {
    voci.push({
      id: "app",
      etichetta: "Dall'app agenti",
      prezzo: Number(dallApp.prezzo),
      sconto: Number(dallApp.sconto || 0),
    });
  }
  if (storico && storico.ultimoPrezzo != null) {
    voci.push({
      id: "storico",
      etichetta: "Ultimo a questo cliente",
      prezzo: Number(storico.ultimoPrezzo),
      sconto: Number(storico.ultimoSconto || 0),
      nota: storico.ultimoOrdine,
    });
  }
  if (l.l1) voci.push({ id: "l1", etichetta: "Listino 1", prezzo: Number(l.l1.prezzo), sconto: Number(l.l1.sconto || 0) });
  if (l.l8) voci.push({ id: "l8", etichetta: "Listino 8 Ho.Re.Ca.", prezzo: Number(l.l8.prezzo), sconto: Number(l.l8.sconto || 0) });

  if (!voci.length) return null;

  const euro = (n) => Number(n).toFixed(2).replace(".", ",");
  return (
    <select
      value=""
      onChange={(e) => {
        const v = voci.find((x) => x.id === e.target.value);
        if (v) onScegli(v.prezzo, v.sconto);
      }}
      title="Cambia il prezzo prendendolo da un altro listino"
      style={{
        marginTop: 4,
        width: "100%",
        maxWidth: 330,
        border: "1px solid #c7d2fe",
        background: "#eef2ff",
        color: "#3730a3",
        borderRadius: 8,
        padding: "5px 8px",
        fontSize: 12,
        fontWeight: 700,
        cursor: "pointer",
      }}
    >
      <option value="">Cambia listino…</option>
      {voci.map((v) => (
        <option key={v.id} value={v.id}>
          {v.etichetta}: {euro(v.prezzo)} €{v.sconto ? ` −${v.sconto}%` : ""}{v.nota ? ` · ${v.nota}` : ""}
        </option>
      ))}
    </select>
  );
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

// Ricerca a comparsa: un campo solo, si scrive e sotto escono i risultati.
// Sostituisce le tendine native, che con 2.195 clienti o 51 agenti costringono
// a scorrere a mano un elenco infinito (Luca 03/08/2026: "devi metterti a
// cercare, non piace"). Regge tastiera (frecce, invio, esc) e tocco.
function RicercaSelect({
  voci,                 // [{ id, titolo, sottotitolo, etichetta, gruppo }]
  value,
  onChange,
  placeholder = "Scrivi per cercare...",
  vuotoLabel = "Nessun risultato",
  icona = null,
  colore = "#1d4ed8",
}) {
  const [testo, setTesto] = useState("");
  const [aperto, setAperto] = useState(false);
  const [attivo, setAttivo] = useState(0);
  const boxRef = useRef(null);

  const scelto = voci.find((v) => String(v.id) === String(value));

  const q = testo.trim().toLowerCase();
  const risultati = useMemo(() => {
    if (!q) return voci.slice(0, 40);
    const parole = q.split(/\s+/).filter(Boolean);
    return voci
      .filter((v) => {
        const testoVoce = `${v.titolo} ${v.sottotitolo || ""} ${v.etichetta || ""} ${v.gruppo || ""}`.toLowerCase();
        return parole.every((p) => testoVoce.includes(p));
      })
      .slice(0, 40);
  }, [voci, q]);

  useEffect(() => {
    setAttivo(0);
  }, [q]);

  // Un clic fuori chiude la tendina.
  useEffect(() => {
    if (!aperto) return undefined;
    const fuori = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setAperto(false);
    };
    document.addEventListener("mousedown", fuori);
    return () => document.removeEventListener("mousedown", fuori);
  }, [aperto]);

  const scegli = (v) => {
    onChange(v ? v.id : "");
    setTesto("");
    setAperto(false);
  };

  const tasti = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setAperto(true);
      setAttivo((i) => Math.min(i + 1, risultati.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setAttivo((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && aperto && risultati[attivo]) {
      e.preventDefault();
      scegli(risultati[attivo]);
    } else if (e.key === "Escape") {
      setAperto(false);
    }
  };

  // Gia' scelto: si mostra la scheda, non il campo di ricerca.
  if (scelto && !aperto) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          border: `1px solid ${colore}33`,
          background: `${colore}0d`,
          borderRadius: 14,
          padding: "10px 12px",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 850, color: "#07153a", fontSize: 14, overflowWrap: "anywhere" }}>
            {scelto.titolo}
          </div>
          {scelto.sottotitolo ? (
            <div style={{ fontSize: 12, color: "#5a6e90", fontWeight: 650, marginTop: 2 }}>
              {scelto.sottotitolo}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          style={{ ...compactBtnStyle("outline"), height: 32, padding: "0 12px", whiteSpace: "nowrap" }}
          onClick={() => {
            setAperto(true);
            setTesto("");
            setTimeout(() => boxRef.current?.querySelector("input")?.focus(), 0);
          }}
        >
          Cambia
        </button>
      </div>
    );
  }

  return (
    <div ref={boxRef} style={{ position: "relative", minWidth: 0 }}>
      <div style={{ position: "relative" }}>
        <Search
          size={16}
          style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#97a3b6" }}
        />
        <input
          style={{ ...inputStyle(), paddingLeft: 40 }}
          value={testo}
          autoFocus={aperto}
          onFocus={() => setAperto(true)}
          onChange={(e) => {
            setTesto(e.target.value);
            setAperto(true);
          }}
          onKeyDown={tasti}
          placeholder={placeholder}
        />
      </div>

      {aperto ? (
        <div
          style={{
            position: "absolute",
            zIndex: 60,
            top: "100%",
            left: 0,
            right: 0,
            marginTop: 6,
            background: "#fff",
            border: "1px solid #dbe2ea",
            borderRadius: 16,
            boxShadow: "0 24px 48px rgba(16,24,40,.18)",
            maxHeight: 340,
            overflowY: "auto",
          }}
        >
          {risultati.length === 0 ? (
            <div style={{ padding: 14, color: "#6b7280" }}>{vuotoLabel}</div>
          ) : (
            risultati.map((v, i) => (
              <button
                key={v.id}
                type="button"
                onMouseEnter={() => setAttivo(i)}
                onClick={() => scegli(v)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  border: "none",
                  borderBottom: "1px solid #f1f5f9",
                  background: i === attivo ? `${colore}0f` : "transparent",
                  padding: "10px 14px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                {icona ? <span style={{ color: colore, flexShrink: 0 }}>{icona}</span> : null}
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontWeight: 800, fontSize: 13, color: "#07153a" }}>
                    {v.titolo}
                  </span>
                  {v.sottotitolo ? (
                    <span style={{ display: "block", fontSize: 12, color: "#6b7280", fontWeight: 600 }}>
                      {v.sottotitolo}
                    </span>
                  ) : null}
                </span>
                {v.etichetta ? (
                  <span style={{ ...badgeStyle("outline"), fontSize: 11, padding: "4px 8px", flexShrink: 0 }}>
                    {v.etichetta}
                  </span>
                ) : null}
              </button>
            ))
          )}
          {!q && voci.length > 40 ? (
            <div style={{ padding: "8px 14px", fontSize: 12, color: "#97a3b6", background: "#f8fafc" }}>
              Primi 40 di {voci.length}. Scrivi per restringere.
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ProductSearchSelect({
  products,
  value,
  onChange,
  // search/onSearchChange restano nella firma per non toccare i quattro punti
  // che li passano, ma la ricerca ora se la gestisce RicercaSelect da sola.
  search,
  onSearchChange,
  placeholder = "Scrivi codice o nome del prodotto",
}) {
  const voci = useMemo(
    () =>
      (products || []).map((p) => ({
        id: String(p.id),
        titolo: p.name || "",
        sottotitolo: [p.category, p.subcategory].filter(Boolean).join(" › "),
        etichetta: p.code || "",
      })),
    [products]
  );

  return (
    <RicercaSelect
      voci={voci}
      value={value}
      placeholder={`${placeholder} · ${voci.length} articoli`}
      vuotoLabel="Nessun prodotto con questo testo."
      icona={<Package size={16} />}
      colore="#0f766e"
      onChange={(id) => {
        onChange(id);
        // Chi ci passa search/onSearchChange si aspetta di restare allineato.
        if (onSearchChange) {
          const p = (products || []).find((x) => String(x.id) === String(id));
          onSearchChange(p ? p.name || "" : "");
        }
      }}
    />
  );
}
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
  // Anagrafica agenti: serve ad assegnare l'agente sugli ordini caricati in
  // casa, quando la app agenti non funziona e l'ordine arriva in azienda.
  const [agenti, setAgenti] = useState([]);
  const [newOrderAgenteId, setNewOrderAgenteId] = useState("");
  // Anagrafiche snapshot degli ordini arrivati dall'APP agenti
  // (id ordine magazzino -> oggetto cliente). Per semaforo Anagrafica e DDT.
  const [appAnagrafiche, setAppAnagrafiche] = useState({});
  // Layer di arricchimento nostro (chiave cliente -> override): tipologia + campi
  // anagrafica completati a mano. Si sovrappone allo snapshot senza toccarlo.
  const [clientiOverride, setClientiOverride] = useState({});
  // Il modale dell'anagrafica si apre gia' sul modulo della sede nuova quando
  // ci si arriva dal bollino "dove spedire".
  const [anagNuovaSede, setAnagNuovaSede] = useState(false);
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
  // Codice appena assegnato dal registro a un cliente nuovo, da mostrare a chi
  // ha appena caricato l'anagrafica.
  const [nuovoCodiceCliente, setNuovoCodiceCliente] = useState(null);
  // Archivio: mostra solo gli ordini a cui manca qualcosa per DDT/fattura.
  const [soloIncompleti, setSoloIncompleti] = useState(false);
  // Registro DDT (amministrazione): ricerca per numero, cliente o ordine.
  const [ddtSearch, setDdtSearch] = useState("");
  // Tracciabilita' lotti in Archivio: si cerca un articolo (o un lotto), si
  // sceglie il lotto e si vede a quali clienti e' andato. Solo dal 03/08.
  const [lottoQuery, setLottoQuery] = useState("");
  const [lottoRighe, setLottoRighe] = useState([]);
  const [lottoScelto, setLottoScelto] = useState("");
  const [lottoCercando, setLottoCercando] = useState(false);
  // Numeri DDT rimasti senza ordine: servono a SPIEGARE i buchi nel registro.
  const [ddtAnnullati, setDdtAnnullati] = useState([]);
  // Quale ordine archiviato si sta correggendo, senza disarchiviarlo.
  const [correggiOrderId, setCorreggiOrderId] = useState("");
  // Quando e' finito l'ultimo aggiornamento: serve a farlo VEDERE.
  const [ultimoAggiornamento, setUltimoAggiornamento] = useState(0);
  // Destinazioni merci per codice cliente. Un cliente puo' avere piu' punti
  // di consegna (3-4 negozi) e chi spedisce sceglie dove mandare la merce.
  const [destinazioni, setDestinazioni] = useState({});

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
  // I clienti pronti per la ricerca a comparsa: titolo il nome, sotto citta' e
  // codice, cosi' si distinguono i tanti omonimi ("La Bottega del Celiaco" e'
  // sei clienti diversi in citta' diverse).
  const clientiPerRicerca = useMemo(
    () =>
      activeClients.map((c) => ({
        id: c.id,
        titolo: c.name,
        sottotitolo: [c.citta, c.piva ? `P.IVA ${c.piva}` : ""].filter(Boolean).join(" · "),
        etichetta: c.codeTs || "",
        gruppo: c.category || "",
      })),
    [activeClients]
  );

  const agentiPerRicerca = useMemo(
    () =>
      agenti.map((a) => ({
        id: a.Agente_Id,
        titolo: a.Nome,
        sottotitolo: [a.Canali ? a.Canali.split(",").join(" · ") : "", a.Zona].filter(Boolean).join(" · "),
        etichetta: a.Agente_Id,
      })),
    [agenti]
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

  const destinazioniDi = (order) => {
    const cod = String(order?.clientId || "").trim();
    // Senza codice cliente non c'e' niente da agganciare, e soprattutto non si
    // deve leggere il secchio della chiave vuota: una sede finita li' dentro
    // comparirebbe su tutti i 151 ordini storici che il codice non l'hanno.
    if (!cod) return [];
    return destinazioni[cod] || [];
  };

  const destinazioneDi = (order) => {
    const lista = destinazioniDi(order);
    if (!lista.length) return null;
    const scelta = String(order?.idDestinazione || "");
    return lista.find((d) => String(d.id) === scelta) || lista.find((d) => d.predefinita) || lista[0];
  };

  // Il metodo scritto sull'ANAGRAFICA del cliente di quell'ordine. E' la fonte
  // che vale quando l'ordine non ne porta uno suo: cosi' non si chiede due volte.
  const metodoDelCliente = (order) =>
    String((clientiOverride[clientKeyFor(order)] || {}).metodo_pagamento || "").trim();

  // Se il pagamento di questo ordine e' da sistemare, tenendo conto
  // dell'anagrafica. Da usare al posto di pagamentoDaSistemare(order) secco.
  const pagamentoScoperto = (order) => pagamentoDaSistemare(order, metodoDelCliente(order));

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
        // "note" NON e' piu' esclusa: ora e' la nota che si stampa sui
        // documenti, quindi deve arrivare fino al DDT.
        if (["chiave", "tipologia", "operatore", "aggiornato_il", "id"].includes(k)) continue;
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

  // L'agente di un ordine: quello scritto sull'ordine, altrimenti quello del
  // CLIENTE in anagrafica. L'agente e' un dato del cliente, non della singola
  // vendita: cambia raramente e non ha senso riscriverlo ogni volta. Sull'ordine
  // resta la possibilita' di metterne un altro, perche' capita (una vendita
  // fatta dalla direzione, un ordine passato da un collega).
  const agenteDi = (order) => {
    const suOrdine = String(order?.agenteNome || "").trim();
    if (suOrdine) return suOrdine;
    const ov = clientiOverride[clientKeyFor(order)] || {};
    return String(ov.agente_nome || "").trim();
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

  // Cosa manca a un ordine per poterci fare sopra un documento di trasporto
  // e, subito dopo, la fattura. Nata il 03/08/2026: il primo giorno di prova
  // sono andati avanti ordini senza i dati necessari, e ce ne siamo accorti
  // solo a cose fatte. Questa lista si vede in Archivio, ordine per ordine.
  //
  // Distingue due gravita':
  //  - BLOCCANTI: senza questi il DDT non si puo' proprio scrivere (a chi lo
  //    intesto, dove lo mando).
  //  - DA COMPLETARE: il documento esce, ma incompleto o a zero.
  const campiMancantiDDT = (order) => {
    const has = (v) => String(v ?? "").trim() !== "";
    const { merged } = effectiveCliente(order);
    const cli = clientsById[String(order?.clientId)] || {};
    const bloccanti = [];
    const daCompletare = [];

    if (!has(order?.clientId)) bloccanti.push("Codice cliente");
    // L'agente e' fondamentale (Luca 04/08/2026): senza, la provvigione non
    // si sa a chi va e il rapporto col cliente non ha un nome. Vale quello
    // scritto sull'ordine, altrimenti quello del cliente in anagrafica.
    if (!has(agenteDi(order))) bloccanti.push("Agente");
    if (!has(merged.partita_iva) && !has(cli.piva)) bloccanti.push("Partita IVA");
    // INDIRIZZO, CAP E CITTA' SI LEGGONO DOVE LI LEGGE IL DOCUMENTO.
    //
    // Il controllo guardava solo i campi dell'anagrafica e ignorava la SEDE DI
    // CONSEGNA, che e' proprio la prima fonte che usa generaDocumento(): cosi'
    // diceva "manca l'indirizzo" su ordini il cui DDT stampava l'indirizzo
    // giusto. Succedeva su tutti i clienti nati fuori dal gestionale, che hanno
    // l'indirizzo solo come sede: Simone Lanzi, Jaume Masdevall, Eddy Cash and
    // Carry, Villa Beccaris (Luca 07/08/2026: "dice che manca l'indirizzo ma in
    // realta' c'e'").
    //
    // Regola: la checklist e il documento devono leggere le stesse cose, sennomo'
    // uno dice che manca e l'altro lo stampa.
    const dstCheck = destinazioneDi(order);
    const viaDst = dstCheck ? [dstCheck.via, dstCheck.civico].filter(Boolean).join(" ") : "";

    if (!has(viaDst) && !has(merged.indirizzo) && !has(merged.sede_legale) &&
        !has(merged.sede_via) && !has(cli.indirizzo)) {
      bloccanti.push("Indirizzo di consegna");
    }
    if (!has(dstCheck?.cap) && !has(merged.cap) && !has(merged.sede_cap) &&
        !has(cli.cap) && !has(order?.cap)) {
      bloccanti.push("CAP");
    }
    if (!has(dstCheck?.localita) && !has(merged.citta) && !has(merged.sede_localita) &&
        !has(cli.citta)) {
      bloccanti.push("Citta'");
    }
    if (!has(dstCheck?.provincia) && !has(merged.provincia) &&
        !has(merged.sede_provincia) && !has(cli.provincia)) {
      daCompletare.push("Provincia");
    }

    if (!has(order?.ddtNumero)) daCompletare.push("Numero DDT (mai generato)");
    // Stesso ragionamento che fa generaDDT: vale il corriere scelto, e in
    // mancanza quello consigliato dal preventivo. Segnalarlo quando il
    // documento lo scriverebbe comunque sarebbe un falso allarme.
    // Il corriere deve essere SEMPRE chiaro (Luca 04/08/2026): un DDT senza
    // vettore non dice chi ha portato la merce, e se il collo si perde non si
    // sa nemmeno a chi chiederne conto. Quello consigliato dal preventivo non
    // basta: e' un suggerimento, non una scelta.
    if (!has(order?.courier) && !has(order?.courierSpedizione)) {
      bloccanti.push("Corriere");
    }
    if (!order?.colliIsManual) daCompletare.push("Colli non confermati");

    // IL METODO DI PAGAMENTO BLOCCA (Luca 06/08/2026: "metti in modo tale che
    // debba essere inserito bene").
    //
    // Prima era solo "da completare", e guardava il campo dell'ANAGRAFICA invece
    // di quello dell'ordine, e ne guardava solo la presenza: quindi un ordine con
    // scritto "TRANSFER" o "Bonifico" passava il controllo pur non producendo
    // nessuna scadenza. Ora blocca, e blocca sulla LEGGIBILITA': un mezzo senza
    // termine non dice quando si incassa.
    //
    // Sul contrassegno non e' nemmeno una questione di scadenza: e' il corriere
    // che deve sapere quanto incassare, e sul documento ci va scritto.
    // Gli ordini precedenti al 03/08 non li tocca (vedi pagamentoDaSistemare).
    if (pagamentoScoperto(order)) {
      const attuale = metodoEffettivo(order?.metodoPagamento, metodoDelCliente(order));
      bloccanti.push(
        attuale
          ? `Metodo di pagamento non valido ("${attuale}": non dice quando si incassa)`
          : "Metodo di pagamento"
      );
    }

    // Valorizzazione: e' il pezzo che serve per fatturare, non per spedire.
    const righe = order?.lines || [];
    // I messaggi dicono QUALE articolo, non quante righe. "1 riga senza
    // aliquota" costringe a cercarla a mano fra quindici; "senza aliquota IVA:
    // Basi pizza gelo" si corregge subito. (Luca 04/08/2026)
    const nomi = (lista) => {
      const n = lista.map((l) => String(l.productName || "").trim()).filter(Boolean);
      if (n.length <= 3) return n.join(", ");
      return n.slice(0, 3).join(", ") + ` e altri ${n.length - 3}`;
    };
    const aZero = righe.filter((l) => !(Number(l.prezzoUnitario) > 0));
    if (righe.length === 0) bloccanti.push("Nessuna riga");
    else if (aZero.length === righe.length) daCompletare.push(`Nessun prezzo su tutte le ${righe.length} righe`);
    else if (aZero.length > 0) daCompletare.push(`Senza prezzo: ${nomi(aZero)}`);
    // Aliquota mancante: va detto, non lasciato al valore di ripiego. Sul
    // documento diventerebbe 4% in silenzio, e su un ravioli sarebbe 10%.
    const senzaIva = righe.filter((l) => l.prezzoUnitario > 0 && l.ivaPct == null);
    if (senzaIva.length > 0) daCompletare.push(`Senza aliquota IVA: ${nomi(senzaIva)}`);

    return { bloccanti, daCompletare, totale: bloccanti.length + daCompletare.length };
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
  const openCompletaAnagrafica = (order, opzioni) => {
    if (!order) return;
    setAnagNuovaSede(!!(opzioni && opzioni.nuovaSede));
    const { merged } = effectiveCliente(order);
    const form = {};
    for (const f of ANAG_FIELDS) form[f.key] = String(merged[f.key] ?? "");
    form.agente_id = String(merged.agente_id ?? "");
    // Da dove arrivano i prezzi. Chi ha ancora solo il vecchio interruttore
    // booleano si ritrova la scelta corrispondente, gli altri la regola nuova:
    // prima il listino, lo storico dove il listino non arriva.
    form.fonte_prezzi = String(
      merged.fonte_prezzi || (merged.usa_storico === false ? "solo-listino" : "listino")
    );
    form.listino_standard = String(merged.listino_standard ?? "");
    // Gli sconti del cliente, in cascata. Vuoto NON e' zero: vuoto vuol dire
    // "non lo sappiamo" e lascia lavorare lo sconto ricavato dalle fatture,
    // zero vuol dire "prezzo pieno, e' voluto".
    for (const k of ["sconto1_pct", "sconto2_pct", "sconto3_pct"]) {
      form[k] = merged[k] === null || merged[k] === undefined ? "" : String(merged[k]);
    }
    // Se l'ordine porta gia' un agente, il form parte da quello.
    if (!form.agente_nome && order.agenteNome) form.agente_nome = String(order.agenteNome);
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
      payload.agente_id = anagForm.agente_id ?? "";
      payload.fonte_prezzi = anagForm.fonte_prezzi || "listino";
      // Il vecchio booleano si tiene allineato: altri pezzi lo leggono ancora.
      payload.usa_storico = payload.fonte_prezzi !== "solo-listino";
      payload.listino_standard = anagForm.listino_standard ?? "";
      for (const k of ["sconto1_pct", "sconto2_pct", "sconto3_pct"]) {
        payload[k] = anagForm[k] ?? "";
      }

      // "Se inserisco un listino a mano i prezzi devono automaticamente
      // cambiare" (Luca 05/08/2026). Gli ordini di QUESTO cliente ancora da
      // preparare vengono rivalorizzati subito: la chiave la sappiamo solo qui,
      // quindi la lista degli id la prepariamo noi e la manda l'adapter.
      // Gli ordini spediti o archiviati non si toccano: quello che e' partito
      // resta come e' partito.
      payload.rivalorizza = orders
        .filter((o) =>
          clientKeyFor(o) === chiave &&
          !o.archived &&
          String(o.computedStatus) !== "Spedito"
        )
        .map((o) => String(o.id));

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
      setAgenti(raw.agenti || []);
      setAppAnagrafiche(raw.anagraficheApp || {});
      setClientiOverride(raw.overridesClienti || {});
      setDestinazioni(raw.destinazioni || {});
      setAssignments(normalizedAssignments);
      // L'archivio si ricarica subito dopo, qui sotto.
      setArchivedLoaded(false);
      // RESTA sull'ordine che si stava guardando. Prima il refresh saltava
      // sempre al primo della lista: uno premeva Aggiorna, si ritrovava su un
      // altro ordine e pensava che non avesse funzionato. Si cambia solo se
      // l'ordine non c'e' piu'.
      setSelectedOrderId((prec) => {
        const esiste = prec && mergedOrders.some((o) => String(o.id) === String(prec));
        return esiste ? prec : (mergedOrders[0]?.id ?? "");
      });
      setSelectedLineId((precLinea) => {
        const tutte = mergedOrders.flatMap((o) => o.lines || []);
        const esiste = precLinea && tutte.some((l) => String(l.lineId) === String(precLinea));
        return esiste ? precLinea : (mergedOrders[0]?.lines?.[0]?.lineId ?? "");
      });
      // Le liste che NON stanno nel caricamento principale vanno ricaricate
      // a mano, altrimenti "Aggiorna" lascia indietro proprio i contatori che
      // uno guarda per capire se e' cambiato qualcosa.
      loadOrdiniApp().catch(() => {});
      if (page === "archivio" || page === "ddt") {
        await loadArchivedOrders();
      }
      setUltimoAggiornamento(Date.now());
    } catch (error) {
      setLoadError(
        "Non sono riuscito a leggere i dati dal Google Sheet. Per ora vedi una demo locale."
      );
      setProducts(fallbackProducts);
      setLots(fallbackLots);
      setOrders([]);
      setClients([]);
      setAgenti([]);
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
        // AGGIORNA, non solo aggiunge. Prima le righe gia' in memoria non
        // venivano mai rimpiazzate: un ordine archiviato modificato (prezzo,
        // colli, DDT) restava a video com'era prima, e sembrava che Aggiorna
        // non funzionasse. (Luca 04/08/2026)
        const freschi = new Map(merged.map((o) => [String(o.id), o]));
        const uniti = prev.map((o) => freschi.get(String(o.id)) || o);
        const gia = new Set(uniti.map((o) => String(o.id)));
        return [...uniti, ...merged.filter((o) => !gia.has(String(o.id)))];
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

  // All'apertura di Archivio o del registro DDT, carica lo storico una volta.
  // Il registro ha bisogno dello stesso caricamento: i DDT stanno quasi tutti
  // su ordini archiviati, e serve avere anche righe e lotti per ristampare.
  useEffect(() => {
    if ((page === "archivio" || page === "ddt") && !archivedLoaded && !loadingArchive) {
      loadArchivedOrders();
    }
    if (page === "ddt") {
      callSheetsApi({ action: "ddtAnnullati" })
        .then((r) => setDdtAnnullati(r && r.success ? r.annullati || [] : []))
        .catch(() => {});
    }
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
      // Il calcolo somma solo i prodotti a catalogo con peso noto: un articolo
      // fuori magazzino pesa 0 e l'ordine risulta piu' leggero di com'e'. Chi
      // spedisce ha la bilancia davanti, quindi il peso scritto a mano vince
      // sempre, e da li' in poi comanda su preventivo, colli e DDT.
      const pesoCalcolato = lines.reduce(
        (sum, line) => sum + Number(line.qtyOrdered || 0) * Number(line.weightKg || 0),
        0
      );
      const pesoIsManual = order.pesoManuale !== null && order.pesoManuale !== undefined;
      const pesoTotale = pesoIsManual ? Number(order.pesoManuale) : pesoCalcolato;
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
        pesoCalcolato,
        pesoIsManual,
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

  // Le quattro tappe dell'ordine, in sequenza: arriva, si prepara, parte, si
  // archivia. Sono le uniche che restano sempre in vista, perche' sono il
  // lavoro di tutti i giorni. Tenerle qui, e non sparse nel JSX, vuol dire che
  // per aggiungerne una si tocca una riga sola.
  const TAPPE = useMemo(() => [
    {
      id: "ordini", etichetta: "Ordini", etichettaProduzione: "Da preparare",
      icona: <ClipboardList size={18} />, ancheProduzione: true, contatore: 0,
    },
    {
      id: "preparati", etichetta: "Preparati", etichettaProduzione: "Pronti",
      icona: <CheckCircle2 size={18} />, ancheProduzione: true,
      contatore: preparedOrders.length, tipoBadge: "success",
    },
    {
      id: "spediti", etichetta: "Spediti",
      icona: <span style={{ fontSize: 16 }}>🚚</span>,
      contatore: speditiOrders.length, tipoBadge: "success",
    },
    {
      id: "archivio", etichetta: "Archivio", icona: <Archive size={18} />, contatore: 0,
    },
  ], [preparedOrders.length, speditiOrders.length]);

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
    const delloStessoProdotto = activeLots.filter(
      (lot) =>
        String(lot.productId) === String(line.productId) &&
        (lotAssignedMap[String(lot.id)]?.total || 0) > 0
    );
    const perScadenza = (a, b) => new Date(a.expiry) - new Date(b.expiry);

    // RIGA IN OMAGGIO: si offrono i BOLLATI, non tutto il magazzino. Sono quelli
    // che devono uscire, e sono l'unica cosa che si regala. Il lotto scritto
    // dall'agente va in cima e ci resta anche se risulta impegnato: e' il
    // cartone che ha promesso al cliente, e se non compare l'operatore ne
    // prende un altro, che e' come il problema e' nato.
    if (rigaBollata(line)) {
      const chiesto = lottoChiestoDallAgente(line).toUpperCase();
      const codice = (lot) => String(lot.lot || "").toUpperCase();
      const bollati = delloStessoProdotto.filter((lot) => {
        const b = bollinoScadenza(lot.expiry, Date.now());
        return b && b.tipo === "bollato";
      });
      const inCima = delloStessoProdotto.filter((lot) => chiesto && codice(lot) === chiesto);
      const resto = bollati.filter((lot) => !inCima.includes(lot)).sort(perScadenza);
      // Se di bollati non ce n'e' nemmeno uno si torna all'elenco intero: meglio
      // spedire con un lotto qualunque che bloccare l'ordine, ma sotto la
      // tendina compare l'avviso rosso.
      const mirati = [...inCima, ...resto];
      return mirati.length ? mirati : delloStessoProdotto.sort(perScadenza);
    }

    return delloStessoProdotto.sort(perScadenza);
  };

  const handleInlineLotSelect = (line, lotId) => {
    if (!line) return;

    const available = lotsAvailableMap[String(lotId)] || 0;
    let suggestedQty = Math.min(line.qtyToAssign, available);

    // Sul cartone in omaggio la quantita' si propone comunque, anche quando il
    // bollato risulta tutto impegnato. Altrimenti succedeva questo: l'operatore
    // sceglieva il bollato giusto, la quantita' proposta era 0, la conferma
    // rispondeva "inserisci una quantita' valida", e a quel punto ripiegava sul
    // lotto fresco che invece la disponibilita' l'aveva. La frizione decideva
    // quale merce si regala. Se davvero sfora, la conferma qui sotto lo chiede.
    if (rigaBollata(line) && suggestedQty <= 0) suggestedQty = Number(line.qtyToAssign || 0);

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
      .filter((order) =>
        soloIncompleti
          ? String(order.dataPrepared || order.date || "").slice(0, 10) >= DAL_QUANDO_SIAMO_NOI &&
            campiMancantiDDT(order).totale > 0
          : true
      )
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordersWithComputed, orderSearch, soloIncompleti]);

  // Quanti ordini archiviati hanno ancora buchi. Si conta su TUTTO l'archivio
  // caricato, non sul filtro: serve a dire "guarda che ce ne sono", anche
  // mentre stai cercando altro.
  //
  // MA si conta solo dal 02/08/2026 in poi. Fino al 31/07 i documenti li
  // faceva TeamSystem e l'anagrafica non passava di qui: contare quegli ordini
  // vorrebbe dire dire "276 ordini rotti" quando in realta' erano a posto,
  // altrove. Il pregresso non si rincorre, conta l'allineamento da lunedi'.
  const archivioIncompleti = useMemo(() => {
    const dataDi = (o) => String(o.dataPrepared || o.date || "").slice(0, 10);
    const archiviati = ordersWithComputed.filter(
      (o) => o.archived && !o.unitoIn && dataDi(o) >= DAL_QUANDO_SIAMO_NOI
    );
    let bloccanti = 0;
    let daCompletare = 0;
    archiviati.forEach((o) => {
      const m = campiMancantiDDT(o);
      if (m.bloccanti.length) bloccanti += 1;
      else if (m.daCompletare.length) daCompletare += 1;
    });
    return { totale: archiviati.length, bloccanti, daCompletare };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordersWithComputed]);

  // Registro DDT: tutti i documenti emessi, dal piu' recente. Ordina per numero
  // (non per data): la numerazione e' la fonte di verita' per l'amministrazione,
  // e va letta come una serie continua.
  const registroDDT = useMemo(() => {
    const q = ddtSearch.trim().toLowerCase();
    const conDdt = ordersWithComputed.filter((o) => String(o.ddtNumero || "").trim() !== "");
    // Ci sono DUE serie: quella buona (1822, 1823...) e i vecchi
    // 'DDT-2026-nnn' dei documenti di prova di luglio. Non vanno confuse: se
    // si estraggono le cifre da 'DDT-2026-008' esce 2026008, che scavalcherebbe
    // ogni numero vero. La serie buona sta sopra, la vecchia sotto in coda.
    const isSerieBuona = (o) => /^\d+$/.test(String(o.ddtNumero).trim());
    const num = (o) => (isSerieBuona(o) ? parseInt(String(o.ddtNumero).trim(), 10) : 0);
    const lista = conDdt
      .filter((o) => {
        if (!q) return true;
        return (
          String(o.ddtNumero).toLowerCase().includes(q) ||
          String(o.customer || "").toLowerCase().includes(q) ||
          String(o.id).toLowerCase().includes(q) ||
          String(o.clientId || "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const ba = isSerieBuona(a);
        const bb = isSerieBuona(b);
        if (ba !== bb) return ba ? -1 : 1;
        if (ba) return num(b) - num(a);
        return String(b.ddtNumero).localeCompare(String(a.ddtNumero));
      });

    // I buchi nella serie. Li cerco solo sui numeri puri (1822, 1823...): i
    // vecchi 'DDT-2026-nnn' sono un'altra serie, di epoca TeamSystem, e
    // mischiarli farebbe gridare al buco dove non c'e'.
    const numeri = conDdt
      .filter((o) => /^\d+$/.test(String(o.ddtNumero).trim()))
      .map((o) => parseInt(o.ddtNumero, 10))
      .sort((a, b) => a - b);
    const buchi = [];
    for (let i = 1; i < numeri.length; i += 1) {
      for (let n = numeri[i - 1] + 1; n < numeri[i]; n += 1) buchi.push(n);
    }
    return {
      lista,
      totale: conDdt.length,
      primo: numeri[0] ?? null,
      ultimo: numeri[numeri.length - 1] ?? null,
      buchi,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordersWithComputed, ddtSearch]);


  // Il punto di non ritorno e' l'ARCHIVIAZIONE, non la spedizione (correzione
  // di Luca 04/08/2026). Spedito e' ancora una fase di lavoro: capita di
  // accorgersi di qualcosa e di dover riportare l'ordine indietro, e finche'
  // non e' archiviato si puo'. Il DDT nasce all'archiviazione, o prima se
  // qualcuno lo stampa per darlo all'autista.
  // `unarchiveOrder` invece NON torna: un ordine archiviato ha il documento
  // emesso. Il divieto vive nel database (sql/ddt_alla_spedizione.sql).
  // EVADI SOLO IL PARZIALE (Luca 04/08/2026). Quello che ha i lotti assegnati
  // parte; il resto diventa un ordine nuovo che resta fra i "da preparare".
  const evadiParziale = async (order) => {
    if (!order) return;
    const righe = order.lines || [];
    const daFare = righe.filter((l) => Number(l.qtyToAssign || 0) > 0);
    const pronte = righe.filter((l) => Number(l.assignedQty || 0) > 0);
    if (!daFare.length) {
      alert("Su questo ordine e' gia' assegnato tutto: non c'e' nessun residuo da staccare.");
      return;
    }
    if (!pronte.length) {
      alert(
        "Su questo ordine non e' assegnato niente.\n\n" +
          "Assegna prima i lotti a quello che vuoi far partire: il resto restera' indietro da solo."
      );
      return;
    }
    const residui = daFare
      .map((l) => `${l.productName}: ${Number(l.qtyToAssign || 0)}`)
      .join("\n- ");
    if (!window.confirm(
      `Far partire solo quello che ha i lotti?\n\n` +
        `Resta indietro:\n- ${residui}\n\n` +
        `Il residuo diventa un ordine NUOVO per ${order.customer || "questo cliente"}, ` +
        `che trovi fra i "Da preparare" con gli stessi prezzi e lo stesso corriere.`
    )) return;

    try {
      const r = await callSheetsApi({
        action: "evadiParziale",
        payload: JSON.stringify({ orderId: order.id }),
      });
      if (!r || !r.success) {
        alert("Non sono riuscito a staccare il residuo: " + ((r && r.error) || "sconosciuto"));
        return;
      }
      await loadDataFromSheets();
      alert(
        `Fatto.\n\nQuesto ordine ora contiene solo la merce coi lotti.\n` +
          `Il residuo (${r.pezzi_residui} pezzi) e' l'ordine ${r.id_residuo}, fra i Da preparare.`
      );
    } catch (e) {
      alert("Errore di collegamento: " + String(e));
    }
  };

  // Sedi di consegna: si salvano sul cliente, non sull'ordine.
  // ---- SEZIONE CLIENTI ----
  // La chiave dell'anagrafica arricchita, per un CLIENTE (non per un ordine):
  // stessa regola di clientKeyFor, che pero' parte da un ordine.
  const chiaveAnagrafica = (cli, pivaScritta) => {
    const piva = String(pivaScritta ?? cli?.piva ?? "").replace(/\D/g, "");
    if (piva) return "piva:" + piva;
    const nome = String(cli?.name || "").trim().toLowerCase().replace(/\s+/g, " ");
    return nome ? "nome:" + nome : "";
  };

  const [clientiCerca, setClientiCerca] = useState("");
  const [clienteAperto, setClienteAperto] = useState(null); // {cliente} oppure {nuovo:true}

  // I campi arricchiti si salvano su clienti_override; quelli di identita' sulla
  // tabella clienti. Qui si scrive dove va scritto, senza far pensare a chi
  // compila che siano tre posti diversi.
  const salvaSchedaOverride = async (chiave, f) => {
    const payload = { chiave, operatore: authUser?.username || "" };
    for (const g of CAMPI_SCHEDA) for (const c of g.campi) payload[c.key] = f[c.key] ?? "";
    payload.tipologia = f.tipologia ?? "";
    payload.metodo_pagamento = f.metodo_pagamento ?? "";
    payload.agente_nome = f.agente_nome ?? "";
    payload.listino_standard = f.listino_standard ?? "";
    payload.fonte_prezzi = f.fonte_prezzi || "listino";
    payload.usa_storico = (f.fonte_prezzi || "listino") !== "solo-listino";
    for (const k of ["sconto1_pct", "sconto2_pct", "sconto3_pct"]) payload[k] = f[k] ?? "";
    const r = await callSheetsApi({
      action: "saveClienteOverride",
      payload: JSON.stringify(payload),
    });
    if (r && r.success) {
      setClientiOverride((prev) => ({
        ...prev,
        [chiave]: { ...(prev[chiave] || {}), ...payload, ...(r.override || {}), chiave },
      }));
    }
    return r;
  };

  const creaClienteScheda = async (f) => {
    // Prima il codice: senza codice il cliente e' invisibile al CRM e allo
    // storico, e il DDT non si puo' emettere. Se questo passo non riesce non si
    // scrive niente da nessuna parte.
    const res = await callSheetsApi({
      action: "createCliente",
      payload: JSON.stringify({
        ragioneSociale: f.ragione_sociale,
        piva: f.partita_iva,
        codiceFiscale: f.codice_fiscale,
        codiceDestinatarioTs: f.codice_univoco,
        categoria: f.tipologia,
        note: f.note,
      }),
    });
    if (!res || !res.success) {
      alert("Cliente NON creato: " + ((res && res.error) || "errore"));
      return;
    }
    const nuovo = res.cliente || res.dato || null;
    const idNuovo = String((nuovo && (nuovo.ID_Cliente || nuovo.id_cliente)) || res.codice || "");
    const chiave = chiaveAnagrafica({ name: f.ragione_sociale, piva: f.partita_iva }, f.partita_iva);
    if (chiave) await salvaSchedaOverride(chiave, f);
    await loadDataFromSheets();
    alert(
      `Cliente creato con il codice ${idNuovo || "(assegnato dal registro)"}.\n\n` +
      "Ora aggiungi la sede di consegna: la trovi in fondo alla scheda."
    );
    // Si resta dentro la scheda, adesso in modifica, cosi' la sede si aggiunge
    // subito senza cercare il cliente nell'elenco.
    setClienteAperto({ idAppena: idNuovo, chiave });
  };

  const salvaClienteScheda = async (cliente, f) => {
    const chiave = chiaveAnagrafica(cliente, f.partita_iva);
    if (!chiave) {
      alert("Cliente non identificabile: manca sia P.IVA sia ragione sociale.");
      return;
    }
    const r = await salvaSchedaOverride(chiave, f);
    if (!r || !r.success) {
      alert("Anagrafica non salvata: " + ((r && r.error) || "errore"));
      return;
    }
    // I campi di identita' stanno sulla tabella clienti, non nell'override: se
    // qualcuno corregge la P.IVA qui, deve cambiare anche la' o l'elenco
    // continuerebbe a mostrare quella vecchia.
    await callSheetsApi({
      action: "updateCliente",
      payload: JSON.stringify({
        idCliente: cliente.id,
        ragioneSociale: f.ragione_sociale,
        piva: f.partita_iva,
        codiceFiscale: f.codice_fiscale,
        codiceDestinatarioTs: f.codice_univoco,
        categoria: f.tipologia,
      }),
    });
    await loadDataFromSheets();
    setClienteAperto(null);
  };

  const salvaDestinazione = async (dest) => {
    const r = await callSheetsApi({
      action: "salvaDestinazione",
      payload: JSON.stringify(dest),
    });
    if (!r || !r.success) {
      alert("Errore nel salvare la sede: " + ((r && r.error) || "sconosciuto"));
      return;
    }
    await ricaricaDestinazioni();
  };

  const disattivaDestinazione = async (id) => {
    const r = await callSheetsApi({ action: "eliminaDestinazione", payload: JSON.stringify({ id }) });
    if (!r || !r.success) {
      alert("Errore: " + ((r && r.error) || "sconosciuto"));
      return;
    }
    await ricaricaDestinazioni();
  };

  // Rilegge solo le destinazioni, senza rifare tutto il caricamento.
  const ricaricaDestinazioni = async () => {
    try {
      const raw = await callSheetsApi();
      setDestinazioni(raw.destinazioni || {});
    } catch (_) {}
  };

  const cercaLotti = async (q) => {
    const testo = String(q || "").trim();
    setLottoScelto("");
    if (testo.length < 2) { setLottoRighe([]); return; }
    setLottoCercando(true);
    try {
      const r = await callSheetsApi({ action: "tracciaLotti", payload: JSON.stringify({ q: testo }) });
      setLottoRighe(r && r.success ? r.righe || [] : []);
    } catch (e) {
      setLottoRighe([]);
    } finally {
      setLottoCercando(false);
    }
  };

  const reopenShippedOrder = async (order) => {
    if (!order) return;
    const conferma = window.confirm(
      `Riportare tra i PREPARATI l'ordine di ${order.customer || order.id}?` +
        (order.ddtNumero
          ? `\n\nATTENZIONE: il DDT ${order.ddtNumero} e' gia' stato generato e resta associato all'ordine.`
          : "\n\nNessun DDT e' stato ancora generato, quindi non si perde nessun numero.")
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
        aggiornaStatoOrdineApp(order.id, "Importato").catch(() => {});
        setPage("preparati");
      }
    } catch (error) {
      setOrders(previousOrders);
      alert("Errore di collegamento: " + String(error));
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
  // Peso scritto a mano. Stringa vuota = "ricalcolalo tu dalle righe".
  const setOrderPeso = async (orderId, peso) => {
    if (!orderId) return;
    const val = String(peso ?? "").trim();
    const n = val === "" ? null : Number(val);
    if (val !== "" && (!Number.isFinite(n) || n < 0)) {
      alert("Il peso deve essere un numero, in chilogrammi. Esempio: 14,5");
      return;
    }
    const previousOrders = orders;
    setOrders((prev) =>
      prev.map((o) => (String(o.id) === String(orderId) ? { ...o, pesoManuale: n } : o))
    );
    try {
      const result = await callSheetsApi({
        action: "updateOrder",
        payload: JSON.stringify({ orderId, peso_manuale: val === "" ? "" : n }),
      });
      if (!result || !result.success) {
        setOrders(previousOrders);
        alert("Errore nel salvataggio del peso: " + ((result && result.error) || "sconosciuto"));
      }
    } catch (e) {
      setOrders(previousOrders);
      alert("Errore di collegamento nel salvataggio del peso.");
    }
  };

  // Prezzi sul DDT, si' o no. E' una preferenza DEL CLIENTE, non della singola
  // stampa: certi vogliono vedere gli importi sul documento di trasporto, altri
  // non devono vederli affatto (tipico quando a ricevere e' un magazzino terzo
  // o un punto vendita che non tratta i prezzi). Si spunta una volta e vale per
  // tutti i suoi documenti, anche quelli futuri. Richiesta di Luca, 03/08/2026.
  const setDdtConPrezzi = async (order, attivo) => {
    const chiave = clientKeyFor(order);
    if (!chiave) {
      alert(
        "Non riesco a identificare il cliente (manca sia la P.IVA sia la ragione sociale), " +
          "quindi non so a chi attaccare la preferenza."
      );
      return;
    }
    const prima = clientiOverride;
    setClientiOverride((p) => ({
      ...p,
      [chiave]: { ...(p[chiave] || {}), chiave, ddt_con_prezzi: !!attivo },
    }));
    try {
      const r = await callSheetsApi({
        action: "saveClienteOverride",
        payload: JSON.stringify({ chiave, ddt_con_prezzi: !!attivo, operatore: authUser?.user || "" }),
      });
      if (!r || !r.success) {
        setClientiOverride(prima);
        alert("Errore nel salvare la preferenza: " + ((r && r.error) || "sconosciuto"));
      }
    } catch (e) {
      setClientiOverride(prima);
      alert("Errore di collegamento nel salvare la preferenza.");
    }
  };

  // Le destinazioni di un cliente, e quella scelta per questo ordine.
  // Se non e' stata scelta vale la predefinita: la merce parte comunque, e
  // parte dove e' sempre andata.

  // Il bollino della destinazione monta uguale in tutte le viste: lo stesso
  // gesto in Ordini, Preparati, Spediti e Archivio, come chiesto da Luca
  // ("il layout ed i bottoni devono essere uguali per tutti").
  const bollinoDestinazione = (order, compatto = false) => (
    <BadgeDestinazione
      order={order}
      sedi={destinazioniDi(order)}
      scelta={destinazioneDi(order)}
      compatto={compatto}
      onScegli={(id) => setOrderDestinazione(order.id, id)}
      onAggiungi={() => openCompletaAnagrafica(order, { nuovaSede: true })}
    />
  );

  // Correggere il metodo senza rifare la scadenza non servirebbe a niente: la
  // scadenza e' il motivo per cui si corregge. Lo fa il database in un colpo
  // solo (imposta_metodo_pagamento), cosi' non esiste il mezzo secondo in cui il
  // metodo e' nuovo e la scadenza e' vecchia.
  const setOrderPagamento = async (orderId, metodo) => {
    if (!orderId || !metodo) return;
    const prima = orders;
    setOrders((prev) =>
      prev.map((o) => (String(o.id) === String(orderId) ? { ...o, metodoPagamento: metodo } : o))
    );
    try {
      const r = await callSheetsApi({
        action: "impostaMetodoPagamento",
        payload: JSON.stringify({ orderId, metodo }),
      });
      if (!r || !r.success) {
        setOrders(prima);
        alert("Metodo di pagamento non salvato: " + ((r && r.error) || "errore"));
        return;
      }
      // La scadenza si dice ad alta voce: e' il motivo per cui si e' cliccato,
      // e chi corregge deve vedere che numero e' uscito, non fidarsi.
      if (r.scadenza) {
        alert(`Pagamento: ${metodo}
Scadenza a Cashflow: ${fmtDate(r.scadenza)}`);
      }
    } catch (e) {
      setOrders(prima);
      alert("Errore di collegamento nel salvare il metodo di pagamento.");
    }
  };

  const bollinoPagamento = (order, compatto = false) => (
    <BadgePagamento
      order={order}
      metodoCliente={metodoDelCliente(order)}
      compatto={compatto}
      onScegli={(m) => setOrderPagamento(order.id, m)}
    />
  );

  const setOrderDestinazione = async (orderId, idDest) => {
    if (!orderId) return;
    const prima = orders;
    setOrders((prev) =>
      prev.map((o) => (String(o.id) === String(orderId) ? { ...o, idDestinazione: idDest || "" } : o))
    );
    try {
      const r = await callSheetsApi({
        action: "updateOrder",
        payload: JSON.stringify({ orderId, id_destinazione: idDest || "" }),
      });
      if (!r || !r.success) {
        setOrders(prima);
        alert("Errore nel salvare la destinazione: " + ((r && r.error) || "sconosciuto"));
      }
    } catch (e) {
      setOrders(prima);
      alert("Errore di collegamento nel salvare la destinazione.");
    }
  };

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
    // Segnare spedito EMETTE il documento di trasporto, e da li' non si torna
    // indietro (regola di Luca 03/08/2026). Va detto prima di farlo, non dopo,
    // e va detto anche cosa manca: correggere un DDT gia' uscito e' un'altra
    // faccenda rispetto a completarlo un minuto prima.
    const mancanti = campiMancantiDDT(order);
    const avviso =
      mancanti.totale > 0
        ? "\n\nATTENZIONE, sul documento mancano:\n- " +
          [...mancanti.bloccanti, ...mancanti.daCompletare].join("\n- ")
        : "";
    if (!String(corriere || "").trim()) {
      alert(
        "Manca il CORRIERE, e senza non si puo' segnare l'ordine come spedito.\n\n" +
          "Scegline uno dalle opzioni di trasporto, oppure scrivilo a mano se e' " +
          "un corriere locale, un ritiro del cliente o un mezzo nostro."
      );
      setTransportModalOrderId(order.id);
      return;
    }
    const conferma = window.confirm(
      `Segnare come SPEDITO l'ordine di ${order.customer || order.id}?` +
        (corriere ? `\nCorriere: ${corriere}` : "\nNessun corriere selezionato.") +
        "\n\nSi puo' ancora tornare indietro: il documento e il punto di non " +
        "ritorno arrivano con l'archiviazione." +
        avviso
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
        // Il numero DDT lo stacca il database nello stesso momento in cui
        // scrive "Spedito" (trigger, sql/ddt_alla_spedizione.sql). Qui lo si
        // rilegge per mostrarlo subito, senza aspettare un refresh.
        const numero = String(result.ordine?.ddt_numero || result.ordine?.DDT_Numero || "").trim();
        if (numero) {
          setOrders((prev) =>
            prev.map((o) => (String(o.id) === String(order.id) ? { ...o, ddtNumero: numero } : o))
          );
        }
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

  // UN SOLO motore per due documenti: il DDT e la conferma d'ordine. Cambiano
  // tre cose (intestazione, numero, firme), tutto il resto e' identico: stesso
  // destinatario, stesse righe, stessi prezzi. Tenerli separati vorrebbe dire
  // correggere ogni cosa due volte e vederli divergere.
  //   tipo = "ddt"      -> Documento di Trasporto, consuma un numero
  //   tipo = "conferma" -> Conferma d'ordine, NON consuma nessun numero
  const generaDocumento = async (order, tipo = "ddt") => {
    if (!order) return;
    const isConferma = tipo === "conferma";

    // L'AGENTE si sceglie PRIMA del documento di trasporto (Luca 04/08/2026).
    // Qui si blocca davvero, non si avvisa: una volta emesso il DDT la merce
    // e' partita, e ricostruire dopo a chi va la provvigione vuol dire
    // chiederlo in giro. Sulla conferma d'ordine non serve: quella si manda al
    // cliente prima di spedire, e l'agente si puo' ancora mettere.
    if (!isConferma && !String(agenteDi(order) || "").trim()) {
      alert(
        "Manca l'AGENTE, e senza non si puo' emettere il documento di trasporto.\n\n" +
          "Scegli l'agente dall'anagrafica del cliente (resta valido per tutti i suoi " +
          "ordini futuri) oppure sull'ordine, se questa vendita fa eccezione."
      );
      openCompletaAnagrafica(order);
      return;
    }
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
    // La conferma d'ordine porta il numero dell'ORDINE: non e' un documento
    // fiscale e non deve bruciare un numero di DDT.
    let numero = isConferma ? order.id : order.ddtNumero;
    if (!numero && !isConferma) {
      // Il numero lo decide e lo scrive il DATABASE, in una sola istruzione.
      // Qui NON si calcola piu' niente: il vecchio "leggi il prossimo, poi
      // scrivilo" poteva dare lo stesso numero a due postazioni e lasciava un
      // buco se la scrittura falliva. Vedi sql/numero_ddt.sql.
      const nres = await callSheetsApi({
        action: "assegnaNumeroDDT",
        payload: JSON.stringify({ orderId: order.id }),
      });
      if (!nres || !nres.success || !nres.numero) {
        // Nessun ripiego che si inventi un numero: meglio non stampare che
        // stampare un DDT con un numero gia' usato da un altro documento.
        alert(
          "Non sono riuscito ad assegnare il numero DDT: " +
            ((nres && nres.error) || "sconosciuto") +
            "\n\nIl documento NON e' stato generato. Riprova fra un momento."
        );
        return;
      }
      numero = String(nres.numero);
      setOrders((prev) =>
        prev.map((o) => (String(o.id) === String(order.id) ? { ...o, ddtNumero: numero } : o))
      );
    }

    // Dati destinatario: snapshot APP / GAMMA arricchito col nostro override.
    const app = effectiveCliente(order).merged || {};
    const cli = clientsById[String(order.clientId)] || {};
    const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
    // DOVE va la merce: la destinazione scelta per questo ordine, o la
    // predefinita del cliente. Ha via e civico separati, e i suoi orari: un
    // cliente con tre negozi ha tre orari di scarico diversi, e quello che
    // conta e' l'orario del negozio dove il camion sta andando.
    const dst = destinazioneDi(order);
    const rigaVia = dst
      ? [dst.via, dst.civico].filter(Boolean).join(" ")
      : (app.indirizzo_spedizione || app.sede_legale || app.indirizzo || cli.indirizzo || "");
    // Sede legale spezzata dall'importazione; se non c'e', il vecchio campo unico.
    const sedeLegaleRiga = [
      [app.sede_via, app.sede_civico].filter(Boolean).join(" "),
      [app.sede_cap, app.sede_localita].filter(Boolean).join(" ") +
        (app.sede_provincia ? ` (${app.sede_provincia})` : ""),
    ].filter((x) => String(x).trim()).join(" · ") || app.sede_legale || cli.indirizzo || "";

    const dest = {
      ragione: app.ragione_sociale || cli.name || order.customer || "",
      piva: app.partita_iva || cli.piva || "",
      sedeLegale: sedeLegaleRiga,
      indirizzo: rigaVia,
      cap: (dst && dst.cap) || app.cap || cli.cap || order.cap || "",
      citta: (dst && dst.localita) || app.citta || cli.citta || "",
      provincia: (dst && dst.provincia) || app.provincia || cli.provincia || "",
      insegna: (dst && dst.insegna) || app.insegna || "",
      etichettaDest: dst ? dst.etichetta : "",
      quanteDest: dst ? dst.quante_per_cliente : 0,
      // Telefono e orari del PUNTO di consegna, se li ha; altrimenti quelli
      // generali del cliente.
      telefono: (dst && dst.telefono) || app.telefono || cli.telefono || "",
      email: app.email || cli.email || "",
      pec: app.pec || "",
      codiceUnivoco: app.codice_univoco || "",
      giornoChiusura: (dst && dst.giorno_chiusura) || app.giorno_chiusura || "",
      orari: (dst && dst.orari_consegna) || app.orari_consegna || app.orario_scarico || "",
      pagamento: app.metodo_pagamento || "",
      note: String(app.note || "").trim(),
    };
    const corriere =
      order.courier || order.courierSpedizione || order.transport?.consigliato?.corriere || "";
    // La data del DOCUMENTO, non quella di oggi. Sembra un dettaglio e non lo
    // e': ristampare un DDT il giorno dopo ne cambiava la data, e un documento
    // fiscale con due date diverse a seconda di quando lo stampi non sta in
    // piedi. Vale il giorno in cui la merce e' uscita.
    const dataDoc = order.dataPrepared || order.date || null;
    const oggi = dataDoc
      ? new Date(dataDoc).toLocaleDateString("it-IT")
      : new Date().toLocaleDateString("it-IT");
    // Mappa lotto: codice + scadenza, per riportarli nella descrizione riga.
    const lotById = Object.fromEntries(
      lots.map((l) => [String(l.id), { code: l.lot || "", expiry: l.expiry || "" }])
    );
    // Prezzi sul documento: e' una preferenza del CLIENTE (ddt_con_prezzi
    // sull'override), non della singola stampa. Certi li vogliono vedere, altri
    // non devono vederli: dipende da chi riceve la merce.
    // Sul DDT i prezzi sono una scelta del cliente; sulla conferma d'ordine
    // ci sono sempre, perche' e' proprio quello che il cliente deve confermare.
    const conPrezzi = isConferma || !!(clientiOverride[clientKeyFor(order)] || {}).ddt_con_prezzi;
    const eur = (n) =>
      Number(n || 0).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    let imponibile = 0;
    const perAliquota = {};
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
        const base = `<td>${esc(codice)}</td><td>${descr}</td><td style="text-align:right">${line.qtyOrdered}</td>`;
        if (!conPrezzi) return `<tr>${base}</tr>`;

        const prezzo = Number(line.prezzoUnitario || 0);
        const sconto = Number(line.scontoPct || 0);
        const sconto2 = Number(line.sconto2Pct || 0);
        const sconto3 = Number(line.sconto3Pct || 0);
        // I tre sconti in CASCATA: ognuno sul prezzo gia' scontato dal
        // precedente. Stessa formula del database (netto_riga).
        const totale = nettoRiga(line.qtyOrdered, prezzo, sconto, sconto2, sconto3);
        imponibile += totale;
        const aliq = Number(line.ivaPct ?? 4);
        perAliquota[aliq] = (perAliquota[aliq] || 0) + totale;
        // Prezzo mancante: si scrive "da definire", non zero. Uno zero su un
        // documento consegnato al cliente sembra merce regalata.
        const cellaPrezzo = prezzo > 0 ? eur(prezzo) : "da definire";
        const cellaTotale = prezzo > 0 ? eur(totale) : "—";
        // L'aliquota su OGNI riga: sullo stesso documento convivono il 4% e
        // il 10%, e chi controlla la fattura deve vedere quale sta dove senza
        // ricostruirlo. Se manca si scrive, non si mette un valore di ripiego.
        const cellaIva = line.ivaPct == null
          ? `<span style="color:#b91c1c">da definire</span>`
          : (Number(line.ivaPct) === 0
              ? `0%${line.naturaIva ? " " + esc(line.naturaIva) : ""}`
              : eur(Number(line.ivaPct)) + "%");
        return (
          `<tr>${base}` +
          `<td style="text-align:right">${cellaPrezzo}</td>` +
          `<td style="text-align:right">${
             [sconto, sconto2, sconto3].filter((x) => x > 0)
               .map((x) => eur(x) + "%").join(" + ") || ""
           }</td>` +
          `<td style="text-align:right">${cellaIva}</td>` +
          `<td style="text-align:right">${cellaTotale}</td></tr>`
        );
      })
      .join("");

    const iva = Object.entries(perAliquota).reduce(
      (s, [a, imp]) => s + imp * (Number(a) / 100),
      0
    );
    const intestazionePrezzi = conPrezzi
      ? `<th style="text-align:right">Prezzo</th><th style="text-align:right">Sconto</th>` +
        `<th style="text-align:right">IVA</th><th style="text-align:right">Totale</th>`
      : "";
    const riepilogoPrezzi = conPrezzi
      ? `<div class="riepilogo">
           ${Object.entries(perAliquota)
             .sort((a, b) => Number(a[0]) - Number(b[0]))
             .map(([a, imp]) =>
               // Una riga per aliquota, con imponibile e imposta: e' il
               // riepilogo che sta su ogni fattura, e serve a chi controlla
               // per rifare i conti senza sommare le righe a mano.
               `<div><span>Imponibile ${eur(Number(a))}%</span><b>${eur(imp)} €</b></div>` +
               `<div><span>IVA ${eur(Number(a))}%</span><b>${eur(imp * Number(a) / 100)} €</b></div>`
             ).join("")}
           <div style="border-top:1px solid #ccc;margin-top:4px;padding-top:4px">
             <span>Totale imponibile</span><b>${eur(imponibile)} €</b></div>
           <div><span>Totale IVA</span><b>${eur(iva)} €</b></div>
           <div class="grande"><span>Totale documento</span><b>${eur(imponibile + iva)} €</b></div>
         </div>`
      : "";
    // Anagrafica del destinatario: ogni dato con la sua etichetta, su righe
    // separate. Prima era una frase unica di seguito ("Insegna: X · Pagamento:
    // Y · Codice SdI: Z...") e chi doveva leggere un dato preciso doveva
    // cercarlo dentro la riga. Su un documento che si consegna a mano non va.
    const riga = (etichetta, valore) =>
      valore ? `<div><span>${esc(etichetta)}</span><b>${esc(valore)}</b></div>` : "";
    const datiFiscali = [
      riga("Ragione sociale", dest.ragione),
      riga("Insegna", dest.insegna && dest.insegna !== dest.ragione ? dest.insegna : ""),
      riga("Partita IVA", dest.piva),
      riga("Codice SdI", dest.codiceUnivoco),
      riga("PEC", dest.pec),
      riga("Email", dest.email),
      riga("Pagamento", dest.pagamento),
    ].filter(Boolean).join("");
    const localita = [
      esc(dest.cap),
      esc(dest.citta) + (dest.provincia ? ` (${esc(dest.provincia)})` : ""),
    ].filter((x) => x.trim()).join(" ");
    // Orario di scarico, giorno di chiusura e telefono vanno GRANDI, in un
    // riquadro tutto loro (richiesta di Luca, 03/08/2026): sono le tre cose che
    // l'autista deve leggere al volo dal furgone. Sepolte nella riga
    // dell'anagrafica in corpo 13 non le vedeva nessuno, e il camion tornava
    // indietro. Se mancano tutte e tre, il riquadro non compare.
    const consegnaCelle = [
      dest.orari ? ["Orario di scarico", dest.orari] : null,
      dest.giornoChiusura ? ["Giorno di chiusura", dest.giornoChiusura] : null,
      dest.telefono ? ["Telefono", dest.telefono] : null,
    ].filter(Boolean);
    const consegnaHtml = consegnaCelle.length
      ? `<div class="consegna">${consegnaCelle
          .map(([et, v]) => `<div><span>${esc(et)}</span><strong>${esc(v)}</strong></div>`)
          .join("")}</div>`
      : "";
    const sedeDiversa =
      dest.sedeLegale && dest.sedeLegale.trim() && dest.sedeLegale.trim() !== dest.indirizzo.trim();
    const html = `<!doctype html><html lang="it"><head><meta charset="utf-8"><title>${isConferma ? "Conferma ordine " : ""}${esc(numero)}</title>
<style>
/* Un FOGLIO A4, non una pagina larga quanto lo schermo (Luca 05/08/2026).
   @page da' i margini alla stampa; il .foglio con larghezza fissa fa vedere
   a schermo la stessa cosa che uscira' dalla stampante, cosi' non ci sono
   sorprese fra quello che si guarda e quello che si firma. */
@page { size: A4 portrait; margin: 12mm; }
html{background:#e8ebf0}
body{font-family:Arial,sans-serif;margin:0;padding:18px;color:#111}
.foglio{width:186mm;min-height:262mm;margin:0 auto;background:#fff;padding:10mm 12mm;
  box-shadow:0 6px 24px rgba(0,0,0,.14);box-sizing:border-box}
@media print{
  html,body{background:#fff}
  body{padding:0}
  .foglio{width:auto;min-height:0;margin:0;padding:0;box-shadow:none}
}
h1{font-size:20px;margin:0}
.top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #111;padding-bottom:12px;margin-bottom:16px}
.box{border:1px solid #999;border-radius:6px;padding:10px 12px;margin-bottom:12px;font-size:13px;line-height:1.5}
table{width:100%;border-collapse:collapse;margin-top:8px}th,td{border:1px solid #999;padding:6px 8px;font-size:13px;text-align:left}
th{background:#eee}.tot{display:flex;gap:24px;margin-top:12px;font-weight:bold}
.firma{display:flex;gap:40px;margin-top:40px}.firma div{flex:1;border-top:1px solid #111;padding-top:6px;font-size:12px}
.consegna{display:flex;gap:10px;margin-bottom:12px}
.consegna>div{flex:1;border:2.5px solid #111;border-radius:6px;padding:10px 12px;text-align:center}
.consegna span{display:block;font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#333;font-weight:bold}
.consegna strong{display:block;font-size:27px;line-height:1.15;margin-top:3px;letter-spacing:-.01em}
/* Anagrafica in due colonne: a sinistra chi e', a destra dove va. Ogni dato
   con la sua etichetta, cosi' si trova a colpo d'occhio. */
.anagrafica{display:flex;gap:12px;margin-bottom:12px;align-items:stretch}
.anagrafica .riquadro{flex:1;border:1px solid #999;border-radius:6px;padding:10px 12px}
.anagrafica h2{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#555;
  margin:0 0 6px;padding-bottom:4px;border-bottom:1px solid #ddd}
.campi>div{display:flex;gap:10px;padding:2px 0;font-size:13px;line-height:1.35}
.campi span{flex:0 0 108px;color:#555}
.campi b{flex:1;word-break:break-word}
.anagrafica .luogo{font-size:15px;line-height:1.4;font-weight:bold}
.anagrafica .secondaria{font-weight:normal;color:#444;font-size:13px}
.anagrafica .nota{margin-top:8px;font-size:11.5px;color:#777;font-style:italic}
.riepilogo{margin-top:10px;margin-left:auto;width:300px;font-size:13px}
.riepilogo>div{display:flex;justify-content:space-between;padding:3px 0}
.riepilogo .grande{border-top:1.5px solid #111;margin-top:4px;padding-top:6px;font-size:16px}
.nota-cliente{margin-top:12px;border:1px solid #999;border-radius:6px;padding:8px 12px;
  font-size:13px;line-height:1.45;white-space:pre-wrap}
.nota-cliente span{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.08em;
  color:#555;margin-bottom:3px}
.nota-conferma{margin-top:16px;padding:10px 12px;border:1px solid #999;border-radius:6px;
  font-size:12px;line-height:1.45;color:#333;background:#fafafa}
@media print{.noprint{display:none}}</style></head><body>
<div class="foglio">
<div class="top"><div><h1>GLUTEN FREE EXPERIENCE SRL</h1><div style="font-size:12px">${
  isConferma ? "Conferma d&rsquo;ordine" : "Documento di Trasporto (D.d.T.) — D.P.R. 472/96"
}</div></div>
<div style="text-align:right"><div style="font-size:18px;font-weight:bold">${esc(numero)}</div><div>Data: ${oggi}</div></div></div>
<div class="anagrafica">
  <div class="riquadro">
    <h2>Destinatario</h2>
    <div class="campi">${datiFiscali}</div>
  </div>
  <div class="riquadro">
    <h2>Sede di consegna${dest.etichettaDest && dest.quanteDest > 1 ? " &mdash; " + esc(dest.etichettaDest) : ""}</h2>
    ${dest.insegna && dest.insegna !== dest.ragione
      ? `<div class="luogo" style="font-size:17px">${esc(dest.insegna)}</div>` : ""}
    <div class="luogo">${esc(dest.indirizzo) || "&mdash;"}<br>${localita || "&mdash;"}</div>
    ${sedeDiversa
      ? `<h2 style="margin-top:10px">Sede legale</h2><div class="luogo secondaria">${esc(dest.sedeLegale)}</div>`
      : `<div class="nota">La sede legale coincide con quella di consegna.</div>`}
  </div>
</div>
${consegnaHtml}
<div class="box"><b>Trasporto a mezzo:</b> ${esc(corriere) || "vettore"} · <b>Causale:</b> Vendita · <b>Porto:</b> franco · <b>Ordine:</b> ${esc(order.id)}${dest.pagamento ? " · <b>Pagamento:</b> " + esc(dest.pagamento) : ""}</div>
<table><thead><tr><th>Codice</th><th>Descrizione (lotto e scadenza)</th><th style="text-align:right">Qta</th>${intestazionePrezzi}</tr></thead><tbody>${righeHtml}</tbody></table>
${riepilogoPrezzi}
<div class="tot"><span>Colli: ${order.colli ?? ""}</span><span>Peso lordo: ${fmtKg(order.pesoTotale)} kg</span></div>
${dest.note
  ? `<div class="nota-cliente"><span>Note</span>${esc(dest.note)}</div>`
  : ""}
${isConferma
  ? `<div class="nota-conferma">Documento di conferma, non vale come documento di trasporto n&eacute; come fattura. Verificare quantit&agrave;, prezzi e indirizzo di consegna e segnalare eventuali differenze prima della spedizione.</div>
     <div class="firma"><div>Per accettazione</div></div>`
  : `<div class="firma"><div>Firma conducente</div><div>Firma destinatario</div></div>`}
</div>
<button class="noprint" onclick="window.print()" style="display:block;margin:18px auto;padding:10px 22px;font-size:14px;border-radius:8px;border:1px solid #888;background:#fff;cursor:pointer">Stampa</button>
</body></html>`;
    const w = window.open("", "_blank");
    if (!w) {
      alert("Il browser ha bloccato la finestra del DDT: consenti i popup e riprova.");
      return;
    }
    w.document.write(html);
    w.document.close();
  };

  const generaDDT = (order) => generaDocumento(order, "ddt");
  const generaConfermaOrdine = (order) => generaDocumento(order, "conferma");

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
    // Stessa regola sull'archiviazione in blocco, ma senza fermare tutto: si
    // dice QUALI restano indietro e si archiviano gli altri. Bloccare venti
    // ordini buoni per due scoperti farebbe rimandare l'archiviazione a domani,
    // e allora non si archivia piu' niente.
    const scoperti = orders.filter(
      (o) =>
        !o.archived &&
        String(o.status || "").trim().toLowerCase() === "preparato" &&
        pagamentoScoperto(o)
    );

    const conferma = window.confirm(
      scoperti.length
        ? `Attenzione: ${scoperti.length} ordini non hanno un metodo di pagamento leggibile e ` +
          "NON verranno archiviati, perche' la loro scadenza a Cashflow sarebbe una stima:\n\n- " +
          scoperti.slice(0, 8).map((o) => `${o.customer} (${o.metodoPagamento || "vuoto"})`).join("\n- ") +
          (scoperti.length > 8 ? `\n- e altri ${scoperti.length - 8}` : "") +
          "\n\nArchivio gli altri?"
        : "Vuoi archiviare tutti gli ordini preparati non ancora archiviati?"
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

    // IL CANCELLO. Archiviare apre la partita a Cashflow, e la scadenza la
    // calcola il metodo di pagamento: senza un metodo leggibile nascerebbe una
    // scadenza stimata, cioe' un incasso che nessuno aspetta al giorno giusto.
    // Qui si blocca e non si avvisa soltanto, perche' l'archiviazione e' il punto
    // di non ritorno (Luca 06/08/2026: "metti in modo tale che debba essere
    // inserito bene").
    const ord = orders.find((o) => String(o.id) === String(orderId));
    if (ord && pagamentoScoperto(ord)) {
      const attuale = metodoEffettivo(ord.metodoPagamento, metodoDelCliente(ord));
      alert(
        (attuale
          ? `Il metodo di pagamento e' "${attuale}", e non dice quando si incassa.`
          : "Questo ordine non ha un metodo di pagamento.") +
          "\n\nArchiviando adesso, la scadenza a Cashflow sarebbe una stima." +
          "\nScegli il metodo dal bollino 💸 sull'ordine, poi archivia."
      );
      return;
    }

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
      // Il codice glielo assegna il registro, non chi carica. Lo mostro subito:
      // e' il riferimento da scrivere sui documenti e da cercare nel CRM.
      if (!isEdit && result.codice) {
        setNuovoCodiceCliente({ codice: String(result.codice), nome: ragione, nuovo: !!result.codiceNuovo });
      }
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
      agenteId: newOrderAgenteId || "",
      agenteNome: (agenti.find((a) => a.Agente_Id === newOrderAgenteId) || {}).Nome || "",
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
          agenteId: newOrder.agenteId,
          agenteNome: newOrder.agenteNome,
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
      setNewOrderAgenteId("");
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

    // Se il DDT e' gia' stato emesso, cancellare l'ordine lascia un BUCO nella
    // numerazione: quel numero esiste su un foglio che qualcuno ha in mano, e
    // da noi non esistera' piu'. Va detto prima, non scoperto dal
    // commercialista fra tre mesi (Luca 04/08/2026).
    const ddt = String(orderToDelete?.ddtNumero || "").trim();
    const avvisoDdt = ddt
      ? `\n\n⚠️ ATTENZIONE: per questo ordine e' gia' stato emesso il DDT ${ddt}.\n` +
        `Eliminandolo, il numero ${ddt} restera' un BUCO nella numerazione: il documento ` +
        `esiste su carta ma non piu' qui, e nessuno sapra' spiegare quel salto.\n` +
        `Se il documento non e' mai uscito dall'azienda si puo' fare. Se e' gia' partito col ` +
        `camion o e' arrivato al cliente, meglio correggere l'ordine invece di eliminarlo.`
      : "";

    // Conferma esplicita: messaggi diversi a seconda dello stato.
    const conferma = window.confirm(
      (wasPreparato
        ? "Questo ordine era PREPARATO. Eliminandolo, le quantità scaricate vengono RIMESSE in magazzino sui lotti coinvolti. Procedo?"
        : "Vuoi eliminare davvero questo ordine? Eventuali assegnazioni vengono rimosse, lo stock fisico non e' stato ancora scalato."
      ) + avvisoDdt
    );
    if (!conferma) return;

    // Con un DDT emesso si chiede due volte: la prima conferma la si da' per
    // abitudine, la seconda si legge.
    if (ddt) {
      const doppia = window.confirm(
        `Confermi di voler lasciare il buco al numero ${ddt}?\n\n` +
          "Annulla se preferisci correggere l'ordine invece di eliminarlo."
      );
      if (!doppia) return;
    }

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
              {/* LE TAPPE. L'ordine passa di qui in sequenza: arriva, si
                  prepara, parte, si archivia. Restano quattro pastiglie in
                  vista perche' sono il lavoro di tutti i giorni.
                  Tutto il resto sta nei menu qui accanto: prima erano 16 voci
                  tutte allo stesso peso, quindi niente era in evidenza. */}
              {TAPPE.filter((t) => !t.soloAdmin || isAdmin)
                    .filter((t) => !isProduzione || t.ancheProduzione)
                    .map((t) => (
                <button
                  key={t.id}
                  style={{
                    ...btnStyle(page === t.id ? "primary" : "soft"),
                    borderRadius: 999,
                    minWidth: isSmallLayout ? "calc(50% - 5px)" : 128,
                  }}
                  onClick={() => setPage(t.id)}
                >
                  {t.icona} {isProduzione && t.etichettaProduzione ? t.etichettaProduzione : t.etichetta}
                  {t.contatore > 0 ? (
                    <span style={{ ...badgeStyle(t.tipoBadge || "warning"), marginLeft: 6 }}>
                      {t.contatore}
                    </span>
                  ) : null}
                </button>
              ))}

              {/* Le viste laterali: si consultano, non ci si lavora dentro
                  tutto il giorno. Il badge sul bottone tiene visibile quello
                  che chiede attenzione anche a menu chiuso. */}
              <MenuScelte
                titolo="Altro"
                larghezza={280}
                attivo={["ordini-app", "fermi", "ddt", "magazzino", "bollati", "prodotti", "clienti", "foto-bolle"].includes(page)}
                badge={(isProduzione ? 0 : ordiniApp.length) + stoppedCount}
                voci={[
                  !isProduzione && {
                    label: "Ordini da APP", icona: <Smartphone size={16} />,
                    attivo: page === "ordini-app", badge: ordiniApp.length, badgeTipo: "danger",
                    onClick: () => { setPage("ordini-app"); loadOrdiniApp(); },
                  },
                  {
                    label: "Ordini fermi", icona: <AlertTriangle size={16} />,
                    attivo: page === "fermi", badge: stoppedCount,
                    onClick: () => setPage("fermi"),
                  },
                  !isProduzione && {
                    label: "Registro DDT", icona: <span style={{ fontSize: 15 }}>📄</span>,
                    attivo: page === "ddt", separatoreSopra: true,
                    onClick: () => setPage("ddt"),
                  },
                  {
                    label: "Magazzino", icona: <Boxes size={16} />,
                    attivo: page === "magazzino",
                    onClick: () => setPage("magazzino"),
                  },
                  {
                    label: "Bollati", icona: <span style={{ fontSize: 15 }}>🏷️</span>,
                    attivo: page === "bollati", badge: bollatiTotali.lotti,
                    badgeTipo: bollatiTotali.scaduti > 0 ? "danger" : "warning",
                    onClick: () => setPage("bollati"),
                  },
                  !isProduzione && {
                    label: "Prodotti", icona: <Package size={16} />,
                    attivo: page === "prodotti",
                    onClick: () => setPage("prodotti"),
                  },
                  // I clienti stanno qui e non sotto "Nuovo": da qui si guardano
                  // tutti e si correggono, creare e' una delle cose che si fanno
                  // dentro (Luca 06/08/2026).
                  !isProduzione && {
                    label: "Clienti", icona: <span style={{ fontSize: 15 }}>🗂️</span>,
                    attivo: page === "clienti", separatoreSopra: true,
                    onClick: () => { setPage("clienti"); setClienteAperto(null); },
                  },
                  !isProduzione && {
                    label: "Nuovo cliente", icona: <span style={{ fontSize: 15 }}>＋</span>,
                    onClick: () => { setPage("clienti"); setClienteAperto({ nuovo: true }); },
                  },
                  isAdmin && {
                    label: "Foto bolle", icona: <Camera size={16} />,
                    attivo: page === "foto-bolle", separatoreSopra: true,
                    onClick: () => setPage("foto-bolle"),
                  },
                ]}
              />

              {/* Tutto quello che CREA qualcosa, in un posto solo. */}
              {!isProduzione && (
                <MenuScelte
                  titolo="Nuovo"
                  variante="primary"
                  icona={<Plus size={18} />}
                  larghezza={240}
                  voci={[
                    {
                      label: "Ordine", icona: <ClipboardList size={16} />,
                      onClick: () => setOrderDialogOpen(true),
                    },
                    isAdmin && {
                      label: "Prodotto", icona: <Package size={16} />,
                      onClick: () => setProductDialogOpen(true),
                    },
                    isAdmin && {
                      label: "Lotto", icona: <Boxes size={16} />,
                      onClick: () => setLotDialogOpen(true),
                    },
                    isAdmin && {
                      label: "Cliente", icona: <Users size={16} />, separatoreSopra: true,
                      onClick: () => { startNewClient(); setClientSearch(""); setClientDialogOpen(true); },
                    },
                  ]}
                />
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
              {/* Aggiorna resta un bottone suo: si usa spesso e deve stare
                  a un clic. Il resto (admin) e' roba che si tocca due volte al
                  giorno e sta bene dentro il menu. */}
              {/* Il pulsante DEVE far vedere che sta lavorando e che ha
                  finito: senza riscontro sembra sempre che non abbia fatto
                  niente, e uno lo preme tre volte. (Luca 04/08/2026) */}
              {(() => {
                const appena = ultimoAggiornamento && Date.now() - ultimoAggiornamento < 3000;
                return (
                  <button
                    style={{
                      ...btnStyle(loadingData ? "soft" : appena ? "success" : "outline", loadingData),
                      borderRadius: 999,
                      minWidth: isSmallLayout ? "calc(50% - 5px)" : 140,
                    }}
                    disabled={loadingData}
                    onClick={loadDataFromSheets}
                    title="Ricarica tutto: ordini, righe, lotti, anagrafiche e archivio"
                  >
                    <RefreshCw
                      size={18}
                      style={loadingData ? { animation: "girotondo 900ms linear infinite" } : undefined}
                    />
                    {loadingData ? "Aggiorno…" : appena ? "Aggiornato" : "Aggiorna"}
                  </button>
                );
              })()}

              <MenuScelte
                titolo=""
                variante="outline"
                icona={<MoreHorizontal size={18} />}
                larghezza={220}
                voci={[
                  !isAdmin && !isProduzione && {
                    label: "Entra in modalita' Admin", icona: <Lock size={16} />,
                    onClick: () => setAdminDialogOpen(true),
                  },
                  isAdmin && {
                    label: "Esci da Admin", icona: <Lock size={16} />,
                    onClick: exitAdminMode,
                  },
                ]}
              />
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
                          <BadgeAgente
                            nome={agenteDi(selectedOrder)}
                            onApri={() => openCompletaAnagrafica(selectedOrder)}
                          />
                          {/* Il badge del pagamento E' il comando: dice lo stato
                              (compreso lo scaduto calcolato dal Cashflow) e si
                              apre per cambiarlo. Prima erano tre cose separate,
                              il badge piu' due bottoni OK/KO, che dicevano la
                              stessa cosa in due posti. */}
                          {(() => {
                            const info = paymentBadgeFor(selectedOrder, gestionale);
                            const busy = savingPaymentOrderId === String(selectedOrder.id);
                            if (!isAdmin) {
                              return <span style={badgeStyle(info.kind)}>{info.label}</span>;
                            }
                            return (
                              <MenuScelte
                                titolo={info.label}
                                variante={info.kind === "success" ? "success" : info.kind === "danger" ? "danger" : "outline"}
                                larghezza={250}
                                voci={[
                                  {
                                    label: "Pagamento ricevuto", icona: <ThumbsUp size={16} />,
                                    attivo: selectedOrder.paymentStatus === "ok",
                                    onClick: () => { if (!busy) setOrderPayment(selectedOrder.id, "ok"); },
                                  },
                                  {
                                    label: "Pagamento NON ricevuto", icona: <ThumbsDown size={16} />,
                                    attivo: selectedOrder.paymentStatus === "ko", pericolo: true,
                                    onClick: () => { if (!busy) setOrderPayment(selectedOrder.id, "ko"); },
                                  },
                                  info.auto && {
                                    label: "Lascia decidere al Cashflow", icona: <RefreshCw size={16} />,
                                    separatoreSopra: true,
                                    attivo: !selectedOrder.paymentStatus,
                                    onClick: () => { if (!busy) setOrderPayment(selectedOrder.id, selectedOrder.paymentStatus || "ok"); },
                                  },
                                ]}
                              />
                            );
                          })()}
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
                          {/* Tipologia e pagamento erano SETTE bottoni per due
                              sole informazioni, e sono cose che si mettono una
                              volta sola. Adesso ognuna e' un menu che mostra
                              il valore attuale: si legge a colpo d'occhio e si
                              cambia in due clic. (Luca 03/08/2026) */}
                          {(() => {
                            const t = tipologiaFor(selectedOrder);
                            const chiave = clientKeyFor(selectedOrder);
                            const busy = savingOverride === chiave;
                            return (
                              <MenuScelte
                                titolo={t ? `🏷️ ${t}` : "🏷️ Tipologia?"}
                                variante={t ? "dark" : "warning"}
                                larghezza={200}
                                voci={TIPOLOGIE.map((x) => ({
                                  label: x,
                                  attivo: x === t,
                                  onClick: () => { if (!busy) assignTipologia(selectedOrder, x); },
                                }))}
                              />
                            );
                          })()}


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
                          <BadgeCorriere
                            order={selectedOrder}
                            onApri={() => setTransportModalOrderId(String(selectedOrder.id))}
                          />
                          {selectedOrder.transport && !selectedOrder.transport.errore ? (
                            <span style={{ color: "#8595a8", fontSize: 12 }}>
                              {temperaturaLabel(selectedOrder.temperatura)} · {selectedOrder.transport.consigliato.giorni} gg
                            </span>
                          ) : null}
                        </div>

                        {/* Dove va la merce, per QUESTO ordine. Riquadro suo,
                            insieme al trasporto: la domanda e' cosa parte e dove
                            va. Il pagamento sta SOTTO, in un riquadro separato:
                            infilarlo qui dentro faceva leggere "Spedire a:
                            Bonifico anticipato", che sono due cose diverse messe
                            sulla stessa riga (segnalato da Luca 06/08/2026). */}
                        {(() => {
                          const dst = destinazioneDi(selectedOrder);
                          const bollino = bollinoDestinazione(selectedOrder);
                          // Sugli ordini senza codice cliente il bollino non
                          // c'e': senza questo controllo restava un riquadro
                          // "Spedire a" vuoto, o peggio con dentro il pagamento.
                          if (!bollino) return null;
                          return (
                            <div style={{
                              marginTop: 12, padding: "10px 12px", borderRadius: 14,
                              border: "1px solid #dbe2ea", background: "#fff",
                              display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
                            }}>
                              <div style={{ fontSize: 12, fontWeight: 800, color: "#40516a" }}>
                                Spedire a
                              </div>
                              {bollino}
                              {dst ? (
                                <span style={{ fontSize: 12, color: "#66758b" }}>
                                  {[dst.via, dst.civico].filter(Boolean).join(" ")}
                                  {dst.cap ? ` · ${dst.cap}` : ""}
                                  {dst.orari_consegna ? ` · ${dst.orari_consegna}` : ""}
                                  {dst.giorno_chiusura ? ` · chiuso ${dst.giorno_chiusura}` : ""}
                                </span>
                              ) : null}
                            </div>
                          );
                        })()}

                        {/* COME si incassa. Riquadro suo, sotto la spedizione,
                            perche' e' un'altra domanda: la merce dove va, i soldi
                            quando arrivano. */}
                        <div style={{
                          marginTop: 12, padding: "10px 12px", borderRadius: 14,
                          border: "1px solid " + (pagamentoScoperto(selectedOrder) ? "#fecaca" : "#dbe2ea"),
                          background: pagamentoScoperto(selectedOrder) ? "#fef2f2" : "#fff",
                          display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
                        }}>
                          <div style={{ fontSize: 12, fontWeight: 800, color: "#40516a" }}>
                            Pagamento
                          </div>
                          {bollinoPagamento(selectedOrder)}
                          {pagamentoScoperto(selectedOrder) ? (
                            <span style={{ fontSize: 12, color: "#b91c1c", fontWeight: 700 }}>
                              Senza questo l'ordine non si archivia: la scadenza sarebbe una stima.
                            </span>
                          ) : (() => {
                            // La scadenza parte dal giorno dell'ARCHIVIAZIONE, non
                            // dalla data dell'ordine (regola di Luca 06/08/2026).
                            // Finche' l'ordine non e' archiviato la data non c'e'
                            // ancora: si mostra quella che uscirebbe archiviando
                            // oggi, e lo si dice.
                            const daQuando = selectedOrder.archived
                              ? (selectedOrder.date || "")
                              : new Date().toISOString().slice(0, 10);
                            const scad = scadenzaDaMetodo(
                              daQuando,
                              metodoEffettivo(selectedOrder.metodoPagamento, metodoDelCliente(selectedOrder))
                            );
                            return scad ? (
                              <span style={{ fontSize: 12, color: "#66758b" }}>
                                {selectedOrder.archived
                                  ? `si incassa entro il ${fmtDate(scad)}`
                                  : `archiviando oggi si incassa entro il ${fmtDate(scad)}`}
                              </span>
                            ) : null;
                          })()}
                        </div>

                        {/* Prezzi gia' qui, mentre l'ordine si prepara, non solo
                            nei Preparati: e' il momento in cui si guarda cosa
                            si sta mandando, ed e' li' che ci si accorge di un
                            prezzo sbagliato. La produzione non li vede.
                            (Luca 03/08/2026) */}
                        {!isProduzione ? (
                          <div style={{ marginTop: 12 }}>
                            <ValorizzazioneOrdine
                              order={selectedOrder}
                              onSalvato={loadDataFromSheets}
                              listini={listiniPrezzi}
                            />
                          </div>
                        ) : null}

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

                      {/* UNA azione in vista, il resto nel menu. Aggiungere una
                          riga e' quello che si fa cento volte al giorno;
                          modificare, fermare, stampare ed eliminare si fanno
                          una volta ogni tanto. Prima erano tutti bottoni
                          uguali in fila, quindi si cercava ogni volta quello
                          giusto. (Luca 03/08/2026) */}
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                        {isAdmin ? (
                          <button style={btnStyle("primary")} onClick={openAddLineDialog}>
                            <Plus size={16} /> Riga
                          </button>
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

                        <MenuScelte
                          titolo="Azioni"
                          variante="outline"
                          larghezza={250}
                          voci={[
                            isAdmin && {
                              label: "Modifica ordine", icona: <Pencil size={16} />,
                              onClick: openEditOrderDialog,
                            },
                            !isProduzione && {
                              label: "Conferma d'ordine", icona: <span style={{ fontSize: 15 }}>📄</span>,
                              onClick: () => generaConfermaOrdine(selectedOrder),
                            },
                            String(selectedOrder.status || "").trim().toLowerCase() !== "preparato" && {
                              label: "Metti in fermo", icona: <AlertTriangle size={16} />,
                              separatoreSopra: true,
                              onClick: markOrderStopped,
                            },
                            {
                              label: "Elimina ordine", icona: <Trash2 size={16} />,
                              pericolo: true, separatoreSopra: true,
                              onClick: () => deleteOrder(selectedOrder.id),
                            },
                          ]}
                        />
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "grid", gap: 10, minWidth: 0 }}>
                    {selectedOrderLines.map((line) => {
                      const product = productMap[String(line.productId)];
                      const lineAssignments = assignments[line.lineId] || [];
                      const availableLots = getAvailableLotsForLine(line);
                      // Riga in omaggio: cambia cosa si offre e cosa si segnala.
                      const omaggio = rigaBollata(line);
                      const lottoChiesto = omaggio ? lottoChiestoDallAgente(line) : "";
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
                                        // Sulla riga in omaggio si scrive quanti giorni ha
                                        // il lotto e quale ha chiesto l'agente: sono i due
                                        // numeri su cui si sbaglia.
                                        const bol = bollinoScadenza(lot.expiry, Date.now());
                                        const suffisso = omaggio
                                          ? (String(lot.lot || "").toUpperCase() === lottoChiesto.toUpperCase()
                                              ? " ← scelto dall'agente"
                                              : bol && bol.tipo === "bollato"
                                              ? ` · bollato ${bol.giorni} gg`
                                              : " · NON bollato")
                                          : "";
                                        return (
                                          <option key={lot.id} value={String(lot.id)}>
                                            {lot.lot} · scad. {fmtDate(lot.expiry)} · disp. {disp}
                                            {disp === 0 && giac > 0 ? ` (giac. ${giac})` : ""}
                                            {suffisso}
                                          </option>
                                        );
                                      })}
                                    </select>

                                    {/* L'avviso sul cartone regalato. Non blocca:
                                        a volte il bollato e' finito davvero e
                                        l'ordine deve partire comunque. Ma deve
                                        vedersi, perche' e' merce che si regala. */}
                                    {omaggio && form.lotId ? (() => {
                                      const scelto = availableLots.find((l) => String(l.id) === String(form.lotId));
                                      if (!scelto) return null;
                                      const b = bollinoScadenza(scelto.expiry, Date.now());
                                      if (b && b.tipo === "bollato") return null;
                                      return (
                                        <div style={{ fontSize: 11.5, fontWeight: 700, color: "#b91c1c", lineHeight: 1.35 }}>
                                          ⚠️ Questo lotto non e' bollato{b ? ` (${b.giorni} gg)` : ""}: stai
                                          regalando merce buona e i bollati restano in magazzino a scadere.
                                          {lottoChiesto ? ` L'agente aveva scelto il lotto ${lottoChiesto}.` : ""}
                                        </div>
                                      );
                                    })() : null}
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
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                        {/* Non tutto e' assegnato. Invece di aspettare la merce
                            che manca, si fa partire quello che c'e': il resto
                            diventa un ordine nuovo che resta fra i Da preparare.
                            Compare solo se qualcosa E' stato assegnato: senza,
                            "evadi il parziale" vorrebbe dire spostare tutto e
                            lasciare qui il vuoto. (Luca 04/08/2026) */}
                        {selectedOrder.lines?.some((l) => Number(l.assignedQty || 0) > 0) ? (
                          <button
                            style={btnStyle("primary")}
                            onClick={() => evadiParziale(selectedOrder)}
                            title="Fa partire solo la merce coi lotti assegnati. Il resto diventa un ordine nuovo."
                          >
                            <CheckCircle2 size={18} /> Evadi solo il parziale
                          </button>
                        ) : null}
                        <button style={btnStyle("outline", true)} disabled>
                          <Clock size={18} /> Completa i lotti
                        </button>
                      </div>
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
                            <BadgeAgente nome={agenteDi(order)} onApri={() => openCompletaAnagrafica(order)} />
                            {order.daBollinare ? (
                              <span style={badgeStyle("warning")} title={"Da bollinare: " + order.righeDaBollinare.map((l) => l.productName).join(" · ")}>
                                🏷️ DA BOLLINARE
                              </span>
                            ) : null}
                            <BadgeCorriere order={order} onApri={() => setTransportModalOrderId(order.id)} />
                            {bollinoDestinazione(order)}
                            {bollinoPagamento(order)}
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

                          <SpuntaPrezziDDT
                            attivo={(clientiOverride[clientKeyFor(order)] || {}).ddt_con_prezzi}
                            onCambia={(v) => setDdtConPrezzi(order, v)}
                            compatto
                          />
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
                        {/* Il corriere dev'essere SEMPRE chiaro (Luca 04/08/2026).
                            Prima, quando mancava, il bollino scriveva "spedito":
                            che non e' un corriere, ma sembra un corriere, e uno
                            ci passa sopra senza accorgersene. Ora si legge anche
                            il corriere della spedizione, e se davvero non c'e'
                            lo si dice in rosso. */}
                        <BadgeCorriere order={order} onApri={() => setTransportModalOrderId(order.id)} />
                        {bollinoDestinazione(order)}
                        {bollinoPagamento(order)}
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
                      {/* Da Spedito si torna indietro: il punto di non ritorno
                          e' l'archiviazione. */}
                      <button
                        style={btnStyle("outline")}
                        onClick={() => reopenShippedOrder(order)}
                        title="Riporta l'ordine tra i preparati per modificarlo"
                      >
                        <RotateCcw size={16} /> Riporta in preparati
                      </button>
                      <SpuntaPrezziDDT
                        attivo={(clientiOverride[clientKeyFor(order)] || {}).ddt_con_prezzi}
                        onCambia={(v) => setDdtConPrezzi(order, v)}
                      />
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

        {page === "ddt" && (
          <div style={{ ...cardStyle(), padding: isSmallLayout ? 16 : 20 }}>
            <div style={{
              display: "flex", justifyContent: "space-between", gap: 12,
              alignItems: "center", flexWrap: "wrap", marginBottom: 18,
            }}>
              <div>
                <div style={{ fontSize: 22, fontWeight: 900, color: "#07153a" }}>
                  Registro documenti di trasporto
                </div>
                <div style={{ marginTop: 4, color: "#66758b", fontSize: 14 }}>
                  Tutti i DDT emessi, dal più recente. {loadingArchive ? "Carico…" : ""}
                </div>
              </div>
              <button style={btnStyle("outline", loadingArchive)} disabled={loadingArchive} onClick={loadArchivedOrders}>
                <RefreshCw size={18} /> {loadingArchive ? "Carico…" : "Aggiorna"}
              </button>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
              <div style={{
                border: "1px solid #e5edf6", borderRadius: 12, padding: "10px 16px",
                background: "#f8fafc", minWidth: 130,
              }}>
                <div style={{ fontSize: 11, color: "#66758b", textTransform: "uppercase", letterSpacing: ".05em" }}>
                  Documenti emessi
                </div>
                <div style={{ fontSize: 22, fontWeight: 900, color: "#07153a" }}>{registroDDT.totale}</div>
              </div>
              <div style={{
                border: "1px solid #e5edf6", borderRadius: 12, padding: "10px 16px",
                background: "#f8fafc", minWidth: 170,
              }}>
                <div style={{ fontSize: 11, color: "#66758b", textTransform: "uppercase", letterSpacing: ".05em" }}>
                  Numerazione
                </div>
                <div style={{ fontSize: 22, fontWeight: 900, color: "#07153a" }}>
                  {registroDDT.primo ?? "—"} → {registroDDT.ultimo ?? "—"}
                </div>
              </div>
              <div style={{
                border: "1px solid " + (registroDDT.buchi.length ? "#fecaca" : "#bbf7d0"),
                background: registroDDT.buchi.length ? "#fef2f2" : "#f0fdf4",
                borderRadius: 12, padding: "10px 16px", minWidth: 190, flex: 1,
              }}>
                <div style={{ fontSize: 11, color: "#66758b", textTransform: "uppercase", letterSpacing: ".05em" }}>
                  Buchi nella serie
                </div>
                <div style={{
                  fontSize: registroDDT.buchi.length ? 15 : 22, fontWeight: 900,
                  color: registroDDT.buchi.length ? "#991b1b" : "#15803d", lineHeight: 1.3,
                }}>
                  {registroDDT.buchi.length
                    ? registroDDT.buchi.slice(0, 12).map((n) => {
                        // Un buco spiegato e' un fatto; un buco muto e' un
                        // problema. Se il numero e' stato annullato lo si dice.
                        const a = ddtAnnullati.find((x) => String(x.ddt_numero) === String(n));
                        return a ? `${n} (${a.cliente || a.motivo || "annullato"})` : `${n} (?)`;
                      }).join(" · ") +
                      (registroDDT.buchi.length > 12 ? ` … e altri ${registroDDT.buchi.length - 12}` : "")
                    : "Nessuno"}
                </div>
              </div>
            </div>

            <div style={{ position: "relative", marginBottom: 18 }}>
              <Search size={16} style={{ position: "absolute", left: 14, top: 18, color: "#97a3b6" }} />
              <input
                style={{ ...inputStyle(), paddingLeft: 40 }}
                value={ddtSearch}
                onChange={(e) => setDdtSearch(e.target.value)}
                placeholder="Cerca per numero DDT, cliente, codice cliente o ID ordine"
              />
            </div>

            {registroDDT.lista.length === 0 ? (
              <div style={{ color: "#66758b" }}>
                {loadingArchive ? "Carico i documenti…" : "Nessun DDT trovato."}
              </div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {registroDDT.lista.map((order) => (
                  <div
                    key={order.id}
                    style={{
                      border: "1px solid #e5edf6", borderRadius: 14, padding: 14,
                      background: "#fff", display: "grid",
                      gridTemplateColumns: isSmallLayout ? "1fr" : "110px 1fr auto",
                      gap: 14, alignItems: "center",
                    }}
                  >
                    <div style={{
                      fontSize: 24, fontWeight: 950, color: "#07153a",
                      fontFamily: "ui-monospace, monospace", letterSpacing: "-.02em",
                    }}>
                      {order.ddtNumero}
                    </div>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: "#07153a" }}>
                        {order.customer || "Senza nome"}
                      </div>
                      <div style={{ marginTop: 3, color: "#66758b", fontSize: 12 }}>
                        {fmtDate(order.dataPrepared || order.date)} · {order.id}
                        {order.clientId ? ` · ${order.clientId}` : ""}
                      </div>
                      <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <span style={badgeStyle("outline")}>{order.colli} colli</span>
                        <span style={badgeStyle("outline")}>{fmtKg(order.pesoTotale)} kg</span>
                        {order.courier || order.courierSpedizione ? (
                          <span style={badgeStyle("outline")}>
                            {(order.courier || order.courierSpedizione).toUpperCase()}
                          </span>
                        ) : null}
                        {order.archived ? <span style={badgeStyle("success")}>archiviato</span> : (
                          <span style={badgeStyle("warning")}>{order.status}</span>
                        )}
                      </div>
                    </div>
                    <div style={{ display: "grid", gap: 6, justifyItems: "stretch" }}>
                      <button
                        style={{ ...btnStyle("outline"), whiteSpace: "nowrap" }}
                        onClick={() => generaDDT(order)}
                      >
                        📄 Vedi DDT
                      </button>
                      <SpuntaPrezziDDT
                        attivo={(clientiOverride[clientKeyFor(order)] || {}).ddt_con_prezzi}
                        onCambia={(v) => setDdtConPrezzi(order, v)}
                        compatto
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
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

            {archivioIncompleti.bloccanti + archivioIncompleti.daCompletare > 0 ? (
              <div style={{
                border: "1px solid " + (archivioIncompleti.bloccanti ? "#fecaca" : "#fde68a"),
                background: archivioIncompleti.bloccanti ? "#fef2f2" : "#fffbeb",
                borderRadius: 14, padding: 14, marginBottom: 16,
                display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap",
              }}>
                <div style={{ flex: 1, minWidth: 260, fontSize: 13.5, lineHeight: 1.5, color: "#7c2d12" }}>
                  <b style={{ fontSize: 15 }}>
                    {archivioIncompleti.bloccanti + archivioIncompleti.daCompletare} ordini su{" "}
                    {archivioIncompleti.totale} hanno dati mancanti
                  </b>
                  <div style={{ fontSize: 12, opacity: 0.75 }}>
                    Conto solo dal 02/08: prima i documenti li faceva TeamSystem.
                  </div>
                  <div style={{ marginTop: 2 }}>
                    {archivioIncompleti.bloccanti > 0 ? (
                      <>
                        <b>{archivioIncompleti.bloccanti}</b> non hanno abbastanza dati per il documento
                        di trasporto (manca a chi intestarlo o dove mandarlo)
                        {archivioIncompleti.daCompletare > 0 ? ", " : ". "}
                      </>
                    ) : null}
                    {archivioIncompleti.daCompletare > 0 ? (
                      <>
                        <b>{archivioIncompleti.daCompletare}</b> escono ma incompleti (prezzi a zero,
                        DDT mai generato, colli non confermati).
                      </>
                    ) : null}
                  </div>
                </div>
                <button
                  style={btnStyle(soloIncompleti ? "primary" : "outline")}
                  onClick={() => setSoloIncompleti((v) => !v)}
                >
                  {soloIncompleti ? "Mostra tutti" : "Mostra solo questi"}
                </button>
              </div>
            ) : null}

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

            {/* DOVE E' FINITO UN LOTTO. Si scrive un articolo (o direttamente
                il lotto), si sceglie fra i lotti usciti e si vede a quali
                clienti sono andati, con le quantita'. Se un lotto va
                richiamato, questa e' la lista delle telefonate da fare.
                Solo dal 03/08: prima i documenti li faceva TeamSystem e la
                catena riga-lotto-cliente non passava di qui. */}
            <div style={{
              border: "1px solid #e5edf6", borderRadius: 16, padding: 14, marginBottom: 18,
              background: "#fbfdff",
            }}>
              <div style={{ fontSize: 15, fontWeight: 900, color: "#07153a", marginBottom: 2 }}>
                🔎 Dove è finito un lotto
              </div>
              <div style={{ fontSize: 12, color: "#66758b", marginBottom: 10 }}>
                Scrivi un articolo o un numero di lotto. Vale per quanto è uscito dal 03/08.
              </div>
              <div style={{ position: "relative" }}>
                <Search size={16} style={{ position: "absolute", left: 14, top: 18, color: "#97a3b6" }} />
                <input
                  style={{ ...inputStyle(), paddingLeft: 40 }}
                  value={lottoQuery}
                  onChange={(e) => { setLottoQuery(e.target.value); cercaLotti(e.target.value); }}
                  placeholder="Es. NFARMA 010, oppure 178/26"
                />
              </div>

              {lottoCercando ? (
                <div style={{ marginTop: 10, color: "#66758b", fontSize: 13 }}>Cerco…</div>
              ) : lottoQuery.trim().length >= 2 && lottoRighe.length === 0 ? (
                <div style={{ marginTop: 10, color: "#66758b", fontSize: 13 }}>
                  Nessun lotto uscito con questo testo, dal 03/08 in poi.
                </div>
              ) : lottoRighe.length ? (() => {
                // Prima i LOTTI trovati, poi chi li ha ricevuti. Due passaggi,
                // come li cerca una persona: "che lotti sono usciti?" e poi
                // "questo dov'e' andato?".
                const perLotto = {};
                for (const r of lottoRighe) {
                  const k = String(r.lotto);
                  perLotto[k] = perLotto[k] || { lotto: k, scadenza: r.scadenza, prodotti: new Set(), righe: [], qta: 0 };
                  perLotto[k].prodotti.add(r.codice_prodotto || r.prodotto || "");
                  perLotto[k].righe.push(r);
                  perLotto[k].qta += Number(r.quantita || 0);
                }
                const lotti = Object.values(perLotto).sort((a, b) => String(a.lotto).localeCompare(String(b.lotto)));
                const scelto = perLotto[lottoScelto];
                return (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {lotti.map((l) => (
                        <button
                          key={l.lotto}
                          style={{
                            ...compactBtnStyle(lottoScelto === l.lotto ? "dark" : "outline"),
                            flexDirection: "column", alignItems: "flex-start", height: "auto",
                            padding: "8px 12px", gap: 1,
                          }}
                          onClick={() => setLottoScelto(lottoScelto === l.lotto ? "" : l.lotto)}
                        >
                          <span style={{ fontFamily: "ui-monospace, monospace", fontWeight: 900, fontSize: 14 }}>
                            {l.lotto}
                          </span>
                          <span style={{ fontSize: 11, opacity: 0.8, fontWeight: 600 }}>
                            {[...l.prodotti].filter(Boolean).join(", ")}
                            {l.scadenza ? ` · scad. ${fmtDate(l.scadenza)}` : ""}
                            {` · ${l.righe.length} client${l.righe.length === 1 ? "e" : "i"}`}
                          </span>
                        </button>
                      ))}
                    </div>

                    {scelto ? (
                      <div style={{ marginTop: 12, border: "1px solid #e5edf6", borderRadius: 12, overflow: "hidden" }}>
                        <div style={{
                          padding: "8px 12px", background: "#07153a", color: "#fff",
                          fontSize: 13, fontWeight: 800,
                        }}>
                          Lotto {scelto.lotto} · {scelto.righe.length} consegne · {fmtKg(scelto.qta)} pezzi in tutto
                        </div>
                        {scelto.righe
                          .slice()
                          .sort((a, b) => Number(b.quantita || 0) - Number(a.quantita || 0))
                          .map((r, i) => (
                          <div key={r.id_ordine + i} style={{
                            display: "grid",
                            gridTemplateColumns: isSmallLayout ? "1fr" : "1fr auto auto auto",
                            gap: 10, padding: "9px 12px", alignItems: "center",
                            borderTop: i ? "1px solid #eef2f7" : "none", fontSize: 13,
                          }}>
                            <div style={{ fontWeight: 800, color: "#07153a" }}>{r.cliente}</div>
                            <div style={{ color: "#66758b" }}>{fmtDate(r.data_uscita)}</div>
                            <div>
                              {r.ddt
                                ? <span style={badgeStyle("outline")}>DDT {r.ddt}</span>
                                : <span style={badgeStyle("warning")}>senza DDT</span>}
                            </div>
                            <div style={{ fontWeight: 900, textAlign: "right", minWidth: 60 }}>
                              {fmtKg(r.quantita)} pz
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ marginTop: 10, color: "#66758b", fontSize: 12.5 }}>
                        Scegli un lotto per vedere a quali clienti è andato.
                      </div>
                    )}
                  </div>
                );
              })() : null}
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
                              {order.ddtNumero ? (
                                <span style={badgeStyle("outline")}>{order.ddtNumero}</span>
                              ) : (
                                <span style={badgeStyle("warning")}>DDT mai generato</span>
                              )}
                              {/* Anche qui il corriere: in archivio non c'era
                                  affatto, e su un documento gia' emesso e'
                                  proprio il dato che si va a ricontrollare. */}
                              <BadgeCorriere order={order} onApri={() => setTransportModalOrderId(order.id)} compatto />
                              {bollinoDestinazione(order, true)}
                              {/* In archivio il pagamento SI CAMBIA, a differenza
                                  della destinazione: il DDT e' emesso e la merce
                                  e' arrivata, ma i soldi non sono ancora entrati e
                                  la scadenza sbagliata li fa perdere di vista. */}
                              {bollinoPagamento(order, true)}
                            </div>

                            {/* Cosa manca per fare il documento. In archivio si
                                vede a cose fatte: e' li' che ci si accorge di un
                                ordine partito senza i dati (03/08/2026). */}
                            {(() => {
                              // Solo dagli ordini nostri: sui documenti fatti da
                              // TeamSystem fino al 31/07 non abbiamo nulla da dire.
                              const suoNostro =
                                String(order.dataPrepared || order.date || "").slice(0, 10) >=
                                DAL_QUANDO_SIAMO_NOI;
                              if (!suoNostro) return null;
                              const m = campiMancantiDDT(order);
                              if (m.totale === 0) {
                                return (
                                  <div style={{ marginTop: 8, fontSize: 12, color: "#15803d", fontWeight: 700 }}>
                                    ✓ Dati completi per DDT e fattura
                                  </div>
                                );
                              }
                              // Ogni voce mancante e' un PULSANTE che apre il
                              // posto giusto per sistemarla, senza disarchiviare
                              // niente (Luca 04/08/2026). Disarchiviare non si
                              // puo' piu' e non serve: i dati di un ordine
                              // archiviato restano modificabili fino all'invio
                              // a Sibill, e' proprio quella la finestra.
                              const apri = (voce) => {
                                const v = voce.toLowerCase();
                                if (v.includes("prezzo") || v.includes("iva")) {
                                  setCorreggiOrderId(String(order.id));
                                  return;
                                }
                                if (v.includes("corriere")) { setTransportModalOrderId(order.id); return; }
                                if (v.includes("colli")) { setCorreggiOrderId(String(order.id)); return; }
                                if (v.includes("ddt")) { generaDDT(order); return; }
                                // tutto il resto (agente, P.IVA, indirizzo, CAP,
                                // citta', provincia, SdI, pagamento) sta
                                // nell'anagrafica del cliente
                                openCompletaAnagrafica(order);
                              };
                              const Voce = ({ testo, grave }) => (
                                <button
                                  onClick={() => apri(testo)}
                                  title="Clicca per sistemarlo"
                                  style={{
                                    border: "1px solid " + (grave ? "#fca5a5" : "#fcd34d"),
                                    background: "#fff", color: grave ? "#991b1b" : "#92400e",
                                    borderRadius: 999, padding: "3px 10px", fontSize: 12,
                                    fontWeight: 700, cursor: "pointer", marginRight: 6, marginTop: 4,
                                  }}
                                >
                                  {testo} <span style={{ opacity: 0.6 }}>✎</span>
                                </button>
                              );
                              return (
                                <div style={{
                                  marginTop: 10, borderRadius: 10, padding: "8px 12px", fontSize: 12.5,
                                  border: "1px solid " + (m.bloccanti.length ? "#fecaca" : "#fde68a"),
                                  background: m.bloccanti.length ? "#fef2f2" : "#fffbeb",
                                  color: m.bloccanti.length ? "#991b1b" : "#92400e",
                                  lineHeight: 1.5,
                                }}>
                                  {m.bloccanti.length ? (
                                    <div>
                                      <b>Manca per il DDT:</b>{" "}
                                      {m.bloccanti.map((x) => <Voce key={x} testo={x} grave />)}
                                    </div>
                                  ) : null}
                                  {m.daCompletare.length ? (
                                    <div style={{ marginTop: m.bloccanti.length ? 4 : 0 }}>
                                      <b>Da completare:</b>{" "}
                                      {m.daCompletare.map((x) => <Voce key={x} testo={x} />)}
                                    </div>
                                  ) : null}
                                  <div style={{ marginTop: 6, fontSize: 11, opacity: 0.75 }}>
                                    Clicca la voce per sistemarla: non serve disarchiviare.
                                  </div>
                                </div>
                              );
                            })()}

                            {/* Prezzi, sconti, IVA e colli si correggono QUI,
                                sull'ordine archiviato. Fino a quando il DDT non
                                parte verso Sibill (mezzanotte del giorno dopo)
                                i dati sono ancora nostri. */}
                            {correggiOrderId === String(order.id) ? (
                              <div style={{
                                marginTop: 10, border: "1px solid #dbe2ea", borderRadius: 12,
                                padding: 12, background: "#fff",
                              }}>
                                <div style={{
                                  display: "flex", alignItems: "center", gap: 10,
                                  marginBottom: 10, flexWrap: "wrap",
                                }}>
                                  <b style={{ fontSize: 13, color: "#07153a" }}>Correggi senza disarchiviare</b>
                                  <button
                                    style={{ ...compactBtnStyle("outline"), marginLeft: "auto" }}
                                    onClick={() => setCorreggiOrderId("")}
                                  >
                                    Chiudi
                                  </button>
                                </div>

                                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
                                  <span style={{ fontSize: 12, fontWeight: 700, color: "#40516a" }}>Colli</span>
                                  <input
                                    style={{ ...inputStyle(), width: 90, height: 38 }}
                                    type="number"
                                    min="0"
                                    value={
                                      colliDrafts[order.id] !== undefined
                                        ? colliDrafts[order.id]
                                        : String(order.colli ?? "")
                                    }
                                    onChange={(e) =>
                                      setColliDrafts((prev) => ({ ...prev, [order.id]: e.target.value }))
                                    }
                                  />
                                  <button
                                    style={compactBtnStyle("primary", savingColliOrderId === String(order.id))}
                                    disabled={savingColliOrderId === String(order.id)}
                                    onClick={() =>
                                      saveOrderColli(
                                        order.id,
                                        colliDrafts[order.id] !== undefined
                                          ? colliDrafts[order.id]
                                          : String(order.colli ?? "")
                                      )
                                    }
                                  >
                                    Salva colli
                                  </button>
                                  <button
                                    style={compactBtnStyle("outline")}
                                    onClick={() => setTransportModalOrderId(order.id)}
                                    title="Corriere e peso della spedizione"
                                  >
                                    <Truck size={15} /> Corriere e peso
                                  </button>
                                  <button
                                    style={compactBtnStyle("outline")}
                                    onClick={() => openCompletaAnagrafica(order)}
                                    title="Anagrafica del cliente, agente compreso"
                                  >
                                    <Pencil size={15} /> Anagrafica e agente
                                  </button>
                                </div>

                                <ValorizzazioneOrdine
                                  order={order}
                                  onSalvato={loadDataFromSheets}
                                  listini={listiniPrezzi}
                                />
                              </div>
                            ) : null}
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
                            <div style={{ display: "grid", gap: 8, justifyItems: "stretch" }}>
                              <button
                                style={btnStyle("outline")}
                                title={order.ddtNumero ? `Ristampa ${order.ddtNumero}` : "Genera il Documento di Trasporto"}
                                onClick={() => generaDDT(order)}
                              >
                                📄 {order.ddtNumero ? "Vedi DDT" : "Genera DDT"}
                              </button>
                              <SpuntaPrezziDDT
                                attivo={(clientiOverride[clientKeyFor(order)] || {}).ddt_con_prezzi}
                                onCambia={(v) => setDdtConPrezzi(order, v)}
                                compatto
                              />
                              {/* Niente Disarchivia. Un ordine archiviato ha il DDT
                                  emesso: e' un documento fiscale, non si annulla
                                  facendolo sparire (regola di Luca 03/08/2026, deroga
                                  voluta al "tutto reversibile"). Il database lo rifiuta
                                  comunque, il pulsante avrebbe solo mentito.
                                  Correggere si puo': i dati restano modificabili fino a
                                  quando il DDT parte verso Sibill. */}
                              <button
                                style={btnStyle(correggiOrderId === String(order.id) ? "primary" : "outline")}
                                onClick={() =>
                                  setCorreggiOrderId(correggiOrderId === String(order.id) ? "" : String(order.id))
                                }
                                title="Correggi prezzi, colli, corriere e anagrafica senza disarchiviare"
                              >
                                <Pencil size={16} /> Correggi
                              </button>
                              <div style={{
                                fontSize: 11.5, color: "#8a94a6", textAlign: "center",
                                lineHeight: 1.35, maxWidth: 190,
                              }}>
                                Non si disarchivia, ma i dati si correggono
                              </div>
                            </div>
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

        {page === "clienti" && (
          <div style={{ ...cardStyle(), padding: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 22, fontWeight: 800 }}>🗂️ Clienti</div>
                <div style={{ marginTop: 4, color: "#617086", fontSize: 14 }}>
                  Tutti i clienti, con il loro codice. Da qui si crea un cliente nuovo e si
                  corregge quello che c'è, sedi di consegna comprese, senza passare da un ordine.
                </div>
              </div>
              <div style={{ marginLeft: "auto" }}>
                <button style={btnStyle("primary")} onClick={() => setClienteAperto({ nuovo: true })}>
                  + Nuovo cliente
                </button>
              </div>
            </div>

            {(() => {
              // La scheda aperta: nuova, oppure quella di un cliente. Dopo la
              // creazione si resta dentro, cosi' la sede si aggiunge subito.
              const ap = clienteAperto;
              if (!ap) return null;
              const cli = ap.nuovo
                ? null
                : (ap.idAppena
                    ? clients.find((c) => String(c.id) === String(ap.idAppena)) || null
                    : ap.cliente);
              const chiave = ap.chiave || (cli ? chiaveAnagrafica(cli) : "");
              return (
                <div style={{ marginTop: 16, paddingTop: 16, borderTop: "2px solid #e6ebf2" }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#07153a", marginBottom: 10 }}>
                    {cli ? `Scheda di ${cli.name}` : "Crea nuovo cliente"}
                  </div>
                  <SchedaCliente
                    cliente={cli}
                    override={clientiOverride[chiave] || null}
                    sedi={cli ? (destinazioni[String(cli.id)] || []) : []}
                    agenti={agenti}
                    listini={listiniPrezzi}
                    onCrea={creaClienteScheda}
                    onSalva={salvaClienteScheda}
                    onSalvaSede={salvaDestinazione}
                    onDisattivaSede={disattivaDestinazione}
                    onChiudi={() => setClienteAperto(null)}
                  />
                </div>
              );
            })()}

            <div style={{ marginTop: 16 }}>
              <input
                style={{ ...inputStyle(), height: 42 }}
                placeholder="Cerca per nome, codice, P.IVA o città"
                value={clientiCerca}
                onChange={(e) => setClientiCerca(e.target.value)}
              />
            </div>

            {(() => {
              const q = clientiCerca.trim().toLowerCase();
              const filtrati = activeClients.filter((c) => {
                if (!q) return true;
                return [c.name, c.id, c.piva, c.citta, c.codeTs]
                  .some((v) => String(v || "").toLowerCase().includes(q));
              });
              // Senza ricerca si mostrano i primi cento: sono 2.194 e disegnarli
              // tutti rende la pagina inservibile sul tablet del magazzino.
              const mostrati = q ? filtrati.slice(0, 300) : filtrati.slice(0, 100);
              return (
                <>
                  <div style={{ margin: "10px 0", fontSize: 12.5, color: "#66758b" }}>
                    {filtrati.length} clienti
                    {mostrati.length < filtrati.length
                      ? ` · ne vedi ${mostrati.length}, scrivi nella ricerca per restringere`
                      : ""}
                  </div>
                  <div style={{ display: "grid", gap: 8 }}>
                    {mostrati.map((c) => {
                      const ov = clientiOverride[chiaveAnagrafica(c)] || {};
                      const manca = [];
                      if (!String(ov.partita_iva || c.piva || "").trim()) manca.push("P.IVA");
                      if (!String(ov.sede_via || ov.sede_legale || "").trim()) manca.push("indirizzo");
                      if (!String(ov.agente_nome || "").trim()) manca.push("agente");
                      if (!metodoLeggibile(ov.metodo_pagamento)) manca.push("pagamento");
                      const quanteSedi = (destinazioni[String(c.id)] || []).length;
                      return (
                        <div key={c.id} style={{
                          border: "1px solid #e6ebf2", borderRadius: 12, padding: "10px 12px",
                          display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
                          background: manca.length ? "#fffbeb" : "#fff",
                        }}>
                          <div style={{ minWidth: 0, flex: "1 1 260px" }}>
                            <div style={{ fontSize: 14, fontWeight: 800, color: "#07153a" }}>{c.name}</div>
                            <div style={{ fontSize: 11.5, color: "#8a94a6" }}>
                              {c.id}
                              {c.piva ? ` · P.IVA ${c.piva}` : ""}
                              {c.citta ? ` · ${c.citta}` : ""}
                              {quanteSedi ? ` · ${quanteSedi} ${quanteSedi === 1 ? "sede" : "sedi"}` : ""}
                            </div>
                          </div>
                          {manca.length ? (
                            <span style={badgeStyle("warning")} title={"Mancano: " + manca.join(", ")}>
                              manca {manca.join(", ")}
                            </span>
                          ) : (
                            <span style={badgeStyle("success")}>completo</span>
                          )}
                          <button
                            style={{ ...btnStyle("outline"), padding: "6px 12px" }}
                            onClick={() => setClienteAperto({ cliente: c })}
                          >
                            ✎ Modifica
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </>
              );
            })()}
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

              {/* Un campo solo con la ricerca: con 2.195 clienti la tendina
                  nativa costringeva a scorrere a mano. Si scrive un pezzo del
                  nome, della citta' o del codice e i risultati escono sotto. */}
              <RicercaSelect
                voci={clientiPerRicerca}
                value={newOrderClientId}
                placeholder={`Scrivi nome, citta' o codice · ${clientiPerRicerca.length} clienti`}
                vuotoLabel="Nessun cliente con questo testo. Se e' nuovo, usa + Nuovo cliente."
                icona={<Users size={16} />}
                onChange={(id) => {
                  setNewOrderClientId(id);
                  const c = clientsById[id];
                  if (c) {
                    setNewOrderCustomer(c.name);
                    if (c.category) setNewOrderCategory(c.category);
                    setNewOrderCap(String(c.cap || ""));
                  } else {
                    setNewOrderCustomer("");
                    setNewOrderCap("");
                  }
                }}
              />

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
              <label style={labelStyle()}>
                Agente (se l'ordine arriva da un agente ma lo carichiamo noi)
              </label>
              <RicercaSelect
                voci={agentiPerRicerca}
                value={newOrderAgenteId}
                placeholder={`Scrivi il nome o il canale · ${agenti.length} agenti`}
                vuotoLabel="Nessun agente con questo testo."
                icona={<Users size={16} />}
                colore="#7c3aed"
                onChange={(id) => setNewOrderAgenteId(id)}
              />
              <div style={{ marginTop: 4, fontSize: 12, color: "#6b7280" }}>
                Serve quando la app agenti non funziona e l'ordine ce lo mandano
                in azienda: la provvigione e il rapporto col cliente restano suoi.
              </div>
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
              {nuovoCodiceCliente ? (
                <div style={{
                  border: "1px solid #86efac", background: "#f0fdf4", borderRadius: 10,
                  padding: "10px 12px", display: "flex", alignItems: "center", gap: 10,
                }}>
                  <div style={{ flex: 1, fontSize: 13, color: "#14532d" }}>
                    <b>{nuovoCodiceCliente.nome}</b> salvato.{" "}
                    {nuovoCodiceCliente.nuovo ? "Codice assegnato" : "Codice gia' a registro"}:{" "}
                    <span style={{
                      fontFamily: "ui-monospace, monospace", fontWeight: 800, fontSize: 15,
                      background: "#dcfce7", padding: "2px 8px", borderRadius: 6,
                    }}>{nuovoCodiceCliente.codice}</span>
                  </div>
                  <button
                    style={{ ...btnStyle("outline"), height: 30, padding: "0 12px", fontSize: 12, borderRadius: 8 }}
                    onClick={() => setNuovoCodiceCliente(null)}
                  >Chiudi</button>
                </div>
              ) : null}
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
            const opzioni = t && !t.errore ? [t.consigliato, ...t.alternative] : [];
            return (
              <div style={{ display: "grid", gap: 12 }}>
                <div style={{ color: "#40516a", fontSize: 14 }}>
                  {ord.customer} · {temperaturaLabel(ord.temperatura)}
                  {ord.capDest ? ` · CAP ${ord.capDest}` : ""}
                </div>

                {/* Peso: il calcolo somma solo i prodotti a catalogo, quindi
                    deve restare sempre correggibile a mano (Luca 03/08/2026). */}
                <PesoOrdine ord={ord} onSalva={setOrderPeso} />

                {t?.errore ? (
                  <div style={{ ...cardStyle({ background: "#fff7ed" }), padding: 14, color: "#b45309", fontSize: 13.5 }}>
                    Non riesco a calcolare il preventivo: {t.errore}.
                    {t.errore === "CAP destinazione mancante"
                      ? " Il cliente non ha un CAP in anagrafica."
                      : " Correggi il peso qui sopra e il preventivo si ricalcola."}
                    <div style={{ marginTop: 6 }}>
                      Puoi comunque scrivere il corriere a mano qui sotto.
                    </div>
                  </div>
                ) : null}

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

                {/* Il motore conosce solo i corrieri a contratto. Capita di
                    spedire con un altro (corriere locale, ritiro del cliente,
                    mezzo nostro): dev'essere sempre possibile scriverlo. */}
                <AltroCorriere ord={ord} onSalva={setOrderCourier} />
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

                {/* LE SEDI DI CONSEGNA. Qui e non fra i campi liberi, perche'
                    sono piu' di una: una ragione sociale puo' avere tre o
                    quattro negozi, e ognuno ha i suoi orari. */}
                {(() => {
                  const ord = orders.find((o) => String(o.id) === String(anagOrderId));
                  const cod = String(ord?.clientId || "");
                  return (
                    <div style={{
                      border: "1px solid #dbe2ea", borderRadius: 12, padding: 12,
                      marginBottom: 12, background: "#fff",
                    }}>
                      <div style={{ fontSize: 12, fontWeight: 800, color: "#40516a", marginBottom: 8 }}>
                        📍 Sedi di consegna
                        <span style={{ fontWeight: 600, color: "#8a94a6" }}>
                          {" "}— dove va la merce. La predefinita si propone sui nuovi ordini, ma
                          ogni ordine puo' andare in un negozio diverso: si sceglie dal bollino
                          📍 sull'ordine.
                        </span>
                      </div>
                      <SediConsegna
                        codiceCliente={cod}
                        sedi={destinazioni[cod] || []}
                        onSalva={salvaDestinazione}
                        onDisattiva={disattivaDestinazione}
                        apriNuovaSubito={anagNuovaSede}
                      />
                    </div>
                  );
                })()}

                {/* COME si valorizza questo cliente. Sta qui e non sull'ordine
                    perche' e' una condizione commerciale del cliente, non della
                    singola vendita (Luca 04/08/2026). */}
                <div style={{
                  border: "1px solid #dbe2ea", borderRadius: 12, padding: 12, marginBottom: 12,
                  background: "#f8fafc",
                }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: "#40516a", marginBottom: 8 }}>
                    Prezzi e sconti di questo cliente
                  </div>

                  {/* Una scelta sola invece di una spunta piu' una tendina:
                      erano due controlli per una domanda, e "listino, ma storico
                      dove il listino non arriva" non si riusciva nemmeno a dire
                      (Luca: "piuttosto che mille bottoni, fai piu' ordinato"). */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 13, color: "#40516a", fontWeight: 700, minWidth: 92 }}>
                      I prezzi da
                    </span>
                    <select
                      style={{ ...inputStyle(), width: 320, height: 40 }}
                      value={anagForm.fonte_prezzi || "listino"}
                      onChange={(e) => setAnagForm((prev) => ({ ...prev, fonte_prezzi: e.target.value }))}
                    >
                      <option value="listino">Listino, storico dove il listino non arriva</option>
                      <option value="solo-listino">Solo listino, mai lo storico</option>
                      <option value="storico">Storico, listino dove lo storico non arriva</option>
                    </select>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 13, color: "#40516a", fontWeight: 700, minWidth: 92 }}>
                      Listino
                    </span>
                    <select
                      style={{ ...inputStyle(), width: 320, height: 40 }}
                      value={anagForm.listino_standard ?? ""}
                      onChange={(e) => setAnagForm((prev) => ({ ...prev, listino_standard: e.target.value }))}
                    >
                      <option value="">— quello assegnato dal gestionale —</option>
                      <option value="1">Listino 1 · base (434 articoli)</option>
                      <option value="8">Listino 8 · Ho.Re.Ca. (56 articoli)</option>
                    </select>
                  </div>

                  {/* Tre sconti in cascata: il secondo sul prezzo gia' scontato
                      dal primo, il terzo su quello scontato dai primi due.
                      100 con 10+10+10 fa 72,90, non 70,00. */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 13, color: "#40516a", fontWeight: 700, minWidth: 92 }}>
                      Sconti %
                    </span>
                    {[
                      ["sconto1_pct", "Sc 1", "Primo sconto, sul prezzo di listino"],
                      ["sconto2_pct", "Sc 2", "Secondo sconto, sul prezzo gia' scontato dal primo"],
                      ["sconto3_pct", "Sc 3", "Terzo sconto, sul prezzo gia' scontato dai primi due"],
                    ].map(([k, etichetta, spiega]) => (
                      <input
                        key={k}
                        style={{ ...inputStyle(), width: 84, height: 40 }}
                        type="number"
                        step="0.1"
                        min="0"
                        max="100"
                        placeholder={etichetta}
                        title={spiega}
                        value={anagForm[k] ?? ""}
                        onChange={(e) => setAnagForm((prev) => ({ ...prev, [k]: e.target.value }))}
                      />
                    ))}
                    {(() => {
                      const sc = ["sconto1_pct", "sconto2_pct", "sconto3_pct"]
                        .map((k) => Number(String(anagForm[k] ?? "").replace(",", ".")) || 0);
                      const netto = 100 * (1 - sc[0] / 100) * (1 - sc[1] / 100) * (1 - sc[2] / 100);
                      if (!sc.some((x) => x > 0)) return null;
                      return (
                        <span style={{ fontSize: 12, color: "#15803d", fontWeight: 700 }}>
                          su 100 € paga {netto.toFixed(2)} €
                        </span>
                      );
                    })()}
                  </div>

                  <div style={{ marginTop: 8, fontSize: 11.5, color: "#66758b", lineHeight: 1.45 }}>
                    Gli sconti valgono sui prezzi di listino. Sui prezzi che
                    arrivano dallo storico resta lo sconto con cui il cliente ha
                    davvero comprato, che di quel prezzo e' l'altra meta'.
                    {" "}Lasciare vuoto non e' come scrivere zero: vuoto usa lo
                    sconto ricavato dalle fatture di questo cliente, zero vuol
                    dire prezzo pieno.
                    {" "}Il listino 8 copre 56 articoli: sugli altri si ripiega
                    sul listino 1.
                    {" "}Salvando, gli ordini di questo cliente ancora da
                    preparare si aggiornano da soli.
                  </div>
                </div>

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
                        })() : f.key === "agente_nome" ? (() => {
                          // Lista chiusa come il pagamento: a testo libero
                          // "Gastaldi", "A. Gastaldi" e "andrea gastaldi"
                          // diventano tre agenti diversi, e le provvigioni non
                          // tornano piu'.
                          const attuale = String(anagForm[f.key] ?? "");
                          const nomi = agenti.map((a) => a.Nome).filter(Boolean);
                          const fuoriLista = attuale && !nomi.includes(attuale);
                          return (
                            <select
                              style={{ ...inputStyle(), borderColor: missing ? "#fca5a5" : undefined }}
                              value={attuale}
                              onChange={(e) => {
                                const nome = e.target.value;
                                const a = agenti.find((x) => x.Nome === nome);
                                setAnagForm((prev) => ({
                                  ...prev, agente_nome: nome, agente_id: a ? a.Agente_Id : "",
                                }));
                              }}
                            >
                              <option value="">&mdash; Scegli l&rsquo;agente &mdash;</option>
                              {nomi.map((n) => (<option key={n} value={n}>{n}</option>))}
                              {fuoriLista ? (
                                <option value={attuale}>{attuale} (non in elenco)</option>
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
