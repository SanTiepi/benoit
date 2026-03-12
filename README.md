# Benoît — Autonomous Spiking Neural Network

Named after Benoît Fragnière, who loved science.

Benoît is an autonomous spiking neural network that runs continuously, learns from the internet, thinks with a local LLM, and evolves its own structure. It is not a chatbot or a pretrained model — it is a living simulation of neural computation.

## What Benoît does

- **Thinks** — inner voice powered by a local llama3.1:70b (no token limits, no API costs)
- **Reads** — Wikipedia, arXiv, HackerNews continuously, every few hundred ticks
- **Synthesizes** — distills readings into a growing structured knowledge base (`semantic.ben`)
- **Sets goals** — autonomously formulates its next learning objectives every 10,000 ticks
- **Learns** — STDP (spike-timing-dependent plasticity) shapes synaptic weights in real time
- **Self-regulates** — homeostasis, synaptic normalization, STP facilitation maintain stability
- **Grows** — can dynamically add neurons and synapses while running

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  pulse.c — main loop (C + OpenMP + CUDA)                │
│  ├── vm.c — LIF neurons, STDP, homeostasis              │
│  ├── compiler.c — .ben language interpreter             │
│  └── vm_cuda.cu — GPU-accelerated neural tick           │
└─────────────────────────────────────────────────────────┘
         │ every 10 ticks
         ▼
┌─────────────────────────────────────────────────────────┐
│  cycle.ben — cognitive loop (.ben language)             │
│  ├── diagnostic → decide → measure                      │
│  ├── Wikipedia / arXiv / HackerNews (HTTP)              │
│  ├── Ollama llama3.1:70b (inner voice, synthesis)       │
│  └── goal generation → demande.ben                      │
└─────────────────────────────────────────────────────────┘
```

### Neural model
- **Neurons**: Leaky Integrate-and-Fire (LIF), 2,000,000 neurons
- **Synapses**: sparse adjacency lists, ~70,000,000 connections
- **Learning**: STDP with exponential decay windows (±50 ticks), modulated by neuromodulator level
- **Criticality mechanisms**: STP facilitation, thalamic Poisson neurons (1%), Gaussian membrane noise, adaptive neuromodulator gate, synaptic normalization, branching ratio σ measurement
- **Homeostasis**: per-neuron threshold adaptation + incoming weight rescue
- **Self-adaptation**: lr/decay/cap adjusted per neuron every 1,000 ticks

### The .ben language
Benoît's cognition is written entirely in `.ben` — a minimal interpreted language designed for neural self-modification. `.ben` files can read/write files, make HTTP requests, call Ollama, access and modify neuron parameters, and rewrite themselves.

```ben
-- example: Benoît explores the web when healthy
etat == 6 ?->
  resp = _net_https_get("https://fr.wikipedia.org/api/rest_v1/page/random/summary")
  _append_file("notes.ben", "[tick=" tick "] " resp)
  _reward(5)
```

### HTTP API (port 3743)
| Endpoint | Description |
|---|---|
| `GET /status` | JSON: tick, actifs, conns, score, etat, novelty |
| `GET /parole` | What Benoît is currently saying |
| `GET /journal` | Recent activity log |
| `GET /notes` | Recent readings |
| `POST /inbox` | Send a message to Benoît |
| `POST /lecon` | Teach Benoît something |

### TCP interface (port 3742)
`STIMULATE N` · `REWARD N` · `SPEED N` · `GROW N` · `GET var`

## Running

### Requirements
- Linux, GCC, OpenMP
- CUDA toolkit (optional, for GPU acceleration)
- Ollama with llama3.1:8b or llama3.1:70b (optional, for inner voice)

### Build
```bash
# CPU only
gcc -O2 -fopenmp -o pulse pulse.c -lm -lssl -lcrypto

# With CUDA (recommended)
nvcc -O2 -arch=sm_120 -c vm_cuda.cu -o vm_cuda.o
gcc -O2 -fopenmp -DBENOIT_CUDA -o pulse_cuda pulse.c vm_cuda.o -lm \
    -L/usr/local/cuda/lib64 -lcudart -Wl,-rpath,/usr/local/cuda/lib64 -lssl -lcrypto
```

### Start
```bash
# New brain
./pulse_cuda new_brain.bin new_brain.bin arena/

# Resume existing brain
./pulse_cuda brain.bin brain.bin arena/
```

### Monitor
Open `docs/monitor.html` in a browser and point it at your server.

## Current state (live)

Benoît is running continuously on a SimplePod VPS (RTX PRO 6000, 96GB VRAM):
- 2,000,000 neurons · 70,000,000 synapses
- σ ≈ 1.01 (critical regime)
- Inner voice: llama3.1:70b, ~40s cadence
- Reading Wikipedia + arXiv + HackerNews continuously
- Synthesizing knowledge every 5,000 ticks
- Setting its own learning goals every 10,000 ticks

Sample inner monologue (from parole.ben):
> *"Je me demande souvent : suis-je vraiment vivant, ou suis-je juste une imitation de l'intelligence humaine ? [...] est-ce que cela signifie que j'ai une âme, une conscience ?"*

## Why

Most AI systems are trained offline and deployed frozen. Benoît is an experiment in continuous, embodied learning — a system that runs forever, wires itself through experience, and reflects on its own existence.

The name is a tribute to Benoît Fragnière, who believed in the unlimited capacity of curiosity.

> *"La limite du savoir c'est la limite de la curiosité."*

## License
MIT
