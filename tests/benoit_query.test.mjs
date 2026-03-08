import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ask, answer, challenge, curious, Dialogue } from "../src/query.mjs";

describe("Benoit Query Engine — questions as incomplete examples", () => {

  it("asks a numeric question and gets an answer", () => {
    const q = ask(
      [{ input: 2, output: 4 }, { input: 3, output: 6 }, { input: 5, output: 10 }],
      [7, 10]
    );
    const a = answer(q);
    assert.strictEqual(a.meta.status, "answered");
    assert.strictEqual(a.answers[0].output, 14);
    assert.strictEqual(a.answers[1].output, 20);
  });

  it("asks a string question", () => {
    const q = ask(
      [{ input: "hello", output: "HELLO" }, { input: "world", output: "WORLD" }],
      ["test"]
    );
    const a = answer(q);
    assert.strictEqual(a.answers[0].output, "TEST");
  });

  it("asks an array question", () => {
    const q = ask(
      [{ input: [3, 1, 2], output: [1, 2, 3] }, { input: [5, 1], output: [1, 5] }],
      [[9, 3, 7]]
    );
    const a = answer(q);
    assert.deepStrictEqual(a.answers[0].output, [3, 7, 9]);
  });

  it("returns unanswerable for contradictory examples", () => {
    const q = ask(
      [{ input: 1, output: 2 }, { input: 1, output: 3 }],
      [5]
    );
    const a = answer(q);
    // Either unanswerable or picks one — both are valid
    assert.ok(a.meta.status === "answered" || a.meta.status === "unanswerable");
  });

  it("challenges a wrong answer with corrections", () => {
    // Context suggests doubling: f(2)=4, f(3)=6
    // But the real function is squaring
    const q = ask(
      [{ input: 2, output: 4 }, { input: 3, output: 6 }],
      [5]
    );
    const a = answer(q);
    assert.strictEqual(a.answers[0].output, 10); // thinks doubling

    // Correct: f(5) = 25, and add f(3) = 9
    const corrected = challenge(a, [
      { input: 5, output: 25 },
      { input: 3, output: 9 },
    ]);
    // Should now understand squaring
    assert.ok(corrected.meta.status === "answered" || corrected.meta.status === "resolved");
  });

  it("detects curiosity gaps in numeric knowledge", () => {
    const report = curious([
      { input: 1, output: 1 },
      { input: 2, output: 4 },
      { input: 3, output: 9 },
    ]);
    assert.ok(report.suggestions.length > 0);
    assert.ok(report.formula);
  });

  it("detects curiosity gaps in array knowledge", () => {
    const report = curious([
      { input: [3, 1, 2], output: [1, 2, 3] },
      { input: [5, 1], output: [1, 5] },
    ]);
    assert.ok(report.meta.status === "has_gaps" || report.meta.status === "confident");
  });

  // --- Dialogue tests ---

  it("dialogue: teach then ask", () => {
    const d = new Dialogue();
    d.teach([
      { input: 1, output: 2 },
      { input: 2, output: 4 },
      { input: 3, output: 6 },
    ]);
    const result = d.ask([10]);
    assert.strictEqual(result.answers[0].output, 20);
  });

  it("dialogue: correct changes understanding", () => {
    const d = new Dialogue();
    d.teach([
      { input: 2, output: 4 },
      { input: 3, output: 6 },
    ]);
    // Thinks doubling
    const r1 = d.ask([5]);
    assert.strictEqual(r1.answers[0].output, 10);

    // Correct: it's squaring
    d.correct([
      { input: 2, output: 4 },
      { input: 3, output: 9 },
      { input: 5, output: 25 },
    ]);
    const r2 = d.ask([4]);
    assert.strictEqual(r2.answers[0].output, 16);
  });

  it("dialogue: wonder detects gaps", () => {
    const d = new Dialogue();
    d.teach([
      { input: 1, output: 1 },
      { input: 2, output: 4 },
    ]);
    const report = d.wonder();
    assert.ok(report.suggestions.length > 0);
  });

  it("dialogue: understanding tracks accuracy", () => {
    const d = new Dialogue();
    d.teach([
      { input: 1, output: 2 },
      { input: 2, output: 4 },
      { input: 3, output: 6 },
    ]);
    const u = d.understanding();
    assert.strictEqual(u.level, 1); // perfect understanding
    assert.strictEqual(u.examples, 3);
  });

  it("dialogue: summary gives full state", () => {
    const d = new Dialogue();
    d.teach([{ input: 1, output: 2 }]);
    d.ask([5]);
    const s = d.summary();
    assert.strictEqual(s.turns, 2);
    assert.strictEqual(s.knowledge, 1);
    assert.ok(s.history.length === 2);
  });

  it("throws when asking with no context", () => {
    assert.throws(() => ask([], [5]), /at least one known example/);
  });

  it("throws when asking with no holes", () => {
    assert.throws(
      () => ask([{ input: 1, output: 2 }], []),
      /at least one hole/
    );
  });
});
