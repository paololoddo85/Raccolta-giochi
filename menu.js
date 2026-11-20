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
            return;
        }
        elenco.innerHTML = nomi.map(n => `<li class="nome">${RG.esc(n)}</li>`).join('');
    }

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
            const salvata = RG.archivio.spazio(a.dataset.gioco).leggi('partita', null);
            a.querySelector('.in-corso').hidden = !salvata;
        });
    }

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
    const cerca = document.getElementById('cerca-aggiornamenti');
    cerca.addEventListener('click', async () => {
        cerca.disabled = true;
        cerca.textContent = 'Controllo in corso…';
        const esito = await RG.cercaAggiornamenti();
        const versione = await RG.versioneApp();
        cerca.disabled = false;
        cerca.textContent = 'Controlla aggiornamenti';
        if (esito === 'aggiornata') RG.toast(`Hai già l'ultima versione${versione ? ` (versione ${versione})` : ''}.`, 'successo');
        else if (esito === 'trovata') RG.toast('C\'è una versione nuova: guarda in alto.', 'info');
        else if (esito === 'offline') RG.toast('Serve la connessione per controllare gli aggiornamenti.', 'errore');
        else RG.toast('Questo browser non permette gli aggiornamenti automatici: ricarica la pagina.', 'avviso');
    });

    disegnaNomi();
    segnaPartite();
    // Tornando indietro dal gioco la pagina può arrivare dalla cache del browser: si aggiorna
    window.addEventListener('pageshow', () => { disegnaNomi(); segnaPartite(); });
})();
