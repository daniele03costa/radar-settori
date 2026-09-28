/*
 * Radar Settori — vista 4: dettaglio di un settore.
 */
(function () {
  "use strict";

  const R = window.Radar, S = window.Signals;
  const { $, num, pct, cls, dataIt, esc } = R;

  const st = {
    etf: R.store.get("settore", "XLK"),
    periodo: R.store.get("periodo", "3A"),
    log: R.store.get("log", false),
    ordine: R.store.get("ordine", { col: "v200", dir: -1 }),
    filtro: "",
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
      etichettaZona: "ZONA BLU",
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
        prezzo: `Prezzo ${d.etf} e media a 200 sedute`,
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
      testo = `Zona blu dal ${dataIt(d.date[ep.inizio])} (${R.sedute(dur)}) · per il trigger ${servono === 1 ? "serve 1 conferma" : "servono 2 conferme"}`;
    } else if (stato === "trigger" && ep && ep.segnale != null) {
      testo = `Trigger del ${dataIt(d.date[ep.segnale])} · in verifica (${N - 1 - ep.segnale}/${P.verifica} sedute)`;
    } else if (stato === "fallito") {
      testo = "Il trigger è fallito oggi · si torna in zona blu";
    } else if (stato === "cooldown" && ep && ep.segnale != null) {
      testo = `Cooldown dopo il trigger del ${dataIt(d.date[ep.segnale])} · ancora ${R.sedute(Math.max(0, P.cooldown - (N - 1 - ep.segnale)))}`;
    } else if (stato === "attenzione") {
      testo = dist != null && dist <= P.fasciaAttenzione
        ? `Attenzione · ampiezza a ${num(Math.max(0, dist), 1)} punti dal livello blu`
        : "Attenzione · drawdown tra i più profondi della storia del settore";
    } else {
      testo = dist == null ? "Ampiezza non disponibile" : `Normale · ampiezza ${num(dist, 1)} punti sopra il livello blu`;
    }
    if (!a.armato && (stato === "normale" || stato === "attenzione")) testo += ` · nuova zona blu solo dopo il ritorno sopra il ${num(a.riarmo, 0)}%`;
    return { stato, testo };
  }

  function disegnaTestata() {
    const d = st.dati, a = st.analisi;
    const meta = R.meta.settori.find(s => s.etf === d.etf) || {};
    const simbolo = d.simbolo_breadth || meta.simbolo_breadth;
    $("#kicker").textContent = `Select Sector SPDR · ${d.gics}`;
    $("#titolo").innerHTML = `${esc(d.nome)}<span class="etf">${d.etf}</span>`;
    $("#links").innerHTML = `
      <a class="btn-link" href="https://www.tradingview.com/chart/?symbol=AMEX%3A${d.etf}" target="_blank" rel="noopener">${d.etf} su TradingView ↗</a>
      ${simbolo ? `<a class="btn-link" href="https://www.tradingview.com/chart/?symbol=INDEX%3A${encodeURIComponent(simbolo)}" target="_blank" rel="noopener">Ampiezza del settore (${esc(simbolo)}) ↗</a>` : ""}
      <a class="btn-link" href="https://www.tradingview.com/chart/?symbol=INDEX%3AS5TH" target="_blank" rel="noopener">Ampiezza S&amp;P 500 (S5TH) ↗</a>`;
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
    const head = `<thead><tr>
      <th>Inizio zona blu</th><th>Ampiezza minima</th><th>Drawdown all'ingresso</th><th>+3M dall'ingresso</th>
      <th>Trigger</th><th style="text-align:left">Conferme</th><th>+1M</th><th>+3M</th><th>+6M</th><th>Calo max 3M</th>
    </tr></thead>`;
    const rows = a.episodi.slice().reverse().map(e => {
      let seg, motivo;
      if (e.segnale != null) {
        seg = dataIt(d.date[e.segnale]);
        if (e.stato === "verifica") seg += ` <span class="tag ok">in verifica</span>`;
        motivo = e.motivi.map(m => S.MOTIVI[m]).join(" + ");
      } else {
        seg = `<span class="tag warn">in attesa</span>`; motivo = "—";
      }
      if (e.falliti.length) seg += `<small class="muted sub-line">${e.falliti.length} ${e.falliti.length === 1 ? "trigger fallito" : "trigger falliti"} prima</small>`;
      const td = v => `<td class="${cls(v)}">${pct(v, 1)}</td>`;
      return `<tr class="${e.segnale == null ? "open" : ""}">
        <td>${dataIt(d.date[e.inizio])}</td>
        <td>${num(e.minB, 1)}%</td>
        <td class="${cls(e.ddInizio)}">${pct(e.ddInizio, 1)}</td>
        ${td(e.r3Inizio)}
        <td>${seg}</td>
        <td class="txt">${motivo}</td>
        ${td(e.r1)}${td(e.r3)}${td(e.r6)}
        <td class="${cls(e.caloMax)}">${e.caloMax == null ? "—" : pct(e.caloMax, 1)}</td>
      </tr>`;
    }).join("");
    $("#episodi").innerHTML = head + `<tbody>${rows || `<tr><td colspan="10" class="muted" style="text-align:left;font-family:var(--font-ui)">Nessun episodio</td></tr>`}</tbody>`;
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
    const meter = (v, k) => `<div class="meter"><i style="width:${Math.max(0, Math.min(100, v || 0))}%;background:${k}"></i><s style="left:${Math.min(100, lv)}%"></s></div>`;
    const tile = (k, l, v, sub, extra = "") => `<div class="kpi" style="--k:${k}"><div class="l">${l}</div><div class="v">${v}</div><div class="s">${sub}</div>${extra}</div>`;
    const distCol = dist == null ? "var(--line-2)" : dist <= 0 ? "var(--st-blu)" : dist <= 10 ? "var(--st-attenzione)" : "var(--pos)";
    $("#kpi").innerHTML =
      tile("var(--price)", `Ultimo ${d.etf}`, num(ultimo, 2), `<span class="${cls(vsMa)}">${vsMa == null ? "—" : pct(vsMa, 1)}</span> vs media 200`) +
      tile("var(--b200)", "Sopra M200", sopra == null ? "—" : `${sopra}<small>/${n}</small>`, `${num(b200, 1)}% del settore`, meter(b200, "var(--b200)")) +
      tile("var(--b50)", "Sopra M50", `${num(b50, 1)}<small>%</small>`, "breve periodo", meter(b50, "var(--b50)")) +
      tile(distCol, "Dal livello blu", dist == null ? "—" : `<span style="color:${distCol}">${R.segnato(dist, 1)}</span><small> pt</small>`,
        dist != null && dist <= 0 ? "sotto il livello blu" : `livello blu ${num(lv, 0)}%`) +
      tile("var(--dd)", "Drawdown 52s", `<span class="${rank != null && rank > 80 ? "neg" : ""}">${pct(dd, 1)}</span>`, "dal massimo a 52 settimane") +
      tile("var(--accent-2)", "Profondità DD", rank == null ? "—" : `${num(rank, 0)}<small>° perc.</small>`, "rispetto alle sedute passate");
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
      <p>Dal ${dataIt(primo)} l'ampiezza ha chiuso a questo livello o sotto nel <b>${num(st.analisi.quotaSotto, 1)}%</b> delle sedute.
        ${n ? `Il settore ha ${n} titoli: uno vale <b>${num(100 / n, 1)} punti</b>.` : ""}
        Livello di riarmo: <b>${num(st.analisi.riarmo, 0)}%</b>.</p>
      <p class="small">Predefinito: ${num(def, 0)}% (tabella quant-rea «200 LEVEL SETTORI»).
        ${lv !== def ? `<button class="linkish" type="button" id="soglia-reset">Torna a ${num(def, 0)}%</button>` : ""}
        La modifica vale solo in questo browser e serve a vedere come cambiano zone blu, trigger ed episodi.
        <button class="linkish" type="button" id="copia-config">Copia configurazione</button> per renderla valida per tutti (va incollata in <code>config/settings.json</code>).</p>`;
  }

  function disegnaTitoli() {
    const d = st.dati, N = d.date.length;
    const titoli = d.titoli || [];
    const sopra = titoli.filter(t => t.v200 != null && t.v200 > 0).length;
    const { col, dir } = st.ordine;
    const f = st.filtro.trim().toLowerCase();
    const list = titoli
      .filter(t => !f || t.t.toLowerCase().includes(f) || (t.nome || "").toLowerCase().includes(f))
      .slice()
      .sort((a, b) => {
        if (col === "t") return dir * a.t.localeCompare(b.t);
        const x = a[col], y = b[col];
        if (x == null) return 1; if (y == null) return -1;
        return dir * (x - y);
      });
    const th = (k, lab) => `<th class="sortable" data-col="${k}" aria-sort="${col === k ? (dir > 0 ? "ascending" : "descending") : "none"}">${lab}</th>`;
    const bar = v => {
      if (v == null) return "";
      const w = Math.min(50, Math.abs(v) * 1.5);
      return `<span class="minibar"><i style="left:${v >= 0 ? 50 : 50 - w}%;width:${w}%;background:${v >= 0 ? "var(--pos)" : "var(--neg)"}"></i></span>`;
    };
    const hadFocus = document.activeElement && document.activeElement.id === "filtro-titoli";
    $("#titoli-card").innerHTML = `
      <h2>Titoli del settore</h2>
      <p class="sub">${sopra} su ${titoli.length} sopra la media 200 · al ${dataIt(d.date[N - 1])} · in cima chi è più sopra, in fondo chi è più sotto</p>
      <input class="filter" id="filtro-titoli" type="search" placeholder="Cerca titolo…" value="${esc(st.filtro)}" aria-label="Cerca titolo">
      <div class="stock-list">
        <table class="tbl">
          <thead><tr>${th("t", "Titolo")}${th("v200", "vs M200")}${th("v50", "vs M50")}${th("dd52", "DD 52s")}</tr></thead>
          <tbody>${list.map(t => `<tr>
            <td><a href="https://www.tradingview.com/chart/?symbol=${encodeURIComponent(t.t.replace(/-/g, "."))}" target="_blank" rel="noopener" title="${esc(t.nome)} su TradingView">${esc(t.t)}</a><small>${esc(t.nome)}</small></td>
            <td class="${cls(t.v200)}">${pct(t.v200, 1)}${bar(t.v200)}</td>
            <td class="${cls(t.v50)}">${pct(t.v50, 1)}</td>
            <td class="${cls(t.dd52)}">${pct(t.dd52, 1)}</td>
          </tr>`).join("") || `<tr><td colspan="4" class="muted">Nessun titolo</td></tr>`}</tbody>
        </table>
      </div>`;
    if (hadFocus) { const inp = $("#filtro-titoli"); inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
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
      const b = e.target.closest("button[data-step]");
      if (b) R.impostaLivello(st.dati.etf, R.livello(st.dati.etf) + Number(b.dataset.step));
      if (e.target.id === "soglia-reset") R.ripristinaLivello(st.dati.etf);
      if (e.target.id === "copia-config") {
        const tutte = {};
        R.meta.settori.forEach(s => { tutte[s.etf] = R.livello(s.etf); });
        const txt = `"soglie": ${JSON.stringify(tutte)}`;
        const ok = () => { e.target.textContent = "Copiata ✓"; setTimeout(() => { e.target.textContent = "Copia configurazione"; }, 1800); };
        try { navigator.clipboard.writeText(txt).then(ok, () => window.prompt("Copia questo testo:", txt)); }
        catch (err) { window.prompt("Copia questo testo:", txt); }
      }
    });
    $("#soglia-card").addEventListener("input", e => { if (e.target.id === "soglia-range") $("#soglia-val").textContent = e.target.value + "%"; });
    $("#soglia-card").addEventListener("change", e => { if (e.target.id === "soglia-range") R.impostaLivello(st.dati.etf, Number(e.target.value)); });
    $("#titoli-card").addEventListener("click", e => {
      const th = e.target.closest("th[data-col]");
      if (!th) return;
      const col = th.dataset.col;
      st.ordine = { col, dir: st.ordine.col === col ? -st.ordine.dir : (col === "t" ? 1 : -1) };
      R.store.set("ordine", st.ordine);
      disegnaTitoli();
    });
    $("#titoli-card").addEventListener("input", e => { if (e.target.id === "filtro-titoli") { st.filtro = e.target.value; disegnaTitoli(); } });

    R.on("livelli", etf => { if (st.visibile && st.dati && etf === st.dati.etf) ricalcola(); });
    R.on("tema", () => { if (st.visibile && st.dati) disegnaGrafici(); });
    const taglia = () => window.matchMedia("(max-width: 720px)").matches ? "s" :
      window.matchMedia("(min-height: 900px) and (min-width: 1280px)").matches ? "l" : "m";
    let ultima = taglia();
    window.addEventListener("resize", () => {
      const now = taglia();
      if (now !== ultima) { ultima = now; if (grafici) { creaGrafici(); if (st.dati && st.visibile) disegnaGrafici(); } }
    });
  }

  async function mostra(param) {
    st.visibile = true;
    let etf = (param || st.etf || "").toUpperCase();
    if (!R.meta.settori.some(s => s.etf === etf)) etf = R.meta.settori[0].etf;
    st.etf = etf;
    R.store.set("settore", etf);
    R.emit("settore", etf);
    document.title = `${etf} · Radar Settori`;
    if (!grafici) creaGrafici();
    let d;
    try { d = await R.dati.settore(etf); }
    catch (e) { $("#titolo").textContent = "Dati del settore non disponibili"; return; }
    if (st.etf !== etf || !st.visibile) return;
    const nuovo = st.dati !== d;
    st.dati = d;
    if (nuovo) st.filtro = "";
    ricalcola();
    disegnaTitoli();
  }

  function nascondi() { st.visibile = false; }

  function tasto(e) {
    if (e.key === "ArrowLeft") { cambiaPeriodo(-1); return true; }
    if (e.key === "ArrowRight") { cambiaPeriodo(1); return true; }
    return false;
  }

  R.viste.sec = { init, mostra, nascondi, tasto, etfCorrente: () => st.etf, descriviStato };
})();
