#!/usr/bin/env node
/*
 * Radar Settori — riepilogo degli stati, calcolato dopo ogni aggiornamento (data/stati.json).
 *
 * Usa le stesse regole del sito (signals.js) con i livelli blu predefiniti di settings.json.
 * Serve all'avviso automatico del mattino: dice in quale stato è ogni settore, che cosa è
 * cambiato nelle ultime sedute, quanti titoli mancano al livello blu e se i dati sono in ritardo.
 *
 * Uso:  node stati.js [cartella_dati]   (lo lancia da solo build_data.py alla fine dell'aggiornamento)
 */
"use strict";

const fs = require("fs");
const path = require("path");
const Signals = require("./signals.js");
const Cal = require("./calendario.js");

const ROOT = __dirname;
const DATA = path.join(ROOT, "data");
const SEDUTE_CAMBI = 10;   // quante sedute indietro si guardano i cambi di stato

const leggi = f => JSON.parse(fs.readFileSync(f, "utf8"));
const r1 = v => (v == null || !isFinite(v) ? null : Math.round(v * 10) / 10);

// titoli sopra la media 200 contati come nel sito: quanti sono, quanti al massimo al livello, quanti mancano
function titoliLivello(b200, n, lv) {
  if (b200 == null || !n) return null;
  const sopra = Math.round((b200 / 100) * n);
  const pct1 = k => Math.round((k / n) * 1000) / 10;
  let soglia = Math.max(0, Math.floor((lv / 100) * n + 1e-9));
  while (soglia + 1 <= n && pct1(soglia + 1) <= lv) soglia++;
  while (soglia > 0 && pct1(soglia) > lv) soglia--;
  return { sopra, n, soglia, mancano: Math.max(0, sopra - soglia) };
}

function calcola(adesso, cartella = DATA) {
  const cfg = leggi(path.join(ROOT, "settings.json"));
  const meta = leggi(path.join(cartella, "meta.json"));
  const parametri = meta.parametri || {};
  const S = Signals.STATI;
  const settori = [];
  const cambi = [];

  for (const s of meta.settori) {
    const file = path.join(cartella, "settori", `${s.etf}.json`);
    if (!fs.existsSync(file)) continue;
    const d = leggi(file);
    const lv = (cfg.soglie && cfg.soglie[s.etf] != null) ? cfg.soglie[s.etf] : d.soglia_default;
    const a = Signals.analizza(d, lv, parametri);
    const N = d.date.length, t = N - 1;
    const stato = a.statoOggi || "normale";
    let k = t;
    while (k > 0 && a.stati[k - 1] === a.stati[t]) k--;
    const b200 = d.b200[t], n = d.n[t];
    const tl = titoliLivello(b200, n, lv);
    const ep = a.episodi[a.episodi.length - 1];
    const voce = {
      etf: s.etf,
      nome: s.nome,
      stato,
      stato_nome: S[stato],
      dal: d.date[k],
      livello: lv,
      ampiezza: r1(b200),
      ampiezza_un_mese_fa: r1(d.b200[Math.max(0, N - 22)]),
      titoli_sopra: tl ? tl.sopra : null,
      titoli_totali: n,
      titoli_al_livello: tl ? tl.soglia : null,
      titoli_che_mancano: tl ? tl.mancano : null,
      punti_dal_livello: r1(b200 == null ? null : b200 - lv),
      drawdown: r1(d.dd[t]),
      percentile_drawdown: a.ddPerc[t] == null ? null : Math.round(a.ddPerc[t]),
    };
    if (a.manca) {
      voce.per_il_trigger = {
        punti_che_mancano: r1(a.manca.punti),
        ampiezza_obiettivo: r1(a.manca.obiettivo),
        conferme_presenti: a.manca.conferme.map(m => Signals.MOTIVI[m]),
        conferme_necessarie: a.manca.servono,
        rimbalzo_a_V_sopra: r1(a.manca.riarmo),
      };
    }
    if (stato === "trigger" && ep && ep.segnale != null) {
      voce.trigger = {
        data: d.date[ep.segnale],
        conferme: ep.motivi.map(m => Signals.MOTIVI[m]),
        annullato_se_chiude_sotto: ep.sogliaFallimento == null ? null : Math.round(ep.sogliaFallimento * 100) / 100,
      };
    }
    settori.push(voce);

    for (let i = Math.max(1, N - SEDUTE_CAMBI); i <= t; i++) {
      const da = a.stati[i - 1], aa = a.stati[i];
      if (!da || !aa || da === aa) continue;
      const tli = titoliLivello(d.b200[i], d.n[i], lv);
      cambi.push({
        data: d.date[i], etf: s.etf, nome: s.nome, da, a: aa, da_nome: S[da], a_nome: S[aa],
        ampiezza: r1(d.b200[i]), titoli_sopra: tli ? tli.sopra : null, titoli_totali: d.n[i], drawdown: r1(d.dd[i]),
      });
    }
  }

  cambi.sort((x, y) => y.data.localeCompare(x.data) || x.etf.localeCompare(y.etf));
  const ultima = meta.aggiornato;
  const ordine = { fallito: 0, trigger: 1, blu: 2, attenzione: 3, cooldown: 4, normale: 5 };
  settori.sort((x, y) => (ordine[x.stato] - ordine[y.stato]) || ((x.titoli_che_mancano ?? 999) - (y.titoli_che_mancano ?? 999)));
  return {
    aggiornato: ultima,
    generato: (adesso || new Date()).toISOString().replace(/\.\d+Z$/, "Z"),
    ritardo: Cal.ritardo(ultima, adesso || new Date(), "nyse"),
    // la seduta che deve arrivare con il prossimo aggiornamento: se è già passata da un giorno, i dati sono indietro
    prossima_seduta: Cal.successiva(ultima, "nyse"),
    ampiezza_sp500: meta.indice ? r1(meta.indice.b200) : null,
    cambi_ultima_seduta: cambi.filter(c => c.data === ultima),
    cambi_recenti: cambi,
    settori,
    nota: "Stati calcolati con i livelli blu predefiniti di settings.json e le regole di signals.js.",
  };
}

if (require.main === module) {
  const cartella = process.argv[2] ? path.resolve(process.argv[2]) : DATA;
  const out = calcola(null, cartella);
  const file = path.join(cartella, "stati.json");
  // se non è cambiato niente (a parte l'ora) il file resta com'è: niente salvataggi inutili nel repository
  const senzaOra = x => JSON.stringify(Object.assign({}, x, { generato: null }));
  let uguale = false;
  try { uguale = senzaOra(leggi(file)) === senzaOra(out); } catch (e) { /* file nuovo */ }
  if (!uguale) fs.writeFileSync(file, JSON.stringify(out, null, 1));
  const n = out.cambi_ultima_seduta.length;
  console.log(`stati.json: ${out.settori.length} settori, ${n} ${n === 1 ? "cambio" : "cambi"} di stato nella seduta del ${out.aggiornato}`);
}

module.exports = { calcola, titoliLivello };
