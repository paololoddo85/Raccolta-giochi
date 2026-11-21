/*
 * CHI GIOCA STASERA - nomi di giocatori e squadre condivisi tra i giochi.
 * Un unico elenco di 6 posti (chiave rg-comune-squadre). Ogni gioco usa i primi N:
 * Cinquina i primi 2 come nomi delle squadre, Pellicola e Ritornello fino a 4, Giradischi fino a 6.
 *
 *   RG.squadre.tutti()                 i 6 posti ('' se vuoto)
 *   RG.squadre.nomi(n, predefiniti)    n nomi, con i predefiniti al posto dei vuoti
 *   RG.squadre.salva(nomi, predefiniti) salva i nomi scritti in un gioco
 *   RG.squadre.imposta(nomi)           sostituisce tutto l'elenco (menù della raccolta)
 */
(function (RG) {
    'use strict';
    const MAX = 6;
    const CHIAVE = 'squadre';

    function tutti() {
        const salvati = RG.archivio.comune.leggi(CHIAVE, {});
        const nomi = Array.isArray(salvati.nomi) ? salvati.nomi : [];
        return Array.from({ length: MAX }, (_, i) => (typeof nomi[i] === 'string' ? nomi[i].trim() : ''));
    }

    function nomi(n, predefiniti = []) {
        const elenco = tutti();
        return Array.from({ length: n }, (_, i) => elenco[i] || predefiniti[i] || `Giocatore ${i + 1}`);
    }

    function imposta(nuovi) {
        const elenco = Array.from({ length: MAX }, (_, i) => String(nuovi[i] ?? '').trim().slice(0, 24));
        RG.archivio.comune.scrivi(CHIAVE, { nomi: elenco, aggiornato: Date.now() });
        return elenco;
    }

    // Un nome uguale al predefinito del gioco ("Squadra A", "Cinefilo 1"…) libera il posto,
    // così non finisce come nome di un giocatore negli altri giochi.
    function salva(scritti, predefiniti = []) {
        const elenco = tutti();
        scritti.slice(0, MAX).forEach((nome, i) => {
            const v = String(nome ?? '').trim();
            elenco[i] = v && v !== predefiniti[i] ? v : '';
        });
        return imposta(elenco);
    }

    RG.squadre = { MAX, tutti, nomi, salva, imposta };
})(window.RG = window.RG || {});
