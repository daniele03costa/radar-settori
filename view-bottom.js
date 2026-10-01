/*
 * Radar Settori — vista 3: Bottom Map.
 * Orizzontale: profondità del drawdown (percentile della storia del settore, a sinistra il più profondo).
 * Verticale: distanza dell'ampiezza dal livello blu. In basso a sinistra c'è la zona blu.
 */
(function () {
  "use strict";

  const R = window.Radar, S = window.Signals, Rot = window.Rotazione;
  const { $, num, pct, esc, svg, dataIt } = R;
  let visibile = false;
  let settimane = R.store.get("btm.coda", 8);
  let evidenza = null;
  let voci = [];

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
    voci = R.meta.settori.map(s => {
      const d = tutti[s.etf], a = R.analisiSync(s.etf, d), lv = R.livello(s.etf);
      const N = d.date.length;
      return { etf: s.etf, nome: s.nome, d, a, lv, stato: a.statoOggi || "normale", pts: punti(d, a, lv, settimane), n: d.n[N - 1] };
    });

    // --- grafico ---
    const box = $("#btm-grafico");
    const W = Math.max(300, box.clientWidth || 900);
    const stretto = W < 560;
    const H = stretto ? Math.round(W * 1.05) : Math.round(Math.min(620, Math.max(420, W * 0.6)));
    const m = stretto ? { l: 40, r: 10, t: 12, b: 44 } : { l: 52, r: 16, t: 14, b: 50 };
    const pw = W - m.l - m.r, ph = H - m.t - m.b;
    let ymin = -12, ymax = 45;
    for (const v of voci) for (const p of v.pts) { ymin = Math.min(ymin, p.y - 4); ymax = Math.max(ymax, p.y + 6); }
    ymin = Math.max(-40, Math.floor(ymin / 5) * 5); ymax = Math.min(100, Math.ceil(ymax / 10) * 10);
    const X = p => m.l + ((100 - p) / 100) * pw;
    const Y = v => m.t + ((ymax - Math.max(ymin, Math.min(ymax, v))) / (ymax - ymin)) * ph;

    const root = svg("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", role: "img", "aria-label": "Mappa dei settori: profondità del drawdown e distanza dal livello blu" });
    const g = svg("g");
    root.append(g);

    // zone: fascia di attenzione (in alto a sinistra e in basso) e zona blu
    g.append(svg("rect", { x: X(100), y: m.t, width: X(P.ddAttenzione) - X(100), height: ph, class: "bm-att" }));
    g.append(svg("rect", { x: m.l, y: Y(P.fasciaAttenzione), width: pw, height: Y(0) - Y(P.fasciaAttenzione), class: "bm-att" }));
    g.append(svg("rect", { x: X(100), y: Y(0), width: X(P.ddIngresso) - X(100), height: Y(ymin) - Y(0), class: "bm-blu", rx: 2 }));

    // griglia
    for (let p = 0; p <= 100; p += 10) {
      g.append(svg("line", { x1: X(p), x2: X(p), y1: m.t, y2: m.t + ph, class: "bm-grid" }));
      if (!stretto || p % 20 === 0) g.append(svg("text", { x: X(p), y: m.t + ph + 18, class: "bm-tick", "text-anchor": "middle" }, p + "°"));
    }
    const passo = (ymax - ymin) > 80 ? 20 : 10;
    for (let v = Math.ceil(ymin / passo) * passo; v <= ymax; v += passo) {
      g.append(svg("line", { x1: m.l, x2: m.l + pw, y1: Y(v), y2: Y(v), class: "bm-grid" }));
      g.append(svg("text", { x: m.l - 8, y: Y(v) + 4, class: "bm-tick", "text-anchor": "end" }, (v > 0 ? "+" : "") + v));
    }
    g.append(svg("line", { x1: m.l, x2: m.l + pw, y1: Y(0), y2: Y(0), class: "bm-zero" }));
    g.append(svg("line", { x1: X(P.ddIngresso), x2: X(P.ddIngresso), y1: m.t, y2: m.t + ph, class: "bm-zero" }));
    g.append(svg("rect", { x: m.l, y: m.t, width: pw, height: ph, class: "rg-frame" }));
    g.append(svg("text", { x: X(100) + 12, y: Y(ymin) - 12, class: "bm-zlabel" }, "Zona blu"));
    g.append(svg("text", { x: X(100) + 12, y: m.t + 20, class: "bm-alabel" }, "Attenzione"));
    g.append(svg("text", { x: m.l, y: H - 10, class: "bm-axis", "text-anchor": "start" }, "← più profondo"));
    if (!stretto) g.append(svg("text", { x: m.l + pw / 2, y: H - 10, class: "bm-axis", "text-anchor": "middle" }, "Profondità del drawdown · percentile della storia del settore"));
    g.append(svg("text", { x: m.l + pw, y: H - 10, class: "bm-axis", "text-anchor": "end" }, "meno profondo →"));
    g.append(svg("text", { x: 13, y: m.t + ph / 2, class: "bm-axis", "text-anchor": "middle", transform: `rotate(-90 13 ${m.t + ph / 2})` }, "Punti sopra il livello blu"));

    // settori: scia grigia che sfuma, testa colorata per stato
    const occupati = [];
    for (const v of voci) {
      const h = v.pts[v.pts.length - 1];
      if (h) occupati.push([X(h.x) - 8, Y(h.y) - 8, X(h.x) + 8, Y(h.y) + 8]);
    }
    const livelloEtichette = svg("g");
    for (const v of voci) {
      if (!v.pts.length) continue;
      const col = `var(--st-${v.stato})`;
      const dim = evidenza && evidenza !== v.etf;
      const grp = svg("g", { class: "bm-sec" + (dim ? " dim" : ""), "data-etf": v.etf, tabindex: "0" });
      const n = v.pts.length - 1;
      for (let j = 1; j <= n; j++) {
        const a = v.pts[j - 1], b = v.pts[j];
        grp.append(svg("line", { x1: X(a.x), y1: Y(a.y), x2: X(b.x), y2: Y(b.y), class: "bm-tail", "stroke-opacity": (0.3 + 0.7 * j / n).toFixed(2) }));
      }
      for (let j = 0; j < n; j++) {
        grp.append(svg("circle", { cx: X(v.pts[j].x), cy: Y(v.pts[j].y), r: 2.3, class: "bm-dot", "fill-opacity": (0.3 + 0.7 * j / n).toFixed(2) }));
      }
      const h = v.pts[v.pts.length - 1];
      const hx = X(h.x), hy = Y(h.y);
      grp.append(svg("circle", { cx: hx, cy: hy, r: 14, class: "rt-hit" }));
      grp.append(svg("circle", { cx: hx, cy: hy, r: 7, class: "bm-head", style: `fill:${col}` }));
      // etichetta senza sovrapposizioni (prova destra, sinistra, sopra, sotto)
      const w = v.etf.length * 8 + 4, hh = 14;
      const prove = [[12, 5, "start"], [-12, 5, "end"], [0, -13, "middle"], [0, 23, "middle"], [12, -10, "start"], [-12, -10, "end"], [12, 18, "start"], [-12, 18, "end"]];
      let scelta = null;
      for (const pr of prove) {
        const x0 = pr[2] === "start" ? hx + pr[0] : pr[2] === "end" ? hx + pr[0] - w : hx - w / 2;
        const y0 = hy + pr[1] - 11;
        const rect = [x0, y0, x0 + w, y0 + hh];
        if (x0 < m.l || x0 + w > m.l + pw || y0 < m.t) continue;
        if (!occupati.some(o => !(rect[2] < o[0] || rect[0] > o[2] || rect[3] < o[1] || rect[1] > o[3]))) { scelta = pr; occupati.push(rect); break; }
      }
      if (!scelta) scelta = hx > m.l + pw - 60 ? prove[1] : prove[0];
      livelloEtichette.append(svg("text", { x: hx + scelta[0], y: hy + scelta[1], "text-anchor": scelta[2], class: "bm-label" + (dim ? " dim" : ""), "data-etf": v.etf }, v.etf));
      g.append(grp);
    }
    g.append(livelloEtichette);
    box.innerHTML = "";
    box.append(root);
    const tip = document.createElement("div");
    tip.className = "chart-tip point-tip";
    tip.hidden = true;
    box.append(tip);

    $("#btm-legenda").innerHTML = ["normale", "attenzione", "blu", "trigger", "fallito", "cooldown"]
      .map(s => `<span><i class="sw dot" style="background:var(--st-${s})"></i>${S.STATI[s]}</span>`).join("") +
      `<span><i class="sw box bm-sw-blu"></i>Area della zona blu</span>`;

    // --- tabella ---
    // ordine: prima chi ha meno titoli da portare sotto la media per arrivare al livello
    const righe = voci.map(v => {
      const h = v.pts[v.pts.length - 1] || {};
      const tl = h.b == null ? null : R.titoliLivello(h.b, v.n, v.lv);
      return { v, h, tl, ddOk: h.x != null && h.x > P.ddIngresso };
    }).sort((a, b) => ((a.tl ? a.tl.mancano : 999) - (b.tl ? b.tl.mancano : 999)) || ((a.h.y ?? 999) - (b.h.y ?? 999)));
    $("#btm-tabella").innerHTML = `<thead><tr><th>Settore · drawdown</th><th>Mancano</th></tr></thead><tbody>` +
      righe.map(r => {
        const stato = r.v.stato !== "normale" ? `${S.STATI[r.v.stato]} · ` : "";
        const dd = `${stato}drawdown ${pct(r.h.dd, 1)} (${num(r.h.x, 0)}°)${r.ddOk ? ` <span class="ok-mark" title="oltre ${R.art("il", P.ddIngresso + "°")} percentile">✓</span>` : ""}`;
        return `<tr class="clic" data-etf="${r.v.etf}" tabindex="0">
        <td><span class="tk-cell"><span class="qdot" style="--c:var(--st-${r.v.stato})"></span><span class="tk-txt"><span class="tk-line"><b>${r.v.etf}</b> <span class="muted">${esc(r.v.nome)}</span></span><small class="sub-line">${dd}</small></span></span></td>
        <td class="strong${r.tl && !r.tl.mancano ? " blu" : ""}" title="${r.tl ? `${r.tl.sopra} titoli su ${r.tl.n} sopra la media 200; al livello blu (${num(r.v.lv, 0)}%) ne restano ${r.tl.soglia}; ${R.segnato(r.h.y, 1)} punti` : ""}">${!r.tl ? "—" : r.tl.mancano ? R.titoli(r.tl.mancano) : "al livello"}<small class="sub-line">${r.tl ? `${r.tl.sopra}/${r.tl.n} → ${r.tl.soglia}/${r.tl.n}` : ""}</small></td>
      </tr>`;
      }).join("") + "</tbody>";
  }

  function mostraTip(etf, box) {
    const tip = box.querySelector(".point-tip");
    const v = voci.find(x => x.etf === etf);
    if (!tip) return;
    if (!v || !v.pts.length) { tip.hidden = true; return; }
    const h = v.pts[v.pts.length - 1];
    const primo = v.pts[0];
    const tl = R.titoliLivello(h.b, v.n, v.lv);
    tip.innerHTML = `<div class="d">${v.etf} · ${esc(v.nome)}</div>
      <div class="r"><span>Stato</span><span class="st-pill st-${v.stato}">${S.STATI[v.stato]}</span></div>
      <div class="r"><span>Sopra la media 200</span><span>${num(h.b, 1)}%${tl ? ` · ${tl.sopra}/${tl.n}` : ""}</span></div>
      <div class="r"><span>Livello blu</span><span>${num(v.lv, 0)}%${tl ? ` · ${tl.soglia}/${tl.n}` : ""}</span></div>
      <div class="r"><span>Dal livello blu</span><span>${R.segnato(h.y, 1)} punti${tl ? ` · ${tl.mancano ? R.titoli(tl.mancano) : "al livello"}` : ""}</span></div>
      <div class="r"><span>Drawdown</span><span>${pct(h.dd, 1)}</span></div>
      <div class="r"><span>Percentile del drawdown</span><span>${num(h.x, 0)}°</span></div>
      ${v.pts.length > 1 ? `<div class="r"><span>Dal ${dataIt(primo.data)}</span><span>${R.segnato(h.y - primo.y, 1)} punti</span></div>` : ""}`;
    tip.hidden = false;
    const el = box.querySelector(`.bm-sec[data-etf="${etf}"] .bm-head`);
    if (!el) return;
    const rb = box.getBoundingClientRect(), re = el.getBoundingClientRect();
    const cx = re.left + re.width / 2 - rb.left, cy = re.top + re.height / 2 - rb.top;
    const left = cx + 18 + tip.offsetWidth > rb.width ? cx - 18 - tip.offsetWidth : cx + 18;
    tip.style.left = Math.max(0, left) + "px";
    tip.style.top = Math.max(0, Math.min(rb.height - tip.offsetHeight, cy - tip.offsetHeight / 2)) + "px";
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
    const apri = e => { const el = e.target.closest("[data-etf]"); if (el) R.vai("#usa/settori/" + el.dataset.etf); };
    $("#btm-grafico").addEventListener("click", apri);
    $("#btm-grafico").addEventListener("keydown", e => { if (e.key === "Enter") apri(e); });
    $("#btm-tabella").addEventListener("click", apri);
    $("#btm-tabella").addEventListener("keydown", e => { if (e.key === "Enter") apri(e); });
    const evid = (etf, conTip) => {
      evidenza = etf;
      R.$$("#btm-grafico [data-etf]").forEach(el => el.classList.toggle("dim", !!etf && el.dataset.etf !== etf));
      R.$$("#btm-tabella tr[data-etf]").forEach(el => el.classList.toggle("hl", el.dataset.etf === etf));
      const box = $("#btm-grafico");
      if (conTip && etf) mostraTip(etf, box); else { const t = box.querySelector(".point-tip"); if (t) t.hidden = true; }
    };
    $("#btm-grafico").addEventListener("mouseover", e => { const el = e.target.closest("[data-etf]"); evid(el ? el.dataset.etf : null, true); });
    $("#btm-grafico").addEventListener("mouseleave", () => evid(null));
    $("#btm-grafico").addEventListener("focusin", e => { const el = e.target.closest("[data-etf]"); if (el) evid(el.dataset.etf, true); });
    $("#btm-tabella").addEventListener("mouseover", e => { const el = e.target.closest("tr[data-etf]"); evid(el ? el.dataset.etf : null, true); });
    $("#btm-tabella").addEventListener("mouseleave", () => evid(null));
    R.on("livelli", () => { if (visibile) disegna(); });
    R.on("tema", () => { if (visibile) disegna(); });
    window.addEventListener("resize", R.debounce(() => { if (visibile) disegna(); }, 200));
  }

  // ---------- testo per la chat ----------
  function contesto() {
    if (!voci.length) return "## Pagina aperta: Bottom Map\nI dati non sono ancora caricati.";
    const P = R.parametri();
    const out = [];
    out.push("## Pagina aperta: Bottom Map");
    out.push(`La pagina mostra ogni settore come un punto: in orizzontale la profondità del drawdown rispetto alla storia del settore (percentile: più a sinistra, più profondo), ` +
      `in verticale i punti di ampiezza sopra il livello blu. L'angolo in basso a sinistra è l'area della zona blu (ampiezza al livello o sotto e drawdown oltre ${R.art("il", P.ddIngresso + "°")} percentile); ` +
      `le fasce arancioni sono quelle di attenzione. Ogni punto ha la scia delle ultime ${settimane} settimane. A fianco, la tabella «Quanto manca».`);
    out.push("Settore | stato | punti dal livello blu (titoli che mancano) | % sopra la media 200 | drawdown | percentile del drawdown | scia settimanale (data: punti dal livello; percentile)");
    const ordinati = voci.slice().sort((a, b) => ((a.pts.length ? a.pts[a.pts.length - 1].y : 999) - (b.pts.length ? b.pts[b.pts.length - 1].y : 999)));
    for (const v of ordinati) {
      if (!v.pts.length) continue;
      const h = v.pts[v.pts.length - 1];
      const tl = R.titoliLivello(h.b, v.n, v.lv);
      const titoli = tl ? tl.mancano : 0;
      out.push(`${v.etf} ${v.nome} | ${S.STATI[v.stato]} | ${R.segnato(h.y, 1)} (${titoli ? R.titoli(titoli) : "al livello"}${tl ? `; livello = ${tl.soglia} su ${tl.n}, ora ${tl.sopra}` : ""}) | ${num(h.b, 1)}% | ${pct(h.dd, 1)} | ${num(h.x, 0)}°${h.x > P.ddIngresso ? " (oltre la soglia)" : ""} | ` +
        v.pts.map(p => `${dataIt(p.data)}: ${R.segnato(p.y, 1)}; ${num(p.x, 0)}°`).join(" → "));
    }
    return out.join("\n");
  }

  function mostra() { visibile = true; document.title = "Bottom Map · Radar Settori"; return disegna(); }
  function nascondi() { visibile = false; }

  R.viste.btm = { init, mostra, nascondi, contesto };
})();
