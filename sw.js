/*
 * Radar Settori — service worker: il sito si apre subito, anche senza rete, e si installa come app.
 *
 * - Pagina, stili e script: dalla copia salvata nel telefono, ricontrollata in sottofondo.
 *   Se su GitHub è cambiato qualcosa, la copia si aggiorna e il sito propone di ricaricare.
 * - Dati (cartella data/, miei-titoli.txt, portafoglio.txt, universi.json, settings.json, crypto.json,
 *   europa.json): sempre dalla rete; senza rete, o se la rete tarda più di 6 secondi, dall'ultima copia scaricata.
 * - Caratteri di Google e altri siti: non passano da qui.
 *
 * Quando cambia l'elenco dei file del sito, aumentare VERSIONE.
 */
"use strict";

const VERSIONE = "2026-09-30";
const GUSCIO = `radar-guscio-${VERSIONE}`;
const DATI = "radar-dati";
const ATTESA_RETE = 6000;

const FILE_GUSCIO = [
  "./", "style.css", "viste.css",
  "signals.js", "rrg.js", "portafoglio.js", "calendario.js", "chart.js", "core.js",
  "view-settore.js", "view-monitor.js", "view-rotazione.js", "view-bottom.js", "view-alert.js", "view-titoli.js",
  "portafoglio-calcoli.js", "view-portafoglio.js", "crypto-calcoli.js", "view-crypto.js", "europa-calcoli.js", "view-europa.js",
  "app.js", "copia-dati.js",
  "favicon.svg", "manifest.webmanifest", "icona-192.png", "icona-512.png", "icona-maskable.png", "apple-touch-icon.png",
];

const radice = () => new URL("./", self.registration.scope).href;
const eDato = url => url.pathname.includes("/data/") || /\/(miei-titoli\.txt|portafoglio\.txt|universi\.json|settings\.json|crypto\.json|europa\.json)$/.test(url.pathname);

self.addEventListener("install", evento => {
  evento.waitUntil((async () => {
    const cache = await caches.open(GUSCIO);
    // un file mancante non blocca gli altri
    await Promise.all(FILE_GUSCIO.map(async f => {
      try {
        const r = await fetch(new Request(f, { cache: "reload" }));
        if (r.ok) await cache.put(new URL(f, self.registration.scope).href, r);
      } catch (e) { /* si riprova alla prossima apertura */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", evento => {
  evento.waitUntil((async () => {
    const nomi = await caches.keys();
    await Promise.all(nomi.filter(n => n.startsWith("radar-guscio-") && n !== GUSCIO).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", evento => {
  const req = evento.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (eDato(url)) { evento.respondWith(dati(req, url, evento)); return; }
  const pagina = req.mode === "navigate";
  if (pagina && !/\/(index\.html)?$/.test(url.pathname)) return;
  evento.respondWith(guscio(req, pagina ? radice() : url.origin + url.pathname, pagina, evento));
});

// dati: rete prima, poi l'ultima copia (una sola per file, senza il ?v=…)
async function dati(req, url, evento) {
  const cache = await caches.open(DATI);
  const chiave = url.origin + url.pathname;
  const rete = fetch(req).then(async r => {
    if (r.ok) await cache.put(chiave, r.clone()).catch(() => {});
    return r;
  }).catch(() => null);
  evento.waitUntil(rete);                        // la copia si salva anche se si risponde prima
  const salvata = await cache.match(chiave);
  if (!salvata) return (await rete) || Response.error();
  const tempo = new Promise(ok => setTimeout(() => ok(null), ATTESA_RETE));
  const r = await Promise.race([rete, tempo]);
  return r && r.ok ? r : salvata;
}

// pagina, stili e script: subito dalla copia, poi controllo in sottofondo
async function guscio(req, chiave, pagina, evento) {
  const cache = await caches.open(GUSCIO);
  const salvata = await cache.match(chiave);
  const copia = salvata ? salvata.clone() : null;   // la risposta salvata va alla pagina: si confronta la copia
  const aggiorna = (async () => {
    try {
      const r = await fetch(pagina ? chiave : req, { cache: "no-cache" });
      if (!r.ok) return salvata ? null : r;
      if (copia) {
        const [prima, dopo] = await Promise.all([copia.text(), r.clone().text()]);
        if (prima === dopo) return r;
        await cache.put(chiave, r.clone());
        await avvisaNuovaVersione();
        return r;
      }
      await cache.put(chiave, r.clone());
      return r;
    } catch (e) {
      return null;
    }
  })();
  if (salvata) {
    evento.waitUntil(aggiorna);
    return salvata;
  }
  return (await aggiorna) || Response.error();
}

// un solo avviso anche se sono cambiati più file
let avvisoInArrivo = null;
function avvisaNuovaVersione() {
  if (!avvisoInArrivo) {
    avvisoInArrivo = new Promise(ok => setTimeout(ok, 1500)).then(async () => {
      avvisoInArrivo = null;
      const finestre = await self.clients.matchAll({ type: "window" });
      for (const f of finestre) f.postMessage({ tipo: "nuova-versione" });
    });
  }
  return avvisoInArrivo;
}
