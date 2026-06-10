import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l&&l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
const log = (label, ok, extra="") => console.log((ok?"OK  ":"ATT ")+label+(extra?" -> "+extra:""));

// 1) Lotti orfani (id_prodotto non in prodotti)
const {data:lotti} = await sb.from("lotti").select("id_lotto,id_prodotto,codice_lotto,quantita_caricata,archiviato");
const {data:prods} = await sb.from("prodotti").select("id_prodotto,codice_prodotto,descrizione_prodotto,gestione_lotti");
const prodIds = new Set(prods.map(p=>String(p.id_prodotto)));
const prodByCodice = new Map(prods.map(p=>[String(p.codice_prodotto),p]));
const prodById = new Map(prods.map(p=>[String(p.id_prodotto),p]));
const orfani = lotti.filter(l => !prodIds.has(String(l.id_prodotto)) && !prodByCodice.has(String(l.id_prodotto)));
log("lotti orfani (id_prodotto non in catalogo)", orfani.length===0, orfani.length>0 ? orfani.map(o=>o.id_lotto).join(",") : "");

// 2) Lotti con qty negativa
const lottiNeg = lotti.filter(l => Number(l.quantita_caricata) < 0);
log("lotti con giacenza < 0", lottiNeg.length===0, lottiNeg.length>0 ? lottiNeg.map(l=>`${l.id_lotto}(${l.quantita_caricata})`).join(",") : "(ok se sono lotti al volo evasi)");

// 3) Violazione A: SI con DISPONIBILITA
const violazA = lotti.filter(l => {
  const p = prodById.get(String(l.id_prodotto)) || prodByCodice.get(String(l.id_prodotto));
  return p?.gestione_lotti===true && String(l.codice_lotto||"").trim().toLowerCase()==="disponibilita";
});
log("violazioni A (prodotto SI con lotto DISPONIBILITA)", violazA.length===0, violazA.length>0 ? violazA.map(v=>v.id_lotto).join(",") : "");

// 4) Duplicati assegnazione (id_riga, id_lotto)
const {data:asseg} = await sb.from("assegnazioni_lotti").select("id_assegnazione,id_riga,id_lotto,quantita_assegnata");
const seen = new Map();
const dup = [];
for (const a of asseg) {
  const k = `${a.id_riga}|${a.id_lotto}`;
  if (seen.has(k)) dup.push(a); else seen.set(k, a);
}
log("duplicati (id_riga, id_lotto)", dup.length===0, dup.length>0 ? dup.map(d=>d.id_assegnazione).join(",") : "");

// 5) Righe con quantita_assegnata > quantita_ordinata
const {data:righe} = await sb.from("righe_ordine").select("id_riga,id_ordine,id_prodotto,quantita_ordinata,quantita_assegnata");
const over = righe.filter(r => Number(r.quantita_assegnata) > Number(r.quantita_ordinata));
log("righe sovra-assegnate (assegnata > ordinata)", over.length===0, over.length>0 ? over.map(r=>`${r.id_riga}: ${r.quantita_assegnata}/${r.quantita_ordinata}`).join("; ") : "");

// 6) Righe con id_prodotto NON in catalogo (esclusi FUORI_MAGAZZINO)
const righeOrf = righe.filter(r => !prodIds.has(String(r.id_prodotto)) && !String(r.id_prodotto).startsWith("FUORI_MAGAZZINO"));
log("righe ordine orfane (id_prodotto NON in catalogo, no FUORI_MAGAZZINO)", righeOrf.length===0, righeOrf.length>0 ? righeOrf.map(r=>r.id_riga).join(",") : "");

// 7) Ordini con stato non standard
const {data:ordini} = await sb.from("ordini").select("id_ordine,stato,archiviato,data_preparato");
const statiStd = new Set(["da preparare","preparato",""]);
const statiOdd = ordini.filter(o => !statiStd.has(String(o.stato||"").trim().toLowerCase()));
log("ordini con stato non standard", statiOdd.length===0, statiOdd.length>0 ? [...new Set(statiOdd.map(o=>o.stato))].join(",") : "");

// 8) Ordini preparati senza data_preparato
const prepNoData = ordini.filter(o => String(o.stato||"").trim().toLowerCase()==="preparato" && !o.data_preparato);
log("ordini preparati senza data_preparato", prepNoData.length===0, prepNoData.length>0 ? prepNoData.length+" ordini" : "");

// 9) v_lotti_disponibilita - lotti con disponibile < 0 anomali
const {data:vdisp} = await sb.from("v_lotti_disponibilita").select("id_lotto, disponibile, quantita_caricata");
const dispNeg = vdisp.filter(v => Number(v.disponibile) < 0);
log("vista disponibilita con valori < 0", dispNeg.length===0, dispNeg.length>0 ? dispNeg.map(d=>`${d.id_lotto}(${d.disponibile})`).join(",") : "(ok se sono lotti al volo)");

// 10) Counters
const {count:cntProd}=await sb.from("prodotti").select("*",{count:"exact",head:true});
const {count:cntLot}=await sb.from("lotti").select("*",{count:"exact",head:true});
const {count:cntOrd}=await sb.from("ordini").select("*",{count:"exact",head:true});
const {count:cntRiga}=await sb.from("righe_ordine").select("*",{count:"exact",head:true});
const {count:cntAss}=await sb.from("assegnazioni_lotti").select("*",{count:"exact",head:true});
console.log(`\nCONTATORI: prodotti=${cntProd} lotti=${cntLot} ordini=${cntOrd} righe=${cntRiga} assegnazioni=${cntAss}`);
