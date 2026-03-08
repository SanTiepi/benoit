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
// Question Quality: how good is your question?
// ---------------------------------------------------------------------------

/**
 * Measure the quality of a question (set of examples).
 *
 * A good question:
 *   - Has enough examples to disambiguate (low ambiguity)
 *   - Covers diverse inputs (spread)
 *   - Includes boundary cases (edges)
 *   - Produces a confident synthesis (resolvability)
 *
 * A bad question:
 *   - Too few examples (multiple functions fit)
 *   - Clustered inputs (all similar values)
 *   - Missing edge cases (0, negatives, empty)
 *
 * @param {Array<{input: *, output: *}>} examples - The question's context
 * @returns {object} Quality report
 */
export function quality(examples) {
  if (!Array.isArray(examples) || examples.length === 0) {
    return { score: 0, verdict: "empty", details: {} };
  }

  const scores = {};

  // 1. Quantity: more examples = less ambiguity
  const count = examples.length;
  scores.quantity = Math.min(count / 5, 1); // 5+ examples = max score

  // 2. Resolvability: can we synthesize at all?
  const intent = encodeIntent(examples);
  const resolved = resolveIntent(intent);
  scores.resolvable = resolved.fn ? 1 : 0;

  // 3. Consistency: does the synthesis match ALL examples?
  let consistent = 0;
  if (resolved.fn) {
    for (const ex of examples) {
      try {
        const result = resolved.fn(ex.input);
        if (JSON.stringify(result) === JSON.stringify(ex.output)) consistent++;
      } catch { /* miss */ }
    }
  }
  scores.consistency = count > 0 ? consistent / count : 0;

  // 4. Diversity: how spread are the inputs?
  const firstInput = examples[0].input;
  if (typeof firstInput === "number") {
    const inputs = examples.map(e => e.input).filter(x => typeof x === "number");
    const min = Math.min(...inputs);
    const max = Math.max(...inputs);
    const range = max - min;

    // Do we have positive, negative, and zero?
    const hasPositive = inputs.some(x => x > 0);
    const hasNegative = inputs.some(x => x < 0);
    const hasZero = inputs.some(x => x === 0);
    const signCoverage = [hasPositive, hasNegative, hasZero].filter(Boolean).length / 3;

    // Spread: are inputs evenly distributed or clustered?
    const uniqueInputs = new Set(inputs);
    const uniqueRatio = uniqueInputs.size / inputs.length;

    scores.diversity = (signCoverage * 0.5 + uniqueRatio * 0.3 + (range > 5 ? 0.2 : range / 25));
  } else if (Array.isArray(firstInput)) {
    // Arrays: check length diversity
    const lengths = examples.map(e => Array.isArray(e.input) ? e.input.length : 0);
    const hasEmpty = lengths.includes(0);
    const hasSingle = lengths.includes(1);
    const hasMulti = lengths.some(l => l > 2);
    scores.diversity = [hasEmpty, hasSingle, hasMulti].filter(Boolean).length / 3;
  } else {
    scores.diversity = Math.min(examples.length / 3, 1);
  }

  // 5. Ambiguity: how many DIFFERENT functions could fit these examples?
  // We test: could a linear, quadratic, or constant function also fit?
  let alternativeFits = 0;
  if (typeof firstInput === "number" && resolved.fn) {
    const numExamples = examples.filter(e => typeof e.input === "number");

    // Could a constant fit?
    const allSameOutput = numExamples.every(e => e.output === numExamples[0].output);
    if (allSameOutput && numExamples.length < 3) alternativeFits++;

    // Could a linear fit? (y = ax + b)
    if (numExamples.length >= 2) {
      const [p1, p2] = numExamples;
      if (p1.input !== p2.input) {
        const a = (p2.output - p1.output) / (p2.input - p1.input);
        const b = p1.output - a * p1.input;
        const linearFits = numExamples.every(e =>
          Math.abs(a * e.input + b - e.output) < 0.01
        );
        if (linearFits) alternativeFits++;
      }
    }

    // Could a quadratic fit? (y = ax²)
    if (numExamples.length >= 2) {
      const nonZero = numExamples.find(e => e.input !== 0);
      if (nonZero) {
        const a = nonZero.output / (nonZero.input * nonZero.input);
        const quadFits = numExamples.every(e =>
          Math.abs(a * e.input * e.input - e.output) < 0.01
        );
        if (quadFits) alternativeFits++;
      }
    }

    scores.ambiguity = alternativeFits <= 1 ? 1 : 1 / alternativeFits;
  } else {
    scores.ambiguity = examples.length >= 3 ? 0.8 : 0.4;
  }

  // Overall score: weighted average
  const overall = (
    scores.quantity * 0.15 +
    scores.resolvable * 0.25 +
    scores.consistency * 0.25 +
    scores.diversity * 0.15 +
    scores.ambiguity * 0.20
  );

  let verdict;
  if (overall >= 0.85) verdict = "excellent";
  else if (overall >= 0.7) verdict = "good";
  else if (overall >= 0.5) verdict = "adequate";
  else if (overall >= 0.3) verdict = "weak";
  else verdict = "insufficient";

  return {
    score: Math.round(overall * 100) / 100,
    verdict,
    formula: resolved.meta?.synthesized || null,
    details: scores,
    suggestions: generateSuggestions(examples, scores),
  };
}

