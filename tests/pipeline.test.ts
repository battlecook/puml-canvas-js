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
