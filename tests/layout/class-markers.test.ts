import { describe, it, expect } from 'vitest';
import { drawMarker, markerLength, shortenPolyline } from '../../src/layout/class/markers.js';

describe('markers — markerLength', () => {
  it('returns 0 for none and arrow (arrow overlays the line)', () => {
    expect(markerLength('none')).toBe(0);
    expect(markerLength('arrow')).toBe(0);
  });

  it('returns positive length for triangle and diamond', () => {
    expect(markerLength('triangle')).toBeGreaterThan(0);
    expect(markerLength('diamond-filled')).toBeGreaterThan(0);
    expect(markerLength('diamond-open')).toBeGreaterThan(0);
  });
});

describe('markers — drawMarker', () => {
  it('returns null for none', () => {
    expect(drawMarker('none', { x: 0, y: 0 }, { x: 10, y: 0 })).toBeNull();
  });

  it('produces a polyline for arrow', () => {
    const m = drawMarker('arrow', { x: 100, y: 0 }, { x: 0, y: 0 });
    expect(m?.type).toBe('polyline');
  });

  it('produces a triangle polygon with 3 vertices', () => {
    const m = drawMarker('triangle', { x: 100, y: 0 }, { x: 0, y: 0 });
    expect(m?.type).toBe('polygon');
    if (m?.type === 'polygon') expect(m.points).toHaveLength(3);
  });

  it('produces a 4-vertex diamond for diamond-filled', () => {
    const m = drawMarker('diamond-filled', { x: 100, y: 0 }, { x: 0, y: 0 });
    expect(m?.type).toBe('polygon');
    if (m?.type === 'polygon') {
      expect(m.points).toHaveLength(4);
      expect(m.style?.fill).not.toBe('#fff');
    }
  });

  it('fills triangle and diamond-open with white', () => {
    const t = drawMarker('triangle', { x: 100, y: 0 }, { x: 0, y: 0 });
    const d = drawMarker('diamond-open', { x: 100, y: 0 }, { x: 0, y: 0 });
    if (t?.type === 'polygon') expect(t.style?.fill).toBe('#fff');
    if (d?.type === 'polygon') expect(d.style?.fill).toBe('#fff');
  });
});

describe('markers — shortenPolyline', () => {
  it('returns unchanged when both shortens are 0', () => {
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }];
    const out = shortenPolyline(pts, 0, 0);
    expect(out).toEqual(pts);
  });

  it('moves the first point inward along the first segment', () => {
    const out = shortenPolyline([{ x: 0, y: 0 }, { x: 10, y: 0 }], 3, 0);
    expect(out[0]).toEqual({ x: 3, y: 0 });
    expect(out[1]).toEqual({ x: 10, y: 0 });
  });

  it('moves the last point inward along the last segment', () => {
    const out = shortenPolyline([{ x: 0, y: 0 }, { x: 10, y: 0 }], 0, 4);
    expect(out[0]).toEqual({ x: 0, y: 0 });
    expect(out[1]).toEqual({ x: 6, y: 0 });
  });

  it('handles multi-segment polylines', () => {
    const out = shortenPolyline(
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
      ],
      0,
      4,
    );
    expect(out[2]).toEqual({ x: 10, y: 6 });
  });
});
