// Benoît Protocol v2
//
// .ben IS the protocol. No encoding, no JSON, no intermediate format.
// The source code is simultaneously:
//   - executable code
//   - test suite (provable assertions)
//   - wire format (transmittable)
//   - documentation (readable)
//
// Sender sends .ben text. Receiver transpiles + verifies. Done.

import { transpile, extractTests } from "./transpile.mjs";
import { infer } from "./infer.mjs";

export const PROTOCOL_VERSION = "benoit-protocol-v2";

/**
 * Send: wrap .ben source as a protocol message.
 * The message IS the source — zero transformation.
 *
 * @param {string} source - Benoît source code
 * @param {{ sender?: string, timestamp?: number }} meta
 * @returns {{ protocol: string, payload: string, meta: object }}
 */
export function send(source, meta = {}) {
  return {
    protocol: PROTOCOL_VERSION,
    payload: source,
    meta: {
      sender: meta.sender || "anonymous",
      timestamp: meta.timestamp || Date.now(),
      size: source.length,
    },
  };
}

/**
 * Receive: process a .ben protocol message.
 * Transpile, extract assertions, verify them, infer properties.
 *
 * @param {object|string} message - Protocol message or raw .ben source
 * @returns {{ ok: boolean, js: string, functions: object[], assertions: object, properties: object, errors: string[] }}
 */
export function receive(message) {
  const source = typeof message === "string"
    ? message
    : message?.payload;

  if (!source || typeof source !== "string") {
    return { ok: false, js: null, functions: [], assertions: { passed: 0, total: 0, results: [] }, properties: {}, errors: ["empty or invalid message"] };
  }

  const errors = [];

  // Step 1: Transpile .ben -> JS
  let js;
  try {
    js = transpile(source);
  } catch (e) {
    return { ok: false, js: null, functions: [], assertions: { passed: 0, total: 0, results: [] }, properties: {}, errors: [`transpile failed: ${e.message}`] };
  }

  // Step 2: Extract assertions
  const { assertions } = extractTests(source);

  // Step 3: Execute and verify assertions
  const results = [];
  let mod;
  try {
    // Build a module from the transpiled code
    const cleanJs = js.replace(/^export /gm, "");
    const fnNames = [...cleanJs.matchAll(/function\s+(\w+)/g)].map(m => m[1]);
    const returnObj = fnNames.length > 0 ? `return { ${fnNames.join(", ")} };` : "";
    mod = new Function(cleanJs + "\n" + returnObj)();
  } catch (e) {
    errors.push(`execution failed: ${e.message}`);
    mod = {};
  }

  let passed = 0;
  for (const a of assertions) {
    try {
      const allFns = mod || {};
      const fnEntries = Object.entries(allFns);
      const fnNames = fnEntries.map(([k]) => k);
      const fnValues = fnEntries.map(([, v]) => v);
      const actual = new Function(...fnNames, `return ${a.expr}`)(...fnValues);
      const expected = new Function(...fnNames, `return ${a.expected}`)(...fnValues);
      const ok = a.negate
        ? JSON.stringify(actual) !== JSON.stringify(expected)
        : JSON.stringify(actual) === JSON.stringify(expected);
      results.push({ line: a.line, expr: a.expr, expected: a.expected, actual, ok });
      if (ok) passed++;
      else errors.push(`assertion L${a.line}: ${a.expr} → ${JSON.stringify(actual)}, expected ${a.expected}`);
    } catch (e) {
      results.push({ line: a.line, expr: a.expr, expected: a.expected, actual: null, ok: false, error: e.message });
      errors.push(`assertion L${a.line} error: ${e.message}`);
    }
  }

  // Step 4: Infer properties for each function
  const properties = {};
  const lines = source.split("\n");
  const fnDefs = lines.filter(l => l.includes("->") && !l.trim().startsWith("--"));
  for (const def of fnDefs) {
    try {
      const result = infer(def);
      if (result?.name && result?.properties?.length > 0) {
        properties[result.name] = result.properties.map(p => p.type);
      }
    } catch { /* receiver infers what it can */ }
  }

  // Step 5: Extract function signatures
  const functions = [];
  for (const def of fnDefs) {
    const m = def.trim().match(/^(_?\w+)\s+([\w,=\s]+?)\s+->/);
    const m0 = def.trim().match(/^(_?\w+)\s+->/);
    if (m) {
      const name = m[1];
      const arity = m[2].split(/[\s,]+/).filter(Boolean).length;
      functions.push({ name, arity, properties: properties[name] || [] });
    } else if (m0) {
      functions.push({ name: m0[1], arity: 0, properties: properties[m0[1]] || [] });
    }
  }

  return {
    ok: errors.length === 0,
    js,
    functions,
    assertions: { passed, total: assertions.length, results },
    properties,
    errors,
  };
}

