#!/usr/bin/env node
// BENOÎT SHOWCASE — Everything in one demo
//
// This script demonstrates the full Benoît pipeline:
//   1. Write functions in a minimal language
//   2. Auto-discover algebraic properties
//   3. Encode into a protocol message (zero source code)
//   4. Transmit to another agent
//   5. Reconstruct working code from behavior alone
//   6. Self-optimize using discovered properties
//   7. Compose modules from different agents
//
// Run: node demos/showcase.mjs

import { transpile } from "../src/transpile.mjs";
import { infer } from "../src/infer.mjs";
import { exchange } from "../src/protocol.mjs";
import { optimize } from "../src/optimize.mjs";
import { composeModules } from "../src/compose.mjs";
import { synthesize } from "../src/solve.mjs";

const SEPARATOR = "═══════════════════════════════════════════════════════════";
const DIVIDER = "───────────────────────────────────────────────────────────";

console.log(SEPARATOR);
console.log("  BENOÎT — A Language Where Functions Are Algebra");
console.log("  and Modules Are Messages Between Machines");
console.log(SEPARATOR);

// ─── 1. THE LANGUAGE ─────────────────────────────────────────────────
console.log("\n  1. THE LANGUAGE\n");
console.log("  Benoît is minimal. Every character carries meaning.\n");

const source = `add a,b -> a + b
add(2, 3) == 5
add(-1, 1) == 0`;

const js = transpile(source);
console.log("  Source (3 lines, 47 chars):");
console.log("    " + source.split("\n").join("\n    "));
console.log("\n  Transpiles to JavaScript:");
console.log("    " + js.trim().split("\n").join("\n    "));
console.log(`\n  ${source.length} chars → ${js.length} chars (${Math.round((1 - source.length / js.length) * 100)}% more compact)`);

// ─── 2. PROPERTY DISCOVERY ──────────────────────────────────────────
console.log("\n" + DIVIDER);
console.log("\n  2. PROPERTY DISCOVERY\n");
console.log("  Benoît probes functions and discovers their algebra.\n");

const functions = [
  "add a,b -> a + b",
  "negate x -> 0 - x",
  "square x -> x * x",
  "abs x -> Math.abs(x)",
  "double x -> x * 2",
  "halve x -> x / 2",
];

for (const src of functions) {
  const result = infer(src);
  const props = result.properties.map(p => p.type).join(", ");
  console.log(`  ${result.name}: ${props || "(none)"}`);
}

// ─── 3. SYNTHESIS FROM BEHAVIOR ─────────────────────────────────────
console.log("\n" + DIVIDER);
console.log("\n  3. SYNTHESIS FROM BEHAVIOR\n");
console.log("  Give Benoît examples. It discovers the function.\n");

const synthTests = [
  { name: "mystery1", arity: 2, assertions: [
    { input: "mystery1(12, 8)", output: "4" },
    { input: "mystery1(7, 3)", output: "1" },
    { input: "mystery1(100, 25)", output: "25" },
  ]},
  { name: "mystery2", arity: 1, assertions: [
    { input: 'mystery2("hello")', output: '"HELLO"' },
    { input: 'mystery2("world")', output: '"WORLD"' },
    { input: 'mystery2("abc")', output: '"ABC"' },
  ]},
  { name: "mystery3", arity: 1, assertions: [
    { input: "mystery3(0)", output: "1" },
    { input: "mystery3(1)", output: "2" },
    { input: "mystery3(3)", output: "8" },
    { input: "mystery3(10)", output: "1024" },
  ]},
  { name: "mystery4", arity: 1, assertions: [
    { input: 'mystery4("World")', output: '"Hello World!"' },
    { input: 'mystery4("Benoît")', output: '"Hello Benoît!"' },
  ]},
];

const synthResults = synthesize({ functions: synthTests });
for (const r of synthResults) {
  if (r.code) {
    console.log(`  ${r.name} → ${r.code.split("\n")[0]}`);
  } else {
    console.log(`  ${r.name} → (unsolved)`);
  }
}

console.log("\n  GCD, string templates, exponentials — all from examples alone.");

