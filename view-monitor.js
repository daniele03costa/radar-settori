/*
 * Radar Settori — vista 1: Monitor di tutti i settori.
 */
(function () {
  "use strict";

  const R = window.Radar, S = window.Signals, Rot = window.Rotazione;
  const { $, num, pct, dataIt, esc } = R;
  let visibile = false;
  const NOMI_Q = { leader: "Leader", indebolimento: "In indebolimento", ritardo: "In ritardo", miglioramento: "In miglioramento" };

  // quadrante settimanale di ogni settore contro SPY (calcolo predefinito)
  async function rotazioneSettori() {
    try {
      const px = await R.dati.prezzi("usa");
      const b = Rot.barre(px.date, "settimanali", d => window.Calendario.successiva(d, "nyse"));
      const bench = b.indici.map(i => (px.serie.SPY || [])[i]);
      const out = {};
      for (const s of R.meta.settori) {
        const serie = px.serie[s.etf];
        if (!serie) continue;
        const p = b.indici.map(i => serie[i]);
        const r = Rot.calcola(p, bench, "nuova");
        out[s.etf] = Rot.misure(r.ratio, r.mom, p.length - 1);
      }
      return out;
    } catch (e) {
      return {};
    }
  }

  // consecutive chiusure al livello o sotto, contando da oggi all'indietro
  function chiusureSotto(d, lv) {
    let k = 0;
    for (let i = d.b200.length - 1; i >= 0 && d.b200[i] != null && d.b200[i] <= lv; i--) k++;
    return k;
  }

  function daOsservare(etf, d, a) {
    const P = R.parametri();
    const N = d.date.length, t = N - 1;
    const lv = R.livello(etf);
    const b = d.b200[t];
    const n = d.n[t] || 1;
    const unit = 100 / n;
    const titoli = pts => Math.max(1, Math.ceil(pts / unit - 1e-9));
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
      if (m.punti > 0) righe.push(`${da}: per il trigger l'ampiezza deve salire di altri ${num(m.punti, 1)} punti (${titoli(m.punti)} ${titoli(m.punti) === 1 ? "titolo" : "titoli"}) fino al ${num(m.obiettivo, 1)}%`);
      else righe.push(`${da}: l'ampiezza ha già recuperato abbastanza, manca la conferma`);
      righe.push(`Conferme oggi: ${conf} (ne ${m.servono === 1 ? "serve 1" : "servono 2"}); il rimbalzo a V scatterebbe sopra il ${num(m.riarmo, 0)}%`);
    } else if (stato === "cooldown" && ep && ep.segnale != null) {
      righe.push(`Pausa dopo il trigger del ${dataIt(d.date[ep.segnale])}: ancora ${R.sedute(Math.max(0, P.cooldown - (t - ep.segnale)))}`);
      if (!a.armato) righe.push(`Per una nuova zona blu l'ampiezza dovrà prima superare il ${num(a.riarmo, 0)}% (ora ${num(b, 1)}%)`);
    } else {
      const ddOk = pctDD != null && pctDD > P.ddIngresso;
      if (!a.armato && (dist <= P.fasciaAttenzione || stato === "attenzione")) {
        righe.push(`Zona blu bloccata finché l'ampiezza non torna sopra il ${num(a.riarmo, 0)}% (ora ${num(b, 1)}%)`);
      } else if (dist <= 0) {
        const k = chiusureSotto(d, lv);
        if (k < P.chiusureIngresso) righe.push(`${k === 1 ? "Prima chiusura" : k + " chiusure"} al livello blu: ne ${P.chiusureIngresso - k === 1 ? "manca 1" : "mancano " + (P.chiusureIngresso - k)} per entrare in zona blu`);
        if (!ddOk) righe.push(`Ampiezza già al livello, ma il drawdown è al ${num(pctDD, 0)}° percentile: per la zona blu deve superare il ${P.ddIngresso}°`);
      } else if (dist <= P.fasciaAttenzione) {
        righe.push(`Mancano ${num(dist, 1)} punti (${titoli(dist)} ${titoli(dist) === 1 ? "titolo" : "titoli"}) al livello blu del ${num(lv, 0)}%` +
          (ddOk ? "; il drawdown è già abbastanza profondo" : `; poi il drawdown dovrà superare il ${P.ddIngresso}° percentile (ora ${num(pctDD, 0)}°)`));
      } else if (pctDD != null && pctDD > P.ddAttenzione) {
        righe.push(`Drawdown più profondo del ${num(pctDD, 0)}% della storia, ma l'ampiezza è ancora ${num(dist, 1)} punti sopra il livello blu`);
      }
    }
    return righe;
  }

  async function disegna() {
    const tutti = await R.dati.tuttiSettori();
    const [rot, indice] = await Promise.all([rotazioneSettori(), R.dati.indice().catch(() => null)]);
    if (!visibile) return;

    const righe = R.meta.settori.map(s => {
      const d = tutti[s.etf];
      const a = R.analisiSync(s.etf, d);
      const N = d.date.length;
      const lv = R.livello(s.etf);
      const b = d.b200[N - 1];
      return {
        etf: s.etf, nome: s.nome, d, a, lv, b,
        mese: d.b200[Math.max(0, N - 22)],
        dist: b == null ? null : b - lv,
        dd: d.dd[N - 1], pctDD: a.ddPerc[N - 1],
        n: d.n[N - 1], stato: a.statoOggi || "normale",
        rot: rot[s.etf] || null,
      };
    });
    righe.sort((x, y) => (R.ORDINE_STATI[x.stato] - R.ORDINE_STATI[y.stato]) || ((x.dist ?? 999) - (y.dist ?? 999)));

    const dataDati = righe[0] ? righe[0].d.date[righe[0].d.date.length - 1] : R.meta.aggiornato;
    $("#mon-sub").textContent = `Chiusura del ${dataIt(dataDati)}. Il livello blu di ogni settore si cambia nella vista Settore.`;

    // riquadri
    const c = R.colori();
    const conta = k => righe.filter(r => r.stato === k);
    let tileIndice = "";
    if (indice && indice.b200 && indice.b200.length) {
      const N = indice.b200.length;
      const ora = indice.b200[N - 1], prima = indice.b200[Math.max(0, N - 22)];
      tileIndice = `<div class="kpi" style="--k:var(--b200)"><div class="l"><i></i>S&amp;P 500, titoli sopra la media 200</div>
        <div class="v">${num(ora, 1)}<small>%</small></div>
        <div class="s">un mese fa ${num(prima, 1)}% · ultimi 12 mesi</div>
        ${R.sparkline(indice.b200.slice(-252), { colore: c.b200, min: 0, max: 100, area: true })}</div>`;
    }
    const ordineStati = ["fallito", "trigger", "blu", "attenzione", "cooldown", "normale"];
    const presenti = ordineStati.map(k => ({ k, n: conta(k).length })).filter(x => x.n);
    const tileStati = `<div class="kpi"><div class="l">Stato degli 11 settori</div>
      <div class="v">${conta("blu").length + conta("fallito").length + conta("trigger").length}<small> tra zona blu e trigger</small></div>
      <div class="stack">${presenti.map(x => `<i class="st-${x.k}" style="flex:${x.n}" title="${S.STATI[x.k]}: ${x.n}"></i>`).join("")}</div>
      <div class="stack-legend">${presenti.map(x => `<span class="st-${x.k}">${S.STATI[x.k]} ${x.n}</span>`).join("")}</div></div>`;
    const vicini = righe.filter(r => r.dist != null && !["blu", "fallito", "trigger"].includes(r.stato)).sort((a, b) => a.dist - b.dist);
    const primo = vicini[0];
    const tileVicino = primo ? `<div class="kpi" style="--k:var(--st-blu)"><div class="l"><i></i>Il più vicino alla zona blu</div>
      <div class="v">${primo.etf}<small> ${R.segnato(primo.dist, 1)} punti</small></div>
      <div class="s">${esc(primo.nome)} · livello ${num(primo.lv, 0)}%</div>
      ${R.sparkline(primo.d.b200.slice(-126), { colore: c.b200, livello: primo.lv, min: 0 })}</div>` : "";
    $("#mon-kpi").innerHTML = tileIndice + tileStati + tileVicino;

    // tabella
    const quad = m => {
      if (!m) return `<span class="muted">—</span>`;
      return `<span class="quad" style="--c:var(--q-${m.quadrante})"><i></i>${NOMI_Q[m.quadrante]}</span>${R.freccia(m.direzione)}`;
    };
    $("#mon-tabella").innerHTML = `<thead><tr>
        <th>Settore</th><th class="l">Stato</th><th class="l">Sopra la media 200 · 6 mesi</th><th>Oggi</th>
        <th>Dal livello blu</th><th>Drawdown</th><th class="l">Rotazione vs SPY</th>
      </tr></thead><tbody>` +
      righe.map(r => {
        const delta = r.b != null && r.mese != null ? r.b - r.mese : null;
        const rosso = r.pctDD != null && r.pctDD > 80;
        const colDist = r.dist == null ? "inherit" : r.dist <= 0 ? "var(--st-blu)" : r.dist <= 10 ? "var(--st-attenzione)" : "inherit";
        return `<tr class="clic" data-etf="${r.etf}" tabindex="0">
          <td><b>${r.etf}</b><small class="sub-line">${esc(r.nome)}</small></td>
          <td class="l"><span class="st-pill big st-${r.stato}">${S.STATI[r.stato]}</span></td>
          <td class="l">${R.sparkline(r.d.b200.slice(-126), { colore: c.b200, livello: r.lv, min: 0, area: true })}</td>
          <td><b>${num(r.b, 1)}%</b><small class="sub-line"><span class="${R.cls(delta)}">${delta == null ? "" : R.segnato(delta, 1)}</span> in un mese</small></td>
          <td class="dist" style="color:${colDist}">${r.dist == null ? "—" : R.segnato(r.dist, 1)}<small class="sub-line">livello ${num(r.lv, 0)}%</small></td>
          <td><span class="${rosso ? "neg" : ""}">${pct(r.dd, 1)}</span><small class="sub-line">${num(r.pctDD, 0)}° percentile</small></td>
          <td class="l">${quad(r.rot)}</td>
        </tr>`;
      }).join("") + "</tbody>";

    // da osservare
    const voci = righe.map(r => ({ r, testi: daOsservare(r.etf, r.d, r.a) })).filter(x => x.testi.length);
    $("#mon-osservare").innerHTML = voci.length ? voci.map(({ r, testi }) => `
      <li class="st-${r.stato}">
        <button type="button" class="watch-head" data-etf="${r.etf}"><b>${r.etf}</b> <span class="muted">${esc(r.nome)}</span> <span class="st-pill st-${r.stato}">${S.STATI[r.stato]}</span></button>
        ${testi.map(x => `<p>${x}</p>`).join("")}
      </li>`).join("") : `<li class="vuoto">Nessun settore vicino a un cambio di stato.</li>`;
  }

  function init() {
    const apri = e => {
      const el = e.target.closest("[data-etf]");
      if (el) R.vai("#" + el.dataset.etf);
    };
    $("#mon-tabella").addEventListener("click", apri);
    $("#mon-tabella").addEventListener("keydown", e => { if (e.key === "Enter") apri(e); });
    $("#mon-osservare").addEventListener("click", apri);
    R.on("livelli", () => { if (visibile) disegna(); });
    R.on("tema", () => { if (visibile) disegna(); });
  }

  function mostra() { visibile = true; document.title = "Monitor · Radar Settori"; return disegna(); }
  function nascondi() { visibile = false; }

  R.viste.mon = { init, mostra, nascondi, daOsservare };
})();
