# Radar Settori

Sito statico (GitHub Pages) per seguire i settori dell'S&P 500 e un gruppo di ETF globali in euro:

| Vista | A cosa serve |
|---|---|
| **1 · Monitor** | Tutti gli 11 settori in una tabella, ordinati da chi è più vicino a un segnale. Per ognuno: stato, andamento degli ultimi 6 mesi della quota di titoli sopra la media 200, valore di oggi e variazione in un mese, distanza dal livello blu, drawdown (in rosso se è tra il 20% più profondo della storia) e quadrante di rotazione contro SPY. In più, cosa manca a ogni settore per cambiare stato. |
| **2 · Rotazione** | Grafico della forza relativa (RS-Ratio) e della sua variazione (RS-Momentum) contro un termine di confronto, con scia, animazione nel tempo, tabella (quadrante, direzione, velocità, distanza, durata, quadrante precedente), tabella dei prezzi e andamento base 100 su 3M/6M/1A/2A. Universi: settori S&P 500, MAG7, e ETF in euro per asset class, fattori, regioni e paesi. Per le asset class c'è il portafoglio di riferimento con pesi modificabili. |
| **3 · Bottom Map** | Ogni settore è un punto: profondità del drawdown rispetto alla sua storia contro distanza dal livello blu, con la scia delle ultime settimane. |
| **4 · Settore** | Prezzo con media 200, drawdown e ampiezza (medie 200, 50, 20) con zone blu e trigger; livello blu regolabile; storico degli episodi; tutti i titoli del settore, come mappa a tessere e tabella completa, con la scheda del singolo titolo. |
| **5 · Alert** | La striscia degli stati di ogni settore dal 2005 e tutti i cambi di stato, filtrabili per tipo e settore, con statistiche riassuntive e le regole. |

In più: pulsante **«Copia per Claude»** (tasto `C`) per parlare con Claude dei numeri della pagina, barra dei comandi (tasto `/`) che trova anche tutte le azioni dell'S&P 500, scorciatoie da tastiera (`1`–`5`, frecce, spazio, `Esc`, `?`), guida, tema chiaro/scuro, colori per daltonici (**CVD**), avviso quando i dati sono in ritardo rispetto all'ultima seduta, stampa in bianco e nero, versione per smartphone.

I dati si aggiornano da soli dopo la chiusura di Wall Street (con due tentativi di recupero nella notte) tramite GitHub Actions.

Solo per studio personale: non è una consulenza finanziaria.

---

## Messa online (una volta sola, circa 15 minuti)

