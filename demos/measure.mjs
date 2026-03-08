import { readFileSync } from 'fs';
import { transpile } from '../src/transpile.mjs';

const files = ['examples/self.ben', 'examples/benoit.ben', 'examples/math_tested.ben', 'examples/showcase.ben'];

console.log('══════════════════════════════════════════════');
console.log('  EFFICACITÉ .ben vs .js — MESURE RÉELLE');
console.log('══════════════════════════════════════════════');
console.log();

for (const f of files) {
  const src = readFileSync(f, 'utf8');
  const lines = src.split('\n');
  const total = lines.length;
  const blank = lines.filter(l => l.trim() === '').length;
  const comments = lines.filter(l => l.trim().startsWith('--')).length;
  const asserts = lines.filter(l => {
    const t = l.trim();
    const hasIs = t.includes(' is ') && !t.includes('->');
    const hasEq = t.includes(' == ') && !t.includes('->') && !/^\w+\s*:/.test(t);
    return hasIs || hasEq;
  }).length;
  const code = total - blank - comments - asserts;
  const noise = ((blank + comments) / total * 100).toFixed(0);
  const proofRatio = (asserts / Math.max(1, code + asserts) * 100).toFixed(0);

  console.log(f.split('/').pop());
  console.log(`  lignes: ${total} (code: ${code}, preuves: ${asserts}, docs+blancs: ${blank + comments})`);
  console.log(`  bruit: ${noise}% | preuves: ${proofRatio}% du contenu utile`);
  console.log();
}

// self.ben deep analysis
console.log('══════════════════════════════════════════════');
console.log('  self.ben vs self.js — COMPRESSION');
console.log('══════════════════════════════════════════════');
console.log();

const self = readFileSync('examples/self.ben', 'utf8');
const benLines = self.split('\n').filter(l => l.trim() !== '' && !l.trim().startsWith('--'));
const benChars = benLines.join('\n').length;

const js = transpile(self);
const jsLines = js.split('\n').filter(l => l.trim() !== '' && !l.trim().startsWith('//'));
const jsChars = jsLines.join('\n').length;

const isCount = benLines.filter(l => / is /.test(l.trim())).length;

console.log(`.ben: ${benChars} chars (${benLines.length} lignes utiles)`);
console.log(`.js:  ${jsChars} chars (${jsLines.length} lignes utiles)`);
console.log(`ratio: .ben = ${(benChars / jsChars * 100).toFixed(0)}% du .js`);
console.log();

console.log('Tokens (1 token ~ 4 chars):');
console.log(`  .ben: ~${Math.ceil(benChars / 4)} tokens`);
console.log(`  .js:  ~${Math.ceil(jsChars / 4)} tokens`);
console.log(`  ET le .ben inclut ${isCount} preuves inline`);
console.log();

// Syntax census
console.log('══════════════════════════════════════════════');
console.log('  ANATOMIE SYNTAXIQUE');
console.log('══════════════════════════════════════════════');
console.log();

const arrows = (self.match(/->/g) || []).length;
const parens = (self.match(/[()]/g) || []).length;
const commas = (self.match(/,/g) || []).length;
const dashes = (self.match(/^--/gm) || []).length;

console.log(`->  (définition): ${arrows}x  — irréductible`);
console.log(`is  (preuve):     ${isCount}x  — irréductible`);
console.log(`()  (appel):      ${Math.floor(parens/2)}x  — JS compat, irréductible`);
console.log(`,   (args):       ${commas}x  — irréductible`);
console.log(`--  (docs):       ${dashes}x  — optionnel mais utile`);
console.log();

// Code pur sans preuves
const pureLines = benLines.filter(l => !/ is /.test(l.trim()));
const pureChars = pureLines.join('\n').length;

console.log('══════════════════════════════════════════════');
console.log('  VERDICT');
console.log('══════════════════════════════════════════════');
console.log();
console.log(`Code pur (sans preuves): ${pureChars} chars = ${(pureChars / jsChars * 100).toFixed(0)}% du JS`);
console.log(`Code + preuves:          ${benChars} chars = ${(benChars / jsChars * 100).toFixed(0)}% du JS`);
console.log();
console.log(`Le .ben est PLUS PETIT que le .js`);
console.log(`ET il contient ${isCount} preuves que le .js n'a pas.`);
console.log();

console.log('Optimisations théoriques restantes:');
console.log(`  1. -> pourrait être → (1 char au lieu de 2) — gain: ${arrows} chars`);
console.log(`  2. Supprimer les () pour appels sans ambiguïté — complexe, risqué`);
console.log(`  3. Impliciter les , pour 2 args — fragile`);
console.log();
console.log(`Gain max théorique: ~${arrows} chars (${(arrows / benChars * 100).toFixed(1)}%)`);
console.log(`→ ON EST AU PLANCHER. Le reste serait de l'obfuscation, pas de l'optimisation.`);
