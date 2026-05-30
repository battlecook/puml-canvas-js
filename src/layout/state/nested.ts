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
import {
  sdlOutlineShape,
  pseudoStateShape,
  PSEUDO_FORK_W,
  PSEUDO_FORK_H,
  PSEUDO_START_R,
  PSEUDO_END_R,
} from './shapes.js';

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
const DIVIDER_GAP = 8;
const DESC_ROW_GAP = 2;
const INITIAL_SIZE = PSEUDO_START_R * 2;
const FINAL_SIZE = PSEUDO_END_R * 2;
const CHOICE_SIZE = 28;
const FORK_W = PSEUDO_FORK_W;
const FORK_H = PSEUDO_FORK_H;
const HISTORY_SIZE = 20;

const FONT_FAMILY = 'sans-serif';
const FONT_LABEL = 12;
const EDGE_LABEL_FONT = 11;
const COMPOSITE_NAME_FONT = 13;

const COLOR_LINE = '#222';
const COLOR_EDGE = '#444';
const COLOR_NORMAL_FILL = '#fefece';
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
  // Default to PlantUML's top-to-bottom flow: sibling top-level composite
  // states stack vertically (one box per row). Only when the source opts
  // into `left to right direction` do we revert to the horizontal
  // row-packing behaviour. Children inside a composite always flow
  // horizontally regardless of this setting.
  const rows = ast.direction === 'LR'
    ? packIntoRows(topBoxes, MAX_ROW_W)
    : topBoxes.map((b) => [b]);

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

  const transitionGroups = groupParallelTransitions(ast.transitions);
  for (const t of ast.transitions) {
    const meta = transitionGroups.get(t)!;
    shapes.push(...drawTransitionEdge(t, positions, meta.index, meta.count));
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

  // Concurrent regions: `state X { ... -- ... }` (or `||`) splits the
  // composite into orthogonal regions. `--` stacks them vertically (rows
  // separated by a horizontal dashed line); `||` stacks them horizontally
  // (columns separated by a vertical dashed line). Each region is laid out
  // independently using the same single-region strategy (sugiyama if it
  // has intra-region transitions, otherwise the simple row-wrap pack).
  const regions = node.regions;
  const arrangement = regions && regions.length > 1
    ? regionsArrange(
        node.children,
        childBoxes,
        intra,
        regions,
        node.regionDirection ?? 'vertical',
      )
    : intra.length > 0
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
      // Composite states need a position entry so transitions whose
      // endpoint is a composite (rather than a leaf) can find a box to
      // clip against and a center for label placement.
      posMap.set(node.id, { x, y, w, h });
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

// Space reserved for the dashed line that separates concurrent regions
// inside a composite (perpendicular to the stacking axis).
const REGION_SEPARATOR_GAP = 14;

function regionsArrange(
  childNodes: StateNode[],
  childBoxes: Box[],
  intra: StateTransition[],
  regions: string[][],
  direction: 'vertical' | 'horizontal',
): Arrangement {
  // Build per-region arrangements. Each region gets a subset of children
  // (in source order) plus the subset of intra-composite transitions whose
  // BOTH endpoints sit inside the same region — cross-region transitions
  // are intentionally not laid out inside any region.
  const idToBox = new Map(childNodes.map((n, i) => [n.id, childBoxes[i]!]));
  const idToNode = new Map(childNodes.map((n) => [n.id, n]));

  // Any child not enumerated in `regions` (shouldn't happen in well-formed
  // input, but be defensive) is collected into a trailing region so it
  // still renders.
  const enumerated = new Set<string>();
  for (const r of regions) for (const id of r) enumerated.add(id);
  const leftovers: string[] = [];
  for (const n of childNodes) if (!enumerated.has(n.id)) leftovers.push(n.id);

  const effectiveRegions = leftovers.length > 0 ? [...regions, leftovers] : regions;

  const regionArrangements: Arrangement[] = [];
  for (const regionIds of effectiveRegions) {
    const regionSet = new Set(regionIds);
    const regionNodes: StateNode[] = [];
    const regionBoxes: Box[] = [];
    for (const id of regionIds) {
      const n = idToNode.get(id);
      const b = idToBox.get(id);
      if (n && b) {
        regionNodes.push(n);
        regionBoxes.push(b);
      }
    }
    const regionIntra = intra.filter(
      (t) => regionSet.has(t.source) && regionSet.has(t.target),
    );
    const arr = regionIntra.length > 0
      ? sugiyamaArrange(regionNodes, regionBoxes, regionIntra)
      : rowWrapArrange(regionBoxes);
    regionArrangements.push(arr);
  }

  if (direction === 'horizontal') {
    // Stack regions side-by-side. innerH is the tallest region; innerW
    // sums region widths plus separators between them.
    let innerW = 0;
    let innerH = 0;
    for (let i = 0; i < regionArrangements.length; i++) {
      const a = regionArrangements[i]!;
      innerH = Math.max(innerH, a.innerH);
      innerW += a.innerW;
      if (i < regionArrangements.length - 1) innerW += REGION_SEPARATOR_GAP;
    }

    return {
      innerW,
      innerH,
      place(originX, originY, contentW, posMap, out) {
        // Distribute any extra horizontal slack evenly across the regions
        // so the column-stack spans the composite's full content width.
        // (Without this, narrow regions would crowd against one edge.)
        const slack = Math.max(0, contentW - innerW);
        const extraPer = regionArrangements.length > 0
          ? slack / regionArrangements.length
          : 0;
        let cx = originX;
        for (let i = 0; i < regionArrangements.length; i++) {
          const a = regionArrangements[i]!;
          const w = a.innerW + extraPer;
          a.place(cx, originY, w, posMap, out);
          cx += w;
          // Dashed vertical separator line between this region and the
          // next, spanning the full content height.
          if (i < regionArrangements.length - 1) {
            const sepX = cx + REGION_SEPARATOR_GAP / 2;
            out.push({
              type: 'line',
              x1: sepX,
              y1: originY,
              x2: sepX,
              y2: originY + innerH,
              style: {
                stroke: COLOR_COMPOSITE_STROKE,
                strokeWidth: 1,
                strokeDasharray: '5,3',
              },
            });
            cx += REGION_SEPARATOR_GAP;
          }
        }
      },
    };
  }

  // Vertical stacking (default, from `--`). innerW is the widest region;
  // innerH sums region heights plus separators between them.
  let innerW = 0;
  let innerH = 0;
  const yOffsets: number[] = [];
  for (let i = 0; i < regionArrangements.length; i++) {
    const a = regionArrangements[i]!;
    innerW = Math.max(innerW, a.innerW);
    yOffsets.push(innerH);
    innerH += a.innerH;
    if (i < regionArrangements.length - 1) innerH += REGION_SEPARATOR_GAP;
  }

  return {
    innerW,
    innerH,
    place(originX, originY, contentW, posMap, out) {
      for (let i = 0; i < regionArrangements.length; i++) {
        const a = regionArrangements[i]!;
        const yOff = yOffsets[i]!;
        a.place(originX, originY + yOff, contentW, posMap, out);
        // Dashed horizontal separator line between this region and the
        // next.
        if (i < regionArrangements.length - 1) {
          const sepY = originY + yOff + a.innerH + REGION_SEPARATOR_GAP / 2;
          out.push({
            type: 'line',
            x1: originX,
            y1: sepY,
            x2: originX + contentW,
            y2: sepY,
            style: {
              stroke: COLOR_COMPOSITE_STROKE,
              strokeWidth: 1,
              strokeDasharray: '5,3',
            },
          });
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
      const descs = node.descriptions ?? [];
      if (descs.length > 0) {
        h += DIVIDER_GAP;
        for (let i = 0; i < descs.length; i++) {
          const descM = measureText(descs[i]!, FONT_LABEL);
          w = Math.max(w, descM.width);
          h += descM.height;
          if (i < descs.length - 1) h += DESC_ROW_GAP;
        }
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
  // Pseudo-state shapes (initial/final/fork/join) live in shapes.ts so the
  // flat and nested state layouts stay visually identical. Labels are not
  // emitted for these — fork/join bars and initial/final dots are unlabeled
  // by convention.
  const pseudo = pseudoStateShape(node, x, y, w, h);
  if (pseudo) return pseudo;
  switch (node.stateKind) {
    case 'choice': {
      const r = w / 2;
      return [{
        type: 'polygon',
        points: [[cx, cy - r], [cx + r, cy], [cx, cy + r], [cx - r, cy]],
        style: { fill: COLOR_CHOICE_FILL, stroke: COLOR_LINE, strokeWidth: 1 },
      }];
    }
    case 'history':
      return [
        { type: 'circle', cx, cy, r: w / 2, style: { fill: '#fff', stroke: COLOR_LINE, strokeWidth: 1 } },
        {
          type: 'text',
          x: cx, y: cy,
          text: node.isDeep ? 'H*' : 'H',
          anchor: 'middle', baseline: 'middle',
          font: { family: FONT_FAMILY, size: FONT_LABEL, weight: 'bold', color: '#000' },
        },
      ];
    case 'normal':
    default: {
      const textColor = node.textColor ?? '#000';
      const strokeColor = node.lineColor ?? COLOR_LINE;
      const baseStyle = leafRectStyle(node, COLOR_NORMAL_FILL, COLOR_LINE);
      const shapes: Shape[] = [
        sdlOutlineShape(node, x, y, w, h, baseStyle) ?? {
          type: 'rect',
          x, y, w, h,
          rx: 8, ry: 8,
          style: baseStyle,
        },
      ];
      const labelText = node.name || node.id;
      const descs = node.descriptions ?? [];
      if (descs.length > 0) {
        const lh = measureText(labelText, FONT_LABEL).height;
        const nameY = y + NORMAL_PAD_Y + lh / 2;
        const dividerY = nameY + lh / 2 + DIVIDER_GAP / 2;
        shapes.push({
          type: 'text',
          x: cx, y: nameY,
          text: labelText,
          anchor: 'middle', baseline: 'middle',
          font: { family: FONT_FAMILY, size: FONT_LABEL, color: textColor },
        });
        shapes.push({
          type: 'line',
          x1: x, y1: dividerY,
          x2: x + w, y2: dividerY,
          style: { stroke: strokeColor, strokeWidth: 1 },
        });
        let rowTop = dividerY + DIVIDER_GAP / 2;
        for (const desc of descs) {
          const dh = measureText(desc, FONT_LABEL).height;
          shapes.push({
            type: 'text',
            x: cx, y: rowTop + dh / 2,
            text: desc,
            anchor: 'middle', baseline: 'middle',
            font: { family: FONT_FAMILY, size: FONT_LABEL, color: textColor },
          });
          rowTop += dh + DESC_ROW_GAP;
        }
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

// Spacing between labels of transitions that connect the same pair of nodes.
// The perpendicular component spreads labels sideways from the arrow; the
// tangential component staggers them along the arrow. Both are needed so
// that wide labels don't overlap on near-vertical or near-horizontal edges.
const PARALLEL_EDGE_PERP_OFFSET = 18;
const PARALLEL_EDGE_TANGENT_OFFSET = 16;

function groupParallelTransitions(
  transitions: StateTransition[],
): Map<StateTransition, { index: number; count: number }> {
  // Group by unordered node pair so that A->B and B->A share an offset slot.
  const groups = new Map<string, StateTransition[]>();
  for (const t of transitions) {
    const a = t.source;
    const b = t.target;
    const key = a < b ? `${a} ${b}` : `${b} ${a}`;
    let bucket = groups.get(key);
    if (!bucket) {
      bucket = [];
      groups.set(key, bucket);
    }
    bucket.push(t);
  }
  const meta = new Map<StateTransition, { index: number; count: number }>();
  for (const bucket of groups.values()) {
    for (let i = 0; i < bucket.length; i++) {
      meta.set(bucket[i]!, { index: i, count: bucket.length });
    }
  }
  return meta;
}

function drawTransitionEdge(
  t: StateTransition,
  positions: Map<string, AbsPos>,
  groupIndex: number,
  groupCount: number,
): Shape[] {
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
    // For groups of parallel transitions (same unordered node pair), spread
    // labels perpendicular to the arrow so they don't overlap. The arrow path
    // itself is left untouched — only the label position shifts.
    //
    // Use a perpendicular axis that does NOT depend on transition direction:
    // otherwise a forward edge (A→B) and a backward edge (B→A) compute
    // opposite perpendiculars, which collapses their offset slots onto the
    // same point. Anchor the perpendicular on the unordered (source, target)
    // pair so all transitions in a group share the same offset axis.
    const ax = t.source < t.target ? t.source : t.target;
    const bx = t.source < t.target ? t.target : t.source;
    const aPos = positions.get(ax)!;
    const bPos = positions.get(bx)!;
    const aCx = aPos.x + aPos.w / 2;
    const aCy = aPos.y + aPos.h / 2;
    const bCx = bPos.x + bPos.w / 2;
    const bCy = bPos.y + bPos.h / 2;
    const ddx = bCx - aCx;
    const ddy = bCy - aCy;
    const len = Math.hypot(ddx, ddy) || 1;
    // Tangent unit vector (along the unordered axis).
    const tx = ddx / len;
    const ty = ddy / len;
    // Perpendicular unit vector (rotate tangent by -90°).
    const px = ty;
    const py = -tx;
    const slot = groupCount > 1 ? groupIndex - (groupCount - 1) / 2 : 0;
    const perpOff = slot * PARALLEL_EDGE_PERP_OFFSET;
    const tanOff = slot * PARALLEL_EDGE_TANGENT_OFFSET;
    const midX = (start.x + end.x) / 2 + px * perpOff + tx * tanOff;
    const midY = (start.y + end.y) / 2 + py * perpOff + ty * tanOff;

    // Multi-line labels (real `\n` characters, expanded from `\n` escapes by
    // the parser) split into stacked text rows vertically centered on the
    // arrow midpoint so the visual block sits on the edge centerline.
    const lines = t.label.split('\n');
    if (lines.length > 1) {
      const lineHeight = EDGE_LABEL_FONT * 1.2;
      const totalH = lineHeight * lines.length;
      const startY = midY - totalH / 2 + lineHeight / 2;
      for (let i = 0; i < lines.length; i++) {
        shapes.push({
          type: 'text',
          x: midX,
          y: startY + i * lineHeight,
          text: lines[i]!,
          anchor: 'middle',
          baseline: 'middle',
          font: { family: FONT_FAMILY, size: EDGE_LABEL_FONT, color: '#000' },
        });
      }
    } else {
      shapes.push({
        type: 'text',
        x: midX,
        y: midY - 4,
        text: t.label,
        anchor: 'middle',
        baseline: 'alphabetic',
        font: { family: FONT_FAMILY, size: EDGE_LABEL_FONT, color: '#000' },
      });
    }
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
