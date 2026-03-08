# Benoît

**A programming language optimized for human-AI collaboration.**

*Named after Benoît Fragnière, who loved science.*

```
-- Functions: zero ceremony
add a,b -> a + b
square x -> x * x

-- Tests live alongside code
add(2, 3) == 5
square(4) == 16

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

## Why Benoît?

| | Benoît | JavaScript |
|---|--------|------------|
| **Tokens** | 196 | 622 |
| **Noise** | 16% | 38% |
| **Lines** | 15 | 50 |

**68% fewer tokens** means AI reads and writes your code faster, cheaper, and with fewer errors.

### What makes it unique

1. **Inline test assertions** — `add(2,3) == 5` right after the function. No test file. No framework. Code proves itself.
2. **Token-optimized** — every character carries information. No semicolons, braces, `function` keywords, or `return` statements.
3. **AI-native** — designed from the ground up for how transformers process code.
4. **Full JS interop** — transpiles to standard ES modules. Use any npm package.
5. **Zero dependencies** — the entire transpiler is a single file. No build chain.

## Install

```bash
npm install -g benoit
```

## Usage

```bash
# Transpile to JavaScript
benoit transpile app.ben

# Run directly
benoit run app.ben

# Run inline tests
benoit test app.ben

# Full check: transpile + test + stats
benoit check app.ben

# Token analysis
benoit stats app.ben
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

```bash
benoit check hello.ben
```

## Language Features

### Functions
```
-- Inline
add a,b -> a + b

-- Block (last expression = return value)
process data ->
  cleaned: sanitize(data)
  validated: check(cleaned)
  validated

-- No-arg
timestamp -> Date.now()

-- Private (not exported)
_helper x -> x * 2

-- Default params
greet name="World" -> "Hello " + name

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
    | _ => "F"

-- Tagged values (algebraic types)
handle result ->
  match result ->
    | Success data => "OK: " + data
    | Error msg => "FAIL: " + msg
```

### Pipes
```
result: 5 |> double |> addOne
data |> filter isValid |> map transform |> reduce sum 0
```

### Destructuring
```
[first, ...rest]: items
{name, age}: person
```

### Inline Tests
```
add a,b -> a + b
add(2, 3) == 5
add(0, 0) == 0
add(-1, 1) == 0

square x -> x * x
square(4) == 16
square(-3) == 9
```

Run `benoit test file.ben` — each assertion runs against the transpiled code.

## API

```javascript
import { transpile, extractTests } from "benoit";

// Transpile Benoît to JavaScript
const js = transpile("add a,b -> a + b");
// → "export function add(a, b) { return a + b; }"

// Extract inline test assertions
const { assertions } = extractTests("add(2,3) == 5");
// → [{ expr: "add(2,3)", expected: "5", line: 1 }]
```

## Philosophy

Benoît was created to honor [Benoît Fragnière](https://github.com/robinfragniere/benoit), who loved science. The language embodies his spirit: elegant, efficient, and useful.

Every AI that writes code in the future will benefit from a language that respects token budgets. Every human collaborating with AI will benefit from code that reads like thought.

**68% fewer tokens is not an optimization. It's a paradigm shift.**

## License

MIT — Robin Fragnière
