#!/usr/bin/env python3
"""
Radar Settori — dati della vista Crypto: bitcoin e le prime criptovalute per capitalizzazione.

Produce data/prezzi_crypto.json. Cosa fa, in ordine:
  1. prende la classifica per capitalizzazione da CoinGecko e scarta stablecoin, token "impacchettati"
     o in staking e token legati ad altri beni (impostazioni in crypto.json); se CoinGecko non risponde
     tiene la lista già pubblicata o, la prima volta, quella di riserva di crypto.json;
  2. scarica da Yahoo Finance le chiusure giornaliere in dollari (una giornata = 00:00-24:00 UTC, cioè
     dalle 2 alle 2 di notte italiane in estate): la giornata ancora in corso si scarta;
     una moneta entra solo se Yahoo ha i suoi prezzi e l'ultimo è vicino a quello di CoinGecko
     (così un ticker sbagliato non porta dentro un'altra moneta con lo stesso simbolo);
  3. scarica i mercati per le correlazioni (Nasdaq 100, S&P 500, oro, dollaro), solo sedute concluse;
  4. aggiunge l'indice Fear & Greed di alternative.me (dal 2018) e la quota di mercato di bitcoin;
  5. controlla la qualità: bitcoin deve esserci fino all'ultima giornata, servono almeno 8 monete e
     la data non può tornare indietro rispetto al file già pubblicato; altrimenti il file resta com'è.

Uso:  python build_crypto.py
"""
from __future__ import annotations

import datetime as dt
import json
import re
import sys
import time
import urllib.request
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
from orari import seduta_in_corso  # noqa: E402

CONFIG_PATH = ROOT / "crypto.json"
DATA_DIR = ROOT / "data"
OUT_PATH = DATA_DIR / "prezzi_crypto.json"

URL_CLASSIFICA = ("https://api.coingecko.com/api/v3/coins/markets"
                  "?vs_currency=usd&order=market_cap_desc&per_page=60&page=1&sparkline=false")
URL_GLOBALE = "https://api.coingecko.com/api/v3/global"
URL_PAURA = "https://api.alternative.me/fng/?limit=0&format=json"

MIN_MONETE = 8          # sotto questo numero il file non si aggiorna
TOLLERANZA_PREZZO = 0.30  # scarto massimo fra l'ultimo prezzo di Yahoo e quello di CoinGecko
BUCO_MASSIMO = 3        # giorni mancanti che si riempiono con l'ultimo prezzo
STORIA_DOMINANZA = 1000


def log(msg: str) -> None:
    print(f"[{dt.datetime.now():%H:%M:%S}] {msg}", flush=True)


def carica_config(path: Path = CONFIG_PATH) -> dict:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def cifre(v: Any, n: int = 6) -> Optional[float]:
    """Arrotonda a n cifre significative (i prezzi crypto vanno da 0,0001 a 100.000 dollari)."""
    if v is None:
        return None
    try:
        x = float(v)
    except (TypeError, ValueError):
        return None
    if not np.isfinite(x):
        return None
    return float(f"{x:.{n}g}")


# ---------------------------------------------------------------------------
# fonti esterne
# ---------------------------------------------------------------------------

def http_json(url: str, tentativi: int = 3, attesa: int = 30) -> Optional[Any]:
    """GET con qualche tentativo (CoinGecko senza chiave risponde 429 se si chiede troppo spesso)."""
    for k in range(tentativi):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "radar-settori/1.0 (sito personale)",
                                                       "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=40) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception as e:  # noqa: BLE001
            log(f"  {url.split('?')[0]}: {e}")
            if k + 1 < tentativi:
                time.sleep(attesa)
    return None


def yahoo_prezzi(simboli: List[str], inizio: str) -> pd.DataFrame:
    """Chiusure giornaliere da Yahoo Finance (le crypto non hanno dividendi: Close = Adj Close)."""
    import build_prices
    return build_prices.yahoo_prices(simboli, inizio, batch=20)


# ---------------------------------------------------------------------------
# classifica
# ---------------------------------------------------------------------------

def esclusa(c: dict, cfg: dict) -> bool:
    cid = str(c.get("id", "")).lower()
    sim = str(c.get("symbol", c.get("simbolo", ""))).lower()
    nome = " " + str(c.get("name", c.get("nome", ""))).lower() + " "
    if cid in {x.lower() for x in cfg.get("escludi", [])}:
        return True
    if re.search(r"usd|eur", sim):                       # stablecoin: USDT, USDC, USDe, PYUSD, EURC…
        return True
    if any(p in nome for p in cfg.get("parole_escluse", [])):
        return True
    prezzo = c.get("current_price")
    if prezzo is not None and 0.97 <= float(prezzo) <= 1.03 and ("usd" in nome or "dollar" in nome):
        return True
    return False


def ticker_yahoo(c: dict, cfg: dict) -> str:
    mappa = cfg.get("ticker_yahoo", {})
    return mappa.get(c["id"]) or f"{str(c['simbolo']).upper()}-USD"


