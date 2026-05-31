/**
 * First backend of the new layout engine — a thin wrapper around the existing
 * sugiyama implementation in `src/layout/class/sugiyama.ts`.
 *
 * The strategy is deliberately conservative: we reuse the legacy pipeline
 * (`removeCycles` → `assignLayers` → `insertDummies` → `groupByLayer` →
 * `minimizeCrossings` → `assignCoordinates`) without duplicating its logic,
 * then translate the per-node centres back into the `LayoutResult` shape.
 *
 * Per-subgraph direction (Phase 1 Step C): a `SubgraphSpec` may declare its
 * own `direction` (e.g. `'LR'`). When that direction differs from the
 * enclosing context, the engine recursively lays out the subgraph's contents
 * in their own direction, then collapses the result into a single opaque
 * cluster node at the parent level. This lets a horizontally-flowing chain
 * sit inside an otherwise top-to-bottom layout.
 *
 * Other than the recursive subgraph step, subgraphs/clusters are reported as
 * bounding boxes of their member nodes — they don't otherwise constrain the
 * sugiyama pass.
 */

import {
  assignLayers,
  removeCycles,
  insertDummies,
  groupByLayer,
  minimizeCrossings,
  assignCoordinates,
  countCrossings,
  type LayoutEdge,
  type LayoutSegment,
} from '../class/sugiyama.js';
import type { ClassRelationship } from '../../ast/class.js';
import {
  edgeKey,
  type BBox,
  type EdgeLayout,
  type EdgeSpec,
  type LayoutEngine,
  type LayoutGraph,
  type LayoutOptions,
  type LayoutResult,
  type NodeLayout,
  type NodeSpec,
  type Point,
} from './types.js';
import { placeExternalLabels, type XLabelInput } from './xlabel.js';
import {
  buildObstacles,
  pathBlocked,
  visibilityRoute,
  type ClusterBox,
  type NodeBox,
} from './route.js';

const DEFAULT_NODE_SEP = 36;
const DEFAULT_RANK_SEP = 60;
const DEFAULT_MARGIN = 16;
const DEFAULT_DUMMY_GAP = 12;

/**
 * Minimal `ClassRelationship` filler — sugiyama keeps the field around for the
 * caller's renderer, but the layout helpers only use it as opaque metadata
 * threaded through `DrawableEdge`. We synthesize a neutral relationship per
 * edge so the existing helpers can run without modification.
 */
function placeholderRel(edge: EdgeSpec): ClassRelationship {
  return {
    source: edge.from,
    target: edge.to,
    sourceMult: '',
    targetMult: '',
    arrowToken: '-->',
    kind: 'association',
    style: 'solid',
    sourceMarker: 'none',
    targetMarker: 'arrow',
    label: edge.label ?? '',
    labelDirection: 'none',
  };
}

/** Direction shorthand used internally. */
type Dir = 'TB' | 'LR' | 'BT' | 'RL';

/**
 * Output of laying out a flat (non-nested-cluster) subset of nodes. The
 * recursion stitches multiple of these into a parent layout by treating
 * each sub-result as a single opaque cluster node.
 */
interface FlatLayout {
  /** Per-real-node positions within this sub-result, anchored at (0,0). */
  nodes: Map<string, NodeLayout>;
  /** Per-real-edge polylines, anchored at (0,0), keyed by stable edge id. */
  edges: Map<string, EdgeLayout>;
  /** Bounding box of the laid-out content (also at (0,0)). */
  w: number;
  h: number;
}

