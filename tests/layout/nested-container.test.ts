import { describe, it, expect } from 'vitest';
import { compile } from '../../src/index.js';
import type { Shape } from '../../src/scene/types.js';

interface Line { type: 'line'; x1: number; y1: number; x2: number; y2: number }
interface Rect { type: 'rect'; x: number; y: number; w: number; h: number }

function findShape<T extends Shape>(
  scene: { children: Shape[] },
  pred: (s: Shape) => s is T,
): T[] {
  return scene.children.filter(pred);
}

const isLine = (s: Shape): s is Line & Shape => s.type === 'line';
const isRect = (s: Shape): s is Rect & Shape => s.type === 'rect';

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
