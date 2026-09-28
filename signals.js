/*
 * Radar Settori — stati del settore (Normale, Attenzione, Zona blu, Trigger, Fallito, Cooldown),
 * episodi di zona blu e relative statistiche.
 * Funziona sia nel browser (window.Signals) sia in Node (module.exports) per i test.
 */
(function (root) {
  "use strict";

  // Parametri degli stati (si possono cambiare da config/settings.json → "parametri")
  const PARAMETRI = {
    fasciaAttenzione: 10,  // punti sopra il livello blu entro cui scatta "Attenzione"
    ddAttenzione: 85,      // percentile di profondità del drawdown che fa scattare "Attenzione"
    ddIngresso: 70,        // percentile di profondità necessario per entrare in zona blu
    chiusureIngresso: 2,   // chiusure consecutive al livello blu o sotto per entrare in zona blu
    recuperoPunti: 5,      // risalita minima sopra il livello per il trigger, in punti…
    recuperoTitoli: 2,     // …o in titoli (vale il più grande); stessi titoli di margine sul minimo della zona
    zonaLunga: 60,         // sedute oltre le quali il trigger chiede 2 conferme
    verifica: 20,          // sedute in cui un trigger può ancora fallire
    escursione: 20,        // sedute per la variazione giornaliera media usata nella soglia di fallimento
    cooldown: 63,          // sedute di pausa dopo un trigger
    riarmoMinimo: 40,      // livello di riarmo = il maggiore tra questo valore…
    riarmoSopra: 25,       // …e il livello blu più questi punti
    spinta20: { da: 15, a: 70, sedute: 15 },   // spinta sulla quota sopra la media 20
    spinta50: { da: 10, a: 50, sedute: 20 },   // spinta sulla quota sopra la media 50
    memoriaSpinta: 20,     // per quante sedute una spinta vale come conferma
  };

  const MOTIVI = {
    spinta20: "spinta di ampiezza a 20 sedute",
    spinta50: "spinta di ampiezza a 50 sedute",
    prezzo: "prezzo sopra la media 20 in salita",
    divergenza: "divergenza prezzo/ampiezza",
    rimbalzoV: "rimbalzo a V (ampiezza sopra il livello di riarmo)",
  };

  const STATI = {
    normale: "Normale",
    attenzione: "Attenzione",
    blu: "Zona blu",
    trigger: "Trigger",
    fallito: "Fallito",
    cooldown: "Cooldown",
  };

  // ---------------- utilità ----------------

  function sma(values, n) {
    const out = new Array(values.length).fill(null);
    let sum = 0, cnt = 0;
    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      if (v == null) { sum = 0; cnt = 0; continue; }
      sum += v; cnt++;
      if (cnt > n) { sum -= values[i - n]; cnt = n; }
      if (cnt === n) out[i] = sum / n;
    }
    return out;
  }

  function ret(adj, from, h) {
    const to = from + h;
    if (from == null || to >= adj.length || adj[from] == null || adj[to] == null) return null;
    return (adj[to] / adj[from] - 1) * 100;
  }

  function worstAfter(adj, from, h) {
    if (from == null || adj[from] == null || from + 1 >= adj.length) return null;
    let m = 0, seen = false;
    for (let k = from + 1; k <= Math.min(adj.length - 1, from + h); k++) {
      if (adj[k] == null) continue;
      seen = true;
      m = Math.min(m, (adj[k] / adj[from] - 1) * 100);
    }
    return seen ? m : null;
  }

  function median(xs) {
    if (!xs.length) return null;
    const s = xs.slice().sort((a, b) => a - b);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  // quota (0–100) di valori meno profondi di x
  function percentileRank(values, x) {
    let n = 0, meno = 0;
    for (const v of values) { if (v == null) continue; n++; if (v > x) meno++; }
    return n ? (meno / n) * 100 : null;
  }

  // percentile del drawdown usando solo la storia fino a quel giorno (nessuno sguardo al futuro)
  function percentiliStorici(dd) {
    const out = new Array(dd.length).fill(null);
    const visti = [];
    for (let i = 0; i < dd.length; i++) {
      const v = dd[i];
      if (v == null) continue;
      // inserimento ordinato (crescente)
      let lo = 0, hi = visti.length;
      while (lo < hi) { const m = (lo + hi) >> 1; if (visti[m] < v) lo = m + 1; else hi = m; }
      visti.splice(lo, 0, v);
      // quanti valori sono strettamente maggiori di v (drawdown meno profondi)
      let a = lo; while (a < visti.length && visti[a] <= v) a++;
      out[i] = ((visti.length - a) / visti.length) * 100;
    }
    return out;
  }

  // giorni in cui si completa una spinta: da ≤da a ≥a entro "sedute"
  function spinte(serie, cfg) {
    const out = new Array(serie.length).fill(false);
    if (!serie) return out;
    for (let t = 0; t < serie.length; t++) {
      const v = serie[t];
      if (v == null || v < cfg.a) continue;
      for (let k = Math.max(0, t - cfg.sedute); k < t; k++) {
        if (serie[k] != null && serie[k] <= cfg.da) { out[t] = true; break; }
      }
    }
    return out;
  }

  function escursioneMedia(close, n) {
    const out = new Array(close.length).fill(null);
    for (let t = 1; t < close.length; t++) {
      let s = 0, c = 0;
      for (let k = Math.max(1, t - n + 1); k <= t; k++) {
        if (close[k] != null && close[k - 1] != null) { s += Math.abs(close[k] - close[k - 1]); c++; }
      }
      out[t] = c ? s / c : null;
    }
    return out;
  }

  // calcoli che non dipendono dal livello: si fanno una volta per settore
  function preparaSerie(d, P) {
    if (d._prep) return d._prep;
    const ma20 = sma(d.close, 20);
    d._prep = {
      ma20,
      ddPerc: percentiliStorici(d.dd),
      spinta20: d.b20 ? spinte(d.b20, P.spinta20) : new Array(d.date.length).fill(false),
      spinta50: spinte(d.b50, P.spinta50),
      escursione: escursioneMedia(d.close, P.escursione),
    };
    return d._prep;
  }

  // ---------------- macchina a stati ----------------

  /**
   * d: { date, close, adj, ma200, dd, b200, b50, b20, n }
   * livello: livello blu (% di titoli sopra la media 200)
   */
  function analizza(d, livello, parametri) {
    const P = Object.assign({}, PARAMETRI, parametri || {});
    const N = d.date.length;
    const S = preparaSerie(d, P);
    const stati = new Array(N).fill(null);
    const episodi = [];
    const riarmo = Math.max(P.riarmoMinimo, livello + P.riarmoSopra);

    let modo = "attesa";    // attesa | blu | trigger | cooldown
    let armato = true;
    let sotto = 0;
    let ep = null;
    let tTrigger = null, sogliaFallimento = null;

    const titoli = t => Math.max(1, d.n[t] || 1);
    const punti = (t, k) => (100 / titoli(t)) * k;

    function conferme(t) {
      const out = [];
      const da = Math.max(ep.daQui, t - P.memoriaSpinta);
      let s20 = false, s50 = false;
      for (let k = da; k <= t; k++) { if (S.spinta20[k]) s20 = true; if (S.spinta50[k]) s50 = true; }
      if (s20) out.push("spinta20");
      if (s50) out.push("spinta50");
      const c = d.close[t], m = S.ma20[t], mPrev = S.ma20[t - 1];
      if (c != null && m != null && mPrev != null && c > m && m > mPrev) out.push("prezzo");
      // divergenza: dopo il minimo di ampiezza il prezzo ha fatto un minimo più basso con ampiezza più alta
      const iB = ep.minBIdx;
      let iP = null;
      for (let k = ep.daQui; k <= t; k++) if (d.close[k] != null && (iP == null || d.close[k] < d.close[iP])) iP = k;
      if (iP != null && iP > iB && d.close[iB] != null && d.close[iP] < d.close[iB] &&
          d.b200[iP] != null && d.b200[iP] >= ep.minB + punti(iP, 1)) out.push("divergenza");
      return out;
    }

    for (let t = 0; t < N; t++) {
      const b = d.b200[t];
      if (b == null) continue;
      if (!armato && b >= riarmo) armato = true;
      sotto = b <= livello ? sotto + 1 : 0;

      if (modo === "cooldown" && t - tTrigger >= P.cooldown) modo = "attesa";

      if (modo === "attesa") {
        const pctDD = S.ddPerc[t];
        if (armato && sotto >= P.chiusureIngresso && pctDD != null && pctDD > P.ddIngresso) {
          ep = {
            inizio: t, daQui: t, minB: b, minBIdx: t, falliti: [], segnale: null, motivi: [],
            stato: "attesa", ddInizio: d.dd[t],
          };
          // il minimo di ampiezza include le chiusure sotto il livello che hanno aperto la zona
          for (let k = t - sotto + 1; k < t; k++) if (d.b200[k] != null && d.b200[k] < ep.minB) { ep.minB = d.b200[k]; ep.minBIdx = k; }
          episodi.push(ep);
          modo = "blu";
          armato = false;
          stati[t] = "blu";
        } else {
          stati[t] = (b <= livello + P.fasciaAttenzione || (pctDD != null && pctDD > P.ddAttenzione)) ? "attenzione" : "normale";
        }
        continue;
      }

      if (modo === "blu") {
        if (b < ep.minB) { ep.minB = b; ep.minBIdx = t; }
        let motivi = null;
        if (b >= riarmo) {
          motivi = ["rimbalzoV"];
        } else {
          const recupero = b >= livello + Math.max(P.recuperoPunti, punti(t, P.recuperoTitoli)) &&
                           b >= ep.minB + punti(t, P.recuperoTitoli);
          if (recupero) {
            const servono = (t - ep.inizio > P.zonaLunga || ep.falliti.length) ? 2 : 1;
            const c = conferme(t);
            if (c.length >= servono) motivi = c;
          }
        }
        if (motivi) {
          ep.segnale = t;
          ep.motivi = motivi;
          tTrigger = t;
          let minimo = Infinity;
          for (let k = ep.inizio; k <= t; k++) if (d.close[k] != null && d.close[k] < minimo) minimo = d.close[k];
          sogliaFallimento = minimo === Infinity ? null : minimo - (S.escursione[t] || 0);
          ep.sogliaFallimento = sogliaFallimento;
          modo = "trigger";
          stati[t] = "trigger";
        } else {
          stati[t] = "blu";
        }
        continue;
      }

      if (modo === "trigger") {
        const c = d.close[t];
        if (sogliaFallimento != null && c != null && c < sogliaFallimento) {
          ep.falliti.push(tTrigger);
          (ep.motiviFalliti = ep.motiviFalliti || {})[tTrigger] = ep.motivi;
          ep.segnale = null;
          ep.motivi = [];
          ep.daQui = t;
          if (b < ep.minB) { ep.minB = b; ep.minBIdx = t; }
          modo = "blu";
          stati[t] = "fallito";
        } else if (t - tTrigger >= P.verifica) {
          modo = "cooldown";
          stati[t] = "cooldown";
        } else {
          stati[t] = "trigger";
        }
        continue;
      }

      if (modo === "cooldown") stati[t] = "cooldown";
    }

    // cosa manca al trigger, se oggi il settore è in zona blu
    let manca = null;
    if (modo === "blu" && ep) {
      const t = N - 1;
      const b = d.b200[t];
      const obiettivo = Math.max(livello + Math.max(P.recuperoPunti, punti(t, P.recuperoTitoli)), ep.minB + punti(t, P.recuperoTitoli));
      manca = {
        obiettivo,
        punti: b == null ? null : Math.max(0, obiettivo - b),
        servono: (t - ep.inizio > P.zonaLunga || ep.falliti.length) ? 2 : 1,
        conferme: conferme(t),
        riarmo,
      };
    }

    // metriche degli episodi
    for (const e of episodi) {
      e.stato = e.segnale == null ? "attesa" : (e.segnale + P.verifica >= N ? "verifica" : "confermato");
      e.r3Inizio = ret(d.adj, e.inizio, 63);
      e.r1 = ret(d.adj, e.segnale, 21);
      e.r3 = ret(d.adj, e.segnale, 63);
      e.r6 = ret(d.adj, e.segnale, 126);
      e.caloMax = worstAfter(d.adj, e.segnale, 63);
      e.fine = e.segnale != null ? e.segnale : N - 1;
    }

    let validi = 0, sottoLivello = 0;
    for (const v of d.b200) { if (v == null) continue; validi++; if (v <= livello) sottoLivello++; }
    const r3 = episodi.filter(e => e.r3 != null).map(e => e.r3);
    let statoOggi = null;
    for (let t = N - 1; t >= 0; t--) if (stati[t]) { statoOggi = stati[t]; break; }
    const ultimo = episodi[episodi.length - 1];

    return {
      episodi,
      stati,
      statoOggi,
      attivo: ultimo && ultimo.segnale == null ? ultimo : null,
      riarmo,
      armato,
      manca,
      quotaSotto: validi ? (sottoLivello / validi) * 100 : null,
      mediana3: median(r3),
      positivi3: r3.length ? (r3.filter(x => x > 0).length / r3.length) * 100 : null,
      casi3: r3.length,
      ddPerc: S.ddPerc,
      ma20: S.ma20,
    };
  }

  const api = { PARAMETRI, MOTIVI, STATI, analizza, sma, median, percentileRank, percentiliStorici, spinte };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Signals = api;
})(typeof window !== "undefined" ? window : globalThis);
