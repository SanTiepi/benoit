// Benoît Intent Engine
// Encode instructions as behavioral specifications (examples + properties),
// not textual descriptions. The agent synthesizes, verifies, and executes.
//
// An intent is a BEHAVIORAL contract: "here is what I want, prove you can do it."

import { synthesize } from "./solve.mjs";

// ---------------------------------------------------------------------------
// Hypothesis templates for common operations
// ---------------------------------------------------------------------------

/**
 * Built-in hypothesis templates that the intent engine tries when the
 * standard solve.mjs synthesizer cannot find a match (e.g. for array
 * and string operations that operate on non-numeric data).
 */
const HYPOTHESIS_TEMPLATES = [
  // Sort: array -> sorted array
  {
    name: "sort",
    domain: "array",
    test: (examples) => examples.every(({ input, output }) =>
      Array.isArray(input) && Array.isArray(output) &&
      input.length === output.length &&
      JSON.stringify([...input].sort((a, b) => a - b)) === JSON.stringify(output)
    ),
    fn: (x) => [...x].sort((a, b) => a - b),
    formula: "[...x].sort((a, b) => a - b)",
    confidence: 0.95,
  },

  // Filter even numbers
  {
    name: "filter_even",
    domain: "array",
    test: (examples) => examples.every(({ input, output }) =>
      Array.isArray(input) && Array.isArray(output) &&
      JSON.stringify(input.filter(n => n % 2 === 0)) === JSON.stringify(output)
    ),
    fn: (x) => x.filter(n => n % 2 === 0),
    formula: "x.filter(n => n % 2 === 0)",
    confidence: 0.9,
  },

  // Filter odd numbers
  {
    name: "filter_odd",
    domain: "array",
    test: (examples) => examples.every(({ input, output }) =>
      Array.isArray(input) && Array.isArray(output) &&
      JSON.stringify(input.filter(n => n % 2 !== 0)) === JSON.stringify(output)
    ),
    fn: (x) => x.filter(n => n % 2 !== 0),
    formula: "x.filter(n => n % 2 !== 0)",
    confidence: 0.9,
  },

  // Filter positive
  {
    name: "filter_positive",
    domain: "array",
    test: (examples) => examples.every(({ input, output }) =>
      Array.isArray(input) && Array.isArray(output) &&
      JSON.stringify(input.filter(n => n > 0)) === JSON.stringify(output)
    ),
    fn: (x) => x.filter(n => n > 0),
    formula: "x.filter(n => n > 0)",
    confidence: 0.9,
  },

  // Map: double each element
  {
    name: "map_double",
    domain: "array",
    test: (examples) => examples.every(({ input, output }) =>
      Array.isArray(input) && Array.isArray(output) &&
      input.length === output.length &&
      input.every((v, i) => v * 2 === output[i])
    ),
    fn: (x) => x.map(n => n * 2),
    formula: "x.map(n => n * 2)",
    confidence: 0.9,
  },

  // Map: square each element
  {
    name: "map_square",
    domain: "array",
    test: (examples) => examples.every(({ input, output }) =>
      Array.isArray(input) && Array.isArray(output) &&
      input.length === output.length &&
      input.every((v, i) => v * v === output[i])
    ),
    fn: (x) => x.map(n => n * n),
    formula: "x.map(n => n * n)",
    confidence: 0.9,
  },

  // Map: negate each element
  {
    name: "map_negate",
    domain: "array",
    test: (examples) => examples.every(({ input, output }) =>
      Array.isArray(input) && Array.isArray(output) &&
      input.length === output.length &&
      input.every((v, i) => -v === output[i])
    ),
    fn: (x) => x.map(n => -n),
    formula: "x.map(n => -n)",
    confidence: 0.9,
  },

  // Reduce: sum
  {
    name: "reduce_sum",
    domain: "array",
    range: "number",
    test: (examples) => examples.every(({ input, output }) =>
      Array.isArray(input) && typeof output === "number" &&
      input.reduce((a, b) => a + b, 0) === output
    ),
    fn: (x) => x.reduce((a, b) => a + b, 0),
    formula: "x.reduce((a, b) => a + b, 0)",
    confidence: 0.95,
  },

  // Reduce: product
  {
    name: "reduce_product",
    domain: "array",
    range: "number",
    test: (examples) => examples.every(({ input, output }) =>
      Array.isArray(input) && typeof output === "number" &&
      input.reduce((a, b) => a * b, 1) === output
    ),
    fn: (x) => x.reduce((a, b) => a * b, 1),
    formula: "x.reduce((a, b) => a * b, 1)",
    confidence: 0.9,
  },

  // Reduce: min
  {
    name: "reduce_min",
    domain: "array",
    range: "number",
    test: (examples) => examples.every(({ input, output }) =>
      Array.isArray(input) && typeof output === "number" &&
      Math.min(...input) === output
    ),
    fn: (x) => Math.min(...x),
    formula: "Math.min(...x)",
    confidence: 0.9,
  },

  // Reduce: max
  {
    name: "reduce_max",
    domain: "array",
    range: "number",
    test: (examples) => examples.every(({ input, output }) =>
      Array.isArray(input) && typeof output === "number" &&
      Math.max(...input) === output
    ),
    fn: (x) => Math.max(...x),
    formula: "Math.max(...x)",
    confidence: 0.9,
  },

  // Reduce: length / count
  {
    name: "reduce_length",
    domain: "array",
    range: "number",
    test: (examples) => examples.every(({ input, output }) =>
      Array.isArray(input) && typeof output === "number" &&
      input.length === output
    ),
    fn: (x) => x.length,
    formula: "x.length",
    confidence: 0.9,
  },

  // Array reverse
  {
    name: "array_reverse",
    domain: "array",
    test: (examples) => examples.every(({ input, output }) =>
      Array.isArray(input) && Array.isArray(output) &&
      input.length === output.length &&
      JSON.stringify([...input].reverse()) === JSON.stringify(output)
    ),
    fn: (x) => [...x].reverse(),
    formula: "[...x].reverse()",
    confidence: 0.9,
  },

  // String: toUpperCase
  {
    name: "string_upper",
    domain: "string",
    range: "string",
    test: (examples) => examples.every(({ input, output }) =>
      typeof input === "string" && typeof output === "string" &&
      input.toUpperCase() === output
    ),
    fn: (x) => x.toUpperCase(),
    formula: "x.toUpperCase()",
    confidence: 0.95,
  },

  // String: toLowerCase
  {
    name: "string_lower",
    domain: "string",
    range: "string",
    test: (examples) => examples.every(({ input, output }) =>
      typeof input === "string" && typeof output === "string" &&
      input.toLowerCase() === output
    ),
    fn: (x) => x.toLowerCase(),
    formula: "x.toLowerCase()",
    confidence: 0.95,
  },

  // String: reverse
  {
    name: "string_reverse",
    domain: "string",
    range: "string",
    test: (examples) => examples.every(({ input, output }) =>
      typeof input === "string" && typeof output === "string" &&
      input.split("").reverse().join("") === output
    ),
    fn: (x) => x.split("").reverse().join(""),
    formula: 'x.split("").reverse().join("")',
    confidence: 0.85,
  },

  // String: trim
  {
    name: "string_trim",
    domain: "string",
    range: "string",
    test: (examples) => examples.every(({ input, output }) =>
      typeof input === "string" && typeof output === "string" &&
      input.trim() === output
    ),
    fn: (x) => x.trim(),
    formula: "x.trim()",
    confidence: 0.9,
  },

  // String: length
  {
    name: "string_length",
    domain: "string",
    range: "number",
    test: (examples) => examples.every(({ input, output }) =>
      typeof input === "string" && typeof output === "number" &&
      input.length === output
    ),
    fn: (x) => x.length,
    formula: "x.length",
    confidence: 0.9,
  },
];

