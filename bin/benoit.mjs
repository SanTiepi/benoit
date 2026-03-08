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

import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { transpile, extractTests } from "../src/transpile.mjs";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { estimateTokens, compare, noiseAnalysis } from "../src/tokenizer.mjs";

const [,, command, ...files] = process.argv;

if (!command || !files.length) {
  console.log(`
  Benoît v0.3.0 — A programming language for human-AI collaboration
  En mémoire de Benoît Fragnière

  Usage:
    benoit transpile <file.ben>   Transpile to JavaScript
    benoit run <file.ben>         Transpile and execute
    benoit test <file.ben>        Run inline assertions
    benoit check <file.ben>       Transpile + test + stats
    benoit stats <file.ben>       Token/noise analysis
  `);
  process.exit(0);
}

for (const file of files) {
  const src = readFileSync(file, "utf8");

  switch (command) {
    case "transpile": {
      console.log(transpile(src));
      break;
    }

    case "run": {
      const js = transpile(src);
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

      const js = transpile(src);
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

      const js = transpile(src);
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

    case "stats": {
      const jsEquivalent = transpile(src);
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

    default:
      console.error(`Unknown command: ${command}`);
      process.exit(1);
  }
}
