import { describe, it, expect } from 'vitest';
import { compile } from '../../src/index.js';

describe('class layout', () => {
  it('renders a box per class', () => {
    const scene = compile('@startuml\nclass A\nclass B\nclass C\n@enduml');
    const rects = scene.children.filter((s) => s.type === 'rect');
    expect(rects.length).toBeGreaterThanOrEqual(3);
  });

  it('produces a wider box for long member text', () => {
    const small = compile('@startuml\nclass A\n@enduml');
    const big = compile('@startuml\nclass A {\n  +superLongFieldNameThatShouldWiden: string\n}\n@enduml');
    expect(big.width).toBeGreaterThan(small.width);
  });

  it('renders the title above the diagram', () => {
    const scene = compile('@startuml\ntitle Schema\nclass A\n@enduml');
    const texts = scene.children.filter((s) => s.type === 'text').map((s) => (s as { text: string }).text);
    expect(texts).toContain('Schema');
  });

  it('shows «interface» stereotype line for interfaces', () => {
    const scene = compile('@startuml\ninterface I\n@enduml');
    const texts = scene.children.filter((s) => s.type === 'text').map((s) => (s as { text: string }).text);
    expect(texts).toContain('«interface»');
  });

  it('handles empty class diagram gracefully', () => {
    const scene = compile('@startuml\n@enduml');
    expect(scene.width).toBeGreaterThan(0);
  });
});

describe('class compact-badge mode', () => {
  it('switches to compact badge for empty classes when `hide empty members` is set', () => {
    const scene = compile(
      [
        '@startuml',
        'hide empty members',
        'class A',
        'interface B',
        'enum C',
        '@enduml',
      ].join('\n'),
    );
    // Compact mode draws colored circle badges. Verify presence of three.
    const circles = scene.children.filter((s) => s.type === 'circle');
    expect(circles.length).toBeGreaterThanOrEqual(3);
    const texts = scene.children
      .filter((s) => s.type === 'text')
      .map((s) => (s as { text: string }).text);
    // Badge letters per kind
    expect(texts).toContain('C');
    expect(texts).toContain('I');
    expect(texts).toContain('E');
    // No «interface» stereotype label — compact mode omits it
    expect(texts).not.toContain('«interface»');
  });

  it('keeps the box layout when a class has members, even with hide empty members', () => {
    const scene = compile(
      [
        '@startuml',
        'hide empty members',
        'class WithFields {',
        '  +id: int',
        '}',
        '@enduml',
      ].join('\n'),
    );
    const texts = scene.children
      .filter((s) => s.type === 'text')
      .map((s) => (s as { text: string }).text);
    expect(texts).toContain('+id: int');
    // Should be no compact badge letter for this class — only the box.
    // No solid filled circles (badges use opaque fill colors).
    const badgeCircles = scene.children.filter(
      (s) =>
        s.type === 'circle' &&
        (s as { style: { fill?: string } }).style.fill !== '#fff' &&
        (s as { style: { fill?: string } }).style.fill !== 'none',
    );
    expect(badgeCircles.length).toBe(0);
  });

  it('uses the stereotype first letter for the badge when set', () => {
    const scene = compile(
      [
        '@startuml',
        'hide empty members',
        'class svc <<Service>>',
        '@enduml',
      ].join('\n'),
    );
    const texts = scene.children
      .filter((s) => s.type === 'text')
      .map((s) => (s as { text: string }).text);
    expect(texts).toContain('S');
    expect(texts).toContain('«Service»');
  });

  it('ignores hide empty members when classes have members (box mode unchanged)', () => {
    const compact = compile(
      '@startuml\nhide empty members\nclass A { +x: int }\n@enduml',
    );
    const verbose = compile('@startuml\nclass A { +x: int }\n@enduml');
    expect(compact.width).toBe(verbose.width);
    expect(compact.height).toBe(verbose.height);
  });

  it('draws a filled triangle next to a label that has a direction marker', () => {
    const withDir = compile('@startuml\nA - B : drives >\n@enduml');
    const noDir = compile('@startuml\nA - B : drives\n@enduml');
    const triangles = withDir.children.filter(
      (s) =>
        s.type === 'polygon' &&
        (s as { style: { fill?: string } }).style.fill === '#000',
    );
    const noTriangles = noDir.children.filter(
      (s) =>
        s.type === 'polygon' &&
        (s as { style: { fill?: string } }).style.fill === '#000',
    );
    expect(triangles.length).toBeGreaterThan(noTriangles.length);
  });

  it('renders the user Car case — all 4 boxes + 3 labels appear', () => {
    const scene = compile(
      [
        '@startuml',
        'class Car',
        'Driver - Car : drives >',
        'Car *- Wheel : have 4 >',
        'Car -- Person : < owns',
        '@enduml',
      ].join('\n'),
    );
    const texts = scene.children
      .filter((s) => s.type === 'text')
      .map((s) => (s as { text: string }).text);
    for (const id of ['Car', 'Driver', 'Wheel', 'Person']) {
      expect(texts).toContain(id);
    }
    for (const lbl of ['drives', 'have 4', 'owns']) {
      expect(texts).toContain(lbl);
    }
    // `<` and `>` were directional markers, not text content
    expect(texts).not.toContain('drives >');
    expect(texts).not.toContain('< owns');
  });
});

