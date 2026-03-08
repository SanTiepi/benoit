const vscode = require("vscode");

// ── Benoit Prompt Compiler — VSCode Extension ──────────────
//
// Sits between the user and any AI agent.
// Compiles prompts before sending: quality gate + back-translation.
// The entire loop stays sender-side. Zero tokens wasted.

// Import Benoit prompt engine (bundled)
const {
  analyzePrompt,
  encodePrompt,
  decodePrompt,
  pipeline,
  comparePrompts,
} = require("./lib/prompt.cjs");

// ── State ──────────────────────────────────────────────────

let statusBarItem;
let diagnosticCollection;
let outputChannel;
let lastAnalysis = null;

// ── Activation ─────────────────────────────────────────────

function activate(context) {
  outputChannel = vscode.window.createOutputChannel("Benoit");
  diagnosticCollection = vscode.languages.createDiagnosticCollection("benoit");

  // Status bar
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.command = "benoit.compilePrompt";
  statusBarItem.tooltip = "Benoit: Click to compile prompt";
  context.subscriptions.push(statusBarItem);

  // Commands
  context.subscriptions.push(
    vscode.commands.registerCommand("benoit.compilePrompt", compilePrompt),
    vscode.commands.registerCommand("benoit.compileSelection", compileSelection),
    vscode.commands.registerCommand("benoit.analyzeFile", analyzeFile)
  );

  // Auto-analyze on save
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      const config = vscode.workspace.getConfiguration("benoit");
      if (config.get("autoAnalyze")) {
        analyzeDocument(doc);
      }
    })
  );

  // Auto-analyze on editor change
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) {
        updateStatusBar(null);
      }
    })
  );

  updateStatusBar(null);
  outputChannel.appendLine("Benoit Prompt Compiler activated");
}

// ── Commands ───────────────────────────────────────────────

/**
 * Main command: compile the entire document or input box as a prompt.
 */
async function compilePrompt() {
  const editor = vscode.window.activeTextEditor;
  let text;

  if (editor && editor.document.getText().trim()) {
    text = editor.document.getText();
  } else {
    // No editor or empty — show input box
    text = await vscode.window.showInputBox({
      prompt: "Enter your prompt to compile",
      placeHolder: "Build a REST API for...",
      ignoreFocusOut: true,
    });
  }

  if (!text) return;

  const result = runPipeline(text);
  showResult(result);
}

/**
 * Compile only the selected text.
 */
async function compileSelection() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage("No active editor");
    return;
  }

  const selection = editor.selection;
  const text = editor.document.getText(selection);

  if (!text.trim()) {
    vscode.window.showWarningMessage("No text selected");
    return;
  }

  const result = runPipeline(text);
  showResult(result);
}

/**
 * Analyze the current file for prompt quality.
 */
async function analyzeFile() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage("No active editor");
    return;
  }

  const text = editor.document.getText();
  if (!text.trim()) return;

  analyzeDocument(editor.document);
}

// ── Core Engine ────────────────────────────────────────────

function runPipeline(text) {
  const config = vscode.workspace.getConfiguration("benoit");
  const result = pipeline(text);
  lastAnalysis = result;
  updateStatusBar(result);
  return result;
}

function analyzeDocument(doc) {
  const text = doc.getText();
  if (!text.trim()) {
    diagnosticCollection.delete(doc.uri);
    updateStatusBar(null);
    return;
  }

  const analysis = analyzePrompt(text);
  lastAnalysis = { encoded: { analysis }, verdict: analysis.verdict };
  updateStatusBar(lastAnalysis);

  // Create diagnostics for vague words
  const diagnostics = [];

  // Detect vague words and mark them
  const vaguePatterns = [
    /\bnice\b/gi, /\bclean\b/gi, /\bgood\b/gi, /\bproper\b/gi,
    /\bappropriate\b/gi, /\bstandard\b/gi, /\btypical\b/gi,
    /\bhandle\b/gi, /\bmanage\b/gi, /\bprocess\b/gi,
    /\betc\.?\b/gi, /\band so on\b/gi, /\bsimilar\b/gi,
    /\bshould work\b/gi, /\bmake sure\b/gi, /\bprobably\b/gi,
  ];

  for (const pattern of vaguePatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const startPos = doc.positionAt(match.index);
      const endPos = doc.positionAt(match.index + match[0].length);
      const range = new vscode.Range(startPos, endPos);

      diagnostics.push(
        new vscode.Diagnostic(
          range,
          `Vague word "${match[0]}" — be specific instead`,
          vscode.DiagnosticSeverity.Warning
        )
      );
    }
  }

  // Add suggestions as information diagnostics at the top
  for (const suggestion of analysis.suggestions) {
    diagnostics.push(
      new vscode.Diagnostic(
        new vscode.Range(0, 0, 0, 0),
        `Benoit: ${suggestion}`,
        vscode.DiagnosticSeverity.Information
      )
    );
  }

  diagnosticCollection.set(doc.uri, diagnostics);
}

