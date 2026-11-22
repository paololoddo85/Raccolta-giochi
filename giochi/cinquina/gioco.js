/*
 * Cinquina (prima "HINT FAKE") - logica del gioco.
 * Le parti comuni (memoria, squadre, timer, suoni, finestre, salvataggio, import)
 * arrivano da shared/js/ tramite l'oggetto globale RG.
 */
/**
 * LE 4 ABILITÀ (Parlare, Mimare, Canticchiare, Disegnare)
 */
const ABILITIES = {
    Parlare: {
        label: 'PARLARE',
        pillColor: 'bg-sky-500 text-white',
        bannerColor: 'bg-sky-600',
        rule: 'Solo parole, mani ferme. Non si può dire l\'oggetto, né tradurlo in un\'altra lingua, né suggerirlo con una rima.',
        icon: `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path></svg>`
    },
    Mimare: {
        label: 'MIMARE',
        pillColor: 'bg-emerald-500 text-white',
        bannerColor: 'bg-emerald-600',
        rule: 'Muto come un pesce: si usa tutto il corpo, ma senza nessun suono.',
        icon: `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`
    },
    Canticchiare: {
        label: 'CANTICCHIARE',
        pillColor: 'bg-fuchsia-500 text-white',
        bannerColor: 'bg-fuchsia-600',
        rule: 'Solo suoni: canticchiare, fischiare, fare versi o "na-na-na", anche su canzoni che non c\'entrano con la carta, se aiutano. Niente parole e niente gesti.',
        icon: `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"></path></svg>`
    },
    Disegnare: {
        label: 'DISEGNARE',
        pillColor: 'bg-amber-500 text-slate-950',
        bannerColor: 'bg-amber-500',
        rule: 'Solo matita e foglio: niente parole, niente suoni e niente gesti.',
        icon: `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>`
    }
};

/**
 * MAZZO DI CARTE: sta in dati/carte.js (window.CINQUINA_CARTE)
 * - base: carte con id numerico; quelle in soloAdultiBase solo per la versione Adulti
 * - extra: righe compatte [abilità, tema, proibita, 5 oggetti], id fissi b1… a1… h1…
 */
const BASE_CARDS = window.CINQUINA_CARTE.base.map(c => ({ ...c }));
const BASE_ADULT_ONLY_IDS = new Set(window.CINQUINA_CARTE.soloAdultiBase);
BASE_CARDS.forEach(c => { c.pubblico = BASE_ADULT_ONLY_IDS.has(c.id) ? 'adulti' : 'tutti'; });
const EXTRA_CARDS = window.CINQUINA_CARTE.extra;

const PREFIX = { bambini: 'b', adulti: 'a', hot: 'h' };
const BUILTIN_CARDS = [...BASE_CARDS];
Object.entries(EXTRA_CARDS).forEach(([pubblico, list]) => {
    list.forEach((row, i) => {
        const [abilita, tema, proibita, ...oggetti] = row;
        BUILTIN_CARDS.push({ id: `${PREFIX[pubblico]}${i + 1}`, abilita, tema, proibita, oggetti, pubblico });
    });
});

let IMPORTED_CARDS = [];

/**
 * STATO COMPLETO DEL GIOCO
 * Ordine esatto dei 5 slot fisici in senso orario:
 * 0 = Slot 1: Slot Iniziale (Freccia / Inserimento nuova carta, senza bonus)
 * 1 = Slot 2: Slot Normale (senza bonus)
 * 2 = Slot 3: Slot Normale (senza bonus)
 * 3 = Slot 4: Slot Bonus Nero (+1 facoltativo)
 * 4 = Slot 5: Slot Bonus Blu (+1 OBBLIGATORIO)
 */
let state = {
    teams: [
        { name: 'Squadra A', score: 0, turnsPlayed: 0 },
        { name: 'Squadra B', score: 0, turnsPlayed: 0 }
    ],
    activeTeamIdx: 0,
    totalTurnsPlayed: 0,
    usedCardIds: [],
    wheelSlots: [null, null, null, null, null], // 3 carte attive + 2 slot vuoti su 5
    selectedSlotIdx: null,
    activeCard: null,
    guessedObjects: [false, false, false, false, false],
    forbiddenTriggered: false,
    opponentChoices: { normal: false, forbidden: false, wrong: false },
    history: [],
    // Versione del gioco
    mode: 'adulti',      // 'adulti' | 'bambini'
    includeHot: true,    // solo per la versione adulti
    abilita: 'tutte',    // 'tutte' (le 4 abilità) oppure una sola: 'Parlare' | 'Mimare' | 'Canticchiare' | 'Disegnare'
    animating: false
};

// Le 4 abilità in ordine, per la scelta "Solo …" a inizio partita
const ABILITA_SCELTE = ['Parlare', 'Mimare', 'Canticchiare', 'Disegnare'];

/**
 * AVVIO E INIZIALIZZAZIONE RUOTA A 5 SLOT
 */
window.onload = function() {
    IMPORTED_CARDS = loadImportedCards();
    loadSettings();
    loadTeamNames();
    buildWheelBackground();
    refreshSetupUI();
    RG.suoni.collega(document.getElementById('btn-sound'));
    // Pagina ricaricata con una partita in corso: si torna subito in partita
    if (getSavedGame() && RG.partita.ricaricata()) resumeSavedGame();
};

/**
 * MEMORIA SUL DISPOSITIVO (localStorage)
 * - impostazioni (versione, carte hot)
 * - carte già uscite, separate per versione: non si ripetono finché non le avete viste tutte
 * - carte importate
 */
// Chiavi nuove: rg-hintfake-<nome>. Al primo avvio i dati della vecchia pagina
// HINT_FAKE.html (chiavi "hintfake-…") vengono copiati qui; le vecchie restano come copia.
// (le regole stanno in shared/js/migrazioni.js)
RG.migrazioni.esegui('hintfake');
const ARCHIVIO = RG.archivio.spazio('hintfake');

const STORAGE = {
    settings: 'impostazioni',
    used: mode => `carte-uscite-${mode}`,
    imported: 'carte-importate',
    oldCustom: 'hint-ruota-carte-personalizzate' // chiave della primissima versione, letta così com'è
};

function storageGet(key, fallback) {
    return ARCHIVIO.leggi(key, fallback);
}

function storageSet(key, value) {
    return ARCHIVIO.scrivi(key, value);
}

// Partita salvata (rg-hintfake-partita)
const SAVED_GAME = RG.partita.crea('hintfake', {
    versione: 1,
    valida: g => Array.isArray(g.teams) && g.teams.length === 2 && Array.isArray(g.wheelSlots)
});

// Nomi delle squadre: i primi 2 posti di "Chi gioca stasera", condivisi con gli altri giochi
const DEFAULT_TEAM_NAMES = ['Squadra A', 'Squadra B'];

function loadTeamNames() {
    const [a, b] = RG.squadre.nomi(2, DEFAULT_TEAM_NAMES);
    document.getElementById('setup-team-1').value = a;
    document.getElementById('setup-team-2').value = b;
}

function loadSettings() {
    const saved = storageGet(STORAGE.settings, {});
    if (saved.mode === 'bambini' || saved.mode === 'adulti') state.mode = saved.mode;
    if (typeof saved.includeHot === 'boolean') state.includeHot = saved.includeHot;
    if (saved.abilita === 'tutte' || ABILITA_SCELTE.includes(saved.abilita)) state.abilita = saved.abilita;
}

function saveSettings() {
    storageSet(STORAGE.settings, { mode: state.mode, includeHot: state.includeHot, abilita: state.abilita });
}

function loadUsedIds() {
    const list = storageGet(STORAGE.used(state.mode), []);
    return Array.isArray(list) ? list : [];
}

