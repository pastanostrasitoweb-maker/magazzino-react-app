# Genera le fatture elettroniche (FPR12) dai DDT del magazzino.
#
# COME SI USA
#   1. raccogli i dati:   python3 scripts/prepara-dati-fatture.py
#   2. guarda quante sono: python3 scripts/genera-fatture-xml.py
#   3. genera davvero:     python3 scripts/genera-fatture-xml.py 1653
#      (1653 = il primo numero di fattura libero: guardalo in Sibill, e'
#       l'ultima fattura emessa piu' uno. NON si indovina: un numero doppio o
#       un buco nella serie e' un problema fiscale.)
#
# I file escono in Departments/amministrazione/allegati/fatture-xml/ del vault,
# uno per fattura, pronti da trascinare in Sibill.
#
# COSA PRENDE E COSA SCARTA
#   prende  i DDT archiviati dal 03/08/2026, esclusi Elior (fatturati a parte)
#           e le campionature gratuite (imponibile zero: niente da fatturare)
#   scarta  chi non ha identita' (P.IVA per le aziende, codice fiscale a 16
#           caratteri per i privati), chi non ha citta' e provincia, chi non ha
#           un metodo di pagamento da cui ricavare la scadenza, e chi con
#           l'abbuono manderebbe un'aliquota sotto zero.
#   Ogni scarto viene stampato con il motivo: non sparisce in silenzio.
#
# Il modello e' la fattura 1583 gia' emessa: stesso cedente, stesso IBAN,
# TD24 differita col riferimento al DDT.

# Il modello e' la fattura 1583 gia' emessa: stessa struttura, stesso cedente,
# stesso IBAN. Quello che cambia e' il cliente, le righe e il numero.
import json, re, sys, os
from datetime import date, timedelta
from xml.sax.saxutils import escape

DA_NUMERO = int(sys.argv[1]) if len(sys.argv) > 1 else None
DEST = '/Users/lucadelfanti/Desktop/AI /Second Brain/Departments/amministrazione/allegati/fatture-xml'
d = json.load(open('/tmp/dati-xml.json'))
norm = lambda s: re.sub(r'\D', '', str(s or ''))
ELIOR = {'1887','1888','1889','1890'}

ov_cod = {c['codice_cliente']: c for c in d['ov'] if c.get('codice_cliente')}
ov_nome = {(c.get('ragione_sociale') or '').strip().lower(): c for c in d['ov']}
g_cod = {'CLI-' + str(g['codice_cliente']): g for g in d['gest']}
g_nome = {}
for g in d['gest']:
    g_nome.setdefault((g.get('ragione_sociale') or '').strip().lower(), []).append(g)
per = {}
for r in d['righe']:
    per.setdefault(r['id_ordine'], []).append(r)



def spezza_nome(intero, nome, cognome):
    """Nome e cognome separati. Se non sono stati scritti a mano si spezza il
    nome intero, ma e' un ripiego: 'Maria Teresa De Luca' non si indovina."""
    if nome and cognome: return nome, cognome, False
    pezzi = [p for p in re.split(r'\s+', str(intero or '').strip()) if p]
    if len(pezzi) < 2: return (intero or 'N.D.'), 'N.D.', True
    return ' '.join(pezzi[:-1]), pezzi[-1], True

def anagrafica_cliente(a):
    if not a['persona']:
        return ('<IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>%s</IdCodice></IdFiscaleIVA>'
                '<CodiceFiscale>%s</CodiceFiscale>'
                '<Anagrafica><Denominazione>%s</Denominazione></Anagrafica></DatiAnagrafici>'
                % (a['piva'], a['cf'] or a['piva'], escape(a['denom'][:80])))
    nome, cognome, dedotto = spezza_nome(a['denom'], a['nome'], a['cognome'])
    a['nome_dedotto'] = dedotto
    # Niente IdFiscaleIVA: una persona senza partita IVA non ce l'ha, e metterla
    # uguale al codice fiscale e' proprio l'errore che fa scartare la fattura.
    return ('<CodiceFiscale>%s</CodiceFiscale>'
            '<Anagrafica><Nome>%s</Nome><Cognome>%s</Cognome></Anagrafica></DatiAnagrafici>'
            % (a['cf'], escape(nome[:60]), escape(cognome[:60])))

