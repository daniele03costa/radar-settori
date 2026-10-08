/*
 * Radar Settori — Monitor degli stati: i settori USA, oppure i settori e gli indici europei (stessa pagina,
 * dati del mercato della zona aperta: R.mercati in core.js).
 */
(function () {
  "use strict";

  const R = window.Radar, S = window.Signals;
  const { $, num, pct, dataIt, esc } = R;
  let visibile = false;
  let M = R.mercati.usa;      // il mercato della pagina aperta
  // «11 settori e 15 indici», contati davvero (un gruppo senza abbastanza prezzi non c'è)
  const contaEu = righe => {
    const k = t => righe.filter(r => r.tipo === t).length;
    return `${k("settore")} ${k("settore") === 1 ? "settore" : "settori"} e ${k("indice")} ${k("indice") === 1 ? "indice" : "indici"}`;
  };
  const NOMI_Q = { leader: "Leader", indebolimento: "In indebolimento", ritardo: "In ritardo", miglioramento: "In miglioramento" };

  // consecutive chiusure al livello o sotto, contando da oggi all'indietro
  function chiusureSotto(d, lv) {
    let k = 0;
    for (let i = d.b200.length - 1; i >= 0 && d.b200[i] != null && d.b200[i] <= lv; i--) k++;
    return k;
  }

  function daOsservare(etf, d, a) {
    const g = R.mercatoDi(etf).t.gruppo;
    const P = R.parametri();
    const N = d.date.length, t = N - 1;
    const lv = R.livello(etf);
    const b = d.b200[t];
    const n = d.n[t] || 1;
    const unit = 100 / n;
    const titoli = pts => Math.max(1, Math.ceil(pts / unit - 1e-9));
    const tl = R.titoliLivello(b, n, lv);
    const pctDD = a.ddPerc[t];
    const ep = a.episodi[a.episodi.length - 1];
    const stato = a.statoOggi || "normale";
    const righe = [];
    if (b == null) return righe;
    const dist = b - lv;

    if (stato === "trigger" && ep && ep.segnale != null) {
      righe.push(`Trigger del ${dataIt(d.date[ep.segnale])} (${ep.motivi.map(m => S.MOTIVI[m]).join(" + ")}): in verifica da ${R.sedute(t - ep.segnale)} su ${P.verifica}` +
        (ep.sogliaFallimento != null ? `; si annulla con una chiusura sotto ${num(ep.sogliaFallimento, 2)}` : ""));
    } else if (stato === "fallito") {
      righe.push("Il trigger è fallito oggi: di nuovo in zona blu, e ora per ripartire servono 2 conferme");
    } else if (stato === "blu" && a.manca) {
      const m = a.manca;
      const da = t - ep.inizio === 0 ? "Entrato in zona blu oggi" : `In zona blu da ${R.sedute(t - ep.inizio)}`;
      const conf = m.conferme.length ? m.conferme.map(x => S.MOTIVI[x]).join(", ") : "nessuna";
      if (m.punti > 0) righe.push(`${da}: per il trigger l'ampiezza deve salire di altri ${num(m.punti, 1)} punti (${titoli(m.punti)} ${titoli(m.punti) === 1 ? "titolo" : "titoli"}) fino ${R.art("al", num(m.obiettivo, 1) + "%")}`);
      else righe.push(`${da}: l'ampiezza ha già recuperato abbastanza, manca la conferma`);
      righe.push(`Conferme oggi: ${conf} (ne ${m.servono === 1 ? "serve 1" : "servono 2"}); il rimbalzo a V scatterebbe sopra ${R.art("il", num(m.riarmo, 0) + "%")}`);
    } else if (stato === "cooldown" && ep && ep.segnale != null) {
      righe.push(`Pausa dopo il trigger del ${dataIt(d.date[ep.segnale])}: ancora ${R.sedute(Math.max(0, P.cooldown - (t - ep.segnale)))}`);
      if (!a.armato) righe.push(`Per una nuova zona blu l'ampiezza dovrà prima superare ${R.art("il", num(a.riarmo, 0) + "%")} (ora ${num(b, 1)}%)`);
    } else {
      const ddOk = pctDD != null && pctDD > P.ddIngresso;
      if (!a.armato && (dist <= P.fasciaAttenzione || stato === "attenzione")) {
        righe.push(`Zona blu bloccata finché l'ampiezza non torna sopra ${R.art("il", num(a.riarmo, 0) + "%")} (ora ${num(b, 1)}%)`);
      } else if (dist <= 0) {
        const k = chiusureSotto(d, lv);
        if (k < P.chiusureIngresso) righe.push(`${k === 1 ? "Prima chiusura" : k + " chiusure"} al livello blu: ne ${P.chiusureIngresso - k === 1 ? "manca 1" : "mancano " + (P.chiusureIngresso - k)} per entrare in zona blu`);
        if (!ddOk) righe.push(`Ampiezza già al livello, ma il drawdown è ${R.art("al", num(pctDD, 0) + "°")} percentile: per la zona blu deve superare ${R.art("il", P.ddIngresso + "°")}`);
      } else if (dist <= P.fasciaAttenzione) {
        righe.push(`Mancano ${num(dist, 1)} punti (${tl ? R.titoli(tl.mancano) : "—"} da portare sotto la media 200) al livello blu ${R.art("del", num(lv, 0) + "%")}${tl ? `, cioè ${tl.soglia} su ${tl.n} sopra la media` : ""}` +
          (ddOk ? "; il drawdown è già abbastanza profondo" : `; poi il drawdown dovrà superare ${R.art("il", P.ddIngresso + "°")} percentile (ora ${num(pctDD, 0)}°)`));
      } else if (pctDD != null && pctDD > P.ddAttenzione) {
        righe.push(`Drawdown più profondo ${R.art("del", num(pctDD, 0) + "%")} della storia ${g === "settore" ? "del settore" : "del gruppo"}, ma l'ampiezza è ancora ${num(dist, 1)} punti sopra il livello blu`);
      }
    }
    return righe;
  }

  // righe della tabella: una per gruppo, ordinate dal più vicino a un segnale
  async function calcola(m) {
    m = m || M;
    await m.pronto();
    const tutti = await m.tutti();
    const [rot, indice] = await Promise.all([R.rotazioneGruppi(m, tutti), m.indice().catch(() => null)]);
    const righe = m.meta().settori.map(s => {
      const d = tutti[s.etf];
      const a = R.analisiSync(s.etf, d);
      const N = d.date.length;
      const lv = R.livello(s.etf);
      const b = d.b200[N - 1];
      return {
        etf: s.etf, nome: s.nome, cod: m.cod(s), sotto: m.sotto(s), tipo: s.tipo, d, a, lv, b,
        mese: d.b200[Math.max(0, N - 22)],
        dist: b == null ? null : b - lv,
        dd: d.dd[N - 1], pctDD: a.ddPerc[N - 1],
        n: d.n[N - 1], stato: a.statoOggi || "normale",
        rot: rot[s.etf] || null,
        tl: R.titoliLivello(b, d.n[N - 1], lv),
      };
    });
    // prima gli stati più "caldi"; a parità, chi ha meno titoli da portare sotto la media per arrivare al livello
    righe.sort((x, y) => (R.ORDINE_STATI[x.stato] - R.ORDINE_STATI[y.stato]) ||
      ((x.tl ? x.tl.mancano : 999) - (y.tl ? y.tl.mancano : 999)) || ((x.dist ?? 999) - (y.dist ?? 999)));
    return { righe, indice, m };
  }

  // ---------- novità dell'ultima seduta ----------
  function novita(righe, indice, m) {
    m = m || M;
    const P = R.parametri();
    const pill = s => `<span class="st-pill st-${s}">${S.STATI[s]}</span>`;
    const conta = (t, testo) => t ? `${t.sopra} ${t.sopra === 1 ? "titolo" : "titoli"} su ${t.n}` : testo;
    const cambi = [], attenzione = [], movimenti = [], rotazione = [], prima = [];
    let dataUltima = null, dataPrima = null;
    for (const r of righe) {
      const d = r.d, a = r.a, t = d.date.length - 1;
      if (t < 5) continue;
      dataUltima = d.date[t];
      dataPrima = d.date[t - 1];
      const ieri = R.titoliLivello(d.b200[t - 1], d.n[t - 1], r.lv), oggi = r.tl;
      const s0 = a.stati[t - 1], s1 = a.stati[t];
      if (s0 && s1 && s0 !== s1) {
        const extra = s1 === "blu" ? `: ${conta(oggi)} sopra la media 200, livello ${num(r.lv, 0)}%`
          : s1 === "trigger" ? `: ${(a.episodi[a.episodi.length - 1] || { motivi: [] }).motivi.map(m => R.MOTIVI_BREVI[m] || m).join(" + ")}`
          : s1 === "attenzione" ? `: a ${oggi ? R.titoli(oggi.mancano) : "—"} dal livello blu, drawdown ${R.art("al", num(r.pctDD, 0) + "°")} percentile` : "";
        cambi.push({ stato: s1, html: `<b>${esc(r.cod)}</b> ${esc(m.zona === "eur" ? "" : r.nome)}: da ${pill(s0)} a ${pill(s1)}${extra}`.replace("</b> :", "</b>:") });
      }
      // cambi di stato nelle quattro sedute precedenti
      for (let i = Math.max(1, t - 4); i < t; i++) {
        if (a.stati[i] && a.stati[i - 1] && a.stati[i] !== a.stati[i - 1]) prima.push(`${esc(r.cod)} ${S.STATI[a.stati[i - 1]].toLowerCase()} → ${S.STATI[a.stati[i]].toLowerCase()} (${dataIt(d.date[i]).slice(0, 5)})`);
      }
      // ingresso nella fascia di attenzione o molto vicino al livello
      const distIeri = d.b200[t - 1] == null ? null : d.b200[t - 1] - r.lv;
      if (s1 === s0 && r.dist != null && distIeri != null && r.dist > 0 && r.dist <= P.fasciaAttenzione && distIeri > P.fasciaAttenzione) {
        attenzione.push({ html: `<b>${esc(r.cod)}</b> entra nella fascia dei ${P.fasciaAttenzione} punti dal livello blu: ne mancano ${num(r.dist, 1)}, cioè ${oggi ? R.titoli(oggi.mancano) : "—"}` });
      } else if (s1 === s0 && oggi && ieri && oggi.mancano > 0 && oggi.mancano <= 3 && ieri.mancano > 3) {
        attenzione.push({ html: `<b>${esc(r.cod)}</b> è a ${R.titoli(oggi.mancano)} dal livello blu` });
      }
      // movimenti forti dell'ampiezza in una seduta
      const dP = d.b200[t] != null && d.b200[t - 1] != null ? d.b200[t] - d.b200[t - 1] : null;
      const dT = oggi && ieri ? oggi.sopra - ieri.sopra : null;
      if (dP != null && (Math.abs(dP) >= 8 || Math.abs(dT) >= 5)) movimenti.push({ dP, html: `<b>${esc(r.cod)}</b> ${R.segnato(dP, 1)} punti in un giorno (${R.segnato(dT, 0)} ${Math.abs(dT) === 1 ? "titolo" : "titoli"}): ora ${conta(oggi)} sopra la media 200` });
      // rotazione: cambio di quadrante nell'ultima settimana
      if (r.rot && r.rot.durata === 1 && r.rot.precedente) {
        rotazione.push(`${esc(r.cod)} da ${NOMI_Q[r.rot.precedente].toLowerCase()} a ${NOMI_Q[r.rot.quadrante].toLowerCase()}${r.rot.provvisoria ? " (settimana in corso)" : ""}`);
      }
    }
    movimenti.sort((x, y) => Math.abs(y.dP) - Math.abs(x.dP));
    const giorno = s => s ? new Date(s + "T12:00:00Z").toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" }) : "—";
    const righeHtml = [];
    for (const c of cambi) righeHtml.push(`<li class="st-${c.stato}"><i></i><span>${c.html}</span></li>`);
    for (const x of attenzione) righeHtml.push(`<li class="st-attenzione"><i></i><span>${x.html}</span></li>`);
    for (const m of movimenti.slice(0, 3)) righeHtml.push(`<li class="mov ${m.dP < 0 ? "giu" : "su"}"><i></i><span>${m.html}</span></li>`);
    if (rotazione.length) righeHtml.push(`<li class="rot"><i></i><span>${m.t.rotazioneTesto}, cambi di quadrante: ${rotazione.join("; ")}</span></li>`);
    let sp = "";
    if (indice && indice.b200 && indice.b200.length > 1) {
      const N = indice.b200.length;
      const dI = indice.b200[N - 1] - indice.b200[N - 2];
      sp = `${esc(m.t.indiceIntero)}: ${num(indice.b200[N - 1], 1)}% dei titoli sopra la media 200 (${R.segnato(dI, 1)} punti).`;
    }
    const vuoto = !cambi.length && !attenzione.length && !movimenti.length && !rotazione.length;
    return `
      <div class="card-title"><h2>Novità della seduta di ${giorno(dataUltima)}</h2><span class="muted small-inline">rispetto a ${giorno(dataPrima)}</span></div>
      ${vuoto ? `<p class="novita-vuota">Nessun cambio di stato e nessun movimento forte dell'ampiezza.</p>` : `<ul class="novita-lista">${righeHtml.join("")}</ul>`}
      <p class="novita-piede">${sp}${prima.length ? ` Nei giorni prima: ${prima.join(", ")}.` : ""}</p>`;
  }

  async function disegna() {
    const m = M;
    let dati;
    try { dati = await calcola(m); }
    catch (e) {
      if (visibile && m === M) $("#mon-sub").textContent = m.zona === "eur" ? "I dati dell'ampiezza europea non ci sono ancora: arrivano con il prossimo aggiornamento automatico." : "Dati non disponibili.";
      throw e;
    }
    if (!visibile || m !== M) return;
    const { righe, indice } = dati;
    const P = R.parametri();
    $("#mon-novita").innerHTML = novita(righe, indice, m);

    const dataDati = righe[0] ? righe[0].d.date[righe[0].d.date.length - 1] : m.meta().aggiornato;
    $("#mon-sub").textContent = m.zona === "eur"
      ? `Chiusura del ${dataIt(dataDati)}. ${contaEu(righe)}, con le loro azioni di oggi. Il livello blu di ognuno si cambia nella pagina Settori e indici.`
      : `Chiusura del ${dataIt(dataDati)}. Il livello blu di ogni settore si cambia nella pagina Settori.`;

    // riquadri
    const c = R.colori();
    const conta = k => righe.filter(r => r.stato === k);
    let tileIndice = "";
    if (indice && indice.b200 && indice.b200.length) {
      const N = indice.b200.length;
      const ora = indice.b200[N - 1], prima = indice.b200[Math.max(0, N - 22)];
      tileIndice = `<div class="kpi" style="--k:var(--b200)"><div class="l"><i></i>${esc(m.t.indiceKpi)}</div>
        <div class="v">${num(ora, 1)}<small>%</small></div>
        <div class="s">un mese fa ${num(prima, 1)}% · ultimi 12 mesi</div>
        ${R.sparkline(indice.b200.slice(-252), { colore: c.b200, min: 0, max: 100, area: true })}</div>`;
    }
    const ordineStati = ["fallito", "trigger", "blu", "attenzione", "cooldown", "normale"];
    const presenti = ordineStati.map(k => ({ k, n: conta(k).length })).filter(x => x.n);
    const nBlu = conta("blu").length + conta("fallito").length, nTrig = conta("trigger").length;
    const valoreStati = nBlu && nTrig
      ? `${nBlu + nTrig}<small> con un segnale in corso</small></div><div class="s">${nBlu} in zona blu in attesa di trigger, ${nTrig} con trigger in verifica`
      : nTrig ? `${nTrig}<small> con trigger in verifica</small>`
      : nBlu ? `${nBlu}<small> in zona blu, in attesa di trigger</small>`
      : `0<small> in zona blu</small></div><div class="s">nessun segnale in corso`;
    const tileStati = `<div class="kpi"><div class="l">Stato ${m.zona === "eur" ? `dei ${righe.length} settori e indici` : `degli ${righe.length} settori`}</div>
      <div class="v">${valoreStati}</div>
      <div class="stack">${presenti.map(x => `<i class="st-${x.k}" style="flex:${x.n}" title="${S.STATI[x.k]}: ${x.n}"></i>`).join("")}</div>
      <div class="stack-legend">${presenti.map(x => `<span class="st-${x.k}">${S.STATI[x.k]} ${x.n}</span>`).join("")}</div></div>`;
    // il più vicino è quello a cui mancano meno titoli (a parità, meno punti)
    const vicini = righe.filter(r => r.tl && !["blu", "fallito", "trigger"].includes(r.stato))
      .sort((a, b) => (a.tl.mancano - b.tl.mancano) || (a.dist - b.dist));
    const primo = vicini[0];
    const tileVicino = primo ? `<div class="kpi" style="--k:var(--st-blu)"><div class="l"><i></i>Il più vicino alla zona blu</div>
      <div class="v">${esc(primo.cod)}<small> a ${R.titoli(primo.tl.mancano)}</small></div>
      <div class="s">${esc(primo.sotto)} · ${R.segnato(primo.dist, 1)} punti dal livello ${num(primo.lv, 0)}% (${primo.tl.soglia}/${primo.tl.n})</div>
      ${R.sparkline(primo.d.b200.slice(-126), { colore: c.b200, livello: primo.lv, min: 0 })}</div>` : "";
    $("#mon-kpi").innerHTML = tileIndice + tileStati + tileVicino;

    // tabella
    const quad = m => {
      if (!m) return `<span class="muted">—</span>`;
      return `<span class="quad" style="--c:var(--q-${m.quadrante})"><i></i>${NOMI_Q[m.quadrante]}</span>${R.freccia(m.direzione)}`;
    };
    const riga = r => {
        const delta = r.b != null && r.mese != null ? r.b - r.mese : null;
        // stessi limiti delle regole: rosso oltre la soglia dell'attenzione, arancio nella fascia di attenzione
        const rosso = r.pctDD != null && r.pctDD > P.ddAttenzione;
        const colDist = r.dist == null ? "inherit" : r.dist <= 0 ? "var(--st-blu)" : r.dist <= P.fasciaAttenzione ? "var(--st-attenzione)" : "inherit";
        const t = r.tl;
        return `<tr class="clic" data-etf="${r.etf}" tabindex="0">
          <td><b>${esc(r.cod)}</b><small class="sub-line">${esc(r.sotto)}</small></td>
          <td class="l"><span class="st-pill big st-${r.stato}">${S.STATI[r.stato]}</span></td>
          <td class="l">${R.sparkline(r.d.b200.slice(-126), { colore: c.b200, livello: r.lv, min: 0, area: true })}</td>
          <td><b>${num(r.b, 1)}%</b>${t ? ` <span class="conta">${t.sopra}/${t.n}</span>` : ""}<small class="sub-line"><span class="${R.cls(delta)}">${delta == null ? "" : R.segnato(delta, 1)}</span> in un mese</small></td>
          <td class="dist" style="color:${colDist}">${r.dist == null ? "—" : R.segnato(r.dist, 1)}<small class="sub-line">${t && t.mancano ? `a ${R.titoli(t.mancano)} · ` : ""}livello ${num(r.lv, 0)}%${t ? ` = ${t.soglia}/${t.n}` : ""}</small></td>
          <td><span class="${rosso ? "neg" : ""}">${pct(r.dd, 1)}</span><small class="sub-line">${num(r.pctDD, 0)}° percentile</small></td>
          <td class="l">${quad(r.rot)}</td>
        </tr>`;
    };
    // in Europa: prima i settori, poi gli indici, ognuno con il suo ordine
    const corpi = m.tipi
      ? m.tipi.map(([k, nome]) => { const rr = righe.filter(r => r.tipo === k); return rr.length ? `<tbody><tr class="grp"><th colspan="7" class="l">${nome} <span class="muted">· ${rr.length}</span></th></tr>${rr.map(riga).join("")}</tbody>` : ""; }).join("")
      : `<tbody>${righe.map(riga).join("")}</tbody>`;
    $("#mon-tabella").innerHTML = `<thead><tr>
        <th>${m.t.Gruppo}</th><th class="l">Stato</th><th class="l">Sopra la media 200 · 6 mesi</th><th>Oggi</th>
        <th>Dal livello blu</th><th>Drawdown</th><th class="l"${m.zona === "eur" ? ` title="${m.t.rotazioneTesto}, barre settimanali"` : ""}>${m.t.rotazione}</th>
      </tr></thead>` + corpi;

    // da osservare
    const voci = righe.map(r => ({ r, testi: daOsservare(r.etf, r.d, r.a) })).filter(x => x.testi.length);
    $("#mon-osservare").innerHTML = voci.length ? voci.map(({ r, testi }) => `
      <li class="st-${r.stato}">
        <button type="button" class="watch-head" data-etf="${r.etf}"><b>${esc(r.cod)}</b> <span class="muted">${esc(r.sotto)}</span> <span class="st-pill st-${r.stato}">${S.STATI[r.stato]}</span></button>
        ${testi.map(x => `<p>${x}</p>`).join("")}
      </li>`).join("") : `<li class="vuoto">Nessun ${m.zona === "eur" ? "gruppo" : "settore"} vicino a un cambio di stato.</li>`;
  }

  // ---------- testo per la chat: panoramica di tutti i gruppi (per la Home e gli USA: i settori USA) ----------
  async function panoramica(aperta, m) {
    m = m || R.mercati.usa;
    const eu = m.zona === "eur";
    const { righe, indice } = await calcola(m);
    const P = R.parametri();
    const out = [];
    out.push(aperta
      ? `## Pagina aperta: ${eu ? "Europa · " : "USA · "}Monitor\nLa pagina mostra tre riquadri (ampiezza ${eu ? "di tutte le azioni europee del sito" : "dell'intero S&P 500"} negli ultimi 12 mesi, stato ${eu ? `di ${contaEu(righe)}` : "degli 11 settori"}, ${eu ? "gruppo" : "settore"} più vicino alla zona blu), la tabella ${eu ? "dei settori e degli indici, ognuno ordinato" : "di tutti i settori ordinata"} dal più vicino a un segnale (con il mini grafico degli ultimi 6 mesi della quota di titoli sopra la media 200) e la sezione «Da tenere d'occhio».`
      : eu ? "## Panoramica di settori e indici europei (sempre disponibile, anche se la pagina aperta è un'altra)"
        : "## Panoramica di tutti gli 11 settori USA (sempre disponibile, anche se la pagina aperta è un'altra)");
    if (eu) out.push("Europa: per ogni settore (tutte le azioni europee del sito di quel settore) e per ogni indice (le sue azioni di oggi) la quota di titoli sopra la media 200 dal 2005, con gli stessi stati e regole degli USA. Il prezzo è il livello dell'indice o, per un settore, un paniere a pesi uguali delle sue azioni in euro. Livelli blu predefiniti: 5° percentile dell'ampiezza di ogni gruppo dal 2005. Per gli anni passati si usano i titoli di oggi (survivorship bias: l'ampiezza dei primi anni è un po' più alta del vero).");
    if (indice && indice.b200 && indice.b200.length) {
      const N = indice.b200.length;
      out.push(`${m.t.indiceIntero}: ${num(indice.b200[N - 1], 1)}% dei titoli sopra la media 200 (un mese fa ${num(indice.b200[Math.max(0, N - 22)], 1)}%, un anno fa ${num(indice.b200[Math.max(0, N - 253)], 1)}%).`);
    }
    const nov = novita(righe, indice, m)
      .replace(/<\/h2>/g, "\n").replace(/<li[^>]*>/g, "\n- ").replace(/<\/(li|p)>/g, "")
      .replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
    out.push("Novità (riquadro in cima al Monitor): " + nov);
    out.push(`${m.t.Gruppi}, dal più vicino a un segnale:`);
    out.push(`${eu ? "gruppo | tipo" : "ETF | settore"} | stato | titoli sopra la media 200 oggi (un mese fa) | livello blu | punti dal livello blu | drawdown dal massimo a 52 settimane (percentile della storia) | ${eu ? "rotazione settimanale (settori contro la media europea, indici contro lo STOXX 600, in euro)" : "rotazione settimanale contro SPY"}`);
    for (const r of righe) {
      const sopra = r.b == null ? "—" : Math.round((r.b / 100) * r.n);
      const rot = r.rot ? `${NOMI_Q[r.rot.quadrante]}, direzione ${num(r.rot.direzione, 0)}° ${r.rot.bussola || ""}, da ${r.rot.durata} ${r.rot.durata === 1 ? "settimana" : "settimane"}` : "—";
      const tl = r.tl ? ` = ${r.tl.soglia} su ${r.tl.n} titoli` : "";
      const manc = r.tl ? ` (${r.tl.mancano ? `devono scendere sotto la media ancora ${R.titoli(r.tl.mancano)}` : "già al livello"})` : "";
      out.push(`${r.cod} | ${eu ? r.sotto : r.nome} | ${S.STATI[r.stato]} | ${num(r.b, 1)}% = ${sopra} su ${r.n} titoli (${num(r.mese, 1)}%) | ${num(r.lv, 0)}%${tl} | ${R.segnato(r.dist, 1)}${manc} | ${pct(r.dd, 1)} (${num(r.pctDD, 0)}°) | ${rot}`);
    }
    out.push(`Cosa manca a ogni ${eu ? "gruppo" : "settore"} per cambiare stato (sezione «Da tenere d'occhio»):`);
    for (const r of righe) {
      const testi = daOsservare(r.etf, r.d, r.a);
      if (testi.length) out.push(`- ${r.cod}: ${testi.join(". ")}.`);
    }
    out.push(`Ultima zona blu di ogni ${eu ? "gruppo" : "settore"}:`);
    for (const r of righe) {
      const ep = r.a.episodi[r.a.episodi.length - 1];
      if (!ep) { out.push(`- ${r.cod}: nessuna zona blu dal 2005 con il livello attuale`); continue; }
      const trig = ep.segnale != null ? `trigger il ${dataIt(r.d.date[ep.segnale])}, ${eu ? "prezzo" : "ETF"} a 3 mesi dal trigger ${pct(ep.r3, 1)}` : "nessun trigger ancora";
      out.push(`- ${r.cod}: iniziata il ${dataIt(r.d.date[ep.inizio])}, ${trig}; ${r.a.episodi.length} zone blu in tutto dal 2005`);
    }
    out.push(`Parametri: zona blu con ${P.chiusureIngresso} chiusure al livello o sotto e drawdown oltre ${R.art("il", P.ddIngresso + "°")} percentile; attenzione entro ${P.fasciaAttenzione} punti dal livello o drawdown oltre ${R.art("il", P.ddAttenzione + "°")} percentile.`);
    return out.join("\n");
  }

  function init() {
    const apri = e => {
      const el = e.target.closest("[data-etf]");
      if (el) R.vai(M.link(el.dataset.etf));
    };
    $("#mon-tabella").addEventListener("click", apri);
    $("#mon-tabella").addEventListener("keydown", e => { if (e.key === "Enter") apri(e); });
    $("#mon-osservare").addEventListener("click", apri);
    R.on("livelli", () => { if (visibile) disegna(); });
    R.on("tema", () => { if (visibile) disegna(); });
  }

  function mostra(param, ctx) {
    visibile = true;
    const m = R.mercato(ctx && ctx.zona);
    if (m !== M) {
      M = m;
      // niente numeri dell'altro mercato mentre arrivano quelli nuovi
      ["#mon-kpi", "#mon-novita", "#mon-tabella", "#mon-osservare"].forEach(k => { $(k).innerHTML = ""; });
      $("#mon-sub").innerHTML = "&nbsp;";
    }
    R.testiZona($("#view-mon"), M.zona);
    document.title = `Monitor ${M.nome} · Radar Settori`;
    return disegna();
  }
  function nascondi() { visibile = false; }

  R.viste.mon = { init, mostra, nascondi, daOsservare, panoramica, calcola, contesto: () => panoramica(true, M), mercato: () => M };
})();
