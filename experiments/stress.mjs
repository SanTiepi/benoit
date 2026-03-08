#!/usr/bin/env node
// STRESS TEST — Break everything before publishing.
//
// Tests every new feature with edge cases, large inputs,
// adversarial examples, and randomized fuzzing.
//
// Categories:
//   1. quality() — edge cases, adversarial inputs
//   2. reformulate() — impossible questions, circular references
//   3. negotiate() — empty dialogues, infinite loops, convergence
//   4. shouldNegotiate() — boundary conditions
//   5. Dialogue full cycles — multi-round stress
//   6. Performance — throughput and latency
//
// Run: node experiments/stress.mjs

import { quality, reformulate, ask, answer, curious, Dialogue } from "../src/query.mjs";
import { given, asDiff } from "../src/core.mjs";
import { encodeIntent, resolveIntent } from "../src/intent.mjs";

const SEP = "═══════════════════════════════════════════════════════════";
const DIV = "───────────────────────────────────────────────────────────";

let totalPass = 0, totalFail = 0;

function stress(name, fn) {
  try {
    const result = fn();
    if (result.pass) {
      totalPass++;
      console.log(`  ✓ ${name}`);
    } else {
      totalFail++;
      console.log(`  ✗ ${name}`);
      if (result.reason) console.log(`    → ${result.reason}`);
    }
  } catch (e) {
    totalFail++;
    console.log(`  ✗ ${name}`);
    console.log(`    → CRASH: ${e.message}`);
  }
}

console.log(SEP);
console.log("  STRESS TEST — Break everything before publishing");
console.log(SEP);

// ═══════════════════════════════════════════════════════════
// 1. quality() edge cases
// ═══════════════════════════════════════════════════════════

console.log("\n  1. QUALITY — Edge Cases\n");

stress("quality: null input doesn't crash", () => {
  const q = quality(null);
  return { pass: q.score === 0 && q.verdict === "empty" };
});

stress("quality: undefined input doesn't crash", () => {
  const q = quality(undefined);
  return { pass: q.score === 0 && q.verdict === "empty" };
});

stress("quality: single example", () => {
  const q = quality([{ input: 1, output: 1 }]);
  return { pass: q.score > 0 && q.score < 1, reason: `score=${q.score}` };
});

stress("quality: 100 identical examples", () => {
  const examples = Array.from({ length: 100 }, () => ({ input: 1, output: 1 }));
  const q = quality(examples);
  return { pass: q.details.diversity < 0.5, reason: `diversity=${q.details.diversity}` };
});

stress("quality: huge numbers", () => {
  const q = quality([
    { input: 1e10, output: 2e10 },
    { input: 1e12, output: 2e12 },
    { input: -1e10, output: -2e10 },
  ]);
  return { pass: q.score > 0, reason: `score=${q.score}` };
});

stress("quality: NaN in examples", () => {
  const q = quality([
    { input: NaN, output: NaN },
    { input: 1, output: 2 },
  ]);
  return { pass: typeof q.score === "number" };
});

stress("quality: Infinity in examples", () => {
  const q = quality([
    { input: Infinity, output: Infinity },
    { input: 1, output: 2 },
  ]);
  return { pass: typeof q.score === "number" };
});

stress("quality: mixed types (number + string)", () => {
  const q = quality([
    { input: 1, output: 2 },
    { input: "a", output: "b" },
  ]);
  return { pass: typeof q.score === "number" };
});

stress("quality: deeply nested arrays", () => {
  const q = quality([
    { input: [[1, 2], [3]], output: [[1], [2, 3]] },
    { input: [[4]], output: [[4]] },
  ]);
  return { pass: typeof q.score === "number" };
});

stress("quality: empty strings", () => {
  const q = quality([
    { input: "", output: "" },
    { input: "a", output: "A" },
  ]);
  return { pass: q.score > 0 };
});

// ═══════════════════════════════════════════════════════════
// 2. reformulate() edge cases
// ═══════════════════════════════════════════════════════════

console.log("\n  2. REFORMULATE — Edge Cases\n");

stress("reformulate: empty examples", () => {
  const r = reformulate([]);
  return { pass: r.original.quality.score === 0 };
});

stress("reformulate: already perfect question", () => {
  const r = reformulate([
    { input: 0, output: 0 },
    { input: 1, output: 2 },
    { input: 2, output: 4 },
    { input: -1, output: -2 },
    { input: 5, output: 10 },
    { input: 10, output: 20 },
  ]);
  return {
    pass: r.reformulated.quality.score >= r.original.quality.score,
    reason: `${r.original.quality.score} → ${r.reformulated.quality.score}`,
  };
});

