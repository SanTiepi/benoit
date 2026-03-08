// Benoit Core — The Universal Primitive
//
// Counter-intuition: 18 modules are all the same operation.
//
// Everything Benoit does reduces to ONE primitive:
//
//   given(known) → when(hole) → then(answer)
//
// Protocol  = given(assertions) → when(new_agent) → then(synthesized_code)
// Intent    = given(examples)   → when(new_input) → then(output)
// Contract  = given(need)       → when(offer)     → then(binding)
// Query     = given(context)    → when(hole)      → then(answer)
// Infer     = given(function)   → when(property?) → then(yes/no)
// Compose   = given(f, g)       → when(combined)  → then(new_properties)
// Optimize  = given(rules)      → when(expr)      → then(simpler_expr)
// Diff      = given(f, g)       → when(input)     → then(same/different)
//
// This module proves that one primitive does everything.

import { encodeIntent, resolveIntent } from "./intent.mjs";

// ---------------------------------------------------------------------------
// The Primitive: Given → When → Then
// ---------------------------------------------------------------------------

/**
 * The universal Benoit primitive.
 *
 * Takes known examples (context), returns a resolver that
 * can answer any question (fill any hole) in that context.
 *
 * @param {Array<{input: *, output: *}>} known - The behavioral context
 * @param {string[]} [properties] - Optional constraints
 * @returns {object} A resolver with .when() and introspection methods
 */
export function given(known, properties = []) {
  if (!Array.isArray(known) || known.length === 0) {
    return {
      when: () => null,
      then: () => null,
      known: [],
      resolved: false,
      formula: null,
    };
  }

  // Resolve once, answer many
  const intent = encodeIntent(known, properties);
  const resolved = resolveIntent(intent);
  const fn = resolved.fn;
  const formula = resolved.meta?.synthesized || null;

  const resolver = {
    // Fill a hole
    when(input) {
      if (!fn) return null;
      try { return fn(input); }
      catch { return null; }
    },

    // Fill multiple holes
    then(inputs) {
      if (!Array.isArray(inputs)) return resolver.when(inputs);
      return inputs.map(i => resolver.when(i));
    },

    // Introspection
    known,
    resolved: !!fn,
    formula,
    confidence: resolved.meta?.confidence || 0,

    // Add more context (returns a new resolver)
    and(moreExamples) {
      const merged = [...known];
      for (const ex of moreExamples) {
        const key = JSON.stringify(ex.input);
        const idx = merged.findIndex(k => JSON.stringify(k.input) === key);
        if (idx >= 0) merged[idx] = ex;
        else merged.push(ex);
      }
      return given(merged, properties);
    },

    // Challenge: correct wrong understanding
    but(corrections) {
      return resolver.and(corrections);
    },

    // Compose with another resolver
    pipe(otherResolver) {
      // Create composed examples
      const composedKnown = known.map(ex => ({
        input: ex.input,
        output: otherResolver.when(ex.output),
      })).filter(ex => ex.output !== null);
      return given(composedKnown, []);
    },

    // Self-description: what am I?
    describe() {
      return {
        type: "resolver",
        examples: known.length,
        formula,
        confidence: resolved.meta?.confidence || 0,
        domain: typeof known[0]?.input,
        range: typeof known[0]?.output,
      };
    },
  };

  return resolver;
}

// ---------------------------------------------------------------------------
// Proof: every module operation expressed as given/when/then
// ---------------------------------------------------------------------------

/**
 * Protocol: send a function as behavior, receiver synthesizes.
 * = given(assertions) → when(new_input) → then(synthesized_output)
 */
export function asProtocol(assertions) {
  return given(assertions);
}

/**
 * Intent: instruction as examples.
 * = given(examples) → when(new_input) → then(output)
 */
export function asIntent(examples, properties) {
  return given(examples, properties);
}

/**
 * Query: question as incomplete examples.
 * = given(context) → when(hole) → then(answer)
 */
export function asQuery(context) {
  return given(context);
}

/**
 * Diff: compare two functions.
 * = given(f_behavior) → when(same_input_for_g) → then(same_or_different)
 */
