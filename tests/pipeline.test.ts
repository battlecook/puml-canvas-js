import { describe, it, expect } from 'vitest';
import { render, parseToAst } from '../src/index.js';

describe('end-to-end pipeline', () => {
  it('parses @startuml..@enduml and renders an SVG element', () => {
    const svg = render('@startuml\nparticipant Alice\nparticipant Bob\nAlice -> Bob: hi\n@enduml');
    expect(svg.tagName.toLowerCase()).toBe('svg');
    const texts = Array.from(svg.querySelectorAll('text')).map((t) => t.textContent);
    expect(texts).toContain('Alice');
    expect(texts).toContain('Bob');
    expect(texts.some((t) => t === 'hi')).toBe(true);
  });

  it('returns an unknown AST when no wrapper is present', () => {
    const ast = parseToAst('hello world');
    expect(ast.kind).toBe('unknown');
  });

  it('produces a placeholder AST for detected-but-not-implemented kinds', () => {
    const ast = parseToAst('@startsalt\n{ Button1 | Button2 }\n@endsalt');
    expect(ast.kind).toBe('placeholder');
    if (ast.kind === 'placeholder') {
      expect(ast.detected).toBe('salt');
    }
  });

  it('produces a class AST for class-shaped input', () => {
    const ast = parseToAst('@startuml\nclass Foo\nclass Bar\n@enduml');
    expect(ast.kind).toBe('class');
    if (ast.kind === 'class') {
      expect(ast.classes.map((c) => c.id)).toEqual(['Foo', 'Bar']);
    }
  });

  it('renders an empty class diagram when every class is removed', () => {
    // Regression for the demo gallery entry "Starting names with `$`": three
    // `$`-prefixed classes (one declared via leading-tag form) are all dropped
    // by matching `remove` statements. The SVG should contain no class
    // rectangles — only the empty-diagram placeholder text.
    const svg = render([
      '@startuml',
      'class $C1',
      'class $C2',
      '$C2 class "$C2" as dollarC2',
      'remove $C1',
      'remove $C2',
      'remove dollarC2',
      '@enduml',
    ].join('\n'));
    expect(svg.tagName.toLowerCase()).toBe('svg');
    // The only <rect> in an empty diagram is the canvas background (filled
    // white at the scene origin). No class boxes should be present.
    const rects = Array.from(svg.querySelectorAll('rect'));
    expect(rects).toHaveLength(1);
    expect(rects[0]!.getAttribute('x')).toBe('0');
    expect(rects[0]!.getAttribute('y')).toBe('0');
    const texts = Array.from(svg.querySelectorAll('text')).map((t) => t.textContent);
    expect(texts).toContain('(empty class diagram)');
  });

  it('produces a sequence AST for sequence-shaped input', () => {
    const ast = parseToAst('@startuml\nAlice -> Bob: hi\n@enduml');
    expect(ast.kind).toBe('sequence');
    if (ast.kind === 'sequence') {
      expect(ast.participants.map((p) => p.id)).toEqual(['Alice', 'Bob']);
      expect(ast.statements).toHaveLength(1);
      expect(ast.statements[0]).toMatchObject({
        type: 'message',
        from: 'Alice',
        to: 'Bob',
        text: 'hi',
      });
    }
  });
});