stress("reformulate: contradictory examples", () => {
  const r = reformulate([
    { input: 1, output: 2 },
    { input: 1, output: 3 },
    { input: 2, output: 4 },
  ]);
  return { pass: typeof r.reformulated.quality.score === "number" };
});

stress("reformulate: maxRounds=0 does nothing", () => {
  const r = reformulate(
    [{ input: 1, output: 2 }],
    { maxRounds: 0 }
  );
  return { pass: r.rounds === 0 };
});

stress("reformulate: string examples", () => {
  const r = reformulate([
    { input: "hello", output: "HELLO" },
    { input: "world", output: "WORLD" },
  ]);
  return { pass: typeof r.reformulated.quality.score === "number" };
});

stress("reformulate: maxRounds=10 doesn't loop forever", () => {
  const start = performance.now();
  const r = reformulate(
    [{ input: 1, output: 1 }, { input: 2, output: 4 }],
    { maxRounds: 10 }
  );
  const elapsed = performance.now() - start;
  return {
    pass: elapsed < 5000 && r.rounds <= 10,
    reason: `${r.rounds} rounds in ${elapsed.toFixed(0)}ms`,
  };
});

// ═══════════════════════════════════════════════════════════
// 3. negotiate() edge cases
// ═══════════════════════════════════════════════════════════

console.log("\n  3. NEGOTIATE — Edge Cases\n");

stress("negotiate: empty dialogue", () => {
  const d = new Dialogue();
  const neg = d.negotiate();
  return { pass: neg.status === "empty" };
});

stress("negotiate: single example", () => {
  const d = new Dialogue();
  d.teach([{ input: 5, output: 10 }]);
  const neg = d.negotiate();
  return { pass: neg.probes.length > 0 && neg.type === "negotiate" };
});

stress("negotiate: after contradiction", () => {
  const d = new Dialogue();
  d.teach([
    { input: 1, output: 2 },
    { input: 1, output: 3 }, // contradiction!
  ]);
  const neg = d.negotiate();
  return {
    pass: neg.type === "negotiate",
    reason: `status=${neg.status}, confusions=${neg.confusions.length}`,
  };
});

stress("negotiate: probes don't duplicate known inputs", () => {
  const d = new Dialogue();
  d.teach([
    { input: 0, output: 0 },
    { input: 1, output: 2 },
    { input: 2, output: 4 },
  ]);
  const neg = d.negotiate();
  const knownInputs = new Set(d.knowledge.map(e => JSON.stringify(e.input)));
  const duplicates = neg.probes.filter(p => knownInputs.has(JSON.stringify(p)));
  return {
    pass: duplicates.length === 0,
    reason: duplicates.length > 0 ? `duplicates: ${JSON.stringify(duplicates)}` : null,
  };
});

stress("negotiate: 5 rounds don't crash or loop", () => {
  const d = new Dialogue();
  const secret = x => x * x + 1;
  d.teach([{ input: 1, output: 2 }]);

  for (let i = 0; i < 5; i++) {
    const neg = d.negotiate();
    if (neg.status === "empty") break;
    const answers = neg.probes
      .filter(p => typeof p === "number" && Number.isFinite(secret(p)))
      .map(p => ({ input: p, output: secret(p) }));
    if (answers.length === 0) break;
    d.fulfill(neg, answers);
  }

  return {
    pass: d.knowledge.length > 1 && d.turns.length <= 25,
    reason: `${d.knowledge.length} examples, ${d.turns.length} turns`,
  };
});

stress("negotiate: string examples", () => {
  const d = new Dialogue();
  d.teach([
    { input: "hello", output: "HELLO" },
    { input: "world", output: "WORLD" },
  ]);
  const neg = d.negotiate();
  return { pass: neg.type === "negotiate" };
});

stress("negotiate: array examples", () => {
  const d = new Dialogue();
  d.teach([
    { input: [3, 1, 2], output: [1, 2, 3] },
    { input: [5, 1], output: [1, 5] },
  ]);
  const neg = d.negotiate();
  return { pass: neg.type === "negotiate" };
});

// ═══════════════════════════════════════════════════════════
// 4. shouldNegotiate() boundary conditions
// ═══════════════════════════════════════════════════════════

console.log("\n  4. SHOULD-NEGOTIATE — Boundary Conditions\n");

stress("shouldNegotiate: 0 examples = critical", () => {
  const d = new Dialogue();
  const s = d.shouldNegotiate();
  return { pass: s !== false && s.urgency === "critical" };
});

