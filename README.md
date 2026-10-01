# Radar Settori

Sito statico (GitHub Pages) per seguire i mercati in tre zone, USA, Europa e crypto, più il portafoglio. In alto c'è sempre la barra **Home · USA · Europa · Crypto · Portafoglio**; dentro ogni zona, la riga sotto porta alle sue pagine.

| Zona | Pagine |
|---|---|
| **Home** | Il quadro di oggi: una scheda per zona con l'indice principale (S&P 500, STOXX Europe 600, bitcoin), il grafico dell'ultimo anno con la media 200, la tendenza, l'ampiezza (quante azioni o monete sono sopra la media 200) e i punti chiave (stati dei settori, forza relativa, nuovi massimi e minimi, Mayer, Fear & Greed…); sotto, il riepilogo del portafoglio. Clic su una scheda per entrare nella zona. |
| **USA** | **Monitor**: gli 11 settori dell'S&P 500 ordinati da chi è più vicino a un segnale, con stato, ampiezza, distanza dal livello blu, drawdown, rotazione contro SPY e «Novità della seduta». **Rotazione**: forza relativa (RS-Ratio e RS-Momentum) di settori e MAG7, con scia, animazione, tabelle e andamento base 100. **Bottom Map**: profondità del drawdown contro distanza dal livello blu, con la scia delle ultime settimane. **Settori**: si sceglie il settore; prezzo, drawdown e ampiezza con zone blu e trigger, livello blu regolabile, episodi, tutti i titoli. **Alert**: la striscia degli stati dal 2005 e tutti i cambi di stato. |
| **Europa** | **Monitor**: STOXX Europe 600, ampiezza, nuovi massimi e minimi, andamento e ampiezza di tutta l'Europa, i 15 indici e gli 11 settori con ampiezza e forza relativa. **Rotazione**: settori europei (panieri in euro) contro la media europea, indici europei contro lo STOXX 600, e gli ETF in euro (asset class con il portafoglio di riferimento, fattori, regioni, paesi). **Bottom Map**: indici o settori per distanza dal massimo di 52 settimane e quota di azioni sopra la media 200, con la scia. **Settori e indici**: si sceglie un indice, un settore o tutti e due; andamento, numeri e tutte le sue azioni. **Azioni**: le circa 470 azioni, cercabili per nome, con filtri e la scheda di ciascuna (pulsanti **Segui** e **Aggiungi al portafoglio**). |
| **Crypto** | **Monitor**: bitcoin (tendenza, Mayer, media 200 settimane, dal massimo, halving, Fear & Greed) e le prime 10 per capitalizzazione. **Rotazione**: le monete contro bitcoin o contro il loro paniere. **Bottom Map**: ogni moneta per distanza dal massimo di un anno e distanza dalla media 200. **Analisi**: «cosa è successo dopo» situazioni simili, la regola della media 200, la stagionalità mese per mese e il ciclo dell'halving. **Correlazioni**: fra le monete e fra bitcoin e i mercati. |
| **Portafoglio** | Il **portafoglio** (protetto con password): valore e risultato in euro, composizione, beta e volatilità rispetto all'ACWI, calo massimo, quanto ogni titolo pesa sul rischio, correlazioni e andamento contro il PAC. Sotto, i titoli della tua lista (`miei-titoli.txt`), anche fuori dall'S&P 500, con trend e forza relativa. |

In più: pulsante **«Copia per Claude»** (tasto `C`) per parlare con Claude dei numeri della pagina, casella di ricerca (tasto `/`) che trova anche tutte le azioni dell'S&P 500 e quelle europee, tasti rapidi (`1`–`5` per le zone, frecce, spazio, `Esc`, `?`), guida, tema chiaro/scuro, colori per daltonici (**CVD**), avviso quando i dati sono in ritardo, stampa in bianco e nero, versione per smartphone che si installa come app.

I dati si aggiornano da soli dopo la chiusura di Wall Street (con due tentativi di recupero nella notte) tramite GitHub Actions. Si usano solo chiusure: se l'aggiornamento parte a borsa aperta, per esempio lanciato a mano nel pomeriggio, la seduta del giorno viene scartata.

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

