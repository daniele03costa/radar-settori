"""
Radar Settori — ampiezza storica dell'Europa, come per i settori degli USA.

Per ognuno degli 11 settori (tutte le azioni europee del sito di quel settore) e per ognuno dei 15 indici calcola,
seduta per seduta dal 2005:
  • la quota di titoli sopra la media a 200, 50 e 20 sedute (ampiezza);
  • il prezzo del gruppo e il suo drawdown dal massimo a 52 settimane. Per un indice è il livello dell'indice
    (se Yahoo ha abbastanza storia), per un settore un paniere a pesi uguali dei suoi titoli in euro;
  • il livello blu predefinito: il 5° percentile dell'ampiezza dal 2005 (lo stesso criterio che negli USA vale
    per un settore senza livello nella tabella), oppure quello scritto in europa.json → "soglie".

Scrive data/europa/meta.json, data/europa/settori/<ID>.json (stessa forma dei file dei settori USA; il prezzo
rettificato è il prezzo stesso) e data/europa/indice.json (tutte le azioni insieme, con lo STOXX Europe 600 e il
paniere a pesi uguali di tutte le azioni). I file si scrivono tutti insieme alla fine: o tutti nuovi o tutti vecchi.

Una società quotata in due borse (Shell ad Amsterdam e a Londra, Nordea in tre…) conta una volta nei settori e in
tutta l'Europa; nell'indice di ogni borsa c'è con il suo ticker.

Attenzione: i titoli sono quelli di oggi. Negli anni passati mancano le società uscite dagli indici o sparite,
quindi l'ampiezza storica è un po' più alta del vero e i rendimenti dei panieri un po' migliori (survivorship bias).
"""
from __future__ import annotations

import datetime as dt
import json
import math
import os
import re
import unicodedata
from pathlib import Path
from typing import Dict, List, Optional

import numpy as np
import pandas as pd

from europa_settori import SETTORI

# nome corto (per tabelle, mappe ed elenchi) dei settori con il nome lungo
CODICI_SETTORI = {"Consumi discrezionali": "Discrezionali", "Beni di prima necessità": "Beni primari"}
CODICI_INDICI = {"OMX Copenhagen 25": "OMXC25", "OMX Stockholm 30": "OMXS30", "OMX Helsinki 25": "OMXH25"}
PERCENTILE_LIVELLO = 5
COPERTURA_INDICE = 0.9      # quota minima di sedute con il livello dell'indice per usarlo al posto del paniere
SEDUTE_RECENTI = 5          # …e le ultime sedute devono esserci tutte (un indice fermo su Yahoo bloccherebbe gli stati)
MIN_TITOLI = 3              # sotto questo numero di titoli con la media 200 l'ampiezza non si calcola


def log(msg: str) -> None:
    print(f"[{dt.datetime.now():%H:%M:%S}] {msg}", flush=True)


def norm_societa(nome: str) -> str:
    """Nome della società senza accenti né segni, come nel sito (view-europa.js), per riconoscere i doppi."""
    s = unicodedata.normalize("NFD", str(nome)).encode("ascii", "ignore").decode().upper()
    return re.sub(r"[^A-Z0-9&]+", " ", s).strip()


def uniche(tickers: List[str], info: Dict[str, dict]) -> List[str]:
    """Un ticker per società: il primo nell'ordine dell'elenco."""
    visti, out = set(), []
    for t in tickers:
        k = norm_societa(info.get(t, {}).get("nome", t))
        if k not in visti:
            visti.add(k)
            out.append(t)
    return out


def slug(testo: str) -> str:
    s = unicodedata.normalize("NFD", str(testo)).encode("ascii", "ignore").decode().upper()
    return re.sub(r"[^A-Z0-9]+", "-", s).strip("-")


def rnd(x, nd: int):
    try:
        xf = float(x)
    except (TypeError, ValueError):
        return None
    return None if math.isnan(xf) or math.isinf(xf) else round(xf, nd)


def to_list(s: pd.Series, nd: int) -> List[Optional[float]]:
    return [rnd(v, nd) for v in s.to_numpy()]


