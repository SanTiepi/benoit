import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  encodeIntent,
  resolveIntent,
  executeIntent,
  composeIntents,
  negotiateIntent,
} from "../src/intent.mjs";

describe("Benoît Intent Engine — behavioral specification", () => {

  // -----------------------------------------------------------------------
  // 1. Simple math intent: doubling
  // -----------------------------------------------------------------------
  it("synthesizes doubling from numeric examples", () => {
    const intent = encodeIntent([
      { input: 1, output: 2 },
      { input: 3, output: 6 },
      { input: 5, output: 10 },
    ]);
    const resolved = resolveIntent(intent);
    assert.equal(resolved.meta.status, "resolved");
    assert.ok(resolved.meta.confidence >= 0.9);
    assert.equal(resolved.fn(7), 14);
    assert.equal(resolved.fn(0), 0);
    assert.equal(resolved.fn(-4), -8);
  });

  // -----------------------------------------------------------------------
  // 2. String intent: uppercase
  // -----------------------------------------------------------------------
  it("synthesizes toUpperCase from string examples", () => {
    const intent = encodeIntent([
      { input: "hello", output: "HELLO" },
      { input: "world", output: "WORLD" },
      { input: "abc", output: "ABC" },
    ]);
    const resolved = resolveIntent(intent);
    assert.equal(resolved.meta.status, "resolved");
    assert.equal(resolved.fn("test"), "TEST");
    assert.ok(resolved.meta.synthesized.includes("toUpperCase"));
  });

  // -----------------------------------------------------------------------
  // 3. Array sort intent
  // -----------------------------------------------------------------------
  it("synthesizes sort from array examples", () => {
    const intent = encodeIntent(
      [
        { input: [3, 1, 2], output: [1, 2, 3] },
        { input: [9, 5, 7], output: [5, 7, 9] },
        { input: [1, 1, 1], output: [1, 1, 1] },
      ],
      ["idempotent", "length_preserving"],
    );
    const resolved = resolveIntent(intent);
    assert.equal(resolved.meta.status, "resolved");
    assert.deepStrictEqual(resolved.fn([4, 2, 8, 1]), [1, 2, 4, 8]);
    assert.ok(resolved.meta.confidence >= 0.9);
  });

  // -----------------------------------------------------------------------
  // 4. Intent composition: double then negate
  // -----------------------------------------------------------------------
  it("composes double and negate intents into a pipeline", () => {
    const doubleIntent = resolveIntent(encodeIntent([
      { input: 1, output: 2 },
      { input: 3, output: 6 },
      { input: 5, output: 10 },
    ]));
    const negateIntent = resolveIntent(encodeIntent([
      { input: 2, output: -2 },
      { input: 6, output: -6 },
      { input: 10, output: -10 },
    ]));

    const composed = composeIntents(doubleIntent, negateIntent);
    assert.equal(composed.meta.status, "composed");
    assert.equal(composed.fn(4), -8);
    assert.equal(composed.fn(0), -0);  // -1 * (2 * 0) = -0
    assert.equal(composed.fn(-3), 6);
    assert.ok(composed.meta.synthesized.includes("|>"));
  });

  // -----------------------------------------------------------------------
  // 5. Negotiation: add counter-example, re-resolve
  // -----------------------------------------------------------------------
  it("renegotiates intent with counter-examples", () => {
    // Initial: looks like doubling (x * 2)
    const intent = resolveIntent(encodeIntent([
      { input: 1, output: 2 },
      { input: 2, output: 4 },
      { input: 3, output: 6 },
    ]));
    assert.equal(intent.fn(5), 10);

    // Renegotiate: override output for input=1 so the pattern becomes x + 1
    const renegotiated = negotiateIntent(intent, [
      { input: 0, output: 1 },
      { input: 1, output: 2 },
      { input: 2, output: 3 },
      { input: 3, output: 4 },
      { input: 5, output: 6 },
    ]);

    // Now all examples fit x + 1 (counter-examples override the old ones)
    assert.equal(renegotiated.meta.status, "resolved");
    assert.ok(renegotiated.examples.length >= 5);
    assert.equal(renegotiated.fn(10), 11);
  });

  // -----------------------------------------------------------------------
  // 6. Execute on unseen input
  // -----------------------------------------------------------------------
  it("executes intent directly on unseen input", () => {
    const intent = encodeIntent([
      { input: 0, output: 0 },
      { input: 2, output: 4 },
      { input: 5, output: 10 },
    ]);
    // executeIntent should resolve and apply in one step
    const result = executeIntent(intent, 100);
    assert.equal(result, 200);
  });

  // -----------------------------------------------------------------------
  // 7. Property constraint filtering: idempotent sort
  // -----------------------------------------------------------------------
  it("verifies property constraints on resolved intent", () => {
    const intent = encodeIntent(
      [
        { input: [5, 3, 1], output: [1, 3, 5] },
        { input: [2, 1], output: [1, 2] },
      ],
      ["idempotent", "length_preserving"],
    );
    const resolved = resolveIntent(intent);
    assert.equal(resolved.meta.status, "resolved");

    // Property verification should report idempotent + length_preserving satisfied
    const props = resolved.meta.propertiesVerified;
    assert.ok(props.satisfied.includes("idempotent"), "sort should be idempotent");
    assert.ok(props.satisfied.includes("length_preserving"), "sort should be length-preserving");
    assert.equal(props.violated.length, 0);
  });

  // -----------------------------------------------------------------------
  // 8. Reduce / aggregate: sum
  // -----------------------------------------------------------------------
  it("synthesizes sum from array-to-scalar examples", () => {
    const intent = encodeIntent([
      { input: [1, 2, 3], output: 6 },
      { input: [10, 20], output: 30 },
      { input: [0, 0, 0], output: 0 },
    ]);
    const resolved = resolveIntent(intent);
    assert.equal(resolved.meta.status, "resolved");
    assert.equal(resolved.fn([5, 5, 5, 5]), 20);
    assert.ok(resolved.meta.synthesized.includes("reduce"));
  });

  // -----------------------------------------------------------------------
  // 9. String reverse
  // -----------------------------------------------------------------------
  it("synthesizes string reverse from examples", () => {
    const intent = encodeIntent([
      { input: "abc", output: "cba" },
      { input: "hello", output: "olleh" },
      { input: "x", output: "x" },
    ]);
    const resolved = resolveIntent(intent);
    assert.equal(resolved.meta.status, "resolved");
    assert.equal(resolved.fn("racecar"), "racecar");
    assert.equal(resolved.fn("test"), "tset");
  });

  // -----------------------------------------------------------------------
  // 10. Encode format correctness
  // -----------------------------------------------------------------------
  it("produces a well-formed intent object", () => {
    const intent = encodeIntent(
      [{ input: 1, output: 1 }, { input: 2, output: 4 }],
      ["non_negative"],
      { domain: "number", range: "number" },
    );
    assert.equal(intent.type, "intent");
    assert.equal(intent.examples.length, 2);
    assert.deepStrictEqual(intent.properties, ["non_negative"]);
    assert.equal(intent.constraints.domain, "number");
    assert.equal(intent.constraints.range, "number");
    assert.equal(intent.meta.confidence, null);
    assert.equal(intent.meta.synthesized, null);
  });

  // -----------------------------------------------------------------------
  // 11. Filter intent: even numbers
  // -----------------------------------------------------------------------
  it("synthesizes filter-even from array examples", () => {
    const intent = encodeIntent([
      { input: [1, 2, 3, 4], output: [2, 4] },
      { input: [5, 6, 7, 8, 9, 10], output: [6, 8, 10] },
      { input: [2, 4, 6], output: [2, 4, 6] },
    ]);
    const resolved = resolveIntent(intent);
    assert.equal(resolved.meta.status, "resolved");
    assert.deepStrictEqual(resolved.fn([11, 12, 13, 14]), [12, 14]);
  });

  // -----------------------------------------------------------------------
  // 12. Math: squaring
  // -----------------------------------------------------------------------
  it("synthesizes squaring from numeric examples", () => {
    const intent = encodeIntent([
      { input: 0, output: 0 },
      { input: 3, output: 9 },
      { input: -3, output: 9 },
      { input: 7, output: 49 },
    ]);
    const resolved = resolveIntent(intent);
    assert.equal(resolved.meta.status, "resolved");
    assert.equal(resolved.fn(5), 25);
    assert.equal(resolved.fn(-5), 25);
  });

  // -----------------------------------------------------------------------
  // 13. Unsolvable intent returns status "unsolved"
  // -----------------------------------------------------------------------
  it("returns unsolved for contradictory examples", () => {
    // Contradictory: same input, different output
    const intent = encodeIntent([
      { input: { a: 1 }, output: { b: 2 } },
      { input: { c: 3 }, output: { d: 4 } },
    ]);
    const resolved = resolveIntent(intent);
    assert.equal(resolved.meta.status, "unsolved");
    assert.equal(resolved.fn, null);
  });

  // -----------------------------------------------------------------------
  // 14. Composition preserves metadata
  // -----------------------------------------------------------------------
  it("composed intent tracks component formulas", () => {
    const a = resolveIntent(encodeIntent([
      { input: [3, 1, 2], output: [1, 2, 3] },
    ], ["idempotent"]));
    const b = resolveIntent(encodeIntent([
      { input: [1, 2, 3], output: [3, 2, 1] },
    ]));
    const composed = composeIntents(a, b);
    assert.ok(Array.isArray(composed.meta.components));
    assert.equal(composed.meta.components.length, 2);
    assert.deepStrictEqual(composed.fn([5, 1, 3]), [5, 3, 1]);
  });
});
