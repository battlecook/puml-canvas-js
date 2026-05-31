import type {
  StateAst,
  StateNode,
  StateTransition,
} from '../../ast/state.js';
import type { ClassRelationship } from '../../ast/class.js';
import type { Scene, Shape, Style } from '../../scene/types.js';
import { measureText } from '../sequence/measure.js';
import { assignLayers, buildLayoutEdges, removeCycles } from '../class/sugiyama.js';
import { drawMarker, markerLength, shortenPolyline, type Vec } from '../class/markers.js';
import {
  DotSugiyamaEngine,
  placeExternalLabels,
  type EdgeSpec,
  type LayoutGraph,
  type NodeSpec,
  type SubgraphSpec,
  type XLabelInput,
} from '../engine/index.js';
import { separatedSplinePoints } from '../common/edges.js';
import {
  buildObstacles,
  pathBlocked,
  visibilityRoute,
  type ClusterBox,
  type NodeBox,
} from '../engine/route.js';
import {
  sdlOutlineShape,
  pseudoStateShape,
  PSEUDO_FORK_W,
  PSEUDO_FORK_H,
  PSEUDO_START_R,
  PSEUDO_END_R,
} from './shapes.js';

// ---------------------------------------------------------------------------
// Feature flag — engine-backed nested sugiyama arrangement.
//
// Phase 1 Step B-2 introduced the engine path behind an OFF-by-default flag.
// Phase 1 Step C flips the default to ON: the engine path is now the
// production layout for nested state composites. It honors per-subgraph
// direction (so an auto-detected simple chain renders left-to-right inside
// its composite, e.g. `state X { State1 -> State2 }`).
//
// Legacy in-line sugiyama is still available for the rare caller that needs
// the byte-identical pre-Step-C output: set the env var
// `PUML_STATE_NESTED_ENGINE=0` or call `setUseEngineForNestedState(false)`.
// ---------------------------------------------------------------------------
let useEngineForNestedState =
  typeof process !== 'undefined'
  && process.env != null
  && process.env.PUML_STATE_NESTED_ENGINE === '0'
    ? false
    : true;

export function setUseEngineForNestedState(enabled: boolean): void {
  useEngineForNestedState = enabled;
}

export function isUsingEngineForNestedState(): boolean {
  return useEngineForNestedState;
}

const PAGE_PAD = 16;
const TITLE_FONT = 16;
const TITLE_GAP = 10;
const COMPOSITE_HEADER_H = 24;
const COMPOSITE_PAD = 14;
const CHILD_GAP = 16;
const LAYER_GAP = 28;
const MAX_ROW_W = 720;

const NORMAL_PAD_X = 14;
const NORMAL_PAD_Y = 8;
const NORMAL_MIN_W = 70;
const NORMAL_MIN_H = 30;
const DIVIDER_GAP = 8;
const DESC_ROW_GAP = 2;
const INITIAL_SIZE = PSEUDO_START_R * 2;
const FINAL_SIZE = PSEUDO_END_R * 2;
const CHOICE_SIZE = 28;
const FORK_W = PSEUDO_FORK_W;
const FORK_H = PSEUDO_FORK_H;
const HISTORY_SIZE = 20;

const FONT_FAMILY = 'sans-serif';
const FONT_LABEL = 12;
const EDGE_LABEL_FONT = 11;
const COMPOSITE_NAME_FONT = 13;

const COLOR_LINE = '#222';
const COLOR_EDGE = '#444';
const COLOR_NORMAL_FILL = '#fefece';
const COLOR_CHOICE_FILL = '#fefece';
const COLOR_COMPOSITE_FILL = 'rgba(254, 252, 206, 0.4)';
const COLOR_COMPOSITE_STROKE = '#888';

interface AbsPos {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Box {
  w: number;
  h: number;
  draw(x: number, y: number, posMap: Map<string, AbsPos>): Shape[];
}

export function layoutStateNested(ast: StateAst): Scene {
  const titleHeight = ast.title ? TITLE_FONT + TITLE_GAP : 0;
  const topBoxes = ast.states.map((n) => layoutStateNode(n, ast.transitions));
  // Default to PlantUML's top-to-bottom flow: sibling top-level composite
  // states stack vertically (one box per row). Only when the source opts
  // into `left to right direction` do we revert to the horizontal
  // row-packing behaviour. Children inside a composite always flow
  // horizontally regardless of this setting.
  const rows = ast.direction === 'LR'
    ? packIntoRows(topBoxes, MAX_ROW_W)
    : topBoxes.map((b) => [b]);

  let cursorY = PAGE_PAD + titleHeight;
  let maxRowW = 0;
  const rowMeta: Array<{ rowW: number; rowH: number; y: number }> = [];
  for (const row of rows) {
    let rowW = 0;
    let rowH = 0;
    for (let i = 0; i < row.length; i++) {
      rowW += row[i]!.w;
      if (i < row.length - 1) rowW += CHILD_GAP;
      rowH = Math.max(rowH, row[i]!.h);
    }
    maxRowW = Math.max(maxRowW, rowW);
    rowMeta.push({ rowW, rowH, y: cursorY });
    cursorY += rowH + CHILD_GAP;
  }
  const totalW = maxRowW + PAGE_PAD * 2;
  const totalH = cursorY - CHILD_GAP + PAGE_PAD;

  const positions = new Map<string, AbsPos>();
  const shapes: Shape[] = [];

  if (ast.title) {
    shapes.push({
      type: 'text',
      x: totalW / 2,
      y: PAGE_PAD + TITLE_FONT,
      text: ast.title,
      anchor: 'middle',
      baseline: 'alphabetic',
      font: { family: FONT_FAMILY, size: TITLE_FONT, weight: 'bold', color: '#000' },
    });
  }

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r]!;
    const meta = rowMeta[r]!;
    let cursorX = PAGE_PAD + (maxRowW - meta.rowW) / 2;
    for (const box of row) {
      shapes.push(...box.draw(cursorX, meta.y, positions));
      cursorX += box.w + CHILD_GAP;
    }
  }

  const { shapes: transitionShapes, labelBoxes } = drawTransitionsUnified(
    ast.transitions,
    positions,
  );
  shapes.push(...transitionShapes);

  // Grow the scene to contain any edge label that the xlabel pass pushed
  // outside the node bounding box (PlantUML grows the drawing to fit external
  // labels rather than clipping them). We measure the extent of every resolved
  // label box, expand the canvas to enclose them with a small margin, and — if
  // any label spilled past the top/left edge — translate ALL shapes so the
  // whole drawing shifts back into positive space.
  let scene: Scene = {
    width: totalW,
    height: totalH,
    background: '#fff',
    children: shapes,
  };
  if (labelBoxes.size > 0) {
    let minX = 0;
    let minY = 0;
    let maxX = totalW;
    let maxY = totalH;
    for (const b of labelBoxes.values()) {
      if (b.x < minX) minX = b.x;
      if (b.y < minY) minY = b.y;
      if (b.x + b.w > maxX) maxX = b.x + b.w;
      if (b.y + b.h > maxY) maxY = b.y + b.h;
    }
    const dx = minX < 0 ? PAGE_PAD - minX : 0;
    const dy = minY < 0 ? PAGE_PAD - minY : 0;
    const padRight = maxX > totalW ? maxX - totalW + PAGE_PAD : 0;
    const padBottom = maxY > totalH ? maxY - totalH + PAGE_PAD : 0;
    if (dx !== 0 || dy !== 0 || padRight !== 0 || padBottom !== 0) {
      if (dx !== 0 || dy !== 0) translateShapes(shapes, dx, dy);
      scene = {
        width: totalW + dx + padRight,
        height: totalH + dy + padBottom,
        background: '#fff',
        children: shapes,
      };
    }
  }
  return scene;
}