function saveUsedIds() {
    storageSet(STORAGE.used(state.mode), state.usedCardIds);
}

// Le carte del mazzo attivo, secondo la versione scelta
function cardAllowed(card) {
    const p = card.pubblico || 'tutti';
    if (p === 'tutti') return true;
    if (state.mode === 'bambini') return p === 'bambini';
    return p === 'adulti' || (p === 'hot' && state.includeHot);
}

// Con una sola abilità scelta restano solo le carte di quella abilità
function getActiveDeck() {
    return [...BUILTIN_CARDS, ...IMPORTED_CARDS]
        .filter(cardAllowed)
        .filter(c => state.abilita === 'tutte' || c.abilita === state.abilita);
}

// Riga di riepilogo della partita: "Adulti 🌶️", "Bambini", con "· Solo Parlare" se c'è una sola abilità
function etichettaPartita(mode, includeHot, abilita) {
    const versione = mode === 'bambini' ? 'Bambini' : (includeHot ? 'Adulti 🌶️' : 'Adulti');
    return abilita && abilita !== 'tutte' ? `${versione} · Solo ${abilita}` : versione;
}

/**
 * SCHERMATA INIZIALE: VERSIONE BAMBINI / ADULTI
 */
function setMode(mode) {
    state.mode = mode;
    saveSettings();
    refreshSetupUI();
    playBeep(600, 0.05);
}

function setHot(on) {
    state.includeHot = on;
    saveSettings();
    refreshSetupUI();
}

function setAbilita(abilita) {
    state.abilita = abilita;
    saveSettings();
    refreshSetupUI();
    playBeep(600, 0.05);
}

function refreshSetupUI() {
    const on = 'mode-btn rounded-2xl border-2 p-3.5 text-left border-[#4d9496] bg-[#e6f2f2] text-slate-900 shadow-sm';
    const off = 'mode-btn rounded-2xl border-2 p-3.5 text-left border-slate-200 bg-white text-slate-500';
    document.getElementById('mode-btn-bambini').className = state.mode === 'bambini' ? on : off;
    document.getElementById('mode-btn-adulti').className = state.mode === 'adulti' ? on : off;
    document.getElementById('hot-toggle-row').classList.toggle('hidden', state.mode !== 'adulti');
    document.getElementById('hot-toggle').checked = state.includeHot;
    document.querySelectorAll('#abilita-scelte [data-abilita]').forEach(b => {
        const scelta = b.dataset.abilita === state.abilita;
        b.className = scelta ? on : off;
        b.setAttribute('aria-pressed', scelta ? 'true' : 'false');
    });

    const deck = getActiveDeck();
    const used = new Set(loadUsedIds());
    const fresh = deck.filter(c => !used.has(c.id)).length;
    document.getElementById('setup-deck-info').innerHTML =
        `<strong class="text-slate-800">${fresh}</strong> carte mai uscite su ${deck.length}`;
    renderResumeBox();
}

/**
 * SALVATAGGIO E RIPRESA DELLA PARTITA
 * La partita viene salvata a ogni turno registrato e a ogni carta cambiata.
 * Se l'app si chiude, si riparte dalla ruota del turno in corso.
 */
function saveGame(slotsOverride) {
    SAVED_GAME.salva({
        mode: state.mode,
        includeHot: state.includeHot,
        abilita: state.abilita,
        teams: state.teams,
        activeTeamIdx: state.activeTeamIdx,
        totalTurnsPlayed: state.totalTurnsPlayed,
        wheelSlots: slotsOverride || state.wheelSlots,
        history: state.history,
        lastTurnUndo: state.lastTurnUndo || null
    });
}

function clearSavedGame() {
    SAVED_GAME.cancella();
}

function getSavedGame() {
    return SAVED_GAME.leggi();
}

function renderResumeBox() {
    const g = getSavedGame();
    const box = document.getElementById('resume-box');
    if (!g) { RG.partita.riquadro(box, null); return; }
    const [a, b] = g.teams;
    const versione = etichettaPartita(g.mode, g.includeHot, g.abilita);
    RG.partita.riquadro(box, {
        riassunto: `${a.name} ${a.score} – ${b.score} ${b.name}`,
        dettaglio: `Turno ${g.totalTurnsPlayed + 1} · tocca a ${g.teams[g.activeTeamIdx].name} · ${versione} · salvata ${RG.partita.quando(g.savedAt)}`,
        alRiprendi: resumeSavedGame,
        alloScarto: discardSavedGame
    });
}

function resumeSavedGame() {
    const g = getSavedGame();
    if (!g) { renderResumeBox(); return; }
    state.mode = g.mode === 'bambini' ? 'bambini' : 'adulti';
    state.includeHot = !!g.includeHot;
    // Salvataggi precedenti alla scelta delle abilità: si gioca con tutte e 4
    state.abilita = ABILITA_SCELTE.includes(g.abilita) ? g.abilita : 'tutte';
    saveSettings();
    state.teams = g.teams;
    state.activeTeamIdx = g.activeTeamIdx;
    state.totalTurnsPlayed = g.totalTurnsPlayed;
    state.wheelSlots = g.wheelSlots;
    state.history = g.history || [];
    state.lastTurnUndo = g.lastTurnUndo || null;
    state.usedCardIds = loadUsedIds();
    state.selectedSlotIdx = null;
    state.activeCard = null;

    document.getElementById('setup-screen').classList.add('hidden');
    document.getElementById('active-game-container').classList.remove('hidden');
    document.getElementById('active-game-container').classList.add('flex');
    updateScorecardUI();
    updateDeckCounter();
    enterStep1Wheel();
    showToast(`Partita ripresa! Tocca a ${state.teams[state.activeTeamIdx].name}`);
}

function discardSavedGame() {
    askConfirm('Scartare la partita?', 'I punteggi della partita salvata andranno persi.', 'Scarta', () => {
        clearSavedGame();
        renderResumeBox();
    });
}

/**
 * ANNULLA ULTIMO TURNO
 * Riporta la partita a prima della registrazione e riapre il Passo 4 di quel turno,
 * con le spunte com'erano, per correggerle e registrare di nuovo.
 */
function undoLastTurn() {
    const u = state.lastTurnUndo;
    if (!u) { showToast('Non c\'è un turno da annullare.'); return; }
    const victoryOpen = !document.getElementById('victory-modal').classList.contains('hidden');
    const onWheel = !document.getElementById('step-1-wheel-view').classList.contains('hidden');
    if (state.animating || (!onWheel && !victoryOpen)) {
        showToast('Puoi annullare solo dalla ruota, prima di scegliere una nuova carta.');
        return;
    }
    askConfirm('Annullare l\'ultimo turno?',
        `Turno ${u.totalTurnsPlayed + 1} di ${u.teams[u.activeTeamIdx].name} ("${u.activeCard.tema}"). Potrai correggere le spunte e registrarlo di nuovo.`,
        'Annulla turno', () => applyUndo(u));
}

function applyUndo(u) {
    closeModal('victory-modal');
    state.teams = u.teams;
    state.activeTeamIdx = u.activeTeamIdx;
    state.totalTurnsPlayed = u.totalTurnsPlayed;
    state.history = u.history;
    state.wheelSlots = u.wheelSlots;
    state.selectedSlotIdx = u.selectedSlotIdx;
    state.activeCard = u.activeCard;
    state.guessedObjects = u.guessedObjects;
    state.forbiddenTriggered = u.forbiddenTriggered;
    // La carta pescata per quel turno torna "nuova"
    if (Array.isArray(u.usedCardIds)) {
        state.usedCardIds = [...u.usedCardIds];
        saveUsedIds();
    } else if (u.drawnCardId !== null) {
        // Annulla di salvataggi fatti prima di questa versione: si toglie solo la carta pescata
        state.usedCardIds = state.usedCardIds.filter(id => id !== u.drawnCardId);
        saveUsedIds();
    }
    state.lastTurnUndo = null;

    updateScorecardUI();
    updateDeckCounter();
    endActiveTimerEarly();
    state.opponentChoices = { ...u.opponentChoices };
    renderStep4ReviewAndOpponent();
    saveGame();
    showToast('Turno annullato: correggi e registra di nuovo.');
}

