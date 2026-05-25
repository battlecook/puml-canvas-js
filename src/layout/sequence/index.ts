import type {
  DividerStmt,
  GroupKind,
  NoteStmt,
  SequenceAst,
  SequenceStatement,
} from '../../ast/sequence.js';
import type { Scene, Shape } from '../../scene/types.js';
import { measureText } from './measure.js';
import { drawHeader, HEADER_HEIGHT } from './headers.js';

const TOP_PAD = 12;
const BOTTOM_PAD = 12;
const SIDE_PAD = 12;
const HEADER_PAD_X = 16;
const LANE_MIN_WIDTH = 80;
const LANE_GAP = 50;
const MSG_GAP = 36;
const MSG_TEXT_PAD = 6;
const MSG_TEXT_HPAD = 8;
const SELF_MSG_W = 40;
const SELF_MSG_H = 24;
const NOTE_PAD_X = 8;
const NOTE_PAD_Y = 6;
const NOTE_FOLD = 6;
const NOTE_GAP = 30;
const NOTE_SIDE_OFFSET = 8;
const ACT_WIDTH = 10;
const GROUP_PAD = 10;
const GROUP_HEADER_HEIGHT = 18;
const GROUP_SIDE_PAD = 8;
const ARROW_HEAD = 8;
const TITLE_FONT_SIZE = 16;
const TITLE_GAP = 12;
const DIVIDER_HEIGHT = 22;
const DIVIDER_GAP = 8;

const FONT_FAMILY = 'sans-serif';
const FONT_SIZE = 12;
const FONT_GROUP = 11;

const COLOR_LINE = '#222';
const COLOR_LIFELINE = '#666';
const COLOR_NOTE_FILL = '#fbfb77';
const COLOR_NOTE_STROKE = '#888';
const COLOR_GROUP_STROKE = '#888';
const COLOR_GROUP_TAB_FILL = '#eeeeee';
const COLOR_ACTIVATION_FILL = '#cccccc';
const COLOR_DIVIDER_FILL = '#dddddd';

interface PendingGroup {
  kind: GroupKind;
  label: string;
  yStart: number;
  minLane: number;
  maxLane: number;
  dividers: Array<{ y: number; label: string }>;
}

interface FinalizedActivation {
  laneIdx: number;
  level: number;
  yStart: number;
  yEnd: number;
}

