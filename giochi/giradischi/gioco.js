/*
 * Giradischi (prima "Hitstar") - logica del gioco.
 * Le liste di ricerca stanno in dati/ricerche.js; le parti comuni (memoria, nomi, suoni,
 * finestre, notifiche, salvataggio) arrivano da shared/js/ tramite l'oggetto globale RG.
 * Le icone <i class="fa-…"> sono disegnate da icone.js.
 */
RG.migrazioni.esegui('hitstar');
const ARCHIVIO = RG.archivio.spazio('hitstar');

/* ================= STATO GLOBALE DEL GIOCO ================= */
let gameState = {
    players: [],
    currentPlayerIndex: 0,
    round: 1,
    targetCards: 10,
    mode: 'classic',
    deck: [],
    currentCard: null,
    selectedSlotIndex: null,
    challenge: null,
    bonusAwarded: false,
    currentArtwork: null,
    audioMode: 'mp3',
    currentFetchId: 0
};

// Cache per anteprime audio già caricate durante la sessione
const audioCache = new Map();

// Memoria persistente dei brani già giocati nelle partite precedenti (per proporre sempre canzoni nuove)
// rg-hitstar-brani-giocati (prima: hitstar_played_songs_v1)
function getPlayedHistory() {
    const list = ARCHIVIO.leggi('brani-giocati', []);
    return new Set(Array.isArray(list) ? list : []);
}
function markSongAsPlayed(song) {
    if (!song) return;
    const history = getPlayedHistory();
    history.add(`${song.title.toLowerCase().trim()}__${song.artist.toLowerCase().trim()}`);
    // Mantieni fino a 500 brani in memoria prima di resettare ciclicamente
    ARCHIVIO.scrivi('brani-giocati', Array.from(history).slice(-500));
}

/* ================= CATALOGO LIVE ITUNES (liste in dati/ricerche.js) ================= */
const LIVE_SEARCH_POOLS = window.GIRADISCHI_DATI.ricerche;
// Raccolte, compilation, remaster o versioni non originali nel titolo dell'ALBUM (parole intere)
const BANNED_ALBUM_KEYWORDS = window.GIRADISCHI_DATI.paroleAlbumVietate;
// Nel titolo del BRANO si controllano solo le "etichette" di versione: quello che sta
// tra parentesi/quadre o dopo un trattino ("Song - Live", "Song (2011 Remaster)").
const BANNED_TRACK_VERSION_KEYWORDS = window.GIRADISCHI_DATI.paroleVersioneVietate;
// Massimo di brani per artista in un giro di ricerche: un catalogo grande non riempie il mazzo
const MAX_BRANI_PER_ARTISTA = 3;

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildWordRegex(words) {
    return new RegExp(`(^|[^a-z0-9àèéìòù])(${words.map(escapeRegex).join('|')})([^a-z0-9àèéìòù]|$)`, 'i');
}

const BANNED_ALBUM_REGEX = buildWordRegex(BANNED_ALBUM_KEYWORDS);
const BANNED_TRACK_VERSION_REGEX = buildWordRegex(BANNED_TRACK_VERSION_KEYWORDS);

// Estrae le parti "versione" di un titolo: contenuto di (...) e [...] e ciò che segue " - "
function getTrackVersionTags(trackName) {
    const tags = [];
    const re = /[\(\[]([^\)\]]*)[\)\]]/g;
    let m;
    while ((m = re.exec(trackName)) !== null) tags.push(m[1]);
    const dashIdx = trackName.indexOf(' - ');
    if (dashIdx !== -1) tags.push(trackName.substring(dashIdx + 3));
    return tags.join(' | ');
}