/**
 * Translate every shape in-place by (dx, dy). Used to shift the whole drawing
 * back into positive coordinate space after the canvas grows to fit labels that
 * spilled past the top/left edge. Handles every Shape variant the state layout
 * emits (rect, line, text, circle, polygon, path).
 */
function translateShapes(shapes: Shape[], dx: number, dy: number): void {
  if (dx === 0 && dy === 0) return;
  for (const s of shapes) {
    switch (s.type) {
      case 'rect':
      case 'text':
        s.x += dx;
        s.y += dy;
        break;
      case 'line':
        s.x1 += dx;
        s.y1 += dy;
        s.x2 += dx;
        s.y2 += dy;
        break;
      case 'circle':
        s.cx += dx;
        s.cy += dy;
        break;
      case 'polygon':
      case 'polyline':
        s.points = s.points.map(([x, y]) => [x + dx, y + dy]);
        break;
      case 'path':
        s.d = translatePathD(s.d, dx, dy);
        break;
      default:
        break;
    }
  }
}

/**
 * Translate every absolute coordinate pair in an SVG path `d` string by
 * (dx, dy). Our path data only uses absolute M/L/C commands with space- and
 * comma-separated `x y` pairs (see `bezierPathShape`), so a positional pass over
 * the numeric pairs is sufficient and safe.
 */
function translatePathD(d: string, dx: number, dy: number): string {
  let idx = 0;
  return d.replace(/-?\d*\.?\d+(?:e-?\d+)?/gi, (tok) => {
    const n = Number(tok);
    const shifted = idx % 2 === 0 ? n + dx : n + dy;
    idx++;
    return fmtNum(shifted);
  });
}

function layoutStateNode(node: StateNode, allTrans: StateTransition[]): Box {
  if (node.children.length === 0) {
    return layoutLeaf(node);
  }

  const childBoxes = node.children.map((c) => layoutStateNode(c, allTrans));
  const childIds = new Set(node.children.map((c) => c.id));
  const intra = allTrans.filter((t) => childIds.has(t.source) && childIds.has(t.target));

  // Concurrent regions: `state X { ... -- ... }` (or `||`) splits the
  // composite into orthogonal regions. `--` stacks them vertically (rows
  // separated by a horizontal dashed line); `||` stacks them horizontally
  // (columns separated by a vertical dashed line). Each region is laid out
  // independently using the same single-region strategy (sugiyama if it
  // has intra-region transitions, otherwise the simple row-wrap pack).
  const regions = node.regions;
  const arrangement = regions && regions.length > 1
    ? regionsArrange(
        node.children,
        childBoxes,
        intra,
        regions,
        node.regionDirection ?? 'vertical',
      )
    : intra.length > 0
      ? arrangeSugiyama(node.children, childBoxes, intra)
      : rowWrapArrange(childBoxes);

  const headerText = node.name || node.id;
  const headerW = measureText(headerText, COMPOSITE_NAME_FONT).width + 28;
  const contentW = Math.max(arrangement.innerW, headerW);
  const w = contentW + COMPOSITE_PAD * 2;
  const h = COMPOSITE_HEADER_H + arrangement.innerH + COMPOSITE_PAD;

  return {
    w,
    h,
    draw(x, y, posMap) {
      const shapes: Shape[] = [];
      // Composite states need a position entry so transitions whose
      // endpoint is a composite (rather than a leaf) can find a box to
      // clip against and a center for label placement.
      posMap.set(node.id, { x, y, w, h });
      shapes.push({
        type: 'rect',
        x, y, w, h,
        rx: 10, ry: 10,
        style: { fill: COLOR_COMPOSITE_FILL, stroke: COLOR_COMPOSITE_STROKE, strokeWidth: 1 },
      });
      shapes.push({
        type: 'line',
        x1: x, y1: y + COMPOSITE_HEADER_H,
        x2: x + w, y2: y + COMPOSITE_HEADER_H,
        style: { stroke: COLOR_COMPOSITE_STROKE, strokeWidth: 1 },
      });
      shapes.push({
        type: 'text',
        x: x + w / 2,
        y: y + COMPOSITE_HEADER_H / 2 + 1,
        text: headerText,
        anchor: 'middle',
        baseline: 'middle',
        font: { family: FONT_FAMILY, size: COMPOSITE_NAME_FONT, weight: 'bold', color: '#000' },
      });
      arrangement.place(x + COMPOSITE_PAD, y + COMPOSITE_HEADER_H, contentW, posMap, shapes);
      return shapes;
    },
  };
}

interface Arrangement {
  innerW: number;
  innerH: number;
  place(
    originX: number,
    originY: number,
    contentW: number,
    posMap: Map<string, AbsPos>,
    out: Shape[],
  ): void;
}

function rowWrapArrange(childBoxes: Box[]): Arrangement {
  const rows = packIntoRows(childBoxes, MAX_ROW_W);
  const rowMeta: Array<{ rowW: number; rowH: number; yOffset: number }> = [];
  let innerW = 0;
  let cursorY = 0;
  for (const row of rows) {
    let rowW = 0;
    let rowH = 0;
    for (let i = 0; i < row.length; i++) {
      rowW += row[i]!.w;
      if (i < row.length - 1) rowW += CHILD_GAP;
      rowH = Math.max(rowH, row[i]!.h);
    }
    innerW = Math.max(innerW, rowW);
    rowMeta.push({ rowW, rowH, yOffset: cursorY });
    cursorY += rowH + CHILD_GAP;
  }
  const innerH = cursorY - CHILD_GAP;
  return {
    innerW,
    innerH,
    place(originX, originY, contentW, posMap, out) {
      for (let r = 0; r < rows.length; r++) {
        const row = rows[r]!;
        const meta = rowMeta[r]!;
        let cx = originX + (contentW - meta.rowW) / 2;
        for (const child of row) {
          out.push(...child.draw(cx, originY + meta.yOffset, posMap));
          cx += child.w + CHILD_GAP;
        }
      }
    },
  };
}

// Space reserved for the dashed line that separates concurrent regions
// inside a composite (perpendicular to the stacking axis).
const REGION_SEPARATOR_GAP = 14;

