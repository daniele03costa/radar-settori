/*
 * Radar Settori — vista 6: I miei titoli.
 * La lista sta nel file miei-titoli.txt del repository; l'aggiornamento automatico scarica i prezzi
 * (data/prezzi_miei.json). Per ogni titolo: trend sulle medie, calo dal massimo, forza relativa
 * contro il mercato e, per le azioni dell'S&P 500, lo stato del loro settore.
 */
(function () {
  "use strict";

  const R = window.Radar, S = window.Signals, Rot = window.Rotazione, Cal = window.Calendario;
  const { $, num, pct, esc, svg, dataIt, cls } = R;
  const NOMI_Q = { leader: "Leader", indebolimento: "In indebolimento", ritardo: "In ritardo", miglioramento: "In miglioramento" };
  const ORDINE_Q = { leader: 0, miglioramento: 1, indebolimento: 2, ritardo: 3 };
  const SIMBOLI = { USD: "$", EUR: "€", GBp: "p", CHF: "CHF", DKK: "DKK", SEK: "SEK", NOK: "NOK", CAD: "C$", JPY: "¥", HKD: "HK$", AUD: "A$" };
  const PERIODI = { 126: "6 mesi", 252: "1 anno", 504: "2 anni", 756: "3 anni" };
  const BORSE = {
    MI: "Borsa di Milano", DE: "Xetra", F: "Borsa di Francoforte", PA: "Borsa di Parigi", AS: "Borsa di Amsterdam",
    MC: "Borsa di Madrid", BR: "Borsa di Bruxelles", LS: "Borsa di Lisbona", VI: "Borsa di Vienna", HE: "Borsa di Helsinki",
    IR: "Borsa di Dublino", L: "Borsa di Londra", SW: "Borsa di Zurigo", CO: "Borsa di Copenaghen", ST: "Borsa di Stoccolma",
    OL: "Borsa di Oslo", TO: "Borsa di Toronto", T: "Borsa di Tokyo", HK: "Borsa di Hong Kong", AX: "Borsa di Sydney",
  };

  const st = {
    visibile: false,
    dati: null,
    righe: [],
    ordine: R.store.get("tit.ordine", { col: "vs200", dir: -1 }),
    periodo: R.store.get("tit.periodo", 252),
    aperto: null,
  };

  // indirizzo per modificare la lista su GitHub (il sito è su utente.github.io/repository)
  function linkLista() {
    const h = location.hostname;
    if (h.endsWith(".github.io")) {
      const utente = h.split(".")[0], repo = location.pathname.split("/")[1];
      if (repo) return `https://github.com/${utente}/${repo}/edit/main/miei-titoli.txt`;
    }
    return "miei-titoli.txt";
  }

  const sma = (a, n, i) => {
    if (i + 1 < n) return null;
    let s = 0;
    for (let k = i - n + 1; k <= i; k++) s += a[k];
    return s / n;
  };
  const varia = (p, i, n) => (i - n >= 0 && p[i - n] ? (p[i] / p[i - n] - 1) * 100 : null);

  // numeri di un titolo, calcolati dalla sua serie di chiusure
  function analizza(x, confronti, mappaSp, tutti) {
    const p = x.prezzi, date = x.date, i = p.length - 1;
    const m200 = sma(p, 200, i), m50 = sma(p, 50, i);
    let max = -Infinity;
    for (let k = Math.max(0, i - 251); k <= i; k++) max = Math.max(max, p[k]);
    const anno = date[i].slice(0, 4);
    let iy = null;
    for (let k = i; k >= 0; k--) if (date[k].slice(0, 4) !== anno) { iy = k; break; }

    // confronto: S&P 500 per le azioni americane, azionario mondiale in euro per le altre
    const b = confronti[x.mercato === "usa" ? "usa" : "europa"] || null;
    let rs = null, rs3 = null, q = null;
    if (b && b.prezzi && b.prezzi.length) {
      q = [];
      let j = 0, ultimo = null;
      for (const d of date) {
        while (j < b.date.length && b.date[j] <= d) { ultimo = b.prezzi[j]; j++; }
        q.push(ultimo);
      }
      const mercato = x.mercato === "usa" ? "nyse" : "milano";
      const barre = Rot.barre(date, "settimanali", d => Cal.successiva(d, mercato));
      const pp = barre.indici.map(k => p[k]), qq = barre.indici.map(k => q[k]);
      const r = Rot.calcola(pp, qq, "nuova");
      rs = Rot.misure(r.ratio, r.mom, pp.length - 1);
      if (rs) rs.provvisoria = barre.provvisoria;
      if (i >= 63 && q[i] && q[i - 63]) rs3 = ((p[i] / q[i]) / (p[i - 63] / q[i - 63]) - 1) * 100;
    }

    // settore, se è un'azione dell'S&P 500
    let settore = null;
    const sp = mappaSp && mappaSp.get(x.t);
    if (sp && tutti && tutti[sp.etf]) {
      const d = tutti[sp.etf];
      const a = R.analisiSync(sp.etf, d);
      const lista = (d.titoli || []).filter(z => z.v200 != null).sort((u, v) => v.v200 - u.v200);
      const posto = lista.findIndex(z => z.t === x.t) + 1;
      const N = d.date.length;
      const tl = R.titoliLivello(d.b200[N - 1], d.n[N - 1], R.livello(sp.etf));
      settore = {
        etf: sp.etf, nome: (R.meta.settori.find(s => s.etf === sp.etf) || {}).nome || sp.etf,
        stato: a.statoOggi || "normale", posto: posto || null, totale: lista.length, tl,
      };
    }
    return {
      x, q, t: x.t, nome: x.nome || (sp && sp.nome) || x.t, valuta: x.valuta, mercato: x.mercato,
      ultimo: p[i], data: date[i],
      g1: varia(p, i, 1), s1: varia(p, i, 5), m1: varia(p, i, 21), m3: varia(p, i, 63), m6: varia(p, i, 126),
      ytd: iy == null ? null : (p[i] / p[iy] - 1) * 100, a1: varia(p, i, 252),
      vs200: m200 ? (p[i] / m200 - 1) * 100 : null, vs50: m50 ? (p[i] / m50 - 1) * 100 : null,
      dd52: (p[i] / max - 1) * 100, rs, rs3,
      confronto: b ? (x.mercato === "usa" ? "S&P 500" : "ACWI") : null,   // si legge «sull'S&P 500», «sull'ACWI»
      settore,
    };
  }

  const prezzo = (v, valuta) => `${num(v, v >= 1000 ? 0 : v >= 100 ? 1 : 2)}<span class="valuta">${SIMBOLI[valuta] || valuta || ""}</span>`;
  const borsa = r => {
    if (r.mercato === "usa") return "Borsa americana";
    const suff = r.t.includes(".") ? r.t.split(".").pop() : "";
    return BORSE[suff] || (suff ? `Borsa ${suff}` : "");
  };
  const collegamento = t => t.includes(".")
    ? `https://finance.yahoo.com/quote/${encodeURIComponent(t)}`
    : `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(t.replace(/-/g, "."))}`;

  // ---------------- tabella ----------------

  function disegnaTabella() {
    const { col, dir } = st.ordine;
    const val = (r, k) => k === "t" ? r.t : k === "rs" ? (r.rs ? ORDINE_Q[r.rs.quadrante] * 1000 - r.rs.ratio : null) : r[k];
    const righe = st.righe.slice().sort((a, b) => {
      const x = val(a, col), y = val(b, col);
      if (typeof x === "string") return dir * x.localeCompare(y);
      if (x == null) return 1;
      if (y == null) return -1;
      return dir * (x - y);
    });
    const th = (k, lab, left) => `<th class="sortable${left ? " l" : ""}" data-col="${k}" aria-sort="${col === k ? (dir > 0 ? "ascending" : "descending") : "none"}">${lab}</th>`;
    const c = R.colori();
    $("#tit-tabella").innerHTML = `<thead><tr>${th("t", "Titolo", true)}<th class="l">Ultimo anno</th>${th("g1", "Ultimo")}${th("m1", "1 mese")}${th("ytd", "Da inizio anno")}${th("vs200", "Media 200")}${th("dd52", "Dal massimo")}${th("rs", "Forza relativa", true)}</tr></thead><tbody>` +
      righe.map(r => {
        const sotto = r.settore
          ? `<span class="st-pill st-${r.settore.stato}">${r.settore.etf} · ${S.STATI[r.settore.stato]}</span>${r.settore.posto ? ` · <span title="${r.settore.posto}° dei ${r.settore.totale} titoli del settore per distanza dalla media 200">${r.settore.posto}° su ${r.settore.totale}</span>` : ""}`
          : esc(borsa(r));
        const rs = r.rs
          ? `<span class="quad" style="--c:var(--q-${r.rs.quadrante})"><i></i>${NOMI_Q[r.rs.quadrante]}</span>${R.freccia(r.rs.direzione)}<small class="sub-line">3 mesi ${pct(r.rs3, 1)} sull'${esc(r.confronto)}</small>`
          : "—";
        return `<tr class="clic${st.aperto === r.t ? " hl" : ""}" data-t="${esc(r.t)}" tabindex="0">
          <td class="l"><span class="tit-nome"><b>${esc(r.t)}</b> <span class="muted">${esc(r.nome)}</span></span><small class="sub-line">${sotto}</small></td>
          <td class="l">${R.sparkline(r.x.prezzi.slice(-252), { colore: c.price })}</td>
          <td>${prezzo(r.ultimo, r.valuta)}<small class="sub-line"><span class="${cls(r.g1)}">${pct(r.g1, 1)}</span> in un giorno</small></td>
          <td class="${cls(r.m1)}">${pct(r.m1, 1)}</td>
          <td class="${cls(r.ytd)}">${pct(r.ytd, 1)}</td>
          <td><span class="${cls(r.vs200)}">${pct(r.vs200, 1)}</span><small class="sub-line">media 50 ${pct(r.vs50, 1)}</small></td>
          <td>${pct(r.dd52, 1)}</td>
          <td class="l">${rs}</td>
        </tr>`;
      }).join("") + "</tbody>";
  }

  // ---------------- dettaglio con grafico ----------------

  function disegnaDettaglio() {
    const box = $("#tit-dettaglio");
    const r = st.righe.find(z => z.t === st.aperto);
    if (!r) { box.hidden = true; box.innerHTML = ""; return; }
    box.hidden = false;
    const cella = (l, v, classe, extra) => `<div class="tit-num${extra ? " " + extra : ""}"><span>${l}</span><b class="${classe || ""}">${v}</b></div>`;
    const set = r.settore;
    box.innerHTML = `
      <div class="card-head">
        <div>
          <div class="card-title"><h2>${esc(r.t)} · ${esc(r.nome)}</h2></div>
          <p class="sub">${set ? `Azione dell'S&amp;P 500, settore <a class="linkish" href="#${set.etf}/${encodeURIComponent(r.t)}">${set.etf} · ${esc(set.nome)}</a>: <span class="st-pill st-${set.stato}">${S.STATI[set.stato]}</span>${set.tl ? `, ${set.tl.sopra} titoli su ${set.tl.n} sopra la media 200` : ""}${set.posto ? `; questo titolo è ${set.posto}° su ${set.totale} per distanza dalla media 200` : ""}.` : esc(borsa(r)) + "."} Chiusura del ${dataIt(r.data)}${r.valuta ? `, prezzi in ${r.valuta === "GBp" ? "pence" : r.valuta}` : ""}.</p>
        </div>
        <div class="controls">
          <div class="seg" id="tit-periodo" role="group" aria-label="Periodo">${Object.entries(PERIODI).map(([k, l]) => `<button type="button" data-v="${k}" aria-pressed="${Number(k) === st.periodo}">${l}</button>`).join("")}</div>
          <a class="btn-link" href="${collegamento(r.t)}" target="_blank" rel="noopener">Grafico completo ↗</a>
          <button class="icon-btn" type="button" id="tit-chiudi" aria-label="Chiudi il dettaglio">×</button>
        </div>
      </div>
      <div class="tit-numeri">
        ${cella("Ultimo", prezzo(r.ultimo, r.valuta))}
        ${cella("1 settimana", pct(r.s1, 1), cls(r.s1))}${cella("1 mese", pct(r.m1, 1), cls(r.m1))}${cella("3 mesi", pct(r.m3, 1), cls(r.m3))}
        ${cella("6 mesi", pct(r.m6, 1), cls(r.m6))}${cella("Da inizio anno", pct(r.ytd, 1), cls(r.ytd))}${cella("1 anno", pct(r.a1, 1), cls(r.a1))}
        ${cella('<span title="Dal massimo delle ultime 52 settimane">Dal massimo</span>', pct(r.dd52, 1))}${cella("Sulla media 200", pct(r.vs200, 1), cls(r.vs200))}${cella("Sulla media 50", pct(r.vs50, 1), cls(r.vs50))}
        ${cella(r.confronto ? `Forza relativa sull'${r.confronto}` : "Forza relativa", r.rs ? `<span class="quad" style="--c:var(--q-${r.rs.quadrante})"><i></i>${NOMI_Q[r.rs.quadrante]}</span>${R.freccia(r.rs.direzione)}` : "—", "", "largo")}
      </div>
      <div class="legend tit-legenda" id="tit-legenda"></div>
      <div class="tit-grafico" id="tit-grafico"></div>`;
    grafico(r);
  }

  function grafico(r) {
    const box = $("#tit-grafico");
    const p = r.x.prezzi, date = r.x.date, N = p.length;
    const i0 = Math.max(0, N - st.periodo), n = N - 1 - i0;
    const m200 = p.map((_, i) => sma(p, 200, i)), m50 = p.map((_, i) => sma(p, 50, i));
    const rsSerie = r.q ? p.map((v, i) => (r.q[i] ? v / r.q[i] : null)) : null;
    const base = rsSerie && rsSerie[i0] ? rsSerie[i0] : null;
    const W = Math.max(320, box.clientWidth || 900);
    const stretto = W < 600;
    const m = { l: 8, r: stretto ? 52 : 64, t: 10, b: 24 };
    const h1 = stretto ? 220 : 280, h2 = rsSerie ? (stretto ? 90 : 110) : 0, gap = rsSerie ? 26 : 0;
    const H = m.t + h1 + gap + h2 + m.b;
    const pw = W - m.l - m.r;
    const X = k => m.l + ((k - i0) / Math.max(1, n)) * pw;
    let lo = Infinity, hi = -Infinity;
    for (let i = i0; i < N; i++) for (const v of [p[i], m50[i], m200[i]]) if (v != null) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    const pad = (hi - lo) * 0.06 || 1;
    lo -= pad; hi += pad;
    const Y = v => m.t + ((hi - v) / (hi - lo)) * h1;
    let rlo = Infinity, rhi = -Infinity;
    if (rsSerie && base) for (let i = i0; i < N; i++) if (rsSerie[i] != null) { const v = (rsSerie[i] / base) * 100; rlo = Math.min(rlo, v); rhi = Math.max(rhi, v); }
    if (isFinite(rlo)) { rlo = Math.min(rlo, 100); rhi = Math.max(rhi, 100); const rp = (rhi - rlo) * 0.1 || 1; rlo -= rp; rhi += rp; }
    const y2 = m.t + h1 + gap;
    const Y2 = v => y2 + ((rhi - v) / (rhi - rlo)) * h2;
    const root = svg("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", role: "img", "aria-label": `Prezzo di ${r.t} con le medie a 50 e 200 sedute` });
    const c = R.colori();
    // griglia e scale
    const passo = (() => { const span = hi - lo, raw = span / 5, e = Math.pow(10, Math.floor(Math.log10(raw))); return [1, 2, 2.5, 5, 10].map(k => k * e).find(s => span / s <= 6) || e * 10; })();
    for (let v = Math.ceil(lo / passo) * passo; v <= hi; v += passo) {
      root.append(svg("line", { x1: m.l, x2: m.l + pw, y1: Y(v), y2: Y(v), class: "rg-grid" }));
      root.append(svg("text", { x: m.l + pw + 6, y: Y(v) + 4, class: "rg-tick" }, num(v, passo < 1 ? 2 : passo < 10 ? 1 : 0)));
    }
    const passoDate = Math.max(1, Math.round(n / (stretto ? 3 : 6)));
    for (let k = i0 + Math.round(passoDate / 2); k < N - passoDate / 3; k += passoDate) root.append(svg("text", { x: X(k), y: H - 6, "text-anchor": "middle", class: "rg-tick" }, R.dataBreve(date[k])));
    const linea = (serie, fn, stile) => {
      let d = "";
      for (let i = i0; i < N; i++) { const v = serie[i]; if (v == null) continue; d += `${d ? "L" : "M"}${X(i).toFixed(1)},${fn(v).toFixed(1)}`; }
      if (d) root.append(svg("path", Object.assign({ d, fill: "none" }, stile)));
    };
    linea(m200, Y, { stroke: c.ma, "stroke-width": 2 });
    linea(m50, Y, { stroke: c.b50, "stroke-width": 1.4, "stroke-dasharray": "5 4" });
    linea(p, Y, { stroke: c.price, "stroke-width": 1.6, "stroke-linejoin": "round" });
    if (rsSerie && base && isFinite(rlo)) {
      root.append(svg("line", { x1: m.l, x2: m.l + pw, y1: Y2(100), y2: Y2(100), class: "rg-axis" }));
      root.append(svg("text", { x: m.l + pw + 6, y: Y2(100) + 4, class: "rg-tick" }, "100"));
      root.append(svg("text", { x: m.l, y: y2 - 8, class: "tit-pannello" }, stretto ? `Forza relativa sull'${r.confronto} (base 100)` : `Forza relativa sull'${r.confronto} (base 100 a inizio periodo)`));
      linea(rsSerie.map(v => (v == null ? null : (v / base) * 100)), Y2, { stroke: c.soglia, "stroke-width": 1.6 });
    }
    // cursore e scheda al passaggio del mouse
    const cursore = svg("line", { x1: 0, x2: 0, y1: m.t, y2: H - m.b, class: "pf-cursor", visibility: "hidden" });
    root.append(cursore);
    box.innerHTML = "";
    box.append(root);
    const tip = document.createElement("div");
    tip.className = "chart-tip";
    tip.hidden = true;
    box.append(tip);
    root.addEventListener("mousemove", ev => {
      const rect = root.getBoundingClientRect();
      const x = ((ev.clientX - rect.left) / rect.width) * W;
      const k = Math.max(i0, Math.min(N - 1, Math.round(i0 + ((x - m.l) / pw) * n)));
      cursore.setAttribute("x1", X(k)); cursore.setAttribute("x2", X(k)); cursore.setAttribute("visibility", "visible");
      const rsv = rsSerie && base && rsSerie[k] != null ? (rsSerie[k] / base) * 100 : null;
      tip.innerHTML = `<div class="d">${dataIt(date[k])}</div>
        <div class="r"><span><i class="sw dot" style="background:${c.price}"></i>Prezzo</span><span>${num(p[k], 2)}</span></div>
        <div class="r"><span><i class="sw dot" style="background:${c.b50}"></i>Media 50</span><span>${num(m50[k], 2)}</span></div>
        <div class="r"><span><i class="sw dot" style="background:${c.ma}"></i>Media 200</span><span>${num(m200[k], 2)}</span></div>
        ${rsv != null ? `<div class="r"><span><i class="sw dot" style="background:${c.soglia}"></i>Forza relativa</span><span>${num(rsv, 1)}</span></div>` : ""}`;
      tip.hidden = false;
      const px = (X(k) / W) * rect.width;
      tip.style.left = (px + 16 + tip.offsetWidth > rect.width ? px - tip.offsetWidth - 16 : px + 16) + "px";
    });
    root.addEventListener("mouseleave", () => { cursore.setAttribute("visibility", "hidden"); tip.hidden = true; });
    $("#tit-legenda").innerHTML = [
      `<span><i class="sw" style="background:${c.price}"></i>Prezzo</span>`,
      `<span><i class="sw dash" style="color:${c.b50}"></i>Media 50</span>`,
      `<span><i class="sw" style="background:${c.ma}"></i>Media 200</span>`,
      rsSerie ? `<span><i class="sw" style="background:${c.soglia}"></i>Forza relativa sull'${esc(r.confronto)}</span>` : "",
    ].join("");
  }

  // ---------------- vista ----------------

  async function disegna() {
    $("#tit-modifica").href = linkLista();
    let dati = null;
    try { dati = await R.dati.miei(); } catch (e) { dati = null; }
    if (!st.visibile) return;
    if (!dati || !dati.titoli || !dati.titoli.length) {
      $("#tit-tabella").innerHTML = "";
      $("#tit-dettaglio").hidden = true;
      $("#tit-nota").innerHTML = `I prezzi della tua lista non ci sono ancora: arrivano con il prossimo aggiornamento automatico
        (o subito con GitHub → Actions → Aggiorna dati → Run workflow). La lista si cambia nel file <code>miei-titoli.txt</code>.`;
      return;
    }
    let mappaSp = null, tutti = null;
    try {
      const tt = await R.dati.titoli();
      mappaSp = new Map(tt.map(z => [String(z.t).toUpperCase(), z]));
      tutti = await R.dati.tuttiSettori();
    } catch (e) { /* senza i settori si mostra il resto */ }
    if (!st.visibile) return;
    st.dati = dati;
    st.righe = dati.titoli.map(x => analizza(x, dati.confronti || {}, mappaSp, tutti));
    if (st.aperto && !st.righe.some(r => r.t === st.aperto)) st.aperto = null;
    disegnaTabella();
    disegnaDettaglio();
    const mancanti = dati.mancanti || [];
    $("#tit-nota").innerHTML = `${st.righe.length} ${st.righe.length === 1 ? "titolo" : "titoli"}, chiusure fino al ${dataIt(dati.aggiornato)}. ` +
      `Forza relativa: posizione nella rotazione settimanale contro l'S&amp;P 500 per le azioni americane, contro l'ACWI (l'azionario mondiale, in euro) per le altre; sotto, quanto il titolo ha fatto meglio o peggio in 3 mesi. Clic su una riga per il grafico.` +
      (mancanti.length ? ` <b>Non trovati su Yahoo Finance:</b> ${mancanti.map(esc).join(", ")}: controlla il ticker (per esempio ENEL.MI per Enel a Milano).` : "");
  }

  function apriTitolo(t, scorri) {
    st.aperto = st.aperto === t ? null : t;
    // l'indirizzo segue il titolo aperto, senza far ripartire la vista
    try { history.replaceState(null, "", st.aperto ? `#tit/${st.aperto}` : "#tit"); } catch (e) { /* niente */ }
    disegnaTabella();
    disegnaDettaglio();
    R.emit("selezione");
    if (st.aperto && scorri !== false) $("#tit-dettaglio").scrollIntoView({ block: "start", behavior: "smooth" });
  }

  function init() {
    $("#tit-tabella").addEventListener("click", e => {
      const th = e.target.closest("th[data-col]");
      if (th) {
        const col = th.dataset.col;
        st.ordine = { col, dir: st.ordine.col === col ? -st.ordine.dir : (col === "t" || col === "rs" ? 1 : -1) };
        R.store.set("tit.ordine", st.ordine);
        disegnaTabella();
        return;
      }
      const tr = e.target.closest("tr[data-t]");
      if (tr) apriTitolo(tr.dataset.t);
    });
    $("#tit-tabella").addEventListener("keydown", e => {
      if (e.key !== "Enter") return;
      const tr = e.target.closest("tr[data-t]");
      if (tr) apriTitolo(tr.dataset.t);
    });
    $("#tit-dettaglio").addEventListener("click", e => {
      if (e.target.id === "tit-chiudi") { apriTitolo(st.aperto, false); return; }
      const b = e.target.closest("#tit-periodo button[data-v]");
      if (b) {
        st.periodo = Number(b.dataset.v);
        R.store.set("tit.periodo", st.periodo);
        disegnaDettaglio();
      }
    });
    R.on("tema", () => { if (st.visibile && st.dati) { disegnaTabella(); disegnaDettaglio(); } });
    R.on("livelli", () => { if (st.visibile && st.dati) disegna(); });
    window.addEventListener("resize", R.debounce(() => { if (st.visibile && st.aperto) grafico(st.righe.find(z => z.t === st.aperto)); }, 200));
  }

  async function mostra(param) {
    st.visibile = true;
    document.title = "I miei titoli · Radar Settori";
    if (param) st.aperto = String(param).toUpperCase();
    await disegna();
    if (param && st.aperto) $("#tit-dettaglio").scrollIntoView({ block: "start" });
  }

  function nascondi() { st.visibile = false; }

  function tasto(e) {
    if (e.key === "Escape" && st.aperto) { apriTitolo(st.aperto, false); return true; }
    return false;
  }

  // testo per «Copia per Claude»
  function contesto() {
    if (!st.righe.length) return "## Pagina aperta: I miei titoli\nLa lista non ha ancora prezzi.";
    const out = ["## Pagina aperta: I miei titoli",
      "La pagina mostra i titoli della lista personale di Daniele: trend sulle medie a 200 e 50 sedute, calo dal massimo a 52 settimane, " +
      "forza relativa (rotazione settimanale contro l'S&P 500 per le azioni americane, contro l'ACWI, l'azionario mondiale in euro, per le altre) e, per le azioni dell'S&P 500, lo stato del loro settore.",
      `Chiusure fino al ${dataIt(st.dati.aggiornato)}.`,
      "titolo | nome | ultimo | 1 giorno | 1 settimana | 1 mese | 3 mesi | 6 mesi | da inizio anno | 1 anno | dal massimo 52 sett. | sulla media 200 | sulla media 50 | forza relativa (quadrante, direzione, 3 mesi sul confronto) | settore"];
    for (const r of st.righe) {
      const rs = r.rs ? `${NOMI_Q[r.rs.quadrante]}, direzione ${r.rs.direzione == null ? "—" : num(r.rs.direzione, 0) + "°"} ${r.rs.bussola || ""}, 3 mesi ${pct(r.rs3, 1)} sull'${r.confronto}` : "—";
      const set = r.settore ? `${r.settore.etf} ${r.settore.nome}, ${S.STATI[r.settore.stato]}${r.settore.posto ? `, ${r.settore.posto}° su ${r.settore.totale}` : ""}` : "non nell'S&P 500";
      out.push(`${r.t} | ${r.nome} | ${num(r.ultimo, 2)} ${r.valuta} | ${pct(r.g1, 1)} | ${pct(r.s1, 1)} | ${pct(r.m1, 1)} | ${pct(r.m3, 1)} | ${pct(r.m6, 1)} | ${pct(r.ytd, 1)} | ${pct(r.a1, 1)} | ${pct(r.dd52, 1)} | ${pct(r.vs200, 1)} | ${pct(r.vs50, 1)} | ${rs} | ${set}`);
    }
    const r = st.righe.find(z => z.t === st.aperto);
    if (r) {
      out.push(`Titolo aperto nel dettaglio: ${r.t}. Chiusure a fine mese (prezzo, media 200):`);
      const p = r.x.prezzi, date = r.x.date;
      for (let i = Math.max(0, p.length - st.periodo); i < p.length; i++) {
        if (i === p.length - 1 || date[i + 1].slice(0, 7) !== date[i].slice(0, 7)) out.push(`${dataIt(date[i])}: ${num(p[i], 2)} (media 200 ${num(sma(p, 200, i), 2)})`);
      }
    }
    if ((st.dati.mancanti || []).length) out.push(`Ticker non trovati su Yahoo Finance: ${st.dati.mancanti.join(", ")}.`);
    return out.join("\n");
  }

  R.viste.tit = { init, mostra, nascondi, tasto, contesto };
})();
