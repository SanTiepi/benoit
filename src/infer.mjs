// Benoît Property Inference Engine
// Given a function, automatically discover its mathematical properties
// No human-written tests needed — the code proves itself

import { transpile } from "./transpile.mjs";

/**
 * Infer properties of a Benoît function by probing its behavior.
 * Tests for: identity, commutativity, associativity, idempotence,
 * monotonicity, fixed points, inverse relationships, and more.
 *
 * @param {string} benSrc - Benoît source code for a single function
 * @returns {object} - Discovered properties with evidence
 */
export function infer(benSrc) {
  const js = transpile(benSrc).replace(/export /g, "");
  const fn = new Function(js + `\nreturn { ${extractName(benSrc)} }`);
  const mod = fn();
  const name = extractName(benSrc);
  const func = mod[name];
  const arity = extractArity(benSrc);

  const properties = [];
  const samples = generateSamples(arity);

  if (arity === 1) {
    properties.push(...inferUnary(name, func, samples.unary));
  } else if (arity === 2) {
    properties.push(...inferBinary(name, func, samples.binary));
  } else if (arity === 3) {
    properties.push(...inferTernary(name, func, samples.ternary));
  }

  // Generate Benoît assertions from discovered properties
  const assertions = properties
    .filter(p => p.confidence >= 0.8)
    .flatMap(p => p.examples || []);

  return { name, arity, properties, assertions };
}

function extractName(src) {
  const m = src.trim().match(/^(?:async\s+)?(_?\w+)/);
  return m ? m[1] : "unknown";
}

function extractArity(src) {
  const m = src.trim().match(/^(?:async\s+)?_?\w+\s+([\w,=\s]+?)\s+->/);
  if (!m) return 0;
  return m[1].split(/[\s,]+/).filter(Boolean).length;
}

function generateSamples(arity) {
  const values = [-10, -3, -2, -1, 0, 1, 2, 3, 5, 10, 42, 100];

  return {
    unary: values,
    binary: values.flatMap(a => values.map(b => [a, b])),
    ternary: [-5, 0, 5, 10, 50, 100, 200].flatMap(a =>
      [0, 10].flatMap(b => [50, 100].map(c => [a, b, c])))
  };
}

function safe(fn, ...args) {
  try { return { ok: true, value: fn(...args) }; }
  catch { return { ok: false }; }
}

