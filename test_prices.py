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
                            calendar_name="Borsa Italiana", adesso=pd.Timestamp("2026-09-25 22:40", tz="UTC"))
        assert r is not None
        p = json.loads(out.read_text())
        assert p["aggiornato"] == "2026-09-25"              # chiusura di oggi presa dall'ultimo prezzo
        assert "2025-03-15" not in p["date"]                # sabato: non è una seduta
        # conversione: 1 euro = 1,10 dollari
        i = p["date"].index("2026-09-24")
        assert abs(p["serie"]["USDETF"][i] - raw_usd_last / 1.10) < 0.01
        assert p["serie"]["BTC-EUR"][i] is not None


def test_open_session_is_dropped():
    """Durante la seduta i prezzi di oggi non sono chiusure: si pubblica fino al giorno prima."""
    syms = ["SPY", "QQQ", "XLK"]
    df = fake_market(syms, "2024-01-01")                        # ultimo giorno: 25/09/2026
    with tempfile.TemporaryDirectory() as d:
        out = Path(d) / "prezzi_usa.json"
        aperta = pd.Timestamp("2026-09-25 13:45", tz="UTC")     # 9:45 a New York
        bp.build_market("USA", syms, {s: {} for s in syms}, "2024-01-01", lambda s, st: df[s], out, adesso=aperta)
        assert json.loads(out.read_text())["aggiornato"] == "2026-09-24"
        chiusa = pd.Timestamp("2026-09-25 21:00", tz="UTC")     # 17:00 a New York
        bp.build_market("USA", syms, {s: {} for s in syms}, "2024-01-01", lambda s, st: df[s], out, adesso=chiusa)
        assert json.loads(out.read_text())["aggiornato"] == "2026-09-25"
    # borsa europea alle 15:45 italiane: anche l'ultimo prezzo di oggi viene scartato
    gl = ["SWDA.MI", "EIMI.MI"]
    dg = fake_market(gl, "2024-01-01", end="2026-09-24")
    quotes = {s: (pd.Timestamp("2026-09-25"), float(dg[s].iloc[-1])) for s in gl}
    with tempfile.TemporaryDirectory() as d:
        out = Path(d) / "prezzi_globali.json"
        bp.build_market("Globali", gl, {s: {} for s in gl}, "2024-01-01", lambda s, st: dg.reindex(columns=s), out,
                        last_quotes=lambda s: quotes, calendar_name="Borsa Italiana",
                        adesso=pd.Timestamp("2026-09-25 13:45", tz="UTC"))
        assert json.loads(out.read_text())["aggiornato"] == "2026-09-24"


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


def test_my_stocks_list_and_prices():
    with tempfile.TemporaryDirectory() as d:
        lista = Path(d) / "miei-titoli.txt"
        lista.write_text("# commento\nmsft Microsoft\n\nENEL.MI Enel  # a Milano\nNONESISTE\nMSFT doppione\n", encoding="utf-8")
        assert bp.leggi_lista(lista) == [("MSFT", "Microsoft"), ("ENEL.MI", "Enel"), ("NONESISTE", "")]
        assert bp.mercato_di("ENEL.MI") == ("europa", "EUR") and bp.mercato_di("BRK-B") == ("usa", "USD")
        assert bp.mercato_di("7203.T") == ("altro", "JPY") and bp.mercato_di("PETR4.SA") == ("altro", "")
        syms = ["MSFT", "ENEL.MI", "SPY", "IUSQ.DE"]
        df = fake_market(syms, "2023-01-01")
        out = Path(d) / "prezzi_miei.json"
        r = bp.build_miei(lista, out, lambda s, st: df.reindex(columns=s), adesso=pd.Timestamp("2026-09-25 13:45", tz="UTC"),
                          portafoglio=None, info=None)
        p = json.loads(out.read_text())
        assert r["mancanti"] == ["NONESISTE"] and p["mancanti"] == ["NONESISTE"]
        assert [x["t"] for x in p["titoli"]] == ["MSFT", "ENEL.MI"]
        assert p["titoli"][1]["valuta"] == "EUR" and p["titoli"][0]["mercato"] == "usa"
        assert p["titoli"][0]["date"][-1] == "2026-09-24"          # seduta di oggi ancora aperta
        assert set(p["confronti"]) == {"usa", "europa"}


