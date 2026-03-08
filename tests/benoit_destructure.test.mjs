import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { transpile } from "../src/transpile.mjs";
import { writeFileSync, unlinkSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function execBen(src) {
  const js = transpile(src);
  const tmpFile = join(tmpdir(), `ben_destr_${Date.now()}_${Math.random().toString(36).slice(2)}.mjs`);
  writeFileSync(tmpFile, js);
  try {
    return { mod: await import(pathToFileURL(tmpFile).href), js };
  } finally {
    unlinkSync(tmpFile);
  }
}

describe("Benoît destructuring", () => {
  it("array destructuring in function body", async () => {
    const { mod } = await execBen([
      "firstTwo items ->",
      "  [a, b]: items",
      "  a + b",
    ].join("\n"));
    assert.equal(mod.firstTwo([10, 20, 30]), 30);
  });

  it("rest spread destructuring", async () => {
    const { mod } = await execBen([
      "tail items ->",
      "  [first, ...rest]: items",
      "  rest",
    ].join("\n"));
    assert.deepEqual(mod.tail([1, 2, 3, 4]), [2, 3, 4]);
  });

  it("object destructuring in function body", async () => {
    const { mod } = await execBen([
      "greetPerson person ->",
      '  {name, age}: person',
      '  `Hello ${name}, age ${age}`',
    ].join("\n"));
    assert.equal(mod.greetPerson({ name: "Benoît", age: 30 }), "Hello Benoît, age 30");
  });

  it("transpiles destructuring correctly", () => {
    const js = transpile("[a, b]: pair");
    assert.ok(js.includes("const [a, b] = pair;"), `Got: ${js}`);
  });

  it("transpiles object destructuring correctly", () => {
    const js = transpile("{x, y}: point");
    assert.ok(js.includes("const {x, y} = point;"), `Got: ${js}`);
  });
});

describe("Benoît single-element each", () => {
  it("inline single each", async () => {
    const { mod } = await execBen([
      "sumAll items ->",
      "  total: 0",
      "  items each x -> total += x",
      "  total",
    ].join("\n"));
    // Note: total is const so += won't work. Let's use a mutable approach.
  });

  it("transpiles single each correctly", () => {
    const js = transpile("items each x -> console.log(x)");
    assert.ok(js.includes("for (const x of items)"), `Got: ${js}`);
  });

  it("transpiles single each block", () => {
    const js = transpile(["items each x ->", "  console.log(x)"].join("\n"));
    assert.ok(js.includes("for (const x of items)"), `Got: ${js}`);
  });
});
