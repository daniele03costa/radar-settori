"""Test di Asia ed Emergenti (dati simulati, senza rete): python -m pytest test_mondo.py"""
import json
import tempfile
from pathlib import Path

import numpy as np
import pandas as pd

import build_mondo as bm

LISTA = {
    "regione": "Emergenti", "prefisso": "EM-", "calendario": "feriale", "riempi": 10,
    "cambi": {"BRL": "EURBRL=X", "ZAR": "EURZAR=X", "USD": "EURUSD=X"},
    "indici": [{"nome": "Ibovespa", "paese": "Brasile", "yahoo": "^BVSP", "valuta": "BRL", "pagina": ""},
               {"nome": "FTSE/JSE Top 40", "paese": "Sudafrica", "yahoo": "^J200.JO", "valuta": "ZAR", "pagina": ""}],
    "confronto": {"yahoo": "EEM", "nome": "MSCI Emerging Markets (ETF EEM)", "valuta": "USD"},
    "titoli": [{"t": f"B{k}.SA", "nome": f"Banco {k}", "indici": ["Ibovespa"], "paese": "Brasile", "settore": "Finanziari", "valuta": "BRL"} for k in range(5)]
              + [{"t": f"J{k}.JO", "nome": f"Mina {k}", "indici": ["FTSE/JSE Top 40"], "paese": "Sudafrica", "settore": "Materiali", "valuta": "ZAc"} for k in range(5)],
}


def test_zona_emergenti():
    idx = pd.bdate_range("2003-09-01", "2026-10-13")
    n = len(idx)
    rng = np.random.default_rng(9)
    cols = {x["t"]: 100 * np.exp(np.cumsum(rng.normal(0.0002, 0.015, n))) for x in LISTA["titoli"]}
    cols["^BVSP"] = 1e5 * np.exp(np.cumsum(rng.normal(0, 0.01, n)))
    cols["EEM"] = 40 * np.exp(np.cumsum(rng.normal(0, 0.01, n)))
    cols["EURBRL=X"] = np.full(n, 6.0)
    cols["EURZAR=X"] = np.full(n, 20.0)
    cols["EURUSD=X"] = np.full(n, 1.1)
    px = pd.DataFrame(cols, index=idx)
    px.loc["2026-10-13", "^BVSP"] = np.nan                                     # Johannesburg e San Paolo: indice JSE assente
    # alle 15 UTC le borse americane sono aperte: la seduta del 14 non c'è ancora, quella del 13 sì
    with tempfile.TemporaryDirectory() as d:
        out, cart = Path(d) / "prezzi_emergenti.json", Path(d) / "emergenti"
        r = bm.build_zona("emergenti", lambda s, i: px.reindex(columns=s), adesso=pd.Timestamp("2026-10-13 15:00", tz="UTC"),
                          lista=json.loads(json.dumps(LISTA)), out_path=out, cartella=cart)
        assert r and r["aggiornato"] == "2026-10-12"                           # il 13 a quell'ora non è ancora chiuso
        p = json.loads(out.read_text())
        assert set(p["cambi"]) == {"BRL", "ZAR", "USD"} and p["date"][0] >= "2024-01-01"
        meta = json.loads((cart / "meta.json").read_text())
        ids = {s["etf"]: s for s in meta["settori"]}
        assert {"EM-FINANZIARI", "EM-MATERIALI", "IBOVESPA", "FTSE-JSE-TOP-40"} <= set(ids)
        assert ids["FTSE-JSE-TOP-40"]["prezzo_tipo"] == "paniere" and ids["IBOVESPA"]["prezzo_tipo"] == "indice"
        assert ids["FTSE-JSE-TOP-40"]["codice"] == "JSE Top 40" and meta["calendario"] == "feriale"
        assert ids["EM-MATERIALI"]["m3_eur"] is not None
        ind = json.loads((cart / "indice.json").read_text())
        assert ind["close_eur"] and abs(ind["close_eur"][-1] - ind["close"][-1] / 1.1) < 0.01   # EEM in euro per la rotazione
        mat = json.loads((cart / "settori" / "EM-MATERIALI.json").read_text())
        # paniere in euro: le azioni di Johannesburg sono in cent di rand
        assert mat["close"][0] is not None and mat["valuta"] == "EUR"


def test_oggi_aperto():
    assert bm.oggi_aperto(pd.Timestamp("2026-10-13 09:00", tz="UTC"), "10:45") == pd.Timestamp("2026-10-13")
    assert bm.oggi_aperto(pd.Timestamp("2026-10-13 22:52", tz="UTC"), "21:45") is None
