/**
 * GraphViz-style layout engine — public type surface.
 *
 * This module defines the cross-backend contract for a layout engine. It is
 * intentionally decoupled from any concrete sugiyama implementation, AST
 * type, or diagram kind. A backend (see `dot-sugiyama.ts`) consumes a
 * `LayoutGraph` and produces a `LayoutResult`.
 *
 * Phase 1 / Step A: only the interface and a sugiyama-backed implementation
 * are introduced. No existing diagram code uses this module yet.
 */

export interface NodeSpec {
  id: string;
  width: number;
  height: number;
  shape?: 'rect' | 'rounded' | 'circle' | 'diamond' | 'point';
  /** Optional explicit rank pin (numeric layer or GraphViz-style group). */
  rank?: number | 'min' | 'max' | 'same';
  /** id of parent subgraph this node belongs to (undefined = top-level). */
  cluster?: string;
}

export interface EdgeSpec {
  /**
   * Optional stable identity for this edge. When supplied it becomes the key
   * under which the edge's layout is stored in `LayoutResult.edges` — this is
   * the mechanism that keeps *parallel* edges (same `from` + same `to`)
   * distinct in the result. When omitted, the engine derives a key from
   * `from`/`to` (and disambiguates parallel mates with a `#n` suffix), so
   * callers that never have parallel edges can keep using `edgeKey(from,to)`.
   */
  id?: string;
  from: string;
  to: string;
  label?: string;
  labelSize?: { w: number; h: number };
  weight?: number;
  /** Whether the edge participates in rank constraints (default true). */
  constraint?: boolean;
  direction?: 'forward' | 'back' | 'both' | 'none';
}

export interface SubgraphSpec {
  id: string;
  /** id of enclosing subgraph (undefined = top-level). */
  parent?: string;
  label?: string;
  direction?: 'TB' | 'LR' | 'BT' | 'RL';
  rankSep?: number;
  nodeSep?: number;
}

export interface LayoutGraph {
  nodes: Map<string, NodeSpec>;
  edges: EdgeSpec[];
  subgraphs: Map<string, SubgraphSpec>;
}

export interface Point {
  x: number;
  y: number;
}

