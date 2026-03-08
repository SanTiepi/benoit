// Benoit Query Engine
//
// The final insight: if instructions are complete examples,
// then questions are INCOMPLETE examples.
//
// A query is a behavioral specification with holes.
// The answer is the completion of those holes.
//
// This unifies everything:
//   Instruction = complete examples     (intent.mjs)
//   Question    = examples with holes   (query.mjs)
//   Learning    = filling holes over time
//   Teaching    = providing examples that fill gaps
//   Curiosity   = detecting where your examples have holes

import { encodeIntent, resolveIntent, executeIntent } from "./intent.mjs";

// ---------------------------------------------------------------------------
// Core: A Query is an example with a hole
// ---------------------------------------------------------------------------

/**
 * Create a query — a behavioral question.
 *
 * A query provides known input/output pairs (context) plus one or more
 * inputs whose outputs are unknown (the holes).
 *
 * @param {Array<{input: *, output: *}>} known - Known examples (context)
 * @param {Array<*>} holes - Inputs whose outputs are unknown (the questions)
 * @param {string[]} [properties] - Optional property constraints
 * @returns {object} A query object
 */
export function ask(known, holes, properties = []) {
  if (!Array.isArray(known) || known.length === 0) {
    throw new Error("A query needs at least one known example as context");
  }
  if (!Array.isArray(holes) || holes.length === 0) {
    throw new Error("A query needs at least one hole (the question)");
  }

  return {
    type: "query",
    known,
    holes,
    properties,
    meta: { status: "open" },
  };
}

/**
 * Answer a query — fill the holes by synthesizing from the known examples.
 *
 * @param {object} query - A query created by ask()
 * @returns {object} The query with answers filled in
 */
export function answer(query) {
  const { known, holes, properties } = query;

  // Build an intent from the known examples
  const intent = encodeIntent(known, properties);
  const resolved = resolveIntent(intent);

  if (!resolved.fn) {
    return {
      ...query,
      answers: holes.map(h => ({ input: h, output: null, confidence: 0 })),
      meta: { status: "unanswerable", reason: "could not synthesize from context" },
    };
  }

  // Fill each hole
  const answers = holes.map(hole => {
    try {
      const output = resolved.fn(hole);
      return {
        input: hole,
        output,
        confidence: resolved.meta.confidence || 0,
      };
    } catch {
      return { input: hole, output: null, confidence: 0 };
    }
  });

  return {
    ...query,
    answers,
    formula: resolved.meta.synthesized,
    meta: {
      status: "answered",
      formula: resolved.meta.synthesized,
      confidence: resolved.meta.confidence,
    },
  };
}

/**
 * Challenge an answer — provide counter-evidence.
 *
 * "Your answer to f(5) was 10, but I know f(5) = 25."
 * This adds the correction to the known set and re-answers.
 *
 * @param {object} answeredQuery - A previously answered query
 * @param {Array<{input: *, output: *}>} corrections - Corrections to apply
 * @returns {object} Re-answered query with updated understanding
 */
export function challenge(answeredQuery, corrections) {
  // Merge corrections into known examples (corrections override)
  const knownMap = new Map();
  for (const ex of answeredQuery.known) {
    knownMap.set(JSON.stringify(ex.input), ex);
  }
  for (const c of corrections) {
    knownMap.set(JSON.stringify(c.input), c);
  }

  // Remove corrected inputs from holes (they're now known)
  const correctedInputs = new Set(corrections.map(c => JSON.stringify(c.input)));
  const remainingHoles = answeredQuery.holes.filter(
    h => !correctedInputs.has(JSON.stringify(h))
  );

  // If no holes remain, the query is fully resolved
  if (remainingHoles.length === 0) {
    return {
      type: "query",
      known: [...knownMap.values()],
      holes: [],
      properties: answeredQuery.properties,
      answers: [],
      meta: { status: "resolved", reason: "all holes filled by corrections" },
    };
  }

  // Re-ask with expanded knowledge
  const newQuery = ask(
    [...knownMap.values()],
    remainingHoles,
    answeredQuery.properties
  );
  return answer(newQuery);
}

