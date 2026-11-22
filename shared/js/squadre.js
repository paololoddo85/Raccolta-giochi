/*
 * CHI GIOCA STASERA - nomi di giocatori e squadre condivisi tra i giochi.
 * Un unico elenco di 6 posti (chiave rg-comune-squadre). Ogni gioco usa i primi N:
 * Cinquina i primi 2 come nomi delle squadre, Pellicola e Ritornello fino a 4, Giradischi fino a 6.
 * Di default tutti i nomi giocano. Toccando un nome nel menù lo si esclude per stasera
 * (campo "esclusi": indici dei posti); i giochi ricevono solo i nomi che giocano, in ordine.
 * Ogni volta che un gioco parte, i nomi veri che usa vengono contati: così il menù
 * propone per primi chi gioca più spesso.
 *
 *   RG.squadre.tutti()                 i 6 posti ('' se vuoto)
 *   RG.squadre.posti()                 i 6 posti come { indice, nome, attivo } (menù della raccolta)
 *   RG.squadre.alterna(indice)         gioca / non gioca stasera (false se il posto è vuoto)
 *   RG.squadre.nomi(n, predefiniti)    n nomi di chi gioca, con i predefiniti al posto dei mancanti
 *   RG.squadre.salva(nomi, predefiniti) salva i nomi scritti in un gioco e li conta
 *   RG.squadre.imposta(nomi)           sostituisce tutto l'elenco (menù della raccolta)
 *   RG.squadre.frequenti(n)            i n nomi che hanno giocato più spesso, non ancora nell'elenco
 *   RG.squadre.aggiungi(nome)          mette un nome nel primo posto libero, che gioca (false se pieno)
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
            conteggi: salvati.conteggi && typeof salvati.conteggi === 'object' ? salvati.conteggi : {},
            // posti esclusi per stasera (indici); gli altri nomi giocano
            esclusi: Array.isArray(salvati.esclusi) ? salvati.esclusi.filter(i => Number.isInteger(i) && i >= 0 && i < MAX) : []
        };
    }

    function tutti() {
        const nomi = leggi().nomi;
        return Array.from({ length: MAX }, (_, i) => (typeof nomi[i] === 'string' ? nomi[i].trim() : ''));
    }

    // Posti con un nome che giocano stasera, in ordine
    function indiciAttivi(elenco, esclusi) {
        return elenco.map((n, i) => (n && !esclusi.includes(i) ? i : -1)).filter(i => i >= 0);
    }

    function posti() {
        const dati = leggi();
        const elenco = tutti();
        return elenco.map((nome, indice) => ({ indice, nome, attivo: Boolean(nome) && !dati.esclusi.includes(indice) }));
    }

    function nomi(n, predefiniti = []) {
        const dati = leggi();
        const elenco = tutti();
        const giocano = indiciAttivi(elenco, dati.esclusi).map(i => elenco[i]);
        return Array.from({ length: n }, (_, i) => giocano[i] || predefiniti[i] || `Giocatore ${i + 1}`);
    }

    // Un posto che si svuota o cambia nome non porta con sé l'esclusione: il nome nuovo gioca.
    function scrivi(vecchi, elenco, dati) {
        const esclusi = dati.esclusi.filter(i => elenco[i] && elenco[i] === vecchi[i]);
        RG.archivio.comune.scrivi(CHIAVE, { nomi: elenco, conteggi: dati.conteggi, esclusi, aggiornato: Date.now() });
        return elenco;
    }

    function imposta(nuovi) {
        const vecchi = tutti();
        const elenco = Array.from({ length: MAX }, (_, i) => String(nuovi[i] ?? '').trim().slice(0, 24));
        return scrivi(vecchi, elenco, leggi());
    }

    function alterna(indice) {
        const vecchi = tutti();
        if (!vecchi[indice]) return false;
        const dati = leggi();
        dati.esclusi = dati.esclusi.includes(indice)
            ? dati.esclusi.filter(i => i !== indice)
            : [...dati.esclusi, indice];
        scrivi(vecchi, vecchi, dati);
        return true;
    }

    // I nomi che il gioco ha usato: il primo va nel primo posto che gioca, il secondo nel secondo…
    // Un nome uguale al predefinito del gioco ("Squadra A", "Cinefilo 1"…) libera il posto,
    // così non finisce come nome di un giocatore negli altri giochi.
    // Chi nel gioco compare oltre i posti che giocano (nome nuovo) va nel primo posto libero.
    function salva(scritti, predefiniti = []) {
        const dati = leggi();
        const vecchi = tutti();
        const elenco = [...vecchi];
        const attivi = indiciAttivi(vecchi, dati.esclusi);
        const usati = scritti.slice(0, MAX).map((nome, k) => {
            const v = String(nome ?? '').trim();
            return v && v !== predefiniti[k] ? v : '';
        });
        usati.forEach((v, k) => {
            if (k < attivi.length) {
                elenco[attivi[k]] = v;
            } else if (v) {
                const gia = elenco.findIndex(n => n.toLocaleLowerCase('it') === v.toLocaleLowerCase('it'));
                if (gia >= 0) {
                    dati.esclusi = dati.esclusi.filter(i => i !== gia);
                } else {
                    const libero = elenco.indexOf('');
                    if (libero >= 0) elenco[libero] = v;
                }
            }
        });
        // conta una partita per ogni nome vero che ha giocato
        const conteggi = dati.conteggi;
        usati.filter(Boolean).forEach(nome => {
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
        return scrivi(vecchi, elenco, dati);
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

    RG.squadre = { MAX, tutti, posti, alterna, nomi, salva, imposta, frequenti, aggiungi };
})(window.RG = window.RG || {});