export interface BBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface NodeLayout {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface EdgeLayout {
  /**
   * Stable identity of this edge — the same string used as its key in
   * `LayoutResult.edges`. Carried on the layout so consumers that iterate the
   * map (or hold an `EdgeLayout` directly) can map back to their input edge
   * without re-deriving the key. For parallel edges this is what makes the
   * two entries distinguishable.
   */
  id: string;
  /** Source node id of the originating edge. */
  from: string;
  /** Target node id of the originating edge. */
  to: string;
  /** Polyline (start, [bends], end). At minimum has start and end points. */
  points: Point[];
  labelPos?: Point;
  /**
   * Suggested visual treatment when rendering this edge.
   *
   * - `'straight'` (default): draw a polyline through `points` as-is.
   * - `'bezier'`: interpret `points` as control hints for a smooth cubic
   *   Bezier path. Engines should only set this when `points.length >= 3`
   *   (i.e. at least one interior bend); two-point edges always remain
   *   straight lines.
   *
   * Renderers that don't understand `'bezier'` can safely fall back to the
   * polyline interpretation — the `points` array remains the source of
   * truth for endpoints and approximate routing.
   */
  curve?: 'straight' | 'bezier';
  /**
   * Phase 1 Step D3 — collision-avoided label rectangle.
   *
   * When the engine was given a `labelSize` for this edge and ran the
   * label-collision pass, this carries the chosen rectangle (anchored at
   * its top-left). The center `(x + w/2, y + h/2)` is the position the
   * renderer should use for the label text; this is the midpoint by default
   * but may be slid off the midpoint along the polyline to avoid overlap
   * with nearby nodes or other already-placed labels.
   *
   * Renderers that don't honour `labelBox` fall back to their existing
   * polyline-midpoint behaviour — the field is purely additive.
   */
  labelBox?: { x: number; y: number; width: number; height: number };
}

export interface LayoutResult {
  nodes: Map<string, NodeLayout>;
  /**
   * Per-edge layouts, keyed by each edge's stable id (see `EdgeSpec.id` /
   * `EdgeLayout.id`). The id is the input edge's `id` when supplied, otherwise
   * `edgeKey(from,to)` for the first edge of a pair and `edgeKey(from,to)#n`
   * for its parallel mates. Iteration order is the input edge order.
   */
  edges: Map<string, EdgeLayout>;
  subgraphs: Map<string, BBox>;
  bbox: BBox;
}

export interface LayoutOptions {
  defaultDirection: 'TB' | 'LR' | 'BT' | 'RL';
  nodeSep?: number;
  rankSep?: number;
  margin?: number;
  /**
   * Phase 1 Step D2 — run a weighted-barycenter finalization pass after the
   * legacy `minimizeCrossings` median sweep. This refines node order within
   * each layer so a node tends to sit near its incoming neighbour (weight
   * 1.0) and, to a lesser degree, near its outgoing neighbour (weight 0.5).
   *
   * The pass is conservative: it never accepts an ordering with strictly
   * more crossings than the input, and iterates at most a few sweeps. Turn
   * this off to A/B test against the pure-median result.
   *
   * Default: `true`.
   */
  flowReorder?: boolean;
  /**
   * Phase 1 Step D3 — run an edge-label collision-avoidance pass.
   *
   * When ON (default), the engine emits a `labelBox` for each edge that
   * carries a `labelSize`. The box is anchored at the polyline midpoint when
   * that placement is clear of all (a) node rectangles and (b) previously-
   * placed label boxes; otherwise the engine probes a series of offsets
   * (±10%, ±20%, ±30% of arc length) along the polyline and picks the first
   * clear slot. If nothing is clear, the midpoint is kept (graceful
   * degradation — better to overlap than to drop the label).
   *
   * Turn off when debugging or when callers want raw midpoint placement.
   *
   * Default: `true`.
   */
  avoidLabelCollisions?: boolean;
  /**
   * Phase 1 Step D4 — adjacent-pair swap finalization pass.
   *
   * After median (`minimizeCrossings`) and the weighted-barycenter
   * `flowReorder` pass, residual crossings can remain in tricky cases (long
   * edges spanning multiple ranks, symmetric forks where median picked an
   * arbitrary child order, two-cluster bipartite graphs with a stray bridge
   * edge). This final pass performs an exhaustive local search: for every
   * adjacent pair `(i, i+1)` in each layer, it measures crossings before and
   * after a swap and keeps the swap iff it strictly reduces crossings.
   * Sweeps repeat until a full pass finds no improving swap (or up to a hard
   * cap of 20 sweeps).
   *
   * This pass is monotone-non-increasing on the global crossing count by
   * construction — every accepted swap reduces it; reverting on no
   * improvement preserves it.
   *
   * Default: `true`.
   */
  adjacentSwap?: boolean;
  /**
   * Phase 1 Step F1 — GraphViz-style external label placement (xlabel).
   *
   * When ON (default), edge labels with a `labelSize` are positioned by a
   * force-directed pass (`placeExternalLabels` in `xlabel.ts`): each label is
   * a movable rectangle repelled by node boxes, edge paths and other labels,
   * held near its edge by a weak spring. This resolves two failure modes the
   * older Step D3 single-edge probe could not: a label buried inside a node
   * box, and parallel-edge labels stacked at the same coordinate.
   *
   * This is **mutually exclusive** with the Step D3 `avoidLabelCollisions`
   * probe: when `useXLabels` is on, the engine seeds each label at its
   * polyline midpoint (D3's probing is skipped) and lets the force pass own
   * the final `labelBox`. When off, the engine falls back to the D3 probe
   * (gated by `avoidLabelCollisions`).
   *
   * Default: `true`.
   */
  useXLabels?: boolean;
  /**
   * Phase 1 Step F3 — visibility-graph based obstacle-avoiding edge routing.
   *
   * When ON (default), a post-layout pass tests each edge's straight (or
   * F2b-bowed) polyline against the obstacle set — every node box plus every
   * cluster bbox, excluding the edge's own endpoint nodes and the clusters that
   * contain them. If the direct path is clear, the edge is left EXACTLY as-is
   * (byte-identical output — this is the critical gating property). Only when a
   * path actually crosses an obstacle does the engine compute a visibility
   * route (`visibilityRoute` in `route.ts`) — a shortest polyline through the
   * free space between obstacles — and replace the edge's interior bends with
   * it, flagging the edge `'bezier'` so the renderer smooths the detour.
   *
   * The pass runs on the stitched, global-coordinate layout (the only place
   * node boxes and cluster bboxes coexist) and before nothing else mutates the
   * polylines, so labels — anchored on the final routed path — follow the route.
   *
   * Bounded and robust: the visibility graph is capped and the pass never
   * throws nor drops an edge; on any failure it falls back to the direct path.
   *
   * Default: `true`.
   */
  routeAroundObstacles?: boolean;
}

export interface LayoutEngine {
  layout(graph: LayoutGraph, opts: LayoutOptions): LayoutResult;
}

/** Stable key for an edge in `LayoutResult.edges`. */
export function edgeKey(edge: Pick<EdgeSpec, 'from' | 'to'>): string {
  return `${edge.from}->${edge.to}`;
}
