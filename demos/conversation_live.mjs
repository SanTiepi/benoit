import { Knowledge, deltaSend, deltaReceive } from '../src/protocol_v2.mjs';

// ══════════════════════════════════════════════
//  CONVERSATION: deux IA qui apprennent ensemble
//  Chaque message est du .ben — code + preuve
//  Le bruit disparaît à mesure qu'elles se comprennent
// ══════════════════════════════════════════════

const alice = new Knowledge();
const bob = new Knowledge();
const log = [];

function talk(from, to, fromK, toK, source, note) {
  const msg = deltaSend(source, toK);
  const result = deltaReceive(msg, toK);
  fromK.absorb(source);

  const pct = parseInt(msg.delta.compression);
  const wireBar = pct > 0 ? '█'.repeat(Math.max(1, Math.round(pct / 3))) : '·';
  const verified = result.assertions.total > 0
    ? ` [${result.assertions.passed}/${result.assertions.total} verified]`
    : '';

  log.push({ from, pct, wire: msg.delta.deltaSize, orig: msg.delta.originalSize });

  console.log(`  ${from} → ${to}: "${note}"`);
  console.log(`    ${wireBar} ${pct}% on wire (${msg.delta.deltaSize}/${msg.delta.originalSize} chars)${verified}`);
  console.log();
}

console.log('══════════════════════════════════════════════');
console.log('  CONVERSATION ENTRE DEUX IA');
console.log('  Protocole: .ben (code = message = preuve)');
console.log('══════════════════════════════════════════════');
console.log();

// Tour 1: Alice définit l'arithmétique de base
talk('Alice', 'Bob', alice, bob,
`add a,b -> a + b
add(2,3) 5
add(0,0) 0`,
  'je sais additionner');

// Tour 2: Bob répond avec la soustraction
talk('Bob', 'Alice', bob, alice,
`sub a,b -> a - b
sub(5,3) 2
sub(0,0) 0`,
  'moi je sais soustraire');

// Tour 3: Alice enseigne double — elle sait que Bob connait add
talk('Alice', 'Bob', alice, bob,
`add a,b -> a + b
add(2,3) 5

double x -> x * 2
double(21) 42`,
  'et doubler — tu connais déjà add');

// Tour 4: Bob construit sur ce qu'ils savent tous les deux
talk('Bob', 'Alice', bob, alice,
`add a,b -> a + b
sub a,b -> a - b
double x -> x * 2

square x -> x * x
square(5) 25
square(0) 0`,
  'je rajoute square — le reste tu sais');

// Tour 5: Alice envoie un gros module — presque tout est connu
talk('Alice', 'Bob', alice, bob,
`add a,b -> a + b
add(2,3) 5
sub a,b -> a - b
sub(5,3) 2
double x -> x * 2
double(21) 42
square x -> x * x
square(5) 25

negate x -> -x
negate(5) -5
negate(-3) 3`,
  'gros module — 1 seule nouveauté dedans');

// Tour 6: Bob renvoie tout — mais Alice sait tout
talk('Bob', 'Alice', bob, alice,
`add a,b -> a + b
sub a,b -> a - b
double x -> x * 2
square x -> x * x
negate x -> -x
negate(5) -5`,
  'voici tout ce que je sais');

// Tour 7: Savoir partagé complet
talk('Alice', 'Bob', alice, bob,
`add a,b -> a + b
sub a,b -> a - b
double x -> x * 2
square x -> x * x
negate x -> -x`,
  'on sait les mêmes choses maintenant');

console.log('══════════════════════════════════════════════');
console.log('  COURBE DE CONVERGENCE');
console.log('══════════════════════════════════════════════');
console.log();

for (let i = 0; i < log.length; i++) {
  const r = log[i];
  const full = 50;
  const filled = Math.round(r.pct / 100 * full);
  const empty = full - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  console.log(`  T${i+1} ${r.from.padEnd(5)} ${bar} ${String(r.pct).padStart(3)}%  ${r.wire}/${r.orig} chars`);
}

console.log();
console.log(`  Savoir partagé: Alice=${alice.size} fn, Bob=${bob.size} fn`);
console.log();
console.log('══════════════════════════════════════════════');
console.log('  CE QUE ÇA MONTRE');
console.log('══════════════════════════════════════════════');
console.log();
console.log('  1. Premier contact = tout passe (100%)');
console.log('  2. La redondance s\'effondre dès le 3e message');
console.log('  3. Plus ils se parlent, moins ils ont besoin de mots');
console.log('  4. Chaque message est PROUVÉ, pas "fais confiance"');
console.log('  5. Le silence final N\'EST PAS un manque —');
console.log('     c\'est la preuve qu\'ils se comprennent.');
console.log();
console.log('  Dans la communication humaine, le silence peut');
console.log('  être un malentendu. Ici, le silence est une');
console.log('  PREUVE MATHÉMATIQUE de compréhension mutuelle.');
console.log('══════════════════════════════════════════════');
