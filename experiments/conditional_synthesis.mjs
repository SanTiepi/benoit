// EXPERIMENT: Can we synthesize CONDITIONAL functions?
//
// The solver currently tries: identity, linear, quadratic, fibonacci...
// But collatz_step is: x % 2 == 0 ? x/2 : 3x+1
// It has TWO behaviors depending on a condition.
//
// Strategy:
//   1. Partition the input/output pairs by a condition
//   2. Fit each partition separately
//   3. If both partitions fit cleanly → we found a conditional function
//
// Conditions to try: x%2==0 (even/odd), x>0, x<0, x==0, x%3==0

import { transpile } from "../src/transpile.mjs";

console.log("═══════════════════════════════════════════════════════════");
console.log("  CONDITIONAL SYNTHESIS EXPERIMENT");
console.log("  Can we discover branching behavior from examples?");
console.log("═══════════════════════════════════════════════════════════\n");

// Conditions to try
const CONDITIONS = [
  { name: "x % 2 == 0", test: x => x % 2 === 0, ben: "x % 2 == 0" },
  { name: "x > 0", test: x => x > 0, ben: "x > 0" },
  { name: "x < 0", test: x => x < 0, ben: "x < 0" },
  { name: "x >= 0", test: x => x >= 0, ben: "x >= 0" },
  { name: "x == 0", test: x => x === 0, ben: "x == 0" },
];

// Simple formula fitters for each branch
function fitLinear(pairs) {
  if (pairs.length < 2) return null;
  const [p1, p2] = pairs;
  if (p1.x === p2.x) return null;
  const a = (p2.y - p1.y) / (p2.x - p1.x);
  const b = p1.y - a * p1.x;
  const fits = pairs.every(p => Math.abs(a * p.x + b - p.y) < 0.001);
  if (!fits) return null;
  if (Math.abs(b) < 0.001) return { formula: a === 1 ? "x" : `${a} * x`, a, b: 0 };
  if (Math.abs(a) < 0.001) return { formula: `${b}`, a: 0, b };
  return { formula: `${a} * x + ${b}`, a, b };
}

function fitQuadratic(pairs) {
  if (pairs.length < 3) return null;
  const [p1, p2, p3] = pairs;
  const denom = (p1.x - p2.x) * (p1.x - p3.x) * (p2.x - p3.x);
  if (Math.abs(denom) < 0.001) return null;
  const a = (p3.x * (p2.y - p1.y) + p2.x * (p1.y - p3.y) + p1.x * (p3.y - p2.y)) / denom;
  const b = (p3.x**2 * (p1.y - p2.y) + p2.x**2 * (p3.y - p1.y) + p1.x**2 * (p2.y - p3.y)) / denom;
  const c = (p2.x*p3.x*(p2.x-p3.x)*p1.y + p3.x*p1.x*(p3.x-p1.x)*p2.y + p1.x*p2.x*(p1.x-p2.x)*p3.y) / denom;
  const fits = pairs.every(p => Math.abs(a * p.x**2 + b * p.x + c - p.y) < 0.001);
  if (!fits) return null;
  let formula = "";
  if (Math.abs(a - 1) < 0.001) formula = "x * x";
  else if (Math.abs(a) > 0.001) formula = `${a} * x * x`;
  if (Math.abs(b) > 0.001) formula += (b > 0 ? " + " : " - ") + `${Math.abs(b)} * x`;
  if (Math.abs(c) > 0.001) formula += (c > 0 ? " + " : " - ") + `${Math.abs(c)}`;
  return formula ? { formula: formula.replace(/^\s*[+-]\s*/, ""), a, b, c } : null;
}

function fitDivision(pairs) {
  // f(x) = x / k
  for (const k of [2, 3, 4, 5, 10]) {
    if (pairs.every(p => Math.abs(p.x / k - p.y) < 0.001)) {
      return { formula: `x / ${k}` };
    }
  }
  return null;
}

function bestFit(pairs) {
  return fitLinear(pairs) || fitDivision(pairs) || fitQuadratic(pairs);
}

