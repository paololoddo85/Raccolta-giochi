const { apri, ok, BASE, SHOTS } = require('./comune');
const fc = require('./finti-pellicola'), fh = require('./finti-giradischi'), fr = require('./finti-ritornello');
const risultati = [];
async function controlla(page, nome) {
  for (const w of [320, 360]) {
    await page.setViewportSize({ width: w, height: 760 });
    await page.waitForTimeout(150);
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    risultati.push(`${sw <= w ? '✓' : '✗'} ${nome} a ${w}px (larghezza pagina ${sw})`);
  }
  await page.setViewportSize({ width: 360, height: 760 });
}
(async () => {
  let { browser, page } = await apri({ finti: async c => { await fc.finti(c); await fh.finti(c); await fr.finti(c); } });
  await page.goto(BASE); await controlla(page, 'menù');
  // Cinquina
  await page.goto(BASE + 'giochi/cinquina/'); await controlla(page, 'Cinquina preparazione');
  await page.click('text=Inizia la Partita'); await controlla(page, 'Cinquina ruota');
  await page.locator('.wheel-tile.card').first().click(); await controlla(page, 'Cinquina carta coperta');
  await page.click('text=Gira e Avvia 90s'); await controlla(page, 'Cinquina timer');
  await page.click('text=Fine Tempo'); await controlla(page, 'Cinquina replica');
  await page.click('button[title="Importa nuove carte"]'); await controlla(page, 'Cinquina import');
  // Pellicola
  await page.goto(BASE + 'giochi/pellicola/'); await controlla(page, 'Pellicola preparazione');
  await page.selectOption('#target-cards-select', '12');
  await page.click('#start-game-btn'); await page.waitForFunction(() => gameState.currentMovie, null, { timeout: 30000 });
  await controlla(page, 'Pellicola turno');
  await page.locator('#timeline-track button.slot').first().click(); await controlla(page, 'Pellicola risultato');
  // pellicola lunga: la pagina non deve allargarsi, scorre solo la pellicola
  for (let i = 0; i < 6; i++) {
    await page.click('#next-turn-btn');
    try { await page.waitForFunction(() => gameState.currentMovie && !gameState.isTurnResolved, null, { timeout: 30000 }); }
    catch (e) { console.log('BLOCCO', await page.evaluate(() => JSON.stringify({ film: gameState.currentMovie && gameState.currentMovie.itTitle, risolto: gameState.isTurnResolved, tl: gameState.players[0].timeline.length, target: gameState.targetCards, deck: gameState.deck.length, vittoria: !document.getElementById('victory-modal').classList.contains('hidden'), pulsante: document.getElementById('next-turn-btn').textContent, loader: !document.getElementById('poster-loader').classList.contains('hidden') }))); throw e; }
    const s = await page.evaluate(() => { const tl = gameState.players[0].timeline, y = gameState.currentMovie.year; for (let i = 0; i <= tl.length; i++) if ((i === 0 || y >= tl[i - 1].year) && (i === tl.length || y <= tl[i].year)) return i; });
    await page.locator('#timeline-track button.slot').nth(s).click();
  }
  await page.click('#next-turn-btn');
  await page.waitForFunction(() => gameState.currentMovie && !gameState.isTurnResolved, null, { timeout: 30000 });
  await controlla(page, `Pellicola con ${await page.evaluate(() => gameState.players[0].timeline.length)} film in pellicola`);
  // Giradischi
  await page.goto(BASE + 'giochi/giradischi/'); await controlla(page, 'Giradischi preparazione');
  await page.click('#btn-start-game'); await page.waitForFunction(() => gameState.currentCard, null, { timeout: 90000 });
  await controlla(page, 'Giradischi turno');
  await page.locator('#timeline-container > button').first().click(); await page.click('#btn-confirm-placement'); await page.waitForTimeout(900);
  await controlla(page, 'Giradischi carta girata');
  await page.screenshot({ path: SHOTS + 'giradischi-girata-320.png', fullPage: true });
  await page.click('header button[onclick="openRulesModal()"]'); await controlla(page, 'Giradischi regolamento');
  // Ritornello, con 4 squadre dai nomi lunghi
  await page.goto(BASE + 'giochi/ritornello/'); await controlla(page, 'Ritornello preparazione');
  await page.click('.count-btn[data-count="4"]');
  await page.locator('.nome-squadra').evaluateAll(els => els.forEach((e, i) => { e.value = 'Squadra lunghissima ' + i; }));
  await page.click('#inizia'); await page.waitForSelector('#fase-consegna:not(.hidden)', { timeout: 30000 });
  await controlla(page, 'Ritornello consegna (4 squadre)');
  await page.evaluate(() => { RITORNELLO.stato.brano.titolo = 'Supercalifragilistichespiralidoso e un titolo davvero molto lungo'; });
  await page.click('#mostra-brano'); await controlla(page, 'Ritornello brano segreto');
  await page.click('#via'); await page.click('[data-aiuto="lettera"]'); await controlla(page, 'Ritornello canta');
  await page.click('#indovinato'); await controlla(page, 'Ritornello svela');
  await page.click('[data-esito="niente"]'); await controlla(page, 'Ritornello furto');
  await page.screenshot({ path: SHOTS + 'ritornello-furto-320.png', fullPage: true });
  await page.click('[data-ladro="2"]'); await controlla(page, 'Ritornello esito');
  console.log(risultati.join('\n'));
  if (risultati.some(r => r.startsWith('✗'))) process.exitCode = 1;
  await browser.close();
})();
