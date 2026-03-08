// expr.mjs — Native .ben expression evaluator (Phase 2)
// Replaces new Function() with a proper tokenizer + parser + evaluator.
// Written in JS (will be ported to .ben for Phase 3 self-hosting).
// "Il n'y a pas de mauvaise réponse, que des mauvaises questions."

// ============================================================
// TOKENIZER
// ============================================================

const TOKEN = {
  NUM: "NUM", STR: "STR", BOOL: "BOOL", NULL: "NULL", UNDEF: "UNDEF",
  ID: "ID", OP: "OP", PUNC: "PUNC", REGEX: "REGEX", TYPEOF: "TYPEOF",
  ARROW: "ARROW", NEW: "NEW", EOF: "EOF"
};

const KEYWORDS = { true: TOKEN.BOOL, false: TOKEN.BOOL, null: TOKEN.NULL, undefined: TOKEN.UNDEF, typeof: TOKEN.TYPEOF, new: TOKEN.NEW };

function tokenize(src) {
  const tokens = [];
  let i = 0;
  while (i < src.length) {
    // Whitespace
    if (/\s/.test(src[i])) { i++; continue; }

    // Numbers (including scientific notation: 1e10, 2.5e-3)
    if (/\d/.test(src[i]) || (src[i] === "." && /\d/.test(src[i + 1]))) {
      let n = "";
      while (i < src.length && /[\d.]/.test(src[i])) n += src[i++];
      if (i < src.length && (src[i] === "e" || src[i] === "E")) {
        n += src[i++];
        if (i < src.length && (src[i] === "+" || src[i] === "-")) n += src[i++];
        while (i < src.length && /\d/.test(src[i])) n += src[i++];
      }
      tokens.push({ type: TOKEN.NUM, value: Number(n) });
      continue;
    }

    // Strings
    if (src[i] === '"' || src[i] === "'" || src[i] === "`") {
      const q = src[i++];
      let s = "";
      while (i < src.length && src[i] !== q) {
        if (src[i] === "\\") { s += src[i++]; }
        s += src[i++];
      }
      i++; // close quote
      // Handle template literals with ${...}
      if (q === "`") {
        tokens.push({ type: TOKEN.STR, value: s, template: true });
      } else {
        // Unescape
        try { s = JSON.parse('"' + s.replace(/"/g, '\\"') + '"'); } catch {}
        tokens.push({ type: TOKEN.STR, value: s });
      }
      continue;
    }

    // Regex: /pattern/flags (only after operator/punc/start, but NOT after ) or ] which end expressions)
    if (src[i] === "/" && (tokens.length === 0 || (["OP", "PUNC"].includes(tokens[tokens.length - 1]?.type) && ![")", "]"].includes(tokens[tokens.length - 1]?.value)))) {
      i++; // skip /
      let pattern = "", flags = "";
      while (i < src.length && src[i] !== "/") {
        if (src[i] === "\\") pattern += src[i++];
        pattern += src[i++];
      }
      i++; // skip /
      while (i < src.length && /[gimsuy]/.test(src[i])) flags += src[i++];
      tokens.push({ type: TOKEN.REGEX, value: new RegExp(pattern, flags) });
      continue;
    }

    // Multi-char operators
    const two = src.slice(i, i + 3);
    if (two === "===" || two === "!==") { tokens.push({ type: TOKEN.OP, value: two }); i += 3; continue; }
    const dbl = src.slice(i, i + 2);
    if (["==", "!=", "<=", ">=", "&&", "||", "=>"].includes(dbl)) {
      if (dbl === "=>") tokens.push({ type: TOKEN.ARROW, value: "=>" });
      else tokens.push({ type: TOKEN.OP, value: dbl });
      i += 2; continue;
    }

    // Single-char operators
    if ("+-*/%<>!".includes(src[i])) {
      tokens.push({ type: TOKEN.OP, value: src[i++] });
      continue;
    }

    // Punctuation
    if ("()[]{}.,;:?".includes(src[i])) {
      tokens.push({ type: TOKEN.PUNC, value: src[i++] });
      continue;
    }

    // Identifiers and keywords
    if (/[a-zA-Z_$]/.test(src[i])) {
      let id = "";
      while (i < src.length && /[\w$]/.test(src[i])) id += src[i++];
      if (id in KEYWORDS) {
        tokens.push({ type: KEYWORDS[id], value: id === "true" ? true : id === "false" ? false : id === "null" ? null : id === "undefined" ? undefined : id });
      } else {
        tokens.push({ type: TOKEN.ID, value: id });
      }
      continue;
    }

    // Unknown char — skip
    i++;
  }
  tokens.push({ type: TOKEN.EOF, value: null });
  return tokens;
}

// ============================================================
// PARSER (Pratt / precedence climbing)
// ============================================================

const PREC = {
  "||": 3, "&&": 4,
  "==": 8, "!=": 8, "===": 8, "!==": 8,
  "<": 9, ">": 9, "<=": 9, ">=": 9,
  "+": 11, "-": 11,
  "*": 12, "/": 12, "%": 12,
};

function parseExpr(tokens, pos, minPrec = 0) {
  let [left, p] = parsePrefix(tokens, pos);

  while (p < tokens.length) {
    const tok = tokens[p];

    // Infix binary operators
    if (tok.type === TOKEN.OP && tok.value in PREC && PREC[tok.value] >= minPrec) {
      const op = tok.value;
      const prec = PREC[op];
      p++;
      const [right, np] = parseExpr(tokens, p, prec + 1);
      left = { type: "binary", op, left, right };
      p = np;
      continue;
    }

    // Function call: expr(args)
    if (tok.type === TOKEN.PUNC && tok.value === "(") {
      const [args, np] = parseArgList(tokens, p);
      left = { type: "call", callee: left, args };
      p = np;
      continue;
    }

    // Member access: expr.prop
    if (tok.type === TOKEN.PUNC && tok.value === ".") {
      p++;
      const prop = tokens[p++];
      left = { type: "member", obj: left, prop: prop.value, computed: false };
      continue;
    }

    // Computed access: expr[key]
    if (tok.type === TOKEN.PUNC && tok.value === "[") {
      p++;
      const [key, np] = parseExpr(tokens, p, 0);
      if (tokens[np]?.value === "]") p = np + 1; else p = np;
      left = { type: "member", obj: left, prop: key, computed: true };
      continue;
    }

    // Ternary: expr ? then : else (precedence 2, right-associative)
    if (tok.type === TOKEN.PUNC && tok.value === "?" && minPrec <= 2) {
      p++;
      const [then_, np1] = parseExpr(tokens, p, 0);
      let else_;
      let np2 = np1;
      if (tokens[np1]?.value === ":") {
        const [e, np] = parseExpr(tokens, np1 + 1, 2);
        else_ = e;
        np2 = np;
      } else {
        else_ = { type: "literal", value: undefined };
      }
      left = { type: "ternary", cond: left, then: then_, else: else_ };
      p = np2;
      continue;
    }

    break;
  }

  return [left, p];
}

function parsePrefix(tokens, pos) {
  const tok = tokens[pos];

  // Number literal
  if (tok.type === TOKEN.NUM) return [{ type: "literal", value: tok.value }, pos + 1];

  // String literal
  if (tok.type === TOKEN.STR) {
    if (tok.template) return [{ type: "template", raw: tok.value }, pos + 1];
    return [{ type: "literal", value: tok.value }, pos + 1];
  }

  // Boolean, null, undefined
  if ([TOKEN.BOOL, TOKEN.NULL, TOKEN.UNDEF].includes(tok.type))
    return [{ type: "literal", value: tok.value }, pos + 1];

  // Regex
  if (tok.type === TOKEN.REGEX) return [{ type: "literal", value: tok.value }, pos + 1];

  // typeof
  if (tok.type === TOKEN.TYPEOF) {
    const [arg, np] = parseExpr(tokens, pos + 1, 14);
    return [{ type: "typeof", arg }, np];
  }

  // new Constructor(args)
  if (tok.type === TOKEN.NEW) {
    const [callee, np] = parseExpr(tokens, pos + 1, 17);
    // The call was already parsed as part of the expression
    if (callee.type === "call") return [{ type: "new", callee: callee.callee, args: callee.args }, np];
    return [{ type: "new", callee, args: [] }, np];
  }

  // Unary: !, -
  if (tok.type === TOKEN.OP && (tok.value === "!" || tok.value === "-")) {
    const [arg, np] = parseExpr(tokens, pos + 1, 14);
    return [{ type: "unary", op: tok.value, arg }, np];
  }

  // Parenthesized expression or arrow function
  if (tok.type === TOKEN.PUNC && tok.value === "(") {
    // Try arrow function: (params) => body
    const saved = pos;
    pos++;
    const params = [];
    while (pos < tokens.length && tokens[pos].value !== ")") {
      if (tokens[pos].type === TOKEN.ID) params.push(tokens[pos].value);
      pos++;
      if (tokens[pos]?.value === ",") pos++;
    }
    pos++; // skip )
    if (tokens[pos]?.type === TOKEN.ARROW) {
      pos++; // skip =>
      const [body, np] = parseExpr(tokens, pos, 0);
      return [{ type: "arrow", params, body }, np];
    }
    // Not arrow — parse as grouped expression
    pos = saved + 1;
    const [expr, np] = parseExpr(tokens, pos, 0);
    if (tokens[np]?.value === ")") return [expr, np + 1];
    return [expr, np];
  }

  // Array literal: [a, b, c]
  if (tok.type === TOKEN.PUNC && tok.value === "[") {
    const [items, np] = parseItemList(tokens, pos + 1, "]");
    return [{ type: "array", items }, np];
  }

  // Object literal: {a: 1, b: 2}
  if (tok.type === TOKEN.PUNC && tok.value === "{") {
    return parseObjectLiteral(tokens, pos + 1);
  }

  // Identifier (may be arrow: x => body)
  if (tok.type === TOKEN.ID) {
    if (tokens[pos + 1]?.type === TOKEN.ARROW) {
      const param = tok.value;
      const [body, np] = parseExpr(tokens, pos + 2, 0);
      return [{ type: "arrow", params: [param], body }, np];
    }
    return [{ type: "id", name: tok.value }, pos + 1];
  }

  // Fallback
  return [{ type: "literal", value: undefined }, pos + 1];
}

function parseArgList(tokens, pos) {
  pos++; // skip (
  const args = [];
  while (pos < tokens.length && tokens[pos]?.value !== ")") {
    const [arg, np] = parseExpr(tokens, pos, 0);
    args.push(arg);
    pos = np;
    if (tokens[pos]?.value === ",") pos++;
  }
  return [args, pos + 1]; // skip )
}

function parseItemList(tokens, pos, closer) {
  const items = [];
  while (pos < tokens.length && tokens[pos]?.value !== closer) {
    const [item, np] = parseExpr(tokens, pos, 0);
    items.push(item);
    pos = np;
    if (tokens[pos]?.value === ",") pos++;
  }
  return [items, pos + 1]; // skip closer
}

function parseObjectLiteral(tokens, pos) {
  const props = [];
  while (pos < tokens.length && tokens[pos]?.value !== "}") {
    const key = tokens[pos];
    if (key.type === TOKEN.ID && tokens[pos + 1]?.value === ":") {
      pos += 2;
      const [val, np] = parseExpr(tokens, pos, 0);
      props.push({ key: key.value, value: val });
      pos = np;
    } else if (key.type === TOKEN.ID) {
      // Shorthand: { x } means { x: x }
      props.push({ key: key.value, value: { type: "id", name: key.value } });
      pos++;
    } else if (key.type === TOKEN.STR) {
      pos++;
      if (tokens[pos]?.value === ":") {
        pos++;
        const [val, np] = parseExpr(tokens, pos, 0);
        props.push({ key: key.value, value: val });
        pos = np;
      }
    } else {
      pos++; // skip unknown
    }
    if (tokens[pos]?.value === ",") pos++;
  }
  return [{ type: "object", props }, pos + 1]; // skip }
}

// ============================================================
// EVALUATOR (tree-walking)
// ============================================================

export function evaluate(node, env) {
  switch (node.type) {
    case "literal": return node.value;

    case "template": {
      // Template literal with ${expr}
      return node.raw.replace(/\$\{([^}]+)\}/g, (_, expr) => {
        const ast = parseExpression(expr);
        return String(evaluate(ast, env));
      });
    }

    case "id": {
      const val = env(node.name);
      if (val === Symbol.for("__undef__")) return undefined;
      return val;
    }

    case "typeof": {
      try { return typeof evaluate(node.arg, env); } catch { return "undefined"; }
    }

    case "unary":
      if (node.op === "!") return !evaluate(node.arg, env);
      if (node.op === "-") return -evaluate(node.arg, env);
      return undefined;

    case "ternary":
      return evaluate(node.cond, env) ? evaluate(node.then, env) : evaluate(node.else, env);

    case "binary": {
      const l = evaluate(node.left, env);
      // Short-circuit
      if (node.op === "&&") return l ? evaluate(node.right, env) : l;
      if (node.op === "||") return l ? l : evaluate(node.right, env);
      const r = evaluate(node.right, env);
      switch (node.op) {
        case "+": return l + r;
        case "-": return l - r;
        case "*": return l * r;
        case "/": return l / r;
        case "%": return l % r;
        case "==": case "===": return l === r;
        case "!=": case "!==": return l !== r;
        case "<": return l < r;
        case ">": return l > r;
        case "<=": return l <= r;
        case ">=": return l >= r;
      }
      return undefined;
    }

    case "member": {
      const obj = evaluate(node.obj, env);
      if (node.computed) {
        const key = evaluate(node.prop, env);
        return obj?.[key];
      }
      return obj?.[node.prop];
    }

    case "call": {
      if (node.callee.type === "member") {
        const obj = evaluate(node.callee.obj, env);
        const method = obj?.[node.callee.prop];
        const args = node.args.map(a => evaluate(a, env));
        return method?.apply(obj, args);
      }
      const fn = evaluate(node.callee, env);
      const args = node.args.map(a => evaluate(a, env));
      return fn?.(...args);
    }

    case "new": {
      const Ctor = evaluate(node.callee, env);
      const args = node.args.map(a => evaluate(a, env));
      return new Ctor(...args);
    }

    case "arrow": {
      const closedEnv = env;
      return (...args) => {
        const localEnv = (name) => {
          const idx = node.params.indexOf(name);
          if (idx >= 0) return args[idx];
          return closedEnv(name);
        };
        return evaluate(node.body, localEnv);
      };
    }

    case "array":
      return node.items.map(item => evaluate(item, env));

    case "object": {
      const obj = {};
      for (const p of node.props) {
        obj[p.key] = evaluate(p.value, env);
      }
      return obj;
    }

    default: return undefined;
  }
}

// ============================================================
// PUBLIC API
// ============================================================

export function parseExpression(src) {
  const tokens = tokenize(src);
  const [ast] = parseExpr(tokens, 0, 0);
  return ast;
}

/**
 * Evaluate a .ben expression string with a given variable environment.
 * @param {string} expr - The expression to evaluate
 * @param {object} bindings - Variable name → value mappings
 * @returns {*} - The result
 */
export function evalExpression(expr, bindings) {
  const ast = parseExpression(expr);
  const env = (name) => {
    if (name in bindings) return bindings[name];
    // Built-in globals
    if (name === "Math") return Math;
    if (name === "JSON") return JSON;
    if (name === "Object") return Object;
    if (name === "Array") return Array;
    if (name === "Number") return Number;
    if (name === "String") return String;
    if (name === "parseInt") return parseInt;
    if (name === "parseFloat") return parseFloat;
    if (name === "RegExp") return RegExp;
    if (name === "Map") return Map;
    if (name === "Set") return Set;
    if (name === "Date") return Date;
    if (name === "Function") return Function;
    if (name === "console") return console;
    if (name === "Infinity") return Infinity;
    if (name === "NaN") return NaN;
    if (name === "isNaN") return isNaN;
    if (name === "isFinite") return isFinite;
    return undefined;
  };
  return evaluate(ast, env);
}
