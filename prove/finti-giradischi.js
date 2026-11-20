// Risposte finte dei servizi online usati da Giradischi (iTunes, MusicBrainz, anteprime, copertine)
const fs = require('fs');
// 3 secondi di La (440 Hz) in formato WAV, generati qui: niente file audio nel repository
function creaWav(secondi = 3, freq = 440, campioni = 8000) {
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
const stato = { rete: true, richieste: { itunes: 0, musicbrainz: 0, audio: 0 } };
const ARTISTI = ['Queen', 'Madonna', 'Vasco Rossi', 'Mina', 'Dua Lipa', 'Nirvana', 'Abba', 'Lucio Battisti', 'Adele', 'Prince'];
const BRANI = [];
for (let i = 0; i < 80; i++) {
  const y = 1960 + (i * 7) % 65;
  BRANI.push({ wrapperType: 'track', kind: 'song', trackId: 1000 + i, trackName: `Canzone ${i + 1}`, artistName: ARTISTI[i % ARTISTI.length],
    collectionName: `Canzone ${i + 1}`, releaseDate: `${y}-05-01T07:00:00Z`, primaryGenreName: i % 2 ? 'Pop' : 'Rock',
    previewUrl: `https://audio-ssl.itunes.apple.com/finto/${1000 + i}.m4a`, artworkUrl100: `https://is1-ssl.mzstatic.com/finto/${1000 + i}/100x100bb.jpg` });
}
// una ristampa: "Canzone Ristampata" del 2015 di cui esiste una versione del 1975 → va scartata
BRANI.push({ ...BRANI[0], trackId: 999, trackName: 'Canzone Ristampata', collectionName: 'Canzone Ristampata', releaseDate: '2015-01-01T07:00:00Z' });
function jsonp(route, data) {
  const cb = new URL(route.request().url()).searchParams.get('callback');
  return route.fulfill({ status: 200, contentType: 'text/javascript', body: `${cb}(${JSON.stringify(data)});` });
}
module.exports = { stato, BRANI, async finti(context) {
  await context.route(/itunes\.apple\.com\/search/, route => {
    if (!stato.rete) return route.abort();
    stato.richieste.itunes++;
    const u = new URL(route.request().url());
    const term = u.searchParams.get('term') || '';
    if (u.searchParams.get('limit') === '50') { // controllo "versioni precedenti" dello stesso brano
      const t = BRANI.find(b => term.startsWith(b.trackName + ' '));
      const res = t ? [t] : [];
      if (t && t.trackName === 'Canzone Ristampata') res.push({ ...t, releaseDate: '1975-01-01T07:00:00Z', collectionName: 'Greatest Hits' });
      return jsonp(route, { resultCount: res.length, results: res });
    }
    // ricerca del catalogo: 25 brani a caso
    const res = [...BRANI].sort(() => Math.random() - 0.5).slice(0, 25);
    return jsonp(route, { resultCount: res.length, results: res });
  });
  await context.route(/musicbrainz\.org/, route => {
    if (!stato.rete) return route.abort();
    stato.richieste.musicbrainz++;
    return route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify({ recordings: [] }) });
  });
  await context.route(/audio-ssl\.itunes\.apple\.com/, route => {
    if (!stato.rete) return route.abort();
    stato.richieste.audio++;
    return route.fulfill({ status: 200, contentType: 'audio/wav', headers: CORS, body: WAV });
  });
  await context.route(/mzstatic\.com/, route => stato.rete ? route.fulfill({ status: 200, contentType: 'image/jpeg', headers: CORS, body: COVER }) : route.abort());
} };
