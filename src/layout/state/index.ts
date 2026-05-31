import type {
  StateAst,
  StateNode,
  StateTransition,
} from '../../ast/state.js';
import type { ClassRelationship } from '../../ast/class.js';
import type { Scene, Shape, Style } from '../../scene/types.js';
import { measureText } from '../sequence/measure.js';
import { buildLayoutEdges, removeCycles } from '../class/sugiyama.js';
import {
  DotSugiyamaEngine,
  type EdgeSpec,
  type LayoutGraph,
  type NodeSpec,
} from '../engine/index.js';
import {
  SELF_LOOP_OUT,
  computeLateralOffsets,
  drawLayeredEdge,
  drawLayeredSelfLoop,
} from '../common/edges.js';
import type { BoxSize, EdgeAttrs, EdgeStyle, NodeCenter, Position } from '../common/types.js';
import { layoutStateNested } from './nested.js';
import { sdlOutlineShape } from './shapes.js';

function hasAnyChildren(states: StateNode[]): boolean {
  for (const s of states) {
    if (s.children.length > 0) return true;
    if (hasAnyChildren(s.children)) return true;
  }
  return false;
}

const PAGE_PAD = 16;
const TITLE_FONT = 16;
const TITLE_GAP = 8;
const LAYER_GAP = 50;
const HORIZONTAL_GAP = 30;
const NORMAL_PAD_X = 14;
const NORMAL_PAD_Y = 8;
const NORMAL_MIN_W = 70;
const NORMAL_MIN_H = 30;
// Vertical space between the name section and the divider line that opens the
// description section.
const DIVIDER_GAP = 8;
// Vertical space between adjacent description rows inside the description
// section.
const DESC_ROW_GAP = 2;
const INITIAL_SIZE = 16;
const FINAL_SIZE = 18;
const CHOICE_SIZE = 28;
const FORK_W = 60;
const FORK_H = 8;
const HISTORY_SIZE = 22;

const FONT_FAMILY = 'sans-serif';
const FONT_LABEL = 12;
const EDGE_LABEL_FONT = 11;

const COLOR_LINE = '#222';
const COLOR_EDGE = '#444';
const COLOR_NORMAL_FILL = '#fefece';
const COLOR_PSEUDO = '#222';
const COLOR_CHOICE_FILL = '#fefece';

const EDGE_STYLE: EdgeStyle = {
  color: COLOR_EDGE,
  fontFamily: FONT_FAMILY,
  labelFontSize: EDGE_LABEL_FONT,
};

