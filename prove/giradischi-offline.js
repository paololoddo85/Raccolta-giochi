const { apri, ok, BASE, SHOTS } = require('./comune');
(async () => {
  const { browser, page, errori, esterne } = await apri();
  try {
    await page.goto(BASE + 'giochi/giradischi/');
    await page.click('#btn-start-game');
    await page.waitForSelector('.rg-toast-errore', { timeout: 20000 });
    ok((await page.textContent('.rg-toast-errore')).includes('internet'), 'offline: avviso "Giradischi ha bisogno di internet"');
    ok(await page.isVisible('#setup-screen') && !(await page.isDisabled('#btn-start-game')), 'offline: si resta nella preparazione, il pulsante torna attivo');
    await page.screenshot({ path: SHOTS + 'giradischi-offline.png' });
    await page.click('text=Regolamento');
    ok(await page.isVisible('#rules-modal'), 'il regolamento si apre anche offline');
    ok(errori.length === 0, 'nessun errore' + (errori.length ? ':\n' + errori.join('\n') : ''));
  } catch (e) { console.log(e.message, errori); process.exitCode = 1; } finally { await browser.close(); }
})();
