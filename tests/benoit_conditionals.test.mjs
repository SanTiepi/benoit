import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { transpile } from "../src/transpile.mjs";
import { writeFileSync, unlinkSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("Benoît else/elif conditionals", () => {

  it("transpiles inline if/else", () => {
    const js = transpile("x > 0? -> \"positive\"\nelse? -> \"non-positive\"");
    assert.ok(js.includes("if (x > 0)"));
    assert.ok(js.includes("else"));
    assert.ok(js.includes("non-positive"));
  });

  it("transpiles inline if/elif/else", () => {
    const js = transpile("x > 0? -> \"pos\"\nx == 0? -> \"zero\"\nelse? -> \"neg\"");
    assert.ok(js.includes("if (x > 0)"));
    assert.ok(js.includes("else if (x == 0)"));
    assert.ok(js.includes("else"));
  });

  it("transpiles block if/else", () => {
    const js = transpile("x > 0? ->\n  console.log(\"yes\")\nelse? ->\n  console.log(\"no\")");
    assert.ok(js.includes("if (x > 0) {"));
    assert.ok(js.includes("} else {"));
  });

  it("executes inline if/else correctly", async () => {
    const src = [
      'classify x ->',
      '  x > 0? -> "positive"',
      '  else? -> "non-positive"',
    ].join("\n");
    const js = transpile(src);
    const tmpFile = join(tmpdir(), `ben_cond_${Date.now()}.mjs`);
    writeFileSync(tmpFile, js);
    try {
      const mod = await import(pathToFileURL(tmpFile).href);
      assert.equal(mod.classify(5), "positive");
      assert.equal(mod.classify(-3), "non-positive");
    } finally {
      unlinkSync(tmpFile);
    }
  });

  it("executes if/elif/else correctly", async () => {
    const src = [
      'sign x ->',
      '  x > 0? -> "positive"',
      '  x < 0? -> "negative"',
      '  else? -> "zero"',
    ].join("\n");
    const js = transpile(src);
    const tmpFile = join(tmpdir(), `ben_elif_${Date.now()}.mjs`);
    writeFileSync(tmpFile, js);
    try {
      const mod = await import(pathToFileURL(tmpFile).href);
      assert.equal(mod.sign(10), "positive");
      assert.equal(mod.sign(-5), "negative");
      assert.equal(mod.sign(0), "zero");
    } finally {
      unlinkSync(tmpFile);
    }
  });

  it("executes block if/else correctly", async () => {
    const src = [
      'abs x ->',
      '  x >= 0? ->',
      '    x',
      '  else? ->',
      '    0 - x',
    ].join("\n");
    const js = transpile(src);
    const tmpFile = join(tmpdir(), `ben_blockelse_${Date.now()}.mjs`);
    writeFileSync(tmpFile, js);
    try {
      const mod = await import(pathToFileURL(tmpFile).href);
      assert.equal(mod.abs(5), 5);
      assert.equal(mod.abs(-3), 3);
    } finally {
      unlinkSync(tmpFile);
    }
  });

  it("standalone if without else still works", () => {
    const js = transpile('x > 0? console.log("yes")');
    assert.ok(js.includes("if (x > 0)"));
    assert.ok(!js.includes("else"));
  });
});