def cf_valido(cf, piva_a, piva_g):
    c = re.sub(r'[^A-Za-z0-9]', '', str(cf or '')).upper()
    if re.fullmatch(r'\d{11}', c) or re.fullmatch(r'[A-Z0-9]{16}', c):
        return c
    return norm(piva_a) or norm(piva_g)

def solo_via(testo, cap, citta, prov):
    """Toglie dalla via quello che sta gia' nei campi CAP, comune e provincia."""
    t = ' '.join(str(testo or '').split())
    for pezzo in [str(cap or ''), str(citta or ''), str(prov or '')]:
        if pezzo:
            t = re.sub(r'[\s,;.\-–]*\(?' + re.escape(pezzo) + r'\)?\s*$', '', t, flags=re.I)
            t = re.sub(r'[\s,;.\-–]*\(?' + re.escape(pezzo) + r'\)?(?=[\s,;.\-–]|$)', ' ', t, flags=re.I)
    t = re.sub(r'\b(italia|italy)\b', '', t, flags=re.I)
    t = re.sub(r'\s{2,}', ' ', t).strip(' ,;.-–')
    return t or 'N.D.'

def anagrafica(o):
    nome = (o['cliente'] or '').split('·')[0].strip()
    a = ov_cod.get(o.get('id_cliente')) or ov_nome.get(nome.lower()) or {}
    g = g_cod.get(o.get('id_cliente')) or {}
    if not g:
        cand = g_nome.get(nome.lower()) or [c for c in d['gest']
               if (c.get('ragione_sociale') or '').strip().lower().startswith(nome.lower()) and len(nome) >= 5]
        if len(cand) == 1: g = cand[0]
    sib = SIBILL.get(norm(a.get('partita_iva')) or norm(g.get('piva'))) or {}
    return {
        'sdi_sibill': (sib.get('sdi') or '').strip(),
        'denom': a.get('ragione_sociale') or g.get('ragione_sociale') or nome,
        'piva':  norm(a.get('partita_iva')) or norm(g.get('piva')),
        # IL CODICE FISCALE HA LE LETTERE (Luca 22/08/2026: "come se fosse
        # troncato, ci sono solo i numeri, non ha riportato la parte iniziale
        # che e' letterale"). Il CF di una persona e' alfanumerico
        # (RNDPQL70T14Z401F): passarlo dalla funzione che tiene solo le cifre lo
        # riduceva a 7014401, e lo SDI scarta la fattura. Si tiene com'e', in
        # maiuscolo; vale se e' 11 cifre (societa') o 16 alfanumerico (persona),
        # altrimenti si ripiega sulla partita IVA.
        'cf':    cf_valido(g.get('codice_fiscale'), a.get('partita_iva'), g.get('piva')),
        # L'INDIRIZZO E' SOLO LA VIA. Nei nostri dati la sede legale e' spesso
        # scritta per esteso ("via Laurito, 2 - 84017 Positano Italia") e cosi'
        # finiva tale e quale nel campo Indirizzo, con CAP, comune e nazione
        # ripetuti due volte nella stessa fattura (Luca 22/08/2026, sul Positano).
        'via':   solo_via(a.get('sede_legale') or g.get('indirizzo') or '',
                          a.get('cap') or g.get('cap'), a.get('citta') or g.get('citta'),
                          a.get('provincia') or g.get('provincia')),
        'cap':   norm(a.get('cap') or g.get('cap'))[:5],
        'citta': (a.get('citta') or g.get('citta') or '').strip(),
        'prov':  (a.get('provincia') or g.get('provincia') or '').strip()[:2],
        'sdi':   (a.get('codice_univoco') or '').strip(),
        'pec':   (a.get('pec') or '').strip(),
        # UNA PERSONA NON E' UN'AZIENDA (Luca 22/08/2026). La fattura elettronica
        # a un privato vuole Nome e Cognome separati al posto della Denominazione
        # e NON vuole la partita IVA, solo il codice fiscale: mandarla come
        # azienda non e' impreciso, e' scartato dallo SDI.
        'persona': bool(a.get('persona_fisica')),
        'nome':    (a.get('nome') or '').strip(),
        'cognome': (a.get('cognome') or '').strip(),
    }

# mezzo di pagamento -> codice della fattura elettronica
def modalita(metodo):
    m = (metodo or '').lower()
    if 'contrassegno' in m and 'assegn' in m: return 'MP02'
    if 'contrassegno' in m:                   return 'MP01'
    if 'ri.ba' in m or 'riba' in m:           return 'MP12'
    if 'assegn' in m:                         return 'MP02'
    if 'carta' in m or 'pos' in m:            return 'MP08'
    return 'MP05'   # bonifico