// ---------------------------------------------------------------------------
// Curiosity: detect gaps in your own knowledge
// ---------------------------------------------------------------------------

/**
 * Given a set of known examples, detect where the knowledge has gaps.
 *
 * Curiosity probes the boundaries of the synthesized function to find
 * inputs where the model is uncertain or behaves unexpectedly.
 *
 * @param {Array<{input: *, output: *}>} known - Known examples
 * @param {object} [options] - Options
 * @param {number} [options.probeCount] - Number of probe points (default 20)
 * @returns {object} Curiosity report with suggested questions
 */
export function curious(known, options = {}) {
  const { probeCount = 20 } = options;

  const intent = encodeIntent(known);
  const resolved = resolveIntent(intent);

  if (!resolved.fn) {
    return {
      gaps: [],
      suggestions: known.map(k => k.input),
      meta: { status: "no_model", reason: "cannot synthesize — all inputs are gaps" },
    };
  }

  // Determine the type of inputs
  const firstInput = known[0].input;
  const isNumeric = typeof firstInput === "number";
  const isArray = Array.isArray(firstInput);
  const isString = typeof firstInput === "string";

  const gaps = [];
  const suggestions = [];

  if (isNumeric) {
    // Find the range of known inputs
    const knownInputs = known.map(k => k.input).filter(x => typeof x === "number");
    const min = Math.min(...knownInputs);
    const max = Math.max(...knownInputs);
    const range = max - min || 10;

    // Probe: extrapolate beyond known range
    const probes = [];
    for (let i = 0; i < probeCount; i++) {
      // Inside range (interpolation)
      probes.push(min + (range * i) / probeCount);
      // Outside range (extrapolation)
      probes.push(max + (range * i) / probeCount);
      probes.push(min - (range * i) / probeCount);
    }

    // Also probe edge cases
    probes.push(0, -1, 1, 0.5, -0.5, Infinity, -Infinity, NaN);

    for (const probe of probes) {
      try {
        const result = resolved.fn(probe);
        // Flag as gap if: result is NaN, Infinity, or differs wildly
        if (typeof result !== "number" || !Number.isFinite(result)) {
          gaps.push({ input: probe, output: result, reason: "non-finite output" });
        }
      } catch {
        gaps.push({ input: probe, output: null, reason: "throws error" });
      }
    }

    // Suggest questions at boundaries
    suggestions.push(
      min - range * 0.5,  // left extrapolation
      max + range * 0.5,  // right extrapolation
      (min + max) / 2,    // midpoint
      0,                  // origin
    );
  }

  if (isArray) {
    // Probe: empty array, single element, large array
    const probeArrays = [
      [],
      [0],
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      [-1, -2, -3],
      [100],
    ];
    for (const probe of probeArrays) {
      try {
        const result = resolved.fn(probe);
        if (result === null || result === undefined) {
          gaps.push({ input: probe, output: result, reason: "null/undefined output" });
        }
      } catch {
        gaps.push({ input: probe, output: null, reason: "throws error" });
      }
    }
    suggestions.push([], [0], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  }

  if (isString) {
    const probeStrings = ["", " ", "a", "HELLO", "hello world", "123", "\n"];
    for (const probe of probeStrings) {
      try {
        const result = resolved.fn(probe);
        if (result === null || result === undefined) {
          gaps.push({ input: probe, output: result, reason: "null/undefined output" });
        }
      } catch {
        gaps.push({ input: probe, output: null, reason: "throws error" });
      }
    }
    suggestions.push("", "test", "HELLO");
  }

  // Deduplicate gaps
  const uniqueGaps = [];
  const seen = new Set();
  for (const gap of gaps) {
    const key = JSON.stringify(gap.input);
    if (!seen.has(key)) {
      seen.add(key);
      uniqueGaps.push(gap);
    }
  }

  return {
    gaps: uniqueGaps,
    suggestions: suggestions.filter(s => {
      const key = JSON.stringify(s);
      return !known.some(k => JSON.stringify(k.input) === key);
    }),
    formula: resolved.meta.synthesized,
    meta: {
      status: uniqueGaps.length > 0 ? "has_gaps" : "confident",
      gapCount: uniqueGaps.length,
      confidence: resolved.meta.confidence,
    },
  };
}

// ---------------------------------------------------------------------------
// Dialogue: a back-and-forth exchange of queries and answers
// ---------------------------------------------------------------------------

/**
 * A Dialogue is a stateful exchange between two agents.
 * Each turn is either a query (question) or an observation (teaching).
 * Understanding grows as examples accumulate.
 */
export class Dialogue {
  constructor() {
    this.knowledge = [];  // accumulated {input, output} pairs
    this.turns = [];      // history of queries and answers
    this.properties = []; // accumulated property constraints
  }

  /**
   * Teach: add known examples without asking anything.
   */
  teach(examples) {
    for (const ex of examples) {
      const key = JSON.stringify(ex.input);
      const existing = this.knowledge.findIndex(
        k => JSON.stringify(k.input) === key
      );
      if (existing >= 0) {
        this.knowledge[existing] = ex; // override
      } else {
        this.knowledge.push(ex);
      }
    }
    this.turns.push({ type: "teach", examples, turn: this.turns.length });
    return this;
  }

  /**
   * Ask: pose a question given accumulated knowledge.
   */
  ask(holes) {
    if (this.knowledge.length === 0) {
      throw new Error("Cannot ask without any knowledge — teach first");
    }
    const query = ask(this.knowledge, holes, this.properties);
    const answered = answer(query);
    this.turns.push({
      type: "ask",
      holes,
      answers: answered.answers,
      formula: answered.formula,
      turn: this.turns.length,
    });
    return answered;
  }

  /**
   * Correct: challenge the last answer with corrections.
   */
  correct(corrections) {
    // Add corrections to knowledge
    this.teach(corrections);
    this.turns.push({
      type: "correct",
      corrections,
      turn: this.turns.length,
    });
    return this;
  }

  /**
   * Wonder: ask the system what it's curious about.
   */
  wonder() {
    if (this.knowledge.length === 0) {
      return { gaps: [], suggestions: [], meta: { status: "empty" } };
    }
    const report = curious(this.knowledge);
    this.turns.push({
      type: "wonder",
      gaps: report.gaps.length,
      suggestions: report.suggestions,
      turn: this.turns.length,
    });
    return report;
  }

  /**
   * Understanding: how well does the accumulated knowledge explain things?
   */
  understanding() {
    if (this.knowledge.length === 0) {
      return { level: 0, examples: 0, formula: null };
    }
    const intent = encodeIntent(this.knowledge, this.properties);
    const resolved = resolveIntent(intent);

    // Check how many known examples the formula actually gets right
    let correct = 0;
    for (const ex of this.knowledge) {
      try {
        const result = resolved.fn?.(ex.input);
        if (JSON.stringify(result) === JSON.stringify(ex.output)) {
          correct++;
        }
      } catch { /* miss */ }
    }

    return {
      level: this.knowledge.length > 0 ? correct / this.knowledge.length : 0,
      examples: this.knowledge.length,
      correct,
      formula: resolved.meta?.synthesized || null,
      turns: this.turns.length,
    };
  }

  /**
   * Summary: the full dialogue state.
   */
  summary() {
    const u = this.understanding();
    return {
      turns: this.turns.length,
      knowledge: this.knowledge.length,
      understanding: u.level,
      formula: u.formula,
      history: this.turns.map(t => `${t.type} (turn ${t.turn})`),
    };
  }
}
