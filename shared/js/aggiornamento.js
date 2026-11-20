/*
 * APP INSTALLABILE E AGGIORNAMENTI
 * Registra il service worker (sw.js nella cartella del sito) e, quando è pronta una versione
 * nuova, mostra in alto "Nuova versione disponibile — tocca per aggiornare".
 * Toccando, la versione nuova si attiva e la pagina si ricarica: la partita in corso
 * riparte da sola (vedi RG.partita.ricaricata).
 *
 *   RG.versioneApp()        Promise con il numero di versione installata (o null)
 *   RG.cercaAggiornamenti() controlla subito se c'è una versione nuova (pulsante del menù)
 *
 * Funziona da qualsiasi pagina: la cartella del sito si ricava dalla posizione di questo file.
 */
(function (RG) {
    'use strict';

    const questoFile = document.currentScript && document.currentScript.src;
    RG.versioneApp = () => Promise.resolve(null);
    RG.cercaAggiornamenti = () => Promise.resolve('non-disponibile');
    if (!questoFile || !('serviceWorker' in navigator) || location.protocol === 'file:') return;

    const cartella = new URL('../../', questoFile); // shared/js/ → cartella del sito
    let aggiornamentoChiesto = false;

    // Si ricarica solo quando l'ha chiesto chi gioca (non alla prima installazione)
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!aggiornamentoChiesto) return;
        aggiornamentoChiesto = false;
        location.reload();
    });

    RG.versioneApp = function () {
        const sw = navigator.serviceWorker.controller;
        if (!sw) return Promise.resolve(null);
        return new Promise((risolvi) => {
            const canale = new MessageChannel();
            const tempo = setTimeout(() => risolvi(null), 1500);
            canale.port1.onmessage = (e) => { clearTimeout(tempo); risolvi(e.data); };
            sw.postMessage({ tipo: 'versione' }, [canale.port2]);
        });
    };

    // Barra in alto: "Aggiornamento in arrivo…" mentre si scarica, poi "Nuova versione disponibile"
    function barra() {
        let el = document.getElementById('rg-aggiorna');
        if (!el) {
            el = document.createElement('div');
            el.id = 'rg-aggiorna';
            el.className = 'rg-aggiorna';
            el.setAttribute('role', 'status');
            document.body.appendChild(el);
        }
        return el;
    }

    function mostraInArrivo() {
        if (document.getElementById('rg-aggiorna')) return;
        const el = barra();
        el.dataset.stato = 'in-arrivo';
        el.innerHTML = `
            <span class="rg-aggiorna-tocca rg-aggiorna-attesa"><strong>Aggiornamento in arrivo…</strong> si sta scaricando la versione nuova</span>
            <button type="button" class="rg-aggiorna-dopo" aria-label="Nascondi">Dopo</button>`;
        el.querySelector('.rg-aggiorna-dopo').addEventListener('click', () => el.remove());
    }

    let lavoratoreAvviso = null; // la versione a cui si riferisce l'avviso mostrato

    function mostraAvviso(lavoratore) {
        const esistente = document.getElementById('rg-aggiorna');
        // Se nel frattempo è arrivata un'altra versione, l'avviso si ricollega a quella nuova
        if (esistente && esistente.dataset.stato === 'pronta' && lavoratoreAvviso === lavoratore) return;
        lavoratoreAvviso = lavoratore;
        const el = barra();
        el.dataset.stato = 'pronta';
        el.innerHTML = `
            <button type="button" class="rg-aggiorna-tocca"><strong>Nuova versione disponibile</strong> — tocca per aggiornare</button>
            <button type="button" class="rg-aggiorna-dopo" aria-label="Più tardi">Dopo</button>`;
        el.querySelector('.rg-aggiorna-tocca').addEventListener('click', (e) => {
            aggiornamentoChiesto = true;
            e.currentTarget.disabled = true;
            e.currentTarget.textContent = 'Aggiornamento…';
            lavoratore.postMessage({ tipo: 'aggiorna' });
        });
        el.querySelector('.rg-aggiorna-dopo').addEventListener('click', () => el.remove());
    }

    function togliInArrivo() {
        const el = document.getElementById('rg-aggiorna');
        if (el && el.dataset.stato === 'in-arrivo') el.remove();
    }

    // Segue lo scaricamento di una versione nuova (mai alla prima installazione)
    function seguiInstallazione(nuovo) {
        if (!nuovo || !navigator.serviceWorker.controller) return;
        mostraInArrivo();
        const controlla = () => {
            if (nuovo.state === 'installed') mostraAvviso(nuovo);
            else if (nuovo.state === 'redundant') togliInArrivo(); // scaricamento non riuscito: si riproverà
        };
        nuovo.addEventListener('statechange', controlla);
        controlla();
    }

    let segnaPronta;
    const registrazionePronta = new Promise(r => { segnaPronta = r; });

    /*
     * "Controlla aggiornamenti" (pulsante in fondo al menù). Risponde con:
     *   'aggiornata'  è già l'ultima versione
     *   'trovata'     c'è una versione nuova: compare la barra in alto
     *   'offline'     serve la connessione
     *   'attendi'     l'app si sta ancora preparando: riprovare tra poco
     *   'non-disponibile'  il browser non permette gli aggiornamenti (es. navigazione privata)
     */
    const ATTESA = Symbol('attesa');
    const entro = (promessa, ms) => {
        let timer;
        return Promise.race([promessa, new Promise(r => { timer = setTimeout(() => r(ATTESA), ms); })])
            .finally(() => clearTimeout(timer));
    };

    RG.cercaAggiornamenti = async function () {
        const reg = await entro(registrazionePronta, 10000);
        const controllata = !!navigator.serviceWorker.controller;
        if (reg && reg !== ATTESA && reg.waiting && controllata) { mostraAvviso(reg.waiting); return 'trovata'; }
        if (navigator.onLine === false) return 'offline';
        if (reg === ATTESA) return 'attendi';          // la pagina sta ancora preparando l'app
        if (!reg) return 'non-disponibile';
        // Senza rete il controllo a volte resta appeso: dopo 8 secondi si considera "offline"
        try {
            if (await entro(reg.update(), 8000) === ATTESA) return 'offline';
        } catch (e) {
            return 'offline';
        }
        // Alla prima installazione non c'è niente da aggiornare: il sito si sta solo salvando sul telefono
        if (!controllata) return 'aggiornata';
        if (reg.waiting) { mostraAvviso(reg.waiting); return 'trovata'; }
        if (reg.installing) { seguiInstallazione(reg.installing); return 'trovata'; }
        return 'aggiornata';
    };

    async function avvia() {
        try {
            const reg = await navigator.serviceWorker.register(new URL('sw.js', cartella).href, {
                scope: cartella.href,
                updateViaCache: 'none' // sw.js si controlla sempre in rete, mai dalla cache del browser
            });
            segnaPronta(reg);
            if (reg.waiting && navigator.serviceWorker.controller) mostraAvviso(reg.waiting);
            else if (reg.installing) seguiInstallazione(reg.installing);
            reg.addEventListener('updatefound', () => seguiInstallazione(reg.installing));
            // Si cerca una versione nuova quando si torna sulla pagina, quando torna la connessione e ogni 30 minuti
            const cerca = () => reg.update().catch(() => {});
            document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') cerca(); });
            window.addEventListener('online', cerca);
            setInterval(cerca, 30 * 60 * 1000);
        } catch (e) {
            // Senza connessione la registrazione non riesce a scaricare sw.js: si usa quella già installata.
            // Se non c'è (es. navigazione privata) il sito funziona lo stesso, solo online.
            const esistente = await navigator.serviceWorker.getRegistration(cartella.href).catch(() => null);
            segnaPronta(esistente || null);
        }
    }

    if (document.readyState === 'complete') avvia();
    else window.addEventListener('load', avvia);
})(window.RG = window.RG || {});
