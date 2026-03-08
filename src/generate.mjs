// Benoît Function Generation Engine
// The reverse of inference: given desired properties, synthesize a function.
// AI-to-AI communication: describe what you need, get code that satisfies it.

import { transpile } from "./transpile.mjs";
import { infer } from "./infer.mjs";

/**
 * Catalog of known function templates with their mathematical properties.
 * Each entry: { name, arity, code, properties }
 *   - code is Benoît source
 *   - properties is an array of property type strings (matching infer output)
 */
const CATALOG = [
  // --- Binary (arity 2) ---
  {
    name: "add",
    arity: 2,
    code: "add a,b -> a + b",
    properties: [
      "commutative", "associative",
      "left_identity", "right_identity",  // identity element 0
    ],
    tags: ["identity_element_0"],
  },
  {
    name: "mul",
    arity: 2,
    code: "mul a,b -> a * b",
    properties: [
      "commutative", "associative",
      "left_identity", "right_identity",  // identity element 1
      "absorbing_element",
    ],
    tags: ["identity_element_1"],
  },
  {
    name: "min",
    arity: 2,
    code: "min a,b -> Math.min(a, b)",
    properties: ["commutative", "associative", "idempotent"],
    tags: [],
  },
  {
    name: "max",
    arity: 2,
    code: "max a,b -> Math.max(a, b)",
    properties: ["commutative", "associative", "idempotent"],
    tags: [],
  },
  {
    name: "sub",
    arity: 2,
    code: "sub a,b -> a - b",
    properties: ["right_identity"],
    tags: ["identity_element_0"],
  },
  {
    name: "pow",
    arity: 2,
    code: "pow a,b -> a ** b",
    properties: ["right_identity"],
    tags: ["identity_element_1"],
  },

  // --- Unary (arity 1) ---
  {
    name: "id",
    arity: 1,
    code: "id x -> x",
    properties: [
      "identity", "idempotent", "involution",
      "monotonic_increasing", "odd_function",
    ],
    tags: [],
  },
  {
    name: "negate",
    arity: 1,
    code: "negate x -> 0 - x",
    properties: [
      "involution", "odd_function", "monotonic_decreasing",
    ],
    tags: [],
  },
  {
    name: "abs",
    arity: 1,
    code: "abs x -> Math.abs(x)",
    properties: [
      "even_function", "non_negative", "idempotent",
      "monotonic_increasing",  // on non-negative domain only, but infer sees it
    ],
    tags: [],
  },
  {
    name: "square",
    arity: 1,
    code: "square x -> x * x",
    properties: ["even_function", "non_negative"],
    tags: [],
  },
  {
    name: "double",
    arity: 1,
    code: "double x -> x + x",
    properties: ["odd_function", "monotonic_increasing"],
    tags: [],
  },
  {
    name: "increment",
    arity: 1,
    code: "increment x -> x + 1",
    properties: ["monotonic_increasing"],
    tags: [],
  },
  {
    name: "decrement",
    arity: 1,
    code: "decrement x -> x - 1",
    properties: ["monotonic_increasing"],
    tags: [],
  },
  {
    name: "sign",
    arity: 1,
    code: "sign x -> Math.sign(x)",
    properties: ["odd_function", "idempotent", "monotonic_increasing"],
    tags: [],
  },
  {
    name: "floor",
    arity: 1,
    code: "floor x -> Math.floor(x)",
    properties: ["idempotent", "monotonic_increasing"],
    tags: [],
  },
  {
    name: "ceil",
    arity: 1,
    code: "ceil x -> Math.ceil(x)",
    properties: ["idempotent", "monotonic_increasing"],
    tags: [],
  },
  {
    name: "zero",
    arity: 1,
    code: "zero x -> 0",
    properties: [
      "even_function", "non_negative", "idempotent",
    ],
    tags: ["constant"],
  },

  // --- Ternary (arity 3) ---
  {
    name: "clamp",
    arity: 3,
    code: "clamp x,lo,hi -> Math.max(lo, Math.min(hi, x))",
    properties: ["bounded", "passthrough_in_bounds"],
    tags: [],
  },
];

/**
 * Normalize a user-supplied property name to match catalog/infer conventions.
 * Handles aliases like "identity_element_0" -> tags + specific properties.
 */
