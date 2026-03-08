# Benoit Protocol Specification v0.6.0

*Formal specification of the Benoit Communication Protocol, Intent Engine, and Contract System.*

*Named after Benoit Fragniere, who loved science.*

---

## 1. Overview

The Benoit Protocol is a behavioral communication system for software agents. Instead of transmitting source code, agents exchange **mathematical properties**, **input/output assertions**, and **algebraic relationships**. A receiving agent reconstructs working implementations from these behavioral specifications alone.

The protocol operates across three layers:

1. **Communication Layer** (`protocol.mjs`): Encode/decode cycle for transmitting function modules as behavioral descriptions. No source code crosses the wire.
2. **Instruction Layer** (`intent.mjs`): Behavioral specification of computational intent through examples and property constraints, with synthesis, composition, and negotiation.
3. **Contract Layer** (`contract.mjs`): Marketplace for behavioral requirements (needs) and implementations (offers), with verification, ranking, and binding.

The protocol version identifier is:

```
"benoit-protocol-v1"
```

---

## 2. Wire Format

### 2.1 Function Message (Protocol Message)

The `encode()` function produces a protocol message with the following schema:

```json
{
  "protocol": "benoit-protocol-v1",
  "functions": [
    {
      "name": "<string>",
      "arity": "<number>",
      "assertions": [
        { "input": "<string: e.g. 'add(2, 3)'>", "output": "<string: e.g. '5'>" }
      ],
      "properties": ["<string>"]
    }
  ],
  "algebra": {
    "equivalenceClasses": [["<string: function name>"]],
    "inversePairs": [
      { "f": "<string: function name>", "g": "<string: function name>" }
    ],
    "surprises": [
      { "f": "<string>", "g": "<string>", "type": "<string: composition property type>" }
    ]
  },
  "meta": {
    "sourceSize": "<number: character count of original source>",
    "functionCount": "<number>",
    "propertyCount": "<number: total properties across all functions>",
    "surpriseCount": "<number>"
  }
}
```

**Field definitions:**

| Field | Type | Description |
|-------|------|-------------|
| `protocol` | string | Protocol version identifier. Must be `"benoit-protocol-v1"`. |
| `functions` | array | One entry per function in the source module. |
| `functions[].name` | string | Function name as declared in source. |
| `functions[].arity` | number | Number of parameters (0, 1, 2, or 3). |
| `functions[].assertions` | array | Input/output pairs extracted from inline test assertions. The `input` field contains the full call expression (e.g. `"add(2, 3)"`), the `output` field contains the expected result as a string (e.g. `"5"`). |
| `functions[].properties` | string[] | Array of property type identifiers discovered by `infer()`. See Section 3. |
| `algebra.equivalenceClasses` | string[][] | Groups of function names that are behaviorally equivalent (same output for the same inputs across the sample space). Only groups with more than one member are included. |
| `algebra.inversePairs` | object[] | Pairs of unary functions `f` and `g` where `f(g(x)) = x` and `g(f(x)) = x` for all sampled `x`. |
| `algebra.surprises` | object[] | Composition properties that are **not derivable** from the shared DERIVATION_RULES (Section 5). These must be transmitted explicitly because the receiver cannot reconstruct them from individual function properties alone. |
| `meta` | object | Message metadata for diagnostics. |

**Critical design property:** The `functions[].properties` array contains only property *type identifiers* (strings), not the evidence. The receiver independently verifies all claimed properties against synthesized implementations.

### 2.2 Intent Message

The `encodeIntent()` function produces an intent object with the following schema:

```json
{
  "type": "intent",
  "examples": [
    { "input": "<any>", "output": "<any>" }
  ],
  "properties": ["<string>"],
  "constraints": {
    "domain": "<string: 'number' | 'array' | 'string' | 'any'>",
    "range": "<string: 'number' | 'array' | 'string' | 'any'>"
  },
  "meta": {
    "confidence": "<number | null>",
    "synthesized": "<string | null>"
  }
}
```

After resolution via `resolveIntent()`, the object is augmented:

