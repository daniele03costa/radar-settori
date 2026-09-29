#!/usr/bin/env python3
"""
Radar Settori — prezzi giornalieri per la vista Rotazione.

Produce data/prezzi_usa.json (dollari, sedute NYSE) e data/prezzi_globali.json (euro, sedute di
Borsa Italiana). I due file sono separati: se una delle due fonti non risponde, l'altro si aggiorna lo stesso.

Cosa fa lo script, in ordine:
  1. scarica le chiusure rettificate da Yahoo Finance (per le borse europee aggiunge l'ultimo prezzo
     del giorno se la chiusura non è ancora in serie) e converte in euro ciò che quota in un'altra valuta;
     se la borsa è ancora aperta, i prezzi di oggi non sono chiusure e vengono scartati;
  2. costruisce il calendario con i giorni in cui ha quotato più della metà dei titoli attivi e,
     nei buchi, ripete l'ultimo prezzo conosciuto;
  3. il bitcoin, che quota anche nel fine settimana, viene allineato al calendario prendendo il valore
     più recente e lasciato vuoto se quel valore ha più di 4 giorni;
  4. un prezzo che salta lontano dal resto del mercato e il giorno dopo torna indietro viene considerato
     un errore della fonte: si sostituisce con la variazione del mercato e si annota in "correzioni";
  5. prima di scrivere controlla la qualità: servono risposte da almeno l'80% dei titoli, non più del
     20% di prezzi immobili, l'ultima data deve avere il prezzo di tutti i titoli attivi e non può
     essere più vecchia di quella già pubblicata. Altrimenti il file esistente resta com'è.

Uso:  python build_prices.py
"""
from __future__ import annotations

import datetime as dt
import json
import math
import sys
import time
from pathlib import Path
from typing import Callable, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent          # tutti i file stanno nella cartella principale
sys.path.insert(0, str(ROOT))
from orari import seduta_in_corso  # noqa: E402

UNIVERSE_PATH = ROOT / "universi.json"
DATA_DIR = ROOT / "data"

MIN_RESPONSE = 0.80
MAX_STALE = 0.20
STALE_DAYS = 5          # sedute di calendario senza variazioni per dire che un titolo è "fermo"
CRYPTO_MAX_AGE = 4      # giorni oltre i quali il prezzo del bitcoin non vale più
OUTLIER_MIN = 0.08      # salto minimo (8%) rispetto al mercato per sospettare un errore
OUTLIER_SIGMA = 6.0     # …e oltre 6 deviazioni tipiche dello scarto dal mercato
OUTLIER_REVERT = 0.6    # il giorno dopo deve rientrare almeno per il 60%


def log(msg: str) -> None:
    print(f"[{dt.datetime.now():%H:%M:%S}] {msg}", flush=True)


def load_universe() -> dict:
    with open(UNIVERSE_PATH, encoding="utf-8") as f:
        return json.load(f)


def is_crypto(sym: str) -> bool:
    """Criptovalute (quotano tutti i giorni): simboli Yahoo come BTC-EUR, ETH-EUR."""
    head = sym.upper().split("-")[0]
    return "-" in sym and head in {"BTC", "ETH", "SOL", "XRP", "ADA", "LTC"}


def round_price(v: float) -> Optional[float]:
    if v is None or (isinstance(v, float) and (math.isnan(v) or math.isinf(v))):
        return None
    a = abs(v)
    nd = 2 if a >= 100 else 3 if a >= 10 else 4
    return round(float(v), nd)


# ---------------------------------------------------------------------------
# elenco dei simboli
# ---------------------------------------------------------------------------

def usa_symbols(u: dict) -> Tuple[List[str], Dict[str, dict]]:
    info: Dict[str, dict] = {}
    for sym, meta in u["usa"]["benchmark"].items():
        info[sym] = {**meta, "benchmark": True}
    for g in u["usa"]["gruppi"]:
        for sym, meta in g["titoli"].items():
            info.setdefault(sym, {}).update(meta)
    return sorted(info), info


def global_symbols(u: dict) -> Tuple[List[str], Dict[str, dict]]:
    info: Dict[str, dict] = {}
    for sym, meta in u["globale"]["benchmark"].items():
        info[sym] = {**meta, "benchmark": True}
    for g in u["globale"]["gruppi"]:
        for sym, meta in g["titoli"].items():
            info.setdefault(sym, {}).update(meta)
    return sorted(info), info


