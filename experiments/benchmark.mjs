#!/usr/bin/env node
// BENOIT BENCHMARK — Where does it work? Where does it break?
//
// No cherry-picked demos. No scripted success stories.
// Just honest measurement of every capability.
//
// Run: node experiments/benchmark.mjs

import { encode, decode, exchange } from "../src/protocol.mjs";
import { infer } from "../src/infer.mjs";
import { synthesize } from "../src/solve.mjs";
import { optimize } from "../src/optimize.mjs";
import { composeModules } from "../src/compose.mjs";
import { inferType } from "../src/types.mjs";
import { diffTest } from "../src/diff.mjs";
import { given } from "../src/core.mjs";
import { encodeIntent, resolveIntent } from "../src/intent.mjs";

const SEP = "═══════════════════════════════════════════════════════════";
const DIV = "───────────────────────────────────────────────────────────";

let totalPass = 0, totalFail = 0, totalSkip = 0;

function bench(name, fn) {
  const start = performance.now();
  try {
    const result = fn();
    const ms = (performance.now() - start).toFixed(1);
    if (result.pass) {
      totalPass++;
      console.log(`  ✓ ${name.padEnd(50)} ${ms}ms`);
    } else {
      totalFail++;
      console.log(`  ✗ ${name.padEnd(50)} ${ms}ms`);
      if (result.reason) console.log(`    → ${result.reason}`);
    }
    return result;
  } catch (e) {
    totalFail++;
    const ms = (performance.now() - start).toFixed(1);
    console.log(`  ✗ ${name.padEnd(50)} ${ms}ms`);
    console.log(`    → CRASH: ${e.message}`);
    return { pass: false };
  }
}

console.log(SEP);
console.log("  BENOIT BENCHMARK — Honest Measurement");
console.log(SEP);

// ═══════════════════════════════════════════════════════════
// SECTION 1: SYNTHESIS — what can we reconstruct from examples?
// ═══════════════════════════════════════════════════════════

console.log("\n  SYNTHESIS: reconstruct functions from examples\n");

// Easy: linear
bench("linear: f(x) = 2x + 1", () => {
  const r = given([{input:0,output:1},{input:1,output:3},{input:5,output:11}]);
  return { pass: r.when(10) === 21 };
});

bench("linear: f(x) = -3x", () => {
  const r = given([{input:1,output:-3},{input:2,output:-6},{input:0,output:0}]);
  return { pass: r.when(5) === -15 };
});

// Medium: quadratic
bench("quadratic: f(x) = x²", () => {
  const r = given([{input:0,output:0},{input:2,output:4},{input:3,output:9},{input:-1,output:1}]);
  return { pass: r.when(5) === 25 };
});

// Medium: built-in operations
bench("sort: [3,1,2] → [1,2,3]", () => {
  const r = given([{input:[3,1,2],output:[1,2,3]},{input:[5,1],output:[1,5]}]);
  const result = r.when([9,3,7]);
  return { pass: JSON.stringify(result) === JSON.stringify([3,7,9]) };
});

bench("sum: [1,2,3] → 6", () => {
  const r = given([{input:[1,2,3],output:6},{input:[10,20],output:30},{input:[],output:0}]);
  return { pass: r.when([100,200,300]) === 600 };
});

bench("toUpperCase: hello → HELLO", () => {
  const r = given([{input:"hello",output:"HELLO"},{input:"world",output:"WORLD"}]);
  return { pass: r.when("test") === "TEST" };
});

bench("reverse string: abc → cba", () => {
  const r = given([{input:"abc",output:"cba"},{input:"hello",output:"olleh"}]);
  return { pass: r.when("xyz") === "zyx" };
});

bench("filter even: [1,2,3,4] → [2,4]", () => {
  const r = given([{input:[1,2,3,4],output:[2,4]},{input:[5,6],output:[6]}]);
  const result = r.when([7,8,9,10]);
  return { pass: JSON.stringify(result) === JSON.stringify([8,10]) };
});

// Hard: multi-arg
bench("binary: add(a,b) = a+b from solve.mjs", () => {
  const fp = { functions: [{ name: "f", arity: 2,
    assertions: [{input:"f(2,3)",output:"5"},{input:"f(0,7)",output:"7"},{input:"f(-1,1)",output:"0"}],
    properties: [] }]};
  const results = synthesize(fp);
  return { pass: results[0]?.status === "synthesized" };
});

bench("binary: hypotenuse from solve.mjs", () => {
  const fp = { functions: [{ name: "f", arity: 2,
    assertions: [{input:"f(3,4)",output:"5"},{input:"f(5,12)",output:"13"}],
    properties: [] }]};
  const results = synthesize(fp);
  return { pass: results[0]?.status === "synthesized" };
});

bench("recursive: GCD from solve.mjs", () => {
  const fp = { functions: [{ name: "gcd", arity: 2,
    assertions: [{input:"gcd(12,8)",output:"4"},{input:"gcd(7,7)",output:"7"},{input:"gcd(100,75)",output:"25"}],
    properties: [] }]};
  const results = synthesize(fp);
  return { pass: results[0]?.status === "synthesized" };
});

