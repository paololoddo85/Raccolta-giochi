/*
 * Base comune delle prove automatiche di Combriccola (Playwright + Chromium).
 *
 * - avviaServer(): piccolo server statico che serve il repository sotto /Raccolta-giochi/,
 *   come GitHub Pages ("Deploy from a branch", cartella root).
 * - apri(): browser con schermo da telefono (360×780). Tutte le richieste verso internet
 *   vengono bloccate (come offline), tranne quelle a cui rispondono le "risposte finte".
 * - ok(): stampa ✓ o lancia un errore.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const PORTA = Number(process.env.PROVE_PORTA || 8765);
const CARTELLA_SITO = 'Raccolta-giochi';
const BASE = `http://localhost:${PORTA}/${CARTELLA_SITO}/`;
const RADICE = path.resolve(__dirname, '..');
const SHOTS = path.join(__dirname, 'screenshot') + path.sep;
fs.mkdirSync(SHOTS, { recursive: true });

const TIPI = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8'
};

function avviaServer(radice = RADICE, porta = PORTA) {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    const prefisso = `/${CARTELLA_SITO}/`;
    if (!url.startsWith(prefisso)) { res.writeHead(404); return res.end('fuori dal sito'); }
    let file = path.join(radice, url.slice(prefisso.length));
    if (!file.startsWith(radice)) { res.writeHead(403); return res.end(); }
    try {
      if (fs.statSync(file).isDirectory()) {
        if (!url.endsWith('/')) { res.writeHead(301, { Location: url + '/' }); return res.end(); }
        file = path.join(file, 'index.html');
      }
      const dati = fs.readFileSync(file);
      res.writeHead(200, { 'Content-Type': TIPI[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(dati);
    } catch (e) {
      res.writeHead(404); res.end('non trovato');
    }
  });
  return new Promise(r => server.listen(porta, () => r(server)));
}

async function apri({ offline = true, finti = null, base = BASE } = {}) {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 360, height: 780 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, locale: 'it-IT' });
  const esterne = [], errori = [];
  const origine = new URL(base).origin + '/';
  if (offline) await context.route(u => !u.href.startsWith(origine), r => { esterne.push(r.request().url()); r.abort(); });
  // le risposte finte si registrano dopo il blocco: Playwright prova per prime le ultime registrate
  if (finti) await finti(context);
  context.on('page', p => attacca(p));
  function attacca(p) {
    p.on('pageerror', e => errori.push('pageerror: ' + e.message));
    p.on('console', m => { if (m.type() === 'error' && !/net::ERR_FAILED|ERR_INTERNET_DISCONNECTED/.test(m.text())) errori.push('console: ' + m.text()); });
    p.on('requestfailed', r => { if (r.url().startsWith(origine)) errori.push('404/fail: ' + r.url()); });
    p.on('response', r => { if (r.status() >= 400) errori.push(r.status() + ' ' + r.url()); });
  }
  const page = await context.newPage();
  return { browser, context, page, esterne, errori };
}

const ok = (condizione, messaggio) => {
  if (!condizione) throw new Error('FALLITO: ' + messaggio);
  console.log('✓ ' + messaggio);
};

module.exports = { apri, avviaServer, ok, BASE, SHOTS, RADICE, PORTA, CARTELLA_SITO };
