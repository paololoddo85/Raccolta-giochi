/*
 * MIGRAZIONE DEI DATI DELLE VECCHIE PAGINE
 * Copia (una volta sola, senza cancellare niente) i dati salvati dalle vecchie
 * pagine singole nelle chiavi nuove rg-<gioco>-<nome>.
 * Lo usano sia il menù sia i giochi: chi si apre per primo fa la copia.
 *
 *   RG.migrazioni.esegui('hintfake')   RG.migrazioni.tutte()
 */
(function (RG) {
    'use strict';

    const MAPPE = {
        // Vecchia pagina HINT_FAKE.html
        hintfake: {
            'hintfake-impostazioni': 'impostazioni',
            'hintfake-carte-uscite-bambini': 'carte-uscite-bambini',
            'hintfake-carte-uscite-adulti': 'carte-uscite-adulti',
            'hintfake-carte-importate': 'carte-importate',
            'hintfake-partita-in-corso': 'partita'
        },
        // Vecchia pagina cinestar_il_gioco_dei_film.html
        cinestar: {
            'cinestar_played_movies_v1': 'film-giocati'
        },
        // Vecchia pagina hitstar_il_gioco_della_musica.html
        hitstar: {
            'hitstar_played_songs_v1': 'brani-giocati'
        }
    };

    function esegui(gioco) {
        return MAPPE[gioco] ? RG.archivio.migra(gioco, MAPPE[gioco]) : 0;
    }

    function tutte() {
        return Object.keys(MAPPE).reduce((n, g) => n + esegui(g), 0);
    }

    RG.migrazioni = { MAPPE, esegui, tutte };
})(window.RG = window.RG || {});
