// Benoit MCP Server
//
// Exposes the prompt compiler pipeline as MCP tools over stdin/stdout JSON-RPC.
// Zero dependencies — Node.js built-ins only.
//
// Tools:
//   benoit_compile  — full pipeline: encode + back-translate + quality score
//   benoit_analyze  — analyze prompt quality, return score + suggestions
//   benoit_compare  — compare two prompts, return winner + dimension breakdown

import { pipeline, analyzePrompt, comparePrompts } from "./prompt.mjs";
import { createInterface } from "node:readline";

// ---------------------------------------------------------------------------
// Tool definitions (MCP schema)
// ---------------------------------------------------------------------------

const TOOLS = [
  {
    name: "benoit_compile",
    description:
      "Run the Benoit prompt compiler pipeline. Takes user text and returns a structured result with quality score, back-translation confirmation, and ready status.",
    inputSchema: {
      type: "object",
      properties: {
        text: {
          type: "string",
          description: "The user prompt to compile",
        },
        project: {
          type: "string",
          description: "Optional project name for context",
        },
        stack: {
          type: "string",
          description: "Optional tech stack (e.g. 'node', 'python')",
        },
      },
      required: ["text"],
    },
  },
  {
    name: "benoit_analyze",
    description:
      "Analyze a prompt for quality. Returns a score (0-1), verdict, per-dimension breakdown, and actionable suggestions.",
    inputSchema: {
      type: "object",
      properties: {
        text: {
          type: "string",
          description: "The prompt text to analyze",
        },
      },
      required: ["text"],
    },
  },
  {
    name: "benoit_compare",
    description:
      "Compare two prompts and determine which is better. Returns the winner, per-dimension breakdown, and token difference.",
    inputSchema: {
      type: "object",
      properties: {
        textA: {
          type: "string",
          description: "First prompt to compare",
        },
        textB: {
          type: "string",
          description: "Second prompt to compare",
        },
      },
      required: ["textA", "textB"],
    },
  },
];

// ---------------------------------------------------------------------------
// Tool handlers
// ---------------------------------------------------------------------------

export function handleCompile(args) {
  const { text, project, stack } = args;
  const result = pipeline(text, { project, stack });
  return {
    score: result.improvement.before,
    verdict: result.verdict,
    ready: result.ready,
    confirmation: result.confirmation,
    improvement: result.improvement,
    sections: result.sections,
  };
}

export function handleAnalyze(args) {
  const { text } = args;
  return analyzePrompt(text);
}

export function handleCompare(args) {
  const { textA, textB } = args;
  return comparePrompts(textA, textB);
}

const TOOL_HANDLERS = {
  benoit_compile: handleCompile,
  benoit_analyze: handleAnalyze,
  benoit_compare: handleCompare,
};

// ---------------------------------------------------------------------------
// MCP JSON-RPC dispatcher
// ---------------------------------------------------------------------------

/**
 * Handle a single JSON-RPC request object and return a response object.
 * Exported so tests can call it directly without stdin/stdout.
 *
 * @param {object} req - Parsed JSON-RPC request
 * @returns {object} JSON-RPC response
 */
export function handleRequest(req) {
  const { id, method, params } = req;

  switch (method) {
    // ---- lifecycle ----
    case "initialize":
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: params?.protocolVersion ?? "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: {
            name: "benoit-mcp",
            version: "1.0.0",
          },
        },
      };

    case "notifications/initialized":
      // Client acknowledgement — no response needed for notifications
      return null;

    // ---- tool discovery ----
    case "tools/list":
      return {
        jsonrpc: "2.0",
        id,
        result: { tools: TOOLS },
      };

    // ---- tool execution ----
    case "tools/call": {
      const toolName = params?.name;
      const handler = TOOL_HANDLERS[toolName];

      if (!handler) {
        return {
          jsonrpc: "2.0",
          id,
          error: {
            code: -32601,
            message: `Unknown tool: ${toolName}`,
          },
        };
      }

      try {
        const toolResult = handler(params.arguments ?? {});
        return {
          jsonrpc: "2.0",
          id,
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify(toolResult, null, 2),
              },
            ],
          },
        };
      } catch (err) {
        return {
          jsonrpc: "2.0",
          id,
          result: {
            isError: true,
            content: [
              {
                type: "text",
                text: err.message,
              },
            ],
          },
        };
      }
    }

    // ---- unknown method ----
    default:
      return {
        jsonrpc: "2.0",
        id,
        error: {
          code: -32601,
          message: `Method not found: ${method}`,
        },
      };
  }
}

// ---------------------------------------------------------------------------
// stdin/stdout transport
// ---------------------------------------------------------------------------

function startServer() {
  const rl = createInterface({ input: process.stdin });

  rl.on("line", (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    let req;
    try {
      req = JSON.parse(trimmed);
    } catch {
      const errResp = {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: "Parse error" },
      };
      process.stdout.write(JSON.stringify(errResp) + "\n");
      return;
    }

    const resp = handleRequest(req);
    // Notifications return null — no response to send
    if (resp !== null) {
      process.stdout.write(JSON.stringify(resp) + "\n");
    }
  });

  rl.on("close", () => {
    process.exit(0);
  });
}

// Auto-start when run directly (not imported)
const isMain =
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"));

if (isMain) {
  startServer();
}
