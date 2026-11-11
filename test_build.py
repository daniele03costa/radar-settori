"""
Test della pipeline con dati simulati (nessuna connessione a Internet).

    python -m pytest            oppure        python test_build.py [cartella_output]

Con una cartella di output genera un set di dati finti per provare il sito in locale.
"""
from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
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
    closes["SPY"] = 100 * np.exp(np.cumsum(mkt))               # il prezzo dell'S&P 500 per lo storico dell'ampiezza
    close_df = pd.DataFrame(closes, index=dates)
    adj_df = close_df * np.linspace(0.55, 1.0, T)[:, None]
    # un ticker "delistato" senza dati
    intervals["MORTO"] = [(pd.Timestamp("2004-01-02"), pd.Timestamp("2009-01-01"))]
    # un membro appena entrato di cui Yahoo non ha ancora prezzi
    rows.append({"ticker": "NUOVO", "nome": "Nuova Quotata", "gics": cfg["settori"][0]["gics"], "aggiunto": pd.NaT})
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


DOPO_LA_CHIUSURA = pd.Timestamp("2026-09-25 22:40", tz="UTC")   # 18:40 a New York


def run(out_dir: Path) -> dict:
    cfg, current, intervals, downloader, lookup = synthetic_market()
    return bd.build(cfg, current, intervals, downloader, lookup, out_dir=out_dir, adesso=DOPO_LA_CHIUSURA)


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
        # l'ampiezza dell'intero indice con il prezzo di SPY, sulle stesse date
        ind = json.loads((out / "indice.json").read_text())
        assert len(ind["close"]) == len(ind["date"]) == len(ind["b200"]) and ind["close"][-1] is not None
        assert ind["prezzo"] == "S&P 500 (ETF SPY)"
        # SPY non è un settore
        assert "SPY" not in [x["etf"] for x in meta["settori"]]
        # le chiusure delle azioni per la pagina Azioni, nella forma di prezzi_europa.json
        pz = json.loads((out / "prezzi_sp500.json").read_text())
        assert pz["aggiornato"] == meta["aggiornato"] and pz["date"][-1] == meta["aggiornato"] and pz["date"][0] >= "2024-01-01"
        assert pz["indici"][0]["yahoo"] == "SPY" and len(pz["indici"][0]["prezzi"]) + pz["indici"][0]["i0"] == len(pz["date"])
        assert len(pz["titoli"]) > 300 and "NUOVO" not in [x["t"] for x in pz["titoli"]]
        x0 = pz["titoli"][0]
        assert set(x0) >= {"t", "nome", "indici", "paese", "settore", "valuta", "i0", "prezzi"} and x0["valuta"] == "USD"
        assert len(x0["prezzi"]) + x0["i0"] == len(pz["date"]) and x0["settore"] in [z["nome"] for z in meta["settori"]]
        # la cache dei settori degli ex membri viene scritta
        assert (out / "cache" / "settori_ex_membri.json").exists()
        # l'elenco per la ricerca contiene ogni azione attuale una volta sola, con il suo settore
        elenco = json.loads((out / "titoli.json").read_text())["titoli"]
        cfg, current, *_ = synthetic_market()
        assert sorted(r["t"] for r in elenco) == sorted(current["ticker"])
        etf_di = {s["gics"]: s["etf"] for s in cfg["settori"]}
        attesi = dict(zip(current["ticker"], current["gics"].map(etf_di)))
        assert all(r["etf"] == attesi[r["t"]] for r in elenco)
        nuovo = next(r for r in elenco if r["t"] == "NUOVO")
        assert nuovo.get("senza_prezzi") is True
        assert sum(1 for r in elenco if r.get("senza_prezzi")) == 1
        # riepilogo degli stati per l'avviso del mattino (serve Node)
        import shutil
        if shutil.which("node"):
            assert bd.aggiorna_stati(out)
            st = json.loads((out / "stati.json").read_text())
            assert st["aggiornato"] == meta["aggiornato"] and len(st["settori"]) == 11
            assert all(s["stato"] in ("normale", "attenzione", "blu", "trigger", "fallito", "cooldown") for s in st["settori"])
            assert all(s["titoli_che_mancano"] >= 0 for s in st["settori"])
            assert all(c["data"] == st["aggiornato"] for c in st["cambi_ultima_seduta"])
            assert st["prossima_seduta"] > st["aggiornato"]


