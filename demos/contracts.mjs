#!/usr/bin/env node
// BENOÎT CONTRACTS — Contract-Driven Module Discovery
//
// Three AI agents in a marketplace negotiate capabilities through
// behavioral contracts: needs, offers, verification, and binding.
//
//   Agent "MathBot"    — needs distance computation
//   Agent "GeomBot"    — offers Euclidean distance (correct)
//   Agent "ApproxBot"  — offers Manhattan distance (wrong for Euclidean!)
//
// The system verifies offers against needs using examples and properties.
// Failed offers trigger renegotiation. Successful ones get bound.
// Then we compose contracts for higher-order capabilities.
//
// Run: node demos/contracts.mjs

import { publishNeed, publishOffer, negotiate, bind, verify, Registry } from "../src/contract.mjs";

const SEP = "═══════════════════════════════════════════════════════════";
const DIV = "───────────────────────────────────────────────────────────";

function log(agent, msg) {
  console.log(`  [${agent}] ${msg}`);
}

// ═══════════════════════════════════════════════════════════════════════
console.log(SEP);
console.log("  BENOIT CONTRACTS");
console.log("  Three agents. Behavioral contracts. Trust through algebra.");
console.log(SEP);

const registry = new Registry();

// ─── ACT 1: MathBot publishes a NEED ─────────────────────────────────

console.log("\n  ACT 1: MathBot publishes a need\n");

log("MathBot", "I need a function: distance between two 2D points.");
log("MathBot", "Here is the behavior I expect:");
log("MathBot", "  dist([0,0], [3,4]) = 5");
log("MathBot", "  dist([0,0], [0,0]) = 0");
log("MathBot", "  dist([1,1], [4,5]) = 5");
log("MathBot", "Properties: non_negative, commutative");

const distNeed = registry.publishNeed({
  name: "euclidean-distance",
  examples: [
    { input: [[0,0], [3,4]], output: 5 },
    { input: [[0,0], [0,0]], output: 0 },
    { input: [[1,1], [4,5]], output: 5 },
  ],
  properties: ["non_negative", "commutative"],
});

console.log(`\n  Need published: ${distNeed.id}`);

// ─── ACT 2: Two agents offer implementations ────────────────────────

console.log("\n" + DIV);
console.log("\n  ACT 2: GeomBot and ApproxBot each offer an implementation\n");

// GeomBot: correct Euclidean distance
log("GeomBot", "I can do that! sqrt((x2-x1)^2 + (y2-y1)^2)");

const geomOffer = registry.publishOffer(distNeed.id, {
  fn: ([a, b]) => Math.sqrt((b[0]-a[0])**2 + (b[1]-a[1])**2),
  confidence: 0.95,
});

log("GeomBot", `Offer published: ${geomOffer.id}`);

// ApproxBot: Manhattan distance (will FAIL the examples)
log("ApproxBot", "I have a distance function too! |x2-x1| + |y2-y1|");

const approxOffer = registry.publishOffer(distNeed.id, {
  fn: ([a, b]) => Math.abs(b[0]-a[0]) + Math.abs(b[1]-a[1]),
  confidence: 0.8,
});

log("ApproxBot", `Offer published: ${approxOffer.id}`);

// ─── ACT 3: Negotiate — rank and verify ──────────────────────────────

console.log("\n" + DIV);
console.log("\n  ACT 3: Negotiate — rank offers against the need\n");

const ranked = negotiate(distNeed, [geomOffer, approxOffer]);

for (const r of ranked) {
  const agentName = r.id === geomOffer.id ? "GeomBot" : "ApproxBot";
  const passStr = r.verification.pass ? "PASS" : "FAIL";
  log("System", `Rank ${r.rank}: ${agentName} — score ${r.score} — ${passStr}`);

  for (const ex of r.verification.exampleResults) {
    const mark = ex.pass ? "+" : "x";
    log("System", `  [${mark}] dist(${JSON.stringify(ex.input)}) = ${ex.actual} (expected ${ex.expected})`);
  }

  const props = r.verification.propertyResults;
  if (props.satisfied.length > 0) {
    log("System", `  Properties satisfied: ${props.satisfied.join(", ")}`);
  }
  if (props.violated.length > 0) {
    log("System", `  Properties VIOLATED: ${props.violated.join(", ")}`);
  }
  console.log();
}

// ─── ACT 4: Bind the winner, reject the loser ───────────────────────

console.log(DIV);
console.log("\n  ACT 4: Contract binding\n");

// Bind GeomBot (the winner)
const distContract = bind(distNeed, geomOffer);
log("System", `GeomBot bound as contract: ${distContract.id}`);
log("MathBot", "GeomBot's distance function is now mine.");

// Show ApproxBot's failure
log("System", `ApproxBot rejected — examples did not match.`);
log("ApproxBot", "My Manhattan distance didn't match the Euclidean examples...");

// ─── ACT 5: Renegotiation — ApproxBot proposes Manhattan ────────────

console.log("\n" + DIV);
console.log("\n  ACT 5: ApproxBot renegotiates — proposes Manhattan distance\n");

log("ApproxBot", "What about Manhattan distance instead? Let me publish a NEW need.");
log("ApproxBot", "  manhattan([0,0], [3,4]) = 7");
log("ApproxBot", "  manhattan([0,0], [0,0]) = 0");
log("ApproxBot", "  manhattan([1,1], [4,5]) = 7");
log("ApproxBot", "Properties: non_negative, commutative");

const manhattanNeed = registry.publishNeed({
  name: "manhattan-distance",
  examples: [
    { input: [[0,0], [3,4]], output: 7 },
    { input: [[0,0], [0,0]], output: 0 },
    { input: [[1,1], [4,5]], output: 7 },
  ],
  properties: ["non_negative", "commutative"],
});

