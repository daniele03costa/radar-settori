/*
 * Radar Settori — portafoglio di riferimento (benchmark "PTF") ribilanciato a fine mese.
 * Funziona sia nel browser (window.Portafoglio) sia in Node (module.exports).
 */
(function (root) {
  "use strict";

  // pesi positivi riportati a somma 1 sui soli titoli disponibili
  function normalizza(pesi, disponibili) {
    const out = {};
    let tot = 0;
    for (const [t, w] of Object.entries(pesi)) {
      if (w > 0 && (!disponibili || disponibili.has(t))) { out[t] = w; tot += w; }
    }
    if (tot <= 0) return {};
    for (const t of Object.keys(out)) out[t] /= tot;
    return out;
  }

  /**
   * date: ["YYYY-MM-DD", …]; serie: { titolo: [prezzi o null] }; pesi: { titolo: peso }
   * Ritorna { valori, pesiOggi, ultimoRibilanciamento, inizio }
   * - il valore parte da 100 alla prima data con almeno un titolo;
   * - a fine mese le quote tornano ai pesi obiettivo (in proporzione se il totale non fa 100);
   * - un titolo senza prezzo (non ancora quotato) non entra finché non ne ha uno;
   * - un prezzo mancante in mezzo alla serie vale l'ultimo noto.
   */
  function calcola(date, serie, pesi) {
    const N = date.length;
    const nomi = Object.keys(pesi).filter(t => pesi[t] > 0 && serie[t]);
    const ultimo = {};
    const valori = new Array(N).fill(null);
    let quote = null;
    let ultimoRib = null;
    let inizio = null;

    const prezzoDi = (t, i) => {
      const v = serie[t][i];
      if (v != null && isFinite(v) && v > 0) ultimo[t] = v;
      return ultimo[t] != null ? ultimo[t] : null;
    };

    const ribilancia = (i, valore) => {
      const disp = new Set(nomi.filter(t => ultimo[t] != null));
      const w = normalizza(pesi, disp);
      quote = {};
      for (const [t, wt] of Object.entries(w)) quote[t] = (valore * wt) / ultimo[t];
      ultimoRib = i;
    };

    for (let i = 0; i < N; i++) {
      for (const t of nomi) prezzoDi(t, i);
      if (quote == null) {
        if (nomi.some(t => ultimo[t] != null)) {
          inizio = i;
          ribilancia(i, 100);
          valori[i] = 100;
        }
        continue;
      }
      let v = 0;
      for (const [t, q] of Object.entries(quote)) v += q * ultimo[t];
      valori[i] = v;
      const fineMese = i === N - 1 ? false : date[i + 1].slice(0, 7) !== date[i].slice(0, 7);
      // un titolo appena quotato entra al primo ribilanciamento utile
      if (fineMese) ribilancia(i, v);
    }

    const pesiOggi = {};
    if (quote && valori[N - 1]) {
      for (const [t, q] of Object.entries(quote)) pesiOggi[t] = (q * ultimo[t]) / valori[N - 1] * 100;
    }
    return { valori, pesiOggi, ultimoRibilanciamento: ultimoRib, inizio };
  }

  const api = { calcola, normalizza };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Portafoglio = api;
})(typeof window !== "undefined" ? window : globalThis);
