import { describe, it, expect } from 'vitest';
import { compile } from '../../src/index.js';
import type { Shape } from '../../src/scene/types.js';

interface Line { type: 'line'; x1: number; y1: number; x2: number; y2: number }
interface Rect { type: 'rect'; x: number; y: number; w: number; h: number }
interface Circle { type: 'circle'; cx: number; cy: number; r: number }
interface Text {
  type: 'text';
  x: number;
  y: number;
  text: string;
  font?: { size?: number; weight?: string; style?: string; color?: string };
}

function findShape<T extends Shape>(
  scene: { children: Shape[] },
  pred: (s: Shape) => s is T,
): T[] {
  return scene.children.filter(pred);
}

const isLine = (s: Shape): s is Line & Shape => s.type === 'line';
const isRect = (s: Shape): s is Rect & Shape => s.type === 'rect';
const isCircle = (s: Shape): s is Circle & Shape => s.type === 'circle';
const isText = (s: Shape): s is Text & Shape => s.type === 'text';

describe('nested container edge routing', () => {
  it('clips inter-container edges at the outermost ancestor, not the inner leaf', () => {
    // Apache → PostgreSQL: Apache lives inside "Web Server", PostgreSQL inside
    // "Database Server" (separate top-level containers). The edge should leave
    // Web Server's outer boundary and arrive at Database Server's outer
    // boundary, so the line never crosses any sibling box inside Web Server.
    const scene = compile(
      [
        '@startuml',
        '  node "Web Server" {',
        '    component Apache',
        '    artifact "config.yml" as Config',
        '  }',
        '  node "Database Server" {',
        '    [PostgreSQL]',
        '  }',
        '  Apache --> PostgreSQL',
        '  Apache --> Config',
        '@enduml',
      ].join('\n'),
    );

    const rects = findShape(scene, isRect);
    const webServer = rects.find((r) => r.w > 100 && r.h > 100 && r.y < 50);
    expect(webServer).toBeTruthy();
    const webBottom = webServer!.y + webServer!.h;

    const lines = findShape(scene, isLine);
    // The Apache→PostgreSQL edge crosses container boundaries; its tail must
    // sit exactly on Web Server's bottom edge.
    const crossingEdge = lines.find((l) => Math.abs(l.y1 - webBottom) < 0.5);
    expect(crossingEdge).toBeTruthy();
    // The Apache→Config edge is a sibling-only edge and must start at
    // Apache's bottom (inside Web Server), not at the container boundary.
    const internalEdge = lines.find((l) => l.y1 < webBottom - 10 && l.x1 === l.x2);
    expect(internalEdge).toBeTruthy();
  });

  it('spreads parallel edges declared between the same pair of nested nodes', () => {
    // Two arrows in the same direction between the same pair would otherwise
    // be drawn on top of each other.
    const scene = compile(
      [
        '@startuml',
        '  node "Web" {',
        '    [A]',
        '  }',
        '  node "DB" {',
        '    [B]',
        '  }',
        '  A --> B : write',
        '  A --> B : read',
        '@enduml',
      ].join('\n'),
    );
    const lines = findShape(scene, isLine).filter(
      (l) => l.x1 !== l.x2 || l.y1 !== l.y2,
    );
    const sorted = [...lines].sort(
      (a, b) =>
        Math.hypot(b.x2 - b.x1, b.y2 - b.y1) - Math.hypot(a.x2 - a.x1, a.y2 - a.y1),
    );
    expect(sorted.length).toBeGreaterThanOrEqual(2);
    const e1 = sorted[0]!;
    const e2 = sorted[1]!;
    const mid1x = (e1.x1 + e1.x2) / 2;
    const mid2x = (e2.x1 + e2.x2) / 2;
    expect(Math.abs(mid1x - mid2x)).toBeGreaterThan(1);
  });
});

