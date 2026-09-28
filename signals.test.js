// Test della macchina a stati:  node --test signals.test.js
const test = require("node:test");
const assert = require("node:assert");
const S = require("./signals.js");

// costruisce una serie finta: b200/b50/b20/close giorno per giorno
function serie(N, f) {
  const d = { date: [], close: [], adj: [], ma200: [], dd: [], b200: [], b50: [], b20: [], n: [] };
  for (let t = 0; t < N; t++) {
    const r = f(t);
    d.date.push(new Date(Date.UTC(2010, 0, 1) + t * 864e5).toISOString().slice(0, 10));
    d.close.push(r.close); d.adj.push(r.close); d.ma200.push(null);
    d.dd.push(r.dd); d.b200.push(r.b200); d.b50.push(r.b50 ?? r.b200); d.b20.push(r.b20 ?? r.b200); d.n.push(20);
  }
  return d;
}

// 300 sedute tranquille (DD piccolo), poi un crollo
const calma = t => ({ close: 100, dd: -2, b200: 70 });

test("zona blu: servono 2 chiusure sotto il livello e drawdown oltre il 70° percentile", () => {
  const d = serie(360, t => t < 300 ? calma(t)
    : t === 300 ? { close: 80, dd: -20, b200: 4 }             // una sola chiusura sotto: non basta
    : t === 301 ? { close: 80, dd: -20, b200: 30 }
    : { close: 78, dd: -22, b200: 3 });
  const r = S.analizza(d, 5);
  assert.equal(r.episodi.length, 1);
  assert.equal(r.episodi[0].inizio, 303);
  assert.equal(r.stati[302], "attenzione");
  assert.equal(r.statoOggi, "blu");
});

test("senza drawdown profondo non parte la zona blu", () => {
  const d = serie(360, t => t < 300 ? calma(t) : { close: 99, dd: -2, b200: 3 });
  const r = S.analizza(d, 5);
  assert.equal(r.episodi.length, 0);
});

test("trigger con spinta di ampiezza a 20 sedute e recupero sopra il livello", () => {
  const d = serie(400, t => {
    if (t < 300) return calma(t);
    if (t < 320) return { close: 80 - (t - 300) * 0.2, dd: -22, b200: 2, b20: 5 };
    if (t < 330) return { close: 77, dd: -23, b200: 12, b20: 30 };        // recupero insufficiente: con 20 titoli servono 5 + 10 punti
    return { close: 78, dd: -22, b200: 16, b20: 75 };                      // spinta: da ≤15 a ≥70 in 15 sedute
  });
  const r = S.analizza(d, 5);
  const e = r.episodi[0];
  assert.equal(e.segnale, 330);
  assert.deepEqual(e.motivi, ["spinta20"]);
  assert.equal(r.stati[330], "trigger");
  assert.equal(r.stati[350], "cooldown");
  assert.equal(r.stati[392], "cooldown");
  assert.notEqual(r.stati[394], "cooldown");
});

test("rimbalzo a V: l'ampiezza sopra il livello di riarmo basta da sola", () => {
  const d = serie(360, t => t < 300 ? calma(t) : t < 310 ? { close: 80, dd: -20, b200: 2, b20: 40 } : { close: 79, dd: -20, b200: 45, b20: 40 });
  const r = S.analizza(d, 5);
  assert.equal(r.episodi[0].segnale, 310);
  assert.deepEqual(r.episodi[0].motivi, ["rimbalzoV"]);
});

test("fallito: chiusura sotto il minimo della zona entro 20 sedute, poi servono 2 conferme", () => {
  const d = serie(420, t => {
    if (t < 300) return calma(t);
    if (t < 310) return { close: 80, dd: -20, b200: 2, b20: 5 };
    if (t < 315) return { close: 82, dd: -18, b200: 16, b20: 75 };        // trigger al 310
    if (t < 330) return { close: 70, dd: -30, b200: 2, b20: 5 };          // sotto il minimo: fallito al 315
    if (t < 345) return { close: 70, dd: -30, b200: 18, b20: 75 };        // spinta sola: dopo un fallimento non basta
    return { close: 75 + (t - 345), dd: -25, b200: 18, b20: 60 };         // + prezzo sopra media 20 in salita
  });
  const r = S.analizza(d, 5);
  const e = r.episodi[0];
  assert.deepEqual(e.falliti, [310]);
  assert.equal(r.stati[315], "fallito");
  assert.equal(e.segnale, 345, "il secondo trigger arriva solo con due conferme");
  assert.ok(e.motivi.length >= 2);
});

test("cooldown di 63 sedute e riarmo prima di una nuova zona", () => {
  const d = serie(700, t => {
    if (t < 300) return calma(t);
    if (t < 305) return { close: 80, dd: -20, b200: 2, b20: 5 };
    if (t < 450) return { close: 85, dd: -15, b200: 20, b20: 75 };        // trigger, poi niente riarmo (<40)
    if (t < 460) return { close: 70, dd: -30, b200: 2, b20: 5 };          // non riarmato: niente nuova zona
    if (t < 500) return { close: 90, dd: -5, b200: 60, b20: 80 };         // riarmo
    return { close: 60, dd: -40, b200: 2, b20: 5 };                        // nuova zona
  });
  const r = S.analizza(d, 5);
  assert.equal(r.episodi.length, 2);
  assert.equal(r.stati[305 + 62], "cooldown");
  assert.notEqual(r.stati[305 + 64], "cooldown");
  assert.ok(r.episodi[1].inizio >= 500);
});

test("percentile storico del drawdown senza guardare al futuro", () => {
  const p = S.percentiliStorici([-1, -2, -3, -1]);
  assert.deepEqual(p.map(Math.round), [0, 50, 67, 0]);
});
