/*
 * IMPORT DI PACCHETTI DI CARTE / CONTENUTI
 *
 *   RG.importa.leggiTesto(testo)   legge una lista JSON incollata (anche dentro ```json … ```,
 *                                   con testo prima o dopo, oppure { "carte": [...] }).
 *                                   Restituisce un array o null.
 *   RG.importa.unisci({ righe, normalizza, chiave, esistenti, conId })
 *                                   normalizza ogni riga, salta doppie e incomplete.
 *                                   Restituisce { nuove, aggiunte, doppie, invalide }.
 *   RG.importa.copiaTesto(testo, areaDiRiserva)
 *                                   copia negli appunti; se non si può, mostra il testo
 *                                   nell'area di riserva da copiare a mano. Promise<boolean>.
 */
(function (RG) {
    'use strict';

    function leggiTesto(testo, contenitori = ['carte', 'cards', 'film', 'brani', 'items']) {
        const t = String(testo || '').trim().replace(/^```[a-z]*\s*/i, '').replace(/```\s*$/, '').trim();
        let dati;
        try {
            dati = JSON.parse(t);
        } catch (e) {
            const a = t.indexOf('['), b = t.lastIndexOf(']');
            if (a === -1 || b <= a) return null;
            try { dati = JSON.parse(t.slice(a, b + 1)); } catch (e2) { return null; }
        }
        if (dati && !Array.isArray(dati)) {
            const nome = contenitori.find(k => Array.isArray(dati[k]));
            dati = nome ? dati[nome] : null;
        }
        return Array.isArray(dati) ? dati : null;
    }

    function unisci({ righe, normalizza, chiave, esistenti = [], conId }) {
        const note = new Set(esistenti.map(chiave));
        const nuove = [];
        let doppie = 0, invalide = 0;
        righe.forEach(r => {
            const c = normalizza(r);
            if (!c) { invalide++; return; }
            const k = chiave(c);
            if (note.has(k)) { doppie++; return; }
            note.add(k);
            nuove.push(conId ? conId(c, k) : c);
        });
        return { nuove, aggiunte: nuove.length, doppie, invalide };
    }

    async function copiaTesto(testo, areaDiRiserva) {
        let ok = false;
        try {
            await navigator.clipboard.writeText(testo);
            ok = true;
        } catch (e) {
            if (areaDiRiserva) {
                areaDiRiserva.value = testo;
                areaDiRiserva.classList.remove('hidden');
                areaDiRiserva.hidden = false;
                areaDiRiserva.select();
                try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
            }
        }
        if (areaDiRiserva) {
            if (ok) {
                areaDiRiserva.classList.add('hidden');
            } else {
                areaDiRiserva.value = testo;
                areaDiRiserva.classList.remove('hidden');
                areaDiRiserva.hidden = false;
            }
        }
        return ok;
    }

    RG.importa = { leggiTesto, unisci, copiaTesto };
})(window.RG = window.RG || {});
