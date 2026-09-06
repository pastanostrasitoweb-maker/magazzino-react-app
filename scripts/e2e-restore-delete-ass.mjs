import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
const env=Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l&&l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const sb=createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_ANON_KEY);
const log=(m,ok,e="")=>console.log((ok?"PASS ":"FAIL ")+m+(e?" -> "+e:""));

// helper to simulate adapter deleteAssignment
async function adapterDeleteAssignment(idAss) {
  const {data:ass}=await sb.from("assegnazioni_lotti").select("id_riga,id_lotto,quantita_assegnata").eq("id_assegnazione",idAss).maybeSingle();
  if(!ass) return {success:false,error:"inesistente"};
  const {data:rig}=await sb.from("righe_ordine").select("id_ordine").eq("id_riga",ass.id_riga).maybeSingle();
  const idOrdine=rig?.id_ordine;
  const {data:ord}=await sb.from("ordini").select("stato").eq("id_ordine",idOrdine).maybeSingle();
  const wasPrep=String(ord?.stato||"").trim().toLowerCase()==="preparato";
  let stockMovements=[]; let orderReopened=false;
  if(wasPrep){
    const {data:lot}=await sb.from("lotti").select("quantita_caricata").eq("id_lotto",ass.id_lotto).maybeSingle();
    const newQty=Number(lot.quantita_caricata||0)+Number(ass.quantita_assegnata||0);
    await sb.from("lotti").update({quantita_caricata:newQty}).eq("id_lotto",ass.id_lotto);
    stockMovements.push({lotId:ass.id_lotto,newQty});
    await sb.from("ordini").update({stato:"Da preparare",data_preparato:null,stato_lavorazione:"In lavorazione"}).eq("id_ordine",idOrdine);
    orderReopened=true;
  }
  const {error}=await sb.rpc("rimuovi_assegnazione",{p_id_assegnazione:idAss});
  if(error) return {success:false,error:error.message};
  return {success:true,stockMovements,orderReopened};
}

const PROD_ID=4;
const {data:disp}=await sb.from("v_lotti_disponibilita").select("id_lotto,quantita_caricata,disponibile").eq("id_prodotto",String(PROD_ID)).gt("disponibile",0).limit(1);
const lot=disp[0]; const pre=Number(lot.quantita_caricata);
console.log(`Lotto ${lot.id_lotto} giacenza PRE=${pre}`);

const stamp=Date.now();
const ORD=`ORD-TEST-DELASS-${stamp}`;
const RIGA=`RIGA-TEST-DELASS-${stamp}-0`;
await sb.from("ordini").insert({id_ordine:ORD,cliente:"TEST DELASS",data_ordine:"2026-06-11",stato:"Da preparare",archiviato:false});
await sb.from("righe_ordine").insert({id_riga:RIGA,id_ordine:ORD,id_prodotto:String(PROD_ID),descrizione_prodotto:"Pici",quantita_ordinata:1,quantita_assegnata:0,ordine_riga:1});
const {data:ass}=await sb.rpc("assegna_lotto",{p_id_riga:RIGA,p_id_lotto:lot.id_lotto,p_quantita:1,p_operatore:"test",p_allow_negative:false});
const assRow=Array.isArray(ass)?ass[0]:ass;
log("1. assegna_lotto ok",!!assRow);
await sb.rpc("prepara_ordine",{p_id_ordine:ORD});
const {data:l1}=await sb.from("lotti").select("quantita_caricata").eq("id_lotto",lot.id_lotto).maybeSingle();
log(`2. prepara: stock scalato a ${pre-1}`,Number(l1.quantita_caricata)===pre-1,`actual=${l1.quantita_caricata}`);

// CORE TEST: delete assignment dovrebbe ripristinare stock e riaprire ordine
const res=await adapterDeleteAssignment(assRow.id_assegnazione);
log("3. deleteAssignment success",res.success);
log("3a. result.orderReopened = true",res.orderReopened===true);
log("3b. result.stockMovements has 1 movement",res.stockMovements?.length===1);
const {data:l2}=await sb.from("lotti").select("quantita_caricata").eq("id_lotto",lot.id_lotto).maybeSingle();
log(`4. stock RIPRISTINATO a ${pre}`,Number(l2.quantita_caricata)===pre,`actual=${l2.quantita_caricata}`);
const {data:o2}=await sb.from("ordini").select("stato,data_preparato").eq("id_ordine",ORD).maybeSingle();
log("5. ordine riaperto in 'Da preparare'",o2.stato==="Da preparare",`stato=${o2.stato}`);
log("5a. data_preparato azzerata",o2.data_preparato===null);

// cleanup
await sb.from("ordini").delete().eq("id_ordine",ORD);
log("CLEANUP: ordine cancellato",true);
