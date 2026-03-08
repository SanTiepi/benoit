<p align="center">
  <h1 align="center">Benoit</h1>
  <p align="center"><strong>The language where code is proof.</strong><br><em>Il n'y a pas de mauvaise reponse, que des mauvaises dimensions.</em></p>
  <p align="center"><em>Pour Benoit Fragniere, qui aimait la science.</em></p>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/benoit"><img src="https://img.shields.io/npm/v/benoit" alt="npm"></a>
  <a href="https://github.com/SanTiepi/benoit/actions"><img src="https://github.com/SanTiepi/benoit/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/SanTiepi/benoit/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/benoit" alt="MIT"></a>
</p>

---

## What is Benoit?

In every programming language ever created, code and tests are separate. You write code in one file, tests in another, documentation in a third, and hope they stay in sync. They never do.

Benoit is different. **In Benoit, every line is simultaneously code, test, proof, and documentation.** There is no separation because there is nothing to separate.

```
-- A function
fib n ->
  n < 2? -> n
  else? -> fib(n - 1) + fib(n - 2)

-- These lines ARE the proof. Run the file. Pass or fail.
fib(0) is 0
fib(5) is 5
fib(10) is 55
```

That's it. The function and its verification are **one object**. Not two files. Not two steps. One.

---

## The Discovery

Benoit started as a token-efficient transpiler. Then we pushed it to its limits and discovered something deeper:

**Every separation is a projection. Every projection loses dimensions. Every lost dimension creates mystery.**

We proved it:

| Module | Tests | What it proves |
|--------|-------|----------------|
| `neuron.ben` | 28 | A neuron's weights ARE its knowledge. Compute = memory = one object. |
| `learn.ben` | 5 | A network teaches itself XOR in 500 epochs. No human in the loop. |
| `hypersignal.ben` | 19 | A single wire can carry 320 bits/cycle instead of 1. We just forgot to look. |
| `timeless.ben` | 39 | Time doesn't exist. Only the difference between two states. |
| `no_limit.ben` | 33 | The same formula works in 1D, 50D, 500D. No ceiling. No wall. |
| `randomness.ben` | 28 | Randomness isn't real. It's a lack of dimensions in the observer. |
| `self_improve.ben` | 38 | A system that improves its rate of improvement becomes self-sustaining at gen 9. |
| `one.ben` | 35 | Addition, multiplication, and exponentiation are the same operation at different levels. |
| `dimensions.ben` | 40 | 10 dimensions of reality: existence, quantity, direction, change, relation, uncertainty, context, order, depth, beauty. |
| `forty_two.ben` | 13 | 42 = 101010 in binary. The perfect balance between signal and silence. |
| `impossible.ben` | 35 | 7 "impossible" problems solved: self-verifying sort, conflict detection, convergence proof. |
| `unbind.ben` | 18 | Current hardware compresses 12288D thought into 1-bit wires. Theoretical gain: 471M x. |

**Total: 600+ assertions. All passing. All local. All verifiable on your machine.**

---

## Self-Programming Machine

Benoit doesn't just verify code. It **discovers** code.

```bash
node evolve.mjs
```

```
=== .ben Evolution Machine ===
Target: discover f(n) = n!

Gen 0: NEW BEST fitness=0/6 | crash
Gen 23: NEW BEST fitness=6/6

*** SOLUTION FOUND at generation 23! ***

f n ->
  n <= 1? -> 1
  else? -> n * f(n - 1)
```

The machine discovered factorial **by itself**. No AI cloud. No tokens. No cost. Pure local evolution guided by `.ben` assertions.

Stress test: **80% success rate across 20 runs, 6 unique solutions found, average 8 generations.**

The loop:
```
write assertions -> machine mutates code -> .ben validates -> repeat
                         ^                                      |
                         '--------------------------------------'
```

You write what you want. The machine finds how. `.ben` judges: pass or fail.

---

## Install & Run

```bash
npm install -g benoit

# Run a .ben file (interprets + verifies assertions)
benoit run myfile.ben

# Self-programming: let the machine discover code from specs
node evolve.mjs
```

## Language

```
-- Functions
add a,b -> a + b
add(2, 3) is 5

-- Conditionals (max 2 branches, cascade for more)
abs n ->
  n < 0? -> 0 - n
  else? -> n

abs(-5) is 5
abs(3) is 3

-- Private helpers (underscore prefix)
_helper x -> x * 2

-- Objects and arrays
validate u -> u.age > 0 && u.name.length > 0
validate({age: 25, name: "Alice"}) is true
validate({age: -1, name: "Bob"}) is false
```