def scadenza(metodo, data_doc):
    y, mth, dd = (int(x) for x in data_doc.split('-'))
    base = date(y, mth, dd)
    m = (metodo or '').lower()
    gg = 0
    mg = re.search(r'(\d+)\s*gg', m)
    if mg: gg = int(mg.group(1))
    if 'anticipat' in m or 'contrassegno' in m or 'consegna' in m: return base.isoformat()
    if 'fine mese' in m:
        y2, m2 = (base.year + 1, 1) if base.month == 12 else (base.year, base.month + 1)
        fine = date(y2, m2, 1) - timedelta(days=1)
        return (fine + timedelta(days=gg)).isoformat()
    return (base + timedelta(days=gg)).isoformat()

CANONICI = ('contrassegno contanti','contrassegno assegno','assegno','carta di credito','carta / pos')
def canonico(m):
    t = (m or '').strip().lower()
    if not t: return False
    if t in CANONICI: return True
    import re as _re
    # <mezzo> <giorni> gg <data fattura|fine mese>
    return bool(_re.match(r'^(ri\.?ba\.?|bonifico)\s+(anticipato|alla consegna|fine mese|\d+\s*gg\s+(data fattura|fine mese))$', t))

def metodo_cliente(o, a):
    c = ov_cod.get(o.get('id_cliente')) or ov_nome.get((a['denom'] or '').strip().lower()) or {}
    return (c.get('metodo_pagamento') or '').strip()

scartati = []
METODI = json.load(open('/tmp/metodi.json')) if os.path.exists('/tmp/metodi.json') else {}
SIBILL = json.load(open('/tmp/sdi-sibill.json')) if os.path.exists('/tmp/sdi-sibill.json') else {}
def sel():
    out = []
    for o in d['ordini']:
        data = (o['data_preparato'] or o['data_ordine'] or '')[:10]
        n = str(o['ddt_numero'] or '').strip()
        imp = float(o['totale_imponibile'] or 0)
        if not data or data < '2026-08-03' or not n: continue
        if (o['campionatura'] and imp == 0) or n in ELIOR: continue
        a = anagrafica(o)
        if a['persona']:
            # a un privato serve il CODICE FISCALE (16 caratteri), non la P.IVA
            if not re.fullmatch(r'[A-Z0-9]{16}', (a['cf'] or '').upper()): continue
        elif len(a['piva']) != 11:
            continue
        if not a['citta'] or not a['prov']: continue
        # IL METODO DI PAGAMENTO DEVE DIRE QUANDO SI INCASSA.
        # Sull'ordine puo' non esserci: vale quello dell'anagrafica del cliente,
        # come nel magazzino. Ma se non e' una forma leggibile (es. "Da
        # concordare" di Rossano Telesca) la fattura NON si genera: metterci
        # dentro una scadenza inventata e' peggio che non emetterla.
        # La forma canonica la decide il database (metodo_pagamento_canonico),
        # che sa leggere anche le scritture vecchie: "Ri.Ba 30gg FM",
        # "Bonifico bancario a 30gg DF", "CONTRASSEGNO". Una regola sola, in un
        # posto solo: la mia copia in python sbagliava a scartarne cinque buone.
        met = (METODI.get(n) or {}).get('canonico') or ''
        if not met:
            scartati.append((n, a['denom'], (METODI.get(n) or {}).get('effettivo') or '(vuoto)'))
            continue
        o = dict(o); o['metodo_pagamento'] = met
        out.append((data, n, o, a))
    out.sort(key=lambda r: (r[0], int(r[1])))
    return out

def q(v, dec=2):
    return ('%.' + str(dec) + 'f') % round(float(v or 0) + 1e-9, dec)

