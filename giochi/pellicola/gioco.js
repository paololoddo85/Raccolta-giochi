/*
 * Pellicola (prima "CineStar") - logica del gioco.
 * I film stanno in dati/film.js; le parti comuni (memoria, nomi, finestre, notifiche,
 * salvataggio) arrivano da shared/js/ tramite l'oggetto globale RG.
 */
const MOVIES_DATABASE = window.CINESTAR_DATI.film;
const TITLE_ALIASES = window.CINESTAR_DATI.alias;

RG.migrazioni.esegui('cinestar');
const ARCHIVIO = RG.archivio.spazio('cinestar');

/**
 * ============================================================================
 * CATEGORIE / EPOCHE
 * ============================================================================
 */
const ERA_RANGES = {
  all: [1950, 2026],
  c5060: [1950, 1969],
  c7080: [1970, 1989],
  c90: [1990, 1999],
  c2000: [2000, 2009],
  recent: [2010, 2026],
  italian: [1950, 2026]
};

function eraMatches(movie, era) {
  const [minY, maxY] = ERA_RANGES[era] || ERA_RANGES.all;
  if (movie.year < minY || movie.year > maxY) return false;
  if (era === 'italian') return movie.category === 'italian';
  return true;
}

/**
 * ============================================================================
 * ESPANSIONE DINAMICA CATALOGO LIVE (iTunes Movies Store JSONP, store IT e US)
 * ============================================================================
 */
const LIVE_MOVIE_QUERIES = { ...window.CINESTAR_DATI.ricercheLive };
LIVE_MOVIE_QUERIES.all = Array.from(new Set([
  ...LIVE_MOVIE_QUERIES.c5060, ...LIVE_MOVIE_QUERIES.c7080, ...LIVE_MOVIE_QUERIES.c90,
  ...LIVE_MOVIE_QUERIES.c2000, ...LIVE_MOVIE_QUERIES.recent, ...LIVE_MOVIE_QUERIES.italian
]));

const ITALIAN_QUERY_RE = /Fellini|Leone|Sorrentino|Benigni|Tornatore|Garrone|Moretti|Scola|Monicelli|Risi|Visconti|Argento|Salvatores|Bellocchio|Guadagnino|Cortellesi|Troisi|Verdone|Zalone|Giacomo|De Sica|Antonioni/i;

/**
 * ============================================================================
 * UTILITÀ
 * ============================================================================
 */
const esc = RG.esc;

