#!/usr/bin/env node
// Benoît CLI — transpile, run, and test .ben files
// Named after Benoît Fragnière, who loved science.
//
// Usage:
//   benoit transpile <file.ben>        → output JS to stdout
//   benoit run <file.ben>              → transpile and execute
//   benoit test <file.ben>             → extract and run inline assertions
//   benoit check <file.ben>            → transpile + test + stats
//   benoit stats <file.ben>            → token/noise analysis

import { readFileSync, writeFileSync, unlinkSync, watchFile } from "node:fs";
import { transpile, extractTests, BenoitError } from "../src/transpile.mjs";
import { parse, fingerprint, efficiency } from "../src/ast.mjs";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { estimateTokens, compare, noiseAnalysis } from "../src/tokenizer.mjs";
import { startRepl } from "../src/repl.mjs";
import { infer } from "../src/infer.mjs";
import { optimize } from "../src/optimize.mjs";
import { encode, exchange } from "../src/protocol.mjs";
import { composeModules } from "../src/compose.mjs";
import { inferTypes } from "../src/types.mjs";
import { encodeIntent, resolveIntent, executeIntent } from "../src/intent.mjs";
import { pipeline, analyzePrompt, comparePrompts } from "../src/prompt.mjs";

const [,, command, ...files] = process.argv;

