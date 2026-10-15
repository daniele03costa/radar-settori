#!/usr/bin/env python3
"""
Radar Settori — quadro macro: tassi a 10 anni di USA e Germania (Bund), dollaro, petrolio, oro, VIX e rame.

Produce data/macro.json: una riga di valori per serie, sulle date comuni (giorni feriali) dal 2005, più il
differenziale fra il tasso USA e il Bund. Il sito ne calcola variazioni, posizione nell'anno, percentile dal 2005 e
media a 200 sedute: solo statistiche descrittive.

Fonti (senza chiavi né account):
  • Yahoo Finance per tasso USA (^TNX), dollaro (DX-Y.NYB, EURUSD=X), Brent (BZ=F), oro (GC=F), VIX (^VIX) e
    rame (HG=F); petrolio, oro e rame sono i future con la scadenza più vicina;
  • Bund 10 anni dalla Bundesbank (rendimenti dei titoli federali a 10 anni); se non risponde, la curva AAA
    dell'area euro della BCE (scadenza 10 anni), che gli sta molto vicina;
  • se Yahoo non dà il tasso USA, la serie DGS10 della Fed di St. Louis (FRED).
Se una fonte non risponde la serie resta quella già pubblicata.

Uso:  python build_macro.py
"""
from __future__ import annotations

import datetime as dt
import io
import json
import sys
from pathlib import Path
from typing import Callable, Dict, List, Optional

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
import salute  # noqa: E402

DATA_DIR = ROOT / "data"
OUT_PATH = DATA_DIR / "macro.json"
INIZIO = "2005-01-03"
FERMO_DOPO = 7          # giorni di calendario senza un valore nuovo: la serie è «ferma»

# id, nome, gruppo, unità, decimali, fonte Yahoo
SERIE = [
    {"id": "us10", "nome": "Tasso USA 10 anni", "breve": "USA 10a", "gruppo": "Tassi", "unita": "%", "dec": 2, "yahoo": "^TNX",
     "nota": "Rendimento del Treasury a 10 anni"},
    {"id": "bund10", "nome": "Bund 10 anni", "breve": "Bund 10a", "gruppo": "Tassi", "unita": "%", "dec": 2, "yahoo": None,
     "nota": "Rendimento dei titoli di Stato tedeschi a 10 anni"},
    {"id": "spread", "nome": "Differenziale USA–Bund", "breve": "USA−Bund", "gruppo": "Tassi", "unita": "%", "dec": 2, "yahoo": None,
     "nota": "Tasso USA 10 anni meno Bund 10 anni"},
    {"id": "dxy", "nome": "Indice del dollaro", "breve": "DXY", "gruppo": "Valute", "unita": "punti", "dec": 2, "yahoo": "DX-Y.NYB",
     "nota": "Il dollaro contro sei valute principali (DXY): sale quando il dollaro si rafforza"},
    {"id": "eurusd", "nome": "Euro/dollaro", "breve": "EUR/USD", "gruppo": "Valute", "unita": "$", "dec": 4, "yahoo": "EURUSD=X",
     "nota": "Dollari per un euro: sale quando l'euro si rafforza"},
    {"id": "brent", "nome": "Petrolio Brent", "breve": "Brent", "gruppo": "Materie prime", "unita": "$/barile", "dec": 2, "yahoo": "BZ=F",
     "nota": "Future sul Brent con la scadenza più vicina"},
    {"id": "oro", "nome": "Oro", "breve": "Oro", "gruppo": "Materie prime", "unita": "$/oncia", "dec": 1, "yahoo": "GC=F",
     "nota": "Future sull'oro con la scadenza più vicina"},
    {"id": "rame", "nome": "Rame", "breve": "Rame", "gruppo": "Materie prime", "unita": "$/libbra", "dec": 3, "yahoo": "HG=F",
     "nota": "Future sul rame con la scadenza più vicina"},
    {"id": "vix", "nome": "VIX", "breve": "VIX", "gruppo": "Volatilità", "unita": "punti", "dec": 2, "yahoo": "^VIX",
     "nota": "Volatilità attesa dell'S&P 500 nei prossimi 30 giorni"},
]

BUNDESBANK = ("https://www.bundesbank.de/statistic-rmi/StatisticDownload?tsId=BBSIS.D.I.ZAR.ZI.EUR.S1311.B.A604.R10XX.R.A.A._Z._Z.A"
              "&its_csvFormat=en&its_fileFormat=csv&mode=its")
BCE = ("https://data-api.ecb.europa.eu/service/data/YC/B.U2.EUR.4F.G_N_A.SV_C_YM.SR_10Y"
       "?format=csvdata&startPeriod=2004-06-01")
FRED = "https://fred.stlouisfed.org/graph/fredgraph.csv?id=DGS10"


def log(msg: str) -> None:
    print(f"[{dt.datetime.now():%H:%M:%S}] {msg}", flush=True)


# ---------------------------------------------------------------------------
# fonti
# ---------------------------------------------------------------------------

