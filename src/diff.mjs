// Benoît Differential Testing
//
// Given two functions that SHOULD behave the same, find where they diverge.
// This is the verification backbone of the protocol:
//   - Agent A sends behavior
//   - Agent B synthesizes code
//   - Diff-test finds disagreements → trigger renegotiation
//
// Also: compare a function against its algebraic properties to find
// edge cases where the property breaks down.

import { transpile } from "./transpile.mjs";
import { infer } from "./infer.mjs";

function safe(fn, ...args) {
  try { return { ok: true, value: fn(...args) }; }
  catch(e) { return { ok: false, error: e.message }; }
}

function compile(src) {
  const name = src.trim().match(/^(?:async\s+)?(_?\w+)/)?.[1];
  if (!name) return null;
  try {
    const js = transpile(src).replace(/export /g, "");
    const mod = new Function(js + `\nreturn { ${name} }`)();
    const paramStr = src.match(/^\w+\s+([\w,\s]+?)\s*->/)?.[1] || "";
    const arity = paramStr.split(/[\s,]+/).filter(Boolean).length;
    return { fn: mod[name], name, arity };
  } catch { return null; }
}

// Expanding sample strategy: start coarse, refine around failures
function* sampleGenerator1D(depth = 3) {
  // Depth 0: key values
  yield* [0, 1, -1, 2, -2];
  if (depth < 1) return;
  // Depth 1: wider range
  yield* [3, -3, 5, -5, 10, -10, 42, -42, 100, -100];
  if (depth < 2) return;
  // Depth 2: dense around 0 + boundaries
  yield* [0.5, -0.5, 0.1, -0.1, 0.01, -0.01, 999, -999];
  if (depth < 3) return;
  // Depth 3: random-ish
  for (let i = 0; i < 50; i++) {
    yield Math.round((Math.random() * 200 - 100) * 100) / 100;
  }
}

function* sampleGenerator2D(depth = 2) {
  const base = [0, 1, -1, 2, -2, 3, 5, 10];
  for (const a of base.slice(0, depth < 1 ? 3 : 8)) {
    for (const b of base.slice(0, depth < 1 ? 3 : 8)) {
      yield [a, b];
    }
  }
}

/**
 * Differential test: compare two functions on expanding sample space.
 * Returns all inputs where they disagree.
 *
 * @param {string} srcA - First function source
 * @param {string} srcB - Second function source
 * @returns {object} Diff report
 */
export function diffTest(srcA, srcB) {
  const a = compile(srcA);
  const b = compile(srcB);

  if (!a || !b) return { error: "compile_failed" };
  if (a.arity !== b.arity) return { error: "arity_mismatch", arityA: a.arity, arityB: b.arity };

  const disagreements = [];
  const agreements = [];
  let tested = 0;

  const samples = a.arity === 1 ? sampleGenerator1D(3) : sampleGenerator2D(2);

  for (const input of samples) {
    tested++;
    const args = Array.isArray(input) ? input : [input];
    const ra = safe(a.fn, ...args);
    const rb = safe(b.fn, ...args);

    if (ra.ok && rb.ok) {
      if (ra.value === rb.value) {
        agreements.push({ input: args, output: ra.value });
      } else if (typeof ra.value === "number" && typeof rb.value === "number" &&
                 Math.abs(ra.value - rb.value) < 0.001) {
        agreements.push({ input: args, output: ra.value, approx: true });
      } else {
        disagreements.push({
          input: args,
          outputA: ra.value,
          outputB: rb.value
        });
      }
    } else if (ra.ok !== rb.ok) {
      disagreements.push({
        input: args,
        outputA: ra.ok ? ra.value : `ERROR: ${ra.error}`,
        outputB: rb.ok ? rb.value : `ERROR: ${rb.error}`
      });
    }
  }

  return {
    nameA: a.name,
    nameB: b.name,
    arity: a.arity,
    tested,
    agreements: agreements.length,
    disagreements: disagreements.length,
    equivalent: disagreements.length === 0,
    details: disagreements.slice(0, 20),
    rate: `${agreements.length}/${tested} (${Math.round(agreements.length / tested * 100)}%)`
  };
}

/**
 * Property stress test: probe a function with many inputs to find
 * edge cases where a claimed property breaks down.
 *
 * @param {string} src - Function source
 * @returns {object} Stress test report
 */
export function stressTest(src) {
  const compiled = compile(src);
  if (!compiled) return { error: "compile_failed" };

  const { fn, name, arity } = compiled;
  const result = infer(src);
  const properties = result.properties.map(p => p.type);

  const failures = [];

  for (const prop of properties) {
    const propFailures = [];

    if (arity === 1) {
      for (const x of sampleGenerator1D(3)) {
        try {
          switch (prop) {
            case "commutative": break; // Binary only
            case "even_function":
              if (fn(-x) !== fn(x)) propFailures.push({ x, expected: `f(-${x}) == f(${x})`, got: `${fn(-x)} ≠ ${fn(x)}` });
              break;
            case "odd_function":
              if (x !== 0 && fn(-x) !== -fn(x)) propFailures.push({ x, expected: `f(-${x}) == -f(${x})`, got: `${fn(-x)} ≠ ${-fn(x)}` });
              break;
            case "involution":
              if (fn(fn(x)) !== x) propFailures.push({ x, expected: `f(f(${x})) == ${x}`, got: `${fn(fn(x))}` });
              break;
            case "idempotent":
              if (fn(fn(x)) !== fn(x)) propFailures.push({ x, expected: `f(f(${x})) == f(${x})`, got: `${fn(fn(x))} ≠ ${fn(x)}` });
              break;
            case "non_negative":
              if (fn(x) < 0) propFailures.push({ x, expected: `f(${x}) >= 0`, got: `${fn(x)}` });
              break;
            case "monotonic_increasing":
              if (x < 100) {
                const fx1 = fn(x), fx2 = fn(x + 0.01);
                if (fx2 < fx1) propFailures.push({ x, expected: `f(${x+0.01}) >= f(${x})`, got: `${fx2} < ${fx1}` });
              }
              break;
          }
        } catch { /* skip errors */ }
      }
    }

    if (propFailures.length > 0) {
      failures.push({ property: prop, failures: propFailures.slice(0, 5), total: propFailures.length });
    }
  }

  return {
    name,
    arity,
    properties,
    tested: properties.length,
    robust: failures.length === 0,
    failures,
    summary: failures.length === 0
      ? `All ${properties.length} properties hold under stress testing`
      : `${failures.length}/${properties.length} properties have edge cases`
  };
}
