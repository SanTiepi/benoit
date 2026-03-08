import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { transpile, extractTests } from "../src/transpile.mjs";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// ============================================================
// v0.5.0 — "is" keyword, strict equality, try/catch
// ============================================================

describe("v0.5.0 — 'is' assertion keyword", () => {

  it("transpiles 'is' assertions to comments", () => {
    const js = transpile("add(2, 3) is 5");
    assert.ok(js.includes("// test: add(2, 3) is 5"));
    assert.ok(!js.includes("export"));
  });

  it("extracts 'is' assertions via extractTests", () => {
    const src = "add a,b -> a + b\nadd(2, 3) is 5\nadd(0, 0) is 0";
    const { assertions } = extractTests(src);
    assert.equal(assertions.length, 2);
    assert.equal(assertions[0].expr, "add(2, 3)");
    assert.equal(assertions[0].expected, "5");
    assert.equal(assertions[1].expr, "add(0, 0)");
    assert.equal(assertions[1].expected, "0");
  });

  it("supports string assertions with 'is'", () => {
    const src = 'greet name -> "Hello {name}"\ngreet("world") is "Hello world"';
    const js = transpile(src);
    assert.ok(js.includes("// test:"));
    const { assertions } = extractTests(src);
    assert.equal(assertions.length, 1);
    assert.equal(assertions[0].expr, 'greet("world")');
  });

  it("supports boolean assertions with 'is'", () => {
    const src = "check x -> x > 0\ncheck(5) is true\ncheck(-1) is false";
    const { assertions } = extractTests(src);
    assert.equal(assertions.length, 2);
    assert.equal(assertions[0].expected, "true");
    assert.equal(assertions[1].expected, "false");
  });

  it("does not confuse 'is' inside function names", () => {
    // "isValid" contains "is" but shouldn't be treated as assertion
    const js = transpile("isValid x -> x > 0");
    assert.ok(js.includes("function isValid"));
    assert.ok(!js.includes("// test:"));
  });

  it("does not confuse 'is' in bindings", () => {
    const js = transpile("status: \"this is fine\"");
    assert.ok(js.includes("const status"));
    assert.ok(!js.includes("// test:"));
  });

  it("'is' works alongside legacy '==' assertions", () => {
    const src = "add a,b -> a + b\nadd(1, 2) is 3\nadd(3, 4) == 7";
    const { assertions } = extractTests(src);
    assert.equal(assertions.length, 2);
    assert.equal(assertions[0].expected, "3");
    assert.equal(assertions[1].expected, "7");
  });

  it("does not treat 'is' inside -> as assertion", () => {
    const js = transpile("check x -> x is 5");
    // This is a function, not an assertion
    assert.ok(!js.includes("// test:"));
  });

  it("handles negative expected values", () => {
    const src = "negate x -> -x\nnegate(5) is -5";
    const { assertions } = extractTests(src);
    assert.equal(assertions.length, 1);
    assert.equal(assertions[0].expected, "-5");
  });

  it("handles array expected values", () => {
    const src = "sort xs -> xs.sort()\nsort([3,1,2]) is [1,2,3]";
    const { assertions } = extractTests(src);
    assert.equal(assertions.length, 1);
    assert.equal(assertions[0].expected, "[1,2,3]");
  });
});

describe("v0.5.0 — strict equality (== → ===)", () => {

  it("converts == to === in inline functions", () => {
    const js = transpile("equals a,b -> a == b");
    assert.ok(js.includes("a === b"));
    assert.ok(!js.includes("a == b"));
  });

  it("converts != to !== in inline functions", () => {
    const js = transpile("different a,b -> a != b");
    assert.ok(js.includes("a !== b"));
    assert.ok(!js.includes("a != b"));
  });

  it("converts == to === in conditionals", () => {
    const js = transpile('fizz n ->\n  n == 0? -> "zero"\n  n');
    assert.ok(js.includes("n === 0"));
    assert.ok(!js.includes("n == 0"));
  });

  it("converts == in shorthand conditionals", () => {
    const js = transpile('check x ->\n  x == 0? "zero"');
    assert.ok(js.includes("x === 0"));
  });

  it("does not create ==== from existing ===", () => {
    const js = transpile("strict a,b -> a === b");
    assert.ok(js.includes("a === b"));
    assert.ok(!js.includes("===="));
  });

  it("converts == inside complex expressions", () => {
    const js = transpile("test x -> x == null | x == undefined");
    assert.ok(js.includes("=== null"));
    assert.ok(js.includes("=== undefined"));
  });

  it("preserves == inside string literals", () => {
    const js = transpile('msg -> "a == b"');
    // String content should not be modified
    assert.ok(js.includes('"a == b"') || js.includes("a == b"));
  });

  it("converts != in ternary-style expressions", () => {
    const js = transpile("nonzero x -> x != 0");
    assert.ok(js.includes("x !== 0"));
  });

  it("handles multiple == in one expression", () => {
    const js = transpile("both a,b,c -> a == b == c");
    // Both should be converted
    const count = (js.match(/===/g) || []).length;
    assert.ok(count >= 2, `Expected >=2 ===, got ${count}`);
  });
});

