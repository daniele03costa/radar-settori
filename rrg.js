/*
 * Radar Settori — forza relativa di un titolo contro un termine di confronto:
 * RS-Ratio (livello) e RS-Momentum (variazione), con tre modi di calcolo,
 * barre giornaliere o settimanali e le misure della tabella (quadrante, direzione, velocità…).
 * Usabile nel browser (window.Rotazione) e in Node (module.exports) per i test.
 */
(function (root) {
  "use strict";

  const FORMULE = {
    nuova: "Nuova (normalizzata per la volatilità)",
    semplice: "Medie semplici",
    classica: "Classica (z-score)",
  };

  const QUADRANTI = {
    leader: "Leader",
    indebolimento: "In indebolimento",
    ritardo: "In ritardo",
    miglioramento: "In miglioramento",
  };

  // ---------------- medie ----------------

  function ema(values, n) {
    const out = new Array(values.length).fill(null);
    const a = 2 / (n + 1);
    let prev = null;
    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      if (v == null || !isFinite(v)) { prev = null; continue; }
      prev = prev == null ? v : a * v + (1 - a) * prev;
      out[i] = prev;
    }
    return out;
  }

  function sma(values, n) {
    const out = new Array(values.length).fill(null);
    let sum = 0, cnt = 0;
    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      if (v == null || !isFinite(v)) { sum = 0; cnt = 0; continue; }
      sum += v; cnt++;
      if (cnt > n) { sum -= values[i - n]; cnt = n; }
      if (cnt === n) out[i] = sum / n;
    }
    return out;
  }

  function zscore(values, n) {
    const out = new Array(values.length).fill(null);
    for (let i = n - 1; i < values.length; i++) {
      let s = 0, s2 = 0, ok = true;
      for (let k = i - n + 1; k <= i; k++) {
        const v = values[k];
        if (v == null || !isFinite(v)) { ok = false; break; }
        s += v; s2 += v * v;
      }
      if (!ok) continue;
      const m = s / n;
      const sd = Math.sqrt(Math.max(0, s2 / n - m * m));
      out[i] = sd > 1e-12 ? (values[i] - m) / sd : 0;
    }
    return out;
  }

  // mette a null i primi "k" valori validi (periodo di avvio delle medie)
  function avvio(values, k) {
    const out = values.slice();
    let seen = 0;
    for (let i = 0; i < out.length; i++) {
      if (out[i] == null) { seen = 0; continue; }
      if (seen < k) out[i] = null;
      seen++;
    }
    return out;
  }

  // ---------------- barre ----------------

  function lunediDi(iso) {
    const d = new Date(iso + "T00:00:00Z");
    const wd = (d.getUTCDay() + 6) % 7; // 0 = lunedì
    d.setUTCDate(d.getUTCDate() - wd);
    return d.toISOString().slice(0, 10);
  }

  /**
   * Indici delle barre: tutte le sedute (giornaliere) oppure l'ultima seduta di ogni settimana.
   * sedutaSuccessiva(iso) facoltativa: serve a capire se l'ultima settimana è ancora in corso.
   */
  function barre(date, tipo, sedutaSuccessiva) {
    if (tipo !== "settimanali") return { indici: date.map((_, i) => i), provvisoria: false };
    const indici = [];
    for (let i = 0; i < date.length; i++) {
      if (i === date.length - 1 || lunediDi(date[i + 1]) !== lunediDi(date[i])) indici.push(i);
    }
    let provvisoria = false;
    const ultima = date[date.length - 1];
    if (ultima) {
      if (sedutaSuccessiva) {
        const next = sedutaSuccessiva(ultima);
        provvisoria = !!next && lunediDi(next) === lunediDi(ultima);
      } else {
        provvisoria = new Date(ultima + "T00:00:00Z").getUTCDay() !== 5;
      }
    }
    return { indici, provvisoria };
  }

  // ---------------- formule ----------------

  function calcola(prezzo, bench, formula) {
    const N = prezzo.length;
    const rs = new Array(N).fill(null);
    for (let i = 0; i < N; i++) {
      const p = prezzo[i], q = bench[i];
      if (p != null && q != null && p > 0 && q > 0) rs[i] = p / q;
    }
    if (formula === "semplice") {
      const a = sma(rs, 10), b = sma(rs, 30);
      const ratio = a.map((v, i) => (v != null && b[i] != null ? (100 * v) / b[i] : null));
      const m9 = sma(ratio, 9);
      const mom = ratio.map((v, i) => (v != null && m9[i] != null ? (100 * v) / m9[i] : null));
      return { ratio, mom };
    }
    if (formula === "classica") {
      const s = sma(rs, 10);
      const z = zscore(s, 26);
      const ratio = z.map(v => (v == null ? null : 100 + v));
      const diff = ratio.map((v, i) => (v != null && i >= 4 && ratio[i - 4] != null ? v - ratio[i - 4] : null));
      const zm = zscore(diff, 26);
      const mom = zm.map(v => (v == null ? null : 100 + v));
      return { ratio, mom };
    }
    // nuova (predefinita)
    const lr = rs.map(v => (v == null ? null : Math.log(v)));
    const lam = Math.pow(0.5, 1 / 26);
    const sigma = new Array(N).fill(null);
    let v2 = null;
    for (let i = 1; i < N; i++) {
      if (lr[i] == null || lr[i - 1] == null) { v2 = null; continue; }
      const d = lr[i] - lr[i - 1];
      v2 = v2 == null ? d * d : lam * v2 + (1 - lam) * d * d;
      sigma[i] = Math.sqrt(v2);
    }
    const e10 = ema(lr, 10), e30 = ema(lr, 30);
    const X = lr.map((_, i) => {
      if (e10[i] == null || e30[i] == null || !sigma[i]) return null;
      return (e10[i] - e30[i]) / (sigma[i] * Math.sqrt(10));
    });
    const Xw = avvio(X, 26);
    const e8 = ema(Xw, 8);
    const ratio = Xw.map(v => (v == null ? null : 100 + 2.5 * v));
    const mom = Xw.map((v, i) => (v == null || e8[i] == null ? null : 100 + 2.5 * Math.sqrt(8) * (v - e8[i])));
    return { ratio: avvio(ratio, 4), mom: avvio(mom, 4) };
  }

  // ---------------- misure ----------------

  function quadrante(r, m) {
    if (r == null || m == null) return null;
    if (r >= 100) return m >= 100 ? "leader" : "indebolimento";
    return m >= 100 ? "miglioramento" : "ritardo";
  }

  const BUSSOLA = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];

  function misure(ratio, mom, i) {
    const r = ratio[i], m = mom[i];
    if (r == null || m == null) return null;
    const q = quadrante(r, m);
    const rp = ratio[i - 1], mp = mom[i - 1];
    const dx = rp == null ? null : r - rp;
    const dy = mp == null ? null : m - mp;
    let dir = null;
    if (dx != null && dy != null && (dx !== 0 || dy !== 0)) {
      dir = (Math.atan2(dx, dy) * 180) / Math.PI;
      if (dir < 0) dir += 360;
    }
    let durata = 0, prima = null;
    for (let k = i; k >= 0; k--) {
      const qk = quadrante(ratio[k], mom[k]);
      if (qk === q) { durata++; continue; }
      prima = qk;
      break;
    }
    return {
      ratio: r, mom: m, quadrante: q,
      dRatio: dx, dMom: dy,
      direzione: dir,
      bussola: dir == null ? null : BUSSOLA[Math.round(dir / 45) % 8],
      velocita: dx == null || dy == null ? null : Math.hypot(dx, dy),
      distanza: Math.hypot(r - 100, m - 100),
      durata,
      precedente: prima,
    };
  }

  /**
   * Scala uguale sui due assi e centrata su 100.
   * punti: array di [ratio, mom]
   */
  function scala(punti, minimo) {
    let d = minimo || 1;
    for (const p of punti) {
      if (!p || p[0] == null || p[1] == null) continue;
      d = Math.max(d, Math.abs(p[0] - 100), Math.abs(p[1] - 100));
    }
    d *= 1.12;
    return [100 - d, 100 + d];
  }

  // ---------------- tabella prezzi ----------------

  function variazione(serie, i, n) {
    const a = serie[i], b = serie[i - n];
    if (a == null || b == null || i - n < 0) return null;
    return (a / b - 1) * 100;
  }

  // passi in sedute di borsa; per le crypto si passano i giorni di calendario (w1 7, m1 30, … a1 365)
  const PASSI_BORSA = { w1: 5, m1: 21, m3: 63, m6: 126, a1: 252, max: 252, media: 200 };

  function prezzi(date, serie, passi) {
    const P = Object.assign({}, PASSI_BORSA, passi || {});
    const i = serie.length - 1;
    const last = serie[i];
    if (last == null) return null;
    const anno = date[i].slice(0, 4);
    let iy = null;
    for (let k = i; k >= 0; k--) { if (date[k].slice(0, 4) !== anno) { iy = k; break; } }
    let max = -Infinity;
    for (let k = Math.max(0, i - P.max + 1); k <= i; k++) if (serie[k] != null && serie[k] > max) max = serie[k];
    let s = 0, c = 0;
    for (let k = Math.max(0, i - P.media + 1); k <= i; k++) if (serie[k] != null) { s += serie[k]; c++; }
    return {
      ultimo: last,
      w1: variazione(serie, i, P.w1),
      m1: variazione(serie, i, P.m1),
      m3: variazione(serie, i, P.m3),
      m6: variazione(serie, i, P.m6),
      ytd: iy == null || serie[iy] == null ? null : (last / serie[iy] - 1) * 100,
      a1: variazione(serie, i, P.a1),
      dd52: isFinite(max) ? (last / max - 1) * 100 : null,
      vsM200: c >= P.media ? (last / (s / c) - 1) * 100 : null,
    };
  }

  const api = { FORMULE, QUADRANTI, BUSSOLA, ema, sma, zscore, barre, lunediDi, calcola, quadrante, misure, scala, prezzi };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Rotazione = api;
})(typeof window !== "undefined" ? window : globalThis);
