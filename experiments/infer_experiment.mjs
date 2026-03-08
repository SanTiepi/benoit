// EXPERIMENT: Can Benoît discover properties of its own functions?
// No human-written tests. The language finds its own truths.

import { infer } from "../src/infer.mjs";

const experiments = [
  {
    name: "Addition",
    src: "add a,b -> a + b"
  },
  {
    name: "Multiplication",
    src: "mul a,b -> a * b"
  },
  {
    name: "Square",
    src: "square x -> x * x"
  },
  {
    name: "Absolute value",
    src: "abs x -> Math.abs(x)"
  },
  {
    name: "Negate",
    src: "negate x -> 0 - x"
  },
  {
    name: "Double",
    src: "double x -> x * 2"
  },
  {
    name: "Max",
    src: "max a,b -> Math.max(a, b)"
  },
  {
    name: "Min",
    src: "min a,b -> Math.min(a, b)"
  },
  {
    name: "Clamp",
    src: "clamp x,min,max -> Math.max(min, Math.min(max, x))"
  },
  {
    name: "Identity",
    src: "id x -> x"
  }
];

console.log("═══════════════════════════════════════════════════════════");
console.log("  BENOÎT EXPERIMENT: Automatic Property Discovery");
console.log("  Can the language discover truths about its own functions?");
console.log("═══════════════════════════════════════════════════════════\n");

let totalProps = 0;
let totalAssertions = 0;

for (const exp of experiments) {
  console.log(`▸ ${exp.name}: ${exp.src}`);
  try {
    const result = infer(exp.src);

    if (result.properties.length === 0) {
      console.log("  (no properties discovered)\n");
      continue;
    }

    for (const prop of result.properties) {
      console.log(`  ✓ ${prop.description} [confidence: ${prop.confidence}]`);
      if (prop.examples) {
        for (const ex of prop.examples.slice(0, 2)) {
          console.log(`    ${ex}`);
        }
      }
      totalProps++;
    }

    if (result.assertions.length > 0) {
      console.log(`  → ${result.assertions.length} auto-generated assertions`);
      totalAssertions += result.assertions.length;
    }
    console.log();
  } catch (e) {
    console.log(`  ✗ Error: ${e.message}\n`);
  }
}

console.log("═══════════════════════════════════════════════════════════");
console.log(`  RESULTS: ${totalProps} properties discovered, ${totalAssertions} assertions generated`);
console.log("  No human wrote these tests. The code discovered them.");
console.log("═══════════════════════════════════════════════════════════");
