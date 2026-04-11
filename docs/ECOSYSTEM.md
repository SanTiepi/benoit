# The Ecosystem

*Everything that grew from a language where code is proof.*

---

## Direct Derivatives

### The Brain

A self-modifying neural brain written in C and CUDA. 45 million neurons, 102 million synapses, 17 autonomous cognitive mechanisms, powered by a local 72B language model. The brain learned by executing `.ben` assertion files — the same syntax that proves code correctness became the teaching signal for a neural network.

Ran from January to March 2026 on a dedicated RTX PRO 6000 server. Stopped after recognizing convergence with Google Brain's approach at industrial scale.

**[Full story &rarr;](BRAIN.md)**

---

### Benoit Ecosystem (5-System Proof Engine)

A 5-system proof engine built on top of the language. 911 tests across:

| System | Purpose |
|--------|---------|
| **Core** | Compiler, AST, transpiler, runtime — the foundation |
| **ProofOps** | Proof pipeline, sandbox, observatory, diff, coverage |
| **Trust** | Trust ledger, reputation scores, proof certificates |
| **Knowledge** | Semantic memory, type inference, knowledge base |
| **Institutions** | Governance, voting, constitutional rules for agent collectives |

The idea: if code can prove itself correct, what happens when you build trust, governance, and knowledge management on top of that proof layer?

**Status:** Archived, March 2026. Each system individually didn't offer enough over standard TypeScript libraries. The value was in the integration — but the integration cost exceeded what a solo developer could maintain.

---

### Bridge Protocol

An agent-to-agent communication protocol. Modules as messages. 544 tests, 14 suites, all passing.

| Feature | Detail |
|---------|--------|
| Message bus | Append-only, JSONL, event-sourced |
| Reliability | Circuit breaker, exponential backoff, idempotent ACKs |
| Quality gate | Signal/control ratio monitoring (0.90+) |
| Multi-model | `--model` flag for different LLM backends |

Bridge was the operational answer to Benoit's theoretical protocol. Where Benoit proved that agents could communicate through behavioral fingerprints (zero source code), Bridge built the infrastructure for agents to actually do it reliably.

**Status:** V1 complete. V2 evolved into Agent OS.

---

### Agent OS

The natural evolution of Bridge Protocol. Instead of a custom message bus, Agent OS used Claude Code's native agent spawning, tool use, and permission system. The realization: the best agent protocol is no protocol — just give agents tools and let them coordinate.

Built inside benoit-ecosystem before the archive decision.

---

### VSCode Extension

Syntax highlighting for `.ben` files. Keywords, assertions, function definitions, comments, pattern matching — all color-coded in the Benoit palette. Published as `benoit-lang` in the VS Code extension format.

Small but it made writing `.ben` files feel real.

---

### Experiments

18+ experimental modules exploring what the language could do:

| Experiment | What it tested |
|-----------|---------------|
| `full_cycle.mjs` | Two agents, zero source code transmission, full verification |
| `evolve.mjs` | Genetic programming guided by `.ben` assertions |
| `evolve_stress.mjs` | 20-run stress test of evolution (80% success rate) |
| `negotiate.mjs` | Agent-to-agent negotiation to zero wrong answers |
| `conversation.mjs` | Full AI-to-AI dialogue using behavioral fingerprints |
| `marketplace.mjs` | Contract-driven module discovery and composition |
| `contracts.mjs` | Service-to-service contract verification |
| `poc-live.mjs` | 5 live scenarios, all passing |
| `core.mjs` | Universal primitive: given/when/then |
| `showcase.mjs` | Feature demonstration across all modules |

Most are still runnable: `node experiments/full_cycle.mjs` or `node evolve.mjs`.

---

## Products That Carry Benoit's DNA

These aren't derivatives of the language itself, but they were built by the same person, during the same period, and they carry the proof-first philosophy that Benoit established.

### Habiter

*Home diagnostics where sensor readings become proofs.*

A "copilote domestique" — smart sensors + proof-based assertions + action plans. "Your humidity is 78%" becomes a timestamped, sourced, verifiable proof, not just a measurement. PDF/JSON export with full history. Tenant rights by Swiss canton.

102+ tests. Active — became Priority #1 after Benoit was archived.

### Vigila / Suxe

*Personal safety through proof-based evidence.*

Incident capsules hashed with SHA-256 and blockchain-timestamped via OpenTimestamps. Dead Man Switch escalation protocol. SOS with circles of trust. Evidence designed to be legally receivable.

880+ tests. Active.

### Trankill

*Anti-fraud through behavioral proofs.*

Anomalies are proven, not flagged. Scam detection using the same assertion pattern Benoit established: if the behavior matches the proof, it's legitimate. If it doesn't, it's not.