function regionsArrange(
  childNodes: StateNode[],
  childBoxes: Box[],
  intra: StateTransition[],
  regions: string[][],
  direction: 'vertical' | 'horizontal',
): Arrangement {
  // Build per-region arrangements. Each region gets a subset of children
  // (in source order) plus the subset of intra-composite transitions whose
  // BOTH endpoints sit inside the same region — cross-region transitions
  // are intentionally not laid out inside any region.
  const idToBox = new Map(childNodes.map((n, i) => [n.id, childBoxes[i]!]));
  const idToNode = new Map(childNodes.map((n) => [n.id, n]));

  // Any child not enumerated in `regions` (shouldn't happen in well-formed
  // input, but be defensive) is collected into a trailing region so it
  // still renders.
  const enumerated = new Set<string>();
  for (const r of regions) for (const id of r) enumerated.add(id);
  const leftovers: string[] = [];
  for (const n of childNodes) if (!enumerated.has(n.id)) leftovers.push(n.id);

  const effectiveRegions = leftovers.length > 0 ? [...regions, leftovers] : regions;

  const regionArrangements: Arrangement[] = [];
  for (const regionIds of effectiveRegions) {
    const regionSet = new Set(regionIds);
    const regionNodes: StateNode[] = [];
    const regionBoxes: Box[] = [];
    for (const id of regionIds) {
      const n = idToNode.get(id);
      const b = idToBox.get(id);
      if (n && b) {
        regionNodes.push(n);
        regionBoxes.push(b);
      }
    }
    const regionIntra = intra.filter(
      (t) => regionSet.has(t.source) && regionSet.has(t.target),
    );
    const arr = regionIntra.length > 0
      ? arrangeSugiyama(regionNodes, regionBoxes, regionIntra)
      : rowWrapArrange(regionBoxes);
    regionArrangements.push(arr);
  }

  if (direction === 'horizontal') {
    // Stack regions side-by-side. innerH is the tallest region; innerW
    // sums region widths plus separators between them.
    let innerW = 0;
    let innerH = 0;
    for (let i = 0; i < regionArrangements.length; i++) {
      const a = regionArrangements[i]!;
      innerH = Math.max(innerH, a.innerH);
      innerW += a.innerW;
      if (i < regionArrangements.length - 1) innerW += REGION_SEPARATOR_GAP;
    }

    return {
      innerW,
      innerH,
      place(originX, originY, contentW, posMap, out) {
        // Distribute any extra horizontal slack evenly across the regions
        // so the column-stack spans the composite's full content width.
        // (Without this, narrow regions would crowd against one edge.)
        const slack = Math.max(0, contentW - innerW);
        const extraPer = regionArrangements.length > 0
          ? slack / regionArrangements.length
          : 0;
        let cx = originX;
        for (let i = 0; i < regionArrangements.length; i++) {
          const a = regionArrangements[i]!;
          const w = a.innerW + extraPer;
          a.place(cx, originY, w, posMap, out);
          cx += w;
          // Dashed vertical separator line between this region and the
          // next, spanning the full content height.
          if (i < regionArrangements.length - 1) {
            const sepX = cx + REGION_SEPARATOR_GAP / 2;
            out.push({
              type: 'line',
              x1: sepX,
              y1: originY,
              x2: sepX,
              y2: originY + innerH,
              style: {
                stroke: COLOR_COMPOSITE_STROKE,
                strokeWidth: 1,
                strokeDasharray: '5,3',
              },
            });
            cx += REGION_SEPARATOR_GAP;
          }
        }
      },
    };
  }

  // Vertical stacking (default, from `--`). innerW is the widest region;
  // innerH sums region heights plus separators between them.
  let innerW = 0;
  let innerH = 0;
  const yOffsets: number[] = [];
  for (let i = 0; i < regionArrangements.length; i++) {
    const a = regionArrangements[i]!;
    innerW = Math.max(innerW, a.innerW);
    yOffsets.push(innerH);
    innerH += a.innerH;
    if (i < regionArrangements.length - 1) innerH += REGION_SEPARATOR_GAP;
  }

  return {
    innerW,
    innerH,
    place(originX, originY, contentW, posMap, out) {
      for (let i = 0; i < regionArrangements.length; i++) {
        const a = regionArrangements[i]!;
        const yOff = yOffsets[i]!;
        a.place(originX, originY + yOff, contentW, posMap, out);
        // Dashed horizontal separator line between this region and the
        // next.
        if (i < regionArrangements.length - 1) {
          const sepY = originY + yOff + a.innerH + REGION_SEPARATOR_GAP / 2;
          out.push({
            type: 'line',
            x1: originX,
            y1: sepY,
            x2: originX + contentW,
            y2: sepY,
            style: {
              stroke: COLOR_COMPOSITE_STROKE,
              strokeWidth: 1,
              strokeDasharray: '5,3',
            },
          });
        }
      }
    },
  };
}

// Dispatcher: the rest of the nested layout code (composite frame, regions,
// row-wrap fallback) is shared between both backends. Only the layered
// placement of children that have intra-composite transitions differs.
function arrangeSugiyama(
  childNodes: StateNode[],
  childBoxes: Box[],
  intra: StateTransition[],
): Arrangement {
  return useEngineForNestedState
    ? engineSugiyamaArrange(childNodes, childBoxes, intra)
    : sugiyamaArrange(childNodes, childBoxes, intra);
}

// Engine-backed alternative to `sugiyamaArrange`. Builds a `LayoutGraph` from
// the children + intra-composite transitions, runs `DotSugiyamaEngine`, then
// reuses the engine's per-node positions to populate the `Arrangement` slot.
//
// The composite frame and `posMap` writes still happen via each child Box's
// `draw()` callback, so leaf/pseudo/composite shape rendering is unchanged —
// only the (x, y) origin we pass to `draw()` is sourced from the engine.
//
// Composite children (those whose `Box` has nested content) are passed to the
// engine as opaque rectangles with the dimensions they reported via `Box.{w,h}`
// — the engine never recurses into them; their inner layout already happened
// during the bottom-up `layoutStateNode` traversal.
function engineSugiyamaArrange(
  childNodes: StateNode[],
  childBoxes: Box[],
  intra: StateTransition[],
): Arrangement {
  const idToBox = new Map(childNodes.map((n, i) => [n.id, childBoxes[i]!]));

  // Auto-detect a "simple chain" — a short linear path (≤ 3 non-pseudo
  // states with edges forming exactly a one-step-per-node trail). Such a
  // composite reads better laid out horizontally (e.g. PlantUML's
  // `state X { State1 -> State2 }` example renders as State1 ▸ State2
  // side-by-side, not stacked). We pass the hint via the wrapping
  // subgraph's `direction`; the engine honors that for child placement.
  const chainDirection: 'TB' | 'LR' = detectSimpleChain(childNodes, intra) ? 'LR' : 'TB';

  // Subgraph wrapping all children. The engine recursively lays out any
  // subgraph whose `direction` differs from the enclosing context, so
  // setting `direction: 'LR'` here flows the chain horizontally; leaving
  // it as `'TB'` (the engine default) keeps the existing vertical layout.
  const SG_ID = '__state_region__';
  const subgraphs = new Map<string, SubgraphSpec>([
    [SG_ID, { id: SG_ID, direction: chainDirection, nodeSep: CHILD_GAP, rankSep: LAYER_GAP }],
  ]);
  const nodes = new Map<string, NodeSpec>();
  for (const n of childNodes) {
    const b = idToBox.get(n.id)!;
    nodes.set(n.id, { id: n.id, width: b.w, height: b.h, cluster: SG_ID });
  }

  // Mirror the legacy `sugiyamaArrange` orientation: `buildLayoutEdges` first
  // flips edges based on marker, then `removeCycles` breaks cycles. The post-
  // cycle-break orientation is what we hand to the engine — this preserves
  // the legacy code's understanding of which way each layered edge points,
  // and keeps `assignLayers` (run inside the engine) numerically aligned with
  // the layers the legacy path produced.
  const classRels: ClassRelationship[] = intra.map((t) => ({
    source: t.source,
    target: t.target,
    sourceMult: '',
    targetMult: '',
    arrowToken: t.arrowToken,
    kind: 'association',
    style: t.style,
    sourceMarker: t.sourceMarker,
    targetMarker: t.targetMarker,
    label: t.label,
    labelDirection: 'none',
  }));
  const flipped = buildLayoutEdges(classRels);
  const ids = childNodes.map((n) => n.id);
  removeCycles(ids, flipped);
  const edges: EdgeSpec[] = flipped.map((e) => ({ from: e.from, to: e.to }));

  const graph: LayoutGraph = { nodes, edges, subgraphs };
  const result = new DotSugiyamaEngine().layout(graph, {
    defaultDirection: 'TB',
    nodeSep: CHILD_GAP,
    rankSep: LAYER_GAP,
    margin: 0,
  });

  // Translate the absolute engine positions into a (0,0)-anchored bounding
  // box so the existing `Arrangement.place(originX, originY, ...)` contract
  // is satisfied. We don't need polyline output from the engine here —
  // transition edges are drawn at the top level (`drawTransitionEdge`) using
  // the `posMap` populated by each Box's `draw()` callback.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of childNodes) {
    const nl = result.nodes.get(n.id);
    if (!nl) continue;
    if (nl.x < minX) minX = nl.x;
    if (nl.y < minY) minY = nl.y;
    if (nl.x + nl.w > maxX) maxX = nl.x + nl.w;
    if (nl.y + nl.h > maxY) maxY = nl.y + nl.h;
  }
  if (minX === Infinity) {
    // No nodes laid out (shouldn't happen — defensive). Fall back to legacy.
    return sugiyamaArrange(childNodes, childBoxes, intra);
  }
  const innerW = maxX - minX;
  const innerH = maxY - minY;

  // Snapshot relative offsets so `place()` can re-anchor them at any origin.
  const relOffsets = new Map<string, { dx: number; dy: number }>();
  for (const n of childNodes) {
    const nl = result.nodes.get(n.id);
    if (!nl) continue;
    relOffsets.set(n.id, { dx: nl.x - minX, dy: nl.y - minY });
  }

  return {
    innerW,
    innerH,
    place(originX, originY, contentW, posMap, out) {
      // Horizontally center the engine's bounding box inside `contentW` so
      // the visual feel matches the legacy row-centered layout when a
      // composite ends up wider than its content (e.g., a long header text).
      const slack = Math.max(0, contentW - innerW);
      const baseX = originX + slack / 2;
      for (const n of childNodes) {
        const off = relOffsets.get(n.id);
        if (!off) continue;
        const box = idToBox.get(n.id)!;
        out.push(...box.draw(baseX + off.dx, originY + off.dy, posMap));
      }
    },
  };
}