/**
 * Full exchange: send → receive → verify.
 * Simulates a complete protocol round-trip.
 *
 * @param {string} source - Benoît source code
 * @returns {{ message: object, result: object, stats: object }}
 */
export function exchange(source) {
  const t0 = performance.now();
  const message = send(source);
  const result = receive(message);
  const elapsed = performance.now() - t0;

  return {
    message,
    result,
    stats: {
      wireSize: source.length,
      functions: result.functions.length,
      assertionsPassed: result.assertions.passed,
      assertionsTotal: result.assertions.total,
      propertiesInferred: Object.keys(result.properties).length,
      elapsed: Math.round(elapsed * 100) / 100,
      verified: result.ok,
    },
  };
}

// ═══════════════════════════════════════════════════
// SHARED KNOWLEDGE — the "quantum entanglement" layer
// ═══════════════════════════════════════════════════
//
// Two agents sharing the same Knowledge base are "entangled":
// they derive the same things from the same definitions.
// You only transmit what the other CANNOT derive alone.
//
// This is Shannon's insight made executable:
//   message_size = total_information - shared_knowledge
//   surprise = what the receiver couldn't predict

/**
 * A shared knowledge base between agents.
 * Agents who share a Knowledge instance only exchange surprises.
 */
export class Knowledge {
  constructor() {
    this.functions = new Map();   // name -> { source, js, arity, properties }
    this.assertions = new Map();  // name -> Set of "fn(args) expected"
  }

  /** Learn a .ben source — absorb all functions and assertions. */
  absorb(source) {
    const result = receive(source);
    for (const fn of result.functions) {
      this.functions.set(fn.name, {
        source: source.split("\n").find(l => l.trim().startsWith(fn.name + " ") && l.includes("->")),
        arity: fn.arity,
        properties: fn.properties,
      });
    }
    for (const a of result.assertions.results) {
      if (!this.assertions.has(a.expr.split("(")[0])) {
        this.assertions.set(a.expr.split("(")[0], new Set());
      }
      this.assertions.get(a.expr.split("(")[0]).add(`${a.expr} ${a.expected}`);
    }
    return result;
  }

  /** Check if a function is already known. */
  knows(name) {
    return this.functions.has(name);
  }

  /** Check if an assertion is already known (derivable). */
  canDerive(expr, expected) {
    const fnName = expr.split("(")[0];
    return this.assertions.get(fnName)?.has(`${expr} ${expected}`) || false;
  }

  /** How many functions this agent knows. */
  get size() {
    return this.functions.size;
  }
}

/**
 * Delta-send: only transmit what the receiver doesn't already know.
 * Like quantum measurement — the shared state collapses redundancy.
 *
 * @param {string} source - Full .ben source
 * @param {Knowledge} receiverKnowledge - What the receiver already knows
 * @returns {{ protocol: string, payload: string, delta: object, meta: object }}
 */
