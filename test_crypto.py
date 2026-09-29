"""Test della vista Crypto (dati simulati, senza rete): python -m pytest test_crypto.py"""
import json
import tempfile
from pathlib import Path

import numpy as np
import pandas as pd

import build_crypto as bc

ADESSO = pd.Timestamp("2026-09-29 06:00", tz="UTC")     # le 8 italiane: la giornata UTC del 29 è in corso


def mercato_finto(simboli, giorni, seed=3, prezzi_finali=None):
    """Chiusure giornaliere simulate fino a oggi compreso (la barra di oggi è parziale, come su Yahoo)."""
    rng = np.random.default_rng(seed)
    idx = pd.date_range(end="2026-09-29", periods=giorni, freq="D")
    cols = {}
    for k, s in enumerate(simboli):
        r = rng.normal(0.0005, 0.03, len(idx))
        p = 100 * np.exp(np.cumsum(r))
        if prezzi_finali and s in prezzi_finali:
            p = p / p[-2] * prezzi_finali[s]
        cols[s] = p
    return pd.DataFrame(cols, index=idx)


def classifica_finta():
    righe = [("bitcoin", "btc", "Bitcoin", 83000), ("ethereum", "eth", "Ethereum", 2700), ("tether", "usdt", "Tether", 1.0),
             ("binancecoin", "bnb", "BNB", 760), ("ripple", "xrp", "XRP", 1.5), ("usd-coin", "usdc", "USDC", 1.0),
             ("solana", "sol", "Solana", 119), ("tron", "trx", "TRON", 0.33), ("zcash", "zec", "Zcash", 1400),
             ("figure-heloc", "figr_heloc", "Figure Heloc", 1.0), ("hyperliquid", "hype", "Hyperliquid", 88),
             ("dogecoin", "doge", "Dogecoin", 0.094), ("wrapped-bitcoin", "wbtc", "Wrapped Bitcoin", 83000),
             ("chainlink", "link", "Chainlink", 15), ("monero", "xmr", "Monero", 544), ("cardano", "ada", "Cardano", 0.25),
             ("ethena-usde", "usde", "Ethena USDe", 1.0), ("stellar", "xlm", "Stellar", 0.22)]
    return [{"id": i, "symbol": s, "name": n, "current_price": p, "market_cap": 1e9 * (30 - k), "market_cap_rank": k + 1}
            for k, (i, s, n, p) in enumerate(righe)]


def paura_finta(giorni=40):
    fine = pd.Timestamp("2026-09-29")
    return {"name": "Fear and Greed Index", "data": [
        {"value": str(20 + k), "value_classification": "Fear", "timestamp": str(int((fine - pd.Timedelta(days=k)).timestamp()))}
        for k in range(giorni)]}


def paprika_finta():
    """Stessa classifica nel formato di CoinPaprika (id diversi, stablecoin dentro)."""
    return [{"id": f"{c['symbol']}-{c['id']}", "symbol": c["symbol"].upper(), "name": c["name"], "rank": c["market_cap_rank"],
             "quotes": {"USD": {"price": c["current_price"], "market_cap": c["market_cap"]}}} for c in classifica_finta()]


def fonte_finta(guasti=()):
    def prendi(url):
        if any(g in url for g in guasti):
            return None
        if "coingecko" in url and "coins/markets" in url:
            return classifica_finta()
        if "coingecko" in url and "/global" in url:
            return {"data": {"market_cap_percentage": {"btc": 56.2, "eth": 11.1}, "total_market_cap": {"usd": 2.98e12}}}
        if "coinpaprika" in url and "/tickers" in url:
            return paprika_finta()
        if "coinpaprika" in url and "/global" in url:
            return {"market_cap_usd": 2.95e12, "bitcoin_dominance_percentage": 57.3}
        if "fng" in url:
            return paura_finta()
        return None
    return prendi