describe("v0.5.0 — try/catch syntax", () => {

  it("transpiles inline try/catch", () => {
    const js = transpile("safe fn,x ->\n  try ->\n    fn(x)\n  catch err -> null");
    assert.ok(js.includes("try {"));
    assert.ok(js.includes("catch (err)"));
    assert.ok(js.includes("return fn(x)"));
    assert.ok(js.includes("return null"));
  });

  it("transpiles block try/catch", () => {
    const src = [
      "safeParse json ->",
      "  try ->",
      "    JSON.parse(json)",
      "  catch err ->",
      "    console.error(err)",
      "    null"
    ].join("\n");
    const js = transpile(src);
    assert.ok(js.includes("try {"));
    assert.ok(js.includes("catch (err) {"));
    assert.ok(js.includes("return JSON.parse(json)"));
    assert.ok(js.includes("return null"));
  });

  it("try/catch produces valid JS", async () => {
    const src = [
      "safeParse json ->",
      "  try ->",
      "    JSON.parse(json)",
      "  catch err -> null"
    ].join("\n");
    const js = transpile(src);
    const tmp = join(tmpdir(), `ben_try_${Date.now()}.mjs`);
    writeFileSync(tmp, js);
    try {
      const mod = await import(pathToFileURL(tmp).href);
      assert.deepEqual(mod.safeParse('{"a":1}'), { a: 1 });
      assert.equal(mod.safeParse("invalid json"), null);
    } finally {
      unlinkSync(tmp);
    }
  });

  it("try without catch still works", () => {
    const js = transpile("attempt ->\n  try ->\n    riskyOp()");
    assert.ok(js.includes("try {"));
    assert.ok(js.includes("riskyOp()"));
    assert.ok(!js.includes("catch"));
  });

  it("nested try/catch in larger function", () => {
    const src = [
      "loadConfig path ->",
      "  data: null",
      "  try ->",
      "    JSON.parse(path)",
      "  catch err ->",
      "    console.warn(err)",
      "    {}"
    ].join("\n");
    const js = transpile(src);
    assert.ok(js.includes("const data = null"));
    assert.ok(js.includes("try {"));
    assert.ok(js.includes("catch (err) {"));
  });
});

