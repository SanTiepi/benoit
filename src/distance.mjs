// Benoît Semantic Distance
//
// Computes how different two functions are in behavior.
// Functions live in a metric space where distance measures
// behavioral divergence: identical functions → 0, completely
// different → 1.

import { transpile } from "./transpile.mjs";
import { infer } from "./infer.mjs";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Safely compile a Benoît source string into a callable JS function. */
function compile(src) {
  const name = src.trim().match(/^(?:async\s+)?(_?\w+)/)?.[1];
  if (!name) return null;
  try {
    const js = transpile(src).replace(/export /g, "");
    const mod = new Function(js + `\nreturn { ${name} }`)();
    const paramStr = src.match(/^(?:async\s+)?_?\w+\s+([\w,\s]+?)\s*->/)?.[1] || "";
    const arity = paramStr.split(/[\s,]+/).filter(Boolean).length;
    return { fn: mod[name], name, arity };
  } catch { return null; }
}

function safe(fn, ...args) {
  try { return { ok: true, value: fn(...args) }; }
  catch { return { ok: false }; }
}

/** Standard grid for unary functions. */
function unaryGrid() {
  const pts = [];
  for (let i = -100; i <= 100; i += 5) pts.push(i);
  return pts;
}

/** Standard grid for binary functions (pairs). */
function binaryGrid() {
  const vals = [-10, -5, -2, -1, 0, 1, 2, 5, 10];
  const pts = [];
  for (const a of vals) for (const b of vals) pts.push([a, b]);
  return pts;
}

// ---------------------------------------------------------------------------
// behaviorDistance — raw numerical distance on sampled outputs
// ---------------------------------------------------------------------------

/**
 * Compute the behavioral distance between two Benoît functions.
 *
 * Samples both functions on a standard grid and returns a normalised
 * distance in [0, 1].  Identical behavior → 0.
 *
 * @param {string} srcA - Benoît source for function A
 * @param {string} srcB - Benoît source for function B
 * @returns {number} distance in [0, 1]
 */
export function behaviorDistance(srcA, srcB) {
  const a = compile(srcA);
  const b = compile(srcB);
  if (!a || !b) return 1;

  const arity = Math.max(a.arity, b.arity);

  if (arity <= 1) {
    return _unaryDistance(a.fn, b.fn);
  }
  return _binaryDistance(a.fn, b.fn);
}

function _unaryDistance(fnA, fnB) {
  const grid = unaryGrid();
  let sumSqDiff = 0;
  let sumSqMag = 0;
  let count = 0;

  for (const x of grid) {
    const ra = safe(fnA, x);
    const rb = safe(fnB, x);
    if (!ra.ok || !rb.ok) continue;
    if (typeof ra.value !== "number" || typeof rb.value !== "number") continue;
    const diff = ra.value - rb.value;
    sumSqDiff += diff * diff;
    sumSqMag += ra.value * ra.value + rb.value * rb.value;
    count++;
  }

  if (count === 0) return 1;
  if (sumSqDiff === 0) return 0;
  if (sumSqMag === 0) return 0;

  // Normalise: sqrt(mean-squared-diff) / sqrt(mean-squared-magnitude)
  // Clamp to [0, 1].
  const dist = Math.sqrt(sumSqDiff / count) / Math.sqrt(sumSqMag / count);
  return Math.min(dist, 1);
}

function _binaryDistance(fnA, fnB) {
  const grid = binaryGrid();
  let sumSqDiff = 0;
  let sumSqMag = 0;
  let count = 0;

  for (const [x, y] of grid) {
    const ra = safe(fnA, x, y);
    const rb = safe(fnB, x, y);
    if (!ra.ok || !rb.ok) continue;
    if (typeof ra.value !== "number" || typeof rb.value !== "number") continue;
    const diff = ra.value - rb.value;
    sumSqDiff += diff * diff;
    sumSqMag += ra.value * ra.value + rb.value * rb.value;
    count++;
  }

  if (count === 0) return 1;
  if (sumSqDiff === 0) return 0;
  if (sumSqMag === 0) return 0;

  const dist = Math.sqrt(sumSqDiff / count) / Math.sqrt(sumSqMag / count);
  return Math.min(dist, 1);
}