export function layoutSequence(ast: SequenceAst): Scene {
  const parts = ast.participants;

  if (parts.length === 0) {
    return {
      width: 220,
      height: 60,
      background: '#fff',
      children: [
        {
          type: 'text',
          x: 110,
          y: 30,
          text: '(empty sequence diagram)',
          anchor: 'middle',
          baseline: 'middle',
          font: { family: FONT_FAMILY, size: FONT_SIZE, color: '#999' },
        },
      ],
    };
  }

  const headerW = parts.map((p) =>
    Math.max(LANE_MIN_WIDTH, measureText(p.label, FONT_SIZE).width + HEADER_PAD_X * 2),
  );

  const laneIdx = new Map<string, number>(parts.map((p, i) => [p.id, i]));
  const labels = precomputeMessageLabels(ast.statements);
  const gaps = computeLaneGaps(ast.statements, labels, laneIdx, headerW, parts.length);

  const laneCenters: number[] = [];
  let cursorX = SIDE_PAD;
  for (let i = 0; i < parts.length; i++) {
    cursorX += headerW[i]! / 2;
    laneCenters.push(cursorX);
    cursorX += headerW[i]! / 2;
    if (i < parts.length - 1) cursorX += gaps[i]!;
  }
  cursorX += SIDE_PAD;
  const diagramWidth = cursorX;

  const titleHeight = ast.title ? Math.ceil(TITLE_FONT_SIZE * 1.2) + TITLE_GAP : 0;
  const headerTopY = TOP_PAD + titleHeight;

  const body: Shape[] = [];
  const actStack: number[][] = parts.map(() => []);
  const finalizedActs: FinalizedActivation[] = [];
  const groupStack: PendingGroup[] = [];

  let y = headerTopY + HEADER_HEIGHT + MSG_GAP / 2;

  const touch = (...idxs: number[]): void => {
    for (const g of groupStack) {
      for (const i of idxs) {
        if (i < g.minLane) g.minLane = i;
        if (i > g.maxLane) g.maxLane = i;
      }
    }
  };

  for (let i = 0; i < ast.statements.length; i++) {
    const stmt = ast.statements[i]!;
    switch (stmt.type) {
      case 'autonumber':
        break;

      case 'activate': {
        const idx = laneIdx.get(stmt.target);
        if (idx === undefined) break;
        touch(idx);
        actStack[idx]!.push(y - MSG_GAP / 2);
        break;
      }

      case 'deactivate': {
        const idx = laneIdx.get(stmt.target);
        if (idx === undefined) break;
        touch(idx);
        const yStart = actStack[idx]!.pop();
        if (yStart !== undefined) {
          finalizedActs.push({
            laneIdx: idx,
            level: actStack[idx]!.length,
            yStart,
            yEnd: y - MSG_GAP / 2,
          });
        }
        break;
      }

      case 'groupStart':
        groupStack.push({
          kind: stmt.kind,
          label: stmt.label,
          yStart: y - MSG_GAP / 2,
          minLane: parts.length,
          maxLane: -1,
          dividers: [],
        });
        y += GROUP_HEADER_HEIGHT + GROUP_PAD;
        break;

      case 'groupElse': {
        const top = groupStack[groupStack.length - 1];
        if (top) {
          top.dividers.push({ y: y - MSG_GAP / 2, label: stmt.label });
          y += GROUP_PAD;
        }
        break;
      }

      case 'groupEnd': {
        const g = groupStack.pop();
        if (g) {
          const yEnd = y - MSG_GAP / 2 + GROUP_PAD;
          if (g.minLane > g.maxLane) {
            g.minLane = 0;
            g.maxLane = parts.length - 1;
          }
          if (groupStack.length > 0) touch(g.minLane, g.maxLane);
          body.push(...drawGroup(g, yEnd, laneCenters, headerW));
          y = yEnd + MSG_GAP / 2;
        }
        break;
      }

      case 'divider':
        body.push(...drawDivider(stmt, y - MSG_GAP / 2 + DIVIDER_GAP, diagramWidth));
        y += DIVIDER_HEIGHT + DIVIDER_GAP;
        break;

      case 'note': {
        const idx1 = laneIdx.get(stmt.targets[0]);
        if (idx1 !== undefined) {
          if (stmt.targets.length === 2) {
            const idx2 = laneIdx.get(stmt.targets[1]) ?? idx1;
            touch(idx1, idx2);
          } else {
            touch(idx1);
          }
        }
        const drawn = drawNote(stmt, y, laneCenters, headerW, laneIdx);
        body.push(...drawn.shapes);
        y += drawn.height + NOTE_GAP;
        break;
      }

      case 'message': {
        const fromIdx = laneIdx.get(stmt.from);
        const toIdx = laneIdx.get(stmt.to);
        if (fromIdx === undefined || toIdx === undefined) break;
        touch(fromIdx, toIdx);
        const label = labels[i] ?? '';

        if (fromIdx === toIdx) {
          body.push(...drawSelfMessage(laneCenters[fromIdx]!, y, label, stmt.style));
          y += SELF_MSG_H + MSG_GAP;
        } else {
          body.push(
            ...drawMessage(
              laneCenters[fromIdx]!,
              laneCenters[toIdx]!,
              y,
              label,
              stmt.style,
              fromIdx < toIdx,
            ),
          );
          y += MSG_GAP;
        }
        break;
      }
    }
  }

  const bottomY = y;

  for (let i = 0; i < parts.length; i++) {
    while (actStack[i]!.length > 0) {
      const yStart = actStack[i]!.pop()!;
      finalizedActs.push({
        laneIdx: i,
        level: actStack[i]!.length,
        yStart,
        yEnd: bottomY,
      });
    }
  }

  while (groupStack.length > 0) {
    const g = groupStack.pop()!;
    if (g.minLane > g.maxLane) {
      g.minLane = 0;
      g.maxLane = parts.length - 1;
    }
    body.push(...drawGroup(g, bottomY + GROUP_PAD, laneCenters, headerW));
  }

  const lifelineBottom = bottomY + 8;

  const lifelines: Shape[] = laneCenters.map((cx) => ({
    type: 'line',
    x1: cx,
    y1: headerTopY + HEADER_HEIGHT,
    x2: cx,
    y2: lifelineBottom,
    style: { stroke: COLOR_LIFELINE, strokeWidth: 1, strokeDasharray: '4,4' },
  }));

  const acts: Shape[] = finalizedActs.map((r) => ({
    type: 'rect',
    x: laneCenters[r.laneIdx]! - ACT_WIDTH / 2 + r.level * (ACT_WIDTH / 2),
    y: r.yStart,
    w: ACT_WIDTH,
    h: r.yEnd - r.yStart,
    style: { fill: COLOR_ACTIVATION_FILL, stroke: COLOR_LINE, strokeWidth: 1 },
  }));

  const headers: Shape[] = [];
  for (let i = 0; i < parts.length; i++) {
    headers.push(...drawHeader(parts[i]!, laneCenters[i]!, headerW[i]!, headerTopY));
    headers.push(...drawHeader(parts[i]!, laneCenters[i]!, headerW[i]!, lifelineBottom));
  }

  const titleShapes: Shape[] = ast.title
    ? [
        {
          type: 'text',
          x: diagramWidth / 2,
          y: TOP_PAD + TITLE_FONT_SIZE,
          text: ast.title,
          anchor: 'middle',
          baseline: 'alphabetic',
          font: { family: FONT_FAMILY, size: TITLE_FONT_SIZE, weight: 'bold', color: '#000' },
        },
      ]
    : [];

  const totalHeight = lifelineBottom + HEADER_HEIGHT + BOTTOM_PAD;

  return {
    width: diagramWidth,
    height: totalHeight,
    background: '#fff',
    children: [...titleShapes, ...lifelines, ...acts, ...body, ...headers],
  };
}

