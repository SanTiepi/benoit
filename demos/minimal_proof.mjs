import { transpile, extractTests } from '../src/transpile.mjs';
import { readFileSync, writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { pathToFileURL } from 'url';

const src = readFileSync('examples/minimal.ben', 'utf8');

console.log('══════════════════════════════════════════════');
console.log('  MINIMAL .ben — ZÉRO MOT SUPERFLU');
console.log('══════════════════════════════════════════════');
console.log();

// 1. Show the source
console.log('── Source (.ben) ──');
console.log(src);

// 2. Transpile
const js = transpile(src);
console.log('── Transpiled (.js) ──');
console.log(js);
console.log();

// 3. Extract assertions
const { assertions } = extractTests(src);
console.log(`── ${assertions.length} assertions found ──`);
for (const a of assertions) {
  console.log(`  L${a.line}: ${a.expr} → ${a.expected}`);
}
console.log();

// 4. Execute
const tmp = join(tmpdir(), `ben_minimal_${Date.now()}.mjs`);
writeFileSync(tmp, js);

try {
  const mod = await import(pathToFileURL(tmp).href);

  const tests = [
    ['add(2,3)', mod.add(2,3), 5],
    ['add(0,0)', mod.add(0,0), 0],
    ['add(-1,1)', mod.add(-1,1), 0],
    ['double(21)', mod.double(21), 42],
    ['double(0)', mod.double(0), 0],
    ['same(1,1)', mod.same(1,1), true],
    ['same(1,"1")', mod.same(1,"1"), false],
    ['parse(\'{"a":1}\')', JSON.stringify(mod.parse('{"a":1}')), JSON.stringify({a:1})],
    ['parse("broken")', mod.parse("broken"), null],
    ['first(null,null,"found")', mod.first(null,null,"found"), "found"],
    ['first("yes","no","x")', mod.first("yes","no","x"), "yes"],
    ['greet("world")', mod.greet("world"), "Hello world"],
    ['pipe(+1,*2,3)', mod.pipe(x=>x+1, x=>x*2, 3), 8],
    ['_square is private', mod._square, undefined],
  ];

  let pass = 0, fail = 0;
  console.log('── Résultats ──');
  for (const [label, actual, expected] of tests) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    console.log(`  ${ok ? '✓' : '✗'} ${label}`);
    if (!ok) {
      console.log(`    attendu: ${JSON.stringify(expected)}, reçu: ${JSON.stringify(actual)}`);
      fail++;
    } else {
      pass++;
    }
  }

  console.log();
  console.log('══════════════════════════════════════════════');
  console.log(`  ${pass}/${pass+fail} passent`);

  // Measure
  const benLines = src.split('\n').filter(l => l.trim() && !l.trim().startsWith('--'));
  const jsLines = js.split('\n').filter(l => l.trim() && !l.trim().startsWith('//'));
  const benChars = benLines.join('\n').length;
  const jsChars = jsLines.join('\n').length;

  console.log();
  console.log('  Compression:');
  console.log(`    .ben: ${benChars} chars (${benLines.length} lignes)`);
  console.log(`    .js:  ${jsChars} chars (${jsLines.length} lignes)`);
  console.log(`    ratio: ${(benChars / jsChars * 100).toFixed(0)}%`);

  // Count syntax chars
  const allBen = benLines.join('\n');
  const symbols = (allBen.match(/(->|[(),"'\[\]{}|!])/g) || []).length;
  const letters = allBen.replace(/[^a-zA-Z]/g, '').length;
  const digits = allBen.replace(/[^0-9]/g, '').length;
  console.log();
  console.log('  Anatomie:');
  console.log(`    symboles: ${symbols}`);
  console.log(`    lettres:  ${letters} (noms + valeurs)`);
  console.log(`    chiffres: ${digits}`);
  console.log(`    mots-clés du langage: 0`);
  console.log('══════════════════════════════════════════════');
} finally {
  unlinkSync(tmp);
}
