/*
 * Radar Settori — calcoli del portafoglio (vista «I miei titoli»; funziona anche in Node per i test).
 *
 * Il portafoglio sta in portafoglio.txt, una riga per titolo:
 *     ticker  quantità  prezzo medio di carico  [valuta del carico]  [data]  [nota]
 *     LIQUIDITA  importo  [valuta]
 * Tutto si porta in euro con i cambi del giorno. L'andamento passato è una simulazione: le quantità di oggi
 * tenute ferme per tutto il periodo (dice come si comporta questa composizione, non quanto si è guadagnato).
 * Il file si può proteggere con una password (AES-GCM, chiave da PBKDF2): senza password nessuno lo legge.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Portafoglio = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const CASSA = new Set(["LIQUIDITA", "LIQUIDITÀ", "CASH", "CONTANTI"]);
  const VALUTE = new Set(["EUR", "USD", "GBP", "GBX", "GBP.", "CHF", "DKK", "SEK", "NOK", "CAD", "JPY", "HKD", "AUD"]);
  const SEDUTE_ANNO = 252;
  const INTESTAZIONE = "RADAR-CIFRATO 1";

  // ---------------- lettura del file ----------------

  // numeri all'italiana (395,20) o all'inglese (395.20); con la virgola i punti sono separatori delle migliaia
  function numero(s) {
    if (s == null) return null;
    let t = String(s).trim().replace(/\s/g, "").replace(/[€$£]/g, "");
    if (!/^[-+]?[\d.,]+$/.test(t)) return null;
    if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
    const v = Number(t);
    return isFinite(v) ? v : null;
  }

  function data(s) {
    const t = String(s || "").trim();
    let m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return t;
    m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
    if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    return null;
  }

  const valutaDi = s => { const v = String(s || "").toUpperCase(); return v === "GBX" ? "GBp" : VALUTE.has(v) ? v : null; };

  function leggi(testo) {
    const out = { posizioni: [], liquidita: [], errori: [], cifrato: false };
    const righe = String(testo || "").split(/\r?\n/);
    if (righe.find(r => r.trim()) && righe.find(r => r.trim()).trim().startsWith("RADAR-CIFRATO")) { out.cifrato = true; return out; }
    righe.forEach((riga, k) => {
      const pulita = riga.replace(/#.*$/, "").trim();
      if (!pulita) return;
      const p = pulita.split(/\s+/);
      const t = p[0].toUpperCase();
      if (CASSA.has(t)) {
        const v = valutaDi(p[1]);
        const imp = numero(v ? p[2] : p[1]);
        if (imp == null) { out.errori.push({ riga: k + 1, testo: riga, motivo: "manca l'importo della liquidità" }); return; }
        out.liquidita.push({ importo: imp, valuta: v || valutaDi(p[2]) || "EUR" });
        return;
      }
      const q = numero(p[1]), c = numero(p[2]);
      if (q == null || c == null) { out.errori.push({ riga: k + 1, testo: riga, motivo: "servono ticker, quantità e prezzo di carico" }); return; }
      let i = 3, valutaCarico = null, quando = null;
      if (p[i] && valutaDi(p[i])) { valutaCarico = valutaDi(p[i]); i++; }
      if (p[i] && data(p[i])) { quando = data(p[i]); i++; }
      if (!valutaCarico && p[i] && valutaDi(p[i])) { valutaCarico = valutaDi(p[i]); i++; }
      out.posizioni.push({ t, quantita: q, carico: c, valutaCarico, data: quando, nota: p.slice(i).join(" "), riga: k + 1 });
    });
    // lo stesso titolo su più righe: si somma, con il prezzo di carico medio ponderato
    const unite = new Map();
    for (const x of out.posizioni) {
      const u = unite.get(x.t);
      if (!u) { unite.set(x.t, Object.assign({}, x)); continue; }
      const q = u.quantita + x.quantita;
      u.carico = q ? (u.carico * u.quantita + x.carico * x.quantita) / q : u.carico;
      u.quantita = q;
      if (x.data && (!u.data || x.data < u.data)) u.data = x.data;
    }
    out.posizioni = Array.from(unite.values());
    return out;
  }

  // ---------------- serie allineate ----------------

  // per ogni giorno del calendario, l'ultimo valore disponibile a quella data (al massimo «tolleranza» giorni prima)
  function allinea(date, valori, calendario, tolleranza = 7) {
    const out = new Array(calendario.length).fill(null);
    let j = -1;
    for (let k = 0; k < calendario.length; k++) {
      const g = calendario[k];
      while (j + 1 < date.length && date[j + 1] <= g) j++;
      if (j < 0 || valori[j] == null) continue;
      const giorni = (Date.parse(g) - Date.parse(date[j])) / 864e5;
      if (giorni <= tolleranza) out[k] = valori[j];
    }
    return out;
  }

  // unità di valuta per un euro, giorno per giorno (1 per l'euro)
  function cambio(cambi, valuta, calendario) {
    if (!valuta || valuta === "EUR") return calendario.map(() => 1);
    const chiave = valuta === "GBp" ? "GBP" : valuta;
    const c = cambi && cambi[chiave];
    if (!c) return calendario.map(() => null);
    return allinea(c.date, c.valori, calendario, 10);
  }
  const fattore = valuta => (valuta === "GBp" ? 100 : 1);      // pence → sterline

  // ---------------- statistiche ----------------

  const media = a => a.reduce((s, x) => s + x, 0) / a.length;
  function covarianza(a, b) {
    const ma = media(a), mb = media(b);
    let s = 0;
    for (let i = 0; i < a.length; i++) s += (a[i] - ma) * (b[i] - mb);
    return s / a.length;
  }
  function quantile(v, q) {
    const s = v.slice().sort((x, y) => x - y);
    const k = (s.length - 1) * q, a = Math.floor(k), b = Math.ceil(k);
    return s[a] + (s[b] - s[a]) * (k - a);
  }
  function caloMassimo(serie) {
    let max = -Infinity, dd = 0, iMax = 0, da = 0, a = 0;
    serie.forEach((v, i) => {
      if (v == null) return;
      if (v > max) { max = v; iMax = i; }
      const x = v / max - 1;
      if (x < dd) { dd = x; da = iMax; a = i; }
    });
    return { calo: dd, da, a };
  }
  const variazione = (s, n) => {
    const t = s.length - 1;
    return t - n >= 0 && s[t] != null && s[t - n] ? s[t] / s[t - n] - 1 : null;
  };

  // ---------------- analisi ----------------

  /**
   * dati: { posizioni, liquidita, titoli: {t → {date, prezzi, valuta, tipo, settore, paese, nome, mercato}},
   *         cambi, bench: {date, prezzi} (ACWI in euro), finestra (sedute per il rischio, 252) }
   */
  function analizza(dati) {
    const { posizioni, liquidita = [], titoli, cambi, bench } = dati;
    const finestra = dati.finestra || SEDUTE_ANNO;
    const conPrezzi = posizioni.filter(p => titoli[p.t] && titoli[p.t].prezzi && titoli[p.t].prezzi.length);
    const senzaPrezzi = posizioni.filter(p => !conPrezzi.includes(p));
    // calendario: le sedute dell'ACWI (Xetra); le crypto si prendono all'ultimo valore di quel giorno
    let calendario = bench && bench.date && bench.date.length ? bench.date.slice() : null;
    if (!calendario) {
      const tutte = new Set();
      for (const p of conPrezzi) for (const g of titoli[p.t].date) tutte.add(g);
      calendario = Array.from(tutte).sort();
    }
    // l'ultimo giorno è il più recente fra i titoli, se l'ACWI è indietro
    const ultimoTitoli = conPrezzi.reduce((m, p) => { const d = titoli[p.t].date; return d[d.length - 1] > m ? d[d.length - 1] : m; }, "");
    if (ultimoTitoli > calendario[calendario.length - 1]) calendario.push(ultimoTitoli);
    const N = calendario.length, t = N - 1;

    // prezzi in euro di ogni posizione
    const righe = conPrezzi.map(p => {
      const x = titoli[p.t];
      const valuta = x.valuta || "EUR";
      const loc = allinea(x.date, x.prezzi, calendario, x.mercato === "crypto" ? 4 : 7);
      const fx = cambio(cambi, valuta, calendario);
      const eur = loc.map((v, i) => (v == null || fx[i] == null ? null : v / fattore(valuta) / fx[i]));
      const prezzoLoc = x.prezzi[x.prezzi.length - 1];
      const fxOggi = fx[t];
      const prezzoEur = eur[t] != null ? eur[t] : fxOggi ? prezzoLoc / fattore(valuta) / fxOggi : null;
      const valore = prezzoEur == null ? null : p.quantita * prezzoEur;
      // carico in euro: al cambio del giorno d'acquisto se c'è la data, altrimenti a quello di oggi
      const valutaCarico = p.valutaCarico || valuta;
      let fxCarico = 1;
      if (valutaCarico !== "EUR") {
        const serieFx = cambio(cambi, valutaCarico, calendario);
        const k = p.data ? calendario.findIndex(g => g >= p.data) : -1;
        fxCarico = (k >= 0 ? serieFx[k] : null) || serieFx[t];
      }
      const caricoEur = fxCarico ? p.carico / fattore(valutaCarico) / fxCarico : null;
      const costo = caricoEur == null ? null : p.quantita * caricoEur;
      // media 200 nella valuta del titolo
      const pr = x.prezzi, n = pr.length;
      let m200 = null;
      if (n >= 200) { let s = 0; for (let i = n - 200; i < n; i++) s += pr[i]; m200 = s / 200; }
      return {
        t: p.t, nome: p.nota || x.nome || p.t, tipo: x.tipo || (x.mercato === "crypto" ? "Crypto" : "Azione"),
        settore: x.settore || null, paese: x.paese || null, valuta, mercato: x.mercato,
        quantita: p.quantita, carico: p.carico, valutaCarico, data: p.data,
        prezzo: prezzoLoc, prezzoEur, valore, costo,
        risultato: valore != null && costo != null ? valore - costo : null,
        risultatoPct: valore != null && costo ? (valore - costo) / Math.abs(costo) : null,
        risultatoLocale: valutaCarico === valuta && p.carico ? prezzoLoc / p.carico - 1 : null,
        vs200: m200 ? prezzoLoc / m200 - 1 : null,
        eur, aggiornato: x.date[x.date.length - 1],
      };
    });
    const cassa = liquidita.reduce((s, c) => {
      const fx = cambio(cambi, c.valuta, calendario)[t];
      return s + (fx ? c.importo / fx : 0);
    }, 0);
    const investito = righe.reduce((s, r) => s + (r.valore || 0), 0);
    const totale = investito + cassa;
    const costoTotale = righe.reduce((s, r) => s + (r.costo || 0), 0);
    for (const r of righe) r.peso = totale ? r.valore / totale : null;

    // valore giorno per giorno con le quantità di oggi, dal primo giorno in cui ci sono tutti i prezzi
    let inizio = 0;
    for (const r of righe) { const k = r.eur.findIndex(v => v != null); if (k > inizio) inizio = k; }
    const valore = calendario.map((_, i) => {
      if (i < inizio) return null;
      let s = cassa;
      for (const r of righe) { if (r.eur[i] == null) return null; s += r.quantita * r.eur[i]; }
      return s;
    });
    const benchEur = bench ? allinea(bench.date, bench.prezzi, calendario) : null;

    // rendimenti giornalieri nella finestra del rischio (ultime «finestra» sedute con tutti i prezzi)
    const da = Math.max(inizio + 1, N - finestra);
    const giorni = [];
    for (let i = da; i < N; i++) {
      if (valore[i] == null || valore[i - 1] == null) continue;
      if (righe.some(r => r.eur[i] == null || r.eur[i - 1] == null)) continue;
      if (benchEur && (benchEur[i] == null || benchEur[i - 1] == null)) continue;
      giorni.push(i);
    }
    const rend = righe.map(r => giorni.map(i => r.eur[i] / r.eur[i - 1] - 1));
    const rP = giorni.map(i => valore[i] / valore[i - 1] - 1);
    const rB = benchEur ? giorni.map(i => benchEur[i] / benchEur[i - 1] - 1) : null;
    const n = righe.length;
    const cov = [];
    for (let a = 0; a < n; a++) { cov.push([]); for (let b = 0; b < n; b++) cov[a].push(giorni.length > 20 ? covarianza(rend[a], rend[b]) : null); }
    const w = righe.map(r => r.peso || 0);
    const sigmaW = cov.map(riga => riga.reduce((s, c, b) => s + (c == null ? 0 : c * w[b]), 0));
    const varP = w.reduce((s, wi, a) => s + wi * sigmaW[a], 0);
    const varB = rB && giorni.length > 20 ? covarianza(rB, rB) : null;
    righe.forEach((r, a) => {
      const vol = cov[a][a] != null ? Math.sqrt(cov[a][a] * SEDUTE_ANNO) : null;
      r.vol = vol;
      r.beta = varB ? covarianza(rend[a], rB) / varB : null;
      r.rischio = varP > 0 ? (w[a] * sigmaW[a]) / varP : null;           // quota del rischio totale
    });
    const corr = cov.map((riga, a) => riga.map((c, b) => (c == null || !cov[a][a] || !cov[b][b] ? null : c / Math.sqrt(cov[a][a] * cov[b][b]))));
    const fuoriDiagonale = [];
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) if (corr[a][b] != null) fuoriDiagonale.push(corr[a][b]);
    const volP = varP > 0 ? Math.sqrt(varP * SEDUTE_ANNO) : null;
    const pesiInvestiti = righe.map(r => (investito ? Math.abs(r.valore) / righe.reduce((s, z) => s + Math.abs(z.valore || 0), 0) : 0));
    const ordinati = righe.slice().sort((x, y) => (y.valore || 0) - (x.valore || 0));
    const serieUltimoAnno = valore.slice(Math.max(inizio, N - SEDUTE_ANNO - 1));
    const benchUltimoAnno = benchEur ? benchEur.slice(Math.max(inizio, N - SEDUTE_ANNO - 1)) : null;

    // gruppi per la composizione
    const gruppo = f => {
      const m = new Map();
      for (const r of righe) { const k = f(r) || "Altro"; m.set(k, (m.get(k) || 0) + (r.valore || 0)); }
      if (cassa) m.set("Liquidità", (m.get("Liquidità") || 0) + cassa);
      return Array.from(m.entries()).map(([nome, v]) => ({ nome, valore: v, peso: totale ? v / totale : 0 })).sort((x, y) => y.valore - x.valore);
    };
    const valutaNome = { EUR: "Euro", USD: "Dollaro", GBp: "Sterlina", GBP: "Sterlina", CHF: "Franco svizzero", DKK: "Corona danese",
      SEK: "Corona svedese", NOK: "Corona norvegese", CAD: "Dollaro canadese", JPY: "Yen", HKD: "Dollaro di Hong Kong", AUD: "Dollaro australiano" };
    const europei = new Set(["Italia", "Germania", "Francia", "Spagna", "Paesi Bassi", "Svizzera", "Regno Unito", "Irlanda", "Belgio",
      "Lussemburgo", "Danimarca", "Svezia", "Norvegia", "Finlandia", "Austria", "Portogallo", "Jersey"]);
    const area = r => (r.tipo === "Crypto" ? "Crypto" : r.tipo === "ETF" || r.tipo === "Fondo" ? "ETF e fondi" : r.paese === "Stati Uniti" ? "Stati Uniti" :
      europei.has(r.paese) ? "Europa" : r.paese ? "Resto del mondo" : "Altro");
    const composizione = {
      tipo: gruppo(r => ({ Azione: "Azioni", ETF: "ETF", Crypto: "Crypto", Fondo: "Fondi" })[r.tipo] || r.tipo),
      valuta: gruppo(r => valutaNome[r.valuta] || r.valuta),
      area: gruppo(area),
      paese: gruppo(r => (r.tipo === "Crypto" ? "Crypto" : r.tipo === "ETF" || r.tipo === "Fondo" ? "ETF e fondi" : r.paese)),
      settore: gruppo(r => (r.tipo === "Crypto" ? "Crypto" : r.tipo === "ETF" || r.tipo === "Fondo" ? "ETF e fondi" : r.settore)),
    };
    const oggiEur = valore[t] != null && valore[t - 1] != null ? valore[t] - valore[t - 1] : null;
    const annoPrima = (() => { const a = calendario[t].slice(0, 4); for (let i = t; i >= 0; i--) if (calendario[i].slice(0, 4) !== a) return i; return null; })();
    const rendimento = s => ({
      g30: variazione(s, 21), g90: variazione(s, 63), a1: variazione(s, SEDUTE_ANNO),
      ytd: annoPrima != null && annoPrima >= inizio && s[annoPrima] ? s[t] / s[annoPrima] - 1 : null,
    });
    return {
      calendario, righe, senzaPrezzi, inizio, giorni: giorni.length,
      totale, investito, cassa, costo: costoTotale,
      risultato: costoTotale ? investito - costoTotale : null,
      risultatoPct: costoTotale ? (investito - costoTotale) / Math.abs(costoTotale) : null,
      oggi: oggiEur, oggiPct: oggiEur != null && valore[t - 1] ? oggiEur / valore[t - 1] : null,
      serie: { valore, bench: benchEur },
      rendimenti: { portafoglio: rendimento(valore), bench: benchEur ? rendimento(benchEur) : null },
      rischio: {
        vol: volP,
        volBench: varB ? Math.sqrt(varB * SEDUTE_ANNO) : null,
        beta: varB ? righe.reduce((s, r, a) => s + w[a] * (r.beta || 0), 0) : null,
        corrBench: varB && rP.length > 20 ? covarianza(rP, rB) / Math.sqrt(covarianza(rP, rP) * varB) : null,
        var95: rP.length > 40 ? -quantile(rP, 0.05) * totale : null,
        diversificazione: volP ? righe.reduce((s, r, a) => s + Math.abs(w[a]) * (r.vol || 0), 0) / volP : null,
        corrMedia: fuoriDiagonale.length ? media(fuoriDiagonale) : null,
        nEffettivo: pesiInvestiti.length ? 1 / pesiInvestiti.reduce((s, x) => s + x * x, 0) : null,
        primo: ordinati[0] ? { t: ordinati[0].t, nome: ordinati[0].nome, peso: ordinati[0].peso } : null,
        primiTre: ordinati.slice(0, 3).reduce((s, r) => s + (r.peso || 0), 0),
        caloAnno: caloMassimo(serieUltimoAnno),
        caloAnnoBench: benchUltimoAnno ? caloMassimo(benchUltimoAnno) : null,
        caloTutto: caloMassimo(valore.slice(inizio)),
      },
      correlazioni: corr,
      composizione,
    };
  }

  // ---------------- protezione con password ----------------

  const subtle = () => (typeof crypto !== "undefined" && crypto.subtle) || (typeof globalThis !== "undefined" && globalThis.crypto && globalThis.crypto.subtle);
  const b64 = u8 => { let s = ""; u8.forEach(c => { s += String.fromCharCode(c); }); return typeof btoa === "function" ? btoa(s) : Buffer.from(u8).toString("base64"); };
  const deB64 = s => (typeof atob === "function" ? Uint8Array.from(atob(s), c => c.charCodeAt(0)) : new Uint8Array(Buffer.from(s, "base64")));

  async function chiave(password, sale) {
    const base = await subtle().importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
    return subtle().deriveKey({ name: "PBKDF2", salt: sale, iterations: 210000, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  }

  async function cifra(testo, password) {
    const sale = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    const k = await chiave(password, sale);
    const dati = new Uint8Array(await subtle().encrypt({ name: "AES-GCM", iv }, k, new TextEncoder().encode(testo)));
    const tutto = new Uint8Array(sale.length + iv.length + dati.length);
    tutto.set(sale, 0); tutto.set(iv, 16); tutto.set(dati, 28);
    return `${INTESTAZIONE}\n# Portafoglio protetto con password: si legge solo dal sito, dopo averla inserita.\n${b64(tutto).match(/.{1,76}/g).join("\n")}\n`;
  }

  async function decifra(blocco, password) {
    const righe = String(blocco).split(/\r?\n/).map(r => r.trim()).filter(r => r && !r.startsWith("#") && !r.startsWith("RADAR-CIFRATO"));
    const tutto = deB64(righe.join(""));
    const k = await chiave(password, tutto.slice(0, 16));
    const chiaro = await subtle().decrypt({ name: "AES-GCM", iv: tutto.slice(16, 28) }, k, tutto.slice(28));
    return new TextDecoder().decode(chiaro);
  }

  return { CASSA, SEDUTE_ANNO, numero, data, leggi, allinea, cambio, caloMassimo, quantile, analizza, cifra, decifra };
});
