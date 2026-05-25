import type {
  UCNode,
  UCRelationship,
  UseCaseAst,
} from '../../ast/usecase.js';
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
import type { ClassRelationship } from '../../ast/class.js';

const PAGE_PAD = 16;
const TITLE_FONT = 16;
const TITLE_GAP = 8;
const LAYER_GAP = 60;
const HORIZONTAL_GAP = 36;
const DUMMY_GAP = 12;
const ACTOR_BOX_W = 56;
const ACTOR_BOX_H = 64;
const UC_PAD_X = 16;
const UC_PAD_Y = 8;
const UC_MIN_W = 90;
const UC_MIN_H = 38;
const CONTAINER_PAD = 14;
const CONTAINER_HEADER_H = 22;
const CONTAINER_LABEL_FONT = 13;

const FONT_FAMILY = 'sans-serif';
const FONT_LABEL = 12;
const EDGE_LABEL_FONT = 11;

const COLOR_LINE = '#222';
const COLOR_EDGE = '#444';
const COLOR_FILL_ACTOR = '#fefece';
const COLOR_FILL_UC = '#fefece';
const COLOR_CONTAINER_STROKE = '#999';

const EDGE_STYLE: EdgeStyle = {
  color: COLOR_EDGE,
  fontFamily: FONT_FAMILY,
  labelFontSize: EDGE_LABEL_FONT,
};