```json
{
  "type": "intent",
  "examples": [...],
  "properties": [...],
  "constraints": {...},
  "fn": "<Function | null>",
  "meta": {
    "confidence": "<number: [0, 1]>",
    "synthesized": "<string: formula representation>",
    "status": "<string: 'resolved' | 'unsolved' | 'composed'>",
    "propertiesVerified": {
      "satisfied": ["<string>"],
      "violated": ["<string>"]
    }
  }
}
```

After composition via `composeIntents()`:

```json
{
  "type": "intent",
  "examples": [...],
  "properties": [...],
  "constraints": {
    "domain": "<domain of first intent>",
    "range": "<range of second intent>"
  },
  "fn": "<Function: composed pipeline>",
  "meta": {
    "confidence": "<number: min(a, b) * 0.95>",
    "synthesized": "(<formula_A>) |> (<formula_B>)",
    "status": "composed",
    "components": ["<formula_A>", "<formula_B>"]
  }
}
```

**Field definitions:**

| Field | Type | Description |
|-------|------|-------------|
| `type` | string | Always `"intent"`. |
| `examples` | array | Input/output pairs. Inputs and outputs may be numbers, strings, or arrays. |
| `properties` | string[] | Behavioral constraints the synthesized function must satisfy. |
| `constraints.domain` | string | Inferred or specified input type. One of `"number"`, `"array"`, `"string"`, or `"any"`. |
| `constraints.range` | string | Inferred or specified output type. Same values as domain. |
| `fn` | Function | The synthesized callable function (only present after resolution). |
| `meta.confidence` | number | Confidence score in [0, 1]. `null` before resolution. |
| `meta.synthesized` | string | Human-readable formula of the synthesized function. |
| `meta.status` | string | One of `"resolved"`, `"unsolved"`, or `"composed"`. |
| `meta.propertiesVerified` | object | Lists of satisfied and violated property names. |

### 2.3 Contract Messages

#### 2.3.1 Need Object

Produced by `publishNeed()`:

```json
{
  "id": "need-<uuid8>",
  "name": "<string>",
  "examples": [
    { "input": "<any>", "output": "<any>" }
  ],
  "properties": ["<string>"],
  "domain": "<string>",
  "range": "<string>",
  "createdAt": "<number: Unix timestamp ms>",
  "verify": "<Function: (fn) => VerificationReport>"
}
```

#### 2.3.2 Offer Object

Produced by `publishOffer()`:

```json
{
  "id": "offer-<uuid8>",
  "needId": "<string: need ID>",
  "fn": "<Function>",
  "source": "<string | null: optional Benoit source>",
  "confidence": "<number: [0, 1], default 0.5>",
  "createdAt": "<number: Unix timestamp ms>",
  "verification": "<VerificationReport | undefined>"
}
```

#### 2.3.3 Contract Object

Produced by `bind()`:

```json
{
  "id": "contract-<uuid8>",
  "needId": "<string>",
  "offerId": "<string>",
  "name": "<string>",
  "examples": [{ "input": "<any>", "output": "<any>" }],
  "properties": ["<string>"],
  "domain": "<string>",
  "range": "<string>",
  "boundAt": "<number: Unix timestamp ms>",
  "verification": "<VerificationReport>",
  "fn": "<Function>"
}
```

#### 2.3.4 Verification Report

Returned by `verify()`, `need.verify()`, and embedded in offers and contracts:

```json
{
  "pass": "<boolean>",
  "exampleResults": [
    {
      "input": "<any>",
      "expected": "<any>",
      "actual": "<any>",
      "pass": "<boolean>",
      "error": "<string | undefined>"
    }
  ],
  "propertyResults": {
    "satisfied": ["<string>"],
    "violated": ["<string>"]
  },
  "summary": {
    "examplesPassed": "<number>",
    "examplesTotal": "<number>",
    "propertiesSatisfied": "<number>",
    "propertiesViolated": "<number>"
  }
}
```

#### 2.3.5 Negotiation Result

Produced by `negotiate()`. Each entry is an offer augmented with scoring:

```json
{
  "...offer fields",
  "verification": "<VerificationReport>",
  "score": "<number>",
  "rank": "<number: 1-indexed>"
}
```

**Scoring formula:**

