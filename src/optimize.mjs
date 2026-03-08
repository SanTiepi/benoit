// Benoît Self-Optimizer
//
// Uses automatically discovered properties to optimize code.
// This is the first language that optimizes based on its own algebraic discoveries.
//
// Optimizations:
//   - Identity elimination: f(x, 0) → x when 0 is identity for f
//   - Absorption: f(g(x)) → f(x) when f absorbs g
//   - Involution collapse: f(f(x)) → x when f is involution
//   - Idempotent collapse: f(f(x)) → f(x) when f is idempotent
//   - Composition identity: f(g(x)) → x when f and g are inverses
//   - Constant folding: f(3, 5) → 8 when all args are literals

import { infer } from "./infer.mjs";
import { transpile } from "./transpile.mjs";

// Helper: build regex that matches f(inner) with proper paren escaping
function callPattern(name, innerPattern) {
  return new RegExp(name + "\\(" + innerPattern + "\\)", "g");
}

// Match f(g(inner))
function nestedCallPattern(outer, inner, captureInner) {
  return new RegExp(outer + "\\(" + inner + "\\(" + captureInner + "\\)\\)", "g");
}

/**
 * Optimize a Benoît source by using discovered properties.
 *
 * @param {string} source - Benoît source code
 * @returns {object} - { optimized, report }
 */
