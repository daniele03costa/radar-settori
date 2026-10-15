"""Test del quadro macro e della salute dei dati (dati simulati, senza rete): python -m pytest test_macro.py"""
import json
import sys
import tempfile
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_europa as be  # noqa: E402
import build_macro as bm  # noqa: E402
import salute  # noqa: E402

IDX = pd.bdate_range("2004-06-01", "2026-10-14")


def finto_yahoo(simboli, inizio):
    rng = np.random.default_rng(5)
    livelli = {"^TNX": 4.1, "DX-Y.NYB": 99, "EURUSD=X": 1.16, "BZ=F": 64, "GC=F": 4000, "HG=F": 4.9, "^VIX": 17}
    cols = {s: livelli[s] * np.exp(np.cumsum(rng.normal(0, 0.01, len(IDX))) * 0.2) for s in simboli if s in livelli}
    df = pd.DataFrame(cols, index=IDX)
    df.loc[df.index[-60:], "HG=F"] = np.nan            # il rame si ferma due mesi prima
    if "BZ=F" in df.columns:
        df.loc[:"2007-07-29", "BZ=F"] = np.nan          # il Brent comincia più tardi (i0 > 0)
    return df


BUNDESBANK_CSV = "\n".join([",BBSIS.D.I.ZAR...", "unit,%", "2004-06-01,4.30,", "2004-06-02,.,No value available"]
                           + [f"{d:%Y-%m-%d},{2.6 + 0.001 * k:.2f}," for k, d in enumerate(pd.bdate_range("2004-06-03", "2026-10-13"))])


def test_macro_completo():
    with tempfile.TemporaryDirectory() as d:
        out = Path(d) / "macro.json"
        r = bm.build_macro(out, finto_yahoo, lambda url: BUNDESBANK_CSV if "bundesbank" in url else None,
                           adesso=pd.Timestamp("2026-10-15 05:30", tz="UTC"))
        assert r and r["aggiornato"] == "2026-10-14"
        m = json.loads(out.read_text())
        ids = [s["id"] for s in m["serie"]]
        assert ids == ["us10", "bund10", "spread", "dxy", "eurusd", "brent", "oro", "rame", "vix"]
        s = {x["id"]: x for x in m["serie"]}
        assert s["bund10"]["fonte"] == "Bundesbank"
        k = len(m["date"]) - 1
        us, bu, sp = (s[i]["valori"][k - s[i]["i0"]] for i in ("us10", "bund10", "spread"))
        assert abs(sp - (us - bu)) < 0.002
        assert m["date"][0] == "2005-01-03" and all(pd.Timestamp(x).weekday() < 5 for x in m["date"][:50])
        assert [x["nome"] for x in r["fermi"]] == ["Rame"]


def test_macro_bce_e_serie_vecchia():
    with tempfile.TemporaryDirectory() as d:
        out = Path(d) / "macro.json"
        bm.build_macro(out, finto_yahoo, lambda url: BUNDESBANK_CSV if "bundesbank" in url else None,
                       adesso=pd.Timestamp("2026-10-15 05:30", tz="UTC"))
        bce = "KEY,TIME_PERIOD,OBS_VALUE\n" + "\n".join(f"YC,{x:%Y-%m-%d},{2.7:.2f}" for x in pd.bdate_range("2004-06-01", "2026-10-14"))
        # la Bundesbank non risponde: si usa la BCE; Yahoo senza ^VIX: resta la serie già pubblicata
        senza_vix = lambda s, i: finto_yahoo([x for x in s if x != "^VIX"], i)  # noqa: E731
        r = bm.build_macro(out, senza_vix, lambda url: bce if "ecb" in url else None, adesso=pd.Timestamp("2026-10-16 05:30", tz="UTC"))
        m = json.loads(out.read_text())
        s = {x["id"]: x for x in m["serie"]}
        assert s["bund10"]["fonte"].startswith("BCE")
        assert "vix" in s and r["aggiornato"] == "2026-10-14" and "vix" in r["fonti"]
        assert s["brent"]["i0"] > 0
        # la serie tenuta da prima non si allunga con valori ripetuti: un mese dopo il VIX risulta fermo
        r2 = bm.build_macro(out, senza_vix, lambda url: bce if "ecb" in url else None, adesso=pd.Timestamp("2026-11-20 05:30", tz="UTC"))
        m2 = json.loads(out.read_text())
        vix = {x["id"]: x for x in m2["serie"]}["vix"]
        assert vix["ultimo"] == "2026-10-14" and "VIX" in [x["nome"] for x in r2["fermi"]]
        assert bm.leggi_csv_colonne("<html>\n<<errore", ["DATE"], ["DGS10"]).empty


def test_leggi_fred():
    s = bm.leggi_csv_colonne("observation_date,DGS10\n2026-10-12,4.05\n2026-10-13,.\n2026-10-14,4.10\n", ["observation_date", "DATE"], ["DGS10"])
    assert list(s.round(2)) == [4.05, 4.10]


def test_salute_registra_e_fermi():
    with tempfile.TemporaryDirectory() as d:
        a = salute.registra("europa", True, cartella=d, aggiornato="2026-10-14", mancanti=[{"t": "X.MI"}])
        assert a["esito"] == "ok" and a["errori_di_fila"] == 0
        b = salute.registra("europa", False, "Europa: nessun prezzo", cartella=d)
        assert b["esito"] == "errore" and b["errori_di_fila"] == 1 and b["ultimo_successo"] == a["ultimo_successo"]
        assert b["aggiornato"] == "2026-10-14" and b["messaggio"] == "Europa: nessun prezzo"
        c = salute.registra("europa", True, cartella=d, avvisi=["Europa: ampiezza non aggiornata (x)"])
        assert c["esito"] == "avvisi"
    idx = pd.bdate_range("2026-09-01", "2026-10-14")
    px = pd.DataFrame({"A": 1.0, "B": 1.0}, index=idx)
    px.loc[idx[-8]:, "B"] = np.nan
    assert salute.fermi(px, ["A", "B"], idx) == {"B": idx[-9].strftime("%Y-%m-%d")}


def test_ascolta():
    class M:
        @staticmethod
        def log(m):
            pass
    with salute.ascolta(M) as reg:
        M.log("Europa: scarico")
        M.log("Europa: ampiezza non aggiornata (boh)")
    assert reg.ultimo.startswith("Europa: ampiezza") and len(reg.avvisi) == 1
    assert M.log("x") is None


def test_ultimi_prezzi_europa():
    idx = pd.bdate_range("2026-10-01", "2026-10-13")
    px = pd.DataFrame({"A.MI": 10.0, "B.MI": 20.0}, index=idx)
    px2, n = be.aggiungi_ultimi(px.copy(), {"A.MI": (pd.Timestamp("2026-10-14"), 11.0), "B.MI": (pd.Timestamp("2026-10-13"), 19.0)})
    assert n == 1 and px2.index[-1] == pd.Timestamp("2026-10-14") and px2.at[pd.Timestamp("2026-10-14"), "A.MI"] == 11.0
    assert px2.at[pd.Timestamp("2026-10-13"), "B.MI"] == 20.0
