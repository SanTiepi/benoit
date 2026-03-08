// Benoît Function Algebra Engine
// Discovers relationships BETWEEN functions:
//   - Equivalence: do two functions produce the same outputs?
//   - Inverse: does f(g(x)) == x?
//   - Absorption: does f(g(x)) == f(x)?
//   - Composition properties: predict properties of f∘g from f and g
//   - Equivalence classes: group functions by behavior
//
// This is genuinely new territory for a programming language.

import { transpile } from "./transpile.mjs";
import { infer } from "./infer.mjs";

/**
 * Compile multiple Benoît functions into callable form.
 */
function compile(sources) {
  const fns = {};
  for (const src of sources) {
    const name = src.trim().match(/^(?:async\s+)?(_?\w+)/)?.[1];
    if (!name) continue;
    try {
      const js = transpile(src).replace(/export /g, "");
      const mod = new Function(js + `\nreturn { ${name} }`)();
      const arity = (src.match(/^(?:async\s+)?_?\w+\s+([\w,=\s]+?)\s+->/)?.[1] || "")
        .split(/[\s,]+/).filter(Boolean).length;
      fns[name] = { fn: mod[name], arity, src };
    } catch { /* skip unparseable */ }
  }
  return fns;
}

const SAMPLES_1 = [-10, -3, -2, -1, 0, 1, 2, 3, 5, 10, 42, 100];
const SAMPLES_2_PAIRS = SAMPLES_1.slice(0, 8).flatMap(a => SAMPLES_1.slice(0, 8).map(b => [a, b]));

function safe(fn, ...args) {
  try { return { ok: true, value: fn(...args) }; }
  catch { return { ok: false }; }
}

/**
 * Build a behavioral fingerprint: map inputs → outputs.
 */
function behaviorHash(fn, arity) {
  if (arity === 1) {
    return SAMPLES_1.map(x => {
      const r = safe(fn, x);
      return r.ok ? `${x}→${r.value}` : null;
    }).filter(Boolean).join("|");
  }
  if (arity === 2) {
    return SAMPLES_2_PAIRS.map(([a, b]) => {
      const r = safe(fn, a, b);
      return r.ok ? `${a},${b}→${r.value}` : null;
    }).filter(Boolean).join("|");
  }
  return "";
}

// ─── EQUIVALENCE ──────────────────────────────────────────────────

/**
 * Check if two functions are behaviorally equivalent.
 */
export function equivalent(srcA, srcB) {
  const fns = compile([srcA, srcB]);
  const entries = Object.entries(fns);
  if (entries.length < 2) return { equivalent: false, reason: "compile_failed" };

  const [nameA, a] = entries[0];
  const [nameB, b] = entries[1];

  if (a.arity !== b.arity) {
    return { equivalent: false, reason: "arity_mismatch", arityA: a.arity, arityB: b.arity };
  }

  const hashA = behaviorHash(a.fn, a.arity);
  const hashB = behaviorHash(b.fn, b.arity);

  const mismatches = [];
  if (a.arity === 1) {
    for (const x of SAMPLES_1) {
      const ra = safe(a.fn, x), rb = safe(b.fn, x);
      if (ra.ok && rb.ok && ra.value !== rb.value) {
        mismatches.push({ input: [x], outputA: ra.value, outputB: rb.value });
      }
    }
  } else if (a.arity === 2) {
    for (const [x, y] of SAMPLES_2_PAIRS) {
      const ra = safe(a.fn, x, y), rb = safe(b.fn, x, y);
      if (ra.ok && rb.ok && ra.value !== rb.value) {
        mismatches.push({ input: [x, y], outputA: ra.value, outputB: rb.value });
        if (mismatches.length >= 5) break;
      }
    }
  }

  return {
    equivalent: hashA === hashB && mismatches.length === 0,
    nameA, nameB,
    arity: a.arity,
    samplesChecked: a.arity === 1 ? SAMPLES_1.length : SAMPLES_2_PAIRS.length,
    mismatches
  };
}

// ─── INVERSE ──────────────────────────────────────────────────────

/**
 * Check if g is the inverse of f: f(g(x)) == x for all x.
 */