// ---------------------------------------------------------------------------
// Numeric synthesis via solve.mjs bridge
// ---------------------------------------------------------------------------

/**
 * Attempt numeric synthesis by wrapping examples into the fingerprint format
 * that solve.mjs expects.  Returns { fn, formula, confidence } or null.
 */
function trySolverSynthesis(examples) {
  // All inputs must be simple numbers (or arrays of numbers for multi-arg)
  const numeric = examples.every(({ input, output }) => {
    const inp = Array.isArray(input) ? input : [input];
    return inp.every(v => typeof v === "number") && typeof output === "number";
  });
  if (!numeric) return null;

  // Determine arity from first example
  const first = examples[0];
  const args = Array.isArray(first.input) ? first.input : [first.input];
  const arity = args.length;

  // Build assertions in the format solve.mjs expects: "fn(1,2)" / "5"
  const assertions = examples.map(({ input, output }) => {
    const inp = Array.isArray(input) ? input : [input];
    return {
      input: `_intent(${inp.join(", ")})`,
      output: String(output),
    };
  });

  const fp = {
    functions: [{
      name: "_intent",
      arity,
      assertions,
      properties: [],
    }],
  };

  const results = synthesize(fp);
  const result = results[0];
  if (!result || result.status !== "synthesized") return null;

  // Build a callable JS function from the synthesized formula
  const formulaMatch = result.code.match(/->\s*(.+)$/);
  if (!formulaMatch) return null;
  const formula = formulaMatch[1].trim();

  let fn;
  try {
    if (arity === 1) {
      fn = new Function("x", `return ${formula}`);
    } else if (arity === 2) {
      fn = new Function("a", "b", `return ${formula}`);
      // Wrap so it accepts a single array arg [a, b]
      const raw = fn;
      fn = (input) => {
        const arr = Array.isArray(input) ? input : [input];
        return raw(...arr);
      };
    } else if (arity === 3) {
      fn = new Function("x", "min", "max", `return ${formula}`);
      const raw = fn;
      fn = (input) => {
        const arr = Array.isArray(input) ? input : [input];
        return raw(...arr);
      };
    } else {
      return null;
    }
  } catch {
    return null;
  }

  // Verify
  const valid = examples.every(({ input, output }) => {
    try {
      const inp = Array.isArray(input) && arity > 1 ? input : input;
      return fn(inp) === output;
    } catch { return false; }
  });
  if (!valid) return null;

  return { fn, formula, confidence: result.confidence || 0.9 };
}

