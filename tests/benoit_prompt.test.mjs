import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  analyzePrompt,
  toStructured,
  comparePrompts,
  encodePrompt,
  decodePrompt,
  pipeline,
  analyzeBatch,
  detectOverspec,
  languageEfficiency,
} from "../src/prompt.mjs";

// ── analyzePrompt ──────────────────────────────────────────

describe("analyzePrompt", () => {
  it("scores vague prose low", () => {
    const result = analyzePrompt("Make a nice clean API that handles stuff properly etc.");
    assert.ok(result.score < 0.5, `expected low score, got ${result.score}`);
    assert.ok(result.metrics.vagueWords >= 3, "should detect vague words");
    assert.ok(result.verdict === "weak" || result.verdict === "insufficient");
  });

  it("scores structured object higher than prose", () => {
    const prose = analyzePrompt("Build a todo API");
    const structured = analyzePrompt({
      schema: { todo: { id: "number", text: "string", done: "boolean" } },
      api: { "GET /todos": "list all", "POST /todos": "create" },
      tests: { "GET /todos returns []": true },
      service: { "toggle done": "flip boolean" },
    });
    assert.ok(structured.score > prose.score, "structured should score higher");
  });

  it("detects all 4 sections in structured prompt", () => {
    const result = analyzePrompt({
      schema: {}, api: {}, tests: {}, service: {},
    });
    assert.equal(result.details.structure, 1, "all 4 sections = 1.0");
  });

  it("gives suggestions for missing sections", () => {
    const result = analyzePrompt({ schema: {} });
    assert.ok(result.suggestions.length >= 3, "should suggest missing sections");
  });

  it("scores rich prose with examples higher", () => {
    const rich = `
## API ENDPOINTS:
- GET /api/users -> returns list of users
- POST /api/users -> creates user

## Tests:
- GET /api/users should return status 200 with []
- POST /api/users with {name: "test"} should return status 201

## Error handling:
- Invalid input returns 400
- Auth failure returns 401/403
- Empty state returns []

For example, GET /api/users?limit=10 returns at most 10 items.
    `;
    const result = analyzePrompt(rich);
    assert.ok(result.score >= 0.6, `expected good score, got ${result.score}`);
  });

  it("estimates tokens and potential savings", () => {
    const result = analyzePrompt("Build a REST API for managing todo items with CRUD operations");
    assert.ok(result.metrics.estimatedTokens > 0);
    assert.ok(result.metrics.potentialSavings > 0);
    assert.ok(result.metrics.words > 0);
  });

  it("returns zero savings for structured input", () => {
    const result = analyzePrompt({ schema: {}, api: {} });
    assert.equal(result.metrics.potentialSavings, 0);
  });
});

// ── toStructured ───────────────────────────────────────────

describe("toStructured", () => {
  it("converts prose to benoit-prompt-v1 format", () => {
    const prose = `
## Data Model:
- User: id, name, email
- Post: id, title, body, author_id

## API Endpoints:
- GET /users -> list users
- POST /users -> create user

## Business Logic:
- Users must have unique emails
- Posts belong to a user

## Tests:
- GET /users should return 200
- POST /users with duplicate email should return 409
    `;
    const result = toStructured(prose, { name: "blog", stack: "node" });
    assert.equal(result.meta.format, "benoit-prompt-v1");
    assert.equal(result.meta.project, "blog");
    assert.equal(result.meta.stack, "node");
    assert.ok(result.schema !== null, "should extract schema");
    assert.ok(result.api !== null, "should extract api");
    assert.ok(result.tests !== null, "should extract tests");
    assert.ok(result.service !== null, "should extract service");
  });

  it("measures improvement before/after", () => {
    const result = toStructured("Build a nice API that handles things");
    assert.ok("improvement" in result.meta);
    assert.ok("before" in result.meta.improvement);
    assert.ok("after" in result.meta.improvement);
  });

  it("returns null for sections not found", () => {
    const result = toStructured("Just a simple sentence with no structure.");
    // At least some sections should be null
    const nullCount = [result.schema, result.service, result.api, result.tests]
      .filter(s => s === null).length;
    assert.ok(nullCount >= 1, "should have at least one null section");
  });
});

