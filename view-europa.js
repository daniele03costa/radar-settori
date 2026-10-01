/*
 * Radar Settori — zona Europa.
 * Le azioni degli indici principali delle borse europee (FTSE MIB, DAX, CAC 40, IBEX 35, AEX, SMI, FTSE 100, OMX Copenhagen 25,
 * OMX Stockholm 30, OMX Helsinki 25, OBX, BEL 20, ATX, PSI, ISEQ), in quattro pagine (la Rotazione è in view-rotazione.js):
 *   - Monitor: STOXX Europe 600, ampiezza (quante azioni sono sopra la media 200 e 50), nuovi massimi e minimi,
 *     andamento e ampiezza di tutta l'Europa, gli indici e i settori con la loro ampiezza e la forza relativa;
 *   - Bottom Map: indici o settori per distanza dal massimo e ampiezza, con la scia delle ultime settimane;
 *   - Settori e indici: andamento, numeri e azioni del gruppo scelto (un indice, un settore o tutti e due);
 *   - Azioni: tutte le azioni, cercabili per nome, con filtri e ordinamento, e la scheda di ciascuna con il grafico,
 *     da cui si aggiunge alla lista dei titoli seguiti o al portafoglio.
 * Fornisce anche il riepilogo per la Home e le serie per la Rotazione. I calcoli stanno in europa-calcoli.js (window.Europa).
 */
