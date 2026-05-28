import type {
  StateAst,
  StateNode,
  StateTransition,
} from '../../ast/state.js';
import type { ClassRelationship } from '../../ast/class.js';
import type { Scene, Shape, Style } from '../../scene/types.js';
import { measureText } from '../sequence/measure.js';
import { assignLayers, buildLayoutEdges, removeCycles } from '../class/sugiyama.js';
import { drawMarker, markerLength, shortenPolyline, type Vec } from '../class/markers.js';

const PAGE_PAD = 16;
const TITLE_FONT = 16;
const TITLE_GAP = 10;
const COMPOSITE_HEADER_H = 24;
const COMPOSITE_PAD = 14;
const CHILD_GAP = 16;
const LAYER_GAP = 28;
const MAX_ROW_W = 720;

const NORMAL_PAD_X = 14;
const NORMAL_PAD_Y = 8;
const NORMAL_MIN_W = 70;
const NORMAL_MIN_H = 30;
const INITIAL_SIZE = 16;
const FINAL_SIZE = 18;
const CHOICE_SIZE = 28;
const FORK_W = 60;
const FORK_H = 8;
const HISTORY_SIZE = 22;

const FONT_FAMILY = 'sans-serif';
const FONT_LABEL = 12;
const EDGE_LABEL_FONT = 11;
const COMPOSITE_NAME_FONT = 13;

const COLOR_LINE = '#222';
const COLOR_EDGE = '#444';
const COLOR_NORMAL_FILL = '#fefece';
const COLOR_PSEUDO = '#222';
const COLOR_CHOICE_FILL = '#fefece';
const COLOR_COMPOSITE_FILL = 'rgba(254, 252, 206, 0.4)';
const COLOR_COMPOSITE_STROKE = '#888';

interface AbsPos {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Box {
  w: number;
  h: number;
  draw(x: number, y: number, posMap: Map<string, AbsPos>): Shape[];
}

export function layoutStateNested(ast: StateAst): Scene {
  const titleHeight = ast.title ? TITLE_FONT + TITLE_GAP : 0;
  const topBoxes = ast.states.map((n) => layoutStateNode(n, ast.transitions));
  const rows = packIntoRows(topBoxes, MAX_ROW_W);

  let cursorY = PAGE_PAD + titleHeight;
  let maxRowW = 0;
  const rowMeta: Array<{ rowW: number; rowH: number; y: number }> = [];
  for (const row of rows) {
    let rowW = 0;
    let rowH = 0;
    for (let i = 0; i < row.length; i++) {
      rowW += row[i]!.w;
      if (i < row.length - 1) rowW += CHILD_GAP;
      rowH = Math.max(rowH, row[i]!.h);
    }
    maxRowW = Math.max(maxRowW, rowW);
    rowMeta.push({ rowW, rowH, y: cursorY });
    cursorY += rowH + CHILD_GAP;
  }
  const totalW = maxRowW + PAGE_PAD * 2;
  const totalH = cursorY - CHILD_GAP + PAGE_PAD;

  const positions = new Map<string, AbsPos>();
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

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r]!;
    const meta = rowMeta[r]!;
    let cursorX = PAGE_PAD + (maxRowW - meta.rowW) / 2;
    for (const box of row) {
      shapes.push(...box.draw(cursorX, meta.y, positions));
      cursorX += box.w + CHILD_GAP;
    }
  }

  for (const t of ast.transitions) {
    shapes.push(...drawTransitionEdge(t, positions));
  }

  return {
    width: totalW,
    height: totalH,
    background: '#fff',
    children: shapes,
  };
}