# ---------------------------------------------------------------------------
# scaricamento (Yahoo Finance)
# ---------------------------------------------------------------------------

def yahoo_prices(symbols: List[str], start: str, batch: int = 40) -> pd.DataFrame:
    """Chiusure rettificate (dividendi e split) giornaliere."""
    import yfinance as yf

    frames = []
    for i in range(0, len(symbols), batch):
        chunk = symbols[i:i + batch]
        df = pd.DataFrame()
        for attempt in range(4):
            try:
                df = yf.download(chunk, start=start, auto_adjust=False, actions=False, group_by="column",
                                 threads=True, progress=False, timeout=30, multi_level_index=True)
                break
            except Exception as e:  # noqa: BLE001
                wait = 5 * 3 ** attempt
                log(f"  errore download ({e}); riprovo tra {wait}s")
                time.sleep(wait)
        if df is not None and not df.empty:
            field = "Adj Close" if "Adj Close" in set(df.columns.get_level_values(0)) else "Close"
            sub = df[field]
            if isinstance(sub, pd.Series):
                sub = sub.to_frame(chunk[0])
            frames.append(sub)
        time.sleep(1.0)
    if not frames:
        return pd.DataFrame()
    out = pd.concat(frames, axis=1)
    out = out.loc[:, ~out.columns.duplicated()]
    out.index = pd.to_datetime(out.index).tz_localize(None).normalize()
    return out.sort_index()


def yahoo_last_quotes(symbols: List[str], tz: str = "Europe/Rome") -> Dict[str, Tuple[pd.Timestamp, float]]:
    """Ultimo prezzo scambiato oggi (barre da 15 minuti), con la data nel fuso della borsa."""
    import yfinance as yf

    out: Dict[str, Tuple[pd.Timestamp, float]] = {}
    try:
        df = yf.download(symbols, period="2d", interval="15m", auto_adjust=False, group_by="column",
                         threads=True, progress=False, timeout=30, multi_level_index=True)
    except Exception as e:  # noqa: BLE001
        log(f"  ultimi prezzi non disponibili ({e})")
        return out
    if df is None or df.empty:
        return out
    close = df["Close"]
    if isinstance(close, pd.Series):
        close = close.to_frame(symbols[0])
    for sym in close.columns:
        s = close[sym].dropna()
        if s.empty:
            continue
        ts = s.index[-1]
        ts = ts.tz_convert(tz) if ts.tzinfo else ts.tz_localize("UTC").tz_convert(tz)
        out[sym] = (pd.Timestamp(ts.date()), float(s.iloc[-1]))
    return out


# ---------------------------------------------------------------------------
# elaborazione
# ---------------------------------------------------------------------------

def majority_calendar(px: pd.DataFrame, exclude: List[str]) -> pd.DatetimeIndex:
    """Date in cui quota la maggioranza dei titoli già attivi (quotati prima e dopo quella data)."""
    cols = [c for c in px.columns if c not in exclude]
    if not cols:
        return px.index
    sub = px[cols]
    first = sub.apply(lambda s: s.first_valid_index())
    last = sub.apply(lambda s: s.last_valid_index())
    keep = []
    for d in sub.index:
        active = [c for c in cols if first[c] is not None and first[c] <= d and last[c] is not None and last[c] >= d]
        if not active:
            continue
        quoted = sub.loc[d, active].notna().sum()
        if quoted > len(active) / 2:
            keep.append(d)
    return pd.DatetimeIndex(keep)


def align_crypto(series: pd.Series, calendar: pd.DatetimeIndex, max_age: int = CRYPTO_MAX_AGE) -> pd.Series:
    """Ultimo prezzo noto a ogni data del calendario; vuoto se più vecchio di max_age giorni."""
    s = series.dropna()
    out = []
    for d in calendar:
        prev = s.loc[:d]
        if prev.empty or (d - prev.index[-1]).days > max_age:
            out.append(np.nan)
        else:
            out.append(prev.iloc[-1])
    return pd.Series(out, index=calendar)


