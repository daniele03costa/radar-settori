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
    universi: () => carica("config/universi.json", { cache: "no-cache" }),
    prezzi: mercato => carica(mercato === "globale" ? "data/prezzi_globali.json" : "data/prezzi_usa.json", { cache: "no-cache" }),
  };

  // ---------- livelli blu e analisi ----------
  R.livelliLocali = R.store.get("soglie", {});
  R.livello = etf => {
    if (R.livelliLocali[etf] != null) return R.livelliLocali[etf];
    const m = R.meta && R.meta.settori.find(s => s.etf === etf);
    return m ? m.soglia_default : 10;
  };
  R.livelloDefault = etf => {
    const m = R.meta && R.meta.settori.find(s => s.etf === etf);
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

  const analisi = new Map();
  R.analisiSync = (etf, d) => {
    const lv = R.livello(etf);
    const k = etf + "|" + lv;
    if (!analisi.has(k)) analisi.set(k, window.Signals.analizza(d, lv, (R.meta && R.meta.parametri) || {}));
    return analisi.get(k);
  };
  R.analisi = etf => R.dati.settore(etf).then(d => R.analisiSync(etf, d));

  // ---------- colori ----------
  R.colori = () => ({
    price: R.css("--price"), priceArea: R.css("--price-area"), ma: R.css("--ma"), dd: R.css("--dd"), ddArea: R.css("--dd-area"),
    b200: R.css("--b200"), b200Area: R.css("--b200-area"), b50: R.css("--b50"), soglia: R.css("--soglia"),
    segnale: R.css("--segnale"), fallito: R.css("--fallito"), muted: R.css("--muted"), line: R.css("--line"),
    ink: R.css("--ink"), surface: R.css("--surface"),
  });
  R.coloreQuadrante = q => R.css("--q-" + (q || "none")) || R.css("--muted");

  // ordine degli stati nel Monitor (prima i più "caldi")
  R.ORDINE_STATI = { fallito: 0, trigger: 1, blu: 2, attenzione: 3, cooldown: 4, normale: 5 };

  // ---------- spiegazione delle regole (vista Settore e Alert) ----------
  R.htmlRegole = function (conParametri) {
    const P = R.parametri();
    const righe = conParametri ? `
      <details class="param">
        <summary>Parametri in uso</summary>
        <table class="tbl param-tbl"><tbody>
          <tr><td>Fascia di attenzione sopra il livello blu</td><td>${P.fasciaAttenzione} punti</td></tr>
          <tr><td>Drawdown per l'attenzione / per la zona blu</td><td>oltre l'${P.ddAttenzione}° / il ${P.ddIngresso}° percentile</td></tr>
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
          <p>È la quota di titoli dell'S&amp;P 500 del settore che chiudono sopra la propria media a 200 sedute (e, come riferimento, a 50 e a 20).
            Le chiusure sono corrette per gli split ma non per i dividendi; per gli anni passati si usano i titoli che erano nell'indice allora.</p>
          <h3 class="gap"><i class="dot" style="background:var(--st-attenzione)"></i>Attenzione</h3>
          <p>L'ampiezza è a non più di ${P.fasciaAttenzione} punti sopra il livello blu, oppure il drawdown è più profondo di ${P.ddAttenzione} sedute su 100 della storia del settore.</p>
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
            <li><b>prezzo in ripresa</b>: l'ETF chiude sopra una media a 20 sedute che sta salendo;</li>
            <li><b>divergenza</b>: il prezzo segna un nuovo minimo mentre l'ampiezza resta sopra il suo.</li>
          </ul>
          <p>Le conferme diventano due quando la zona dura da più di ${P.zonaLunga} sedute o dopo un trigger fallito. Se l'ampiezza schizza direttamente sopra il livello di riarmo (<b>rimbalzo a V</b>) il trigger scatta senza conferme.</p>
          <h3 class="gap"><i class="dot" style="background:var(--st-fallito)"></i>Fallito</h3>
          <p>Se nelle ${P.verifica} sedute dopo il trigger l'ETF chiude sotto il minimo della zona, meno la sua variazione giornaliera media, il trigger si annulla e si torna in zona blu.</p>
        </div>
      </div>
      ${righe}
      <p class="small">Va usato per scegliere dove approfondire, non come regola automatica: ogni settore ha pochi episodi e spesso l'ampiezza tocca il fondo prima del prezzo.</p>`;
  };

  // ---------- varie ----------
  R.debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  R.vai = hash => { if (location.hash !== hash) location.hash = hash; else R.emit("rotta", hash); };
})();
