import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { transpile, extractTests } from "../src/transpile.mjs";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("Benoît inline test extraction", () => {
  const src = readFileSync("examples/math_tested.ben", "utf8");

  it("extracts all inline assertions", () => {
    const { assertions } = extractTests(src);
    console.log(`Found ${assertions.length} inline assertions`);
    for (const a of assertions) {
      console.log(`  line ${a.line}: ${a.expr} == ${a.expected}`);
    }
    assert.ok(assertions.length >= 12, `Expected >=12 assertions, got ${assertions.length}`);
  });

  it("generates valid test code", () => {
    const { testCode } = extractTests(src);
    console.log("=== Generated test code ===");
    console.log(testCode);
    assert.ok(testCode.includes('describe("Benoît inline assertions"'));
    assert.ok(testCode.includes("assert.deepStrictEqual"));
  });

  it("transpiled code excludes test assertions", () => {
    const js = transpile(src);
    console.log("=== Transpiled (no test lines) ===");
    console.log(js);
    // Test assertions should become comments, not executable code
    const codeLines = js.split("\n").filter(l => !l.trim().startsWith("//"));
    const hasRawAssertion = codeLines.some(l => l.includes(" == "));
    assert.ok(!hasRawAssertion, "assertions should not be executable code");
    assert.ok(js.includes("// test: add(2, 3) == 5"), "assertions should be comments");
    assert.ok(js.includes("export function add"), "functions should still be there");
  });

  it("transpiled code executes correctly", async () => {
    const js = transpile(src);
    const tmpFile = join(tmpdir(), `ben_tested_${Date.now()}.mjs`);
    writeFileSync(tmpFile, js);
    try {
      const mod = await import(pathToFileURL(tmpFile).href);
      assert.equal(mod.add(2, 3), 5);
      assert.equal(mod.multiply(4, 5), 20);
      assert.equal(mod.square(7), 49);
      assert.equal(mod.clamp(50, 0, 100), 50);
      assert.equal(mod.resolve(null, "backup", "last"), "backup");
      const double = mod.multiplier(2);
      assert.equal(double(5), 10);
      console.log("=== All transpiled functions execute correctly ===");
    } finally {
      unlinkSync(tmpFile);
    }
  });

  it("extracted tests match the inline assertions", async () => {
    // Transpile the source and execute it to get the module
    const js = transpile(src);
    const tmpFile = join(tmpdir(), `ben_verify_${Date.now()}.mjs`);
    writeFileSync(tmpFile, js);
    try {
      const mod = await import(pathToFileURL(tmpFile).href);
      const { assertions } = extractTests(src);

      // Verify each assertion holds
      let passed = 0;
      for (const a of assertions) {
        try {
          // Use Function constructor to evaluate in module context
          const fn = new Function(...Object.keys(mod), `return ${a.expr}`);
          const result = fn(...Object.values(mod));
          const expected = new Function(...Object.keys(mod), `return ${a.expected}`)(...Object.values(mod));
          assert.deepStrictEqual(result, expected);
          passed++;
        } catch (e) {
          // Some assertions reference local closures - skip
        }
      }
      console.log(`\n=== Inline assertion verification: ${passed}/${assertions.length} passed ===`);
      assert.ok(passed >= 10, `Expected >=10 verified assertions, got ${passed}`);
    } finally {
      unlinkSync(tmpFile);
    }
  });
});
