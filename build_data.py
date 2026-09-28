#!/usr/bin/env python3
"""
Radar Settori — generatore dei dati.

Scarica i prezzi giornalieri degli 11 ETF settoriali SPDR e dei titoli dell'S&P 500,
calcola per ogni settore:
  • % di titoli sopra la media mobile a 200 e a 50 sedute (ampiezza / breadth)
  • prezzo, media 200 e drawdown dal massimo a 52 settimane dell'ETF
  • la situazione attuale di ogni titolo del settore
e scrive i file JSON in data/ letti dal sito.

Uso:  python scripts/build_data.py
"""
from __future__ import annotations

import io
import json
import math
import sys
import time
import datetime as dt
from pathlib import Path
from typing import Callable, Dict, Iterable, List, Optional, Tuple

import numpy as np
import pandas as pd
import requests

ROOT = Path(__file__).resolve().parents[1]
CONFIG_PATH = ROOT / "config" / "settings.json"
DATA_DIR = ROOT / "data"
CACHE_DIR = DATA_DIR / "cache"

UA = {"User-Agent": "Mozilla/5.0 (radar-settori; +https://github.com)"}
WIKI_URL = "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies"
CONSTITUENTS_CSV = "https://raw.githubusercontent.com/datasets/s-and-p-500-companies/main/data/constituents.csv"
MEMBERSHIP_CSV = "https://raw.githubusercontent.com/fja05680/sp500/master/sp500_ticker_start_end.csv"

# Classificazione settoriale di Yahoo -> settore GICS (serve solo per gli ex membri dell'indice)
YAHOO_TO_GICS = {
    "Technology": "Information Technology",
    "Communication Services": "Communication Services",
    "Consumer Cyclical": "Consumer Discretionary",
    "Consumer Defensive": "Consumer Staples",
    "Energy": "Energy",
    "Financial Services": "Financials",
    "Healthcare": "Health Care",
    "Industrials": "Industrials",
    "Basic Materials": "Materials",
    "Real Estate": "Real Estate",
    "Utilities": "Utilities",
}

Interval = Tuple[pd.Timestamp, Optional[pd.Timestamp]]


def log(msg: str) -> None:
    print(f"[{dt.datetime.now():%H:%M:%S}] {msg}", flush=True)


def yahoo_symbol(ticker: str) -> str:
    return ticker.strip().upper().replace(".", "-")


def load_config() -> dict:
    with open(CONFIG_PATH, encoding="utf-8") as f:
        return json.load(f)


# ---------------------------------------------------------------------------
# Composizione dell'indice
# ---------------------------------------------------------------------------

def fetch_current_constituents() -> pd.DataFrame:
    """Titoli attuali dell'S&P 500 con settore GICS. Colonne: ticker, nome, gics, aggiunto."""
    frames = []
    try:
        html = requests.get(WIKI_URL, headers=UA, timeout=30).text
        t = pd.read_html(io.StringIO(html))[0]
        frames.append(t)
        log(f"Composizione attuale da Wikipedia: {len(t)} titoli")
    except Exception as e:  # noqa: BLE001
        log(f"Wikipedia non disponibile ({e}); uso il CSV di riserva")
    if not frames:
        txt = requests.get(CONSTITUENTS_CSV, headers=UA, timeout=30).text
        t = pd.read_csv(io.StringIO(txt))
        frames.append(t)
        log(f"Composizione attuale dal CSV: {len(t)} titoli")
    t = frames[0]
    out = pd.DataFrame({
        "ticker": t["Symbol"].astype(str).map(yahoo_symbol),
        "nome": t["Security"].astype(str),
        "gics": t["GICS Sector"].astype(str),
        "aggiunto": pd.to_datetime(t.get("Date added", pd.Series([None] * len(t))), errors="coerce"),
    })
    return out.drop_duplicates("ticker").reset_index(drop=True)


def fetch_membership_intervals() -> Dict[str, List[Interval]]:
    """Periodi di appartenenza all'S&P 500 per ogni ticker (dataset pubblico fja05680/sp500)."""
    txt = requests.get(MEMBERSHIP_CSV, headers=UA, timeout=30).text
    return parse_membership(txt)


