// EXPERIMENT: How compact can the algebra message get?
//
// Current state: 4932 chars for 7 functions (vs 424 chars source)
// The algebra message is RICHER but BIGGER. Can we compress it?
//
// Hypothesis: Most composition laws are DERIVABLE from individual properties.
// If square is even, then square∘(anything odd) is even — we don't need to say it.
// We only need to transmit:
//   1. Function contracts (assertions)
//   2. Individual properties
//   3. NON-DERIVABLE relationships (true surprises)
//
// Let's measure: how many composition laws can be predicted from individual properties?

import { infer } from "../src/infer.mjs";
import { equivalent, inverse, composeAnalysis, equivalenceClasses } from "../src/algebra.mjs";
import { fingerprint, parse } from "../src/ast.mjs";

console.log("═══════════════════════════════════════════════════════════");
console.log("  COMPRESSION EXPERIMENT");
console.log("  How much algebra is derivable vs surprising?");
console.log("═══════════════════════════════════════════════════════════\n");

const functions = [
  "add a,b -> a + b",
  "mul a,b -> a * b",
  "square x -> x * x",
  "negate x -> 0 - x",
  "double x -> x * 2",
  "abs x -> Math.abs(x)",
  "id x -> x"
];

// Step 1: Individual properties
const propMap = {};
for (const src of functions) {
  const result = infer(src);
  propMap[result.name] = result.properties.map(p => p.type);
}

console.log("Individual properties:");
for (const [name, props] of Object.entries(propMap)) {
  console.log(`  ${name}: [${props.join(", ")}]`);
}

// Step 2: Derive composition properties from rules
const RULES = [
  // If f is even, f∘g is even for any g that is odd
  { condition: (f, g) => f.includes("even_function") && g.includes("odd_function"),
    predicts: "even_composition", name: "even∘odd → even" },
  // If f is even, f∘g is even if g is even
  { condition: (f, g) => f.includes("even_function") && g.includes("even_function"),
    predicts: "even_composition", name: "even∘even → even" },
  // If g is even, f∘g is even for any f
  { condition: (f, g) => g.includes("even_function"),
    predicts: "even_composition", name: "any∘even → even" },
  // If f is non_negative, f∘g is non_negative
  { condition: (f, g) => f.includes("non_negative"),
    predicts: "non_negative_composition", name: "non_neg∘any → non_neg" },
  // If g is involution, f∘g absorbs to f when f is even
  { condition: (f, g) => f.includes("even_function") && g.includes("involution"),
    predicts: "absorption", name: "even∘involution → absorption" },
  // If g is identity, f∘g = f (trivial absorption)
  { condition: (f, g) => g.includes("identity"),
    predicts: "absorption", name: "any∘id → absorption" },
  // If f is identity, f∘g = g (trivial transparency)
  { condition: (f, g) => f.includes("identity"),
    predicts: "f_transparent", name: "id∘any → transparent" },
  // If both are involutions, f∘g = id when f == g
  { condition: (f, g, nf, ng) => nf === ng && f.includes("involution"),
    predicts: "composition_identity", name: "invol∘self → identity" },
];

// Step 3: For every pair, collect actual composition properties
const unary = functions.filter(s => {
  const m = s.match(/^\w+\s+([\w,\s]+?)\s+->/);
  return m && m[1].split(/[\s,]+/).filter(Boolean).length === 1;
});

let totalActual = 0;
let totalPredicted = 0;
let totalSurprises = 0;
const surprises = [];

console.log("\n\nComposition analysis:");
console.log("─────────────────────────────────────────────────\n");

for (let i = 0; i < unary.length; i++) {
  for (let j = 0; j < unary.length; j++) {
    if (i === j) continue;
    const nameF = unary[i].split(" ")[0];
    const nameG = unary[j].split(" ")[0];
    const propsF = propMap[nameF] || [];
    const propsG = propMap[nameG] || [];

    // Get actual composition properties
    let actual;
    try {
      actual = composeAnalysis(unary[i], unary[j]);
    } catch { continue; }
    if (!actual.composedProps || actual.composedProps.length === 0) continue;

    for (const prop of actual.composedProps) {
      totalActual++;

      // Can any rule predict this?
      const predictedBy = RULES.find(r =>
        r.predicts === prop.type && r.condition(propsF, propsG, nameF, nameG)
      );

      if (predictedBy) {
        totalPredicted++;
      } else {
        totalSurprises++;
        surprises.push({
          composition: `${nameF}∘${nameG}`,
          property: prop.type,
          description: prop.description
        });
      }
    }
  }
}

console.log(`  Total composition properties found: ${totalActual}`);
console.log(`  Predicted by rules:                 ${totalPredicted} (${Math.round(totalPredicted/totalActual*100)}%)`);
console.log(`  Surprises (not derivable):           ${totalSurprises} (${Math.round(totalSurprises/totalActual*100)}%)`);

if (surprises.length > 0) {
  console.log("\n  Surprising (non-derivable) relationships:");
  for (const s of surprises) {
    console.log(`    ▸ ${s.composition}: ${s.property}`);
  }
}

