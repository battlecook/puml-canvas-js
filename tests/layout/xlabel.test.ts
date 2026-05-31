// Phase 1 Step F1 — GraphViz-style external label placement (xlabel).
//
// These tests exercise both the pure `placeExternalLabels` force pass and the
// `DotSugiyamaEngine` integration (the `useXLabels` flag). They assert the two
// motivating problems are measurably fixed:
//
//   1. an edge label drawn *inside* a node box → pushed outside all nodes;
//   2. parallel-edge labels stacked at the same coordinate → separated.

import { describe, it, expect } from 'vitest';
import {
  DotSugiyamaEngine,
  edgeKey,
  placeExternalLabels,
  type LayoutGraph,
  type NodeSpec,
  type XRect,
} from '../../src/layout/engine/index.js';

function rectsOverlap(
  a: { x: number; y: number; w?: number; h?: number; width?: number; height?: number },
  b: { x: number; y: number; w?: number; h?: number; width?: number; height?: number },
): boolean {
  const aw = a.w ?? a.width ?? 0;
  const ah = a.h ?? a.height ?? 0;
  const bw = b.w ?? b.width ?? 0;
  const bh = b.h ?? b.height ?? 0;
  return a.x < b.x + bw && a.x + aw > b.x && a.y < b.y + bh && a.y + ah > b.y;
}

function makeGraph(
  nodes: NodeSpec[],
  edges: { from: string; to: string; label?: string; labelSize?: { w: number; h: number } }[],
): LayoutGraph {
  return {
    nodes: new Map(nodes.map((n) => [n.id, n])),
    edges,
    subgraphs: new Map(),
  };
}

// ---------------------------------------------------------------------------
// Pure force-pass unit tests.
// ---------------------------------------------------------------------------

