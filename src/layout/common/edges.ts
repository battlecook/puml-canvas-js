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
    /**
     * Visual treatment of the edge path:
     *
     * - `'straight'` (default): the polyline through `[start, ...waypoints, end]`
     *   is drawn as-is (a `<line>` for 2 points, `<polyline>` for more).
     * - `'bezier'`: the same control points are smoothed into a single cubic
     *   Bezier `<path>` and the end-markers are oriented along the curve's
     *   tangent at its endpoints. Only takes effect when there is at least one
     *   waypoint (otherwise a 2-point straight edge has nothing to smooth).
     */
    curve?: 'straight' | 'bezier';
    /**
     * Phase 1 Step D3 — engine-computed label rectangle.
     *
     * When provided, the label's anchor point is the centre of this box
     * (offset by the same vertical baseline-fudge the midpoint fallback uses
     * for single-line labels) instead of the polyline midpoint. The engine's
     * collision-avoidance pass slides this box off the midpoint to clear
     * node rectangles and previously-placed labels — see
     * `placeLabelBox` in `dot-sugiyama.ts`.
     *
     * When undefined, falls back to the polyline-midpoint placement used
     * before Step D3.
     */
    labelBox?: { x: number; y: number; width: number; height: number };
  },
): Shape[] {
  const { fromId, toId, waypoints, rel, positions, sizes, centers, style } = params;
  const lateralOffset = params.lateralOffset ?? 0;
  const curve = params.curve ?? 'straight';
  const labelBox = params.labelBox;

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

  // F2b — multi-edge spline separation. For a single edge (`lateralOffset === 0`)
  // the start/end stay exactly on the node boundary and the interior is just
  // the waypoint polyline, so the output is byte-identical to before this pass.
  //
  // For one of N≥2 parallel/bidirectional edges (`lateralOffset !== 0`) we keep
  // the endpoints ANCHORED on the node boundary (so arrowheads still land on
  // the rect) and instead bow the INTERIOR out perpendicular to the baseline by
  // `lateralOffset`. `separatedSplinePoints` inserts the bowed control point(s)
  // and the path is rendered as a smooth cubic Bezier (see `bowed` below), so
  // two edges of the same node pair become visually distinct curves. Because
  // `computeLateralOffsets` assigns the bidirectional pair opposite-signed
  // offsets, the two curves bow to opposite sides.
  const bowed = lateralOffset !== 0;
  const start = rawStart;
  const end = rawEnd;

  const original: Vec[] = bowed
    ? separatedSplinePoints([start, ...wpVec, end], lateralOffset)
    : [start, ...wpVec, end];

  const startMarker = fromId === rel.source ? rel.sourceMarker : rel.targetMarker;
  const endMarker = fromId === rel.source ? rel.targetMarker : rel.sourceMarker;
  const startMult = fromId === rel.source ? rel.sourceMult : rel.targetMult;
  const endMult = fromId === rel.source ? rel.targetMult : rel.sourceMult;

  const shortened = shortenPolyline(original, markerLength(startMarker), markerLength(endMarker));
  // Per-edge override (`rel.lineColor` / `rel.lineStyle` / `rel.textColor`)
  // comes from PlantUML's inline `#<styleBlock>` (`#line:red;line.bold;text:red`).
  // When absent we fall back to the diagram-wide `EdgeStyle` and the
  // structural `rel.style` classification.
  const strokeColor = rel.lineColor ?? style.color;
  const markerColor = rel.lineColor ?? style.markerColor;
  const lineStyle: Style = resolveLineStyle(rel, strokeColor);

  // Bezier rendering kicks in when EITHER:
  //   * the engine flagged this edge for smoothing AND there's at least one
  //     interior bend point (`curve === 'bezier'`), OR
  //   * this is a separated parallel/bidirectional edge (`bowed`) — its
  //     interior control point bows off the baseline, so a smooth curve reads
  //     much better than a kinked polyline.
  // A 2-point edge with no bow has nothing meaningful to smooth, so it stays a
  // straight `<line>`. We use the *shortened* polyline as the Bezier's control
  // hull so the marker (which sits ahead of the shortened endpoint) lines up
  // with the curve's tip without overshooting the node rect.
  const useBezier = (curve === 'bezier' || bowed) && shortened.length >= 3;

  const shapes: Shape[] = [
    useBezier ? makeBezierPath(shortened, lineStyle) : makeLine(shortened, lineStyle),
  ];

  // Marker direction uses the curve's TANGENT at the endpoint, not just the
  // next/prev polyline segment. For the Catmull-Rom-to-Bezier construction
  // we use, the tangent at p0 is parallel to (p1 - p0) and the tangent at
  // p[N-1] is parallel to (p[N-1] - p[N-2]) — i.e. the same direction the
  // straight-line marker uses. We make this explicit by computing it from
  // `bezierTangentAtStart` / `bezierTangentAtEnd` so future control-point
  // tweaks can change the marker orientation in lock-step. The bezier-style
  // tangents are computed against `original` (pre-shortening) so the marker
  // stays parallel to the actual curve — shortening preserves direction.
  const startTangentRef = useBezier
    ? bezierTangentAtStart(original)
    : { x: original[1]!.x, y: original[1]!.y };
  const endTangentRef = useBezier
    ? bezierTangentAtEnd(original)
    : { x: original[original.length - 2]!.x, y: original[original.length - 2]!.y };
  const startMarkerShape = drawMarker(startMarker, original[0]!, startTangentRef, markerColor);
  if (startMarkerShape) shapes.push(startMarkerShape);
  const endMarkerShape = drawMarker(endMarker, original[original.length - 1]!, endTangentRef, markerColor);
  if (endMarkerShape) shapes.push(endMarkerShape);

  const pointsArr: Array<[number, number]> = original.map((v) => [v.x, v.y]);
  const mid = midpoint(pointsArr);

  if (rel.label) {
    // Phase 1 Step D3 — anchor on the engine-supplied collision-avoided box
    // when present AND there's no perpendicular `lateralOffset` to worry
    // about. For parallel edges (`lateralOffset !== 0`) we keep the legacy
    // perpendicular-shift logic: it already separates labels of A↔B
    // bidirectional pairs along the perpendicular axis, and the engine
    // can't see that (it has no notion of which edges are parallel mates).
    const useLabelBox = labelBox !== undefined && lateralOffset === 0;
    const anchorPoint: Position = useLabelBox
      ? { x: labelBox!.x + labelBox!.width / 2, y: labelBox!.y + labelBox!.height / 2 }
      : mid;
    const labelPlacement = computeLabelPlacement(
      anchorPoint,
      original,
      lateralOffset,
    );
    // Multi-line labels (real `\n` characters) split into stacked text shapes,
    // vertically centered on the original placement point so the visual midpoint
    // of the block still sits at the edge midpoint. Single-line labels keep
    // their previous y to preserve baseline-compatible positioning.
    const lines = rel.label.split('\n');
    const labelColor = rel.textColor ?? '#000';
    if (lines.length > 1) {
      const lineHeight = style.labelFontSize * 1.2;
      const totalH = lineHeight * lines.length;
      const startY = labelPlacement.y - totalH / 2 + lineHeight / 2;
      for (let i = 0; i < lines.length; i++) {
        shapes.push({
          type: 'text',
          x: labelPlacement.x,
          y: startY + i * lineHeight,
          text: lines[i]!,
          anchor: labelPlacement.anchor,
          baseline: 'middle',
          font: { family: style.fontFamily, size: style.labelFontSize, color: labelColor },
        });
      }
    } else {
      shapes.push({
        type: 'text',
        x: labelPlacement.x,
        y: labelPlacement.y,
        text: rel.label,
        anchor: labelPlacement.anchor,
        baseline: 'middle',
        font: { family: style.fontFamily, size: style.labelFontSize, color: labelColor },
      });
    }
    const triangle = computeLabelDirectionTriangle(
      labelPlacement,
      rel,
      original,
      fromId,
      style.labelFontSize,
    );
    if (triangle) shapes.push(triangle);
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

  const strokeColor = rel.lineColor ?? style.color;
  const markerColor = rel.lineColor ?? style.markerColor;
  const lineStyle: Style = resolveLineStyle(rel, strokeColor);

  const shapes: Shape[] = [makeLine(shortened, lineStyle)];

  const startMarkerShape = drawMarker(rel.sourceMarker, original[0]!, original[1]!, markerColor);
  if (startMarkerShape) shapes.push(startMarkerShape);
  const endMarkerShape = drawMarker(rel.targetMarker, original[3]!, original[2]!, markerColor);
  if (endMarkerShape) shapes.push(endMarkerShape);

  if (rel.label) {
    shapes.push({
      type: 'text',
      x: outX + 6,
      y: (startY + endY) / 2,
      text: rel.label,
      anchor: 'start',
      baseline: 'middle',
      font: { family: style.fontFamily, size: style.labelFontSize, color: rel.textColor ?? '#000' },
    });
  }
  return shapes;
}

/**
 * Compute the SVG `Style` for a relationship line, honouring an optional
 * per-edge `rel.lineStyle` override (from PlantUML's inline `#<styleBlock>`):
 *
 * - `'bold'`   — solid stroke of width 2.
 * - `'dotted'` — short-dash dasharray (`2,2`), width 1.
 * - `'dashed'` — long-dash dasharray (`5,3`), width 1.
 * - `'solid'`  — plain stroke of width 1.
 *
 * When no override is set, falls back to the structural `rel.style`
 * (`'dashed'` ↔ long-dash, anything else ↔ solid) so existing diagrams render
 * identically.
 */
function resolveLineStyle(rel: EdgeAttrs, stroke: string): Style {
  const variant = rel.lineStyle ?? (rel.style === 'dashed' ? 'dashed' : 'solid');
  switch (variant) {
    case 'bold':
      return { stroke, strokeWidth: 2, fill: 'none' };
    case 'dotted':
      return { stroke, strokeWidth: 1, strokeDasharray: '2,2', fill: 'none' };
    case 'dashed':
      return { stroke, strokeWidth: 1, strokeDasharray: '5,3', fill: 'none' };
    case 'solid':
    default:
      return { stroke, strokeWidth: 1, fill: 'none' };
  }
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

/**
 * F2b — build a *separated spline* control polyline for one edge of a parallel
 * (or bidirectional) group.
 *
 * Given the edge's baseline control points `[start, ...waypoints, end]` and a
 * signed perpendicular `displacement` (the edge's lateral offset within its
 * group), this returns a new control polyline whose ENDPOINTS are unchanged
 * (so arrowheads still land on the node boundary) but whose INTERIOR bows out
 * perpendicular to the start→end baseline by `displacement`. When fed to
 * `makeBezierPath` the result is a smooth curve that bows to one side of the
 * baseline; the bidirectional mate, which receives the opposite-signed
 * displacement from `computeLateralOffsets`, bows to the other side.
 *
 * - `displacement === 0` returns the input unchanged (single-edge case).
 * - A 2-point baseline (no waypoints) gains a single bowed midpoint control
 *   point, turning the straight segment into a gentle arc.
 * - A baseline that already has interior waypoints has each interior point
 *   shifted perpendicular by `displacement` (endpoints pinned), so multi-bend
 *   routed edges separate too.
 */
export function separatedSplinePoints(points: Vec[], displacement: number): Vec[] {
  if (displacement === 0 || points.length < 2) return points;
  const start = points[0]!;
  const end = points[points.length - 1]!;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return points;
  // Perpendicular unit vector to the baseline.
  const px = -dy / len;
  const py = dx / len;

  if (points.length === 2) {
    // Insert a single bowed midpoint between the two anchored endpoints.
    const mx = (start.x + end.x) / 2 + px * displacement;
    const my = (start.y + end.y) / 2 + py * displacement;
    return [start, { x: mx, y: my }, end];
  }

  // Shift each interior waypoint perpendicular by `displacement`, leaving the
  // endpoints pinned on their node boundaries.
  const out: Vec[] = [start];
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i]!;
    out.push({ x: p.x + px * displacement, y: p.y + py * displacement });
  }
  out.push(end);
  return out;
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

/**
 * Convert a polyline of ≥ 3 control points into a smooth cubic-Bezier `<path>`
 * via Catmull-Rom-to-Bezier interpolation. The resulting curve passes through
 * every input point; only the inter-point segments curve to remove the sharp
 * corners a raw polyline would have.
 *
 * Algorithm: for each segment p[i] → p[i+1], the two cubic control points are
 *   cp1 = p[i]   + (p[i+1] - p[i-1]) * t
 *   cp2 = p[i+1] - (p[i+2] - p[i])   * t
 * where the "mirror" boundary convention puts p[-1] = p[0] and p[n] = p[n-1]
 * (so endpoints behave like straight tangents). `t = 1/6` matches the standard
 * Catmull-Rom-to-Bezier conversion with unit tension.
 *
 * The path is `M <p0> C <cp1>,<cp2>,<p1> S <cp2>,<p2> ...` — we emit a fresh
 * `C` per segment instead of `S` because each segment computes its own cp1
 * (not the reflection of the previous cp2).
 */
function makeBezierPath(points: Vec[], style: Style): Shape {
  const n = points.length;
  // Defensive: callers gate on `points.length >= 3`, but keep the math safe.
  if (n < 2) {
    return {
      type: 'path',
      d: n === 1 ? `M ${points[0]!.x} ${points[0]!.y}` : '',
      style,
    };
  }
  if (n === 2) {
    const a = points[0]!;
    const b = points[1]!;
    return { type: 'path', d: `M ${a.x} ${a.y} L ${b.x} ${b.y}`, style };
  }

  const T = 1 / 6;
  const parts: string[] = [`M ${fmt(points[0]!.x)} ${fmt(points[0]!.y)}`];
  for (let i = 0; i < n - 1; i++) {
    const p0 = points[i]!;
    const p1 = points[i + 1]!;
    const pPrev = i === 0 ? p0 : points[i - 1]!;
    const pNext = i + 2 >= n ? p1 : points[i + 2]!;
    const cp1x = p0.x + (p1.x - pPrev.x) * T;
    const cp1y = p0.y + (p1.y - pPrev.y) * T;
    const cp2x = p1.x - (pNext.x - p0.x) * T;
    const cp2y = p1.y - (pNext.y - p0.y) * T;
    parts.push(
      `C ${fmt(cp1x)} ${fmt(cp1y)}, ${fmt(cp2x)} ${fmt(cp2y)}, ${fmt(p1.x)} ${fmt(p1.y)}`,
    );
  }
  return { type: 'path', d: parts.join(' '), style };
}

/**
 * Tangent reference point for the START endpoint of the curve produced by
 * `makeBezierPath` — i.e. a point P such that (P - points[0]) is parallel to
 * B'(0). With our mirror boundary, that direction is simply (p1 - p0), so we
 * return p1. Returned as a Vec the marker module can consume as its `prev`
 * argument (it computes `unitFrom(prev, end)`).
 */
function bezierTangentAtStart(points: Vec[]): Vec {
  return { x: points[1]!.x, y: points[1]!.y };
}

/**
 * Tangent reference point for the END endpoint. With our mirror boundary,
 * B'(1) is parallel to (p[N-1] - p[N-2]); the marker wants a point such that
 * (end - prev) is the tangent, so we return p[N-2].
 */
function bezierTangentAtEnd(points: Vec[]): Vec {
  const i = points.length - 2;
  return { x: points[i]!.x, y: points[i]!.y };
}

/** Trim trailing zeros so path strings stay readable in golden diffs. */
function fmt(n: number): string {
  // Round to 6 decimals to avoid float noise in serialized goldens.
  const r = Math.round(n * 1e6) / 1e6;
  return String(r);
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

/**
 * Builds a small filled triangle next to the label whose apex points along the
 * edge in the reading direction the user specified.
 *
 * Reading direction comes from PlantUML's `< label` (backward) or `label >`
 * (forward) markers. Forward means "read source → target in source-text order".
 * Layout may flip which end is drawn on top, so we always compute the screen
 * vector for rel.source → rel.target and invert when fromId is the target.
 */
function computeLabelDirectionTriangle(
  labelPlacement: { x: number; y: number; anchor: 'start' | 'middle' | 'end' },
  rel: EdgeAttrs,
  original: Vec[],
  fromId: string,
  fontSize: number,
): Shape | null {
  const dir = rel.labelDirection;
  if (dir !== 'forward' && dir !== 'backward') return null;
  if (original.length < 2) return null;

  const first = original[0]!;
  const last = original[original.length - 1]!;
  let dx = last.x - first.x;
  let dy = last.y - first.y;
  if (fromId !== rel.source) {
    dx = -dx;
    dy = -dy;
  }
  if (dir === 'backward') {
    dx = -dx;
    dy = -dy;
  }
  const len = Math.hypot(dx, dy);
  if (len === 0) return null;
  const ux = dx / len;
  const uy = dy / len;

  const labelW = (rel.label?.length ?? 0) * fontSize * 0.55;
  let labelLeftX: number;
  switch (labelPlacement.anchor) {
    case 'start':  labelLeftX = labelPlacement.x; break;
    case 'end':    labelLeftX = labelPlacement.x - labelW; break;
    case 'middle':
    default:       labelLeftX = labelPlacement.x - labelW / 2; break;
  }

  const SIZE = 7;
  const GAP = 3;
  const cx = labelLeftX - GAP - SIZE / 2;
  const cy = labelPlacement.y;
  const apex: [number, number] = [cx + ux * (SIZE / 2), cy + uy * (SIZE / 2)];
  const baseCx = cx - ux * (SIZE / 2);
  const baseCy = cy - uy * (SIZE / 2);
  const px = -uy;
  const py = ux;
  const half = SIZE * 0.45;
  const b1: [number, number] = [baseCx + px * half, baseCy + py * half];
  const b2: [number, number] = [baseCx - px * half, baseCy - py * half];

  return {
    type: 'polygon',
    points: [apex, b1, b2],
    style: { fill: '#000', stroke: '#000', strokeWidth: 1 },
  };
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
