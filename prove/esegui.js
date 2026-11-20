/*
 * Lancia tutte le prove di Combriccola (o solo quelle indicate) e stampa il riepilogo.
 *   node prove/esegui.js                 tutte
 *   node prove/esegui.js cinquina pwa    solo alcune
 * Serve un ambiente con Node, Playwright e Chromium (per esempio l'ambiente cloud di Claude Code).
 */
const { spawn } = require('child_process');
const path = require('path');
const { avviaServer, BASE } = require('./comune');

const TUTTE = ['menu', 'cinquina', 'cinestar offline', 'cinestar online', 'giradischi', 'giradischi-offline', 'larghezze', 'pwa'];

function lancia(voce) {
  const [file, ...argomenti] = voce.split(' ');
  return new Promise((risolvi) => {
    const p = spawn(process.execPath, [path.join(__dirname, file + '.js'), ...argomenti], { cwd: path.resolve(__dirname, '..') });
    let uscita = '';
    p.stdout.on('data', d => { uscita += d; process.stdout.write(d); });
    p.stderr.on('data', d => { uscita += d; process.stderr.write(d); });
    const tempo = setTimeout(() => p.kill(), 10 * 60 * 1000);
    p.on('close', (codice) => {
      clearTimeout(tempo);
      const passate = (uscita.match(/^✓/gm) || []).length;
      const fallite = (uscita.match(/^✗|FALLITO/gm) || []).length;
      risolvi({ voce, passate, ok: codice === 0 && fallite === 0 });
    });
  });
}

(async () => {
  const scelte = process.argv.slice(2);
  const elenco = scelte.length ? TUTTE.filter(v => scelte.some(s => v.startsWith(s))) : TUTTE;
  const server = await avviaServer();
  console.log(`Sito servito su ${BASE}\n`);
  const risultati = [];
  for (const voce of elenco) {
    console.log(`\n=== ${voce} ===`);
    risultati.push(await lancia(voce));
  }
  server.close();
  console.log('\n=== RIEPILOGO ===');
  risultati.forEach(r => console.log(`${r.ok ? '✓' : '✗'} ${r.voce}: ${r.passate} controlli`));
  const totale = risultati.reduce((n, r) => n + r.passate, 0);
  const tuttoOk = risultati.every(r => r.ok);
  console.log(tuttoOk ? `\nTutto a posto: ${totale} controlli.` : '\nCi sono prove fallite: guarda i dettagli sopra e gli screenshot in prove/screenshot/.');
  process.exit(tuttoOk ? 0 : 1);
})();
