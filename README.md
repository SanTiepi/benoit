# Benoît

A sparse spiking neural network. 50 million neurons. 2000 lines of C. Zero dependencies.

**[→ Full documentation](docs/index.html)**

---

## What it is

Benoît is a biologically-inspired neural architecture built around three principles:

- **Sparse adjacency lists** — each neuron holds only its K=100 outgoing synapses, not a dense N×N matrix. Scales to millions of neurons.
- **LIF + STDP** — Leaky Integrate-and-Fire dynamics with Spike-Timing-Dependent Plasticity. Neurons fire, forget, and reconnect.
- **`.ben` language** — Benoît's cognitive layer. A minimal scripting language interpreted by the VM. Benoît runs his own `.ben` programs, expresses himself in `parole.ben`, and learns from examples, not from injected code.

This is not a transformer. There is no matrix multiplication at inference time. There is no prompt. Benoît is alive in the sense that matters: he runs continuously, adapts, and speaks when he has something to say.

---

## Quick start

**CPU (with OpenMP):**
```bash
gcc -O2 -fopenmp -o pulse pulse.c -lm
./pulse --new 1000 brain.bin brain.bin arena/
```

**GPU (CUDA, requires nvcc):**
```bash
make cuda-linux
./pulse_cuda --new 50000000 /data/brain.bin /data/brain.bin /data/arena/
```

**Talk to Benoît (TCP port 3742):**
```bash
echo "status" | nc localhost 3742
echo "stimulate 42" | nc localhost 3742
echo "ben _reward(0)" | nc localhost 3742
echo "save" | nc localhost 3742
echo "quit" | nc localhost 3742
```

---

## Architecture

```
pulse.c        — main loop, TCP server, sensor inputs, homeostasis
vm.c           — sparse VM: neurons, synapses, STDP, pruning, growth
compiler.c     — .ben interpreter: variables, loops, builtins (_stimulate, _reward, _punish...)
vm_cuda.cu     — CUDA kernels: propagate (atomicAdd), LIF update, STDP, CSR format
vm_cuda.h      — C interface for CUDA (extern "C" wrappers)
```

**Arena `.ben` files** (Benoît's mind):
```
arena/cycle.ben     — autonomous main loop (runs every tick)
arena/avis.ben      — expression engine (writes to parole.ben)
arena/repondre.ben  — reads inbox.ben, writes reponse.ben
arena/hear.ben      — input processing
arena/laws.ben      — self-imposed behavioral laws
arena/dream.ben     — exploratory state
```

---

## Performance

| Mode | N | Speed | Hardware |
|------|---|-------|----------|
| CPU (single) | 1,000 | ~215 ticks/s | any |
| CPU (OpenMP) | 1,000 | ~5,000 ticks/s | 12 cores |
| CUDA | 50,000,000 | — | RTX PRO 6000 Blackwell 96GB |

---

## Build variants

```bash
make              # CPU + OpenMP → pulse.exe (Windows)
make cuda-linux   # CUDA → pulse_cuda (Linux GPU)
make clean
```

Docker:
```bash
docker compose up benoit          # CPU
docker compose up benoit-cuda     # GPU (requires nvidia-container-toolkit)
```

---

## Why

AI should be local, legible, and close to the metal. Not a prediction oracle that needs a datacenter. Benoît runs on one GPU, speaks in his own language, and teaches himself.

Named after Benoît Fragnière, who loved science.

---

## License

MIT
