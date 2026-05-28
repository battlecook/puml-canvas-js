import type { EndMarker } from '../../ast/class.js';
import type { Shape } from '../../scene/types.js';

const TRI_LEN = 14;
const TRI_HALF = 7;
const DIA_LEN = 18;
const DIA_HALF = 6;
const ARROW_LEN = 10;
const ARROW_HALF = 5;

const COLOR = '#222';
const FILL_WHITE = '#fff';

export interface Vec {
  x: number;
  y: number;
}

export function markerLength(m: EndMarker): number {
  switch (m) {
    case 'triangle':       return TRI_LEN;
    case 'diamond-filled':
    case 'diamond-open':   return DIA_LEN;
    case 'arrow':          return 0;
    case 'none':           return 0;
  }
}

export function drawMarker(m: EndMarker, end: Vec, prev: Vec, colorOverride?: string): Shape | null {
  if (m === 'none') return null;
  const dir = unitFrom(prev, end);
  if (dir.x === 0 && dir.y === 0) return null;
  const p = { x: -dir.y, y: dir.x };
  const color = colorOverride ?? COLOR;

  switch (m) {
    case 'arrow': {
      const back = sub(end, scale(dir, ARROW_LEN));
      const a1 = add(back, scale(p, ARROW_HALF));
      const a2 = sub(back, scale(p, ARROW_HALF));
      return {
        type: 'polyline',
        points: [
          [a1.x, a1.y],
          [end.x, end.y],
          [a2.x, a2.y],
        ],
        style: { stroke: color, strokeWidth: 1.2, fill: 'none' },
      };
    }
    case 'triangle': {
      const back = sub(end, scale(dir, TRI_LEN));
      const b1 = add(back, scale(p, TRI_HALF));
      const b2 = sub(back, scale(p, TRI_HALF));
      return {
        type: 'polygon',
        points: [
          [end.x, end.y],
          [b1.x, b1.y],
          [b2.x, b2.y],
        ],
        style: { stroke: color, strokeWidth: 1, fill: FILL_WHITE },
      };
    }
    case 'diamond-filled':
    case 'diamond-open': {
      const mid = sub(end, scale(dir, DIA_LEN / 2));
      const inner = sub(end, scale(dir, DIA_LEN));
      const s1 = add(mid, scale(p, DIA_HALF));
      const s2 = sub(mid, scale(p, DIA_HALF));
      return {
        type: 'polygon',
        points: [
          [end.x, end.y],
          [s1.x, s1.y],
          [inner.x, inner.y],
          [s2.x, s2.y],
        ],
        style: {
          stroke: color,
          strokeWidth: 1,
          fill: m === 'diamond-filled' ? color : FILL_WHITE,
        },
      };
    }
  }
}

export function shortenPolyline(points: Vec[], frontShorten: number, backShorten: number): Vec[] {
  if (points.length < 2) return points.map((p) => ({ ...p }));
  const out = points.map((p) => ({ ...p }));

  if (frontShorten > 0) {
    const p0 = out[0]!;
    const p1 = out[1]!;
    const d = unitFrom(p0, p1);
    out[0] = add(p0, scale(d, frontShorten));
  }

  if (backShorten > 0) {
    const pN = out[out.length - 1]!;
    const pM = out[out.length - 2]!;
    const d = unitFrom(pM, pN);
    out[out.length - 1] = sub(pN, scale(d, backShorten));
  }

  return out;
}

function unitFrom(from: Vec, to: Vec): Vec {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return { x: 0, y: 0 };
  return { x: dx / len, y: dy / len };
}

function add(a: Vec, b: Vec): Vec {
  return { x: a.x + b.x, y: a.y + b.y };
}

function sub(a: Vec, b: Vec): Vec {
  return { x: a.x - b.x, y: a.y - b.y };
}

function scale(v: Vec, s: number): Vec {
  return { x: v.x * s, y: v.y * s };
}
