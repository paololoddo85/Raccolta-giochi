/*
 * Giradischi (prima "Hitstar") - liste usate per pescare i brani dal catalogo online di iTunes.
 * Il gioco non ha brani inclusi: per giocare serve la connessione.
 *
 * ricerche: ricerche iTunes per catalogo ("all", "rock", "italian", "7080", "9000", "modern",
 *           "napoletane"). Solo successi famosi: niente brani secondari.
 *           "napoletane": canzoni in napoletano (o di cantanti napoletani) uscite dal 1990 a oggi.
 * paroleAlbumVietate: parole intere che, nel titolo dell'ALBUM, indicano raccolte,
 *           compilation, remaster o versioni non originali.
 * paroleVersioneVietate: parole che, tra parentesi o dopo " - " nel titolo del BRANO,
 *           indicano versioni live, remix, cover…
 */
window.GIRADISCHI_DATI = {
  ricerche: {
      all: [
          "top hits 1960s", "top hits 1970s", "number one hits 70s",
          "top hits 1980s", "80s number one hits", "top hits 1990s",
          "90s pop hits", "top hits 2000s", "2000s smash hits",
          "top hits 2010s", "2010s pop hits", "top hits 2020s",
          "top hits 2024", "top hits 2025", "top hits 2026",
          "vincitori sanremo", "grandi successi italiani", "vasco rossi"
      ],
      rock: [
          "classic rock hits", "80s rock hits", "90s rock anthems",
          "2000s rock hits", "greatest rock anthems", "queen",
          "guns n roses", "nirvana", "ac dc", "bon jovi",
          "red hot chili peppers", "coldplay", "linkin park",
          "vasco rossi", "ligabue", "maneskin"
      ],
      italian: [
          "sanremo vincitori", "classici musica italiana", "pop italiano anni 80",
          "pop italiano anni 90", "pop italiano anni 2000", "hit italiane 2010",
          "hit italiane 2020", "sanremo 2024", "sanremo 2025", "sanremo 2026",
          "vasco rossi", "lucio battisti", "mina", "adriano celentano",
          "laura pausini", "eros ramazzotti", "jovanotti", "883",
          "cesare cremonini", "tiziano ferro", "marco mengoni", "mahmood"
      ],
      '7080': [
          "70s number one hits", "70s pop hits", "pop 70s", "70s disco hits", "disco 70s",
          "80s number one hits", "80s pop hits", "pop 80s", "80s synthpop hits"
      ],
      '9000': [
          "90s number one hits", "90s eurodance hits", "90s pop hits",
          "2000s number one hits", "2000s pop hits", "2000s r&b hits",
          "883", "laura pausini", "britney spears", "backstreet boys", "rihanna", "beyonce"
      ],
      modern: [
          "2010s top hits", "2015 top hits", "2018 top hits",
          "2020 top hits", "2022 top hits", "2024 top hits",
          "2025 top hits", "2026 top hits", "dua lipa", "ed sheeran", "the weeknd", "taylor swift"
      ],
      napoletane: [
          "canzoni napoletane", "napoletane anni 90", "neomelodici napoletani", "napoli canzone",
          "pino daniele", "enzo avitabile", "pietra montecorvino", "nino d'angelo", "gigi finizio",
          "franco ricciardi", "tommy riccio", "mario merola", "sal da vinci", "gigi d'alessio",
          "peppino di capri", "liberato", "geolier", "clementino", "tony colombo", "lina sastri",
          "enzo gragnaniello", "almamegretta", "99 posse", "raiz", "daniele sepe"
      ]
  },

  paroleAlbumVietate: [
      "greatest hits", "best of", "the best", "collection", "anthology", "compilation",
      "remaster", "remastered", "deluxe", "anniversary", "super deluxe", "expanded",
      "live", "in concert", "unplugged", "acoustic", "karaoke", "tribute",
      "covers", "instrumental", "mixed", "dj mix", "essential", "essentials", "gold",
      "platinum", "hits", "raccolta", "tutto", "antologia", "megamix", "box set",
      "soundtrack", "various artists", "now that's what i call", "festivalbar",
      "remixes", "the singles", "singles", "playlist", "edition"
  ],

  paroleVersioneVietate: [
      "live", "remaster", "remastered", "acoustic", "unplugged", "karaoke", "instrumental",
      "remix", "mix", "radio edit", "edit", "club mix", "extended", "demo", "commentary",
      "version", "versione", "cover", "re-recorded", "rerecorded", "mono", "stereo",
      "taylor's version", "orchestral", "sped up", "slowed"
  ]
};
