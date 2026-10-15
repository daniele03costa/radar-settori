/*
 * Radar Settori — Home · Salute dei dati.
 * Per ogni zona: a che seduta sono i dati e quale era attesa, com'è andato l'ultimo aggiornamento automatico,
 * quanti titoli hanno i prezzi, quali mancano o sono fermi, quali indici Yahoo non dà. Legge i resoconti di
 * data/salute/<passo>.json (salute.py, pochi kB) e, se non ci sono ancora, le date dei file della zona.
 * In fondo le ultime esecuzioni degli aggiornamenti su GitHub (API pubblica, senza chiavi).
 */
(function () {
  "use strict";

  const R = window.Radar, Mc = window.Macro, Cal = window.Calendario;
  const { $, num, esc, dataIt } = R;
  const REPO_PREDEFINITO = { owner: "daniele03costa", repo: "radar-settori" };

  // i passi dell'aggiornamento: resoconto, zona, calendario di borsa, aggiornamento di GitHub che lo fa
  const FONTI = [
    { passo: "usa-ampiezza", zona: "USA", nome: "Ampiezza dei settori", cal: "nyse", flusso: "Aggiorna dati", link: "#usa/monitor", file: "data/meta.json", unita: ["azione", "azioni"] },
    { passo: "usa-prezzi", zona: "USA", nome: "Prezzi di azioni ed ETF", cal: "nyse", flusso: "Aggiorna dati", link: "#usa/rotazione", data: "usa", unita: ["titolo", "titoli"] },
    { passo: "europa", zona: "Europa", nome: "Azioni, settori e indici", cal: "milano", flusso: "Aggiorna dati", link: "#eur/monitor", file: "data/europa/meta.json", unita: ["azione", "azioni"] },
    { passo: "globali", zona: "Europa", nome: "ETF in euro della rotazione", cal: "milano", flusso: "Aggiorna dati", link: "#eur/rotazione", data: "globale", unita: ["ETF", "ETF"] },
    { passo: "asia", zona: "Asia", nome: "Azioni, settori e indici", cal: "feriale", flusso: "Aggiorna Asia ed emergenti", link: "#asi/monitor", file: "data/asia/meta.json", unita: ["azione", "azioni"] },
    { passo: "emergenti", zona: "Emergenti", nome: "Azioni, settori e indici", cal: "feriale", flusso: "Aggiorna Asia ed emergenti", link: "#emg/monitor", file: "data/emergenti/meta.json", unita: ["azione", "azioni"] },
    { passo: "crypto", zona: "Crypto", nome: "Bitcoin e le prime monete", cal: "crypto", flusso: "Aggiorna crypto", link: "#cry/monitor", data: "crypto", unita: ["moneta", "monete"] },
    { passo: "macro", zona: "Macro", nome: "Tassi, dollaro, materie prime, VIX", cal: "feriale", flusso: "Aggiorna dati", link: "#home/macro", data: "macro", unita: ["serie", "serie"] },
    { passo: "miei", zona: "Portafoglio", nome: "I titoli della tua lista", cal: "feriale", flusso: "Aggiorna dati", link: "#tit", unita: ["titolo", "titoli"], facoltativo: true },
  ];
  const NOMI_LIVELLO = { ok: "In ordine", attenzione: "Da guardare", problema: "Problema" };
  const NOMI_FLUSSO = { "pages build and deployment": "Pubblicazione del sito (GitHub Pages)", "pages-build-deployment": "Pubblicazione del sito (GitHub Pages)" };
  const ORDINE_FLUSSI = ["Aggiorna dati", "Aggiorna Asia ed emergenti", "Aggiorna crypto", "pages build and deployment"];

  // i file dei prezzi da cui prendere la data quando manca il resoconto (già in memoria se la zona è stata aperta)
  const CARICA = { usa: () => R.dati.prezzi("usa"), globale: () => R.dati.prezzi("globale"), crypto: () => R.dati.crypto(), macro: () => R.dati.macro() };

  const st = { visibile: false, giro: 0, righe: [], flussi: null, erroreGithub: null, aperti: new Set() };

  // ---------------- formati ----------------

  const unita = (k, u) => `${num(k, 0)} ${k === 1 ? u[0] : u[1]}`;
  function quando(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (isNaN(d)) return "—";
    const ora = d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
    const giorno = x => x.toLocaleDateString("sv-SE");          // AAAA-MM-GG nel fuso del browser
    const oggi = new Date(), ieri = new Date(Date.now() - 864e5);
    if (giorno(d) === giorno(oggi)) return `oggi alle ${ora}`;
    if (giorno(d) === giorno(ieri)) return `ieri alle ${ora}`;
    return `${d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" })} alle ${ora}`;
  }
  const breve = s => (s ? dataIt(s).slice(0, 5) : "—");
  const pill = l => `<span class="sal-stato liv-${l}"><i aria-hidden="true">${l === "ok" ? "✓" : l === "attenzione" ? "!" : "×"}</i>${NOMI_LIVELLO[l]}</span>`;
  const leggi = url => fetch(url, { cache: "no-store" }).then(r => (r.ok ? r.json() : null)).catch(() => null);
  const elencoTitoli = (lista, conData) => `<ul class="sal-titoli">${lista.slice(0, 80).map(x => {
    const t = typeof x === "string" ? x : x.t;
    const nome = typeof x === "string" ? "" : x.nome && x.nome !== t ? x.nome : "";
    return `<li><b>${esc(t)}</b>${nome ? ` ${esc(nome)}` : ""}${conData && x.dal ? ` <span class="muted">ultimo prezzo ${dataIt(x.dal)}</span>` : ""}</li>`;
  }).join("")}${lista.length > 80 ? `<li class="muted">… e altri ${lista.length - 80}</li>` : ""}</ul>`;

  // ---------------- dati ----------------

  async function raccogli() {
    const date = R.dateDati ? R.dateDati() : {};
    const adesso = new Date();
    const righe = await Promise.all(FONTI.map(async f => {
      const [r, file] = await Promise.all([leggi(`data/salute/${f.passo}.json`), f.file ? leggi(f.file) : null]);
      let generato = null;
      let aggiornato = (r && r.aggiornato) || (file && file.aggiornato) || (f.data && date[f.data]) || (f.passo === "usa-ampiezza" && R.meta ? R.meta.aggiornato : null);
      // senza resoconto (primo aggiornamento dopo questa versione) la data si prende dal file dei prezzi
      if (!aggiornato && f.data && CARICA[f.data]) {
        const x = await CARICA[f.data]().catch(() => null);
        aggiornato = (x && x.aggiornato) || null;
        if (x && x.generato) generato = x.generato;
      }
      const ritardo = aggiornato ? Cal.ritardo(aggiornato, adesso, f.cal) : null;
      const g = Mc.giudizio(r, ritardo, aggiornato);
      return Object.assign({}, f, { r, file, aggiornato, ritardo, livello: g.livello, motivi: g.motivi, generato: (r && r.ultimo_tentativo) || (file && file.generato) || generato });
    }));
    // le date trovate qui servono anche all'avviso in alto (dati indietro)
    const CHIAVI = { "usa-ampiezza": "meta", europa: "europa", asia: "ampiezza-asi", emergenti: "ampiezza-emg", crypto: "crypto", macro: "macro" };
    for (const x of righe) if (CHIAVI[x.passo] && x.aggiornato && !date[CHIAVI[x.passo]]) R.emit("prezzi", { mercato: CHIAVI[x.passo], aggiornato: x.aggiornato });
    // la lista personale c'è solo se è stata scritta
    return righe.filter(x => !x.facoltativo || x.r || x.aggiornato);
  }

  async function github() {
    const repo = Mc.repoDaIndirizzo(location.hostname, location.pathname) || REPO_PREDEFINITO;
    $("#sal-actions").href = `https://github.com/${repo.owner}/${repo.repo}/actions`;
    try {
      const r = await fetch(`https://api.github.com/repos/${repo.owner}/${repo.repo}/actions/runs?per_page=60`, { cache: "no-store", headers: { Accept: "application/vnd.github+json" } });
      if (!r.ok) throw new Error(r.status === 403 || r.status === 429 ? "limite" : `HTTP ${r.status}`);
      const j = await r.json();
      const flussi = Mc.esecuzioniPerFlusso(j.workflow_runs || []);
      flussi.sort((a, b) => ((ORDINE_FLUSSI.indexOf(a.nome) + 1) || 99) - ((ORDINE_FLUSSI.indexOf(b.nome) + 1) || 99));
      return { flussi, repo };
    } catch (e) {
      return { errore: String(e && e.message || e), repo };
    }
  }

  // ---------------- disegno ----------------

  function disegnaKpi() {
    const righe = st.righe;
    const n = l => righe.filter(x => x.livello === l).length;
    const prob = n("problema"), att = n("attenzione");
    const generale = prob ? "problema" : att ? "attenzione" : "ok";
    const inPari = righe.filter(x => x.ritardo && x.ritardo.sedute === 0).length;
    const ultimo = righe.map(x => x.r && x.r.ultimo_tentativo).filter(Boolean).sort().pop();
    const mancanti = righe.reduce((s, x) => s + ((x.r && x.r.mancanti) || []).length, 0);
    const fermi = righe.reduce((s, x) => s + ((x.r && x.r.fermi) || []).length, 0);
    const colore = { ok: "var(--pos)", attenzione: "var(--st-attenzione)", problema: "var(--neg)" }[generale];
    $("#sal-kpi").innerHTML = `
      <div class="kpi" style="--k:${colore}"><div class="l"><i></i>Stato generale</div>
        <div class="v">${generale === "ok" ? "Tutto in ordine" : prob ? `${prob} ${prob === 1 ? "problema" : "problemi"}` : `${att} da guardare`}</div>
        <div class="s">${righe.length} fonti controllate${prob && att ? `, ${att} da guardare` : ""}</div></div>
      <div class="kpi"><div class="l">Dati in pari</div><div class="v">${inPari}<small> su ${righe.length}</small></div>
        <div class="s">con l'ultima seduta chiusa di ogni mercato</div></div>
      <div class="kpi"><div class="l">Ultimo aggiornamento</div><div class="v sal-v">${ultimo ? quando(ultimo) : "—"}</div>
        <div class="s">${ultimo ? "l'ultimo passo che ha lasciato un resoconto" : "resoconti in arrivo con il prossimo aggiornamento"}</div></div>
      <div class="kpi"><div class="l">Titoli senza prezzi</div><div class="v">${num(mancanti, 0)}<small>${fermi ? ` + ${num(fermi, 0)} fermi` : ""}</small></div>
        <div class="s">su tutte le zone: dettagli nelle righe</div></div>`;
  }

  function corpo(x) {
    const r = x.r;
    const parti = [];
    if (x.motivi.length) parti.push(`<p><b>Perché:</b> ${esc(x.motivi.join("; "))}.</p>`);
    if (x.ritardo && x.ritardo.sedute > 0) parti.push(`<p>Dati alla seduta del ${dataIt(x.aggiornato)}; era attesa quella del ${dataIt(x.ritardo.attesa)}. Si aggiorna con <b>${esc(x.flusso)}</b>.</p>`);
    if (!r) parti.push(`<p class="muted">Il resoconto dettagliato di questo passo arriva con il prossimo aggiornamento automatico.</p>`);
    else {
      parti.push(`<p class="muted">Ultimo tentativo ${quando(r.ultimo_tentativo)}${r.esito === "errore" ? `, non riuscito${r.ultimo_successo ? `; l'ultimo riuscito ${quando(r.ultimo_successo)}` : ""}` : ", riuscito"}.</p>`);
      if (r.messaggio) parti.push(`<p><b>Messaggio:</b> <code>${esc(r.messaggio)}</code></p>`);
      if (r.avvisi && r.avvisi.length) parti.push(`<p><b>Avvisi:</b></p><ul class="sal-avvisi">${r.avvisi.map(a => `<li><code>${esc(a)}</code></li>`).join("")}</ul>`);
      if (r.mancanti && r.mancanti.length) parti.push(`<p><b>Senza prezzi da Yahoo (${r.mancanti.length})</b>: non entrano nei calcoli.</p>${elencoTitoli(r.mancanti)}`);
      if (r.fermi && r.fermi.length) parti.push(`<p><b>Fermi da più di 5 sedute (${r.fermi.length})</b>: sospesi, tolti dal listino o con il ticker cambiato.</p>${elencoTitoli(r.fermi, true)}`);
      if (r.indici_mancanti && r.indici_mancanti.length) parti.push(`<p><b>Indici che Yahoo non dà</b>: ${esc(r.indici_mancanti.map(i => i.nome).join(", "))}. Il sito usa al loro posto la media a pesi uguali delle loro azioni.</p>`);
      if (r.indici_fermi && r.indici_fermi.length) parti.push(`<p><b>Indici fermi</b>: ${r.indici_fermi.map(i => `${esc(i.nome)} (ultimo valore ${dataIt(i.dal)})`).join(", ")}.</p>`);
      if (r.cambi_mancanti && r.cambi_mancanti.length) parti.push(`<p><b>Cambi mancanti</b>: ${esc(r.cambi_mancanti.join(", "))}: i confronti in euro di quei titoli restano fermi.</p>`);
      if (r.fonti) parti.push(`<p><b>Fonti:</b> ${Object.values(r.fonti).filter((v, i, a) => v && a.indexOf(v) === i).map(esc).join("; ")}.</p>`);
    }
    parti.push(`<p><a href="${x.link}">Apri ${esc(x.zona === "Macro" ? "il quadro macro" : x.zona === "Portafoglio" ? "il portafoglio" : `la zona ${x.zona}`)} <span aria-hidden="true">→</span></a></p>`);
    return parti.join("");
  }

  function riga(x, k) {
    const r = x.r;
    const rit = x.ritardo;
    const datiNota = !x.aggiornato ? "nessun dato" : !rit || rit.sedute === 0 ? "in pari" : rit.sedute === 1 ? `manca il ${breve(rit.attesa)}` : `mancano ${rit.sedute} sedute`;
    const esito = !r ? "resoconto in arrivo" : r.esito === "errore" ? `non riuscito${r.errori_di_fila > 1 ? ` (${r.errori_di_fila} di fila)` : ""}` : r.esito === "avvisi" ? "riuscito, con avvisi" : "riuscito";
    const tot = r ? (r.totale || r.titoli) : null;
    const cop = r && r.titoli != null ? `${num(r.titoli, 0)}${tot && tot !== r.titoli ? ` su ${num(tot, 0)}` : ""}` : "—";
    const nM = r ? (r.mancanti || []).length : 0, nF = r ? (r.fermi || []).length : 0, nI = r ? (r.indici_mancanti || []).length : 0;
    const copNota = r ? [nM ? `${nM} senza prezzi` : "", nF ? `${nF} ferm${nF === 1 ? "o" : "i"}` : "", nI ? `${nI} ${nI === 1 ? "indice" : "indici"} dalla media` : ""].filter(Boolean).join(", ") || "tutti" : "";
    const aperto = st.aperti.has(x.passo);
    return `<div class="sal-riga liv-${x.livello}" data-passo="${x.passo}">
      <button type="button" class="sal-testa" aria-expanded="${aperto}" aria-controls="sal-corpo-${k}">
        ${pill(x.livello)}
        <span class="sal-nome"><b>${esc(x.zona)}</b><span>${esc(x.nome)}</span></span>
        <span class="sal-c sal-c1"><span>Dati al</span><b>${x.aggiornato ? dataIt(x.aggiornato) : "—"}</b><em class="${rit && rit.sedute ? "tardi" : ""}">${datiNota}</em></span>
        <span class="sal-c sal-c2"><span>Ultimo aggiornamento</span><b>${quando(x.generato)}</b><em class="${r && r.esito === "errore" ? "tardi" : ""}">${esito}</em></span>
        <span class="sal-c sal-c3"><span>${esc(x.unita[1].charAt(0).toUpperCase() + x.unita[1].slice(1))} con i prezzi</span><b>${cop}</b><em>${esc(copNota)}</em></span>
        <span class="sal-freccia" aria-hidden="true">›</span>
      </button>
      <div class="sal-corpo" id="sal-corpo-${k}"${aperto ? "" : " hidden"}>${corpo(x)}</div>
    </div>`;
  }

  function disegnaRighe() {
    $("#sal-righe").innerHTML = st.righe.map(riga).join("");
  }

  function disegnaFlussi() {
    const box = $("#sal-flussi");
    if (!st.flussi) { box.innerHTML = `<p class="muted">Sto chiedendo a GitHub…</p>`; return; }
    if (st.flussi.errore) {
      box.innerHTML = `<p class="muted">${st.flussi.errore === "limite"
        ? "GitHub per ora non risponde: concede un numero limitato di richieste all'ora a chi non ha fatto l'accesso. Riprova più tardi o apri Actions con il pulsante qui sopra."
        : "Non riesco a leggere gli aggiornamenti da GitHub in questo momento: apri Actions con il pulsante qui sopra."}</p>`;
      return;
    }
    if (!st.flussi.flussi.length) { box.innerHTML = `<p class="muted">Nessuna esecuzione recente.</p>`; return; }
    const esito = r => (r.status !== "completed" ? ["corso", "in corso"] : r.conclusion === "success" ? ["ok", "riuscito"]
      : r.conclusion === "failure" || r.conclusion === "timed_out" ? ["ko", "non riuscito"] : ["neutro", r.conclusion === "cancelled" ? "annullato" : r.conclusion === "skipped" ? "saltato" : String(r.conclusion || "—")]);
    const avvio = r => (r.event === "schedule" ? "programmato" : r.event === "workflow_dispatch" ? "avviato a mano" : r.event === "push" ? "dopo un caricamento" : r.event === "dynamic" ? "dopo un salvataggio" : r.event || "");
    box.innerHTML = st.flussi.flussi.map(f => {
      const u = f.ultima, [cl, testo] = esito(u);
      return `<div class="sal-flusso">
        <div class="sal-fn"><b>${esc(NOMI_FLUSSO[f.nome] || f.nome)}</b><span>${f.finite ? `${f.falliti} non ${f.falliti === 1 ? "riuscito" : "riusciti"} sugli ultimi ${f.finite}` : "nessuna esecuzione finita"}</span></div>
        <a class="sal-ultima es-${cl}" href="${esc(u.html_url)}" target="_blank" rel="noopener"><i aria-hidden="true"></i>${testo} · ${quando(u.run_started_at || u.created_at)} <span class="muted">${esc(avvio(u))}</span></a>
        <span class="sal-puntini" aria-label="Ultime esecuzioni, dalla più recente">${f.lista.map(r => { const [c, t] = esito(r); return `<a class="es-${c}" href="${esc(r.html_url)}" target="_blank" rel="noopener" title="${esc(`${quando(r.run_started_at || r.created_at)}: ${t}`)}"><i></i></a>`; }).join("")}</span>
      </div>`;
    }).join("");
  }

  async function disegna() {
    const giro = ++st.giro;
    if (!st.righe.length) $("#sal-righe").innerHTML = `<div class="hc-attesa"><i></i><i></i><i></i><span>Controllo i dati…</span></div>`;
    st.flussi = null;
    disegnaFlussi();
    const [righe, flussi] = await Promise.all([raccogli(), github()]);
    if (giro !== st.giro || !st.visibile) return;
    st.righe = righe;
    st.flussi = flussi;
    disegnaKpi();
    disegnaRighe();
    disegnaFlussi();
  }

  function init() {
    $("#sal-righe").addEventListener("click", e => {
      const b = e.target.closest(".sal-testa");
      if (!b) return;
      const riga = b.closest(".sal-riga"), passo = riga.dataset.passo;
      const aperto = b.getAttribute("aria-expanded") !== "true";
      b.setAttribute("aria-expanded", String(aperto));
      riga.querySelector(".sal-corpo").hidden = !aperto;
      if (aperto) st.aperti.add(passo); else st.aperti.delete(passo);
    });
    $("#sal-ricarica").addEventListener("click", () => { if (st.visibile) disegna(); });
  }

  function mostra() {
    st.visibile = true;
    document.title = "Radar Settori · salute dei dati";
    // le righe con un problema si aprono da sole la prima volta
    disegna().then(() => {
      if (st.aperti.size) return;
      st.righe.filter(x => x.livello === "problema").forEach(x => st.aperti.add(x.passo));
      if (st.aperti.size) disegnaRighe();
    }).catch(e => console.error(e));
  }

  function nascondi() { st.visibile = false; }

  function contesto() {
    const out = ["## Pagina aperta: Home · Salute dei dati"];
    for (const x of st.righe) {
      const r = x.r;
      out.push(`- ${x.zona}, ${x.nome}: ${NOMI_LIVELLO[x.livello].toLowerCase()}; dati al ${x.aggiornato ? dataIt(x.aggiornato) : "—"}${x.ritardo && x.ritardo.sedute ? ` (attesa la seduta del ${dataIt(x.ritardo.attesa)})` : ""}` +
        (r ? `; ultimo tentativo ${quando(r.ultimo_tentativo)} ${r.esito === "errore" ? "non riuscito" : "riuscito"}; ${r.titoli != null ? `${r.titoli}${r.totale ? ` su ${r.totale}` : ""} con i prezzi` : ""}` +
          `${(r.mancanti || []).length ? `; senza prezzi: ${r.mancanti.map(m => (typeof m === "string" ? m : m.t)).slice(0, 20).join(", ")}` : ""}` +
          `${(r.indici_mancanti || []).length ? `; indici dalla media delle azioni: ${r.indici_mancanti.map(i => i.nome).join(", ")}` : ""}` : "") + ".");
    }
    if (st.flussi && st.flussi.flussi) {
      out.push("Aggiornamenti su GitHub: " + st.flussi.flussi.map(f => `${NOMI_FLUSSO[f.nome] || f.nome} ${f.falliti} non riusciti sugli ultimi ${f.finite}`).join("; ") + ".");
    }
    return out.join("\n");
  }

  R.salute = { raccogli };
  R.viste.sal = { init, mostra, nascondi, contesto };
})();
