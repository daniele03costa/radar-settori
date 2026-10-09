#!/usr/bin/env python3
"""
Radar Settori — dati della vista Europa: le azioni dei sette indici principali (FTSE MIB, DAX, CAC 40,
IBEX 35, AEX, SMI, FTSE 100), con gli indici stessi e lo STOXX Europe 600 come confronto.

Produce data/prezzi_europa.json (dal 1° gennaio di due anni prima: 2-3 anni di chiusure, una riga di prezzi per titolo)
e, con la storia dal 2005, l'ampiezza dei settori e degli indici europei con i loro stati (data/europa/, vedi
europa_ampiezza.py).
  1. la lista parte da europa.json; una volta alla settimana si confrontano le composizioni con Wikipedia
     e si accettano solo piccoli cambiamenti (entrate e uscite trimestrali), riconoscendo i titoli anche per
     nome; la lista aggiornata si salva in data/europa_lista.json;
  2. i prezzi (e i cambi di sterlina e franco, per i confronti in euro) arrivano da Yahoo Finance; se le borse
     europee sono ancora aperte la seduta di oggi si scarta;
  3. il calendario è quello dei giorni in cui ha quotato la maggioranza dei titoli; nei buchi brevi
     (festività di una sola borsa) si ripete l'ultimo prezzo;
  4. il file si scrive solo se almeno l'80% dei titoli ha i prezzi e la data non torna indietro.

Uso:  python build_europa.py
"""
from __future__ import annotations

import datetime as dt
import json
import re
import sys
import unicodedata
from io import StringIO
from pathlib import Path
from typing import Callable, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
import europa_ampiezza  # noqa: E402
from europa_settori import settore_it  # noqa: E402
from orari import seduta_in_corso  # noqa: E402

LISTA_BASE = ROOT / "europa.json"
DATA_DIR = ROOT / "data"
LISTA_DATI = DATA_DIR / "europa_lista.json"
OUT_PATH = DATA_DIR / "prezzi_europa.json"
AMPIEZZA_DIR = DATA_DIR / "europa"
INIZIO_DOWNLOAD = "2003-09-01"   # la storia lunga serve all'ampiezza: medie a 200 sedute e massimi a 52 settimane già pronti nel 2005

MIN_RISPOSTE = 0.80
# unità di valuta per un euro: indici e panieri dei settori si confrontano in euro
CAMBI = {"GBP": "EURGBP=X", "CHF": "EURCHF=X", "DKK": "EURDKK=X", "SEK": "EURSEK=X", "NOK": "EURNOK=X"}
CAMBI_MASSIMI = 0.15         # quota massima di entrate+uscite accettate in automatico per indice
GIORNI_CONTROLLO = 7         # ogni quanto si guarda Wikipedia
SUFFISSI = {"FTSE MIB": "MI", "DAX": "DE", "CAC 40": "PA", "IBEX 35": "MC", "AEX": "AS", "SMI": "SW", "FTSE 100": "L",
            "OMX Copenhagen 25": "CO", "OMX Stockholm 30": "ST", "OMX Helsinki 25": "HE", "OBX": "OL", "BEL 20": "BR",
            "ATX": "VI", "PSI": "LS", "ISEQ": "IR"}
VALUTE = {"MI": "EUR", "DE": "EUR", "PA": "EUR", "AS": "EUR", "MC": "EUR", "SW": "CHF", "L": "GBp", "CO": "DKK", "ST": "SEK",
          "HE": "EUR", "OL": "NOK", "BR": "EUR", "VI": "EUR", "LS": "EUR", "IR": "EUR"}
NORDICI = {"CO", "ST", "HE"}      # le classi di azioni hanno lo spazio: «NOVO B» su Yahoo è NOVO-B.CO


def log(msg: str) -> None:
    print(f"[{dt.datetime.now():%H:%M:%S}] {msg}", flush=True)


