const { apri, ok, BASE, SHOTS } = require('./comune');
const { finti } = require('./finti-pellicola'); // Pellicola si gioca solo online: risposte finte
(async () => {
  const { browser, page, esterne, errori } = await apri({ finti });
    try {
    await page.goto(BASE + 'menu.css');
    await page.evaluate(() => { localStorage.clear(); localStorage.setItem('hintfake-partita-in-corso', JSON.stringify({ v: 2, savedAt: Date.now(), teams: [{name:'A',score:1,turnsPlayed:1},{name:'B',score:0,turnsPlayed:0}], wheelSlots: [null,null,null,null,null], activeTeamIdx: 1, totalTurnsPlayed: 1 })); });
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    ok(await page.isVisible('.scatola[data-gioco="hintfake"] .in-corso'), 'menù: "Partita in corso" su Cinquina (dopo migrazione)');
    ok(!(await page.isVisible('.scatola[data-gioco="cinestar"] .in-corso')), 'menù: nessuna partita su Pellicola');
    ok(await page.isVisible('.azzera[data-gioco="hintfake"]') && !(await page.isVisible('.azzera[data-gioco="cinestar"]')), '"Azzera la partita in corso" solo sotto i giochi con una partita salvata');
    ok((await page.textContent('.scatola-giradischi')).includes('Solo online') && (await page.textContent('.scatola-cine')).includes('Solo online'), 'note online: Giradischi e Pellicola solo online');
    ok((await page.textContent('.scatola-ritornello')).includes('Anche offline') && !(await page.isVisible('.scatola[data-gioco="ritornello"] .in-corso')), 'Ritornello nel menù: "Anche offline", nessuna partita in corso');
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
    await page.click('.scatola-cine'); // online: dal menù si entra in Pellicola
    await page.waitForURL('**/giochi/pellicola/');
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
    await page.evaluate(() => localStorage.setItem('rg-hintfake-partita', JSON.stringify({ v: 2, savedAt: Date.now(), mode: 'adulti', includeHot: false, teams: [{ name: 'A', score: 3, turnsPlayed: 1 }, { name: 'B', score: 1, turnsPlayed: 1 }], activeTeamIdx: 0, totalTurnsPlayed: 2, wheelSlots: [null, null, null, null, null], history: [], lastTurnUndo: null })));
    await page.goto(BASE + 'giochi/cinquina/');
    await page.click('#resume-box [data-azione="riprendi"]');
    await page.evaluate(() => { window.__segno = 'vecchia'; localStorage.removeItem('rg-hintfake-partita'); });
    await Promise.all([page.waitForNavigation({ timeout: 10000 }), page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })))]);
    await page.waitForSelector('#setup-screen:not(.hidden)');
    ok(await page.evaluate(() => window.__segno === undefined && localStorage.getItem('rg-hintfake-partita') === null), 'Cinquina con partita solo ripresa: dopo "Azzera" si ricarica pulita');
    // "Giocano spesso": conteggi delle partite, suggerimenti ordinati e tocco per aggiungere
    await page.evaluate(() => localStorage.setItem('rg-comune-squadre', JSON.stringify({ nomi: ['Paolo', 'Giulia', '', '', '', ''], conteggi: { paolo: { nome: 'Paolo', volte: 5 }, giulia: { nome: 'Giulia', volte: 3 }, marco: { nome: 'Marco', volte: 4 }, luca: { nome: 'Luca', volte: 2 }, anna: { nome: 'Anna', volte: 1 } } })));
    await page.goto(BASE);
    await page.waitForSelector('#frequenti:not([hidden])');
    const suggeriti = await page.locator('.nome-suggerito').allTextContents();
    ok(suggeriti.join() === '+ Marco,+ Luca,+ Anna', 'suggerimenti: chi gioca più spesso e non è già in elenco');
    await page.click('.nome-suggerito >> nth=0');
    ok((await page.locator('.nome').allTextContents()).join() === 'Paolo,Giulia,Marco' && await page.evaluate(() => RG.squadre.tutti()[2]) === 'Marco', 'tocco: il nome va nel primo posto libero');
    ok(await page.evaluate(() => RG.squadre.frequenti(8).join()) === 'Luca,Anna', 'Marco non è più tra i suggerimenti');
    await page.click('#apri-nomi');
    ok(await page.isHidden('#frequenti'), 'con "Modifica" aperto i suggerimenti non compaiono');
    await page.click('#apri-nomi');
    await page.evaluate(() => RG.squadre.imposta(['Paolo', 'Giulia', 'Marco', 'Luca', 'Anna', '']));
    ok(await page.evaluate(() => RG.squadre.aggiungi('Sara')) === true && await page.evaluate(() => RG.squadre.tutti().join()) === 'Paolo,Giulia,Marco,Luca,Anna,Sara', 'un posto libero: aggiungi() lo riempie');
    await page.evaluate(() => RG.squadre.imposta(['A1', 'A2', 'A3', 'A4', 'A5', 'A6']));
    ok(await page.evaluate(() => RG.squadre.aggiungi('Sara') === false), 'elenco pieno: aggiungi() non sostituisce nessuno');
    await page.evaluate(() => RG.squadre.imposta(['', '', '', '', '', '']));
    await page.evaluate(() => { RG.squadre.salva(['Paolo', 'Anna', 'Squadra C'], ['Squadra A', 'Squadra B', 'Squadra C']); });
    ok(await page.evaluate(() => { const c = RG.archivio.comune.leggi('squadre', {}).conteggi; return c.paolo.volte === 6 && c.anna.volte === 2 && !c['squadra c']; }), 'partita: ogni nome vero conta una volta, il predefinito del gioco no');
    // Paolo e Anna ora sono nell'elenco: non si suggeriscono. Restano Marco (4), Giulia (3) e Luca (2)
    ok(await page.evaluate(() => RG.squadre.frequenti(8).join()) === 'Marco,Giulia,Luca', 'frequenti: esclusi chi è in elenco, ordinati per partite');
    await page.screenshot({ path: SHOTS + 'menu-4-frequenti.png' });
    // "Chi gioca stasera": tocco per escludere / riattivare un nome, nomi che arrivano ai giochi
    await page.evaluate(() => localStorage.setItem('rg-comune-squadre', JSON.stringify({ nomi: ['Paolo', 'Giulia', 'Marco', '', '', ''], conteggi: {} })));
    await page.goto(BASE);
    await page.waitForSelector('#elenco-nomi .nome');
    const pressi = () => page.locator('#elenco-nomi button').evaluateAll(bs => bs.map(b => b.getAttribute('aria-pressed')).join());
    ok(await pressi() === 'true,true,true' && (await page.textContent('#riepilogo-nomi')).includes('Giocano stasera: 3 su 3'), 'nomi preimpostati: tutti giocano di default, riepilogo "3 su 3"');
    await page.click('#elenco-nomi button[data-indice="1"]');
    ok(await pressi() === 'true,false,true' && await page.locator('#elenco-nomi .nome.escluso').count() === 1, 'un tocco esclude Giulia: stato "escluso" visibile');
    ok(await page.evaluate(() => RG.squadre.nomi(3, ['Squadra A', 'Squadra B', 'Giocatore 3']).join()) === 'Paolo,Marco,Giocatore 3', 'giochi: Giulia non gioca, Marco prende il secondo posto');
    await page.screenshot({ path: SHOTS + 'menu-5-escluso.png' });
    await page.click('#elenco-nomi button[data-indice="1"]');
    ok(await pressi() === 'true,true,true' && await page.evaluate(() => RG.squadre.nomi(3).join()) === 'Paolo,Giulia,Marco', 'secondo tocco riattiva Giulia');
    // Un nome nuovo, aggiunto dal modulo, gioca subito
    await page.click('#apri-nomi');
    await page.locator('#campi-nomi input').nth(3).fill('Sara');
    await page.click('text=Salva i nomi');
    ok(await pressi() === 'true,true,true,true' && (await page.textContent('#riepilogo-nomi')).includes('4 su 4'), 'nome nuovo aggiunto: gioca (4 su 4)');
    // Esclusione di Paolo, poi avvio di Cinquina: le squadre sono Giulia e Marco
    await page.click('#elenco-nomi button[data-indice="0"]');
    await page.goto(BASE + 'giochi/cinquina/');
    await page.waitForSelector('#setup-team-1');
    ok(await page.inputValue('#setup-team-1') === 'Giulia' && await page.inputValue('#setup-team-2') === 'Marco', 'avvio Cinquina: con Paolo escluso le squadre sono Giulia e Marco');
    await page.goto(BASE + 'giochi/ritornello/');
    await page.waitForSelector('.count-btn.is-active');
    ok(await page.getAttribute('.count-btn.is-active', 'data-count') === '3', 'avvio Ritornello: con Paolo escluso propone 3 squadre (Giulia, Marco, Sara)');
    ok(await page.inputValue('#nomi-squadre input >> nth=0') === 'Giulia', 'avvio Ritornello: il primo nome è Giulia');
    await page.goto(BASE);
    await page.waitForSelector('#elenco-nomi .nome');
    for (const i of [1, 2, 3]) await page.click(`#elenco-nomi button[data-indice="${i}"]`);
    ok((await page.textContent('#riepilogo-nomi')).includes('Nessuno gioca stasera'), 'tutti esclusi: il riepilogo lo dice');
    await page.goto(BASE + 'giochi/cinquina/');
    await page.waitForSelector('#setup-team-1');
    ok(await page.inputValue('#setup-team-1') === 'Squadra A' && await page.inputValue('#setup-team-2') === 'Squadra B', 'nessuno selezionato: Cinquina torna ai nomi di partenza');
    // Un gioco che torna a usare un nome escluso lo riattiva (salva: nome oltre i posti che giocano)
    await page.evaluate(() => localStorage.setItem('rg-comune-squadre', JSON.stringify({ nomi: ['Paolo', 'Giulia', '', '', '', ''], conteggi: {}, esclusi: [1] })));
    await page.evaluate(() => RG.squadre.salva(['Paolo', 'Giulia'], ['Cinefilo 1', 'Cinefilo 2']));
    ok(await page.evaluate(() => RG.squadre.nomi(2, ['A', 'B']).join()) === 'Paolo,Giulia', 'un gioco che usa Giulia la riattiva');
    await page.goto(BASE);
    await page.waitForSelector('#elenco-nomi .nome');
    await page.screenshot({ path: SHOTS + 'menu-6-selezione.png', fullPage: true });
    await page.goto(BASE);
    await page.goto(BASE);
    for (const w of [320, 412]) { await page.setViewportSize({ width: w, height: 800 }); const sw = await page.evaluate(() => document.documentElement.scrollWidth); ok(sw <= w, `nessuno scorrimento orizzontale a ${w}px`); }
    await page.setViewportSize({ width: 360, height: 780 });
    await page.screenshot({ path: SHOTS + 'menu-3.png' });
    ok(esterne.length === 0, 'nessuna richiesta verso internet');
    ok(errori.length === 0, 'nessun errore' + (errori.length ? ':\n' + errori.join('\n') : ''));
  } catch (e) { console.log(e.message, errori); process.exitCode = 1; } finally { await browser.close(); }
})();
