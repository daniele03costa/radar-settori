/*
 * Radar Settori — Home: il quadro di oggi.
 * Una scheda per zona (USA, Europa, crypto) con l'indice principale, il grafico dell'ultimo anno con la media 200,
 * la tendenza, l'ampiezza e i punti chiave, più il riepilogo del portafoglio. Ogni scheda si riempie appena
 * arrivano i suoi dati; un clic porta nella zona.
 */
(function () {
  "use strict";

  const R = window.Radar, S = window.Signals, E = window.Europa, Rot = window.Rotazione, Cal = window.Calendario;
  const { $, num, pct, esc, dataIt, cls } = R;

  const COLORE_STATO = { rialzo: "var(--q-leader)", recupero: "var(--q-miglioramento)", debolezza: "var(--q-indebolimento)", ribasso: "var(--q-ritardo)" };
  const NOMI_Q = { leader: "leader", miglioramento: "in miglioramento", indebolimento: "in indebolimento", ritardo: "in ritardo" };
  const ZONE = [["usa", "USA"], ["eur", "Europa"], ["cry", "Crypto"]];

  const st = { visibile: false, giro: 0, pronti: {}, errori: {} };

  // ---------------- formati ----------------

  const p100 = (v, d = 1) => (v == null || !isFinite(v) ? "—" : pct(v * 100, d));
  const cls100 = v => (v == null ? "" : cls(v * 100));
  const cifre = v => (v == null || !isFinite(v) ? "—" : v >= 10000 ? num(v, 0) : v >= 1000 ? num(v, 1) : v >= 100 ? num(v, 2) : v >= 1 ? num(v, 2) : num(v, 4));
  const euro = v => (v == null || !isFinite(v) ? "—" : `${num(v, Math.abs(v) >= 1000 ? 0 : 2)} €`);
  const euroSegno = v => (v == null || !isFinite(v) ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${num(Math.abs(v), Math.abs(v) >= 1000 ? 0 : 2)} €`);
  const pill = (stato, nomi) => (stato ? `<span class="st-pill" style="--c:${COLORE_STATO[stato]}">${(nomi || E.STATI)[stato]}</span>` : "");
  const elenco = a => (a.length <= 1 ? a.join("") : a.slice(0, -1).join(", ") + " e " + a[a.length - 1]);
  const icona = z => { const s = document.querySelector(`#zone a[data-zona="${z}"] svg`); return s ? s.outerHTML : ""; };
  const giorno = s => (s ? new Date(s + "T12:00:00Z").toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" }) : "—");
  const maiuscola = s => s.charAt(0).toUpperCase() + s.slice(1);
  const unita = (k, u) => `${k} ${k === 1 ? u[0] : u[1]}`;

  // ---------------- piccolo grafico: prezzo e media 200 dell'ultimo anno, con il cursore ----------------

  function miniGrafico(box, cfg) {
    const { date, prezzo, media, n, formato } = cfg;
    const N = prezzo.length, i0 = Math.max(0, N - n);
    let lo = Infinity, hi = -Infinity;
    for (let i = i0; i < N; i++) for (const v of [prezzo[i], media ? media[i] : null]) if (v != null && isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    if (!isFinite(lo)) { box.innerHTML = ""; return; }
    const pad = (hi - lo) * 0.08 || hi * 0.02 || 1;
    lo -= pad; hi += pad;
    const W = Math.max(240, box.clientWidth || 320), H = 92;
    const X = i => ((i - i0) / Math.max(1, N - 1 - i0)) * W;
    const Y = v => 4 + ((hi - v) / (hi - lo)) * (H - 8);
    const linea = serie => {
      let d = "";
      for (let i = i0; i < N; i++) { const v = serie[i]; if (v == null || !isFinite(v)) continue; d += `${d ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`; }
      return d;
    };
    const dp = linea(prezzo), dm = media ? linea(media) : "";
    const primo = prezzo.findIndex((v, i) => i >= i0 && v != null);
    const colore = cfg.colore || "var(--price)";
    box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="${esc(cfg.etichetta)}" class="tocco">
        <path d="${dp}L${X(N - 1).toFixed(1)},${H}L${X(primo).toFixed(1)},${H}Z" style="fill:${colore};opacity:.1"/>
        ${dm ? `<path d="${dm}" fill="none" style="stroke:var(--ma)" stroke-width="1.5" stroke-dasharray="4 3"/>` : ""}
        <path d="${dp}" fill="none" style="stroke:${colore}" stroke-width="1.8" stroke-linejoin="round"/>
        <circle cx="${X(N - 1).toFixed(1)}" cy="${Y(prezzo[N - 1]).toFixed(1)}" r="3.2" style="fill:${colore};stroke:var(--surface)" stroke-width="1.5"/>
        <line class="pf-cursor" x1="0" x2="0" y1="0" y2="${H}" visibility="hidden"/>
      </svg><div class="chart-tip" hidden></div>`;
    const svgEl = box.querySelector("svg"), cur = box.querySelector("line"), tip = box.querySelector(".chart-tip");
    const muovi = ev => {
      const r = svgEl.getBoundingClientRect();
      const k = Math.max(i0, Math.min(N - 1, Math.round(i0 + ((ev.clientX - r.left) / r.width) * (N - 1 - i0))));
      const x = X(k);
      cur.setAttribute("x1", x); cur.setAttribute("x2", x); cur.setAttribute("visibility", "visible");
      tip.innerHTML = `<div class="d">${dataIt(date[k])}</div><div class="r"><span>${esc(cfg.nome)}</span><span>${formato(prezzo[k])}</span></div>` +
        (media && media[k] != null ? `<div class="r"><span>Media 200</span><span>${formato(media[k])}</span></div>` : "");
      tip.hidden = false;
      const px = (x / W) * r.width;
      tip.style.left = (px + 14 + tip.offsetWidth > r.width ? Math.max(0, px - tip.offsetWidth - 14) : px + 14) + "px";
      tip.style.top = "0px";
    };
    svgEl.addEventListener("pointermove", muovi);
    svgEl.addEventListener("pointerleave", () => { cur.setAttribute("visibility", "hidden"); tip.hidden = true; });
  }

  // ---------------- dati degli USA ----------------

  function statiUsa(stati) {
    const locali = Object.keys(R.livelliLocali || {}).length > 0;
    // con livelli blu cambiati in questo browser gli stati si ricalcolano dai file dei settori (poi arriva «stati-settori»)
    if ((locali || !stati) && !R._settoriPronti && R.caricaStatiSettori) R.caricaStatiSettori();
    if (R._settoriPronti && (locali || !stati)) {
      return R.meta.settori.map(s => {
        let stato = null;
        try { const d = R._settoriPronti[s.etf]; if (d) stato = R.analisiSync(s.etf, d).statoOggi; } catch (e) { /* niente */ }
        return { etf: s.etf, nome: s.nome, stato: stato || "normale" };
      });
    }
    if (stati && stati.settori) return stati.settori.map(s => ({ etf: s.etf, nome: s.nome, stato: s.stato || "normale" }));
    return null;
  }

  async function riepilogoUsa() {
    const [px, indice, stati] = await Promise.all([
      R.dati.prezzi("usa"),
      R.dati.indice().catch(() => null),
      R.dati.stati().catch(() => null),
    ]);
    const spy = px.serie.SPY;
    if (!spy) throw new Error("manca SPY");
    const a = E.analizza(spy, px.date, null, null);
    // rotazione settimanale di ogni settore contro SPY (calcolo predefinito)
    const b = Rot.barre(px.date, "settimanali", d => Cal.successiva(d, "nyse"));
    const bench = b.indici.map(i => spy[i]);
    const rot = [];
    for (const s of R.meta.settori) {
      const serie = px.serie[s.etf];
      if (!serie) continue;
      const p = b.indici.map(i => serie[i]);
      const r = Rot.calcola(p, bench, "nuova");
      const m = Rot.misure(r.ratio, r.mom, p.length - 1);
      if (m) rot.push({ etf: s.etf, nome: s.nome, m });
    }
    return { px, a, indice, stati, rot, provvisoria: b.provvisoria };
  }

  function disegnaUsa(x) {
    const box = $("#home-usa");
    const a = x.a, t = x.px.date.length - 1;
    const settori = statiUsa(x.stati);
    const punti = [];
    // stati dei settori
    if (settori) {
      const gruppi = ["fallito", "trigger", "blu", "attenzione", "cooldown"].map(k => [k, settori.filter(s => s.stato === k)]).filter(([, v]) => v.length);
      const link = s => `<a href="#usa/settori/${s.etf}" title="${esc(s.nome)}">${s.etf}</a>`;
      punti.push({
        c: gruppi.length ? `var(--st-${gruppi[0][0]})` : "var(--st-normale)",
        html: gruppi.length
          ? gruppi.map(([k, v]) => `<span class="st-pill st-${k}">${S.STATI[k]}</span> ${v.map(link).join(", ")}`).join(" · ")
          : `Nessuno degli 11 settori in zona blu o in attenzione.`,
      });
    }
    // rotazione contro SPY
    const perQ = q => x.rot.filter(r => r.m.quadrante === q).sort((u, v) => v.m.ratio - u.m.ratio).map(r => `<a href="#usa/settori/${r.etf}" title="${esc(r.nome)}">${r.etf}</a>`);
    const lead = perQ("leader"), migl = perQ("miglioramento");
    if (lead.length || migl.length) {
      punti.push({ c: "var(--q-leader)", html: `Contro SPY${x.provvisoria ? " (settimana in corso)" : ""}: ${[lead.length ? `leader ${lead.join(", ")}` : "", migl.length ? `in miglioramento ${migl.join(", ")}` : ""].filter(Boolean).join("; ")}.` });
    }
    // cambi di stato recenti
    const cambi = ((x.stati && x.stati.cambi_recenti) || []).slice(0, 3);
    if (cambi.length && !Object.keys(R.livelliLocali || {}).length) {
      punti.push({ c: "var(--faint)", html: `Ultimi cambi: ${cambi.map(c => `<a href="#usa/settori/${c.etf}">${c.etf}</a> ${c.da_nome.toLowerCase()} → ${c.a_nome.toLowerCase()} (${dataIt(c.data).slice(0, 5)})`).join(", ")}.` });
    }
    // ampiezza dell'S&P 500
    let amp = "";
    if (x.indice && x.indice.b200 && x.indice.b200.length) {
      const b = x.indice.b200, N = b.length, ora = b[N - 1], mese = b[Math.max(0, N - 22)];
      amp = ampiezza(ora / 100, `${num(ora, 0)}%`, `un mese fa ${num(mese, 0)}% · tutto l'S&P 500`, "Azioni dell'S&P 500 sopra la media 200");
    }
    box.innerHTML = testa("usa", "USA", "#usa/monitor") + indiceHtml({
      nome: "S&amp;P 500", sotto: "ETF SPY, in dollari", valore: `${cifre(a.ultimo)}<small> $</small>`, a, unitaStriscia: ["seduta", "sedute"],
    }) + `<div class="hc-grafico" id="home-usa-graf"></div>` + numeri([
      ["1 mese", p100(a.m1), cls100(a.m1)], ["Da inizio anno", p100(a.ytd), cls100(a.ytd)], ["Dal massimo", p100(a.dd52), ""],
    ]) + amp + puntiHtml(punti) + piede(`Chiusura del ${dataIt(x.px.aggiornato)}`, "#usa/monitor", "Monitor dei settori");
    miniGrafico($("#home-usa-graf"), { date: x.px.date, prezzo: a.p, media: a.m200, n: 252, formato: v => `${cifre(v)} $`, nome: "SPY", etichetta: "SPY nell'ultimo anno con la media a 200 sedute" });
  }

  // ---------------- pezzi delle schede ----------------

  function testa(z, nome, href) {
    return `<a class="hc-testa" href="${href}"><span class="hc-zona">${icona(z)}<b>${nome}</b></span><span class="hc-apri">Apri <span aria-hidden="true">→</span></span></a>`;
  }

  function indiceHtml(o) {
    const a = o.a || {};
    const s = o.striscia !== undefined ? o.striscia : a.striscia;
    const u = o.unitaStriscia || ["seduta", "sedute"];
    const quanto = s ? `${s.sopra ? "sopra" : "sotto"} la media 200 da ${s.almeno ? "almeno " : ""}${unita(s.sedute != null ? s.sedute : s.giorni, u)}` : "";
    const stato = o.stato !== undefined ? o.stato : a.stato;
    const g1 = o.g1 !== undefined ? o.g1 : a.g1;
    const vs200 = o.vs200 !== undefined ? o.vs200 : a.vs200;
    return `<div class="hc-indice">
        <div class="hc-nome"><b>${o.nome}</b><small>${o.sotto}</small></div>
        <div class="hc-valore">${o.valore}<span class="${cls100(g1)}">${p100(g1)}</span></div>
        <div class="hc-stato">${pill(stato, o.nomiStati)}<span>${quanto}${vs200 != null ? ` (${p100(vs200)})` : ""}</span></div>
      </div>`;
  }

  const numeri = righe => `<div class="hc-numeri">${righe.map(([l, v, c, t]) => `<div${t ? ` title="${esc(t)}"` : ""}><span>${l}</span><b class="${c || ""}">${v}</b></div>`).join("")}</div>`;

  function ampiezza(q, valore, sotto, titolo) {
    return `<div class="hc-amp" title="${esc(titolo)}">
        <div class="hc-amp-t"><span>${titolo}</span><b>${valore}</b></div>
        <div class="meter"><i style="width:${Math.max(0, Math.min(100, (q || 0) * 100))}%"></i></div>
        <small>${sotto}</small>
      </div>`;
  }

  const puntiHtml = punti => (punti.length ? `<ul class="hc-punti">${punti.map(p => `<li><i style="--c:${p.c}"></i><span>${p.html}</span></li>`).join("")}</ul>` : "");
  const piede = (testo, href, link) => `<div class="hc-piede"><span>${testo}</span><a href="${href}">${link} <span aria-hidden="true">→</span></a></div>`;

  function scheletro(z) {
    const box = $(`#home-${z}`);
    const nome = (ZONE.find(x => x[0] === z) || [])[1] || "";
    box.innerHTML = testa(z, nome, `#${z}/monitor`) + `<div class="hc-attesa"><i></i><i></i><i></i><span>Sto caricando i dati…</span></div>`;
  }

  function errore(z, testo) {
    const box = $(`#home-${z}`);
    const nome = (ZONE.find(x => x[0] === z) || [])[1] || "";
    box.innerHTML = testa(z, nome, `#${z}/monitor`) + `<p class="hc-vuoto">${testo}</p>`;
  }

  // ---------------- Europa ----------------

  function disegnaEur(x) {
    const box = $("#home-eur");
    const s = x.indice, a = s ? s.a : null;
    const punti = [];
    if (x.indici.length >= 4) {
      const forti = x.indici.slice(0, 2), deboli = x.indici.slice(-1);
      const link = i => `<a href="#eur/settori/${encodeURIComponent(i.nome)}">${esc(i.nome)}</a> ${p100(i.m3)}`;
      punti.push({ c: "var(--soglia)", html: `Indici a 3 mesi, in euro: più forti ${forti.map(link).join(", ")}; più debole ${deboli.map(link).join("")}.` });
    }
    const lead = x.settori.filter(z => z.rs && z.rs.quadrante === "leader").sort((u, v) => v.rs.ratio - u.rs.ratio);
    const migl = x.settori.filter(z => z.rs && z.rs.quadrante === "miglioramento").sort((u, v) => v.rs.mom - u.rs.mom);
    const linkS = z => `<a href="#eur/settori/${encodeURIComponent(z.nome)}">${esc(z.nome)}</a>`;
    if (lead.length || migl.length) {
      punti.push({ c: "var(--q-leader)", html: `Settori sulla media europea: ${[lead.length ? `leader ${elenco(lead.slice(0, 3).map(linkS))}` : "", migl.length ? `in miglioramento ${elenco(migl.slice(0, 2).map(linkS))}` : ""].filter(Boolean).join("; ")}.` });
    }
    punti.push({ c: "var(--q-miglioramento)", html: `Nell'ultima settimana <b>${x.nMax}</b> ${x.nMax === 1 ? "azione" : "azioni"} a un nuovo massimo di 52 settimane e <b>${x.nMin}</b> a un nuovo minimo.` });
    box.innerHTML = testa("eur", "Europa", "#eur/monitor") + (a ? indiceHtml({
      nome: "STOXX Europe 600", sotto: `${x.n} azioni di ${x.nIndici} indici`, valore: cifre(a.ultimo), a,
    }) : `<p class="hc-vuoto">Manca lo STOXX Europe 600: qui sotto il paniere di tutte le azioni.</p>`) +
      `<div class="hc-grafico" id="home-eur-graf"></div>` + numeri([
        ["1 mese", p100((a || x.paniereA).m1), cls100((a || x.paniereA).m1)], ["Da inizio anno", p100((a || x.paniereA).ytd), cls100((a || x.paniereA).ytd)],
        ["Dal massimo", p100((a || x.paniereA).dd52), ""],
      ]) +
      ampiezza(x.amp.q, x.amp.q == null ? "—" : `${num(x.amp.q * 100, 0)}%`, `${x.amp.sopra} su ${x.amp.validi} · un mese fa ${x.amp.mese == null ? "—" : num(x.amp.mese * 100, 0) + "%"}`, "Azioni europee sopra la media 200") +
      puntiHtml(punti) + piede(`Chiusura del ${dataIt(x.data)}`, "#eur/monitor", "Monitor europeo");
    const g = a || x.paniereA;
    miniGrafico($("#home-eur-graf"), { date: x.date, prezzo: g.p, media: g.m200, n: 252, formato: cifre, nome: a ? "STOXX 600" : "Paniere", etichetta: "STOXX Europe 600 nell'ultimo anno con la media a 200 sedute" });
  }

  // ---------------- crypto ----------------

  function disegnaCry(x) {
    const box = $("#home-cry");
    const o = x.btc.a.oggi, s = o.striscia;
    const punti = [];
    punti.push({
      c: "var(--soglia)",
      html: `Multiplo di Mayer <b>${num(o.mayer, 2)}</b>${o.mayer != null ? (o.mayer < 0.8 ? " (sotto 0,8: forte sconto sulla media 200)" : o.mayer > 2.4 ? " (sopra 2,4: zona degli eccessi)" : "") : ""}` +
        (x.paura != null ? ` · Fear &amp; Greed <b>${x.paura}</b> (${x.pauraEtichetta})` : "") + ".",
    });
    if (x.alt && x.alt.totale) {
      punti.push({
        c: "var(--q-leader)",
        html: `<b>${x.alt.meglio} altcoin su ${x.alt.totale}</b> hanno fatto meglio di bitcoin negli ultimi 90 giorni` +
          (x.alt.meglio >= 0.75 * x.alt.totale ? ": le altcoin stanno guidando." : x.alt.meglio <= 0.25 * x.alt.totale ? ": bitcoin è più forte della maggior parte delle altcoin." : "."),
      });
    }
    if (x.halving) punti.push({ c: "var(--q-indebolimento)", html: `Giorno <b>${x.halving.giorni}</b> dall'halving del ${dataIt(x.halving.data)}; dal massimo storico ${p100(o.dd)}.` });
    box.innerHTML = testa("cry", "Crypto", "#cry/monitor") + indiceHtml({
      nome: "Bitcoin", sotto: `in dollari${x.dominanza ? ` · ${num(x.dominanza, 0)}% del valore delle crypto` : ""}`, valore: `${cifre(o.prezzo)}<small> $</small>`,
      g1: o.g1, vs200: o.vs200, stato: o.stato, striscia: s ? { sopra: s.sopra, giorni: s.giorni } : null, unitaStriscia: ["giorno", "giorni"],
    }) + `<div class="hc-grafico" id="home-cry-graf"></div>` + numeri([
      ["30 giorni", p100(o.g30), cls100(o.g30)], ["Da inizio anno", p100(o.ytd), cls100(o.ytd)], ["1 anno", p100(o.g365), cls100(o.g365)],
    ]) + ampiezza(x.totale ? x.sopra / x.totale : null, `${x.sopra}/${x.totale}`, `delle prime ${x.totale} per capitalizzazione · un mese fa ${x.sopraMese ?? "—"}`, "Crypto sopra la media 200") +
      puntiHtml(punti) + piede(`Chiusura del ${dataIt(x.data)} (mezzanotte UTC)`, "#cry/monitor", "Monitor crypto");
    miniGrafico($("#home-cry-graf"), { date: x.date, prezzo: x.btc.a.p, media: x.btc.a.m200, n: 365, formato: v => `${cifre(v)} $`, nome: "Bitcoin", etichetta: "Bitcoin nell'ultimo anno con la media a 200 giorni" });
  }

  // ---------------- portafoglio ----------------

  function disegnaPf(x) {
    const box = $("#home-pf");
    const intesta = `<div class="hp-testa"><a class="hc-testa" href="#tit"><span class="hc-zona">${icona("tit")}<b>Portafoglio</b></span><span class="hc-apri">Apri <span aria-hidden="true">→</span></span></a></div>`;
    if (!x || x.stato === "assente") {
      box.innerHTML = intesta + `<p class="hp-msg">Non hai ancora un portafoglio: con ticker, quantità e prezzi di carico il sito calcola valore, risultato, composizione e rischio in euro. <a href="#tit">Crealo, protetto con una password →</a></p>`;
      return;
    }
    if (x.stato === "bloccato") {
      box.innerHTML = intesta + `<p class="hp-msg">Il portafoglio è protetto con la password. <a href="#tit">Aprilo →</a> (su questo dispositivo la password si può ricordare).</p>`;
      return;
    }
    if (x.stato !== "aperto") {
      box.innerHTML = intesta + `<p class="hp-msg">${x.stato === "vuoto" ? "Il portafoglio è vuoto." : "I prezzi dei titoli del portafoglio non ci sono ancora: arrivano con il prossimo aggiornamento automatico."} <a href="#tit">Apri il portafoglio →</a></p>`;
      return;
    }
    const a = x.a, rp = a.rendimenti.portafoglio || {}, rb = a.rendimenti.bench || {};
    const t = a.calendario.length - 1;
    const oggi = a.righe.filter(r => r.eur && r.eur[t] != null && r.eur[t - 1]).map(r => ({ r, v: r.eur[t] / r.eur[t - 1] - 1 })).sort((u, v) => v.v - u.v);
    const movers = oggi.length > 1 ? [oggi[0], oggi[oggi.length - 1]] : oggi;
    const sotto = a.righe.filter(r => r.vs200 != null && r.vs200 < 0);
    box.innerHTML = intesta + `<div class="hp-corpo">
        <div class="hp-num"><span>Valore</span><b>${euro(a.totale)}</b><small>oggi <span class="${cls((a.oggiPct || 0) * 100)}">${euroSegno(a.oggi)} (${p100(a.oggiPct)})</span></small></div>
        <div class="hp-num"><span>Risultato sul carico</span><b class="${cls(a.risultato || 0)}">${euroSegno(a.risultato)}</b><small>${p100(a.risultatoPct)} su ${euro(a.costo)} investiti</small></div>
        <div class="hp-num"><span>Ultimo anno</span><b class="${cls100(rp.a1)}">${p100(rp.a1)}</b><small>ACWI in euro ${p100(rb.a1)} · con le quantità di oggi</small></div>
        <div class="hp-grafico" id="home-pf-graf"></div>
        <ul class="hc-punti hp-punti">
          ${movers.length ? `<li><i style="--c:var(--price)"></i><span>Oggi: ${movers.map(m => `<a href="#tit/${encodeURIComponent(m.r.t)}">${esc(m.r.t)}</a> <span class="${cls(m.v * 100)}">${p100(m.v)}</span>`).join(" · ")}</span></li>` : ""}
          <li><i style="--c:${sotto.length ? "var(--neg)" : "var(--pos)"}"></i><span>${sotto.length ? `Sotto la media 200: ${sotto.slice(0, 4).map(r => `<a href="#tit/${encodeURIComponent(r.t)}">${esc(r.t)}</a>`).join(", ")}${sotto.length > 4 ? "…" : ""}` : "Tutti i titoli sopra la propria media 200"}</span></li>
          <li><i style="--c:var(--b50)"></i><span>${a.righe.length} ${a.righe.length === 1 ? "titolo" : "titoli"}${a.cassa ? ` e ${euro(a.cassa)} di liquidità` : ""}; il più pesante ${a.rischio.primo ? `${esc(a.rischio.primo.t)} (${num((a.rischio.primo.peso || 0) * 100, 0)}%)` : "—"}</span></li>
        </ul>
      </div>`;
    const v = a.serie.valore;
    if (v && v.some(z => z != null)) {
      miniGrafico($("#home-pf-graf"), { date: a.calendario, prezzo: v, media: null, n: 252, formato: euro, nome: "Valore", etichetta: "Valore del portafoglio nell'ultimo anno, con le quantità di oggi" });
    }
  }

  // ---------------- disegno ----------------

  function intestazione() {
    const d = R.dateDati ? R.dateDati() : {};
    const oggi = new Date().toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    $("#home-kicker").textContent = maiuscola(oggi);
    const pezzi = [];
    if (d.usa || d.meta) pezzi.push(`USA alla chiusura di ${giorno(d.usa || d.meta)}`);
    if (d.europa) pezzi.push(`Europa di ${giorno(d.europa)}`);
    if (d.crypto) pezzi.push(`crypto di ${giorno(d.crypto)} (mezzanotte UTC)`);
    $("#home-sub").textContent = pezzi.length
      ? `Dati: ${elenco(pezzi)}. Clic su una scheda per entrare nella zona.`
      : "USA, Europa e crypto in una pagina: tendenza, ampiezza e cosa si muove. Clic su una scheda per entrare nella zona.";
  }

  const PASSI = {
    usa: [riepilogoUsa, disegnaUsa, "I prezzi USA non ci sono ancora: arrivano con l'aggiornamento automatico."],
    eur: [() => R.viste.eur.riepilogo(), disegnaEur, "I dati delle azioni europee non ci sono ancora: arrivano con l'aggiornamento automatico."],
    cry: [() => R.viste.cry.riepilogo(), disegnaCry, "I dati crypto non ci sono ancora: arrivano con l'aggiornamento automatico."],
    pf: [() => R.portafoglio.riepilogo(), disegnaPf, ""],
  };

  async function carica(k, giro) {
    const [fn, disegnaK, msg] = PASSI[k];
    try {
      if (!st.pronti[k]) st.pronti[k] = await fn();
      if (!st.visibile || giro !== st.giro) return;
      if (!st.pronti[k] && k !== "pf") { errore(k, msg); return; }
      disegnaK(st.pronti[k]);
    } catch (e) {
      console.error(e);
      st.pronti[k] = null;
      if (st.visibile && giro === st.giro && k !== "pf") errore(k, msg);
    }
    intestazione();
  }

  async function disegna() {
    const giro = ++st.giro;
    intestazione();
    for (const [z] of ZONE) if (!st.pronti[z]) scheletro(z);
    if (!st.pronti.pf) $("#home-pf").innerHTML = "";
    await Promise.all(Object.keys(PASSI).map(k => carica(k, giro)));
  }

  function init() {
    // un clic su una zona vuota della scheda apre la zona (i collegamenti interni restano i loro)
    $("#view-home").addEventListener("click", e => {
      if (e.target.closest("a, button, .hc-grafico, .hp-grafico")) return;
      const card = e.target.closest(".home-card[data-zona]");
      if (card) R.vai(`#${card.dataset.zona}/monitor`);
    });
    R.on("livelli", () => { st.pronti.usa = null; if (st.visibile) disegna(); });
    R.on("stati-settori", () => { if (st.visibile && st.pronti.usa) disegnaUsa(st.pronti.usa); });
    R.on("portafoglio", () => { st.pronti.pf = null; if (st.visibile) disegna(); });
    R.on("tema", () => { if (st.visibile) disegna(); });
    window.addEventListener("resize", R.debounce(() => { if (st.visibile) disegna(); }, 250));
  }

  // le schede si riempiono da sole: la pagina non aspetta la più lenta (l'Europa)
  function mostra() {
    st.visibile = true;
    document.title = "Radar Settori · il quadro di oggi";
    disegna().catch(e => console.error(e));
  }

  function nascondi() { st.visibile = false; }

  // ---------------- testo per «Copia per Claude» ----------------

  function contesto() {
    const out = ["## Pagina aperta: Home (il quadro di oggi di USA, Europa e crypto)"];
    const u = st.pronti.usa;
    if (u) {
      const a = u.a;
      out.push(`### USA: S&P 500 (ETF SPY) ${cifre(a.ultimo)} $ il ${dataIt(u.px.aggiornato)}; 1 giorno ${p100(a.g1)}, 1 mese ${p100(a.m1)}, da inizio anno ${p100(a.ytd)}, dal massimo a 52 settimane ${p100(a.dd52)}; sulla media 200 ${p100(a.vs200)}, ${a.stato ? E.STATI[a.stato].toLowerCase() : "tendenza non disponibile"}.`);
      if (u.indice && u.indice.b200) { const b = u.indice.b200, N = b.length; out.push(`Azioni dell'S&P 500 sopra la media 200: ${num(b[N - 1], 1)}% (un mese fa ${num(b[Math.max(0, N - 22)], 1)}%).`); }
      const settori = statiUsa(u.stati);
      if (settori) out.push("Stati dei settori: " + settori.map(s => `${s.etf} ${S.STATI[s.stato] || s.stato}`).join(", ") + ".");
      if (u.rot.length) out.push("Rotazione settimanale contro SPY: " + u.rot.map(r => `${r.etf} ${NOMI_Q[r.m.quadrante]}`).join(", ") + ".");
    }
    const e = st.pronti.eur;
    if (e) {
      const a = e.indice ? e.indice.a : e.paniereA;
      out.push(`### Europa: STOXX Europe 600 ${cifre(a.ultimo)} il ${dataIt(e.data)}; 1 giorno ${p100(a.g1)}, 1 mese ${p100(a.m1)}, da inizio anno ${p100(a.ytd)}; sulla media 200 ${p100(a.vs200)}, ${a.stato ? E.STATI[a.stato].toLowerCase() : "tendenza non disponibile"}.`,
        `Azioni europee sopra la media 200: ${e.amp.sopra} su ${e.amp.validi} (un mese fa ${e.amp.mese == null ? "—" : num(e.amp.mese * 100, 0) + "%"}). Nuovi massimi a 52 settimane nell'ultima settimana: ${e.nMax}, nuovi minimi: ${e.nMin}.`,
        "Indici a 3 mesi in euro: " + e.indici.map(i => `${i.nome} ${p100(i.m3)}`).join(", ") + ".",
        "Settori (forza relativa sulla media europea): " + e.settori.map(z => `${z.nome} ${z.rs ? NOMI_Q[z.rs.quadrante] : "—"}`).join(", ") + ".");
    }
    const c = st.pronti.cry;
    if (c) {
      const o = c.btc.a.oggi;
      out.push(`### Crypto: bitcoin ${cifre(o.prezzo)} $ il ${dataIt(c.data)}; 1 giorno ${p100(o.g1)}, 30 giorni ${p100(o.g30)}, da inizio anno ${p100(o.ytd)}; sulla media 200 ${p100(o.vs200)}, ${o.stato ? E.STATI[o.stato].toLowerCase() : "tendenza non disponibile"}, multiplo di Mayer ${num(o.mayer, 2)}, dal massimo storico ${p100(o.dd)}.`,
        `Sopra la media 200: ${c.sopra} delle prime ${c.totale}.${c.paura != null ? ` Fear & Greed ${c.paura} (${c.pauraEtichetta}).` : ""}${c.halving ? ` Giorno ${c.halving.giorni} dall'halving del ${dataIt(c.halving.data)}.` : ""}`);
    }
    const p = st.pronti.pf;
    if (p && p.stato === "aperto") {
      const a = p.a;
      out.push(`### Portafoglio: valore ${euro(a.totale)}, oggi ${euroSegno(a.oggi)} (${p100(a.oggiPct)}), risultato sul carico ${euroSegno(a.risultato)} (${p100(a.risultatoPct)}), ${a.righe.length} titoli.`);
    } else if (p) out.push(`### Portafoglio: ${p.stato === "bloccato" ? "protetto con password, non ancora aperto" : p.stato === "assente" ? "non ancora creato" : "senza prezzi"}.`);
    return out.join("\n");
  }

  R.viste.home = { init, mostra, nascondi, contesto };
})();