export function optimize(source) {
  // Step 1: Extract function definitions and infer properties
  const functions = extractFunctions(source);
  const propMap = {};

  for (const fn of functions) {
    try {
      const result = infer(fn.source);
      propMap[result.name] = {
        properties: result.properties.map(p => p.type),
        arity: result.arity,
        fn: compileFn(fn.source, result.name)
      };
    } catch { /* skip */ }
  }

  // Step 2: Apply optimizations to the rest of the source
  let optimized = source;
  const report = [];

  // Absorbing element FIRST (takes priority over identity): f(x, 0) → 0
  for (const [name, info] of Object.entries(propMap)) {
    if (info.properties.includes("absorbing_element")) {
      const patternR = callPattern(name, "[^,]+,\\s*0");
      optimized = optimized.replace(patternR, (match) => {
        if (isInsideDefinition(optimized, match)) return match;
        report.push({ type: "absorbing_element", from: match, to: "0", rule: name + "(x, 0) == 0" });
        return "0";
      });
      const patternL = callPattern(name, "0,\\s*[^)]+");
      optimized = optimized.replace(patternL, (match) => {
        if (isInsideDefinition(optimized, match)) return match;
        report.push({ type: "absorbing_element", from: match, to: "0", rule: name + "(0, x) == 0" });
        return "0";
      });
    }
  }

  // Identity elimination: probe to find the actual identity value
  for (const [name, info] of Object.entries(propMap)) {
    if (info.arity !== 2 || !info.fn) continue;

    for (const e of [0, 1]) {
      let isRightId = false, isLeftId = false;
      try {
        isRightId = [3, -5, 42].every(x => info.fn(x, e) === x);
        isLeftId = [3, -5, 42].every(x => info.fn(e, x) === x);
      } catch { continue; }

      if (isRightId) {
        const pattern = callPattern(name, "([^,]+),\\s*" + e);
        optimized = optimized.replace(pattern, (match, expr) => {
          if (isInsideDefinition(optimized, match)) return match;
          report.push({ type: "identity_elimination", from: match, to: expr.trim(), rule: name + "(x, " + e + ") == x" });
          return expr.trim();
        });
      }
      if (isLeftId) {
        const pattern = callPattern(name, e + ",\\s*([^)]+)");
        optimized = optimized.replace(pattern, (match, expr) => {
          if (isInsideDefinition(optimized, match)) return match;
          report.push({ type: "identity_elimination", from: match, to: expr.trim(), rule: name + "(" + e + ", x) == x" });
          return expr.trim();
        });
      }
    }
  }

  // Unary function optimizations (involution, idempotent, absorption)
  for (const [name, info] of Object.entries(propMap)) {
    // Involution: f(f(x)) → x
    if (info.properties.includes("involution")) {
      const pattern = nestedCallPattern(name, name, "([^)]+)");
      optimized = optimized.replace(pattern, (match, inner) => {
        report.push({ type: "involution_collapse", from: match, to: inner, rule: name + "(" + name + "(x)) == x" });
        return inner;
      });
    }

    // Idempotent: f(f(x)) → f(x)
    if (info.properties.includes("idempotent") && !info.properties.includes("identity")) {
      const pattern = nestedCallPattern(name, name, "([^)]+)");
      optimized = optimized.replace(pattern, (match, inner) => {
        const simplified = name + "(" + inner + ")";
        report.push({ type: "idempotent_collapse", from: match, to: simplified, rule: name + "(" + name + "(x)) == " + name + "(x)" });
        return simplified;
      });
    }

    // Even function absorption: f(g(x)) → f(x) when f is even and g is odd/involution
    if (info.properties.includes("even_function")) {
      for (const [otherName, otherInfo] of Object.entries(propMap)) {
        if (otherInfo.properties.includes("involution") || otherInfo.properties.includes("odd_function")) {
          const pattern = nestedCallPattern(name, otherName, "([^)]+)");
          optimized = optimized.replace(pattern, (match, inner) => {
            const simplified = name + "(" + inner + ")";
            report.push({
              type: "absorption",
              from: match, to: simplified,
              rule: name + "(" + otherName + "(x)) == " + name + "(x) [" + name + " is even, " + otherName + " is odd/involution]"
            });
            return simplified;
          });
        }
      }
    }
  }

  // Inverse composition: f(g(x)) → x when f and g are inverses
  for (const [nameF, infoF] of Object.entries(propMap)) {
    for (const [nameG, infoG] of Object.entries(propMap)) {
      if (nameF === nameG) continue;
      if (infoF.arity !== 1 || infoG.arity !== 1) continue;
      if (!infoF.fn || !infoG.fn) continue;

      const samples = [-5, -1, 0, 1, 3, 10];
      const isInverse = samples.every(x => {
        try { return infoF.fn(infoG.fn(x)) === x; } catch { return false; }
      });

      if (isInverse) {
        const pattern = nestedCallPattern(nameF, nameG, "([^)]+)");
        optimized = optimized.replace(pattern, (match, inner) => {
          report.push({
            type: "inverse_elimination",
            from: match, to: inner,
            rule: nameF + "(" + nameG + "(x)) == x [inverses]"
          });
          return inner;
        });
      }
    }
  }

  // Constant folding: f(literal, literal) → result
  for (const [name, info] of Object.entries(propMap)) {
    if (!info.fn) continue;
    if (info.arity === 1) {
      const pattern = callPattern(name, "(-?\\d+(?:\\.\\d+)?)");
      optimized = optimized.replace(pattern, (match, arg) => {
        if (isInsideDefinition(optimized, match)) return match;
        try {
          const result = info.fn(Number(arg));
          if (typeof result === "number" && isFinite(result)) {
            report.push({ type: "constant_fold", from: match, to: "" + result });
            return "" + result;
          }
        } catch {}
        return match;
      });
    } else if (info.arity === 2) {
      const pattern = callPattern(name, "(-?\\d+(?:\\.\\d+)?),\\s*(-?\\d+(?:\\.\\d+)?)");
      optimized = optimized.replace(pattern, (match, a, b) => {
        if (isInsideDefinition(optimized, match)) return match;
        try {
          const result = info.fn(Number(a), Number(b));
          if (typeof result === "number" && isFinite(result)) {
            report.push({ type: "constant_fold", from: match, to: "" + result });
            return "" + result;
          }
        } catch {}
        return match;
      });
    }
  }

  return {
    original: source,
    optimized,
    report,
    stats: {
      optimizations: report.length,
      byType: report.reduce((acc, r) => {
        acc[r.type] = (acc[r.type] || 0) + 1;
        return acc;
      }, {})
    }
  };
}

function extractFunctions(source) {
  const fns = [];
  const blocks = source.split("\n\n");
  for (const block of blocks) {
    const firstLine = block.split("\n")[0].trim();
    if (firstLine.match(/^(_?\w+)\s+.*->/)) {
      const name = firstLine.match(/^(_?\w+)/)[1];
      const defLines = block.split("\n").filter(l => !l.match(/^\w+\(.*\)\s*==/));
      fns.push({ name, source: defLines[0] });
    }
  }
  return fns;
}

function compileFn(src, name) {
  try {
    const js = transpile(src).replace(/export /g, "");
    return new Function(js + "\nreturn " + name)();
  } catch { return null; }
}

function isInsideDefinition(source, match) {
  const idx = source.indexOf(match);
  if (idx === -1) return false;
  const lineStart = source.lastIndexOf("\n", idx) + 1;
  const lineEnd = source.indexOf("\n", idx);
  const line = source.substring(lineStart, lineEnd === -1 ? source.length : lineEnd);
  return line.includes("->");
}