function updateUndoButton() {
    const btn = document.getElementById('btn-undo-turn');
    if (btn) btn.classList.toggle('hidden', !state.lastTurnUndo);
}

/**
 * COPIA RICHIESTA PER CLAUDE
 */
const AUDIENCE_TEXT = {
    bambini: 'bambini di 8-12 anni (temi semplici e adatti a loro)',
    tutti: 'tutta la famiglia, adulti e bambini insieme',
    adulti: 'adulti (cultura, lavoro, vita da grandi, musica e TV per adulti)',
    hot: 'adulti, versione hot: parolacce, doppi sensi, temi piccanti e maliziosi, ma senza descrizioni esplicite e senza bestemmie'
};

function buildRequestForClaude() {
    const pubblico = document.getElementById('req-audience').value;
    const count = document.getElementById('req-count').value;
    const themes = document.getElementById('req-themes').value.trim();
    const existing = [...BUILTIN_CARDS, ...IMPORTED_CARDS]
        .filter(c => (c.pubblico || 'tutti') === pubblico || pubblico === 'tutti' || (c.pubblico || 'tutti') === 'tutti')
        .map(c => c.tema);
    const uniqueThemes = [...new Set(existing)].join('; ');
    return `Crea ${count} carte nuove per il mio gioco Cinquina (gioco a squadre: chi dà gli indizi fa indovinare alla sua squadra 5 oggetti in 90 secondi, parlando, mimando, canticchiando o disegnando, senza che venga detta la parola proibita).

Pubblico: ${AUDIENCE_TEXT[pubblico]}.${themes ? `\nTemi preferiti: ${themes}.` : ''}

Regole per ogni carta:
- "abilita": una tra Parlare, Mimare, Canticchiare, Disegnare, distribuite in modo equilibrato. L'abilità deve adattarsi al tema (Canticchiare = canzoni, sigle o suoni da canticchiare; Disegnare = cose facili da disegnare; Mimare = azioni o cose mimabili).
- "tema": la categoria scritta sul retro della carta.
- "proibita": la risposta più ovvia del tema.
- "oggetti": esattamente 5 risposte diverse dalla proibita, conosciute dal pubblico.
- "pubblico": "${pubblico}".
Non ripetere questi temi che ho già: ${uniqueThemes}.

Rispondi SOLO con una lista JSON in un unico blocco di codice, in questo formato:
[{"abilita":"Mimare","tema":"...","proibita":"...","oggetti":["...","...","...","...","..."],"pubblico":"${pubblico}"}]`;
}

async function copyRequestForClaude() {
    const ok = await RG.importa.copiaTesto(buildRequestForClaude(), document.getElementById('req-fallback'));
    showToast(ok ? 'Richiesta copiata! Incollala in una chat con Claude.' : 'Copia non riuscita: seleziona il testo qui sotto e copialo a mano.');
}

function openImportRequestDefaults() {
    const sel = document.getElementById('req-audience');
    sel.value = state.mode === 'bambini' ? 'bambini' : (state.includeHot ? 'hot' : 'adulti');
}

function restartDeck() {
    const soloUna = state.abilita !== 'tutte';
    const testo = soloUna
        ? `Le carte di ${state.abilita} di questa versione torneranno "nuove". Le altre abilità restano come viste.`
        : 'Tutte le carte di questa versione torneranno "nuove".';
    askConfirm('Ricominciare il mazzo?', testo, 'Ricomincia', () => {
        // Con una sola abilità si riaprono solo le sue carte
        const daRiaprire = new Set(getActiveDeck().map(c => c.id));
        storageSet(STORAGE.used(state.mode), soloUna ? loadUsedIds().filter(id => !daRiaprire.has(id)) : []);
        refreshSetupUI();
        showToast('Mazzo ricominciato da capo.');
    });
}

/**
 * IMPORTA CARTE
 */
const ABILITY_NAMES = { parlare: 'Parlare', mimare: 'Mimare', canticchiare: 'Canticchiare', disegnare: 'Disegnare' };
const AUDIENCES = { tutti: 'tutti', bambini: 'bambini', bambino: 'bambini', kids: 'bambini', adulti: 'adulti', adulto: 'adulti', hot: 'hot', piccante: 'hot' };

function cardKey(c) {
    return `${String(c.tema).trim().toLowerCase()}|${String(c.proibita).trim().toLowerCase()}`;
}

// Piccolo hash per dare a ogni carta importata un id stabile
const hashText = RG.hash;

// Accetta sia oggetti {abilita, tema, proibita, oggetti, pubblico} sia righe [abilita, tema, proibita, o1..o5, pubblico]
function normalizeCard(raw) {
    let c = raw;
    if (Array.isArray(raw)) {
        if (raw.length < 8) return null;
        c = { abilita: raw[0], tema: raw[1], proibita: raw[2], oggetti: raw.slice(3, 8), pubblico: raw[8] };
    }
    if (!c || typeof c !== 'object') return null;
    const abilita = ABILITY_NAMES[String(c.abilita ?? c['abilità'] ?? c.ability ?? '').trim().toLowerCase()];
    const tema = String(c.tema ?? c.theme ?? '').trim();
    const proibita = String(c.proibita ?? c.forbidden ?? '').trim();
    const oggetti = Array.isArray(c.oggetti ?? c.objects) ? (c.oggetti ?? c.objects).map(o => String(o).trim()).filter(Boolean) : [];
    if (!abilita || !tema || !proibita || oggetti.length !== 5) return null;
    const pubblico = AUDIENCES[String(c.pubblico ?? 'tutti').trim().toLowerCase()] || 'tutti';
    return { abilita, tema, proibita, oggetti, pubblico };
}

function parseImportText(text) {
    return RG.importa.leggiTesto(text, ['carte', 'cards']);
}

function loadImportedCards() {
    let list = storageGet(STORAGE.imported, []);
    if (!Array.isArray(list)) list = [];
    // Recupera le carte create con il vecchio pulsante "+ Carta"
    const old = RG.archivio.leggi(STORAGE.oldCustom, null);
    if (Array.isArray(old) && old.length) {
        old.forEach(o => {
            const n = normalizeCard(o);
            if (n) list.push({ ...n, id: 'imp-' + hashText(cardKey(n)) });
        });
        RG.archivio.togli(STORAGE.oldCustom);
        storageSet(STORAGE.imported, list);
    }
    return list
        .map(c => {
            const n = normalizeCard(c);
            return n ? { ...n, id: c.id || 'imp-' + hashText(cardKey(n)) } : null;
        })
        .filter(Boolean);
}

function openImportModal() {
    updateImportCount();
    openImportRequestDefaults();
    document.getElementById('req-fallback').classList.add('hidden');
    document.getElementById('import-result').classList.add('hidden');
    openModal('import-modal');
}

function updateImportCount() {
    const n = IMPORTED_CARDS.length;
    document.getElementById('import-count').textContent = n === 0 ? 'Nessuna carta importata' : `${n} ${n === 1 ? 'carta importata' : 'carte importate'}`;
}

function showImportResult(msg, ok) {
    const el = document.getElementById('import-result');
    el.textContent = msg;
    el.className = `mt-3 text-xs font-bold rounded-xl px-3 py-2.5 ${ok ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`;
}

