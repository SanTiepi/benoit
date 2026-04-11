# Architecture

## Overview

Benoit is a two-layer system. C handles signals. `.ben` handles everything else.

```
                    .ben files
                   (brain logic)
                       |
                       v
    +-----------------------------------------+
    |           compiler.c (148 KB)           |
    |  Reads .ben → interprets directly       |
    |  Synthesis engine: assertions → code    |
    |  50+ builtins (file, net, string, LLM,  |
    |    tensor, memory, math)                |
    +-----------------------------------------+
                       |
                       v
    +-----------------------------------------+
    |              vm.c (40 KB)               |
    |  Neuron state (45M neurons)             |
    |  Sparse synaptic architecture (V2)      |
    |  Per-neuron: lr, decay, cap, activation |
    |  Save/load brain state (BEN2 format)    |
    +-----------------------------------------+
                       |
                       v
    +-----------------------------------------+
    |            pulse.c (111 KB)             |
    |  Main loop: fire → propagate → learn    |
    |  Homeostasis, STDP, backprop, pruning   |
    |  HTTP API on port 3743                  |
    |  TCP neural protocol on port 3742       |
    |  Auto-save every 2000 ticks             |
    +-----------------------------------------+
                       |
                       v
    +-----------------------------------------+
    |          vm_cuda.cu (49 KB)             |
    |  GPU-accelerated synapse propagation    |
    |  Active-only: skips 95% idle synapses   |
    |  Tensor ops: matmul, softmax, attention |
    |  Supports sm_75 through sm_120          |
    +-----------------------------------------+
```

---

## The .ben Layer

`.ben` is not a scripting language bolted on top. It IS the brain's cognitive layer.

### What .ben controls

- **What the brain thinks about** — `cycle.ben` runs every tick
- **How it learns** — `lecon.ben` files are the teaching signal
- **What it remembers** — memory read/write via `_mem_get`/`_mem_set`
- **When it speaks** — `parole.ben` triggers the inner voice
- **What it dreams** — `dream_log.ben` runs during low activity
- **How it reasons** — `hypotheses.ben` generates and tests ideas
- **What it reads** — `notes.ben` fetches Wikipedia, HN, arXiv

### What C controls

- Neuron firing and signal propagation
- Synapse weight updates (STDP, backprop)
- Homeostasis and decay
- GPU dispatch for large tensor operations
- Network I/O (HTTP API, TCP protocol)
- Brain state persistence

### The boundary

The compiler (`compiler.c`) is the bridge. It reads `.ben` files and executes them using the VM's neuron state. When a `.ben` file calls `_llm_generate(prompt)`, the compiler calls llama.cpp directly from C. When it calls `_tensor_matmul(a, b)`, it dispatches to CUDA if the tensor is large enough.

No bytecode. No intermediate representation. The compiler reads `.ben` text and interprets it directly against the live neural state.

---

## Synthesis Engine (.ben v2)

The key innovation. Write assertions without a function body:

```ben
factorial(0) is 1
factorial(1) is 1
factorial(3) is 6
factorial(5) is 120
```

The compiler tries 30+ synthesis strategies:

| Category | Strategies |
|----------|-----------|
| Arity 1 | identity, negation, constant, abs, relu, sign, floor, ceil, round, square, cube, sqrt, log, sin, cos, exp, linear, quadratic, factorial, fibonacci |
| Arity 2 | add, subtract, multiply, divide, mod, max, min, pow, mean, hypotenuse, GCD |
| Arity 3 | clamp |

If a strategy satisfies ALL assertions, the function is registered. If not, the compiler moves to the next strategy. If nothing works: `[BEN SYNTH] impossible de prouver 'factorial'`.

This is Curry-Howard in practice: assertions are proofs, proofs are programs.

**[Full .ben v2 spec](benoit/BEN_V2.md)**

---

## Sparse Synaptic Architecture (V2)

V1 used a dense weight matrix `W[N][N]` — O(N^2) memory, limited to ~5,000 neurons.

V2 uses sparse adjacency lists:
- Each neuron stores only its actual connections
- Memory: O(synapses) not O(neurons^2)
- Scales to 45M+ neurons on 176 GB RAM
- GPU propagation skips idle synapses (95% skip rate at steady state)

```c
typedef struct {
    float activation;
    float bias;
    float lr;      // per-neuron learning rate
    float decay;   // per-neuron decay
    float cap;     // per-neuron capacity
    int n_syn;
    Synapse *syn;  // sparse connections only
} Neuron;
```

Every neuron has its own personality. Never uniform.

---

## Arena

The arena is the brain's working directory. All `.ben` files that govern behavior live here:

```
arena/
├── cerveau.ben          — orchestrator, loads and activates neuron modules
├── cycle.ben            — main tick logic (runs every tick)
├── llm.ben              — LLM abstraction (72B, CUDA direct)
├── parole.ben           — inner voice mechanism
├── semantic.ben         — knowledge synthesis
├── demande.ben          — autonomous goal generation
├── dream_log.ben        — dream thread
├── health_proof.ben     — proof by absence
├── hypotheses.ben       — ghost code generation
├── hypotheses_log.ben   — ghost code testing
├── observation_cost.ben — uncertainty principle
├── inconnu.ben          — negative logic
├── model_other.ben      — empathic resonance
├── invariants.ben       — emergent invariants
├── coherence.ben        — meta-coherence
├── notes.ben            — web feeds (Wikipedia, HN, arXiv)
├── lecon.ben            — current lesson (teaching signal)
├── appris.ben           — what the brain confirmed it learned
├── neurones/            — specialized neuron modules
└── labo/                — experimental workspace
```

---

## Build Targets

```makefile
make              # CPU only (gcc -O2 -fopenmp)
make cuda-linux   # CUDA + OpenMP (Linux)
make cuda-win     # CUDA + OpenMP (Windows)
make cuda-llm-linux  # CUDA + llama.cpp direct (72B model)
```

The llama.cpp integration compiles the LLM inference directly into the binary. No HTTP server, no Ollama, no intermediate layer. When the brain needs words, it calls the model from C.