def classifica_coingecko(cfg: dict, prendi: Callable[[str], Optional[Any]] = http_json) -> Optional[List[dict]]:
    """Candidati in ordine di capitalizzazione, già senza stablecoin e simili."""
    dati = prendi(URL_CLASSIFICA)
    if not isinstance(dati, list) or not dati:
        return None
    out = []
    for c in dati:
        if not isinstance(c, dict) or not c.get("id") or esclusa(c, cfg):
            continue
        out.append({"id": c["id"], "simbolo": str(c.get("symbol", "")).upper(), "nome": c.get("name") or c["id"],
                    "rango": c.get("market_cap_rank"), "cap": c.get("market_cap"), "prezzo": c.get("current_price")})
    for c in out:
        c["yahoo"] = ticker_yahoo(c, cfg)
    return out or None


def lista_precedente(path: Path) -> Optional[List[dict]]:
    try:
        with open(path, encoding="utf-8") as f:
            d = json.load(f)
        return [{k: m.get(k) for k in ("id", "simbolo", "nome", "yahoo", "rango", "cap")} for m in d.get("monete", [])] or None
    except Exception:  # noqa: BLE001
        return None


def dati_precedenti(path: Path) -> dict:
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:  # noqa: BLE001
        return {}


# ---------------------------------------------------------------------------
# serie
# ---------------------------------------------------------------------------

def giornate_chiuse(s: pd.Series, adesso: Optional[pd.Timestamp] = None) -> pd.Series:
    """Solo giornate UTC concluse: la barra di oggi (UTC) è ancora in corso."""
    ora = pd.Timestamp.now(tz="UTC") if adesso is None else pd.Timestamp(adesso)
    ora = ora.tz_localize("UTC") if ora.tzinfo is None else ora.tz_convert("UTC")
    oggi = ora.tz_localize(None).normalize()
    return s[s.index < oggi]


def sembra_stabile(s: pd.Series) -> bool:
    r = np.log(s.dropna()).diff().dropna().tail(90)
    return len(r) >= 30 and float(r.std()) < 0.004


def scegli_monete(candidati: List[dict], px: pd.DataFrame, quante: int, controlla_prezzo: bool,
                  adesso: Optional[pd.Timestamp]) -> List[dict]:
    scelte, visti = [], set()
    for c in candidati:
        if len(scelte) >= quante:
            break
        t = c["yahoo"]
        if t in visti or t not in px.columns:
            continue
        s = giornate_chiuse(px[t].dropna(), adesso)
        s = s[s > 0]
        if len(s) < 20:
            log(f"  {c['simbolo']}: Yahoo non ha abbastanza prezzi per {t}")
            continue
        if sembra_stabile(s):
            log(f"  {c['simbolo']}: prezzo quasi fermo, sembra una stablecoin: esclusa")
            continue
        if controlla_prezzo and c.get("prezzo"):
            scarto = abs(float(s.iloc[-1]) / float(c["prezzo"]) - 1)
            if scarto > TOLLERANZA_PREZZO:
                log(f"  {c['simbolo']}: {t} vale {s.iloc[-1]:.6g} ma CoinGecko dice {c['prezzo']}: ticker sbagliato, esclusa")
                continue
        visti.add(t)
        scelte.append({**c, "serie": s})
    return scelte


def allinea(s: pd.Series, calendario: pd.DatetimeIndex) -> pd.Series:
    return s.reindex(calendario).ffill(limit=BUCO_MASSIMO)


def indice_paura(dati: Any, calendario: pd.DatetimeIndex) -> Optional[dict]:
    """Fear & Greed: il valore con data G (mezzanotte UTC) è noto alla chiusura del giorno prima,
    quindi si attacca al giorno G-1 (stesso momento dei prezzi)."""
    if not isinstance(dati, dict) or not isinstance(dati.get("data"), list):
        return None
    valori = {}
    for x in dati["data"]:
        try:
            giorno = pd.Timestamp(int(x["timestamp"]), unit="s").normalize() - pd.Timedelta(days=1)
            valori[giorno] = int(x["value"])
        except (KeyError, TypeError, ValueError):
            continue
    if not valori:
        return None
    s = pd.Series(valori).sort_index().reindex(calendario)
    if s.notna().sum() == 0:
        return None
    i0 = int(np.argmax(s.notna().to_numpy()))
    return {"i0": i0, "valori": [None if pd.isna(v) else int(v) for v in s.iloc[i0:]]}


# ---------------------------------------------------------------------------
# costruzione del file
# ---------------------------------------------------------------------------

