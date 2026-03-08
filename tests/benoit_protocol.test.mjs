import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { encode, decode, exchange } from "../src/protocol.mjs";

describe("Benoît Communication Protocol", () => {

  const simpleSource = `add a,b -> a + b
add(2, 3) == 5
add(-1, 1) == 0

square x -> x * x
square(0) == 0
square(3) == 9
square(-5) == 25`;

  it("encode produces a valid protocol message", () => {
    const msg = encode(simpleSource);
    assert.strictEqual(msg.protocol, "benoit-protocol-v1");
    assert.ok(msg.functions.length >= 2);
    assert.ok(msg.functions.every(f => f.name && f.arity >= 0));
    assert.ok(msg.functions.every(f => Array.isArray(f.assertions)));
    assert.ok(msg.functions.every(f => Array.isArray(f.properties)));
  });

  it("decode reconstructs functions from message", () => {
    const msg = encode(simpleSource);
    const json = JSON.stringify(msg);
    const result = decode(json);
    assert.ok(result.functions.add);
    assert.ok(result.functions.square);
  });

  it("decode verifies all assertions", () => {
    const msg = encode(simpleSource);
    const result = decode(JSON.stringify(msg));
    assert.strictEqual(result.verification.assertions.passed, result.verification.assertions.total);
  });

  it("decode verifies all properties", () => {
    const msg = encode(simpleSource);
    const result = decode(JSON.stringify(msg));
    assert.strictEqual(result.verification.properties.passed, result.verification.properties.total);
  });

  it("exchange runs full cycle and returns report", () => {
    const report = exchange(simpleSource);
    assert.ok(report.message);
    assert.ok(report.messageSize > 0);
    assert.ok(report.result);
    assert.strictEqual(report.summary.sourceCodeTransmitted, 0);
    assert.ok(report.result.total.passed > 0);
  });

  it("exchange achieves high verification rate", () => {
    const report = exchange(simpleSource);
    const rate = report.result.total.passed / report.result.total.total;
    assert.ok(rate >= 0.9, `Verification rate ${rate} should be >= 0.9`);
  });

  it("handles message as JSON string", () => {
    const msg = encode(simpleSource);
    const json = JSON.stringify(msg);
    const result = decode(json);
    assert.ok(result.functions.add);
  });

  it("handles message as object", () => {
    const msg = encode(simpleSource);
    const result = decode(msg);
    assert.ok(result.functions.add);
  });

  it("rejects unknown protocol version", () => {
    const result = decode({ protocol: "unknown-v99", functions: [] });
    assert.ok(result.error);
  });

  it("encodes algebra metadata", () => {
    const msg = encode(simpleSource);
    assert.ok(msg.algebra);
    assert.ok(Array.isArray(msg.algebra.equivalenceClasses));
    assert.ok(Array.isArray(msg.algebra.inversePairs));
    assert.ok(Array.isArray(msg.algebra.surprises));
  });

  it("includes meta statistics", () => {
    const msg = encode(simpleSource);
    assert.ok(msg.meta);
    assert.ok(msg.meta.sourceSize > 0);
    assert.ok(msg.meta.functionCount >= 2);
    assert.ok(msg.meta.propertyCount > 0);
  });
});
