import { describe, it, expect } from 'vitest';
import { compile } from '../../src/index.js';
import type { Shape } from '../../src/scene/types.js';

const SAMPLE = [
  '@startsalt',
  '{',
  'Just plain text',
  '[This is my button]',
  '()',
  'Unchecked radio',
  '(X)',
  'Checked radio',
  '[]',
  'Unchecked box',
  '[X]',
  'Checked box',
  '"Enter text here "',
  '^This is a droplist^',
  '}',
  '@endsalt',
].join('\n');

describe('salt layout', () => {
  it('emits shapes for every widget in the failing salt sample', () => {
    const scene = compile(SAMPLE);
    const kinds = scene.children.map((s: Shape) => s.type);

    // Outer container rect is always present.
    expect(kinds.filter((k) => k === 'rect').length).toBeGreaterThanOrEqual(5);
    // Two radios → at least two circle outlines + one filled dot for the
    // checked radio = 3 circles.
    expect(kinds.filter((k) => k === 'circle').length).toBeGreaterThanOrEqual(3);
    // Droplist arrow → one polygon.
    expect(kinds.filter((k) => k === 'polygon').length).toBeGreaterThanOrEqual(1);
    // Plain-text rows + textfield/droplist/button labels → at least 8 text shapes.
    expect(kinds.filter((k) => k === 'text').length).toBeGreaterThanOrEqual(8);

    const texts = scene.children
      .filter((s: Shape): s is Shape & { type: 'text'; text: string } => s.type === 'text')
      .map((s) => s.text);

    expect(texts).toContain('Just plain text');
    expect(texts).toContain('This is my button');
    expect(texts).toContain('Unchecked radio');
    expect(texts).toContain('Checked radio');
    expect(texts).toContain('Enter text here ');
    expect(texts).toContain('This is a droplist');
  });

  it('produces a non-empty scene with positive dimensions', () => {
    const scene = compile(SAMPLE);
    expect(scene.width).toBeGreaterThan(0);
    expect(scene.height).toBeGreaterThan(0);
  });
});
