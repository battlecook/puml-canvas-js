import type { Token, TokenKind } from './types.js';

const WRAPPER_RE = /^@(start|end)([a-z]+)\b/i;
const IDENT_START = /[A-Za-z_]/;
const IDENT_CONT = /[A-Za-z0-9_]/;
const DIGIT = /[0-9]/;

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  const lines = source.split(/\r\n|\r|\n/);

  let inBlockComment = false;

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx]!;
    const lineNo = lineIdx + 1;
    let col = 0;

    while (col < line.length) {
      if (inBlockComment) {
        const end = line.indexOf("'/", col);
        if (end === -1) { col = line.length; break; }
        inBlockComment = false;
        col = end + 2;
        continue;
      }

      const ch = line[col]!;

      if (ch === ' ' || ch === '\t') { col++; continue; }

      if (ch === '/' && line[col + 1] === "'") {
        inBlockComment = true;
        col += 2;
        continue;
      }

      if (ch === "'") {
        col = line.length;
        break;
      }

      if (ch === '@') {
        const rest = line.slice(col);
        const m = WRAPPER_RE.exec(rest);
        if (m) {
          const kind: TokenKind = m[1]!.toLowerCase() === 'start' ? 'WrapperStart' : 'WrapperEnd';
          tokens.push({ kind, value: m[2]!.toLowerCase(), pos: { line: lineNo, column: col + 1 } });
          col += m[0].length;
          continue;
        }
      }

      if (ch === '"') {
        const start = col;
        col++;
        let value = '';
        while (col < line.length && line[col] !== '"') {
          if (line[col] === '\\' && col + 1 < line.length) {
            value += line[col + 1];
            col += 2;
          } else {
            value += line[col];
            col++;
          }
        }
        if (col < line.length) col++;
        tokens.push({ kind: 'String', value, pos: { line: lineNo, column: start + 1 } });
        continue;
      }

      if (DIGIT.test(ch)) {
        const start = col;
        while (col < line.length && DIGIT.test(line[col]!)) col++;
        if (line[col] === '.' && col + 1 < line.length && DIGIT.test(line[col + 1]!)) {
          col++;
          while (col < line.length && DIGIT.test(line[col]!)) col++;
        }
        tokens.push({ kind: 'Number', value: line.slice(start, col), pos: { line: lineNo, column: start + 1 } });
        continue;
      }

      if (IDENT_START.test(ch)) {
        const start = col;
        while (col < line.length && IDENT_CONT.test(line[col]!)) col++;
        tokens.push({ kind: 'Identifier', value: line.slice(start, col), pos: { line: lineNo, column: start + 1 } });
        continue;
      }

      if (ch === ':') {
        tokens.push({ kind: 'Colon', value: ':', pos: { line: lineNo, column: col + 1 } });
        col++;
        continue;
      }

      tokens.push({ kind: 'Symbol', value: ch, pos: { line: lineNo, column: col + 1 } });
      col++;
    }

    if (lineIdx < lines.length - 1) {
      tokens.push({ kind: 'Newline', value: '\n', pos: { line: lineNo, column: line.length + 1 } });
    }
  }

  tokens.push({ kind: 'EOF', value: '', pos: { line: lines.length, column: 1 } });
  return tokens;
}
