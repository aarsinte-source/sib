#!/bin/bash
# Porta l'esecutore aggiornato sul VPS, senza rompere il suo ambiente.
#
# ⚠️ IL .env NON SI COPIA, SI COMPONE.
# Misurato il 2026-08-04: un `rsync --delete` senza esclusione ha sovrascritto
# il .env del server con quello locale. Sembrano lo stesso file e non lo sono:
# quello locale si appoggia al .env di ~/alkemia-sheis-backend, che sul VPS non
# esiste. L'esecutore è ripartito dicendo «Mancano SUPABASE_URL/
# SUPABASE_SECRET_KEY», la coda si è fermata, e nessuno lo avrebbe saputo
# finché qualcuno non avesse chiesto una ricerca.
#
#   ./aggiorna-vps.sh
set -uo pipefail
cd "$(dirname "$0")"

VPS="${SHEIS_VPS:-root@167.233.75.186}"

echo "SHEis — aggiornamento esecutore su $VPS"

rsync -az --delete --exclude-from=.rsync-exclude ./ "$VPS:/opt/sheis-workers/" || {
  echo "  ✗ copia fallita"; exit 1; }
echo "  ✓ codice"

rsync -az \
  "$HOME/alkemia-sheis-backend/fonti-ricerca.json" \
  "$HOME/alkemia-sheis-backend/bersagli-outreach.json" \
  "$HOME/alkemia-sheis-backend/modelli-creativi.json" \
  "$HOME/alkemia-sheis-backend/marchi.json" \
  "$VPS:/opt/sheis-backend/" && echo "  ✓ mappe e registri"

# Il .env si RICOSTRUISCE dai valori locali, mai trascritto a mano e mai copiato.
python3 - "$VPS" <<'PY'
import os, subprocess, sys
vps = sys.argv[1]
sorgenti = {
    "SUPABASE_URL": "~/alkemia-sheis-backend/.env",
    "SUPABASE_SECRET_KEY": "~/alkemia-sheis-backend/.env",
    "SUPABASE_PROJECT_REF": "~/alkemia-sheis-backend/.env",
    "SCRAPECREATORS_API_KEY": "~/alkemia-sheis-workers/.env",
    "DATAFORSEO_LOGIN": "~/alkemia-sheis-workers/.env",
    "DATAFORSEO_PASSWORD": "~/alkemia-sheis-workers/.env",
    "ZERNIO_API_KEY": "~/alkemia-sheis-studio/.env.local",
    "ZERNIO_API_BASE": "~/alkemia-sheis-studio/.env.local",
    "OPENROUTER_API_KEY": "~/alkemia-sheis-studio/.env.local",
    "OPENROUTER_MODEL": "~/alkemia-sheis-studio/.env.local",
}
# ⚠️ Alcune chiavi sono dell'AGENZIA, non del cliente: ScrapeCreators e' un
# canone unico di Alkemia e vive nel .env di scalers-plus. In locale i moduli
# lo trovano da soli risalendo la catena; sul VPS quella catena non esiste, e
# la chiave va portata esplicitamente. E' il motivo per cui questo script
# cerca in PIU' file invece che in uno.
RIPIEGHI = [
    "~/Desktop/ALKEMIA - AGENCY/scalers-plus/.env",
    "~/alkemia-sheis-backend/.env",
    "~/alkemia-sheis-studio/.env.local",
    "~/.alkemia-secrets.env",
]

def leggi(k, dove):
    for percorso in [dove, *RIPIEGHI]:
        p = os.path.expanduser(percorso)
        if not os.path.isfile(p):
            continue
        for l in open(p, errors="replace"):
            if l.strip().startswith(f"{k}="):
                v = l.strip().split("=", 1)[1].strip().strip('"').strip("'")
                if v:
                    return v
    return ""

righe = ["# Generato da aggiorna-vps.sh dai .env locali. Mai trascritto a mano.", ""]
mancanti = []
for k, dove in sorgenti.items():
    v = leggi(k, dove)
    if v:
        righe.append(f"{k}={v}")
    else:
        mancanti.append(k)
righe += ["", "MONID_CLI=/usr/bin/monid", "HIGGSFIELD_CLI=/usr/bin/higgsfield",
          "SHEIS_FONTI_RICERCA=/opt/sheis-backend/fonti-ricerca.json",
          "SHEIS_BERSAGLI=/opt/sheis-backend/bersagli-outreach.json", ""]

testo = "\n".join(righe)
subprocess.run(["ssh", vps, "cat > /opt/sheis-workers/.env && chmod 600 /opt/sheis-workers/.env"],
               input=testo, text=True, check=True)
print(f"  ✓ ambiente ({len([r for r in righe if '=' in r])} variabili)")
if mancanti:
    print(f"  ⚠️ mancanti in locale, non copiate: {', '.join(mancanti)}")
PY

ssh "$VPS" 'systemctl restart sheis-esecutore && sleep 5 && systemctl is-active sheis-esecutore' \
  | sed 's/^/  esecutore: /'
ssh "$VPS" 'tail -3 /var/log/sheis-esecutore.log' | sed 's/^/    /'
