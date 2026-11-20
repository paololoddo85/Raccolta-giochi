/*
 * SALVATAGGIO E RIPRESA DELLA PARTITA, ANNULLA ULTIMO TURNO
 *
 *   const salvataggio = RG.partita.crea('hintfake', { versione: 1, valida: dati => … });
 *   salvataggio.salva({ …stato… })   aggiunge v (versione) e savedAt (quando)
 *   salvataggio.leggi()              i dati, oppure null se assenti o non validi
 *   salvataggio.cancella()
 *
 *   RG.partita.istantanea(stato)     copia profonda da tenere per "Annulla ultimo turno"
 *
 *   RG.partita.riquadro(elemento, {  riquadro "Partita in corso" con Riprendi / Scarta
 *       riassunto, dettaglio, alRiprendi, alloScarto })
 *   RG.partita.quando(savedAt)       "20 nov, 21:15"
 *   RG.partita.ricaricata()          true se la pagina è stata ricaricata (anche dal telefono,
 *                                    dopo averla chiusa in sottofondo): si torna subito in partita
 *
 * Chiave usata: rg-<gioco>-partita
 */
(function (RG) {
    'use strict';

    function crea(gioco, { versione = 1, valida = () => true, chiave = 'partita' } = {}) {
        const archivio = RG.archivio.spazio(gioco);
        let conPartita = false; // questa pagina ha letto o scritto una partita salvata
        let azzerata = false;  // la partita è stata azzerata da un'altra pagina: niente più salvataggi qui
        // Tornando a questa pagina con "indietro" il browser può ridarla dalla memoria così com'era:
        // se nel frattempo la partita è stata azzerata dal menù, si ricarica la pagina pulita
        // (altrimenti il prossimo salvataggio rimetterebbe la partita cancellata).
        window.addEventListener('pageshow', (e) => {
            if (e.persisted && conPartita && archivio.leggi(chiave, null) === null) {
                azzerata = true; // anche il salvataggio automatico mentre la pagina si chiude non deve rimetterla
                location.reload();
            }
        });
        return {
            chiave: archivio.chiave(chiave),
            salva(dati) {
                if (azzerata) return false;
                conPartita = true;
                return archivio.scrivi(chiave, { ...dati, v: versione, savedAt: Date.now() });
            },
            leggi() {
                const d = archivio.leggi(chiave, null);
                if (!d || d.v !== versione) return null;
                conPartita = true;
                try {
                    return valida(d) ? d : null;
                } catch (e) {
                    return null;
                }
            },
            cancella() {
                conPartita = false;
                archivio.togli(chiave);
            }
        };
    }

    function quando(savedAt) {
        return new Date(savedAt).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    }

    function riquadro(elemento, opzioni) {
        if (!elemento) return;
        if (!opzioni) {
            elemento.hidden = true;
            elemento.innerHTML = '';
            return;
        }
        const { titolo = 'Partita in corso', riassunto = '', dettaglio = '', alRiprendi, alloScarto } = opzioni;
        elemento.hidden = false;
        elemento.classList.add('rg-riprendi');
        elemento.innerHTML = `
            <div class="rg-riprendi-titolo">${RG.esc(titolo)}</div>
            <div class="rg-riprendi-riassunto">${RG.esc(riassunto)}</div>
            ${dettaglio ? `<div class="rg-riprendi-dettaglio">${RG.esc(dettaglio)}</div>` : ''}
            <div class="rg-riprendi-azioni">
                <button type="button" class="rg-pulsante rg-pulsante-forte" data-azione="riprendi">Riprendi</button>
                <button type="button" class="rg-pulsante rg-pulsante-tenue" data-azione="scarta">Scarta</button>
            </div>`;
        elemento.querySelector('[data-azione="riprendi"]').onclick = () => alRiprendi && alRiprendi();
        elemento.querySelector('[data-azione="scarta"]').onclick = () => alloScarto && alloScarto();
    }

    function ricaricata() {
        try {
            if (document.wasDiscarded) return true;
            const nav = performance.getEntriesByType('navigation')[0];
            if (nav) return nav.type === 'reload';
            return performance.navigation && performance.navigation.type === 1;
        } catch (e) {
            return false;
        }
    }

    RG.partita = { crea, quando, riquadro, ricaricata, istantanea: RG.copia };
})(window.RG = window.RG || {});
