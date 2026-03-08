import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { transpile } from "../src/transpile.mjs";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function execBen(src) {
  const js = transpile(src);
  const tmpFile = join(tmpdir(), `ben_${Date.now()}_${Math.random().toString(36).slice(2)}.mjs`);
  writeFileSync(tmpFile, js);
  try {
    return { mod: await import(pathToFileURL(tmpFile).href), js };
  } finally {
    unlinkSync(tmpFile);
  }
}

describe("Benoît showcase: real execution", () => {
  const src = readFileSync("examples/showcase.ben", "utf8");

  it("transpiles showcase without error", () => {
    const js = transpile(src);
    assert.ok(js.length > 0);
    console.log("=== Benoît showcase → JS ===");
    console.log(js);
  });

  it("pure functions execute correctly", async () => {
    const { mod } = await execBen(src);
    assert.equal(mod.add(2, 3), 5);
    assert.equal(mod.square(7), 49);
    assert.equal(mod.clamp(50, 0, 100), 50);
    assert.equal(mod.clamp(-5, 0, 100), 0);
    assert.equal(mod.clamp(200, 0, 100), 100);
  });

  it("fallback chains work", async () => {
    const { mod } = await execBen(src);
    assert.equal(mod.resolve(null, "backup", "last"), "backup");
    assert.equal(mod.resolve("first", "backup", "last"), "first");
    assert.equal(mod.resolve(null, null, "last"), "last");
  });

  it("closures via multiplier", async () => {
    const { mod } = await execBen(src);
    const double = mod.multiplier(2);
    const triple = mod.multiplier(3);
    assert.equal(double(5), 10);
    assert.equal(triple(5), 15);
  });

  it("counter factory with state", async () => {
    const { mod } = await execBen(src);
    const c = mod.counter(10);
    assert.equal(c.get(), 10);
    c.increment();
    c.increment();
    assert.equal(c.get(), 12);
    c.reset();
    assert.equal(c.get(), 10);
  });

  it("cache with LRU eviction", async () => {
    const { mod } = await execBen(src);
    const cache = mod.createCache(3);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);
    assert.equal(cache.get("a"), 1);
    assert.equal(cache.size(), 3);
    // Adding 4th item evicts oldest
    cache.set("d", 4);
    assert.equal(cache.size(), 3);
    assert.equal(cache.has("a"), false); // evicted
    assert.equal(cache.get("d"), 4);
  });

  it("private functions are not exported", async () => {
    const { mod } = await execBen(src);
    assert.equal(mod._validate, undefined);
    assert.equal(mod._apply, undefined);
  });
});