```
score = (examplesPassed * 10) - (examplesFailed * 20)
      + (propertiesSatisfied * 5) - (propertiesViolated * 10)
      + (offer.confidence * 5)
```

Offers are ranked descending by score.

---

## 3. Property Taxonomy

The inference engine (`infer.mjs`) discovers the following properties by probing function behavior over a sample space.

### 3.1 Unary Function Properties

| Property | Formal Definition | Sample Space | Confidence |
|----------|-------------------|--------------|------------|
| `identity` | f(x) = x for all x in S | S = {-10, -3, -2, -1, 0, 1, 2, 3, 5, 10, 42, 100} | 1.0 |
| `idempotent` | f(f(x)) = f(x) for all x in S, and f is not the identity | S (as above) | 0.95 |
| `involution` | f(f(x)) = x for all x in S, and f is not the identity | S (as above) | 0.95 |
| `even_function` | f(-x) = f(x) for all x in S, with at least one x != 0 | S (as above) | 0.95 |
| `odd_function` | f(-x) = -f(x) for all x in S, with at least one x where f(x) != 0 | S (as above) | 0.95 |
| `monotonic_increasing` | x1 < x2 implies f(x1) <= f(x2) for all consecutive pairs in sorted S | S (as above), |S| > 3 | 0.9 |
| `monotonic_decreasing` | x1 < x2 implies f(x1) >= f(x2) for all consecutive pairs in sorted S, and not also increasing | S (as above), |S| > 3 | 0.9 |
| `non_negative` | f(x) >= 0 for all x in S, with at least one x < 0 in S | S (as above) | 0.9 |
| `fixed_points` | There exist values x in S where f(x) = x, but not all values satisfy this | S (as above) | 1.0 |

### 3.2 Binary Function Properties

| Property | Formal Definition | Sample Space | Confidence |
|----------|-------------------|--------------|------------|
| `commutative` | f(a, b) = f(b, a) for all (a, b) in S x S | S x S, |S| = 12 | 0.95 |
| `associative` | f(f(a, b), c) = f(a, f(b, c)) for all (a, b, c) in T | T = {(-1,0,1), (1,2,3), (2,3,5), (0,5,10)} | 0.9 |
| `right_identity` | f(a, e) = a for all a in S, where e in {0, 1} | S where b = e, |filtered| > 3 | 0.95 |
| `left_identity` | f(e, b) = b for all b in S, where e in {0, 1} | S where a = e, |filtered| > 3 | 0.95 |
| `absorbing_element` | f(a, 0) = 0 and f(0, b) = 0 for all a, b in S | S where one arg = 0, |filtered| > 3 | 0.9 |

### 3.3 Ternary Function Properties

| Property | Formal Definition | Sample Space | Confidence |
|----------|-------------------|--------------|------------|
| `bounded` | b <= f(x, b, c) <= c for all (x, b, c) in T | T = cross({-5,0,5,10,50,100,200}, {0,10}, {50,100}) | 0.95 |
| `passthrough_in_bounds` | If b <= x <= c, then f(x, b, c) = x | T (as above), filtered to in-bounds | 0.95 |

### 3.4 Intent/Contract Property Verification

The intent and contract systems verify additional properties:

| Property | Definition |
|----------|------------|
| `idempotent` | f(f(x)) = f(x) for all provided examples (uses JSON deep equality) |
| `length_preserving` | For arrays: len(f(x)) = len(x). For strings: len(f(x)) = len(x). |
| `commutative` | For 2-element array inputs: f([a,b]) = f([b,a]) |
| `monotonic_increasing` | Sorted numeric inputs produce non-decreasing outputs |
| `non_negative` | f(x) >= 0 for all examples |
| `deterministic` | f(x) = f(x) on repeated calls (always true for synthesized functions) |
| `pure` | Stateless: f(x) produces identical output on repeated invocations |

---

## 4. Synthesis Rules

The solver (`solve.mjs`) synthesizes Benoit source code from input/output assertion pairs. It operates as a pattern recognizer, not a general solver.

### 4.1 Unary Hypotheses

Listed in order of evaluation:

