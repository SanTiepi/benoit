// Benoît Solver — bidirectional reasoning from assertions
// Experiment: can we go from behavior to implementation?

/**
 * Given a fingerprint (name + input/output pairs), synthesize a Benoît function
 * by searching for patterns in the assertion data.
 *
 * This is NOT a general solver — it's a pattern recognizer for common functions.
 * The point is to prove the concept: behavior → code is possible.
 */
export function synthesize(fp) {
  const results = [];

  for (const fn of fp.functions) {
    if (fn.assertions.length === 0) {
      results.push({ name: fn.name, status: "no assertions", code: null });
      continue;
    }

    // Extract numeric input/output pairs
    const pairs = fn.assertions.map(a => {
      const inputMatch = a.input.match(/\((.+)\)$/);
      if (!inputMatch) return null;
      const args = inputMatch[1].split(",").map(s => s.trim());
      const numArgs = args.map(Number);
      const output = Number(a.output);
      if (args.some(a => isNaN(Number(a))) || isNaN(output)) return null;
      return { args: numArgs, output };
    }).filter(Boolean);

    if (pairs.length === 0) {
      // Try string-based synthesis
      const strResult = synthesizeStringFn(fn);
      results.push(strResult);
      continue;
    }

    // Try different hypotheses
    const hypothesis = tryHypotheses(fn.name, fn.arity, pairs);
    results.push(hypothesis);
  }

  return results;
}

function tryHypotheses(name, arity, pairs) {
  const hypotheses = [];

  if (arity === 1) {
    // Identity: f(x) = x
    if (pairs.every(p => p.output === p.args[0])) {
      hypotheses.push({ formula: "x", confidence: 1.0 });
    }

    // Constant: f(x) = c
    const outputs = pairs.map(p => p.output);
    if (new Set(outputs).size === 1) {
      hypotheses.push({ formula: `${outputs[0]}`, confidence: 0.9 });
    }

    // Linear: f(x) = ax + b
    if (pairs.length >= 2) {
      const [p1, p2] = pairs;
      const a = (p2.output - p1.output) / (p2.args[0] - p1.args[0]);
      const b = p1.output - a * p1.args[0];
      if (pairs.every(p => Math.abs(a * p.args[0] + b - p.output) < 0.001)) {
        const formula = b === 0 ? `${a} * x` : `${a} * x + ${b}`;
        hypotheses.push({ formula, confidence: 0.95 });
      }
    }

    // Quadratic: f(x) = ax² + bx + c
    if (pairs.length >= 3) {
      const [p1, p2, p3] = pairs;
      // Solve system of 3 equations
      const x1 = p1.args[0], y1 = p1.output;
      const x2 = p2.args[0], y2 = p2.output;
      const x3 = p3.args[0], y3 = p3.output;

      const denom = (x1 - x2) * (x1 - x3) * (x2 - x3);
      if (Math.abs(denom) > 0.001) {
        const a = (x3 * (y2 - y1) + x2 * (y1 - y3) + x1 * (y3 - y2)) / denom;
        const b = (x3*x3 * (y1 - y2) + x2*x2 * (y3 - y1) + x1*x1 * (y2 - y3)) / denom;
        const c = (x2*x3*(x2-x3)*y1 + x3*x1*(x3-x1)*y2 + x1*x2*(x1-x2)*y3) / denom;

        if (pairs.every(p => Math.abs(a * p.args[0]**2 + b * p.args[0] + c - p.output) < 0.001)) {
          let formula = "";
          if (Math.abs(a - 1) < 0.001) formula = "x * x";
          else if (Math.abs(a) > 0.001) formula = `${a} * x * x`;
          if (Math.abs(b) > 0.001) formula += ` + ${b} * x`;
          if (Math.abs(c) > 0.001) formula += ` + ${c}`;
          if (formula) hypotheses.push({ formula: formula.replace(/^\s*\+\s*/, ""), confidence: 0.85 });
        }
      }
    }

    // Factorial pattern: f(0)=1, f(n)=n*f(n-1)
    if (pairs.some(p => p.args[0] === 0 && p.output === 1)) {
      const isFactorial = pairs.every(p => {
        let expected = 1;
        for (let i = 1; i <= p.args[0]; i++) expected *= i;
        return p.output === expected;
      });
      if (isFactorial) {
        hypotheses.push({
          formula: `match n -> | 0 => 1 | _ => n * ${name}(n - 1)`,
          confidence: 0.9,
          recursive: true
        });
      }
    }

    // Fibonacci pattern: compute fib sequence and check all pairs match
    if (pairs.length >= 3 && pairs.some(p => p.args[0] === 0 && p.output === 0)) {
      const maxN = Math.max(...pairs.map(p => p.args[0]));
      const fibs = [0, 1];
      for (let k = 2; k <= maxN; k++) fibs[k] = fibs[k-1] + fibs[k-2];
      const isFib = pairs.every(p => p.args[0] >= 0 && p.args[0] <= maxN && p.output === fibs[p.args[0]]);
      if (isFib) {
        hypotheses.push({
          formula: `match n -> | 0 => 0 | 1 => 1 | _ => ${name}(n - 1) + ${name}(n - 2)`,
          confidence: 0.95,
          recursive: true
        });
      }
    }
  }

  if (arity === 2) {
    // Addition: f(a, b) = a + b
    if (pairs.every(p => p.output === p.args[0] + p.args[1])) {
      hypotheses.push({ formula: "a + b", confidence: 1.0 });
    }

    // Multiplication: f(a, b) = a * b
    if (pairs.every(p => p.output === p.args[0] * p.args[1])) {
      hypotheses.push({ formula: "a * b", confidence: 1.0 });
    }

    // Subtraction
    if (pairs.every(p => p.output === p.args[0] - p.args[1])) {
      hypotheses.push({ formula: "a - b", confidence: 1.0 });
    }

    // Max
    if (pairs.every(p => p.output === Math.max(p.args[0], p.args[1]))) {
      hypotheses.push({ formula: "Math.max(a, b)", confidence: 0.9 });
    }

    // Min
    if (pairs.every(p => p.output === Math.min(p.args[0], p.args[1]))) {
      hypotheses.push({ formula: "Math.min(a, b)", confidence: 0.9 });
    }
  }

  if (arity === 3) {
    // Clamp: f(x, min, max) = Math.max(min, Math.min(max, x))
    if (pairs.every(p => p.output === Math.max(p.args[1], Math.min(p.args[2], p.args[0])))) {
      hypotheses.push({ formula: "Math.max(min, Math.min(max, x))", confidence: 0.95 });
    }
  }

  if (hypotheses.length === 0) {
    return { name, status: "unsolved", code: null, pairs };
  }

  // Pick highest confidence
  hypotheses.sort((a, b) => b.confidence - a.confidence);
  const best = hypotheses[0];
  // Use consistent param names that match the formula variables
  const params = arity === 1 ? "x" : arity === 2 ? "a,b" : "x,min,max";

  // Replace formula variables to match param names
  let formula = best.formula;
  if (arity === 1 && !best.recursive) {
    // Formula already uses x, params use x — matches
  }
  if (arity === 1 && best.recursive) {
    // Recursive formulas use n — keep n as param
  }

  let code;
  if (best.recursive) {
    // For recursive match, use block form with proper indentation
    const matchLines = formula.split(" -> ");
    if (matchLines.length === 2 && matchLines[0].startsWith("match")) {
      code = `${name} n ->\n  ${matchLines[0]} ->\n    ${matchLines[1].split(" | ").join("\n    | ")}`;
    } else {
      code = `${name} n ->\n  ${formula}`;
    }
  } else {
    code = `${name} ${params} -> ${formula}`;
  }

  return {
    name,
    status: "synthesized",
    code,
    confidence: best.confidence,
    alternatives: hypotheses.length > 1 ? hypotheses.slice(1).map(h => h.formula) : []
  };
}

