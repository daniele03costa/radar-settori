"""
Radar Settori — settori e paesi per le azioni europee e per i titoli del portafoglio.

Le fonti usano classificazioni diverse (ICB, GICS, quelle di Yahoo): qui si riportano tutte agli stessi
11 settori del sito, con i nomi italiani usati per l'S&P 500.
"""
from __future__ import annotations

SETTORI = ["Tecnologia", "Comunicazioni", "Consumi discrezionali", "Beni di prima necessità", "Energia", "Finanziari",
           "Sanità", "Industriali", "Materiali", "Immobiliare", "Utility"]

# prima le eccezioni per nome, poi le parole chiave nell'ordine in cui vanno cercate
ECCEZIONI = {"RELX": "Industriali", "Wolters Kluwer": "Industriali", "Pearson": "Consumi discrezionali",
             "Acciona Energía": "Utility", "Snam": "Utility", "Siemens Energy": "Industriali"}
REGOLE = [
    ("Immobiliare", ["real estate", "reit"]),
    ("Beni di prima necessità", ["food", "beverage", "tobacco", "consumer staples", "consumer defensive", "consumer goods",
                                 "household products", "personal care"]),
    ("Utility", ["utilit", "electric util", "independent power"]),
    ("Energia", ["oil", "energy"]),
    ("Finanziari", ["bank", "financ", "insurance", "investment trust", "collective", "capital markets"]),
    ("Sanità", ["health", "pharma", "biotech", "medical"]),
    ("Tecnologia", ["software", "techno", "semiconductor", "electronic", "information"]),
    ("Comunicazioni", ["telecom", "communication", "media", "entertainment"]),
    ("Materiali", ["mining", "chemical", "material", "steel", "metals", "paper"]),
    ("Consumi discrezionali", ["consumer cyclical", "consumer products", "consumer discretionary", "consumer services", "apparel",
                               "automo", "retail", "hotel", "gambling", "leisure", "e-commerce", "homebuilding", "luxury",
                               "textile", "restaurant", "travel"]),
    ("Industriali", ["industrial", "aerospace", "defen", "logistic", "construction", "engineering", "support services",
                     "infrastructure", "distribution", "shipbuilding", "airline", "transport", "machinery"]),
]
# settori di Yahoo Finance (ticker.info["sector"])
YAHOO = {"Technology": "Tecnologia", "Communication Services": "Comunicazioni", "Consumer Cyclical": "Consumi discrezionali",
         "Consumer Defensive": "Beni di prima necessità", "Energy": "Energia", "Financial Services": "Finanziari",
         "Healthcare": "Sanità", "Industrials": "Industriali", "Basic Materials": "Materiali", "Real Estate": "Immobiliare",
         "Utilities": "Utility"}

PAESI = {"United States": "Stati Uniti", "Italy": "Italia", "Germany": "Germania", "France": "Francia", "Spain": "Spagna",
         "Netherlands": "Paesi Bassi", "Switzerland": "Svizzera", "United Kingdom": "Regno Unito", "Ireland": "Irlanda",
         "Belgium": "Belgio", "Luxembourg": "Lussemburgo", "Denmark": "Danimarca", "Sweden": "Svezia", "Norway": "Norvegia",
         "Finland": "Finlandia", "Austria": "Austria", "Portugal": "Portogallo", "Japan": "Giappone", "China": "Cina",
         "Canada": "Canada", "Australia": "Australia", "Taiwan": "Taiwan", "South Korea": "Corea del Sud", "Israel": "Israele",
         "Brazil": "Brasile", "India": "India", "Hong Kong": "Hong Kong", "Jersey": "Jersey", "Bermuda": "Bermuda"}
# paese della borsa dal suffisso del ticker di Yahoo
PAESE_SUFFISSO = {"MI": "Italia", "DE": "Germania", "F": "Germania", "PA": "Francia", "AS": "Paesi Bassi", "MC": "Spagna",
                  "BR": "Belgio", "LS": "Portogallo", "VI": "Austria", "HE": "Finlandia", "IR": "Irlanda", "L": "Regno Unito",
                  "SW": "Svizzera", "CO": "Danimarca", "ST": "Svezia", "OL": "Norvegia", "TO": "Canada", "T": "Giappone",
                  "HK": "Hong Kong", "AX": "Australia"}


def settore_it(grezzo: str, nome: str = "") -> str:
    """Uno degli 11 settori del sito, da un nome di settore di qualunque classificazione."""
    if nome in ECCEZIONI:
        return ECCEZIONI[nome]
    if grezzo in YAHOO:
        return YAHOO[grezzo]
    s = f" {str(grezzo or '').lower()} "
    for settore, parole in REGOLE:
        if any(p in s for p in parole):
            return settore
    return "Altro"


def paese_it(nome_inglese: str) -> str:
    return PAESI.get(nome_inglese, nome_inglese or "")
