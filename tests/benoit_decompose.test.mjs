import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { decompose } from "../src/decompose.mjs";

// Library of known primitives in Benoit syntax
const LIBRARY = [
  `negate x -> 0 - x`,
  `double x -> x * 2`,
  `halve x -> x / 2`,
  `square x -> x * x`,
  `abs x -> Math.abs(x)`,
  `identity x -> x`,
  `add a,b -> a + b`,
  `mul a,b -> a * b`,
  `sub a,b -> a - b`,
];

describe("Benoit Function Archaeology — decompose", () => {

  it("recognizes a direct match to a primitive", () => {
    const result = decompose(`f x -> 0 - x`, LIBRARY);
    assert.strictEqual(result.simplified, "negate");
    assert.ok(result.steps.some(s => s.includes("direct match")));
  });

  it("decomposes square . negate and detects absorption", () => {
    // square(negate(x)) = (0-x)*(0-x) = x*x = square(x)
    // square absorbs negate
    const result = decompose(`f x -> (0 - x) * (0 - x)`, LIBRARY);
    assert.ok(
      result.simplified.includes("square") ||
      result.decomposition.includes("square"),
      `expected square in decomposition, got: ${result.decomposition} / ${result.simplified}`
    );
  });

  it("decomposes abs . negate as abs (absorption)", () => {
    // abs(negate(x)) = abs(x) — negate is absorbed by abs
    const result = decompose(`f x -> Math.abs(0 - x)`, LIBRARY);
    assert.ok(
      result.simplified.includes("abs"),
      `expected abs in result, got: ${result.simplified}`
    );
    assert.ok(
      result.steps.some(s => s.includes("absorb")) ||
      result.simplified.includes("abs"),
      "should detect absorption or simplify to abs"
    );
  });

  it("decomposes halve . double as identity", () => {
    const result = decompose(`f x -> (x * 2) / 2`, LIBRARY);
    assert.strictEqual(result.simplified, "identity");
    // The decomposition should show some composition that reduces to identity
    // (could be halve . double, negate . negate, or another valid path)
    assert.ok(
      result.decomposition !== "unknown",
      `expected a valid decomposition, got: ${result.decomposition}`
    );
  });

  it("decomposes x + 0 as identity via partial application", () => {
    const result = decompose(`f x -> x + 0`, LIBRARY);
    assert.strictEqual(result.simplified, "identity");
    assert.ok(
      result.steps.some(s => s.includes("identity")),
      "should identify as identity"
    );
  });

  it("decomposes negate . negate as identity", () => {
    const result = decompose(`f x -> 0 - (0 - x)`, LIBRARY);
    assert.strictEqual(result.simplified, "identity");
    assert.ok(
      result.decomposition.includes("negate"),
      `expected negate in decomposition, got: ${result.decomposition}`
    );
  });

  it("decomposes double . double as mul(x, 4) or equivalent", () => {
    // double(double(x)) = x * 4
    const result = decompose(`f x -> x * 2 * 2`, LIBRARY);
    assert.ok(
      result.decomposition.includes("double") ||
      result.decomposition.includes("mul"),
      `expected double or mul in decomposition, got: ${result.decomposition}`
    );
  });

  it("decomposes x * 1 as identity via partial application", () => {
    const result = decompose(`f x -> x * 1`, LIBRARY);
    assert.strictEqual(result.simplified, "identity");
    assert.ok(
      result.steps.some(s => s.includes("identity")),
      "should identify x * 1 as identity"
    );
  });

  it("returns unknown for a function with no match", () => {
    // sin is not in our library
    const result = decompose(`f x -> Math.sin(x)`, LIBRARY);
    assert.strictEqual(result.simplified, "unknown");
    assert.ok(result.steps.length > 0);
  });

  it("returns steps array documenting the search process", () => {
    const result = decompose(`f x -> x / 2`, LIBRARY);
    assert.ok(Array.isArray(result.steps));
    assert.ok(result.steps.length >= 1);
    assert.strictEqual(result.simplified, "halve");
  });
});