def fix_outliers(px: pd.DataFrame, exclude: List[str]) -> Tuple[pd.DataFrame, List[dict]]:
    """Corregge prezzi isolati palesemente sbagliati: salto rispetto al mercato che rientra la seduta dopo."""
    px = px.copy()
    cols = [c for c in px.columns if c not in exclude]
    rets = px[cols].pct_change(fill_method=None)
    market = rets.median(axis=1)
    fixes: List[dict] = []
    for c in cols:
        ex = rets[c] - market
        sigma = ex.abs().rolling(60, min_periods=20).median().shift(1) * 1.4826
        for k in range(1, len(px.index) - 1):
            e0, e1 = ex.iloc[k], ex.iloc[k + 1]
            sg = sigma.iloc[k]
            if any(pd.isna(v) for v in (e0, e1)) or pd.isna(sg):
                continue
            limit = max(OUTLIER_MIN, OUTLIER_SIGMA * sg)
            # il prezzo "vero" del giorno k spiega il rientro del giorno dopo
            if abs(e0) > limit and np.sign(e1) == -np.sign(e0) and abs(e1) >= OUTLIER_REVERT * abs(e0) / (1 + e0):
                prev = px[c].iloc[k - 1]
                if pd.isna(prev):
                    continue
                wrong = px[c].iloc[k]
                right = prev * (1 + (market.iloc[k] if not pd.isna(market.iloc[k]) else 0.0))
                px.iloc[k, px.columns.get_loc(c)] = right
                fixes.append({"titolo": c, "data": px.index[k].strftime("%Y-%m-%d"),
                              "originale": round_price(wrong), "corretto": round_price(right)})
                rets = px[cols].pct_change(fill_method=None)
                ex = rets[c] - rets.median(axis=1)
    return px, fixes


def trim_to_complete(px: pd.DataFrame, active: List[str]) -> pd.DataFrame:
    """Toglie le ultime date in cui non tutti i titoli attivi hanno un prezzo proprio (non riempito)."""
    while len(px.index) > 1:
        last = px.index[-1]
        missing = [c for c in active if pd.isna(px.at[last, c])]
        if not missing:
            break
        log(f"  {last:%Y-%m-%d}: mancano {', '.join(missing[:6])}{'…' if len(missing) > 6 else ''} → seduta non pubblicata")
        px = px.iloc[:-1]
    return px


def stale_share(px: pd.DataFrame, cols: List[str], days: int = STALE_DAYS) -> float:
    if len(px.index) <= days or not cols:
        return 0.0
    tail = px[cols].iloc[-(days + 1):]
    flat = [(tail[c].nunique(dropna=True) <= 1) for c in cols]
    return float(np.mean(flat))


def previous_date(path: Path) -> Optional[str]:
    if not path.exists():
        return None
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f).get("aggiornato")
    except Exception:  # noqa: BLE001
        return None


def write_prices(path: Path, px: pd.DataFrame, info: Dict[str, dict], extra: dict) -> None:
    payload = {
        "aggiornato": px.index[-1].strftime("%Y-%m-%d"),
        "generato": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "date": [d.strftime("%Y-%m-%d") for d in px.index],
        "serie": {c: [round_price(v) for v in px[c].to_numpy()] for c in px.columns},
        "info": {c: info.get(c, {}) for c in px.columns},
        **extra,
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))