export function layoutState(ast: StateAst): Scene {
  if (ast.states.length === 0) {
    return emptyScene();
  }

  if (hasAnyChildren(ast.states)) {
    return layoutStateNested(ast);
  }

  const sizes = new Map(ast.states.map((s) => [s.id, measureState(s)]));
  const titleHeight = ast.title ? TITLE_FONT + TITLE_GAP : 0;

  const asRel = (t: StateTransition): ClassRelationship => {
    const rel: ClassRelationship = {
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
    };
    if (t.lineColor) rel.lineColor = t.lineColor;
    if (t.lineStyle) rel.lineStyle = t.lineStyle;
    if (t.direction) rel.direction = t.direction;
    return rel;
  };

  const selfLoops = ast.transitions.filter((t) => t.source === t.target);
  const nonLoops = ast.transitions.filter((t) => t.source !== t.target);

  const shapes: Shape[] = [];

  const base =
    nonLoops.length === 0
      ? gridLayout(ast, sizes, titleHeight)
      : layeredLayout(ast, sizes, titleHeight, nonLoops.map(asRel));

  const extraRight = selfLoopExtraWidth(selfLoops, base.positions, sizes);
  const totalWidth = base.width + extraRight;

  if (ast.title) {
    shapes.push({
      type: 'text',
      x: totalWidth / 2,
      y: PAGE_PAD + TITLE_FONT,
      text: ast.title,
      anchor: 'middle',
      baseline: 'alphabetic',
      font: { family: FONT_FAMILY, size: TITLE_FONT, weight: 'bold', color: '#000' },
    });
  }

  if (base.drawable) {
    const offsets = computeLateralOffsets(base.drawable);
    for (const edge of base.drawable) {
      // `edge.rel` is already the per-edge relationship (source/target,
      // markers, style and the edge's OWN label) threaded through from the
      // input transition. We use it directly rather than re-matching against
      // `ast.transitions` by (source,target): such a match returns the FIRST
      // transition for a pair, which collapses parallel edges (same endpoints,
      // different labels) onto a single label. The relationship already
      // carries the correct per-edge label, so no lookup is needed.
      const attrs: EdgeAttrs = edge.rel;
      shapes.push(
        ...drawLayeredEdge({
          fromId: edge.fromId,
          toId: edge.toId,
          waypoints: edge.waypoints,
          rel: attrs,
          positions: base.positions,
          sizes,
          centers: base.centers!,
          style: EDGE_STYLE,
          lateralOffset: offsets.get(edge) ?? 0,
          // Engine flags multi-segment edges as bezier candidates. The
          // renderer falls back to a polyline when there's nothing to
          // smooth (i.e. no waypoints), so this is a hint, not a command.
          ...(edge.curve ? { curve: edge.curve } : {}),
          // Engine-computed label rectangle (Step D3). When present, the
          // renderer anchors the label at its centre instead of the
          // polyline midpoint.
          ...(edge.labelBox ? { labelBox: edge.labelBox } : {}),
        }),
      );
    }
  }

  for (const t of selfLoops) {
    const pos = base.positions.get(t.source);
    const sz = sizes.get(t.source);
    if (pos && sz) shapes.push(...drawLayeredSelfLoop(t, pos, sz, EDGE_STYLE));
  }

  for (const node of ast.states) {
    const pos = base.positions.get(node.id);
    if (!pos) continue;
    shapes.push(...drawState(node, pos, sizes.get(node.id)!));
  }

  return {
    width: totalWidth,
    height: base.height,
    background: '#fff',
    children: shapes,
  };
}

interface BaseResult {
  positions: Map<string, Position>;
  width: number;
  height: number;
  drawable?: Array<{
    fromId: string;
    toId: string;
    waypoints: string[];
    rel: ClassRelationship;
    /**
     * Visual treatment for this edge passed through from the layout engine.
     * `'bezier'` when the engine introduced bend points (multi-segment route)
     * so the renderer can smooth the corners; `'straight'` for direct edges.
     */
    curve?: 'straight' | 'bezier';
    /**
     * Collision-avoided label rectangle (Phase 1 Step D3). When set, the
     * renderer anchors the edge's label at the centre of this box instead
     * of the polyline midpoint.
     */
    labelBox?: { x: number; y: number; width: number; height: number };
  }>;
  centers?: Map<string, NodeCenter>;
}

function gridLayout(ast: StateAst, sizes: Map<string, BoxSize>, titleHeight: number): BaseResult {
  const positions = new Map<string, Position>();
  let cursorX = PAGE_PAD;
  let maxH = 0;
  for (const node of ast.states) {
    const sz = sizes.get(node.id)!;
    positions.set(node.id, { x: cursorX, y: PAGE_PAD + titleHeight });
    cursorX += sz.w + HORIZONTAL_GAP;
    maxH = Math.max(maxH, sz.h);
  }
  return {
    positions,
    width: cursorX - HORIZONTAL_GAP + PAGE_PAD,
    height: PAGE_PAD + titleHeight + maxH + PAGE_PAD,
  };
}