def scarica_testo(url: str) -> Optional[str]:
    import requests
    for tentativo in range(3):
        try:
            r = requests.get(url, timeout=40, headers={"User-Agent": "Mozilla/5.0 (radar-settori)", "Accept": "text/csv,*/*"})
            if r.ok and r.text.strip():
                return r.text
            log(f"  {url.split('?')[0]}: HTTP {r.status_code}")
        except Exception as e:  # noqa: BLE001
            log(f"  {url.split('?')[0]}: {e}")
    return None


def yahoo(simboli: List[str], inizio: str) -> pd.DataFrame:
    import build_prices
    return build_prices.yahoo_prices(simboli, inizio, batch=10)


def _serie(date, valori) -> pd.Series:
    s = pd.Series(pd.to_numeric(pd.Series(list(valori)), errors="coerce").to_numpy(),
                  index=pd.to_datetime(pd.Series(list(date)), errors="coerce"))
    s = s[s.index.notna()].dropna()
    s = s[~s.index.duplicated(keep="last")].sort_index()
    s.index = s.index.tz_localize(None) if s.index.tz is not None else s.index
    return s.astype(float)


def leggi_bundesbank(testo: str) -> pd.Series:
    """CSV della Bundesbank: qualche riga di intestazione, poi «data,valore,nota»; «.» = nessun valore."""
    date, valori = [], []
    for riga in testo.splitlines():
        parti = [p.strip().strip('"') for p in riga.replace(";", ",").split(",")]
        if len(parti) < 2 or len(parti[0]) != 10 or parti[0][4] != "-":
            continue
        try:
            dt.date.fromisoformat(parti[0])
        except ValueError:
            continue
        date.append(parti[0])
        valori.append(parti[1] if parti[1] not in (".", "") else None)
    return _serie(date, valori)


def leggi_csv_colonne(testo: str, col_data: List[str], col_valore: List[str]) -> pd.Series:
    """CSV con intestazione (BCE: TIME_PERIOD/OBS_VALUE; FRED: observation_date o DATE / DGS10)."""
    try:
        df = pd.read_csv(io.StringIO(testo))
    except Exception:  # noqa: BLE001  (una pagina d'errore al posto del CSV)
        return pd.Series(dtype=float)
    cd = next((c for c in df.columns if c in col_data), None)
    cv = next((c for c in df.columns if c in col_valore), None)
    if cd is None or cv is None:
        return pd.Series(dtype=float)
    return _serie(df[cd], df[cv].replace(".", np.nan))


def bund(prendi: Callable[[str], Optional[str]] = scarica_testo) -> tuple:
    """(serie, fonte) del Bund a 10 anni: Bundesbank, altrimenti la curva AAA della BCE."""
    t = prendi(BUNDESBANK)
    if t:
        s = leggi_bundesbank(t)
        if len(s) > 250:
            return s, "Bundesbank"
    t = prendi(BCE)
    if t:
        s = leggi_csv_colonne(t, ["TIME_PERIOD"], ["OBS_VALUE"])
        if len(s) > 250:
            return s, "BCE, curva AAA dell'area euro (molto vicina al Bund)"
    return pd.Series(dtype=float), None


def tasso_usa(px: pd.DataFrame, prendi: Callable[[str], Optional[str]] = scarica_testo) -> tuple:
    s = px["^TNX"].dropna() if "^TNX" in px.columns else pd.Series(dtype=float)
    if len(s) > 250:
        # Yahoo dà il rendimento in percento; per sicurezza, valori 10 volte più grandi si riportano in percento
        s = s.where(s < 25, s / 10)
        return s, "Yahoo Finance (^TNX)"
    t = prendi(FRED)
    if t:
        s = leggi_csv_colonne(t, ["observation_date", "DATE"], ["DGS10"])
        if len(s) > 250:
            return s, "FRED, serie DGS10"
    return pd.Series(dtype=float), None


# ---------------------------------------------------------------------------
# file
# ---------------------------------------------------------------------------

def arrotonda(v, d: int):
    if v is None or not np.isfinite(v):
        return None
    return round(float(v), d)