def build_market(name: str, symbols: List[str], info: Dict[str, dict], start: str,
                 downloader: Callable[[List[str], str], pd.DataFrame],
                 out_path: Path,
                 fx_downloader: Optional[Callable[[List[str], str], pd.DataFrame]] = None,
                 last_quotes: Optional[Callable[[List[str]], Dict[str, Tuple[pd.Timestamp, float]]]] = None,
                 calendar_name: str = "NYSE",
                 adesso: Optional[pd.Timestamp] = None) -> Optional[dict]:
    log(f"{name}: scarico {len(symbols)} titoli…")
    raw = downloader(symbols, start)
    if raw is None or raw.empty:
        log(f"{name}: nessun dato, resta il file già pubblicato")
        return None
    raw = raw.reindex(columns=symbols)
    crypto = [s for s in symbols if is_crypto(s)]

    # ultimo prezzo di oggi per le borse europee (Yahoo lo mette in serie solo il giorno dopo)
    if last_quotes is not None:
        quotes = last_quotes([s for s in symbols if s not in crypto])
        for sym, (day, price) in quotes.items():
            if sym not in raw.columns or not np.isfinite(price):
                continue
            s = raw[sym].dropna()
            if s.empty or day <= s.index[-1]:
                continue
            if day not in raw.index:
                raw.loc[day] = np.nan
                raw = raw.sort_index()
            raw.at[day, sym] = price

    # si pubblicano solo chiusure: se la borsa è ancora aperta, la seduta di oggi si scarta
    in_corso = seduta_in_corso("NYSE" if calendar_name == "NYSE" else "Borsa Italiana", adesso)
    if in_corso is not None and len(raw.index) and raw.index[-1] >= in_corso:
        log(f"{name}: la seduta del {in_corso:%Y-%m-%d} non è ancora chiusa, si pubblica fino al giorno prima")
        raw = raw[raw.index < in_corso]

    # conversione in euro dei titoli in altra valuta
    fx_needed = sorted({(info.get(s) or {}).get("valuta", "EUR") for s in symbols} - {"EUR", ""})
    if fx_needed and calendar_name != "NYSE":
        pairs = sorted({f"EUR{c.upper()}=X" for c in fx_needed})
        fx = fx_downloader(pairs, start) if fx_downloader else pd.DataFrame()
        for s in symbols:
            cur = (info.get(s) or {}).get("valuta", "EUR")
            if cur in ("EUR", ""):
                continue
            base = cur.upper()
            pair = f"EUR{base}=X"
            if fx.empty or pair not in fx.columns:
                log(f"  cambio {pair} non disponibile: {s} escluso")
                raw[s] = np.nan
                continue
            rate = fx[pair].reindex(raw.index).ffill()
            factor = 100.0 if cur == "GBp" else 1.0
            raw[s] = raw[s] / factor / rate

    responding = [s for s in symbols if raw[s].notna().any()]
    if len(responding) < MIN_RESPONSE * len(symbols):
        log(f"{name}: rispondono solo {len(responding)}/{len(symbols)} titoli, resta il file già pubblicato")
        return None

    cal = majority_calendar(raw, exclude=crypto)
    px = raw.reindex(cal)
    for c in crypto:
        px[c] = align_crypto(raw[c], cal)

    # titoli attivi: con prezzi nelle ultime 10 sedute del calendario
    recent = px.iloc[-10:]
    active = [c for c in px.columns if c not in crypto and recent[c].notna().any()]
    px = trim_to_complete(px, active)

    px, fixes = fix_outliers(px, exclude=crypto)
    filled = px.copy()
    for c in px.columns:
        if c in crypto:
            continue
        first = px[c].first_valid_index()
        if first is not None:
            filled.loc[first:, c] = px.loc[first:, c].ffill()

    share = stale_share(filled, active)
    if share > MAX_STALE:
        log(f"{name}: {share:.0%} dei titoli è fermo, resta il file già pubblicato")
        return None

    prev = previous_date(out_path)
    last = filled.index[-1].strftime("%Y-%m-%d")
    if prev and last < prev:
        log(f"{name}: i dati scaricati ({last}) sono più vecchi di quelli pubblicati ({prev}), non sovrascrivo")
        return None

    excluded = [c for c in symbols if c not in active and c not in crypto]
    write_prices(out_path, filled, info, {"calendario": calendar_name, "correzioni": fixes, "esclusi": excluded})
    for f in fixes:
        log(f"  corretto {f['titolo']} il {f['data']}: {f['originale']} → {f['corretto']}")
    log(f"{name}: pubblicato fino al {last} ({len(filled.index)} sedute, {len(filled.columns)} titoli)")
    return {"aggiornato": last, "correzioni": len(fixes)}


# ---------------------------------------------------------------------------
# «I miei titoli»: la lista personale in miei-titoli.txt
# ---------------------------------------------------------------------------

LISTA_MIEI = ROOT / "miei-titoli.txt"
BENCH_MIEI = {"usa": "SPY", "europa": "IUSQ.DE"}     # S&P 500 in dollari, azionario mondiale (ACWI) in euro
VALUTE = {"MI": "EUR", "DE": "EUR", "F": "EUR", "PA": "EUR", "AS": "EUR", "MC": "EUR", "BR": "EUR", "LS": "EUR",
          "VI": "EUR", "HE": "EUR", "IR": "EUR", "L": "GBp", "SW": "CHF", "CO": "DKK", "ST": "SEK", "OL": "NOK",
          "TO": "CAD", "T": "JPY", "HK": "HKD", "AX": "AUD"}


def leggi_lista(path: Path) -> List[Tuple[str, str]]:
    """Una riga per titolo: ticker di Yahoo Finance e, se c'è, il nome. Le righe con # non contano."""
    if not path.exists():
        return []
    out, visti = [], set()
    for riga in path.read_text(encoding="utf-8").splitlines():
        riga = riga.split("#", 1)[0].strip()
        if not riga:
            continue
        parti = riga.replace("\t", " ").split(None, 1)
        t = parti[0].strip().upper().replace(",", "")
        if not t or t in visti:
            continue
        visti.add(t)
        out.append((t, parti[1].strip() if len(parti) > 1 else ""))
    return out


