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
    assert be.ticker_yahoo("NOVO B", "OMX Copenhagen 25") == "NOVO-B.CO"         # classi di azioni nordiche
    assert be.ticker_yahoo("NDA-FI.HE", "OMX Helsinki 25") == "NDA-FI.HE"
    assert be.ticker_yahoo("OSE: AKRBP", "OBX") == "AKRBP.OL"
    assert be.ticker_yahoo("Euronext Brussels: ABI", "BEL 20") == "ABI.BR"


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


def test_breadth_history_groups_and_states():
    """Storia lunga: ampiezza di settori e indici, prezzo del gruppo, livello blu predefinito, stati con stati.js."""
    import shutil
    import europa_ampiezza as ea
    idx = pd.bdate_range("2003-09-01", "2026-09-29")
    n = len(idx)
    rng = np.random.default_rng(3)
    mercato = rng.normal(0.0003, 0.01, n)
    crollo = idx.searchsorted(pd.Timestamp("2008-06-02"))
    mercato[crollo:crollo + 180] -= 0.004                                  # un ribasso diffuso
    lista = json.loads(json.dumps(LISTA))
    for k in range(8):                                                     # altri titoli per avere gruppi veri
        lista["titoli"].append({"t": f"X{k}.MI", "nome": f"Banca {k}", "indici": ["FTSE MIB"], "paese": "Italia",
                                "settore": "Finanziari", "valuta": "EUR"})
    lista["titoli"].append({"t": "X0.L", "nome": "Banca 0", "indici": ["FTSE 100"], "paese": "Regno Unito",
                            "settore": "Finanziari", "valuta": "GBp"})       # la stessa società a Londra
    cols = {}
    for j, x in enumerate(lista["titoli"]):
        p = 50 * np.exp(np.cumsum(mercato + rng.normal(0, 0.012, n)))
        if j == 2:
            p[: n // 2] = np.nan                                           # in borsa da metà periodo
        if j == 3:
            p[n // 3] *= 100                                               # un errore di Yahoo per un giorno
        cols[x["t"]] = p
    cols["FTSEMIB.MI"] = 20000 * np.exp(np.cumsum(mercato))
    cols["^FTSE"] = np.where(np.arange(n) < n // 2, np.nan, 7000 * np.exp(np.cumsum(mercato)))   # poca storia: paniere
    cols["^STOXX"] = 400 * np.exp(np.cumsum(mercato))
    cols["EURGBP=X"] = np.full(n, 0.85)
    px = pd.DataFrame(cols, index=idx)
    with tempfile.TemporaryDirectory() as d:
        out = Path(d) / "europa"
        lista["soglie"] = {"FTSE-MIB": 7}
        meta = ea.scrivi(px, idx, lista, out, "2005-01-03", {}, lista["confronto"])
        assert meta and meta["calendario"] == "milano"
        ids = {s["etf"]: s for s in meta["settori"]}
        assert "FINANZIARI" in ids and ids["FINANZIARI"]["tipo"] == "settore"
        assert ids["FTSE-MIB"]["soglia_default"] == 7 and ids["FTSE-MIB"]["prezzo_tipo"] == "indice"
        assert ids["FTSE-100"]["prezzo_tipo"] == "paniere"                 # Yahoo con poca storia per l'indice
        assert all(1 <= s["soglia_default"] <= 60 for s in meta["settori"])
        fin = json.loads((out / "settori" / "FINANZIARI.json").read_text())
        ind = json.loads((out / "indice.json").read_text())
        assert fin["date"] == ind["date"] and ind["date"][0] == "2005-01-03" and len(fin["b200"]) == len(ind["date"])
        assert fin["ma200"][0] is not None                                  # media 200 dalla storia prima del 2005
        assert len(fin["titoli"]) == 9                                     # la banca quotata due volte conta una volta
        assert ids["FTSE-MIB"]["n"] == 12 and not list(out.glob("**/*.tmp"))
        assert len(fin["close"]) == len(ind["date"]) and fin["close"][0] is not None
        k = ind["date"].index(next(x for x in ind["date"] if x >= "2009-01-02"))
        assert fin["b200"][k] < 30 < max(v for v in fin["b200"] if v is not None)   # il ribasso si vede nell'ampiezza
        # l'errore di un giorno non sposta il paniere più del taglio (al massimo +100% e poi −50%)
        r = np.diff(np.log(np.array([v for v in fin["close"] if v is not None])))
        assert np.abs(r).max() < np.log(2.01)
        assert fin["titoli"] and {"t", "v200", "dd52", "valuta"} <= set(fin["titoli"][0])
        if shutil.which("node"):
            import subprocess
            subprocess.run(["node", str(Path(be.__file__).parent / "stati.js"), str(out)], check=True, capture_output=True)
            st = json.loads((out / "stati.json").read_text())
            assert len(st["settori"]) == len(meta["settori"]) and "ampiezza_indice" in st
            assert st["settori"][0]["codice"]
