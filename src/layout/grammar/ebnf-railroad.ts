import type { EbnfAst, EbnfRule } from '../../ast/grammar.js';
import type { Scene, Shape, Style } from '../../scene/types.js';
import { measureText } from '../sequence/measure.js';
import { parseEbnfBody, type EbnfExpr } from './ebnf-expr.js';

const PAGE_PAD = 16;
const TITLE_FONT = 18;
const TITLE_GAP = 14;
const RULE_NAME_FONT = 14;
const RULE_NAME_H = 24;
const RULE_GAP = 22;
const FONT_BODY = 12;
const FONT_FAMILY = 'sans-serif';

const BOX_PAD_X = 12;
const BOX_PAD_Y = 6;
const SEQ_GAP = 14;
const ALT_INDENT = 18;
const ALT_GAP_V = 8;
const LOOP_TOP_PAD = 22;
const OPT_TOP_PAD = 22;
const START_R = 5;
const END_R = 5;
const RULE_SIDE_PAD = 10;
const ARROW_SIZE = 5;

const COLOR_LINE = '#222';
const COLOR_FILL = '#fefefe';

const STROKE: Style = { stroke: COLOR_LINE, strokeWidth: 1, fill: 'none' };

export interface RailroadBox {
  w: number;
  h: number;
  entryY: number;
  exitY: number;
  draw(x: number, y: number): Shape[];
}

export function layoutEbnfRailroad(ast: EbnfAst): Scene {
  const titleHeight = ast.title ? TITLE_FONT + TITLE_GAP : 0;
  const ruleBoxes = ast.rules.map((r) => layoutRule(r));

  const maxW = Math.max(0, ...ruleBoxes.map((r) => r.w));
  let cursorY = PAGE_PAD + titleHeight;
  const rulePositions: number[] = [];
  for (const r of ruleBoxes) {
    rulePositions.push(cursorY);
    cursorY += r.h + RULE_GAP;
  }
  const totalH = cursorY - RULE_GAP + PAGE_PAD;
  const totalW = maxW + PAGE_PAD * 2;

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

  for (let i = 0; i < ruleBoxes.length; i++) {
    const r = ruleBoxes[i]!;
    shapes.push(...r.draw(PAGE_PAD, rulePositions[i]!));
  }

  return {
    width: Math.max(totalW, 240),
    height: Math.max(totalH, 60),
    background: '#fff',
    children: shapes,
  };
}

function layoutRule(rule: EbnfRule): { w: number; h: number; draw(x: number, y: number): Shape[] } {
  const expr = parseEbnfBody(rule.body);
  const bodyBox = expr ? layoutExpr(expr) : layoutFallback(rule.body);

  const startW = START_R * 2;
  const endW = END_R * 2;
  const w = startW + RULE_SIDE_PAD + bodyBox.w + RULE_SIDE_PAD + endW;
  const h = RULE_NAME_H + bodyBox.h;

  return {
    w,
    h,
    draw(x, y) {
      const shapes: Shape[] = [];
      shapes.push({
        type: 'text',
        x,
        y: y + RULE_NAME_FONT + 2,
        text: rule.name,
        anchor: 'start',
        baseline: 'alphabetic',
        font: { family: FONT_FAMILY, size: RULE_NAME_FONT, weight: 'bold', color: '#000' },
      });

      const bodyY = y + RULE_NAME_H;
      const lineY = bodyY + bodyBox.entryY;

      shapes.push({
        type: 'circle',
        cx: x + START_R,
        cy: lineY,
        r: START_R,
        style: { fill: '#fff', stroke: COLOR_LINE, strokeWidth: 1 },
      });
      shapes.push({
        type: 'line',
        x1: x + startW,
        y1: lineY,
        x2: x + startW + RULE_SIDE_PAD,
        y2: lineY,
        style: STROKE,
      });
      shapes.push(...bodyBox.draw(x + startW + RULE_SIDE_PAD, bodyY));
      const bodyEndX = x + startW + RULE_SIDE_PAD + bodyBox.w;
      shapes.push({
        type: 'line',
        x1: bodyEndX,
        y1: lineY,
        x2: x + w - endW,
        y2: lineY,
        style: STROKE,
      });
      shapes.push({
        type: 'circle',
        cx: x + w - END_R,
        cy: lineY,
        r: END_R,
        style: { fill: COLOR_LINE, stroke: COLOR_LINE, strokeWidth: 1 },
      });

      return shapes;
    },
  };
}

