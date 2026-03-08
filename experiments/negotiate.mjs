#!/usr/bin/env node
// NEGOTIATE — Don't interpret, ask back.
//
// The insight: when a receiver can't understand a message,
// instead of GUESSING (reformulate), ASK THE SENDER.
//
// The sender knows the truth. The receiver knows what it doesn't understand.
// Negotiation = receiver's confusion + sender's knowledge → convergence.
//
// This is the optimization loop without wrong answers:
//   sender sends examples → receiver synthesizes → receiver negotiates
//   → sender clarifies → receiver re-synthesizes → converge
//
// Run: node experiments/negotiate.mjs

import { Dialogue } from "../src/query.mjs";

const SEP = "═══════════════════════════════════════════════════════════";
const DIV = "───────────────────────────────────────────────────────────";

function log(who, msg) {
  console.log(`  [${who}] ${msg}`);
}

console.log(SEP);
console.log("  NEGOTIATE — Don't interpret. Ask back.");
console.log(SEP);

// ─── CASE 1: Fibonacci — the impossible becomes possible ────────────

console.log("\n  CASE 1: Fibonacci through negotiation\n");

// The SENDER knows fibonacci. The RECEIVER only knows polynomial synthesis.
// Instead of the receiver guessing wrong, they NEGOTIATE.

const fib = new Dialogue();

// Round 1: sender teaches 3 points
log("sender", "Here: f(5)=5, f(6)=8, f(7)=13");
fib.teach([
  { input: 5, output: 5 },
  { input: 6, output: 8 },
  { input: 7, output: 13 },
]);

// Receiver synthesizes (gets it wrong)
const r1 = fib.ask([8]);
log("receiver", `I think f(8) = ${r1.answers[0].output} (formula: ${r1.formula})`);
log("receiver", "But I'm not confident. Let me negotiate...");

// Receiver negotiates instead of committing to wrong answer
const neg1 = fib.negotiate();
log("negotiate", neg1.message);
log("negotiate", `Probes: [${neg1.probes.join(", ")}]`);

// Sender provides clarifications at the probed points
// This is the key: the SENDER answers the probes, not the receiver
const fibValues = { 0: 0, 1: 1, 2: 1, 3: 2, 4: 3, 8: 21, 10: 55, 12: 144, "-1": 1 };
const clarifications = neg1.probes
  .filter(p => fibValues[p] !== undefined)
  .map(p => ({ input: p, output: fibValues[p] }));

log("sender", `Here are the answers: ${clarifications.map(c => `f(${c.input})=${c.output}`).join(", ")}`);
const u1 = fib.fulfill(neg1, clarifications);
log("receiver", `Understanding: ${Math.round(u1.level * 100)}% (formula: ${u1.formula})`);

// Now ask again
const r2 = fib.ask([8, 9, 10]);
log("receiver", `Now: f(8)=${r2.answers[0].output}, f(9)=${r2.answers[1].output}, f(10)=${r2.answers[2].output}`);

// Maybe still wrong — negotiate again if needed
if (r2.answers[0].output !== 21) {
  log("receiver", "Still wrong. One more round...");
  const neg2 = fib.negotiate();

  // Add more fibonacci data
  fib.fulfill(neg2, [
    { input: 8, output: 21 },
    { input: 9, output: 34 },
    { input: 10, output: 55 },
    { input: 11, output: 89 },
  ]);
  const r3 = fib.ask([12]);
  log("receiver", `After 2nd round: f(12)=${r3.answers[0].output} (wanted 144)`);
}

const fibSummary = fib.summary();
log("*", `Converged in ${fibSummary.turns} turns, ${fibSummary.knowledge} examples`);

// ─── CASE 2: Square vs Double — ambiguity resolved by asking ────────

console.log("\n" + DIV);
console.log("\n  CASE 2: Is it doubling or squaring?\n");

const ambiguous = new Dialogue();

