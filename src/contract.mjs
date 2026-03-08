// Benoît Contract-Driven Module Discovery
//
// Instead of "here's my function, take it", an agent says
// "I NEED a function with these properties". Other agents OFFER
// implementations. Both sides verify compatibility through behavioral
// negotiation — examples are the contract, not source code.
//
// This is a marketplace for behavioral specifications.

import crypto from "node:crypto";

// ---------------------------------------------------------------------------
// Property verification (reused from intent.mjs patterns)
// ---------------------------------------------------------------------------

/**
 * Check whether a candidate function satisfies a set of property names.
 * Returns an object { satisfied, violated } with arrays of property names.
 */
function verifyProperties(fn, properties, examples) {
  const satisfied = [];
  const violated = [];

  for (const prop of properties) {
    try {
      switch (prop) {
        case "idempotent": {
          const ok = examples.every(({ input }) => {
            try {
              const once = fn(input);
              const twice = fn(once);
              return JSON.stringify(once) === JSON.stringify(twice);
            } catch { return false; }
          });
          (ok ? satisfied : violated).push(prop);
          break;
        }

        case "length_preserving": {
          const ok = examples.every(({ input }) => {
            try {
              const result = fn(input);
              if (Array.isArray(input)) return Array.isArray(result) && result.length === input.length;
              if (typeof input === "string") return typeof result === "string" && result.length === input.length;
              return true;
            } catch { return false; }
          });
          (ok ? satisfied : violated).push(prop);
          break;
        }

        case "commutative": {
          const ok = examples.every(({ input }) => {
            if (!Array.isArray(input) || input.length !== 2) return true;
            try {
              return JSON.stringify(fn(input)) === JSON.stringify(fn([input[1], input[0]]));
            } catch { return false; }
          });
          (ok ? satisfied : violated).push(prop);
          break;
        }

        case "monotonic_increasing": {
          const numExamples = examples.filter(e => typeof e.input === "number");
          const sorted = [...numExamples].sort((a, b) => a.input - b.input);
          const ok = sorted.length < 2 || sorted.every((e, i) =>
            i === 0 || fn(sorted[i - 1].input) <= fn(e.input)
          );
          (ok ? satisfied : violated).push(prop);
          break;
        }

        case "non_negative": {
          const ok = examples.every(({ input }) => {
            try { return fn(input) >= 0; } catch { return false; }
          });
          (ok ? satisfied : violated).push(prop);
          break;
        }

        case "deterministic": {
          // Run twice, compare
          const ok = examples.every(({ input }) => {
            try {
              return JSON.stringify(fn(input)) === JSON.stringify(fn(input));
            } catch { return false; }
          });
          (ok ? satisfied : violated).push(prop);
          break;
        }

        case "pure": {
          // Stateless: same input always gives same output (verified over examples)
          const ok = examples.every(({ input }) => {
            try {
              const a = fn(input);
              const b = fn(input);
              return JSON.stringify(a) === JSON.stringify(b);
            } catch { return false; }
          });
          (ok ? satisfied : violated).push(prop);
          break;
        }

        default:
          // Unknown property — cannot verify, skip
          break;
      }
    } catch {
      violated.push(prop);
    }
  }

  return { satisfied, violated };
}

// ---------------------------------------------------------------------------
// Deep equality helper
// ---------------------------------------------------------------------------

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

let _counter = 0;

function uid(prefix) {
  _counter++;
  const hash = crypto.randomUUID
    ? crypto.randomUUID().slice(0, 8)
    : String(Date.now()).slice(-8) + String(_counter);
  return `${prefix}-${hash}`;
}

// ---------------------------------------------------------------------------
// publishNeed — publish a behavioral requirement
// ---------------------------------------------------------------------------

/**
 * Publish a behavioral requirement.
 *
 * @param {object} spec
 * @param {string}   spec.name       - Human-readable name
 * @param {Array<{input: *, output: *}>} spec.examples - Required input/output pairs
 * @param {string[]} [spec.properties] - Behavioral properties (e.g. "idempotent")
 * @param {string}   [spec.domain]     - Input type descriptor
 * @param {string}   [spec.range]      - Output type descriptor
 * @returns {object} A need object with { id, name, examples, properties, domain, range, verify }
 */
export function publishNeed(spec) {
  if (!spec || !Array.isArray(spec.examples) || spec.examples.length === 0) {
    throw new Error("publishNeed requires at least one example");
  }

  const need = {
    id: uid("need"),
    name: spec.name || "anonymous",
    examples: spec.examples.map(e => ({ input: e.input, output: e.output })),
    properties: spec.properties || [],
    domain: spec.domain || "any",
    range: spec.range || "any",
    createdAt: Date.now(),
  };

  // Attach a verification function
  need.verify = (fn) => _verifyAgainstNeed(need, fn);

  return need;
}

/**
 * Verify a function against a need's examples and properties.
 * @returns {{ pass: boolean, exampleResults: object[], propertyResults: object }}
 */
