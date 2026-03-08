// Benoît Function Archaeology
//
// Given a complex function, decompose it into simpler known primitives.
// Answers: "what is this function made of?"
//
// Examples:
//   f x -> (0 - x) * (0 - x)  =>  "square . negate"  or  "square (absorption)"
//   f x -> Math.abs(0 - x)     =>  "abs . negate = abs (absorption)"
//   f x -> (x * 2) / 2         =>  "halve . double = identity"
//   f x -> x + 0               =>  "identity (identity elimination)"

import { transpile } from "./transpile.mjs";
import { infer } from "./infer.mjs";

const SAMPLES = [-10, -3, -1, 0, 1, 3, 5, 10, 42];

function safe(fn, ...args) {
  try { return { ok: true, value: fn(...args) }; }
  catch { return { ok: false }; }
}

/**
 * Compile a Benoit source string into a callable function.
 * Returns { name, fn } or null on failure.
 */
function compile(src) {
  const name = extractName(src);
  if (!name) return null;
  try {
    const js = transpile(src).replace(/export /g, "");
    const mod = new Function(js + `\nreturn { ${name} }`)();
    return { name, fn: mod[name] };
  } catch {
    return null;
  }
}

function extractName(src) {
  const m = src.trim().match(/^(?:async\s+)?(_?\w+)/);
  return m ? m[1] : null;
}

/**
 * Sample a unary function on the standard probe points.
 * Returns an array of { x, y } for successful evaluations.
 */
function sample(fn) {
  const results = [];
  for (const x of SAMPLES) {
    const r = safe(fn, x);
    if (r.ok && typeof r.value === "number" && Number.isFinite(r.value)) {
      results.push({ x, y: r.value });
    }
  }
  return results;
}

/**
 * Check if two sampled behaviors are equivalent.
 */
function behaviorsMatch(a, b) {
  if (a.length === 0 || b.length === 0) return false;
  if (a.length !== b.length) return false;
  return a.every((s, i) => s.x === b[i].x && s.y === b[i].y);
}

/**
 * Decompose a target function into known primitives.
 *
 * @param {string} targetSrc - Benoit source code for the target function
 * @param {string[]} librarySources - Array of Benoit source strings for known primitives
 * @returns {{ decomposition: string, simplified: string, steps: string[] }}
 */
