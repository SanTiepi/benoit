import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { compose, composeModules, diff } from "../src/compose.mjs";
import { encode } from "../src/protocol.mjs";

const MODULE_A = `add a,b -> a + b

negate x -> 0 - x

double x -> x * 2`;

const MODULE_B = `sub a,b -> a - b

halve x -> x / 2

flip x -> 0 - x`;

const MODULE_C = `square x -> x * x

abs x -> Math.abs(x)`;

describe("Benoît Module Composition", () => {

  it("composes two modules from source", () => {
    const result = composeModules(MODULE_A, MODULE_B);
    assert.strictEqual(result.modulesComposed, 2);
    assert.ok(result.stats.totalFunctions >= 5);
  });

  it("discovers cross-module equivalence (negate ≡ flip)", () => {
    const result = composeModules(MODULE_A, MODULE_B);
    const eq = result.crossModule.equivalences.find(
      e => (e.functionA === "negate" && e.functionB === "flip") ||
           (e.functionA === "flip" && e.functionB === "negate")
    );
    assert.ok(eq, "negate and flip should be equivalent");
  });

  it("discovers cross-module inverse pair (double ↔ halve)", () => {
    const result = composeModules(MODULE_A, MODULE_B);
    const inv = result.crossModule.inverses.find(
      i => (i.f === "double" && i.g === "halve") ||
           (i.f === "halve" && i.g === "double")
    );
    assert.ok(inv, "double and halve should be inverse pair");
  });

  it("discovers cross-module composition properties", () => {
    const result = composeModules(MODULE_A, MODULE_C);
    // square(negate(x)) should produce even_composition or non_negative
    assert.ok(result.crossModule.compositions.length > 0);
  });

  it("builds unified function registry", () => {
    const result = composeModules(MODULE_A, MODULE_B);
    assert.ok(result.unified.length >= 5);
    const doubleEntry = result.unified.find(u => u.name === "double");
    assert.ok(doubleEntry);
    assert.strictEqual(doubleEntry.arity, 1);
  });

  it("handles three-module composition", () => {
    const result = composeModules(MODULE_A, MODULE_B, MODULE_C);
    assert.strictEqual(result.modulesComposed, 3);
    assert.ok(result.stats.totalFunctions >= 7);
  });

  it("compose from protocol messages validates version", () => {
    const bad = { protocol: "benoit-protocol-v999", functions: [] };
    const result = compose(bad, encode(MODULE_A));
    assert.ok(result.error);
  });

  it("compose from protocol messages collects functions", () => {
    const result = compose(encode(MODULE_A), encode(MODULE_B));
    assert.strictEqual(result.modulesComposed, 2);
    assert.ok(result.stats.totalFunctions >= 5);
  });

  it("diff detects new functions", () => {
    const msgA = encode(MODULE_A);
    const msgAB = encode(MODULE_A + "\n\nsquare x -> x * x");
    const d = diff(msgA, msgAB);
    assert.ok(d.newFunctions > 0);
    assert.ok(d.isCompatible);
  });

  it("diff detects removed functions", () => {
    const full = encode(MODULE_A);
    const partial = encode("add a,b -> a + b");
    const d = diff(full, partial);
    assert.ok(d.removed > 0);
    assert.strictEqual(d.isCompatible, false);
  });

  it("diff reports zero changes for identical messages", () => {
    const msg = encode(MODULE_A);
    const d = diff(msg, msg);
    assert.strictEqual(d.newFunctions, 0);
    assert.strictEqual(d.changed, 0);
    assert.strictEqual(d.removed, 0);
  });
});