def test_exclusions_and_tickers():
    cfg = bc.carica_config()
    cl = bc.classifica_coingecko(cfg, fonte_finta())
    ids = [c["id"] for c in cl]
    assert "tether" not in ids and "usd-coin" not in ids and "ethena-usde" not in ids
    assert "wrapped-bitcoin" not in ids and "figure-heloc" not in ids
    assert ids[:4] == ["bitcoin", "ethereum", "binancecoin", "ripple"]
    hype = next(c for c in cl if c["id"] == "hyperliquid")
    assert hype["yahoo"] == "HYPE32196-USD" and hype["simbolo"] == "HYPE"
    assert next(c for c in cl if c["id"] == "zcash")["yahoo"] == "ZEC-USD"


def test_build_top10_closed_days_and_checks():
    cfg = bc.carica_config()
    cl = bc.classifica_coingecko(cfg, fonte_finta())
    finali = {c["yahoo"]: c["prezzo"] for c in cl}
    finali["SOL-USD"] = 9.0                       # ticker che porta a un'altra moneta: prezzo lontanissimo
    yahoo = [c["yahoo"] for c in cl]
    px = mercato_finto(yahoo, 800, prezzi_finali=finali)
    px["ADA-USD"] = 1.0 + np.random.default_rng(9).normal(0, 0.0005, len(px))   # si comporta da stablecoin
    mk = mercato_finto(list(cfg["mercati"]), 800, seed=5)
    mk = mk[mk.index.dayofweek < 5]              # le borse sono chiuse nel fine settimana

    def scarica(simboli, inizio):
        return (mk if "QQQ" in simboli else px).reindex(columns=simboli)

    with tempfile.TemporaryDirectory() as d:
        out = Path(d) / "prezzi_crypto.json"
        r = bc.build_crypto(out, cfg, scarica, fonte_finta(), adesso=ADESSO, scarica_orari=None)
        p = json.loads(out.read_text())
        simboli = [m["simbolo"] for m in p["monete"]]
        assert r and len(simboli) == 10 and simboli[0] == "BTC"
        assert "SOL" not in simboli and "ADA" not in simboli          # ticker sbagliato e finta stablecoin
        assert simboli == ["BTC", "ETH", "BNB", "XRP", "TRX", "ZEC", "HYPE", "DOGE", "LINK", "XMR"]
        assert p["aggiornato"] == "2026-09-28" and p["date"][-1] == "2026-09-28"   # la giornata UTC in corso non c'è
        assert len(p["date"]) == len(p["monete"][0]["prezzi"]) + p["monete"][0]["i0"]
        assert p["fonte_classifica"] == "CoinGecko" and p["dominanza"]["btc"] == 56.2
        # Fear & Greed: il valore del 29 (mezzanotte UTC) vale per la chiusura del 28
        paura = p["paura"]
        assert paura["valori"][-1] == 20 and p["date"][paura["i0"] + len(paura["valori"]) - 1] == "2026-09-28"
        # mercati: vuoti nel fine settimana, seduta USA del 29 ancora aperta alle 8 italiane
        qqq = next(m for m in p["mercati"] if m["t"] == "QQQ")
        sab = p["date"].index("2026-09-26")
        assert qqq["prezzi"][sab] is None and qqq["prezzi"][-1] is not None
        # dati più vecchi di quelli pubblicati: il file resta com'è
        prima = out.read_text()
        vecchi = px[px.index <= "2026-09-20"]
        r2 = bc.build_crypto(out, cfg, lambda s, i: (mk if "QQQ" in s else vecchi).reindex(columns=s), fonte_finta(), adesso=ADESSO,
                             scarica_orari=None)
        assert r2 is None and out.read_text() == prima