/**
 * Heuristic: do the children of this composite form a short linear chain
 * that would read better horizontally?
 *
 * Rules:
 *   * After dropping pseudo-states (initial/final), at most 3 nodes remain.
 *   * Every remaining intra-composite transition connects two real nodes
 *     (we don't count edges into/out of pseudo-states for chain shape).
 *   * The real-node-only subgraph is a single linear path:
 *     - exactly (n - 1) edges between n nodes,
 *     - one node has out-degree 1 and in-degree 0 (chain head),
 *     - one node has in-degree 1 and out-degree 0 (chain tail),
 *     - every other node has in-degree 1 and out-degree 1,
 *     - no self-loops.
 *
 * The motivating example is `state X { State1 -> State2 }`: 2 real nodes,
 * 1 transition, classic horizontal pair.
 */
function detectSimpleChain(
  childNodes: StateNode[],
  intra: StateTransition[],
): boolean {
  // 1. Filter to "real" (non-pseudo) nodes.
  const real = childNodes.filter((n) => n.stateKind === 'normal');
  if (real.length === 0 || real.length > 3) return false;
  const realIds = new Set(real.map((n) => n.id));

  // 2. Consider only intra-edges between real nodes (drop pseudo edges,
  //    drop self-loops which would corrupt the chain shape).
  const realEdges = intra.filter(
    (t) => realIds.has(t.source) && realIds.has(t.target) && t.source !== t.target,
  );
  if (realEdges.length !== real.length - 1) return false;

  // 3. Per-node in/out degree.
  const inDeg = new Map<string, number>();
  const outDeg = new Map<string, number>();
  for (const id of realIds) {
    inDeg.set(id, 0);
    outDeg.set(id, 0);
  }
  for (const e of realEdges) {
    outDeg.set(e.source, (outDeg.get(e.source) ?? 0) + 1);
    inDeg.set(e.target, (inDeg.get(e.target) ?? 0) + 1);
  }

  // 4. Exactly one source (in=0, out=1), one sink (in=1, out=0),
  //    everything else (in=1, out=1). With a single node and zero edges,
  //    the chain is degenerate but still treatable as LR.
  if (real.length === 1) return true;
  let heads = 0;
  let tails = 0;
  for (const id of realIds) {
    const i = inDeg.get(id) ?? 0;
    const o = outDeg.get(id) ?? 0;
    if (i === 0 && o === 1) heads++;
    else if (i === 1 && o === 0) tails++;
    else if (i === 1 && o === 1) continue;
    else return false;
  }
  return heads === 1 && tails === 1;
}

function sugiyamaArrange(
  childNodes: StateNode[],
  childBoxes: Box[],
  intra: StateTransition[],
): Arrangement {
  const ids = childNodes.map((n) => n.id);
  const idToBox = new Map(childNodes.map((n, i) => [n.id, childBoxes[i]!]));

  const classRels: ClassRelationship[] = intra.map((t) => ({
    source: t.source,
    target: t.target,
    sourceMult: '',
    targetMult: '',
    arrowToken: t.arrowToken,
    kind: 'association',
    style: t.style,
    sourceMarker: t.sourceMarker,
    targetMarker: t.targetMarker,
    label: t.label,
    labelDirection: 'none',
  }));

  const edges = buildLayoutEdges(classRels);
  removeCycles(ids, edges);
  const layers = assignLayers(ids, edges);

  const groups: Box[][] = [];
  for (const n of childNodes) {
    const l = layers.get(n.id) ?? 0;
    while (groups.length <= l) groups.push([]);
    groups[l]!.push(idToBox.get(n.id)!);
  }

  const rowMeta: Array<{ rowW: number; rowH: number; yOffset: number }> = [];
  let innerW = 0;
  let cursorY = 0;
  for (const row of groups) {
    let rowW = 0;
    let rowH = 0;
    for (let i = 0; i < row.length; i++) {
      rowW += row[i]!.w;
      if (i < row.length - 1) rowW += CHILD_GAP;
      rowH = Math.max(rowH, row[i]!.h);
    }
    innerW = Math.max(innerW, rowW);
    rowMeta.push({ rowW, rowH, yOffset: cursorY });
    cursorY += rowH + LAYER_GAP;
  }
  const innerH = cursorY - LAYER_GAP;

  return {
    innerW,
    innerH,
    place(originX, originY, contentW, posMap, out) {
      for (let l = 0; l < groups.length; l++) {
        const row = groups[l]!;
        const meta = rowMeta[l]!;
        let cx = originX + (contentW - meta.rowW) / 2;
        for (const box of row) {
          out.push(...box.draw(cx, originY + meta.yOffset, posMap));
          cx += box.w + CHILD_GAP;
        }
      }
    },
  };
}

function layoutLeaf(node: StateNode): Box {
  const sz = measureLeaf(node);
  return {
    w: sz.w,
    h: sz.h,
    draw(x, y, posMap) {
      posMap.set(node.id, { x, y, w: sz.w, h: sz.h });
      return drawLeaf(node, x, y, sz.w, sz.h);
    },
  };
}

