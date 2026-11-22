const { apri, ok, BASE, SHOTS } = require('./comune');
(async () => {
  const { browser, page, esterne, errori } = await apri();
  try {
    // 1. Dati della vecchia pagina → migrazione
    await page.goto(BASE + 'menu.css');
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('hintfake-impostazioni', JSON.stringify({ mode: 'adulti', includeHot: false }));
      localStorage.setItem('hintfake-carte-uscite-adulti', JSON.stringify([1, 2, 3, 'a1']));
      localStorage.setItem('hintfake-carte-importate', JSON.stringify([{ abilita: 'Mimare', tema: 'Tema importato vecchio', proibita: 'X', oggetti: ['a','b','c','d','e'], pubblico: 'tutti', id: 'imp-vecchia' }]));
      localStorage.setItem('hintfake-partita-in-corso', JSON.stringify({ v: 1, savedAt: Date.now() - 3600e3, mode: 'adulti', includeHot: false,
        teams: [{ name: 'Rossi', score: 7, turnsPlayed: 2 }, { name: 'Blu', score: 5, turnsPlayed: 2 }], activeTeamIdx: 0, totalTurnsPlayed: 4,
        wheelSlots: [{ id: 3, abilita: 'Parlare', tema: 'Piatti tipici italiani', proibita: 'Pizza', oggetti: ['Carbonara','Tiramisù','Lasagne','Arancino','Pesto alla genovese'], pubblico: 'tutti' }, null, null, null, null], history: [], lastTurnUndo: null }));
    });
    await page.goto(BASE + 'giochi/hint-fake/');
    await page.waitForURL('**/giochi/cinquina/');
    ok(true, 'la vecchia cartella giochi/hint-fake/ rimanda a Cinquina');
    await page.goto(BASE + 'HINT_FAKE.html');
    await page.waitForURL('**/giochi/cinquina/');
    ok(page.url() === BASE + 'giochi/cinquina/', 'il vecchio indirizzo HINT_FAKE.html rimanda alla nuova posizione');
    await page.waitForSelector('#resume-box:not([hidden])');
    const riass = await page.textContent('#resume-box');
    ok(riass.includes('Rossi 7 – 5 Blu'), 'la partita salvata nella vecchia pagina compare in "Partita in corso"');
    ok(await page.isChecked('#hot-toggle') === false, 'le impostazioni migrate (carte hot spente) sono state lette');
    const mig = await page.evaluate(() => ({ nuova: !!localStorage.getItem('rg-hintfake-partita'), vecchia: !!localStorage.getItem('hintfake-partita-in-corso') }));
    ok(mig.nuova && mig.vecchia, 'migrazione: chiave nuova creata, vecchia conservata');
    await page.screenshot({ path: SHOTS + 'cinquina-1-setup-ripresa.png', fullPage: true });

    // 2. Riprendi
    await page.click('#resume-box [data-azione="riprendi"]');
    ok(await page.textContent('#active-team-title') === 'Rossi', 'ripresa: tocca alla squadra salvata');
    ok(await page.textContent('#sc-total-0') === '7', 'ripresa: punteggio corretto');

    // Nuova partita (conferma dentro l'app)
    await page.click('text=Nuova Partita');
    await page.waitForSelector('#rg-conferma:not([hidden])');
    await page.screenshot({ path: SHOTS + 'cinquina-2-conferma.png' });
    await page.click('#rg-conferma [data-risposta="si"]');
    ok(await page.isVisible('#setup-screen'), 'Nuova partita: conferma in app e ritorno alla preparazione');

    // 3. Partita completa con nomi condivisi
    await page.fill('#setup-team-1', 'Leoni');
    await page.fill('#setup-team-2', 'Squadra B');
    await page.click('text=Inizia la Partita');
    const squadre = await page.evaluate(() => RG.squadre.tutti());
    ok(squadre[0] === 'Leoni' && squadre[1] === '', 'nomi squadre salvati nell\'elenco condiviso (predefinito non salvato)');

    let turni = 0, undoProvato = false;
    while (turni < 60) {
      if (await page.isVisible('#victory-modal')) break;
      await page.waitForFunction(() => !state.animating);
      const slot = await page.evaluate(() => state.wheelSlots[4] ? 4 : state.wheelSlots.findIndex(Boolean));
      await page.click(`.wheel-tile.card[data-slot="${slot}"]`);
      await page.click('text=Gira e Avvia 90s');
      if (!await page.evaluate(() => timer.inCorso)) throw new Error('timer non avviato al turno ' + (turni + 1));
      if (turni === 0) ok(true, 'timer avviato');
      // segna 4 oggetti indovinati
      const quanti = await page.evaluate(() => state.activeTeamIdx === 0 ? 4 : 2);
      for (let i = 0; i < quanti; i++) await page.click(`#play-objects-list button:nth-child(${i + 1})`);
      if (turni === 0) await page.screenshot({ path: SHOTS + 'cinquina-3-timer.png', fullPage: true });
      await page.click('text=Fine Tempo');
      await page.click('#opp-btn-normal');
      await page.click('#opp-btn-forbidden');
      await page.click('#opp-btn-wrong'); // alternativo: deve spegnere "forbidden"
      const scelte = await page.evaluate(() => state.opponentChoices);
      if (turni === 0) ok(scelte.normal && scelte.wrong && !scelte.forbidden, 'replica: normale combinabile, proibito +2/-2 alternativi');
      if (turni === 0) await page.screenshot({ path: SHOTS + 'cinquina-4-replica.png', fullPage: true });
      const prima = await page.evaluate(() => state.teams.map(t => t.score));
      await page.click('text=Registra Punti e Gira la Ruota');
      turni++;
      if (!undoProvato && turni === 2) {
        await page.waitForFunction(() => !state.animating);
        const dopo = await page.evaluate(() => state.teams.map(t => t.score));
        await page.click('#btn-undo-turn');
        await page.click('#rg-conferma [data-risposta="si"]');
        const annullato = await page.evaluate(() => state.teams.map(t => t.score));
        ok(JSON.stringify(annullato) === JSON.stringify(prima) && JSON.stringify(dopo) !== JSON.stringify(prima), 'annulla ultimo turno: punteggi tornati a prima del turno');
        ok(await page.isVisible('#step-4-opponent-view'), 'annulla: riaperto il passo 4 per correggere');
        await page.click('text=Registra Punti e Gira la Ruota');
        undoProvato = true;
        // ricarica a metà partita
        await page.waitForFunction(() => !state.animating);
        const salvato = await page.evaluate(() => JSON.stringify(state.teams));
        await page.reload();
        await page.waitForSelector('#active-game-container:not(.hidden)');
        ok(await page.isHidden('#setup-screen'), 'ricaricando si torna subito in partita (senza toccare Riprendi)');
        ok(await page.evaluate(() => JSON.stringify(state.teams)) === salvato, 'ricarica della pagina: partita ripresa identica');
        ok(await page.isVisible('#btn-undo-turn'), 'dopo la ripresa si può ancora annullare l\'ultimo turno');
      }
    }
    await page.waitForSelector('#victory-modal:not(.hidden)');
    const fine = await page.evaluate(() => state.teams);
    ok(fine[0].turnsPlayed === fine[1].turnsPlayed && Math.max(fine[0].score, fine[1].score) >= 20, `vittoria dopo ${turni} turni: ${fine[0].score}-${fine[1].score}, turni pari`);
    ok(await page.evaluate(() => localStorage.getItem('rg-hintfake-partita')) === null, 'a fine partita il salvataggio viene cancellato');
    await page.screenshot({ path: SHOTS + 'cinquina-5-vittoria.png' });
    await page.click('text=Gioca una Nuova Partita');

    // 3b. Una sola abilità scelta a inizio partita
    await page.click('#abilita-scelte [data-abilita="Parlare"]');
    const impParlare = await page.evaluate(() => JSON.parse(localStorage.getItem('rg-hintfake-impostazioni')).abilita);
    ok(impParlare === 'Parlare', 'la scelta "Solo Parlare" è salvata nelle impostazioni');
    const mazzoParlare = await page.evaluate(() => getActiveDeck().map(c => c.abilita));
    ok(mazzoParlare.length > 0 && mazzoParlare.every(a => a === 'Parlare'), `mazzo di sola Parlare (${mazzoParlare.length} carte)`);
    ok(await page.getAttribute('#abilita-scelte [data-abilita="Parlare"]', 'aria-pressed') === 'true', 'il pulsante scelto è segnato come attivo');
    await page.screenshot({ path: SHOTS + 'cinquina-7-solo-parlare.png', fullPage: true });
    await page.click('text=Inizia la Partita');
    for (let t = 0; t < 3; t++) {
      await page.waitForFunction(() => !state.animating);
      const slot = await page.evaluate(() => state.wheelSlots[4] ? 4 : state.wheelSlots.findIndex(Boolean));
      await page.click(`.wheel-tile.card[data-slot="${slot}"]`);
      await page.click('text=Gira e Avvia 90s');
      await page.click('#play-objects-list button:nth-child(1)');
      await page.click('text=Fine Tempo');
      await page.click('#opp-btn-normal');
      await page.click('text=Registra Punti e Gira la Ruota');
    }
    await page.waitForFunction(() => !state.animating);
    const sulla = await page.evaluate(() => state.wheelSlots.filter(Boolean).map(c => c.abilita));
    ok(sulla.length === 3 && sulla.every(a => a === 'Parlare'), 'con "Solo Parlare" tutte le carte della ruota sono di Parlare dopo 3 turni');
    ok((await page.textContent('#header-deck-info')).includes('Solo Parlare'), 'in intestazione si legge "Solo Parlare": ' + await page.textContent('#header-deck-info'));
    await page.reload();
    await page.waitForSelector('#active-game-container:not(.hidden)');
    ok(await page.evaluate(() => state.abilita) === 'Parlare', 'ricaricando la partita a una abilità riprende con la stessa scelta');
    await page.click('text=Nuova Partita');
    await page.click('#rg-conferma [data-risposta="si"]');
    await page.click('#abilita-scelte [data-abilita="tutte"]');
    ok(await page.evaluate(() => state.abilita) === 'tutte' && (await page.evaluate(() => new Set(getActiveDeck().map(c => c.abilita)).size)) === 4, 'tornando a "Tutte e 4" il mazzo ha di nuovo le 4 abilità');

    // 4. Timer reale con orologio accelerato: a 0 passa da solo al passo 4
    await page.click('text=Inizia la Partita');
    await page.evaluate(() => { window.__vibr = []; navigator.vibrate = p => { window.__vibr.push(p); return true; }; });
    const slot = await page.evaluate(() => state.wheelSlots.findIndex(Boolean));
    await page.click(`.wheel-tile.card[data-slot="${slot}"]`);
    await page.click('text=Gira e Avvia 90s');
    await page.click('#btn-pause-timer');
    const fermo = await page.evaluate(() => timer.rimasti);
    await page.waitForTimeout(1500);
    ok(await page.evaluate(() => timer.rimasti) === fermo && await page.textContent('#btn-pause-timer') === 'Riprendi', 'pausa del timer');
    await page.click('#btn-pause-timer');
    await page.evaluate(() => { timer.rimasti = 3; });
    await page.waitForSelector('#step-4-opponent-view:not(.hidden)', { timeout: 6000 });
    const v = await page.evaluate(() => window.__vibr);
    ok(v.some(x => x === 70) && v.some(x => Array.isArray(x)), 'vibrazione negli ultimi secondi e a fine tempo; a 0 si passa da soli al passo 4');
    ok(await page.evaluate(() => timer.inCorso) === false, 'timer fermo dopo la scadenza');

    // 5. Import carte
    await page.click('button[title="Importa nuove carte"]');
    const req = await page.evaluate(() => buildRequestForClaude());
    ok(req.includes('Cinquina') && req.includes('Non ripetere questi temi'), '"Copia richiesta per Claude" genera il testo');
    await page.click('text=Copia richiesta per Claude');
    await page.fill('#import-text', 'Ecco le carte:\n```json\n[{"abilita":"Mimare","tema":"Sport invernali test","proibita":"Sci","oggetti":["Slittino","Curling","Pattinaggio","Snowboard","Biathlon"],"pubblico":"tutti"},{"abilita":"Parlare","tema":"Piatti tipici italiani","proibita":"Pizza","oggetti":["a","b","c","d","e"]},{"abilita":"Ballare","tema":"x","proibita":"y","oggetti":["1"]}]\n```');
    await page.click('text=Importa nel mazzo');
    const esito = await page.textContent('#import-result');
    ok(esito.includes('1 carta aggiunta') && esito.includes('1 doppia saltata') && esito.includes('1 incompleta scartata'), 'import: ' + esito.trim());
    await page.screenshot({ path: SHOTS + 'cinquina-6-import.png', fullPage: true });
    await page.reload();
    const imp = await page.evaluate(() => IMPORTED_CARDS.map(c => c.tema));
    ok(imp.includes('Sport invernali test') && imp.includes('Tema importato vecchio'), 'dopo la ricarica restano le carte importate (anche quelle migrate)');

    // 6. muto condiviso
    await page.click('#btn-sound');
    ok(await page.evaluate(() => JSON.parse(localStorage.getItem('rg-comune-impostazioni')).muto) === true, 'tasto muto salvato nelle impostazioni condivise');
    await page.click('#btn-sound');

    // 7. Pulsante indietro
    await page.click('.rg-indietro');
    await page.waitForURL(BASE);
    ok(true, 'il tasto ← torna al menù di Combriccola');

    ok(esterne.length === 0, 'nessuna richiesta verso internet' + (esterne.length ? ': ' + esterne.join(', ') : ''));
    ok(errori.length === 0, 'nessun errore in console' + (errori.length ? ':\n' + errori.join('\n') : ''));
  } catch (e) {
    console.log(e.message); console.log('errori:', errori); await page.screenshot({ path: SHOTS + 'cinquina-errore.png', fullPage: true });
    process.exitCode = 1;
  } finally { await browser.close(); }
})();
