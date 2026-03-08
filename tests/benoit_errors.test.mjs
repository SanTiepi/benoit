import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { transpile, BenoitError } from "../src/transpile.mjs";

describe("BenoitError — syntax error reporting", () => {

  it("throws BenoitError for stray '=>'", () => {
    assert.throws(
      () => transpile("=> hello"),
      (e) => e instanceof BenoitError && e.line === 1 && e.message.includes("=>")
    );
  });

  it("includes line number in error", () => {
    try {
      transpile("name: 42\n=> oops");
      assert.fail("should have thrown");
    } catch (e) {
      assert.ok(e instanceof BenoitError);
      assert.equal(e.line, 2);
    }
  });

  it("format() includes filename when provided", () => {
    try {
      transpile("=> bad", { filename: "test.ben" });
      assert.fail("should have thrown");
    } catch (e) {
      assert.ok(e.message.includes("test.ben:1"));
    }
  });

  it("does not throw on valid code", () => {
    assert.doesNotThrow(() => transpile("add a,b -> a + b"));
    assert.doesNotThrow(() => transpile('name: "hello"'));
    assert.doesNotThrow(() => transpile("-- comment"));
    assert.doesNotThrow(() => transpile(""));
  });

  it("BenoitError has correct properties", () => {
    const err = new BenoitError("test msg", 5, 3, "source line");
    assert.equal(err.name, "BenoitError");
    assert.equal(err.line, 5);
    assert.equal(err.column, 3);
    assert.equal(err.source, "source line");
  });

  it("format() produces readable output", () => {
    const err = new BenoitError("bad token", 10, 5, "x => y");
    const formatted = err.format("demo.ben");
    assert.ok(formatted.includes("demo.ben:10"));
    assert.ok(formatted.includes("bad token"));
    assert.ok(formatted.includes("x => y"));
    assert.ok(formatted.includes("^"));
  });
});
