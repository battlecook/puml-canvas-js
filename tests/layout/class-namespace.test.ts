import { describe, it, expect } from 'vitest';
import { compile } from '../../src/index.js';

describe('class layout — namespace package frames', () => {
  it('renders nested package frames and the inner class shape', () => {
    const scene = compile(
      [
        '@startuml',
        'set separator ::',
        'class X1::X2::foo {',
        '  +info: String',
        '}',
        '@enduml',
      ].join('\n'),
    );
    const rects = scene.children.filter((s) => s.type === 'rect');
    // Two nested package frames + the inner class box (and possibly section
    // backgrounds depending on members) — at minimum three rectangles.
    expect(rects.length).toBeGreaterThanOrEqual(3);
    const texts = scene.children
      .filter((s) => s.type === 'text')
      .map((s) => (s as { text: string }).text);
    expect(texts).toContain('X1');
    expect(texts).toContain('X2');
    expect(texts).toContain('foo');
    // Member from the body of the inner class is rendered. The leading `+`
    // visibility is drawn as a colored icon, so it's stripped from the text.
    expect(texts).toContain('info: String');
  });

  it('does not draw package frames when `set separator none` is used', () => {
    const scene = compile(
      [
        '@startuml',
        'set separator none',
        'class pkg.Foo',
        '@enduml',
      ].join('\n'),
    );
    const texts = scene.children
      .filter((s) => s.type === 'text')
      .map((s) => (s as { text: string }).text);
    // The dotted name should appear verbatim — no `pkg` package label.
    expect(texts).toContain('pkg.Foo');
    expect(texts).not.toContain('pkg');
  });
});
