// Benoît AST emitter — structured semantic representation
// Instead of text, emit the meaning as a compact binary-friendly structure

/**
 * Parse Benoît source into an AST (Abstract Syntax Tree).
 * This is the first step toward a semantic protocol:
 * agents exchange ASTs instead of source text.
 *
 * @param {string} src - Benoît source code
 * @returns {object[]} - Array of AST nodes
 */
export function parse(src) {
  const lines = src.split("\n");
  return parseBlock(lines, 0, lines.length, 0);
}

function parseBlock(lines, start, end, minIndent) {
  const nodes = [];

  for (let i = start; i < end; i++) {
    const raw = lines[i];
    const indent = raw.match(/^(\s*)/)[1].length;
    const trimmed = raw.trim();

    if (trimmed === "" || trimmed.startsWith("--")) continue;

    // Test assertion: expr == expected
    const assertMatch = trimmed.match(/^(.+?)\s*==\s*(.+)$/);
    if (assertMatch && !trimmed.includes("->") && !trimmed.match(/^\w+\s*:/)) {
      nodes.push({
        type: "assert",
        expr: assertMatch[1].trim(),
        expected: assertMatch[2].trim(),
        line: i + 1
      });
      continue;
    }

    // Import: use module.name
    const useMatch = trimmed.match(/^use\s+(.+)$/);
    if (useMatch) {
      nodes.push({ type: "import", path: useMatch[1], line: i + 1 });
      continue;
    }

    // Binding: name: value
    const bindMatch = trimmed.match(/^(\w+):\s*(.+)$/);
    if (bindMatch && !trimmed.includes("->")) {
      nodes.push({
        type: "binding",
        name: bindMatch[1],
        value: bindMatch[2],
        line: i + 1
      });
      continue;
    }

    // Function (inline): name args -> body
    const fnInline = trimmed.match(/^(async\s+)?(_?\w+)\s+([\w,=\s]+?)\s+->\s+(.+)$/);
    if (fnInline) {
      nodes.push({
        type: "function",
        async: !!fnInline[1],
        name: fnInline[2],
        params: fnInline[3].split(/[\s,]+/).filter(Boolean),
        body: fnInline[4],
        private: fnInline[2].startsWith("_"),
        line: i + 1
      });
      continue;
    }

    // Function (no-arg, inline): name -> body
    const fnNoArg = trimmed.match(/^(async\s+)?(_?\w+)\s+->\s+(.+)$/);
    if (fnNoArg) {
      nodes.push({
        type: "function",
        async: !!fnNoArg[1],
        name: fnNoArg[2],
        params: [],
        body: fnNoArg[3],
        private: fnNoArg[2].startsWith("_"),
        line: i + 1
      });
      continue;
    }

    // Function (block): name args ->
    const fnBlock = trimmed.match(/^(async\s+)?(_?\w+)\s+([\w,=\s]+?)\s+->$/);
    if (fnBlock) {
      const blockEnd = findBlockEnd(lines, i, indent, end);
      nodes.push({
        type: "function",
        async: !!fnBlock[1],
        name: fnBlock[2],
        params: fnBlock[3].split(/[\s,]+/).filter(Boolean),
        body: parseBlock(lines, i + 1, blockEnd, indent + 1),
        private: fnBlock[2].startsWith("_"),
        line: i + 1
      });
      i = blockEnd - 1;
      continue;
    }

    // Function (no-arg, block): name ->
    const fnNoArgBlock = trimmed.match(/^(async\s+)?(_?\w+)\s+->$/);
    if (fnNoArgBlock) {
      const blockEnd = findBlockEnd(lines, i, indent, end);
      nodes.push({
        type: "function",
        async: !!fnNoArgBlock[1],
        name: fnNoArgBlock[2],
        params: [],
        body: parseBlock(lines, i + 1, blockEnd, indent + 1),
        private: fnNoArgBlock[2].startsWith("_"),
        line: i + 1
      });
      i = blockEnd - 1;
      continue;
    }

    // Match expression
    const matchBlock = trimmed.match(/^match\s+(.+)\s+->$/);
    if (matchBlock) {
      const blockEnd = findBlockEnd(lines, i, indent, end);
      const arms = [];
      for (let j = i + 1; j < blockEnd; j++) {
        const armLine = lines[j].trim();
        const armMatch = armLine.match(/^\|\s*(.+?)\s*=>\s*(.+)$/);
        if (armMatch) {
          arms.push({ pattern: armMatch[1], body: armMatch[2] });
        }
      }
      nodes.push({
        type: "match",
        subject: matchBlock[1],
        arms,
        line: i + 1
      });
      i = blockEnd - 1;
      continue;
    }

    // Fallback: expression
    nodes.push({ type: "expr", value: trimmed, line: i + 1 });
  }

  return nodes;
}

function findBlockEnd(lines, currentIdx, parentIndent, maxEnd) {
  let j = currentIdx + 1;
  let lastNonBlank = j;
  while (j < maxEnd) {
    const line = lines[j];
    if (line.trim() === "") { j++; continue; }
    const lineIndent = line.match(/^(\s*)/)[1].length;
    if (lineIndent > parentIndent) { j++; lastNonBlank = j; }
    else break;
  }
  return lastNonBlank;
}

/**
 * Compute semantic fingerprint of an AST.
 * Two functions with different implementations but same behavior
 * will have the same fingerprint if their assertions match.
 */
export function fingerprint(ast) {
  const assertions = ast.filter(n => n.type === "assert");
  const functions = ast.filter(n => n.type === "function");

  return {
    functions: functions.map(f => ({
      name: f.name,
      arity: f.params.length,
      async: f.async,
      assertions: assertions
        .filter(a => a.expr.startsWith(f.name + "("))
        .map(a => ({ input: a.expr, output: a.expected }))
    })),
    bindings: ast.filter(n => n.type === "binding").map(b => b.name),
    imports: ast.filter(n => n.type === "import").map(im => im.path)
  };
}

/**
 * Measure efficiency: compare text representation vs AST representation.
 */
export function efficiency(src) {
  const ast = parse(src);
  const astJson = JSON.stringify(ast);
  const fp = fingerprint(ast);
  const fpJson = JSON.stringify(fp);

  // Rough token estimation (split on whitespace and punctuation)
  const countTokens = s => s.split(/[\s{}()\[\],;:."'`]+/).filter(Boolean).length;

  const srcTokens = countTokens(src);
  const astTokens = countTokens(astJson);
  const fpTokens = countTokens(fpJson);

  return {
    source: { chars: src.length, tokens: srcTokens },
    ast: { chars: astJson.length, tokens: astTokens },
    fingerprint: { chars: fpJson.length, tokens: fpTokens },
    ratios: {
      ast_vs_source: ((1 - astTokens / srcTokens) * 100).toFixed(1) + "%",
      fingerprint_vs_source: ((1 - fpTokens / srcTokens) * 100).toFixed(1) + "%"
    }
  };
}
