/**
 * Phase 1 Step F3 — visibility-graph based obstacle-avoiding edge routing.
 *
 * GraphViz routes edge splines through the *free space* between obstacles: it
 * builds a visibility graph whose vertices are obstacle corners (plus the edge
 * endpoints) and whose edges connect any two vertices that "see" each other
 * (the segment between them does not pass through an obstacle's interior). A
 * shortest path through that graph is a polyline that hugs obstacle corners
 * without ever crossing one; the renderer then smooths it into a spline.
 *
 * This module is a self-contained, pure re-implementation of that idea. It is
 * deliberately decoupled from the sugiyama backend: it consumes plain geometry
 * (axis-aligned obstacle rectangles, a source point and a target point) and
 * returns either a detour polyline (interior bends, endpoints excluded) or
 * `null` when the direct source→target segment is already obstacle-free.
 *
 * The caller (`DotSugiyamaEngine.layout`) wires it in as a post-processing pass
 * over the stitched, global-coordinate layout — the only place where every node
 * box AND every cluster bbox coexist in a single coordinate space. Crucially it
 * only *changes* an edge when the direct path actually hits an obstacle; a clear
 * path is left byte-identical (the most important correctness property here).
 */

/** A point in layout space. */
export interface RoutePoint {
  x: number;
  y: number;
}

/** Axis-aligned obstacle rectangle (top-left anchored). */
export interface Obstacle {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RouteOptions {
  /**
   * Hard cap on visibility-graph vertices. Past this the route falls back to
   * the direct path (returns `null`) rather than do unbounded work. Each
   * obstacle contributes 4 corners, so the default admits a few dozen nearby
   * obstacles.
   */
  maxVertices?: number;
}

const DEFAULTS: Required<RouteOptions> = {
  maxVertices: 200,
};

/**
 * Numerical slop. Segment/rectangle tests treat anything within this distance
 * of a boundary as "touching" (not "crossing") so an endpoint anchored exactly
 * ON an obstacle edge — or a vertex placed exactly on a corner — does not
 * register as a collision.
 */
const EPS = 1e-6;

/** A node box plus the id it belongs to (for endpoint exclusion). */
export interface NodeBox extends Obstacle {
  id: string;
}

/** A cluster bbox plus the set of node ids it (transitively) contains. */
export interface ClusterBox extends Obstacle {
  id: string;
  members: Set<string>;
}

/**
 * Assemble the obstacle set for routing one edge from `fromId` to `toId`.
 *
 * Obstacles are every node box (inflated by `margin`) and every cluster bbox
 * (inflated by `margin`), EXCEPT:
 *   - the edge's own two endpoint node boxes (the edge must touch them), and
 *   - any cluster that contains either endpoint (a cross-cluster edge has to be
 *     allowed to enter/exit the clusters of its own endpoints; it must still
 *     avoid OTHER clusters and unrelated nodes).
 *
 * Degenerate (zero-area) cluster bboxes are skipped. The returned rectangles are
 * already inflated, so the caller passes them straight to {@link visibilityRoute}.
 */
export function buildObstacles(
  fromId: string,
  toId: string,
  nodes: NodeBox[],
  clusters: ClusterBox[],
  margin: number,
): Obstacle[] {
  const out: Obstacle[] = [];
  for (const n of nodes) {
    if (n.id === fromId || n.id === toId) continue;
    out.push(inflate(n, margin));
  }
  for (const c of clusters) {
    if (c.w <= 0 || c.h <= 0) continue;
    if (c.members.has(fromId) || c.members.has(toId)) continue;
    out.push(inflate(c, margin));
  }
  return out;
}

function inflate(o: Obstacle, margin: number): Obstacle {
  return {
    x: o.x - margin,
    y: o.y - margin,
    w: o.w + 2 * margin,
    h: o.h + 2 * margin,
  };
}

/**
 * Returns a detour polyline (the INTERIOR bend points, source/target excluded)
 * that routes from `source` to `target` without crossing any obstacle's
 * interior, or `null` when the direct `source→target` segment is already clear.
 *
 * The polyline is built from a visibility graph over the (already-inflated)
 * obstacle corners plus the two endpoints, with a shortest (Dijkstra) path
 * between them. The function never throws: on any failure (no path found, too
 * many vertices, degenerate input) it returns `null` so the caller keeps the
 * direct path.
 *
 * The returned interior points are guaranteed to (a) lie outside every obstacle
 * interior and (b) form, together with `source`/`target`, a polyline whose every
 * segment is obstacle-free under {@link segmentCrossesObstacle}.
 */
export function visibilityRoute(
  source: RoutePoint,
  target: RoutePoint,
  obstacles: Obstacle[],
  options?: RouteOptions,
): RoutePoint[] | null {
  const opt = { ...DEFAULTS, ...(options ?? {}) };

  // Fast path: nothing in the way → no detour. This is the gate that keeps the
  // huge majority of edges byte-identical.
  if (!pathBlocked([source, target], obstacles)) return null;

  // Collect candidate vertices: every obstacle corner (pushed a hair OUTWARD so
  // it sits just outside the rect and "sees" past the obstacle), plus the two
  // endpoints. Corners that fall inside *another* obstacle are useless as
  // waypoints, so we drop them.
  const verts: RoutePoint[] = [source, target];
  for (const o of obstacles) {
    for (const c of cornerCandidates(o)) {
      if (!pointInAnyObstacle(c, obstacles)) verts.push(c);
    }
    if (verts.length > opt.maxVertices) return null;
  }

  const n = verts.length;
  // Build the visibility adjacency: an edge i↔j when the segment verts[i]→
  // verts[j] crosses no obstacle interior. O(n² · obstacles) — bounded by
  // `maxVertices`.
  const adj: Array<Array<{ to: number; cost: number }>> = verts.map(() => []);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (!pathBlocked([verts[i]!, verts[j]!], obstacles)) {
        const cost = dist(verts[i]!, verts[j]!);
        adj[i]!.push({ to: j, cost });
        adj[j]!.push({ to: i, cost });
      }
    }
  }

  // Dijkstra from source (index 0) to target (index 1).
  const path = dijkstra(adj, 0, 1, n);
  if (!path || path.length < 2) return null;

  // Strip the endpoints — the caller already owns source/target — and return
  // the interior bends. If the shortest path is the direct edge (no interior),
  // there's nothing to detour around after all.
  const interior = path.slice(1, -1).map((idx) => verts[idx]!);
  if (interior.length === 0) return null;
  return interior;
}

