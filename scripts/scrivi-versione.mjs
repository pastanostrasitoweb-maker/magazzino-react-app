// SCRIVE LA VERSIONE PRIMA DI OGNI BUILD.
// Serve a una cosa sola: far accorgere l'app aperta che ne e' uscita una nuova.
// Chi lascia il magazzino aperto tutto il giorno (tutti) altrimenti continua a
// lavorare col programma di stamattina, e le correzioni non le vede nessuno.
import { writeFileSync, mkdirSync } from "node:fs";
mkdirSync(new URL("../public/", import.meta.url), { recursive: true });
const versione = new Date().toISOString().slice(0, 16).replace("T", " ");
writeFileSync(new URL("../public/versione.json", import.meta.url), JSON.stringify({ versione }) + "\n");
console.log("versione " + versione);
