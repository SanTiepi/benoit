# The Brain

*What happens when you take a language where code is proof and use it to teach a neural brain.*

---

## What We Built

After building Benoit Lang, we asked the obvious next question: what if a brain could learn by executing `.ben` files?

We built one. A self-modifying neural brain written in C and CUDA, running on dedicated hardware. No cloud. No API. Everything local.

### The Numbers

| Metric | Value |
|--------|-------|
| Neurons | **45.65 million** |
| Synapses | **~102 million** |
| GPU | NVIDIA RTX PRO 6000 (96 GB VRAM) |
| CPU | AMD EPYC |
| RAM | 176 GB |
| LLM | Qwen 2.5 72B (Q8), CUDA direct, no Ollama |
| LLM VRAM | ~79 GB / 96 GB |
| Dependencies | **0** (pure C + CUDA) |
| Tick rate | ~2-3 ticks/second at 45M neurons |

### How It Worked

The brain ran a continuous pulse loop. Each tick, 45 million neurons fired, synapses propagated signals, and `.ben` files governed what happened next.

Teaching the brain was simple: drop a `lecon.ben` file into the arena. The brain would execute it, learn from the assertions, and confirm what it understood in `appris.ben`. The same inline assertions from the language — `f(5) is 120` — became the teaching signal for a neural network.

Every neuron had its own personality: individual learning rate, decay, capacity. Never uniform. The brain adapted itself through homeostasis, decay, and self-regulation.

### 17 Autonomous Mechanisms

The brain wasn't just a neural network. It was a cognitive architecture with 17 mechanisms running at different cadences, all powered by the local 72B language model:

| Mechanism | Cadence | What it did |
|-----------|---------|-------------|
| Inner voice | Every 3,000 ticks | The brain spoke to itself, reflecting on its state |
| Knowledge synthesis | Every 5,000 ticks | Distilled accumulated knowledge into semantic memory |
| Autonomous goals | Every 10,000 ticks | Set its own objectives based on what it didn't know |
| Dream thread | Every 1,000 ticks | Free-association generation during low activity |
| Proof by absence | Every 3,000 ticks | Verified health by checking what was NOT happening |
| Episodic consolidation | Every 5,000 ticks | Compressed recent experiences into long-term memory |
| Ghost code generation | Every 20,000 ticks | Generated hypothetical code to test later |
| Ghost code testing | Every 7,000 ticks | Tested its own hypotheses against reality |
| Uncertainty principle | Every 2,000 ticks | Tracked the cost of observing its own state |
| Unknown feed | Every 15,000 ticks | Fed unknowns back into the goal system |
| Negative logic | Every 30,000 ticks | Reasoned about what is NOT true |
| Empathic resonance | Every 45,000 ticks | Modeled other agents' perspectives |
| TTL / Mortality | Every 50,000 ticks | Knowledge had expiration dates. Unused knowledge died. |
| Auto-generation | Every 60,000 ticks | Generated new `.ben` lessons for itself |
| Emergent invariants | Every 80,000 ticks | Discovered rules that never changed across all experience |
| Meta-coherence | Every 100,000 ticks | Verified that all its beliefs were mutually consistent |
| Web feeds | Every 300-3,000 ticks | Read Wikipedia, Hacker News, arXiv autonomously |

The brain had emotions — dopamine, serotonin, acetylcholine — that influenced which mechanisms fired and how aggressively it explored vs. exploited.

### The Dashboard

We built a live dashboard showing the brain's state in real time: neurotransmitter gauges as SVG, activity charts, particle effects, its inner voice, its current emotion, its latest thoughts. You could watch it think.

### .ben Was the Brain's Language

The key insight: C handled signals. `.ben` handled everything else.

The brain didn't think in C. It thought in `.ben`. Every tick, `cycle.ben` ran and decided what happened next. `parole.ben` gave the brain its inner voice. `dream_log.ben` let it free-associate. `hypotheses.ben` generated code to test later. `notes.ben` fetched Wikipedia and arXiv. `demande.ben` set autonomous goals.