export function inverse(srcF, srcG) {
  const fns = compile([srcF, srcG]);
  const entries = Object.entries(fns);
  if (entries.length < 2) return { inverse: false, reason: "compile_failed" };

  const [nameF, f] = entries[0];
  const [nameG, g] = entries[1];

  if (f.arity !== 1 || g.arity !== 1) {
    return { inverse: false, reason: "requires_unary" };
  }

  let fOfG = 0, gOfF = 0, total = 0;
  const evidence = [];

  for (const x of SAMPLES_1) {
    total++;
    const gx = safe(g.fn, x);
    const fx = safe(f.fn, x);

    if (gx.ok) {
      const fgx = safe(f.fn, gx.value);
      if (fgx.ok && fgx.value === x) {
        fOfG++;
        evidence.push(`${nameF}(${nameG}(${x})) == ${x}`);
      }
    }
    if (fx.ok) {
      const gfx = safe(g.fn, fx.value);
      if (gfx.ok && gfx.value === x) gOfF++;
    }
  }

  return {
    inverse: fOfG === total && gOfF === total,
    leftInverse: fOfG === total,   // f(g(x)) == x
    rightInverse: gOfF === total,  // g(f(x)) == x
    nameF, nameG,
    checked: total,
    evidence: evidence.slice(0, 5)
  };
}

// ─── COMPOSITION PROPERTIES ───────────────────────────────────────

/**
 * Discover properties of f∘g (composition) and compare with
 * properties of f and g individually.
 */
export function composeAnalysis(srcF, srcG) {
  const fns = compile([srcF, srcG]);
  const entries = Object.entries(fns);
  if (entries.length < 2) return { error: "compile_failed" };

  const [nameF, f] = entries[0];
  const [nameG, g] = entries[1];

  // Individual properties
  const propsF = infer(srcF);
  const propsG = infer(srcG);

  // Compose: (f∘g)(x) = f(g(x))
  const composed = (x) => {
    const gx = g.fn(x);
    return f.fn(gx);
  };
  const composedName = `${nameF}∘${nameG}`;

  // Probe composition
  const results = SAMPLES_1.map(x => {
    const r = safe(composed, x);
    return { x, r };
  }).filter(s => s.r.ok);

  const composedProps = [];

  // Check if composition is identity (inverse relationship)
  const isIdentity = results.every(s => s.r.value === s.x);
  if (isIdentity) {
    composedProps.push({
      type: "composition_identity",
      description: `${composedName} is the identity — ${nameF} and ${nameG} are inverses`,
      evidence: results.slice(0, 3).map(s => `${nameF}(${nameG}(${s.x})) == ${s.x}`)
    });
  }

  // Check if composition is idempotent-like: f(g(x)) == f(x) (absorption)
  if (f.arity === 1) {
    const absorbs = results.every(s => {
      const fx = safe(f.fn, s.x);
      return fx.ok && fx.value === s.r.value;
    });
    if (absorbs && !isIdentity) {
      composedProps.push({
        type: "absorption",
        description: `${nameF}(${nameG}(x)) == ${nameF}(x) — ${nameG} is absorbed by ${nameF}`,
        evidence: results.slice(0, 3).map(s => `${nameF}(${nameG}(${s.x})) == ${nameF}(${s.x})`)
      });
    }
  }

  // Check if composition equals g (f is identity-like for g's range)
  const isG = results.every(s => {
    const gx = safe(g.fn, s.x);
    return gx.ok && gx.value === s.r.value;
  });
  if (isG && !isIdentity) {
    composedProps.push({
      type: "f_transparent",
      description: `${nameF} is transparent over ${nameG}'s range: ${composedName}(x) == ${nameG}(x)`,
      evidence: results.slice(0, 3).map(s => `${nameF}(${nameG}(${s.x})) == ${nameG}(${s.x})`)
    });
  }

  // Even/odd preservation
  const composedEven = results.every(s => {
    const neg = safe(composed, -s.x);
    return neg.ok && neg.value === s.r.value;
  });
  if (composedEven && results.some(s => s.x !== 0)) {
    composedProps.push({
      type: "even_composition",
      description: `${composedName} is even`,
      predicted: propsG.properties.some(p => p.type === "even_function")
        ? `Predicted: ${nameG} is even → ${composedName} is even`
        : propsG.properties.some(p => p.type === "odd_function") && propsF.properties.some(p => p.type === "even_function")
          ? `Predicted: ${nameF} even + ${nameG} odd → ${composedName} even`
          : "Emergent (not predicted from individual properties)"
    });
  }

  // Non-negative preservation
  const composedNonNeg = results.every(s => s.r.value >= 0);
  if (composedNonNeg && results.some(s => s.x < 0)) {
    composedProps.push({
      type: "non_negative_composition",
      description: `${composedName} is non-negative`,
      predicted: propsF.properties.some(p => p.type === "non_negative")
        ? `Predicted: ${nameF} is non-negative → ${composedName} is non-negative`
        : "Emergent"
    });
  }

  return {
    nameF, nameG,
    composedName,
    propsF: propsF.properties.map(p => p.type),
    propsG: propsG.properties.map(p => p.type),
    composedProps,
    predictions: composedProps.filter(p => p.predicted && !p.predicted.startsWith("Emergent")).length,
    emergent: composedProps.filter(p => p.predicted && p.predicted.startsWith("Emergent")).length
  };
}