export function layoutUseCase(ast: UseCaseAst): Scene {
  if (ast.nodes.length === 0) {
    return emptyScene();
  }

  const sizes = new Map(ast.nodes.map((n) => [n.id, measureNode(n)]));
  const titleHeight = ast.title ? TITLE_FONT + TITLE_GAP : 0;
  const containerTopReserve = ast.containers.length > 0
    ? CONTAINER_HEADER_H + CONTAINER_PAD
    : 0;
  const layoutTitleHeight = titleHeight + containerTopReserve;

  const asRel = (r: UCRelationship): ClassRelationship => ({
    source: r.source,
    target: r.target,
    sourceMult: '',
    targetMult: '',
    arrowToken: r.arrowToken,
    kind: 'association',
    style: r.style,
    sourceMarker: r.sourceMarker,
    targetMarker: r.targetMarker,
    label: r.label,
    labelDirection: 'none',
  });

  const selfLoops = ast.relationships.filter((r) => r.source === r.target);
  const nonLoops = ast.relationships.filter((r) => r.source !== r.target);

  const shapes: Shape[] = [];

  const base =
    nonLoops.length === 0
      ? gridLayout(ast, sizes, layoutTitleHeight)
      : layeredLayout(ast, sizes, layoutTitleHeight, nonLoops.map(asRel));

  const extraRight = selfLoopExtraWidth(selfLoops, base.positions, sizes);
  let totalWidth = base.width + extraRight;
  let totalHeight = base.height;

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

  for (const container of ast.containers) {
    const bbox = childBoundingBox(container.childIds, base.positions, sizes);
    if (!bbox) continue;
    const rectX = bbox.minX - CONTAINER_PAD;
    const rectY = bbox.minY - CONTAINER_PAD - CONTAINER_HEADER_H;
    const rectW = bbox.maxX - bbox.minX + CONTAINER_PAD * 2;
    const rectH = bbox.maxY - bbox.minY + CONTAINER_PAD * 2 + CONTAINER_HEADER_H;
    shapes.push({
      type: 'rect',
      x: rectX,
      y: rectY,
      w: rectW,
      h: rectH,
      style: {
        fill: 'none',
        stroke: COLOR_CONTAINER_STROKE,
        strokeWidth: 1,
      },
    });
    if (container.label) {
      shapes.push({
        type: 'text',
        x: rectX + CONTAINER_PAD,
        y: rectY + CONTAINER_HEADER_H - 6,
        text: container.label,
        anchor: 'start',
        baseline: 'alphabetic',
        font: {
          family: FONT_FAMILY,
          size: CONTAINER_LABEL_FONT,
          weight: 'bold',
          color: '#444',
        },
      });
    }
    totalWidth = Math.max(totalWidth, rectX + rectW + PAGE_PAD);
    totalHeight = Math.max(totalHeight, rectY + rectH + PAGE_PAD);
  }

  if (base.drawable) {
    const offsets = computeLateralOffsets(base.drawable);
    for (const edge of base.drawable) {
      const ucRel = ast.relationships.find(
        (r) => r.source === edge.rel.source && r.target === edge.rel.target,
      );
      const attrs: EdgeAttrs = ucRel
        ? {
            source: ucRel.source,
            target: ucRel.target,
            style: ucRel.style,
            sourceMarker: ucRel.sourceMarker,
            targetMarker: ucRel.targetMarker,
            label: ucRel.label,
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

  for (const rel of selfLoops) {
    const pos = base.positions.get(rel.source);
    const sz = sizes.get(rel.source);
    if (pos && sz) shapes.push(...drawLayeredSelfLoop(rel, pos, sz, EDGE_STYLE));
  }

  for (const node of ast.nodes) {
    const pos = base.positions.get(node.id);
    if (!pos) continue;
    shapes.push(...drawNode(node, pos, sizes.get(node.id)!));
  }

  return {
    width: totalWidth,
    height: totalHeight,
    background: '#fff',
    children: shapes,
  };
}

function childBoundingBox(
  ids: string[],
  positions: Map<string, Position>,
  sizes: Map<string, BoxSize>,
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let found = false;
  for (const id of ids) {
    const pos = positions.get(id);
    const sz = sizes.get(id);
    if (!pos || !sz) continue;
    found = true;
    if (pos.x < minX) minX = pos.x;
    if (pos.y < minY) minY = pos.y;
    if (pos.x + sz.w > maxX) maxX = pos.x + sz.w;
    if (pos.y + sz.h > maxY) maxY = pos.y + sz.h;
  }
  return found ? { minX, minY, maxX, maxY } : null;
}

interface BaseResult {
  positions: Map<string, Position>;
  width: number;
  height: number;
  drawable?: Array<{ fromId: string; toId: string; waypoints: string[]; rel: ClassRelationship }>;
  centers?: Map<string, NodeCenter>;
}

function gridLayout(ast: UseCaseAst, sizes: Map<string, BoxSize>, titleHeight: number): BaseResult {
  const positions = new Map<string, Position>();
  let cursorX = PAGE_PAD;
  let maxH = 0;
  for (const node of ast.nodes) {
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
  ast: UseCaseAst,
  sizes: Map<string, BoxSize>,
  titleHeight: number,
  rels: ClassRelationship[],
): BaseResult {
  const nodeIds = ast.nodes.map((n) => n.id);
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
  loops: UCRelationship[],
  positions: Map<string, Position>,
  sizes: Map<string, BoxSize>,
): number {
  let extra = 0;
  for (const r of loops) {
    const pos = positions.get(r.source);
    const sz = sizes.get(r.source);
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

function measureNode(node: UCNode): BoxSize {
  if (node.kind === 'actor') {
    const labelW = measureText(node.name, FONT_LABEL).width;
    return { w: Math.max(ACTOR_BOX_W, labelW + 8), h: ACTOR_BOX_H };
  }
  const labelW = measureText(node.name, FONT_LABEL).width;
  const labelH = measureText(node.name, FONT_LABEL).height;
  return {
    w: Math.max(UC_MIN_W, labelW + UC_PAD_X * 2),
    h: Math.max(UC_MIN_H, labelH + UC_PAD_Y * 2),
  };
}

function drawNode(node: UCNode, pos: Position, sz: BoxSize): Shape[] {
  if (node.kind === 'actor') return drawActor(node.name, pos, sz);
  return drawUsecase(node.name, pos, sz);
}

function drawActor(name: string, pos: Position, sz: BoxSize): Shape[] {
  const cx = pos.x + sz.w / 2;
  const figureTop = pos.y + 4;
  const stroke = { stroke: COLOR_LINE, strokeWidth: 1 };
  return [
    { type: 'circle', cx, cy: figureTop + 6, r: 6, style: { fill: COLOR_FILL_ACTOR, ...stroke } },
    { type: 'line', x1: cx, y1: figureTop + 12, x2: cx, y2: figureTop + 32, style: stroke },
    { type: 'line', x1: cx - 12, y1: figureTop + 20, x2: cx + 12, y2: figureTop + 20, style: stroke },
    { type: 'line', x1: cx, y1: figureTop + 32, x2: cx - 9, y2: figureTop + 44, style: stroke },
    { type: 'line', x1: cx, y1: figureTop + 32, x2: cx + 9, y2: figureTop + 44, style: stroke },
    {
      type: 'text',
      x: cx,
      y: pos.y + sz.h - 4,
      text: name,
      anchor: 'middle',
      baseline: 'alphabetic',
      font: { family: FONT_FAMILY, size: FONT_LABEL, color: '#000' },
    },
  ];
}

function drawUsecase(name: string, pos: Position, sz: BoxSize): Shape[] {
  const cx = pos.x + sz.w / 2;
  const cy = pos.y + sz.h / 2;
  return [
    {
      type: 'ellipse',
      cx,
      cy,
      rx: sz.w / 2,
      ry: sz.h / 2,
      style: { fill: COLOR_FILL_UC, stroke: COLOR_LINE, strokeWidth: 1 },
    },
    {
      type: 'text',
      x: cx,
      y: cy,
      text: name,
      anchor: 'middle',
      baseline: 'middle',
      font: { family: FONT_FAMILY, size: FONT_LABEL, color: '#000' },
    },
  ];
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
        text: '(empty use case diagram)',
        anchor: 'middle',
        baseline: 'middle',
        font: { family: FONT_FAMILY, size: 12, color: '#999' },
      },
    ],
  };
}
