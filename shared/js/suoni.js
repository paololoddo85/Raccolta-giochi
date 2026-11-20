/*
 * SUONI SINTETIZZATI (Web Audio) CON TASTO MUTO
 * Nessun file audio: ogni suono è generato al momento, quindi funziona offline.
 * La scelta "muto" è condivisa da tutti i giochi (rg-comune-impostazioni).
 *
 *   RG.suoni.bip(frequenza, durata)   RG.suoni.buzzer()   RG.suoni.fanfara()   RG.suoni.peto()
 *   RG.suoni.effetto('click' | 'successo' | 'errore' | 'moneta')
 *   RG.suoni.muto  RG.suoni.imposta(muto)  RG.suoni.alterna()
 *   RG.suoni.collega(pulsante)   il pulsante prende la classe "is-muto" quando è muto
 *   RG.suoni.alCambio(funzione)  avvisa quando cambia il muto
 */
(function (RG) {
    'use strict';

    const IMPOSTAZIONI = 'impostazioni';
    let ctx = null;
    let muto = !!RG.archivio.comune.leggi(IMPOSTAZIONI, {}).muto;
    const ascoltatori = [];

    // Restituisce il contesto audio, o null se i suoni sono spenti o non disponibili
    function contesto() {
        if (muto) return null;
        try {
            if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
            if (ctx.state === 'suspended') ctx.resume();
            return ctx;
        } catch (e) {
            return null;
        }
    }

    function imposta(valore) {
        muto = !!valore;
        const impostazioni = RG.archivio.comune.leggi(IMPOSTAZIONI, {});
        RG.archivio.comune.scrivi(IMPOSTAZIONI, { ...impostazioni, muto });
        ascoltatori.forEach(f => { try { f(muto); } catch (e) {} });
        return muto;
    }

    function alterna() {
        return imposta(!muto);
    }

    function alCambio(funzione) {
        ascoltatori.push(funzione);
    }

    function collega(pulsante) {
        if (!pulsante) return;
        const aggiorna = () => {
            pulsante.classList.toggle('is-muto', muto);
            pulsante.setAttribute('aria-pressed', muto ? 'true' : 'false');
            pulsante.setAttribute('aria-label', muto ? 'Suoni spenti: tocca per accenderli' : 'Suoni accesi: tocca per spegnerli');
        };
        aggiorna();
        alCambio(aggiorna);
    }

    // Se un'altra pagina della raccolta cambia il muto, ci si adegua
    window.addEventListener('storage', (e) => {
        if (e.key === RG.archivio.comune.chiave(IMPOSTAZIONI)) {
            const nuovo = !!RG.archivio.comune.leggi(IMPOSTAZIONI, {}).muto;
            if (nuovo !== muto) {
                muto = nuovo;
                ascoltatori.forEach(f => { try { f(muto); } catch (err) {} });
            }
        }
    });

    function bip(frequenza, durata) {
        const a = contesto();
        if (!a) return;
        try {
            const osc = a.createOscillator();
            const gain = a.createGain();
            osc.frequency.setValueAtTime(frequenza, a.currentTime);
            gain.gain.setValueAtTime(0.1, a.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, a.currentTime + durata);
            osc.connect(gain);
            gain.connect(a.destination);
            osc.start();
            osc.stop(a.currentTime + durata);
        } catch (e) {}
    }

    function buzzer() {
        const a = contesto();
        if (!a) return;
        try {
            const osc = a.createOscillator();
            const gain = a.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(140, a.currentTime);
            osc.frequency.linearRampToValueAtTime(90, a.currentTime + 0.35);
            gain.gain.setValueAtTime(0.18, a.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, a.currentTime + 0.38);
            osc.connect(gain);
            gain.connect(a.destination);
            osc.start();
            osc.stop(a.currentTime + 0.38);
        } catch (e) {}
    }

    function fanfara() {
        const a = contesto();
        if (!a) return;
        try {
            const ora = a.currentTime;
            [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
                const osc = a.createOscillator();
                const gain = a.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(f, ora + i * 0.14);
                gain.gain.setValueAtTime(0.35, ora + i * 0.14);
                gain.gain.exponentialRampToValueAtTime(0.001, ora + i * 0.14 + 0.45);
                osc.connect(gain);
                gain.connect(a.destination);
                osc.start(ora + i * 0.14);
                osc.stop(ora + i * 0.14 + 0.45);
            });
        } catch (e) {}
    }

    // Suono di peto sintetizzato (fine timer di Cinquina).
    // Una serie di "sbattimenti" irregolari a bassa frequenza (60-120 al secondo):
    // ogni sbattimento è un piccolo impulso smorzato, con ritmo e intensità che
    // variano a caso, un po' di rumore "umido" e uno scoppiettio finale.
    function campioniPeto(frequenzaCampioni, rnd) {
        const durata = 1.25 + rnd() * 0.5;
        const n = Math.floor(frequenzaCampioni * durata);
        const dati = new Float32Array(n);

        const calo = 0.35 + rnd() * 0.15;
        const inviluppo = (x) => {
            let e = Math.min(1, x / 0.03);
            e *= 1 - 0.55 * Math.exp(-Math.pow((x - calo) / 0.035, 2));
            if (x > 0.7) e *= Math.pow(1 - (x - 0.7) / 0.3, 1.4);
            return Math.max(0, e);
        };

        const base = 78 + rnd() * 30;
        const formante = 260 + rnd() * 140;
        let t = 0;
        while (t < durata) {
            const x = t / durata;
            let f = base * (1 - 0.4 * x) + 9 * Math.sin(2 * Math.PI * 3.2 * t);
            f *= 0.92 + rnd() * 0.16;
            let amp = inviluppo(x) * (0.65 + rnd() * 0.35);
            if (x > 0.72 && rnd() < 0.35) amp = 0;

            const i0 = Math.floor(t * frequenzaCampioni);
            const len = Math.floor(frequenzaCampioni * 0.012);
            const smorzamento = frequenzaCampioni * (0.0025 + rnd() * 0.002);
            const fr = formante * (0.85 + rnd() * 0.3);
            for (let k = 0; k < len && i0 + k < n; k++) {
                dati[i0 + k] += amp * Math.exp(-k / smorzamento) * Math.sin(2 * Math.PI * fr * k / frequenzaCampioni);
            }
            t += 1 / Math.max(25, f);
        }

        let marrone = 0;
        for (let i = 0; i < n; i++) {
            marrone = (marrone + (rnd() * 2 - 1) * 0.02) * 0.995;
            dati[i] += marrone * 0.9 * inviluppo(i / n);
        }

        let picco = 0;
        for (let i = 0; i < n; i++) picco = Math.max(picco, Math.abs(dati[i]));
        if (picco > 0) for (let i = 0; i < n; i++) dati[i] = dati[i] / picco * 0.95;
        return dati;
    }

    function peto() {
        const a = contesto();
        if (!a) return;
        try {
            const campioni = campioniPeto(a.sampleRate, Math.random);
            const buffer = a.createBuffer(1, campioni.length, a.sampleRate);
            buffer.getChannelData(0).set(campioni);
            const sorgente = a.createBufferSource();
            sorgente.buffer = buffer;
            const filtro = a.createBiquadFilter();
            filtro.type = 'lowpass';
            filtro.frequency.value = 1100;
            filtro.Q.value = 0.9;
            const gain = a.createGain();
            gain.gain.value = 0.95;
            sorgente.connect(filtro);
            filtro.connect(gain);
            gain.connect(a.destination);
            sorgente.start();
        } catch (e) {}
    }

    // Effetti brevi (usati da Giradischi)
    function effetto(tipo) {
        const a = contesto();
        if (!a) return;
        try {
            const osc = a.createOscillator();
            const gain = a.createGain();
            osc.connect(gain);
            gain.connect(a.destination);
            const ora = a.currentTime;
            if (tipo === 'click') {
                osc.type = 'sine';
                osc.frequency.setValueAtTime(520, ora);
                osc.frequency.exponentialRampToValueAtTime(780, ora + 0.08);
                gain.gain.setValueAtTime(0.12, ora);
                gain.gain.exponentialRampToValueAtTime(0.001, ora + 0.08);
                osc.start(ora);
                osc.stop(ora + 0.08);
            } else if (tipo === 'successo') {
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(440, ora);
                osc.frequency.setValueAtTime(554.37, ora + 0.1);
                osc.frequency.setValueAtTime(659.25, ora + 0.2);
                gain.gain.setValueAtTime(0.18, ora);
                gain.gain.exponentialRampToValueAtTime(0.001, ora + 0.45);
                osc.start(ora);
                osc.stop(ora + 0.45);
            } else if (tipo === 'errore') {
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(220, ora);
                osc.frequency.linearRampToValueAtTime(140, ora + 0.35);
                gain.gain.setValueAtTime(0.15, ora);
                gain.gain.exponentialRampToValueAtTime(0.001, ora + 0.35);
                osc.start(ora);
                osc.stop(ora + 0.35);
            } else if (tipo === 'moneta') {
                osc.type = 'sine';
                osc.frequency.setValueAtTime(987.77, ora);
                osc.frequency.setValueAtTime(1318.51, ora + 0.08);
                gain.gain.setValueAtTime(0.15, ora);
                gain.gain.exponentialRampToValueAtTime(0.001, ora + 0.3);
                osc.start(ora);
                osc.stop(ora + 0.3);
            }
        } catch (e) {}
    }

    RG.suoni = {
        get muto() { return muto; },
        contesto, imposta, alterna, alCambio, collega,
        bip, buzzer, fanfara, peto, effetto
    };
})(window.RG = window.RG || {});
