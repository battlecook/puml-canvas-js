import { describe, it, expect } from 'vitest';
import { parseYaml } from '../../src/parser/yaml/index.js';

describe('yaml parser', () => {
  it('parses plain mappings and sequences', () => {
    const ast = parseYaml(
      [
        '@startyaml',
        'name: omni',
        'count: 3',
        'enabled: true',
        'tags:',
        '  - a',
        '  - b',
        '@endyaml',
      ].join('\n'),
    );
    expect(ast.parseError).toBe('');
    expect(ast.data).toEqual({ name: 'omni', count: 3, enabled: true, tags: ['a', 'b'] });
  });

  it('preserves unquoted scalars that look like durations', () => {
    const ast = parseYaml('@startyaml\ntimeout: 5s\n@endyaml');
    expect((ast.data as { timeout: unknown }).timeout).toBe('5s');
  });

  it('parses quoted strings and unwraps escapes', () => {
    const ast = parseYaml('@startyaml\nx: "hello \\"world\\""\n@endyaml');
    expect((ast.data as { x: unknown }).x).toBe('hello "world"');
  });

  it('resolves anchors and aliases', () => {
    const ast = parseYaml(
      [
        '@startyaml',
        'defaults: &d',
        '  retries: 3',
        '  timeout: 5s',
        'prod:',
        '  conf: *d',
        '@endyaml',
      ].join('\n'),
    );
    expect(ast.parseError).toBe('');
    expect(ast.data).toEqual({
      defaults: { retries: 3, timeout: '5s' },
      prod: { conf: { retries: 3, timeout: '5s' } },
    });
  });

  it('applies <<: merge with explicit-key precedence', () => {
    const ast = parseYaml(
      [
        '@startyaml',
        'defaults: &d',
        '  retries: 3',
        '  timeout: 5s',
        'prod:',
        '  <<: *d',
        '  timeout: 10s',
        '@endyaml',
      ].join('\n'),
    );
    expect(ast.parseError).toBe('');
    const prod = (ast.data as { prod: Record<string, unknown> }).prod;
    expect(prod.retries).toBe(3);
    expect(prod.timeout).toBe('10s');
  });

  it('parses flow sequences and mappings inline', () => {
    const ast = parseYaml(
      [
        '@startyaml',
        'matrix:',
        '  - [a, b, c]',
        '  - {k: 1, m: 2}',
        '@endyaml',
      ].join('\n'),
    );
    expect(ast.parseError).toBe('');
    expect(ast.data).toEqual({
      matrix: [['a', 'b', 'c'], { k: 1, m: 2 }],
    });
  });

  it('captures #highlight paths separately from the document', () => {
    const ast = parseYaml(
      [
        '@startyaml',
        '#highlight "environments" / "prod"',
        'environments:',
        '  prod:',
        '    debug: false',
        '@endyaml',
      ].join('\n'),
    );
    expect(ast.highlights).toEqual([['environments', 'prod']]);
    expect((ast.data as Record<string, unknown>).environments).toBeTruthy();
  });

  it('treats inline # as a comment but leaves # inside quotes alone', () => {
    const ast = parseYaml(
      [
        '@startyaml',
        'a: 1   # trailing comment',
        'b: "value # with hash"',
        '@endyaml',
      ].join('\n'),
    );
    expect(ast.data).toEqual({ a: 1, b: 'value # with hash' });
  });

  it('parses the user-provided document end-to-end', () => {
    const ast = parseYaml(
      [
        '@startyaml',
        '#highlight "environments" / "prod"',
        'defaults: &defaults',
        '  retries: 3',
        '  timeout: 5s',
        '  headers:',
        '    X-Client: omni-viewer',
        '    X-Trace: "${trace_id}"',
        '',
        'environments:',
        '  dev:',
        '    <<: *defaults',
        '    endpoint: http://localhost:8080',
        '    debug: true',
        '  prod:',
        '    <<: *defaults',
        '    endpoint: https://api.example.com',
        '    debug: false',
        '    canary:',
        '      percent: 10',
        '      regions:',
        '        - us-east-1',
        '        - ap-northeast-2',
        '',
        'matrix:',
        '  - [puml, svg, success]',
        '  - [puml, png, fallback]',
        '  - [plantuml, txt, unsupported]',
        '@endyaml',
      ].join('\n'),
    );
    expect(ast.parseError).toBe('');
    expect(ast.highlights).toEqual([['environments', 'prod']]);
    const data = ast.data as Record<string, unknown>;
    const prod = (data.environments as Record<string, unknown>).prod as Record<string, unknown>;
    expect(prod.retries).toBe(3);
    expect(prod.endpoint).toBe('https://api.example.com');
    expect(prod.debug).toBe(false);
    const canary = prod.canary as Record<string, unknown>;
    expect(canary.percent).toBe(10);
    expect(canary.regions).toEqual(['us-east-1', 'ap-northeast-2']);
    expect(data.matrix).toEqual([
      ['puml', 'svg', 'success'],
      ['puml', 'png', 'fallback'],
      ['plantuml', 'txt', 'unsupported'],
    ]);
  });
});