export class DotSugiyamaEngine implements LayoutEngine {
  layout(graph: LayoutGraph, opts: LayoutOptions): LayoutResult {
    const nodeSep = opts.nodeSep ?? DEFAULT_NODE_SEP;
    const rankSep = opts.rankSep ?? DEFAULT_RANK_SEP;
    const margin = opts.margin ?? DEFAULT_MARGIN;
    const defaultDir = opts.defaultDirection;
    const flowReorder = opts.flowReorder ?? true;
    const avoidLabelCollisions = opts.avoidLabelCollisions ?? true;
    const adjacentSwap = opts.adjacentSwap ?? true;
    const useXLabels = opts.useXLabels ?? true;

    // ---------------------------------------------------------------------
    // Subgraph forest + per-subgraph member sets (transitive: a node placed
    // in a deeply nested cluster counts as a member of every ancestor too).
    // ---------------------------------------------------------------------
    const directMembersOf = new Map<string, Set<string>>();
    const allMembersOf = new Map<string, Set<string>>();
    for (const sgId of graph.subgraphs.keys()) {
      directMembersOf.set(sgId, new Set());
      allMembersOf.set(sgId, new Set());
    }
    for (const [nodeId, n] of graph.nodes) {
      if (!n.cluster) continue;
      const direct = directMembersOf.get(n.cluster);
      if (direct) direct.add(nodeId);
      let c: string | undefined = n.cluster;
      while (c) {
        const all = allMembersOf.get(c);
        if (all) all.add(nodeId);
        c = graph.subgraphs.get(c)?.parent;
      }
    }
    const childrenOf = new Map<string, string[]>();
    for (const sgId of graph.subgraphs.keys()) childrenOf.set(sgId, []);
    const rootSubgraphs: string[] = [];
    for (const [sgId, spec] of graph.subgraphs) {
      if (spec.parent && childrenOf.has(spec.parent)) {
        childrenOf.get(spec.parent)!.push(sgId);
      } else {
        rootSubgraphs.push(sgId);
      }
    }

    // ---------------------------------------------------------------------
    // Identify subgraphs we want to lay out recursively in their own
    // direction. A subgraph is "directional" when its `direction` is set
    // AND that direction differs from the surrounding context. We compute
    // this top-down so an LR subgraph nested inside another LR subgraph
    // stays in the parent's pass (no need for a sub-layout).
    // ---------------------------------------------------------------------
    const subDir = new Map<string, Dir>();
    const inheritedDir = (sgId: string): Dir => {
      let dir: Dir = defaultDir;
      // Walk up to the root, picking up the closest declared direction.
      const chain: string[] = [];
      let cur: string | undefined = sgId;
      while (cur) {
        chain.push(cur);
        cur = graph.subgraphs.get(cur)?.parent;
      }
      // Iterate root → leaf so closer ancestors override farther ones.
      for (let i = chain.length - 1; i >= 0; i--) {
        const id = chain[i]!;
        const d = graph.subgraphs.get(id)?.direction;
        if (d) dir = d;
      }
      return dir;
    };
    const directional: string[] = [];
    for (const [sgId, spec] of graph.subgraphs) {
      if (!spec.direction) continue;
      const parentDir = spec.parent ? inheritedDir(spec.parent) : defaultDir;
      if (spec.direction !== parentDir) directional.push(sgId);
    }
    // Sort so deeper (more nested) directional subgraphs are processed
    // first — that way an outer directional cluster sees its inner
    // directional cluster as an already-collapsed opaque node.
    const depthOf = (sgId: string): number => {
      let d = 0;
      let cur: string | undefined = sgId;
      while (cur) {
        d++;
        cur = graph.subgraphs.get(cur)?.parent;
      }
      return d;
    };
    directional.sort((a, b) => depthOf(b) - depthOf(a));

    // For each directional subgraph (bottom-up), recursively lay out its
    // direct content (real nodes + already-collapsed inner clusters) with
    // its own direction and replace those nodes with a single opaque
    // cluster node in the working node map.
    //
    // `workingNodes` is the mutable view of "what the top-level pass sees".
    // It starts as a copy of `graph.nodes` and has real-node entries
    // replaced by opaque cluster entries as we collapse subgraphs.
    const workingNodes = new Map<string, NodeSpec>(graph.nodes);
    const collapsedFor = new Map<string, FlatLayout>();
    const collapsedClusterId = new Map<string, string>(); // sgId -> opaque node id
    // Map: real-node id -> the opaque cluster id that now stands for it at
    // top level. Used to remap edges whose endpoints got absorbed.
    const remap = new Map<string, string>();
    // Track which real edges have been consumed by an inner sub-layout so
    // we don't double-route them at the parent level.
    const consumedEdges = new Set<EdgeSpec>();

    for (const sgId of directional) {
      const allMembers = allMembersOf.get(sgId)!;
      // After previous collapses, some members may already be remapped to
      // inner cluster ids — translate to current top-level identifiers.
      const directIds: string[] = [];
      const seen = new Set<string>();
      for (const id of allMembers) {
        const cur = remap.get(id) ?? id;
        // Only include nodes that still live at the working level
        // (haven't been swallowed by an even-deeper directional cluster).
        if (workingNodes.has(cur) && !seen.has(cur)) {
          directIds.push(cur);
          seen.add(cur);
        }
      }
      if (directIds.length === 0) continue;
      // Intra-subgraph edges (with current identifiers).
      const intraEdges: EdgeSpec[] = [];
      const directIdSet = new Set(directIds);
      for (const e of graph.edges) {
        if (consumedEdges.has(e)) continue;
        const f = remap.get(e.from) ?? e.from;
        const t = remap.get(e.to) ?? e.to;
        if (directIdSet.has(f) && directIdSet.has(t)) {
          intraEdges.push({ ...e, from: f, to: t });
          consumedEdges.add(e);
        }
      }
      const subDirection = graph.subgraphs.get(sgId)!.direction!;
      const subNodeSep = graph.subgraphs.get(sgId)!.nodeSep ?? nodeSep;
      const subRankSep = graph.subgraphs.get(sgId)!.rankSep ?? rankSep;
      const subResult = this.layoutFlat(
        directIds,
        workingNodes,
        intraEdges,
        subDirection,
        subNodeSep,
        subRankSep,
        margin,
        flowReorder,
        avoidLabelCollisions,
        adjacentSwap,
        useXLabels,
      );
      collapsedFor.set(sgId, subResult);
      subDir.set(sgId, subDirection);

      // Replace the participating nodes with a single opaque cluster node
      // at the working level. The cluster's parent cluster (if any) is
      // preserved from one of its members (they all share the same outer
      // cluster, since `directMembersOf` is by direct membership).
      const clusterId = `__cluster__${sgId}`;
      collapsedClusterId.set(sgId, clusterId);
      // Determine outer cluster: pick the parent of the subgraph in the
      // subgraph tree (since the cluster sits one level up).
      const outerCluster = graph.subgraphs.get(sgId)?.parent;
      const clusterSpec: NodeSpec = {
        id: clusterId,
        width: subResult.w,
        height: subResult.h,
      };
      if (outerCluster !== undefined) clusterSpec.cluster = outerCluster;
      workingNodes.set(clusterId, clusterSpec);
      for (const id of directIds) {
        workingNodes.delete(id);
        remap.set(id, clusterId);
      }
    }

    // ---------------------------------------------------------------------
    // Top-level pass: lay out the (possibly-collapsed) working node set
    // plus the residual edges.
    // ---------------------------------------------------------------------
    const topNodeIds = Array.from(workingNodes.keys());
    const topEdges: EdgeSpec[] = [];
    for (const e of graph.edges) {
      if (consumedEdges.has(e)) continue;
      const f = remap.get(e.from) ?? e.from;
      const t = remap.get(e.to) ?? e.to;
      topEdges.push({ ...e, from: f, to: t });
    }
    const top = this.layoutFlat(
      topNodeIds,
      workingNodes,
      topEdges,
      defaultDir,
      nodeSep,
      rankSep,
      margin,
      flowReorder,
      avoidLabelCollisions,
      adjacentSwap,
      useXLabels,
    );

    // ---------------------------------------------------------------------
    // Stitch back: anchor each collapsed sub-result inside the bbox the
    // top-level pass assigned to the corresponding opaque cluster node,
    // and merge per-node positions + per-edge polylines.
    // ---------------------------------------------------------------------
    const nodes = new Map<string, NodeLayout>();
    const edges = new Map<string, EdgeLayout>();
    for (const [id, nl] of top.nodes) {
      if (!collapsedClusterId.has(stripClusterPrefix(id))) {
        // Real node (or an inner cluster that lives at the top level).
        nodes.set(id, nl);
      }
    }
    for (const [k, el] of top.edges) edges.set(k, el);

    // Translate each collapsed sub-result so its (0,0) anchor aligns with
    // the position of its opaque cluster node in `top`.
    for (const [sgId, sub] of collapsedFor) {
      const clusterId = collapsedClusterId.get(sgId)!;
      const placed = top.nodes.get(clusterId);
      if (!placed) continue;
      const dx = placed.x;
      const dy = placed.y;
      for (const [id, nl] of sub.nodes) {
        nodes.set(id, { x: nl.x + dx, y: nl.y + dy, w: nl.w, h: nl.h });
      }
      for (const [k, el] of sub.edges) {
        const newEdge: EdgeLayout = {
          id: el.id,
          from: el.from,
          to: el.to,
          points: el.points.map((p) => ({ x: p.x + dx, y: p.y + dy })),
        };
        if (el.labelPos) {
          newEdge.labelPos = { x: el.labelPos.x + dx, y: el.labelPos.y + dy };
        }
        if (el.curve) newEdge.curve = el.curve;
        if (el.labelBox) {
          newEdge.labelBox = {
            x: el.labelBox.x + dx,
            y: el.labelBox.y + dy,
            width: el.labelBox.width,
            height: el.labelBox.height,
          };
        }
        edges.set(k, newEdge);
      }
    }

    // ---------------------------------------------------------------------
    // Subgraph bboxes: union of (now-final) member-node positions.
    // ---------------------------------------------------------------------
    const subgraphs = new Map<string, BBox>();
    for (const sgId of graph.subgraphs.keys()) {
      const members = allMembersOf.get(sgId)!;
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const id of members) {
        const nl = nodes.get(id);
        if (!nl) continue;
        if (nl.x < minX) minX = nl.x;
        if (nl.y < minY) minY = nl.y;
        if (nl.x + nl.w > maxX) maxX = nl.x + nl.w;
        if (nl.y + nl.h > maxY) maxY = nl.y + nl.h;
      }
      if (minX === Infinity) subgraphs.set(sgId, { x: 0, y: 0, w: 0, h: 0 });
      else subgraphs.set(sgId, { x: minX, y: minY, w: maxX - minX, h: maxY - minY });
    }

