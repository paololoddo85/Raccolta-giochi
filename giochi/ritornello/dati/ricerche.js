/*
 * Ritornello - ricerche usate per pescare i brani dal catalogo online di iTunes.
 * Con la connessione si aggiungono ai brani inclusi (dati/brani.js) e allo svelamento
 * si ascolta l'anteprima vera. Senza connessione si gioca con i soli brani inclusi.
 *
 * ricerche: ricerche iTunes per categoria (le stesse chiavi del menù "Brani" del gioco).
 *           Solo successi famosi, facili da riconoscere canticchiati.
 * paroleAlbumVietate: parole intere che, nel titolo dell'ALBUM, indicano raccolte,
 *           compilation o versioni non originali.
 * paroleVersioneVietate: parole che, tra parentesi o dopo " - " nel titolo del BRANO,
 *           indicano versioni live, remix, cover…
 */
window.RITORNELLO_RICERCHE = {
    ricerche: {
        tutto: [
            "top hits 1970s", "top hits 1980s", "80s number one hits", "top hits 1990s",
            "top hits 2000s", "top hits 2010s", "top hits 2020s", "grandi successi italiani",
            "vincitori sanremo", "tormentoni estivi", "canzoni da cantare", "queen", "abba", "vasco rossi"
        ],
        italiane: [
            "grandi successi italiani", "vincitori sanremo", "tormentoni estivi italiani",
            "pop italiano anni 80", "pop italiano anni 90", "hit italiane 2010", "hit italiane 2020",
            "lucio battisti", "vasco rossi", "883", "jovanotti", "laura pausini", "eros ramazzotti",
            "adriano celentano", "mina", "lucio dalla", "ligabue", "maneskin", "mahmood"
        ],
        internazionali: [
            "top hits 1970s", "80s number one hits", "90s pop hits", "2000s pop hits",
            "2010s pop hits", "2020s pop hits", "queen", "abba", "michael jackson", "madonna",
            "the beatles", "bee gees", "dua lipa", "ed sheeran", "adele", "shakira"
        ],
        classici: [
            "60s number one hits", "70s number one hits", "70s disco hits", "80s number one hits",
            "80s pop hits", "queen", "abba", "the beatles", "michael jackson", "lucio battisti", "mina"
        ],
        '9000': [
            "90s number one hits", "90s eurodance hits", "90s pop hits", "2000s number one hits",
            "2000s pop hits", "883", "laura pausini", "spice girls", "britney spears", "backstreet boys"
        ],
        recenti: [
            "2010s top hits", "2015 top hits", "2018 top hits", "2020 top hits", "2022 top hits",
            "2024 top hits", "2025 top hits", "tormentoni estivi", "dua lipa", "the weeknd", "mahmood"
        ],
        bambini: [
            "sigle cartoni animati", "cristina d'avena", "zecchino d'oro", "canzoni disney italiano",
            "giorgio vanni", "canzoni per bambini"
        ]
    },

    paroleAlbumVietate: [
        "greatest hits", "best of", "the best", "collection", "anthology", "compilation",
        "remaster", "remastered", "deluxe", "anniversary", "expanded", "live", "in concert",
        "unplugged", "acoustic", "karaoke", "tribute", "covers", "instrumental", "dj mix",
        "essential", "essentials", "raccolta", "antologia", "megamix", "box set",
        "various artists", "now that's what i call", "festivalbar", "remixes", "playlist",
        "lullaby", "ninna nanna", "piano"
    ],

    paroleVersioneVietate: [
        "live", "remaster", "remastered", "acoustic", "unplugged", "karaoke", "instrumental",
        "remix", "mix", "radio edit", "edit", "extended", "demo", "version", "versione", "cover",
        "re-recorded", "mono", "stereo", "taylor's version", "orchestral", "sped up", "slowed",
        "lullaby", "piano"
    ]
};
