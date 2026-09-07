// IL MARCATORE "SU RICHIESTA" IN UN POSTO SOLO.
//
// L'app agenti appiccica " [SU RICHIESTA]" alla descrizione quando, al momento
// dell'ordine, quell'articolo era a semaforo rosso: serve a chi prepara per
// sapere che quel cartone va prodotto o procurato.
//
// Ma e' una fotografia di quel momento e non si aggiorna: su 70 righe marcate,
// 49 sono poi state consegnate regolarmente. Quindi (Luca 07/09/2026):
//   - dai documenti si toglie sempre: il cliente riceve la merce, non la storia
//     di com'era il magazzino il giorno dell'ordine;
//   - a schermo sparisce quando la riga e' stata assegnata, perche' da quel
//     momento la risposta e' arrivata: la merce c'e'.
//
// Sta qui e non in tre copie perche' i posti che mostrano la descrizione sono
// cinque, e l'ultima volta correggerne uno per volta ha lasciato il guasto in
// giro per due giorni.

const MARCATORE = /\s*\[\s*SU RICHIESTA\s*\]\s*/gi;

export function eraSuRichiesta(descrizione) {
  return /\[\s*SU RICHIESTA\s*\]/i.test(String(descrizione || ""));
}

export function senzaSuRichiesta(descrizione) {
  return String(descrizione || "")
    .replace(MARCATORE, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// Quello che si legge a schermo: il marcatore resta finche' la riga aspetta.
export function descrizioneAschermo(descrizione, quantitaAssegnata) {
  return Number(quantitaAssegnata || 0) > 0
    ? senzaSuRichiesta(descrizione)
    : String(descrizione || "");
}

// Quello che si stampa: mai il marcatore.
export const descrizioneStampata = senzaSuRichiesta;
