import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  distance,
  behaviorDistance,
  propertyDistance,
  nearest,
  cluster,
} from "../src/distance.mjs";

const ADD      = "add a,b -> a + b";
const MUL      = "mul a,b -> a * b";
const NEGATE_A = "negate x -> 0 - x";
const NEGATE_B = "flip x -> 0 - x";
const DOUBLE   = "double x -> x * 2";
const HALVE    = "halve x -> x / 2";
const SQUARE   = "square x -> x * x";
const IDENTITY = "id x -> x";

describe("Benoît Semantic Distance", () => {

  // 1. Self-distance is zero
  it("distance(f, f) == 0 for any function", () => {
    assert.strictEqual(distance(ADD, ADD), 0);
    assert.strictEqual(distance(NEGATE_A, NEGATE_A), 0);
    assert.strictEqual(distance(SQUARE, SQUARE), 0);
  });

  // 2. Behaviourally identical functions have distance 0
  it("distance(negate, negate) == 0 (same behaviour, different name)", () => {
    const d = behaviorDistance(NEGATE_A, NEGATE_B);
    assert.strictEqual(d, 0);
  });

  // 3. Different functions have positive distance
  it("distance(add, mul) > 0", () => {
    const d = distance(ADD, MUL);
    assert.ok(d > 0, `expected positive distance, got ${d}`);
  });

  // 4. behaviorDistance for clearly different unary functions
  it("behaviorDistance(double, square) > 0", () => {
    const d = behaviorDistance(DOUBLE, SQUARE);
    assert.ok(d > 0, `expected positive distance, got ${d}`);
  });

  // 5. propertyDistance — identical properties → 0
  it("propertyDistance is 0 for functions with the same property set", () => {
    const d = propertyDistance(NEGATE_A, NEGATE_B);
    assert.strictEqual(d, 0);
  });

  // 6. nearest finds the correct match
  it("nearest picks the behaviourally closest function", () => {
    const candidates = [ADD, DOUBLE, SQUARE, NEGATE_B];
    const result = nearest(NEGATE_A, candidates);
    assert.strictEqual(result.source, NEGATE_B);
    assert.strictEqual(result.distance, 0);
  });

  // 7. cluster groups equivalent functions together
  it("cluster groups equivalent functions together", () => {
    const sources = [NEGATE_A, DOUBLE, NEGATE_B, HALVE];
    const groups = cluster(sources, 0.15);
    // negate and flip should be in the same cluster
    const negCluster = groups.find(g => g.includes(NEGATE_A));
    assert.ok(negCluster, "negate should appear in a cluster");
    assert.ok(negCluster.includes(NEGATE_B), "negate and flip should be clustered together");
  });

  // 8. distance is bounded in [0, 1]
  it("distance is bounded between 0 and 1", () => {
    const pairs = [
      [ADD, MUL],
      [NEGATE_A, DOUBLE],
      [SQUARE, IDENTITY],
      [HALVE, DOUBLE],
    ];
    for (const [a, b] of pairs) {
      const d = distance(a, b);
      assert.ok(d >= 0 && d <= 1, `distance out of range: ${d}`);
    }
  });

  // 9. symmetry: distance(a,b) == distance(b,a)
  it("distance is symmetric", () => {
    const d1 = distance(ADD, MUL);
    const d2 = distance(MUL, ADD);
    assert.strictEqual(d1, d2);
  });

  // 10. identity function has zero distance to itself
  it("identity function has distance 0 to itself", () => {
    assert.strictEqual(distance(IDENTITY, IDENTITY), 0);
  });
});
