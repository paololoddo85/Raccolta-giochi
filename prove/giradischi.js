const { apri, ok, BASE, SHOTS } = require('./comune');
const { finti, stato: rete } = require('./finti-giradischi');
(async () => {
  const { browser, page, errori } = await apri({ finti });
  const gs = () => page.evaluate(() => ({ cur: gameState.currentPlayerIndex, card: gameState.currentCard && gameState.currentCard.title, rev: gameState.revealed,
    p: gameState.players.map(p => ({ n: p.name, t: p.timeline.length, g: p.tokens })), sel: gameState.selectedSlotIndex }));
  const cartaPronta = () => page.waitForFunction(() => gameState.currentCard && !gameState.revealed && document.getElementById('mystery-audio-player').getAttribute('src'), null, { timeout: 60000 });
  const slot = (giusto, timelineDi) => page.evaluate(([giusto, chi]) => {
    const tl = gameState.players[chi ?? gameState.currentPlayerIndex].timeline, y = gameState.currentCard.year, buoni = [];
    for (let i = 0; i <= tl.length; i++) if ((i === 0 || y >= tl[i - 1].year) && (i === tl.length || y <= tl[i].year)) buoni.push(i);
    if (giusto) return buoni[0];
    for (let i = 0; i <= tl.length; i++) if (!buoni.includes(i)) return i;
    return null;
  }, [giusto, timelineDi]);
  const scegli = async (i) => { await page.locator('#timeline-container > button').nth(i).click(); };
  const conferma = async () => { await page.click('#btn-confirm-placement'); await page.waitForFunction(() => gameState.revealed); };
  const prossimo = async () => { await page.click('text=PROSSIMO TURNO'); };
  const sceltaConferma = async (giusto) => { let i = await slot(giusto); if (i === null) i = await slot(true); await scegli(i); await conferma(); };
  try {
    await page.goto(BASE + 'menu.css');
    await page.evaluate(() => { localStorage.clear(); localStorage.setItem('hitstar_played_songs_v1', JSON.stringify(['canzone 1__queen'])); localStorage.setItem('rg-comune-squadre', JSON.stringify({ nomi: ['Paolo', 'Giulia', 'Marco', '', '', ''] })); });
    await page.goto(BASE + 'giochi/hitstar/');
    await page.waitForURL('**/giochi/giradischi/');
    ok(true, 'la vecchia cartella giochi/hitstar/ rimanda a Giradischi');
    await page.goto(BASE + 'hitstar_il_gioco_della_musica.html');
    await page.waitForURL('**/giochi/giradischi/');
    ok(true, 'il vecchio indirizzo rimanda a giochi/giradischi/');
    ok(await page.evaluate(() => JSON.stringify(RG.archivio.spazio('hitstar').leggi('brani-giocati'))) === '["canzone 1__queen"]', 'brani già giocati migrati dalla vecchia pagina');
    const nomi = await page.locator('.player-name-input').evaluateAll(e => e.map(x => x.value));
    ok(nomi.join() === 'Paolo,Giulia,Marco', 'tre giocatori proposti con i nomi di "Chi gioca stasera"');
    ok(await page.locator('i[data-icona] svg').count() > 10, 'icone incluse disegnate');
    await page.selectOption('#target-cards', '6');
    await page.selectOption('#game-mode', 'pro');
    await page.click('#btn-start-game');
    await page.waitForSelector('#game-screen:not(.hidden)', { timeout: 90000 });
    await cartaPronta();
    ok(true, 'partita iniziata: carte iniziali e prima carta verificate (iTunes + MusicBrainz finti)');
    const tutte = await page.evaluate(() => [...gameState.players.flatMap(p => p.timeline), gameState.currentCard, ...gameState.readyCards].map(c => c.title));
    ok(!tutte.includes('Canzone Ristampata'), 'la ristampa con una versione precedente non viene proposta');

    // nessun artista domina il mazzo: al massimo 3 brani per artista tra timeline, carta, pronte e mazzo
    const massimoInPartita = () => page.evaluate(() => {
      const c = {};
      const aggiungi = (x) => { if (!x) return; const a = normalizeArtist(x.artist); c[a] = (c[a] || 0) + 1; };
      gameState.players.forEach(p => p.timeline.forEach(aggiungi));
      aggiungi(gameState.currentCard); gameState.readyCards.forEach(aggiungi); gameState.deck.forEach(aggiungi);
      return Math.max(0, ...Object.values(c));
    });
    ok(await massimoInPartita() <= 3, 'partita: al massimo 3 brani per artista nel mazzo');
    await page.evaluate(() => refillDeckOnline(gameState));
    ok(await massimoInPartita() <= 3, 'dopo un altro giro di ricerche il limite per artista regge');

    // ascolto
    await page.click('#btn-play-pause');
    await page.waitForFunction(() => !document.getElementById('mystery-audio-player').paused, null, { timeout: 10000 });
    await page.waitForSelector('.vinyl-spinning', { timeout: 5000 });
    ok(true, 'anteprima in riproduzione, vinile che gira');
    await page.screenshot({ path: SHOTS + 'giradischi-1-ascolto.png', fullPage: true });
    await page.click('#btn-play-pause');

    // turno di Paolo: giusto → annulla dalla carta girata → conferma di nuovo
    const prima = await gs();
    await sceltaConferma(true);
    ok((await gs()).p[0].t === 2, 'Paolo: posizione esatta, carta nella timeline');
    await page.waitForTimeout(900);
    await page.screenshot({ path: SHOTS + 'giradischi-2-girata.png', fullPage: true });
    await page.click('#revealed-card-face .undo-turn-btn');
    await page.click('#rg-conferma [data-risposta="si"]');
    await cartaPronta();
    const annullato = await gs();
    ok(annullato.card === prima.card && annullato.p[0].t === 1 && annullato.sel !== null && !annullato.rev, 'annulla dalla carta girata: stessa carta, posizione ancora scelta, timeline come prima');
    await conferma();
    // bonus Pro
    await page.click('#btn-claim-bonus');
    ok((await gs()).p[0].g === 3, 'modalità Pro: +1 gettone a Paolo');

    // ricarica a carta girata
    await page.reload();
    await page.waitForFunction(() => gameState.revealed && document.getElementById('mystery-card-inner').classList.contains('is-flipped'));
    ok((await page.textContent('#btn-claim-bonus')).includes('Assegnato'), 'ripresa a carta girata: rivelazione e bonus già assegnato come prima');
    await prossimo();
    await cartaPronta();

    // turno di Giulia: annulla all'inizio del turno dopo
    const giulia = await gs();
    ok(giulia.cur === 1 && await page.isVisible('#game-screen .lg\\:col-span-5 .undo-turn-btn'), 'turno di Giulia: si può ancora annullare il turno di Paolo');
    await scegli(0);
    await page.reload();
    await cartaPronta();
    const ripresa = await gs();
    ok(ripresa.card === giulia.card && ripresa.sel === 0 && !(await page.isDisabled('#btn-confirm-placement')), 'ripresa a metà turno: stesso brano e posizione scelta');
    await page.click('#game-screen .lg\\:col-span-5 .undo-turn-btn');
    await page.click('#rg-conferma [data-risposta="si"]');
    await cartaPronta();
    ok((await gs()).cur === 0 && (await gs()).card === prima.card, 'annulla dal turno dopo: si torna alla carta di Paolo');
    await conferma();
    ok((await gs()).p[0].g === 2, 'annullando si toglie anche il gettone bonus incassato dopo la conferma');
    await page.click('#btn-claim-bonus');
    await prossimo(); await cartaPronta();
    ok((await gs()).card === giulia.card, 'il brano già uscito per Giulia torna in cima');

    // sfida: Giulia sbaglia, Marco sfida con lo slot giusto e ruba la carta
    let iSbagliato = await slot(false);
    if (iSbagliato !== null) {
      await scegli(iSbagliato);
      await page.click('#btn-open-challenge');
      await page.selectOption('#challenger-select', '2');
      const giustoGiulia = await slot(true);
      await page.selectOption('#challenger-slot-select', String(giustoGiulia));
      await page.click('text=Lancia Sfida');
      ok(await page.isDisabled('#btn-skip-song'), 'dopo la sfida i poteri del giocatore di turno sono bloccati');
      await conferma();
      const s = await gs();
      ok(s.p[2].t === 2 && s.p[2].g === 1 && s.p[1].t === 1, 'sfida "SCRATCH!": Marco ruba la carta (−1 gettone)');
      await page.waitForTimeout(900);
      await page.screenshot({ path: SHOTS + 'giradischi-3-sfida.png', fullPage: true });
      await prossimo(); await cartaPronta();
    }
    // Marco: cambia brano con un gettone
    const mPrima = await gs();
    if (mPrima.p[mPrima.cur].g >= 1) {
      await page.click('#btn-skip-song');
      await cartaPronta();
      const mDopo = await gs();
      ok(mDopo.card !== mPrima.card && mDopo.p[mPrima.cur].g === mPrima.p[mPrima.cur].g - 1, 'cambia brano: −1 gettone e nuovo brano');
    }
    await sceltaConferma(false); await prossimo(); await cartaPronta();

    // Paolo compra una carta (3 gettoni)
    ok((await gs()).cur === 0, 'di nuovo il turno di Paolo');
    const t0 = (await gs()).p[0].t;
    await page.click('#btn-buy-card');
    await page.waitForFunction(t => gameState.players[0].timeline.length === t + 1, t0, { timeout: 60000 });
    ok((await gs()).p[0].g === 0, 'compra carta: −3 gettoni, +1 carta in timeline');

    // connessione persa a metà partita
    rete.rete = false;
    await page.waitForFunction(() => !gameState.validating, null, { timeout: 60000 });
    await page.evaluate(() => { gameState.readyCards = []; gameState.deck = []; });
    await sceltaConferma(false); await prossimo();
    await page.waitForFunction(() => document.getElementById('play-pause-text').textContent === 'RIPROVA', null, { timeout: 60000 });
    ok(await page.isVisible('#game-screen') && !(await page.isVisible('#victory-screen')), 'senza connessione la partita non finisce: compare "Riprova"');
    rete.rete = true;
    await page.click('#btn-play-pause');
    await cartaPronta();
    ok(true, 'tornata la connessione, "Riprova" pesca il brano');

    // fino alla vittoria: Paolo indovina, gli altri sbagliano
    for (let k = 0; k < 40; k++) {
      if (await page.isVisible('#victory-screen')) break;
      const s = await gs();
      await sceltaConferma(s.cur === 0);
      await prossimo();
      if (await page.isVisible('#victory-screen')) break;
      await cartaPronta();
    }
    await page.waitForSelector('#victory-screen:not(.hidden)');
    ok((await page.textContent('#winner-name')).trim() === 'Paolo', 'vittoria di Paolo con 6 carte');
    ok(await page.evaluate(() => localStorage.getItem('rg-hitstar-partita')) === null, 'a fine partita il salvataggio viene cancellato');
    await page.screenshot({ path: SHOTS + 'giradischi-4-vittoria.png', fullPage: true });
    await page.click('#victory-screen .undo-turn-btn');
    await page.click('#rg-conferma [data-risposta="si"]');
    await cartaPronta();
    ok((await gs()).p[0].t === 5, 'annulla dalla vittoria: Paolo torna a 5 carte');

    // Nuova partita dall'header
    await page.click('#btn-reset-header');
    await page.click('#rg-conferma [data-risposta="si"]');
    ok(await page.isVisible('#setup-screen') && await page.isHidden('#resume-box'), '"Nuova Partita": conferma in app, salvataggio cancellato');
    await page.click('#btn-mute');
    ok(await page.evaluate(() => RG.suoni.muto), 'tasto muto condiviso');
    await page.click('#btn-mute');
    ok(await page.evaluate(() => document.documentElement.scrollWidth) <= 360, 'nessuno scorrimento orizzontale');
    console.log('  richieste finte servite:', JSON.stringify(rete.richieste));
    ok(errori.length === 0, 'nessun errore in console' + (errori.length ? ':\n' + errori.join('\n') : ''));
  } catch (e) {
    console.log(e.message); console.log('errori:', errori);
    try { console.log(await page.evaluate(() => JSON.stringify({ txt: document.getElementById('play-pause-text').textContent, status: document.getElementById('audio-status-text').textContent, net: gameState.networkDown, card: !!gameState.currentCard, rev: gameState.revealed, ready: gameState.readyCards.length, deck: gameState.deck.length, valid: !!gameState.validating, drawing: typeof drawingCard !== 'undefined' && drawingCard, ended: gameState.ended }))); } catch (x) {} await page.screenshot({ path: SHOTS + 'giradischi-errore.png', fullPage: true }); process.exitCode = 1;
  } finally { await browser.close(); }
})();
