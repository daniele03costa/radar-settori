// Test del quadro macro e della salute dei dati: node --test macro.test.js
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const M = require("./macro-calcoli.js");

const vicino = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);
const feriali = (da, n) => {
  const out = [];
  let d = Date.parse(da + "T00:00:00Z");
  while (out.length < n) { const g = new Date(d); if (g.getUTCDay() % 6) out.push(g.toISOString().slice(0, 10)); d += 864e5; }
  return out;
};

test("statistiche di un prezzo: variazioni, anno, percentile, media 200", () => {
  const date = feriali("2024-01-01", 600);
  const valori = date.map((_, i) => 100 + i);              // sale sempre
  const s = { id: "oro", unita: "$/oncia", i0: 0, valori };
  const a = M.statistiche(s, date);
  assert.equal(a.ultimo, 699);
  // 1 mese: dall'ultima seduta non dopo lo stesso giorno del mese prima
  const t = date.length - 1, i1 = M.sedutaAl(date, M.indietro(date[t], { mesi: 1 }), t);
  assert.ok(date[i1] <= M.indietro(date[t], { mesi: 1 }) && date[i1 + 1] > M.indietro(date[t], { mesi: 1 }));
  vicino(a.variazioni.m1, (699 / valori[i1] - 1) * 100);
  const iA1 = M.sedutaAl(date, M.indietro(date[t], { mesi: 12 }), t);
  assert.equal(a.min52, valori[iA1 + 1]);
  assert.equal(a.max52, 699);
  assert.equal(a.pos52, 1);
  vicino(a.percentile, (599 + 0.5) / 600 * 100);
  vicino(a.ma200, (500 + 699) / 2);
  assert.equal(a.sopraMa, true);
  assert.equal(a.variazioni.a3, null);                     // meno di 3 anni di storia
  // da inizio anno: dall'ultima seduta dell'anno prima
  const iA = date.findIndex(d => d.startsWith("2026")) - 1;
  vicino(a.variazioni.ytd, (699 / valori[iA] - 1) * 100);
});

test("tassi in punti base e serie che inizia più tardi", () => {
  const date = feriali("2024-01-01", 300);
  const s = { id: "us10", unita: "%", i0: 250, valori: [...Array(49).fill(4), 4.25] };
  const a = M.statistiche(s, date);
  vicino(a.variazioni.s1, 25);
  assert.equal(M.indietro("2026-03-31", { mesi: 1 }), "2026-02-28");
  assert.equal(M.indietro("2026-01-15", { mesi: 12 }), "2025-01-15");
  assert.equal(M.indietro("2026-10-14", { giorni: 7 }), "2026-10-07");
  assert.equal(a.variazioni.a1, null);
  assert.equal(a.ma200, null);
  assert.equal(a.dal, date[250]);
  assert.equal(M.statistiche({ unita: "%", i0: 0, valori: [] }, date), null);
});

test("giudizio sulla salute di una fonte", () => {
  assert.equal(M.giudizio(null, { sedute: 0 }, "2026-10-14").livello, "ok");
  assert.equal(M.giudizio(null, { sedute: 1 }, "2026-10-13").livello, "attenzione");
  assert.equal(M.giudizio(null, { sedute: 3 }, "2026-10-09").livello, "problema");
  assert.equal(M.giudizio(null, null, null).livello, "problema");
  const r = { esito: "errore", errori_di_fila: 1, titoli: 100, totale: 100, mancanti: [], fermi: [] };
  assert.deepEqual(M.giudizio(r, { sedute: 0 }, "2026-10-14"), { livello: "attenzione", motivi: ["l'ultimo aggiornamento non è riuscito"] });
  assert.equal(M.giudizio(Object.assign({}, r, { errori_di_fila: 3 }), { sedute: 0 }, "2026-10-14").livello, "problema");
  const pochi = { esito: "ok", titoli: 1000, totale: 1000, mancanti: [{ t: "A" }], fermi: [{ t: "B" }], indici_mancanti: [{ nome: "CSI 300" }] };
  assert.equal(M.giudizio(pochi, { sedute: 0 }, "2026-10-14").livello, "ok");
  const fermo = Object.assign({}, pochi, { indici_fermi: [{ nome: "WIG20" }] });
  assert.deepEqual(M.giudizio(fermo, { sedute: 0 }, "2026-10-14").motivi, ["un indice fermo"]);
});

test("repository dall'indirizzo e aggiornamenti di GitHub", () => {
  assert.deepEqual(M.repoDaIndirizzo("daniele03costa.github.io", "/radar-settori/"), { owner: "daniele03costa", repo: "radar-settori" });
  assert.equal(M.repoDaIndirizzo("localhost", "/"), null);
  const g = M.esecuzioniPerFlusso([
    { name: "Aggiorna dati", status: "completed", conclusion: "success", created_at: "2026-10-14T22:40:00Z" },
    { name: "Aggiorna dati", status: "completed", conclusion: "failure", created_at: "2026-10-15T05:40:00Z" },
    { name: "Aggiorna crypto", status: "in_progress", conclusion: null, created_at: "2026-10-15T03:55:00Z" },
  ]);
  const dati = g.find(x => x.nome === "Aggiorna dati");
  assert.equal(dati.ultima.conclusion, "failure");
  assert.equal(dati.falliti, 1);
  assert.equal(g.find(x => x.nome === "Aggiorna crypto").ultimaFinita, null);
});