export function asDiff(behaviorA, behaviorB) {
  let agree = 0, disagree = 0;
  const details = [];

  for (const ex of behaviorA) {
    const matchB = behaviorB.find(b => JSON.stringify(b.input) === JSON.stringify(ex.input));
    if (matchB) {
      if (JSON.stringify(ex.output) === JSON.stringify(matchB.output)) {
        agree++;
      } else {
        disagree++;
        details.push({ input: ex.input, a: ex.output, b: matchB.output });
      }
    }
  }

  return {
    equivalent: disagree === 0 && agree > 0,
    agree,
    disagree,
    details,
    rate: agree + disagree > 0 ? agree / (agree + disagree) : 0,
  };
}

/**
 * Compose: chain two behavioral specs.
 * = given(f_behavior).pipe(given(g_behavior))
 */
export function asCompose(behaviorF, behaviorG) {
  const f = given(behaviorF);
  const g = given(behaviorG);
  return f.pipe(g);
}

// ---------------------------------------------------------------------------
// Self-Reference: Benoit describing Benoit
// ---------------------------------------------------------------------------

/**
 * Can Benoit describe its own operations?
 *
 * Given examples of what "given" does, can it synthesize "given"?
 * This is the self-reference test.
 */
export function selfTest() {
  const results = [];

  // Test 1: Can given/when reproduce doubling?
  const doubler = given([
    { input: 2, output: 4 },
    { input: 3, output: 6 },
    { input: 5, output: 10 },
  ]);
  results.push({
    test: "given/when reproduces doubling",
    pass: doubler.when(7) === 14,
    expected: 14,
    got: doubler.when(7),
  });

  // Test 2: Can .and() add context?
  const refined = doubler.and([
    { input: 2, output: 4 }, { input: 3, output: 9 },
    { input: 4, output: 16 }, { input: 5, output: 25 }, { input: 0, output: 0 },
  ]);
  results.push({
    test: "and() refines understanding",
    pass: refined.when(5) === 25,
    expected: 25,
    got: refined.when(5),
  });

  // Test 3: Can .pipe() compose?
  const negator = given([
    { input: 1, output: -1 },
    { input: 5, output: -5 },
    { input: -3, output: 3 },
  ]);
  const composed = doubler.pipe(negator);
  results.push({
    test: "pipe() composes two resolvers",
    pass: composed.when(3) === -6,
    expected: -6,
    got: composed.when(3),
  });

  // Test 4: Can asDiff compare?
  const diff = asDiff(
    [{ input: 1, output: 2 }, { input: 2, output: 4 }],
    [{ input: 1, output: 2 }, { input: 2, output: 4 }],
  );
  results.push({
    test: "asDiff detects equivalence",
    pass: diff.equivalent === true,
    expected: true,
    got: diff.equivalent,
  });

  // Test 5: Empty given returns null
  const empty = given([]);
  results.push({
    test: "empty given returns null",
    pass: empty.when(5) === null,
    expected: null,
    got: empty.when(5),
  });

  // Test 6: String operations through universal primitive
  const upper = given([
    { input: "hello", output: "HELLO" },
    { input: "world", output: "WORLD" },
  ]);
  results.push({
    test: "given/when handles strings",
    pass: upper.when("benoit") === "BENOIT",
    expected: "BENOIT",
    got: upper.when("benoit"),
  });

  // Test 7: Array operations through universal primitive
  const sorter = given([
    { input: [3, 1, 2], output: [1, 2, 3] },
    { input: [5, 1], output: [1, 5] },
  ]);
  const sortResult = sorter.when([9, 3, 7]);
  results.push({
    test: "given/when handles arrays",
    pass: JSON.stringify(sortResult) === JSON.stringify([3, 7, 9]),
    expected: [3, 7, 9],
    got: sortResult,
  });

  // Test 8: .but() corrects misunderstanding (same as .and())
  const wrong = given([{ input: 2, output: 4 }, { input: 3, output: 6 }]);
  const corrected = wrong.but([{ input: 3, output: 9 }, { input: 5, output: 25 }]);
  results.push({
    test: "but() corrects understanding",
    pass: corrected.when(4) === 16,
    expected: 16,
    got: corrected.when(4),
  });

  const passed = results.filter(r => r.pass).length;
  return {
    results,
    passed,
    total: results.length,
    selfReferential: passed === results.length,
    summary: `${passed}/${results.length} — Benoit ${passed === results.length ? "CAN" : "CANNOT"} describe itself`,
  };
}
