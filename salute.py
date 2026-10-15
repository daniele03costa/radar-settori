"""
Radar Settori — salute dei dati: ogni passo dell'aggiornamento automatico lascia un piccolo resoconto in
data/salute/<passo>.json (esito, ora, data dei dati, titoli e indici senza prezzi o fermi).

La pagina «Salute dei dati» del sito legge questi file (pochi kB) invece dei file dei prezzi (molti MB).
Un file per passo: aggiornamenti diversi che girano insieme non scrivono mai lo stesso file.
Il resoconto non deve mai fermare l'aggiornamento: ogni errore qui dentro viene ignorato.
"""
from __future__ import annotations

import contextlib
import datetime as dt
import json
import re
from pathlib import Path
from typing import Dict, Iterable, List, Optional

ROOT = Path(__file__).resolve().parent
CARTELLA = ROOT / "data" / "salute"
SEDUTE_FERMO = 5          # un prezzo che non cambia data da più di 5 sedute del calendario è «fermo»
AVVISI = re.compile(r"non aggiornat|errore|non disponibil|mancant|escluso|resta il file", re.I)


def adesso_utc() -> str:
    return dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def registra(passo: str, ok: bool, messaggio: str = "", cartella: Optional[Path] = None, **dettagli) -> Optional[dict]:
    """Scrive data/salute/<passo>.json. ok=False tiene la data dell'ultimo successo e conta gli errori di fila."""
    try:
        cartella = Path(cartella or CARTELLA)
        file = cartella / f"{passo}.json"
        try:
            prima = json.loads(file.read_text(encoding="utf-8"))
        except Exception:  # noqa: BLE001
            prima = {}
        ora = adesso_utc()
        out = {
            "passo": passo,
            "esito": "ok" if ok else "errore",
            "ultimo_tentativo": ora,
            "ultimo_successo": ora if ok else prima.get("ultimo_successo"),
            "errori_di_fila": 0 if ok else int(prima.get("errori_di_fila") or 0) + 1,
            "messaggio": str(messaggio or "")[:400],
        }
        if not ok:
            # i dettagli dell'ultimo successo restano: dicono che cosa c'è ancora pubblicato
            for k in ("aggiornato", "titoli", "totale", "mancanti", "indici_mancanti", "fermi", "indici_fermi", "serie"):
                if k in prima and k not in dettagli:
                    out[k] = prima[k]
        out.update({k: v for k, v in dettagli.items() if v is not None})
        if out.get("avvisi"):
            # il messaggio dell'errore non si ripete fra gli avvisi
            out["avvisi"] = [x for x in out["avvisi"] if x != out["messaggio"]]
            if not out["avvisi"]:
                del out["avvisi"]
        if ok and out.get("avvisi"):
            out["esito"] = "avvisi"
        cartella.mkdir(parents=True, exist_ok=True)
        tmp = file.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
        tmp.replace(file)
        return out
    except Exception:  # noqa: BLE001
        return None


class Registro:
    """Raccoglie i messaggi di log di un modulo mentre gira un passo: l'ultimo spiega perché non ha pubblicato,
    quelli con «errore», «non aggiornato»… diventano avvisi."""

    def __init__(self) -> None:
        self.messaggi: List[str] = []

    @property
    def ultimo(self) -> str:
        return self.messaggi[-1] if self.messaggi else ""

    @property
    def avvisi(self) -> List[str]:
        return [m for m in self.messaggi if AVVISI.search(m)][-6:]


@contextlib.contextmanager
def ascolta(*moduli):
    """with ascolta(build_europa) as reg: … — copia ogni messaggio passato a modulo.log anche in reg.messaggi."""
    reg = Registro()
    originali = []
    for m in moduli:
        f = getattr(m, "log", None)
        if f is None:
            continue
        originali.append((m, f))

        def nuovo(msg, _f=f):
            reg.messaggi.append(str(msg))
            _f(msg)
        m.log = nuovo
    try:
        yield reg
    finally:
        for m, f in originali:
            m.log = f


def fermi(px, simboli: Iterable[str], calendario, sedute: int = SEDUTE_FERMO) -> Dict[str, str]:
    """{simbolo: data dell'ultimo prezzo} per i simboli che non hanno prezzi nelle ultime `sedute` sedute del
    calendario (sospesi, tolti dal listino o con il ticker cambiato). px: DataFrame di prezzi grezzi (prima dei
    riempimenti), calendario: le sedute pubblicate."""
    out: Dict[str, str] = {}
    try:
        if len(calendario) <= sedute:
            return out
        limite = calendario[-sedute - 1]
        for t in simboli:
            if t not in px.columns:
                continue
            ultimo = px[t].last_valid_index()
            if ultimo is not None and ultimo <= limite:
                out[t] = ultimo.strftime("%Y-%m-%d")
    except Exception:  # noqa: BLE001
        pass
    return out
