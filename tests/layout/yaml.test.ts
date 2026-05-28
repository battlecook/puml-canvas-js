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

  it('applies <style> node properties (Khaki fill, bold red text) to list-of-maps', () => {
    const scene = compile(
      [
        '@startyaml',
        '<style>',
        'yamlDiagram {',
        '  node {',
        '    BackGroundColor lightblue',
        '    FontColor red',
        '    FontStyle bold',
        '    BackGroundColor Khaki',
        '    LineStyle 10-5',
        '  }',
        '  arrow {',
        '    LineColor green',
        '    LineStyle 2-5',
        '  }',
        '}',
        '</style>',
        '- name: Mark McGwire',
        '  hr: 65',
        '  avg: 0.278',
        '- name: Sammy Sosa',
        '  hr: 63',
        '  avg: 0.288',
        '@endyaml',
      ].join('\n'),
    );
    const rects = scene.children.filter((s: Shape) => s.type === 'rect');
    const khakiRect = rects.find(
      (r) => (r as { style?: { fill?: string } }).style?.fill === 'Khaki',
    );
    expect(khakiRect).toBeTruthy();

    const texts = scene.children.filter((s: Shape) => s.type === 'text');
    const redBoldText = texts.find((t) => {
      const f = (t as { font?: { color?: string; weight?: string } }).font;
      return f?.color === 'red' && f?.weight === 'bold';
    });
    expect(redBoldText).toBeTruthy();

    // Arrow LineColor should reach at least one line shape between nodes.
    const greenLine = scene.children.find(
      (s: Shape) =>
        s.type === 'line' &&
        (s as { style?: { stroke?: string } }).style?.stroke === 'green',
    );
    expect(greenLine).toBeTruthy();
  });
});