// ---------------------------------------------------------------------------
// Property verification helpers
// ---------------------------------------------------------------------------

/**
 * Check whether a candidate function satisfies a set of property names.
 * Returns an object { satisfied, violated } with arrays of property names.
 */
function verifyProperties(fn, properties, examples) {
  const satisfied = [];
  const violated = [];

  for (const prop of properties) {
    try {
      switch (prop) {
        case "idempotent": {
          const ok = examples.every(({ input }) => {
            try {
              const once = fn(input);
              const twice = fn(once);
              return JSON.stringify(once) === JSON.stringify(twice);
            } catch { return false; }
          });
          (ok ? satisfied : violated).push(prop);
          break;
        }

        case "length_preserving": {
          const ok = examples.every(({ input }) => {
            try {
              const result = fn(input);
              if (Array.isArray(input)) return Array.isArray(result) && result.length === input.length;
              if (typeof input === "string") return typeof result === "string" && result.length === input.length;
              return true;
            } catch { return false; }
          });
          (ok ? satisfied : violated).push(prop);
          break;
        }

        case "monotonic_increasing": {
          const numExamples = examples.filter(e => typeof e.input === "number");
          const sorted = [...numExamples].sort((a, b) => a.input - b.input);
          const ok = sorted.every((e, i) =>
            i === 0 || fn(sorted[i - 1].input) <= fn(e.input)
          );
          (ok ? satisfied : violated).push(prop);
          break;
        }

        case "commutative": {
          const ok = examples.every(({ input }) => {
            if (!Array.isArray(input) || input.length !== 2) return true;
            try {
              return JSON.stringify(fn(input)) === JSON.stringify(fn([input[1], input[0]]));
            } catch { return false; }
          });
          (ok ? satisfied : violated).push(prop);
          break;
        }

        case "non_negative": {
          const ok = examples.every(({ input }) => {
            try { return fn(input) >= 0; } catch { return false; }
          });
          (ok ? satisfied : violated).push(prop);
          break;
        }

        case "deterministic": {
          // Every function we synthesize is deterministic by construction
          satisfied.push(prop);
          break;
        }

        default:
          // Unknown property — skip silently
          break;
      }
    } catch {
      violated.push(prop);
    }
  }

  return { satisfied, violated };
}

// ---------------------------------------------------------------------------
// Core API
// ---------------------------------------------------------------------------

/**
 * Encode a behavioral specification into an intent object.
 *
 * @param {Array<{input: *, output: *}>} examples - input/output pairs
 * @param {string[]} [properties] - optional property constraints
 * @param {object} [constraints] - optional domain/range hints
 * @returns {object} An intent object
 */
