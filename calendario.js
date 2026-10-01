/*
 * Radar Settori — calendari di borsa (NYSE e Borsa Italiana), quello delle crypto (tutti i giorni) e controllo dei dati in ritardo.
 * Funziona sia nel browser (window.Calendario) sia in Node (module.exports).
 */
(function (root) {
  "use strict";

  const iso = d => d.toISOString().slice(0, 10);
  const utc = (y, m, d) => new Date(Date.UTC(y, m - 1, d));
  const add = (d, n) => { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x; };

  // Pasqua (calendario gregoriano, algoritmo di Meeus/Jones/Butcher)
  function pasqua(y) {
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
    const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    const mese = Math.floor((h + l - 7 * m + 114) / 31), giorno = ((h + l - 7 * m + 114) % 31) + 1;
    return utc(y, mese, giorno);
  }

  // n-esimo giorno della settimana del mese (wd: 0 = domenica); n = -1 per l'ultimo
  function nesimo(y, m, wd, n) {
    if (n > 0) {
      const first = utc(y, m, 1);
      const delta = (wd - first.getUTCDay() + 7) % 7;
      return add(first, delta + 7 * (n - 1));
    }
    const last = utc(y, m + 1, 0);
    const delta = (last.getUTCDay() - wd + 7) % 7;
    return add(last, -delta);
  }

  // festività che cadono di sabato si anticipano al venerdì, di domenica si posticipano al lunedì
  function osservata(d) {
    const wd = d.getUTCDay();
    if (wd === 6) return add(d, -1);
    if (wd === 0) return add(d, 1);
    return d;
  }

  const cache = {};

  function festeNYSE(y) {
    const k = "N" + y;
    if (cache[k]) return cache[k];
    const s = new Set();
    const capodanno = utc(y, 1, 1);
    if (capodanno.getUTCDay() === 0) s.add(iso(add(capodanno, 1)));
    else if (capodanno.getUTCDay() !== 6) s.add(iso(capodanno));   // di sabato non si recupera
    s.add(iso(nesimo(y, 1, 1, 3)));                // Martin Luther King
    s.add(iso(nesimo(y, 2, 1, 3)));                // Presidents' Day
    s.add(iso(add(pasqua(y), -2)));                // Venerdì santo
    s.add(iso(nesimo(y, 5, 1, -1)));               // Memorial Day
    if (y >= 2022) s.add(iso(osservata(utc(y, 6, 19))));   // Juneteenth
    s.add(iso(osservata(utc(y, 7, 4))));           // Indipendenza
    s.add(iso(nesimo(y, 9, 1, 1)));                // Labor Day
    s.add(iso(nesimo(y, 11, 4, 4)));               // Thanksgiving
    s.add(iso(osservata(utc(y, 12, 25))));         // Natale
    // chiusure straordinarie
    ["2012-10-29", "2012-10-30", "2018-12-05", "2025-01-09"].forEach(d => { if (d.startsWith(String(y))) s.add(d); });
    return (cache[k] = s);
  }

  function festeMilano(y) {
    const k = "M" + y;
    if (cache[k]) return cache[k];
    const p = pasqua(y);
    const s = new Set([
      `${y}-01-01`, iso(add(p, -2)), iso(add(p, 1)), `${y}-05-01`, `${y}-08-15`,
      `${y}-12-24`, `${y}-12-25`, `${y}-12-26`, `${y}-12-31`,
    ]);
    return (cache[k] = s);
  }

  function eSeduta(d, mercato) {
    if (mercato === "crypto") return true;                 // le crypto si scambiano tutti i giorni
    const x = new Date(d + "T00:00:00Z");
    const wd = x.getUTCDay();
    if (wd === 0 || wd === 6) return false;
    const y = x.getUTCFullYear();
    return !(mercato === "milano" ? festeMilano(y) : festeNYSE(y)).has(d);
  }

  function successiva(d, mercato) {
    let x = new Date(d + "T00:00:00Z");
    for (let k = 0; k < 15; k++) { x = add(x, 1); if (eSeduta(iso(x), mercato)) return iso(x); }
    return null;
  }

  function precedente(d, mercato) {
    let x = new Date(d + "T00:00:00Z");
    for (let k = 0; k < 15; k++) { x = add(x, -1); if (eSeduta(iso(x), mercato)) return iso(x); }
    return null;
  }

  // data e ora a New York per un istante
  function oraNY(now) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(now);
    const v = t => parts.find(p => p.type === t).value;
    return { data: `${v("year")}-${v("month")}-${v("day")}`, minuti: +v("hour") * 60 + +v("minute") };
  }

  /**
   * Ultima seduta i cui dati dovrebbero già essere pubblicati.
   * L'aggiornamento parte dopo la chiusura di Wall Street (circa le 18:45 di New York, lun-ven)
   * e scarica anche le chiusure europee dello stesso giorno.
   */
  function sedutaAttesa(now, mercato, sogliaMinuti) {
    // crypto: la giornata finisce a mezzanotte UTC e l'aggiornamento gira poco dopo (con un margine di 5 ore)
    if (mercato === "crypto") return iso(add(new Date(iso(new Date((now || new Date()).getTime() - 5 * 3600e3)) + "T00:00:00Z"), -1));
    const ny = oraNY(now || new Date());
    const soglia = sogliaMinuti == null ? 18 * 60 + 45 : sogliaMinuti;
    let giorno = ny.data;
    const wd = new Date(giorno + "T00:00:00Z").getUTCDay();
    const giornoLavorativo = wd >= 1 && wd <= 5;
    if (!giornoLavorativo || ny.minuti < soglia) giorno = iso(add(new Date(giorno + "T00:00:00Z"), -1));
    return eSeduta(giorno, mercato) ? giorno : precedente(giorno, mercato);
  }

  // quante sedute mancano dai dati pubblicati a quelli attesi
  function ritardo(dataDati, now, mercato) {
    const attesa = sedutaAttesa(now, mercato);
    if (!dataDati || !attesa || dataDati >= attesa) return { attesa, sedute: 0 };
    let n = 0, d = dataDati;
    while (d && d < attesa && n < 60) { d = successiva(d, mercato); n++; }
    return { attesa, sedute: n };
  }

  const api = { pasqua, festeNYSE, festeMilano, eSeduta, successiva, precedente, sedutaAttesa, ritardo };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Calendario = api;
})(typeof window !== "undefined" ? window : globalThis);
