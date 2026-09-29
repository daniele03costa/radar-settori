/*
 * Radar Settori — vista 7: Crypto.
 * Bitcoin e le prime 10 criptovalute per capitalizzazione (stablecoin escluse): tendenza sulle medie 50 e 200,
 * multiplo di Mayer e media 200 settimane, ciclo dell'halving, cosa è successo dopo situazioni simili,
 * la regola della media 200 contro «sempre investito», stagionalità mensile, correlazioni fra monete e con i mercati.
 * I calcoli stanno in crypto-calcoli.js (window.Crypto).
 */
(function () {
  "use strict";

  const R = window.Radar, C = window.Crypto;
  const { $, num, pct, esc, svg, dataIt, cls } = R;

  const ORIZZONTI = { 30: "1 mese", 90: "3 mesi", 180: "6 mesi", 365: "1 anno" };
  const FINESTRE = { 30: "30 giorni", 90: "90 giorni", 365: "1 anno" };
  const PERIODI = [[365, "1 anno"], [730, "2 anni"], [1460, "4 anni"], [0, "Tutto"]];
  const COLORE_STATO = { rialzo: "var(--q-leader)", recupero: "var(--q-miglioramento)", debolezza: "var(--q-indebolimento)", ribasso: "var(--q-ritardo)" };
  const COLORE_MERCATO = { QQQ: "var(--soglia)", SPY: "var(--b200)", GLD: "var(--q-indebolimento)", "DX-Y.NYB": "var(--b50)" };
  const COLORE_CICLO = ["var(--faint)", "var(--q-miglioramento)", "var(--q-indebolimento)", "var(--price)"];
  const MESI = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];
  const MESI_LUNGHI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
  const CRITERI = [
    { k: "media200", titolo: "Prezzo rispetto alla media 200" },
    { k: "tendenza", titolo: "Tendenza (medie 50 e 200)" },
    { k: "mayer", titolo: "Multiplo di Mayer (prezzo ÷ media 200)" },
    { k: "massimo", titolo: "Distanza dal massimo storico" },
    { k: "paura", titolo: "Fear & Greed" },
  ];
  const NOMI_GRUPPO = Object.assign(
    { sopra: "sopra la media 200", sotto: "sotto la media 200" },
    C.STATI,
    ...["mayer", "massimo", "paura"].map(f => Object.fromEntries(C.FASCE[f].map(x => [x.k, x.nome]))),
  );
  const ORDINE_GRUPPI = {
    media200: ["sopra", "sotto"], tendenza: C.ORDINE_STATI,
    mayer: C.FASCE.mayer.map(f => f.k), massimo: C.FASCE.massimo.map(f => f.k), paura: C.FASCE.paura.map(f => f.k),
  };

  const st = {
    visibile: false,
    x: null,                                              // dati preparati
    aperta: null,                                         // moneta nel dettaglio
    scelta: R.store.get("cry.moneta", "BTC"),            // moneta delle analisi
    orizzonte: R.store.get("cry.orizzonte", 90),
    finestra: R.store.get("cry.finestra", 90),
    periodo: R.store.get("cry.periodo", 730),
    ordine: R.store.get("cry.ordine", { col: "rango", dir: 1 }),
  };

  // ---------------- formati ----------------

  const cifre = v => (v == null || !isFinite(v) ? "—" : v >= 1000 ? num(v, 0) : v >= 100 ? num(v, 1) : v >= 1 ? num(v, 2) : v >= 0.01 ? num(v, 4) : num(v, 6));
  const dollari = v => `${cifre(v)}<span class="valuta">$</span>`;
  const dollariTesto = v => `${cifre(v)} $`;
  const miliardi = v => (v == null ? "—" : `${num(v / 1e9, v >= 1e10 ? 0 : 1)} mld $`);
  const giorni = k => `${k} ${k === 1 ? "giorno" : "giorni"}`;
  const volte = v => `${num(v * 100, 0)}%`;
  const pill = s => (s ? `<span class="st-pill" style="--c:${COLORE_STATO[s]}">${C.STATI[s]}</span>` : "—");
  const etichettaPaura = v => (v == null ? "" : v < 25 ? "paura estrema" : v < 45 ? "paura" : v < 56 ? "neutrale" : v < 76 ? "avidità" : "avidità estrema");
  const forza = r => (r == null ? "" : Math.abs(r) < 0.2 ? "debole" : Math.abs(r) < 0.5 ? "medio" : "forte");

  // colore di una correlazione: arancio se negativa, blu se positiva, grigio vicino a zero
  let tavCorr = null;
  R.on("tema", () => { tavCorr = null; });
  function coloreCorr(r) {
    if (!tavCorr) {
      const c = document.createElement("canvas").getContext("2d");
      const rgb = n => { c.fillStyle = R.css(n); const h = c.fillStyle; return h.startsWith("#") ? [1, 3, 5].map(k => parseInt(h.slice(k, k + 2), 16)) : (h.match(/\d+/g) || [128, 128, 128]).slice(0, 3).map(Number); };
      tavCorr = { neg: rgb("--ma"), pos: rgb("--soglia"), mid: rgb("--surface-3") };
    }
    const t = r == null ? 0 : Math.max(-1, Math.min(1, r));
    const a = t < 0 ? tavCorr.neg : tavCorr.pos, k = 0.85 * Math.pow(Math.abs(t), 0.9);
    const col = tavCorr.mid.map((m, i) => Math.round(m + (a[i] - m) * k));
    const lum = col.map(x => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); });
    const L = 0.2126 * lum[0] + 0.7152 * lum[1] + 0.0722 * lum[2];
    return { bg: `rgb(${col.join(",")})`, testo: (L + 0.05) / 0.055 > 1.05 / (L + 0.05) ? "#0e1013" : "#ffffff" };
  }

  // ---------------- dati ----------------

  function prepara(d) {
    const N = d.date.length;
    const piena = (i0, valori) => { const a = new Array(N).fill(null); valori.forEach((v, k) => { a[i0 + k] = v; }); return a; };
    const monete = d.monete.map(m => Object.assign({}, m, { a: C.analizza(piena(m.i0, m.prezzi), d.date) }));
    const btc = monete.find(m => m.simbolo === "BTC") || monete[0];
    for (const m of monete) m.vsBtc = m === btc ? null : C.controBtc(m.a, btc.a);
    const paura = d.paura ? piena(d.paura.i0, d.paura.valori) : null;
    const mercati = (d.mercati || []).map(x => Object.assign({}, x, { corr: C.correlazioneMobile(btc.a.p, x.prezzi, 90) }));
    return { d, N, date: d.date, monete, btc, paura, mercati, amp: C.ampiezza(monete.map(m => m.a)), cache: new Map() };
  }

  const moneta = sim => st.x && (st.x.monete.find(m => m.simbolo === sim) || null);
  const memo = (chiave, fn) => { if (!st.x.cache.has(chiave)) st.x.cache.set(chiave, fn()); return st.x.cache.get(chiave); };
  const condizioni = m => memo("cond|" + m.simbolo, () => C.condizioni(m.a, st.x.paura));
  const dopo = (m, crit, h) => memo(`dopo|${m.simbolo}|${crit}|${h}`, () => C.dopo(m.a.p, condizioni(m)[crit], h));
  const regola = m => memo("regola|" + m.simbolo, () => C.regola200(m.a.p, m.a.m200));
  const mensili = m => memo("mesi|" + m.simbolo, () => C.mensili(m.a.p, st.x.date));
  const cicli = () => memo("cicli", () => C.cicli(st.x.btc.a.p, st.x.date, st.x.d.halving));

  function altcoinMeglio() {
    const alt = st.x.monete.filter(m => m !== st.x.btc && m.vsBtc && m.vsBtc.rel90 != null);
    return { meglio: alt.filter(m => m.vsBtc.rel90 > 0).length, totale: alt.length };
  }

  // ---------------- quadro di bitcoin ----------------

  function disegnaKpi() {
    const x = st.x, o = x.btc.a.oggi, t = x.N - 1;
    const tile = (k, l, v, s, titolo) => `<div class="kpi"${k ? ` style="--k:${k}"` : ""}${titolo ? ` title="${esc(titolo)}"` : ""}><div class="l">${k ? "<i></i>" : ""}${l}</div><div class="v">${v}</div><div class="s">${s}</div></div>`;
    const s = o.striscia;
    const cc = cicli(), ora = cc[cc.length - 1];
    const amp = x.amp, t30 = Math.max(0, t - 30);
    const paura = x.paura ? x.paura[t] : null;
    const paura30 = x.paura ? x.paura[t30] : null;
    const dom = x.d.dominanza;
    $("#cry-kpi").innerHTML = [
      tile("var(--price)", "Bitcoin", `${cifre(o.prezzo)}<small> $</small>`, `7 giorni ${pct(o.g7 * 100, 1)} · 30 giorni ${pct(o.g30 * 100, 1)}`),
      tile(COLORE_STATO[o.stato], "Sulla media 200", pct(o.vs200 * 100, 1),
        s ? `${s.sopra ? "sopra" : "sotto"} da ${giorni(s.giorni)} · Mayer ${num(o.mayer, 2)}` : "—",
        o.mayerPercentile != null ? `Multiplo di Mayer ${num(o.mayer, 2)}: più alto ${R.art("del", num(o.mayerPercentile, 0) + "%")} dei giorni dal ${dataIt(x.date[x.btc.a.primo])}` : ""),
      tile("var(--faint)", "Media 200 settimane", o.vs1400 == null ? "—" : pct(o.vs1400 * 100, 0), o.m1400 ? `la media è a ${dollariTesto(o.m1400)}` : "servono 4 anni di dati"),
      tile("var(--neg)", "Dal massimo", pct(o.dd * 100, 1), o.ath ? `massimo ${dollariTesto(o.ath.prezzo)} del ${dataIt(o.ath.data)}` : "—"),
      ora ? tile("var(--q-indebolimento)", "Dall'ultimo halving", `${ora.giorni}<small> giorni</small>`, `halving del ${dataIt(ora.data)}`) : "",
      tile("var(--q-leader)", "Sopra la media 200", `${amp.sopra[t]}<small>/${amp.totale[t]}</small>`,
        `fra le prime ${x.monete.length} · un mese fa ${amp.sopra[t30] ?? "—"}/${amp.totale[t30] ?? "—"}`),
      paura != null ? tile("var(--q-indebolimento)", "Fear &amp; Greed", `${paura}<small> ${etichettaPaura(paura)}</small>`, `un mese fa ${paura30 ?? "—"} · fonte alternative.me`) : "",
      dom ? tile("var(--soglia)", "Quota di bitcoin", `${num(dom.btc, 1)}<small>%</small>`, `del valore di tutte le crypto (${num(dom.totale_usd / 1e12, 2)} mila mld $)`) : "",
    ].join("");
  }

  // ---------------- cosa dicono i numeri ----------------

  function frasi() {
    const x = st.x, b = x.btc, o = b.a.oggi, t = x.N - 1;
    const out = [];
    // tendenza di bitcoin e cosa è successo dopo
    if (o.striscia && o.stato) {
      const d = dopo(b, "tendenza", 90)[o.stato];
      out.push({
        c: COLORE_STATO[o.stato],
        html: `<b>Bitcoin</b> è ${o.striscia.sopra ? "sopra" : "sotto"} la media 200 da ${giorni(o.striscia.giorni)} (${pct(o.vs200 * 100, 1)}) e la media 50 è ${b.a.m50[t] >= b.a.m200[t] ? "sopra" : "sotto"} la media 200: ${pill(o.stato)}.` +
          (d ? ` Nella sua storia, dai giorni con questa tendenza il prezzo 3 mesi dopo era più alto ${R.art("nel", volte(d.positivi))} dei casi, con una mediana di ${pct(d.mediana * 100, 0)} (${d.episodi} ${d.episodi === 1 ? "episodio" : "episodi"}).` : ""),
      });
    }
    // livelli di prezzo di riferimento
    const livelli = [
      ["la media 50", b.a.m50[t]], ["la media 200", b.a.m200[t]],
      ["Mayer 0,8 (0,8 × media 200)", b.a.m200[t] ? 0.8 * b.a.m200[t] : null], ["la media 200 settimane", b.a.m1400[t]],
    ].filter(z => z[1] != null).sort((u, v) => v[1] - u[1]);
    if (livelli.length) {
      out.push({
        c: "var(--ma)",
        html: `Livelli di riferimento per bitcoin (oggi ${dollariTesto(o.prezzo)}): ${livelli.map(([nome, v]) => `${nome} a <b>${dollariTesto(v)}</b> (${pct((v / o.prezzo - 1) * 100, 1)})`).join(", ")}.`,
      });
    }
    // ciclo dell'halving
    const cc = cicli(), ora = cc[cc.length - 1], passati = cc.filter(c => c.completo);
    if (ora && passati.length) {
      const elenco = (arr, f) => arr.map(f).join(passati.length === 2 ? " e " : ", ");
      out.push({
        c: "var(--q-indebolimento)",
        html: `Siamo al <b>giorno ${ora.giorni}</b> dall'halving del ${dataIt(ora.data)}. Nei cicli precedenti il massimo è arrivato ai giorni ${elenco(passati, c => c.massimo.giorno)} e il minimo successivo ai giorni ${elenco(passati, c => c.minimo.giorno)}, dopo cali ${passati.length > 1 ? "del " : ""}${elenco(passati, c => pct(c.minimo.calo * 100, 0))}. ` +
          `In questo ciclo il massimo finora è del ${dataIt(ora.massimo.data)} (giorno ${ora.massimo.giorno}) e oggi il prezzo è ${pct(ora.oggi.dalMassimo * 100, 0)} da lì.`,
      });
    }
    // ampiezza e altcoin
    const am = x.amp, t30 = Math.max(0, t - 30), alt = altcoinMeglio();
    let fase = "";
    if (alt.totale >= 4) fase = alt.meglio >= 0.75 * alt.totale ? ": le altcoin stanno guidando" : alt.meglio <= 0.25 * alt.totale ? ": bitcoin è più forte della maggior parte delle altcoin" : "";
    out.push({
      c: "var(--q-leader)",
      html: `<b>${am.sopra[t]} delle prime ${am.totale[t]}</b> sono sopra la media 200 (un mese fa ${am.sopra[t30] ?? "—"}). Negli ultimi 90 giorni ${alt.meglio} altcoin su ${alt.totale} hanno fatto meglio di bitcoin${fase}.`,
    });
    // stagionalità
    const sm = mensili(b), meseOra = Number(x.date[t].slice(5, 7)) - 1, giorno = Number(x.date[t].slice(8, 10));
    const descr = k => { const r = sm.riepilogo[k]; return r ? `<b>${MESI_LUNGHI[k]}</b> è stato positivo in ${r.positivi} anni su ${r.casi} (mediana ${pct(r.mediana * 100, 1)})` : null; };
    const pezzi = [descr(meseOra), giorno >= 20 ? descr((meseOra + 1) % 12) : null].filter(Boolean);
    if (pezzi.length) out.push({ c: "var(--soglia)", html: `Stagionalità di bitcoin: ${pezzi.join("; ")}.` });
    // sentimento
    if (x.paura && x.paura[t] != null) {
      const f = C.fascia(C.FASCE.paura, x.paura[t]);
      const d = f && dopo(b, "paura", 90)[f.k];
      out.push({
        c: "var(--q-indebolimento)",
        html: `Fear &amp; Greed a <b>${x.paura[t]}</b> (${etichettaPaura(x.paura[t])}).` +
          (d ? ` Nei giorni con ${f.nome.replace(/ \(.*\)/, "")} dal 2018, bitcoin 3 mesi dopo era più alto ${R.art("nel", volte(d.positivi))} dei casi, mediana ${pct(d.mediana * 100, 0)}.` : ""),
      });
    }
    // mercati
    const legami = x.mercati.map(mk => { const v = ultimoValore(mk.corr); return v == null ? null : `${mk.nome.replace(/ \(.*\)/, "")} ${num(v, 2)}`; }).filter(Boolean);
    if (legami.length) out.push({ c: "var(--soglia)", html: `Legame di bitcoin con i mercati negli ultimi 90 giorni (correlazione da −1 a +1): ${legami.join(", ")}.` });
    return out;
  }

  function ultimoValore(serie) {
    for (let i = serie.length - 1; i >= Math.max(0, serie.length - 10); i--) if (serie[i] != null) return serie[i];
    return null;
  }

  function disegnaSintesi() {
    const x = st.x;
    const f = frasi();
    $("#cry-sintesi").innerHTML = `
      <div class="card-title"><h2>Cosa dicono i numeri</h2><span class="muted small-inline">chiusura del ${dataIt(x.d.aggiornato)} (ore 24 UTC)</span></div>
      <ul class="novita-lista">${f.map(r => `<li><i style="--c:${r.c}"></i><span>${r.html}</span></li>`).join("")}</ul>
      <p class="novita-piede">Sono statistiche del passato, con pochi cicli e periodi che si sovrappongono: aiutano a capire in che fase si è, non dicono cosa succederà.</p>`;
  }

  // ---------------- le prime 10 ----------------

  function valoreOrdine(m, col) {
    const o = m.a.oggi;
    switch (col) {
      case "rango": return m.rango ?? 999;
      case "nome": return m.simbolo;
      case "stato": return o.stato ? C.ORDINE_STATI.indexOf(o.stato) : 9;
      case "contro": return m.vsBtc ? m.vsBtc.rel90 : null;
      case "vol": return o.vol30;
      default: return o[col];
    }
  }

  function disegnaTabella() {
    const x = st.x, { col, dir } = st.ordine;
    const righe = x.monete.slice().sort((a, b) => {
      const u = valoreOrdine(a, col), v = valoreOrdine(b, col);
      if (typeof u === "string") return dir * u.localeCompare(v);
      if (u == null) return 1;
      if (v == null) return -1;
      return dir * (u - v);
    });
    const th = (k, lab, left, titolo) => `<th class="sortable${left ? " l" : ""}" data-col="${k}" aria-sort="${col === k ? (dir > 0 ? "ascending" : "descending") : "none"}"${titolo ? ` title="${esc(titolo)}"` : ""}>${lab}</th>`;
    const c = R.colori();
    $("#cry-tabella").innerHTML = `<thead><tr>${th("rango", "Moneta", true)}<th class="l">Ultimo anno</th>${th("prezzo", "Prezzo")}${th("g30", "30 giorni")}` +
      `${th("vs200", "Media 200", false, "Distanza dalla media a 200 giorni e da quanti giorni il prezzo è da quella parte")}${th("stato", "Tendenza", true)}${th("dd", "Dal massimo")}` +
      `${th("contro", "Contro BTC", false, "Rendimento degli ultimi 90 giorni rispetto a bitcoin; sotto, se il rapporto con bitcoin è sopra o sotto la sua media 200")}${th("vol", "Rischio", false, "Volatilità degli ultimi 30 giorni in ragione d'anno; sotto, il beta su bitcoin a 90 giorni")}</tr></thead><tbody>` +
      righe.map(m => {
        const o = m.a.oggi, s = o.striscia, v = m.vsBtc;
        return `<tr class="clic${st.aperta === m.simbolo ? " hl" : ""}" data-s="${esc(m.simbolo)}" tabindex="0">
          <td class="l"><span class="tit-nome"><b>${esc(m.simbolo)}</b> <span class="muted">${esc(m.nome)}</span></span><small class="sub-line">${m.rango ? `${m.rango}ª · ` : ""}${miliardi(m.cap)}</small></td>
          <td class="l">${R.sparkline(m.a.p.slice(-365), { colore: c.price })}</td>
          <td>${dollari(o.prezzo)}<small class="sub-line"><span class="${cls(o.g1 * 100)}">${pct(o.g1 * 100, 1)}</span> in un giorno</small></td>
          <td><span class="${cls(o.g30 * 100)}">${pct(o.g30 * 100, 1)}</span><small class="sub-line">7 giorni ${pct(o.g7 * 100, 1)}</small></td>
          <td><span class="${cls(o.vs200 * 100)}">${o.vs200 == null ? "—" : pct(o.vs200 * 100, 1)}</span><small class="sub-line">${s ? `${s.sopra ? "sopra" : "sotto"} da ${s.giorni} g` : "storia breve"}</small></td>
          <td class="l">${pill(o.stato)}</td>
          <td>${pct(o.dd * 100, 1)}</td>
          <td>${v ? `<span class="${cls(v.rel90 * 100)}">${pct(v.rel90 * 100, 1)}</span><small class="sub-line">${v.sopraMedia == null ? "storia breve" : v.sopraMedia ? "rapporto ↑ media 200" : "rapporto ↓ media 200"}</small>` : "—"}</td>
          <td>${o.vol30 == null ? "—" : num(o.vol30 * 100, 0) + "%"}<small class="sub-line">${v && v.beta90 != null ? `beta ${num(v.beta90, 2)}` : "—"}</small></td>
        </tr>`;
      }).join("") + "</tbody>";
    const alt = altcoinMeglio();
    $("#cry-conta").textContent = `${x.amp.sopra[x.N - 1]} su ${x.monete.length} sopra la media 200 · ${alt.meglio} altcoin su ${alt.totale} meglio di BTC a 90 giorni`;
    $("#cry-nota-tab").innerHTML = `Classifica ${["CoinGecko", "CoinPaprika"].includes(x.d.fonte_classifica) ? `per capitalizzazione di ${x.d.fonte_classifica}` : `dalla ${esc(x.d.fonte_classifica)} (le fonti della classifica non hanno risposto)`}, escluse stablecoin e token «impacchettati»; prezzi in dollari di Yahoo Finance, chiusura a mezzanotte UTC (le 2 di notte italiane in estate). ` +
      `Medie su giorni di calendario. Tendenza: ${C.ORDINE_STATI.map(k => `<b>${C.STATI[k].toLowerCase()}</b> ${({ rialzo: "prezzo e media 50 sopra la media 200", recupero: "prezzo sopra la media 200, media 50 ancora sotto", debolezza: "prezzo sotto la media 200, media 50 ancora sopra", ribasso: "prezzo e media 50 sotto la media 200" })[k]}`).join("; ")}. Clic su una riga per il grafico.`;
  }

  // ---------------- dettaglio con grafico ----------------

  function disegnaDettaglio() {
    const box = $("#cry-dettaglio");
    const m = moneta(st.aperta);
    if (!m) { box.hidden = true; box.innerHTML = ""; return; }
    box.hidden = false;
    const o = m.a.oggi, v = m.vsBtc;
    const cella = (l, val, classe, titolo) => `<div class="tit-num"${titolo ? ` title="${esc(titolo)}"` : ""}><span>${l}</span><b class="${classe || ""}">${val}</b></div>`;
    const p100 = w => (w == null ? "—" : pct(w * 100, 1));
    box.innerHTML = `
      <div class="card-head">
        <div>
          <div class="card-title"><h2>${esc(m.simbolo)} · ${esc(m.nome)}</h2></div>
          <p class="sub">${m.rango ? `${m.rango}ª per capitalizzazione (${miliardi(m.cap)}). ` : ""}Tendenza: ${pill(o.stato)}. Dati dal ${dataIt(st.x.date[m.a.primo])} al ${dataIt(o.data)}, in dollari.</p>
        </div>
        <div class="controls">
          <div class="seg" id="cry-periodo" role="group" aria-label="Periodo">${PERIODI.map(([k, l]) => `<button type="button" data-v="${k}" aria-pressed="${k === st.periodo}">${l}</button>`).join("")}</div>
          <a class="btn-link" href="https://finance.yahoo.com/quote/${encodeURIComponent(m.yahoo)}" target="_blank" rel="noopener">Yahoo Finance ↗</a>
          <button class="icon-btn" type="button" id="cry-chiudi" aria-label="Chiudi il dettaglio">×</button>
        </div>
      </div>
      <div class="tit-numeri">
        ${cella("Prezzo", dollari(o.prezzo))}${cella("1 giorno", p100(o.g1), cls(o.g1 * 100))}${cella("7 giorni", p100(o.g7), cls(o.g7 * 100))}
        ${cella("30 giorni", p100(o.g30), cls(o.g30 * 100))}${cella("90 giorni", p100(o.g90), cls(o.g90 * 100))}${cella("1 anno", p100(o.g365), cls(o.g365 * 100))}
        ${cella("Da inizio anno", p100(o.ytd), cls(o.ytd * 100))}${cella("Dal massimo", p100(o.dd), "", o.ath ? `Massimo ${dollariTesto(o.ath.prezzo)} del ${dataIt(o.ath.data)}` : "")}
        ${cella("Sulla media 200", p100(o.vs200), cls(o.vs200 * 100))}${cella("Sulla media 50", p100(o.vs50), cls(o.vs50 * 100))}
        ${cella("Media 200 sett.", o.vs1400 == null ? "—" : p100(o.vs1400), cls(o.vs1400 * 100), o.m1400 ? `La media è a ${dollariTesto(o.m1400)}` : "Servono 4 anni di dati")}
        ${cella("Multiplo di Mayer", o.mayer == null ? "—" : num(o.mayer, 2), "", o.mayerPercentile == null ? "" : `Più alto ${R.art("del", num(o.mayerPercentile, 0) + "%")} dei giorni della sua storia`)}
        ${cella("Volatilità 30 giorni", o.vol30 == null ? "—" : num(o.vol30 * 100, 0) + "%", "", "Deviazione standard dei rendimenti giornalieri, in ragione d'anno")}
        ${v ? cella("Contro BTC 90 g", p100(v.rel90), cls(v.rel90 * 100), "Rendimento degli ultimi 90 giorni rispetto a bitcoin") + cella("Beta su BTC", v.beta90 == null ? "—" : num(v.beta90, 2), "", "Di quanto si è mossa in media quando bitcoin si è mosso dell'1%, ultimi 90 giorni") : ""}
      </div>
      <div class="legend tit-legenda" id="cry-legenda"></div>
      <div class="cry-grafico" id="cry-grafico"></div>`;
    graficoPrezzo(m);
  }

  // tacche per una scala logaritmica
  function tacchelog(lo, hi, max = 7) {
    const out = [];
    for (let e = Math.floor(Math.log10(lo)) - 1; e <= Math.ceil(Math.log10(hi)); e++) {
      for (const k of [1, 2, 5]) { const v = k * Math.pow(10, e); if (v >= lo && v <= hi) out.push(v); }
    }
    if (out.length > max) return out.filter(v => /^1/.test(v.toExponential()));
    if (out.length < 3) {
      const fitte = [];
      for (let e = Math.floor(Math.log10(lo)) - 1; e <= Math.ceil(Math.log10(hi)); e++) for (const k of [1, 1.5, 2, 3, 4, 5, 6, 7, 8]) { const v = k * Math.pow(10, e); if (v >= lo && v <= hi) fitte.push(v); }
      return fitte.length > max ? fitte.filter((_, i) => i % 2 === 0) : fitte;
    }
    return out;
  }

  // cursore e scheda al passaggio del dito o del mouse
  function cursore(box, root, geo, contenuto) {
    const linea = svg("line", { x1: 0, x2: 0, y1: geo.alto, y2: geo.basso, class: "pf-cursor", visibility: "hidden" });
    root.append(linea);
    const tip = document.createElement("div");
    tip.className = "chart-tip";
    tip.hidden = true;
    box.append(tip);
    const muovi = ev => {
      const rect = root.getBoundingClientRect();
      const px = ((ev.clientX - rect.left) / rect.width) * geo.W;
      const k = Math.max(geo.da, Math.min(geo.a, Math.round(geo.inverso(px))));
      const html = contenuto(k);
      if (!html) return;
      linea.setAttribute("x1", geo.X(k)); linea.setAttribute("x2", geo.X(k)); linea.setAttribute("visibility", "visible");
      tip.innerHTML = html;
      tip.hidden = false;
      const x = (geo.X(k) / geo.W) * rect.width;
      tip.style.left = (x + 16 + tip.offsetWidth > rect.width ? Math.max(0, x - tip.offsetWidth - 16) : x + 16) + "px";
    };
    root.addEventListener("pointermove", muovi);
    root.addEventListener("pointerdown", muovi);
    root.addEventListener("pointerleave", () => { linea.setAttribute("visibility", "hidden"); tip.hidden = true; });
  }

  function graficoPrezzo(mo) {
    const box = $("#cry-grafico");
    const a = mo.a, p = a.p, date = st.x.date, N = p.length;
    const i0 = st.periodo ? Math.max(a.primo, N - 1 - st.periodo) : a.primo, n = Math.max(1, N - 1 - i0);
    const W = Math.max(320, box.clientWidth || 900), stretto = W < 600;
    const m = { l: 8, r: stretto ? 58 : 70, t: 10, b: 24 };
    const eBtc = mo === st.x.btc;
    const pannello = eBtc ? a.mayer : mo.vsBtc ? mo.vsBtc.rapporto : null;
    const h1 = stretto ? 230 : 300, h2 = pannello ? (stretto ? 100 : 120) : 0, gap = pannello ? 28 : 0;
    const H = m.t + h1 + gap + h2 + m.b, pw = W - m.l - m.r;
    const X = k => m.l + ((k - i0) / n) * pw;
    const serieP = [p, a.m50, a.m200, a.m1400];
    let lo = Infinity, hi = -Infinity;
    for (let i = i0; i < N; i++) for (const s of serieP) { const v = s[i]; if (v != null && v > 0) { lo = Math.min(lo, v); hi = Math.max(hi, v); } }
    lo /= 1.06; hi *= 1.06;
    const L = Math.log;
    const Y = v => m.t + ((L(hi) - L(v)) / (L(hi) - L(lo))) * h1;
    const root = svg("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", role: "img", "aria-label": `Prezzo di ${mo.simbolo} in scala logaritmica con le medie a 50, 200 giorni e 200 settimane`, class: "tocco" });
    const c = R.colori();
    // fondo: sopra la media 200 verde tenue, sotto rosso tenue
    let inizio = null, sopra = null;
    const chiudi = k => { if (inizio != null && sopra != null) root.append(svg("rect", { x: X(inizio), y: m.t, width: Math.max(0.5, X(k) - X(inizio)), height: h1, fill: sopra ? "var(--pos)" : "var(--neg)", opacity: 0.07 })); };
    for (let i = i0; i < N; i++) {
      const s = p[i] != null && a.m200[i] != null ? p[i] >= a.m200[i] : null;
      if (s !== sopra) { chiudi(i); inizio = i; sopra = s; }
    }
    chiudi(N - 1);
    for (const v of tacchelog(lo, hi)) {
      root.append(svg("line", { x1: m.l, x2: m.l + pw, y1: Y(v), y2: Y(v), class: "rg-grid" }));
      root.append(svg("text", { x: m.l + pw + 6, y: Y(v) + 4, class: "rg-tick" }, cifre(v)));
    }
    const passoDate = Math.max(1, Math.round(n / (stretto ? 3 : 6)));
    for (let k = i0 + Math.round(passoDate / 2); k < N - passoDate / 3; k += passoDate) root.append(svg("text", { x: X(k), y: H - 6, "text-anchor": "middle", class: "rg-tick" }, R.dataBreve(date[k])));
    const linea = (serie, fn, stile, da = i0) => {
      let d = "";
      for (let i = da; i < N; i++) { const v = serie[i]; if (v == null || !(v > 0)) { continue; } d += `${d ? "L" : "M"}${X(i).toFixed(1)},${fn(v).toFixed(1)}`; }
      if (d) root.append(svg("path", Object.assign({ d, fill: "none" }, stile)));
    };
    linea(a.m1400, Y, { stroke: c.muted, "stroke-width": 1.4, "stroke-dasharray": "2 3" });
    linea(a.m200, Y, { stroke: c.ma, "stroke-width": 2 });
    linea(a.m50, Y, { stroke: c.b50, "stroke-width": 1.4, "stroke-dasharray": "5 4" });
    linea(p, Y, { stroke: c.price, "stroke-width": 1.6, "stroke-linejoin": "round" });
    // secondo pannello
    const y2 = m.t + h1 + gap;
    let Y2 = null, base = null, pan = null, panM = null;
    if (pannello) {
      if (eBtc) { pan = pannello; }
      else {
        const j = (() => { for (let i = i0; i < N; i++) if (pannello[i] != null) return i; return -1; })();
        base = j >= 0 ? pannello[j] : null;
        pan = base ? pannello.map(v => (v == null ? null : (v / base) * 100)) : null;
        panM = base ? mo.vsBtc.m200.map(v => (v == null ? null : (v / base) * 100)) : null;
      }
      if (pan) {
        let rlo = Infinity, rhi = -Infinity;
        for (let i = i0; i < N; i++) for (const s of [pan, panM]) if (s && s[i] != null && s[i] > 0) { rlo = Math.min(rlo, s[i]); rhi = Math.max(rhi, s[i]); }
        let guide;
        if (eBtc) {
          // multiplo di Mayer: scala lineare con le soglie 0,8 e 2,4
          rlo = Math.min(rlo, 0.8); rhi = Math.max(rhi, 1.2);
          const rp = (rhi - rlo) * 0.08; rlo -= rp; rhi += rp;
          Y2 = v => y2 + ((rhi - v) / (rhi - rlo)) * h2;
          guide = [0.8, 1, 2.4].filter(v => v > rlo && v < rhi);
        } else {
          // rapporto con bitcoin: scala logaritmica, così un raddoppio pesa uguale in alto e in basso
          rlo = Math.min(rlo, 100) / 1.08; rhi = Math.max(rhi, 100) * 1.08;
          Y2 = v => y2 + ((Math.log(rhi) - Math.log(v)) / (Math.log(rhi) - Math.log(rlo))) * h2;
          guide = tacchelog(rlo, rhi, 4);
          if (!guide.includes(100)) guide.push(100);
        }
        for (const g of guide) {
          const asse = g === 1 || g === 100;
          root.append(svg("line", { x1: m.l, x2: m.l + pw, y1: Y2(g), y2: Y2(g), class: asse ? "rg-axis" : "rg-grid", "stroke-dasharray": asse || !eBtc ? null : "4 4" }));
          root.append(svg("text", { x: m.l + pw + 6, y: Y2(g) + 4, class: "rg-tick" }, eBtc ? num(g, 1) : num(g, g < 10 ? 1 : 0)));
        }
        root.append(svg("text", { x: m.l, y: y2 - 9, class: "tit-pannello" }, eBtc ? "Multiplo di Mayer (prezzo ÷ media 200): sopra 2,4 eccesso, sotto 0,8 forte sconto" : `Rapporto con bitcoin (base 100, scala logaritmica) e sua media 200: sale quando fa meglio di bitcoin`));
        if (panM) linea(panM, Y2, { stroke: c.ma, "stroke-width": 1.4 });
        linea(pan, Y2, { stroke: c.soglia, "stroke-width": 1.6 });
      }
    }
    box.innerHTML = "";
    box.append(root);
    cursore(box, root, { W, alto: m.t, basso: H - m.b, da: i0, a: N - 1, X, inverso: px => i0 + ((px - m.l) / pw) * n }, k => {
      if (p[k] == null) return "";
      const r = (col, nome, val) => `<div class="r"><span><i class="sw dot" style="background:${col}"></i>${nome}</span><span>${val}</span></div>`;
      return `<div class="d">${dataIt(date[k])}</div>` + r(c.price, "Prezzo", cifre(p[k]) + " $") + r(c.b50, "Media 50", cifre(a.m50[k]) + " $") + r(c.ma, "Media 200", cifre(a.m200[k]) + " $") +
        (a.m1400[k] ? r(c.muted, "Media 200 sett.", cifre(a.m1400[k]) + " $") : "") +
        (pan && pan[k] != null ? r(c.soglia, eBtc ? "Mayer" : "Rapporto con BTC", num(pan[k], eBtc ? 2 : 1)) : "");
    });
    $("#cry-legenda").innerHTML = [
      `<span><i class="sw" style="background:${c.price}"></i>Prezzo (scala logaritmica)</span>`,
      `<span><i class="sw dash" style="color:${c.b50}"></i>Media 50</span>`,
      `<span><i class="sw" style="background:${c.ma}"></i>Media 200</span>`,
      a.m1400.some(v => v != null) ? `<span><i class="sw dash" style="color:${c.muted}"></i>Media 200 settimane</span>` : "",
      `<span><i class="sw box" style="background:var(--pos);opacity:.35"></i>sopra la media 200</span>`,
      `<span><i class="sw box" style="background:var(--neg);opacity:.35"></i>sotto</span>`,
    ].join("");
  }

  // ---------------- analisi della moneta scelta ----------------

  function disegnaScelta() {
    $("#cry-moneta").innerHTML = st.x.monete.map(m => `<button type="button" class="chip-btn" style="--c:${COLORE_STATO[m.a.oggi.stato] || "var(--faint)"}" data-s="${esc(m.simbolo)}" aria-pressed="${m.simbolo === st.scelta}">${esc(m.simbolo)}</button>`).join("");
  }

  function disegnaDopo() {
    const m = moneta(st.scelta) || st.x.btc, h = st.orizzonte, t = st.x.N - 1;
    const cond = condizioni(m);
    const oggi = Object.fromEntries(Object.keys(cond).map(k => [k, cond[k][t]]));
    $("#cry-dopo-titolo").textContent = `Cosa è successo dopo, nella storia di ${m.simbolo}`;
    $("#cry-orizzonte").innerHTML = Object.entries(ORIZZONTI).map(([k, l]) => `<button type="button" data-v="${k}" aria-pressed="${Number(k) === h}">${l}</button>`).join("");
    let corpo = "";
    for (const cr of CRITERI) {
      if (cr.k === "paura" && !st.x.paura) continue;
      const stat = dopo(m, cr.k, h);
      const chiavi = ORDINE_GRUPPI[cr.k].filter(k => stat[k]);
      if (!chiavi.length) continue;
      corpo += `<tr class="gruppo"><th class="l" colspan="8">${cr.titolo}</th></tr>` + chiavi.map(k => {
        const s = stat[k], eOggi = oggi[cr.k] === k;
        return `<tr class="${eOggi ? "oggi" : ""}">
          <td class="l">${cr.k === "tendenza" ? pill(k) : esc(NOMI_GRUPPO[k])}${eOggi ? ' <span class="tag warn">oggi</span>' : ""}</td>
          <td>${s.casi.toLocaleString("it-IT")}</td>
          <td>${s.episodi}</td>
          <td class="${cls(s.mediana * 100)}"><b>${pct(s.mediana * 100, 1)}</b></td>
          <td>${volte(s.positivi)}</td>
          <td class="${cls(s.p10 * 100)}">${pct(s.p10 * 100, 0)}</td>
          <td class="${cls(s.p90 * 100)}">${pct(s.p90 * 100, 0)}</td>
          <td class="${cls(s.media * 100)}">${pct(s.media * 100, 1)}</td>
        </tr>`;
      }).join("");
    }
    $("#cry-dopo").innerHTML = `<thead><tr><th class="l">Situazione del giorno</th><th title="Giorni con quella situazione e un futuro abbastanza lungo">Giorni</th><th title="Tratti consecutivi di giorni nella stessa situazione">Episodi</th><th>Mediana dopo ${ORIZZONTI[h]}</th><th>Volte in rialzo</th><th title="Il 10% dei casi è andato peggio di così">Caso sfavorevole</th><th title="Il 10% dei casi è andato meglio di così">Caso favorevole</th><th>Media</th></tr></thead><tbody>${corpo}</tbody>`;
    $("#cry-dopo-nota").innerHTML = `Per ogni giorno della storia di ${esc(m.simbolo)} (dal ${dataIt(st.x.date[m.a.primo])}) si guarda la situazione di quel giorno e il prezzo ${ORIZZONTI[h]} dopo. ` +
      `I giorni vicini si somigliano, quindi i casi veri sono più vicini agli episodi che ai giorni; il caso sfavorevole e quello favorevole sono il 10° e il 90° percentile.${m === st.x.btc ? "" : " Per le altcoin la storia su Yahoo parte dal 2017 o più tardi."}`;
  }

  function disegnaRegola() {
    const righe = st.x.monete.map(m => ({ m, r: regola(m) })).filter(z => z.r);
    $("#cry-regola").innerHTML = `<thead>
        <tr><th class="l" rowspan="2">Moneta</th><th rowspan="2">Dal</th><th colspan="2" class="grp">Sempre investito</th><th colspan="4" class="grp">Solo sopra la media 200</th></tr>
        <tr><th>All'anno</th><th>Calo massimo</th><th>All'anno</th><th>Calo massimo</th><th>Tempo investito</th><th title="Quante volte all'anno si rientra">Entrate all'anno</th></tr>
      </thead><tbody>` + righe.map(({ m, r }) => {
      const meglio = r.regola.cagr > r.sempre.cagr;
      return `<tr class="${m.simbolo === st.scelta ? "hl" : ""}">
        <td class="l"><b>${esc(m.simbolo)}</b> <span class="muted">${esc(m.nome)}</span></td>
        <td>${R.dataBreve(st.x.date[r.da])}</td>
        <td class="${cls(r.sempre.cagr * 100)}">${meglio ? "" : "<b>"}${pct(r.sempre.cagr * 100, 0)}${meglio ? "" : "</b>"}</td>
        <td>${pct(r.sempre.maxdd * 100, 0)}</td>
        <td class="${cls(r.regola.cagr * 100)}">${meglio ? "<b>" : ""}${pct(r.regola.cagr * 100, 0)}${meglio ? "</b>" : ""}</td>
        <td>${pct(r.regola.maxdd * 100, 0)}</td>
        <td>${volte(r.regola.tempo)}</td>
        <td>${num(r.regola.entrateAnno, 1)}</td>
      </tr>`;
    }).join("") + "</tbody>";
  }

  function disegnaStagioni() {
    const m = moneta(st.scelta) || st.x.btc, s = mensili(m);
    const meseOra = Number(st.x.date[st.x.N - 1].slice(5, 7)) - 1;
    $("#cry-stagioni-titolo").textContent = `Stagionalità di ${m.simbolo}: il rendimento di ogni mese`;
    const cella = (v, pieno, extra, titolo) => {
      if (v == null) return `<td class="vuota">${extra ? "" : ""}</td>`;
      const col = R.divergente(v * 100, pieno);
      return `<td class="${extra || ""}" style="background:${col.bg};color:${col.testo}"${titolo ? ` title="${esc(titolo)}"` : ""}>${pct(v * 100, 0)}</td>`;
    };
    const righe = s.anni.slice().reverse().map(a => {
      const r = s.tab[a];
      return `<tr><th class="l">${a}</th>${r.mesi.map((v, k) => cella(v, 40, `${a}-${String(k + 1).padStart(2, "0")}` === s.inCorso ? "incorso" : "", `${MESI_LUNGHI[k]} ${a}${`${a}-${String(k + 1).padStart(2, "0")}` === s.inCorso ? " (mese in corso)" : ""}`)).join("")}${cella(r.anno, 150, "anno", Number(a) === Number(st.x.date[st.x.N - 1].slice(0, 4)) ? "da inizio anno" : `anno ${a}`)}</tr>`;
    }).join("");
    const riga = (nome, f) => `<tr class="riep"><th class="l">${nome}</th>${s.riepilogo.map(f).join("")}<td></td></tr>`;
    $("#cry-stagioni").innerHTML = `<thead><tr><th class="l">Anno</th>${MESI.map((x, k) => `<th class="${k === meseOra ? "ora" : ""}">${x}</th>`).join("")}<th>Anno</th></tr></thead><tbody>${righe}</tbody>
      <tfoot>
        ${riga("Media", r => (r ? `<td class="${cls(r.media * 100)}">${pct(r.media * 100, 0)}</td>` : "<td>—</td>"))}
        ${riga("Mediana", r => (r ? `<td class="${cls(r.mediana * 100)}"><b>${pct(r.mediana * 100, 0)}</b></td>` : "<td>—</td>"))}
        ${riga("Positivi", r => (r ? `<td>${r.positivi}/${r.casi}</td>` : "<td>—</td>"))}
      </tfoot>`;
    $("#cry-stagioni-nota").innerHTML = `Rendimento dall'ultima chiusura del mese prima all'ultima del mese. Il mese in corso ha il bordo tratteggiato e non entra nelle statistiche. ` +
      `Con 10–12 anni di storia ogni mese ha pochi casi: la mediana e il numero di anni positivi dicono più della media, che un solo mese estremo sposta molto.`;
  }

  // ---------------- cicli dell'halving ----------------

  function disegnaCicli() {
    const cc = cicli(), box = $("#cry-cicli");
    if (!cc.length) { box.innerHTML = '<p class="empty-note">Serve la storia di bitcoin dal 2016.</p>'; $("#cry-cicli-tab").innerHTML = ""; return; }
    const W = Math.max(320, box.clientWidth || 900), stretto = W < 600;
    const m = { l: 8, r: stretto ? 46 : 56, t: 12, b: 26 }, h = stretto ? 240 : 320, H = m.t + h + m.b, pw = W - m.l - m.r;
    const G = C.GIORNI_CICLO;
    const X = k => m.l + (k / G) * pw;
    let lo = Infinity, hi = -Infinity;
    for (const c of cc) for (const v of c.serie) if (v != null) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    lo = Math.min(lo, 1) / 1.1; hi = Math.max(hi, 1) * 1.1;
    const Y = v => m.t + ((Math.log(hi) - Math.log(v)) / (Math.log(hi) - Math.log(lo))) * h;
    const root = svg("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", role: "img", "aria-label": "Prezzo di bitcoin dopo ogni halving, in multipli del prezzo del giorno dell'halving", class: "tocco" });
    for (const v of tacchelog(lo, hi, 6)) {
      root.append(svg("line", { x1: m.l, x2: m.l + pw, y1: Y(v), y2: Y(v), class: v === 1 ? "rg-axis" : "rg-grid" }));
      root.append(svg("text", { x: m.l + pw + 6, y: Y(v) + 4, class: "rg-tick" }, `×${num(v, v < 1 ? 1 : 0)}`));
    }
    for (let anno = 0; anno <= 4; anno++) {
      root.append(svg("line", { x1: X(anno * 365), x2: X(anno * 365), y1: m.t, y2: m.t + h, class: "rg-grid" }));
      root.append(svg("text", { x: X(anno * 365), y: H - 7, "text-anchor": anno === 0 ? "start" : anno === 4 ? "end" : "middle", class: "rg-tick" }, anno === 0 ? "halving" : `${anno} ${anno === 1 ? "anno" : "anni"}`));
    }
    const colori = cc.map((_, k) => COLORE_CICLO[COLORE_CICLO.length - cc.length + k] || "var(--muted)");
    cc.forEach((c, k) => {
      let d = "";
      c.serie.forEach((v, g) => { if (v != null) d += `${d ? "L" : "M"}${X(g).toFixed(1)},${Y(v).toFixed(1)}`; });
      const ultimo = k === cc.length - 1;
      root.append(svg("path", { d, fill: "none", stroke: colori[k], "stroke-width": ultimo ? 2.2 : 1.5, opacity: ultimo ? 1 : 0.9 }));
      // massimo del ciclo
      root.append(svg("circle", { cx: X(c.massimo.giorno), cy: Y(c.massimo.multiplo), r: 3.5, fill: colori[k], stroke: "var(--surface)", "stroke-width": 1.5 }));
      if (ultimo) {
        const g = c.giorni, v = c.serie[g];
        root.append(svg("circle", { cx: X(g), cy: Y(v), r: 5, fill: colori[k], stroke: "var(--surface)", "stroke-width": 2 }));
        root.append(svg("text", { x: X(g) + (X(g) > W - 110 ? -8 : 8), y: Y(v) - 9, "text-anchor": X(g) > W - 110 ? "end" : "start", class: "cry-oggi" }, `oggi, giorno ${g}`));
      }
    });
    box.innerHTML = "";
    box.append(root);
    cursore(box, root, { W, alto: m.t, basso: m.t + h, da: 0, a: G, X, inverso: px => ((px - m.l) / pw) * G }, g => {
      const righe = cc.map((c, k) => (c.serie[g] == null ? "" : `<div class="r"><span><i class="sw dot" style="background:${colori[k]}"></i>${c.data.slice(0, 4)}</span><span>×${num(c.serie[g], 2)} · ${R.dataBreve(st.x.date[c.i + g])}</span></div>`)).join("");
      return righe ? `<div class="d">Giorno ${g} dall'halving</div>${righe}` : "";
    });
    $("#cry-cicli-legenda").innerHTML = cc.map((c, k) => `<span><i class="sw" style="background:${colori[k]}"></i>halving del ${dataIt(c.data)}${c.completo ? "" : " (in corso)"}</span>`).join("") +
      `<span><i class="sw dot" style="background:var(--muted)"></i>massimo del ciclo</span>`;
    $("#cry-cicli-tab").innerHTML = `<thead><tr><th class="l">Halving</th><th>Prezzo</th><th>Massimo del ciclo</th><th>Giorno</th><th>Minimo dopo il massimo</th><th>Giorno</th><th>Calo</th></tr></thead><tbody>` +
      cc.map((c, k) => `<tr>
        <td class="l"><i class="sw dot" style="background:${colori[k]};margin-right:7px"></i>${dataIt(c.data)}${c.completo ? "" : ' <span class="tag warn">in corso</span>'}</td>
        <td>${cifre(st.x.btc.a.p[c.i])} $</td>
        <td>${cifre(c.massimo.prezzo)} $ <small class="muted">×${num(c.massimo.multiplo, 1)}, ${R.dataBreve(c.massimo.data)}</small></td>
        <td>${c.massimo.giorno}</td>
        <td>${cifre(c.minimo.prezzo)} $ <small class="muted">${R.dataBreve(c.minimo.data)}</small></td>
        <td>${c.minimo.giorno}</td>
        <td class="neg">${pct(c.minimo.calo * 100, 0)}</td>
      </tr>`).join("") + "</tbody>";
  }

  // ---------------- correlazioni ----------------

  function disegnaCorrelazioni() {
    const x = st.x, t = x.N - 1, w = st.finestra;
    $("#cry-finestra").innerHTML = Object.entries(FINESTRE).map(([k, l]) => `<button type="button" data-v="${k}" aria-pressed="${Number(k) === w}">${l}</button>`).join("");
    const mm = x.monete;
    const mat = memo("mat|" + w, () => mm.map(a => mm.map(b => (a === b ? 1 : (C.legame(a.a.r, b.a.r, t - w + 1, t, Math.min(20, w - 5)) || {}).r ?? null))));
    $("#cry-matrice").innerHTML = `<thead><tr><th></th>${mm.map(m => `<th>${esc(m.simbolo)}</th>`).join("")}</tr></thead><tbody>` +
      mm.map((a, i) => `<tr><th class="l">${esc(a.simbolo)}</th>${mm.map((b, j) => {
        if (i === j) return '<td class="diag">—</td>';
        const r = mat[i][j];
        if (r == null) return '<td class="vuota">·</td>';
        const col = coloreCorr(r);
        return `<td style="background:${col.bg};color:${col.testo}" title="${esc(a.simbolo)} e ${esc(b.simbolo)}: ${num(r, 2)} negli ultimi ${FINESTRE[w]}">${num(r, 2)}</td>`;
      }).join("")}</tr>`).join("") + "</tbody>";
    // media delle correlazioni fra altcoin e bitcoin
    const conBtc = mm.filter(m => m !== x.btc).map(m => mat[mm.indexOf(m)][mm.indexOf(x.btc)]).filter(v => v != null);
    const medio = conBtc.length ? conBtc.reduce((s, v) => s + v, 0) / conBtc.length : null;
    $("#cry-matrice-nota").innerHTML = `Correlazione dei rendimenti giornalieri negli ultimi ${FINESTRE[w]}: vicino a 1 si muovono insieme, vicino a 0 in modo indipendente, sotto zero in direzioni opposte.` +
      (medio != null ? ` In media le altcoin hanno una correlazione di <b>${num(medio, 2)}</b> con bitcoin: ${medio > 0.7 ? "tenerne diverse diversifica poco" : medio > 0.4 ? "si muovono in buona parte insieme a bitcoin" : "in questo periodo vanno abbastanza per conto loro"}.` : "");
    graficoMercati();
  }

  function graficoMercati() {
    const x = st.x, box = $("#cry-mercati");
    if (!x.mercati.length) { box.innerHTML = '<p class="empty-note">Mancano i dati dei mercati.</p>'; $("#cry-mercati-legenda").innerHTML = ""; return; }
    const N = x.N;
    let i0 = N;
    for (const mk of x.mercati) { const j = mk.corr.findIndex(v => v != null); if (j >= 0) i0 = Math.min(i0, j); }
    if (i0 >= N - 2) { box.innerHTML = '<p class="empty-note">Storia ancora troppo breve.</p>'; return; }
    const n = N - 1 - i0;
    const W = Math.max(320, box.clientWidth || 900), stretto = W < 600;
    const m = { l: 8, r: stretto ? 40 : 46, t: 10, b: 24 }, h = stretto ? 200 : 240, H = m.t + h + m.b, pw = W - m.l - m.r;
    const X = k => m.l + ((k - i0) / n) * pw;
    const Y = v => m.t + ((1 - v) / 2) * h;
    const root = svg("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", role: "img", "aria-label": "Correlazione a 90 giorni fra bitcoin e i mercati", class: "tocco" });
    for (const v of [-1, -0.5, 0, 0.5, 1]) {
      root.append(svg("line", { x1: m.l, x2: m.l + pw, y1: Y(v), y2: Y(v), class: v === 0 ? "rg-axis" : "rg-grid" }));
      root.append(svg("text", { x: m.l + pw + 6, y: Y(v) + 4, class: "rg-tick" }, num(v, 1)));
    }
    const a0 = Number(x.date[i0].slice(0, 4)) + 1, a1 = Number(x.date[N - 1].slice(0, 4));
    const passo = Math.max(1, Math.ceil((a1 - a0 + 1) / (stretto ? 4 : 9)));
    for (let a = a0; a <= a1; a += passo) {
      const k = x.date.indexOf(`${a}-01-01`);
      if (k < 0) continue;
      root.append(svg("text", { x: X(k), y: H - 6, "text-anchor": "middle", class: "rg-tick" }, String(a)));
    }
    for (const mk of x.mercati) {
      let d = "", prec = null;
      for (let i = i0; i < N; i++) {
        const v = mk.corr[i];
        if (v == null) continue;
        d += `${d && prec != null && i - prec < 10 ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`;
        prec = i;
      }
      root.append(svg("path", { d, fill: "none", stroke: COLORE_MERCATO[mk.t] || "var(--muted)", "stroke-width": mk.t === "QQQ" ? 1.9 : 1.5 }));
    }
    box.innerHTML = "";
    box.append(root);
    cursore(box, root, { W, alto: m.t, basso: m.t + h, da: i0, a: N - 1, X, inverso: px => i0 + ((px - m.l) / pw) * n }, k => {
      // la seduta più vicina con un valore
      const righe = x.mercati.map(mk => {
        let j = k;
        while (j > i0 && mk.corr[j] == null && k - j < 5) j--;
        return mk.corr[j] == null ? "" : `<div class="r"><span><i class="sw dot" style="background:${COLORE_MERCATO[mk.t] || "var(--muted)"}"></i>${esc(mk.nome)}</span><span>${num(mk.corr[j], 2)}</span></div>`;
      }).join("");
      return righe ? `<div class="d">${dataIt(x.date[k])}</div>${righe}` : "";
    });
    $("#cry-mercati-legenda").innerHTML = x.mercati.map(mk => {
      const v = ultimoValore(mk.corr);
      return `<span><i class="sw" style="background:${COLORE_MERCATO[mk.t] || "var(--muted)"}"></i>${esc(mk.nome)} <b>${num(v, 2)}</b>${v != null ? ` <small class="muted">${forza(v)}</small>` : ""}</span>`;
    }).join("");
  }

  // ---------------- vista ----------------

  function disegnaTutto() {
    disegnaKpi();
    disegnaSintesi();
    disegnaTabella();
    disegnaDettaglio();
    disegnaScelta();
    disegnaDopo();
    disegnaRegola();
    disegnaStagioni();
    disegnaCicli();
    disegnaCorrelazioni();
  }

  async function disegna() {
    let d = null;
    try { d = await R.dati.crypto(); } catch (e) { d = null; }
    if (!st.visibile) return;
    const vuoto = !d || !d.monete || !d.monete.length;
    $("#cry-vuoto").hidden = !vuoto;
    $("#cry-corpo").hidden = vuoto;
    if (vuoto) {
      $("#cry-sub").textContent = "I dati non ci sono ancora.";
      return;
    }
    if (!st.x || st.x.d !== d) st.x = prepara(d);
    if (!moneta(st.scelta)) st.scelta = st.x.btc.simbolo;
    if (st.aperta && !moneta(st.aperta)) st.aperta = null;
    $("#cry-sub").textContent = `Chiusura del ${dataIt(d.aggiornato)} (mezzanotte UTC), prezzi in dollari. Le prime ${d.monete.length} per capitalizzazione, stablecoin escluse.`;
    disegnaTutto();
  }

  function apri(sim, scorri) {
    st.aperta = st.aperta === sim ? null : sim;
    try { history.replaceState(null, "", st.aperta ? `#cry/${st.aperta}` : "#cry"); } catch (e) { /* niente */ }
    disegnaTabella();
    disegnaDettaglio();
    R.emit("selezione");
    if (st.aperta && scorri !== false) $("#cry-dettaglio").scrollIntoView({ block: "start", behavior: "smooth" });
  }

  function init() {
    $("#cry-tabella").addEventListener("click", e => {
      const th = e.target.closest("th[data-col]");
      if (th) {
        const col = th.dataset.col;
        st.ordine = { col, dir: st.ordine.col === col ? -st.ordine.dir : (col === "rango" || col === "nome" || col === "stato" ? 1 : -1) };
        R.store.set("cry.ordine", st.ordine);
        disegnaTabella();
        return;
      }
      const tr = e.target.closest("tr[data-s]");
      if (tr) apri(tr.dataset.s);
    });
    $("#cry-tabella").addEventListener("keydown", e => {
      if (e.key !== "Enter") return;
      const tr = e.target.closest("tr[data-s]");
      if (tr) apri(tr.dataset.s);
    });
    $("#cry-dettaglio").addEventListener("click", e => {
      if (e.target.id === "cry-chiudi") { apri(st.aperta, false); return; }
      const b = e.target.closest("#cry-periodo button[data-v]");
      if (b) { st.periodo = Number(b.dataset.v); R.store.set("cry.periodo", st.periodo); disegnaDettaglio(); }
    });
    $("#cry-moneta").addEventListener("click", e => {
      const b = e.target.closest("button[data-s]");
      if (!b) return;
      st.scelta = b.dataset.s;
      R.store.set("cry.moneta", st.scelta);
      disegnaScelta(); disegnaDopo(); disegnaRegola(); disegnaStagioni();
    });
    $("#cry-orizzonte").addEventListener("click", e => {
      const b = e.target.closest("button[data-v]");
      if (!b) return;
      st.orizzonte = Number(b.dataset.v);
      R.store.set("cry.orizzonte", st.orizzonte);
      disegnaDopo();
    });
    $("#cry-finestra").addEventListener("click", e => {
      const b = e.target.closest("button[data-v]");
      if (!b) return;
      st.finestra = Number(b.dataset.v);
      R.store.set("cry.finestra", st.finestra);
      disegnaCorrelazioni();
    });
    R.on("tema", () => { if (st.visibile && st.x) disegnaTutto(); });
    window.addEventListener("resize", R.debounce(() => {
      if (!st.visibile || !st.x) return;
      if (st.aperta) disegnaDettaglio();
      disegnaCicli();
      graficoMercati();
    }, 200));
  }

  async function mostra(param) {
    st.visibile = true;
    document.title = "Crypto · Radar Settori";
    if (param) st.aperta = String(param).toUpperCase();
    await disegna();
    if (param && st.aperta && moneta(st.aperta)) $("#cry-dettaglio").scrollIntoView({ block: "start" });
  }

  function nascondi() { st.visibile = false; }

  function tasto(e) {
    if (e.key === "Escape" && st.aperta) { apri(st.aperta, false); return true; }
    return false;
  }

  // ---------------- testo per «Copia per Claude» ----------------

  function contesto() {
    const x = st.x;
    if (!x) return "## Pagina aperta: Crypto\nI dati crypto non ci sono ancora.";
    const t = x.N - 1, b = x.btc, o = b.a.oggi;
    const testo = html => html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
    const out = ["## Pagina aperta: Crypto",
      `Bitcoin e le prime ${x.monete.length} criptovalute per capitalizzazione (classifica ${x.d.fonte_classifica}, stablecoin escluse). Prezzi in dollari (Yahoo Finance), chiusura del ${dataIt(x.d.aggiornato)} a mezzanotte UTC. Medie su giorni di calendario; media 200 settimane = 1400 giorni.`,
      "### Cosa dicono i numeri", ...frasi().map(f => "- " + testo(f.html)),
      "### Bitcoin",
      `Prezzo ${cifre(o.prezzo)} $; 7 giorni ${pct(o.g7 * 100, 1)}, 30 giorni ${pct(o.g30 * 100, 1)}, 90 giorni ${pct(o.g90 * 100, 1)}, 1 anno ${pct(o.g365 * 100, 1)}, da inizio anno ${pct(o.ytd * 100, 1)}.`,
      `Sulla media 200 ${pct(o.vs200 * 100, 1)} (${o.striscia ? `${o.striscia.sopra ? "sopra" : "sotto"} da ${o.striscia.giorni} giorni` : "—"}), sulla media 50 ${pct(o.vs50 * 100, 1)}, sulla media 200 settimane ${pct(o.vs1400 * 100, 1)} (media a ${cifre(o.m1400)} $). Multiplo di Mayer ${num(o.mayer, 2)} (più alto del ${num(o.mayerPercentile, 0)}% dei giorni). Dal massimo ${pct(o.dd * 100, 1)} (massimo ${o.ath ? `${cifre(o.ath.prezzo)} $ del ${dataIt(o.ath.data)}` : "—"}). Volatilità 30 giorni ${num(o.vol30 * 100, 0)}%.`,
      x.paura && x.paura[t] != null ? `Fear & Greed: ${x.paura[t]} (${etichettaPaura(x.paura[t])}); 30 giorni fa ${x.paura[Math.max(0, t - 30)] ?? "—"}.` : "",
      x.d.dominanza ? `Quota di bitcoin sul valore di tutte le crypto: ${num(x.d.dominanza.btc, 1)}%${x.d.dominanza.eth != null ? ` (ethereum ${num(x.d.dominanza.eth, 1)}%)` : ""}.` : "",
      "### Le prime per capitalizzazione",
      "moneta | rango | capitalizzazione | prezzo $ | 1 giorno | 7 giorni | 30 giorni | 90 giorni | da inizio anno | sulla media 200 | giorni dalla stessa parte | tendenza | dal massimo | contro BTC 90 giorni | rapporto con BTC sopra la sua media 200 | beta su BTC 90 giorni | correlazione con BTC 90 giorni | volatilità 30 giorni",
      ...x.monete.map(m => {
        const q = m.a.oggi, v = m.vsBtc;
        return [m.simbolo + " " + m.nome, m.rango ?? "—", miliardi(m.cap), cifre(q.prezzo), pct(q.g1 * 100, 1), pct(q.g7 * 100, 1), pct(q.g30 * 100, 1), pct(q.g90 * 100, 1), q.ytd == null ? "—" : pct(q.ytd * 100, 1),
          q.vs200 == null ? "—" : pct(q.vs200 * 100, 1), q.striscia ? `${q.striscia.sopra ? "sopra" : "sotto"} ${q.striscia.giorni}` : "—", q.stato ? C.STATI[q.stato] : "—", pct(q.dd * 100, 1),
          v ? pct(v.rel90 * 100, 1) : "—", v ? (v.sopraMedia == null ? "—" : v.sopraMedia ? "sì" : "no") : "—", v && v.beta90 != null ? num(v.beta90, 2) : "—", v && v.corr90 != null ? num(v.corr90, 2) : "—", q.vol30 == null ? "—" : num(q.vol30 * 100, 0) + "%"].join(" | ");
      }),
    ];
    const m = moneta(st.scelta) || b, h = st.orizzonte;
    out.push(`### Cosa è successo dopo ${ORIZZONTI[h]} (storia di ${m.simbolo} dal ${dataIt(x.date[m.a.primo])})`, "situazione | giorni | episodi | mediana | volte in rialzo | 10° percentile | 90° percentile");
    const cond = condizioni(m);
    for (const cr of CRITERI) {
      if (cr.k === "paura" && !x.paura) continue;
      const stat = dopo(m, cr.k, h);
      for (const k of ORDINE_GRUPPI[cr.k]) {
        const s = stat[k];
        if (!s) continue;
        out.push(`${cr.titolo}: ${NOMI_GRUPPO[k]}${cond[cr.k][t] === k ? " (oggi)" : ""} | ${s.casi} | ${s.episodi} | ${pct(s.mediana * 100, 1)} | ${volte(s.positivi)} | ${pct(s.p10 * 100, 0)} | ${pct(s.p90 * 100, 0)}`);
      }
    }
    out.push("### La regola della media 200 (investito solo dopo una chiusura sopra la media 200, senza costi)", "moneta | dal | sempre investito: all'anno, calo massimo | regola: all'anno, calo massimo, tempo investito, entrate all'anno");
    for (const z of x.monete) {
      const r = regola(z);
      if (r) out.push(`${z.simbolo} | ${dataIt(x.date[r.da])} | ${pct(r.sempre.cagr * 100, 0)}, ${pct(r.sempre.maxdd * 100, 0)} | ${pct(r.regola.cagr * 100, 0)}, ${pct(r.regola.maxdd * 100, 0)}, ${volte(r.regola.tempo)}, ${num(r.regola.entrateAnno, 1)}`);
    }
    const sm = mensili(m);
    out.push(`### Stagionalità di ${m.simbolo} (rendimento mensile; il mese in corso non entra nelle statistiche)`, "mese | media | mediana | anni positivi");
    sm.riepilogo.forEach((r, k) => { if (r) out.push(`${MESI_LUNGHI[k]} | ${pct(r.media * 100, 1)} | ${pct(r.mediana * 100, 1)} | ${r.positivi}/${r.casi}`); });
    out.push("Rendimenti per anno: " + sm.anni.map(a => `${a} ${sm.tab[a].anno == null ? "—" : pct(sm.tab[a].anno * 100, 0)}`).join(", "));
    const cc = cicli();
    if (cc.length) {
      out.push("### Cicli dell'halving di bitcoin", "halving | prezzo | massimo del ciclo (giorno, multiplo, data) | minimo dopo il massimo (giorno, calo, data)");
      for (const c of cc) out.push(`${dataIt(c.data)}${c.completo ? "" : " (in corso, oggi giorno " + c.giorni + ")"} | ${cifre(b.a.p[c.i])} $ | giorno ${c.massimo.giorno}, ×${num(c.massimo.multiplo, 1)}, ${dataIt(c.massimo.data)} | giorno ${c.minimo.giorno}, ${pct(c.minimo.calo * 100, 0)}, ${dataIt(c.minimo.data)}`);
    }
    if (x.mercati.length) out.push("### Correlazione di bitcoin con i mercati (90 giorni, sedute di borsa)", x.mercati.map(mk => `${mk.nome}: ${num(ultimoValore(mk.corr), 2)}`).join("; "));
    const ap = moneta(st.aperta);
    if (ap) {
      out.push(`### Moneta aperta nel dettaglio: ${ap.simbolo}. Chiusure a fine mese (prezzo, media 200)`);
      const p = ap.a.p, date = x.date;
      for (let i = Math.max(ap.a.primo, p.length - 1 - (st.periodo || p.length)); i < p.length; i++) {
        if (p[i] != null && (i === p.length - 1 || date[i + 1].slice(0, 7) !== date[i].slice(0, 7))) out.push(`${dataIt(date[i])}: ${cifre(p[i])} $ (media 200 ${cifre(ap.a.m200[i])} $)`);
      }
    }
    return out.filter(Boolean).join("\n");
  }

  R.viste.cry = { init, mostra, nascondi, tasto, contesto };
})();
