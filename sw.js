/*
 * COMBRICCOLA - service worker
 *
 * Al primo accesso salva sul telefono tutti i file del sito: dopo si gioca anche senza connessione.
 * I contenuti online dei giochi (catalogo e locandine di Pellicola, catalogo e AUDIO di Giradischi e Ritornello)
 * non passano di qui: arrivano sempre da internet e non vengono mai salvati.
 *
 * A OGNI RILASCIO:
 *   1. alza VERSIONE (es. '1' → '2'): è così che i telefoni scoprono che c'è una versione nuova;
 *   2. se hai aggiunto o tolto file, aggiorna l'elenco FILE qui sotto.
 * Quando la versione cambia, nelle pagine compare "Nuova versione disponibile — tocca per aggiornare"
 * (shared/js/aggiornamento.js). Il service worker nuovo si attiva solo dopo quel tocco.
 */
const VERSIONE = '16';
const CACHE = `combriccola-v${VERSIONE}`;

// Percorsi relativi alla cartella del sito (dove sta questo file)
const FILE = [
    './',
    'index.html',
    'menu.css',
    'menu.js',
    'manifest.webmanifest',
    'icone/apple-touch-icon.png',
    'icone/favicon-32.png',
    'icone/icona-192.png',
    'icone/icona-512.png',
    'icone/icona-maskable-512.png',

    // vecchi indirizzi (rinvio alle nuove pagine)
    'HINT_FAKE.html',
    'cinestar_il_gioco_dei_film.html',
    'hitstar_il_gioco_della_musica.html',

    // parti comuni
    'shared/js/aggiornamento.js',
    'shared/js/base.js',
    'shared/js/dialoghi.js',
    'shared/js/importa.js',
    'shared/js/migrazioni.js',
    'shared/js/partita.js',
    'shared/js/squadre.js',
    'shared/js/suoni.js',
    'shared/js/timer.js',
    'shared/stile/base.css',
    'shared/stile/font.css',
    'shared/stile/notte.css',
    'shared/stile/tailwind.css',
    'shared/stile/font/big-shoulders-display.woff2',
    'shared/stile/font/instrument-sans.woff2',
    'shared/vendor/confetti.js',

    // vecchie cartelle (rinvio a Cinquina e Giradischi)
    'giochi/hint-fake/',
    'giochi/hint-fake/index.html',
    'giochi/hitstar/',
    'giochi/hitstar/index.html',

    // Cinquina
    'giochi/cinquina/',
    'giochi/cinquina/index.html',
    'giochi/cinquina/stile.css',
    'giochi/cinquina/gioco.js',
    'giochi/cinquina/dati/carte.js',

    // Pellicola (prima CineStar; la vecchia cartella rimanda qui)
    'giochi/cinestar/',
    'giochi/cinestar/index.html',
    'giochi/pellicola/',
    'giochi/pellicola/index.html',
    'giochi/pellicola/stile.css',
    'giochi/pellicola/gioco.js',
    'giochi/pellicola/dati/film.js',

    // Giradischi
    'giochi/giradischi/',
    'giochi/giradischi/index.html',
    'giochi/giradischi/stile.css',
    'giochi/giradischi/gioco.js',
    'giochi/giradischi/icone.js',
    'giochi/giradischi/dati/ricerche.js',

    // Ritornello
    'giochi/ritornello/',
    'giochi/ritornello/index.html',
    'giochi/ritornello/stile.css',
    'giochi/ritornello/gioco.js',
    'giochi/ritornello/dati/brani.js',
    'giochi/ritornello/dati/ricerche.js'
];

const CARTELLA = new URL('./', self.location).pathname; // es. /Raccolta-giochi/

self.addEventListener('install', (evento) => {
    // cache: 'reload' scavalca la cache del browser: si salvano sempre i file appena pubblicati
    evento.waitUntil(
        caches.open(CACHE).then(cache => cache.addAll(FILE.map(f => new Request(f, { cache: 'reload' }))))
    );
});

self.addEventListener('activate', (evento) => {
    evento.waitUntil((async () => {
        const nomi = await caches.keys();
        await Promise.all(nomi.filter(n => n.startsWith('combriccola-') && n !== CACHE).map(n => caches.delete(n)));
        await self.clients.claim();
    })());
});

self.addEventListener('message', (evento) => {
    const dati = evento.data || {};
    // "Nuova versione disponibile — tocca per aggiornare"
    if (dati.tipo === 'aggiorna') self.skipWaiting();
    if (dati.tipo === 'versione' && evento.ports[0]) evento.ports[0].postMessage(VERSIONE);
});

self.addEventListener('fetch', (evento) => {
    const richiesta = evento.request;
    if (richiesta.method !== 'GET') return;
    const url = new URL(richiesta.url);
    // Solo i file del sito: tutto il resto (iTunes, anteprime audio, locandine, Wikipedia…) va in rete com'è
    if (url.origin !== self.location.origin || !url.pathname.startsWith(CARTELLA)) return;

    evento.respondWith((async () => {
        const cache = await caches.open(CACHE);
        const navigazione = richiesta.mode === 'navigate';
        const salvata = await cache.match(richiesta, { ignoreSearch: navigazione });
        if (salvata) return salvata;
        try {
            return await fetch(richiesta);
        } catch (errore) {
            // Pagina non salvata e niente connessione: si rimanda al menù, al suo indirizzo
            // (così stili e script, che hanno percorsi relativi, si trovano)
            if (navigazione && await cache.match('./')) return Response.redirect(new URL('./', self.location).href, 302);
            throw errore;
        }
    })());
});
