// Benoît -> JavaScript transpiler v0.3.0
// Named after Benoît Fragnière, who loved science.
// A programming language optimized for human-AI collaboration.
// MIT License — github.com/robinfragniere/benoit

/**
 * Transpile Benoît source code to JavaScript.
 * @param {string} src - Benoît source code (.ben)
 * @returns {string} - JavaScript source code
 */
export function transpile(src) {
  const lines = src.split("\n");
  return processLines(lines, 0, lines.length, false).join("\n");
}

/**
 * Extract inline test assertions from Benoît source.
 * Lines like `add 2,3 == 5` become test cases.
 * Lines like `square 4 == 16` become test cases.
 * @param {string} src - Benoît source code
 * @returns {{ assertions: Array<{expr: string, expected: string, line: number}>, testCode: string }}
 */
export function extractTests(src) {
  const lines = src.split("\n");
  const assertions = [];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    // Match: expression == expected (test assertion)
    const assertMatch = trimmed.match(/^(.+?)\s*==\s*(.+)$/);
    if (assertMatch) {
      // Make sure it's not a binding (name: value) or a function def
      const [, expr, expected] = assertMatch;
      if (!expr.includes(":") && !expr.includes("->") && !expr.startsWith("--")) {
        assertions.push({ expr: expr.trim(), expected: expected.trim(), line: i + 1 });
      }
    }
    // Match: expression != expected (negative assertion)
    const negMatch = trimmed.match(/^(.+?)\s*!=\s*(.+)$/);
    if (negMatch) {
      const [, expr, expected] = negMatch;
      if (!expr.includes(":") && !expr.includes("->") && !expr.startsWith("--")) {
        assertions.push({ expr: expr.trim(), expected: expected.trim(), line: i + 1, negate: true });
      }
    }
  }

  // Generate test code
  const testLines = [
    'import { describe, it } from "node:test";',
    'import assert from "node:assert/strict";',
    "",
  ];

  if (assertions.length > 0) {
    testLines.push('describe("Benoît inline assertions", () => {');
    for (const a of assertions) {
      const op = a.negate ? "notEqual" : "deepStrictEqual";
      const label = `line ${a.line}: ${a.expr} ${a.negate ? "!=" : "=="} ${a.expected}`;
      testLines.push(`  it(${JSON.stringify(label)}, () => {`);
      testLines.push(`    assert.${op}(${a.expr}, ${a.expected});`);
      testLines.push(`  });`);
    }
    testLines.push("});");
  }

  return { assertions, testCode: testLines.join("\n") };
}

/**
 * Process a range of lines, handling nested blocks recursively.
 * @param {string[]} lines - All lines
 * @param {number} start - Start index (inclusive)
 * @param {number} end - End index (exclusive)
 * @param {boolean} isBlock - If true, suppress export prefixes
 * @returns {string[]} - Output lines
 */
