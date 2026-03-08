import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { synthesize } from "../src/solve.mjs";

function synth(name, arity, assertions) {
  const results = synthesize({ functions: [{ name, arity, assertions }] });
  return results[0];
}

describe("Benoît Solver v2 — Extended Synthesis", () => {

  // GCD recursive synthesis
  it("synthesizes GCD from examples", () => {
    const r = synth("gcd", 2, [
      { input: "gcd(12, 8)", output: "4" },
      { input: "gcd(7, 3)", output: "1" },
      { input: "gcd(100, 25)", output: "25" },
      { input: "gcd(48, 18)", output: "6" },
    ]);
    assert.strictEqual(r.status, "synthesized");
    assert.ok(r.code.includes("gcd"));
  });

  // Exponential
  it("synthesizes 2^x from examples", () => {
    const r = synth("pow2", 1, [
      { input: "pow2(0)", output: "1" },
      { input: "pow2(1)", output: "2" },
      { input: "pow2(3)", output: "8" },
      { input: "pow2(10)", output: "1024" },
    ]);
    assert.strictEqual(r.status, "synthesized");
    assert.ok(r.code.includes("pow2"));
  });

  // Square root
  it("synthesizes sqrt from examples", () => {
    const r = synth("root", 1, [
      { input: "root(4)", output: "2" },
      { input: "root(9)", output: "3" },
      { input: "root(16)", output: "4" },
      { input: "root(100)", output: "10" },
    ]);
    assert.strictEqual(r.status, "synthesized");
  });

  // Average
  it("synthesizes average from examples", () => {
    const r = synth("avg", 2, [
      { input: "avg(2, 4)", output: "3" },
      { input: "avg(10, 20)", output: "15" },
      { input: "avg(0, 100)", output: "50" },
    ]);
    assert.strictEqual(r.status, "synthesized");
    assert.ok(r.code.includes("avg"));
  });

  // String template synthesis
  it("synthesizes string template: greet(name) → Hello {name}!", () => {
    const r = synth("greet", 1, [
      { input: 'greet("World")', output: '"Hello World!"' },
      { input: 'greet("Benoît")', output: '"Hello Benoît!"' },
      { input: 'greet("Alice")', output: '"Hello Alice!"' },
    ]);
    assert.strictEqual(r.status, "synthesized");
    assert.ok(r.code.includes("Hello"));
  });

  // String uppercase
  it("synthesizes toUpperCase from examples", () => {
    const r = synth("shout", 1, [
      { input: 'shout("hello")', output: '"HELLO"' },
      { input: 'shout("world")', output: '"WORLD"' },
      { input: 'shout("abc")', output: '"ABC"' },
    ]);
    assert.strictEqual(r.status, "synthesized");
    assert.ok(r.code.includes("toUpperCase"));
  });

  // Log base 2
  it("synthesizes log2 from examples", () => {
    const r = synth("lg", 1, [
      { input: "lg(1)", output: "0" },
      { input: "lg(2)", output: "1" },
      { input: "lg(8)", output: "3" },
      { input: "lg(1024)", output: "10" },
    ]);
    assert.strictEqual(r.status, "synthesized");
  });

  // Hypotenuse
  it("synthesizes hypotenuse from examples", () => {
    const r = synth("hyp", 2, [
      { input: "hyp(3, 4)", output: "5" },
      { input: "hyp(5, 12)", output: "13" },
      { input: "hyp(8, 15)", output: "17" },
    ]);
    assert.strictEqual(r.status, "synthesized");
  });

  // Conditional synthesis (from previous session, ensure still works)
  it("synthesizes collatz step from examples", () => {
    const r = synth("collatz", 1, [
      { input: "collatz(6)", output: "3" },
      { input: "collatz(3)", output: "10" },
      { input: "collatz(16)", output: "8" },
      { input: "collatz(10)", output: "5" },
      { input: "collatz(5)", output: "16" },
      { input: "collatz(2)", output: "1" },
      { input: "collatz(4)", output: "2" },
      { input: "collatz(7)", output: "22" },
    ]);
    assert.strictEqual(r.status, "synthesized");
  });
});
