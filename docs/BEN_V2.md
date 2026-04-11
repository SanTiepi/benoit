# .ben v2 — Language Specification

## Overview

`.ben` is the language of Benoît's brain. All logic lives in `.ben` files — C is pure signal.

`.ben v2` introduces the **synthesis engine**: assertions without a function body are automatically proven by the compiler. Write what a function should do, let the compiler find the implementation.

Philosophical basis: **assertion = proof = code = execution** (Curry-Howard).

---

## Syntax

### Function definition (v1 — explicit body)

```ben
double(n):
  else? -> n * 2

square(n):
  else? -> n * n
```

### Auto-proving assertion (v2 — new)

Write assertions. Omit the body. The compiler synthesizes it.

```ben
double(5) is 10
double(0) is 0
double(2) is 4
```

The compiler tries all synthesis strategies until one satisfies every assertion. If it succeeds, it registers the function exactly as if you had written the body. If it fails, it prints `[BEN SYNTH] impossible de prouver 'double'` and stops.

---

## Synthesis strategies

### Arity 1 — `f(n) is y`

| Strategy | Example |
|----------|---------|
| Identity | `f(5) is 5` |
| Negation | `f(5) is -5` |
| Constant | `f(anything) is 42` |
| Absolute value | `f(-3) is 3` |
| ReLU | `f(-1) is 0, f(2) is 2` |
| Sign | `f(-5) is -1, f(3) is 1` |
| Floor | `f(2.7) is 2` |
| Ceil | `f(2.1) is 3` |
| Round | `f(2.5) is 3` |
| Square | `f(3) is 9` |
| Cube | `f(2) is 8` |
| Square root | `f(9) is 3` |
| Log (natural) | `f(1) is 0` |
| Sin | `f(0) is 0` |
| Cos | `f(0) is 1` |
| Exp × 2 | `f(1) is 5.436...` |
| Exp × 3 | `f(1) is 8.154...` |
| Exp × 10 | `f(1) is 27.18...` |
| Linear `ax+b` | `f(1) is 3, f(2) is 5` → `2x+1` |
| Quadratic `ax²+bx+c` | `f(1) is 2, f(2) is 5, f(3) is 10` |
| Factorial (recursive) | `f(0) is 1, f(1) is 1, f(5) is 120, f(3) is 6` |
| Fibonacci (recursive) | `f(0) is 0, f(1) is 1, f(6) is 8` |
| Conditional split | `f(2) is 4, f(-1) is 1` (piecewise) |

### Arity 2 — `f(a, b) is y`

| Strategy | Example |
|----------|---------|
| Addition | `f(2, 3) is 5` |
| Subtraction | `f(5, 3) is 2` |
| Multiplication | `f(3, 4) is 12` |
| Division | `f(6, 2) is 3` |
| Modulo | `f(7, 3) is 1` |
| Max | `f(3, 5) is 5` |
| Min | `f(3, 5) is 3` |
| Power | `f(2, 3) is 8` |
| Mean | `f(2, 4) is 3` |
| Hypotenuse | `f(3, 4) is 5` |
| GCD (recursive) | `f(12, 8) is 4` |

### Arity 3 — `f(a, b, c) is y`

| Strategy | Example |
|----------|---------|
| Clamp | `f(5, 0, 10) is 5, f(-1, 0, 10) is 0, f(20, 0, 10) is 10` |

---

## Examples

### Simple

```ben
double(5) is 10
double(0) is 0
double(2) is 4
# synthesized: else? -> 2 * n
```

### Factorial — needs 4+ points to distinguish from quadratic

```ben
fact(0) is 1
fact(1) is 1
fact(3) is 6
fact(5) is 120
# synthesized: n <= 1? -> 1\nelse? -> n * fact(n - 1)
```

### GCD

```ben
gcd(12, 8) is 4
gcd(9, 6) is 3
gcd(7, 0) is 7
# synthesized: b == 0? -> a\nelse? -> gcd(b, _mod(a, b))
```

### Clamp

```ben
clamp(5, 0, 10) is 5
clamp(-1, 0, 10) is 0
clamp(20, 0, 10) is 10
# synthesized: a < b? -> b\na > c? -> c\nelse? -> a
```

---

## Failure

If no strategy satisfies all assertions:

```
[BEN SYNTH] impossible de prouver 'mystery'
```

This is explicit and fatal — no silent fallback.

---

## Implementation

The synthesis engine lives in `src/benoit-v2/compiler.c`:

- `SynthFunc` struct — holds assertions for one function (up to 8 pairs, up to arity 3)
- `synth_collect()` — called in Pass 1 to detect `f(args) is val` where `f` has no body
- `ben_synthesize_all()` — called between Pass 1 and Pass 2; tries all strategies
- `synth_register()` — injects the synthesized function into the `BenFuncs` table

Synthesized bodies use `ben_eval_cond_chain` format:
- Simple: `else? -> expr`
- Conditional: `cond? -> val\nelse? -> val`
- Recursive: `n <= 1? -> 1\nelse? -> n * fname(n - 1)`

---

## Compatibility

- Functions with an explicit body are not affected
- Both explicit and synthesized functions can call each other
- `.ben v2` is fully compatible with the C/CUDA runtime (`compiler.c`)
