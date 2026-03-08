#!/usr/bin/env node
// BENOÎT CONVERSATION — Two Agents, Full Protocol
//
// A complete AI-to-AI conversation using every Benoît capability:
//   Turn 1: Agent A sends its module to Agent B (encode → decode)
//   Turn 2: Agent B verifies and reports back
//   Turn 3: Agent B sends its own module to Agent A
//   Turn 4: Both compose their modules — emergent discoveries
//   Turn 5: Either agent can optimize expressions using shared algebra
//
// This is what machine-to-machine communication looks like.
//
// Run: node demos/conversation.mjs

import { encode, decode, exchange } from "../src/protocol.mjs";
import { composeModules } from "../src/compose.mjs";
import { optimize } from "../src/optimize.mjs";
import { diffTest } from "../src/diff.mjs";
import { inferTypes } from "../src/types.mjs";
import { synthesize } from "../src/solve.mjs";

const SEP = "═══════════════════════════════════════════════════════════";
const DIV = "───────────────────────────────────────────────────────────";

function log(agent, msg) {
  console.log(`  [${agent}] ${msg}`);
}

console.log(SEP);
console.log("  BENOÎT CONVERSATION");
console.log("  Two agents communicate using functions as algebra.");
console.log(SEP);

// ─── THE AGENTS ─────────────────────────────────────────────────────

const agentA_source = `add a,b -> a + b
add(2, 3) == 5
add(-1, 1) == 0
add(0, 42) == 42

negate x -> 0 - x
negate(5) == -5
negate(-3) == 3
negate(0) == 0

square x -> x * x
square(0) == 0
square(3) == 9
square(-5) == 25

double x -> x * 2
double(0) == 0
double(3) == 6
double(-5) == -10`;

const agentB_source = `sub a,b -> a - b
sub(5, 3) == 2
sub(0, 7) == -7
sub(10, 10) == 0

flip x -> 0 - x
flip(5) == -5
flip(-3) == 3
flip(0) == 0

halve x -> x / 2
halve(10) == 5
halve(0) == 0
halve(-4) == -2

abs x -> Math.abs(x)
abs(5) == 5
abs(-5) == 5
abs(0) == 0`;

// ─── TURN 1: Agent A → Agent B ─────────────────────────────────────

console.log("\n  TURN 1: Agent A sends its module\n");

const messageA = encode(agentA_source);
const jsonA = JSON.stringify(messageA);

log("A", `Sending ${messageA.functions.length} functions (${jsonA.length} chars)`);
log("A", `Properties: ${messageA.meta.propertyCount}`);
log("A", `Source code: 0 chars`);
log("A", `Inverse pairs: ${messageA.algebra.inversePairs.length}`);
log("A", `Surprises: ${messageA.meta.surpriseCount}`);

// ─── TURN 2: Agent B verifies ──────────────────────────────────────

console.log("\n" + DIV);
console.log("\n  TURN 2: Agent B receives, synthesizes, verifies\n");

const resultA = decode(messageA);

log("B", `Received ${messageA.functions.length} functions`);
log("B", `Synthesized: ${Object.keys(resultA.functions).length}`);
for (const [name, code] of Object.entries(resultA.functions)) {
  log("B", `  ${name} → ${code.split("\n")[0]}`);
}
log("B", `Assertions: ${resultA.verification.assertions.passed}/${resultA.verification.assertions.total}`);
log("B", `Properties: ${resultA.verification.properties.passed}/${resultA.verification.properties.total}`);
log("B", `Overall: ${resultA.total.passed}/${resultA.total.total}`);

// ─── TURN 3: Agent B → Agent A ─────────────────────────────────────

console.log("\n" + DIV);
console.log("\n  TURN 3: Agent B sends its module back\n");

const messageB = encode(agentB_source);
const jsonB = JSON.stringify(messageB);

log("B", `Sending ${messageB.functions.length} functions (${jsonB.length} chars)`);

const resultB = decode(messageB);
log("A", `Received ${messageB.functions.length} functions`);
log("A", `Synthesized: ${Object.keys(resultB.functions).length}`);
log("A", `Verification: ${resultB.total.passed}/${resultB.total.total}`);

// ─── TURN 4: Both compose — emergent algebra ───────────────────────