### Aggiornare il sito con una versione nuova
**Add file** → **Upload files**, trascina tutti i file della cartella estratta dallo zip (sostituiscono i vecchi) → **Commit changes**. Il file dell'aggiornamento automatico (`.github/workflows/aggiorna-dati.yml`) non si carica così: se cambia, si apre su GitHub con la matita e si incolla il contenuto nuovo.

---

## I miei titoli

La lista sta nel file `miei-titoli.txt` del repository: su GitHub aprilo e premi la matita (o, dal sito, **Modifica la lista ↗** nella zona Portafoglio), scrivi un titolo per riga e premi **Commit changes**.

- Il ticker è quello di Yahoo Finance, seguito se vuoi dal nome: `MSFT Microsoft`, `ENEL.MI Enel`, `ASML.AS ASML`.
- Azioni americane senza suffisso (per le classi si usa il trattino: `BRK-B`); Milano `.MI`, Xetra `.DE`, Parigi `.PA`, Amsterdam `.AS`, Madrid `.MC`, Londra `.L` (prezzi in pence), Zurigo `.SW`.
- I prezzi arrivano con l'aggiornamento successivo; per averli subito: **Actions** → **Aggiorna dati** → **Run workflow**. I ticker che Yahoo non conosce sono elencati sotto la tabella.
- La forza relativa è la posizione nella rotazione settimanale: contro l'S&P 500 per le azioni americane, contro l'ACWI (azionario mondiale in euro, ETF IUSQ.DE) per le altre.
- Le azioni europee si aggiungono anche dalla zona Europa (pagina Azioni): nella scheda di un'azione il pulsante **Segui** copia la riga giusta e apre il file su GitHub.
- Il repository è pubblico: la lista la può vedere chiunque.

## Il portafoglio, protetto con password

Il portafoglio sta nel file `portafoglio.txt`, una riga per titolo: ticker, quantità, prezzo medio di carico e, se vuoi, la valuta del carico e la data del primo acquisto (`MSFT 10 395,20 EUR 2025-03-10`); la liquidità con `LIQUIDITA 2500` (o `LIQUIDITA USD 1000`). Il repository è pubblico, quindi il file **non si scrive mai in chiaro su GitHub**: lo prepara il sito, cifrato con la tua password.

1. Zona **Portafoglio** → **Crea il portafoglio protetto**: scrivi le righe al posto dell'esempio, scegli una password (almeno 8 caratteri) e premi **Prepara il file protetto**.
2. **Crea portafoglio.txt su GitHub ↗** apre il file nuovo già scritto: premi **Commit changes**. Dopo un minuto ricarica il sito.
3. Per cambiarlo: **Modifica il portafoglio** → cambia le righe → **Prepara il file protetto** → **Apri portafoglio.txt su GitHub ↗**: il testo è già copiato, su GitHub seleziona tutto (Ctrl+A), incolla (Ctrl+V) e **Commit changes**. Le azioni europee si aggiungono anche dalla zona Europa (pagina Azioni) con **Aggiungi al portafoglio**.

Come funziona la protezione: il testo si cifra nel browser (AES-GCM con chiave derivata dalla password, PBKDF2 con 210.000 passaggi); su GitHub arriva solo il blocco cifrato e la password non esce mai dal dispositivo. Il sito la chiede la prima volta su ogni dispositivo (con «Ricorda su questo dispositivo» resta salvata in quel browser). **Se la dimentichi il contenuto non si recupera**: tienila in un posto sicuro.

L'aggiornamento automatico non conosce la password, quindi non sa quali titoli ci sono nel portafoglio: i prezzi li prende da `miei-titoli.txt`, dalle azioni della zona Europa (già scaricate ogni notte) e dall'ACWI. Quando prepari il file, il sito elenca i ticker che mancano in `miei-titoli.txt` e te li fa copiare. La lista dei titoli seguiti resta pubblica, le quantità e i prezzi no.

Tutti i valori sono in euro, con i cambi dell'ultima chiusura; beta, volatilità e rischio sono misurati sull'ultimo anno con la composizione di oggi; l'andamento passato è una simulazione con le quantità di oggi. Numeri per capire, non consigli di investimento.

## Europa

