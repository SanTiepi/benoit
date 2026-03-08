// Benoît REPL — interactive transpile-and-eval loop
import { createInterface } from "node:readline";
import { transpile } from "./transpile.mjs";

export function startRepl() {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "ben> ",
  });

  console.log("Benoît REPL v0.3.0 — type expressions, .exit to quit");
  rl.prompt();

  let buffer = [];

  rl.on("line", (line) => {
    if (line.trim() === ".exit") {
      rl.close();
      return;
    }

    // Multi-line: accumulate if line ends with -> or buffer is active
    if (line.trimEnd().endsWith("->")) {
      buffer.push(line);
      process.stdout.write("...  ");
      return;
    }

    if (buffer.length > 0) {
      if (line.trim() === "") {
        // Blank line ends multi-line input
        const src = buffer.join("\n");
        buffer = [];
        evalBenoit(src);
      } else {
        buffer.push(line);
        process.stdout.write("...  ");
        return;
      }
    } else {
      if (line.trim() === "") {
        rl.prompt();
        return;
      }
      evalBenoit(line);
    }

    rl.prompt();
  });

  rl.on("close", () => {
    console.log("\nAu revoir!");
    process.exit(0);
  });

  function evalBenoit(src) {
    try {
      const js = transpile(src);
      // Strip export keywords for REPL evaluation
      const evalJs = js.replace(/^export /gm, "");
      const result = eval(evalJs);
      if (result !== undefined) console.log(result);
    } catch (err) {
      console.error(`Error: ${err.message}`);
    }
  }
}
