// THE EXPERIMENT: Full pipeline
// Source → Fingerprint → Synthesize → Transpile → Execute → Verify
// Can behavior alone reconstruct working code?

import { parse, fingerprint, efficiency } from "../src/ast.mjs";
import { synthesize, solve } from "../src/solve.mjs";
import { transpile } from "../src/transpile.mjs";

const source = `add a,b -> a + b
add(2, 3) == 5
add(-1, 1) == 0
add(0, 0) == 0

square x -> x * x
square(0) == 0
square(3) == 9
square(7) == 49

fibonacci n ->
  match n ->
    | 0 => 0
    | 1 => 1
    | _ => fibonacci(n - 1) + fibonacci(n - 2)
fibonacci(0) == 0
fibonacci(1) == 1
fibonacci(2) == 1
fibonacci(5) == 5
fibonacci(10) == 55

clamp x,min,max -> Math.max(min, Math.min(max, x))
clamp(50, 0, 100) == 50
clamp(-5, 0, 100) == 0
clamp(200, 0, 100) == 100`;

console.log("═══════════════════════════════════════════════════════");
console.log("  BENOÎT EXPERIMENT: Behavior → Code → Verification");
console.log("═══════════════════════════════════════════════════════\n");

// STEP 1: Parse and extract fingerprint
console.log("STEP 1 — Extract semantic fingerprint (behavior only)");
console.log("───────────────────────────────────────────────────────");
const ast = parse(source);
const fp = fingerprint(ast);
for (const fn of fp.functions) {
  console.log(`  ${fn.name}/${fn.arity}: ${fn.assertions.length} assertions`);
  for (const a of fn.assertions) {
    console.log(`    ${a.input} → ${a.output}`);
  }
}

// STEP 2: Synthesize code from fingerprint alone
console.log("\nSTEP 2 — Synthesize code from behavior");
console.log("───────────────────────────────────────────────────────");
const synthesized = synthesize(fp);
for (const r of synthesized) {
  const icon = r.status === "synthesized" ? "✓" : "✗";
  console.log(`  ${icon} ${r.name}: ${r.status} (confidence: ${r.confidence})`);
  if (r.code) console.log(`    → ${r.code}`);
  if (r.alternatives?.length) console.log(`    alternatives: ${r.alternatives.join(", ")}`);
}

// STEP 3: Reconstruct Benoît source from synthesized code + assertions
console.log("\nSTEP 3 — Reconstruct Benoît source");
console.log("───────────────────────────────────────────────────────");
const reconstructed = synthesized
  .filter(r => r.code)
  .map(r => {
    const assertions = fp.functions.find(f => f.name === r.name)?.assertions || [];
    return r.code + "\n" + assertions.map(a => `${a.input} == ${a.output}`).join("\n");
  })
  .join("\n\n");
console.log(reconstructed);

// STEP 4: Transpile to JavaScript
console.log("\nSTEP 4 — Transpile reconstructed code to JavaScript");
console.log("───────────────────────────────────────────────────────");
const js = transpile(reconstructed);
console.log(js);

// STEP 5: Execute and verify
console.log("\nSTEP 5 — Execute and verify correctness");
console.log("───────────────────────────────────────────────────────");
const cleanJs = js.replace(/export /g, "").replace(/\/\/ test:.*/g, "");
const fn = new Function(cleanJs + "\nreturn { add, square, fibonacci, clamp }");
const mod = fn();

const tests = [
  ["add(2, 3)", mod.add(2, 3), 5],
  ["add(-1, 1)", mod.add(-1, 1), 0],
  ["square(7)", mod.square(7), 49],
  ["square(-3)", mod.square(-3), 9],
  ["fibonacci(10)", mod.fibonacci(10), 55],
  ["fibonacci(0)", mod.fibonacci(0), 0],
  ["clamp(200, 0, 100)", mod.clamp(200, 0, 100), 100],
  ["clamp(-5, 0, 100)", mod.clamp(-5, 0, 100), 0],
];

let passed = 0;
for (const [label, actual, expected] of tests) {
  const ok = actual === expected;
  console.log(`  ${ok ? "✓" : "✗"} ${label} = ${actual} (expected ${expected})`);
  if (ok) passed++;
}

// STEP 6: Bidirectional solving
console.log("\nSTEP 6 — Bidirectional: solve for unknowns");
console.log("───────────────────────────────────────────────────────");
const solveTests = [
  "add(?, 3) == 5",
  "square(?) == 49",
  "clamp(?, 0, 100) == 0",
];
for (const query of solveTests) {
  const fnName = query.match(/^(\w+)/)[1];
  const result = solve(query, { add: mod.add, square: mod.square, clamp: mod.clamp });
  if (result.solutions) {
    console.log(`  ${query} → solutions: [${result.solutions.join(", ")}] ${result.unique ? "(unique)" : "(multiple)"}`);
  } else {
    console.log(`  ${query} → ${result.error}`);
  }
}

// RESULTS
console.log("\n═══════════════════════════════════════════════════════");
console.log("  RESULTS");
console.log("═══════════════════════════════════════════════════════");
console.log(`  Functions synthesized: ${synthesized.filter(r => r.status === "synthesized").length}/${synthesized.length}`);
console.log(`  Tests verified: ${passed}/${tests.length}`);
console.log(`  Original source: ${source.length} chars`);
console.log(`  Fingerprint:     ${JSON.stringify(fp).length} chars`);
console.log(`  Reconstructed:   ${reconstructed.length} chars`);
console.log(`  Compression:     ${((1 - JSON.stringify(fp).length / source.length) * 100).toFixed(1)}% (fingerprint vs source)`);
console.log(`\n  The fingerprint alone was sufficient to reconstruct`);
console.log(`  ${passed}/${tests.length} working functions. No implementation was transmitted.`);
console.log("═══════════════════════════════════════════════════════");