def parse_membership(csv_text: str) -> Dict[str, List[Interval]]:
    df = pd.read_csv(io.StringIO(csv_text))
    df["start_date"] = pd.to_datetime(df["start_date"], errors="coerce")
    df["end_date"] = pd.to_datetime(df["end_date"], errors="coerce")
    out: Dict[str, List[Interval]] = {}
    for row in df.itertuples(index=False):
        if pd.isna(row.start_date):
            continue
        end = None if pd.isna(row.end_date) else row.end_date
        out.setdefault(yahoo_symbol(str(row.ticker)), []).append((row.start_date, end))
    return out


def reconcile_membership(current: pd.DataFrame,
                         intervals: Dict[str, List[Interval]],
                         point_in_time: bool) -> Dict[str, List[Interval]]:
    """Allinea i periodi storici con la composizione attuale (che fa fede per l'oggi)."""
    far_past = pd.Timestamp("1900-01-01")
    cur = set(current["ticker"])
    last_known = max((e for iv in intervals.values() for _, e in iv if e is not None),
                     default=pd.Timestamp.today().normalize())
    result: Dict[str, List[Interval]] = {}

    for row in current.itertuples(index=False):
        if not point_in_time:
            result[row.ticker] = [(far_past, None)]
            continue
        ivs = [tuple(i) for i in intervals.get(row.ticker, [])]
        if not pd.isna(row.aggiunto):
            # la data di ingresso della società copre anche i cambi di ticker (es. FB -> META)
            ivs.append((row.aggiunto, None))
        elif not any(e is None for _, e in ivs):
            ivs.append((far_past, None))
        result[row.ticker] = ivs

    if point_in_time:
        for t, ivs in intervals.items():
            if t in cur:
                continue
            # un ticker non più nell'indice: chiudo eventuali periodi rimasti aperti
            result[t] = [(s, e if e is not None else last_known) for s, e in ivs]
    return result


def membership_mask(index: pd.DatetimeIndex, ivs: Iterable[Interval]) -> np.ndarray:
    mask = np.zeros(len(index), dtype=bool)
    vals = index.values
    for s, e in ivs:
        lo = np.searchsorted(vals, np.datetime64(s), side="left")
        hi = len(index) if e is None else np.searchsorted(vals, np.datetime64(e), side="right")
        mask[lo:hi] = True
    return mask


# ---------------------------------------------------------------------------
# Prezzi
# ---------------------------------------------------------------------------

def _extract_field(df: pd.DataFrame, field: str, tickers: List[str]) -> pd.DataFrame:
    if df is None or df.empty:
        return pd.DataFrame()
    if isinstance(df.columns, pd.MultiIndex):
        lv0 = df.columns.get_level_values(0)
        if field in set(lv0):
            sub = df[field]
        else:  # group_by="ticker"
            sub = df.xs(field, axis=1, level=1, drop_level=True)
    else:
        if field not in df.columns:
            return pd.DataFrame()
        sub = df[[field]].rename(columns={field: tickers[0]})
    if isinstance(sub, pd.Series):
        sub = sub.to_frame(tickers[0])
    return sub


def yahoo_downloader(tickers: List[str], start: str, fields=("Close", "Adj Close"),
                     batch: int = 60) -> Dict[str, pd.DataFrame]:
    """Scarica i prezzi da Yahoo Finance a blocchi, con qualche tentativo in caso di errore."""
    import yfinance as yf

    parts: Dict[str, List[pd.DataFrame]] = {f: [] for f in fields}
    tickers = sorted(set(tickers))
    for i in range(0, len(tickers), batch):
        chunk = tickers[i:i + batch]
        for attempt in range(4):
            try:
                df = yf.download(chunk, start=start, auto_adjust=False, actions=False,
                                 group_by="column", threads=True, progress=False,
                                 timeout=30, multi_level_index=True)
                break
            except Exception as e:  # noqa: BLE001
                wait = 5 * 3 ** attempt
                log(f"  errore download ({e}); riprovo tra {wait}s")
                time.sleep(wait)
        else:
            df = pd.DataFrame()
        for f in fields:
            sub = _extract_field(df, f, chunk)
            if not sub.empty:
                parts[f].append(sub)
        log(f"  prezzi {min(i + batch, len(tickers))}/{len(tickers)}")
        time.sleep(1.0)
    out = {}
    for f in fields:
        if parts[f]:
            frame = pd.concat(parts[f], axis=1)
            frame = frame.loc[:, ~frame.columns.duplicated()]
            frame.index = pd.to_datetime(frame.index).tz_localize(None).normalize()
            out[f] = frame.sort_index()
        else:
            out[f] = pd.DataFrame()
    return out