function layeredLayout(
  ast: StateAst,
  sizes: Map<string, BoxSize>,
  titleHeight: number,
  rels: ClassRelationship[],
): BaseResult {
  // Build a LayoutGraph from state nodes + transitions, run the engine, then
  // unpack the result into the (positions, centers, drawable) shape that the
  // existing edge/shape renderers consume.
  //
  // `buildLayoutEdges` is reused so that marker-based direction inference
  // (e.g. `<--` flips source/target) is preserved exactly — the engine itself
  // is direction-agnostic and would otherwise lay edges out in source-text
  // order.
  const nodes = new Map<string, NodeSpec>();
  for (const s of ast.states) {
    const sz = sizes.get(s.id)!;
    nodes.set(s.id, { id: s.id, width: sz.w, height: sz.h });
  }

  // Mirror the legacy pipeline's two-step orientation:
  //   1. `buildLayoutEdges` flips edges based on marker (`<--` swaps source/target).
  //   2. `removeCycles` flips edges as needed to break cycles.
  // The post-cycle-break orientation is what `drawLayeredEdge` and
  // `computeLateralOffsets` need: a pair of bidirectional transitions
  // (A↔B) must share the same (fromId, toId) so their parallel-edge lateral
  // offsets push them onto opposite sides instead of overlapping.
  const flipped = buildLayoutEdges(rels);
  const nodeIds = ast.states.map((s) => s.id);
  removeCycles(nodeIds, flipped);
  // Measure each edge label so the engine's collision-avoidance pass can
  // size the rectangle it tries to slot off the midpoint. We measure with
  // the same font size the renderer uses (`EDGE_LABEL_FONT`) and add a
  // small padding so the avoidance rect has a visible visual buffer.
  const LABEL_PAD_X = 4;
  const LABEL_PAD_Y = 2;
  const edgeSpecs: EdgeSpec[] = flipped.map((e, i) => {
    // Tag each edge with a stable id = its index in `flipped`. This is what
    // lets the engine keep *parallel* edges (same from + same to but different
    // labels, e.g. two `A --> B : …` transitions) as distinct result entries.
    // We then look each layout back up positionally by the same id below.
    const spec: EdgeSpec = { id: `e${i}`, from: e.from, to: e.to, label: e.rel.label };
    if (e.rel.label) {
      const m = measureText(e.rel.label, EDGE_LABEL_FONT);
      spec.labelSize = { w: m.width + LABEL_PAD_X * 2, h: m.height + LABEL_PAD_Y * 2 };
    }
    return spec;
  });

  const graph: LayoutGraph = {
    nodes,
    edges: edgeSpecs,
    subgraphs: new Map(),
  };

  const result = new DotSugiyamaEngine().layout(graph, {
    defaultDirection: 'TB',
    nodeSep: HORIZONTAL_GAP,
    rankSep: LAYER_GAP,
    margin: PAGE_PAD,
  });

  // Shift everything down by titleHeight so the title (rendered above the
  // canvas in `layoutState`) doesn't overlap the top row.
  const positions = new Map<string, Position>();
  const centers = new Map<string, NodeCenter>();
  for (const [id, nl] of result.nodes) {
    positions.set(id, { x: nl.x, y: nl.y + titleHeight });
    centers.set(id, { cx: nl.x + nl.w / 2, cy: nl.y + nl.h / 2 + titleHeight });
  }

  // Rebuild the legacy `drawable[]` shape from the engine's polyline output.
  // For each edge with bend points, synthesize stable dummy waypoint IDs and
  // register their centers; `drawLayeredEdge` reads waypoint vectors out of
  // the `centers` map.
  const drawable: Array<{
    fromId: string;
    toId: string;
    waypoints: string[];
    rel: ClassRelationship;
    curve?: 'straight' | 'bezier';
    labelBox?: { x: number; y: number; width: number; height: number };
  }> = [];
  let wpCounter = 0;
  for (let i = 0; i < flipped.length; i++) {
    const le = flipped[i]!;
    // Look the layout back up by the same per-edge id we tagged above, so
    // parallel edges (which share `from`/`to`) each pick up their own polyline
    // and label box instead of colliding on a shared `from->to` key.
    const layout = result.edges.get(`e${i}`);
    const waypoints: string[] = [];
    if (layout && layout.points.length > 2) {
      // Interior points are the bends; convert to synthetic centers.
      for (let p = 1; p < layout.points.length - 1; p++) {
        const pt = layout.points[p]!;
        const wpId = `__state_wp_${wpCounter++}`;
        waypoints.push(wpId);
        centers.set(wpId, { cx: pt.x, cy: pt.y + titleHeight });
      }
    }
    drawable.push({
      fromId: le.from,
      toId: le.to,
      waypoints,
      rel: le.rel,
      // Propagate the engine's curve hint so `drawLayeredEdge` can choose
      // between a straight polyline and a smoothed cubic-Bezier path.
      ...(layout?.curve ? { curve: layout.curve } : {}),
      // Propagate the engine's collision-avoided label box (Step D3). The
      // engine anchored it in the (0,0)-anchored coordinate system; we
      // translate it down by `titleHeight` so it matches the on-screen
      // positions stored in `positions` / `centers`.
      ...(layout?.labelBox
        ? {
            labelBox: {
              x: layout.labelBox.x,
              y: layout.labelBox.y + titleHeight,
              width: layout.labelBox.width,
              height: layout.labelBox.height,
            },
          }
        : {}),
    });
  }

  return {
    positions,
    centers,
    drawable,
    width: result.bbox.w,
    height: result.bbox.h + titleHeight,
  };
}

