import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { given, asProtocol, asIntent, asQuery, asDiff, asCompose, selfTest } from "../src/core.mjs";

describe("Benoit Core — the universal primitive", () => {

  it("given/when fills a numeric hole", () => {
    const r = given([
      { input: 1, output: 2 },
      { input: 3, output: 6 },
      { input: 5, output: 10 },
    ]);
    assert.strictEqual(r.when(7), 14);
    assert.strictEqual(r.resolved, true);
  });

  it("then fills multiple holes at once", () => {
    const r = given([
      { input: 1, output: 3 },
      { input: 2, output: 5 },
      { input: 3, output: 7 },
    ]);
    const answers = r.then([10, 0]);
    assert.strictEqual(answers[0], 21);
    assert.strictEqual(answers[1], 1);
  });

  it("and() adds context to a resolver", () => {
    const r = given([{ input: 2, output: 4 }, { input: 3, output: 6 }]);
    assert.strictEqual(r.when(5), 10); // doubling

    const refined = r.and([{ input: 3, output: 9 }, { input: 5, output: 25 }]);
    assert.strictEqual(refined.when(4), 16); // squaring
  });

  it("but() corrects understanding", () => {
    const r = given([{ input: 2, output: 4 }, { input: 3, output: 6 }]);
    const corrected = r.but([{ input: 3, output: 9 }, { input: 4, output: 16 }, { input: 0, output: 0 }]);
    assert.strictEqual(corrected.when(5), 25);
  });

  it("pipe() composes two resolvers", () => {
    const doubler = given([
      { input: 1, output: 2 },
      { input: 3, output: 6 },
      { input: 5, output: 10 },
    ]);
    const negator = given([
      { input: 2, output: -2 },
      { input: 6, output: -6 },
      { input: 10, output: -10 },
    ]);
    const composed = doubler.pipe(negator);
    assert.strictEqual(composed.when(1), -2);
  });

  it("describe() returns resolver metadata", () => {
    const r = given([{ input: 1, output: 2 }]);
    const d = r.describe();
    assert.strictEqual(d.type, "resolver");
    assert.strictEqual(d.examples, 1);
    assert.strictEqual(d.domain, "number");
  });

  it("empty given returns null for everything", () => {
    const r = given([]);
    assert.strictEqual(r.when(5), null);
    assert.strictEqual(r.resolved, false);
  });

  it("handles string inputs", () => {
    const r = given([
      { input: "hello", output: "HELLO" },
      { input: "world", output: "WORLD" },
    ]);
    assert.strictEqual(r.when("test"), "TEST");
  });

  it("handles array inputs", () => {
    const r = given([
      { input: [3, 1, 2], output: [1, 2, 3] },
      { input: [5, 1], output: [1, 5] },
    ]);
    assert.deepStrictEqual(r.when([9, 3, 7]), [3, 7, 9]);
  });

  // Proof: all module operations are the same primitive

  it("asProtocol = given/when", () => {
    const r = asProtocol([
      { input: 2, output: 4 },
      { input: 3, output: 6 },
    ]);
    assert.strictEqual(r.when(10), 20);
  });

  it("asIntent = given/when", () => {
    const r = asIntent(
      [{ input: 1, output: 1 }, { input: 2, output: 4 }, { input: 3, output: 9 }]
    );
    assert.strictEqual(r.when(5), 25);
  });

  it("asQuery = given/when", () => {
    const r = asQuery([
      { input: "a", output: "A" },
      { input: "b", output: "B" },
    ]);
    assert.strictEqual(r.when("z"), "Z");
  });

  it("asDiff detects equivalence", () => {
    const d = asDiff(
      [{ input: 1, output: 2 }, { input: 2, output: 4 }],
      [{ input: 1, output: 2 }, { input: 2, output: 4 }],
    );
    assert.strictEqual(d.equivalent, true);
    assert.strictEqual(d.agree, 2);
  });

  it("asDiff detects disagreement", () => {
    const d = asDiff(
      [{ input: 1, output: 2 }, { input: 2, output: 4 }],
      [{ input: 1, output: 2 }, { input: 2, output: 5 }],
    );
    assert.strictEqual(d.equivalent, false);
    assert.strictEqual(d.disagree, 1);
  });

  it("asCompose chains two behaviors", () => {
    const r = asCompose(
      [{ input: 1, output: 2 }, { input: 2, output: 4 }, { input: 3, output: 6 }],
      [{ input: 2, output: -2 }, { input: 4, output: -4 }, { input: 6, output: -6 }],
    );
    assert.strictEqual(r.when(1), -2);
  });

  // The self-reference test
  it("selfTest passes — Benoit describes itself", () => {
    const result = selfTest();
    assert.strictEqual(result.selfReferential, true,
      `Self-test failed: ${result.summary}\n` +
      result.results.filter(r => !r.pass).map(r =>
        `  FAIL: ${r.test} — expected ${r.expected}, got ${r.got}`
      ).join("\n")
    );
  });
});
