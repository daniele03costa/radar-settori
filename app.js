/*
 * Radar Settori — struttura dell'app: viste e indirizzi, elenco settori, barra dei comandi,
 * tastiera, guida, tema, CVD e avviso sui dati in ritardo.
 */
(function () {
  "use strict";

  const R = window.Radar, S = window.Signals, Cal = window.Calendario;
  const { $, $$, num, esc, dataIt } = R;

  const VISTE = ["mon", "rot", "btm", "sec", "alr"];
  const ALIAS = { rrg: "rot", alert: "alr", alrt: "alr" };
  let vistaCorrente = null;
  let tastiAttivi = R.store.get("tasti", true);

  // ---------------- elenco dei settori ----------------

  function disegnaSettori() {
    if (!R.meta) return;
    const corrente = vistaCorrente === "sec" ? R.viste.sec.etfCorrente() : null;
    $("#settori").innerHTML = R.meta.settori.map(s => {
      const lv = R.livello(s.etf);
      let stato = null;
      try { const d = R._settoriPronti && R._settoriPronti[s.etf]; if (d) stato = R.analisiSync(s.etf, d).statoOggi; } catch (e) { /* niente */ }
      return `<a class="sec${stato ? " st-" + stato : ""}" href="#${s.etf}" data-etf="${s.etf}" aria-current="${s.etf === corrente}"
        title="${esc(s.nome)}: ${s.sopra != null && s.n ? `${s.sopra} titoli su ${s.n}` : `${num(s.b200, 1)}% dei titoli`} sopra la media 200 (${num(s.b200, 1)}%); livello blu ${num(lv, 0)}%${s.n ? ` = ${R.titoliLivello(s.b200, s.n, lv).soglia} su ${s.n}` : ""}${stato ? " · " + S.STATI[stato] : ""}">
        <span class="t">${s.etf}</span>
        <span class="n">${esc(s.nome)}</span>
        <span class="v">${num(s.b200, 0)}%</span>
        ${stato && stato !== "normale" ? `<span class="stato st-${stato}">${S.STATI[stato]}</span>` : ""}
        <span class="bar"><i style="width:${Math.max(0, Math.min(100, s.b200 || 0))}%"></i><s style="left:${Math.min(100, lv)}%"></s></span>
      </a>`;
    }).join("");
  }

  async function caricaStatiSettori() {
    try {
      R._settoriPronti = await R.dati.tuttiSettori();
      disegnaSettori();
    } catch (e) { /* si riprova alla prossima vista */ }
  }

  // ---------------- viste e indirizzi ----------------

  function leggiRotta() {
    let h = decodeURIComponent(location.hash.replace(/^#/, "")).trim();
    if (!h) return { vista: "mon" };
    const low = h.toLowerCase();
    if (VISTE.includes(low)) return { vista: low };
    if (ALIAS[low]) return { vista: ALIAS[low] };
    const up = h.toUpperCase();
    const [etf, titolo] = up.split("/");
    if (R.meta && R.meta.settori.some(s => s.etf === etf)) return { vista: "sec", param: titolo ? `${etf}/${titolo}` : etf };
    // il ticker di un'azione dell'S&P 500 porta al suo settore
    const az = R._mappaTitoli && (R._mappaTitoli.get(up) || R._mappaTitoli.get(up.replace(/[.\/]/g, "-")));
    if (az) return { vista: "sec", param: `${az.etf}/${az.t}` };
    return { vista: "mon" };
  }

  async function applicaRotta() {
    const { vista, param } = leggiRotta();
    if (vistaCorrente && vistaCorrente !== vista && R.viste[vistaCorrente]) R.viste[vistaCorrente].nascondi();
    vistaCorrente = vista;
    document.body.dataset.view = vista;
    $$(".view").forEach(sec => { sec.hidden = sec.dataset.view !== vista; });
    $$("#viste a").forEach(a => a.setAttribute("aria-current", String(a.dataset.view === vista)));
    disegnaSettori();
    try { await R.viste[vista].mostra(param); }
    catch (e) { console.error(e); }
    disegnaSettori();
    if (vista === "sec") {
      const el = $(`.sec[data-etf="${R.viste.sec.etfCorrente()}"]`);
      if (el && window.matchMedia("(max-width: 960px)").matches) el.scrollIntoView({ block: "nearest", inline: "center" });
    }
  }

  // ---------------- barra dei comandi ----------------

  let indice = [];
  const TIPI_VOCE = { vista: "Vista", comando: "Comando", settore: "Settore", azione: "Azione S&P 500", titolo: "Rotazione", bench: "Confronto" };
  // testo senza accenti né segni, per confrontare "coca cola" con "Coca-Cola Company (The)"
  const norm = x => String(x || "").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9&]+/g, " ").trim();
  const PAROLE_VUOTE = new Set(["INC", "CORP", "CORPORATION", "COMPANY", "COMPANIES", "GROUP", "HOLDINGS", "HOLDING", "THE", "PLC", "LTD", "TRUST", "CLASS", "INCORPORATED", "INTERNATIONAL"]);

  async function costruisciIndice() {
    const out = [];
    const add = (chiavi, voce) => out.push(Object.assign({ chiavi: Array.from(new Set(chiavi.map(norm).filter(Boolean))) }, voce));
    add(["MON", "MONITOR"], { etichetta: "MON", descr: "Monitor, il quadro di tutti i settori", tipo: "vista", fai: () => R.vai("#mon") });
    add(["ROT", "RRG", "ROTAZIONE"], { etichetta: "ROT", descr: "Rotazione relativa", tipo: "vista", fai: () => R.vai("#rot") });
    add(["BTM", "BOTTOM"], { etichetta: "BTM", descr: "Bottom Map", tipo: "vista", fai: () => R.vai("#btm") });
    add(["SEC", "SETTORE"], { etichetta: "SEC", descr: "Pagina del settore", tipo: "vista", fai: () => R.vai("#sec") });
    add(["ALRT", "ALR", "ALERT"], { etichetta: "ALRT", descr: "Alert, lo storico degli stati", tipo: "vista", fai: () => R.vai("#alr") });
    add(["HELP", "AIUTO", "GUIDA"], { etichetta: "HELP", descr: "Guida", tipo: "comando", fai: apriGuida });
    add(["CHIARO"], { etichetta: "CHIARO", descr: "Tema chiaro", tipo: "comando", fai: () => impostaTema("light") });
    add(["SCURO"], { etichetta: "SCURO", descr: "Tema scuro", tipo: "comando", fai: () => impostaTema("dark") });
    add(["TEMA"], { etichetta: "TEMA", descr: "Inverti il tema", tipo: "comando", fai: () => impostaTema(document.documentElement.dataset.theme === "light" ? "dark" : "light") });
    for (const s of R.meta.settori) {
      add([s.etf, s.nome], { etichetta: s.etf, descr: s.nome, tipo: "settore", fai: () => R.vai("#" + s.etf) });
    }
    // tutte le azioni dell'S&P 500: aprono il loro settore con il titolo evidenziato
    try {
      const titoli = await R.dati.titoli();
      const nomi = Object.fromEntries(R.meta.settori.map(s => [s.etf, s.nome]));
      R._mappaTitoli = new Map();
      for (const x of titoli) {
        if (!x || !x.t || !nomi[x.etf]) continue;
        R._mappaTitoli.set(x.t.toUpperCase(), x);
        const parole = norm(x.nome).split(" ").filter(w => w.length >= 3 && !PAROLE_VUOTE.has(w));
        add([x.t, x.t.replace(/[^A-Za-z0-9]/g, ""), x.nome, ...parole], {
          etichetta: x.t, descr: `${x.nome} · ${nomi[x.etf]}`, tipo: "azione",
          fai: () => R.vai(`#${x.etf}/${x.t}`),
        });
      }
      // un indirizzo con il ticker di un'azione (#AAPL) si può aprire solo adesso
      if (location.hash && leggiRotta().vista === "sec" && vistaCorrente === "mon") applicaRotta();
    } catch (e) { /* senza elenco restano settori e comandi */ }
    try {
      const gruppi = await R.viste.rot.gruppi();
      const u = await R.dati.universi();
      // termini di confronto
      const benchVisti = new Set();
      const benchVoce = (key, etichetta, descr) => {
        if (benchVisti.has(etichetta)) return;
        benchVisti.add(etichetta);
        add([etichetta], {
          etichetta, descr, tipo: "bench",
          fai: () => {
            const corrente = R.store.get("rot.universo", "settori");
            const adatti = gruppi.filter(g => g.benchmark.some(b => b === key || (etichetta === "ACWI" && (b === "ACWI" || b === "IUSQ.DE"))));
            const g = adatti.find(x => x.id === corrente) || adatti[0];
            if (!g) return;
            const b = g.benchmark.find(x => x === key) || g.benchmark.find(x => x === "ACWI" || x === "IUSQ.DE");
            R.viste.rot.apri({ universo: g.id, bench: b });
          },
        });
      };
      benchVoce("PTF", "PTF", "Rotazione contro il portafoglio di riferimento");
      for (const k of Object.keys(u.usa.benchmark)) benchVoce(k, k, `Rotazione contro ${u.usa.benchmark[k].nome}`);
      benchVoce("IUSQ.DE", "ACWI", "Rotazione contro l'azionario mondiale (ACWI)");
      // titoli degli universi
      const visti = new Set();
      for (const g of gruppi) {
        for (const [sym, info] of Object.entries(g.titoli)) {
          if (visti.has(sym)) continue;
          visti.add(sym);
          if (R.meta.settori.some(s => s.etf === sym)) continue; // i settori aprono il dettaglio
          const base = sym.replace(/\..*$/, "");
          const parole = String(info.nome || "").split(/[^A-Za-zÀ-ÿ0-9&-]+/).filter(w => w.length >= 4);
          add([sym, base, info.breve || "", ...parole], {
            etichetta: base, descr: `${info.nome || info.breve || base} · ${g.nome}`, tipo: "titolo",
            fai: () => {
              const corrente = R.store.get("rot.universo", "settori");
              const dentro = gruppi.filter(x => x.titoli[sym]);
              const gg = dentro.find(x => x.id === corrente) || dentro[0];
              R.viste.rot.apri({ universo: gg.id, evidenzia: sym });
            },
          });
        }
      }
    } catch (e) { /* senza universi restano settori e comandi */ }
    indice = out;
  }

  function cerca(testo) {
    const q = norm(testo);
    if (!q) return [];
    const punteggio = v => {
      let best = 0;
      for (const k of v.chiavi) {
        if (!k) continue;
        if (k === q) best = Math.max(best, 100);
        else if (k.startsWith(q)) best = Math.max(best, 60 - (k.length - q.length) * 0.1);
        else if (q.length >= 3 && k.includes(q)) best = Math.max(best, 30);
      }
      if (best && v.tipo === "settore") best += 2;
      if (best && v.tipo === "azione") best += 1;
      return best;
    };
    return indice.map(v => ({ v, p: punteggio(v) })).filter(x => x.p > 0).sort((a, b) => b.p - a.p).slice(0, 9).map(x => x.v);
  }

  let scelta = 0, risultati = [];
  function mostraSuggerimenti() {
    const box = $("#suggerimenti");
    const input = $("#comando");
    risultati = cerca(input.value);
    scelta = 0;
    if (!risultati.length) { box.hidden = true; $(".cmd").setAttribute("aria-expanded", "false"); return; }
    box.innerHTML = risultati.map((v, k) => `<div class="sg" role="option" id="sg-${k}" aria-selected="${k === 0}" data-k="${k}"><b>${esc(v.etichetta)}</b><span>${esc(v.descr)}</span><em>${TIPI_VOCE[v.tipo] || ""}</em></div>`).join("");
    box.hidden = false;
    $(".cmd").setAttribute("aria-expanded", "true");
  }
  function evidenziaSuggerimento(k) {
    scelta = (k + risultati.length) % risultati.length;
    $$("#suggerimenti .sg").forEach((el, i) => el.setAttribute("aria-selected", String(i === scelta)));
  }
  function esegui(k) {
    const v = risultati[k];
    const input = $("#comando");
    if (!v) {
      const t = input.value.trim();
      if (t) { input.classList.add("err"); setTimeout(() => input.classList.remove("err"), 600); }
      return;
    }
    input.value = "";
    $("#suggerimenti").hidden = true;
    input.blur();
    v.fai();
  }

  // ---------------- guida, tema, CVD ----------------

  function apriGuida() { $("#guida").hidden = false; $("#guida-chiudi").focus(); }
  function chiudiGuida() { $("#guida").hidden = true; }

  function impostaTema(t) {
    document.documentElement.dataset.theme = t;
    R.store.set("_", 0);
    try { localStorage.setItem("radar.tema", t); } catch (e) { /* ignora */ }
    $("#tema-label").textContent = t === "light" ? "Scuro" : "Chiaro";
    R.emit("tema");
  }

  function impostaCvd(on) {
    if (on) document.documentElement.dataset.cvd = "1"; else delete document.documentElement.dataset.cvd;
    try { localStorage.setItem("radar.cvd", String(on)); } catch (e) { /* ignora */ }
    $("#cvd").setAttribute("aria-pressed", String(on));
    R.emit("tema");
  }

  // ---------------- dati in ritardo ----------------

  const date = {};
  function aggiornaBadge() {
    const box = $("#stato-dati");
    const voci = [];
    const now = new Date();
    if (date.meta) voci.push({ nome: "Ampiezza", data: date.meta, r: Cal.ritardo(date.meta, now, "nyse") });
    if (date.usa) voci.push({ nome: "Prezzi USA", data: date.usa, r: Cal.ritardo(date.usa, now, "nyse") });
    if (date.globale) voci.push({ nome: "Prezzi in euro", data: date.globale, r: Cal.ritardo(date.globale, now, "milano") });
    if (!voci.length) { box.hidden = true; return; }
    const indietro = voci.filter(v => v.r.sedute > 0);
    box.hidden = false;
    box.className = "data-badge" + (indietro.length ? " late" : "");
    box.innerHTML = indietro.length
      ? `<i></i>Dati indietro: ${indietro.map(v => `${v.nome.toLowerCase()} al ${dataIt(v.data)} (${R.sedute(v.r.sedute)})`).join(", ")}`
      : `<i></i>Dati aggiornati alla seduta del ${dataIt(voci[0].data)}`;
    const scaricati = R.meta && R.meta.generato ? new Date(R.meta.generato) : null;
    box.title = voci.map(v => `${v.nome}: chiusura del ${dataIt(v.data)}${v.r.sedute ? `, attesa quella del ${dataIt(v.r.attesa)}` : ""}`).join("\n") +
      (scaricati && !isNaN(scaricati) ? `\nUltimo aggiornamento: ${scaricati.toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}` : "");
  }

  // ---------------- avvio ----------------

  function mostraVuoto() {
    $("#aggiornato").textContent = "nessun dato";
    $$(".view").forEach(v => { v.hidden = true; });
    const main = $(".main");
    const box = document.createElement("article");
    box.className = "card empty";
    box.innerHTML = `
      <h1>I dati non ci sono ancora</h1>
      <p>Il sito è online ma l'aggiornamento automatico non ha ancora prodotto i file dei dati.</p>
      <ol>
        <li>Apri il repository su GitHub e vai nella scheda <b>Actions</b>.</li>
        <li>Scegli <b>Aggiorna dati</b> e premi <b>Run workflow</b>.</li>
        <li>Quando compare la spunta verde (10–20 minuti la prima volta), ricarica questa pagina.</li>
      </ol>`;
    main.insertBefore(box, $(".main footer"));
  }

  function collegaEventi() {
    window.addEventListener("hashchange", applicaRotta);
    R.on("rotta", applicaRotta);
    R.on("livelli", disegnaSettori);
    R.on("settore", () => disegnaSettori());
    R.on("prezzi", x => { date[x.mercato] = x.aggiornato; aggiornaBadge(); });

    // barra dei comandi
    const input = $("#comando");
    input.addEventListener("input", mostraSuggerimenti);
    input.addEventListener("focus", mostraSuggerimenti);
    input.addEventListener("blur", () => setTimeout(() => { $("#suggerimenti").hidden = true; }, 150));
    input.addEventListener("keydown", e => {
      if (e.key === "ArrowDown") { e.preventDefault(); evidenziaSuggerimento(scelta + 1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); evidenziaSuggerimento(scelta - 1); }
      else if (e.key === "Enter") { e.preventDefault(); if (!risultati.length) mostraSuggerimenti(); esegui(scelta); }
      else if (e.key === "Escape") { input.value = ""; $("#suggerimenti").hidden = true; input.blur(); }
    });
    $("#suggerimenti").addEventListener("mousedown", e => {
      const el = e.target.closest(".sg");
      if (el) { e.preventDefault(); esegui(Number(el.dataset.k)); }
    });

    // guida
    $("#aiuto").addEventListener("click", apriGuida);
    $("#guida-chiudi").addEventListener("click", chiudiGuida);
    $("#guida").addEventListener("click", e => { if (e.target.id === "guida") chiudiGuida(); });
    const cb = $("#tasti-attivi");
    cb.checked = tastiAttivi;
    cb.addEventListener("change", () => { tastiAttivi = cb.checked; R.store.set("tasti", tastiAttivi); });

    // tema e CVD
    $("#tema-label").textContent = document.documentElement.dataset.theme === "light" ? "Scuro" : "Chiaro";
    $("#tema").addEventListener("click", () => impostaTema(document.documentElement.dataset.theme === "light" ? "dark" : "light"));
    $("#cvd").setAttribute("aria-pressed", String(document.documentElement.dataset.cvd === "1"));
    $("#cvd").addEventListener("click", () => impostaCvd(document.documentElement.dataset.cvd !== "1"));

    // frecce sull'elenco delle viste
    $("#viste").addEventListener("keydown", e => {
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
      const link = e.target.closest("a[data-view]");
      if (!link) return;
      e.preventDefault();
      const k = VISTE.indexOf(link.dataset.view);
      const next = VISTE[(k + (e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1) + VISTE.length) % VISTE.length];
      R.vai("#" + next);
      const el = $(`#viste a[data-view="${next}"]`);
      if (el) el.focus();
    });

    // tastiera
    document.addEventListener("keydown", e => {
      if (!$("#guida").hidden) { if (e.key === "Escape") { e.preventDefault(); chiudiGuida(); } return; }
      const t = e.target;
      const scrivendo = t && t.closest && t.closest("input:not([type=range]):not([type=checkbox]), textarea, select, [contenteditable]");
      if (scrivendo || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape") { const v = R.viste[vistaCorrente]; if (v && v.tasto && v.tasto(e)) e.preventDefault(); return; }
      if (!tastiAttivi) return;
      if (t && t.closest && t.closest("#viste") && e.key.startsWith("Arrow")) return;
      if (e.key === "/") { e.preventDefault(); $("#comando").focus(); return; }
      if (e.key === "?") { e.preventDefault(); apriGuida(); return; }
      if ((e.key === "c" || e.key === "C") && R.copiaPerClaude) { e.preventDefault(); R.copiaPerClaude(); return; }
      if (/^[1-5]$/.test(e.key)) { e.preventDefault(); R.vai("#" + VISTE[Number(e.key) - 1]); return; }
      if (t && t.type === "range" && e.key.startsWith("Arrow")) return;
      const v = R.viste[vistaCorrente];
      if (v && v.tasto && v.tasto(e)) e.preventDefault();
    });
  }

  async function avvia() {
    collegaEventi();
    try {
      R.meta = await R.dati.meta();
    } catch (e) {
      mostraVuoto();
      return;
    }
    if (!R.meta.settori || !R.meta.settori.length) { mostraVuoto(); return; }
    $("#aggiornato").textContent = dataIt(R.meta.aggiornato);
    $("#aggiornato").title = `Dati alla chiusura del ${dataIt(R.meta.aggiornato)}`;
    date.meta = R.meta.aggiornato;
    aggiornaBadge();

    // avvisa la barra quando arrivano i prezzi
    const prezzi = R.dati.prezzi;
    R.dati.prezzi = m => prezzi(m).then(p => { R.emit("prezzi", { mercato: m === "globale" ? "globale" : "usa", aggiornato: p.aggiornato }); return p; });

    for (const v of VISTE) R.viste[v].init();
    disegnaSettori();
    await applicaRotta();
    caricaStatiSettori();
    costruisciIndice();
    // controlla le date dei prezzi anche senza aprire la rotazione
    setTimeout(() => { R.dati.prezzi("usa").catch(() => {}); R.dati.prezzi("globale").catch(() => {}); }, 1500);
  }

  avvia();
})();
