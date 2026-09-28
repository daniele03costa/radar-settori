"""
Test dello script dei prezzi con dati simulati (nessuna connessione a Internet).

    python -m pytest            oppure        python test_prices.py [cartella_output]
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
import build_prices as bp  # noqa: E402


def fake_market(symbols, start, end="2026-09-25", seed=3, weekend=()):
    rng = np.random.default_rng(seed)
    days = pd.bdate_range(start, end)
    all_days = pd.date_range(start, end)
    mkt = rng.normal(0.0003, 0.009, len(days))
    out = {}
    for k, s in enumerate(symbols):
        beta = rng.uniform(0.3, 1.4)
        drift = rng.normal(0.0002, 0.0004)
        # rotazioni: ogni titolo ha cicli di forza relativa di periodo diverso
        cyc = 0.0015 * np.sin(np.arange(len(days)) / rng.uniform(40, 120) + rng.uniform(0, 6))
        r = beta * mkt + drift + cyc + rng.normal(0, 0.008, len(days))
        px = rng.uniform(20, 300) * np.exp(np.cumsum(r))
        ser = pd.Series(px, index=days)
        if s in weekend:
            ser = ser.reindex(all_days).interpolate()
        out[s] = ser
    return pd.DataFrame(out)


def test_usa_basic_rules():
    syms = ["SPY", "QQQ", "XLK", "XLU"]
    df = fake_market(syms, "2024-01-01")
    df.loc[df.index[-1], "XLU"] = np.nan              # ultima seduta incompleta
    df.loc[pd.Timestamp("2025-03-12"), "XLK"] *= 1.35  # errore isolato che rientra il giorno dopo
    with tempfile.TemporaryDirectory() as d:
        out = Path(d) / "prezzi_usa.json"
        r = bp.build_market("USA", syms, {s: {} for s in syms}, "2024-01-01", lambda s, st: df[s], out)
        assert r is not None
        p = json.loads(out.read_text())
        assert p["aggiornato"] == df.index[-2].strftime("%Y-%m-%d")
        assert any(c["titolo"] == "XLK" and c["data"] == "2025-03-12" for c in p["correzioni"])
        i = p["date"].index("2025-03-12")
        v = p["serie"]["XLK"]
        assert abs(v[i] / v[i - 1] - 1) < 0.1


def test_global_crypto_fx_and_last_quote():
    syms = ["SWDA.MI", "EIMI.MI", "SGLD.MI", "USDETF", "BTC-EUR"]
    df = fake_market(syms, "2024-01-01", end="2026-09-24", weekend=("BTC-EUR",))
    fx = pd.DataFrame({"EURUSD=X": pd.Series(1.10, index=pd.bdate_range("2024-01-01", "2026-09-25"))})
    info = {s: {} for s in syms}
    info["USDETF"] = {"valuta": "USD"}
    raw_usd_last = df["USDETF"].iloc[-1]
    quotes = {s: (pd.Timestamp("2026-09-25"), float(df[s].iloc[-1] * 1.01)) for s in syms if s != "BTC-EUR"}
    with tempfile.TemporaryDirectory() as d:
        out = Path(d) / "prezzi_globali.json"
        r = bp.build_market("Globali", syms, info, "2024-01-01", lambda s, st: df.reindex(columns=s), out,
                            fx_downloader=lambda s, st: fx, last_quotes=lambda s: quotes,
                            calendar_name="Borsa Italiana")
        assert r is not None
        p = json.loads(out.read_text())
        assert p["aggiornato"] == "2026-09-25"              # chiusura di oggi presa dall'ultimo prezzo
        assert "2025-03-15" not in p["date"]                # sabato: non è una seduta
        # conversione: 1 euro = 1,10 dollari
        i = p["date"].index("2026-09-24")
        assert abs(p["serie"]["USDETF"][i] - raw_usd_last / 1.10) < 0.01
        assert p["serie"]["BTC-EUR"][i] is not None


def test_not_older_than_published():
    syms = ["SPY", "XLK"]
    df = fake_market(syms, "2024-01-01", end="2026-06-30")
    with tempfile.TemporaryDirectory() as d:
        out = Path(d) / "prezzi_usa.json"
        out.write_text(json.dumps({"aggiornato": "2026-09-25"}))
        r = bp.build_market("USA", syms, {s: {} for s in syms}, "2024-01-01", lambda s, st: df[s], out)
        assert r is None
        assert json.loads(out.read_text())["aggiornato"] == "2026-09-25"


def test_too_few_responses_keeps_file():
    syms = ["A", "B", "C", "D", "E"]
    df = fake_market(syms, "2024-01-01")
    df[["C", "D"]] = np.nan
    with tempfile.TemporaryDirectory() as d:
        out = Path(d) / "x.json"
        assert bp.build_market("USA", syms, {s: {} for s in syms}, "2024-01-01", lambda s, st: df[s], out) is None
        assert not out.exists()


def test_crypto_alignment_max_age():
    cal = pd.bdate_range("2026-01-05", "2026-01-16")
    s = pd.Series([100.0, 101.0], index=pd.to_datetime(["2026-01-03", "2026-01-11"]))
    a = bp.align_crypto(s, cal)
    assert a.loc["2026-01-06"] == 100.0
    assert np.isnan(a.loc["2026-01-08"])       # fermo da 5 giorni
    assert a.loc["2026-01-12"] == 101.0


def write_demo(out_dir: Path) -> None:
    """Scrive prezzi simulati per provare il sito in locale."""
    u = bp.load_universe()
    syms, info = bp.usa_symbols(u)
    df = fake_market(syms, u["inizio"], seed=11)
    bp.build_market("USA", syms, info, u["inizio"], lambda s, st: df[s], out_dir / "prezzi_usa.json")
    syms, info = bp.global_symbols(u)
    df = fake_market(syms, u["inizio"], seed=12, weekend=("BTC-EUR",))
    df.loc[df.index < "2024-03-01", "MWEQ.MI"] = np.nan   # quotato dal 2024
    bp.build_market("Globali", syms, info, u["inizio"], lambda s, st: df.reindex(columns=s),
                    out_dir / "prezzi_globali.json", calendar_name="Borsa Italiana")


if __name__ == "__main__":
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(tempfile.mkdtemp())
    write_demo(target)
    print("prezzi simulati in", target)