function processLines(lines, start, end, isBlock) {
  const output = [];

  for (let i = start; i < end; i++) {
    const raw = lines[i];
    const indent = raw.match(/^(\s*)/)[1];
    const trimmed = raw.trim();

    // blank lines
    if (trimmed === "") {
      output.push("");
      continue;
    }

    // 0. Comments: -- text -> // text
    if (trimmed.startsWith("--")) {
      output.push(`${indent}//${trimmed.slice(2)}`);
      continue;
    }

    // 0b. Inline test assertions: expr == expected (skip in transpiled output)
    if (trimmed.includes(" == ") && !trimmed.includes("->") && !trimmed.match(/^\w+\s*:/)) {
      output.push(`${indent}// test: ${trimmed}`);
      continue;
    }

    // 1. use X.Y -> import { Y } from "node:X";
    const useMatch = trimmed.match(/^use\s+(\w+)\.(\w+)$/);
    if (useMatch) {
      const [, mod, name] = useMatch;
      output.push(`${indent}import { ${name} } from "node:${mod}";`);
      continue;
    }

    // 7. collection each k,v -> body (inline)
    const eachMatch = trimmed.match(/^(\S+)\s+each\s+(\w+),(\w+)\s+->\s+(.+)$/);
    if (eachMatch) {
      const [, collection, k, v, body] = eachMatch;
      const transBody = transformExpression(body);
      output.push(`${indent}for (const [${k}, ${v}] of ${collection}) { ${transBody} }`);
      continue;
    }

    // multi-line each (no inline body) — key,value form
    const eachBlockMatch = trimmed.match(/^(\S+)\s+each\s+(\w+),(\w+)\s+->$/);
    if (eachBlockMatch) {
      const [, collection, k, v] = eachBlockMatch;
      output.push(`${indent}for (const [${k}, ${v}] of ${collection}) {`);
      const blockEnd = findBlockEnd(lines, i, indent, end);
      const blockOutput = processLines(lines, i + 1, blockEnd, true);
      output.push(...blockOutput);
      output.push(`${indent}}`);
      i = blockEnd - 1;
      continue;
    }

    // Single-element each: collection each item -> body (inline)
    const eachSingleMatch = trimmed.match(/^(\S+)\s+each\s+(\w+)\s+->\s+(.+)$/);
    if (eachSingleMatch) {
      const [, collection, item, body] = eachSingleMatch;
      const transBody = transformExpression(body);
      output.push(`${indent}for (const ${item} of ${collection}) { ${transBody} }`);
      continue;
    }

    // Single-element each block: collection each item ->
    const eachSingleBlock = trimmed.match(/^(\S+)\s+each\s+(\w+)\s+->$/);
    if (eachSingleBlock) {
      const [, collection, item] = eachSingleBlock;
      output.push(`${indent}for (const ${item} of ${collection}) {`);
      const blockEnd = findBlockEnd(lines, i, indent, end);
      const blockOutput = processLines(lines, i + 1, blockEnd, true);
      output.push(...blockOutput);
      output.push(`${indent}}`);
      i = blockEnd - 1;
      continue;
    }

    // 6. condition? -> action (inline)
    const condMatch = trimmed.match(/^(.+\?)\s*->\s*(.+)$/);
    if (condMatch && !trimmed.match(/^\w+\s+[\w,=]+\s*->/)) {
      const [, cond, action] = condMatch;
      const cleanCond = cond.replace(/\?$/, "").trim();
      const transAction = transformExpression(action);
      output.push(`${indent}if (${cleanCond}) { ${transAction} }`);
      continue;
    }

    // condition? -> (block, no inline body)
    const condBlockMatch = trimmed.match(/^(.+\?)\s*->$/);
    if (condBlockMatch) {
      const [, cond] = condBlockMatch;
      const cleanCond = cond.replace(/\?$/, "").trim();
      output.push(`${indent}if (${cleanCond}) {`);
      const blockEnd = findBlockEnd(lines, i, indent, end);
      const blockOutput = processLines(lines, i + 1, blockEnd, true);
      output.push(...blockOutput);
      output.push(`${indent}}`);
      i = blockEnd - 1;
      continue;
    }

    // condition? action (shorthand, no arrow — ? followed by space, not ?.)
    const condShortMatch = trimmed.match(/^(.+[^.])\?\s+(.+)$/);
    if (condShortMatch && !trimmed.match(/^\w+\s+[\w,=]+\s*->/) && !trimmed.includes("->")) {
      const [, cond, action] = condShortMatch;
      const transAction = transformExpression(action);
      output.push(`${indent}if (${cond.trim()}) { ${transAction} }`);
      continue;
    }

    // Pattern match block: match expr ->
    //   | pattern => body
    // Generates an IIFE so match is an expression (can be returned, assigned, etc.)
    const matchBlockMatch = trimmed.match(/^match\s+(.+)\s+->$/);
    if (matchBlockMatch) {
      const [, subject] = matchBlockMatch;
      const transSubject = transformExpression(subject);
      const blockEnd = findBlockEnd(lines, i, indent, end);
      const arms = parseMatchArms(lines, i + 1, blockEnd);
      if (arms.length > 0) {
        output.push(...generateMatch(transSubject, arms, indent));
      }
      i = blockEnd - 1;
      continue;
    }

    // Inline match: match expr | pattern => body | pattern => body
    const inlineMatchMatch = trimmed.match(/^match\s+(.+?)\s+(\|.+)$/);
    if (inlineMatchMatch) {
      const [, subject, armsStr] = inlineMatchMatch;
      const transSubject = transformExpression(subject);
      const armParts = armsStr.split(/\s*\|\s*/).filter(Boolean);
      const arms = armParts.map(part => {
        const m = part.match(/^(.+?)\s*=>\s*(.+)$/);
        return m ? { pattern: m[1].trim(), body: m[2].trim() } : null;
      }).filter(Boolean);
      if (arms.length > 0) {
        output.push(...generateMatch(transSubject, arms, indent));
      }
      continue;
    }

    // Async function: async name args -> body / async name args ->
    const asyncInlineMatch = trimmed.match(/^async\s+(_?\w+)\s+([\w,=\s]+?)\s+->\s+(.+)$/);
    if (asyncInlineMatch) {
      const [, name, args, body] = asyncInlineMatch;
      const prefix = !isBlock && !name.startsWith("_") ? "export " : "";
      const params = parseParams(args);
      const bodyMatchExpr = inlineMatchBody(body, indent);
      if (bodyMatchExpr) {
        output.push(`${indent}${prefix}async function ${name}(${params}) { return ${bodyMatchExpr}; }`);
      } else {
        const transBody = transformExpression(body);
        output.push(`${indent}${prefix}async function ${name}(${params}) { return ${transBody}; }`);
      }
      continue;
    }
    const asyncNoArgInline = trimmed.match(/^async\s+(_?\w+)\s+->\s+(.+)$/);
    if (asyncNoArgInline) {
      const [, name, body] = asyncNoArgInline;
      const prefix = !isBlock && !name.startsWith("_") ? "export " : "";
      const bodyMatchExpr = inlineMatchBody(body, indent);
      if (bodyMatchExpr) {
        output.push(`${indent}${prefix}async function ${name}() { return ${bodyMatchExpr}; }`);
      } else {
        const transBody = transformExpression(body);
        output.push(`${indent}${prefix}async function ${name}() { return ${transBody}; }`);
      }
      continue;
    }
    const asyncBlockMatch = trimmed.match(/^async\s+(_?\w+)\s+([\w,=\s]+?)\s+->$/);
    if (asyncBlockMatch) {
      const [, name, args] = asyncBlockMatch;
      const prefix = !isBlock && !name.startsWith("_") ? "export " : "";
      const params = parseParams(args);
      output.push(`${indent}${prefix}async function ${name}(${params}) {`);
      const blockEnd = findBlockEnd(lines, i, indent, end);
      const blockOutput = processLines(lines, i + 1, blockEnd, true);
      addImplicitReturn(blockOutput);
      output.push(...blockOutput);
      output.push(`${indent}}`);
      i = blockEnd - 1;
      continue;
    }
    const asyncNoArgBlock = trimmed.match(/^async\s+(_?\w+)\s+->$/);
    if (asyncNoArgBlock) {
      const [, name] = asyncNoArgBlock;
      const prefix = !isBlock && !name.startsWith("_") ? "export " : "";
      output.push(`${indent}${prefix}async function ${name}() {`);
      const blockEnd = findBlockEnd(lines, i, indent, end);
      const blockOutput = processLines(lines, i + 1, blockEnd, true);
      addImplicitReturn(blockOutput);
      output.push(...blockOutput);
      output.push(`${indent}}`);
      i = blockEnd - 1;
      continue;
    }

    // 2/3. name args -> body (function definition, inline)
    const fnInlineMatch = trimmed.match(/^(_?\w+)\s+([\w,=\s]+?)\s+->\s+(.+)$/);
    if (fnInlineMatch) {
      const [, name, args, body] = fnInlineMatch;
      const jsName = name;
      const prefix = !isBlock && !name.startsWith("_") ? "export " : "";
      const params = parseParams(args);
      const bodyMatchExpr = inlineMatchBody(body, indent);
      if (bodyMatchExpr) {
        output.push(`${indent}${prefix}function ${jsName}(${params}) { return ${bodyMatchExpr}; }`);
      } else {
        const transBody = transformExpression(body);
        output.push(`${indent}${prefix}function ${jsName}(${params}) { return ${transBody}; }`);
      }
      continue;
    }

    // No-arg function: name -> body (inline)
    const fnNoArgInline = trimmed.match(/^(_?\w+)\s+->\s+(.+)$/);
    if (fnNoArgInline) {
      const [, name, body] = fnNoArgInline;
      const jsName = name;
      const prefix = !isBlock && !name.startsWith("_") ? "export " : "";
      const bodyMatchExpr = inlineMatchBody(body, indent);
      if (bodyMatchExpr) {
        output.push(`${indent}${prefix}function ${jsName}() { return ${bodyMatchExpr}; }`);
      } else {
        const transBody = transformExpression(body);
        output.push(`${indent}${prefix}function ${jsName}() { return ${transBody}; }`);
      }
      continue;
    }

    // No-arg function block: name ->
    const fnNoArgBlock = trimmed.match(/^(_?\w+)\s+->$/);
    if (fnNoArgBlock) {
      const [, name] = fnNoArgBlock;
      const jsName = name;
      const prefix = !isBlock && !name.startsWith("_") ? "export " : "";
      output.push(`${indent}${prefix}function ${jsName}() {`);
      const blockEnd = findBlockEnd(lines, i, indent, end);
      const blockOutput = processLines(lines, i + 1, blockEnd, true);
      addImplicitReturn(blockOutput);
      output.push(...blockOutput);
      output.push(`${indent}}`);
      i = blockEnd - 1;
      continue;
    }

    // Function with block body: name args ->
    const fnBlockMatch = trimmed.match(/^(_?\w+)\s+([\w,=\s]+?)\s+->$/);
    if (fnBlockMatch) {
      const [, name, args] = fnBlockMatch;
      const jsName = name;
      const prefix = !isBlock && !name.startsWith("_") ? "export " : "";
      const params = parseParams(args);
      output.push(`${indent}${prefix}function ${jsName}(${params}) {`);
      const blockEnd = findBlockEnd(lines, i, indent, end);
      const blockOutput = processLines(lines, i + 1, blockEnd, true);
      addImplicitReturn(blockOutput);
      output.push(...blockOutput);
      output.push(`${indent}}`);
      i = blockEnd - 1;
      continue;
    }

    // 4. name: Type (Map, Set, Array)
    const typeMatch = trimmed.match(/^(\w+):\s*(Map|Set|Array)$/);
    if (typeMatch) {
      const [, name, type] = typeMatch;
      const bindPrefix = isBlock ? "" : "export ";
      output.push(`${indent}${bindPrefix}const ${name} = new ${type}();`);
      continue;
    }

    // 5a. Destructuring binding: [a, b, ...rest]: expr  or  {x, y}: expr
    const destructMatch = trimmed.match(/^(\[.+\]|\{.+\}):\s*(.+)$/);
    if (destructMatch) {
      const [, pattern, value] = destructMatch;
      const bindPrefix = isBlock ? "" : "export ";
      const transValue = transformExpression(value);
      output.push(`${indent}${bindPrefix}const ${pattern} = ${transValue};`);
      continue;
    }

    // 5. name: value (literal binding)
    const bindMatch = trimmed.match(/^(\w+):\s*(.+)$/);
    if (bindMatch) {
      const [, name, value] = bindMatch;
      const bindPrefix = isBlock ? "" : "export ";
      const transValue = transformExpression(value);
      output.push(`${indent}${bindPrefix}const ${name} = ${transValue};`);
      continue;
    }

    // fallback: pass through with expression transform
    output.push(`${indent}${transformExpression(trimmed)}`);
  }

  return output;
}

