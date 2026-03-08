// MCL Tokenizer Comparison Tool
// Compares token density of MCL vs JS vs Python for equivalent logic

/**
 * Estimate token count using cl100k_base approximation.
 * More accurate than char/4: accounts for keywords, operators, whitespace.
 * @param {string} code
 * @returns {number}
 */
export function estimateTokens(code) {
  // Split on token boundaries: words, operators, punctuation, whitespace
  const tokens = code.match(/\w+|[^\w\s]|\s+/g) || [];

  let count = 0;
  for (const tok of tokens) {
    if (/^\s+$/.test(tok)) {
      // Whitespace: ~0.25 tokens per whitespace unit
      count += 0.25;
    } else if (/^\w+$/.test(tok)) {
      // Words: common short keywords = 1 token, longer words may be 1-2
      count += tok.length <= 6 ? 1 : Math.ceil(tok.length / 5);
    } else {
      // Operators/punctuation: usually 1 token each
      count += 1;
    }
  }

  return Math.ceil(count);
}

/**
 * Compare two equivalent code snippets.
 * @param {string} original — JS/Python code
 * @param {string} mcl — MCL equivalent
 * @returns {{ original_tokens: number, mcl_tokens: number, savings_pct: number, density_ratio: number }}
 */
export function compare(original, mcl) {
  const origTokens = estimateTokens(original);
  const mclTokens = estimateTokens(mcl);
  return {
    original_tokens: origTokens,
    mcl_tokens: mclTokens,
    savings_pct: Math.round((1 - mclTokens / origTokens) * 100),
    density_ratio: Math.round((origTokens / mclTokens) * 100) / 100,
  };
}

/**
 * Analyze code for "noise" tokens — syntax that carries no semantic meaning.
 * @param {string} code
 * @returns {{ total: number, noise: number, signal: number, noise_pct: number }}
 */
export function noiseAnalysis(code) {
  const tokens = code.match(/\w+|[^\w\s]|\s+/g) || [];
  const noisePatterns = new Set([
    "{", "}", "(", ")", ";", ",", "=>", "const", "let", "var",
    "function", "return", "export", "import", "from", "new",
    "async", "await", "if", "else", "for", "of", "in",
  ]);

  let noise = 0;
  let signal = 0;

  for (const tok of tokens) {
    const trimmed = tok.trim();
    if (!trimmed) continue;
    if (noisePatterns.has(trimmed)) {
      noise++;
    } else {
      signal++;
    }
  }

  const total = noise + signal;
  return {
    total,
    noise,
    signal,
    noise_pct: total > 0 ? Math.round((noise / total) * 100) : 0,
  };
}
