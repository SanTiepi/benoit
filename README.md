<p align="center">
  <h1 align="center">Benoît</h1>
  <p align="center"><strong>A programming language for the age of AI.</strong></p>
  <p align="center"><em>Pour Benoît Fragnière, qui aimait la science.</em></p>
</p>

---

## The Story

My brother Benoît Fragnière loved science. He passed away too young. I wanted to create something in his name that would be useful to the world — something that every developer and every AI could benefit from.

Today, AI writes millions of lines of code. Every line costs tokens. Every token costs time, energy, and money. What if there was a language that cut that cost by 68%?

That's Benoît.

Mon frère Benoît Fragnière aimait la science. Il est parti trop tôt. J'ai voulu créer quelque chose à son nom qui soit utile au monde entier — quelque chose dont chaque développeur et chaque IA pourrait bénéficier.

Aujourd'hui, l'IA écrit des millions de lignes de code. Chaque ligne coûte des tokens. Chaque token coûte du temps, de l'énergie et de l'argent. Et s'il existait un langage qui réduisait ce coût de 68% ?

C'est Benoît.

---

## What It Looks Like

```
-- Define a function: just name, args, arrow, body
add a,b -> a + b

-- Tests live right next to the code. No framework needed.
add(2, 3) == 5
add(-1, 1) == 0

-- Pattern matching with guards
classify x ->
  match x ->
    | _ when x > 0 => "positive"
    | _ when x < 0 => "negative"
    | _ => "zero"

-- Pipes: data flows left to right
result: data |> filter isValid |> map transform

-- Async: just add the keyword
async fetchUser id -> await db.get(id)
```

That's it. No semicolons. No braces. No `function`. No `return`. Every character carries meaning.

## Why It Matters

| | Benoît | JavaScript | Savings |
|---|--------|------------|---------|
| **Tokens** | 196 | 622 | **68%** |
| **Noise** | 16% | 38% | **58% less** |
| **Lines** | 15 | 50 | **70%** |

*Measured on a real-world rate limiter module.*

When AI reads and writes code, **every saved token** means:
- Faster responses
- Lower costs
- Less energy consumed
- Fewer errors

Multiply that by billions of AI-generated code blocks per day. That's the impact.

## What Makes It Unique

### 1. Code proves itself
```
add a,b -> a + b
add(2, 3) == 5
add(0, 0) == 0
add(-1, 1) == 0
```
Inline test assertions. No test file. No test framework. The function and its proof live together. **No other programming language has this.**

### 2. AI-native by design
Every syntax choice was made to minimize tokens for transformers. Not as an afterthought — as the core design principle.

### 3. Full power, zero ceremony
Pattern matching with guards and ranges. Pipes. Async/await. Destructuring. Closures. Factories. All in a syntax that reads like pseudocode.

### 4. Zero dependencies
The entire transpiler is a single file (~500 lines). No npm install chain. No build step. It just works.

### 5. Full JavaScript interop
Benoît transpiles to standard ES modules. Use any npm package. Deploy anywhere Node.js runs.

---

## Install

```bash
npm install -g benoit
```

## Quick Start

Create `hello.ben`:
```
-- Hello world in Benoît
greet name -> "Hello, " + name + "!"

-- Prove it works
greet("World") == "Hello, World!"
greet("Benoît") == "Hello, Benoît!"
```

Run it:
```bash
benoit check hello.ben
```

Output:
```
--- Transpiled JS ---
export function greet(name) { return "Hello, " + name + "!"; }

--- Inline tests (2) ---
  ✓ greet("World") == "Hello, World!"
  ✓ greet("Benoît") == "Hello, Benoît!"

Result: 2/2 assertions passed
```

## CLI

```bash
benoit transpile <file.ben>   # Output JavaScript to stdout
benoit run <file.ben>         # Transpile and execute
benoit test <file.ben>        # Run inline assertions
benoit check <file.ben>       # Transpile + test + stats
benoit stats <file.ben>       # Token/noise analysis
```

## Language Reference

