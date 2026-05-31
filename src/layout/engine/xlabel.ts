/**
 * Phase 1 Step F1 — GraphViz-style external label placement (xlabel).
 *
 * GraphViz places edge/external labels with a force-directed pass: each label
 * is modelled as a movable rectangle that is repelled by obstacles (node
 * boxes, edge paths, and other labels) while a weak spring pulls it back to a
 * preferred anchor point on its edge. A grid (spatial hash) is used so each
 * label only tests against nearby obstacles. The configuration is iterated for
 * a bounded number of steps until overlaps stop improving.
 *
 * This module is a self-contained, pure re-implementation of that idea. It is
 * deliberately decoupled from the sugiyama backend: it consumes plain geometry
 * (node rectangles, edge polylines, label sizes + anchors) and returns resolved
 * label boxes. The caller (`DotSugiyamaEngine.layoutFlat`) wires it in as a
 * post-processing pass and copies the resolved rectangles back onto each
 * `EdgeLayout.labelBox`.
 *
 * It supersedes the older Step D3 single-edge "slide along the polyline" probe
 * (`placeLabelBox`) when `useXLabels` is on: D3 only looks at one edge at a
 * time and can't escape a node when the whole polyline is buried inside it.
 * The force model moves freely in 2-D, so it resolves both of the motivating
 * problems: (1) a label drawn inside a node, and (2) parallel-edge labels
 * stacked at the same coordinate.
 */

/** Axis-aligned rectangle (top-left anchored). */
export interface XRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A point in layout space. */
export interface XPoint {
  x: number;
  y: number;
}

/** One label to be placed. */
export interface XLabelInput {
  /** Stable key (the edge key) — echoed back on the output so the caller can re-associate. */
  id: string;
  /** Label rectangle size. */
  size: { w: number; h: number };
  /** Preferred centre — the edge midpoint / current label position. */
  anchor: XPoint;
  /** Polyline of the owning edge (used for the edge-repulsion term). */
  path: XPoint[];
}

export interface PlaceExternalLabelsInput {
  /** Node bounding boxes the labels must avoid. */
  nodes: XRect[];
  /** Labels to place. */
  labels: XLabelInput[];
  /**
   * Tuning knobs (all optional — defaults mirror GraphViz's gentle settling).
   */
  options?: XLabelOptions;
}

export interface XLabelOptions {
  /** Maximum settling iterations (bounded so the pass always terminates). */
  maxIterations?: number;
  /** Spring constant pulling a label back toward its anchor. */
  springK?: number;
  /** Strength of the repulsion impulse when two boxes overlap. */
  repelK?: number;
  /** Extra padding added around every obstacle when testing overlap. */
  padding?: number;
  /** Per-step cap on how far a label may move (keeps the sim stable). */
  maxStep?: number;
}

export interface PlaceExternalLabelsResult {
  /** Resolved label rectangle per input id (top-left anchored). */
  boxes: Map<string, XRect>;
}

const DEFAULTS: Required<XLabelOptions> = {
  maxIterations: 60,
  springK: 0.08,
  repelK: 0.5,
  padding: 2,
  maxStep: 24,
};

/**
 * Force-directed external-label placement.
 *
 * Each label is a free body whose centre starts at its anchor. Per iteration
 * we accumulate, for every label:
 *
 *   * a spring force toward its anchor (weak — keeps labels near the edge);
 *   * a separation impulse pushing it out of any overlapping node box;
 *   * a separation impulse pushing it off its own edge polyline if the box
 *     sits on the line;
 *   * a mutual separation impulse pushing overlapping labels apart.
 *
 * Overlap queries go through a uniform grid (spatial hash) keyed by cell so
 * each label only compares against obstacles in nearby cells. We integrate
 * with a clamped step and stop early once a sweep produces no overlap
 * resolution (a stable, low-overlap configuration).
 *
 * The function is pure: it reads only its arguments and returns a fresh map.
 */
