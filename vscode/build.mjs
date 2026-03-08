#!/usr/bin/env node

// Build script: converts ESM prompt.mjs → CJS lib/prompt.cjs for VSCode extension
// VSCode extensions require CommonJS. Benoit core is ESM. This bridges.

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = join(__dirname, "..", "src", "prompt.mjs");
const dest = join(__dirname, "lib", "prompt.cjs");

mkdirSync(join(__dirname, "lib"), { recursive: true });

let code = readFileSync(src, "utf8");

// Convert ESM exports to CJS
code = code.replace(/^export function /gm, "function ");
code = code.replace(/^export /gm, "");

// Add CJS exports at the end
code += `
module.exports = {
  analyzePrompt,
  toStructured,
  comparePrompts,
  encodePrompt,
  decodePrompt,
  pipeline,
};
`;

writeFileSync(dest, code, "utf8");
console.log(`Built: ${dest}`);
console.log(`Size: ${(code.length / 1024).toFixed(1)} KB`);