### Functions
```
-- Inline (single expression)
add a,b -> a + b
square x -> x * x

-- Block (multi-line, last expression = return value)
process data ->
  cleaned: sanitize(data)
  validated: check(cleaned)
  validated

-- No arguments
timestamp -> Date.now()

-- Default parameters
greet name="World" -> "Hello " + name

-- Private (not exported, _ prefix)
_helper x -> x * 2

-- Async
async fetchData url -> await fetch(url)
```

### Pattern Matching
```
-- Block form
httpStatus code ->
  match code ->
    | 200 => "OK"
    | 404 => "Not Found"
    | 500 => "Internal Error"
    | _ => "Unknown"

-- Inline form
label x -> match x | 1 => "one" | 2 => "two" | _ => "other"

-- Guard clauses
classify x ->
  match x ->
    | _ when x > 0 => "positive"
    | _ when x < 0 => "negative"
    | _ => "zero"

-- Range patterns
grade score ->
  match score ->
    | 90..100 => "A"
    | 80..89 => "B"
    | 70..79 => "C"
    | _ => "F"

-- Tagged values (algebraic types)
handle result ->
  match result ->
    | Success data => "OK: " + data
    | Error msg => "FAIL: " + msg
    | _ => "unknown"
```

### Pipes
```
result: 5 |> double |> addOne
data |> filter isValid |> map transform
```

### Bindings & Destructuring
```
name: "Benoît"
count: 42
store: Map
[first, ...rest]: items
{name, age}: person
```

### Loops
```
items each x -> process(x)
map each k,v -> console.log(k, v)
```

### Conditionals
```
x > 0? console.log("positive")
```

### Fallback Chains
```
resolve a,b,c -> a | b | c
```

### Imports
```
use crypto.randomUUID
```

### Inline Tests
```
add a,b -> a + b
add(2, 3) == 5
add(0, 0) == 0

square x -> x * x
square(4) == 16
square(-3) == 9
```

## API

```javascript
import { transpile, extractTests } from "benoit";

const js = transpile("add a,b -> a + b");
// → "export function add(a, b) { return a + b; }"

const { assertions } = extractTests("add(2,3) == 5");
// → [{ expr: "add(2,3)", expected: "5", line: 1 }]
```

## Full Specification

See [SPEC.md](SPEC.md) for the complete language specification.

---

## Contributing

Benoît is open source and welcomes contributions from humans and AIs alike.

```bash
git clone https://github.com/SanTiepi/benoit.git
cd benoit
node --test tests/*.test.mjs   # 46 tests, all passing
```

The transpiler is a single file: `src/transpile.mjs`. Read it. It's ~500 lines. You'll understand the whole language in 10 minutes.

---

## A Word / Un mot

**English**
68% fewer tokens is not an optimization. It's a new way of thinking about code. When humans and AI collaborate, every wasted character is wasted energy. Benoît removes the waste.

**Français**
68% de tokens en moins, ce n'est pas une optimisation. C'est une nouvelle façon de penser le code. Quand les humains et l'IA collaborent, chaque caractère gaspillé est de l'énergie gaspillée. Benoît supprime le gaspillage.

**Deutsch**
68% weniger Tokens ist keine Optimierung. Es ist eine neue Art, über Code nachzudenken. Wenn Menschen und KI zusammenarbeiten, ist jedes verschwendete Zeichen verschwendete Energie. Benoît beseitigt die Verschwendung.

**Español**
68% menos tokens no es una optimización. Es una nueva forma de pensar el código. Cuando humanos e IA colaboran, cada carácter desperdiciado es energía desperdiciada. Benoît elimina el desperdicio.

**日本語**
トークン68%削減は最適化ではありません。コードについての新しい考え方です。人間とAIが協力するとき、無駄な文字はすべて無駄なエネルギーです。Benoîtは無駄を取り除きます。

**中文**
减少68%的token不是优化，而是一种思考代码的新方式。当人类与AI协作时，每一个浪费的字符都是浪费的能量。Benoît消除了浪费。

---

<p align="center">
  <strong>MIT License</strong> — Robin Fragnière
  <br>
  <em>In memory of Benoît Fragnière, who loved science.</em>
  <br>
  <em>En mémoire de Benoît Fragnière, qui aimait la science.</em>
</p>