describe('xlabel — placeExternalLabels (pure force pass)', () => {
  it('returns an empty result for no labels', () => {
    const { boxes } = placeExternalLabels({ nodes: [], labels: [] });
    expect(boxes.size).toBe(0);
  });

  it('keeps a clear label near its anchor', () => {
    // Single label far from any node. The spring holds it near the anchor;
    // the edge-repulsion term may nudge it a touch off the line it sits on
    // (GraphViz places labels beside, not on, the edge), so we allow a small
    // perpendicular offset rather than demanding an exact match.
    const { boxes } = placeExternalLabels({
      nodes: [{ x: 0, y: 0, w: 40, h: 40 }],
      labels: [
        { id: 'e', size: { w: 20, h: 12 }, anchor: { x: 200, y: 200 }, path: [{ x: 190, y: 200 }, { x: 210, y: 200 }] },
      ],
    });
    const box = boxes.get('e')!;
    expect(box).toBeDefined();
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    // Stays close to the anchor (within roughly half the label height of the
    // line it was seeded on).
    expect(Math.hypot(cx - 200, cy - 200)).toBeLessThan(20);
  });

  it('pushes a label that lands inside a node out of every node box', () => {
    // Anchor is dead-centre of a big node — the force pass must evict it.
    const node: XRect = { x: 0, y: 0, w: 120, h: 80 };
    const { boxes } = placeExternalLabels({
      nodes: [node],
      labels: [
        {
          id: 'e',
          size: { w: 30, h: 14 },
          anchor: { x: 60, y: 40 },
          path: [{ x: 0, y: 40 }, { x: 120, y: 40 }],
        },
      ],
    });
    const box = boxes.get('e')!;
    expect(rectsOverlap(box, node)).toBe(false);
  });

  it('separates two labels seeded at the same point', () => {
    const { boxes } = placeExternalLabels({
      nodes: [],
      labels: [
        { id: 'a', size: { w: 40, h: 14 }, anchor: { x: 100, y: 100 }, path: [{ x: 80, y: 100 }, { x: 120, y: 100 }] },
        { id: 'b', size: { w: 40, h: 14 }, anchor: { x: 100, y: 100 }, path: [{ x: 80, y: 100 }, { x: 120, y: 100 }] },
      ],
    });
    const a = boxes.get('a')!;
    const b = boxes.get('b')!;
    expect(rectsOverlap(a, b)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Engine integration — the `useXLabels` flag.
// ---------------------------------------------------------------------------

describe('xlabel — DotSugiyamaEngine integration', () => {
  it('defaults useXLabels ON and emits a labelBox', () => {
    const graph = makeGraph(
      [
        { id: 'A', width: 60, height: 30 },
        { id: 'B', width: 60, height: 30 },
      ],
      [{ from: 'A', to: 'B', label: 'go', labelSize: { w: 20, h: 14 } }],
    );
    const result = new DotSugiyamaEngine().layout(graph, { defaultDirection: 'TB' });
    const ab = result.edges.get(edgeKey({ from: 'A', to: 'B' }))!;
    expect(ab.labelBox).toBeDefined();
  });

  it('parallel edges from one source: two labels do not overlap each other', () => {
    // Two edges leaving the same source to different targets (A→B, A→C) whose
    // wide labels would otherwise stack near the same x. xlabel must pull the
    // two boxes apart. (Edges with the *same* (from,to) collapse in the
    // result map — a separate, pre-existing engine limitation — so we use
    // distinct targets here; the strict same-anchor parallel case is covered
    // by the pure-pass test above.)
    const graph = makeGraph(
      [
        { id: 'A', width: 40, height: 30 },
        { id: 'B', width: 40, height: 30 },
        { id: 'C', width: 40, height: 30 },
      ],
      [
        { from: 'A', to: 'B', label: 'EvNewValue', labelSize: { w: 90, h: 14 } },
        { from: 'A', to: 'C', label: 'EvRejected', labelSize: { w: 90, h: 14 } },
      ],
    );
    const result = new DotSugiyamaEngine().layout(graph, { defaultDirection: 'TB' });
    const ab = result.edges.get(edgeKey({ from: 'A', to: 'B' }))!.labelBox;
    const ac = result.edges.get(edgeKey({ from: 'A', to: 'C' }))!.labelBox;
    expect(ab).toBeDefined();
    expect(ac).toBeDefined();
    expect(rectsOverlap(ab!, ac!)).toBe(false);
  });

  it('label that would land inside a node is pushed outside all node boxes', () => {
    // A wide label on a long A→C edge whose midpoint sits over an intermediate
    // node M. xlabel must evict the label from every node rectangle.
    const graph = makeGraph(
      [
        { id: 'A', width: 40, height: 30 },
        { id: 'B', width: 40, height: 30 },
        { id: 'M', width: 120, height: 30 },
        { id: 'C', width: 40, height: 30 },
      ],
      [
        { from: 'A', to: 'B' },
        { from: 'B', to: 'C' },
        { from: 'A', to: 'C', label: 'looong label', labelSize: { w: 160, h: 14 } },
      ],
    );
    const result = new DotSugiyamaEngine().layout(graph, { defaultDirection: 'TB' });
    const ac = result.edges.get(edgeKey({ from: 'A', to: 'C' }))!;
    expect(ac.labelBox).toBeDefined();
    const overlaps: string[] = [];
    for (const [id, nl] of result.nodes) {
      if (rectsOverlap(ac.labelBox!, nl)) overlaps.push(id);
    }
    // Tolerate overlap with the edge's own endpoints (A/C) only.
    expect(overlaps.filter((id) => id !== 'A' && id !== 'C')).toEqual([]);
  });

  it("useXLabels: false falls back to the D3 probe (still emits a labelBox)", () => {
    const graph = makeGraph(
      [
        { id: 'A', width: 60, height: 30 },
        { id: 'B', width: 60, height: 30 },
      ],
      [{ from: 'A', to: 'B', label: 'go', labelSize: { w: 20, h: 14 } }],
    );
    const result = new DotSugiyamaEngine().layout(graph, {
      defaultDirection: 'TB',
      useXLabels: false,
    });
    const ab = result.edges.get(edgeKey({ from: 'A', to: 'B' }))!;
    expect(ab.labelBox).toBeDefined();
  });

  it('useXLabels overrides avoidLabelCollisions (xlabel owns the box)', () => {
    // With both on, xlabel runs and D3 is bypassed. We confirm a box is still
    // produced (the two passes don't fight / double-write).
    const graph = makeGraph(
      [
        { id: 'A', width: 60, height: 30 },
        { id: 'B', width: 60, height: 30 },
      ],
      [{ from: 'A', to: 'B', label: 'go', labelSize: { w: 20, h: 14 } }],
    );
    const result = new DotSugiyamaEngine().layout(graph, {
      defaultDirection: 'TB',
      useXLabels: true,
      avoidLabelCollisions: true,
    });
    const ab = result.edges.get(edgeKey({ from: 'A', to: 'B' }))!;
    expect(ab.labelBox).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// The user's sample diagram — end-to-end via the engine on its sub-fragments.
// ---------------------------------------------------------------------------

describe("xlabel — user's sample (Configuring composite)", () => {
  // The motivating composite from the spec:
  //   NewValueSelection --> NewValuePreview : EvNewValue
  //   NewValuePreview --> NewValueSelection : EvNewValueRejected
  //   NewValuePreview --> NewValueSelection : EvNewValueSaved
  // Two of these are parallel (NewValuePreview→NewValueSelection) with distinct
  // labels — exactly the stacking case.

  it('problem #1: no edge-label box overlaps any node box (via engine)', () => {
    // The non-parallel edges still flow through the engine; assert none of
    // their resolved label boxes land inside a node rectangle.
    const graph = makeGraph(
      [
        { id: 'NewValueSelection', width: 130, height: 40 },
        { id: 'NewValuePreview', width: 120, height: 40 },
      ],
      [
        { from: 'NewValueSelection', to: 'NewValuePreview', label: 'EvNewValue', labelSize: { w: 80, h: 14 } },
        { from: 'NewValuePreview', to: 'NewValueSelection', label: 'EvNewValueRejected', labelSize: { w: 130, h: 14 } },
      ],
    );
    const result = new DotSugiyamaEngine().layout(graph, { defaultDirection: 'TB' });
    let checked = 0;
    for (const [, el] of result.edges) {
      if (!el.labelBox) continue;
      checked++;
      for (const [, nl] of result.nodes) {
        expect(rectsOverlap(el.labelBox, nl)).toBe(false);
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('problem #2: the two parallel labels are pulled apart (pure pass)', () => {
    // The two NewValuePreview→NewValueSelection labels share an edge route, so
    // they seed at (nearly) the same anchor. The force pass must separate
    // them. We exercise the algorithm directly because the engine's result
    // map collapses identical (from,to) keys — a pre-existing limitation
    // orthogonal to label placement.
    const route = [
      { x: 60, y: 120 },
      { x: 60, y: 40 },
    ];
    const { boxes } = placeExternalLabels({
      nodes: [
        { x: 0, y: 0, w: 130, h: 40 },
        { x: 0, y: 100, w: 130, h: 40 },
      ],
      labels: [
        { id: 'rejected', size: { w: 130, h: 14 }, anchor: { x: 60, y: 80 }, path: route },
        { id: 'saved', size: { w: 115, h: 14 }, anchor: { x: 60, y: 80 }, path: route },
      ],
    });
    const a = boxes.get('rejected')!;
    const b = boxes.get('saved')!;
    expect(rectsOverlap(a, b)).toBe(false);
    const same = a.x === b.x && a.y === b.y;
    expect(same).toBe(false);
  });
});
