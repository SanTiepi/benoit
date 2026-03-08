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

const [,, command, ...files] = process.argv;

if (command === "repl") {
  startRepl();
} else if (!command || !files.length) {
  console.log(`
  Benoît v0.4.0 — A programming language for human-AI collaboration
  En mémoire de Benoît Fragnière

  Usage:
    benoit transpile <file.ben>   Transpile to JavaScript
    benoit run <file.ben>         Transpile and execute
    benoit test <file.ben>        Run inline assertions
    benoit check <file.ben>       Transpile + test + stats
    benoit stats <file.ben>       Token/noise analysis
    benoit watch <file.ben>       Watch and re-run on change
    benoit repl                   Interactive REPL session
  `);
  process.exit(0);
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