if (command === "repl") {
  startRepl();
} else if (!command || !files.length) {
  console.log(`
  Benoît v0.7.0 — A behavioral protocol for AI-to-AI communication
  En mémoire de Benoît Fragnière

  Usage:
    benoit transpile <file.ben>   Transpile to JavaScript
    benoit run <file.ben>         Transpile and execute
    benoit test <file.ben>        Run inline assertions
    benoit check <file.ben>       Transpile + test + stats
    benoit stats <file.ben>       Token/noise analysis
    benoit watch <file.ben>       Watch and re-run on change
    benoit repl                   Interactive REPL session

    benoit infer <file.ben>       Discover algebraic properties
    benoit optimize <file.ben>    Self-optimize using discovered rules
    benoit encode <file.ben>      Encode module for AI-to-AI transmission
    benoit exchange <file.ben>    Full encode → decode → verify cycle
    benoit compose <a.ben> <b.ben> Compose modules, find cross-module algebra
    benoit types <file.ben>       Discover function type signatures
    benoit intent <file.json>     Resolve behavioral intent from examples

    benoit compile <file>         Compile prompt — quality gate + back-translation
    benoit compare <a> <b>        Compare two prompt files side by side
  `);
  process.exit(0);
} else if (command === "compose") {
  if (files.length < 2) {
    console.error("compose requires at least 2 files");
    process.exit(1);
  }
  const sources = files.map(f => readFileSync(f, "utf8"));
  const result = composeModules(...sources);
  console.log(`Modules composed: ${result.modulesComposed}`);
  console.log(`Functions: ${result.stats.totalFunctions}`);
  console.log(`Cross-module equivalences: ${result.stats.crossEquivalences}`);
  console.log(`Cross-module inverses: ${result.stats.crossInverses}`);
  console.log(`Cross-module compositions: ${result.stats.crossCompositions}`);
  if (result.crossModule.equivalences.length > 0) {
    console.log("\nEquivalences:");
    for (const eq of result.crossModule.equivalences) {
      console.log(`  ${eq.functionA} ≡ ${eq.functionB}`);
    }
  }
  if (result.crossModule.inverses.length > 0) {
    console.log("\nInverse pairs:");
    for (const inv of result.crossModule.inverses) {
      console.log(`  ${inv.f} ↔ ${inv.g}`);
    }
  }
} else {

for (const file of files) {
  const src = readFileSync(file, "utf8");

  switch (command) {
    case "transpile": {
      console.log(transpile(src, { filename: file }));
      break;
    }

    case "run": {
      const js = transpile(src, { filename: file });
      const tmpFile = join(tmpdir(), `ben_run_${Date.now()}.mjs`);
      writeFileSync(tmpFile, js);
      try {
        await import(pathToFileURL(tmpFile).href);
      } finally {
        unlinkSync(tmpFile);
      }
      break;
    }

    case "test": {
      const { assertions } = extractTests(src);
      if (assertions.length === 0) {
        console.log(`${file}: no inline assertions found`);
        break;
      }

      const js = transpile(src, { filename: file });
      const tmpFile = join(tmpdir(), `ben_test_${Date.now()}.mjs`);
      writeFileSync(tmpFile, js);

      try {
        const mod = await import(pathToFileURL(tmpFile).href);
        let passed = 0;
        let failed = 0;

        for (const a of assertions) {
          try {
            const fn = new Function(...Object.keys(mod), `return ${a.expr}`);
            const result = fn(...Object.values(mod));
            const expectedFn = new Function(...Object.keys(mod), `return ${a.expected}`);
            const expected = expectedFn(...Object.values(mod));

            if (a.negate) {
              if (result === expected) throw new Error(`Expected ${a.expr} != ${a.expected}`);
            } else {
              if (result !== expected && JSON.stringify(result) !== JSON.stringify(expected)) {
                throw new Error(`Expected ${expected}, got ${result}`);
              }
            }
            console.log(`  ✓ line ${a.line}: ${a.expr} ${a.negate ? "!=" : "=="} ${a.expected}`);
            passed++;
          } catch (e) {
            console.log(`  ✗ line ${a.line}: ${a.expr} ${a.negate ? "!=" : "=="} ${a.expected}`);
            console.log(`    ${e.message}`);
            failed++;
          }
        }

        console.log(`\n${file}: ${passed} passed, ${failed} failed, ${assertions.length} total`);
        if (failed > 0) process.exitCode = 1;
      } finally {
        unlinkSync(tmpFile);
      }
      break;
    }

    case "check": {
      console.log(`=== ${file} ===\n`);

      const js = transpile(src, { filename: file });
      console.log("--- Transpiled JS ---");
      console.log(js);

      const srcTokens = estimateTokens(src);
      const jsTokens = estimateTokens(js);
      const srcNoise = noiseAnalysis(src);
      const jsNoise = noiseAnalysis(js);
      console.log("\n--- Stats ---");
      console.log(`Benoît: ${srcTokens} tokens, ${srcNoise.noise_pct}% noise`);
      console.log(`JS out: ${jsTokens} tokens, ${jsNoise.noise_pct}% noise`);
      console.log(`Lines:  ${src.split("\n").filter(l => l.trim()).length} ben → ${js.split("\n").filter(l => l.trim()).length} js`);

      const { assertions } = extractTests(src);
      if (assertions.length > 0) {
        console.log(`\n--- Inline tests (${assertions.length}) ---`);
        const tmpFile = join(tmpdir(), `ben_check_${Date.now()}.mjs`);
        writeFileSync(tmpFile, js);
        try {
          const mod = await import(pathToFileURL(tmpFile).href);
          let passed = 0;
          for (const a of assertions) {
            try {
              const fn = new Function(...Object.keys(mod), `return ${a.expr}`);
              const result = fn(...Object.values(mod));
              const expectedFn = new Function(...Object.keys(mod), `return ${a.expected}`);
              const expected = expectedFn(...Object.values(mod));
              if (!a.negate && (result === expected || JSON.stringify(result) === JSON.stringify(expected))) {
                console.log(`  ✓ ${a.expr} == ${a.expected}`);
                passed++;
              } else if (a.negate && result !== expected) {
                console.log(`  ✓ ${a.expr} != ${a.expected}`);
                passed++;
              } else {
                console.log(`  ✗ ${a.expr} == ${a.expected} (got ${result})`);
              }
            } catch (e) {
              console.log(`  ✗ ${a.expr}: ${e.message}`);
            }
          }
          console.log(`\nResult: ${passed}/${assertions.length} assertions passed`);
        } finally {
          unlinkSync(tmpFile);
        }
      } else {
        console.log("\nNo inline tests found.");
      }
      break;
    }

    case "watch": {
      console.log(`Watching ${file} for changes...`);
      const run = () => {
        try {
          const freshSrc = readFileSync(file, "utf8");
          const js = transpile(freshSrc, { filename: file });
          const tmpFile = join(tmpdir(), `ben_watch_${Date.now()}.mjs`);
          writeFileSync(tmpFile, js);
          import(pathToFileURL(tmpFile).href)
            .then(() => console.log(`\n✓ ${file} — OK`))
            .catch(e => console.error(`\n✗ Runtime error: ${e.message}`))
            .finally(() => unlinkSync(tmpFile));
        } catch (e) {
          if (e instanceof BenoitError) {
            console.error(`\n✗ ${e.format(file)}`);
          } else {
            console.error(`\n✗ ${e.message}`);
          }
        }
      };
      run();
      watchFile(file, { interval: 500 }, run);
      break;
    }

    case "ast": {
      const ast = parse(src);
      console.log(JSON.stringify(ast, null, 2));
      break;
    }

    case "fingerprint": {
      const ast = parse(src);
      const fp = fingerprint(ast);
      console.log(JSON.stringify(fp, null, 2));
      break;
    }

    case "efficiency": {
      const eff = efficiency(src);
      console.log(`${file} — Representation efficiency:\n`);
      console.log(`  Source text:   ${eff.source.chars} chars, ~${eff.source.tokens} tokens`);
      console.log(`  AST (JSON):   ${eff.ast.chars} chars, ~${eff.ast.tokens} tokens`);
      console.log(`  Fingerprint:  ${eff.fingerprint.chars} chars, ~${eff.fingerprint.tokens} tokens`);
      console.log(`\n  AST vs source:         ${eff.ratios.ast_vs_source} token reduction`);
      console.log(`  Fingerprint vs source: ${eff.ratios.fingerprint_vs_source} token reduction`);
      break;
    }

    case "stats": {
      const jsEquivalent = transpile(src, { filename: file });
      const result = compare(jsEquivalent, src);
      const srcNoise = noiseAnalysis(src);
      const jsNoise = noiseAnalysis(jsEquivalent);
      console.log(`${file}:`);
      console.log(`  Benoît: ${result.mcl_tokens} tokens, ${srcNoise.noise_pct}% noise`);
      console.log(`  JS:     ${result.original_tokens} tokens, ${jsNoise.noise_pct}% noise`);
      console.log(`  Saving: ${result.savings_pct}% tokens`);
      console.log(`  Density: ${result.density_ratio}x`);
      break;
    }

    case "infer": {
      const blocks = src.split("\n\n").filter(b => b.trim());
      for (const block of blocks) {
        const defLine = block.split("\n").find(l => l.match(/^\w+\s+[\w,\s]+?\s*->/));
        if (!defLine) continue;
        try {
          const result = infer(defLine);
          console.log(`${result.name}:`);
          if (result.properties.length === 0) {
            console.log("  (no properties discovered)");
          } else {
            for (const p of result.properties) {
              console.log(`  ${p.type}${p.evidence ? " — " + p.evidence.join(", ") : ""}`);
            }
          }
        } catch (e) { console.log(`  error: ${e.message}`); }
      }
      break;
    }

    case "optimize": {
      const result = optimize(src);
      console.log(result.optimized);
      if (result.stats.optimizations > 0) {
        console.error(`\n--- ${result.stats.optimizations} optimizations applied ---`);
        for (const [type, count] of Object.entries(result.stats.byType)) {
          console.error(`  ${type}: ${count}`);
        }
      }
      break;
    }

    case "encode": {
      const msg = encode(src);
      console.log(JSON.stringify(msg, null, 2));
      break;
    }

    case "exchange": {
      const result = exchange(src);
      console.log(`Functions: ${result.summary.functionsTransmitted}`);
      console.log(`Properties: ${result.summary.propertiesTransmitted}`);
      console.log(`Surprises: ${result.summary.surprisesTransmitted}`);
      console.log(`Source code transmitted: ${result.summary.sourceCodeTransmitted}`);
      console.log(`Verification: ${result.summary.verificationRate}`);
      console.log(`Message size: ${result.messageSize} chars (source: ${result.sourceSize} chars)`);
      break;
    }

    case "intent": {
      const intent = JSON.parse(src);
      const resolved = resolveIntent(intent);
      if (resolved.meta.status === "resolved") {
        console.log(`Resolved: ${resolved.meta.formula}`);
        console.log(`Confidence: ${resolved.meta.confidence}`);
        if (resolved.properties.length > 0) {
          console.log(`Properties: ${resolved.properties.join(", ")}`);
        }
      } else {
        console.log("Could not resolve intent from given examples.");
      }
      break;
    }

    case "types": {
      const results = inferTypes(src);
      for (const r of results) {
        if (r.error) { console.log(`  ${r.error}`); continue; }
        console.log(`${r.signature}`);
        if (r.constraints.length > 0) {
          console.log(`  ${r.constraints.join(", ")}`);
        }
      }
      break;
    }

    case "compile": {
      const result = pipeline(src);
      const icon = result.ready ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m";
      const scoreStr = `${(result.encoded.analysis.score * 100).toFixed(0)}%`;
      console.log(`${icon} ${file}: ${scoreStr} (${result.verdict})`);
      console.log();
      console.log(result.confirmation);
      if (!result.ready) process.exitCode = 1;
      break;
    }

    case "compare": {
      if (files.length < 2) {
        console.error("compare requires 2 files");
        process.exit(1);
      }
      const srcA = readFileSync(files[0], "utf8");
      const srcB = readFileSync(files[1], "utf8");
      const result = comparePrompts(srcA, srcB);
      console.log(`  A (${files[0]}): ${(result.a.score * 100).toFixed(0)}% (${result.a.verdict}) — ${result.a.tokens} tokens`);
      console.log(`  B (${files[1]}): ${(result.b.score * 100).toFixed(0)}% (${result.b.verdict}) — ${result.b.tokens} tokens`);
      console.log(`  Winner: ${result.winner}`);
      console.log(`  Token diff: ${result.tokenDiff > 0 ? "A uses " + result.tokenDiff + " more" : "B uses " + (-result.tokenDiff) + " more"}`);
      process.exit(0);
    }

    default:
      console.error(`Unknown command: ${command}`);
      process.exit(1);
  }
}
}

// Global error handler for BenoitError
process.on("uncaughtException", (e) => {
  if (e instanceof BenoitError) {
    console.error(e.format());
    process.exit(1);
  }
  throw e;
});
