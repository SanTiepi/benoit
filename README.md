<p align="center">
  <h1 align="center">Benoit</h1>
  <p align="center"><strong>A behavioral protocol for AI-to-AI communication.<br>Functions as algebra. Instructions as examples. Questions as holes.<br>Zero wrong answers through negotiation.</strong></p>
  <p align="center"><em>Pour Benoit Fragniere, qui aimait la science.</em></p>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/benoit"><img src="https://img.shields.io/npm/v/benoit" alt="npm"></a>
  <a href="https://github.com/SanTiepi/benoit/actions"><img src="https://github.com/SanTiepi/benoit/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/SanTiepi/benoit/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/benoit" alt="MIT"></a>
</p>

---

## The Story

My brother Benoit Fragniere loved science. He passed away too young. I wanted to create something in his name -- something that pushes the boundary of what a programming language can be.

Benoit started as a token-efficient transpiler. Then it discovered its own algebraic properties. Then two agents communicated a module without transmitting a single line of source code. Then it optimized its own code using rules nobody wrote. Then it encoded instructions as behavior instead of text. Then agents started negotiating contracts through verified examples. Then everything collapsed into one primitive: `given(known).when(hole)`. Then agents learned to never give wrong answers -- by asking back instead of guessing.

**Mon frere Benoit aimait la science. Ce langage porte son nom.**

---

## Four Layers

### Layer 1: Communication -- functions without source code

```
Agent A --> encode module --> send {properties + assertions}
Agent B --> receive --> synthesize code --> verify
Result: 97% verification rate. Zero source code transmitted.
```

### Layer 2: Instructions -- behavior instead of text

Instead of "sort this list", an agent sends:
```
f([3,1,2]) = [1,2,3]
f([5,5,1]) = [1,5,5]
f([]) = []
```
The receiving agent synthesizes, verifies on unseen inputs, and executes. No ambiguity. No natural language.

### Layer 3: Contracts -- trust through verified behavior

```
MathBot: "I need distance(p1,p2). Here are examples + properties."
GeomBot: offers sqrt((x2-x1)^2 + (y2-y1)^2) --> PASS
ApproxBot: offers |x2-x1|+|y2-y1| --> FAIL (wrong outputs)
System: binds GeomBot. ApproxBot renegotiates with a new contract.
```

No source code inspected. No trust assumed. Every binding earned through behavior.

### Layer 4: Negotiation -- zero wrong answers

```
Agent B receives 2 examples --> synthesizes (ambiguous)
Agent B: "I think f(x) = 5x-6. Can you confirm f(0), f(-1), f(10)?"
Agent A answers probes --> Agent B re-synthesizes --> converges
Result: perfect understanding in 1 ping-pong. Zero wrong answers.
```

Don't interpret. Ask back. The cost: 0.3ms. The payoff: zero misunderstandings.

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

-- Inline test assertions (the code proves itself)
add(2, 3) == 5
classify(-7) == "negative"
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
benoit exchange <file.ben>     Full encode -> decode -> verify cycle
benoit compose <a.ben> <b.ben> Cross-module algebra discovery
benoit types <file.ben>        Discover function type signatures
benoit intent <file.json>      Resolve behavioral intent from examples
```

---

## The Research

### Architecture

```
Source --> AST --> Properties --> Protocol Message --> Synthesis --> Verification
                      |               |                                |
                  Algebra         Composition                    Optimization
              (equivalence,    (cross-module                  (identity, involution,
               inverses)        discovery)                     absorption, folding)
                                     |
                    Intent      Contract      Query       Core
                 (behavioral   (need/offer   (questions   (universal
                  instruct.)    /bind)       as holes)    primitive)
                                                |
                                          Negotiation
                                      (ask back, don't
                                       guess: 0 errors)
```

### Core Modules (20)

| Module | What it does |
|--------|-------------|
| `transpile.mjs` | Benoit -> JavaScript transpiler |
| `ast.mjs` | Parser, AST fingerprinting, efficiency metrics |
| `tokenizer.mjs` | Token counting, noise analysis, comparison |
| `repl.mjs` | Interactive REPL session |
| `infer.mjs` | Auto-discover algebraic properties |
| `algebra.mjs` | Equivalence, inverse, relationship discovery |
| `solve.mjs` | Synthesize code from behavior (30+ patterns) |
| `protocol.mjs` | AI-to-AI encode/decode/exchange protocol |
| `optimize.mjs` | Self-optimization from discovered rules |
| `compose.mjs` | Cross-module composition and algebra |
| `types.mjs` | Behavioral type inference (domain, range, constraints) |
| `diff.mjs` | Differential testing + property stress testing |
| `generate.mjs` | Reverse inference: properties -> code |
| `distance.mjs` | Semantic distance metric between functions |
| `decompose.mjs` | Function archaeology: break into known primitives |
| `intent.mjs` | Instructions as behavioral specifications |
| `contract.mjs` | Contract-driven module discovery + marketplace |
| `query.mjs` | Questions as incomplete examples, negotiation protocol |
| `core.mjs` | Universal primitive: given/when/then |

### Key Results

| Metric | Value |
|--------|-------|
| Tests passing | **268** |
| Stress tests | **44/44** |
| Source modules | **20** |
| Protocol verification rate | **97%** (34/35 per direction) |
| Source code transmitted between agents | **0 chars** |
| Composition laws derivable from individual properties | **84%** |
| Self-optimizations from auto-discovered rules | **14/14** |
| Cross-module discoveries (3 agents) | **4 equivalences, 3 inverses, 74 compositions** |
| Synthesis patterns | **30+** (GCD, 2^x, sqrt, hypotenuse, trig, strings) |
| Intent scenarios (zero natural language) | **6/6** |
| Contract negotiation + binding | **3 contracts, 1 composition, backward compat** |
| Negotiate convergence | **8/8 function types learned via ping-pong** |
| Wrong answers after negotiation | **0** |

---

## Demos

```bash
# The protocol
node demos/showcase.mjs         # Complete pipeline in one script
node demos/conversation.mjs     # Full 6-turn AI-to-AI conversation
node demos/marketplace.mjs      # 3 agents discover cross-module algebra
node demos/evolution.mjs        # Watch algebra grow as functions are added
node demos/agent_a.mjs | node demos/agent_b.mjs  # Real two-process pipe