def cifre(v, n: int = 5) -> Optional[float]:
    if v is None:
        return None
    try:
        x = float(v)
    except (TypeError, ValueError):
        return None
    return float(f"{x:.{n}g}") if np.isfinite(x) else None


def carica_lista(percorsi: Tuple[Path, ...] = (LISTA_DATI, LISTA_BASE)) -> dict:
    """L'elenco più recente fra quello aggiornato in automatico (data/) e quello di base (europa.json, che può
    arrivare nuovo con una versione del sito); a parità di data vince quello aggiornato in automatico."""
    liste = []
    for p in percorsi:
        if p.exists():
            with open(p, encoding="utf-8") as f:
                liste.append(json.load(f))
    if not liste:
        raise FileNotFoundError("europa.json")
    return max(liste, key=lambda x: str(x.get("aggiornato", "")))


# ---------------------------------------------------------------------------
# composizioni da Wikipedia
# ---------------------------------------------------------------------------

def norm_nome(s: str) -> str:
    s = unicodedata.normalize("NFD", str(s)).encode("ascii", "ignore").decode().lower().replace(".", "").replace(",", " ")
    s = re.sub(r"\b(plc|ag|sa|se|nv|spa|group|groep|holdings?|ltd|limited|inc|the|de|la|co)\b", " ", s)
    return re.sub(r"[^a-z0-9]+", "", s)


def ticker_yahoo(grezzo: str, indice: str) -> Optional[str]:
    suff = SUFFISSI[indice]
    t = re.sub(r"\[.*?\]", "", str(grezzo)).strip().upper().split(":")[-1].strip()
    t = re.sub(r"\s+", "-" if suff in NORDICI else "", t)
    if not t or t in ("NAN", "-"):
        return None
    if indice == "FTSE 100":
        t = t.rstrip(".").replace(".", "-")
        return re.sub(r"-L$", "", t) + ".L"
    if re.search(r"\.[A-Z]{1,2}$", t):
        base, s = t.rsplit(".", 1)
        return t if s in VALUTE else f"{base}.{suff}"
    return f"{t}.{suff}"


def leggi_tabella(html: str, indice: str) -> List[Tuple[str, str, str]]:
    """(nome, ticker Yahoo, settore) dalla tabella più lunga che ha nome e ticker."""
    migliore: List[Tuple[str, str, str]] = []
    for tab in pd.read_html(StringIO(html)):
        if isinstance(tab.columns, pd.MultiIndex):
            tab.columns = [" ".join(str(x) for x in c if "Unnamed" not in str(x)) for c in tab.columns]
        col = {str(c).lower(): c for c in tab.columns}
        c_tick = next((col[k] for k in col if re.search(r"ticker|symbol|epic", k)), None)
        c_nome = next((col[k] for k in col if re.search(r"company|name|constituent", k)), None)
        c_sett = next((col[k] for k in col if re.search(r"sector|industry|icb|gics", k)), None)
        if c_tick is None or c_nome is None:
            continue
        righe = []
        for _, r in tab.iterrows():
            t = ticker_yahoo(r[c_tick], indice)
            nome = re.sub(r"\[.*?\]", "", str(r[c_nome])).strip()
            if t and nome and nome.lower() != "nan":
                righe.append((nome, t, "" if c_sett is None else str(r[c_sett])))
        if len(righe) > len(migliore):
            migliore = righe
    return migliore


def html_wikipedia(url: str) -> Optional[str]:
    import requests
    try:
        r = requests.get(url, timeout=30, headers={"User-Agent": "radar-settori/1.0 (sito personale)"})
        return r.text if r.ok else None
    except Exception as e:  # noqa: BLE001
        log(f"  {url}: {e}")
        return None


