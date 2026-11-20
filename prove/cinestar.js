const { apri, ok, BASE, SHOTS } = require('./comune');
const { finti, conteggio } = require('./finti-cinestar');
const MODO = process.argv[2] || 'offline'; // offline | online
(async () => {
  const { browser, page, esterne, errori } = await apri({ finti: MODO === 'online' ? finti : null });
  const stato = () => page.evaluate(() => ({ p: gameState.players.map(p => ({ n: p.name, s: p.stars, t: p.timeline.length })), cur: gameState.currentPlayerIndex, film: gameState.currentMovie && gameState.currentMovie.itTitle, risolto: gameState.isTurnResolved, indizi: { ...gameState.unlockedClues } }));
  const filmPronto = () => page.waitForFunction(() => gameState.currentMovie && !gameState.isTurnResolved, null, { timeout: 30000 });
  const pronto = async () => { if (await page.isVisible('#handoff-modal')) await page.click('#handoff-ready-btn'); };
  // slot giusto (o sbagliato) per il film attuale
  const slot = (giusto) => page.evaluate((giusto) => {
    const tl = gameState.players[gameState.currentPlayerIndex].timeline, y = gameState.currentMovie.year;
    const buoni = [];
    for (let i = 0; i <= tl.length; i++) if ((i === 0 || y >= tl[i - 1].year) && (i === tl.length || y <= tl[i].year)) buoni.push(i);
    if (giusto) return buoni[0];
    for (let i = 0; i <= tl.length; i++) if (!buoni.includes(i)) return i;
    return null;
  }, giusto);
  const piazza = async (giusto) => {
    const i = await slot(giusto);
    if (i === null) return false;
    await page.locator('#timeline-track button.slot').nth(i).click();
    await page.waitForSelector('#reveal-result-panel:not(.hidden)');
    return true;
  };
  try {
    await page.goto(BASE + 'menu.css');
    await page.evaluate(() => { localStorage.clear(); localStorage.setItem('cinestar_played_movies_v1', JSON.stringify(['psycho__1960'])); localStorage.setItem('rg-comune-squadre', JSON.stringify({ nomi: ['Paolo', 'Giulia', '', '', '', ''] })); });
    await page.goto(BASE + 'cinestar_il_gioco_dei_film.html');
    await page.waitForURL('**/giochi/cinestar/');
    ok(true, 'il vecchio indirizzo rimanda a giochi/cinestar/');
    ok(await page.evaluate(() => JSON.stringify(RG.archivio.spazio('cinestar').leggi('film-giocati'))) === '["psycho__1960"]', 'film già giocati migrati dalla vecchia pagina');
    const nomi = await page.locator('.player-name-input').evaluateAll(els => els.map(e => e.value));
    ok(nomi.join() === 'Paolo,Giulia', 'due giocatori proposti con i nomi di "Chi gioca stasera"');
    await page.selectOption('#target-cards-select', '5');
    await page.screenshot({ path: SHOTS + `cinestar-${MODO}-1-setup.png`, fullPage: true });
    await page.click('#start-game-btn');
    await page.waitForSelector('#game-screen:not(.hidden)', { timeout: 30000 });
    if (MODO === 'online') ok(await page.evaluate(() => gameState.pool.some(m => m._live)), 'online: catalogo live aggiunto al mazzo (iTunes finto)');
    await pronto(); await filmPronto();
    if (MODO === 'online') await page.waitForSelector('#mystery-poster-canvas:not(.hidden), #mystery-poster-css-wrapper:not(.hidden)', { timeout: 20000 });
    else await page.waitForSelector('#poster-fallback-card:not(.hidden)', { timeout: 20000 });
    ok(true, MODO === 'online' ? 'locandina pixelata mostrata' : 'offline: nessuna locandina, compare la "Pellicola misteriosa"');
    await page.screenshot({ path: SHOTS + `cinestar-${MODO}-2-turno.png`, fullPage: true });

    // indizio + ricarica a metà turno
    await page.click('#clue-director-btn');
    await page.fill('#guess-title-input', 'prova titolo');
    const prima = await stato();
    ok(prima.p[0].s === 9 && prima.indizi.director, 'indizio regista comprato (−1 ★)');
    await page.goto(BASE + 'giochi/cinestar/');
    await page.waitForSelector('#resume-box:not([hidden])');
    ok(await page.isVisible('#setup-screen'), 'aperto dal menù: schermata iniziale con "Partita in corso"');
    await page.screenshot({ path: SHOTS + `cinestar-${MODO}-3-ripresa.png`, fullPage: true });
    await page.click('#resume-box [data-azione="riprendi"]');
    await filmPronto();
    await page.reload();
    await filmPronto();
    ok(await page.isVisible('#game-screen') && await page.isHidden('#setup-screen'), 'ricaricando si torna subito in partita (senza toccare Riprendi)');
    const dopo = await stato();
    ok(dopo.film === prima.film && dopo.p[0].s === 9 && dopo.indizi.director && await page.isVisible('#revealed-director-card'), 'ripresa dopo il ricaricamento: stesso film, stesso indizio, stesse stelle');
    ok(await page.inputValue('#guess-title-input') === 'prova titolo', 'ripresa: anche il titolo scritto resta');

    // piazzamento sbagliato → annulla dal risultato
    await page.fill('#guess-title-input', '');
    const sbagliato = await piazza(false);
    if (sbagliato) {
      const s1 = await stato();
      ok(s1.p[0].s === 7 && s1.p[0].t === 1, 'posizione sbagliata: −2 ★, carta scartata');
      await page.click('.result-actions .undo-turn-btn');
      await page.click('#rg-conferma [data-risposta="si"]');
      await filmPronto();
      const s2 = await stato();
      ok(s2.film === prima.film && s2.p[0].s === 9 && s2.indizi.director, 'annulla dal risultato: stesso film da ripiazzare, stelle tornate a 9');
    }
    await piazza(true);
    ok((await stato()).p[0].t === 2 && (await stato()).p[0].s === 11, 'posizione giusta: +2 ★ e film nella pellicola');
    await page.screenshot({ path: SHOTS + `cinestar-${MODO}-4-risultato.png`, fullPage: true });

    // turno dopo → annulla all'inizio del turno successivo
    await page.click('#next-turn-btn');
    await pronto(); await filmPronto();
    const giulia = await stato();
    ok(giulia.cur === 1 && await page.isVisible('.undo-inline'), 'turno di Giulia: si può ancora annullare il turno di Paolo');
    await page.click('.undo-inline');
    await page.click('#rg-conferma [data-risposta="si"]');
    await filmPronto();
    const back = await stato();
    ok(back.cur === 0 && back.film === prima.film && back.p[0].t === 1, 'annulla dal turno dopo: si torna al film di Paolo');
    await piazza(true);
    await page.click('#next-turn-btn'); await pronto(); await filmPronto();
    ok((await stato()).film === giulia.film, 'il film già uscito per Giulia torna in cima al mazzo');

    // partita fino alla vittoria: Paolo indovina sempre, Giulia sbaglia
    for (let giro = 0; giro < 20; giro++) {
      const s = await stato();
      if (!(await piazza(s.cur === 0))) await piazza(true);
      if ((await page.textContent('#next-turn-btn')) === 'Vai alla premiazione') { await page.click('#next-turn-btn'); break; }
      await page.click('#next-turn-btn'); await pronto(); await filmPronto();
    }
    await page.waitForSelector('#victory-modal:not(.hidden)');
    ok((await page.textContent('#winner-title')) === 'Vince Paolo', 'vittoria di Paolo con 5 film');
    ok(await page.evaluate(() => localStorage.getItem('rg-cinestar-partita')) === null, 'a fine partita il salvataggio viene cancellato');
    ok(await page.isVisible('#victory-modal .undo-turn-btn'), 'nella premiazione si può annullare l\'ultimo turno');
    await page.screenshot({ path: SHOTS + `cinestar-${MODO}-5-vittoria.png` });
    await page.click('#victory-modal .undo-turn-btn');
    await page.click('#rg-conferma [data-risposta="si"]');
    await filmPronto();
    ok((await stato()).p[0].t === 4, 'annulla dalla premiazione: Paolo torna a 4 film');
    ok(await page.evaluate(() => !!localStorage.getItem('rg-cinestar-partita')), 'dopo l\'annullamento la partita è di nuovo salvata');

    // ← Menu: la partita resta salvata
    await page.click('#quit-game-btn');
    ok(await page.isVisible('#resume-box'), '"← Menu" torna alla preparazione con la partita salvata');
    await page.click('#resume-box [data-azione="scarta"]');
    await page.click('#rg-conferma [data-risposta="si"]');
    ok(await page.isHidden('#resume-box'), 'scarta partita (con conferma in app)');
    ok(await page.evaluate(() => document.documentElement.scrollWidth) <= 360, 'nessuno scorrimento orizzontale');
    await page.click('.rg-indietro');
    await page.waitForURL(BASE);
    ok(true, 'il tasto ← torna a Combriccola');
    if (MODO === 'online') console.log('  richieste finte servite:', JSON.stringify(conteggio));
    else ok(true, `offline: ${esterne.length} richieste esterne bloccate (catalogo e locandine), il gioco prosegue con i film inclusi`);
    ok(errori.length === 0, 'nessun errore in console' + (errori.length ? ':\n' + errori.join('\n') : ''));
  } catch (e) {
    console.log(e.message); console.log('errori:', errori); await page.screenshot({ path: SHOTS + `cinestar-${MODO}-errore.png`, fullPage: true }); process.exitCode = 1;
  } finally { await browser.close(); }
})();
