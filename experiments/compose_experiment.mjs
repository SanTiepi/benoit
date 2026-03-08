// EXPERIMENT: Module Composition
//
// Two agents each have their own module. A third agent composes them
// and discovers cross-module relationships that neither agent knew about.

import { composeModules } from "../src/compose.mjs";

console.log("═══════════════════════════════════════════════════════════");
console.log("  MODULE COMPOSITION EXPERIMENT");
console.log("  Discovering relationships across module boundaries.");
console.log("═══════════════════════════════════════════════════════════\n");

const agentA_module = `add a,b -> a + b

negate x -> 0 - x

double x -> x * 2

square x -> x * x`;

const agentB_module = `sub a,b -> a - b

halve x -> x / 2

flip x -> 0 - x

abs x -> Math.abs(x)`;

console.log("Agent A's module:");
console.log(agentA_module.split("\n").map(l => "  " + l).join("\n"));
console.log("\nAgent B's module:");
console.log(agentB_module.split("\n").map(l => "  " + l).join("\n"));

console.log("\n═══════════════════════════════════════════════════════════");
console.log("  COMPOSING...");
console.log("═══════════════════════════════════════════════════════════\n");

const result = composeModules(agentA_module, agentB_module);

console.log(`  Total functions: ${result.stats.totalFunctions}`);
console.log(`  Unified registry: ${result.unified.length} unique behaviors`);

console.log("\n─── Cross-Module Equivalences ───\n");
if (result.crossModule.equivalences.length === 0) {
  console.log("  (none found)");
} else {
  for (const eq of result.crossModule.equivalences) {
    console.log(`  ${eq.functionA} (module ${eq.moduleA}) ≡ ${eq.functionB} (module ${eq.moduleB})`);
  }
}

console.log("\n─── Cross-Module Inverse Pairs ───\n");
if (result.crossModule.inverses.length === 0) {
  console.log("  (none found)");
} else {
  for (const inv of result.crossModule.inverses) {
    console.log(`  ${inv.f} (module ${inv.moduleF}) ↔ ${inv.g} (module ${inv.moduleG})`);
  }
}

console.log("\n─── Cross-Module Compositions ───\n");
if (result.crossModule.compositions.length === 0) {
  console.log("  (none found)");
} else {
  for (const comp of result.crossModule.compositions) {
    console.log(`  ${comp.f}∘${comp.g}: ${comp.properties.join(", ")}`);
    console.log(`    (module ${comp.moduleF} × module ${comp.moduleG})`);
  }
}

console.log("\n═══════════════════════════════════════════════════════════");
console.log("  RESULTS");
console.log("═══════════════════════════════════════════════════════════");
console.log(`  Equivalences discovered: ${result.stats.crossEquivalences}`);
console.log(`  Inverse pairs discovered: ${result.stats.crossInverses}`);
console.log(`  Composition properties: ${result.stats.crossCompositions}`);
console.log();
console.log("  Neither agent knew about these relationships.");
console.log("  They emerged from composing two independent modules.");
console.log("═══════════════════════════════════════════════════════════");
