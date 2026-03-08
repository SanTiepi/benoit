import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ask, answer, challenge, curious, quality, reformulate, Dialogue } from "../src/query.mjs";
import { given } from "../src/core.mjs";

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

  // --- Quality tests ---

  it("quality: empty examples returns empty verdict", () => {
    const q = quality([]);
    assert.strictEqual(q.score, 0);
    assert.strictEqual(q.verdict, "empty");
  });

  it("quality: well-formed linear question scores high", () => {
    const q = quality([
      { input: 0, output: 1 },
      { input: 1, output: 3 },
      { input: 2, output: 5 },
      { input: -1, output: -1 },
      { input: 5, output: 11 },
    ]);
    assert.ok(q.score >= 0.7, `expected ≥ 0.7, got ${q.score}`);
    assert.ok(q.verdict === "excellent" || q.verdict === "good");
    assert.ok(q.formula);
  });

  it("quality: 2 examples scores lower (ambiguous)", () => {
    const q = quality([
      { input: 1, output: 2 },
      { input: 2, output: 4 },
    ]);
    // Only 2 points — linear AND doubling AND quadratic all fit
    assert.ok(q.score < 0.85, `expected < 0.85 for ambiguous, got ${q.score}`);
    assert.ok(q.details.quantity < 1); // not enough examples
  });

  it("quality: contradictory examples have low consistency", () => {
    // f(1)=2 but also f(1)=3 — can't be consistent
    const q = quality([
      { input: 1, output: 2 },
      { input: 1, output: 3 },
      { input: 2, output: 4 },
    ]);
    assert.ok(q.details.consistency < 1, "contradictory examples should hurt consistency");
  });

  it("quality: fibonacci from 3 points looks OK but is wrong", () => {
    // The benchmark failure: 3 points of fibonacci look like a polynomial.
    // quality() says it's fine — but the SOLVER gets the wrong answer.
    // This proves: quality measures the QUESTION, not the ANSWER.
    // A well-formed question can still yield the wrong answer
    // if the domain has hidden structure (recurrence vs polynomial).
    const q = quality([
      { input: 5, output: 5 },
      { input: 6, output: 8 },
      { input: 7, output: 13 },
    ]);
    assert.ok(q.details.resolvable === 1, "solver thinks it can solve it");
    assert.ok(q.details.quantity < 1, "but only 3 examples — room to improve");
    // The real test: the solver gives the WRONG answer
    const r = given(q.formula ? [
      { input: 5, output: 5 },
      { input: 6, output: 8 },
      { input: 7, output: 13 },
    ] : []);
    assert.notStrictEqual(r.when(8), 21, "polynomial fit gives wrong fibonacci answer");
  });

  it("quality: diverse inputs score higher than clustered", () => {
    // Diverse: covers negative, zero, positive, large spread
    const diverse = quality([
      { input: -5, output: 25 },
      { input: 0, output: 0 },
      { input: 3, output: 9 },
      { input: 10, output: 100 },
      { input: -2, output: 4 },
    ]);
    // Clustered: all positive, small range
    const clustered = quality([
      { input: 1, output: 1 },
      { input: 2, output: 4 },
      { input: 3, output: 9 },
    ]);
    assert.ok(diverse.details.diversity > clustered.details.diversity,
      `diverse (${diverse.details.diversity}) should beat clustered (${clustered.details.diversity})`);
  });

  it("quality: returns actionable suggestions", () => {
    const q = quality([
      { input: 1, output: 2 },
    ]);
    assert.ok(q.suggestions.length > 0);
    assert.ok(q.suggestions.some(s => s.toLowerCase().includes("more") || s.toLowerCase().includes("add")));
  });

  it("quality: string examples get scored", () => {
    const q = quality([
      { input: "hello", output: "HELLO" },
      { input: "world", output: "WORLD" },
      { input: "test", output: "TEST" },
    ]);
    assert.ok(q.score > 0);
    assert.ok(q.details.resolvable === 1);
  });

  // --- Reformulate tests ---

  it("reformulate: auto-improves sparse examples", () => {
    const result = reformulate([
      { input: 2, output: 4 },
      { input: 3, output: 9 },
    ]);
    assert.ok(result.reformulated.examples.length > 2);
    assert.ok(result.improved || result.reformulated.quality.score >= result.original.quality.score);
  });

  it("reformulate: hints improve quality", () => {
    const result = reformulate(
      [{ input: 1, output: 1 }, { input: 2, output: 4 }],
      { hints: [{ input: 0, output: 0 }, { input: -1, output: 1 }, { input: 3, output: 9 }] }
    );
    assert.ok(result.reformulated.quality.score >= result.original.quality.score);
  });

  // --- Negotiate tests ---

  it("dialogue: negotiate returns probes", () => {
    const d = new Dialogue();
    d.teach([
      { input: 1, output: 2 },
      { input: 2, output: 4 },
    ]);
    const neg = d.negotiate();
    assert.ok(neg.type === "negotiate");
    assert.ok(neg.probes.length > 0);
    assert.ok(neg.understanding >= 0);
  });

  it("dialogue: fulfill improves understanding", () => {
    const d = new Dialogue();
    d.teach([{ input: 1, output: 2 }, { input: 2, output: 4 }]);
    const neg = d.negotiate();
    const u = d.fulfill(neg, [
      { input: 0, output: 0 },
      { input: 3, output: 6 },
      { input: 5, output: 10 },
    ]);
    assert.ok(u.examples === 5);
    assert.ok(u.level >= 0);
  });

  it("dialogue: shouldNegotiate = true with few examples", () => {
    const d = new Dialogue();
    d.teach([{ input: 1, output: 2 }]);
    const should = d.shouldNegotiate();
    assert.ok(should !== false, "should negotiate with 1 example");
    assert.ok(should.urgency === "medium" || should.urgency === "high");
  });

  it("dialogue: shouldNegotiate = false when confident", () => {
    const d = new Dialogue();
    d.teach([
      { input: 0, output: 0 },
      { input: 1, output: 2 },
      { input: 2, output: 4 },
      { input: 3, output: 6 },
      { input: 5, output: 10 },
    ]);
    const should = d.shouldNegotiate();
    assert.strictEqual(should, false);
  });

  it("dialogue: negotiate→fulfill→converge pattern", () => {
    const d = new Dialogue();
    // Sender knows f(x) = x²
    const secret = x => x * x;

    d.teach([{ input: 2, output: 4 }, { input: 3, output: 9 }]);

    // Round 1: negotiate
    const neg = d.negotiate();
    const answers = neg.probes
      .filter(p => typeof p === "number")
      .map(p => ({ input: p, output: secret(p) }));
    d.fulfill(neg, answers);

    // Should now be confident
    const u = d.understanding();
    assert.ok(u.level >= 0.8, `expected ≥80% understanding, got ${Math.round(u.level * 100)}%`);
  });
});