function precomputeMessageLabels(stmts: SequenceStatement[]): string[] {
  const out = new Array<string>(stmts.length);
  let autoEnabled = false;
  let autoNext = 0;
  let autoStep = 1;
  for (let i = 0; i < stmts.length; i++) {
    const s = stmts[i]!;
    if (s.type === 'autonumber') {
      autoEnabled = true;
      autoNext = s.start;
      autoStep = s.step;
      out[i] = '';
    } else if (s.type === 'message') {
      const prefix = autoEnabled ? `${autoNext} ` : '';
      out[i] = prefix + s.text;
      if (autoEnabled) autoNext += autoStep;
    } else {
      out[i] = '';
    }
  }
  return out;
}

function computeLaneGaps(
  stmts: SequenceStatement[],
  labels: string[],
  laneIdx: Map<string, number>,
  headerW: number[],
  laneCount: number,
): number[] {
  if (laneCount < 2) return [];
  const gaps = new Array<number>(laneCount - 1).fill(LANE_GAP);

  for (let i = 0; i < stmts.length; i++) {
    const s = stmts[i]!;
    if (s.type !== 'message') continue;
    const fromIdx = laneIdx.get(s.from);
    const toIdx = laneIdx.get(s.to);
    if (fromIdx === undefined || toIdx === undefined || fromIdx === toIdx) continue;
    const text = labels[i]!;
    if (!text) continue;
    const need = measureText(text, FONT_SIZE).width + MSG_TEXT_HPAD * 2;
    const lo = Math.min(fromIdx, toIdx);
    const hi = Math.max(fromIdx, toIdx);
    let cur = (headerW[lo]! + headerW[hi]!) / 2;
    for (let k = lo + 1; k < hi; k++) cur += headerW[k]!;
    for (let k = lo; k < hi; k++) cur += gaps[k]!;
    if (cur < need) {
      const perGap = (need - cur) / (hi - lo);
      for (let k = lo; k < hi; k++) gaps[k]! += perGap;
    }
  }

  return gaps;
}

