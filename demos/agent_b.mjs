#!/usr/bin/env node
// AGENT B — The Receiver
//
// Agent B receives a protocol message from stdin, synthesizes working code
// from it, and verifies the results. No source code was received.
//
// Usage: node demos/agent_a.mjs | node demos/agent_b.mjs

import { decode } from "../src/protocol.mjs";

// Read stdin
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const input = Buffer.concat(chunks).toString();

const message = JSON.parse(input);

console.log("═══════════════════════════════════════════════════════════");
console.log("  AGENT B — Receiving and reconstructing module");
console.log("═══════════════════════════════════════════════════════════\n");

console.log(`  Protocol: ${message.protocol}`);
console.log(`  Functions received: ${message.functions.length}`);
console.log(`  Properties received: ${message.meta.propertyCount}`);
console.log(`  Source code received: 0 chars\n`);

console.log("─── Synthesizing Functions ───\n");

const result = decode(message);

for (const [name, code] of Object.entries(result.functions)) {
  const firstLine = code.split("\n")[0];
  console.log(`  ${name}: ${firstLine}`);
}

console.log("\n─── Verification ───\n");
console.log(`  Assertions: ${result.verification.assertions.passed}/${result.verification.assertions.total}`);
console.log(`  Properties: ${result.verification.properties.passed}/${result.verification.properties.total}`);
console.log(`  Compositions: ${result.verification.compositions.verified}/${result.verification.compositions.reconstructed}`);

const rate = result.total.total > 0
  ? Math.round(result.total.passed / result.total.total * 100)
  : 0;

console.log(`\n  Overall: ${result.total.passed}/${result.total.total} (${rate}%)`);

console.log("\n═══════════════════════════════════════════════════════════");
console.log("  RESULT");
console.log("═══════════════════════════════════════════════════════════\n");

if (rate >= 90) {
  console.log("  Agent B successfully reconstructed the module.");
  console.log("  All functions work. No source code was needed.");
} else if (rate >= 50) {
  console.log("  Partial reconstruction. Some functions need more data.");
} else {
  console.log("  Reconstruction failed. Protocol negotiation needed.");
}

console.log("\n═══════════════════════════════════════════════════════════");
