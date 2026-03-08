#!/usr/bin/env node

// Benoit Prompt Pipeline Demo
//
// Shows the full cycle:
//   user prompt → Benoit encode → back-translate → confirm → send
//
// The entire loop stays sender-side. The agent never sees ambiguity.

import { pipeline, analyzePrompt, comparePrompts } from "../src/prompt.mjs";

const CYAN = "\x1b[36m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

function header(text) {
  console.log(`\n${BOLD}${CYAN}═══ ${text} ═══${RESET}\n`);
}

function bar(score) {
  const filled = Math.round(score * 20);
  const empty = 20 - filled;
  const color = score >= 0.6 ? GREEN : score >= 0.4 ? YELLOW : RED;
  return `${color}${"█".repeat(filled)}${DIM}${"░".repeat(empty)}${RESET} ${(score * 100).toFixed(0)}%`;
}

// ── Scenario 1: Vague prompt ──────────────────────────────

header("Scenario 1: Vague User Prompt");

const vague = "Make a nice dashboard that shows building data and handles everything properly";

console.log(`${DIM}User types:${RESET}`);
console.log(`  "${vague}"\n`);

const result1 = pipeline(vague);

console.log(`${YELLOW}⚠ Benoit analysis:${RESET}`);
console.log(`  Score: ${bar(result1.encoded.analysis.score)} (${result1.verdict})`);
console.log(`  Ready to send: ${result1.ready ? `${GREEN}YES` : `${RED}NO`}${RESET}`);
console.log();
console.log(`${YELLOW}Warnings:${RESET}`);
for (const w of result1.encoded.warnings) {
  console.log(`  ! ${w}`);
}
console.log();
console.log(`${CYAN}Back-translation (shown to user):${RESET}`);
console.log(result1.confirmation.split("\n").map(l => `  ${l}`).join("\n"));

// ── Scenario 2: Rich prompt ──────────────────────────────

header("Scenario 2: Well-Structured User Prompt");

const rich = `Build a portfolio dashboard for SwissBuilding.

## Data Model:
- Building: id, address, value, type (residential/commercial)
- Portfolio: id, buildings[], totalValue, performance

## API Endpoints:
- GET /api/portfolio/:id -> returns portfolio with buildings
- GET /api/portfolio/:id/performance -> returns 30-day performance data
- POST /api/portfolio/:id/rebalance -> triggers rebalancing

## Tests:
- GET /api/portfolio/1 should return status 200 with buildings list
- GET /api/portfolio/999 should return 404
- Empty portfolio returns { buildings: [], totalValue: 0 }
- POST /api/portfolio/1/rebalance must return 202 (async)
- Verify that unauthorized access returns 403

## Business Logic:
- Calculate ROI: ((currentValue - purchasePrice) / purchasePrice) * 100
- Aggregate by building type
- Flag underperforming buildings (ROI < 2%)

## Error Handling:
- Invalid portfolio ID returns 400
- Auth failure returns 401/403
- Timeout after 5s returns 504
- Empty state shows placeholder, not error`;

console.log(`${DIM}User types a structured prompt...${RESET}\n`);

const result2 = pipeline(rich, { project: "SwissBuilding", stack: "node" });

console.log(`${GREEN}✓ Benoit analysis:${RESET}`);
console.log(`  Score: ${bar(result2.encoded.analysis.score)} (${result2.verdict})`);
console.log(`  Ready to send: ${result2.ready ? `${GREEN}YES` : `${RED}NO`}${RESET}`);
console.log();
console.log(`${CYAN}Back-translation (shown to user):${RESET}`);
console.log(result2.confirmation.split("\n").map(l => `  ${l}`).join("\n"));

// ── Scenario 3: Comparison ───────────────────────────────

header("Scenario 3: Side-by-Side Comparison");

const comp = comparePrompts(vague, rich);

console.log(`  Prompt A (vague):      ${bar(comp.a.score)} — ${comp.a.tokens} tokens`);
console.log(`  Prompt B (structured): ${bar(comp.b.score)} — ${comp.b.tokens} tokens`);
console.log(`  Winner: ${BOLD}${comp.winner === "B" ? GREEN : RED}${comp.winner}${RESET}`);
console.log();
console.log(`  ${DIM}Dimension breakdown:${RESET}`);
for (const [dim, data] of Object.entries(comp.comparison)) {
  const winColor = data.winner === "B" ? GREEN : data.winner === "A" ? RED : DIM;
  console.log(`    ${dim.padEnd(14)} A: ${(data.a * 100).toFixed(0).padStart(3)}%  B: ${(data.b * 100).toFixed(0).padStart(3)}%  ${winColor}→ ${data.winner}${RESET}`);
}

// ── Scenario 4: The pipeline as quality gate ─────────────

header("Scenario 4: Quality Gate");

const prompts = [
  "do stuff",
  "Build a REST API for users",
  "Create a user CRUD API with GET/POST/PUT/DELETE endpoints. Each should return appropriate status codes. Test that invalid input returns 400.",
  rich,
];

console.log(`  ${DIM}Simulating 4 prompts going through the gate:${RESET}\n`);

for (const p of prompts) {
  const r = pipeline(p);
  const preview = p.length > 60 ? p.slice(0, 57) + "..." : p;
  const gate = r.ready ? `${GREEN}✓ PASS` : `${RED}✗ BLOCK`;
  console.log(`  ${gate}${RESET}  ${r.encoded.analysis.score.toFixed(2)} (${r.verdict.padEnd(12)})  "${preview}"`);
}

// ── Scenario 5: The full sender-side loop ────────────────

header("Scenario 5: Sender-Side Correction Loop");

console.log(`  ${DIM}Step 1: User writes vague prompt${RESET}`);
let userPrompt = "I want a nice API that handles user management properly";
let attempt = pipeline(userPrompt);
console.log(`  Score: ${bar(attempt.encoded.analysis.score)} — ${attempt.ready ? "ready" : `${RED}BLOCKED${RESET}`}`);
console.log(`  Warnings: ${attempt.encoded.warnings.slice(0, 2).join("; ")}`);
console.log();

console.log(`  ${DIM}Step 2: User sees back-translation, rewrites${RESET}`);
userPrompt = `Build a user management API.
- GET /users -> returns list of users (status 200)
- POST /users -> creates user, expects {name, email}, returns 201
- DELETE /users/:id -> removes user, returns 204
- Must validate email format
- Must return 400 for invalid input
- Must return 404 for missing user
- Empty database returns []`;
attempt = pipeline(userPrompt);
console.log(`  Score: ${bar(attempt.encoded.analysis.score)} — ${attempt.ready ? `${GREEN}READY${RESET}` : "blocked"}`);
console.log();

console.log(`  ${DIM}Step 3: Agent receives clean prompt (no ping-pong needed)${RESET}`);
console.log(`  Intent: ${attempt.sections.intent}`);
console.log(`  Constraints: ${attempt.sections.constraints.length}`);
console.log(`  Criteria: ${attempt.sections.criteria.length}`);

// ── Summary ──────────────────────────────────────────────

header("Summary");

console.log(`  The entire quality loop stays ${BOLD}sender-side${RESET}.`);
console.log(`  The agent receives a perfect prompt.`);
console.log(`  No clarification. No wasted tokens. No misunderstanding.`);
console.log();
console.log(`  ${DIM}pipeline() is a pure function: ~1ms, zero network calls.${RESET}`);
console.log(`  ${DIM}It's a prompt compiler: catch errors before execution.${RESET}`);
console.log();
