// Test dei calcoli della vista Crypto: node --test crypto.test.js
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("./crypto-calcoli.js");

const giorni = (da, n) => Array.from({ length: n }, (_, k) => new Date(Date.parse(da + "T00:00:00Z") + k * 864e5).toISOString().slice(0, 10));
const vicino = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

test("medie mobili, stati di tendenza e giorni sopra la media", () => {
  const m = C.sma([1, 2, 3, 4, 5, null, 7, 8, 9], 3);
  assert.deepEqual(m, [null, null, 2, 3, 4, null, null, null, 8]);
  assert.equal(C.statoDi(10, 9, 8), "rialzo");
  assert.equal(C.statoDi(10, 7, 8), "recupero");
  assert.equal(C.statoDi(7, 9, 8), "debolezza");
  assert.equal(C.statoDi(7, 7.5, 8), "ribasso");
  const p = [5, 5, 5, 11, 12, 13, 14, 15], m200 = new Array(8).fill(10);
  assert.deepEqual(C.striscia(p, m200, 7), { sopra: true, giorni: 5, dal: 3 });
});

test("analisi: mayer, distanza dal massimo, da inizio anno", () => {
  const date = giorni("2023-01-01", 800);
  const p = date.map((_, i) => (i < 500 ? 100 + i : 600 - (i - 500) * 0.5));
  const a = C.analizza(p, date);
  const t = p.length - 1;
  vicino(a.oggi.mayer, p[t] / a.m200[t]);
  vicino(a.oggi.dd, p[t] / 600 - 1);
  assert.equal(a.oggi.ath.data, date[500]);
  const fineAnno = date.indexOf("2024-12-31");
  vicino(a.oggi.ytd, p[t] / p[fineAnno] - 1);
  assert.equal(a.oggi.striscia.sopra, p[t] >= a.m200[t]);
});

test("regola della media 200: sempre dentro in una salita, fuori nella discesa", () => {
  const date = giorni("2020-01-01", 600);
  const su = date.map((_, i) => 100 * Math.pow(1.01, i));
  const r = C.regola200(su, C.sma(su, 200));
  vicino(r.regola.multiplo, r.sempre.multiplo, 1e-6);
  assert.equal(r.regola.tempo, 1);
  assert.equal(r.regola.entrate, 1);
  // sale per 300 giorni poi crolla: la regola esce e perde meno
  const giu = date.map((_, i) => (i < 300 ? 100 * Math.pow(1.01, i) : 100 * Math.pow(1.01, 300) * Math.pow(0.99, i - 300)));
  const r2 = C.regola200(giu, C.sma(giu, 200));
  assert.ok(r2.regola.maxdd > r2.sempre.maxdd);
  assert.ok(r2.regola.tempo < 1 && r2.regola.multiplo > r2.sempre.multiplo);
});

test("stagionalità: rendimenti mensili, mese in corso escluso dalle statistiche", () => {
  const date = giorni("2023-12-31", 106);                 // fino al 14 aprile 2024
  const valore = d => (d < "2024-01-01" ? 50 : d < "2024-02-01" ? 100 : d < "2024-03-01" ? 110 : d < "2024-04-01" ? 99 : 120);
  const p = date.map(valore);
  const s = C.mensili(p, date);
  assert.deepEqual(s.anni, [2024]);
  const m = s.tab[2024].mesi;
  vicino(m[0], 1); vicino(m[1], 0.1); vicino(m[2], -0.1); vicino(m[3], 120 / 99 - 1);
  assert.equal(s.inCorso, "2024-04");
  assert.equal(s.riepilogo[3], null);                      // aprile non è finito
  assert.equal(s.riepilogo[1].positivi, 1);
  vicino(s.tab[2024].anno, 120 / 50 - 1);                   // da inizio anno
});

test("cosa è successo dopo: rendimenti futuri per gruppo ed episodi", () => {
  const p = Array.from({ length: 20 }, (_, i) => 100 + i);
  const g = p.map((_, i) => (i < 5 || (i >= 10 && i < 15) ? "a" : "b"));
  const r = C.dopo(p, g, 5);
  assert.equal(r.a.casi, 10);
  assert.equal(r.a.episodi, 2);
  assert.equal(r.b.casi, 5);                                // gli ultimi 5 giorni non hanno ancora il futuro
  vicino(r.a.positivi, 1);
  vicino(r.b.mediana, 112 / 107 - 1);
});

test("cicli dell'halving: massimo e minimo successivo", () => {
  const date = giorni("2016-07-09", 1600);
  const p = date.map((_, i) => (i <= 500 ? 100 + i * 2 : Math.max(20, 1100 - (i - 500) * 3)));
  const [c] = C.cicli(p, date, ["2012-11-28", "2016-07-09"]);
  assert.equal(c.data, "2016-07-09");
  assert.equal(c.massimo.giorno, 500);
  vicino(c.massimo.multiplo, 11);
  assert.equal(c.minimo.prezzo, 20);
  assert.equal(c.completo, true);
  // un nuovo massimo dopo due anni (come a marzo 2024) non sposta il massimo del ciclo
  const p2 = p.map((v, i) => (i === 1400 ? 5000 : v));
  const [c2] = C.cicli(p2, date, ["2016-07-09"]);
  assert.equal(c2.massimo.giorno, 500);
});

test("mercati: coppie fra sedute e correlazione mobile", () => {
  const date = giorni("2024-01-01", 200);                  // 1 gennaio 2024 = lunedì
  const p = date.map((_, i) => 100 * Math.exp(Math.sin(i / 7) * 0.2 + i * 0.001));
  const q = p.map((x, i) => (new Date(date[i] + "T00:00:00Z").getUTCDay() % 6 === 0 ? null : x * 3));
  const c = C.coppieSedute(p, q);
  const lun = date.indexOf("2024-01-08");
  const k = c.giorni.indexOf(lun);
  vicino(c.a[k], Math.log(p[lun] / p[lun - 3]));             // da venerdì a lunedì, weekend compreso
  const corr = C.correlazioneMobile(p, q, 90);
  vicino(corr[q.length - 2] ?? corr[q.length - 3], 1, 1e-9);
  const inv = C.correlazioneMobile(p, q.map(x => (x == null ? null : 1 / x)), 90);
  const ultimo = inv.filter(v => v != null).pop();
  vicino(ultimo, -1, 1e-9);
});

test("legame con bitcoin: beta e correlazione", () => {
  const b = [0.01, -0.02, 0.03, 0.005, -0.01, 0.02, -0.015, 0.01, 0.0, 0.025, -0.005];
  const a = b.map(x => 2 * x);
  const l = C.legame(a, b, 0, b.length - 1);
  vicino(l.beta, 2); vicino(l.r, 1);
});