    // ---------------------------------------------------------------------
    // Step F3 — visibility-graph obstacle-avoiding routing post-pass.
    //
    // This is the only place every node box AND every cluster bbox coexist in
    // one global coordinate space, so routing slots in here (the per-layoutFlat
    // xlabel pass can't see cluster bboxes). For each edge we test its current
    // polyline against the obstacle set; a clear path is left EXACTLY as-is
    // (byte-identical), and only a path that actually crosses an obstacle gets
    // re-routed through the free space between obstacles. Runs before nothing
    // else mutates the polylines, so labels follow the final routed path.
    // ---------------------------------------------------------------------
    const routeAroundObstacles = opts.routeAroundObstacles ?? true;
    if (routeAroundObstacles) {
      const nodeBoxes: NodeBox[] = [];
      for (const [id, nl] of nodes) {
        nodeBoxes.push({ id, x: nl.x, y: nl.y, w: nl.w, h: nl.h });
      }
      const clusterBoxes: ClusterBox[] = [];
      for (const [sgId, bb] of subgraphs) {
        clusterBoxes.push({
          id: sgId,
          x: bb.x,
          y: bb.y,
          w: bb.w,
          h: bb.h,
          members: allMembersOf.get(sgId) ?? new Set<string>(),
        });
      }
      // Route margin: obstacles are NOT inflated for the gating test. Sugiyama
      // already routes 2-rank edges around an intervening node via a dummy
      // waypoint that sits just clear of the node box; inflating obstacles even
      // a few px makes such an already-clear waypoint route graze the inflated
      // box and triggers a spurious detour (breaking the byte-identical
      // guarantee). With margin 0 only a path that genuinely enters a node /
      // cluster box re-routes, which is exactly the gating property we want.
      const routeMargin = 0;
      for (const [k, el] of edges) {
        const pts = el.points;
        if (pts.length < 2) continue;
        const source = pts[0]!;
        const target = pts[pts.length - 1]!;
        const obstacles = buildObstacles(
          el.from,
          el.to,
          nodeBoxes,
          clusterBoxes,
          routeMargin,
        );
        // Gate on the EXISTING polyline (which may already include sugiyama
        // dummy-waypoint bends or an F2b bow). If every segment of the current
        // route is already obstacle-free, leave the edge byte-identical — this
        // is the critical gating property. Only a genuinely-crossing route
        // proceeds to visibility routing.
        if (!pathBlocked(pts, obstacles)) continue;
        let detour: ReturnType<typeof visibilityRoute> = null;
        try {
          detour = visibilityRoute(source, target, obstacles);
        } catch {
          detour = null;
        }
        if (!detour || detour.length === 0) continue;
        // Replace the interior bends with the detour and flag for smoothing.
        const routed: Point[] = [source, ...detour, target];
        const newEdge: EdgeLayout = {
          id: el.id,
          from: el.from,
          to: el.to,
          points: routed,
          curve: 'bezier',
        };
        if (el.labelPos) newEdge.labelPos = el.labelPos;
        if (el.labelBox) newEdge.labelBox = el.labelBox;
        edges.set(k, newEdge);
      }
    }