/**
 * If body is an inline match expression, return the ternary chain JS string.
 * Otherwise return null.
 */
function inlineMatchBody(body, indent) {
  const m = body.match(/^match\s+(.+?)\s+(\|.+)$/);
  if (!m) return null;
  const [, subject, armsStr] = m;
  const transSubject = transformExpression(subject);
  const armParts = armsStr.split(/\s*\|\s*/).filter(Boolean);
  const arms = armParts.map(part => {
    const am = part.match(/^(.+?)\s*=>\s*(.+)$/);
    return am ? { pattern: am[1].trim(), body: am[2].trim() } : null;
  }).filter(Boolean);
  if (arms.length === 0) return null;
  return generateMatch(transSubject, arms, "")[0].trim();
}

/**
 * Parse match arms from block lines.
 */
function parseMatchArms(lines, start, end) {
  const arms = [];
  for (let j = start; j < end; j++) {
    const armLine = lines[j].trim();
    if (armLine === "") continue;
    const armMatch = armLine.match(/^\|\s*(.+?)\s*=>\s*(.+)$/);
    if (armMatch) {
      arms.push({ pattern: armMatch[1].trim(), body: armMatch[2].trim() });
    }
  }
  return arms;
}

/**
 * Generate JS for a match expression as an IIFE.
 * match x -> | 1 => "one" | _ => "other"  →  ((__v) => { if (__v === 1) return "one"; return "other"; })(x)
 */
