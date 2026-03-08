import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { transpile } from "../src/transpile.mjs";

describe("Benoît imports", () => {

  it("transpiles node builtin import", () => {
    const js = transpile("use crypto.randomUUID");
    assert.ok(js.includes('import { randomUUID } from "node:crypto";'));
  });

  it("transpiles local named import", () => {
    const js = transpile("use ./math.add");
    assert.ok(js.includes('import { add } from "./math.mjs";'));
  });

  it("transpiles local multi-name import", () => {
    const js = transpile("use ./math.add, subtract, multiply");
    assert.ok(js.includes('import { add, subtract, multiply } from "./math.mjs";'));
  });

  it("transpiles local wildcard import", () => {
    const js = transpile("use ./utils");
    assert.ok(js.includes('import * as utils from "./utils.mjs";'));
  });

  it("transpiles nested path import", () => {
    const js = transpile("use ./lib/helpers.format, parse");
    assert.ok(js.includes('import { format, parse } from "./lib/helpers.mjs";'));
  });
});
