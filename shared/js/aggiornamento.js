/*
 * APP INSTALLABILE E AGGIORNAMENTI
 * Registra il service worker (sw.js nella cartella del sito) e, quando è pronta una versione
 * nuova, mostra in alto "Nuova versione disponibile — tocca per aggiornare".
 * Toccando, la versione nuova si attiva e la pagina si ricarica: la partita in corso
 * riparte da sola (vedi RG.partita.ricaricata).
 *
 *   RG.versioneApp()   Promise con il numero di versione installata (o null)
 *
 * Funziona da qualsiasi pagina: la cartella del sito si ricava dalla posizione di questo file.
 */
(function (RG) {
    'use strict';

    const questoFile = document.currentScript && document.currentScript.src;
    RG.versioneApp = () => Promise.resolve(null);
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

    function mostraAvviso(lavoratore) {
        if (document.getElementById('rg-aggiorna')) return;
        const barra = document.createElement('div');
        barra.id = 'rg-aggiorna';
        barra.className = 'rg-aggiorna';
        barra.setAttribute('role', 'status');
        barra.innerHTML = `
            <button type="button" class="rg-aggiorna-tocca"><strong>Nuova versione disponibile</strong> — tocca per aggiornare</button>
            <button type="button" class="rg-aggiorna-dopo" aria-label="Più tardi">Dopo</button>`;
        barra.querySelector('.rg-aggiorna-tocca').addEventListener('click', (e) => {
            aggiornamentoChiesto = true;
            e.currentTarget.disabled = true;
            e.currentTarget.textContent = 'Aggiornamento…';
            lavoratore.postMessage({ tipo: 'aggiorna' });
        });
        barra.querySelector('.rg-aggiorna-dopo').addEventListener('click', () => barra.remove());
        document.body.appendChild(barra);
    }

    async function avvia() {
        try {
            const reg = await navigator.serviceWorker.register(new URL('sw.js', cartella).href, {
                scope: cartella.href,
                updateViaCache: 'none' // sw.js si controlla sempre in rete, mai dalla cache del browser
            });
            const controlla = () => {
                // Avviso solo se c'era già una versione al lavoro (non alla prima installazione)
                if (reg.waiting && navigator.serviceWorker.controller) mostraAvviso(reg.waiting);
            };
            controlla();
            reg.addEventListener('updatefound', () => {
                const nuovo = reg.installing;
                if (nuovo) nuovo.addEventListener('statechange', () => { if (nuovo.state === 'installed') controlla(); });
            });
            // Si cerca una versione nuova quando si torna sulla pagina e ogni 30 minuti
            const cerca = () => reg.update().catch(() => {});
            document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') cerca(); });
            setInterval(cerca, 30 * 60 * 1000);
        } catch (e) {
            // Service worker non disponibile (es. navigazione privata): il sito funziona lo stesso, solo online
        }
    }

    if (document.readyState === 'complete') avvia();
    else window.addEventListener('load', avvia);
})(window.RG = window.RG || {});
