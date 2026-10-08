/*
 * Radar Settori — Alert: registro dei cambi di stato dal 2005, con statistiche e la striscia degli stati
 * di ogni settore USA (o di ogni settore e indice europeo) nel tempo.
 */
(function () {
  "use strict";

  const R = window.Radar, S = window.Signals;
  const { $, num, pct, dataIt, esc, cls } = R;
  let visibile = false;
  let tipi = new Set(R.store.get("alr.tipi", ["blu", "trigger", "fallito"]));
  let M = R.mercati.usa;
  const scelte = { usa: R.store.get("alr.settore", ""), eur: R.store.get("alr.settoreEu", "") };
  let settore = scelte.usa;
  let limite = 300;
  let storia = null;   // geometria dell'ultima striscia disegnata (per il passaggio del mouse)
  let ultimo = null;   // ultimi dati calcolati (per la chat)

  const TIPI = ["blu", "trigger", "fallito", "cooldown", "attenzione", "normale"];
  // quale stato vince quando più sedute finiscono nello stesso pixel
  const PRIORITA = { fallito: 6, trigger: 5, blu: 4, attenzione: 3, cooldown: 2, normale: 1 };

  function eventi(etf, d, a) {
    const out = [];
    let prima = null;
    const trigger = new Map(), falliti = new Map();
    for (const e of a.episodi) {
      if (e.segnale != null) trigger.set(e.segnale, { ep: e, motivi: e.motivi });
      for (const f of e.falliti) trigger.set(f, { ep: e, motivi: (e.motiviFalliti || {})[f] || [], fallito: true });
    }
    for (const e of a.episodi) {
      e.falliti.forEach(f => {
        // il giorno del fallimento è il primo "fallito" dopo il trigger f
        for (let t = f + 1; t < a.stati.length; t++) if (a.stati[t] === "fallito") { falliti.set(t, f); break; }
      });
    }
    for (let t = 0; t < a.stati.length; t++) {
      const s = a.stati[t];
      if (!s) continue;
      if (s !== prima) {
        const ev = { t, data: d.date[t], etf, cod: R.codice(etf), da: prima, a: s, b200: d.b200[t], dd: d.dd[t], perc: a.ddPerc[t] };
        if (s === "trigger" && trigger.has(t)) {
          const x = trigger.get(t);
          ev.motivi = x.motivi;
          ev.fallito = !!x.fallito;
          ev.r1 = ret(d.adj, t, 21); ev.r3 = ret(d.adj, t, 63); ev.r6 = ret(d.adj, t, 126);
          ev.dalla = t - x.ep.inizio;
        }
        if (s === "fallito" && falliti.has(t)) ev.trigger = d.date[falliti.get(t)];
        out.push(ev);
      }
      prima = s;
    }
    return out;
  }

  function ret(adj, from, h) {
    const to = from + h;
    if (to >= adj.length || adj[from] == null || adj[to] == null) return null;
    return (adj[to] / adj[from] - 1) * 100;
  }

  const mediana = xs => { if (!xs.length) return null; const s = xs.slice().sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const ms = s => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));

  // ---------- striscia degli stati ----------
  function disegnaStoria(perSettore) {
    const box = $("#alr-storia");
    const W = Math.max(320, box.clientWidth || 900);
    const stretto = W < 640;
    const eu = M.zona === "eur";
    const rowH = stretto ? 13 : 16, gap = stretto ? 5 : 6, lab = eu ? (stretto ? 74 : 104) : (stretto ? 44 : 56), asse = 24;
    const intestazioni = [];            // in Europa: una riga di titolo prima dei settori e prima degli indici
    let righeTot = perSettore.length;
    if (eu && M.tipi) { righeTot += M.tipi.filter(([k]) => perSettore.some(x => x.tipo === k)).length; }
    const H = righeTot * (rowH + gap) - gap + asse + 4;
    const dpr = window.devicePixelRatio || 1;
    let cv = box.querySelector("canvas");
    if (!cv) {
      cv = document.createElement("canvas");
      box.append(cv);
      const tip = document.createElement("div");
      tip.className = "chart-tip"; tip.hidden = true;
      box.append(tip);
    }
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    cv.style.width = W + "px"; cv.style.height = H + "px";
    const ctx = cv.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // asse dei tempi comune: dalla prima seduta con ampiezza all'ultima
    let t0 = Infinity, t1 = -Infinity;
    for (const x of perSettore) {
      const i = x.d.b200.findIndex(v => v != null);
      if (i >= 0) t0 = Math.min(t0, ms(x.d.date[i]));
      t1 = Math.max(t1, ms(x.d.date[x.d.date.length - 1]));
    }
    const x0 = lab, pw = W - lab - 4;
    const X = t => x0 + ((t - t0) / Math.max(1, t1 - t0)) * pw;
    const col = {};
    for (const s of TIPI) col[s] = R.css("--st-" + s);
    const traccia = R.css("--surface-3");
    const inchiostro = R.css("--ink-2"), tenue = R.css("--muted"), griglia = R.css("--grid");

    // anni
    ctx.font = `500 11px ${R.css("--font")}`;
    ctx.textBaseline = "alphabetic";
    const y0 = new Date(t0).getUTCFullYear(), y1 = new Date(t1).getUTCFullYear();
    const passoAnni = pw < 500 ? 5 : pw < 900 ? 2 : 1;
    const yAsse = righeTot * (rowH + gap) - gap;
    for (let y = y0 + 1; y <= y1; y++) {
      const x = Math.round(X(Date.UTC(y, 0, 1))) + 0.5;
      ctx.fillStyle = griglia;
      ctx.fillRect(x, 0, 1, yAsse + 4);
      if ((y - y0 - 1) % passoAnni === 0 && x < x0 + pw - 14) {
        ctx.fillStyle = tenue; ctx.textAlign = "center";
        ctx.fillText(String(y), x, yAsse + 18);
      }
    }

    const righe = [];
    let r = -1, tipoPrima = null;
    perSettore.forEach(x => {
      r++;
      if (eu && M.tipi && x.tipo !== tipoPrima) {
        // riga di titolo del gruppo
        const nome = (M.tipi.find(t => t[0] === x.tipo) || [])[1] || "";
        ctx.globalAlpha = 1;
        ctx.fillStyle = tenue;
        ctx.font = `600 11px ${R.css("--font")}`;
        ctx.textAlign = "left";
        ctx.fillText(nome.toUpperCase(), 0, r * (rowH + gap) + rowH / 2 + 4);
        intestazioni.push(r);
        tipoPrima = x.tipo;
        r++;
      }
      const y = r * (rowH + gap);
      const spento = settore && settore !== x.etf;
      ctx.globalAlpha = spento ? 0.3 : 1;
      ctx.fillStyle = spento ? tenue : inchiostro;
      ctx.font = `600 12px ${R.css("--font")}`;
      ctx.textAlign = "left";
      ctx.fillText(x.cod, 0, y + rowH / 2 + 4, lab - 6);
      // fondo della riga
      ctx.fillStyle = traccia;
      ctx.fillRect(x0, y, pw, rowH);
      // colonne di pixel: vince lo stato più "caldo"
      const st = x.a.stati, dd = x.d.date;
      const per = new Array(Math.ceil(pw)).fill(null);
      for (let i = 0; i < st.length; i++) {
        const s = st[i];
        if (!s || s === "normale") continue;
        const p = Math.max(0, Math.min(per.length - 1, Math.floor(X(ms(dd[i])) - x0)));
        if (!per[p] || PRIORITA[s] > PRIORITA[per[p]]) per[p] = s;
      }
      for (let p = 0; p < per.length; p++) {
        const s = per[p];
        if (!s) continue;
        let q = p;
        while (q + 1 < per.length && per[q + 1] === s) q++;
        ctx.fillStyle = col[s];
        ctx.globalAlpha = (spento ? 0.3 : 1) * (s === "attenzione" ? 0.42 : s === "cooldown" ? 0.6 : 1);
        ctx.fillRect(x0 + p, y, q - p + 1, rowH);
        p = q;
      }
      // trigger e fallimenti: tacche ben visibili
      ctx.globalAlpha = spento ? 0.3 : 1;
      let prima = null;
      for (let i = 0; i < st.length; i++) {
        const s = st[i];
        if ((s === "trigger" && prima !== "trigger") || s === "fallito") {
          const x = Math.round(X(ms(dd[i])));
          ctx.fillStyle = col[s];
          ctx.fillRect(x - 1, y - 2, 3, rowH + 4);
        }
        prima = s;
      }
      ctx.globalAlpha = 1;
      righe.push({ etf: x.etf, nome: x.nome, cod: x.cod, sotto: x.sotto, y, st, dd, r });
    });
    storia = { W, H, x0, pw, rowH, gap, righe, t0, t1, yAsse };
  }

  function tipStoria(ev) {
    const box = $("#alr-storia");
    const cv = box.querySelector("canvas"), tip = box.querySelector(".chart-tip");
    if (!storia || !cv || !tip) return null;
    const rect = cv.getBoundingClientRect();
    const x = ev.clientX - rect.left, y = ev.clientY - rect.top;
    const r = Math.floor(y / (storia.rowH + storia.gap));
    const riga = storia.righe.find(z => z.r === r);
    if (!riga || x < storia.x0 || x > storia.x0 + storia.pw || y > storia.yAsse) { tip.hidden = true; box.classList.remove("puntatore"); return null; }
    const t = storia.t0 + ((x - storia.x0) / storia.pw) * (storia.t1 - storia.t0);
    // seduta più vicina
    let lo = 0, hi = riga.dd.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (ms(riga.dd[m]) < t) lo = m + 1; else hi = m; }
    const i = lo;
    const s = riga.st[i] || "normale";
    // da quanto dura lo stato
    let k = i;
    while (k > 0 && riga.st[k - 1] === riga.st[i]) k--;
    tip.innerHTML = `<div class="d">${esc(riga.cod)} · ${esc(riga.sotto)}</div>
      <div class="r"><span>${dataIt(riga.dd[i])}</span><span class="st-pill st-${s}">${S.STATI[s]}</span></div>
      <div class="r"><span>Stato iniziato il</span><span>${dataIt(riga.dd[k])}</span></div>`;
    tip.hidden = false;
    const left = x + 16 + tip.offsetWidth > rect.width ? x - 16 - tip.offsetWidth : x + 16;
    tip.style.left = Math.max(0, left) + "px";
    tip.style.top = Math.max(0, riga.y - 6 - tip.offsetHeight) + "px";
    if (riga.y - 6 - tip.offsetHeight < 0) tip.style.top = (riga.y + storia.rowH + 8) + "px";
    box.classList.add("puntatore");
    return riga;
  }

  // ---------- vista ----------
  async function disegna() {
    const m = M;
    let tutti;
    try { await m.pronto(); tutti = await m.tutti(); }
    catch (e) {
      if (visibile && m === M) $("#alr-kpi").innerHTML = `<p class="empty-note">${m.zona === "eur" ? "I dati dell'ampiezza europea non ci sono ancora: arrivano con il prossimo aggiornamento automatico." : "Dati non disponibili."}</p>`;
      return;
    }
    if (!visibile || m !== M) return;
    // in Europa: prima i settori, poi gli indici
    const ordine = m.tipi ? m.tipi.flatMap(([k]) => m.meta().settori.filter(s => s.tipo === k)) : m.meta().settori;
    const perSettore = ordine.map(s => {
      const d = tutti[s.etf], a = R.analisiSync(s.etf, d);
      return { etf: s.etf, nome: s.nome, cod: m.cod(s), sotto: m.sotto(s), tipo: s.tipo, d, a, ev: eventi(s.etf, d, a) };
    });
    if (settore && !perSettore.some(x => x.etf === settore)) settore = "";
    const scelti = perSettore.filter(x => !settore || x.etf === settore);

    // statistiche
    const episodi = scelti.flatMap(x => x.a.episodi);
    const confermati = episodi.filter(e => e.segnale != null);
    const nFalliti = episodi.reduce((k, e) => k + e.falliti.length, 0);
    const r3 = confermati.map(e => e.r3).filter(v => v != null);
    const attese = confermati.map(e => e.segnale - e.inizio);
    const primo = perSettore[0] ? perSettore[0].d.date[perSettore[0].d.b200.findIndex(v => v != null)] : "2005-01-03";
    const cambiati = Object.keys(R.livelliLocali).some(k => perSettore.some(x => x.etf === k));
    $("#alr-sub").textContent = `Stati ricalcolati per ogni seduta dal ${dataIt(primo)} con i livelli blu in uso${cambiati ? " (alcuni cambiati in questo browser)" : ""}. ${m.t.rendimenti}` +
      (m.zona === "eur" ? " Le azioni sono quelle di oggi anche per gli anni passati." : "");
    const tile = (k, l, v, s) => `<div class="kpi"${k ? ` style="--k:${k}"` : ""}><div class="l">${k ? "<i></i>" : ""}${l}</div><div class="v">${v}</div><div class="s">${s}</div></div>`;
    $("#alr-kpi").innerHTML =
      tile("var(--st-blu)", "Zone blu", episodi.length, settore ? `${esc(R.codice(settore))}, dal ${primo.slice(0, 4)}` : `${m.t.tuttiI}, dal ${primo.slice(0, 4)}`) +
      tile("var(--st-trigger)", "Trigger confermati", confermati.length, `${nFalliti} ${nFalliti === 1 ? "fallito" : "falliti"} prima`) +
      tile("var(--st-fallito)", "Trigger falliti", `${confermati.length + nFalliti ? num((nFalliti / (confermati.length + nFalliti)) * 100, 0) : "—"}<small>%</small>`, "sul totale dei trigger") +
      tile(null, "3 mesi dopo il trigger", `<span class="${cls(mediana(r3))}">${pct(mediana(r3), 1)}</span>`, `mediana su ${r3.length} ${r3.length === 1 ? "caso" : "casi"}`) +
      tile(null, "Positivi a 3 mesi", `${r3.length ? num((r3.filter(v => v > 0).length / r3.length) * 100, 0) : "—"}<small>%</small>`, "dei trigger con 3 mesi di dati") +
      tile(null, "Attesa del trigger", `${attese.length ? num(mediana(attese), 0) : "—"}<small> sedute</small>`, "mediana dall'ingresso in zona blu");

    if (selectDi !== m.zona) disegnaFiltri();
    disegnaStoria(perSettore);

    // tabella
    let tutte = scelti.flatMap(x => x.ev.map(e => Object.assign(e, { nome: x.nome, sotto: x.sotto })));
    tutte = tutte.filter(e => tipi.has(e.a) && e.da != null).sort((x, y) => (y.data.localeCompare(x.data)) || x.etf.localeCompare(y.etf));
    ultimo = { perSettore, tutte, primo, episodi: episodi.length, confermati: confermati.length, nFalliti, r3, attese };
    const mostrate = tutte.slice(0, limite);
    const pill = s => s ? `<span class="st-pill st-${s}">${S.STATI[s]}</span>` : "";
    $("#alr-conta").textContent = `${tutte.length} ${tutte.length === 1 ? "evento" : "eventi"}`;
    $("#alr-tabella").innerHTML = `<thead><tr>
        <th class="l">Data</th><th class="l">${m.zona === "eur" ? "Gruppo" : "Settore"}</th><th class="l">Cambio</th><th>Ampiezza</th><th>Drawdown</th>
        <th class="l">Dettagli</th><th>+1M</th><th>+3M</th><th>+6M</th>
      </tr></thead><tbody>` +
      (mostrate.map(e => {
        let det = "";
        if (e.a === "trigger") det = R.tagMotivi(e.motivi) + (e.fallito ? ` <span class="tag bad">poi fallito</span>` : "") + (e.dalla != null ? `<small class="sub-line">${R.sedute(e.dalla)} dopo l'ingresso in zona blu</small>` : "");
        else if (e.a === "fallito") det = e.trigger ? `annulla il trigger del ${dataIt(e.trigger)}` : "";
        else if (e.a === "blu") det = `drawdown ${R.art("al", num(e.perc, 0) + "°")} percentile`;
        const r = v => `<td class="${cls(v)}">${e.a === "trigger" ? pct(v, 1) : ""}</td>`;
        return `<tr class="clic" data-etf="${e.etf}">
          <td class="l">${dataIt(e.data)}</td>
          <td class="l"><b>${esc(e.cod)}</b><small class="sub-line">${esc(e.sotto)}</small></td>
          <td class="l nowrap">${pill(e.da)} <span class="muted arrow">→</span> ${pill(e.a)}</td>
          <td>${num(e.b200, 1)}%</td>
          <td>${pct(e.dd, 1)}</td>
          <td class="txt">${det}</td>
          ${r(e.r1)}${r(e.r3)}${r(e.r6)}
        </tr>`;
      }).join("") || `<tr><td colspan="9" class="muted l">Nessun evento con questi filtri.</td></tr>`) +
      "</tbody>" +
      (tutte.length > limite ? `<tfoot><tr><td colspan="9" class="piu"><button class="btn-link" type="button" id="alr-altri">Mostra altri ${Math.min(300, tutte.length - limite)} (di ${tutte.length})</button></td></tr></tfoot>` : "");
  }

  let selectDi = null;     // di quale mercato è l'elenco dei gruppi nel menu
  function disegnaFiltri() {
    selectDi = M.meta() ? M.zona : null;
    $("#alr-tipi").innerHTML = TIPI.map(t => `<button type="button" class="chip-btn st-${t}" data-t="${t}" aria-pressed="${tipi.has(t)}">${S.STATI[t]}</button>`).join("");
    const meta = M.meta();
    const opz = s => `<option value="${s.etf}"${s.etf === settore ? " selected" : ""}>${esc(M.cod(s))} · ${esc(M.sotto(s))}</option>`;
    $("#alr-settore").setAttribute("aria-label", M.t.Gruppo);
    $("#alr-settore").innerHTML = `<option value="">${M.zona === "eur" ? "Tutti i settori e gli indici" : "Tutti i settori"}</option>` + (!meta ? "" : M.tipi
      ? M.tipi.map(([k, nome]) => `<optgroup label="${esc(nome)}">${meta.settori.filter(s => s.tipo === k).map(opz).join("")}</optgroup>`).join("")
      : meta.settori.map(opz).join(""));
    $("#alr-legenda").innerHTML = ["attenzione", "blu", "trigger", "fallito", "cooldown"]
      .map(s => `<span><i class="sw box" style="background:var(--st-${s})"></i>${S.STATI[s]}</span>`).join("") +
      `<span><i class="sw box" style="background:var(--surface-3)"></i>Normale</span>`;
  }

  function init() {
    $("#regole-alert").innerHTML = R.htmlRegole(true);
    disegnaFiltri();
    $("#alr-tipi").addEventListener("click", e => {
      const b = e.target.closest("button[data-t]");
      if (!b) return;
      const t = b.dataset.t;
      if (tipi.has(t)) tipi.delete(t); else tipi.add(t);
      R.store.set("alr.tipi", Array.from(tipi));
      b.setAttribute("aria-pressed", String(tipi.has(t)));
      limite = 300;
      disegna();
    });
    $("#alr-settore").addEventListener("change", e => {
      settore = scelte[M.zona] = e.target.value;
      R.store.set(M.zona === "eur" ? "alr.settoreEu" : "alr.settore", settore);
      limite = 300;
      disegna();
    });
    $("#alr-tabella").addEventListener("click", e => {
      if (e.target.id === "alr-altri") { limite += 300; disegna(); return; }
      const tr = e.target.closest("tr[data-etf]");
      if (tr && !e.target.closest("button")) R.vai(M.link(tr.dataset.etf));
    });
    const box = $("#alr-storia");
    box.addEventListener("mousemove", tipStoria);
    box.addEventListener("mouseleave", () => { const t = box.querySelector(".chart-tip"); if (t) t.hidden = true; box.classList.remove("puntatore"); });
    box.addEventListener("click", e => { const riga = tipStoria(e); if (riga) R.vai(M.link(riga.etf)); });
    R.on("livelli", () => { if (visibile) disegna(); });
    R.on("tema", () => { if (visibile) disegna(); });
    window.addEventListener("resize", R.debounce(() => { if (visibile) disegna(); }, 200));
  }

  // ---------- testo per la chat ----------
  function contesto() {
    if (!ultimo) return "## Pagina aperta: Alert\nI dati non sono ancora caricati.";
    const u = ultimo;
    const out = [];
    const eu = M.zona === "eur";
    out.push(`## Pagina aperta: ${eu ? "Europa" : "USA"} · Alert (storico dei cambi di stato)`);
    out.push(`La pagina mostra le statistiche dei trigger, la striscia degli stati di ogni ${eu ? "settore e indice europeo" : "settore"} dal 2005 (una riga per ${eu ? "gruppo" : "settore"}, colorata per stato), il registro dei cambi di stato e le regole.` +
      (eu ? " Prezzo: livello dell'indice o paniere a pesi uguali del settore; ampiezza calcolata con le azioni di oggi anche per gli anni passati." : ""));
    out.push(`Filtri: tipi di evento ${Array.from(tipi).map(t => S.STATI[t]).join(", ") || "nessuno"}; ${eu ? "gruppo" : "settore"} ${settore ? R.codice(settore) : "tutti"}.`);
    out.push(`Statistiche${settore ? ` di ${R.codice(settore)}` : ` di ${M.t.tuttiI}`} dal ${dataIt(u.primo)}: ${u.episodi} zone blu; ${u.confermati} trigger confermati e ${u.nFalliti} falliti` +
      `${u.confermati + u.nFalliti ? ` (${num((u.nFalliti / (u.confermati + u.nFalliti)) * 100, 0)}% falliti)` : ""}; ` +
      `${eu ? "Prezzo" : "ETF"} a 3 mesi dal trigger: mediana ${pct(mediana(u.r3), 1)}, positivi ${u.r3.length ? num((u.r3.filter(v => v > 0).length / u.r3.length) * 100, 0) : "—"}% su ${u.r3.length} casi; ` +
      `attesa mediana tra ingresso in zona blu e trigger: ${u.attese.length ? num(mediana(u.attese), 0) : "—"} sedute.`);
    out.push(`Stato attuale e zone blu di ogni ${eu ? "gruppo" : "settore"}: ${eu ? "gruppo" : "settore"} | stato oggi | numero di zone blu | trigger confermati | falliti`);
    for (const x of u.perSettore) {
      const ok = x.a.episodi.filter(e => e.segnale != null).length;
      const ko = x.a.episodi.reduce((k, e) => k + e.falliti.length, 0);
      out.push(`${x.cod} ${eu ? `(${x.sotto})` : x.nome} | ${S.STATI[x.a.statoOggi || "normale"]} | ${x.a.episodi.length} | ${ok} | ${ko}`);
    }
    const mostrate = u.tutte.slice(0, 60);
    out.push(`Registro filtrato: ${u.tutte.length} eventi; i più recenti ${mostrate.length}: data | ${eu ? "gruppo" : "settore"} | da → a | % sopra media 200 | drawdown | dettagli | ${eu ? "prezzo" : "ETF"} +1M, +3M, +6M (solo per i trigger)`);
    for (const e of mostrate) {
      let det = "";
      if (e.a === "trigger") det = (e.motivi || []).map(m => S.MOTIVI[m]).join(" + ") + (e.fallito ? ", poi fallito" : "");
      else if (e.a === "fallito") det = e.trigger ? `annulla il trigger del ${dataIt(e.trigger)}` : "";
      else if (e.a === "blu") det = `drawdown ${R.art("al", num(e.perc, 0) + "°")} percentile`;
      out.push(`${dataIt(e.data)} | ${e.cod} | ${S.STATI[e.da]} → ${S.STATI[e.a]} | ${num(e.b200, 1)}% | ${pct(e.dd, 1)} | ${det || "—"} | ${e.a === "trigger" ? `${pct(e.r1, 1)}, ${pct(e.r3, 1)}, ${pct(e.r6, 1)}` : "—"}`);
    }
    return out.join("\n");
  }

  function mostra(param, ctx) {
    visibile = true;
    const m = R.mercato(ctx && ctx.zona);
    if (m !== M) {
      M = m;
      settore = scelte[M.zona] || "";
      limite = 300;
      ultimo = null; storia = null;
      ["#alr-kpi", "#alr-tabella", "#alr-storia"].forEach(k => { $(k).innerHTML = ""; });
      $("#alr-conta").textContent = "";
      $("#alr-sub").innerHTML = "&nbsp;";
    }
    $("#regole-alert").innerHTML = R.htmlRegole(true, M);
    R.testiZona($("#view-alr"), M.zona);
    document.title = `Alert ${M.nome} · Radar Settori`;
    return disegna();
  }
  function nascondi() { visibile = false; }

  R.viste.alr = { init, mostra, nascondi, contesto, mercato: () => M };
})();