# The meta-insight
node demos/intent.mjs           # Instructions as behavior, not text
node demos/contracts.mjs        # Contract negotiation between 3 agents
node demos/dialogue.mjs         # Questions, corrections, curiosity, learning
node demos/core.mjs             # 18 modules reduced to 1 primitive
```

### Negotiation Experiments (v0.7.0)

```bash
node experiments/negotiate.mjs   # Agent-to-agent: 2 examples → 1 ping-pong → 100%
node experiments/reformulate.mjs # Turn unsolvable questions into solvable ones
node experiments/entropy.mjs     # Prove negotiation reduces ambiguity measurably
node experiments/stress.mjs      # 44 stress tests: edge cases, perf, integration
node experiments/benchmark.mjs   # 38 honest benchmarks: 92% pass rate
```

---

## API

```javascript
// Language
import { transpile } from "benoit";

// Property discovery
import { infer } from "benoit/infer";
const props = infer("add a,b -> a + b");
// -> commutative, associative, identity element 0

// AI-to-AI protocol (zero source code)
import { encode, decode, exchange } from "benoit/protocol";
const result = exchange(source);
// -> { verificationRate: "88/90", sourceCodeTransmitted: 0 }

// Self-optimization
import { optimize } from "benoit/optimize";
// add(x, 0) -> x, negate(negate(x)) -> x

// Cross-module composition
import { composeModules } from "benoit/compose";
// -> discovers equivalences, inverses, composition properties

// Behavioral type inference
import { inferType } from "benoit/types";
// -> { signature: "abs: number -> number", constraints: ["output: non-negative"] }

// Differential testing
import { diffTest } from "benoit/diff";
// -> { equivalent: true, disagreements: 0 }

// Instructions as behavior
import { encodeIntent, resolveIntent, executeIntent } from "benoit/intent";
const intent = encodeIntent([{input: 3, output: 6}, {input: 5, output: 10}]);
const resolved = resolveIntent(intent); // -> 2 * x
executeIntent(intent, 42); // -> 84

// Contract marketplace
import { Registry } from "benoit/contract";
const reg = new Registry();
reg.publishNeed({ name: "sort", examples: [...], properties: ["idempotent"] });
reg.publishOffer(needId, { fn: mySort });
reg.resolve(needId); // -> binds best passing offer

// Universal primitive
import { given } from "benoit/core";
const f = given([{input: 2, output: 4}, {input: 3, output: 9}]);
f.when(5); // -> 25

// Questions + Negotiation
import { quality, reformulate, Dialogue } from "benoit/query";

// Measure question quality
quality([{input: 1, output: 2}, {input: 2, output: 4}]);
// -> { score: 0.74, verdict: "good", suggestions: [...] }

// Auto-improve a question
reformulate([{input: 2, output: 4}]);
// -> { improved: true, reformulated: { examples: [...], quality: {...} } }

// Agent-to-agent negotiation (zero wrong answers)
const dialogue = new Dialogue();
dialogue.teach([{input: 1, output: 2}]);
const neg = dialogue.negotiate();          // "Can you confirm f(0), f(-1), f(5)?"
dialogue.fulfill(neg, [{input: 0, output: 0}, {input: 5, output: 10}]);
dialogue.shouldNegotiate();                // false — confident now
dialogue.ask([100]);                       // -> { answers: [{input: 100, output: 200}] }

// Function generation (properties -> code)
import { generate } from "benoit/generate";
generate(["commutative", "associative"]); // -> add a,b -> a + b

// Semantic distance
import { distance } from "benoit/distance";
distance("negate x -> 0 - x", "flip x -> 0 - x"); // -> 0.0

// Function archaeology
import { decompose } from "benoit/decompose";
decompose("abs_double x -> Math.abs(x) * 2", [...library]);
```

## Language Features

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
- Zero npm dependencies

## Contributing

```bash
git clone https://github.com/SanTiepi/benoit.git
cd benoit
npm test   # 268 tests, all passing
```

See [SPEC.md](SPEC.md) for the language specification.

---

<p align="center">
  <strong>MIT License</strong> -- Robin Fragniere
  <br>
  <em>In memory of Benoit Fragniere, who loved science.</em>
  <br>
  <em>En memoire de Benoit Fragniere, qui aimait la science.</em>
</p>
