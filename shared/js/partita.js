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
 *
 * Chiave usata: rg-<gioco>-partita
 */
(function (RG) {
    'use strict';

    function crea(gioco, { versione = 1, valida = () => true, chiave = 'partita' } = {}) {
        const archivio = RG.archivio.spazio(gioco);
        return {
            chiave: archivio.chiave(chiave),
            salva(dati) {
                return archivio.scrivi(chiave, { ...dati, v: versione, savedAt: Date.now() });
            },
            leggi() {
                const d = archivio.leggi(chiave, null);
                if (!d || d.v !== versione) return null;
                try {
                    return valida(d) ? d : null;
                } catch (e) {
                    return null;
                }
            },
            cancella() {
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

    RG.partita = { crea, quando, riquadro, istantanea: RG.copia };
})(window.RG = window.RG || {});
