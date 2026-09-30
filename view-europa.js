/*
 * Radar Settori — vista 8: Europa.
 * Le azioni dei sette indici principali (FTSE MIB, DAX, CAC 40, IBEX 35, AEX, SMI, FTSE 100):
 *   - il quadro generale: STOXX Europe 600, ampiezza (quante azioni sono sopra la media 200 e 50), nuovi massimi e minimi;
 *   - gli indici e i settori, con la loro ampiezza e la forza relativa;
 *   - l'andamento e l'ampiezza del gruppo scelto (tutta l'Europa, un indice, un settore);
 *   - tutte le azioni, cercabili per nome, con filtri e ordinamento, e la scheda di ciascuna con il grafico,
 *     da cui si aggiunge alla lista dei titoli seguiti o al portafoglio.
 * I calcoli stanno in europa-calcoli.js (window.Europa).
 */
(function () {
  "use strict";

  const R = window.Radar, E = window.Europa, Rot = window.Rotazione, Cal = window.Calendario;
  const { $, num, pct, esc, svg, dataIt, cls } = R;

  const NOMI_Q = { leader: "Leader", indebolimento: "In indebolimento", ritardo: "In ritardo", miglioramento: "In miglioramento" };
  const COLORE_STATO = { rialzo: "var(--q-leader)", recupero: "var(--q-miglioramento)", debolezza: "var(--q-indebolimento)", ribasso: "var(--q-ritardo)" };
  const SIMBOLI = { EUR: "€", GBp: "p", CHF: "CHF" };
  const PERIODI = [[126, "6 mesi"], [252, "1 anno"], [504, "2 anni"]];
  const PERIODI_QUADRO = [[252, "1 anno"], [504, "2 anni"]];
  const PASSO = 60;                                          // righe mostrate prima di «mostra tutte»
  const FILTRI = [
    ["", "Tutte le azioni"], ["sopra", "Sopra la media 200"], ["sotto", "Sotto la media 200"],
    ["leader", "Leader sul loro indice"], ["miglioramento", "In miglioramento"], ["indebolimento", "In indebolimento"], ["ritardo", "In ritardo"],
    ["massimi", "Nuovi massimi a 52 settimane"], ["minimi", "Nuovi minimi a 52 settimane"], ["miei", "Nella mia lista o nel portafoglio"],
  ];
  const norm = x => String(x || "").toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Z0-9&]+/g, " ").trim();

  const st = {
    visibile: false,
    x: null,                                                // dati preparati
    indice: R.store.get("eur.indice", null),
    settore: R.store.get("eur.settore", null),
    filtro: R.store.get("eur.filtro", ""),
    cerca: "",
    ordine: R.store.get("eur.ordine", { col: "rs", dir: 1 }),
    ordineSettori: R.store.get("eur.ordineSettori", { col: "rs", dir: 1 }),
    periodo: PERIODI.some(([k]) => k === R.store.get("eur.periodo", 252)) ? R.store.get("eur.periodo", 252) : 252,
    periodoQuadro: PERIODI_QUADRO.some(([k]) => k === R.store.get("eur.periodoQuadro", 252)) ? R.store.get("eur.periodoQuadro", 252) : 252,
    tutte: false,
    aperto: null,
    lista: new Set(), portafoglio: new Set(),
  };

  // ---------------- formati ----------------

  const p100 = (v, d = 1) => (v == null || !isFinite(v) ? "—" : pct(v * 100, d));
  const cls100 = v => (v == null ? "" : cls(v * 100));
  const quota = v => (v == null || !isFinite(v) ? "—" : `${num(v * 100, 0)}%`);
  const frazione = o => (o && o.validi ? o.sopra / o.validi : null);
  const cifre = v => (v == null || !isFinite(v) ? "—" : v >= 1000 ? num(v, 0) : v >= 100 ? num(v, 1) : num(v, 2));
  const prezzo = (v, valuta) => `${cifre(v)}<span class="valuta">${SIMBOLI[valuta] || valuta || ""}</span>`;
  const nomeValuta = v => (v === "GBp" ? "pence di sterlina" : v === "CHF" ? "franchi svizzeri" : "euro");
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

  function prepara(d, lista, cambi) {
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

    // azioni: ogni azione contro il suo indice, in valuta locale; la serie in euro serve ai panieri
    let senzaCambi = false;
    const titoli = [];
    for (const x of d.titoli) {
      const idx = perNome.get((x.indici || [])[0]) || null;
      const a = E.analizza(E.piena(N, x.i0, x.prezzi), date, idx ? idx.a.p : null, barre);
      if (!a) continue;
      let eur = E.inEuro(a.p, x.valuta, date, cambi);
      if (!eur) { eur = a.p; senzaCambi = true; }
      titoli.push(Object.assign({}, x, {
        a, idx, eur, m3Eur: E.varia(eur, N - 1, 63),
        chiave: norm(`${x.t} ${x.t.replace(/\..*$/, "")} ${x.nome}`),
      }));
    }

    // la stessa società quotata in due indici (Shell ad Amsterdam e a Londra, Airbus a Parigi e a Francoforte…)
    // conta una volta sola nei totali di tutta l'Europa e dei settori
    const visti = new Set();
    const uniche = titoli.filter(t => { const k = norm(t.nome); if (visti.has(k)) return false; visti.add(k); return true; });

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

    // tutta l'Europa: ampiezza di tutte le azioni e paniere a pesi uguali in euro
    const gt = uniche.map(t => t.a);
    const europa = {
      b200: E.ampiezza(gt, "m200"), b50: E.ampiezza(gt, "m50"),
      oggi200: E.conta(gt, "m200", N - 1), oggi50: E.conta(gt, "m50", N - 1),
      paniere: E.riempi(E.paniere(uniche.map(t => t.eur))),
    };

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
      const scelto = confronto ? !st.indice : st.indice === i.nome;
      return `<tr class="clic${scelto ? " hl" : ""}${confronto ? " bench-row" : ""}" data-indice="${confronto ? "" : esc(i.nome)}" tabindex="0">
        <td class="l"><b>${esc(i.nome)}</b><small class="sub-line">${confronto ? "tutte le azioni della pagina" : `${esc(i.paese)} · ${i.membri.length} azioni`}</small></td>
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
      righe.map(z => `<tr class="clic${st.settore === z.nome ? " hl" : ""}" data-settore="${esc(z.nome)}" tabindex="0">
        <td class="l"><b>${esc(z.nome)}</b><small class="sub-line">${z.membri.length} azioni</small></td>
        <td class="l">${spark(z.a.p, c.price)}</td>
        <td class="${cls100(z.a.m1)}">${p100(z.a.m1)}</td>
        <td class="${cls100(z.a.m3)}">${p100(z.a.m3)}</td>
        <td class="${cls100(z.a.ytd)}">${p100(z.a.ytd)}</td>
        <td class="l">${barraAmp(frazione(z.oggi200))}<small class="sub-line">${z.oggi200.sopra} su ${z.oggi200.validi} · un mese fa ${quota(z.b200[t21])}</small></td>
        <td class="l">${quad(z.a.rs)}<small class="sub-line">3 mesi ${p100(z.a.rs3)} sulla media</small></td>
        <td class="l eur-migliori">${z.migliori.map(m => `<button type="button" class="linkish" data-t="${esc(m.t)}" title="${esc(m.nome)} (${esc(m.t)}): ${p100(m.m3Eur)} in 3 mesi, in euro">${esc(breve(m.nome))}</button>`).join(", ")}</td>
      </tr>`).join("") + "</tbody>";
    $("#eur-settori-nota").innerHTML = `Ogni settore è un paniere a pesi uguali delle sue azioni, in euro${x.senzaCambi ? " (senza i cambi, che non sono ancora arrivati: per Londra e Zurigo si usa la valuta locale)" : ""}; la forza relativa è contro il paniere di tutte le ${x.uniche.length} società (quelle quotate in due indici, come Shell o Airbus, contano una volta). Settori secondo la classificazione di Yahoo Finance. Clic su un settore per vedere solo le sue azioni.`;
  }

  // ---------------- andamento e ampiezza del gruppo scelto ----------------

  function gruppoScelto() {
    let membri = st.indice ? st.x.titoli : st.x.uniche;          // dentro un indice ogni società c'è una volta sola
    if (st.indice) membri = membri.filter(z => z.indici.includes(st.indice));
    if (st.settore) membri = membri.filter(z => z.settore === st.settore);
    return membri;
  }

  function datiQuadro() {
    const x = st.x, chiave = `quadro|${st.indice}|${st.settore}`;
    if (x.cache.has(chiave)) return x.cache.get(chiave);
    const membri = gruppoScelto();
    let q = null;
    if (!st.settore) {
      const i = st.indice ? x.indici.find(z => z.nome === st.indice) : x.confronto;
      if (i) q = { nome: i.nome, tipo: "indice", a: i.a, b200: st.indice ? i.b200 : x.europa.b200, b50: st.indice ? i.b50 : x.europa.b50, n: membri.length };
    }
    if (!q) {
      const g = membri.map(z => z.a);
      q = {
        nome: st.settore ? st.settore + (st.indice ? ` · ${st.indice}` : "") : "Tutte le azioni",
        tipo: "paniere", a: E.analizza(E.paniere(membri.map(z => z.eur)), x.date, null, null),
        b200: E.ampiezza(g, "m200"), b50: E.ampiezza(g, "m50"), n: membri.length,
      };
    }
    x.cache.set(chiave, q);
    return q;
  }

  function disegnaQuadro() {
    const x = st.x, q = datiQuadro(), box = $("#eur-quadro");
    const scelto = !!(st.indice || st.settore);
    box.innerHTML = `
      <div class="card-head">
        <div>
          <div class="card-title"><h2>Andamento e ampiezza: ${esc(q.nome)}</h2></div>
          <p class="sub">${q.tipo === "indice" ? "L'indice con le sue medie a 50 e 200 sedute" : `Paniere a pesi uguali ${q.n === 1 ? "dell'unica azione" : `delle ${q.n} azioni`}, in euro, con le sue medie`}; sotto, la quota di ${scelto ? "queste azioni" : "tutte le azioni della pagina"} sopra la propria media 200 e 50.</p>
        </div>
        <div class="controls">
          <div class="seg" id="eur-periodo-quadro" role="group" aria-label="Periodo">${PERIODI_QUADRO.map(([k, l]) => `<button type="button" data-v="${k}" aria-pressed="${k === st.periodoQuadro}">${l}</button>`).join("")}</div>
          ${scelto ? `<button type="button" class="btn-link" id="eur-tutta">Tutta l'Europa ×</button>` : ""}
        </div>
      </div>
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

  // ---------------- tutte le azioni ----------------

  function filtrate() {
    const q = norm(st.cerca);
    return st.x.titoli.filter(z => {
      if (st.indice && !z.indici.includes(st.indice)) return false;
      if (st.settore && z.settore !== st.settore) return false;
      if (q && !z.chiave.includes(q)) return false;
      const a = z.a;
      switch (st.filtro) {
        case "sopra": return a.vs200 != null && a.vs200 >= 0;
        case "sotto": return a.vs200 != null && a.vs200 < 0;
        case "leader": case "miglioramento": case "indebolimento": case "ritardo": return !!a.rs && a.rs.quadrante === st.filtro;
        case "massimi": return a.nuovoMax;
        case "minimi": return a.nuovoMin;
        case "miei": return st.lista.has(z.t) || st.portafoglio.has(z.t);
        default: return true;
      }
    });
  }

  function disegnaFiltri() {
    const x = st.x;
    $("#eur-chips").innerHTML = `<button type="button" class="chip-btn" data-indice="" aria-pressed="${!st.indice}" style="--c:var(--faint)">Tutti gli indici</button>` +
      x.indici.map(i => `<button type="button" class="chip-btn" data-indice="${esc(i.nome)}" aria-pressed="${st.indice === i.nome}" style="--c:var(--soglia)">${esc(i.nome)}</button>`).join("");
    $("#eur-settore").innerHTML = `<option value="">Tutti i settori</option>` +
      x.settori.map(z => `<option value="${esc(z.nome)}"${st.settore === z.nome ? " selected" : ""}>${esc(z.nome)}</option>`).join("");
    $("#eur-mostra").innerHTML = FILTRI.map(([k, l]) => `<option value="${k}"${st.filtro === k ? " selected" : ""}>${l}</option>`).join("");
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
    $("#eur-azioni-titolo").textContent = righe.length === x.titoli.length ? `Le ${x.titoli.length} azioni` : `Le azioni: ${righe.length} su ${x.titoli.length}`;
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
      }).join("") : `<tr><td colspan="8" class="l"><p class="empty-note">Nessuna azione con questi filtri.</p></td></tr>`) + "</tbody>";
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

  function salvaFiltri() {
    R.store.set("eur.indice", st.indice);
    R.store.set("eur.settore", st.settore);
    R.store.set("eur.filtro", st.filtro);
  }

  function disegnaGruppo() {
    st.tutte = false;
    salvaFiltri();
    disegnaIndici();
    disegnaSettori();
    disegnaQuadro();
    disegnaFiltri();
    disegnaTabella();
  }

  function disegnaTutto() {
    disegnaKpi();
    disegnaSintesi();
    disegnaIndici();
    disegnaSettori();
    disegnaQuadro();
    disegnaDettaglio();
    disegnaFiltri();
    disegnaTabella();
  }

  async function disegna() {
    let d = null, lista = null;
    try { [d, lista] = await Promise.all([R.dati.europa(), R.dati.europaLista().catch(() => null)]); } catch (e) { d = null; }
    if (!st.visibile) return;
    const vuoto = !d || !d.titoli || !d.titoli.length || !d.date || !d.date.length;
    $("#eur-vuoto").hidden = !vuoto;
    $("#eur-corpo").hidden = vuoto;
    if (vuoto) { $("#eur-sub").textContent = "I dati non ci sono ancora."; return; }
    if (!st.x || st.x.d !== d) {
      // i cambi di sterlina e franco sono nel file europeo; se mancano, quelli della lista personale
      let cambi = d.cambi && Object.keys(d.cambi).length ? d.cambi : null;
      if (!cambi || !cambi.GBP || !cambi.CHF) {
        try { cambi = Object.assign({}, (await R.dati.miei()).cambi || {}, cambi || {}); } catch (e) { /* senza cambi si usa la valuta locale */ }
      }
      st.x = prepara(d, lista, cambi);
    }
    await aggiornaMiei();
    if (!st.visibile) return;
    if (st.indice && !st.x.indici.some(i => i.nome === st.indice)) st.indice = null;
    if (st.settore && !st.x.settori.some(z => z.nome === st.settore)) st.settore = null;
    if (st.aperto && !titolo(st.aperto)) st.aperto = null;
    // dati indietro rispetto all'ultima seduta chiusa (calendario di Borsa Italiana)
    let indietro = "";
    try {
      const r = Cal.ritardo(d.aggiornato, new Date(), "milano");
      if (r.sedute > 0) indietro = ` Attenzione: i prezzi sono indietro di ${R.sedute(r.sedute)} (attesa la chiusura del ${dataIt(r.attesa)}); li recupera il prossimo aggiornamento automatico.`;
    } catch (e) { /* niente */ }
    $("#eur-sub").textContent = `Chiusure fino al ${dataIt(d.aggiornato)}: le ${st.x.titoli.length} azioni di ${elenco(st.x.indici.map(i => i.nome))}, con prezzi nella valuta di ogni borsa.${indietro}`;
    disegnaTutto();
  }

  function apri(t, scorri) {
    st.aperto = st.aperto === t ? null : t;
    try { history.replaceState(null, "", st.aperto ? `#eur/${st.aperto}` : "#eur"); } catch (e) { /* niente */ }
    disegnaTabella();
    disegnaDettaglio();
    R.emit("selezione");
    if (st.aperto && scorri !== false) $("#eur-dettaglio").scrollIntoView({ block: "start", behavior: "smooth" });
  }

  function scegliIndice(nome) {
    st.indice = nome && st.indice !== nome ? nome : null;
    disegnaGruppo();
  }

  function scegliSettore(nome) {
    st.settore = nome && st.settore !== nome ? nome : null;
    disegnaGruppo();
  }

  function init() {
    const invio = (sel, fn) => $(sel).addEventListener("keydown", e => {
      if (e.key !== "Enter") return;
      const tr = e.target.closest("tr[tabindex]");
      if (tr) fn(tr);
    });
    $("#eur-indici").addEventListener("click", e => {
      const tr = e.target.closest("tr[data-indice]");
      if (tr) scegliIndice(tr.dataset.indice);
    });
    invio("#eur-indici", tr => scegliIndice(tr.dataset.indice));
    $("#eur-settori").addEventListener("click", e => {
      const b = e.target.closest("[data-t]");
      if (b) { apri(b.dataset.t); return; }
      const th = e.target.closest("th[data-col]");
      if (th) {
        const col = th.dataset.col;
        st.ordineSettori = { col, dir: st.ordineSettori.col === col ? -st.ordineSettori.dir : (col === "nome" || col === "rs" ? 1 : -1) };
        R.store.set("eur.ordineSettori", st.ordineSettori);
        disegnaSettori();
        return;
      }
      const tr = e.target.closest("tr[data-settore]");
      if (tr) scegliSettore(tr.dataset.settore);
    });
    invio("#eur-settori", tr => scegliSettore(tr.dataset.settore));
    $("#eur-sintesi").addEventListener("click", e => {
      const b = e.target.closest("[data-t]");
      if (b) apri(b.dataset.t);
    });
    $("#eur-quadro").addEventListener("click", e => {
      if (e.target.closest("#eur-tutta")) { st.indice = null; st.settore = null; disegnaGruppo(); return; }
      const b = e.target.closest("#eur-periodo-quadro button[data-v]");
      if (b) { st.periodoQuadro = Number(b.dataset.v); R.store.set("eur.periodoQuadro", st.periodoQuadro); disegnaQuadro(); }
    });
    $("#eur-chips").addEventListener("click", e => {
      const b = e.target.closest("button[data-indice]");
      if (!b) return;
      st.indice = b.dataset.indice || null;
      disegnaGruppo();
    });
    $("#eur-settore").addEventListener("change", e => { st.settore = e.target.value || null; disegnaGruppo(); });
    $("#eur-mostra").addEventListener("change", e => { st.filtro = e.target.value; st.tutte = false; salvaFiltri(); disegnaTabella(); });
    $("#eur-cerca").addEventListener("input", R.debounce(e => { st.cerca = e.target.value; st.tutte = false; disegnaTabella(); }, 120));
    $("#eur-cerca").addEventListener("keydown", e => {
      if (e.key === "Escape") { e.target.value = ""; st.cerca = ""; disegnaTabella(); }
      if (e.key === "Enter") {                                // una sola azione trovata: si apre la sua scheda
        const righe = filtrate();
        if (righe.length === 1) apri(righe[0].t);
      }
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
    R.on("tema", () => { if (st.visibile && st.x) disegnaTutto(); });
    R.on("portafoglio", async () => { if (st.visibile && st.x) { await aggiornaMiei(); disegnaSintesi(); disegnaTabella(); disegnaDettaglio(); } });
    window.addEventListener("resize", R.debounce(() => {
      if (!st.visibile || !st.x) return;
      disegnaQuadro();
      if (st.aperto) disegnaDettaglio();
    }, 200));
  }

  async function mostra(param) {
    st.visibile = true;
    document.title = "Europa · Radar Settori";
    if (param) st.aperto = String(param).toUpperCase();
    await disegna();
    if (param && st.aperto && titolo(st.aperto)) $("#eur-dettaglio").scrollIntoView({ block: "start" });
  }

  function nascondi() { st.visibile = false; }

  function tasto(e) {
    if (e.key === "Escape" && st.aperto) { apri(st.aperto, false); return true; }
    return false;
  }

  // dalla casella di ricerca: un indice o un settore da mostrare
  function imposta(o) {
    if ("indice" in o) st.indice = o.indice || null;
    if ("settore" in o) st.settore = o.settore || null;
    salvaFiltri();
    if (st.visibile && st.x) disegnaGruppo();
  }

  // ---------------- testo per «Copia per Claude» ----------------

  function contesto() {
    const x = st.x;
    if (!x) return "## Pagina aperta: Europa\nI dati delle azioni europee non ci sono ancora.";
    const t = x.N - 1, t21 = Math.max(0, t - 21);
    const testo = html => html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
    const rs = r => (r ? `${NOMI_Q[r.quadrante]}, direzione ${r.direzione == null ? "—" : num(r.direzione, 0) + "°"}` : "—");
    const out = ["## Pagina aperta: Europa",
      `Le ${x.titoli.length} azioni di ${elenco(x.indici.map(i => i.nome))}, chiusure fino al ${dataIt(x.d.aggiornato)} (Yahoo Finance), prezzi nella valuta di ogni borsa (pence per Londra, franchi per Zurigo). ` +
      "Ampiezza = quota di azioni sopra la propria media a 200 (o 50) sedute. Forza relativa = rotazione settimanale (stessa formula della vista Rotazione): per le azioni contro il loro indice, per gli indici contro lo STOXX Europe 600 in euro, per i settori (panieri a pesi uguali in euro) contro il paniere di tutte le azioni.",
      "### Cosa dicono i numeri", ...frasi().map(f => "- " + testo(f.html)),
      "### Indici",
      "indice | ultimo | 1 giorno | 1 mese | 3 mesi in euro | da inizio anno | sulla media 200 | sulla media 50 | tendenza | azioni sopra la media 200 (un mese fa) | sopra la media 50 | forza relativa sullo STOXX 600 | 3 mesi sullo STOXX 600",
      ...x.indici.map(i => [i.nome, cifre(i.a.ultimo), p100(i.a.g1), p100(i.a.m1), p100(i.m3Eur), p100(i.a.ytd), p100(i.a.vs200), p100(i.a.vs50), i.a.stato ? E.STATI[i.a.stato] : "—",
        `${quota(frazione(i.oggi200))} (${quota(i.b200[t21])})`, quota(frazione(i.oggi50)), rs(i.rs), p100(i.rs3)].join(" | ")),
    ];
    if (x.confronto) {
      const a = x.confronto.a;
      out.push(`STOXX Europe 600 | ${cifre(a.ultimo)} | ${p100(a.g1)} | ${p100(a.m1)} | ${p100(a.m3)} | ${p100(a.ytd)} | ${p100(a.vs200)} | ${p100(a.vs50)} | ${a.stato ? E.STATI[a.stato] : "—"} | tutte le azioni ${quota(frazione(x.europa.oggi200))} (${quota(x.europa.b200[t21])}) | ${quota(frazione(x.europa.oggi50))} | termine di confronto | —`);
    }
    out.push("### Settori (panieri a pesi uguali in euro)",
      "settore | azioni | 1 mese | 3 mesi | da inizio anno | sulla media 200 | azioni sopra la media 200 (un mese fa) | forza relativa sulla media | 3 mesi sulla media | i più forti a 3 mesi",
      ...x.settori.map(z => [z.nome, z.membri.length, p100(z.a.m1), p100(z.a.m3), p100(z.a.ytd), p100(z.a.vs200), `${quota(frazione(z.oggi200))} (${quota(z.b200[t21])})`,
        rs(z.a.rs), p100(z.a.rs3), z.migliori.map(m => `${m.nome} ${p100(m.m3Eur)}`).join(", ")].join(" | ")));
    const o = st.ordine;
    const val = (z, k) => (k === "nome" ? z.nome : k === "rs" ? E.ordineForza(z.a.rs) : z.a[k]);
    const righe = filtrate().sort(ordina(val, o.col, o.dir));
    const MAX = 120;
    const filtri = [st.indice, st.settore, st.cerca ? `ricerca «${st.cerca}»` : "", (FILTRI.find(f => f[0] === st.filtro && f[0]) || [])[1]].filter(Boolean);
    out.push(`### Azioni${filtri.length ? ` (filtro: ${filtri.join(", ")})` : ""}: ${righe.length}${righe.length > MAX ? `, qui le prime ${MAX} nell'ordine della tabella` : ""}`,
      "azione | ticker | indice | settore | ultimo | valuta | 1 giorno | 1 mese | 3 mesi | da inizio anno | 1 anno | sulla media 200 | sulla media 50 | tendenza | dal massimo 52 sett. | forza relativa sull'indice | 3 mesi sull'indice | note",
      ...righe.slice(0, MAX).map(z => {
        const a = z.a;
        const note = [a.nuovoMax ? "nuovo massimo 52 sett." : "", a.nuovoMin ? "nuovo minimo 52 sett." : "", st.portafoglio.has(z.t) ? "nel portafoglio" : "", st.lista.has(z.t) ? "nella lista" : "", a.vecchio ? `ferma dal ${dataIt(a.data)}` : ""].filter(Boolean).join(", ");
        return [z.nome, z.t, z.indici.join(", "), z.settore, cifre(a.ultimo), z.valuta, p100(a.g1), p100(a.m1), p100(a.m3), p100(a.ytd), p100(a.a1), p100(a.vs200), p100(a.vs50),
          a.stato ? E.STATI[a.stato] : "—", p100(a.dd52), rs(a.rs), p100(a.rs3), note || "—"].join(" | ");
      }));
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

  R.viste.eur = { init, mostra, nascondi, tasto, contesto, imposta };
})();