function measureLeaf(node: StateNode): { w: number; h: number } {
  switch (node.stateKind) {
    case 'initial': return { w: INITIAL_SIZE, h: INITIAL_SIZE };
    case 'final':   return { w: FINAL_SIZE, h: FINAL_SIZE };
    case 'choice':  return { w: CHOICE_SIZE, h: CHOICE_SIZE };
    case 'fork':
    case 'join':    return { w: FORK_W, h: FORK_H };
    case 'history': return { w: HISTORY_SIZE, h: HISTORY_SIZE };
    case 'normal':
    default: {
      const text = node.name || node.id;
      const nameM = measureText(text, FONT_LABEL);
      let w = nameM.width;
      let h = nameM.height;
      const descs = node.descriptions ?? [];
      if (descs.length > 0) {
        h += DIVIDER_GAP;
        for (let i = 0; i < descs.length; i++) {
          const descM = measureText(descs[i]!, FONT_LABEL);
          w = Math.max(w, descM.width);
          h += descM.height;
          if (i < descs.length - 1) h += DESC_ROW_GAP;
        }
      }
      return {
        w: Math.max(NORMAL_MIN_W, w + NORMAL_PAD_X * 2),
        h: Math.max(NORMAL_MIN_H, h + NORMAL_PAD_Y * 2),
      };
    }
  }
}

function leafRectStyle(node: StateNode, baseFill: string, baseStroke: string): Style {
  const style: Style = { fill: node.fill ?? baseFill, stroke: node.lineColor ?? baseStroke, strokeWidth: 1 };
  if (node.lineStyle === 'bold') style.strokeWidth = 2;
  else if (node.lineStyle === 'dashed') style.strokeDasharray = '4,2';
  else if (node.lineStyle === 'dotted') style.strokeDasharray = '2,3';
  return style;
}

function drawLeaf(node: StateNode, x: number, y: number, w: number, h: number): Shape[] {
  const cx = x + w / 2;
  const cy = y + h / 2;
  // Pseudo-state shapes (initial/final/fork/join) live in shapes.ts so the
  // flat and nested state layouts stay visually identical. Labels are not
  // emitted for these — fork/join bars and initial/final dots are unlabeled
  // by convention.
  const pseudo = pseudoStateShape(node, x, y, w, h);
  if (pseudo) return pseudo;
  switch (node.stateKind) {
    case 'choice': {
      const r = w / 2;
      return [{
        type: 'polygon',
        points: [[cx, cy - r], [cx + r, cy], [cx, cy + r], [cx - r, cy]],
        style: { fill: COLOR_CHOICE_FILL, stroke: COLOR_LINE, strokeWidth: 1 },
      }];
    }
    case 'history':
      return [
        { type: 'circle', cx, cy, r: w / 2, style: { fill: '#fff', stroke: COLOR_LINE, strokeWidth: 1 } },
        {
          type: 'text',
          x: cx, y: cy,
          text: node.isDeep ? 'H*' : 'H',
          anchor: 'middle', baseline: 'middle',
          font: { family: FONT_FAMILY, size: FONT_LABEL, weight: 'bold', color: '#000' },
        },
      ];
    case 'normal':
    default: {
      const textColor = node.textColor ?? '#000';
      const strokeColor = node.lineColor ?? COLOR_LINE;
      const baseStyle = leafRectStyle(node, COLOR_NORMAL_FILL, COLOR_LINE);
      const shapes: Shape[] = [
        sdlOutlineShape(node, x, y, w, h, baseStyle) ?? {
          type: 'rect',
          x, y, w, h,
          rx: 8, ry: 8,
          style: baseStyle,
        },
      ];
      const labelText = node.name || node.id;
      const descs = node.descriptions ?? [];
      if (descs.length > 0) {
        const lh = measureText(labelText, FONT_LABEL).height;
        const nameY = y + NORMAL_PAD_Y + lh / 2;
        const dividerY = nameY + lh / 2 + DIVIDER_GAP / 2;
        shapes.push({
          type: 'text',
          x: cx, y: nameY,
          text: labelText,
          anchor: 'middle', baseline: 'middle',
          font: { family: FONT_FAMILY, size: FONT_LABEL, color: textColor },
        });
        shapes.push({
          type: 'line',
          x1: x, y1: dividerY,
          x2: x + w, y2: dividerY,
          style: { stroke: strokeColor, strokeWidth: 1 },
        });
        let rowTop = dividerY + DIVIDER_GAP / 2;
        for (const desc of descs) {
          const dh = measureText(desc, FONT_LABEL).height;
          shapes.push({
            type: 'text',
            x: cx, y: rowTop + dh / 2,
            text: desc,
            anchor: 'middle', baseline: 'middle',
            font: { family: FONT_FAMILY, size: FONT_LABEL, color: textColor },
          });
          rowTop += dh + DESC_ROW_GAP;
        }
      } else {
        shapes.push({
          type: 'text',
          x: cx, y: cy,
          text: labelText,
          anchor: 'middle', baseline: 'middle',
          font: { family: FONT_FAMILY, size: FONT_LABEL, color: textColor },
        });
      }
      return shapes;
    }
  }
}

function packIntoRows<T extends { w: number; h: number }>(items: T[], maxW: number): T[][] {
  const rows: T[][] = [];
  let cur: T[] = [];
  let curW = 0;
  for (const it of items) {
    const tryW = cur.length === 0 ? it.w : curW + CHILD_GAP + it.w;
    if (cur.length > 0 && tryW > maxW) {
      rows.push(cur);
      cur = [it];
      curW = it.w;
    } else {
      cur.push(it);
      curW = tryW;
    }
  }
  if (cur.length > 0) rows.push(cur);
  return rows;
}

// ---------------------------------------------------------------------------
// Unified flat edge + label pipeline (replaces the bespoke straight-line
// transition rendering that previously drove `layoutStateNested`).
//
// This reuses the SAME pure helpers the engine's flat path uses so composite
// diagrams get spline separation, obstacle avoidance and external-label
// placement:
//
//   positions + transitions
//     → per-edge base polyline (rect-clipped endpoints)
//     → group by unordered node pair → lateral offset
//     → separatedSplinePoints (bow parallel/bidirectional edges apart)
//     → visibilityRoute around obstacle boxes (route around sibling nodes)
//     → collect labels + anchors + sizes → placeExternalLabels (once)
//     → emit <line>/bezier <path> + markers + label <text>
//
// `positions` already contains BOTH leaf node boxes AND composite container
// boxes (see `layoutStateNode.draw` / `layoutLeaf.draw`), so it is the full
// set of obstacle rectangles. The obstacle set for an edge excludes its own
// two endpoints AND any box that geometrically contains either endpoint (the
// parent composite, modelled as a routing "cluster") — otherwise an
// intra-composite edge would be told to avoid its own parent frame.
// ---------------------------------------------------------------------------

// Minimum perpendicular pitch (px) between adjacent arcs of a parallel/
// bidirectional group. The real pitch is grown to fit the group's label
// widths (see `computeGroupBow`) so each arc clears its neighbour's label;
// this is just the floor for narrow/empty labels.
const PARALLEL_ARC_MIN_PITCH = 26;
// Extra horizontal clearance (px) added between adjacent arcs so a label
// riding one arc never butts up against the next arc's label.
const PARALLEL_ARC_LABEL_GAP = 14;
// How far (px) past the arc apex, on the OUTER side of the bow, a label centre
// is anchored so the text rides just outside its own curve.
const ARC_LABEL_STANDOFF = 4;
// Margin used when inflating obstacle boxes for routing. 0 mirrors the engine
// (only a path that genuinely enters a box re-routes).
const ROUTE_MARGIN = 0;

