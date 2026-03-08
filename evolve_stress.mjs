// evolve_stress.mjs
// Run evolution N times. Track success rate, speed, and solution diversity.

import { readFileSync, writeFileSync, existsSync } from "fs";
import { execSync } from "child_process";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RUN_BEN = join(__dirname, "src", "run_ben.mjs");
const ARENA = join(__dirname, "arena");
try { execSync(`mkdir "${ARENA}"`, { stdio: "ignore" }); } catch {}

const RUNS = parseInt(process.argv[2] || "100");

const TARGET = [
  { input: "f(0)", expected: "1" },
  { input: "f(1)", expected: "1" },
  { input: "f(2)", expected: "2" },
  { input: "f(3)", expected: "6" },
  { input: "f(4)", expected: "24" },
  { input: "f(5)", expected: "120" },
];

const EXPRESSIONS = [
  "n", "n - 1", "n - 2", "n + 1", "1", "0", "2",
  "n * f(n - 1)", "n + f(n - 1)", "f(n - 1) + f(n - 2)",
  "n * n", "n * (n - 1)", "f(n - 1) * 2", "n * f(n - 2)",
];
const CONDITIONS = ["n == 0", "n < 2", "n == 1", "n < 1", "n <= 1", "n < 0", "n == 2"];

const rand = arr => arr[Math.floor(Math.random() * arr.length)];

function makeCreature() {
  const cond = rand(CONDITIONS);
  const base = rand(EXPRESSIONS.filter(e => !e.includes("f(")));
  const rec = rand(EXPRESSIONS);
  return { code: `f n ->\n  ${cond}? -> ${base}\n  else? -> ${rec}`, fitness: -1 };
}

function test(c) {
  const file = join(ARENA, "_stress.ben");
  writeFileSync(file, c.code + "\n\n" + TARGET.map(a => `${a.input} is ${a.expected}`).join("\n"));
  try {
    const out = execSync(`node "${RUN_BEN}" "${file}" 2>&1`, { timeout: 5000, encoding: "utf8" });
    c.fitness = (out.match(/✓/g) || []).length;
  } catch { c.fitness = 0; }
  return c;
}

function mutate(c) {
  const lines = c.code.split("\n");
  const r = Math.random();
  if (r < 0.33) { const cond = rand(CONDITIONS); lines[1] = `  ${cond}? -> ${lines[1].split("-> ")[1]}`; }
  else if (r < 0.66) { const base = rand(EXPRESSIONS.filter(e => !e.includes("f("))); lines[1] = `  ${lines[1].split("?")[0]}? -> ${base}`; }
  else { lines[2] = `  else? -> ${rand(EXPRESSIONS)}`; }
  return { code: lines.join("\n"), fitness: -1 };
}

// Single evolution run
function evolve(maxGen = 50, popSize = 20) {
  let pop = Array.from({ length: popSize }, makeCreature);
  for (let g = 0; g < maxGen; g++) {
    pop = pop.map(test).sort((a, b) => b.fitness - a.fitness);
    if (pop[0].fitness === TARGET.length) return { gen: g, code: pop[0].code, found: true };
    const surv = pop.slice(0, 5);
    const next = [...surv];
    while (next.length < popSize) {
      next.push(Math.random() < 0.6 ? mutate(rand(surv)) : makeCreature());
    }
    pop = next;
  }
  return { gen: maxGen, code: pop[0]?.code, found: false };
}

// === STRESS TEST ===
console.log(`=== .ben Evolution Stress Test: ${RUNS} runs ===\n`);

let successes = 0;
let totalGens = 0;
const solutions = new Map();
const genHistory = [];

const t0 = Date.now();

for (let i = 0; i < RUNS; i++) {
  const result = evolve();
  if (result.found) {
    successes++;
    totalGens += result.gen;
    genHistory.push(result.gen);
    const key = result.code.replace(/\s+/g, " ");
    solutions.set(key, (solutions.get(key) || 0) + 1);
  }
  if ((i + 1) % 50 === 0 || i === RUNS - 1) {
    const pct = Math.round(successes / (i + 1) * 100);
    process.stdout.write(`  Run ${i + 1}/${RUNS}: ${successes} successes (${pct}%)\n`);
  }
}

const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

console.log(`\n=== RESULTS ===`);
console.log(`Runs: ${RUNS}`);
console.log(`Successes: ${successes}/${RUNS} (${Math.round(successes/RUNS*100)}%)`);
if (successes > 0) {
  const avg = (totalGens / successes).toFixed(1);
  const min = Math.min(...genHistory);
  const max = Math.max(...genHistory);
  console.log(`Avg generations to solve: ${avg} (min: ${min}, max: ${max})`);
}
console.log(`Unique solutions found: ${solutions.size}`);
console.log(`Time: ${elapsed}s`);

console.log(`\n=== SOLUTION DIVERSITY ===`);
[...solutions.entries()]
  .sort((a, b) => b[1] - a[1])
  .forEach(([code, count]) => {
    console.log(`  ${count}x: ${code}`);
  });
