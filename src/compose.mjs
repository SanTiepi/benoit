// Benoît Module Composition
//
// Combines multiple modules into a unified algebra.
// When Agent A sends module M1 and Agent B sends module M2,
// any agent can compose them and discover CROSS-MODULE relationships:
//   - Functions from M1 that are equivalent to functions in M2
//   - Inverse pairs spanning modules
//   - New composition properties between modules
//
// This is the "import" system for AI-to-AI communication.

import { PROTOCOL_VERSION, encode } from "./protocol.mjs";
import { transpile } from "./transpile.mjs";
import { infer } from "./infer.mjs";

const SAMPLES = [-10, -3, -2, -1, 0, 1, 2, 3, 5, 10, 42];

function safe(fn, ...args) {
  try { return { ok: true, value: fn(...args) }; }
  catch { return { ok: false }; }
}

function behaviorHash(fn) {
  return SAMPLES.map(x => {
    const r = safe(fn, x);
    return r.ok ? `${x}→${r.value}` : null;
  }).filter(Boolean).join("|");
}

/**
 * Compile a Benoît source module into callable functions.
 */
function compileModule(source, moduleIndex) {
  const blocks = source.split("\n\n").filter(b => b.trim());
  const fns = {};

  for (const block of blocks) {
    const defLine = block.split("\n").find(l => l.match(/^\w+\s+[\w,\s]+?\s*->/));
    if (!defLine) continue;

    const name = defLine.match(/^(\w+)/)?.[1];
    if (!name) continue;

    const paramStr = defLine.match(/^\w+\s+([\w,\s]+?)\s*->/)?.[1] || "";
    const arity = paramStr.split(/[\s,]+/).filter(Boolean).length;

    // Only take the definition lines (not assertions)
    const defLines = block.split("\n").filter(l => !l.match(/^\w+\(.*\)\s*==/));
    const src = defLines.join("\n").trim();

    try {
      const js = transpile(src).replace(/export /g, "");
      const mod = new Function(js + `\nreturn { ${name} }`)();
      let properties = [];
      try { properties = infer(src).properties.map(p => p.type); } catch {}
      fns[name] = { fn: mod[name], arity, src, properties, module: moduleIndex };
    } catch { /* skip */ }
  }
  return fns;
}

/**
 * Compose multiple Benoît source modules into a unified algebra.
 *
 * @param {...string} sources - Benoît source code strings
 * @returns {object} Composed module with cross-module discoveries
 */