export function deltaSend(source, receiverKnowledge) {
  const lines = source.split("\n");
  const surpriseLines = [];
  const knownLines = [];
  let skippedFunctions = 0;
  let skippedAssertions = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    // Empty or comment — always include for readability
    if (trimmed === "" || trimmed.startsWith("--")) {
      surpriseLines.push(line);
      continue;
    }

    // Function definition — skip if receiver already has it
    const fnMatch = trimmed.match(/^(_?\w+)\s+.*->/);
    if (fnMatch && receiverKnowledge.knows(fnMatch[1])) {
      knownLines.push(line);
      skippedFunctions++;
      continue;
    }

    // Assertion — skip if receiver can derive it
    const juxMatch = trimmed.match(/^(\w+\(.+\))\s+([-\d"'\[{tfn].*)$/);
    if (juxMatch && receiverKnowledge.canDerive(juxMatch[1], juxMatch[2])) {
      knownLines.push(line);
      skippedAssertions++;
      continue;
    }
    const isMatch = trimmed.match(/^(.+?)\s+is\s+(.+)$/);
    if (isMatch && !isMatch[1].includes("->") && receiverKnowledge.canDerive(isMatch[1], isMatch[2])) {
      knownLines.push(line);
      skippedAssertions++;
      continue;
    }

    // Surprise — receiver doesn't know this
    surpriseLines.push(line);
  }

  // Clean up trailing blank lines
  while (surpriseLines.length > 0 && surpriseLines[surpriseLines.length - 1].trim() === "") {
    surpriseLines.pop();
  }

  const payload = surpriseLines.join("\n");

  return {
    protocol: PROTOCOL_VERSION,
    payload,
    delta: {
      originalSize: source.length,
      deltaSize: payload.length,
      compression: `${(payload.length / Math.max(source.length, 1) * 100).toFixed(0)}%`,
      skippedFunctions,
      skippedAssertions,
    },
    meta: {
      sender: "anonymous",
      timestamp: Date.now(),
      size: payload.length,
    },
  };
}

/**
 * Delta-receive: process a delta message, merging with existing knowledge.
 *
 * @param {object|string} message - Delta protocol message or raw .ben
 * @param {Knowledge} knowledge - Receiver's existing knowledge
 * @returns {object} - Same as receive(), plus delta stats
 */
export function deltaReceive(message, knowledge) {
  const source = typeof message === "string"
    ? message
    : message?.payload;

  // First, receive normally
  const result = receive(source);

  // Then absorb into knowledge
  if (result.ok || result.assertions.passed > 0) {
    knowledge.absorb(source);
  }

  return {
    ...result,
    knowledgeSize: knowledge.size,
  };
}

/**
 * Compare v1 (JSON) vs v2 (.ben) protocol efficiency.
 * Returns side-by-side metrics.
 *
 * @param {string} source - Benoît source
 * @param {function} v1Encode - The v1 encode function
 * @returns {{ v1: object, v2: object, ratio: object }}
 */
export function compare(source, v1Encode) {
  // v1: encode to JSON
  const t0 = performance.now();
  let v1msg;
  try {
    const adjusted = source.replace(/^(\w+\(.+\))\s+([-\d"'\[{tfn].*)$/gm, '$1 == $2');
    v1msg = v1Encode(adjusted);
  } catch {
    v1msg = { error: "v1 encode failed" };
  }
  const v1time = performance.now() - t0;
  const v1json = JSON.stringify(v1msg);

  // v2: source IS the message
  const t1 = performance.now();
  const v2result = receive(source);
  const v2time = performance.now() - t1;

  return {
    v1: { size: v1json.length, time: Math.round(v1time * 100) / 100, format: "JSON" },
    v2: { size: source.length, time: Math.round(v2time * 100) / 100, format: ".ben", verified: v2result.ok },
    ratio: {
      sizeReduction: `${(source.length / v1json.length * 100).toFixed(0)}%`,
      speedup: `${(v1time / Math.max(v2time, 0.01)).toFixed(1)}x`,
    },
  };
}