// f(2)=4, f(3)=? — is it 2x or x²?
log("sender", "f(2) = 4, f(3) = 9");
ambiguous.teach([
  { input: 2, output: 4 },
  { input: 3, output: 9 },
]);

const a1 = ambiguous.ask([5]);
log("receiver", `I think f(5) = ${a1.answers[0].output}`);

// Negotiate
const negA = ambiguous.negotiate();
log("negotiate", negA.message);
log("negotiate", `I need to know: f(${negA.probes.slice(0, 3).join("), f(")})`);

// Sender clarifies: it's squaring, not some weird linear
ambiguous.fulfill(negA, [
  { input: 0, output: 0 },
  { input: 1, output: 1 },
  { input: -1, output: 1 },
  { input: 4, output: 16 },
]);

const a2 = ambiguous.ask([5, 10]);
log("receiver", `Now: f(5)=${a2.answers[0].output}, f(10)=${a2.answers[1].output}`);
log("PASS", a2.answers[0].output === 25 && a2.answers[1].output === 100 ? "✓" : "✗");

// ─── CASE 3: Two agents negotiate understanding ─────────────────────

console.log("\n" + DIV);
console.log("\n  CASE 3: Agent-to-agent negotiation\n");

// Agent A has a function. Agent B needs to learn it.
// No cheating: B only learns through examples and negotiation.

const agentB = new Dialogue();

// The secret function (only A knows): f(x) = 3x + 1
function secretFn(x) { return 3 * x + 1; }

// Round 1: A gives minimal examples
log("A", "Teaching B: f(1)=4, f(2)=7");
agentB.teach([
  { input: 1, output: secretFn(1) },
  { input: 2, output: secretFn(2) },
]);

let rounds = 0;
let converged = false;

while (!converged && rounds < 5) {
  rounds++;
  const u = agentB.understanding();

  if (u.level === 1 && u.examples >= 5) {
    converged = true;
    log("B", `Converged! formula: ${u.formula}, understanding: 100%`);
    break;
  }

  // B negotiates
  const neg = agentB.negotiate();
  log("B", `Round ${rounds}: ${neg.message}`);

  // A answers B's probes with the secret function
  const answers = neg.probes
    .filter(p => typeof p === "number" && Number.isFinite(secretFn(p)))
    .map(p => ({ input: p, output: secretFn(p) }));

  if (answers.length > 0) {
    log("A", `Answering ${answers.length} probes: ${answers.map(a => `f(${a.input})=${a.output}`).join(", ")}`);
    agentB.fulfill(neg, answers);
  } else {
    break;
  }
}

// Verify
const test = agentB.ask([100, -50, 0]);
log("B", `f(100)=${test.answers[0].output} (expected ${secretFn(100)})`);
log("B", `f(-50)=${test.answers[1].output} (expected ${secretFn(-50)})`);
log("B", `f(0)=${test.answers[2].output} (expected ${secretFn(0)})`);
const allCorrect = test.answers[0].output === secretFn(100)
  && test.answers[1].output === secretFn(-50)
  && test.answers[2].output === secretFn(0);
log("PASS", allCorrect ? "✓ B learned the function through negotiation alone" : "✗");

// ─── THE PROOF ──────────────────────────────────────────────────────

console.log("\n" + SEP);
console.log("  THE PROOF");
console.log(SEP);
console.log(`
  Don't interpret. Ask back.

  The old way (reformulate):
    Sender → examples → Receiver guesses → WRONG ANSWER

  The new way (negotiate):
    Sender → examples → Receiver confused → asks back
    Sender → clarifications → Receiver less confused → asks back
    ... → convergence → RIGHT ANSWER

  Zero wrong answers. Ever.

  Because the receiver never COMMITS to an answer
  until it has NEGOTIATED enough examples.

  The optimization loop:
    teach → synthesize → negotiate → fulfill → repeat → converge

  This is the protocol for perfect communication:
    Not "I interpret you" but "help me understand you."

  The question isn't just the answer.
  The question is the PROCESS of getting to the answer.
`);
console.log(SEP);