export function layoutExpr(expr: EbnfExpr): RailroadBox {
  switch (expr.type) {
    case 'terminal':    return layoutTerminal(expr.value);
    case 'nonterminal': return layoutNonterminal(expr.name);
    case 'special':     return layoutSpecial(expr.text);
    case 'seq':         return layoutSeq(expr.items);
    case 'alt':         return layoutAlt(expr.alternatives);
    case 'rep':         return layoutRep(expr.body);
    case 'opt':         return layoutOpt(expr.body);
  }
}

function layoutFallback(body: string): RailroadBox {
  const m = measureText(body, FONT_BODY);
  const w = m.width + BOX_PAD_X * 2;
  const h = m.height + BOX_PAD_Y * 2;
  return {
    w, h,
    entryY: h / 2,
    exitY: h / 2,
    draw(x, y) {
      return [
        {
          type: 'rect',
          x, y, w, h,
          style: { fill: '#fff8e1', stroke: '#c98c00', strokeWidth: 1 },
        },
        {
          type: 'text',
          x: x + w / 2, y: y + h / 2,
          text: body,
          anchor: 'middle', baseline: 'middle',
          font: { family: FONT_FAMILY, size: FONT_BODY, color: '#000' },
        },
      ];
    },
  };
}

export function layoutTerminal(value: string): RailroadBox {
  const display = `"${value}"`;
  const m = measureText(display, FONT_BODY);
  const w = m.width + BOX_PAD_X * 2;
  const h = m.height + BOX_PAD_Y * 2;
  return {
    w, h,
    entryY: h / 2,
    exitY: h / 2,
    draw(x, y) {
      return [
        {
          type: 'rect',
          x, y, w, h,
          rx: h / 2, ry: h / 2,
          style: { fill: COLOR_FILL, stroke: COLOR_LINE, strokeWidth: 1 },
        },
        {
          type: 'text',
          x: x + w / 2, y: y + h / 2,
          text: display,
          anchor: 'middle', baseline: 'middle',
          font: { family: FONT_FAMILY, size: FONT_BODY, color: '#000' },
        },
      ];
    },
  };
}

function layoutNonterminal(name: string): RailroadBox {
  const m = measureText(name, FONT_BODY);
  const w = m.width + BOX_PAD_X * 2;
  const h = m.height + BOX_PAD_Y * 2;
  return {
    w, h,
    entryY: h / 2,
    exitY: h / 2,
    draw(x, y) {
      return [
        {
          type: 'rect',
          x, y, w, h,
          rx: 3, ry: 3,
          style: { fill: COLOR_FILL, stroke: COLOR_LINE, strokeWidth: 1 },
        },
        {
          type: 'text',
          x: x + w / 2, y: y + h / 2,
          text: name,
          anchor: 'middle', baseline: 'middle',
          font: { family: FONT_FAMILY, size: FONT_BODY, color: '#000' },
        },
      ];
    },
  };
}

function layoutSpecial(text: string): RailroadBox {
  const display = `? ${text} ?`;
  const m = measureText(display, FONT_BODY);
  const w = m.width + BOX_PAD_X * 2;
  const h = m.height + BOX_PAD_Y * 2;
  return {
    w, h,
    entryY: h / 2,
    exitY: h / 2,
    draw(x, y) {
      return [
        {
          type: 'rect',
          x, y, w, h,
          rx: 3, ry: 3,
          style: { fill: '#f0f0f0', stroke: COLOR_LINE, strokeWidth: 1, strokeDasharray: '3,2' },
        },
        {
          type: 'text',
          x: x + w / 2, y: y + h / 2,
          text: display,
          anchor: 'middle', baseline: 'middle',
          font: { family: FONT_FAMILY, size: FONT_BODY, style: 'italic', color: '#000' },
        },
      ];
    },
  };
}

