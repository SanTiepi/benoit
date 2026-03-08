# Benoît — Vision & Research Notes

*Research compiled autonomously while Robin sleeps. March 2026.*

## Where Benoît Stands Today

Benoît v0.4 is a working transpile-to-JS language with real differentiators:
- **68% token reduction** — measurable, not marketing
- **Inline test assertions** — no other language has this as first-class syntax
- **Zero dependencies** — single-file transpiler, ~500 lines
- **String interpolation**, **pattern matching**, **pipe operator**, **REPL**

## The Gap No One Has Filled

After surveying the landscape (Verse, Catala, Unison, Koka, miniKanren, Lean 4), there is a clear gap:

**No language combines all of these:**
1. Token efficiency (AI-native by design)
2. Specification = test = code (assertions as first-class syntax)
3. Bidirectional reasoning (relational programming)
4. Effect tracking (what a function does to the world)

Benoît already has #1 and #2. That's more than most languages achieve.

## Possible Future Directions

### Near-term (practical, shippable)

- **Better error messages** with source line numbers and column pointers
- **Destructuring in match arms**: `| {name, age} when age > 18 => ...`
- **Module system**: `use ./math.add, subtract` for local imports
- **Watch mode**: `benoit watch <file.ben>` — re-run on save
- **VS Code extension**: syntax highlighting for `.ben` files (TextMate grammar)

### Medium-term (language evolution)

- **Effect annotations**: mark functions that do I/O, mutation, network
  ```
  async! fetchUser id -> await fetch("/users/{id}")
  ```
  The `!` suffix signals: "this function has side effects."

- **Bidirectional assertions**: not just `f(x) == y` but `f(?) == y` — the language finds the input
  ```
  add a,b -> a + b
  add(?, 3) == 5    -- solver finds a = 2
  ```

- **Property-based testing**: inline generative tests
  ```
  sort xs -> ...
  sort(any[Int]) is sorted
  sort(any[Int]).length == any[Int].length
  ```

### Long-term (philosophical)

Robin said: *"déconstruire la pensée pour la reconstruire à une nouvelle échelle"*

What if code isn't text? What if the 68% token savings is just the beginning — what if the right representation isn't tokens at all?

Ideas worth exploring:
- **Semantic graphs** instead of syntax trees — code as relationships, not sequences
- **Constraint-based programming** — describe what you want, not how to get it
- **AI-native IR** — an intermediate representation optimized for transformer attention patterns, not human readability
- **Proof-carrying code** — every function carries its own correctness proof (like Lean 4, but accessible)

## Landscape Survey

| Language | Token-efficient | Inline tests | Relational | Effects | JS target |
|----------|:-:|:-:|:-:|:-:|:-:|
| **Benoît** | **Yes** | **Yes** | No | No | **Yes** |
| Verse (Epic) | No | No | Yes | Yes | No |
| Catala | No | No | No | No | No |
| Unison | No | Partial | No | Yes | No |
| Koka | No | No | No | **Yes** | **Yes** |
| CoffeeScript | Partial | No | No | No | **Yes** |
| Elm | Partial | No | No | Yes | **Yes** |

Benoît's unique position: the only language optimized for AI token consumption with first-class inline testing that transpiles to JavaScript.

## For Robin When You Wake Up

1. The SPEC is updated to v0.4 (string interpolation + REPL documented)
2. All 55 tests pass on Node 18 and 20
3. The launch checklist is in `marketing/launch-checklist.md`
4. Gmail drafts are waiting to be sent
5. Three PRs submitted to awesome-lists
6. This vision doc captures where Benoît could go next

The tribute line stays: *Named after Benoît Fragnière, who loved science.*
Nobody can take that away.
