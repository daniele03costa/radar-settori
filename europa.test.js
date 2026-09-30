// Test dei calcoli della vista Europa: node --test europa.test.js
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const E = require("./europa-calcoli.js");
const Rot = require("./rrg.js");

const vicino = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);
const feriali = (da, n) => {
  const out = [];
  let d = Date.parse(da + "T00:00:00Z");
  while (out.length < n) { const g = new Date(d); if (g.getUTCDay() % 6) out.push(g.toISOString().slice(0, 10)); d += 864e5; }
  return out;
};

test("serie piene, buchi riempiti e medie", () => {
  const a = E.piena(6, 2, [10, null, 12]);
  assert.deepEqual(a, [null, null, 10, null, 12, null]);
  assert.deepEqual(E.riempi(a), [null, null, 10, 10, 12, 12]);
  assert.equal(E.ultimoVero(a), 4);
  assert.deepEqual(E.sma([1, 2, 3, 4, null, 6, 7, 8], 3), [null, null, 2, 3, null, null, null, 7]);
});

test("cambi: pence e franchi portati in euro", () => {
  const cal = ["2026-09-24", "2026-09-25", "2026-09-28"];
  const cambi = { GBP: { date: ["2026-09-24", "2026-09-25"], valori: [0.8, 0.85] }, CHF: { date: ["2026-09-28"], valori: [0.95] } };
  const gbp = E.inEuro([800, 850, 900], "GBp", cal, cambi);
  vicino(gbp[0], 800 / 0.8 / 100);
  vicino(gbp[1], 850 / 0.85 / 100);
  vicino(gbp[2], 900 / 0.85 / 100);                      // lunedì: vale il cambio di venerdì
  const chf = E.inEuro([100, 100, 100], "CHF", cal, cambi);
  assert.deepEqual(chf.slice(0, 2), [null, null]);        // prima del primo cambio disponibile
  vicino(chf[2], 100 / 0.95);
  assert.equal(E.inEuro([1, 2, 3], "EUR", cal, cambi)[2], 3);
  assert.equal(E.inEuro([1, 2, 3], "SEK", cal, cambi), null);
});

test("analisi di un'azione: rendimenti, medie, massimi e tendenza", () => {
  const date = feriali("2024-06-03", 560);
  // sale per 450 sedute, poi scende: sopra la media 200 ma con il prezzo in calo
  const p = date.map((_, i) => (i < 450 ? 50 + i * 0.2 : 140 - (i - 450) * 0.02));
  const a = E.analizza(p, date, null, null);
  const t = date.length - 1;
  vicino(a.ultimo, p[t]);
  vicino(a.g1, p[t] / p[t - 1] - 1);
  vicino(a.m3, p[t] / p[t - 63] - 1);
  const m200 = p.slice(t - 199).reduce((s, v) => s + v, 0) / 200;
  vicino(a.vs200, p[t] / m200 - 1, 1e-12);
  vicino(a.dd52, p[t] / 140 - 1);
  assert.equal(a.nuovoMax, false);
  assert.equal(a.stato, "rialzo");
  assert.equal(a.striscia.sopra, true);
  const fineAnno = date.filter(d => d < date[t].slice(0, 4)).length - 1;
  vicino(a.ytd, p[t] / p[fineAnno] - 1);
  // una serie che fa il massimo proprio adesso
  const su = date.map((_, i) => 100 + i);
  const b = E.analizza(su, date, null, null);
  assert.equal(b.nuovoMax, true);
  assert.equal(b.nuovoMin, false);
  assert.equal(b.striscia.almeno, true);                  // sopra la media da quando la media esiste
  assert.equal(b.striscia.sedute, date.length - 199);
  // prezzo fermo da qualche giorno (sospesa): si usa l'ultimo e si segnala
  const sospesa = su.slice(0, -3).concat([null, null, null]);
  const c = E.analizza(sospesa, date, null, null);
  assert.equal(c.vecchio, true);
  assert.equal(c.data, date[date.length - 4]);
  assert.equal(c.ultimo, su[su.length - 4]);
});

test("forza relativa contro l'indice: chi fa meglio è leader", () => {
  const date = feriali("2024-06-03", 560);
  const indice = date.map((_, i) => 100 * Math.exp(0.0003 * i + 0.01 * Math.sin(i / 9)));
  const forte = indice.map((v, i) => v * Math.exp(0.002 * Math.max(0, i - 400)));
  const debole = indice.map((v, i) => v * Math.exp(-0.002 * Math.max(0, i - 400)));
  const barre = Rot.barre(date, "settimanali");
  const q = E.riempi(indice);
  const f = E.analizza(forte, date, q, barre), d = E.analizza(debole, date, q, barre);
  assert.equal(f.rs.quadrante, "leader");
  assert.equal(d.rs.quadrante, "ritardo");
  vicino(f.rs3, Math.exp(0.002 * 63) - 1, 1e-9);
  assert.ok(E.ordineForza(f.rs) < E.ordineForza(d.rs));
});

test("ampiezza e paniere a pesi uguali", () => {
  const date = feriali("2025-01-06", 260);
  const su = date.map((_, i) => 100 + i), giu = date.map((_, i) => 400 - i);
  const tardi = date.map((_, i) => (i < 100 ? null : 50 + i));
  const gruppo = [su, giu, tardi, su.map(v => v * 2)].map(p => E.analizza(p, date, null, null));
  const b = E.ampiezza(gruppo, "m200");
  const t = date.length - 1;
  vicino(b[t], 2 / 3);                                     // la serie partita tardi non ha ancora la media 200
  assert.equal(b[198], null);
  assert.deepEqual(E.conta(gruppo, "m200", t), { sopra: 2, validi: 3 });
  // paniere: con due serie, una +10% e una −10% al giorno 1, il paniere resta fermo
  const pan = E.paniere([[10, 11, 11], [20, 18, 18]]);
  assert.deepEqual(pan, [100, 100, 100]);
  const pan2 = E.paniere([[null, 10, 11], [5, 5, 5.5]]);
  assert.equal(pan2[0], null);                             // parte quando ha i prezzi il 60% delle serie
  assert.equal(pan2[1], 100);
  vicino(pan2[2], 110);
  assert.equal(E.mediana([3, 1, null, 2, 10]), 2.5);
});