// ── UI ─────────────────────────────────────────────────────

function updateStatusBar(result) {
  if (!result) {
    statusBarItem.text = "$(pass) Benoit";
    statusBarItem.backgroundColor = undefined;
    statusBarItem.show();
    return;
  }

  const score = result.encoded?.analysis?.score ?? 0;
  const verdict = result.verdict || "unknown";

  if (score >= 0.6) {
    statusBarItem.text = `$(pass) Benoit: ${(score * 100).toFixed(0)}% ${verdict}`;
    statusBarItem.backgroundColor = undefined;
  } else if (score >= 0.4) {
    statusBarItem.text = `$(warning) Benoit: ${(score * 100).toFixed(0)}% ${verdict}`;
    statusBarItem.backgroundColor = new vscode.ThemeColor(
      "statusBarItem.warningBackground"
    );
  } else {
    statusBarItem.text = `$(error) Benoit: ${(score * 100).toFixed(0)}% ${verdict}`;
    statusBarItem.backgroundColor = new vscode.ThemeColor(
      "statusBarItem.errorBackground"
    );
  }

  statusBarItem.show();
}

async function showResult(result) {
  const config = vscode.workspace.getConfiguration("benoit");
  const minScore = config.get("minScore") || 0.4;

  // Output to channel
  outputChannel.clear();
  outputChannel.appendLine("═══ Benoit Prompt Compilation ═══\n");
  outputChannel.appendLine(result.confirmation);
  outputChannel.appendLine(`\n═══ Improvement ═══`);
  outputChannel.appendLine(
    `Before: ${result.improvement.before} → After: ${result.improvement.after} (delta: ${result.improvement.delta})`
  );
  outputChannel.appendLine(
    `Tokens: ${result.improvement.tokensBefore} → ${result.improvement.tokensAfter}`
  );

  if (!result.ready) {
    // BLOCKED — show warning with actions
    const action = await vscode.window.showWarningMessage(
      `Benoit: Prompt BLOCKED (${(result.encoded.analysis.score * 100).toFixed(0)}% — ${result.verdict}). Improve before sending.`,
      "Show Details",
      "Send Anyway"
    );

    if (action === "Show Details") {
      outputChannel.show(true);
    } else if (action === "Send Anyway") {
      outputChannel.appendLine("\n⚠ User overrode quality gate — sending as-is");
    }
  } else if (config.get("showBackTranslation")) {
    // PASSED — show confirmation panel
    const action = await vscode.window.showInformationMessage(
      `Benoit: ${(result.encoded.analysis.score * 100).toFixed(0)}% (${result.verdict}) — Ready to send`,
      "Show Back-Translation",
      "Copy Structured"
    );

    if (action === "Show Back-Translation") {
      outputChannel.show(true);
    } else if (action === "Copy Structured") {
      // Copy the Benoit-encoded version to clipboard
      const structured = JSON.stringify(result.encoded.structured, null, 2);
      await vscode.env.clipboard.writeText(structured);
      vscode.window.showInformationMessage("Benoit structured prompt copied to clipboard");
    }
  }
}

// ── Deactivation ───────────────────────────────────────────

function deactivate() {
  if (diagnosticCollection) diagnosticCollection.dispose();
  if (statusBarItem) statusBarItem.dispose();
  if (outputChannel) outputChannel.dispose();
}

module.exports = { activate, deactivate };
