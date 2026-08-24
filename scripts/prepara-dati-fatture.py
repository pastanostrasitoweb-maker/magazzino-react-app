# Raccoglie dal database quello che serve a generare le fatture.
# Si lancia prima di genera-fatture-xml.py; scrive /tmp/dati-xml.json.
#
# Sta separato perche' la lettura e' la parte lenta (paginata a mille righe per
# volta): cosi' si puo' rigenerare gli XML piu' volte senza rileggere tutto.
import json, urllib.request, socket, os
socket.setdefaulttimeout(90)
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
env = {}
for line in open(os.path.join(BASE, '.env.local')):
    if '=' in line:
        k, v = line.split('=', 1); env[k.strip()] = v.strip()

def get(p):
    r = urllib.request.Request(env['VITE_SUPABASE_URL'] + '/rest/v1/' + p,
        headers={'apikey': env['VITE_SUPABASE_ANON_KEY'],
                 'Authorization': 'Bearer ' + env['VITE_SUPABASE_ANON_KEY']})
    return json.loads(urllib.request.urlopen(r, timeout=90).read().decode())

def tutte(base):
    """PostgREST taglia a mille righe SENZA dirlo: si pagina sempre.
    E' l'errore che mi ha fatto contare 49 fatture pronte invece di 56."""
    out = []; off = 0
    while True:
        b = get('%s&limit=1000&offset=%d' % (base, off))
        out += b; off += 1000
        if len(b) < 1000: break
    return out

d = {
 'ordini': tutte('ordini?select=id_ordine,ddt_numero,cliente,id_cliente,totale_imponibile,'
                 'campionatura,data_preparato,data_ordine,metodo_pagamento,regime_iva,nota_ddt&archiviato=eq.true'),
 'ov':     tutte('clienti_override?select=ragione_sociale,partita_iva,citta,provincia,cap,sede_legale,'
                 'codice_univoco,pec,codice_cliente,persona_fisica,nome,cognome'),
 'gest':   tutte('clienti_gestionale?select=codice_cliente,ragione_sociale,piva,codice_fiscale,citta,provincia,cap,indirizzo'),
 'righe':  tutte('righe_ordine?select=id_ordine,ordine_riga,descrizione_prodotto,quantita_ordinata,'
                 'prezzo_unitario,sconto_pct,sconto2_pct,sconto3_pct,iva_pct,natura_iva'),
}
json.dump(d, open('/tmp/dati-xml.json', 'w'))
print('letti: ' + ' · '.join('%s %d' % (k, len(v)) for k, v in d.items()))
