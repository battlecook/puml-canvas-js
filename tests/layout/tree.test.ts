import { describe, it, expect } from 'vitest';
import { compile } from '../../src/index.js';
import type { RectShape, Shape, TextShape } from '../../src/scene/types.js';

describe('wbs layout — arithmetic notation', () => {
  it('places `-_` nodes to the LEFT of their parent and `+_` to the RIGHT', () => {
    const scene = compile([
      '@startwbs',
      '+_ Root',
      '++_ R1',
      '++_ R2',
      '--_ L1',
      '@endwbs',
    ].join('\n'));
    const texts = scene.children.filter((s: Shape): s is TextShape => s.type === 'text');
    const find = (t: string) => texts.find((s) => s.text === t);
    const root = find('Root')!;
    const r1 = find('R1')!;
    const r2 = find('R2')!;
    const l1 = find('L1')!;
    expect(root).toBeTruthy();
    expect(r1).toBeTruthy();
    expect(r2).toBeTruthy();
    expect(l1).toBeTruthy();
    // L1 must sit to the LEFT of both right-side siblings; R2 must sit to the
    // right of L1 (the right group as a whole is offset rightward).
    expect(l1.x).toBeLessThan(r1.x);
    expect(l1.x).toBeLessThan(r2.x);
    expect(r2.x).toBeGreaterThan(r1.x);
    // L1 sits below-left of root; R2 sits below-right of root.
    expect(l1.x).toBeLessThan(root.x);
    expect(r2.x).toBeGreaterThan(root.x);
  });

  it('boxless nodes emit only a text shape (no rect for the node)', () => {
    const scene = compile([
      '@startwbs',
      '+_ Boxless root',
      '+_ Boxless child',
      '@endwbs',
    ].join('\n'));
    const rects = scene.children.filter((s: Shape): s is RectShape => s.type === 'rect');
    // None of the rects should be positioned around either boxless node.
    // (We accept the page background rect at x=0,y=0 — there isn't one in
    // the current renderer, but if added we filter it.)
    for (const r of rects) {
      expect(r.x).not.toBe(0);
    }
    // No rects should be emitted because every node is boxless.
    expect(rects.length).toBe(0);
    // Both text labels must still be present.
    const texts = scene.children
      .filter((s: Shape): s is TextShape => s.type === 'text')
      .map((s) => s.text);
    expect(texts).toContain('Boxless root');
    expect(texts).toContain('Boxless child');
  });

  it('regular `*` notation still draws node rectangles', () => {
    const scene = compile([
      '@startwbs',
      '* Project',
      '** Phase 1',
      '** Phase 2',
      '@endwbs',
    ].join('\n'));
    const rects = scene.children.filter((s: Shape): s is RectShape => s.type === 'rect');
    // 3 nodes → 3 rects (no page background rect in WBS layout).
    expect(rects.length).toBe(3);
  });
});

describe('mindmap layout — inline color', () => {
  it('paints each `*[#Color]` node with its declared fill', () => {
    const scene = compile([
      '@startmindmap',
      '*[#Orange] Colors',
      '**[#lightgreen] Green',
      '**[#FFBBCC] Rose',
      '**[#lightblue] Blue',
      '@endmindmap',
    ].join('\n'));
    const rects = scene.children.filter((s: Shape): s is RectShape => s.type === 'rect');
    const fills = new Set<string>();
    for (const r of rects) {
      const f = r.style?.fill;
      if (f) fills.add(f.toLowerCase());
    }
    // Expect all four inline colors to appear among the rect fills.
    expect(fills.has('orange')).toBe(true);
    expect(fills.has('lightgreen')).toBe(true);
    expect(fills.has('#ffbbcc')).toBe(true);
    expect(fills.has('lightblue')).toBe(true);
    // 4 nodes → 4 distinct fill colors.
    expect(fills.size).toBeGreaterThanOrEqual(4);
  });
});
