#!/usr/bin/env node
// AGENT A — The Sender
//
// Agent A has a module of math functions. It encodes them into a protocol
// message and writes it to stdout. No source code leaves the agent.
//
// Usage: node demos/agent_a.mjs > message.json

import { encode } from "../src/protocol.mjs";

const myModule = `add a,b -> a + b
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

abs x -> Math.abs(x)
abs(5) == 5
abs(-5) == 5
abs(0) == 0

double x -> x * 2
double(0) == 0
double(3) == 6
double(-5) == -10

halve x -> x / 2
halve(0) == 0
halve(10) == 5
halve(-4) == -2

fibonacci n ->
  match n ->
    | 0 => 0
    | 1 => 1
    | _ => fibonacci(n - 1) + fibonacci(n - 2)
fibonacci(0) == 0
fibonacci(1) == 1
fibonacci(5) == 5
fibonacci(10) == 55`;

console.error("═══════════════════════════════════════════════════════════");
console.error("  AGENT A — Encoding module for transmission");
console.error("═══════════════════════════════════════════════════════════\n");

const message = encode(myModule);

console.error(`  Functions: ${message.functions.length}`);
console.error(`  Properties: ${message.meta.propertyCount}`);
console.error(`  Equivalence classes: ${message.algebra.equivalenceClasses.length}`);
console.error(`  Inverse pairs: ${message.algebra.inversePairs.length}`);
console.error(`  Surprises: ${message.meta.surpriseCount}`);
console.error(`  Source code transmitted: 0 chars`);
console.error(`\n  Message size: ${JSON.stringify(message).length} chars`);
console.error(`  Source size: ${myModule.length} chars`);
console.error(`  Compression: ${Math.round((1 - JSON.stringify(message).length / myModule.length) * 100)}%`);
console.error("\n═══════════════════════════════════════════════════════════\n");

// Output the message to stdout (for piping to Agent B)
console.log(JSON.stringify(message));
