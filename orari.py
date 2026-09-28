"""
Radar Settori — orari delle borse.

Le regole del sito lavorano sulle chiusure: una seduta si pubblica solo quando è finita.
Se l'aggiornamento parte mentre la borsa è aperta (per esempio lanciato a mano nel pomeriggio),
i prezzi di quel giorno sono provvisori e vengono scartati.
"""
from __future__ import annotations

import datetime as dt
from typing import Optional

import pandas as pd

# fuso orario della borsa e ora locale dopo la quale i prezzi del giorno sono chiusure definitive
# (qualche minuto di margine dopo la chiusura: Wall Street alle 16:00, Milano alle 17:30 più l'asta)
CHIUSURE = {
    "NYSE": ("America/New_York", dt.time(16, 30)),
    "Borsa Italiana": ("Europe/Rome", dt.time(17, 45)),
}


def seduta_in_corso(mercato: str, adesso: Optional[pd.Timestamp] = None) -> Optional[pd.Timestamp]:
    """La data di oggi (nel fuso della borsa) se la seduta di oggi non è ancora chiusa, altrimenti None."""
    fuso, ora = CHIUSURE[mercato]
    t = pd.Timestamp.now(tz="UTC") if adesso is None else pd.Timestamp(adesso)
    if t.tzinfo is None:
        t = t.tz_localize("UTC")
    locale = t.tz_convert(fuso)
    if locale.time() >= ora:
        return None
    return pd.Timestamp(locale.date())


def solo_chiusure(indice: pd.DatetimeIndex, mercato: str, adesso: Optional[pd.Timestamp] = None) -> pd.DatetimeIndex:
    """Toglie dall'elenco delle date la seduta di oggi, se la borsa non ha ancora chiuso."""
    oggi = seduta_in_corso(mercato, adesso)
    if oggi is None:
        return indice
    return indice[indice < oggi]
