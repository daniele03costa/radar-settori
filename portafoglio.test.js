// Test dei calcoli del portafoglio: node --test portafoglio.test.js
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const P = require("./portafoglio-calcoli.js");

const vicino = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);
const feriali = (da, n) => {
  const out = [];
  let d = Date.parse(da + "T00:00:00Z");
  while (out.length < n) { const g = new Date(d); if (g.getUTCDay() % 6) out.push(g.toISOString().slice(0, 10)); d += 864e5; }
  return out;
};

test("numeri, date e righe del file", () => {
  assert.equal(P.numero("395,20"), 395.2);
  assert.equal(P.numero("1.234,56"), 1234.56);
  assert.equal(P.numero("0.05"), 0.05);
  assert.equal(P.numero("52000"), 52000);
  assert.equal(P.numero("-3"), -3);
  assert.equal(P.numero("abc"), null);
  assert.equal(P.data("24/09/2026"), "2026-09-24");
  const f = P.leggi(`# il mio portafoglio
MSFT 10 395,20 EUR 2025-03-10 comprato su Trade Republic
msft 5 400
ENEL.MI 500 6,12
LIQUIDITA 2500
liquidità USD 1000
BTC-EUR 0,05 52000 # nota
SBAGLIATA 10
`);
  assert.equal(f.cifrato, false);
  assert.equal(f.errori.length, 1);
  const msft = f.posizioni.find(p => p.t === "MSFT");
  assert.equal(msft.quantita, 15);
  vicino(msft.carico, (10 * 395.2 + 5 * 400) / 15);
  assert.equal(msft.valutaCarico, "EUR");
  assert.equal(msft.data, "2025-03-10");
  assert.deepEqual(f.liquidita, [{ importo: 2500, valuta: "EUR" }, { importo: 1000, valuta: "USD" }]);
  assert.equal(f.posizioni.find(p => p.t === "BTC-EUR").quantita, 0.05);
  assert.equal(P.leggi("RADAR-CIFRATO 1\nabc").cifrato, true);
});

test("serie allineate: le crypto del fine settimana vanno sul giorno di borsa", () => {
  const cal = ["2026-09-25", "2026-09-28"];                     // venerdì, lunedì
  const date = ["2026-09-25", "2026-09-26", "2026-09-27", "2026-09-28"];
  assert.deepEqual(P.allinea(date, [1, 2, 3, 4], cal), [1, 4]);
  assert.deepEqual(P.allinea(["2026-09-01"], [5], cal), [null, null]);   // troppo vecchio
});

test("valore, risultato, beta e contributo al rischio", () => {
  const cal = feriali("2025-06-02", 320);
  const bench = cal.map((_, i) => 100 * Math.exp(0.01 * Math.sin(i / 5) + 0.0004 * i));
  const fx = cal.map((_, i) => 1.10 + 0.05 * Math.sin(i / 17));            // dollari per un euro
  const titoli = {
    "AAA.DE": { date: cal, prezzi: bench.map(v => 2 * v), valuta: "EUR", tipo: "ETF", mercato: "europa" },
    MSFT: { date: cal, prezzi: cal.map(() => 100), valuta: "USD", tipo: "Azione", settore: "Tecnologia", paese: "Stati Uniti", mercato: "usa" },
  };
  const f = P.leggi("AAA.DE 10 150\nMSFT 20 90 USD\nLIQUIDITA 1000");
  const a = P.analizza({ posizioni: f.posizioni, liquidita: f.liquidita, titoli, cambi: { USD: { date: cal, valori: fx } }, bench: { date: cal, prezzi: bench } });
  const t = cal.length - 1;
  const vA = 10 * 2 * bench[t], vM = 20 * 100 / fx[t];
  vicino(a.totale, vA + vM + 1000, 1e-6);
  vicino(a.righe.reduce((s, r) => s + r.peso, 0) + 1000 / a.totale, 1, 1e-12);
  vicino(a.righe[0].beta, 1, 1e-9);                                          // proporzionale all'ACWI
  vicino(a.righe.reduce((s, r) => s + r.rischio, 0), 1, 1e-9);               // i contributi fanno il 100%
  const msft = a.righe[1];
  vicino(msft.costo, 20 * 90 / fx[t], 1e-9);                                 // carico in dollari al cambio di oggi
  vicino(msft.risultatoLocale, 100 / 90 - 1, 1e-12);
  assert.equal(a.composizione.valuta.find(g => g.nome === "Dollaro").peso > 0, true);
  assert.equal(a.composizione.area.find(g => g.nome === "Liquidità").valore, 1000);
  assert.ok(a.rischio.nEffettivo > 1 && a.rischio.nEffettivo <= 2);
  assert.ok(a.rischio.var95 > 0 && a.rischio.vol > 0);
  // andamento simulato: stesso numero di giorni del calendario
  assert.equal(a.serie.valore.length, cal.length);
});

test("calo massimo", () => {
  const c = P.caloMassimo([100, 120, 90, 110, 60, 130]);
  vicino(c.calo, 60 / 120 - 1);
  assert.equal(c.da, 1);
  assert.equal(c.a, 4);
});

test("protezione con password: si legge solo con quella giusta", async () => {
  const testo = "MSFT 10 395,20\nLIQUIDITA 2500\n";
  const blocco = await P.cifra(testo, "una password lunga");
  assert.ok(blocco.startsWith("RADAR-CIFRATO 1"));
  assert.ok(!blocco.includes("MSFT"));
  assert.equal(await P.decifra(blocco, "una password lunga"), testo);
  await assert.rejects(() => P.decifra(blocco, "sbagliata"));
  assert.equal(P.leggi(blocco).cifrato, true);
});
