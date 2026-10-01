// Test dei motori di calcolo:  node --test motori.test.js
const test = require("node:test");
const assert = require("node:assert");
const R = require("./rrg.js");
const P = require("./portafoglio.js");
const C = require("./calendario.js");

function giorni(da, n) {
  const out = [];
  let d = new Date(da + "T00:00:00Z");
  while (out.length < n) {
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

test("barre settimanali: ultima seduta di ogni settimana e settimana in corso provvisoria", () => {
  const date = giorni("2026-09-01", 18); // da martedì 1 settembre a giovedì 24
  const b = R.barre(date, "settimanali");
  assert.deepEqual(b.indici.map(i => date[i]), ["2026-09-04", "2026-09-11", "2026-09-18", "2026-09-24"]);
  assert.equal(b.provvisoria, true);
  const b2 = R.barre(date.slice(0, 14), "settimanali");
  assert.equal(b2.provvisoria, false); // termina di venerdì
  // con il calendario: venerdì 3 aprile 2026 è festivo, la settimana finisce giovedì
  const b3 = R.barre(["2026-03-30", "2026-03-31", "2026-04-01", "2026-04-02"], "settimanali", d => C.successiva(d, "nyse"));
  assert.equal(b3.provvisoria, false);
});

test("forza relativa crescente: la formula nuova porta il titolo a destra (Leader)", () => {
  const N = 120;
  const bench = Array.from({ length: N }, (_, i) => 100 * Math.exp(0.001 * i + 0.01 * Math.sin(i / 3)));
  const forte = bench.map((v, i) => v * Math.exp(i < 60 ? 0 : 0.004 * (i - 60)) * (1 + 0.003 * Math.sin(i)));
  for (const f of ["nuova", "semplice", "classica"]) {
    const r = R.calcola(forte, bench, f);
    const m = R.misure(r.ratio, r.mom, N - 1);
    assert.ok(m, f);
    assert.ok(m.ratio > 100, `${f}: ratio ${m.ratio}`);
  }
  const r = R.calcola(forte, bench, "nuova");
  const m = R.misure(r.ratio, r.mom, N - 1);
  assert.ok(m.durata >= 1 && ["leader", "indebolimento"].includes(m.quadrante));
});

test("formula a medie semplici: valori noti", () => {
  const bench = new Array(40).fill(100);
  const p = Array.from({ length: 40 }, (_, i) => 100 + i);
  const r = R.calcola(p, bench, "semplice");
  // ratio = 100 * SMA10(rs)/SMA30(rs) all'ultima barra
  const rs = p.map(v => v / 100);
  const s10 = rs.slice(30).reduce((a, b) => a + b) / 10;
  const s30 = rs.slice(10).reduce((a, b) => a + b) / 30;
  assert.ok(Math.abs(r.ratio[39] - (100 * s10) / s30) < 1e-9);
  assert.equal(r.ratio[28], null);
});

test("misure: direzione in gradi bussola, velocità, distanza, durata e quadrante precedente", () => {
  const ratio = [98, 99, 101, 102];
  const mom = [101, 101, 101, 102];
  const m = R.misure(ratio, mom, 3);
  assert.equal(m.quadrante, "leader");
  assert.equal(Math.round(m.direzione), 45);
  assert.equal(m.bussola, "NE");
  assert.ok(Math.abs(m.velocita - Math.SQRT2) < 1e-9);
  assert.ok(Math.abs(m.distanza - Math.hypot(2, 2)) < 1e-9);
  assert.equal(m.durata, 2);
  assert.equal(m.precedente, "miglioramento");
  const su = R.misure([100, 100], [100, 101], 1);
  assert.equal(Math.round(su.direzione), 0);
  const destra = R.misure([100, 101], [100, 100], 1);
  assert.equal(Math.round(destra.direzione), 90);
});

test("scala: uguale sui due assi e centrata su 100", () => {
  const [lo, hi] = R.scala([[103, 99], [96, 101]]);
  assert.ok(Math.abs(100 - lo - (hi - 100)) < 1e-9);
  assert.ok(hi > 104);
});

test("portafoglio: ribilanciamento a fine mese e pesi in proporzione", () => {
  const date = ["2026-01-29", "2026-01-30", "2026-02-02", "2026-02-03"];
  const serie = { A: [10, 10, 20, 20], B: [10, 10, 10, 10], C: [null, null, 5, 5] };
  const r = P.calcola(date, serie, { A: 30, B: 30, C: 40 });
  assert.equal(r.valori[0], 100);
  // fino a fine gennaio C non esiste: A e B al 50%
  assert.equal(r.valori[1], 100);
  // A raddoppia a febbraio (ribilanciato il 30/01 su A e B, C entra al primo ribilanciamento utile)
  assert.ok(Math.abs(r.valori[2] - 150) < 1e-9);
  assert.ok(Math.abs(r.pesiOggi.A - (50 * 20) / 150 / 1 * 1) < 1e-6 || r.pesiOggi.A > 60);
});

test("calendari: festività 2026", () => {
  assert.equal(C.pasqua(2026).toISOString().slice(0, 10), "2026-04-05");
  assert.equal(C.pasqua(2025).toISOString().slice(0, 10), "2025-04-20");
  const n = C.festeNYSE(2026);
  for (const d of ["2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25", "2026-06-19", "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25"]) {
    assert.ok(n.has(d), d);
  }
  assert.equal(C.eSeduta("2026-04-06", "nyse"), true);
  assert.equal(C.eSeduta("2026-04-06", "milano"), false);   // Lunedì dell'Angelo
  assert.equal(C.eSeduta("2026-12-24", "milano"), false);
  assert.equal(C.successiva("2026-04-02", "milano"), "2026-04-07");
});

test("dati in ritardo: seduta attesa secondo l'ora di New York", () => {
  // venerdì 25 settembre 2026, 20:00 a New York (00:00 UTC del 26)
  const sera = new Date("2026-09-26T00:00:00Z");
  assert.equal(C.sedutaAttesa(sera, "nyse"), "2026-09-25");
  // venerdì alle 10 di New York: attesi i dati di giovedì
  const mattina = new Date("2026-09-25T14:00:00Z");
  assert.equal(C.sedutaAttesa(mattina, "nyse"), "2026-09-24");
  // domenica: attesi quelli di venerdì
  assert.equal(C.sedutaAttesa(new Date("2026-09-27T15:00:00Z"), "nyse"), "2026-09-25");
  assert.deepEqual(C.ritardo("2026-09-23", sera, "nyse"), { attesa: "2026-09-25", sedute: 2 });
  assert.equal(C.ritardo("2026-09-25", sera, "nyse").sedute, 0);
});

test("crypto: ogni giorno è una seduta, settimane di sette giorni e dati attesi dopo la mezzanotte UTC", () => {
  assert.equal(C.eSeduta("2026-09-27", "crypto"), true);                       // domenica
  assert.equal(C.successiva("2026-09-26", "crypto"), "2026-09-27");
  assert.equal(C.sedutaAttesa(new Date("2026-09-30T03:00:00Z"), "crypto"), "2026-09-28");   // l'aggiornamento non è ancora passato
  assert.equal(C.sedutaAttesa(new Date("2026-09-30T06:00:00Z"), "crypto"), "2026-09-29");
  assert.deepEqual(C.ritardo("2026-09-27", new Date("2026-09-30T06:00:00Z"), "crypto"), { attesa: "2026-09-29", sedute: 2 });
  // barre settimanali: la settimana finisce di domenica
  const date = [];
  for (let d = new Date("2026-09-14T00:00:00Z"); date.length < 16; d.setUTCDate(d.getUTCDate() + 1)) date.push(d.toISOString().slice(0, 10));
  const b = R.barre(date, "settimanali", d => C.successiva(d, "crypto"));
  assert.deepEqual(b.indici.map(i => date[i]), ["2026-09-20", "2026-09-27", "2026-09-29"]);
  assert.equal(b.provvisoria, true);
});

test("tabella dei prezzi: passi in sedute di borsa o in giorni di calendario", () => {
  const date = [], serie = [];
  for (let d = new Date("2025-01-01T00:00:00Z"), k = 0; k < 400; k++, d.setUTCDate(d.getUTCDate() + 1)) { date.push(d.toISOString().slice(0, 10)); serie.push(100 + k); }
  const borsa = R.prezzi(date, serie), crypto = R.prezzi(date, serie, { w1: 7, m1: 30, m3: 91, m6: 182, a1: 365, max: 365, media: 200 });
  assert.ok(Math.abs(borsa.m1 - ((499 / 478) - 1) * 100) < 1e-9);           // 21 passi indietro
  assert.ok(Math.abs(crypto.m1 - ((499 / 469) - 1) * 100) < 1e-9);          // 30 giorni indietro
  assert.ok(Math.abs(crypto.a1 - ((499 / 134) - 1) * 100) < 1e-9);
  assert.equal(crypto.dd52, 0);
});