def mercato_di(ticker: str) -> Tuple[str, str]:
    """(mercato, valuta): senza suffisso è un titolo americano in dollari."""
    if "." in ticker:
        suff = ticker.rsplit(".", 1)[1]
        if suff in VALUTE:
            return ("europa" if VALUTE[suff] in ("EUR", "GBp", "CHF", "DKK", "SEK", "NOK") else "altro"), VALUTE[suff]
        return "altro", ""                            # borsa non in elenco: valuta sconosciuta
    return "usa", "USD"


def build_miei(lista: Path, out_path: Path, downloader: Callable[[List[str], str], pd.DataFrame],
               adesso: Optional[pd.Timestamp] = None, anni: int = 3) -> Optional[dict]:
    titoli = leggi_lista(lista)
    if not titoli:
        log("I miei titoli: lista vuota")
        return None
    inizio = (pd.Timestamp.now() - pd.DateOffset(years=anni)).strftime("%Y-%m-%d")
    simboli = [t for t, _ in titoli] + [b for b in BENCH_MIEI.values() if b not in {t for t, _ in titoli}]
    log(f"I miei titoli: scarico {len(titoli)} titoli…")
    raw = downloader(simboli, inizio)
    if raw is None or raw.empty:
        log("I miei titoli: nessun dato, resta il file già pubblicato")
        return None

    def serie(t: str) -> Optional[dict]:
        if t not in raw.columns:
            return None
        s = raw[t].dropna()
        s = s[s > 0]
        mercato, valuta = mercato_di(t)
        # Toronto chiude con Wall Street; le borse asiatiche chiudono prima di quelle europee
        oggi = seduta_in_corso("NYSE" if mercato == "usa" or t.endswith(".TO") else "Borsa Italiana", adesso)
        if oggi is not None:
            s = s[s.index < oggi]                     # solo chiusure
        if len(s) < 5:
            return None
        return {"date": [d.strftime("%Y-%m-%d") for d in s.index], "prezzi": [round_price(v) for v in s.to_numpy()],
                "mercato": mercato, "valuta": valuta}

    voci, mancanti = [], []
    for t, nome in titoli:
        x = serie(t)
        if x is None:
            mancanti.append(t)
            continue
        voci.append({"t": t, "nome": nome, **x})
    bench = {}
    for chiave, b in BENCH_MIEI.items():
        x = serie(b)
        if x is not None:
            bench[chiave] = {"t": b, **x}
    if not voci:
        log(f"I miei titoli: nessun prezzo trovato ({', '.join(mancanti)})")
        return None
    payload = {
        "aggiornato": max(v["date"][-1] for v in voci),
        "generato": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "titoli": voci,
        "confronti": bench,
        "mancanti": mancanti,
    }
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
    log(f"I miei titoli: {len(voci)} pubblicati" + (f", non trovati: {', '.join(mancanti)}" if mancanti else ""))
    return {"titoli": len(voci), "mancanti": mancanti}


def main() -> int:
    u = load_universe()
    start = u.get("inizio", "2019-01-01")
    ok = True
    syms, info = usa_symbols(u)
    r1 = build_market("USA", syms, info, start, yahoo_prices, DATA_DIR / "prezzi_usa.json", calendar_name="NYSE")
    syms, info = global_symbols(u)
    r2 = build_market("Globali", syms, info, start, yahoo_prices, DATA_DIR / "prezzi_globali.json",
                      fx_downloader=yahoo_prices, last_quotes=yahoo_last_quotes, calendar_name="Borsa Italiana")
    ok = r1 is not None or r2 is not None
    try:
        build_miei(LISTA_MIEI, DATA_DIR / "prezzi_miei.json", yahoo_prices)
    except Exception as e:  # noqa: BLE001
        log(f"I miei titoli: errore ({e}), resta il file già pubblicato")
    # crypto: anche qui, così si aggiornano pure senza il loro aggiornamento giornaliero
    try:
        import build_crypto
        build_crypto.main()
    except Exception as e:  # noqa: BLE001
        log(f"Crypto: errore ({e}), resta il file già pubblicato")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