export function placeExternalLabels(
  input: PlaceExternalLabelsInput,
): PlaceExternalLabelsResult {
  const opt = { ...DEFAULTS, ...(input.options ?? {}) };
  const labels = input.labels;
  const boxes = new Map<string, XRect>();

  if (labels.length === 0) {
    return { boxes };
  }

  // Mutable simulation state — each label's current centre and half-extent.
  const centres: XPoint[] = labels.map((l) => ({ x: l.anchor.x, y: l.anchor.y }));
  const half = labels.map((l) => ({ x: l.size.w / 2, y: l.size.h / 2 }));

  // Padded node obstacles (snapshot — nodes don't move).
  const nodeObstacles: XRect[] = input.nodes.map((n) => ({
    x: n.x - opt.padding,
    y: n.y - opt.padding,
    w: n.w + 2 * opt.padding,
    h: n.h + 2 * opt.padding,
  }));

  // Choose a grid cell size from the mean obstacle/label extent so a label
  // spans a small, bounded number of cells. Guard degenerate zero sizes.
  let extentSum = 0;
  let extentCount = 0;
  for (const l of labels) {
    extentSum += Math.max(l.size.w, l.size.h);
    extentCount++;
  }
  for (const n of nodeObstacles) {
    extentSum += Math.max(n.w, n.h);
    extentCount++;
  }
  const cell = Math.max(8, extentCount > 0 ? extentSum / extentCount : 32);

  // The node grid is static (nodes never move) so we build it once.
  const nodeGrid = buildGrid(nodeObstacles, cell);

  for (let iter = 0; iter < opt.maxIterations; iter++) {
    // Label centres move every step, so the label grid is rebuilt per sweep.
    const labelGrid = buildGrid(
      labels.map((_, i) => centreRect(centres[i]!, half[i]!)),
      cell,
    );

    const forces: XPoint[] = labels.map(() => ({ x: 0, y: 0 }));
    let movedOverlap = false;

    for (let i = 0; i < labels.length; i++) {
      const c = centres[i]!;
      const h = half[i]!;
      const rect = centreRect(c, h);

      // (a) Spring toward the anchor.
      const anchor = labels[i]!.anchor;
      forces[i]!.x += (anchor.x - c.x) * opt.springK;
      forces[i]!.y += (anchor.y - c.y) * opt.springK;

      // (b) Repel from node boxes (grid-narrowed).
      for (const idx of nodeGrid.query(rect)) {
        const o = nodeObstacles[idx]!;
        if (overlap(rect, o)) {
          addSeparation(forces[i]!, rect, o, opt.repelK);
          movedOverlap = true;
        }
      }

      // (c) Repel off this label's own edge polyline if the box sits on it.
      const push = pushOffPolyline(rect, labels[i]!.path);
      if (push) {
        forces[i]!.x += push.x * opt.repelK;
        forces[i]!.y += push.y * opt.repelK;
        movedOverlap = true;
      }

      // (d) Mutual repulsion from other overlapping labels. When two label
      // centres coincide exactly the geometric separation is degenerate, so
      // we inject a deterministic tie-break nudge (by index parity) to break
      // the symmetry — otherwise both bodies would receive identical impulses
      // and never separate.
      for (const j of labelGrid.query(rect)) {
        if (j === i) continue;
        const other = centreRect(centres[j]!, half[j]!);
        if (overlap(rect, other)) {
          // Push body i directly away from body j along the centre-to-centre
          // vector (body j receives the equal-and-opposite push on its own
          // turn, so the pair separates symmetrically). The magnitude scales
          // with the smaller penetration depth so deep overlaps push harder.
          const dx = centres[i]!.x - centres[j]!.x;
          const dy = centres[i]!.y - centres[j]!.y;
          const px = (rect.w + other.w) / 2 - Math.abs(dx);
          const py = (rect.h + other.h) / 2 - Math.abs(dy);
          const pen = Math.max(1, Math.min(px, py));
          let ux: number;
          let uy: number;
          const d = Math.hypot(dx, dy);
          if (d > 1e-6) {
            ux = dx / d;
            uy = dy / d;
          } else {
            // Coincident centres → no direction available. Break the symmetry
            // deterministically: lower-index body goes +x, higher one -x.
            ux = i < j ? 1 : -1;
            uy = 0;
          }
          forces[i]!.x += ux * pen * opt.repelK;
          forces[i]!.y += uy * pen * opt.repelK;
          movedOverlap = true;
        }
      }
    }

    // Integrate with a clamped per-step displacement.
    for (let i = 0; i < labels.length; i++) {
      let dx = forces[i]!.x;
      let dy = forces[i]!.y;
      const mag = Math.hypot(dx, dy);
      if (mag > opt.maxStep) {
        const s = opt.maxStep / mag;
        dx *= s;
        dy *= s;
      }
      centres[i]!.x += dx;
      centres[i]!.y += dy;
    }

    // Hard label-label separation pass. The soft mutual repulsion above
    // steers the labels apart, but it settles to an equilibrium against the
    // spring where a small residual overlap can remain. GraphViz ultimately
    // wants non-overlapping label boxes, so after integration we push each
    // still-overlapping pair fully apart (half the penetration each, plus a
    // 1px gap) along their least-penetration axis. Processing pairs in index
    // order keeps the result deterministic.
    for (let i = 0; i < labels.length; i++) {
      for (let j = i + 1; j < labels.length; j++) {
        const a = centreRect(centres[i]!, half[i]!);
        const b = centreRect(centres[j]!, half[j]!);
        if (!overlap(a, b)) continue;
        separatePair(centres[i]!, a, i, centres[j]!, b, j);
      }
    }

    // Hard node-eviction pass. Springs and soft impulses settle to an
    // equilibrium where the spring (pulling toward an anchor that may be
    // *inside* a node) balances the residual repulsion — which can leave the
    // box still clipping the node. GraphViz treats node boxes as hard
    // obstacles, so after the soft integration we project each label fully
    // out of any overlapping node along its least-penetration axis. This
    // guarantees the returned boxes never sit inside a node, even when the
    // edge's own midpoint anchor does.
    for (let i = 0; i < labels.length; i++) {
      const h = half[i]!;
      // A few projection rounds resolve the case where evicting from one node
      // pushes the box into an adjacent one.
      for (let round = 0; round < 4; round++) {
        let rect = centreRect(centres[i]!, h);
        let moved = false;
        for (const idx of nodeGrid.query(rect)) {
          const o = nodeObstacles[idx]!;
          if (!overlap(rect, o)) continue;
          evictFully(centres[i]!, rect, o);
          rect = centreRect(centres[i]!, h);
          moved = true;
        }
        if (!moved) break;
      }
    }

    // Converged: no overlap impulse fired this sweep — the spring will only
    // pull labels back toward already-clear anchors from here, so stop.
    if (!movedOverlap) break;
  }

  // Emit resolved boxes (top-left anchored).
  for (let i = 0; i < labels.length; i++) {
    const c = centres[i]!;
    const h = half[i]!;
    boxes.set(labels[i]!.id, {
      x: c.x - h.x,
      y: c.y - h.y,
      w: labels[i]!.size.w,
      h: labels[i]!.size.h,
    });
  }

  return { boxes };
}

