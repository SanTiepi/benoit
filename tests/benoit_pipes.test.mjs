import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { transpile } from "../src/transpile.mjs";
import { writeFileSync, unlinkSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function execBen(src) {
  const js = transpile(src);
  const tmpFile = join(tmpdir(), `ben_pipe_${Date.now()}_${Math.random().toString(36).slice(2)}.mjs`);
  writeFileSync(tmpFile, js);
  try {
    return { mod: await import(pathToFileURL(tmpFile).href), js };
  } finally {
    unlinkSync(tmpFile);
  }
}

describe("Benoît pipe operator |>", () => {
  it("transpiles simple pipe: a |> fn", () => {
    const js = transpile("result: 5 |> double");
    assert.ok(js.includes("double(5)"), `Expected double(5), got: ${js}`);
  });

  it("transpiles chained pipes: a |> fn1 |> fn2", () => {
    const js = transpile("result: 5 |> double |> square");
    assert.ok(js.includes("square(double(5))"), `Expected nested calls, got: ${js}`);
  });

  it("transpiles pipe with args: a |> fn arg", () => {
    const js = transpile("result: 5 |> add 3");
    assert.ok(js.includes("add(5, 3)"), `Expected add(5, 3), got: ${js}`);
  });

  it("transpiles pipe chain with args", () => {
    const js = transpile("result: 5 |> add 3 |> multiply 2");
    assert.ok(js.includes("multiply(add(5, 3), 2)"), `Expected nested with args, got: ${js}`);
  });

  it("does not transform >= or > (comparison)", () => {
    const js = transpile("isAbove x,limit -> x > limit");
    assert.ok(js.includes("x > limit"), "should not transform comparison >");
  });

  it("executes simple pipe chain", async () => {
    const { mod } = await execBen([
      "_double x -> x * 2",
      "_addOne x -> x + 1",
      "transform x -> x |> _double |> _addOne",
    ].join("\n"));
    assert.equal(mod.transform(5), 11); // double(5)=10, addOne(10)=11
  });

  it("executes pipe with extra args", async () => {
    const { mod } = await execBen([
      "_add a,b -> a + b",
      "_multiply a,b -> a * b",
      "compute x -> x |> _add 3 |> _multiply 2",
    ].join("\n"));
    assert.equal(mod.compute(5), 16); // add(5,3)=8, multiply(8,2)=16
  });

  it("comparison > still works in execution", async () => {
    const { mod } = await execBen([
      "isAbove x,limit -> x > limit",
      "isBelow x,limit -> x < limit",
    ].join("\n"));
    assert.equal(mod.isAbove(15, 10), true);
    assert.equal(mod.isAbove(5, 10), false);
    assert.equal(mod.isBelow(5, 10), true);
  });
});
