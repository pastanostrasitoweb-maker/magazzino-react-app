#!/usr/bin/env python3
"""Abbina i 646 clienti estratti dalle fatture al registro `clienti_master`.

Regola di prudenza, gia' pagata cara una volta: si abbina sulla PARTITA IVA,
mai su nomi somiglianti. E le P.IVA segnaposto (tutti zeri, o vuote) non
abbinano NIENTE: `ltrim(piva,'0')` le collassa su stringa vuota e allora si
accoppiano con chiunque non abbia P.IVA. La volta scorsa sembravano 1.033
recuperi, erano falsi, il recupero vero era 1.

Secondo giro, solo se la P.IVA non c'e': ragione sociale IDENTICA una volta
normalizzata, e un solo candidato. Se i candidati sono due, si lascia stare.
"""
import json, re, unicodedata
from pathlib import Path

BASE = Path(__file__).parent
fatture = json.load(open(BASE / "anagrafiche_fatture.json"))
master = json.load(open(BASE / "master.json"))
gest = {g["codice_cliente"]: g for g in json.load(open(BASE / "gest.json"))}

SEGNAPOSTO = {"", "00000000000", "0000000000", "000000000"}


def varianti_piva(p):
    """Il gestionale imbottisce di zeri le P.IVA corte (una svizzera di 9 cifre
    diventa 00262930096), la fattura no. Vanno confrontate tutte le forme."""
    p = re.sub(r"\D", "", str(p or ""))
    if not p or p in SEGNAPOSTO or set(p) == {"0"}:
        return set()
    nudo = p.lstrip("0")
    if not nudo:
        return set()
    return {p, nudo, nudo.zfill(11)}


def norm_nome(s):
    s = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode()
    s = s.upper()
    s = s.split("·")[0]
    # Le forme societarie si scrivono in dieci modi: vanno appiattite prima
    # di dire che due nomi sono "identici".
    for a, b in [
        ("SOCIETA' A RESPONSABILITA' LIMITATA", "SRL"), ("S.R.L.S.", "SRLS"),
        ("S.R.L.", "SRL"), ("S.P.A.", "SPA"), ("S.A.S.", "SAS"),
        ("S.N.C.", "SNC"), ("S.S.", "SS"), ("&", "E"),
    ]:
        s = s.replace(a, b)
    s = re.sub(r"[^A-Z0-9 ]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


# Indici del registro
per_piva = {}
per_nome = {}
for m in master:
    piva = m.get("piva") or (gest.get(m.get("codice_gestionale") or "", {}) or {}).get("piva")
    for v in varianti_piva(piva):
        per_piva.setdefault(v, []).append(m)
    per_nome.setdefault(norm_nome(m["ragione_sociale"]), []).append(m)

abbinati, per_nome_soli, orfani, ambigui = [], [], [], []
for f in fatture:
    cand = []
    vs = varianti_piva(f["piva"]) or varianti_piva(f["codice_fiscale"])
    for v in vs:
        for m in per_piva.get(v, []):
            if m not in cand:
                cand.append(m)
    via = "piva"
    if not cand:
        cand = list(per_nome.get(norm_nome(f["denominazione"]), []))
        via = "nome"
    if len(cand) == 1:
        rec = dict(f, codice=cand[0]["codice"], via=via)
        (abbinati if via == "piva" else per_nome_soli).append(rec)
    elif len(cand) > 1:
        ambigui.append(dict(f, codici=[c["codice"] for c in cand], via=via))
    else:
        orfani.append(f)

json.dump({"piva": abbinati, "nome": per_nome_soli, "ambigui": ambigui, "orfani": orfani},
          open(BASE / "abbinamento.json", "w"), ensure_ascii=False, indent=1)

print(f"fatture: {len(fatture)} clienti")
print(f"  abbinati per P.IVA   {len(abbinati):4}  (sicuri)")
print(f"  abbinati per nome    {len(per_nome_soli):4}  (nome identico, un solo candidato)")
print(f"  ambigui              {len(ambigui):4}  (piu' di un candidato: NON si toccano)")
print(f"  non nel registro     {len(orfani):4}")
if ambigui:
    print("\nesempi di ambigui:")
    for a in ambigui[:5]:
        print("  ", a["denominazione"][:44], "->", a["codici"], f"(via {a['via']})")
