/*
 * Radar Settori — calcoli della zona Europa (window.Europa; funziona anche in Node per i test).
 *
 * I prezzi arrivano da data/prezzi_europa.json: un calendario comune (i giorni in cui ha quotato la maggior
 * parte dei titoli) e, per ogni azione e indice, le chiusure da un certo giorno in poi. Qui si calcolano:
 *   - per ogni serie (azione, indice, paniere): rendimenti, medie a 50 e 200 sedute, tendenza, distanza dal
 *     massimo a 52 settimane, nuovi massimi e minimi dell'ultima settimana, forza relativa settimanale;
 *   - per ogni gruppo (indice, settore, tutta l'Europa): ampiezza, cioè la quota di azioni sopra la propria
 *     media 200 e 50, e un paniere a pesi uguali in euro.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./rrg.js"));
  else root.Europa = factory(root.Rotazione);
})(typeof self !== "undefined" ? self : this, function (Rot) {
  "use strict";

  const STATI = {
    rialzo: "Tendenza positiva",     // prezzo e media 50 sopra la media 200
    recupero: "In recupero",         // prezzo sopra la media 200, media 50 ancora sotto
    debolezza: "In indebolimento",   // prezzo sotto la media 200, media 50 ancora sopra
    ribasso: "Tendenza negativa",    // prezzo e media 50 sotto la media 200
  };
  const ORDINE_STATI = ["rialzo", "recupero", "debolezza", "ribasso"];
  const ORDINE_Q = { leader: 0, miglioramento: 1, indebolimento: 2, ritardo: 3 };
  const ANNO = 252, SETTIMANA = 5, TRIMESTRE = 63;

  // ---------------- serie ----------------

  // lunga quanto il calendario, con null prima del primo prezzo
  function piena(N, i0, valori) {
    const a = new Array(N).fill(null);
    (valori || []).forEach((v, k) => { if (i0 + k < N) a[i0 + k] = v == null ? null : v; });
    return a;
  }

  // i buchi dopo il primo prezzo (sospensioni, festività di una sola borsa) prendono l'ultimo prezzo
  function riempi(a) {
    const out = new Array(a.length).fill(null);
    let ultimo = null;
    for (let i = 0; i < a.length; i++) {
      if (a[i] != null && a[i] > 0) ultimo = a[i];
      out[i] = ultimo;
    }
    return out;
  }

  function ultimoVero(a) {
    for (let i = a.length - 1; i >= 0; i--) if (a[i] != null) return i;
    return -1;
  }

  // media mobile semplice; si riparte da capo dopo un buco
  function sma(a, n) {
    const out = new Array(a.length).fill(null);
    let s = 0, c = 0;
    for (let i = 0; i < a.length; i++) {
      const v = a[i];
      if (v == null) { s = 0; c = 0; continue; }
      s += v; c++;
      if (c > n) { s -= a[i - n]; c = n; }
      if (c === n) out[i] = s / n;
    }
    return out;
  }

  // per ogni giorno del calendario, l'ultimo valore disponibile a quella data (al massimo «tolleranza» giorni prima)
  function allinea(date, valori, calendario, tolleranza = 10) {
    const out = new Array(calendario.length).fill(null);
    let j = -1;
    for (let k = 0; k < calendario.length; k++) {
      const g = calendario[k];
      while (j + 1 < date.length && date[j + 1] <= g) j++;
      if (j < 0 || valori[j] == null) continue;
      if ((Date.parse(g) - Date.parse(date[j])) / 864e5 <= tolleranza) out[k] = valori[j];
    }
    return out;
  }

  // prezzi in euro; cambi = { USD: { date, valori } } con le unità di valuta per un euro. null se manca il cambio
  function inEuro(prezzi, valuta, calendario, cambi) {
    if (!valuta || valuta === "EUR") return prezzi;
    const c = cambi && cambi[valuta === "GBp" ? "GBP" : valuta];
    if (!c || !c.date || !c.date.length) return null;
    const fx = allinea(c.date, c.valori, calendario, 10);
    const f = valuta === "GBp" ? 100 : 1;                     // pence → sterline
    return prezzi.map((v, t) => (v != null && fx[t] ? v / fx[t] / f : null));
  }

  // ---------------- misure di una serie ----------------

  const varia = (p, i, n) => (i - n >= 0 && p[i] != null && p[i - n] != null && p[i - n] > 0 ? p[i] / p[i - n] - 1 : null);

  function daInizioAnno(p, date, i) {
    const anno = date[i].slice(0, 4);
    for (let k = i - 1; k >= 0; k--) {
      if (date[k].slice(0, 4) !== anno) return p[k] != null && p[k] > 0 ? p[i] / p[k] - 1 : null;
    }
    return null;
  }

  function statoDi(prezzo, m50, m200) {
    if (prezzo == null || m50 == null || m200 == null) return null;
    if (prezzo >= m200) return m50 >= m200 ? "rialzo" : "recupero";
    return m50 >= m200 ? "debolezza" : "ribasso";
  }

  // da quante sedute il prezzo è dalla stessa parte della media («almeno» se la media non va più indietro)
  function striscia(p, m, i) {
    if (p[i] == null || m[i] == null) return null;
    const sopra = p[i] >= m[i];
    let k = i;
    while (k > 0 && p[k - 1] != null && m[k - 1] != null && (p[k - 1] >= m[k - 1]) === sopra) k--;
    return { sopra, sedute: i - k + 1, almeno: !(k > 0 && p[k - 1] != null && m[k - 1] != null) };
  }

  // forza relativa settimanale contro q (come nella Rotazione, formula «nuova») e rendimento relativo a 3 mesi
  function forzaRelativa(p, q, barre, i) {
    if (!q || !barre) return { rs: null, rs3: null };
    const pp = barre.indici.map(k => p[k]), qq = barre.indici.map(k => q[k]);
    const r = Rot.calcola(pp, qq, "nuova");
    const rs = Rot.misure(r.ratio, r.mom, pp.length - 1);
    if (rs) rs.provvisoria = !!barre.provvisoria;
    const j = i - TRIMESTRE;
    const rs3 = j >= 0 && p[i] && q[i] && p[j] && q[j] ? (p[i] / q[i]) / (p[j] / q[j]) - 1 : null;
    return { rs, rs3 };
  }

  /**
   * Tutti i numeri di una serie all'ultima seduta del calendario.
   * grezzi: prezzi lunghi quanto date (null dove mancano); q: termine di confronto già riempito (o null);
   * barre: le sedute di fine settimana (Rotazione.barre), per la forza relativa.
   */
  function analizza(grezzi, date, q, barre) {
    const N = date.length, i = N - 1;
    const iv = ultimoVero(grezzi);
    if (iv < 0) return null;
    const p = riempi(grezzi);
    const m50 = sma(p, 50), m200 = sma(p, 200);
    let max = -Infinity, min = Infinity, maxRec = -Infinity, minRec = Infinity, conta = 0;
    for (let k = Math.max(0, i - ANNO + 1); k <= i; k++) {
      if (p[k] == null) continue;
      conta++;
      if (p[k] > max) max = p[k];
      if (p[k] < min) min = p[k];
      if (k > i - SETTIMANA) { maxRec = Math.max(maxRec, p[k]); minRec = Math.min(minRec, p[k]); }
    }
    const annoPieno = conta >= ANNO - SETTIMANA;
    const fr = forzaRelativa(p, q, barre, i);
    return {
      p, m50, m200, i, data: date[iv], vecchio: iv < i,
      ultimo: p[i],
      g1: varia(p, i, 1), s1: varia(p, i, SETTIMANA), m1: varia(p, i, 21), m3: varia(p, i, TRIMESTRE), m6: varia(p, i, 126), a1: varia(p, i, ANNO),
      ytd: daInizioAnno(p, date, i),
      vs50: m50[i] ? p[i] / m50[i] - 1 : null,
      vs200: m200[i] ? p[i] / m200[i] - 1 : null,
      stato: statoDi(p[i], m50[i], m200[i]),
      striscia: striscia(p, m200, i),
      dd52: isFinite(max) ? p[i] / max - 1 : null,
      max52: isFinite(max) ? max : null,
      min52: isFinite(min) ? min : null,
      nuovoMax: annoPieno && maxRec >= max,
      nuovoMin: annoPieno && minRec <= min,
      rs: fr.rs, rs3: fr.rs3,
    };
  }

  // ---------------- gruppi ----------------

  // quota del gruppo sopra la propria media («m200» o «m50»), giorno per giorno; null se le medie valide sono poche
  function ampiezza(gruppo, chiave) {
    const N = gruppo.length ? gruppo[0].p.length : 0;
    const minimo = Math.max(3, Math.ceil(0.6 * gruppo.length));
    const out = new Array(N).fill(null);
    for (let t = 0; t < N; t++) {
      let sopra = 0, validi = 0;
      for (const a of gruppo) {
        const m = a[chiave][t], v = a.p[t];
        if (m == null || v == null) continue;
        validi++;
        if (v > m) sopra++;
      }
      if (validi >= minimo) out[t] = sopra / validi;
    }
    return out;
  }

  // quanti sono sopra la media a una certa seduta
  function conta(gruppo, chiave, t) {
    let sopra = 0, validi = 0;
    for (const a of gruppo) {
      const m = a[chiave][t], v = a.p[t];
      if (m == null || v == null) continue;
      validi++;
      if (v > m) sopra++;
    }
    return { sopra, validi };
  }

  // paniere a pesi uguali, base 100: ogni giorno la media dei rendimenti delle serie che hanno i due prezzi.
  // Parte quando ha i prezzi almeno il 60% delle serie; chi arriva dopo entra dal suo primo prezzo.
  function paniere(serie) {
    const N = serie.length ? serie[0].length : 0;
    const out = new Array(N).fill(null);
    if (!serie.length) return out;
    const minimo = Math.max(1, Math.ceil(0.6 * serie.length));
    let v = null;
    for (let t = 0; t < N; t++) {
      if (v == null) {
        let presenti = 0;
        for (const p of serie) if (p[t] != null) presenti++;
        if (presenti >= minimo) { v = 100; out[t] = v; }
        continue;
      }
      let s = 0, c = 0;
      for (const p of serie) {
        if (p[t] != null && p[t - 1] != null && p[t - 1] > 0) { s += p[t] / p[t - 1] - 1; c++; }
      }
      if (c) v *= 1 + s / c;
      out[t] = v;
    }
    return out;
  }

  // mediana (per i rendimenti tipici di un gruppo)
  function mediana(valori) {
    const v = valori.filter(x => x != null && isFinite(x)).sort((a, b) => a - b);
    if (!v.length) return null;
    const k = (v.length - 1) / 2;
    return (v[Math.floor(k)] + v[Math.ceil(k)]) / 2;
  }

  // ordine della forza relativa nelle tabelle: prima i leader, poi in miglioramento, in indebolimento, in ritardo
  const ordineForza = rs => (rs ? ORDINE_Q[rs.quadrante] * 1000 - rs.ratio : null);

  return {
    STATI, ORDINE_STATI, ORDINE_Q, ANNO,
    piena, riempi, ultimoVero, sma, allinea, inEuro,
    varia, daInizioAnno, statoDi, striscia, forzaRelativa, analizza,
    ampiezza, conta, paniere, mediana, ordineForza,
  };
});
