import type { EbnfAst, RegexAst } from '../../ast/grammar.js';
import type { Scene, Shape } from '../../scene/types.js';
import { measureText } from '../sequence/measure.js';
import { layoutEbnfRailroad } from './ebnf-railroad.js';
import { layoutRegexRailroad } from './regex-railroad.js';

const PAGE_PAD = 16;
const TITLE_FONT = 16;
const TITLE_GAP = 10;
const CELL_PAD_X = 12;
const CELL_PAD_Y = 8;
const ROW_GAP = 0;
const NAME_FONT = 13;
const BODY_FONT = 13;
const FONT_FAMILY = 'sans-serif';
const FONT_MONO = 'ui-monospace, Menlo, Consolas, monospace';

const COLOR_LINE = '#aaa';
const COLOR_NAME_FILL = '#eef3fb';
const COLOR_BODY_FILL = '#ffffff';
const COLOR_REGEX_FILL = '#f6f8fa';

export function layoutEbnf(ast: EbnfAst): Scene {
  if (ast.rules.length === 0) {
    return emptyScene('ebnf');
  }
  return layoutEbnfRailroad(ast);
}

export function layoutEbnfTable(ast: EbnfAst): Scene {
  const titleHeight = ast.title ? TITLE_FONT + TITLE_GAP : 0;

  if (ast.rules.length === 0) {
    return emptyScene('ebnf');
  }

  const measured = ast.rules.map((r) => {
    const nameW = measureText(r.name, NAME_FONT).width;
    const bodyLines = wrapTokens(r.body, 64);
    const bodyW = Math.max(
      ...bodyLines.map((l) => measureText(l, BODY_FONT).width),
    );
    const bodyH = bodyLines.length * (BODY_FONT * 1.3);
    return {
      rule: r,
      nameW,
      bodyLines,
      bodyW,
      bodyH,
      rowH: Math.max(BODY_FONT * 1.4 + CELL_PAD_Y * 2, bodyH + CELL_PAD_Y * 2),
    };
  });

  const colNameW = Math.max(...measured.map((m) => m.nameW)) + CELL_PAD_X * 2;
  const colBodyW = Math.max(...measured.map((m) => m.bodyW)) + CELL_PAD_X * 2;
  const tableW = colNameW + colBodyW;
  const tableH = measured.reduce((s, m) => s + m.rowH + ROW_GAP, 0);

  const totalW = tableW + PAGE_PAD * 2;
  const totalH = tableH + PAGE_PAD * 2 + titleHeight;
  const originX = PAGE_PAD;
  const originY = PAGE_PAD + titleHeight;

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

  let cy = originY;
  for (const m of measured) {
    // Name cell
    shapes.push({
      type: 'rect',
      x: originX,
      y: cy,
      w: colNameW,
      h: m.rowH,
      style: { fill: COLOR_NAME_FILL, stroke: COLOR_LINE, strokeWidth: 1 },
    });
    shapes.push({
      type: 'text',
      x: originX + CELL_PAD_X,
      y: cy + m.rowH / 2,
      text: m.rule.name,
      anchor: 'start',
      baseline: 'middle',
      font: { family: FONT_MONO, size: NAME_FONT, weight: 'bold', color: '#000' },
    });
    // "=" separator (just textual hint, not a real column)
    shapes.push({
      type: 'text',
      x: originX + colNameW - 4,
      y: cy + m.rowH / 2,
      text: '=',
      anchor: 'end',
      baseline: 'middle',
      font: { family: FONT_MONO, size: NAME_FONT, color: '#888' },
    });
    // Body cell
    shapes.push({
      type: 'rect',
      x: originX + colNameW,
      y: cy,
      w: colBodyW,
      h: m.rowH,
      style: { fill: COLOR_BODY_FILL, stroke: COLOR_LINE, strokeWidth: 1 },
    });
    const startY = cy + CELL_PAD_Y + BODY_FONT * 0.9;
    for (let i = 0; i < m.bodyLines.length; i++) {
      shapes.push({
        type: 'text',
        x: originX + colNameW + CELL_PAD_X,
        y: startY + i * BODY_FONT * 1.3,
        text: m.bodyLines[i]!,
        anchor: 'start',
        baseline: 'alphabetic',
        font: { family: FONT_MONO, size: BODY_FONT, color: '#000' },
      });
    }
    cy += m.rowH + ROW_GAP;
  }

  return {
    width: totalW,
    height: totalH,
    background: '#fff',
    children: shapes,
  };
}

export function layoutRegex(ast: RegexAst): Scene {
  const rail = layoutRegexRailroad(ast);
  if (rail) return rail;

  // Fall back to monospace text box if the pattern fails to parse.
  const titleHeight = ast.title ? TITLE_FONT + TITLE_GAP : 0;
  const lines = ast.pattern ? ast.pattern.split('\n') : ['(empty regex)'];

  const lineWidths = lines.map((l) => measureText(l, BODY_FONT).width);
  const contentW = Math.max(...lineWidths, 200);
  const contentH = lines.length * (BODY_FONT * 1.4);

  const boxW = contentW + CELL_PAD_X * 2;
  const boxH = contentH + CELL_PAD_Y * 2;
  const totalW = boxW + PAGE_PAD * 2;
  const totalH = boxH + PAGE_PAD * 2 + titleHeight;

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

  const boxX = PAGE_PAD;
  const boxY = PAGE_PAD + titleHeight;
  shapes.push({
    type: 'rect',
    x: boxX,
    y: boxY,
    w: boxW,
    h: boxH,
    rx: 4, ry: 4,
    style: { fill: COLOR_REGEX_FILL, stroke: COLOR_LINE, strokeWidth: 1 },
  });

  const startY = boxY + CELL_PAD_Y + BODY_FONT * 0.9;
  for (let i = 0; i < lines.length; i++) {
    shapes.push({
      type: 'text',
      x: boxX + CELL_PAD_X,
      y: startY + i * BODY_FONT * 1.4,
      text: lines[i]!,
      anchor: 'start',
      baseline: 'alphabetic',
      font: { family: FONT_MONO, size: BODY_FONT, color: '#000' },
    });
  }

  return {
    width: totalW,
    height: totalH,
    background: '#fff',
    children: shapes,
  };
}

function wrapTokens(body: string, maxCharsPerLine: number): string[] {
  if (body.length <= maxCharsPerLine) return [body];
  const tokens = body.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const t of tokens) {
    if (cur.length === 0) {
      cur = t;
    } else if (cur.length + 1 + t.length <= maxCharsPerLine) {
      cur += ' ' + t;
    } else {
      lines.push(cur);
      cur = t;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function emptyScene(kind: string): Scene {
  return {
    width: 240,
    height: 60,
    background: '#fff',
    children: [
      {
        type: 'text',
        x: 120, y: 30,
        text: `(empty ${kind})`,
        anchor: 'middle', baseline: 'middle',
        font: { family: FONT_FAMILY, size: 12, color: '#999' },
      },
    ],
  };
}
