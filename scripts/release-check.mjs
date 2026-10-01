import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const failures = [];
const required = [
  'index.html','package.json','firebase.json','firestore.rules','firestore.indexes.json',
  '.firebaserc','manifest.json','sw.js','src/main.js','src/services/firebase.js','scripts/release-check.mjs',
  'src/services/firebase-config.js','src/app/store.js'
];

for (const file of required) if (!fs.existsSync(file)) failures.push(`Ficheiro obrigatório em falta: ${file}`);

const forbiddenNames = /(?:^|\/)(?:README_V\d|FIREBASE_.*V\d|docs(?:\/|$)|dist(?:\/|$)|node_modules(?:\/|$))/i;
function walk(dir) {
  const out=[];
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const p=path.join(dir,name);
    const st=fs.statSync(p);
    if (st.isDirectory()) out.push(...walk(p)); else out.push(p);
  }
  return out;
}
const files = walk('.').filter(f => !f.startsWith('./.git/') && !f.startsWith('./node_modules/'));
for (const file of files) if (forbiddenNames.test(file)) failures.push(`Artefacto antigo/de publicação encontrado: ${file}`);

const sourceFiles = files.filter(f => /\.(js|html|css)$/.test(f));
for (const file of sourceFiles) {
  const text=fs.readFileSync(file,'utf8');
  if (/console\.(log|warn|error|info|debug|trace)\s*\(/.test(text)) failures.push(`Console de produção encontrado: ${file}`);
  if (/\bV(?:[2-9]\d|1\d{2,})(?:\.\d+)*\b/i.test(text)) failures.push(`Referência histórica de versão encontrada: ${file}`);
}

const index=fs.readFileSync('index.html','utf8');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
const sw=fs.readFileSync('sw.js','utf8');
if (pkg.name !== 'aviario-inteligente-pro' || pkg.version !== '1.0.0') failures.push('package.json não está na versão de publicação 1.0.0.');
if (!/Aviário Inteligente Pro/.test(index)) failures.push('Nome público do produto não encontrado no index.html.');
if (!/src="\.\/src\/main\.js\?v=2"/.test(index)) failures.push('Cache-bust principal inválido.');
if (!sw.includes('aviario-pro-1.0.0')) failures.push('Cache do service worker não está em 1.0.0.');
if (!fs.existsSync('.github/workflows/github-pages.yml')) failures.push('Workflow de publicação do GitHub Pages não encontrado.');

const auth=fs.readFileSync('src/app/methods_auth.js','utf8');
if (!/createUserWithEmailAndPassword\(authEmail, cloudSecret\)/.test(auth)) failures.push('Cadastro inicial não usa o e-mail real no Authentication.');
if (!/signInWithEmailAndPassword\(authIdentifier, cloudSecret\)/.test(auth)) failures.push('Login não usa o e-mail real no Authentication.');
if (!/batch\.set\(profileRef/.test(auth) || !/batch\.set\(farmRef/.test(auth)) failures.push('Cadastro inicial não grava perfil e exploração no mesmo batch.');
if (/lastGeneratedAccess\s*=\s*\{[^}]*accessCode/.test(auth)) failures.push('Credencial secundária fictícia encontrada no cadastro inicial.');

for (const file of ['src/app/methods_auth.js','src/app/methods_misc.js','src/app/methods_ops_exports.js','src/services/exports.js','src/services/firebase.js']) {
  const r=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
  if (r.status!==0) failures.push(`JavaScript inválido: ${file}`);
}

if (failures.length) {
  process.stderr.write('Falha na validação de publicação:\n' + failures.map(x => `- ${x}`).join('\n') + '\n');
  process.exit(1);
}
process.exit(0);