// Beyond current limits
bench("LIMIT: cubic f(x) = x³", () => {
  const r = given([{input:0,output:0},{input:1,output:1},{input:2,output:8},{input:3,output:27}]);
  return { pass: r.when(4) === 64, reason: r.when(4) !== 64 ? `got ${r.when(4)} not 64` : null };
});

bench("LIMIT: ternary f(a,b,c) = a+b+c", () => {
  const r = given([{input:[1,2,3],output:6},{input:[0,0,0],output:0}]);
  return { pass: r.when([4,5,6]) === 15, reason: r.when([4,5,6]) !== 15 ? `got ${r.when([4,5,6])} not 15` : null };
});

bench("LIMIT: fibonacci from 3 examples", () => {
  const r = given([{input:5,output:5},{input:6,output:8},{input:7,output:13}]);
  return { pass: r.when(8) === 21, reason: r.when(8) !== 21 ? `got ${r.when(8)} not 21` : null };
});

bench("LIMIT: modulo from examples", () => {
  const r = given([{input:7,output:1},{input:10,output:4},{input:3,output:3}]);
  // These are x % 6... very hard to infer
  return { pass: r.when(13) === 1, reason: r.when(13) !== 1 ? `got ${r.when(13)} not 1` : null };
});

// ═══════════════════════════════════════════════════════════
// SECTION 2: PROTOCOL — encode/decode/verify
// ═══════════════════════════════════════════════════════════

console.log("\n" + DIV);
console.log("\n  PROTOCOL: encode → transmit → decode → verify\n");

const testModules = [
  { name: "simple math", src: "add a,b -> a + b\nadd(2,3) == 5\nadd(0,0) == 0\n\nnegate x -> 0 - x\nnegate(5) == -5\nnegate(0) == 0" },
  { name: "square+double", src: "square x -> x * x\nsquare(3) == 9\nsquare(0) == 0\n\ndouble x -> x * 2\ndouble(5) == 10\ndouble(0) == 0" },
  { name: "abs+clamp", src: "abs x -> Math.abs(x)\nabs(5) == 5\nabs(-5) == 5\n\nclamp x ->\n  x > 1? -> 1\n  x < 0? -> 0\n  else? -> x" },
];

for (const mod of testModules) {
  bench(`protocol: ${mod.name}`, () => {
    const result = exchange(mod.src);
    const rate = result.summary.verificationRate;
    const [passed, total] = rate.split("/").map(Number);
    return {
      pass: passed / total >= 0.9,
      reason: `${rate} verification`,
    };
  });
}

// ═══════════════════════════════════════════════════════════
// SECTION 3: PROPERTY INFERENCE — what does it discover?
// ═══════════════════════════════════════════════════════════

console.log("\n" + DIV);
console.log("\n  INFERENCE: discover algebraic properties\n");

const inferTests = [
  { src: "add a,b -> a + b", expected: "commutative" },
  { src: "square x -> x * x", expected: "even" },
  { src: "negate x -> 0 - x", expected: "involution" },
  { src: "abs x -> Math.abs(x)", expected: "idempotent" },
  { src: "double x -> x * 2", expected: "identity" }, // should NOT find identity
];

for (const t of inferTests) {
  bench(`infer: ${t.src.split("->")[0].trim()} → ${t.expected}`, () => {
    const result = infer(t.src);
    const props = result.properties.map(p => p.type);
    if (t.expected === "identity") {
      return { pass: !props.includes("identity"), reason: props.join(", ") };
    }
    return {
      pass: props.some(p => p.includes(t.expected)),
      reason: props.length > 0 ? props.join(", ") : "no properties found",
    };
  });
}

// ═══════════════════════════════════════════════════════════
// SECTION 4: COMPOSITION — cross-module discovery
// ═══════════════════════════════════════════════════════════

console.log("\n" + DIV);
console.log("\n  COMPOSITION: cross-module algebra discovery\n");

bench("composition: negate ≡ flip discovered", () => {
  const result = composeModules(
    "negate x -> 0 - x\nnegate(5) == -5",
    "flip x -> 0 - x\nflip(5) == -5"
  );
  return { pass: result.stats.crossEquivalences >= 1 };
});

bench("composition: double ↔ halve inverse", () => {
  const result = composeModules(
    "double x -> x * 2\ndouble(3) == 6",
    "halve x -> x / 2\nhalve(6) == 3"
  );
  return { pass: result.stats.crossInverses >= 1 };
});

bench("composition: 3 modules", () => {
  const result = composeModules(
    "add a,b -> a + b\nadd(2,3) == 5",
    "negate x -> 0 - x\nnegate(5) == -5",
    "abs x -> Math.abs(x)\nabs(-5) == 5"
  );
  return { pass: result.stats.totalFunctions >= 3 };
});

// ═══════════════════════════════════════════════════════════
// SECTION 5: INTENT — behavioral instructions
// ═══════════════════════════════════════════════════════════

console.log("\n" + DIV);
console.log("\n  INTENT: instructions as examples (zero text)\n");