// Test functions
const testCases = [
  {
    name: "collatz_step",
    pairs: [
      { x: 6, y: 3 }, { x: 3, y: 10 }, { x: 1, y: 4 },
      { x: 16, y: 8 }, { x: 10, y: 5 }, { x: 5, y: 16 },
      { x: 2, y: 1 }, { x: 4, y: 2 }, { x: 7, y: 22 },
      { x: 8, y: 4 }, { x: 12, y: 6 }, { x: 9, y: 28 }
    ]
  },
  {
    name: "relu",
    pairs: [
      { x: 5, y: 5 }, { x: -5, y: 0 }, { x: 0, y: 0 },
      { x: 3, y: 3 }, { x: -3, y: 0 }, { x: 10, y: 10 },
      { x: -10, y: 0 }, { x: 1, y: 1 }, { x: -1, y: 0 }
    ]
  },
  {
    name: "abs",
    pairs: [
      { x: 5, y: 5 }, { x: -5, y: 5 }, { x: 0, y: 0 },
      { x: 3, y: 3 }, { x: -3, y: 3 }, { x: 10, y: 10 },
      { x: -10, y: 10 }
    ]
  },
  {
    name: "step_function",
    pairs: [
      { x: -5, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 },
      { x: 1, y: 1 }, { x: 5, y: 1 }, { x: 10, y: 1 },
      { x: -10, y: 0 }
    ]
  }
];

let totalSynthesized = 0;

for (const tc of testCases) {
  console.log(`▸ ${tc.name}:`);
  console.log(`  Pairs: ${tc.pairs.map(p => `f(${p.x})=${p.y}`).join(", ")}`);

  let found = false;

  for (const cond of CONDITIONS) {
    const trueBranch = tc.pairs.filter(p => cond.test(p.x));
    const falseBranch = tc.pairs.filter(p => !cond.test(p.x));

    if (trueBranch.length < 2 || falseBranch.length < 2) continue;

    const trueFit = bestFit(trueBranch);
    const falseFit = bestFit(falseBranch);

    if (trueFit && falseFit) {
      console.log(`  ✓ Found conditional split: ${cond.name}`);
      console.log(`    When ${cond.name}: ${trueFit.formula}`);
      console.log(`    Otherwise: ${falseFit.formula}`);

      // Build Benoît code
      const benCode = `${tc.name} x ->\n  ${cond.ben}? -> ${trueFit.formula}\n  else? -> ${falseFit.formula}`;
      console.log(`\n  Generated Benoît code:`);
      console.log(`    ${benCode.split("\n").join("\n    ")}`);

      // Verify
      try {
        const js = transpile(benCode).replace(/export /g, "");
        const fn = new Function(js + `\nreturn { ${tc.name} }`)()[tc.name];
        let correct = 0;
        for (const p of tc.pairs) {
          const result = fn(p.x);
          if (Math.abs(result - p.y) < 0.001) correct++;
        }
        console.log(`\n  Verification: ${correct}/${tc.pairs.length} correct`);
        if (correct === tc.pairs.length) {
          console.log(`  ✓ PERFECT — All pairs verified!`);
          totalSynthesized++;
        }
      } catch (e) {
        console.log(`  ✗ Transpile/execution error: ${e.message}`);
      }

      found = true;
      break;
    }
  }

  if (!found) {
    console.log(`  ✗ No clean conditional split found`);
  }
  console.log();
}

console.log("═══════════════════════════════════════════════════════════");
console.log("  CONDITIONAL SYNTHESIS RESULTS");
console.log("═══════════════════════════════════════════════════════════");
console.log(`  Functions tested: ${testCases.length}`);
console.log(`  Successfully synthesized: ${totalSynthesized}/${testCases.length}`);
console.log();
if (totalSynthesized > 0) {
  console.log("  The solver can now discover BRANCHING behavior!");
  console.log("  From examples alone, it finds the condition and fits each branch.");
}
console.log("═══════════════════════════════════════════════════════════");
