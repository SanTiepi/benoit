#!/usr/bin/env node
// BENOÎT EVOLUTION — Watch algebra grow as functions are added
//
// Start with 2 functions. Add one at a time. After each addition,
// measure how the algebraic relationships expand.
//
// Run: node demos/evolution.mjs

import { encode, exchange } from "../src/protocol.mjs";
import { optimize } from "../src/optimize.mjs";
import { composeModules } from "../src/compose.mjs";
import { infer } from "../src/infer.mjs";

const SEP = "═══════════════════════════════════════════════════════════";

console.log(SEP);
console.log("  BENOÎT EVOLUTION");
console.log("  Watch algebra grow as functions are added.");
console.log(SEP);

const functions = [
  { name: "add", src: "add a,b -> a + b\nadd(2,3) == 5\nadd(0,7) == 7" },
  { name: "negate", src: "negate x -> 0 - x\nnegate(5) == -5\nnegate(-3) == 3" },
  { name: "square", src: "square x -> x * x\nsquare(3) == 9\nsquare(-4) == 16" },
  { name: "abs", src: "abs x -> Math.abs(x)\nabs(-7) == 7\nabs(3) == 3" },
  { name: "double", src: "double x -> x * 2\ndouble(5) == 10\ndouble(-3) == -6" },
  { name: "halve", src: "halve x -> x / 2\nhalve(10) == 5\nhalve(-4) == -2" },
  { name: "id", src: "id x -> x\nid(42) == 42\nid(-1) == -1" },
];

let currentSource = "";
const history = [];

for (let i = 0; i < functions.length; i++) {
  const fn = functions[i];
  if (currentSource) currentSource += "\n\n";
  currentSource += fn.src;

  // Encode and get stats
  const msg = encode(currentSource);
  const props = msg.meta.propertyCount;
  const surprises = msg.meta.surpriseCount;
  const inverses = msg.algebra.inversePairs.length;
  const eqClasses = msg.algebra.equivalenceClasses.length;

  // Optimize some expressions if we have enough functions
  let optimizations = 0;
  if (i >= 2) {
    const testExprs = [];
    if (i >= 1) testExprs.push("negate(negate(x))");
    if (i >= 2) testExprs.push("square(negate(x))");
    if (i >= 3) testExprs.push("abs(abs(x))");
    if (i >= 4) testExprs.push("add(x, 0)");
    if (i >= 5) testExprs.push("double(halve(x))");

    for (const expr of testExprs) {
      const result = optimize(currentSource + "\n\n" + expr);
      const lastLine = result.optimized.split("\n").pop().trim();
      if (lastLine !== expr) optimizations++;
    }
  }

  history.push({
    step: i + 1,
    added: fn.name,
    functions: i + 1,
    properties: props,
    inverses,
    equivalences: eqClasses,
    surprises,
    optimizations,
  });

  const bar = "█".repeat(Math.min(props, 40));
  console.log(`\n  +${fn.name.padEnd(8)} │ ${(i+1).toString()} fn │ ${props.toString().padStart(2)} props │ ${inverses} inv │ ${optimizations} opts │ ${bar}`);
}

console.log("\n" + SEP);
console.log("  GROWTH CURVE");
console.log(SEP + "\n");

console.log("  Step  Functions  Properties  Inverses  Optimizations");
console.log("  ────  ─────────  ──────────  ────────  ─────────────");
for (const h of history) {
  console.log(`  ${h.step.toString().padStart(4)}  ${h.functions.toString().padStart(9)}  ${h.properties.toString().padStart(10)}  ${h.inverses.toString().padStart(8)}  ${h.optimizations.toString().padStart(13)}`);
}

const first = history[0];
const last = history[history.length - 1];
console.log(`\n  Properties grew ${Math.round(last.properties / Math.max(first.properties, 1))}x`);
console.log(`  From ${first.functions} to ${last.functions} functions`);
console.log(`  Algebra is superlinear — relationships multiply faster than functions.`);
console.log("\n" + SEP);