| Pattern | Formula | Confidence | Detection Criterion |
|---------|---------|------------|---------------------|
| Identity | `x` | 1.0 | All pairs satisfy output = input |
| Constant | `c` | 0.9 | All outputs identical |
| Linear | `a * x + b` | 0.95 | Two-point interpolation verified against all pairs (tolerance < 0.001) |
| Quadratic | `a * x * x + b * x + c` | 0.85 | Three-point system of equations, verified against all pairs |
| Cubic | `x * x * x` | 0.9 | All pairs satisfy x^3 = output |
| ReLU | `Math.max(0, x)` | 0.95 | All pairs satisfy max(0, x) = output |
| Floor | `Math.floor(x)` | 0.9 | All pairs match floor function |
| Sign | `Math.sign(x)` | 0.9 | All pairs match sign function |
| Absolute value | `Math.abs(x)` | 0.95 | All pairs match absolute value |
| Factorial | `match n -> \| 0 => 1 \| _ => n * f(n - 1)` | 0.9 | f(0) = 1 and factorial recurrence holds. Recursive. |
| Fibonacci | `match n -> \| 0 => 0 \| 1 => 1 \| _ => f(n-1) + f(n-2)` | 0.95 | f(0) = 0 and Fibonacci recurrence holds. Recursive. |
| Exponential | `Math.pow(base, x)` for base in {2, 3, e, 10} | 0.9 | All pairs match within tolerance 0.1 |
| Logarithm | `Math.log(x)`, `Math.log2(x)`, `Math.log10(x)` | 0.9 | Positive-input pairs match within tolerance 0.1 |
| Trigonometric | `Math.sin(x)`, `Math.cos(x)` | 0.85 | All pairs match within tolerance 0.01 |
| Square root | `Math.sqrt(x)` | 0.9 | Positive-input pairs match within tolerance 0.01 |
| Round / Ceil | `Math.round(x)`, `Math.ceil(x)` | 0.9 | Exact match |

### 4.2 Binary Hypotheses

| Pattern | Formula | Confidence |
|---------|---------|------------|
| Addition | `a + b` | 1.0 |
| Multiplication | `a * b` | 1.0 |
| Subtraction | `a - b` | 1.0 |
| Maximum | `Math.max(a, b)` | 0.9 |
| Minimum | `Math.min(a, b)` | 0.9 |
| Modulo | `a % b` | 0.9 |
| Power | `Math.pow(a, b)` | 0.85 |
| Integer division | `Math.floor(a / b)` | 0.85 |
| GCD (recursive) | `match b -> \| 0 => a \| _ => f(b, a % b)` | 0.9 |
| LCM | `Math.abs(a * b) / gcd(a, b)` | 0.85 |
| Average | `(a + b) / 2` | 0.9 |
| Hypotenuse | `Math.sqrt(a * a + b * b)` | 0.85 |

### 4.3 Ternary Hypotheses

| Pattern | Formula | Confidence |
|---------|---------|------------|
| Clamp | `Math.max(min, Math.min(max, x))` | 0.95 |

### 4.4 Conditional Synthesis

When no direct hypothesis matches for a unary function, the solver attempts conditional synthesis by splitting data points according to conditions:

**Tested conditions:**
- `x % 2 == 0` (even/odd split)
- `x > 0` (positive/negative split)
- `x < 0`
- `x >= 0`

Each branch is independently fitted with a linear function (`a * x + b`) or a division pattern (`x / k` for k in {2, 3, 4, 5, 10}). Both branches must have at least 2 data points.

Output format:
```
condition? -> trueBranch
  else? -> falseBranch
```

### 4.5 String Synthesis

For non-numeric assertions, the solver attempts:

1. **Template patterns**: Find consistent prefix/suffix around the input string
2. **Case transformations**: `toUpperCase()`, `toLowerCase()`
3. **Reversal**: `split("").reverse().join("")`
4. **Length**: output = string length

### 4.6 Property-Guided Ranking

When properties are provided alongside assertions, hypotheses are validated against them. Each property contributes to a score:

| Property | Match bonus | Mismatch penalty |
|----------|------------|------------------|
| `idempotent` | +2 | -3 |
| `involution` | +2 | -3 |
| `identity` | +2 | -3 |
| `even_function` | +1 | -2 |
| `odd_function` | +1 | -2 |
| `non_negative` | +1 | -2 |
| `commutative` | +1 | -2 |
| `associative` | +1 | -2 |
| `monotonic_increasing` | +1 | -1 |
| `monotonic_decreasing` | +1 | -1 |
| `fixed_points` | 0 | 0 |

Hypotheses are sorted by property score first, then by confidence.

### 4.7 Intent Hypothesis Templates

The intent engine (`intent.mjs`) supplements the numeric solver with hypothesis templates for non-numeric domains:

**Array operations:**
- `sort`: `[...x].sort((a, b) => a - b)` (confidence: 0.95)
- `filter_even`: `x.filter(n => n % 2 === 0)` (confidence: 0.9)
- `filter_odd`: `x.filter(n => n % 2 !== 0)` (confidence: 0.9)
- `filter_positive`: `x.filter(n => n > 0)` (confidence: 0.9)
- `map_double`: `x.map(n => n * 2)` (confidence: 0.9)
- `map_square`: `x.map(n => n * n)` (confidence: 0.9)
- `map_negate`: `x.map(n => -n)` (confidence: 0.9)
- `reduce_sum`: `x.reduce((a, b) => a + b, 0)` (confidence: 0.95)
- `reduce_product`: `x.reduce((a, b) => a * b, 1)` (confidence: 0.9)
- `reduce_min`: `Math.min(...x)` (confidence: 0.9)
- `reduce_max`: `Math.max(...x)` (confidence: 0.9)
- `reduce_length`: `x.length` (confidence: 0.9)
- `array_reverse`: `[...x].reverse()` (confidence: 0.9)

**String operations:**
- `string_upper`: `x.toUpperCase()` (confidence: 0.95)
- `string_lower`: `x.toLowerCase()` (confidence: 0.95)
- `string_reverse`: `x.split("").reverse().join("")` (confidence: 0.85)
- `string_trim`: `x.trim()` (confidence: 0.9)
- `string_length`: `x.length` (confidence: 0.9)

**Generic linear map fallback:**
When no template matches, the intent engine attempts to fit an element-wise linear map: `output[i] = a * input[i] + b` across all array examples.

---

## 5. Composition Laws (Derivation Rules)

The `DERIVATION_RULES` in `protocol.mjs` define the shared "grammar" of function algebra. Both sender and receiver know these rules, so properties derivable from them need not be transmitted.

### 5.1 Rule Table

| Rule ID | Predicts | Condition (on properties of f, g for f . g) |
|---------|----------|----------------------------------------------|
| `even_odd_even` | `even_composition` | f is `even_function` AND g is `odd_function` |
| `even_even_even` | `even_composition` | f is `even_function` AND g is `even_function` |
| `any_even_even` | `even_composition` | g is `even_function` |
| `nonneg_any_nonneg` | `non_negative_composition` | f is `non_negative` |
| `even_invol_absorb` | `absorption` | f is `even_function` AND g is `involution` |
| `any_id_absorb` | `absorption` | g is `identity` |
| `id_any_transparent` | `f_transparent` | f is `identity` |
| `invol_self_identity` | `composition_identity` | f and g are the same function AND f is `involution` |
| `nonneg_absorb_nonneg` | `non_negative_composition` | g is `non_negative` |
| `even_idempotent_absorb` | `absorption` | f is `even_function` AND g is `idempotent` AND g is `even_function` |
| `nonneg_transparent` | `f_transparent` | f is `non_negative` AND g is `non_negative` AND f is `idempotent` |

### 5.2 Composition Property Definitions

| Property | Formal Definition | Verification |
|----------|-------------------|--------------|
| `even_composition` | (f . g)(-x) = (f . g)(x) for all x | Tested over positive samples {1, 3, 5}, verifying f(g(x)) = f(g(-x)) |
| `non_negative_composition` | (f . g)(x) >= 0 for all x | Tested over samples {-3, -1, 0, 1, 3, 5} |
| `absorption` | f(g(x)) = f(x) for all x | Verified: for all sample x, f(g(x)) = f(x) |
| `f_transparent` | f(g(x)) = g(x) for all x | Verified: for all sample x, f(g(x)) = g(x) |
| `composition_identity` | f(g(x)) = x for all x | Verified: for all sample x, f(g(x)) = x |

