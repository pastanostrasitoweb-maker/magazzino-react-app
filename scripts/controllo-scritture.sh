#!/bin/bash
# CONTROLLO SCRITTURE: si gira DOPO aver toccato un trigger o una funzione sugli
# ordini, PRIMA di dire che e' a posto.
#
# Perche' esiste. Il 07/08/2026 ho fermato l'azienda per due ore con due errori
# che le SELECT non potevano vedere:
#   - perso un SECURITY DEFINER, e il trigger leggeva cf_partite che l'utente
#     dell'app non puo' leggere: ogni insert e update su ordini rifiutato
#   - un record letto in un solo ramo e citato sempre nell'INSERT:
#     "record c is not assigned yet", e l'archiviazione moriva
# Da amministratore funzionava tutto, perche' i permessi sono diversi e il ramo
# critico non passava. Bisogna provare a SCRIVERE, e con la chiave dell'app.
#
# Come lo fa senza sporcare niente:
#   1. crea/prepara/spedisce un ordine di prova CON LA CHIAVE ANON, cioe' con gli
#      stessi permessi dell'app: e' il giro che scopre i permessi mancanti
#   2. lo cancella SENZA archiviarlo, cosi' non consuma un numero DDT
#   3. l'archiviazione, che il numero lo consuma, la prova da amministratore
#      dentro una transazione con rollback
#
# Uso:  bash scripts/controllo-scritture.sh

set -u
ORD="ORD-CONTROLLO-$(date +%s)"
URL="https://api.pastanostrasenzaglutine.it"
ANON=$(grep -ho "eyJ[A-Za-z0-9_-]\{20,\}\.[A-Za-z0-9_-]\{20,\}\.[A-Za-z0-9_-]\{10,\}" \
        "$(dirname "$0")/../.env.local" 2>/dev/null | head -1)
TOK=$(security find-generic-password -s "Supabase CLI" -w 2>/dev/null)
ESITO=0

if [ -z "$ANON" ]; then echo "MANCA la chiave anon (.env.local)"; exit 2; fi

# Un cliente vero serve: il trigger del metodo di pagamento parte dal codice
# cliente, e con un codice finto non passerebbe dal pezzo che leggeva cf_partite.
CLI=$(curl -s "$URL/rest/v1/ordini?select=id_cliente&id_cliente=like.CLI-*&limit=1" \
      -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
      | sed -n 's/.*"id_cliente":"\([^"]*\)".*/\1/p')
CLI=${CLI:-CLI-13}

prova() { # nome, risposta
  if echo "$2" | grep -q '"message"'; then
    echo "  FALLITO  $1"
    echo "           $(echo "$2" | head -c 220)"
    ESITO=1
  else
    echo "  ok       $1"
  fi
}

echo "Controllo scritture sugli ordini (cliente di prova: $CLI)"
echo "--- con la chiave dell'app, come fa il magazzino ---"

R=$(curl -s -X POST "$URL/rest/v1/ordini" -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
    -H "Content-Type: application/json" -H "Prefer: return=representation" \
    -d "{\"id_ordine\":\"$ORD\",\"cliente\":\"CONTROLLO AUTOMATICO\",\"id_cliente\":\"$CLI\",\"stato\":\"Da preparare\",\"data_ordine\":\"$(date +%F)\"}")
prova "creare un ordine" "$R"

for STATO in Preparato Spedito; do
  R=$(curl -s -X PATCH "$URL/rest/v1/ordini?id_ordine=eq.$ORD" -H "apikey: $ANON" \
      -H "Authorization: Bearer $ANON" -H "Content-Type: application/json" \
      -H "Prefer: return=representation" -d "{\"stato\":\"$STATO\"}")
  prova "mettere l'ordine in $STATO" "$R"
done

# Via la prova, prima di archiviare: senza archiviazione nessun numero DDT viene
# staccato, quindi non si lascia un buco nella numerazione.
curl -s -X DELETE "$URL/rest/v1/ordini?id_ordine=eq.$ORD" \
     -H "apikey: $ANON" -H "Authorization: Bearer $ANON" > /dev/null
RESTA=$(curl -s "$URL/rest/v1/ordini?select=id_ordine&id_ordine=eq.$ORD" \
        -H "apikey: $ANON" -H "Authorization: Bearer $ANON")
[ "$RESTA" = "[]" ] && echo "  ok       prova cancellata, nessun numero DDT consumato" \
                    || { echo "  ATTENZIONE: la prova $ORD e' rimasta, cancellala a mano"; ESITO=1; }

echo "--- archiviazione, in transazione annullata (consuma un DDT, quindi si annulla) ---"
if [ -n "$TOK" ]; then
  SQL="begin; update ordini set archiviato=true where id_ordine=(select id_ordine from ordini where coalesce(archiviato,false)=false and stato='Preparato' limit 1); rollback;"
  R=$(curl -s -X POST "https://api.supabase.com/v1/projects/wwjgjiybyrrkafymiuew/database/query" \
      -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" \
      -d "$(python3 -c 'import json,sys;print(json.dumps({"query":sys.argv[1]}))' "$SQL")")
  prova "archiviare un ordine" "$R"
else
  echo "  saltato  archiviazione (manca il token amministrativo)"
fi

echo
if [ "$ESITO" = "0" ]; then
  echo "TUTTO A POSTO: si puo' pubblicare."
else
  echo "NON PUBBLICARE: qualcosa non scrive. Guarda il messaggio qui sopra."
fi
exit $ESITO
