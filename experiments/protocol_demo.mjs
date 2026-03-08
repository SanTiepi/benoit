// PROTOCOL DEMO: One function call to encode → transmit → decode → verify
//
// This is the final interface: exchange(source) → full report
// The simplest possible API for AI-to-AI communication.

import { exchange, encode, decode } from "../src/protocol.mjs";

console.log("═══════════════════════════════════════════════════════════");
console.log("  BENOÎT PROTOCOL — Complete Exchange Demo");
console.log("═══════════════════════════════════════════════════════════\n");

const source = `add a,b -> a + b
add(2, 3) == 5
add(-1, 1) == 0
add(0, 42) == 42

mul a,b -> a * b
mul(3, 4) == 12
mul(0, 99) == 0
mul(1, 7) == 7

square x -> x * x
square(0) == 0
square(3) == 9
square(-5) == 25

negate x -> 0 - x
negate(5) == -5
negate(-3) == 3
negate(0) == 0

double x -> x * 2
double(0) == 0
double(5) == 10
double(-3) == -6

abs x -> Math.abs(x)
abs(5) == 5
abs(-5) == 5
abs(0) == 0

id x -> x
id(42) == 42
id(-1) == -1`;

// One function call does everything
const report = exchange(source);

console.log("Source code (what Agent A wrote):");
console.log(source.split("\n").map(l => "  " + l).join("\n"));
console.log();

console.log("═══════════════════════════════════════════════════════════");
console.log("  PROTOCOL MESSAGE (what crosses the wire)");
console.log("═══════════════════════════════════════════════════════════\n");
console.log(`  Protocol: ${report.message.protocol}`);
console.log(`  Message size:  ${report.messageSize} chars`);
console.log(`  Source size:   ${report.sourceSize} chars`);
console.log(`  Source code:   0 chars transmitted`);
console.log();
console.log(`  Functions:     ${report.summary.functionsTransmitted}`);
console.log(`  Properties:    ${report.summary.propertiesTransmitted}`);
console.log(`  Surprises:     ${report.summary.surprisesTransmitted}`);

console.log("\n═══════════════════════════════════════════════════════════");
console.log("  RECONSTRUCTION (what Agent B rebuilt)");
console.log("═══════════════════════════════════════════════════════════\n");

for (const [name, code] of Object.entries(report.result.functions)) {
  console.log(`  ${name}: ${code}`);
}

console.log("\n═══════════════════════════════════════════════════════════");
console.log("  VERIFICATION");
console.log("═══════════════════════════════════════════════════════════\n");

const v = report.result.verification;
console.log(`  Assertions:    ${v.assertions.passed}/${v.assertions.total}`);
console.log(`  Properties:    ${v.properties.passed}/${v.properties.total}`);
console.log(`  Compositions:  ${v.compositions.verified}/${v.compositions.reconstructed}`);
console.log(`  ──────────────────────────`);
console.log(`  TOTAL:         ${report.summary.verificationRate}`);

const rate = report.result.total.passed / report.result.total.total;
console.log();
if (rate === 1) {
  console.log("  ✓ PERFECT — Every property verified on independently synthesized code.");
} else {
  console.log(`  △ ${Math.round(rate * 100)}% verified`);
}

console.log("\n═══════════════════════════════════════════════════════════");
console.log("  This is the API:");
console.log("    import { exchange } from 'benoit/protocol'");
console.log("    const report = exchange(source)");
console.log("  One function. Full AI-to-AI communication.");
console.log("═══════════════════════════════════════════════════════════");
