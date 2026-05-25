import type {
  StateAst,
  StateNode,
  StateTransition,
} from '../../ast/state.js';
import type { ClassRelationship } from '../../ast/class.js';
import type { Scene, Shape } from '../../scene/types.js';
import { measureText } from '../sequence/measure.js';
import {
  assignLayers,
  buildLayoutEdges,
  groupByLayer,
  insertDummies,
  minimizeCrossings,
  removeCycles,
  assignCoordinates,
  type LayoutEdge,
} from '../class/sugiyama.js';
import {
  SELF_LOOP_OUT,
  computeLateralOffsets,
  drawLayeredEdge,
  drawLayeredSelfLoop,
} from '../common/edges.js';
import type { BoxSize, EdgeAttrs, EdgeStyle, NodeCenter, Position } from '../common/types.js';
import { layoutStateNested } from './nested.js';

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
const DUMMY_GAP = 12;
const NORMAL_PAD_X = 14;
const NORMAL_PAD_Y = 8;
const NORMAL_MIN_W = 70;
const NORMAL_MIN_H = 30;
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

  const asRel = (t: StateTransition): ClassRelationship => ({
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
  });

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
      const t = ast.transitions.find(
        (tr) => tr.source === edge.rel.source && tr.target === edge.rel.target,
      );
      const attrs: EdgeAttrs = t
        ? {
            source: t.source,
            target: t.target,
            style: t.style,
            sourceMarker: t.sourceMarker,
            targetMarker: t.targetMarker,
            label: t.label,
          }
        : edge.rel;
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
  drawable?: Array<{ fromId: string; toId: string; waypoints: string[]; rel: ClassRelationship }>;
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
  const nodeIds = ast.states.map((s) => s.id);
  const edges: LayoutEdge[] = buildLayoutEdges(rels);
  removeCycles(nodeIds, edges);
  const baseLayers = assignLayers(nodeIds, edges);
  const dummy = insertDummies(nodeIds, edges, baseLayers);
  const initialGroups = groupByLayer(dummy.extendedNodeIds, dummy.layers);
  const ordered = minimizeCrossings(initialGroups, dummy.segments);

  const layerHeights = ordered.map((layer) => {
    let h = 0;
    for (const id of layer) {
      if (dummy.dummyIds.has(id)) continue;
      h = Math.max(h, sizes.get(id)!.h);
    }
    return h;
  });

  const coords = assignCoordinates({
    orderedLayers: ordered,
    segments: dummy.segments,
    widthOf: (id) => sizes.get(id)?.w ?? 0,
    dummyIds: dummy.dummyIds,
    horizontalGap: HORIZONTAL_GAP,
    dummyGap: DUMMY_GAP,
  });
  const maxW = coords.maxLayerWidth > 0 ? coords.maxLayerWidth : 200;
  const totalW = maxW + PAGE_PAD * 2;

  const positions = new Map<string, Position>();
  const centers = new Map<string, NodeCenter>();

  let cursorY = PAGE_PAD + titleHeight;
  for (let l = 0; l < ordered.length; l++) {
    const layer = ordered[l]!;
    const layerH = layerHeights[l]!;
    for (const id of layer) {
      const cx = PAGE_PAD + coords.centerX.get(id)!;
      const isDummy = dummy.dummyIds.has(id);
      if (isDummy) {
        centers.set(id, { cx, cy: cursorY + layerH / 2 });
      } else {
        const sz = sizes.get(id)!;
        positions.set(id, { x: cx - sz.w / 2, y: cursorY });
        centers.set(id, { cx, cy: cursorY + sz.h / 2 });
      }
    }
    cursorY += layerH + LAYER_GAP;
  }

  return {
    positions,
    centers,
    drawable: dummy.drawable,
    width: totalW,
    height: cursorY - LAYER_GAP + PAGE_PAD,
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
      const lw = measureText(s.name, FONT_LABEL).width;
      const lh = measureText(s.name, FONT_LABEL).height;
      return {
        w: Math.max(NORMAL_MIN_W, lw + NORMAL_PAD_X * 2),
        h: Math.max(NORMAL_MIN_H, lh + NORMAL_PAD_Y * 2),
      };
    }
  }
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
    default:
      return [
        {
          type: 'rect',
          x: pos.x, y: pos.y, w: sz.w, h: sz.h,
          rx: 8, ry: 8,
          style: { fill: COLOR_NORMAL_FILL, stroke: COLOR_LINE, strokeWidth: 1 },
        },
        {
          type: 'text',
          x: cx, y: cy,
          text: node.name,
          anchor: 'middle',
          baseline: 'middle',
          font: { family: FONT_FAMILY, size: FONT_LABEL, color: '#000' },
        },
      ];
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
