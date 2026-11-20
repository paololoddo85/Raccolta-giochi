/*
 * FINESTRE DI CONFERMA E NOTIFICHE DENTRO L'APP
 * Mai confirm() o alert() del browser: in alcune anteprime sono bloccati.
 *
 *   RG.toast('Partita salvata')                    notifica breve
 *   RG.toast('Connessione assente', 'errore')      tipi: info, successo, errore, avviso
 *   RG.conferma({ titolo, testo, ok: 'Elimina', pericolo: true }).then(si => …)
 *
 * L'aspetto segue le variabili --rg-* del gioco (vedi shared/stile/base.css).
 */
(function (RG) {
    'use strict';

    function contenitoreToast() {
        let box = document.getElementById('rg-toast');
        if (!box) {
            box = document.createElement('div');
            box.id = 'rg-toast';
            box.className = 'rg-toast-pila';
            box.setAttribute('aria-live', 'polite');
            box.setAttribute('role', 'status');
            document.body.appendChild(box);
        }
        return box;
    }

    RG.toast = function (messaggio, tipo = 'info', durata = 3200) {
        const box = contenitoreToast();
        const t = document.createElement('div');
        t.className = `rg-toast rg-toast-${tipo}`;
        t.textContent = messaggio;
        box.appendChild(t);
        // Al massimo 2 notifiche insieme: le più vecchie spariscono
        while (box.children.length > 2) box.firstElementChild.remove();
        requestAnimationFrame(() => t.classList.add('is-visibile'));
        setTimeout(() => {
            t.classList.remove('is-visibile');
            setTimeout(() => t.remove(), 300);
        }, durata);
    };

    let finestra = null;
    let inAttesa = null;
    let focusPrecedente = null;

    function creaFinestra() {
        finestra = document.createElement('div');
        finestra.id = 'rg-conferma';
        finestra.className = 'rg-velo';
        finestra.hidden = true;
        finestra.innerHTML = `
            <div class="rg-finestra" role="alertdialog" aria-modal="true" aria-labelledby="rg-conferma-titolo" aria-describedby="rg-conferma-testo">
                <h2 id="rg-conferma-titolo" class="rg-finestra-titolo"></h2>
                <p id="rg-conferma-testo" class="rg-finestra-testo"></p>
                <div class="rg-finestra-azioni">
                    <button type="button" class="rg-pulsante rg-pulsante-tenue" data-risposta="no"></button>
                    <button type="button" class="rg-pulsante rg-pulsante-forte" data-risposta="si"></button>
                </div>
            </div>`;
        finestra.addEventListener('click', (e) => {
            const b = e.target.closest('[data-risposta]');
            if (b) rispondi(b.dataset.risposta === 'si');
            else if (e.target === finestra) rispondi(false);
        });
        document.addEventListener('keydown', (e) => {
            if (!finestra.hidden && e.key === 'Escape') rispondi(false);
        });
        document.body.appendChild(finestra);
    }

    function rispondi(si) {
        if (!finestra || finestra.hidden) return;
        finestra.hidden = true;
        const risolvi = inAttesa;
        inAttesa = null;
        if (focusPrecedente && document.contains(focusPrecedente)) {
            try { focusPrecedente.focus({ preventScroll: true }); } catch (e) {}
        }
        if (risolvi) risolvi(si);
    }

    RG.conferma = function ({ titolo = 'Sei sicuro?', testo = '', ok = 'Conferma', annulla = 'Annulla', pericolo = false } = {}) {
        if (!finestra) creaFinestra();
        if (inAttesa) rispondi(false);
        focusPrecedente = document.activeElement;
        finestra.querySelector('#rg-conferma-titolo').textContent = titolo;
        const p = finestra.querySelector('#rg-conferma-testo');
        p.textContent = testo;
        p.hidden = !testo;
        finestra.querySelector('[data-risposta="no"]').textContent = annulla;
        const si = finestra.querySelector('[data-risposta="si"]');
        si.textContent = ok;
        si.classList.toggle('rg-pulsante-pericolo', pericolo);
        finestra.hidden = false;
        si.focus({ preventScroll: true });
        return new Promise(risolvi => { inAttesa = risolvi; });
    };
})(window.RG = window.RG || {});
