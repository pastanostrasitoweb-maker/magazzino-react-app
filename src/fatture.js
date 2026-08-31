// LE FATTURE ELETTRONICHE, GENERATE DAL MAGAZZINO.
//
// Fino al 24/08/2026 le facevo io a mano con due script python: Luca ha
// chiesto "dove vado per generare la fattura senza chiedere a te?", e la
// risposta giusta e' un bottone dentro l'app. Questo file e' il motore: legge i
// DDT archiviati, decide quali sono fatturabili e con che motivo gli altri no,
// e scrive gli XML in formato FPR12 da trascinare in Sibill.
//
// Il modello e' la fattura 1583 gia' emessa: stesso cedente, stesso IBAN, TD24
// differita col riferimento al DDT.
//
// LE REGOLE CHE NON SI TOCCANO
//   - un DDT si fattura UNA volta sola: il registro fatture_generate lo dice.
//   - il numero di fattura e' progressivo e senza buchi: si parte dall'ultimo
//     emesso + 1, e chi genera non lo digita a caso.
//   - chi non ha un'identita' fiscale, una citta' o un metodo di pagamento da
//     cui ricavare la scadenza NON si fattura, e si dice perche'.
//   - la data della fattura e' la data del DDT.

export const CEDENTE = {
  piva: "17272011002",
  denominazione: "GLUTEN FREE EXPERIENCE SRL",
  regime: "RF01",
  via: "LUNGOTEVERE PORTUENSE 150",
  cap: "00151",
  comune: "ROMA",
  provincia: "RM",
  banca: "BANCA SELLA SPA",
  iban: "IT39Z0326879720052797101910",
  abi: "03268",
  cab: "79720",
};

// Dal 03/08/2026 i documenti li fa il magazzino: prima li faceva TeamSystem e
// quelle fatture le ha gia' emesse lui.
export const FATTURABILI_DAL = "2026-08-03";

const UE = new Set(["AT","BE","BG","CY","CZ","DE","DK","EE","ES","FI","FR","GR",
  "HR","HU","IE","IT","LT","LU","LV","MT","NL","PL","PT","RO","SE","SI","SK"]);

// Perche' l'IVA non si applica. Non e' obbligatorio scriverlo, ma chi legge la
// fattura (e chi la controlla) deve trovarci l'articolo.
const RIF_NORMA = {
  "N3.1": "Operazione non imponibile art. 8 DPR 633/72",
  "N3.2": "Cessione intracomunitaria art. 41 DL 331/93",
};

const soloCifre = (s) => String(s ?? "").replace(/\D/g, "");
// Si scappano & < > e basta, come fa lo standard nei nodi di testo: le
// virgolette e l'apostrofo dentro un testo sono legittimi, e "SOCIETA'
// A RESPONSABILITA' LIMITATA" scritto con &apos; e' solo piu' difficile da
// leggere per chi apre il file.
const esc = (s) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const q = (v, dec = 2) => (Math.round((Number(v) || 0) * 10 ** dec + 1e-6) / 10 ** dec).toFixed(dec);

