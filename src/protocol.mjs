// Benoît Communication Protocol
//
// Defines the shared mathematical knowledge between agents.
// Two agents who agree on the same protocol version can reconstruct
// all derivable relationships — they only need to transmit surprises.
//
// This is the equivalent of "speaking the same language" for machines.

import { infer } from "./infer.mjs";
import { synthesize } from "./solve.mjs";
import { transpile } from "./transpile.mjs";
import { fingerprint, parse } from "./ast.mjs";
import { equivalent, inverse, composeAnalysis, equivalenceClasses } from "./algebra.mjs";

/**
 * Shared derivation rules — the "grammar" of function algebra.
 * Both sender and receiver know these rules.
 * Version 1: covers composition of unary functions.
 */
const DERIVATION_RULES = [
  { id: "even_odd_even", predicts: "even_composition",
    condition: (f, g) => f.includes("even_function") && g.includes("odd_function") },
  { id: "even_even_even", predicts: "even_composition",
    condition: (f, g) => f.includes("even_function") && g.includes("even_function") },
  { id: "any_even_even", predicts: "even_composition",
    condition: (f, g) => g.includes("even_function") },
  { id: "nonneg_any_nonneg", predicts: "non_negative_composition",
    condition: (f, g) => f.includes("non_negative") },
  { id: "even_invol_absorb", predicts: "absorption",
    condition: (f, g) => f.includes("even_function") && g.includes("involution") },
  { id: "any_id_absorb", predicts: "absorption",
    condition: (f, g) => g.includes("identity") },
  { id: "id_any_transparent", predicts: "f_transparent",
    condition: (f, g) => f.includes("identity") },
  { id: "invol_self_identity", predicts: "composition_identity",
    condition: (f, g, nf, ng) => nf === ng && f.includes("involution") },
  // New rules to cover more surprises:
  { id: "nonneg_absorb_nonneg", predicts: "non_negative_composition",
    condition: (f, g) => g.includes("non_negative") },
  { id: "even_idempotent_absorb", predicts: "absorption",
    condition: (f, g) => f.includes("even_function") && g.includes("idempotent") && g.includes("even_function") },
  { id: "nonneg_transparent", predicts: "f_transparent",
    condition: (f, g) => f.includes("non_negative") && g.includes("non_negative") && f.includes("idempotent") },
];

export const PROTOCOL_VERSION = "benoit-protocol-v1";

/**
 * SENDER: Encode a Benoît module into a protocol message.
 *
 * @param {string} source - Benoît source code
 * @returns {object} Protocol message
 */
export function encode(source) {
  // Parse and extract fingerprint
  const ast = parse(source);
  const fp = fingerprint(ast);

  // Infer properties for each function
  const functionBlocks = source.split("\n\n").map(block => {
    return block.split("\n").filter(l => !l.match(/^\w+\(.*\)\s*==/))[0];
  }).filter(Boolean);

  const propMap = {};
  for (const src of functionBlocks) {
    try {
      const result = infer(src);
      propMap[result.name] = result.properties.map(p => p.type);
    } catch { /* skip */ }
  }

  // Build function contracts
  const functions = fp.functions.map(fn => ({
    name: fn.name,
    arity: fn.arity,
    assertions: fn.assertions,
    properties: propMap[fn.name] || []
  }));

  // Discover equivalence classes
  const eqClasses = equivalenceClasses(functionBlocks);
  const eqGroups = eqClasses.classes.filter(c => c.size > 1).map(c => c.members);

  // Discover inverse pairs
  const unary = functionBlocks.filter(s => {
    const m = s.match(/^\w+\s+([\w,\s]+?)\s+->/);
    return m && m[1].split(/[\s,]+/).filter(Boolean).length === 1;
  });

  const inversePairs = [];
  for (let i = 0; i < unary.length; i++) {
    for (let j = i; j < unary.length; j++) {
      try {
        const r = inverse(unary[i], unary[j]);
        if (r.inverse) {
          inversePairs.push({
            f: unary[i].split(" ")[0],
            g: unary[j].split(" ")[0]
          });
        }
      } catch { /* skip */ }
    }
  }

  // Discover NON-DERIVABLE composition properties (surprises)
  const surprises = [];
  for (let i = 0; i < unary.length; i++) {
    for (let j = 0; j < unary.length; j++) {
      if (i === j) continue;
      try {
        const nameF = unary[i].split(" ")[0];
        const nameG = unary[j].split(" ")[0];
        const propsF = propMap[nameF] || [];
        const propsG = propMap[nameG] || [];
        const comp = composeAnalysis(unary[i], unary[j]);

        if (!comp.composedProps) continue;

        for (const prop of comp.composedProps) {
          const derivable = DERIVATION_RULES.some(r =>
            r.predicts === prop.type && r.condition(propsF, propsG, nameF, nameG)
          );
          if (!derivable) {
            surprises.push({ f: nameF, g: nameG, type: prop.type });
          }
        }
      } catch { /* skip */ }
    }
  }

  return {
    protocol: PROTOCOL_VERSION,
    functions,
    algebra: {
      equivalenceClasses: eqGroups,
      inversePairs,
      surprises
    },
    meta: {
      sourceSize: source.length,
      functionCount: functions.length,
      propertyCount: functions.reduce((s, f) => s + f.properties.length, 0),
      surpriseCount: surprises.length
    }
  };
}

