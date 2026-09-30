"""Test della vista Europa (dati simulati, senza rete): python -m pytest test_europa.py"""
import datetime as dt
import json
import tempfile
from pathlib import Path

import numpy as np
import pandas as pd

import build_europa as be

LISTA = {
    "aggiornato": "2026-09-01",
    "indici": [{"nome": "FTSE MIB", "paese": "Italia", "yahoo": "FTSEMIB.MI", "valuta": "EUR", "pagina": "mib"},
               {"nome": "FTSE 100", "paese": "Regno Unito", "yahoo": "^FTSE", "valuta": "GBp", "pagina": "ftse"}],
    "confronto": {"yahoo": "^STOXX", "nome": "STOXX Europe 600"},
    "titoli": [
        {"t": "ENEL.MI", "nome": "Enel", "indici": ["FTSE MIB"], "paese": "Italia", "settore": "Utility", "valuta": "EUR"},
        {"t": "ENI.MI", "nome": "Eni", "indici": ["FTSE MIB"], "paese": "Italia", "settore": "Energia", "valuta": "EUR"},
        {"t": "ISP.MI", "nome": "Intesa Sanpaolo", "indici": ["FTSE MIB"], "paese": "Italia", "settore": "Finanziari", "valuta": "EUR"},
        {"t": "STLAM.MI", "nome": "Stellantis", "indici": ["FTSE MIB"], "paese": "Italia", "settore": "Consumi discrezionali", "valuta": "EUR"},
        {"t": "BT-A.L", "nome": "BT Group", "indici": ["FTSE 100"], "paese": "Regno Unito", "settore": "Comunicazioni", "valuta": "GBp"},
        {"t": "BA.L", "nome": "BAE Systems", "indici": ["FTSE 100"], "paese": "Regno Unito", "settore": "Industriali", "valuta": "GBp"},
        {"t": "AZN.L", "nome": "AstraZeneca", "indici": ["FTSE 100"], "paese": "Regno Unito", "settore": "Sanità", "valuta": "GBp"},
    ],
}

HTML_MIB = """<table><tr><th>Company</th><th>Ticker</th><th>ICB Sector</th></tr>
<tr><td>Enel</td><td>ENEL</td><td>Utilities</td></tr><tr><td>Eni</td><td>ENI</td><td>Energy</td></tr>
<tr><td>Intesa Sanpaolo</td><td>ISP</td><td>Banks</td></tr><tr><td>Stellantis N.V.</td><td>STLAM</td><td>Automobiles and Parts</td></tr>
<tr><td>Leonardo[1]</td><td>LDO</td><td>Aerospace &amp; Defence</td></tr></table>"""
HTML_FTSE = """<table><tr><th>Company</th><th>EPIC</th><th>FTSE Industry Classification Benchmark sector</th></tr>
<tr><td>BT Group</td><td>BT.A</td><td>Telecommunications</td></tr><tr><td>BAE Systems</td><td>BA.</td><td>Aerospace</td></tr>
<tr><td>Totally Different plc</td><td>AAA</td><td>Mining</td></tr><tr><td>Another One</td><td>BBB</td><td>Banks</td></tr>
<tr><td>Third New</td><td>CCC</td><td>Media</td></tr><tr><td>Fourth New</td><td>DDD</td><td>Retail</td></tr></table>"""


def html_finto(url):
    return {"mib": HTML_MIB, "ftse": HTML_FTSE}.get(url)


def test_tickers_from_wikipedia():
    assert be.ticker_yahoo("BT.A", "FTSE 100") == "BT-A.L"
    assert be.ticker_yahoo("BA.", "FTSE 100") == "BA.L"
    assert be.ticker_yahoo("NOVN", "SMI") == "NOVN.SW"
    assert be.ticker_yahoo("ADS.DE", "DAX") == "ADS.DE" and be.ticker_yahoo("ADS", "DAX") == "ADS.DE"
    assert be.ticker_yahoo("Euronext: MT", "CAC 40") == "MT.PA"
    assert be.norm_nome("Stellantis N.V.") == be.norm_nome("Stellantis")


