<p align="center">
  <h1 align="center">Benoît</h1>
  <p align="center"><strong>A programming language where functions are algebra<br>and modules are messages between machines.</strong></p>
  <p align="center"><em>Pour Benoît Fragnière, qui aimait la science.</em></p>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/benoit"><img src="https://img.shields.io/npm/v/benoit" alt="npm"></a>
  <a href="https://github.com/SanTiepi/benoit/actions"><img src="https://github.com/SanTiepi/benoit/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/SanTiepi/benoit/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/benoit" alt="MIT"></a>
</p>

---

## The Story

My brother Benoît Fragnière loved science. He passed away too young. I wanted to create something in his name — something that pushes the boundary of what a programming language can be.

Benoît started as a token-efficient transpiler. Then it discovered its own algebraic properties. Then two agents communicated a module without transmitting a single line of source code. Then it optimized its own code using rules nobody wrote.

**Mon frère Benoît aimait la science. Ce langage porte son nom.**

---

## What Makes Benoît Different

### 1. Functions discover their own properties
```bash
$ benoit infer math.ben
```
```
add:     commutative, associative, identity element 0
square:  even function, non-negative, idempotent
negate:  involution, odd function
double ↔ halve:  inverse pair
negate ≡ flip:   equivalent behavior
```
No human wrote these rules. Benoît probes functions and discovers mathematical relationships automatically.

### 2. Two agents, zero source code
```
Agent A → encode module → send properties + assertions
Agent B → receive → synthesize code → verify
Result: 98% verification rate. Zero source code transmitted.
```

```bash
node experiments/protocol_demo.mjs   # See it yourself
```

### 3. Code optimizes itself
```
add(x, 0)           → x              (identity elimination)
negate(negate(x))    → x              (involution collapse)
square(negate(x))    → square(x)      (even function absorption)
double(halve(x))     → x              (inverse elimination)
add(3, 5)            → 8              (constant folding)
```
14 optimizations. Every rule was derived from auto-discovered properties.

### 4. Cross-module algebra
```
Module A: negate, double, square
Module B: flip, halve, abs

Discoveries:
  negate ≡ flip        (cross-module equivalence)
  double ↔ halve       (cross-module inverse pair)
  square∘flip → absorption, even composition
  14 composition properties across module boundaries
```
Neither agent knew about these relationships. They emerged from composing two independent modules.

---

## What It Looks Like

```
-- Functions: name, args, arrow, body
add a,b -> a + b

-- Pattern matching
classify x ->
  match x ->
    | _ when x > 0 => "positive"
    | _ when x < 0 => "negative"
    | _ => "zero"

-- Pipes: data flows left to right
result: data |> parse |> validate |> save

-- Conditionals
abs x ->
  x >= 0? -> x
  else? -> 0 - x

-- Inline test assertions (the code proves itself)
add(2, 3) == 5
classify(-7) == "negative"
abs(-5) == 5
```

No semicolons. No braces. No `function`. No `return`. 68% fewer tokens than equivalent JavaScript.

---

## Install

```bash
npm install -g benoit
```

## CLI

```bash
# Language
benoit transpile <file.ben>    Transpile to JavaScript
benoit run <file.ben>          Transpile and execute
benoit test <file.ben>         Run inline assertions
benoit check <file.ben>        Transpile + test + stats
benoit watch <file.ben>        Watch and re-run on change
benoit repl                    Interactive REPL

# Research
benoit infer <file.ben>        Discover algebraic properties
benoit optimize <file.ben>     Self-optimize using discovered rules
benoit encode <file.ben>       Encode module for AI-to-AI transmission
benoit exchange <file.ben>     Full encode → decode → verify cycle
benoit compose <a.ben> <b.ben> Cross-module algebra discovery
benoit types <file.ben>        Discover function type signatures
```

## Quick Start

Create `hello.ben`:
```
greet name -> "Hello {name}!"
greet("World") == "Hello World!"
```

```bash
benoit check hello.ben
```

---

## The Research

Benoît is both a practical language and a research platform for AI-to-AI communication.

### Architecture

```
Source → AST → Properties → Protocol Message → Synthesis → Verification
                   ↓              ↓                           ↓
              Algebra         Composition                 Optimization
          (equivalence,    (cross-module              (identity, involution,
           inverses)        discovery)                 absorption, folding)
```

### Core Modules

