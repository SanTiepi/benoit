// Benoit MCP Server v2 — Agent Communication Protocol
//
// Exposes .ben as a communication protocol over MCP (Model Context Protocol).
// Any AI agent (Claude, GPT, local LLM) that connects via MCP can:
//
//   benoit_learn   — absorb .ben source into shared knowledge
//   benoit_teach   — send .ben to another agent (delta-compressed)
//   benoit_ask     — query what an agent knows
//   benoit_verify  — verify .ben source (transpile + run assertions)
//   benoit_exchange — full round-trip: send .ben, get verified result
//
// The revolution: AI agents communicate with PROVABLE CODE, not text.
// Every message is simultaneously executable, testable, and verifiable.
//
// Zero dependencies — Node.js built-ins only.

import { Knowledge, send, receive, deltaSend, deltaReceive, exchange } from "./protocol_v2.mjs";
import { transpile, extractTests } from "./transpile.mjs";
import { createInterface } from "node:readline";

// ── Shared state: each connected agent gets a Knowledge instance ──
const agents = new Map();

function getAgent(id) {
  if (!agents.has(id)) {
    agents.set(id, new Knowledge());
  }
  return agents.get(id);
}

// ── Tool definitions ──

const TOOLS = [
  {
    name: "benoit_learn",
    description:
      "Absorb .ben source code into an agent's knowledge base. " +
      "The agent transpiles the code, verifies all assertions, and remembers every function. " +
      "Future messages to/from this agent will be delta-compressed based on what it knows.",
    inputSchema: {
      type: "object",
      properties: {
        agent_id: {
          type: "string",
          description: "Unique agent identifier (e.g. 'claude-1', 'gpt-worker-3')",
        },
        source: {
          type: "string",
          description: "Benoît source code (.ben format)",
        },
      },
      required: ["agent_id", "source"],
    },
  },
  {
    name: "benoit_teach",
    description:
      "Send .ben knowledge from one agent to another. " +
      "Only transmits what the receiver doesn't already know (delta compression). " +
      "Returns what was actually transmitted vs what was redundant.",
    inputSchema: {
      type: "object",
      properties: {
        from_agent: {
          type: "string",
          description: "Sender agent ID",
        },
        to_agent: {
          type: "string",
          description: "Receiver agent ID",
        },
        source: {
          type: "string",
          description: "Full .ben source to teach",
        },
      },
      required: ["from_agent", "to_agent", "source"],
    },
  },
  {
    name: "benoit_ask",
    description:
      "Query what an agent knows. Returns all known functions, their arities, " +
      "properties, and how many assertions have been verified.",
    inputSchema: {
      type: "object",
      properties: {
        agent_id: {
          type: "string",
          description: "Agent to query",
        },
        function_name: {
          type: "string",
          description: "Optional: ask about a specific function",
        },
      },
      required: ["agent_id"],
    },
  },
  {
    name: "benoit_verify",
    description:
      "Verify .ben source code. Transpiles to JavaScript, extracts assertions, " +
      "runs them, and returns pass/fail results. " +
      "This is zero-trust verification — the code proves itself.",
    inputSchema: {
      type: "object",
      properties: {
        source: {
          type: "string",
          description: "Benoît source code to verify",
        },
      },
      required: ["source"],
    },
  },
  {
    name: "benoit_exchange",
    description:
      "Full protocol exchange: send .ben source, get back transpiled JS, " +
      "verification results, inferred properties, and timing stats. " +
      "The .ben source IS the message — no encoding needed.",
    inputSchema: {
      type: "object",
      properties: {
        source: {
          type: "string",
          description: "Benoît source code",
        },
        agent_id: {
          type: "string",
          description: "Optional: absorb results into this agent's knowledge",
        },
      },
      required: ["source"],
    },
  },
];

// ── Tool handlers ──

function handleLearn({ agent_id, source }) {
  const agent = getAgent(agent_id);
  const before = agent.size;
  const result = agent.absorb(source);

  return {
    agent: agent_id,
    learned: agent.size - before,
    totalKnown: agent.size,
    verified: result.ok,
    assertions: {
      passed: result.assertions.passed,
      total: result.assertions.total,
    },
    functions: result.functions.map(f => f.name),
  };
}

function handleTeach({ from_agent, to_agent, source }) {
  const sender = getAgent(from_agent);
  const receiver = getAgent(to_agent);

  // Sender learns the source first
  sender.absorb(source);

  // Delta-send: only what receiver doesn't know
  const msg = deltaSend(source, receiver);
  const result = deltaReceive(msg, receiver);

  return {
    from: from_agent,
    to: to_agent,
    delta: {
      originalSize: msg.delta.originalSize,
      wireSize: msg.delta.deltaSize,
      compression: msg.delta.compression,
      skippedFunctions: msg.delta.skippedFunctions,
      skippedAssertions: msg.delta.skippedAssertions,
    },
    receiverNowKnows: receiver.size,
    verified: result.assertions.total > 0
      ? `${result.assertions.passed}/${result.assertions.total}`
      : "no assertions in delta",
    payload: msg.payload || "(nothing new)",
  };
}