function layoutStateNode(node: StateNode, allTrans: StateTransition[]): Box {
  if (node.children.length === 0) {
    return layoutLeaf(node);
  }

  const childBoxes = node.children.map((c) => layoutStateNode(c, allTrans));
  const childIds = new Set(node.children.map((c) => c.id));
  const intra = allTrans.filter((t) => childIds.has(t.source) && childIds.has(t.target));

  const arrangement = intra.length > 0
    ? sugiyamaArrange(node.children, childBoxes, intra)
    : rowWrapArrange(childBoxes);

  const headerText = node.name || node.id;
  const headerW = measureText(headerText, COMPOSITE_NAME_FONT).width + 28;
  const contentW = Math.max(arrangement.innerW, headerW);
  const w = contentW + COMPOSITE_PAD * 2;
  const h = COMPOSITE_HEADER_H + arrangement.innerH + COMPOSITE_PAD;

  return {
    w,
    h,
    draw(x, y, posMap) {
      const shapes: Shape[] = [];
      shapes.push({
        type: 'rect',
        x, y, w, h,
        rx: 10, ry: 10,
        style: { fill: COLOR_COMPOSITE_FILL, stroke: COLOR_COMPOSITE_STROKE, strokeWidth: 1 },
      });
      shapes.push({
        type: 'line',
        x1: x, y1: y + COMPOSITE_HEADER_H,
        x2: x + w, y2: y + COMPOSITE_HEADER_H,
        style: { stroke: COLOR_COMPOSITE_STROKE, strokeWidth: 1 },
      });
      shapes.push({
        type: 'text',
        x: x + w / 2,
        y: y + COMPOSITE_HEADER_H / 2 + 1,
        text: headerText,
        anchor: 'middle',
        baseline: 'middle',
        font: { family: FONT_FAMILY, size: COMPOSITE_NAME_FONT, weight: 'bold', color: '#000' },
      });
      arrangement.place(x + COMPOSITE_PAD, y + COMPOSITE_HEADER_H, contentW, posMap, shapes);
      return shapes;
    },
  };
}

interface Arrangement {
  innerW: number;
  innerH: number;
  place(
    originX: number,
    originY: number,
    contentW: number,
    posMap: Map<string, AbsPos>,
    out: Shape[],
  ): void;
}

function rowWrapArrange(childBoxes: Box[]): Arrangement {
  const rows = packIntoRows(childBoxes, MAX_ROW_W);
  const rowMeta: Array<{ rowW: number; rowH: number; yOffset: number }> = [];
  let innerW = 0;
  let cursorY = 0;
  for (const row of rows) {
    let rowW = 0;
    let rowH = 0;
    for (let i = 0; i < row.length; i++) {
      rowW += row[i]!.w;
      if (i < row.length - 1) rowW += CHILD_GAP;
      rowH = Math.max(rowH, row[i]!.h);
    }
    innerW = Math.max(innerW, rowW);
    rowMeta.push({ rowW, rowH, yOffset: cursorY });
    cursorY += rowH + CHILD_GAP;
  }
  const innerH = cursorY - CHILD_GAP;
  return {
    innerW,
    innerH,
    place(originX, originY, contentW, posMap, out) {
      for (let r = 0; r < rows.length; r++) {
        const row = rows[r]!;
        const meta = rowMeta[r]!;
        let cx = originX + (contentW - meta.rowW) / 2;
        for (const child of row) {
          out.push(...child.draw(cx, originY + meta.yOffset, posMap));
          cx += child.w + CHILD_GAP;
        }
      }
    },
  };
}

function sugiyamaArrange(
  childNodes: StateNode[],
  childBoxes: Box[],
  intra: StateTransition[],
): Arrangement {
  const ids = childNodes.map((n) => n.id);
  const idToBox = new Map(childNodes.map((n, i) => [n.id, childBoxes[i]!]));

  const classRels: ClassRelationship[] = intra.map((t) => ({
    source: t.source,
    target: t.target,
    sourceMult: '',
    targetMult: '',
    arrowToken: t.arrowToken,
    kind: 'association',
    style: t.style,
    sourceMarker: t.sourceMarker,
    targetMarker: t.targetMarker,
    label: t.label,
    labelDirection: 'none',
  }));

  const edges = buildLayoutEdges(classRels);
  removeCycles(ids, edges);
  const layers = assignLayers(ids, edges);

  const groups: Box[][] = [];
  for (const n of childNodes) {
    const l = layers.get(n.id) ?? 0;
    while (groups.length <= l) groups.push([]);
    groups[l]!.push(idToBox.get(n.id)!);
  }

  const rowMeta: Array<{ rowW: number; rowH: number; yOffset: number }> = [];
  let innerW = 0;
  let cursorY = 0;
  for (const row of groups) {
    let rowW = 0;
    let rowH = 0;
    for (let i = 0; i < row.length; i++) {
      rowW += row[i]!.w;
      if (i < row.length - 1) rowW += CHILD_GAP;
      rowH = Math.max(rowH, row[i]!.h);
    }
    innerW = Math.max(innerW, rowW);
    rowMeta.push({ rowW, rowH, yOffset: cursorY });
    cursorY += rowH + LAYER_GAP;
  }
  const innerH = cursorY - LAYER_GAP;

  return {
    innerW,
    innerH,
    place(originX, originY, contentW, posMap, out) {
      for (let l = 0; l < groups.length; l++) {
        const row = groups[l]!;
        const meta = rowMeta[l]!;
        let cx = originX + (contentW - meta.rowW) / 2;
        for (const box of row) {
          out.push(...box.draw(cx, originY + meta.yOffset, posMap));
          cx += box.w + CHILD_GAP;
        }
      }
    },
  };
}

