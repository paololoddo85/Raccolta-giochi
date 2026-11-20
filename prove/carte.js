// Controlla il mazzo di Cinquina: formato, abilità, 5 oggetti, proibita non ripetuta, temi senza doppioni
const path = require('path');
const { ok, RADICE } = require('./comune');
global.window = {};
require(path.join(RADICE, 'giochi/cinquina/dati/carte.js'));
const d = window.CINQUINA_CARTE;
const ABILITA = ['Parlare', 'Mimare', 'Canticchiare', 'Disegnare'];
const carte = [
  ...d.base.map(c => ({ ...c })),
  ...Object.entries(d.extra).flatMap(([pubblico, righe]) => righe.map(([abilita, tema, proibita, ...oggetti], i) =>
    ({ id: `${pubblico[0]}${i + 1}`, abilita, tema, proibita, oggetti })))
];
const n = s => String(s).toLowerCase().trim();
const problemi = [];
const temi = new Map();
const ids = new Set();
carte.forEach(c => {
  if (ids.has(c.id)) problemi.push(`id doppio: ${c.id}`);
  ids.add(c.id);
  if (!ABILITA.includes(c.abilita)) problemi.push(`${c.id} "${c.tema}": abilità sconosciuta "${c.abilita}"`);
  if (!c.tema || !c.proibita) problemi.push(`${c.id}: manca tema o parola proibita`);
  if (!Array.isArray(c.oggetti) || c.oggetti.length !== 5) problemi.push(`${c.id} "${c.tema}": servono esattamente 5 oggetti`);
  else {
    if (c.oggetti.map(n).includes(n(c.proibita))) problemi.push(`${c.id} "${c.tema}": la parola proibita è anche tra gli oggetti`);
    if (new Set(c.oggetti.map(n)).size !== 5) problemi.push(`${c.id} "${c.tema}": oggetto ripetuto`);
  }
  const k = n(c.tema);
  if (temi.has(k)) problemi.push(`tema ripetuto "${c.tema}": ${temi.get(k)} e ${c.id}`);
  else temi.set(k, c.id);
});
d.soloAdultiBase.forEach(id => { if (!d.base.some(c => c.id === id)) problemi.push(`soloAdultiBase: la carta ${id} non esiste`); });
ok(problemi.length === 0, `mazzo di Cinquina in ordine: ${carte.length} carte` + (problemi.length ? '\n  ' + problemi.join('\n  ') : ''));
