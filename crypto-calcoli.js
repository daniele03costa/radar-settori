/*
 * Radar Settori — calcoli della zona Crypto (nel browser e in Node per i test).
 *
 * Le serie sono giornaliere su tutti i giorni di calendario (le crypto quotano sempre): le medie a 50 e
 * 200 giorni sono quindi medie di 50 e 200 giorni di calendario, come si usa per bitcoin; la "media
 * 200 settimane" è la media degli ultimi 1400 giorni.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Crypto = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const STATI = {
    rialzo: "Tendenza positiva",   // prezzo sopra la media 200 e media 50 sopra la media 200
    recupero: "In recupero",       // prezzo sopra la media 200, media 50 ancora sotto
    debolezza: "In indebolimento", // prezzo sotto la media 200, media 50 ancora sopra
    ribasso: "Tendenza negativa",  // prezzo sotto la media 200 e media 50 sotto la media 200
  };
  const ORDINE_STATI = ["rialzo", "recupero", "debolezza", "ribasso"];

  // fasce usate per «cosa è successo dopo»
  const FASCE = {
    mayer: [
      { k: "m1", nome: "sotto 0,8", da: -Infinity, a: 0.8 },
      { k: "m2", nome: "fra 0,8 e 1", da: 0.8, a: 1 },
      { k: "m3", nome: "fra 1 e 1,5", da: 1, a: 1.5 },
      { k: "m4", nome: "fra 1,5 e 2,4", da: 1.5, a: 2.4 },
      { k: "m5", nome: "sopra 2,4", da: 2.4, a: Infinity },
    ],
    massimo: [
      { k: "d1", nome: "oltre −70% dal massimo", da: -Infinity, a: -0.7 },
      { k: "d2", nome: "fra −50% e −70%", da: -0.7, a: -0.5 },
      { k: "d3", nome: "fra −30% e −50%", da: -0.5, a: -0.3 },
      { k: "d4", nome: "fra −15% e −30%", da: -0.3, a: -0.15 },
      { k: "d5", nome: "entro −15% dal massimo", da: -0.15, a: Infinity },
    ],
    paura: [
      { k: "f1", nome: "paura estrema (0–24)", da: -Infinity, a: 25 },
      { k: "f2", nome: "paura (25–44)", da: 25, a: 45 },
      { k: "f3", nome: "neutrale (45–55)", da: 45, a: 56 },
      { k: "f4", nome: "avidità (56–75)", da: 56, a: 76 },
      { k: "f5", nome: "avidità estrema (76–100)", da: 76, a: Infinity },
    ],
  };
  const fascia = (lista, v) => (v == null || !isFinite(v) ? null : (lista.find(f => v >= f.da && v < f.a) || null));

  // ---------------- serie di base ----------------

  // media mobile semplice; un valore mancante fa ripartire la finestra
  function sma(v, n) {
    const out = new Array(v.length).fill(null);
    let s = 0, k = 0;
    for (let i = 0; i < v.length; i++) {
      const x = v[i];
      if (x == null) { s = 0; k = 0; continue; }
      s += x; k++;
      if (k > n) { s -= v[i - n]; k = n; }
      if (k === n) out[i] = s / n;
    }
    return out;
  }

  const logRend = p => p.map((x, i) => (i > 0 && x != null && p[i - 1] != null && x > 0 && p[i - 1] > 0 ? Math.log(x / p[i - 1]) : null));

  function drawdown(p) {
    let max = -Infinity;
    return p.map(x => {
      if (x == null) return null;
      if (x > max) max = x;
      return x / max - 1;
    });
  }

  const statoDi = (p, m50, m200) => {
    if (p == null || m50 == null || m200 == null) return null;
    if (p >= m200) return m50 >= m200 ? "rialzo" : "recupero";
    return m50 >= m200 ? "debolezza" : "ribasso";
  };

  // da quanti giorni il prezzo è dalla stessa parte della media 200
  function striscia(p, m200, i) {
    if (p[i] == null || m200[i] == null) return null;
    const sopra = p[i] >= m200[i];
    let k = i;
    while (k > 0 && p[k - 1] != null && m200[k - 1] != null && (p[k - 1] >= m200[k - 1]) === sopra) k--;
    return { sopra, giorni: i - k + 1, dal: k };
  }

  const varia = (p, i, n) => (i - n >= 0 && p[i] != null && p[i - n] != null && p[i - n] > 0 ? p[i] / p[i - n] - 1 : null);

  function volatilita(r, i, n) {
    let s = 0, s2 = 0, k = 0;
    for (let j = Math.max(0, i - n + 1); j <= i; j++) if (r[j] != null) { s += r[j]; s2 += r[j] * r[j]; k++; }
    if (k < Math.min(20, n)) return null;
    const m = s / k;
    return Math.sqrt(Math.max(0, s2 / k - m * m)) * Math.sqrt(365);
  }

  // correlazione e beta di a rispetto a b fra gli indici i0 e i1 (compresi), solo coppie complete
  function legame(a, b, i0, i1, minimo = 10) {
    let n = 0, sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
    for (let i = Math.max(0, i0); i <= i1; i++) {
      const x = a[i], y = b[i];
      if (x == null || y == null) continue;
      n++; sa += x; sb += y; saa += x * x; sbb += y * y; sab += x * y;
    }
    if (n < minimo) return null;
    const ma = sa / n, mb = sb / n;
    const cov = sab / n - ma * mb, va = saa / n - ma * ma, vb = sbb / n - mb * mb;
    if (va <= 1e-14 || vb <= 1e-14) return null;
    return { r: Math.max(-1, Math.min(1, cov / Math.sqrt(va * vb))), beta: cov / vb, n };
  }

  // ---------------- analisi di una moneta ----------------

  function analizza(p, date) {
    const N = p.length, t = N - 1;
    const m50 = sma(p, 50), m200 = sma(p, 200), m1400 = sma(p, 1400);
    const dd = drawdown(p), r = logRend(p);
    const mayer = p.map((x, i) => (x != null && m200[i] ? x / m200[i] : null));
    const stati = p.map((x, i) => statoDi(x, m50[i], m200[i]));
    let iAth = -1;
    for (let i = 0; i <= t; i++) if (p[i] != null && (iAth < 0 || p[i] >= p[iAth])) iAth = i;
    const primo = p.findIndex(x => x != null);
    // fine dell'anno scorso, per «da inizio anno»
    const anno = date[t].slice(0, 4);
    let iAnno = null;
    for (let i = t; i >= 0; i--) if (date[i].slice(0, 4) !== anno) { iAnno = i; break; }
    const ytd = iAnno != null && p[iAnno] != null && iAnno >= primo ? p[t] / p[iAnno] - 1 : null;
    // percentile del multiplo di Mayer di oggi rispetto a tutta la storia
    let sotto = 0, tot = 0;
    for (const v of mayer) if (v != null) { tot++; if (v < mayer[t]) sotto++; }
    return {
      p, date, m50, m200, m1400, dd, r, mayer, stati, primo,
      oggi: {
        prezzo: p[t], data: date[t],
        g1: varia(p, t, 1), g7: varia(p, t, 7), g30: varia(p, t, 30), g90: varia(p, t, 90), g365: varia(p, t, 365), ytd,
        vs50: m50[t] ? p[t] / m50[t] - 1 : null, vs200: m200[t] ? p[t] / m200[t] - 1 : null,
        vs1400: m1400[t] ? p[t] / m1400[t] - 1 : null, m1400: m1400[t], m200: m200[t],
        mayer: mayer[t], mayerPercentile: mayer[t] == null || !tot ? null : (sotto / tot) * 100,
        stato: stati[t], striscia: striscia(p, m200, t),
        dd: dd[t], ath: iAth >= 0 ? { prezzo: p[iAth], data: date[iAth], i: iAth } : null,
        vol30: volatilita(r, t, 30), giorniStoria: primo >= 0 ? t - primo + 1 : 0,
      },
    };
  }

  // forza rispetto a bitcoin: rapporto fra i prezzi, sua media 200, rendimento relativo a 90 giorni, beta
  function controBtc(a, btc) {
    const t = a.p.length - 1;
    const rapporto = a.p.map((x, i) => (x != null && btc.p[i] ? x / btc.p[i] : null));
    const m200 = sma(rapporto, 200);
    const g90 = varia(a.p, t, 90), b90 = varia(btc.p, t, 90);
    const l = legame(a.r, btc.r, t - 89, t, 30);
    return {
      rapporto, m200,
      sopraMedia: rapporto[t] != null && m200[t] != null ? rapporto[t] >= m200[t] : null,
      rel90: g90 != null && b90 != null ? (1 + g90) / (1 + b90) - 1 : null,
      corr90: l ? l.r : null, beta90: l ? l.beta : null,
    };
  }

  // ---------------- cosa è successo dopo ----------------

  function statistiche(valori) {
    if (!valori.length) return null;
    const v = valori.slice().sort((x, y) => x - y);
    const q = f => { const k = (v.length - 1) * f, a = Math.floor(k), b = Math.ceil(k); return v[a] + (v[b] - v[a]) * (k - a); };
    return {
      casi: v.length, mediana: q(0.5), p10: q(0.1), p90: q(0.9),
      media: v.reduce((s, x) => s + x, 0) / v.length, positivi: v.filter(x => x > 0).length / v.length,
    };
  }

  // per ogni gruppo: statistiche dei rendimenti a h giorni ed «episodi» (tratti consecutivi nello stesso gruppo)
  function dopo(p, gruppi, h) {
    const per = {}, episodi = {};
    let prec = null;
    for (let i = 0; i < p.length; i++) {
      const g = gruppi[i];
      const valido = g != null && i + h < p.length && p[i] != null && p[i + h] != null;
      if (valido) {
        (per[g] = per[g] || []).push(p[i + h] / p[i] - 1);
        if (prec !== g) episodi[g] = (episodi[g] || 0) + 1;
      }
      prec = valido ? g : null;
    }
    const out = {};
    for (const g of Object.keys(per)) out[g] = Object.assign(statistiche(per[g]), { episodi: episodi[g] });
    return out;
  }

  // le condizioni di ogni giorno: sopra/sotto la media 200, tendenza, Mayer, distanza dal massimo, Fear & Greed
  function condizioni(a, paura) {
    const N = a.p.length;
    const out = { media200: new Array(N).fill(null), tendenza: a.stati.slice(), mayer: new Array(N).fill(null), massimo: new Array(N).fill(null), paura: new Array(N).fill(null) };
    for (let i = 0; i < N; i++) {
      if (a.p[i] != null && a.m200[i] != null) out.media200[i] = a.p[i] >= a.m200[i] ? "sopra" : "sotto";
      const fm = fascia(FASCE.mayer, a.mayer[i]);
      if (fm) out.mayer[i] = fm.k;
      // la distanza dal massimo conta solo con almeno un anno di storia alle spalle
      if (a.dd[i] != null && i - a.primo >= 365) { const fd = fascia(FASCE.massimo, a.dd[i]); if (fd) out.massimo[i] = fd.k; }
      if (paura && paura[i] != null) { const ff = fascia(FASCE.paura, paura[i]); if (ff) out.paura[i] = ff.k; }
    }
    return out;
  }

  // ---------------- la regola della media 200 ----------------

  // investito il giorno dopo ogni chiusura sopra la media 200, fuori (liquidità a zero) dopo una chiusura sotto
  function regola200(p, m200) {
    const i0 = m200.findIndex(v => v != null);
    if (i0 < 0) return null;
    let eqA = 1, eqB = 1, maxA = 1, maxB = 1, ddA = 0, ddB = 0, dentro = 0, giorni = 0, entrate = 0, prima = null;
    for (let i = i0 + 1; i < p.length; i++) {
      if (p[i] == null || p[i - 1] == null) continue;
      const g = p[i] / p[i - 1];
      const inv = m200[i - 1] != null ? p[i - 1] >= m200[i - 1] : !!prima;
      eqA *= g;
      if (inv) { eqB *= g; dentro++; }
      if (inv && prima === false) entrate++;
      if (inv && prima === null) entrate++;
      prima = inv;
      giorni++;
      if (eqA > maxA) maxA = eqA;
      if (eqB > maxB) maxB = eqB;
      ddA = Math.min(ddA, eqA / maxA - 1);
      ddB = Math.min(ddB, eqB / maxB - 1);
    }
    if (giorni < 30) return null;
    const anni = giorni / 365;
    const cagr = m => Math.pow(m, 1 / anni) - 1;
    return {
      da: i0, anni,
      sempre: { multiplo: eqA, cagr: cagr(eqA), maxdd: ddA },
      regola: { multiplo: eqB, cagr: cagr(eqB), maxdd: ddB, tempo: dentro / giorni, entrate, entrateAnno: entrate / anni },
    };
  }

  // ---------------- stagionalità ----------------

  function mensili(p, date) {
    const fine = new Map();                                 // "AAAA-MM" → ultima chiusura del mese
    for (let i = 0; i < p.length; i++) if (p[i] != null) fine.set(date[i].slice(0, 7), { v: p[i], i });
    const mesi = Array.from(fine.keys()).sort();
    const ultimo = date[date.length - 1];
    const meseInCorso = ultimo.slice(0, 7);
    // il mese è finito se l'ultimo giorno disponibile è l'ultimo del mese
    const d = new Date(ultimo + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + 1);
    const inCorso = d.toISOString().slice(0, 7) === meseInCorso ? meseInCorso : null;
    const tab = {};
    const precedente = m => { const [a, n] = m.split("-").map(Number); return n === 1 ? `${a - 1}-12` : `${a}-${String(n - 1).padStart(2, "0")}`; };
    for (const m of mesi) {
      const pm = precedente(m);
      if (!fine.has(pm)) continue;
      const [a, n] = m.split("-").map(Number);
      tab[a] = tab[a] || { mesi: new Array(12).fill(null), anno: null };
      tab[a].mesi[n - 1] = fine.get(m).v / fine.get(pm).v - 1;
    }
    for (const a of Object.keys(tab)) {
      const dic = fine.get(`${Number(a) - 1}-12`), fin = fine.get(`${a}-12`) || (Number(a) === Number(ultimo.slice(0, 4)) ? { v: p[p.length - 1] } : null);
      tab[a].anno = dic && fin ? fin.v / dic.v - 1 : null;
    }
    const riepilogo = [];
    for (let k = 0; k < 12; k++) {
      const vals = [];
      for (const a of Object.keys(tab)) {
        const v = tab[a].mesi[k];
        const chiave = `${a}-${String(k + 1).padStart(2, "0")}`;
        if (v != null && chiave !== inCorso) vals.push(v);
      }
      const s = statistiche(vals);
      riepilogo.push(s ? { media: s.media, mediana: s.mediana, positivi: Math.round(s.positivi * s.casi), casi: s.casi } : null);
    }
    return { anni: Object.keys(tab).map(Number).sort((x, y) => x - y), tab, riepilogo, inCorso };
  }

  // ---------------- cicli dell'halving ----------------

  const GIORNI_CICLO = 1460;
  const GIORNI_MASSIMO = 730;     // il massimo del ciclo si cerca nei primi due anni: lì sono arrivati tutti i massimi passati

  function cicli(p, date, halving) {
    const out = [];
    for (const h of halving || []) {
      const i = date.indexOf(h);
      if (i < 0 || p[i] == null) continue;
      const fine = Math.min(p.length - 1, i + GIORNI_CICLO);
      const serie = [];
      for (let k = i; k <= fine; k++) serie.push(p[k] == null ? null : p[k] / p[i]);
      let im = 0;
      serie.forEach((v, k) => { if (v != null && k <= GIORNI_MASSIMO && v > serie[im]) im = k; });
      let iMin = im;
      for (let k = im; k < serie.length; k++) if (serie[k] != null && serie[k] < serie[iMin]) iMin = k;
      out.push({
        data: h, i, serie, completo: i + GIORNI_CICLO <= p.length - 1, giorni: serie.length - 1,
        massimo: { giorno: im, multiplo: serie[im], data: date[i + im], prezzo: p[i + im] },
        minimo: { giorno: iMin, calo: serie[iMin] / serie[im] - 1, data: date[i + iMin], prezzo: p[i + iMin] },
        oggi: { multiplo: serie[serie.length - 1], dalMassimo: serie[serie.length - 1] / serie[im] - 1 },
      });
    }
    return out;
  }

  // ---------------- mercati ----------------

  // coppie di rendimenti fra sedute consecutive di un mercato (le crypto nello stesso intervallo, weekend compreso)
  function coppieSedute(p, q) {
    const giorni = [], a = [], b = [];
    let j = -1;
    for (let i = 0; i < q.length; i++) {
      if (q[i] == null) continue;
      if (j >= 0 && p[i] != null && p[j] != null && p[i] > 0 && p[j] > 0 && q[j] > 0) {
        giorni.push(i); a.push(Math.log(p[i] / p[j])); b.push(Math.log(q[i] / q[j]));
      }
      j = i;
    }
    return { giorni, a, b };
  }

  // correlazione mobile su una finestra di giorni di calendario, calcolata in ogni seduta
  function correlazioneMobile(p, q, finestra = 90, minimo = 30) {
    const c = coppieSedute(p, q);
    const out = new Array(q.length).fill(null);
    let s = 0;
    const acc = { n: 0, sa: 0, sb: 0, saa: 0, sbb: 0, sab: 0 };
    const agg = (k, segno) => { const x = c.a[k], y = c.b[k]; acc.n += segno; acc.sa += segno * x; acc.sb += segno * y; acc.saa += segno * x * x; acc.sbb += segno * y * y; acc.sab += segno * x * y; };
    for (let k = 0; k < c.giorni.length; k++) {
      agg(k, 1);
      while (c.giorni[s] <= c.giorni[k] - finestra) { agg(s, -1); s++; }
      if (acc.n < minimo) continue;
      const ma = acc.sa / acc.n, mb = acc.sb / acc.n;
      const va = acc.saa / acc.n - ma * ma, vb = acc.sbb / acc.n - mb * mb;
      if (va <= 1e-14 || vb <= 1e-14) continue;
      out[c.giorni[k]] = Math.max(-1, Math.min(1, (acc.sab / acc.n - ma * mb) / Math.sqrt(va * vb)));
    }
    return out;
  }

  // quante monete sono sopra la propria media 200, giorno per giorno
  function ampiezza(analisi) {
    const N = analisi[0].p.length;
    const sopra = new Array(N).fill(null), totale = new Array(N).fill(null);
    for (let i = 0; i < N; i++) {
      let s = 0, n = 0;
      for (const a of analisi) if (a.p[i] != null && a.m200[i] != null) { n++; if (a.p[i] >= a.m200[i]) s++; }
      if (n) { sopra[i] = s; totale[i] = n; }
    }
    return { sopra, totale };
  }

  return {
    STATI, ORDINE_STATI, FASCE, GIORNI_CICLO, GIORNI_MASSIMO, fascia,
    sma, logRend, drawdown, statoDi, striscia, varia, volatilita, legame,
    analizza, controBtc, statistiche, dopo, condizioni, regola200, mensili, cicli, coppieSedute, correlazioneMobile, ampiezza,
  };
});