// ---------------------------------------------------------------------------
// Geometry helpers.
// ---------------------------------------------------------------------------

/** Build a top-left-anchored rectangle from a centre and half-extent. */
function centreRect(c: XPoint, half: XPoint): XRect {
  return { x: c.x - half.x, y: c.y - half.y, w: half.x * 2, h: half.y * 2 };
}

/** Axis-aligned overlap test (touching edges do not count as overlap). */
function overlap(a: XRect, b: XRect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/**
 * Add a separation impulse to `force` that pushes rect `a` out of obstacle
 * `b` along the axis of least penetration (so a label slides out the nearest
 * edge rather than jumping across the obstacle). The magnitude scales with the
 * penetration depth so deep overlaps push harder.
 */
function addSeparation(force: XPoint, a: XRect, b: XRect, k: number): void {
  const acx = a.x + a.w / 2;
  const acy = a.y + a.h / 2;
  const bcx = b.x + b.w / 2;
  const bcy = b.y + b.h / 2;

  // Penetration depth on each axis (positive ⇒ overlapping on that axis).
  const px = (a.w + b.w) / 2 - Math.abs(acx - bcx);
  const py = (a.h + b.h) / 2 - Math.abs(acy - bcy);
  if (px <= 0 || py <= 0) return;

  if (px < py) {
    // Resolve along X — push toward the side `a` already leans.
    const dir = acx >= bcx ? 1 : -1;
    force.x += dir * px * k;
  } else {
    const dir = acy >= bcy ? 1 : -1;
    force.y += dir * py * k;
  }
}

/**
 * Push two overlapping label centres fully apart (half the penetration each,
 * plus a 1px gap) along their least-penetration axis. When the centres
 * coincide the axis is degenerate, so we separate horizontally with the
 * lower-index body going left — deterministic and symmetry-breaking. Mutates
 * both centres in place.
 */
function separatePair(ci: XPoint, a: XRect, i: number, cj: XPoint, b: XRect, j: number): void {
  const px = (a.w + b.w) / 2 - Math.abs(ci.x - cj.x);
  const py = (a.h + b.h) / 2 - Math.abs(ci.y - cj.y);
  if (px <= 0 || py <= 0) return;
  const GAP = 1;
  if (px <= py) {
    const shift = (px + GAP) / 2;
    let dir = ci.x >= cj.x ? 1 : -1;
    if (Math.abs(ci.x - cj.x) < 1e-6) dir = i < j ? -1 : 1;
    ci.x += dir * shift;
    cj.x -= dir * shift;
  } else {
    const shift = (py + GAP) / 2;
    let dir = ci.y >= cj.y ? 1 : -1;
    if (Math.abs(ci.y - cj.y) < 1e-6) dir = i < j ? -1 : 1;
    ci.y += dir * shift;
    cj.y -= dir * shift;
  }
}

/**
 * Hard-project a label centre fully out of obstacle `b` along the axis of
 * least penetration, so the resulting box is flush against (and clear of) the
 * obstacle edge. Mutates `centre` in place. `a` must be the current rect for
 * `centre`.
 */
function evictFully(centre: XPoint, a: XRect, b: XRect): void {
  const acx = a.x + a.w / 2;
  const acy = a.y + a.h / 2;
  const bcx = b.x + b.w / 2;
  const bcy = b.y + b.h / 2;
  const px = (a.w + b.w) / 2 - Math.abs(acx - bcx);
  const py = (a.h + b.h) / 2 - Math.abs(acy - bcy);
  if (px <= 0 || py <= 0) return;
  if (px < py) {
    const dir = acx >= bcx ? 1 : -1;
    centre.x += dir * px;
  } else {
    const dir = acy >= bcy ? 1 : -1;
    centre.y += dir * py;
  }
}

/**
 * If a label rectangle's centre sits on (or very near) its own edge polyline,
 * return a small perpendicular push that nudges the box off the line. Returns
 * `null` when the box centre is already comfortably clear of the path.
 *
 * We only consider the box centre vs. each segment (not full box/segment
 * intersection) — that's enough to break the "label drawn on the line"
 * degenerate case, and the spring keeps the label from drifting far.
 */
function pushOffPolyline(rect: XRect, path: XPoint[]): XPoint | null {
  if (path.length < 2) return null;
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  // Threshold: half the box's smaller extent — if the line runs closer than
  // this to the centre, the line visually crosses the label.
  const threshold = Math.min(rect.w, rect.h) / 2 + 1;

  let bestDist = Infinity;
  let bestPx = 0;
  let bestPy = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    const { dist, nx, ny } = pointToSegment(cx, cy, a, b);
    if (dist < bestDist) {
      bestDist = dist;
      bestPx = nx;
      bestPy = ny;
    }
  }
  if (bestDist >= threshold) return null;

  // Perpendicular unit direction away from the closest point. When the centre
  // lies exactly on the line (dist 0) we can't derive a direction from it, so
  // we fall back to the segment normal computed in `pointToSegment`.
  const want = threshold - bestDist + 1;
  return { x: bestPx * want, y: bestPy * want };
}

