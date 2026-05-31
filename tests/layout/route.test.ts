import { describe, it, expect } from 'vitest';
import {
  buildObstacles,
  pathBlocked,
  segmentCrossesObstacle,
  visibilityRoute,
  type NodeBox,
  type ClusterBox,
  type Obstacle,
  type RoutePoint,
} from '../../src/layout/engine/route.js';

// ---------------------------------------------------------------------------
// Phase 1 Step F3 — visibility-graph obstacle-avoiding routing (pure helpers).
// ---------------------------------------------------------------------------

describe('route — visibilityRoute', () => {
  it('routes around a node obstacle squarely between source and target', () => {
    // Source above, target below, an obstacle box dead-centre on the straight
    // line between them. The straight path pierces the box interior, so a
    // non-null detour must come back.
    const source: RoutePoint = { x: 50, y: 0 };
    const target: RoutePoint = { x: 50, y: 200 };
    const obstacles: Obstacle[] = [{ x: 20, y: 80, w: 60, h: 40 }];

    // Sanity: the direct path really is blocked.
    expect(pathBlocked([source, target], obstacles)).toBe(true);

    const detour = visibilityRoute(source, target, obstacles);
    expect(detour).not.toBeNull();
    expect(detour!.length).toBeGreaterThan(0);

    // The FULL routed polyline [source, ...detour, target] must be entirely
    // obstacle-free — it must not enter the obstacle interior.
    const routed = [source, ...detour!, target];
    expect(pathBlocked(routed, obstacles)).toBe(false);
  });

  it('returns null when the direct path is already clear (no detour)', () => {
    const source: RoutePoint = { x: 0, y: 0 };
    const target: RoutePoint = { x: 0, y: 100 };
    // Obstacle far off to the side — the straight vertical line never touches.
    const obstacles: Obstacle[] = [{ x: 200, y: 40, w: 30, h: 30 }];

    expect(pathBlocked([source, target], obstacles)).toBe(false);
    expect(visibilityRoute(source, target, obstacles)).toBeNull();
  });

  it('returns null when there are no obstacles at all', () => {
    expect(visibilityRoute({ x: 0, y: 0 }, { x: 100, y: 100 }, [])).toBeNull();
  });

  it('detour vertices each lie outside every obstacle interior', () => {
    const source: RoutePoint = { x: 0, y: 50 };
    const target: RoutePoint = { x: 200, y: 50 };
    const obstacles: Obstacle[] = [{ x: 80, y: 20, w: 40, h: 60 }];
    const detour = visibilityRoute(source, target, obstacles);
    expect(detour).not.toBeNull();
    for (const p of detour!) {
      // pathBlocked over a zero-length "segment" can't express interior-ness,
      // so assert directly: no detour vertex is strictly inside the box.
      const inside =
        p.x > obstacles[0]!.x &&
        p.x < obstacles[0]!.x + obstacles[0]!.w &&
        p.y > obstacles[0]!.y &&
        p.y < obstacles[0]!.y + obstacles[0]!.h;
      expect(inside).toBe(false);
    }
  });
});

