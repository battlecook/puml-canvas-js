import type { RegexAst } from '../../ast/grammar.js';
import type { Scene, Shape } from '../../scene/types.js';
import { parseRegexPattern, type RegexExpr } from './regex-expr.js';
import type { EbnfExpr } from './ebnf-expr.js';
import { layoutExpr, type RailroadBox } from './ebnf-railroad.js';

const PAGE_PAD = 16;
const TITLE_FONT = 18;
const TITLE_GAP = 14;
const RULE_SIDE_PAD = 10;
const START_R = 5;
const END_R = 5;
const FONT_FAMILY = 'sans-serif';
const COLOR_LINE = '#222';
const STROKE = { stroke: COLOR_LINE, strokeWidth: 1, fill: 'none' };

const ANCHOR_LABEL: Record<string, string> = {
  start: '^',
  end: '$',
  wordboundary: '\\b',
  nonwordboundary: '\\B',
};

export function layoutRegexRailroad(ast: RegexAst): Scene | null {
  if (!ast.pattern) return null;
  const expr = parseRegexPattern(ast.pattern);
  if (!expr) return null;

  const body = layoutExpr(regexToEbnf(expr));
  const titleHeight = ast.title ? TITLE_FONT + TITLE_GAP : 0;
  const startW = START_R * 2;
  const endW = END_R * 2;
  const ruleW = startW + RULE_SIDE_PAD + body.w + RULE_SIDE_PAD + endW;
  const ruleH = body.h;
  const totalW = ruleW + PAGE_PAD * 2;
  const totalH = ruleH + PAGE_PAD * 2 + titleHeight;

  const shapes: Shape[] = [];
  if (ast.title) {
    shapes.push({
      type: 'text',
      x: totalW / 2,
      y: PAGE_PAD + TITLE_FONT,
      text: ast.title,
      anchor: 'middle',
      baseline: 'alphabetic',
      font: { family: FONT_FAMILY, size: TITLE_FONT, weight: 'bold', color: '#000' },
    });
  }

  const ruleX = PAGE_PAD;
  const ruleY = PAGE_PAD + titleHeight;
  const lineY = ruleY + body.entryY;

  shapes.push({
    type: 'circle',
    cx: ruleX + START_R,
    cy: lineY,
    r: START_R,
    style: { fill: '#fff', stroke: COLOR_LINE, strokeWidth: 1 },
  });
  shapes.push({
    type: 'line',
    x1: ruleX + startW,
    y1: lineY,
    x2: ruleX + startW + RULE_SIDE_PAD,
    y2: lineY,
    style: STROKE,
  });
  shapes.push(...body.draw(ruleX + startW + RULE_SIDE_PAD, ruleY));
  const bodyEndX = ruleX + startW + RULE_SIDE_PAD + body.w;
  shapes.push({
    type: 'line',
    x1: bodyEndX,
    y1: lineY,
    x2: ruleX + ruleW - endW,
    y2: lineY,
    style: STROKE,
  });
  shapes.push({
    type: 'circle',
    cx: ruleX + ruleW - END_R,
    cy: lineY,
    r: END_R,
    style: { fill: COLOR_LINE, stroke: COLOR_LINE, strokeWidth: 1 },
  });

  return {
    width: Math.max(totalW, 240),
    height: Math.max(totalH, 60),
    background: '#fff',
    children: shapes,
  };
}

function regexToEbnf(re: RegexExpr): EbnfExpr {
  switch (re.type) {
    case 'literal':
      return { type: 'terminal', value: re.value };
    case 'charclass':
      return { type: 'special', text: re.raw };
    case 'anchor':
      return { type: 'terminal', value: ANCHOR_LABEL[re.kind] ?? re.kind };
    case 'any':
      return { type: 'special', text: '.' };
    case 'seq':
      return { type: 'seq', items: re.items.map(regexToEbnf) };
    case 'alt':
      return { type: 'alt', alternatives: re.alternatives.map(regexToEbnf) };
    case 'group':
      return regexToEbnf(re.body);
    case 'quantified': {
      const inner = regexToEbnf(re.body);
      // *: zero or more → opt(rep)
      if (re.min === 0 && re.max === null) {
        return { type: 'opt', body: { type: 'rep', body: inner } };
      }
      // +: one or more → rep
      if (re.min === 1 && re.max === null) {
        return { type: 'rep', body: inner };
      }
      // ?: zero or one → opt
      if (re.min === 0 && re.max === 1) {
        return { type: 'opt', body: inner };
      }
      // {n,m} fallback: treat min>=1 as rep, else opt(rep)
      if (re.min === 0) return { type: 'opt', body: { type: 'rep', body: inner } };
      return { type: 'rep', body: inner };
    }
  }
}

// Avoid unused-import error on RailroadBox (exported but used only as type ref above).
export type _Ref = RailroadBox;