// Normalizza titoli/artisti per confrontarli (minuscole, senza accenti, senza "(...)" e " - ...")
function normalizeTitle(str) {
    return String(str || '')
        .toLowerCase()
        .replace(/\(.*?\)|\[.*?\]/g, ' ')
        .split(' - ')[0]
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function normalizeArtist(str) {
    const main = String(str || '').split(/\s+(?:ft\.?|feat\.?|featuring|x)\s+|&|,/i)[0];
    return normalizeTitle(main);
}

function songMatchKey(title, artist) {
    return `${normalizeTitle(title)}__${normalizeArtist(artist)}`;
}


function isOriginalNonCompilationTrack(item, genreFilter) {
    if (!item || !item.previewUrl || !item.trackName || !item.artistName || !item.releaseDate) {
        return false;
    }

    const albumLower = (item.collectionName || "").toLowerCase();
    const artistLower = item.artistName.toLowerCase();

    // Escludi artisti vari o compilation
    if (artistLower.includes("various artists") || artistLower.includes("artisti vari") || artistLower.includes("karaoke")) {
        return false;
    }

    // Escludi le compilation dichiarate da iTunes
    if (item.collectionArtistName && /various|artisti vari/i.test(item.collectionArtistName)) {
        return false;
    }

    // Parole vietate: parola intera nel titolo album, solo etichette di versione nel titolo brano
    // (se l'album ha lo stesso nome del brano è il singolo originale: es. "Live and Let Die")
    const albumIsTheSingle = normalizeTitle(albumLower).startsWith(normalizeTitle(item.trackName));
    if (!albumIsTheSingle && BANNED_ALBUM_REGEX.test(albumLower)) return false;
    const versionTags = getTrackVersionTags(item.trackName);
    if (versionTags && BANNED_TRACK_VERSION_REGEX.test(versionTags)) return false;

    // Estrai anno di pubblicazione originale
    const year = parseInt(item.releaseDate.substring(0, 4), 10);
    if (isNaN(year) || year < 1955 || year > 2026) return false;

    // Rispetta i filtri temporali selezionati
    if (!yearMatchesFilter(year, genreFilter)) return false;

    // Classici Anni '70 - '80: solo canzoni pop (niente rock, metal, rap, soul, blues…)
    if (!genereAmmesso(item.primaryGenreName, genreFilter)) return false;

    return true;
}

// Nel catalogo "70-80" entra solo ciò che iTunes classifica come pop (es. "Pop", "Italian Pop")
function genereAmmesso(genere, genreFilter) {
    if (genreFilter !== '7080') return true;
    return /pop/i.test(genere || '');
}

async function fetchLiveItunesPool(genreFilter, queryCount = 7) {
    const queries = LIVE_SEARCH_POOLS[genreFilter] || LIVE_SEARCH_POOLS.all;
    // Pesca alcune query diverse ogni volta (25 risultati ciascuna)
    const selectedQueries = shuffleArray(queries).slice(0, queryCount);
    const liveTracks = [];
    const seenKeys = new Set();
    // Anno più vecchio visto per ogni brano tra TUTTE le versioni restituite (anche compilation):
    // una ristampa ha sempre una data uguale o successiva all'originale, quindi il minimo è il più affidabile
    const minYearByKey = new Map();

    let failed = 0;
    const requests = selectedQueries.map(async (q) => {
        try {
            const isItalianQuery = genreFilter === 'italian' || genreFilter === 'napoletane' || /ital|sanremo|vasco|battisti|mina|celentano|pausini|ramazzotti|jovanotti|883|cremonini|ferro|mengoni|mahmood|ligabue|maneskin/i.test(q);
            const country = isItalianQuery ? 'IT' : 'US';
            const url = `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&country=${country}&media=music&entity=song&limit=25`;
            const data = await itunesRequest(url, 6000);
            if (!data || !data.results) return;

            data.results.forEach(item => {
                if (item && item.trackName && item.artistName && item.releaseDate) {
                    const k = songMatchKey(item.trackName, item.artistName);
                    const y = parseInt(item.releaseDate.substring(0, 4), 10);
                    if (!isNaN(y) && (!minYearByKey.has(k) || y < minYearByKey.get(k))) minYearByKey.set(k, y);
                }

                if (!isOriginalNonCompilationTrack(item, genreFilter)) return;

                const cleanTitle = item.trackName.trim();
                const cleanArtist = item.artistName.trim();
                const dedupeKey = songMatchKey(cleanTitle, cleanArtist);
                if (seenKeys.has(dedupeKey)) return;
                seenKeys.add(dedupeKey);

                const year = parseInt(item.releaseDate.substring(0, 4), 10);
                const songId = `live_${item.trackId}`;
                const artworkUrl = item.artworkUrl100 ? item.artworkUrl100.replace('100x100bb', '300x300bb') : null;

                audioCache.set(songId, {
                    previewUrl: item.previewUrl,
                    artworkUrl: artworkUrl
                });

                liveTracks.push({
                    id: songId,
                    preview: item.previewUrl,
                    artwork: artworkUrl,
                    title: cleanTitle,
                    artist: cleanArtist,
                    year: year,
                    matchKey: dedupeKey,
                    country: country,
                    yearVerified: false,
                    genre: item.primaryGenreName || "Hit Live",
                    isItalian: country === 'IT',
                    trivia: `Dall'album "${item.collectionName}" • Catalogo live iTunes.`,
                    spotifyUrl: `https://open.spotify.com/search/${encodeURIComponent(`${cleanTitle} ${cleanArtist}`)}`
                });
            });
        } catch (e) {
            // query fallita: si prosegue con le altre
            failed++;
        }
    });

    await Promise.all(requests);
    fetchLiveItunesPool.allFailed = selectedQueries.length > 0 && failed === selectedQueries.length;

    // Primo filtro, senza altre richieste: se nei risultati stessi c'è una versione
    // dello stesso brano uscita in un anno precedente, questa è una ristampa → scartata
    const filteredTracks = [];
    liveTracks.forEach(t => {
        if (minYearByKey.has(t.matchKey) && minYearByKey.get(t.matchKey) < t.year) return;
        if (!yearMatchesFilter(t.year, genreFilter)) return;
        filteredTracks.push(t);
    });
    return filteredTracks;
}

// Massimo di brani per artista nel mazzo: un catalogo grande (Queen, Vasco…) non lo deve riempire.
// `giaPresenti` conta i brani già in partita per artista (vedi contaArtistiInPartita).
function limitaPerArtista(tracce, giaPresenti = new Map()) {
    const conteggio = new Map(giaPresenti);
    return tracce.filter(t => {
        const artista = normalizeArtist(t.artist);
        const quanti = conteggio.get(artista) || 0;
        if (quanti >= MAX_BRANI_PER_ARTISTA) return false;
        conteggio.set(artista, quanti + 1);
        return true;
    });
}

// Quanti brani per artista ci sono già in partita: timeline, carta girata, pronte e mazzo
function contaArtistiInPartita(gs) {
    const conteggio = new Map();
    const aggiungi = (c) => {
        if (!c) return;
        const artista = normalizeArtist(c.artist);
        conteggio.set(artista, (conteggio.get(artista) || 0) + 1);
    };
    gs.players.forEach(p => p.timeline.forEach(aggiungi));
    aggiungi(gs.currentCard);
    gs.readyCards.forEach(aggiungi);
    gs.deck.forEach(aggiungi);
    return conteggio;
}

function yearMatchesFilter(year, genreFilter) {
    if (genreFilter === '7080') return year >= 1970 && year <= 1989;
    if (genreFilter === '9000') return year >= 1990 && year <= 2009;
    if (genreFilter === 'modern') return year >= 2010;
    if (genreFilter === 'napoletane') return year >= 1990;
    return true;
}

/* ================= CONTROLLO "VERSIONE ORIGINALE" =================
   Un brano si fa ascoltare SOLO se non esistono versioni precedenti dello stesso brano
   (stesso titolo, stesso artista) uscite in un anno più vecchio. Due controlli:
   1) iTunes: tutte le versioni dello stesso brano presenti nel catalogo
   2) MusicBrainz: archivio musicale pubblico che registra la data della PRIMA uscita
      di ogni registrazione (scopre le ristampe anche quando l'originale non è su iTunes)
   Risultato: 'ok' (si può giocare), 'reissue' (scartato), 'unknown' (nessuna fonte ha risposto). */

function artistsMatch(a, b) {
    if (!a || !b) return false;
    return a === b || a.includes(b) || b.includes(a);
}

async function checkItunesEarlierVersions(song) {
    const wantTitle = normalizeTitle(song.title);
    const wantArtist = normalizeArtist(song.artist);
    const term = `${song.title.replace(/\(.*?\)|\[.*?\]/g, '').split(' - ')[0]} ${song.artist.split(/ ft\.| feat\.|&|,/i)[0]}`.trim();
    try {
        const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&country=${song.country || 'US'}&media=music&entity=song&limit=50`;
        const data = await itunesRequest(url, 6000);
        if (!data) return 'unknown';
        for (const r of (data.results || [])) {
            if (!r.trackName || !r.artistName || !r.releaseDate) continue;
            if (normalizeTitle(r.trackName) !== wantTitle) continue;
            if (!artistsMatch(normalizeArtist(r.artistName), wantArtist)) continue;
            const y = parseInt(r.releaseDate.substring(0, 4), 10);
            if (!isNaN(y) && y < song.year) return 'reissue';
        }
        return 'ok';
    } catch (e) {
        return 'unknown';
    }
}

// MusicBrainz chiede al massimo ~1 richiesta al secondo: le mettiamo in fila
let musicBrainzQueue = Promise.resolve();
let musicBrainzLastCall = 0;

function checkMusicBrainzFirstRelease(song) {
    const job = musicBrainzQueue.then(async () => {
        // MusicBrainz risponde 503 se si va troppo veloci: richieste distanziate e un secondo tentativo
        const callMusicBrainz = async (url) => {
            for (let attempt = 0; attempt < 2; attempt++) {
                const wait = Math.max(0, 1400 - (Date.now() - musicBrainzLastCall)) + (attempt ? 1500 : 0);
                if (wait) await new Promise(r => setTimeout(r, wait));
                musicBrainzLastCall = Date.now();
                const res = await fetchWithTimeout(url, 5000);
                if (res.status !== 503) return res;
            }
            return null;
        };

        const wantTitle = normalizeTitle(song.title);
        const wantArtist = normalizeArtist(song.artist);
        const cleanForQuery = (str) => str.replace(/\(.*?\)|\[.*?\]/g, '').split(' - ')[0].replace(/["\\]/g, ' ').trim();
        const q = `recording:"${cleanForQuery(song.title)}" AND artist:"${cleanForQuery(song.artist.split(/ ft\.| feat\.|&|,/i)[0])}"`;
        try {
            const url = `https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(q)}&fmt=json&limit=15`;
            const res = await callMusicBrainz(url);
            if (!res || !res.ok) return 'unknown';
            const data = await res.json();
            const recordings = data.recordings || [];
            // 'ok' solo se una registrazione dello stesso brano e artista ha una data di prima uscita:
            // se non la troviamo, il controllo non ha confermato nulla (è 'unknown', non 'ok')
            let confermata = false;
            for (const rec of recordings) {
                if (normalizeTitle(rec.title) !== wantTitle) continue;
                const credit = (rec['artist-credit'] || []).map(c => c.name || (c.artist && c.artist.name) || '').join(' ');
                if (!artistsMatch(normalizeArtist(credit), wantArtist)) continue;
                const first = rec['first-release-date'];
                if (!first) continue;
                const y = parseInt(first.substring(0, 4), 10);
                if (isNaN(y)) continue;
                if (y < song.year) return 'reissue';
                confermata = true;
            }
            return confermata ? 'ok' : 'unknown';
        } catch (e) {
            return 'unknown';
        }
    });
    musicBrainzQueue = job.catch(() => {});
    return job;
}

async function checkIsOriginalRelease(song) {
    if (!song) return 'reissue';
    if (song.originalCheck) return song.originalCheck;
    const [itunes, mb] = await Promise.all([checkItunesEarlierVersions(song), checkMusicBrainzFirstRelease(song)]);
    let result;
    // iTunes può solo scartare (versione precedente trovata). Il "buono" lo dà MusicBrainz, che conosce
    // la prima uscita: un "ok" di iTunes non basta, perché cerca solo nel negozio del paese della carta
    // (es. un brano italiano degli anni 70 con una ristampa del 2005 su iTunes US passava).
    if (itunes === 'reissue' || mb === 'reissue') result = 'reissue';
    else if (mb === 'ok') result = 'ok';
    else result = 'unknown';
    song.originalCheck = result;
    return result;
}

/* ================= MAZZO VERIFICATO =================
   Le carte vengono controllate in anticipo, in sottofondo, così di solito
   quando tocca a un giocatore la carta successiva è già pronta. */
const READY_BUFFER = 2;

function usedSongKeys(gs) {
    const keys = new Set(gs.usedKeys || []);
    gs.players.forEach(p => p.timeline.forEach(c => keys.add(c.matchKey)));
    if (gs.currentCard) keys.add(gs.currentCard.matchKey);
    gs.readyCards.forEach(c => keys.add(c.matchKey));
    return keys;
}

async function refillDeckOnline(gs) {
    const fresh = await fetchLiveItunesPool(gs.genreFilter, 4);
    gs.networkDown = fetchLiveItunesPool.allFailed;
    const used = usedSongKeys(gs);
    const inDeck = new Set(gs.deck.map(c => c.matchKey));
    const nuovi = fresh.filter(t => !used.has(t.matchKey) && !inDeck.has(t.matchKey));
    const add = limitaPerArtista(nuovi, contaArtistiInPartita(gs));
    gs.deck = [...shuffleArray(add), ...gs.deck];
    return add.length;
}

function fillReadyCards(gs, target = READY_BUFFER) {
    if (gs.validating) return gs.validating;
    gs.validating = (async () => {
        let emptyRefills = 0;
        while (gs.readyCards.length < target && !gs.ended) {
            if (gs.deck.length === 0) {
                const added = await refillDeckOnline(gs);
                if (added === 0) {
                    if (gs.networkDown) break; // senza connessione è inutile riprovare subito
                    emptyRefills++;
                    if (emptyRefills >= 3) break;
                    continue;
                }
            }
            const card = gs.deck.pop();
            if (!card) continue;
            gs.usedKeys.add(card.matchKey);
            const result = await checkIsOriginalRelease(card);
            if (result === 'ok') {
                gs.unknownStreak = 0;
                gs.readyCards.push(card);
            } else if (result === 'reissue') {
                gs.discardedReissues++;
            } else {
                // Nessuna fonte ha risposto (connessione o limiti di richieste):
                // per non bloccare la partita, dopo 3 casi di fila la carta viene accettata
                gs.unknownStreak++;
                if (gs.unknownStreak >= 3) {
                    gs.readyCards.push(card);
                    if (!gs.warnedUnknown) {
                        gs.warnedUnknown = true;
                        showToast("Il controllo delle versioni non risponde: alcune carte potrebbero non essere verificate.", "warning");
                    }
                } else {
                    await new Promise(r => setTimeout(r, 800));
                }
            }
        }
    })().finally(() => { gs.validating = null; });
    return gs.validating;
}

// Restituisce la prossima carta già verificata (aspetta se serve). null se il catalogo è finito.
async function takeVerifiedCard(gs) {
    for (let attempt = 0; attempt < 3; attempt++) {
        if (gs.readyCards.length > 0) {
            const card = gs.readyCards.shift();
            fillReadyCards(gs); // prepara la successiva in sottofondo
            return card;
        }
        await fillReadyCards(gs, 1);
    }
    return null;
}

// Easter egg: la cacca stilizzata compare SOLO sul retro della carta, dopo la rivelazione,
// al posto della copertina (così durante l'ascolto non svela che il brano è di Vasco).
// Restituisce true se l'easter egg è stato mostrato.
function updateRevealEasterEgg(song) {
    const poopEl = document.getElementById('vasco-poop-disc');
    if (!poopEl) return false;
    const isVasco = Boolean(song && song.artist && song.artist.toLowerCase().includes('vasco rossi'));
    poopEl.classList.toggle('hidden', !isVasco);
    return isVasco;
}

/* ================= EFFETTI SONORI (shared/js/suoni.js, muto condiviso) ================= */
const SOUND_TYPES = { click: 'click', success: 'successo', error: 'errore', coin: 'moneta' };

function playSound(type) {
    RG.suoni.effetto(SOUND_TYPES[type] || type);
}

function toggleMute() {
    RG.suoni.alterna();
}

function renderMuteButton() {
    const btn = document.getElementById('btn-mute');
    btn.innerHTML = RG.suoni.muto
        ? '<i class="fa-solid fa-volume-xmark text-rose-400"></i>'
        : '<i class="fa-solid fa-volume-high"></i>';
    btn.setAttribute('aria-label', RG.suoni.muto ? 'Effetti sonori spenti' : 'Effetti sonori accesi');
}

/* ================= PLAYER AUDIO DIRETTO IN-PAGE (ANTEPRIMA ITUNES) ================= */
function formatSeconds(sec) {
    if (!sec || isNaN(sec)) return "0:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
}

// Richiesta a iTunes in formato JSONP (tramite <script>): iTunes rifiuta le normali fetch()
// quando il gioco è aperto come file dal computer, mentre il JSONP funziona ovunque.
let itunesCallbackCounter = 0;
function itunesRequest(url, timeoutMs = 6000) {
    return new Promise((resolve, reject) => {
        const cbName = `__itunesCb_${Date.now()}_${itunesCallbackCounter++}`;
        const script = document.createElement('script');
        let finished = false;
        const cleanup = () => {
            finished = true;
            clearTimeout(timer);
            // la callback resta definita (vuota) per evitare errori se la risposta arriva in ritardo
            window[cbName] = () => { try { delete window[cbName]; } catch (e) {} };
            script.remove();
        };
        const timer = setTimeout(() => { if (!finished) { cleanup(); reject(new Error('timeout')); } }, timeoutMs);
        window[cbName] = (data) => { if (!finished) { cleanup(); resolve(data); } };
        script.onerror = () => { if (!finished) { cleanup(); reject(new Error('network')); } };
        script.src = `${url}${url.includes('?') ? '&' : '?'}callback=${cbName}`;
        document.head.appendChild(script);
    });
}

function fetchWithTimeout(url, timeoutMs = 2500) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, { signal: controller.signal })
        .then(res => {
            clearTimeout(timer);
            return res;
        })
        .catch(err => {
            clearTimeout(timer);
            throw err;
        });
}

function setPlayingVisuals(isPlaying) {
    document.getElementById('vinyl-disc').classList.toggle('vinyl-spinning', isPlaying);
    document.getElementById('audio-equalizer').classList.toggle('eq-playing', isPlaying);
}

function setAudioStatus(html) {
    document.getElementById('audio-status-text').innerHTML = html;
}

function setPlayButton(icon, text, disabled = false) {
    document.getElementById('play-pause-icon').className = `fa-solid ${icon}`;
    document.getElementById('play-pause-text').textContent = text;
    document.getElementById('btn-play-pause').disabled = disabled;
}

function loadMysteryAudioPreview(song) {
    const audioEl = document.getElementById('mystery-audio-player');
    audioEl.pause();
    audioEl.removeAttribute('src');
    audioEl.load();
    setPlayingVisuals(false);

    const cached = audioCache.get(song.id) || (song.preview ? { previewUrl: song.preview, artworkUrl: song.artwork || null } : null);
    gameState.currentArtwork = cached ? cached.artworkUrl : null;
    document.getElementById('audio-progress').value = 0;
    document.getElementById('audio-current-time').textContent = "0:00";
    document.getElementById('audio-duration').textContent = "0:30";

    if (cached && cached.previewUrl) {
        audioEl.src = cached.previewUrl;
        setAudioStatus('<i class="fa-solid fa-music text-emerald-400"></i> Anteprima Originale (30s)');
        setPlayButton('fa-play', 'ASCOLTA ORA');
    } else {
        // Non dovrebbe succedere (i brani senza anteprima vengono scartati prima)
        replaceUnplayableCard();
    }
}

// Se l'anteprima non si riesce a riprodurre, la carta viene sostituita gratis
let replacingCard = false;
async function replaceUnplayableCard() {
    if (replacingCard || gameState.revealed || !gameState.currentCard) return;
    replacingCard = true;
    showToast("Anteprima non disponibile: pesco un altro brano (gratis).", "info");
    await drawNextCard();
    replacingCard = false;
}

function togglePlayMysteryAudio() {
    const audioEl = document.getElementById('mystery-audio-player');
    if (!gameState.currentCard && gameState.players.length && !gameState.ended && gameState.networkDown) {
        drawNextCard();
        return;
    }
    if (!audioEl.src) return;
    if (audioEl.paused) {
        audioEl.volume = parseFloat(document.getElementById('audio-volume').value || 0.85);
        audioEl.play().catch((err) => {
            if (err && err.name === 'NotAllowedError') {
                showToast("Il browser ha bloccato l'audio: premi di nuovo Ascolta.", "info");
            } else {
                replaceUnplayableCard();
            }
        });
    } else {
        audioEl.pause();
    }
}

function pauseMysteryAudio() {
    const audioEl = document.getElementById('mystery-audio-player');
    if (!audioEl.paused) audioEl.pause();
}

function restartMysteryAudio() {
    const audioEl = document.getElementById('mystery-audio-player');
    if (!audioEl.src) return;
    audioEl.currentTime = 0;
    audioEl.play().catch(() => {});
}

function seekMysteryAudio(percent) {
    const audioEl = document.getElementById('mystery-audio-player');
    if (audioEl.duration) {
        audioEl.currentTime = (percent / 100) * audioEl.duration;
    }
}

function setMysteryVolume(val) {
    const audioEl = document.getElementById('mystery-audio-player');
    audioEl.volume = parseFloat(val);
}

function setupAudioListeners() {
    const audioEl = document.getElementById('mystery-audio-player');
    const progressSlider = document.getElementById('audio-progress');
    const currentTimeLabel = document.getElementById('audio-current-time');
    const durationLabel = document.getElementById('audio-duration');

    audioEl.addEventListener('play', () => {
        setPlayingVisuals(true);
        setPlayButton('fa-pause', 'PAUSA');
        if (!gameState.revealed) {
            document.getElementById('phase-title').textContent = "2. Scegli dove inserire la carta!";
            document.getElementById('phase-desc').textContent = "Ascolta il brano e clicca su uno degli slot '+' nella tua timeline qui sotto.";
        }
    });

    audioEl.addEventListener('pause', () => {
        setPlayingVisuals(false);
        if (!audioEl.ended) setPlayButton('fa-play', 'RIPRENDI');
    });

    audioEl.addEventListener('ended', () => {
        setPlayingVisuals(false);
        setPlayButton('fa-rotate-right', 'RIASCOLTA');
        progressSlider.value = 0;
        currentTimeLabel.textContent = "0:00";
    });

    audioEl.addEventListener('loadedmetadata', () => {
        if (audioEl.duration && !isNaN(audioEl.duration)) {
            durationLabel.textContent = formatSeconds(audioEl.duration);
        }
    });

    audioEl.addEventListener('timeupdate', () => {
        if (audioEl.duration && !isNaN(audioEl.duration)) {
            progressSlider.value = (audioEl.currentTime / audioEl.duration) * 100;
            currentTimeLabel.textContent = formatSeconds(audioEl.currentTime);
        }
    });

    audioEl.addEventListener('error', () => {
        // Errore di caricamento dell'anteprima (non quello causato dal reset del src)
        if (audioEl.getAttribute('src')) replaceUnplayableCard();
    });
}

/* ================= NOTIFICHE (shared/js/dialoghi.js) ================= */
const TOAST_TYPES = { info: 'info', success: 'successo', error: 'errore', warning: 'avviso' };
function showToast(message, type = 'info') {
    RG.toast(message, TOAST_TYPES[type] || 'info', 3500);
}

// Rende sicuro un testo prima di inserirlo nell'HTML (nomi giocatori, titoli da iTunes con virgolette, ecc.)
const escapeHtml = RG.esc;

// Il link Spotify non contiene più titolo/artista nell'href (che si leggeva passandoci sopra col mouse):
// l'indirizzo viene costruito solo al momento del clic
function openSpotifyForCurrentCard(event) {
    if (event) event.preventDefault();
    pauseMysteryAudio();
    if (gameState.currentCard && gameState.currentCard.spotifyUrl) {
        window.open(gameState.currentCard.spotifyUrl, '_blank', 'noopener,noreferrer');
    }
}

/* ================= CONFIGURAZIONE GIOCATORI ================= */
// Nomi: "Chi gioca stasera" di Combriccola (fino a 6 posti)
let setupPlayerCount = 2;
const defaultNames = ["Giocatore 1", "Giocatore 2", "Giocatore 3", "Giocatore 4", "Giocatore 5", "Giocatore 6"];

function renderPlayerInputs() {
    const container = document.getElementById('player-inputs-container');
    const existingValues = Array.from(container.querySelectorAll('input')).map(inp => inp.value);
    const sharedNames = RG.squadre.nomi(6, defaultNames);
    container.innerHTML = '';

    for (let i = 0; i < setupPlayerCount; i++) {
        const val = existingValues[i] !== undefined ? existingValues[i] : sharedNames[i];
        const div = document.createElement('div');
        div.className = 'flex items-center gap-2 bg-white/5 px-3 py-2 rounded-xl border border-white/10 focus-within:border-pink-400 transition';
        div.innerHTML = `
            <span class="w-6 h-6 rounded-full bg-gradient-to-tr from-pink-500 to-purple-500 text-[11px] font-black flex items-center justify-center text-white">${i + 1}</span>
            <input type="text" maxlength="18" value="${escapeHtml(val)}" placeholder="Nome Giocatore ${i + 1}" class="player-name-input bg-transparent text-white text-sm font-medium w-full focus:outline-none">
        `;
        container.appendChild(div);
    }
    document.getElementById('player-count-badge').textContent = setupPlayerCount;
}

function addPlayerInput() {
    if (setupPlayerCount < 6) {
        playSound('click');
        setupPlayerCount++;
        renderPlayerInputs();
    }
}

function removePlayerInput() {
    if (setupPlayerCount > 1) {
        playSound('click');
        setupPlayerCount--;
        renderPlayerInputs();
    }
}

/* ================= LOGICA DI AVVIO PARTITA ================= */
const shuffleArray = RG.mescola;

async function startGame() {
    playSound('click');
    const startBtn = document.getElementById('btn-start-game');
    const originalBtnHtml = startBtn ? startBtn.innerHTML : '';
    const setBtn = (html) => { if (startBtn) startBtn.innerHTML = html; };
    if (startBtn) startBtn.disabled = true;
    setBtn('<i class="fa-solid fa-circle-notch fa-spin"></i> CARICAMENTO BRANI...');

    try {
        const inputs = document.querySelectorAll('.player-name-input');
        const names = Array.from(inputs).map((inp, i) => inp.value.trim() || `Giocatore ${i + 1}`);
        RG.squadre.salva(names, defaultNames);

        const genreFilter = document.getElementById('genre-filter').value;
        const gameMode = document.getElementById('game-mode').value;
        const targetCards = parseInt(document.getElementById('target-cards').value, 10);

        const liveTracks = limitaPerArtista(await fetchLiveItunesPool(genreFilter));
        if (liveTracks.length === 0) {
            showToast("Impossibile caricare i brani: Giradischi ha bisogno di internet. Controlla la connessione e riprova.", "error");
            return;
        }

        // Dai priorità ai brani MAI usciti nelle partite precedenti
        // (pop() pesca dalla fine, quindi i brani nuovi vanno in fondo all'array)
        const playedHistory = getPlayedHistory();
        const histKey = (t) => `${t.title.toLowerCase().trim()}__${t.artist.toLowerCase().trim()}`;
        const unseenSongs = liveTracks.filter(t => !playedHistory.has(histKey(t)));
        const seenSongs = liveTracks.filter(t => playedHistory.has(histKey(t)));

        const gs = {
            players: names.map((name, idx) => ({ id: idx, name, tokens: 2, timeline: [] })),
            currentPlayerIndex: 0,
            round: 1,
            targetCards,
            mode: gameMode,
            genreFilter,
            deck: [...shuffleArray(seenSongs), ...shuffleArray(unseenSongs)],
            readyCards: [],
            usedKeys: new Set(),
            validating: null,
            discardedReissues: 0,
            unknownStreak: 0,
            warnedUnknown: false,
            ended: false,
            currentCard: null,
            selectedSlotIndex: null,
            challenge: null,
            bonusAwarded: false,
            currentArtwork: null,
            revealed: false,
            esito: null,
            lastTurnUndo: null,
            networkDown: false
        };

        // Carte iniziali: anche queste solo se versioni originali
        for (let i = 0; i < gs.players.length; i++) {
            setBtn(`<i class="fa-solid fa-circle-notch fa-spin"></i> VERIFICA VERSIONI ORIGINALI (${i + 1}/${gs.players.length})...`);
            const starter = await takeVerifiedCard(gs);
            if (!starter) {
                showToast("Non ho trovato abbastanza brani originali verificati. Riprova o cambia catalogo.", "error");
                gs.ended = true;
                return;
            }
            markSongAsPlayed(starter);
            gs.players[i].timeline.push(starter);
        }

        if (gameState.players && gameState.players.length) gameState.ended = true; // ferma eventuali verifiche della partita precedente
        gameState = gs;

        document.getElementById('setup-screen').classList.add('hidden');
        document.getElementById('victory-screen').classList.add('hidden');
        document.getElementById('game-screen').classList.remove('hidden');
        document.getElementById('btn-reset-header').classList.remove('hidden');

        await drawNextCard();
    } finally {
        if (startBtn) {
            startBtn.disabled = false;
            startBtn.innerHTML = originalBtnHtml;
        }
    }
}

// Mostra lo stato "sto verificando il prossimo brano" sulla carta coperta
function setCardLoading(isLoading) {
    if (isLoading) {
        setAudioStatus('<i class="fa-solid fa-circle-notch fa-spin text-amber-300"></i> Verifica versione originale...');
        setPlayButton('fa-hourglass-half', 'ATTENDI...', true);
        document.getElementById('btn-confirm-placement').disabled = true;
        lockActivePlayerPowers();
    }
}

let drawingCard = false;
async function drawNextCard() {
    if (drawingCard) return;
    drawingCard = true;
    const gs = gameState;
    try {
        pauseMysteryAudio();
        gs.currentCard = null;
        gs.selectedSlotIndex = null;
        gs.challenge = null;
        gs.bonusAwarded = false;
        gs.revealed = false;
        document.getElementById('mystery-card-inner').classList.remove('is-flipped');
        renderGameDashboard();
        setCardLoading(true);

        gs.esito = null;
        const card = await takeVerifiedCard(gs);
        if (gs !== gameState || gs.ended) return;
        if (!card) {
            if (gs.networkDown) {
                // Connessione assente: la partita resta salvata, si riprova quando torna la rete
                showToast("Serve la connessione per pescare un brano: tocca Riprova quando sei online.", "error");
                setAudioStatus('<i class="fa-solid fa-triangle-exclamation text-amber-300"></i> Nessuna connessione');
                setPlayButton('fa-rotate-right', 'RIPROVA');
                saveGame();
                return;
            }
            showToast("Catalogo esaurito: non ci sono altri brani originali verificati.", "error");
            endGameNoCards();
            return;
        }
        gs.currentCard = card;
        markSongAsPlayed(card);
        renderGameDashboard();
        loadMysteryAudioPreview(card);
        updateUndoButtons();
        saveGame();
    } finally {
        drawingCard = false;
    }
}

// Se i brani finiscono prima che qualcuno vinca, vince chi ha più carte
function endGameNoCards() {
    const best = [...gameState.players].sort((a, b) => b.timeline.length - a.timeline.length || b.tokens - a.tokens)[0];
    showVictory(best);
}

/* ================= RENDERING DASHBOARD DI GIOCO ================= */
function renderScoreboard() {
    const scoreboard = document.getElementById('scoreboard-bar');
    scoreboard.innerHTML = gameState.players.map((p, idx) => {
        const isTurn = idx === gameState.currentPlayerIndex;
        return `
            <div class="p-3 rounded-2xl border transition ${isTurn ? 'bg-gradient-to-br from-pink-600/30 to-purple-900/40 border-pink-400 shadow-lg shadow-pink-500/20' : 'bg-white/5 border-white/10 opacity-75'}">
                <div class="flex items-center justify-between mb-1">
                    <span class="text-xs font-extrabold truncate ${isTurn ? 'text-white' : 'text-gray-300'}">${escapeHtml(p.name)}</span>
                    ${isTurn ? '<span class="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span>' : ''}
                </div>
                <div class="flex items-center justify-between text-xs">
                    <span class="font-bold text-cyan-300"><i class="fa-solid fa-compact-disc mr-1"></i>${p.timeline.length}/${gameState.targetCards}</span>
                    <span class="font-bold text-amber-300"><i class="fa-solid fa-coins mr-1"></i>${p.tokens}</span>
                </div>
            </div>
        `;
    }).join('');
}

function renderGameDashboard() {
    const activePlayer = gameState.players[gameState.currentPlayerIndex];
    const card = gameState.currentCard;

    renderScoreboard();

    // Info Turno
    document.getElementById('round-indicator').textContent = `Round ${gameState.round}`;
    document.getElementById('active-player-name').textContent = activePlayer.name;
    document.getElementById('goal-display').textContent = gameState.targetCards;
    document.getElementById('active-player-tokens').textContent = activePlayer.tokens;
    document.getElementById('timeline-owner-name').textContent = activePlayer.name;

    // Fase
    document.getElementById('phase-title').textContent = "1. Ascolta il brano misterioso";
    document.getElementById('phase-desc').textContent = "Premi \"Ascolta Ora\" sul disco qui a fianco e poi clicca su uno slot '+' nella timeline.";

    // Poteri Gettoni (con controlli null-safe)
    const skipBtn = document.getElementById('btn-skip-song');
    const buyBtn = document.getElementById('btn-buy-card');
    if (skipBtn) skipBtn.disabled = activePlayer.tokens < 1;
    if (buyBtn) buyBtn.disabled = activePlayer.tokens < 3;

    // Carta Misteriosa: l'easter egg di Vasco resta nascosto finché la carta non viene girata
    updateRevealEasterEgg(null);
    document.getElementById('mystery-genre-hint').textContent = card ? `Genere: ${card.genre}` : 'Genere: ...';

    // Controlli timeline
    document.getElementById('selected-slot-summary').innerHTML = `Nessuna posizione selezionata`;
    document.getElementById('btn-confirm-placement').disabled = true;
    document.getElementById('btn-open-challenge').disabled = true;

    renderTimeline();
}

function renderTimeline() {
    const activePlayer = gameState.players[gameState.currentPlayerIndex];
    const container = document.getElementById('timeline-container');
    const cards = activePlayer.timeline;

    let html = '';

    for (let i = 0; i <= cards.length; i++) {
        const isSelected = gameState.selectedSlotIndex === i;
        const isChallengedSlot = gameState.challenge && gameState.challenge.slotIndex === i;

        let labelHint = '';
        if (i === 0) labelHint = `Prima del ${cards[0].year}`;
        else if (i === cards.length) labelHint = `Dopo il ${cards[cards.length - 1].year}`;
        else labelHint = `${cards[i - 1].year} - ${cards[i].year}`;

        html += `
            <button onclick="selectTimelineSlot(${i})" ${gameState.revealed ? 'disabled' : ''} class="flex-shrink-0 w-24 sm:w-28 h-40 rounded-2xl border-2 border-dashed transition flex flex-col items-center justify-center p-2 text-center group disabled:opacity-40 disabled:pointer-events-none ${isSelected ? 'slot-selected text-white' : 'border-white/25 bg-white/5 hover:bg-cyan-500/15 hover:border-cyan-400 text-gray-300'}">
                <div class="w-9 h-9 rounded-full flex items-center justify-center mb-2 transition ${isSelected ? 'bg-cyan-400 text-gray-950' : 'bg-white/10 group-hover:bg-cyan-400 group-hover:text-gray-950'}">
                    <i class="fa-solid ${isSelected ? 'fa-check' : 'fa-plus'} font-black"></i>
                </div>
                <span class="text-[11px] font-bold leading-tight">${isSelected ? 'SELEZIONATO' : 'Inserisci qui'}</span>
                <span class="text-[10px] text-gray-400 mt-1 leading-tight">${labelHint}</span>
                ${isChallengedSlot ? `<span class="mt-1.5 px-1.5 py-0.5 rounded bg-amber-500 text-gray-950 font-black text-[9px]">SFIDA: ${escapeHtml(gameState.challenge.challengerName)}</span>` : ''}
            </button>
        `;

        if (i < cards.length) {
            const c = cards[i];
            html += `
                <div class="flex-shrink-0 w-36 sm:w-40 h-44 rounded-2xl bg-gradient-to-b from-[#1e1b4b] to-[#0f172a] border border-cyan-400/40 p-3 flex flex-col justify-between shadow-lg relative overflow-hidden">
                    <div class="flex items-center justify-between">
                        <span class="text-[10px] font-bold uppercase text-cyan-300 truncate max-w-[90px]">${escapeHtml(c.genre)}</span>
                        <i class="fa-solid fa-music text-pink-400 text-xs"></i>
                    </div>
                    <div class="my-1 text-center">
                        <div class="font-display text-3xl font-black text-white tracking-tight">${c.year}</div>
                    </div>
                    <div class="bg-black/35 p-2 rounded-xl border border-white/5">
                        <p class="text-xs font-bold text-white truncate" title="${escapeHtml(c.title)}">${escapeHtml(c.title)}</p>
                        <p class="text-[10px] text-pink-300 truncate" title="${escapeHtml(c.artist)}">${escapeHtml(c.artist)}</p>
                    </div>
                </div>
            `;
        }
    }

    container.innerHTML = html;
}

function selectTimelineSlot(slotIdx) {
    // Dopo la rivelazione la timeline è bloccata (prima si poteva confermare due volte la stessa carta)
    // e mentre si verifica il prossimo brano non c'è ancora nessuna carta da piazzare
    if (gameState.revealed || !gameState.currentCard) return;
    // Dopo una sfida il giocatore di turno non può più spostare la sua scelta
    if (gameState.challenge) {
        showToast("Posizione bloccata: c'è una sfida in corso! Conferma la posizione.", "warning");
        return;
    }
    playSound('click');
    gameState.selectedSlotIndex = slotIdx;
    updateSelectionUI();
    renderTimeline();
    saveGame();
}

// Riepilogo della posizione scelta e stato dei pulsanti Conferma / Sfida
function updateSelectionUI() {
    const slotIdx = gameState.selectedSlotIndex;
    if (slotIdx === null || slotIdx === undefined || gameState.revealed) return;
    const activePlayer = gameState.players[gameState.currentPlayerIndex];
    const cards = activePlayer.timeline;
    let desc = '';

    if (slotIdx === 0) {
        desc = `Prima del ${cards[0].year}`;
    } else if (slotIdx === cards.length) {
        desc = `Dopo il ${cards[cards.length - 1].year}`;
    } else {
        desc = `Tra ${cards[slotIdx - 1].year} e ${cards[slotIdx].year}`;
    }

    document.getElementById('selected-slot-summary').innerHTML = `<span class="text-cyan-300 font-bold">${desc}</span>`;
    document.getElementById('btn-confirm-placement').disabled = false;

    const eligibleChallengers = gameState.players.filter((p, idx) => idx !== gameState.currentPlayerIndex && p.tokens >= 1);
    document.getElementById('btn-open-challenge').disabled = eligibleChallengers.length === 0 || !!gameState.challenge;
    if (gameState.challenge) lockActivePlayerPowers();
}

// Disabilita i poteri del giocatore di turno (usato dopo una sfida e dopo la rivelazione)
function lockActivePlayerPowers() {
    const skipBtn = document.getElementById('btn-skip-song');
    const buyBtn = document.getElementById('btn-buy-card');
    if (skipBtn) skipBtn.disabled = true;
    if (buyBtn) buyBtn.disabled = true;
}

/* ================= POTERI DEI GETTONI ================= */
function useTokenSkipSong() {
    const activePlayer = gameState.players[gameState.currentPlayerIndex];
    if (activePlayer.tokens < 1 || gameState.revealed || gameState.challenge || !gameState.currentCard) return;

    playSound('coin');
    activePlayer.tokens -= 1;
    gameState.lastTurnUndo = null;
    showToast(`${activePlayer.name} usa 1 gettone per cambiare brano!`, "warning");
    drawNextCard();
}

async function useTokenBuyCard() {
    const activePlayer = gameState.players[gameState.currentPlayerIndex];
    if (activePlayer.tokens < 3 || gameState.revealed || gameState.challenge || gameState.buyingCard || !gameState.currentCard) return;

    const gs = gameState;
    playSound('coin');
    activePlayer.tokens -= 3;
    gs.buyingCard = true;
    gs.lastTurnUndo = null;
    updateUndoButtons();
    lockActivePlayerPowers();

    // Anche la carta comprata dev'essere una versione originale verificata
    const bonusCard = await takeVerifiedCard(gs);
    gs.buyingCard = false;
    if (gs !== gameState || gs.ended) return;
    if (!bonusCard) {
        activePlayer.tokens += 3;
        showToast("Nessun brano verificato disponibile: gettoni restituiti.", "error");
        renderGameDashboard();
        return;
    }
    markSongAsPlayed(bonusCard);

    // La timeline cambia: la posizione scelta prima non è più valida
    gameState.selectedSlotIndex = null;
    activePlayer.timeline.push(bonusCard);
    activePlayer.timeline.sort((a, b) => a.year - b.year);

    showToast(`${activePlayer.name} compra "${bonusCard.title}" (${bonusCard.year}) con 3 gettoni!`, "success");

    if (checkVictory(activePlayer)) return;
    renderGameDashboard();
    saveGame();
}

/* ================= SFIDA "SCRATCH!" (RUBA LA CARTA) ================= */
function openChallengeModal() {
    // Una sola sfida per turno, e solo prima della rivelazione
    if (gameState.challenge || gameState.revealed || gameState.selectedSlotIndex === null) return;
    const activePlayer = gameState.players[gameState.currentPlayerIndex];
    const cards = activePlayer.timeline;

    const challengerSelect = document.getElementById('challenger-select');
    challengerSelect.innerHTML = gameState.players
        .map((p, idx) => ({ p, idx }))
        .filter(item => item.idx !== gameState.currentPlayerIndex && item.p.tokens >= 1)
        .map(item => `<option value="${item.idx}">${escapeHtml(item.p.name)} (${item.p.tokens} gettoni)</option>`)
        .join('');

    const slotSelect = document.getElementById('challenger-slot-select');
    let options = '';
    for (let i = 0; i <= cards.length; i++) {
        if (i === gameState.selectedSlotIndex) continue;
        let label = '';
        if (i === 0) label = `Slot 1: Prima del ${cards[0].year}`;
        else if (i === cards.length) label = `Slot ${i + 1}: Dopo il ${cards[cards.length - 1].year}`;
        else label = `Slot ${i + 1}: Tra ${cards[i - 1].year} e ${cards[i].year}`;
        options += `<option value="${i}">${label}</option>`;
    }
    slotSelect.innerHTML = options;

    document.getElementById('challenge-target-player').textContent = activePlayer.name;
    document.getElementById('challenge-modal').classList.remove('hidden');
}

function closeChallengeModal() {
    document.getElementById('challenge-modal').classList.add('hidden');
}

function confirmChallenge() {
    if (gameState.challenge || gameState.revealed) { closeChallengeModal(); return; }
    const challengerIdx = parseInt(document.getElementById('challenger-select').value, 10);
    const proposedSlot = parseInt(document.getElementById('challenger-slot-select').value, 10);
    const challenger = gameState.players[challengerIdx];
    if (!challenger || challenger.tokens < 1 || isNaN(proposedSlot)) { closeChallengeModal(); return; }

    playSound('coin');
    challenger.tokens -= 1;
    gameState.lastTurnUndo = null;
    updateUndoButtons();
    gameState.challenge = {
        challengerIndex: challengerIdx,
        challengerName: challenger.name,
        slotIndex: proposedSlot
    };

    closeChallengeModal();
    showToast(`⚡ ${challenger.name} urla "SCRATCH!" e contesta il piazzamento!`, "warning");
    // Niente seconda sfida, niente cambio brano o acquisti: ora si può solo confermare
    document.getElementById('btn-open-challenge').disabled = true;
    lockActivePlayerPowers();
    renderScoreboard();
    renderTimeline();
    saveGame();
}

/* ================= VERIFICA CRONOLOGICA & RIVELAZIONE ================= */
function isPlacementValid(timeline, cardYear, slotIndex) {
    const prevYear = slotIndex > 0 ? timeline[slotIndex - 1].year : -Infinity;
    const nextYear = slotIndex < timeline.length ? timeline[slotIndex].year : Infinity;
    return cardYear >= prevYear && cardYear <= nextYear;
}

function confirmPlacement() {
    if (gameState.selectedSlotIndex === null || gameState.revealed || gameState.confirming || !gameState.currentCard) return;

    pauseMysteryAudio();

    const activePlayer = gameState.players[gameState.currentPlayerIndex];
    const card = gameState.currentCard;

    // Fotografia di prima della conferma, per "Annulla ultimo turno"
    gameState.lastTurnUndo = {
        players: RG.copia(gameState.players),
        currentPlayerIndex: gameState.currentPlayerIndex,
        round: gameState.round,
        card: RG.copia(card),
        selectedSlotIndex: gameState.selectedSlotIndex,
        challenge: RG.copia(gameState.challenge)
    };

    gameState.revealed = true;
    const isMainCorrect = isPlacementValid(activePlayer.timeline, card.year, gameState.selectedSlotIndex);
    let esito;

    if (isMainCorrect) {
        playSound('success');
        activePlayer.timeline.splice(gameState.selectedSlotIndex, 0, card);
        esito = { tipo: 'giusto' };
    } else {
        playSound('error');
        if (gameState.challenge) {
            const challenger = gameState.players[gameState.challenge.challengerIndex];
            const isChallengeCorrect = isPlacementValid(activePlayer.timeline, card.year, gameState.challenge.slotIndex);

            if (isChallengeCorrect) {
                challenger.timeline.push(card);
                challenger.timeline.sort((a, b) => a.year - b.year);
                esito = { tipo: 'rubata', sfidante: challenger.name };
                showToast(`Incredibile! ${challenger.name} ha indovinato l'epoca e ruba la carta!`, "success");
            } else {
                esito = { tipo: 'entrambi' };
            }
        } else {
            esito = { tipo: 'errato' };
        }
    }

    gameState.esito = esito;
    gameState.bonusAwarded = false;
    renderReveal(card, esito);
    updateUndoButtons();
    saveGame();
}