/**
 * True when any segment of `polyline` crosses the interior of any obstacle.
 * A polyline whose vertices merely touch an obstacle boundary is NOT blocked.
 */
export function pathBlocked(polyline: RoutePoint[], obstacles: Obstacle[]): boolean {
  for (let i = 1; i < polyline.length; i++) {
    const a = polyline[i - 1]!;
    const b = polyline[i]!;
    for (const o of obstacles) {
      if (segmentCrossesObstacle(a, b, o)) return true;
    }
  }
  return false;
}

/**
 * Robust segment-vs-rectangle interior test.
 *
 * Returns `true` when the open segment a→b passes through the *interior* of
 * rectangle `o`. Touching a boundary, running colinear along an edge, or
 * terminating exactly on the boundary all return `false` — this is what lets an
 * edge endpoint anchored ON an obstacle's boundary, or a routing vertex placed
 * on a corner, not register as a crossing.
 *
 * Method: the segment crosses the rect interior iff
 *   (a) either endpoint is strictly inside the rect, OR
 *   (b) the segment properly intersects one of the four rect edges, OR
 *   (c) the segment's midpoint is strictly inside (covers the case where the
 *       segment spans the rect entering/leaving exactly at two corners).
 */
export function segmentCrossesObstacle(
  a: RoutePoint,
  b: RoutePoint,
  o: Obstacle,
): boolean {
  const minX = o.x;
  const minY = o.y;
  const maxX = o.x + o.w;
  const maxY = o.y + o.h;

  // (a) An endpoint strictly inside.
  if (pointStrictlyInside(a, minX, minY, maxX, maxY)) return true;
  if (pointStrictlyInside(b, minX, minY, maxX, maxY)) return true;

  // Quick reject: segment bbox entirely on one side of the rect (with slop).
  if (Math.max(a.x, b.x) <= minX + EPS) return false;
  if (Math.min(a.x, b.x) >= maxX - EPS) return false;
  if (Math.max(a.y, b.y) <= minY + EPS) return false;
  if (Math.min(a.y, b.y) >= maxY - EPS) return false;

  // (b) Proper crossing of any rect edge (a real X, not a touch). We use a
  // strictly-interior crossing test so a segment grazing a boundary doesn't
  // count.
  const tl = { x: minX, y: minY };
  const tr = { x: maxX, y: minY };
  const br = { x: maxX, y: maxY };
  const bl = { x: minX, y: maxY };
  if (segmentsProperlyIntersect(a, b, tl, tr)) return true;
  if (segmentsProperlyIntersect(a, b, tr, br)) return true;
  if (segmentsProperlyIntersect(a, b, br, bl)) return true;
  if (segmentsProperlyIntersect(a, b, bl, tl)) return true;

  // (c) Midpoint strictly inside — catches the corner-to-corner diagonal that
  // enters/exits exactly at vertices (no proper edge crossing, neither endpoint
  // inside, yet the segment slices through the interior).
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  if (pointStrictlyInside(mid, minX, minY, maxX, maxY)) return true;

  return false;
}

