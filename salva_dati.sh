#!/usr/bin/env bash
# Radar Settori — salva nel repository i file della cartella data/ appena creati dall'aggiornamento automatico.
# Uso (dai workflow): bash salva_dati.sh "Crypto aggiornate"
#
# Se mentre l'aggiornamento girava qualcun altro ha scritto nel repository (l'altro aggiornamento, un caricamento
# a mano dei file del sito…), il push viene rifiutato. Allora si riparte dalla versione nuova del repository e
# ci si rimettono sopra solo i file che questo aggiornamento ha appena calcolato: niente conflitti, e i file
# scritti dagli altri restano com'erano.
set -u
MSG="${1:-Dati aggiornati} $(date -u +%Y-%m-%d)"
NUOVI="${RUNNER_TEMP:-/tmp}/radar-nuovi"

git config user.name "radar-bot"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

git add data
if git diff --cached --quiet; then
  echo "Nessuna novità da salvare"
  exit 0
fi
git commit -q -m "$MSG"

for tentativo in 1 2 3 4 5; do
  if git push -q origin HEAD:main; then
    echo "Dati salvati"
    exit 0
  fi
  echo "Il repository è cambiato nel frattempo: rimetto i file nuovi sopra la versione aggiornata (tentativo $tentativo)"
  rm -rf "$NUOVI"
  mkdir -p "$NUOVI"
  # i file cambiati da questo aggiornamento
  git diff --name-only HEAD~1 HEAD -- data | while IFS= read -r f; do
    if [ -f "$f" ]; then mkdir -p "$NUOVI/$(dirname "$f")"; cp "$f" "$NUOVI/$f"; fi
  done
  git fetch -q origin main
  git reset -q --hard origin/main
  cp -R "$NUOVI/." .
  git add data
  if git diff --cached --quiet; then
    echo "Il repository ha già questi dati"
    exit 0
  fi
  git commit -q -m "$MSG"
  sleep $((tentativo * 5))
done
echo "Non sono riuscito a salvare i dati dopo 5 tentativi"
exit 1