function inferUnary(name, fn, samples) {
  const props = [];
  const results = samples.map(x => ({ x, r: safe(fn, x) })).filter(s => s.r.ok);

  // Fixed points: f(x) == x
  const fixedPoints = results.filter(s => s.r.value === s.x);
  if (fixedPoints.length > 0 && fixedPoints.length < results.length) {
    props.push({
      type: "fixed_points",
      description: `${name} has fixed points`,
      evidence: fixedPoints.map(s => s.x),
      examples: fixedPoints.map(s => `${name}(${s.x}) == ${s.x}`),
      confidence: 1.0
    });
  }

  // Identity: f(x) == x for all x
  if (fixedPoints.length === results.length) {
    props.push({
      type: "identity",
      description: `${name} is the identity function`,
      examples: [`${name}(42) == 42`, `${name}(-1) == -1`],
      confidence: 1.0
    });
  }

  // Idempotent: f(f(x)) == f(x)
  const idempotent = results.every(s => {
    const ff = safe(fn, s.r.value);
    return ff.ok && ff.value === s.r.value;
  });
  if (idempotent && fixedPoints.length < results.length) {
    props.push({
      type: "idempotent",
      description: `${name} is idempotent: ${name}(${name}(x)) == ${name}(x)`,
      examples: results.slice(0, 3).map(s => `${name}(${name}(${s.x})) == ${s.r.value}`),
      confidence: 0.95
    });
  }

  // Involution: f(f(x)) == x
  const involution = results.every(s => {
    const ff = safe(fn, s.r.value);
    return ff.ok && ff.value === s.x;
  });
  if (involution && fixedPoints.length < results.length) {
    props.push({
      type: "involution",
      description: `${name} is an involution: ${name}(${name}(x)) == x`,
      examples: results.slice(0, 3).map(s => `${name}(${name}(${s.x})) == ${s.x}`),
      confidence: 0.95
    });
  }

  // Monotonic increasing
  const sorted = [...results].sort((a, b) => a.x - b.x);
  const increasing = sorted.every((s, i) =>
    i === 0 || s.r.value >= sorted[i-1].r.value);
  if (increasing && results.length > 3) {
    props.push({
      type: "monotonic_increasing",
      description: `${name} is monotonically increasing`,
      examples: [`${name}(${sorted[0].x}) <= ${name}(${sorted[sorted.length-1].x})`],
      confidence: 0.9
    });
  }

  // Monotonic decreasing
  const decreasing = sorted.every((s, i) =>
    i === 0 || s.r.value <= sorted[i-1].r.value);
  if (decreasing && results.length > 3 && !increasing) {
    props.push({
      type: "monotonic_decreasing",
      description: `${name} is monotonically decreasing`,
      examples: [`${name}(${sorted[0].x}) >= ${name}(${sorted[sorted.length-1].x})`],
      confidence: 0.9
    });
  }

  // Non-negative output
  const allNonNeg = results.every(s => s.r.value >= 0);
  if (allNonNeg && results.some(s => s.x < 0)) {
    props.push({
      type: "non_negative",
      description: `${name} always returns non-negative values`,
      examples: [`${name}(-3) == ${fn(-3)}`, `${name}(-10) == ${fn(-10)}`],
      confidence: 0.9
    });
  }

  // Even function: f(-x) == f(x)
  const even = results.every(s => {
    const neg = safe(fn, -s.x);
    return neg.ok && neg.value === s.r.value;
  });
  if (even && results.some(s => s.x !== 0)) {
    props.push({
      type: "even_function",
      description: `${name} is even: ${name}(-x) == ${name}(x)`,
      examples: results.filter(s => s.x > 0).slice(0, 3).map(s => `${name}(-${s.x}) == ${name}(${s.x})`),
      confidence: 0.95
    });
  }

  // Odd function: f(-x) == -f(x)
  const odd = results.every(s => {
    const neg = safe(fn, -s.x);
    return neg.ok && neg.value === -s.r.value;
  });
  if (odd && results.some(s => s.x !== 0 && s.r.value !== 0)) {
    props.push({
      type: "odd_function",
      description: `${name} is odd: ${name}(-x) == -${name}(x)`,
      examples: results.filter(s => s.x > 0).slice(0, 3).map(s => `${name}(-${s.x}) == -${name}(${s.x})`),
      confidence: 0.95
    });
  }

  return props;
}

