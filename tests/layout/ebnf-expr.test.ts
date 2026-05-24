import { describe, it, expect } from 'vitest';
import { parseEbnfBody } from '../../src/layout/grammar/ebnf-expr.js';

describe('EBNF expression parser', () => {
  it('parses a single terminal', () => {
    expect(parseEbnfBody('"foo"')).toEqual({ type: 'terminal', value: 'foo' });
  });

  it('parses a non-terminal', () => {
    expect(parseEbnfBody('identifier')).toEqual({ type: 'nonterminal', name: 'identifier' });
  });

  it('parses sequence (comma)', () => {
    const e = parseEbnfBody('"a" , "b" , "c"');
    expect(e?.type).toBe('seq');
    if (e?.type === 'seq') expect(e.items).toHaveLength(3);
  });

  it('parses alternation', () => {
    const e = parseEbnfBody('"a" | "b" | "c"');
    expect(e?.type).toBe('alt');
    if (e?.type === 'alt') expect(e.alternatives).toHaveLength(3);
  });

  it('parses repetition { }', () => {
    const e = parseEbnfBody('{ "x" }');
    expect(e?.type).toBe('rep');
  });

  it('parses optional [ ]', () => {
    const e = parseEbnfBody('[ "x" ]');
    expect(e?.type).toBe('opt');
  });

  it('parses group ( ) and unwraps it', () => {
    const e = parseEbnfBody('( "a" | "b" )');
    expect(e?.type).toBe('alt');
  });

  it('respects precedence: alt > seq > primary', () => {
    const e = parseEbnfBody('"a" , "b" | "c" , "d"');
    expect(e?.type).toBe('alt');
    if (e?.type === 'alt') {
      expect(e.alternatives).toHaveLength(2);
      expect(e.alternatives[0]?.type).toBe('seq');
      expect(e.alternatives[1]?.type).toBe('seq');
    }
  });

  it('returns null on malformed input', () => {
    expect(parseEbnfBody('"a" |')).toBeNull();
    expect(parseEbnfBody('{ "a"')).toBeNull();
  });

  it('parses nested constructs', () => {
    const e = parseEbnfBody('"start" , { "x" | "y" } , [ "end" ]');
    expect(e?.type).toBe('seq');
    if (e?.type === 'seq') {
      expect(e.items[1]?.type).toBe('rep');
      expect(e.items[2]?.type).toBe('opt');
    }
  });
});
