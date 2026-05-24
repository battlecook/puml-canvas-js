import type { EbnfAst, EbnfRule } from '../../ast/grammar.js';

const WRAPPER = /^@(start|end)\w+/i;
const LINE_COMMENT = /^\s*\(\*/;
const TITLE = /^title\s+(.+)\s*$/i;

export function parseEbnf(source: string): EbnfAst {
  const ast: EbnfAst = { kind: 'ebnf', title: '', rules: [] };
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
    lines.push(raw);
  }

  // Join lines and split on `;` (rule terminator)
  const body = lines.join(' ').replace(/\s+/g, ' ').trim();
  if (!body) return ast;

  const ruleTexts = body.split(';').map((s) => s.trim()).filter(Boolean);
  for (const ruleText of ruleTexts) {
    const eqIdx = ruleText.indexOf('=');
    if (eqIdx === -1) continue;
    const name = ruleText.slice(0, eqIdx).trim();
    const rhs = ruleText.slice(eqIdx + 1).trim();
    if (!name) continue;
    const rule: EbnfRule = { name, body: rhs };
    ast.rules.push(rule);
  }

  return ast;
}