function generateMatch(subject, arms, indent) {
  // Generate match as a single ternary chain expression
  // match x -> | 1 => "one" | 2 => "two" | _ => "other"
  // becomes: (x === 1 ? "one" : x === 2 ? "two" : "other")
  //
  // Guard clauses: | n when n > 0 => "positive"
  // Range patterns: | 1..10 => "small"
  // Tagged: | Success data => body
  const parts = [];
  for (const arm of arms) {
    const transBody = transformExpression(arm.body);
    let pattern = arm.pattern;

    // Check for guard clause: pattern when condition
    const guardMatch = pattern.match(/^(.+?)\s+when\s+(.+)$/);
    let guardCond = null;
    if (guardMatch) {
      pattern = guardMatch[1].trim();
      guardCond = guardMatch[2].trim();
    }

    if (pattern === "_") {
      if (guardCond) {
        // _ when cond => body (guard on wildcard)
        parts.push({ cond: guardCond, body: transBody });
      } else {
        parts.push(transBody);
      }
    } else if (pattern.match(/^(\d+)\.\.(\d+)$/)) {
      // Range pattern: 1..10 => "small"
      const [, lo, hi] = pattern.match(/^(\d+)\.\.(\d+)$/);
      let cond = `${subject} >= ${lo} && ${subject} <= ${hi}`;
      if (guardCond) cond = `${cond} && ${guardCond}`;
      parts.push({ cond, body: transBody });
    } else if (pattern.match(/^\w+\s+\w+/) && !guardCond) {
      // Tagged: Success data => body
      const tagParts = pattern.split(/\s+/);
      const tag = tagParts[0];
      const binding = tagParts[1];
      parts.push({ cond: `${subject}?.tag === "${tag}"`, body: `((${binding}) => ${transBody})(${subject}.value)` });
    } else {
      let cond = `${subject} === ${pattern}`;
      if (guardCond) cond = `${cond} && ${guardCond}`;
      parts.push({ cond, body: transBody });
    }
  }

  // Build ternary chain from right to left
  let expr = "undefined";
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i];
    if (typeof part === "string") {
      // Wildcard — this becomes the else
      expr = part;
    } else {
      expr = `${part.cond} ? ${part.body} : ${expr}`;
    }
  }

  return [`${indent}(${expr})`];
}

