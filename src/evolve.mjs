// Benoît Self-Evolving Functions
//
// A function that improves itself over time by:
// 1. Collecting new examples from usage
// 2. Discovering new properties via inference
// 3. Finding more efficient implementations via synthesis
// 4. Verifying backward compatibility before accepting changes
//
// Evolution is conservative: new code replaces old ONLY if every
// previous example still passes. Knowledge accumulates; regressions don't.

import { transpile } from "./transpile.mjs";
import { infer } from "./infer.mjs";
import { synthesize } from "./solve.mjs";
import { optimize } from "./optimize.mjs";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Deep equality check via JSON serialization.
 */
function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Parse Benoît source to extract function name, arity, definition line,
 * and inline assertions (examples).
 */
function parseBenoitSource(source) {
  const lines = source.split("\n").map(l => l.trim()).filter(Boolean);

  // Find the definition line: "name params -> body"
  let defLine = null;
  let name = null;
  let params = [];
  const assertions = [];

  for (const line of lines) {
    const defMatch = line.match(/^(_?\w+)\s+([\w,\s]+?)\s*->\s*(.+)$/);
    if (defMatch && !defLine) {
      name = defMatch[1];
      params = defMatch[2].split(/[\s,]+/).filter(Boolean);
      defLine = line;
      continue;
    }

    // Inline assertion: "name(args) == expected"
    const assertMatch = line.match(/^(.+?)\s*==\s*(.+)$/);
    if (assertMatch) {
      const expr = assertMatch[1].trim();
      const expected = assertMatch[2].trim();
      // Parse "name(arg1, arg2)" to extract input args
      const callMatch = expr.match(/^(\w+)\((.+)\)$/);
      if (callMatch) {
        const argStrs = callMatch[2].split(",").map(s => s.trim());
        const args = argStrs.map(s => {
          try { return JSON.parse(s); } catch { return Number(s); }
        });
        let output;
        try { output = JSON.parse(expected); } catch { output = Number(expected); }
        assertions.push({ input: args.length === 1 ? args[0] : args, output });
      }
    }
  }

  return {
    name,
    params,
    arity: params.length,
    defLine,
    assertions,
    source,
  };
}

/**
 * Compile a Benoît definition line into a callable JS function.
 * Returns the function, or null on failure.
 */
function compileDef(defLine, name) {
  try {
    const js = transpile(defLine).replace(/export /g, "");
    return new Function(js + "\nreturn " + name)();
  } catch {
    return null;
  }
}

/**
 * Build a synthesize-compatible fingerprint from a name, arity, and examples.
 */
function buildFingerprint(name, arity, examples) {
  const assertions = examples.map(({ input, output }) => {
    const args = Array.isArray(input) && arity > 1 ? input : [input];
    return {
      input: `${name}(${args.join(", ")})`,
      output: String(output),
    };
  });

  return {
    functions: [{
      name,
      arity,
      assertions,
      properties: [],
    }],
  };
}

/**
 * Try to build a callable function from a synthesized code string.
 */
function compileFormula(code, name, arity) {
  // Extract the formula after "->"
  const match = code.match(/->\s*(.+)$/);
  if (!match) return null;
  const formula = match[1].trim();

  try {
    let fn;
    if (arity === 1) {
      const paramNames = ["x"];
      fn = new Function(...paramNames, `return ${formula}`);
    } else if (arity === 2) {
      const raw = new Function("a", "b", `return ${formula}`);
      // Wrap so it accepts either (a,b) or ([a,b])
      fn = (...args) => {
        if (args.length === 1 && Array.isArray(args[0])) {
          return raw(...args[0]);
        }
        return raw(...args);
      };
    } else if (arity === 3) {
      const raw = new Function("x", "min", "max", `return ${formula}`);
      fn = (...args) => {
        if (args.length === 1 && Array.isArray(args[0])) {
          return raw(...args[0]);
        }
        return raw(...args);
      };
    } else {
      return null;
    }
    return fn;
  } catch {
    return null;
  }
}

/**
 * Run infer() on a definition line and return discovered property types.
 */
function inferProperties(defLine) {
  try {
    const result = infer(defLine);
    return result.properties.map(p => p.type);
  } catch {
    return [];
  }
}

/**
 * Check that a function passes all given examples.
 */
function checkExamples(fn, arity, examples) {
  return examples.every(({ input, output }) => {
    try {
      let actual;
      if (arity > 1 && Array.isArray(input)) {
        actual = fn(...input);
      } else {
        actual = fn(input);
      }
      return deepEqual(actual, output);
    } catch {
      return false;
    }
  });
}

// ---------------------------------------------------------------------------
// Evolvable class
// ---------------------------------------------------------------------------

/**
 * A self-evolving function.
 *
 * Wraps a compiled Benoît function together with its source, examples,
 * inferred properties, and a generation counter.  Call .evolve() to
 * re-synthesize from accumulated observations.
 */
export class Evolvable {