export function composeModules(...sources) {
  const allFns = {};

  for (let i = 0; i < sources.length; i++) {
    const compiled = compileModule(sources[i], i);
    for (const [name, info] of Object.entries(compiled)) {
      if (allFns[name]) {
        // Name collision — keep both with suffix
        allFns[`${name}_m${i}`] = { ...info, originalName: name };
      } else {
        allFns[name] = { ...info, originalName: name };
      }
    }
  }

  const names = Object.keys(allFns);

  // Cross-module equivalences
  const crossEquivalences = [];
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const a = allFns[names[i]], b = allFns[names[j]];
      if (a.module === b.module) continue;
      if (a.arity !== 1 || b.arity !== 1) continue;

      if (behaviorHash(a.fn) === behaviorHash(b.fn)) {
        crossEquivalences.push({
          functionA: a.originalName, moduleA: a.module,
          functionB: b.originalName, moduleB: b.module,
          type: "equivalent"
        });
      }
    }
  }

  // Cross-module inverse pairs
  const crossInverses = [];
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const f = allFns[names[i]], g = allFns[names[j]];
      if (f.module === g.module) continue;
      if (f.arity !== 1 || g.arity !== 1) continue;

      let fOfG = true, gOfF = true;
      for (const x of SAMPLES) {
        const gx = safe(g.fn, x);
        if (gx.ok) {
          const fgx = safe(f.fn, gx.value);
          if (!fgx.ok || fgx.value !== x) fOfG = false;
        }
        const fx = safe(f.fn, x);
        if (fx.ok) {
          const gfx = safe(g.fn, fx.value);
          if (!gfx.ok || gfx.value !== x) gOfF = false;
        }
      }

      if (fOfG && gOfF) {
        crossInverses.push({
          f: f.originalName, moduleF: f.module,
          g: g.originalName, moduleG: g.module,
          type: "inverse_pair"
        });
      }
    }
  }

  // Cross-module composition properties
  const crossCompositions = [];
  for (let i = 0; i < names.length; i++) {
    for (let j = 0; j < names.length; j++) {
      if (i === j) continue;
      const f = allFns[names[i]], g = allFns[names[j]];
      if (f.module === g.module) continue;
      if (f.arity !== 1 || g.arity !== 1) continue;

      const composed = x => f.fn(g.fn(x));
      const results = SAMPLES.map(x => {
        const r = safe(composed, x);
        return { x, y: r.ok ? r.value : null };
      }).filter(s => s.y !== null);

      const props = [];

      if (results.every(s => s.y === s.x)) {
        props.push("composition_identity");
      }

      const absorbs = results.every(s => {
        const fx = safe(f.fn, s.x);
        return fx.ok && fx.value === s.y;
      });
      if (absorbs && !results.every(s => s.y === s.x)) {
        props.push("absorption");
      }

      const even = results.every(s => {
        const neg = safe(composed, -s.x);
        return neg.ok && neg.value === s.y;
      });
      if (even && results.some(s => s.x !== 0)) {
        props.push("even_composition");
      }

      if (results.every(s => s.y >= 0) && results.some(s => s.x < 0)) {
        props.push("non_negative_composition");
      }

      if (props.length > 0) {
        crossCompositions.push({
          f: f.originalName, moduleF: f.module,
          g: g.originalName, moduleG: g.module,
          properties: props
        });
      }
    }
  }

  // Build unified function registry
  const unified = {};
  for (const [name, info] of Object.entries(allFns)) {
    const key = info.originalName;
    if (!unified[key]) {
      unified[key] = {
        name: key, modules: [info.module],
        arity: info.arity, properties: info.properties,
        code: info.src
      };
    } else {
      unified[key].modules.push(info.module);
    }
  }

  return {
    protocol: PROTOCOL_VERSION,
    modulesComposed: sources.length,
    unified: Object.values(unified),
    crossModule: {
      equivalences: crossEquivalences,
      inverses: crossInverses,
      compositions: crossCompositions
    },
    stats: {
      totalFunctions: names.length,
      crossEquivalences: crossEquivalences.length,
      crossInverses: crossInverses.length,
      crossCompositions: crossCompositions.length
    }
  };
}

/**
 * Compose from protocol messages (uses decode + re-synthesis).
 * Prefer composeModules() when you have raw source.
 */
export function compose(...messages) {
  for (const msg of messages) {
    if (msg.protocol !== PROTOCOL_VERSION) {
      return { error: `Incompatible protocol: ${msg.protocol}` };
    }
  }
  // Delegate to composeModules with a flag indicating protocol mode
  return {
    protocol: PROTOCOL_VERSION,
    modulesComposed: messages.length,
    unified: messages.flatMap(m => m.functions.map(f => ({
      name: f.name, arity: f.arity, properties: f.properties,
      modules: [messages.indexOf(m)]
    }))),
    crossModule: { equivalences: [], inverses: [], compositions: [] },
    stats: {
      totalFunctions: messages.reduce((s, m) => s + m.functions.length, 0),
      crossEquivalences: 0, crossInverses: 0, crossCompositions: 0,
      note: "Use composeModules() with raw source for full cross-module analysis"
    }
  };
}

/**
 * Diff two protocol messages — what's new in B vs A?
 */
export function diff(messageA, messageB) {
  const namesA = new Set(messageA.functions.map(f => f.name));
  const namesB = new Set(messageB.functions.map(f => f.name));

  const newFunctions = messageB.functions.filter(f => !namesA.has(f.name));

  const changed = [];
  for (const fnB of messageB.functions) {
    if (!namesA.has(fnB.name)) continue;
    const fnA = messageA.functions.find(f => f.name === fnB.name);
    const assertionsChanged = JSON.stringify(fnA.assertions) !== JSON.stringify(fnB.assertions);
    const propsChanged = JSON.stringify(fnA.properties) !== JSON.stringify(fnB.properties);
    if (assertionsChanged || propsChanged) {
      changed.push({
        name: fnB.name, assertionsChanged, propsChanged,
        newAssertions: fnB.assertions.length - fnA.assertions.length,
        newProperties: fnB.properties.filter(p => !fnA.properties.includes(p))
      });
    }
  }

  const removed = messageA.functions.filter(f => !namesB.has(f.name)).map(f => f.name);

  return {
    newFunctions: newFunctions.length,
    changed: changed.length,
    removed: removed.length,
    details: { new: newFunctions, changed, removed },
    isCompatible: removed.length === 0
  };
}