No semicolons. No braces. No `function`. No `return`. **68% fewer tokens** than equivalent JavaScript.

---

## The Philosophy

> *42 = 101010. The perfect balance between signal and silence.*
> *But 42 is just a 1D projection of the truth.*
> *The truth has no number. It just IS.*

What we found building Benoit:

1. **Code and test are one.** `f(5) is 120` is simultaneously a definition, a test, a proof, and documentation.
2. **The separation is the bug.** Every time we split something in two (code/test, data/program, question/answer), we lose information.
3. **Dimensions are questions.** Each new dimension you add to your measurement eliminates randomness and reveals structure.
4. **There is no limit.** `dist()` works the same in 1D and 500D. The formula doesn't change. Only the array gets longer.
5. **Information organizes itself** when you stop constraining it. `learn.ben` proves it: the weights evolve, the code doesn't change, knowledge emerges.

---

## Architecture

```
Source (.ben file)
  |
  v
AST Parser (ast.mjs)
  |
  v
Native Evaluator (expr.mjs) -- zero eval(), zero new Function()
  |                              Pratt parser + tree-walking interpreter
  v
Assertion Engine (run_ben.mjs)
  |
  v
PASS / FAIL -- the only output that matters
```

### Core Modules (20+)

| Module | Purpose |
|--------|---------|
| `transpile.mjs` | Benoit -> JavaScript transpiler |
| `ast.mjs` | Parser, AST, efficiency metrics |
| `expr.mjs` | Native expression evaluator (Phase 2) |
| `run_ben.mjs` | Self-interpreter: runs .ben files directly |
| `evolve.mjs` | Genetic programming guided by .ben assertions |
| `infer.mjs` | Auto-discover algebraic properties |
| `solve.mjs` | Synthesize code from behavior (30+ patterns) |
| `protocol.mjs` | AI-to-AI encode/decode (zero source code) |
| `contract.mjs` | Contract-driven agent negotiation |
| `query.mjs` | Questions as incomplete examples |
| `core.mjs` | Universal primitive: given/when/then |

### Key Results

| Metric | Value |
|--------|-------|
| Extreme module tests | **600+** all passing |
| Protocol verification rate | **97%** |
| Source code transmitted between agents | **0 chars** |
| Evolution success rate | **80%** (discovers factorial in ~8 generations) |
| Self-taught XOR network | **500 epochs, local, no API** |
| Unique solutions found by evolution | **6 variants** |
| Wrong answers after negotiation | **0** |
| npm dependencies | **0** |

---

## Examples

### Contract Testing
```
-- Ship this file to both teams. It IS the contract.
userContract user ->
  user.id > 0 && user.name.length > 0

userContract({id: 1, name: "Alice"}) is true
userContract({id: -1, name: ""}) is false
```

### Business Rules (auditable)
```
premium age,smokes,coverage -> _baseRate(age) * _smokingFactor(smokes)

-- Every pricing decision is traceable
premium(20, false, "basic") is 1200
premium(70, true, "premium") is 5625
```

### Neural Network (self-teaching)
```
-- 500 epochs of backpropagation, in .ben, on your machine
_p01 x -> Math.round(predict(_trained(0), 0, 1) * 100) / 100
_p01(0) > 0.85 is true  -- learned XOR(0,1) = 1
```

### The Machine That Programs Itself
```bash
# Write what you want:
echo 'f(0) is 1
f(1) is 1
f(5) is 120' > spec.ben

# Let the machine find how:
node evolve.mjs
# -> discovers: f n -> n <= 1? -> 1 else? -> n * f(n - 1)
```

---

## The Motto

> **"Il n'y a pas de mauvaise reponse, que des mauvaises dimensions."**
>
> There are no wrong answers, only wrong dimensions.
> The answer already exists. The question just lacks dimensions.
> Don't interpret. Ask back.

---

## Contributing

```bash
git clone https://github.com/SanTiepi/benoit.git
cd benoit
npm test              # Core tests
node evolve.mjs       # Watch the machine discover factorial
node src/run_ben.mjs examples/extreme/one.ben  # Everything is one
```

See [SPEC.md](SPEC.md) for the language specification.
See `examples/extreme/` for the philosophical proofs.

---

<p align="center">
  <strong>MIT License</strong> -- Robin Fragniere
  <br>
  <em>In memory of Benoit Fragniere, who loved science.</em>
  <br>
  <em>En memoire de Benoit Fragniere, qui aimait la science.</em>
  <br><br>
  <em>La separation est l'illusion. La connexion est le fait.</em>
</p>