  /**
   * Create an evolvable function from Benoît source code.
   *
   * The source should contain a function definition and optionally
   * inline assertions that serve as the initial example set.
   *
   * @param {string} source - Benoît source code
   * @returns {Evolvable} A callable evolvable (via Proxy)
   */
  static from(source) {
    const parsed = parseBenoitSource(source);
    if (!parsed.name || !parsed.defLine) {
      throw new Error("Evolvable.from: source must contain a function definition (name params -> body)");
    }

    const fn = compileDef(parsed.defLine, parsed.name);
    if (!fn) {
      throw new Error(`Evolvable.from: could not compile definition "${parsed.defLine}"`);
    }

    const properties = inferProperties(parsed.defLine);

    const evo = new Evolvable({
      name: parsed.name,
      arity: parsed.arity,
      source: parsed.source,
      defLine: parsed.defLine,
      fn,
      examples: [...parsed.assertions],
      properties,
      generation: 0,
      history: [{
        generation: 0,
        defLine: parsed.defLine,
        properties: [...properties],
        exampleCount: parsed.assertions.length,
        timestamp: Date.now(),
      }],
      pendingObservations: [],
    });

    return evo._proxy();
  }

  /**
   * @private — use Evolvable.from() to create instances.
   */
  constructor(state) {
    /** @type {string} */ this._name = state.name;
    /** @type {number} */ this._arity = state.arity;
    /** @type {string} */ this._source = state.source;
    /** @type {string} */ this._defLine = state.defLine;
    /** @type {Function} */ this._fn = state.fn;
    /** @type {Array<{input: *, output: *}>} */ this._examples = state.examples;
    /** @type {string[]} */ this._properties = state.properties;
    /** @type {number} */ this._generation = state.generation;
    /** @type {Array<object>} */ this._history = state.history;
    /** @type {Array<{input: *, output: *}>} */ this._pendingObservations = state.pendingObservations;
  }