function importCardsFromText() {
    const text = document.getElementById('import-text').value;
    if (!text.trim()) { showImportResult('Incolla prima il testo con le carte.', false); return; }
    const rows = parseImportText(text);
    if (!rows) { showImportResult('Non riesco a leggere il testo: controlla di averlo incollato tutto, dalla prima [ all\'ultima ].', false); return; }

    const result = RG.importa.unisci({
        righe: rows,
        normalizza: normalizeCard,
        chiave: cardKey,
        esistenti: [...BUILTIN_CARDS, ...IMPORTED_CARDS],
        conId: (c, key) => ({ ...c, id: 'imp-' + hashText(key) })
    });
    IMPORTED_CARDS.push(...result.nuove);
    const { aggiunte: added, invalide: invalid, doppie: dup } = result;

    if (added > 0 && !storageSet(STORAGE.imported, IMPORTED_CARDS)) {
        showImportResult('Carte aggiunte solo per questa sessione: il dispositivo non permette di salvarle.', false);
    } else {
        const extra = [dup ? `${dup} ${dup === 1 ? 'doppia saltata' : 'doppie saltate'}` : '', invalid ? `${invalid} ${invalid === 1 ? 'incompleta scartata' : 'incomplete scartate'}` : ''].filter(Boolean).join(', ');
        showImportResult(added > 0
            ? `✓ ${added} ${added === 1 ? 'carta aggiunta' : 'carte aggiunte'} al mazzo${extra ? ' (' + extra + ')' : ''}.`
            : `Nessuna carta nuova${extra ? ': ' + extra : ''}.`, added > 0);
    }
    if (added > 0) document.getElementById('import-text').value = '';
    updateImportCount();
    updateDeckCounter();
    refreshSetupUI();
}

function deleteImportedCards() {
    if (IMPORTED_CARDS.length === 0) { showImportResult('Non ci sono carte importate.', false); return; }
    askConfirm('Eliminare le carte importate?', `Verranno tolte tutte le ${IMPORTED_CARDS.length} carte importate da questo dispositivo.`, 'Elimina', () => {
        IMPORTED_CARDS = [];
        storageSet(STORAGE.imported, []);
        updateImportCount();
        updateDeckCounter();
        refreshSetupUI();
        showImportResult('Carte importate eliminate.', true);
    });
}

// Evita che caratteri come < o & inseriti dall'utente rompano la pagina
const escapeHtml = RG.esc;

function startGame() {
    const name1 = document.getElementById('setup-team-1').value.trim() || 'Squadra A';
    const name2 = document.getElementById('setup-team-2').value.trim() || 'Squadra B';
    RG.squadre.salva([name1, name2], DEFAULT_TEAM_NAMES);

    state.teams = [
        { name: name1, score: 0, turnsPlayed: 0 },
        { name: name2, score: 0, turnsPlayed: 0 }
    ];
    state.activeTeamIdx = 0;
    state.totalTurnsPlayed = 0;
    state.usedCardIds = loadUsedIds(); // le carte già uscite nelle partite precedenti non ripassano
    state.history = [];
    state.lastTurnUndo = null;

    // All'inizio ci sono 3 carte inserite nei primi 3 slot senza bonus (Slot 1 Iniziale, Slot 2 Normale, Slot 3 Normale)
    // mentre Slot 4 (+1 Bonus) e Slot 5 (+1 Obbligatorio) sono inizialmente vuoti.
    // Girando la ruota in senso orario a fine turno, le carte avanzano verso Slot 4 (+1) e Slot 5 (+1 Obbligatorio)!
    state.wheelSlots = [null, null, null, null, null];
    for (let i = 0; i < 3; i++) state.wheelSlots[i] = drawOneCardFromDeck();

    document.getElementById('setup-screen').classList.add('hidden');
    document.getElementById('active-game-container').classList.remove('hidden');
    document.getElementById('active-game-container').classList.add('flex');

    updateScorecardUI();
    updateDeckCounter();
    enterStep1Wheel();
    saveGame();
    showToast(`Partita iniziata! Tocca a ${state.teams[0].name}`);
}

function confirmNewGame() {
    askConfirm('Terminare la partita?', 'I punteggi attuali verranno azzerati e tornerai alla schermata iniziale.', 'Azzera', resetToSetup, true);
}

function resetToSetup() {
    stopTimer();
    clearSavedGame();
    state.lastTurnUndo = null;
    closeModal('victory-modal');
    document.getElementById('active-game-container').classList.add('hidden');
    document.getElementById('active-game-container').classList.remove('flex');
    document.getElementById('setup-screen').classList.remove('hidden');
    document.getElementById('header-deck-info').textContent = 'Gioco di squadra';
    refreshSetupUI();
}

function drawOneCardFromDeck() {
    const deck = getActiveDeck();
    const onWheel = new Set(state.wheelSlots.filter(Boolean).map(c => c.id));
    const used = new Set(state.usedCardIds);
    let available = deck.filter(c => !used.has(c.id) && !onWheel.has(c.id));
    if (available.length === 0) {
        // Viste tutte: il mazzo ricomincia (tranne le carte già sulla ruota).
        // Con una sola abilità si azzerano solo le sue carte: le altre restano segnate come viste.
        if (state.abilita === 'tutte') {
            state.usedCardIds = [...onWheel];
        } else {
            const idMazzo = new Set(deck.map(c => c.id));
            state.usedCardIds = state.usedCardIds.filter(id => !idMazzo.has(id) || onWheel.has(id));
        }
        available = deck.filter(c => !onWheel.has(c.id));
        if (available.length === 0) available = deck;
        showToast('Avete visto tutte le carte! Il mazzo ricomincia da capo.');
    }
    const picked = available[Math.floor(Math.random() * available.length)];
    state.usedCardIds.push(picked.id);
    saveUsedIds();
    updateDeckCounter();
    return picked;
}

function updateDeckCounter() {
    if (document.getElementById('active-game-container').classList.contains('hidden')) return;
    const deck = getActiveDeck();
    const used = new Set(state.usedCardIds);
    const fresh = deck.filter(c => !used.has(c.id)).length;
    const label = etichettaPartita(state.mode, state.includeHot, state.abilita);
    document.getElementById('header-deck-info').textContent = `${label} · ${fresh} carte nuove`;
}

/**
 * GESTIONE DEI PASSI DEL TURNO
 */
function setStepHeader(stepNum, text) {
    document.getElementById('step-pill').textContent = `Passo ${stepNum}`;
    document.getElementById('step-description').textContent = text;

    const activeTeam = state.teams[state.activeTeamIdx];
    document.getElementById('active-team-title').textContent = activeTeam.name;
    document.getElementById('turn-badge-avatar').textContent = state.activeTeamIdx + 1;
    document.getElementById('turn-badge-avatar').className = state.activeTeamIdx === 0
        ? 'w-11 h-11 rounded-2xl bg-[#4d9496] text-white flex items-center justify-center font-black text-lg shadow-sm shrink-0'
        : 'w-11 h-11 rounded-2xl bg-[#1e2024] text-white flex items-center justify-center font-black text-lg shadow-sm shrink-0';
    document.getElementById('round-number-badge').textContent = `Turno ${state.totalTurnsPlayed + 1}`;
}

function hideAllStepViews() {
    document.getElementById('step-1-wheel-view').classList.add('hidden');
    document.getElementById('step-2-privacy-view').classList.add('hidden');
    document.getElementById('step-3-play-view').classList.add('hidden');
    document.getElementById('step-4-opponent-view').classList.add('hidden');
}

