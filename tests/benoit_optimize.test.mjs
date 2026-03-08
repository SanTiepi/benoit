import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { optimize } from "../src/optimize.mjs";

const BASE = `add a,b -> a + b

mul a,b -> a * b

square x -> x * x

negate x -> 0 - x

abs x -> Math.abs(x)

double x -> x * 2

halve x -> x / 2`;

function opt(expr) {
  const result = optimize(BASE + "\n\n" + expr);
  // Return only the last line (the optimized expression)
  return result.optimized.split("\n").pop().trim();
}

function optReport(expr) {
  return optimize(BASE + "\n\n" + expr);
}

describe("Benoît Self-Optimizer", () => {

  it("eliminates identity element for add: add(x, 0) → x", () => {
    assert.strictEqual(opt("add(x, 0)"), "x");
  });

  it("eliminates left identity for add: add(0, y) → y", () => {
    assert.strictEqual(opt("add(0, y)"), "y");
  });

  it("applies absorbing element for mul: mul(x, 0) → 0", () => {
    assert.strictEqual(opt("mul(anything, 0)"), "0");
  });

  it("collapses involution: negate(negate(x)) → x", () => {
    assert.strictEqual(opt("negate(negate(x))"), "x");
  });

  it("absorbs odd into even: square(negate(x)) → square(x)", () => {
    assert.strictEqual(opt("square(negate(x))"), "square(x)");
  });

  it("absorbs involution into even: abs(negate(x)) → abs(x)", () => {
    assert.strictEqual(opt("abs(negate(x))"), "abs(x)");
  });

  it("collapses idempotent: abs(abs(x)) → abs(x)", () => {
    assert.strictEqual(opt("abs(abs(x))"), "abs(x)");
  });

  it("eliminates inverse pair: double(halve(x)) → x", () => {
    assert.strictEqual(opt("double(halve(x))"), "x");
  });

  it("eliminates inverse pair (reverse): halve(double(x)) → x", () => {
    assert.strictEqual(opt("halve(double(x))"), "x");
  });

  it("folds constants: add(3, 5) → 8", () => {
    assert.strictEqual(opt("add(3, 5)"), "8");
  });

  it("folds constants: square(6) → 36", () => {
    assert.strictEqual(opt("square(6)"), "36");
  });

  it("does not modify function definitions", () => {
    const result = optimize(BASE);
    assert.ok(result.optimized.includes("add a,b -> a + b"));
    assert.ok(result.optimized.includes("mul a,b -> a * b"));
  });

  it("reports optimization statistics", () => {
    const result = optReport("add(x, 0)");
    assert.ok(result.stats.optimizations > 0);
    assert.ok(result.stats.byType.identity_elimination > 0);
  });

  it("mul identity uses 1 not 0: mul(x, 1) → x", () => {
    assert.strictEqual(opt("mul(x, 1)"), "x");
  });
});