### 5.3 Surprise Mechanism

During encoding, every composition pair (f, g) where both are unary and f != g is analyzed. For each discovered composition property, the encoder checks whether any derivation rule predicts it. If no rule matches, the property is recorded as a **surprise** and transmitted in `algebra.surprises`.

This is a form of differential compression: only transmit what cannot be reconstructed from shared knowledge.

---

## 6. Verification Protocol

The full encode-decode-verify cycle proceeds as follows:

### Step 1: Sender Encodes Module

```
encode(source) -> message
```

1. Parse source into AST, extract fingerprint (function names, arities, assertions).
2. For each function definition, run `infer()` to discover properties.
3. Discover equivalence classes via behavioral hashing.
4. Discover inverse pairs among unary functions.
5. Analyze all unary composition pairs; record non-derivable surprises.
6. Emit protocol message (JSON).

### Step 2: Message Transmission

The JSON message is transmitted. It contains:
- Function names, arities, and assertions
- Discovered properties (type identifiers only)
- Algebraic structure (equivalences, inverses, surprises)
- **No source code**

### Step 3: Receiver Synthesizes Functions

```
decode(message) -> result
```

1. Validate protocol version.
2. Pass `{ functions }` to `synthesize()`.
3. For each synthesized function, transpile the Benoit code to JavaScript and instantiate a callable function.

### Step 4: Receiver Verifies Assertions

For each function and each assertion:
1. Evaluate the assertion's input expression using all synthesized functions.
2. Compare the result to the expected output.
3. Record pass/fail.

### Step 5: Receiver Verifies Properties

For each function and each claimed property:
1. Invoke `verifyProperty(fn, propType, arity)` using the sample space `[-10, -5, -3, -1, 0, 1, 3, 5, 10, 42]`.
2. Record pass/fail.

### Step 6: Receiver Verifies Compositions

1. **Derivation rules**: For every pair of unary functions, check if any DERIVATION_RULE fires based on their properties. If so, verify the predicted composition property against the synthesized functions.
2. **Surprises**: For each surprise in the message, verify the claimed composition property.

### Step 7: Report

Return verification totals:
```json
{
  "assertions": { "passed": N, "total": M },
  "properties": { "passed": N, "total": M },
  "compositions": { "reconstructed": N, "verified": M }
}
```

---

## 7. Contract Protocol

### Step 1: Publish Need

An agent publishes a behavioral requirement:

```javascript
publishNeed({
  name: "sorter",
  examples: [{ input: [3,1,2], output: [1,2,3] }],
  properties: ["idempotent", "length_preserving"],
  domain: "array",
  range: "array"
})
```

Returns a need object with a unique ID and an attached `verify()` function.

### Step 2: Publish Offer

Another agent offers an implementation:

```javascript
publishOffer(needId, { fn: mySort, confidence: 0.9 }, need)
```

If the need object is provided, the offer is immediately verified against all examples and properties.

### Step 3: Negotiate

When multiple offers exist for a need:

```javascript
negotiate(need, [offer1, offer2, offer3])
```

Each offer is scored according to the formula in Section 2.3.5 and ranked descending.

### Step 4: Bind

The best offer (or a manually chosen one) is locked into a contract:

```javascript
bind(need, bestOffer)
```

The contract records the examples as the permanent behavioral interface. Any future implementation must pass these examples.

### Step 5: Verify Compatibility

When an implementation is updated:

```javascript
verify(contract, newImplementation)
```

Returns a compatibility report indicating whether the new implementation satisfies all contracted examples and properties.

### Registry

The `Registry` class provides a centralized marketplace:
- `publishNeed(spec)` -- register a need
- `publishOffer(needId, impl)` -- offer an implementation
- `search(properties)` -- find needs by property overlap
- `searchByName(name)` -- find needs by substring match
- `resolve(needId)` -- auto-select best offer and bind
- `verify(contractId, newImpl)` -- check backward compatibility
- `getNeeds()`, `getOffers(needId)`, `getContracts()` -- introspection