function normalizeTitle(str) {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripArticles(s) {
  return s.replace(/^(il|lo|la|l|i|gli|le|un|uno|una|the|a|an)\s+/i, '').trim();
}

function movieKey(movie) {
  return `${normalizeTitle(movie.originalTitle)}__${movie.year}`;
}

const shuffleArray = RG.mescola;

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Distanza di modifica che conta anche lo scambio di due lettere vicine come 1 errore
function editDistance(a, b) {
  if (a === b) return 0;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

/**
 * ============================================================================
 * STORICO FILM GIÀ GIOCATI (localStorage)
 * ============================================================================
 */
// rg-cinestar-film-giocati (prima: cinestar_played_movies_v1)
function getPlayedMoviesHistory() {
  const list = ARCHIVIO.leggi('film-giocati', []);
  return new Set(Array.isArray(list) ? list : []);
}
function markMovieAsPlayed(movie) {
  if (!movie) return;
  const set = getPlayedMoviesHistory();
  set.add(movieKey(movie));
  ARCHIVIO.scrivi('film-giocati', Array.from(set).slice(-600));
}

/**
 * ============================================================================
 * JSONP iTunes (search + lookup) senza blocchi CORS
 * ============================================================================
 */
// Risultati della ricerca, oppure null se il servizio non risponde (rete assente, errore o tempo scaduto)
function jsonp(baseUrl, timeoutMs = 5500) {
  return new Promise((resolve) => {
    const callbackName = `__itunesCb_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
    const script = document.createElement('script');
    let settled = false;

    const finish = (data) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (script.parentNode) script.parentNode.removeChild(script);
      // La callback resta definita come no-op: una risposta tardiva non genera errori
      window[callbackName] = () => {};
      resolve(data == null ? null : (Array.isArray(data.results) ? data.results : []));
    };

    const timer = setTimeout(() => finish(null), timeoutMs);
    window[callbackName] = (data) => finish(data);
    script.onerror = () => finish(null);
    script.src = `${baseUrl}&callback=${callbackName}`;
    document.head.appendChild(script);
  });
}

function fetchITunesJsonp(term, country = 'us', media = 'movie', entity = 'movie', limit = 10) {
  return jsonp(`https://itunes.apple.com/search?term=${encodeURIComponent(term)}&country=${country}&media=${media}&entity=${entity}&limit=${limit}`);
}

function fetchITunesLookup(id, country = 'it') {
  return jsonp(`https://itunes.apple.com/lookup?id=${encodeURIComponent(id)}&country=${country}`);
}

function cleanITunesTitle(title) {
  return (title || '').replace(/\s*\(\d{4}\)\s*$/, '').trim();
}

// Film live da iTunes. reachable: almeno una ricerca ha avuto risposta (la connessione c'è).
async function fetchLiveMoviesCatalog(eraFilter) {
  const pool = LIVE_MOVIE_QUERIES[eraFilter] || LIVE_MOVIE_QUERIES.all;
  const [minY, maxY] = ERA_RANGES[eraFilter] || ERA_RANGES.all;
  const selectedQueries = shuffleArray(pool).slice(0, 10);
  const liveMovies = [];
  const seenKeys = new Set();
  // Il telefono sa già di essere offline: inutile aspettare le ricerche
  if (navigator.onLine === false) return { movies: liveMovies, reachable: false };
  let reachable = false;

  await Promise.all(selectedQueries.map(async (q) => {
    try {
      const isIt = eraFilter === 'italian' || ITALIAN_QUERY_RE.test(q);
      const country = isIt ? 'it' : 'us';
      const results = await fetchITunesJsonp(q, country, 'movie', 'movie', 25);
      if (!results) return;
      reachable = true;

      results.forEach(item => {
        if (item.kind !== 'feature-movie' || !item.artworkUrl100 || !item.releaseDate || !item.trackName || !item.trackId) return;
        const year = parseInt(item.releaseDate.slice(0, 4), 10);
        if (isNaN(year) || year < minY || year > maxY) return;

        const titleClean = cleanITunesTitle(item.trackName);
        const dedupeKey = `${normalizeTitle(titleClean)}__${year}`;
        if (seenKeys.has(dedupeKey)) return;
        seenKeys.add(dedupeKey);

        const rawPlot = (item.longDescription || item.shortDescription || '').trim();

        liveMovies.push({
          id: `live_${item.trackId}`,
          _live: true,
          _trackId: item.trackId,
          _country: country,
          itTitle: titleClean,
          originalTitle: titleClean,
          year,
          category: isIt ? 'italian' : 'intl',
          director: item.artistName || '',
          genre: item.primaryGenreName || 'Cinema',
          cast: '',
          // Trama solo se già in italiano (store IT); per lo store US viene cercata dopo
          plot: country === 'it' && rawPlot.length >= 25 ? rawPlot : '',
          _preloadedPosterUrl: item.artworkUrl100.replace(/\/\d+x\d+bb\.(jpg|png)$/i, '/600x900bb.jpg')
        });
      });
    } catch (e) {}
  }));

  return { movies: liveMovies, reachable };
}

/**
 * ============================================================================
 * ARRICCHIMENTO FILM LIVE: titolo/trama italiani (iTunes IT) + anno, regia e cast
 * verificati su Wikidata. Se l'anno non è verificabile il film viene scartato.
 * ============================================================================
 */
const FILM_QIDS = new Set(['Q11424', 'Q202866', 'Q24869', 'Q29168811', 'Q229390', 'Q93204']);

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function wdYears(claims) {
  return (claims.P577 || [])
    .map(c => c.mainsnak?.datavalue?.value?.time)
    .filter(Boolean)
    .map(t => parseInt(t.slice(1, 5), 10))
    .filter(y => !isNaN(y));
}

function wdIds(claims, prop, max = 10) {
  return (claims[prop] || [])
    .map(c => c.mainsnak?.datavalue?.value?.id)
    .filter(Boolean)
    .slice(0, max);
}

function wdLabel(entity, langs = ['it', 'en']) {
  for (const l of langs) {
    if (entity?.labels?.[l]?.value) return entity.labels[l].value;
  }
  return '';
}

function surnameMatches(fullName, otherNames) {
  const parts = normalizeTitle(fullName).split(' ').filter(w => w.length >= 3);
  if (!parts.length) return false;
  const surname = parts[parts.length - 1];
  return normalizeTitle(otherNames).split(' ').includes(surname);
}

async function fetchWikidataFilmInfo(movie) {
  const terms = Array.from(new Set([movie.originalTitle, movie.itTitle].filter(Boolean)));
  const searchLang = movie._country === 'it' ? 'it' : 'en';

  for (const term of terms) {
    try {
      const search = await fetchJson(`https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(term)}&language=${searchLang}&uselang=${searchLang}&type=item&limit=7&format=json&origin=*`);
      const ids = (search.search || []).map(e => e.id);
      if (!ids.length) continue;

      const ent = await fetchJson(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${ids.join('|')}&props=claims|labels|descriptions|sitelinks&languages=it|en&sitefilter=itwiki&format=json&origin=*`);
      const termNorm = stripArticles(normalizeTitle(term));
      const candidates = [];

      for (const id of ids) {
        const e = ent.entities?.[id];
        if (!e || !e.claims) continue;
        const years = wdYears(e.claims);
        if (!years.length) continue;

        const desc = `${e.descriptions?.en?.value || ''} ${e.descriptions?.it?.value || ''}`.toLowerCase();
        const isFilm = wdIds(e.claims, 'P31').some(q => FILM_QIDS.has(q)) || /\bfilm\b|\bmovie\b/.test(desc);
        if (!isFilm) continue;

        const labels = [e.labels?.it?.value, e.labels?.en?.value].filter(Boolean);
        const titleMatch = labels.some(l => stripArticles(normalizeTitle(l)) === termNorm);
        if (!titleMatch) continue;

        candidates.push({
          year: Math.min(...years),
          dirIds: wdIds(e.claims, 'P57', 3),
          castIds: wdIds(e.claims, 'P161', 4),
          itLabel: e.labels?.it?.value || '',
          itwiki: e.sitelinks?.itwiki?.title || ''
        });
      }
      if (!candidates.length) continue;

      const personIds = Array.from(new Set(candidates.flatMap(c => [...c.dirIds, ...c.castIds]))).slice(0, 50);
      let people = {};
      if (personIds.length) {
        const p = await fetchJson(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${personIds.join('|')}&props=labels&languages=it|en&format=json&origin=*`);
        people = p.entities || {};
      }

      const scored = candidates.map(c => {
        const directors = c.dirIds.map(id => wdLabel(people[id])).filter(Boolean);
        const directorMatch = !!movie.director && directors.some(d => surnameMatches(d, movie.director));
        return { ...c, directors, cast: c.castIds.map(id => wdLabel(people[id])).filter(Boolean), directorMatch, yearDiff: Math.abs(c.year - movie.year) };
      }).sort((a, b) => (b.directorMatch - a.directorMatch) || (a.yearDiff - b.yearDiff));

      const best = scored[0];
      // Accetta solo se il regista coincide, oppure (in assenza di regista) se l'anno è quasi identico
      if (best.directorMatch || (best.yearDiff <= 1 && !movie.director)) return best;
    } catch (e) {}
  }
  return null;
}

async function fetchItalianWikiPlot(itwikiTitle) {
  if (!itwikiTitle) return '';
  try {
    const data = await fetchJson(`https://it.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(itwikiTitle.replace(/\s+/g, '_'))}`);
    // La prima frase di solito è "X è un film del ANNO diretto da..." → la saltiamo
    const sentences = (data.extract || '').split(/(?<=[.!?])\s+/);
    if (sentences.length && /\bfilm\b/i.test(sentences[0])) sentences.shift();
    const rest = sentences.join(' ').trim();
    return rest.length >= 40 ? rest : '';
  } catch (e) {
    return '';
  }
}

function sanitizePlot(text, movie) {
  if (!text) return '';
  let out = text.replace(new RegExp(`\\b${movie.year}\\b`, 'g'), '****');
  // Nasconde il titolo per non regalare il bonus
  [movie.itTitle, movie.originalTitle].filter(t => t && t.length >= 3).forEach(t => {
    out = out.replace(new RegExp(escapeRegExp(t), 'gi'), '«…»');
  });
  if (out.length > 420) {
    const cut = out.slice(0, 420);
    const lastDot = cut.lastIndexOf('. ');
    out = (lastDot > 180 ? cut.slice(0, lastDot + 1) : cut.trim() + '…');
  }
  return out.trim();
}

function enrichLiveMovie(movie) {
  if (!movie || !movie._live) return Promise.resolve(true);
  if (!movie._enrichPromise) {
    movie._enrichPromise = doEnrichLiveMovie(movie)
      .catch(() => false)
      .then(ok => { movie._enrichFailed = !ok; return ok; });
  }
  return movie._enrichPromise;
}

async function doEnrichLiveMovie(movie) {
  let gotItalianTitle = movie._country === 'it';

  // 1. Scheda dello store italiano: titolo, trama e genere in italiano
  if (movie._country !== 'it') {
    const res = (await fetchITunesLookup(movie._trackId, 'it')) || [];
    const it = res.find(r => r.trackId === movie._trackId) || res[0];
    if (it) {
      if (it.trackName) { movie.itTitle = cleanITunesTitle(it.trackName); gotItalianTitle = true; }
      const d = (it.longDescription || it.shortDescription || '').trim();
      if (d.length >= 25) movie.plot = d;
      if (it.primaryGenreName) movie.genre = it.primaryGenreName;
    }
  }

  // 2. Wikidata: anno verificato, regia e cast reali
  const wd = await fetchWikidataFilmInfo(movie);
  if (!wd) return false;

  movie.year = wd.year;
  if (wd.directors.length) movie.director = wd.directors.join(', ');
  if (wd.cast.length) movie.cast = wd.cast.join(', ');
  if (!gotItalianTitle && wd.itLabel) movie.itTitle = wd.itLabel;
  if (!movie.plot) movie.plot = await fetchItalianWikiPlot(wd.itwiki);

  // L'anno verificato deve rientrare ancora nella categoria scelta
  if (!eraMatches(movie, gameState.eraFilter)) return false;

  movie.plot = sanitizePlot(movie.plot, movie);
  return true;
}

/**
 * ============================================================================
 * STATO GLOBALE DEL GIOCO
 * ============================================================================
 */
const gameState = {
  playerCount: 1,
  players: [], // { name, stars, timeline: [movieObj] }
  currentPlayerIndex: 0,
  targetCards: 8,
  eraFilter: 'all',
  pool: [],
  deck: [],
  currentMovie: null,
  currentPosterUrl: null,
  unlockedClues: { director: false, cast: false, plot: false },
  isTurnResolved: false,
  roundNumber: 1,
  turnToken: 0,
  posterCache: new Map(),
  lastTurnUndo: null,
  started: false
};

/**
 * ============================================================================
 * VALIDAZIONE LOCANDINA VERTICALE (CANVAS CORS + IMG DIRETTA)
 * Solo immagini davvero verticali: altezza > larghezza × 1,15
 * ============================================================================
 */
function isVertical(w, h) {
  return w >= 100 && h > w * 1.15;
}

function verifyVerticalPosterImage(url) {
  return new Promise((resolve) => {
    if (!url) { resolve(null); return; }

    const loadPlainImage = () => {
      const plainImg = new Image();
      const t2 = setTimeout(() => { plainImg.src = ''; resolve(null); }, 6000);
      plainImg.onload = () => {
        clearTimeout(t2);
        const w = plainImg.naturalWidth || 0;
        const h = plainImg.naturalHeight || 0;
        resolve(isVertical(w, h) ? { url, img: plainImg, corsAllowed: false, width: w, height: h } : null);
      };
      plainImg.onerror = () => { clearTimeout(t2); resolve(null); };
      plainImg.src = url;
    };

    // Tentativo 1: crossOrigin='anonymous' per poter pixelare su Canvas
    const corsImg = new Image();
    corsImg.crossOrigin = 'anonymous';
    const t1 = setTimeout(() => { corsImg.src = ''; loadPlainImage(); }, 4500);
    corsImg.onload = () => {
      clearTimeout(t1);
      const w = corsImg.naturalWidth || 0;
      const h = corsImg.naturalHeight || 0;
      resolve(isVertical(w, h) ? { url, img: corsImg, corsAllowed: true, width: w, height: h } : null);
    };
    corsImg.onerror = () => { clearTimeout(t1); loadPlainImage(); };
    corsImg.src = url;
  });
}

/**
 * FONTE PRIMARIA: iTunes Store Movies API via JSONP (600x900bb.jpg)
 */
async function fetchPosterFromITunes(movie) {
  const queries = [
    { term: movie.originalTitle, country: 'us' },
    { term: movie.itTitle, country: 'it' },
    { term: `${movie.originalTitle} ${movie.year}`, country: 'us' }
  ];

  const targetOrigNorm = normalizeTitle(movie.originalTitle);
  const targetItNorm = normalizeTitle(movie.itTitle);
  const origWords = targetOrigNorm.split(' ').filter(w => w.length > 2);
  const itWords = targetItNorm.split(' ').filter(w => w.length > 2);

  for (const q of queries) {
    try {
      const results = await fetchITunesJsonp(q.term, q.country, 'movie', 'movie', 10);
      if (!results || !results.length) continue;

      const candidates = results
        .filter(item => item.kind === 'feature-movie' && item.artworkUrl100)
        .map(item => {
          const releaseYear = item.releaseDate ? parseInt(item.releaseDate.slice(0, 4), 10) : null;
          const yearDiff = releaseYear ? Math.abs(releaseYear - movie.year) : 10;
          const trackNorm = normalizeTitle(cleanITunesTitle(item.trackName));

          const exactMatch = trackNorm === targetOrigNorm || trackNorm === targetItNorm;
          const substringMatch = trackNorm.includes(targetOrigNorm) || targetOrigNorm.includes(trackNorm) ||
                                 trackNorm.includes(targetItNorm) || targetItNorm.includes(trackNorm);
          const wordOverlap = origWords.some(w => trackNorm.includes(w)) || itWords.some(w => trackNorm.includes(w));

          let score = 0;
          if (exactMatch) score += 60;
          else if (substringMatch) score += 35;
          else if (wordOverlap) score += 15;
          if (yearDiff <= 2) score += 30;
          else if (yearDiff <= 10) score += 10;

          return { item, matched: exactMatch || substringMatch || wordOverlap, score };
        })
        .filter(c => c.matched && c.score >= 45)
        .sort((a, b) => b.score - a.score);

      for (const cand of candidates) {
        const hdPosterUrl = cand.item.artworkUrl100.replace(/\/\d+x\d+bb\.(jpg|png)$/i, '/600x900bb.jpg');
        const verified = await verifyVerticalPosterImage(hdPosterUrl);
        if (verified) return { ...verified, source: 'iTunes Movies' };
      }
    } catch (err) {}
  }
  return null;
}

/**
 * FONTE SECONDARIA: Wikipedia (immagine principale della voce del film)
 */
async function fetchPosterFromWikipedia(movie) {
  const restCandidates = [
    { lang: 'en', title: `${movie.originalTitle} (${movie.year} film)` },
    { lang: 'en', title: `${movie.originalTitle} (film)` },
    { lang: 'en', title: movie.originalTitle },
    { lang: 'it', title: `${movie.itTitle} (film ${movie.year})` },
    { lang: 'it', title: `${movie.itTitle} (film)` },
    { lang: 'it', title: movie.itTitle }
  ];

  const looksLikeFilm = (text) => /\bfilm\b|\bmovie\b|\bregia\b|\bdirected\b/i.test(text || '');

  for (const cand of restCandidates) {
    try {
      const slug = encodeURIComponent(cand.title.replace(/\s+/g, '_'));
      const res = await fetch(`https://${cand.lang}.wikipedia.org/api/rest_v1/page/summary/${slug}`);
      if (!res.ok) continue;
      const data = await res.json();
      if (!looksLikeFilm(`${data.description || ''} ${data.extract || ''}`)) continue;

      const imgUrl = data.originalimage?.source || data.thumbnail?.source;
      if (imgUrl) {
        const verified = await verifyVerticalPosterImage(imgUrl);
        if (verified) return { ...verified, source: `Wikipedia ${cand.lang.toUpperCase()}` };
      }
    } catch (e) {}
  }

  const mwQueries = [
    { lang: 'en', q: `${movie.originalTitle} ${movie.year} film` },
    { lang: 'it', q: `${movie.itTitle} ${movie.year} film` }
  ];

  for (const mw of mwQueries) {
    try {
      const apiUrl = `https://${mw.lang}.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(mw.q)}&gsrlimit=4&prop=pageimages|description&piprop=original|thumbnail&pithumbsize=600&format=json&origin=*`;
      const res = await fetch(apiUrl);
      if (!res.ok) continue;
      const data = await res.json();
      const pages = Object.values(data.query?.pages || {}).sort((a, b) => (a.index || 99) - (b.index || 99));

      for (const page of pages) {
        if (!looksLikeFilm(page.description)) continue;
        const imgUrl = page.original?.source || page.thumbnail?.source;
        if (!imgUrl) continue;
        const verified = await verifyVerticalPosterImage(imgUrl);
        if (verified) return { ...verified, source: `Wikipedia ${mw.lang.toUpperCase()}` };
      }
    } catch (e) {}
  }
  return null;
}

/**
 * FONTE TERZIARIA: Wikidata P3383 ("film poster") su Wikimedia Commons
 */
async function fetchPosterFromWikidata(movie) {
  const searchTerms = [`${movie.originalTitle} ${movie.year}`, movie.originalTitle, movie.itTitle];

  for (const term of searchTerms) {
    try {
      const searchData = await fetchJson(`https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(term)}&language=en&format=json&origin=*&limit=5`);
      if (!Array.isArray(searchData.search) || searchData.search.length === 0) continue;

      const ids = searchData.search.map(e => e.id).join('|');
      const entityData = await fetchJson(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${ids}&props=claims&format=json&origin=*`);

      for (const id of Object.keys(entityData.entities || {})) {
        const claims = entityData.entities[id].claims || {};
        const isFilm = wdIds(claims, 'P31').some(q => FILM_QIDS.has(q));
        if (!isFilm) continue;
        const years = wdYears(claims);
        if (years.length && Math.abs(Math.min(...years) - movie.year) > 2) continue;

        const posterFiles = (claims.P3383 || []).map(c => c.mainsnak?.datavalue?.value).filter(f => typeof f === 'string');
        for (const file of posterFiles) {
          const commonsData = await fetchJson(`https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(`File:${file}`)}&prop=imageinfo&iiprop=url|size&iiurlwidth=650&format=json&origin=*`);
          for (const page of Object.values(commonsData.query?.pages || {})) {
            const info = page?.imageinfo?.[0];
            if (!info || !isVertical(info.width || 0, info.height || 0)) continue;
            const verified = await verifyVerticalPosterImage(info.thumburl || info.url);
            if (verified) return { ...verified, source: 'Wikidata (P3383)' };
          }
        }
      }
    } catch (err) {}
  }
  return null;
}

/**
 * ORCHESTRATORE: iTunes → Wikipedia → Wikidata P3383
 */
function fetchOfficialMoviePoster(movie) {
  if (gameState.posterCache.has(movie.id)) return gameState.posterCache.get(movie.id);

  const promise = (async () => {
    if (movie._preloadedPosterUrl) {
      const direct = await verifyVerticalPosterImage(movie._preloadedPosterUrl);
      if (direct) return { ...direct, source: 'iTunes Movies' };
    }
    return (await fetchPosterFromITunes(movie)) ||
           (await fetchPosterFromWikipedia(movie)) ||
           (await fetchPosterFromWikidata(movie));
  })();

  gameState.posterCache.set(movie.id, promise);
  promise.then(r => { if (!r) gameState.posterCache.delete(movie.id); });
  return promise;
}

/**
 * ============================================================================
 * PIXELATURA PROGRESSIVA SU <CANVAS> (o fallback CSS sfocato con griglia)
 * Si parte da 14x20; ogni indizio scoperto aumenta la nitidezza di un livello.
 * Anche all'ultimo livello (21x30) la locandina resta pixelata: non si
 * rivela mai del tutto prima del piazzamento.
 * ============================================================================
 */
const PIXEL_LEVELS = [
  { cols: 14, rows: 20 }, // nessun indizio
  { cols: 16, rows: 23 }, // 1 indizio
  { cols: 18, rows: 26 }, // 2 indizi
  { cols: 21, rows: 30 }  // 3 indizi: massimo, titoli ancora illeggibili
];

function currentPixelLevel() {
  const unlocked = Object.values(gameState.unlockedClues).filter(Boolean).length;
  return Math.min(unlocked, PIXEL_LEVELS.length - 1);
}

function updatePosterCaption() {
  const lvl = currentPixelLevel();
  document.getElementById('poster-caption-text').textContent =
    lvl === 0 ? 'Locandina criptata' : `Nitidezza ${lvl + 1} di ${PIXEL_LEVELS.length}`;
}

function renderPixelatedPoster(posterData, animate = false) {
  const canvas = document.getElementById('mystery-poster-canvas');
  const cssWrapper = document.getElementById('mystery-poster-css-wrapper');
  const cssImg = document.getElementById('mystery-poster-css-img');
  const { cols: PIXEL_COLS, rows: PIXEL_ROWS } = PIXEL_LEVELS[currentPixelLevel()];
  // Riserva CSS: sfocatura proporzionale alla dimensione di un "pixel" della griglia,
  // così nasconde quanto la pixelatura del canvas a qualsiasi grandezza di schermo
  const frameWidth = document.getElementById('poster-frame').clientWidth || 360;
  const CSS_BLUR_PX = Math.round((frameWidth / PIXEL_COLS) * 1.15);
  const flash = (el) => {
    if (!animate) return;
    el.classList.remove('sharpen');
    void el.offsetWidth;
    el.classList.add('sharpen');
  };

  if (posterData.corsAllowed && posterData.img) {
    try {
      const offscreen = document.createElement('canvas');
      offscreen.width = PIXEL_COLS;
      offscreen.height = PIXEL_ROWS;
      const offCtx = offscreen.getContext('2d');
      offCtx.fillStyle = '#020617';
      offCtx.fillRect(0, 0, PIXEL_COLS, PIXEL_ROWS);

      // Adatta l'immagine al riquadro 14x20 mantenendo le proporzioni (object-contain)
      const imgRatio = posterData.width / posterData.height;
      const boxRatio = PIXEL_COLS / PIXEL_ROWS;
      let dw = PIXEL_COLS, dh = PIXEL_ROWS;
      if (imgRatio > boxRatio) dh = PIXEL_COLS / imgRatio; else dw = PIXEL_ROWS * imgRatio;
      offCtx.drawImage(posterData.img, (PIXEL_COLS - dw) / 2, (PIXEL_ROWS - dh) / 2, dw, dh);
      offCtx.getImageData(0, 0, 1, 1); // lancia un errore se il canvas è "tainted"

      canvas.width = PIXEL_COLS * 30;
      canvas.height = PIXEL_ROWS * 30;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(offscreen, 0, 0, PIXEL_COLS, PIXEL_ROWS, 0, 0, canvas.width, canvas.height);

      cssWrapper.classList.add('hidden');
      canvas.classList.remove('hidden');
      flash(canvas);
      return;
    } catch (e) {
      // Canvas non utilizzabile: si passa al fallback CSS
    }
  }

  canvas.classList.add('hidden');
  cssImg.src = posterData.url;
  cssImg.style.filter = `blur(${CSS_BLUR_PX}px) contrast(1.25) saturate(1.25)`;
  cssWrapper.style.setProperty('--cols', PIXEL_COLS);
  cssWrapper.style.setProperty('--rows', PIXEL_ROWS);
  cssWrapper.classList.remove('hidden');
  flash(cssWrapper);
}

/**
 * ============================================================================
 * SETUP E TOAST
 * ============================================================================
 */
// Notifiche comuni (shared/js/dialoghi.js)
const TOAST_TYPES = { info: 'info', success: 'successo', error: 'errore' };
function showToast(message, type = 'info') {
  RG.toast(message, TOAST_TYPES[type] || 'info');
}

const OFFLINE_MESSAGE = 'Impossibile caricare i film: Pellicola ha bisogno di internet. Controlla la connessione e riprova.';

// Nomi: "Chi gioca stasera" di Combriccola (primi 4 posti)
const DEFAULT_NAMES = ['Cinefilo 1', 'Cinefilo 2', 'Cinefilo 3', 'Cinefilo 4'];

function setPlayerCount(count) {
  gameState.playerCount = count;
  document.querySelectorAll('.count-btn').forEach(b => {
    const on = parseInt(b.dataset.count, 10) === count;
    b.classList.toggle('is-active', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}

function renderPlayerNameInputs() {
  const container = document.getElementById('player-names-container');
  const previous = Array.from(container.querySelectorAll('.player-name-input')).map(i => i.value);
  container.innerHTML = '';
  const sharedNames = RG.squadre.nomi(4, DEFAULT_NAMES);

  for (let i = 0; i < gameState.playerCount; i++) {
    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 18;
    input.dataset.playerIdx = i;
    input.value = previous[i] ?? sharedNames[i];
    input.placeholder = `Nome giocatore ${i + 1}`;
    input.setAttribute('aria-label', `Nome giocatore ${i + 1}`);
    input.className = 'player-name-input input';
    container.appendChild(input);
  }
}

document.querySelectorAll('.count-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    setPlayerCount(parseInt(btn.dataset.count, 10));
    renderPlayerNameInputs();
  });
});

/**
 * ============================================================================
 * MAZZO: costruzione, pesca, ricarica
 * ============================================================================
 */
function moviesInPlayKeys(players = gameState.players) {
  const keys = new Set();
  players.forEach(p => p.timeline.forEach(m => keys.add(movieKey(m))));
  return keys;
}

// Divide i film in mai giocati e già giocati. Nel mazzo i già giocati finiscono in fondo:
// pop() pesca per ultimi, quindi escono prima quelli mai visti.
function dividiPerVisti(lista) {
  const giocati = getPlayedMoviesHistory();
  return {
    nuovi: lista.filter(m => !giocati.has(movieKey(m))),
    visti: lista.filter(m => giocati.has(movieKey(m)))
  };
}

function refillDeck() {
  const inPlay = moviesInPlayKeys();
  // Prima i film della categoria scelta non ancora in una timeline (anche quelli scartati)
  let candidates = gameState.pool.filter(m => !inPlay.has(movieKey(m)) && !m._enrichFailed);
  if (!candidates.length) {
    candidates = MOVIES_DATABASE.filter(m => eraMatches(m, gameState.eraFilter) && !inPlay.has(movieKey(m)));
  }
  if (!candidates.length) {
    candidates = MOVIES_DATABASE.filter(m => !inPlay.has(movieKey(m)));
    if (candidates.length) showToast('Categoria esaurita: aggiungo film da tutto il catalogo.', 'info');
  }
  const { nuovi, visti } = dividiPerVisti(candidates);
  gameState.deck = [...shuffleArray(visti), ...shuffleArray(nuovi)];
}

async function drawNextMovie() {
  let liveAttempts = 0;
  for (let guard = 0; guard < 300; guard++) {
    if (!gameState.deck.length) refillDeck();
    if (!gameState.deck.length) break;

    const inPlay = moviesInPlayKeys();
    const movie = gameState.deck.pop();
    if (inPlay.has(movieKey(movie))) continue;
    if (!movie._live) return movie;
    if (movie._enrichFailed) continue;

    // Massimo 4 film live non verificabili per turno, poi si passa ai curati
    if (liveAttempts >= 4) continue;
    liveAttempts++;
    const ok = await enrichLiveMovie(movie);
    if (ok && !moviesInPlayKeys().has(movieKey(movie))) return movie;
  }
  const inPlay = moviesInPlayKeys();
  return shuffleArray(MOVIES_DATABASE).find(m => !inPlay.has(movieKey(m))) || MOVIES_DATABASE[0];
}

function prefetchNextCard() {
  const next = gameState.deck[gameState.deck.length - 1];
  if (!next) return;
  enrichLiveMovie(next).then(ok => { if (ok) fetchOfficialMoviePoster(next); }).catch(() => {});
}

/**
 * ============================================================================
 * AVVIO PARTITA E GESTIONE TURNI
 * ============================================================================
 */
// Catalogo della partita: film curati della categoria + film live da iTunes.
// I film mai giocati finiscono in fondo all'array: pop() li pesca per primi.
// Restituisce i film mai visti, oppure null se il catalogo online non risponde affatto:
// Pellicola non si gioca senza connessione (servono catalogo e locandine).
// Se iTunes risponde ma senza film utili si gioca con i film inclusi (le locandine arrivano online).
async function buildPoolAndDeck(eraFilter, excludeKeys = new Set()) {
  const { movies: liveMovies, reachable } = await fetchLiveMoviesCatalog(eraFilter);
  if (!reachable) return null;
  const curatedMovies = MOVIES_DATABASE.filter(m => eraMatches(m, eraFilter));

  // I film curati hanno la precedenza sui doppioni live
  const mergedMap = new Map();
  const titleKeys = new Set();
  curatedMovies.forEach(m => {
    mergedMap.set(movieKey(m), m);
    titleKeys.add(normalizeTitle(m.originalTitle));
    titleKeys.add(normalizeTitle(m.itTitle));
  });
  liveMovies.forEach(m => {
    const k = movieKey(m);
    if (mergedMap.has(k) || titleKeys.has(normalizeTitle(m.originalTitle))) return;
    mergedMap.set(k, m);
  });
  gameState.pool = Array.from(mergedMap.values());

  const available = gameState.pool.filter(m => !excludeKeys.has(movieKey(m)));
  const { nuovi: unseen, visti: seen } = dividiPerVisti(available);
  gameState.deck = [...shuffleArray(seen), ...shuffleArray(unseen)];
  return unseen;
}

// Mentre si prepara il mazzo (nuova partita o ripresa) i pulsanti di avvio, Riprendi e Scarta
// restano bloccati: due preparazioni insieme si sovrascriverebbero a vicenda.
let preparingDeck = false;
function setPreparingDeck(on) {
  preparingDeck = on;
  ['start-game-btn', 'play-again-btn'].forEach(id => { document.getElementById(id).disabled = on; });
  document.querySelectorAll('#resume-box button').forEach(b => { b.disabled = on; });
}

async function startNewGame(triggerBtn) {
  if (preparingDeck) return;
  const btn = triggerBtn instanceof HTMLElement ? triggerBtn : document.getElementById('start-game-btn');
  const originalLabel = btn.textContent;
  setPreparingDeck(true);
  btn.textContent = 'Preparo il mazzo…';

  try {
    const nameInputs = document.querySelectorAll('.player-name-input');
    const unseen = await buildPoolAndDeck(document.getElementById('era-select').value);
    if (!unseen) {
      showToast(OFFLINE_MESSAGE, 'error');
      return;
    }

    gameState.turnToken++;
    gameState.eraFilter = document.getElementById('era-select').value;
    gameState.targetCards = parseInt(document.getElementById('target-cards-select').value, 10);
    gameState.players = [];

    // Carte iniziali: sempre dal catalogo curato (anno certo), preferendo quelle mai viste
    const pickStarter = () => {
      for (let i = gameState.deck.length - 1; i >= 0; i--) {
        if (!gameState.deck[i]._live) return gameState.deck.splice(i, 1)[0];
      }
      const used = moviesInPlayKeys();
      return shuffleArray(MOVIES_DATABASE).find(m => !used.has(movieKey(m)));
    };

    for (let i = 0; i < gameState.playerCount; i++) {
      const rawName = nameInputs[i]?.value.trim() || DEFAULT_NAMES[i];
      const starterMovie = pickStarter();
      markMovieAsPlayed(starterMovie);
      fetchOfficialMoviePoster(starterMovie).then(res => {
        if (res) { starterMovie._posterUrl = res.url; renderTimeline(); }
      });
      gameState.players.push({ name: rawName, stars: 10, timeline: [starterMovie] });
    }

    gameState.currentPlayerIndex = 0;
    gameState.roundNumber = 1;
    gameState.lastTurnUndo = null;
    gameState.started = true;
    RG.squadre.salva(gameState.players.map(p => p.name), DEFAULT_NAMES);

    showToast(`Mazzo pronto: ${gameState.pool.length} film, ${unseen.length} mai visti`, 'success');

    document.getElementById('setup-screen').classList.add('hidden');
    document.getElementById('victory-modal').classList.add('hidden');
    document.getElementById('game-screen').classList.remove('hidden');
    window.scrollTo({ top: 0 });

    startTurnForCurrentPlayer();
  } finally {
    setPreparingDeck(false);
    btn.textContent = originalLabel;
  }
}

function startTurnForCurrentPlayer() {
  if (gameState.players.length > 1) {
    const p = gameState.players[gameState.currentPlayerIndex];
    document.getElementById('handoff-player-name').textContent = p.name;
    document.getElementById('handoff-player-stats').textContent =
      `Turno ${gameState.roundNumber}: ${p.timeline.length} film su ${gameState.targetCards}, ${p.stars} ★`;
    document.getElementById('handoff-modal').classList.remove('hidden');
  }
  loadNextTurn();
}

const CLUE_SUBTITLES = { director: 'Regista e genere', cast: 'Attori principali', plot: 'Sinossi breve' };

function setClueButtonsState(movie) {
  const available = {
    director: !!(movie && movie.director),
    cast: !!(movie && movie.cast),
    plot: !!(movie && movie.plot)
  };
  document.querySelectorAll('.clue-btn').forEach(btn => {
    const type = btn.dataset.clue;
    const sub = document.getElementById(`clue-${type}-sub`);
    const ok = !!movie && available[type];
    btn.disabled = !ok;
    btn.classList.remove('is-unlocked');
    btn.textContent = `Scopri −${btn.dataset.cost} ★`;
    if (sub) sub.textContent = movie && !available[type] ? 'Non disponibile' : CLUE_SUBTITLES[type];
  });
}

// resume: { movie, unlockedClues, guess } per riprendere un turno già iniziato
// (dopo il ricaricamento o dopo "Annulla ultimo turno") con lo stesso film
async function loadNextTurn(resume = null) {
  const token = ++gameState.turnToken;

  gameState.currentMovie = null;
  gameState.currentPosterUrl = null;
  gameState.currentPosterData = null;
  gameState.isTurnResolved = false;
  gameState.unlockedClues = { director: false, cast: false, plot: false };

  const activePlayer = gameState.players[gameState.currentPlayerIndex];

  document.getElementById('round-indicator').textContent = `Turno ${gameState.roundNumber}`;
  document.getElementById('current-player-name').textContent = activePlayer.name;
  document.getElementById('timeline-owner-name').textContent = activePlayer.name;
  document.getElementById('goal-progress-text').textContent = `${activePlayer.timeline.length} di ${gameState.targetCards} film`;
  document.getElementById('active-stars-display').textContent = `${activePlayer.stars} ★`;

  document.getElementById('clues-panel').classList.remove('hidden');
  document.getElementById('reveal-result-panel').classList.add('hidden');
  document.getElementById('clue-empty-hint').classList.remove('hidden');
  ['director', 'cast', 'plot'].forEach(t => document.getElementById(`revealed-${t}-card`).classList.add('hidden'));
  document.getElementById('guess-title-input').value = '';
  document.getElementById('title-bonus-badge').classList.add('hidden');
  setClueButtonsState(null);

  const loader = document.getElementById('poster-loader');
  const canvas = document.getElementById('mystery-poster-canvas');
  const cssWrapper = document.getElementById('mystery-poster-css-wrapper');
  const revealedImg = document.getElementById('revealed-poster-img');
  const fallbackCard = document.getElementById('poster-fallback-card');
  const zoomBtn = document.getElementById('zoom-poster-btn');

  loader.classList.remove('hidden');
  [canvas, cssWrapper, revealedImg, fallbackCard, zoomBtn].forEach(el => el.classList.add('hidden'));

  
  document.getElementById('poster-source-badge').textContent = '';
  document.getElementById('poster-caption-text').textContent = 'Locandina criptata';
  document.getElementById('timeline-instruction').innerHTML =
    'Tocca un <strong>+</strong> per inserire il film misterioso nel punto giusto.';
  document.getElementById('reveal-result-panel').removeAttribute('data-outcome');
  document.getElementById('revealed-poster-img').classList.remove('is-revealing');
  document.getElementById('revealed-movie-year').classList.remove('stamp-in');

  renderScoreboard();
  renderTimeline();

  const movie = resume ? resume.movie : await drawNextMovie();
  if (token !== gameState.turnToken) return;

  gameState.currentMovie = movie;
  markMovieAsPlayed(movie);
  setClueButtonsState(movie);
  if (resume) {
    Object.entries(resume.unlockedClues || {}).forEach(([type, on]) => { if (on) showClue(type, movie); });
    document.getElementById('guess-title-input').value = resume.guess || '';
  }
  renderTimeline(); // abilita gli slot
  updateUndoButtons();
  saveGame();

  const posterData = await fetchOfficialMoviePoster(movie);
  if (token !== gameState.turnToken) return;

  loader.classList.add('hidden');

  if (posterData && posterData.url) {
    gameState.currentPosterUrl = posterData.url;
    gameState.currentPosterData = posterData;
    movie._posterUrl = posterData.url;
    document.getElementById('poster-source-badge').textContent = `Fonte: ${posterData.source}`;

    if (!gameState.isTurnResolved) {
      renderPixelatedPoster(posterData);
      updatePosterCaption();
    } else {
      revealedImg.src = posterData.url;
      revealedImg.classList.remove('hidden');
      zoomBtn.classList.remove('hidden');
      renderTimeline();
    }
  } else if (!gameState.isTurnResolved) {
    document.getElementById('fallback-mystery-label').textContent = 'Pellicola misteriosa';
    fallbackCard.classList.remove('hidden');
  }

  prefetchNextCard();
}

/**
 * ============================================================================
 * INDIZI A PUNTI (10 ★ INIZIALI)
 * ============================================================================
 */
document.querySelectorAll('.clue-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const movie = gameState.currentMovie;
    if (!movie || gameState.isTurnResolved) return;
    const clueType = btn.dataset.clue;
    const cost = parseInt(btn.dataset.cost, 10);
    const activePlayer = gameState.players[gameState.currentPlayerIndex];

    if (gameState.unlockedClues[clueType]) return;
    if (activePlayer.stars < cost) {
      showToast(`Punti Indizio insufficienti! Servono ${cost} ★.`, 'error');
      return;
    }

    activePlayer.stars -= cost;
    showClue(clueType, movie, true);
    // Comprato un indizio, il turno precedente non si può più annullare
    gameState.lastTurnUndo = null;
    updateUndoButtons();
    renderScoreboard();
    saveGame();
  });
});

// Mostra un indizio già pagato (anche quando si riprende un turno)
function showClue(clueType, movie, animate = false) {
  const btn = document.querySelector(`.clue-btn[data-clue="${clueType}"]`);
  const activePlayer = gameState.players[gameState.currentPlayerIndex];
  gameState.unlockedClues[clueType] = true;
  document.getElementById('active-stars-display').textContent = `${activePlayer.stars} ★`;
  document.getElementById('clue-empty-hint').classList.add('hidden');
  btn.disabled = true;
  btn.classList.add('is-unlocked');
  btn.textContent = 'Scoperto';

  if (gameState.currentPosterData) {
    renderPixelatedPoster(gameState.currentPosterData, animate);
    updatePosterCaption();
  }

  if (clueType === 'director') {
    document.getElementById('revealed-director-text').textContent = movie.genre ? `${movie.director} (${movie.genre})` : movie.director;
    document.getElementById('revealed-director-card').classList.remove('hidden');
  } else if (clueType === 'cast') {
    document.getElementById('revealed-cast-text').textContent = movie.cast;
    document.getElementById('revealed-cast-card').classList.remove('hidden');
  } else if (clueType === 'plot') {
    document.getElementById('revealed-plot-text').textContent = movie.plot;
    document.getElementById('revealed-plot-card').classList.remove('hidden');
  }
}

/**
 * ============================================================================
 * SCOREBOARD E TIMELINE
 * ============================================================================
 */
function renderScoreboard() {
  const bar = document.getElementById('scoreboard-bar');
  bar.innerHTML = '';

  gameState.players.forEach((p, idx) => {
    const isActive = idx === gameState.currentPlayerIndex;
    const badge = document.createElement('div');
    badge.className = `chip${isActive ? ' is-active' : ''}`;
    badge.setAttribute('aria-label', `${p.name}: ${p.timeline.length} film su ${gameState.targetCards}, ${p.stars} stelle${isActive ? ', di turno' : ''}`);
    badge.innerHTML = `
      <span class="chip-name">${esc(p.name)}</span>
      <span><span class="chip-num">${p.timeline.length}</span>/${gameState.targetCards}</span>
      <span class="chip-stars">${p.stars}★</span>
    `;
    bar.appendChild(badge);
  });
}

function renderTimeline() {
  const track = document.getElementById('timeline-track');
  track.innerHTML = '';
  const activePlayer = gameState.players[gameState.currentPlayerIndex];
  if (!activePlayer) return;
  const timeline = activePlayer.timeline;
  const slotsActive = !!gameState.currentMovie && !gameState.isTurnResolved;

  const createSlotButton = (slotIndex, word, years, ariaText) => {
    const slot = document.createElement('button');
    slot.type = 'button';
    slot.disabled = !slotsActive;
    slot.className = gameState.isTurnResolved ? 'hidden' : 'slot';
    slot.setAttribute('aria-label', `Inserisci qui: ${ariaText}`);
    slot.innerHTML = `
      <span class="slot-plus" aria-hidden="true">+</span>
      <span class="slot-hint" aria-hidden="true">${esc(word)}<b>${esc(years)}</b></span>
    `;
    slot.addEventListener('click', () => handleTimelinePlacement(slotIndex));
    return slot;
  };

  if (timeline.length > 0) {
    track.appendChild(createSlotButton(0, 'prima del', String(timeline[0].year), `prima del ${timeline[0].year}`));
  } else {
    track.appendChild(createSlotButton(0, 'primo', 'film', 'primo film'));
  }

  timeline.forEach((movie, idx) => {
    const card = document.createElement('div');
    card.className = `frame${movie._justAdded ? ' is-new' : ''}`;
    if (movie._justAdded) card.dataset.justAdded = '1';

    const posterHtml = movie._posterUrl
      ? `<img src="${esc(movie._posterUrl)}" alt="" loading="lazy" />`
      : `<div class="frame-noposter">${esc(movie.itTitle)}</div>`;

    card.innerHTML = `
      <div class="frame-poster">${posterHtml}</div>
      <div class="frame-meta">
        <div class="frame-year">${movie.year}</div>
        <p class="frame-title" title="${esc(movie.itTitle)}">${esc(movie.itTitle)}</p>
      </div>
    `;
    track.appendChild(card);

    const nextMovie = timeline[idx + 1];
    if (nextMovie) {
      track.appendChild(createSlotButton(idx + 1, 'tra', `${movie.year}–${nextMovie.year}`, `tra il ${movie.year} e il ${nextMovie.year}`));
    } else {
      track.appendChild(createSlotButton(idx + 1, 'dopo il', String(movie.year), `dopo il ${movie.year}`));
    }
  });

  const end = document.createElement('div');
  end.className = 'strip-end';
  track.appendChild(end);
}

function centerTimelineOnNewCard() {
  const container = document.getElementById('timeline-container');
  const card = container.querySelector('[data-just-added="1"]');
  if (!card) return;
  container.scrollTo({ left: Math.max(0, card.offsetLeft - container.clientWidth / 2 + card.clientWidth / 2), behavior: 'smooth' });
}

/**
 * ============================================================================
 * BONUS TITOLO: tollerante su accenti, articoli e piccoli errori di battitura
 * ============================================================================
 */
const ROMAN_NUMERALS = { ii: '2', iii: '3', iv: '4', vi: '6', vii: '7', viii: '8', ix: '9' };

// Titolo confrontabile: senza accenti/articoli, con numeri romani convertiti ("II" → "2")
function comparableTitle(s) {
  return stripArticles(normalizeTitle(s)).split(' ').map(w => ROMAN_NUMERALS[w] || w).join(' ');
}

function numberTokens(s) {
  return s.split(' ').filter(w => /^\d+$/.test(w)).sort().join(',');
}

function isTitleGuessCorrect(guessRaw, movie) {
  const guess = comparableTitle(guessRaw);
  if (!guess) return false;

  const targets = new Set();
  [movie.itTitle, movie.originalTitle, ...(TITLE_ALIASES[movie.id] || [])].forEach(t => {
    if (!t) return;
    targets.add(comparableTitle(t));
    // Accetta anche il titolo principale prima di ":" o " - " (es. "Il Signore degli Anelli")
    const main = t.split(/\s*:\s+|\s+[-–—]\s+/)[0];
    if (main && main !== t && normalizeTitle(main).length >= 4) targets.add(comparableTitle(main));
  });

  for (const target of targets) {
    if (!target) continue;
    if (guess === target) return true;
    if (numberTokens(guess) !== numberTokens(target)) continue; // "Il gladiatore" ≠ "Il gladiatore II"
    const tolerance = target.length <= 5 ? 0 : target.length <= 10 ? 1 : 2;
    if (editDistance(guess, target) <= tolerance) return true;
  }
  return false;
}

/**
 * ============================================================================
 * VERIFICA PIAZZAMENTO E RIVELAZIONE
 * ============================================================================
 */
function handleTimelinePlacement(slotIndex) {
  const movie = gameState.currentMovie;
  if (!movie || gameState.isTurnResolved) return;

  // Fotografia di prima del piazzamento, per "Annulla ultimo turno"
  gameState.lastTurnUndo = {
    players: serializePlayers(),
    currentPlayerIndex: gameState.currentPlayerIndex,
    roundNumber: gameState.roundNumber,
    movie: cleanMovie(movie),
    unlockedClues: { ...gameState.unlockedClues },
    guess: document.getElementById('guess-title-input').value
  };
  gameState.isTurnResolved = true;

  const activePlayer = gameState.players[gameState.currentPlayerIndex];
  const timeline = activePlayer.timeline;
  timeline.forEach(m => { delete m._justAdded; });

  const prevMovie = slotIndex > 0 ? timeline[slotIndex - 1] : null;
  const nextMovie = slotIndex < timeline.length ? timeline[slotIndex] : null;

  // Anni uguali valgono sia prima che dopo
  const isCorrect = (!prevMovie || movie.year >= prevMovie.year) && (!nextMovie || movie.year <= nextMovie.year);

  const canvas = document.getElementById('mystery-poster-canvas');
  const cssWrapper = document.getElementById('mystery-poster-css-wrapper');
  const revealedImg = document.getElementById('revealed-poster-img');
  const zoomBtn = document.getElementById('zoom-poster-btn');
  const fallbackCard = document.getElementById('poster-fallback-card');

  if (gameState.currentPosterUrl) {
    canvas.classList.add('hidden');
    cssWrapper.classList.add('hidden');
    revealedImg.src = gameState.currentPosterUrl;
    revealedImg.classList.remove('hidden', 'is-revealing');
    void revealedImg.offsetWidth; // riavvia l'animazione
    revealedImg.classList.add('is-revealing');
    zoomBtn.classList.remove('hidden');
  } else {
    document.getElementById('fallback-mystery-label').textContent = movie.itTitle;
  }

  document.getElementById('poster-caption-text').textContent = `${movie.itTitle} (${movie.year})`;

  const resultPanel = document.getElementById('reveal-result-panel');
  const resultBadge = document.getElementById('result-badge');
  const titleBonusBadge = document.getElementById('title-bonus-badge');
  document.getElementById('clues-panel').classList.add('hidden');
  resultPanel.classList.remove('hidden');

  const titleGuessed = isTitleGuessCorrect(document.getElementById('guess-title-input').value, movie);
  if (titleGuessed) activePlayer.stars += 3;
  titleBonusBadge.classList.toggle('hidden', !titleGuessed);

  document.getElementById('revealed-movie-title').textContent = movie.itTitle;
  const showOriginal = normalizeTitle(movie.originalTitle) !== normalizeTitle(movie.itTitle);
  document.getElementById('revealed-movie-subtitle').textContent =
    `${showOriginal ? `${movie.originalTitle} • ` : ''}${movie.director ? `Regia di ${movie.director}` : ''}`;
  const yearEl = document.getElementById('revealed-movie-year');
  yearEl.textContent = movie.year;
  yearEl.classList.remove('stamp-in');
  void yearEl.offsetWidth;
  yearEl.classList.add('stamp-in');
  const summaryEl = document.getElementById('revealed-movie-summary');
  summaryEl.textContent = movie.plot || '';
  summaryEl.classList.toggle('hidden', !movie.plot);

  if (isCorrect) {
    movie._justAdded = true;
    timeline.splice(slotIndex, 0, movie);
    activePlayer.stars += 2;

    resultPanel.dataset.outcome = 'win';
    resultBadge.textContent = 'Posizione giusta: +2 ★';
    document.getElementById('timeline-instruction').innerHTML =
      `<span class="ok">Giusto.</span> <strong>${esc(movie.itTitle)}</strong> entra nella pellicola di ${esc(activePlayer.name)}.`;

  } else {
    const penalty = Math.min(2, activePlayer.stars);
    activePlayer.stars = Math.max(0, activePlayer.stars - 2);

    resultPanel.dataset.outcome = 'lose';
    resultBadge.textContent = penalty > 0 ? `Posizione sbagliata: −${penalty} ★, carta scartata` : 'Posizione sbagliata: carta scartata';
    document.getElementById('timeline-instruction').innerHTML =
      `<span class="ko">Sbagliato.</span> <strong>${esc(movie.itTitle)}</strong> è uscito nel <strong>${movie.year}</strong>.`;

  }

  document.getElementById('active-stars-display').textContent = `${activePlayer.stars} ★`;
  document.getElementById('goal-progress-text').textContent = `${timeline.length} di ${gameState.targetCards} film`;
  renderScoreboard();
  renderTimeline();
  setTimeout(centerTimelineOnNewCard, 50);

  document.getElementById('next-turn-btn').textContent =
    (isCorrect && timeline.length >= gameState.targetCards) ? 'Vai alla premiazione' : 'Prossimo turno';
  updateUndoButtons();
  saveGame();

  // Su telefono il risultato è in alto: lo riportiamo in vista
  if (window.innerWidth < 1024) {
    document.getElementById('poster-frame').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

/**
 * ============================================================================
 * AVANZAMENTO TURNO, VITTORIA, ZOOM, MENU
 * ============================================================================
 */
function goToNextTurn() {
  const activePlayer = gameState.players[gameState.currentPlayerIndex];
  if (activePlayer.timeline.length >= gameState.targetCards) {
    showVictoryScreen(activePlayer);
    return;
  }
  gameState.currentPlayerIndex = (gameState.currentPlayerIndex + 1) % gameState.players.length;
  if (gameState.currentPlayerIndex === 0) gameState.roundNumber += 1;
  window.scrollTo({ top: 0, behavior: 'smooth' });
  startTurnForCurrentPlayer();
}

document.getElementById('next-turn-btn').addEventListener('click', goToNextTurn);

document.getElementById('handoff-ready-btn').addEventListener('click', () => {
  document.getElementById('handoff-modal').classList.add('hidden');
});

function showVictoryScreen(winner) {
  gameState.turnToken++;
  clearSavedGame();
  updateUndoButtons();
  document.getElementById('winner-title').textContent = `Vince ${winner.name}`;
  document.getElementById('winner-subtitle').textContent =
    `Prima pellicola completa: ${gameState.targetCards} film al posto giusto.`;

  const standings = document.getElementById('final-standings');
  standings.innerHTML = '';
  const sorted = [...gameState.players].sort((a, b) =>
    (b.timeline.length - a.timeline.length) || (b.stars - a.stars));

  sorted.forEach((p, idx) => {
    const row = document.createElement('li');
    row.innerHTML = `
      <span><span class="pos">${idx + 1}</span><span class="pn">${esc(p.name)}</span></span>
      <span class="ps">${p.timeline.length} film, ${p.stars} ★</span>
    `;
    standings.appendChild(row);
  });

  document.getElementById('victory-modal').classList.remove('hidden');
}

function openPosterZoom() {
  if (!gameState.currentPosterUrl || !gameState.isTurnResolved) return;
  document.getElementById('zoomed-poster-img').src = gameState.currentPosterUrl;
  document.getElementById('poster-zoom-modal').classList.remove('hidden');
}

function backToMenu() {
  gameState.turnToken++;
  gameState.started = false;
  document.getElementById('handoff-modal').classList.add('hidden');
  document.getElementById('victory-modal').classList.add('hidden');
  document.getElementById('game-screen').classList.add('hidden');
  document.getElementById('setup-screen').classList.remove('hidden');
  renderResumeBox();
  window.scrollTo({ top: 0 });
}

document.getElementById('zoom-poster-btn').addEventListener('click', openPosterZoom);
document.getElementById('revealed-poster-img').addEventListener('click', openPosterZoom);
document.getElementById('close-zoom-btn').addEventListener('click', () => {
  document.getElementById('poster-zoom-modal').classList.add('hidden');
});
document.getElementById('poster-zoom-modal').addEventListener('click', (e) => {
  if (e.target.id === 'poster-zoom-modal') e.currentTarget.classList.add('hidden');
});

document.getElementById('start-game-btn').addEventListener('click', (e) => startNewGame(e.currentTarget));
document.getElementById('play-again-btn').addEventListener('click', (e) => startNewGame(e.currentTarget));
document.getElementById('victory-menu-btn').addEventListener('click', backToMenu);

// "← Menu": la partita resta salvata e si riprende dalla schermata iniziale
document.getElementById('quit-game-btn').addEventListener('click', () => {
  saveGame();
  backToMenu();
  showToast('Partita salvata: tocca Riprendi per continuare.', 'info');
});

/**
 * ============================================================================
 * SALVATAGGIO, RIPRESA E ANNULLA ULTIMO TURNO (shared/js/partita.js)
 * La partita si salva a ogni turno, indizio e piazzamento (rg-cinestar-partita).
 * Il film del turno in corso resta lo stesso anche dopo un ricaricamento.
 * ============================================================================
 */
const SAVED_GAME = RG.partita.crea('cinestar', {
  versione: 1,
  valida: g => Array.isArray(g.players) && g.players.length >= 1 && g.players.every(p => Array.isArray(p.timeline))
});

// Copia di un film senza i dati di lavoro (promesse, segni temporanei)
const KEEP_PRIVATE = new Set(['_live', '_trackId', '_country', '_posterUrl', '_preloadedPosterUrl']);
function cleanMovie(movie) {
  if (!movie) return null;
  const out = {};
  Object.keys(movie).forEach(k => {
    if (k.startsWith('_') && !KEEP_PRIVATE.has(k)) return;
    out[k] = movie[k];
  });
  return RG.copia(out);
}

function serializePlayers() {
  return gameState.players.map(p => ({ name: p.name, stars: p.stars, timeline: p.timeline.map(cleanMovie) }));
}

function saveGame() {
  if (!gameState.started || !gameState.players.length) return;
  const movie = gameState.currentMovie;
  SAVED_GAME.salva({
    playerCount: gameState.players.length,
    targetCards: gameState.targetCards,
    eraFilter: gameState.eraFilter,
    currentPlayerIndex: gameState.currentPlayerIndex,
    roundNumber: gameState.roundNumber,
    players: serializePlayers(),
    turn: movie ? {
      movie: cleanMovie(movie),
      unlockedClues: { ...gameState.unlockedClues },
      resolved: gameState.isTurnResolved,
      guess: document.getElementById('guess-title-input').value
    } : null,
    lastTurnUndo: gameState.lastTurnUndo
  });
}

function clearSavedGame() {
  SAVED_GAME.cancella();
}

function renderResumeBox() {
  const g = SAVED_GAME.leggi();
  const box = document.getElementById('resume-box');
  if (!g) { RG.partita.riquadro(box, null); return; }
  const summary = g.players.map(p => `${p.name} ${p.timeline.length}/${g.targetCards}`).join(' – ');
  const who = g.players[g.currentPlayerIndex] ? g.players[g.currentPlayerIndex].name : '';
  RG.partita.riquadro(box, {
    riassunto: summary,
    dettaglio: `Turno ${g.roundNumber} · tocca a ${who} · salvata ${RG.partita.quando(g.savedAt)}`,
    alRiprendi: resumeSavedGame,
    alloScarto: () => {
      RG.conferma({ titolo: 'Scartare la partita?', testo: 'Le pellicole e le stelle della partita salvata andranno perse.', ok: 'Scarta', pericolo: true })
        .then(ok => { if (ok) { clearSavedGame(); renderResumeBox(); } });
    }
  });
}

async function resumeSavedGame() {
  if (preparingDeck) return;
  let g = SAVED_GAME.leggi();
  if (!g) { renderResumeBox(); return; }
  setPreparingDeck(true);
  const btn = document.querySelector('#resume-box [data-azione="riprendi"]');
  if (btn) btn.textContent = 'Preparo il mazzo…';

  // Il mazzo si ricostruisce (il catalogo live va riscaricato) senza i film già in gioco.
  // Senza connessione la partita resta salvata e si resta nella preparazione.
  const exclude = moviesInPlayKeys(g.players);
  if (g.turn && g.turn.movie) exclude.add(movieKey(g.turn.movie));
  let ready;
  try { ready = await buildPoolAndDeck(g.eraFilter, exclude); } finally { setPreparingDeck(false); }
  g = SAVED_GAME.leggi(); // nel frattempo la partita può essere stata azzerata dal menù
  if (!ready || !g) {
    if (!ready) showToast(OFFLINE_MESSAGE, 'error');
    renderResumeBox();
    return;
  }

  gameState.turnToken++;
  gameState.eraFilter = g.eraFilter;
  gameState.targetCards = g.targetCards;
  gameState.players = g.players.map(p => ({ name: p.name, stars: p.stars, timeline: p.timeline }));
  gameState.currentPlayerIndex = Math.min(g.currentPlayerIndex, g.players.length - 1);
  gameState.roundNumber = g.roundNumber;
  gameState.lastTurnUndo = g.lastTurnUndo || null;
  gameState.currentMovie = null;
  gameState.isTurnResolved = false;
  gameState.started = true;

  document.getElementById('setup-screen').classList.add('hidden');
  document.getElementById('victory-modal').classList.add('hidden');
  document.getElementById('game-screen').classList.remove('hidden');
  window.scrollTo({ top: 0 });
  showToast(`Partita ripresa: tocca a ${gameState.players[gameState.currentPlayerIndex].name}`, 'success');

  if (g.turn && g.turn.movie && !g.turn.resolved) {
    loadNextTurn({ movie: g.turn.movie, unlockedClues: g.turn.unlockedClues, guess: g.turn.guess });
  } else if (g.turn && g.turn.resolved) {
    goToNextTurn(); // il piazzamento era già registrato: si passa al turno successivo
  } else {
    startTurnForCurrentPlayer();
  }
}

// "Annulla ultimo turno": si torna a prima del piazzamento, con lo stesso film e gli stessi indizi.
// Si può fare a carta girata, nella premiazione e all'inizio del turno dopo (prima di comprare indizi).
function canUndo() {
  const u = gameState.lastTurnUndo;
  if (!u || !gameState.started) return false;
  if (gameState.isTurnResolved) return true;
  return !Object.values(gameState.unlockedClues).some(Boolean);
}

function updateUndoButtons() {
  const show = canUndo();
  document.querySelectorAll('.undo-turn-btn').forEach(b => { b.hidden = !show; });
}

function undoLastTurn() {
  if (!canUndo()) { showToast('Non c\'è un turno da annullare.', 'error'); return; }
  const u = gameState.lastTurnUndo;
  const name = u.players[u.currentPlayerIndex].name;
  RG.conferma({
    titolo: 'Annullare l\'ultimo turno?',
    testo: `Si torna a prima del piazzamento di ${name} ("${u.movie.itTitle}"): stelle e pellicole come prima, stesso film da piazzare di nuovo.`,
    ok: 'Annulla turno'
  }).then(ok => { if (ok) applyUndo(u); });
}

function applyUndo(u) {
  // Se era già uscito il film del turno dopo, torna in cima al mazzo
  if (gameState.currentMovie && !gameState.isTurnResolved && movieKey(gameState.currentMovie) !== movieKey(u.movie)) {
    gameState.deck.push(gameState.currentMovie);
  }
  gameState.players = u.players;
  gameState.currentPlayerIndex = u.currentPlayerIndex;
  gameState.roundNumber = u.roundNumber;
  gameState.lastTurnUndo = null;
  gameState.started = true;
  document.getElementById('victory-modal').classList.add('hidden');
  document.getElementById('handoff-modal').classList.add('hidden');
  document.getElementById('game-screen').classList.remove('hidden');
  document.getElementById('setup-screen').classList.add('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  loadNextTurn({ movie: u.movie, unlockedClues: u.unlockedClues, guess: u.guess });
  showToast('Turno annullato: piazza di nuovo il film.', 'info');
}

document.querySelectorAll('.undo-turn-btn').forEach(b => b.addEventListener('click', undoLastTurn));

// Se il telefono chiude la pagina, si salva l'ultimo stato (anche il titolo scritto)
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveGame(); });

// Avvio: i nomi di "Chi gioca stasera" decidono quanti giocatori proporre
(function initSetup() {
  const filled = Math.min(4, RG.squadre.posti().filter(p => p.attivo).length);
  setPlayerCount(Math.max(1, filled));
  renderPlayerNameInputs();
  renderResumeBox();
  // Pagina ricaricata con una partita in corso: si torna subito in partita
  if (SAVED_GAME.leggi() && RG.partita.ricaricata()) resumeSavedGame();
})();
