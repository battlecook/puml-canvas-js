import type { Shape, Style } from '../../scene/types.js';
import { drawMarker, markerLength, shortenPolyline, type Vec } from '../class/markers.js';
import type {
  BoxSize,
  EdgeAttrs,
  EdgeStyle,
  NodeCenter,
  Position,
} from './types.js';

export const SELF_LOOP_OUT = 30;
export const SELF_LOOP_INSET = 14;

export function drawLayeredEdge(
  params: {
    fromId: string;
    toId: string;
    waypoints: string[];
    rel: EdgeAttrs;
    positions: Map<string, Position>;
    sizes: Map<string, BoxSize>;
    centers: Map<string, NodeCenter>;
    style: EdgeStyle;
    lateralOffset?: number;
  },
): Shape[] {
  const { fromId, toId, waypoints, rel, positions, sizes, centers, style } = params;
  const lateralOffset = params.lateralOffset ?? 0;

  const sPos = positions.get(fromId);
  const tPos = positions.get(toId);
  if (!sPos || !tPos) return [];
  const sSize = sizes.get(fromId);
  const tSize = sizes.get(toId);
  if (!sSize || !tSize) return [];

  const sCx = sPos.x + sSize.w / 2;
  const sCy = sPos.y + sSize.h / 2;
  const tCx = tPos.x + tSize.w / 2;
  const tCy = tPos.y + tSize.h / 2;

  const wpVec: Vec[] = waypoints
    .map((id) => centers.get(id))
    .filter((c): c is NodeCenter => c !== undefined)
    .map((c) => ({ x: c.cx, y: c.cy }));

  const firstNext = wpVec[0] ?? { x: tCx, y: tCy };
  const lastPrev = wpVec[wpVec.length - 1] ?? { x: sCx, y: sCy };

  const rawStart = rectClip(sCx, sCy, sSize.w, sSize.h, firstNext.x, firstNext.y);
  const rawEnd = rectClip(tCx, tCy, tSize.w, tSize.h, lastPrev.x, lastPrev.y);

  const start = applyLateralOffset(rawStart, rawEnd, lateralOffset);
  const end = applyLateralOffset(rawEnd, rawStart, -lateralOffset);

  const original: Vec[] = [start, ...wpVec, end];

  const startMarker = fromId === rel.source ? rel.sourceMarker : rel.targetMarker;
  const endMarker = fromId === rel.source ? rel.targetMarker : rel.sourceMarker;
  const startMult = fromId === rel.source ? rel.sourceMult : rel.targetMult;
  const endMult = fromId === rel.source ? rel.targetMult : rel.sourceMult;

  const shortened = shortenPolyline(original, markerLength(startMarker), markerLength(endMarker));
  const lineStyle: Style =
    rel.style === 'dashed'
      ? { stroke: style.color, strokeWidth: 1, strokeDasharray: '5,3', fill: 'none' }
      : { stroke: style.color, strokeWidth: 1, fill: 'none' };

  const shapes: Shape[] = [makeLine(shortened, lineStyle)];

  const startMarkerShape = drawMarker(startMarker, original[0]!, original[1]!);
  if (startMarkerShape) shapes.push(startMarkerShape);
  const endMarkerShape = drawMarker(endMarker, original[original.length - 1]!, original[original.length - 2]!);
  if (endMarkerShape) shapes.push(endMarkerShape);

  const pointsArr: Array<[number, number]> = original.map((v) => [v.x, v.y]);
  const mid = midpoint(pointsArr);

  if (rel.label) {
    const labelPlacement = computeLabelPlacement(
      mid,
      original,
      lateralOffset,
    );
    shapes.push({
      type: 'text',
      x: labelPlacement.x,
      y: labelPlacement.y,
      text: rel.label,
      anchor: labelPlacement.anchor,
      baseline: 'middle',
      font: { family: style.fontFamily, size: style.labelFontSize, color: '#000' },
    });
  }

  if (startMult) {
    shapes.push(multLabel(startMult, original[0]!, original[1]!, 0.18, style));
  }
  if (endMult) {
    shapes.push(multLabel(endMult, original[original.length - 1]!, original[original.length - 2]!, 0.18, style));
  }

  return shapes;
}

