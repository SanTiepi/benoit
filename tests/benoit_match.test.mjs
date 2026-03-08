import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { transpile } from "../src/transpile.mjs";
import { writeFileSync, unlinkSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function execBen(src) {
  const js = transpile(src);
  const tmpFile = join(tmpdir(), `ben_match_${Date.now()}_${Math.random().toString(36).slice(2)}.mjs`);
  writeFileSync(tmpFile, js);
  try {
    return { mod: await import(pathToFileURL(tmpFile).href), js };
  } finally {
    unlinkSync(tmpFile);
  }
}

describe("Benoît pattern matching", () => {
  it("transpiles and executes match with numbers", async () => {
    const { mod, js } = await execBen([
      "classify x ->",
      "  match x ->",
      '    | 1 => "one"',
      '    | 2 => "two"',
      '    | _ => "other"',
    ].join("\n"));
    console.log("=== Match output ===");
    console.log(js);
    assert.equal(mod.classify(1), "one");
    assert.equal(mod.classify(2), "two");
    assert.equal(mod.classify(99), "other");
  });

  it("executes match with string patterns", async () => {
    const { mod } = await execBen([
      "greet lang ->",
      "  match lang ->",
      '    | "en" => "Hello"',
      '    | "fr" => "Bonjour"',
      '    | "de" => "Hallo"',
      '    | _ => "Hi"',
    ].join("\n"));
    assert.equal(mod.greet("en"), "Hello");
    assert.equal(mod.greet("fr"), "Bonjour");
    assert.equal(mod.greet("de"), "Hallo");
    assert.equal(mod.greet("jp"), "Hi");
  });

  it("executes match with tagged values (algebraic types)", async () => {
    const { mod } = await execBen([
      "handle result ->",
      "  match result ->",
      '    | Success data => "OK: " + data',
      '    | Error reason => "FAIL: " + reason',
      '    | _ => "unknown"',
    ].join("\n"));
    assert.equal(mod.handle({ tag: "Success", value: "done" }), "OK: done");
    assert.equal(mod.handle({ tag: "Error", value: "timeout" }), "FAIL: timeout");
    assert.equal(mod.handle(42), "unknown");
  });

  it("executes match with boolean", async () => {
    const { mod } = await execBen([
      "describe x ->",
      "  match x > 0 ->",
      '    | true => "positive"',
      '    | false => "non-positive"',
    ].join("\n"));
    assert.equal(mod.describe(5), "positive");
    assert.equal(mod.describe(-3), "non-positive");
  });

  it("executes inline match", async () => {
    const { mod, js } = await execBen([
      'label x -> match x | 1 => "one" | 2 => "two" | _ => "other"',
    ].join("\n"));
    console.log("=== Inline match ===");
    console.log(js);
    assert.equal(mod.label(1), "one");
    assert.equal(mod.label(2), "two");
    assert.equal(mod.label(3), "other");
  });

  it("match as binding value", async () => {
    const { mod } = await execBen([
      "httpStatus code ->",
      "  match code ->",
      '    | 200 => "OK"',
      '    | 404 => "Not Found"',
      '    | 500 => "Internal Error"',
      '    | _ => "Unknown"',
    ].join("\n"));
    assert.equal(mod.httpStatus(200), "OK");
    assert.equal(mod.httpStatus(404), "Not Found");
    assert.equal(mod.httpStatus(500), "Internal Error");
    assert.equal(mod.httpStatus(418), "Unknown");
  });
});

describe("Benoît async/await", () => {
  it("transpiles async function with args", () => {
    const js = transpile("async fetchData url -> await fetch(url)");
    assert.ok(js.includes("async function fetchData"));
    assert.ok(js.includes("await fetch(url)"));
  });

  it("transpiles async block function", () => {
    const js = transpile([
      "async processAll items ->",
      "  results: []",
      "  items",
    ].join("\n"));
    assert.ok(js.includes("async function processAll"));
  });

  it("transpiles async no-arg function", () => {
    const js = transpile("async init -> await setup()");
    assert.ok(js.includes("async function init()"));
  });

  it("executes async function with await", async () => {
    const { mod } = await execBen([
      "async delayed x ->",
      "  result: await Promise.resolve(x * 2)",
      "  result",
    ].join("\n"));
    assert.equal(await mod.delayed(5), 10);
    assert.equal(await mod.delayed(21), 42);
  });

  it("executes async with pipe", async () => {
    const { mod } = await execBen([
      "_double x -> x * 2",
      "async transform x ->",
      "  val: await Promise.resolve(x)",
      "  val |> _double",
    ].join("\n"));
    assert.equal(await mod.transform(5), 10);
  });

  it("executes async no-arg function", async () => {
    const { mod } = await execBen([
      "async getAnswer ->",
      "  result: await Promise.resolve(42)",
      "  result",
    ].join("\n"));
    assert.equal(await mod.getAnswer(), 42);
  });
});
