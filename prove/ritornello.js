const { apri, ok, BASE, SHOTS } = require('./comune');
const { finti, stato: rete, CATALOGO } = require('./finti-ritornello');
const MODO = process.argv[2] || 'online'; // online | offline
(async () => {
  const { browser, page, errori } = await apri({ finti: MODO === 'online' ? finti : null });
  const st = () => page.evaluate(() => JSON.parse(JSON.stringify(RITORNELLO.stato)));
  const fase = (f) => page.waitForSelector(`#fase-${f}:not(.hidden)`, { timeout: 30000 });
  const togliToast = () => page.evaluate(() => document.querySelectorAll('.rg-toast').forEach(t => t.remove()));
  const si = () => page.click('#rg-conferma [data-risposta="si"]');
  // un turno intero: mostra brano, via, indovinato, punti
  const turno = async (esito, ladro) => {
    await fase('consegna'); await page.click('#mostra-brano');
    await fase('segreto'); await page.click('#via');
    await fase('canta'); await page.click('#indovinato');
    await fase('svela'); await page.click(`[data-esito="${esito}"]`);
    if (esito === 'niente') await page.click(`[data-ladro="${ladro ?? ''}"]`);
    await page.waitForSelector('#blocco-esito:not(.hidden)');
  };
  try {
    await page.goto(BASE + 'menu.css');
    await page.evaluate(() => { localStorage.clear(); localStorage.setItem('rg-comune-squadre', JSON.stringify({ nomi: ['Paolo', 'Giulia', 'Marco', '', '', ''] })); });
    await page.goto(BASE + 'giochi/ritornello/');
    const nomi = await page.locator('.nome-squadra').evaluateAll(els => els.map(e => e.value));
    ok(nomi.join() === 'Paolo,Giulia,Marco', 'tre squadre proposte con i nomi di "Chi gioca stasera"');
    await page.click('.count-btn[data-count="2"]');
    await page.selectOption('#scelta-traguardo', '10');
    // offline si prova la categoria "Italiane moderne" (ultimi 10 anni)
    if (MODO === 'offline') await page.selectOption('#scelta-brani', 'italiane-moderne');
    await page.screenshot({ path: SHOTS + `ritornello-${MODO}-1-preparazione.png`, fullPage: true });
    await page.click('#inizia');
    await fase('consegna');
    const s0 = await st();

    if (MODO === 'offline') {
      await page.waitForSelector('.rg-toast-avviso');
      ok((await page.textContent('.rg-toast-avviso')).includes('brani inclusi'), 'offline: avviso "si gioca con i brani inclusi" e la partita parte lo stesso');
      ok(s0.squadre.length === 2 && await page.evaluate(() => RITORNELLO.mazzo().length + 1 === RITORNELLO.inclusi('italiane-moderne') && RITORNELLO.mazzo().length > 10), 'offline: mazzo con tutti i brani inclusi della categoria');
      ok(await page.evaluate(() => [RITORNELLO.stato.brano, ...RITORNELLO.mazzo()].every(b => b.gruppo === 'it' && b.anno >= new Date().getFullYear() - 9)), '"Italiane moderne": solo brani italiani degli ultimi 10 anni, senza rap');
      await page.click('#mostra-brano'); await fase('segreto');
      ok(await page.isDisabled('#ripassa') && (await page.textContent('#ripasso-nota')).includes('Senza connessione'), 'offline: niente ripasso in cuffia, con la spiegazione');
      await page.click('#via'); await fase('canta'); await page.click('#indovinato'); await fase('svela');
      ok(await page.isDisabled('#ascolta') && (await page.textContent('#lettore-nota')).includes('Senza connessione'), 'offline: allo svelamento niente ascolto, con la spiegazione');
      await page.click('[data-esito="titolo"]');
      ok((await st()).squadre[0].punti === 2, 'offline: si gioca e si assegnano i punti');
      await page.screenshot({ path: SHOTS + 'ritornello-offline-2-svela.png', fullPage: true });
      ok(await page.evaluate(() => document.documentElement.scrollWidth) <= 360, 'nessuno scorrimento orizzontale');
      ok(errori.length === 0, 'nessun errore in console' + (errori.length ? ':\n' + errori.join('\n') : ''));
      return;
    }

    // Catalogo online: i brani da scartare non entrano nel mazzo
    const mazzo = await page.evaluate(() => RITORNELLO.mazzo().map(b => b.titolo + '|' + b.anno + '|' + b.anteprima));
    ok(mazzo.some(b => b.startsWith('Brano Online')), 'online: i brani del catalogo iTunes entrano nel mazzo');
    ok(!mazzo.some(b => /\/finto\/600[1-4]\.m4a$/.test(b) || b.startsWith('Senza https|')), 'versioni live, compilation, karaoke e anteprime non https scartate');
    ok(mazzo.some(b => b.startsWith('Ristampa|1975|')), 'ristampa: si usa l\'anno della versione più vecchia');
    ok(s0.squadre.map(s => s.nome).join() === 'Paolo,Giulia' && s0.traguardo === 10, 'partita a 2 squadre, traguardo 10');

    // Un titolo "pericoloso" dal catalogo resta testo
    await page.evaluate(() => { RITORNELLO.stato.brano = { titolo: '<img src=x onerror=alert(1)>', artista: 'Hacker', anno: 2001, gruppo: 'int', anteprima: '', copertina: '' }; });
    await page.click('#mostra-brano'); await fase('segreto');
    ok(await page.textContent('#segreto-titolo') === '<img src=x onerror=alert(1)>' && await page.locator('#fase-segreto img[src="x"]').count() === 0, 'un titolo con HTML viene mostrato come testo');

    // Cambia brano: una volta sola; il brano incluso trova la sua anteprima online
    await page.evaluate(() => { const m = RITORNELLO.mazzo(); m.push({ titolo: 'Azzurro', artista: 'Adriano Celentano', anno: 1968, gruppo: 'it' }); });
    await page.click('#cambia-brano');
    await page.waitForFunction(() => RITORNELLO.stato.brano.titolo === 'Azzurro' && RITORNELLO.stato.brano.anteprima);
    ok(await page.isHidden('#cambia-brano'), '"Cambia brano" si usa una volta per turno');
    await page.waitForSelector('#ripassa:not([disabled])');
    ok(true, 'brano incluso: anteprima trovata online, ripasso in cuffia disponibile');
    await page.click('#ripassa');
    await page.waitForFunction(() => !document.getElementById('anteprima').paused);
    ok(await page.textContent('#ripassa') === 'Ferma', 'ripasso: l\'anteprima suona');
    await page.screenshot({ path: SHOTS + 'ritornello-online-2-segreto.png', fullPage: true });

    // Canta: tempo, sbirciata, aiuti, ricaricamento
    await page.click('#via'); await fase('canta');
    ok(await page.evaluate(() => document.getElementById('anteprima').paused), 'partito il tempo l\'audio si ferma');
    await page.waitForFunction(() => RITORNELLO.stato.rimasti <= 43, null, { timeout: 5000 });
    ok(true, 'il tempo scorre');
    await page.locator('#sbircia').dispatchEvent('pointerdown');
    ok((await page.textContent('#sbircia-testo')).includes('Azzurro'), 'tenendo premuto si rivede il brano');
    await page.locator('#sbircia').dispatchEvent('pointerup');
    ok(await page.textContent('#sbircia-testo') === '', 'lasciando, il brano sparisce');
    await page.evaluate(() => { RITORNELLO.stato.squadre[0].punti = 3; });
    await page.click('[data-aiuto="anno"]'); await page.click('[data-aiuto="lettera"]');
    const sa = await st();
    ok(sa.squadre[0].punti === 1 && (await page.textContent('#aiuti-scoperti')).includes('1968') && (await page.textContent('#aiuti-scoperti')).includes('inizia per A'), 'aiuti: anno e prima lettera, −1 punto ciascuno');
    await page.screenshot({ path: SHOTS + 'ritornello-online-3-canta.png', fullPage: true });
    await page.reload();
    await fase('canta');
    const sr = await st();
    ok(sr.brano.titolo === 'Azzurro' && sr.squadre[0].punti === 1 && sr.aiuti.anno && Math.abs(sr.rimasti - sa.rimasti) <= 2, 'ricaricando si torna subito al canto: stesso brano, aiuti e punti');
    ok(await page.textContent('#pausa') === 'Riprendi il tempo', 'dopo il ricaricamento il tempo è fermo: "Riprendi il tempo"');
    await page.click('#pausa');
    // tempo scaduto
    await page.evaluate(() => { RITORNELLO.timer().rimasti = 1; });
    await fase('svela');
    ok(await page.textContent('#svela-motivo') === 'Tempo scaduto', 'tempo scaduto: si passa allo svelamento');
    await page.click('#ascolta');
    await page.waitForFunction(() => !document.getElementById('anteprima').paused);
    ok(true, 'svelamento: "Ascolta" fa partire il pezzo vero');
    // niente → furto di Giulia
    await page.click('[data-esito="niente"]');
    ok(await page.isVisible('#blocco-furto') && await page.locator('#scelte-furto [data-ladro]').count() === 2, 'non indovinato: l\'altra squadra può rubare (o nessuno)');
    await page.click('[data-ladro="1"]');
    ok((await st()).squadre[1].punti === 1 && (await page.textContent('#esito-testo')).includes('Giulia'), 'furto riuscito: +1 a Giulia');
    await page.screenshot({ path: SHOTS + 'ritornello-online-4-esito.png', fullPage: true });
    // annulla dall'esito
    await page.click('#blocco-esito .annulla-turno'); await si();
    ok((await st()).squadre[1].punti === 0 && await page.isVisible('#blocco-punti'), 'annulla dall\'esito: si torna alla scelta dei punti');
    await page.click('[data-esito="titolo"]');
    ok((await st()).squadre[0].punti === 3, 'titolo indovinato: +2');

    // turno di Giulia; annulla dall'inizio del turno dopo
    await page.click('#prossimo'); await fase('consegna');
    ok((await page.textContent('#consegna-squadra')) === 'Giulia' && await page.isVisible('#fase-consegna .annulla-turno'), 'tocca a Giulia, e si può ancora annullare il turno di Paolo');
    const primoGiulia = (await st()).brano.titolo;
    await page.click('#mostra-brano'); await page.click('#cambia-brano');
    const branoGiulia = (await st()).brano.titolo;
    await page.click('#fase-segreto .annulla-turno'); await si();
    const cima = await page.evaluate(() => RITORNELLO.mazzo().slice(-2).map(b => b.titolo));
    ok(cima.join() === [primoGiulia, branoGiulia].join(), 'annullando dopo "cambia brano" tornano nel mazzo entrambi i brani pescati');
    ok((await st()).turnoDi === 0 && (await st()).squadre[0].punti === 1, 'annulla dal turno dopo: si torna ai punti di Paolo');
    await page.click('[data-esito="artista"]');
    ok((await st()).squadre[0].punti === 2, 'solo l\'artista: +1');
    await page.click('#prossimo'); await fase('consegna');
    ok((await st()).brano.titolo === branoGiulia, 'il brano già pescato per Giulia torna nel mazzo');

    // parola detta
    await page.click('#mostra-brano'); await page.click('#via'); await fase('canta');
    ok(await page.isHidden('#fase-consegna .annulla-turno'), 'partito il tempo, il turno precedente non si annulla più');
    await page.click('#parola'); await si();
    await fase('svela');
    ok((await page.textContent('#esito-testo')).includes('perde il turno') && (await st()).squadre[1].punti === 0, 'ha detto una parola: turno perso, nessun punto né furto');
    await page.click('#blocco-esito .annulla-turno'); await si();
    ok((await page.textContent('#svela-motivo')).includes('Turno perso') && await page.isVisible('#blocco-punti'), 'annullando il turno perso resta il motivo "Turno perso"');
    await page.click('[data-esito="niente"]'); await page.click('[data-ladro=""]');
    await page.click('#prossimo');

    // dal menù: "Partita in corso" e ripresa
    await page.goto(BASE);
    ok(await page.isVisible('.scatola[data-gioco="ritornello"] .in-corso'), 'menù: "Partita in corso" su Ritornello');
    await page.click('.scatola[data-gioco="ritornello"]');
    await page.waitForSelector('#resume-box:not([hidden])');
    ok(await page.isVisible('#preparazione'), 'aperto dal menù: preparazione con "Partita in corso"');
    await togliToast();
    await page.click('#resume-box [data-azione="riprendi"]');
    await fase('consegna');
    ok((await st()).squadre[0].punti === 2 && (await st()).turnoDi === 0, 'partita ripresa con i punteggi giusti');
    ok(await page.inputValue('#scelta-traguardo') === '10' && (await page.locator('.nome-squadra').evaluateAll(els => els.map(e => e.value))).join() === 'Paolo,Giulia', 'dopo la ripresa il modulo ha le impostazioni della partita ("Gioca ancora" la ripete)');

    // fino alla vittoria (traguardo 10)
    for (let i = 0; i < 10 && !(await page.isVisible('#vittoria')); i++) {
      const di = (await st()).turnoDi;
      await turno(di === 0 ? 'titolo' : 'niente', '');
      await page.click('#prossimo');
    }
    await page.waitForSelector('#vittoria:not(.hidden)');
    ok((await page.textContent('#vittoria-titolo')) === 'Vince Paolo', 'Paolo arriva a 10 punti e vince');
    ok(await page.evaluate(() => localStorage.getItem('rg-ritornello-partita')) === null, 'a fine partita il salvataggio viene cancellato');
    await page.screenshot({ path: SHOTS + 'ritornello-online-5-vittoria.png' });
    await page.click('#vittoria .annulla-turno'); await si();
    ok(await page.isHidden('#vittoria') && (await st()).squadre[0].punti === 8, 'annulla dalla premiazione: Paolo torna a 8');
    ok(await page.evaluate(() => !!localStorage.getItem('rg-ritornello-partita')), 'dopo l\'annullamento la partita è di nuovo salvata');

    // salvataggio manomesso: niente indirizzi strani né HTML
    await page.evaluate(() => {
      RITORNELLO.stato.avviata = false; // niente salvataggio automatico mentre la pagina si ricarica
      const g = JSON.parse(localStorage.getItem('rg-ritornello-partita'));
      g.brano = { titolo: '<b>x</b>', artista: 'y', anno: 'z', anteprima: 'javascript:alert(1)', copertina: 'data:text/html,1' };
      g.fase = 'segreto'; g.categoria = 'constructor';
      localStorage.setItem('rg-ritornello-partita', JSON.stringify(g));
    });
    await page.reload(); await fase('segreto');
    ok(await page.evaluate(() => { const b = RITORNELLO.stato.brano; return b.anteprima === '' && b.copertina === '' && b.anno === null; }) && await page.textContent('#segreto-titolo') === '<b>x</b>', 'salvataggio manomesso: indirizzi non https scartati, titolo come testo');
    ok(await page.evaluate(() => RITORNELLO.stato.categoria) === 'tutto', 'salvataggio manomesso: una categoria inesistente ("constructor") torna "tutto"');

    // salvataggio con un furto impossibile (squadra -1): niente errori
    await page.evaluate(() => {
      RITORNELLO.stato.avviata = false;
      const g = JSON.parse(localStorage.getItem('rg-ritornello-partita'));
      g.fase = 'svela'; g.esito = { tipo: 'niente', ladro: -1 };
      localStorage.setItem('rg-ritornello-partita', JSON.stringify(g));
    });
    await page.reload(); await fase('svela');
    ok((await page.textContent('#esito-testo')).includes('Nessuno ha indovinato'), 'salvataggio con un ladro inesistente: "nessuno", senza errori');

    // ← Menu e scarta
    await page.click('#esci');
    ok(await page.isVisible('#resume-box'), '"← Menu" torna alla preparazione con la partita salvata');
    await togliToast();
    ok(await page.evaluate(() => { document.getElementById('inizia').click(); return [...document.querySelectorAll('#resume-box button')].every(b => b.disabled); }), 'mentre si prepara una partita nuova Riprendi e Scarta sono bloccati');
    await fase('consegna');
    await page.click('#esci');
    await page.click('#resume-box [data-azione="scarta"]'); await si();
    ok(await page.isHidden('#resume-box'), 'scarta partita (con conferma in app)');

    // "Italiane moderne" online: dal catalogo solo brani degli ultimi 10 anni, trattati come italiani
    await page.selectOption('#scelta-brani', 'italiane-moderne');
    // mescolamento fisso (al contrario): escono di sicuro le ricerche con l'anno, che stanno in fondo
    await page.evaluate(() => { window.__mescola = RG.mescola; RG.mescola = a => [...a].reverse(); });
    await page.click('#inizia'); await fase('consegna');
    await page.evaluate(() => { RG.mescola = window.__mescola; });
    const moderne = await page.evaluate(() => [RITORNELLO.stato.brano, ...RITORNELLO.mazzo()]);
    const popAttesi = CATALOGO.filter(b => b.trackName.startsWith('Brano Online') && !/hip.?hop|rap/i.test(b.primaryGenreName || '') && Number(b.releaseDate.slice(0, 4)) >= new Date().getFullYear() - 9).length;
    ok(moderne.filter(b => b.titolo.startsWith('Brano Online')).length === popAttesi && moderne.every(b => b.gruppo === 'it' && b.anno >= new Date().getFullYear() - 9),
      `"Italiane moderne" online: dal catalogo tutti e soli i ${popAttesi} brani non rap degli ultimi 10 anni; nessun brano rap incluso`);
    ok(!moderne.some(b => b.titolo === 'Sesso e samba'), '"Italiane moderne": un brano rap che iTunes classifica come pop resta fuori');
    ok(!moderne.some(b => b.titolo === 'Pensare male' && b.artista !== 'The Kolors ed Elodie'), 'artisti con "ed": il brano incluso e quello di iTunes sono lo stesso, non esce due volte');
    await page.click('#esci');

    // "Rap italiano moderno": solo rap degli ultimi 10 anni, inclusi e dal catalogo; il rap conta anche tra le italiane
    await page.selectOption('#scelta-brani', 'rap');
    await page.click('#inizia'); await fase('consegna');
    const rapAttesi = CATALOGO.filter(b => b.trackName.startsWith('Brano Online') && b.primaryGenreName === 'Hip-Hop/Rap' && Number(b.releaseDate.slice(0, 4)) >= new Date().getFullYear() - 9).length;
    const rap = await page.evaluate(() => [RITORNELLO.stato.brano, ...RITORNELLO.mazzo()]);
    ok(rap.every(b => b.gruppo === 'rap' && b.anno >= new Date().getFullYear() - 9) && rap.some(b => !b.titolo.startsWith('Brano Online')) &&
      rap.filter(b => b.titolo.startsWith('Brano Online')).length === rapAttesi,
      `"Rap italiano moderno": brani rap inclusi e dal catalogo (tutti e soli i ${rapAttesi} di genere hip-hop/rap degli ultimi 10 anni)`);
    await page.click('#esci');
    await page.selectOption('#scelta-brani', 'italiane');
    await page.click('#inizia'); await fase('consegna');
    const italiane = await page.evaluate(() => [RITORNELLO.stato.brano, ...RITORNELLO.mazzo()]);
    ok(italiane.some(b => b.gruppo === 'rap'), 'i brani rap restano anche in "Solo italiane"');
    ok(italiane.filter(b => b.titolo === 'Lamborghini').length === 1, 'stesso brano con l\'artista scritto in modo diverso ("Guè Pequeno"/"Guè"): esce una volta sola');
    await page.click('#esci');
    ok(await page.evaluate(() => document.documentElement.scrollWidth) <= 360, 'nessuno scorrimento orizzontale');
    const y = new Date().getFullYear();
    const conAnno = rete.termini.filter(t => /^(sanremo|tormentoni estate|successi italiani|rap italiano|trap italiana) /.test(t));
    ok(conAnno.length > 0 && !rete.termini.some(t => t.includes('{anno}')) && conAnno.every(t => [y, y - 1, y - 2, y - 3].includes(Number(t.split(' ').pop()))),
      `ricerche con l'anno solo per gli ultimi anni (${conAnno.join(', ')})`);
    console.log('  richieste finte servite:', JSON.stringify(rete.richieste));
    ok(errori.length === 0, 'nessun errore in console' + (errori.length ? ':\n' + errori.join('\n') : ''));
  } catch (e) {
    console.log(e.message); console.log('errori:', errori); await page.screenshot({ path: SHOTS + `ritornello-${MODO}-errore.png`, fullPage: true }); process.exitCode = 1;
  } finally { await browser.close(); }
})();