// ── comparePrompts ─────────────────────────────────────────

describe("comparePrompts", () => {
  it("picks structured over vague prose", () => {
    const vague = "Make a nice clean API that handles stuff etc.";
    const structured = {
      schema: { user: { id: "number" } },
      api: { "GET /users": "list" },
      tests: { "returns 200": true },
      service: { "list users": "query db" },
    };
    const result = comparePrompts(vague, structured);
    assert.equal(result.winner, "B", "structured should win");
    assert.ok(result.tokenDiff > 0, "prose uses more tokens");
  });

  it("returns tie for identical prompts", () => {
    const p = "Build a REST API";
    const result = comparePrompts(p, p);
    assert.equal(result.winner, "tie");
    assert.equal(result.tokenDiff, 0);
  });

  it("compares each dimension", () => {
    const result = comparePrompts("Build a todo app", { schema: {}, api: {}, tests: {}, service: {} });
    assert.ok("structure" in result.comparison);
    assert.ok("examples" in result.comparison);
    assert.ok("testability" in result.comparison);
  });
});

// ── encodePrompt ───────────────────────────────────────────

describe("encodePrompt", () => {
  it("encodes user prose into benoit format", () => {
    const result = encodePrompt("Build a REST API for todo items with CRUD operations");
    assert.equal(result.format, "benoit-encoded-v1");
    assert.ok(result.intent, "should extract intent");
    assert.ok(Array.isArray(result.constraints));
    assert.ok(Array.isArray(result.criteria));
    assert.ok(result.structured, "should have structured version");
    assert.ok(result.analysis, "should have quality analysis");
  });

  it("extracts intent from imperative sentence", () => {
    const result = encodePrompt("Create a user authentication system with JWT tokens");
    assert.ok(result.intent.toLowerCase().includes("auth") || result.intent.toLowerCase().includes("user"),
      `intent should mention auth/user, got: ${result.intent}`);
  });

  it("extracts intent from 'I want' pattern", () => {
    const result = encodePrompt("I want to build a dashboard that shows real-time metrics");
    assert.ok(!result.intent.startsWith("I want"), "should strip 'I want'");
    assert.ok(result.intent.toLowerCase().includes("dashboard") || result.intent.toLowerCase().includes("metric"));
  });

  it("extracts constraints (must/must not)", () => {
    const result = encodePrompt(`
Build a payment API.
Must support Stripe and PayPal.
Must not store credit card numbers.
Response time must be under 200ms.
Always validate input before processing.
    `);
    assert.ok(result.constraints.length >= 3, `expected >=3 constraints, got ${result.constraints.length}`);
  });

  it("extracts success criteria", () => {
    const result = encodePrompt(`
Build a user API.
GET /users should return status 200 with a list.
POST /users must return 201 on success.
Verify that duplicate emails return 409.
    `);
    assert.ok(result.criteria.length >= 2, `expected >=2 criteria, got ${result.criteria.length}`);
  });

  it("includes warnings from analysis", () => {
    const result = encodePrompt("Make something nice");
    assert.ok(result.warnings.length > 0, "vague prompt should have warnings");
  });

  it("passes project/stack to structured", () => {
    const result = encodePrompt("Build an API", { project: "myapp", stack: "node" });
    assert.equal(result.structured.meta.project, "myapp");
    assert.equal(result.structured.meta.stack, "node");
  });
});

// ── decodePrompt ───────────────────────────────────────────

describe("decodePrompt", () => {
  it("produces human-readable back-translation", () => {
    const encoded = encodePrompt(`
## Data Model:
User with id, name, email

## API Endpoints:
GET /users -> returns all users
POST /users -> creates a user

## Tests:
GET /users should return 200
POST /users must return 201

## Business Logic:
Users must have unique emails
    `);
    const decoded = decodePrompt(encoded);
    assert.ok(decoded.text.length > 0, "should produce text");
    assert.ok(decoded.text.includes("OBJECTIVE"), "should have objective");
    assert.ok(decoded.text.includes("QUALITY"), "should have quality line");
  });

  it("returns structured sections for UI", () => {
    const encoded = encodePrompt("Build a REST API for todos");
    const decoded = decodePrompt(encoded);
    assert.ok("sections" in decoded);
    assert.ok("intent" in decoded.sections);
    assert.ok("constraints" in decoded.sections);
    assert.ok("quality" in decoded);
  });

  it("shows warnings for vague prompts", () => {
    const encoded = encodePrompt("Make a nice clean thing that handles stuff etc.");
    const decoded = decodePrompt(encoded);
    assert.ok(decoded.text.includes("WARNINGS"), "should show warnings for vague prompt");
  });
});