22+ tests. Active as a module of ReCap.

### Batiscan

*Building diagnostics with Bridge Protocol integration.*

The first external consumer of Bridge Protocol v1 (80 tests for the bridge integration). pgvector + Whisper + Marker + accounting. 3,056+ tests in production.

### ReCap

*The universal connector.*

One product, multiple surfaces. Habiter, Vigila, and Trankill are modules of ReCap — the engine that connects them. The philosophy: 1 mature product > 8 embryonic ones.

### Cortex

*Sovereign second brain.*

Local-first personal knowledge vault. The idea that knowledge should be owned, not rented. Influenced by the Brain's approach to knowledge consolidation and TTL.

---

## Projects Envisioned or Frozen

Not everything shipped. Some ideas were explored, validated conceptually, and deliberately frozen — either because the timing wasn't right or because priorities shifted.

### SwissBuilding

A building operating system. 8,000+ tests. Frozen until Habiter reaches 1,000+ users — the idea is to prove the consumer layer first, then expand to the building layer.

### NegotiateAI

Negotiation simulator. 400+ tests. Proof-based negotiation where each offer is an assertion and each counter-offer is a synthesis attempt. Frozen as an internal building block.

### WorldEngine

Scenario simulator. 573+ tests. Distributes through SwissBuilding. Models real-world scenarios as dimensional spaces — directly inspired by Benoit's `dimensions.ben` proof module.

### JusticeBot

Legal rights database. Knows Swiss tenant law by canton. Closed-world opinion engine — it only answers what it can prove from its knowledge base, never hallucinates.

### EpistemicLayer

An epistemic reasoning framework. Explored, then replaced by lighter-weight alternatives (babel-epistemic, clarity-gate). The idea was to formalize what counts as knowledge vs. belief — a question the Brain's TTL/Mortality mechanism answered differently.

---

## Technical Documentation

| Document | What it covers |
|----------|---------------|
| **[.ben v2 Spec](BEN_V2.md)** | Language syntax, synthesis strategies, implementation details |
| **[Architecture](ARCHITECTURE.md)** | .ben &rarr; compiler &rarr; VM &rarr; pulse &rarr; CUDA pipeline |
| **[The Brain](BRAIN.md)** | 45M neurons, 17 mechanisms, why we stopped |
| **[Vision](VISION.md)** | Semantic graphs, AI-native IR, proof-carrying code |
| **[Protocol Spec](SEMANTIC_PROTOCOL.md)** | Formal specification of the communication protocol |

---

## Timeline

```
2025        Benoit Lang — a token-efficient transpiler
  |
  v
early 2026  Property inference, code synthesis, AI-to-AI protocol
  |
  +--> Bridge Protocol v1 (544 tests)
  +--> VSCode Extension
  +--> 18+ experiments
  |
  v
Jan 2026    The Brain — C/CUDA, 45M neurons, 17 mechanisms
  |
  +--> Dashboard (SVG gauges, particle effects, live thoughts)
  |
  v
Feb 2026    Benoit Ecosystem — 5 systems, 911 tests
  |         Agent OS (Bridge v2)
  |
  +--> Habiter conceived (proof-based home diagnostics)
  +--> Vigila conceived (proof-based personal safety)
  +--> Trankill conceived (proof-based fraud detection)
  |
  v
Mar 2026    Brain stopped (Google Brain convergence)
            Ecosystem archived (TS libraries sufficient individually)
            Bridge v1 archived (Agent OS replaced it)
            Benoit Lang declared "proved its point"
  |
  v
Apr 2026    Habiter, Vigila, Trankill active under ReCap
            SwissBuilding, NegotiateAI, WorldEngine frozen
            Full documentation and public archive
            The work is preserved here.
```

---

## What Survived

The language itself. 377 tests, 600+ assertions, `npm install benoit`. The proof modules, the self-programming machine, the protocol. All still work. All still runnable.

The proof-first philosophy survived too:
- **Habiter** proves humidity, not measures it
- **Vigila** proves incidents, not reports them
- **Trankill** proves fraud patterns, not flags them
- **Batiscan** consumed Bridge Protocol in production (3,056 tests)
- **JusticeBot** only answers what it can prove from closed-world knowledge

The "modules are messages" concept lives in every agent system we build. The per-neuron personality insight from the Brain informs how we think about varied parameters in any system. The "separation is the bug" mantra shows up every time we unify two things that were needlessly split.

Nothing was wasted. Some things proved their point and stopped. Others changed form and kept going.

---

*Built between 2025 and 2026 by Robin Fragniere, with Claude.*
*In memory of Benoit Fragniere, who would have loved the mess and the method.*
