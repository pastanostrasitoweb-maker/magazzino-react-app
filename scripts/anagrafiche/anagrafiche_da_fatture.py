#!/usr/bin/env python3
"""Estrae l'anagrafica dei CLIENTI dagli XML delle fatture emesse.

La fattura elettronica e' la fonte piu' affidabile che abbiamo: quello che c'e'
dentro e' quello che e' stato davvero emesso e accettato dallo SdI. Contiene
esattamente i campi che ci mancano e che il gestionale non ci da':
indirizzo completo, CAP, comune, provincia, codice destinatario SdI, PEC.

Prende solo le EMESSE (noi -> cliente): nelle ricevute il cessionario siamo noi.
Quando lo stesso cliente compare su piu' fatture vince la PIU' RECENTE: se ha
cambiato sede, sull'ultima fattura c'e' quella nuova.
"""
import json, re, sys
from pathlib import Path
from xml.etree import ElementTree as ET

BASE = Path.home() / "Desktop/sibill-export/xml"
OUT = Path(__file__).parent / "anagrafiche_fatture.json"

# La nostra P.IVA: serve a riconoscere le emesse e a non prenderci per clienti.
NOSTRA_PIVA = "17272011002"


def testo(nodo, *percorsi):
    """Primo valore non vuoto fra i percorsi dati. Ignora i namespace."""
    for p in percorsi:
        el = nodo.find(p)
        if el is not None and (el.text or "").strip():
            return el.text.strip()
    return ""


def senza_ns(xml_bytes):
    """Gli XML SdI a volte hanno il namespace, a volte no, a volte con prefisso
    diverso. Toglierlo prima del parse costa poco ed evita tre varianti di
    percorso per ogni campo."""
    s = xml_bytes.decode("utf-8", errors="ignore")
    s = re.sub(r'\sxmlns(:\w+)?="[^"]*"', "", s, count=0)
    s = re.sub(r"<(/?)(\w+):", r"<\1", s)
    return s


clienti = {}
letti = errori = 0

for f in sorted(BASE.rglob("*.xml")):
    # Le ricevute stanno in cartelle 'ricevute': li' il cliente siamo noi.
    if "ricevut" in str(f).lower():
        continue
    try:
        root = ET.fromstring(senza_ns(f.read_bytes()))
    except Exception:
        errori += 1
        continue
    letti += 1

    header = root.find(".//FatturaElettronicaHeader")
    if header is None:
        continue

    ced = header.find("CedentePrestatore/DatiAnagrafici")
    piva_ced = testo(ced, "IdFiscaleIVA/IdCodice") if ced is not None else ""
    # Se il cedente non siamo noi, e' una ricevuta finita nel posto sbagliato.
    if piva_ced.replace("IT", "") != NOSTRA_PIVA:
        continue

    ces = header.find("CessionarioCommittente")
    if ces is None:
        continue
    anag = ces.find("DatiAnagrafici")
    sede = ces.find("Sede")
    if anag is None:
        continue

    piva = testo(anag, "IdFiscaleIVA/IdCodice")
    cf = testo(anag, "CodiceFiscale")
    denom = testo(anag, "Anagrafica/Denominazione")
    if not denom:
        nome = testo(anag, "Anagrafica/Nome")
        cogn = testo(anag, "Anagrafica/Cognome")
        denom = (f"{nome} {cogn}").strip()
    chiave = (piva or cf or denom).strip().upper()
    if not chiave:
        continue

    data = testo(root, ".//DatiGeneraliDocumento/Data")
    numero_civico = testo(sede, "NumeroCivico") if sede is not None else ""
    indirizzo = testo(sede, "Indirizzo") if sede is not None else ""
    if numero_civico and numero_civico.lower() not in indirizzo.lower():
        indirizzo = f"{indirizzo} {numero_civico}".strip()

    rec = {
        "chiave": chiave,
        "denominazione": denom,
        "piva": piva,
        "codice_fiscale": cf,
        "indirizzo": indirizzo,
        "cap": testo(sede, "CAP") if sede is not None else "",
        "citta": testo(sede, "Comune") if sede is not None else "",
        "provincia": testo(sede, "Provincia") if sede is not None else "",
        "nazione": (testo(sede, "Nazione") if sede is not None else "") or "IT",
        "codice_sdi": testo(root, ".//DatiTrasmissione/CodiceDestinatario"),
        "pec": testo(root, ".//DatiTrasmissione/PECDestinatario"),
        "pagamento": testo(root, ".//DatiPagamento/DettaglioPagamento/ModalitaPagamento"),
        "condizioni_pagamento": testo(root, ".//DatiPagamento/CondizioniPagamento"),
        "data": data,
        "fatture": 1,
    }

    vecchio = clienti.get(chiave)
    if vecchio is None:
        clienti[chiave] = rec
    else:
        vecchio["fatture"] += 1
        # Vince la fattura piu' recente: se ha cambiato sede, e' quella giusta.
        if rec["data"] > vecchio["data"]:
            n = rec["fatture"] = vecchio["fatture"]
            clienti[chiave] = rec
            rec["fatture"] = n

json.dump(list(clienti.values()), open(OUT, "w"), ensure_ascii=False, indent=1)
print(f"XML emessi letti: {letti} (illeggibili: {errori})")
print(f"clienti distinti: {len(clienti)}")
pieni = lambda k: sum(1 for c in clienti.values() if c[k])
for k in ("indirizzo", "cap", "citta", "provincia", "piva", "codice_sdi", "pec", "pagamento"):
    print(f"  {k:22} {pieni(k):5} / {len(clienti)}")