// ---------------------------------------------------------------------------
// Geometry helpers.
// ---------------------------------------------------------------------------

function pointStrictlyInside(
  p: RoutePoint,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): boolean {
  return (
    p.x > minX + EPS && p.x < maxX - EPS && p.y > minY + EPS && p.y < maxY - EPS
  );
}

function pointInAnyObstacle(p: RoutePoint, obstacles: Obstacle[]): boolean {
  for (const o of obstacles) {
    if (pointStrictlyInside(p, o.x, o.y, o.x + o.w, o.y + o.h)) return true;
  }
  return false;
}

/**
 * The four corners of a rectangle, each nudged a hair diagonally OUTWARD so it
 * sits just outside the rect. This keeps corner waypoints clear of their own
 * obstacle's boundary slop and gives the route a sliver of clearance as it
 * rounds the corner.
 */
function cornerCandidates(o: Obstacle): RoutePoint[] {
  const d = 1; // 1px diagonal nudge — small but > EPS.
  const minX = o.x;
  const minY = o.y;
  const maxX = o.x + o.w;
  const maxY = o.y + o.h;
  return [
    { x: minX - d, y: minY - d },
    { x: maxX + d, y: minY - d },
    { x: maxX + d, y: maxY + d },
    { x: minX - d, y: maxY + d },
  ];
}

/**
 * Proper segment intersection: returns `true` only when segments p1p2 and p3p4
 * cross at a single interior point (both straddle each other). Colinear overlap
 * and shared-endpoint "touches" return `false`.
 */
function segmentsProperlyIntersect(
  p1: RoutePoint,
  p2: RoutePoint,
  p3: RoutePoint,
  p4: RoutePoint,
): boolean {
  const d1 = cross(p3, p4, p1);
  const d2 = cross(p3, p4, p2);
  const d3 = cross(p1, p2, p3);
  const d4 = cross(p1, p2, p4);
  // Both pairs strictly straddle ⇒ a proper crossing.
  if (
    ((d1 > EPS && d2 < -EPS) || (d1 < -EPS && d2 > EPS)) &&
    ((d3 > EPS && d4 < -EPS) || (d3 < -EPS && d4 > EPS))
  ) {
    return true;
  }
  return false;
}

/** 2-D cross product of (b-a) × (c-a). Sign gives orientation of a→b→c. */
function cross(a: RoutePoint, b: RoutePoint, c: RoutePoint): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function dist(a: RoutePoint, b: RoutePoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Plain Dijkstra over an adjacency list, returning the vertex-index path from
 * `start` to `goal` (inclusive) or `null` when `goal` is unreachable. `n` is the
 * vertex count. Uses a linear-scan frontier — fine for the bounded graph sizes
 * here (≤ `maxVertices`).
 */
function dijkstra(
  adj: Array<Array<{ to: number; cost: number }>>,
  start: number,
  goal: number,
  n: number,
): number[] | null {
  const distTo = new Array<number>(n).fill(Infinity);
  const prev = new Array<number>(n).fill(-1);
  const done = new Array<boolean>(n).fill(false);
  distTo[start] = 0;

  for (let iter = 0; iter < n; iter++) {
    // Pick the closest unvisited vertex.
    let u = -1;
    let best = Infinity;
    for (let i = 0; i < n; i++) {
      if (!done[i] && distTo[i]! < best) {
        best = distTo[i]!;
        u = i;
      }
    }
    if (u === -1) break; // remaining vertices unreachable
    if (u === goal) break;
    done[u] = true;
    for (const e of adj[u]!) {
      if (done[e.to]) continue;
      const nd = distTo[u]! + e.cost;
      if (nd < distTo[e.to]!) {
        distTo[e.to] = nd;
        prev[e.to] = u;
      }
    }
  }

  if (distTo[goal] === Infinity) return null;
  // Reconstruct.
  const path: number[] = [];
  let cur = goal;
  while (cur !== -1) {
    path.push(cur);
    if (cur === start) break;
    cur = prev[cur]!;
  }
  if (path[path.length - 1] !== start) return null;
  path.reverse();
  return path;
}