// Disegna il retro della carta girata (anche quando si riprende una partita)
const REVEAL_BADGES = {
    giusto: ['bg-emerald-500/20 text-emerald-300 border-emerald-500/40', 'fa-check', () => 'POSIZIONE ESATTA!'],
    rubata: ['bg-amber-500/20 text-amber-300 border-amber-500/40', 'fa-bolt', e => `RUBATA DA ${escapeHtml(e.sfidante.toUpperCase())}!`],
    entrambi: ['bg-rose-500/20 text-rose-300 border-rose-500/40', 'fa-xmark', () => 'ENTRAMBI SBAGLIATO!'],
    errato: ['bg-rose-500/20 text-rose-300 border-rose-500/40', 'fa-xmark', () => 'ANNO ERRATO!']
};

function renderReveal(card, esito) {
    const revealBadge = document.getElementById('reveal-badge');
    const proBonusBox = document.getElementById('pro-bonus-box');
    const claimBtn = document.getElementById('btn-claim-bonus');
    const [cls, icon, text] = REVEAL_BADGES[esito.tipo] || REVEAL_BADGES.errato;
    revealBadge.className = `px-3 py-1 rounded-full text-xs font-black uppercase border ${cls}`;
    revealBadge.innerHTML = `<i class="fa-solid ${icon} mr-1"></i> ${text(esito)}`;

    // Il bonus Pro (titolo e artista) vale anche se l'anno è sbagliato: la box resta visibile in ogni esito
    proBonusBox.classList.toggle('hidden', gameState.mode !== 'pro');
    claimBtn.disabled = !!gameState.bonusAwarded;
    claimBtn.innerHTML = gameState.bonusAwarded ? `<i class="fa-solid fa-check"></i> Assegnato!` : `+1 Gettone <i class="fa-solid fa-coins"></i>`;

    const artworkImg = document.getElementById('reveal-artwork');
    const artwork = gameState.currentArtwork || card.artwork;
    const showPoop = updateRevealEasterEgg(card);
    if (showPoop) {
        artworkImg.classList.add('hidden');
    } else if (artwork) {
        artworkImg.src = artwork;
        artworkImg.classList.remove('hidden');
    } else {
        artworkImg.classList.add('hidden');
    }

    document.getElementById('reveal-genre').textContent = card.genre;
    document.getElementById('reveal-year').textContent = card.year;
    document.getElementById('reveal-title').textContent = card.title;
    document.getElementById('reveal-artist').textContent = card.artist;
    document.getElementById('reveal-trivia').textContent = card.trivia;

    document.getElementById('btn-confirm-placement').disabled = true;
    document.getElementById('btn-open-challenge').disabled = true;
    lockActivePlayerPowers();

    document.getElementById('mystery-card-inner').classList.add('is-flipped');
    renderScoreboard();
    renderTimeline();
}