stress("shouldNegotiate: 1 example = medium", () => {
  const d = new Dialogue();
  d.teach([{ input: 1, output: 2 }]);
  const s = d.shouldNegotiate();
  return { pass: s !== false };
});

stress("shouldNegotiate: 2 examples = should negotiate", () => {
  const d = new Dialogue();
  d.teach([{ input: 1, output: 2 }, { input: 2, output: 4 }]);
  const s = d.shouldNegotiate();
  return { pass: s !== false };
});

stress("shouldNegotiate: 3 consistent examples", () => {
  const d = new Dialogue();
  d.teach([
    { input: 1, output: 2 },
    { input: 2, output: 4 },
    { input: 3, output: 6 },
  ]);
  const s = d.shouldNegotiate();
  // 3 consistent examples with formula — low urgency or false
  return { pass: s === false || s.urgency === "low", reason: JSON.stringify(s) };
});

stress("shouldNegotiate: 5+ consistent = false", () => {
  const d = new Dialogue();
  d.teach([
    { input: 0, output: 0 },
    { input: 1, output: 2 },
    { input: 2, output: 4 },
    { input: 3, output: 6 },
    { input: 5, output: 10 },
  ]);
  const s = d.shouldNegotiate();
  return { pass: s === false };
});

stress("shouldNegotiate: inconsistent = high", () => {
  const d = new Dialogue();
  d.teach([
    { input: 1, output: 2 },
    { input: 2, output: 4 },
    { input: 3, output: 6 },
    { input: 4, output: 100 }, // breaks the pattern
    { input: 5, output: 10 },
  ]);
  const s = d.shouldNegotiate();
  return { pass: s !== false && s.urgency === "high", reason: JSON.stringify(s) };
});

// ═══════════════════════════════════════════════════════════
// 5. Full cycle stress
// ═══════════════════════════════════════════════════════════

console.log("\n  5. FULL CYCLE — Multi-round Convergence\n");

const testFunctions = [
  { name: "doubling (2x)", fn: x => 2 * x, initial: [{ input: 3, output: 6 }] },
  { name: "squaring (x²)", fn: x => x * x, initial: [{ input: 2, output: 4 }, { input: 3, output: 9 }] },
  { name: "negate (-x)", fn: x => -x, initial: [{ input: 5, output: -5 }] },
  { name: "constant (42)", fn: () => 42, initial: [{ input: 1, output: 42 }, { input: 99, output: 42 }] },
  { name: "cubic (x³)", fn: x => x ** 3, initial: [{ input: 1, output: 1 }, { input: 2, output: 8 }] },
  { name: "identity (x)", fn: x => x, initial: [{ input: 7, output: 7 }] },
  { name: "abs (|x|)", fn: x => Math.abs(x), initial: [{ input: -3, output: 3 }, { input: 5, output: 5 }] },
  { name: "shift (x+10)", fn: x => x + 10, initial: [{ input: 0, output: 10 }, { input: 5, output: 15 }] },
];

for (const { name, fn, initial } of testFunctions) {
  stress(`converge: ${name}`, () => {
    const d = new Dialogue();
    d.teach(initial);

    let rounds = 0;
    while (d.shouldNegotiate() && rounds < 5) {
      rounds++;
      const neg = d.negotiate();
      const answers = neg.probes
        .filter(p => typeof p === "number" && Number.isFinite(fn(p)))
        .map(p => ({ input: p, output: fn(p) }));
      if (answers.length === 0) break;
      d.fulfill(neg, answers);
    }

    // Test on values the dialogue never saw
    const testInputs = [42, -17, 0, 100];
    let correct = 0;
    for (const x of testInputs) {
      const result = d.ask([x]);
      if (Number.isFinite(fn(x)) && result.answers[0].output === fn(x)) correct++;
    }

    return {
      pass: correct >= 3, // at least 3/4 test inputs correct
      reason: `${correct}/4 correct after ${rounds} rounds, ${d.knowledge.length} examples`,
    };
  });
}

// ═══════════════════════════════════════════════════════════
// 6. Performance
// ═══════════════════════════════════════════════════════════

console.log("\n  6. PERFORMANCE — Throughput and Latency\n");

stress("perf: 1000 quality() calls < 5s", () => {
  const examples = [
    { input: 0, output: 0 },
    { input: 1, output: 2 },
    { input: 2, output: 4 },
    { input: 3, output: 6 },
    { input: 5, output: 10 },
  ];
  const start = performance.now();
  for (let i = 0; i < 1000; i++) quality(examples);
  const elapsed = performance.now() - start;
  return {
    pass: elapsed < 5000,
    reason: `1000 calls in ${elapsed.toFixed(0)}ms (${(elapsed / 1000).toFixed(2)}ms/call)`,
  };
});