function inferBinary(name, fn, samples) {
  const props = [];
  const results = samples.map(([a, b]) => ({ a, b, r: safe(fn, a, b) })).filter(s => s.r.ok);

  // Commutative: f(a, b) == f(b, a)
  const commutative = results.every(s => {
    const rev = safe(fn, s.b, s.a);
    return rev.ok && rev.value === s.r.value;
  });
  if (commutative) {
    props.push({
      type: "commutative",
      description: `${name} is commutative: ${name}(a, b) == ${name}(b, a)`,
      examples: [`${name}(3, 5) == ${name}(5, 3)`, `${name}(-1, 42) == ${name}(42, -1)`],
      confidence: 0.95
    });
  }

  // Identity element: f(a, e) == a
  for (const e of [0, 1]) {
    const isRightId = results.filter(s => s.b === e).every(s => s.r.value === s.a);
    const isLeftId = results.filter(s => s.a === e).every(s => s.r.value === s.b);
    if (isRightId && results.filter(s => s.b === e).length > 3) {
      props.push({
        type: "right_identity",
        description: `${name} has right identity element ${e}: ${name}(a, ${e}) == a`,
        examples: [`${name}(42, ${e}) == 42`, `${name}(-5, ${e}) == -5`],
        confidence: 0.95
      });
    }
    if (isLeftId && results.filter(s => s.a === e).length > 3) {
      props.push({
        type: "left_identity",
        description: `${name} has left identity element ${e}: ${name}(${e}, b) == b`,
        examples: [`${name}(${e}, 42) == 42`, `${name}(${e}, -5) == -5`],
        confidence: 0.95
      });
    }
  }

  // Associative: f(f(a, b), c) == f(a, f(b, c))
  const triples = [[-1,0,1], [1,2,3], [2,3,5], [0,5,10]];
  const associative = triples.every(([a, b, c]) => {
    const lhs = safe(fn, safe(fn, a, b).value, c);
    const rhs = safe(fn, a, safe(fn, b, c).value);
    return lhs.ok && rhs.ok && lhs.value === rhs.value;
  });
  if (associative) {
    props.push({
      type: "associative",
      description: `${name} is associative: ${name}(${name}(a, b), c) == ${name}(a, ${name}(b, c))`,
      examples: [`${name}(${name}(1, 2), 3) == ${name}(1, ${name}(2, 3))`],
      confidence: 0.9
    });
  }

  // Absorbing element: f(a, z) == z
  for (const z of [0]) {
    const absorbs = results.filter(s => s.b === z).every(s => s.r.value === z) &&
                    results.filter(s => s.a === z).every(s => s.r.value === z);
    if (absorbs && results.filter(s => s.b === z).length > 3) {
      props.push({
        type: "absorbing_element",
        description: `${name} has absorbing element ${z}: ${name}(a, ${z}) == ${z}`,
        examples: [`${name}(42, ${z}) == ${z}`, `${name}(${z}, 42) == ${z}`],
        confidence: 0.9
      });
    }
  }

  // Distributive check would need two operations — skip for now

  return props;
}

function inferTernary(name, fn, samples) {
  const props = [];
  const results = samples.map(([a, b, c]) => ({ a, b, c, r: safe(fn, a, b, c) })).filter(s => s.r.ok);

  // Bounded output: min <= f(x, min, max) <= max
  const bounded = results.every(s => s.r.value >= s.b && s.r.value <= s.c);
  if (bounded) {
    props.push({
      type: "bounded",
      description: `${name} output is bounded by args 2 and 3`,
      examples: [`${name}(-100, 0, 50) == ${fn(-100, 0, 50)}`, `${name}(200, 0, 50) == ${fn(200, 0, 50)}`],
      confidence: 0.95
    });
  }

  // Idempotent within bounds
  const idempotentInBounds = results
    .filter(s => s.a >= s.b && s.a <= s.c)
    .every(s => s.r.value === s.a);
  if (idempotentInBounds) {
    props.push({
      type: "passthrough_in_bounds",
      description: `${name} returns input unchanged when within bounds`,
      examples: [`${name}(25, 0, 50) == 25`, `${name}(5, 0, 100) == 5`],
      confidence: 0.95
    });
  }

  return props;
}

/**
 * Run inference on all functions in a .ben file.
 * Returns a report with discovered properties.
 */
export function inferAll(benSrc) {
  const lines = benSrc.split("\n");
  const functions = [];
  let current = [];
  let inBlock = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.match(/^(_?\w+)\s+.*->/) && !inBlock) {
      if (current.length > 0) {
        functions.push(current.join("\n"));
        current = [];
      }
      current.push(line);
      inBlock = trimmed.endsWith("->");
    } else if (inBlock && (trimmed === "" || line.match(/^\S/))) {
      inBlock = false;
      functions.push(current.join("\n"));
      current = [];
      if (trimmed !== "" && !trimmed.includes("==")) {
        current.push(line);
        inBlock = trimmed.endsWith("->");
      }
    } else if (inBlock || current.length > 0) {
      current.push(line);
    }
  }
  if (current.length > 0) functions.push(current.join("\n"));

  const results = [];
  for (const fnSrc of functions) {
    try {
      results.push(infer(fnSrc));
    } catch (e) {
      // Skip functions that can't be analyzed independently
    }
  }
  return results;
}