function layoutLeaf(node: StateNode): Box {
  const sz = measureLeaf(node);
  return {
    w: sz.w,
    h: sz.h,
    draw(x, y, posMap) {
      posMap.set(node.id, { x, y, w: sz.w, h: sz.h });
      return drawLeaf(node, x, y, sz.w, sz.h);
    },
  };
}

function measureLeaf(node: StateNode): { w: number; h: number } {
  switch (node.stateKind) {
    case 'initial': return { w: INITIAL_SIZE, h: INITIAL_SIZE };
    case 'final':   return { w: FINAL_SIZE, h: FINAL_SIZE };
    case 'choice':  return { w: CHOICE_SIZE, h: CHOICE_SIZE };
    case 'fork':
    case 'join':    return { w: FORK_W, h: FORK_H };
    case 'history': return { w: HISTORY_SIZE, h: HISTORY_SIZE };
    case 'normal':
    default: {
      const text = node.name || node.id;
      const nameM = measureText(text, FONT_LABEL);
      let w = nameM.width;
      let h = nameM.height;
      if (node.description) {
        const descM = measureText(node.description, FONT_LABEL);
        w = Math.max(w, descM.width);
        h += descM.height + 4;
      }
      return {
        w: Math.max(NORMAL_MIN_W, w + NORMAL_PAD_X * 2),
        h: Math.max(NORMAL_MIN_H, h + NORMAL_PAD_Y * 2),
      };
    }
  }
}

function leafRectStyle(node: StateNode, baseFill: string, baseStroke: string): Style {
  const style: Style = { fill: node.fill ?? baseFill, stroke: node.lineColor ?? baseStroke, strokeWidth: 1 };
  if (node.lineStyle === 'bold') style.strokeWidth = 2;
  else if (node.lineStyle === 'dashed') style.strokeDasharray = '4,2';
  else if (node.lineStyle === 'dotted') style.strokeDasharray = '2,3';
  return style;
}

function drawLeaf(node: StateNode, x: number, y: number, w: number, h: number): Shape[] {
  const cx = x + w / 2;
  const cy = y + h / 2;
  switch (node.stateKind) {
    case 'initial':
      return [{
        type: 'circle',
        cx, cy, r: w / 2,
        style: { fill: COLOR_PSEUDO, stroke: COLOR_PSEUDO, strokeWidth: 1 },
      }];
    case 'final':
      return [
        { type: 'circle', cx, cy, r: w / 2, style: { fill: '#fff', stroke: COLOR_PSEUDO, strokeWidth: 1.2 } },
        { type: 'circle', cx, cy, r: w / 2 - 4, style: { fill: COLOR_PSEUDO, stroke: COLOR_PSEUDO, strokeWidth: 1 } },
      ];
    case 'choice': {
      const r = w / 2;
      return [{
        type: 'polygon',
        points: [[cx, cy - r], [cx + r, cy], [cx, cy + r], [cx - r, cy]],
        style: { fill: COLOR_CHOICE_FILL, stroke: COLOR_LINE, strokeWidth: 1 },
      }];
    }
    case 'fork':
    case 'join':
      return [{
        type: 'rect',
        x, y, w, h,
        style: { fill: COLOR_PSEUDO, stroke: COLOR_PSEUDO, strokeWidth: 1 },
      }];
    case 'history':
      return [
        { type: 'circle', cx, cy, r: w / 2, style: { fill: '#fff', stroke: COLOR_LINE, strokeWidth: 1 } },
        {
          type: 'text',
          x: cx, y: cy,
          text: 'H',
          anchor: 'middle', baseline: 'middle',
          font: { family: FONT_FAMILY, size: FONT_LABEL, weight: 'bold', color: '#000' },
        },
      ];
    case 'normal':
    default: {
      const textColor = node.textColor ?? '#000';
      const shapes: Shape[] = [
        {
          type: 'rect',
          x, y, w, h,
          rx: 8, ry: 8,
          style: leafRectStyle(node, COLOR_NORMAL_FILL, COLOR_LINE),
        },
      ];
      const labelText = node.name || node.id;
      if (node.description) {
        const lh = measureText(labelText, FONT_LABEL).height;
        const nameY = y + NORMAL_PAD_Y + lh / 2;
        const descY = nameY + lh / 2 + 4 + measureText(node.description, FONT_LABEL).height / 2;
        shapes.push({
          type: 'text',
          x: cx, y: nameY,
          text: labelText,
          anchor: 'middle', baseline: 'middle',
          font: { family: FONT_FAMILY, size: FONT_LABEL, color: textColor },
        });
        shapes.push({
          type: 'text',
          x: cx, y: descY,
          text: node.description,
          anchor: 'middle', baseline: 'middle',
          font: { family: FONT_FAMILY, size: FONT_LABEL, color: textColor },
        });
      } else {
        shapes.push({
          type: 'text',
          x: cx, y: cy,
          text: labelText,
          anchor: 'middle', baseline: 'middle',
          font: { family: FONT_FAMILY, size: FONT_LABEL, color: textColor },
        });
      }
      return shapes;
    }
  }
}

