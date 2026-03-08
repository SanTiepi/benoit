#!/usr/bin/env node

// Test the extension without VSCode runtime
// Mocks the vscode API, then verifies the extension activates and commands work.

import { createRequire } from "module";
import assert from "node:assert/strict";

// ── Mock VSCode API ────────────────────────────────────────

const subscriptions = [];
const commands = {};
const diagnostics = new Map();
let statusBarState = {};
let outputLines = [];

const mockVscode = {
  window: {
    createOutputChannel: () => ({
      appendLine: (line) => outputLines.push(line),
      clear: () => { outputLines = []; },
      show: () => {},
      dispose: () => {},
    }),
    createStatusBarItem: () => {
      const item = {
        text: "",
        tooltip: "",
        command: "",
        backgroundColor: undefined,
        show: () => { statusBarState = { ...item }; },
        dispose: () => {},
      };
      return item;
    },
    showInputBox: async () => "Build a REST API for users",
    showWarningMessage: async () => "Show Details",
    showInformationMessage: async () => "Show Back-Translation",
    onDidChangeActiveTextEditor: (cb) => ({ dispose: () => {} }),
  },
  workspace: {
    getConfiguration: () => ({
      get: (key) => {
        if (key === "autoAnalyze") return true;
        if (key === "minScore") return 0.4;
        if (key === "showBackTranslation") return true;
        return undefined;
      },
    }),
    onDidSaveTextDocument: (cb) => ({ dispose: () => {} }),
  },
  languages: {
    createDiagnosticCollection: () => ({
      set: (uri, diags) => diagnostics.set(uri, diags),
      delete: (uri) => diagnostics.delete(uri),
      dispose: () => {},
    }),
  },
  commands: {
    registerCommand: (id, handler) => {
      commands[id] = handler;
      return { dispose: () => {} };
    },
  },
  env: {
    clipboard: {
      writeText: async () => {},
    },
  },
  StatusBarAlignment: { Right: 2 },
  ThemeColor: class ThemeColor { constructor(id) { this.id = id; } },
  Range: class Range { constructor(a, b, c, d) { this.start = { line: a, char: b }; this.end = { line: c ?? a, char: d ?? b }; } },
  Diagnostic: class Diagnostic { constructor(range, msg, sev) { this.range = range; this.message = msg; this.severity = sev; } },
  DiagnosticSeverity: { Error: 0, Warning: 1, Hint: 2, Information: 3 },
};

// Register the mock before requiring the extension
const require = createRequire(import.meta.url);
const Module = require("module");
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  if (request === "vscode") return request;
  return origResolve.call(this, request, ...args);
};
require.cache.vscode = { id: "vscode", exports: mockVscode, loaded: true, filename: "vscode" };

// Now load the extension
// We need to put it in the require cache properly
const mod = new Module("vscode");
mod.exports = mockVscode;
mod.loaded = true;
require.cache["vscode"] = mod;

const ext = require("./extension.js");

// ── Tests ──────────────────────────────────────────────────

console.log("Testing VSCode extension...\n");

// Test 1: activate
const context = { subscriptions };
ext.activate(context);
assert.ok(outputLines.includes("Benoit Prompt Compiler activated"), "should log activation");
console.log("  [PASS] activate()");

// Test 2: commands registered
assert.ok("benoit.compilePrompt" in commands, "compilePrompt registered");
assert.ok("benoit.compileSelection" in commands, "compileSelection registered");
assert.ok("benoit.analyzeFile" in commands, "analyzeFile registered");
console.log("  [PASS] commands registered (3)");

// Test 3: compilePrompt runs the pipeline
outputLines = [];
await commands["benoit.compilePrompt"]();
const hasOutput = outputLines.some(l => l.includes("Benoit Prompt Compilation"));
assert.ok(hasOutput, "compilePrompt should produce output");
console.log("  [PASS] compilePrompt() produces output");

// Test 4: status bar updates
assert.ok(statusBarState.text, "status bar should have text");
assert.ok(statusBarState.text.includes("Benoit"), "status bar should mention Benoit");
console.log(`  [PASS] status bar: "${statusBarState.text}"`);

// Test 5: deactivate
ext.deactivate();
console.log("  [PASS] deactivate()");

// Test 6: CJS lib works standalone
const { pipeline, analyzePrompt } = require("./lib/prompt.cjs");
const vague = pipeline("do stuff");
assert.ok(!vague.ready, "vague prompt should be blocked");
const rich = pipeline("Build API.\n- GET /users -> returns list\n## Tests:\n- should return 200\n- invalid returns 400\n## Errors:\n- empty returns []\n- auth failure returns 403");
assert.ok(rich.ready, "rich prompt should pass");
console.log("  [PASS] pipeline() quality gate works");

console.log("\n6/6 tests passed. Extension ready for packaging.");