def yahoo_sector_lookup(tickers: List[str], limit: int = 200) -> Dict[str, Optional[str]]:
    """Settore (convertito in GICS) per i ticker non più nell'indice."""
    import yfinance as yf

    found: Dict[str, Optional[str]] = {}
    for n, t in enumerate(tickers[:limit]):
        try:
            info = yf.Ticker(t).get_info() or {}
            found[t] = YAHOO_TO_GICS.get(info.get("sector") or "")
        except Exception:  # noqa: BLE001
            continue  # ci riprova al prossimo aggiornamento
        if n % 25 == 24:
            log(f"  settori ex membri {n + 1}/{min(len(tickers), limit)}")
        time.sleep(0.4)
    return found


# ---------------------------------------------------------------------------
# Calcoli
# ---------------------------------------------------------------------------

def _pct_above(closes: pd.DataFrame, members: pd.DataFrame, window: int) -> Tuple[pd.Series, pd.Series, pd.Series]:
    ma = closes.rolling(window, min_periods=window).mean()
    valid = members & closes.notna() & ma.notna()
    up = ((closes > ma) & valid).sum(axis=1)
    n = valid.sum(axis=1)
    return (up / n.replace(0, np.nan)) * 100, n, up


def breadth(closes: pd.DataFrame, members: pd.DataFrame):
    """% di titoli (tra quelli membri quel giorno) sopra la media 200, 50 e 20.
    Ritorna b200, b50, n200, sopra200, b20."""
    b200, n200, up200 = _pct_above(closes, members, 200)
    b50, _, _ = _pct_above(closes, members, 50)
    b20, _, _ = _pct_above(closes, members, 20)
    return b200, b50, n200, up200, b20


def drawdown_52w(close: pd.Series) -> pd.Series:
    peak = close.rolling(252, min_periods=1).max()
    return (close / peak - 1) * 100


def stock_snapshot(closes: pd.DataFrame, tickers: List[str], names: Dict[str, str]) -> List[dict]:
    rows = []
    for t in tickers:
        if t not in closes.columns:
            continue
        s = closes[t].dropna()
        if len(s) < 50:
            continue
        last = s.iloc[-1]
        ma200 = s.iloc[-200:].mean() if len(s) >= 200 else np.nan
        ma50 = s.iloc[-50:].mean()
        hi52 = s.iloc[-252:].max()
        rows.append({
            "t": t,
            "nome": names.get(t, t),
            "ultimo": rnd(last, 2),
            "v200": rnd((last / ma200 - 1) * 100, 1),
            "v50": rnd((last / ma50 - 1) * 100, 1),
            "dd52": rnd((last / hi52 - 1) * 100, 1),
            "data": s.index[-1].strftime("%Y-%m-%d"),
        })
    rows.sort(key=lambda r: (r["v200"] is None, -(r["v200"] or 0)))
    return rows


def rnd(x, nd: int):
    if x is None:
        return None
    try:
        xf = float(x)
    except (TypeError, ValueError):
        return None
    if math.isnan(xf) or math.isinf(xf):
        return None
    return round(xf, nd)


def to_list(series: pd.Series, nd: int) -> List[Optional[float]]:
    return [rnd(v, nd) for v in series.to_numpy()]


# ---------------------------------------------------------------------------
# Orchestrazione
# ---------------------------------------------------------------------------