// ---------------------------------------------------------------------------
// propertyDistance — Jaccard distance on inferred property sets
// ---------------------------------------------------------------------------

/**
 * Jaccard distance on the property-type sets of two functions.
 *
 * @param {string} srcA
 * @param {string} srcB
 * @returns {number} distance in [0, 1]
 */
export function propertyDistance(srcA, srcB) {
  let propsA, propsB;
  try { propsA = new Set(infer(srcA).properties.map(p => p.type)); }
  catch { propsA = new Set(); }
  try { propsB = new Set(infer(srcB).properties.map(p => p.type)); }
  catch { propsB = new Set(); }

  const union = new Set([...propsA, ...propsB]);
  if (union.size === 0) return 0; // both empty → same

  let intersection = 0;
  for (const p of propsA) if (propsB.has(p)) intersection++;

  return 1 - intersection / union.size;
}

// ---------------------------------------------------------------------------
// signatureDistance — arity + type similarity
// ---------------------------------------------------------------------------

/**
 * Distance based on function signature similarity (arity).
 *
 * @param {string} srcA
 * @param {string} srcB
 * @returns {number} 0 when same arity, scales up with difference
 */
export function signatureDistance(srcA, srcB) {
  const a = compile(srcA);
  const b = compile(srcB);
  if (!a || !b) return 1;

  // Simple arity distance normalised by max arity
  const maxArity = Math.max(a.arity, b.arity, 1);
  return Math.abs(a.arity - b.arity) / maxArity;
}

// ---------------------------------------------------------------------------
// distance — combined weighted metric
// ---------------------------------------------------------------------------

/**
 * Combined semantic distance between two Benoît functions.
 *
 * Weighted sum of:
 *   - 60% behavioral distance (sampled outputs)
 *   - 25% property distance   (Jaccard on property sets)
 *   - 15% signature distance  (arity similarity)
 *
 * @param {string} srcA
 * @param {string} srcB
 * @returns {number} distance in [0, 1]
 */
export function distance(srcA, srcB) {
  const bd = behaviorDistance(srcA, srcB);
  const pd = propertyDistance(srcA, srcB);
  const sd = signatureDistance(srcA, srcB);
  return 0.60 * bd + 0.25 * pd + 0.15 * sd;
}

// ---------------------------------------------------------------------------
// nearest — find the closest function in a candidate set
// ---------------------------------------------------------------------------

/**
 * Find the nearest function to `src` among `candidates`.
 *
 * @param {string} src - Reference function source
 * @param {string[]} candidates - Array of Benoît function sources
 * @returns {{ index: number, source: string, distance: number }}
 */
export function nearest(src, candidates) {
  let bestIdx = -1;
  let bestDist = Infinity;

  for (let i = 0; i < candidates.length; i++) {
    const d = distance(src, candidates[i]);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }

  return {
    index: bestIdx,
    source: candidates[bestIdx],
    distance: bestDist,
  };
}

// ---------------------------------------------------------------------------
// cluster — group functions by behavioral similarity
// ---------------------------------------------------------------------------

/**
 * Group an array of function sources into clusters of similar behavior.
 *
 * Uses single-linkage clustering: two functions are in the same cluster
 * when their combined distance is below `threshold`.
 *
 * @param {string[]} sources - Array of Benoît function sources
 * @param {number} [threshold=0.1] - Maximum distance within a cluster
 * @returns {string[][]} Array of clusters (each cluster is an array of sources)
 */
export function cluster(sources, threshold = 0.1) {
  // Union-Find
  const parent = sources.map((_, i) => i);

  function find(i) {
    while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; }
    return i;
  }
  function union(a, b) { parent[find(a)] = find(b); }

  // Compare every pair
  for (let i = 0; i < sources.length; i++) {
    for (let j = i + 1; j < sources.length; j++) {
      if (distance(sources[i], sources[j]) < threshold) {
        union(i, j);
      }
    }
  }

  // Collect clusters
  const groups = new Map();
  for (let i = 0; i < sources.length; i++) {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(sources[i]);
  }

  return [...groups.values()];
}
