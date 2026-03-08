// EXPERIMENT: Self-Optimizing Code
//
// Benoît discovers properties, then uses them to optimize expressions.
// No human wrote these optimization rules — they emerge from the algebra.

import { optimize } from "../src/optimize.mjs";

console.log("═══════════════════════════════════════════════════════════");
console.log("  SELF-OPTIMIZATION EXPERIMENT");
console.log("  Code that optimizes itself using its own discoveries.");
console.log("═══════════════════════════════════════════════════════════\n");

const source = `add a,b -> a + b

mul a,b -> a * b

square x -> x * x

negate x -> 0 - x

abs x -> Math.abs(x)

double x -> x * 2

halve x -> x / 2

-- Now use these functions in expressions:
-- (These are the lines that should get optimized)

add(x, 0)
add(0, y)
mul(anything, 0)
mul(0, something)
negate(negate(x))
square(negate(x))
abs(negate(x))
double(halve(x))
halve(double(x))
abs(abs(x))
add(3, 5)
mul(4, 7)
square(6)
negate(10)`;

console.log("Original code:");
console.log(source.split("\n").filter(l => l.trim() && !l.startsWith("--")).map(l => "  " + l).join("\n"));
console.log();

const result = optimize(source);

console.log("Optimized code:");
console.log(result.optimized.split("\n").filter(l => l.trim() && !l.startsWith("--")).map(l => "  " + l).join("\n"));
console.log();

console.log("═══════════════════════════════════════════════════════════");
console.log("  OPTIMIZATION REPORT");
console.log("═══════════════════════════════════════════════════════════\n");

for (const r of result.report) {
  console.log(`  ${r.type}:`);
  console.log(`    ${r.from} → ${r.to}`);
  console.log(`    Rule: ${r.rule || "(constant folding)"}`);
  console.log();
}

console.log("─────────────────────────────────────────────────────────");
console.log(`  Total optimizations: ${result.stats.optimizations}`);
for (const [type, count] of Object.entries(result.stats.byType)) {
  console.log(`    ${type}: ${count}`);
}
console.log();
console.log("  Every optimization was derived from automatically");
console.log("  discovered algebraic properties. No human rules.");
console.log("═══════════════════════════════════════════════════════════");
