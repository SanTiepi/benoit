import { transpile, extractTests } from '../src/transpile.mjs';
import { encode } from '../src/protocol.mjs';
import { readFileSync } from 'fs';

// ══════════════════════════════════════════════
// Protocol v1 vs v2: .ben IS the protocol
// ══════════════════════════════════════════════

const src = `add a,b -> a + b
add(2,3) 5
add(0,0) 0
add(-1,1) 0

double x -> x * 2
double(21) 42
double(0) 0

negate x -> -x
negate(5) -5
negate(-3) 3`;

console.log('══════════════════════════════════════════════');
console.log('  PROTOCOL v1 vs v2');
console.log('══════════════════════════════════════════════');
console.log();

// ── v1: encode → JSON → decode → synthesize ──
console.log('── v1: JSON wire format ──');
const t0 = performance.now();
let v1msg;
try {
  v1msg = encode(src.replace(/^(\w+\(.+\))\s+([-\d].*)$/gm, '$1 == $2'));
} catch(e) {
  // fallback: encode expects == format
  v1msg = encode(src.replace(/^(\w+\(.+\))\s+([-\d].*)$/gm, '$1 == $2'));
}
const v1time = performance.now() - t0;
const v1json = JSON.stringify(v1msg, null, 2);
console.log(v1json);
console.log();
console.log(`  size: ${v1json.length} chars`);
console.log(`  time: ${v1time.toFixed(1)}ms`);
console.log();

// ── v2: .ben IS the message ──
console.log('── v2: .ben wire format ──');
const t1 = performance.now();
// Step 1: sender just sends .ben (already done — src IS the message)
const v2msg = src;
// Step 2: receiver transpiles
const js = transpile(v2msg);
// Step 3: receiver extracts tests
const { assertions } = extractTests(v2msg);
const v2time = performance.now() - t1;

console.log(v2msg);
console.log();
console.log(`  size: ${v2msg.length} chars`);
console.log(`  time: ${v2time.toFixed(1)}ms`);
console.log(`  assertions: ${assertions.length}`);
console.log();

// ── Comparison ──
console.log('══════════════════════════════════════════════');
console.log('  COMPARISON');
console.log('══════════════════════════════════════════════');
console.log();
console.log(`  v1 (JSON):  ${v1json.length} chars, ${v1time.toFixed(1)}ms`);
console.log(`  v2 (.ben):  ${v2msg.length} chars, ${v2time.toFixed(1)}ms`);
console.log(`  compression: ${(v2msg.length / v1json.length * 100).toFixed(0)}% (v2/v1)`);
console.log(`  speedup:     ${(v1time / v2time).toFixed(0)}x faster`);
console.log();

// ── What v2 carries that v1 also carries ──
console.log('  v1 transmits:');
console.log('    ✓ function names + arities');
console.log('    ✓ assertions (input → output)');
console.log('    ✓ inferred properties');
console.log('    ✓ equivalence classes');
console.log('    ✓ inverse pairs');
console.log('    ✓ composition surprises');
console.log();
console.log('  v2 transmits:');
console.log('    ✓ function DEFINITIONS (not just names)');
console.log('    ✓ assertions (inline, zero overhead)');
console.log('    ✓ properties (receiver infers them)');
console.log('    ✓ algebra (receiver discovers it)');
console.log('    + THE ACTUAL CODE (v1 doesn\'t have this)');
console.log('    + human-readable (v1 needs parsing)');
console.log();

// ── The killer insight ──
console.log('══════════════════════════════════════════════');
console.log('  INSIGHT');
console.log('══════════════════════════════════════════════');
console.log();
console.log('  v1 removes the source code and transmits behavior.');
console.log('  v2 transmits the source — which IS the behavior.');
console.log();
console.log('  .ben is simultaneously:');
console.log('    - source code (executable)');
console.log('    - test suite (provable)');
console.log('    - protocol message (transmittable)');
console.log('    - documentation (readable)');
console.log();
console.log('  One format. Four purposes. Zero redundancy.');
console.log('══════════════════════════════════════════════');