// PASSO 1: VISUALIZZA RUOTA E 3 CARTE
function enterStep1Wheel() {
    hideAllStepViews();
    document.getElementById('step-1-wheel-view').classList.remove('hidden');

    const hasObligatoryCard = state.wheelSlots[4] !== null;
    setStepHeader(1, hasObligatoryCard
        ? 'Prendi la carta obbligatoria nello spicchio blu (+1)'
        : 'Scegli una carta intorno alla ruota');

    document.getElementById('obligatory-banner').classList.toggle('hidden', !hasObligatoryCard);
    renderWheelSlots();
}

/**
 * RUOTA: 5 spicchi da 72° in senso orario, con le carte appoggiate sopra.
 * Slot 1 in alto (ingresso), poi 2, 3, 4 (+1 nero) e 5 (+1 blu obbligatorio).
 */
const WHEEL_RADIUS = 33; // distanza delle carte dal centro, in % della ruota
const SLOT_INFO = [
    { fill: '#2A3552', light: false, empty: 'Spicchio 1<br>Ingresso', tag: null },
    { fill: '#1D2742', light: false, empty: 'Spicchio 2', tag: null },
    { fill: '#243150', light: false, empty: 'Spicchio 3', tag: null },
    { fill: '#05080F', light: false, empty: 'Spicchio 4<br>+1', tag: { text: '+1 bonus', cls: 'bg-[#f5c84c] text-slate-900' } },
    { fill: '#4696b8', light: false, empty: 'Spicchio 5<br>+1 obblig.', tag: { text: '+1 obbligatoria', cls: 'bg-[#8fd3f0] text-slate-900' } }
];
const SHORT_ABILITY = { Parlare: 'Parla', Mimare: 'Mima', Canticchiare: 'Canta', Disegnare: 'Disegna' };

function slotAngle(idx) {
    return -90 + idx * 72;
}

function polar(angleDeg, r) {
    const a = angleDeg * Math.PI / 180;
    return { x: 50 + r * Math.cos(a), y: 50 + r * Math.sin(a) };
}

function buildWheelBackground() {
    const svg = document.getElementById('wheel-bg');
    let html = '<circle cx="50" cy="50" r="49.5" fill="#2A3552"/>';
    SLOT_INFO.forEach((info, i) => {
        const a0 = slotAngle(i) - 36, a1 = slotAngle(i) + 36;
        const p0 = polar(a0, 48), p1 = polar(a1, 48);
        html += `<path d="M50 50 L${p0.x.toFixed(2)} ${p0.y.toFixed(2)} A48 48 0 0 1 ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} Z" fill="${info.fill}" stroke="#0A1020" stroke-width="1"/>`;
    });
    // Freccia di ingresso sullo slot 1
    html += '<polygon points="46.5,0.8 53.5,0.8 50,4.6" fill="#ffffff"/>';
    // Mozzo centrale con freccia oraria
    html += '<circle cx="50" cy="50" r="9" fill="#4d9496" stroke="#0A1020" stroke-width="1.2"/>';
    html += '<path d="M46 48.3 A4.6 4.6 0 1 1 53.4 52.4" fill="none" stroke="#ffffff" stroke-width="1.3" stroke-linecap="round"/>';
    html += '<polygon points="55.2,50.6 52.1,53.8 55.6,54.1" fill="#ffffff"/>';
    svg.innerHTML = html;
}

function tilePositionStyle(angleDeg) {
    const p = polar(angleDeg, WHEEL_RADIUS);
    return `left:${p.x}%;top:${p.y}%;`;
}

function renderWheelSlots(popSlotIdx = null) {
    const container = document.getElementById('wheel-tiles');
    const obligatoryActive = state.wheelSlots[4] !== null;
    let html = '';

    SLOT_INFO.forEach((info, idx) => {
        const card = state.wheelSlots[idx];
        const pos = tilePositionStyle(slotAngle(idx));
        if (!card) {
            html += `<div class="wheel-tile empty ${info.light ? 'light' : ''}" style="${pos}">${info.empty}</div>`;
            return;
        }
        const ab = ABILITIES[card.abilita];
        const locked = obligatoryActive && idx !== 4;
        const slotCls = idx === 3 ? 'slot-bonus' : idx === 4 ? 'slot-obbl' : '';
        const tag = info.tag ? `<span class="tile-tag ${info.tag.cls}">${info.tag.text}</span>` : '';
        html += `
            <div class="wheel-tile card ${slotCls} ${locked ? 'locked' : ''} ${popSlotIdx === idx ? 'pop' : ''}" data-slot="${idx}" style="${pos}"
                 role="button" aria-label="${escapeHtml(card.tema)}" onclick="chooseCardFromWheel(${idx})">
                <div class="tile-top">
                    <span class="tile-ability ${ab.pillColor}">${ab.icon}<span>${SHORT_ABILITY[card.abilita]}</span></span>
                    <button type="button" class="tile-redo" title="Già fatta: cambia carta" onclick="event.stopPropagation(); replaceWheelSlotCard(${idx})">↻</button>
                </div>
                <div class="tile-theme">${escapeHtml(card.tema)}</div>
                ${tag}
            </div>`;
    });
    container.innerHTML = html;
}

// Animazione: la carta giocata sparisce, le altre scivolano di uno spicchio in senso orario
function animateWheelRotation(playedSlotIdx, onDone) {
    const board = document.getElementById('wheel-board');
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { onDone(); return; }

    state.animating = true;
    board.classList.add('is-animating');
    const played = board.querySelector(`.wheel-tile.card[data-slot="${playedSlotIdx}"]`);
    if (played) played.classList.add('leaving');

    const movers = [...board.querySelectorAll('.wheel-tile.card')].filter(el => el !== played);
    movers.forEach(el => el.classList.remove('locked'));
    const duration = 700;
    let startTime = null;

    const step = (now) => {
        if (startTime === null) startTime = now;
        const t = Math.min(1, (now - startTime) / duration);
        const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        movers.forEach(el => {
            const from = slotAngle(Number(el.dataset.slot));
            const p = polar(from + 72 * eased, WHEEL_RADIUS);
            el.style.left = `${p.x}%`;
            el.style.top = `${p.y}%`;
        });
        if (t < 1) {
            requestAnimationFrame(step);
        } else {
            state.animating = false;
            board.classList.remove('is-animating');
            onDone();
        }
    };
    setTimeout(() => requestAnimationFrame(step), 220);
}

function replaceWheelSlotCard(slotIdx) {
    if (state.animating || !state.wheelSlots[slotIdx]) return;
    const newCard = drawOneCardFromDeck();
    state.wheelSlots[slotIdx] = newCard;
    playBeep(560, 0.07);
    renderWheelSlots(slotIdx);
    saveGame();
    showToast(`Carta sostituita con: "${newCard.tema}"`);
}

function replaceSelectedCardInPrivacy() {
    if (state.selectedSlotIdx === null) return;
    const newCard = drawOneCardFromDeck();
    state.wheelSlots[state.selectedSlotIdx] = newCard;
    state.activeCard = newCard;

    const ab = ABILITIES[newCard.abilita];
    document.getElementById('privacy-card-ability-badge').innerHTML = `${ab.icon} <span>${ab.label}</span>`;
    document.getElementById('privacy-card-theme').textContent = newCard.tema;
    saveGame();

    playBeep(560, 0.07);
    showToast(`Nuova carta pescata: "${newCard.tema}"`);
}