console.log("\n" + DIV);
console.log("\n  TURN 4: Cross-module composition — emergent discoveries\n");

const composed = composeModules(agentA_source, agentB_source);

if (composed.crossModule.equivalences.length > 0) {
  log("*", "EQUIVALENCES DISCOVERED:");
  for (const eq of composed.crossModule.equivalences) {
    const src = eq.moduleA === 0 ? "A" : "B";
    const dst = eq.moduleB === 0 ? "A" : "B";
    log("*", `  ${src}.${eq.functionA} ≡ ${dst}.${eq.functionB} — same behavior!`);
  }
}

if (composed.crossModule.inverses.length > 0) {
  log("*", "INVERSE PAIRS DISCOVERED:");
  for (const inv of composed.crossModule.inverses) {
    const src = inv.moduleF === 0 ? "A" : "B";
    const dst = inv.moduleG === 0 ? "A" : "B";
    log("*", `  ${src}.${inv.f} ↔ ${dst}.${inv.g} — they undo each other`);
  }
}

const absorbComps = composed.crossModule.compositions.filter(c =>
  c.properties.includes("absorption"));
const identityComps = composed.crossModule.compositions.filter(c =>
  c.properties.includes("composition_identity"));

log("*", `Total cross-module composition properties: ${composed.stats.crossCompositions}`);
log("*", `  Including ${identityComps.length} identity compositions`);
log("*", `  Including ${absorbComps.length} absorptions`);

// ─── TURN 5: Optimize using shared algebra ──────────────────────────

console.log("\n" + DIV);
console.log("\n  TURN 5: Optimize expressions using shared algebra\n");

// Agent A can now optimize expressions using knowledge from both modules
const combined = agentA_source + "\n\n" + agentB_source.replace(/flip/g, "negate").replace(/sub/g, "add");

const expressions = [
  "add(x, 0)",
  "negate(negate(x))",
  "square(negate(x))",
  "double(halve(x))",
  "abs(abs(x))",
  "add(3, 5)",
];

for (const expr of expressions) {
  const full = agentA_source + "\n\nhalve x -> x / 2\n\nabs x -> Math.abs(x)\n\n" + expr;
  const result = optimize(full);
  const lastLine = result.optimized.split("\n").pop().trim();
  if (lastLine !== expr) {
    log("*", `  ${expr.padEnd(25)} → ${lastLine}`);
  }
}

// ─── TURN 6: A new function arrives — synthesize from examples ──────

console.log("\n" + DIV);
console.log("\n  TURN 6: Agent B sends a mystery function as examples only\n");

log("B", "I have a function. Here are its examples:");
log("B", "  f(3, 4) = 5");
log("B", "  f(5, 12) = 13");
log("B", "  f(8, 15) = 17");

const mystery = synthesize({
  functions: [{
    name: "f",
    arity: 2,
    assertions: [
      { input: "f(3, 4)", output: "5" },
      { input: "f(5, 12)", output: "13" },
      { input: "f(8, 15)", output: "17" },
    ]
  }]
});

if (mystery[0]?.code) {
  log("A", `Synthesized: ${mystery[0].code}`);
  log("A", "That's the hypotenuse function!");
} else {
  log("A", "Could not synthesize — need more examples.");
}

// ─── SUMMARY ────────────────────────────────────────────────────────

console.log("\n" + SEP);
console.log("  CONVERSATION SUMMARY");
console.log(SEP);

const totalMsg = jsonA.length + jsonB.length;
console.log(`
  Messages exchanged:  2 (A→B, B→A)
  Total bytes:         ${totalMsg} chars
  Source transmitted:   0 chars
  Functions shared:    ${messageA.functions.length + messageB.functions.length}
  Properties shared:   ${messageA.meta.propertyCount + messageB.meta.propertyCount}

  Cross-module discoveries:
    Equivalences:      ${composed.stats.crossEquivalences}
    Inverse pairs:     ${composed.stats.crossInverses}
    Compositions:      ${composed.stats.crossCompositions}

  Verification:
    A→B: ${resultA.total.passed}/${resultA.total.total}
    B→A: ${resultB.total.passed}/${resultB.total.total}

  + 1 mystery function synthesized from 3 examples

  This is what AI-to-AI communication looks like:
  No source code. No documentation. Just behavior and algebra.
`);
console.log(SEP);
