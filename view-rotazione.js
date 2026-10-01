/*
 * Radar Settori — Rotazione relativa (RS-Ratio / RS-Momentum), una per zona:
 *   USA: settori S&P 500 e MAG7 (in dollari); Europa: settori e indici europei (dalla zona Europa) ed ETF in euro;
 *   Crypto: le prime 10 contro bitcoin o contro il loro paniere (dalla zona Crypto, giorni di calendario).
 */
(function () {
  "use strict";

  const R = window.Radar, Rot = window.Rotazione, PF = window.Portafoglio, Cal = window.Calendario;
  const { $, num, pct, esc, svg, dataIt, cls } = R;

  // universi calcolati dai dati delle altre zone: le serie arrivano da view-europa.js e view-crypto.js
  const VIRTUALI = [
    { id: "eu-settori", nome: "Settori europei", zona: "eur", fonte: "europa", tipo: "settori", calendario: "milano", nota: "panieri a pesi uguali delle azioni di ogni settore, in euro, dividendi esclusi" },
    { id: "eu-indici", nome: "Indici europei", zona: "eur", fonte: "europa", tipo: "indici", calendario: "milano", nota: "indici convertiti in euro, dividendi esclusi" },
    { id: "crypto", nome: "Prime 10 crypto", zona: "cry", fonte: "crypto", calendario: "crypto", nota: "prezzi in dollari, un giorno = un giorno di calendario" },
  ];
  const PREDEFINITI = { usa: "settori", eur: "eu-settori", cry: "crypto" };

  // l'universo scelto in ogni zona (prima c'era un universo solo: si porta nella sua zona)
  function universiSalvati() {
    const u = R.store.get("rot.universi", null);
    if (u) return Object.assign({}, PREDEFINITI, u);
    const vecchio = R.store.get("rot.universo", null);
    const out = Object.assign({}, PREDEFINITI);
    if (vecchio === "settori" || vecchio === "mag7") out.usa = vecchio;
    else if (vecchio) out.eur = vecchio;
    return out;
  }

  const st = {
    zona: "usa",
    universi: universiSalvati(),
    get universo() { return this.universi[this.zona] || PREDEFINITI[this.zona]; },
    set universo(v) { this.universi[this.zona] = v; },
    giro: 0,
    bench: R.store.get("rot.bench", {}),
    barre: R.store.get("rot.barre", "settimanali"),
    formula: R.store.get("rot.formula", "nuova"),
    coda: R.store.get("rot.coda", 10),
    scala: R.store.get("rot.scala", "adattata"),
    prezzi: R.store.get("rot.prezzi", false),
    periodo: R.store.get("rot.periodo", 126),
    pesi: R.store.get("rot.pesi", null),
    ordine: R.store.get("rot.ordine", { col: "quadrante", dir: 1 }),
    fine: null,           // barra mostrata (null = ultima)
    evidenza: null,       // titolo evidenziato (fisso)
    passaggio: null,      // titolo sotto il mouse
    visibile: false,
    play: null,
    u: null,              // universi.json
    calc: null,           // ultimo calcolo
  };

  const ORDINE_Q = { leader: 0, indebolimento: 1, ritardo: 2, miglioramento: 3 };
  const NOMI_Q = { leader: "Leader", indebolimento: "In indebolimento", ritardo: "In ritardo", miglioramento: "In miglioramento" };
  const ICONA_PLAY = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M5 3.2v9.6L12.6 8z" fill="currentColor"/></svg>';
  const ICONA_PAUSA = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><rect x="4" y="3.2" width="2.8" height="9.6" rx="1" fill="currentColor"/><rect x="9.2" y="3.2" width="2.8" height="9.6" rx="1" fill="currentColor"/></svg>';

  // ---------------- universi ----------------

  // tutti gli universi: quelli di universi.json (USA in dollari nella zona USA, ETF in euro nella zona Europa) e quelli calcolati
  function gruppi() {
    const u = st.u;
    const out = [];
    for (const g of u.usa.gruppi) out.push(Object.assign({ mercato: "usa", zona: "usa", calendario: "nyse" }, g));
    for (const g of u.globale.gruppi) out.push(Object.assign({ mercato: "globale", zona: "eur", calendario: "milano" }, g));
    return out.concat(VIRTUALI);
  }
  const gruppiZona = z => gruppi().filter(g => g.zona === z);
  const gruppo = () => { const tutti = gruppiZona(st.zona); return tutti.find(g => g.id === st.universo) || tutti.find(g => g.id === PREDEFINITI[st.zona]) || tutti[0]; };
  const inEuro = g => g.mercato === "globale" || g.fonte === "europa";

  function infoTitolo(sym, g) {
    const u = st.u;
    const m = (g && g.titoli && g.titoli[sym]) || (g && g.info && g.info[sym]) ||
      (g && g.mercato === "usa" ? u.usa.benchmark[sym] : u.globale.benchmark[sym]) || u.usa.benchmark[sym] || u.globale.benchmark[sym] || {};
    return { breve: m.breve || sym.replace(/\..*$/, ""), nome: m.nome || m.breve || sym };
  }

  function nomeBench(key, g) {
    if (key === "PTF") return "Portafoglio di riferimento";
    if (g && g.info && g.info[key]) return g.info[key].breve;
    const i = infoTitolo(key, g);
    return `${i.breve} (${key.replace(/\..*$/, "")})`;
  }

  // i prezzi di un universo; per quelli calcolati arrivano anche i titoli e i termini di confronto
  async function prezziGruppo(g) {
    if (g.fonte === "europa" || g.fonte === "crypto") {
      const r = g.fonte === "europa" ? await R.viste.eur.serieRotazione(g.tipo) : await R.viste.cry.serieRotazione();
      Object.assign(g, { titoli: r.titoli, info: r.info, benchmark: r.benchmark, benchmark_default: r.benchmark[0] });
      return { date: r.date, serie: r.serie, aggiornato: r.aggiornato };
    }
    return R.dati.prezzi(g.mercato);
  }

  // passi dei rendimenti: sedute di borsa, o giorni di calendario per le crypto
  const passiDi = g => (g.calendario === "crypto" ? { w1: 7, m1: 30, m3: 91, m6: 182, a1: 365, max: 365, media: 200 } : null);
  const barreDi = (g, n) => (g.calendario === "crypto" ? Math.round((n * 365) / 252) : n);

  const benchDi = g => {
    const b = st.bench[g.id];
    return b && g.benchmark.includes(b) ? b : g.benchmark_default || g.benchmark[0];
  };

  function pesiPortafoglio(g) {
    const def = (g.portafoglio && g.portafoglio.pesi) || {};
    if (!st.pesi) return Object.assign({}, def);
    const out = {};
    for (const k of Object.keys(def)) out[k] = st.pesi[k] != null ? st.pesi[k] : def[k];
    return out;
  }

  // ---------------- calcolo ----------------

  async function calcola() {
    const g = gruppo();
    const px = await prezziGruppo(g);
    const mercato = g.calendario || (g.mercato === "usa" ? "nyse" : "milano");
    const benchKey = benchDi(g);
    let bench, ptf = null;
    if (benchKey === "PTF") {
      ptf = PF.calcola(px.date, px.serie, pesiPortafoglio(g));
      bench = ptf.valori;
    } else {
      bench = px.serie[benchKey] || [];
    }
    const b = Rot.barre(px.date, st.barre, d => Cal.successiva(d, mercato));
    const ib = b.indici;
    const titoli = Object.keys(g.titoli).filter(t => t !== benchKey && px.serie[t]);
    const serie = {};
    let primo = Infinity;
    for (const t of titoli) {
      const p = ib.map(i => px.serie[t][i]);
      const q = ib.map(i => bench[i]);
      const r = Rot.calcola(p, q, st.formula);
      serie[t] = r;
      const k = r.ratio.findIndex((v, i) => v != null && r.mom[i] != null);
      if (k >= 0) primo = Math.min(primo, k);
    }
    const ultimo = ib.length - 1;
    if (!isFinite(primo)) primo = ultimo;
    return { g, px, benchKey, bench, ptf, barre: b, ib, titoli, serie, primo, ultimo, mercato };
  }

  // ---------------- disegno ----------------

  async function disegna() {
    const giro = ++st.giro;
    let c;
    try {
      if (!st.u) st.u = await R.dati.universi();
      c = await calcola();
    } catch (e) {
      if (giro !== st.giro) return;
      console.error(e);
      st.calc = null;
      try { $("#rot-titolo").textContent = gruppo().nome; disegnaUniversi(gruppo()); } catch (e2) { $("#rot-titolo").textContent = "Rotazione"; }
      $("#rot-sub").textContent = "Dati non ancora disponibili.";
      $("#rot-bench").innerHTML = "";
      $("#perf-legenda").innerHTML = "";
      $("#rot-portafoglio").hidden = true;
      $("#rot-grafico").innerHTML = `<div class="empty-note">I prezzi per la rotazione non sono ancora disponibili. Si scaricano con l'aggiornamento automatico (GitHub → Actions → ${st.zona === "cry" ? "Aggiorna crypto" : "Aggiorna dati"}).</div>`;
      $("#rot-tabella").innerHTML = "";
      $("#perf-grafico").innerHTML = "";
      return;
    }
    if (!st.visibile || giro !== st.giro) return;
    st.calc = c;
    if (st.fine == null || st.fine > c.ultimo) st.fine = c.ultimo;
    if (st.fine < c.primo) st.fine = c.primo;
    disegnaControlli(c);
    disegnaGrafico(c);
    disegnaTabella(c);
    disegnaPortafoglio(c);
    disegnaPerformance(c);
  }

  // i pulsanti degli universi della zona aperta (si disegnano anche prima che arrivino i dati)
  function disegnaUniversi(g) {
    const btn = x => `<button type="button" data-v="${x.id}" aria-pressed="${x.id === g.id}">${esc(x.nome)}</button>`;
    const zona = gruppiZona(st.zona);
    const calcolati = zona.filter(x => x.fonte), etf = zona.filter(x => x.mercato === "globale");
    $("#rot-universo").innerHTML = st.zona === "eur"
      ? `${calcolati.map(btn).join("")}<span class="seg-label">ETF in euro</span>${etf.map(btn).join("")}`
      : zona.map(btn).join("");
    $("#rot-universo").closest(".ctrl").hidden = zona.length < 2;
  }

  function disegnaControlli(c) {
    const g = c.g;
    disegnaUniversi(g);
    $("#rot-bench").innerHTML = g.benchmark.map(k => `<option value="${k}"${k === c.benchKey ? " selected" : ""}>${esc(nomeBench(k, g))}</option>`).join("");
    R.$$("#rot-barre button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.v === st.barre)));
    R.$$("#rot-scala button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.v === st.scala)));
    R.$$("#perf-periodo button").forEach(b => b.setAttribute("aria-pressed", String(Number(b.dataset.v) === st.periodo)));
    $("#rot-formula").value = st.formula;
    $("#rot-coda").value = st.coda;
    $("#rot-coda-val").textContent = st.coda;
    $("#rot-prezzi").checked = st.prezzi;
    const tempo = $("#rot-tempo");
    tempo.min = c.primo; tempo.max = c.ultimo; tempo.value = st.fine;
    const dataBarra = c.px.date[c.ib[st.fine]];
    const provv = c.barre.provvisoria && st.fine === c.ultimo;
    $("#rot-data").textContent = dataIt(dataBarra) + (provv ? " (settimana in corso)" : "");
    $("#rot-titolo").textContent = `${g.nome} contro ${g.info && g.info[c.benchKey] && g.info[c.benchKey].titolo ? g.info[c.benchKey].titolo : nomeBench(c.benchKey, g)}`;
    const calcolo = { nuova: "calcolo nuovo", semplice: "medie semplici", classica: "calcolo classico" }[st.formula];
    $("#rot-sub").textContent = `Barre ${st.barre === "settimanali" ? "settimanali" : "giornaliere"} · ${calcolo} · ${g.nota || `prezzi ${g.mercato === "usa" ? "in dollari" : "in euro"}, dividendi inclusi`} · dati al ${dataIt(c.px.aggiornato)}` +
      (c.px.correzioni && c.px.correzioni.length ? ` · ${c.px.correzioni.length} ${c.px.correzioni.length === 1 ? "prezzo corretto" : "prezzi corretti"}` : "");
    $("#rot-tab-titolo").textContent = st.prezzi ? "Prezzi dell'universo" : "Posizione e movimento";
  }

  function puntiCoda(c, t) {
    const r = c.serie[t];
    const out = [];
    for (let k = Math.max(0, st.fine - st.coda); k <= st.fine; k++) {
      if (r.ratio[k] != null && r.mom[k] != null) out.push([r.ratio[k], r.mom[k], k]);
    }
    return out;
  }

  function scalaDi(c) {
    const pts = [];
    if (st.scala === "fissa") {
      for (const t of c.titoli) { const r = c.serie[t]; for (let k = 0; k <= c.ultimo; k++) pts.push([r.ratio[k], r.mom[k]]); }
    } else {
      for (const t of c.titoli) puntiCoda(c, t).forEach(p => pts.push(p));
    }
    return Rot.scala(pts, 1.5);
  }

  function disegnaGrafico(c) {
    const box = $("#rot-grafico");
    const W = Math.min(820, Math.max(320, box.clientWidth || 720));
    const H = W;
    const m = { l: 50, r: 14, t: 14, b: 44 };
    const pw = W - m.l - m.r, ph = H - m.t - m.b;
    const [lo, hi] = scalaDi(c);
    const X = v => m.l + ((v - lo) / (hi - lo)) * pw;
    const Y = v => m.t + ((hi - v) / (hi - lo)) * ph;
    const root = svg("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", role: "img", "aria-label": "Grafico di rotazione relativa" });
    const cx = X(100), cy = Y(100);
    const q = (x, y, w, h, k) => root.append(svg("rect", { x, y, width: w, height: h, class: "rq", style: `fill:var(--q-${k})` }));
    q(cx, m.t, m.l + pw - cx, cy - m.t, "leader");
    q(cx, cy, m.l + pw - cx, m.t + ph - cy, "indebolimento");
    q(m.l, cy, cx - m.l, m.t + ph - cy, "ritardo");
    q(m.l, m.t, cx - m.l, cy - m.t, "miglioramento");
    // nome del quadrante nell'angolo, con il pallino del suo colore
    const lab = (x, y, anchor, k) => root.append(svg("text", { x, y, "text-anchor": anchor, class: "rq-label" }, [
      svg("tspan", { class: "rq-dot", style: `fill:var(--q-${k})` }, "● "), NOMI_Q[k]]));
    lab(m.l + pw - 10, m.t + 20, "end", "leader");
    lab(m.l + pw - 10, m.t + ph - 12, "end", "indebolimento");
    lab(m.l + 10, m.t + ph - 12, "start", "ritardo");
    lab(m.l + 10, m.t + 20, "start", "miglioramento");
    // griglia
    const span = hi - lo;
    const passo = [0.5, 1, 2, 2.5, 5, 10, 20].find(s => span / s <= 10) || 20;
    for (let v = Math.ceil(lo / passo) * passo; v <= hi + 1e-9; v += passo) {
      const vv = +v.toFixed(6);
      root.append(svg("line", { x1: X(vv), x2: X(vv), y1: m.t, y2: m.t + ph, class: vv === 100 ? "rg-axis" : "rg-grid" }));
      root.append(svg("line", { x1: m.l, x2: m.l + pw, y1: Y(vv), y2: Y(vv), class: vv === 100 ? "rg-axis" : "rg-grid" }));
      root.append(svg("text", { x: X(vv), y: m.t + ph + 18, "text-anchor": "middle", class: "rg-tick" }, num(vv, passo < 1 ? 1 : 0)));
      root.append(svg("text", { x: m.l - 8, y: Y(vv) + 4, "text-anchor": "end", class: "rg-tick" }, num(vv, passo < 1 ? 1 : 0)));
    }
    root.append(svg("rect", { x: m.l, y: m.t, width: pw, height: ph, class: "rg-frame" }));
    root.append(svg("text", { x: m.l + pw / 2, y: H - 8, "text-anchor": "middle", class: "rg-axis-label" }, "RS-Ratio · forza relativa →"));
    root.append(svg("text", { x: 13, y: m.t + ph / 2, "text-anchor": "middle", class: "rg-axis-label", transform: `rotate(-90 13 ${m.t + ph / 2})` }, "RS-Momentum · variazione della forza →"));

    const provv = c.barre.provvisoria && st.fine === c.ultimo;
    const occupati = [];
    const etichette = svg("g");
    const attivo = st.passaggio || st.evidenza;
    const ordinati = c.titoli.slice().sort((a, b) => (a === attivo) - (b === attivo));
    // prima si riservano le posizioni delle teste, così le etichette non le coprono
    for (const t of ordinati) {
      const pts = puntiCoda(c, t);
      if (!pts.length) continue;
      const p = pts[pts.length - 1];
      occupati.push([X(p[0]) - 7, Y(p[1]) - 7, X(p[0]) + 7, Y(p[1]) + 7]);
    }
    for (const t of ordinati) {
      const pts = puntiCoda(c, t);
      if (!pts.length) continue;
      const info = infoTitolo(t, c.g);
      const testa = pts[pts.length - 1];
      const qd = Rot.quadrante(testa[0], testa[1]);
      const col = `var(--q-${qd})`;
      const dim = attivo && attivo !== t;
      const grp = svg("g", { class: "rt" + (dim ? " dim" : "") + (attivo === t ? " on" : ""), "data-t": t, tabindex: "0" });
      // la scia sfuma: i punti più vecchi sono più chiari
      const n = pts.length - 1;
      for (let j = 1; j <= n; j++) {
        const a = pts[j - 1], b = pts[j];
        grp.append(svg("line", { x1: X(a[0]), y1: Y(a[1]), x2: X(b[0]), y2: Y(b[1]), class: "rt-tail", "stroke-opacity": (0.3 + 0.7 * j / n).toFixed(2) }));
      }
      for (let j = 0; j < n; j++) {
        grp.append(svg("circle", { cx: X(pts[j][0]), cy: Y(pts[j][1]), r: 2.3, class: "rt-dot", "fill-opacity": (0.3 + 0.7 * j / n).toFixed(2) }));
      }
      const hx = X(testa[0]), hy = Y(testa[1]);
      grp.append(svg("circle", { cx: hx, cy: hy, r: 13, class: "rt-hit" }));
      grp.append(svg("circle", { cx: hx, cy: hy, r: attivo === t ? 7.5 : 6, class: "rt-head" + (provv ? " provv" : ""), style: provv ? `stroke:${col}` : `fill:${col}` }));
      grp.append(svg("title", null, `${info.breve} (${t}): ${Rot.QUADRANTI[qd]} · RS-Ratio ${num(testa[0], 2)} · RS-Momentum ${num(testa[1], 2)}`));
      root.append(grp);
      // etichetta: la prima posizione libera intorno alla testa (sugli schermi stretti basta il ticker)
      const nomeEt = W < 560 && !c.g.fonte ? t.replace(/\..*$/, "") : info.breve;
      const w = nomeEt.length * 7.4 + 4, h = 14;
      const prove = [[11, 4, "start"], [-11, 4, "end"], [0, -12, "middle"], [0, 21, "middle"], [10, -9, "start"], [-10, -9, "end"], [10, 17, "start"], [-10, 17, "end"]];
      let scelta = null;
      for (const pr of prove) {
        const x0 = pr[2] === "start" ? hx + pr[0] : pr[2] === "end" ? hx + pr[0] - w : hx - w / 2;
        const y0 = hy + pr[1] - 11;
        const rect = [x0, y0, x0 + w, y0 + h];
        if (x0 < m.l || x0 + w > m.l + pw || y0 < m.t || y0 + h > m.t + ph) continue;
        if (!occupati.some(o => !(rect[2] < o[0] || rect[0] > o[2] || rect[3] < o[1] || rect[1] > o[3]))) { scelta = pr; occupati.push(rect); break; }
      }
      if (!scelta) scelta = hx > m.l + pw - 60 ? prove[1] : prove[0];
      etichette.append(svg("text", { x: hx + scelta[0], y: hy + scelta[1], "text-anchor": scelta[2], class: "rt-label" + (dim ? " dim" : "") + (attivo === t ? " on" : ""), "data-t": t }, nomeEt));
    }
    root.append(etichette);
    box.innerHTML = "";
    box.append(root);
    const tip = document.createElement("div");
    tip.className = "chart-tip point-tip";
    tip.hidden = true;
    box.append(tip);
    $("#rot-nota-grafico").innerHTML = provv
      ? "Punto vuoto: la settimana non è ancora finita, la posizione può cambiare. Passa sopra un titolo per isolarlo, clic per fissarlo, Esc per togliere."
      : "Passa sopra un titolo per isolarlo, clic per fissarlo, Esc per togliere.";
  }

  // scheda che compare passando sopra un punto del grafico
  function mostraTip(t) {
    const box = $("#rot-grafico");
    const tip = box.querySelector(".point-tip");
    const c = st.calc;
    if (!tip) return;
    if (!t || !c || !c.serie[t]) { tip.hidden = true; return; }
    const r = c.serie[t];
    const mi = Rot.misure(r.ratio, r.mom, st.fine);
    if (!mi) { tip.hidden = true; return; }
    const info = infoTitolo(t, c.g);
    const giorni = c.g.calendario === "crypto";
    const unita = st.barre === "settimanali" ? (mi.durata === 1 ? "settimana" : "settimane") : giorni ? (mi.durata === 1 ? "giorno" : "giorni") : (mi.durata === 1 ? "seduta" : "sedute");
    tip.innerHTML = `<div class="d">${esc(info.breve)} <span class="muted">· ${esc(t)}</span>${info.nome !== info.breve ? `<small class="sub-line">${esc(info.nome)}</small>` : ""}</div>
      <div class="r"><span>Quadrante</span><span class="quad-pill" style="--c:var(--q-${mi.quadrante})">${NOMI_Q[mi.quadrante]}</span></div>
      <div class="r"><span>RS-Ratio</span><span>${num(mi.ratio, 2)}</span></div>
      <div class="r"><span>RS-Momentum</span><span>${num(mi.mom, 2)}</span></div>
      ${mi.direzione != null ? `<div class="r"><span>Direzione</span><span>${num(mi.direzione, 0)}° ${mi.bussola}</span></div>` : ""}
      <div class="r"><span>Nel quadrante da</span><span>${mi.durata} ${unita}</span></div>`;
    tip.hidden = false;
    const el = box.querySelector(`.rt[data-t="${CSS.escape(t)}"] .rt-head`);
    if (!el) return;
    const rb = box.getBoundingClientRect(), re = el.getBoundingClientRect();
    const cx = re.left + re.width / 2 - rb.left, cy = re.top + re.height / 2 - rb.top;
    const left = cx + 18 + tip.offsetWidth > rb.width ? cx - 18 - tip.offsetWidth : cx + 18;
    tip.style.left = Math.max(0, left) + "px";
    tip.style.top = Math.max(0, Math.min(rb.height - tip.offsetHeight, cy - tip.offsetHeight / 2)) + "px";
  }

  function righeRotazione(c) {
    return c.titoli.map(t => {
      const r = c.serie[t];
      const mi = Rot.misure(r.ratio, r.mom, st.fine);
      return { t, info: infoTitolo(t, c.g), m: mi };
    }).filter(x => x.m);
  }

  function disegnaTabella(c) {
    const { col, dir } = st.ordine;
    const th = (k, lab, left) => `<th class="sortable${left ? " l" : ""}" data-col="${k}" aria-sort="${col === k ? (dir > 0 ? "ascending" : "descending") : "none"}">${lab}</th>`;
    const attivo = st.passaggio || st.evidenza;
    if (st.prezzi) {
      const iEnd = c.ib[st.fine];
      const riga = (t, bench) => {
        const serie = t === "PTF" ? c.bench : c.px.serie[t];
        const pz = Rot.prezzi(c.px.date.slice(0, iEnd + 1), serie.slice(0, iEnd + 1), passiDi(c.g));
        return { t, info: t === "PTF" ? { breve: "PTF", nome: "Portafoglio di riferimento" } : infoTitolo(t, c.g), p: pz, bench };
      };
      const righe = c.titoli.map(t => riga(t, false)).filter(x => x.p);
      const key = ["ultimo", "w1", "m1", "m3", "m6", "ytd", "a1", "dd52", "vsM200"].includes(col) ? col : "m3";
      righe.sort((a, b) => col === "t" ? dir * a.info.breve.localeCompare(b.info.breve) : ((b.p[key] ?? -1e9) - (a.p[key] ?? -1e9)) * (dir > 0 ? -1 : 1) * -1);
      const b = riga(c.benchKey, true);
      if (b.p) righe.push(b);
      const td = v => `<td class="${cls(v)}">${pct(v, 1)}</td>`;
      $("#rot-tabella").innerHTML = `<thead><tr>${th("t", "Titolo", true)}${th("ultimo", "Ultimo")}${th("w1", "1S")}${th("m1", "1M")}${th("m3", "3M")}${th("m6", "6M")}${th("ytd", "Anno")}${th("a1", "1A")}${th("dd52", "DD 52s")}${th("vsM200", "vs M200")}</tr></thead><tbody>` +
        righe.map(x => `<tr data-t="${x.t}" class="${x.bench ? "bench-row" : ""}${attivo === x.t ? " hl" : ""}">
          <td class="l"><b>${esc(x.info.breve)}</b>${x.bench ? ' <span class="tag">confronto</span>' : ""}<small class="sub-line">${esc(c.g.fonte ? x.info.nome : x.t)}</small></td>
          <td>${num(x.p.ultimo, x.p.ultimo >= 100 ? 2 : 3)}</td>${td(x.p.w1)}${td(x.p.m1)}${td(x.p.m3)}${td(x.p.m6)}${td(x.p.ytd)}${td(x.p.a1)}
          <td class="${cls(x.p.dd52)}">${pct(x.p.dd52, 1)}</td>${td(x.p.vsM200)}
        </tr>`).join("") + "</tbody>";
      return;
    }
    const righe = righeRotazione(c);
    const val = (x, k) => k === "t" ? x.info.breve : k === "quadrante" ? ORDINE_Q[x.m.quadrante] * 1000 - x.m.distanza : x.m[k];
    righe.sort((a, b) => {
      const va = val(a, col), vb = val(b, col);
      if (typeof va === "string") return dir * va.localeCompare(vb);
      if (va == null) return 1; if (vb == null) return -1;
      return dir * (va - vb);
    });
    const delta = v => v == null ? "" : `<small class="${cls(v)}">${R.segnato(v, 2)}</small>`;
    const unita = st.barre === "settimanali" ? "sett." : c.g.calendario === "crypto" ? "giorni" : "sedute";
    $("#rot-tabella").innerHTML = `<thead><tr>${th("t", "Titolo", true)}${th("quadrante", "Quadrante", true)}${th("ratio", "RS-Ratio")}${th("mom", "RS-Mom.")}${th("direzione", "Direzione")}${th("velocita", "Velocità")}${th("distanza", "Distanza")}${th("durata", "Da")}<th class="l">Prima</th></tr></thead><tbody>` +
      righe.map(x => {
        const m = x.m;
        return `<tr data-t="${x.t}" class="${attivo === x.t ? "hl" : ""}">
          <td class="l"><span class="tk-cell"><span class="qdot" style="--c:var(--q-${m.quadrante})"></span><span><b>${esc(x.info.breve)}</b><small class="sub-line">${esc(c.g.fonte ? x.info.nome : x.t)}</small></span></span></td>
          <td class="l"><span class="quad-pill" style="--c:var(--q-${m.quadrante})">${NOMI_Q[m.quadrante]}</span></td>
          <td>${num(m.ratio, 2)} ${delta(m.dRatio)}</td>
          <td>${num(m.mom, 2)} ${delta(m.dMom)}</td>
          <td>${m.direzione == null ? "—" : `${num(m.direzione, 0)}° <small class="muted">${m.bussola}</small>${R.freccia(m.direzione)}`}</td>
          <td>${num(m.velocita, 2)}</td>
          <td>${num(m.distanza, 2)}</td>
          <td>${m.durata} <small class="muted">${unita}</small></td>
          <td class="l">${m.precedente ? `<span class="quad-pill small" style="--c:var(--q-${m.precedente})">${NOMI_Q[m.precedente]}</span>` : "—"}</td>
        </tr>`;
      }).join("") + "</tbody>";
  }

  function disegnaPortafoglio(c) {
    const box = $("#rot-portafoglio");
    const g = c.g;
    if (!g.portafoglio) { box.hidden = true; return; }
    box.hidden = false;
    const def = g.portafoglio.pesi;
    const pesi = pesiPortafoglio(g);
    const tot = Object.values(pesi).reduce((a, b) => a + (Number(b) || 0), 0);
    const oggi = c.ptf ? c.ptf.pesiOggi : PF.calcola(c.px.date, c.px.serie, pesi).pesiOggi;
    const ptfInfo = c.ptf || PF.calcola(c.px.date, c.px.serie, pesi);
    const ultimoRib = ptfInfo.ultimoRibilanciamento != null ? c.px.date[ptfInfo.ultimoRibilanciamento] : null;
    const modificato = Object.keys(def).some(k => Number(pesi[k]) !== Number(def[k]));
    const classi = (g.portafoglio.classi || []).map(cl => {
      const obiettivo = cl.titoli.reduce((a, t) => a + (Number(pesi[t]) || 0), 0) / (tot || 1) * 100;
      const attuale = cl.titoli.reduce((a, t) => a + (oggi[t] || 0), 0);
      return `<div class="pf-class"><span>${esc(cl.nome)}</span><b>${num(obiettivo, 0)}%</b><small>oggi ${num(attuale, 1)}%</small>
        <div class="pf-bar"><i style="width:${Math.min(100, obiettivo)}%"></i><u style="left:${Math.min(100, attuale)}%"></u></div></div>`;
    }).join("");
    box.innerHTML = `
      <div class="card-head">
        <div class="card-title"><h2>${esc(g.portafoglio.nome || "Portafoglio di riferimento")} (PTF)</h2></div>
        <div class="controls">
          ${Math.abs(tot - 100) > 0.01 ? `<button class="btn-link" type="button" id="pf-100">Porta a 100%</button>` : ""}
          ${modificato ? `<button class="btn-link" type="button" id="pf-reset">Ripristina l'esempio</button>` : ""}
        </div>
      </div>
      <p class="sub">È il termine di confronto delle asset class: un portafoglio misto che torna ai pesi obiettivo l'ultimo giorno di ogni mese${ultimoRib ? ` (ultimo ribilanciamento: ${dataIt(ultimoRib)})` : ""}.
        I pesi di oggi si sono spostati con i prezzi. Cambiando un peso, il portafoglio si ricalcola su tutta la storia${c.benchKey === "PTF" ? " e il grafico si aggiorna" : ""}.
        ${Math.abs(tot - 100) > 0.01 ? `<b>Il totale è ${num(tot, 0)}%: i pesi valgono in proporzione.</b>` : ""}</p>
      <div class="pf-classes">${classi}</div>
      <div class="table-wrap"><table class="tbl pf-tbl"><thead><tr><th class="l">Componente</th><th class="l">Peso obiettivo</th><th></th><th>Oggi</th></tr></thead><tbody>
        ${Object.keys(def).map(t => {
          const info = infoTitolo(t, g);
          const w = Number(pesi[t]) || 0;
          return `<tr data-t="${t}">
            <td class="l"><b>${esc(info.breve)}</b><small class="sub-line">${esc(info.nome)}</small></td>
            <td class="l pf-slider"><input type="range" min="0" max="60" step="1" value="${w}" data-peso="${t}" aria-label="Peso di ${esc(info.breve)}"></td>
            <td><input class="pf-num" type="number" min="0" max="100" step="1" value="${w}" data-peso="${t}" aria-label="Peso di ${esc(info.breve)} in percentuale">%</td>
            <td>${num(oggi[t], 1)}%</td>
          </tr>`;
        }).join("")}
      </tbody></table></div>
      <p class="small">I pesi scelti restano solo in questo browser.</p>`;
  }

  function disegnaPerformance(c) {
    const box = $("#perf-grafico");
    const leg = $("#perf-legenda");
    if (leg) leg.innerHTML = `<span class="muted">Colore = quadrante di oggi</span>` +
      ["leader", "miglioramento", "indebolimento", "ritardo"].map(k => `<span><i class="sw" style="background:var(--q-${k})"></i>${NOMI_Q[k]}</span>`).join("") +
      `<span><i class="sw dash" style="color:var(--ink)"></i>${esc(c.benchKey === "PTF" ? "Portafoglio (PTF)" : nomeBench(c.benchKey, c.g))}</span>`;
    const iEnd = c.ib[st.fine];
    const i0 = Math.max(0, iEnd - barreDi(c.g, st.periodo));
    const W = Math.max(320, box.clientWidth || 900), H = W < 600 ? 280 : 340;
    const m = { l: 44, r: W < 600 ? 112 : 172, t: 12, b: 28 };
    const pw = W - m.l - m.r, ph = H - m.t - m.b;
    const linee = c.titoli.map(t => ({ t, info: infoTitolo(t, c.g), v: c.px.serie[t] }));
    linee.push({ t: c.benchKey, info: c.benchKey === "PTF" ? { breve: "PTF" } : infoTitolo(c.benchKey, c.g), v: c.bench, bench: true });
    const norm = l => {
      let base = null;
      const out = [];
      for (let i = i0; i <= iEnd; i++) {
        const v = l.v[i];
        if (v == null) { out.push(null); continue; }
        if (base == null) base = v;
        out.push((v / base) * 100);
      }
      return out;
    };
    linee.forEach(l => { l.n = norm(l); });
    let lo = Infinity, hi = -Infinity;
    for (const l of linee) for (const v of l.n) if (v != null) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    if (!isFinite(lo)) { box.innerHTML = ""; return; }
    const pad = (hi - lo) * 0.06 || 1;
    lo -= pad; hi += pad;
    const n = iEnd - i0;
    const X = k => m.l + (k / Math.max(1, n)) * pw;
    const Y = v => m.t + ((hi - v) / (hi - lo)) * ph;
    const root = svg("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", role: "img", "aria-label": "Andamento base 100" });
    const passo = [1, 2, 5, 10, 20, 25, 50, 100].find(s => (hi - lo) / s <= 6) || 100;
    for (let v = Math.ceil(lo / passo) * passo; v <= hi; v += passo) {
      root.append(svg("line", { x1: m.l, x2: m.l + pw, y1: Y(v), y2: Y(v), class: v === 100 ? "rg-axis" : "rg-grid" }));
      root.append(svg("text", { x: m.l - 6, y: Y(v) + 4, "text-anchor": "end", class: "rg-tick" }, num(v, 0)));
    }
    // etichette delle date
    const date = c.px.date;
    const step = Math.max(1, Math.round(n / 6));
    for (let k = 0; k <= n; k += step) root.append(svg("text", { x: X(k), y: H - 8, "text-anchor": "middle", class: "rg-tick" }, R.dataBreve(date[i0 + k])));
    const attivo = st.passaggio || st.evidenza;
    const ordinati = linee.slice().sort((a, b) => ((a.t === attivo) + (a.bench ? 0.5 : 0)) - ((b.t === attivo) + (b.bench ? 0.5 : 0)));
    const finali = [];
    for (const l of ordinati) {
      const d = [];
      l.n.forEach((v, k) => { if (v == null) return; d.push(`${d.length ? "L" : "M"}${X(k).toFixed(1)},${Y(v).toFixed(1)}`); });
      if (!d.length) continue;
      const r = c.serie[l.t];
      const qd = r ? Rot.quadrante(r.ratio[st.fine], r.mom[st.fine]) : null;
      const colore = l.bench ? "var(--ink)" : qd ? `var(--q-${qd})` : "var(--muted)";
      const on = attivo === l.t;
      root.append(svg("path", {
        d: d.join(""), class: "pf-line" + (l.bench ? " bench" : "") + (attivo && !on && !l.bench ? " dim" : "") + (on ? " on" : ""),
        style: `stroke:${colore}`, "data-t": l.t,
      }));
      root.append(svg("path", { d: d.join(""), class: "pf-hit", "data-t": l.t }));
      const ultimo = l.n.length - 1 - l.n.slice().reverse().findIndex(v => v != null);
      const nomeBreve = l.info.breve.length > 13 ? l.info.breve.slice(0, 12) + "…" : l.info.breve;
      finali.push({ x: X(ultimo), y0: Y(l.n[ultimo]), y: Y(l.n[ultimo]), nome: nomeBreve, colore, bench: !!l.bench, t: l.t, v: l.n[ultimo] });
    }
    // etichette solo dove servono: confronto, titolo evidenziato, il migliore e il peggiore
    const altri = finali.filter(f => !f.bench).sort((a, b) => b.v - a.v);
    const scelti = new Set([c.benchKey]);
    if (attivo) scelti.add(attivo);
    if (altri.length) { scelti.add(altri[0].t); scelti.add(altri[altri.length - 1].t); }
    const etichette = finali.filter(f => scelti.has(f.t)).sort((a, b) => a.y - b.y);
    for (let k = 1; k < etichette.length; k++) if (etichette[k].y - etichette[k - 1].y < 16) etichette[k].y = etichette[k - 1].y + 16;
    const sfora = etichette.length ? etichette[etichette.length - 1].y - (m.t + ph) : 0;
    if (sfora > 0) etichette.forEach(f => { f.y -= sfora; });
    for (const f of etichette) {
      root.append(svg("path", { d: `M${f.x + 4},${f.y0}L${m.l + pw + 8},${f.y0}L${m.l + pw + 14},${f.y}L${m.l + pw + 18},${f.y}`, class: "pf-lead" }));
      root.append(svg("circle", { cx: f.x, cy: f.y0, r: 3.5, class: "pf-end-dot", style: `fill:${f.colore}` }));
      root.append(svg("text", { x: m.l + pw + 22, y: f.y + 4, class: "pf-end" + (f.bench ? " b" : ""), "data-t": f.t },
        [svg("tspan", null, f.nome + " "), svg("tspan", { class: "pf-end-v " + cls(f.v - 100) }, `${R.segnato(f.v - 100, 1)}%`)]));
    }
    // cursore
    const cursore = svg("line", { x1: 0, x2: 0, y1: m.t, y2: m.t + ph, class: "pf-cursor", visibility: "hidden" });
    root.append(cursore);
    box.innerHTML = "";
    box.append(root);
    let tip = box.querySelector(".chart-tip");
    if (!tip) { tip = document.createElement("div"); tip.className = "chart-tip"; tip.hidden = true; box.append(tip); }
    root.addEventListener("mousemove", ev => {
      const rect = root.getBoundingClientRect();
      const x = ((ev.clientX - rect.left) / rect.width) * W;
      const k = Math.max(0, Math.min(n, Math.round(((x - m.l) / pw) * n)));
      cursore.setAttribute("x1", X(k)); cursore.setAttribute("x2", X(k)); cursore.setAttribute("visibility", "visible");
      const vals = linee.map(l => ({ l, v: l.n[k] })).filter(o => o.v != null).sort((a, b) => b.v - a.v);
      tip.innerHTML = `<div class="d">${dataIt(date[i0 + k])}</div>` + vals.map(o => `<div class="r${o.l.bench ? " b" : ""}"><span>${esc(o.l.info.breve)}</span><span class="${cls(o.v - 100)}">${R.segnato(o.v - 100, 1)}%</span></div>`).join("");
      tip.hidden = false;
      const px = (X(k) / W) * rect.width;
      tip.style.left = (px + 16 + tip.offsetWidth > rect.width ? px - tip.offsetWidth - 16 : px + 16) + "px";
    });
    root.addEventListener("mouseleave", () => { cursore.setAttribute("visibility", "hidden"); tip.hidden = true; });
  }

  // ---------------- interazione ----------------

  function evidenzia(t, fisso) {
    const prima = st.passaggio || st.evidenza;
    if (fisso) { st.evidenza = st.evidenza === t ? null : t; R.emit("selezione"); }
    else st.passaggio = t;
    if (!st.calc) return;
    // aggiornamento leggero: classi sul grafico e sulle tabelle
    const attivo = st.passaggio || st.evidenza;
    if (attivo === prima) return;
    R.$$("#rot-grafico .rt, #rot-grafico .rt-label").forEach(el => {
      el.classList.toggle("dim", !!attivo && el.dataset.t !== attivo);
      el.classList.toggle("on", !!attivo && el.dataset.t === attivo);
    });
    R.$$("#rot-grafico .rt-head").forEach(el => el.setAttribute("r", el.parentNode.dataset.t === attivo ? 7.5 : 6));
    R.$$("#rot-tabella tr[data-t], #rot-portafoglio tr[data-t]").forEach(el => el.classList.toggle("hl", el.dataset.t === attivo));
    // l'andamento si ridisegna, così compare l'etichetta del titolo evidenziato
    disegnaPerformance(st.calc);
    // porta la testa evidenziata in primo piano
    const g = attivo && R.$(`#rot-grafico .rt[data-t="${CSS.escape(attivo)}"]`);
    if (g) g.parentNode.insertBefore(g, g.parentNode.querySelector("g:last-of-type"));
  }

  function ferma() {
    if (st.play) { clearInterval(st.play); st.play = null; $("#rot-play").innerHTML = ICONA_PLAY; }
  }

  function spostaFine(delta) {
    if (!st.calc || st.fine == null) return;
    st.fine = Math.max(st.calc.primo, Math.min(st.calc.ultimo, st.fine + delta));
    ridisegnaRapido();
  }

  function ridisegnaRapido() {
    const c = st.calc;
    if (!c) return;
    disegnaControlli(c);
    disegnaGrafico(c);
    disegnaTabella(c);
    disegnaPerformance(c);
  }

  function animazione() {
    if (st.play) { clearInterval(st.play); st.play = null; $("#rot-play").innerHTML = ICONA_PLAY; return; }
    const c = st.calc;
    if (!c) return;
    const giro = st.barre === "settimanali" ? 52 : barreDi(c.g, 126);
    if (st.fine >= c.ultimo) st.fine = Math.max(c.primo, c.ultimo - giro);
    $("#rot-play").innerHTML = ICONA_PAUSA;
    st.play = setInterval(() => {
      if (!st.visibile || !st.calc || st.fine == null || st.fine >= st.calc.ultimo) { ferma(); return; }
      st.fine++;
      ridisegnaRapido();
    }, st.barre === "settimanali" ? 320 : 110);
  }

  function salva() {
    R.store.set("rot.universi", st.universi); R.store.set("rot.universo", st.universo); R.store.set("rot.bench", st.bench); R.store.set("rot.barre", st.barre);
    R.store.set("rot.formula", st.formula); R.store.set("rot.coda", st.coda); R.store.set("rot.scala", st.scala);
    R.store.set("rot.prezzi", st.prezzi); R.store.set("rot.periodo", st.periodo); R.store.set("rot.ordine", st.ordine);
  }

  function cambia(fn, ricalcolo = true) {
    if (ricalcolo) ferma();
    fn();
    salva();
    if (ricalcolo) { st.fine = null; disegna(); } else ridisegnaRapido();
  }

  function init() {
    $("#rot-universo").addEventListener("click", e => {
      const b = e.target.closest("button[data-v]");
      if (b && gruppiZona(st.zona).some(g => g.id === b.dataset.v)) cambia(() => { st.universo = b.dataset.v; st.evidenza = null; st.passaggio = null; });
    });
    $("#rot-bench").addEventListener("change", e => cambia(() => { st.bench[gruppo().id] = e.target.value; }));
    $("#rot-barre").addEventListener("click", e => { const b = e.target.closest("button[data-v]"); if (b) cambia(() => { st.barre = b.dataset.v; }); });
    $("#rot-formula").addEventListener("change", e => cambia(() => { st.formula = e.target.value; }));
    $("#rot-scala").addEventListener("click", e => { const b = e.target.closest("button[data-v]"); if (b) cambia(() => { st.scala = b.dataset.v; }, false); });
    $("#rot-coda").addEventListener("input", e => cambia(() => { st.coda = Number(e.target.value); }, false));
    $("#rot-prezzi").addEventListener("change", e => cambia(() => {
      st.prezzi = e.target.checked;
      st.ordine = st.prezzi ? { col: "m3", dir: -1 } : { col: "quadrante", dir: 1 };
    }, false));
    $("#perf-periodo").addEventListener("click", e => { const b = e.target.closest("button[data-v]"); if (b) cambia(() => { st.periodo = Number(b.dataset.v); }, false); });
    $("#rot-tempo").addEventListener("input", e => { st.fine = Number(e.target.value); ridisegnaRapido(); });
    $("#rot-prima").addEventListener("click", () => spostaFine(-1));
    $("#rot-dopo").addEventListener("click", () => spostaFine(1));
    $("#rot-play").addEventListener("click", animazione);

    const sopra = e => { const el = e.target.closest("[data-t]"); evidenzia(el ? el.dataset.t : null, false); };
    $("#rot-grafico").addEventListener("mouseover", e => {
      const el = e.target.closest("[data-t]");
      evidenzia(el ? el.dataset.t : null, false);
      mostraTip(el ? el.dataset.t : null);
    });
    $("#rot-grafico").addEventListener("mouseleave", () => { evidenzia(null, false); mostraTip(null); });
    $("#rot-grafico").addEventListener("focusin", e => { const el = e.target.closest("[data-t]"); if (el) mostraTip(el.dataset.t); });
    $("#rot-grafico").addEventListener("focusout", () => mostraTip(null));
    $("#rot-grafico").addEventListener("click", e => { const el = e.target.closest("[data-t]"); if (el) evidenzia(el.dataset.t, true); });
    $("#rot-grafico").addEventListener("keydown", e => { if (e.key === "Enter") { const el = e.target.closest("[data-t]"); if (el) evidenzia(el.dataset.t, true); } });
    $("#rot-tabella").addEventListener("mouseover", sopra);
    $("#rot-tabella").addEventListener("mouseleave", () => evidenzia(null, false));
    $("#rot-tabella").addEventListener("click", e => {
      const th = e.target.closest("th[data-col]");
      if (th) {
        const col = th.dataset.col;
        st.ordine = { col, dir: st.ordine.col === col ? -st.ordine.dir : (col === "t" || col === "quadrante" ? 1 : -1) };
        salva(); disegnaTabella(st.calc); return;
      }
      const tr = e.target.closest("tr[data-t]");
      if (tr) evidenzia(tr.dataset.t, true);
    });
    $("#perf-grafico").addEventListener("mouseover", e => { const el = e.target.closest(".pf-hit, .pf-end"); evidenzia(el ? el.dataset.t : null, false); });
    $("#perf-grafico").addEventListener("mouseleave", () => evidenzia(null, false));

    // portafoglio
    const aggiornaPeso = R.debounce(() => { disegna(); }, 160);
    $("#rot-portafoglio").addEventListener("input", e => {
      const k = e.target.dataset.peso;
      if (!k) return;
      const g = gruppo();
      const pesi = pesiPortafoglio(g);
      pesi[k] = Math.max(0, Math.min(100, Number(e.target.value) || 0));
      st.pesi = pesi;
      R.store.set("rot.pesi", st.pesi);
      R.$$(`#rot-portafoglio [data-peso="${CSS.escape(k)}"]`).forEach(el => { if (el !== e.target) el.value = pesi[k]; });
      aggiornaPeso();
    });
    $("#rot-portafoglio").addEventListener("click", e => {
      const g = gruppo();
      if (e.target.id === "pf-reset") { st.pesi = null; R.store.set("rot.pesi", null); disegna(); }
      if (e.target.id === "pf-100") {
        const pesi = pesiPortafoglio(g);
        const tot = Object.values(pesi).reduce((a, b) => a + b, 0) || 1;
        const chiavi = Object.keys(pesi);
        const nuovi = {};
        chiavi.forEach(k => { nuovi[k] = Math.round((pesi[k] / tot) * 100); });
        const diff = 100 - Object.values(nuovi).reduce((a, b) => a + b, 0);
        const piuGrande = chiavi.sort((a, b) => nuovi[b] - nuovi[a])[0];
        nuovi[piuGrande] += diff;
        st.pesi = nuovi; R.store.set("rot.pesi", st.pesi); disegna();
      }
    });
    $("#rot-portafoglio").addEventListener("mouseover", sopra);
    $("#rot-portafoglio").addEventListener("mouseleave", () => evidenzia(null, false));

    R.on("tema", () => { if (st.visibile) ridisegnaRapido(); });
    window.addEventListener("resize", R.debounce(() => { if (st.visibile) ridisegnaRapido(); }, 200));
  }

  const NOMI_ZONE = { usa: "USA", eur: "Europa", cry: "Crypto" };

  async function mostra(param, ctx) {
    st.visibile = true;
    const zona = ctx && NOMI_ZONE[ctx.zona] ? ctx.zona : "usa";
    if (zona !== st.zona) {
      ferma();
      st.zona = zona; st.fine = null; st.evidenza = null; st.passaggio = null; st.calc = null;
      if (st.u) disegnaUniversi(gruppo());
    }
    document.title = `${NOMI_ZONE[zona]} · Rotazione · Radar Settori`;
    await disegna();
  }

  function nascondi() {
    st.visibile = false;
    ferma();
  }

  function tasto(e) {
    if (e.key === "ArrowLeft") { spostaFine(-1); return true; }
    if (e.key === "ArrowRight") { spostaFine(1); return true; }
    if (e.key === " " || e.code === "Space") { animazione(); return true; }
    if (e.key === "Escape" && (st.evidenza || st.passaggio)) { st.passaggio = null; evidenzia(null, true); st.evidenza = null; evidenzia(null, false); return true; }
    return false;
  }

  // ---------- testo per la chat: quello che mostra la pagina della rotazione ----------
  function contesto() {
    const c = st.calc;
    if (!c) return "## Pagina aperta: Rotazione\nI prezzi della rotazione non sono ancora caricati.";
    const g = c.g;
    const iEnd = c.ib[st.fine];
    const data = c.px.date[iEnd];
    const provv = c.barre.provvisoria && st.fine === c.ultimo;
    const calcolo = { nuova: "calcolo nuovo (log del rapporto, medie esponenziali 10/30 divise per la volatilità)", semplice: "medie semplici (10/30 e 9)", classica: "calcolo classico (scarti standardizzati su 26 barre)" }[st.formula];
    const unita = st.barre === "settimanali" ? "settimane" : g.calendario === "crypto" ? "giorni" : "sedute";
    const unita1 = st.barre === "settimanali" ? "settimana" : g.calendario === "crypto" ? "giorno" : "seduta";
    const out = [];
    out.push(`## Pagina aperta: Rotazione relativa · ${g.nome} contro ${nomeBench(c.benchKey, g)}`);
    out.push("La pagina mostra il grafico di rotazione relativa: ogni titolo è un punto con la sua scia; asse orizzontale RS-Ratio (sopra 100 fa meglio del confronto), " +
      "asse verticale RS-Momentum (sopra 100 il vantaggio cresce). Quadranti: Leader (in alto a destra), In indebolimento (in basso a destra), In ritardo (in basso a sinistra), " +
      "In miglioramento (in alto a sinistra); di solito si gira in senso orario. Sotto: tabella di posizione e movimento, andamento base 100 e, per le asset class, il portafoglio di riferimento.");
    out.push(`Impostazioni: barre ${st.barre}, ${calcolo}, data mostrata ${dataIt(data)}${provv ? " (settimana in corso: l'ultimo punto è provvisorio)" : ""}, scia di ${st.coda} barre, ${g.nota || `prezzi in ${g.mercato === "usa" ? "dollari" : "euro"} con dividendi`}.`);
    const attivo = st.passaggio || st.evidenza;
    if (attivo) out.push(`Titolo evidenziato ora: ${infoTitolo(attivo, g).breve} (${attivo}).`);
    out.push(`Posizione e movimento: nome | ticker | quadrante | RS-Ratio (variazione nell'ultima barra) | RS-Momentum (variazione) | direzione in gradi di bussola | velocità | distanza dal centro | barre nel quadrante | quadrante precedente`);
    const righe = righeRotazione(c).sort((a, b) => (ORDINE_Q[a.m.quadrante] - ORDINE_Q[b.m.quadrante]) || (b.m.distanza - a.m.distanza));
    for (const x of righe) {
      const m = x.m;
      out.push(`${x.info.breve} | ${x.t} | ${NOMI_Q[m.quadrante]} | ${num(m.ratio, 2)} (${R.segnato(m.dRatio, 2)}) | ${num(m.mom, 2)} (${R.segnato(m.dMom, 2)}) | ` +
        `${m.direzione == null ? "—" : `${num(m.direzione, 0)}° ${m.bussola}`} | ${num(m.velocita, 2)} | ${num(m.distanza, 2)} | ${m.durata} ${m.durata === 1 ? unita1 : unita} | ${m.precedente ? NOMI_Q[m.precedente] : "—"}`);
    }
    out.push("Scia di ogni titolo, dal punto più vecchio al più recente (RS-Ratio; RS-Momentum):");
    for (const t of c.titoli) {
      const pts = puntiCoda(c, t);
      if (pts.length) out.push(`- ${infoTitolo(t, g).breve}: ${pts.map(p => `${num(p[0], 1)};${num(p[1], 1)}`).join(" → ")}`);
    }
    out.push("Prezzi fino alla data mostrata: nome | ultimo | 1 settimana | 1 mese | 3 mesi | 6 mesi | da inizio anno | 1 anno | dal massimo a 52 settimane | sulla media 200");
    const riga = (t, info, serie) => {
      const p = Rot.prezzi(c.px.date.slice(0, iEnd + 1), serie.slice(0, iEnd + 1), passiDi(g));
      if (p) out.push(`${info.breve} (${t}) | ${num(p.ultimo, 2)} | ${pct(p.w1, 1)} | ${pct(p.m1, 1)} | ${pct(p.m3, 1)} | ${pct(p.m6, 1)} | ${pct(p.ytd, 1)} | ${pct(p.a1, 1)} | ${pct(p.dd52, 1)} | ${pct(p.vsM200, 1)}`);
    };
    for (const t of c.titoli) riga(t, infoTitolo(t, g), c.px.serie[t]);
    riga(c.benchKey, c.benchKey === "PTF" ? { breve: "Portafoglio di riferimento" } : infoTitolo(c.benchKey, g), c.bench);
    const periodo = { 63: "3 mesi", 126: "6 mesi", 252: "1 anno", 504: "2 anni" }[st.periodo] || `${st.periodo} sedute`;
    out.push(`Il grafico «Andamento, base 100» mostra gli ultimi ${periodo} fino alla data mostrata.`);
    if (g.portafoglio) {
      const pesi = pesiPortafoglio(g);
      const oggi = (c.ptf || PF.calcola(c.px.date, c.px.serie, pesi)).pesiOggi;
      out.push("Portafoglio di riferimento (PTF), ribilanciato a fine mese: componente | peso obiettivo | peso di oggi");
      for (const t of Object.keys(g.portafoglio.pesi)) out.push(`${infoTitolo(t, g).breve} (${t}) | ${num(Number(pesi[t]) || 0, 0)}% | ${num(oggi[t], 1)}%`);
    }
    return out.join("\n");
  }

  // usato dalla barra dei comandi
  async function apri(opzioni) {
    ferma();
    if (!st.u) st.u = await R.dati.universi();
    const g0 = gruppi();
    const g = g0.find(x => x.id === (opzioni.universo || st.universo)) || g0[0];
    st.zona = g.zona;
    st.universo = g.id;
    if (opzioni.bench && g.benchmark.includes(opzioni.bench)) st.bench[g.id] = opzioni.bench;
    if (opzioni.evidenzia) {
      st.evidenza = opzioni.evidenzia;
      // se il titolo è il confronto attuale, se ne sceglie un altro
      if (benchDi(g) === opzioni.evidenzia) st.bench[g.id] = g.benchmark.find(b => b !== opzioni.evidenzia) || benchDi(g);
    }
    st.fine = null;
    salva();
    const hash = `#${g.zona}/rotazione`;
    if (location.hash !== hash) R.vai(hash);
    else if (st.visibile) disegna();
  }

  // per la casella di ricerca: gli universi di universi.json (quelli calcolati si cercano nelle loro zone)
  R.viste.rot = { init, mostra, nascondi, tasto, apri, contesto, gruppi: async () => { if (!st.u) st.u = await R.dati.universi(); return gruppi().filter(g => !g.fonte); } };
})();
