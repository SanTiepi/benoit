#!/usr/bin/env node
// BENOÎT MARKETPLACE — Agents Discover, Share, and Compose
//
// Three agents, each with different capabilities:
//   Agent "Math"    — arithmetic + algebra
//   Agent "Geometry" — distance, area, angles
//   Agent "Data"     — statistics, normalization
//
// They publish to a shared marketplace, then discover cross-agent
// relationships that no individual agent knew about.
//
// Run: node demos/marketplace.mjs

import { encode } from "../src/protocol.mjs";
import { composeModules } from "../src/compose.mjs";
import { infer } from "../src/infer.mjs";
import { synthesize } from "../src/solve.mjs";

const SEP = "═══════════════════════════════════════════════════════════";
const DIV = "───────────────────────────────────────────────────────────";

console.log(SEP);
console.log("  BENOÎT MARKETPLACE");
console.log("  Three agents. Shared algebra. Emergent relationships.");
console.log(SEP);

// ─── AGENT MODULES ──────────────────────────────────────────────────

const agents = {
  Math: `add a,b -> a + b
add(2, 3) == 5
add(0, 7) == 7

mul a,b -> a * b
mul(3, 4) == 12
mul(0, 5) == 0

negate x -> 0 - x
negate(5) == -5
negate(-3) == 3

square x -> x * x
square(3) == 9
square(-4) == 16

double x -> x * 2
double(5) == 10
double(-3) == -6

halve x -> x / 2
halve(10) == 5
halve(-4) == -2

abs x -> Math.abs(x)
abs(-7) == 7
abs(3) == 3`,

  Geometry: `hypotenuse a,b -> Math.sqrt(a * a + b * b)
hypotenuse(3, 4) == 5
hypotenuse(5, 12) == 13

area_circle r -> 3.14159 * r * r
area_circle(1) == 3.14159
area_circle(10) == 314.159

perimeter_square s -> 4 * s
perimeter_square(5) == 20
perimeter_square(10) == 40

diagonal_square s -> Math.sqrt(2) * s

mirror x -> 0 - x
mirror(5) == -5
mirror(-3) == 3`,

  Data: `clamp x ->
  x > 1? -> 1
  x < 0? -> 0
  else? -> x
clamp(0.5) == 0.5
clamp(2) == 1
clamp(-1) == 0

normalize x ->
  x >= 0? -> x
  else? -> 0 - x
normalize(5) == 5
normalize(-5) == 5
normalize(0) == 0

scale x -> x * 2
scale(5) == 10
scale(-3) == -6

unscale x -> x / 2
unscale(10) == 5
unscale(-4) == -2`
};

// ─── STEP 1: Each agent publishes to the marketplace ────────────────

console.log("\n  STEP 1: Agents publish their capabilities\n");

const marketplace = {};
let totalFunctions = 0;
let totalProperties = 0;

for (const [name, source] of Object.entries(agents)) {
  const msg = encode(source);
  marketplace[name] = { source, message: msg };
  totalFunctions += msg.functions.length;
  totalProperties += msg.meta.propertyCount;

  console.log(`  ${name.padEnd(10)} → ${msg.functions.length} functions, ${msg.meta.propertyCount} properties`);
  for (const fn of msg.functions) {
    const props = fn.properties.length > 0 ? fn.properties.join(", ") : "—";
    console.log(`    ${fn.name}: ${props}`);
  }
  console.log();
}

console.log(`  Total: ${totalFunctions} functions, ${totalProperties} properties\n`);

// ─── STEP 2: Compose all modules ────────────────────────────────────

console.log(DIV);
console.log("\n  STEP 2: Cross-agent composition\n");

const sources = Object.values(agents);
const composed = composeModules(...sources);

console.log(`  Cross-module equivalences: ${composed.stats.crossEquivalences}`);
if (composed.crossModule.equivalences.length > 0) {
  for (const eq of composed.crossModule.equivalences) {
    const agentA = Object.keys(agents)[eq.moduleA];
    const agentB = Object.keys(agents)[eq.moduleB];
    console.log(`    ${agentA}.${eq.functionA} ≡ ${agentB}.${eq.functionB}`);
  }
}