The `.ben v2` synthesis engine meant the brain could even write its own functions. Write assertions, let the compiler derive the implementation. The brain used this to auto-generate lessons for itself — `lecon_auto.ben` — creating teaching material it would then learn from.

50+ builtins gave `.ben` full system access from the brain's perspective:
- File I/O: `_read_file`, `_write_file`, `_append_file`
- Memory: `_mem_get`, `_mem_set` (volatile key-value store)
- Network: `_net_http_get`, `_net_https_get`
- String ops: `_str_cat`, `_str_slice`, `_str_find`, `_str_replace`
- Math: `_sqrt`, `_pow`, `_sin`, `_cos`, `_log`, `_exp`
- LLM: `_llm_generate(prompt)` — direct call to 72B model from `.ben`
- Code: `_exec_ben(source)` — execute `.ben` code generated at runtime

**[.ben v2 Language Specification](BEN_V2.md)**

### The Stack

```
.ben files (brain logic, lessons, goals, dreams)
     |
     v
compiler.c (148 KB) — .ben interpreter + synthesis engine, 50+ builtins
     |
     v
vm.c (40 KB) — neuron state, sparse synapses, per-neuron personality
     |
     v
pulse.c (111 KB) — fire → propagate → learn → repeat, HTTP API
     |
     v
vm_cuda.cu (49 KB) — GPU synapse propagation, active-only (95% skip rate)
```

All written from scratch in C. Zero dependencies.

The LLM (Qwen 2.5 72B) was loaded directly via llama.cpp with CUDA, no intermediate server. When the brain needed to think in words, it called the model directly from C. No HTTP. No Ollama. No latency.

**[Full architecture details](ARCHITECTURE.md)**

---

## Why We Stopped

In March 2026, after scaling the brain to 45 million neurons and watching all 17 mechanisms run autonomously, we stepped back and looked at what we had built.

We had independently converged on many of the same ideas as Google Brain and DeepMind: neural architectures with per-neuron learning rates, homeostatic regulation, episodic memory consolidation, intrinsic motivation through curiosity, knowledge distillation with TTL. The mechanisms we called "dream thread" and "ghost code" were conceptually close to what large research labs were exploring with imagination-based planning and self-play.

The difference was scale. We had one GPU and 45 million neurons. They had thousands of GPUs and billions of parameters. The ideas were sound. The execution was honest. But continuing to scale a solo project toward a destination that industrial labs were approaching with 1000x the resources didn't make sense.

So we stopped the brain. Not because it failed — it was thinking, dreaming, speaking, setting its own goals. We stopped because the right response to discovering you've independently validated an approach is to document it, not to race against it.

---

## What We Learned

1. **`.ben` assertions work as a teaching signal.** The same `f(5) is 120` that proves code correctness can train a neural network. The language and the brain were genuinely one system.

2. **Per-neuron personality matters.** Uniform learning rates produce uniform behavior. Varied rates, varied decay, varied capacity — that's where interesting dynamics emerge.

3. **17 mechanisms is not too many.** When each mechanism has a clear cadence and a clear purpose, they compose cleanly. The brain never felt chaotic. It felt like an organism.

4. **A 72B model running locally changes everything.** No rate limits, no API costs, no latency. The brain could think in words whenever it needed to, as fast as the GPU allowed.

5. **You can build surprisingly far alone.** One person, one GPU, C and CUDA. 45 million neurons with 17 autonomous cognitive mechanisms. The tools exist. The bottleneck is ideas, not infrastructure.

6. **Knowing when to stop is part of the work.** The brain was the most ambitious thing we built. Stopping it was the most honest decision we made.

---

## The Connection

Benoit Lang and the Brain were two expressions of the same idea: **the separation between code and knowledge is artificial.**

In the language, `fib(10) is 55` is simultaneously code, test, proof, and documentation.
In the brain, that same assertion was simultaneously a teaching signal, a verification check, and a memory.

The language proved the concept. The brain proved it could scale. Together, they proved that a solo researcher can independently converge on ideas that matter — even if the scale belongs to someone else.

---

*The brain ran from January to March 2026 on a dedicated server in Germany.*
*Named after Benoit Fragniere, who would have asked a hundred questions about how the neurons fired.*
