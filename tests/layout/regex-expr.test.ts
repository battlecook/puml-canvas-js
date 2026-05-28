import { describe, it, expect } from 'vitest';
import { parseRegexPattern } from '../../src/layout/grammar/regex-expr.js';

describe('regex expression parser', () => {
  it('parses a plain literal sequence', () => {
    expect(parseRegexPattern('abc')).toEqual({ type: 'literal', value: 'abc' });
  });

  it('parses anchors ^ and $', () => {
    const e = parseRegexPattern('^abc$');
    expect(e?.type).toBe('seq');
    if (e?.type === 'seq') {
      expect(e.items[0]).toEqual({ type: 'anchor', kind: 'start' });
      expect(e.items[2]).toEqual({ type: 'anchor', kind: 'end' });
    }
  });

  it('parses character class \\s\\d\\w', () => {
    const e = parseRegexPattern('\\s\\d\\w');
    expect(e?.type).toBe('seq');
    if (e?.type === 'seq') {
      expect(e.items.map((i) => (i.type === 'charclass' ? i.raw : i.type))).toEqual([
        '\\s', '\\d', '\\w',
      ]);
    }
  });

  it('parses quantifiers *, +, ?', () => {
    const star = parseRegexPattern('a*');
    expect(star?.type).toBe('quantified');
    if (star?.type === 'quantified') expect(star).toMatchObject({ min: 0, max: null });

    const plus = parseRegexPattern('a+');
    if (plus?.type === 'quantified') expect(plus).toMatchObject({ min: 1, max: null });

    const opt = parseRegexPattern('a?');
    if (opt?.type === 'quantified') expect(opt).toMatchObject({ min: 0, max: 1 });
  });

  it('parses non-capturing group (?:...)', () => {
    const e = parseRegexPattern('(?:abc)');
    expect(e?.type).toBe('group');
    if (e?.type === 'group') {
      expect(e.capturing).toBe(false);
      expect(e.body).toEqual({ type: 'literal', value: 'abc' });
    }
  });

  it('parses alternation in group', () => {
    const e = parseRegexPattern('(?:a|b|c)');
    if (e?.type === 'group' && e.body.type === 'alt') {
      expect(e.body.alternatives).toHaveLength(3);
    } else {
      throw new Error('expected alt inside group');
    }
  });

  it('parses character set [...]', () => {
    const e = parseRegexPattern('[a-zA-Z]');
    expect(e?.type).toBe('charclass');
    if (e?.type === 'charclass') expect(e.raw).toBe('[a-zA-Z]');
  });

  it('parses \\b word boundary', () => {
    const e = parseRegexPattern('\\bword\\b');
    if (e?.type === 'seq') {
      expect(e.items[0]).toEqual({ type: 'anchor', kind: 'wordboundary' });
      expect(e.items[2]).toEqual({ type: 'anchor', kind: 'wordboundary' });
    }
  });

  it('parses the PlantUML file detector pattern', () => {
    const e = parseRegexPattern('^\\s*@start(?:uml|json|yaml|gantt)\\b');
    expect(e?.type).toBe('seq');
    if (e?.type === 'seq') {
      expect(e.items[0]?.type).toBe('anchor');
      expect(e.items[1]?.type).toBe('quantified');
      expect(e.items[2]).toMatchObject({ type: 'literal', value: '@start' });
      expect(e.items[3]?.type).toBe('group');
      expect(e.items[4]?.type).toBe('anchor');
    }
  });

  it('quantifier only attaches to last char of literal', () => {
    // 'ab+' should be: literal('a'), quantified(literal('b'), +)
    const e = parseRegexPattern('ab+');
    expect(e?.type).toBe('seq');
    if (e?.type === 'seq') {
      expect(e.items).toHaveLength(2);
      expect(e.items[0]).toEqual({ type: 'literal', value: 'a' });
      expect(e.items[1]).toMatchObject({
        type: 'quantified',
        body: { type: 'literal', value: 'b' },
      });
    }
  });

  it('recovers from missing closer (no crash)', () => {
    const e = parseRegexPattern('(unclosed');
    expect(e).not.toBeNull();
  });

  it('parses \\Q...\\E as a single literal sequence', () => {
    expect(parseRegexPattern('\\Qfoo\\E')).toEqual({ type: 'literal', value: 'foo' });
  });

  it('treats regex metacharacters inside \\Q...\\E as literal', () => {
    expect(parseRegexPattern('\\Qa.b*c|d\\E')).toEqual({
      type: 'literal',
      value: 'a.b*c|d',
    });
  });

  it('handles unterminated \\Q by consuming to end of input', () => {
    expect(parseRegexPattern('\\Qfoo')).toEqual({ type: 'literal', value: 'foo' });
  });
});
