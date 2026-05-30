import { describe, it, expect } from 'vitest';
import { compile } from '../../src/index.js';
import type { Shape } from '../../src/scene/types.js';

const FAILING_INPUT = [
  '@startnwdiag',
  'nwdiag {',
  'network dmz {',
  'address = "210.x.x.x/24"',
  '}',
  '}',
  '@endnwdiag',
].join('\n');

describe('nwdiag layout', () => {
  it('renders the failing demo input as a network bar with name + address labels', () => {
    const scene = compile(FAILING_INPUT);
    const texts = scene.children
      .filter((s: Shape) => s.type === 'text')
      .map((s) => (s as { text: string }).text);
    expect(texts).toContain('dmz');
    expect(texts).toContain('210.x.x.x/24');
    // The placeholder label should NOT appear — we want the real layout.
    expect(texts.some((t) => t.includes('parser pending'))).toBe(false);
    expect(texts.some((t) => t.includes('layout pending'))).toBe(false);
    // The network bar is at least one rect shape.
    const rects = scene.children.filter((s: Shape) => s.type === 'rect');
    expect(rects.length).toBeGreaterThanOrEqual(1);
  });

  it('renders top-level cloud node, link line, network bar, and 3 member rects', () => {
    const src = [
      '@startnwdiag',
      'nwdiag {',
      'inet [shape = cloud];',
      'inet -- router;',
      'network {',
      'router;',
      'web01;',
      'web02;',
      '}',
      '}',
      '@endnwdiag',
    ].join('\n');
    const scene = compile(src);

    // One cloud — emitted as an ellipse for the top-level `inet` node.
    const ellipses = scene.children.filter((s: Shape) => s.type === 'ellipse');
    expect(ellipses.length).toBe(1);

    // At least one rect for the network bar plus three for the members
    // (member nodes are small rects). 1 bar + 3 members = 4 minimum.
    const rects = scene.children.filter((s: Shape) => s.type === 'rect');
    expect(rects.length).toBeGreaterThanOrEqual(4);

    // Lines: at least one for the top-level link `inet -- router`. (Member
    // stub lines are also emitted, so we just check ">= 1".)
    const lines = scene.children.filter((s: Shape) => s.type === 'line');
    expect(lines.length).toBeGreaterThanOrEqual(1);

    // Member labels appear as text.
    const texts = scene.children
      .filter((s: Shape) => s.type === 'text')
      .map((s) => (s as { text: string }).text);
    expect(texts).toContain('inet');
    expect(texts).toContain('router');
    expect(texts).toContain('web01');
    expect(texts).toContain('web02');
  });
});