// ── pipeline ───────────────────────────────────────────────

describe("pipeline", () => {
  it("runs full encode → decode → confirm cycle", () => {
    const result = pipeline("Build a REST API for managing todo items with CRUD operations");
    assert.ok(result.original, "should keep original");
    assert.ok(result.encoded, "should have encoded");
    assert.ok(result.confirmation, "should have confirmation text");
    assert.ok(result.sections, "should have sections");
    assert.ok("improvement" in result, "should measure improvement");
    assert.ok("ready" in result, "should indicate readiness");
    assert.ok("verdict" in result);
  });

  it("marks vague prompt as not ready", () => {
    const result = pipeline("Do something nice");
    assert.ok(!result.ready || result.verdict === "weak" || result.verdict === "insufficient",
      "vague prompt should not be ready or be weak/insufficient");
  });

  it("marks rich prompt as ready", () => {
    const result = pipeline(`
## Data Model:
- User: id, name, email

## API Endpoints:
- GET /users -> returns list
- POST /users -> creates user, expects {name, email}

## Tests:
- GET /users should return status 200
- POST /users with valid data should return 201
- POST /users with duplicate email should return 409
- Invalid input returns 400

## Business Logic:
- Email must be unique
- Validate email format before saving

## Error Handling:
- Empty database returns []
- Auth failure returns 403
- Timeout after 5000ms returns 504
    `);
    assert.ok(result.ready, "rich prompt should be ready");
    assert.ok(result.improvement.before <= result.improvement.after || result.improvement.before >= 0.6,
      "should show improvement or already be good");
  });

  it("measures token improvement", () => {
    const result = pipeline("Build a REST API with authentication and rate limiting");
    assert.ok(result.improvement.tokensBefore > 0);
    assert.ok(result.improvement.tokensAfter >= 0);
  });

  it("confirmation is readable natural language", () => {
    const result = pipeline(`
Create a payment service.
Must support Stripe.
Must not store card numbers.
GET /payments should return status 200.
Verify that invalid amounts return 400.
    `);
    // The confirmation should read like structured natural language
    assert.ok(result.confirmation.includes("OBJECTIVE") || result.confirmation.includes("QUALITY"),
      "confirmation should have labeled sections");
    assert.ok(result.confirmation.split("\n").length > 3, "should be multi-line");
  });

  it("entire pipeline stays sender-side (no agent call)", () => {
    // The pipeline is pure transformation, no external calls
    const start = Date.now();
    const result = pipeline("Build me a complex distributed system with microservices");
    const elapsed = Date.now() - start;
    assert.ok(elapsed < 100, `pipeline should be instant (<100ms), took ${elapsed}ms`);
    // Verify no async, no network, no side effects — pure function
    assert.ok(result.encoded && result.confirmation && result.sections);
  });
});

// ── Integration: real SwissBuilding-style prompts ──────────

