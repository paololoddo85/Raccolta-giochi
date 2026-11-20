// Risposte finte dei servizi online usati da CineStar
const fs = require('fs');
const POSTER = fs.readFileSync(__dirname + '/risorse/locandina.jpg');
const CORS = { 'access-control-allow-origin': '*' };
const conteggio = { itunes: 0, wikidata: 0, poster: 0, wikipedia: 0 };
const LIVE = {
  wrapperType: 'track', kind: 'feature-movie', trackId: 4242, trackName: 'Tenet', artistName: 'Christopher Nolan',
  releaseDate: '2020-08-26T07:00:00Z', primaryGenreName: 'Fantascienza', artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/finto/100x100bb.jpg',
  longDescription: 'Un ladro che ruba segreti dai sogni deve impiantare un\'idea nella mente di un erede.'
};
function jsonp(route, data) {
  const cb = new URL(route.request().url()).searchParams.get('callback');
  return route.fulfill({ status: 200, contentType: 'text/javascript', body: `${cb}(${JSON.stringify(data)});` });
}
module.exports = { conteggio, async finti(context) {
  await context.route(/itunes\.apple\.com\/(search|lookup)/, route => {
    conteggio.itunes++;
    const u = new URL(route.request().url());
    const term = (u.searchParams.get('term') || '').toLowerCase();
    // il catalogo live trova "Inception" cercando un regista; le ricerche di locandine per titolo non trovano nulla (si passa a Wikipedia)
    const results = [LIVE];
    return jsonp(route, { resultCount: results.length, results });
  });
  await context.route(/wikidata\.org\/w\/api\.php/, route => {
    conteggio.wikidata++;
    const u = new URL(route.request().url());
    const a = u.searchParams.get('action');
    let body = {};
    if (a === 'wbsearchentities') body = { search: /tenet/i.test(u.searchParams.get('search')) ? [{ id: 'Q25188' }] : [] };
    else if (a === 'wbgetentities' && u.searchParams.get('ids').includes('Q25188')) body = { entities: { Q25188: {
      labels: { it: { value: 'Tenet' }, en: { value: 'Tenet' } }, descriptions: { en: { value: '2020 film by Christopher Nolan' } },
      sitelinks: { itwiki: { title: 'Tenet' } },
      claims: { P577: [{ mainsnak: { datavalue: { value: { time: '+2020-08-26T00:00:00Z' } } } }], P31: [{ mainsnak: { datavalue: { value: { id: 'Q11424' } } } }],
        P57: [{ mainsnak: { datavalue: { value: { id: 'Q25191' } } } }], P161: [{ mainsnak: { datavalue: { value: { id: 'Q38111' } } } }] } } } };
    else if (a === 'wbgetentities') body = { entities: { Q25191: { labels: { it: { value: 'Christopher Nolan' } } }, Q38111: { labels: { it: { value: 'Leonardo DiCaprio' } } } } };
    return route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(body) });
  });
  await context.route(/wikipedia\.org/, route => {
    conteggio.wikipedia++;
    const u = route.request().url();
    // ricerca della locandina: risponde con un'immagine principale per qualsiasi film
    return route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify({
      title: 'Film', description: 'film', extract: 'È un film diretto da qualcuno.', originalimage: { source: 'https://upload.wikimedia.org/finto/poster.jpg', width: 600, height: 900 },
      query: { pages: { 1: { title: 'Film', pageprops: {}, original: { source: 'https://upload.wikimedia.org/finto/poster.jpg', width: 600, height: 900 }, extract: 'film' } } } }) });
  });
  await context.route(/mzstatic\.com|upload\.wikimedia\.org/, route => {
    conteggio.poster++;
    return route.fulfill({ status: 200, contentType: 'image/jpeg', headers: CORS, body: POSTER });
  });
} };
