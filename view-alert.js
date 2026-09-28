/*
 * Radar Settori — vista 5: registro dei cambi di stato dal 2005, con statistiche.
 */
(function () {
  "use strict";

  const R = window.Radar, S = window.Signals;
  const { $, num, pct, dataIt, esc, cls } = R;
  let visibile = false;
  let tipi = new Set(R.store.get("alr.tipi", ["blu", "trigger", "fallito"]));
  let settore = R.store.get("alr.settore", "");
  let limite = 300;

  const TIPI = ["blu", "trigger", "fallito", "cooldown", "attenzione", "normale"];

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
        const ev = { t, data: d.date[t], etf, da: prima, a: s, b200: d.b200[t], dd: d.dd[t], perc: a.ddPerc[t] };
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

  async function disegna() {
    const tutti = await R.dati.tuttiSettori();
    if (!visibile) return;
    const perSettore = R.meta.settori.map(s => {
      const d = tutti[s.etf], a = R.analisiSync(s.etf, d);
      return { etf: s.etf, nome: s.nome, d, a, ev: eventi(s.etf, d, a) };
    });
    const scelti = perSettore.filter(x => !settore || x.etf === settore);

    // statistiche
    const episodi = scelti.flatMap(x => x.a.episodi);
    const confermati = episodi.filter(e => e.segnale != null);
    const nFalliti = episodi.reduce((k, e) => k + e.falliti.length, 0);
    const r3 = confermati.map(e => e.r3).filter(v => v != null);
    const attese = confermati.map(e => e.segnale - e.inizio);
    const primo = perSettore[0] ? perSettore[0].d.date[perSettore[0].d.b200.findIndex(v => v != null)] : "2005-01-03";
    $("#alr-sub").textContent = `Stati ricalcolati per ogni seduta dal ${dataIt(primo)} con i livelli blu in uso${Object.keys(R.livelliLocali).length ? " (alcuni cambiati in questo browser)" : ""}. I rendimenti sono dell'ETF, dividendi inclusi.`;
    const tile = (k, l, v, s) => `<div class="kpi" style="--k:${k}"><div class="l">${l}</div><div class="v">${v}</div><div class="s">${s}</div></div>`;
    $("#alr-kpi").innerHTML =
      tile("var(--st-blu)", "Zone blu", episodi.length, settore ? settore : "tutti i settori") +
      tile("var(--st-trigger)", "Trigger confermati", confermati.length, `${nFalliti} ${nFalliti === 1 ? "fallito" : "falliti"} prima`) +
      tile("var(--st-fallito)", "Trigger falliti", `${confermati.length + nFalliti ? num((nFalliti / (confermati.length + nFalliti)) * 100, 0) : "—"}<small>%</small>`, "sul totale dei trigger") +
      tile("var(--pos)", "+3M dal trigger", `<span class="${cls(mediana(r3))}">${pct(mediana(r3), 1)}</span>`, `mediana su ${r3.length} ${r3.length === 1 ? "caso" : "casi"}`) +
      tile("var(--accent)", "Positivi a 3M", `${r3.length ? num((r3.filter(v => v > 0).length / r3.length) * 100, 0) : "—"}<small>%</small>`, "dei trigger con 3 mesi di dati") +
      tile("var(--accent-2)", "Attesa del trigger", `${attese.length ? num(mediana(attese), 0) : "—"}<small> sedute</small>`, "mediana dall'ingresso in zona blu");

    // tabella
    let tutte = scelti.flatMap(x => x.ev.map(e => Object.assign(e, { nome: x.nome })));
    tutte = tutte.filter(e => tipi.has(e.a) && e.da != null).sort((x, y) => (y.data.localeCompare(x.data)) || x.etf.localeCompare(y.etf));
    const mostrate = tutte.slice(0, limite);
    const pill = s => s ? `<span class="st-pill st-${s}">${S.STATI[s]}</span>` : "";
    $("#alr-tabella").innerHTML = `<thead><tr>
        <th>Data</th><th class="l">Settore</th><th style="text-align:left">Cambio</th><th>Ampiezza</th><th>Drawdown</th>
        <th style="text-align:left">Dettagli</th><th>+1M</th><th>+3M</th><th>+6M</th>
      </tr></thead><tbody>` +
      (mostrate.map(e => {
        let det = "";
        if (e.a === "trigger") det = (e.motivi || []).map(m => S.MOTIVI[m]).join(" + ") + (e.fallito ? ` <span class="tag">poi fallito</span>` : "") + (e.dalla != null ? `<small class="sub-line">${R.sedute(e.dalla)} dopo l'ingresso in zona blu</small>` : "");
        else if (e.a === "fallito") det = e.trigger ? `annulla il trigger del ${dataIt(e.trigger)}` : "";
        else if (e.a === "blu") det = `drawdown al ${num(e.perc, 0)}° percentile`;
        const r = v => `<td class="${cls(v)}">${e.a === "trigger" ? pct(v, 1) : ""}</td>`;
        return `<tr class="clic" data-etf="${e.etf}">
          <td class="mono">${dataIt(e.data)}</td>
          <td class="l"><b class="mono">${e.etf}</b><small class="sub-line">${esc(e.nome)}</small></td>
          <td style="text-align:left" class="nowrap">${pill(e.da)} <span class="muted">→</span> ${pill(e.a)}</td>
          <td class="mono">${num(e.b200, 1)}%</td>
          <td class="mono">${pct(e.dd, 1)}</td>
          <td class="txt">${det}</td>
          ${r(e.r1)}${r(e.r3)}${r(e.r6)}
        </tr>`;
      }).join("") || `<tr><td colspan="9" class="muted" style="text-align:left;font-family:var(--font-ui)">Nessun evento con questi filtri.</td></tr>`) +
      "</tbody>" +
      (tutte.length > limite ? `<tfoot><tr><td colspan="9" style="text-align:center;font-family:var(--font-ui)"><button class="linkish" type="button" id="alr-altri">Mostra altri ${Math.min(300, tutte.length - limite)} (di ${tutte.length})</button></td></tr></tfoot>` : "");
  }

  function disegnaFiltri() {
    $("#alr-tipi").innerHTML = TIPI.map(t => `<button type="button" class="chip-btn st-${t}" data-t="${t}" aria-pressed="${tipi.has(t)}">${S.STATI[t]}</button>`).join("");
    $("#alr-settore").innerHTML = `<option value="">Tutti i settori</option>` +
      R.meta.settori.map(s => `<option value="${s.etf}"${s.etf === settore ? " selected" : ""}>${s.etf} · ${esc(s.nome)}</option>`).join("");
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
    $("#alr-settore").addEventListener("change", e => { settore = e.target.value; R.store.set("alr.settore", settore); limite = 300; disegna(); });
    $("#alr-tabella").addEventListener("click", e => {
      if (e.target.id === "alr-altri") { limite += 300; disegna(); return; }
      const tr = e.target.closest("tr[data-etf]");
      if (tr && !e.target.closest("button")) R.vai("#" + tr.dataset.etf);
    });
    R.on("livelli", () => { if (visibile) disegna(); });
  }

  function mostra() { visibile = true; document.title = "Alert · Radar Settori"; return disegna(); }
  function nascondi() { visibile = false; }

  R.viste.alr = { init, mostra, nascondi };
})();