// PASSO 2: SCELTA CARTA -> SCHERMO PRIVACY SUGGERITORE
function chooseCardFromWheel(slotIdx) {
    if (state.animating) return;
    if (state.wheelSlots[4] !== null && slotIdx !== 4) {
        showToast("Prima va presa la carta nello spicchio blu (+1)!");
        return;
    }
    const card = state.wheelSlots[slotIdx];
    if (!card) return;

    playBeep(600, 0.08);
    state.selectedSlotIdx = slotIdx;
    state.activeCard = card;
    state.guessedObjects = [false, false, false, false, false];
    state.forbiddenTriggered = false;
    state.opponentChoices = { normal: false, forbidden: false, wrong: false };

    const ab = ABILITIES[card.abilita];
    const slotNames = [
        'Spicchio d\'ingresso • senza bonus',
        'Spicchio 2 • senza bonus',
        'Spicchio 3 • senza bonus',
        'Spicchio nero • +1 punto',
        'Spicchio blu • +1 punto, obbligatorio'
    ];

    document.getElementById('privacy-slot-pill').textContent = slotNames[slotIdx];
    document.getElementById('privacy-card-ability-badge').innerHTML = `${ab.icon} <span>${ab.label}</span>`;
    document.getElementById('privacy-card-theme').textContent = card.tema;
    document.getElementById('privacy-team-name').textContent = state.teams[state.activeTeamIdx].name;

    hideAllStepViews();
    document.getElementById('step-2-privacy-view').classList.remove('hidden');
    setStepHeader(2, 'Scegli chi formulerà gli indizi e gira la carta');
}

function cancelCardSelection() {
    state.selectedSlotIdx = null;
    state.activeCard = null;
    enterStep1Wheel();
}

// PASSO 3: GIRA CARTA E AVVIA TIMER 90 SECONDI
function revealCardAndStartRound() {
    const card = state.activeCard;
    const ab = ABILITIES[card.abilita];
    const hasBonus = state.selectedSlotIdx === 3 || state.selectedSlotIdx === 4;

    document.getElementById('play-card-banner').className = `${ab.bannerColor} text-white p-4 sm:p-5 flex items-center justify-between gap-2`;
    document.getElementById('play-ability-badge').innerHTML = `${ab.icon} <span>${ab.label}</span>`;
    document.getElementById('play-card-theme').textContent = card.tema;
    document.getElementById('play-slot-bonus-tag').classList.toggle('hidden', !hasBonus);
    document.getElementById('bonus-active-pill').textContent = hasBonus ? 'Carta bonus: +1 pt extra' : 'Carta senza bonus';

    // Prepara modale regola abilità rapida
    document.getElementById('quick-ability-title').textContent = `Regola: ${ab.label}`;
    document.getElementById('quick-ability-body').textContent = ab.rule;

    renderPlayCardContent();

    hideAllStepViews();
    document.getElementById('step-3-play-view').classList.remove('hidden');
    setStepHeader(3, '90 secondi per far indovinare i 5 oggetti!');

    startTimer90s();
}

function renderPlayCardContent() {
    const card = state.activeCard;
    document.getElementById('play-forbidden-text').textContent = card.proibita;

    const fBox = document.getElementById('forbidden-box');
    const fPill = document.getElementById('forbidden-pill-status');
    if (state.forbiddenTriggered) {
        fBox.classList.add('ring-2', 'ring-red-600', 'bg-red-100');
        fPill.className = 'text-xs font-black px-3 py-1.5 rounded-xl bg-red-600 text-white';
        fPill.textContent = 'NOMINATO (-2 PT)';
    } else {
        fBox.classList.remove('ring-2', 'ring-red-600', 'bg-red-100');
        fPill.className = 'text-xs font-extrabold px-3 py-1.5 rounded-xl bg-white border border-red-200 text-red-700';
        fPill.textContent = 'Nominato? (-2)';
    }

    const list = document.getElementById('play-objects-list');
    list.innerHTML = '';
    card.oggetti.forEach((obj, idx) => {
        const isDone = state.guessedObjects[idx];
        const btn = document.createElement('button');
        btn.onclick = () => toggleObjectGuessed(idx);
        btn.className = `w-full text-left p-3.5 rounded-2xl border-2 flex items-center justify-between transition active:scale-[0.99] ${
            isDone
            ? 'border-emerald-500 bg-emerald-50 text-emerald-950'
            : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-900'
        }`;

        btn.innerHTML = `
            <div class="flex items-center gap-3">
                <span class="w-7 h-7 rounded-xl text-xs font-black flex items-center justify-center ${isDone ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500'}">
                    ${idx + 1}
                </span>
                <span class="font-extrabold text-base sm:text-lg ${isDone ? 'line-through opacity-75' : ''}">${escapeHtml(obj)}</span>
            </div>
            <div class="flex items-center gap-2">
                <span class="text-xs font-black ${isDone ? 'text-emerald-600' : 'text-slate-400'}">+1 pt</span>
                <div class="w-7 h-7 rounded-xl flex items-center justify-center ${isDone ? 'bg-emerald-600 text-white' : 'border-2 border-slate-300'}">
                    ${isDone ? '✓' : ''}
                </div>
            </div>
        `;
        list.appendChild(btn);
    });

    const partial = calculateActiveTeamRoundScore();
    const preview = document.getElementById('active-round-score-preview');
    preview.textContent = `${partial >= 0 ? '+' + partial : partial} pt`;
    preview.className = `text-2xl font-black ${partial > 0 ? 'text-emerald-600' : (partial < 0 ? 'text-red-600' : 'text-slate-900')}`;
}

function toggleObjectGuessed(idx) {
    state.guessedObjects[idx] = !state.guessedObjects[idx];
    playBeep(state.guessedObjects[idx] ? 780 : 440, 0.07);
    renderPlayCardContent();

    // Se ha indovinato tutti e 5 gli oggetti e non c'è altro da fare, notifica
    if (state.guessedObjects.every(Boolean)) {
        showToast("Tutti e 5 gli oggetti indovinati! Puoi terminare il tempo.");
    }
}

function toggleForbiddenWord() {
    state.forbiddenTriggered = !state.forbiddenTriggered;
    if (state.forbiddenTriggered) {
        playBuzzer();
        showToast("Oggetto proibito nominato! Penalità di -2 punti.");
    } else {
        playBeep(520, 0.06);
    }
    renderPlayCardContent();
}

function calculateActiveTeamRoundScore() {
    const guessedCount = state.guessedObjects.filter(Boolean).length;
    const bonus = (state.selectedSlotIdx === 3 || state.selectedSlotIdx === 4) ? 1 : 0;
    const penalty = state.forbiddenTriggered ? -2 : 0;
    return guessedCount + bonus + penalty;
}

// PASSO 4: TEMPO SCADUTO -> VERIFICA RISPOSTE + REPLICA SQUADRA AVVERSARIA
function endActiveTimerEarly() {
    stopTimer();
    const oppIdx = (state.activeTeamIdx + 1) % 2;
    const oppName = state.teams[oppIdx].name;

    document.getElementById('opponent-team-name').textContent = oppName;
    document.getElementById('opponent-team-name-2').textContent = oppName;
    document.getElementById('opponent-card-theme-label').textContent = state.activeCard.tema;

    state.opponentChoices = { normal: false, forbidden: false, wrong: false };
    renderStep4ReviewAndOpponent();

    hideAllStepViews();
    document.getElementById('step-4-opponent-view').classList.remove('hidden');
    setStepHeader(4, `Verifica risposte e replica di ${oppName}`);
}