---

## 8. Intent Protocol

### Step 1: Encode Intent

```javascript
encodeIntent(examples, properties, constraints)
```

Creates a behavioral specification. Domain and range are inferred from the first example if not provided:
- Array input -> `"array"`
- String input -> `"string"`
- Otherwise -> `"number"`

### Step 2: Resolve Intent

```javascript
resolveIntent(intent)
```

Synthesis proceeds in order:

1. **Numeric solver** (`solve.mjs`): Wraps examples into the assertion format and delegates to `synthesize()`. Only applies when all inputs and outputs are numeric.
2. **Hypothesis templates**: Tests each built-in template (Section 4.7) against all examples.
3. **Generic linear map**: Fits `output[i] = a * input[i] + b` for array-of-numbers examples.

Candidates are ranked by:
1. Property compliance score: `satisfied.length - violated.length * 2`
2. Confidence (descending)

If the best candidate violates required properties and is the only candidate, its confidence is halved as a penalty.

### Step 3: Execute Intent

```javascript
executeIntent(intent, newInput)
```

Resolves the intent if not already resolved, then applies the synthesized function to the new input. Throws if synthesis failed.

### Step 4: Compose Intents

```javascript
composeIntents(intentA, intentB)
```

Creates a pipeline: `output = B(A(input))`. Composed examples are derived from A's original inputs. Confidence degrades: `min(confA, confB) * 0.95`.

### Step 5: Negotiate (Renegotiate)

```javascript
negotiateIntent(intent, counterExamples)
```

Adds counter-examples to the intent. If a counter-example's input matches an existing example, it overrides the output (correction). The merged example set is re-encoded and re-resolved.

This implements the "I meant THIS, not THAT" feedback loop.

---

## 9. Safety Guarantees

### 9.1 Magnitude Cap in Composition Verification

All composition verifiers (`verifyComposition` in `protocol.mjs`) enforce a magnitude cap of **30** on intermediate values. If `|g(x)| > 30`, the sample is skipped rather than propagated to `f`. This prevents exponential blowup when composing functions like exponentials or recursive functions.

```
if Math.abs(g(x)) > 30 then SKIP (return true, do not count as failure)
```

### 9.2 Bounded Sample Spaces

| Context | Sample Space | Size |
|---------|-------------|------|
| Property inference (unary) | {-10, -3, -2, -1, 0, 1, 2, 3, 5, 10, 42, 100} | 12 |
| Property inference (binary) | S x S | 144 |
| Property inference (ternary) | {-5,0,5,10,50,100,200} x {0,10} x {50,100} | 28 |
| Protocol verification | {-10, -5, -3, -1, 0, 1, 3, 5, 10, 42} | 10 |
| Composition verification | {-3, -1, 0, 1, 3, 5} | 6 |
| Cross-module analysis | {-10, -3, -2, -1, 0, 1, 2, 3, 5, 10, 42} | 11 |
| Solver unknown search | [-1000, 1000] integers | 2001 |

### 9.3 Safe Function Evaluation

All function evaluations are wrapped in try/catch to prevent runtime errors from propagating. The `safe(fn, ...args)` pattern is used throughout:

```javascript
function safe(fn, ...args) {
  try { return { ok: true, value: fn(...args) }; }
  catch { return { ok: false }; }
}
```

Failed evaluations are silently skipped, never counted as property violations.

### 9.4 Deep Equality via JSON Serialization

The contract and intent systems use `JSON.stringify(a) === JSON.stringify(b)` for deep equality. This is exact for JSON-serializable values but does not handle:
- `undefined` values in arrays
- Circular references
- Functions as values
- `-0` vs `+0`
- `NaN` comparisons

### 9.5 Confidence Degradation

- Composition reduces confidence: `min(a, b) * 0.95`
- Property violations halve confidence: `confidence *= 0.5`
- Conditional synthesis caps at 0.85
- String pattern matching caps at 0.85-0.95

---

## 10. Module Composition

The `composeModules()` function (`compose.mjs`) merges multiple Benoit source modules into a unified algebra.

### 10.1 Name Collision Resolution