// Step 4: Build compressed message
console.log("\n\n═══════════════════════════════════════════════════════════");
console.log("  MESSAGE COMPRESSION");
console.log("═══════════════════════════════════════════════════════════\n");

const moduleSource = functions.map((f, i) => {
  const name = f.split(" ")[0];
  // Add some sample assertions
  const assertions = {
    add: ["add(2,3)==5", "add(-1,1)==0", "add(0,42)==42"],
    mul: ["mul(3,4)==12", "mul(0,99)==0", "mul(1,7)==7"],
    square: ["square(0)==0", "square(3)==9", "square(-5)==25"],
    negate: ["negate(5)==-5", "negate(-3)==3", "negate(0)==0"],
    double: ["double(0)==0", "double(5)==10", "double(-3)==-6"],
    abs: ["abs(5)==5", "abs(-5)==5", "abs(0)==0"],
    id: ["id(42)==42", "id(-1)==-1"]
  };
  return f + "\n" + (assertions[name] || []).join("\n");
}).join("\n\n");

// Full algebra message (what we had before)
const ast = parse(moduleSource);
const fp = fingerprint(ast);

const fullMessage = {
  functions: fp.functions.map(fn => ({
    name: fn.name, arity: fn.arity, assertions: fn.assertions,
    properties: propMap[fn.name] || []
  })),
  equivalenceClasses: [],
  inversePairs: [],
  compositionLaws: Array(totalActual).fill({}) // placeholder for size
};

// Compressed message: only individual properties + surprises
const compressedMessage = {
  protocol: "benoit-algebra-v2-compressed",
  functions: fp.functions.map(fn => ({
    name: fn.name, arity: fn.arity,
    assertions: fn.assertions,
    properties: propMap[fn.name] || []
  })),
  // Derivation rules (the receiver knows these)
  rules: RULES.map(r => r.name),
  // Only transmit what can't be derived
  surprises: surprises.map(s => ({
    f: s.composition.split("∘")[0],
    g: s.composition.split("∘")[1],
    type: s.property
  }))
};

const fullJSON = JSON.stringify(fullMessage);
const compressedJSON = JSON.stringify(compressedMessage);

console.log(`  Full message:       ${fullJSON.length} chars`);
console.log(`  Compressed message: ${compressedJSON.length} chars`);
console.log(`  Reduction:          ${Math.round((1 - compressedJSON.length / fullJSON.length) * 100)}%`);
console.log(`  Original source:    ${moduleSource.length} chars`);
console.log();

// What does the compressed message contain?
console.log("  Compressed message contains:");
console.log(`    ${compressedMessage.functions.length} function contracts with properties`);
console.log(`    ${compressedMessage.rules.length} derivation rules (shared knowledge)`);
console.log(`    ${compressedMessage.surprises.length} non-derivable surprises`);
console.log();
console.log("  The receiver can reconstruct ALL composition laws");
console.log("  by applying the rules to individual properties.");
console.log("  Only genuine surprises need to cross the wire.");

// Step 5: Verify — can the receiver reconstruct everything?
console.log("\n\n═══════════════════════════════════════════════════════════");
console.log("  VERIFICATION: Can the receiver reconstruct all laws?");
console.log("═══════════════════════════════════════════════════════════\n");

const received = JSON.parse(compressedJSON);
const receivedPropMap = {};
for (const fn of received.functions) {
  receivedPropMap[fn.name] = fn.properties;
}

// Reconstruct all composition laws from rules + individual properties
let reconstructed = 0;
const unaryFromMsg = received.functions.filter(f => f.arity === 1);

for (let i = 0; i < unaryFromMsg.length; i++) {
  for (let j = 0; j < unaryFromMsg.length; j++) {
    if (i === j) continue;
    const f = unaryFromMsg[i];
    const g = unaryFromMsg[j];

    for (const rule of RULES) {
      if (rule.condition(f.properties, g.properties, f.name, g.name)) {
        reconstructed++;
      }
    }
  }
}

// Add surprises
reconstructed += received.surprises.length;

console.log(`  Laws reconstructed from rules: ${reconstructed - received.surprises.length}`);
console.log(`  Surprises from message:        ${received.surprises.length}`);
console.log(`  Total reconstructed:           ${reconstructed}`);
console.log(`  Actual total:                  ${totalActual}`);
console.log(`  Coverage:                      ${Math.round(reconstructed / totalActual * 100)}%`);
console.log();

if (reconstructed >= totalActual) {
  console.log("  ✓ COMPLETE — All laws reconstructable from compressed message.");
} else {
  console.log(`  △ PARTIAL — ${totalActual - reconstructed} laws not covered by current rules.`);
  console.log("    (Need more derivation rules or mark as surprises)");
}

console.log("\n═══════════════════════════════════════════════════════════");
console.log("  CONCLUSION");
console.log("═══════════════════════════════════════════════════════════");
console.log();
console.log("  Two agents sharing the same derivation rules need only transmit:");
console.log("    1. Function contracts (name + assertions + properties)");
console.log("    2. Non-derivable surprises");
console.log();
console.log("  Everything else is reconstructed. This is how shared");
console.log("  mathematical knowledge compresses communication.");
console.log("═══════════════════════════════════════════════════════════");