def build_macro(out_path: Path = OUT_PATH, scarica: Callable[[List[str], str], pd.DataFrame] = yahoo,
                prendi: Callable[[str], Optional[str]] = scarica_testo, adesso: Optional[pd.Timestamp] = None) -> Optional[dict]:
    adesso = adesso or pd.Timestamp.now(tz="UTC")
    oggi = pd.Timestamp(adesso.tz_convert("UTC").date() if adesso.tzinfo else adesso.date())
    simboli = [s["yahoo"] for s in SERIE if s["yahoo"]]
    log(f"Macro: scarico {len(simboli)} serie da Yahoo e il Bund…")
    try:
        px = scarica(simboli, "2004-06-01")
    except Exception as e:  # noqa: BLE001
        log(f"Macro: Yahoo non risponde ({e})")
        px = pd.DataFrame()
    if px is None:
        px = pd.DataFrame()

    try:
        with open(out_path, encoding="utf-8") as f:
            prima = json.load(f)
    except Exception:  # noqa: BLE001
        prima = None
    # le serie già pubblicate: se una fonte oggi non risponde si tiene quella
    vecchie: Dict[str, pd.Series] = {}
    fonti_prima: Dict[str, str] = {}
    if prima:
        for x in prima.get("serie", []):
            v = _serie(prima["date"][int(x.get("i0") or 0):], x["valori"])
            # solo i valori veri: quelli dopo l'ultimo dato della fonte erano riempiti con l'ultimo valore
            if x.get("ultimo"):
                v = v[v.index <= pd.Timestamp(x["ultimo"])]
            vecchie[x["id"]] = v
            fonti_prima[x["id"]] = x.get("fonte")

    grezze: Dict[str, pd.Series] = {}
    fonti: Dict[str, str] = {}
    for s in SERIE:
        if s["yahoo"] and s["yahoo"] in px.columns and s["id"] != "us10":
            v = px[s["yahoo"]].dropna()
            v = v[v > 0]
            if len(v) > 250:
                grezze[s["id"]], fonti[s["id"]] = v, f"Yahoo Finance ({s['yahoo']})"
    v, f = tasso_usa(px, prendi)
    if f:
        grezze["us10"], fonti["us10"] = v, f
    v, f = bund(prendi)
    if f:
        grezze["bund10"], fonti["bund10"] = v, f
    nuove = [k for k in grezze]
    for k, v in vecchie.items():
        if k not in grezze and k != "spread" and len(v):
            grezze[k], fonti[k] = v, fonti_prima.get(k) or ""
            log(f"Macro: {k} non disponibile oggi, resta la serie già pubblicata")
    if not nuove:
        log("Macro: nessuna fonte ha risposto, resta il file già pubblicato")
        return None

    # date comuni: i giorni feriali dal 2005 in cui almeno una serie ha un valore, fino a ieri (oggi è provvisorio)
    tutte = sorted(set().union(*[set(v.index) for v in grezze.values()]))
    cal = pd.DatetimeIndex([d for d in tutte if d >= pd.Timestamp(INIZIO) and d < oggi and d.weekday() < 5])
    if len(cal) < 250:
        log("Macro: troppo poche date, resta il file già pubblicato")
        return None
    allineate = {k: v.reindex(v.index.union(cal)).ffill(limit=5).reindex(cal) for k, v in grezze.items()}
    if "us10" in allineate and "bund10" in allineate:
        allineate["spread"] = allineate["us10"] - allineate["bund10"]
        fonti["spread"] = "differenza delle due serie"

    uscita, ferme, mancanti = [], [], []
    for s in SERIE:
        v = allineate.get(s["id"])
        if v is None or v.notna().sum() < 250:
            mancanti.append(s["nome"])
            continue
        g = grezze.get(s["id"])
        ultimo_vero = (g[g.index < oggi].index.max() if g is not None and len(g) else v.last_valid_index())
        i0 = int(np.argmax(v.notna().to_numpy()))
        voce = {k: s[k] for k in ("id", "nome", "breve", "gruppo", "unita", "dec", "nota")}
        voce.update({"fonte": fonti.get(s["id"], ""), "ultimo": ultimo_vero.strftime("%Y-%m-%d") if ultimo_vero is not None else None,
                     "i0": i0, "valori": [arrotonda(x, s["dec"] + 1) for x in v.iloc[i0:]]})
        if ultimo_vero is not None and (oggi - ultimo_vero).days > FERMO_DOPO:
            ferme.append({"nome": s["nome"], "dal": voce["ultimo"]})
        uscita.append(voce)

    payload = {
        "aggiornato": cal.max().strftime("%Y-%m-%d"),
        "generato": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "date": [d.strftime("%Y-%m-%d") for d in cal],
        "serie": uscita,
    }
    out_path.parent.mkdir(parents=True, exist_ok=True)
    tmp = out_path.with_suffix(".json.tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
    tmp.replace(out_path)
    log(f"Macro: {len(uscita)} serie al {payload['aggiornato']}" + (f", mancano: {', '.join(mancanti)}" if mancanti else "")
        + (f", ferme: {', '.join(x['nome'] for x in ferme)}" if ferme else ""))
    return {"aggiornato": payload["aggiornato"], "titoli": len(uscita), "totale": len(SERIE),
            "mancanti": [{"t": m, "nome": m} for m in mancanti], "fermi": [{"t": x["nome"], "nome": x["nome"], "dal": x["dal"]} for x in ferme],
            "fonti": {x["id"]: x["fonte"] for x in uscita}}


def main() -> int:
    with salute.ascolta(sys.modules[__name__]) as reg:
        try:
            r = build_macro()
        except Exception as e:  # noqa: BLE001
            log(f"Macro: errore ({e}), resta il file già pubblicato")
            r = None
    salute.registra("macro", bool(r), "" if r else reg.ultimo, avvisi=reg.avvisi, **(r or {}))
    return 0 if r else 1


if __name__ == "__main__":
    sys.exit(main())
