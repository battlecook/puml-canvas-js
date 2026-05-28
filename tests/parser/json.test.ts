import { describe, it, expect } from 'vitest';
import { parseJson } from '../../src/parser/json/index.js';

describe('json parser', () => {
  it('parses a simple object', () => {
    const a = parseJson('@startjson\n{"a": 1, "b": "hi"}\n@endjson');
    expect(a.kind).toBe('json');
    expect(a.parseError).toBe('');
    expect(a.data).toEqual({ a: 1, b: 'hi' });
  });

  it('parses nested arrays and objects', () => {
    const a = parseJson('@startjson\n{"x": [1, 2, {"y": true}]}\n@endjson');
    expect(a.data).toEqual({ x: [1, 2, { y: true }] });
  });

  it('captures highlight paths', () => {
    const a = parseJson([
      '@startjson',
      '#highlight "services" / "1" / "routes" / "0"',
      '#highlight "metadata"',
      '{"services": []}',
      '@endjson',
    ].join('\n'));
    expect(a.highlights).toEqual([
      ['services', '1', 'routes', '0'],
      ['metadata'],
    ]);
  });

  it('records parse error for invalid JSON', () => {
    const a = parseJson('@startjson\n{ not json }\n@endjson');
    expect(a.parseError).not.toBe('');
    expect(a.data).toBeNull();
  });

  it('preserves null and booleans', () => {
    const a = parseJson('@startjson\n{"a": null, "b": true, "c": false}\n@endjson');
    expect(a.data).toEqual({ a: null, b: true, c: false });
  });

  it('parses a <style> block with class declarations and class-bound highlights', () => {
    const a = parseJson([
      '@startjson',
      '<style>',
      '.h1 { BackGroundColor green FontColor white FontStyle italic }',
      '.h2 { BackGroundColor red FontColor white FontStyle bold }',
      '</style>',
      '#highlight "lastName"',
      '#highlight "address" / "city" <<h1>>',
      '#highlight "phoneNumbers" / "0" / "number" <<h2>>',
      '{ "lastName": "Smith", "address": { "city": "NY" }, "phoneNumbers": [ { "number": "x" } ] }',
      '@endjson',
    ].join('\n'));
    expect(a.parseError).toBe('');
    // Class table: property keys lowercased; values verbatim.
    expect(a.styles.h1).toEqual({
      backgroundcolor: 'green',
      fontcolor: 'white',
      fontstyle: 'italic',
    });
    expect(a.styles.h2).toEqual({
      backgroundcolor: 'red',
      fontcolor: 'white',
      fontstyle: 'bold',
    });
    // Highlights: three entries, paths and matching classNames.
    expect(a.highlights).toEqual([
      ['lastName'],
      ['address', 'city'],
      ['phoneNumbers', '0', 'number'],
    ]);
    expect(a.highlightClassNames).toEqual([undefined, 'h1', 'h2']);
    // Body still parses.
    expect((a.data as { lastName: unknown }).lastName).toBe('Smith');
  });
});