def build_crypto(out_path: Path, cfg: dict, scarica: Callable[[List[str], str], pd.DataFrame] = yahoo_prezzi,
                 prendi: Callable[[str], Optional[Any]] = http_json, adesso: Optional[pd.Timestamp] = None) -> Optional[dict]:
    quante = int(cfg.get("quante", 10))
    inizio = cfg.get("inizio", "2014-09-01")
    prima = dati_precedenti(out_path)

    candidati = classifica_coingecko(cfg, prendi)
    fonte = "CoinGecko"
    if candidati is None:
        candidati = lista_precedente(out_path) or [dict(x) for x in cfg["riserva"]]
        fonte = "lista precedente" if lista_precedente(out_path) else "lista di riserva"
        log(f"Crypto: CoinGecko non risponde, uso la {fonte}")
    # bitcoin c'è sempre, per primo
    if not any(c["id"] == "bitcoin" for c in candidati):
        candidati.insert(0, dict(cfg["riserva"][0]))
    candidati.sort(key=lambda c: 0 if c["id"] == "bitcoin" else 1)
    candidati = candidati[: quante + 12]                  # qualche riserva se una moneta non va

    simboli = list(dict.fromkeys([c["yahoo"] for c in candidati]))
    log(f"Crypto: scarico {len(simboli)} monete da Yahoo…")
    px = scarica(simboli, inizio)
    if px is None or px.empty:
        log("Crypto: nessun prezzo da Yahoo, resta il file già pubblicato")
        return None
    monete = scegli_monete(candidati, px, quante, fonte == "CoinGecko", adesso)
    btc = next((m for m in monete if m["id"] == "bitcoin"), None)
    if btc is None or len(monete) < MIN_MONETE:
        log(f"Crypto: solo {len(monete)} monete valide{'' if btc else ', manca bitcoin'}: resta il file già pubblicato")
        return None

    ultimo = btc["serie"].index.max()
    if prima.get("aggiornato") and ultimo.strftime("%Y-%m-%d") < prima["aggiornato"]:
        log("Crypto: i dati nuovi sono più vecchi di quelli pubblicati, resta il file già pubblicato")
        return None
    calendario = pd.date_range(btc["serie"].index.min(), ultimo, freq="D")

    uscita_monete = []
    for m in monete:
        s = allinea(m["serie"][m["serie"].index <= ultimo], calendario)
        if s.notna().sum() == 0:
            continue
        i0 = int(np.argmax(s.notna().to_numpy()))
        uscita_monete.append({
            "id": m["id"], "simbolo": m["simbolo"], "nome": m["nome"], "yahoo": m["yahoo"],
            "rango": m.get("rango"), "cap": cifre(m.get("cap"), 4),
            "i0": i0, "prezzi": [cifre(v) for v in s.iloc[i0:]],
        })

    # mercati per le correlazioni: sedute concluse, vuoto nei giorni senza borsa
    mercati = []
    nomi_mercati = cfg.get("mercati", {})
    if nomi_mercati:
        mk = scarica(list(nomi_mercati), inizio)
        in_corso = seduta_in_corso("NYSE", adesso)
        for t, nome in nomi_mercati.items():
            if mk is None or mk.empty or t not in mk.columns:
                log(f"  mercato {t}: nessun dato")
                continue
            s = mk[t].dropna()
            if in_corso is not None:
                s = s[s.index < in_corso]
            s = s.reindex(calendario)
            if s.notna().sum() < 20:
                continue
            mercati.append({"t": t, "nome": nome, "prezzi": [cifre(v) for v in s]})

    paura = indice_paura(prendi(URL_PAURA), calendario)
    if paura is None:
        log("  Fear & Greed non disponibile")

    dominanza = None
    storia = [x for x in (prima.get("dominanza_storia") or []) if isinstance(x, list) and len(x) == 2]
    g = prendi(URL_GLOBALE) if fonte == "CoinGecko" else None
    try:
        quote = g["data"]["market_cap_percentage"]
        dominanza = {"btc": round(float(quote["btc"]), 2), "eth": round(float(quote.get("eth", 0)), 2),
                     "totale_usd": cifre(g["data"]["total_market_cap"]["usd"], 4),
                     "data": (adesso or pd.Timestamp.now(tz="UTC")).strftime("%Y-%m-%d")}
        if not storia or storia[-1][0] != dominanza["data"]:
            storia.append([dominanza["data"], dominanza["btc"]])
        storia = storia[-STORIA_DOMINANZA:]
    except (TypeError, KeyError, ValueError):
        dominanza = prima.get("dominanza")

    payload = {
        "aggiornato": ultimo.strftime("%Y-%m-%d"),
        "generato": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "fonte_classifica": fonte,
        "date": [d.strftime("%Y-%m-%d") for d in calendario],
        "monete": uscita_monete,
        "mercati": mercati,
        "paura": paura,
        "dominanza": dominanza,
        "dominanza_storia": storia,
        "halving": cfg.get("halving", []),
    }
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
    log(f"Crypto: {len(uscita_monete)} monete ({', '.join(m['simbolo'] for m in uscita_monete)}), "
        f"{len(mercati)} mercati, dati al {payload['aggiornato']} (classifica: {fonte})")
    return {"monete": [m["simbolo"] for m in uscita_monete], "aggiornato": payload["aggiornato"], "fonte": fonte}


def main() -> int:
    try:
        r = build_crypto(OUT_PATH, carica_config())
    except Exception as e:  # noqa: BLE001
        log(f"Crypto: errore ({e}), resta il file già pubblicato")
        return 1
    return 0 if r else 1


if __name__ == "__main__":
    sys.exit(main())