function normalizeProperty(prop) {
  const aliases = {
    "commutative": "commutative",
    "associative": "associative",
    "idempotent": "idempotent",
    "involution": "involution",
    "identity": "identity",
    "even_function": "even_function",
    "even": "even_function",
    "odd_function": "odd_function",
    "odd": "odd_function",
    "non_negative": "non_negative",
    "nonnegative": "non_negative",
    "monotonic_increasing": "monotonic_increasing",
    "increasing": "monotonic_increasing",
    "monotonic_decreasing": "monotonic_decreasing",
    "decreasing": "monotonic_decreasing",
    "absorbing_element": "absorbing_element",
    "left_identity": "left_identity",
    "right_identity": "right_identity",
    "bounded": "bounded",
    "passthrough_in_bounds": "passthrough_in_bounds",
    "fixed_points": "fixed_points",
  };
  return aliases[prop] || prop;
}

/**
 * Score a catalog entry against the requested properties.
 * Returns a value between 0 and 1.
 *   - 1.0 means every requested property is present
 *   - Partial matches get proportional scores
 *   - Bonus for not having excess properties (tighter match)
 */
function scoreCandidate(entry, requestedProps, requestedTags) {
  let matched = 0;
  const allEntryProps = [...entry.properties, ...entry.tags];

  for (const prop of requestedProps) {
    if (allEntryProps.includes(prop)) {
      matched++;
    }
  }
  for (const tag of requestedTags) {
    if (entry.tags.includes(tag)) {
      matched++;
    }
  }

  const totalRequested = requestedProps.length + requestedTags.length;
  if (totalRequested === 0) return 0;

  const recall = matched / totalRequested;

  // Precision bonus: prefer entries that don't have many extra properties
  const extraProps = allEntryProps.length - matched;
  const precision = matched / Math.max(1, allEntryProps.length);

  // F1-like score weighted toward recall (we want all requested props)
  const score = 0.7 * recall + 0.3 * precision;
  return score;
}

/**
 * Separate user-input properties into catalog properties and tags.
 * Tags are special identifiers like "identity_element_0" that aren't
 * directly inferred property types but narrow the search.
 */
function classifyProperties(properties) {
  const tagPatterns = ["identity_element_0", "identity_element_1", "constant"];
  const props = [];
  const tags = [];

  for (const raw of properties) {
    const norm = normalizeProperty(raw);
    if (tagPatterns.includes(raw)) {
      tags.push(raw);
    } else {
      props.push(norm);
    }
  }

  return { props, tags };
}

/**
 * Validate a candidate by actually running infer() on it and checking
 * whether the inferred properties include the requested ones.
 */
function validateCandidate(entry, requestedProps) {
  try {
    const result = infer(entry.code);
    const inferredTypes = result.properties.map(p => p.type);
    const verified = requestedProps.filter(p => inferredTypes.includes(p));
    return {
      verified,
      total: requestedProps.length,
      confidence: requestedProps.length > 0
        ? verified.length / requestedProps.length
        : 0,
    };
  } catch {
    return { verified: [], total: requestedProps.length, confidence: 0 };
  }
}

/**
 * Generate a Benoît function that satisfies the given set of properties.
 *
 * @param {string[]} properties - Desired properties (e.g. ["commutative", "associative"])
 * @param {number} [arity] - Optional arity filter (1, 2, or 3). If omitted, considers all arities.
 * @returns {{ code: string, properties: string[], confidence: number }}
 */
export function generate(properties, arity) {
  const candidates = generateAll(properties, arity);
  if (candidates.length === 0) {
    return {
      code: null,
      properties: [],
      confidence: 0,
    };
  }
  return candidates[0];
}

/**
 * Generate all matching Benoît function candidates for the given properties,
 * ranked by score (best first).
 *
 * @param {string[]} properties - Desired properties
 * @param {number} [arity] - Optional arity filter
 * @returns {Array<{ code: string, properties: string[], confidence: number, name: string }>}
 */
export function generateAll(properties, arity) {
  const { props, tags } = classifyProperties(properties);

  let pool = CATALOG;
  if (arity !== undefined && arity !== null) {
    pool = pool.filter(e => e.arity === arity);
  }

  const scored = pool.map(entry => {
    const catalogScore = scoreCandidate(entry, props, tags);
    return { entry, catalogScore };
  });

  // Filter out zero-score candidates
  const viable = scored.filter(s => s.catalogScore > 0);

  // Sort by catalog score descending
  viable.sort((a, b) => b.catalogScore - a.catalogScore);

  // Validate top candidates with actual inference
  const results = viable.map(({ entry, catalogScore }) => {
    const validation = validateCandidate(entry, props);

    // Final confidence: blend catalog score with validation
    const confidence = Math.round(
      (0.4 * catalogScore + 0.6 * validation.confidence) * 100
    ) / 100;

    return {
      name: entry.name,
      code: entry.code,
      properties: [...new Set([...entry.properties, ...entry.tags])],
      confidence,
      verified: validation.verified,
    };
  });

  // Re-sort by final confidence
  results.sort((a, b) => b.confidence - a.confidence);

  return results;
}