function claimProBonus() {
    if (gameState.bonusAwarded) return;
    playSound('coin');
    gameState.bonusAwarded = true;
    const activePlayer = gameState.players[gameState.currentPlayerIndex];
    activePlayer.tokens += 1;

    const btn = document.getElementById('btn-claim-bonus');
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-check"></i> Assegnato!`;
    showToast(`+1 Gettone Bonus assegnato a ${activePlayer.name}!`, "success");
    // Aggiorna solo i contatori: ridisegnare tutta la plancia riattivava i poteri a carta girata
    renderScoreboard();
    document.getElementById('active-player-tokens').textContent = activePlayer.tokens;
    saveGame();
}

function nextTurn() {
    playSound('click');

    for (const player of gameState.players) {
        if (checkVictory(player)) return;
    }

    gameState.currentPlayerIndex = (gameState.currentPlayerIndex + 1) % gameState.players.length;
    if (gameState.currentPlayerIndex === 0) {
        gameState.round += 1;
    }

    drawNextCard();
}

/* ================= CONTROLLO VITTORIA ================= */
function checkVictory(player) {
    if (player.timeline.length >= gameState.targetCards) {
        showVictory(player);
        return true;
    }
    return false;
}

function showVictory(player) {
    {
        gameState.ended = true;
        clearSavedGame();
        updateUndoButtons();
        pauseMysteryAudio();
        playSound('success');
        document.getElementById('game-screen').classList.add('hidden');
        document.getElementById('victory-screen').classList.remove('hidden');
        document.getElementById('winner-name').textContent = player.name;

        // Il vincitore sta sempre in cima alla classifica, anche in caso di parità di carte
    const sorted = [...gameState.players].sort((a, b) => (b === player) - (a === player) || b.timeline.length - a.timeline.length || b.tokens - a.tokens);
        document.getElementById('final-standings').innerHTML = sorted.map((p, i) => `
            <div class="flex items-center justify-between py-2 px-3 rounded-xl ${i === 0 ? 'bg-amber-500/20 border border-amber-400/40' : 'bg-white/5'}">
                <div class="flex items-center gap-2.5">
                    <span class="font-black text-sm ${i === 0 ? 'text-amber-300' : 'text-gray-400'}">#${i + 1}</span>
                    <span class="font-bold text-white text-sm">${escapeHtml(p.name)}</span>
                </div>
                <div class="text-xs font-bold">
                    <span class="text-cyan-300 mr-3">${p.timeline.length} Carte</span>
                    <span class="text-amber-300">${p.tokens} Gettoni</span>
                </div>
            </div>
        `).join('');

        if (typeof confetti === 'function') {
            confetti({ particleCount: 130, spread: 80, origin: { y: 0.6 } });
        }
    }
}

