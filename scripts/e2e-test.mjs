// E2E test pre-lancio: simula un flusso completo (create order -> assign ->
// prepare -> verify stock scaled) e poi pulisce (ripristino lotto + delete
// ordine). Nessuna UI, solo Supabase client.

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split("\n").filter(l => l && l.includes("=")).map(l => {
    const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  })
);
const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
const log = (label, ok, extra="") => console.log((ok?"PASS ":"FAIL ")+label+(extra?" -> "+extra:""));

// --- pick target prodotto con lotti veri e disponibili ---
const PROD_ID = 4; // NFARMA 013 Pici 250
const {data:prodR} = await sb.from("prodotti").select("id_prodotto,codice_prodotto,descrizione_prodotto,gestione_lotti").eq("id_prodotto", PROD_ID).maybeSingle();
console.log("Prodotto target:", prodR.codice_prodotto, prodR.descrizione_prodotto, "gestione_lotti =", prodR.gestione_lotti);

// pick un lotto disponibile
const {data:disp} = await sb.from("v_lotti_disponibilita").select("id_lotto, codice_lotto, quantita_caricata, disponibile").eq("id_prodotto", String(PROD_ID)).gt("disponibile", 0).limit(1);
if (!disp || disp.length === 0) { console.error("Nessun lotto disponibile per Pici"); process.exit(1); }
const lottoTarget = disp[0];
const stockPre = Number(lottoTarget.quantita_caricata);
console.log(`Lotto target: ${lottoTarget.id_lotto} (${lottoTarget.codice_lotto}) | giacenza pre=${stockPre} | disp=${lottoTarget.disponibile}`);

const stamp = Date.now();
const ORD_ID = `ORD-TEST-LANCIO-${stamp}`;
const RIGA_ID = `RIGA-TEST-LANCIO-${stamp}-0`;

// --- STEP 1: insert ordine ---
{
  const {error} = await sb.from("ordini").insert({
    id_ordine: ORD_ID,
    cliente: "TEST LANCIO 10/06",
    data_ordine: new Date().toISOString().slice(0,10),
    stato: "Da preparare",
    stato_lavorazione: "Nuovo",
    archiviato: false,
  });
  log("1. insert ordine", !error, error?.message || ORD_ID);
  if (error) process.exit(1);
}

// --- STEP 2: insert riga ---
{
  const {error} = await sb.from("righe_ordine").insert({
    id_riga: RIGA_ID,
    id_ordine: ORD_ID,
    id_prodotto: String(PROD_ID),
    descrizione_prodotto: "Pici 250 (TEST)",
    quantita_ordinata: 1,
    quantita_assegnata: 0,
    ordine_riga: 1,
  });
  log("2. insert riga ordine (1 pz Pici)", !error, error?.message || RIGA_ID);
  if (error) { await sb.from("ordini").delete().eq("id_ordine", ORD_ID); process.exit(1); }
}

// --- STEP 3: rpc assegna_lotto ---
{
  const {data, error} = await sb.rpc("assegna_lotto", {
    p_id_riga: RIGA_ID,
    p_id_lotto: lottoTarget.id_lotto,
    p_quantita: 1,
    p_operatore: "e2e-test",
  });
  log("3. rpc assegna_lotto (1 pz)", !error, error?.message || "ok");
  if (error) { await sb.from("ordini").delete().eq("id_ordine", ORD_ID); process.exit(1); }
}

// verify riga.quantita_assegnata = 1
{
  const {data:r} = await sb.from("righe_ordine").select("quantita_assegnata").eq("id_riga", RIGA_ID).maybeSingle();
  log("   verify riga.quantita_assegnata = 1", Number(r.quantita_assegnata) === 1, `actual=${r.quantita_assegnata}`);
}

// --- STEP 4: rpc prepara_ordine ---
{
  const {data, error} = await sb.rpc("prepara_ordine", { p_id_ordine: ORD_ID });
  log("4. rpc prepara_ordine", !error, error?.message || "ok");
  if (error) { 
    // cleanup
    await sb.from("ordini").delete().eq("id_ordine", ORD_ID);
    process.exit(1);
  }
}

// verify ordine.stato = Preparato
{
  const {data:o} = await sb.from("ordini").select("stato, data_preparato").eq("id_ordine", ORD_ID).maybeSingle();
  log("   verify ordine.stato = Preparato", o.stato === "Preparato", `actual=${o.stato}`);
  log("   verify ordine.data_preparato impostata", !!o.data_preparato, `actual=${o.data_preparato}`);
}

// verify lotto giacenza scalata di 1
{
  const {data:l} = await sb.from("lotti").select("quantita_caricata").eq("id_lotto", lottoTarget.id_lotto).maybeSingle();
  const stockPost = Number(l.quantita_caricata);
  log("5. verify lotto giacenza scalata di 1", stockPost === stockPre - 1, `pre=${stockPre} post=${stockPost} delta=${stockPost - stockPre}`);
}

// --- CLEANUP: ripristino giacenza lotto + delete ordine ---
{
  await sb.from("lotti").update({ quantita_caricata: stockPre }).eq("id_lotto", lottoTarget.id_lotto);
  const {data:l} = await sb.from("lotti").select("quantita_caricata").eq("id_lotto", lottoTarget.id_lotto).maybeSingle();
  log("CLEANUP: lotto ripristinato a giacenza pre", Number(l.quantita_caricata) === stockPre, `now=${l.quantita_caricata}`);
}
{
  // delete ordine -> cascade su righe e assegnazioni
  const {error} = await sb.from("ordini").delete().eq("id_ordine", ORD_ID);
  log("CLEANUP: delete ordine TEST", !error, error?.message || "ok");
  // verify cleanup
  const {data:resR} = await sb.from("righe_ordine").select("id_riga").eq("id_ordine", ORD_ID);
  const {data:resA} = await sb.from("assegnazioni_lotti").select("id_assegnazione").eq("id_riga", RIGA_ID);
  log("   verify nessuna riga residua", (resR||[]).length === 0);
  log("   verify nessuna assegnazione residua", (resA||[]).length === 0);
}

console.log("\nFLOW E2E COMPLETATO");