function _verifyAgainstNeed(need, fn) {
  const exampleResults = need.examples.map(({ input, output }) => {
    try {
      const actual = fn(input);
      const pass = deepEqual(actual, output);
      return { input, expected: output, actual, pass };
    } catch (err) {
      return { input, expected: output, actual: null, pass: false, error: err.message };
    }
  });

  const allExamplesPass = exampleResults.every(r => r.pass);

  const propertyResults = need.properties.length > 0
    ? verifyProperties(fn, need.properties, need.examples)
    : { satisfied: [], violated: [] };

  const allPropertiesPass = propertyResults.violated.length === 0;

  return {
    pass: allExamplesPass && allPropertiesPass,
    exampleResults,
    propertyResults,
    summary: {
      examplesPassed: exampleResults.filter(r => r.pass).length,
      examplesTotal: exampleResults.length,
      propertiesSatisfied: propertyResults.satisfied.length,
      propertiesViolated: propertyResults.violated.length,
    },
  };
}

// ---------------------------------------------------------------------------
// publishOffer — offer an implementation for a need
// ---------------------------------------------------------------------------

/**
 * Offer an implementation for a published need.
 *
 * @param {string} needId - The need's ID
 * @param {object} implementation
 * @param {Function}  implementation.fn         - Callable implementation
 * @param {string}    [implementation.source]    - Optional Benoît source
 * @param {number}    [implementation.confidence] - Self-reported confidence [0,1]
 * @param {object}    need - The need object (for verification)
 * @returns {object} Offer with verification results
 */
export function publishOffer(needId, implementation, need) {
  if (!implementation || typeof implementation.fn !== "function") {
    throw new Error("publishOffer requires an implementation with a callable fn");
  }

  const offer = {
    id: uid("offer"),
    needId,
    fn: implementation.fn,
    source: implementation.source || null,
    confidence: implementation.confidence ?? 0.5,
    createdAt: Date.now(),
  };

  // If the need is provided, verify immediately
  if (need) {
    offer.verification = _verifyAgainstNeed(need, implementation.fn);
  }

  return offer;
}

// ---------------------------------------------------------------------------
// negotiate — rank multiple offers against a need
// ---------------------------------------------------------------------------

/**
 * Given a need and multiple offers, rank them by fitness.
 *
 * Scoring:
 *   - Example compliance: +10 per passing example, -20 per failing
 *   - Property compliance: +5 per satisfied property, -10 per violated
 *   - Confidence bonus: offer.confidence * 5
 *
 * @param {object} need - The need object
 * @param {object[]} offers - Array of offer objects (each must have .fn)
 * @returns {object[]} Ranked offers with scores and verification reports
 */
export function negotiate(need, offers) {
  if (!need || !Array.isArray(offers) || offers.length === 0) {
    throw new Error("negotiate requires a need and at least one offer");
  }

  const ranked = offers.map(offer => {
    const verification = _verifyAgainstNeed(need, offer.fn);

    const exampleScore =
      verification.summary.examplesPassed * 10 -
      (verification.summary.examplesTotal - verification.summary.examplesPassed) * 20;

    const propertyScore =
      verification.summary.propertiesSatisfied * 5 -
      verification.summary.propertiesViolated * 10;

    const confidenceBonus = (offer.confidence || 0) * 5;

    const totalScore = exampleScore + propertyScore + confidenceBonus;

    return {
      ...offer,
      verification,
      score: totalScore,
      rank: 0, // filled below
    };
  });

  // Sort descending by score
  ranked.sort((a, b) => b.score - a.score);
  ranked.forEach((r, i) => { r.rank = i + 1; });

  return ranked;
}

// ---------------------------------------------------------------------------
// bind — lock a need + offer into a binding contract
// ---------------------------------------------------------------------------

/**
 * Create a binding contract from a need and a chosen offer.
 * The contract locks the verification examples as the "interface".
 * Any future implementation must pass these examples.
 *
 * @param {object} need  - The need object
 * @param {object} offer - The chosen offer
 * @returns {object} A contract object
 */
export function bind(need, offer) {
  if (!need || !offer) {
    throw new Error("bind requires both a need and an offer");
  }

  const verification = _verifyAgainstNeed(need, offer.fn);

  const contract = {
    id: uid("contract"),
    needId: need.id,
    offerId: offer.id,
    name: need.name,
    examples: need.examples.map(e => ({ input: e.input, output: e.output })),
    properties: [...need.properties],
    domain: need.domain,
    range: need.range,
    boundAt: Date.now(),
    verification,
    fn: offer.fn,
  };

  return contract;
}

// ---------------------------------------------------------------------------
// verify — check a new implementation against an existing contract
// ---------------------------------------------------------------------------

/**
 * Verify that a new implementation satisfies an existing contract.
 * Enables function versioning: if someone updates the implementation,
 * we can check backward compatibility.
 *
 * @param {object}   contract          - A bound contract
 * @param {Function} newImplementation - The new function to verify
 * @returns {object} Verification report
 */