def test_portfolio_tickers_fx_and_details():
    """I titoli del portafoglio si scaricano anche se non sono nella lista; cambi in euro; dettagli di Yahoo in cache."""
    with tempfile.TemporaryDirectory() as d:
        lista = Path(d) / "miei-titoli.txt"
        lista.write_text("MSFT Microsoft\n", encoding="utf-8")
        port = Path(d) / "portafoglio.txt"
        port.write_text("# ticker quantità prezzo\nMSFT 10 395,20\nIUSQ.DE 120 78,5\nCSPX.L 3 610\nBTC-EUR 0,05 52000\nLIQUIDITA 2500\n",
                        encoding="utf-8")
        assert bp.ticker_portafoglio(port) == ["MSFT", "IUSQ.DE", "CSPX.L", "BTC-EUR"]
        assert bp.mercato_di("BTC-EUR") == ("crypto", "EUR") and bp.mercato_di("BRK-B") == ("usa", "USD")
        syms = ["MSFT", "IUSQ.DE", "CSPX.L", "SPY", "EURUSD=X", "EURGBP=X", "EURCHF=X"]
        df = fake_market(syms, "2023-01-01", end="2026-09-28")
        btc = fake_market(["BTC-EUR"], "2023-01-01", end="2026-09-29", weekend=("BTC-EUR",))
        df = df.join(btc, how="outer")
        chiamate = []

        def info(simboli):
            chiamate.append(list(simboli))
            return {"CSPX.L": {"tipo": "ETF", "settore": None, "paese": None, "nome_yahoo": "iShares Core S&P 500", "valuta_yahoo": "USD"},
                    "MSFT": {"tipo": "Azione", "settore": "Tecnologia", "paese": "Stati Uniti", "nome_yahoo": "Microsoft", "valuta_yahoo": "USD"}}
        out = Path(d) / "prezzi_miei.json"
        adesso = pd.Timestamp("2026-09-29 06:00", tz="UTC")
        r = bp.build_miei(lista, out, lambda s, st: df.reindex(columns=s), adesso=adesso, portafoglio=port, info=info)
        p = json.loads(out.read_text())
        per = {x["t"]: x for x in p["titoli"]}
        assert set(per) == {"MSFT", "IUSQ.DE", "CSPX.L", "BTC-EUR"} and per["CSPX.L"]["dal_portafoglio"]
        assert per["CSPX.L"]["valuta"] == "USD" and per["CSPX.L"]["tipo"] == "ETF"       # la valuta di Yahoo vince sul suffisso
        assert per["MSFT"]["settore"] == "Tecnologia" and per["MSFT"]["nome"] == "Microsoft"
        assert per["BTC-EUR"]["date"][-1] == "2026-09-28"                                 # giornata UTC del 29 in corso
        assert set(p["cambi"]) == {"USD", "GBP", "CHF"} and len(p["cambi"]["USD"]["valori"]) > 500
        # la volta dopo i dettagli arrivano dal file già pubblicato, senza chiedere a Yahoo
        bp.build_miei(lista, out, lambda s, st: df.reindex(columns=s), adesso=adesso, portafoglio=port, info=info)
        assert chiamate[1:] == [] or all(t not in ("MSFT", "CSPX.L") for t in chiamate[1])
        assert json.loads(out.read_text())["titoli"][0]["settore"] == "Tecnologia"
        # portafoglio protetto con password: i ticker non si leggono
        port.write_text("RADAR-CIFRATO 1\nabc\n", encoding="utf-8")
        assert bp.ticker_portafoglio(port) == []


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
