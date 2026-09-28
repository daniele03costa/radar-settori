/*
 * Radar Settori — grafici a pannelli sincronizzati su canvas (nessuna libreria esterna).
 */
(function (root) {
  "use strict";

  const MESI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];

  function css(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function niceTicks(min, max, count) {
    if (!isFinite(min) || !isFinite(max)) return [];
    if (min === max) { min -= 1; max += 1; }
    const raw = (max - min) / Math.max(1, count);
    const pow = Math.pow(10, Math.floor(Math.log10(raw)));
    let step = pow;
    for (const s of [1, 2, 2.5, 5, 10]) { if (raw <= s * pow) { step = s * pow; break; } }
    const out = [];
    for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(+v.toFixed(10));
    return out;
  }

  function logTicks(min, max) {
    const cands = [];
    const lo = Math.floor(Math.log10(min)), hi = Math.ceil(Math.log10(max));
    for (let p = lo; p <= hi; p++) for (const m of [1, 2, 5]) cands.push(m * Math.pow(10, p));
    let t = cands.filter(v => v >= min && v <= max);
    if (t.length < 3) t = niceTicks(min, max, 4).filter(v => v > 0);
    return t;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // colore leggibile sopra uno sfondo (per il testo delle etichette)
  function textOn(color) {
    const c = document.createElement("canvas").getContext("2d");
    c.fillStyle = color; const hex = c.fillStyle;
    if (!/^#/.test(hex)) return "#000";
    const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? "#0b0f16" : "#ffffff";
  }

  class Pannelli {
    /**
     * rootEl: contenitore
     * opts.pannelli: [{ id, altezza, formato(v) }]
     * opts.tooltip(i) -> html
     */
    constructor(rootEl, opts) {
      this.root = rootEl;
      this.opts = opts;
      this.hover = null;
      this.state = null;
      this.panes = opts.pannelli.map((p, k) => this._makePane(p, k === opts.pannelli.length - 1));
      this.tip = document.createElement("div");
      this.tip.className = "chart-tip";
      this.tip.hidden = true;
      this.root.appendChild(this.tip);
      this._ro = new ResizeObserver(() => this.draw());
      this._ro.observe(this.root);
    }

    _makePane(p, last) {
      const wrap = document.createElement("div");
      wrap.className = "pane";
      wrap.style.height = (p.altezza + (last ? 26 : 0)) + "px";
      const label = document.createElement("div");
      label.className = "pane-label";
      const base = document.createElement("canvas");
      const over = document.createElement("canvas");
      wrap.append(base, over, label);
      this.root.appendChild(wrap);
      const pane = Object.assign({}, p, { wrap, base, over, label, last });
      const move = (ev) => {
        const pt = ev.touches ? ev.touches[0] : ev;
        const r = wrap.getBoundingClientRect();
        this._setHover(this._indexAt(pt.clientX - r.left), pt.clientX - this.root.getBoundingClientRect().left);
      };
      wrap.addEventListener("mousemove", move);
      wrap.addEventListener("touchstart", move, { passive: true });
      wrap.addEventListener("touchmove", move, { passive: true });
      wrap.addEventListener("mouseleave", () => this._setHover(null));
      return pane;
    }

    setData(state) {
      this.state = state;
      this.panes.forEach(p => { p.label.textContent = (state.etichette && state.etichette[p.id]) || ""; });
      this.draw();
    }

    _geom(pane) {
      const w = this.root.clientWidth;
      const h = pane.altezza + (pane.last ? 26 : 0);
      return { w, h, left: 8, right: 70, top: 34, bottom: pane.last ? 28 : 10 };
    }

    _x(i, g) {
      const { i0, i1 } = this.state;
      return g.left + ((i - i0) / Math.max(1, i1 - i0)) * (g.w - g.left - g.right);
    }

    _indexAt(px) {
      if (!this.state) return null;
      const g = this._geom(this.panes[0]);
      const { i0, i1 } = this.state;
      const t = (px - g.left) / (g.w - g.left - g.right);
      return Math.max(i0, Math.min(i1, Math.round(i0 + t * (i1 - i0))));
    }

    _range(data) {
      if (data.range) return data.range.slice();
      const { i0, i1 } = this.state;
      let lo = Infinity, hi = -Infinity;
      for (const s of data.serie) {
        for (let i = i0; i <= i1; i++) {
          const v = s.valori[i];
          if (v == null || (data.log && v <= 0)) continue;
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
      }
      for (const h of data.linee || []) { lo = Math.min(lo, h.y); hi = Math.max(hi, h.y); }
      if (data.includiZero) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
      if (!isFinite(lo)) return [0, 1];
      if (data.log) {
        const a = Math.log(lo), b = Math.log(hi), pad = (b - a || 1) * 0.07;
        return [Math.exp(a - pad), Math.exp(b + pad)];
      }
      const pad = (hi - lo || 1) * 0.08;
      return [lo - pad, data.includiZero && hi <= 0 ? pad * 0.25 : hi + pad];
    }

    _yFn(range, g, log) {
      const [lo, hi] = range;
      const top = g.top, bot = g.h - g.bottom;
      if (log) {
        const a = Math.log(lo), b = Math.log(hi);
        return v => bot - ((Math.log(v) - a) / (b - a)) * (bot - top);
      }
      return v => bot - ((v - lo) / (hi - lo)) * (bot - top);
    }

    _prep(canvas, g) {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(g.w * dpr);
      canvas.height = Math.round(g.h * dpr);
      canvas.style.width = g.w + "px";
      canvas.style.height = g.h + "px";
      const ctx = canvas.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, g.w, g.h);
      return ctx;
    }

    draw() {
      if (!this.state) return;
      for (const pane of this.panes) this._drawPane(pane);
      this._drawHover();
    }

    _xTicks(g) {
      const { date, i0, i1 } = this.state;
      const months = (new Date(date[i1]) - new Date(date[i0])) / (30.44 * 864e5);
      const maxLabels = Math.max(2, Math.floor((g.w - g.left - g.right) / 78));
      const step = [1, 2, 3, 6, 12, 24, 36, 60].find(s => months / s <= maxLabels) || 60;
      const ticks = [];
      let prevKey = null;
      for (let i = i0; i <= i1; i++) {
        const y = +date[i].slice(0, 4), m = +date[i].slice(5, 7) - 1;
        const key = y * 12 + m;
        if (key !== prevKey && prevKey !== null) {
          const ok = step >= 12 ? (m === 0 && y % (step / 12) === 0) : (key % step === 0);
          if (ok) ticks.push({ i, label: step >= 12 ? String(y) : `${MESI[m]} ${String(y).slice(2)}` });
        }
        prevKey = key;
      }
      return ticks;
    }

    _pill(ctx, x, y, text, bg, maxW) {
      ctx.font = `600 11px ${css("--font")}`;
      const tw = Math.min(ctx.measureText(text).width + 12, maxW);
      ctx.fillStyle = bg;
      roundRect(ctx, x, y - 9, tw, 18, 5); ctx.fill();
      ctx.fillStyle = textOn(bg);
      ctx.textAlign = "left"; ctx.textBaseline = "middle";
      ctx.fillText(text, x + 6, y + 0.5);
    }

    _drawPane(pane) {
      const data = this.state.pannelli[pane.id];
      const g = this._geom(pane);
      const ctx = this._prep(pane.base, g);
      this._prep(pane.over, g);
      if (!data) return;
      const range = this._range(data);
      const y = this._yFn(range, g, data.log);
      pane._y = y; pane._data = data;
      const { i0, i1 } = this.state;
      const plotR = g.w - g.right, plotB = g.h - g.bottom;
      const grid = css("--grid"), muted = css("--muted");
      const mono = css("--font");

      // zone di washout
      const zone = this.state.zone || [];
      for (const z of zone) {
        if (z[1] < i0 || z[0] > i1) continue;
        const xa = this._x(Math.max(z[0], i0), g), xb = this._x(Math.min(z[1], i1), g);
        const w = Math.max(2, xb - xa);
        ctx.fillStyle = css("--zona");
        ctx.fillRect(xa, g.top - 8, w, plotB - g.top + 8);
        ctx.fillStyle = css("--zona-bordo");
        ctx.fillRect(xa, g.top - 8, 1.5, plotB - g.top + 8);
        if (pane.id === this.panes[0].id && w > 66) {
          ctx.font = `600 10.5px ${css("--font")}`;
          ctx.fillStyle = css("--soglia"); ctx.textAlign = "left"; ctx.textBaseline = "top";
          ctx.fillText(this.opts.etichettaZona || "zona", xa + 6, g.top - 4);
        }
      }

      // griglia orizzontale + etichette asse y
      const ticks = data.log ? logTicks(range[0], range[1]) : niceTicks(range[0], range[1], pane.altezza > 200 ? 5 : pane.altezza > 130 ? 4 : 3);
      const pillsY = (data.serie || []).filter(s => s.pill).map(s => lastVal(s.valori, i0, i1)).filter(v => v != null).map(v => y(v))
        .concat((data.linee || []).filter(h => h.etichetta).map(h => y(h.y)));
      ctx.font = `11px ${mono}`;
      ctx.textAlign = "left"; ctx.textBaseline = "middle";
      for (const t of ticks) {
        const yy = Math.round(y(t)) + 0.5;
        if (yy < g.top - 6 || yy > plotB + 1) continue;
        ctx.strokeStyle = grid; ctx.lineWidth = 1; ctx.setLineDash([]);
        ctx.beginPath(); ctx.moveTo(g.left, yy); ctx.lineTo(plotR, yy); ctx.stroke();
        if (pillsY.some(py => Math.abs(py - yy) < 14)) continue;
        ctx.fillStyle = muted;
        ctx.fillText(pane.formato ? pane.formato(t) : String(t), plotR + 10, yy);
      }

      // griglia verticale + etichette asse x
      ctx.font = `11px ${css("--font")}`;
      for (const t of this._xTicks(g)) {
        const xx = Math.round(this._x(t.i, g)) + 0.5;
        ctx.strokeStyle = grid; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(xx, g.top - 8); ctx.lineTo(xx, plotB); ctx.stroke();
        if (pane.last) {
          const half = ctx.measureText(t.label).width / 2;
          if (xx - half < 0 || xx + half > plotR + 20) continue;
          ctx.fillStyle = muted; ctx.textAlign = "center"; ctx.textBaseline = "top";
          ctx.fillText(t.label, xx, plotB + 9);
        }
      }

      // linee orizzontali (soglia)
      for (const h of data.linee || []) {
        const yy = Math.round(y(h.y)) + 0.5;
        ctx.strokeStyle = h.colore; ctx.lineWidth = h.spessore || 1.5;
        ctx.setLineDash(h.tratteggio || []);
        ctx.beginPath(); ctx.moveTo(g.left, yy); ctx.lineTo(plotR, yy); ctx.stroke();
        ctx.setLineDash([]);
      }

      // serie
      ctx.save();
      ctx.beginPath(); ctx.rect(g.left, 0, plotR - g.left, plotB + 1); ctx.clip();
      for (const s of data.serie) {
        const pts = [];
        for (let i = i0; i <= i1; i++) {
          const v = s.valori[i];
          pts.push(v == null || (data.log && v <= 0) ? null : [this._x(i, g), y(v)]);
        }
        if (s.area) {
          // area sfumata: verso la base (0) oppure verso il fondo del pannello
          const baseY = s.base === "fondo" ? plotB : y(Math.max(range[0], Math.min(range[1], s.base || 0)));
          let topY = Infinity, botY = -Infinity;
          for (const p of pts) if (p) { topY = Math.min(topY, p[1]); botY = Math.max(botY, p[1]); }
          const grad = s.base === "fondo"
            ? ctx.createLinearGradient(0, topY, 0, plotB)
            : ctx.createLinearGradient(0, baseY, 0, botY);
          grad.addColorStop(0, s.base === "fondo" ? s.area : "rgba(0,0,0,0)");
          grad.addColorStop(1, s.base === "fondo" ? "rgba(0,0,0,0)" : s.area);
          ctx.fillStyle = grad;
          let open = false, firstX = 0, lastX = 0;
          ctx.beginPath();
          for (const p of pts) {
            if (!p) { if (open) { ctx.lineTo(lastX, baseY); ctx.lineTo(firstX, baseY); ctx.closePath(); open = false; } continue; }
            if (!open) { ctx.moveTo(p[0], baseY); ctx.lineTo(p[0], p[1]); firstX = p[0]; open = true; }
            else ctx.lineTo(p[0], p[1]);
            lastX = p[0];
          }
          if (open) { ctx.lineTo(lastX, baseY); ctx.lineTo(firstX, baseY); ctx.closePath(); }
          ctx.fill();
        }
        ctx.strokeStyle = s.colore; ctx.lineWidth = s.spessore || 1.6;
        ctx.setLineDash(s.tratteggio || []); ctx.lineJoin = "round"; ctx.lineCap = "round";
        ctx.beginPath();
        let pen = false;
        for (const p of pts) {
          if (!p) { pen = false; continue; }
          if (pen) ctx.lineTo(p[0], p[1]); else { ctx.moveTo(p[0], p[1]); pen = true; }
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.restore();

      // marcatori (segnali)
      const surface = css("--surface");
      for (const m of data.marcatori || []) {
        if (m.i < i0 || m.i > i1) continue;
        const xx = this._x(m.i, g);
        if (m.y == null) {
          ctx.strokeStyle = m.colore; ctx.lineWidth = 1.5; ctx.setLineDash(m.vuoto ? [2, 3] : []);
          ctx.beginPath(); ctx.moveTo(xx, g.top - 8); ctx.lineTo(xx, plotB); ctx.stroke();
          ctx.setLineDash([]);
          continue;
        }
        const yy = Math.min(plotB - 8, y(m.y) + 13);
        ctx.beginPath();
        ctx.moveTo(xx, yy - 8); ctx.lineTo(xx + 7.5, yy + 6); ctx.lineTo(xx - 7.5, yy + 6); ctx.closePath();
        ctx.lineWidth = 2; ctx.strokeStyle = m.vuoto ? m.colore : surface;
        ctx.fillStyle = m.vuoto ? surface : m.colore;
        ctx.fill(); ctx.stroke();
      }

      // nota sul minimo (es. peggior drawdown nel periodo)
      if (data.notaMinimo) {
        const s = data.serie[0];
        let mi = null;
        for (let i = i0; i <= i1; i++) if (s.valori[i] != null && (mi == null || s.valori[i] < s.valori[mi])) mi = i;
        if (mi != null) {
          const xx = this._x(mi, g), yy = y(s.valori[mi]);
          const txt = data.notaMinimo(s.valori[mi]);
          ctx.font = `600 12px ${css("--font")}`;
          const tw = ctx.measureText(txt).width + 14;
          let tx = xx + 10; if (tx + tw > plotR - 4) tx = xx - 10 - tw; tx = Math.max(g.left + 2, tx);
          const ty = Math.min(yy, plotB - 12);
          ctx.fillStyle = css("--tip-bg");
          roundRect(ctx, tx, ty - 11, tw, 22, 6); ctx.fill();
          ctx.strokeStyle = s.colore; ctx.lineWidth = 1; ctx.stroke();
          ctx.fillStyle = css("--ink"); ctx.textAlign = "left"; ctx.textBaseline = "middle";
          ctx.fillText(txt, tx + 7, ty + 0.5);
          ctx.beginPath(); ctx.arc(xx, yy, 4, 0, Math.PI * 2); ctx.fillStyle = s.colore; ctx.fill();
          ctx.lineWidth = 2; ctx.strokeStyle = surface; ctx.stroke();
        }
      }

      // etichette sul lato destro: ultimo valore delle serie + soglia
      const pills = [];
      for (const s of data.serie) {
        if (!s.pill) continue;
        const v = lastVal(s.valori, i0, i1);
        if (v == null) continue;
        pills.push({ y: y(v), text: pane.formatoPill ? pane.formatoPill(v) : (pane.formato ? pane.formato(v) : String(v)), bg: s.colore });
      }
      for (const h of data.linee || []) if (h.etichetta) pills.push({ y: y(h.y), text: h.etichetta, bg: h.colore });
      pills.sort((a, b) => a.y - b.y);
      for (let k = 1; k < pills.length; k++) if (pills[k].y - pills[k - 1].y < 22) pills[k].y = pills[k - 1].y + 22;
      for (const p of pills) this._pill(ctx, plotR + 4, Math.max(g.top - 4, Math.min(plotB + 4, p.y)), p.text, p.bg, g.right - 6);
    }

    _setHover(i, px) {
      this.hover = i;
      this._hoverPx = px;
      this._drawHover();
    }

    _drawHover() {
      const i = this.hover;
      const surface = css("--surface");
      for (const pane of this.panes) {
        const g = this._geom(pane);
        const ctx = pane.over.getContext("2d");
        const dpr = window.devicePixelRatio || 1;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, g.w, g.h);
        if (i == null || !pane._data) continue;
        const xx = Math.round(this._x(i, g)) + 0.5;
        const plotB = g.h - g.bottom;
        ctx.strokeStyle = css("--cross"); ctx.lineWidth = 1; ctx.setLineDash([]);
        ctx.beginPath(); ctx.moveTo(xx, g.top - 8); ctx.lineTo(xx, plotB); ctx.stroke();
        ctx.setLineDash([]);
        for (const s of pane._data.serie) {
          const v = s.valori[i];
          if (v == null || (pane._data.log && v <= 0)) continue;
          ctx.beginPath(); ctx.arc(xx, pane._y(v), 4.5, 0, Math.PI * 2);
          ctx.fillStyle = s.colore; ctx.fill();
          ctx.lineWidth = 2; ctx.strokeStyle = surface; ctx.stroke();
        }
        if (pane.last && this.state) {
          const d = this.state.date[i];
          const txt = `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
          ctx.font = `600 12px ${css("--font")}`;
          const tw = ctx.measureText(txt).width + 14;
          const bx = Math.max(2, Math.min(g.w - g.right - tw, xx - tw / 2));
          ctx.fillStyle = css("--ink");
          roundRect(ctx, bx, plotB + 4, tw, 21, 6); ctx.fill();
          ctx.fillStyle = css("--bg"); ctx.textAlign = "left"; ctx.textBaseline = "middle";
          ctx.fillText(txt, bx + 7, plotB + 15);
        }
      }
      if (i == null || !this.opts.tooltip) { this.tip.hidden = true; return; }
      this.tip.innerHTML = this.opts.tooltip(i);
      this.tip.hidden = false;
      const W = this.root.clientWidth, tw = this.tip.offsetWidth;
      let left = (this._hoverPx || 0) + 18;
      if (left + tw > W - 74) left = (this._hoverPx || 0) - tw - 18;
      this.tip.style.left = Math.max(4, left) + "px";
    }
  }

  function lastVal(arr, i0, i1) {
    for (let i = i1; i >= i0; i--) if (arr[i] != null) return arr[i];
    return null;
  }

  root.Pannelli = Pannelli;
})(window);