def test_prezzi_azioni_e_ultimi_prezzi():
    """La pagina Azioni degli USA (prezzi_sp500.json) e la seduta che Yahoo non ha ancora nella serie giornaliera."""
    cfg, current, intervals, downloader, lookup = synthetic_market()
    ultima = None

    def senza_ultima(tickers, start, fields=("Close", "Adj Close")):
        # Yahoo in ritardo: nella serie giornaliera manca l'ultima seduta
        nonlocal ultima
        out = downloader(tickers, start, fields)
        ultima = max(ultima or pd.Timestamp("2000-01-01"), max(f.index[-1] for f in out.values()))
        return {k: f.iloc[:-1] for k, f in out.items()}

    pieno = downloader(list(current["ticker"]) + [s["etf"] for s in cfg["settori"]] + ["SPY"], cfg["inizio_download"], ("Close",))["Close"]

    def ultimi(simboli):
        return {t: (pieno.index[-1], float(pieno[t].iloc[-1])) for t in simboli if t in pieno.columns and pd.notna(pieno[t].iloc[-1])}

    with tempfile.TemporaryDirectory() as d:
        out = Path(d)
        adesso = pd.Timestamp("2026-09-26 03:00", tz="UTC")
        m0 = bd.build(cfg, current, intervals, senza_ultima, lookup, out_dir=out, adesso=adesso)
        m1 = bd.build(cfg, current, intervals, senza_ultima, lookup, out_dir=out, adesso=adesso, ultimi=ultimi)
        # senza ripiego ci si ferma alla seduta prima; con gli ultimi prezzi si arriva a quella giusta
        assert m0["aggiornato"] < m1["aggiornato"] == ultima.strftime("%Y-%m-%d")
        p = json.loads((out / "prezzi_sp500.json").read_text())
        assert p["aggiornato"] == m1["aggiornato"] and p["date"][0][:4] == str(ultima.year - 2)
        assert [i["yahoo"] for i in p["indici"]] == ["SPY"]
        t = p["titoli"][0]
        assert set(t) >= {"t", "nome", "indici", "paese", "settore", "valuta", "i0", "prezzi"} and t["valuta"] == "USD"
        assert all(len(x["prezzi"]) + x["i0"] == len(p["date"]) for x in p["titoli"])
        nomi = {s["nome"] for s in cfg["settori"]}
        assert all(x["settore"] in nomi for x in p["titoli"]) and len(p["titoli"]) >= 0.95 * (len(current) - 1)
        assert "NUOVO" not in [x["t"] for x in p["titoli"]]
        # un prezzo di una seduta diversa non si aggiunge
        px, n = bd.aggiungi_ultimi(pieno.iloc[:-1], {pieno.columns[0]: (pieno.index[-1], 5.0)}, solo_il=pieno.index[-2])
        assert n == 0 and len(px) == len(pieno) - 1


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
        meta = bd.build(cfg, current, intervals, partial, lookup, out_dir=Path(d), adesso=DOPO_LA_CHIUSURA)
        assert meta["aggiornato"] == "2026-09-24"


def test_session_still_open_is_not_published():
    """Lanciato alle 15:45 italiane (9:45 a New York) usa le chiusure del giorno prima."""
    cfg, current, intervals, downloader, lookup = synthetic_market()
    with tempfile.TemporaryDirectory() as d:
        meta = bd.build(cfg, current, intervals, downloader, lookup, out_dir=Path(d),
                        adesso=pd.Timestamp("2026-09-25 13:45", tz="UTC"))
        assert meta["aggiornato"] == "2026-09-24"
        p = json.loads((Path(d) / "settori" / "XLK.json").read_text())
        assert p["date"][-1] == "2026-09-24"


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


def test_ultima_seduta_dagli_ultimi_prezzi():
    """Yahoo non ha ancora la seduta nella serie giornaliera: si completa con gli ultimi prezzi scambiati."""
    cfg, current, intervals, downloader, lookup = synthetic_market()
    pieno = downloader(["XLK"], "2003-09-01", fields=("Close",))["Close"]
    ultimo, prima = pieno.index[-1], pieno.index[-2]

    def senza_ultima(tickers, start, fields=("Close", "Adj Close")):
        return {f: df[df.index < ultimo] for f, df in downloader(tickers, start, fields=fields).items()}

    def ultimi(simboli):
        px = downloader(simboli, "2003-09-01", fields=("Close",))["Close"]
        return {t: (ultimo, float(px[t].iloc[-1])) for t in px.columns if pd.notna(px[t].iloc[-1])}

    adesso = pd.Timestamp(ultimo) + pd.Timedelta(hours=30)       # la notte dopo la chiusura
    with tempfile.TemporaryDirectory() as d:
        meta = bd.build(cfg, current, intervals, senza_ultima, lookup, out_dir=Path(d), adesso=adesso)
        assert meta["aggiornato"] == prima.strftime("%Y-%m-%d")
    with tempfile.TemporaryDirectory() as d:
        meta = bd.build(cfg, current, intervals, senza_ultima, lookup, out_dir=Path(d), adesso=adesso, ultimi=ultimi)
        assert meta["aggiornato"] == ultimo.strftime("%Y-%m-%d")
        xlk = json.loads((Path(d) / "settori" / "XLK.json").read_text())
        assert xlk["date"][-1] == meta["aggiornato"] and xlk["close"][-1] is not None and xlk["adj"][-1] is not None
        assert xlk["b200"][-1] is not None
    # gli ultimi prezzi arrivano per tutti tranne un ETF: quella seduta non si pubblica (niente settori con il prezzo vuoto)
    with tempfile.TemporaryDirectory() as d:
        senza_xlk = lambda simboli: {t: v for t, v in ultimi(simboli).items() if t != "XLK"}  # noqa: E731
        meta = bd.build(cfg, current, intervals, senza_ultima, lookup, out_dir=Path(d), adesso=adesso, ultimi=senza_xlk)
        assert meta["aggiornato"] == prima.strftime("%Y-%m-%d")
        xlk = json.loads((Path(d) / "settori" / "XLK.json").read_text())
        assert xlk["close"][-1] is not None
    # un prezzo della seduta sbagliata o non valido non entra
    px = pd.DataFrame({"A": [1.0, 2.0]}, index=pd.to_datetime(["2026-10-12", "2026-10-13"]))
    px2, n = bd.aggiungi_ultimi(px, {"A": (pd.Timestamp("2026-10-13"), 9.0), "B": (pd.Timestamp("2026-10-14"), 5.0)})
    assert n == 0 and px2.equals(px)
    px3, n = bd.aggiungi_ultimi(px, {"A": (pd.Timestamp("2026-10-14"), 3.0)}, solo_il=pd.Timestamp("2026-10-15"))
    assert n == 0