// IL CODICE FISCALE HA LE LETTERE. Passarlo da una funzione che tiene solo le
// cifre riduceva RNDPQL70T14Z401F a 7014401 e lo SDI scartava la fattura
// (successo davvero, su otto fatture del 22/08/2026).
function cfValido(cf, pivaAnag, pivaGest) {
  const c = String(cf || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (/^\d{11}$/.test(c) || /^[A-Z0-9]{16}$/.test(c)) return c;
  return soloCifre(pivaAnag) || soloCifre(pivaGest);
}

// L'INDIRIZZO E' SOLO LA VIA. Da noi la sede legale e' spesso scritta per
// esteso ("via Laurito, 2 - 84017 Positano Italia") e finiva tale e quale nel
// campo Indirizzo, con CAP e comune ripetuti due volte nella stessa fattura.
function soloVia(testo, cap, citta, prov) {
  let t = String(testo || "").split(/\s+/).filter(Boolean).join(" ");
  for (const pezzo of [cap, citta, prov]) {
    if (!pezzo) continue;
    const p = String(pezzo).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    t = t.replace(new RegExp("[\\s,;.\\-–]*\\(?" + p + "\\)?\\s*$", "i"), "");
    t = t.replace(new RegExp("[\\s,;.\\-–]*\\(?" + p + "\\)?(?=[\\s,;.\\-–]|$)", "ig"), " ");
  }
  t = t.replace(/\b(italia|italy)\b/ig, "").replace(/\s{2,}/g, " ").replace(/^[\s,;.\-–]+|[\s,;.\-–]+$/g, "");
  return t || "N.D.";
}

// Nome e cognome separati. Se non li ha scritti nessuno si spezza il nome
// intero, ma e' un ripiego: "Maria Teresa De Luca" non si indovina.
function spezzaNome(intero, nome, cognome) {
  if (nome && cognome) return [nome, cognome, false];
  const pezzi = String(intero || "").trim().split(/\s+/).filter(Boolean);
  if (pezzi.length < 2) return [intero || "N.D.", "N.D.", true];
  return [pezzi.slice(0, -1).join(" "), pezzi[pezzi.length - 1], true];
}

// mezzo di pagamento -> codice della fattura elettronica
function modalita(metodo) {
  const m = String(metodo || "").toLowerCase();
  if (m.includes("contrassegno") && m.includes("assegn")) return "MP02";
  if (m.includes("contrassegno")) return "MP01";
  if (m.includes("ri.ba") || m.includes("riba")) return "MP12";
  if (m.includes("assegn")) return "MP02";
  if (m.includes("carta") || m.includes("pos")) return "MP08";
  return "MP05"; // bonifico
}

function scadenza(metodo, dataDoc) {
  const [y, mth, dd] = dataDoc.split("-").map(Number);
  const base = new Date(Date.UTC(y, mth - 1, dd));
  const m = String(metodo || "").toLowerCase();
  const mg = m.match(/(\d+)\s*gg/);
  const gg = mg ? Number(mg[1]) : 0;
  const iso = (d) => d.toISOString().slice(0, 10);
  if (m.includes("anticipat") || m.includes("contrassegno") || m.includes("consegna")) return iso(base);
  if (m.includes("fine mese")) {
    // FINE MESE VUOL DIRE PRIMA LA FINE DEL MESE, POI I GIORNI.
    const fine = new Date(Date.UTC(y, mth, 0));
    fine.setUTCDate(fine.getUTCDate() + gg);
    return iso(fine);
  }
  base.setUTCDate(base.getUTCDate() + gg);
  return iso(base);
}

// L'anagrafica fiscale del cliente, messa insieme da quello che sappiamo:
// prima l'anagrafica del magazzino, poi quella del gestionale.
function anagrafica(ordine, idx) {
  const nome = String(ordine.cliente || "").split("·")[0].trim();
  const a = idx.ovCod.get(ordine.id_cliente) || idx.ovNome.get(nome.toLowerCase()) || {};
  let g = idx.gestCod.get(ordine.id_cliente) || {};
  if (!g.codice_cliente) {
    const cand = idx.gestNome.get(nome.toLowerCase()) || [];
    if (cand.length === 1) g = cand[0];
  }
  const naz = (String(a.nazione || "IT").trim().toUpperCase().slice(0, 2)) || "IT";
  const piva = soloCifre(a.partita_iva) || soloCifre(g.piva);
  // IL RECAPITO CHE SA SOLO SIBILL. Di 616 clienti il codice destinatario ce
  // l'ha lui e non noi: sono le fatture di quel cliente gia' arrivate, quindi
  // e' il recapito buono. Il nostro, se c'e', vince sempre.
  const sib = idx.recapiti.get(piva) || {};
  return {
    denom: a.ragione_sociale || g.ragione_sociale || nome,
    piva,
    cf: cfValido(g.codice_fiscale, a.partita_iva, g.piva),
    via: soloVia(a.sede_legale || g.indirizzo || "", a.cap || g.cap, a.citta || g.citta, a.provincia || g.provincia),
    cap: soloCifre(a.cap || g.cap).slice(0, 5),
    citta: String(a.citta || g.citta || "").trim(),
    // La provincia esiste in Italia. Per un cliente estero il campo si omette:
    // "LUGANO" troncato a "LU" farebbe risultare Lucca.
    prov: naz === "IT" ? String(a.provincia || g.provincia || "").trim().slice(0, 2) : "",
    nazione: naz,
    estero: naz !== "IT",
    sdi: String(a.codice_univoco || "").trim(),
    sdiSibill: String(sib.sdi || "").trim(),
    pec: String(a.pec || "").trim() || String(sib.pec || "").trim(),
    // UNA PERSONA NON E' UN'AZIENDA: nome e cognome separati, niente partita
    // IVA, solo il codice fiscale. Mandarla come azienda non e' impreciso, e'
    // scartato dallo SDI.
    persona: Boolean(a.persona_fisica),
    nome: String(a.nome || "").trim(),
    cognome: String(a.cognome || "").trim(),
  };
}

function datiAnagraficiCliente(a) {
  // UN CLIENTE ESTERO NON HA UNA PARTITA IVA ITALIANA: l'identificativo va col
  // prefisso del suo paese, se no lo SDI lo cerca nell'anagrafe tributaria
  // italiana, non lo trova e scarta.
  if (a.estero) {
    return `<IdFiscaleIVA><IdPaese>${a.nazione}</IdPaese><IdCodice>${esc(a.piva || "99999999999")}</IdCodice></IdFiscaleIVA>` +
      `<Anagrafica><Denominazione>${esc(a.denom.slice(0, 80))}</Denominazione></Anagrafica></DatiAnagrafici>`;
  }
  if (!a.persona) {
    return `<IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>${esc(a.piva)}</IdCodice></IdFiscaleIVA>` +
      `<CodiceFiscale>${esc(a.cf || a.piva)}</CodiceFiscale>` +
      `<Anagrafica><Denominazione>${esc(a.denom.slice(0, 80))}</Denominazione></Anagrafica></DatiAnagrafici>`;
  }
  const [nome, cognome] = spezzaNome(a.denom, a.nome, a.cognome);
  return `<CodiceFiscale>${esc(a.cf)}</CodiceFiscale>` +
    `<Anagrafica><Nome>${esc(nome.slice(0, 60))}</Nome><Cognome>${esc(cognome.slice(0, 60))}</Cognome></Anagrafica></DatiAnagrafici>`;
}

export function xmlFattura(numero, dataDoc, ordine, a, righe) {
  const prog = String(numero % 100000).padStart(5, "0");
  const buono = (c) => /^[A-Za-z0-9]{7}$/.test(c || "") && c !== "0000000";
  let dest = buono(a.sdi) ? a.sdi : buono(a.sdiSibill) ? a.sdiSibill
    : /^[A-Za-z0-9]{7}$/.test(a.sdi) ? a.sdi : "0000000";
  // Il cliente estero non e' sullo SDI: la fattura si deposita e basta, il
  // recapito e' la sigla convenzionale XXXXXXX.
  if (a.estero) dest = "XXXXXXX";
  const pec = dest === "0000000" && a.pec ? a.pec : "";

  const imponibili = new Map();
  const linee = [...righe]
    .sort((x, y) => (Number(x.ordine_riga) || 0) - (Number(y.ordine_riga) || 0))
    .map((r, i) => {
      const qta = Number(r.quantita_ordinata) || 0;
      const pu = Number(r.prezzo_unitario) || 0;
      const sc = [r.sconto_pct, r.sconto2_pct, r.sconto3_pct].map((s) => Number(s) || 0);
      let netto = qta * pu;
      for (const s of sc) netto *= 1 - s / 100;
      // ALIQUOTA ASSENTE E ALIQUOTA ZERO NON SONO LA STESSA COSA.
      // `Number(null) || 0` le faceva diventare identiche, e l'errore che
      // usciva diceva "a IVA zero senza natura" anche quando l'aliquota non
      // c'era proprio: chi lo leggeva andava a cercare una natura da scrivere
      // invece dell'aliquota che mancava. Dal 31/08 l'archiviazione non lascia
      // piu' passare una riga senza aliquota, ma qui resta l'ultima rete: se
      // una riga arriva fin qui vuota, lo si dice con la parola giusta.
      if (r.iva_pct === null || r.iva_pct === undefined || String(r.iva_pct).trim() === "") {
        throw new Error(
          `riga "${String(r.descrizione_prodotto || "").slice(0, 40)}" senza aliquota IVA: ` +
            "scrivila sull'ordine (o a catalogo sull'articolo), non si puo' dedurre qui"
        );
      }
      const al = Number(r.iva_pct) || 0;
      // UNA RIGA A ZERO DEVE DIRE PERCHE'. Aliquota 0 senza natura non esiste
      // per lo SDI: la natura la scrive il magazzino sulla riga, qui si
      // riporta e basta, non si inventa.
      let nat = String(r.natura_iva || "").trim().toUpperCase();
      if (al !== 0) nat = "";
      if (al === 0 && !nat) {
        throw new Error(`riga "${String(r.descrizione_prodotto || "").slice(0, 40)}" a IVA zero senza natura`);
      }
      // LA NATURA DEVE ESSERE COERENTE CON DOVE VA LA MERCE. N3.2 e' la
      // cessione intracomunitaria: verso la Svizzera non esiste, e' export.
      if (nat === "N3.2" && !UE.has(a.nazione)) {
        throw new Error(`natura N3.2 (intra-UE) verso ${a.nazione}, che non e' nell'Unione`);
      }
      if ((nat === "N3.1" || nat === "N3.2") && !a.estero) {
        throw new Error(`natura ${nat} su un cliente italiano`);
      }
      const k = al + "|" + nat;
      imponibili.set(k, (imponibili.get(k) || 0) + netto);
      const sconti = sc.filter(Boolean)
        .map((s) => `<ScontoMaggiorazione><Tipo>SC</Tipo><Percentuale>${q(s)}</Percentuale></ScontoMaggiorazione>`)
        .join("");
      return `<DettaglioLinee><NumeroLinea>${i + 1}</NumeroLinea>` +
        `<Descrizione>${esc(String(r.descrizione_prodotto || "").trim().slice(0, 1000))}</Descrizione>` +
        `<Quantita>${q(qta)}</Quantita><PrezzoUnitario>${q(pu, 4)}</PrezzoUnitario>${sconti}` +
        `<PrezzoTotale>${q(netto)}</PrezzoTotale><AliquotaIVA>${q(al)}</AliquotaIVA>` +
        (nat ? `<Natura>${nat}</Natura>` : "") + `</DettaglioLinee>`;
    }).join("");

  // UN'ALIQUOTA NON PUO' ANDARE SOTTO ZERO. L'abbuono e' una riga negativa: se
  // su un'aliquota toglie piu' di quanto c'e', il riepilogo non sta in piedi.
  for (const [k, v] of imponibili) {
    if (v < 0) throw new Error(`l'abbuono manda sotto zero l'aliquota ${k.split("|")[0]}%`);
  }

  const chiavi = [...imponibili.keys()].sort((x, y) => Number(x.split("|")[0]) - Number(y.split("|")[0]));
  const riep = chiavi.map((k) => {
    const [alS, nat] = k.split("|");
    const al = Number(alS);
    const v = imponibili.get(k);
    return `<DatiRiepilogo><AliquotaIVA>${q(al)}</AliquotaIVA>` +
      (nat ? `<Natura>${nat}</Natura>` : "") +
      `<ImponibileImporto>${q(v)}</ImponibileImporto><Imposta>${q((v * al) / 100)}</Imposta>` +
      (RIF_NORMA[nat] ? `<RiferimentoNormativo>${esc(RIF_NORMA[nat])}</RiferimentoNormativo>` : "") +
      `<EsigibilitaIVA>I</EsigibilitaIVA></DatiRiepilogo>`;
  }).join("");

  let tot = 0;
  for (const k of chiavi) tot += imponibili.get(k) * (1 + Number(k.split("|")[0]) / 100);
  const metodo = ordine.metodo_pagamento || "";

  const xml = '<?xml version="1.0" encoding="UTF-8"?>' +
    '<p:FatturaElettronica versione="FPR12" xmlns:p="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2">' +
    "<FatturaElettronicaHeader><DatiTrasmissione>" +
    `<IdTrasmittente><IdPaese>IT</IdPaese><IdCodice>${CEDENTE.piva}</IdCodice></IdTrasmittente>` +
    `<ProgressivoInvio>${prog}</ProgressivoInvio><FormatoTrasmissione>FPR12</FormatoTrasmissione>` +
    `<CodiceDestinatario>${dest}</CodiceDestinatario>` +
    (pec ? `<PECDestinatario>${esc(pec)}</PECDestinatario>` : "") +
    "</DatiTrasmissione><CedentePrestatore><DatiAnagrafici>" +
    `<IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>${CEDENTE.piva}</IdCodice></IdFiscaleIVA>` +
    `<CodiceFiscale>${CEDENTE.piva}</CodiceFiscale>` +
    `<Anagrafica><Denominazione>${CEDENTE.denominazione}</Denominazione></Anagrafica>` +
    `<RegimeFiscale>${CEDENTE.regime}</RegimeFiscale></DatiAnagrafici>` +
    `<Sede><Indirizzo>${CEDENTE.via}</Indirizzo><CAP>${CEDENTE.cap}</CAP><Comune>${CEDENTE.comune}</Comune>` +
    `<Provincia>${CEDENTE.provincia}</Provincia><Nazione>IT</Nazione></Sede></CedentePrestatore>` +
    "<CessionarioCommittente><DatiAnagrafici>" + datiAnagraficiCliente(a) +
    // Il CAP della fattura elettronica e' di cinque cifre e basta: quello
    // svizzero ne ha quattro e il tracciato lo rifiuta, quindi per l'estero si
    // scrive 00000, che e' la convenzione.
    `<Sede><Indirizzo>${esc(a.via.slice(0, 60) || "N.D.")}</Indirizzo>` +
    `<CAP>${a.estero ? "00000" : a.cap || "00000"}</CAP><Comune>${esc(a.citta.slice(0, 60))}</Comune>` +
    (a.prov ? `<Provincia>${esc(a.prov)}</Provincia>` : "") +
    `<Nazione>${a.nazione}</Nazione></Sede></CessionarioCommittente></FatturaElettronicaHeader>` +
    "<FatturaElettronicaBody><DatiGenerali><DatiGeneraliDocumento>" +
    `<TipoDocumento>TD24</TipoDocumento><Divisa>EUR</Divisa><Data>${dataDoc}</Data>` +
    `<Numero>${numero}</Numero><ImportoTotaleDocumento>${q(tot)}</ImportoTotaleDocumento>` +
    "</DatiGeneraliDocumento>" +
    `<DatiDDT><NumeroDDT>${esc(String(ordine.ddt_numero))}</NumeroDDT><DataDDT>${dataDoc}</DataDDT></DatiDDT>` +
    "</DatiGenerali><DatiBeniServizi>" + linee + riep + "</DatiBeniServizi>" +
    "<DatiPagamento><CondizioniPagamento>TP02</CondizioniPagamento><DettaglioPagamento>" +
    `<ModalitaPagamento>${modalita(metodo)}</ModalitaPagamento>` +
    `<DataRiferimentoTerminiPagamento>${dataDoc}</DataRiferimentoTerminiPagamento>` +
    `<DataScadenzaPagamento>${scadenza(metodo, dataDoc)}</DataScadenzaPagamento>` +
    `<ImportoPagamento>${q(tot)}</ImportoPagamento>` +
    `<IstitutoFinanziario>${CEDENTE.banca}</IstitutoFinanziario><IBAN>${CEDENTE.iban}</IBAN>` +
    `<ABI>${CEDENTE.abi}</ABI><CAB>${CEDENTE.cab}</CAB>` +
    "</DettaglioPagamento></DatiPagamento></FatturaElettronicaBody></p:FatturaElettronica>";

  return { xml, totale: tot };
}

// Chi si fattura e chi no, con il motivo. Non decide niente da sola: separa e
// spiega, poi la fattura la fa partire l'operatore.
export function selezionaFatture(d) {
  const idx = {
    ovCod: new Map(d.ov.filter((c) => c.codice_cliente).map((c) => [c.codice_cliente, c])),
    ovNome: new Map(d.ov.map((c) => [String(c.ragione_sociale || "").trim().toLowerCase(), c])),
    gestCod: new Map(d.gest.map((g) => ["CLI-" + g.codice_cliente, g])),
    gestNome: new Map(),
    recapiti: new Map((d.recapiti || []).map((r) => [String(r.piva), r])),
  };
  for (const g of d.gest) {
    const k = String(g.ragione_sociale || "").trim().toLowerCase();
    if (!idx.gestNome.has(k)) idx.gestNome.set(k, []);
    idx.gestNome.get(k).push(g);
  }
  const perOrdine = new Map();
  for (const r of d.righe) {
    if (!perOrdine.has(r.id_ordine)) perOrdine.set(r.id_ordine, []);
    perOrdine.get(r.id_ordine).push(r);
  }
  const metodi = new Map(d.metodi.map((m) => [String(m.ddt_numero).trim(), m]));
  const fatti = new Map(d.fatte.map((f) => [String(f.ddt_numero).trim(), f]));

  const pronte = [];
  const escluse = [];
  const gia = [];
  for (const o of d.ordini) {
    const data = String(o.data_preparato || o.data_ordine || "").slice(0, 10);
    const n = String(o.ddt_numero || "").trim();
    if (!n || !data || data < FATTURABILI_DAL) continue;
    const a = anagrafica(o, idx);
    const riga = { ddt: n, data, cliente: a.denom, imponibile: Number(o.totale_imponibile) || 0 };

    if (fatti.has(n)) { gia.push({ ...riga, ...fatti.get(n) }); continue; }
    if (o.campionatura && riga.imponibile === 0) {
      escluse.push({ ...riga, motivo: "campionatura gratuita: non c'e' niente da fatturare" }); continue;
    }
    if (a.persona) {
      if (!/^[A-Z0-9]{16}$/.test(String(a.cf || "").toUpperCase())) {
        escluse.push({ ...riga, motivo: "privato senza codice fiscale a 16 caratteri" }); continue;
      }
    } else if (!a.estero && a.piva.length !== 11) {
      escluse.push({ ...riga, motivo: "manca la partita IVA (o non e' di 11 cifre)" }); continue;
    }
    if (!a.citta || (!a.prov && !a.estero)) {
      escluse.push({ ...riga, motivo: "manca la citta' o la provincia in anagrafica" }); continue;
    }
    // IL METODO DI PAGAMENTO DEVE DIRE QUANDO SI INCASSA. La forma canonica la
    // decide il database, che sa leggere anche le scritture vecchie: la mia
    // copia in javascript sbaglierebbe come sbagliava quella in python.
    const met = metodi.get(n)?.canonico || "";
    if (!met) {
      escluse.push({ ...riga, motivo: `il pagamento non dice quando si incassa (${metodi.get(n)?.effettivo || "vuoto"})` });
      continue;
    }
    const righe = perOrdine.get(o.id_ordine) || [];
    if (!righe.length) { escluse.push({ ...riga, motivo: "l'ordine non ha righe" }); continue; }
    pronte.push({ ...riga, ordine: { ...o, metodo_pagamento: met }, a, righe });
  }
  pronte.sort((x, y) => (x.data === y.data ? Number(x.ddt) - Number(y.ddt) : x.data < y.data ? -1 : 1));
  escluse.sort((x, y) => Number(x.ddt) - Number(y.ddt));
  const usati = d.fatte.map((f) => Number(f.numero)).filter((x) => x > 0);
  return { pronte, escluse, gia, prossimoNumero: usati.length ? Math.max(...usati) + 1 : 1653 };
}

// UNO ZIP SCRITTO A MANO, senza librerie: sono file piccoli e si mettono
// dentro senza comprimere. Una dipendenza in meno da tenere aggiornata.
function crc32(buf) {
  let c, tavola = crc32.t;
  if (!tavola) {
    tavola = crc32.t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      tavola[n] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ tavola[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

export function zipDiFile(files) {
  const enc = new TextEncoder();
  const parti = [];
  const centrale = [];
  let offset = 0;
  const u16 = (n) => [n & 0xff, (n >> 8) & 0xff];
  const u32 = (n) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff];

  for (const f of files) {
    const nome = enc.encode(f.nome);
    const dati = enc.encode(f.contenuto);
    const crc = crc32(dati);
    const testa = [...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
      ...u32(crc), ...u32(dati.length), ...u32(dati.length), ...u16(nome.length), ...u16(0)];
    parti.push(new Uint8Array(testa), nome, dati);
    centrale.push([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
      ...u32(crc), ...u32(dati.length), ...u32(dati.length), ...u16(nome.length),
      ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset)], nome);
    offset += testa.length + nome.length + dati.length;
  }
  const dirParti = [];
  let dirLen = 0;
  for (let i = 0; i < centrale.length; i += 2) {
    const testa = new Uint8Array(centrale[i]);
    dirParti.push(testa, centrale[i + 1]);
    dirLen += testa.length + centrale[i + 1].length;
  }
  const fine = new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0),
    ...u16(files.length), ...u16(files.length), ...u32(dirLen), ...u32(offset), ...u16(0)]);
  return new Blob([...parti, ...dirParti, fine], { type: "application/zip" });
}

export const nomeFile = (numero) => `IT${CEDENTE.piva}_${String(numero).padStart(5, "0").slice(-5)}.xml`;