(function () {
  "use strict";

  const R = window.Radar, E = window.Europa, Rot = window.Rotazione, Cal = window.Calendario;
  const { $, num, pct, esc, svg, dataIt, cls } = R;

  const NOMI_Q = { leader: "Leader", indebolimento: "In indebolimento", ritardo: "In ritardo", miglioramento: "In miglioramento" };
  const COLORE_STATO = { rialzo: "var(--q-leader)", recupero: "var(--q-miglioramento)", debolezza: "var(--q-indebolimento)", ribasso: "var(--q-ritardo)" };
  const SIMBOLI = { EUR: "€", GBp: "p", CHF: "CHF", DKK: "kr", SEK: "kr", NOK: "kr" };
  const PERIODI = [[126, "6 mesi"], [252, "1 anno"], [504, "2 anni"]];
  const PERIODI_QUADRO = [[252, "1 anno"], [504, "2 anni"]];
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
  const PAGINE = { monitor: "Le borse europee", settori: "Settori e indici", azioni: "Le azioni europee", mappa: "Quanto sono lontani dal massimo, e con quante azioni" };

  const st = {
    visibile: false,
    pagina: "monitor",
    x: null,                                                // dati preparati
    // pagina «Settori e indici»: il gruppo scelto e quali azioni mostrare
    sel: { indice: R.store.get("eur.sel.indice", null), settore: R.store.get("eur.sel.settore", null), filtro: R.store.get("eur.sel.filtro", "") },
    // pagina «Azioni»: filtri e ricerca
    f: { indice: R.store.get("eur.indice", null), settore: R.store.get("eur.settore", null), filtro: R.store.get("eur.filtro", "") },
    cerca: "",
    ordine: R.store.get("eur.ordine", { col: "rs", dir: 1 }),
    ordineSettori: R.store.get("eur.ordineSettori", { col: "rs", dir: 1 }),
    periodo: PERIODI.some(([k]) => k === R.store.get("eur.periodo", 252)) ? R.store.get("eur.periodo", 252) : 252,
    periodoQuadro: PERIODI_QUADRO.some(([k]) => k === R.store.get("eur.periodoQuadro", 252)) ? R.store.get("eur.periodoQuadro", 252) : 252,
    mappa: { tipo: R.store.get("eur.mappa.tipo", "indici"), coda: R.store.get("eur.mappa.coda", 6) },
    tutte: false,
    aperto: null,
    lista: new Set(), portafoglio: new Set(),
  };
  let preparato = null;                                     // { d, promessa } dei dati preparati
  let mappa = null;                                         // la Bottom Map disegnata (per evidenziare dalla tabella)

  // ---------------- formati ----------------

  const p100 = (v, d = 1) => (v == null || !isFinite(v) ? "—" : pct(v * 100, d));
  const cls100 = v => (v == null ? "" : cls(v * 100));
  const quota = v => (v == null || !isFinite(v) ? "—" : `${num(v * 100, 0)}%`);
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

  // ---------------- quadro in alto ----------------

  function disegnaKpi() {
    const x = st.x, t = x.N - 1, t21 = Math.max(0, t - 21);
    const tile = (k, l, v, s, titoloTile, extra) => `<div class="kpi"${k ? ` style="--k:${k}"` : ""}${titoloTile ? ` title="${esc(titoloTile)}"` : ""}><div class="l">${k ? "<i></i>" : ""}${l}</div><div class="v">${v}</div><div class="s">${s}</div>${extra || ""}</div>`;
    const s = x.confronto && x.confronto.a, e = x.europa;
    const q200 = frazione(e.oggi200), q50 = frazione(e.oggi50);
    const nMax = x.uniche.filter(z => z.a.nuovoMax).length, nMin = x.uniche.filter(z => z.a.nuovoMin).length;
    const ind = x.indici.filter(i => i.m3Eur != null).sort((u, v) => v.m3Eur - u.m3Eur);
    const set = x.settori.filter(z => z.a.m3 != null).sort((u, v) => v.a.m3 - u.a.m3);
    const barra = v => (v == null ? "" : `<div class="meter"><i style="width:${Math.max(0, Math.min(100, v * 100))}%"></i></div>`);
    $("#eur-kpi").innerHTML = [
      s ? tile("var(--price)", "STOXX Europe 600", cifre(s.ultimo), `1 mese ${p100(s.m1)} · da inizio anno ${p100(s.ytd)}`) : "",
      s ? tile(COLORE_STATO[s.stato] || "var(--faint)", "Sulla media 200", p100(s.vs200), `${sedute(s.striscia)}${s.stato ? " · " + E.STATI[s.stato].toLowerCase() : ""}`,
        "Distanza dello STOXX Europe 600 dalla sua media a 200 sedute") : "",
      tile("var(--b200)", "Ampiezza", quota(q200),
        `azioni sopra la media 200: ${e.oggi200.sopra} su ${e.oggi200.validi} · un mese fa ${quota(e.b200[t21])} · sopra la media 50 ${quota(q50)}`, "Quota delle azioni della pagina sopra la propria media a 200 sedute", barra(q200)),
      tile("var(--q-leader)", "Massimi / minimi", `${nMax}<small> / </small>${nMin}`, "azioni a un nuovo massimo / minimo di 52 settimane nell'ultima settimana"),
      ind.length ? tile("var(--soglia)", "Indice più forte", esc(ind[0].nome),
        `${p100(ind[0].m3Eur)} in 3 mesi, in euro · ultimo ${esc(ind[ind.length - 1].nome)} ${p100(ind[ind.length - 1].m3Eur)}`) : "",
      set.length ? tile("var(--q-indebolimento)", "Settore più forte", esc(set[0].nome),
        `${p100(set[0].a.m3)} in 3 mesi · ultimo ${esc(set[set.length - 1].nome)} ${p100(set[set.length - 1].a.m3)}`) : "",
    ].join("");
  }

  function frasi() {
    const x = st.x, t = x.N - 1, t21 = Math.max(0, t - 21), t63 = Math.max(0, t - 63);
    const out = [];
    const s = x.confronto && x.confronto.a;
    if (s) {
      out.push({
        c: COLORE_STATO[s.stato] || "var(--price)",
        html: `Lo <b>STOXX Europe 600</b> è ${s.striscia ? `${s.striscia.sopra ? "sopra" : "sotto"} la media 200 da ${s.striscia.almeno ? "almeno " : ""}${R.sedute(s.striscia.sedute)}` : "vicino alla media 200"} (${p100(s.vs200)}), con la media 50 ${s.m50[t] >= s.m200[t] ? "sopra" : "sotto"} la media 200: ${pill(s.stato)}. ` +
          `Un mese ${p100(s.m1)}, tre mesi ${p100(s.m3)}, da inizio anno ${p100(s.ytd)}; ${s.dd52 != null && s.dd52 > -0.005 ? "è sul massimo delle ultime 52 settimane" : `è a ${p100(s.dd52)} dal massimo delle ultime 52 settimane`}.`,
      });
    }
    const e = x.europa, q200 = frazione(e.oggi200), q50 = frazione(e.oggi50);
    if (q200 != null) {
      const d21 = e.b200[t21] != null ? q200 - e.b200[t21] : null;
      let nota = "";
      if (s && s.dd52 != null && s.dd52 > -0.03 && q200 < 0.5) nota = " L'indice è vicino ai massimi ma meno di metà delle azioni è sopra la media 200: il rialzo si regge su pochi titoli.";
      else if (s && s.vs200 != null && s.vs200 < 0 && d21 != null && d21 >= 0.1) nota = ` L'indice è sotto la media 200 ma in un mese l'ampiezza è salita di ${num(d21 * 100, 0)} punti: sempre più azioni tornano sopra la media.`;
      else if (s && s.vs200 != null && s.vs200 > 0 && d21 != null && d21 <= -0.1) nota = ` L'indice è sopra la media 200 ma in un mese l'ampiezza è scesa di ${num(-d21 * 100, 0)} punti: sempre meno azioni partecipano al rialzo.`;
      out.push({
        c: "var(--b200)",
        html: `<b>${maiuscola(R.art("il", quota(q200)))} delle azioni</b> (${e.oggi200.sopra} su ${e.oggi200.validi}) è sopra la media 200: un mese fa ${R.art("il", quota(e.b200[t21]))}, tre mesi fa ${R.art("il", quota(e.b200[t63]))}. Sopra la media 50: ${quota(q50)}.` + nota,
      });
    }
    const ind = x.indici.filter(i => i.m3Eur != null).sort((u, v) => v.m3Eur - u.m3Eur);
    if (ind.length >= 4) {
      const amp = x.indici.filter(i => frazione(i.oggi200) != null).sort((u, v) => frazione(v.oggi200) - frazione(u.oggi200));
      out.push({
        c: "var(--soglia)",
        html: `Indici a tre mesi, in euro: i più forti sono ${ind.slice(0, 2).map(i => `<b>${esc(i.nome)}</b> (${p100(i.m3Eur)})`).join(" e ")}, i più deboli ${ind.slice(-2).reverse().map(i => `${esc(i.nome)} (${p100(i.m3Eur)})`).join(" e ")}.` +
          (amp.length >= 2 ? ` L'ampiezza è più alta ${prep("nel", esc(amp[0].nome))} (${quota(frazione(amp[0].oggi200))} delle azioni sopra la media 200) e più bassa ${prep("nel", esc(amp[amp.length - 1].nome))} (${quota(frazione(amp[amp.length - 1].oggi200))}).` : ""),
      });
    }
    const perQ = { leader: [], miglioramento: [], indebolimento: [], ritardo: [] };
    for (const z of x.settori) if (z.a.rs) perQ[z.a.rs.quadrante].push(esc(z.nome));
    const pezzi = [["leader", "leader"], ["miglioramento", "in miglioramento"], ["indebolimento", "in indebolimento"], ["ritardo", "in ritardo"]]
      .filter(([k]) => perQ[k].length).map(([k, l]) => `${l} <b>${elenco(perQ[k])}</b>`);
    if (pezzi.length) out.push({ c: "var(--q-leader)", html: `Settori contro la media delle azioni europee, nella rotazione settimanale: ${pezzi.join("; ")}.` });
    const massimi = x.uniche.filter(z => z.a.nuovoMax).sort((u, v) => (v.m3Eur || 0) - (u.m3Eur || 0));
    const minimi = x.uniche.filter(z => z.a.nuovoMin).sort((u, v) => (u.m3Eur || 0) - (v.m3Eur || 0));
    const esempi = arr => arr.slice(0, 4).map(z => `<button type="button" class="linkish" data-t="${esc(z.t)}">${esc(z.nome)}</button>`).join(", ") + (arr.length > 4 ? "…" : "");
    out.push({
      c: "var(--q-miglioramento)",
      html: `Nell'ultima settimana <b>${massimi.length}</b> ${massimi.length === 1 ? "azione ha" : "azioni hanno"} segnato un nuovo massimo a 52 settimane${massimi.length ? ` (${esempi(massimi)})` : ""} e <b>${minimi.length}</b> un nuovo minimo${minimi.length ? ` (${esempi(minimi)})` : ""}.`,
    });
    const miei = x.titoli.filter(z => st.lista.has(z.t) || st.portafoglio.has(z.t));
    if (miei.length) {
      const sopra = miei.filter(z => z.a.vs200 != null && z.a.vs200 >= 0).length;
      const lead = miei.filter(z => z.a.rs && z.a.rs.quadrante === "leader");
      const rit = miei.filter(z => z.a.rs && z.a.rs.quadrante === "ritardo");
      const nomi = arr => arr.map(z => `<button type="button" class="linkish" data-t="${esc(z.t)}">${esc(z.nome)}</button>`).join(", ");
      out.push({
        c: "var(--price)",
        html: `Dei tuoi titoli europei (${miei.length}, fra lista e portafoglio) ${sopra} ${sopra === 1 ? "è" : "sono"} sopra la media 200.` +
          (lead.length ? ` Leader sul loro indice: ${nomi(lead)}.` : "") + (rit.length ? ` In ritardo: ${nomi(rit)}.` : ""),
      });
    }
    return out;
  }

  function disegnaSintesi() {
    $("#eur-sintesi").innerHTML = `
      <div class="card-title"><h2>Cosa dicono i numeri</h2><span class="muted small-inline">chiusura del ${dataIt(st.x.d.aggiornato)}</span></div>
      <ul class="novita-lista">${frasi().map(f => `<li><i style="--c:${f.c}"></i><span>${f.html}</span></li>`).join("")}</ul>
      <p class="novita-piede">Aiutano a capire in che fase è il mercato europeo e dove c'è forza; non dicono cosa succederà e non sono consigli di investimento.</p>`;
  }

  // ---------------- indici e settori ----------------

  const barraAmp = q => `<span class="eur-amp"><span class="b"><i style="width:${q == null ? 0 : Math.max(0, Math.min(100, q * 100))}%"></i></span><b>${quota(q)}</b></span>`;
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

  function disegnaIndici() {
    const x = st.x, t21 = Math.max(0, x.N - 1 - 21), c = R.colori();
    const riga = (i, confronto) => {
      const a = i.a, amp = confronto ? x.europa : i, q = frazione(amp.oggi200);
      return `<tr class="clic${confronto ? " bench-row" : ""}" data-indice="${confronto ? "" : esc(i.nome)}" tabindex="0">
        <td class="l"><b>${esc(i.nome)}</b><small class="sub-line">${confronto ? "tutte le azioni della zona" : `${esc(i.paese)} · ${i.membri.length} azioni${i.paniere ? " · paniere delle sue azioni" : ""}`}</small></td>
        <td class="l">${spark(a.p, c.price)}</td>
        <td>${cifre(a.ultimo)}<small class="sub-line"><span class="${cls100(a.g1)}">${p100(a.g1)}</span> in un giorno</small></td>
        <td class="${cls100(a.m1)}">${p100(a.m1)}</td>
        <td><span class="${cls100(a.ytd)}">${p100(a.ytd)}</span>${!confronto && i.valuta !== "EUR" && i.ytdEur != null ? `<small class="sub-line">${p100(i.ytdEur)} in euro</small>` : ""}</td>
        <td><span class="${cls100(a.vs200)}">${p100(a.vs200)}</span><small class="sub-line">media 50 ${p100(a.vs50)}</small></td>
        <td class="l">${barraAmp(q)}<small class="sub-line">${amp.oggi200.sopra} su ${amp.oggi200.validi} · un mese fa ${quota(amp.b200[t21])}</small></td>
        <td class="l">${confronto ? '<span class="muted">termine di confronto</span>' : `${quad(i.rs)}<small class="sub-line">3 mesi ${p100(i.rs3)}, in euro</small>`}</td>
      </tr>`;
    };
    $("#eur-indici").innerHTML = `<thead><tr><th class="l">Indice</th><th class="l">Ultimo anno</th><th>Ultimo</th><th>1 mese</th><th>Da inizio anno</th>` +
      `<th title="Distanza dell'indice dalla sua media a 200 sedute">Media 200</th><th class="l" title="Quota delle azioni dell'indice sopra la propria media a 200 sedute">Azioni sopra la media 200</th>` +
      `<th class="l" title="Rotazione settimanale contro lo STOXX Europe 600, tutto in euro; sotto, di quanto ha fatto meglio o peggio in 3 mesi">Forza relativa sullo STOXX 600</th></tr></thead><tbody>` +
      x.indici.map(i => riga(i, false)).join("") + (x.confronto ? riga(x.confronto, true) : "") + "</tbody>";
  }

  function disegnaSettori() {
    const x = st.x, t21 = Math.max(0, x.N - 1 - 21), c = R.colori(), o = st.ordineSettori;
    const val = (z, k) => (k === "nome" ? z.nome : k === "rs" ? E.ordineForza(z.a.rs) : k === "amp" ? frazione(z.oggi200) : z.a[k]);
    const righe = x.settori.slice().sort(ordina(val, o.col, o.dir));
    const th = (k, lab, left, t) => intestazione(o, k, lab, left, t);
    $("#eur-settori").innerHTML = `<thead><tr>${th("nome", "Settore", true)}<th class="l">Ultimo anno</th>${th("m1", "1 mese")}${th("m3", "3 mesi")}${th("ytd", "Da inizio anno")}` +
      `${th("amp", "Azioni sopra la media 200", true, "Quota delle azioni del settore sopra la propria media a 200 sedute")}` +
      `${th("rs", "Forza relativa", true, "Rotazione settimanale del paniere del settore contro la media di tutte le azioni della pagina; sotto, di quanto ha fatto meglio o peggio in 3 mesi")}` +
      `<th class="l">I più forti a 3 mesi</th></tr></thead><tbody>` +
      righe.map(z => `<tr class="clic" data-settore="${esc(z.nome)}" tabindex="0">
        <td class="l"><b>${esc(z.nome)}</b><small class="sub-line">${z.membri.length} azioni</small></td>
        <td class="l">${spark(z.a.p, c.price)}</td>
        <td class="${cls100(z.a.m1)}">${p100(z.a.m1)}</td>
        <td class="${cls100(z.a.m3)}">${p100(z.a.m3)}</td>
        <td class="${cls100(z.a.ytd)}">${p100(z.a.ytd)}</td>
        <td class="l">${barraAmp(frazione(z.oggi200))}<small class="sub-line">${z.oggi200.sopra} su ${z.oggi200.validi} · un mese fa ${quota(z.b200[t21])}</small></td>
        <td class="l">${quad(z.a.rs)}<small class="sub-line">3 mesi ${p100(z.a.rs3)} sulla media</small></td>
        <td class="l eur-migliori">${z.migliori.map(m => `<button type="button" class="linkish" data-t="${esc(m.t)}" title="${esc(m.nome)} (${esc(m.t)}): ${p100(m.m3Eur)} in 3 mesi, in euro">${esc(breve(m.nome))}</button>`).join(", ")}</td>
      </tr>`).join("") + "</tbody>";
    $("#eur-settori-nota").innerHTML = `Ogni settore è un paniere a pesi uguali delle sue azioni, in euro${x.senzaCambi ? " (senza i cambi, che non sono ancora arrivati: per Londra e Zurigo si usa la valuta locale)" : ""}; la forza relativa è contro il paniere di tutte le ${x.uniche.length} società (quelle quotate in due indici, come Shell o Airbus, contano una volta). Settori secondo la classificazione di Yahoo Finance. Clic su un settore per il suo andamento e le sue azioni.`;
  }

  // ---------------- andamento e ampiezza di un gruppo (tutta l'Europa, un indice, un settore) ----------------

  // le azioni del gruppo: dentro un indice ogni società c'è una volta sola, in tutta l'Europa si tolgono i doppi
  function membriDi(sel) {
    let membri = sel.indice ? st.x.titoli : st.x.uniche;
    if (sel.indice) membri = membri.filter(z => z.indici.includes(sel.indice));
    if (sel.settore) membri = membri.filter(z => z.settore === sel.settore);
    return membri;
  }

  const prepSettore = s => (/^[AEIOU]/i.test(s) ? "dell'" : "del ") + s;
  function nomeGruppo(sel) {
    if (sel.indice && sel.settore) return `${sel.settore} ${prep("del", sel.indice)}`;
    return sel.indice || sel.settore || "Tutta l'Europa";
  }

  function datiQuadro(sel) {
    const x = st.x, chiave = `quadro|${sel.indice}|${sel.settore}`;
    if (x.cache.has(chiave)) return x.cache.get(chiave);
    const membri = membriDi(sel), g = membri.map(z => z.a), N = x.N;
    let q = null;
    if (!sel.settore) {
      const i = sel.indice ? x.indici.find(z => z.nome === sel.indice) : x.confronto;
      if (i) q = { tipo: "indice", nome: i.nome, a: i.a, b200: sel.indice ? i.b200 : x.europa.b200, b50: sel.indice ? i.b50 : x.europa.b50,
        oggi200: sel.indice ? i.oggi200 : x.europa.oggi200, rs: sel.indice ? i.rs : null, rs3: sel.indice ? i.rs3 : null,
        confronto: sel.indice ? "STOXX Europe 600, in euro" : null, valuta: sel.indice ? i.valuta : "EUR", m3Eur: sel.indice ? i.m3Eur : null };
    }
    if (!q && sel.settore && !sel.indice) {
      const z = x.settori.find(v => v.nome === sel.settore);
      if (z) q = { tipo: "paniere", nome: z.nome, a: z.a, b200: z.b200, b50: z.b50, oggi200: z.oggi200, rs: z.a.rs, rs3: z.a.rs3, confronto: "media delle azioni europee", valuta: "EUR" };
    }
    if (!q) {
      q = { tipo: "paniere", nome: nomeGruppo(sel), a: E.analizza(E.paniere(membri.map(z => z.eur)), x.date, null, null),
        b200: E.ampiezza(g, "m200"), b50: E.ampiezza(g, "m50"), oggi200: E.conta(g, "m200", N - 1), rs: null, rs3: null, valuta: "EUR" };
    }
    q.n = membri.length;
    q.nMax = membri.filter(z => z.a.nuovoMax).length;
    q.nMin = membri.filter(z => z.a.nuovoMin).length;
    q.migliori = membri.filter(z => z.m3Eur != null).sort((u, v) => v.m3Eur - u.m3Eur).slice(0, 3);
    q.peggiori = membri.filter(z => z.m3Eur != null).sort((u, v) => u.m3Eur - v.m3Eur).slice(0, 3);
    x.cache.set(chiave, q);
    return q;
  }

  // Monitor: sempre tutta l'Europa; Settori e indici: il gruppo scelto, con i suoi numeri
  function disegnaQuadro() {
    const x = st.x, box = $("#eur-quadro");
    const sel = st.pagina === "settori" ? st.sel : { indice: null, settore: null };
    const q = datiQuadro(sel), scelto = !!(sel.indice || sel.settore);
    const conNumeri = st.pagina === "settori";
    const cella = (l, v, classe, t, extra) => `<div class="tit-num${extra ? " " + extra : ""}"${t ? ` title="${esc(t)}"` : ""}><span>${l}</span><b class="${classe || ""}">${v}</b></div>`;
    const a = q.a || {}, t21 = Math.max(0, x.N - 1 - 21);
    const linkAz = z => `<button type="button" class="linkish" data-t="${esc(z.t)}" title="${esc(z.nome)} (${esc(z.t)}): ${p100(z.m3Eur)} in 3 mesi, in euro">${esc(breve(z.nome, 20))}</button> ${p100(z.m3Eur)}`;
    const numeri = conNumeri && q.a ? `<div class="tit-numeri eur-selnum">
        ${q.tipo === "indice" ? cella("Ultimo", cifre(a.ultimo)) : cella("Paniere", cifre(a.ultimo), "", "Paniere a pesi uguali in euro, base 100 al primo giorno")}
        ${cella("1 giorno", p100(a.g1), cls100(a.g1))}${cella("1 mese", p100(a.m1), cls100(a.m1))}${cella("3 mesi", p100(a.m3), cls100(a.m3), q.m3Eur != null && q.valuta !== "EUR" ? `In euro: ${p100(q.m3Eur)}` : "")}
        ${cella("Da inizio anno", p100(a.ytd), cls100(a.ytd))}${cella("Dal massimo", p100(a.dd52), "", "Distanza dal massimo delle ultime 52 settimane")}
        ${cella("Sulla media 200", p100(a.vs200), cls100(a.vs200), a.striscia ? maiuscola(sedute(a.striscia)) : "")}
        ${cella("Tendenza", pill(a.stato), "", "Prezzo e media 50 rispetto alla media 200", "largo")}
        ${cella("Ampiezza", `${quota(frazione(q.oggi200))} <small class="muted">${q.oggi200.sopra}/${q.oggi200.validi}</small>`, "", `Azioni sopra la media 200; un mese fa ${quota(q.b200[t21])}`)}
        ${cella("Massimi / minimi", `${q.nMax} / ${q.nMin}`, "", "Azioni a un nuovo massimo / minimo di 52 settimane nell'ultima settimana")}
        ${q.rs ? cella(q.tipo === "indice" ? "Forza relativa sullo STOXX 600" : "Forza relativa sulla media europea", `${quad(q.rs)}<small class="eur-rs3 ${cls100(q.rs3)}">3 mesi ${p100(q.rs3)}</small>`, "", `Rotazione settimanale contro ${q.confronto}; 3 mesi: di quanto ha fatto meglio o peggio`, "largo") : ""}
      </div>
      ${q.migliori.length > 1 ? `<p class="small eur-migl">Le più forti a 3 mesi, in euro: ${q.migliori.map(linkAz).join(" · ")}. Le più deboli: ${q.peggiori.map(linkAz).join(" · ")}.</p>` : ""}` : "";
    box.innerHTML = `
      <div class="card-head">
        <div>
          <div class="card-title"><h2>${conNumeri ? esc(q.nome) : `Andamento e ampiezza: ${esc(q.nome)}`}</h2></div>
          <p class="sub">${q.tipo === "indice" ? "L'indice con le sue medie a 50 e 200 sedute" : !q.n ? "Nessuna azione in questo gruppo" : `Paniere a pesi uguali ${q.n === 1 ? "dell'unica azione" : `delle ${q.n} azioni`}, in euro, con le sue medie`}; sotto, la quota di ${scelto ? "queste azioni" : "tutte le azioni europee"} sopra la propria media 200 e 50.</p>
        </div>
        <div class="controls">
          <div class="seg" id="eur-periodo-quadro" role="group" aria-label="Periodo">${PERIODI_QUADRO.map(([k, l]) => `<button type="button" data-v="${k}" aria-pressed="${k === st.periodoQuadro}">${l}</button>`).join("")}</div>
        </div>
      </div>
      ${numeri}
      <div class="legend" id="eur-quadro-legenda"></div>
      <div class="cry-grafico" id="eur-quadro-grafico"></div>`;
    if (!q.a) { $("#eur-quadro-grafico").innerHTML = '<p class="empty-note">Nessuna azione in questo gruppo.</p>'; return; }
    const c = R.colori(), N = x.N;
    const i0 = Math.max(q.a.p.findIndex(v => v != null), st.periodoQuadro ? N - 1 - st.periodoQuadro : 0);
    grafico($("#eur-quadro-grafico"), {
      date: x.date, i0, etichetta: `Andamento e ampiezza: ${q.nome}`, formato: cifre,
      sopra: [
        { v: q.a.m200, colore: c.ma, spessore: 2, nome: "Media 200" },
        { v: q.a.m50, colore: c.b50, spessore: 1.4, tratteggio: "5 4", nome: "Media 50" },
        { v: q.a.p, colore: c.price, spessore: 1.6, nome: q.tipo === "indice" ? q.nome : "Paniere" },
      ],
      sotto: {
        titolo: "Azioni sopra la media 200 e 50", min: 0, max: 1, griglia: [0, 1], linee: [0.5], formato: quota,
        serie: [
          { v: q.b50, colore: c.b50, spessore: 1.3, tratteggio: "4 3", nome: "Sopra la media 50" },
          { v: q.b200, colore: c.b200, spessore: 1.8, nome: "Sopra la media 200" },
        ],
      },
    });
    const t = N - 1;
    $("#eur-quadro-legenda").innerHTML = [
      `<span><i class="sw" style="background:${c.price}"></i>${esc(q.tipo === "indice" ? q.nome : "Paniere")} <b>${p100(q.a.vs200)}</b> sulla media 200</span>`,
      `<span><i class="sw dash" style="color:${c.b50}"></i>Media 50</span>`,
      `<span><i class="sw" style="background:${c.ma}"></i>Media 200</span>`,
      q.b200[t] != null ? `<span><i class="sw" style="background:${c.b200}"></i>Azioni sopra la media 200 <b>${quota(q.b200[t])}</b></span>` : "",
      q.b50[t] != null ? `<span><i class="sw dash" style="color:${c.b50}"></i>sopra la media 50 <b>${quota(q.b50[t])}</b></span>` : "",
    ].join("");
  }

  // pagina «Settori e indici»: la scelta del gruppo
  function disegnaScelta() {
    const x = st.x, sel = st.sel;
    const chip = (k, nome, attivo, colore, extra) => `<button type="button" class="chip-btn" data-${k}="${esc(nome)}" aria-pressed="${attivo}" style="--c:${colore}"${extra || ""}>${esc(nome)}</button>`;
    const coloreA = a => (a && a.stato ? COLORE_STATO[a.stato] : "var(--faint)");
    $("#eur-scelta").innerHTML = `
      <div class="eur-scelta-riga"><span class="eur-scelta-l">Indici</span><div class="chips">
        <button type="button" class="chip-btn" data-tutta="1" aria-pressed="${!sel.indice && !sel.settore}" style="--c:var(--price)">Tutta l'Europa</button>
        ${x.indici.map(i => chip("indice", i.nome, sel.indice === i.nome, coloreA(i.a), ` title="${esc(i.paese)}: ${p100(i.a.m1)} in un mese, ${E.STATI[i.a.stato] || ""}"`)).join("")}
      </div></div>
      <div class="eur-scelta-riga"><span class="eur-scelta-l">Settori</span><div class="chips">
        ${x.settori.map(z => chip("settore", z.nome, sel.settore === z.nome, coloreA(z.a), ` title="${z.membri.length} azioni: ${p100(z.a.m1)} in un mese, ${E.STATI[z.a.stato] || ""}"`)).join("")}
      </div></div>
      <p class="small">Il colore del pallino è la tendenza (${E.ORDINE_STATI.map(k => `<i class="sw dot" style="background:${COLORE_STATO[k]}"></i> ${E.STATI[k].toLowerCase()}`).join(", ")}). Si possono scegliere insieme un indice e un settore, per esempio i finanziari del DAX.</p>`;
    R.$$('#eur-scelta .chips [aria-pressed="true"]').forEach(b => {
      const riga = b.parentElement;
      if (riga.scrollWidth > riga.clientWidth) riga.scrollLeft = Math.max(0, b.offsetLeft - riga.offsetLeft - 24);
    });
  }

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

  // Azioni: con una ricerca scritta si cerca fra tutte, senza i filtri; Settori e indici: le azioni del gruppo scelto
  function filtrate() {
    if (st.pagina === "settori") return membriDi(st.sel).filter(z => passa(z, st.sel.filtro));
    const parole = norm(st.cerca).split(" ").filter(Boolean);
    if (parole.length) return st.x.titoli.filter(z => trovato(z, parole));
    return st.x.titoli.filter(z => (!st.f.indice || z.indici.includes(st.f.indice)) && (!st.f.settore || z.settore === st.f.settore) && passa(z, st.f.filtro));
  }

  function disegnaFiltri() {
    const x = st.x, f = st.pagina === "settori" ? st.sel : st.f;
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
    const cerca = st.pagina === "azioni" ? st.cerca.trim() : "";
    if (st.pagina === "settori") {
      const tutte = membriDi(st.sel).length, nome = nomeGruppo(st.sel);
      $("#eur-azioni-titolo").textContent = st.sel.filtro
        ? `${nome}: ${righe.length} ${righe.length === 1 ? "azione" : "azioni"} su ${tutte}`
        : `${nome}: ${!tutte ? "nessuna azione" : tutte === 1 ? "l'unica azione" : `le ${tutte} azioni`}`;
    } else {
      $("#eur-azioni-titolo").textContent = cerca ? `Ricerca «${cerca}»: ${righe.length} ${righe.length === 1 ? "azione" : "azioni"} su ${x.titoli.length}`
        : righe.length === x.titoli.length ? `Le ${x.titoli.length} azioni` : `Le azioni: ${righe.length} su ${x.titoli.length}`;
    }
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

  // ---------------- Bottom Map ----------------

  // distanza dal massimo delle 52 settimane precedenti, a una seduta
  function dalMassimo(p, i) {
    let max = -Infinity;
    for (let k = Math.max(0, i - 251); k <= i; k++) if (p[k] != null && p[k] > max) max = p[k];
    return p[i] != null && isFinite(max) && max > 0 ? p[i] / max - 1 : null;
  }

  function vociMappa() {
    const x = st.x;
    const idx = x.barre.indici.slice(-(st.mappa.coda + 1));
    const gruppi = st.mappa.tipo === "settori"
      ? x.settori.map(z => ({ k: z.nome, nome: z.nome, breve: BREVI_SETTORI[z.nome] || z.nome, a: z.a, b200: z.b200, oggi200: z.oggi200, sub: `${z.membri.length} azioni` }))
      : x.indici.map(i => ({ k: i.nome, nome: i.nome, breve: BREVI_INDICI[i.nome] || i.nome, a: i.a, b200: i.b200, oggi200: i.oggi200, sub: i.paese }));
    for (const v of gruppi) {
      v.punti = idx.map(i => ({ i, data: x.date[i], x: dalMassimo(v.a.p, i), y: v.b200[i] })).filter(q => q.x != null && q.y != null);
    }
    return gruppi.filter(v => v.punti.length);
  }

  function disegnaMappa() {
    const voci = vociMappa();
    R.$$("#eur-mappa-tipo button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.v === st.mappa.tipo)));
    $("#eur-mappa-coda").value = st.mappa.coda;
    $("#eur-mappa-coda-val").textContent = st.mappa.coda;
    let lo = 0;
    for (const v of voci) for (const q of v.punti) lo = Math.min(lo, q.x);
    const xmin = Math.min(-0.15, Math.floor((lo - 0.02) / 0.05) * 0.05);
    const pctT = v => (v === 0 ? "0%" : `${v > 0 ? "+" : "−"}${num(Math.abs(v) * 100, 0)}%`);
    const perVoce = new Map(voci.map(v => [v.k, v]));
    const settimane = k => `${k} ${k === 1 ? "settimana" : "settimane"}`;
    mappa = R.mappa($("#eur-mappa-grafico"), {
      etichetta: `${st.mappa.tipo === "settori" ? "Settori" : "Indici"} europei: distanza dal massimo di 52 settimane e quota di azioni sopra la media 200`,
      x: { min: xmin, max: 0, tacche: R.tacche(xmin, 0, 7), formato: pctT, titolo: "Distanza dal massimo delle ultime 52 settimane", sinistra: "← più lontano dal massimo", destra: "sul massimo →" },
      y: { min: 0, max: 1, tacche: [0, 0.2, 0.4, 0.6, 0.8, 1], formato: v => `${num(v * 100, 0)}%`, titolo: "Azioni sopra la media 200" },
      bande: [
        { y0: 0, y1: 0.2, classe: "bm-att", testo: "Meno del 20% delle azioni sopra la media", testoBreve: "Sotto il 20%", basso: true },
        ...(xmin < -0.2 ? [{ x0: xmin, x1: -0.2, classe: "bm-att" }, { x0: xmin, x1: -0.2, y0: 0, y1: 0.2, classe: "bm-blu" }] : []),
      ],
      linee: [{ x: -0.1, testo: "−10%" }, ...(xmin < -0.2 ? [{ x: -0.2, testo: "−20%" }] : []), { y: 0.5 }],
      voci: voci.map(v => ({ k: v.k, etichetta: v.breve, colore: v.a.stato ? COLORE_STATO[v.a.stato] : "var(--faint)", punti: v.punti })),
      tip: k => {
        const v = perVoce.get(k), h = v.punti[v.punti.length - 1], p0 = v.punti[0];
        return `<div class="d">${esc(v.nome)} <span class="muted">· ${esc(v.sub)}</span></div>
          <div class="r"><span>Tendenza</span><span>${pill(v.a.stato)}</span></div>
          <div class="r"><span>Dal massimo</span><span>${p100(h.x)}</span></div>
          <div class="r"><span>Sopra la media 200</span><span>${quota(h.y)}${v.oggi200 ? ` · ${v.oggi200.sopra}/${v.oggi200.validi}` : ""}</span></div>
          <div class="r"><span>Sulla media 200</span><span>${p100(v.a.vs200)}</span></div>
          ${v.punti.length > 1 ? `<div class="r"><span>In ${settimane(v.punti.length - 1)}</span><span>${R.segnato((h.y - p0.y) * 100, 0)} punti di ampiezza</span></div>` : ""}`;
      },
      apri: k => R.vai("#eur/settori/" + encodeURIComponent(k)),
    });
    $("#eur-mappa-legenda").innerHTML = E.ORDINE_STATI.map(k => `<span><i class="sw dot" style="background:${COLORE_STATO[k]}"></i>${E.STATI[k]}</span>`).join("") +
      `<span class="lungo"><i class="sw box bm-sw-att"></i>Meno del 20% delle azioni sopra la media${xmin < -0.2 ? ", oltre il 20% sotto il massimo" : ""}</span>`;
    // tabella: prima chi ha meno azioni sopra la media
    const righe = voci.map(v => ({ v, h: v.punti[v.punti.length - 1], p0: v.punti[0] })).sort((u, w) => u.h.y - w.h.y);
    $("#eur-mappa-tabella").innerHTML = `<thead><tr><th class="l">${st.mappa.tipo === "settori" ? "Settore" : "Indice"}</th><th title="Distanza dal massimo delle ultime 52 settimane">Dal massimo</th><th title="Quota delle azioni sopra la propria media 200; sotto, la variazione lungo la scia">Ampiezza</th></tr></thead><tbody>` +
      righe.map(({ v, h, p0 }) => `<tr class="clic" data-k="${esc(v.k)}" tabindex="0">
        <td class="l"><span class="tk-cell"><span class="qdot" style="--c:${v.a.stato ? COLORE_STATO[v.a.stato] : "var(--faint)"}" title="${v.a.stato ? esc(E.STATI[v.a.stato]) : ""}"></span><span class="tk-txt"><span class="tk-line" title="${esc(v.nome)}"><b>${esc(v.breve)}</b></span><small class="sub-line">${esc(v.sub)}</small></span></span></td>
        <td>${p100(h.x)}<small class="sub-line">${v.punti.length > 1 ? `${R.segnato((h.x - p0.x) * 100, 1)} punti` : "&nbsp;"}</small></td>
        <td><b>${quota(h.y)}</b><small class="sub-line ${cls((h.y - p0.y) * 100)}">${v.punti.length > 1 ? `${R.segnato((h.y - p0.y) * 100, 0)} punti` : "&nbsp;"}</small></td>
      </tr>`).join("") + "</tbody>";
  }

  // ---------------- vista ----------------

  function salva() {
    R.store.set("eur.sel.indice", st.sel.indice); R.store.set("eur.sel.settore", st.sel.settore); R.store.set("eur.sel.filtro", st.sel.filtro);
    R.store.set("eur.indice", st.f.indice); R.store.set("eur.settore", st.f.settore); R.store.set("eur.filtro", st.f.filtro);
  }

  function sottotitolo() {
    const x = st.x, data = dataIt(x.d.aggiornato);
    let indietro = "";
    try {
      const r = Cal.ritardo(x.d.aggiornato, new Date(), "milano");
      if (r.sedute > 0) indietro = ` Attenzione: i prezzi sono indietro di ${R.sedute(r.sedute)} (attesa la chiusura del ${dataIt(r.attesa)}); li recupera il prossimo aggiornamento automatico.`;
    } catch (e) { /* niente */ }
    return ({
      monitor: `Chiusure fino al ${data}: le ${x.titoli.length} azioni dei ${x.indici.length} indici principali delle borse europee, con prezzi nella valuta di ogni borsa.`,
      settori: `Scegli un indice o un settore: andamento con le medie, quante delle sue azioni sono sopra la media 200, forza relativa e l'elenco delle azioni. Chiusure fino al ${data}.`,
      azioni: `Tutte le ${x.titoli.length} azioni, cercabili per nome, ticker, paese o settore, con filtri e ordinamento. Chiusure fino al ${data}.`,
      mappa: `Orizzontale: distanza dal massimo delle ultime 52 settimane (più a sinistra, più lontano). Verticale: quota delle azioni sopra la propria media 200. La scia unisce le ultime settimane. Chiusure fino al ${data}.`,
    })[st.pagina] + indietro;
  }

  function disegnaPagina() {
    $("#eur-h1").textContent = PAGINE[st.pagina] || PAGINE.monitor;
    $("#eur-sub").textContent = sottotitolo();
    switch (st.pagina) {
      case "settori": disegnaScelta(); disegnaQuadro(); disegnaDettaglio(); disegnaFiltri(); disegnaTabella(); break;
      case "azioni": disegnaDettaglio(); disegnaFiltri(); disegnaTabella(); break;
      case "mappa": disegnaMappa(); break;
      default: disegnaKpi(); disegnaSintesi(); disegnaQuadro(); disegnaIndici(); disegnaSettori();
    }
  }

  async function disegna(param) {
    const x = await carica();
    if (!st.visibile) return;
    $("#eur-vuoto").hidden = !!x;
    $("#eur-corpo").hidden = !x;
    if (!x) { $("#eur-sub").textContent = "I dati non ci sono ancora."; return; }
    await aggiornaMiei();
    if (!st.visibile) return;
    // il gruppo scritto nell'indirizzo (#eur/settori/DAX, #eur/settori/DAX/Finanziari)
    if (st.pagina === "settori" && param) {
      const parti = String(param).split("/").map(t => t.trim().toLowerCase());
      const indice = x.indici.find(i => parti.includes(i.nome.toLowerCase()));
      const settore = x.settori.find(z => parti.includes(z.nome.toLowerCase()));
      st.sel.indice = indice ? indice.nome : null;
      st.sel.settore = settore ? settore.nome : null;
      salva();
    }
    // scelte che non esistono più
    for (const f of [st.sel, st.f]) {
      if (f.indice && !x.indici.some(i => i.nome === f.indice)) f.indice = null;
      if (f.settore && !x.settori.some(z => z.nome === f.settore)) f.settore = null;
    }
    if (st.aperto && !titolo(st.aperto)) st.aperto = null;
    disegnaPagina();
  }

  function apri(t, scorri) {
    st.aperto = st.aperto === t ? null : t;
    if (st.pagina === "azioni") { try { history.replaceState(null, "", st.aperto ? `#eur/azioni/${st.aperto}` : "#eur/azioni"); } catch (e) { /* niente */ } }
    disegnaTabella();
    disegnaDettaglio();
    R.emit("selezione");
    if (st.aperto && scorri !== false) $("#eur-dettaglio").scrollIntoView({ block: "start", behavior: "smooth" });
  }

  // pagina «Settori e indici»: un indice, un settore o tutti e due
  function scegli(o) {
    Object.assign(st.sel, o);
    st.tutte = false;
    salva();
    const parti = [st.sel.indice, st.sel.settore].filter(Boolean).map(encodeURIComponent);
    try { history.replaceState(null, "", "#eur/settori" + (parti.length ? "/" + parti.join("/") : "")); } catch (e) { /* niente */ }
    disegnaScelta();
    disegnaQuadro();
    disegnaFiltri();
    disegnaTabella();
  }

  function init() {
    const invio = (sel, fn) => $(sel).addEventListener("keydown", e => {
      if (e.key !== "Enter") return;
      const tr = e.target.closest("tr[tabindex]");
      if (tr) fn(tr);
    });
    const vaiGruppo = nome => {
      if (!nome) { st.sel.indice = null; st.sel.settore = null; salva(); R.vai("#eur/settori"); return; }
      R.vai("#eur/settori/" + encodeURIComponent(nome));
    };
    const vaiAzione = t => R.vai("#eur/azioni/" + t);
    // Monitor
    $("#eur-indici").addEventListener("click", e => { const tr = e.target.closest("tr[data-indice]"); if (tr) vaiGruppo(tr.dataset.indice); });
    invio("#eur-indici", tr => vaiGruppo(tr.dataset.indice));
    $("#eur-settori").addEventListener("click", e => {
      const b = e.target.closest("[data-t]");
      if (b) { vaiAzione(b.dataset.t); return; }
      const th = e.target.closest("th[data-col]");
      if (th) {
        const col = th.dataset.col;
        st.ordineSettori = { col, dir: st.ordineSettori.col === col ? -st.ordineSettori.dir : (col === "nome" || col === "rs" ? 1 : -1) };
        R.store.set("eur.ordineSettori", st.ordineSettori);
        disegnaSettori();
        return;
      }
      const tr = e.target.closest("tr[data-settore]");
      if (tr) vaiGruppo(tr.dataset.settore);
    });
    invio("#eur-settori", tr => vaiGruppo(tr.dataset.settore));
    $("#eur-sintesi").addEventListener("click", e => { const b = e.target.closest("[data-t]"); if (b) vaiAzione(b.dataset.t); });
    // andamento e numeri del gruppo
    $("#eur-quadro").addEventListener("click", e => {
      const t = e.target.closest("[data-t]");
      if (t) { if (st.pagina === "settori") apri(t.dataset.t); else vaiAzione(t.dataset.t); return; }
      const b = e.target.closest("#eur-periodo-quadro button[data-v]");
      if (b) { st.periodoQuadro = Number(b.dataset.v); R.store.set("eur.periodoQuadro", st.periodoQuadro); disegnaQuadro(); }
    });
    // Settori e indici: la scelta
    $("#eur-scelta").addEventListener("click", e => {
      const b = e.target.closest("button");
      if (!b) return;
      if (b.dataset.tutta) scegli({ indice: null, settore: null });
      else if (b.dataset.indice != null) scegli({ indice: st.sel.indice === b.dataset.indice ? null : b.dataset.indice });
      else if (b.dataset.settore != null) scegli({ settore: st.sel.settore === b.dataset.settore ? null : b.dataset.settore });
    });
    // Azioni: filtri e ricerca
    $("#eur-indice").addEventListener("change", e => { st.f.indice = e.target.value || null; st.tutte = false; salva(); disegnaTabella(); });
    $("#eur-settore").addEventListener("change", e => { st.f.settore = e.target.value || null; st.tutte = false; salva(); disegnaTabella(); });
    $("#eur-mostra").addEventListener("change", e => {
      if (st.pagina === "settori") st.sel.filtro = e.target.value;
      else { st.f.filtro = e.target.value; st.cerca = ""; $("#eur-cerca").value = ""; }
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
    // Bottom Map
    $("#eur-mappa-tipo").addEventListener("click", e => {
      const b = e.target.closest("button[data-v]");
      if (!b) return;
      st.mappa.tipo = b.dataset.v;
      R.store.set("eur.mappa.tipo", st.mappa.tipo);
      if (st.x) disegnaMappa();
    });
    $("#eur-mappa-coda").addEventListener("input", e => {
      st.mappa.coda = Number(e.target.value);
      R.store.set("eur.mappa.coda", st.mappa.coda);
      if (st.x) disegnaMappa();
    });
    $("#eur-mappa-tabella").addEventListener("mouseover", e => { const tr = e.target.closest("tr[data-k]"); if (mappa) mappa.evidenzia(tr ? tr.dataset.k : null, !!tr); });
    $("#eur-mappa-tabella").addEventListener("mouseleave", () => { if (mappa) mappa.evidenzia(null, false); });
    $("#eur-mappa-tabella").addEventListener("click", e => { const tr = e.target.closest("tr[data-k]"); if (tr) R.vai("#eur/settori/" + encodeURIComponent(tr.dataset.k)); });
    invio("#eur-mappa-tabella", tr => R.vai("#eur/settori/" + encodeURIComponent(tr.dataset.k)));

    R.on("tema", () => { if (st.visibile && st.x) disegnaPagina(); });
    R.on("portafoglio", async () => {
      if (!st.visibile || !st.x) return;
      await aggiornaMiei();
      if (st.pagina === "monitor") disegnaSintesi();
      if (st.pagina === "settori" || st.pagina === "azioni") { disegnaTabella(); disegnaDettaglio(); }
    });
    window.addEventListener("resize", R.debounce(() => {
      if (!st.visibile || !st.x) return;
      if (st.pagina === "monitor" || st.pagina === "settori") disegnaQuadro();
      if (st.pagina === "mappa") disegnaMappa();
      if (st.aperto && st.pagina !== "monitor" && st.pagina !== "mappa") disegnaDettaglio();
    }, 200));
  }

  const NOMI_PAGINE = { monitor: "Monitor", settori: "Settori e indici", azioni: "Azioni", mappa: "Bottom Map" };

  async function mostra(param, ctx) {
    st.visibile = true;
    const pagina = ctx && NOMI_PAGINE[ctx.pagina] ? ctx.pagina : "monitor";
    if (pagina !== st.pagina) { st.tutte = false; if (!(param && pagina === "azioni")) st.aperto = null; }
    st.pagina = pagina;
    $("#view-eur").dataset.pagina = pagina;
    document.title = `Europa · ${NOMI_PAGINE[pagina]} · Radar Settori`;
    if (param && pagina === "azioni") st.aperto = String(param).toUpperCase();
    await disegna(param);
    if (param && pagina === "azioni" && st.aperto && titolo(st.aperto)) $("#eur-dettaglio").scrollIntoView({ block: "start" });
  }

  function nascondi() { st.visibile = false; }

  function tasto(e) {
    if (e.key === "Escape" && st.aperto && (st.pagina === "azioni" || st.pagina === "settori")) { apri(st.aperto, false); return true; }
    return false;
  }

  // ---------------- testo per «Copia per Claude» ----------------

  function contesto() {
    const x = st.x;
    if (!x) return "## Pagina aperta: Europa\nI dati delle azioni europee non ci sono ancora.";
    const t = x.N - 1, t21 = Math.max(0, t - 21);
    const testo = html => html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
    const rs = r => (r ? `${NOMI_Q[r.quadrante]}, direzione ${r.direzione == null ? "—" : num(r.direzione, 0) + "°"}` : "—");
    const out = [`## Pagina aperta: Europa · ${NOMI_PAGINE[st.pagina]}`,
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
    if (st.pagina === "monitor") {
      out.push("### Cosa dicono i numeri", ...frasi().map(f => "- " + testo(f.html)),
        "### Indici",
        "indice | ultimo | 1 giorno | 1 mese | 3 mesi in euro | da inizio anno | sulla media 200 | sulla media 50 | tendenza | azioni sopra la media 200 (un mese fa) | sopra la media 50 | forza relativa sullo STOXX 600 | 3 mesi sullo STOXX 600",
        ...x.indici.map(i => [i.nome, cifre(i.a.ultimo), p100(i.a.g1), p100(i.a.m1), p100(i.m3Eur), p100(i.a.ytd), p100(i.a.vs200), p100(i.a.vs50), i.a.stato ? E.STATI[i.a.stato] : "—",
          `${quota(frazione(i.oggi200))} (${quota(i.b200[t21])})`, quota(frazione(i.oggi50)), rs(i.rs), p100(i.rs3)].join(" | ")));
      if (x.confronto) {
        const a = x.confronto.a;
        out.push(`STOXX Europe 600 | ${cifre(a.ultimo)} | ${p100(a.g1)} | ${p100(a.m1)} | ${p100(a.m3)} | ${p100(a.ytd)} | ${p100(a.vs200)} | ${p100(a.vs50)} | ${a.stato ? E.STATI[a.stato] : "—"} | tutte le azioni ${quota(frazione(x.europa.oggi200))} (${quota(x.europa.b200[t21])}) | ${quota(frazione(x.europa.oggi50))} | termine di confronto | —`);
      }
      out.push("### Settori (panieri a pesi uguali in euro)",
        "settore | azioni | 1 mese | 3 mesi | da inizio anno | sulla media 200 | azioni sopra la media 200 (un mese fa) | forza relativa sulla media | 3 mesi sulla media | i più forti a 3 mesi",
        ...x.settori.map(z => [z.nome, z.membri.length, p100(z.a.m1), p100(z.a.m3), p100(z.a.ytd), p100(z.a.vs200), `${quota(frazione(z.oggi200))} (${quota(z.b200[t21])})`,
          rs(z.a.rs), p100(z.a.rs3), z.migliori.map(m => `${m.nome} ${p100(m.m3Eur)}`).join(", ")].join(" | ")));
    } else if (st.pagina === "settori") {
      const q = datiQuadro(st.sel), a = q.a || {};
      out.push(`### Gruppo scelto: ${q.nome} (${q.n} azioni)`,
        `${q.tipo === "indice" ? "Indice" : "Paniere a pesi uguali in euro"}: ultimo ${cifre(a.ultimo)}, 1 giorno ${p100(a.g1)}, 1 mese ${p100(a.m1)}, 3 mesi ${p100(a.m3)}, da inizio anno ${p100(a.ytd)}, dal massimo a 52 settimane ${p100(a.dd52)}, sulla media 200 ${p100(a.vs200)} (${a.striscia ? sedute(a.striscia) : "—"}), ${a.stato ? E.STATI[a.stato].toLowerCase() : "tendenza non disponibile"}.`,
        `Azioni sopra la media 200: ${quota(frazione(q.oggi200))} (${q.oggi200.sopra} su ${q.oggi200.validi}; un mese fa ${quota(q.b200[t21])}). Nuovi massimi a 52 settimane nell'ultima settimana: ${q.nMax}, nuovi minimi: ${q.nMin}.` +
          (q.rs ? ` Forza relativa contro ${q.confronto}: ${rs(q.rs)}, 3 mesi ${p100(q.rs3)}.` : ""));
      const righe = filtrate().sort(ordina(val, o.col, o.dir));
      tabellaAzioni(righe, `Azioni del gruppo${st.sel.filtro ? ` (${(FILTRI.find(f => f[0] === st.sel.filtro) || [])[1]})` : ""}`);
    } else if (st.pagina === "azioni") {
      const righe = filtrate().sort(ordina(val, o.col, o.dir));
      const filtri = st.cerca.trim() ? [`ricerca «${st.cerca.trim()}»`] : [st.f.indice, st.f.settore, (FILTRI.find(f => f[0] === st.f.filtro && f[0]) || [])[1]].filter(Boolean);
      tabellaAzioni(righe, `Azioni${filtri.length ? ` (filtro: ${filtri.join(", ")})` : ""}`);
    } else if (st.pagina === "mappa") {
      out.push(`### Bottom Map: ${st.mappa.tipo === "settori" ? "settori" : "indici"}, scia di ${st.mappa.coda} settimane`,
        "Asse orizzontale: distanza dal massimo delle ultime 52 settimane. Asse verticale: quota delle azioni sopra la propria media 200. Evidenziate le aree sotto il 20% di azioni sopra la media e oltre il 20% sotto il massimo.",
        "gruppo | tendenza | dal massimo | azioni sopra la media 200 | scia settimanale (data: dal massimo; ampiezza)");
      for (const v of vociMappa()) {
        const h = v.punti[v.punti.length - 1];
        out.push(`${v.nome} | ${v.a.stato ? E.STATI[v.a.stato] : "—"} | ${p100(h.x)} | ${quota(h.y)} | ` + v.punti.map(q => `${dataIt(q.data)}: ${p100(q.x)}; ${quota(q.y)}`).join(" → "));
      }
    }
    const z = (st.pagina === "azioni" || st.pagina === "settori") ? titolo(st.aperto) : null;
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

  R.viste.eur = { init, mostra, nascondi, tasto, contesto, riepilogo, serieRotazione };
})();