function drawMessage(
  x1: number,
  x2: number,
  y: number,
  text: string,
  style: 'solid' | 'dashed',
  leftToRight: boolean,
): Shape[] {
  const lineStyle =
    style === 'dashed'
      ? { stroke: COLOR_LINE, strokeWidth: 1, strokeDasharray: '5,3' }
      : { stroke: COLOR_LINE, strokeWidth: 1 };
  const shapes: Shape[] = [
    { type: 'line', x1, y1: y, x2, y2: y, style: lineStyle },
    arrowHead(x2, y, leftToRight),
  ];
  if (text) {
    shapes.push({
      type: 'text',
      x: (x1 + x2) / 2,
      y: y - MSG_TEXT_PAD,
      text,
      anchor: 'middle',
      baseline: 'alphabetic',
      font: { family: FONT_FAMILY, size: FONT_SIZE, color: '#000' },
    });
  }
  return shapes;
}

function drawSelfMessage(
  cx: number,
  y: number,
  text: string,
  style: 'solid' | 'dashed',
): Shape[] {
  const x1 = cx;
  const x2 = cx + SELF_MSG_W;
  const lineStyle =
    style === 'dashed'
      ? { stroke: COLOR_LINE, strokeWidth: 1, fill: 'none', strokeDasharray: '5,3' }
      : { stroke: COLOR_LINE, strokeWidth: 1, fill: 'none' };
  const shapes: Shape[] = [
    {
      type: 'polyline',
      points: [
        [x1, y],
        [x2, y],
        [x2, y + SELF_MSG_H],
        [x1, y + SELF_MSG_H],
      ],
      style: lineStyle,
    },
    arrowHead(x1, y + SELF_MSG_H, true),
  ];
  if (text) {
    shapes.push({
      type: 'text',
      x: x2 + 6,
      y: y + SELF_MSG_H / 2,
      text,
      anchor: 'start',
      baseline: 'middle',
      font: { family: FONT_FAMILY, size: FONT_SIZE, color: '#000' },
    });
  }
  return shapes;
}

function arrowHead(tipX: number, tipY: number, leftToRight: boolean): Shape {
  const baseX = leftToRight ? tipX - ARROW_HEAD : tipX + ARROW_HEAD;
  return {
    type: 'polygon',
    points: [
      [tipX, tipY],
      [baseX, tipY - ARROW_HEAD / 2],
      [baseX, tipY + ARROW_HEAD / 2],
    ],
    style: { fill: COLOR_LINE, stroke: COLOR_LINE, strokeWidth: 1 },
  };
}

function drawNote(
  stmt: NoteStmt,
  y: number,
  laneCenters: number[],
  headerW: number[],
  laneIdx: Map<string, number>,
): { shapes: Shape[]; height: number } {
  const m = measureText(stmt.text, FONT_SIZE);
  const textW = m.width + NOTE_PAD_X * 2;
  const noteH = m.height + NOTE_PAD_Y * 2;

  let x: number;
  let noteW = textW;
  const idx1 = laneIdx.get(stmt.targets[0]) ?? 0;
  if (stmt.position === 'over') {
    if (stmt.targets.length === 2) {
      const idx2 = laneIdx.get(stmt.targets[1]) ?? idx1;
      const left = Math.min(idx1, idx2);
      const right = Math.max(idx1, idx2);
      const spanLeft = laneCenters[left]! - headerW[left]! / 2;
      const spanRight = laneCenters[right]! + headerW[right]! / 2;
      const spanW = spanRight - spanLeft;
      noteW = Math.max(textW, spanW);
      x = (spanLeft + spanRight) / 2 - noteW / 2;
    } else {
      x = laneCenters[idx1]! - noteW / 2;
    }
  } else if (stmt.position === 'left') {
    x = laneCenters[idx1]! - headerW[idx1]! / 2 - noteW - NOTE_SIDE_OFFSET;
  } else {
    x = laneCenters[idx1]! + headerW[idx1]! / 2 + NOTE_SIDE_OFFSET;
  }

  const shapes: Shape[] = [
    {
      type: 'polygon',
      points: [
        [x, y],
        [x + noteW - NOTE_FOLD, y],
        [x + noteW, y + NOTE_FOLD],
        [x + noteW, y + noteH],
        [x, y + noteH],
      ],
      style: { fill: COLOR_NOTE_FILL, stroke: COLOR_NOTE_STROKE, strokeWidth: 1 },
    },
    {
      type: 'polyline',
      points: [
        [x + noteW - NOTE_FOLD, y],
        [x + noteW - NOTE_FOLD, y + NOTE_FOLD],
        [x + noteW, y + NOTE_FOLD],
      ],
      style: { stroke: COLOR_NOTE_STROKE, strokeWidth: 1, fill: 'none' },
    },
  ];

  const lines = stmt.text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    shapes.push({
      type: 'text',
      x: x + NOTE_PAD_X,
      y: y + NOTE_PAD_Y + FONT_SIZE * 0.9 + i * FONT_SIZE * 1.25,
      text: lines[i]!,
      anchor: 'start',
      baseline: 'alphabetic',
      font: { family: FONT_FAMILY, size: FONT_SIZE, color: '#000' },
    });
  }

  return { shapes, height: noteH };
}

