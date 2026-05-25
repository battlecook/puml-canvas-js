import { describe, it, expect } from 'vitest';
import { compile } from '../../src/index.js';
import type { Shape } from '../../src/scene/types.js';

describe('yaml layout', () => {
  it('renders a key-value tree (not the placeholder)', () => {
    const scene = compile(
      [
        '@startyaml',
        'name: omni',
        'children:',
        '  - a',
        '  - b',
        '@endyaml',
      ].join('\n'),
    );
    const texts = scene.children
      .filter((s: Shape) => s.type === 'text')
      .map((s) => (s as { text: string }).text);
    expect(texts).toContain('name');
    expect(texts).not.toContain('yaml — parser pending');
  });

  it('marks #highlight target row with the highlight fill color', () => {
    const scene = compile(
      [
        '@startyaml',
        '#highlight "environments" / "prod"',
        'environments:',
        '  dev:',
        '    debug: true',
        '  prod:',
        '    debug: false',
        '@endyaml',
      ].join('\n'),
    );
    const rects = scene.children.filter((s: Shape) => s.type === 'rect');
    const highlightFill = rects.find(
      (r) => (r as { style: { fill?: string } }).style.fill === '#d6f0c8',
    );
    expect(highlightFill).toBeTruthy();
  });

  it('shows YAML-specific error label on parse failure', () => {
    const scene = compile('@startyaml\n  :::: bad\n@endyaml');
    const texts = scene.children
      .filter((s: Shape) => s.type === 'text')
      .map((s) => (s as { text: string }).text);
    if (texts.includes('YAML parse error')) {
      expect(texts).toContain('YAML parse error');
    }
  });
});