La zona Europa segue le azioni dei 15 indici principali delle borse europee, circa 470 titoli, con lo STOXX Europe 600 come riferimento: FTSE MIB (Milano), DAX (Francoforte), CAC 40 (Parigi), IBEX 35 (Madrid), AEX (Amsterdam), SMI (Zurigo), FTSE 100 (Londra), OMX Copenhagen 25, OMX Stockholm 30, OMX Helsinki 25, OBX (Oslo), BEL 20 (Bruxelles), ATX (Vienna), PSI (Lisbona) e ISEQ (Dublino; per il livello dell'indice si usa l'ISEQ All Share, l'unico che Yahoo dà). L'elenco di partenza è `europa.json`; per i primi sette indici l'aggiornamento automatico lo confronta una volta alla settimana con le composizioni su Wikipedia e accetta da solo i piccoli cambi trimestrali (l'elenco aggiornato va in `data/europa_lista.json`); gli altri si aggiornano con le versioni nuove del sito. Una società quotata in due borse (Shell, Airbus, Nordea…) compare con tutti e due i ticker, ma nei totali conta una volta.

- **Monitor**: STOXX Europe 600 e la sua tendenza, **ampiezza** (quota delle azioni sopra la media 200 e 50), nuovi massimi e minimi a 52 settimane, indice e settore più forti, «Cosa dicono i numeri», andamento e ampiezza di tutta l'Europa, **gli indici** e **i settori** con ampiezza e forza relativa (rotazione settimanale). Clic su una riga per aprire quell'indice o quel settore.
- **Rotazione**: i settori europei (panieri a pesi uguali in euro) contro la media di tutte le azioni o lo STOXX 600, gli indici europei in euro, e gli universi di ETF in euro.
- **Bottom Map**: ogni indice (o settore) è un punto, con la distanza dal massimo delle ultime 52 settimane in orizzontale e la quota delle sue azioni sopra la media 200 in verticale, e la scia delle ultime settimane. Per l'Europa non ci sono livelli blu: le aree evidenziate sono solo riferimenti (meno del 20% delle azioni sopra la media, oltre il 20% sotto il massimo).
- **Settori e indici**: si sceglie un indice, un settore o tutti e due (per esempio i finanziari del DAX); andamento con le medie, ampiezza, forza relativa, le azioni più forti e più deboli, e l'elenco delle sue azioni.
- **Azioni**: ricerca fra tutte per nome, ticker, paese o settore (`novo`, `svezia`, `banche`), filtro per indice, settore e situazione (sopra o sotto la media 200, quadrante della forza relativa, nuovi massimi o minimi, i tuoi titoli); ordinamento per colonna. Clic su un'azione per la scheda con il grafico, la forza relativa contro il suo indice e i pulsanti **Segui** (la aggiunge a `miei-titoli.txt`) e **Aggiungi al portafoglio**.

I prezzi sono nella valuta di ogni borsa (pence per Londra, franchi per Zurigo, corone per Copenaghen, Stoccolma e Oslo); i confronti fra indici e i panieri dei settori sono in euro. Da due a tre anni di storia (dal 1° gennaio di due anni prima), prezzi non corretti per i dividendi.

## Crypto

La zona Crypto segue bitcoin e le prime 10 crypto per capitalizzazione. La classifica arriva ogni notte da CoinGecko, senza stablecoin (USDT, USDC…), token «impacchettati» o in staking e token legati ad altri beni; i prezzi sono quelli in dollari di Yahoo Finance, con la giornata che finisce a mezzanotte UTC (le 2 di notte italiane in estate).

