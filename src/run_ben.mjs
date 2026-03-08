#!/usr/bin/env node
// run_ben.mjs — Benoît self-interpreter (Phase 2: NATIVE EVAL)
// NO new Function(). NO eval(). NO transpiler.
// Expression evaluation is done by a hand-written tokenizer + Pratt parser + tree-walker.
// "Il n'y a pas de mauvaise réponse, que des mauvaises questions."

import { readFileSync } from "node:fs";
import { parse } from "./ast.mjs";
import { evalExpression } from "./expr.mjs";

// === ENVIRONMENT ===

function createEnv(parent) {
  return { parent, bindings: {} };
}

function envSet(env, name, value) {
  env.bindings[name] = value;
  return value;
}

function flatBindings(env) {
  if (!env) return {};
  return Object.assign(flatBindings(env.parent), env.bindings);
}

// === .ben EXPRESSION TRANSFORM (only | -> || and == -> ===) ===

function benToJs(expr) {
  // String interpolation: "Hello {name}" -> `Hello ${name}`
  expr = expr.replace(/"([^"]*\{[^}]+\}[^"]*)"/g, (_, c) => '`' + c.replace(/\{([^}]+)\}/g, '${$1}') + '`');
  // Protect strings
  const strings = [];
  expr = expr.replace(/(["'`])(?:(?!\1)[^\\]|\\.)*\1/g, (m) => { strings.push(m); return `__S${strings.length - 1}__`; });
  // Fallback: | -> ||
  expr = expr.replace(/\s\|\s/g, " || ");
  // Strict equality
  expr = expr.replace(/([^=!])={2}(?!=)/g, '$1===');
  expr = expr.replace(/!={1}(?!=)/g, '!==');
  // Restore strings
  expr = expr.replace(/__S(\d+)__/g, (_, i) => strings[+i]);
  return expr;
}

// === EXPRESSION EVALUATOR (Phase 2: NATIVE — no new Function) ===

function evalExpr(expr, env) {
  const jsExpr = benToJs(expr);
  const bindings = flatBindings(env);
  try {
    return evalExpression(jsExpr, bindings);
  } catch (e) {
    throw new Error(`evalExpr failed on: ${expr}\n  ${e.message}`);
  }
}

// === NODE EVALUATORS (mirrors eval.ben) ===

function evalBinding(node, env) {
  const val = evalExpr(node.value, env);
  return envSet(env, node.name, val);
}

function evalFunction(node, env) {
  const params = node.params;
  const body = node.body;
  const closure = env;

  // Create a real callable that goes through the interpreter
  const callable = function (...args) {
    const local = createEnv(closure);
    for (let i = 0; i < params.length; i++) {
      envSet(local, params[i], args[i]);
    }
    if (typeof body === "string") {
      return evalExpr(body, local);
    }
    return evalBlock(body, local);
  };

  return envSet(env, node.name, callable);
}

function evalBlock(nodes, env) {
  let result;
  for (const node of nodes) {
    // Handle conditional expressions in block bodies:
    // "condition? -> value" and "else? -> value"
    if (node.type === "expr" && node.value.includes("? ->")) {
      const condResult = evalConditionalChain(nodes, env);
      if (condResult !== undefined) return condResult;
      return result; // all conditions false, no else
    }
    result = evalNode(node, env);
  }
  return result;
}

// Evaluate a chain of condition? -> value / else? -> value nodes
function evalConditionalChain(nodes, env) {
  for (const node of nodes) {
    if (node.type !== "expr") continue;
    const val = node.value;

    // else? -> value
    const elseMatch = val.match(/^else\?\s*->\s*(.+)$/);
    if (elseMatch) {
      return evalExpr(elseMatch[1].trim(), env);
    }

    // condition? -> value
    const condMatch = val.match(/^(.+)\?\s*->\s*(.+)$/);
    if (condMatch) {
      const cond = condMatch[1].trim();
      const body = condMatch[2].trim();
      try {
        if (evalExpr(cond, env)) {
          return evalExpr(body, env);
        }
      } catch { /* condition failed, try next */ }
    }
  }
  return undefined;
}

function evalAssert(node, env) {
  let actual, expected;
  try {
    actual = evalExpr(node.expr, env);
  } catch (e) {
    return { pass: false, expr: node.expr, expected: "?", actual: `ERROR: ${e.message}`, line: node.line };
  }
  try {
    expected = evalExpr(node.expected, env);
  } catch (e) {
    return { pass: false, expr: node.expr, expected: `ERROR: ${e.message}`, actual, line: node.line };
  }
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  return { pass, expr: node.expr, expected, actual, line: node.line };
}

function evalNode(node, env) {
  if (node.type === "binding") return evalBinding(node, env);
  if (node.type === "function") return evalFunction(node, env);
  if (node.type === "assert") return evalAssert(node, env);
  if (node.type === "expr") return evalExpr(node.value, env);
  if (node.type === "import") return null;
  return null;
}

// === PROGRAM RUNNER (mirrors eval.ben) ===

function runTests(ast) {
  const env = createEnv(null);
  const results = [];
  for (const node of ast) {
    const r = evalNode(node, env);
    if (r && r.pass !== undefined) results.push(r);
  }
  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;
  return { passed, failed, total: results.length, results };
}

// === MAIN ===

const targetFile = process.argv[2];
if (!targetFile) {
  console.error("Usage: node run_ben.mjs <file.ben>");
  process.exit(1);
}

const targetSrc = readFileSync(targetFile, "utf-8");
const ast = parse(targetSrc);

// Patch: AST parser only handles == assertions, not "is" keyword.
// Convert expr nodes that look like "fn(args) is value" into assert nodes.
for (const node of ast) {
  if (node.type === "expr") {
    const isMatch = node.value.match(/^(.+?)\s+is\s+(.+)$/);
    if (isMatch) {
      node.type = "assert";
      node.expr = isMatch[1].trim();
      node.expected = isMatch[2].trim();
    }
  }
}
const { passed, failed, total, results } = runTests(ast);

for (const r of results) {
  const icon = r.pass ? "✓" : "✗";
  const detail = r.pass ? "" : ` (got ${JSON.stringify(r.actual)})`;
  console.log(`  ${icon} line ${r.line}: ${r.expr} == ${JSON.stringify(r.expected)}${detail}`);
}

console.log(`\n${targetFile}: ${passed} passed, ${failed} failed, ${total} total`);
if (failed > 0) process.exit(1);