/* ================= MODALI & RESET ================= */
function openRulesModal() {
    playSound('click');
    document.getElementById('rules-modal').classList.remove('hidden');
}

function closeRulesModal() {
    document.getElementById('rules-modal').classList.add('hidden');
}

// "Nuova Partita": conferma dentro l'app (shared/js/dialoghi.js)
function confirmResetModal() {
    playSound('click');
    RG.conferma({ titolo: 'Abbandonare la partita?', testo: 'Tutti i progressi e le timeline attuali verranno azzerati.', ok: 'Esci', annulla: 'Continua', pericolo: true })
        .then(ok => { if (ok) resetToSetup(); });
}

function resetToSetup() {
    gameState.ended = true;
    clearSavedGame();
    pauseMysteryAudio();
    document.getElementById('game-screen').classList.add('hidden');
    document.getElementById('victory-screen').classList.add('hidden');
    document.getElementById('btn-reset-header').classList.add('hidden');
    document.getElementById('setup-screen').classList.remove('hidden');
    renderResumeBox();
}

/* ================= SALVATAGGIO, RIPRESA E ANNULLA ULTIMO TURNO (shared/js/partita.js) =================
   La partita si salva a ogni carta pescata, scelta, sfida, gettone e conferma (rg-hitstar-partita).
   Il brano del turno in corso resta lo stesso anche dopo un ricaricamento.
   Per riascoltarlo serve la connessione: l'audio non viene mai salvato sul telefono. */
