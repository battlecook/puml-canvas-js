import { describe, it, expect } from 'vitest';
import { compile } from '../../src/index.js';
import type { RectShape, Shape, TextShape } from '../../src/scene/types.js';

const STYLED = `@startuml
state s1 : s1 description
state s2 #pink;line:red;line.bold;text:red : s2 description
state s3 #palegreen;line:green;line.dashed;text:green : s3 description
state s4 #aliceblue;line:blue;line.dotted;text:blue : s4 description
@enduml`;

function rects(shapes: Shape[]): RectShape[] {
  return shapes.filter((s): s is RectShape => s.type === 'rect');
}

function texts(shapes: Shape[]): TextShape[] {
  return shapes.filter((s): s is TextShape => s.type === 'text');
}

describe('state layout — inline style suffix', () => {
  it('renders 4 rounded rects with per-state fill, stroke, and stroke style', () => {
    const scene = compile(STYLED);
    const rs = rects(scene.children);
    // 4 state rects, all rounded.
    expect(rs.length).toBe(4);
    for (const r of rs) {
      expect(r.rx).toBeGreaterThan(0);
      expect(r.ry).toBeGreaterThan(0);
    }

    // s1 — default fill, no stroke override.
    const s1Rect = rs[0]!;
    expect(s1Rect.style?.strokeDasharray).toBeUndefined();
    expect(s1Rect.style?.strokeWidth).toBe(1);

    // s2 — pink fill, red stroke, bold (strokeWidth=2).
    const s2Rect = rs[1]!;
    expect(s2Rect.style?.fill).toBe('pink');
    expect(s2Rect.style?.stroke).toBe('red');
    expect(s2Rect.style?.strokeWidth).toBe(2);
    expect(s2Rect.style?.strokeDasharray).toBeUndefined();

    // s3 — palegreen fill, green stroke, dashed.
    const s3Rect = rs[2]!;
    expect(s3Rect.style?.fill).toBe('palegreen');
    expect(s3Rect.style?.stroke).toBe('green');
    expect(s3Rect.style?.strokeDasharray).toBe('4,2');

    // s4 — aliceblue fill, blue stroke, dotted.
    const s4Rect = rs[3]!;
    expect(s4Rect.style?.fill).toBe('aliceblue');
    expect(s4Rect.style?.stroke).toBe('blue');
    expect(s4Rect.style?.strokeDasharray).toBe('2,3');
  });

  it('applies textColor to the name and description text', () => {
    const scene = compile(STYLED);
    const ts = texts(scene.children).map((t) => ({ text: t.text, color: t.font?.color }));
    expect(ts).toEqual(
      expect.arrayContaining([
        { text: 's2', color: 'red' },
        { text: 's2 description', color: 'red' },
        { text: 's3', color: 'green' },
        { text: 's3 description', color: 'green' },
        { text: 's4', color: 'blue' },
        { text: 's4 description', color: 'blue' },
      ]),
    );
    // s1 description renders with default color.
    const s1Desc = ts.find((t) => t.text === 's1 description');
    expect(s1Desc?.color).toBe('#000');
  });
});
