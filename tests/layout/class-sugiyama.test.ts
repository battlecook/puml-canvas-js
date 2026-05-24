import { describe, it, expect } from 'vitest';
import {
  assignLayers,
  buildLayoutEdges,
  countCrossings,
  groupByLayer,
  insertDummies,
  minimizeCrossings,
  removeCycles,
} from '../../src/layout/class/sugiyama.js';
import { parseClass } from '../../src/parser/class/index.js';

describe('sugiyama — buildLayoutEdges', () => {
  it('orients inheritance with parent on the "above" side', () => {
    const ast = parseClass('@startuml\nParent <|-- Child\n@enduml');
    const edges = buildLayoutEdges(ast.relationships);
    expect(edges[0]).toMatchObject({ from: 'Parent', to: 'Child', reversed: false });
  });

  it('orients --|> with parent on the "above" side', () => {
    const ast = parseClass('@startuml\nChild --|> Parent\n@enduml');
    const edges = buildLayoutEdges(ast.relationships);
    expect(edges[0]).toMatchObject({ from: 'Parent', to: 'Child' });
  });

  it('puts source above for `A --> B`', () => {
    const ast = parseClass('@startuml\nA --> B\n@enduml');
    const edges = buildLayoutEdges(ast.relationships);
    expect(edges[0]).toMatchObject({ from: 'A', to: 'B' });
  });

  it('puts composer/aggregator above', () => {
    const c = parseClass('@startuml\nWhole *-- Part\n@enduml');
    const a = parseClass('@startuml\nGroup o-- Member\n@enduml');
    expect(buildLayoutEdges(c.relationships)[0]).toMatchObject({ from: 'Whole', to: 'Part' });
    expect(buildLayoutEdges(a.relationships)[0]).toMatchObject({ from: 'Group', to: 'Member' });
  });
});

describe('sugiyama — removeCycles', () => {
  it('leaves acyclic graph unchanged', () => {
    const ast = parseClass('@startuml\nA --> B\nB --> C\n@enduml');
    const edges = buildLayoutEdges(ast.relationships);
    removeCycles(['A', 'B', 'C'], edges);
    expect(edges.every((e) => !e.reversed)).toBe(true);
  });

  it('reverses one edge of a 2-cycle', () => {
    const ast = parseClass('@startuml\nA --> B\nB --> A\n@enduml');
    const edges = buildLayoutEdges(ast.relationships);
    removeCycles(['A', 'B'], edges);
    expect(edges.filter((e) => e.reversed)).toHaveLength(1);
  });

  it('breaks a 3-cycle by reversing one edge', () => {
    const ast = parseClass('@startuml\nA --> B\nB --> C\nC --> A\n@enduml');
    const edges = buildLayoutEdges(ast.relationships);
    removeCycles(['A', 'B', 'C'], edges);
    expect(edges.filter((e) => e.reversed)).toHaveLength(1);
  });
});

describe('sugiyama — assignLayers', () => {
  it('assigns layer 0 to nodes with no incoming edges (after orienting)', () => {
    const ast = parseClass('@startuml\nParent <|-- Child\n@enduml');
    const edges = buildLayoutEdges(ast.relationships);
    const layers = assignLayers(['Parent', 'Child'], edges);
    expect(layers.get('Parent')).toBe(0);
    expect(layers.get('Child')).toBe(1);
  });

  it('chains form increasing layers', () => {
    const ast = parseClass('@startuml\nA --> B\nB --> C\nC --> D\n@enduml');
    const edges = buildLayoutEdges(ast.relationships);
    const layers = assignLayers(['A', 'B', 'C', 'D'], edges);
    expect([layers.get('A'), layers.get('B'), layers.get('C'), layers.get('D')]).toEqual([0, 1, 2, 3]);
  });

  it('puts isolated nodes at layer 0', () => {
    const ast = parseClass('@startuml\nclass A\nclass B\n@enduml');
    const edges = buildLayoutEdges(ast.relationships);
    const layers = assignLayers(['A', 'B'], edges);
    expect(layers.get('A')).toBe(0);
    expect(layers.get('B')).toBe(0);
  });
});

describe('sugiyama — insertDummies', () => {
  it('does nothing for adjacent-layer edges', () => {
    const ast = parseClass('@startuml\nA --> B\n@enduml');
    const edges = buildLayoutEdges(ast.relationships);
    const layers = assignLayers(['A', 'B'], edges);
    const r = insertDummies(['A', 'B'], edges, layers);
    expect(r.dummyIds.size).toBe(0);
    expect(r.drawable[0]?.waypoints).toEqual([]);
  });

  it('inserts a dummy node when edge spans two layers', () => {
    const ast = parseClass('@startuml\nA --> B\nB --> C\nA --> C\n@enduml');
    const edges = buildLayoutEdges(ast.relationships);
    const layers = assignLayers(['A', 'B', 'C'], edges);
    const r = insertDummies(['A', 'B', 'C'], edges, layers);
    const longEdge = r.drawable.find((d) => d.fromId === 'A' && d.toId === 'C');
    expect(longEdge?.waypoints).toHaveLength(1);
    expect(r.dummyIds.size).toBe(1);
  });

  it('preserves layer assignment for dummies', () => {
    const ast = parseClass('@startuml\nA --> B\nB --> C\nA --> C\n@enduml');
    const edges = buildLayoutEdges(ast.relationships);
    const layers = assignLayers(['A', 'B', 'C'], edges);
    const r = insertDummies(['A', 'B', 'C'], edges, layers);
    for (const id of r.dummyIds) {
      expect(r.layers.get(id)).toBe(1);
    }
  });
});

describe('sugiyama — crossing minimization', () => {
  it('counts zero crossings for non-interleaved edges', () => {
    const layers = [
      ['a', 'b'],
      ['c', 'd'],
    ];
    const segs = [
      { from: 'a', to: 'c', parentEdgeIdx: 0 },
      { from: 'b', to: 'd', parentEdgeIdx: 1 },
    ];
    expect(countCrossings(layers, segs)).toBe(0);
  });

  it('detects a crossing when edges interleave', () => {
    const layers = [
      ['a', 'b'],
      ['c', 'd'],
    ];
    const segs = [
      { from: 'a', to: 'd', parentEdgeIdx: 0 },
      { from: 'b', to: 'c', parentEdgeIdx: 1 },
    ];
    expect(countCrossings(layers, segs)).toBe(1);
  });

  it('reorders to remove crossings via barycenter', () => {
    const layers = [
      ['a', 'b'],
      ['d', 'c'],
    ];
    const segs = [
      { from: 'a', to: 'c', parentEdgeIdx: 0 },
      { from: 'b', to: 'd', parentEdgeIdx: 1 },
    ];
    const before = countCrossings(layers, segs);
    const reordered = minimizeCrossings(layers, segs);
    const after = countCrossings(reordered, segs);
    expect(before).toBe(1);
    expect(after).toBe(0);
  });
});

describe('sugiyama — groupByLayer', () => {
  it('groups nodes by their layer value', () => {
    const layers = new Map<string, number>([
      ['a', 0],
      ['b', 1],
      ['c', 1],
      ['d', 2],
    ]);
    const groups = groupByLayer(['a', 'b', 'c', 'd'], layers);
    expect(groups).toEqual([['a'], ['b', 'c'], ['d']]);
  });
});