export function verify(contract, newImplementation) {
  if (!contract || typeof newImplementation !== "function") {
    throw new Error("verify requires a contract and a function");
  }

  const exampleResults = contract.examples.map(({ input, output }) => {
    try {
      const actual = newImplementation(input);
      const pass = deepEqual(actual, output);
      return { input, expected: output, actual, pass };
    } catch (err) {
      return { input, expected: output, actual: null, pass: false, error: err.message };
    }
  });

  const propertyResults = contract.properties.length > 0
    ? verifyProperties(newImplementation, contract.properties, contract.examples)
    : { satisfied: [], violated: [] };

  const allExamplesPass = exampleResults.every(r => r.pass);
  const allPropertiesPass = propertyResults.violated.length === 0;

  return {
    contractId: contract.id,
    compatible: allExamplesPass && allPropertiesPass,
    exampleResults,
    propertyResults,
    summary: {
      examplesPassed: exampleResults.filter(r => r.pass).length,
      examplesTotal: exampleResults.length,
      propertiesSatisfied: propertyResults.satisfied.length,
      propertiesViolated: propertyResults.violated.length,
    },
  };
}

// ---------------------------------------------------------------------------
// Registry — a marketplace of needs and offers
// ---------------------------------------------------------------------------

/**
 * A marketplace for behavioral needs and offers.
 *
 * Agents publish needs ("I need a sorter"), others publish offers
 * ("here's my sort implementation"). The registry verifies, ranks,
 * and resolves automatically.
 */
export class Registry {
  constructor() {
    /** @type {Map<string, object>} need ID -> need */
    this._needs = new Map();
    /** @type {Map<string, object[]>} need ID -> offers[] */
    this._offers = new Map();
    /** @type {Map<string, object>} contract ID -> contract */
    this._contracts = new Map();
  }

  /**
   * Publish a behavioral need into the registry.
   * @param {object} spec - Same as publishNeed() spec
   * @returns {object} The need object
   */
  publishNeed(spec) {
    const need = publishNeed(spec);
    this._needs.set(need.id, need);
    this._offers.set(need.id, []);
    return need;
  }

  /**
   * Publish an offer for a specific need.
   * @param {string} needId
   * @param {object} implementation - { fn, source?, confidence? }
   * @returns {object} The offer with verification results
   */
  publishOffer(needId, implementation) {
    const need = this._needs.get(needId);
    if (!need) {
      throw new Error(`Unknown need: ${needId}`);
    }

    const offer = publishOffer(needId, implementation, need);
    this._offers.get(needId).push(offer);
    return offer;
  }

  /**
   * Search for needs matching any of the given properties.
   * @param {string[]} properties - Properties to search for
   * @returns {object[]} Matching needs
   */
  search(properties) {
    const propSet = new Set(properties);
    const results = [];
    for (const need of this._needs.values()) {
      const overlap = need.properties.filter(p => propSet.has(p));
      if (overlap.length > 0) {
        results.push({ need, matchedProperties: overlap, matchScore: overlap.length });
      }
    }
    results.sort((a, b) => b.matchScore - a.matchScore);
    return results;
  }

  /**
   * Search for needs by name (substring match).
   * @param {string} name
   * @returns {object[]} Matching needs
   */
  searchByName(name) {
    const lower = name.toLowerCase();
    const results = [];
    for (const need of this._needs.values()) {
      if (need.name.toLowerCase().includes(lower)) {
        results.push(need);
      }
    }
    return results;
  }

  /**
   * Auto-resolve the best offer for a need.
   * Uses negotiate() to rank, then bind() the top offer.
   * @param {string} needId
   * @returns {object|null} The bound contract, or null if no valid offer
   */
  resolve(needId) {
    const need = this._needs.get(needId);
    if (!need) throw new Error(`Unknown need: ${needId}`);

    const offers = this._offers.get(needId) || [];
    if (offers.length === 0) return null;

    const ranked = negotiate(need, offers);
    const best = ranked[0];

    // Only bind if the best offer actually passes all examples
    if (!best.verification.pass) return null;

    const contract = bind(need, best);
    this._contracts.set(contract.id, contract);
    return contract;
  }

  /**
   * Get all offers for a need.
   * @param {string} needId
   * @returns {object[]}
   */
  getOffers(needId) {
    return this._offers.get(needId) || [];
  }

  /**
   * Get all registered needs.
   * @returns {object[]}
   */
  getNeeds() {
    return [...this._needs.values()];
  }

  /**
   * Get all bound contracts.
   * @returns {object[]}
   */
  getContracts() {
    return [...this._contracts.values()];
  }

  /**
   * Verify a new implementation against a bound contract in the registry.
   * @param {string} contractId
   * @param {Function} newImplementation
   * @returns {object} Verification report
   */
  verify(contractId, newImplementation) {
    const contract = this._contracts.get(contractId);
    if (!contract) throw new Error(`Unknown contract: ${contractId}`);
    return verify(contract, newImplementation);
  }
}