function layoutSeq(items: EbnfExpr[]): RailroadBox {
  const boxes = items.map(layoutExpr);
  const sharedY = Math.max(...boxes.map((b) => b.entryY));
  let totalW = 0;
  let totalH = 0;
  const xs: number[] = [];
  for (let i = 0; i < boxes.length; i++) {
    if (i > 0) totalW += SEQ_GAP;
    xs.push(totalW);
    totalW += boxes[i]!.w;
    const bottom = sharedY - boxes[i]!.entryY + boxes[i]!.h;
    if (bottom > totalH) totalH = bottom;
  }
  return {
    w: totalW,
    h: totalH,
    entryY: sharedY,
    exitY: sharedY,
    draw(x, y) {
      const shapes: Shape[] = [];
      for (let i = 0; i < boxes.length; i++) {
        const box = boxes[i]!;
        const bx = x + xs[i]!;
        const by = y + sharedY - box.entryY;
        shapes.push(...box.draw(bx, by));
        if (i < boxes.length - 1) {
          const nextX = x + xs[i + 1]!;
          shapes.push({
            type: 'line',
            x1: bx + box.w,
            y1: y + sharedY,
            x2: nextX,
            y2: y + sharedY,
            style: STROKE,
          });
        }
      }
      return shapes;
    },
  };
}

function layoutAlt(alts: EbnfExpr[]): RailroadBox {
  const boxes = alts.map(layoutExpr);
  const maxItemW = Math.max(...boxes.map((b) => b.w));
  const totalW = ALT_INDENT * 2 + maxItemW;

  let totalH = 0;
  const yPositions: number[] = [];
  for (let i = 0; i < boxes.length; i++) {
    if (i > 0) totalH += ALT_GAP_V;
    yPositions.push(totalH);
    totalH += boxes[i]!.h;
  }
  const entryY = boxes[0]!.entryY;

  return {
    w: totalW,
    h: totalH,
    entryY,
    exitY: entryY,
    draw(x, y) {
      const shapes: Shape[] = [];
      const xMainLeft = x;
      const xMainRight = x + totalW;
      const xL = x + ALT_INDENT;
      const xR = x + ALT_INDENT + maxItemW;
      const yMain = y + entryY;

      for (let i = 0; i < boxes.length; i++) {
        const box = boxes[i]!;
        const bx = xL + (maxItemW - box.w) / 2;
        const by = y + yPositions[i]!;
        const altInY = by + box.entryY;
        const altOutY = by + box.exitY;
        shapes.push(...box.draw(bx, by));
        if (bx > xL) shapes.push({ type: 'line', x1: xL, y1: altInY, x2: bx, y2: altInY, style: STROKE });
        if (bx + box.w < xR) shapes.push({ type: 'line', x1: bx + box.w, y1: altOutY, x2: xR, y2: altOutY, style: STROKE });

        if (i === 0) {
          shapes.push({ type: 'line', x1: xMainLeft, y1: yMain, x2: xL, y2: altInY, style: STROKE });
          shapes.push({ type: 'line', x1: xR, y1: altOutY, x2: xMainRight, y2: yMain, style: STROKE });
        } else {
          shapes.push({
            type: 'path',
            d:
              `M ${xMainLeft} ${yMain} ` +
              `C ${xMainLeft + ALT_INDENT / 2} ${yMain}, ${xMainLeft + ALT_INDENT / 2} ${altInY}, ${xL} ${altInY}`,
            style: STROKE,
          });
          shapes.push({
            type: 'path',
            d:
              `M ${xR} ${altOutY} ` +
              `C ${xR + ALT_INDENT / 2} ${altOutY}, ${xR + ALT_INDENT / 2} ${yMain}, ${xMainRight} ${yMain}`,
            style: STROKE,
          });
        }
      }
      return shapes;
    },
  };
}