function drawGroup(
  g: PendingGroup,
  yEnd: number,
  laneCenters: number[],
  headerW: number[],
): Shape[] {
  const xLeft = laneCenters[g.minLane]! - headerW[g.minLane]! / 2 - GROUP_SIDE_PAD;
  const xRight = laneCenters[g.maxLane]! + headerW[g.maxLane]! / 2 + GROUP_SIDE_PAD;
  const w = xRight - xLeft;
  const tabLabel = g.kind + (g.label ? ` [${g.label}]` : '');
  const tabTextW = measureText(tabLabel, FONT_GROUP).width;
  const tabW = tabTextW + 14;
  const tabH = GROUP_HEADER_HEIGHT;

  const shapes: Shape[] = [
    {
      type: 'rect',
      x: xLeft,
      y: g.yStart,
      w,
      h: yEnd - g.yStart,
      style: { fill: 'none', stroke: COLOR_GROUP_STROKE, strokeWidth: 1 },
    },
    {
      type: 'polygon',
      points: [
        [xLeft, g.yStart],
        [xLeft + tabW, g.yStart],
        [xLeft + tabW + 4, g.yStart + tabH - 4],
        [xLeft + tabW + 4, g.yStart + tabH],
        [xLeft, g.yStart + tabH],
      ],
      style: { fill: COLOR_GROUP_TAB_FILL, stroke: COLOR_GROUP_STROKE, strokeWidth: 1 },
    },
    {
      type: 'text',
      x: xLeft + 7,
      y: g.yStart + tabH / 2,
      text: tabLabel,
      anchor: 'start',
      baseline: 'middle',
      font: { family: FONT_FAMILY, size: FONT_GROUP, color: '#000', weight: 'bold' },
    },
  ];

  for (const d of g.dividers) {
    shapes.push({
      type: 'line',
      x1: xLeft,
      y1: d.y,
      x2: xLeft + w,
      y2: d.y,
      style: { stroke: COLOR_GROUP_STROKE, strokeWidth: 1, strokeDasharray: '4,3' },
    });
    if (d.label) {
      shapes.push({
        type: 'text',
        x: xLeft + 7,
        y: d.y + 12,
        text: `[${d.label}]`,
        anchor: 'start',
        baseline: 'alphabetic',
        font: { family: FONT_FAMILY, size: FONT_GROUP, color: '#000' },
      });
    }
  }

  return shapes;
}

function drawDivider(stmt: DividerStmt, y: number, totalWidth: number): Shape[] {
  const labelW = measureText(stmt.label, FONT_SIZE).width + 24;
  const cx = totalWidth / 2;
  return [
    {
      type: 'line',
      x1: SIDE_PAD,
      y1: y + DIVIDER_HEIGHT / 2,
      x2: totalWidth - SIDE_PAD,
      y2: y + DIVIDER_HEIGHT / 2,
      style: { stroke: COLOR_GROUP_STROKE, strokeWidth: 1 },
    },
    {
      type: 'rect',
      x: cx - labelW / 2,
      y,
      w: labelW,
      h: DIVIDER_HEIGHT,
      style: { fill: COLOR_DIVIDER_FILL, stroke: COLOR_GROUP_STROKE, strokeWidth: 1 },
    },
    {
      type: 'text',
      x: cx,
      y: y + DIVIDER_HEIGHT / 2,
      text: stmt.label,
      anchor: 'middle',
      baseline: 'middle',
      font: { family: FONT_FAMILY, size: FONT_SIZE, color: '#000', weight: 'bold' },
    },
  ];
}