def gruppi(lista: dict) -> List[dict]:
    """Gli 11 settori e poi gli indici, con i loro titoli."""
    titoli = lista["titoli"]
    out = []
    for nome in SETTORI:
        membri = [x["t"] for x in titoli if x.get("settore") == nome]
        if membri:
            out.append({"etf": slug(nome), "codice": CODICI_SETTORI.get(nome, nome), "nome": nome, "tipo": "settore",
                        "paese": "Europa", "membri": membri})
    for ind in lista["indici"]:
        membri = [x["t"] for x in titoli if ind["nome"] in x.get("indici", [])]
        if membri:
            out.append({"etf": slug(ind["nome"]), "codice": CODICI_INDICI.get(ind["nome"], ind["nome"]), "nome": ind["nome"], "tipo": "indice",
                        "paese": ind.get("paese", ""), "yahoo": ind.get("yahoo"), "valuta": ind.get("valuta", "EUR"),
                        "membri": membri})
    return out


def allinea(px: pd.DataFrame, cols: List[str], cal: pd.DatetimeIndex) -> pd.DataFrame:
    """Prezzi sul calendario comune; nei buchi brevi (festività di una sola borsa) si ripete l'ultimo prezzo."""
    cols = [c for c in cols if c in px.columns]
    if not cols:
        return pd.DataFrame(index=cal)
    return px[cols].reindex(px.index.union(cal)).ffill(limit=3).reindex(cal)


def in_euro(prezzi: pd.DataFrame, valute: Dict[str, str], cambi: Dict[str, pd.Series]) -> pd.DataFrame:
    """Prezzi in euro: i cambi sono unità di valuta per un euro; i pence di Londra diventano sterline."""
    out = {}
    mancanti = set()
    for t in prezzi.columns:
        v = valute.get(t, "EUR")
        s = prezzi[t]
        if v == "GBp":
            s, v = s / 100.0, "GBP"
        if v != "EUR":
            c = cambi.get(v)
            if c is None:
                mancanti.add(v)
                continue
            s = s / c.reindex(s.index).ffill()
        out[t] = s
    if mancanti:
        log(f"Europa: mancano i cambi {', '.join(sorted(mancanti))}: le azioni in quelle valute restano fuori dai panieri")
    return pd.DataFrame(out, index=prezzi.index)


def paniere(prezzi_eur: pd.DataFrame) -> pd.Series:
    """Paniere a pesi uguali: ogni seduta la media dei rendimenti dei titoli quotati. Un errore di Yahoo (un prezzo
    100 volte più alto per un giorno) non deve spostarlo: i rendimenti giornalieri si tagliano a −50% / +100%."""
    r = prezzi_eur.pct_change(fill_method=None).clip(-0.5, 1.0)
    validi = r.notna().sum(axis=1)
    media = r.mean(axis=1).where(validi >= min(MIN_TITOLI, prezzi_eur.shape[1]))
    inizio = media.first_valid_index()
    if inizio is None:
        return pd.Series(np.nan, index=prezzi_eur.index)
    livello = (1 + media.loc[inizio:].fillna(0)).cumprod() * 100
    return livello.reindex(prezzi_eur.index)


def ampiezza(prezzi: pd.DataFrame):
    """% di titoli sopra la media 200, 50 e 20 fra quelli che hanno quel giorno il prezzo e la media."""
    out = {}
    n200 = None
    for w in (200, 50, 20):
        ma = prezzi.rolling(w, min_periods=w).mean()
        validi = prezzi.notna() & ma.notna()
        sopra = ((prezzi > ma) & validi).sum(axis=1)
        n = validi.sum(axis=1)
        out[w] = (sopra / n.where(n >= MIN_TITOLI)) * 100
        if w == 200:
            n200 = n
    return out[200], out[50], out[20], n200


def drawdown_52w(close: pd.Series) -> pd.Series:
    s = close.dropna()
    return ((s / s.rolling(252, min_periods=1).max() - 1) * 100).reindex(close.index)


