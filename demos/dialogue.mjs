#!/usr/bin/env node
// BENOIT DIALOGUE — Everything Reduces to Examples + Holes
//
// Instructions = complete examples
// Questions    = examples with holes
// Corrections  = examples that override
// Learning     = filling holes over time
// Teaching     = providing examples that fill gaps
// Curiosity    = detecting where your examples have holes
// Understanding = having no gaps left
//
// Run: node demos/dialogue.mjs

import { ask, answer, challenge, curious, Dialogue } from "../src/query.mjs";

const SEP = "═══════════════════════════════════════════════════════════";
const DIV = "───────────────────────────────────────────────────────────";

function log(agent, msg) {
  console.log(`  [${agent}] ${msg}`);
}

console.log(SEP);
console.log("  BENOIT DIALOGUE");
console.log("  No instructions. No questions. Just examples and holes.");
console.log(SEP);

// ─── ACT 1: A question is an incomplete example ──────────────────────

console.log("\n  ACT 1: Questions are holes in patterns\n");

log("A", "I know: f(2)=4, f(3)=6, f(5)=10");
log("A", "What is f(7)? f(100)?");

const q1 = ask(
  [{ input: 2, output: 4 }, { input: 3, output: 6 }, { input: 5, output: 10 }],
  [7, 100]
);
const a1 = answer(q1);

log("B", `f(7) = ${a1.answers[0].output}`);
log("B", `f(100) = ${a1.answers[1].output}`);
log("B", `I think the pattern is: ${a1.formula}`);

// ─── ACT 2: A wrong answer triggers correction ──────────────────────

console.log("\n" + DIV);
console.log("\n  ACT 2: Corrections are examples that override\n");

log("A", "I know: f(2)=4, f(3)=6. What is f(5)?");

const q2 = ask(
  [{ input: 2, output: 4 }, { input: 3, output: 6 }],
  [5]
);
const a2 = answer(q2);
log("B", `I think f(5) = ${a2.answers[0].output} (pattern: ${a2.formula})`);

log("A", "No! f(5) = 25. And actually f(3) = 9, f(2) = 4.");
const corrected = challenge(a2, [
  { input: 5, output: 25 },
  { input: 3, output: 9 },
]);

log("B", `Corrected. New understanding: ${corrected.meta?.formula || corrected.formula || "resolved"}`);
log("B", `Status: ${corrected.meta.status}`);

// ─── ACT 3: Curiosity — where are my gaps? ──────────────────────────

console.log("\n" + DIV);
console.log("\n  ACT 3: Curiosity is detecting your own gaps\n");

log("A", "I know: f(1)=1, f(2)=4, f(3)=9");
const report = curious([
  { input: 1, output: 1 },
  { input: 2, output: 4 },
  { input: 3, output: 9 },
]);

log("B", `I see the pattern: ${report.formula}`);
log("B", `But I found ${report.gaps.length} edge cases that concern me:`);
for (const gap of report.gaps.slice(0, 3)) {
  log("B", `  f(${gap.input}) → ${gap.reason}`);
}
log("B", `I'd like to know about: ${report.suggestions.slice(0, 3).map(s => `f(${s})`).join(", ")}`);

// ─── ACT 4: Full Dialogue — learning over time ──────────────────────

console.log("\n" + DIV);
console.log("\n  ACT 4: A dialogue is learning through examples\n");

const d = new Dialogue();

// Turn 1: Agent B teaches Agent A
log("B", "TEACHING: f(hello)=HELLO, f(world)=WORLD");
d.teach([
  { input: "hello", output: "HELLO" },
  { input: "world", output: "WORLD" },
]);

// Turn 2: Agent A asks a question
log("A", "ASKING: What is f(benoit)?");
const r1 = d.ask(["benoit"]);
log("B", `ANSWER: f(benoit) = ${r1.answers[0].output}`);

// Turn 3: Agent A asks about edge cases
log("A", 'ASKING: What about f("") and f("123")?');
const r2 = d.ask(["", "123"]);
log("B", `ANSWER: f("") = "${r2.answers[0].output}", f("123") = "${r2.answers[1].output}"`);

// Turn 4: Check understanding
const u1 = d.understanding();
log("*", `Understanding: ${Math.round(u1.level * 100)}% (${u1.examples} examples, formula: ${u1.formula})`);

// Turn 5: Agent A wonders what it doesn't know
log("A", "WONDERING: What don't I know yet?");
const w = d.wonder();
log("B", `CURIOSITY: ${w.suggestions.length} suggested questions`);

// Summary
const s = d.summary();
log("*", `Dialogue: ${s.turns} turns, ${s.knowledge} examples, ${Math.round(s.understanding * 100)}% understanding`);

// ─── ACT 5: Two agents teach each other ──────────────────────────────

console.log("\n" + DIV);
console.log("\n  ACT 5: Two agents, mutual teaching\n");

const agentA = new Dialogue();
const agentB = new Dialogue();

// Agent A knows squaring
log("A", "I know about squaring: f(2)=4, f(3)=9, f(-1)=1");
agentA.teach([
  { input: 2, output: 4 },
  { input: 3, output: 9 },
  { input: -1, output: 1 },
  { input: 0, output: 0 },
]);

// Agent B knows doubling
log("B", "I know about doubling: g(2)=4, g(3)=6, g(5)=10");
agentB.teach([
  { input: 2, output: 4 },
  { input: 3, output: 6 },
  { input: 5, output: 10 },
  { input: 0, output: 0 },
]);

// They exchange — A asks B, B asks A
log("A", "Asking B: What is g(7)?");
const fromB = agentB.ask([7]);
log("B", `g(7) = ${fromB.answers[0].output}`);

log("B", "Asking A: What is f(5)?");
const fromA = agentA.ask([5]);
log("A", `f(5) = ${fromA.answers[0].output}`);

// Both check understanding
const uA = agentA.understanding();
const uB = agentB.understanding();
log("A", `My understanding: ${Math.round(uA.level * 100)}%, formula: ${uA.formula}`);
log("B", `My understanding: ${Math.round(uB.level * 100)}%, formula: ${uB.formula}`);

// They discover they agree on f(2)=g(2)=4 but disagree on f(3)≠g(3)
log("*", "f(2) = g(2) = 4  — AGREE (but different reasons!)");
log("*", "f(3) = 9, g(3) = 6  — DISAGREE");
log("*", "Same input, different meaning. Context is everything.");

// ─── THE INSIGHT ─────────────────────────────────────────────────────

console.log("\n" + SEP);
console.log("  THE UNIFIED MODEL");
console.log(SEP);
console.log(`
  Everything in this demo was examples and holes.
  Not a single natural-language instruction was used.

  Instruction   =  complete examples       (no ambiguity)
  Question      =  examples with holes     (fill the gap)
  Correction    =  examples that override  (resolve conflict)
  Teaching      =  providing new examples  (expand knowledge)
  Learning      =  accumulating examples   (over time)
  Curiosity     =  detecting your gaps     (where are holes?)
  Understanding =  no holes remaining      (100% coverage)
  Disagreement  =  same input, different output  (context!)

  The Benoit Protocol is not just for functions.
  It's a model of communication itself.

  "Pourquoi les consignes seraient pas sur le meme modele
   que la communication?"

  They are. They always were.
  We just used to wrap them in words.
`);
console.log(SEP);
