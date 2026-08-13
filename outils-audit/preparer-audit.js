/* Prépare des copies des trois pages avec une sonde de mesure injectée.
   Ne lance rien : Chrome est appelé séparément, un appel par page. */
const fs = require('fs'), path = require('path');
const SRC = 'C:/Projet/jdr créateur de carte/plateforme';
const TMP = process.env.CLAUDE_JOB_DIR + '/tmp/audit';

fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP + '/css', { recursive: true });
fs.mkdirSync(TMP + '/js', { recursive: true });
for (const f of fs.readdirSync(SRC + '/css')) fs.copyFileSync(SRC + '/css/' + f, TMP + '/css/' + f);
for (const f of fs.readdirSync(SRC + '/js')) fs.copyFileSync(SRC + '/js/' + f, TMP + '/js/' + f);
for (const f of ['index.html', 'editeur.html', 'table.html', 'manifest.webmanifest'])
  fs.copyFileSync(SRC + '/' + f, TMP + '/' + f);

const SONDE = fs.readFileSync(__dirname + '/sonde-mobile.html', 'utf8');
for (const page of ['index.html', 'editeur.html', 'table.html']) {
  const f = TMP + '/' + page;
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('</body>', SONDE + '</body>'));
}
console.log('pages preparees dans ' + TMP);
