import { describe, it, expect } from 'vitest';
import { parseSalt } from '../../src/parser/salt/index.js';

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

describe('salt parser', () => {
  it('parses the documented-failure salt sample into 12 rows', () => {
    const ast = parseSalt(SAMPLE);
    expect(ast.kind).toBe('salt');
    expect(ast.rows).toHaveLength(12);
    expect(ast.rows).toEqual([
      { kind: 'text', text: 'Just plain text' },
      { kind: 'button', label: 'This is my button' },
      { kind: 'radio', checked: false },
      { kind: 'text', text: 'Unchecked radio' },
      { kind: 'radio', checked: true },
      { kind: 'text', text: 'Checked radio' },
      { kind: 'checkbox', checked: false },
      { kind: 'text', text: 'Unchecked box' },
      { kind: 'checkbox', checked: true },
      { kind: 'text', text: 'Checked box' },
      { kind: 'textfield', text: 'Enter text here ' },
      { kind: 'droplist', label: 'This is a droplist' },
    ]);
  });

  it('treats lowercase x in radios/checkboxes as checked', () => {
    const ast = parseSalt('@startsalt\n{\n(x)\n[x]\n}\n@endsalt');
    expect(ast.rows).toEqual([
      { kind: 'radio', checked: true },
      { kind: 'checkbox', checked: true },
    ]);
  });

  it('returns an empty row list when only delimiters are present', () => {
    const ast = parseSalt('@startsalt\n{\n}\n@endsalt');
    expect(ast.rows).toEqual([]);
  });
});