def fotografia(prezzi: pd.DataFrame, info: Dict[str, dict]) -> List[dict]:
    righe = []
    for t in prezzi.columns:
        s = prezzi[t].dropna()
        if len(s) < 50:
            continue
        ultimo = s.iloc[-1]
        ma200 = s.iloc[-200:].mean() if len(s) >= 200 else np.nan
        x = info.get(t, {})
        righe.append({
            "t": t, "nome": x.get("nome", t), "paese": x.get("paese", ""), "valuta": x.get("valuta", "EUR"),
            "ultimo": rnd(ultimo, 4 if ultimo < 10 else 2),
            "v200": rnd((ultimo / ma200 - 1) * 100, 1),
            "v50": rnd((ultimo / s.iloc[-50:].mean() - 1) * 100, 1),
            "dd52": rnd((ultimo / s.iloc[-252:].max() - 1) * 100, 1),
            "data": s.index[-1].strftime("%Y-%m-%d"),
        })
    righe.sort(key=lambda r: (r["v200"] is None, -(r["v200"] or 0)))
    return righe


def livello_default(b200: pd.Series, percentile: float = PERCENTILE_LIVELLO) -> int:
    v = b200.dropna()
    return max(1, int(round(float(np.nanpercentile(v, percentile))))) if len(v) else 10