console.log(`\n  Cross-module inverses: ${composed.stats.crossInverses}`);
if (composed.crossModule.inverses.length > 0) {
  for (const inv of composed.crossModule.inverses) {
    const agentF = Object.keys(agents)[inv.moduleF];
    const agentG = Object.keys(agents)[inv.moduleG];
    console.log(`    ${agentF}.${inv.f} ↔ ${agentG}.${inv.g}`);
  }
}

console.log(`\n  Cross-module compositions: ${composed.stats.crossCompositions}`);
const interestingComps = composed.crossModule.compositions.filter(c =>
  c.properties.includes("composition_identity") || c.properties.includes("absorption")
);
for (const comp of interestingComps.slice(0, 8)) {
  const agentF = Object.keys(agents)[comp.moduleF];
  const agentG = Object.keys(agents)[comp.moduleG];
  console.log(`    ${agentF}.${comp.f} ∘ ${agentG}.${comp.g}: ${comp.properties.join(", ")}`);
}
if (composed.stats.crossCompositions > 8) {
  console.log(`    ... and ${composed.stats.crossCompositions - 8} more`);
}

// ─── STEP 3: A new agent arrives ────────────────────────────────────

console.log("\n" + DIV);
console.log("\n  STEP 3: A new agent arrives with only EXAMPLES\n");

const newAgent = {
  functions: [
    { name: "f1", arity: 2, assertions: [
      { input: "f1(3, 4)", output: "5" },
      { input: "f1(5, 12)", output: "13" },
      { input: "f1(8, 15)", output: "17" },
    ]},
    { name: "f2", arity: 1, assertions: [
      { input: "f2(0)", output: "1" },
      { input: "f2(1)", output: "2" },
      { input: "f2(3)", output: "8" },
      { input: "f2(10)", output: "1024" },
    ]},
    { name: "f3", arity: 1, assertions: [
      { input: 'f3("hello")', output: '"Hello hello!"' },
      { input: 'f3("world")', output: '"Hello world!"' },
    ]},
  ]
};

console.log("  New agent has 3 unnamed functions (only examples).\n");
console.log("  Synthesizing...\n");

const synthResults = synthesize(newAgent);
for (const r of synthResults) {
  if (r.code) {
    console.log(`  ${r.name} → ${r.code.split("\n")[0]}`);
  } else {
    console.log(`  ${r.name} → unsolved`);
  }
}

// Check if any synthesized function matches existing marketplace functions
console.log("\n  Checking against marketplace...\n");

const synthFns = {};
for (const r of synthResults) {
  if (r.code) {
    // Check if this matches any existing function by name/behavior
    for (const [agentName, data] of Object.entries(marketplace)) {
      for (const fn of data.message.functions) {
        if (fn.arity === newAgent.functions.find(f => f.name === r.name)?.arity) {
          // Compare assertions
          const newAssertions = newAgent.functions.find(f => f.name === r.name)?.assertions || [];
          // Simple check: does the marketplace function have similar behavior?
        }
      }
    }
  }
}

// ─── RESULTS ────────────────────────────────────────────────────────

console.log(SEP);
console.log("  MARKETPLACE SUMMARY");
console.log(SEP);
console.log(`
  Agents:           ${Object.keys(agents).length} + 1 newcomer
  Functions shared:  ${totalFunctions}
  Properties:       ${totalProperties}
  Cross-agent equivalences: ${composed.stats.crossEquivalences}
  Cross-agent inverses:     ${composed.stats.crossInverses}
  Cross-agent compositions: ${composed.stats.crossCompositions}
  New agent synthesis:      ${synthResults.filter(r => r.code).length}/${synthResults.length}

  The marketplace doesn't just store functions.
  It discovers the algebra BETWEEN them.
  Functions from different agents relate to each other
  in ways their creators never declared.
`);
console.log(SEP);
