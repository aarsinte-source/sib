#!/bin/bash
# Riallinea SIB con i cinque repository locali e lo manda su GitHub.
#
# PERCHÉ ESISTE
# I cinque repo restano separati sul portatile: hanno storie diverse, si
# deployano in posti diversi, e tenerli separati significa poter lavorare su
# uno senza toccare gli altri. SIB è la loro copia unica su GitHub: serve ad
# avere lo storico fuori dal Mac e a poter ricostruire tutto da zero.
#
# `git subtree pull` porta dentro i commit nuovi mantenendo la storia di
# ciascuno. Non è un `cp -r`: se lo fosse, ogni allineamento cancellerebbe la
# storia e il repository diventerebbe una fotografia invece che un archivio.
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

for r in "${REPO[@]}"; do
  sorgente="$HOME/alkemia-sheis-$r"
  if [ ! -d "$sorgente/.git" ]; then
    echo "  ✗ $r: non è un repository ($sorgente)"
    problemi=$((problemi + 1))
    continue
  fi

  # ⚠️ Un repo con modifiche non committate viene SALTATO, non committato al
  # posto di chi ci sta lavorando. Portare dentro un lavoro a metà significa
  # spingere su GitHub uno stato che non compila.
  if [ -n "$(cd "$sorgente" && git status --porcelain)" ]; then
    echo "  ⏭  $r: ci sono modifiche non committate, salto"
    problemi=$((problemi + 1))
    continue
  fi

  ramo="$(cd "$sorgente" && git branch --show-current)"
  if git subtree pull --prefix="$r" "$sorgente" "$ramo" -q -m "allinea $r" >/dev/null 2>&1; then
    echo "  ✓ $r"
  else
    # subtree pull esce diverso da zero anche quando non c'è niente da portare:
    # si distingue guardando se il contenuto è cambiato davvero.
    if git diff --quiet HEAD -- "$r"; then
      echo "  · $r già allineato"
    else
      echo "  ✗ $r: allineamento fallito"
      problemi=$((problemi + 1))
    fi
  fi
done

if [ "$SPINGI" = "1" ]; then
  echo
  if GIT_TERMINAL_PROMPT=0 git push origin main 2>&1 | tail -1; then
    echo "  → github.com/aarsinte-source/sib"
  fi
fi

echo
[ "$problemi" -gt 0 ] && echo "  $problemi repository non allineati (vedi sopra)." && exit 1
echo "  tutto allineato."
