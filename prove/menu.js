const { apri, ok, BASE, SHOTS } = require('./comune');
const { finti } = require('./finti-pellicola'); // Pellicola si gioca solo online: risposte finte
(async () => {
  const { browser, page, esterne, errori } = await apri({ finti });
    try {
    await page.goto(BASE + 'menu.css');
    await page.evaluate(() => { localStorage.clear(); localStorage.setItem('hintfake-partita-in-corso', JSON.stringify({ v: 1, savedAt: Date.now(), teams: [{name:'A',score:1,turnsPlayed:1},{name:'B',score:0,turnsPlayed:0}], wheelSlots: [null,null,null,null,null], activeTeamIdx: 1, totalTurnsPlayed: 1 })); });
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    ok(await page.isVisible('.scatola[data-gioco="hintfake"] .in-corso'), 'menù: "Partita in corso" su Cinquina (dopo migrazione)');
    ok(!(await page.isVisible('.scatola[data-gioco="cinestar"] .in-corso')), 'menù: nessuna partita su Pellicola');
    ok(await page.isVisible('.azzera[data-gioco="hintfake"]') && !(await page.isVisible('.azzera[data-gioco="cinestar"]')), '"Azzera la partita in corso" solo sotto i giochi con una partita salvata');
    ok((await page.textContent('.scatola-giradischi')).includes('Solo online') && (await page.textContent('.scatola-cine')).includes('88 film inclusi'), 'note online: Giradischi solo online, Pellicola anche offline con 88 film');
    await page.click('.azzera[data-gioco="hintfake"]');
    await page.click('#rg-conferma [data-risposta="no"]');
    ok(await page.evaluate(() => !!localStorage.getItem('rg-hintfake-partita')), 'azzera: "Annulla" lascia la partita com\'è');
    await page.click('.azzera[data-gioco="hintfake"]');
    await page.click('#rg-conferma [data-risposta="si"]');
    ok(await page.evaluate(() => localStorage.getItem('rg-hintfake-partita') === null) && await page.isHidden('.scatola[data-gioco="hintfake"] .in-corso') && await page.isHidden('.azzera[data-gioco="hintfake"]'), 'azzera: partita cancellata, sparisce "Partita in corso"');
    await page.screenshot({ path: SHOTS + 'menu-azzera.png', fullPage: true });
    await page.screenshot({ path: SHOTS + 'menu-1.png', fullPage: true });
    await page.click('#apri-nomi');
    const campi = page.locator('#campi-nomi input');
    await campi.nth(0).fill('Paolo'); await campi.nth(1).fill('Giulia'); await campi.nth(2).fill('Marco');
    await page.screenshot({ path: SHOTS + 'menu-2-nomi.png', fullPage: true });
    await page.click('text=Salva i nomi');
    ok((await page.locator('.nome').allTextContents()).join(',') === 'Paolo,Giulia,Marco', 'nomi salvati e mostrati');
    await page.click('.scatola[data-gioco="hintfake"]');
    await page.waitForURL('**/giochi/cinquina/');
    ok(await page.inputValue('#setup-team-1') === 'Paolo' && await page.inputValue('#setup-team-2') === 'Giulia', 'Cinquina usa i primi due nomi come squadre');
    await page.goBack();
    await page.click('#pulsante-suoni');
    ok(await page.textContent('.interruttore-testo') === 'Suoni spenti', 'interruttore suoni');
    await page.click('#pulsante-suoni');
    // Azzera mentre il gioco è ancora in memoria (tasto indietro): la partita non deve tornare
    const richiestePrima = esterne.length; // Pellicola contatta per scelta il catalogo online: non conta
    await page.goto(BASE + 'giochi/pellicola/');
    await page.click('#start-game-btn');
    await page.waitForFunction(() => gameState.currentMovie, null, { timeout: 30000 });
    await page.goBack();
    await page.waitForSelector('.azzera[data-gioco="cinestar"]:not([hidden])', { timeout: 10000 });
    await page.click('.azzera[data-gioco="cinestar"]');
    await page.click('#rg-conferma [data-risposta="si"]');
    await page.goForward();
    await page.waitForSelector('#setup-screen:not(.hidden)', { timeout: 15000 });
    await page.waitForTimeout(800);
    ok(await page.evaluate(() => localStorage.getItem('rg-cinestar-partita')) === null && await page.isHidden('#resume-box'), 'dopo "Azzera", tornando al gioco con "avanti" la partita resta cancellata');
    // Il browser di prova non ridà le pagine dalla memoria: si simula quel ritorno (pageshow con persisted)
    await page.click('#start-game-btn');
    await page.waitForFunction(() => gameState.currentMovie && localStorage.getItem('rg-cinestar-partita'), null, { timeout: 30000 });
    await page.evaluate(() => { window.__segno = 'vecchia'; localStorage.removeItem('rg-cinestar-partita'); });
    await Promise.all([page.waitForNavigation({ timeout: 10000 }), page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })))]);
    await page.waitForSelector('#setup-screen:not(.hidden)');
    ok(await page.evaluate(() => window.__segno === undefined && localStorage.getItem('rg-cinestar-partita') === null), 'pagina ridata dalla memoria dopo "Azzera": si ricarica pulita, la partita non torna');
    esterne.length = richiestePrima;
    // Stesso caso in Cinquina con una partita solo ripresa (nessun turno nuovo, quindi nessun salvataggio)
    await page.goto(BASE + 'menu.css');
    await page.evaluate(() => localStorage.setItem('rg-hintfake-partita', JSON.stringify({ v: 1, savedAt: Date.now(), mode: 'adulti', includeHot: false, teams: [{ name: 'A', score: 3, turnsPlayed: 1 }, { name: 'B', score: 1, turnsPlayed: 1 }], activeTeamIdx: 0, totalTurnsPlayed: 2, wheelSlots: [null, null, null, null, null], history: [], lastTurnUndo: null })));
    await page.goto(BASE + 'giochi/cinquina/');
    await page.click('#resume-box [data-azione="riprendi"]');
    await page.evaluate(() => { window.__segno = 'vecchia'; localStorage.removeItem('rg-hintfake-partita'); });
    await Promise.all([page.waitForNavigation({ timeout: 10000 }), page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })))]);
    await page.waitForSelector('#setup-screen:not(.hidden)');
    ok(await page.evaluate(() => window.__segno === undefined && localStorage.getItem('rg-hintfake-partita') === null), 'Cinquina con partita solo ripresa: dopo "Azzera" si ricarica pulita');
    await page.goto(BASE);
    for (const w of [320, 412]) { await page.setViewportSize({ width: w, height: 800 }); const sw = await page.evaluate(() => document.documentElement.scrollWidth); ok(sw <= w, `nessuno scorrimento orizzontale a ${w}px`); }
    await page.setViewportSize({ width: 360, height: 780 });
    await page.screenshot({ path: SHOTS + 'menu-3.png' });
    ok(esterne.length === 0, 'nessuna richiesta verso internet');
    ok(errori.length === 0, 'nessun errore' + (errori.length ? ':\n' + errori.join('\n') : ''));
  } catch (e) { console.log(e.message, errori); process.exitCode = 1; } finally { await browser.close(); }
})();
