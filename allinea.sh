#!/bin/bash
# Riallinea SIB con i cinque repository locali e lo manda su GitHub.
#
# PERCHÉ ESISTE
# I cinque repo restano separati sul portatile: hanno storie diverse, si
# deployano in posti diversi, e tenerli separati significa poter lavorare su
# uno senza toccare gli altri. SIB è la loro copia unica su GitHub: serve ad
# avere lo storico fuori dal Mac e a poter ricostruire tutto da zero.
#
# ⚠️ COME SI VERIFICA L'ALLINEAMENTO, E PERCHÉ NON COME PRIMA
# La prima versione si fidava del codice d'uscita di `git subtree pull` e, in
# caso di dubbio, guardava se la cartella del monorepo fosse "sporca". Misurato
# il 2026-08-04: `subtree pull` falliva, la cartella restava pulita — perché il
# pull non era avvenuto — e lo script dichiarava «già allineato». Cinque repo
# su cinque davano il via libera mentre su GitHub non era arrivato niente.
#
# Un controllo che può dire «a posto» quando non lo è, è peggio di nessun
# controllo: toglie a chi guarda il motivo di andare a verificare.
#
# Ora si confrontano gli ALBERI DI FILE, che è l'unica cosa che non può mentire:
# se il contenuto della cartella nel monorepo differisce da quello del repo
# sorgente, non è allineato — qualunque cosa dica git.
#
#   ./allinea.sh            allinea e spinge
#   ./allinea.sh --locale   allinea e basta, non spinge
set -uo pipefail
cd "$(dirname "$0")"

REPO=(studio workers backend ads outreach)
SPINGI=1
[ "${1:-}" = "--locale" ] && SPINGI=0

echo "SIB — allineamento"
problemi=0
qualcosa_cambiato=0

# Vero se il contenuto della sottocartella differisce dal repo sorgente.
# Si confronta il contenuto, non lo stato di git: è ciò che finisce su GitHub.
differisce() {
  local sorgente="$1" prefisso="$2"
  diff -rq \
    --exclude='.git' --exclude='__pycache__' --exclude='node_modules' \
    --exclude='.next' --exclude='venv' --exclude='*.pyc' --exclude='*.log' \
    --exclude='.env' --exclude='.env.*' --exclude='tsconfig.tsbuildinfo' \
    "$sorgente" "$prefisso" >/dev/null 2>&1
  [ $? -ne 0 ]
}

for r in "${REPO[@]}"; do
  sorgente="$HOME/alkemia-sheis-$r"
  if [ ! -d "$sorgente/.git" ]; then
    echo "  ✗ $r: non è un repository ($sorgente)"
    problemi=$((problemi + 1)); continue
  fi

  # ⚠️ Un repo con modifiche non committate viene SALTATO, non committato al
  # posto di chi ci sta lavorando: portare dentro un lavoro a metà significa
  # spingere su GitHub uno stato che non compila.
  if [ -n "$(cd "$sorgente" && git status --porcelain)" ]; then
    echo "  ⏭  $r: modifiche non committate, salto"
    problemi=$((problemi + 1)); continue
  fi

  if ! differisce "$sorgente" "$r"; then
    echo "  · $r già allineato"
    continue
  fi

  ramo="$(cd "$sorgente" && git branch --show-current)"
  git subtree pull --prefix="$r" "$sorgente" "$ramo" -q -m "allinea $r" >/dev/null 2>&1 || true

  # Si riverifica sul contenuto: se il pull non ha fatto il suo mestiere, qui
  # si vede. È il controllo che la versione precedente non aveva.
  if differisce "$sorgente" "$r"; then
    echo "  ✗ $r: allineamento NON riuscito — il contenuto differisce ancora"
    echo "      prova a mano: git subtree pull --prefix=$r $sorgente $ramo"
    problemi=$((problemi + 1))
  else
    echo "  ✓ $r allineato"
    qualcosa_cambiato=1
  fi
done

if [ "$SPINGI" = "1" ]; then
  echo
  locale="$(git rev-parse HEAD)"
  GIT_TERMINAL_PROMPT=0 git push -q origin main 2>&1 | tail -2
  GIT_TERMINAL_PROMPT=0 git fetch -q origin 2>/dev/null
  remoto="$(git rev-parse origin/main 2>/dev/null || echo '')"
  if [ "$locale" = "$remoto" ]; then
    echo "  ✓ github.com/aarsinte-source/sib è alla pari ($(git log --oneline | wc -l | xargs) commit)"
  else
    echo "  ✗ GitHub NON è alla pari: locale $(echo $locale | cut -c1-7), remoto $(echo ${remoto:-nessuno} | cut -c1-7)"
    problemi=$((problemi + 1))
  fi
fi

echo
if [ "$problemi" -gt 0 ]; then
  echo "  $problemi problemi (vedi sopra)."
  exit 1
fi
echo "  tutto allineato."