- **Monitor**: le tessere di bitcoin e «Cosa dicono i numeri», le frasi con la situazione di oggi (tendenza, livelli di riferimento, punto del ciclo dell'halving, quante monete sono sopra la media 200, stagionalità del mese, Fear & Greed, legame con i mercati); poi **le prime per capitalizzazione**: tendenza, distanza dalla media 200 e da quanti giorni, calo dal massimo, forza contro bitcoin, volatilità e beta. Clic su una moneta per il grafico in scala logaritmica con le medie e il multiplo di Mayer (o il rapporto con bitcoin per le altcoin).
- **Rotazione**: la stessa rotazione relativa delle altre zone, con le monete contro bitcoin (o contro il paniere a pesi uguali delle prime 10), su settimane di sette giorni.
- **Bottom Map**: ogni moneta per distanza dal massimo degli ultimi 365 giorni e distanza del prezzo dalla media 200, con la scia; evidenziata l'area sotto 0,8 volte la media 200 (multiplo di Mayer), quella dei forti sconti dei minimi passati di bitcoin.
- **Analisi** (si sceglie la moneta): «Cosa è successo dopo» mette in tabella come è andato il prezzo 1, 3, 6 o 12 mesi dopo i giorni con la stessa situazione di oggi; la **regola della media 200** confronta lo stare investiti solo sopra la media con il restare sempre investiti; la **stagionalità** dà il rendimento di ogni mese di ogni anno; **il ciclo dell'halving** allinea i cicli di bitcoin dal giorno dell'halving.
- **Correlazioni**: quanto le monete si muovono insieme e il legame di bitcoin con Nasdaq, S&P 500, oro e dollaro nel tempo.

Le monete si aggiornano con l'aggiornamento della notte (dal lunedì al venerdì). Per averle **anche nel fine settimana** serve il secondo aggiornamento automatico, da creare una volta: **Add file** → **Create new file**, nome `.github/workflows/aggiorna-crypto.yml`, incolla il contenuto dell'omonimo file dello zip → **Commit changes**. Per provarlo subito: **Actions** → **Aggiorna crypto** → **Run workflow**.

Quante monete tenere, cosa escludere e i ticker di Yahoo che non seguono la forma `SIMBOLO-USD` si cambiano in `crypto.json`. Sono statistiche del passato su pochi cicli: aiutano a capire in che fase si è, non dicono cosa succederà.

## Sul telefono, come un'app

- **iPhone**: apri il sito con Safari → pulsante **Condividi** → **Aggiungi alla schermata Home**.
- **Android**: apri il sito con Chrome → menu **⋮** → **Installa app** (o **Aggiungi a schermata Home**).

Si apre a tutto schermo con la sua icona. Pagina, grafica e codice restano salvati nel telefono, quindi si apre subito e funziona anche senza rete, con gli ultimi dati scaricati. I dati invece arrivano sempre dalla rete: la prima apertura dopo l'aggiornamento notturno scarica qualche MB (la Home legge i prezzi di USA, Europa e crypto), le altre quasi niente. Quando carichi su GitHub una versione nuova del sito, in basso compare «C'è una versione nuova del sito · Ricarica».

## Avviso del mattino

Ogni aggiornamento scrive `data/stati.json`: lo stato di ogni settore, i cambi di stato delle ultime sedute, quanti titoli mancano al livello blu e quale seduta deve arrivare dopo. Un'attività programmata di Claude (**Radar Settori: avviso cambi di stato**, dal martedì al sabato alle 7:50) legge il file e ti scrive solo se un settore ha cambiato stato nella seduta del giorno prima o se i dati sono rimasti indietro; altrimenti risponde «nessuna novità». L'attività sta nel tuo account Claude, fra le attività programmate: da lì si cambia l'orario, si mette in pausa o si elimina.

---

## Parlare con Claude di quello che vedi

Con l'estensione **Claude in Chrome**, compresa negli abbonamenti a pagamento di Claude, si apre Claude in un pannello di fianco al sito e gli si chiede di quello che c'è sulla pagina. Non ci sono costi in più.

1. In Chrome sul computer apri il Chrome Web Store, cerca **Claude** (di Anthropic) e premi **Aggiungi a Chrome**; accedi con il tuo account Claude e fissa l'icona nella barra (pezzo di puzzle → puntina).
2. Apri Radar Settori e premi l'icona di Claude: si apre il pannello laterale. Chiedi per esempio «Com'è messo questo settore?» o «Spiegami questo grafico».
3. Claude legge il testo della pagina e può guardarla. Per dargli anche i numeri che nei grafici non si leggono (storico mese per mese, tutti i titoli, episodi, scie della rotazione) premi **Copia per Claude**, in alto a destra (o il tasto `C`), e incolla nel pannello con Ctrl+V. Lo stesso testo si può incollare in qualsiasi chat con Claude.

---

## Uso rapido

- **Barra in alto**: Home, USA, Europa, Crypto e Portafoglio; dentro una zona, la riga sotto porta alle sue pagine. Sul telefono il marchio a sinistra porta alla Home e il portafoglio è l'icona della valigetta.
- **Casella di ricerca** (`/`): il ticker di un ETF settoriale apre il settore; il ticker o il nome di qualsiasi azione dell'S&P 500 (`AAPL`, `coca cola`) apre il suo settore con il titolo in evidenza; le azioni europee (`ferrari`, `unicredit`, `ASML.AS`) aprono la loro scheda; un indice europeo (`DAX`, `FTSE MIB`) o un settore europeo (`Finanziari`) apre il suo andamento con le sue azioni; le crypto (`BTC`, `solana`) aprono il loro grafico; i titoli della tua lista (`ENEL.MI` o solo `ENEL`) aprono il loro grafico nel Portafoglio; gli ETF della rotazione e un termine di confronto (`SPY`, `QQQ`, `RSP`, `ACWI`, `PTF`) aprono la rotazione; `HOME` `USA` `EUROPA` `CRYPTO` `PORTAFOGLIO` aprono le zone, `MON` `ROT` `BTM` `SEC` la pagina della zona in cui sei, `ALRT` `AZIONI` `ANALISI` `CORR` le altre; `HELP` la guida; `CHIARO` `SCURO` `TEMA` il tema. Se un titolo non c'è, la casella propone di cercarlo su Yahoo Finance, per trovare il ticker da scrivere in `miei-titoli.txt`.
- **Indirizzi**: `#usa/monitor`, `#eur/mappa`, `#cry/analisi` per una pagina; `#usa/settori/XLK/AAPL` (o solo `#AAPL`) per un'azione americana; `#eur/settori/DAX` per un indice europeo; `#eur/azioni/ENEL.MI` per un'azione europea; `#cry/monitor/ETH` per una crypto; `#tit/ENEL.MI` per un titolo della tua lista. I vecchi indirizzi (`#mon`, `#XLU`, `#eur/ENEL.MI`…) funzionano ancora. Il pulsante Indietro funziona.
- **Tasti**: `1` Home, `2` USA, `3` Europa, `4` Crypto, `5` Portafoglio · `←` `→` periodo (settore USA) o data (Rotazione), o zona e pagina vicina se il cursore è sulla barra · `Spazio` animazione · `Esc` toglie l'evidenza, chiude la scheda o la finestra aperta · `C` copia i dati della pagina per Claude · `?` guida. I tasti rapidi si disattivano dalla guida.
- Livello blu, pesi del portafoglio di riferimento, universi della rotazione, filtri e tema scelti restano solo nel browser di chi li cambia.

## Domande frequenti

**Nella scheda Actions c'è una X rossa.** Di solito Yahoo Finance ha limitato i download per un po'. Il sito continua a mostrare i dati precedenti; i passaggi di recupero della notte o un *Run workflow* manuale sistemano.

**Voglio cambiare il livello blu di un settore per tutti.** Nella pagina del settore (USA → Settori) premi **Copia configurazione**, apri `settings.json` su GitHub (icona della matita), sostituisci la riga `"soglie"` e lancia *Aggiorna dati*.

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

Tre modi, scelti nella pagina (dove sono anche spiegati):
- **Nuovo** (predefinito): logaritmo del rapporto prezzo/confronto; differenza tra le medie esponenziali a 10 e 30 barre, divisa per la volatilità del rapporto (media esponenziale dei quadrati delle variazioni, emivita 26 barre) e per √10 → X. RS-Ratio = 100 + 2,5·X; RS-Momentum = 100 + 2,5·√8·(X − media esponenziale a 8 barre di X).
- **Medie semplici**: RS-Ratio = 100 × media 10 / media 30 del rapporto; RS-Momentum = 100 × RS-Ratio / media 9 di RS-Ratio.
- **Classico**: scarti standardizzati su 26 barre della media 10 del rapporto e della variazione a 4 barre di RS-Ratio.

«Relative Rotation Graphs» è un marchio di RRG Research: qui c'è un calcolo indipendente con la stessa idea.

## File del progetto

Tutti i file stanno nella cartella principale del repository (solo l'aggiornamento automatico è in `.github/workflows/`).

| File | Contenuto |
|---|---|
| `build_data.py` | ampiezza dei settori e dell'intero indice, ETF settoriali, fotografia dei titoli, elenco di tutte le azioni per la ricerca → `data/meta.json`, `data/indice.json`, `data/settori/*.json`, `data/titoli.json`; alla fine lancia `stati.js` |
| `stati.js` | riepilogo degli stati con le regole del sito, per l'avviso del mattino → `data/stati.json` (si prova con `node stati.js`) |
| `orari.py` | orari delle borse: la seduta di oggi si pubblica solo quando la borsa ha chiuso |
| `build_prices.py` | prezzi per la rotazione → `data/prezzi_usa.json`, `data/prezzi_globali.json` (calendario a maggioranza, bitcoin, cambi, correzione di prezzi anomali, controlli di qualità); prezzi della tua lista e del portafoglio (se non è protetto), con tipo, settore, paese e cambi → `data/prezzi_miei.json`; alla fine lancia anche Europa e Crypto |
| `miei-titoli.txt` | la lista di «I miei titoli» |
| `portafoglio.txt` | il portafoglio, cifrato con la tua password (lo crea il sito: non è nello zip) |
| `portafoglio-calcoli.js`, `view-portafoglio.js` | calcoli del portafoglio (valore in euro, beta, volatilità, contributi al rischio, cifratura), la sua parte della zona Portafoglio e il riepilogo per la Home |
| `build_europa.py`, `europa.json`, `europa_settori.py` | dati della zona Europa → `data/prezzi_europa.json` e `data/europa_lista.json` (composizioni controllate su Wikipedia una volta alla settimana, prezzi Yahoo); elenco di partenza dei titoli; settori in italiano |
| `europa-calcoli.js`, `view-europa.js` | calcoli (ampiezza, panieri dei settori, forza relativa, nuovi massimi e minimi) e le pagine della zona Europa |
| `build_crypto.py`, `crypto.json` | dati della zona Crypto → `data/prezzi_crypto.json` (classifica CoinGecko, prezzi Yahoo, mercati, Fear & Greed di alternative.me); impostazioni delle monete |
| `.github/workflows/aggiorna-crypto.yml` | aggiornamento delle crypto ogni giorno, weekend compreso |
| `requirements.txt` | librerie Python usate dall'aggiornamento |
| `.github/workflows/aggiorna-dati.yml` | aggiornamento automatico |
| `settings.json` | settori, livelli blu, parametri degli stati |
| `universi.json` | universi, termini di confronto, portafoglio di riferimento |
| `signals.js` | macchina a stati ed episodi |
| `rrg.js`, `portafoglio.js`, `calendario.js` | rotazione, portafoglio, calendari NYSE e Borsa Italiana |
| `view-*.js`, `app.js`, `core.js`, `chart.js`, `mappa.js`, `style.css`, `viste.css` | la Home e le pagine delle zone (`view-home.js` è la Home), la struttura dell'app (zone, pagine, indirizzi), i grafici e la grafica |
| `crypto-calcoli.js` | i calcoli della zona Crypto (medie, tendenza, cicli, stagionalità, correlazioni, regola della media 200) |
| `manifest.webmanifest`, `sw.js`, `icona-*.png`, `apple-touch-icon.png` | l'app sul telefono: nome e icone, copia del sito per aprirlo subito e senza rete |
| `copia-dati.js` | il pulsante «Copia per Claude» (il testo di ogni pagina lo preparano i suoi file `view-*.js`) |
| `test_*.py`, `*.test.js` | test con dati simulati: `python -m pytest` · `node --test signals.test.js motori.test.js crypto.test.js portafoglio.test.js europa.test.js` |
| `data/` | creata dall'aggiornamento automatico, non va caricata a mano |

Fonti: prezzi Yahoo Finance; composizione dell'S&P 500 da Wikipedia e dai dataset pubblici *datasets/s-and-p-500-companies* e *fja05680/sp500*; composizione degli indici europei da Wikipedia. Yahoo non ha i prezzi delle società uscite dal listino, quindi lo storico dei primi anni ne è privo (un po' di distorsione a favore dei "sopravvissuti").
