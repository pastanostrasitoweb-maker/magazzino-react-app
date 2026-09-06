import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
const env=Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l&&l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const sb=createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_ANON_KEY);
const log=(m,ok,e="")=>console.log((ok?"PASS ":"FAIL ")+m+(e?" -> "+e:""));

const PROD_ID=4;
const {data:disp}=await sb.from("v_lotti_disponibilita").select("id_lotto,codice_lotto,quantita_caricata,disponibile").eq("id_prodotto",String(PROD_ID)).gt("disponibile",0).limit(1);
const lot=disp[0]; const pre=Number(lot.quantita_caricata);
console.log(`pre giacenza lotto ${lot.id_lotto}=${pre}`);

const stamp=Date.now();
const ORD=`ORD-TEST-RESTORE-${stamp}`;
const RIGA=`RIGA-TEST-RESTORE-${stamp}-0`;

await sb.from("ordini").insert({id_ordine:ORD,cliente:"TEST RESTORE",data_ordine:"2026-06-11",stato:"Da preparare",archiviato:false});
await sb.from("righe_ordine").insert({id_riga:RIGA,id_ordine:ORD,id_prodotto:String(PROD_ID),descrizione_prodotto:"Pici",quantita_ordinata:1,quantita_assegnata:0,ordine_riga:1});
const {error:errAss}=await sb.rpc("assegna_lotto",{p_id_riga:RIGA,p_id_lotto:lot.id_lotto,p_quantita:1,p_operatore:"test"});
log("assegna_lotto 1pz",!errAss,errAss?.message);
const {error:errPrep}=await sb.rpc("prepara_ordine",{p_id_ordine:ORD});
log("prepara_ordine",!errPrep,errPrep?.message);
const {data:l1}=await sb.from("lotti").select("quantita_caricata").eq("id_lotto",lot.id_lotto).maybeSingle();
log(`stock scalato a pre-1 (${pre-1})`,Number(l1.quantita_caricata)===pre-1,`actual=${l1.quantita_caricata}`);

// Simulazione deleteOrder come fa l'adapter
const {data:ord}=await sb.from("ordini").select("stato").eq("id_ordine",ORD).maybeSingle();
const isPrep=String(ord.stato).trim().toLowerCase()==="preparato";
log("ordine in stato Preparato",isPrep);
if(isPrep){
  const {data:righe}=await sb.from("righe_ordine").select("id_riga").eq("id_ordine",ORD);
  const {data:ass}=await sb.from("assegnazioni_lotti").select("id_lotto,quantita_assegnata").in("id_riga",righe.map(r=>r.id_riga));
  const sums={}; ass.forEach(a=>sums[a.id_lotto]=(sums[a.id_lotto]||0)+Number(a.quantita_assegnata));
  for(const [lid,q] of Object.entries(sums)){
    const {data:lc}=await sb.from("lotti").select("quantita_caricata").eq("id_lotto",lid).maybeSingle();
    await sb.from("lotti").update({quantita_caricata:Number(lc.quantita_caricata)+q}).eq("id_lotto",lid);
  }
}
await sb.from("ordini").delete().eq("id_ordine",ORD);
const {data:l2}=await sb.from("lotti").select("quantita_caricata").eq("id_lotto",lot.id_lotto).maybeSingle();
log(`stock ripristinato a pre (${pre})`,Number(l2.quantita_caricata)===pre,`actual=${l2.quantita_caricata}`);
const {data:check}=await sb.from("ordini").select("id_ordine").eq("id_ordine",ORD);
log("ordine sparito",(check||[]).length===0);