def test_coingecko_down_uses_backup_list():
    cfg = bc.carica_config()
    yahoo = [c["yahoo"] for c in cfg["riserva"]]
    px = mercato_finto(yahoo, 400, seed=7)
    with tempfile.TemporaryDirectory() as d:
        out = Path(d) / "prezzi_crypto.json"
        giu = ("coingecko", "coinpaprika")
        r = bc.build_crypto(out, cfg, lambda s, i: px.reindex(columns=s), fonte_finta(guasti=giu), adesso=ADESSO, scarica_orari=None)
        p = json.loads(out.read_text())
        assert r["fonte"] == "lista di riserva" and len(p["monete"]) == 10
        assert p["dominanza"] is None and p["paura"] is not None
        # la volta dopo, senza CoinGecko, si riparte dalla lista già pubblicata
        r2 = bc.build_crypto(out, cfg, lambda s, i: px.reindex(columns=s), fonte_finta(guasti=giu), adesso=ADESSO, scarica_orari=None)
        assert r2["fonte"] == "lista precedente"


def test_coinpaprika_when_coingecko_is_down():
    cfg = bc.carica_config()
    cl = bc.classifica_coinpaprika(cfg, fonte_finta())
    simboli = [c["simbolo"] for c in cl]
    assert "USDT" not in simboli and "USDC" not in simboli and "USDE" not in simboli and "WBTC" not in simboli
    assert "FIGR_HELOC" not in simboli and simboli[:4] == ["BTC", "ETH", "BNB", "XRP"]
    assert next(c for c in cl if c["simbolo"] == "HYPE")["yahoo"] == "HYPE32196-USD"      # ticker trovato dal simbolo
    finali = {c["yahoo"]: c["prezzo"] for c in cl}
    px = mercato_finto(list(finali), 500, prezzi_finali=finali)
    with tempfile.TemporaryDirectory() as d:
        out = Path(d) / "prezzi_crypto.json"
        r = bc.build_crypto(out, cfg, lambda s, i: px.reindex(columns=s), fonte_finta(guasti=("coingecko",)), adesso=ADESSO, scarica_orari=None)
        p = json.loads(out.read_text())
        assert r["fonte"] == "CoinPaprika" and p["monete"][0]["simbolo"] == "BTC" and p["monete"][0]["rango"] == 1
        assert p["dominanza"]["btc"] == 57.3 and p["dominanza"]["fonte"] == "CoinPaprika"


def test_yesterday_rebuilt_from_hourly_candles():
    """Yahoo non ha ancora la candela giornaliera di ieri: si prende la chiusura della candela oraria delle 23 UTC."""
    cfg = bc.carica_config()
    yahoo = [c["yahoo"] for c in cfg["riserva"]]
    px = mercato_finto(yahoo, 400, seed=4)
    px = px.drop(index=pd.Timestamp("2026-09-28"))            # manca ieri, c'è la candela in corso di oggi
    ore = pd.date_range("2026-09-26 00:00", "2026-09-29 05:00", freq="h", tz="UTC")
    orari = pd.DataFrame({t: np.linspace(100, 110, len(ore)) for t in yahoo}, index=ore)
    ultima23 = orari.loc["2026-09-28 23:00", "BTC-USD"]
    with tempfile.TemporaryDirectory() as d:
        out = Path(d) / "prezzi_crypto.json"
        bc.build_crypto(out, cfg, lambda s, i: px.reindex(columns=s), fonte_finta(guasti=("coingecko", "coinpaprika")),
                        adesso=ADESSO, scarica_orari=lambda s: orari.reindex(columns=s))
        p = json.loads(out.read_text())
        assert p["aggiornato"] == "2026-09-28"
        btc = p["monete"][0]
        assert abs(btc["prezzi"][-1] - ultima23) < 1e-3
        # un giorno non finito (oggi) non si ricostruisce
        parziale = bc.completa_con_orari(px.iloc[:0].reindex(columns=yahoo), orari, adesso=pd.Timestamp("2026-09-28 20:00", tz="UTC"))
        assert pd.Timestamp("2026-09-28") not in parziale.index


def test_significant_digits():
    assert bc.cifre(83819.4612) == 83819.5 and bc.cifre(0.0942712345) == 0.0942712
    assert bc.cifre(float("nan")) is None and bc.cifre(None) is None
