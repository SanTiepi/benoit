// evolve.mjs
// A self-evolving .ben machine.
// It writes .ben code, tests it, mutates it, keeps the best.
// No human in the loop. No API. Pure local evolution.

import { readFileSync, writeFileSync } from "fs";
import { execSync } from "child_process";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RUN_BEN = join(__dirname, "src", "run_ben.mjs");
const ARENA = join(__dirname, "arena");

// Ensure arena directory exists
try { execSync(`mkdir "${ARENA}"`, { stdio: "ignore" }); } catch {}

// === THE GENOME: a .ben program is a sequence of functions + assertions ===

// A creature is: { functions: [...], assertions: [...], fitness: number }

// Target: discover a function that computes factorial
// The machine doesn't know factorial. It only knows the FITNESS (pass/fail).

const TARGET_ASSERTIONS = [
  { input: "f(0)", expected: "1" },
  { input: "f(1)", expected: "1" },
  { input: "f(2)", expected: "2" },
  { input: "f(3)", expected: "6" },
  { input: "f(4)", expected: "24" },
  { input: "f(5)", expected: "120" },
];

// === GENE POOL: building blocks the machine can combine ===
const EXPRESSIONS = [
  "n",
  "n - 1",
  "n - 2",
  "n + 1",
  "1",
  "0",
  "2",
  "n * f(n - 1)",
  "n + f(n - 1)",
  "f(n - 1) + f(n - 2)",
  "n * n",
  "n * (n - 1)",
  "f(n - 1) * 2",
  "n * f(n - 2)",
];

const CONDITIONS = [
  "n == 0",
  "n < 2",
  "n == 1",
  "n < 1",
  "n <= 1",
  "n < 0",
  "n == 2",
];

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// === GENERATE A RANDOM CREATURE ===
function randomCreature() {
  const cond = randomChoice(CONDITIONS);
  const base = randomChoice(EXPRESSIONS.filter(e => !e.includes("f(")));
  const recurse = randomChoice(EXPRESSIONS);

  // Structure: max 2 branches (the .ben way)
  const code = [
    `f n ->`,
    `  ${cond}? -> ${base}`,
    `  else? -> ${recurse}`,
  ].join("\n");

  return { code, fitness: -1 };
}

// === TEST A CREATURE: run it through .ben and count passes ===
function testCreature(creature) {
  const assertions = TARGET_ASSERTIONS
    .map(a => `${a.input} is ${a.expected}`)
    .join("\n");

  const fullCode = creature.code + "\n\n" + assertions;
  const file = join(ARENA, "_test.ben");
  writeFileSync(file, fullCode);

  try {
    const output = execSync(`node "${RUN_BEN}" "${file}" 2>&1`, {
      timeout: 5000,
      encoding: "utf8",
    });

    const passed = (output.match(/✓/g) || []).length;
    const failed = (output.match(/✗/g) || []).length;
    creature.fitness = passed;
    creature.output = output.trim().split("\n").slice(-1)[0];
  } catch (e) {
    creature.fitness = 0;
    creature.output = "crash";
  }

  return creature;
}

// === MUTATE: change one gene ===
function mutate(creature) {
  const lines = creature.code.split("\n");
  const mutation = Math.random();

  if (mutation < 0.33) {
    // Mutate condition
    const cond = randomChoice(CONDITIONS);
    lines[1] = `  ${cond}? -> ${lines[1].split("-> ")[1]}`;
  } else if (mutation < 0.66) {
    // Mutate base case
    const base = randomChoice(EXPRESSIONS.filter(e => !e.includes("f(")));
    lines[1] = `  ${lines[1].split("?")[0]}? -> ${base}`;
  } else {
    // Mutate recursive case
    const recurse = randomChoice(EXPRESSIONS);
    lines[2] = `  else? -> ${recurse}`;
  }

  return { code: lines.join("\n"), fitness: -1 };
}

// === CROSSOVER: combine two creatures ===
function crossover(a, b) {
  const linesA = a.code.split("\n");
  const linesB = b.code.split("\n");

  // Take condition from A, base from B (or vice versa)
  if (Math.random() < 0.5) {
    linesA[2] = linesB[2]; // swap recursive case
  } else {
    linesA[1] = linesB[1]; // swap base case
  }

  return { code: linesA.join("\n"), fitness: -1 };
}

// === EVOLUTION LOOP ===
const POP_SIZE = 20;
const MAX_GENERATIONS = 50;

console.log("=== .ben Evolution Machine ===");
console.log(`Target: discover f(n) = n!`);
console.log(`Population: ${POP_SIZE} | Max generations: ${MAX_GENERATIONS}`);
console.log(`Gene pool: ${EXPRESSIONS.length} expressions, ${CONDITIONS.length} conditions`);
console.log("");

// Initial population
let population = Array.from({ length: POP_SIZE }, () => randomCreature());

let bestEver = { fitness: -1 };
let generation = 0;

while (generation < MAX_GENERATIONS) {
  // Test everyone
  population = population.map(c => testCreature(c));

  // Sort by fitness (best first)
  population.sort((a, b) => b.fitness - a.fitness);

  const best = population[0];

  if (best.fitness > bestEver.fitness) {
    bestEver = { ...best };
    console.log(`Gen ${generation}: NEW BEST fitness=${best.fitness}/${TARGET_ASSERTIONS.length} | ${best.output}`);
    console.log(`  Code: ${best.code.replace(/\n/g, " | ")}`);
  } else if (generation % 10 === 0) {
    console.log(`Gen ${generation}: best=${best.fitness}/${TARGET_ASSERTIONS.length} (no improvement)`);
  }

  // Perfect score? Stop.
  if (best.fitness === TARGET_ASSERTIONS.length) {
    console.log(`\n*** SOLUTION FOUND at generation ${generation}! ***`);
    console.log(`\nThe machine discovered:\n`);
    console.log(best.code);
    console.log(`\n${best.output}`);

    // Save the winning creature
    const winner = best.code + "\n\n" +
      TARGET_ASSERTIONS.map(a => `${a.input} is ${a.expected}`).join("\n") +
      "\n\n-- Discovered by evolution. No human wrote this.\n" +
      `-- Generation: ${generation}\n`;
    writeFileSync(join(ARENA, "winner.ben"), winner);
    console.log(`\nSaved to arena/winner.ben`);
    break;
  }

  // === NATURAL SELECTION ===
  // Keep top 25%
  const survivors = population.slice(0, Math.ceil(POP_SIZE / 4));

  // Fill rest with mutations and crossovers
  const nextGen = [...survivors];

  while (nextGen.length < POP_SIZE) {
    const r = Math.random();
    if (r < 0.4) {
      // Mutate a survivor
      nextGen.push(mutate(randomChoice(survivors)));
    } else if (r < 0.7) {
      // Crossover two survivors
      nextGen.push(crossover(randomChoice(survivors), randomChoice(survivors)));
    } else {
      // Fresh random (immigration)
      nextGen.push(randomCreature());
    }
  }

  population = nextGen;
  generation++;
}

if (bestEver.fitness < TARGET_ASSERTIONS.length) {
  console.log(`\nEvolution ended. Best fitness: ${bestEver.fitness}/${TARGET_ASSERTIONS.length}`);
  console.log(`Best code: ${bestEver.code.replace(/\n/g, " | ")}`);
}
