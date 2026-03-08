// Benoit Prompt Optimizer
//
// Takes a task specification and measures/improves it
// using the same principles as quality() and negotiate().
//
// The insight: if examples > instructions for functions,
// then examples > prose for prompts too.
//
// A prompt is just a behavioral spec for an agent:
//   input: task context
//   output: expected deliverable
//
// This module:
//   1. Measures prompt quality (ambiguity, completeness, testability)
//   2. Suggests improvements (missing examples, unclear boundaries)
//   3. Converts prose to structured Benoit format
//   4. Estimates token savings
//   5. Pipeline: user → Benoit → back-translation → confirmation → send

/**
 * Analyze a task prompt for quality.
 *
 * Measures:
 *   - structure: is it organized as schema/service/api/tests?
 *   - examples: does it include input/output examples?
 *   - testability: are success criteria measurable?
 *   - ambiguity: how many ways could this be interpreted?
 *   - completeness: are edge cases covered?
 *
 * @param {string|object} prompt - The task prompt (string or structured)
 * @returns {object} Quality analysis
 */
export function analyzePrompt(prompt) {
  const text = typeof prompt === "string" ? prompt : JSON.stringify(prompt);
  const structured = typeof prompt === "object" && !Array.isArray(prompt);

  const scores = {};
  const suggestions = [];

  // 1. Structure: is it organized or just prose?
  if (structured) {
    const hasSchema = "schema" in prompt || "models" in prompt || "types" in prompt;
    const hasApi = "api" in prompt || "endpoints" in prompt || "routes" in prompt;
    const hasTests = "tests" in prompt || "assertions" in prompt || "examples" in prompt;
    const hasService = "service" in prompt || "logic" in prompt || "behavior" in prompt;

    const sections = [hasSchema, hasApi, hasTests, hasService].filter(Boolean).length;
    scores.structure = sections / 4;

    if (!hasSchema) suggestions.push("Add a schema/models section defining data structures");
    if (!hasApi) suggestions.push("Add an api/endpoints section with request/response examples");
    if (!hasTests) suggestions.push("Add a tests section with input/output assertions");
    if (!hasService) suggestions.push("Add a service/behavior section describing business logic");
  } else {
    // Prose — check for structural markers
    const hasCodeBlocks = (text.match(/```/g) || []).length >= 2;
    const hasExamples = /example|e\.g\.|for instance|like this/i.test(text);
    const hasBullets = /^[\s]*[-*•]/m.test(text);
    const hasHeaders = /^#+\s/m.test(text) || /^[A-Z][A-Z\s]+:/m.test(text);

    const markers = [hasCodeBlocks, hasExamples, hasBullets, hasHeaders].filter(Boolean).length;
    scores.structure = markers / 4;

    if (!hasCodeBlocks) suggestions.push("Add code examples showing expected input/output");
    if (!hasExamples) suggestions.push("Add concrete examples instead of abstract descriptions");
    if (!hasBullets) suggestions.push("Use structured lists instead of paragraphs");
  }

  // 2. Examples: does it show what success looks like?
  const examplePatterns = [
    /input.*output/i,
    /request.*response/i,
    /given.*then/i,
    /before.*after/i,
    /\{.*:.*\}.*→/,
    /=>|->|=>/,
    /GET|POST|PUT|DELETE/,
    /assert|expect|should/i,
  ];
  const exampleCount = examplePatterns.filter(p => p.test(text)).length;
  scores.examples = Math.min(exampleCount / 4, 1);

  if (exampleCount < 2) suggestions.push("Add input/output examples for each endpoint or function");

  // 3. Testability: are success criteria measurable?
  const testMarkers = [
    /test|spec|assert/i,
    /should.*return|must.*return/i,
    /status.*\d{3}/,
    /\d+.*tests?/i,
    /validates?|verif/i,
  ];
  const testCount = testMarkers.filter(p => p.test(text)).length;
  scores.testability = Math.min(testCount / 3, 1);

  if (testCount < 2) suggestions.push("Add explicit test assertions: 'GET /api/x should return {y}'");

  // 4. Ambiguity: vague words that invite interpretation
  const vagueWords = [
    /\bnice\b/i, /\bclean\b/i, /\bgood\b/i, /\bproper\b/i,
    /\bappropriate\b/i, /\bstandard\b/i, /\btypical\b/i,
    /\bhandle\b/i, /\bmanage\b/i, /\bprocess\b/i,
    /\betc\.?\b/i, /\band so on\b/i, /\bsimilar\b/i,
    /\bshould work\b/i, /\bmake sure\b/i, /\bprobably\b/i,
  ];
  const vagueCount = vagueWords.filter(p => p.test(text)).length;
  scores.ambiguity = Math.max(0, 1 - vagueCount / 5);

  if (vagueCount > 2) suggestions.push(`Remove vague words: ${vagueWords.filter(p => p.test(text)).map(p => `"${text.match(p)?.[0]}"`).slice(0, 3).join(", ")}`);

  // 5. Completeness: edge cases, error handling, boundaries
  const edgeMarkers = [
    /error|fail|invalid|empty|null|undefined/i,
    /edge.*case|boundar/i,
    /auth|permission|forbidden|401|403/i,
    /loading|timeout|retry/i,
    /empty.*state|no.*data|zero/i,
  ];
  const edgeCount = edgeMarkers.filter(p => p.test(text)).length;
  scores.completeness = Math.min(edgeCount / 3, 1);

  if (edgeCount < 2) suggestions.push("Add edge cases: what happens with empty data, errors, auth failures?");

  // Overall score
  const overall = (
    scores.structure * 0.25 +
    scores.examples * 0.30 +
    scores.testability * 0.20 +
    scores.ambiguity * 0.10 +
    scores.completeness * 0.15
  );

  let verdict;
  if (overall >= 0.8) verdict = "excellent";
  else if (overall >= 0.6) verdict = "good";
  else if (overall >= 0.4) verdict = "adequate";
  else if (overall >= 0.2) verdict = "weak";
  else verdict = "insufficient";

  // Token estimate
  const wordCount = text.split(/\s+/).length;
  const tokenEstimate = Math.round(wordCount * 1.3); // rough token estimate
  const potentialSavings = structured ? 0 : Math.round(tokenEstimate * 0.25);

  return {
    score: Math.round(overall * 100) / 100,
    verdict,
    details: scores,
    suggestions,
    metrics: {
      words: wordCount,
      estimatedTokens: tokenEstimate,
      potentialSavings,
      exampleCount,
      vagueWords: vagueCount,
    },
  };
}

/**
 * Convert a prose prompt to Benoit structured format.
 *
 * Extracts: schema, service logic, API endpoints, test assertions.
 *
 * @param {string} prose - The original prose prompt
 * @param {object} [context] - Optional context (project name, tech stack)
 * @returns {object} Structured Benoit-format prompt
 */
export function toStructured(prose, context = {}) {
  const result = {
    meta: {
      format: "benoit-prompt-v1",
      originalWords: prose.split(/\s+/).length,
    },
    schema: extractSection(prose, "schema", "model", "type", "interface", "data"),
    service: extractSection(prose, "service", "logic", "business", "behavior", "function"),
    api: extractSection(prose, "api", "endpoint", "route", "GET", "POST", "PUT", "DELETE"),
    tests: extractSection(prose, "test", "assert", "should", "expect", "verify"),
  };

  // Add context if provided
  if (context.name) result.meta.project = context.name;
  if (context.stack) result.meta.stack = context.stack;

  // Measure improvement
  const originalAnalysis = analyzePrompt(prose);
  const structuredAnalysis = analyzePrompt(result);

  result.meta.improvement = {
    before: originalAnalysis.score,
    after: structuredAnalysis.score,
    tokensSaved: originalAnalysis.metrics.potentialSavings,
  };

  return result;
}

/**
 * Extract lines relevant to a section from prose.
 */
function extractSection(text, ...keywords) {
  const lines = text.split("\n");
  const relevant = [];
  let inSection = false;

  for (const line of lines) {
    const lower = line.toLowerCase();
    const isHeader = /^#+\s|^[A-Z][A-Z\s]*:/.test(line);

    // Start capturing if keyword found in a header-like line
    if (keywords.some(k => lower.includes(k.toLowerCase()))) {
      inSection = true;
      if (!isHeader) relevant.push(line.trim());
      continue;
    }

    // Stop at next header
    if (isHeader && inSection) {
      inSection = false;
      continue;
    }

    if (inSection && line.trim()) {
      relevant.push(line.trim());
    }
  }

  return relevant.length > 0 ? relevant : null;
}

/**
 * Compare two prompt styles: measure which one is better.
 *
 * @param {string|object} promptA - First prompt
 * @param {string|object} promptB - Second prompt
 * @returns {object} Comparison with winner
 */
export function comparePrompts(promptA, promptB) {
  const a = analyzePrompt(promptA);
  const b = analyzePrompt(promptB);

  const comparison = {};
  for (const key of Object.keys(a.details)) {
    comparison[key] = {
      a: a.details[key],
      b: b.details[key],
      winner: a.details[key] > b.details[key] ? "A" : a.details[key] < b.details[key] ? "B" : "tie",
    };
  }

  return {
    a: { score: a.score, verdict: a.verdict, tokens: a.metrics.estimatedTokens },
    b: { score: b.score, verdict: b.verdict, tokens: b.metrics.estimatedTokens },
    winner: a.score > b.score ? "A" : a.score < b.score ? "B" : "tie",
    tokenDiff: a.metrics.estimatedTokens - b.metrics.estimatedTokens,
    comparison,
  };
}

/**
 * Encode a user prompt into Benoit structured format.
 *
 * This is the first step of the pipeline:
 *   user prose → Benoit structured → back-translation → confirmation → send
 *
 * Extracts intent, constraints, examples, and success criteria from
 * natural language and organizes them into the schema/service/api/tests
 * structure that agents understand unambiguously.
 *
 * @param {string} userText - The original user prompt in natural language
 * @param {object} [opts] - Options
 * @param {string} [opts.project] - Project name
 * @param {string} [opts.stack] - Tech stack (e.g. "node", "python")
 * @returns {object} Encoded prompt with Benoit structure + analysis
 */
export function encodePrompt(userText, opts = {}) {
  // Analyze the raw prompt first
  const rawAnalysis = analyzePrompt(userText);

  // Extract structured sections
  const structured = toStructured(userText, {
    name: opts.project,
    stack: opts.stack,
  });

  // Extract intent: the core "what" in one line
  const intent = extractIntent(userText);

  // Extract constraints: boundaries, limits, requirements
  const constraints = extractConstraints(userText);

  // Extract success criteria: measurable outcomes
  const criteria = extractCriteria(userText);

  return {
    format: "benoit-encoded-v1",
    intent,
    constraints,
    criteria,
    structured,
    analysis: rawAnalysis,
    warnings: rawAnalysis.suggestions,
  };
}

/**
 * Decode a Benoit-encoded prompt back to human-readable natural language.
 *
 * This is the confirmation step: the user sees what the system understood
 * before the prompt is sent. If the back-translation doesn't match their
 * intent, they can correct it. Zero misunderstandings.
 *
 * @param {object} encoded - The encoded prompt from encodePrompt()
 * @returns {object} Human-readable back-translation
 */
export function decodePrompt(encoded) {
  const lines = [];

  // 1. Intent — what do you want?
  if (encoded.intent) {
    lines.push(`OBJECTIVE: ${encoded.intent}`);
    lines.push("");
  }

  // 2. Constraints — what are the boundaries?
  if (encoded.constraints.length > 0) {
    lines.push("CONSTRAINTS:");
    for (const c of encoded.constraints) {
      lines.push(`  - ${c}`);
    }
    lines.push("");
  }

  // 3. Schema — what data structures?
  const schema = encoded.structured?.schema;
  if (schema && schema.length > 0) {
    lines.push("DATA STRUCTURES:");
    for (const s of schema) {
      lines.push(`  - ${s}`);
    }
    lines.push("");
  }

  // 4. Service — what business logic?
  const service = encoded.structured?.service;
  if (service && service.length > 0) {
    lines.push("BUSINESS LOGIC:");
    for (const s of service) {
      lines.push(`  - ${s}`);
    }
    lines.push("");
  }

  // 5. API — what endpoints?
  const api = encoded.structured?.api;
  if (api && api.length > 0) {
    lines.push("API ENDPOINTS:");
    for (const a of api) {
      lines.push(`  - ${a}`);
    }
    lines.push("");
  }

  // 6. Tests — what assertions?
  const tests = encoded.structured?.tests;
  if (tests && tests.length > 0) {
    lines.push("SUCCESS CRITERIA:");
    for (const t of tests) {
      lines.push(`  - ${t}`);
    }
    lines.push("");
  }

  // 7. Criteria from extraction
  if (encoded.criteria.length > 0) {
    lines.push("VERIFICATION:");
    for (const c of encoded.criteria) {
      lines.push(`  - ${c}`);
    }
    lines.push("");
  }

  // 8. Warnings
  if (encoded.warnings.length > 0) {
    lines.push("WARNINGS (unclear in your prompt):");
    for (const w of encoded.warnings) {
      lines.push(`  ! ${w}`);
    }
    lines.push("");
  }

  // Quality summary
  const a = encoded.analysis;
  lines.push(`QUALITY: ${a.score}/1.00 (${a.verdict}) — ${a.metrics.estimatedTokens} tokens`);
  if (a.metrics.potentialSavings > 0) {
    lines.push(`POTENTIAL SAVINGS: ~${a.metrics.potentialSavings} tokens with structured format`);
  }

  const text = lines.join("\n");

  return {
    text,
    sections: {
      intent: encoded.intent,
      constraints: encoded.constraints,
      schema: schema || [],
      service: service || [],
      api: api || [],
      tests: tests || [],
      criteria: encoded.criteria,
    },
    quality: encoded.analysis,
  };
}

/**
 * Full pipeline: user prompt → Benoit encode → back-translation → ready to send.
 *
 * Usage:
 *   const result = pipeline("Build me a REST API for todo items");
 *   console.log(result.confirmation);  // human-readable back-translation
 *   if (userApproves) sendToAgent(result.encoded);
 *
 * @param {string} userText - The original user prompt
 * @param {object} [opts] - Options (project, stack)
 * @returns {object} Pipeline result with encoded prompt + confirmation text
 */
export function pipeline(userText, opts = {}) {
  // Step 1: Encode (user → Benoit)
  const encoded = encodePrompt(userText, opts);

  // Step 2: Decode (Benoit → human-readable)
  const decoded = decodePrompt(encoded);

  // Step 3: Measure improvement
  const structuredAnalysis = analyzePrompt(encoded.structured);
  const improvement = {
    before: encoded.analysis.score,
    after: structuredAnalysis.score,
    delta: Math.round((structuredAnalysis.score - encoded.analysis.score) * 100) / 100,
    tokensBefore: encoded.analysis.metrics.estimatedTokens,
    tokensAfter: structuredAnalysis.metrics.estimatedTokens,
  };

  return {
    // What the user wrote
    original: userText,
    // Benoit-encoded version (send this to agent)
    encoded,
    // Human-readable back-translation (show this to user)
    confirmation: decoded.text,
    // Structured sections for UI rendering
    sections: decoded.sections,
    // Quality improvement metrics
    improvement,
    // Ready to send? (score > 0.4 and no critical warnings)
    ready: encoded.analysis.score >= 0.4,
    // Quick verdict
    verdict: encoded.analysis.verdict,
  };
}

// --- Internal helpers ---

/**
 * Extract the core intent from prose.
 * Looks for imperative verbs, "I want", "Build", "Create", etc.
 */
function extractIntent(text) {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);

  // First line is often the intent
  if (lines.length > 0) {
    const first = lines[0];
    // If it starts with an imperative or "I want/need"
    if (/^(build|create|make|implement|add|write|design|develop|set up|configure|fix|update|deploy)/i.test(first)) {
      return first;
    }
    if (/^I (want|need|would like)/i.test(first)) {
      return first.replace(/^I (want|need|would like) (to )?/i, "").trim();
    }
  }

  // Search for intent markers in the text
  for (const line of lines) {
    if (/^(goal|objective|task|mission|purpose):/i.test(line)) {
      return line.replace(/^(goal|objective|task|mission|purpose):\s*/i, "").trim();
    }
  }

  // Fallback: first sentence
  const firstSentence = text.match(/^[^.!?\n]+[.!?]?/);
  return firstSentence ? firstSentence[0].trim() : lines[0] || text.slice(0, 100);
}

/**
 * Extract constraints: must/must not, limits, requirements.
 */
function extractConstraints(text) {
  const constraints = [];
  const lines = text.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    // "must", "must not", "should not", "no more than", "at least", "maximum", "minimum"
    if (/\b(must|shall|required|mandatory|forbidden|prohibited)\b/i.test(trimmed)) {
      constraints.push(trimmed);
    } else if (/\b(no more than|at least|at most|maximum|minimum|limit|within)\b/i.test(trimmed)) {
      constraints.push(trimmed);
    } else if (/\b(do not|don't|never|always|ensure)\b/i.test(trimmed) && trimmed.length < 200) {
      constraints.push(trimmed);
    }
  }

  return constraints;
}

/**
 * Extract success criteria: measurable outcomes, test conditions.
 */
function extractCriteria(text) {
  const criteria = [];
  const lines = text.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (/\b(should return|must return|returns?|responds? with|status \d{3})\b/i.test(trimmed)) {
      criteria.push(trimmed);
    } else if (/\b(test|verify|assert|expect|check that)\b/i.test(trimmed) && trimmed.length < 200) {
      criteria.push(trimmed);
    } else if (/\b(passes?|fails?|succeeds?|works? when)\b/i.test(trimmed)) {
      criteria.push(trimmed);
    }
  }

  return criteria;
}

// ── Batch Analysis (v2) ────────────────────────────────────
//
// Analyzes multiple prompts together to find:
//   - Repeated boilerplate (extract to shared preamble)
//   - Over-specification (intent vs implementation)
//   - Language efficiency

/**
 * Analyze a batch of prompts for shared boilerplate.
 *
 * Detects lines that appear in multiple prompts — candidates for
 * extraction into a shared preamble/bootstrap file.
 *
 * @param {string[]} prompts - Array of prompt texts
 * @param {object} [opts]
 * @param {number} [opts.minOccurrences] - Min times a line must appear (default: 2)
 * @param {number} [opts.minLineLength] - Ignore short lines (default: 20)
 * @returns {object} Deduplication analysis
 */
export function analyzeBatch(prompts, opts = {}) {
  const minOcc = opts.minOccurrences ?? 2;
  const minLen = opts.minLineLength ?? 20;

  // Count line occurrences across prompts
  const lineCounts = new Map();
  const linePromptSets = new Map();

  for (let i = 0; i < prompts.length; i++) {
    const seen = new Set(); // avoid counting duplicates within same prompt
    for (const raw of prompts[i].split("\n")) {
      const line = raw.trim();
      if (line.length < minLen) continue;
      if (seen.has(line)) continue;
      seen.add(line);

      lineCounts.set(line, (lineCounts.get(line) || 0) + 1);
      if (!linePromptSets.has(line)) linePromptSets.set(line, new Set());
      linePromptSets.get(line).add(i);
    }
  }

  // Find repeated lines
  const repeated = [];
  for (const [line, count] of lineCounts) {
    if (count >= minOcc) {
      repeated.push({ line, count, promptIndices: [...linePromptSets.get(line)] });
    }
  }
  repeated.sort((a, b) => b.count - a.count);

  // Find repeated blocks (consecutive repeated lines)
  const blocks = findRepeatedBlocks(prompts, repeated, minLen);

  // Token savings from deduplication
  const repeatedTokens = repeated.reduce((sum, r) => {
    const words = r.line.split(/\s+/).length;
    return sum + Math.round(words * 1.3) * (r.count - 1); // count-1 = times we can eliminate
  }, 0);

  const totalTokens = prompts.reduce((sum, p) => {
    return sum + Math.round(p.split(/\s+/).length * 1.3);
  }, 0);

  return {
    promptCount: prompts.length,
    totalTokens,
    repeatedLines: repeated.length,
    repeatedBlocks: blocks,
    repeatedTokens,
    savingsPercent: totalTokens > 0 ? Math.round(repeatedTokens / totalTokens * 100) : 0,
    preamble: extractPreamble(repeated, prompts.length),
    perPrompt: prompts.map((p, i) => {
      const analysis = analyzePrompt(p);
      return {
        index: i,
        score: analysis.score,
        verdict: analysis.verdict,
        tokens: analysis.metrics.estimatedTokens,
      };
    }),
  };
}

/**
 * Find repeated consecutive blocks across prompts.
 */
function findRepeatedBlocks(prompts, repeated, minLen) {
  const repeatedSet = new Set(repeated.map(r => r.line));
  const blocks = [];

  // For each prompt, find consecutive sequences of repeated lines
  for (let i = 0; i < prompts.length; i++) {
    const lines = prompts[i].split("\n").map(l => l.trim()).filter(l => l.length >= minLen);
    let blockStart = -1;
    let currentBlock = [];

    for (let j = 0; j <= lines.length; j++) {
      if (j < lines.length && repeatedSet.has(lines[j])) {
        if (blockStart === -1) blockStart = j;
        currentBlock.push(lines[j]);
      } else {
        if (currentBlock.length >= 3) {
          const key = currentBlock.join("\n");
          const existing = blocks.find(b => b.text === key);
          if (existing) {
            existing.count++;
            existing.promptIndices.push(i);
          } else {
            blocks.push({
              text: key,
              lines: currentBlock.length,
              tokens: Math.round(key.split(/\s+/).length * 1.3),
              count: 1,
              promptIndices: [i],
            });
          }
        }
        blockStart = -1;
        currentBlock = [];
      }
    }
  }

  return blocks.filter(b => b.count >= 2).sort((a, b) => b.tokens * b.count - a.tokens * a.count);
}

/**
 * Extract a preamble from the most-repeated lines.
 */
function extractPreamble(repeated, promptCount) {
  // Lines that appear in ALL (or nearly all) prompts
  const threshold = Math.max(2, Math.floor(promptCount * 0.6));
  const preambleLines = repeated
    .filter(r => r.count >= threshold)
    .map(r => r.line);

  if (preambleLines.length === 0) return null;

  return {
    lines: preambleLines,
    tokens: Math.round(preambleLines.join(" ").split(/\s+/).length * 1.3),
    savedPerPrompt: Math.round(preambleLines.join(" ").split(/\s+/).length * 1.3),
    totalSaved: Math.round(preambleLines.join(" ").split(/\s+/).length * 1.3) * (promptCount - 1),
  };
}

/**
 * Detect over-specification: lines that prescribe implementation instead of intent.
 *
 * Flags function signatures, parameter types, return types, and step-by-step
 * instructions that constrain the agent's design choices.
 *
 * @param {string} prompt - The prompt text
 * @returns {object} Over-specification analysis
 */
export function detectOverspec(prompt) {
  const lines = prompt.split("\n");
  const overspec = [];
  const intent = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    // Implementation patterns (over-specification)
    const isSignature = /^(def |function |async function |const \w+ =|export (function|const)|\w+\([\w:,\s]*\)\s*(->|:)\s*\w+)/i.test(line);
    const isTypeAnnotation = /:\s*(str|int|float|bool|list|dict|string|number|boolean|Array|Object|Optional|Union)/i.test(line) && !/status/i.test(line);
    const isStepByStep = /^(step \d|étape \d|\d+\.\s+(create|add|implement|write|define))/i.test(line);
    const isImport = /^(import |from .* import|require\(|use )/i.test(line);
    const isExactReturn = /return.*\{.*:.*\}/i.test(line) && !/should return|must return/i.test(line);

    if (isSignature || isTypeAnnotation || isStepByStep || isImport || isExactReturn) {
      const reason = isSignature ? "function signature" :
        isTypeAnnotation ? "type annotation" :
        isStepByStep ? "step-by-step instruction" :
        isImport ? "import/dependency" :
        "exact return shape";
      overspec.push({ line, reason });
      continue;
    }

    // Intent patterns (good)
    const isGoal = /^(build|create|implement|add|provide|expose|calculate|show|display|aggregate|consolidate|generate)/i.test(line);
    const isDomain = /\b(per building|per user|par immeuble|polluant|portfolio|dashboard|report|view|widget)\b/i.test(line);
    const isConstraint = /\b(must|should|always|never|ensure|validate|verify)\b/i.test(line);
    const isValidation = /\b(run|execute|pytest|npm test|benoit test|check)\b/i.test(line);

    if (isGoal || isDomain || isConstraint || isValidation) {
      intent.push({ line, type: isValidation ? "validation" : isConstraint ? "constraint" : "intent" });
    }
  }

  const totalMeaningful = overspec.length + intent.length;
  const overspecRatio = totalMeaningful > 0 ? overspec.length / totalMeaningful : 0;

  let verdict;
  if (overspecRatio > 0.5) verdict = "over-specified";
  else if (overspecRatio > 0.3) verdict = "leaning-implementation";
  else if (overspecRatio > 0.1) verdict = "balanced";
  else verdict = "intent-driven";

  return {
    overspecRatio: Math.round(overspecRatio * 100) / 100,
    verdict,
    overspecLines: overspec,
    intentLines: intent,
    suggestion: overspecRatio > 0.3
      ? "Reduce implementation details. Specify WHAT, not HOW. Let the agent decide function decomposition."
      : null,
  };
}

/**
 * Measure language efficiency: compare semantic density across languages.
 *
 * Same meaning in fewer tokens = more efficient.
 *
 * @param {string} text - The prompt text
 * @returns {object} Language efficiency analysis
 */
export function languageEfficiency(text) {
  const words = text.split(/\s+/).filter(Boolean);
  const tokens = Math.round(words.length * 1.3);

  // Detect language (simple heuristic)
  const frenchMarkers = /\b(le|la|les|un|une|des|du|de|est|sont|avec|pour|dans|sur|par|qui|que|ce|cette|ces)\b/gi;
  const englishMarkers = /\b(the|a|an|is|are|with|for|in|on|by|who|that|this|these|those)\b/gi;

  const frenchCount = (text.match(frenchMarkers) || []).length;
  const englishCount = (text.match(englishMarkers) || []).length;

  const lang = frenchCount > englishCount * 1.5 ? "french"
    : englishCount > frenchCount * 1.5 ? "english"
    : "mixed";

  // French articles/prepositions add ~15% overhead for technical prompts
  const articlesAndPreps = (text.match(/\b(le|la|les|un|une|des|du|de|l')\b/gi) || []).length;
  const articleOverhead = Math.round(articlesAndPreps * 1.3); // tokens wasted on articles

  // Content words (not articles/prepositions)
  const stopwords = new Set([
    // French
    "le", "la", "les", "un", "une", "des", "du", "de", "est", "sont",
    "avec", "pour", "dans", "sur", "par", "qui", "que", "ce", "cette", "ces",
    "et", "ou", "en", "au", "aux", "ne", "pas", "se", "si", "il", "elle",
    // English
    "the", "a", "an", "is", "are", "with", "for", "in", "on", "by",
    "who", "that", "this", "these", "those", "and", "or", "of", "to",
    "it", "be", "not", "if", "he", "she",
  ]);

  const contentWords = words.filter(w => !stopwords.has(w.toLowerCase()));
  const contentRatio = words.length > 0 ? contentWords.length / words.length : 0;

  return {
    language: lang,
    totalWords: words.length,
    totalTokens: tokens,
    contentWords: contentWords.length,
    contentRatio: Math.round(contentRatio * 100) / 100,
    articleOverhead,
    suggestion: lang === "french" && articleOverhead > 20
      ? `French articles add ~${articleOverhead} tokens. Consider English for technical prompts to save ~15%.`
      : null,
  };
}
