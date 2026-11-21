// Risposte finte di iTunes per Ritornello: catalogo, ricerca dell'anteprima dei brani inclusi, audio e copertine
const fs = require('fs');
function creaWav(secondi = 3, freq = 523, campioni = 8000) {
  const n = secondi * campioni, buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(campioni, 24);
  buf.writeUInt32LE(campioni * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(3000 * Math.sin(2 * Math.PI * freq * i / campioni)), 44 + i * 2);
  return buf;
}
const WAV = creaWav();
const COVER = fs.readFileSync(__dirname + '/risorse/copertina.jpg');
const CORS = { 'access-control-allow-origin': '*' };
// i brani inclusi del gioco, per rispondere alle ricerche delle loro anteprime
const RISERVA = require('vm').runInNewContext(fs.readFileSync(__dirname + '/../giochi/ritornello/dati/brani.js', 'utf8') + ';window.RITORNELLO_BRANI', { window: {} });
const stato = { rete: true, richieste: { catalogo: 0, anteprima: 0, audio: 0 }, termini: [] };
const brano = (id, titolo, artista, anno, extra = {}) => ({ wrapperType: 'track', kind: 'song', trackId: id, trackName: titolo, artistName: artista,
  collectionName: titolo, releaseDate: `${anno}-05-01T07:00:00Z`, previewUrl: `https://audio-ssl.itunes.apple.com/finto/${id}.m4a`,
  artworkUrl100: `https://is1-ssl.mzstatic.com/finto/${id}/100x100bb.jpg`, ...extra });
const CATALOGO = [];
// i brani pari sono di genere hip-hop/rap, i dispari pop (la categoria rap prende solo i primi)
for (let i = 0; i < 40; i++) CATALOGO.push(brano(5000 + i, `Brano Online ${i + 1}`, `Artista ${i % 7}`, 1970 + Math.round(i * 56 / 39), { primaryGenreName: i % 2 ? 'Hip-Hop/Rap' : 'Pop' }));
// da scartare: versione live, compilation, karaoke, anteprima non https; e una ristampa (anno vero 1975)
CATALOGO.push(brano(6001, 'Canzone (Live)', 'Gruppo', 1990), brano(6002, 'Altra canzone', 'Gruppo', 1990, { collectionName: 'Greatest Hits' }),
  brano(6003, 'Karaoke', 'Karaoke Band', 2000), brano(6004, 'Senza https', 'Gruppo', 2000, { previewUrl: 'javascript:alert(1)' }),
  brano(6005, 'Ristampa', 'Gruppo Vecchio', 2015), brano(6006, 'Ristampa', 'Gruppo Vecchio', 1975, { collectionName: 'Raccolta' }),
  brano(6007, '<img src=x onerror=alert(1)>', 'Hacker', 2001));
// lo stesso brano incluso "Pensare male" (The Kolors ed Elodie), scritto come su iTunes
CATALOGO.push(brano(6100, 'Pensare male', 'The Kolors & Elodie', 2021));
// un brano rap incluso che iTunes classifica come pop: non deve entrare nelle italiane moderne
CATALOGO.push(brano(6102, 'Sesso e samba', 'Tony Effe & Gaia', new Date().getFullYear() - 2, { primaryGenreName: 'Pop' }));
// "Lamborghini" scritto come su iTunes dal 2021 ("Guè"); il brano incluso ha "Guè e Sfera Ebbasta"
CATALOGO.push(brano(6101, 'Lamborghini', 'Guè Pequeno', 2017, { primaryGenreName: 'Hip-Hop/Rap' }));
function jsonp(route, data) {
  const cb = new URL(route.request().url()).searchParams.get('callback');
  return route.fulfill({ status: 200, contentType: 'text/javascript', body: `${cb}(${JSON.stringify(data)});` });
}
module.exports = { stato, CATALOGO, async finti(context) {
  await context.route(/itunes\.apple\.com\/search/, route => {
    if (!stato.rete) return route.abort();
    const u = new URL(route.request().url());
    if (u.searchParams.get('limit') === '10') { // anteprima di un brano incluso: si risponde con lo stesso titolo
      stato.richieste.anteprima++;
      const term = u.searchParams.get('term') || '';
      const r = RISERVA.find(([t, a]) => term === `${t} ${a.replace(/\(.*?\)/g, '')}`);
      return jsonp(route, { results: r ? [brano(7000 + RISERVA.indexOf(r), r[0], r[1], r[2])] : [] });
    }
    stato.richieste.catalogo++;
    stato.termini.push(u.searchParams.get('term') || '');
    // ricerca per artista "gaia": iTunes trova anche un artista straniero dal nome simile
    if (u.searchParams.get('term') === 'gaia') {
      const anno = new Date().getFullYear() - 1;
      return jsonp(route, { results: [brano(6200, 'Canzone di Gaia', 'Gaia', anno), brano(6201, 'Canzone in coppia', 'Marco Mengoni & Gaia', anno), brano(6202, 'Noise Song', 'Gaia Noise', anno)] });
    }
    return jsonp(route, { resultCount: CATALOGO.length, results: CATALOGO });
  });
  await context.route(/audio-ssl\.itunes\.apple\.com/, route => {
    if (!stato.rete) return route.abort();
    stato.richieste.audio++;
    return route.fulfill({ status: 200, contentType: 'audio/wav', headers: CORS, body: WAV });
  });
  await context.route(/mzstatic\.com/, route => stato.rete ? route.fulfill({ status: 200, contentType: 'image/jpeg', headers: CORS, body: COVER }) : route.abort());
} };