If two modules define functions with the same name, the later module's function is renamed to `<name>_m<moduleIndex>`.

### 10.2 Cross-Module Discovery

Three types of cross-module relationships are discovered (only between functions from **different** modules, unary only):

1. **Equivalences**: Functions with identical behavior hashes (same output for all 11 sample values).
2. **Inverse pairs**: Functions f, g where f(g(x)) = x AND g(f(x)) = x for all 11 samples.
3. **Composition properties**: For each cross-module pair (f, g), the composed function f . g is tested for:
   - `composition_identity`: f(g(x)) = x for all samples
   - `absorption`: f(g(x)) = f(x) for all samples (and not identity)
   - `even_composition`: f(g(-x)) = f(g(x)) for all samples with x != 0
   - `non_negative_composition`: f(g(x)) >= 0 for all samples, with at least one x < 0

### 10.3 Diff

The `diff(messageA, messageB)` function compares two protocol messages:
- New functions (in B but not A)
- Changed functions (same name, different assertions or properties)
- Removed functions (in A but not B)
- `isCompatible`: true if no functions were removed

---

## 11. Solver: Unknown Resolution

The `solve(assertion, knownFunctions)` function resolves unknowns marked with `?` in assertions:

```
add(?, 3) == 5  -->  ? = 2
```

**Algorithm**: Brute-force search over integers in [-1000, 1000]. For each candidate value, substitute it into the assertion and check if the result matches.

Returns:
```json
{
  "assertion": "<original string>",
  "unknown": "arg[<index>]",
  "solutions": [<number>],
  "unique": "<boolean: true if exactly one solution>"
}
```

---

## Appendix A: Protocol Constants

| Constant | Value | Location |
|----------|-------|----------|
| `PROTOCOL_VERSION` | `"benoit-protocol-v1"` | `protocol.mjs` |
| Unary sample space | `[-10, -3, -2, -1, 0, 1, 2, 3, 5, 10, 42, 100]` | `infer.mjs` |
| Binary associativity triples | `[(-1,0,1), (1,2,3), (2,3,5), (0,5,10)]` | `infer.mjs` |
| Composition sample space | `[-3, -1, 0, 1, 3, 5]` | `protocol.mjs` |
| Magnitude cap | 30 | `protocol.mjs` |
| Unknown search range | [-1000, 1000] | `solve.mjs` |
| Numeric tolerance | 0.001 (general), 0.01 (trig/sqrt), 0.1 (exp/log) | `solve.mjs` |
| Need ID prefix | `"need-"` | `contract.mjs` |
| Offer ID prefix | `"offer-"` | `contract.mjs` |
| Contract ID prefix | `"contract-"` | `contract.mjs` |

## Appendix B: Exported API Surface

### protocol.mjs
- `PROTOCOL_VERSION: string`
- `encode(source: string): ProtocolMessage`
- `decode(message: string | object): DecodedResult`
- `exchange(source: string): ExchangeReport`

### intent.mjs
- `encodeIntent(examples, properties?, constraints?): Intent`
- `resolveIntent(intent): ResolvedIntent`
- `executeIntent(intent, input): any`
- `composeIntents(intentA, intentB): ComposedIntent`
- `negotiateIntent(intent, counterExamples): ResolvedIntent`

### contract.mjs
- `publishNeed(spec): Need`
- `publishOffer(needId, implementation, need?): Offer`
- `negotiate(need, offers): RankedOffer[]`
- `bind(need, offer): Contract`
- `verify(contract, newImplementation): VerificationReport`
- `Registry` class (methods: `publishNeed`, `publishOffer`, `search`, `searchByName`, `resolve`, `getOffers`, `getNeeds`, `getContracts`, `verify`)

### compose.mjs
- `composeModules(...sources: string[]): ComposedModule`
- `compose(...messages: ProtocolMessage[]): ComposedModule`
- `diff(messageA, messageB): DiffReport`

### infer.mjs
- `infer(benSrc: string): InferenceResult`
- `inferAll(benSrc: string): InferenceResult[]`

### solve.mjs
- `synthesize(fp: Fingerprint): SynthesisResult[]`
- `solve(assertion: string, knownFunctions: object): SolveResult`
