import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { equivalent, inverse, composeAnalysis, equivalenceClasses } from "../src/algebra.mjs";

describe("Benoît Function Algebra", () => {

  it("detects equivalent functions (double via * vs +)", () => {
    const r = equivalent("double x -> x * 2", "twice x -> x + x");
    assert.ok(r.equivalent);
    assert.strictEqual(r.mismatches.length, 0);
  });

  it("detects non-equivalent functions (add vs mul)", () => {
    const r = equivalent("add a,b -> a + b", "mul a,b -> a * b");
    assert.ok(!r.equivalent);
    assert.ok(r.mismatches.length > 0);
  });

  it("detects arity mismatch", () => {
    const r = equivalent("f x -> x", "g a,b -> a + b");
    assert.ok(!r.equivalent);
    assert.strictEqual(r.reason, "arity_mismatch");
  });

  it("discovers negate is self-inverse", () => {
    const r = inverse("negate x -> 0 - x", "negate2 x -> 0 - x");
    assert.ok(r.inverse);
    assert.ok(r.leftInverse);
    assert.ok(r.rightInverse);
  });

  it("discovers double/halve are inverses", () => {
    const r = inverse("double x -> x * 2", "halve x -> x / 2");
    assert.ok(r.inverse);
  });

  it("discovers square/sqrt are NOT full inverses", () => {
    const r = inverse("square x -> x * x", "sqrt x -> Math.sqrt(x)");
    assert.ok(!r.inverse);
  });

  it("discovers absorption: square absorbs negate", () => {
    const r = composeAnalysis("square x -> x * x", "negate x -> 0 - x");
    assert.ok(r.composedProps.some(p => p.type === "absorption"));
  });

  it("discovers composition identity: negate∘negate = id", () => {
    const r = composeAnalysis("negate x -> 0 - x", "negate2 x -> 0 - x");
    assert.ok(r.composedProps.some(p => p.type === "composition_identity"));
  });

  it("predicts even composition from even + odd", () => {
    const r = composeAnalysis("square x -> x * x", "negate x -> 0 - x");
    const evenProp = r.composedProps.find(p => p.type === "even_composition");
    assert.ok(evenProp);
    assert.ok(evenProp.predicted.includes("Predicted"));
  });

  it("groups equivalent functions into classes", () => {
    const sources = [
      "double x -> x * 2",
      "twice x -> x + x",
      "square x -> x * x",
      "negate x -> 0 - x",
    ];
    const r = equivalenceClasses(sources);
    assert.strictEqual(r.totalFunctions, 4);
    assert.strictEqual(r.uniqueBehaviors, 3);
    assert.strictEqual(r.redundant, 1);
    const doubleClass = r.classes.find(c => c.members.includes("double"));
    assert.ok(doubleClass.members.includes("twice"));
  });

  it("detects all functions unique when none are equivalent", () => {
    const sources = [
      "add a,b -> a + b",
      "mul a,b -> a * b",
      "square x -> x * x",
    ];
    const r = equivalenceClasses(sources);
    assert.strictEqual(r.uniqueBehaviors, 3);
    assert.strictEqual(r.redundant, 0);
  });
});
