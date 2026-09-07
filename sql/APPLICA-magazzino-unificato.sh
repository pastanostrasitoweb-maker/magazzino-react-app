#!/bin/bash
# Applica l'unificazione del magazzino fra codici gemelli.
# Preparato il 07/09/2026 mentre il progetto era bloccato in sola lettura
# (402 exceed_egress_quota): si lancia appena il database torna scrivibile.
set -euo pipefail
cd "$(dirname "$0")"
TOKEN=$(security find-generic-password -s "Supabase CLI" -w)
Q() { curl -s -X POST "https://api.supabase.com/v1/projects/wwjgjiybyrrkafymiuew/database/query" \
        -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" --data-binary @-; }

echo "1. il database accetta scritture?"
if Q <<< '{"query":"select current_setting(''default_transaction_read_only'') as ro"}' | grep -q '"ro":"on"'; then
  echo "   NO: e' ancora in sola lettura. Sbloccare il progetto e rilanciare."; exit 1
fi

echo "2. applico la struttura e le coppie"
python3 -c "import json;print(json.dumps({'query': open('un_magazzino_due_listini.sql').read()}))" | Q

echo "3. com'e' andata"
Q <<'SQL'
{"query": "select (select count(*) from prodotti where stock_di is not null) as codici_legati, (select count(*) from lotti_archiviati_motivo) as lotti_messi_da_parte, (select string_agg(codice_commerciale || ' vede ' || codice_magazzino || ' (' || giacenza_condivisa || ')', ' · ') from v_articoli_stock_condiviso) as esito"}
SQL
