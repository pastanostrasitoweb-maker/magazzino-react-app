// Smoke test runtime contro Supabase reale.
// NON modifica dati di produzione. Solo:
//   - read di 5 tabelle + 2 viste
//   - chiamate RPC con argomenti volutamente invalidi (deve sollevare eccezione)
// Esegue il piping reale: se qualche shape/funzione/permission e' rotta, qui esplode.
//
// Uso: node scripts/smoke-supabase.mjs (legge .env.local da cwd)

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const SUPABASE_URL = env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("KO: env mancanti");
  process.exit(2);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let pass = 0, fail = 0;
const log = (ok, msg) => {
  console.log((ok ? "OK  " : "KO  ") + msg);
  ok ? pass++ : fail++;
};

// 1) bulk read
const reads = [
  ["prodotti", supabase.from("prodotti").select("*", { count: "exact", head: true })],
  ["lotti", supabase.from("lotti").select("*", { count: "exact", head: true })],
  ["ordini", supabase.from("ordini").select("*", { count: "exact", head: true })],
  ["righe_ordine", supabase.from("righe_ordine").select("*", { count: "exact", head: true })],
  ["assegnazioni_lotti", supabase.from("assegnazioni_lotti").select("*", { count: "exact", head: true })],
  ["v_lotti_disponibilita", supabase.from("v_lotti_disponibilita").select("*", { count: "exact", head: true })],
  ["v_righe_assegnazione", supabase.from("v_righe_assegnazione").select("*", { count: "exact", head: true })],
];
for (const [name, q] of reads) {
  const { count, error } = await q;
  if (error) log(false, `${name}: ${error.message}`);
  else log(true, `${name}: count=${count}`);
}

// 2) shape lotti: contiene id_lotto + quantita_caricata
{
  const { data, error } = await supabase.from("lotti").select("id_lotto, id_prodotto, codice_lotto, scadenza, quantita_caricata, archiviato").limit(2);
  if (error) log(false, "shape lotti: " + error.message);
  else log(data && data[0] && "id_lotto" in data[0] && "quantita_caricata" in data[0], `shape lotti ok: keys=${Object.keys(data?.[0] || {}).join(",")}`);
}

// 3) shape v_lotti_disponibilita: contiene disponibile, prenotato
{
  const { data, error } = await supabase.from("v_lotti_disponibilita").select("id_lotto, disponibile, prenotato").limit(2);
  if (error) log(false, "shape v_lotti: " + error.message);
  else log(data && data[0] && "disponibile" in data[0], "shape v_lotti ok");
}

// 4) no negativi su v_lotti_disponibilita
{
  const { data, error } = await supabase.from("v_lotti_disponibilita").select("id_lotto, disponibile").lt("disponibile", 0);
  if (error) log(false, "neg v_lotti: " + error.message);
  else log(data.length === 0, `no neg disponibili: trovati ${data.length}`);
}

// 5) RPC error path: assegna_lotto quantita invalid
{
  const { data, error } = await supabase.rpc("assegna_lotto", {
    p_id_riga: "RIGA-INESISTENTE",
    p_id_lotto: "LOT-INESISTENTE",
    p_quantita: -1,
    p_operatore: "smoke",
  });
  const msg = error?.message || "";
  log(/quantita non valida/i.test(msg), `assegna_lotto neg: ${msg.slice(0, 80)}`);
}

// 6) RPC error path: assegna_lotto qty positiva su lotto inesistente
{
  const { data, error } = await supabase.rpc("assegna_lotto", {
    p_id_riga: "RIGA-INESISTENTE",
    p_id_lotto: "LOT-INESISTENTE",
    p_quantita: 1,
    p_operatore: "smoke",
  });
  const msg = error?.message || "";
  log(/lotto.*inesistente/i.test(msg), `assegna_lotto lotto fake: ${msg.slice(0, 80)}`);
}

// 7) RPC error path: rimuovi_assegnazione id fake
{
  const { error } = await supabase.rpc("rimuovi_assegnazione", { p_id_assegnazione: "ASS-INESISTENTE-XYZ" });
  log(/assegnazione.*inesistente/i.test(error?.message || ""), `rimuovi_assegnazione fake: ${error?.message?.slice(0, 80)}`);
}

// 8) RPC error path: prepara_ordine id fake
{
  const { error } = await supabase.rpc("prepara_ordine", { p_id_ordine: "ORD-INESISTENTE-XYZ" });
  log(/ordine.*inesistente/i.test(error?.message || ""), `prepara_ordine fake: ${error?.message?.slice(0, 80)}`);
}

// 9) RPC error path: prepara_ordine su ordine GIA' preparato
{
  const { data: prepared } = await supabase.from("ordini").select("id_ordine").eq("stato", "Preparato").limit(1);
  if (prepared?.length) {
    const { error } = await supabase.rpc("prepara_ordine", { p_id_ordine: prepared[0].id_ordine });
    log(/gia preparato/i.test(error?.message || ""), `prepara_ordine already-prepared: ${error?.message?.slice(0, 80)}`);
  } else {
    log(true, "no prepared orders to test 'gia preparato'");
  }
}

console.log(`\nRISULTATO: ${pass} OK, ${fail} KO`);
process.exit(fail > 0 ? 1 : 0);
