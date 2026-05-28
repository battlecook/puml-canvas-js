import { describe, it, expect } from 'vitest';
import { compile } from '../../src/index.js';
import type { Shape } from '../../src/scene/types.js';

interface Rect { type: 'rect'; x: number; y: number; w: number; h: number }
interface Text {
  type: 'text';
  x: number;
  y: number;
  text: string;
  font?: { size?: number; weight?: string; style?: string; color?: string };
}

const isRect = (s: Shape): s is Rect & Shape => s.type === 'rect';
const isText = (s: Shape): s is Text & Shape => s.type === 'text';

describe('object diagram — map block', () => {
  it('renders a bare `map Name { … }` as a rect + header + key/value text rows', () => {
    const scene = compile([
      '@startuml',
      'map CapitalCity {',
      '  UK => London',
      '  USA => Washington',
      '  Germany => Berlin',
      '}',
      '@enduml',
    ].join('\n'));
    const rects = scene.children.filter(isRect);
    expect(rects).toHaveLength(1);

    const texts = scene.children.filter(isText);
    const texts_by_text = texts.map((t) => t.text);
    expect(texts_by_text).toContain('CapitalCity');
    // Each entry contributes a key cell and a value cell.
    expect(texts_by_text).toContain('UK');
    expect(texts_by_text).toContain('London');
    expect(texts_by_text).toContain('USA');
    expect(texts_by_text).toContain('Washington');
    expect(texts_by_text).toContain('Germany');
    expect(texts_by_text).toContain('Berlin');
  });

  it('keeps angle brackets in the display name as literal text', () => {
    const scene = compile([
      '@startuml',
      'map "map: Map<Integer, String>" as users {',
      '  1 => Alice',
      '  2 => Bob',
      '}',
      '@enduml',
    ].join('\n'));
    const texts = scene.children.filter(isText).map((t) => t.text);
    expect(texts).toContain('map: Map<Integer, String>');
  });
});