/**
 * Reformulate a question to make it solvable.
 *
 * The counter-intuition: you don't need a better solver,
 * you need a better question.
 *
 * Strategy:
 *   1. Diagnose with quality()
 *   2. If unsolvable: try re-encoding with different structural assumptions
 *   3. If ambiguous: use current best-fit to generate disambiguating examples
 *   4. If low diversity: extend with boundary probes from the best-fit
 *   5. Return the improved example set + new quality score
 *
 * @param {Array<{input: *, output: *}>} examples - The original question
 * @param {object} [opts] - Options
 * @param {Array<{input: *, output: *}>} [opts.hints] - Extra examples the caller can provide
 * @param {number} [opts.maxRounds] - Max reformulation rounds (default 3)
 * @returns {object} { original, reformulated, quality, rounds, improved }
 */
export function reformulate(examples, opts = {}) {
  const maxRounds = opts.maxRounds ?? 3;
  const hints = opts.hints || [];

  let current = [...examples, ...hints];
  let q = quality(current);
  const history = [{ examples: [...current], quality: { ...q } }];

  for (let round = 0; round < maxRounds && q.score < 0.85; round++) {
    const added = [];

    // Strategy 1: If we have a formula but low diversity, probe boundaries
    if (q.details.resolvable === 1 && q.details.diversity < 0.7) {
      const intent = encodeIntent(current);
      const resolved = resolveIntent(intent);
      if (resolved.fn) {
        const probes = [0, -1, 1, 10, -10, 100];
        for (const probe of probes) {
          const alreadyKnown = current.some(
            e => JSON.stringify(e.input) === JSON.stringify(probe)
          );
          if (!alreadyKnown) {
            try {
              const output = resolved.fn(probe);
              if (output !== null && output !== undefined && Number.isFinite(output)) {
                added.push({ input: probe, output });
              }
            } catch { /* skip */ }
          }
        }
      }
    }

    // Strategy 2: If too few examples, bootstrap from best-fit
    if (q.details.quantity < 0.8 && q.details.resolvable === 1) {
      const intent = encodeIntent(current);
      const resolved = resolveIntent(intent);
      if (resolved.fn) {
        const numExamples = current.filter(e => typeof e.input === "number");
        const inputs = numExamples.map(e => e.input);
        const min = Math.min(...inputs, 0);
        const max = Math.max(...inputs, 10);
        // Fill gaps in the range
        for (let x = min; x <= max; x++) {
          const alreadyKnown = current.some(e => e.input === x);
          if (!alreadyKnown) {
            try {
              const output = resolved.fn(x);
              if (output !== null && output !== undefined && Number.isFinite(output)) {
                added.push({ input: x, output });
              }
            } catch { /* skip */ }
          }
        }
      }
    }

    // Strategy 3: If ambiguity is high, try to disambiguate
    // by testing where linear, quadratic, and cubic disagree
    if (q.details.ambiguity < 0.5) {
      const numExamples = current.filter(e => typeof e.input === "number");
      if (numExamples.length >= 2) {
        // Test at extreme values where different fits diverge most
        const extremes = [20, -20, 50];
        const intent = encodeIntent(current);
        const resolved = resolveIntent(intent);
        if (resolved.fn) {
          for (const x of extremes) {
            const alreadyKnown = current.some(e => e.input === x);
            if (!alreadyKnown) {
              try {
                const output = resolved.fn(x);
                if (output !== null && output !== undefined && Number.isFinite(output)) {
                  added.push({ input: x, output });
                }
              } catch { /* skip */ }
            }
          }
        }
      }
    }

    // Strategy 4: If not resolvable at all, try structural transforms
    if (q.details.resolvable === 0) {
      // Try encoding as pairs → next value (recurrence)
      const sorted = [...current]
        .filter(e => typeof e.input === "number")
        .sort((a, b) => a.input - b.input);

      if (sorted.length >= 3) {
        // Convert sequential f(n) values into pair→next recurrence
        const recurrence = [];
        for (let i = 0; i < sorted.length - 2; i++) {
          recurrence.push({
            input: [sorted[i].output, sorted[i + 1].output],
            output: sorted[i + 2].output,
          });
        }
        // Try if recurrence is solvable
        const rIntent = encodeIntent(recurrence);
        const rResolved = resolveIntent(rIntent);
        if (rResolved.fn) {
          // Recurrence works! Replace the question entirely
          current = recurrence;
          added.length = 0; // don't add numeric probes to array question
        }
      }
    }

    if (added.length === 0) break; // nothing more to try

    // Deduplicate
    for (const ex of added) {
      const key = JSON.stringify(ex.input);
      if (!current.some(e => JSON.stringify(e.input) === key)) {
        current.push(ex);
      }
    }

    q = quality(current);
    history.push({ examples: [...current], quality: { ...q }, added: added.length });
  }

  const originalQ = quality(examples);
  return {
    original: { examples, quality: originalQ },
    reformulated: { examples: current, quality: q },
    rounds: history.length - 1,
    improved: q.score > originalQ.score,
    history,
  };
}

