/*
 * CHI GIOCA STASERA - nomi di giocatori e squadre condivisi tra i giochi.
 * Un unico elenco di 6 posti (chiave rg-comune-squadre). Ogni gioco usa i primi N:
 * Cinquina i primi 2 come nomi delle squadre, Pellicola e Ritornello fino a 4, Giradischi fino a 6.
 * Ogni volta che un gioco parte, i nomi veri che usa vengono contati: così il menù
 * propone per primi chi gioca più spesso.
 *
 *   RG.squadre.tutti()                 i 6 posti ('' se vuoto)
 *   RG.squadre.nomi(n, predefiniti)    n nomi, con i predefiniti al posto dei vuoti
 *   RG.squadre.salva(nomi, predefiniti) salva i nomi scritti in un gioco e li conta
 *   RG.squadre.imposta(nomi)           sostituisce tutto l'elenco (menù della raccolta)
 *   RG.squadre.frequenti(n)            i n nomi che hanno giocato più spesso, non ancora nell'elenco
 *   RG.squadre.aggiungi(nome)          mette un nome nel primo posto libero (false se pieno)
 */
(function (RG) {
    'use strict';
    const MAX = 6;
    const CHIAVE = 'squadre';
    const MAX_CONTEGGI = 80; // oltre, si tengono solo i nomi che hanno giocato più volte

    function leggi() {
        const salvati = RG.archivio.comune.leggi(CHIAVE, {});
        return {
            nomi: Array.isArray(salvati.nomi) ? salvati.nomi : [],
            // chiave = nome in minuscolo; valore = { nome (come è scritto), volte }
            conteggi: salvati.conteggi && typeof salvati.conteggi === 'object' ? salvati.conteggi : {}
        };
    }

    function tutti() {
        const nomi = leggi().nomi;
        return Array.from({ length: MAX }, (_, i) => (typeof nomi[i] === 'string' ? nomi[i].trim() : ''));
    }

    function nomi(n, predefiniti = []) {
        const elenco = tutti();
        return Array.from({ length: n }, (_, i) => elenco[i] || predefiniti[i] || `Giocatore ${i + 1}`);
    }

    function scrivi(elenco, conteggi) {
        RG.archivio.comune.scrivi(CHIAVE, { nomi: elenco, conteggi, aggiornato: Date.now() });
        return elenco;
    }

    function imposta(nuovi) {
        const elenco = Array.from({ length: MAX }, (_, i) => String(nuovi[i] ?? '').trim().slice(0, 24));
        return scrivi(elenco, leggi().conteggi);
    }

    // Un nome uguale al predefinito del gioco ("Squadra A", "Cinefilo 1"…) libera il posto,
    // così non finisce come nome di un giocatore negli altri giochi.
    function salva(scritti, predefiniti = []) {
        const dati = leggi();
        const elenco = tutti();
        scritti.slice(0, MAX).forEach((nome, i) => {
            const v = String(nome ?? '').trim();
            elenco[i] = v && v !== predefiniti[i] ? v : '';
        });
        // conta una partita per ogni nome vero che gioca
        const conteggi = dati.conteggi;
        elenco.filter(Boolean).forEach(nome => {
            const chiave = nome.toLocaleLowerCase('it');
            const voce = conteggi[chiave] || { nome, volte: 0 };
            voce.nome = nome;
            voce.volte += 1;
            conteggi[chiave] = voce;
        });
        const chiavi = Object.keys(conteggi);
        if (chiavi.length > MAX_CONTEGGI) {
            chiavi.sort((a, b) => conteggi[a].volte - conteggi[b].volte)
                .slice(0, chiavi.length - MAX_CONTEGGI)
                .forEach(k => delete conteggi[k]);
        }
        return scrivi(elenco, conteggi);
    }

    function frequenti(n = 8) {
        const presenti = new Set(tutti().filter(Boolean).map(x => x.toLocaleLowerCase('it')));
        return Object.entries(leggi().conteggi)
            .filter(([chiave, voce]) => !presenti.has(chiave) && voce && typeof voce.nome === 'string')
            .sort((a, b) => b[1].volte - a[1].volte || a[1].nome.localeCompare(b[1].nome, 'it'))
            .slice(0, n)
            .map(([, voce]) => voce.nome);
    }

    function aggiungi(nome) {
        const elenco = tutti();
        const posto = elenco.indexOf('');
        if (posto < 0) return false;
        elenco[posto] = String(nome ?? '').trim().slice(0, 24);
        imposta(elenco);
        return true;
    }

    RG.squadre = { MAX, tutti, nomi, salva, imposta, frequenti, aggiungi };
})(window.RG = window.RG || {});
