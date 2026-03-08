#!/usr/bin/env node

// Benoit Prompt Compiler — CLI Hook
//
// Designed to run as a pre-send hook in Claude Code, Cursor, or any agent system.
// Reads prompt from stdin (or --text arg), runs pipeline(), outputs result.
//
// Exit codes:
//   0 = prompt passes quality gate
//   1 = prompt BLOCKED (below threshold)
//   2 = error
//
// Usage:
//   echo "Build me an API" | benoit-hook
//   benoit-hook --text "Build me an API"
//   benoit-hook --text "Build me an API" --min-score 0.6 --json
//   benoit-hook --text "Build me an API" --silent   # only exit code, no output

import { pipeline, analyzePrompt } from "../src/prompt.mjs";

const args = process.argv.slice(2);

// Parse flags
const flags = {};
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--text" && args[i + 1]) flags.text = args[++i];
  else if (args[i] === "--min-score" && args[i + 1]) flags.minScore = parseFloat(args[++i]);
  else if (args[i] === "--json") flags.json = true;
  else if (args[i] === "--silent") flags.silent = true;
  else if (args[i] === "--help" || args[i] === "-h") flags.help = true;
  else if (args[i] === "--confirm") flags.confirm = true;
}

if (flags.help) {
  console.log(`Benoit Prompt Compiler — CLI Hook

Usage:
  echo "your prompt" | benoit-hook
  benoit-hook --text "your prompt"

Options:
  --text <text>       Prompt text (or pipe via stdin)
  --min-score <n>     Minimum score to pass (default: 0.4)
  --json              Output as JSON
  --silent            No output, only exit code
  --confirm           Show back-translation for confirmation
  --help              Show this help

Exit codes:
  0  Prompt passes quality gate
  1  Prompt BLOCKED (below threshold)
  2  Error`);
  process.exit(0);
}

// Read input
let text = flags.text;
if (!text) {
  // Read from stdin
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  text = Buffer.concat(chunks).toString("utf8").trim();
}

if (!text) {
  if (!flags.silent) console.error("No input provided. Use --text or pipe via stdin.");
  process.exit(2);
}

// Run pipeline
const minScore = flags.minScore ?? 0.4;
const result = pipeline(text);
const passes = result.encoded.analysis.score >= minScore;

if (flags.json) {
  const output = {
    passes,
    score: result.encoded.analysis.score,
    verdict: result.verdict,
    ready: result.ready,
    intent: result.sections.intent,
    warnings: result.encoded.warnings,
    tokens: result.encoded.analysis.metrics.estimatedTokens,
  };
  if (flags.confirm) output.confirmation = result.confirmation;
  console.log(JSON.stringify(output));
} else if (!flags.silent) {
  const icon = passes ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m";
  const scoreStr = `${(result.encoded.analysis.score * 100).toFixed(0)}%`;
  console.log(`${icon} Benoit: ${scoreStr} (${result.verdict})`);

  if (flags.confirm) {
    console.log("\n" + result.confirmation);
  }

  if (!passes) {
    console.log("\n\x1b[33mWarnings:\x1b[0m");
    for (const w of result.encoded.warnings.slice(0, 5)) {
      console.log(`  ! ${w}`);
    }
  }
}

process.exit(passes ? 0 : 1);