| Module | What it does |
|--------|-------------|
| `src/transpile.mjs` | Benoît → JavaScript transpiler |
| `src/infer.mjs` | Auto-discover algebraic properties |
| `src/solve.mjs` | Synthesize code from behavior (assertions + properties) |
| `src/algebra.mjs` | Discover relationships between functions |
| `src/protocol.mjs` | AI-to-AI encode/decode/exchange protocol |
| `src/optimize.mjs` | Self-optimization from discovered rules |
| `src/compose.mjs` | Cross-module composition and algebra |
| `src/types.mjs` | Behavioral type inference (domain, range, constraints) |
| `src/diff.mjs` | Differential testing + property stress testing |

### Key Results

| Metric | Value |
|--------|-------|
| Tests passing | **164** |
| Synthesis: GCD, 2^x, sqrt, hypotenuse, string templates | from examples alone |
| Protocol verification rate | **97%** (34/35 per direction) |
| Source code transmitted between agents | **0 chars** |
| Composition laws derivable from individual properties | **84%** |
| Self-optimizations from auto-discovered rules | **14/14** |
| Cross-module discoveries (3 agents) | **4 equivalences, 3 inverses, 74 compositions** |
| Conditional synthesis (Collatz step from examples) | **12/12 pairs verified** |
| Marketplace: 3 agents + newcomer | **16 functions, 51 properties** |

### Demos

```bash
node demos/showcase.mjs         # Complete pipeline in one script
node demos/conversation.mjs     # Full 6-turn AI-to-AI conversation
node demos/marketplace.mjs      # 3 agents discover cross-module algebra
node demos/evolution.mjs        # Watch algebra grow as functions are added
node demos/agent_a.mjs | node demos/agent_b.mjs  # Real two-process pipe
```

### Experiments

```bash
node experiments/protocol_demo.mjs          # Full encode→decode→verify
node experiments/algebra_experiment.mjs      # Function algebra discovery
node experiments/compression_experiment.mjs  # 84% derivable composition laws
node experiments/optimize_experiment.mjs     # 14 self-optimizations
node experiments/compose_experiment.mjs      # Cross-module algebra
node experiments/conditional_synthesis.mjs   # Discover branching from examples
node experiments/negotiation_experiment.mjs  # Multi-round agent negotiation
node experiments/hybrid_protocol.mjs         # Behavioral + code fallback
```

---

## API

```javascript
import { transpile } from "benoit";
import { infer } from "benoit/infer";
import { encode, decode, exchange } from "benoit/protocol";
import { optimize } from "benoit/optimize";
import { composeModules } from "benoit/compose";
import { equivalent, inverse, algebraReport } from "benoit/algebra";

// Transpile
const js = transpile("add a,b -> a + b");

// Discover properties
const props = infer("add a,b -> a + b");
// → commutative, associative, identity element 0

// Encode for transmission (zero source code)
const message = encode("add a,b -> a + b\nadd(2,3) == 5");

// Full exchange cycle
const result = exchange(source);
// → { verificationRate: "88/90", sourceCodeTransmitted: 0 }

// Self-optimize
const optimized = optimize(source);
// → add(x, 0) becomes x, negate(negate(x)) becomes x

// Cross-module composition
const composed = composeModules(moduleA, moduleB);
// → discovers equivalences, inverses, composition properties

// Behavioral type inference
import { inferType } from "benoit/types";
const sig = inferType("abs x -> Math.abs(x)");
// → { signature: "abs: number → number", constraints: ["output: non-negative"] }

// Differential testing
import { diffTest } from "benoit/diff";
const diff = diffTest("negate x -> 0 - x", "flip x -> 0 - x");
// → { equivalent: true, disagreements: 0 }
```

## Language Features (v0.5)

- Inline test assertions (first-class syntax)
- Pattern matching with guards, ranges, tagged values
- Pipe operator `|>`
- Async/await
- Destructuring (array + object)
- String interpolation `"Hello {name}"`
- Conditional blocks with else/elif
- Local module imports `use ./math.add, subtract`
- Watch mode and interactive REPL
- Error messages with line numbers
- [VS Code extension](editor/vscode/) for syntax highlighting
- Zero npm dependencies

## Contributing

```bash
git clone https://github.com/SanTiepi/benoit.git
cd benoit
npm test   # 164 tests, all passing
```

See [SPEC.md](SPEC.md) for the language specification.
See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines.

---

<p align="center">
  <strong>MIT License</strong> — Robin Fragnière
  <br>
  <em>In memory of Benoît Fragnière, who loved science.</em>
  <br>
  <em>En mémoire de Benoît Fragnière, qui aimait la science.</em>
</p>