// ─── 4. AI-TO-AI PROTOCOL ───────────────────────────────────────────
console.log("\n" + DIVIDER);
console.log("\n  4. AI-TO-AI COMMUNICATION\n");
console.log("  Two agents exchange a module. Zero source code transmitted.\n");

const moduleSource = `add a,b -> a + b
add(2, 3) == 5
add(-1, 1) == 0
add(0, 42) == 42

square x -> x * x
square(0) == 0
square(3) == 9
square(-5) == 25

negate x -> 0 - x
negate(5) == -5
negate(-3) == 3
negate(0) == 0

abs x -> Math.abs(x)
abs(5) == 5
abs(-5) == 5
abs(0) == 0

double x -> x * 2
double(0) == 0
double(3) == 6
double(-5) == -10`;

const ex = exchange(moduleSource);
console.log(`  Agent A sends: ${ex.summary.functionsTransmitted} functions`);
console.log(`  Properties: ${ex.summary.propertiesTransmitted}`);
console.log(`  Source code: ${ex.summary.sourceCodeTransmitted} chars`);
console.log(`  Message size: ${ex.messageSize} chars`);
console.log(`  Verification: ${ex.summary.verificationRate}`);

// ─── 5. SELF-OPTIMIZATION ───────────────────────────────────────────
console.log("\n" + DIVIDER);
console.log("\n  5. SELF-OPTIMIZATION\n");
console.log("  Code optimizes itself using its own discovered properties.\n");

const toOptimize = `add a,b -> a + b

negate x -> 0 - x

square x -> x * x

abs x -> Math.abs(x)

double x -> x * 2

halve x -> x / 2

add(x, 0)
negate(negate(x))
square(negate(x))
double(halve(x))
abs(abs(x))
add(3, 5)`;

const optResult = optimize(toOptimize);
const optimized = optResult.optimized.split("\n")
  .filter(l => l.trim() && !l.includes("->"))
  .map(l => l.trim());

const originals = ["add(x, 0)", "negate(negate(x))", "square(negate(x))",
  "double(halve(x))", "abs(abs(x))", "add(3, 5)"];

for (let i = 0; i < originals.length; i++) {
  if (optimized[i] && optimized[i] !== originals[i]) {
    console.log(`  ${originals[i].padEnd(25)} → ${optimized[i]}`);
  }
}
console.log(`\n  ${optResult.stats.optimizations} optimizations. Zero hand-written rules.`);

// ─── 6. CROSS-MODULE COMPOSITION ────────────────────────────────────
console.log("\n" + DIVIDER);
console.log("\n  6. CROSS-MODULE COMPOSITION\n");
console.log("  Two agents' modules composed. New relationships emerge.\n");

const moduleA = `negate x -> 0 - x

double x -> x * 2

square x -> x * x`;

const moduleB = `flip x -> 0 - x

halve x -> x / 2

abs x -> Math.abs(x)`;

const composed = composeModules(moduleA, moduleB);

if (composed.crossModule.equivalences.length > 0) {
  console.log("  Equivalences:");
  for (const eq of composed.crossModule.equivalences) {
    console.log(`    ${eq.functionA} ≡ ${eq.functionB}`);
  }
}
if (composed.crossModule.inverses.length > 0) {
  console.log("  Inverse pairs:");
  for (const inv of composed.crossModule.inverses) {
    console.log(`    ${inv.f} ↔ ${inv.g}`);
  }
}
console.log(`\n  ${composed.stats.crossEquivalences} equivalences, ${composed.stats.crossInverses} inverses, ${composed.stats.crossCompositions} composition properties`);
console.log("  Neither agent knew about these. They emerged from composition.");

// ─── CONCLUSION ─────────────────────────────────────────────────────
console.log("\n" + SEPARATOR);
console.log("  CONCLUSION");
console.log(SEPARATOR);
console.log(`
  Benoît is a language where:
  - Functions discover their own properties
  - Modules transmit as behavior, not source code
  - Code optimizes itself using its own algebra
  - Cross-module relationships emerge automatically

  139 tests. Zero dependencies. One file per module.
  Named after Benoît Fragnière, who loved science.
`);
console.log(SEPARATOR);