describe("prompt pipeline — real-world", () => {
  it("classic prose prompt → low score, Benoit structured → high score", () => {
    const classic = `Build a dashboard widget that shows portfolio performance.
It should display charts and tables. Make sure it looks nice and clean.
Handle loading states and errors properly. Use standard patterns.
The data comes from the API, process it and show relevant metrics.`;

    const benoit = {
      schema: {
        portfolio: { id: "string", holdings: "Holding[]", totalValue: "number" },
        holding: { symbol: "string", quantity: "number", currentPrice: "number" },
      },
      api: {
        "GET /api/portfolio/:id": { returns: "Portfolio", status: 200 },
        "GET /api/portfolio/:id/performance": { returns: "PerformanceData[]", status: 200 },
      },
      tests: {
        "empty portfolio shows placeholder": true,
        "loading state shows skeleton": true,
        "API error shows retry button": true,
        "performance chart renders 30-day data": true,
      },
      service: {
        "calculate ROI": "((current - initial) / initial) * 100",
        "aggregate by sector": "group holdings, sum values",
      },
    };

    const comparison = comparePrompts(classic, benoit);
    assert.equal(comparison.winner, "B", "Benoit structured should win");
    assert.ok(comparison.tokenDiff > 0, "prose uses more tokens");
  });

  it("pipeline improves a real vague prompt", () => {
    const vague = "I want a nice dashboard that shows building data and handles everything properly";
    const result = pipeline(vague);
    assert.ok(result.encoded.warnings.length >= 2, "should flag vague words");
    assert.ok(result.confirmation.length > 0, "should produce confirmation");
    // The user sees the back-translation and can fix it before sending
    assert.ok(result.verdict === "weak" || result.verdict === "insufficient",
      `vague prompt should be weak/insufficient, got ${result.verdict}`);
  });
});

// ── analyzeBatch (v2) ──────────────────────────────────────

describe("analyzeBatch", () => {
  const boilerplate = `CONTEXTE REPO:
- FastAPI + SQLAlchemy + PostgreSQL
- Imports: from app.models import Building, Pollutant
- Tests: conftest.py with fixtures
- RBAC: role-based access control via middleware
- Router pattern: APIRouter with prefix`;

  const promptA = `${boilerplate}

MISSION: Build consolidated pollutant view per building
LIVRABLES: GET /api/buildings/{id}/pollutants
VALIDATION: pytest tests/test_pollutant_view.py -v`;

  const promptB = `${boilerplate}

MISSION: Build portfolio performance dashboard
LIVRABLES: GET /api/portfolio/{id}/performance
VALIDATION: pytest tests/test_portfolio.py -v`;

  const promptC = `${boilerplate}

MISSION: Build regulatory compliance report
LIVRABLES: GET /api/buildings/{id}/compliance
VALIDATION: pytest tests/test_compliance.py -v`;

  it("detects repeated boilerplate across prompts", () => {
    const result = analyzeBatch([promptA, promptB, promptC]);
    assert.equal(result.promptCount, 3);
    assert.ok(result.repeatedLines > 0, "should find repeated lines");
    assert.ok(result.repeatedTokens > 0, "should count repeated tokens");
    assert.ok(result.savingsPercent > 0, "should show savings potential");
  });

  it("extracts preamble from shared lines", () => {
    const result = analyzeBatch([promptA, promptB, promptC]);
    assert.ok(result.preamble !== null, "should extract preamble");
    assert.ok(result.preamble.lines.length >= 3, "preamble should have multiple lines");
    assert.ok(result.preamble.totalSaved > 0, "preamble should save tokens");
  });

  it("scores each prompt individually", () => {
    const result = analyzeBatch([promptA, promptB]);
    assert.equal(result.perPrompt.length, 2);
    assert.ok(result.perPrompt[0].score >= 0);
    assert.ok(result.perPrompt[0].verdict);
  });

  it("returns zero savings for unique prompts", () => {
    const result = analyzeBatch([
      "Build a todo API with CRUD operations",
      "Create a weather widget showing temperature",
    ]);
    assert.equal(result.repeatedLines, 0);
    assert.equal(result.repeatedTokens, 0);
  });
});

// ── detectOverspec ─────────────────────────────────────────