def test_most_recent_list_wins():
    with tempfile.TemporaryDirectory() as d:
        dati, base = Path(d) / "europa_lista.json", Path(d) / "europa.json"
        base.write_text(json.dumps({"aggiornato": "2026-09-30", "titoli": ["base"]}))
        assert be.carica_lista((dati, base))["titoli"] == ["base"]                   # manca la copia aggiornata
        dati.write_text(json.dumps({"aggiornato": "2026-10-07", "titoli": ["dati"]}))
        assert be.carica_lista((dati, base))["titoli"] == ["dati"]                   # più recente
        base.write_text(json.dumps({"aggiornato": "2026-12-01", "titoli": ["nuova"]}))
        assert be.carica_lista((dati, base))["titoli"] == ["nuova"]                  # arriva una versione nuova del sito


def test_small_changes_accepted_big_ones_refused():
    lista, novita = be.aggiorna_composizioni(json.loads(json.dumps(LISTA)), html_finto, dt.date(2026, 9, 30))
    mib = [x["t"] for x in lista["titoli"] if "FTSE MIB" in x["indici"]]
    assert "LDO.MI" in mib and "STLAM.MI" in mib              # Leonardo entra, Stellantis riconosciuta per nome
    assert any("entra Leonardo" in n for n in novita)
    assert next(x for x in lista["titoli"] if x["t"] == "LDO.MI")["settore"] == "Industriali"
    ftse = [x["t"] for x in lista["titoli"] if "FTSE 100" in x["indici"]]
    assert sorted(ftse) == ["AZN.L", "BA.L", "BT-A.L"]         # troppi cambi rispetto alla lista: niente cambia
    assert lista["aggiornato"] == "2026-09-30"


def test_prices_file():
    idx = pd.bdate_range(end="2026-09-30", periods=520)
    rng = np.random.default_rng(5)
    cols = {}
    for t in [x["t"] for x in LISTA["titoli"]] + ["FTSEMIB.MI", "^FTSE", "^STOXX"]:
        cols[t] = 100 * np.exp(np.cumsum(rng.normal(0, 0.01, len(idx))))
    cols["EURGBP=X"] = 0.85 * np.exp(np.cumsum(rng.normal(0, 0.003, len(idx))))    # il franco non risponde
    px = pd.DataFrame(cols, index=idx)
    px.loc["2026-08-31", ["BT-A.L", "BA.L", "AZN.L", "^FTSE"]] = np.nan      # festa solo a Londra
    px.loc["2026-06-01":, "AZN.L"] = np.nan                                   # un titolo sparito
    adesso = pd.Timestamp("2026-09-30 12:00", tz="UTC")                       # borse aperte: il 30 non si pubblica
    with tempfile.TemporaryDirectory() as d:
        out = Path(d) / "prezzi_europa.json"
        r = be.build_europa(out, lambda s, i: px.reindex(columns=s), None, adesso=adesso, lista=json.loads(json.dumps(LISTA)))
        p = json.loads(out.read_text())
        assert r and p["aggiornato"] == "2026-09-29" and p["date"][-1] == "2026-09-29"
        bt = next(x for x in p["titoli"] if x["t"] == "BT-A.L")
        k = p["date"].index("2026-08-31")
        assert bt["prezzi"][k - bt["i0"]] == bt["prezzi"][k - bt["i0"] - 1]  # ripete il prezzo del giorno prima
        assert {i["nome"] for i in p["indici"]} == {"FTSE MIB", "FTSE 100", "STOXX Europe 600"}
        azn = next((x for x in p["titoli"] if x["t"] == "AZN.L"), None)
        assert azn is None or azn["prezzi"][-1] is None or len(azn["prezzi"]) < len(p["date"])
        assert list(p["cambi"]) == ["GBP"] and p["cambi"]["GBP"]["date"][-1] == "2026-09-29"    # anche i cambi senza la seduta aperta
        assert abs(p["cambi"]["GBP"]["valori"][0] - cols["EURGBP=X"][0]) < 1e-5
