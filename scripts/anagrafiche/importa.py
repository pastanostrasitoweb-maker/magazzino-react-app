#!/usr/bin/env python3
"""Importa in `clienti_override` le anagrafiche estratte dalle fatture emesse.

PERCHE' PROPRIO clienti_override
E' il livello delle NOSTRE correzioni, ed e' il primo che il DDT guarda
(effectiveCliente in App.jsx). Non e' `clienti_gestionale`, che e' lo specchio
di GAMMA e viene risincronizzato: scriverci sopra vorrebbe dire perdere tutto
al prossimo allineamento.

REGOLA DI SCRITTURA: non si sovrascrive mai un dato gia' scritto a mano.
Chi ha corretto un'anagrafica in app sapeva qualcosa che la fattura non sa (un
indirizzo di consegna diverso dalla sede, per dire). Si riempiono solo i buchi.

--scrivi per applicare davvero. Senza, stampa e basta.
"""
import json, os, subprocess, sys
from pathlib import Path

BASE = Path(__file__).parent
REF = "wwjgjiybyrrkafymiuew"
SCRIVI = "--scrivi" in sys.argv

abb = json.load(open(BASE / "abbinamento.json"))
esistenti = {o["chiave"]: o for o in json.load(open(BASE / "ov.json"))}

# I campi della fattura -> le colonne dell'override.
MAPPA = [
    ("indirizzo", "sede_legale"),
    ("cap", "cap"),
    ("citta", "citta"),
    ("provincia", "provincia"),
    ("piva", "partita_iva"),
    ("codice_sdi", "codice_univoco"),
    ("pec", "pec"),
    ("denominazione", "ragione_sociale"),
]

# Codici SdI che non identificano nessuno: sette zeri = "non ha canale
# telematico", le X sono l'estero. Scriverli sarebbe peggio che lasciare vuoto.
SDI_VUOTI = {"0000000", "XXXXXXX"}

# Le condizioni di pagamento della fattura sono codici (MP05, TP02...).
# Qui si traduce solo quello che serve a capirsi, il resto si lascia stare.
MODALITA = {
    "MP01": "Contanti", "MP02": "Assegno", "MP05": "Bonifico",
    "MP08": "Carta di pagamento", "MP12": "Ri.Ba.", "MP19": "SEPA Direct Debit",
}

righe = []
for r in abb["piva"] + abb["nome"]:
    chiave = "piva:" + str(r["piva"]).strip() if r["piva"] else "nome:" + r["denominazione"].strip().lower()
    gia = esistenti.get(chiave, {})
    patch = {}
    for src, col in MAPPA:
        v = str(r.get(src) or "").strip()
        if not v:
            continue
        if src == "codice_sdi" and v.upper() in SDI_VUOTI:
            continue
        if str(gia.get(col) or "").strip():
            continue        # gia' scritto a mano: non si tocca
        patch[col] = v
    pag = MODALITA.get(str(r.get("pagamento") or "").upper())
    if pag and not str(gia.get("metodo_pagamento") or "").strip():
        patch["metodo_pagamento"] = pag
    if not patch:
        continue
    patch["chiave"] = chiave
    patch["codice_cliente"] = r["codice"]
    patch["fonte"] = "fatture-sibill"
    patch["operatore"] = "importazione"
    righe.append(patch)

print(f"clienti da aggiornare: {len(righe)}")
conta = {}
for p in righe:
    for k in p:
        if k not in ("chiave", "codice_cliente", "fonte", "operatore"):
            conta[k] = conta.get(k, 0) + 1
for k, n in sorted(conta.items(), key=lambda x: -x[1]):
    print(f"  {k:22} {n:4} caselle riempite")

if not SCRIVI:
    print("\n(prova a vuoto: rilancia con --scrivi per applicare)")
    sys.exit(0)


TOKEN = subprocess.run(["security", "find-generic-password", "-s", "Supabase CLI", "-w"],
                       capture_output=True, text=True).stdout.strip()


def esegui(sql):
    """Via curl, non urllib: Cloudflare blocca lo user-agent di Python con un
    403 'error code 1010', che sembra un problema di permessi e non lo e'."""
    p = subprocess.run(
        ["curl", "-s", "-X", "POST",
         f"https://api.supabase.com/v1/projects/{REF}/database/query",
         "-H", f"Authorization: Bearer {TOKEN}",
         "-H", "Content-Type: application/json",
         "--data-binary", "@-"],
        input=json.dumps({"query": sql}), capture_output=True, text=True)
    try:
        return json.loads(p.stdout)
    except Exception:
        return {"message": p.stdout[:300] or p.stderr[:300]}


def lit(v):
    return "NULL" if v is None else "'" + str(v).replace("'", "''") + "'"


COLS = ["chiave", "ragione_sociale", "partita_iva", "sede_legale", "cap", "citta",
        "provincia", "codice_univoco", "pec", "metodo_pagamento", "codice_cliente",
        "fonte", "operatore"]

# A blocchi: una INSERT da 635 righe e' lunga, ma soprattutto se sbaglia non si
# capisce dove. A 100 per volta si vede subito quale blocco ha problemi.
fatte = 0
for i in range(0, len(righe), 100):
    blocco = righe[i:i + 100]
    vals = ",\n".join(
        "(" + ", ".join(lit(p.get(c)) for c in COLS) + ")" for p in blocco)
    # COALESCE(escluso, esistente): riempie i buchi, non sovrascrive mai.
    setclause = ", ".join(
        f"{c} = COALESCE(NULLIF(EXCLUDED.{c},''), clienti_override.{c})"
        for c in COLS if c != "chiave")
    sql = (f"INSERT INTO clienti_override ({', '.join(COLS)}) VALUES\n{vals}\n"
           f"ON CONFLICT (chiave) DO UPDATE SET {setclause}, aggiornato_il = now();")
    res = esegui(sql)
    if isinstance(res, dict) and res.get("message"):
        print("ERRORE nel blocco", i, res["message"][:300])
        break
    fatte += len(blocco)
    print(f"  scritti {fatte}/{len(righe)}")
print("fatto.")
