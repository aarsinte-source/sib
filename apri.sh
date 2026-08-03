#!/bin/bash
# Apre SHEis Studio nel browser. Un comando, nessuna configurazione.
#
#   ./apri.sh
#
# Se il server gira già lo riusa invece di ricostruire. Per fermarlo:
#   lsof -ti tcp:3330 | xargs kill
set -uo pipefail
cd "$(dirname "$0")"

PORTA=3330
URL="http://localhost:$PORTA"

verde()  { printf "\033[32m%s\033[0m\n" "$1"; }
giallo() { printf "\033[33m%s\033[0m\n" "$1"; }
grigio() { printf "\033[2m%s\033[0m\n" "$1"; }

# Già in piedi? Non ricostruire: sarebbe un'attesa inutile — e peggio, `next build`
# rigenera i nomi dei file compilati mentre il processo vecchio serve ancora quelli
# di prima, quindi la pagina si romperebbe a metà.
if curl -s -o /dev/null -m 2 "$URL" 2>/dev/null; then
  verde "SHEis Studio è già acceso."
  echo "  $URL"
  open "$URL" 2>/dev/null || true
  exit 0
fi

echo "Preparo SHEis Studio…"
if [ ! -d node_modules ]; then
  grigio "  installo le dipendenze (solo la prima volta, un paio di minuti)"
  npm install --silent >/dev/null 2>&1
fi

grigio "  compilo…"
if ! npm run build >/tmp/sheis-studio-build.log 2>&1; then
  giallo "La compilazione è fallita. Le ultime righe:"
  tail -15 /tmp/sheis-studio-build.log
  exit 1
fi

nohup npx next start -p "$PORTA" >/tmp/sheis-studio.log 2>&1 &

for _ in $(seq 1 25); do
  curl -s -o /dev/null -m 2 "$URL" 2>/dev/null && break
  sleep 1
done

if ! curl -s -o /dev/null -m 3 "$URL" 2>/dev/null; then
  giallo "Il server non risponde. Log: /tmp/sheis-studio.log"
  tail -12 /tmp/sheis-studio.log
  exit 1
fi

echo
verde "SHEis Studio è acceso."
echo "  $URL"
echo
grigio "  Il database non è ancora inizializzato: le pagine si aprono e dicono cosa manca,"
grigio "  invece di rompersi. Per accenderlo davvero servono due minuti:"
grigio "    export SUPABASE_ACCESS_TOKEN=sbp_...        (supabase.com/dashboard/account/tokens)"
grigio "    python3 ~/alkemia-sheis-backend/applica_migrazioni.py --applica"
echo
grigio "  Per fermarlo:  lsof -ti tcp:$PORTA | xargs kill"
echo

open "$URL" 2>/dev/null || true