function renderStep4ReviewAndOpponent() {
    const reviewList = document.getElementById('opponent-review-list');
    reviewList.innerHTML = '';

    // Oggetto proibito cliccabile anche a tempo scaduto
    const forbBtn = document.createElement('button');
    forbBtn.type = 'button';
    forbBtn.onclick = () => {
        state.forbiddenTriggered = !state.forbiddenTriggered;
        playBeep(state.forbiddenTriggered ? 220 : 520, 0.08);
        renderStep4ReviewAndOpponent();
    };
    forbBtn.className = `w-full text-left flex items-center justify-between py-2 px-3 rounded-xl border-2 transition ${
        state.forbiddenTriggered
        ? 'bg-red-600 border-red-700 text-white font-black'
        : 'bg-red-50 border-red-200 text-red-900 font-bold hover:bg-red-100'
    }`;
    forbBtn.innerHTML = `
        <span>🚫 ${escapeHtml(state.activeCard.proibita)} <em class="text-[11px] font-normal opacity-90">(Oggetto Proibito)</em></span>
        <span class="text-xs font-black px-2 py-0.5 rounded-lg ${state.forbiddenTriggered ? 'bg-white text-red-700' : 'bg-red-100 text-red-700'}">
            ${state.forbiddenTriggered ? 'NOMINATO (-2 pt)' : 'Non nominato'}
        </span>
    `;
    reviewList.appendChild(forbBtn);

    // I 5 oggetti cliccabili e modificabili anche dopo la fine del tempo
    state.activeCard.oggetti.forEach((obj, idx) => {
        const isGuessed = state.guessedObjects[idx];
        const rowBtn = document.createElement('button');
        rowBtn.type = 'button';
        rowBtn.onclick = () => {
            state.guessedObjects[idx] = !state.guessedObjects[idx];
            playBeep(state.guessedObjects[idx] ? 780 : 440, 0.07);
            renderStep4ReviewAndOpponent();
        };
        rowBtn.className = `w-full text-left flex items-center justify-between py-2 px-3 rounded-xl border-2 transition ${
            isGuessed
            ? 'bg-emerald-50 border-emerald-500 text-emerald-950 font-extrabold'
            : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-800 font-bold'
        }`;
        rowBtn.innerHTML = `
            <div class="flex items-center gap-2.5">
                <span class="w-5 h-5 rounded-md text-[11px] font-black flex items-center justify-center ${isGuessed ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500'}">
                    ${isGuessed ? '✓' : idx + 1}
                </span>
                <span>${escapeHtml(obj)}</span>
            </div>
            <span class="text-xs font-black ${isGuessed ? 'text-emerald-600' : 'text-slate-400'}">
                ${isGuessed ? 'Indovinato (+1 pt)' : 'Non indovinato'}
            </span>
        `;
        reviewList.appendChild(rowBtn);
    });

    // Aggiorna riepilogo punti squadra attiva
    const activeScore = calculateActiveTeamRoundScore();
    const badge = document.getElementById('step4-active-score-badge');
    badge.textContent = `${activeScore >= 0 ? '+' + activeScore : activeScore} pt`;
    badge.className = `font-black text-base ${activeScore > 0 ? 'text-emerald-600' : (activeScore < 0 ? 'text-red-600' : 'text-slate-900')}`;

    // Aggiorna stile dei 3 pulsanti della replica avversaria
    ['normal', 'forbidden', 'wrong'].forEach(key => {
        const btn = document.getElementById(`opp-btn-${key}`);
        const active = state.opponentChoices[key];
        if (active) {
            if (key === 'wrong') {
                btn.className = 'text-left p-3.5 rounded-2xl border-2 border-red-500 bg-red-50/70 ring-2 ring-red-500/20 transition flex items-center justify-between';
            } else {
                btn.className = 'text-left p-3.5 rounded-2xl border-2 border-emerald-500 bg-emerald-50/70 ring-2 ring-emerald-500/20 transition flex items-center justify-between';
            }
        } else {
            btn.className = 'text-left p-3.5 rounded-2xl border-2 border-slate-200 hover:border-slate-300 bg-white transition flex items-center justify-between';
        }
    });
}

// Oggetto normale: combinabile con tutto.
// Proibito indovinato (+2) e proibito errato (-2): alternativi tra loro.
function toggleOpponentChoice(type) {
    state.opponentChoices[type] = !state.opponentChoices[type];
    if (state.opponentChoices[type]) {
        if (type === 'forbidden') state.opponentChoices.wrong = false;
        if (type === 'wrong') state.opponentChoices.forbidden = false;
    }
    playBeep(state.opponentChoices[type] ? 680 : 480, 0.06);
    renderStep4ReviewAndOpponent();
}

// PASSO 5, 6 & 7: REGISTRA PUNTI, GIRA RUOTA IN SENSO ORARIO, INSERISCI NUOVA CARTA NELLO SLOT 1 INIZIALE
function finalizeTurnAndRotateWheel() {
    if (state.animating) return;
    const activeIdx = state.activeTeamIdx;
    const oppIdx = (activeIdx + 1) % 2;

    // Fotografia dello stato prima del turno, per "Annulla ultimo turno"
    const clone = (x) => JSON.parse(JSON.stringify(x));
    const undo = {
        teams: clone(state.teams),
        activeTeamIdx: state.activeTeamIdx,
        totalTurnsPlayed: state.totalTurnsPlayed,
        history: clone(state.history),
        wheelSlots: clone(state.wheelSlots),
        selectedSlotIdx: state.selectedSlotIdx,
        activeCard: clone(state.activeCard),
        guessedObjects: [...state.guessedObjects],
        forbiddenTriggered: state.forbiddenTriggered,
        opponentChoices: { ...state.opponentChoices },
        drawnCardId: null,
        usedCardIds: [...state.usedCardIds] // prima della pesca: anche un ricomincio automatico del mazzo si annulla
    };
    state.lastTurnUndo = undo;

    const activePts = calculateActiveTeamRoundScore();
    let oppPts = 0;
    if (state.opponentChoices.normal) oppPts += 1;
    if (state.opponentChoices.forbidden) oppPts += 2;
    if (state.opponentChoices.wrong) oppPts -= 2;

    state.teams[activeIdx].score += activePts;
    state.teams[activeIdx].turnsPlayed += 1;
    state.teams[oppIdx].score += oppPts;
    state.totalTurnsPlayed += 1;

    // Aggiungi riga alla Carta Punteggio
    state.history.unshift({
        turn: state.totalTurnsPlayed,
        activeTeam: state.teams[activeIdx].name,
        activeDelta: activePts,
        oppTeam: state.teams[oppIdx].name,
        oppDelta: oppPts,
        theme: state.activeCard.tema
    });

    updateScorecardUI();

    // Controllo Vittoria (Regola esatta: >= 20 punti dopo che ENTRAMBE le squadre hanno giocato lo stesso numero di turni!)
    const t0 = state.teams[0];
    const t1 = state.teams[1];
    if (t0.turnsPlayed === t1.turnsPlayed && (t0.score >= 20 || t1.score >= 20)) {
        if (t0.score !== t1.score) {
            const winner = t0.score > t1.score ? t0 : t1;
            document.getElementById('victory-title').textContent = `${winner.name} Vince!`;
            document.getElementById('victory-subtitle').textContent = `Punteggio finale: ${t0.name} ${t0.score} pt — ${t1.name} ${t1.score} pt (${t0.turnsPlayed} turni ciascuno).`;
            playFanfare();
            openModal('victory-modal');
            clearSavedGame();
            return;
        } else {
            showToast("Parità oltre i 20 punti! Si prosegue con un turno di spareggio ciascuno!");
        }
    }

    // PASSO 6 & 7: Rimuovi la carta scelta, gira la ruota di 1 tacca in senso orario (su 5 slot) e inserisci una nuova carta nello Slot 1 Iniziale (indice 0)
    // Ordine orario:
    // Slot 1 Iniziale (0) -> Slot 2 Normale (1)
    // Slot 2 Normale (1) -> Slot 3 Normale (2)
    // Slot 3 Normale (2) -> Slot 4 Bonus Nero +1 (3)
    // Slot 4 Bonus Nero +1 (3) -> Slot 5 Bonus Blu +1 Obbligatorio (4)
    // Slot 5 Bonus Blu +1 (4) -> Slot 1 Iniziale (0)
    const tempSlots = [...state.wheelSlots];
    state.lastPlayedCard = state.wheelSlots[state.selectedSlotIdx];
    tempSlots[state.selectedSlotIdx] = null; // Scarta la carta appena giocata

    const rotatedSlots = [
        tempSlots[4], // Slot 5 -> Slot 1 Iniziale (Freccia)
        tempSlots[0], // Slot 1 -> Slot 2 Normale
        tempSlots[1], // Slot 2 -> Slot 3 Normale
        tempSlots[2], // Slot 3 -> Slot 4 Bonus Nero (+1)
        tempSlots[3]  // Slot 4 -> Slot 5 Bonus Blu (+1 Obbligatorio)
    ];

    // Prima pesca la nuova carta (esclude quelle ancora sulla ruota), poi la mette nello Slot 1 o nel primo slot libero
    const playedSlotIdx = state.selectedSlotIdx;
    state.wheelSlots = tempSlots;
    const newCard = drawOneCardFromDeck();
    let newIdx = rotatedSlots[0] === null ? 0 : rotatedSlots.findIndex(x => x === null);
    if (newIdx !== -1) rotatedSlots[newIdx] = newCard;
    undo.drawnCardId = newCard.id;

    state.activeTeamIdx = oppIdx;
    state.selectedSlotIdx = null;
    state.activeCard = null;
    saveGame(rotatedSlots); // salvata subito, anche se l'app si chiude durante l'animazione
    updateScorecardUI();

    // Mostra la ruota com'era (con la carta giocata), poi anima la rotazione
    state.wheelSlots = [...tempSlots];
    state.wheelSlots[playedSlotIdx] = state.lastPlayedCard;
    enterStep1Wheel();
    document.getElementById('obligatory-banner').classList.add('hidden');
    document.querySelectorAll('#wheel-tiles .wheel-tile.card').forEach(el => el.classList.remove('locked'));

    animateWheelRotation(playedSlotIdx, () => {
        state.wheelSlots = rotatedSlots;
        enterStep1Wheel();
        renderWheelSlots(newIdx);
        showToast(`Ruota girata! Nuova carta in ingresso. Tocca a ${state.teams[state.activeTeamIdx].name}`);
    });
}

