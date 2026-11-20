/*
 * Controlla che chi cambia i file del sito alzi anche VERSIONE in sw.js.
 * Senza, i telefoni con l'app installata continuano a usare i file vecchi.
 *
 *   node prove/controlla-versione.js origin/main
 *
 * Confronta il ramo attuale con quello indicato (di solito il ramo di destinazione della pull request).
 * Non contano: prove/, .github/, file .md, .gitignore e la sorgente di Tailwind.
 */
const { execSync } = require('child_process');
const base = process.argv[2] || 'origin/main';
const git = (cmd) => execSync(`git ${cmd}`, { encoding: 'utf8' }).trim();
const versione = (testo) => (testo.match(/const VERSIONE = '([^']+)';/) || [])[1];

const cambiati = git(`diff --name-only ${base}...HEAD`).split('\n').filter(Boolean);
const delSito = cambiati.filter(f => !/^(prove|\.github)\/|\.md$|^\.gitignore$|tailwind-sorgente\.css$/.test(f));

if (!delSito.length) {
  console.log('✓ Nessun file del sito cambiato: la versione può restare com\'è.');
  process.exit(0);
}
let prima = null;
try { prima = versione(git(`show ${base}:sw.js`)); } catch (e) { /* sw.js non c'era */ }
const dopo = versione(require('fs').readFileSync('sw.js', 'utf8'));
if (prima && prima === dopo) {
  console.log(`✗ Sono cambiati ${delSito.length} file del sito (${delSito.slice(0, 5).join(', ')}${delSito.length > 5 ? '…' : ''})`);
  console.log(`  ma VERSIONE in sw.js è ancora '${dopo}'. Alzala (es. '${Number(dopo) + 1 || dopo + '-1'}'), altrimenti i telefoni non si aggiornano.`);
  process.exit(1);
}
// Con numeri interi la versione deve crescere: tornare a un numero già usato non aggiorna i telefoni
if (/^\d+$/.test(prima || '') && /^\d+$/.test(dopo || '') && Number(dopo) <= Number(prima)) {
  console.log(`✗ VERSIONE in sw.js è '${dopo}', ma su ${base} è già '${prima}': deve essere più alta (es. '${Number(prima) + 1}').`);
  process.exit(1);
}
console.log(`✓ VERSIONE alzata: '${prima}' → '${dopo}' (${delSito.length} file del sito cambiati).`);