def aggiorna_composizioni(lista: dict, prendi_html: Callable[[str], Optional[str]] = html_wikipedia,
                          oggi: Optional[dt.date] = None) -> Tuple[dict, List[str]]:
    """Confronta ogni indice con Wikipedia e applica solo cambiamenti piccoli. Restituisce la lista e le novità."""
    oggi = oggi or dt.date.today()
    titoli = {x["t"]: x for x in lista["titoli"]}
    novita: List[str] = []
    for ind in lista["indici"]:
        nome_ind = ind["nome"]
        html = prendi_html(ind["pagina"]) if ind.get("pagina") else None
        if not html:
            continue
        try:
            letti = leggi_tabella(html, nome_ind)
        except Exception as e:  # noqa: BLE001
            log(f"  {nome_ind}: tabella non letta ({e})")
            continue
        membri = {t: x for t, x in titoli.items() if nome_ind in x["indici"]}
        per_nome = {norm_nome(x["nome"]): t for t, x in membri.items()}
        visti, nuovi = set(), []
        for nome, t, sett in letti:
            if t in membri:
                visti.add(t)
            elif norm_nome(nome) in per_nome:
                visti.add(per_nome[norm_nome(nome)])
            else:
                nuovi.append((nome, t, sett))
        usciti = [t for t in membri if t not in visti]
        n = max(len(membri), 1)
        if not letti or abs(len(letti) - n) > max(3, 0.2 * n) or len(nuovi) + len(usciti) > max(3, CAMBI_MASSIMI * n):
            log(f"  {nome_ind}: Wikipedia non torna con la lista ({len(letti)} titoli, {len(nuovi)} nuovi, {len(usciti)} usciti): lista invariata")
            continue
        for t in usciti:
            titoli[t]["indici"] = [i for i in titoli[t]["indici"] if i != nome_ind]
            novita.append(f"{nome_ind}: esce {titoli[t]['nome']}")
            if not titoli[t]["indici"]:
                del titoli[t]
        for nome, t, sett in nuovi:
            suff = t.rsplit(".", 1)[1]
            if t in titoli:
                titoli[t]["indici"].append(nome_ind)
            else:
                titoli[t] = {"t": t, "nome": nome, "indici": [nome_ind], "paese": ind["paese"],
                             "settore": settore_it(sett, nome), "valuta": VALUTE.get(suff, ind.get("valuta", "EUR"))}
            novita.append(f"{nome_ind}: entra {nome} ({t})")
    nuova = dict(lista)
    nuova["titoli"] = sorted(titoli.values(), key=lambda x: (x["indici"][0], x["nome"]))
    nuova["aggiornato"] = oggi.isoformat()
    return nuova, novita


def salva_lista(lista: dict, path: Path = LISTA_DATI) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(lista, f, ensure_ascii=False, separators=(",", ":"))


# ---------------------------------------------------------------------------
# prezzi
# ---------------------------------------------------------------------------

def inizio_storia(oggi: dt.date) -> str:
    """Dal 1° gennaio di due anni prima: fra 2 e 3 anni di sedute. L'inizio cambia una volta all'anno, così ogni
    giorno il file cresce solo in fondo e nel repository ogni aggiornamento pesa poco."""
    return f"{oggi.year - 2}-01-01"


def yahoo_prezzi(simboli: List[str], inizio: str) -> pd.DataFrame:
    import build_prices
    return build_prices.yahoo_prices(simboli, inizio, batch=40)


def yahoo_ultimi(simboli: List[str], batch: int = 40) -> Dict[str, Tuple[pd.Timestamp, float]]:
    """Ultimo prezzo scambiato (barre da 15 minuti), a gruppi: Yahoo mette la chiusura europea nella serie
    giornaliera solo il giorno dopo, all'apertura."""
    import build_prices
    out: Dict[str, Tuple[pd.Timestamp, float]] = {}
    for i in range(0, len(simboli), batch):
        out.update(build_prices.yahoo_last_quotes(simboli[i:i + batch]))
    return out


