/*
 * Ritornello - canticchia il brano, la tua squadra indovina titolo e artista.
 * Brani inclusi in dati/brani.js, ricerche del catalogo iTunes in dati/ricerche.js.
 * Le parti comuni (memoria, nomi, timer, suoni, finestre, notifiche, salvataggio)
 * arrivano da shared/js/ tramite l'oggetto globale RG.
 *
 * Un turno passa per quattro fasi (stato.fase):
 *   consegna  "passa il telefono a chi canta"
 *   segreto   chi canta vede il brano (e può ripassarlo in cuffia)
 *   canta     timer: si canticchia, la squadra indovina, aiuti a −1
 *   svela     brano svelato con l'anteprima; punti, eventuale furto, esito
 */
(function () {
    'use strict';

    const ARCHIVIO = RG.archivio.spazio('ritornello');
    const DATI = window.RITORNELLO_RICERCHE;
    const NOMI_PREDEFINITI = ['Squadra A', 'Squadra B', 'Squadra C', 'Squadra D'];
    const PUNTI = { titolo: 2, artista: 1, furto: 1 };
    const COSTO_AIUTO = 1;
    const SECONDI_RIPASSO = 10;
    const $ = id => document.getElementById(id);

    /* ================= STATO ================= */
    const stato = {
        squadre: [],          // { nome, punti }
        turnoDi: 0,
        giro: 1,
        traguardo: 15,
        secondi: 45,
        categoria: 'tutto',
        fase: null,
        brano: null,          // { titolo, artista, anno, gruppo, anteprima, copertina }
        cambiato: false,      // "cambia brano" già usato in questo turno
        aiuti: { anno: false, lettera: false },
        rimasti: 45,
        esito: null,          // { tipo: titolo|artista|niente|parola, ladro: indice|null }
        svelaMotivo: null,    // indovinato | tempo | parola
        annulla: null,        // istantanea di prima dei punti, per "Annulla ultimo turno"
        usati: [],            // chiavi dei brani già usciti in questa partita
        avviata: false,
        finita: false
    };
    let mazzo = [];
    let pescatiNelTurno = []; // brani pescati nel turno in corso (anche quello cambiato)
    let catalogoLive = [];
    let partitaN = 0; // cambia a ogni partita iniziata o ripresa: i cataloghi arrivati in ritardo si scartano
    let timer = null;

    /* ================= TESTI E CHIAVI ================= */
    function normalizza(testo) {
        return String(testo || '')
            .toLowerCase()
            .replace(/\(.*?\)|\[.*?\]/g, ' ')
            .split(' - ')[0]
            .normalize('NFD').replace(/[̀-ͯ]/g, '')
            .replace(/[^a-z0-9]+/g, ' ')
            .trim();
    }

    function artistaPrincipale(testo) {
        return normalizza(String(testo || '').split(/\s+(?:ft\.?|feat\.?|featuring|x|e|ed|and)\s+|&|,/i)[0]);
    }

    function chiave(brano) {
        return `${normalizza(brano.titolo)}__${artistaPrincipale(brano.artista)}`;
    }

    function artistiSimili(a, b) {
        return !!a && !!b && (a === b || a.includes(b) || b.includes(a));
    }

    // Solo indirizzi https: arrivano da iTunes (o da un salvataggio) e finiscono in src
    function urlSicuro(url) {
        return typeof url === 'string' && /^https:\/\/[^\s"'<>]+$/i.test(url) ? url : '';
    }

    function copertinaGrande(url) {
        return urlSicuro(url).replace(/\/\d+x\d+bb\.(jpg|png)$/i, '/600x600bb.jpg');
    }

    // Brano ricostruito campo per campo: niente di estraneo da salvataggi o risposte online
    function pulisciBrano(b) {
        if (!b || typeof b.titolo !== 'string' || typeof b.artista !== 'string') return null;
        const anno = Number.isInteger(b.anno) ? b.anno : null;
        return {
            titolo: b.titolo.slice(0, 160),
            artista: b.artista.slice(0, 160),
            anno,
            gruppo: ['it', 'rap', 'int', 'bimbi'].includes(b.gruppo) ? b.gruppo : 'int',
            anteprima: urlSicuro(b.anteprima),
            copertina: urlSicuro(b.copertina)
        };
    }

    function primaLettera(titolo) {
        const m = String(titolo).match(/[A-Za-zÀ-ÖØ-öø-ÿ0-9]/);
        return m ? m[0].toUpperCase() : '?';
    }

    /* ================= BRANI INCLUSI E CATEGORIE ================= */
    const RISERVA = window.RITORNELLO_BRANI.map(([titolo, artista, anno, gruppo]) => ({ titolo, artista, anno, gruppo }));

    // "Ultimi 10 anni": l'anno in corso e i 9 prima (nel 2026: dal 2017), calcolato sulla data di oggi
    const ANNO_CORRENTE = new Date().getFullYear();
    const ANNO_MODERNO = ANNO_CORRENTE - 9;
    // Ultimi 3 anni per le ricerche con l'anno; a gennaio e febbraio (prima di Sanremo) l'anno nuovo
    // non ha ancora successi: si parte da quello prima
    const anniRicerca = () => {
        const da = new Date().getMonth() >= 2 ? 0 : 1;
        return [da, da + 1, da + 2].map(n => ANNO_CORRENTE - n);
    };

    const CATEGORIE = {
        tutto: () => true,
        italiane: b => b.gruppo === 'it' || b.gruppo === 'rap',
        'italiane-moderne': b => (b.gruppo === 'it' || b.gruppo === 'rap') && b.anno >= ANNO_MODERNO,
        rap: b => b.gruppo === 'rap' && b.anno >= ANNO_MODERNO,
        internazionali: b => b.gruppo === 'int',
        classici: b => b.gruppo !== 'bimbi' && b.anno <= 1989,
        '9000': b => b.gruppo !== 'bimbi' && b.anno >= 1990 && b.anno <= 2009,
        recenti: b => b.gruppo !== 'bimbi' && b.anno >= 2010,
        bambini: b => b.gruppo === 'bimbi'
    };
    // Solo le chiavi scritte qui (non "constructor", "toString"… ereditati da Object): arrivano anche da salvataggi
    const haChiave = (tabella, chiaveCercata) => typeof chiaveCercata === 'string' && Object.prototype.hasOwnProperty.call(tabella, chiaveCercata);
    const filtroCategoria = () => (haChiave(CATEGORIE, stato.categoria) ? CATEGORIE[stato.categoria] : CATEGORIE.tutto);

    // rg-ritornello-brani-cantati: brani usciti nelle partite precedenti (escono per ultimi)
    function storico() {
        const lista = ARCHIVIO.leggi('brani-cantati', []);
        return new Set(Array.isArray(lista) ? lista : []);
    }
    function segnaCantato(brano) {
        const s = storico();
        s.delete(chiave(brano));
        s.add(chiave(brano));
        ARCHIVIO.scrivi('brani-cantati', Array.from(s).slice(-500));
    }

    /* ================= CATALOGO ONLINE (iTunes, JSONP) ================= */
    // Risultati della ricerca, oppure null se iTunes non risponde (rete assente, errore, tempo scaduto)
    let contatoreJsonp = 0;
    let itunesMuto = false; // l'ultima richiesta a iTunes non ha avuto risposta (connessione assente)
    function jsonp(url, ms = 6000) {
        return new Promise((risolvi) => {
            const nome = `__ritornelloCb_${Date.now()}_${contatoreJsonp++}`;
            const script = document.createElement('script');
            let finito = false;
            const fine = (dati) => {
                if (finito) return;
                finito = true;
                clearTimeout(tempo);
                script.remove();
                window[nome] = () => {}; // una risposta in ritardo non deve dare errori
                itunesMuto = dati === null;
                risolvi(dati && Array.isArray(dati.results) ? dati.results : (dati === null ? null : []));
            };
            const tempo = setTimeout(() => fine(null), ms);
            window[nome] = (dati) => fine(dati || {});
            script.onerror = () => fine(null);
            script.src = `${url}&callback=${nome}`;
            document.head.appendChild(script);
        });
    }

    function cercaItunes(termine, paese, limite) {
        return jsonp(`https://itunes.apple.com/search?term=${encodeURIComponent(termine)}&country=${paese}&media=music&entity=song&limit=${limite}`);
    }

    function regexParole(parole) {
        const esc = p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(`(^|[^a-z0-9àèéìòù])(${parole.map(esc).join('|')})([^a-z0-9àèéìòù]|$)`, 'i');
    }
    const ALBUM_VIETATI = regexParole(DATI.paroleAlbumVietate);
    const VERSIONI_VIETATE = regexParole(DATI.paroleVersioneVietate);

    // Le "etichette" di versione: ciò che sta tra parentesi o dopo " - " nel titolo del brano
    function etichetteVersione(titolo) {
        const parti = [];
        const re = /[([]([^)\]]*)[)\]]/g;
        let m;
        while ((m = re.exec(titolo)) !== null) parti.push(m[1]);
        const trattino = titolo.indexOf(' - ');
        if (trattino !== -1) parti.push(titolo.slice(trattino + 3));
        return parti.join(' | ');
    }

    function braniOriginale(r) {
        if (!r || typeof r.trackName !== 'string' || typeof r.artistName !== 'string' || typeof r.releaseDate !== 'string') return false;
        if (!urlSicuro(r.previewUrl)) return false;
        if (/various artists|artisti vari|karaoke/i.test(`${r.artistName} ${r.collectionArtistName || ''}`)) return false;
        const album = String(r.collectionName || '');
        const albumSingolo = normalizza(album).startsWith(normalizza(r.trackName));
        if (!albumSingolo && ALBUM_VIETATI.test(album)) return false;
        const etichette = etichetteVersione(r.trackName);
        if (etichette && VERSIONI_VIETATE.test(etichette)) return false;
        const anno = parseInt(r.releaseDate.slice(0, 4), 10);
        return anno >= 1940 && anno <= ANNO_CORRENTE + 1;
    }

    const RICERCA_ITALIANA = /ital|sanremo|tormentoni|vasco|battisti|mina|celentano|pausini|ramazzotti|jovanotti|883|dalla|ligabue|maneskin|mahmood|d'avena|zecchino|vanni|bambini|disney/i;

    // Brani del catalogo iTunes per la categoria scelta, oppure null se iTunes non risponde
    async function scaricaCatalogo(categoria) {
        if (navigator.onLine === false) return null; // il telefono sa già di essere offline
        const fisse = haChiave(DATI.ricerche, categoria) ? DATI.ricerche[categoria] : DATI.ricerche.tutto;
        // ricerche con l'anno, per gli ultimi 3 anni ("sanremo 2026", "sanremo 2025"…)
        const conAnno = (haChiave(DATI.ricercheConAnno, categoria) ? DATI.ricercheConAnno[categoria] : [])
            .flatMap(q => anniRicerca().map(anno => q.replace('{anno}', anno)));
        const ricerche = RG.mescola([...fisse, ...conAnno]).slice(0, 6);
        const trovati = new Map();
        const annoMinimo = new Map(); // tra tutte le versioni restituite: le ristampe hanno anni successivi
        let raggiunto = false;

        await Promise.all(ricerche.map(async (q) => {
            const italiana = ['italiane', 'italiane-moderne', 'rap', 'bambini'].includes(categoria) || RICERCA_ITALIANA.test(q);
            const risultati = await cercaItunes(q, italiana ? 'IT' : 'US', 25);
            if (!risultati) return;
            raggiunto = true;
            risultati.forEach(r => {
                if (!r || typeof r.trackName !== 'string' || typeof r.artistName !== 'string') return;
                const b = { titolo: r.trackName.trim(), artista: r.artistName.trim() };
                const k = chiave(b);
                const anno = parseInt(String(r.releaseDate || '').slice(0, 4), 10);
                if (anno && (!annoMinimo.has(k) || anno < annoMinimo.get(k))) annoMinimo.set(k, anno);
                if (!braniOriginale(r) || trovati.has(k)) return;
                // nel rap le ricerche per nome trovano anche altro (salmi, canzoni pop): solo genere hip-hop/rap
                if (categoria === 'rap' && !/hip.?hop|rap/i.test(r.primaryGenreName || '')) return;
                trovati.set(k, pulisciBrano({
                    ...b,
                    anno,
                    gruppo: categoria === 'bambini' ? 'bimbi' : categoria === 'rap' ? 'rap' : (italiana ? 'it' : 'int'),
                    anteprima: r.previewUrl,
                    copertina: copertinaGrande(r.artworkUrl100)
                }));
            });
        }));
        if (!raggiunto) return null;
        const filtro = CATEGORIE[categoria] || CATEGORIE.tutto;
        return [...trovati.entries()]
            .map(([k, b]) => ({ ...b, anno: Math.min(b.anno, annoMinimo.get(k) || b.anno) }))
            .filter(filtro);
    }

    // Anteprima di un brano incluso: si cerca su iTunes la prima volta che serve
    const ricercheAnteprima = new Map();
    const nonTrovate = new Set();

    // Testo sotto il pulsante di ascolto quando l'anteprima non c'è (ancora)
    function notaSenzaAnteprima(brano) {
        if (navigator.onLine === false || itunesMuto) return 'Senza connessione non si può ascoltare il brano.';
        if (nonTrovate.has(chiave(brano))) return 'Anteprima non trovata nel catalogo online.';
        return 'Cerco l\'anteprima…';
    }
    function trovaAnteprima(brano) {
        if (!brano || brano.anteprima || navigator.onLine === false) return Promise.resolve(brano);
        const k = chiave(brano);
        if (!ricercheAnteprima.has(k)) {
            const ricerca = (async () => {
                const risultati = await cercaItunes(`${brano.titolo} ${brano.artista.replace(/\(.*?\)/g, '')}`, 'IT', 10);
                if (!risultati) return null;
                const titolo = normalizza(brano.titolo);
                const artista = artistaPrincipale(brano.artista);
                // Disney e Zecchino d'Oro: l'artista su iTunes è un altro nome, basta il titolo
                const soloTitolo = /disney|pixar|zecchino/i.test(brano.artista);
                const buono = risultati.find(r => r && urlSicuro(r.previewUrl) && normalizza(r.trackName) === titolo &&
                    (soloTitolo || artistiSimili(artistaPrincipale(r.artistName), artista)));
                return buono ? { anteprima: urlSicuro(buono.previewUrl), copertina: copertinaGrande(buono.artworkUrl100) } : {};
            })();
            ricercheAnteprima.set(k, ricerca);
            ricerca.then(r => {
                if (!r) ricercheAnteprima.delete(k); // iTunes non ha risposto: si riprova poi
                else if (!r.anteprima) nonTrovate.add(k);
            });
        }
        return ricercheAnteprima.get(k).then(r => {
            if (r && r.anteprima) brano.anteprima = r.anteprima;
            if (r && r.copertina && !brano.copertina) brano.copertina = r.copertina;
            return brano;
        });
    }

    /* ================= MAZZO ================= */
    // I brani mai cantati finiscono in fondo all'elenco: pop() li pesca per primi
    function preparaMazzo() {
        const filtro = filtroCategoria();
        const esclusi = new Set(stato.usati);
        if (stato.brano) esclusi.add(chiave(stato.brano));
        const perChiave = new Map();
        RISERVA.filter(filtro).forEach(b => perChiave.set(chiave(b), { ...b }));
        const inclusi = [...perChiave.values()];
        catalogoLive.forEach(b => {
            // stesso brano anche se l'artista è scritto in un altro modo ("Guè Pequeno" / "Guè")
            const titolo = normalizza(b.titolo);
            const artista = artistaPrincipale(b.artista);
            const incluso = perChiave.get(chiave(b)) ||
                inclusi.find(i => normalizza(i.titolo) === titolo && artistiSimili(artistaPrincipale(i.artista), artista));
            if (!incluso) perChiave.set(chiave(b), { ...b });
            else if (!incluso.anteprima) Object.assign(incluso, { anteprima: b.anteprima, copertina: b.copertina });
        });
        const visti = storico();
        const tutti = [...perChiave.entries()].filter(([k]) => !esclusi.has(k));
        mazzo = [
            ...RG.mescola(tutti.filter(([k]) => visti.has(k)).map(([, b]) => b)),
            ...RG.mescola(tutti.filter(([k]) => !visti.has(k)).map(([, b]) => b))
        ];
    }

    function pescaBrano() {
        if (!mazzo.length) {
            stato.usati = [];
            preparaMazzo();
            RG.toast('Brani finiti: si ricomincia dal mazzo intero.', 'info');
        }
        const brano = mazzo.pop() || { ...(RISERVA.find(filtroCategoria()) || RISERVA[0]) };
        stato.usati.push(chiave(brano));
        segnaCantato(brano);
        pescatiNelTurno.push(brano);
        return brano;
    }

    /* ================= SUONI E AUDIO ================= */
    const audio = $('anteprima');
    let fineRipasso = null;

    function caricaAudio(url) {
        if ((audio.dataset.url || '') === url) return;
        audio.pause();
        audio.dataset.url = url;
        if (url) audio.src = url;
        else audio.removeAttribute('src');
        audio.load();
    }

    function fermaAudio() {
        clearTimeout(fineRipasso);
        audio.pause();
    }

    function suona(daCapo = false) {
        if (!stato.brano || !stato.brano.anteprima) return;
        caricaAudio(stato.brano.anteprima);
        if (daCapo || audio.ended) audio.currentTime = 0;
        audio.play().catch(() => {
            $('lettore-nota').textContent = 'Il telefono non ha fatto partire l\'audio: tocca "Ascolta".';
        });
    }

    audio.addEventListener('play', disegnaLettore);
    audio.addEventListener('pause', disegnaLettore);
    audio.addEventListener('ended', disegnaLettore);
    audio.addEventListener('timeupdate', () => {
        const p = audio.duration ? Math.min(100, (audio.currentTime / audio.duration) * 100) : 0;
        $('lettore-avanzamento').style.width = `${p}%`;
    });
    audio.addEventListener('error', () => {
        if (!audio.dataset.url) return;
        $('lettore-nota').textContent = 'Anteprima non disponibile: controlla la connessione.';
        $('ripasso-nota').textContent = 'Anteprima non disponibile: controlla la connessione.';
    });

    /* ================= PUNTEGGI ================= */
    function disegnaPunteggi() {
        $('punteggi').innerHTML = stato.squadre.map((s, i) => `
            <div class="chip${i === stato.turnoDi ? ' is-active' : ''}" aria-label="${RG.esc(s.nome)}: ${s.punti} punti su ${stato.traguardo}${i === stato.turnoDi ? ', di turno' : ''}">
                <span class="chip-name">${RG.esc(s.nome)}</span>
                <span class="chip-num">${s.punti}</span>
            </div>`).join('');
    }

    const squadraDiTurno = () => stato.squadre[stato.turnoDi];
    const vincitrice = () => stato.squadre.find(s => s.punti >= stato.traguardo) || null;

    /* ================= FASI DEL TURNO ================= */
    function mostraFase(fase) {
        stato.fase = fase;
        ['consegna', 'segreto', 'canta', 'svela'].forEach(f => $(`fase-${f}`).classList.toggle('hidden', f !== fase));
        disegnaPunteggi();
        aggiornaAnnulla();
        salva();
        window.scrollTo({ top: 0 });
    }

    function inizioTurno() {
        fermaAudio();
        pescatiNelTurno = [];
        stato.brano = pescaBrano();
        stato.cambiato = false;
        stato.aiuti = { anno: false, lettera: false };
        stato.rimasti = stato.secondi;
        stato.esito = null;
        stato.svelaMotivo = null;
        mostraConsegna();
    }

    function mostraConsegna() {
        $('consegna-giro').textContent = `Turno ${stato.giro}: tocca a`;
        $('consegna-squadra').textContent = squadraDiTurno().nome;
        mostraFase('consegna');
    }

    function disegnaCarta(prefisso, brano) {
        $(`${prefisso}-titolo`).textContent = brano.titolo;
        $(`${prefisso}-artista`).textContent = brano.artista;
        $(`${prefisso}-anno`).textContent = brano.anno || '';
        const copertina = $(`${prefisso}-copertina`);
        copertina.innerHTML = '';
        if (brano.copertina) {
            const img = document.createElement('img');
            img.alt = '';
            img.src = brano.copertina;
            img.onerror = () => img.remove();
            copertina.appendChild(img);
        }
    }

    function mostraSegreto() {
        const brano = stato.brano;
        disegnaCarta('segreto', brano);
        $('cambia-brano').hidden = stato.cambiato;
        mostraFase('segreto');
        disegnaRipasso();
        trovaAnteprima(brano).then(() => {
            if (stato.brano !== brano) return;
            disegnaCarta(stato.fase === 'svela' ? 'svela' : 'segreto', brano);
            disegnaRipasso();
            disegnaLettore();
            salva();
        });
    }

    function disegnaRipasso() {
        const b = stato.brano;
        const pulsante = $('ripassa');
        pulsante.disabled = !b.anteprima;
        pulsante.textContent = !audio.paused && audio.dataset.url === b.anteprima ? 'Ferma' : `Ascolta ${SECONDI_RIPASSO} secondi in cuffia`;
        const nota = $('ripasso-nota');
        nota.textContent = b.anteprima ? 'Abbassa il volume o usa le cuffie: gli altri non devono sentire.' : notaSenzaAnteprima(b);
    }

    $('mostra-brano').addEventListener('click', mostraSegreto);

    $('ripassa').addEventListener('click', () => {
        if (!audio.paused) { fermaAudio(); disegnaRipasso(); return; }
        suona(true);
        clearTimeout(fineRipasso);
        fineRipasso = setTimeout(() => { audio.pause(); disegnaRipasso(); }, SECONDI_RIPASSO * 1000);
        disegnaRipasso();
    });

    $('cambia-brano').addEventListener('click', () => {
        if (stato.cambiato) return;
        fermaAudio();
        stato.cambiato = true;
        stato.brano = pescaBrano();
        mostraSegreto();
        RG.toast('Brano cambiato.', 'info');
    });

    /* ---------- Canta ---------- */
    function creaTimer() {
        if (timer) timer.ferma();
        timer = new RG.Timer({
            secondi: stato.secondi,
            ogniSecondo: (r) => {
                stato.rimasti = r;
                disegnaTempo();
                if (r > 0 && r <= 5) { RG.suoni.bip(880, 0.08); RG.vibra(40); }
                salva();
            },
            allaFine: tempoScaduto
        });
        timer.rimasti = stato.rimasti;
    }

    function disegnaTempo() {
        const r = stato.rimasti;
        $('secondi').textContent = r;
        const fatto = 1 - r / stato.secondi;
        const nota = $('nota-viaggio');
        nota.style.left = `${(fatto * 100).toFixed(2)}%`;
        // la nota sale e scende sul pentagramma come una melodia
        nota.style.top = `${[50, 30, 10, 30, 70, 90, 70, 50][r % 8]}%`;
        $('fase-canta').classList.toggle('is-ultimi', r <= 10);
        $('pausa').textContent = timer && timer.inCorso ? 'Pausa' : 'Riprendi il tempo';
    }

    function mostraCanta(avvia) {
        fermaAudio();
        $('canta-chi').textContent = `Indovina ${squadraDiTurno().nome}`;
        disegnaAiuti();
        creaTimer();
        mostraFase('canta');
        if (avvia) timer.riprendi();
        disegnaTempo();
    }

    $('via').addEventListener('click', () => {
        stato.annulla = null; // partito il tempo, il turno precedente non si annulla più
        RG.suoni.effetto('click');
        mostraCanta(true);
    });

    $('pausa').addEventListener('click', () => {
        if (!timer) return;
        if (timer.inCorso) timer.pausa(); else timer.riprendi();
        disegnaTempo();
        salva();
    });

    function disegnaAiuti() {
        const b = stato.brano;
        document.querySelectorAll('.aiuto').forEach(p => {
            const usato = stato.aiuti[p.dataset.aiuto];
            p.disabled = usato || (p.dataset.aiuto === 'anno' && !b.anno);
            p.classList.toggle('is-usato', usato);
        });
        const scoperti = [];
        if (stato.aiuti.anno) scoperti.push(`<span>Uscito nel <strong>${RG.esc(b.anno)}</strong></span>`);
        if (stato.aiuti.lettera) scoperti.push(`<span>Il titolo inizia per <strong>${RG.esc(primaLettera(b.titolo))}</strong></span>`);
        $('aiuti-scoperti').innerHTML = scoperti.join('');
    }

    document.querySelectorAll('.aiuto').forEach(p => p.addEventListener('click', () => {
        const tipo = p.dataset.aiuto;
        if (stato.fase !== 'canta' || stato.aiuti[tipo]) return;
        stato.aiuti[tipo] = true;
        const s = squadraDiTurno();
        s.punti = Math.max(0, s.punti - COSTO_AIUTO);
        RG.suoni.effetto('moneta');
        disegnaAiuti();
        disegnaPunteggi();
        salva();
    }));

    // "Tieni premuto per rivedere il brano": solo chi canta, solo finché tiene premuto
    const sbircia = $('sbircia');
    const mostraSbirciata = (si) => {
        $('sbircia-testo').textContent = si && stato.brano ? `${stato.brano.titolo} – ${stato.brano.artista}` : '';
        sbircia.classList.toggle('is-premuto', si);
    };
    sbircia.addEventListener('pointerdown', (e) => { e.preventDefault(); mostraSbirciata(true); });
    ['pointerup', 'pointerleave', 'pointercancel', 'blur'].forEach(ev => sbircia.addEventListener(ev, () => mostraSbirciata(false)));
    sbircia.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); mostraSbirciata(true); } });
    sbircia.addEventListener('keyup', () => mostraSbirciata(false));
    sbircia.addEventListener('contextmenu', e => e.preventDefault());

    $('indovinato').addEventListener('click', () => {
        if (timer) timer.ferma();
        vaiSvela('indovinato');
        suona(true); // il tocco permette al telefono di far partire l'audio
    });

    function tempoScaduto() {
        RG.suoni.buzzer();
        RG.vibra([400, 120, 400]);
        vaiSvela('tempo');
    }

    $('parola').addEventListener('click', async () => {
        const correva = timer && timer.inCorso;
        if (correva) timer.pausa();
        const si = await RG.conferma({
            titolo: 'Ha detto una parola?',
            testo: 'Il turno è perso: nessun punto per nessuno, niente furto.',
            ok: 'Turno perso',
            pericolo: true
        });
        if (!si) {
            if (correva && stato.fase === 'canta') timer.riprendi();
            disegnaTempo();
            return;
        }
        if (timer) timer.ferma();
        stato.svelaMotivo = 'parola';
        fotografaTurno();
        stato.esito = { tipo: 'parola' };
        RG.suoni.effetto('errore');
        vaiSvela('parola');
    });

    /* ---------- Svela ---------- */
    const MOTIVI = { indovinato: 'Ecco il brano', tempo: 'Tempo scaduto', parola: 'Turno perso: ha detto una parola' };

    function vaiSvela(motivo) {
        stato.svelaMotivo = motivo;
        mostraFase('svela');
        disegnaSvela();
        if (!stato.brano.anteprima) trovaAnteprima(stato.brano).then(b => { if (stato.brano === b) { disegnaCarta('svela', b); disegnaLettore(); salva(); } });
    }

    function disegnaLettore() {
        const b = stato.brano;
        if (!b) return;
        const nostro = audio.dataset.url && audio.dataset.url === b.anteprima;
        const suonando = nostro && !audio.paused;
        const tasto = $('ascolta');
        tasto.disabled = !b.anteprima;
        tasto.textContent = suonando ? 'Pausa' : (nostro && audio.currentTime > 0 && !audio.ended ? 'Continua' : 'Ascolta');
        $('lettore').classList.toggle('is-suona', suonando);
        if (!nostro) $('lettore-avanzamento').style.width = '0%';
        const nota = $('lettore-nota');
        if (b.anteprima) nota.textContent = suonando || nostro ? '' : 'Tocca "Ascolta" per sentire il pezzo vero.';
        else nota.textContent = notaSenzaAnteprima(b);
        if (stato.fase === 'segreto') disegnaRipasso();
    }

    $('ascolta').addEventListener('click', () => {
        clearTimeout(fineRipasso);
        if (!audio.paused) audio.pause();
        else suona(false);
    });

    function disegnaSvela() {
        const b = stato.brano;
        const s = squadraDiTurno();
        $('svela-motivo').textContent = MOTIVI[stato.svelaMotivo] || MOTIVI.indovinato;
        disegnaCarta('svela', b);
        disegnaLettore();
        $('domanda-punti').textContent = `Cosa ha indovinato ${s.nome}?`;

        const e = stato.esito;
        const furto = e && e.tipo === 'niente' && e.ladro === undefined;
        $('blocco-punti').classList.toggle('hidden', !!e);
        $('blocco-furto').classList.toggle('hidden', !furto);
        $('blocco-esito').classList.toggle('hidden', !e || furto);

        if (furto) {
            const altre = stato.squadre.map((q, i) => ({ q, i })).filter(({ i }) => i !== stato.turnoDi);
            $('scelte-furto').innerHTML = altre.map(({ q, i }) =>
                `<button type="button" class="scelta" data-ladro="${i}"><strong>${RG.esc(q.nome)}</strong><span>+${PUNTI.furto}</span></button>`).join('') +
                '<button type="button" class="scelta scelta-tenue" data-ladro=""><strong>Nessuno</strong><span>0</span></button>';
        }
        if (e && !furto) {
            $('esito-testo').innerHTML = testoEsito(e);
            $('prossimo').textContent = vincitrice() ? 'Vai alla premiazione' : 'Prossimo turno';
        }
        aggiornaAnnulla();
    }

    function testoEsito(e) {
        const nome = RG.esc(squadraDiTurno().nome);
        if (e.tipo === 'titolo') return `<strong>+${PUNTI.titolo}</strong> a ${nome}: titolo indovinato.`;
        if (e.tipo === 'artista') return `<strong>+${PUNTI.artista}</strong> a ${nome}: artista indovinato.`;
        if (e.tipo === 'parola') return `${nome} perde il turno: nessun punto.`;
        if (e.ladro === null || e.ladro === undefined) return 'Nessuno ha indovinato: nessun punto.';
        return `<strong>+${PUNTI.furto}</strong> a ${RG.esc(stato.squadre[e.ladro].nome)}: furto riuscito.`;
    }

    // Fotografia di prima dei punti, per "Annulla ultimo turno"
    function fotografaTurno() {
        stato.annulla = RG.partita.istantanea({
            squadre: stato.squadre, turnoDi: stato.turnoDi, giro: stato.giro, brano: stato.brano,
            aiuti: stato.aiuti, cambiato: stato.cambiato, usati: stato.usati, svelaMotivo: stato.svelaMotivo
        });
    }

    $('blocco-punti').addEventListener('click', (ev) => {
        const p = ev.target.closest('[data-esito]');
        if (!p || stato.esito) return;
        fotografaTurno();
        const tipo = p.dataset.esito;
        if (tipo === 'niente') {
            stato.esito = { tipo: 'niente' };
            RG.suoni.effetto('errore');
        } else {
            squadraDiTurno().punti += PUNTI[tipo];
            stato.esito = { tipo };
            RG.suoni.effetto('successo');
        }
        concludi();
    });

    $('scelte-furto').addEventListener('click', (ev) => {
        const p = ev.target.closest('[data-ladro]');
        if (!p || !stato.esito || stato.esito.ladro !== undefined) return;
        const ladro = p.dataset.ladro === '' ? null : Number(p.dataset.ladro);
        stato.esito.ladro = ladro;
        if (ladro !== null && stato.squadre[ladro]) {
            stato.squadre[ladro].punti += PUNTI.furto;
            RG.suoni.effetto('successo');
        }
        concludi();
    });

    function concludi() {
        disegnaPunteggi();
        disegnaSvela();
        salva();
    }

    $('prossimo').addEventListener('click', () => {
        const v = vincitrice();
        if (v) { premiazione(v); return; }
        stato.turnoDi = (stato.turnoDi + 1) % stato.squadre.length;
        if (stato.turnoDi === 0) stato.giro += 1;
        inizioTurno();
    });

    /* ================= PREMIAZIONE ================= */
    function premiazione(v) {
        fermaAudio();
        stato.finita = true;
        SALVATAGGIO.cancella();
        RG.suoni.fanfara();
        $('vittoria-titolo').textContent = `Vince ${v.nome}`;
        $('vittoria-dettaglio').textContent = `Prima squadra a ${stato.traguardo} punti, dopo ${stato.giro} ${stato.giro === 1 ? 'turno' : 'turni'}.`;
        $('classifica').innerHTML = [...stato.squadre].sort((a, b) => b.punti - a.punti).map((s, i) => `
            <li><span><span class="pos">${i + 1}</span><span class="pn">${RG.esc(s.nome)}</span></span>
            <span class="ps">${s.punti} ${s.punti === 1 ? 'punto' : 'punti'}</span></li>`).join('');
        $('vittoria').classList.remove('hidden');
        aggiornaAnnulla();
    }

    $('ancora').addEventListener('click', (e) => nuovaPartita(e.currentTarget));
    $('cambia-impostazioni').addEventListener('click', tornaAllaPreparazione);

    /* ================= ANNULLA ULTIMO TURNO ================= */
    // Si torna alla scelta dei punti del turno precedente: dall'esito, dalla premiazione
    // e all'inizio del turno dopo, finché non parte il tempo.
    function puoiAnnullare() {
        if (!stato.annulla || !stato.avviata) return false;
        if (stato.finita) return true;
        if (stato.fase === 'svela') return !!stato.esito;
        return stato.fase === 'consegna' || stato.fase === 'segreto';
    }

    function aggiornaAnnulla() {
        const si = puoiAnnullare();
        document.querySelectorAll('.annulla-turno').forEach(b => { b.hidden = !si; });
    }

    document.querySelectorAll('.annulla-turno').forEach(b => b.addEventListener('click', () => {
        if (!puoiAnnullare()) return;
        const u = stato.annulla;
        RG.conferma({
            titolo: 'Annullare l\'ultimo turno?',
            testo: `Si torna alla scelta dei punti di ${u.squadre[u.turnoDi].nome} ("${u.brano.titolo}"): punteggi come prima.`,
            ok: 'Annulla turno'
        }).then(si => { if (si && stato.annulla === u) applicaAnnulla(u); });
    }));

    function applicaAnnulla(u) {
        fermaAudio();
        // i brani già pescati per il turno dopo tornano nel mazzo (l'ultimo in cima)
        if (stato.fase !== 'svela') pescatiNelTurno.filter(b => chiave(b) !== chiave(u.brano)).forEach(b => mazzo.push(b));
        pescatiNelTurno = [];
        Object.assign(stato, {
            squadre: u.squadre, turnoDi: u.turnoDi, giro: u.giro, brano: u.brano, aiuti: u.aiuti,
            cambiato: u.cambiato, usati: u.usati, svelaMotivo: u.svelaMotivo || 'indovinato',
            esito: null, annulla: null, finita: false, rimasti: 0
        });
        $('vittoria').classList.add('hidden');
        mostraGioco();
        mostraFase('svela');
        disegnaSvela();
        RG.toast('Turno annullato: scegli di nuovo i punti.', 'info');
    }

    /* ================= SALVATAGGIO E RIPRESA ================= */
    // Squadre e squadra di turno leggibili (salvataggio e fotografia per "annulla")
    const squadreValide = d => Array.isArray(d.squadre) && d.squadre.length >= 2 && d.squadre.length <= 4 &&
        d.squadre.every(s => s && typeof s.nome === 'string' && Number.isFinite(s.punti)) &&
        Number.isInteger(d.turnoDi) && d.turnoDi >= 0 && d.turnoDi < d.squadre.length;

    const SALVATAGGIO = RG.partita.crea('ritornello', { versione: 1, valida: squadreValide });

    function salva() {
        if (!stato.avviata || stato.finita) return;
        SALVATAGGIO.salva({
            squadre: stato.squadre, turnoDi: stato.turnoDi, giro: stato.giro, traguardo: stato.traguardo,
            secondi: stato.secondi, categoria: stato.categoria, fase: stato.fase, brano: stato.brano,
            cambiato: stato.cambiato, aiuti: stato.aiuti, rimasti: stato.rimasti, esito: stato.esito,
            svelaMotivo: stato.svelaMotivo, annulla: stato.annulla, usati: stato.usati
        });
    }

    const numero = (v, ammessi, predefinito) => (ammessi.includes(v) ? v : predefinito);

    function pulisciSquadre(lista) {
        return lista.map(s => ({ nome: String(s.nome).slice(0, 24), punti: Math.max(0, Math.round(s.punti)) }));
    }

    const pulisciUsati = u => (Array.isArray(u) ? u.filter(k => typeof k === 'string').slice(-1000) : []);

    function pulisciAiuti(a) {
        return { anno: !!(a && a.anno), lettera: !!(a && a.lettera) };
    }

    function pulisciEsito(e, squadre) {
        if (!e || !['titolo', 'artista', 'niente', 'parola'].includes(e.tipo)) return null;
        const out = { tipo: e.tipo };
        if (e.tipo === 'niente' && 'ladro' in e) out.ladro = Number.isInteger(e.ladro) && e.ladro >= 0 && e.ladro < squadre ? e.ladro : null;
        return out;
    }

    function pulisciAnnulla(u) {
        const brano = u && squadreValide(u) ? pulisciBrano(u.brano) : null;
        if (!brano) return null;
        return {
            squadre: pulisciSquadre(u.squadre), turnoDi: u.turnoDi, giro: Math.max(1, Number(u.giro) || 1), brano,
            aiuti: pulisciAiuti(u.aiuti), cambiato: !!u.cambiato,
            usati: pulisciUsati(u.usati),
            svelaMotivo: haChiave(MOTIVI, u.svelaMotivo) ? u.svelaMotivo : 'indovinato'
        };
    }

    function disegnaRiquadro() {
        const g = SALVATAGGIO.leggi();
        const box = $('resume-box');
        if (!g) { RG.partita.riquadro(box, null); return; }
        const di = g.squadre[g.turnoDi];
        RG.partita.riquadro(box, {
            riassunto: g.squadre.map(s => `${s.nome} ${s.punti}`).join(' – '),
            dettaglio: `Turno ${g.giro} · tocca a ${di ? di.nome : ''} · salvata ${RG.partita.quando(g.savedAt)}`,
            alRiprendi: riprendi,
            alloScarto: () => RG.conferma({ titolo: 'Scartare la partita?', testo: 'I punteggi della partita salvata andranno persi.', ok: 'Scarta', pericolo: true })
                .then(si => { if (si) { SALVATAGGIO.cancella(); disegnaRiquadro(); } })
        });
    }

    function riprendi() {
        if (inPreparazione) return; // una partita nuova si sta preparando: non si sovrascrivono a vicenda
        const g = SALVATAGGIO.leggi();
        if (!g) { disegnaRiquadro(); return; }
        const squadre = pulisciSquadre(g.squadre);
        Object.assign(stato, {
            squadre,
            turnoDi: g.turnoDi,
            giro: Math.max(1, Number(g.giro) || 1),
            traguardo: numero(g.traguardo, [10, 15, 20], 15),
            secondi: numero(g.secondi, [30, 45, 60], 45),
            categoria: haChiave(CATEGORIE, g.categoria) ? g.categoria : 'tutto',
            brano: pulisciBrano(g.brano),
            cambiato: !!g.cambiato,
            aiuti: pulisciAiuti(g.aiuti),
            esito: pulisciEsito(g.esito, squadre.length),
            svelaMotivo: haChiave(MOTIVI, g.svelaMotivo) ? g.svelaMotivo : null,
            annulla: pulisciAnnulla(g.annulla),
            usati: pulisciUsati(g.usati),
            avviata: true,
            finita: false
        });
        stato.rimasti = Math.min(stato.secondi, Math.max(0, Math.round(Number(g.rimasti) || 0)));
        catalogoLive = [];
        pescatiNelTurno = [];
        const questa = ++partitaN;
        preparaMazzo();
        riportaNelModulo();
        mostraGioco();
        RG.toast(`Partita ripresa: tocca a ${squadraDiTurno().nome}`, 'successo');

        const fase = ['consegna', 'segreto', 'canta', 'svela'].includes(g.fase) && stato.brano ? g.fase : null;
        if (!fase) inizioTurno();
        else if (fase === 'consegna') mostraConsegna();
        else if (fase === 'segreto') mostraSegreto();
        else if (fase === 'canta' && stato.rimasti > 0) mostraCanta(false); // il tempo resta fermo: "Riprendi il tempo"
        else { vaiSvela(stato.svelaMotivo || 'tempo'); }

        // Il catalogo online si riscarica in sottofondo e si aggiunge al mazzo
        scaricaCatalogo(stato.categoria).then(live => {
            if (!live || !stato.avviata || questa !== partitaN) return;
            catalogoLive = live;
            preparaMazzo();
        });
    }

    /* ================= PREPARAZIONE E AVVIO ================= */
    let squadreScelte = 2;

    function scegliNumero(n) {
        squadreScelte = n;
        document.querySelectorAll('.count-btn').forEach(b => {
            const si = Number(b.dataset.count) === n;
            b.classList.toggle('is-active', si);
            b.setAttribute('aria-pressed', si ? 'true' : 'false');
        });
        const box = $('nomi-squadre');
        const scritti = [...box.querySelectorAll('input')].map(i => i.value);
        const condivisi = RG.squadre.nomi(4, NOMI_PREDEFINITI);
        box.innerHTML = '';
        for (let i = 0; i < n; i++) {
            const input = document.createElement('input');
            input.type = 'text';
            input.maxLength = 18;
            input.className = 'input nome-squadra';
            input.value = scritti[i] ?? condivisi[i];
            input.placeholder = NOMI_PREDEFINITI[i];
            input.setAttribute('aria-label', `Nome della squadra ${i + 1}`);
            box.appendChild(input);
        }
    }

    document.querySelectorAll('.count-btn').forEach(b => b.addEventListener('click', () => scegliNumero(Number(b.dataset.count))));

    // Le impostazioni della partita ripresa tornano nel modulo: "Gioca ancora" ripete la stessa partita
    function riportaNelModulo() {
        scegliNumero(stato.squadre.length);
        document.querySelectorAll('.nome-squadra').forEach((i, n) => { i.value = stato.squadre[n].nome; });
        $('scelta-brani').value = stato.categoria;
        $('scelta-traguardo').value = String(stato.traguardo);
        $('scelta-tempo').value = String(stato.secondi);
    }

    function mostraGioco() {
        $('preparazione').classList.add('hidden');
        $('gioco').classList.remove('hidden');
    }

    function tornaAllaPreparazione() {
        if (timer) timer.pausa();
        fermaAudio();
        stato.avviata = false;
        $('vittoria').classList.add('hidden');
        $('gioco').classList.add('hidden');
        $('preparazione').classList.remove('hidden');
        disegnaRiquadro();
        window.scrollTo({ top: 0 });
    }

    // Mentre si prepara il mazzo, avvio, Riprendi e Scarta restano bloccati
    let inPreparazione = false;
    function bloccaAvvio(si) {
        inPreparazione = si;
        ['inizia', 'ancora'].forEach(id => { $(id).disabled = si; });
        document.querySelectorAll('#resume-box button').forEach(b => { b.disabled = si; });
    }

    async function nuovaPartita(pulsante) {
        if (inPreparazione) return;
        bloccaAvvio(true);
        const etichetta = pulsante.textContent;
        pulsante.textContent = 'Preparo i brani…';
        try {
            // Le impostazioni si leggono dal modulo di preparazione (anche per "Gioca ancora":
            // dopo una ripresa il modulo riporta quelle della partita ripresa)
            const nomi = [...document.querySelectorAll('.nome-squadra')].map((i, n) => i.value.trim() || NOMI_PREDEFINITI[n]);
            const categoria = $('scelta-brani').value;
            const questa = ++partitaN;
            const live = await scaricaCatalogo(categoria);
            if (questa !== partitaN) return;
            if (timer) timer.ferma();
            fermaAudio();
            Object.assign(stato, {
                squadre: nomi.map(nome => ({ nome, punti: 0 })),
                turnoDi: 0, giro: 1,
                traguardo: Number($('scelta-traguardo').value),
                secondi: Number($('scelta-tempo').value),
                categoria, fase: null, brano: null, esito: null, annulla: null, usati: [],
                avviata: true, finita: false
            });
            pescatiNelTurno = [];
            RG.squadre.salva(nomi, NOMI_PREDEFINITI);
            catalogoLive = live || [];
            preparaMazzo();
            if (live) RG.toast(`Mazzo pronto: ${mazzo.length} brani.`, 'successo');
            else RG.toast('Senza connessione: si gioca con i brani inclusi, senza ascolto.', 'avviso', 4500);
            $('vittoria').classList.add('hidden');
            mostraGioco();
            inizioTurno();
        } finally {
            bloccaAvvio(false);
            pulsante.textContent = etichetta;
        }
    }

    $('inizia').addEventListener('click', (e) => nuovaPartita(e.currentTarget));

    // "← Menu": la partita resta salvata (il tempo si ferma) e si riprende dalla preparazione
    $('esci').addEventListener('click', () => {
        if (timer) timer.pausa();
        salva();
        tornaAllaPreparazione();
        RG.toast('Partita salvata: tocca Riprendi per continuare.', 'info');
    });

    // Se il telefono chiude la pagina si salva l'ultimo stato
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') salva(); });

    // Avvio: i nomi di "Chi gioca stasera" decidono quante squadre proporre
    const pieni = RG.squadre.tutti().slice(0, 4).filter(Boolean).length;
    scegliNumero(Math.min(4, Math.max(2, pieni)));
    disegnaRiquadro();
    if (SALVATAGGIO.leggi() && RG.partita.ricaricata()) riprendi();

    // Per le prove automatiche
    window.RITORNELLO = { stato, mazzo: () => mazzo, timer: () => timer, SALVATAGGIO, inclusi: c => RISERVA.filter(CATEGORIE[c]).length };
})();
