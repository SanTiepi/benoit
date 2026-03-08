// Benoît -> JavaScript transpiler v0.5.0
// Named after Benoît Fragnière, who loved science.
// A programming language optimized for human-AI collaboration.
// MIT License — github.com/SanTiepi/benoit

/**
 * Error thrown when the transpiler encounters invalid Benoît syntax.
 */
export class BenoitError extends Error {
  constructor(message, line, column, source) {
    super(message);
    this.name = "BenoitError";
    this.line = line;
    this.column = column;
    this.source = source;
  }

  /** Pretty-print the error with source context and pointer. */
  format(filename) {
    const loc = filename ? `${filename}:${this.line}` : `line ${this.line}`;
    const pointer = this.column > 0
      ? "\n" + " ".repeat(this.column - 1) + "^"
      : "";
    return `${loc}: ${this.message}\n\n  ${this.source}${pointer}`;
  }
}

/**
 * Transpile Benoît source code to JavaScript.
 * @param {string} src - Benoît source code (.ben)
 * @param {{ filename?: string }} options
 * @returns {string} - JavaScript source code
 */
export function transpile(src, options = {}) {
  const lines = src.split("\n");
  try {
    return processLines(lines, 0, lines.length, false).join("\n");
  } catch (e) {
    if (e instanceof BenoitError && options.filename) {
      e.message = e.format(options.filename);
    }
    throw e;
  }
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
    // Juxtaposition assertion: fn(args) value — call followed by expected
    // Matches: word(anything) literal  where literal is number, boolean, string, null, array, object
    const juxMatch = trimmed.match(/^(\w+\(.+\))\s+([-\d"'\[{tfn].*)$/);
    if (juxMatch) {
      const [, expr, expected] = juxMatch;
      if (!expr.includes("->") && !expr.startsWith("--")) {
        assertions.push({ expr: expr.trim(), expected: expected.trim(), line: i + 1 });
        continue;
      }
    }
    // "is" keyword assertion (still supported)
    const isMatch = trimmed.match(/^(.+?)\s+is\s+(.+)$/);
    if (isMatch) {
      const [, expr, expected] = isMatch;
      if (!expr.includes(":") && !expr.includes("->") && !expr.startsWith("--") && !expr.startsWith("match ")) {
        assertions.push({ expr: expr.trim(), expected: expected.trim(), line: i + 1 });
        continue;
      }
    }
    // Legacy: expression == expected
    const assertMatch = trimmed.match(/^(.+?)\s*==\s*(.+)$/);
    if (assertMatch) {
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

    // 0b. Inline test assertions (top-level only, never inside blocks)
    if (!isBlock) {
      // Juxtaposition: fn(args) literal — most minimal form
      const juxAssert = trimmed.match(/^(\w+\(.+\))\s+([-\d"'\[{tfn].*)$/);
      if (juxAssert && !trimmed.includes("->") && !trimmed.match(/^\w+\s*:/)) {
        output.push(`${indent}// test: ${trimmed}`);
        continue;
      }
      // "is" keyword assertions
      if (trimmed.includes(" is ") && !trimmed.includes("->") && !trimmed.match(/^\w+\s*:/) && !trimmed.startsWith("match ")) {
        output.push(`${indent}// test: ${trimmed}`);
        continue;
      }
      // Legacy: expr == expected
      if (trimmed.includes(" == ") && !trimmed.includes("->") && !trimmed.match(/^\w+\s*:/) && !trimmed.includes("?")) {
        output.push(`${indent}// test: ${trimmed}`);
        continue;
      }
    }

    // 1a. Local import: use ./path.name1, name2 -> import { name1, name2 } from "./path.mjs";
    const useLocalMatch = trimmed.match(/^use\s+(\.\/.+?)\.(\w[\w,\s]*)$/);
    if (useLocalMatch) {
      const [, modPath, names] = useLocalMatch;
      const nameList = names.split(/\s*,\s*/).map(n => n.trim()).filter(Boolean).join(", ");
      output.push(`${indent}import { ${nameList} } from "${modPath}.mjs";`);
      continue;
    }

    // 1b. Local wildcard import: use ./path -> import * as path from "./path.mjs";
    const useLocalWild = trimmed.match(/^use\s+\.\/(\w+)$/);
    if (useLocalWild) {
      const [, mod] = useLocalWild;
      output.push(`${indent}import * as ${mod} from "./${mod}.mjs";`);
      continue;
    }

    // 1c. Node builtin: use X.Y -> import { Y } from "node:X";
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

    // 5c. Try/catch: try -> ... catch err -> ...
    if (trimmed === "try ->") {
      const blockEnd = findBlockEnd(lines, i, indent, end);
      const tryBody = processLines(lines, i + 1, blockEnd, true);
      addImplicitReturn(tryBody);
      // Check what follows the try block
      let hasCatch = false;
      if (blockEnd < end) {
        const catchLine = lines[blockEnd]?.trim();
        const catchMatch = catchLine?.match(/^catch\s+(\w+)\s+->$/);
        const catchInline = catchLine?.match(/^catch\s+(\w+)\s+->\s+(.+)$/);
        if (catchMatch) {
          hasCatch = true;
          const [, errName] = catchMatch;
          output.push(`${indent}try {`);
          output.push(...tryBody);
          output.push(`${indent}} catch (${errName}) {`);
          const catchEnd = findBlockEnd(lines, blockEnd, indent, end);
          const catchBody = processLines(lines, blockEnd + 1, catchEnd, true);
          addImplicitReturn(catchBody);
          output.push(...catchBody);
          output.push(`${indent}}`);
          i = catchEnd - 1;
        } else if (catchInline) {
          hasCatch = true;
          const [, errName, body] = catchInline;
          const transBody = transformExpression(body);
          output.push(`${indent}try {`);
          output.push(...tryBody);
          output.push(`${indent}} catch (${errName}) { return ${transBody}; }`);
          i = blockEnd;
        }
      }
      if (!hasCatch) {
        output.push(`${indent}try {`);
        output.push(...tryBody);
        output.push(`${indent}}`);
        i = blockEnd - 1;
      }
      continue;
    }

    // 6. condition? -> action (inline)
    const condMatch = trimmed.match(/^(.+\?)\s*->\s*(.+)$/);
    if (condMatch && !trimmed.match(/^\w+\s+[\w,=]+\s*->/)) {
      const [, cond, action] = condMatch;
      const cleanCond = transformExpression(cond.replace(/\?$/, "").trim());
      const transAction = transformExpression(action);
      output.push(`${indent}if (${cleanCond}) { ${transAction} }`);
      i = appendElseChain(lines, i, indent, end, output, true);
      continue;
    }

    // condition? -> (block, no inline body)
    const condBlockMatch = trimmed.match(/^(.+\?)\s*->$/);
    if (condBlockMatch) {
      const [, cond] = condBlockMatch;
      const cleanCond = transformExpression(cond.replace(/\?$/, "").trim());
      output.push(`${indent}if (${cleanCond}) {`);
      const blockEnd = findBlockEnd(lines, i, indent, end);
      const blockOutput = processLines(lines, i + 1, blockEnd, true);
      output.push(...blockOutput);
      output.push(`${indent}}`);
      i = blockEnd - 1;
      i = appendElseChain(lines, i, indent, end, output, false);
      continue;
    }

    // condition? action (shorthand, no arrow — ? followed by space, not ?.)
    const condShortMatch = trimmed.match(/^(.+[^.])\?\s+(.+)$/);
    if (condShortMatch && !trimmed.match(/^\w+\s+[\w,=]+\s*->/) && !trimmed.includes("->")) {
      const [, cond, action] = condShortMatch;
      const transAction = transformExpression(action);
      output.push(`${indent}if (${transformExpression(cond.trim())}) { ${transAction} }`);
      i = appendElseChain(lines, i, indent, end, output, true);
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
    // Warn about likely syntax errors before passing through
    if (trimmed.includes("->") && !trimmed.match(/^\w/) && !trimmed.startsWith("|")) {
      throw new BenoitError(
        `unexpected '->' — function definitions must start with a name`,
        i + 1, trimmed.indexOf("->") + 1, trimmed
      );
    }
    if (trimmed.startsWith("=>")) {
      throw new BenoitError(
        `unexpected '=>' — match arms must be inside a 'match expr ->' block`,
        i + 1, 1, trimmed
      );
    }
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
  // First check: is the last construct a complete if/else block?
  // Look for the closing } and trace back to find the matching if
  const lastNonBlank = findLastNonBlankIdx(blockOutput);
  if (lastNonBlank >= 0) {
    const lastTrimmed = blockOutput[lastNonBlank].trim();

    // Inline if/else on one line: if (...) { expr } else { expr }
    if (/^if\s*\(.+\)\s*\{.+\}\s*else\s*(if\s*\(.+\)\s*\{.+\}\s*else\s*)*\{.+\}$/.test(lastTrimmed)) {
      const indent = blockOutput[lastNonBlank].match(/^(\s*)/)[1];
      blockOutput[lastNonBlank] = `${indent}${lastTrimmed.replace(/\{\s*(?!return\b)/g, (m) => m + 'return ')}`;
      return;
    }

    // Block if/else: last line is }, check if it's part of an if/else
    if (lastTrimmed === "}") {
      const ifIdx = findMatchingIf(blockOutput, lastNonBlank);
      if (ifIdx >= 0 && hasElseBranch(blockOutput, ifIdx, lastNonBlank)) {
        addReturnToIfElseBlock(blockOutput, ifIdx, lastNonBlank);
        return;
      }
    }
  }

  // Default: add return to last expression
  for (let i = blockOutput.length - 1; i >= 0; i--) {
    const line = blockOutput[i];
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("}")) continue;
    if (/^(const |let |var |if |for |function |return |export |async |try )/.test(trimmed)) break;
    const indent = line.match(/^(\s*)/)[1];
    blockOutput[i] = `${indent}return ${trimmed}`;
    break;
  }
}

function findLastNonBlankIdx(arr) {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i].trim() !== "") return i;
  }
  return -1;
}

/** Find the if statement that matches a closing } */
function findMatchingIf(blockOutput, closingIdx) {
  const closingIndent = blockOutput[closingIdx].match(/^(\s*)/)[1].length;
  for (let i = closingIdx - 1; i >= 0; i--) {
    const t = blockOutput[i].trim();
    const ind = blockOutput[i].match(/^(\s*)/)[1].length;
    if (ind === closingIndent && /^if\s*\(/.test(t)) return i;
    if (ind < closingIndent) break;
  }
  return -1;
}

/** Check if an if block has an else branch */
function hasElseBranch(blockOutput, ifIdx, endIdx) {
  for (let i = ifIdx; i <= endIdx; i++) {
    if (/\belse\b/.test(blockOutput[i].trim())) return true;
  }
  return false;
}

/**
 * For a block-style if/else that's the last statement in a function,
 * add return to the last expression in each branch.
 */
function addReturnToIfElseBlock(blockOutput, ifLineIdx, endIdx) {
  // Walk forward, find each branch's closing } or } else {
  for (let j = ifLineIdx + 1; j <= endIdx; j++) {
    const t = blockOutput[j].trim();
    // When we hit a } (with or without else), add return to the last expression before it
    if (t === "}" || /^\}\s*else/.test(t)) {
      for (let k = j - 1; k > ifLineIdx; k--) {
        const bt = blockOutput[k].trim();
        if (bt === "" || bt.endsWith("{") || bt.startsWith("}")) continue;
        if (/^(const |let |var |if |for |function |return |export |async )/.test(bt)) break;
        const bindent = blockOutput[k].match(/^(\s*)/)[1];
        blockOutput[k] = `${bindent}return ${bt}`;
        break;
      }
    }
  }
}

/**
 * Look ahead for else? and elif (cond?) chains after a conditional.
 * Modifies output in place and returns the new line index.
 */
function appendElseChain(lines, currentIdx, parentIndent, maxEnd, output, wasInline) {
  let i = currentIdx;
  while (i + 1 < maxEnd) {
    const nextLine = lines[i + 1];
    if (!nextLine) break;
    const nextTrimmed = nextLine.trim();
    const nextIndent = nextLine.match(/^(\s*)/)[1];
    if (nextIndent.length !== parentIndent.length) break;

    // else? -> action (inline)
    const elseInline = nextTrimmed.match(/^else\?\s*->\s*(.+)$/);
    if (elseInline) {
      // Modify last output line: replace closing } with } else {
      if (wasInline) {
        output[output.length - 1] = output[output.length - 1].replace(/\}$/, `} else { ${transformExpression(elseInline[1])} }`);
      } else {
        output[output.length - 1] = `${parentIndent}} else { ${transformExpression(elseInline[1])} }`;
      }
      i++;
      return i;
    }

    // else? -> (block)
    const elseBlock = nextTrimmed.match(/^else\?\s*->$/);
    if (elseBlock) {
      if (wasInline) {
        output[output.length - 1] = output[output.length - 1].replace(/\}$/, `} else {`);
      } else {
        output[output.length - 1] = `${parentIndent}} else {`;
      }
      i++;
      const blockEnd = findBlockEnd(lines, i, parentIndent, maxEnd);
      const blockOutput = processLines(lines, i + 1, blockEnd, true);
      output.push(...blockOutput);
      output.push(`${parentIndent}}`);
      i = blockEnd - 1;
      return i;
    }

    // elif: another condition? -> (acts as else if)
    const elifInline = nextTrimmed.match(/^(.+\?)\s*->\s*(.+)$/);
    if (elifInline && !nextTrimmed.match(/^\w+\s+[\w,=]+\s*->/)) {
      const cleanCond = elifInline[1].replace(/\?$/, "").trim();
      const action = transformExpression(elifInline[2]);
      if (wasInline) {
        output[output.length - 1] = output[output.length - 1].replace(/\}$/, `} else if (${cleanCond}) { ${action} }`);
      } else {
        output[output.length - 1] = `${parentIndent}} else if (${cleanCond}) { ${action} }`;
      }
      i++;
      wasInline = true;
      // Continue to check for more elif/else
      continue;
    }

    // elif block: condition? ->
    const elifBlock = nextTrimmed.match(/^(.+\?)\s*->$/);
    if (elifBlock && !nextTrimmed.match(/^\w+\s+[\w,=]+\s*->/)) {
      const cleanCond = elifBlock[1].replace(/\?$/, "").trim();
      if (wasInline) {
        output[output.length - 1] = output[output.length - 1].replace(/\}$/, `} else if (${cleanCond}) {`);
      } else {
        output[output.length - 1] = `${parentIndent}} else if (${cleanCond}) {`;
      }
      i++;
      const blockEnd = findBlockEnd(lines, i, parentIndent, maxEnd);
      const blockOutput = processLines(lines, i + 1, blockEnd, true);
      output.push(...blockOutput);
      output.push(`${parentIndent}}`);
      i = blockEnd - 1;
      wasInline = false;
      // Continue to check for more elif/else
      continue;
    }

    break;
  }
  return i;
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
  // Error fallback: expr ! fallback -> (() => { try { return expr } catch { return fallback } })()
  if (expr.includes(" ! ")) {
    const bangIdx = expr.indexOf(" ! ");
    const tryExpr = expr.slice(0, bangIdx).trim();
    const fallback = expr.slice(bangIdx + 3).trim();
    const transTry = transformExpression(tryExpr);
    const transFallback = transformExpression(fallback);
    return `(() => { try { return ${transTry}; } catch { return ${transFallback}; } })()`;
  }
  // Fallback chain: a | b | c -> a || b || c
  if (expr.includes(" | ")) {
    expr = expr.replace(/\s\|\s/g, " || ");
  }
  // String interpolation: "Hello {name}" -> `Hello ${name}`
  expr = expr.replace(/"([^"]*\{[^}]+\}[^"]*)"/g, (_, content) => {
    const interpolated = content.replace(/\{([^}]+)\}/g, '${$1}');
    return '`' + interpolated + '`';
  });
  // Strict equality: == -> === and != -> !== (outside strings)
  // Protect string literals first, then convert, then restore
  const strings = [];
  expr = expr.replace(/(["'`])(?:(?!\1)[^\\]|\\.)*\1/g, (m) => {
    strings.push(m);
    return `__STR${strings.length - 1}__`;
  });
  expr = expr.replace(/([^=!])={2}(?!=)/g, '$1===');
  expr = expr.replace(/!={1}(?!=)/g, '!==');
  // Restore strings
  expr = expr.replace(/__STR(\d+)__/g, (_, i) => strings[+i]);
  return expr;
}
