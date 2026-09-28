/*
 * Radar Settori — vista 3: Bottom Map.
 * Orizzontale: profondità del drawdown (percentile della storia del settore, a sinistra il più profondo).
 * Verticale: distanza dell'ampiezza dal livello blu. In basso a sinistra c'è la zona blu.
 */
(function () {
  "use strict";

  const R = window.Radar, S = window.Signals, Rot = window.Rotazione;
  const { $, num, pct, esc, svg } = R;
  let visibile = false;
  let settimane = R.store.get("btm.coda", 8);
  let evidenza = null;

  function punti(d, a, lv, k) {
    const b = Rot.barre(d.date, "settimanali", x => window.Calendario.successiva(x, "nyse"));
    const idx = b.indici.slice(-(k + 1));
    // l'ultimo punto è sempre l'ultima seduta disponibile
    const last = d.date.length - 1;
    if (idx[idx.length - 1] !== last) idx.push(last);
    return idx.filter(i => d.b200[i] != null && a.ddPerc[i] != null)
      .map(i => ({ i, data: d.date[i], x: a.ddPerc[i], y: d.b200[i] - lv, b: d.b200[i], dd: d.dd[i] }));
  }

  async function disegna() {
    const tutti = await R.dati.tuttiSettori();
    if (!visibile) return;
    const P = R.parametri();
    const voci = R.meta.settori.map(s => {
      const d = tutti[s.etf], a = R.analisiSync(s.etf, d), lv = R.livello(s.etf);
      const N = d.date.length;
      return { etf: s.etf, nome: s.nome, d, a, lv, stato: a.statoOggi || "normale", pts: punti(d, a, lv, settimane), n: d.n[N - 1] };
    });

    // --- grafico ---
    const box = $("#btm-grafico");
    const W = Math.max(520, box.clientWidth || 900), H = Math.round(Math.min(640, Math.max(420, W * 0.62)));
    const m = { l: 58, r: 18, t: 18, b: 52 };
    const pw = W - m.l - m.r, ph = H - m.t - m.b;
    let ymin = -12, ymax = 45;
    for (const v of voci) for (const p of v.pts) { ymin = Math.min(ymin, p.y - 4); ymax = Math.max(ymax, p.y + 6); }
    ymin = Math.max(-40, Math.floor(ymin / 5) * 5); ymax = Math.min(100, Math.ceil(ymax / 10) * 10);
    const X = p => m.l + ((100 - p) / 100) * pw;
    const Y = v => m.t + ((ymax - Math.max(ymin, Math.min(ymax, v))) / (ymax - ymin)) * ph;

    const root = svg("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", role: "img", "aria-label": "Mappa dei settori: profondità del drawdown e distanza dal livello blu" });
    const g = svg("g");
    root.append(g);

    // zone
    g.append(svg("rect", { x: X(100), y: m.t, width: X(P.ddAttenzione) - X(100), height: ph, class: "bm-att" }));
    g.append(svg("rect", { x: m.l, y: Y(P.fasciaAttenzione), width: pw, height: Y(0) - Y(P.fasciaAttenzione), class: "bm-att" }));
    g.append(svg("rect", { x: X(100), y: Y(0), width: X(P.ddIngresso) - X(100), height: Y(ymin) - Y(0), class: "bm-blu" }));
    g.append(svg("text", { x: X(100) + 10, y: Y(ymin) - 12, class: "bm-zlabel" }, "ZONA BLU"));
    g.append(svg("text", { x: X(100) + 10, y: m.t + 16, class: "bm-alabel" }, "ATTENZIONE"));

    // griglia
    for (let p = 0; p <= 100; p += 10) {
      g.append(svg("line", { x1: X(p), x2: X(p), y1: m.t, y2: m.t + ph, class: "bm-grid" }));
      g.append(svg("text", { x: X(p), y: m.t + ph + 18, class: "bm-tick", "text-anchor": "middle" }, p + "°"));
    }
    const passo = (ymax - ymin) > 80 ? 20 : 10;
    for (let v = Math.ceil(ymin / passo) * passo; v <= ymax; v += passo) {
      g.append(svg("line", { x1: m.l, x2: m.l + pw, y1: Y(v), y2: Y(v), class: "bm-grid" }));
      g.append(svg("text", { x: m.l - 8, y: Y(v) + 4, class: "bm-tick", "text-anchor": "end" }, (v > 0 ? "+" : "") + v));
    }
    g.append(svg("line", { x1: m.l, x2: m.l + pw, y1: Y(0), y2: Y(0), class: "bm-zero" }));
    g.append(svg("line", { x1: X(P.ddIngresso), x2: X(P.ddIngresso), y1: m.t, y2: m.t + ph, class: "bm-zero" }));
    g.append(svg("text", { x: m.l + pw / 2, y: H - 8, class: "bm-axis", "text-anchor": "middle" }, "← più profondo      Profondità del drawdown (percentile della storia del settore)      meno profondo →"));
    g.append(svg("text", { x: 14, y: m.t + ph / 2, class: "bm-axis", "text-anchor": "middle", transform: `rotate(-90 14 ${m.t + ph / 2})` }, "Punti sopra il livello blu"));

    // settori
    const occupati = [];
    const livelloEtichette = svg("g");
    for (const v of voci) {
      if (!v.pts.length) continue;
      const col = `var(--st-${v.stato})`;
      const grp = svg("g", { class: "bm-sec" + (evidenza && evidenza !== v.etf ? " dim" : ""), "data-etf": v.etf, tabindex: "0" });
      if (v.pts.length > 1) {
        grp.append(svg("polyline", { points: v.pts.map(p => `${X(p.x)},${Y(p.y)}`).join(" "), class: "bm-tail", style: `stroke:${col}` }));
        v.pts.slice(0, -1).forEach((p, k) => grp.append(svg("circle", {
          cx: X(p.x), cy: Y(p.y), r: 2.2 + (2 * k) / v.pts.length, class: "bm-dot", style: `fill:${col};opacity:${0.25 + (0.5 * k) / v.pts.length}`,
        })));
      }
      const h = v.pts[v.pts.length - 1];
      const hx = X(h.x), hy = Y(h.y);
      grp.append(svg("circle", { cx: hx, cy: hy, r: 8, class: "bm-head", style: `fill:${col}` }));
      // etichetta senza sovrapposizioni (prova destra, sinistra, sopra, sotto)
      const w = v.etf.length * 8 + 6, hh = 14;
      const prove = [[12, 5, "start"], [-12, 5, "end"], [0, -13, "middle"], [0, 22, "middle"], [14, -10, "start"], [-14, -10, "end"]];
      let scelta = prove[0];
      for (const pr of prove) {
        const x0 = pr[2] === "start" ? hx + pr[0] : pr[2] === "end" ? hx + pr[0] - w : hx - w / 2;
        const y0 = hy + pr[1] - 11;
        const rect = [x0, y0, x0 + w, y0 + hh];
        if (!occupati.some(o => !(rect[2] < o[0] || rect[0] > o[2] || rect[3] < o[1] || rect[1] > o[3]))) { scelta = pr; occupati.push(rect); break; }
      }
      livelloEtichette.append(svg("text", { x: hx + scelta[0], y: hy + scelta[1], "text-anchor": scelta[2], class: "bm-label" + (evidenza && evidenza !== v.etf ? " dim" : ""), "data-etf": v.etf }, v.etf));
      grp.append(svg("title", null, `${v.etf} ${v.nome}: ${S.STATI[v.stato]}, ${num(h.b, 1)}% sopra M200 (${R.segnato(h.y, 1)} dal livello), drawdown ${pct(h.dd, 1)} al ${num(h.x, 0)}° percentile`));
      g.append(grp);
    }
    g.append(livelloEtichette);
    box.innerHTML = "";
    box.append(root);

    // --- tabella ---
    const righe = voci.map(v => {
      const h = v.pts[v.pts.length - 1] || {};
      const unit = 100 / Math.max(1, v.n || 1);
      const pti = h.y == null ? null : Math.max(0, h.y);
      return { v, h, pti, titoli: pti == null ? null : (pti <= 0 ? 0 : Math.ceil(pti / unit - 1e-9)), ddOk: h.x != null && h.x > P.ddIngresso };
    }).sort((a, b) => ((a.pti ?? 999) - (b.pti ?? 999)) || ((b.h.x ?? 0) - (a.h.x ?? 0)));
    $("#btm-tabella").innerHTML = `<thead><tr><th>Settore</th><th>Dal livello</th><th>Titoli</th><th>Drawdown</th></tr></thead><tbody>` +
      righe.map(r => `<tr class="clic" data-etf="${r.v.etf}" tabindex="0">
        <td><b class="mono">${r.v.etf}</b> <span class="st-pill st-${r.v.stato}">${S.STATI[r.v.stato]}</span><small class="sub-line">${esc(r.v.nome)}</small></td>
        <td class="mono" style="color:${r.h.y != null && r.h.y <= 0 ? "var(--st-blu)" : "inherit"}">${r.h.y == null ? "—" : R.segnato(r.h.y, 1)}</td>
        <td class="mono">${r.titoli == null ? "—" : r.titoli === 0 ? "—" : r.titoli}</td>
        <td class="mono">${pct(r.h.dd, 1)}<small class="sub-line">${num(r.h.x, 0)}° perc. ${r.ddOk ? `<span class="ok-mark" title="oltre il ${P.ddIngresso}°">✓</span>` : ""}</small></td>
      </tr>`).join("") + "</tbody>";
  }

  function init() {
    $("#btm-coda").value = settimane;
    $("#btm-coda-val").textContent = settimane;
    $("#btm-coda").addEventListener("input", e => {
      settimane = Number(e.target.value);
      $("#btm-coda-val").textContent = settimane;
      R.store.set("btm.coda", settimane);
      if (visibile) disegna();
    });
    const apri = e => { const el = e.target.closest("[data-etf]"); if (el) R.vai("#" + el.dataset.etf); };
    $("#btm-grafico").addEventListener("click", apri);
    $("#btm-grafico").addEventListener("keydown", e => { if (e.key === "Enter") apri(e); });
    $("#btm-tabella").addEventListener("click", apri);
    const evid = etf => {
      evidenza = etf;
      R.$$("#btm-grafico [data-etf]").forEach(el => el.classList.toggle("dim", !!etf && el.dataset.etf !== etf));
      R.$$("#btm-tabella tr[data-etf]").forEach(el => el.classList.toggle("hl", el.dataset.etf === etf));
    };
    $("#btm-grafico").addEventListener("mouseover", e => { const el = e.target.closest("[data-etf]"); evid(el ? el.dataset.etf : null); });
    $("#btm-grafico").addEventListener("mouseleave", () => evid(null));
    $("#btm-tabella").addEventListener("mouseover", e => { const el = e.target.closest("tr[data-etf]"); evid(el ? el.dataset.etf : null); });
    $("#btm-tabella").addEventListener("mouseleave", () => evid(null));
    R.on("livelli", () => { if (visibile) disegna(); });
    window.addEventListener("resize", R.debounce(() => { if (visibile) disegna(); }, 200));
  }

  function mostra() { visibile = true; document.title = "Bottom Map · Radar Settori"; return disegna(); }
  function nascondi() { visibile = false; }

  R.viste.btm = { init, mostra, nascondi };
})();
