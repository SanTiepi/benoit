// Benoît Type Inference
//
// Discovers the domain and range of functions by probing:
//   - Integer vs Float vs String vs Boolean
//   - Input constraints (positive only, non-zero, bounded)
//   - Output guarantees (always integer, always positive, etc.)
//
// This is NOT a static type system. It's behavioral type discovery.
// The function tells us what it accepts and produces.

import { transpile } from "./transpile.mjs";

const INT_SAMPLES = [-100, -10, -3, -1, 0, 1, 3, 10, 100];
const FLOAT_SAMPLES = [-2.5, -0.5, 0.0, 0.5, 1.5, 3.14, 10.7];
const STRING_SAMPLES = ["", "a", "hello", "Benoît", "123", "foo bar"];
const BOOL_SAMPLES = [true, false];

function safe(fn, ...args) {
  try { return { ok: true, value: fn(...args) }; }
  catch { return { ok: false }; }
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

/**
 * Infer the type signature of a Benoît function.
 *
 * @param {string} src - Function source code
 * @returns {object} Type signature with domain, range, constraints
 */
export function inferType(src) {
  const compiled = compile(src);
  if (!compiled) return { error: "compile_failed" };

  const { fn, name, arity } = compiled;

  if (arity === 1) return inferUnary(fn, name);
  if (arity === 2) return inferBinary(fn, name);
  return { name, arity, domain: "unknown", range: "unknown" };
}

function classifyOutput(value) {
  if (typeof value === "string") return "string";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") {
    if (Number.isNaN(value)) return "NaN";
    if (!Number.isFinite(value)) return "Infinity";
    if (Number.isInteger(value)) return "integer";
    return "float";
  }
  return "unknown";
}

function inferUnary(fn, name) {
  // Test integer inputs
  const intResults = INT_SAMPLES.map(x => {
    const r = safe(fn, x);
    return r.ok ? { input: x, output: r.value, type: classifyOutput(r.value) } : null;
  }).filter(Boolean);

  // Test float inputs
  const floatResults = FLOAT_SAMPLES.map(x => {
    const r = safe(fn, x);
    return r.ok ? { input: x, output: r.value, type: classifyOutput(r.value) } : null;
  }).filter(Boolean);

  // Test string inputs
  const stringResults = STRING_SAMPLES.map(x => {
    const r = safe(fn, x);
    return r.ok ? { input: x, output: r.value, type: classifyOutput(r.value) } : null;
  }).filter(Boolean);

  // Determine input domain — only count strings as accepted if they produce
  // meaningful (non-NaN, non-undefined, non-coerced) output for most inputs
  const acceptsInts = intResults.length > 0;
  const acceptsFloats = floatResults.length > 0;
  const meaningfulStringResults = stringResults.filter(r =>
    r.type !== "NaN" && r.type !== "Infinity" && r.type !== "unknown" &&
    r.output !== undefined && r.output !== null
  );
  const acceptsStrings = meaningfulStringResults.length >= 3;

  let domain;
  if (acceptsStrings && !acceptsInts) domain = "string";
  else if (acceptsInts && acceptsFloats && !acceptsStrings) domain = "number";
  else if (acceptsInts && acceptsStrings) domain = "any";
  else if (acceptsInts) domain = "number";
  else domain = "unknown";

  // Determine output range
  const allOutputTypes = [...intResults, ...floatResults]
    .map(r => r.type)
    .filter(t => t !== "NaN" && t !== "Infinity");

  let range;
  const uniqueTypes = [...new Set(allOutputTypes)];
  if (acceptsStrings && stringResults.some(r => r.type === "string")) {
    range = "string";
  } else if (uniqueTypes.length === 1 && uniqueTypes[0] === "integer") {
    range = "integer";
  } else if (uniqueTypes.every(t => t === "integer" || t === "float")) {
    range = "number";
  } else if (uniqueTypes.length === 1 && uniqueTypes[0] === "boolean") {
    range = "boolean";
  } else {
    range = uniqueTypes.join(" | ") || "unknown";
  }

  // Discover constraints
  const constraints = [];

  // Input constraints
  const negInputs = intResults.filter(r => r.input < 0);
  const posInputs = intResults.filter(r => r.input > 0);
  if (negInputs.length === 0 && posInputs.length > 0) {
    constraints.push("input: positive only");
  }

  // Output constraints
  const numOutputs = [...intResults, ...floatResults].filter(r =>
    typeof r.output === "number" && Number.isFinite(r.output));
  if (numOutputs.length > 0) {
    if (numOutputs.every(r => r.output >= 0)) constraints.push("output: non-negative");
    if (numOutputs.every(r => Number.isInteger(r.output))) constraints.push("output: integer");
    if (numOutputs.every(r => r.output >= 0 && r.output <= 1)) constraints.push("output: [0, 1]");
  }

  // Preserves type?
  if (domain === "number" && intResults.every(r => Number.isInteger(r.output)) &&
      floatResults.some(r => !Number.isInteger(r.output))) {
    constraints.push("int→int, float→float");
  }

  return {
    name,
    arity: 1,
    signature: `${name}: ${domain} → ${range}`,
    domain,
    range,
    constraints,
    samples: {
      integers: intResults.length,
      floats: floatResults.length,
      strings: stringResults.filter(r => r.type !== "NaN").length
    }
  };
}

function inferBinary(fn, name) {
  // Test with integer pairs
  const testPairs = [];
  for (const a of [-5, -1, 0, 1, 3, 7]) {
    for (const b of [-3, 0, 1, 5, 10]) {
      const r = safe(fn, a, b);
      if (r.ok) testPairs.push({ a, b, output: r.value, type: classifyOutput(r.value) });
    }
  }

  // Test with string pairs
  const stringPairs = [];
  for (const a of ["hello", "foo"]) {
    for (const b of ["world", "bar"]) {
      const r = safe(fn, a, b);
      if (r.ok) stringPairs.push({ a, b, output: r.value, type: classifyOutput(r.value) });
    }
  }

  const numTypes = [...new Set(testPairs.map(r => r.type).filter(t => t !== "NaN"))];
  const hasStrings = stringPairs.some(r => r.type === "string");

  let domain = hasStrings ? "string × string" : "number × number";
  let range;
  if (numTypes.length === 1 && numTypes[0] === "integer") range = "integer";
  else if (numTypes.every(t => t === "integer" || t === "float")) range = "number";
  else if (numTypes.length === 1 && numTypes[0] === "boolean") range = "boolean";
  else range = numTypes.join(" | ") || "unknown";

  const constraints = [];
  const numOutputs = testPairs.filter(r => typeof r.output === "number" && Number.isFinite(r.output));
  if (numOutputs.every(r => r.output >= 0)) constraints.push("output: non-negative");
  if (numOutputs.every(r => Number.isInteger(r.output))) constraints.push("output: integer");

  return {
    name,
    arity: 2,
    signature: `${name}: ${domain} → ${range}`,
    domain,
    range,
    constraints,
    samples: { pairs: testPairs.length, stringPairs: stringPairs.length }
  };
}

/**
 * Infer types for all functions in a module.
 */
export function inferTypes(source) {
  const blocks = source.split("\n\n").filter(b => b.trim());
  const results = [];

  for (const block of blocks) {
    const defLine = block.split("\n").find(l => l.match(/^\w+\s+[\w,\s]+?\s*->/));
    if (!defLine) continue;
    const src = block.split("\n").filter(l => !l.match(/^\w+\(.*\)\s*==/)).join("\n").trim();
    results.push(inferType(src));
  }

  return results;
}
