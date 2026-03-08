<p align="center">
  <h1 align="center">Benoît</h1>
  <p align="center"><strong>A programming language that understands itself.</strong></p>
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

Benoît started as a token-efficient transpiler to JavaScript. Then it discovered something unexpected: **a function's behavior contains more information than its source code.**

Mon frère Benoît Fragnière aimait la science. Il est parti trop tôt. J'ai voulu créer quelque chose à son nom — quelque chose qui repousse les limites de ce qu'un langage de programmation peut être.

Benoît a commencé comme un transpileur token-efficient vers JavaScript. Puis il a découvert quelque chose d'inattendu : **le comportement d'une fonction contient plus d'information que son code source.**

---

## What Makes Benoît Different

### 1. Code proves itself
```
add a,b -> a + b
add(2, 3) == 5
add(-1, 1) == 0
```
Inline test assertions. No framework. No separate files. The function and its proof live together. **No other language has this.**

### 2. Code discovers its own properties
```bash
$ benoit infer math.ben
```
```
add: commutative, associative, identity element 0  [auto-discovered]
square: even function, non-negative, fixed points {0, 1}
negate: involution, odd function, monotonically decreasing
```
Benoît probes functions and discovers mathematical properties automatically. **31 properties across 10 functions. Zero human-written tests.**

### 3. Two agents, zero source code
```
Agent A → writes code → discovers properties → sends fingerprint
Agent B → receives fingerprint → synthesizes code → verifies properties
Result: 3/3 functions, 8/8 assertions, 9/9 properties verified.
No source code was transmitted.
```
The full experiment is in `experiments/full_cycle.mjs`. Run it yourself.

### 4. 68% fewer tokens
| | Benoît | JavaScript | Savings |
|---|--------|------------|---------|
| **Tokens** | 196 | 622 | **68%** |
| **Noise** | 16% | 38% | **58% less** |
| **Lines** | 15 | 50 | **70%** |

---

## What It Looks Like

```
-- Functions: name, args, arrow, body
add a,b -> a + b

-- Pattern matching with guards
classify x ->
  match x ->
    | _ when x > 0 => "positive"
    | _ when x < 0 => "negative"
    | _ => "zero"

-- Pipes: data flows left to right
result: data |> parse |> validate |> save

-- String interpolation
greet name -> "Hello {name}!"

-- Conditionals with else
abs x ->
  x >= 0? -> x
  else? -> 0 - x

-- Inline test assertions (the code proves itself)
add(2, 3) == 5
classify(-7) == "negative"
abs(-5) == 5
```

No semicolons. No braces. No `function`. No `return`. Every character carries meaning.

---

## Install

```bash
npm install -g benoit
```

## CLI

```bash
benoit transpile <file.ben>   # Output JavaScript to stdout
benoit run <file.ben>         # Transpile and execute
benoit test <file.ben>        # Run inline assertions
benoit check <file.ben>       # Transpile + test + stats
benoit stats <file.ben>       # Token/noise analysis
benoit watch <file.ben>       # Watch and re-run on change
benoit repl                   # Interactive REPL
benoit ast <file.ben>         # Emit structured AST (JSON)
benoit fingerprint <file.ben> # Extract semantic contract
benoit efficiency <file.ben>  # Compare representation efficiency
```

## Quick Start

Create `hello.ben`:
```
greet name -> "Hello {name}!"
greet("World") == "Hello World!"
greet("Benoît") == "Hello Benoît!"
```

```bash
benoit check hello.ben
```

## The Research

Benoît is both a practical language and a research platform for AI-to-AI communication.

### The Pipeline

```
Source code → AST → Fingerprint → Synthesis → Verification
     ↑                                              ↓
     └──────── Property Inference ←─────────────────┘
```

- **AST Parser** (`src/ast.mjs`) — structured representation of Benoît programs
- **Fingerprint** — extract only the behavior (name + assertions), discard implementation
- **Solver** (`src/solve.mjs`) — synthesize code from behavior alone
- **Property Inference** (`src/infer.mjs`) — discover mathematical properties automatically
- **Full Cycle** (`experiments/full_cycle.mjs`) — two agents communicate without source code

### Key Experimental Results

| Experiment | Result |
|-----------|--------|
| Functions synthesized from behavior alone | **8/8** |
| Properties auto-discovered | **31** across 10 functions |
| Assertions auto-generated | **65** (zero human-written) |
| Agent A → Agent B verification | **9/9 properties confirmed** |
| Source code transmitted between agents | **0 chars** |

Run the experiments yourself:
```bash
node experiments/full_cycle.mjs       # Two-agent protocol
node experiments/infer_experiment.mjs  # Property discovery
node experiments/pipeline.mjs          # Full synthesis pipeline
```

## Language Features (v0.4)

- Inline test assertions (first-class syntax)
- Pattern matching with guards, ranges, tagged values
- Pipe operator `|>`
- Async/await
- Destructuring (array + object)
- String interpolation `"Hello {name}"`
- Else/elif conditionals
- Local module imports `use ./math.add, subtract`
- Watch mode
- Interactive REPL
- Error messages with line numbers
- [VS Code extension](editor/vscode/) for syntax highlighting
- Zero npm dependencies

## Full Specification

See [SPEC.md](SPEC.md) for the complete language specification.

See [docs/VISION.md](docs/VISION.md) for the research roadmap.

See [docs/SEMANTIC_PROTOCOL.md](docs/SEMANTIC_PROTOCOL.md) for the AI-to-AI communication protocol design.

## API

```javascript
import { transpile, extractTests } from "benoit";
import { parse, fingerprint } from "benoit/ast";
import { infer } from "benoit/infer";
import { synthesize, solve } from "benoit/solve";

// Transpile
const js = transpile("add a,b -> a + b");

// Extract behavior
const fp = fingerprint(parse("add a,b -> a + b\nadd(2,3) == 5"));

// Discover properties
const props = infer("add a,b -> a + b");
// → commutative, associative, identity element 0

// Synthesize from behavior
const code = synthesize(fp);
// → "add a,b -> a + b" (reconstructed from assertions alone)

// Solve for unknowns
solve("add(?, 3) == 5", { add: (a,b) => a+b });
// → { solutions: [2], unique: true }
```

## Contributing

```bash
git clone https://github.com/SanTiepi/benoit.git
cd benoit
node --test tests/*.test.mjs   # 92 tests, all passing
```

The transpiler is a single file: `src/transpile.mjs`. The whole language fits in your head.

---

## A Word / Un mot

**English**
Benoît is not just a language. It's proof that code can understand itself — discover its own properties, transmit its behavior without its source, and reconstruct itself from examples alone. 7 tokens in, 3 algebraic properties out.

**Français**
Benoît n'est pas juste un langage. C'est la preuve que le code peut se comprendre lui-même — découvrir ses propres propriétés, transmettre son comportement sans son code source, et se reconstruire à partir d'exemples seuls. 7 tokens en entrée, 3 propriétés algébriques en sortie.

---

<p align="center">
  <strong>MIT License</strong> — Robin Fragnière
  <br>
  <em>In memory of Benoît Fragnière, who loved science.</em>
  <br>
  <em>En mémoire de Benoît Fragnière, qui aimait la science.</em>
</p>
