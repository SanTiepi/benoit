import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parse, fingerprint } from "../src/ast.mjs";
import { synthesize, solve } from "../src/solve.mjs";

describe("Benoît Solver — behavior to code synthesis", () => {

  it("synthesizes addition from assertions", () => {
    const src = "add a,b -> a + b\nadd(2, 3) == 5\nadd(-1, 1) == 0\nadd(0, 0) == 0";
    const fp = fingerprint(parse(src));
    const results = synthesize(fp);
    assert.equal(results[0].status, "synthesized");
    assert.ok(results[0].code.includes("a + b"));
    assert.equal(results[0].confidence, 1.0);
  });

  it("synthesizes multiplication from assertions", () => {
    const src = "mul a,b -> a * b\nmul(4, 5) == 20\nmul(-2, 3) == -6\nmul(0, 7) == 0";
    const fp = fingerprint(parse(src));
    const results = synthesize(fp);
    assert.equal(results[0].status, "synthesized");
    assert.ok(results[0].code.includes("a * b"));
  });

  it("synthesizes square (quadratic) from assertions", () => {
    const src = "square x -> x * x\nsquare(0) == 0\nsquare(3) == 9\nsquare(-3) == 9\nsquare(7) == 49";
    const fp = fingerprint(parse(src));
    const results = synthesize(fp);
    assert.equal(results[0].status, "synthesized");
    assert.ok(results[0].code.includes("x * x"));
  });

  it("synthesizes fibonacci from assertions", () => {
    const src = [
      "fibonacci n -> 0",
      "fibonacci(0) == 0",
      "fibonacci(1) == 1",
      "fibonacci(2) == 1",
      "fibonacci(5) == 5",
      "fibonacci(10) == 55"
    ].join("\n");
    const fp = fingerprint(parse(src));
    const results = synthesize(fp);
    assert.equal(results[0].status, "synthesized");
    assert.ok(results[0].code.includes("fibonacci(n - 1) + fibonacci(n - 2)"));
    assert.ok(results[0].confidence >= 0.9);
  });

  it("synthesizes clamp from assertions", () => {
    const src = [
      "clamp x,min,max -> 0",
      "clamp(50, 0, 100) == 50",
      "clamp(-5, 0, 100) == 0",
      "clamp(200, 0, 100) == 100"
    ].join("\n");
    const fp = fingerprint(parse(src));
    const results = synthesize(fp);
    assert.equal(results[0].status, "synthesized");
    assert.ok(results[0].code.includes("Math.max"));
    assert.ok(results[0].code.includes("Math.min"));
  });

  it("solves for unknown in add(?, 3) == 5", () => {
    const add = (a, b) => a + b;
    const result = solve("add(?, 3) == 5", { add });
    assert.ok(result.solutions.includes(2));
    assert.equal(result.unique, true);
  });

  it("solves for unknown in mul(?, 7) == 21", () => {
    const mul = (a, b) => a * b;
    const result = solve("mul(?, 7) == 21", { mul });
    assert.ok(result.solutions.includes(3));
  });

  it("finds multiple solutions for square(?) == 9", () => {
    const square = (x) => x * x;
    const result = solve("square(?) == 9", { square });
    assert.ok(result.solutions.includes(3));
    assert.ok(result.solutions.includes(-3));
    assert.equal(result.unique, false);
  });

  it("returns unsolved for functions without pattern", () => {
    const src = "mystery x -> x\nmystery(42) == 17";
    const fp = fingerprint(parse(src));
    const results = synthesize(fp);
    // Should not match any simple pattern
    assert.ok(results[0].status === "unsolved" || results[0].confidence < 1.0);
  });
});