function generateSuggestions(examples, scores) {
  const suggestions = [];
  if (scores.quantity < 0.6) suggestions.push("Add more examples (aim for 5+)");
  if (scores.resolvable === 0) suggestions.push("Examples don't match any known pattern");
  if (scores.consistency < 1) suggestions.push("Some examples don't match the synthesized formula");
  if (scores.diversity < 0.5) suggestions.push("Add diverse inputs: try 0, negatives, edge cases");
  if (scores.ambiguity < 0.5) suggestions.push("Examples are ambiguous — multiple functions fit them");
  return suggestions;
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
   * Negotiate: instead of guessing, tell the sender WHERE you're confused.
   *
   * The counter-intuition: don't interpret a bad message —
   * ask for a better one.
   *
   * Returns a request object that the sender can fulfill with more examples.
   * The receiver says: "I understood X, but I'm confused about Y.
   * Can you show me what happens at these inputs?"
   *
   * @param {Array<*>} [probeInputs] - Specific inputs the receiver wants clarified
   * @returns {object} Negotiation request with confusion points and probe suggestions
   */
  negotiate(probeInputs = []) {
    if (this.knowledge.length === 0) {
      return {
        type: "negotiate",
        status: "empty",
        message: "I have no examples. Please teach me first.",
        probes: [],
      };
    }

    const intent = encodeIntent(this.knowledge, this.properties);
    const resolved = resolveIntent(intent);

    // Find where our understanding breaks
    const confusions = [];
    let correct = 0;

    for (const ex of this.knowledge) {
      try {
        const predicted = resolved.fn?.(ex.input);
        if (JSON.stringify(predicted) === JSON.stringify(ex.output)) {
          correct++;
        } else {
          confusions.push({
            input: ex.input,
            expected: ex.output,
            myGuess: predicted,
            message: `You said f(${JSON.stringify(ex.input)}) = ${JSON.stringify(ex.output)}, but my model gives ${JSON.stringify(predicted)}`,
          });
        }
      } catch {
        confusions.push({
          input: ex.input,
          expected: ex.output,
          myGuess: null,
          message: `I can't compute f(${JSON.stringify(ex.input)}) at all`,
        });
      }
    }

    // Generate probes: inputs where we're LEAST confident
    const suggestedProbes = [...probeInputs];
    if (typeof this.knowledge[0]?.input === "number" && resolved.fn) {
      const inputs = this.knowledge.map(e => e.input).filter(x => typeof x === "number");
      const min = Math.min(...inputs);
      const max = Math.max(...inputs);

      // Probe beyond known range (extrapolation = max uncertainty)
      suggestedProbes.push(max + 1, max + 5, min - 1, min - 5);

      // Probe at boundaries
      if (!inputs.includes(0)) suggestedProbes.push(0);
      if (!inputs.some(x => x < 0)) suggestedProbes.push(-1);

      // Probe between known points (interpolation gaps)
      for (let i = 0; i < inputs.length - 1; i++) {
        const mid = Math.round((inputs[i] + inputs[i + 1]) / 2);
        if (!inputs.includes(mid)) suggestedProbes.push(mid);
      }
    }

    // Deduplicate probes
    const uniqueProbes = [...new Set(suggestedProbes)].filter(
      p => !this.knowledge.some(e => JSON.stringify(e.input) === JSON.stringify(p))
    );

    const result = {
      type: "negotiate",
      status: confusions.length > 0 ? "confused" : "uncertain",
      understanding: correct / this.knowledge.length,
      formula: resolved.meta?.synthesized || null,
      confusions,
      probes: uniqueProbes.slice(0, 10), // max 10 probes
      message: confusions.length > 0
        ? `I understand ${correct}/${this.knowledge.length} examples. I'm confused about ${confusions.length}. Can you clarify?`
        : `I think I understand (${resolved.meta?.synthesized || "unknown pattern"}), but I'm not sure. Can you confirm these?`,
    };

    this.turns.push({
      type: "negotiate",
      confusions: confusions.length,
      probes: uniqueProbes.length,
      turn: this.turns.length,
    });

    return result;
  }

  /**
   * Should we negotiate? The cost gate.
   *
   * Negotiation is cheap (just listing probe points), but not free.
   * Only negotiate if the expected value of clarification exceeds the cost.
   *
   * Rules:
   *   - ≥ 5 examples + 100% consistency + formula exists → skip (confident)
   *   - < 3 examples → always negotiate (too little data)
   *   - confusions > 0 → always negotiate (model contradicts data)
   *   - formula exists but < 5 examples → negotiate (need confirmation)
   *
   * @returns {boolean|object} false if confident, or { reason, urgency } if should negotiate
   */
  shouldNegotiate() {
    if (this.knowledge.length === 0) {
      return { reason: "no knowledge at all", urgency: "critical" };
    }

    const u = this.understanding();

    // Confident: many examples, all consistent, formula found
    if (u.examples >= 5 && u.level === 1 && u.formula) {
      return false;
    }

    // Critical: some examples don't match
    if (u.level < 1) {
      return { reason: `model explains only ${Math.round(u.level * 100)}%`, urgency: "high" };
    }

    // Useful: too few examples to be sure
    if (u.examples < 3) {
      return { reason: `only ${u.examples} examples — ambiguous`, urgency: "medium" };
    }

    // Low value: formula found, all consistent, but few examples
    if (u.formula && u.level === 1 && u.examples < 5) {
      return { reason: `${u.examples} examples — could use confirmation`, urgency: "low" };
    }

    return false;
  }

  /**
   * Fulfill: the sender responds to a negotiation request with clarifications.
   * This is the other side of negotiate() — the sender provides the answers.
   *
   * @param {object} negotiation - The result of negotiate()
   * @param {Array<{input: *, output: *}>} clarifications - Sender's answers to probes
   * @returns {object} Updated understanding after receiving clarifications
   */
  fulfill(negotiation, clarifications) {
    this.teach(clarifications);
    this.turns.push({
      type: "fulfill",
      clarifications: clarifications.length,
      turn: this.turns.length,
    });
    return this.understanding();
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