describe('component diagram — interface shorthand + footer', () => {
  it('renders 4 interface circles, a component box, and a styled footer', () => {
    const scene = compile(
      [
        '@startuml',
        '() "First Interface"',
        '() "Another interface" as Interf2',
        'interface Interf3',
        'interface "Last\\ninterface" as Interf4',
        '[component]',
        'footer //Adding "component" to force diagram to be a **component diagram**//',
        '@enduml',
      ].join('\n'),
    );
    const circles = findShape(scene, isCircle);
    expect(circles.length).toBe(4);

    // The `[component]` box renders as a rectangle (one of several rects, since
    // interfaces don't render rects, but the `port` decorations do).
    const rects = findShape(scene, isRect);
    // Component box has w >= MIN_W (100); the port-rect decorations are 10x8.
    const compBox = rects.find((r) => r.w >= 100);
    expect(compBox).toBeTruthy();

    const texts = findShape(scene, isText);
    // Footer line sits below all node shapes — use the bottom of the component box.
    const footerSpans = texts.filter(
      (t) => t.font?.color === '#888' && t.y > compBox!.y + compBox!.h,
    );
    // Expect at least one italic span (the surrounding `//.../`) and one bold span.
    expect(footerSpans.some((t) => t.font?.style === 'italic')).toBe(true);
    expect(footerSpans.some((t) => t.font?.weight === 'bold')).toBe(true);
    // Footer text reconstructs the literal content with markup stripped.
    const footerText = footerSpans.map((t) => t.text).join('');
    expect(footerText).toContain('component diagram');

    // Multi-line interface label `Last\ninterface` renders as TWO baselines.
    const lastLines = texts.filter(
      (t) => t.text === 'Last' || t.text === 'interface',
    );
    expect(lastLines.length).toBeGreaterThanOrEqual(2);
  });
});

describe('component diagram — bracket display name + #Color', () => {
  it('renders a yellow component box for `component [Web Server] #Yellow`', () => {
    const scene = compile('@startuml\ncomponent [Web Server] #Yellow\n@enduml');
    const rects = findShape(scene, isRect);
    // The main component body fill should be `Yellow` (CSS color name).
    const yellowRect = rects.find((r) => {
      const fill = (r as { style?: { fill?: string } }).style?.fill;
      return fill === 'Yellow';
    });
    expect(yellowRect).toBeTruthy();
    expect((yellowRect as Rect).w).toBeGreaterThan(40);
    // The display name renders as the box label.
    const texts = findShape(scene, isText);
    expect(texts.some((t) => t.text === 'Web Server')).toBe(true);
  });
});

describe('deployment diagram — multi-line bracket label with separators', () => {
  it('renders 5 boxes (folder/node/database/usecase/card) with text rows + separators', () => {
    const scene = compile([
      '@startuml',
      'folder folder [ This is a <b>folder',
      '---- You can use separator',
      '==== of different kind',
      '.... and style',
      ']',
      'node node [ This is a <b>node',
      '---- You can use separator',
      '==== of different kind',
      '.... and style',
      ']',
      'database database [ This is a <b>database',
      '---- You can use separator',
      '==== of different kind',
      '.... and style',
      ']',
      'usecase usecase [ This is a <b>usecase',
      '---- You can use separator',
      '==== of different kind',
      '.... and style',
      ']',
      'card card [ This is a <b>card',
      '---- You can use separator',
      '==== of different kind',
      '.... and style',
      '<i><color:blue>(add from V1.2020.7)</color></i>',
      ']',
      '@enduml',
    ].join('\n'));

    // 5 box-bodies. Each kind contributes at least one closed shape: folder /
    // node = polygon body (node also adds a rect for the inner shadow box).
    // database emits path + ellipse. usecase + card emit rounded rects. We
    // just check the scene has at least 5 closed shapes (one per node) at
    // the top level so the layout produced a body per node.
    const closedShapes = scene.children.filter((s) =>
      s.type === 'rect' || s.type === 'polygon' || s.type === 'path' || s.type === 'ellipse',
    );
    expect(closedShapes.length).toBeGreaterThanOrEqual(5);

    // Each of the 5 nodes contributes multiple text rows. We expect at least
    // 5 rows with the literal `You can use separator` content (one per node).
    const texts = findShape(scene, isText);
    const sepRows = texts.filter((t) => t.text === 'You can use separator');
    expect(sepRows.length).toBe(5);
    // And the `card` extra trailing line surfaces somewhere.
    const cardExtra = texts.find((t) => t.text.includes('add from V1.2020.7'));
    expect(cardExtra).toBeTruthy();

    // Separator lines: at least 1 solid (strokeWidth 1, no dasharray), at
    // least 1 double (strokeWidth 2), at least 1 dotted (dasharray set) per
    // node. We just count overall across the whole scene.
    const labelLines = findShape(scene, isLine);
    type StyledLine = Line & { style?: { strokeWidth?: number; strokeDasharray?: string } };
    const solidSeps = (labelLines as StyledLine[]).filter(
      (l) => l.style?.strokeWidth === 1 && !l.style?.strokeDasharray,
    );
    const doubleSeps = (labelLines as StyledLine[]).filter(
      (l) => l.style?.strokeWidth === 2,
    );
    const dottedSeps = (labelLines as StyledLine[]).filter(
      (l) => !!l.style?.strokeDasharray,
    );
    expect(solidSeps.length).toBeGreaterThanOrEqual(5);
    expect(doubleSeps.length).toBeGreaterThanOrEqual(5);
    expect(dottedSeps.length).toBeGreaterThanOrEqual(5);
  });
});

