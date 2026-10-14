#!/usr/bin/env python3
"""
Radar Settori — dati delle zone Asia ed Emergenti, con le stesse regole dell'Europa.

Per ogni zona (asia.json, emergenti.json: indici, azioni con ticker di Yahoo, settori, cambi) produce:
  • data/prezzi_<zona>.json: le chiusure degli ultimi 2-3 anni di azioni, indici e cambi (pagina Azioni, Home,
    Rotazione), nella stessa forma di data/prezzi_europa.json;
  • data/<zona>/: ampiezza dal 2005 di settori e indici, prezzo del gruppo, livelli blu predefiniti
    (europa_ampiezza.py) e gli stati (stati.js), come data/europa/.

A differenza dell'Europa le composizioni non si controllano su Wikipedia (per questi indici è spesso vecchia):
l'elenco si corregge a mano nel file della zona o con le versioni nuove del sito.

Le borse di zone diverse chiudono a orari diversi: si scarta la seduta del giorno se l'aggiornamento parte prima
dell'ora (UTC) in cui hanno chiuso tutte (voce "chiusura_utc" del file della zona).

Uso:  python build_mondo.py [asia|emergenti ...]    (senza argomenti: tutte e due)
"""
from __future__ import annotations

import datetime as dt
import json
import sys
from pathlib import Path
from typing import Callable, List, Optional

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
import europa_ampiezza  # noqa: E402
from build_europa import (INIZIO_DOWNLOAD, MIN_RISPOSTE, aggiorna_stati, calendario_maggioranza, cifre,  # noqa: E402
                          inizio_storia, log, yahoo_prezzi)

DATA_DIR = ROOT / "data"
ZONE = {
    "asia": {"lista": ROOT / "asia.json", "prezzi": DATA_DIR / "prezzi_asia.json", "cartella": DATA_DIR / "asia",
             "chiusura_utc": "10:45"},
    "emergenti": {"lista": ROOT / "emergenti.json", "prezzi": DATA_DIR / "prezzi_emergenti.json", "cartella": DATA_DIR / "emergenti",
                  "chiusura_utc": "21:45"},
}


def oggi_aperto(adesso: pd.Timestamp, chiusura_utc: str) -> Optional[pd.Timestamp]:
    """La data di oggi (UTC) se a quest'ora qualche borsa della zona può essere ancora aperta, altrimenti None."""
    t = adesso.tz_convert("UTC") if adesso.tzinfo else adesso.tz_localize("UTC")
    hh, mm = (int(x) for x in chiusura_utc.split(":"))
    if t.time() >= dt.time(hh, mm):
        return None
    return pd.Timestamp(t.date())