def build(cfg: dict,
          current: pd.DataFrame,
          intervals: Dict[str, List[Interval]],
          downloader: Callable[..., Dict[str, pd.DataFrame]],
          sector_lookup: Callable[[List[str]], Dict[str, Optional[str]]],
          out_dir: Path = DATA_DIR) -> dict:
    sectors = cfg["settori"]
    etfs = [s["etf"] for s in sectors]
    point_in_time = bool(cfg.get("includi_ex_membri", True))
    members = reconcile_membership(current, intervals, point_in_time)

    start_hist = pd.Timestamp(cfg["inizio_storico"])
    start_dl = cfg["inizio_download"]
    cur_set = set(current["ticker"])
    ex_members = sorted(t for t, ivs in members.items()
                        if t not in cur_set and any(e is None or e >= start_hist for _, e in ivs))

    # 1) ETF
    log(f"Scarico {len(etfs)} ETF…")
    etf_px = downloader(etfs, start_dl, fields=("Close", "Adj Close"))
    etf_close, etf_adj = etf_px["Close"], etf_px["Adj Close"]
    missing = [e for e in etfs if e not in etf_close.columns or etf_close[e].dropna().empty]
    if missing:
        raise RuntimeError(f"ETF senza dati: {missing}")
    calendar = etf_close.dropna(how="all").index

    # 2) Titoli
    universe = sorted(cur_set | set(ex_members))
    log(f"Scarico {len(universe)} titoli ({len(cur_set)} attuali, {len(ex_members)} ex membri)…")
    stk = downloader(universe, start_dl, fields=("Close",))["Close"]
    stk = stk.reindex(calendar)
    # si pubblica una seduta solo se ha il prezzo di almeno il 99% dei membri attuali
    cur_cols = [t for t in stk.columns if t in cur_set]
    min_cov = float(cfg.get("copertura_minima", 0.99))
    while len(calendar) > 250 and cur_cols:
        cov = stk.loc[calendar[-1], cur_cols].notna().mean()
        if cov >= min_cov:
            break
        log(f"Seduta {calendar[-1]:%Y-%m-%d} incompleta ({cov:.1%} dei titoli): non viene pubblicata")
        calendar = calendar[:-1]
    stk = stk.reindex(calendar).ffill(limit=5)
    etf_close = etf_close.reindex(calendar)
    etf_adj = etf_adj.reindex(calendar)
    have = set(stk.columns[stk.notna().any()])
    coverage = len(have & cur_set) / max(1, len(cur_set))
    log(f"Copertura titoli attuali: {coverage:.1%}")
    if coverage < 0.85:
        raise RuntimeError("Troppi titoli senza prezzi: aggiornamento annullato per non salvare dati incompleti")

    # 3) Settore di ogni ticker
    sector_of: Dict[str, Optional[str]] = dict(zip(current["ticker"], current["gics"]))
    cache_file = out_dir / "cache" / "settori_ex_membri.json"
    cache: Dict[str, Optional[str]] = {}
    if cache_file.exists():
        cache = json.loads(cache_file.read_text(encoding="utf-8"))
    ex_with_data = [t for t in ex_members if t in have]
    todo = [t for t in ex_with_data if t not in cache]
    if todo:
        log(f"Cerco il settore di {len(todo)} ex membri…")
        cache.update(sector_lookup(todo))
        cache_file.parent.mkdir(parents=True, exist_ok=True)
        cache_file.write_text(json.dumps(dict(sorted(cache.items())), indent=0), encoding="utf-8")
    for t in ex_with_data:
        if cache.get(t):
            sector_of[t] = cache[t]

    names = dict(zip(current["ticker"], current["nome"]))
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "settori").mkdir(parents=True, exist_ok=True)
    summary = []
    last_date = calendar[-1]

    for sec in sectors:
        etf, gics = sec["etf"], sec["gics"]
        tick = [t for t in stk.columns if sector_of.get(t) == gics and t in have]
        if not tick:
            log(f"{etf}: nessun titolo trovato, salto")
            continue
        closes = stk[tick]
        mem = pd.DataFrame({t: membership_mask(calendar, members.get(t, [])) for t in tick},
                           index=calendar)
        b200, b50, n200, up200, b20 = breadth(closes, mem)

        close = etf_close[etf].reindex(calendar)
        adj = etf_adj[etf].reindex(calendar)
        ma200 = close.rolling(200, min_periods=200).mean()
        dd = drawdown_52w(close.dropna()).reindex(calendar)

        keep = calendar >= start_hist
        idx = calendar[keep]
        b200_hist = b200[keep].dropna()
        pct = float(cfg.get("percentile_soglia_default", 5))
        auto_level = max(1, int(round(np.nanpercentile(b200_hist, pct)))) if len(b200_hist) else 10
        level = cfg.get("soglie", {}).get(etf, auto_level)

        current_members = [t for t in tick if t in cur_set]
        snap = stock_snapshot(closes[current_members], current_members, names)

        payload = {
            "etf": etf,
            "nome": sec["nome"],
            "gics": gics,
            "aggiornato": last_date.strftime("%Y-%m-%d"),
            "soglia_default": level,
            "simbolo_breadth": sec.get("simbolo_breadth"),
            "date": [d.strftime("%Y-%m-%d") for d in idx],
            "close": to_list(close[keep], 2),
            "adj": to_list(adj[keep], 4),
            "ma200": to_list(ma200[keep], 2),
            "dd": to_list(dd[keep], 2),
            "b200": to_list(b200[keep], 1),
            "b50": to_list(b50[keep], 1),
            "b20": to_list(b20[keep], 1),
            "n": [int(x) for x in n200[keep].to_numpy()],
            "titoli": snap,
        }
        with open(out_dir / "settori" / f"{etf}.json", "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))

        last_b200 = rnd(b200.iloc[-1], 1)
        summary.append({
            "etf": etf, "nome": sec["nome"],
            "b200": last_b200, "b50": rnd(b50.iloc[-1], 1), "b20": rnd(b20.iloc[-1], 1),
            "n": int(n200.iloc[-1]), "sopra": int(up200.iloc[-1]),
            "soglia_default": level,
            "simbolo_breadth": sec.get("simbolo_breadth"),
            "dd": rnd(dd.iloc[-1], 1),
            "ultimo": rnd(close.iloc[-1], 2),
        })
        log(f"{etf}: {len(tick)} titoli nella storia, {len(current_members)} attuali, "
            f"sopra MA200 oggi {last_b200}% · soglia {level}%")

    # ampiezza dell'intero indice (tutti i membri con prezzi, qualunque settore)
    all_tick = [t for t in stk.columns if t in have]
    mem_all = pd.DataFrame({t: membership_mask(calendar, members.get(t, [])) for t in all_tick}, index=calendar)
    i200, i50, in200, iup200, i20 = breadth(stk[all_tick], mem_all)
    keep = calendar >= pd.Timestamp(cfg["inizio_storico"])
    indice = {
        "nome": "S&P 500",
        "simbolo_breadth": "S5TH",
        "aggiornato": last_date.strftime("%Y-%m-%d"),
        "date": [d.strftime("%Y-%m-%d") for d in calendar[keep]],
        "b200": to_list(i200[keep], 1),
        "b50": to_list(i50[keep], 1),
        "b20": to_list(i20[keep], 1),
        "n": [int(x) for x in in200[keep].to_numpy()],
    }
    with open(out_dir / "indice.json", "w", encoding="utf-8") as f:
        json.dump(indice, f, ensure_ascii=False, separators=(",", ":"))

    meta = {
        "aggiornato": last_date.strftime("%Y-%m-%d"),
        "generato": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "settori": summary,
        "fonti": {
            "prezzi": "Yahoo Finance (yfinance)",
            "composizione": "Wikipedia · datasets/s-and-p-500-companies · fja05680/sp500",
        },
        "punto_nel_tempo": point_in_time,
        "indice": {"b200": rnd(i200.iloc[-1], 1), "b50": rnd(i50.iloc[-1], 1), "n": int(in200.iloc[-1])},
        "parametri": cfg.get("parametri", {}),
    }
    with open(out_dir / "meta.json", "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=1)
    return meta


def main() -> int:
    cfg = load_config()
    current = fetch_current_constituents()
    try:
        intervals = fetch_membership_intervals() if cfg.get("includi_ex_membri", True) else {}
    except Exception as e:  # noqa: BLE001
        log(f"Storico composizione non disponibile ({e}): uso solo i titoli attuali")
        intervals = {}
    try:
        meta = build(cfg, current, intervals, yahoo_downloader, yahoo_sector_lookup)
    except RuntimeError as e:
        log(f"ERRORE: {e}")
        return 1
    log(f"Fatto. Dati al {meta['aggiornato']}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
