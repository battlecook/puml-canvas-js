import { describe, it, expect } from 'vitest';
import { applyTheme } from '../../src/render/theme.js';
import type { Scene, GroupShape, RectShape, TextShape } from '../../src/scene/types.js';

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const body = hex.replace(/^#/, '');
  const r = parseInt(body.slice(0, 2), 16) / 255;
  const g = parseInt(body.slice(2, 4), 16) / 255;
  const b = parseInt(body.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  switch (max) {
    case r: h = (g - b) / d + (g < b ? 6 : 0); break;
    case g: h = (b - r) / d + 2; break;
    default: h = (r - g) / d + 4; break;
  }
  return { h: h / 6, s, l };
}

describe('applyTheme', () => {
  it('returns the original scene unchanged for the light theme', () => {
    const scene: Scene = {
      width: 100,
      height: 50,
      children: [{ type: 'rect', x: 0, y: 0, w: 10, h: 10, style: { fill: '#fefece' } }],
    };
    expect(applyTheme(scene, 'light')).toBe(scene);
  });

  it('sets a dark background when the scene has none', () => {
    const scene: Scene = { width: 10, height: 10, children: [] };
    const dark = applyTheme(scene, 'dark');
    expect(hexToHsl(dark.background!).l).toBeLessThan(0.3);
  });

  it('inverts an existing light background to a dark value', () => {
    const scene: Scene = { width: 10, height: 10, background: '#ffffff', children: [] };
    const dark = applyTheme(scene, 'dark');
    expect(hexToHsl(dark.background!).l).toBeLessThan(0.2);
  });

  it('darkens light fills and lightens black text', () => {
    const scene: Scene = {
      width: 10,
      height: 10,
      children: [
        { type: 'rect', x: 0, y: 0, w: 10, h: 10, style: { fill: '#fefece', stroke: '#000000' } },
        { type: 'text', x: 1, y: 1, text: 'hi', font: { color: '#000000' } },
      ],
    };
    const dark = applyTheme(scene, 'dark');
    const rect = dark.children[0] as RectShape;
    const text = dark.children[1] as TextShape;

    // Cream fill (very light) becomes dark.
    expect(hexToHsl(rect.style!.fill!).l).toBeLessThan(0.3);
    // Black stroke and black text become light.
    expect(hexToHsl(rect.style!.stroke!).l).toBeGreaterThan(0.7);
    expect(hexToHsl(text.font!.color!).l).toBeGreaterThan(0.7);
  });

  it('preserves hue for intentional accent colors', () => {
    const scene: Scene = {
      width: 10,
      height: 10,
      children: [{ type: 'line', x1: 0, y1: 0, x2: 1, y2: 1, style: { stroke: '#ff0000' } }],
    };
    const dark = applyTheme(scene, 'dark');
    const stroke = (dark.children[0] as { style: { stroke: string } }).style.stroke;
    const hsl = hexToHsl(stroke);
    // Pure red hue (0) and full saturation are kept; only lightness shifts.
    expect(hsl.h).toBeCloseTo(0, 2);
    expect(hsl.s).toBeCloseTo(1, 2);
  });

  it('leaves none / transparent untouched', () => {
    const scene: Scene = {
      width: 10,
      height: 10,
      children: [
        { type: 'rect', x: 0, y: 0, w: 10, h: 10, style: { fill: 'none', stroke: 'transparent' } },
      ],
    };
    const dark = applyTheme(scene, 'dark');
    const rect = dark.children[0] as RectShape;
    expect(rect.style!.fill).toBe('none');
    expect(rect.style!.stroke).toBe('transparent');
  });

  it('recurses into group children', () => {
    const scene: Scene = {
      width: 10,
      height: 10,
      children: [
        {
          type: 'group',
          children: [{ type: 'rect', x: 0, y: 0, w: 1, h: 1, style: { fill: '#ffffff' } }],
        },
      ],
    };
    const dark = applyTheme(scene, 'dark');
    const group = dark.children[0] as GroupShape;
    const rect = group.children[0] as RectShape;
    expect(hexToHsl(rect.style!.fill!).l).toBeLessThan(0.3);
  });

  it('passes through named colors it does not recognize', () => {
    const scene: Scene = {
      width: 10,
      height: 10,
      children: [{ type: 'rect', x: 0, y: 0, w: 1, h: 1, style: { fill: 'chartreuse' } }],
    };
    const dark = applyTheme(scene, 'dark');
    expect((dark.children[0] as RectShape).style!.fill).toBe('chartreuse');
  });

  it('inverts rgba while keeping its alpha channel', () => {
    const scene: Scene = {
      width: 10,
      height: 10,
      children: [{ type: 'rect', x: 0, y: 0, w: 1, h: 1, style: { fill: 'rgba(254, 252, 206, 0.4)' } }],
    };
    const dark = applyTheme(scene, 'dark');
    const fill = (dark.children[0] as RectShape).style!.fill!;
    expect(fill).toMatch(/^rgba\(.*,\s*0\.4\)$/);
  });
});