    // ---------------------------------------------------------------------
    // Final bbox: union of all real-node positions, padded by margin.
    // ---------------------------------------------------------------------
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const nl of nodes.values()) {
      if (nl.x < minX) minX = nl.x;
      if (nl.y < minY) minY = nl.y;
      if (nl.x + nl.w > maxX) maxX = nl.x + nl.w;
      if (nl.y + nl.h > maxY) maxY = nl.y + nl.h;
    }
    const bbox: BBox =
      minX === Infinity
        ? { x: 0, y: 0, w: 0, h: 0 }
        : { x: 0, y: 0, w: maxX + margin, h: maxY + margin };

    return { nodes, edges, subgraphs, bbox };
  }

  /**
   * Lay out a flat subset of nodes (no recursive subgraph descent) in the
   * given direction. Returns positions and polylines anchored at (0,0).
   *
   * This is the body that used to be `layout()` in Step A — extracted so
   * `layout()` can call it multiple times for recursive directional
   * subgraphs.
   */
  private layoutFlat(
    nodeIds: string[],
    nodeSpecs: Map<string, NodeSpec>,
    inputEdges: EdgeSpec[],
    direction: Dir,
    nodeSep: number,
    rankSep: number,
    margin: number,
    flowReorder: boolean,
    avoidLabelCollisions: boolean,
    adjacentSwap: boolean,
    useXLabels: boolean,
  ): FlatLayout {
    const dummyGap = DEFAULT_DUMMY_GAP;
    const lr = direction === 'LR' || direction === 'RL';

    // 1. Build sugiyama edges. Self-loops skip (no rank meaning); edges
    //    whose endpoints aren't in this subset are also dropped.
    const idSet = new Set(nodeIds);
    const layoutEdges: LayoutEdge[] = [];
    const acceptedEdges: EdgeSpec[] = [];
    for (const e of inputEdges) {
      if (e.from === e.to) continue;
      if (!idSet.has(e.from) || !idSet.has(e.to)) continue;
      layoutEdges.push({
        from: e.from,
        to: e.to,
        rel: placeholderRel(e),
        reversed: false,
      });
      acceptedEdges.push(e);
    }

    if (nodeIds.length === 0) {
      return { nodes: new Map(), edges: new Map(), w: 0, h: 0 };
    }

    // 2. Run the legacy sugiyama pipeline.
    removeCycles(nodeIds, layoutEdges);
    const baseLayers = assignLayers(nodeIds, layoutEdges);
    const dummy = insertDummies(nodeIds, layoutEdges, baseLayers);
    const initialGroups = groupByLayer(dummy.extendedNodeIds, dummy.layers);
    const median = minimizeCrossings(initialGroups, dummy.segments);
    // Phase 1 Step D2 — flow-based finalization pass. See `flowReorderLayers`
    // for the weighted-barycenter algorithm. Gated so callers can A/B-test
    // it against the pure-median baseline.
    const flowed = flowReorder
      ? flowReorderLayers(median, dummy.segments)
      : median;
    // Phase 1 Step D4 — adjacent-pair swap polishing pass. Runs after
    // flow-reorder so the local search starts from the best heuristic
    // ordering and can only improve from there. See `adjacentSwapLayers`.
    const ordered = adjacentSwap
      ? adjacentSwapLayers(flowed, dummy.segments)
      : flowed;

    // 3. Per-rank extent (height in TB, width in LR).
    const rankExtent = ordered.map((layer) => {
      let v = 0;
      for (const id of layer) {
        if (dummy.dummyIds.has(id)) continue;
        const n = nodeSpecs.get(id);
        if (!n) continue;
        const ext = lr ? n.width : n.height;
        if (ext > v) v = ext;
      }
      return v;
    });

    // 4. Within-layer coordinates.
    const coords = assignCoordinates({
      orderedLayers: ordered,
      segments: dummy.segments,
      widthOf: (id) => {
        const n = nodeSpecs.get(id);
        if (!n) return 0;
        return lr ? n.height : n.width;
      },
      dummyIds: dummy.dummyIds,
      horizontalGap: nodeSep,
      dummyGap,
    });

    // 5. Translate centres into NodeLayouts (anchored at margin).
    const nodes = new Map<string, NodeLayout>();
    const centres = new Map<string, Point>();
    let rankCursor = margin;
    for (let l = 0; l < ordered.length; l++) {
      const layer = ordered[l]!;
      const extent = rankExtent[l]!;
      for (const id of layer) {
        const inLayer = margin + coords.centerX.get(id)!;
        const isDummy = dummy.dummyIds.has(id);
        if (lr) {
          const cx = rankCursor + extent / 2;
          const cy = inLayer;
          centres.set(id, { x: cx, y: cy });
          if (!isDummy) {
            const n = nodeSpecs.get(id)!;
            nodes.set(id, {
              x: rankCursor + (extent - n.width) / 2,
              y: cy - n.height / 2,
              w: n.width,
              h: n.height,
            });
          }
        } else {
          const cx = inLayer;
          const cy = rankCursor + extent / 2;
          centres.set(id, { x: cx, y: cy });
          if (!isDummy) {
            const n = nodeSpecs.get(id)!;
            nodes.set(id, {
              x: cx - n.width / 2,
              y: rankCursor,
              w: n.width,
              h: n.height,
            });
          }
        }
      }
      rankCursor += extent + rankSep;
    }

    // 6. Polylines for each accepted edge. Cycle-removal may have flipped
    //    orientation — `DrawableEdge.fromId/toId` reflects the laid-out
    //    direction, so we trace from there and re-key by the original
    //    input edge.
    const edges = new Map<string, EdgeLayout>();
    const drawable = dummy.drawable;
    // Snapshot the laid-out real-node rectangles once for collision testing
    // (Step D3). We snapshot the laid-out rectangles (not centres) so a
    // label rectangle that sits on top of a node clearly fails the overlap
    // check.
    const nodeRects: Rect[] = [];
    for (const nl of nodes.values()) {
      nodeRects.push({ x: nl.x, y: nl.y, w: nl.w, h: nl.h });
    }
    // Already-placed label boxes accumulate so subsequent labels can avoid
    // them too. We process edges in `acceptedEdges` order, which is the
    // caller's source order — deterministic and reproducible across runs.
    //
    // Step F1: when `useXLabels` is on, the D3 per-edge probe is bypassed; we
    // instead collect each label's polyline midpoint as a force-pass anchor
    // (see `xlabelInputs`) and resolve all boxes together afterward. D3 and
    // xlabel are mutually exclusive — xlabel wins.
    const placedLabels: Rect[] = [];
    const xlabelInputs: XLabelInput[] = [];
    // Track how many edges we have already keyed for each `from->to` pair so
    // parallel edges (same source + target) get distinct keys. The first edge
    // of a pair keeps the plain `edgeKey` (so single-edge callers/tests are
    // unaffected); subsequent mates are suffixed `#1`, `#2`, … An explicit
    // `EdgeSpec.id` always wins and bypasses this disambiguation.
    const pairSeen = new Map<string, number>();
    let di = 0;
    for (const e of acceptedEdges) {
      const key = edgeIdFor(e, pairSeen);
      const d = drawable[di++];
      if (!d) continue;
      const points: Point[] = [];
      const startId = d.reversed ? d.toId : d.fromId;
      const endId = d.reversed ? d.fromId : d.toId;
      const startC = centres.get(startId);
      if (startC) points.push(startC);
      const wps = d.reversed ? [...d.waypoints].reverse() : d.waypoints;
      for (const w of wps) {
        const c = centres.get(w);
        if (c) points.push(c);
      }
      const endC = centres.get(endId);
      if (endC) points.push(endC);
      // Sugiyama produced a polyline whose interior points are dummy-node
      // centres. When it has ≥1 bend (i.e. `points.length >= 3`) we mark
      // the edge as a Bezier candidate so renderers can smooth the corners.
      // Straight 2-point edges stay `'straight'` — there's nothing to
      // smooth there.
      const curve: 'straight' | 'bezier' = points.length >= 3 ? 'bezier' : 'straight';
      const layout: EdgeLayout = { id: key, from: e.from, to: e.to, points, curve };
      if (e.labelSize && points.length >= 2) {
        if (useXLabels) {
          // Anchor the force-pass body at the polyline midpoint.
          xlabelInputs.push({
            id: key,
            size: { w: e.labelSize.w, h: e.labelSize.h },
            anchor: polylineMidpoint(points),
            path: points,
          });
        } else if (avoidLabelCollisions) {
          const box = placeLabelBox(points, e.labelSize, nodeRects, placedLabels);
          if (box) {
            layout.labelBox = { x: box.x, y: box.y, width: box.w, height: box.h };
            placedLabels.push(box);
          }
        }
      }
      edges.set(key, layout);
    }

    // Step F1: force-directed external label placement. Runs once over all
    // labels so it can pull parallel-edge labels apart and shove any label
    // out of a node box. The resolved rectangle replaces the seeded midpoint
    // on each edge's `labelBox` (top-left anchored, matching D3's contract).
    if (useXLabels && xlabelInputs.length > 0) {
      const { boxes } = placeExternalLabels({ nodes: nodeRects, labels: xlabelInputs });
      for (const inp of xlabelInputs) {
        const box = boxes.get(inp.id);
        const layout = edges.get(inp.id);
        if (box && layout) {
          layout.labelBox = { x: box.x, y: box.y, width: box.w, height: box.h };
        }
      }
    }

    // 7. Overall extent (anchored at (0,0) with a margin border on right/
    //    bottom; left/top already started at `margin`).
    let maxX = 0;
    let maxY = 0;
    for (const nl of nodes.values()) {
      if (nl.x + nl.w > maxX) maxX = nl.x + nl.w;
      if (nl.y + nl.h > maxY) maxY = nl.y + nl.h;
    }
    return { nodes, edges, w: maxX + margin, h: maxY + margin };
  }
}

