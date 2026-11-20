/*
 * TIMER, SCHERMO SEMPRE ACCESO E VIBRAZIONE
 *
 *   const t = new RG.Timer({ secondi: 90, ogniSecondo: rimasti => …, allaFine: () => … });
 *   t.avvia()  t.pausa()  t.riprendi()  t.ferma()
 *   t.rimasti  t.totale  t.inCorso
 *
 * Mentre il timer corre lo schermo resta acceso (Wake Lock, dove il telefono lo permette).
 * Se si cambia app e si torna, il blocco dello schermo viene richiesto di nuovo.
 *
 *   RG.schermo.tieniAcceso()  RG.schermo.permettiSpegnimento()
 *   RG.vibra(70)  RG.vibra([500, 150, 500])
 */
(function (RG) {
    'use strict';

    let blocco = null;
    let richiesto = false;

    async function tieniAcceso() {
        richiesto = true;
        try {
            if ('wakeLock' in navigator && !blocco) {
                blocco = await navigator.wakeLock.request('screen');
                blocco.addEventListener('release', () => { blocco = null; });
            }
        } catch (e) {
            blocco = null;
        }
    }

    function permettiSpegnimento() {
        richiesto = false;
        if (blocco) {
            blocco.release().catch(() => {});
            blocco = null;
        }
    }

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && richiesto) tieniAcceso();
    });

    RG.schermo = { tieniAcceso, permettiSpegnimento };

    RG.vibra = function (schema) {
        try {
            if (navigator.vibrate) navigator.vibrate(schema);
        } catch (e) {}
    };

    class Timer {
        constructor({ secondi = 60, ogniSecondo = null, allaFine = null } = {}) {
            this.totale = secondi;
            this.rimasti = secondi;
            this.inCorso = false;
            this._ogniSecondo = ogniSecondo;
            this._allaFine = allaFine;
            this._intervallo = null;
        }

        avvia(secondi = this.totale) {
            this.ferma();
            this.totale = secondi;
            this.rimasti = secondi;
            this.riprendi();
        }

        riprendi() {
            if (this.inCorso || this.rimasti <= 0) return;
            this.inCorso = true;
            tieniAcceso();
            this._intervallo = setInterval(() => this._tic(), 1000);
        }

        pausa() {
            this.ferma();
        }

        ferma() {
            this.inCorso = false;
            clearInterval(this._intervallo);
            this._intervallo = null;
            permettiSpegnimento();
        }

        _tic() {
            this.rimasti--;
            if (this._ogniSecondo) this._ogniSecondo(this.rimasti);
            if (this.rimasti <= 0) {
                this.ferma();
                if (this._allaFine) this._allaFine();
            }
        }
    }

    RG.Timer = Timer;
})(window.RG = window.RG || {});
