export type RegexExpr =
  | { type: 'literal'; value: string }
  | { type: 'charclass'; raw: string }
  | { type: 'anchor'; kind: 'start' | 'end' | 'wordboundary' | 'nonwordboundary' }
  | { type: 'any' }
  | { type: 'seq'; items: RegexExpr[] }
  | { type: 'alt'; alternatives: RegexExpr[] }
  | { type: 'group'; body: RegexExpr; capturing: boolean }
  | { type: 'quantified'; body: RegexExpr; min: number; max: number | null };

interface State {
  i: number;
  input: string;
}

export function parseRegexPattern(input: string): RegexExpr | null {
  try {
    const s: State = { i: 0, input };
    const result = parseAlt(s);
    if (s.i < input.length) return null;
    return result;
  } catch {
    return null;
  }
}

function peek(s: State): string {
  return s.i < s.input.length ? s.input[s.i]! : '';
}

function consume(s: State): string {
  return s.input[s.i++]!;
}

function parseAlt(s: State): RegexExpr {
  const items: RegexExpr[] = [parseSeq(s)];
  while (peek(s) === '|') {
    s.i++;
    items.push(parseSeq(s));
  }
  return items.length === 1 ? items[0]! : { type: 'alt', alternatives: items };
}

function parseSeq(s: State): RegexExpr {
  const items: RegexExpr[] = [];
  while (s.i < s.input.length) {
    const c = peek(s);
    if (c === ')' || c === '|') break;
    const atom = parseAtom(s);
    const quant = parseQuantifier(s);
    if (quant) {
      items.push({ type: 'quantified', body: atom, min: quant.min, max: quant.max });
    } else {
      items.push(atom);
    }
  }
  const merged = mergeLiterals(items);
  if (merged.length === 0) return { type: 'literal', value: '' };
  return merged.length === 1 ? merged[0]! : { type: 'seq', items: merged };
}

function mergeLiterals(items: RegexExpr[]): RegexExpr[] {
  const out: RegexExpr[] = [];
  for (const item of items) {
    const last = out[out.length - 1];
    if (item.type === 'literal' && last && last.type === 'literal') {
      out[out.length - 1] = { type: 'literal', value: last.value + item.value };
    } else {
      out.push(item);
    }
  }
  return out;
}

function parseAtom(s: State): RegexExpr {
  const c = consume(s);
  if (c === '^') return { type: 'anchor', kind: 'start' };
  if (c === '$') return { type: 'anchor', kind: 'end' };
  if (c === '.') return { type: 'any' };
  if (c === '\\') {
    const next = consume(s);
    if (next === 'b') return { type: 'anchor', kind: 'wordboundary' };
    if (next === 'B') return { type: 'anchor', kind: 'nonwordboundary' };
    if ('sdwSDW'.includes(next)) return { type: 'charclass', raw: '\\' + next };
    if (next === 'n' || next === 'r' || next === 't') return { type: 'charclass', raw: '\\' + next };
    if ((next === 'p' || next === 'P') && peek(s) === '{') {
      // Unicode property escape: \p{Name} / \P{Name}. Name allows letters and underscore
      // (e.g. \p{L}, \p{Letter}, \p{Lowercase_letter}). Optional value form \p{Name=Value}
      // is also accepted.
      const save = s.i;
      s.i++; // consume '{'
      let name = '';
      while (s.i < s.input.length && /[A-Za-z_=]/.test(peek(s))) {
        name += consume(s);
      }
      if (name.length > 0 && peek(s) === '}') {
        s.i++; // consume '}'
        return { type: 'charclass', raw: '\\' + next + '{' + name + '}' };
      }
      // Malformed — rewind and fall through to literal handling of `next`.
      s.i = save;
    }
    if (next === 'Q') {
      // Literal sequence: \Q...\E matches enclosed text literally.
      // Unterminated \Q runs to end of input (PCRE/Java semantics).
      let value = '';
      while (s.i < s.input.length) {
        if (peek(s) === '\\' && s.input[s.i + 1] === 'E') {
          s.i += 2;
          break;
        }
        value += consume(s);
      }
      return { type: 'literal', value };
    }
    return { type: 'literal', value: next };
  }
  if (c === '[') {
    let raw = '[';
    while (s.i < s.input.length && peek(s) !== ']') {
      if (peek(s) === '\\') {
        raw += consume(s);
        if (s.i < s.input.length) raw += consume(s);
      } else {
        raw += consume(s);
      }
    }
    if (peek(s) === ']') {
      raw += consume(s);
    }
    return { type: 'charclass', raw };
  }
  if (c === '(') {
    let capturing = true;
    if (peek(s) === '?') {
      s.i++;
      if (peek(s) === ':') {
        s.i++;
        capturing = false;
      } else {
        // Skip unknown (?...) prefix (lookahead/lookbehind/etc.) — capture until ':' or treat as group
        while (s.i < s.input.length && peek(s) !== ':' && peek(s) !== ')') s.i++;
        if (peek(s) === ':') s.i++;
        capturing = false;
      }
    }
    const body = parseAlt(s);
    if (peek(s) === ')') s.i++;
    return { type: 'group', body, capturing };
  }
  return { type: 'literal', value: c };
}

function parseQuantifier(s: State): { min: number; max: number | null } | null {
  const c = peek(s);
  if (c === '*') { s.i++; consumeLazy(s); return { min: 0, max: null }; }
  if (c === '+') { s.i++; consumeLazy(s); return { min: 1, max: null }; }
  if (c === '?') { s.i++; consumeLazy(s); return { min: 0, max: 1 }; }
  if (c === '{') {
    const save = s.i;
    s.i++;
    let raw = '';
    while (s.i < s.input.length && peek(s) !== '}') {
      raw += consume(s);
    }
    if (peek(s) !== '}') {
      s.i = save;
      return null;
    }
    s.i++;
    const m = /^(\d+)(?:,(\d*))?$/.exec(raw);
    if (!m) return null;
    const min = Number(m[1]);
    const max = m[2] === undefined ? min : m[2] === '' ? null : Number(m[2]);
    consumeLazy(s);
    return { min, max };
  }
  return null;
}

function consumeLazy(s: State): void {
  if (peek(s) === '?') s.i++;
}
