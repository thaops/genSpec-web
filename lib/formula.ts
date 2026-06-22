// Safe arithmetic evaluator for take-off quantity formulas.
// Supports + - * / ( ) and decimals only — no identifiers, no JS eval.
// Vietnamese number style (comma decimal, × ÷) is normalised first.
// Returns null when the formula is empty or invalid so callers can fall back.

const ALLOWED = /^[0-9+\-*/().\s]+$/;

export function normalizeFormula(raw: string): string {
  return raw
    .replace(/×/g, "*")
    .replace(/÷/g, "/")
    .replace(/,/g, ".")
    .trim();
}

// Tokenise + shunting-yard to RPN, then evaluate. No `Function`/`eval`.
export function evalFormula(raw: string): number | null {
  if (!raw || !raw.trim()) return null;
  const expr = normalizeFormula(raw);
  if (!ALLOWED.test(expr)) return null;

  const tokens = expr.match(/\d*\.?\d+|[+\-*/()]/g);
  if (!tokens) return null;

  const out: (number | string)[] = [];
  const ops: string[] = [];
  const prec: Record<string, number> = { "+": 1, "-": 1, "*": 2, "/": 2 };

  let prevType: "num" | "op" | "open" | null = null;

  for (let i = 0; i < tokens.length; i++) {
    const tk = tokens[i];
    if (/^\d|\./.test(tk)) {
      out.push(Number(tk));
      prevType = "num";
    } else if (tk === "(") {
      ops.push(tk);
      prevType = "open";
    } else if (tk === ")") {
      while (ops.length && ops[ops.length - 1] !== "(") out.push(ops.pop()!);
      if (!ops.length) return null; // unbalanced
      ops.pop();
      prevType = "num";
    } else {
      // operator — detect unary minus/plus
      const unary = tk === "-" && (prevType === null || prevType === "op" || prevType === "open");
      if (unary) {
        out.push(0); // 0 - x
      }
      while (
        ops.length &&
        ops[ops.length - 1] !== "(" &&
        prec[ops[ops.length - 1]] >= prec[tk]
      ) {
        out.push(ops.pop()!);
      }
      ops.push(tk);
      prevType = "op";
    }
  }
  while (ops.length) {
    const op = ops.pop()!;
    if (op === "(") return null;
    out.push(op);
  }

  const stack: number[] = [];
  for (const t of out) {
    if (typeof t === "number") {
      stack.push(t);
    } else {
      const b = stack.pop();
      const a = stack.pop();
      if (a === undefined || b === undefined) return null;
      let r: number;
      if (t === "+") r = a + b;
      else if (t === "-") r = a - b;
      else if (t === "*") r = a * b;
      else r = b === 0 ? NaN : a / b;
      stack.push(r);
    }
  }
  if (stack.length !== 1) return null;
  const result = stack[0];
  return isFinite(result) ? result : null;
}

// Pretty-print an expression for display: × ÷ and vi-VN style stays readable.
// Inverse of `normalizeFormula` for the operators a human reads.
export function displayExpr(expr: string): string {
  return expr.replace(/\*/g, " × ").replace(/\//g, " ÷ ").replace(/\s+/g, " ").trim();
}

// Split an expression into its TOP-LEVEL additive terms, keeping each term's
// sign attached. Respects parentheses (depth tracking) so `2*(15+20)` stays one
// term. Returns the raw sub-expressions (still in normalized `*` `/` form).
function splitTopLevelTerms(expr: string): string[] {
  const terms: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < expr.length; i++) {
    const c = expr[i];
    if (c === "(") depth++;
    else if (c === ")") depth--;
    else if ((c === "+" || c === "-") && depth === 0 && i > start) {
      // not a unary sign: previous non-space char must be a value/close-paren
      const prev = expr.slice(start, i).replace(/\s+$/, "").slice(-1);
      if (prev && prev !== "(" && !"+-*/".includes(prev)) {
        terms.push(expr.slice(start, i));
        start = i; // keep the leading sign with the next term
      }
    }
  }
  terms.push(expr.slice(start));
  return terms.map((t) => t.trim()).filter(Boolean);
}

export interface FormulaTerm {
  expr: string; // display form (× ÷)
  value: number;
}

export interface FormulaExplanation {
  terms: FormulaTerm[];
  factor?: FormulaTerm; // outer trailing multiplier, e.g. × 1.1
  total: number;
}

// Break a formula into a readable, term-by-term breakdown.
// - Peels a trailing outer factor `(...)*k` or `... *k` when the body splits
//   into several additive terms, so `(a+b)*1.1` reads as terms + factor.
// - Otherwise returns the additive terms of the whole expression.
// Reuses `evalFormula` for every piece — never `eval`.
export function explainFormula(raw: string): FormulaExplanation | null {
  if (!raw || !raw.trim()) return null;
  const expr = normalizeFormula(raw);
  if (!ALLOWED.test(expr)) return null;
  const total = evalFormula(expr);
  if (total === null) return null;

  let body = expr;
  let factor: FormulaTerm | undefined;

  // Detect outer trailing factor: a balanced parenthesised group followed by
  // `* <number>` (or `/ <number>`) at the very end, e.g. "(...)*1.1".
  const m = expr.match(/^\((.*)\)\s*([*/])\s*(\d*\.?\d+)\s*$/);
  if (m && balanced(m[1])) {
    const inner = m[1];
    const k = Number(m[3]);
    if (isFinite(k)) {
      body = inner;
      factor = { expr: `${m[2] === "*" ? "×" : "÷"} ${displayNum(k)}`, value: k };
    }
  }

  const rawTerms = splitTopLevelTerms(body);
  const terms: FormulaTerm[] = [];
  for (const tExpr of rawTerms) {
    const v = evalFormula(tExpr);
    if (v === null) return null;
    terms.push({ expr: displayExpr(tExpr), value: v });
  }

  return { terms, factor, total };
}

// Is a parenthesis-free-prefix substring balanced? (cheap guard for the regex)
function balanced(s: string): boolean {
  let d = 0;
  for (const c of s) {
    if (c === "(") d++;
    else if (c === ")") {
      d--;
      if (d < 0) return false;
    }
  }
  return d === 0;
}

// vi-VN number for the explainer (keeps decimals, e.g. 203,5 — not rounded).
export function displayNum(n: number): string {
  if (!isFinite(n)) return "0";
  return n.toLocaleString("vi-VN", { maximumFractionDigits: 4 });
}

// The effective formula for a take-off row: explicit formula text if present,
// otherwise the implicit dimensional product L × W × H × count.
export function dimsExpression(r: {
  length?: number;
  width?: number;
  height?: number;
  count?: number;
}): string {
  const parts = [r.length, r.width, r.height, r.count].filter(
    (v): v is number => v != null && v !== 0
  );
  return parts.map((v) => String(v)).join(" × ");
}

// Live-preview quantity: evaluate the explicit formula if any, else multiply
// the populated dimensions. Mirrors the server so edits feel instant.
export function previewQuantity(r: {
  length?: number;
  width?: number;
  height?: number;
  count?: number;
  formula?: string;
}): number | null {
  if (r.formula && r.formula.trim()) return evalFormula(r.formula);
  const dims = [r.length, r.width, r.height, r.count].filter(
    (v): v is number => v != null && v !== 0
  );
  if (!dims.length) return null;
  return dims.reduce((a, b) => a * b, 1);
}