export function encodeIntent(examples, properties = [], constraints = {}) {
  if (!Array.isArray(examples) || examples.length === 0) {
    throw new Error("encodeIntent requires at least one example");
  }

  // Infer domain/range from examples if not provided
  const firstInput = examples[0].input;
  const firstOutput = examples[0].output;
  const domain = constraints.domain ||
    (Array.isArray(firstInput) ? "array" :
     typeof firstInput === "string" ? "string" : "number");
  const range = constraints.range ||
    (Array.isArray(firstOutput) ? "array" :
     typeof firstOutput === "string" ? "string" : "number");

  return {
    type: "intent",
    examples: examples.map(e => ({ input: e.input, output: e.output })),
    properties,
    constraints: { domain, range, ...constraints },
    meta: { confidence: null, synthesized: null },
  };
}

/**
 * Resolve an intent: synthesize a function that satisfies all examples
 * AND passes property checks.
 *
 * @param {object} intentObj - an intent created by encodeIntent
 * @returns {object} The intent with meta.synthesized and meta.confidence filled in,
 *                   plus a callable `fn` property.
 */
export function resolveIntent(intentObj) {
  const { examples, properties, constraints } = intentObj;
  const candidates = [];

  // 1) Try the numeric solver from solve.mjs
  const solverResult = trySolverSynthesis(examples);
  if (solverResult) {
    candidates.push(solverResult);
  }

  // 2) Try hypothesis templates (array, string, etc.)
  for (const template of HYPOTHESIS_TEMPLATES) {
    try {
      if (template.test(examples)) {
        // Verify the template fn actually matches every example
        const valid = examples.every(({ input, output }) => {
          try {
            return JSON.stringify(template.fn(input)) === JSON.stringify(output);
          } catch { return false; }
        });
        if (valid) {
          candidates.push({
            fn: template.fn,
            formula: template.formula,
            confidence: template.confidence,
          });
        }
      }
    } catch { /* skip */ }
  }

  // 3) Try to infer a linear numeric map on array elements
  //    (generic map: output[i] = a * input[i] + b)
  if (candidates.length === 0) {
    const mapResult = tryGenericMap(examples);
    if (mapResult) candidates.push(mapResult);
  }

  if (candidates.length === 0) {
    return {
      ...intentObj,
      fn: null,
      meta: { confidence: 0, synthesized: null, status: "unsolved" },
    };
  }

  // Rank candidates by property compliance, then confidence
  for (const c of candidates) {
    if (properties.length > 0) {
      const { satisfied, violated } = verifyProperties(c.fn, properties, examples);
      c.propScore = satisfied.length - violated.length * 2;
      c.propertiesVerified = { satisfied, violated };
    } else {
      c.propScore = 0;
      c.propertiesVerified = { satisfied: [], violated: [] };
    }
  }
  candidates.sort((a, b) => (b.propScore - a.propScore) || (b.confidence - a.confidence));

  const best = candidates[0];

  // Reject if required properties are violated
  if (best.propertiesVerified.violated.length > 0 && candidates.length === 1) {
    // Still return it, but flag confidence penalty
    best.confidence *= 0.5;
  }

  return {
    ...intentObj,
    fn: best.fn,
    meta: {
      confidence: best.confidence,
      synthesized: best.formula,
      status: "resolved",
      propertiesVerified: best.propertiesVerified,
    },
  };
}

/**
 * Resolve an intent and immediately execute on a new input.
 *
 * @param {object} intentObj - an intent created by encodeIntent
 * @param {*} input - the new input to apply
 * @returns {*} The result of applying the synthesized function to input
 */
export function executeIntent(intentObj, input) {
  const resolved = intentObj.fn ? intentObj : resolveIntent(intentObj);
  if (!resolved.fn) {
    throw new Error("Could not resolve intent: no function synthesized");
  }
  return resolved.fn(input);
}

/**
 * Compose two intents into a pipeline: output of A feeds into B.
 *
 * @param {object} intentA - first intent (applied first)
 * @param {object} intentB - second intent (applied to A's output)
 * @returns {object} A new composed intent
 */
