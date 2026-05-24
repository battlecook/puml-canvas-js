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
});