function selfLoopExtraWidth(
  loops: StateTransition[],
  positions: Map<string, Position>,
  sizes: Map<string, BoxSize>,
): number {
  let extra = 0;
  for (const t of loops) {
    const pos = positions.get(t.source);
    const sz = sizes.get(t.source);
    if (!pos || !sz) continue;
    const rightEdge = pos.x + sz.w + SELF_LOOP_OUT + 28;
    extra = Math.max(extra, rightEdge);
  }
  if (extra === 0) return 0;
  let maxBox = 0;
  for (const [id, pos] of positions) {
    const sz = sizes.get(id);
    if (!sz) continue;
    maxBox = Math.max(maxBox, pos.x + sz.w);
  }
  return Math.max(0, extra - maxBox);
}

function measureState(s: StateNode): BoxSize {
  switch (s.stateKind) {
    case 'initial': return { w: INITIAL_SIZE, h: INITIAL_SIZE };
    case 'final':   return { w: FINAL_SIZE, h: FINAL_SIZE };
    case 'choice':  return { w: CHOICE_SIZE, h: CHOICE_SIZE };
    case 'fork':
    case 'join':    return { w: FORK_W, h: FORK_H };
    case 'history': return { w: HISTORY_SIZE, h: HISTORY_SIZE };
    case 'normal':
    default: {
      const nameM = measureText(s.name, FONT_LABEL);
      let w = nameM.width;
      let h = nameM.height;
      const descs = s.descriptions ?? [];
      if (descs.length > 0) {
        // Divider + per-row text. Each row stacks vertically.
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

function rectStyleFor(node: StateNode, baseFill: string, baseStroke: string): Style {
  const style: Style = { fill: node.fill ?? baseFill, stroke: node.lineColor ?? baseStroke, strokeWidth: 1 };
  if (node.lineStyle === 'bold') style.strokeWidth = 2;
  else if (node.lineStyle === 'dashed') style.strokeDasharray = '4,2';
  else if (node.lineStyle === 'dotted') style.strokeDasharray = '2,3';
  return style;
}

function drawState(node: StateNode, pos: Position, sz: BoxSize): Shape[] {
  const cx = pos.x + sz.w / 2;
  const cy = pos.y + sz.h / 2;
  switch (node.stateKind) {
    case 'initial':
      return [
        {
          type: 'circle',
          cx, cy, r: sz.w / 2,
          style: { fill: COLOR_PSEUDO, stroke: COLOR_PSEUDO, strokeWidth: 1 },
        },
      ];
    case 'final':
      return [
        {
          type: 'circle',
          cx, cy, r: sz.w / 2,
          style: { fill: '#fff', stroke: COLOR_PSEUDO, strokeWidth: 1.2 },
        },
        {
          type: 'circle',
          cx, cy, r: sz.w / 2 - 4,
          style: { fill: COLOR_PSEUDO, stroke: COLOR_PSEUDO, strokeWidth: 1 },
        },
      ];
    case 'choice': {
      const r = sz.w / 2;
      return [
        {
          type: 'polygon',
          points: [
            [cx, cy - r],
            [cx + r, cy],
            [cx, cy + r],
            [cx - r, cy],
          ],
          style: { fill: COLOR_CHOICE_FILL, stroke: COLOR_LINE, strokeWidth: 1 },
        },
      ];
    }
    case 'fork':
    case 'join':
      return [
        {
          type: 'rect',
          x: pos.x, y: pos.y, w: sz.w, h: sz.h,
          style: { fill: COLOR_PSEUDO, stroke: COLOR_PSEUDO, strokeWidth: 1 },
        },
      ];
    case 'history':
      return [
        {
          type: 'circle',
          cx, cy, r: sz.w / 2,
          style: { fill: '#fff', stroke: COLOR_LINE, strokeWidth: 1 },
        },
        {
          type: 'text',
          x: cx, y: cy,
          text: 'H',
          anchor: 'middle',
          baseline: 'middle',
          font: { family: FONT_FAMILY, size: FONT_LABEL, weight: 'bold', color: '#000' },
        },
      ];
    case 'normal':
    default: {
      const textColor = node.textColor ?? '#000';
      const strokeColor = node.lineColor ?? COLOR_LINE;
      const baseStyle = rectStyleFor(node, COLOR_NORMAL_FILL, COLOR_LINE);
      const shapes: Shape[] = [
        sdlOutlineShape(node, pos.x, pos.y, sz.w, sz.h, baseStyle) ?? {
          type: 'rect',
          x: pos.x, y: pos.y, w: sz.w, h: sz.h,
          rx: 8, ry: 8,
          style: baseStyle,
        },
      ];
      const descs = node.descriptions ?? [];
      if (descs.length > 0) {
        const nameH = measureText(node.name, FONT_LABEL).height;
        const nameY = pos.y + NORMAL_PAD_Y + nameH / 2;
        const dividerY = nameY + nameH / 2 + DIVIDER_GAP / 2;
        shapes.push({
          type: 'text',
          x: cx, y: nameY,
          text: node.name,
          anchor: 'middle',
          baseline: 'middle',
          font: { family: FONT_FAMILY, size: FONT_LABEL, color: textColor },
        });
        shapes.push({
          type: 'line',
          x1: pos.x, y1: dividerY,
          x2: pos.x + sz.w, y2: dividerY,
          style: { stroke: strokeColor, strokeWidth: 1 },
        });
        let rowTop = dividerY + DIVIDER_GAP / 2;
        for (const desc of descs) {
          const dh = measureText(desc, FONT_LABEL).height;
          shapes.push({
            type: 'text',
            x: cx, y: rowTop + dh / 2,
            text: desc,
            anchor: 'middle',
            baseline: 'middle',
            font: { family: FONT_FAMILY, size: FONT_LABEL, color: textColor },
          });
          rowTop += dh + DESC_ROW_GAP;
        }
      } else {
        shapes.push({
          type: 'text',
          x: cx, y: cy,
          text: node.name,
          anchor: 'middle',
          baseline: 'middle',
          font: { family: FONT_FAMILY, size: FONT_LABEL, color: textColor },
        });
      }
      return shapes;
    }
  }
}

function emptyScene(): Scene {
  return {
    width: 220,
    height: 60,
    background: '#fff',
    children: [
      {
        type: 'text',
        x: 110,
        y: 30,
        text: '(empty state diagram)',
        anchor: 'middle',
        baseline: 'middle',
        font: { family: FONT_FAMILY, size: 12, color: '#999' },
      },
    ],
  };
}