const SAVED_GAME = RG.partita.crea('hitstar', {
    versione: 1,
    valida: g => Array.isArray(g.players) && g.players.length >= 1 && g.players.every(p => Array.isArray(p.timeline))
});

function saveGame() {
    const gs = gameState;
    if (!gs || !gs.players || !gs.players.length || gs.ended || !gs.usedKeys) return;
    SAVED_GAME.salva({
        players: gs.players,
        currentPlayerIndex: gs.currentPlayerIndex,
        round: gs.round,
        targetCards: gs.targetCards,
        mode: gs.mode,
        genreFilter: gs.genreFilter,
        usedKeys: Array.from(gs.usedKeys),
        readyCards: gs.readyCards,
        discardedReissues: gs.discardedReissues,
        currentCard: gs.currentCard,
        selectedSlotIndex: gs.selectedSlotIndex,
        challenge: gs.challenge,
        bonusAwarded: gs.bonusAwarded,
        revealed: gs.revealed,
        esito: gs.esito,
        lastTurnUndo: gs.lastTurnUndo
    });
}

function clearSavedGame() {
    SAVED_GAME.cancella();
}

function renderResumeBox() {
    const g = SAVED_GAME.leggi();
    const box = document.getElementById('resume-box');
    if (!g) { RG.partita.riquadro(box, null); return; }
    const who = g.players[g.currentPlayerIndex] ? g.players[g.currentPlayerIndex].name : '';
    RG.partita.riquadro(box, {
        riassunto: g.players.map(p => `${p.name} ${p.timeline.length}/${g.targetCards}`).join(' – '),
        dettaglio: `Round ${g.round} · tocca a ${who} · salvata ${RG.partita.quando(g.savedAt)}`,
        alRiprendi: resumeSavedGame,
        alloScarto: () => {
            RG.conferma({ titolo: 'Scartare la partita?', testo: 'Timeline e gettoni della partita salvata andranno persi.', ok: 'Scarta', pericolo: true })
                .then(ok => { if (ok) { clearSavedGame(); renderResumeBox(); } });
        }
    });
}

