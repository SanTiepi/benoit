// EXPERIMENT: Hybrid Protocol
//
// For each function, choose the most efficient representation:
//   1. If synthesizable → send assertions only (minimum bandwidth)
//   2. If conditionally synthesizable → send assertions (needs more examples)
//   3. If unsynthesizable → send compact Benoît source (fallback)
//
// The protocol ADAPTS its representation per function.
// It's not one-size-fits-all — it's the minimum information needed.

import { synthesize } from "../src/solve.mjs";
import { infer } from "../src/infer.mjs";
import { transpile } from "../src/transpile.mjs";
import { fingerprint, parse } from "../src/ast.mjs";

console.log("═══════════════════════════════════════════════════════════");
console.log("  HYBRID PROTOCOL EXPERIMENT");
console.log("  Minimum information per function.");
console.log("═══════════════════════════════════════════════════════════\n");

const moduleSource = `add a,b -> a + b
add(2, 3) == 5
add(-1, 1) == 0
add(0, 42) == 42

square x -> x * x
square(0) == 0
square(3) == 9
square(-5) == 25

negate x -> 0 - x
negate(5) == -5
negate(-3) == 3
negate(0) == 0

collatz x ->
  x % 2 == 0? -> x / 2
  else? -> 3 * x + 1
collatz(6) == 3
collatz(3) == 10
collatz(1) == 4
collatz(16) == 8
collatz(7) == 22
collatz(10) == 5

gcd a,b ->
  b == 0? -> a
  else? -> gcd(b, a % b)
gcd(12, 8) == 4
gcd(7, 3) == 1
gcd(100, 25) == 25
gcd(48, 18) == 6`;

// Step 1: Parse and get fingerprint
const ast = parse(moduleSource);
const fp = fingerprint(ast);

// Step 2: For each function, try synthesis from assertions
console.log("Step 1 — Classify each function:\n");

const hybridMessage = {
  protocol: "benoit-hybrid-v1",
  functions: []
};

let totalAssertionOnly = 0;
let totalCodeFallback = 0;

for (const fn of fp.functions) {
  // Try synthesis
  const result = synthesize({ functions: [fn] });
  const r = result[0];

  let representation;
  if (r?.status === "synthesized" && r.code) {
    // Verify the synthesis
    try {
      const js = transpile(r.code).replace(/export /g, "");
      const mod = new Function(js + `\nreturn { ${fn.name} }`)();

      // Verify all assertions
      let allOk = true;
      for (const a of fn.assertions) {
        const val = new Function(fn.name, `return ${a.input}`)(mod[fn.name]);
        if (val !== Number(a.output)) { allOk = false; break; }
      }

      if (allOk) {
        representation = "assertions";
        totalAssertionOnly++;
      } else {
        representation = "code";
        totalCodeFallback++;
      }
    } catch {
      representation = "code";
      totalCodeFallback++;
    }
  } else {
    representation = "code";
    totalCodeFallback++;
  }

  // Get individual properties
  const funcDef = moduleSource.split("\n\n")
    .find(block => block.trim().startsWith(fn.name + " "));
  const defLine = funcDef?.split("\n").find(l => l.match(new RegExp(`^${fn.name}\\s`)));
  let properties = [];
  if (defLine) {
    try { properties = infer(defLine).properties.map(p => p.type); } catch {}
  }

  const icon = representation === "assertions" ? "→ assertions" : "→ CODE";
  console.log(`  ${fn.name}: ${icon} (${fn.assertions.length} assertions, ${properties.length} properties)`);

  if (representation === "assertions") {
    hybridMessage.functions.push({
      name: fn.name,
      arity: fn.arity,
      mode: "behavioral",
      assertions: fn.assertions,
      properties
    });
  } else {
    // Extract the Benoît source for this function (without assertions)
    const block = moduleSource.split("\n\n").find(b => b.trim().startsWith(fn.name + " "));
    const sourceLines = block ? block.split("\n").filter(l => !l.match(/^\w+\(.*\)\s*==/)) : [];
    const compactSource = sourceLines.join("\n").trim();

    hybridMessage.functions.push({
      name: fn.name,
      arity: fn.arity,
      mode: "source",
      source: compactSource,
      assertions: fn.assertions,
      properties
    });
  }
}

// Step 3: Measure message efficiency
const messageJSON = JSON.stringify(hybridMessage);

console.log("\n═══════════════════════════════════════════════════════════");
console.log("  HYBRID MESSAGE");
console.log("═══════════════════════════════════════════════════════════\n");
console.log(`  Message size:    ${messageJSON.length} chars`);
console.log(`  Source size:     ${moduleSource.length} chars`);
console.log(`  Compression:     ${Math.round((1 - messageJSON.length / moduleSource.length) * 100)}%`);
console.log();
console.log(`  Behavioral (assertions only): ${totalAssertionOnly} functions`);
console.log(`  Code fallback:                ${totalCodeFallback} functions`);
console.log(`  Total:                        ${hybridMessage.functions.length} functions`);

// Step 4: Receiver reconstructs
console.log("\n═══════════════════════════════════════════════════════════");
console.log("  RECEIVER RECONSTRUCTION");
console.log("═══════════════════════════════════════════════════════════\n");

const received = JSON.parse(messageJSON);
let verifyOk = 0, verifyTotal = 0;

for (const fn of received.functions) {
  let code;

  if (fn.mode === "behavioral") {
    // Synthesize from assertions
    const r = synthesize({ functions: [fn] })[0];
    code = r?.code;
    console.log(`  ${fn.name}: synthesized → ${code || "FAILED"}`);
  } else {
    // Use transmitted source directly
    code = fn.source;
    console.log(`  ${fn.name}: used transmitted code → ${code.split("\n")[0]}`);
  }

  // Verify
  if (code) {
    try {
      const js = transpile(code).replace(/export /g, "");
      const mod = new Function(js + `\nreturn { ${fn.name} }`)();

      for (const a of fn.assertions) {
        verifyTotal++;
        try {
          const val = new Function(fn.name, `return ${a.input}`)(mod[fn.name]);
          if (val === Number(a.output)) verifyOk++;
        } catch {}
      }
    } catch (e) {
      verifyTotal += fn.assertions.length;
      console.log(`    ✗ Error: ${e.message}`);
    }
  }
}

console.log(`\n  Verification: ${verifyOk}/${verifyTotal}`);

console.log("\n═══════════════════════════════════════════════════════════");
console.log("  HYBRID PROTOCOL — CONCLUSION");
console.log("═══════════════════════════════════════════════════════════\n");
console.log(`  ${totalAssertionOnly} functions transmitted as BEHAVIOR (zero code)`);
console.log(`  ${totalCodeFallback} functions transmitted as CODE (compact Benoît)`);
console.log(`  ${verifyOk}/${verifyTotal} assertions verified`);
console.log();
console.log("  The protocol adapts: behavior when possible, code when necessary.");
console.log("  Even 'code fallback' uses compact Benoît — not verbose JavaScript.");
console.log("  This is the pragmatic middle ground.");
console.log("═══════════════════════════════════════════════════════════");
