/*
 * COMBRICCOLA - base comune a tutti i giochi.
 * Crea lo spazio globale RG e alcune utilità. Va caricato per primo.
 *
 *   RG.esc(testo)        testo sicuro da inserire nell'HTML
 *   RG.mescola(lista)    copia mescolata della lista
 *   RG.hash(testo)       piccolo hash stabile (base 36)
 *   RG.copia(valore)     copia profonda di dati semplici (JSON)
 *   RG.archivio          memoria sul dispositivo (localStorage) con chiavi a prefisso
 */
(function (RG) {
    'use strict';

    RG.esc = function (testo) {
        return String(testo ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    };

    RG.mescola = function (lista) {
        const a = [...lista];
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    };

    RG.hash = function (testo) {
        let h = 5381;
        for (let i = 0; i < testo.length; i++) h = ((h << 5) + h + testo.charCodeAt(i)) >>> 0;
        return h.toString(36);
    };

    RG.copia = function (valore) {
        return valore === undefined ? undefined : JSON.parse(JSON.stringify(valore));
    };

    /*
     * MEMORIA SUL DISPOSITIVO
     * Tutte le chiavi della raccolta iniziano con "rg-":
     *   rg-<gioco>-<nome>   dati di un gioco (es. rg-hintfake-partita)
     *   rg-comune-<nome>    dati condivisi (squadre, impostazioni)
     * Il dominio paololoddo85.github.io è condiviso con gli altri siti dello stesso
     * account: il prefisso evita di pestarsi i piedi.
     */
    const PREFISSO = 'rg';

    function leggi(chiave, predefinito) {
        try {
            const grezzo = localStorage.getItem(chiave);
            return grezzo ? JSON.parse(grezzo) : predefinito;
        } catch (e) {
            return predefinito;
        }
    }

    function scrivi(chiave, valore) {
        try {
            localStorage.setItem(chiave, JSON.stringify(valore));
            return true;
        } catch (e) {
            return false;
        }
    }

    function togli(chiave) {
        try { localStorage.removeItem(chiave); } catch (e) {}
    }

    function spazio(nome) {
        const p = `${PREFISSO}-${nome}-`;
        return {
            chiave: n => p + n,
            leggi: (n, predefinito) => leggi(p + n, predefinito),
            scrivi: (n, valore) => scrivi(p + n, valore),
            togli: n => togli(p + n)
        };
    }

    /*
     * Copia i dati salvati con i vecchi nomi nelle chiavi nuove, una volta sola.
     * Le vecchie chiavi restano dove sono (copia di sicurezza) e una chiave già
     * presente non viene mai sovrascritta.
     *   RG.archivio.migra('hintfake', { 'hintfake-partita-in-corso': 'partita' })
     */
    function migra(nomeSpazio, mappa) {
        const segno = `${PREFISSO}-${nomeSpazio}-migrazione`;
        try {
            if (localStorage.getItem(segno) !== null) return 0;
        } catch (e) {
            return 0;
        }
        let copiate = 0;
        Object.entries(mappa).forEach(([vecchia, nuova]) => {
            try {
                const valore = localStorage.getItem(vecchia);
                const destinazione = `${PREFISSO}-${nomeSpazio}-${nuova}`;
                if (valore !== null && localStorage.getItem(destinazione) === null) {
                    localStorage.setItem(destinazione, valore);
                    copiate++;
                }
            } catch (e) {}
        });
        scrivi(segno, { quando: Date.now(), copiate });
        return copiate;
    }

    RG.archivio = { leggi, scrivi, togli, spazio, migra, comune: spazio('comune') };
})(window.RG = window.RG || {});