function showGameScreen() {
    document.getElementById('setup-screen').classList.add('hidden');
    document.getElementById('victory-screen').classList.add('hidden');
    document.getElementById('game-screen').classList.remove('hidden');
    document.getElementById('btn-reset-header').classList.remove('hidden');
}

async function resumeSavedGame() {
    const g = SAVED_GAME.leggi();
    if (!g) { renderResumeBox(); return; }
    if (gameState.players && gameState.players.length) gameState.ended = true; // ferma la partita precedente

    const gs = {
        players: g.players,
        currentPlayerIndex: Math.min(g.currentPlayerIndex, g.players.length - 1),
        round: g.round,
        targetCards: g.targetCards,
        mode: g.mode,
        genreFilter: g.genreFilter,
        deck: [],
        readyCards: Array.isArray(g.readyCards) ? g.readyCards : [],
        usedKeys: new Set(g.usedKeys || []),
        validating: null,
        discardedReissues: g.discardedReissues || 0,
        unknownStreak: 0,
        warnedUnknown: false,
        ended: false,
        currentCard: g.currentCard || null,
        selectedSlotIndex: g.selectedSlotIndex ?? null,
        challenge: g.challenge || null,
        bonusAwarded: !!g.bonusAwarded,
        currentArtwork: null,
        revealed: !!g.revealed,
        esito: g.esito || null,
        lastTurnUndo: g.lastTurnUndo || null,
        networkDown: false
    };
    gameState = gs;
    showGameScreen();
    showToast(`Partita ripresa: tocca a ${gs.players[gs.currentPlayerIndex].name}`, 'success');
    showCurrentCard();
    fillReadyCards(gs); // prepara le prossime carte in sottofondo
}

