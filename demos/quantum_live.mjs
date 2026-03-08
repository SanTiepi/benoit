import { Knowledge, deltaSend, deltaReceive, receive } from '../src/protocol_v2.mjs';

// ══════════════════════════════════════════════
//  LIVE: deux agents communiquent en .ben
//  On voit le delta shrink en temps réel
// ══════════════════════════════════════════════

const alice = new Knowledge();
const bob = new Knowledge();

function show(label, msg, result) {
  const bar = '█'.repeat(Math.max(1, Math.round(msg.delta.deltaSize / 5)));
  const ghost = '░'.repeat(Math.max(0, Math.round((msg.delta.originalSize - msg.delta.deltaSize) / 5)));
  console.log(`  ${label}`);
  console.log(`    wire: ${bar}${ghost} ${msg.delta.deltaSize}/${msg.delta.originalSize} chars (${msg.delta.compression})`);
  console.log(`    skipped: ${msg.delta.skippedFunctions} fn, ${msg.delta.skippedAssertions} assertions`);
  if (result.assertions.total > 0) {
    console.log(`    verified: ${result.assertions.passed}/${result.assertions.total} assertions`);
  }
  console.log();
}

console.log('══════════════════════════════════════════════');
console.log('  QUANTUM PROTOCOL — LIVE DEMO');
console.log('  Two agents converging through .ben exchange');
console.log('══════════════════════════════════════════════');
console.log();

// ── Round 1: Alice teaches math ──
console.log('── Round 1: Alice teaches math ──');
console.log();

const mathModule = `-- arithmetic
add a,b -> a + b
add(2,3) 5
add(0,0) 0
add(-1,1) 0

double x -> x * 2
double(21) 42
double(0) 0

negate x -> -x
negate(5) -5
negate(-3) 3`;

const msg1 = deltaSend(mathModule, bob);
const res1 = deltaReceive(msg1, bob);
show('Alice → Bob (first contact)', msg1, res1);

console.log(`  Alice knows: ${alice.size} fn | Bob knows: ${bob.size} fn`);
console.log();

// Alice also learns her own module
alice.absorb(mathModule);

// ── Round 2: Bob teaches strings ──
console.log('── Round 2: Bob teaches strings ──');
console.log();

const stringModule = `-- strings
greet name -> "Hello {name}"
greet("world") "Hello world"
greet("Bob") "Hello Bob"

shout text -> text.toUpperCase()
shout("hello") "HELLO"`;

bob.absorb(stringModule);
const msg2 = deltaSend(stringModule, alice);
const res2 = deltaReceive(msg2, alice);
show('Bob → Alice (new knowledge)', msg2, res2);

console.log(`  Alice knows: ${alice.size} fn | Bob knows: ${bob.size} fn`);
console.log();

// ── Round 3: Alice sends EVERYTHING she knows — but Bob already knows math ──
console.log('── Round 3: Alice re-sends math+strings — Bob already knows ──');
console.log();

const everything = mathModule + '\n\n' + stringModule;
const msg3 = deltaSend(everything, bob);
const res3 = deltaReceive(msg3, bob);
show('Alice → Bob (redundant)', msg3, res3);

console.log(`  Alice knows: ${alice.size} fn | Bob knows: ${bob.size} fn`);
console.log();

// ── Round 4: Alice teaches something NEW mixed with known ──
console.log('── Round 4: Alice adds ONE new function in a big message ──');
console.log();

const withSurprise = everything + `\n\n-- new!\nsquare x -> x * x\nsquare(5) 25\nsquare(0) 0`;
const msg4 = deltaSend(withSurprise, bob);
const res4 = deltaReceive(msg4, bob);
show('Alice → Bob (1 surprise in 7 functions)', msg4, res4);
alice.absorb(withSurprise);

console.log(`  Alice knows: ${alice.size} fn | Bob knows: ${bob.size} fn`);
console.log();

// ── Round 5: Convergence check ──
console.log('── Round 5: Final convergence ──');
console.log();

const msg5 = deltaSend(withSurprise, bob);
console.log(`  Delta size: ${msg5.delta.deltaSize} chars`);
console.log(`  Original:   ${msg5.delta.originalSize} chars`);
console.log(`  Compression: ${msg5.delta.compression}`);
console.log();

// ── Summary ──
console.log('══════════════════════════════════════════════');
console.log('  CONVERGENCE TIMELINE');
console.log('══════════════════════════════════════════════');
console.log();

const rounds = [
  { label: 'R1: first contact', delta: msg1.delta },
  { label: 'R2: new knowledge', delta: msg2.delta },
  { label: 'R3: redundant',     delta: msg3.delta },
  { label: 'R4: 1 surprise',    delta: msg4.delta },
  { label: 'R5: converged',     delta: msg5.delta },
];

for (const r of rounds) {
  const pct = parseInt(r.delta.compression);
  const bar = '█'.repeat(Math.max(1, Math.round(pct / 2)));
  console.log(`  ${r.label.padEnd(20)} ${bar} ${r.delta.compression} (${r.delta.deltaSize} chars)`);
}

console.log();
console.log('  → Plus les agents se connaissent, moins ils parlent.');
console.log('  → Le message converge vers zéro.');
console.log('  → Ce qui reste = la pure surprise.');
console.log('══════════════════════════════════════════════');
