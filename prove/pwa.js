// App installabile, uso offline e avviso di aggiornamento
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { avviaServer, ok, SHOTS, RADICE, CARTELLA_SITO } = require('./comune');

const versioneDi = (testo) => testo.match(/const VERSIONE = '([^']+)';/)[1];

(async () => {
  // Copia del sito servita su un'altra porta: qui si cambia la versione senza toccare il repository
  const copia = fs.mkdtempSync(path.join(os.tmpdir(), 'combriccola-pwa-'));
  fs.cpSync(RADICE, copia, { recursive: true, filter: f => !/[\\/](\.git|prove|node_modules)([\\/]|$)/.test(f.slice(RADICE.length)) });
  const porta = 8766;
  const server = await avviaServer(copia, porta);
  const BASE = `http://localhost:${porta}/${CARTELLA_SITO}/`;
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const errori = [];
  await context.route(u => !u.href.startsWith('http://localhost'), r => r.abort());
  const page = await context.newPage();
  page.on('pageerror', e => errori.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|ERR_INTERNET_DISCONNECTED/.test(m.text())) errori.push(m.text()); });
  const swCopia = path.join(copia, 'sw.js');
  const v1 = versioneDi(fs.readFileSync(swCopia, 'utf8'));
  try {
    // 0. Ogni file del sito è nell'elenco del service worker (e ogni voce esiste)
    const sw = fs.readFileSync(path.join(RADICE, 'sw.js'), 'utf8');
    const elenco = [...sw.matchAll(/^\s+'([^']+)',?$/gm)].map(m => m[1]);
    const sito = execSync('git ls-files -co --exclude-standard', { cwd: RADICE }).toString().trim().split('\n')
      .filter(f => !/\.md$|LICENZA|tailwind-sorgente|^sw\.js$|^\.|^prove\//.test(f));
    const mancanti = sito.filter(f => !elenco.includes(f));
    const inesistenti = elenco.filter(f => !fs.existsSync(path.join(RADICE, f)));
    ok(!mancanti.length && !inesistenti.length, `elenco del service worker completo (${elenco.length} voci)` + (mancanti.length ? ' — mancano: ' + mancanti : '') + (inesistenti.length ? ' — inesistenti: ' + inesistenti : ''));

    // 1. Primo accesso: si installa e salva tutto
    await page.goto(BASE);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => navigator.serviceWorker.controller, null, { timeout: 15000 });
    const chiavi = await page.evaluate(async (v) => { const c = await caches.open('combriccola-v' + v); return (await c.keys()).length; }, v1);
    ok(chiavi === elenco.length, `al primo accesso salvati ${chiavi} file sul telefono`);
    ok(!(await page.isVisible('#rg-aggiorna')), 'nessun avviso di aggiornamento alla prima installazione');

    // 2. Installabile
    const cdp = await context.newCDPSession(page);
    const inst = await cdp.send('Page.getInstallabilityErrors');
    ok(inst.installabilityErrors.length === 0, 'il browser la considera installabile' + (inst.installabilityErrors.length ? ': ' + JSON.stringify(inst.installabilityErrors) : ''));
    const man = await cdp.send('Page.getAppManifest');
    const m = JSON.parse(man.data);
    ok(man.errors.length === 0 && m.start_url === './' && m.scope === './', 'manifest valido, start_url e scope sulla cartella del sito');
    await page.reload();
    await page.waitForSelector('#versione-app:not([hidden])');
    ok((await page.textContent('#versione-app')).includes(`Versione ${v1}`), `nel menù compare la versione installata (${v1})`);
    await page.screenshot({ path: SHOTS + 'pwa-menu.png', fullPage: true });
    await page.click('#cerca-aggiornamenti');
    await page.waitForSelector('.rg-toast-successo', { timeout: 10000 });
    ok((await page.textContent('.rg-toast-successo')).includes(`Hai già l'ultima versione (versione ${v1})`), '"Controlla aggiornamenti": risponde che è già l\'ultima versione');

    // 3. Senza connessione
    await context.setOffline(true);
    const pagine = [['', '.pila'], ['giochi/cinquina/', '#setup-screen'], ['giochi/pellicola/', '#setup-screen'], ['giochi/giradischi/', '#setup-screen'],
      ['HINT_FAKE.html', '#setup-screen'], ['giochi/hint-fake/', '#setup-screen'], ['hitstar_il_gioco_della_musica.html', '#setup-screen'], ['giochi/hitstar/', '#setup-screen'],
      ['cinestar_il_gioco_dei_film.html', '#setup-screen'], ['giochi/cinestar/', '#setup-screen'], ['giochi/cinquina/?da=preferiti', '#setup-screen']];
    for (const [url, sel] of pagine) {
      await page.goto(BASE + url);
      await page.waitForSelector(sel, { timeout: 10000 });
      ok(true, `offline: si apre ${url || 'il menù'}`);
    }
    await page.goto(BASE + 'giochi/cinquina/');
    await page.click('text=Inizia la Partita');
    await page.locator('.wheel-tile.card').first().click();
    await page.click('text=Gira e Avvia 90s');
    await page.click('text=Fine Tempo');
    await page.click('text=Registra Punti e Gira la Ruota');
    await page.waitForFunction(() => state.totalTurnsPlayed === 1 && !state.animating);
    ok(true, 'offline: Cinquina si gioca');
    await page.goto(BASE + 'giochi/pellicola/');
    await page.click('#start-game-btn');
    await page.waitForFunction(() => gameState.currentMovie, null, { timeout: 30000 });
    ok(true, 'offline: Pellicola parte con i film inclusi');
    await page.goto(BASE + 'giochi/giradischi/');
    await page.click('#btn-start-game');
    await page.waitForSelector('.rg-toast-errore', { timeout: 20000 });
    ok(true, 'offline: Giradischi avvisa che serve internet');
    await page.goto(BASE + 'non-esiste/');
    await page.waitForSelector('.pila', { timeout: 10000 });
    await page.waitForFunction(() => window.RG && RG.cercaAggiornamenti, null, { timeout: 10000 });
    ok(page.url() === BASE, 'offline: un indirizzo sconosciuto rimanda al menù, funzionante');
    // Il browser di prova, dopo molte pagine offline, a volte torna a dire "online": qui lo si fissa offline
    await page.evaluate(() => Object.defineProperty(navigator, 'onLine', { get: () => false, configurable: true }));
    await page.click('#cerca-aggiornamenti');
    await page.waitForSelector('.rg-toast-errore', { timeout: 15000 });
    ok((await page.textContent('.rg-toast-errore')).includes('Serve la connessione'), '"Controlla aggiornamenti" offline: avvisa che serve la connessione');
    await context.setOffline(false);

    // 4. Nuova versione: avviso, tocco, ricarica e partita ripresa
    await page.goto(BASE + 'giochi/cinquina/');
    await page.waitForSelector('#active-game-container:not(.hidden), #resume-box:not([hidden])');
    if (await page.isVisible('#resume-box')) await page.click('#resume-box [data-azione="riprendi"]');
    const prima = await page.evaluate(() => JSON.stringify(state.teams));
    const v2 = v1 + '-prova';
    fs.writeFileSync(swCopia, fs.readFileSync(swCopia, 'utf8').replace(`const VERSIONE = '${v1}';`, `const VERSIONE = '${v2}';`));
    await page.evaluate(() => navigator.serviceWorker.getRegistration().then(r => r.update()));
    await page.waitForSelector('#rg-aggiorna[data-stato="pronta"]', { timeout: 15000 });
    ok((await page.textContent('#rg-aggiorna')).includes('Nuova versione disponibile — tocca per aggiornare'), 'pubblicata una versione nuova: compare l\'avviso');
    await page.waitForTimeout(500);
    await page.screenshot({ path: SHOTS + 'pwa-avviso.png', clip: { x: 0, y: 0, width: 360, height: 200 } });
    await Promise.all([page.waitForNavigation(), page.click('.rg-aggiorna-tocca')]);
    await page.waitForSelector('#active-game-container:not(.hidden)', { timeout: 10000 });
    ok(await page.evaluate(() => JSON.stringify(state.teams)) === prima, 'toccato l\'avviso: pagina aggiornata e partita ripresa da sola');
    ok(await page.evaluate(() => RG.versioneApp()) === v2, 'ora è attiva la versione nuova');
    ok(await page.evaluate(async () => (await caches.keys()).join()) === 'combriccola-v' + v2, 'la cache vecchia è stata cancellata');
    ok(!(await page.isVisible('#rg-aggiorna')), 'dopo l\'aggiornamento l\'avviso non compare più');
    // Versione nuova trovata con il pulsante del menù: prima "in arrivo", poi "disponibile"
    fs.writeFileSync(swCopia, fs.readFileSync(swCopia, 'utf8').replace(`const VERSIONE = '${v2}';`, `const VERSIONE = '${v2}-bis';`));
    await page.goto(BASE);
    await page.waitForSelector('#versione-app:not([hidden])');
    const stati = [];
    await page.exposeFunction('__stato', s => stati.push(s));
    await page.evaluate(() => new MutationObserver(() => { const b = document.getElementById('rg-aggiorna'); if (b) window.__stato(b.dataset.stato); }).observe(document.body, { childList: true, subtree: true, attributes: true }));
    await page.click('#cerca-aggiornamenti');
    await page.waitForSelector('#rg-aggiorna[data-stato="pronta"]', { timeout: 15000 });
    ok((await page.textContent('.rg-toast')).includes('versione nuova'), '"Controlla aggiornamenti": trova la versione nuova');
    ok(stati.includes('in-arrivo') && stati.includes('pronta'), 'durante lo scaricamento compare "Aggiornamento in arrivo…", poi "Nuova versione disponibile"');
    await page.click('.rg-aggiorna-dopo');
    ok(!(await page.isVisible('#rg-aggiorna')), '"Dopo" chiude l\'avviso senza aggiornare');

    // Due versioni di fila mentre l'avviso è aperto: il tocco porta all'ultima (non resta bloccato)
    await page.goto(BASE);
    await page.waitForSelector('#versione-app:not([hidden])');
    await page.click('#cerca-aggiornamenti');
    await page.waitForSelector('#rg-aggiorna[data-stato="pronta"]', { timeout: 15000 });
    const v3 = `${v2}-ter`;
    fs.writeFileSync(swCopia, fs.readFileSync(swCopia, 'utf8').replace(`const VERSIONE = '${v2}-bis';`, `const VERSIONE = '${v3}';`));
    await page.evaluate(() => navigator.serviceWorker.getRegistration().then(r => r.update()));
    await page.waitForFunction(() => navigator.serviceWorker.getRegistration().then(r => r.waiting && !r.installing), null, { timeout: 15000 });
    await page.waitForTimeout(500);
    await Promise.all([page.waitForNavigation({ timeout: 15000 }), page.click('.rg-aggiorna-tocca')]);
    await page.waitForSelector('#versione-app:not([hidden])');
    ok(await page.evaluate(() => RG.versioneApp()) === v3, 'due versioni uscite di fila con l\'avviso aperto: il tocco porta all\'ultima');

    // Nessun errore in console nei secondi dopo un controllo riuscito
    await page.click('#cerca-aggiornamenti');
    await page.waitForSelector('.rg-toast-successo', { timeout: 15000 });
    await page.waitForTimeout(9000);

    ok(errori.length === 0, 'nessun errore in console' + (errori.length ? ':\n' + errori.join('\n') : ''));
  } catch (e) {
    console.log(e.message, errori); try { console.log('notifiche:', await page.locator('.rg-toast').allTextContents(), 'online:', await page.evaluate(() => navigator.onLine), 'controller:', await page.evaluate(() => !!navigator.serviceWorker.controller)); } catch (x) {} await page.screenshot({ path: SHOTS + 'pwa-errore.png' }); process.exitCode = 1;
  } finally {
    await browser.close(); server.close(); fs.rmSync(copia, { recursive: true, force: true });
  }
})();