def fattura(numero, data_doc, o, a, righe):
    prog = '%05d' % (numero % 100000)
    # IL RECAPITO: prima quello del magazzino, poi quello che SIBILL gia' conosce.
    # Sibill ha il codice destinatario di 507 clienti: se ce l'ha lui e noi no,
    # e' comunque il recapito giusto, ed e' quello con cui le fatture di quel
    # cliente sono gia' arrivate.
    cand = a['sdi'] if re.fullmatch(r'[A-Za-z0-9]{7}', a['sdi'] or '') and a['sdi'] != '0000000' else ''
    if not cand and re.fullmatch(r'[A-Za-z0-9]{7}', a.get('sdi_sibill') or '') and a['sdi_sibill'] != '0000000':
        cand = a['sdi_sibill']
    dest = cand or (a['sdi'] if re.fullmatch(r'[A-Za-z0-9]{7}', a['sdi'] or '') else '0000000')
    pec = a['pec'] if dest == '0000000' and a['pec'] else ''
    L = []
    imponibili = {}
    for i, r in enumerate(sorted(righe, key=lambda x: x['ordine_riga'] or 0), 1):
        qta = float(r['quantita_ordinata'] or 0); pu = float(r['prezzo_unitario'] or 0)
        sc = [float(r.get(k) or 0) for k in ('sconto_pct','sconto2_pct','sconto3_pct')]
        netto = qta * pu
        for s in sc: netto *= (1 - s/100)
        al = float(r['iva_pct'] or 0)
        imponibili.setdefault(al, 0.0)
        imponibili[al] += netto
        sconti = ''.join(
            '<ScontoMaggiorazione><Tipo>SC</Tipo><Percentuale>%s</Percentuale></ScontoMaggiorazione>' % q(s)
            for s in sc if s)
        L.append(
            '<DettaglioLinee><NumeroLinea>%d</NumeroLinea>'
            '<Descrizione>%s</Descrizione><Quantita>%s</Quantita>'
            '<PrezzoUnitario>%s</PrezzoUnitario>%s<PrezzoTotale>%s</PrezzoTotale>'
            '<AliquotaIVA>%s</AliquotaIVA></DettaglioLinee>'
            % (i, escape((r['descrizione_prodotto'] or '').strip()[:1000]), q(qta,2), q(pu,4), sconti, q(netto), q(al)))
    # LA RIGA DESCRITTIVA RESTA SUL DDT E NON ENTRA IN FATTURA (Luca
    # 22/08/2026: "ok nel DDT ma nella fattura la riga descrittiva deve
    # scomparire"). E' un'istruzione per chi consegna ("accettare il titolo cosi'
    # come rilasciato dal cliente"): serve al corriere, non al commercialista, e
    # in fattura obbligava a inventarle un'aliquota o una natura IVA.
    # UN'ALIQUOTA NON PUO' ANDARE SOTTO ZERO. L'abbuono e' una riga negativa
    # (Luca 22/08/2026): se su un'aliquota toglie piu' di quanto c'e', il
    # riepilogo IVA uscirebbe negativo e la fattura non sta in piedi. Meglio non
    # generarla e dirlo, che mandarla e vedersela tornare indietro.
    negative = [al for al, v in imponibili.items() if v < 0]
    if negative:
        raise ValueError('aliquota %s sotto zero: l abbuono supera la merce' %
                         ', '.join(q(a) for a in negative))
    riep = ''.join(
        '<DatiRiepilogo><AliquotaIVA>%s</AliquotaIVA><ImponibileImporto>%s</ImponibileImporto>'
        '<Imposta>%s</Imposta><EsigibilitaIVA>I</EsigibilitaIVA></DatiRiepilogo>'
        % (q(al), q(v), q(v*al/100)) for al, v in sorted(imponibili.items()))
    tot = sum(v*(1+al/100) for al, v in imponibili.items())
    metodo = o.get('metodo_pagamento') or ''
    scad = scadenza(metodo, data_doc)
    x = ['<?xml version="1.0" encoding="UTF-8"?>',
      '<p:FatturaElettronica versione="FPR12" xmlns:p="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2">',
      '<FatturaElettronicaHeader><DatiTrasmissione>',
      '<IdTrasmittente><IdPaese>IT</IdPaese><IdCodice>17272011002</IdCodice></IdTrasmittente>',
      '<ProgressivoInvio>%s</ProgressivoInvio><FormatoTrasmissione>FPR12</FormatoTrasmissione>' % prog,
      '<CodiceDestinatario>%s</CodiceDestinatario>' % dest,
      ('<PECDestinatario>%s</PECDestinatario>' % escape(pec)) if pec else '',
      '</DatiTrasmissione>',
      '<CedentePrestatore><DatiAnagrafici>',
      '<IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>17272011002</IdCodice></IdFiscaleIVA>',
      '<CodiceFiscale>17272011002</CodiceFiscale>',
      '<Anagrafica><Denominazione>GLUTEN FREE EXPERIENCE SRL</Denominazione></Anagrafica>',
      '<RegimeFiscale>RF01</RegimeFiscale></DatiAnagrafici>',
      '<Sede><Indirizzo>LUNGOTEVERE PORTUENSE 150</Indirizzo><CAP>00151</CAP>',
      '<Comune>ROMA</Comune><Provincia>RM</Provincia><Nazione>IT</Nazione></Sede></CedentePrestatore>',
      '<CessionarioCommittente><DatiAnagrafici>',
      anagrafica_cliente(a),
      '<Sede><Indirizzo>%s</Indirizzo><CAP>%s</CAP><Comune>%s</Comune><Provincia>%s</Provincia><Nazione>IT</Nazione></Sede>'
        % (escape(a['via'][:60] or 'N.D.'), a['cap'] or '00000', escape(a['citta'][:60]), a['prov']),
      '</CessionarioCommittente></FatturaElettronicaHeader>',
      '<FatturaElettronicaBody><DatiGenerali>',
      '<DatiGeneraliDocumento><TipoDocumento>TD24</TipoDocumento><Divisa>EUR</Divisa>',
      '<Data>%s</Data><Numero>%d</Numero><ImportoTotaleDocumento>%s</ImportoTotaleDocumento>' % (data_doc, numero, q(tot)),
      '</DatiGeneraliDocumento>',
      '<DatiDDT><NumeroDDT>%s</NumeroDDT><DataDDT>%s</DataDDT></DatiDDT>' % (escape(str(o['ddt_numero'])), data_doc),
      '</DatiGenerali>',
      '<DatiBeniServizi>', ''.join(L), riep, '</DatiBeniServizi>',
      '<DatiPagamento><CondizioniPagamento>TP02</CondizioniPagamento>',
      '<DettaglioPagamento><ModalitaPagamento>%s</ModalitaPagamento>' % modalita(metodo),
      '<DataRiferimentoTerminiPagamento>%s</DataRiferimentoTerminiPagamento>' % data_doc,
      '<DataScadenzaPagamento>%s</DataScadenzaPagamento>' % scad,
      '<ImportoPagamento>%s</ImportoPagamento>' % q(tot),
      '<IstitutoFinanziario>BANCA SELLA SPA</IstitutoFinanziario>',
      '<IBAN>IT39Z0326879720052797101910</IBAN><ABI>03268</ABI><CAB>79720</CAB>',
      '</DettaglioPagamento></DatiPagamento></FatturaElettronicaBody></p:FatturaElettronica>']
    return ''.join(x), tot