describe('route — segmentCrossesObstacle', () => {
  const box: Obstacle = { x: 100, y: 100, w: 100, h: 100 }; // [100,200]×[100,200]

  it('counts a segment piercing the interior as a crossing', () => {
    // Horizontal line through the middle of the box.
    expect(
      segmentCrossesObstacle({ x: 0, y: 150 }, { x: 300, y: 150 }, box),
    ).toBe(true);
  });

  it('does not count a segment fully outside the box', () => {
    expect(
      segmentCrossesObstacle({ x: 0, y: 0 }, { x: 50, y: 50 }, box),
    ).toBe(false);
  });

  it('does not count an endpoint anchored ON the boundary as a crossing', () => {
    // Endpoint sits exactly on the left boundary, segment heads away from the
    // box. This is the anchored-edge-endpoint case: must NOT register.
    expect(
      segmentCrossesObstacle({ x: 100, y: 150 }, { x: 0, y: 150 }, box),
    ).toBe(false);
    // Endpoint on a corner, heading away.
    expect(
      segmentCrossesObstacle({ x: 100, y: 100 }, { x: 0, y: 0 }, box),
    ).toBe(false);
  });

  it('does not count a segment running colinear along a box edge', () => {
    // Runs along the top edge y=100 from left of the box to right of it.
    expect(
      segmentCrossesObstacle({ x: 0, y: 100 }, { x: 300, y: 100 }, box),
    ).toBe(false);
  });

  it('counts a corner-to-corner diagonal through the interior as a crossing', () => {
    // Enters/exits exactly at two corners but slices the interior — the
    // midpoint test must catch it.
    expect(
      segmentCrossesObstacle({ x: 100, y: 100 }, { x: 200, y: 200 }, box),
    ).toBe(true);
  });

  it('does not count a segment grazing a single corner from outside', () => {
    // Line x+y=200 touches ONLY the top-left corner (100,100); both endpoints
    // (0,200) and (200,0) lie outside and the interior is never entered.
    expect(
      segmentCrossesObstacle({ x: 0, y: 200 }, { x: 200, y: 0 }, box),
    ).toBe(false);
    // Another true graze: touches only the corner, both endpoints clearly
    // outside on the same side.
    expect(
      segmentCrossesObstacle({ x: 0, y: 100 }, { x: 100, y: 0 }, box),
    ).toBe(false);
  });

  it('counts the main diagonal across the whole box as a crossing', () => {
    // (0,0)→(300,300) is the line y=x, passing through corners (100,100) and
    // (200,200) but slicing the entire interior between them.
    expect(
      segmentCrossesObstacle({ x: 0, y: 0 }, { x: 300, y: 300 }, box),
    ).toBe(true);
  });
});

describe('route — buildObstacles', () => {
  const nodes: NodeBox[] = [
    { id: 'A', x: 0, y: 0, w: 50, h: 30 },
    { id: 'B', x: 0, y: 100, w: 50, h: 30 },
    { id: 'C', x: 0, y: 200, w: 50, h: 30 },
  ];

  it("excludes the edge's own endpoint node boxes from its obstacle set", () => {
    // Edge A→C: A and C are endpoints and must NOT be obstacles; only B remains.
    const obstacles = buildObstacles('A', 'C', nodes, [], 0);
    expect(obstacles.length).toBe(1);
    // The single remaining obstacle is B's box (margin 0 ⇒ identical geometry).
    expect(obstacles[0]).toEqual({ x: 0, y: 100, w: 50, h: 30 });
  });

  it('includes all non-endpoint node boxes, inflated by margin', () => {
    const obstacles = buildObstacles('A', 'C', nodes, [], 5);
    expect(obstacles.length).toBe(1);
    // B inflated by 5 on every side.
    expect(obstacles[0]).toEqual({ x: -5, y: 95, w: 60, h: 40 });
  });

  it('excludes clusters that contain either endpoint', () => {
    const clusters: ClusterBox[] = [
      // Cluster containing endpoint A — must be excluded.
      { id: 'gA', x: -5, y: -5, w: 60, h: 40, members: new Set(['A']) },
      // Cluster containing neither endpoint — must be kept.
      { id: 'gB', x: -5, y: 95, w: 60, h: 40, members: new Set(['B']) },
    ];
    const obstacles = buildObstacles('A', 'C', nodes, clusters, 0);
    // B node (1) + gB cluster (1) = 2; gA cluster excluded.
    expect(obstacles.length).toBe(2);
  });

  it('skips degenerate (zero-area) cluster bboxes', () => {
    const clusters: ClusterBox[] = [
      { id: 'empty', x: 0, y: 0, w: 0, h: 0, members: new Set(['X']) },
    ];
    // Edge between two ids not present as nodes here ⇒ no node obstacles, and
    // the degenerate cluster is skipped.
    const obstacles = buildObstacles('P', 'Q', [], clusters, 0);
    expect(obstacles.length).toBe(0);
  });
});
