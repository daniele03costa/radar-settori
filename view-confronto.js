/*
 * Radar Settori — Home · Confronto: le quattro zone azionarie (USA, Europa, Asia, Emergenti) una accanto all'altra.
 *   - tabella: tendenza dell'indice di riferimento, ampiezza di oggi e di qualche tempo fa, percentile dal 2005,
 *     stato dell'ampiezza (attenzione sotto il 20%, zona rossa sotto il 15%) e stati di settori e indici;
 *   - grafico: la quota di azioni sopra la media 200 delle quattro zone sullo stesso asse, dal 2005;
 *   - elenco: i cambi di stato delle ultime sedute in tutte le zone.
 * Legge i file già usati dalle altre pagine: indice.json e stati.json di ogni zona. Solo statistiche descrittive.
 */
(function () {
  "use strict";

  const R = window.Radar, S = window.Signals, E = window.Europa;
  const { $, $$, num, pct, esc, dataIt } = R;

  // le zone, nell'ordine della barra; il colore segue la zona (mai la posizione in classifica)
  const ZONE = [
    { z: "usa", nome: "USA", breve: "USA", colore: "--soglia", indice: "S&P 500 (ETF SPY)", azioni: "dell'S&P 500" },
    { z: "eur", nome: "Europa", breve: "EUR", colore: "--b200", indice: "STOXX Europe 600", azioni: "europee" },
    { z: "asi", nome: "Asia", breve: "ASI", colore: "--b50", indice: "Media delle azioni asiatiche, in euro", azioni: "asiatiche" },
    { z: "emg", nome: "Emergenti", breve: "EMG", colore: "--ma", indice: "MSCI Emerging Markets (ETF EEM)", azioni: "dei paesi emergenti" },
  ];
  const PERIODI = [["1", "1 anno"], ["3", "3 anni"], ["10", "10 anni"], ["0", "Dal 2005"]];
  const COLORE_TENDENZA = { rialzo: "var(--q-leader)", recupero: "var(--q-miglioramento)", debolezza: "var(--q-indebolimento)", ribasso: "var(--q-ritardo)" };
  const ORDINE_STATI = ["fallito", "trigger", "blu", "attenzione", "cooldown", "normale"];
  const SEDUTE_CAMBI = 5;

  const st = { visibile: false, giro: 0, dati: null, grafico: null, periodo: String(R.store.get("cfr.periodo", "3")), spente: new Set(R.store.get("cfr.spente", [])) };

  const p100 = (v, d = 1) => (v == null || !isFinite(v) ? "—" : pct(v * 100, d));
  const perc = v => (v == null || !isFinite(v) ? "—" : `${num(v, 1)}%`);
  const giorno = s => new Date(s + "T12:00:00Z").toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });

  // ---------------- dati ----------------

  async function caricaZona(c) {
    const M = R.mercati[c.z];
    await M.pronto();
    const [ind, stati] = await Promise.all([M.indice(), (c.z === "usa" ? R.dati.stati() : M.stati()).catch(() => null)]);
    if (!ind || !ind.b200 || !ind.b200.length) return null;
    const N = ind.date.length;
    // tendenza dell'indice di riferimento (o, se manca, della media delle azioni): bastano gli ultimi 600 giorni
    const prezzi = ind.close && ind.close.some(v => v != null) ? ind.close : ind.paniere || null;
    const k0 = Math.max(0, N - 600);
    const a = prezzi ? E.analizza(prezzi.slice(k0), ind.date.slice(k0), null, null) : null;
    const amp = R.viste.mon.statisticheStorico(ind);
    const sA = S.statiAmpiezza(ind.b200, R.parametri());
    const conIndice = !!(ind.close && ind.close.some(v => v != null));
    return { c, M, ind, stati, a, amp, sA, nomeIndice: conIndice ? (c.z === "usa" ? ind.prezzo || c.indice : ind.confronto || c.indice) : `Media delle azioni ${c.azioni}, in euro` };
  }

  // tutte le zone su un solo calendario: l'unione delle date, con l'ultimo valore ripetuto per pochi giorni
  function unisci(zone) {
    const tutte = new Set();
    for (const x of zone) for (const d of x.ind.date) tutte.add(d);
    const date = Array.from(tutte).sort();
    const posto = new Map(date.map((d, i) => [d, i]));
    const serie = {};
    for (const x of zone) {
      const v = new Array(date.length).fill(null);
      x.ind.date.forEach((d, i) => { v[posto.get(d)] = x.ind.b200[i]; });
      let ultimo = null, eta = 0;
      for (let i = 0; i < v.length; i++) {
        if (v[i] != null) { ultimo = v[i]; eta = 0; }
        else if (ultimo != null && ++eta <= 4) v[i] = ultimo;
      }
      serie[x.c.z] = v;
    }
    return { date, serie };
  }

  async function carica() {
    const zone = (await Promise.all(ZONE.map(c => caricaZona(c).catch(e => { console.error(e); return null; })))).filter(Boolean);
    if (!zone.length) return null;
    return { zone, comune: unisci(zone) };
  }

  // ---------------- tabella ----------------

  function disegnaTabella() {
    const P = R.parametri();
    const righe = st.dati.zone.map(x => {
      const { c, a, amp, sA } = x;
      const settori = (x.stati && x.stati.settori) || [];
      const conta = ORDINE_STATI.map(k => ({ k, n: settori.filter(s => s.stato === k).length })).filter(y => y.n);
      const stato = sA.oggi || "normale";
      const delta = amp.mese == null ? null : amp.x - amp.mese;
      return `<tr class="clic" data-vai="#${c.z}/monitor" tabindex="0">
        <td class="l"><span class="cfr-zona"><i style="background:var(${c.colore})"></i><b>${c.nome}</b></span><small class="sub-line">${esc(x.nomeIndice)}</small></td>
        <td class="l">${a && a.stato ? `<span class="st-pill" style="--c:${COLORE_TENDENZA[a.stato]}">${E.STATI[a.stato]}</span>` : "—"}<small class="sub-line">${a ? `1 mese ${p100(a.m1)} · da inizio anno ${p100(a.ytd)}` : ""}</small></td>
        <td><b>${perc(amp.x)}</b><small class="sub-line"><span class="${R.cls(delta)}">${delta == null ? "" : R.segnato(delta, 1)}</span> in un mese</small>
          <span class="cfr-barra" title="Azioni sopra la media 200: ${perc(amp.x)}; attenzione sotto il ${P.ampiezzaAttenzione}%, zona rossa sotto il ${P.ampiezzaRossa}%"><i style="width:${Math.max(0, Math.min(100, amp.x || 0))}%;background:var(${c.colore})"></i><s style="left:${P.ampiezzaAttenzione}%"></s></span></td>
        <td>${perc(amp.trimestre)}</td>
        <td>${perc(amp.anno)}</td>
        <td>${amp.percentile == null ? "—" : `${num(Math.round(amp.percentile), 0)}°`}<small class="sub-line">mediana ${num(amp.mediana, 0)}%</small></td>
        <td class="l"><span class="st-pill st-amp-${stato}">${S.STATI_AMPIEZZA[stato]}</span><small class="sub-line">${stato === "normale" ? `ultima sotto il ${P.ampiezzaAttenzione}%: ${ultimaSotto(x, P.ampiezzaAttenzione)}` : `dal ${dataIt(x.ind.date[sA.dal])}`}</small></td>
        <td class="l cfr-stati">${conta.length ? `<div class="stack">${conta.map(y => `<i class="st-${y.k}" style="flex:${y.n}" title="${S.STATI[y.k]}: ${y.n}"></i>`).join("")}</div>
          <div class="stack-legend">${conta.filter(y => y.k !== "normale").map(y => `<span class="st-${y.k}">${S.STATI[y.k]} ${y.n}</span>`).join("") || `<span class="st-normale">tutti normali (${settori.length})</span>`}</div>` : "—"}</td>
      </tr>`;
    }).join("");
    $("#cfr-tabella").innerHTML = `<thead><tr><th class="l">Zona</th><th class="l" title="Prezzo e media 50 dell'indice di riferimento rispetto alla media 200">Tendenza dell'indice</th>
      <th title="Quota di azioni sopra la propria media a 200 sedute">Sopra la media 200</th><th>3 mesi fa</th><th>1 anno fa</th>
      <th title="Quota delle sedute dal 2005 con un'ampiezza più bassa di oggi">Percentile</th><th class="l">Stato dell'ampiezza</th><th class="l" title="Stati di settori (e indici) della zona, con i livelli blu predefiniti">Settori e indici</th></tr></thead><tbody>${righe}</tbody>`;
  }

  function ultimaSotto(x, soglia) {
    const b = x.ind.b200;
    for (let i = b.length - 1; i >= 0; i--) if (b[i] != null && b[i] <= soglia) return dataIt(x.ind.date[i]);
    return "mai";
  }

  // ---------------- grafico ----------------

  function creaGrafico() {
    const small = window.matchMedia("(max-width: 720px)").matches;
    $("#cfr-grafico").innerHTML = "";
    st.grafico = new window.Pannelli($("#cfr-grafico"), {
      pannelli: [{ id: "ampiezza", altezza: small ? 250 : 360, formato: v => num(v, 0) + "%", formatoPill: v => num(v, 0) + "%" }],
      tooltip: i => {
        const d = st.dati;
        if (!d) return "";
        return `<div class="d">${dataIt(d.comune.date[i])}</div>` + d.zone.filter(x => !st.spente.has(x.c.z)).map(x => {
          const v = d.comune.serie[x.c.z][i];
          return `<div class="r"><span><i class="sw dot" style="background:${R.css(x.c.colore)}"></i>${x.c.nome}</span><span>${v == null ? "—" : num(v, 1) + "%"}</span></div>`;
        }).join("");
      },
    });
  }

  function disegnaGrafico() {
    const d = st.dati, P = R.parametri();
    if (!st.grafico) creaGrafico();
    $$("#cfr-periodo button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.p === st.periodo)));
    // la legenda fa anche da interruttore: un clic toglie o rimette una zona
    $("#cfr-legenda").innerHTML = d.zone.map(x => `<button type="button" class="cfr-chip" data-z="${x.c.z}" aria-pressed="${!st.spente.has(x.c.z)}" title="Mostra o nascondi ${x.c.nome}">
        <i style="background:var(${x.c.colore})"></i>${x.c.nome} <b>${perc(x.amp.x)}</b></button>`).join("") +
      `<span class="cfr-fasce"><i class="fascia" style="background:color-mix(in srgb, var(--st-attenzione) 50%, transparent)"></i>Attenzione (${P.ampiezzaRossa}–${P.ampiezzaAttenzione}%)</span>` +
      `<span class="cfr-fasce"><i class="fascia" style="background:color-mix(in srgb, var(--neg) 35%, transparent)"></i>Zona rossa (sotto il ${P.ampiezzaRossa}%)</span>`;
    const N = d.comune.date.length, anni = Number(st.periodo);
    const i0 = anni ? Math.max(0, N - Math.round(anni * 261)) : 0;
    const visibili = d.zone.filter(x => !st.spente.has(x.c.z));
    st.grafico.setData({
      date: d.comune.date, i0, i1: N - 1, chiave: "zone",
      etichette: { ampiezza: "% delle azioni sopra la media 200, zona per zona" },
      pannelli: {
        ampiezza: {
          range: [0, 100],
          serie: visibili.map(x => ({ valori: d.comune.serie[x.c.z], colore: R.css(x.c.colore), spessore: visibili.length === 1 ? 2 : 1.7, pill: true, pillTesto: v => `${x.c.breve} ${num(v, 0)}%` })),
          fasce: [
            { da: P.ampiezzaRossa, a: P.ampiezzaAttenzione, colore: R.css("--st-attenzione"), alfa: 0.3, etichetta: `attenzione ${P.ampiezzaRossa}–${P.ampiezzaAttenzione}%` },
            { da: 0, a: P.ampiezzaRossa, colore: R.css("--neg"), alfa: 0.2, etichetta: `zona rossa sotto il ${P.ampiezzaRossa}%` },
          ],
        },
      },
    });
  }

  // ---------------- cambi di stato recenti ----------------

  function cambiRecenti() {
    const tutti = [];
    for (const x of st.dati.zone) {
      const s = x.stati;
      if (!s) continue;
      for (const c of s.cambi_recenti || []) tutti.push({ x, data: c.data, nome: c.codice || c.etf, sotto: c.codice && c.codice !== c.nome ? c.nome : (x.c.z === "usa" ? c.nome : ""), link: x.M.link(c.etf), da: c.da, a: c.a,
        nomi: S.STATI, classe: k => `st-${k}`, extra: c.titoli_sopra != null ? `${c.titoli_sopra} su ${c.titoli_totali} sopra la media 200` : "" });
      for (const c of (s.ampiezza_stato && s.ampiezza_stato.cambi_recenti) || []) tutti.push({ x, data: c.data, nome: x.M.t.indiceIntero, sotto: "", link: `#${x.c.z}/monitor`, da: c.da, a: c.a,
        nomi: S.STATI_AMPIEZZA, classe: k => `st-amp-${k}`, extra: `${perc(c.ampiezza)} sopra la media 200` });
    }
    const date = Array.from(new Set(tutti.map(c => c.data))).sort().reverse().slice(0, SEDUTE_CAMBI);
    return date.map(d => ({ data: d, cambi: tutti.filter(c => c.data === d).sort((u, v) => ZONE.findIndex(z => z.z === u.x.c.z) - ZONE.findIndex(z => z.z === v.x.c.z)) }));
  }

  function disegnaCambi() {
    const gruppi = cambiRecenti();
    const box = $("#cfr-cambi");
    if (!gruppi.length) { box.innerHTML = `<p class="novita-vuota">Nessun cambio di stato nelle ultime sedute, in nessuna zona.</p>`; return; }
    const pill = (c, k) => `<span class="st-pill ${c.classe(k)}">${c.nomi[k] || k}</span>`;
    box.innerHTML = gruppi.map(g => `<div class="cfr-giorno"><h3>${esc(giorno(g.data))}</h3><ul class="novita-lista">${g.cambi.map(c => `<li class="${c.classe(c.a)}"><i></i><span>
        <span class="cfr-tag" style="--c:var(${c.x.c.colore})">${c.x.c.nome}</span> <a href="${c.link}"><b>${esc(c.nome)}</b></a>${c.sotto ? ` ${esc(c.sotto)}` : ""}: da ${pill(c, c.da)} a ${pill(c, c.a)}${c.extra ? ` <span class="muted">· ${c.extra}</span>` : ""}</span></li>`).join("")}</ul></div>`).join("");
  }

  // ---------------- vista ----------------

  function disegnaTutto() {
    const d = st.dati;
    const date = d.zone.map(x => `${x.c.nome} ${dataIt(x.amp.data).slice(0, 5)}`).join(", ");
    $("#cfr-sub").textContent = `Tendenza, ampiezza e stati delle quattro zone azionarie, una accanto all'altra. Chiusure: ${date}. Solo numeri del passato, nessuna previsione.`;
    disegnaTabella(); disegnaGrafico(); disegnaCambi();
  }

  async function disegna() {
    const giro = ++st.giro;
    if (!st.dati) $("#cfr-tabella").innerHTML = `<tbody><tr><td class="l"><div class="hc-attesa"><i></i><i></i><i></i><span>Sto caricando le zone…</span></div></td></tr></tbody>`;
    let d = null;
    try { d = await carica(); } catch (e) { console.error(e); }
    if (giro !== st.giro || !st.visibile) return;
    $("#cfr-corpo").hidden = !d;
    $("#cfr-vuoto").hidden = !!d;
    if (!d) return;
    st.dati = d;
    disegnaTutto();
  }

  function init() {
    $("#cfr-periodo").innerHTML = PERIODI.map(([k, n]) => `<button type="button" data-p="${k}" aria-pressed="false">${n}</button>`).join("");
    $("#cfr-periodo").addEventListener("click", e => {
      const b = e.target.closest("button[data-p]");
      if (!b || !st.dati) return;
      st.periodo = b.dataset.p;
      R.store.set("cfr.periodo", st.periodo);
      disegnaGrafico();
    });
    $("#cfr-legenda").addEventListener("click", e => {
      const b = e.target.closest(".cfr-chip");
      if (!b || !st.dati) return;
      const z = b.dataset.z;
      // almeno una zona resta accesa
      if (st.spente.has(z)) st.spente.delete(z);
      else if (st.dati.zone.filter(x => !st.spente.has(x.c.z)).length > 1) st.spente.add(z);
      R.store.set("cfr.spente", Array.from(st.spente));
      disegnaGrafico();
    });
    const vai = e => {
      if (e.type === "keydown" && e.key !== "Enter") return;
      if (e.target.closest("a")) return;
      const tr = e.target.closest("tr[data-vai]");
      if (tr) R.vai(tr.dataset.vai);
    };
    $("#cfr-tabella").addEventListener("click", vai);
    $("#cfr-tabella").addEventListener("keydown", vai);
    R.on("tema", () => { st.grafico = null; if (st.visibile && st.dati) disegnaTutto(); });
  }

  function mostra() {
    st.visibile = true;
    document.title = "Radar Settori · confronto fra zone";
    return disegna();
  }
  function nascondi() { st.visibile = false; }

  function contesto() {
    if (!st.dati) return "## Pagina aperta: Home · Confronto fra zone (dati non ancora disponibili)";
    const P = R.parametri();
    const out = [`## Pagina aperta: Home · Confronto fra zone (ampiezza = quota di azioni sopra la media 200; attenzione sotto il ${P.ampiezzaAttenzione}%, zona rossa sotto il ${P.ampiezzaRossa}%)`,
      "zona | indice di riferimento | tendenza | 1 mese | da inizio anno | ampiezza oggi | 1 mese fa | 3 mesi fa | 1 anno fa | percentile dal 2005 | stato dell'ampiezza | stati di settori e indici"];
    for (const x of st.dati.zone) {
      const { a, amp, sA } = x;
      const settori = (x.stati && x.stati.settori) || [];
      const conta = ORDINE_STATI.map(k => [k, settori.filter(s => s.stato === k).length]).filter(y => y[1]).map(([k, n]) => `${S.STATI[k]} ${n}`).join(", ");
      out.push([x.c.nome + ` (${dataIt(amp.data)})`, x.nomeIndice, a && a.stato ? E.STATI[a.stato] : "—", a ? p100(a.m1) : "—", a ? p100(a.ytd) : "—", perc(amp.x), perc(amp.mese), perc(amp.trimestre), perc(amp.anno),
        amp.percentile == null ? "—" : num(amp.percentile, 0) + "°", S.STATI_AMPIEZZA[sA.oggi] || "—", conta || "—"].join(" | "));
    }
    const gruppi = cambiRecenti();
    if (gruppi.length) {
      out.push("### Cambi di stato nelle ultime sedute (livelli blu predefiniti)");
      for (const g of gruppi) for (const c of g.cambi) out.push(`${dataIt(g.data)} | ${c.x.c.nome} | ${c.nome}${c.sotto ? ` ${c.sotto}` : ""} | da ${c.nomi[c.da] || c.da} a ${c.nomi[c.a] || c.a}${c.extra ? ` | ${c.extra}` : ""}`);
    }
    return out.join("\n");
  }

  R.viste.cfr = { init, mostra, nascondi, contesto };
})();
