import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { transpile } from "../src/transpile.mjs";
import { writeFileSync, unlinkSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function execBen(src) {
  const js = transpile(src);
  const tmpFile = join(tmpdir(), `ben_interp_${Date.now()}_${Math.random().toString(36).slice(2)}.mjs`);
  writeFileSync(tmpFile, js);
  try {
    return { mod: await import(pathToFileURL(tmpFile).href), js };
  } finally {
    unlinkSync(tmpFile);
  }
}

describe("Benoit string interpolation", () => {
  it("transpiles simple variable interpolation", () => {
    const js = transpile('greet name -> "Hello {name}"');
    assert.ok(js.includes("`Hello ${name}`"), `Expected template literal, got: ${js}`);
  });

  it("transpiles expression interpolation", () => {
    const js = transpile('show a,b -> "Result: {a + b}"');
    assert.ok(js.includes("`Result: ${a + b}`"), `Expected expression interpolation, got: ${js}`);
  });

  it("transpiles function call interpolation", () => {
    const js = transpile('show x -> "Value: {double(x)}"');
    assert.ok(js.includes("`Value: ${double(x)}`"), `Expected fn call interpolation, got: ${js}`);
  });

  it("leaves regular strings without braces unchanged", () => {
    const js = transpile('msg: "hello world"');
    assert.ok(js.includes('"hello world"'), `Should keep regular string, got: ${js}`);
    assert.ok(!js.includes("`"), `Should not use template literal, got: ${js}`);
  });

  it("handles multiple interpolations in one string", () => {
    const js = transpile('full first,last -> "Name: {first} {last}"');
    assert.ok(js.includes("`Name: ${first} ${last}`"), `Expected multiple interpolations, got: ${js}`);
  });

  it("works in bindings", () => {
    const js = transpile('msg: "count is {total}"');
    assert.ok(js.includes("`count is ${total}`"), `Expected interpolation in binding, got: ${js}`);
  });

  it("executes simple interpolation", async () => {
    const { mod } = await execBen('greet name -> "Hello {name}!"');
    assert.equal(mod.greet("Alice"), "Hello Alice!");
  });

  it("executes expression interpolation", async () => {
    const { mod } = await execBen([
      '_add a,b -> a + b',
      'show a,b -> "Sum: {_add(a,b)}"',
    ].join("\n"));
    assert.equal(mod.show(2, 3), "Sum: 5");
  });

  it("executes with mixed text and multiple interpolations", async () => {
    const { mod } = await execBen('intro first,last -> "{first} {last} here"');
    assert.equal(mod.intro("Bob", "Smith"), "Bob Smith here");
  });
});