/**
 * Distance from point (cx,cy) to segment a→b, plus a unit vector pointing from
 * the closest point on the segment toward the query point (the "escape"
 * direction). When the point lies on the segment, the escape direction is the
 * segment's left normal so the label still moves off the line deterministically.
 */
function pointToSegment(
  cx: number,
  cy: number,
  a: XPoint,
  b: XPoint,
): { dist: number; nx: number; ny: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let t = 0;
  if (len2 > 0) {
    t = ((cx - a.x) * dx + (cy - a.y) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
  }
  const px = a.x + t * dx;
  const py = a.y + t * dy;
  const ex = cx - px;
  const ey = cy - py;
  const d = Math.hypot(ex, ey);
  if (d > 1e-6) {
    return { dist: d, nx: ex / d, ny: ey / d };
  }
  // Degenerate: centre lies on the segment. Use the left normal of the
  // segment direction as the escape vector.
  const segLen = Math.hypot(dx, dy);
  if (segLen > 1e-6) {
    return { dist: 0, nx: -dy / segLen, ny: dx / segLen };
  }
  return { dist: 0, nx: 0, ny: 1 };
}

// ---------------------------------------------------------------------------
// Uniform-grid spatial hash (GraphViz uses a grid for label conflict tests).
// ---------------------------------------------------------------------------

interface Grid {
  /** Indices of rects whose cells the query rect touches (may include dupes). */
  query(rect: XRect): number[];
}

/**
 * Build a uniform grid over `rects`. Each rect is registered in every cell its
 * bounding box covers; a query returns the union of occupants of the cells the
 * query rect covers. Returned indices index into the original `rects` array.
 */
function buildGrid(rects: XRect[], cell: number): Grid {
  const c = cell > 0 ? cell : 1;
  const buckets = new Map<string, number[]>();
  const key = (gx: number, gy: number): string => `${gx},${gy}`;

  for (let i = 0; i < rects.length; i++) {
    const r = rects[i]!;
    const gx0 = Math.floor(r.x / c);
    const gy0 = Math.floor(r.y / c);
    const gx1 = Math.floor((r.x + r.w) / c);
    const gy1 = Math.floor((r.y + r.h) / c);
    for (let gx = gx0; gx <= gx1; gx++) {
      for (let gy = gy0; gy <= gy1; gy++) {
        const k = key(gx, gy);
        let b = buckets.get(k);
        if (!b) {
          b = [];
          buckets.set(k, b);
        }
        b.push(i);
      }
    }
  }

  return {
    query(rect: XRect): number[] {
      const gx0 = Math.floor(rect.x / c);
      const gy0 = Math.floor(rect.y / c);
      const gx1 = Math.floor((rect.x + rect.w) / c);
      const gy1 = Math.floor((rect.y + rect.h) / c);
      const seen = new Set<number>();
      const out: number[] = [];
      for (let gx = gx0; gx <= gx1; gx++) {
        for (let gy = gy0; gy <= gy1; gy++) {
          const b = buckets.get(key(gx, gy));
          if (!b) continue;
          for (const idx of b) {
            if (!seen.has(idx)) {
              seen.add(idx);
              out.push(idx);
            }
          }
        }
      }
      return out;
    },
  };
}
