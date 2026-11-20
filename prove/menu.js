const { apri, ok, BASE, SHOTS } = require('./comune');
(async () => {
  const { browser, page, esterne, errori } = await apri();
    try {
    await page.goto(BASE + 'menu.css');
    await page.evaluate(() => { localStorage.clear(); localStorage.setItem('hintfake-partita-in-corso', JSON.stringify({ v: 1, savedAt: Date.now(), teams: [{name:'A',score:1,turnsPlayed:1},{name:'B',score:0,turnsPlayed:0}], wheelSlots: [null,null,null,null,null], activeTeamIdx: 1, totalTurnsPlayed: 1 })); });
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    ok(await page.isVisible('[data-gioco="hintfake"] .in-corso'), 'menù: "Partita in corso" su Cinquina (dopo migrazione)');
    ok(!(await page.isVisible('[data-gioco="cinestar"] .in-corso')), 'menù: nessuna partita su Pellicola');
    await page.screenshot({ path: SHOTS + 'menu-1.png', fullPage: true });
    await page.click('#apri-nomi');
    const campi = page.locator('#campi-nomi input');
    await campi.nth(0).fill('Paolo'); await campi.nth(1).fill('Giulia'); await campi.nth(2).fill('Marco');
    await page.screenshot({ path: SHOTS + 'menu-2-nomi.png', fullPage: true });
    await page.click('text=Salva i nomi');
    ok((await page.locator('.nome').allTextContents()).join(',') === 'Paolo,Giulia,Marco', 'nomi salvati e mostrati');
    await page.click('[data-gioco="hintfake"]');
    await page.waitForURL('**/giochi/cinquina/');
    ok(await page.inputValue('#setup-team-1') === 'Paolo' && await page.inputValue('#setup-team-2') === 'Giulia', 'Cinquina usa i primi due nomi come squadre');
    await page.goBack();
    await page.click('#pulsante-suoni');
    ok(await page.textContent('.interruttore-testo') === 'Suoni spenti', 'interruttore suoni');
    await page.click('#pulsante-suoni');
    for (const w of [320, 412]) { await page.setViewportSize({ width: w, height: 800 }); const sw = await page.evaluate(() => document.documentElement.scrollWidth); ok(sw <= w, `nessuno scorrimento orizzontale a ${w}px`); }
    await page.setViewportSize({ width: 360, height: 780 });
    await page.screenshot({ path: SHOTS + 'menu-3.png' });
    ok(esterne.length === 0, 'nessuna richiesta verso internet');
    ok(errori.length === 0, 'nessun errore' + (errori.length ? ':\n' + errori.join('\n') : ''));
  } catch (e) { console.log(e.message, errori); process.exitCode = 1; } finally { await browser.close(); }
})();
