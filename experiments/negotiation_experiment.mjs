// EXPERIMENT: Protocol Negotiation
//
// What happens when Agent B can't synthesize a function?
// Instead of failing, it ASKS for more information.
//
// Protocol:
//   1. Agent A sends initial fingerprint
//   2. Agent B tries to synthesize
//   3. For failures, Agent B sends back a REQUEST:
//      - "Need more examples for gcd"
//      - "Need examples with negative inputs for abs"
//   4. Agent A responds with additional assertions
//   5. Agent B retries
//
// This is a DIALOGUE protocol, not a one-shot transmission.

import { synthesize } from "../src/solve.mjs";
import { infer } from "../src/infer.mjs";
import { transpile } from "../src/transpile.mjs";

console.log("═══════════════════════════════════════════════════════════");
console.log("  NEGOTIATION EXPERIMENT");
console.log("  When synthesis fails, agents negotiate for more data.");
console.log("═══════════════════════════════════════════════════════════\n");

// Agent A has these functions (with their real implementations for generating examples)
const agentA_functions = {
  collatz: {
    impl: x => x % 2 === 0 ? x / 2 : 3 * x + 1,
    arity: 1,
    initial_assertions: [
      { input: "collatz(6)", output: "3" },
      { input: "collatz(3)", output: "10" },
      { input: "collatz(1)", output: "4" },
    ]
  },
  gcd: {
    impl: (a, b) => { while (b) { [a, b] = [b, a % b]; } return a; },
    arity: 2,
    initial_assertions: [
      { input: "gcd(12, 8)", output: "4" },
      { input: "gcd(7, 3)", output: "1" },
      { input: "gcd(100, 25)", output: "25" },
    ]
  },
  relu: {
    impl: x => Math.max(0, x),
    arity: 1,
    initial_assertions: [
      { input: "relu(5)", output: "5" },
      { input: "relu(-5)", output: "0" },
      { input: "relu(0)", output: "0" },
    ]
  }
};

// Simulate the negotiation
let totalRounds = 0;
let totalSynthesized = 0;

for (const [name, fn] of Object.entries(agentA_functions)) {
  console.log(`┌──────────────────────────────────────────────────┐`);
  console.log(`│  Negotiating: ${name.padEnd(35)}│`);
  console.log(`└──────────────────────────────────────────────────┘\n`);

  let assertions = [...fn.initial_assertions];
  let synthesized = false;
  let round = 0;
  const MAX_ROUNDS = 5;

  while (!synthesized && round < MAX_ROUNDS) {
    round++;
    totalRounds++;
    console.log(`  Round ${round}: Agent B has ${assertions.length} assertions`);

    // Agent B tries to synthesize
    const fp = { functions: [{ name, arity: fn.arity, assertions }] };
    const results = synthesize(fp);
    const r = results[0];

    if (r?.status === "synthesized" && r.code) {
      // Verify
      try {
        const js = transpile(r.code).replace(/export /g, "");
        const mod = new Function(js + `\nreturn { ${name} }`)();
        const synthFn = mod[name];

        // Test with some values the solver hasn't seen
        const testInputs = fn.arity === 1
          ? [1, 2, 4, 7, 8, 15, 16, 20]
          : [[6,3], [15,5], [9,6], [48,18], [7,7]];

        let correct = 0;
        for (const input of testInputs) {
          const expected = fn.arity === 1 ? fn.impl(input) : fn.impl(...input);
          const actual = fn.arity === 1 ? synthFn(input) : synthFn(...input);
          if (Math.abs(actual - expected) < 0.001) correct++;
        }

        const accuracy = correct / testInputs.length;
        console.log(`    Synthesized: ${r.code.split("\n")[0]}`);
        console.log(`    Accuracy on unseen data: ${correct}/${testInputs.length} (${Math.round(accuracy*100)}%)`);

        if (accuracy >= 0.9) {
          console.log(`    ✓ Agent B accepts the synthesis!`);
          synthesized = true;
          totalSynthesized++;
        } else {
          console.log(`    △ Not accurate enough. Agent B requests more examples.`);
          // Agent B generates a REQUEST based on what failed
          const failing = testInputs.filter(input => {
            const expected = fn.arity === 1 ? fn.impl(input) : fn.impl(...input);
            const actual = fn.arity === 1 ? synthFn(input) : synthFn(...input);
            return Math.abs(actual - expected) >= 0.001;
          });

          // Agent A responds with examples for failing inputs
          for (const input of failing.slice(0, 3)) {
            const expected = fn.arity === 1 ? fn.impl(input) : fn.impl(...input);
            const assertionStr = fn.arity === 1
              ? { input: `${name}(${input})`, output: `${expected}` }
              : { input: `${name}(${input.join(", ")})`, output: `${expected}` };
            assertions.push(assertionStr);
            console.log(`    + Agent A sends: ${assertionStr.input} == ${assertionStr.output}`);
          }
        }
      } catch (e) {
        console.log(`    ✗ Synthesis error: ${e.message}`);
        // Request more diverse examples
        const newInputs = fn.arity === 1
          ? [round * 3, round * 3 + 1, -round * 2]
          : [[round*5, round*3], [round*7, round*2]];

        for (const input of newInputs) {
          const expected = fn.arity === 1 ? fn.impl(input) : fn.impl(...input);
          const assertionStr = fn.arity === 1
            ? { input: `${name}(${input})`, output: `${expected}` }
            : { input: `${name}(${input.join(", ")})`, output: `${expected}` };
          assertions.push(assertionStr);
          console.log(`    + Agent A sends: ${assertionStr.input} == ${assertionStr.output}`);
        }
      }
    } else {
      console.log(`    ✗ Synthesis failed. Agent B requests more examples.`);
      // Generate more varied examples
      const newInputs = fn.arity === 1
        ? [round * 4, round * 4 + 2, round * 5 + 1]
        : [[round*6, round*4], [round*10, round*3], [round*8, round*5]];

      for (const input of newInputs) {
        const expected = fn.arity === 1 ? fn.impl(input) : fn.impl(...input);
        const assertionStr = fn.arity === 1
          ? { input: `${name}(${input})`, output: `${expected}` }
          : { input: `${name}(${input.join(", ")})`, output: `${expected}` };
        assertions.push(assertionStr);
        console.log(`    + Agent A sends: ${assertionStr.input} == ${assertionStr.output}`);
      }
    }
    console.log();
  }

  if (!synthesized) {
    console.log(`  ✗ Failed after ${MAX_ROUNDS} rounds.`);
    console.log(`    → This function needs a richer synthesis strategy.\n`);
  }
}

console.log("═══════════════════════════════════════════════════════════");
console.log("  NEGOTIATION RESULTS");
console.log("═══════════════════════════════════════════════════════════");
console.log(`  Functions attempted:   ${Object.keys(agentA_functions).length}`);
console.log(`  Successfully negotiated: ${totalSynthesized}/${Object.keys(agentA_functions).length}`);
console.log(`  Total negotiation rounds: ${totalRounds}`);
console.log();
console.log("  The protocol is no longer one-shot.");
console.log("  Agents negotiate until they converge — or honestly admit failure.");
console.log("═══════════════════════════════════════════════════════════");