/**
 * AGGIORNAMENTO CARTA PUNTEGGIO
 */
function updateScorecardUI() {
    updateUndoButton();
    state.teams.forEach((t, idx) => {
        document.getElementById(`sc-name-${idx}`).textContent = t.name;
        document.getElementById(`sc-total-${idx}`).textContent = t.score;
        document.getElementById(`sc-turns-${idx}`).textContent = `${t.turnsPlayed} ${t.turnsPlayed === 1 ? 'turno' : 'turni'}`;
        const pct = Math.max(0, Math.min(100, (t.score / 20) * 100));
        document.getElementById(`sc-bar-${idx}`).style.width = `${pct}%`;

        const box = document.getElementById(`scorecard-team-${idx}`);
        if (idx === state.activeTeamIdx) {
            box.className = 'rounded-2xl p-3.5 border-2 border-[#4d9496] bg-[#e6f2f2]/40 transition';
        } else {
            box.className = 'rounded-2xl p-3.5 border-2 border-slate-200 bg-slate-50/70 transition';
        }
    });

    const histContainer = document.getElementById('score-history-container');
    const histList = document.getElementById('score-history-list');
    if (state.history.length > 0) {
        histContainer.classList.remove('hidden');
        histList.innerHTML = state.history.map(item => `
            <div class="flex items-center justify-between py-1.5 px-2.5 rounded-xl bg-slate-50 border border-slate-100">
                <div class="truncate pr-2">
                    <span class="font-black text-slate-400 mr-1.5">#${item.turn}</span>
                    <span class="font-bold text-slate-800">${escapeHtml(item.activeTeam)}</span>
                    <span class="text-slate-400">(${escapeHtml(item.theme)})</span>
                </div>
                <div class="flex items-center gap-2 shrink-0 font-black">
                    <span class="${item.activeDelta >= 0 ? 'text-emerald-600' : 'text-red-600'}">
                        ${item.activeDelta >= 0 ? '+' + item.activeDelta : item.activeDelta}
                    </span>
                    ${item.oppDelta !== 0 ? `<span class="text-[11px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-700">${escapeHtml(item.oppTeam)}: ${item.oppDelta > 0 ? '+' + item.oppDelta : item.oppDelta}</span>` : ''}
                </div>
            </div>
        `).join('');
    } else {
        histContainer.classList.add('hidden');
    }
}

/**
 * SUONI (shared/js/suoni.js) E TIMER 90 SECONDI (shared/js/timer.js)
 */
function toggleSound() {
    const muted = RG.suoni.alterna();
    showToast(muted ? 'Suoni disattivati' : 'Suoni attivati');
}

const playBeep = (freq, dur) => RG.suoni.bip(freq, dur);
const playBuzzer = () => RG.suoni.buzzer();
const playFanfare = () => RG.suoni.fanfara();
const playFartSound = () => RG.suoni.peto();
const vibrate = pattern => RG.vibra(pattern);

const ROUND_SECONDS = 90;
const timer = new RG.Timer({
    secondi: ROUND_SECONDS,
    ogniSecondo: timerTick,
    allaFine: () => {
        vibrate([500, 150, 500]);
        playFartSound();
        endActiveTimerEarly();
    }
});

// Ogni secondo: aggiorna l'orologio; negli ultimi 10 secondi bip e vibrazione
function timerTick(left) {
    updateTimerDisplay();
    if (left <= 10 && left > 0) {
        playBeep(920, 0.09);
        vibrate(70);
    }
}

function startTimer90s() {
    document.getElementById('btn-pause-timer').textContent = 'Pausa';
    document.getElementById('timer-clock').classList.remove('text-red-600');
    timer.avvia(ROUND_SECONDS); // tiene anche lo schermo acceso
    updateTimerDisplay();
}

function toggleTimerPause() {
    if (timer.inCorso) {
        timer.pausa();
        document.getElementById('btn-pause-timer').textContent = 'Riprendi';
    } else {
        document.getElementById('btn-pause-timer').textContent = 'Pausa';
        timer.riprendi();
    }
}

function stopTimer() {
    timer.ferma();
}

function updateTimerDisplay() {
    const left = timer.rimasti;
    const m = Math.floor(left / 60);
    const s = left % 60;
    const clockEl = document.getElementById('timer-clock');
    clockEl.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

    const pct = (left / ROUND_SECONDS) * 100;
    const barEl = document.getElementById('timer-bar');
    barEl.style.width = `${pct}%`;

    if (left <= 15) {
        clockEl.classList.add('text-red-600');
        barEl.className = 'h-full bg-red-600 transition-all duration-300 ease-linear rounded-full';
    } else if (left <= 35) {
        clockEl.classList.remove('text-red-600');
        barEl.className = 'h-full bg-amber-500 transition-all duration-300 ease-linear rounded-full';
    } else {
        clockEl.classList.remove('text-red-600');
        barEl.className = 'h-full bg-[#4d9496] transition-all duration-300 ease-linear rounded-full';
    }
}

/**
 * MODALI
 */
// Conferma dentro l'app (shared/js/dialoghi.js): askConfirm(titolo, testo, etichettaOk, azione)
function askConfirm(title, text, okLabel, onOk, danger = false) {
    RG.conferma({ titolo: title, testo: text, ok: okLabel, pericolo: danger }).then(ok => { if (ok && onOk) onOk(); });
}

function openModal(id) {
    document.getElementById(id).classList.remove('hidden');
}

function closeModal(id) {
    document.getElementById(id).classList.add('hidden');
}

function showToast(msg, type) {
    RG.toast(msg, type);
}