// ---------------------------------------------------------------------------
// Phase 1 Step D3 — edge-label collision avoidance.
// ---------------------------------------------------------------------------

/** Axis-aligned rectangle in layout space. */
interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Compute the label rectangle (anchored at top-left) for an edge, sliding
 * along the polyline so it avoids overlap with node rectangles and any
 * already-placed labels.
 *
 * Strategy:
 *   1. Pick the polyline midpoint as the initial centre.
 *   2. If the rectangle centred there is clear, accept it.
 *   3. Otherwise probe a small ladder of offsets (±10%, ±20%, ±30% of arc
 *      length, paired so we try a backward shift right after each forward
 *      shift) along the polyline. The first clear slot wins.
 *   4. If nothing clears, return the midpoint rectangle (graceful
 *      degradation — better to overlap than to drop the label).
 *
 * For multi-segment / bezier edges we treat the polyline as a piecewise
 * straight approximation: arc length is summed segment-by-segment and the
 * candidate centre is the point at that arc length along the polyline.
 */
function placeLabelBox(
  points: Point[],
  labelSize: { w: number; h: number },
  nodeRects: Rect[],
  placedLabels: Rect[],
): Rect | null {
  if (points.length < 2) return null;
  const segLens: number[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i]!.x - points[i - 1]!.x;
    const dy = points[i]!.y - points[i - 1]!.y;
    const L = Math.hypot(dx, dy);
    segLens.push(L);
    total += L;
  }
  if (total === 0) {
    const p = points[0]!;
    return centredRect(p, labelSize);
  }
  // Offsets are signed fractions of `total`; midpoint first, then the
  // probe ladder. Symmetric small steps first so the chosen slot stays
  // visually close to the midpoint when there's any clear option.
  const offsets = [0, 0.1, -0.1, 0.2, -0.2, 0.3, -0.3];
  let fallback: Rect | null = null;
  for (let i = 0; i < offsets.length; i++) {
    const frac = 0.5 + offsets[i]!;
    if (frac < 0 || frac > 1) continue;
    const centre = pointAtArc(points, segLens, frac * total);
    const rect = centredRect(centre, labelSize);
    if (fallback === null) fallback = rect; // midpoint is the safety net
    if (collidesAny(rect, nodeRects) || collidesAny(rect, placedLabels)) continue;
    return rect;
  }
  return fallback;
}