export function decompose(targetSrc, librarySources) {
  const target = compile(targetSrc);
  if (!target) {
    return { decomposition: "unknown", simplified: "unknown", steps: ["failed to compile target"] };
  }

  const targetBehavior = sample(target.fn);
  if (targetBehavior.length === 0) {
    return { decomposition: "unknown", simplified: "unknown", steps: ["target produced no valid samples"] };
  }

  // Build the library of compiled primitives
  const library = [];
  for (const src of librarySources) {
    const compiled = compile(src);
    if (compiled) {
      library.push({ ...compiled, src, behavior: sample(compiled.fn) });
    }
  }

  const steps = [];

  // Check if target behaves as identity
  const isIdentity = targetBehavior.every(s => s.y === s.x);

  // --- Step 1: Direct match against a single primitive (but not identity — we want richer decompositions) ---
  for (const prim of library) {
    if (behaviorsMatch(targetBehavior, prim.behavior) && prim.name !== "identity" && !isIdentity) {
      steps.push(`direct match: ${target.name} = ${prim.name}`);
      return {
        decomposition: prim.name,
        simplified: prim.name,
        steps
      };
    }
  }
  if (!isIdentity) {
    steps.push("no direct single-function match");
  }

  // --- Step 3: Try compositions f . g for all f, g in library ---
  const compositionResults = [];
  for (const f of library) {
    for (const g of library) {
      // Compose: (f . g)(x) = f(g(x))
      const composedBehavior = [];
      let allOk = true;
      for (const x of SAMPLES) {
        const gx = safe(g.fn, x);
        if (!gx.ok || typeof gx.value !== "number" || !Number.isFinite(gx.value)) {
          allOk = false;
          break;
        }
        const fgx = safe(f.fn, gx.value);
        if (!fgx.ok || typeof fgx.value !== "number" || !Number.isFinite(fgx.value)) {
          allOk = false;
          break;
        }
        composedBehavior.push({ x, y: fgx.value });
      }
      if (!allOk) continue;

      if (behaviorsMatch(targetBehavior, composedBehavior)) {
        const desc = `${f.name} \u2218 ${g.name}`;
        steps.push(`composition match: ${target.name} = ${desc}`);

        // Check if the composition simplifies further
        // - Does it equal just f? (g is absorbed)
        if (behaviorsMatch(targetBehavior, f.behavior)) {
          const simplified = `${f.name} (${g.name} absorbed)`;
          steps.push(`simplification: ${g.name} is absorbed by ${f.name}`);
          return { decomposition: desc, simplified, steps };
        }
        // - Does it equal just g? (f is absorbed)
        if (behaviorsMatch(targetBehavior, g.behavior)) {
          const simplified = `${g.name} (${f.name} absorbed)`;
          steps.push(`simplification: ${f.name} is absorbed by ${g.name}`);
          return { decomposition: desc, simplified, steps };
        }
        // - Does it equal identity?
        const composedIsId = composedBehavior.every(s => s.y === s.x);
        if (composedIsId) {
          steps.push(`simplification: ${desc} = identity`);
          return { decomposition: desc, simplified: "identity", steps };
        }

        // Check if it matches another single primitive
        for (const prim of library) {
          if (behaviorsMatch(composedBehavior, prim.behavior)) {
            steps.push(`simplification: ${desc} = ${prim.name}`);
            return { decomposition: desc, simplified: prim.name, steps };
          }
        }

        compositionResults.push({ decomposition: desc, simplified: desc, steps: [...steps] });
      }
    }
  }

  // --- Step 4: Try partial application with constants ---
  // For binary primitives: f(x, c) or f(c, x) for c in {0, 1, -1, 2}
  const constants = [0, 1, -1, 2];
  for (const prim of library) {
    // Check if the primitive might be binary by compiling with two args
    for (const c of constants) {
      // Try f(x, c)
      const rightPartialBehavior = [];
      let rightOk = true;
      for (const x of SAMPLES) {
        const r = safe(prim.fn, x, c);
        if (!r.ok || typeof r.value !== "number" || !Number.isFinite(r.value)) {
          rightOk = false;
          break;
        }
        rightPartialBehavior.push({ x, y: r.value });
      }
      if (rightOk && rightPartialBehavior.length === SAMPLES.length) {
        if (behaviorsMatch(targetBehavior, rightPartialBehavior)) {
          const desc = `${prim.name}(x, ${c})`;
          steps.push(`partial application match: ${target.name} = ${desc}`);
          // Check if this is identity
          const isId = rightPartialBehavior.every(s => s.y === s.x);
          if (isId) {
            steps.push(`simplification: ${desc} = identity (identity elimination)`);
            return { decomposition: desc, simplified: "identity", steps };
          }
          // Check if it matches a known primitive
          for (const other of library) {
            if (behaviorsMatch(rightPartialBehavior, other.behavior)) {
              steps.push(`simplification: ${desc} = ${other.name}`);
              return { decomposition: desc, simplified: other.name, steps };
            }
          }
          return { decomposition: desc, simplified: desc, steps };
        }
      }

      // Try f(c, x)
      const leftPartialBehavior = [];
      let leftOk = true;
      for (const x of SAMPLES) {
        const r = safe(prim.fn, c, x);
        if (!r.ok || typeof r.value !== "number" || !Number.isFinite(r.value)) {
          leftOk = false;
          break;
        }
        leftPartialBehavior.push({ x, y: r.value });
      }
      if (leftOk && leftPartialBehavior.length === SAMPLES.length) {
        if (behaviorsMatch(targetBehavior, leftPartialBehavior)) {
          const desc = `${prim.name}(${c}, x)`;
          steps.push(`partial application match: ${target.name} = ${desc}`);
          const isId = leftPartialBehavior.every(s => s.y === s.x);
          if (isId) {
            steps.push(`simplification: ${desc} = identity (identity elimination)`);
            return { decomposition: desc, simplified: "identity", steps };
          }
          for (const other of library) {
            if (behaviorsMatch(leftPartialBehavior, other.behavior)) {
              steps.push(`simplification: ${desc} = ${other.name}`);
              return { decomposition: desc, simplified: other.name, steps };
            }
          }
          return { decomposition: desc, simplified: desc, steps };
        }
      }
    }
  }

  // Return best composition if we found one
  if (compositionResults.length > 0) {
    // Pick the shortest decomposition
    compositionResults.sort((a, b) => a.decomposition.length - b.decomposition.length);
    return compositionResults[0];
  }

  // If it's identity but no composition path was found, still report it
  if (isIdentity) {
    steps.push(`${target.name} is the identity function`);
    return { decomposition: "identity", simplified: "identity", steps };
  }

  // Direct match to a non-identity primitive (checked after compositions for richer results)
  for (const prim of library) {
    if (behaviorsMatch(targetBehavior, prim.behavior)) {
      steps.push(`direct match: ${target.name} = ${prim.name}`);
      return { decomposition: prim.name, simplified: prim.name, steps };
    }
  }

  steps.push("no decomposition found");
  return { decomposition: "unknown", simplified: "unknown", steps };
}