def build_zona(nome: str, scarica: Callable[[List[str], str], pd.DataFrame] = yahoo_prezzi,
               adesso: Optional[pd.Timestamp] = None, lista: Optional[dict] = None,
               out_path: Optional[Path] = None, cartella: Optional[Path] = None) -> Optional[dict]:
    z = ZONE[nome]
    if lista is None:
        with open(z["lista"], encoding="utf-8") as f:
            lista = json.load(f)
    out_path = out_path or z["prezzi"]
    cartella = cartella or z["cartella"]
    regione = lista.get("regione", nome.capitalize())
    adesso = adesso or pd.Timestamp.now(tz="UTC")
    titoli = lista["titoli"]
    simboli = [x["t"] for x in titoli]
    indici = lista["indici"] + ([dict(lista["confronto"], paese=regione)] if lista.get("confronto") else [])
    cambi_t = lista.get("cambi") or {}
    log(f"{regione}: scarico {len(simboli)} titoli, {len(indici)} indici e {len(cambi_t)} cambi…")
    px = scarica(simboli + [i["yahoo"] for i in indici] + list(cambi_t.values()), INIZIO_DOWNLOAD)
    if px is None or px.empty:
        log(f"{regione}: nessun prezzo, resta il file già pubblicato")
        return None
    aperto = oggi_aperto(adesso, lista.get("chiusura_utc", z["chiusura_utc"]))
    if aperto is not None:
        px = px[px.index < aperto]
    presenti = [t for t in simboli if t in px.columns and px[t].notna().sum() >= 20]
    if len(presenti) < MIN_RISPOSTE * len(simboli):
        log(f"{regione}: prezzi solo per {len(presenti)} titoli su {len(simboli)}: resta il file già pubblicato")
        return None
    # basta che quoti una borsa che pesi almeno il 10% dei titoli; le altre ripetono l'ultimo prezzo
    cal_lungo = calendario_maggioranza(px[presenti], float(lista.get("quota_calendario", 0.1)))
    inizio = inizio_storia(adesso.date())
    cal = cal_lungo[cal_lungo >= pd.Timestamp(inizio)]
    try:
        with open(out_path, encoding="utf-8") as f:
            prima = json.load(f).get("aggiornato")
    except Exception:  # noqa: BLE001
        prima = None
    ultimo = cal.max().strftime("%Y-%m-%d")
    if prima and ultimo < prima:
        log(f"{regione}: i dati nuovi sono più vecchi di quelli pubblicati, resta il file già pubblicato")
        return None
    riempi = int(lista.get("riempi", 10))

    def serie(t: str) -> Optional[dict]:
        if t not in px.columns:
            return None
        s = px[t].reindex(px.index.union(cal)).ffill(limit=riempi).reindex(cal)
        if s.notna().sum() < 20:
            return None
        i0 = int(np.argmax(s.notna().to_numpy()))
        return {"i0": i0, "prezzi": [cifre(v) for v in s.iloc[i0:]]}

    uscita = []
    for x in titoli:
        s = serie(x["t"])
        if s:
            uscita.append({**{k: x[k] for k in ("t", "nome", "indici", "paese", "settore", "valuta")}, **s})
    usc_indici = []
    for i in indici:
        s = serie(i["yahoo"])
        if s:
            usc_indici.append({"nome": i["nome"], "yahoo": i["yahoo"], "paese": i.get("paese", ""), **s})
    cambi = {}
    for valuta, t in cambi_t.items():
        if t in px.columns:
            s = px[t].dropna()
            s = s[(s > 0) & (s.index >= pd.Timestamp(inizio))]
            if len(s) >= 20:
                cambi[valuta] = {"date": [d.strftime("%Y-%m-%d") for d in s.index], "valori": [cifre(v, 6) for v in s.to_numpy()]}
    payload = {
        "aggiornato": ultimo,
        "generato": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "date": [d.strftime("%Y-%m-%d") for d in cal],
        "indici": usc_indici,
        "titoli": uscita,
        "cambi": cambi,
        "mancanti": [t for t in simboli if t not in presenti],
    }
    out_path.parent.mkdir(parents=True, exist_ok=True)
    tmp = out_path.with_suffix(".json.tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
    tmp.replace(out_path)
    log(f"{regione}: {len(uscita)} titoli e {len(usc_indici)} indici al {ultimo}"
        + (f", senza prezzi: {', '.join(payload['mancanti'][:15])}" if payload["mancanti"] else ""))

    # ampiezza storica di settori e indici, con gli stati
    try:
        cfg = json.loads((ROOT / "settings.json").read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001
        cfg = {}
    try:
        meta = europa_ampiezza.scrivi(px, cal_lungo, lista, cartella, cfg.get("inizio_storico", "2005-01-03"),
                                      cfg.get("parametri", {}), lista.get("confronto"), cambi_tickers=cambi_t,
                                      calendario=lista.get("calendario", "feriale"), riempi=riempi, regione=regione)
        if meta:
            log(f"{regione}: ampiezza di {len(meta['settori'])} settori e indici dal {meta['inizio']}")
            aggiorna_stati(cartella)
    except Exception as e:  # noqa: BLE001
        log(f"{regione}: ampiezza non aggiornata ({e})")
    return {"titoli": len(uscita), "indici": len(usc_indici), "aggiornato": ultimo}


def main(argv: List[str]) -> int:
    nomi = argv or list(ZONE)
    ok = True
    for nome in nomi:
        if nome not in ZONE:
            log(f"Zona sconosciuta: {nome} (sono {', '.join(ZONE)})")
            ok = False
            continue
        try:
            ok = bool(build_zona(nome)) and ok
        except Exception as e:  # noqa: BLE001
            log(f"{nome}: errore ({e}), resta il file già pubblicato")
            ok = False
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