export function composeIntents(intentA, intentB) {
  // Resolve both if needed
  const a = intentA.fn ? intentA : resolveIntent(intentA);
  const b = intentB.fn ? intentB : resolveIntent(intentB);

  if (!a.fn || !b.fn) {
    throw new Error("Cannot compose: one or both intents could not be resolved");
  }

  // Build composed examples from A's inputs
  const composedExamples = a.examples.map(ex => ({
    input: ex.input,
    output: b.fn(a.fn(ex.input)),
  }));

  // Merge properties that are meaningful for a pipeline
  const composedProperties = [];
  if (a.properties.includes("idempotent") && b.properties.includes("idempotent")) {
    // Pipeline of idempotent functions is not necessarily idempotent
  }

  const composedFn = (x) => b.fn(a.fn(x));

  return {
    type: "intent",
    examples: composedExamples,
    properties: composedProperties,
    constraints: {
      domain: a.constraints?.domain || "any",
      range: b.constraints?.range || "any",
    },
    fn: composedFn,
    meta: {
      confidence: Math.min(a.meta.confidence || 0, b.meta.confidence || 0) * 0.95,
      synthesized: `(${a.meta.synthesized}) |> (${b.meta.synthesized})`,
      status: "composed",
      components: [a.meta.synthesized, b.meta.synthesized],
    },
  };
}

/**
 * Renegotiate an intent by adding counter-examples and re-resolving.
 * This is the "I meant THIS, not THAT" feedback loop.
 *
 * @param {object} intentObj - existing intent (possibly already resolved)
 * @param {Array<{input: *, output: *}>} counterExamples - new examples to add
 * @returns {object} A new intent with updated examples, freshly resolved
 */
export function negotiateIntent(intentObj, counterExamples) {
  if (!Array.isArray(counterExamples) || counterExamples.length === 0) {
    throw new Error("negotiateIntent requires at least one counter-example");
  }

  // Merge existing examples with counter-examples.
  // Counter-examples override: if the same input appears, use the new output.
  const existingMap = new Map();
  for (const ex of intentObj.examples) {
    existingMap.set(JSON.stringify(ex.input), ex);
  }
  for (const ex of counterExamples) {
    existingMap.set(JSON.stringify(ex.input), ex);
  }

  const mergedExamples = [...existingMap.values()];

  // Re-encode and re-resolve with the expanded example set
  const newIntent = encodeIntent(
    mergedExamples,
    intentObj.properties,
    intentObj.constraints,
  );

  return resolveIntent(newIntent);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Try to infer a generic element-wise linear map: output[i] = a * input[i] + b
 */
function tryGenericMap(examples) {
  const allArrays = examples.every(({ input, output }) =>
    Array.isArray(input) && Array.isArray(output) &&
    input.length === output.length && input.length > 0 &&
    input.every(v => typeof v === "number") &&
    output.every(v => typeof v === "number")
  );
  if (!allArrays) return null;

  // Collect all (input_elem, output_elem) pairs
  const pairs = [];
  for (const { input, output } of examples) {
    for (let i = 0; i < input.length; i++) {
      pairs.push({ x: input[i], y: output[i] });
    }
  }
  if (pairs.length < 2) return null;

  // Fit y = a*x + b
  const p1 = pairs[0], p2 = pairs.find(p => p.x !== p1.x);
  if (!p2) {
    // All same input — could be constant map
    if (pairs.every(p => p.y === p1.y)) {
      const c = p1.y;
      return {
        fn: (x) => x.map(() => c),
        formula: `x.map(() => ${c})`,
        confidence: 0.8,
      };
    }
    return null;
  }

  const a = (p2.y - p1.y) / (p2.x - p1.x);
  const b = p1.y - a * p1.x;
  if (!pairs.every(p => Math.abs(a * p.x + b - p.y) < 0.001)) return null;

  let formula, fn;
  if (Math.abs(b) < 0.001) {
    if (Math.abs(a - 1) < 0.001) {
      formula = "x.map(n => n)";
      fn = (x) => x.map(n => n);
    } else {
      formula = `x.map(n => ${a} * n)`;
      fn = (x) => x.map(n => a * n);
    }
  } else if (Math.abs(a - 1) < 0.001) {
    formula = `x.map(n => n + ${b})`;
    fn = (x) => x.map(n => n + b);
  } else {
    formula = `x.map(n => ${a} * n + ${b})`;
    fn = (x) => x.map(n => a * n + b);
  }

  return { fn, formula, confidence: 0.85 };
}