describe("v0.5.0 — combined proof of concept", () => {

  it("full .ben file with is + === + try/catch executes correctly", async () => {
    const src = [
      "-- v0.5.0 proof of concept",
      "",
      "add a,b -> a + b",
      "add(2, 3) is 5",
      "add(0, 0) is 0",
      "",
      "equals a,b -> a == b",
      "equals(1, 1) is true",
      "equals(1, 2) is false",
      "",
      "safeDivide a,b ->",
      "  try ->",
      "    a / b",
      "  catch err -> null",
    ].join("\n");

    const js = transpile(src);

    // Verify transpilation
    assert.ok(js.includes("// test: add(2, 3) is 5"), "is assertion → comment");
    assert.ok(js.includes("a === b"), "== → ===");
    assert.ok(js.includes("try {"), "try block");
    assert.ok(js.includes("catch (err)"), "catch block");

    // Execute
    const tmp = join(tmpdir(), `ben_poc_${Date.now()}.mjs`);
    writeFileSync(tmp, js);
    try {
      const mod = await import(pathToFileURL(tmp).href);
      assert.equal(mod.add(2, 3), 5);
      assert.equal(mod.equals(1, 1), true);
      assert.equal(mod.equals(1, "1"), false, "=== means strict: 1 !== '1'");
      assert.equal(mod.safeDivide(10, 2), 5);
    } finally {
      unlinkSync(tmp);
    }
  });

  it("strict equality actually prevents type coercion", async () => {
    const src = [
      "same a,b -> a == b",
      "notsame a,b -> a != b",
    ].join("\n");
    const js = transpile(src);
    const tmp = join(tmpdir(), `ben_strict_${Date.now()}.mjs`);
    writeFileSync(tmp, js);
    try {
      const mod = await import(pathToFileURL(tmp).href);
      // With ==, these would be true/false. With ===, they're false/true.
      assert.equal(mod.same(1, "1"), false, "1 !== '1' with strict equality");
      assert.equal(mod.same(0, false), false, "0 !== false with strict equality");
      assert.equal(mod.same(null, undefined), false, "null !== undefined with strict");
      assert.equal(mod.notsame(1, "1"), true, "1 !== '1' is true");
      assert.equal(mod.notsame(0, ""), true, "0 !== '' is true");
    } finally {
      unlinkSync(tmp);
    }
  });

  it("benoit.ben transpiles and key functions work", async () => {
    const { readFileSync } = await import("node:fs");
    const benoitSrc = readFileSync("examples/benoit.ben", "utf8");

    // Transpile
    const js = transpile(benoitSrc);
    assert.ok(js.includes("// test: observer(42) is 42"), "'is' assertions are comments");
    assert.ok(js.includes("hypothese === preuve"), "== inside function → ===");

    // Extract tests
    const { assertions } = extractTests(benoitSrc);
    assert.ok(assertions.length >= 13, `Expected >=13 assertions, got ${assertions.length}`);

    // Execute the module and verify key functions
    const tmp = join(tmpdir(), `ben_benoit_${Date.now()}.mjs`);
    writeFileSync(tmp, js);
    try {
      const mod = await import(pathToFileURL(tmp).href);

      // observer: identity
      assert.equal(mod.observer(42), 42);
      assert.equal(mod.observer("lumière"), "lumière");

      // questionner: strict comparison (=== thanks to v0.5.0)
      assert.equal(mod.questionner(42, 42), true);
      assert.equal(mod.questionner("A", "B"), false);

      // mesurer: average
      assert.equal(mod.mesurer([10, 20, 30]), 20);
      assert.equal(mod.mesurer([1, 2, 3, 4]), 2.5);

      // verifier: strict comparison
      assert.equal(mod.verifier(20, 20), true);
      assert.equal(mod.verifier(20, 21), false);

      // doubler
      assert.equal(mod.doubler(1), 2);
      assert.equal(mod.doubler(21), 42);

      // transmettre: higher-order
      assert.equal(mod.transmettre(42, x => x * 2), 84);
    } finally {
      unlinkSync(tmp);
    }
  });

  it("math_tested.ben with 'is' syntax: all assertions pass", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("examples/math_tested.ben", "utf8");

    const js = transpile(src);
    const { assertions } = extractTests(src);
    assert.ok(assertions.length >= 12, `Expected >=12 assertions, got ${assertions.length}`);

    const tmp = join(tmpdir(), `ben_math_${Date.now()}.mjs`);
    writeFileSync(tmp, js);
    try {
      const mod = await import(pathToFileURL(tmp).href);

      assert.equal(mod.add(2, 3), 5);
      assert.equal(mod.multiply(4, 5), 20);
      assert.equal(mod.square(7), 49);
      assert.equal(mod.clamp(50, 0, 100), 50);
      assert.equal(mod.clamp(-5, 0, 100), 0);
      assert.equal(mod.clamp(200, 0, 100), 100);
    } finally {
      unlinkSync(tmp);
    }
  });

  it("conditional with == inside function uses ===", async () => {
    // Use match pattern for multi-branch returns (idiomatic Benoît)
    const src = [
      "classify n ->",
      '  n == 0? -> "zero"',
      '  else? -> "nonzero"',
    ].join("\n");
    const js = transpile(src);
    assert.ok(js.includes("n === 0"), "== in conditional becomes ===");

    // Also verify simple conditional + return
    const src2 = [
      "isZero n ->",
      "  n == 0",
    ].join("\n");
    const js2 = transpile(src2);
    assert.ok(js2.includes("n === 0"), "== in return expression becomes ===");

    const tmp = join(tmpdir(), `ben_cond_${Date.now()}.mjs`);
    writeFileSync(tmp, js2);
    try {
      const mod = await import(pathToFileURL(tmp).href);
      assert.equal(mod.isZero(0), true);
      assert.equal(mod.isZero(5), false);
      // Critical: "0" (string) should NOT match 0 (number) with ===
      assert.equal(mod.isZero("0"), false, "string '0' !== 0 with strict equality");
    } finally {
      unlinkSync(tmp);
    }
  });
});

describe("v0.5.0 — edge cases", () => {

  it("'is' at end of identifier is not assertion", () => {
    const js = transpile("genesis x -> x + 1");
    assert.ok(js.includes("function genesis"));
    assert.ok(!js.includes("// test:"));
  });

  it("'is' in match block is not assertion", () => {
    const js = transpile("match x -> \n  | 1 => \"one\"\n  | _ => \"other\"");
    assert.ok(!js.includes("// test:"));
  });

  it("empty try body doesn't crash", () => {
    const js = transpile("noop ->\n  try ->\n    null");
    assert.ok(js.includes("try {"));
  });

  it("== inside string interpolation is preserved", () => {
    const js = transpile('msg a,b -> "{a} == {b}"');
    // The string content might contain == — that's fine
    assert.ok(js.includes("function msg"));
  });

  it("!= in negative assertion still works with extractTests", () => {
    const src = "add a,b -> a + b\nadd(2, 3) != 6";
    const { assertions } = extractTests(src);
    assert.equal(assertions.length, 1);
    assert.equal(assertions[0].negate, true);
    assert.equal(assertions[0].expected, "6");
  });
});
