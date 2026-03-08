import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { transpile } from "../src/transpile.mjs";
import { writeFileSync, unlinkSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function execBen(src) {
  const js = transpile(src);
  const tmpFile = join(tmpdir(), `ben_guard_${Date.now()}_${Math.random().toString(36).slice(2)}.mjs`);
  writeFileSync(tmpFile, js);
  try {
    return { mod: await import(pathToFileURL(tmpFile).href), js };
  } finally {
    unlinkSync(tmpFile);
  }
}

describe("Benoît guard clauses in match", () => {
  it("match with when guard", async () => {
    const { mod } = await execBen([
      "classify x ->",
      "  match x ->",
      '    | _ when x > 0 => "positive"',
      '    | _ when x < 0 => "negative"',
      '    | _ => "zero"',
    ].join("\n"));
    assert.equal(mod.classify(5), "positive");
    assert.equal(mod.classify(-3), "negative");
    assert.equal(mod.classify(0), "zero");
  });

  it("inline match with when guard", async () => {
    const { mod } = await execBen(
      'sign x -> match x | _ when x > 0 => "+" | _ when x < 0 => "-" | _ => "0"'
    );
    assert.equal(mod.sign(10), "+");
    assert.equal(mod.sign(-7), "-");
    assert.equal(mod.sign(0), "0");
  });

  it("range pattern in match", async () => {
    const { mod } = await execBen([
      "grade score ->",
      "  match score ->",
      '    | 90..100 => "A"',
      '    | 80..89 => "B"',
      '    | 70..79 => "C"',
      '    | _ => "F"',
    ].join("\n"));
    assert.equal(mod.grade(95), "A");
    assert.equal(mod.grade(85), "B");
    assert.equal(mod.grade(75), "C");
    assert.equal(mod.grade(50), "F");
  });

  it("inline range pattern", async () => {
    const { mod } = await execBen(
      'tier n -> match n | 1..3 => "low" | 4..7 => "mid" | 8..10 => "high" | _ => "?"'
    );
    assert.equal(mod.tier(2), "low");
    assert.equal(mod.tier(5), "mid");
    assert.equal(mod.tier(9), "high");
    assert.equal(mod.tier(0), "?");
  });

  it("tagged values still work with guards", async () => {
    const { mod } = await execBen([
      "handle result ->",
      "  match result ->",
      '    | Success data => "OK: " + data',
      '    | Error reason => "ERR: " + reason',
      '    | _ => "unknown"',
    ].join("\n"));
    assert.equal(mod.handle({ tag: "Success", value: "done" }), "OK: done");
    assert.equal(mod.handle({ tag: "Error", value: "fail" }), "ERR: fail");
    assert.equal(mod.handle(42), "unknown");
  });

  it("match with mixed patterns, guards, and ranges", async () => {
    const { mod } = await execBen([
      "describe x ->",
      "  match x ->",
      '    | 0 => "zero"',
      '    | 1..9 => "single digit"',
      '    | _ when x < 0 => "negative"',
      '    | _ => "big"',
    ].join("\n"));
    assert.equal(mod.describe(0), "zero");
    assert.equal(mod.describe(5), "single digit");
    assert.equal(mod.describe(-3), "negative");
    assert.equal(mod.describe(42), "big");
  });
});