if __name__ == '__main__':
    doc = sel()
    if scartati:
        print('NON generate perche' + chr(39) + ' il pagamento non dice quando si incassa:')
        for n_, c_, m_ in scartati: print('   DDT %-5s %-34s metodo: %s' % (n_, c_[:32], m_))
        print()
    if DA_NUMERO is None:
        print('Servono %d numeri di fattura. Rilancia con il numero di partenza.' % len(doc))
        for data, n, o, a in doc[:5]:
            print('   DDT %-5s %s  %s' % (n, data, a['denom'][:34]))
        sys.exit(0)
    os.makedirs(DEST, exist_ok=True)
    tot_gen = 0.0
    num = DA_NUMERO
    elenco = []
    scartate = []
    for data, n, o, a in doc:
        try:
            xml, tot = fattura(num, data, o, a, per.get(o['id_ordine'], []))
        except ValueError as e:
            scartate.append((n, a['denom'][:30], str(e)))
            continue
        nome = 'IT17272011002_%s.xml' % (('00000' + str(num))[-5:])
        open(os.path.join(DEST, nome), 'w', encoding='utf-8').write(xml)
        elenco.append((num, n, data, a['denom'][:32], tot, nome))
        tot_gen += tot; num += 1
    print('generate %d fatture, numeri da %d a %d, totale %.2f EUR' % (len(elenco), DA_NUMERO, num-1, tot_gen))
    if scartate:
        print('NON generate perche' + chr(39) + ' un aliquota andrebbe sotto zero:')
        for x in scartate: print('   DDT %-5s %-32s %s' % x)
    for e in elenco[:8]:
        print('   n.%-5s DDT %-5s %s  %-34s %9.2f  %s' % e)
    print('   ...')
    open('/tmp/elenco-xml.json','w').write(json.dumps(elenco))