function synthesizeStringFn(fn) {
  // Check for pattern matching style
  return { name: fn.name, status: "string-domain — not yet supported", code: null };
}

/**
 * Solve for unknowns in assertions.
 * add(?, 3) == 5 → ? = 2
 *
 * Uses the synthesized function to reverse-compute.
 */
export function solve(assertion, knownFunctions) {
  const match = assertion.match(/^(\w+)\((.+)\)\s*==\s*(.+)$/);
  if (!match) return { error: "Cannot parse assertion" };

  const [, fnName, argsStr, expected] = match;
  const args = argsStr.split(",").map(s => s.trim());
  const unknownIdx = args.findIndex(a => a === "?");

  if (unknownIdx === -1) return { error: "No unknown (?) found" };

  const expectedVal = Number(expected);
  if (isNaN(expectedVal)) return { error: "Expected value must be numeric" };

  // Known args
  const knownArgs = args.map((a, i) => i === unknownIdx ? null : Number(a));

  // Try brute force for integers in range [-1000, 1000]
  const fn = knownFunctions[fnName];
  if (!fn) return { error: `Unknown function: ${fnName}` };

  const solutions = [];
  for (let candidate = -1000; candidate <= 1000; candidate++) {
    const testArgs = [...knownArgs];
    testArgs[unknownIdx] = candidate;
    try {
      if (fn(...testArgs) === expectedVal) {
        solutions.push(candidate);
      }
    } catch (e) {
      // skip
    }
  }

  return {
    assertion,
    unknown: `arg[${unknownIdx}]`,
    solutions,
    unique: solutions.length === 1
  };
}