def aggiungi_ultimi(px: pd.DataFrame, ultimi: Dict[str, Tuple[pd.Timestamp, float]]) -> pd.DataFrame:
    """Aggiunge l'ultima chiusura dove la serie giornaliera non ce l'ha ancora."""
    for sym, (giorno, prezzo) in ultimi.items():
        if sym not in px.columns or prezzo is None or not np.isfinite(prezzo):
            continue
        s = px[sym].dropna()
        if s.empty or giorno <= s.index[-1]:
            continue
        if giorno not in px.index:
            px.loc[giorno] = np.nan
            px = px.sort_index()
        px.at[giorno, sym] = prezzo
    return px


def calendario_maggioranza(px: pd.DataFrame) -> pd.DatetimeIndex:
    """I giorni in cui ha quotato almeno metà dei titoli già in borsa quel giorno (negli anni passati molti
    titoli di oggi non c'erano ancora)."""
    attivi = px.notna().sum(axis=1)
    iniziati = px.notna().cummax().sum(axis=1)
    return px.index[(attivi >= 0.5 * iniziati) & (attivi > 0)]


def build_europa(out_path: Path = OUT_PATH, scarica: Callable[[List[str], str], pd.DataFrame] = yahoo_prezzi,
                 prendi_html: Optional[Callable[[str], Optional[str]]] = html_wikipedia,
                 adesso: Optional[pd.Timestamp] = None, lista: Optional[dict] = None,
                 ampiezza_dir: Optional[Path] = None,
                 ultimi: Optional[Callable[[List[str]], Dict[str, Tuple[pd.Timestamp, float]]]] = None) -> Optional[dict]:
    lista = lista or carica_lista()
    oggi = (adesso or pd.Timestamp.now(tz="UTC")).date()
    try:
        ultima = dt.date.fromisoformat(str(lista.get("aggiornato", "2000-01-01")))
    except ValueError:
        ultima = dt.date(2000, 1, 1)
    if prendi_html is not None and (oggi - ultima).days >= GIORNI_CONTROLLO:
        lista, novita = aggiorna_composizioni(lista, prendi_html, oggi)
        for n in novita:
            log("  " + n)
        salva_lista(lista, out_path.parent / LISTA_DATI.name)

    titoli = lista["titoli"]
    simboli = [x["t"] for x in titoli]
    indici = lista["indici"] + [dict(lista["confronto"], paese="Europa")] if lista.get("confronto") else lista["indici"]
    inizio = inizio_storia(oggi)
    log(f"Europa: scarico {len(simboli)} titoli e {len(indici)} indici…")
    px = scarica(simboli + [i["yahoo"] for i in indici] + list(CAMBI.values()), INIZIO_DOWNLOAD)
    if px is None or px.empty:
        log("Europa: nessun prezzo, resta il file già pubblicato")
        return None
    if ultimi is not None:
        try:
            px = aggiungi_ultimi(px, ultimi(simboli + [i["yahoo"] for i in indici]))
        except Exception as e:  # noqa: BLE001
            log(f"Europa: ultimi prezzi non disponibili ({e})")
    in_corso = seduta_in_corso("Borsa Italiana", adesso)
    if in_corso is not None:
        px = px[px.index < in_corso]
    presenti = [t for t in simboli if t in px.columns and px[t].notna().sum() >= 20]
    if len(presenti) < MIN_RISPOSTE * len(simboli):
        log(f"Europa: prezzi solo per {len(presenti)} titoli su {len(simboli)}: resta il file già pubblicato")
        return None
    cal_lungo = calendario_maggioranza(px[presenti])
    cal = cal_lungo[cal_lungo >= pd.Timestamp(inizio)]
    try:
        with open(out_path, encoding="utf-8") as f:
            prima = json.load(f).get("aggiornato")
    except Exception:  # noqa: BLE001
        prima = None
    ultimo = cal.max().strftime("%Y-%m-%d")
    if prima and ultimo < prima:
        log("Europa: i dati nuovi sono più vecchi di quelli pubblicati, resta il file già pubblicato")
        return None

    def serie(t: str) -> Optional[dict]:
        if t not in px.columns:
            return None
        s = px[t].reindex(px.index.union(cal)).ffill(limit=3).reindex(cal)
        if s.notna().sum() < 20:
            return None
        i0 = int(np.argmax(s.notna().to_numpy()))
        return {"i0": i0, "prezzi": [cifre(v) for v in s.iloc[i0:]]}

    uscita = []
    for x in titoli:
        s = serie(x["t"])
        if s:
            uscita.append({**{k: x[k] for k in ("t", "nome", "indici", "paese", "settore", "valuta")}, **s})
    usc_indici = []
    for i in indici:
        s = serie(i["yahoo"])
        if s:
            usc_indici.append({"nome": i["nome"], "yahoo": i["yahoo"], "paese": i.get("paese", ""), **s})
    cambi = {}
    for valuta, t in CAMBI.items():
        if t in px.columns:
            s = px[t].dropna()
            s = s[(s > 0) & (s.index >= pd.Timestamp(inizio))]
            if len(s) >= 20:
                cambi[valuta] = {"date": [d.strftime("%Y-%m-%d") for d in s.index], "valori": [cifre(v, 6) for v in s.to_numpy()]}
    payload = {
        "aggiornato": ultimo,
        "generato": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "date": [d.strftime("%Y-%m-%d") for d in cal],
        "indici": usc_indici,
        "titoli": uscita,
        "cambi": cambi,
        "mancanti": [t for t in simboli if t not in presenti],
    }
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
    log(f"Europa: {len(uscita)} titoli e {len(usc_indici)} indici al {ultimo}"
        + (f", senza prezzi: {', '.join(payload['mancanti'][:12])}" if payload["mancanti"] else ""))

    # ampiezza storica di settori e indici, con gli stati (come negli USA)
    cartella = ampiezza_dir or out_path.parent / AMPIEZZA_DIR.name
    try:
        cfg = json.loads((ROOT / "settings.json").read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001
        cfg = {}
    try:
        # i livelli blu scritti a mano stanno in europa.json (la lista aggiornata in automatico non li ha)
        soglie = lista.get("soglie")
        try:
            soglie = json.loads(LISTA_BASE.read_text(encoding="utf-8")).get("soglie") or soglie
        except Exception:  # noqa: BLE001
            pass
        meta = europa_ampiezza.scrivi(px, cal_lungo, dict(lista, soglie=soglie or {}), cartella, cfg.get("inizio_storico", "2005-01-03"),
                                      cfg.get("parametri", {}), lista.get("confronto"))
        if meta:
            log(f"Europa: ampiezza di {len(meta['settori'])} settori e indici dal {meta['inizio']}")
            aggiorna_stati(cartella)
    except Exception as e:  # noqa: BLE001
        log(f"Europa: ampiezza non aggiornata ({e})")
    return {"titoli": len(uscita), "indici": len(usc_indici), "aggiornato": ultimo}


def aggiorna_stati(cartella: Path) -> bool:
    """Stati di settori e indici con i livelli predefiniti (data/europa/stati.json), calcolati con signals.js."""
    import shutil
    import subprocess
    node = shutil.which("node")
    if not node:
        log("Node non disponibile: stati europei non aggiornati")
        return False
    try:
        r = subprocess.run([node, str(ROOT / "stati.js"), str(cartella)], capture_output=True, text=True, timeout=180)
    except Exception as e:  # noqa: BLE001
        log(f"Stati europei non aggiornati ({e})")
        return False
    log((r.stdout or r.stderr).strip()[:300])
    return r.returncode == 0


def main() -> int:
    try:
        return 0 if build_europa(ultimi=yahoo_ultimi) else 1
    except Exception as e:  # noqa: BLE001
        log(f"Europa: errore ({e}), resta il file già pubblicato")
        return 1


if __name__ == "__main__":
    sys.exit(main())