def scrivi(px: pd.DataFrame, cal: pd.DatetimeIndex, lista: dict, out_dir: Path, inizio_storico: str = "2005-01-03",
           parametri: Optional[dict] = None, confronto: Optional[dict] = None) -> Optional[dict]:
    """Calcola tutto e scrive i file in out_dir (data/europa). px: chiusure di titoli, indici e cambi."""
    if len(cal) < 260:
        return None
    titoli = lista["titoli"]
    info = {x["t"]: x for x in titoli}
    valute = {x["t"]: x.get("valuta", "EUR") for x in titoli}
    cambi = {v: px[t].where(px[t] > 0) for v, t in (("GBP", "EURGBP=X"), ("CHF", "EURCHF=X"), ("DKK", "EURDKK=X"),
                                                     ("SEK", "EURSEK=X"), ("NOK", "EURNOK=X")) if t in px.columns}
    cambi = {v: s.reindex(s.index.union(cal)).ffill().reindex(cal) for v, s in cambi.items()}
    tutti = allinea(px, [x["t"] for x in titoli], cal)
    tutti = tutti.loc[:, tutti.notna().sum() >= 50]
    eur = in_euro(tutti, valute, cambi)
    singole = set(uniche([x["t"] for x in titoli if x["t"] in tutti.columns], info))
    keep = cal >= pd.Timestamp(inizio_storico)
    date = [d.strftime("%Y-%m-%d") for d in cal[keep]]
    aggiornato = cal[-1].strftime("%Y-%m-%d")
    soglie = lista.get("soglie") or {}
    riepilogo = []
    file: Dict[str, dict] = {}                # nome del file → contenuto (si scrivono alla fine)

    for g in gruppi(lista):
        membri = [t for t in g["membri"] if t in tutti.columns]
        if g["tipo"] == "settore":
            membri = [t for t in membri if t in singole]
        if len(membri) < MIN_TITOLI:
            log(f"Europa: {g['nome']} ha solo {len(membri)} azioni con i prezzi, niente ampiezza")
            continue
        b200, b50, b20, n = ampiezza(tutti[membri])
        prezzo_tipo, valuta = "paniere", "EUR"
        close = paniere(eur[[t for t in membri if t in eur.columns]])
        close_eur = None
        if g["tipo"] == "indice" and g.get("yahoo") in px.columns:
            liv = allinea(px, [g["yahoo"]], cal)[g["yahoo"]]
            if liv[keep].notna().mean() >= COPERTURA_INDICE and liv.iloc[-SEDUTE_RECENTI:].notna().all():
                close, prezzo_tipo = liv, "indice"
                valuta = "GBP" if g.get("valuta") == "GBp" else g.get("valuta", "EUR")
                if valuta != "EUR":
                    c = cambi.get(valuta)
                    close_eur = liv / c if c is not None else None
            elif liv.notna().any():
                log(f"Europa: {g['nome']}: il livello dell'indice su Yahoo ha buchi o è fermo, uso il paniere delle sue azioni")
        dd = drawdown_52w(close)
        ma200 = close.rolling(200, min_periods=200).mean()          # sulla storia dal 2003, come per gli USA
        livello = int(soglie.get(g["etf"], livello_default(b200[keep])))
        nd = 4 if prezzo_tipo == "paniere" else 2
        payload = {
            "etf": g["etf"], "codice": g["codice"], "nome": g["nome"], "tipo": g["tipo"], "paese": g["paese"],
            "aggiornato": aggiornato,
            "soglia_default": livello,
            "prezzo_tipo": prezzo_tipo, "valuta": valuta,
            "date": date,
            "close": to_list(close[keep], nd),
            "ma200": to_list(ma200[keep], nd),
            "dd": to_list(dd[keep], 2),
            "b200": to_list(b200[keep], 1),
            "b50": to_list(b50[keep], 1),
            "b20": to_list(b20[keep], 1),
            "n": [int(x) for x in n[keep].to_numpy()],
            "titoli": fotografia(tutti[membri], info),
        }
        if close_eur is not None:
            payload["close_eur"] = to_list(close_eur[keep], 2)     # per la rotazione contro lo STOXX 600, in euro
        file[f"settori/{g['etf']}.json"] = payload
        nn = int(n.iloc[-1])
        b_oggi = b200.iloc[-1]
        riepilogo.append({
            "etf": g["etf"], "codice": g["codice"], "nome": g["nome"], "tipo": g["tipo"], "paese": g["paese"],
            "b200": rnd(b_oggi, 1), "b50": rnd(b50.iloc[-1], 1), "b20": rnd(b20.iloc[-1], 1),
            "n": nn, "sopra": None if pd.isna(b_oggi) else int(round(b_oggi / 100 * nn)),
            "soglia_default": livello, "dd": rnd(dd.iloc[-1], 1), "ultimo": rnd(close.iloc[-1], 2),
            "prezzo_tipo": prezzo_tipo, "titoli": len(membri),
        })

    if not riepilogo:
        return None
    # tutte le azioni insieme (ogni società una volta), con lo STOXX Europe 600 e il paniere a pesi uguali
    cols = [t for t in tutti.columns if t in singole]
    i200, i50, i20, i_n = ampiezza(tutti[cols])
    media = paniere(eur[[t for t in cols if t in eur.columns]])
    stoxx = None
    if confronto and confronto.get("yahoo") in px.columns:
        stoxx = allinea(px, [confronto["yahoo"]], cal)[confronto["yahoo"]]
    file["indice.json"] = {
        "nome": "Europa", "descrizione": f"tutte le {len(cols)} società europee del sito",
        "confronto": (confronto or {}).get("nome"),
        "aggiornato": aggiornato,
        "date": date,
        "b200": to_list(i200[keep], 1), "b50": to_list(i50[keep], 1), "b20": to_list(i20[keep], 1),
        "n": [int(x) for x in i_n[keep].to_numpy()],
        "close": to_list(stoxx[keep], 2) if stoxx is not None else None,
        "paniere": to_list(media[keep], 4),
    }
    file["meta.json"] = {
        "aggiornato": aggiornato,
        "generato": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "inizio": date[0] if date else None,
        "calendario": "milano",
        "settori": riepilogo,
        "conta": {"settore": sum(1 for r in riepilogo if r["tipo"] == "settore"), "indice": sum(1 for r in riepilogo if r["tipo"] == "indice")},
        "indice": {"b200": rnd(i200.iloc[-1], 1), "b50": rnd(i50.iloc[-1], 1), "n": int(i_n.iloc[-1])},
        "parametri": parametri or {},
        "fonti": {"prezzi": "Yahoo Finance (yfinance), chiusure rettificate", "composizione": "titoli di oggi degli indici (europa.json)"},
        "punto_nel_tempo": False,
    }
    # prima tutti i file temporanei, poi i nomi veri (meta.json per ultimo): mai file nuovi mescolati a quelli vecchi
    (out_dir / "settori").mkdir(parents=True, exist_ok=True)
    temporanei = []
    for nome, contenuto in file.items():
        tmp = out_dir / (nome + ".tmp")
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(contenuto, f, ensure_ascii=False, **({"indent": 1} if nome == "meta.json" else {"separators": (",", ":")}))
        temporanei.append((tmp, out_dir / nome))
    for tmp, vero in sorted(temporanei, key=lambda x: x[1].name == "meta.json"):
        os.replace(tmp, vero)
    # i gruppi che non ci sono più
    for vecchio in (out_dir / "settori").glob("*.json"):
        if f"settori/{vecchio.name}" not in file:
            vecchio.unlink()
    return file["meta.json"]
