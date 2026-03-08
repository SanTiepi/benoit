# Benoît Language Specification v0.4

*Named after Benoît Fragnière, who loved science.*

Benoît is a programming language designed for human-AI collaboration. It transpiles to JavaScript, achieving **68% token reduction** with **zero npm dependencies**.

## Design Principles

1. **Every character carries information** — no syntactic noise
2. **AI-native** — optimized for transformer token consumption
3. **Code proves itself** — inline test assertions live alongside definitions
4. **Zero ceremony** — no semicolons, no braces, no `function` keyword
5. **JavaScript interop** — full access to Node.js ecosystem

## Syntax Reference

### Comments
```
-- This is a comment
```
Transpiles to: `// This is a comment`

### Functions

**Inline (single expression):**
```
add a,b -> a + b
square x -> x * x
```
→ `export function add(a, b) { return a + b; }`

**Block (multi-line):**
```
process data ->
  result: transform(data)
  validate(result)
  result
```
→ Last expression is implicitly returned.

**No-argument:**
```
now -> Date.now()
```

**Default parameters:**
```
greet name="World" -> "Hello " + name
```

**Private functions (not exported):**
```
_helper x -> x * 2
```
Underscore prefix suppresses `export`.

### Async/Await
```
async fetchData url -> await fetch(url)

async processAll items ->
  result: await Promise.all(items)
  result
```

### Bindings
```
name: "Benoît"
count: 42
threshold: Math.max(a, b)
```
→ `export const name = "Benoît";` (top-level = exported, block = local)

### Type Instantiation
```
store: Map
items: Set
queue: Array
```
→ `const store = new Map();`

### Destructuring
```
[first, ...rest]: items
{name, age}: person
```
→ `const [first, ...rest] = items;`

### Conditionals

**Shorthand (no arrow):**
```
x > 0? console.log("positive")
```

**With arrow:**
```
x > 0? -> console.log("positive")
```

**Block conditional:**
```
x > 0? ->
  console.log("positive")
  process(x)
```

### Loops

**Key-value iteration:**
```
map each k,v -> console.log(k, v)
```

**Single element:**
```
items each x -> process(x)

items each item ->
  validate(item)
  store(item)
```

### Pipe Operator
```
result: 5 |> double |> addOne
data |> filter isValid |> map transform
```
→ `addOne(double(5))` / `map(filter(data, isValid), transform)`

### Fallback Chains
```
resolve a,b,c -> a | b | c
```
→ `a || b || c`

### Pattern Matching

**Block form:**
```
classify x ->
  match x ->
    | 1 => "one"
    | 2 => "two"
    | _ => "other"
```
→ Ternary chain: `(x === 1 ? "one" : x === 2 ? "two" : "other")`

**Inline form:**
```
label x -> match x | 1 => "one" | 2 => "two" | _ => "other"
```

**With guard clauses:**
```
classify x ->
  match x ->
    | _ when x > 0 => "positive"
    | _ when x < 0 => "negative"
    | _ => "zero"
```

**Range patterns:**
```
grade score ->
  match score ->
    | 90..100 => "A"
    | 80..89 => "B"
    | 70..79 => "C"
    | _ => "F"
```

**Tagged values (algebraic types):**
```
handle result ->
  match result ->
    | Success data => "OK: " + data
    | Error reason => "FAIL: " + reason
    | _ => "unknown"
```
Expects `{ tag: "Success", value: "done" }` shape.

### String Interpolation
```
name: "World"
greeting: "Hello {name}!"
msg: "Result: {2 + 2}"
```
→ `` export const greeting = `Hello ${name}!`; ``

Double-quoted strings containing `{expr}` are converted to JavaScript template literals. Plain strings without braces remain unchanged.

### Imports
```
use crypto.randomUUID
```
→ `import { randomUUID } from "node:crypto";`

### Inline Test Assertions
```
add a,b -> a + b
add(2, 3) == 5
add(-1, 1) == 0
add(0, 0) == 0
```

Tests live alongside code. Run with `benoit test <file.ben>`.
No other language has this — code proves itself.

## CLI

```
benoit transpile <file.ben>   # Output JavaScript to stdout
benoit run <file.ben>         # Transpile and execute
benoit test <file.ben>        # Run inline assertions
benoit check <file.ben>       # Transpile + test + stats
benoit stats <file.ben>       # Token/noise analysis
benoit repl                   # Interactive REPL
```

### REPL

Start an interactive session with `benoit repl`. Type Benoît code and see it transpiled and evaluated immediately.

- Lines ending with `->` start multi-line mode; enter a blank line to execute
- Type `.exit` or press Ctrl+C to quit

## Token Efficiency

| Metric | Benoît | JavaScript | Savings |
|--------|--------|------------|---------|
| Tokens | 196 | 622 | **68%** |
| Noise | 16% | 38% | **58% less** |
| Lines | 15 | 50 | **70%** |

*Measured on a real-world rate limiter module.*

## File Extension

`.ben`

## License

MIT — Robin Fragnière
