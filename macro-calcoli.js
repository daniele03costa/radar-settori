/*
 * Radar Settori — calcoli del quadro macro e della salute dei dati (window.Macro; funziona anche in Node per i test).
 *
 * data/macro.json ha un calendario comune (giorni feriali dal 2005) e, per ogni serie, i valori da un certo giorno
 * in poi. Qui si calcolano solo statistiche descrittive: variazioni, minimo e massimo dell'ultimo anno, percentile
 * del valore di oggi nella storia, media a 200 sedute. Per i tassi le variazioni sono in punti base (0,01 punti
 * percentuali), per tutto il resto in percentuale.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Macro = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // finestre delle variazioni: giorni o mesi di calendario (il calendario di macro.json ha tutti i giorni feriali)
  const PERIODI = [["s1", "1 settimana", { giorni: 7 }], ["m1", "1 mese", { mesi: 1 }], ["m3", "3 mesi", { mesi: 3 }], ["m6", "6 mesi", { mesi: 6 }],
    ["a1", "1 anno", { mesi: 12 }], ["a3", "3 anni", { mesi: 36 }]];

  // la data di «quanto tempo fa» (AAAA-MM-GG); a fine mese si ferma all'ultimo giorno del mese (31/03 − 1 mese = 28/02)
  function indietro(data, p) {
    const [y, m, d] = data.split("-").map(Number);
    if (p.giorni) return new Date(Date.UTC(y, m - 1, d) - p.giorni * 864e5).toISOString().slice(0, 10);
    const tot = y * 12 + (m - 1) - p.mesi, yy = Math.floor(tot / 12), mm = tot % 12;
    const fine = new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate();
    return `${yy}-${String(mm + 1).padStart(2, "0")}-${String(Math.min(d, fine)).padStart(2, "0")}`;
  }

  // l'ultima seduta del calendario non dopo la data (−1 se il calendario comincia dopo)
  function sedutaAl(date, data, t) {
    let lo = 0, hi = t, k = -1;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (date[mid] <= data) { k = mid; lo = mid + 1; } else hi = mid - 1; }
    return k;
  }

  // lunga quanto il calendario, con null prima del primo valore
  function piena(N, i0, valori) {
    const out = new Array(N).fill(null);
    for (let k = 0; k < valori.length && i0 + k < N; k++) out[i0 + k] = valori[k] == null ? null : +valori[k];
    return out;
  }

  const eTasso = s => s.unita === "%";

  // variazione fra due valori: punti base per i tassi, percentuale per il resto
  function variazione(s, da, a) {
    if (da == null || a == null || !isFinite(da) || !isFinite(a)) return null;
    if (eTasso(s)) return (a - da) * 100;
    return da > 0 ? (a / da - 1) * 100 : null;
  }

  function medie(v, n = 200) {
    const out = new Array(v.length).fill(null);
    let somma = 0, validi = 0;
    for (let i = 0; i < v.length; i++) {
      if (v[i] != null) { somma += v[i]; validi++; }
      if (i >= n && v[i - n] != null) { somma -= v[i - n]; validi--; }
      if (i >= n - 1 && validi === n) out[i] = somma / n;
    }
    return out;
  }

  function ultimoVero(v) {
    for (let i = v.length - 1; i >= 0; i--) if (v[i] != null) return i;
    return -1;
  }

  // statistiche di una serie (s: voce di macro.json, date: il calendario)
  function statistiche(s, date) {
    const N = date.length;
    const v = piena(N, s.i0 || 0, s.valori || []);
    const t = ultimoVero(v);
    if (t < 0) return null;
    const x = v[t];
    const variazioni = {};
    for (const [k, , p] of PERIODI) {
      const i = sedutaAl(date, indietro(date[t], p), t);
      // il valore di quel giorno o, se manca, l'ultimo prima
      let j = i;
      while (j >= 0 && v[j] == null && i - j < 5) j--;
      variazioni[k] = j >= 0 && v[j] != null ? variazione(s, v[j], x) : null;
    }
    // da inizio anno: dall'ultima seduta dell'anno prima
    const anno = date[t].slice(0, 4);
    let iA = t;
    while (iA > 0 && date[iA].slice(0, 4) === anno) iA--;
    variazioni.ytd = date[iA].slice(0, 4) !== anno ? variazione(s, v[iA], x) : null;
    // minimo e massimo dell'ultimo anno, con le date
    let lo = Infinity, hi = -Infinity, iLo = t, iHi = t;
    const inizioAnno = sedutaAl(date, indietro(date[t], { mesi: 12 }), t) + 1;
    for (let i = Math.max(0, inizioAnno); i <= t; i++) {
      if (v[i] == null) continue;
      if (v[i] < lo) { lo = v[i]; iLo = i; }
      if (v[i] > hi) { hi = v[i]; iHi = i; }
    }
    // percentile nella storia: quota di sedute con un valore più basso di oggi
    let sotto = 0, uguali = 0, totale = 0, minS = Infinity, maxS = -Infinity, iMinS = t, iMaxS = t;
    for (let i = 0; i <= t; i++) {
      if (v[i] == null) continue;
      totale++;
      if (v[i] < x) sotto++;
      else if (v[i] === x) uguali++;
      if (v[i] < minS) { minS = v[i]; iMinS = i; }
      if (v[i] > maxS) { maxS = v[i]; iMaxS = i; }
    }
    const ma = medie(v, 200);
    const primo = v.findIndex(y => y != null);
    return {
      v, ma, t, data: date[t], ultimo: x, variazioni,
      min52: lo, max52: hi, dataMin52: date[iLo], dataMax52: date[iHi],
      pos52: hi > lo ? (x - lo) / (hi - lo) : null,
      percentile: totale ? ((sotto + uguali / 2) / totale) * 100 : null,
      dal: date[primo], sedute: totale,
      minStorico: minS, maxStorico: maxS, dataMinStorico: date[iMinS], dataMaxStorico: date[iMaxS],
      ma200: ma[t], vsMa: ma[t] == null ? null : variazione(s, ma[t], x),
      sopraMa: ma[t] == null ? null : x > ma[t],
    };
  }

  function tutte(m) {
    return (m.serie || []).map(s => ({ s, a: statistiche(s, m.date) })).filter(x => x.a);
  }

  // ---------------- salute dei dati ----------------

  /*
   * Giudizio su una fonte: "ok", "attenzione" o "problema", con i motivi in parole.
   * r: resoconto di data/salute/<passo>.json (o null), ritardo: { sedute, attesa } del calendario della zona,
   * aggiornato: data dei dati (dal resoconto o dal file della zona).
   */
  function giudizio(r, ritardo, aggiornato) {
    const motivi = [];
    let livello = "ok";
    const alza = l => { if (l === "problema" || (l === "attenzione" && livello === "ok")) livello = l; };
    if (!aggiornato) { alza("problema"); motivi.push("nessun dato pubblicato"); return { livello, motivi }; }
    if (ritardo && ritardo.sedute >= 2) { alza("problema"); motivi.push(`mancano ${ritardo.sedute} sedute`); }
    else if (ritardo && ritardo.sedute === 1) { alza("attenzione"); motivi.push("manca l'ultima seduta"); }
    if (r) {
      if (r.esito === "errore") { alza(r.errori_di_fila >= 3 ? "problema" : "attenzione"); motivi.push(`l'ultimo aggiornamento non è riuscito${r.errori_di_fila > 1 ? ` (${r.errori_di_fila} volte di fila)` : ""}`); }
      if (r.avvisi && r.avvisi.length) { alza("attenzione"); motivi.push(r.avvisi.length === 1 ? "un avviso" : `${r.avvisi.length} avvisi`); }
      const tot = r.totale || r.titoli || 0;
      const nM = (r.mancanti || []).length, nF = (r.fermi || []).length;
      if (tot && nM / tot > 0.05) { alza("attenzione"); motivi.push(`${nM} senza prezzi`); }
      if (tot && nF / tot > 0.03) { alza("attenzione"); motivi.push(`${nF} fermi`); }
      if ((r.indici_fermi || []).length) { alza("attenzione"); motivi.push(r.indici_fermi.length === 1 ? "un indice fermo" : `${r.indici_fermi.length} indici fermi`); }
      if ((r.cambi_mancanti || []).length) { alza("attenzione"); motivi.push(`cambi mancanti: ${r.cambi_mancanti.join(", ")}`); }
    }
    return { livello, motivi };
  }

  // owner e repository dall'indirizzo di GitHub Pages (utente.github.io/repository/)
  function repoDaIndirizzo(host, percorso) {
    const m = /^([a-z0-9-]+)\.github\.io$/i.exec(host || "");
    if (!m) return null;
    const primo = String(percorso || "/").split("/").filter(Boolean)[0];
    return { owner: m[1], repo: primo || `${m[1]}.github.io` };
  }

  // le esecuzioni dell'API di GitHub raggruppate per aggiornamento, le più recenti per prime
  function esecuzioniPerFlusso(runs) {
    const gruppi = new Map();
    for (const r of runs || []) {
      if (!gruppi.has(r.name)) gruppi.set(r.name, []);
      gruppi.get(r.name).push(r);
    }
    return Array.from(gruppi, ([nome, lista]) => {
      lista.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      const finite = lista.filter(r => r.status === "completed");
      return {
        nome, ultima: lista[0], ultimaFinita: finite[0] || null,
        falliti: finite.filter(r => r.conclusion === "failure" || r.conclusion === "timed_out").length,
        finite: finite.length, lista: lista.slice(0, 12),
      };
    });
  }

  return { PERIODI, indietro, sedutaAl, piena, variazione, medie, statistiche, tutte, eTasso, giudizio, repoDaIndirizzo, esecuzioniPerFlusso };
});
