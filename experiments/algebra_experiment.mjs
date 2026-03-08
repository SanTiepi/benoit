// EXPERIMENT: Can Benoît discover relationships BETWEEN functions?
//
// Not just "add is commutative" — but:
//   - "negate is its own inverse"
//   - "abs absorbs negate: abs(negate(x)) == abs(x)"
//   - "square(negate(x)) == square(x) — predicted from even symmetry"
//   - "double and halve are inverses"
//   - Three different ways to write abs() are equivalent
//
// This is function algebra. No language does this.

import { equivalent, inverse, composeAnalysis, equivalenceClasses, algebraReport } from "../src/algebra.mjs";

console.log("═══════════════════════════════════════════════════════════");
console.log("  BENOÎT EXPERIMENT: Function Algebra");
console.log("  Can the language discover relationships between functions?");
console.log("═══════════════════════════════════════════════════════════\n");

// ─── 1. EQUIVALENCE ──────────────────────────────────────────────

console.log("┌─────────────────────────────────────────────────────────┐");
console.log("│  EQUIVALENCE: Same behavior, different implementations │");
console.log("└─────────────────────────────────────────────────────────┘\n");

const tests = [
  {
    name: "Two ways to double",
    a: "double x -> x * 2",
    b: "twice x -> x + x"
  },
  {
    name: "Two ways to square",
    a: "sq1 x -> x * x",
    b: "sq2 x -> Math.pow(x, 2)"
  },
  {
    name: "Not equivalent (add vs mul)",
    a: "add a,b -> a + b",
    b: "mul a,b -> a * b"
  },
  {
    name: "Absolute value — three ways",
    a: "abs1 x -> Math.abs(x)",
    b: "abs2 x -> Math.sqrt(x * x)"
  }
];

for (const t of tests) {
  const r = equivalent(t.a, t.b);
  const icon = r.equivalent ? "✓" : "✗";
  console.log(`  ${icon} ${t.name}`);
  console.log(`    ${t.a}  vs  ${t.b}`);
  console.log(`    → ${r.equivalent ? "EQUIVALENT" : "DIFFERENT"} (${r.samplesChecked} samples)`);
  if (r.mismatches.length > 0) {
    console.log(`    counterexample: f(${r.mismatches[0].input}) = ${r.mismatches[0].outputA} vs ${r.mismatches[0].outputB}`);
  }
  console.log();
}

// ─── 2. INVERSE RELATIONSHIPS ────────────────────────────────────

console.log("┌─────────────────────────────────────────────────────────┐");
console.log("│  INVERSES: f(g(x)) == x                                │");
console.log("└─────────────────────────────────────────────────────────┘\n");

const inversePairs = [
  { a: "negate x -> 0 - x", b: "negate2 x -> 0 - x", desc: "negate is self-inverse" },
  { a: "double x -> x * 2", b: "halve x -> x / 2", desc: "double / halve" },
  { a: "inc x -> x + 1", b: "dec x -> x - 1", desc: "increment / decrement" },
  { a: "square x -> x * x", b: "sqrt x -> Math.sqrt(x)", desc: "square / sqrt (partial)" }
];

for (const pair of inversePairs) {
  const r = inverse(pair.a, pair.b);
  console.log(`  ${pair.desc}:`);
  console.log(`    f(g(x)) == x ? ${r.leftInverse ? "✓ YES" : "✗ NO"}`);
  console.log(`    g(f(x)) == x ? ${r.rightInverse ? "✓ YES" : "✗ NO"}`);
  if (r.inverse) console.log(`    → FULL INVERSE`);
  else if (r.leftInverse || r.rightInverse) console.log(`    → PARTIAL INVERSE`);
  if (r.evidence?.length > 0) console.log(`    evidence: ${r.evidence[0]}`);
  console.log();
}

// ─── 3. COMPOSITION ANALYSIS ─────────────────────────────────────

console.log("┌─────────────────────────────────────────────────────────┐");
console.log("│  COMPOSITION: Properties of f∘g from f and g           │");
console.log("└─────────────────────────────────────────────────────────┘\n");

const compositions = [
  { f: "square x -> x * x", g: "negate x -> 0 - x", desc: "square ∘ negate" },
  { f: "abs x -> Math.abs(x)", g: "negate x -> 0 - x", desc: "abs ∘ negate" },
  { f: "square x -> x * x", g: "abs x -> Math.abs(x)", desc: "square ∘ abs" },
  { f: "double x -> x * 2", g: "square x -> x * x", desc: "double ∘ square" },
  { f: "negate x -> 0 - x", g: "negate2 x -> 0 - x", desc: "negate ∘ negate (= id?)" }
];

let totalPredicted = 0, totalEmergent = 0;

for (const c of compositions) {
  const r = composeAnalysis(c.f, c.g);
  console.log(`  ${c.desc}:`);
  console.log(`    ${r.nameF} props: [${r.propsF.join(", ")}]`);
  console.log(`    ${r.nameG} props: [${r.propsG.join(", ")}]`);
  if (r.composedProps.length === 0) {
    console.log(`    → No special composition properties found`);
  } else {
    for (const p of r.composedProps) {
      console.log(`    ✓ ${p.description}`);
      if (p.predicted) console.log(`      ${p.predicted}`);
      if (p.evidence) console.log(`      evidence: ${p.evidence[0]}`);
    }
  }
  totalPredicted += r.predictions || 0;
  totalEmergent += r.emergent || 0;
  console.log();
}

// ─── 4. EQUIVALENCE CLASSES ──────────────────────────────────────

console.log("┌─────────────────────────────────────────────────────────┐");
console.log("│  EQUIVALENCE CLASSES: Group functions by behavior      │");
console.log("└─────────────────────────────────────────────────────────┘\n");

const allFunctions = [
  "double x -> x * 2",
  "twice x -> x + x",
  "twoX x -> 2 * x",
  "square x -> x * x",
  "sq x -> Math.pow(x, 2)",
  "negate x -> 0 - x",
  "flip x -> -1 * x",
  "id x -> x",
  "self x -> x + 0",
  "abs x -> Math.abs(x)"
];

const classes = equivalenceClasses(allFunctions);

console.log(`  ${classes.totalFunctions} functions → ${classes.uniqueBehaviors} unique behaviors (${classes.redundant} redundant)\n`);

for (const cls of classes.classes) {
  if (cls.size > 1) {
    console.log(`  Class [${cls.members.join(", ")}]  (${cls.size} equivalent implementations)`);
  } else {
    console.log(`  Class [${cls.members[0]}]  (unique)`);
  }
}

// ─── RESULTS ─────────────────────────────────────────────────────

console.log("\n═══════════════════════════════════════════════════════════");
console.log("  FUNCTION ALGEBRA RESULTS");
console.log("═══════════════════════════════════════════════════════════");
console.log(`  Equivalence tests:   ${tests.length}`);
console.log(`  Inverse pairs found: ${inversePairs.filter((_, i) => {
  const r = inverse(inversePairs[i].a, inversePairs[i].b);
  return r.inverse || r.leftInverse || r.rightInverse;
}).length}/${inversePairs.length}`);
console.log(`  Composition props:   ${totalPredicted} predicted + ${totalEmergent} emergent`);
console.log(`  Equivalence classes: ${classes.uniqueBehaviors} unique from ${classes.totalFunctions} functions`);
console.log();
console.log("  The language doesn't just understand each function.");
console.log("  It understands how they relate to each other.");
console.log("═══════════════════════════════════════════════════════════");
