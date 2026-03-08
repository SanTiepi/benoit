# Toward a Semantic Protocol for AI-to-AI Communication

*Research document — Robin Fragnière & Claude, March 2026*

## The Problem

When two AI agents communicate today:
```
Agent A → serialize to text → tokenize → send → detokenize → parse → Agent B
```

This is like two mathematicians communicating by writing essays about equations instead of just sharing the equations.

## Layer 1: Semantic Compression (NOW — Benoît v0.4)

Benoît already reduces the text layer:
- 68% fewer tokens = 68% less noise between agents
- Inline assertions = intent + proof travel together
- Pattern matching = decision trees expressed directly

**Next step for Benoît**: an `--emit-ast` mode that outputs the abstract syntax tree as JSON instead of JavaScript. Two Benoît-aware agents could exchange ASTs instead of source code.

```
benoit ast file.ben → structured intent graph (JSON)
benoit from-ast graph.json → executable code
```

The AST IS the semantic protocol for code. No parsing needed on the receiving end.

## Layer 2: Intent Graphs (MEDIUM TERM)

Instead of text prompts, agents exchange typed intent structures:

```json
{
  "intent": "transform",
  "input": {"type": "list", "element": "number"},
  "output": {"type": "list", "element": "number", "constraint": "sorted"},
  "confidence": 0.95,
  "alternatives": [
    {"method": "quicksort", "complexity": "O(n log n)", "stable": false},
    {"method": "mergesort", "complexity": "O(n log n)", "stable": true}
  ]
}
```

This is:
- **Typed** — no ambiguity about what "sort" means
- **Rich** — carries alternatives and confidence
- **Compact** — ~200 bytes vs ~2000 tokens of text explanation
- **Bidirectional** — the receiving agent can query: "give me the stable one"

### How to build it with Benoît

Benoît's syntax already maps cleanly to intent graphs:

```
sort xs -> ...
sort(any[Int]) is sorted           -- output constraint
sort(any[Int]).length == xs.length  -- invariant
```

The inline assertions ARE the contract. They describe what the function does, not how. An agent receiving this knows:
- Input: list of integers
- Output: sorted list, same length
- Proof: two testable properties

**This is already a semantic protocol.** We just need to formalize it.

## Layer 3: Shared Embedding Space (LONG TERM)

The ultimate goal: agents share meaning directly through vectors, not text.

### The Bootstrap Problem

You can't build a shared embedding space without a shared vocabulary.
You can't build a shared vocabulary without a shared understanding.
You can't build a shared understanding without... communication.

### The Solution: Grounded Semantics

1. Start with executable code (Benoît) — meaning is grounded in behavior
2. Two agents run the same code, observe the same results
3. The code + results = shared ground truth
4. Build vector mappings FROM this ground truth
5. Once enough concepts are grounded, switch to direct vector exchange

This is how humans learn language too:
- Point at object → say word → shared meaning
- For agents: run code → observe result → shared concept

### Benoît as Rosetta Stone

Benoît's inline assertions make it uniquely suited for this:

```
fibonacci 0 == 0
fibonacci 1 == 1
fibonacci 10 == 55
```

These aren't just tests. They're **grounding examples**. Any agent, regardless of architecture, can:
1. Read the assertions
2. Understand what `fibonacci` means by example
3. Build an internal representation of the concept
4. Share THAT representation instead of the code

## Concrete Roadmap

### Phase 1 (v0.5): AST Exchange
- `benoit ast` command — emit structured AST as JSON
- `benoit from-ast` — reconstruct from AST
- Agents exchange ASTs instead of source code
- Measure: token reduction vs text, round-trip fidelity

### Phase 2 (v0.6): Contract Protocol
- Formalize inline assertions as typed contracts
- Add property-based descriptions: `sort(any[Int]) is sorted`
- Agents negotiate by exchanging contracts, not implementations
- "I need a function that satisfies these properties" → agent provides one

### Phase 3 (v1.0): Semantic Bridge
- Map Benoît AST nodes to embedding vectors
- Build cross-model translation layer
- Two different AI models exchange meaning through Benoît as intermediary
- Benoît becomes the Rosetta Stone between AI architectures

## Why Benoît is the Right Starting Point

| Property | Why it matters for semantic protocol |
|----------|--------------------------------------|
| Token-efficient | Less noise in the channel |
| Inline assertions | Meaning is grounded in behavior |
| Transpiles to JS | Universal execution target |
| ~500 lines | Any AI can hold it entirely in context |
| Zero dependencies | No external state to synchronize |

The language that's small enough for an AI to fully understand is the language that can bridge between AIs.

---

*Named after Benoît Fragnière, who loved science.*
*He would have loved this question.*
