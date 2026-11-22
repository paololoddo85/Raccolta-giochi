/*
 * COMBRICCOLA - menù della raccolta
 * - "Chi gioca stasera": l'elenco condiviso di 6 nomi (shared/js/squadre.js)
 * - le scatole dei giochi, con l'avviso "Partita in corso" se c'è un salvataggio
 * - l'interruttore dei suoni, valido per tutti i giochi
 */
(function () {
    'use strict';

    RG.migrazioni.tutte();

    const elenco = document.getElementById('elenco-nomi');
    const modulo = document.getElementById('modulo-nomi');
    const campi = document.getElementById('campi-nomi');
    const apri = document.getElementById('apri-nomi');

    function disegnaNomi() {
        const nomi = RG.squadre.tutti().filter(Boolean);
        if (!nomi.length) {
            elenco.innerHTML = '<li class="nomi-vuoto">Nessun nome ancora. Ogni gioco userà i suoi (Squadra A, Cinefilo 1…).</li>';
        } else {
            elenco.innerHTML = nomi.map(n => `<li class="nome">${RG.esc(n)}</li>`).join('');
        }
        disegnaFrequenti();
    }

    // "Giocano spesso": i nomi che hanno giocato più volte, da toccare per aggiungerli.
    // Non si mostrano mentre il modulo "Modifica" è aperto, così non si perde quello che si sta scrivendo.
    const frequenti = document.getElementById('frequenti');
    let suggeriti = [];
    function disegnaFrequenti() {
        suggeriti = modulo.hidden ? RG.squadre.frequenti(8) : [];
        frequenti.hidden = !suggeriti.length;
        frequenti.innerHTML = suggeriti.length ? `
            <p class="frequenti-titolo">Giocano spesso · tocca per aggiungerli</p>
            <div class="nomi">${suggeriti.map((n, i) => `<button type="button" class="nome-suggerito" data-indice="${i}">+ ${RG.esc(n)}</button>`).join('')}</div>` : '';
    }
    frequenti.addEventListener('click', (e) => {
        const b = e.target.closest('.nome-suggerito');
        if (!b) return;
        const nome = suggeriti[Number(b.dataset.indice)];
        if (!RG.squadre.aggiungi(nome)) {
            RG.toast('Sono già tutti i posti pieni: togli un nome con "Modifica".', 'avviso');
            return;
        }
        disegnaNomi();
        RG.toast(`${nome} è in "Chi gioca stasera"`, 'successo');
    });

    function disegnaCampi() {
        campi.innerHTML = RG.squadre.tutti().map((n, i) => `
            <label class="campo">
                <span class="campo-numero">${i + 1}</span>
                <input type="text" maxlength="24" autocomplete="off" value="${RG.esc(n)}" placeholder="${i < 2 ? `Squadra ${i === 0 ? 'A' : 'B'}` : `Giocatore ${i + 1}`}" aria-label="Nome ${i + 1}">
            </label>`).join('');
    }

    function apriModulo(aperto) {
        modulo.hidden = !aperto;
        apri.setAttribute('aria-expanded', aperto ? 'true' : 'false');
        apri.textContent = aperto ? 'Chiudi' : 'Modifica';
        disegnaFrequenti();
        if (aperto) {
            disegnaCampi();
            const primo = campi.querySelector('input');
            if (primo) primo.focus();
        }
    }

    apri.addEventListener('click', () => apriModulo(modulo.hidden));

    modulo.addEventListener('submit', (e) => {
        e.preventDefault();
        RG.squadre.imposta([...campi.querySelectorAll('input')].map(i => i.value));
        disegnaNomi();
        apriModulo(false);
        RG.toast('Nomi salvati per tutti i giochi', 'successo');
    });

    document.getElementById('svuota-nomi').addEventListener('click', () => {
        RG.conferma({ titolo: 'Svuotare i nomi?', testo: 'Ogni gioco tornerà ai suoi nomi di partenza.', ok: 'Svuota', pericolo: true })
            .then(si => {
                if (!si) return;
                RG.squadre.imposta([]);
                disegnaCampi();
                disegnaNomi();
            });
    });

    // "Partita in corso" sulle scatole dei giochi che hanno un salvataggio
    function segnaPartite() {
        document.querySelectorAll('.scatola[data-gioco]').forEach(a => {
            const salvata = typeof RG.archivio.spazio(a.dataset.gioco).leggi('partita', null)?.v === 'number'; // salvataggio valido
            a.querySelector('.in-corso').hidden = !salvata;
            const azzera = document.querySelector(`.azzera[data-gioco="${a.dataset.gioco}"]`);
            if (azzera) azzera.hidden = !salvata;
        });
    }

    // Giochi "solo online" (data-solo-online): senza connessione non si apre il gioco,
    // l'avviso compare subito qui nel menù. Il gioco controlla comunque da sé (rete lenta, scorciatoie).
    document.querySelectorAll('.scatola[data-solo-online]').forEach(a => a.addEventListener('click', (e) => {
        if (navigator.onLine !== false) return;
        e.preventDefault();
        const testo = `${a.querySelector('.scatola-nome').textContent} ha bisogno di internet: controlla la connessione e riprova.`;
        // tocchi ripetuti: niente avvisi uguali uno sopra l'altro
        if ([...document.querySelectorAll('.rg-toast-errore')].some(t => t.textContent === testo)) return;
        RG.toast(testo, 'errore');
    }));

    // "Azzera la partita in corso": cancella solo la partita salvata di quel gioco.
    // Cosa resta, per gioco (i nomi di "Chi gioca stasera" restano sempre)
    const RESTA = {
        hintfake: 'le carte importate e la memoria delle carte già uscite',
        cinestar: 'la memoria dei film già usciti',
        hitstar: 'la memoria dei brani già usciti',
        ritornello: 'la memoria dei brani già cantati'
    };
    document.querySelectorAll('.azzera').forEach(b => b.addEventListener('click', async () => {
        const gioco = b.dataset.gioco;
        const nome = document.querySelector(`.scatola[data-gioco="${gioco}"] .scatola-nome`).textContent;
        const si = await RG.conferma({
            titolo: `Azzerare la partita di ${nome}?`,
            testo: `La partita salvata viene cancellata e la prossima volta si ricomincia da capo. Restano i nomi${RESTA[gioco] ? ' e ' + RESTA[gioco] : ''}.`,
            ok: 'Azzera',
            pericolo: true
        });
        if (!si) return;
        RG.archivio.spazio(gioco).togli('partita');
        segnaPartite();
        RG.toast(`Partita di ${nome} azzerata: si ricomincia da capo.`, 'successo');
    }));

    // Interruttore suoni
    const suoni = document.getElementById('pulsante-suoni');
    function disegnaSuoni() {
        suoni.querySelector('.interruttore-testo').textContent = RG.suoni.muto ? 'Suoni spenti' : 'Suoni accesi';
    }
    RG.suoni.collega(suoni);
    RG.suoni.alCambio(disegnaSuoni);
    disegnaSuoni();
    suoni.addEventListener('click', () => {
        RG.suoni.alterna();
        RG.suoni.bip(660, 0.08);
    });

    // Versione installata sul telefono (dal service worker): utile per capire se l'aggiornamento è arrivato
    RG.versioneApp().then(v => {
        const el = document.getElementById('versione-app');
        if (v) { el.textContent = `Versione ${v} · funziona anche senza connessione`; el.hidden = false; }
    });

    // "Controlla aggiornamenti": risponde sempre, anche quando non c'è niente di nuovo
    const RISPOSTE = {
        trovata: ["C'è una versione nuova: guarda in alto.", 'info'],
        offline: ['Serve la connessione per controllare gli aggiornamenti.', 'errore'],
        attendi: ["L'app si sta ancora preparando: riprova tra qualche secondo.", 'avviso'],
        'non-disponibile': ['Questo browser non permette gli aggiornamenti automatici: ricarica la pagina.', 'avviso']
    };
    const cerca = document.getElementById('cerca-aggiornamenti');
    cerca.addEventListener('click', async () => {
        cerca.disabled = true;
        cerca.textContent = 'Controllo in corso…';
        const esito = await RG.cercaAggiornamenti();
        if (esito === 'aggiornata') {
            const versione = await RG.versioneApp();
            RG.toast(`Hai già l'ultima versione${versione ? ` (versione ${versione})` : ''}.`, 'successo');
        } else {
            RG.toast(...(RISPOSTE[esito] || RISPOSTE['non-disponibile']));
        }
        cerca.disabled = false;
        cerca.textContent = 'Controlla aggiornamenti';
    });

    disegnaNomi();
    segnaPartite();
    // Tornando indietro dal gioco la pagina può arrivare dalla cache del browser: si aggiorna
    window.addEventListener('pageshow', () => { disegnaNomi(); segnaPartite(); });
})();
