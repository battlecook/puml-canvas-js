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