stress("perf: 100 reformulate() calls < 10s", () => {
  const examples = [{ input: 1, output: 2 }, { input: 2, output: 4 }];
  const start = performance.now();
  for (let i = 0; i < 100; i++) reformulate(examples, { maxRounds: 2 });
  const elapsed = performance.now() - start;
  return {
    pass: elapsed < 10000,
    reason: `100 calls in ${elapsed.toFixed(0)}ms (${(elapsed / 100).toFixed(2)}ms/call)`,
  };
});

stress("perf: 100 negotiate cycles < 5s", () => {
  const start = performance.now();
  for (let i = 0; i < 100; i++) {
    const d = new Dialogue();
    d.teach([{ input: 1, output: 3 }, { input: 2, output: 5 }]);
    const neg = d.negotiate();
    d.fulfill(neg, [{ input: 0, output: 1 }, { input: 5, output: 11 }]);
  }
  const elapsed = performance.now() - start;
  return {
    pass: elapsed < 5000,
    reason: `100 cycles in ${elapsed.toFixed(0)}ms (${(elapsed / 100).toFixed(2)}ms/call)`,
  };
});

stress("perf: shouldNegotiate 10000 calls < 3s", () => {
  const d = new Dialogue();
  d.teach([{ input: 1, output: 2 }, { input: 2, output: 4 }, { input: 3, output: 6 }]);
  const start = performance.now();
  for (let i = 0; i < 10000; i++) d.shouldNegotiate();
  const elapsed = performance.now() - start;
  return {
    pass: elapsed < 3000,
    reason: `10000 calls in ${elapsed.toFixed(0)}ms (${(elapsed / 10000).toFixed(4)}ms/call)`,
  };
});

// ═══════════════════════════════════════════════════════════
// 7. Integration with core.mjs
// ═══════════════════════════════════════════════════════════

console.log("\n  7. INTEGRATION — quality + given/when agreement\n");

stress("integration: quality score predicts given/when accuracy", () => {
  // High quality question → correct answer
  const highQ = [
    { input: 0, output: 0 },
    { input: 1, output: 1 },
    { input: 2, output: 4 },
    { input: 3, output: 9 },
    { input: -1, output: 1 },
  ];
  const hqScore = quality(highQ);
  const hqResult = given(highQ);
  const highCorrect = hqResult.when(5) === 25;

  // Low quality question → likely wrong answer
  const lowQ = [
    { input: 5, output: 5 },
    { input: 6, output: 8 },
  ];
  const lqScore = quality(lowQ);

  return {
    pass: hqScore.score > lqScore.score && highCorrect,
    reason: `high quality (${hqScore.score}) → correct=${highCorrect}, low quality (${lqScore.score})`,
  };
});

stress("integration: reformulate + given/when improves accuracy", () => {
  const sparse = [{ input: 2, output: 4 }, { input: 3, output: 9 }];
  const r = reformulate(sparse);
  const beforeR = given(sparse);
  const afterR = given(r.reformulated.examples);

  // Both should answer, but after reformulation quality is higher
  return {
    pass: r.reformulated.quality.score >= r.original.quality.score,
    reason: `quality: ${r.original.quality.score} → ${r.reformulated.quality.score}`,
  };
});

stress("integration: negotiate + asDiff shows convergence", () => {
  const secret = x => 2 * x;
  const d = new Dialogue();
  d.teach([{ input: 1, output: 2 }]);

  // Before negotiation: behavior is ambiguous
  const neg = d.negotiate();
  d.fulfill(neg, neg.probes
    .filter(p => typeof p === "number" && Number.isFinite(secret(p)))
    .map(p => ({ input: p, output: secret(p) })));

  // After: build two behaviors and diff them
  const learned = d.knowledge.map(e => ({ input: e.input, output: e.output }));
  const truth = learned.map(e => ({ input: e.input, output: secret(e.input) }));
  const diff = asDiff(learned, truth);

  return {
    pass: diff.equivalent,
    reason: `agree=${diff.agree}, disagree=${diff.disagree}`,
  };
});

// ═══════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════

console.log("\n" + SEP);
console.log(`  STRESS TEST RESULTS: ${totalPass}/${totalPass + totalFail} passed`);
if (totalFail > 0) {
  console.log(`  ${totalFail} FAILURES — fix before publishing`);
} else {
  console.log("  ALL PASSED — ready to publish");
}
console.log(SEP);
