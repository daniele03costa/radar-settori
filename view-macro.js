/*
 * Radar Settori — Home · Macro: tassi a 10 anni di USA e Germania, dollaro, petrolio, oro, rame e VIX.
 * Una scheda per serie (valore, variazioni, minimo e massimo dell'ultimo anno, percentile dal 2005, media 200),
 * il grafico della serie scelta e la tabella di tutte. Dati da data/macro.json (build_macro.py), calcoli in
 * macro-calcoli.js. Solo statistiche descrittive.
 */
(function () {
  "use strict";

  const R = window.Radar, Mc = window.Macro;
  const { $, $$, num, pct, esc, dataIt } = R;

  const st = { m: null, tutte: [], scelta: R.store.get("mac.serie", "us10"), periodo: String(R.store.get("mac.periodo", "3")), visibile: false, grafico: null };

  // ---------------- formati ----------------

  const dec = s => (s.dec != null ? s.dec : s.unita === "%" ? 2 : 2);
  const valore = (s, v) => (v == null || !isFinite(v) ? "—" : num(v, dec(s)));
  const UNITA = { "%": "%", "$": "$", "$/barile": "$ al barile", "$/oncia": "$ l'oncia", "$/libbra": "$ la libbra", punti: "" };
  const conUnita = (s, v) => {
    if (v == null || !isFinite(v)) return "—";
    if (s.unita === "%") return `${num(v, dec(s))}%`;
    const u = UNITA[s.unita] != null ? UNITA[s.unita] : s.unita;
    return u ? `${num(v, dec(s))} ${u}` : num(v, dec(s));
  };
  // variazione: punti base per i tassi, percentuale per il resto
  const varTesto = (s, v) => {
    if (v == null || !isFinite(v)) return "—";
    if (Mc.eTasso(s)) { const r = Math.round(v); return `${r > 0 ? "+" : ""}${num(r, 0)} pb`; }
    return pct(v, 1);
  };
  const percentile = p => (p == null ? "—" : `${num(Math.round(p), 0)}°`);
  const posizione = a => (a.pos52 == null ? "—" : `${num(a.pos52 * 100, 0)}%`);
  const trend = a => (a.sopraMa == null ? "media 200 non ancora disponibile" : a.sopraMa ? "sopra la media 200" : "sotto la media 200");
  const PERIODI_TABELLA = [["s1", "1 sett."], ["m1", "1 mese"], ["m3", "3 mesi"], ["a1", "1 anno"]];

  // ---------------- piccolo grafico dell'ultimo anno ----------------

  function spark(a) {
    const N = a.v.length, i0 = Math.max(0, N - 261);
    let lo = Infinity, hi = -Infinity;
    for (let i = i0; i < N; i++) for (const v of [a.v[i], a.ma[i]]) if (v != null) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    if (!isFinite(lo)) return "";
    const W = 200, H = 40, pad = (hi - lo) * 0.08 || 1;
    lo -= pad; hi += pad;
    const X = i => ((i - i0) / Math.max(1, N - 1 - i0)) * W, Y = v => 2 + ((hi - v) / (hi - lo)) * (H - 4);
    const linea = serie => { let d = ""; for (let i = i0; i < N; i++) if (serie[i] != null) d += `${d ? "L" : "M"}${X(i).toFixed(1)},${Y(serie[i]).toFixed(1)}`; return d; };
    const dm = linea(a.ma);
    return `<svg class="mac-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
      ${dm ? `<path d="${dm}" fill="none" style="stroke:var(--ma)" stroke-width="1.3" stroke-dasharray="3 3" vector-effect="non-scaling-stroke"/>` : ""}
      <path d="${linea(a.v)}" fill="none" style="stroke:var(--price)" stroke-width="1.6" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>`;
  }

  // ---------------- schede ----------------

  function scheda({ s, a }) {
    const sel = s.id === st.scelta;
    const fermo = a.data && st.m && a.data < st.m.date[Math.max(0, st.m.date.length - 6)];
    return `<button type="button" class="mac-tile" data-id="${esc(s.id)}" aria-pressed="${sel}" title="${esc(s.nota || s.nome)}">
      <span class="mac-k">${esc(s.gruppo)}</span>
      <span class="mac-n">${esc(s.nome)}</span>
      <span class="mac-v">${valore(s, a.ultimo)}${s.unita === "%" ? "<small>%</small>" : UNITA[s.unita] ? `<small class="lunga">${esc(UNITA[s.unita])}</small>` : ""}</span>
      <span class="mac-var"><span>1 mese <b>${varTesto(s, a.variazioni.m1)}</b></span><span>1 anno <b>${varTesto(s, a.variazioni.a1)}</b></span></span>
      ${spark(a)}
      <span class="mac-range" title="Minimo e massimo dell'ultimo anno: oggi al ${posizione(a)} dell'intervallo">
        <span class="mac-barra"><i style="left:${a.pos52 == null ? 50 : Math.round(a.pos52 * 100)}%"></i></span>
        <span class="mac-estremi"><span>${valore(s, a.min52)}</span><span>min e max 1 anno</span><span>${valore(s, a.max52)}</span></span>
      </span>
      <span class="mac-piede">Percentile dal ${a.dal.slice(0, 4)}: <b>${percentile(a.percentile)}</b> · ${trend(a)}${fermo ? ` · <em>fermo al ${dataIt(a.data)}</em>` : ""}</span>
    </button>`;
  }

  function disegnaSchede() {
    const box = $("#mac-gruppi");
    if (!st.tutte.length) { box.innerHTML = `<article class="card empty"><p>Il quadro macro non c'è ancora: arriva con il prossimo aggiornamento automatico (<b>Aggiorna dati</b>).</p></article>`; return; }
    box.innerHTML = `<div class="mac-griglia">${st.tutte.map(scheda).join("")}</div>`;
  }

  // ---------------- tabella ----------------

  function disegnaTabella() {
    const righe = st.tutte.map(({ s, a }) => `<tr class="clic${s.id === st.scelta ? " open" : ""}" data-id="${esc(s.id)}">
        <td class="l"><b>${esc(s.nome)}</b></td>
        <td>${conUnita(s, a.ultimo)}</td>
        ${PERIODI_TABELLA.map(([k]) => `<td>${varTesto(s, a.variazioni[k])}</td>`).join("")}
        <td>${posizione(a)}</td>
        <td>${percentile(a.percentile)}</td>
        <td>${a.vsMa == null ? "—" : varTesto(s, a.vsMa)}</td>
        <td>${dataIt(a.data)}</td>
      </tr>`).join("");
    $("#mac-tabella").innerHTML = `<thead><tr><th class="l">Serie</th><th>Valore</th>${PERIODI_TABELLA.map(([, n]) => `<th>${n}</th>`).join("")}
      <th title="Dove si trova il valore di oggi fra il minimo (0%) e il massimo (100%) dell'ultimo anno">Nell'anno</th>
      <th title="Quota delle sedute dal 2005 con un valore più basso di oggi">Percentile</th>
      <th title="Distanza dalla media delle ultime 200 sedute">Su media 200</th><th>Dato del</th></tr></thead><tbody>${righe}</tbody>`;
    // «Yahoo Finance (^TNX)», «Yahoo Finance (GC=F)»… diventano «Yahoo Finance (^TNX, GC=F…)»
    const yahoo = [], altre = [];
    for (const { s } of st.tutte) {
      const m = /^Yahoo Finance \((.+)\)$/.exec(s.fonte || "");
      if (m) yahoo.push(m[1]); else if (s.fonte && s.id !== "spread" && !altre.includes(s.fonte)) altre.push(s.fonte);
    }
    const fonti = (yahoo.length ? [`Yahoo Finance (${yahoo.join(", ")})`] : []).concat(altre);
    $("#mac-fonti").innerHTML = `Variazioni dei tassi in punti base (100 pb = 1 punto percentuale), delle altre serie in percentuale. Petrolio, oro e rame sono i future con la scadenza più vicina. Fonti: ${esc(fonti.join("; "))}. Dati al ${dataIt(st.m.aggiornato)}.`;
  }

  // ---------------- dettaglio con il grafico ----------------

  function creaGrafico() {
    const small = window.matchMedia("(max-width: 720px)").matches;
    $("#mac-grafico").innerHTML = "";
    st.grafico = new window.Pannelli($("#mac-grafico"), {
      pannelli: [{ id: "valore", altezza: small ? 230 : 320, formato: v => num(v, Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 10 ? 1 : 2), formatoPill: v => num(v, 2) }],
      tooltip: i => {
        const x = st.tutte.find(y => y.s.id === st.scelta);
        if (!x) return "";
        const c = R.colori();
        const row = (sw, lab, val) => `<div class="r"><span><i class="sw dot" style="background:${sw}"></i>${lab}</span><span>${val}</span></div>`;
        return `<div class="d">${dataIt(st.m.date[i])}</div>` + row(c.price, esc(x.s.breve || x.s.nome), conUnita(x.s, x.a.v[i])) +
          row(c.ma, "Media 200", conUnita(x.s, x.a.ma[i]));
      },
    });
  }

  function disegnaDettaglio() {
    const x = st.tutte.find(y => y.s.id === st.scelta) || st.tutte[0];
    const card = $("#mac-dettaglio");
    if (!x) { card.hidden = true; return; }
    st.scelta = x.s.id;
    card.hidden = false;
    const { s, a } = x;
    $("#mac-titolo").textContent = `${s.nome}: ${conUnita(s, a.ultimo)}`;
    $("#mac-nota").textContent = `${s.nota}. Dato del ${dataIt(a.data)}; fonte: ${s.fonte || "—"}.`;
    $$("#mac-periodo button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.p === st.periodo)));
    const c = R.colori();
    $("#mac-legenda").innerHTML = `<span><i class="sw" style="background:${c.price}"></i>${esc(s.breve || s.nome)}</span><span><i class="sw" style="background:${c.ma}"></i>Media 200</span>`;
    if (!st.grafico) creaGrafico();
    const N = st.m.date.length, anni = Number(st.periodo);
    const i0 = anni ? Math.max(a.v.findIndex(v => v != null), N - anni * 261) : a.v.findIndex(v => v != null);
    st.grafico.setData({
      date: st.m.date, i0, i1: N - 1,
      etichette: { valore: `${s.nome}${s.unita === "%" ? " (%)" : s.unita !== "punti" ? ` (${s.unita})` : ""} e media a 200 sedute` },
      pannelli: {
        valore: {
          includiZero: s.id === "spread",
          serie: [
            { valori: a.v, colore: c.price, spessore: 1.8, area: c.priceArea, base: "fondo", pill: true },
            { valori: a.ma, colore: c.ma, spessore: 2, pill: true },
          ],
          linee: s.id === "spread" ? [{ y: 0, colore: c.muted, tratteggio: [4, 4], spessore: 1 }] : [],
        },
      },
    });
    const v = a.variazioni;
    const cella = (l, x2, t) => `<div${t ? ` title="${esc(t)}"` : ""}><span>${l}</span><b>${x2}</b></div>`;
    $("#mac-numeri").innerHTML = `<div class="hc-numeri mac-cifre">
        ${[["s1", "1 settimana"], ["m1", "1 mese"], ["m3", "3 mesi"], ["m6", "6 mesi"], ["ytd", "Da inizio anno"], ["a1", "1 anno"], ["a3", "3 anni"]].map(([k, l]) => cella(l, varTesto(s, v[k]))).join("")}
      </div>
      <div class="hc-numeri mac-cifre">
        ${cella("Minimo 1 anno", `${valore(s, a.min52)} <small>${dataIt(a.dataMin52)}</small>`)}
        ${cella("Massimo 1 anno", `${valore(s, a.max52)} <small>${dataIt(a.dataMax52)}</small>`)}
        ${cella("Media 200", `${valore(s, a.ma200)} <small>${a.vsMa == null ? "" : varTesto(s, a.vsMa)}</small>`)}
        ${cella("Percentile", percentile(a.percentile), `Il valore di oggi è più alto di circa il ${num(a.percentile, 0)}% delle ${num(a.sedute, 0)} sedute dal ${dataIt(a.dal)}`)}
        ${cella(`Minimo dal ${a.dal.slice(0, 4)}`, `${valore(s, a.minStorico)} <small>${dataIt(a.dataMinStorico)}</small>`)}
        ${cella(`Massimo dal ${a.dal.slice(0, 4)}`, `${valore(s, a.maxStorico)} <small>${dataIt(a.dataMaxStorico)}</small>`)}
      </div>`;
  }

  function disegna() {
    disegnaSchede();
    if (!st.tutte.length) { $("#mac-dettaglio").hidden = true; $("#mac-tabella").innerHTML = ""; $("#mac-fonti").innerHTML = "&nbsp;"; return; }
    disegnaDettaglio();
    disegnaTabella();
    $("#mac-sub").textContent = `Tassi, dollaro, materie prime e volatilità al ${dataIt(st.m.aggiornato)}: dove sono rispetto all'ultimo anno e alla storia dal 2005. Solo numeri del passato, nessuna previsione.`;
  }

  function scegli(id, scorri) {
    if (!st.tutte.some(x => x.s.id === id)) return;
    st.scelta = id;
    R.store.set("mac.serie", id);
    $$("#mac-gruppi .mac-tile").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.id === id)));
    $$("#mac-tabella tr[data-id]").forEach(r => r.classList.toggle("open", r.dataset.id === id));
    disegnaDettaglio();
    if (scorri) $("#mac-dettaglio").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  // ---------------- dati (anche per la Home e «Copia per Claude») ----------------

  async function carica() {
    const m = await R.dati.macro();
    if (!m || !m.date || !m.serie) return null;
    if (st.m !== m) { st.m = m; st.tutte = Mc.tutte(m); }
    if (m.aggiornato) R.emit("prezzi", { mercato: "macro", aggiornato: m.aggiornato });
    return { m, tutte: st.tutte };
  }

  function init() {
    $("#mac-gruppi").addEventListener("click", e => { const b = e.target.closest(".mac-tile"); if (b) scegli(b.dataset.id, true); });
    $("#mac-tabella").addEventListener("click", e => { const r = e.target.closest("tr[data-id]"); if (r) scegli(r.dataset.id, true); });
    $("#mac-periodo").addEventListener("click", e => {
      const b = e.target.closest("button[data-p]");
      if (!b) return;
      st.periodo = b.dataset.p;
      R.store.set("mac.periodo", st.periodo);
      disegnaDettaglio();
    });
    R.on("tema", () => { if (st.visibile && st.tutte.length) { st.grafico = null; disegna(); } });
  }

  async function mostra(param) {
    st.visibile = true;
    document.title = "Radar Settori · quadro macro";
    try { await carica(); } catch (e) { console.error(e); st.tutte = []; }
    if (!st.visibile) return;
    if (param && st.tutte.some(x => x.s.id === String(param).toLowerCase())) st.scelta = String(param).toLowerCase();
    disegna();
  }

  function nascondi() { st.visibile = false; }

  // frecce: serie precedente e successiva
  function tasto(e) {
    if ((e.key !== "ArrowLeft" && e.key !== "ArrowRight") || !st.tutte.length) return false;
    const k = st.tutte.findIndex(x => x.s.id === st.scelta);
    const n = st.tutte[(k + (e.key === "ArrowRight" ? 1 : -1) + st.tutte.length) % st.tutte.length];
    scegli(n.s.id, false);
    return true;
  }

  function contesto() {
    if (!st.tutte.length) return "## Pagina aperta: Home · Macro (dati non ancora disponibili)";
    const out = [`## Pagina aperta: Home · Macro (dati al ${dataIt(st.m.aggiornato)}; tassi in %, variazioni dei tassi in punti base, delle altre serie in %)`];
    for (const { s, a } of st.tutte) {
      const v = a.variazioni;
      out.push(`- ${s.nome}: ${conUnita(s, a.ultimo)} il ${dataIt(a.data)}; 1 settimana ${varTesto(s, v.s1)}, 1 mese ${varTesto(s, v.m1)}, 3 mesi ${varTesto(s, v.m3)}, da inizio anno ${varTesto(s, v.ytd)}, 1 anno ${varTesto(s, v.a1)}; ` +
        `min/max ultimo anno ${valore(s, a.min52)}/${valore(s, a.max52)}; percentile dal ${a.dal.slice(0, 4)} ${percentile(a.percentile)}; ${trend(a)}${a.vsMa == null ? "" : ` (${varTesto(s, a.vsMa)})`}. Fonte: ${s.fonte}.`);
    }
    return out.join("\n");
  }

  R.macro = { carica, conUnita, varTesto, valore };
  R.viste.mac = { init, mostra, nascondi, tasto, contesto };
})();