/**
 * Arc-length midpoint of a polyline — the point halfway along its total
 * length. Used as the force-pass anchor for an edge label (Step F1).
 */
function polylineMidpoint(points: Point[]): Point {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return points[0]!;
  const segLens: number[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i]!.x - points[i - 1]!.x;
    const dy = points[i]!.y - points[i - 1]!.y;
    const L = Math.hypot(dx, dy);
    segLens.push(L);
    total += L;
  }
  if (total === 0) return points[0]!;
  return pointAtArc(points, segLens, total / 2);
}

function centredRect(p: Point, labelSize: { w: number; h: number }): Rect {
  return {
    x: p.x - labelSize.w / 2,
    y: p.y - labelSize.h / 2,
    w: labelSize.w,
    h: labelSize.h,
  };
}

/** Linearly interpolate along the polyline for a given arc-length target. */
function pointAtArc(points: Point[], segLens: number[], target: number): Point {
  if (points.length === 0) return { x: 0, y: 0 };
  if (target <= 0) return points[0]!;
  let remaining = target;
  for (let i = 0; i < segLens.length; i++) {
    const L = segLens[i]!;
    if (remaining <= L) {
      const t = L === 0 ? 0 : remaining / L;
      const a = points[i]!;
      const b = points[i + 1]!;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    remaining -= L;
  }
  return points[points.length - 1]!;
}

function collidesAny(r: Rect, rects: Rect[]): boolean {
  for (const o of rects) {
    if (rectsOverlap(r, o)) return true;
  }
  return false;
}

function rectsOverlap(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

/**
 * If `id` is one of our synthetic cluster ids (`__cluster__<sgId>`), return
 * the underlying `sgId`. Otherwise return `id` unchanged. Used so we can
 * filter cluster placeholders out of the final node map without false
 * positives on real ids that happen to share the prefix.
 */
function stripClusterPrefix(id: string): string {
  const PFX = '__cluster__';
  return id.startsWith(PFX) ? id.slice(PFX.length) : id;
}

/**
 * Stable result-map key for an edge.
 *
 * - An explicit `EdgeSpec.id` is honoured verbatim (the caller owns identity).
 * - Otherwise we fall back to `edgeKey(from,to)` for the first edge of a pair
 *   and `edgeKey(from,to)#n` (n = 1, 2, …) for each subsequent parallel mate.
 *   This keeps non-parallel callers byte-identical to the old `edgeKey`
 *   behaviour while guaranteeing parallel edges (same from + same to) survive
 *   as distinct entries. `pairSeen` accumulates the per-pair counter across a
 *   single `layoutFlat` pass.
 */
function edgeIdFor(
  e: Pick<EdgeSpec, 'id' | 'from' | 'to'>,
  pairSeen: Map<string, number>,
): string {
  if (e.id !== undefined) return e.id;
  const base = edgeKey(e);
  const n = pairSeen.get(base) ?? 0;
  pairSeen.set(base, n + 1);
  return n === 0 ? base : `${base}#${n}`;
}

/**
 * Phase 1 Step D2 — weighted-barycenter finalization pass over layered
 * orderings produced by `minimizeCrossings`.
 *
 * For each layer (alternating top-down and bottom-up sweeps), each node's
 * new "barycentre" is a weighted blend of:
 *
 *   * the mean position of its neighbours in the prior layer (weight 1.0 —
 *     this is the "source-following" alignment),
 *   * the mean position of its neighbours in the next layer (weight 0.5 —
 *     this nudges branching parents to centre over their children).
 *
 * Nodes with no neighbours at all keep their current index as a stable
 * tiebreaker so the sort is deterministic. The pass iterates up to 4 sweep
 * pairs or until the ordering stops changing, then commits the result only
 * if it didn't strictly worsen the global crossing count. The "never worse"
 * gate matches `minimizeCrossings`'s own best-of-iterations invariant and
 * keeps us safe from pathological inputs where the weighted barycentre
 * would otherwise reintroduce crossings.
 *
 * Implementation notes:
 *   * we operate on the same `LayoutSegment` list `minimizeCrossings` uses,
 *     so dummy nodes (long-edge waypoints) participate naturally;
 *   * sweeps re-derive prev/next neighbour indices from the *current* order
 *     so each pass observes the previous pass's improvements;
 *   * we never mutate the input — the caller's `median` reference stays
 *     intact for diagnostics.
 */
export function flowReorderLayers(
  initial: string[][],
  segments: LayoutSegment[],
  options: { maxSweeps?: number; prevWeight?: number; nextWeight?: number } = {},
): string[][] {
  if (initial.length <= 1) return initial.map((g) => [...g]);

  const maxSweeps = options.maxSweeps ?? 4;
  const prevWeight = options.prevWeight ?? 1.0;
  const nextWeight = options.nextWeight ?? 0.5;

  let current = initial.map((g) => [...g]);
  let best = current.map((g) => [...g]);
  let bestCrossings = countCrossings(current, segments);

  // Pre-bucket segments by the layer of each endpoint so per-layer sweeps
  // don't re-scan the full segment list. We don't know each endpoint's
  // layer a priori, so we discover it from the current ordering.
  const layerOf = new Map<string, number>();
  const indexLayers = (layers: string[][]): void => {
    layerOf.clear();
    for (let l = 0; l < layers.length; l++) {
      for (const id of layers[l]!) layerOf.set(id, l);
    }
  };

  // Build adjacency in the form { id -> { prev: string[], next: string[] } }
  // where "prev" means neighbours in the layer just above (smaller layer
  // index) and "next" means those just below.
  type Adj = { prev: string[]; next: string[] };
  const buildAdjacency = (): Map<string, Adj> => {
    const adj = new Map<string, Adj>();
    for (const layer of current) {
      for (const id of layer) adj.set(id, { prev: [], next: [] });
    }
    for (const seg of segments) {
      const fa = layerOf.get(seg.from);
      const ta = layerOf.get(seg.to);
      if (fa === undefined || ta === undefined) continue;
      // segments are within-layer-pair (adjacent layers); honour direction
      // by always pushing the lower-layer endpoint into the upper endpoint's
      // `prev` list and vice versa.
      if (fa < ta) {
        adj.get(seg.to)!.prev.push(seg.from);
        adj.get(seg.from)!.next.push(seg.to);
      } else if (ta < fa) {
        adj.get(seg.from)!.prev.push(seg.to);
        adj.get(seg.to)!.next.push(seg.from);
      }
      // same-layer segments (shouldn't happen after dummy insertion) are
      // ignored — they have no notion of "prev" or "next".
    }
    return adj;
  };

  /**
   * Reorder a single layer in-place. The barycentre for each node is the
   * weighted mean of its prev-layer neighbours' indices (weight `prevWeight`)
   * and next-layer neighbours' indices (weight `nextWeight`). Nodes whose
   * weight sum is zero keep their current index as a stable tiebreaker.
   */
  const reorderLayer = (layerIdx: number, adj: Map<string, Adj>): boolean => {
    const layer = current[layerIdx]!;
    if (layer.length <= 1) return false;

    const prevIdx =
      layerIdx > 0 ? new Map(current[layerIdx - 1]!.map((id, i) => [id, i])) : null;
    const nextIdx =
      layerIdx < current.length - 1
        ? new Map(current[layerIdx + 1]!.map((id, i) => [id, i]))
        : null;

    const bary = new Map<string, number>();
    for (let i = 0; i < layer.length; i++) {
      const id = layer[i]!;
      const a = adj.get(id);
      let num = 0;
      let den = 0;
      if (a && prevIdx) {
        for (const p of a.prev) {
          const ix = prevIdx.get(p);
          if (ix !== undefined) {
            num += ix * prevWeight;
            den += prevWeight;
          }
        }
      }
      if (a && nextIdx) {
        for (const n of a.next) {
          const ix = nextIdx.get(n);
          if (ix !== undefined) {
            num += ix * nextWeight;
            den += nextWeight;
          }
        }
      }
      bary.set(id, den === 0 ? i : num / den);
    }

    // Stable sort by barycentre (Array.prototype.sort is stable in modern V8).
    const before = layer.slice();
    layer.sort((a, b) => bary.get(a)! - bary.get(b)!);
    for (let i = 0; i < layer.length; i++) {
      if (layer[i] !== before[i]) return true;
    }
    return false;
  };

  for (let sweep = 0; sweep < maxSweeps; sweep++) {
    indexLayers(current);
    const adj = buildAdjacency();

    let changed = false;
    for (let l = 0; l < current.length; l++) {
      if (reorderLayer(l, adj)) changed = true;
    }
    // Rebuild indices because top-down moves shift adjacency targets for
    // the bottom-up half of the sweep.
    indexLayers(current);
    const adj2 = buildAdjacency();
    for (let l = current.length - 1; l >= 0; l--) {
      if (reorderLayer(l, adj2)) changed = true;
    }

    const c = countCrossings(current, segments);
    if (c < bestCrossings) {
      bestCrossings = c;
      best = current.map((g) => [...g]);
    } else if (c > bestCrossings) {
      // Worse — revert and stop. We never let the finalization pass make
      // crossings worse than the input median ordering.
      current = best.map((g) => [...g]);
      break;
    }
    if (!changed) break;
  }

  return best;
}

/**
 * Phase 1 Step D4 — adjacent-pair swap finalization pass.
 *
 * After median (`minimizeCrossings`) and weighted-barycenter (`flowReorder`)
 * have done the bulk of the work, residual crossings can remain in a handful
 * of tricky shapes:
 *
 *   * long edges (multi-rank, routed through dummy waypoints) that cross
 *     locally-clean sub-layouts;
 *   * symmetric forks where median had no signal to pick a particular child
 *     order and chose arbitrarily;
 *   * bipartite "two cluster" sub-graphs with a single stray edge between the
 *     clusters that the heuristics can't pull through.
 *
 * The algorithm is an exhaustive local search at the finest possible
 * granularity (single adjacent-pair swaps). For each sweep:
 *
 *   1. Walk every layer; for every adjacent pair `(i, i+1)` measure the
 *      crossings the pair contributes against the layer above and the layer
 *      below.
 *   2. Swap, re-measure those same crossings.
 *   3. If the swap *strictly* reduces them, keep it (and flag the sweep as
 *      having made progress). Otherwise revert.
 *
 * Sweeps repeat until either a full sweep finds no improving swap (we are at
 * a local optimum) or we hit a hard cap of `maxSweeps` (default 20). The
 * cap exists purely to bound worst-case runtime on pathological inputs;
 * convergence is monotone-non-increasing so we never make the layout worse.
 *
 * Local crossing measurement: only the two layer pairs touching the swapped
 * layer can change, so we count crossings on those pairs (not the whole
 * graph) for O(L · N · E_local) per sweep instead of O(L^2 · …).
 */
export function adjacentSwapLayers(
  initial: string[][],
  segments: LayoutSegment[],
  options: { maxSweeps?: number } = {},
): string[][] {
  if (initial.length === 0) return [];
  const maxSweeps = options.maxSweeps ?? 20;
  const layers = initial.map((g) => [...g]);

  // Bucket segments by the (lower-indexed) layer pair they live on. We
  // can't pre-compute this on the input alone — segments span adjacent
  // layers but we don't know each endpoint's layer up front. We discover
  // it from the current ordering once and refresh inside the loop because
  // a swap of layer L only changes layers L-1..L and L..L+1.
  //
  // pairs[i] = segments that connect layer i and layer i+1.
  const pairs: LayoutSegment[][] = [];
  const layerOf = new Map<string, number>();
  for (let l = 0; l < layers.length; l++) {
    for (const id of layers[l]!) layerOf.set(id, l);
    pairs.push([]);
  }
  for (const seg of segments) {
    const fa = layerOf.get(seg.from);
    const ta = layerOf.get(seg.to);
    if (fa === undefined || ta === undefined) continue;
    const lo = Math.min(fa, ta);
    const hi = Math.max(fa, ta);
    // Only adjacent layers count (post-dummy insertion this is the norm).
    if (hi - lo !== 1) continue;
    pairs[lo]!.push(seg);
  }

  /**
   * Count crossings on a single layer pair given the current ordering of
   * `top` and `bot`. Equivalent to the per-pair half of
   * `countCrossings` in `sugiyama.ts` but inlined so we can call it
   * incrementally per swap without rebuilding intermediate state.
   */
  const countPair = (top: string[], bot: string[], pairSegs: LayoutSegment[]): number => {
    if (pairSegs.length < 2) return 0;
    const topIdx = new Map<string, number>();
    for (let i = 0; i < top.length; i++) topIdx.set(top[i]!, i);
    const botIdx = new Map<string, number>();
    for (let i = 0; i < bot.length; i++) botIdx.set(bot[i]!, i);
    const xs: Array<[number, number]> = [];
    for (const s of pairSegs) {
      if (topIdx.has(s.from) && botIdx.has(s.to)) {
        xs.push([topIdx.get(s.from)!, botIdx.get(s.to)!]);
      } else if (topIdx.has(s.to) && botIdx.has(s.from)) {
        xs.push([topIdx.get(s.to)!, botIdx.get(s.from)!]);
      }
    }
    let n = 0;
    for (let i = 0; i < xs.length; i++) {
      for (let j = i + 1; j < xs.length; j++) {
        const [a1, b1] = xs[i]!;
        const [a2, b2] = xs[j]!;
        if ((a1 < a2 && b1 > b2) || (a1 > a2 && b1 < b2)) n++;
      }
    }
    return n;
  };

  /**
   * Crossings touching layer `l`: the pair (l-1, l) above and (l, l+1)
   * below. This is the *only* slice of the global crossing count that
   * changes when we reorder layer `l`, so comparing this before vs. after
   * a candidate swap is equivalent to comparing the global count.
   */
  const touchingCount = (l: number): number => {
    let n = 0;
    if (l > 0) n += countPair(layers[l - 1]!, layers[l]!, pairs[l - 1]!);
    if (l < layers.length - 1) n += countPair(layers[l]!, layers[l + 1]!, pairs[l]!);
    return n;
  };

  for (let sweep = 0; sweep < maxSweeps; sweep++) {
    let improved = false;
    for (let l = 0; l < layers.length; l++) {
      const layer = layers[l]!;
      if (layer.length < 2) continue;
      for (let i = 0; i + 1 < layer.length; i++) {
        const before = touchingCount(l);
        if (before === 0) {
          // No crossings touch this layer — no swap on it can improve
          // anything. Skip to the next layer for a small speed-up.
          break;
        }
        // Swap.
        const tmp = layer[i]!;
        layer[i] = layer[i + 1]!;
        layer[i + 1] = tmp;
        const after = touchingCount(l);
        if (after < before) {
          improved = true;
        } else {
          // Revert: equal-cost swaps are rejected to keep the ordering
          // stable across runs (deterministic output) and to guarantee
          // termination — without this guard the loop could oscillate
          // between two equal-cost orderings indefinitely.
          layer[i + 1] = layer[i]!;
          layer[i] = tmp;
        }
      }
    }
    if (!improved) break;
  }

  return layers;
}