interface EdgePlan {
  t: StateTransition;
  // Anchored boundary endpoints (perpendicular-shifted for parallel edges).
  start: Vec;
  end: Vec;
  // Final control polyline (endpoints anchored, interior bowed/routed).
  points: Vec[];
  lateralOffset: number;
}

function boxCenter(p: AbsPos): Vec {
  return { x: p.x + p.w / 2, y: p.y + p.h / 2 };
}

/** True when box `outer` strictly contains box `inner` (a parent composite). */
function strictlyContainsBox(outer: AbsPos, inner: AbsPos): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h &&
    !(inner.x === outer.x && inner.y === outer.y && inner.w === outer.w && inner.h === outer.h)
  );
}

function drawTransitionsUnified(
  transitions: StateTransition[],
  positions: Map<string, AbsPos>,
): {
  shapes: Shape[];
  labelBoxes: Map<string, { x: number; y: number; w: number; h: number }>;
} {
  // 1. Group parallel/bidirectional transitions by unordered node pair and
  //    assign each a symmetric lateral offset.
  const groups = new Map<string, StateTransition[]>();
  for (const t of transitions) {
    if (t.source === t.target) continue; // self-loops unsupported here
    const a = t.source;
    const b = t.target;
    const key = a < b ? `${a} ${b}` : `${b} ${a}`;
    let bucket = groups.get(key);
    if (!bucket) {
      bucket = [];
      groups.set(key, bucket);
    }
    bucket.push(t);
  }
  const offsetOf = new Map<StateTransition, number>();
  // Symmetric slot index (…,-1,0,+1,…) per transition within its group, used
  // to stagger labels along the shared group axis (sign carries which side).
  const slotOf = new Map<StateTransition, number>();
  for (const bucket of groups.values()) {
    if (bucket.length <= 1) {
      offsetOf.set(bucket[0]!, 0);
      slotOf.set(bucket[0]!, 0);
      continue;
    }
    // Fan the EDGES of this group out into N distinct arcs. The perpendicular
    // pitch between adjacent arcs is grown to fit the group's widest label so
    // each label, anchored on its own arc's apex, clears the neighbouring arc's
    // label rather than colliding (PlantUML fans the curves, not the labels).
    const pitch = computeGroupBow(bucket);
    const half = (bucket.length - 1) / 2;
    for (let i = 0; i < bucket.length; i++) {
      offsetOf.set(bucket[i]!, (i - half) * pitch);
      slotOf.set(bucket[i]!, i - half);
    }
  }

  // 2. Build a base plan (renderable endpoints) for each transition.
  const plans: EdgePlan[] = [];
  for (const t of transitions) {
    const src = positions.get(t.source);
    const tgt = positions.get(t.target);
    if (!src || !tgt || t.source === t.target) continue;

    const sC = boxCenter(src);
    const tC = boxCenter(tgt);

    // Baseline clipped endpoints (aimed at the opposite center).
    let p1 = rectClip(sC.x, sC.y, src.w, src.h, tC.x, tC.y);
    let p2 = rectClip(tC.x, tC.y, tgt.w, tgt.h, sC.x, sC.y);

    const lateralOffset = offsetOf.get(t) ?? 0;

    // For parallel/bidirectional edges, shift BOTH anchored endpoints
    // perpendicular to the baseline so the two edges attach at distinct
    // boundary points (otherwise their endpoints coincide and the curves read
    // as the same edge). The shift is clamped to keep the anchor on its
    // node's boundary span.
    if (lateralOffset !== 0) {
      // Derive the perpendicular from the UNORDERED (min,max) node pair so a
      // forward edge (A→B) and its backward mate (B→A) share the SAME
      // perpendicular axis. Using the per-edge source→target direction would
      // flip the perpendicular for the backward edge, cancelling its opposite
      // signed offset and collapsing both anchors onto the same point.
      const lo = t.source < t.target ? src : tgt;
      const hi = t.source < t.target ? tgt : src;
      const loC = boxCenter(lo);
      const hiC = boxCenter(hi);
      const dx = hiC.x - loC.x;
      const dy = hiC.y - loC.y;
      const len = Math.hypot(dx, dy) || 1;
      const px = -dy / len;
      const py = dx / len;
      const sShift = clampEndpointShift(lateralOffset, src.w, src.h);
      const tShift = clampEndpointShift(lateralOffset, tgt.w, tgt.h);
      p1 = { x: p1.x + px * sShift, y: p1.y + py * sShift };
      p2 = { x: p2.x + px * tShift, y: p2.y + py * tShift };
    }

    const start: Vec = { x: p1.x, y: p1.y };
    const end: Vec = { x: p2.x, y: p2.y };
    plans.push({ t, start, end, points: [start, end], lateralOffset });
  }

  // 3. Obstacle routing. `positions` holds every box (leaf + container).
  //    Container boxes (those strictly enclosing another box) are modelled as
  //    routing clusters whose members are the ids they enclose, so an edge may
  //    enter/exit its own parent composite but must still avoid OTHER
  //    composites and unrelated sibling nodes.
  const nodeBoxes: NodeBox[] = [];
  for (const [id, p] of positions) {
    nodeBoxes.push({ id, x: p.x, y: p.y, w: p.w, h: p.h });
  }
  const clusterBoxes: ClusterBox[] = [];
  for (const [id, p] of positions) {
    const members = new Set<string>();
    for (const [otherId, q] of positions) {
      if (otherId === id) continue;
      if (strictlyContainsBox(p, q)) members.add(otherId);
    }
    if (members.size > 0) {
      clusterBoxes.push({ id, x: p.x, y: p.y, w: p.w, h: p.h, members });
    }
  }
  const containerIds = new Set(clusterBoxes.map((c) => c.id));
  const leafNodeBoxes = nodeBoxes.filter((n) => !containerIds.has(n.id));

  for (const plan of plans) {
    let obstacles: ReturnType<typeof buildObstacles> = [];
    try {
      obstacles = buildObstacles(
        plan.t.source,
        plan.t.target,
        leafNodeBoxes,
        clusterBoxes,
        ROUTE_MARGIN,
      );
      if (pathBlocked([plan.start, plan.end], obstacles)) {
        const detour = visibilityRoute(plan.start, plan.end, obstacles);
        if (detour && detour.length > 0) {
          plan.points = [plan.start, ...detour, plan.end];
        }
      }
    } catch {
      // Routing failed — keep the straight baseline.
    }
    // Apply the lateral bow on top of the (possibly routed) polyline so
    // parallel/bidirectional edges bow to opposite sides. A wide bow can sweep
    // the arc through an unrelated sibling node, so we clamp the bow magnitude
    // down until the bowed polyline clears every obstacle (keeping a floor so
    // the arc stays distinct from its group mates).
    if (plan.lateralOffset !== 0) {
      plan.points = bowClearOfObstacles(plan.points, plan.lateralOffset, obstacles);
    }
  }

  // 4. Collect labels and place them once with the force-directed pass.
  //
  //    Each label is anchored to the APEX of its OWN bowed edge, on the outer
  //    side of the arc — the label rides the curve it belongs to. Because the
  //    parallel edges of a group already fan out into N distinct arcs (the bow
  //    pitch was sized to fit the labels, step 1), seeding each label on its
  //    own apex spreads the labels apart automatically: the separation comes
  //    from the edge geometry, not from flinging labels into the margin.
  //
  //    The force pass then only resolves residual overlaps with a STRONG spring
  //    back to the apex anchor, so a label that has nowhere else to go stays
  //    glued to its arc instead of drifting off into empty space.
  const labelInputs: XLabelInput[] = [];
  for (let i = 0; i < plans.length; i++) {
    const plan = plans[i]!;
    if (!plan.t.label) continue;
    const id = `e${i}`;
    const { w, h } = measureLabelBox(plan.t.label);
    const anchor = arcLabelAnchor(plan);
    labelInputs.push({ id, size: { w, h }, anchor, path: plan.points });
  }
  // Only leaf node boxes are obstacles for label placement — composite
  // container frames legitimately CONTAIN their edges' labels, so feeding the
  // frame box to the force pass would (wrongly) evict the label out of its own
  // composite and fight the inter-label separation.
  const nodeRects = leafNodeBoxes.map((n) => ({ x: n.x, y: n.y, w: n.w, h: n.h }));
  let labelBoxes = new Map<string, { x: number; y: number; w: number; h: number }>();
  if (labelInputs.length > 0) {
    try {
      // Strong spring + gentle repulsion: the dominant signal is "sit on the
      // apex of your own arc". The pass exists only to nudge a label off a node
      // box or out of a residual overlap with a sibling label; a much firmer
      // spring (vs. the old 0.02) snaps it straight back to its arc afterwards
      // so labels never orphan into the margin. Fewer iterations suffice since
      // the seed is already near-final.
      labelBoxes = placeExternalLabels({
        nodes: nodeRects,
        labels: labelInputs,
        options: { maxIterations: 120, springK: 0.5, repelK: 0.35, padding: 2 },
      }).boxes;
    } catch {
      labelBoxes = new Map();
    }
  }

  // 5. Emit shapes.
  const shapes: Shape[] = [];
  for (let i = 0; i < plans.length; i++) {
    const plan = plans[i]!;
    shapes.push(...emitTransition(plan, plan.t.label ? labelBoxes.get(`e${i}`) : undefined));
  }
  return { shapes, labelBoxes };
}