export function drawLayeredSelfLoop(
  rel: EdgeAttrs,
  pos: Position,
  sz: BoxSize,
  style: EdgeStyle,
): Shape[] {
  const startX = pos.x + sz.w;
  const startY = pos.y + SELF_LOOP_INSET;
  const endX = pos.x + sz.w;
  const endY = Math.max(startY + 18, pos.y + sz.h - SELF_LOOP_INSET);
  const outX = startX + SELF_LOOP_OUT;

  const original: Vec[] = [
    { x: startX, y: startY },
    { x: outX, y: startY },
    { x: outX, y: endY },
    { x: endX, y: endY },
  ];

  const shortened = shortenPolyline(
    original,
    markerLength(rel.sourceMarker),
    markerLength(rel.targetMarker),
  );

  const lineStyle: Style =
    rel.style === 'dashed'
      ? { stroke: style.color, strokeWidth: 1, strokeDasharray: '5,3', fill: 'none' }
      : { stroke: style.color, strokeWidth: 1, fill: 'none' };

  const shapes: Shape[] = [makeLine(shortened, lineStyle)];

  const startMarkerShape = drawMarker(rel.sourceMarker, original[0]!, original[1]!);
  if (startMarkerShape) shapes.push(startMarkerShape);
  const endMarkerShape = drawMarker(rel.targetMarker, original[3]!, original[2]!);
  if (endMarkerShape) shapes.push(endMarkerShape);

  if (rel.label) {
    shapes.push({
      type: 'text',
      x: outX + 6,
      y: (startY + endY) / 2,
      text: rel.label,
      anchor: 'start',
      baseline: 'middle',
      font: { family: style.fontFamily, size: style.labelFontSize, color: '#000' },
    });
  }
  return shapes;
}

const LABEL_PERP_GAP = 8;

function computeLabelPlacement(
  mid: Position,
  points: Vec[],
  lateralOffset: number,
): { x: number; y: number; anchor: 'start' | 'middle' | 'end' } {
  if (lateralOffset === 0 || points.length < 2) {
    return { x: mid.x, y: mid.y - 4, anchor: 'middle' };
  }
  const first = points[0]!;
  const last = points[points.length - 1]!;
  const dx = last.x - first.x;
  const dy = last.y - first.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return { x: mid.x, y: mid.y - 4, anchor: 'middle' };
  const px = -dy / len;
  const py = dx / len;
  const sign = lateralOffset > 0 ? 1 : -1;
  const x = mid.x + px * sign * LABEL_PERP_GAP;
  const y = mid.y + py * sign * LABEL_PERP_GAP;
  let anchor: 'start' | 'middle' | 'end' = 'middle';
  if (px * sign > 0.3) anchor = 'start';
  else if (px * sign < -0.3) anchor = 'end';
  return { x, y, anchor };
}

export function computeLateralOffsets<E extends { fromId: string; toId: string }>(
  edges: E[],
  magnitude = 18,
): Map<E, number> {
  const pairKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const groups = new Map<string, E[]>();
  for (const e of edges) {
    const key = pairKey(e.fromId, e.toId);
    let g = groups.get(key);
    if (!g) {
      g = [];
      groups.set(key, g);
    }
    g.push(e);
  }
  const out = new Map<E, number>();
  for (const g of groups.values()) {
    if (g.length === 1) {
      out.set(g[0]!, 0);
      continue;
    }
    const half = (g.length - 1) / 2;
    for (let i = 0; i < g.length; i++) {
      out.set(g[i]!, (i - half) * magnitude);
    }
  }
  return out;
}

function applyLateralOffset(point: Position, other: Position, offset: number): Vec {
  if (offset === 0) return { x: point.x, y: point.y };
  const dx = other.x - point.x;
  const dy = other.y - point.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return { x: point.x, y: point.y };
  const px = -dy / len;
  const py = dx / len;
  return { x: point.x + px * offset, y: point.y + py * offset };
}

function makeLine(points: Vec[], style: Style): Shape {
  if (points.length === 2) {
    return {
      type: 'line',
      x1: points[0]!.x,
      y1: points[0]!.y,
      x2: points[1]!.x,
      y2: points[1]!.y,
      style,
    };
  }
  return {
    type: 'polyline',
    points: points.map<[number, number]>((p) => [p.x, p.y]),
    style,
  };
}

export function rectClip(
  cx: number,
  cy: number,
  w: number,
  h: number,
  tx: number,
  ty: number,
): Position {
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

function midpoint(points: Array<[number, number]>): Position {
  if (points.length < 2) return { x: 0, y: 0 };
  const segLengths: number[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i]![0] - points[i - 1]![0];
    const dy = points[i]![1] - points[i - 1]![1];
    const len = Math.sqrt(dx * dx + dy * dy);
    segLengths.push(len);
    total += len;
  }
  let target = total / 2;
  for (let i = 0; i < segLengths.length; i++) {
    if (target <= segLengths[i]!) {
      const t = segLengths[i]! === 0 ? 0 : target / segLengths[i]!;
      return {
        x: points[i]![0] + (points[i + 1]![0] - points[i]![0]) * t,
        y: points[i]![1] + (points[i + 1]![1] - points[i]![1]) * t,
      };
    }
    target -= segLengths[i]!;
  }
  return { x: points[points.length - 1]![0], y: points[points.length - 1]![1] };
}

function multLabel(text: string, near: Vec, far: Vec, t: number, style: EdgeStyle): Shape {
  const dx = far.x - near.x;
  const dy = far.y - near.y;
  return {
    type: 'text',
    x: near.x + dx * t,
    y: near.y + dy * t - 4,
    text,
    anchor: 'middle',
    baseline: 'alphabetic',
    font: { family: style.fontFamily, size: style.labelFontSize, color: '#000' },
  };
}
