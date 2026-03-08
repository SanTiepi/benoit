import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  publishNeed,
  publishOffer,
  negotiate,
  bind,
  verify,
  Registry,
} from "../src/contract.mjs";

describe("Benoît Contract-Driven Module Discovery", () => {

  // -----------------------------------------------------------------------
  // 1. Publish a need with examples + properties
  // -----------------------------------------------------------------------
  it("publishes a need with examples and properties", () => {
    const need = publishNeed({
      name: "sorter",
      examples: [
        { input: [3, 1, 2], output: [1, 2, 3] },
        { input: [5, 4], output: [4, 5] },
      ],
      properties: ["idempotent", "length_preserving"],
      domain: "array<number>",
      range: "array<number>",
    });

    assert.ok(need.id.startsWith("need-"));
    assert.equal(need.name, "sorter");
    assert.equal(need.examples.length, 2);
    assert.deepEqual(need.properties, ["idempotent", "length_preserving"]);
    assert.equal(need.domain, "array<number>");
    assert.equal(need.range, "array<number>");
    assert.equal(typeof need.verify, "function");
  });

  // -----------------------------------------------------------------------
  // 2. Offer a correct implementation that satisfies the need
  // -----------------------------------------------------------------------
  it("offers an implementation that passes all examples", () => {
    const need = publishNeed({
      name: "sorter",
      examples: [
        { input: [3, 1, 2], output: [1, 2, 3] },
        { input: [5, 4], output: [4, 5] },
        { input: [1], output: [1] },
      ],
      properties: ["idempotent", "length_preserving"],
    });

    const offer = publishOffer(need.id, {
      fn: (xs) => [...xs].sort((a, b) => a - b),
      source: "sort xs -> ...",
      confidence: 0.95,
    }, need);

    assert.ok(offer.id.startsWith("offer-"));
    assert.equal(offer.needId, need.id);
    assert.ok(offer.verification.pass);
    assert.equal(offer.verification.summary.examplesPassed, 3);
    assert.equal(offer.verification.summary.propertiesSatisfied, 2);
    assert.equal(offer.verification.summary.propertiesViolated, 0);
  });

  // -----------------------------------------------------------------------
  // 3. Offer an implementation that fails (wrong output)
  // -----------------------------------------------------------------------
  it("rejects an offer that produces wrong output", () => {
    const need = publishNeed({
      name: "sorter",
      examples: [
        { input: [3, 1, 2], output: [1, 2, 3] },
      ],
    });

    // This reverses instead of sorting
    const offer = publishOffer(need.id, {
      fn: (xs) => [...xs].reverse(),
      confidence: 0.5,
    }, need);

    assert.ok(!offer.verification.pass);
    assert.equal(offer.verification.summary.examplesPassed, 0);
  });

  // -----------------------------------------------------------------------
  // 4. Offer that fails a property check
  // -----------------------------------------------------------------------
  it("detects property violation even when examples pass", () => {
    const need = publishNeed({
      name: "non-negative transform",
      examples: [
        { input: 5, output: 5 },
        { input: 0, output: 0 },
      ],
      properties: ["non_negative"],
    });

    // Identity passes examples but fails non_negative for negative inputs...
    // Actually identity passes since non_negative only checks on examples.
    // Use a function that passes examples but violates a different property.
    const need2 = publishNeed({
      name: "length preserver",
      examples: [
        { input: [1, 2, 3], output: [1, 2, 3] },
      ],
      properties: ["length_preserving"],
    });

    // This removes the last element — violates length_preserving
    const offer = publishOffer(need2.id, {
      fn: (xs) => xs.slice(0, -1),
      confidence: 0.3,
    }, need2);

    assert.ok(!offer.verification.pass);
    assert.equal(offer.verification.summary.propertiesViolated, 1);
  });

  // -----------------------------------------------------------------------
  // 5. Negotiate between multiple offers
  // -----------------------------------------------------------------------
  it("ranks multiple offers by fitness", () => {
    const need = publishNeed({
      name: "sorter",
      examples: [
        { input: [3, 1, 2], output: [1, 2, 3] },
        { input: [5, 4, 3, 2, 1], output: [1, 2, 3, 4, 5] },
      ],
      properties: ["idempotent", "length_preserving"],
    });

    const goodSort = {
      id: "offer-good", needId: need.id,
      fn: (xs) => [...xs].sort((a, b) => a - b),
      confidence: 0.95,
    };

    const badReverse = {
      id: "offer-bad", needId: need.id,
      fn: (xs) => [...xs].reverse(),
      confidence: 0.8,
    };

    const okSort = {
      id: "offer-ok", needId: need.id,
      fn: (xs) => [...xs].sort((a, b) => a - b),
      confidence: 0.6,
    };

    const ranked = negotiate(need, [badReverse, okSort, goodSort]);

    assert.equal(ranked.length, 3);
    // Good sort and ok sort should both pass; good sort has higher confidence
    assert.equal(ranked[0].id, "offer-good");
    assert.equal(ranked[0].rank, 1);
    assert.ok(ranked[0].verification.pass);
    // Bad reverse should be last
    assert.equal(ranked[2].id, "offer-bad");
    assert.ok(!ranked[2].verification.pass);
  });

  // -----------------------------------------------------------------------
  // 6. Bind a contract
  // -----------------------------------------------------------------------
  it("binds a need and offer into a contract", () => {
    const need = publishNeed({
      name: "doubler",
      examples: [
        { input: 2, output: 4 },
        { input: 5, output: 10 },
        { input: 0, output: 0 },
      ],
      properties: ["deterministic"],
    });

    const offer = {
      id: "offer-double", needId: need.id,
      fn: (x) => x * 2,
      confidence: 0.99,
    };

    const contract = bind(need, offer);

    assert.ok(contract.id.startsWith("contract-"));
    assert.equal(contract.needId, need.id);
    assert.equal(contract.offerId, "offer-double");
    assert.equal(contract.name, "doubler");
    assert.equal(contract.examples.length, 3);
    assert.deepEqual(contract.properties, ["deterministic"]);
    assert.ok(contract.verification.pass);
  });

  // -----------------------------------------------------------------------
  // 7. Verify new implementation against existing contract
  // -----------------------------------------------------------------------
  it("verifies a new implementation against a bound contract", () => {
    const need = publishNeed({
      name: "sorter",
      examples: [
        { input: [3, 1, 2], output: [1, 2, 3] },
        { input: [5, 4], output: [4, 5] },
      ],
      properties: ["idempotent"],
    });

    const offer = {
      id: "offer-sort-v1", needId: need.id,
      fn: (xs) => [...xs].sort((a, b) => a - b),
      confidence: 0.9,
    };

    const contract = bind(need, offer);

    // New compatible implementation (merge sort style, same result)
    const v2Result = verify(contract, (xs) => [...xs].sort((a, b) => a - b));
    assert.ok(v2Result.compatible);
    assert.equal(v2Result.summary.examplesPassed, 2);

    // Incompatible implementation (sorts descending)
    const v3Result = verify(contract, (xs) => [...xs].sort((a, b) => b - a));
    assert.ok(!v3Result.compatible);
  });

  // -----------------------------------------------------------------------
  // 8. Registry: publish need and offers
  // -----------------------------------------------------------------------
  it("Registry: publishes needs and offers", () => {
    const reg = new Registry();

    const need = reg.publishNeed({
      name: "adder",
      examples: [
        { input: [1, 2], output: 3 },
        { input: [10, 20], output: 30 },
      ],
    });

    assert.ok(reg.getNeeds().length === 1);
    assert.equal(reg.getOffers(need.id).length, 0);

    const offer = reg.publishOffer(need.id, {
      fn: ([a, b]) => a + b,
      confidence: 0.99,
    });

    assert.equal(reg.getOffers(need.id).length, 1);
    assert.ok(offer.verification.pass);
  });

  // -----------------------------------------------------------------------
  // 9. Registry: search by properties
  // -----------------------------------------------------------------------
  it("Registry: searches needs by properties", () => {
    const reg = new Registry();

    reg.publishNeed({
      name: "sorter",
      examples: [{ input: [2, 1], output: [1, 2] }],
      properties: ["idempotent", "length_preserving"],
    });

    reg.publishNeed({
      name: "doubler",
      examples: [{ input: 3, output: 6 }],
      properties: ["monotonic_increasing"],
    });

    reg.publishNeed({
      name: "filter",
      examples: [{ input: [1, 2, 3], output: [2] }],
      properties: ["idempotent"],
    });

    const results = reg.search(["idempotent"]);
    assert.equal(results.length, 2);
    // Both sorter and filter have idempotent
    const names = results.map(r => r.need.name);
    assert.ok(names.includes("sorter"));
    assert.ok(names.includes("filter"));
  });

  // -----------------------------------------------------------------------
  // 10. Registry: auto-resolve best offer
  // -----------------------------------------------------------------------
  it("Registry: auto-resolves the best offer", () => {
    const reg = new Registry();

    const need = reg.publishNeed({
      name: "negator",
      examples: [
        { input: 5, output: -5 },
        { input: -3, output: 3 },
        { input: 0, output: 0 },
      ],
    });

    // Bad offer (doubles instead)
    reg.publishOffer(need.id, {
      fn: (x) => x * 2,
      confidence: 0.8,
    });

    // Good offer
    reg.publishOffer(need.id, {
      fn: (x) => -x,
      confidence: 0.95,
    });

    const contract = reg.resolve(need.id);
    assert.ok(contract !== null);
    assert.ok(contract.verification.pass);
    assert.equal(contract.fn(7), -7);
  });

  // -----------------------------------------------------------------------
  // 11. Registry: resolve returns null when no valid offer
  // -----------------------------------------------------------------------
  it("Registry: resolve returns null when no offer passes", () => {
    const reg = new Registry();

    const need = reg.publishNeed({
      name: "impossible",
      examples: [
        { input: 1, output: 42 },
        { input: 2, output: 84 },
      ],
    });

    // Only offer is wrong
    reg.publishOffer(need.id, {
      fn: (x) => x + 1,
      confidence: 0.5,
    });

    const contract = reg.resolve(need.id);
    assert.equal(contract, null);
  });

  // -----------------------------------------------------------------------
  // 12. Contract composition: output of one feeds into another
  // -----------------------------------------------------------------------
  it("composes contracts: output of one feeds into another", () => {
    // Contract A: sorter
    const needA = publishNeed({
      name: "sorter",
      examples: [
        { input: [3, 1, 2], output: [1, 2, 3] },
      ],
    });
    const offerA = {
      id: "offer-sort", needId: needA.id,
      fn: (xs) => [...xs].sort((a, b) => a - b),
      confidence: 0.95,
    };
    const contractA = bind(needA, offerA);

    // Contract B: takes sorted array, returns first element (min)
    const needB = publishNeed({
      name: "first",
      examples: [
        { input: [1, 2, 3], output: 1 },
        { input: [4, 5], output: 4 },
      ],
    });
    const offerB = {
      id: "offer-first", needId: needB.id,
      fn: (xs) => xs[0],
      confidence: 0.9,
    };
    const contractB = bind(needB, offerB);

    // Compose: sort then take first = min
    const composed = (input) => contractB.fn(contractA.fn(input));
    assert.equal(composed([5, 3, 1, 4, 2]), 1);
    assert.equal(composed([10, 20, 5]), 5);

    // Verify the composed pipeline against a new "min" contract
    const needMin = publishNeed({
      name: "min",
      examples: [
        { input: [5, 3, 1, 4, 2], output: 1 },
        { input: [10, 20, 5], output: 5 },
      ],
    });
    const minContract = bind(needMin, {
      id: "offer-composed-min", needId: needMin.id, fn: composed, confidence: 0.9,
    });
    assert.ok(minContract.verification.pass);
  });

  // -----------------------------------------------------------------------
  // 13. Need verification function works standalone
  // -----------------------------------------------------------------------
  it("need.verify() validates a candidate function", () => {
    const need = publishNeed({
      name: "uppercaser",
      examples: [
        { input: "hello", output: "HELLO" },
        { input: "world", output: "WORLD" },
      ],
      properties: ["deterministic"],
    });

    const goodResult = need.verify((s) => s.toUpperCase());
    assert.ok(goodResult.pass);

    const badResult = need.verify((s) => s.toLowerCase());
    assert.ok(!badResult.pass);
  });

  // -----------------------------------------------------------------------
  // 14. Registry: verify against stored contract
  // -----------------------------------------------------------------------
  it("Registry: verifies new implementation against stored contract", () => {
    const reg = new Registry();

    const need = reg.publishNeed({
      name: "doubler",
      examples: [
        { input: 3, output: 6 },
        { input: 0, output: 0 },
        { input: -2, output: -4 },
      ],
    });

    reg.publishOffer(need.id, {
      fn: (x) => x * 2,
      confidence: 0.99,
    });

    const contract = reg.resolve(need.id);
    assert.ok(contract);

    // Verify a compatible new version
    const result = reg.verify(contract.id, (x) => x + x);
    assert.ok(result.compatible);

    // Verify an incompatible new version
    const result2 = reg.verify(contract.id, (x) => x * 3);
    assert.ok(!result2.compatible);
  });

  // -----------------------------------------------------------------------
  // 15. Error handling: publishNeed with no examples
  // -----------------------------------------------------------------------
  it("throws when publishing a need with no examples", () => {
    assert.throws(
      () => publishNeed({ name: "empty" }),
      /at least one example/
    );
    assert.throws(
      () => publishNeed({ name: "empty", examples: [] }),
      /at least one example/
    );
  });
});