### 1. Crea il repository
1. Accedi a [github.com](https://github.com) (o crea un account gratuito).
2. In alto a destra **+** → **New repository**.
3. Nome `radar-settori`, visibilità **Public**, nient'altro → **Create repository**.

### 2. Carica i file
1. Nella pagina del repository vuoto clicca su **uploading an existing file**.
2. Apri la cartella `radar-settori` estratta dallo zip, seleziona **tutti i file** (Ctrl+A) e trascinali nella pagina. Tutti i file stanno nella stessa cartella: non ci sono sottocartelle da ricreare.
3. In fondo premi **Commit changes**.

### 3. Aggiungi l'aggiornamento automatico
La cartella `.github` è nascosta (su Mac non si vede nel Finder), quindi conviene crearla a mano:
1. **Add file** → **Create new file**.
2. Come nome scrivi esattamente `.github/workflows/aggiorna-dati.yml`.
3. Apri con un editor di testo il file `aggiorna-dati.yml` dello zip (in `.github/workflows/`; su Mac ⌘⇧. nel Finder mostra le cartelle nascoste), copia tutto e incollalo.
4. **Commit changes**.

### 4. Permessi
**Settings** → **Actions** → **General** → *Workflow permissions* → **Read and write permissions** → **Save**.

### 5. Primo scaricamento dei dati
**Actions** (se richiesto, abilita i workflow) → **Aggiorna dati** → **Run workflow**. La prima volta servono 15–25 minuti: oltre 20 anni di prezzi per circa 700 titoli, più gli ETF della rotazione.

### 6. Pubblica
**Settings** → **Pages** → *Source* **Deploy from a branch** → *Branch* **main** e **/ (root)** → **Save**.
Dopo un paio di minuti il sito è su `https://TUO-NOME-UTENTE.github.io/radar-settori/`.

---

## Parlare con Claude di quello che vedi

Con l'estensione **Claude in Chrome**, compresa negli abbonamenti a pagamento di Claude, si apre Claude in un pannello di fianco al sito e gli si chiede di quello che c'è sulla pagina. Non ci sono costi in più.

1. In Chrome sul computer apri il Chrome Web Store, cerca **Claude** (di Anthropic) e premi **Aggiungi a Chrome**; accedi con il tuo account Claude e fissa l'icona nella barra (pezzo di puzzle → puntina).
2. Apri Radar Settori e premi l'icona di Claude: si apre il pannello laterale. Chiedi per esempio «Com'è messo questo settore?» o «Spiegami questo grafico».
3. Claude legge il testo della pagina e può guardarla. Per dargli anche i numeri che nei grafici non si leggono (storico mese per mese, tutti i titoli, episodi, scie della rotazione) premi **Copia per Claude**, in basso nella barra laterale (o il tasto `C`), e incolla nel pannello con Ctrl+V. Lo stesso testo si può incollare in qualsiasi chat con Claude.

---

## Uso rapido

- **Barra dei comandi** (`/`): il ticker di un ETF settoriale apre il settore; il ticker o il nome di qualsiasi azione dell'S&P 500 (`AAPL`, `coca cola`) apre il suo settore con il titolo in evidenza; gli ETF della rotazione (anche senza il suffisso di borsa), il loro nome breve o una parola del nome li evidenziano nella rotazione; un termine di confronto (`SPY`, `QQQ`, `RSP`, `ACWI`, `PTF`) apre la rotazione contro di lui; `MON` `ROT`/`RRG` `BTM` `SEC` `ALRT` `HELP` aprono viste e guida; `CHIARO` `SCURO` `TEMA` cambiano il tema.
- **Indirizzi**: `#XLU` apre un settore, `#XLK/AAPL` o `#AAPL` un'azione nel suo settore; `#mon` `#rot` `#btm` `#sec` `#alr` le viste. Il pulsante Indietro funziona.
- **Tasti**: `1`–`5` viste · `←` `→` periodo (Settore) o data (Rotazione) · `Spazio` animazione · `Esc` toglie l'evidenza · `C` copia i dati della pagina per Claude · `?` guida. I tasti rapidi si disattivano dalla guida.
- Livello blu, pesi del portafoglio, universo e tema scelti restano solo nel browser di chi li cambia.

## Domande frequenti

**Nella scheda Actions c'è una X rossa.** Di solito Yahoo Finance ha limitato i download per un po'. Il sito continua a mostrare i dati precedenti; i passaggi di recupero della notte o un *Run workflow* manuale sistemano.

**Voglio cambiare il livello blu di un settore per tutti.** Nella vista Settore premi **Copia configurazione**, apri `settings.json` su GitHub (icona della matita), sostituisci la riga `"soglie"` e lancia *Aggiorna dati*.

**Voglio aggiungere o togliere un ETF dalla rotazione.** Modifica `universi.json`: il prossimo aggiornamento scarica la nuova lista.

**GitHub dice che i workflow programmati sono stati disattivati.** Succede dopo 60 giorni senza attività nel repository: riattivali dalla scheda Actions.

---

## Regole degli stati

I valori si trovano in `signals.js` (`PARAMETRI`) e si possono cambiare in `settings.json` → `"parametri"`.

- **Ampiezza**: quota dei titoli del settore nell'S&P 500 che chiudono sopra la propria media a 200 sedute (e a 50 e 20). Prezzi corretti per gli split, non per i dividendi. Per il passato si usano i membri dell'indice di allora.
- **Attenzione**: l'ampiezza è a 10 punti o meno sopra il livello blu, oppure il drawdown del settore supera per profondità l'85% delle sedute passate.
- **Zona blu**: 2 chiusure di fila con l'ampiezza al livello blu o sotto, mentre il drawdown supera il 70° percentile di profondità (calcolato solo sul passato).
- **Trigger**: l'ampiezza risale sopra il livello blu di almeno 5 punti o 2 titoli (vale il più grande) e di almeno 2 titoli sopra il minimo della zona; inoltre serve una conferma fra spinta di ampiezza (media 20: da ≤15% a ≥70% in 15 sedute, oppure media 50: da ≤10% a ≥50% in 20), prezzo sopra una media 20 in salita e divergenza prezzo/ampiezza. Le conferme diventano 2 se la zona dura più di 60 sedute o dopo un fallimento. Il ritorno diretto sopra il livello di riarmo (rimbalzo a V) basta da solo.
- **Fallito**: entro 20 sedute dal trigger l'ETF chiude sotto il minimo della zona meno la variazione giornaliera media (20 sedute); si torna in zona blu.
- **Cooldown**: 63 sedute dopo il trigger. Una nuova zona blu richiede prima l'ampiezza sopra il livello di riarmo, il maggiore tra 40% e livello blu + 25.

**Livelli blu predefiniti** (tabella quant-rea «200 LEVEL SETTORI»): XLK 6%, XLC 5%, XLY 8%, XLP 11%, XLE 1%, XLF 6%, XLV 11%, XLI 5%, XLB 10%, XLRE 8%, XLU 5%.

Scelte di dettaglio fatte in questa versione: una spinta di ampiezza vale come conferma per 20 sedute; la divergenza c'è quando, dopo il minimo di ampiezza della zona, il prezzo scende sotto il livello di quel giorno mentre l'ampiezza è almeno un titolo sopra il suo minimo; la media 20 "sale" se è più alta del giorno prima; il percentile del drawdown usa solo le sedute fino a quel giorno.

## Rotazione: come si calcola

Tre modi, scelti nella vista (spiegati anche nella pagina):
- **Nuovo** (predefinito): logaritmo del rapporto prezzo/confronto; differenza tra le medie esponenziali a 10 e 30 barre, divisa per la volatilità del rapporto (media esponenziale dei quadrati delle variazioni, emivita 26 barre) e per √10 → X. RS-Ratio = 100 + 2,5·X; RS-Momentum = 100 + 2,5·√8·(X − media esponenziale a 8 barre di X).
- **Medie semplici**: RS-Ratio = 100 × media 10 / media 30 del rapporto; RS-Momentum = 100 × RS-Ratio / media 9 di RS-Ratio.
- **Classico**: scarti standardizzati su 26 barre della media 10 del rapporto e della variazione a 4 barre di RS-Ratio.

«Relative Rotation Graphs» è un marchio di RRG Research: qui c'è un calcolo indipendente con la stessa idea.

## File del progetto

Tutti i file stanno nella cartella principale del repository (solo l'aggiornamento automatico è in `.github/workflows/`).

| File | Contenuto |
|---|---|
| `build_data.py` | ampiezza dei settori e dell'intero indice, ETF settoriali, fotografia dei titoli, elenco di tutte le azioni per la ricerca → `data/meta.json`, `data/indice.json`, `data/settori/*.json`, `data/titoli.json` |
| `build_prices.py` | prezzi per la rotazione → `data/prezzi_usa.json`, `data/prezzi_globali.json` (calendario a maggioranza, bitcoin, cambi, correzione di prezzi anomali, controlli di qualità) |
| `requirements.txt` | librerie Python usate dall'aggiornamento |
| `.github/workflows/aggiorna-dati.yml` | aggiornamento automatico |
| `settings.json` | settori, livelli blu, parametri degli stati |
| `universi.json` | universi, termini di confronto, portafoglio di riferimento |
| `signals.js` | macchina a stati ed episodi |
| `rrg.js`, `portafoglio.js`, `calendario.js` | rotazione, portafoglio, calendari NYSE e Borsa Italiana |
| `view-*.js`, `app.js`, `core.js`, `chart.js`, `style.css`, `viste.css` | le cinque viste, la struttura dell'app e la grafica |
| `copia-dati.js` | il pulsante «Copia per Claude» (il testo di ogni pagina lo preparano le viste) |
| `test_*.py`, `*.test.js` | test con dati simulati: `python -m pytest` · `node --test signals.test.js motori.test.js` |
| `data/` | creata dall'aggiornamento automatico, non va caricata a mano |

Fonti: prezzi Yahoo Finance; composizione dell'S&P 500 da Wikipedia e dai dataset pubblici *datasets/s-and-p-500-companies* e *fja05680/sp500*. Yahoo non ha i prezzi delle società uscite dal listino, quindi lo storico dei primi anni ne è privo (un po' di distorsione a favore dei "sopravvissuti").