/**
 * Anchor point for a label that should ride the APEX of its own (possibly
 * bowed) edge, on the OUTER side of the arc.
 *
 * The apex is the polyline midpoint of the final control points. For a bowed
 * parallel edge (`lateralOffset !== 0`) the midpoint already sits out on the
 * arc; we then push the label centre a little further along the same outward
 * perpendicular — by half the label's perpendicular extent plus a small
 * standoff — so the text sits just OUTSIDE the curve rather than straddling it.
 * The outward direction is the bow direction, i.e. the group perpendicular
 * scaled by the sign of the lateral offset.
 *
 * A straight (single) edge keeps the plain midpoint anchor (the force pass
 * nudges it clear of nodes), preserving the previous single-edge behaviour.
 */
function arcLabelAnchor(plan: EdgePlan): Vec {
  const apex = polylineMidpoint(plan.points);
  if (plan.lateralOffset === 0) return apex;
  // Outward perpendicular = the bow direction. Derive the perpendicular from
  // the start→end baseline of the (anchored) endpoints; the bow was applied in
  // this same +perp direction scaled by `lateralOffset`, so the sign of the
  // offset picks the outer side.
  const dx = plan.end.x - plan.start.x;
  const dy = plan.end.y - plan.start.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return apex;
  const px = -dy / len;
  const py = dx / len;
  const sign = plan.lateralOffset >= 0 ? 1 : -1;
  // Stand the label centre a SMALL fixed distance outside the apex so the text
  // rides just outboard of its own curve. We deliberately do NOT offset by the
  // label's full half-width: anchoring the centre on (not beyond) the arc keeps
  // the label visibly hugging its edge — the curve clips the inner edge of the
  // text box, exactly as PlantUML draws it — and keeps every label centre well
  // within the near-its-edge tolerance.
  const standoff = ARC_LABEL_STANDOFF;
  return { x: apex.x + px * sign * standoff, y: apex.y + py * sign * standoff };
}

/**
 * Apply the lateral bow to a (possibly routed) control polyline, but clamp the
 * bow magnitude DOWN if a wider bow would sweep the arc through one of the
 * supplied obstacle boxes.
 *
 * We try the full requested `displacement` first; if the resulting control
 * polyline crosses any obstacle we shrink the magnitude geometrically and retry,
 * down to a floor (`MIN_BOW`) that still keeps the arc visibly distinct from its
 * group mates. If even the floor crosses (rare — the obstacle straddles the
 * baseline), we keep the floor: a slightly clipped arc beats a collapsed,
 * indistinguishable one. The sign (which side the arc bows to) is always
 * preserved so an arc never flips onto its neighbour.
 */
function bowClearOfObstacles(
  points: Vec[],
  displacement: number,
  obstacles: ReturnType<typeof buildObstacles>,
): Vec[] {
  const MIN_BOW = 12;
  const sign = displacement >= 0 ? 1 : -1;
  const full = Math.abs(displacement);
  if (obstacles.length === 0) {
    return separatedSplinePoints(points, displacement);
  }
  // Densify a control polyline into segment samples for the obstacle test (the
  // rendered bezier stays inside the control hull, so testing the hull is a
  // safe over-approximation).
  const crosses = (poly: Vec[]): boolean => {
    let blocked = false;
    try {
      blocked = pathBlocked(poly, obstacles);
    } catch {
      blocked = false;
    }
    return blocked;
  };
  for (let mag = full; mag >= MIN_BOW; mag *= 0.75) {
    const bowed = separatedSplinePoints(points, sign * mag);
    if (!crosses(bowed)) return bowed;
  }
  // Fall through to the floor.
  return separatedSplinePoints(points, sign * MIN_BOW);
}

/**
 * Perpendicular endpoint shift for a parallel edge. Caps the magnitude so the
 * shifted anchor stays well within the node's boundary span (otherwise the
 * arrowhead would slide off the corner of a small node).
 */
function clampEndpointShift(lateralOffset: number, w: number, h: number): number {
  // Use most of the perpendicular offset (so the two boundary anchors of a
  // bidirectional pair land clearly apart — past the harness's 6px coincidence
  // tolerance), but cap it to stay within the node's boundary span so the
  // arrowhead doesn't slide off a small node's corner.
  // Floor of 5px guarantees the two anchors of a bidirectional pair clear the
  // 6px coincidence tolerance even on small nodes; the cap keeps the anchor on
  // the node's boundary span for larger offsets.
  const cap = Math.max(5, Math.min(w, h) / 2 - 3);
  const mag = Math.min(Math.max(Math.abs(lateralOffset), 5), cap);
  return lateralOffset >= 0 ? mag : -mag;
}

/**
 * Perpendicular pitch (px) between adjacent arcs of a parallel/bidirectional
 * group, sized so each arc's label clears the neighbouring arc's label.
 *
 * The N arcs of a group bow out at multiples of this pitch (slots …,-1,0,+1,…),
 * and each label rides the apex of its own arc. For the fan to read clearly the
 * spacing between two adjacent apexes must exceed the half-widths of the two
 * labels that sit there plus a gap — otherwise wide labels (e.g.
 * `EvNewValueRejected`) overlap their neighbours. We therefore derive the pitch
 * from the group's widest label width, floored by `PARALLEL_ARC_MIN_PITCH` so
 * narrow/empty-label groups still separate into legible curves.
 */