function packIntoRows<T extends { w: number; h: number }>(items: T[], maxW: number): T[][] {
  const rows: T[][] = [];
  let cur: T[] = [];
  let curW = 0;
  for (const it of items) {
    const tryW = cur.length === 0 ? it.w : curW + CHILD_GAP + it.w;
    if (cur.length > 0 && tryW > maxW) {
      rows.push(cur);
      cur = [it];
      curW = it.w;
    } else {
      cur.push(it);
      curW = tryW;
    }
  }
  if (cur.length > 0) rows.push(cur);
  return rows;
}

function drawTransitionEdge(t: StateTransition, positions: Map<string, AbsPos>): Shape[] {
  const src = positions.get(t.source);
  const tgt = positions.get(t.target);
  if (!src || !tgt) return [];

  const sCx = src.x + src.w / 2;
  const sCy = src.y + src.h / 2;
  const tCx = tgt.x + tgt.w / 2;
  const tCy = tgt.y + tgt.h / 2;

  const p1 = rectClip(sCx, sCy, src.w, src.h, tCx, tCy);
  const p2 = rectClip(tCx, tCy, tgt.w, tgt.h, sCx, sCy);

  const start: Vec = { x: p1.x, y: p1.y };
  const end: Vec = { x: p2.x, y: p2.y };
  const original = [start, end];
  const shortened = shortenPolyline(original, markerLength(t.sourceMarker), markerLength(t.targetMarker));

  const lineStyle: Style =
    t.style === 'dashed'
      ? { stroke: COLOR_EDGE, strokeWidth: 1, strokeDasharray: '5,3', fill: 'none' }
      : { stroke: COLOR_EDGE, strokeWidth: 1, fill: 'none' };

  const shapes: Shape[] = [
    {
      type: 'line',
      x1: shortened[0]!.x, y1: shortened[0]!.y,
      x2: shortened[1]!.x, y2: shortened[1]!.y,
      style: lineStyle,
    },
  ];

  const srcMarker = drawMarker(t.sourceMarker, start, end);
  if (srcMarker) shapes.push(srcMarker);
  const tgtMarker = drawMarker(t.targetMarker, end, start);
  if (tgtMarker) shapes.push(tgtMarker);

  if (t.label) {
    shapes.push({
      type: 'text',
      x: (start.x + end.x) / 2,
      y: (start.y + end.y) / 2 - 4,
      text: t.label,
      anchor: 'middle',
      baseline: 'alphabetic',
      font: { family: FONT_FAMILY, size: EDGE_LABEL_FONT, color: '#000' },
    });
  }

  return shapes;
}

function rectClip(
  cx: number, cy: number, w: number, h: number,
  tx: number, ty: number,
): { x: number; y: number } {
  const dx = tx - cx;
  const dy = ty - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const sx = w / 2;
  const sy = h / 2;
  const tRatioX = Math.abs(dx) > 0 ? sx / Math.abs(dx) : Infinity;
  const tRatioY = Math.abs(dy) > 0 ? sy / Math.abs(dy) : Infinity;
  const t = Math.min(tRatioX, tRatioY, 1);
  return { x: cx + dx * t, y: cy + dy * t };
}
