"""
Test della pipeline con dati simulati (nessuna connessione a Internet).

    python -m pytest test/            oppure        python test/test_build.py [cartella_output]

Con una cartella di output genera un set di dati finti per provare il sito in locale.
"""
from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import build_data as bd  # noqa: E402


def synthetic_market(seed: int = 7):
    rng = np.random.default_rng(seed)
    cfg = bd.load_config()
    dates = pd.bdate_range("2003-09-01", "2026-09-25")
    T = len(dates)
    # fattore di mercato con qualche crisi
    mkt = rng.normal(0.0003, 0.009, T)
    for a, b, drift in [("2007-10-10", "2009-03-06", -0.0025), ("2020-02-20", "2020-03-23", -0.012),
                        ("2022-01-04", "2022-10-12", -0.0012), ("2015-06-01", "2016-02-11", -0.0008),
                        ("2018-10-01", "2018-12-24", -0.0030), ("2026-06-01", "2026-09-25", -0.0012)]:
        m = (dates >= a) & (dates <= b)
        mkt[m] += drift
    rows, closes, intervals = [], {}, {}
    sector_lookup = {}
    for k, sec in enumerate(cfg["settori"]):
        sf = rng.normal(0, 0.006, T)
        # un paio di crisi specifiche per settore
        for _ in range(3):
            s = rng.integers(300, T - 200)
            sf[s:s + rng.integers(40, 160)] -= rng.uniform(0.001, 0.003)
        n = int(rng.integers(20, 70))
        member_rets = []
        for j in range(n + 6):
            t = f"{sec['etf'][:2]}{k:02d}{j:02d}"
            beta = rng.uniform(0.6, 1.4)
            r = beta * mkt + sf + rng.normal(0, 0.014, T)
            px = 50 * np.exp(np.cumsum(r))
            first = 0 if j % 9 else int(rng.integers(500, 3000))  # alcuni quotati più tardi
            px[:first] = np.nan
            closes[t] = px
            member_rets.append(np.nan_to_num(r))
            if j < n:
                rows.append({"ticker": t, "nome": f"Società {t}", "gics": sec["gics"],
                             "aggiunto": pd.NaT})
                if j % 7 == 0:
                    intervals[t] = [(pd.Timestamp("2012-05-01"), None)]
            else:
                # ex membro uscito dall'indice
                intervals[t] = [(pd.Timestamp("2004-01-02"), pd.Timestamp("2016-03-18"))]
                sector_lookup[t] = sec["gics"]
        etf_r = np.mean(member_rets, axis=0)
        etf = 30 * np.exp(np.cumsum(etf_r))
        if sec["etf"] == "XLRE":
            etf[dates < "2015-10-08"] = np.nan
        if sec["etf"] == "XLC":
            etf[dates < "2018-06-19"] = np.nan
        closes[sec["etf"]] = etf
    close_df = pd.DataFrame(closes, index=dates)
    adj_df = close_df * np.linspace(0.55, 1.0, T)[:, None]
    # un ticker "delistato" senza dati
    intervals["MORTO"] = [(pd.Timestamp("2004-01-02"), pd.Timestamp("2009-01-01"))]
    current = pd.DataFrame(rows)

    def downloader(tickers, start, fields=("Close", "Adj Close")):
        cols = [t for t in tickers if t in close_df.columns]
        out = {}
        for f in fields:
            src = close_df if f == "Close" else adj_df
            out[f] = src.loc[src.index >= start, cols]
        return out

    def lookup(tickers):
        return {t: sector_lookup.get(t) for t in tickers}

    return cfg, current, intervals, downloader, lookup


def run(out_dir: Path) -> dict:
    cfg, current, intervals, downloader, lookup = synthetic_market()
    return bd.build(cfg, current, intervals, downloader, lookup, out_dir=out_dir)