describe('deployment diagram — 17 shape keywords + inline style + deep nesting', () => {
  it('renders agent / cloud / file / frame with inline styling and bracket body (Input A)', () => {
    const scene = compile([
      '@startuml',
      'agent a',
      'cloud c #pink;line:red;line.bold;text:red [ c cloud description ]',
      'file f #palegreen;line:green;line.dashed;text:green { [c1] [c2] }',
      'frame frame { node n #aliceblue;line:blue;line.dotted;text:blue }',
      '@enduml',
    ].join('\n'));
    // Cloud body fill is pink (inline `#pink` after kind+id). Search across
    // ellipses (top-level cloud) and paths (nested cloud) for the override.
    type WithStyle = { style?: { fill?: string; stroke?: string; strokeWidth?: number; strokeDasharray?: string } };
    const stylish = scene.children.filter((s): s is Shape & WithStyle =>
      s.type === 'ellipse' || s.type === 'path' || s.type === 'rect' ||
      s.type === 'polygon',
    ) as Array<Shape & WithStyle>;
    const pinks = stylish.filter((s) => s.style?.fill === 'pink');
    expect(pinks.length).toBeGreaterThanOrEqual(1);
    expect(pinks[0]!.style?.stroke).toBe('red');
    expect(pinks[0]!.style?.strokeWidth).toBe(2);
    // The cloud description label renders with red color.
    const texts = scene.children.filter((s): s is Shape & { type: 'text'; text: string; font?: { color?: string } } =>
      s.type === 'text',
    );
    const cloudLabel = texts.find((t) => t.text.includes('c cloud description'));
    expect(cloudLabel).toBeTruthy();
    expect(cloudLabel!.font?.color).toBe('red');
    // The file (artifact) has a dashed body. Look for a stroke-dasharray.
    const dashed = stylish.find((s) => s.style?.fill === 'palegreen');
    expect(dashed).toBeTruthy();
    expect(dashed!.style?.strokeDasharray).toBeTruthy();
    // The frame body produced at least one closed shape, and the nested node
    // inside it produced its own dotted-bordered shape.
    const dotted = stylish.find((s) => s.style?.fill === 'aliceblue');
    expect(dotted).toBeTruthy();
    expect(dotted!.style?.strokeDasharray).toBeTruthy();
  });

  it('renders every one of the 17 shape keywords (Input B)', () => {
    const scene = compile([
      '@startuml',
      'action action { }',
      'artifact artifact { }',
      'card card { }',
      'cloud cloud { }',
      'component component { }',
      'database database { }',
      'file file { }',
      'folder folder { }',
      'frame frame { }',
      'hexagon hexagon { }',
      'node node { }',
      'package package { }',
      'process process { }',
      'queue queue { }',
      'rectangle rectangle { }',
      'stack stack { }',
      'storage storage { }',
      '@enduml',
    ].join('\n'));
    // 17 shape names appear as label text in the scene (one per kind).
    const texts = scene.children.filter((s): s is Shape & { type: 'text'; text: string } => s.type === 'text');
    const expectedNames = [
      'action', 'artifact', 'card', 'cloud', 'component', 'database',
      'file', 'folder', 'frame', 'hexagon', 'node', 'package',
      'process', 'queue', 'rectangle', 'stack', 'storage',
    ];
    for (const name of expectedNames) {
      const hit = texts.find((t) => t.text === name);
      expect(hit, `missing label for ${name}`).toBeTruthy();
    }
  });

  it('renders deeply nested chains without crashing (Input F, 17 levels)', () => {
    const scene = compile([
      '@startuml',
      'action action { artifact artifact { card card { cloud cloud { component component { database database { file file { folder folder { frame frame { hexagon hexagon { node node { package package { process process { queue queue { rectangle rectangle { stack stack { storage storage { } } } } } } } } } } } } } } } } }',
      '@enduml',
    ].join('\n'));
    // The deepest scene must still produce a reasonable bounding box and
    // a non-trivial child count (every level emits frame + label shapes).
    expect(scene.width).toBeGreaterThan(0);
    expect(scene.height).toBeGreaterThan(0);
    expect(scene.children.length).toBeGreaterThanOrEqual(17);
  });
});
