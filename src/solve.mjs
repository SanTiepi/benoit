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

    // Extract property types if available (from algebra protocol)
    const properties = (fn.properties || []).map(p => typeof p === "string" ? p : p.type);

    // Try different hypotheses, filter by properties
    const hypothesis = tryHypotheses(fn.name, fn.arity, pairs, properties);
    results.push(hypothesis);
  }

  return results;
}

function tryHypotheses(name, arity, pairs, properties = []) {
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

    // Cubic: f(x) = x³
    if (pairs.length >= 3) {
      const isCube = pairs.every(p => Math.abs(p.args[0] ** 3 - p.output) < 0.001);
      if (isCube) {
        hypotheses.push({ formula: "x * x * x", confidence: 0.9 });
      }
    }

    // ReLU: f(x) = max(0, x)
    if (pairs.every(p => p.output === Math.max(0, p.args[0]))) {
      hypotheses.push({ formula: "Math.max(0, x)", confidence: 0.95 });
    }

    // Floor: f(x) = Math.floor(x)
    if (pairs.every(p => p.output === Math.floor(p.args[0]))) {
      hypotheses.push({ formula: "Math.floor(x)", confidence: 0.9 });
    }

    // Sign: f(x) = Math.sign(x)
    if (pairs.every(p => p.output === Math.sign(p.args[0]))) {
      hypotheses.push({ formula: "Math.sign(x)", confidence: 0.9 });
    }

    // Absolute value: f(x) = |x|
    if (pairs.every(p => p.output === Math.abs(p.args[0]))) {
      hypotheses.push({ formula: "Math.abs(x)", confidence: 0.95 });
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

    // Modulo
    if (pairs.every(p => p.args[1] !== 0 && p.output === p.args[0] % p.args[1])) {
      hypotheses.push({ formula: "a % b", confidence: 0.9 });
    }

    // Power
    if (pairs.every(p => Math.abs(Math.pow(p.args[0], p.args[1]) - p.output) < 0.001)) {
      hypotheses.push({ formula: "Math.pow(a, b)", confidence: 0.85 });
    }

    // Integer division
    if (pairs.every(p => p.args[1] !== 0 && p.output === Math.floor(p.args[0] / p.args[1]))) {
      hypotheses.push({ formula: "Math.floor(a / b)", confidence: 0.85 });
    }
  }

  if (arity === 3) {
    // Clamp: f(x, min, max) = Math.max(min, Math.min(max, x))
    if (pairs.every(p => p.output === Math.max(p.args[1], Math.min(p.args[2], p.args[0])))) {
      hypotheses.push({ formula: "Math.max(min, Math.min(max, x))", confidence: 0.95 });
    }
  }

  // If no direct hypothesis found, try conditional synthesis (for arity 1)
  if (hypotheses.length === 0 && arity === 1) {
    const condResult = tryConditionalSynthesis(name, pairs);
    if (condResult) hypotheses.push(condResult);
  }

  if (hypotheses.length === 0) {
    return { name, status: "unsolved", code: null, pairs };
  }

  // If properties are provided, validate hypotheses against them
  if (properties.length > 0) {
    for (const h of hypotheses) {
      h.propertyScore = validateAgainstProperties(h.formula, arity, properties, name, h.recursive);
    }
    // Sort by property score first, then confidence
    hypotheses.sort((a, b) => (b.propertyScore - a.propertyScore) || (b.confidence - a.confidence));
  } else {
    hypotheses.sort((a, b) => b.confidence - a.confidence);
  }
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
  } else if (best.conditional) {
    // Conditional: block form with if/else
    code = `${name} ${params} ->\n  ${formula}`;
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

/**
 * Try to synthesize a conditional function: condition? → branch1, else? → branch2
 */
function tryConditionalSynthesis(name, pairs) {
  const CONDITIONS = [
    { name: "x % 2 == 0", test: x => x % 2 === 0, ben: "x % 2 == 0" },
    { name: "x > 0", test: x => x > 0, ben: "x > 0" },
    { name: "x < 0", test: x => x < 0, ben: "x < 0" },
    { name: "x >= 0", test: x => x >= 0, ben: "x >= 0" },
  ];

  const points = pairs.map(p => ({ x: p.args[0], y: p.output }));

  for (const cond of CONDITIONS) {
    const trueBranch = points.filter(p => cond.test(p.x));
    const falseBranch = points.filter(p => !cond.test(p.x));
    if (trueBranch.length < 2 || falseBranch.length < 2) continue;

    const trueFit = fitBranchLinear(trueBranch) || fitBranchDivision(trueBranch);
    const falseFit = fitBranchLinear(falseBranch) || fitBranchDivision(falseBranch);

    if (trueFit && falseFit) {
      return {
        formula: `${cond.ben}? -> ${trueFit}\n  else? -> ${falseFit}`,
        confidence: 0.85,
        conditional: true
      };
    }
  }
  return null;
}

function fitBranchLinear(points) {
  if (points.length < 2) return null;
  const [p1, p2] = points;
  if (p1.x === p2.x) return null;
  const a = (p2.y - p1.y) / (p2.x - p1.x);
  const b = p1.y - a * p1.x;
  if (!points.every(p => Math.abs(a * p.x + b - p.y) < 0.001)) return null;
  if (Math.abs(a) < 0.001 && Math.abs(b) < 0.001) return "0";
  if (Math.abs(a) < 0.001) return `${b}`;
  if (Math.abs(b) < 0.001) return a === 1 ? "x" : `${a} * x`;
  return `${a} * x + ${b}`;
}

function fitBranchDivision(points) {
  for (const k of [2, 3, 4, 5, 10]) {
    if (points.every(p => Math.abs(p.x / k - p.y) < 0.001)) return `x / ${k}`;
  }
  return null;
}

/**
 * Validate a hypothesis formula against known properties.
 * Returns a score: higher = more properties satisfied.
 */
function validateAgainstProperties(formula, arity, properties, name, recursive) {
  if (recursive || properties.length === 0) return 0;

  let fn;
  try {
    if (arity === 1) fn = new Function("x", `return ${formula}`);
    else if (arity === 2) fn = new Function("a", "b", `return ${formula}`);
    else if (arity === 3) fn = new Function("x", "min", "max", `return ${formula}`);
    else return 0;
  } catch { return 0; }

  let score = 0;
  const samples = [-10, -5, -3, -1, 0, 1, 3, 5, 10, 42];

  for (const prop of properties) {
    try {
      switch (prop) {
        case "idempotent":
          if (arity === 1 && samples.every(x => {
            try { return fn(fn(x)) === fn(x); } catch { return false; }
          })) score += 2; // High weight — strong constraint
          else score -= 3; // Penalty for failing
          break;
        case "even_function":
          if (arity === 1 && samples.every(x => {
            try { return fn(-x) === fn(x); } catch { return false; }
          })) score += 1;
          else score -= 2;
          break;
        case "odd_function":
          if (arity === 1 && samples.filter(x => x !== 0).every(x => {
            try { return fn(-x) === -fn(x); } catch { return false; }
          })) score += 1;
          else score -= 2;
          break;
        case "involution":
          if (arity === 1 && samples.every(x => {
            try { return fn(fn(x)) === x; } catch { return false; }
          })) score += 2;
          else score -= 3;
          break;
        case "non_negative":
          if (arity === 1 && samples.every(x => {
            try { return fn(x) >= 0; } catch { return false; }
          })) score += 1;
          else score -= 2;
          break;
        case "monotonic_increasing":
          if (arity === 1 && fn(-10) <= fn(0) && fn(0) <= fn(10)) score += 1;
          else score -= 1;
          break;
        case "monotonic_decreasing":
          if (arity === 1 && fn(-10) >= fn(0) && fn(0) >= fn(10)) score += 1;
          else score -= 1;
          break;
        case "commutative":
          if (arity === 2 && fn(3, 7) === fn(7, 3)) score += 1;
          else score -= 2;
          break;
        case "associative":
          if (arity === 2 && fn(fn(1, 2), 3) === fn(1, fn(2, 3))) score += 1;
          else score -= 2;
          break;
        case "identity":
          if (arity === 1 && samples.every(x => fn(x) === x)) score += 2;
          else score -= 3;
          break;
        case "fixed_points":
          score += 0; // Neutral — most functions have some fixed points
          break;
        default:
          break;
      }
    } catch { /* skip property check */ }
  }

  return score;
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