def test_build_outputs():
    with tempfile.TemporaryDirectory() as d:
        out = Path(d)
        meta = run(out)
        assert len(meta["settori"]) == 11
        for s in meta["settori"]:
            p = json.loads((out / "settori" / f"{s['etf']}.json").read_text())
            L = len(p["date"])
            for key in ("close", "adj", "ma200", "dd", "b200", "b50", "b20", "n"):
                assert len(p[key]) == L, key
            assert p["date"][0] >= "2005-01-03"
            b = [x for x in p["b200"] if x is not None]
            assert b and min(b) >= 0 and max(b) <= 100
            assert all(x is None or x <= 0.0001 for x in p["dd"])
            assert p["titoli"] and all(set(r) >= {"t", "v200", "v50", "dd52"} for r in p["titoli"])
            assert 1 <= p["soglia_default"] <= 100
        xlre = json.loads((out / "settori" / "XLRE.json").read_text())
        i = xlre["date"].index("2010-01-04")
        assert xlre["close"][i] is None and xlre["b200"][i] is not None
        # la cache dei settori degli ex membri viene scritta
        assert (out / "cache" / "settori_ex_membri.json").exists()


def test_incomplete_last_session_is_dropped():
    cfg, current, intervals, downloader, lookup = synthetic_market()

    def partial(tickers, start, fields=("Close", "Adj Close")):
        out = downloader(tickers, start, fields)
        cl = out["Close"].copy()
        # l'ultima seduta ha solo metà dei titoli attuali
        half = [t for t in cl.columns if t in set(current["ticker"])][::2]
        cl.loc[cl.index[-1], half] = np.nan
        out["Close"] = cl
        return out

    with tempfile.TemporaryDirectory() as d:
        meta = bd.build(cfg, current, intervals, partial, lookup, out_dir=Path(d))
        assert meta["aggiornato"] == "2026-09-24"


def test_membership_mask():
    idx = pd.bdate_range("2020-01-01", "2020-01-31")
    m = bd.membership_mask(idx, [(pd.Timestamp("2020-01-10"), pd.Timestamp("2020-01-15"))])
    assert m.sum() == 4 and m[idx.get_loc(pd.Timestamp("2020-01-10"))]
    m2 = bd.membership_mask(idx, [(pd.Timestamp("2020-01-28"), None)])
    assert m2.sum() == 4


def test_breadth_simple():
    idx = pd.bdate_range("2020-01-01", periods=260)
    up = pd.Series(np.linspace(10, 20, 260), index=idx)
    down = pd.Series(np.linspace(20, 10, 260), index=idx)
    closes = pd.DataFrame({"A": up, "B": down})
    mem = pd.DataFrame(True, index=idx, columns=closes.columns)
    b200, b50, n, sopra, b20 = bd.breadth(closes, mem)
    assert b200.iloc[-1] == 50 and n.iloc[-1] == 2 and sopra.iloc[-1] == 1
    assert b20.iloc[-1] == 50 and np.isnan(b20.iloc[5])
    assert np.isnan(b200.iloc[10])
    mem.loc[:, "B"] = False
    b200, *_ = bd.breadth(closes, mem)
    assert b200.iloc[-1] == 100


def test_extract_field_layouts():
    idx = pd.bdate_range("2021-01-01", periods=3)
    cols = pd.MultiIndex.from_product([["Close", "Adj Close"], ["AAA", "BBB"]])
    df = pd.DataFrame(np.arange(12).reshape(3, 4), index=idx, columns=cols)
    assert list(bd._extract_field(df, "Close", ["AAA", "BBB"]).columns) == ["AAA", "BBB"]
    cols2 = pd.MultiIndex.from_product([["AAA", "BBB"], ["Close", "Adj Close"]])
    df2 = pd.DataFrame(np.arange(12).reshape(3, 4), index=idx, columns=cols2)
    assert list(bd._extract_field(df2, "Close", ["AAA", "BBB"]).columns) == ["AAA", "BBB"]
    flat = pd.DataFrame({"Close": [1, 2, 3]}, index=idx)
    assert list(bd._extract_field(flat, "Close", ["AAA"]).columns) == ["AAA"]


if __name__ == "__main__":
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(tempfile.mkdtemp())
    meta = run(target)
    print(json.dumps(meta["settori"], indent=1)[:1500])
    print("dati simulati in", target)
