import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { inferType, inferTypes } from "../src/types.mjs";

describe("Benoît Type Inference", () => {

  it("infers number → integer for add", () => {
    const r = inferType("add a,b -> a + b");
    assert.strictEqual(r.range, "integer");
    assert.strictEqual(r.arity, 2);
  });

  it("infers number → number for square", () => {
    const r = inferType("square x -> x * x");
    assert.strictEqual(r.domain, "number");
    assert.ok(r.constraints.includes("output: non-negative"));
  });

  it("infers number → number for negate", () => {
    const r = inferType("negate x -> 0 - x");
    assert.strictEqual(r.domain, "number");
  });

  it("infers non-negative output for abs", () => {
    const r = inferType("abs x -> Math.abs(x)");
    assert.ok(r.constraints.includes("output: non-negative"));
  });

  it("infers bounded [0,1] for clamp", () => {
    const r = inferType("clamp x ->\n  x > 1? -> 1\n  x < 0? -> 0\n  else? -> x");
    assert.ok(r.constraints.includes("output: [0, 1]"));
  });

  it("returns signature string", () => {
    const r = inferType("double x -> x * 2");
    assert.ok(r.signature.includes("double"));
    assert.ok(r.signature.includes("→"));
  });

  it("inferTypes works on multi-function module", () => {
    const results = inferTypes("add a,b -> a + b\n\nnegate x -> 0 - x");
    assert.strictEqual(results.length, 2);
    assert.strictEqual(results[0].name, "add");
    assert.strictEqual(results[1].name, "negate");
  });

  it("reports sample counts", () => {
    const r = inferType("double x -> x * 2");
    assert.ok(r.samples.integers > 0);
    assert.ok(r.samples.floats > 0);
  });
});
