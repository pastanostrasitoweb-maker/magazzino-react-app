#!/bin/bash
# Imposta la password dell'utenza 'produzione' del Magazzino 2.0 (tablet di reparto).
# Generata l'08/09/2026 mentre il progetto era in sola lettura per il blocco egress:
# si lancia appena il database torna scrivibile.
set -euo pipefail
# LA PASSWORD NON STA QUI. Questo file e' tracciato da git e finisce su GitHub:
# una password dentro un repo e' una password bruciata. Si legge dal registro
# accessi, che vive solo su questo computer ed e' nel .gitignore del vault.
REG="$HOME/Desktop/AI/Second Brain/Context/accessi/registro-accessi.md"
PW=$(grep -o '`Pro-[A-Za-z0-9]*`' "$REG" | head -1 | tr -d '`')
if [ -z "$PW" ]; then
  echo "Non trovo la password nel registro accessi ($REG, riga dell'utenza produzione)."; exit 1
fi
TOKEN=$(security find-generic-password -s "Supabase CLI" -w)
Q() { curl -s -X POST "https://api.supabase.com/v1/projects/wwjgjiybyrrkafymiuew/database/query" \
        -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" --data-binary @-; }

echo "1. il database accetta scritture?"
if Q <<< '{"query":"select current_setting('"'"'default_transaction_read_only'"'"') as ro"}' | grep -q '"ro":"on"'; then
  echo "   NO: ancora in sola lettura. Sbloccare il progetto e rilanciare."; exit 1
fi

echo "2. imposto la password"
python3 - "$PW" <<'PY' | Q
import json, sys
print(json.dumps({"query": "update app_utenti set password = crypt('%s', gen_salt('bf')) where username = 'produzione' returning username" % sys.argv[1]}))
PY

echo "3. provo l'accesso come farebbe il tablet (chiave dell'app, non amministratore)"
K=$(grep -o "eyJ[A-Za-z0-9._-]*" ~/.config/gfe/supabase.env | head -1)
curl -s -X POST "https://wwjgjiybyrrkafymiuew.supabase.co/rest/v1/rpc/verify_login" \
  -H "apikey: $K" -H "Authorization: Bearer $K" -H "Content-Type: application/json" \
  -d "{\"p_username\":\"produzione\",\"p_password\":\"$PW\"}"
echo
echo "Se sopra non si legge un accesso riuscito, la password NON e' buona: non consegnarla al reparto."
