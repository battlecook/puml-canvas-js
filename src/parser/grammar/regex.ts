import type { RegexAst } from '../../ast/grammar.js';

const WRAPPER = /^@(start|end)\w+/i;
const LINE_COMMENT = /^\s*'/;
const TITLE = /^title\s+(.+)\s*$/i;

export function parseRegex(source: string): RegexAst {
  const ast: RegexAst = { kind: 'regex', title: '', pattern: '' };
  const lines: string[] = [];

  for (const raw of source.split(/\r\n|\r|\n/)) {
    const t = raw.trim();
    if (WRAPPER.test(t)) continue;
    if (!t) continue;
    if (LINE_COMMENT.test(t)) continue;
    const tm = TITLE.exec(t);
    if (tm) {
      ast.title = tm[1]!.trim();
      continue;
    }
    lines.push(t);
  }

  ast.pattern = lines.join('\n');
  return ast;
}