// Mostra la carta del turno così com'era: coperta (con la posizione scelta) o già girata
function showCurrentCard() {
    const gs = gameState;
    document.getElementById('mystery-card-inner').classList.remove('is-flipped');
    if (!gs.currentCard) { drawNextCard(); return; }
    renderGameDashboard();
    loadMysteryAudioPreview(gs.currentCard);
    if (gs.revealed && gs.esito) {
        renderReveal(gs.currentCard, gs.esito);
    } else {
        gs.revealed = false;
        updateSelectionUI();
        renderTimeline();
    }
    updateUndoButtons();
}

// "Annulla ultimo turno": si torna a prima della conferma, con la stessa carta e la stessa posizione.
// Si può fare a carta girata, nella schermata di vittoria e all'inizio del turno dopo
// (prima di usare gettoni o lanciare una sfida).
function canUndo() {
    const gs = gameState;
    if (!gs.lastTurnUndo || !gs.players || !gs.players.length) return false;
    const victory = !document.getElementById('victory-screen').classList.contains('hidden');
    return victory || gs.revealed || (!!gs.currentCard && !gs.ended);
}

function updateUndoButtons() {
    const show = canUndo();
    document.querySelectorAll('.undo-turn-btn').forEach(b => { b.hidden = !show; });
}

function undoLastTurn() {
    if (!canUndo()) { showToast("Non c'è un turno da annullare.", 'error'); return; }
    const u = gameState.lastTurnUndo;
    RG.conferma({
        titolo: "Annullare l'ultimo turno?",
        testo: `Si torna a prima della conferma di ${u.players[u.currentPlayerIndex].name}: timeline e gettoni come prima, stesso brano e stessa posizione da confermare di nuovo.`,
        ok: 'Annulla turno'
    }).then(ok => { if (ok) applyUndo(u); });
}

function applyUndo(u) {
    const gs = gameState;
    // Se era già uscito il brano del turno dopo, torna in cima alle carte pronte
    if (gs.currentCard && !gs.revealed && gs.currentCard.matchKey !== u.card.matchKey) gs.readyCards.unshift(gs.currentCard);
    gs.players = u.players;
    gs.currentPlayerIndex = u.currentPlayerIndex;
    gs.round = u.round;
    gs.currentCard = u.card;
    gs.selectedSlotIndex = u.selectedSlotIndex;
    gs.challenge = u.challenge;
    gs.revealed = false;
    gs.esito = null;
    gs.bonusAwarded = false;
    gs.lastTurnUndo = null;
    gs.ended = false;
    showGameScreen();
    showCurrentCard();
    saveGame();
    fillReadyCards(gs);
    showToast('Turno annullato: conferma di nuovo la posizione.', 'info');
}

/* ================= AVVIO ================= */
window.onload = function () {
    // I nomi di "Chi gioca stasera" decidono quanti giocatori proporre
    const filled = RG.squadre.tutti().filter(Boolean).length;
    if (filled >= 1) setupPlayerCount = Math.min(6, filled);
    renderPlayerInputs();
    setupAudioListeners();
    renderMuteButton();
    RG.suoni.alCambio(renderMuteButton);
    document.querySelectorAll('.undo-turn-btn').forEach(b => b.addEventListener('click', undoLastTurn));
    renderResumeBox();
    // Pagina ricaricata con una partita in corso: si torna subito in partita
    if (SAVED_GAME.leggi() && RG.partita.ricaricata()) resumeSavedGame();
};
