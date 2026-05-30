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

describe('archimate node — `archimate #Layer "Name" as id <<stereo>>`', () => {
  it('renders 4 rectangles with the right fills and the layer-derived color', () => {
    const scene = compile([
      '@startuml',
      'archimate #Technology "VPN Server" as vpnServerA <<technology-device>>',
      'rectangle GO #lightgreen',
      'rectangle STOP #red',
      'rectangle WAIT #orange',
      '@enduml',
    ].join('\n'));
    const rects = findShape(scene, isRect);
    const fills = new Set(
      rects.map((r) => (r as { style?: { fill?: string } }).style?.fill),
    );
    // Technology layer → green pastel; bare #Color rectangles pass through.
    expect(fills.has('#C9E7B7')).toBe(true);
    expect(fills.has('lightgreen')).toBe(true);
    expect(fills.has('red')).toBe(true);
    expect(fills.has('orange')).toBe(true);
    // 4 boxes (one per declaration) plus optional port marks etc.
    expect(rects.length).toBeGreaterThanOrEqual(4);
    const texts = findShape(scene, isText);
    // The Archimate display name and the bare rectangle labels all render.
    expect(texts.some((t) => t.text === 'VPN Server')).toBe(true);
    expect(texts.some((t) => t.text === 'GO')).toBe(true);
    expect(texts.some((t) => t.text === 'STOP')).toBe(true);
    expect(texts.some((t) => t.text === 'WAIT')).toBe(true);
    // The stereotype renders in guillemets above the name.
    expect(texts.some((t) => t.text === '«technology-device»')).toBe(true);
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

  it('renders bracket-form component labels with `\\n` as two text rows (Bug A)', () => {
    // PlantUML expands `\n` escapes inside bracket display labels so the
    // component renders "Last" / "component" on two stacked rows. Before the
    // fix the label rendered as the literal `Last\ncomponent`.
    const scene = compile([
      '@startuml',
      '[First component]',
      '[Another component] as Comp2',
      'component Comp3',
      'component [Last\\ncomponent] as Comp4',
      '@enduml',
    ].join('\n'));
    const texts = findShape(scene, isText);
    // Both segments must be present as their own text shapes.
    const lastRow = texts.find((t) => t.text === 'Last');
    const componentRow = texts.find((t) => t.text === 'component');
    expect(lastRow, 'expected "Last" row').toBeTruthy();
    expect(componentRow, 'expected "component" row').toBeTruthy();
    // And the literal `Last\ncomponent` must NOT appear as a single label.
    const literal = texts.find((t) => t.text === 'Last\\ncomponent');
    expect(literal).toBeFalsy();
    // The two rows belong to the same node, so they share roughly the same x
    // and "component" sits below "Last".
    expect(Math.abs(lastRow!.x - componentRow!.x)).toBeLessThan(2);
    expect(componentRow!.y).toBeGreaterThan(lastRow!.y);
  });
});

describe('component layout — remove', () => {
  it('renders no component shapes when all components are removed', () => {
    // Mirrors the class-diagram `remove` layout test (Task #30) for the
    // component parser: every declaration is dropped by a matching `remove`
    // and the empty-diagram fallback emits no body shapes.
    const scene = compile([
      '@startuml',
      'component [$C1]',
      'component [$C2] $C2',
      'component [$C2] as dollarC2',
      'remove $C1',
      'remove $C2',
      'remove dollarC2',
      '@enduml',
    ].join('\n'));
    const rects = findShape(scene, isRect);
    expect(rects).toHaveLength(0);
  });
});

describe('component diagram — attached notes around a single component', () => {
  it('renders 4 folded-corner note shapes positioned around the component box', () => {
    // Failing input from Task #110: previously only the component box was
    // drawn and all four `note <side> of C` declarations silently dropped.
    const scene = compile([
      '@startuml',
      '[Component] as C',
      'note top of C: A top note',
      'note bottom of C',
      'A bottom note can also be on several lines',
      'end note',
      'note left of C',
      'A left note can also be on several lines',
      'end note',
      'note right of C: A right note',
      '@enduml',
    ].join('\n'));

    // 4 note polygons — folded-corner rectangles share the post-it fill
    // (#FEFFDD) and are distinct from the component box rectangle.
    interface Poly { type: 'polygon'; points: Array<[number, number]>; style?: { fill?: string } }
    const isPoly = (s: Shape): s is Poly & Shape => s.type === 'polygon';
    const notePolys = findShape(scene, isPoly).filter(
      (p) => p.style?.fill === '#FEFFDD',
    );
    expect(notePolys).toHaveLength(4);

    // The 4 dog-ear fold polylines (one per note) confirm `drawContainerNote`
    // emitted the correct two-shape pair for each.
    interface PolyLine { type: 'polyline'; points: Array<[number, number]>; style?: { stroke?: string } }
    const isPolyline = (s: Shape): s is PolyLine & Shape => s.type === 'polyline';
    const foldLines = findShape(scene, isPolyline).filter(
      (p) => p.points.length === 3 && p.style?.stroke === '#A0A088',
    );
    expect(foldLines).toHaveLength(4);

    // The component rectangle is the only large rect — its bbox lets us
    // verify each note's geometric side relative to the anchor.
    const componentRect = findShape(scene, isRect).find(
      (r) => r.w >= 100 && r.h >= 30,
    );
    expect(componentRect).toBeDefined();
    const compLeft = componentRect!.x;
    const compRight = componentRect!.x + componentRect!.w;
    const compTop = componentRect!.y;
    const compBottom = componentRect!.y + componentRect!.h;

    const bboxOf = (poly: Poly) => {
      const xs = poly.points.map((p) => p[0]);
      const ys = poly.points.map((p) => p[1]);
      return {
        minX: Math.min(...xs),
        maxX: Math.max(...xs),
        minY: Math.min(...ys),
        maxY: Math.max(...ys),
      };
    };

    // Anchor each rendered note to its body text by finding the closest text
    // shape whose anchor (start-left of the text) sits inside the polygon
    // bbox. Then verify the polygon is on the expected side of the component.
    const texts = findShape(scene, isText);
    const findNoteFor = (bodyFragment: string): Poly => {
      const t = texts.find((tt) => tt.text === bodyFragment);
      expect(t).toBeDefined();
      const poly = notePolys.find((p) => {
        const b = bboxOf(p);
        return t!.x >= b.minX && t!.x <= b.maxX && t!.y >= b.minY && t!.y <= b.maxY;
      });
      expect(poly).toBeDefined();
      return poly!;
    };

    const topPoly = findNoteFor('A top note');
    const rightPoly = findNoteFor('A right note');
    // Multi-line bodies wrap on word boundaries — pick the first line.
    const bottomPoly = findNoteFor('A bottom note can also be');
    const leftPoly = findNoteFor('A left note can also be');

    // `top` sits above the component, `bottom` below, `left` to the left,
    // `right` to the right.
    expect(bboxOf(topPoly).maxY).toBeLessThanOrEqual(compTop);
    expect(bboxOf(bottomPoly).minY).toBeGreaterThanOrEqual(compBottom);
    expect(bboxOf(leftPoly).maxX).toBeLessThanOrEqual(compLeft);
    expect(bboxOf(rightPoly).minX).toBeGreaterThanOrEqual(compRight);
  });
});

describe('component diagram — free-standing `note as N` (Bug A)', () => {
  it('renders a folded-corner note and a dashed link from C to N', () => {
    const scene = compile([
      '@startuml',
      '[Component] as C',
      'note as N',
      'A floating note can also be on several lines',
      'end note',
      'C .. N',
      '@enduml',
    ].join('\n'));
    // The note fill (#FEFFDD) is unique to the note shape; one polygon =
    // one note rendered.
    interface Poly { type: 'polygon'; points: Array<[number, number]>; style?: { fill?: string } }
    const isPoly = (s: Shape): s is Poly & Shape => s.type === 'polygon';
    const noteShapes = findShape(scene, isPoly).filter(
      (p) => p.style?.fill === '#FEFFDD',
    );
    expect(noteShapes).toHaveLength(1);
    // A dashed line in the scene confirms the `..` link reached the note.
    const dashed = findShape(scene, isLine).filter(
      (l) => (l as { style?: { strokeDasharray?: string } }).style?.strokeDasharray,
    );
    expect(dashed.length).toBeGreaterThanOrEqual(1);
    // Note body text is rendered.
    const texts = findShape(scene, isText);
    expect(texts.some((t) => t.text.includes('floating note'))).toBe(true);
  });
});

describe('component diagram — auto interface from bare endpoint (Bug B)', () => {
  it('renders Interface1/Interface2 as lollipop circles (not component boxes)', () => {
    const scene = compile([
      '@startuml',
      '[Component] --> Interface1',
      '[Component] -> Interface2',
      '@enduml',
    ].join('\n'));
    // Two interfaces → two small circles. The component box is a rect.
    const circles = findShape(scene, isCircle);
    expect(circles.length).toBeGreaterThanOrEqual(2);
    // The component rectangle is the only sizable rect (port marks are tiny).
    const rects = findShape(scene, isRect);
    const compBox = rects.find((r) => r.w >= 80 && r.h >= 30);
    expect(compBox).toBeDefined();
    // Interface labels render next to their circles.
    const texts = findShape(scene, isText);
    expect(texts.some((t) => t.text === 'Interface1')).toBe(true);
    expect(texts.some((t) => t.text === 'Interface2')).toBe(true);
    // `[Component]` bracket label is stripped (Bug B1) — `Component` shows,
    // not `[Component]`.
    expect(texts.some((t) => t.text === 'Component')).toBe(true);
    expect(texts.every((t) => !t.text.startsWith('['))).toBe(true);
  });
});

describe('component diagram — bracketed declarations stay inside containers (Bug C)', () => {
  it('places [First Component] inside the "Some Group" package box', () => {
    const scene = compile([
      '@startuml',
      'package "Some Group" {',
      'HTTP - [First Component]',
      '[Another Component]',
      '}',
      'node "Other Groups" {',
      'FTP - [Second Component]',
      '[First Component] --> FTP',
      '}',
      '@enduml',
    ].join('\n'));
    const texts = findShape(scene, isText);
    // Container shapes (package, node) render as polygons (folder / node
    // silhouettes). Use their point bounding box as the container region.
    interface Poly { type: 'polygon'; points: Array<[number, number]> }
    const isPoly = (s: Shape): s is Poly & Shape => s.type === 'polygon';
    const polys = findShape(scene, isPoly);
    const bboxOf = (p: Poly) => {
      const xs = p.points.map((pt) => pt[0]);
      const ys = p.points.map((pt) => pt[1]);
      return {
        x: Math.min(...xs),
        y: Math.min(...ys),
        w: Math.max(...xs) - Math.min(...xs),
        h: Math.max(...ys) - Math.min(...ys),
      };
    };
    const findContainerBox = (labelText: string) => {
      const label = texts.find((t) => t.text === labelText);
      expect(label).toBeDefined();
      const candidates = polys
        .map(bboxOf)
        .filter(
          (b) =>
            label!.x >= b.x &&
            label!.x <= b.x + b.w &&
            label!.y >= b.y &&
            label!.y <= b.y + b.h &&
            b.w > 100,
        )
        .sort((a, b) => b.w * b.h - a.w * a.h);
      expect(candidates.length).toBeGreaterThan(0);
      return candidates[0]!;
    };
    const someGroupBox = findContainerBox('Some Group');
    const otherGroupsBox = findContainerBox('Other Groups');
    // The "First Component" and "Another Component" labels must sit inside
    // the "Some Group" box.
    for (const name of ['First Component', 'Another Component']) {
      const t = texts.find((tt) => tt.text === name);
      expect(t).toBeDefined();
      expect(t!.x).toBeGreaterThanOrEqual(someGroupBox.x);
      expect(t!.x).toBeLessThanOrEqual(someGroupBox.x + someGroupBox.w);
      expect(t!.y).toBeGreaterThanOrEqual(someGroupBox.y);
      expect(t!.y).toBeLessThanOrEqual(someGroupBox.y + someGroupBox.h);
    }
    // "Second Component" sits inside "Other Groups".
    const second = texts.find((t) => t.text === 'Second Component');
    expect(second).toBeDefined();
    expect(second!.x).toBeGreaterThanOrEqual(otherGroupsBox.x);
    expect(second!.x).toBeLessThanOrEqual(otherGroupsBox.x + otherGroupsBox.w);
    expect(second!.y).toBeGreaterThanOrEqual(otherGroupsBox.y);
    expect(second!.y).toBeLessThanOrEqual(otherGroupsBox.y + otherGroupsBox.h);
  });
});
