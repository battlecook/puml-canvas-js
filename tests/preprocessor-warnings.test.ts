import { describe, it, expect } from 'vitest';
import {
  detectUnsupportedDirectives,
  applyPreprocessorWarningBanner,
} from '../src/preprocessor-warnings.js';
import type { Scene } from '../src/scene/types.js';

const emptyScene: Scene = { width: 200, height: 100, background: '#fff', children: [] };

describe('detectUnsupportedDirectives', () => {
  it('returns [] for plain PUML with no preprocessor', () => {
    const src = '@startuml\nactor A\nA -> B\n@enduml';
    expect(detectUnsupportedDirectives(src)).toEqual([]);
  });

  it('detects !theme, !if, !procedure, !$var with stable ordering', () => {
    const src = [
      '@startuml',
      '!theme spacelab',
      '!$env = "prod"',
      '!procedure $svc($n)',
      '  component "$n" as $n',
      '!endprocedure',
      '!if ($env == "prod")',
      '  A --> B',
      '!endif',
      '@enduml',
    ].join('\n');
    expect(detectUnsupportedDirectives(src)).toEqual([
      '!theme', '!procedure', '!if', '!$var',
    ]);
  });

  it('groups !else/!endif under !if, !endprocedure under !procedure', () => {
    const src = '!if (x)\n  A\n!else\n  B\n!endif\n!procedure p()\n!endprocedure';
    expect(detectUnsupportedDirectives(src)).toEqual(['!procedure', '!if']);
  });

  it('detects !include, !define, !function', () => {
    const src = [
      '!include foo.puml',
      '!define X 1',
      '!function f() return 1',
      '!endfunction',
    ].join('\n');
    expect(detectUnsupportedDirectives(src)).toEqual([
      '!include', '!define', '!function',
    ]);
  });

  it('detects !pragma directives', () => {
    expect(detectUnsupportedDirectives('!pragma teoz true')).toEqual(['!pragma']);
    expect(detectUnsupportedDirectives('!pragma layout smetana')).toEqual(['!pragma']);
    const mixed = [
      '@startuml',
      '!pragma teoz true',
      '!include foo.puml',
      'A -> B',
      '@enduml',
    ].join('\n');
    expect(detectUnsupportedDirectives(mixed)).toEqual(['!include', '!pragma']);
  });

  it('ignores commented-out and inline ! occurrences', () => {
    expect(detectUnsupportedDirectives('A -> B : hello!\n')).toEqual([]);
    expect(detectUnsupportedDirectives("'!theme spacelab\n")).toEqual([]);
  });
});

describe('applyPreprocessorWarningBanner', () => {
  it('returns scene unchanged when no directives', () => {
    const out = applyPreprocessorWarningBanner(emptyScene, []);
    expect(out).toBe(emptyScene);
  });

  it('appends rect+text banner shapes when directives present', () => {
    const out = applyPreprocessorWarningBanner(emptyScene, ['!theme', '!if']);
    expect(out.children.length).toBe(2);
    expect(out.children[0]!.type).toBe('rect');
    expect(out.children[1]!.type).toBe('text');
    const txt = out.children[1] as { text: string };
    expect(txt.text).toBe('Preprocessor not supported: !theme, !if');
  });

  it('widens the scene if banner exceeds original width', () => {
    const narrow: Scene = { ...emptyScene, width: 50 };
    const out = applyPreprocessorWarningBanner(narrow, ['!theme']);
    expect(out.width).toBeGreaterThan(50);
  });

  it('anchors banner to top-right edge of the scene', () => {
    const wide: Scene = { ...emptyScene, width: 1000 };
    const out = applyPreprocessorWarningBanner(wide, ['!theme']);
    const rect = out.children[0] as { type: 'rect'; x: number; y: number; w: number };
    expect(rect.y).toBeLessThan(20);
    expect(rect.x + rect.w).toBeLessThanOrEqual(out.width);
    expect(rect.x).toBeGreaterThan(out.width / 2);
  });
});