function layoutRep(body: EbnfExpr): RailroadBox {
  const inner = layoutExpr(body);
  const totalW = ALT_INDENT * 2 + inner.w;
  const totalH = LOOP_TOP_PAD + inner.h;
  const entryY = LOOP_TOP_PAD + inner.entryY;

  return {
    w: totalW,
    h: totalH,
    entryY,
    exitY: entryY,
    draw(x, y) {
      const shapes: Shape[] = [];
      const xMainLeft = x;
      const xMainRight = x + totalW;
      const xL = x + ALT_INDENT;
      const xR = x + ALT_INDENT + inner.w;
      const yMain = y + entryY;
      const yLoop = y + LOOP_TOP_PAD / 2;

      shapes.push(...inner.draw(xL, y + LOOP_TOP_PAD));
      shapes.push({ type: 'line', x1: xMainLeft, y1: yMain, x2: xL, y2: yMain, style: STROKE });
      shapes.push({ type: 'line', x1: xR, y1: yMain, x2: xMainRight, y2: yMain, style: STROKE });

      shapes.push({
        type: 'path',
        d:
          `M ${xR} ${yMain} ` +
          `C ${xR + ALT_INDENT / 2} ${yMain}, ${xR + ALT_INDENT / 2} ${yLoop}, ${xR - ALT_INDENT / 4} ${yLoop} ` +
          `L ${xL + ALT_INDENT / 4} ${yLoop} ` +
          `C ${xL - ALT_INDENT / 2} ${yLoop}, ${xL - ALT_INDENT / 2} ${yMain}, ${xL} ${yMain}`,
        style: STROKE,
      });

      // Arrow head pointing left on the loop
      const arrowCx = (xL + xR) / 2;
      shapes.push({
        type: 'polygon',
        points: [
          [arrowCx - ARROW_SIZE, yLoop],
          [arrowCx + ARROW_SIZE / 2, yLoop - ARROW_SIZE / 2],
          [arrowCx + ARROW_SIZE / 2, yLoop + ARROW_SIZE / 2],
        ],
        style: { fill: COLOR_LINE, stroke: COLOR_LINE, strokeWidth: 1 },
      });

      return shapes;
    },
  };
}

function layoutOpt(body: EbnfExpr): RailroadBox {
  const inner = layoutExpr(body);
  const totalW = ALT_INDENT * 2 + inner.w;
  const totalH = OPT_TOP_PAD + inner.h;
  const entryY = OPT_TOP_PAD + inner.entryY;

  return {
    w: totalW,
    h: totalH,
    entryY,
    exitY: entryY,
    draw(x, y) {
      const shapes: Shape[] = [];
      const xMainLeft = x;
      const xMainRight = x + totalW;
      const xL = x + ALT_INDENT;
      const xR = x + ALT_INDENT + inner.w;
      const yMain = y + entryY;
      const yBypass = y + OPT_TOP_PAD / 2;

      shapes.push(...inner.draw(xL, y + OPT_TOP_PAD));
      shapes.push({ type: 'line', x1: xMainLeft, y1: yMain, x2: xL, y2: yMain, style: STROKE });
      shapes.push({ type: 'line', x1: xR, y1: yMain, x2: xMainRight, y2: yMain, style: STROKE });

      shapes.push({
        type: 'path',
        d:
          `M ${xMainLeft} ${yMain} ` +
          `C ${xMainLeft + ALT_INDENT / 2} ${yMain}, ${xMainLeft + ALT_INDENT / 2} ${yBypass}, ${xL} ${yBypass} ` +
          `L ${xR} ${yBypass} ` +
          `C ${xR + ALT_INDENT / 2} ${yBypass}, ${xR + ALT_INDENT / 2} ${yMain}, ${xMainRight} ${yMain}`,
        style: STROKE,
      });

      return shapes;
    },
  };
}
