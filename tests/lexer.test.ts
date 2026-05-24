import { describe, it, expect } from 'vitest';
import { tokenize } from '../src/lexer/index.js';

describe('lexer', () => {
  it('recognizes @startuml / @enduml wrappers', () => {
    const tokens = tokenize('@startuml\n@enduml\n');
    const kinds = tokens.map((t) => t.kind);
    expect(kinds).toEqual(['WrapperStart', 'Newline', 'WrapperEnd', 'Newline', 'EOF']);
    expect(tokens[0]!.value).toBe('uml');
    expect(tokens[2]!.value).toBe('uml');
  });

  it('recognizes other wrappers (mindmap, gantt, json)', () => {
    expect(tokenize('@startmindmap')[0]!.value).toBe('mindmap');
    expect(tokenize('@startgantt')[0]!.value).toBe('gantt');
    expect(tokenize('@startjson')[0]!.value).toBe('json');
  });

  it('tokenizes identifiers, strings, numbers and symbols', () => {
    const tokens = tokenize('Alice -> "Bob 1" : 42');
    const kinds = tokens.map((t) => t.kind).filter((k) => k !== 'EOF');
    expect(kinds).toEqual(['Identifier', 'Symbol', 'Symbol', 'String', 'Colon', 'Number']);
    expect(tokens[3]!.value).toBe('Bob 1');
    expect(tokens[5]!.value).toBe('42');
  });

  it('skips line comments starting with quote', () => {
    const tokens = tokenize("Alice ' a comment\nBob");
    const idents = tokens.filter((t) => t.kind === 'Identifier').map((t) => t.value);
    expect(idents).toEqual(['Alice', 'Bob']);
  });

  it("skips block comments /' ... '/", () => {
    const tokens = tokenize("A /' skip me '/ B");
    const idents = tokens.filter((t) => t.kind === 'Identifier').map((t) => t.value);
    expect(idents).toEqual(['A', 'B']);
  });

  it('tracks line/column positions', () => {
    const tokens = tokenize('Alice\nBob');
    expect(tokens[0]!.pos).toEqual({ line: 1, column: 1 });
    expect(tokens[2]!.pos).toEqual({ line: 2, column: 1 });
  });
});
