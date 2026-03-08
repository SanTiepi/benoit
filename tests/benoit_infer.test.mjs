import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { infer } from "../src/infer.mjs";

describe("Benoît Property Inference", () => {

  it("discovers commutativity of addition", () => {
    const r = infer("add a,b -> a + b");
    assert.ok(r.properties.some(p => p.type === "commutative"));
  });

  it("discovers identity element of addition", () => {
    const r = infer("add a,b -> a + b");
    assert.ok(r.properties.some(p => p.type === "right_identity" || p.type === "left_identity"));
  });

  it("discovers associativity of addition", () => {
    const r = infer("add a,b -> a + b");
    assert.ok(r.properties.some(p => p.type === "associative"));
  });

  it("discovers absorbing element of multiplication", () => {
    const r = infer("mul a,b -> a * b");
    assert.ok(r.properties.some(p => p.type === "absorbing_element"));
  });

  it("discovers square is even", () => {
    const r = infer("square x -> x * x");
    assert.ok(r.properties.some(p => p.type === "even_function"));
  });

  it("discovers square is non-negative", () => {
    const r = infer("square x -> x * x");
    assert.ok(r.properties.some(p => p.type === "non_negative"));
  });

  it("discovers negate is involution", () => {
    const r = infer("negate x -> 0 - x");
    assert.ok(r.properties.some(p => p.type === "involution"));
  });

  it("discovers identity function", () => {
    const r = infer("id x -> x");
    assert.ok(r.properties.some(p => p.type === "identity"));
  });

  it("discovers clamp is bounded", () => {
    const r = infer("clamp x,min,max -> Math.max(min, Math.min(max, x))");
    assert.ok(r.properties.some(p => p.type === "bounded"));
  });

  it("generates assertions for all discoverable properties", () => {
    const r = infer("add a,b -> a + b");
    assert.ok(r.assertions.length > 0);
    assert.ok(r.assertions.every(a => typeof a === "string"));
  });
});
