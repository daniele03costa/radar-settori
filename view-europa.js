/*
 * Radar Settori — zona Europa, pagina Azioni.
 * Le azioni degli indici principali delle borse europee (FTSE MIB, DAX, CAC 40, IBEX 35, AEX, SMI, FTSE 100, OMX Copenhagen 25,
 * OMX Stockholm 30, OMX Helsinki 25, OBX, BEL 20, ATX, PSI, ISEQ): tutte, cercabili per nome, con filtri e ordinamento,
 * e la scheda di ciascuna con il grafico, da cui si aggiunge alla lista dei titoli seguiti o al portafoglio.
 * Monitor, Bottom Map, Settori e indici e Alert dell'Europa sono le stesse pagine degli USA (view-monitor.js, view-bottom.js,
 * view-settore.js, view-alert.js) con l'ampiezza storica di data/europa/; la Rotazione è in view-rotazione.js.
 * Questo file fornisce anche il riepilogo per la Home e le serie per la Rotazione. I calcoli stanno in europa-calcoli.js.
 */
(function () {
  "use strict";

  const R = window.Radar, E = window.Europa, Rot = window.Rotazione, Cal = window.Calendario;
  const { $, num, pct, esc, svg, dataIt, cls } = R;

  const NOMI_Q = { leader: "Leader", indebolimento: "In indebolimento", ritardo: "In ritardo", miglioramento: "In miglioramento" };
  const COLORE_STATO = { rialzo: "var(--q-leader)", recupero: "var(--q-miglioramento)", debolezza: "var(--q-indebolimento)", ribasso: "var(--q-ritardo)" };
  const SIMBOLI = { EUR: "€", GBp: "p", CHF: "CHF", DKK: "kr", SEK: "kr", NOK: "kr" };
  const PERIODI = [[126, "6 mesi"], [252, "1 anno"], [504, "2 anni"]];
  const PASSO = 60;                                          // righe mostrate prima di «mostra tutte»
  const FILTRI = [
    ["", "Tutte le azioni"], ["sopra", "Sopra la media 200"], ["sotto", "Sotto la media 200"],
    ["leader", "Leader sul loro indice"], ["miglioramento", "In miglioramento"], ["indebolimento", "In indebolimento"], ["ritardo", "In ritardo"],
    ["massimi", "Nuovi massimi a 52 settimane"], ["minimi", "Nuovi minimi a 52 settimane"], ["miei", "Nella mia lista o nel portafoglio"],
  ];
  // altre parole con cui si cerca un settore
  const SINONIMI = {
    Finanziari: "banche banca assicurazioni", Sanità: "salute farmaceutica farmaci", "Beni di prima necessità": "alimentari bevande",
    "Consumi discrezionali": "lusso auto moda", Industriali: "industria difesa trasporti", Materiali: "chimica acciaio metalli",
    Comunicazioni: "telecomunicazioni media", Immobiliare: "immobili", Tecnologia: "tech semiconduttori", Energia: "petrolio gas",
    Utility: "elettricità",
  };
  const norm = x => String(x || "").toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Z0-9&]+/g, " ").trim();

  // nomi brevi per i grafici
  const BREVI_INDICI = { "OMX Copenhagen 25": "OMXC25", "OMX Stockholm 30": "OMXS30", "OMX Helsinki 25": "OMXH25" };
  const BREVI_SETTORI = { "Consumi discrezionali": "Discrezionali", "Beni di prima necessità": "Prima necessità" };

  const st = {
    visibile: false,
    x: null,                                                // dati preparati
    // filtri e ricerca
    f: { indice: R.store.get("eur.indice", null), settore: R.store.get("eur.settore", null), filtro: R.store.get("eur.filtro", "") },
    cerca: "",
    ordine: R.store.get("eur.ordine", { col: "rs", dir: 1 }),
    periodo: PERIODI.some(([k]) => k === R.store.get("eur.periodo", 252)) ? R.store.get("eur.periodo", 252) : 252,
    tutte: false,
    aperto: null,
    lista: new Set(), portafoglio: new Set(),
  };
  let preparato = null;                                     // { d, promessa } dei dati preparati

  // ---------------- formati ----------------

  const p100 = (v, d = 1) => (v == null || !isFinite(v) ? "—" : pct(v * 100, d));
  const cls100 = v => (v == null ? "" : cls(v * 100));
  const frazione = o => (o && o.validi ? o.sopra / o.validi : null);
  const cifre = v => (v == null || !isFinite(v) ? "—" : v >= 1000 ? num(v, 0) : v >= 100 ? num(v, 1) : num(v, 2));
  const prezzo = (v, valuta) => `${cifre(v)}<span class="valuta">${SIMBOLI[valuta] || valuta || ""}</span>`;
  const NOMI_VALUTE = { GBp: "pence di sterlina", CHF: "franchi svizzeri", DKK: "corone danesi", SEK: "corone svedesi", NOK: "corone norvegesi" };
  const nomeValuta = v => NOMI_VALUTE[v] || "euro";
  const pill = s => (s ? `<span class="st-pill" style="--c:${COLORE_STATO[s]}">${E.STATI[s]}</span>` : "—");
  const quad = rs => (rs ? `<span class="quad" style="--c:var(--q-${rs.quadrante})"><i></i>${NOMI_Q[rs.quadrante]}</span>${R.freccia(rs.direzione)}` : "—");
  const maiuscola = s => s.charAt(0).toUpperCase() + s.slice(1);
  const elenco = a => (a.length <= 1 ? a.join("") : a.slice(0, -1).join(", ") + " e " + a[a.length - 1]);
  // preposizioni davanti al nome di un indice: «sul DAX», «sull'IBEX 35», «sullo SMI»
  const prep = (p, nome) => {
    const forme = { sul: ["sul ", "sull'", "sullo "], del: ["del ", "dell'", "dello "], nel: ["nel ", "nell'", "nello "] }[p];
    return (/^[AEIOU]/i.test(nome) ? forme[1] : /^(S[^AEIOU]|Z|GN|PS|X)/i.test(nome) ? forme[2] : forme[0]) + nome;
  };
  const breve = (s, n = 22) => (s.length > n ? s.slice(0, n - 1).trim() + "…" : s);
  const sedute = s => (s ? `${s.sopra ? "sopra" : "sotto"} da ${s.almeno ? "almeno " : ""}${R.sedute(s.sedute)}` : "—");

  // ---------------- dati ----------------

  // una pausa per lasciare respirare la pagina (sul telefono i calcoli su 470 azioni durano più di un secondo)
  const pausa = () => new Promise(r => setTimeout(r, 0));

  async function prepara(d, lista, cambi) {
    const N = d.date.length, date = d.date;
    const barre = Rot.barre(date, "settimanali", g => Cal.successiva(g, "milano"));
    const info = new Map(((lista && lista.indici) || []).map(i => [i.nome, i]));
    const yahooConfronto = (lista && lista.confronto && lista.confronto.yahoo) || "^STOXX";
    const tutti = d.indici.map(i => {
      const inf = info.get(i.nome) || {};
      const a = E.analizza(E.piena(N, i.i0, i.prezzi), date, null, barre);
      return a ? { nome: i.nome, yahoo: i.yahoo, paese: i.paese || inf.paese || "", valuta: inf.valuta || "EUR", a } : null;
    }).filter(Boolean);
    const confronto = tutti.find(i => i.yahoo === yahooConfronto) || null;
    const indici = tutti.filter(i => i !== confronto);
    const perNome = new Map(indici.map(i => [i.nome, i]));
    // un indice che Yahoo non ha dato: al suo posto il paniere a pesi uguali delle sue azioni, in valuta locale
    for (const inf of (lista && lista.indici) || []) {
      if (perNome.has(inf.nome)) continue;
      const membri = d.titoli.filter(x => (x.indici || []).includes(inf.nome));
      if (membri.length < 3) continue;
      const a = E.analizza(E.paniere(membri.map(x => E.riempi(E.piena(N, x.i0, x.prezzi)))), date, null, barre);
      if (!a) continue;
      const i = { nome: inf.nome, yahoo: "", paese: inf.paese || "", valuta: inf.valuta || "EUR", a, paniere: true };
      indici.push(i);
      perNome.set(i.nome, i);
    }
    // nell'ordine dell'elenco (FTSE MIB per primo)
    const posto = new Map(((lista && lista.indici) || []).map((i, k) => [i.nome, k]));
    indici.sort((u, v) => (posto.has(u.nome) ? posto.get(u.nome) : 99) - (posto.has(v.nome) ? posto.get(v.nome) : 99));

    // azioni: ogni azione contro il suo indice, in valuta locale; la serie in euro serve ai panieri
    let senzaCambi = false;
    const titoli = [];
    for (let k = 0; k < d.titoli.length; k++) {
      if (k % 40 === 39) await pausa();
      const x = d.titoli[k];
      const idx = perNome.get((x.indici || [])[0]) || null;
      const a = E.analizza(E.piena(N, x.i0, x.prezzi), date, idx ? idx.a.p : null, barre);
      if (!a) continue;
      let eur = E.inEuro(a.p, x.valuta, date, cambi);
      if (!eur) { eur = a.p; senzaCambi = true; }
      titoli.push(Object.assign({}, x, {
        a, idx, eur, m3Eur: E.varia(eur, N - 1, 63),
        // per la ricerca: ticker, nome, indici, paese, settore e parole comuni per il settore
        chiave: " " + norm(`${x.t} ${x.t.replace(/\..*$/, "")} ${x.t.replace(/\..*$/, "").replace(/-/g, " ")} ${x.nome} ${(x.indici || []).join(" ")} ${x.paese} ${x.settore} ${SINONIMI[x.settore] || ""}`),
      }));
    }

    // la stessa società quotata in due indici (Shell ad Amsterdam e a Londra, Airbus a Parigi e a Francoforte…)
    // conta una volta sola nei totali di tutta l'Europa e dei settori
    const visti = new Set();
    const uniche = titoli.filter(t => { const k = norm(t.nome); if (visti.has(k)) return false; visti.add(k); return true; });

    await pausa();
    // indici: ampiezza delle loro azioni e forza relativa sullo STOXX Europe 600, in euro
    const qStoxx = confronto ? confronto.a.p : null;
    for (const i of indici) {
      i.membri = titoli.filter(t => t.indici.includes(i.nome));
      const g = i.membri.map(t => t.a);
      i.b200 = E.ampiezza(g, "m200"); i.b50 = E.ampiezza(g, "m50");
      i.oggi200 = E.conta(g, "m200", N - 1); i.oggi50 = E.conta(g, "m50", N - 1);
      const inEuro = E.inEuro(i.a.p, i.valuta, date, cambi);
      if (!inEuro && i.valuta !== "EUR") senzaCambi = true;
      i.eur = E.riempi(inEuro || i.a.p);
      i.m3Eur = E.varia(i.eur, N - 1, 63);
      i.ytdEur = E.daInizioAnno(i.eur, date, N - 1);
      const fr = E.forzaRelativa(i.eur, qStoxx, barre, N - 1);
      i.rs = fr.rs; i.rs3 = fr.rs3;
    }

    await pausa();
    // tutta l'Europa: ampiezza di tutte le azioni e paniere a pesi uguali in euro
    const gt = uniche.map(t => t.a);
    const europa = {
      b200: E.ampiezza(gt, "m200"), b50: E.ampiezza(gt, "m50"),
      oggi200: E.conta(gt, "m200", N - 1), oggi50: E.conta(gt, "m50", N - 1),
      paniere: E.riempi(E.paniere(uniche.map(t => t.eur))),
    };

    await pausa();
    // settori: paniere a pesi uguali in euro contro quello di tutte le azioni
    const nomi = Array.from(new Set(titoli.map(t => t.settore).filter(Boolean))).sort((u, v) => u.localeCompare(v, "it"));
    const settori = nomi.map(nome => {
      const membri = uniche.filter(t => t.settore === nome);
      const g = membri.map(t => t.a);
      const a = E.analizza(E.paniere(membri.map(t => t.eur)), date, europa.paniere, barre);
      return a && {
        nome, membri, a,
        b200: E.ampiezza(g, "m200"), b50: E.ampiezza(g, "m50"),
        oggi200: E.conta(g, "m200", N - 1), oggi50: E.conta(g, "m50", N - 1),
        migliori: membri.filter(t => t.m3Eur != null).sort((u, v) => v.m3Eur - u.m3Eur).slice(0, 3),
      };
    }).filter(Boolean);

    return { d, N, date, barre, indici, confronto, titoli, uniche, europa, settori, senzaCambi, cache: new Map() };
  }

  const titolo = t => (st.x && t ? st.x.titoli.find(z => z.t === t) || null : null);

  // carica e prepara i dati una volta sola (li usano le pagine, la Home e la Rotazione); null se non ci sono
  async function carica() {
    let d = null, lista = null;
    try { [d, lista] = await Promise.all([R.dati.europa(), R.dati.europaLista().catch(() => null)]); } catch (e) { return null; }
    if (!d || !d.titoli || !d.titoli.length || !d.date || !d.date.length) return null;
    if (!preparato || preparato.d !== d) {
      preparato = {
        d,
        promessa: (async () => {
          // i cambi sono nel file europeo; se mancano, quelli della lista personale
          let cambi = d.cambi && Object.keys(d.cambi).length ? d.cambi : null;
          if (!cambi || !cambi.GBP || !cambi.CHF) {
            try { cambi = Object.assign({}, (await R.dati.miei()).cambi || {}, cambi || {}); } catch (e) { /* senza cambi si usa la valuta locale */ }
          }
          return await prepara(d, lista, cambi);
        })(),
      };
    }
    st.x = await preparato.promessa;
    return st.x;
  }

  // per la Home
  async function riepilogo() {
    const x = await carica();
    if (!x) return null;
    const t = x.N - 1, t21 = Math.max(0, t - 21), e = x.europa;
    return {
      data: x.d.aggiornato, date: x.date, n: x.titoli.length, nIndici: x.indici.length,
      indice: x.confronto ? { nome: "STOXX Europe 600", a: x.confronto.a } : null,
      paniereA: E.analizza(e.paniere, x.date, null, null),
      amp: { q: frazione(e.oggi200), sopra: e.oggi200.sopra, validi: e.oggi200.validi, mese: e.b200[t21] },
      indici: x.indici.filter(i => i.m3Eur != null).map(i => ({ nome: i.nome, m3: i.m3Eur, rs: i.rs })).sort((u, v) => v.m3 - u.m3),
      settori: x.settori.map(z => ({ nome: z.nome, m3: z.a.m3, rs: z.a.rs })),
      nMax: x.uniche.filter(z => z.a.nuovoMax).length, nMin: x.uniche.filter(z => z.a.nuovoMin).length,
    };
  }

  // per la Rotazione: i settori (panieri in euro) o gli indici (in euro), con i termini di confronto
  async function serieRotazione(tipo) {
    const x = await carica();
    if (!x) throw new Error("mancano i dati europei");
    const chiave = "rot|" + tipo;
    if (x.cache.has(chiave)) return x.cache.get(chiave);
    const serie = { EUROPA: x.europa.paniere }, titoli = {};
    const info = { EUROPA: { breve: "Media europea", titolo: "la media europea", nome: `Media a pesi uguali delle ${x.uniche.length} azioni europee, in euro` } };
    if (x.confronto) { serie["^STOXX"] = x.confronto.a.p; info["^STOXX"] = { breve: "STOXX 600", titolo: "lo STOXX Europe 600", nome: "STOXX Europe 600" }; }
    if (tipo === "indici") {
      for (const i of x.indici) { serie[i.nome] = i.eur; titoli[i.nome] = { breve: BREVI_INDICI[i.nome] || i.nome, nome: `${i.nome !== (BREVI_INDICI[i.nome] || i.nome) ? i.nome + " · " : ""}${i.paese}${i.valuta !== "EUR" ? ", in euro" : ""}${i.paniere ? ", paniere delle sue azioni" : ""}` }; }
    } else {
      for (const z of x.settori) { serie[z.nome] = z.a.p; titoli[z.nome] = { breve: BREVI_SETTORI[z.nome] || z.nome, nome: `${BREVI_SETTORI[z.nome] ? z.nome + " · " : ""}${z.membri.length} azioni` }; }
    }
    const benchmark = (tipo === "indici" ? ["^STOXX", "EUROPA"] : ["EUROPA", "^STOXX"]).filter(b => serie[b]);
    const out = { date: x.date, aggiornato: x.d.aggiornato, serie, titoli, info, benchmark };
    x.cache.set(chiave, out);
    return out;
  }

  async function aggiornaMiei() {
    try { st.lista = new Set((await R.dati.listaMiei()).map(x => x.t)); } catch (e) { st.lista = new Set(); }
    try { st.portafoglio = new Set(R.portafoglio ? (await R.portafoglio.pronto()).tickers : []); } catch (e) { st.portafoglio = new Set(); }
  }

  const spark = (serie, colore) => {
    const s = serie.slice(-252);
    return R.sparkline(s.filter((_, k) => (s.length - 1 - k) % 2 === 0), { colore });
  };

  function ordina(val, col, dir) {
    return (u, v) => {
      const a = val(u, col), b = val(v, col);
      if (typeof a === "string" || typeof b === "string") return dir * String(a || "").localeCompare(String(b || ""), "it");
      if (a == null && b == null) return 0;
      if (a == null) return 1;
      if (b == null) return -1;
      return dir * (a - b);
    };
  }
  const intestazione = (ordine, k, lab, left, titoloTh) => `<th class="sortable${left ? " l" : ""}" data-col="${k}" aria-sort="${ordine.col === k ? (ordine.dir > 0 ? "ascending" : "descending") : "none"}"${titoloTh ? ` title="${esc(titoloTh)}"` : ""}>${lab}</th>`;

  // ---------------- grafico a due pannelli ----------------

  const passoScala = span => {
    const e = Math.pow(10, Math.floor(Math.log10(span / 5 || 1)));
    return [1, 2, 2.5, 5, 10].map(k => k * e).find(s => span / s <= 6) || e * 10;
  };

  /**
   * cfg = { date, i0, etichetta, formato, sopra: [{ v, colore, spessore, tratteggio, nome }],
   *         sotto: { titolo, serie: [...], min, max, linee: [...], griglia: [...], formato } }
   */
  function grafico(box, cfg) {
    const date = cfg.date, N = date.length;
    const i0 = Math.max(0, Math.min(cfg.i0 || 0, N - 2)), n = Math.max(1, N - 1 - i0);
    const W = Math.max(320, box.clientWidth || 900), stretto = W < 600;
    const so = cfg.sotto && cfg.sotto.serie.some(s => s.v && s.v.some((v, i) => i >= i0 && v != null)) ? cfg.sotto : null;
    const m = { l: 8, r: stretto ? 52 : 64, t: 10, b: 24 };
    const h1 = stretto ? 210 : 270, gap = so ? 28 : 0, h2 = so ? (stretto ? 90 : 110) : 0;
    const H = m.t + h1 + gap + h2 + m.b, pw = W - m.l - m.r;
    const X = k => m.l + ((k - i0) / n) * pw;
    let lo = Infinity, hi = -Infinity;
    for (const s of cfg.sopra) for (let i = i0; i < N; i++) { const v = s.v[i]; if (v != null && isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; } }
    box.innerHTML = "";
    if (!isFinite(lo)) { box.innerHTML = '<p class="empty-note">Storia ancora troppo breve.</p>'; return; }
    const pad = (hi - lo) * 0.06 || Math.abs(hi) * 0.02 || 1;
    lo -= pad; hi += pad;
    const Y = v => m.t + ((hi - v) / (hi - lo)) * h1;
    const root = svg("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", role: "img", "aria-label": cfg.etichetta, class: "tocco" });
    const passo = passoScala(hi - lo), dec = passo < 0.1 ? 3 : passo < 1 ? 2 : passo < 10 ? 1 : 0;
    for (let v = Math.ceil(lo / passo) * passo; v <= hi + 1e-9; v += passo) {
      root.append(svg("line", { x1: m.l, x2: m.l + pw, y1: Y(v), y2: Y(v), class: "rg-grid" }));
      root.append(svg("text", { x: m.l + pw + 6, y: Y(v) + 4, class: "rg-tick" }, num(v, dec)));
    }
    const passoDate = Math.max(1, Math.round(n / (stretto ? 3 : 6)));
    for (let k = i0 + Math.round(passoDate / 2); k < N - passoDate / 3; k += passoDate) {
      root.append(svg("text", { x: X(k), y: H - 6, "text-anchor": "middle", class: "rg-tick" }, R.dataBreve(date[k])));
    }
    const linea = (v, fn, s) => {
      let d = "";
      for (let i = i0; i < N; i++) { const y = v[i]; if (y == null || !isFinite(y)) continue; d += `${d ? "L" : "M"}${X(i).toFixed(1)},${fn(y).toFixed(1)}`; }
      if (d) root.append(svg("path", { d, fill: "none", stroke: s.colore, "stroke-width": s.spessore || 1.6, "stroke-dasharray": s.tratteggio || null, "stroke-linejoin": "round" }));
    };
    for (const s of cfg.sopra) linea(s.v, Y, s);
    if (so) {
      const y2 = m.t + h1 + gap;
      let blo = so.min, bhi = so.max;
      if (blo == null || bhi == null) {
        let a = Infinity, b = -Infinity;
        for (const s of so.serie) for (let i = i0; i < N; i++) { const v = s.v[i]; if (v != null && isFinite(v)) { a = Math.min(a, v); b = Math.max(b, v); } }
        for (const l of so.linee || []) { a = Math.min(a, l); b = Math.max(b, l); }
        const p2 = (b - a) * 0.1 || 1;
        blo = a - p2; bhi = b + p2;
      }
      const Y2 = v => y2 + ((bhi - v) / (bhi - blo)) * h2;
      for (const l of so.griglia || []) {
        root.append(svg("line", { x1: m.l, x2: m.l + pw, y1: Y2(l), y2: Y2(l), class: "rg-grid" }));
        root.append(svg("text", { x: m.l + pw + 6, y: Y2(l) + 4, class: "rg-tick" }, so.formato(l)));
      }
      for (const l of so.linee || []) {
        root.append(svg("line", { x1: m.l, x2: m.l + pw, y1: Y2(l), y2: Y2(l), class: "rg-axis" }));
        root.append(svg("text", { x: m.l + pw + 6, y: Y2(l) + 4, class: "rg-tick" }, so.formato(l)));
      }
      root.append(svg("text", { x: m.l, y: y2 - 9, class: "tit-pannello" }, stretto && so.titoloBreve ? so.titoloBreve : so.titolo));
      for (const s of so.serie) linea(s.v, Y2, s);
    }
    box.append(root);
    // cursore e scheda al passaggio del dito o del mouse
    const cur = svg("line", { x1: 0, x2: 0, y1: m.t, y2: H - m.b, class: "pf-cursor", visibility: "hidden" });
    root.append(cur);
    const tip = document.createElement("div");
    tip.className = "chart-tip";
    tip.hidden = true;
    box.append(tip);
    const righe = cfg.sopra.slice().reverse().map(s => [s, cfg.formato]).concat(so ? so.serie.slice().reverse().map(s => [s, so.formato]) : []);
    const muovi = ev => {
      const rect = root.getBoundingClientRect();
      const px = ((ev.clientX - rect.left) / rect.width) * W;
      const k = Math.max(i0, Math.min(N - 1, Math.round(i0 + ((px - m.l) / pw) * n)));
      cur.setAttribute("x1", X(k)); cur.setAttribute("x2", X(k)); cur.setAttribute("visibility", "visible");
      tip.innerHTML = `<div class="d">${dataIt(date[k])}</div>` + righe.filter(([s]) => s.v[k] != null)
        .map(([s, f]) => `<div class="r"><span><i class="sw dot" style="background:${s.colore}"></i>${esc(s.nome)}</span><span>${f(s.v[k])}</span></div>`).join("");
      tip.hidden = false;
      const x = (X(k) / W) * rect.width;
      tip.style.left = (x + 16 + tip.offsetWidth > rect.width ? Math.max(0, x - tip.offsetWidth - 16) : x + 16) + "px";
    };
    root.addEventListener("pointermove", muovi);
    root.addEventListener("pointerdown", muovi);
    root.addEventListener("pointerleave", () => { cur.setAttribute("visibility", "hidden"); tip.hidden = true; });
  }

  // ---------------- le azioni (pagine «Azioni» e «Settori e indici») ----------------

  // ogni parola cercata deve essere l'inizio di una parola del titolo («sie» trova Siemens, «banca ital» BPER Banca…)
  const trovato = (z, parole) => parole.every(w => z.chiave.includes(" " + w));

  function passa(z, filtro) {
    const a = z.a;
    switch (filtro) {
      case "sopra": return a.vs200 != null && a.vs200 >= 0;
      case "sotto": return a.vs200 != null && a.vs200 < 0;
      case "leader": case "miglioramento": case "indebolimento": case "ritardo": return !!a.rs && a.rs.quadrante === filtro;
      case "massimi": return a.nuovoMax;
      case "minimi": return a.nuovoMin;
      case "miei": return st.lista.has(z.t) || st.portafoglio.has(z.t);
      default: return true;
    }
  }

  // con una ricerca scritta si cerca fra tutte, senza i filtri
  function filtrate() {
    const parole = norm(st.cerca).split(" ").filter(Boolean);
    if (parole.length) return st.x.titoli.filter(z => trovato(z, parole));
    return st.x.titoli.filter(z => (!st.f.indice || z.indici.includes(st.f.indice)) && (!st.f.settore || z.settore === st.f.settore) && passa(z, st.f.filtro));
  }

  function disegnaFiltri() {
    const x = st.x, f = st.f;
    $("#eur-indice").innerHTML = `<option value="">Tutti gli indici</option>` +
      x.indici.map(i => `<option value="${esc(i.nome)}"${st.f.indice === i.nome ? " selected" : ""}>${esc(i.nome)}</option>`).join("");
    $("#eur-settore").innerHTML = `<option value="">Tutti i settori</option>` +
      x.settori.map(z => `<option value="${esc(z.nome)}"${st.f.settore === z.nome ? " selected" : ""}>${esc(z.nome)}</option>`).join("");
    $("#eur-mostra").innerHTML = FILTRI.map(([k, l]) => `<option value="${k}"${f.filtro === k ? " selected" : ""}>${l}</option>`).join("");
    const cerca = $("#eur-cerca");
    if (cerca.value !== st.cerca) cerca.value = st.cerca;
  }

  function disegnaTabella() {
    const x = st.x, o = st.ordine;
    const val = (z, k) => (k === "nome" ? z.nome : k === "rs" ? E.ordineForza(z.a.rs) : z.a[k]);
    const righe = filtrate().sort(ordina(val, o.col, o.dir));
    const mostrate = st.tutte ? righe : righe.slice(0, PASSO);
    const th = (k, lab, left, t) => intestazione(o, k, lab, left, t);
    const c = R.colori();
    const cerca = st.cerca.trim();
    $("#eur-azioni-titolo").textContent = cerca ? `Ricerca «${cerca}»: ${righe.length} ${righe.length === 1 ? "azione" : "azioni"} su ${x.titoli.length}`
      : righe.length === x.titoli.length ? `Le ${x.titoli.length} azioni` : `Le azioni: ${righe.length} su ${x.titoli.length}`;
    $("#eur-filtri-spenti").hidden = !cerca;
    $("#eur-tabella").innerHTML = `<thead><tr>${th("nome", "Azione", true)}<th class="l">Ultimo anno</th>${th("g1", "Ultimo")}${th("m1", "1 mese")}${th("ytd", "Da inizio anno")}` +
      `${th("vs200", "Media 200", false, "Distanza dalla media a 200 sedute; sotto, dalla media a 50")}${th("dd52", "Dal massimo", false, "Distanza dal massimo delle ultime 52 settimane")}` +
      `${th("rs", "Forza relativa", true, "Rotazione settimanale contro il proprio indice; sotto, di quanto ha fatto meglio o peggio in 3 mesi")}</tr></thead><tbody>` +
      (mostrate.length ? mostrate.map(z => {
        const a = z.a;
        const tag = (st.portafoglio.has(z.t) ? '<span class="tag ok">nel portafoglio</span> ' : "") + (st.lista.has(z.t) ? '<span class="tag">nella lista</span> ' : "") +
          (a.vecchio ? `<span class="tag bad">ferma dal ${R.dataBreve(a.data)}</span> ` : "");
        return `<tr class="clic${st.aperto === z.t ? " hl" : ""}" data-t="${esc(z.t)}" tabindex="0">
          <td class="l"><span class="tit-nome"><b>${esc(z.nome)}</b> <span class="muted">${esc(z.t)}</span></span><small class="sub-line">${tag}${esc(z.indici.join(", "))} · ${esc(z.settore)}</small></td>
          <td class="l">${spark(a.p, c.price)}</td>
          <td>${prezzo(a.ultimo, z.valuta)}<small class="sub-line"><span class="${cls100(a.g1)}">${p100(a.g1)}</span> in un giorno</small></td>
          <td><span class="${cls100(a.m1)}">${p100(a.m1)}</span><small class="sub-line">3 mesi ${p100(a.m3)}</small></td>
          <td class="${cls100(a.ytd)}">${p100(a.ytd)}</td>
          <td><span class="${cls100(a.vs200)}">${p100(a.vs200)}</span><small class="sub-line">media 50 ${p100(a.vs50)}</small></td>
          <td>${p100(a.dd52)}<small class="sub-line">${a.nuovoMax ? '<span class="tag ok">nuovo massimo</span>' : a.nuovoMin ? '<span class="tag bad">nuovo minimo</span>' : "&nbsp;"}</small></td>
          <td class="l">${quad(a.rs)}<small class="sub-line">3 mesi ${p100(a.rs3)} ${z.idx ? prep("sul", esc(z.idx.nome)) : ""}</small></td>
        </tr>`;
      }).join("") : `<tr><td colspan="8" class="l"><p class="empty-note">${cerca
        ? `Nessuna delle ${x.titoli.length} azioni della zona corrisponde a «${esc(cerca)}». Qui ci sono le azioni degli indici principali: se il titolo è di un'altra borsa, trova il ticker su <a class="linkish" href="https://finance.yahoo.com/lookup?s=${encodeURIComponent(cerca)}" target="_blank" rel="noopener">Yahoo Finance ↗</a> e aggiungilo a <code>miei-titoli.txt</code>.`
        : "Nessuna azione con questi filtri."}</p></td></tr>`) + "</tbody>";
    $("#eur-altre").innerHTML = righe.length > PASSO
      ? `<button type="button" class="btn-link" id="eur-piu">${st.tutte ? "Mostra meno" : `Mostra tutte le ${righe.length}`}</button>` : "";
  }

  // ---------------- scheda di un'azione ----------------

  function disegnaDettaglio() {
    const box = $("#eur-dettaglio");
    const z = titolo(st.aperto);
    if (!z) { box.hidden = true; box.innerHTML = ""; return; }
    box.hidden = false;
    const a = z.a, nomeIndice = z.idx ? z.idx.nome : null;
    const cella = (l, v, classe, titoloCella, extra) => `<div class="tit-num${extra ? " " + extra : ""}"${titoloCella ? ` title="${esc(titoloCella)}"` : ""}><span>${l}</span><b class="${classe || ""}">${v}</b></div>`;
    const nellaLista = st.lista.has(z.t), nelPf = st.portafoglio.has(z.t);
    const indici = z.indici.map(esc);
    box.innerHTML = `
      <div class="card-head">
        <div>
          <div class="card-title"><h2>${esc(z.nome)} <span class="muted">${esc(z.t)}</span></h2></div>
          <p class="sub">Azione ${prep("del", elenco(indici))} · ${esc(z.settore)} · ${esc(z.paese)}. Prezzi in ${nomeValuta(z.valuta)}, chiusura del ${dataIt(a.data)}${a.vecchio ? " (poi nessuna quotazione)" : ""}.${nelPf ? ' <span class="tag ok">nel portafoglio</span>' : ""}${nellaLista ? ' <span class="tag">nella lista</span>' : ""}</p>
        </div>
        <div class="controls">
          <div class="seg" id="eur-periodo" role="group" aria-label="Periodo">${PERIODI.map(([k, l]) => `<button type="button" data-v="${k}" aria-pressed="${k === st.periodo}">${l}</button>`).join("")}</div>
          ${nellaLista ? `<a class="btn-link" href="#tit/${encodeURIComponent(z.t)}">Apri in I miei titoli</a>` : `<button type="button" class="btn-link" id="eur-segui">Segui</button>`}
          <button type="button" class="btn-link" id="eur-aggiungi">Aggiungi al portafoglio</button>
          <a class="btn-link" href="https://finance.yahoo.com/quote/${encodeURIComponent(z.t)}" target="_blank" rel="noopener">Yahoo Finance ↗</a>
          <button class="icon-btn" type="button" id="eur-chiudi" aria-label="Chiudi la scheda">×</button>
        </div>
      </div>
      <div class="tit-numeri">
        ${cella("Ultimo", prezzo(a.ultimo, z.valuta))}
        ${cella("1 settimana", p100(a.s1), cls100(a.s1))}${cella("1 mese", p100(a.m1), cls100(a.m1))}${cella("3 mesi", p100(a.m3), cls100(a.m3))}
        ${cella("6 mesi", p100(a.m6), cls100(a.m6))}${cella("Da inizio anno", p100(a.ytd), cls100(a.ytd))}${cella("1 anno", p100(a.a1), cls100(a.a1))}
        ${cella("Dal massimo", p100(a.dd52), "", a.max52 ? `Dal massimo delle ultime 52 settimane (${cifre(a.max52)})` : "")}
        ${cella("Sulla media 200", p100(a.vs200), cls100(a.vs200), a.striscia ? maiuscola(sedute(a.striscia)) : "")}
        ${cella("Sulla media 50", p100(a.vs50), cls100(a.vs50))}
        ${cella("Tendenza", pill(a.stato), "", "Prezzo e media 50 rispetto alla media 200", "largo")}
        ${nomeIndice ? cella(`Forza relativa ${prep("sul", esc(nomeIndice))}`, `${quad(a.rs)}<small class="eur-rs3 ${cls100(a.rs3)}">3 mesi ${p100(a.rs3)}</small>`, "",
          `Rotazione settimanale contro il suo indice; 3 mesi: di quanto ha fatto meglio o peggio ${prep("del", nomeIndice)}`, "largo") : ""}
      </div>
      <div class="legend tit-legenda" id="eur-legenda"></div>
      <div class="tit-grafico" id="eur-grafico"></div>`;
    graficoTitolo(z);
  }

  function graficoTitolo(z) {
    const x = st.x, a = z.a, N = x.N, c = R.colori();
    const i0 = Math.max(a.p.findIndex(v => v != null), st.periodo ? N - 1 - st.periodo : 0);
    const q = z.idx ? z.idx.a.p : null;
    const base = q && a.p[i0] && q[i0] ? a.p[i0] / q[i0] : null;
    const rs = base ? a.p.map((v, i) => (v != null && q[i] ? (v / q[i] / base) * 100 : null)) : null;
    grafico($("#eur-grafico"), {
      date: x.date, i0, etichetta: `Prezzo di ${z.nome} con le medie a 50 e 200 sedute`, formato: cifre,
      sopra: [
        { v: a.m200, colore: c.ma, spessore: 2, nome: "Media 200" },
        { v: a.m50, colore: c.b50, spessore: 1.4, tratteggio: "5 4", nome: "Media 50" },
        { v: a.p, colore: c.price, spessore: 1.6, nome: "Prezzo" },
      ],
      sotto: rs ? {
        titolo: `Forza relativa ${prep("sul", z.idx.nome)} (base 100 a inizio periodo)`, titoloBreve: `Forza relativa ${prep("sul", z.idx.nome)} (base 100)`,
        linee: [100], formato: v => num(v, 1),
        serie: [{ v: rs, colore: c.soglia, spessore: 1.6, nome: "Forza relativa" }],
      } : null,
    });
    $("#eur-legenda").innerHTML = [
      `<span><i class="sw" style="background:${c.price}"></i>Prezzo</span>`,
      `<span><i class="sw dash" style="color:${c.b50}"></i>Media 50</span>`,
      `<span><i class="sw" style="background:${c.ma}"></i>Media 200</span>`,
      rs ? `<span><i class="sw" style="background:${c.soglia}"></i>Forza relativa ${esc(prep("sul", z.idx.nome))}</span>` : "",
    ].join("");
  }

  // «Segui»: la riga da aggiungere a miei-titoli.txt
  function apriSegui(z) {
    const riga = `${z.t}  ${z.nome}`;
    const m = R.finestra(`<div class="modal-head"><h2>Segui ${esc(z.nome)}</h2><button class="icon-btn" type="button" data-chiudi aria-label="Chiudi">×</button></div>
      <p>Per averla in «I miei titoli», con il grafico, il trend e la forza relativa, aggiungi questa riga al file <code>miei-titoli.txt</code>:</p>
      <textarea readonly rows="1" id="eur-riga" aria-label="Riga da aggiungere">${esc(riga)}</textarea>
      <div class="pf-azioni">
        <a class="btn-primary pf-vai" href="${esc(R.github("miei-titoli.txt").modifica)}" target="_blank" rel="noopener">Apri miei-titoli.txt su GitHub ↗</a>
        <button type="button" class="btn-link" id="eur-copia">Copia la riga</button>
      </div>
      <p class="small">La riga si copia da sola quando apri GitHub: vai in fondo al file, incollala (Ctrl+V) e premi <b>Commit changes</b>. I prezzi arrivano con il prossimo aggiornamento automatico (o subito: Actions → Aggiorna dati → Run workflow).</p>`);
    m.querySelector("#eur-copia").addEventListener("click", e => R.copia(riga + "\n", e.currentTarget, m.querySelector("#eur-riga")));
    m.querySelector(".pf-vai").addEventListener("click", () => { R.copia(riga + "\n"); });
  }

  function aggiungiAlPortafoglio(z) {
    const voce = { t: z.t, nome: z.nome, prezzo: z.a.ultimo, valuta: z.valuta, data: z.a.data };
    if (R.portafoglio && R.portafoglio.aggiungi) R.portafoglio.aggiungi(voce);
  }

  // ---------------- vista ----------------

  function salva() {
    R.store.set("eur.indice", st.f.indice); R.store.set("eur.settore", st.f.settore); R.store.set("eur.filtro", st.f.filtro);
  }

  function sottotitolo() {
    const x = st.x, data = dataIt(x.d.aggiornato);
    let indietro = "";
    try {
      const r = Cal.ritardo(x.d.aggiornato, new Date(), "milano");
      if (r.sedute > 0) indietro = ` Attenzione: i prezzi sono indietro di ${R.sedute(r.sedute)} (attesa la chiusura del ${dataIt(r.attesa)}); li recupera il prossimo aggiornamento automatico.`;
    } catch (e) { /* niente */ }
    return `Tutte le ${x.titoli.length} azioni dei ${x.indici.length} indici, cercabili per nome, ticker, paese o settore, con filtri e ordinamento. Chiusure fino al ${data}.` + indietro;
  }

  function disegnaPagina() {
    $("#eur-sub").textContent = sottotitolo();
    disegnaDettaglio(); disegnaFiltri(); disegnaTabella();
  }

  async function disegna() {
    const x = await carica();
    if (!st.visibile) return;
    $("#eur-vuoto").hidden = !!x;
    $("#eur-corpo").hidden = !x;
    if (!x) { $("#eur-sub").textContent = "I dati non ci sono ancora."; return; }
    await aggiornaMiei();
    if (!st.visibile) return;
    // scelte che non esistono più
    if (st.f.indice && !x.indici.some(i => i.nome === st.f.indice)) st.f.indice = null;
    if (st.f.settore && !x.settori.some(z => z.nome === st.f.settore)) st.f.settore = null;
    if (st.aperto && !titolo(st.aperto)) st.aperto = null;
    disegnaPagina();
  }

  function apri(t, scorri) {
    st.aperto = st.aperto === t ? null : t;
    try { history.replaceState(null, "", st.aperto ? `#eur/azioni/${st.aperto}` : "#eur/azioni"); } catch (e) { /* niente */ }
    disegnaTabella();
    disegnaDettaglio();
    R.emit("selezione");
    if (st.aperto && scorri !== false) $("#eur-dettaglio").scrollIntoView({ block: "start", behavior: "smooth" });
  }

  function init() {
    const invio = (sel, fn) => $(sel).addEventListener("keydown", e => {
      if (e.key !== "Enter") return;
      const tr = e.target.closest("tr[tabindex]");
      if (tr) fn(tr);
    });
    // Azioni: filtri e ricerca
    $("#eur-indice").addEventListener("change", e => { st.f.indice = e.target.value || null; st.tutte = false; salva(); disegnaTabella(); });
    $("#eur-settore").addEventListener("change", e => { st.f.settore = e.target.value || null; st.tutte = false; salva(); disegnaTabella(); });
    $("#eur-mostra").addEventListener("change", e => {
      st.f.filtro = e.target.value; st.cerca = ""; $("#eur-cerca").value = "";
      st.tutte = false; salva(); disegnaTabella();
    });
    $("#eur-cerca").addEventListener("input", R.debounce(e => { st.cerca = e.target.value; st.tutte = false; disegnaTabella(); }, 120));
    $("#eur-cerca").addEventListener("keydown", e => {
      if (e.key === "Escape") { e.target.value = ""; st.cerca = ""; disegnaTabella(); }
      if (e.key === "Enter") {                                // una sola azione trovata: si apre la sua scheda
        const righe = filtrate();
        if (righe.length === 1) apri(righe[0].t);
      }
    });
    $("#eur-filtri-spenti").addEventListener("click", e => {
      if (!e.target.closest("button")) return;
      st.cerca = ""; $("#eur-cerca").value = ""; disegnaTabella();
    });
    $("#eur-tabella").addEventListener("click", e => {
      const th = e.target.closest("th[data-col]");
      if (th) {
        const col = th.dataset.col;
        st.ordine = { col, dir: st.ordine.col === col ? -st.ordine.dir : (col === "nome" || col === "rs" ? 1 : -1) };
        R.store.set("eur.ordine", st.ordine);
        disegnaTabella();
        return;
      }
      const tr = e.target.closest("tr[data-t]");
      if (tr) apri(tr.dataset.t);
    });
    invio("#eur-tabella", tr => { if (tr.dataset.t) apri(tr.dataset.t); });
    $("#eur-altre").addEventListener("click", e => {
      if (!e.target.closest("#eur-piu")) return;
      st.tutte = !st.tutte;
      disegnaTabella();
      if (!st.tutte) $("#eur-azioni").scrollIntoView({ block: "start", behavior: "smooth" });
    });
    $("#eur-dettaglio").addEventListener("click", e => {
      if (e.target.closest("#eur-chiudi")) { apri(st.aperto, false); return; }
      const z = titolo(st.aperto);
      if (!z) return;
      if (e.target.closest("#eur-segui")) { apriSegui(z); return; }
      if (e.target.closest("#eur-aggiungi")) { aggiungiAlPortafoglio(z); return; }
      const b = e.target.closest("#eur-periodo button[data-v]");
      if (b) { st.periodo = Number(b.dataset.v); R.store.set("eur.periodo", st.periodo); disegnaDettaglio(); }
    });
    R.on("tema", () => { if (st.visibile && st.x) disegnaPagina(); });
    R.on("portafoglio", async () => {
      if (!st.visibile || !st.x) return;
      await aggiornaMiei();
      disegnaTabella(); disegnaDettaglio();
    });
    window.addEventListener("resize", R.debounce(() => {
      if (st.visibile && st.x && st.aperto) disegnaDettaglio();
    }, 200));
  }

  async function mostra(param) {
    st.visibile = true;
    st.tutte = false;
    if (param) st.aperto = String(param).toUpperCase();
    document.title = "Europa · Azioni · Radar Settori";
    await disegna();
    if (param && st.aperto && titolo(st.aperto)) $("#eur-dettaglio").scrollIntoView({ block: "start" });
  }

  // dalla pagina di un settore o di un indice: le sue azioni, con il filtro già messo
  function filtra(tipo, nome) {
    st.f = { indice: tipo === "indice" ? nome : null, settore: tipo === "settore" ? nome : null, filtro: "" };
    st.cerca = "";
    st.aperto = null;
    salva();
    R.vai("#eur/azioni");
  }

  function nascondi() { st.visibile = false; }

  function tasto(e) {
    if (e.key === "Escape" && st.aperto) { apri(st.aperto, false); return true; }
    return false;
  }

  // ---------------- testo per «Copia per Claude» ----------------

  function contesto() {
    const x = st.x;
    if (!x) return "## Pagina aperta: Europa\nI dati delle azioni europee non ci sono ancora.";
    const t = x.N - 1, t21 = Math.max(0, t - 21);
    const testo = html => html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
    const rs = r => (r ? `${NOMI_Q[r.quadrante]}, direzione ${r.direzione == null ? "—" : num(r.direzione, 0) + "°"}` : "—");
    const out = ["## Pagina aperta: Europa · Azioni",
      `Le ${x.titoli.length} azioni di ${elenco(x.indici.map(i => i.nome))}, chiusure fino al ${dataIt(x.d.aggiornato)} (Yahoo Finance), prezzi nella valuta di ogni borsa (pence per Londra, franchi per Zurigo, corone per Copenaghen, Stoccolma e Oslo). ` +
      "Ampiezza = quota di azioni sopra la propria media a 200 (o 50) sedute. Forza relativa = rotazione settimanale (stessa formula della Rotazione): per le azioni contro il loro indice, per gli indici contro lo STOXX Europe 600 in euro, per i settori (panieri a pesi uguali in euro) contro il paniere di tutte le azioni."];
    const tabellaAzioni = (righe, titoloTab) => {
      const MAX = 120;
      out.push(`### ${titoloTab}: ${righe.length}${righe.length > MAX ? `, qui le prime ${MAX} nell'ordine della tabella` : ""}`,
        "azione | ticker | indice | settore | ultimo | valuta | 1 giorno | 1 mese | 3 mesi | da inizio anno | 1 anno | sulla media 200 | sulla media 50 | tendenza | dal massimo 52 sett. | forza relativa sull'indice | 3 mesi sull'indice | note",
        ...righe.slice(0, MAX).map(z => {
          const a = z.a;
          const note = [a.nuovoMax ? "nuovo massimo 52 sett." : "", a.nuovoMin ? "nuovo minimo 52 sett." : "", st.portafoglio.has(z.t) ? "nel portafoglio" : "", st.lista.has(z.t) ? "nella lista" : "", a.vecchio ? `ferma dal ${dataIt(a.data)}` : ""].filter(Boolean).join(", ");
          return [z.nome, z.t, z.indici.join(", "), z.settore, cifre(a.ultimo), z.valuta, p100(a.g1), p100(a.m1), p100(a.m3), p100(a.ytd), p100(a.a1), p100(a.vs200), p100(a.vs50),
            a.stato ? E.STATI[a.stato] : "—", p100(a.dd52), rs(a.rs), p100(a.rs3), note || "—"].join(" | ");
        }));
    };
    const o = st.ordine;
    const val = (z, k) => (k === "nome" ? z.nome : k === "rs" ? E.ordineForza(z.a.rs) : z.a[k]);
    const righe = filtrate().sort(ordina(val, o.col, o.dir));
    const filtri = st.cerca.trim() ? [`ricerca «${st.cerca.trim()}»`] : [st.f.indice, st.f.settore, (FILTRI.find(f => f[0] === st.f.filtro && f[0]) || [])[1]].filter(Boolean);
    tabellaAzioni(righe, `Azioni${filtri.length ? ` (filtro: ${filtri.join(", ")})` : ""}`);
    const z = titolo(st.aperto);
    if (z) {
      out.push(`### Azione aperta nella scheda: ${z.nome} (${z.t}). Chiusure a fine mese (prezzo, media 200)`);
      const p = z.a.p, date = x.date;
      for (let i = Math.max(0, p.length - 1 - (st.periodo || p.length)); i < p.length; i++) {
        if (p[i] != null && (i === p.length - 1 || date[i + 1].slice(0, 7) !== date[i].slice(0, 7))) out.push(`${dataIt(date[i])}: ${cifre(p[i])} (media 200 ${cifre(z.a.m200[i])})`);
      }
    }
    if ((x.d.mancanti || []).length) out.push(`Senza prezzi su Yahoo Finance: ${x.d.mancanti.join(", ")}.`);
    return out.join("\n");
  }

  R.viste.eur = { init, mostra, nascondi, tasto, contesto, riepilogo, serieRotazione, filtra };
})();