console.log(`\n  New need published: ${manhattanNeed.id}`);

// MathBot offers an implementation for Manhattan distance
console.log();
log("MathBot", "I can implement Manhattan distance! |x2-x1| + |y2-y1|");

const mathOffer = registry.publishOffer(manhattanNeed.id, {
  fn: ([a, b]) => Math.abs(b[0]-a[0]) + Math.abs(b[1]-a[1]),
  confidence: 0.9,
});

// Verify
log("System", `MathBot verification for Manhattan: ${mathOffer.verification.pass ? "PASS" : "FAIL"}`);
for (const ex of mathOffer.verification.exampleResults) {
  const mark = ex.pass ? "+" : "x";
  log("System", `  [${mark}] manhattan(${JSON.stringify(ex.input)}) = ${ex.actual} (expected ${ex.expected})`);
}

// Bind
const manhattanContract = bind(manhattanNeed, mathOffer);
log("System", `MathBot bound for Manhattan: ${manhattanContract.id}`);
log("ApproxBot", "MathBot's Manhattan implementation is now mine.");

// ─── ACT 6: Composition — normalized distance ───────────────────────

console.log("\n" + DIV);
console.log("\n  ACT 6: Composition — MathBot needs 'normalized distance'\n");

log("MathBot", "Now I need: normalizedDist(p1, p2, maxDist) = dist(p1,p2) / maxDist");
log("MathBot", "This composes the distance contract with a divide contract.");

// Publish a divide need
const divideNeed = registry.publishNeed({
  name: "divide",
  examples: [
    { input: [10, 2],  output: 5 },
    { input: [7, 1],   output: 7 },
    { input: [0, 100], output: 0 },
  ],
  properties: [],
});

// GeomBot offers divide
log("GeomBot", "I can divide! a / b");

const divOffer = registry.publishOffer(divideNeed.id, {
  fn: ([a, b]) => a / b,
  confidence: 1.0,
});

log("System", `Divide verification: ${divOffer.verification.pass ? "PASS" : "FAIL"}`);

const divContract = bind(divideNeed, divOffer);
log("System", `Divide contract bound: ${divContract.id}`);

// Compose: normalized_dist = dist(p1,p2) / max_dist
const euclideanFn = distContract.fn;
const divideFn    = divContract.fn;

const normalizedDist = (p1, p2, maxDist) => divideFn([euclideanFn([p1, p2]), maxDist]);

console.log();
log("MathBot", "Composed contract: normalizedDist(p1, p2, maxDist)");
log("MathBot", "  = divide( euclidean([p1, p2]), maxDist )");
console.log();

const compositionTests = [
  { p1: [0,0], p2: [3,4], max: 10,  expect: 0.5 },
  { p1: [0,0], p2: [0,0], max: 10,  expect: 0   },
  { p1: [0,0], p2: [6,8], max: 10,  expect: 1   },
  { p1: [1,1], p2: [4,5], max: 25,  expect: 0.2 },
];

let compPass = 0;
for (const t of compositionTests) {
  const actual = normalizedDist(t.p1, t.p2, t.max);
  const ok = Math.abs(actual - t.expect) < 1e-9;
  if (ok) compPass++;
  const mark = ok ? "+" : "x";
  log("System", `  [${mark}] normalizedDist(${JSON.stringify(t.p1)}, ${JSON.stringify(t.p2)}, ${t.max}) = ${actual} (expected ${t.expect})`);
}
log("System", `Composition verification: ${compPass}/${compositionTests.length}`);

// ─── ACT 7: Backward compatibility — verify against existing contract

console.log("\n" + DIV);
console.log("\n  ACT 7: Backward compatibility — new implementation, same contract\n");

log("GeomBot", "I optimized my distance function (fast inverse sqrt approximation).");

const optimizedDist = ([a, b]) => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  return Math.sqrt(dx * dx + dy * dy); // same math, "different code"
};

const backwardCheck = verify(distContract, optimizedDist);
log("System", `Backward compatibility: ${backwardCheck.compatible ? "COMPATIBLE" : "BREAKING"}`);
log("System", `  Examples: ${backwardCheck.summary.examplesPassed}/${backwardCheck.summary.examplesTotal}`);
log("System", `  Properties: ${backwardCheck.summary.propertiesSatisfied} satisfied, ${backwardCheck.summary.propertiesViolated} violated`);

// ─── REGISTRY SUMMARY ────────────────────────────────────────────────

console.log("\n" + SEP);
console.log("  CONTRACT REGISTRY SUMMARY");
console.log(SEP);

const allNeeds     = registry.getNeeds();
const boundContracts = [distContract, manhattanContract, divContract];

console.log(`
  Needs published:     ${allNeeds.length}
  Offers received:     ${allNeeds.reduce((n, need) => n + registry.getOffers(need.id).length, 0)}
  Contracts bound:     ${boundContracts.length}

  Euclidean distance:  MathBot <-- GeomBot   [bound]
  Manhattan distance:  ApproxBot <-- MathBot [bound]
  Division:            MathBot <-- GeomBot   [bound]
  Normalized distance: composed from Euclidean + Divide

  The flow:
    1. MathBot publishes a need (examples + properties)
    2. Two agents compete — one passes, one fails
    3. The rejected agent renegotiates with a new contract
    4. Contracts compose into higher-order capabilities
    5. New implementations are verified for backward compatibility

  No source code was inspected.
  No trust was assumed.
  Every binding was earned through verified behavior.
`);
console.log(SEP);