/**
 * Add implicit return to the last meaningful line of a function block.
 * Last expression becomes `return expr;` unless it's a control flow statement.
 */
function addImplicitReturn(blockOutput) {
  // Find last non-blank line
  for (let i = blockOutput.length - 1; i >= 0; i--) {
    const line = blockOutput[i];
    const trimmed = line.trim();
    if (trimmed === "" || trimmed === "}") continue;
    // Don't add return to: declarations, control flow, existing returns
    if (/^(const |let |var |if |for |function |return |export |async )/.test(trimmed)) break;
    // Add return to value expressions (function calls, property access, identifiers)
    const indent = line.match(/^(\s*)/)[1];
    blockOutput[i] = `${indent}return ${trimmed}`;
    break;
  }
}

/**
 * Find the end index of an indented block starting after currentIdx.
 * Returns the index of the first line that is NOT part of the block.
 */
function findBlockEnd(lines, currentIdx, parentIndent, maxEnd) {
  let j = currentIdx + 1;
  let lastNonBlank = j;
  while (j < maxEnd) {
    const line = lines[j];
    if (line.trim() === "") {
      j++;
      continue;
    }
    const lineIndent = line.match(/^(\s*)/)[1];
    if (lineIndent.length > parentIndent.length) {
      j++;
      lastNonBlank = j;
    } else {
      break;
    }
  }
  return lastNonBlank;
}

/**
 * Parse MCL params like "maxRequests=100 windowMs=60000" into JS params.
 */
function parseParams(raw) {
  const parts = raw.trim().split(/\s+/);
  return parts
    .map((p) => {
      const eqIdx = p.indexOf("=");
      if (eqIdx !== -1) {
        const name = p.slice(0, eqIdx);
        const def = p.slice(eqIdx + 1);
        return `${name} = ${def}`;
      }
      return p;
    })
    .join(", ");
}

/**
 * Transform an MCL expression to JS.
 * Handles: pipe fallback chains (a | b | c -> a || b || c)
 */
function transformExpression(expr) {
  // Shorthand conditional: cond? action (inside expressions like each body)
  const condShort = expr.match(/^(.+[^.])\?\s+(.+)$/);
  if (condShort) {
    const [, cond, action] = condShort;
    return `if (${cond.trim()}) { ${transformExpression(action)} }`;
  }
  // Pipe operator: a |> fn |> fn  →  fn(fn(a))
  if (expr.includes(" |> ")) {
    const parts = expr.split(/\s+\|>\s+/);
    if (parts.length >= 2) {
      expr = parts.reduce((acc, part) => {
        const trimPart = part.trim();
        if (!acc) return trimPart;
        // If the part looks like a function call with args: fn arg1 arg2
        // then wrap as fn(acc, arg1, arg2)
        const fnParts = trimPart.split(/\s+/);
        if (fnParts.length > 1) {
          return `${fnParts[0]}(${acc}, ${fnParts.slice(1).join(", ")})`;
        }
        // Simple function name: fn(acc)
        return `${trimPart}(${acc})`;
      });
    }
  }
  // Fallback chain: a | b | c -> a || b || c
  if (expr.includes(" | ")) {
    expr = expr.replace(/\s\|\s/g, " || ");
  }
  return expr;
}
