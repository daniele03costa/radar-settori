/*
 * Radar Settori — funzioni comuni: memoria locale, formattazione, dati, livelli blu, analisi.
 */
(function () {
  "use strict";

  const R = (window.Radar = window.Radar || {});
  R.viste = {};

  // ---------- memoria locale (solo comodità del singolo browser) ----------
  R.store = {
    get(k, def) { try { const v = localStorage.getItem("radar." + k); return v == null ? def : JSON.parse(v); } catch (e) { return def; } },
    set(k, v) { try { localStorage.setItem("radar." + k, JSON.stringify(v)); } catch (e) { /* ignora */ } },
  };

  // ---------- eventi ----------
  const ascoltatori = {};
  R.on = (nome, fn) => { (ascoltatori[nome] = ascoltatori[nome] || []).push(fn); };
  R.emit = (nome, dati) => { (ascoltatori[nome] || []).forEach(fn => { try { fn(dati); } catch (e) { console.error(e); } }); };

  // ---------- formattazione italiana ----------
  const NF = {};
  const nf = d => (NF[d] = NF[d] || new Intl.NumberFormat("it-IT", { minimumFractionDigits: d, maximumFractionDigits: d }));
  R.num = function (v, d = 1) {
    if (v == null || !isFinite(v)) return "—";
    if (Math.abs(v) < 0.5 * Math.pow(10, -d)) v = 0;
    return nf(d).format(v).replace("-", "−");
  };
  R.pct = function (v, d = 1, segno = true) {
    if (v == null || !isFinite(v)) return "—";
    const r = Math.abs(v) < 0.5 * Math.pow(10, -d) ? 0 : v;
    return (segno && r > 0 ? "+" : "") + R.num(r, d) + "%";
  };
  R.segnato = (v, d = 1) => (v == null || !isFinite(v) ? "—" : (v > 0.5 * Math.pow(10, -d) ? "+" : "") + R.num(v, d));
  R.cls = v => (v == null ? "" : v > 0.05 ? "pos" : v < -0.05 ? "neg" : "");
  R.dataIt = s => { if (!s) return "—"; const [y, m, d] = s.split("-"); return `${d}/${m}/${y}`; };
  R.dataBreve = s => { if (!s) return "—"; const [y, m, d] = s.split("-"); return `${d}/${m}/${y.slice(2)}`; };
  R.esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  R.$ = (sel, el = document) => el.querySelector(sel);
  R.$$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
  R.css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  R.sedute = k => `${k} ${k === 1 ? "seduta" : "sedute"}`;
  // preposizione articolata davanti a un numero: «al 5%» ma «all'8%», «dell'11%», «l'80°»
  const ELISIONI = { il: "l'", al: "all'", del: "dell'", dal: "dall'", sul: "sull'", nel: "nell'" };
  R.art = (prep, testo) => {
    const t = String(testo);
    const vocale = /^(8|11(?!\d)|1(?!\d))/.test(t.replace(/<[^>]*>/g, "").trim());
    return (vocale ? ELISIONI[prep] : prep + " ") + t;
  };

  // ---------- SVG ----------
  const NS = "http://www.w3.org/2000/svg";
  R.svg = function (tag, attrs, figli) {
    const el = document.createElementNS(NS, tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v);
    if (figli) for (const f of [].concat(figli)) if (f != null) el.append(f.nodeType ? f : document.createTextNode(String(f)));
    return el;
  };

  // ---------- dati ----------
  const cache = new Map();
  function carica(url, opzioni) {
    if (cache.has(url)) return cache.get(url);
    const p = fetch(url, opzioni).then(r => { if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`); return r.json(); });
    cache.set(url, p);
    p.catch(() => cache.delete(url));
    return p;
  }
  const versione = () => encodeURIComponent((R.meta && (R.meta.generato || R.meta.aggiornato)) || "");

  R.dati = {
    meta: () => carica("data/meta.json", { cache: "no-store" }),
    settore: etf => carica(`data/settori/${etf}.json?v=${versione()}`),
    tuttiSettori: () => Promise.all(R.meta.settori.map(s => R.dati.settore(s.etf).then(d => [s.etf, d]))).then(Object.fromEntries),
    indice: () => carica(`data/indice.json?v=${versione()}`),
    // gli stati dei settori calcolati ogni notte con i livelli predefiniti (per la Home)
    stati: () => carica(`data/stati.json?v=${versione()}`),
    universi: () => carica("universi.json", { cache: "no-cache" }),
    // elenco di tutti i titoli dell'S&P 500 con il loro settore (dal file dedicato, o dai file dei settori)
    titoli: () => carica(`data/titoli.json?v=${versione()}`)
      .then(x => x.titoli)
      .catch(() => R.dati.tuttiSettori().then(tutti => Object.entries(tutti).flatMap(([etf, d]) =>
        (d.titoli || []).map(t => ({ t: t.t, nome: t.nome, etf }))))),
    prezzi: mercato => carica(mercato === "globale" ? "data/prezzi_globali.json" : "data/prezzi_usa.json", { cache: "no-cache" }),
    // i titoli della lista personale (miei-titoli.txt), con i due termini di confronto
    miei: () => carica("data/prezzi_miei.json", { cache: "no-cache" }),
    // bitcoin e le prime crypto, caricate quando servono (Home e zona Crypto)
    crypto: () => carica("data/prezzi_crypto.json", { cache: "no-cache" }),
    // azioni europee: l'elenco aggiornato dall'aggiornamento automatico, altrimenti quello di base
    europaLista: () => carica("data/europa_lista.json", { cache: "no-cache" }).catch(() => carica("europa.json", { cache: "no-cache" })),
    europa: () => carica("data/prezzi_europa.json", { cache: "no-cache" }),
    // ampiezza storica di settori e indici europei (stessa forma dei settori USA): vedi R.mercati.eur
    europaStati: () => R.mercati.eur.stati(),
    // prezzi degli ultimi anni delle azioni di Asia ed Emergenti, e i loro elenchi
    prezziZona: zona => (zona === "eur" ? R.dati.europa() : carica(`data/prezzi_${zona === "asi" ? "asia" : "emergenti"}.json`, { cache: "no-cache" })),
    listaZona: zona => (zona === "eur" ? R.dati.europaLista() : carica(zona === "asi" ? "asia.json" : "emergenti.json", { cache: "no-cache" })),
    // tassi, dollaro, materie prime e VIX (build_macro.py)
    macro: () => carica("data/macro.json", { cache: "no-cache" }),
    // la lista personale così com'è nel file, anche i titoli che non hanno ancora i prezzi
    listaMiei: () => fetch("miei-titoli.txt", { cache: "no-cache" }).then(r => (r.ok ? r.text() : "")).then(R.leggiListaMiei).catch(() => []),
  };

  // miei-titoli.txt: un ticker per riga, poi il nome; le righe con # non contano
  R.leggiListaMiei = testo => {
    const visti = new Set(), out = [];
    for (const riga of String(testo || "").split(/\r?\n/)) {
      const pulita = riga.replace(/#.*$/, "").trim();
      if (!pulita) continue;
      const [t, ...nome] = pulita.split(/\s+/);
      const tk = t.toUpperCase().replace(/,/g, "");
      if (!tk || visti.has(tk)) continue;
      visti.add(tk);
      out.push({ t: tk, nome: nome.join(" ") });
    }
    return out;
  };

  // indirizzi di GitHub per un file del repository (il sito è su utente.github.io/repository, ramo main)
  R.github = file => {
    const h = location.hostname;
    if (h.endsWith(".github.io")) {
      const utente = h.split(".")[0], repo = location.pathname.split("/")[1];
      if (repo) {
        const base = `https://github.com/${utente}/${repo}`;
        return {
          modifica: `${base}/edit/main/${file}`,
          // file nuovo con il contenuto già scritto (GitHub accetta filename e value nell'indirizzo)
          crea: valore => `${base}/new/main?filename=${encodeURIComponent(file)}&value=${encodeURIComponent(valore || "")}`,
        };
      }
    }
    return { modifica: file, crea: () => file };
  };

  // finestra sopra la pagina: si chiude con ×, con un clic fuori o con Esc (in app.js)
  R.finestra = function (html) {
    let m = document.getElementById("finestra");
    if (!m) {
      m = document.createElement("div");
      m.id = "finestra";
      m.className = "modal";
      m.setAttribute("role", "dialog");
      m.setAttribute("aria-modal", "true");
      document.body.append(m);
      m.addEventListener("click", e => { if (e.target === m || e.target.closest("[data-chiudi]")) m.hidden = true; });
    }
    m.innerHTML = `<div class="modal-box pf-modal">${html}</div>`;
    m.hidden = false;
    m.scrollTop = 0;
    setTimeout(() => { const f = m.querySelector("[autofocus]") || m.querySelector("[data-chiudi]"); if (f) f.focus(); }, 30);
    return m;
  };

  // copia negli appunti; se il browser non lo permette seleziona il testo da copiare a mano
  R.copia = async (testo, bottone, campo) => {
    let ok = false;
    try { await navigator.clipboard.writeText(testo); ok = true; }
    catch (e) {
      if (campo) { campo.focus(); campo.select(); try { ok = document.execCommand("copy"); } catch (e2) { ok = false; } }
    }
    if (bottone) {
      const prima = bottone.dataset.testo || bottone.textContent;
      bottone.dataset.testo = prima;
      bottone.textContent = ok ? "Copiato ✓" : "Selezionato: copia con Ctrl+C";
      setTimeout(() => { bottone.textContent = prima; }, 2500);
    }
    return ok;
  };

  // ---------- livelli blu e analisi ----------
  // la voce di un gruppo (settore USA, settore o indice europeo) nel suo meta.json
  R.metaDi = id => {
    const usa = R.meta && R.meta.settori.find(s => s.etf === id);
    if (usa) return usa;
    for (const m of Object.values(R.metaZone || {})) { const x = m && m.settori.find(s => s.etf === id); if (x) return x; }
    return null;
  };
  R.livelliLocali = R.store.get("soglie", {});
  R.livello = etf => {
    if (R.livelliLocali[etf] != null) return R.livelliLocali[etf];
    const m = R.metaDi(etf);
    return m ? m.soglia_default : 10;
  };
  R.livelloDefault = etf => {
    const m = R.metaDi(etf);
    return m ? m.soglia_default : 10;
  };
  R.impostaLivello = (etf, v) => {
    v = Math.max(1, Math.min(60, Math.round(v)));
    if (v === R.livelloDefault(etf)) delete R.livelliLocali[etf]; else R.livelliLocali[etf] = v;
    R.store.set("soglie", R.livelliLocali);
    R.emit("livelli", etf);
  };
  R.ripristinaLivello = etf => { delete R.livelliLocali[etf]; R.store.set("soglie", R.livelliLocali); R.emit("livelli", etf); };
  R.parametri = () => Object.assign({}, window.Signals.PARAMETRI, (R.meta && R.meta.parametri) || {});

  // l'ampiezza contata in titoli: quanti sono sopra la media 200, quanti al massimo possono esserlo
  // perché il settore sia al livello blu (soglia) e quanti devono ancora scendere (mancano)
  R.titoliLivello = (b200, n, lv) => {
    if (b200 == null || !n) return null;
    const sopra = Math.round((b200 / 100) * n);
    const pct1 = k => Math.round((k / n) * 1000) / 10;           // come l'ampiezza salvata nei dati
    let soglia = Math.max(0, Math.floor((lv / 100) * n + 1e-9));
    while (soglia + 1 <= n && pct1(soglia + 1) <= lv) soglia++;
    while (soglia > 0 && pct1(soglia) > lv) soglia--;
    return { sopra, n, soglia, mancano: Math.max(0, sopra - soglia) };
  };
  R.titoli = k => `${k} ${k === 1 ? "titolo" : "titoli"}`;

  const analisi = new Map();
  R.analisiSync = (etf, d) => {
    const lv = R.livello(etf);
    const k = etf + "|" + lv;
    if (!analisi.has(k)) analisi.set(k, window.Signals.analizza(d, lv, (R.meta && R.meta.parametri) || {}));
    return analisi.get(k);
  };
  R.analisi = etf => R.dati.settore(etf).then(d => R.analisiSync(etf, d));

  // ---------- i due mercati con ampiezza e stati: USA (settori dell'S&P 500) ed Europa (settori e indici) ----------
  // Monitor, Bottom Map, Settori e Alert sono le stesse pagine per tutti e due: cambia solo da dove arrivano i dati
  // e come si chiamano le cose.
  // le zone con settori e indici (Europa, Asia, Emergenti): stessi file, in cartelle diverse
  const ZONE_GRUPPI = {
    eur: { nome: "Europa", cartella: "data/europa", cal: "milano", file: "europa.json", agg: "europee", aggM: "europei", aggS: "europeo", ilNome: "l'Europa",
      bench: "STOXX 600", benchLungo: "lo STOXX 600", azioni: "circa 470", indici: 15, store: "Eu", aggiornamento: "Aggiorna dati" },
    asi: { nome: "Asia", cartella: "data/asia", cal: "feriale", file: "asia.json", agg: "asiatiche", aggM: "asiatici", aggS: "asiatico", ilNome: "l'Asia",
      bench: null, benchLungo: null, azioni: "circa 1.040", indici: 9, store: "Asi", aggiornamento: "Aggiorna Asia ed emergenti" },
    emg: { nome: "Emergenti", cartella: "data/emergenti", cal: "feriale", file: "emergenti.json", agg: "dei paesi emergenti", aggM: "dei paesi emergenti", aggS: "dei paesi emergenti", ilNome: "i paesi emergenti",
      bench: "EEM", benchLungo: "l'MSCI Emerging Markets (ETF EEM)", azioni: "circa 250", indici: 7, store: "Emg", aggiornamento: "Aggiorna Asia ed emergenti" },
  };
  R.ZONE_GRUPPI = ZONE_GRUPPI;
  // simboli e nomi delle valute delle azioni (prezzi nella valuta di ogni borsa)
  R.SIMBOLI_VALUTA = { EUR: "€", GBp: "p", CHF: "CHF", DKK: "kr", SEK: "kr", NOK: "kr", USD: "$", JPY: "¥", HKD: "HK$", CNY: "CN¥", KRW: "₩",
    TWD: "NT$", INR: "₹", IDR: "Rp", THB: "฿", MYR: "RM", BRL: "R$", MXN: "MX$", ARS: "AR$", CLP: "CLP", ZAc: "c", ZAR: "R", TRY: "₺", PLN: "zł" };
  R.NOMI_VALUTA = { EUR: "euro", GBp: "pence di sterlina", CHF: "franchi svizzeri", DKK: "corone danesi", SEK: "corone svedesi", NOK: "corone norvegesi",
    USD: "dollari", JPY: "yen", HKD: "dollari di Hong Kong", CNY: "yuan", KRW: "won", TWD: "dollari taiwanesi", INR: "rupie indiane", IDR: "rupie indonesiane",
    THB: "baht", MYR: "ringgit", BRL: "real", MXN: "pesos messicani", ARS: "pesos argentini", CLP: "pesos cileni", ZAc: "cent di rand", ZAR: "rand",
    TRY: "lire turche", PLN: "złoty" };
  R.metaZone = {};

  function mercatoGruppi(zona) {
    const c = ZONE_GRUPPI[zona];
    let caricamento = null;
    const v = () => encodeURIComponent((R.metaZone[zona] && (R.metaZone[zona].generato || R.metaZone[zona].aggiornato)) || "");
    const indice = () => carica(`${c.cartella}/indice.json?v=${v()}`);
    const gruppo = id => Promise.all([carica(`${c.cartella}/settori/${id}.json?v=${v()}`), indice()])
      .then(([d, i]) => { if (!d.date && d.b200.length === i.date.length) d.date = i.date; return window.Signals.completa(d); });
    const M = {
      zona, nome: c.nome, cal: c.cal, cartella: c.cartella, file: c.file, store: c.store, misto: true,
      // il riepilogo dei gruppi arriva solo quando si entra nella zona (o la Home lo chiede)
      pronto: () => {
        if (R.metaZone[zona]) return Promise.resolve(R.metaZone[zona]);
        if (!caricamento) caricamento = carica(`${c.cartella}/meta.json`, { cache: "no-cache" }).then(m => {
          R.metaZone[zona] = m;
          if (zona === "eur") R.metaEu = m;
          R.emit("prezzi", { mercato: "ampiezza-" + zona, aggiornato: m.aggiornato });
          return m;
        }).catch(e => { caricamento = null; throw e; });
        return caricamento;
      },
      meta: () => R.metaZone[zona] || null,
      settore: gruppo,
      tutti: () => Promise.all(R.metaZone[zona].settori.map(s => gruppo(s.etf).then(d => [s.etf, d]))).then(Object.fromEntries),
      indice,
      stati: () => carica(`${c.cartella}/stati.json?v=${v()}`),
      cod: s => s.codice || s.etf,
      sotto: s => (s.tipo === "indice" ? (s.codice !== s.nome ? `${s.nome} · ${s.paese}` : `indice · ${s.paese}`)
        : s.codice !== s.nome ? `settore · ${s.nome.toLowerCase()}` : `settore ${c.aggS}`),
      link: id => `#${zona}/settori/${id}`,
      linkTitolo: (id, t) => `#${zona}/azioni/${t}`,
      tipi: [["settore", `Settori ${c.aggM}`], ["indice", "Indici"]],
      t: {
        gruppo: "gruppo", gruppi: "settori e indici", Gruppo: "Settore o indice", Gruppi: "Settori e indici", unGruppo: "un settore o un indice", delGruppo: "del gruppo",
        nGruppi: n => `${n} settori e indici`, tutti: "tutti i settori e gli indici", tuttiI: "tutti i settori e gli indici",
        regione: c.nome, ilNome: c.ilNome, agg: c.agg, aggM: c.aggM, aggS: c.aggS, file: c.file, aggiornamento: c.aggiornamento,
        indice: c.nome, indiceIntero: `Tutte le azioni ${c.agg} del sito`, indiceKpi: `${c.nome}, azioni sopra la media 200`,
        bench: c.bench, rotazione: "Rotazione relativa",
        rotazioneTesto: c.bench ? `Rotazione (settori contro la media delle azioni ${c.agg}, indici contro ${c.benchLungo}, in euro)` : `Rotazione (settori e indici contro la media delle azioni ${c.agg}, in euro)`,
        prezzo: "prezzo", prezzoDel: "del prezzo", ilPrezzo: "il prezzo", azioni: `azioni ${c.agg}`, inIndice: `fra le azioni ${c.agg}`,
        dal: "dal 2005", rendimenti: "I rendimenti sono del livello dell'indice (in valuta locale, di solito senza dividendi) o, per i settori, di un paniere a pesi uguali delle sue azioni in euro (dividendi inclusi).",
        manca: `I dati dell'ampiezza di questa zona non ci sono ancora: arrivano con il prossimo aggiornamento automatico (${c.aggiornamento}).`,
      },
    };
    return M;
  }

  // ---------- i mercati con ampiezza e stati: USA (settori dell'S&P 500), Europa, Asia ed Emergenti (settori e indici) ----------
  // Monitor, Bottom Map, Settori e Alert sono le stesse pagine per tutti: cambia solo da dove arrivano i dati
  // e come si chiamano le cose.
  R.mercati = {
    usa: {
      zona: "usa", nome: "USA", cal: "nyse", misto: false,
      pronto: () => Promise.resolve(R.meta),
      meta: () => R.meta,
      settore: id => R.dati.settore(id),
      tutti: () => R.dati.tuttiSettori(),
      indice: () => R.dati.indice(),
      cod: s => s.etf,
      sotto: s => s.nome,
      link: id => "#usa/settori/" + id,
      linkTitolo: (id, t) => `#usa/settori/${id}/${t}`,
      tipi: null,
      t: {
        gruppo: "settore", gruppi: "settori", Gruppo: "Settore", Gruppi: "Settori", unGruppo: "un settore", delGruppo: "del settore",
        nGruppi: n => `${n} settori`, tutti: "tutti gli 11 settori", tuttiI: "tutti i settori",
        indice: "S&P 500", indiceIntero: "S&P 500 intero", indiceKpi: "S&P 500, titoli sopra la media 200",
        bench: "SPY", rotazione: "Rotazione vs SPY", rotazioneTesto: "Rotazione contro SPY", prezzo: "ETF", prezzoDel: "dell'ETF", ilPrezzo: "l'ETF", azioni: "azioni dell'S&P 500", inIndice: "nell'S&P 500",
        dal: "dal 2005", rendimenti: "I rendimenti sono dell'ETF, dividendi inclusi.", regione: "USA", manca: "Dati non disponibili.",
      },
    },
    eur: mercatoGruppi("eur"),
    asi: mercatoGruppi("asi"),
    emg: mercatoGruppi("emg"),
  };
  R.mercato = zona => R.mercati[ZONE_GRUPPI[zona] ? zona : "usa"];
  // il mercato a cui appartiene un gruppo
  R.mercatoDi = id => {
    if (R.meta && R.meta.settori.some(s => s.etf === id)) return R.mercati.usa;
    for (const z of Object.keys(ZONE_GRUPPI)) { const m = R.metaZone[z]; if (m && m.settori.some(s => s.etf === id)) return R.mercati[z]; }
    return R.mercati.eur;
  };
  // nome breve di un gruppo per le frasi: «XLE» negli USA, «Energia» o «DAX» in Europa
  R.codice = id => { const s = R.metaDi(id); return s ? (s.codice || s.etf) : id; };

  // testi delle pagine che cambiano fra USA e le altre zone: l'elemento con data-eur ha il testo delle zone con
  // settori e indici ({europei} diventa «europei», «asiatici»…), quello scritto nella pagina è per gli USA;
  // data-solo="eur" si vede nelle zone con settori e indici, data-solo="usa" solo negli USA
  R.testiZona = (box, zona) => {
    const M = R.mercato(zona);
    R.$$("[data-eur]", box).forEach(el => {
      if (el.dataset.usa == null) el.dataset.usa = el.innerHTML;
      el.innerHTML = M.misto ? el.dataset.eur.replace(/\{europei\}/g, M.t.aggM).replace(/\{europee\}/g, M.t.agg) : el.dataset.usa;
    });
    R.$$("[data-solo]", box).forEach(el => { el.hidden = el.dataset.solo === "usa" ? M.misto : !M.misto; });
  };

  // quadrante settimanale di ogni gruppo contro il termine di confronto: SPY negli USA; in Europa, come nella
  // Rotazione, i settori contro la media a pesi uguali delle azioni europee e gli indici contro lo STOXX 600, in euro
  R.rotazioneGruppi = async function (M, tutti) {
    const Rot = window.Rotazione, Cal = window.Calendario;
    const out = {};
    try {
      let date, benchDi, serie;
      if (M.misto) {
        const ind = await M.indice();
        date = ind.date;
        const conf = ind.close_eur || ind.close;
        benchDi = s => (s.tipo === "indice" && conf ? conf : ind.paniere);
        // un indice in valuta locale senza la serie in euro (cambio mancante) non si confronta: con l'inflazione
        // del peso argentino, per esempio, sembrerebbe sempre «Leader»
        serie = id => { const d = tutti[id] || {}; return d.close_eur || (!d.valuta || d.valuta === "EUR" ? d.close : null); };
      } else {
        const px = await R.dati.prezzi("usa");
        date = px.date; benchDi = () => px.serie.SPY; serie = id => px.serie[id];
      }
      const b = Rot.barre(date.slice(-800), "settimanali", d => Cal.successiva(d, M.cal));
      const off = date.length - Math.min(date.length, 800);
      b.indici = b.indici.map(i => i + off);
      for (const s of M.meta().settori) {
        const sr = serie(s.etf), bench = benchDi(s);
        if (!sr || !bench) continue;
        const pb = b.indici.map(i => bench[i]);
        const p = b.indici.map(i => sr[i]);
        const r = Rot.calcola(p, pb, "nuova");
        out[s.etf] = Rot.misure(r.ratio, r.mom, p.length - 1);
        if (out[s.etf]) out[s.etf].provvisoria = b.provvisoria;
      }
    } catch (e) { /* senza rotazione */ }
    return out;
  };

  // ---------- colori ----------
  R.colori = () => ({
    price: R.css("--price"), priceArea: R.css("--price-area"), ma: R.css("--ma"), dd: R.css("--dd"), ddArea: R.css("--dd-area"),
    b200: R.css("--b200"), b200Area: R.css("--b200-area"), b50: R.css("--b50"), soglia: R.css("--soglia"),
    segnale: R.css("--segnale"), fallito: R.css("--fallito"), muted: R.css("--muted"), line: R.css("--line"),
    ink: R.css("--ink"), surface: R.css("--surface"),
  });
  // la media 50 nei grafici (prezzo con le medie, % di titoli sopra la media 50): una sola scelta per tutto il sito,
  // salvata in questo browser; ogni grafico ha il suo interruttore «Media 50» e tutti si aggiornano insieme
  R.media50 = () => R.store.get("media50", true) !== false;
  R.impostaMedia50 = v => {
    R.store.set("media50", !!v);
    document.querySelectorAll("input[data-media50]").forEach(el => { el.checked = !!v; });
    R.emit("media50", !!v);
  };
  R.interruttore50 = () => `<label class="switch" title="Mostra o nascondi la media 50 in tutti i grafici"><input type="checkbox" data-media50${R.media50() ? " checked" : ""}><span class="track"><i></i></span>Media 50</label>`;
  document.addEventListener("change", e => { if (e.target && e.target.matches && e.target.matches("input[data-media50]")) R.impostaMedia50(e.target.checked); });
  document.querySelectorAll("input[data-media50]").forEach(el => { el.checked = R.media50(); });

  R.coloreQuadrante = q => R.css("--q-" + (q || "none")) || R.css("--muted");

  // nomi brevi delle conferme del trigger, per le tabelle
  R.MOTIVI_BREVI = { spinta20: "spinta a 20", spinta50: "spinta a 50", prezzo: "prezzo in ripresa", divergenza: "divergenza", rimbalzoV: "rimbalzo a V" };
  R.tagMotivi = motivi => (motivi || []).map(m => `<span class="tag" title="${R.esc(window.Signals.MOTIVI[m] || m)}">${R.MOTIVI_BREVI[m] || m}</span>`).join("");

  // ordine degli stati nel Monitor (prima i più "caldi")
  R.ORDINE_STATI = { fallito: 0, trigger: 1, blu: 2, attenzione: 3, cooldown: 4, normale: 5 };

  // ---------- spiegazione delle regole (pagine Settori e Alert degli USA) ----------
  R.htmlRegole = function (conParametri, M) {
    const P = R.parametri();
    const eu = !!(M && M.misto);
    const Z = eu ? ZONE_GRUPPI[M.zona] : null;
    const ampiezza = eu
      ? `È la quota di azioni del settore o dell'indice (fra le ${Z.azioni} ${Z.agg} del sito) che chiudono sopra la propria media a 200 sedute (e, come riferimento, a 50 e a 20).
            Le chiusure sono rettificate per split e dividendi. Per gli anni passati si usano i titoli di oggi: mancano le società uscite dagli indici o sparite, quindi l'ampiezza dei primi anni è un po' più alta del vero.`
      : `È la quota di titoli dell'S&amp;P 500 del settore che chiudono sopra la propria media a 200 sedute (e, come riferimento, a 50 e a 20).
            Le chiusure sono corrette per gli split ma non per i dividendi; per gli anni passati si usano i titoli che erano nell'indice allora.`;
    const prezzo = eu ? "il prezzo del gruppo (il livello dell'indice o, per un settore, un paniere a pesi uguali delle sue azioni in euro)" : "l'ETF";
    const delGruppo = eu ? "del gruppo" : "del settore";
    const righe = conParametri ? `
      <details class="param">
        <summary>Parametri in uso</summary>
        <table class="tbl param-tbl"><tbody>
          <tr><td>Fascia di attenzione sopra il livello blu</td><td>${P.fasciaAttenzione} punti</td></tr>
          <tr><td>Drawdown per l'attenzione / per la zona blu</td><td>oltre ${R.art("il", P.ddAttenzione + "°")} / ${R.art("il", P.ddIngresso + "°")} percentile</td></tr>
          <tr><td>Chiusure al livello o sotto per entrare</td><td>${P.chiusureIngresso}</td></tr>
          <tr><td>Recupero minimo per il trigger</td><td>max(${P.recuperoPunti} punti, ${P.recuperoTitoli} titoli) sul livello; ${P.recuperoTitoli} titoli sul minimo</td></tr>
          <tr><td>Spinta sulla media 20 / sulla media 50</td><td>≤${P.spinta20.da}% → ≥${P.spinta20.a}% in ${P.spinta20.sedute} sedute / ≤${P.spinta50.da}% → ≥${P.spinta50.a}% in ${P.spinta50.sedute}</td></tr>
          <tr><td>Zona lunga (2 conferme)</td><td>oltre ${P.zonaLunga} sedute</td></tr>
          <tr><td>Verifica del trigger</td><td>${P.verifica} sedute, soglia = minimo − variazione media di ${P.escursione} sedute</td></tr>
          <tr><td>Cooldown</td><td>${P.cooldown} sedute</td></tr>
          <tr><td>Riarmo</td><td>max(${P.riarmoMinimo}%, livello blu + ${P.riarmoSopra})</td></tr>
        </tbody></table>
      </details>` : "";
    return `
      <div class="card-title"><h2>Come funzionano gli stati</h2></div>
      <div class="notes-grid">
        <div>
          <h3><i class="dot" style="background:var(--b200)"></i>Ampiezza</h3>
          <p>${ampiezza}</p>
          <h3 class="gap"><i class="dot" style="background:var(--st-attenzione)"></i>Attenzione</h3>
          <p>L'ampiezza è a non più di ${P.fasciaAttenzione} punti sopra il livello blu, oppure il drawdown è più profondo di ${P.ddAttenzione} sedute su 100 della storia ${delGruppo}.</p>
        </div>
        <div>
          <h3><i class="dot" style="background:var(--st-blu)"></i>Zona blu</h3>
          <p>Si entra con ${P.chiusureIngresso} chiusure consecutive con l'ampiezza al livello blu o più in basso, purché nello stesso momento il drawdown sia più profondo di ${P.ddIngresso} sedute su 100 della storia.</p>
          <h3 class="gap"><i class="dot" style="background:var(--st-cooldown)"></i>Cooldown e riarmo</h3>
          <p>Dopo un trigger ci sono ${P.cooldown} sedute di pausa. Per aprire una nuova zona blu l'ampiezza deve prima risalire sopra il livello di riarmo: il maggiore tra ${P.riarmoMinimo}% e livello blu più ${P.riarmoSopra} punti.</p>
        </div>
        <div>
          <h3><i class="dot" style="background:var(--st-trigger)"></i>Trigger</h3>
          <p>L'ampiezza deve rialzarsi di almeno ${P.recuperoPunti} punti sopra il livello blu (o di ${P.recuperoTitoli} titoli, se valgono di più) e di almeno ${P.recuperoTitoli} titoli sopra il minimo toccato nella zona. Poi serve una conferma, scelta fra tre:</p>
          <ul>
            <li><b>spinta di ampiezza</b>: la quota sopra la media 20 passa da ${P.spinta20.da}% o meno a ${P.spinta20.a}% o più in ${P.spinta20.sedute} sedute, oppure quella sopra la media 50 da ${P.spinta50.da}% o meno a ${P.spinta50.a}% o più in ${P.spinta50.sedute};</li>
            <li><b>prezzo in ripresa</b>: ${prezzo} chiude sopra una media a 20 sedute che sta salendo;</li>
            <li><b>divergenza</b>: il prezzo segna un nuovo minimo mentre l'ampiezza resta sopra il suo.</li>
          </ul>
          <p>Le conferme diventano due quando la zona dura da più di ${P.zonaLunga} sedute o dopo un trigger fallito. Se l'ampiezza schizza direttamente sopra il livello di riarmo (<b>rimbalzo a V</b>) il trigger scatta senza conferme.</p>
          <h3 class="gap"><i class="dot" style="background:var(--st-fallito)"></i>Fallito</h3>
          <p>Se nelle ${P.verifica} sedute dopo il trigger ${eu ? "il prezzo" : "l'ETF"} chiude sotto il minimo della zona, meno la sua variazione giornaliera media, il trigger si annulla e si torna in zona blu.</p>
        </div>
      </div>
      ${righe}
      <p class="small">Va usato per scegliere dove approfondire, non come regola automatica: ogni ${eu ? "gruppo" : "settore"} ha pochi episodi e spesso l'ampiezza tocca il fondo prima del prezzo.${eu ? ` Per ${Z.ilNome} i livelli blu predefiniti sono il 5° percentile dell'ampiezza dal 2005 di ogni gruppo: non c'è una tabella di riferimento come per gli USA.` : ""}</p>`;
  };

  // ---------- piccoli grafici ----------

  // mini grafico a linea (SVG in linea): valori con null ammessi
  R.sparkline = function (valori, o = {}) {
    const w = o.w || 132, h = o.h || 30, pad = 3;
    const v = valori.map(x => (x == null || !isFinite(x) ? null : x));
    let lo = o.min != null ? o.min : Infinity, hi = o.max != null ? o.max : -Infinity;
    if (o.min == null || o.max == null) for (const x of v) if (x != null) { lo = Math.min(lo, x); hi = Math.max(hi, x); }
    if (o.livello != null) { lo = Math.min(lo, o.livello); hi = Math.max(hi, o.livello); }
    if (!isFinite(lo)) return "";
    if (hi === lo) { hi += 1; lo -= 1; }
    const X = i => pad + (i / Math.max(1, v.length - 1)) * (w - 2 * pad);
    const Y = x => pad + ((hi - x) / (hi - lo)) * (h - 2 * pad);
    let d = "", area = "", start = null, last = null;
    v.forEach((x, i) => {
      if (x == null) return;
      d += `${d ? "L" : "M"}${X(i).toFixed(1)},${Y(x).toFixed(1)}`;
      if (start == null) start = i;
      last = i;
    });
    if (o.area && start != null) area = `<path d="${d}L${X(last).toFixed(1)},${h - pad}L${X(start).toFixed(1)},${h - pad}Z" fill="${o.colore || "currentColor"}" opacity=".12"/>`;
    const liv = o.livello != null ? `<line x1="${pad}" x2="${w - pad}" y1="${Y(o.livello).toFixed(1)}" y2="${Y(o.livello).toFixed(1)}" stroke="var(--soglia)" stroke-width="1" stroke-dasharray="3 3" opacity=".9"/>` : "";
    const fine = last != null ? `<circle cx="${X(last).toFixed(1)}" cy="${Y(v[last]).toFixed(1)}" r="2.6" fill="${o.colore || "currentColor"}" stroke="var(--surface)" stroke-width="1.5"/>` : "";
    return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">${liv}${area}<path d="${d}" fill="none" stroke="${o.colore || "currentColor"}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>${fine}</svg>`;
  };

  // freccia orientata in gradi bussola (0 = su, 90 = destra)
  R.freccia = gradi => gradi == null ? "" :
    `<svg class="dir" viewBox="0 0 16 16" style="transform:rotate(${gradi}deg)" aria-hidden="true"><path d="M8 13V3M4 7l4-4 4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  // colore divergente per le tessere: negativo → rosso, positivo → verde (blu/arancio con CVD)
  function rgb(c) {
    const el = document.createElement("canvas").getContext("2d");
    el.fillStyle = c; const h = el.fillStyle;
    if (h.startsWith("#")) return [1, 3, 5].map(k => parseInt(h.slice(k, k + 2), 16));
    const m = h.match(/\d+(\.\d+)?/g); return m ? m.slice(0, 3).map(Number) : [128, 128, 128];
  }
  // luminanza relativa (WCAG) di un colore rgb
  const lumRel = c => {
    const [r, g, b] = c.map(x => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  let tavolozza = null;
  R.on("tema", () => { tavolozza = null; });
  R.divergente = function (v, pieno) {
    if (!tavolozza) tavolozza = { neg: rgb(R.css("--neg")), pos: rgb(R.css("--pos")), mid: rgb(R.css("--surface-3")) };
    const { neg, pos, mid } = tavolozza;
    const t = v == null ? 0 : Math.max(-1, Math.min(1, v / (pieno || 20)));
    const a = t < 0 ? neg : pos, k = 0.88 * Math.pow(Math.abs(t), 0.8);
    const c = mid.map((m, i) => Math.round(m + (a[i] - m) * k));
    // testo chiaro o scuro, quello che si legge meglio sul fondo
    const L = lumRel(c);
    const conBianco = 1.05 / (L + 0.05), conNero = (L + 0.05) / 0.055;
    return { bg: `rgb(${c.join(",")})`, testo: conNero > conBianco ? "#0e1013" : "#ffffff" };
  };

  // ---------- varie ----------
  R.debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  R.vai = hash => { if (location.hash !== hash) location.hash = hash; else R.emit("rotta", hash); };
})();
