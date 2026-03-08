import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generate, generateAll } from "../src/generate.mjs";

describe("Benoit Function Generation", () => {

  it("generates add for [commutative, associative, identity_element_0]", () => {
    const r = generate(["commutative", "associative", "identity_element_0"]);
    assert.ok(r.code, "should return code");
    assert.ok(r.confidence > 0.5, `confidence ${r.confidence} should be > 0.5`);
    assert.ok(r.code.includes("a + b"), "should generate addition");
  });

  it("generates abs for [even_function, non_negative, idempotent]", () => {
    const r = generate(["even_function", "non_negative", "idempotent"]);
    assert.ok(r.code, "should return code");
    assert.ok(r.confidence > 0.5);
    assert.ok(r.name === "abs" || r.name === "zero",
      `expected abs or zero, got ${r.name}`);
  });

  it("generates negate for [involution, odd_function]", () => {
    const r = generate(["involution", "odd_function"]);
    assert.ok(r.code, "should return code");
    assert.ok(r.confidence > 0.5);
    assert.equal(r.name, "negate");
  });

  it("generates square for [even_function, non_negative] (not idempotent)", () => {
    // Both square and abs match, but we verify square is among candidates
    const all = generateAll(["even_function", "non_negative"]);
    const names = all.map(c => c.name);
    assert.ok(names.includes("square"), `candidates should include square, got: ${names}`);
    assert.ok(names.includes("abs"), `candidates should include abs, got: ${names}`);
  });

  it("returns null code when no match is found", () => {
    const r = generate(["nonexistent_property_xyz"]);
    assert.equal(r.code, null);
    assert.equal(r.confidence, 0);
  });

  it("filters by arity", () => {
    const unary = generateAll(["commutative"], 1);
    assert.equal(unary.length, 0, "no unary function is commutative");

    const binary = generateAll(["commutative"], 2);
    assert.ok(binary.length > 0, "binary commutative functions exist");
  });

  it("generateAll returns candidates sorted by confidence descending", () => {
    const all = generateAll(["commutative", "associative"]);
    assert.ok(all.length >= 2, "should have multiple candidates");
    for (let i = 1; i < all.length; i++) {
      assert.ok(all[i - 1].confidence >= all[i].confidence,
        `candidates should be sorted: ${all[i-1].confidence} >= ${all[i].confidence}`);
    }
  });

  it("verified properties come from actual inference", () => {
    const all = generateAll(["commutative", "associative"]);
    const top = all[0];
    assert.ok(top.verified.length > 0, "should have verified properties");
    assert.ok(top.verified.includes("commutative"), "commutative should be verified");
    assert.ok(top.verified.includes("associative"), "associative should be verified");
  });

  it("handles alias property names (even -> even_function)", () => {
    const r = generate(["even", "nonnegative"]);
    assert.ok(r.code, "should resolve aliases");
    assert.ok(r.confidence > 0.5);
  });

  it("generates clamp for bounded + passthrough_in_bounds", () => {
    const r = generate(["bounded", "passthrough_in_bounds"], 3);
    assert.ok(r.code, "should return code");
    assert.equal(r.name, "clamp");
    assert.ok(r.confidence > 0.5);
  });
});
