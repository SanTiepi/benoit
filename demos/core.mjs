#!/usr/bin/env node
// BENOIT CORE — One Primitive to Rule Them All
//
// Counter-intuition: 18 modules are all the same operation.
//
//   given(known) → when(hole) → then(answer)
//
// This demo proves it.
//
// Run: node demos/core.mjs

import { given, asDiff, selfTest } from "../src/core.mjs";

const SEP = "═══════════════════════════════════════════════════════════";
const DIV = "───────────────────────────────────────────────────────────";

function log(label, msg) {
  console.log(`  [${label}] ${msg}`);
}

console.log(SEP);
console.log("  BENOIT CORE");
console.log("  18 modules. 1 primitive. given → when → then.");
console.log(SEP);

// ─── 1. Protocol = given/when ────────────────────────────────────────

console.log("\n  1. PROTOCOL: transmit a function as behavior\n");

const transmitted = given([
  { input: 2, output: 5 },
  { input: 3, output: 7 },
  { input: 0, output: 1 },
]);

log("send", "I know: f(2)=5, f(3)=7, f(0)=1");
log("recv", `Synthesized: ${transmitted.formula}`);
log("recv", `f(10) = ${transmitted.when(10)}`);
log("recv", `f(100) = ${transmitted.when(100)}`);

// ─── 2. Intent = given/when ──────────────────────────────────────────

console.log("\n" + DIV);
console.log("\n  2. INTENT: give an instruction as examples\n");

const instruction = given([
  { input: [5, 3, 8, 1], output: [1, 3, 5, 8] },
  { input: [2, 1], output: [1, 2] },
  { input: [], output: [] },
]);

log("boss", "Do this: [5,3,8,1] → [1,3,5,8]");
log("agent", `Understood: ${instruction.formula}`);
log("agent", `[9,2,7] → [${instruction.when([9, 2, 7])}]`);

// ─── 3. Query = given/when with a hole ───────────────────────────────

console.log("\n" + DIV);
console.log("\n  3. QUERY: ask a question as a hole\n");

const context = given([
  { input: 1, output: 1 },
  { input: 2, output: 4 },
  { input: 3, output: 9 },
]);

log("student", "I see: 1→1, 2→4, 3→9. What is f(7)?");
log("teacher", `f(7) = ${context.when(7)} (pattern: ${context.formula})`);

// ─── 4. Correction = given.but() ─────────────────────────────────────

console.log("\n" + DIV);
console.log("\n  4. CORRECTION: override with new evidence\n");

const wrong = given([
  { input: 2, output: 4 },
  { input: 3, output: 6 },
  { input: 5, output: 10 },
]);
log("A", `I think: ${wrong.formula} → f(4) = ${wrong.when(4)}`);

const right = wrong.but([
  { input: 3, output: 9 },
  { input: 5, output: 25 },
  { input: 4, output: 16 },
  { input: 0, output: 0 },
]);
log("B", `Actually: ${right.formula} → f(4) = ${right.when(4)}`);

// ─── 5. Composition = given.pipe() ───────────────────────────────────

console.log("\n" + DIV);
console.log("\n  5. COMPOSITION: chain two primitives\n");

const double = given([
  { input: 1, output: 2 },
  { input: 3, output: 6 },
  { input: 5, output: 10 },
]);
const negate = given([
  { input: 2, output: -2 },
  { input: 6, output: -6 },
  { input: 10, output: -10 },
]);

const pipeline = double.pipe(negate);
log("*", `double: ${double.formula}`);
log("*", `negate: ${negate.formula}`);
log("*", `double |> negate: ${pipeline.formula}`);
log("*", `f(7) = ${pipeline.when(7)}`);

// ─── 6. Diff = behavioral comparison ─────────────────────────────────

console.log("\n" + DIV);
console.log("\n  6. DIFF: compare two behaviors\n");

const behaviorA = [
  { input: 1, output: -1 },
  { input: 5, output: -5 },
  { input: -3, output: 3 },
];
const behaviorB = [
  { input: 1, output: -1 },
  { input: 5, output: -5 },
  { input: -3, output: 3 },
];
const behaviorC = [
  { input: 1, output: 1 },
  { input: 5, output: 25 },
  { input: -3, output: 9 },
];

const diff1 = asDiff(behaviorA, behaviorB);
const diff2 = asDiff(behaviorA, behaviorC);

log("*", `negate vs negate: ${diff1.equivalent ? "EQUIVALENT" : "DIFFERENT"} (${Math.round(diff1.rate * 100)}% agree)`);
log("*", `negate vs square: ${diff2.equivalent ? "EQUIVALENT" : "DIFFERENT"} (${Math.round(diff2.rate * 100)}% agree)`);

// ─── 7. Self-reference: Benoit describing Benoit ─────────────────────

console.log("\n" + DIV);
console.log("\n  7. SELF-REFERENCE: Can Benoit describe itself?\n");

const result = selfTest();
for (const r of result.results) {
  log(r.pass ? "✓" : "✗", r.test);
}
console.log();
log("*", result.summary);

// ─── THE PROOF ───────────────────────────────────────────────────────

console.log("\n" + SEP);
console.log("  THE PROOF");
console.log(SEP);
console.log(`
  Seven operations. One primitive.

  Protocol    = given(assertions)  .when(new_input)
  Intent      = given(examples)    .when(new_input)
  Query       = given(context)     .when(hole)
  Correction  = given(old)         .but(new_evidence)
  Composition = given(f)           .pipe(given(g))
  Diff        = asDiff(behavior_a, behavior_b)
  Self-test   = ${result.summary}

  given() → when() → then()

  That's it. That's the whole protocol.
  Everything else is syntax.

  18 modules, 237 tests, 9 demos.
  But underneath: one operation, repeated.

  The counter-intuition was right:
  Less is more. The simplest thing is the most powerful.
`);
console.log(SEP);
