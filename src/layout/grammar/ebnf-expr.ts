export type EbnfExpr =
  | { type: 'terminal'; value: string }
  | { type: 'nonterminal'; name: string }
  | { type: 'special'; text: string }
  | { type: 'seq'; items: EbnfExpr[] }
  | { type: 'alt'; alternatives: EbnfExpr[] }
  | { type: 'rep'; body: EbnfExpr }
  | { type: 'opt'; body: EbnfExpr };

type TokType =
  | 'comma' | 'pipe'
  | 'lbrace' | 'rbrace'
  | 'lbracket' | 'rbracket'
  | 'lparen' | 'rparen'
  | 'terminal' | 'special' | 'ident' | 'eof';

interface Token {
  type: TokType;
  value: string;
}

export function parseEbnfBody(input: string): EbnfExpr | null {
  try {
    const tokens = tokenize(input);
    const state = { i: 0, tokens };
    const expr = parseAlt(state);
    if (state.tokens[state.i]!.type !== 'eof') return null;
    return expr;
  } catch {
    return null;
  }
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const c = input[i]!;
    if (/\s/.test(c)) { i++; continue; }
    if (c === ',') { tokens.push({ type: 'comma', value: ',' }); i++; continue; }
    if (c === '|') { tokens.push({ type: 'pipe', value: '|' }); i++; continue; }
    if (c === '{') { tokens.push({ type: 'lbrace', value: '{' }); i++; continue; }
    if (c === '}') { tokens.push({ type: 'rbrace', value: '}' }); i++; continue; }
    if (c === '[') { tokens.push({ type: 'lbracket', value: '[' }); i++; continue; }
    if (c === ']') { tokens.push({ type: 'rbracket', value: ']' }); i++; continue; }
    if (c === '(') { tokens.push({ type: 'lparen', value: '(' }); i++; continue; }
    if (c === ')') { tokens.push({ type: 'rparen', value: ')' }); i++; continue; }
    if (c === '"' || c === "'") {
      const quote = c;
      i++;
      let val = '';
      while (i < input.length && input[i] !== quote) val += input[i++];
      if (i < input.length) i++;
      tokens.push({ type: 'terminal', value: val });
      continue;
    }
    if (c === '?') {
      i++;
      let val = '';
      while (i < input.length && input[i] !== '?') val += input[i++];
      if (i < input.length) i++;
      tokens.push({ type: 'special', value: val.trim() });
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let val = '';
      while (i < input.length && /[A-Za-z0-9_]/.test(input[i]!)) val += input[i++];
      tokens.push({ type: 'ident', value: val });
      continue;
    }
    i++;
  }
  tokens.push({ type: 'eof', value: '' });
  return tokens;
}

interface State {
  i: number;
  tokens: Token[];
}

function peek(s: State): Token { return s.tokens[s.i]!; }
function consume(s: State): Token { return s.tokens[s.i++]!; }

function parseAlt(s: State): EbnfExpr {
  const items: EbnfExpr[] = [parseSeq(s)];
  while (peek(s).type === 'pipe') {
    consume(s);
    items.push(parseSeq(s));
  }
  return items.length === 1 ? items[0]! : { type: 'alt', alternatives: items };
}

function parseSeq(s: State): EbnfExpr {
  const items: EbnfExpr[] = [parsePrimary(s)];
  while (peek(s).type === 'comma') {
    consume(s);
    items.push(parsePrimary(s));
  }
  return items.length === 1 ? items[0]! : { type: 'seq', items };
}

function parsePrimary(s: State): EbnfExpr {
  const t = peek(s);
  if (t.type === 'terminal') {
    consume(s);
    return { type: 'terminal', value: t.value };
  }
  if (t.type === 'ident') {
    consume(s);
    return { type: 'nonterminal', name: t.value };
  }
  if (t.type === 'special') {
    consume(s);
    return { type: 'special', text: t.value };
  }
  if (t.type === 'lbrace') {
    consume(s);
    const body = parseAlt(s);
    expect(s, 'rbrace');
    return { type: 'rep', body };
  }
  if (t.type === 'lbracket') {
    consume(s);
    const body = parseAlt(s);
    expect(s, 'rbracket');
    return { type: 'opt', body };
  }
  if (t.type === 'lparen') {
    consume(s);
    const body = parseAlt(s);
    expect(s, 'rparen');
    return body;
  }
  throw new Error(`Unexpected token: ${t.type}`);
}

function expect(s: State, type: TokType): Token {
  const t = consume(s);
  if (t.type !== type) throw new Error(`Expected ${type}, got ${t.type}`);
  return t;
}
