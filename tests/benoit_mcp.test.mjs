// Tests for benoit MCP server handlers
// Tests the JSON-RPC dispatch directly — no stdin/stdout needed.

import { strict as assert } from "node:assert";
import { handleRequest, handleCompile, handleAnalyze, handleCompare } from "../src/mcp.mjs";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (err) {
    failed++;
    console.log(`  FAIL  ${name}`);
    console.log(`        ${err.message}`);
  }
}

console.log("\nbenoit MCP server tests\n");

// ---------------------------------------------------------------------------
// initialize
// ---------------------------------------------------------------------------

test("initialize returns protocol version and capabilities", () => {
  const resp = handleRequest({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: "2024-11-05" },
  });
  assert.equal(resp.jsonrpc, "2.0");
  assert.equal(resp.id, 1);
  assert.equal(resp.result.protocolVersion, "2024-11-05");
  assert.ok(resp.result.capabilities.tools);
  assert.equal(resp.result.serverInfo.name, "benoit-mcp");
});

// ---------------------------------------------------------------------------
// notifications/initialized
// ---------------------------------------------------------------------------

test("notifications/initialized returns null (no response)", () => {
  const resp = handleRequest({
    jsonrpc: "2.0",
    method: "notifications/initialized",
  });
  assert.equal(resp, null);
});

// ---------------------------------------------------------------------------
// tools/list
// ---------------------------------------------------------------------------

test("tools/list returns three tools", () => {
  const resp = handleRequest({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/list",
  });
  assert.equal(resp.id, 2);
  const names = resp.result.tools.map((t) => t.name);
  assert.deepEqual(names, ["benoit_compile", "benoit_analyze", "benoit_compare"]);
});

test("each tool has inputSchema with required fields", () => {
  const resp = handleRequest({ jsonrpc: "2.0", id: 3, method: "tools/list" });
  for (const tool of resp.result.tools) {
    assert.ok(tool.inputSchema, `${tool.name} missing inputSchema`);
    assert.ok(tool.inputSchema.properties, `${tool.name} missing properties`);
    assert.ok(Array.isArray(tool.inputSchema.required), `${tool.name} missing required`);
  }
});

// ---------------------------------------------------------------------------
// tools/call — benoit_compile
// ---------------------------------------------------------------------------

test("benoit_compile returns structured result via tools/call", () => {
  const resp = handleRequest({
    jsonrpc: "2.0",
    id: 10,
    method: "tools/call",
    params: {
      name: "benoit_compile",
      arguments: {
        text: "Build a REST API for todo items with GET /todos and POST /todos",
      },
    },
  });
  assert.equal(resp.id, 10);
  assert.ok(!resp.error, "unexpected error");
  assert.equal(resp.result.content[0].type, "text");

  const payload = JSON.parse(resp.result.content[0].text);
  assert.ok(typeof payload.score === "number");
  assert.ok(typeof payload.verdict === "string");
  assert.ok(typeof payload.ready === "boolean");
  assert.ok(typeof payload.confirmation === "string");
  assert.ok(payload.improvement);
  assert.ok(payload.sections);
});

// ---------------------------------------------------------------------------
// tools/call — benoit_analyze
// ---------------------------------------------------------------------------

test("benoit_analyze returns score and suggestions", () => {
  const resp = handleRequest({
    jsonrpc: "2.0",
    id: 20,
    method: "tools/call",
    params: {
      name: "benoit_analyze",
      arguments: { text: "Make something nice" },
    },
  });
  assert.equal(resp.id, 20);
  const payload = JSON.parse(resp.result.content[0].text);
  assert.ok(typeof payload.score === "number");
  assert.ok(Array.isArray(payload.suggestions));
  assert.ok(payload.suggestions.length > 0, "vague prompt should have suggestions");
  assert.ok(payload.details);
});

test("benoit_analyze gives higher score to structured prompt", () => {
  const vague = handleAnalyze({ text: "Make something nice" });
  const good = handleAnalyze({
    text: [
      "Build a user auth service",
      "- POST /auth/login => {token}",
      "- POST /auth/register => {user}",
      "Test: POST /auth/login with valid creds should return 200",
      "Error: invalid password returns 401",
    ].join("\n"),
  });
  assert.ok(good.score > vague.score, `good (${good.score}) should beat vague (${vague.score})`);
});

// ---------------------------------------------------------------------------
// tools/call — benoit_compare
// ---------------------------------------------------------------------------

test("benoit_compare returns winner and dimension breakdown", () => {
  const resp = handleRequest({
    jsonrpc: "2.0",
    id: 30,
    method: "tools/call",
    params: {
      name: "benoit_compare",
      arguments: {
        textA: "Make a nice API",
        textB: "Build REST API: GET /items returns [{id,name}], POST /items creates item, test: GET /items should return 200",
      },
    },
  });
  assert.equal(resp.id, 30);
  const payload = JSON.parse(resp.result.content[0].text);
  assert.ok(payload.winner === "B", `expected B to win, got ${payload.winner}`);
  assert.ok(payload.comparison);
  assert.ok(typeof payload.tokenDiff === "number");
  assert.ok(payload.a && payload.b);
});

// ---------------------------------------------------------------------------
// direct handler exports
// ---------------------------------------------------------------------------

test("handleCompile is callable directly", () => {
  const result = handleCompile({ text: "Create a CLI tool that parses CSV files" });
  assert.ok(typeof result.score === "number");
  assert.ok(typeof result.confirmation === "string");
});

test("handleCompare is callable directly", () => {
  const result = handleCompare({ textA: "do stuff", textB: "do stuff" });
  assert.equal(result.winner, "tie");
});

// ---------------------------------------------------------------------------
// error handling
// ---------------------------------------------------------------------------

test("unknown tool returns error", () => {
  const resp = handleRequest({
    jsonrpc: "2.0",
    id: 99,
    method: "tools/call",
    params: { name: "nonexistent_tool", arguments: {} },
  });
  assert.ok(resp.error);
  assert.equal(resp.error.code, -32601);
});

test("unknown method returns error", () => {
  const resp = handleRequest({
    jsonrpc: "2.0",
    id: 100,
    method: "bogus/method",
  });
  assert.ok(resp.error);
  assert.equal(resp.error.code, -32601);
});

// ---------------------------------------------------------------------------
// summary
// ---------------------------------------------------------------------------

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
