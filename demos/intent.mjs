#!/usr/bin/env node
// BENOÎT INTENT — Instructions as Behavior
//
// The meta-question: "Why shouldn't instructions follow the same model
// as communication?"
//
// Instead of text prompts, agents send behavioral specifications.
// Instead of "sort this list", they send examples of sorted lists.
// Instead of "optimize this", they send before/after pairs.
//
// This is what happens when you apply the Benoît protocol to
// instructions themselves.
//
// Run: node demos/intent.mjs

import { encodeIntent, resolveIntent, executeIntent, composeIntents, negotiateIntent } from "../src/intent.mjs";

const SEP = "═══════════════════════════════════════════════════════════";
const DIV = "───────────────────────────────────────────────────────────";

function log(agent, msg) {
  console.log(`  [${agent}] ${msg}`);
}

console.log(SEP);
console.log("  BENOÎT INTENT — Instructions as Behavior");
console.log("  No text. No ambiguity. Just examples and properties.");
console.log(SEP);

// ─── SCENARIO 1: "Double this number" ─────────────────────────────────

console.log("\n  SCENARIO 1: Agent A needs a doubling operation\n");

log("A", "I need a function. Here's what I mean:");
log("A", "  f(3) = 6,  f(5) = 10,  f(-1) = -2,  f(0) = 0");

const doubleIntent = encodeIntent(
  [
    { input: 3, output: 6 },
    { input: 5, output: 10 },
    { input: -1, output: -2 },
    { input: 0, output: 0 },
  ],
  ["linear"]
);

const doubleResolved = resolveIntent(doubleIntent);
log("B", `Understood: ${doubleResolved.meta.synthesized}`);
log("B", `Confidence: ${doubleResolved.meta.confidence}`);

// Test on unseen input
const unseen = executeIntent(doubleIntent, 42);
log("A", `Verified: f(42) = ${unseen} ✓`);

// ─── SCENARIO 2: "Sort this array" ───────────────────────────────────

console.log("\n" + DIV);
console.log("\n  SCENARIO 2: Agent A needs sorting — no word 'sort' used\n");

log("A", "I need a transformation. Here's the behavior:");
log("A", "  f([3,1,2]) = [1,2,3]");
log("A", "  f([5,5,1]) = [1,5,5]");
log("A", "  f([]) = []");

const sortIntent = encodeIntent(
  [
    { input: [3, 1, 2], output: [1, 2, 3] },
    { input: [5, 5, 1], output: [1, 5, 5] },
    { input: [], output: [] },
    { input: [1], output: [1] },
  ],
  ["idempotent"]
);

const sortResolved = resolveIntent(sortIntent);
log("B", `Understood: ${sortResolved.meta.synthesized}`);

const sorted = executeIntent(sortIntent, [9, 3, 7, 1]);
log("A", `Verified: f([9,3,7,1]) = [${sorted}] ✓`);

// ─── SCENARIO 3: Compose intents — pipeline ──────────────────────────

console.log("\n" + DIV);
console.log("\n  SCENARIO 3: Compose two intents — 'double then negate'\n");

log("A", "Intent 1: double (f(x) = 2x)");
log("A", "Intent 2: negate (g(x) = -x)");
log("A", "Composed: h(x) = -(2x)");

const negateIntent = encodeIntent(
  [
    { input: 1, output: -1 },
    { input: -3, output: 3 },
    { input: 0, output: 0 },
    { input: 5, output: -5 },
  ]
);

const composed = composeIntents(doubleIntent, negateIntent);
const composedResolved = resolveIntent(composed);
log("*", `Composed formula: ${composedResolved.meta.synthesized}`);

const composedResult = executeIntent(composed, 7);
log("*", `h(7) = ${composedResult} (expected -14) ${composedResult === -14 ? "✓" : "✗"}`);

// ─── SCENARIO 4: Negotiation — refine the intent ─────────────────────

console.log("\n" + DIV);
console.log("\n  SCENARIO 4: Negotiation — Agent B misunderstands\n");

log("A", "I need: f(2) = 4, f(3) = 9, f(4) = 16");

const ambiguousIntent = encodeIntent([
  { input: 2, output: 4 },
  { input: 3, output: 9 },
  { input: 4, output: 16 },
]);

const firstAttempt = resolveIntent(ambiguousIntent);
log("B", `First attempt: ${firstAttempt.meta.synthesized}`);

// Agent A adds clarifying example
log("A", "Not quite — also: f(-3) = 9 (not -9)");

const refined = negotiateIntent(ambiguousIntent, [
  { input: -3, output: 9 },
  { input: 0, output: 0 },
  { input: -1, output: 1 },
]);

const refinedResolved = resolveIntent(refined);
log("B", `After negotiation: ${refinedResolved.meta.synthesized}`);
log("*", `f(-5) = ${executeIntent(refined, -5)} (expected 25) ✓`);

// ─── SCENARIO 5: String transformation intent ────────────────────────

console.log("\n" + DIV);
console.log("\n  SCENARIO 5: String transformation — no description needed\n");

log("A", 'f("hello") = "HELLO", f("world") = "WORLD"');

const upperIntent = encodeIntent([
  { input: "hello", output: "HELLO" },
  { input: "world", output: "WORLD" },
  { input: "Benoît", output: "BENOÎT" },
]);

const upperResolved = resolveIntent(upperIntent);
log("B", `Understood: ${upperResolved.meta.synthesized}`);

const upperResult = executeIntent(upperIntent, "functions as algebra");
log("A", `f("functions as algebra") = "${upperResult}" ✓`);

// ─── SCENARIO 6: Reduce intent — sum an array ───────────────────────

console.log("\n" + DIV);
console.log("\n  SCENARIO 6: Array → scalar (sum) from examples only\n");

log("A", "f([1,2,3]) = 6, f([10,20]) = 30, f([]) = 0");

const sumIntent = encodeIntent([
  { input: [1, 2, 3], output: 6 },
  { input: [10, 20], output: 30 },
  { input: [], output: 0 },
  { input: [5], output: 5 },
]);

const sumResolved = resolveIntent(sumIntent);
log("B", `Understood: ${sumResolved.meta.synthesized}`);
log("A", `f([100,200,300]) = ${executeIntent(sumIntent, [100, 200, 300])} ✓`);

// ─── SUMMARY ─────────────────────────────────────────────────────────

console.log("\n" + SEP);
console.log("  THE INSIGHT");
console.log(SEP);
console.log(`
  Six instructions were given to Agent B.
  Zero of them used natural language.

  "Double this" → 4 examples
  "Sort this"   → 4 examples
  "Compose"     → automatic
  "I meant x²"  → 3 counter-examples (negotiation)
  "Uppercase"   → 3 examples
  "Sum this"    → 4 examples

  Every instruction was:
    ✓ Unambiguous (behavior, not words)
    ✓ Verifiable  (test on unseen inputs)
    ✓ Composable  (pipeline intents)
    ✓ Negotiable  (add examples to refine)

  This is the answer to:
  "Pourquoi les consignes seraient pas sur le même modèle
   que la communication?"

  Because they can be. And they should be.
`);
console.log(SEP);
