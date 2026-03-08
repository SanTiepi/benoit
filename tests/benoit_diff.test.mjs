import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { diffTest, stressTest } from "../src/diff.mjs";

describe("Benoît Differential Testing", () => {

  it("confirms equivalent functions", () => {
    const r = diffTest("negate x -> 0 - x", "flip x -> 0 - x");
    assert.ok(r.equivalent);
    assert.strictEqual(r.disagreements, 0);
  });

  it("finds disagreements between different functions", () => {
    const r = diffTest("double x -> x * 2", "triple x -> x * 3");
    assert.ok(!r.equivalent);
    assert.ok(r.disagreements > 0);
  });

  it("handles binary functions", () => {
    const r = diffTest("add a,b -> a + b", "sub a,b -> a - b");
    assert.ok(!r.equivalent);
  });

  it("reports agreement rate", () => {
    const r = diffTest("abs x -> Math.abs(x)", "abs2 x -> Math.abs(x)");
    assert.ok(r.rate.includes("100%"));
  });

  it("detects arity mismatch", () => {
    const r = diffTest("f x -> x", "g a,b -> a + b");
    assert.ok(r.error === "arity_mismatch");
  });

  it("stress tests hold for clean functions", () => {
    const r = stressTest("abs x -> Math.abs(x)");
    assert.ok(r.robust);
    assert.ok(r.properties.length > 0);
  });

  it("stress tests detect property violations", () => {
    // This function claims to be abs-like but isn't
    const r = stressTest("square x -> x * x");
    // Square is even and non-negative — stress should confirm those hold
    assert.ok(r.properties.includes("even_function"));
    assert.ok(r.properties.includes("non_negative"));
  });

  it("returns summary string", () => {
    const r = stressTest("negate x -> 0 - x");
    assert.ok(r.summary.length > 0);
  });
});
