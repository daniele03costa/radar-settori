/*
 * Radar Settori — «Copia dati per Claude».
 * Mette negli appunti i numeri della pagina aperta (anche quelli che nei grafici non si leggono),
 * la panoramica di tutti i settori e una breve spiegazione delle regole, pronti da incollare
 * nella chat di Claude, per esempio nel pannello dell'estensione Claude in Chrome.
 */
(function () {
  "use strict";

  const R = window.Radar;
  const { $ } = R;

  function regole(eu) {
    const P = R.parametri();
    return [
      "## Come funziona Radar Settori",
      eu
        ? "- Ampiezza (Europa): percentuale di azioni di un settore (tutte le azioni europee del sito di quel settore) o di un indice (le sue azioni di oggi) che chiudono sopra la propria media mobile a 200 sedute, dal 2005; si guardano anche le medie a 50 e 20. Prezzi rettificati per split e dividendi; per il passato si usano le azioni di oggi (survivorship bias: i primi anni sono un po' ottimisti)."
        : "- Ampiezza: percentuale di titoli del settore (nell'S&P 500) che chiudono sopra la propria media mobile a 200 sedute; si guardano anche le medie a 50 e 20. Prezzi corretti per gli split, non per i dividendi; per il passato si usano i titoli che erano nell'indice allora.",
      eu
        ? "- Livello blu: soglia di ampiezza propria di ogni gruppo, predefinita al 5° percentile della sua ampiezza dal 2005; si può cambiare nel browser. Prezzo del gruppo: livello dell'indice o, per un settore, paniere a pesi uguali delle sue azioni in euro."
        : "- Livello blu: soglia di ampiezza propria di ogni settore (predefinita dalla tabella «200 LEVEL SETTORI» di quant-rea); si può cambiare nel browser.",
      "- Drawdown: calo dal massimo delle ultime 52 settimane; il percentile dice quanto è raro rispetto alla storia del settore (percentile alto = calo profondo e raro).",
      `- Stati: Normale; Attenzione (ampiezza entro ${P.fasciaAttenzione} punti dal livello blu, oppure drawdown oltre ${R.art("il", P.ddAttenzione + "°")} percentile); ` +
        `Zona blu (${P.chiusureIngresso} chiusure di fila al livello blu o sotto, con drawdown oltre ${R.art("il", P.ddIngresso + "°")} percentile); ` +
        `Trigger (l'ampiezza risale di almeno ${P.recuperoPunti} punti o ${P.recuperoTitoli} titoli sopra il livello e sopra il minimo della zona, con una conferma fra spinta di ampiezza, prezzo sopra una media a 20 sedute in salita e divergenza prezzo/ampiezza; ` +
        `servono due conferme se la zona dura più di ${P.zonaLunga} sedute o dopo un fallimento; il rimbalzo a V sopra il livello di riarmo basta da solo); ` +
        `Fallito (entro ${P.verifica} sedute dal trigger ${eu ? "il prezzo del gruppo" : "l'ETF"} chiude sotto il minimo della zona meno la sua variazione giornaliera media: si torna in zona blu); ` +
        `Cooldown (${P.cooldown} sedute di pausa dopo il trigger; per una nuova zona blu l'ampiezza deve prima superare il riarmo, il maggiore tra ${P.riarmoMinimo}% e livello blu + ${P.riarmoSopra} punti).`,
      "- Rotazione relativa: RS-Ratio (forza rispetto al termine di confronto, sopra 100 fa meglio) e RS-Momentum (se quel vantaggio cresce, sopra 100 sì); quadranti Leader, In indebolimento, In ritardo, In miglioramento; il giro tipico è in senso orario.",
      "- Bottom Map: profondità del drawdown (percentile) contro distanza dell'ampiezza dal livello blu, per vedere chi è vicino a un possibile minimo.",
      "- I segnali sono uno strumento di studio, non consulenza finanziaria: ogni settore ha pochi episodi e l'ampiezza spesso tocca il fondo prima del prezzo.",
    ].join("\n");
  }

  // per Europa e crypto: le parole che servono a leggere i numeri
  function noteGenerali() {
    return [
      "## Come leggere i numeri",
      "- Tendenza: prezzo e media 50 rispetto alla media 200 (positiva se tutti e due sopra, negativa se tutti e due sotto, «in recupero» o «in indebolimento» nei passaggi).",
      "- Ampiezza: quota di azioni sopra la propria media a 200 sedute.",
      "- Rotazione relativa: RS-Ratio (forza rispetto al termine di confronto, sopra 100 fa meglio) e RS-Momentum (se quel vantaggio cresce, sopra 100 sì); quadranti Leader, In indebolimento, In ritardo, In miglioramento; il giro tipico è in senso orario.",
      "- Sono statistiche del passato per studio personale, non previsioni né consulenza finanziaria.",
    ].join("\n");
  }

  // tutto il testo: pagina aperta; per gli USA e la Home anche la panoramica dei settori e le regole degli stati
  async function testoPagina() {
    const oggi = new Date().toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    const zona = R.zonaCorrente ? R.zonaCorrente() : "usa";
    const d = R.dateDati ? R.dateDati() : {};
    const date = [
      d.meta ? `ampiezza USA alla chiusura del ${R.dataIt(d.meta)}` : "",
      d.europa ? `azioni europee del ${R.dataIt(d.europa)}` : "",
      d.europaAmpiezza ? `ampiezza europea del ${R.dataIt(d.europaAmpiezza)}` : "",
      d.crypto ? `crypto del ${R.dataIt(d.crypto)} (mezzanotte UTC)` : "",
    ].filter(Boolean);
    const parti = [
      "# Dati copiati da Radar Settori",
      `Copiati ${oggi}.${date.length ? ` Dati: ${date.join(", ")}.` : ""} Fonte dei prezzi: Yahoo Finance.`,
    ];
    const v = document.body.dataset.view || "home";
    const vista = R.viste[v];
    if (vista && vista.contesto) parti.push(await vista.contesto());
    if (zona === "usa" || zona === "home" || zona === "tit") {
      if (v !== "mon") {
        try { parti.push(await R.viste.mon.panoramica()); } catch (e) { /* la panoramica è un di più */ }
      }
      parti.push(regole(false));
    } else if (zona === "eur") {
      // Europa: la panoramica di settori e indici con i loro stati, se la pagina aperta non è già il Monitor
      if (v !== "mon") {
        try { parti.push(await R.viste.mon.panoramica(false, R.mercati.eur)); } catch (e) { /* un di più */ }
      }
      parti.push(regole(true));
      parti.push(noteGenerali());
    } else parti.push(noteGenerali());
    return parti.join("\n\n");
  }

  let timer = 0;
  function avviso(testo) {
    let el = $("#avviso");
    if (!el) {
      el = document.createElement("div");
      el.id = "avviso";
      el.className = "avviso";
      el.setAttribute("role", "status");
      document.body.append(el);
    }
    el.textContent = testo;
    el.classList.add("on");
    clearTimeout(timer);
    timer = setTimeout(() => el.classList.remove("on"), 4200);
  }

  // se il browser non lascia scrivere negli appunti, il testo si mostra da copiare a mano
  function mostraTesto(testo) {
    let box = $("#copia-box");
    if (!box) {
      box = document.createElement("div");
      box.id = "copia-box";
      box.className = "modal";
      box.setAttribute("role", "dialog");
      box.setAttribute("aria-modal", "true");
      box.setAttribute("aria-labelledby", "copia-titolo");
      box.innerHTML = `
        <div class="modal-box copia-modal">
          <div class="modal-head"><h2 id="copia-titolo">Dati della pagina</h2><button class="icon-btn" type="button" id="copia-chiudi" aria-label="Chiudi">×</button></div>
          <p class="small">Il browser non ha permesso di copiarli da solo: premi Ctrl+C (su Mac ⌘C), il testo è già selezionato.</p>
          <textarea id="copia-testo" readonly spellcheck="false"></textarea>
        </div>`;
      document.body.append(box);
      const chiudi = () => { box.hidden = true; };
      box.addEventListener("click", e => { if (e.target === box || e.target.id === "copia-chiudi") chiudi(); });
      box.addEventListener("keydown", e => { if (e.key === "Escape") { e.stopPropagation(); chiudi(); } });
    }
    box.hidden = false;
    const t = $("#copia-testo");
    t.value = testo;
    t.focus();
    t.select();
    t.scrollTop = 0;
  }

  async function copia() {
    let testo;
    try { testo = await testoPagina(); }
    catch (e) { avviso("I dati di questa pagina non sono ancora pronti: riprova tra un attimo."); return; }
    try {
      await navigator.clipboard.writeText(testo);
      avviso("Dati della pagina copiati: incollali nella chat di Claude con Ctrl+V.");
    } catch (e) {
      mostraTesto(testo);
    }
  }

  function init() {
    const b = $("#copia-claude");
    if (b) b.addEventListener("click", copia);
  }

  R.copiaPerClaude = copia;
  R.testoPagina = testoPagina;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