describe("detectOverspec", () => {
  it("flags function signatures as over-specification", () => {
    const prompt = `Build a pollutant aggregation system.
def get_pollutants(building_id: int) -> list[Pollutant]:
def aggregate_by_type(pollutants: list) -> dict:
def calculate_severity(levels: dict) -> str:
def generate_report(building_id: int, severity: str) -> Report:
Validate with pytest.`;
    const result = detectOverspec(prompt);
    assert.ok(result.overspecLines.length >= 3, `expected >=3 overspec lines, got ${result.overspecLines.length}`);
    assert.ok(result.overspecRatio > 0.3, "should be over-specified");
    assert.ok(result.verdict === "over-specified" || result.verdict === "leaning-implementation");
  });

  it("rates intent-driven prompts as balanced", () => {
    const prompt = `Build a consolidated pollutant view per building.
Must aggregate all pollutant readings by type.
Must calculate overall severity score.
Show results in a dashboard widget.
Validate with pytest tests/test_pollutant.py -v`;
    const result = detectOverspec(prompt);
    assert.ok(result.overspecRatio <= 0.3, `expected low overspec ratio, got ${result.overspecRatio}`);
    assert.ok(result.verdict === "balanced" || result.verdict === "intent-driven");
  });

  it("identifies validation commands as intent (good)", () => {
    const prompt = `Build user management.
Run pytest tests/ -v to validate.`;
    const result = detectOverspec(prompt);
    const validationLines = result.intentLines.filter(l => l.type === "validation");
    assert.ok(validationLines.length >= 1, "should detect validation command");
  });

  it("suggests reducing implementation when over-specified", () => {
    const prompt = `def create_user(name: str, email: str) -> User:
def validate_email(email: str) -> bool:
def hash_password(password: str) -> str:
import bcrypt
from sqlalchemy import Column`;
    const result = detectOverspec(prompt);
    assert.ok(result.suggestion !== null, "should suggest reducing implementation");
  });
});

// ── languageEfficiency ─────────────────────────────────────

describe("languageEfficiency", () => {
  it("detects French language", () => {
    const result = languageEfficiency("Le système doit calculer les polluants par immeuble dans la base de données");
    assert.equal(result.language, "french");
  });

  it("detects English language", () => {
    const result = languageEfficiency("The system should calculate pollutants per building in the database");
    assert.equal(result.language, "english");
  });

  it("measures article overhead in French", () => {
    const fr = languageEfficiency("Le système doit afficher les données des immeubles dans le tableau de bord avec les polluants du rapport de la conformité");
    assert.ok(fr.articleOverhead > 0, "French should have article overhead");
  });

  it("measures content ratio", () => {
    const fr = languageEfficiency("Le système doit calculer les données");
    const en = languageEfficiency("The system must calculate the data");
    // Both should have reasonable content ratios
    assert.ok(fr.contentRatio > 0.3 && fr.contentRatio < 1);
    assert.ok(en.contentRatio > 0.3 && en.contentRatio < 1);
  });

  it("suggests English for heavy French overhead", () => {
    // Long French text with many articles
    const text = "Le système doit afficher les données des immeubles dans le tableau de bord avec les polluants du rapport de la conformité des bâtiments dans les communes de la région avec le calcul des indices de qualité";
    const result = languageEfficiency(text);
    assert.ok(result.suggestion !== null || result.articleOverhead > 10, "should flag French overhead");
  });
});

// ── Real-world: SwissBuilding wave analysis ────────────────

describe("batch analysis — SwissBuilding-style", () => {
  it("detects boilerplate pattern across agent prompts", () => {
    const shared = `CONTEXTE REPO:
- FastAPI + SQLAlchemy + PostgreSQL 15
- from app.models import Building, Pollutant, Report
- conftest.py: db_session, sample_building, sample_pollutant
- RBAC middleware: check_permissions(user, resource)
- Router: APIRouter(prefix="/api/v1")`;

    const w37a = `${shared}\nMISSION: Vue consolidée des polluants par immeuble\nValidation: pytest tests/test_w37a.py -v`;
    const w37b = `${shared}\nMISSION: Dashboard de performance du portefeuille\nValidation: pytest tests/test_w37b.py -v`;
    const w37c = `${shared}\nMISSION: Rapport de conformité réglementaire\nValidation: pytest tests/test_w37c.py -v`;

    const batch = analyzeBatch([w37a, w37b, w37c]);

    // The boilerplate is ~5 lines repeated 3x
    assert.ok(batch.repeatedLines >= 4, `expected >=4 repeated lines, got ${batch.repeatedLines}`);
    assert.ok(batch.savingsPercent > 10, `expected >10% savings, got ${batch.savingsPercent}%`);

    // Each prompt should have been scored
    assert.equal(batch.perPrompt.length, 3);

    // Overspec check on the missions (they're intent-driven, not over-specified)
    const overspec = detectOverspec(w37a);
    assert.ok(overspec.verdict !== "over-specified", "mission-style should not be over-specified");
  });
});
