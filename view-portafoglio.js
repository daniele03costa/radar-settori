/*
 * Radar Settori — il portafoglio, in cima alla vista «I miei titoli».
 * Legge portafoglio.txt (anche protetto con password), porta tutto in euro e mostra valore e risultato,
 * composizione (tipo, valuta, area, settore), rischio (beta e volatilità sull'ACWI, calo massimo, contributo
 * di ogni titolo al rischio, correlazioni) e l'andamento simulato della composizione di oggi contro l'ACWI.
 * Il file si crea e si modifica da una finestra del sito: il testo si cifra nel browser con la password e su
 * GitHub arriva solo la versione protetta. I calcoli stanno in portafoglio-calcoli.js (window.Portafoglio).
 */
(function () {
  "use strict";

  const R = window.Radar, P = window.Portafoglio;
  const { $, num, pct, esc, svg, dataIt, cls } = R;
  const PERIODI = [[63, "3 mesi"], [252, "1 anno"], [756, "3 anni"]];
  const CHIAVE_PW = "radar.pf.pw";
  const INTESTAZIONE_FILE = `# Il mio portafoglio: una riga per titolo
#   ticker   quantità   prezzo medio di carico   [valuta del carico]   [data del primo acquisto]   [nota]
# Il ticker è quello di Yahoo Finance (MSFT, ENEL.MI, IUSQ.DE, BTC-EUR); le azioni europee si aggiungono dalla zona Europa (pagina Azioni).
# Decimali con la virgola o con il punto, senza separatori delle migliaia.
# Se hai comprato in euro un titolo che quota in un'altra valuta (per esempio su Trade Republic) scrivi EUR dopo il prezzo.
# La liquidità: LIQUIDITA importo (in euro), oppure LIQUIDITA USD importo.
`;
  const ESEMPIO = `IUSQ.DE    100    80,00
MSFT       10     400,00   EUR
LIQUIDITA  2000
`;
  const MODELLO = INTESTAZIONE_FILE + "# Esempio, da sostituire con i tuoi titoli:\n" + ESEMPIO;

  const st = {
    testo: null,          // contenuto di portafoglio.txt (null se il file non c'è)
    caricato: false,      // il file è già stato letto almeno una volta
    chiaro: null,         // testo in chiaro (dopo la password, se protetto)
    cifrato: false,
    file: null,           // righe lette
    a: null,              // analisi
    dati: null, extra: null,
    datiCalcolo: null,    // i prezzi della lista più quelli presi dalle altre viste (azioni europee)
    periodo: R.store.get("pf.periodo", 252),
    ordine: R.store.get("pf.ordine", { col: "valore", dir: -1 }),
  };

  // ---------------- formati ----------------

  const euro = (v, d) => (v == null || !isFinite(v) ? "—" : `${num(v, d != null ? d : Math.abs(v) >= 1000 ? 0 : 2)} €`);
  const euroSegno = v => (v == null || !isFinite(v) ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${num(Math.abs(v), Math.abs(v) >= 1000 ? 0 : 2)} €`);
  const p100 = (v, d = 1) => (v == null || !isFinite(v) ? "—" : pct(v * 100, d));
  const quota = (v, d = 0) => (v == null || !isFinite(v) ? "—" : `${num(v * 100, d)}%`);
  const cifre = v => (v == null ? "—" : v >= 1000 ? num(v, 0) : v >= 100 ? num(v, 1) : v >= 1 ? num(v, 2) : num(v, 4));
  const SIMBOLI = { USD: "$", EUR: "€", GBp: "p", GBP: "£", CHF: "CHF", DKK: "DKK", SEK: "SEK", NOK: "NOK", CAD: "C$", JPY: "¥", HKD: "HK$", AUD: "A$" };
  // numero come va scritto nel file: virgola per i decimali, niente separatori delle migliaia
  const numeroFile = v => String(Math.round(v * 1e6) / 1e6).replace(".", ",");

  // ---------------- lettura ----------------

  async function caricaTesto() {
    try {
      const r = await fetch("portafoglio.txt", { cache: "no-cache" });
      return r.ok ? await r.text() : null;
    } catch (e) { return null; }
  }

  function passwordSalvata() {
    try { return localStorage.getItem(CHIAVE_PW) || sessionStorage.getItem(CHIAVE_PW); } catch (e) { return null; }
  }
  function salvaPassword(pw, ricorda) {
    try {
      localStorage.removeItem(CHIAVE_PW); sessionStorage.removeItem(CHIAVE_PW);
      (ricorda ? localStorage : sessionStorage).setItem(CHIAVE_PW, pw);
    } catch (e) { /* niente */ }
  }

  // dettagli di ogni titolo: da Yahoo (nel file dei prezzi), dall'elenco S&P 500 o da quello europeo
  function titoliPerCalcolo(dati, extra) {
    const out = {};
    const nomiSettori = Object.fromEntries(((R.meta && R.meta.settori) || []).map(s => [s.etf, s.nome]));
    const PAESE_SUFF = { MI: "Italia", DE: "Germania", F: "Germania", PA: "Francia", AS: "Paesi Bassi", MC: "Spagna", BR: "Belgio",
      LS: "Portogallo", VI: "Austria", HE: "Finlandia", IR: "Irlanda", L: "Regno Unito", SW: "Svizzera", CO: "Danimarca", ST: "Svezia",
      OL: "Norvegia", TO: "Canada", T: "Giappone", HK: "Hong Kong", AX: "Australia" };
    for (const x of dati.titoli) {
      const sp = extra.mappaSp && extra.mappaSp.get(x.t);
      const eu = extra.mappaEu && extra.mappaEu.get(x.t);
      const suff = x.t.includes(".") ? x.t.split(".").pop() : "";
      out[x.t] = {
        date: x.date, prezzi: x.prezzi, valuta: x.valuta, mercato: x.mercato, nome: x.nome || (sp && sp.nome) || (eu && eu.nome) || x.t,
        tipo: x.tipo || (x.mercato === "crypto" ? "Crypto" : sp || eu ? "Azione" : /\bETF\b|UCITS|iShares|Xtrackers|Vanguard|Amundi|SPDR|Lyxor/i.test(x.nome || x.nome_yahoo || "") ? "ETF" : "Azione"),
        settore: x.settore || (sp && nomiSettori[sp.etf]) || (eu && eu.settore) || null,
        paese: x.paese || (sp ? "Stati Uniti" : null) || (eu && eu.paese) || PAESE_SUFF[suff] || (x.mercato === "usa" ? "Stati Uniti" : null),
      };
    }
    return out;
  }

  // i titoli del portafoglio che non sono in prezzi_miei.json (per esempio perché il file è protetto e
  // l'aggiornamento automatico non lo legge): si prendono dai termini di confronto e dalle azioni europee
  async function completaPrezzi(dati, posizioni) {
    const presenti = new Set(dati.titoli.map(x => x.t));
    const mancano = new Set(posizioni.map(p => p.t).filter(t => !presenti.has(t)));
    if (!mancano.size) return dati;
    const extra = [];
    let cambi = dati.cambi || {};
    for (const b of Object.values(dati.confronti || {})) {
      if (b && b.t && mancano.has(b.t)) { extra.push(Object.assign({ nome: "", dal_portafoglio: true }, b)); mancano.delete(b.t); }
    }
    if (mancano.size) {
      try {
        const eu = await R.dati.europa();
        cambi = Object.assign({}, eu.cambi || {}, cambi);         // sterline e franchi anche se la lista non li ha
        for (const x of eu.titoli) {
          if (!mancano.has(x.t)) continue;
          const date = [], prezzi = [];
          x.prezzi.forEach((v, k) => { if (v != null && eu.date[x.i0 + k]) { date.push(eu.date[x.i0 + k]); prezzi.push(v); } });
          if (!prezzi.length) continue;
          extra.push({
            t: x.t, nome: x.nome, date, prezzi, mercato: "europa", valuta: x.valuta,
            tipo: "Azione", settore: x.settore, paese: x.paese, dal_portafoglio: true, daEuropa: true,
          });
          mancano.delete(x.t);
        }
      } catch (e) { /* senza il file europeo restano senza prezzi */ }
    }
    return extra.length ? Object.assign({}, dati, { titoli: dati.titoli.concat(extra), cambi }) : dati;
  }

  // i ticker del file che l'aggiornamento automatico non conosce: con il file protetto vanno anche in miei-titoli.txt
  async function tickerSenzaPrezzi(testo) {
    const noti = new Set(["SPY", "IUSQ.DE"]);
    try { (await R.dati.listaMiei()).forEach(x => noti.add(x.t)); } catch (e) { /* niente */ }
    try { (await R.dati.europaLista()).titoli.forEach(x => noti.add(x.t)); } catch (e) { /* niente */ }
    return P.leggi(testo).posizioni.map(p => p.t).filter(t => !noti.has(t));
  }

  function calcola() {
    const f = st.file, dati = st.datiCalcolo || st.dati;
    st.a = f && dati ? P.analizza({
      posizioni: f.posizioni, liquidita: f.liquidita, titoli: titoliPerCalcolo(dati, st.extra), cambi: dati.cambi || {},
      bench: dati.confronti && dati.confronti.europa ? { date: dati.confronti.europa.date, prezzi: dati.confronti.europa.prezzi } : null,
    }) : null;
  }

  // ---------------- tessere e sintesi ----------------

  function disegnaKpi() {
    const a = st.a, r = a.rischio;
    const tile = (k, l, v, s, titolo) => `<div class="kpi"${k ? ` style="--k:${k}"` : ""}${titolo ? ` title="${esc(titolo)}"` : ""}><div class="l">${k ? "<i></i>" : ""}${l}</div><div class="v">${v}</div><div class="s">${s}</div></div>`;
    $("#pf-kpi").innerHTML = [
      tile("var(--price)", "Valore", euro(a.totale, 0), `oggi <span class="${cls((a.oggiPct || 0) * 100)}">${euroSegno(a.oggi)} (${p100(a.oggiPct)})</span>`),
      tile(a.risultato >= 0 ? "var(--pos)" : "var(--neg)", "Risultato sul carico", `<span class="${cls((a.risultato || 0))}">${euroSegno(a.risultato)}</span>`,
        `${p100(a.risultatoPct)} su ${euro(a.costo, 0)} investiti`),
      tile("var(--soglia)", "Beta sull'ACWI", r.beta == null ? "—" : num(r.beta, 2), r.corrBench == null ? "servono più dati" : `correlazione ${num(r.corrBench, 2)} · ultimo anno`,
        "Di quanto si è mosso in media il portafoglio quando l'azionario mondiale (ACWI in euro, il tuo PAC) si è mosso dell'1%"),
      tile("var(--q-indebolimento)", "Volatilità", r.vol == null ? "—" : quota(r.vol), r.volBench == null ? "—" : `ACWI ${quota(r.volBench)} · ultimo anno`,
        "Oscillazione annua tipica del valore; più alta vuol dire movimenti più ampi, in su e in giù"),
      tile("var(--neg)", "Calo massimo 1 anno", p100(r.caloAnno.calo), r.caloAnnoBench ? `ACWI ${p100(r.caloAnnoBench.calo)}` : "—",
        "Il ribasso più ampio da un massimo nell'ultimo anno, con la composizione di oggi"),
      tile("var(--b50)", "Concentrazione", r.nEffettivo == null ? "—" : `${num(r.nEffettivo, 1)}<small> titoli</small>`,
        r.primo ? `il primo pesa ${R.art("il", quota(r.primo.peso))} (${esc(r.primo.t)})` : "—",
        "È come avere questo numero di titoli con lo stesso peso: più è basso, più il risultato dipende da pochi nomi"),
      tile("var(--faint)", "Liquidità", quota(a.totale ? a.cassa / a.totale : 0), euro(a.cassa, 0)),
      tile("var(--neg)", "Un giorno su 20", r.var95 == null ? "—" : `−${euro(r.var95, 0)}`, "perdita superata nel 5% dei giorni",
        "Stima storica: nell'ultimo anno, con la composizione di oggi, 1 giorno su 20 il portafoglio avrebbe perso più di così"),
    ].join("");
  }

  function frasi() {
    const a = st.a, r = a.rischio, out = [];
    const rb = a.rendimenti.bench, rp = a.rendimenti.portafoglio;
    out.push({ c: "var(--price)", html: `Il portafoglio vale <b>${euro(a.totale, 0)}</b>: ${euro(a.investito, 0)} in ${a.righe.length} ${a.righe.length === 1 ? "titolo" : "titoli"} e ${euro(a.cassa, 0)} di liquidità. ` +
      (a.risultato != null ? `Sul prezzo di carico sei ${a.risultato >= 0 ? "in guadagno" : "in perdita"} di <b>${euroSegno(a.risultato)}</b> (${p100(a.risultatoPct)}).` : "") });
    if (r.primo) {
      out.push({ c: "var(--b50)", html: `Il titolo più pesante è <b>${esc(r.primo.t)}</b> con ${R.art("il", quota(r.primo.peso))} del totale; i primi tre fanno ${R.art("il", quota(r.primiTre))}. ` +
        (r.nEffettivo != null ? `È come avere <b>${num(r.nEffettivo, 1)} titoli</b> di peso uguale${r.nEffettivo < 5 ? ": il risultato dipende da pochi nomi" : r.nEffettivo >= 10 ? ": una buona dispersione" : ""}.` : "") });
    }
    if (r.beta != null) {
      out.push({ c: "var(--soglia)", html: `Beta <b>${num(r.beta, 2)}</b> sull'ACWI in euro (il tuo PAC): quando l'azionario mondiale si è mosso dell'1%, il portafoglio si è mosso in media ${R.art("del", num(r.beta, 1) + "%")}${r.beta > 1.15 ? ", quindi amplifica i movimenti del mercato" : r.beta < 0.85 ? ", quindi li attutisce" : ", circa come il mercato"}. ` +
        (r.vol != null && r.volBench != null ? `Volatilità ${quota(r.vol)} contro ${R.art("il", quota(r.volBench))} dell'ACWI.` : "") });
    }
    const rischiosi = a.righe.filter(x => x.rischio != null && x.peso).map(x => ({ x, leva: x.rischio / x.peso })).sort((u, v) => v.x.rischio - u.x.rischio);
    if (rischiosi.length > 1) {
      const top = rischiosi[0].x;
      out.push({ c: "var(--q-indebolimento)", html: `Chi pesa di più sul rischio è <b>${esc(top.t)}</b>: ${R.art("il", quota(top.rischio))} del rischio totale con ${R.art("il", quota(top.peso))} del valore.` +
        (r.corrMedia != null ? ` La correlazione media fra i titoli è ${num(r.corrMedia, 2)}${r.corrMedia > 0.6 ? ": si muovono molto insieme, la diversificazione è bassa" : r.corrMedia < 0.3 ? ": si muovono abbastanza per conto loro, buona diversificazione" : ": diversificazione media"}.` : "") });
    }
    const val = a.composizione.valuta.filter(g => g.nome !== "Liquidità");
    if (val.length) out.push({ c: "var(--b200)", html: `Valute: ${a.composizione.valuta.slice(0, 4).map(g => `${g.nome.toLowerCase()} ${quota(g.peso)}`).join(", ")}. La parte non in euro si muove anche con i cambi.` });
    const sotto = a.righe.filter(x => x.vs200 != null && x.vs200 < 0);
    if (a.righe.some(x => x.vs200 != null)) {
      const peso = sotto.reduce((s, x) => s + (x.peso || 0), 0);
      out.push({ c: sotto.length ? "var(--neg)" : "var(--pos)", html: sotto.length
        ? `Sotto la propria media 200: <b>${sotto.map(x => esc(x.t)).join(", ")}</b>, ${R.art("il", quota(peso))} del portafoglio.`
        : "Tutti i titoli sono sopra la propria media 200." });
    }
    if (rp && rb && rp.a1 != null && rb.a1 != null) {
      out.push({ c: "var(--faint)", html: `Con la composizione di oggi, nell'ultimo anno il portafoglio avrebbe fatto <b>${p100(rp.a1)}</b> contro ${p100(rb.a1)} dell'ACWI, con un calo massimo ${R.art("del", p100(r.caloAnno.calo, 0))} (ACWI ${p100(r.caloAnnoBench && r.caloAnnoBench.calo, 0)}).` });
    }
    return out;
  }

  function disegnaSintesi() {
    const a = st.a;
    $("#pf-sintesi").innerHTML = `
      <div class="card-title"><h2>Come siamo messi</h2><span class="muted small-inline">prezzi fino al ${dataIt(a.calendario[a.calendario.length - 1])}, tutto in euro</span></div>
      <ul class="novita-lista">${frasi().map(f => `<li><i style="--c:${f.c}"></i><span>${f.html}</span></li>`).join("")}</ul>
      <p class="novita-piede">L'andamento passato è una simulazione con le quantità di oggi; il rischio è misurato sull'ultimo anno. Sono numeri per capire, non consigli di investimento.</p>`;
  }

  // ---------------- posizioni ----------------

  function disegnaPosizioni() {
    const a = st.a, { col, dir } = st.ordine;
    const righe = a.righe.slice().sort((u, v) => {
      const x = col === "t" ? u.t : u[col], y = col === "t" ? v.t : v[col];
      if (typeof x === "string") return dir * x.localeCompare(y);
      if (x == null) return 1;
      if (y == null) return -1;
      return dir * (x - y);
    });
    const th = (k, lab, left, titolo) => `<th class="sortable${left ? " l" : ""}" data-col="${k}" aria-sort="${col === k ? (dir > 0 ? "ascending" : "descending") : "none"}"${titolo ? ` title="${esc(titolo)}"` : ""}>${lab}</th>`;
    const oggi = x => { const e = x.eur, n = e.length; return e[n - 1] != null && e[n - 2] ? e[n - 1] / e[n - 2] - 1 : null; };
    $("#pf-posizioni").innerHTML = `<thead><tr>${th("t", "Titolo", true)}<th>Quantità</th>${th("prezzo", "Prezzo")}${th("valore", "Valore")}${th("risultato", "Risultato")}` +
      `${th("vs200", "Media 200", false, "Distanza dalla propria media a 200 sedute")}${th("beta", "Beta", false, "Sull'ACWI in euro, ultimo anno")}${th("rischio", "Quota del rischio", false, "Quanta parte dell'oscillazione del portafoglio viene da questo titolo")}</tr></thead><tbody>` +
      righe.map(x => {
        const g = oggi(x);
        const sotto = [x.tipo, x.tipo === "Azione" ? x.settore : null, x.tipo === "Azione" ? x.paese : null].filter(Boolean).join(" · ");
        return `<tr class="clic" data-t="${esc(x.t)}" tabindex="0">
          <td class="l"><span class="tit-nome"><b>${esc(x.t)}</b>${x.nome && x.nome !== x.t ? ` <span class="muted">${esc(x.nome)}</span>` : ""}</span><small class="sub-line">${esc(sotto)}</small></td>
          <td>${num(x.quantita, x.quantita % 1 ? 4 : 0)}<small class="sub-line">carico ${cifre(x.carico)} ${SIMBOLI[x.valutaCarico] || x.valutaCarico}</small></td>
          <td>${cifre(x.prezzo)}<span class="valuta">${SIMBOLI[x.valuta] || x.valuta}</span><small class="sub-line"><span class="${cls((g || 0) * 100)}">${p100(g)}</span> oggi in €</small></td>
          <td><b>${euro(x.valore, 0)}</b><small class="sub-line">${quota(x.peso, 1)} del totale</small></td>
          <td><span class="${cls(x.risultato || 0)}">${euroSegno(x.risultato)}</span><small class="sub-line">${p100(x.risultatoPct)}${x.risultatoLocale != null && x.valuta !== "EUR" && x.risultatoPct != null && Math.abs(x.risultatoLocale - x.risultatoPct) > 0.002 ? ` · ${p100(x.risultatoLocale)} in ${x.valuta === "GBp" ? "GBP" : x.valuta}` : ""}</small></td>
          <td class="${cls((x.vs200 || 0) * 100)}">${p100(x.vs200)}</td>
          <td>${x.beta == null ? "—" : num(x.beta, 2)}</td>
          <td><span class="pf-rischio"><i style="width:${Math.min(100, Math.max(0, (x.rischio || 0) * 100))}%"></i></span>${quota(x.rischio)}<small class="sub-line">peso ${quota(x.peso)}</small></td>
        </tr>`;
      }).join("") + "</tbody>";
    const avvisi = [];
    if (a.senzaPrezzi.length) {
      const eu = st.extra && st.extra.mappaEu;
      const europee = a.senzaPrezzi.filter(p => eu && eu.has(p.t)), altri = a.senzaPrezzi.filter(p => !(eu && eu.has(p.t)));
      const elenco = arr => `<b>${arr.map(p => esc(p.t)).join(", ")}</b>`;
      let testo = `Senza prezzi, per ora fuori dai conti: ${elenco(a.senzaPrezzi)}.`;
      if (europee.length) testo += ` ${europee.length === 1 ? "L'azione europea arriva" : "Le azioni europee arrivano"} con il prossimo aggiornamento dei dati della zona Europa.`;
      if (altri.length) {
        testo += st.cifrato
          ? ` Il file è protetto e l'aggiornamento automatico non lo legge: scrivi ${elenco(altri)} anche in <a class="linkish" href="${esc(R.github("miei-titoli.txt").modifica)}" target="_blank" rel="noopener">miei-titoli.txt</a> (una riga per ticker), poi aspetta il prossimo aggiornamento.`
          : " Arrivano con il prossimo aggiornamento; se restano senza, controlla il ticker su Yahoo Finance.";
      }
      avvisi.push(testo);
    }
    if (st.file.errori.length) avvisi.push(`Righe non capite: ${st.file.errori.map(e => `riga ${e.riga} (${esc(e.motivo)})`).join("; ")}.`);
    $("#pf-nota").innerHTML = `Valori in euro con i cambi dell'ultima chiusura; il carico di un titolo in valuta estera è al cambio del giorno d'acquisto se nel file c'è la data, altrimenti a quello di oggi. Clic su una riga per il grafico del titolo.` +
      (avvisi.length ? `<br>${avvisi.join("<br>")}` : "");
  }

  // ---------------- composizione e rischio ----------------

  const COLORI_GRUPPO = ["var(--soglia)", "var(--b200)", "var(--q-indebolimento)", "var(--b50)", "var(--q-leader)", "var(--q-ritardo)", "var(--faint)"];

  function barre(titolo, gruppi) {
    const righe = gruppi.filter(g => Math.abs(g.peso) >= 0.0005);
    return `<div class="pf-gruppo"><h3>${titolo}</h3>` + righe.map((g, k) =>
      `<div class="pf-barra" title="${esc(g.nome)}: ${euro(g.valore, 0)}"><span class="n">${esc(g.nome)}</span><span class="b"><i style="width:${Math.min(100, Math.max(0, g.peso * 100))}%;background:${g.nome === "Liquidità" ? "var(--faint)" : COLORI_GRUPPO[k % COLORI_GRUPPO.length]}"></i></span><span class="v">${quota(g.peso)}</span></div>`).join("") + "</div>";
  }

  function disegnaComposizione() {
    const c = st.a.composizione;
    $("#pf-composizione").innerHTML = `<div class="card-title"><h2>Composizione</h2><span class="muted small-inline">in percentuale del valore</span></div>
      <div class="pf-gruppi">${barre("Tipo", c.tipo)}${barre("Valuta", c.valuta)}${barre("Area", c.area)}${barre("Settore", c.settore)}</div>
      <p class="small">Gli ETF e i fondi contano come un blocco a parte: dentro sono già diversificati (l'ACWI, per esempio, ha migliaia di titoli di tutto il mondo).</p>`;
  }

  function disegnaRischio() {
    const a = st.a, r = a.rischio;
    const righe = a.righe.filter(x => x.peso).sort((u, v) => (v.rischio || 0) - (u.rischio || 0));
    const max = Math.max(0.01, ...righe.map(x => Math.max(Math.abs(x.peso || 0), Math.abs(x.rischio || 0))));
    $("#pf-rischio").innerHTML = `<div class="card-title"><h2>Peso e rischio</h2><span class="muted small-inline">ultimo anno</span></div>
      <p class="sub">Per ogni titolo, quanto pesa sul valore e quanto sull'oscillazione del portafoglio: se la seconda barra è molto più lunga, quel titolo porta più rischio di quanto pesi.</p>
      <div class="pf-coppie">${righe.map(x => `<div class="pf-coppia"><span class="n"><b>${esc(x.t)}</b></span>
        <span class="b"><i class="peso" style="width:${(Math.abs(x.peso || 0) / max) * 100}%"></i><i class="risc" style="width:${(Math.abs(x.rischio || 0) / max) * 100}%"></i></span>
        <span class="v">${quota(x.peso)} <small>→</small> ${quota(x.rischio)}</span></div>`).join("")}</div>
      <div class="legend"><span><i class="sw box" style="background:var(--soglia)"></i>peso sul valore</span><span><i class="sw box" style="background:var(--q-indebolimento)"></i>quota del rischio</span></div>
      <div class="pf-dati">
        <div><span>Correlazione media fra i titoli</span><b>${r.corrMedia == null ? "—" : num(r.corrMedia, 2)}</b></div>
        <div title="Somma delle volatilità dei titoli pesate, divisa per la volatilità del portafoglio: sopra 1 vuol dire che i titoli si compensano"><span>Indice di diversificazione</span><b>${r.diversificazione == null ? "—" : num(r.diversificazione, 2)}</b></div>
        <div title="Con la composizione di oggi, su tutta la storia in cui ci sono i prezzi di tutti i titoli"><span>Calo massimo dal ${dataIt(a.calendario[a.inizio])}</span><b>${p100(r.caloTutto.calo)}</b></div>
        <div><span>Un giorno su 20 si perde più di</span><b>${r.var95 == null ? "—" : euro(r.var95, 0)}</b></div>
      </div>`;
  }

  // ---------------- andamento ----------------

  function disegnaAndamento() {
    const a = st.a, box = $("#pf-andamento");
    $("#pf-periodo").innerHTML = PERIODI.map(([k, l]) => `<button type="button" data-v="${k}" aria-pressed="${k === st.periodo}">${l}</button>`).join("");
    const N = a.calendario.length, v = a.serie.valore, b = a.serie.bench;
    const i0 = Math.max(a.inizio, N - 1 - st.periodo), n = N - 1 - i0;
    if (n < 5) { box.innerHTML = '<p class="empty-note">Storia ancora troppo breve.</p>'; return; }
    const W = Math.max(320, box.clientWidth || 900), stretto = W < 600;
    const m = { l: 8, r: stretto ? 46 : 56, t: 10, b: 24 }, h1 = stretto ? 200 : 250, gap = 26, h2 = stretto ? 70 : 90;
    const H = m.t + h1 + gap + h2 + m.b, pw = W - m.l - m.r;
    const X = k => m.l + ((k - i0) / n) * pw;
    const base = v[i0], baseB = b && b[i0] ? b[i0] : null;
    const sp = v.map(x => (x == null ? null : (x / base) * 100));
    const sb = b && baseB ? b.map(x => (x == null ? null : (x / baseB) * 100)) : null;
    let lo = Infinity, hi = -Infinity;
    for (let i = i0; i < N; i++) for (const s of [sp, sb]) if (s && s[i] != null) { lo = Math.min(lo, s[i]); hi = Math.max(hi, s[i]); }
    const pad = (hi - lo) * 0.08 || 1; lo -= pad; hi += pad;
    const Y = x => m.t + ((hi - x) / (hi - lo)) * h1;
    const dd = s => { let mx = -Infinity; return s.map(x => { if (x == null) return null; mx = Math.max(mx, x); return (x / mx - 1) * 100; }); };
    const ddp = dd(sp.slice(i0)), ddb = sb ? dd(sb.slice(i0)) : null;
    let dlo = Math.min(-1, ...ddp.filter(x => x != null), ...(ddb || []).filter(x => x != null));
    dlo *= 1.1;
    const y2 = m.t + h1 + gap;
    const Y2 = x => y2 + (x / dlo) * h2;
    const root = svg("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", role: "img", "aria-label": "Andamento del portafoglio con la composizione di oggi contro l'ACWI", class: "tocco" });
    const c = R.colori();
    const passo = (() => { const span = hi - lo, e = Math.pow(10, Math.floor(Math.log10(span / 4))); return [1, 2, 2.5, 5, 10].map(k => k * e).find(s => span / s <= 6) || e * 10; })();
    for (let y = Math.ceil(lo / passo) * passo; y <= hi; y += passo) {
      root.append(svg("line", { x1: m.l, x2: m.l + pw, y1: Y(y), y2: Y(y), class: Math.abs(y - 100) < 1e-9 ? "rg-axis" : "rg-grid" }));
      root.append(svg("text", { x: m.l + pw + 6, y: Y(y) + 4, class: "rg-tick" }, num(y, passo < 1 ? 1 : 0)));
    }
    const passoDate = Math.max(1, Math.round(n / (stretto ? 3 : 6)));
    for (let k = i0 + Math.round(passoDate / 2); k < N - passoDate / 3; k += passoDate) root.append(svg("text", { x: X(k), y: H - 6, "text-anchor": "middle", class: "rg-tick" }, R.dataBreve(a.calendario[k])));
    const linea = (s, fn, stile, off = 0) => {
      let d = "";
      for (let i = i0; i < N; i++) { const x = s[i - off]; if (x == null) continue; d += `${d ? "L" : "M"}${X(i).toFixed(1)},${fn(x).toFixed(1)}`; }
      if (d) root.append(svg("path", Object.assign({ d, fill: "none" }, stile)));
    };
    if (sb) linea(sb, Y, { stroke: c.muted, "stroke-width": 1.6, "stroke-dasharray": "5 4" });
    linea(sp, Y, { stroke: c.soglia, "stroke-width": 2 });
    root.append(svg("text", { x: m.l, y: y2 - 9, class: "tit-pannello" }, "Calo dal massimo del periodo"));
    root.append(svg("line", { x1: m.l, x2: m.l + pw, y1: Y2(0), y2: Y2(0), class: "rg-axis" }));
    root.append(svg("text", { x: m.l + pw + 6, y: Y2(dlo / 1.1) + 4, class: "rg-tick" }, `${num(dlo / 1.1, 0)}%`));
    if (ddb) linea(ddb, Y2, { stroke: c.muted, "stroke-width": 1.2, "stroke-dasharray": "5 4" }, i0);
    linea(ddp, Y2, { stroke: c.neg || "var(--neg)", "stroke-width": 1.5 }, i0);
    box.innerHTML = "";
    box.append(root);
    // scheda al passaggio
    const cur = svg("line", { x1: 0, x2: 0, y1: m.t, y2: H - m.b, class: "pf-cursor", visibility: "hidden" });
    root.append(cur);
    const tip = document.createElement("div");
    tip.className = "chart-tip"; tip.hidden = true; box.append(tip);
    const muovi = ev => {
      const rect = root.getBoundingClientRect();
      const px = ((ev.clientX - rect.left) / rect.width) * W;
      const k = Math.max(i0, Math.min(N - 1, Math.round(i0 + ((px - m.l) / pw) * n)));
      cur.setAttribute("x1", X(k)); cur.setAttribute("x2", X(k)); cur.setAttribute("visibility", "visible");
      tip.innerHTML = `<div class="d">${dataIt(a.calendario[k])}</div>` +
        `<div class="r"><span><i class="sw dot" style="background:${c.soglia}"></i>Portafoglio</span><span>${euro(v[k], 0)} · ${num(sp[k], 1)}</span></div>` +
        (sb ? `<div class="r"><span><i class="sw dot" style="background:${c.muted}"></i>ACWI (base 100)</span><span>${num(sb[k], 1)}</span></div>` : "");
      tip.hidden = false;
      const x = (X(k) / W) * rect.width;
      tip.style.left = (x + 16 + tip.offsetWidth > rect.width ? Math.max(0, x - tip.offsetWidth - 16) : x + 16) + "px";
    };
    root.addEventListener("pointermove", muovi);
    root.addEventListener("pointerdown", muovi);
    root.addEventListener("pointerleave", () => { cur.setAttribute("visibility", "hidden"); tip.hidden = true; });
    const fine = (s) => (s && s[N - 1] != null ? s[N - 1] / 100 - 1 : null);
    $("#pf-legenda").innerHTML = `<span><i class="sw" style="background:${c.soglia}"></i>Il portafoglio (composizione di oggi) <b>${p100(fine(sp))}</b></span>` +
      (sb ? `<span><i class="sw dash" style="color:${c.muted}"></i>ACWI in euro, il tuo PAC <b>${p100(fine(sb))}</b></span>` : "");
  }

  // ---------------- correlazioni ----------------

  function disegnaCorrelazioni() {
    const a = st.a, box = $("#pf-correlazioni");
    const card = $("#pf-correlazioni-card");
    if (a.righe.length < 2) { card.hidden = true; return; }
    card.hidden = false;
    const tav = (() => {
      const cv = document.createElement("canvas").getContext("2d");
      const rgb = nm => { cv.fillStyle = R.css(nm); const h = cv.fillStyle; return h.startsWith("#") ? [1, 3, 5].map(k => parseInt(h.slice(k, k + 2), 16)) : (h.match(/\d+/g) || [128, 128, 128]).slice(0, 3).map(Number); };
      return { neg: rgb("--ma"), pos: rgb("--soglia"), mid: rgb("--surface-3") };
    })();
    const colore = r => {
      const t = Math.max(-1, Math.min(1, r)), ap = t < 0 ? tav.neg : tav.pos, k = 0.85 * Math.pow(Math.abs(t), 0.9);
      const col = tav.mid.map((mm, i) => Math.round(mm + (ap[i] - mm) * k));
      const lum = col.map(x => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); });
      const L = 0.2126 * lum[0] + 0.7152 * lum[1] + 0.0722 * lum[2];
      return { bg: `rgb(${col.join(",")})`, testo: (L + 0.05) / 0.055 > 1.05 / (L + 0.05) ? "#0e1013" : "#ffffff" };
    };
    box.innerHTML = `<thead><tr><th></th>${a.righe.map(x => `<th>${esc(x.t)}</th>`).join("")}</tr></thead><tbody>` +
      a.righe.map((x, i) => `<tr><th class="l">${esc(x.t)}</th>${a.righe.map((y, j) => {
        if (i === j) return '<td class="diag">—</td>';
        const r = a.correlazioni[i][j];
        if (r == null) return '<td class="vuota">·</td>';
        const col = colore(r);
        return `<td style="background:${col.bg};color:${col.testo}" title="${esc(x.t)} e ${esc(y.t)}: ${num(r, 2)}">${num(r, 2)}</td>`;
      }).join("")}</tr>`).join("") + "</tbody>";
  }

  // ---------------- stati della pagina ----------------

  function mostraBlocchi(visibili) {
    for (const id of ["pf-kpi", "pf-sintesi", "pf-posizioni-card", "pf-due", "pf-andamento-card", "pf-correlazioni-card"]) {
      const el = document.getElementById(id);
      if (el) el.hidden = !visibili;
    }
  }

  function avvio(html) {
    const box = $("#pf-avvio");
    box.hidden = !html;
    box.innerHTML = html || "";
  }

  function disegnaTutto() {
    if (!st.a || !st.a.righe.length) {
      mostraBlocchi(false);
      const senza = st.a ? st.a.senzaPrezzi.map(p => esc(p.t)).join(", ") : "";
      avvio(st.file && st.file.posizioni.length
        ? `<h2>I prezzi del portafoglio non ci sono ancora</h2><p>${senza ? `Mancano i prezzi di <b>${senza}</b>. ` : ""}${st.cifrato
          ? `Il file è protetto: l'aggiornamento automatico scarica i prezzi dei titoli scritti anche in <code>miei-titoli.txt</code> (le azioni europee della zona Europa ci sono già). Aggiungi lì i ticker, poi GitHub → Actions → Aggiorna dati → Run workflow.`
          : `Si scaricano con il prossimo aggiornamento automatico (o subito: GitHub → Actions → Aggiorna dati → Run workflow).`}</p>`
        : `<h2>Il portafoglio è vuoto</h2><p>Scrivi i tuoi titoli nel file con <b>Modifica il portafoglio</b>: una riga per titolo con ticker, quantità e prezzo di carico.</p>`);
      return;
    }
    avvio(null);
    mostraBlocchi(true);
    disegnaKpi();
    disegnaSintesi();
    disegnaPosizioni();
    disegnaComposizione();
    disegnaRischio();
    disegnaAndamento();
    disegnaCorrelazioni();
  }

  function aggiornaIntestazione() {
    const btnMod = $("#pf-modifica"), btnPro = $("#pf-proteggi");
    if (st.testo == null) {
      btnMod.textContent = "Crea il portafoglio"; btnMod.href = "#"; btnMod.removeAttribute("target"); btnMod.dataset.azione = "crea";
      btnPro.hidden = true;
    } else if (st.cifrato) {
      btnMod.textContent = "Modifica il portafoglio"; btnMod.href = "#"; btnMod.removeAttribute("target"); btnMod.dataset.azione = "modifica";
      btnPro.hidden = true;
    } else {
      btnMod.textContent = "Modifica il portafoglio ↗"; btnMod.href = R.github("portafoglio.txt").modifica; btnMod.target = "_blank"; btnMod.dataset.azione = "";
      btnPro.hidden = false;
    }
    $("#tit-h1").textContent = st.testo == null ? "I titoli che segui" : "Il mio portafoglio";
  }

  // legge il file (e lo apre con la password salvata, se è protetto); serve anche alle altre viste
  async function leggiFile() {
    const testo = await caricaTesto();
    if (!st.caricato || testo !== st.testo) { st.testo = testo; st.chiaro = null; }
    st.caricato = true;
    st.cifrato = !!(st.testo && st.testo.trimStart().startsWith("RADAR-CIFRATO"));
    if (!st.cifrato) st.chiaro = st.testo;
    else if (st.chiaro == null) {
      const pw = passwordSalvata();
      if (pw) { try { st.chiaro = await P.decifra(st.testo, pw); } catch (e) { st.chiaro = null; } }
    }
  }

  async function pronto() {
    if (!st.caricato) await leggiFile();
    const f = st.chiaro != null ? P.leggi(st.chiaro) : null;
    return { esiste: st.testo != null, cifrato: st.cifrato, aperto: st.chiaro != null, tickers: f ? f.posizioni.map(p => p.t) : [] };
  }

  // per la Home: valore, risultato e andamento, senza toccare la pagina del portafoglio
  async function riepilogo() {
    const stato = await pronto();
    if (!stato.esiste) return { stato: "assente" };
    if (stato.cifrato && !stato.aperto) return { stato: "bloccato" };
    const f = P.leggi(st.chiaro || "");
    if (!f.posizioni.length && !f.liquidita.length) return { stato: "vuoto" };
    let dati = null;
    try { dati = await R.dati.miei(); } catch (e) { dati = null; }
    dati = await completaPrezzi(dati || { titoli: [], cambi: {}, confronti: {} }, f.posizioni);
    let a = null;
    try {
      a = P.analizza({
        posizioni: f.posizioni, liquidita: f.liquidita, titoli: titoliPerCalcolo(dati, {}), cambi: dati.cambi || {},
        bench: dati.confronti && dati.confronti.europa ? { date: dati.confronti.europa.date, prezzi: dati.confronti.europa.prezzi } : null,
      });
    } catch (e) { a = null; }
    return { stato: a && a.righe.length ? "aperto" : "senza-prezzi", a };
  }

  async function disegna(dati, extra) {
    st.dati = dati; st.extra = extra || {};
    await leggiFile();
    aggiornaIntestazione();
    if (st.testo == null) {
      st.file = null; st.a = null; mostraBlocchi(false);
      avvio(`<h2>Aggiungi il tuo portafoglio</h2>
        <p>Con quantità e prezzi di carico il sito calcola valore e risultato in euro, composizione per tipo, valuta, area e settore, beta e volatilità rispetto all'ACWI (il tuo PAC), il calo massimo e quanto ogni titolo pesa sul rischio.</p>
        <ol><li>Premi <b>Crea il portafoglio protetto</b>: scrivi una riga per titolo (ticker, quantità, prezzo di carico) e la liquidità, poi scegli una password.</li>
        <li>Il sito cifra il testo nel browser e ti apre GitHub con il file <code>portafoglio.txt</code> già pronto: premi <b>Commit changes</b>.</li>
        <li>Dopo un minuto ricarica il sito. Le azioni europee puoi aggiungerle anche dalla zona Europa, pagina Azioni, con il pulsante <b>Aggiungi al portafoglio</b>.</li></ol>
        <div class="pf-azioni"><button type="button" class="btn-primary" id="pf-crea">Crea il portafoglio protetto</button></div>
        <p class="small">Il repository è pubblico: con la password su GitHub arriva solo il file cifrato, illeggibile per chi non la conosce.</p>`);
      return;
    }
    if (st.chiaro == null) { chiediPassword(); return; }
    await apri();
  }

  async function apri() {
    st.file = P.leggi(st.chiaro);
    st.datiCalcolo = await completaPrezzi(st.dati, st.file.posizioni);
    calcola();
    disegnaTutto();
  }

  function chiediPassword(errore) {
    mostraBlocchi(false);
    avvio(`<h2>Il portafoglio è protetto</h2>
      <p>Inserisci la password che hai scelto quando l'hai protetto.</p>
      <form class="pf-form" id="pf-form-pw">
        <input type="password" id="pf-pw" class="input" autocomplete="current-password" placeholder="Password" required>
        <label class="check"><input type="checkbox" id="pf-ricorda" checked> Ricorda su questo dispositivo</label>
        <button type="submit" class="btn-primary">Apri</button>
      </form>
      ${errore ? `<p class="errore">${esc(errore)}</p>` : ""}`);
    const f = $("#pf-form-pw");
    f.addEventListener("submit", async e => {
      e.preventDefault();
      const pw = $("#pf-pw").value;
      try {
        st.chiaro = await P.decifra(st.testo, pw);
      } catch (err) { chiediPassword("Password sbagliata."); return; }
      salvaPassword(pw, $("#pf-ricorda").checked);
      await apri();
      R.emit("portafoglio");
    });
    setTimeout(() => { const i = $("#pf-pw"); if (i) i.focus(); }, 50);
  }

  // ---------------- creare, modificare e proteggere il file ----------------

  /**
   * La finestra con il testo del portafoglio. modo:
   *   «nuovo»   il file non c'è: si sceglie la password e GitHub apre il file nuovo già scritto;
   *   «cifrato» il file è protetto: si cifra con la password già in uso;
   *   «chiaro»  il file è leggibile da tutti: si propone di proteggerlo.
   */
  function apriEditor(modo, testo) {
    const titoli = { nuovo: "Crea il portafoglio protetto", cifrato: "Modifica il portafoglio protetto", chiaro: "Modifica il portafoglio" };
    const intro = {
      nuovo: `Scrivi una riga per titolo: ticker, quantità e prezzo medio di carico (se vuoi anche la valuta del carico e la data), più la liquidità. Il testo si cifra qui, nel browser, con la password che scegli: su GitHub arriva solo il file protetto. <b>Se dimentichi la password il contenuto non si recupera.</b>`,
      cifrato: "Cambia le righe (ticker, quantità, prezzo di carico…), poi prepara il file protetto e mettilo su GitHub al posto di quello di prima.",
      chiaro: "Il file ora è leggibile da tutti, perché il repository è pubblico. Scegli una password per proteggerlo: il sito la chiederà la prima volta su ogni dispositivo. Le versioni in chiaro di prima restano nella cronologia di GitHub.",
    };
    const nuovaPw = `
      <div class="pf-form">
        <input type="password" id="pf-nuova1" class="input" autocomplete="new-password" placeholder="${modo === "cifrato" ? "Nuova password" : "Password"} (almeno 8 caratteri)" minlength="8">
        <input type="password" id="pf-nuova2" class="input" autocomplete="new-password" placeholder="Ripeti la password" minlength="8">
        <label class="check"><input type="checkbox" id="pf-ricorda" checked> Ricorda su questo dispositivo</label>
      </div>`;
    // con il file già protetto si usa la password di sempre; si può cambiare aprendo «Cambia password»
    const campiPw = modo === "cifrato"
      ? `<details class="pf-cambia" id="pf-cambia"><summary>Cambia password</summary><p class="small">Il file si cifra con la password nuova: dopo averlo messo su GitHub, sugli altri dispositivi il sito chiederà quella.</p>${nuovaPw}</details>`
      : nuovaPw;
    const m = R.finestra(`<div class="modal-head"><h2>${titoli[modo]}</h2><button class="icon-btn" type="button" data-chiudi aria-label="Chiudi">×</button></div>
      <p>${intro[modo]}</p>
      <textarea id="pf-testo" rows="12" spellcheck="false" aria-label="Il testo di portafoglio.txt">${esc(testo)}</textarea>
      ${campiPw}
      <div class="pf-azioni"><button type="button" class="btn-primary" id="pf-prepara">Prepara il file protetto</button>
        <button type="button" class="btn-link" id="pf-chiaro">${modo === "cifrato" ? "Togli la protezione" : "Preparalo senza password"}</button></div>
      <p class="errore" id="pf-errore" hidden></p>
      <div id="pf-esito"></div>`);
    const errore = t => { const x = m.querySelector("#pf-errore"); x.textContent = t; x.hidden = !t; };
    const controlla = testoNuovo => {
      const righe = testoNuovo.split(/\r?\n/).map(r => r.trim());
      if (ESEMPIO.trim().split("\n").every(r => righe.includes(r.trim()))) { errore("Nel testo ci sono ancora le righe di esempio (IUSQ.DE 100, MSFT 10, LIQUIDITA 2000): sostituiscile con i tuoi titoli."); return false; }
      const f = P.leggi(testoNuovo);
      if (!f.posizioni.length && !f.liquidita.length) { errore("Nel testo non c'è nessuna riga con ticker, quantità e prezzo."); return false; }
      if (f.errori.length) { errore(`Righe non capite: ${f.errori.map(x => `riga ${x.riga} (${x.motivo})`).join("; ")}.`); return false; }
      return true;
    };
    m.querySelector("#pf-prepara").addEventListener("click", async () => {
      const testoNuovo = m.querySelector("#pf-testo").value;
      if (!controlla(testoNuovo)) return;
      let pw;
      const cambia = modo === "cifrato" && m.querySelector("#pf-cambia").open && m.querySelector("#pf-nuova1").value;
      if (modo === "cifrato" && !cambia) {
        pw = passwordSalvata();
        if (!pw) { errore("Riapri il portafoglio con la password e riprova."); return; }
      } else {
        const a = m.querySelector("#pf-nuova1").value, b = m.querySelector("#pf-nuova2").value;
        if (a.length < 8) { errore("La password deve avere almeno 8 caratteri."); return; }
        if (a !== b) { errore("Le due password non sono uguali."); return; }
        pw = a;
        salvaPassword(pw, m.querySelector("#pf-ricorda").checked);
      }
      errore("");
      const blocco = await P.cifra(testoNuovo, pw);
      await esito(m, modo, blocco, testoNuovo, true);
    });
    m.querySelector("#pf-chiaro").addEventListener("click", async () => {
      const testoNuovo = m.querySelector("#pf-testo").value;
      if (!controlla(testoNuovo)) return;
      errore("");
      await esito(m, modo, testoNuovo, testoNuovo, false);
    });
  }

  async function esito(m, modo, contenuto, testoChiaro, protetto) {
    const g = R.github("portafoglio.txt");
    const nuovo = modo === "nuovo";
    const mancano = protetto ? await tickerSenzaPrezzi(testoChiaro) : [];
    m.querySelector("#pf-esito").innerHTML = `<div class="pf-file">
      <h3>${protetto ? "Ecco il file protetto" : "Ecco il file in chiaro (leggibile da tutti)"}</h3>
      <textarea readonly rows="${protetto ? 5 : 8}" id="pf-uscita">${esc(contenuto)}</textarea>
      <div class="pf-azioni">
        <a class="btn-primary pf-vai" href="${esc(nuovo ? g.crea(contenuto) : g.modifica)}" target="_blank" rel="noopener">${nuovo ? "Crea portafoglio.txt su GitHub ↗" : "Apri portafoglio.txt su GitHub ↗"}</a>
        <button type="button" class="btn-link" id="pf-copia">Copia il testo</button>
      </div>
      <p class="small">${nuovo
        ? "GitHub apre il file nuovo con il testo già scritto: premi <b>Commit changes</b> (se il file è vuoto, incolla il testo copiato)."
        : "Su GitHub seleziona tutto il contenuto del file (Ctrl+A), incolla questo testo al suo posto (Ctrl+V) e premi <b>Commit changes</b>."} Dopo un minuto ricarica il sito.</p>
      ${mancano.length ? `<h3>Poi aggiungi a miei-titoli.txt</h3>
        <p class="small">L'aggiornamento automatico non conosce la password, quindi scarica i prezzi solo dei titoli scritti anche in <code>miei-titoli.txt</code> (le azioni europee della zona Europa ci sono già). Mancano questi, una riga per ticker:</p>
        <textarea readonly rows="${Math.min(6, mancano.length)}" id="pf-uscita2">${esc(mancano.join("\n"))}</textarea>
        <div class="pf-azioni"><button type="button" class="btn-link" id="pf-copia2">Copia le righe</button>
          <a class="btn-link" href="${esc(R.github("miei-titoli.txt").modifica)}" target="_blank" rel="noopener">Apri miei-titoli.txt su GitHub ↗</a></div>` : ""}
    </div>`;
    m.querySelector("#pf-copia").addEventListener("click", e => R.copia(contenuto, e.currentTarget, m.querySelector("#pf-uscita")));
    const c2 = m.querySelector("#pf-copia2");
    if (c2) c2.addEventListener("click", e => R.copia(mancano.join("\n") + "\n", e.currentTarget, m.querySelector("#pf-uscita2")));
    // su GitHub si incolla: il testo è già negli appunti quando si apre la pagina
    m.querySelector(".pf-vai").addEventListener("click", () => { R.copia(contenuto); });
    m.querySelector("#pf-esito").scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  /**
   * Aggiunge un titolo (dalla zona Europa): quantità, prezzo, valuta e data, poi la finestra con tutto il file.
   * voce = { t, nome, prezzo, valuta, data }
   */
  async function aggiungi(voce) {
    const stato = await pronto();
    const loc = voce.valuta || "EUR";
    const nomeValuta = loc === "GBp" ? "pence" : loc === "EUR" ? "€" : loc;
    const chiedi = stato.cifrato && !stato.aperto;
    const oggi = new Date().toISOString().slice(0, 10);
    const m = R.finestra(`<div class="modal-head"><h2>Aggiungi ${esc(voce.t)} al portafoglio</h2><button class="icon-btn" type="button" data-chiudi aria-label="Chiudi">×</button></div>
      <p>${esc(voce.nome || voce.t)}${voce.prezzo ? `: ultima chiusura ${cifre(voce.prezzo)} ${nomeValuta}${voce.data ? ` del ${dataIt(voce.data)}` : ""}` : ""}.${stato.tickers.includes(voce.t) ? " <b>È già nel portafoglio</b>: la nuova riga si somma a quella che c'è, con il prezzo di carico medio." : ""}</p>
      <form class="pf-griglia" id="pf-form-agg">
        <label><span>Quantità</span><input class="input" id="pf-q" inputmode="decimal" autocomplete="off" required autofocus></label>
        <label><span>Prezzo medio di carico${loc !== "EUR" ? "" : " (€)"}</span><input class="input" id="pf-c" inputmode="decimal" autocomplete="off" required value="${voce.prezzo ? esc(numeroFile(voce.prezzo)) : ""}"></label>
        ${loc !== "EUR" ? `<label><span>Il prezzo è in</span><select class="select" id="pf-v"><option value="">${esc(nomeValuta)}, come la quotazione</option><option value="EUR">euro (se hai comprato in euro)</option></select></label>` : ""}
        <label><span>Data del primo acquisto (facoltativa)</span><input class="input" id="pf-d" type="date" max="${oggi}"></label>
        ${chiedi ? `<label><span>Password del portafoglio</span><input class="input" id="pf-pw2" type="password" autocomplete="current-password" required></label>
          <label class="check"><input type="checkbox" id="pf-ricorda2" checked> Ricorda su questo dispositivo</label>` : ""}
        <div class="pf-azioni"><button type="submit" class="btn-primary">Continua</button></div>
      </form>
      <p class="errore" id="pf-errore" hidden></p>
      <p class="small">${stato.esiste ? "Nel passo dopo vedi tutto il file con la riga nuova in fondo e lo prepari per GitHub." : "Il portafoglio non c'è ancora: nel passo dopo lo crei, protetto con una password."}</p>`);
    const errore = t => { const x = m.querySelector("#pf-errore"); x.textContent = t; x.hidden = !t; };
    m.querySelector("#pf-form-agg").addEventListener("submit", async e => {
      e.preventDefault();
      const q = P.numero(m.querySelector("#pf-q").value), c = P.numero(m.querySelector("#pf-c").value);
      if (q == null || q <= 0) { errore("Scrivi la quantità, per esempio 100 o 0,5."); return; }
      if (c == null || c <= 0) { errore("Scrivi il prezzo medio di carico."); return; }
      const v = m.querySelector("#pf-v") ? m.querySelector("#pf-v").value : "";
      const d = m.querySelector("#pf-d").value;
      if (chiedi && st.chiaro == null) {
        const pw = m.querySelector("#pf-pw2").value;
        try { st.chiaro = await P.decifra(st.testo, pw); }
        catch (err) { errore("Password sbagliata."); return; }
        salvaPassword(pw, m.querySelector("#pf-ricorda2").checked);
      }
      const riga = [voce.t, numeroFile(q), numeroFile(c), v, d].filter(Boolean).join("   ") + (voce.nome ? `   # ${voce.nome}` : "");
      const base = st.testo == null ? INTESTAZIONE_FILE : st.chiaro || "";
      apriEditor(st.testo == null ? "nuovo" : st.cifrato ? "cifrato" : "chiaro", base.replace(/\s*$/, "\n") + riga + "\n");
    });
  }

  function init() {
    $("#pf-posizioni").addEventListener("click", e => {
      const th = e.target.closest("th[data-col]");
      if (th) {
        const col = th.dataset.col;
        st.ordine = { col, dir: st.ordine.col === col ? -st.ordine.dir : col === "t" ? 1 : -1 };
        R.store.set("pf.ordine", st.ordine);
        disegnaPosizioni();
        return;
      }
      const tr = e.target.closest("tr[data-t]");
      if (tr) R.emit("apri-titolo", tr.dataset.t);
    });
    $("#pf-periodo").addEventListener("click", e => {
      const b = e.target.closest("button[data-v]");
      if (!b) return;
      st.periodo = Number(b.dataset.v);
      R.store.set("pf.periodo", st.periodo);
      disegnaAndamento();
    });
    $("#pf-proteggi").addEventListener("click", () => apriEditor("chiaro", st.chiaro || ""));
    $("#pf-modifica").addEventListener("click", e => {
      const azione = e.currentTarget.dataset.azione;
      if (azione === "crea") { e.preventDefault(); apriEditor("nuovo", MODELLO); }
      else if (azione === "modifica") {
        e.preventDefault();
        if (st.chiaro != null) apriEditor("cifrato", st.chiaro);
        else { const i = $("#pf-pw"); if (i) { i.scrollIntoView({ block: "center", behavior: "smooth" }); i.focus(); } }
      }
    });
    $("#pf-avvio").addEventListener("click", e => { if (e.target.closest("#pf-crea")) apriEditor("nuovo", MODELLO); });
    R.on("tema", () => { if (st.a && document.body.dataset.view === "tit") disegnaTutto(); });
    window.addEventListener("resize", R.debounce(() => { if (st.a && document.body.dataset.view === "tit") disegnaAndamento(); }, 200));
  }

  // testo per «Copia per Claude»
  function contesto() {
    const a = st.a;
    if (!a) return st.cifrato ? "Portafoglio protetto con password: non ancora aperto." : "";
    const r = a.rischio;
    const out = ["### Il mio portafoglio (valori in euro)",
      `Valore ${euro(a.totale, 0)} (titoli ${euro(a.investito, 0)}, liquidità ${euro(a.cassa, 0)}); investiti ${euro(a.costo, 0)}; risultato ${euroSegno(a.risultato)} (${p100(a.risultatoPct)}); oggi ${euroSegno(a.oggi)}.`,
      `Rischio sull'ultimo anno: beta sull'ACWI in euro ${r.beta == null ? "—" : num(r.beta, 2)}, correlazione ${r.corrBench == null ? "—" : num(r.corrBench, 2)}, volatilità ${quota(r.vol)} (ACWI ${quota(r.volBench)}), calo massimo ${p100(r.caloAnno.calo)} (ACWI ${p100(r.caloAnnoBench && r.caloAnnoBench.calo)}), perdita superata 1 giorno su 20 ${r.var95 == null ? "—" : euro(r.var95, 0)}, numero effettivo di titoli ${r.nEffettivo == null ? "—" : num(r.nEffettivo, 1)}, correlazione media ${r.corrMedia == null ? "—" : num(r.corrMedia, 2)}, indice di diversificazione ${r.diversificazione == null ? "—" : num(r.diversificazione, 2)}.`,
      "titolo | nome | tipo | settore | paese | valuta | quantità | carico | prezzo | valore € | peso | risultato € | risultato % | sulla media 200 | beta | quota del rischio",
      ...a.righe.map(x => [x.t, x.nome, x.tipo, x.settore || "—", x.paese || "—", x.valuta, num(x.quantita, 4), `${cifre(x.carico)} ${x.valutaCarico}`, cifre(x.prezzo),
        euro(x.valore, 0), quota(x.peso, 1), euroSegno(x.risultato), p100(x.risultatoPct), p100(x.vs200), x.beta == null ? "—" : num(x.beta, 2), quota(x.rischio)].join(" | ")),
      "Composizione: " + ["tipo", "valuta", "area", "settore"].map(k => `${k}: ${a.composizione[k].map(g => `${g.nome} ${quota(g.peso)}`).join(", ")}`).join("; "),
    ];
    const rp = a.rendimenti.portafoglio, rb = a.rendimenti.bench;
    if (rp) out.push(`Andamento simulato con le quantità di oggi: 1 mese ${p100(rp.g30)}, 3 mesi ${p100(rp.g90)}, da inizio anno ${p100(rp.ytd)}, 1 anno ${p100(rp.a1)}` + (rb ? `; ACWI 1 mese ${p100(rb.g30)}, 3 mesi ${p100(rb.g90)}, da inizio anno ${p100(rb.ytd)}, 1 anno ${p100(rb.a1)}.` : "."));
    return out.join("\n");
  }

  R.portafoglio = { init, disegna, contesto, pronto, riepilogo, aggiungi, tickers: () => (st.file ? st.file.posizioni.map(p => p.t) : []) };
})();