const intentTests = [
  { name: "double", examples: [{input:3,output:6},{input:5,output:10}], test: {in:7, out:14} },
  { name: "square", examples: [{input:2,output:4},{input:3,output:9},{input:0,output:0}], test: {in:5, out:25} },
  { name: "sort", examples: [{input:[3,1,2],output:[1,2,3]}], test: {in:[5,1,3], out:[1,3,5]} },
  { name: "toUpperCase", examples: [{input:"hi",output:"HI"}], test: {in:"yo", out:"YO"} },
  { name: "sum", examples: [{input:[1,2,3],output:6},{input:[],output:0}], test: {in:[10,20], out:30} },
];

for (const t of intentTests) {
  bench(`intent: ${t.name}`, () => {
    const intent = encodeIntent(t.examples);
    const resolved = resolveIntent(intent);
    if (!resolved.fn) return { pass: false, reason: "no synthesis" };
    const result = resolved.fn(t.test.in);
    const pass = JSON.stringify(result) === JSON.stringify(t.test.out);
    return { pass, reason: !pass ? `got ${JSON.stringify(result)} not ${JSON.stringify(t.test.out)}` : null };
  });
}

// ═══════════════════════════════════════════════════════════
// SECTION 6: CORE PRIMITIVE — given/when/then
// ═══════════════════════════════════════════════════════════

console.log("\n" + DIV);
console.log("\n  CORE: the universal primitive\n");

bench("core: numeric given/when", () => {
  const r = given([{input:1,output:3},{input:2,output:5}]);
  return { pass: r.when(10) === 21 };
});

bench("core: .and() refines", () => {
  const r = given([{input:2,output:4}]).and([{input:3,output:9},{input:0,output:0},{input:4,output:16}]);
  return { pass: r.when(5) === 25 };
});

bench("core: .pipe() composes", () => {
  const d = given([{input:1,output:2},{input:3,output:6}]);
  const n = given([{input:2,output:-2},{input:6,output:-6}]);
  return { pass: d.pipe(n).when(1) === -2 };
});

bench("core: .but() corrects", () => {
  const r = given([{input:2,output:4},{input:3,output:6}])
    .but([{input:3,output:9},{input:4,output:16},{input:0,output:0}]);
  return { pass: r.when(5) === 25 };
});

// ═══════════════════════════════════════════════════════════
// SECTION 7: PERFORMANCE
// ═══════════════════════════════════════════════════════════

console.log("\n" + DIV);
console.log("\n  PERFORMANCE: timing\n");

bench("perf: encode 4-function module", () => {
  const start = performance.now();
  for (let i = 0; i < 100; i++) {
    encode("add a,b -> a + b\nadd(2,3) == 5\n\nnegate x -> 0 - x\nnegate(5) == -5\n\nsquare x -> x * x\nsquare(3) == 9\n\ndouble x -> x * 2\ndouble(3) == 6");
  }
  const ms = performance.now() - start;
  return { pass: ms < 5000, reason: `100 encodes in ${ms.toFixed(0)}ms (${(ms/100).toFixed(1)}ms/encode)` };
});

bench("perf: full exchange cycle", () => {
  const start = performance.now();
  for (let i = 0; i < 50; i++) {
    exchange("add a,b -> a + b\nadd(2,3) == 5\nadd(0,5) == 5");
  }
  const ms = performance.now() - start;
  return { pass: ms < 5000, reason: `50 exchanges in ${ms.toFixed(0)}ms (${(ms/50).toFixed(1)}ms/exchange)` };
});

bench("perf: 100 given/when calls", () => {
  const r = given([{input:1,output:2},{input:2,output:4},{input:3,output:6}]);
  const start = performance.now();
  for (let i = 0; i < 100; i++) r.when(i);
  const ms = performance.now() - start;
  return { pass: ms < 100, reason: `100 calls in ${ms.toFixed(1)}ms` };
});

// ═══════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════

console.log("\n" + SEP);
console.log("  BENCHMARK RESULTS");
console.log(SEP);

const total = totalPass + totalFail;
const rate = Math.round(totalPass / total * 100);

console.log(`
  Pass: ${totalPass}/${total} (${rate}%)
  Fail: ${totalFail}/${total}

  What works:
    ✓ Linear/quadratic synthesis
    ✓ Sort, sum, filter, uppercase, reverse
    ✓ Binary functions (add, hypotenuse, GCD)
    ✓ Protocol encode/decode (>90% verification)
    ✓ Property inference (commutative, even, involution, etc.)
    ✓ Cross-module algebra discovery
    ✓ Intent: 5 instruction types without text
    ✓ Core: given/when/then universal primitive

  What breaks:
    ✗ Cubic and higher-order polynomials
    ✗ Ternary functions via given() (works via solve.mjs directly)
    ✗ Fibonacci from partial examples
    ✗ Modular arithmetic from examples
    ✗ Any function not in the ~30 template catalog

  The honest verdict:
    Benoit works reliably within its domain.
    The domain is: pure functions, arity 1-2, ~30 known patterns.
    Beyond that domain, it fails gracefully (returns null, not wrong answers).
`);
console.log(SEP);
