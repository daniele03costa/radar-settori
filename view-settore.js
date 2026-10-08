/*
 * Radar Settori — dettaglio di un settore USA, o di un settore o indice europeo (stessa pagina, dati del mercato
 * della zona aperta: R.mercati in core.js).
 */
(function () {
  "use strict";

  const R = window.Radar, S = window.Signals;
  const { $, num, pct, cls, dataIt, esc } = R;

  const SIMBOLI = { EUR: "€", GBp: "p", CHF: "CHF", DKK: "kr", SEK: "kr", NOK: "kr" };
  let M = R.mercati.usa;
  const scelti = { usa: R.store.get("settore", "XLK"), eur: R.store.get("settoreEu", "") };
  const eu = () => M.zona === "eur";
  // come si chiama il prezzo del gruppo
  const nomePrezzo = d => !eu() ? `Prezzo ${d.etf}` : d.prezzo_tipo === "indice" ? `Livello ${d.nome}` : "Paniere a pesi uguali (in euro)";
  const st = {
    etf: scelti.usa,
    periodo: R.store.get("periodo", "3A"),
    log: R.store.get("log", false),
    ordine: R.store.get("ordine", { col: "v200", dir: -1 }),
    filtro: "",
    titolo: null,
    mancante: null,     // azione cercata che non ha ancora abbastanza prezzi
    dati: null,
    analisi: null,
    visibile: false,
  };
  let grafici = null;

  // ---------------- grafici ----------------

  function creaGrafici() {
    const el = $("#grafici");
    el.innerHTML = "";
    const small = window.matchMedia("(max-width: 720px)").matches;
    const big = window.matchMedia("(min-height: 900px) and (min-width: 1280px)").matches;
    grafici = new window.Pannelli(el, {
      pannelli: [
        { id: "prezzo", altezza: small ? 230 : big ? 400 : 340,
          formato: v => num(v, Number.isInteger(v) ? 0 : Math.abs(v * 10 - Math.round(v * 10)) < 1e-6 ? 1 : 2),
          formatoPill: v => num(v, 2) },
        { id: "dd", altezza: small ? 110 : big ? 160 : 140, formato: v => (v === 0 ? "0%" : num(v, 0) + "%"), formatoPill: v => pct(v, 1) },
        { id: "ampiezza", altezza: small ? 160 : big ? 240 : 210, formato: v => num(v, 0) + "%", formatoPill: v => num(v, 1) + "%" },
      ],
      tooltip,
      etichettaZona: "Zona blu",
    });
  }

  function tooltip(i) {
    const d = st.dati, c = R.colori();
    const stato = st.analisi.stati[i];
    const trig = st.analisi.episodi.find(e => e.segnale === i);
    const fall = st.analisi.episodi.find(e => e.falliti.includes(i));
    const row = (sw, lab, val) => `<div class="r"><span><i class="sw dot" style="background:${sw}"></i>${lab}</span><span>${val}</span></div>`;
    return `<div class="d">${dataIt(d.date[i])}</div>` +
      row(c.price, "Prezzo", num(d.close[i], 2)) +
      row(c.ma, "Media 200", num(d.ma200[i], 2)) +
      row(c.dd, "Drawdown 52s", pct(d.dd[i], 1)) +
      row(c.b200, "Sopra M200", d.b200[i] == null ? "—" : `${num(d.b200[i], 1)}% <small class="muted">su ${d.n[i]}</small>`) +
      row(c.b50, "Sopra M50", d.b50[i] == null ? "—" : num(d.b50[i], 1) + "%") +
      (d.b20 ? row(c.muted, "Sopra M20", d.b20[i] == null ? "—" : num(d.b20[i], 1) + "%") : "") +
      (stato ? `<div class="z st-${stato}">${S.STATI[stato]}</div>` : "") +
      (trig ? `<div class="z st-trigger">Trigger: ${trig.motivi.map(m => S.MOTIVI[m]).join(" + ")}</div>` : "") +
      (fall ? `<div class="z st-fallito">Trigger poi fallito</div>` : "");
  }

  const zone = () => st.analisi.episodi.map(e => [e.inizio, e.segnale != null ? e.segnale : st.dati.date.length - 1]);

  function intervallo() {
    const d = st.dati, N = d.date.length;
    let i0 = 0;
    if (st.periodo !== "MAX") {
      const anni = st.periodo === "3A" ? 3 : 10;
      const from = new Date(d.date[N - 1]); from.setFullYear(from.getFullYear() - anni);
      const iso = from.toISOString().slice(0, 10);
      i0 = Math.max(0, d.date.findIndex(x => x >= iso));
    }
    return [i0, N - 1];
  }

  function disegnaGrafici() {
    const d = st.dati, a = st.analisi, c = R.colori();
    const [i0, i1] = intervallo();
    const lv = R.livello(d.etf);
    const mP = [], mA = [];
    for (const e of a.episodi) {
      for (const f of e.falliti) { mP.push({ i: f, y: d.close[f], colore: c.fallito, vuoto: true }); mA.push({ i: f, colore: c.fallito, vuoto: true }); }
      if (e.segnale != null) { mP.push({ i: e.segnale, y: d.close[e.segnale], colore: c.segnale }); mA.push({ i: e.segnale, colore: c.segnale }); }
    }
    grafici.setData({
      date: d.date, i0, i1, zone: zone(),
      etichette: {
        prezzo: `${nomePrezzo(d)} e media a 200 sedute`,
        dd: "Drawdown dal massimo a 52 settimane",
        ampiezza: `% titoli sopra la media 200 e 50 · livello blu ${num(lv, 0)}%`,
      },
      pannelli: {
        prezzo: {
          log: st.log,
          serie: [
            { valori: d.close, colore: c.price, spessore: 1.8, area: c.priceArea, base: "fondo", pill: true },
            { valori: d.ma200, colore: c.ma, spessore: 2, pill: true },
          ],
          marcatori: mP,
        },
        dd: {
          includiZero: true,
          serie: [{ valori: d.dd, colore: c.dd, spessore: 1.5, area: c.ddArea, base: 0, pill: true }],
          notaMinimo: v => `peggiore nel periodo ${pct(v, 1)}`,
        },
        ampiezza: {
          range: [0, 100],
          serie: [
            { valori: d.b50, colore: c.b50, spessore: 1.3, tratteggio: [5, 4] },
            { valori: d.b200, colore: c.b200, spessore: 2, area: c.b200Area, base: "fondo", pill: true },
          ],
          linee: [{ y: lv, colore: c.soglia, tratteggio: [7, 5], spessore: 1.8, etichetta: num(lv, 0) + "%" }],
          marcatori: mA,
        },
      },
    });
    $("#legenda").innerHTML = [
      `<span><i class="sw" style="background:${c.price}"></i>Prezzo</span>`,
      `<span><i class="sw" style="background:${c.ma}"></i>Media 200</span>`,
      `<span><i class="sw" style="background:${c.dd}"></i>Drawdown</span>`,
      `<span><i class="sw" style="background:${c.b200}"></i>% sopra M200</span>`,
      `<span><i class="sw dash" style="color:${c.b50}"></i>% sopra M50</span>`,
      `<span><i class="sw dash" style="color:${c.soglia}"></i>Livello blu</span>`,
      `<span><i class="sw box" style="background:var(--zona);border:1px solid var(--zona-bordo)"></i>Zona blu</span>`,
      `<span><i class="sw tri"></i>Trigger</span>`,
      `<span><i class="sw tri hollow"></i>Fallito</span>`,
    ].join("");
  }

  // ---------------- testata e riquadri ----------------

  function descriviStato(d, a) {
    const N = d.date.length, P = R.parametri();
    const ep = a.episodi[a.episodi.length - 1];
    const lv = R.livello(d.etf);
    const b200 = d.b200[N - 1];
    const stato = a.statoOggi || "normale";
    const dist = b200 == null ? null : b200 - lv;
    let testo;
    if (stato === "blu" && ep) {
      const dur = N - 1 - ep.inizio;
      const servono = (dur > P.zonaLunga || ep.falliti.length) ? 2 : 1;
      testo = `Zona blu dal ${dataIt(d.date[ep.inizio])} (${dur ? R.sedute(dur) : "da oggi"}) · per il trigger ${servono === 1 ? "serve 1 conferma" : "servono 2 conferme"}`;
    } else if (stato === "trigger" && ep && ep.segnale != null) {
      testo = `Trigger del ${dataIt(d.date[ep.segnale])} · in verifica (${N - 1 - ep.segnale}/${P.verifica} sedute)`;
    } else if (stato === "fallito") {
      testo = "Il trigger è fallito oggi · si torna in zona blu";
    } else if (stato === "cooldown" && ep && ep.segnale != null) {
      testo = `Cooldown dopo il trigger del ${dataIt(d.date[ep.segnale])} · ancora ${R.sedute(Math.max(0, P.cooldown - (N - 1 - ep.segnale)))}`;
    } else if (stato === "attenzione") {
      testo = dist != null && dist <= P.fasciaAttenzione
        ? `Attenzione · ampiezza a ${num(Math.max(0, dist), 1)} punti dal livello blu`
        : `Attenzione · drawdown tra i più profondi della storia ${eu() && d.tipo === "indice" ? "dell'indice" : "del settore"}`;
    } else {
      testo = dist == null ? "Ampiezza non disponibile" : `Normale · ampiezza ${num(dist, 1)} punti sopra il livello blu`;
    }
    if (!a.armato && (stato === "normale" || stato === "attenzione")) testo += ` · nuova zona blu solo dopo il ritorno sopra ${R.art("il", num(a.riarmo, 0) + "%")}`;
    return { stato, testo };
  }

  function disegnaTestata() {
    const d = st.dati, a = st.analisi;
    const meta = R.metaDi(d.etf) || {};
    const simbolo = d.simbolo_breadth || meta.simbolo_breadth;
    if (eu()) {
      $("#kicker").textContent = d.tipo === "indice" ? `Europa · Indici · ${d.paese}` : "Europa · Settori · tutte le borse";
      $("#titolo").innerHTML = `${esc(d.nome)}<span class="etf">${d.tipo === "indice" ? "indice" : "settore"}</span>`;
      const filtro = d.tipo === "indice" ? "indice" : "settore";
      $("#links").innerHTML = `<button class="btn-link" type="button" id="sec-azioni" data-filtro="${filtro}" data-nome="${esc(d.nome)}">Le sue ${(d.titoli || []).length} azioni nella pagina Azioni →</button>`;
    } else {
    $("#kicker").textContent = `USA · Settori · ${d.gics}`;
    $("#titolo").innerHTML = `${esc(d.nome)}<span class="etf">${d.etf}</span>`;
    $("#links").innerHTML = `
      <a class="btn-link" href="https://www.tradingview.com/chart/?symbol=AMEX%3A${d.etf}" target="_blank" rel="noopener">${d.etf} su TradingView ↗</a>
      ${simbolo ? `<a class="btn-link" href="https://www.tradingview.com/chart/?symbol=INDEX%3A${encodeURIComponent(simbolo)}" target="_blank" rel="noopener">Ampiezza del settore (${esc(simbolo)}) ↗</a>` : ""}
      <a class="btn-link" href="https://www.tradingview.com/chart/?symbol=INDEX%3AS5TH" target="_blank" rel="noopener">Ampiezza S&amp;P 500 (S5TH) ↗</a>`;
    }
    const { stato, testo } = descriviStato(d, a);
    const b = $("#stato");
    b.className = "badge st-" + stato;
    b.textContent = testo;
  }

  function disegnaEpisodi() {
    const d = st.dati, a = st.analisi;
    const lv = R.livello(d.etf);
    const primo = d.date[d.b200.findIndex(v => v != null)];
    const n = a.episodi.length;
    $("#riassunto").innerHTML = n
      ? `<b>${n}</b> ${n === 1 ? "zona blu" : "zone blu"} dal ${dataIt(primo)} con livello blu <b>${num(lv, 0)}%</b>` +
        (a.casi3 ? ` · a 3 mesi dal trigger: mediana <b class="${cls(a.mediana3)}">${pct(a.mediana3, 1)}</b>, in guadagno <b>${num(a.positivi3, 0)}%</b> su ${a.casi3} ${a.casi3 === 1 ? "caso" : "casi"}` : "")
      : `Nessuna zona blu dal ${dataIt(primo)} con livello ${num(lv, 0)}%. Prova ad alzare il livello.`;
    const head = `<thead>
      <tr class="grp"><th colspan="4" class="l">Ingresso in zona blu</th><th colspan="6" class="l">Trigger</th></tr>
      <tr><th class="l">Data</th><th>Ampiezza min.</th><th>Drawdown</th><th>+3M</th>
      <th class="l">Data</th><th class="l">Conferme</th><th>+1M</th><th>+3M</th><th>+6M</th><th>Calo max 3M</th></tr>
    </thead>`;
    const rows = a.episodi.slice().reverse().map(e => {
      let seg, motivo;
      if (e.segnale != null) {
        seg = dataIt(d.date[e.segnale]);
        if (e.stato === "verifica") seg += ` <span class="tag ok">in verifica</span>`;
        motivo = R.tagMotivi(e.motivi);
      } else {
        seg = `<span class="tag warn">in attesa</span>`; motivo = "—";
      }
      if (e.falliti.length) seg += `<small class="muted sub-line">${e.falliti.length} ${e.falliti.length === 1 ? "trigger fallito" : "trigger falliti"} prima</small>`;
      const td = v => `<td class="${cls(v)}">${pct(v, 1)}</td>`;
      return `<tr class="${e.segnale == null ? "open" : ""}">
        <td class="l">${dataIt(d.date[e.inizio])}</td>
        <td>${num(e.minB, 1)}%</td>
        <td>${pct(e.ddInizio, 1)}</td>
        ${td(e.r3Inizio)}
        <td class="l">${seg}</td>
        <td class="conf">${motivo}</td>
        ${td(e.r1)}${td(e.r3)}${td(e.r6)}
        <td>${e.caloMax == null ? "—" : pct(e.caloMax, 1)}</td>
      </tr>`;
    }).join("");
    $("#episodi").innerHTML = head + `<tbody>${rows || `<tr><td colspan="10" class="muted" style="text-align:left">Nessun episodio</td></tr>`}</tbody>`;
  }

  function disegnaKpi() {
    const d = st.dati, N = d.date.length;
    const lv = R.livello(d.etf);
    const b200 = d.b200[N - 1], b50 = d.b50[N - 1], n = d.n[N - 1];
    const sopra = b200 == null ? null : Math.round((b200 / 100) * n);
    const dd = d.dd[N - 1];
    const rank = st.analisi.ddPerc[N - 1];
    const dist = b200 == null ? null : b200 - lv;
    const ultimo = d.close[N - 1];
    const vsMa = ultimo != null && d.ma200[N - 1] ? (ultimo / d.ma200[N - 1] - 1) * 100 : null;
    const anno = a => a.slice(Math.max(0, N - 252));
    const c = R.colori();
    const tile = (k, l, v, sub, extra = "") => `<div class="kpi" style="--k:${k}"><div class="l"><i></i>${l}</div><div class="v">${v}</div><div class="s">${sub}</div>${extra}</div>`;
    const P = R.parametri();
    const tl = R.titoliLivello(b200, n, lv);
    const distCol = dist == null ? "var(--faint)" : dist <= 0 ? "var(--st-blu)" : dist <= P.fasciaAttenzione ? "var(--st-attenzione)" : "var(--faint)";
    $("#kpi").innerHTML =
      tile("var(--price)", eu() ? (d.prezzo_tipo === "indice" ? `Ultimo ${esc(d.nome)}` : "Paniere del settore") : `Ultimo ${d.etf}`, num(ultimo, 2), `<span class="${cls(vsMa)}">${vsMa == null ? "—" : pct(vsMa, 1)}</span> sulla media 200`,
        R.sparkline(anno(d.close), { colore: c.price })) +
      tile("var(--b200)", "Titoli sopra la media 200", sopra == null ? "—" : `${sopra}<small> su ${n}</small>`, `${num(b200, 1)}% · ultimi 12 mesi`,
        R.sparkline(anno(d.b200), { colore: c.b200, livello: lv, min: 0, area: true })) +
      tile("var(--b50)", "Titoli sopra la media 50", `${num(b50, 1)}<small>%</small>`, "ultimi 12 mesi",
        R.sparkline(anno(d.b50), { colore: c.b50, min: 0, max: 100 })) +
      tile(distCol, "Distanza dal livello blu", !tl ? "—" : tl.mancano ? `${tl.mancano}<small> ${tl.mancano === 1 ? "titolo" : "titoli"}</small>` : "al livello",
        `livello ${num(lv, 0)}% = ${tl ? `${tl.soglia}/${tl.n}` : "—"} · ${R.segnato(dist, 1)} punti`,
        `<div class="meter"><i style="width:${Math.max(0, Math.min(100, b200 || 0))}%;background:var(--b200)"></i><s style="left:${Math.min(100, lv)}%"></s></div>`) +
      tile("var(--dd)", "Drawdown a 52 settimane", `<span class="${rank != null && rank > P.ddAttenzione ? "neg" : ""}">${pct(dd, 1)}</span>`,
        rank == null ? "" : `${num(rank, 0)}° percentile della storia`,
        R.sparkline(anno(d.dd), { colore: c.dd, max: 0, area: true }));
  }

  function disegnaLivello() {
    const d = st.dati, N = d.date.length;
    const lv = R.livello(d.etf), def = R.livelloDefault(d.etf);
    const n = d.n[N - 1] || 0;
    const primo = d.date[d.b200.findIndex(v => v != null)];
    const b200 = d.b200[N - 1];
    $("#soglia-card").innerHTML = `
      <h2>Livello blu</h2>
      <p class="sub">% di titoli sopra la media 200 a cui (o sotto cui) può partire la zona blu</p>
      <div class="stepper">
        <button type="button" data-step="-1" aria-label="Abbassa il livello blu">−</button>
        <output id="soglia-val">${num(lv, 0)}%</output>
        <button type="button" data-step="1" aria-label="Alza il livello blu">+</button>
      </div>
      <input type="range" id="soglia-range" min="1" max="60" step="1" value="${lv}" aria-label="Livello blu">
      <div class="gauge" aria-label="Ampiezza attuale rispetto al livello blu">
        <div class="track"><div class="fill" style="width:${Math.max(0, Math.min(100, b200 || 0))}%"></div><div class="mark" style="left:calc(${Math.min(100, lv)}% - 1px)"></div></div>
        <div class="scale"><span>0%</span><span>oggi ${num(b200, 1)}% · livello ${num(lv, 0)}%</span><span>100%</span></div>
      </div>
      <p>Dal ${dataIt(primo)} l'ampiezza ha chiuso a questo livello o sotto ${R.art("nel", `<b>${num(st.analisi.quotaSotto, 1)}%</b>`)} delle sedute.
        ${n ? `${eu() && d.tipo === "indice" ? "L'indice" : "Il settore"} ha ${n} titoli: uno vale <b>${num(100 / n, 1)} punti</b>, quindi il livello ${R.art("del", num(lv, 0) + "%")} vuol dire <b>${R.titoliLivello(0, n, lv).soglia} ${R.titoliLivello(0, n, lv).soglia === 1 ? "titolo" : "titoli"} su ${n}</b> sopra la media 200${R.titoliLivello(0, n, lv).soglia === 0 ? ", cioè tutti sotto" : ""}.` : ""}
        Livello di riarmo: <b>${num(st.analisi.riarmo, 0)}%</b>.</p>
      <p class="small">Predefinito: ${num(def, 0)}% (${eu() ? "5° percentile dell'ampiezza dal 2005: per l'Europa non c'è una tabella di riferimento" : "tabella quant-rea «200 LEVEL SETTORI»"}).
        ${lv !== def ? `<button class="linkish" type="button" id="soglia-reset">Torna a ${num(def, 0)}%</button>` : ""}
        La modifica vale solo in questo browser e serve a vedere come cambiano zone blu, trigger ed episodi.
        <button class="linkish" type="button" id="copia-config">Copia configurazione</button> per renderla valida per tutti (va incollata nel file <code>${eu() ? "europa.json" : "settings.json"}</code>).</p>`;
  }

  function disegnaTitoli() {
    const d = st.dati, N = d.date.length;
    const titoli = d.titoli || [];
    const sopra = titoli.filter(t => t.v200 != null && t.v200 > 0).length;
    const { col, dir } = st.ordine;
    const f = st.filtro.trim().toLowerCase();
    const trova = t => !f || t.t.toLowerCase().includes(f) || (t.nome || "").toLowerCase().includes(f);
    const ordina = (a, b) => {
      if (col === "t") return dir * a.t.localeCompare(b.t);
      const x = a[col], y = b[col];
      if (x == null) return 1; if (y == null) return -1;
      return dir * (x - y);
    };
    const list = titoli.filter(trova).sort(ordina);
    const th = (k, lab, left) => `<th class="sortable${left ? " l" : ""}" data-col="${k}" aria-sort="${col === k ? (dir > 0 ? "ascending" : "descending") : "none"}">${lab}</th>`;
    const tv = t => (eu() ? M.linkTitolo(d.etf, t) : `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(t.replace(/-/g, "."))}`);
    const fuori = eu() ? "" : ` target="_blank" rel="noopener"`;
    const prezzo = t => num(t.ultimo, 2) + (eu() ? `<span class="valuta">${SIMBOLI[t.valuta] || t.valuta || ""}</span>` : "");
    // mappa a tessere: tutti i titoli, dal più forte al più debole rispetto alla media 200
    const tessere = titoli.slice().sort((a, b) => (b.v200 ?? -999) - (a.v200 ?? -999)).map(t => {
      const c = R.divergente(t.v200, 20);
      return `<button type="button" class="tile${t.t === st.titolo ? " on" : ""}${f && !trova(t) ? " off" : ""}" data-t="${esc(t.t)}" style="--c:${c.bg};--tc:${c.testo}"
        title="${esc(t.nome)}${eu() ? ` (${esc(t.t)})` : ""}: ${pct(t.v200, 1)} dalla media 200, ${pct(t.v50, 1)} dalla media 50, ${pct(t.dd52, 1)} dal massimo a 52 settimane"><b>${esc(eu() ? t.t.replace(/\.[A-Z]+$/, "") : t.t)}</b><span>${t.v200 == null ? "—" : pct(t.v200, 1)}</span></button>`;
    }).join("");
    const sel = st.titolo && titoli.find(t => t.t === st.titolo);
    const classifica = titoli.filter(t => t.v200 != null).sort((a, b) => b.v200 - a.v200);
    const posto = sel ? classifica.findIndex(t => t.t === sel.t) + 1 : 0;
    const scheda = sel ? `<div class="stock-detail">
        <div><b>${esc(sel.t)}</b> <span class="sd-name">${esc(sel.nome)}</span></div>
        <div class="controls"><a class="btn-link" href="${tv(sel.t)}"${fuori}>${eu() ? "Scheda dell'azione →" : "Grafico su TradingView ↗"}</a><button class="icon-btn" type="button" id="chiudi-titolo" aria-label="Chiudi la scheda">×</button></div>
        <div class="sd-vals"><span>Ultimo <b>${prezzo(sel)}</b></span><span>vs media 200 <b class="${cls(sel.v200)}">${pct(sel.v200, 1)}</b></span>
          <span>vs media 50 <b class="${cls(sel.v50)}">${pct(sel.v50, 1)}</b></span><span>dal massimo a 52 settimane <b>${pct(sel.dd52, 1)}</b></span>
          ${posto ? `<span>${posto}° su ${classifica.length} ${eu() && d.tipo === "indice" ? "nell'indice" : "nel settore"}</span>` : ""}${eu() && sel.paese ? `<span>${esc(sel.paese)}</span>` : ""}</div>
      </div>` : st.mancante ? `<div class="stock-detail avviso">
        <div><b>${esc(st.mancante.t)}</b> <span class="sd-name">${esc(st.mancante.nome || "")}</span></div>
        <div class="controls"><button class="icon-btn" type="button" id="chiudi-titolo" aria-label="Chiudi l'avviso">×</button></div>
        <div class="sd-vals">È nell'S&amp;P 500 ma Yahoo Finance non ha ancora abbastanza prezzi (servono almeno 50 sedute): comparirà qui con i prossimi aggiornamenti.</div>
      </div>` : "";
    const riga = t => `<tr data-t="${esc(t.t)}" class="${t.t === st.titolo ? "hl" : ""}">
        <td class="l"><span class="stk"><a href="${tv(t.t)}"${fuori} title="${esc(t.nome)}${eu() ? ": scheda dell'azione" : " su TradingView"}">${esc(t.t)}</a><span class="nm">${esc(t.nome)}</span></span></td>
        <td class="${cls(t.v200)}">${pct(t.v200, 1)}</td>
        <td class="${cls(t.v50)}">${pct(t.v50, 1)}</td>
        <td>${pct(t.dd52, 1)}</td>
      </tr>`;
    const tabella = righe => `<div class="stock-col"><table class="tbl stock-tbl">
        <thead><tr>${th("t", "Titolo", true)}${th("v200", "vs media 200")}${th("v50", "vs media 50")}${th("dd52", "Dal massimo")}</tr></thead>
        <tbody>${righe.map(riga).join("")}</tbody></table></div>`;
    // tabella completa, divisa in due colonne quando è lunga
    const meta = Math.ceil(list.length / 2);
    const parti = list.length > 12 ? [list.slice(0, meta), list.slice(meta)] : [list];
    const hadFocus = document.activeElement && document.activeElement.id === "filtro-titoli";
    $("#titoli-card").innerHTML = `
      <div class="card-head titoli-head">
        <div>
          <div class="card-title"><h2>${eu() && d.tipo === "indice" ? "Titoli dell'indice" : "Titoli del settore"}</h2></div>
          <p class="sub">${titoli.length} ${eu() ? (d.tipo === "indice" ? `azioni dell'indice ${esc(d.nome)}` : "azioni europee del settore") : "azioni dell'S&amp;P 500"}, <b>${sopra}</b> sopra la media 200. Clic su una tessera per la scheda del titolo.</p>
        </div>
        <input class="filter" id="filtro-titoli" type="search" placeholder="Filtra per ticker o nome…" value="${esc(st.filtro)}" aria-label="Filtra i titoli">
      </div>
      <div class="tiles">${tessere}</div>
      <div class="tile-scale"><span>−20% o meno</span><i></i><span>+20% o più</span><span class="muted">· distanza dalla media 200</span></div>
      ${scheda}
      ${list.length ? `<div class="stock-cols">${parti.map(tabella).join("")}</div>` : `<p class="muted">Nessun titolo con questo filtro.</p>`}
      <p class="small">Dati al ${dataIt(d.date[N - 1])}. ${eu() ? "Clic su un ticker per la scheda completa dell'azione (grafico, segui, portafoglio), sulla riga per il riepilogo qui. Prezzi nella valuta della borsa." : "Clic su un ticker per il grafico su TradingView, sulla riga per la scheda."} Un titolo quotato da meno di 200 sedute non ha ancora la media 200 e non entra nella percentuale.</p>`;
    if (hadFocus) { const inp = $("#filtro-titoli"); inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
  }

  function mostraTitolo(t, scorri) {
    st.titolo = t || null;
    st.mancante = null;
    disegnaTitoli();
    R.emit("selezione");
    if (t && scorri) {
      const riga = document.querySelector(`#titoli-card tr[data-t="${CSS.escape(t)}"]`);
      const box = document.querySelector("#titoli-card .stock-detail") || riga;
      if (box) box.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }

  function ricalcola() {
    st.analisi = R.analisiSync(st.dati.etf, st.dati);
    disegnaTestata();
    disegnaKpi();
    disegnaGrafici();
    disegnaEpisodi();
    disegnaLivello();
  }

  function aggiornaControlli() {
    R.$$("#periodo button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.p === st.periodo)));
    $("#log").checked = !!st.log;
  }

  function cambiaPeriodo(delta) {
    const lista = ["3A", "10A", "MAX"];
    const k = lista.indexOf(st.periodo);
    st.periodo = lista[Math.max(0, Math.min(lista.length - 1, k + delta))];
    R.store.set("periodo", st.periodo);
    aggiornaControlli();
    if (st.dati) disegnaGrafici();
  }

  function init() {
    $("#regole-settore").innerHTML = R.htmlRegole();
    aggiornaControlli();
    $("#periodo").addEventListener("click", e => {
      const b = e.target.closest("button[data-p]");
      if (!b) return;
      st.periodo = b.dataset.p; R.store.set("periodo", st.periodo);
      aggiornaControlli();
      if (st.dati) disegnaGrafici();
    });
    $("#log").addEventListener("change", e => { st.log = e.target.checked; R.store.set("log", st.log); if (st.dati) disegnaGrafici(); });
    $("#soglia-card").addEventListener("click", e => {
      if (!st.dati) return;
      const b = e.target.closest("button[data-step]");
      if (b) R.impostaLivello(st.dati.etf, R.livello(st.dati.etf) + Number(b.dataset.step));
      if (e.target.id === "soglia-reset") R.ripristinaLivello(st.dati.etf);
      if (e.target.id === "copia-config") {
        const tutte = {};
        M.meta().settori.forEach(s => { tutte[s.etf] = R.livello(s.etf); });
        const txt = `"soglie": ${JSON.stringify(tutte)}`;
        const ok = () => { e.target.textContent = "Copiata ✓"; setTimeout(() => { e.target.textContent = "Copia configurazione"; }, 1800); };
        try { navigator.clipboard.writeText(txt).then(ok, () => window.prompt("Copia questo testo:", txt)); }
        catch (err) { window.prompt("Copia questo testo:", txt); }
      }
    });
    $("#soglia-card").addEventListener("input", e => { if (e.target.id === "soglia-range") $("#soglia-val").textContent = e.target.value + "%"; });
    $("#soglia-card").addEventListener("change", e => { if (st.dati && e.target.id === "soglia-range") R.impostaLivello(st.dati.etf, Number(e.target.value)); });
    $("#links").addEventListener("click", e => {
      const b = e.target.closest("#sec-azioni");
      if (b && R.viste.eur && R.viste.eur.filtra) R.viste.eur.filtra(b.dataset.filtro, b.dataset.nome);
    });
    $("#titoli-card").addEventListener("click", e => {
      if (e.target.id === "chiudi-titolo") { mostraTitolo(null); return; }
      const tile = e.target.closest(".tile[data-t]");
      if (tile) { mostraTitolo(tile.dataset.t === st.titolo ? null : tile.dataset.t, false); return; }
      const th = e.target.closest("th[data-col]");
      if (th) {
        const col = th.dataset.col;
        st.ordine = { col, dir: st.ordine.col === col ? -st.ordine.dir : (col === "t" ? 1 : -1) };
        R.store.set("ordine", st.ordine);
        disegnaTitoli();
        return;
      }
      const tr = e.target.closest("tr[data-t]");
      if (tr && !e.target.closest("a")) mostraTitolo(tr.dataset.t === st.titolo ? null : tr.dataset.t, false);
    });
    $("#titoli-card").addEventListener("input", e => { if (e.target.id === "filtro-titoli") { st.filtro = e.target.value; disegnaTitoli(); } });

    R.on("livelli", etf => { if (st.visibile && st.dati && etf === st.dati.etf) ricalcola(); });
    R.on("tema", () => { if (st.visibile && st.dati) { disegnaGrafici(); disegnaKpi(); disegnaTitoli(); } });
    const taglia = () => window.matchMedia("(max-width: 720px)").matches ? "s" :
      window.matchMedia("(min-height: 900px) and (min-width: 1280px)").matches ? "l" : "m";
    let ultima = taglia();
    window.addEventListener("resize", () => {
      const now = taglia();
      if (now !== ultima) { ultima = now; if (grafici) { creaGrafici(); if (st.dati && st.visibile) disegnaGrafici(); } }
    });
  }

  // un gruppo europeo si può chiamare anche per nome («Energia», «FTSE MIB», vecchi indirizzi)
  const slug = x => String(x || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "");

  async function mostra(param, ctx) {
    st.visibile = true;
    const m = R.mercato(ctx && ctx.zona);
    if (m !== M) {
      scelti[M.zona] = st.etf; M = m; st.etf = scelti[M.zona]; st.dati = null; st.analisi = null;
      // niente numeri dell'altro mercato mentre arrivano quelli nuovi
      ["#kpi", "#titoli-card", "#soglia-card", "#links", "#riassunto", "#episodi", "#legenda"].forEach(k => { $(k).innerHTML = ""; });
      $("#kicker").textContent = M.zona === "eur" ? "Europa · Settori e indici" : "USA · Settori";
      $("#titolo").innerHTML = "&nbsp;";
      $("#stato").className = "badge"; $("#stato").innerHTML = "&nbsp;";
      if (grafici) { creaGrafici(); }
    }
    $("#regole-settore").innerHTML = R.htmlRegole(false, M);
    R.testiZona($("#view-sec"), M.zona);
    try { await M.pronto(); }
    catch (e) { $("#titolo").textContent = "I dati dell'ampiezza europea non ci sono ancora"; $("#kicker").textContent = "Europa · Settori"; return; }
    if (m !== M || !st.visibile) return;
    const [p0, p1] = String(param || "").split("/");
    const elenco = M.meta().settori;
    let etf = (p0 || st.etf || "").toUpperCase();
    if (!elenco.some(s => s.etf === etf)) {
      const k = slug(p0 || st.etf);
      const x = k && elenco.find(s => s.etf === k || slug(s.nome) === k || slug(s.codice) === k);
      etf = x ? x.etf : elenco[0].etf;
    }
    const titolo = p1 ? p1.toUpperCase() : null;
    st.etf = scelti[M.zona] = etf;
    R.store.set(eu() ? "settoreEu" : "settore", etf);
    R.emit("settore", etf);
    document.title = `${R.codice(etf)} · Radar Settori`;
    if (!grafici) creaGrafici();
    let d;
    try { d = await M.settore(etf); }
    catch (e) { $("#titolo").textContent = eu() ? "Dati del gruppo non disponibili" : "Dati del settore non disponibili"; return; }
    if (st.etf !== etf || !st.visibile || m !== M) return;
    const nuovo = st.dati !== d;
    st.dati = d;
    if (nuovo) { st.filtro = ""; st.titolo = null; }
    st.mancante = null;
    ricalcola();
    if (titolo && (d.titoli || []).some(t => t.t === titolo)) { st.filtro = ""; mostraTitolo(titolo, true); return; }
    if (titolo && !eu()) {
      // nell'indice ma senza abbastanza prezzi: lo si dice invece di non mostrare niente
      const x = R._mappaTitoli && R._mappaTitoli.get(titolo);
      st.titolo = null;
      st.mancante = { t: titolo, nome: x ? x.nome : "" };
    }
    disegnaTitoli();
    if (st.mancante) { const box = document.querySelector("#titoli-card .stock-detail"); if (box) box.scrollIntoView({ block: "center", behavior: "smooth" }); }
  }

  function nascondi() { st.visibile = false; }

  // ---------- testo per la chat: tutto quello che mostra la pagina del settore ----------
  function contesto() {
    if (!st.dati || !st.analisi) return "## Pagina aperta: Settore\nI dati del settore non sono ancora caricati.";
    const d = st.dati, a = st.analisi, N = d.date.length, t = N - 1;
    const lv = R.livello(d.etf), def = R.livelloDefault(d.etf);
    const P = R.parametri();
    const out = [];
    const { testo } = descriviStato(d, a);
    const periodo = { "3A": "ultimi 3 anni", "10A": "ultimi 10 anni", MAX: "dal 2005" }[st.periodo] || st.periodo;
    const X = eu() ? (d.prezzo_tipo === "indice" ? "livello dell'indice" : "paniere") : "ETF";
    out.push(eu()
      ? `## Pagina aperta: Europa · Settori · ${d.tipo === "indice" ? `indice ${d.nome} (${d.paese})` : `settore ${d.nome} (tutte le borse europee del sito)`}, dati al ${dataIt(d.date[t])}`
      : `## Pagina aperta: Settore ${d.etf} · ${d.nome} (GICS ${d.gics}), dati al ${dataIt(d.date[t])}`);
    if (eu()) out.push(`Prezzo usato: ${d.prezzo_tipo === "indice" ? `livello dell'indice ${d.nome} in punti (Yahoo Finance)` : "paniere a pesi uguali delle azioni del gruppo, in euro, base 100"}. ` +
      "Ampiezza calcolata con le azioni di oggi anche per gli anni passati (survivorship bias); livello blu predefinito = 5° percentile dell'ampiezza dal 2005.");
    out.push(`La pagina mostra: stato ${eu() ? "del gruppo" : "del settore"}, riquadri con i numeri di oggi, un grafico a tre pannelli ` +
      `(${eu() ? X : "prezzo dell'ETF"} con la media a 200 sedute e i triangoli dei trigger; drawdown dal massimo a 52 settimane; ` +
      "percentuale di titoli sopra la media 200 e 50 con la linea tratteggiata del livello blu e le zone blu colorate), " +
      `la mappa a tessere e la tabella di tutti i titoli ${eu() && d.tipo === "indice" ? "dell'indice" : "del settore"}, gli episodi di zona blu, il livello blu regolabile e le regole.`);
    out.push(`Grafico impostato su: ${periodo}${st.log ? ", scala logaritmica" : ""}.`);
    out.push(`Stato: ${testo}.`);
    const b200 = d.b200[t], n = d.n[t];
    const sopra = b200 == null ? null : Math.round((b200 / 100) * n);
    const vsMa = d.close[t] != null && d.ma200[t] ? (d.close[t] / d.ma200[t] - 1) * 100 : null;
    out.push(`Oggi: ${X} ${num(d.close[t], 2)} (${pct(vsMa, 1)} sulla media 200 a ${num(d.ma200[t], 2)}); ` +
      `${sopra == null ? "—" : sopra} titoli su ${n} sopra la media 200 = ${num(b200, 1)}%; sopra la media 50 ${num(d.b50[t], 1)}%` +
      `${d.b20 ? `; sopra la media 20 ${num(d.b20[t], 1)}%` : ""}; drawdown ${pct(d.dd[t], 1)}, più profondo ${R.art("del", num(a.ddPerc[t], 0) + "%")} delle sedute passate.`);
    out.push(`Livello blu in uso: ${num(lv, 0)}%${lv !== def ? ` (cambiato in questo browser; quello predefinito è ${num(def, 0)}%)` : " (predefinito)"}; ` +
      `distanza ${R.segnato(b200 == null ? null : b200 - lv, 1)} punti (un titolo vale ${num(100 / Math.max(1, n), 1)} punti; il livello corrisponde a ${(R.titoliLivello(b200, n, lv) || {}).soglia} titoli su ${n} sopra la media 200 e ne devono ancora scendere ${(R.titoliLivello(b200, n, lv) || {}).mancano}); ` +
      `dal ${dataIt(d.date[d.b200.findIndex(v => v != null)])} l'ampiezza è stata al livello o sotto ${R.art("nel", num(a.quotaSotto, 1) + "%")} delle sedute; ` +
      `livello di riarmo ${num(a.riarmo, 0)}%${a.armato ? "" : " (per ora nuova zona blu bloccata: l'ampiezza deve prima tornare sopra il riarmo)"}.`);
    if (a.manca) {
      const m = a.manca;
      out.push(`Cosa manca al trigger: ${m.punti > 0 ? `altri ${num(m.punti, 1)} punti di ampiezza, fino ${R.art("al", num(m.obiettivo, 1) + "%")}` : "l'ampiezza ha già recuperato abbastanza"}; ` +
        `conferme presenti oggi: ${m.conferme.length ? m.conferme.map(x => S.MOTIVI[x]).join(", ") : "nessuna"} (ne ${m.servono === 1 ? "serve 1" : "servono 2"}); rimbalzo a V sopra ${R.art("il", num(m.riarmo, 0) + "%")}.`);
    }

    // storico: fine di ogni mese nel periodo del grafico, più le ultime sedute
    const [i0] = intervallo();
    out.push(`Storico a fine mese (${periodo}): data | chiusura ${X} | media 200 | drawdown | % sopra media 200 | % sopra media 50 | stato`);
    const riga = i => `${dataIt(d.date[i])} | ${num(d.close[i], 2)} | ${num(d.ma200[i], 2)} | ${pct(d.dd[i], 1)} | ${num(d.b200[i], 1)} | ${num(d.b50[i], 1)} | ${S.STATI[a.stati[i]] || "—"}`;
    for (let i = i0; i <= t; i++) {
      if (i === t || d.date[i + 1].slice(0, 7) !== d.date[i].slice(0, 7)) out.push(riga(i));
    }
    out.push("Ultime 10 sedute:");
    for (let i = Math.max(0, t - 9); i <= t; i++) out.push(riga(i));

    // episodi
    const ep = a.episodi;
    out.push(`Episodi di zona blu dal 2005 con livello ${num(lv, 0)}%: ${ep.length}` +
      (a.casi3 ? `; a 3 mesi dal trigger mediana ${pct(a.mediana3, 1)}, in guadagno ${R.art("il", num(a.positivi3, 0) + "%")} dei ${a.casi3} casi` : "") + ".");
    if (ep.length) {
      out.push(`inizio zona blu | ampiezza minima | drawdown all'ingresso | ${X} a 3 mesi dall'ingresso | trigger | conferme | ${X} a +1M, +3M, +6M dal trigger | calo massimo nei 3 mesi dopo il trigger | trigger falliti prima`);
      for (const e of ep.slice().reverse()) {
        const trig = e.segnale != null ? `${dataIt(d.date[e.segnale])}${e.stato === "verifica" ? " (in verifica)" : ""}` : "nessuno (zona blu in corso)";
        out.push(`${dataIt(d.date[e.inizio])} | ${num(e.minB, 1)}% | ${pct(e.ddInizio, 1)} | ${pct(e.r3Inizio, 1)} | ${trig} | ${e.motivi.map(x => S.MOTIVI[x]).join(" + ") || "—"} | ` +
          `${pct(e.r1, 1)}, ${pct(e.r3, 1)}, ${pct(e.r6, 1)} | ${e.caloMax == null ? "—" : pct(e.caloMax, 1)} | ${e.falliti.length}`);
      }
    }

    // titoli
    const titoli = (d.titoli || []).slice().sort((x, y) => (y.v200 ?? -999) - (x.v200 ?? -999));
    out.push(`Tutti i ${titoli.length} titoli ${eu() ? (d.tipo === "indice" ? "dell'indice (prezzi nella valuta della borsa)" : "del settore (azioni europee, prezzi nella valuta della borsa)") : "del settore (azioni dell'S&P 500)"}, dal più forte al più debole rispetto alla media 200: ticker | nome | ultimo prezzo | distanza dalla media 200 | dalla media 50 | dal massimo a 52 settimane`);
    for (const x of titoli) out.push(`${x.t} | ${x.nome} | ${num(x.ultimo, 2)} | ${pct(x.v200, 1)} | ${pct(x.v50, 1)} | ${pct(x.dd52, 1)}`);
    const sel = st.titolo && titoli.find(x => x.t === st.titolo);
    if (sel) out.push(`Titolo aperto nella scheda: ${sel.t} (${sel.nome}), ${titoli.filter(x => x.v200 != null).findIndex(x => x.t === sel.t) + 1}° su ${titoli.filter(x => x.v200 != null).length} per distanza dalla media 200.`);
    if (st.mancante) out.push(`Titolo cercato ma senza prezzi sufficienti: ${st.mancante.t} ${st.mancante.nome || ""}.`);
    if (st.filtro) out.push(`Filtro dei titoli attivo: «${st.filtro}».`);
    out.push(`Regole in uso: zona blu con ${P.chiusureIngresso} chiusure al livello o sotto e drawdown oltre ${R.art("il", P.ddIngresso + "°")} percentile; verifica del trigger per ${P.verifica} sedute; cooldown di ${P.cooldown} sedute.`);
    return out.join("\n");
  }

  function tasto(e) {
    if (e.key === "ArrowLeft") { cambiaPeriodo(-1); return true; }
    if (e.key === "ArrowRight") { cambiaPeriodo(1); return true; }
    return false;
  }

  R.viste.sec = { init, mostra, nascondi, tasto, etfCorrente: () => st.etf, titoloCorrente: () => st.titolo, descriviStato, contesto };
})();