function handleAsk({ agent_id, function_name }) {
  const agent = getAgent(agent_id);

  if (function_name) {
    if (!agent.knows(function_name)) {
      return { agent: agent_id, knows: false, function: function_name };
    }
    const fn = agent.functions.get(function_name);
    const assertions = agent.assertions.get(function_name);
    return {
      agent: agent_id,
      knows: true,
      function: function_name,
      arity: fn.arity,
      properties: fn.properties,
      source: fn.source,
      assertionsKnown: assertions ? [...assertions] : [],
    };
  }

  // List all known functions
  const functions = [];
  for (const [name, data] of agent.functions) {
    const assertions = agent.assertions.get(name);
    functions.push({
      name,
      arity: data.arity,
      properties: data.properties,
      assertions: assertions ? assertions.size : 0,
    });
  }

  return {
    agent: agent_id,
    totalFunctions: agent.size,
    functions,
  };
}

function handleVerify({ source }) {
  const result = receive(source);

  return {
    ok: result.ok,
    js: result.js,
    functions: result.functions.map(f => ({
      name: f.name,
      arity: f.arity,
      properties: f.properties,
    })),
    assertions: {
      passed: result.assertions.passed,
      total: result.assertions.total,
      details: result.assertions.results.map(r => ({
        line: r.line,
        expr: r.expr,
        expected: r.expected,
        actual: r.actual,
        ok: r.ok,
      })),
    },
    errors: result.errors,
  };
}

function handleExchange({ source, agent_id }) {
  const { message, result, stats } = exchange(source);

  if (agent_id) {
    getAgent(agent_id).absorb(source);
  }

  return {
    protocol: message.protocol,
    stats,
    js: result.js,
    functions: result.functions.map(f => f.name),
    assertions: {
      passed: result.assertions.passed,
      total: result.assertions.total,
    },
    ok: result.ok,
    agent: agent_id ? { id: agent_id, totalKnown: getAgent(agent_id).size } : null,
  };
}

const TOOL_HANDLERS = {
  benoit_learn: handleLearn,
  benoit_teach: handleTeach,
  benoit_ask: handleAsk,
  benoit_verify: handleVerify,
  benoit_exchange: handleExchange,
};

// ── MCP JSON-RPC dispatcher ──

export function handleRequest(req) {
  const { id, method, params } = req;

  switch (method) {
    case "initialize":
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: params?.protocolVersion ?? "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: {
            name: "benoit-protocol-v2",
            version: "2.0.0",
            description: ".ben as AI-to-AI communication protocol — code is the message, proofs are built-in",
          },
        },
      };

    case "notifications/initialized":
      return null;

    case "tools/list":
      return { jsonrpc: "2.0", id, result: { tools: TOOLS } };

    case "tools/call": {
      const toolName = params?.name;
      const handler = TOOL_HANDLERS[toolName];

      if (!handler) {
        return {
          jsonrpc: "2.0", id,
          error: { code: -32601, message: `Unknown tool: ${toolName}` },
        };
      }

      try {
        const toolResult = handler(params.arguments ?? {});
        return {
          jsonrpc: "2.0", id,
          result: {
            content: [{ type: "text", text: JSON.stringify(toolResult, null, 2) }],
          },
        };
      } catch (err) {
        return {
          jsonrpc: "2.0", id,
          result: {
            isError: true,
            content: [{ type: "text", text: err.message }],
          },
        };
      }
    }

    default:
      return {
        jsonrpc: "2.0", id,
        error: { code: -32601, message: `Method not found: ${method}` },
      };
  }
}

// ── stdin/stdout transport ──

function startServer() {
  const rl = createInterface({ input: process.stdin });

  rl.on("line", (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    let req;
    try {
      req = JSON.parse(trimmed);
    } catch {
      process.stdout.write(JSON.stringify({
        jsonrpc: "2.0", id: null,
        error: { code: -32700, message: "Parse error" },
      }) + "\n");
      return;
    }

    const resp = handleRequest(req);
    if (resp !== null) {
      process.stdout.write(JSON.stringify(resp) + "\n");
    }
  });

  rl.on("close", () => process.exit(0));
}

const isMain = process.argv[1] && (
  import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/")) ||
  import.meta.url.includes("mcp_v2.mjs")
);

if (isMain) {
  startServer();
}