  /**
   * Wrap the Evolvable in a Proxy so it is directly callable.
   * Calling evo(args) invokes the underlying compiled function.
   * Property access (evo.observe, evo.evolve, etc.) passes through.
   * @private
   */
  _proxy() {
    const self = this;
    return new Proxy(this, {
      apply(_target, _thisArg, args) {
        return self._fn(...args);
      },
      get(target, prop, receiver) {
        // Allow direct property access on the Evolvable instance
        if (prop in target) {
          const val = target[prop];
          return typeof val === "function" ? val.bind(target) : val;
        }
        return Reflect.get(target, prop, receiver);
      },
    });
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Record a new observation (input/output pair).
   * Observations accumulate until .evolve() is called.
   *
   * @param {*} input  - The input value(s)
   * @param {*} output - The observed output
   */
  observe(input, output) {
    this._pendingObservations.push({ input, output });
  }

  /**
   * Trigger an evolution cycle:
   * 1. Merge pending observations into the example set
   * 2. Re-infer properties from the current definition
   * 3. Attempt synthesis of a better implementation
   * 4. Verify backward compatibility
   * 5. Accept or reject the new implementation
   *
   * @returns {object} Evolution report
   */
  evolve() {
    // 1. Merge pending observations
    const newExamples = [];
    const existingKeys = new Set(this._examples.map(e => JSON.stringify(e.input)));

    for (const obs of this._pendingObservations) {
      const key = JSON.stringify(obs.input);
      if (!existingKeys.has(key)) {
        this._examples.push(obs);
        newExamples.push(obs);
        existingKeys.add(key);
      }
    }
    this._pendingObservations = [];

    // 2. Re-infer properties from the definition + all examples
    const oldProperties = [...this._properties];
    const freshProperties = inferProperties(this._defLine);

    // Discover any new properties by checking examples against known patterns
    const newProperties = freshProperties.filter(p => !oldProperties.includes(p));

    // 3. Attempt re-synthesis from all examples
    let optimized = false;
    let compatible = true;
    let candidateFn = null;
    let candidateDefLine = null;

    // Only attempt re-synthesis if we have enough examples
    if (this._examples.length >= 2) {
      const fp = buildFingerprint(this._name, this._arity, this._examples);
      const results = synthesize(fp);
      const result = results[0];

      if (result && result.status === "synthesized" && result.code) {
        candidateFn = compileFormula(result.code, this._name, this._arity);
        candidateDefLine = result.code;
      }
    }

    // Also try optimize() on the source for algebraic simplifications
    try {
      const optResult = optimize(this._source);
      if (optResult.report.length > 0 && optResult.optimized !== this._source) {
        // See if the optimized version compiles and passes
        const optParsed = parseBenoitSource(optResult.optimized);
        if (optParsed.defLine) {
          const optFn = compileDef(optParsed.defLine, optParsed.name || this._name);
          if (optFn && checkExamples(optFn, this._arity, this._examples)) {
            // Prefer optimized if we don't already have a synthesized candidate
            if (!candidateFn) {
              candidateFn = optFn;
              candidateDefLine = optParsed.defLine;
            }
          }
        }
      }
    } catch { /* optimization is optional */ }

    // 4. Verify backward compatibility
    if (candidateFn) {
      compatible = checkExamples(candidateFn, this._arity, this._examples);
      if (compatible) {
        // Accept the new implementation
        this._fn = candidateFn;
        this._defLine = candidateDefLine;
        optimized = true;

        // Re-infer properties on the new definition
        const candidateProps = inferProperties(candidateDefLine);
        // Merge: keep old properties that still hold, add new ones
        const merged = new Set([...this._properties, ...candidateProps]);
        this._properties = [...merged];
      }
    }

    // Update properties even if no new implementation
    if (!optimized) {
      const merged = new Set([...this._properties, ...freshProperties]);
      this._properties = [...merged];
    }

    // 5. Advance generation
    this._generation++;

    // Record history
    this._history.push({
      generation: this._generation,
      defLine: this._defLine,
      properties: [...this._properties],
      exampleCount: this._examples.length,
      newExamples: newExamples.length,
      newProperties,
      optimized,
      compatible,
      timestamp: Date.now(),
    });

    return {
      generation: this._generation,
      newProperties,
      optimized,
      compatible,
      exampleCount: this._examples.length,
      propertyCount: this._properties.length,
    };
  }

  /**
   * Return the full evolution history.
   * Each entry records the generation number, definition, properties,
   * example count, and whether optimization occurred.
   *
   * @returns {Array<object>}
   */
  history() {
    return this._history.map(h => ({ ...h }));
  }

  /**
   * Create an independent copy (fork) that can evolve separately.
   * The fork starts with the same examples, properties, and generation,
   * but subsequent observations and evolutions are independent.
   *
   * @returns {Evolvable} A new evolvable (proxied)
   */
  fork() {
    const clone = new Evolvable({
      name: this._name,
      arity: this._arity,
      source: this._source,
      defLine: this._defLine,
      fn: this._fn,
      examples: this._examples.map(e => ({ ...e })),
      properties: [...this._properties],
      generation: this._generation,
      history: this._history.map(h => ({ ...h })),
      pendingObservations: [],
    });
    return clone._proxy();
  }

  /**
   * Merge another evolvable's observations into this one, then evolve.
   * This is how two agents combine their knowledge of a function.
   *
   * @param {Evolvable} other - Another evolvable (may be proxied)
   * @returns {object} Evolution report from the post-merge evolve
   */
  merge(other) {
    // Access the underlying Evolvable if proxied
    const otherEvo = other._examples ? other : other;

    // Collect all examples from the other evolvable as pending observations
    const existingKeys = new Set(this._examples.map(e => JSON.stringify(e.input)));

    for (const ex of otherEvo._examples) {
      const key = JSON.stringify(ex.input);
      if (!existingKeys.has(key)) {
        this._pendingObservations.push({ ...ex });
      }
    }

    // Also include the other's pending observations
    for (const obs of otherEvo._pendingObservations) {
      const key = JSON.stringify(obs.input);
      if (!existingKeys.has(key)) {
        this._pendingObservations.push({ ...obs });
      }
    }

    // Evolve to integrate the merged knowledge
    return this.evolve();
  }

  /**
   * Score the current implementation's fitness.
   *
   * Components:
   *   - propertyCount:  number of discovered properties
   *   - exampleCoverage: number of collected examples
   *   - optimizationLevel: how many evolution generations produced optimizations
   *   - regressions: number of examples that currently fail (should be 0)
   *   - score: composite score [0, 1]
   *
   * @returns {object} Fitness report
   */
  fitness() {
    const propertyCount = this._properties.length;
    const exampleCoverage = this._examples.length;

    const optimizationLevel = this._history.filter(h => h.optimized).length;

    // Check for regressions
    let regressions = 0;
    for (const ex of this._examples) {
      try {
        let actual;
        if (this._arity > 1 && Array.isArray(ex.input)) {
          actual = this._fn(...ex.input);
        } else {
          actual = this._fn(ex.input);
        }
        if (!deepEqual(actual, ex.output)) regressions++;
      } catch {
        regressions++;
      }
    }

    // Composite score: normalize each component
    const propScore = Math.min(propertyCount / 5, 1.0);        // up to 5 properties = 1.0
    const exScore = Math.min(exampleCoverage / 10, 1.0);       // up to 10 examples = 1.0
    const optScore = Math.min(optimizationLevel / 3, 1.0);     // up to 3 optimizations = 1.0
    const regPenalty = regressions > 0 ? 0.5 : 0;              // heavy penalty for regressions

    const score = Math.max(0, (propScore * 0.3 + exScore * 0.3 + optScore * 0.2 + 0.2) - regPenalty);

    return {
      propertyCount,
      exampleCoverage,
      optimizationLevel,
      regressions,
      score: Math.round(score * 1000) / 1000,
      generation: this._generation,
    };
  }

  // -----------------------------------------------------------------------
  // Accessors
  // -----------------------------------------------------------------------

  /** Current generation number. */
  get generation() { return this._generation; }

  /** Current list of discovered property types. */
  get properties() { return [...this._properties]; }

  /** Current example set. */
  get examples() { return this._examples.map(e => ({ ...e })); }

  /** The function name. */
  get name() { return this._name; }

  /** The current Benoît definition line. */
  get defLine() { return this._defLine; }
}