// ─── EQUIVALENCE CLASSES ──────────────────────────────────────────

/**
 * Given multiple function sources, group them into equivalence classes
 * based on behavioral equality.
 */
export function equivalenceClasses(sources) {
  const fns = compile(sources);
  const entries = Object.entries(fns);
  const classes = [];
  const assigned = new Set();

  for (let i = 0; i < entries.length; i++) {
    const [nameA, a] = entries[i];
    if (assigned.has(nameA)) continue;

    const classMembers = [nameA];
    const hashA = behaviorHash(a.fn, a.arity);
    assigned.add(nameA);

    for (let j = i + 1; j < entries.length; j++) {
      const [nameB, b] = entries[j];
      if (assigned.has(nameB)) continue;
      if (a.arity !== b.arity) continue;

      const hashB = behaviorHash(b.fn, b.arity);
      if (hashA === hashB) {
        classMembers.push(nameB);
        assigned.add(nameB);
      }
    }

    classes.push({
      members: classMembers,
      arity: a.arity,
      representative: nameA,
      size: classMembers.length
    });
  }

  return {
    classes,
    totalFunctions: entries.length,
    uniqueBehaviors: classes.length,
    redundant: entries.length - classes.length
  };
}

// ─── FULL ALGEBRA REPORT ──────────────────────────────────────────

/**
 * Run full algebraic analysis on a set of Benoît function sources.
 * Discovers: equivalences, inverses, compositions, absorption.
 */
export function algebraReport(sources) {
  const fns = compile(sources);
  const entries = Object.entries(fns);
  const unary = entries.filter(([, v]) => v.arity === 1);

  const report = {
    functions: entries.map(([name, v]) => ({ name, arity: v.arity })),
    equivalenceClasses: equivalenceClasses(sources),
    inverses: [],
    compositions: []
  };

  // Check all unary pairs for inverse relationships
  for (let i = 0; i < unary.length; i++) {
    for (let j = i; j < unary.length; j++) {
      const [nameF, f] = unary[i];
      const [nameG, g] = unary[j];

      const inv = inverse(f.src, g.src);
      if (inv.inverse || inv.leftInverse || inv.rightInverse) {
        report.inverses.push({
          f: nameF, g: nameG,
          fullInverse: inv.inverse,
          leftInverse: inv.leftInverse,
          rightInverse: inv.rightInverse
        });
      }
    }
  }

  // Analyze interesting compositions
  for (let i = 0; i < unary.length; i++) {
    for (let j = 0; j < unary.length; j++) {
      if (i === j) continue;
      const [, f] = unary[i];
      const [, g] = unary[j];

      const comp = composeAnalysis(f.src, g.src);
      if (comp.composedProps && comp.composedProps.length > 0) {
        report.compositions.push(comp);
      }
    }
  }

  return report;
}