describe('class layout — direction', () => {
  it('renders class diagram with directional arrows (TB default)', () => {
    const scene = compile([
      '@startuml',
      'foo -left-> dummyLeft',
      'foo -right-> dummyRight',
      'foo -up-> dummyUp',
      'foo -down-> dummyDown',
      '@enduml',
    ].join('\n'));
    // Five auto-registered classes → five class boxes.
    const rects = scene.children.filter((s) => s.type === 'rect');
    expect(rects.length).toBeGreaterThanOrEqual(5);
    const texts = scene.children
      .filter((s) => s.type === 'text')
      .map((s) => (s as { text: string }).text);
    for (const id of ['foo', 'dummyLeft', 'dummyRight', 'dummyUp', 'dummyDown']) {
      expect(texts).toContain(id);
    }
  });

  it('swaps layout axes for `left to right direction`', () => {
    // One source with three sinks: TB stacks the sinks horizontally (wider page,
    // shorter height); LR stacks them vertically (narrower page, taller height).
    // Verifying the swap is enough — exact pixel counts depend on font metrics.
    const tb = compile([
      '@startuml',
      'foo -down-> sink1',
      'foo -down-> sink2',
      'foo -down-> sink3',
      '@enduml',
    ].join('\n'));
    const lr = compile([
      '@startuml',
      'left to right direction',
      'foo -down-> sink1',
      'foo -down-> sink2',
      'foo -down-> sink3',
      '@enduml',
    ].join('\n'));
    expect(tb.width).toBeGreaterThan(lr.width);
    expect(lr.height).toBeGreaterThan(tb.height);
  });
});

describe('class layout — visibility prefix', () => {
  it('draws the visibility glyph in the header corner', () => {
    const scene = compile([
      '@startuml',
      '-class Private',
      '#class Protected',
      '~class Package',
      '+class Public',
      '@enduml',
    ].join('\n'));
    const texts = scene.children
      .filter((s) => s.type === 'text')
      .map((s) => (s as { text: string }).text);
    // Each visibility glyph appears as a separate text shape in addition to
    // the class name.
    expect(texts).toContain('-');
    expect(texts).toContain('#');
    expect(texts).toContain('~');
    expect(texts).toContain('+');
  });
});

describe('class layout — inline extends/implements', () => {
  it('renders two hollow-triangle arrows for inline implements + extends', () => {
    const scene = compile(
      [
        '@startuml',
        'class ArrayList implements List',
        'class ArrayList extends AbstractList',
        '@enduml',
      ].join('\n'),
    );
    // Hollow triangle = polygon with white fill (per markers.ts).
    const hollowTriangles = scene.children.filter(
      (s) =>
        s.type === 'polygon' &&
        Array.isArray((s as { points: number[][] }).points) &&
        (s as { points: number[][] }).points.length === 3 &&
        (s as { style: { fill?: string } }).style.fill === '#fff',
    );
    expect(hollowTriangles.length).toBe(2);
  });

  it('renders two hollow-triangle arrows for comma-separated extends list', () => {
    const scene = compile(
      [
        '@startuml',
        'class A extends B, C {',
        '}',
        '@enduml',
      ].join('\n'),
    );
    const hollowTriangles = scene.children.filter(
      (s) =>
        s.type === 'polygon' &&
        (s as { points: number[][] }).points.length === 3 &&
        (s as { style: { fill?: string } }).style.fill === '#fff',
    );
    expect(hollowTriangles.length).toBe(2);
  });
});

describe('class layout — inline #style block', () => {
  function classRect(src: string) {
    const scene = compile(src);
    // The class box is the rect with the largest area.
    let best: { area: number; rect: { style: { fill?: string; stroke?: string; strokeWidth?: number; strokeDasharray?: string } } } | null = null;
    for (const s of scene.children) {
      if (s.type !== 'rect') continue;
      const r = s as { w: number; h: number; style: { fill?: string; stroke?: string; strokeWidth?: number; strokeDasharray?: string } };
      const area = r.w * r.h;
      if (!best || area > best.area) best = { area, rect: r };
    }
    return best!.rect;
  }

  it('honors `back:<color>` and `line:<color>`', () => {
    const r = classRect('@startuml\nclass bar #line:green;back:lightblue\n@enduml');
    expect(r.style.fill).toBe('lightblue');
    expect(r.style.stroke).toBe('green');
  });

  it('honors normalized hex border color', () => {
    const r = classRect('@startuml\nclass Foo1 #back:red;line:00FFFF\n@enduml');
    expect(r.style.fill).toBe('red');
    expect(r.style.stroke).toBe('#00FFFF');
  });

  it('honors `line.dashed` with a dasharray', () => {
    const r = classRect('@startuml\nclass FooDashed #line.dashed:blue\n@enduml');
    expect(r.style.strokeDasharray).toBe('4,2');
    expect(r.style.stroke).toBe('blue');
  });

  it('honors `line.dotted` with a dotted dasharray', () => {
    const r = classRect('@startuml\nclass FooDotted #line.dotted:blue\n@enduml');
    expect(r.style.strokeDasharray).toBe('2,3');
  });

  it('honors `line.bold` with a thicker stroke', () => {
    const r = classRect('@startuml\nclass FooBold #line.bold\n@enduml');
    expect(r.style.strokeWidth).toBe(2);
  });

  it('renders a header strip when `header:<color>` is given', () => {
    const scene = compile('@startuml\nclass Demo1 #header:blue/red\n@enduml');
    const blueRect = scene.children.find(
      (s) =>
        s.type === 'rect' &&
        (s as { style: { fill?: string } }).style.fill === 'blue',
    );
    expect(blueRect).toBeDefined();
  });
});

describe('class layout — remove', () => {
  it('renders no class shapes when all classes are removed', () => {
    const scene = compile([
      '@startuml',
      'class $C1',
      'class $C2',
      '$C2 class "$C2" as dollarC2',
      'remove $C1',
      'remove $C2',
      'remove dollarC2',
      '@enduml',
    ].join('\n'));
    // Empty-diagram fallback emits a single placeholder text and no class rects.
    const rects = scene.children.filter((s) => s.type === 'rect');
    expect(rects).toHaveLength(0);
  });
});