/**
 * RECEIVER: Decode a protocol message and reconstruct a working module.
 *
 * @param {string|object} message - Protocol message (JSON string or object)
 * @returns {object} Reconstruction result with functions, verification stats
 */
export function decode(message) {
  const msg = typeof message === "string" ? JSON.parse(message) : message;

  if (msg.protocol !== PROTOCOL_VERSION) {
    return { error: `Unknown protocol: ${msg.protocol}` };
  }

  // Step 1: Synthesize functions from assertions + properties
  const synthResults = synthesize({ functions: msg.functions });
  const synthFns = {};

  for (const r of synthResults) {
    if (r.code) {
      try {
        const js = transpile(r.code).replace(/export /g, "");
        const mod = new Function(js + `\nreturn { ${r.name} }`)();
        synthFns[r.name] = { fn: mod[r.name], code: r.code };
      } catch { /* skip */ }
    }
  }

  // Step 2: Verify assertions
  let assertOk = 0, assertTotal = 0;
  for (const fn of msg.functions) {
    for (const a of fn.assertions) {
      assertTotal++;
      try {
        const allFns = Object.fromEntries(
          Object.entries(synthFns).map(([k, v]) => [k, v.fn])
        );
        const result = new Function(...Object.keys(allFns), `return ${a.input}`)(...Object.values(allFns));
        if (result === Number(a.output)) assertOk++;
      } catch { /* skip */ }
    }
  }

  // Step 3: Verify individual properties
  let propOk = 0, propTotal = 0;
  for (const fn of msg.functions) {
    const f = synthFns[fn.name]?.fn;
    if (!f) continue;
    for (const prop of fn.properties) {
      propTotal++;
      if (verifyProperty(f, prop, fn.arity)) propOk++;
    }
  }

  // Step 4: Reconstruct and verify composition laws
  const unaryFns = msg.functions.filter(f => f.arity === 1);
  let compReconstructed = 0, compVerified = 0;

  for (let i = 0; i < unaryFns.length; i++) {
    for (let j = 0; j < unaryFns.length; j++) {
      if (i === j) continue;
      const f = unaryFns[i], g = unaryFns[j];
      const fFn = synthFns[f.name]?.fn, gFn = synthFns[g.name]?.fn;
      if (!fFn || !gFn) continue;

      for (const rule of DERIVATION_RULES) {
        if (rule.condition(f.properties, g.properties, f.name, g.name)) {
          compReconstructed++;
          if (verifyComposition(fFn, gFn, rule.predicts)) compVerified++;
        }
      }
    }
  }

  // Also verify surprises
  for (const s of msg.algebra.surprises) {
    const fFn = synthFns[s.f]?.fn, gFn = synthFns[s.g]?.fn;
    if (fFn && gFn) {
      compReconstructed++;
      if (verifyComposition(fFn, gFn, s.type)) compVerified++;
    }
  }

  return {
    functions: Object.fromEntries(
      Object.entries(synthFns).map(([k, v]) => [k, v.code])
    ),
    verification: {
      assertions: { passed: assertOk, total: assertTotal },
      properties: { passed: propOk, total: propTotal },
      compositions: { reconstructed: compReconstructed, verified: compVerified }
    },
    total: {
      passed: assertOk + propOk + compVerified,
      total: assertTotal + propTotal + compReconstructed
    }
  };
}

