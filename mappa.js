/*
 * Radar Settori — mappa a dispersione con le scie settimanali (Bottom Map di Europa e crypto).
 *
 * R.mappa(box, cfg) disegna nel riquadro e restituisce { evidenzia(k) } per collegarla a una tabella.
 * cfg = {
 *   etichetta,                                   testo per chi non vede il grafico
 *   x: { min, max, tacche, formato, titolo, sinistra, destra },
 *   y: { min, max, tacche, formato, titolo },
 *   bande: [{ x0, x1, y0, y1, classe, testo }],  aree evidenziate (limiti mancanti = bordo del grafico)
 *   linee: [{ x } | { y }, con testo facoltativo], linee tratteggiate di riferimento
 *   voci: [{ k, etichetta, colore, punti: [{ x, y }] }], dall'ultimo punto nasce la testa
 *   tip(k) → html della scheda al passaggio,  apri(k) al clic o con Invio
 * }
 */
(function () {
  "use strict";

  const R = window.Radar;
  const { svg } = R;

  R.mappa = function (box, cfg) {
    const W = Math.max(300, box.clientWidth || 900);
    const stretto = W < 560;
    const H = stretto ? Math.round(W * 1.02) : Math.round(Math.min(600, Math.max(400, W * 0.58)));
    // a sinistra c'è posto per le tacche più lunghe e per il nome dell'asse
    const lunghe = Math.max(...cfg.y.tacche.map(v => String(cfg.y.formato(v)).length));
    const m = { l: Math.max(stretto ? 40 : 50, 36 + lunghe * 6.6), r: stretto ? 10 : 16, t: stretto ? 12 : 14, b: stretto ? 44 : 50 };
    // spazi già occupati da scritte fisse: le etichette delle voci li evitano
    const fissi = [];
    const scritta = (x, y, testo, ancora) => {
      const w = String(testo).length * 7 + 4, x0 = ancora === "end" ? x - w : ancora === "middle" ? x - w / 2 : x;
      fissi.push([x0, y - 12, x0 + w, y + 3]);
    };
    const pw = W - m.l - m.r, ph = H - m.t - m.b;
    const { x: ax, y: ay } = cfg;
    const cx = v => Math.max(ax.min, Math.min(ax.max, v)), cy = v => Math.max(ay.min, Math.min(ay.max, v));
    const X = v => m.l + ((cx(v) - ax.min) / (ax.max - ax.min)) * pw;
    const Y = v => m.t + ((ay.max - cy(v)) / (ay.max - ay.min)) * ph;

    const root = svg("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", role: "img", "aria-label": cfg.etichetta });
    const g = svg("g");
    root.append(g);

    // aree
    for (const b of cfg.bande || []) {
      const x0 = X(b.x0 != null ? b.x0 : ax.min), x1 = X(b.x1 != null ? b.x1 : ax.max);
      const y0 = Y(b.y1 != null ? b.y1 : ay.max), y1 = Y(b.y0 != null ? b.y0 : ay.min);
      g.append(svg("rect", { x: Math.min(x0, x1), y: Math.min(y0, y1), width: Math.abs(x1 - x0), height: Math.abs(y1 - y0), class: b.classe || "bm-att" }));
    }
    // griglia e tacche
    ax.tacche.forEach((v, k) => {
      g.append(svg("line", { x1: X(v), x2: X(v), y1: m.t, y2: m.t + ph, class: "bm-grid" }));
      if (!stretto || k % 2 === 0) g.append(svg("text", { x: X(v), y: m.t + ph + 18, class: "bm-tick", "text-anchor": "middle" }, ax.formato(v)));
    });
    for (const v of ay.tacche) {
      g.append(svg("line", { x1: m.l, x2: m.l + pw, y1: Y(v), y2: Y(v), class: "bm-grid" }));
      g.append(svg("text", { x: m.l - 8, y: Y(v) + 4, class: "bm-tick", "text-anchor": "end" }, ay.formato(v)));
    }
    // linee di riferimento
    for (const l of cfg.linee || []) {
      if (l.x != null) {
        g.append(svg("line", { x1: X(l.x), x2: X(l.x), y1: m.t, y2: m.t + ph, class: "bm-zero" }));
        if (l.testo) { g.append(svg("text", { x: X(l.x) + 5, y: m.t + 14, class: "bm-alabel", "text-anchor": "start" }, l.testo)); scritta(X(l.x) + 5, m.t + 14, l.testo, "start"); }
      } else if (l.y != null) {
        g.append(svg("line", { x1: m.l, x2: m.l + pw, y1: Y(l.y), y2: Y(l.y), class: "bm-zero" }));
        if (l.testo) { g.append(svg("text", { x: m.l + pw - 6, y: Y(l.y) - 6, class: "bm-alabel", "text-anchor": "end" }, l.testo)); scritta(m.l + pw - 6, Y(l.y) - 6, l.testo, "end"); }
      }
    }
    // nomi delle aree, dentro l'area in alto a sinistra
    for (const b of cfg.bande || []) {
      if (!b.testo) continue;
      const x0 = Math.min(X(b.x0 != null ? b.x0 : ax.min), X(b.x1 != null ? b.x1 : ax.max));
      const y1 = Math.max(Y(b.y1 != null ? b.y1 : ay.max), Y(b.y0 != null ? b.y0 : ay.min));
      const yt = b.basso ? y1 - 10 : Math.min(Y(b.y1 != null ? b.y1 : ay.max), Y(b.y0 != null ? b.y0 : ay.min)) + 18;
      const testo = stretto && b.testoBreve ? b.testoBreve : b.testo;
      g.append(svg("text", { x: x0 + 10, y: yt, class: b.classeTesto || "bm-alabel" }, testo));
      scritta(x0 + 10, yt, testo, "start");
    }
    g.append(svg("rect", { x: m.l, y: m.t, width: pw, height: ph, class: "rg-frame" }));
    if (ax.sinistra) g.append(svg("text", { x: m.l, y: H - 10, class: "bm-axis", "text-anchor": "start" }, ax.sinistra));
    if (!stretto && ax.titolo) g.append(svg("text", { x: m.l + pw / 2, y: H - 10, class: "bm-axis", "text-anchor": "middle" }, ax.titolo));
    if (ax.destra) g.append(svg("text", { x: m.l + pw, y: H - 10, class: "bm-axis", "text-anchor": "end" }, ax.destra));
    if (ay.titolo) g.append(svg("text", { x: 13, y: m.t + ph / 2, class: "bm-axis", "text-anchor": "middle", transform: `rotate(-90 13 ${m.t + ph / 2})` }, ay.titolo));

    // le voci: scia grigia che sfuma, testa colorata; etichette dove non coprono le teste
    const voci = cfg.voci.filter(v => v.punti.length);
    const occupati = voci.map(v => { const h = v.punti[v.punti.length - 1]; return [X(h.x) - 8, Y(h.y) - 8, X(h.x) + 8, Y(h.y) + 8]; }).concat(fissi);
    const etichette = svg("g");
    for (const v of voci) {
      const grp = svg("g", { class: "bm-sec", "data-k": v.k, tabindex: "0" });
      const n = v.punti.length - 1;
      for (let j = 1; j <= n; j++) {
        const a = v.punti[j - 1], b = v.punti[j];
        grp.append(svg("line", { x1: X(a.x), y1: Y(a.y), x2: X(b.x), y2: Y(b.y), class: "bm-tail", "stroke-opacity": (0.3 + 0.7 * j / n).toFixed(2) }));
      }
      for (let j = 0; j < n; j++) grp.append(svg("circle", { cx: X(v.punti[j].x), cy: Y(v.punti[j].y), r: 2.3, class: "bm-dot", "fill-opacity": (0.3 + 0.7 * j / n).toFixed(2) }));
      const h = v.punti[n], hx = X(h.x), hy = Y(h.y);
      grp.append(svg("circle", { cx: hx, cy: hy, r: 14, class: "rt-hit" }));
      grp.append(svg("circle", { cx: hx, cy: hy, r: 7, class: "bm-head", style: `fill:${v.colore}` }));
      g.append(grp);
      const w = v.etichetta.length * 7.2 + 4, hh = 14;
      const prove = [[12, 5, "start"], [-12, 5, "end"], [0, -13, "middle"], [0, 23, "middle"], [12, -10, "start"], [-12, -10, "end"], [12, 18, "start"], [-12, 18, "end"]];
      let scelta = null;
      for (const pr of prove) {
        const x0 = pr[2] === "start" ? hx + pr[0] : pr[2] === "end" ? hx + pr[0] - w : hx - w / 2;
        const y0 = hy + pr[1] - 11;
        const rect = [x0, y0, x0 + w, y0 + hh];
        if (x0 < m.l || x0 + w > m.l + pw || y0 < m.t || y0 + hh > m.t + ph) continue;
        if (!occupati.some(o => !(rect[2] < o[0] || rect[0] > o[2] || rect[3] < o[1] || rect[1] > o[3]))) { scelta = pr; occupati.push(rect); break; }
      }
      if (!scelta) scelta = hx > m.l + pw - 70 ? prove[1] : prove[0];
      etichette.append(svg("text", { x: hx + scelta[0], y: hy + scelta[1], "text-anchor": scelta[2], class: "bm-label", "data-k": v.k }, v.etichetta));
    }
    g.append(etichette);
    box.innerHTML = "";
    box.append(root);
    const tip = document.createElement("div");
    tip.className = "chart-tip point-tip";
    tip.hidden = true;
    box.append(tip);

    // passaggio, fuoco e clic (gestori sostituiti a ogni disegno)
    const mostraTip = k => {
      if (!k || !cfg.tip) { tip.hidden = true; return; }
      tip.innerHTML = cfg.tip(k);
      tip.hidden = false;
      const el = box.querySelector(`.bm-sec[data-k="${CSS.escape(k)}"] .bm-head`);
      if (!el) return;
      const rb = box.getBoundingClientRect(), re = el.getBoundingClientRect();
      const x = re.left + re.width / 2 - rb.left, y = re.top + re.height / 2 - rb.top;
      tip.style.left = Math.max(0, x + 18 + tip.offsetWidth > rb.width ? x - 18 - tip.offsetWidth : x + 18) + "px";
      tip.style.top = Math.max(0, Math.min(rb.height - tip.offsetHeight, y - tip.offsetHeight / 2)) + "px";
    };
    const evidenzia = (k, conTip) => {
      R.$$("[data-k]", box).forEach(el => el.classList.toggle("dim", !!k && el.dataset.k !== k));
      if (conTip) mostraTip(k); else tip.hidden = true;
    };
    const chiave = e => { const el = e.target.closest && e.target.closest("[data-k]"); return el ? el.dataset.k : null; };
    box.onmouseover = e => evidenzia(chiave(e), true);
    box.onmouseleave = () => evidenzia(null, false);
    box.onfocusin = e => { const k = chiave(e); if (k) evidenzia(k, true); };
    box.onfocusout = () => evidenzia(null, false);
    box.onclick = e => { const k = chiave(e); if (k && cfg.apri) cfg.apri(k); };
    box.onkeydown = e => { if (e.key === "Enter") { const k = chiave(e); if (k && cfg.apri) cfg.apri(k); } };
    return { evidenzia };
  };

  // tacche «tonde» fra min e max, al massimo circa n
  R.tacche = function (min, max, n = 6) {
    const span = max - min;
    const e = Math.pow(10, Math.floor(Math.log10(span / n || 1)));
    const passo = [1, 2, 2.5, 5, 10].map(k => k * e).find(s => span / s <= n) || e * 10;
    const out = [];
    for (let v = Math.ceil(min / passo - 1e-9) * passo; v <= max + 1e-9; v += passo) out.push(+v.toFixed(10));
    return out;
  };
})();