function computeGroupBow(bucket: StateTransition[]): number {
  let maxLabelW = 0;
  for (const t of bucket) {
    if (!t.label) continue;
    maxLabelW = Math.max(maxLabelW, measureLabelBox(t.label).w);
  }
  // Adjacent apexes are one pitch apart on the perpendicular axis. To keep both
  // labels (each centred on its apex) clear, the pitch must exceed one label
  // width plus a gap. (Two half-widths from the two neighbours = one full
  // width.)
  const needed = maxLabelW + PARALLEL_ARC_LABEL_GAP;
  return Math.max(PARALLEL_ARC_MIN_PITCH, needed);
}

function measureLabelBox(label: string): { w: number; h: number } {
  const lines = label.split('\n');
  let w = 0;
  let h = 0;
  for (const line of lines) {
    const m = measureText(line, EDGE_LABEL_FONT);
    w = Math.max(w, m.width);
    h += EDGE_LABEL_FONT * 1.2;
  }
  return { w: Math.max(w, 1), h: Math.max(h, EDGE_LABEL_FONT) };
}

function polylineMidpoint(points: Vec[]): Vec {
  if (points.length < 2) return points[0] ?? { x: 0, y: 0 };
  const seg: number[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const len = Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y);
    seg.push(len);
    total += len;
  }
  let target = total / 2;
  for (let i = 0; i < seg.length; i++) {
    if (target <= seg[i]!) {
      const tt = seg[i]! === 0 ? 0 : target / seg[i]!;
      return {
        x: points[i]!.x + (points[i + 1]!.x - points[i]!.x) * tt,
        y: points[i]!.y + (points[i + 1]!.y - points[i]!.y) * tt,
      };
    }
    target -= seg[i]!;
  }
  return points[points.length - 1]!;
}

/**
 * Emit the line/bezier path + markers + label text for one planned edge.
 * Mirrors the previous straight-line renderer's styling/marker/multi-line
 * behavior, but draws the (possibly routed/bowed) polyline as a smooth Bezier
 * when it has interior control points, and positions the label at the resolved
 * xlabel box.
 */
function emitTransition(
  plan: EdgePlan,
  labelBox: { x: number; y: number; w: number; h: number } | undefined,
): Shape[] {
  const t = plan.t;
  const original = plan.points;
  const start = original[0]!;
  const end = original[original.length - 1]!;
  const shortened = shortenPolyline(
    original,
    markerLength(t.sourceMarker),
    markerLength(t.targetMarker),
  );

  // Per-edge inline overrides (`-[#red,dashed]->`) take precedence over the
  // structural style; fall back to the dashed/solid classification otherwise.
  const stroke = t.lineColor ?? COLOR_EDGE;
  const variant = t.lineStyle ?? (t.style === 'dashed' ? 'dashed' : 'solid');
  const lineStyle: Style =
    variant === 'bold'
      ? { stroke, strokeWidth: 2, fill: 'none' }
      : variant === 'dotted'
        ? { stroke, strokeWidth: 1, strokeDasharray: '2,2', fill: 'none' }
        : variant === 'dashed'
          ? { stroke, strokeWidth: 1, strokeDasharray: '5,3', fill: 'none' }
          : { stroke, strokeWidth: 1, fill: 'none' };

  const useBezier = shortened.length >= 3;
  const shapes: Shape[] = [
    useBezier
      ? bezierPathShape(shortened, lineStyle)
      : {
          type: 'line',
          x1: shortened[0]!.x, y1: shortened[0]!.y,
          x2: shortened[shortened.length - 1]!.x, y2: shortened[shortened.length - 1]!.y,
          style: lineStyle,
        },
  ];

  // Marker tangents: for a curve use the first/last interior segment so the
  // arrowhead aligns with the spline; for a straight line use the endpoints.
  const startPrev = useBezier ? original[1]! : end;
  const endPrev = useBezier ? original[original.length - 2]! : start;
  const srcMarker = drawMarker(t.sourceMarker, start, startPrev);
  if (srcMarker) shapes.push(srcMarker);
  const tgtMarker = drawMarker(t.targetMarker, end, endPrev);
  if (tgtMarker) shapes.push(tgtMarker);

  if (t.label) {
    const anchor = labelBox
      ? { x: labelBox.x + labelBox.w / 2, y: labelBox.y + labelBox.h / 2 }
      : polylineMidpoint(original);
    const lines = t.label.split('\n');
    if (lines.length > 1) {
      const lineHeight = EDGE_LABEL_FONT * 1.2;
      const totalH = lineHeight * lines.length;
      const startY = anchor.y - totalH / 2 + lineHeight / 2;
      for (let i = 0; i < lines.length; i++) {
        shapes.push({
          type: 'text',
          x: anchor.x,
          y: startY + i * lineHeight,
          text: lines[i]!,
          anchor: 'middle',
          baseline: 'middle',
          font: { family: FONT_FAMILY, size: EDGE_LABEL_FONT, color: '#000' },
        });
      }
    } else {
      shapes.push({
        type: 'text',
        x: anchor.x,
        y: anchor.y,
        text: t.label,
        anchor: 'middle',
        baseline: 'middle',
        font: { family: FONT_FAMILY, size: EDGE_LABEL_FONT, color: '#000' },
      });
    }
  }

  return shapes;
}

/**
 * Smooth a control polyline (≥ 3 points) into a cubic Bezier `<path>` via the
 * same Catmull-Rom-to-Bezier construction `makeBezierPath` uses in
 * `common/edges.ts` (kept local to avoid widening that module's exports).
 */
function bezierPathShape(points: Vec[], style: Style): Shape {
  const n = points.length;
  if (n === 2) {
    return {
      type: 'path',
      d: `M ${points[0]!.x} ${points[0]!.y} L ${points[1]!.x} ${points[1]!.y}`,
      style,
    };
  }
  const T = 1 / 6;
  const parts: string[] = [`M ${fmtNum(points[0]!.x)} ${fmtNum(points[0]!.y)}`];
  for (let i = 0; i < n - 1; i++) {
    const p0 = points[i]!;
    const p1 = points[i + 1]!;
    const pPrev = i === 0 ? p0 : points[i - 1]!;
    const pNext = i + 2 >= n ? p1 : points[i + 2]!;
    const cp1x = p0.x + (p1.x - pPrev.x) * T;
    const cp1y = p0.y + (p1.y - pPrev.y) * T;
    const cp2x = p1.x - (pNext.x - p0.x) * T;
    const cp2y = p1.y - (pNext.y - p0.y) * T;
    parts.push(
      `C ${fmtNum(cp1x)} ${fmtNum(cp1y)}, ${fmtNum(cp2x)} ${fmtNum(cp2y)}, ${fmtNum(p1.x)} ${fmtNum(p1.y)}`,
    );
  }
  return { type: 'path', d: parts.join(' '), style };
}

function fmtNum(n: number): string {
  return String(Math.round(n * 1e6) / 1e6);
}

function rectClip(
  cx: number, cy: number, w: number, h: number,
  tx: number, ty: number,
): { x: number; y: number } {
  const dx = tx - cx;
  const dy = ty - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const sx = w / 2;
  const sy = h / 2;
  const tRatioX = Math.abs(dx) > 0 ? sx / Math.abs(dx) : Infinity;
  const tRatioY = Math.abs(dy) > 0 ? sy / Math.abs(dy) : Infinity;
  const t = Math.min(tRatioX, tRatioY, 1);
  return { x: cx + dx * t, y: cy + dy * t };
}
