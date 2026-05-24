import { describe, it, expect } from 'vitest';
import { compile, parseToAst } from '../../src/index.js';

const DEEP = `@startjson
#highlight "services" / "1" / "routes" / "0"
{
  "version": "2026.05",
  "services": [
    {
      "name": "viewer-api",
      "ports": [443, 8443],
      "features": {
        "plantuml": true,
        "mermaid": true,
        "maxUploadMb": 128
      }
    },
    {
      "name": "router",
      "routes": [
        {
          "match": {
            "extension": [".puml", ".plantuml"],
            "mime": "text/x-plantuml"
          },
          "target": "plantuml-viewer",
          "priority": 20
        }
      ]
    }
  ],
  "limits": null,
  "metadata": {
    "unicode": "한글 PlantUML 샘플",
    "escaped": "line1\\nline2\\tTabbed"
  }
}
@endjson`;

describe('json deep schema (user repro)', () => {
  it('parses without error', () => {
    const ast = parseToAst(DEEP);
    expect(ast.kind).toBe('json');
    if (ast.kind === 'json') {
      expect(ast.parseError).toBe('');
      const data = ast.data as Record<string, unknown>;
      expect(data['version']).toBe('2026.05');
      expect(Array.isArray(data['services'])).toBe(true);
      expect(data['limits']).toBeNull();
    }
  });

  it('captures the highlight path', () => {
    const ast = parseToAst(DEEP);
    if (ast.kind !== 'json') throw new Error('expected json');
    expect(ast.highlights).toEqual([['services', '1', 'routes', '0']]);
  });

  it('preserves unicode and escapes', () => {
    const ast = parseToAst(DEEP);
    if (ast.kind !== 'json') throw new Error('expected json');
    const data = ast.data as { metadata: Record<string, string> };
    expect(data.metadata['unicode']).toBe('한글 PlantUML 샘플');
    expect(data.metadata['escaped']).toContain('line1');
    expect(data.metadata['escaped']).toContain('line2');
  });

  it('renders to a multi-row nested table scene', () => {
    const scene = compile(DEEP);
    expect(scene.width).toBeGreaterThan(300);
    expect(scene.height).toBeGreaterThan(200);
    const rects = scene.children.filter((s) => s.type === 'rect').length;
    expect(rects).toBeGreaterThan(15);
  });
});