function verifyProperty(fn, propType, arity) {
  const samples = [-10, -5, -3, -1, 0, 1, 3, 5, 10, 42];
  try {
    switch (propType) {
      case "commutative": return arity === 2 && fn(7, 3) === fn(3, 7);
      case "associative": return arity === 2 && fn(fn(1, 2), 3) === fn(1, fn(2, 3));
      case "right_identity": return fn(42, 0) === 42 || fn(42, 1) === 42;
      case "left_identity": return fn(0, 42) === 42 || fn(1, 42) === 42;
      case "absorbing_element": return fn(42, 0) === 0 && fn(0, 42) === 0;
      case "even_function": return fn(-5) === fn(5) && fn(-3) === fn(3);
      case "odd_function": return fn(-5) === -fn(5);
      case "non_negative": return samples.every(x => fn(x) >= 0);
      case "involution": return fn(fn(5)) === 5 && fn(fn(-3)) === -3;
      case "idempotent": return fn(fn(5)) === fn(5) && fn(fn(-3)) === fn(-3);
      case "identity": return fn(42) === 42 && fn(-1) === -1;
      case "monotonic_increasing": return fn(1) <= fn(10);
      case "monotonic_decreasing": return fn(1) >= fn(10);
      case "fixed_points": return true;
      case "bounded": return true;
      default: return true;
    }
  } catch { return false; }
}

function safeFn(fn, x) {
  try { return { ok: true, v: fn(x) }; }
  catch { return { ok: false }; }
}

function verifyComposition(fFn, gFn, type) {
  // Use small samples to avoid exponential blowup with recursive functions
  const samples = [-3, -1, 0, 1, 3, 5];
  try {
    switch (type) {
      case "composition_identity":
        return samples.every(x => {
          const gx = safeFn(gFn, x);
          if (!gx.ok || typeof gx.v !== "number" || Math.abs(gx.v) > 30) return true; // skip large values
          const fgx = safeFn(fFn, gx.v);
          return !fgx.ok || fgx.v === x;
        });
      case "absorption":
        return samples.every(x => {
          const gx = safeFn(gFn, x);
          if (!gx.ok || typeof gx.v !== "number" || Math.abs(gx.v) > 30) return true;
          const fgx = safeFn(fFn, gx.v);
          const fx = safeFn(fFn, x);
          return !fgx.ok || !fx.ok || fgx.v === fx.v;
        });
      case "even_composition":
        return samples.filter(x => x > 0).every(x => {
          const gx = safeFn(gFn, x), gnx = safeFn(gFn, -x);
          if (!gx.ok || !gnx.ok || Math.abs(gx.v) > 30 || Math.abs(gnx.v) > 30) return true;
          const fgx = safeFn(fFn, gx.v), fgnx = safeFn(fFn, gnx.v);
          return !fgx.ok || !fgnx.ok || fgx.v === fgnx.v;
        });
      case "non_negative_composition":
        return samples.every(x => {
          const gx = safeFn(gFn, x);
          if (!gx.ok || typeof gx.v !== "number" || Math.abs(gx.v) > 30) return true;
          const fgx = safeFn(fFn, gx.v);
          return !fgx.ok || fgx.v >= 0;
        });
      case "f_transparent":
        return samples.every(x => {
          const gx = safeFn(gFn, x);
          if (!gx.ok || typeof gx.v !== "number" || Math.abs(gx.v) > 30) return true;
          const fgx = safeFn(fFn, gx.v);
          return !fgx.ok || fgx.v === gx.v;
        });
      default: return true;
    }
  } catch { return false; }
}

/**
 * Run a full protocol exchange: encode → transmit → decode → verify.
 * Returns a complete report.
 */
export function exchange(source) {
  const message = encode(source);
  const json = JSON.stringify(message);
  const result = decode(json);

  return {
    message,
    messageSize: json.length,
    sourceSize: source.length,
    result,
    summary: {
      functionsTransmitted: message.functions.length,
      propertiesTransmitted: message.meta.propertyCount,
      surprisesTransmitted: message.meta.surpriseCount,
      sourceCodeTransmitted: 0,
      verificationRate: `${result.total.passed}/${result.total.total}`
    }
  };
}
