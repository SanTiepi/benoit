// EXPERIMENT: Where does the protocol break?
//
// Test with functions the solver has NEVER seen.
// Measure: what percentage of functions can be communicated
// via behavior alone, and what happens when synthesis fails?

import { exchange } from "../src/protocol.mjs";
import { synthesize } from "../src/solve.mjs";
import { fingerprint, parse } from "../src/ast.mjs";

console.log("═══════════════════════════════════════════════════════════");
console.log("  LIMITS EXPERIMENT: Where does the protocol break?");
console.log("═══════════════════════════════════════════════════════════\n");

// Category 1: Functions the solver knows (should work)
const known = [
  { name: "add", src: "add a,b -> a + b\nadd(2,3)==5\nadd(-1,1)==0\nadd(0,42)==42" },
  { name: "square", src: "square x -> x * x\nsquare(0)==0\nsquare(3)==9\nsquare(-5)==25" },
  { name: "negate", src: "negate x -> 0 - x\nnegate(5)==-5\nnegate(-3)==3\nnegate(0)==0" },
  { name: "abs", src: "abs x -> Math.abs(x)\nabs(5)==5\nabs(-5)==5\nabs(0)==0" },
  { name: "fib", src: "fib n -> match n -> | 0 => 0 | 1 => 1 | _ => fib(n-1) + fib(n-2)\nfib(0)==0\nfib(1)==1\nfib(5)==5\nfib(10)==55" },
];

// Category 2: Functions the solver should handle but are edge cases
const edgeCases = [
  { name: "zero", src: "zero x -> 0\nzero(1)==0\nzero(42)==0\nzero(-5)==0" },
  { name: "inc", src: "inc x -> x + 1\ninc(0)==1\ninc(-1)==0\ninc(41)==42" },
  { name: "triple", src: "triple x -> x * 3\ntriple(0)==0\ntriple(1)==3\ntriple(-2)==-6" },
  { name: "cube", src: "cube x -> x * x * x\ncube(0)==0\ncube(2)==8\ncube(3)==27\ncube(-1)==-1" },
];

// Category 3: Functions the solver probably can't handle
const unknown = [
  { name: "sigmoid_approx", src: "sigmoid x -> x / (1 + Math.abs(x))\nsigmoid(0)==0\nsigmoid(1)==0.5\nsigmoid(-1)==-0.5" },
  { name: "relu", src: "relu x -> Math.max(0, x)\nrelu(5)==5\nrelu(-5)==0\nrelu(0)==0" },
  { name: "gcd", src: "gcd a,b -> b == 0 ? a : gcd(b, a % b)\ngcd(12,8)==4\ngcd(7,3)==1\ngcd(100,25)==25" },
  { name: "collatz_step", src: "step x -> x % 2 == 0 ? x / 2 : 3 * x + 1\nstep(6)==3\nstep(3)==10\nstep(1)==4\nstep(16)==8" },
  { name: "bit_count", src: "bits x -> x.toString(2).replace(/0/g, '').length\nbits(7)==3\nbits(8)==1\nbits(15)==4\nbits(1)==1" },
];

const categories = [
  { name: "Known patterns", fns: known, expected: "~100%" },
  { name: "Edge cases", fns: edgeCases, expected: "~80-100%" },
  { name: "Unknown patterns", fns: unknown, expected: "~0-20%" },
];

let grandTotal = 0, grandSynthesized = 0, grandVerified = 0;

for (const cat of categories) {
  console.log(`┌─────────────────────────────────────────────────────────┐`);
  console.log(`│  ${cat.name.padEnd(30)} (expected: ${cat.expected.padEnd(10)}) │`);
  console.log(`└─────────────────────────────────────────────────────────┘\n`);

  let catSynth = 0, catVerify = 0, catTotal = cat.fns.length;

  for (const fn of cat.fns) {
    // Try to synthesize from assertions only
    const ast = parse(fn.src);
    const fp = fingerprint(ast);
    const results = synthesize({ functions: fp.functions });

    const r = results[0];
    const synthesized = r?.status === "synthesized";
    if (synthesized) catSynth++;

    // Verify if synthesized
    let verified = false;
    if (synthesized && r.code) {
      try {
        const { transpile } = await import("../src/transpile.mjs");
        const js = transpile(r.code).replace(/export /g, "");
        const mod = new Function(js + `\nreturn { ${fn.name} }`)();
        const testFn = mod[fn.name];

        // Check against assertions
        verified = fp.functions[0].assertions.every(a => {
          try {
            const result = new Function(fn.name, `return ${a.input}`)(testFn);
            return result === Number(a.output);
          } catch { return false; }
        });
        if (verified) catVerify++;
      } catch { /* verification failed */ }
    }

    const icon = verified ? "✓" : synthesized ? "△" : "✗";
    console.log(`  ${icon} ${fn.name}: ${synthesized ? r.code : r?.status || "failed"}`);
    if (synthesized && !verified) console.log(`    (synthesized but verification failed)`);
  }

  grandTotal += catTotal;
  grandSynthesized += catSynth;
  grandVerified += catVerify;

  console.log(`\n  Result: ${catSynth}/${catTotal} synthesized, ${catVerify}/${catTotal} verified\n`);
}

console.log("═══════════════════════════════════════════════════════════");
console.log("  LIMITS — SUMMARY");
console.log("═══════════════════════════════════════════════════════════");
console.log(`  Total functions tested: ${grandTotal}`);
console.log(`  Synthesized:           ${grandSynthesized}/${grandTotal} (${Math.round(grandSynthesized/grandTotal*100)}%)`);
console.log(`  Verified:              ${grandVerified}/${grandTotal} (${Math.round(grandVerified/grandTotal*100)}%)`);
console.log(`  Not synthesizable:     ${grandTotal - grandSynthesized}/${grandTotal}`);
console.log();

const unsolvable = grandTotal - grandSynthesized;
if (unsolvable > 0) {
  console.log("  Functions that can't be communicated via behavior alone:");
  console.log("  → These need either:");
  console.log("    1. More assertion examples (richer behavior description)");
  console.log("    2. New solver hypotheses (expanding the solver's vocabulary)");
  console.log("    3. A fallback: transmit a compact code representation");
  console.log();
  console.log("  The protocol is honest about its limits.");
  console.log("  What it can communicate, it communicates perfectly.");
  console.log("  What it can't, it says so explicitly.");
}
console.log("═══════════════════════════════════════════════════════════");
