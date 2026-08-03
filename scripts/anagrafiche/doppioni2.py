#!/usr/bin/env python3
"""Doppioni nel registro clienti, seconda passata.

Due liste separate, con due livelli di fiducia diversi:

  A. SICURI  - stessa P.IVA valida E nome che collassa uguale.
     Qui la P.IVA da sola non basta: nel registro c'e' gente con P.IVA
     segnaposto (111111111) e c'e' chi ha per sbaglio la NOSTRA P.IVA. Con la
     sola P.IVA si fondevano Giorgia Immovilli e Silvia Scapigliati, che sono
     due persone diverse. Il nome uguale e' la seconda chiave che serve.

  B. DA GUARDARE - nome identico ma P.IVA diversa o assente.
     Possono essere doppioni veri (uno dei due senza P.IVA) oppure due
     insegne omonime in citta' diverse. Non si toccano: si riportano.
"""
import json, re, unicodedata
from collections import defaultdict
from pathlib import Path

BASE = Path(__file__).parent
master = json.load(open(BASE / "master.json"))
gest = {g["codice_cliente"]: g for g in json.load(open(BASE / "gest.json"))}
mov = json.load(open(BASE / "mov.json"))

# La nostra: se compare come cliente e' un errore di anagrafica, non un doppione.
NOSTRA = "17272011002"


def piva_di(m):
    p = m.get("piva") or (gest.get(m.get("codice_gestionale") or "", {}) or {}).get("piva") or ""
    p = re.sub(r"\D", "", str(p))
    if not p:
        return ""
    nudo = p.lstrip("0")
    if not nudo:
        return ""
    # Segnaposto: una cifra sola ripetuta (000.., 111.., 999..). Non identificano
    # nessuno, e accoppierebbero fra loro clienti che non c'entrano niente.
    if len(set(nudo)) == 1:
        return ""
    if nudo == NOSTRA.lstrip("0"):
        return ""
    return nudo


def norm_nome(s):
    s = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode().upper()
    s = s.split("·")[0]
    for a, b in [
        ("SOCIETA' A RESPONSABILITA' LIMITATA", "SRL"), ("SOCIETA A RESPONSABILITA LIMITATA", "SRL"),
        ("S.R.L.S.", "SRLS"), ("S.R.L.", "SRL"), ("S.P.A.", "SPA"), ("S.A.S.", "SAS"),
        ("S.N.C.", "SNC"), ("&", "E"),
    ]:
        s = s.replace(a, b)
    s = re.sub(r"[^A-Z0-9]", "", s)   # via spazi e punteggiatura: "SHOW FOOD.srl" == "SHOW FOOD S.R.L."
    return s


ordini, ultimo = defaultdict(int), {}
for r in mov:
    c = r.get("id_cliente")
    if not c:
        continue
    ordini[c] += int(r["n"])
    if (r.get("ultimo") or "") > ultimo.get(c, ""):
        ultimo[c] = r.get("ultimo") or ""


def scheda(m):
    c = m["codice"]
    return {"codice": c, "ragione_sociale": m["ragione_sociale"], "origine": m["origine"],
            "citta": m.get("citta") or "", "ordini": ordini.get(c, 0),
            "ultimo_ordine": ultimo.get(c, "")}


def ordina(schede):
    """Piu' movimentata prima: piu' ordini, poi ordine piu' recente, poi il
    codice del gestionale (CLI-), che e' quello che conosce anche il
    commercialista."""
    return sorted(schede, key=lambda x: (
        -x["ordini"],
        -(int(x["ultimo_ordine"].replace("-", "")) if x["ultimo_ordine"] else 0),
        0 if x["codice"].startswith("CLI-") else 1,
        x["codice"],
    ))


per_piva, per_nome = defaultdict(list), defaultdict(list)
for m in master:
    p = piva_di(m)
    if p:
        per_piva[p].append(m)
    per_nome[norm_nome(m["ragione_sociale"])].append(m)

sicuri = []
for p, g in per_piva.items():
    if len(g) < 2:
        continue
    # Seconda chiave: il nome deve collassare uguale per tutti.
    nomi = {norm_nome(m["ragione_sociale"]) for m in g}
    if len(nomi) != 1:
        continue
    s = ordina([scheda(m) for m in g])
    sicuri.append({"piva": p, "tiene": s[0], "elimina": s[1:]})

da_guardare = []
visti = {c["codice"] for r in sicuri for c in [r["tiene"], *r["elimina"]]}
for n, g in per_nome.items():
    if len(g) < 2 or not n:
        continue
    if all(m["codice"] in visti for m in g):
        continue
    s = ordina([scheda(m) for m in g])
    pive = {piva_di(m) for m in g}
    da_guardare.append({"nome": g[0]["ragione_sociale"], "pive": sorted(p for p in pive if p),
                        "candidati": s})

json.dump({"sicuri": sicuri, "da_guardare": da_guardare},
          open(BASE / "doppioni2.json", "w"), ensure_ascii=False, indent=1)

print(f"SICURI (stessa P.IVA valida + stesso nome): {len(sicuri)}")
for r in sicuri:
    t = r["tiene"]
    print(f"  tiene {t['codice']:11} ({t['ordini']} ord)  {t['ragione_sociale'][:40]}")
    for e in r["elimina"]:
        print(f"  togli {e['codice']:11} ({e['ordini']} ord)  {e['ragione_sociale'][:40]}")
print(f"\nDA GUARDARE (nome identico, P.IVA diversa o assente): {len(da_guardare)}")
for r in da_guardare[:25]:
    cod = ", ".join(f"{c['codice']}({c['ordini']})" for c in r["candidati"])
    print(f"  {r['nome'][:38]:40} {cod}  pive={r['pive'] or 'nessuna'}")
if len(da_guardare) > 25:
    print(f"  ... e altri {len(da_guardare) - 25}")
