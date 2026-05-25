import type {
  ContainerAst,
  ContainerNode,
  ContainerNodeKind,
  ContainerRelationship,
} from '../../ast/container.js';
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
import { layoutNested } from './nested.js';

function hasAnyChildren(nodes: ContainerNode[]): boolean {
  for (const n of nodes) {
    if (n.children.length > 0) return true;
    if (hasAnyChildren(n.children)) return true;
  }
  return false;
}

const PAGE_PAD = 16;
const TITLE_FONT = 16;
const TITLE_GAP = 8;
const LAYER_GAP = 60;
const HORIZONTAL_GAP = 30;
const DUMMY_GAP = 12;

const PAD_X = 14;
const PAD_Y = 8;
const MIN_W = 100;
const MIN_H = 38;

const STEREO_FONT = 11;
const STEREO_H = 16;
const NAME_FONT = 13;
const ATTR_FONT = 12;
const ATTR_LINE_H = 16;
const FOLDER_TAB_W = 36;
const FOLDER_TAB_H = 8;
const NODE_SHADOW = 6;
const INTERFACE_R = 9;
const INTERFACE_LABEL_GAP = 4;

const FONT_FAMILY = 'sans-serif';
const EDGE_LABEL_FONT = 11;

const COLOR_LINE = '#222';
const COLOR_EDGE = '#444';
const COLOR_FILL = '#fefece';
const COLOR_CLOUD_FILL = '#f4f6fb';
const COLOR_DATABASE_FILL = '#f4f6fb';
const COLOR_OBJECT_FILL = '#fefece';
const COLOR_INTERFACE_FILL = '#fff';

const EDGE_STYLE: EdgeStyle = {
  color: COLOR_EDGE,
  fontFamily: FONT_FAMILY,
  labelFontSize: EDGE_LABEL_FONT,
};

export function layoutContainer(ast: ContainerAst): Scene {
  if (ast.nodes.length === 0) return emptyScene(ast.kind);

  if (hasAnyChildren(ast.nodes)) {
    return layoutNested(ast);
  }

  const sizes = new Map(ast.nodes.map((n) => [n.id, measureNode(n)]));
  const titleHeight = ast.title ? TITLE_FONT + TITLE_GAP : 0;

  const asRel = (r: ContainerRelationship): ClassRelationship => ({
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
      ? gridLayout(ast, sizes, titleHeight)
      : layeredLayout(ast, sizes, titleHeight, nonLoops.map(asRel));

  const extraRight = selfLoopExtraWidth(selfLoops, base.positions, sizes);
  const titleW = ast.title ? measureText(ast.title, TITLE_FONT).width + PAGE_PAD * 2 : 0;
  const totalWidth = Math.max(base.width + extraRight, titleW);

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
      const original = ast.relationships.find(
        (r) => r.source === edge.rel.source && r.target === edge.rel.target,
      );
      const attrs: EdgeAttrs = original
        ? {
            source: original.source,
            target: original.target,
            style: original.style,
            sourceMarker: original.sourceMarker,
            targetMarker: original.targetMarker,
            label: original.label,
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

  for (const r of selfLoops) {
    const pos = base.positions.get(r.source);
    const sz = sizes.get(r.source);
    if (pos && sz) shapes.push(...drawLayeredSelfLoop(r, pos, sz, EDGE_STYLE));
  }

  for (const node of ast.nodes) {
    const pos = base.positions.get(node.id);
    if (!pos) continue;
    shapes.push(...drawNode(node, pos, sizes.get(node.id)!));
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

function gridLayout(ast: ContainerAst, sizes: Map<string, BoxSize>, titleHeight: number): BaseResult {
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
  ast: ContainerAst,
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
  loops: ContainerRelationship[],
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

function measureNode(node: ContainerNode): BoxSize {
  if (node.nodeKind === 'interface') {
    const labelW = measureText(node.name, NAME_FONT).width;
    return { w: Math.max(INTERFACE_R * 2, labelW), h: INTERFACE_R * 2 + INTERFACE_LABEL_GAP + NAME_FONT * 1.2 };
  }

  const stereotype = stereotypeFor(node.nodeKind);
  const stereoH = stereotype ? STEREO_H : 0;
  const nameW = measureText(node.name, NAME_FONT).width;
  const stereoW = stereotype ? measureText(stereotype, STEREO_FONT).width : 0;
  let attrsW = 0;
  for (const a of node.attributes) {
    attrsW = Math.max(attrsW, measureText(a, ATTR_FONT).width);
  }
  const contentW = Math.max(nameW, stereoW, attrsW);
  let w = Math.max(MIN_W, contentW + PAD_X * 2);
  let h = PAD_Y + stereoH + Math.ceil(NAME_FONT * 1.4) + PAD_Y;
  if (node.attributes.length > 0) {
    h += 1 + ATTR_LINE_H * node.attributes.length + PAD_Y;
  }
  if (node.nodeKind === 'folder') h += FOLDER_TAB_H;
  if (node.nodeKind === 'node') {
    w += NODE_SHADOW;
    h += NODE_SHADOW;
  }
  if (node.nodeKind === 'database') h += 6;
  return { w, h: Math.max(MIN_H, h) };
}

function stereotypeFor(k: ContainerNodeKind): string {
  switch (k) {
    case 'component': return '«component»';
    case 'node':      return '«node»';
    case 'cloud':     return '«cloud»';
    case 'database':  return '«database»';
    case 'folder':    return '«folder»';
    case 'frame':     return '«frame»';
    case 'artifact':  return '«artifact»';
    case 'storage':   return '«storage»';
    case 'queue':     return '«queue»';
    case 'rectangle': return '';
    case 'object':    return '';
    case 'interface': return '';
  }
}

function drawNode(node: ContainerNode, pos: Position, sz: BoxSize): Shape[] {
  switch (node.nodeKind) {
    case 'interface': return drawInterface(node.name, pos, sz);
    case 'node':      return drawDeploymentNode(node, pos, sz);
    case 'cloud':     return drawCloud(node, pos, sz);
    case 'database':  return drawDatabase(node, pos, sz);
    case 'folder':    return drawFolder(node, pos, sz);
    case 'frame':     return drawFrame(node, pos, sz);
    case 'rectangle': return drawRectangle(node, pos, sz);
    case 'object':    return drawObject(node, pos, sz);
    case 'component': return drawComponent(node, pos, sz);
    case 'artifact':  return drawArtifact(node, pos, sz);
    case 'storage':   return drawStorage(node, pos, sz);
    case 'queue':     return drawQueue(node, pos, sz);
  }
}

function drawArtifact(node: ContainerNode, pos: Position, sz: BoxSize): Shape[] {
  const fold = 10;
  return [
    {
      type: 'polygon',
      points: [
        [pos.x, pos.y],
        [pos.x + sz.w - fold, pos.y],
        [pos.x + sz.w, pos.y + fold],
        [pos.x + sz.w, pos.y + sz.h],
        [pos.x, pos.y + sz.h],
      ],
      style: { fill: COLOR_FILL, stroke: COLOR_LINE, strokeWidth: 1 },
    },
    {
      type: 'polyline',
      points: [
        [pos.x + sz.w - fold, pos.y],
        [pos.x + sz.w - fold, pos.y + fold],
        [pos.x + sz.w, pos.y + fold],
      ],
      style: { fill: 'none', stroke: COLOR_LINE, strokeWidth: 1 },
    },
    ...drawStereotypeAndName(node, pos, sz),
  ];
}

function drawStorage(node: ContainerNode, pos: Position, sz: BoxSize): Shape[] {
  return [
    {
      type: 'rect',
      x: pos.x, y: pos.y, w: sz.w, h: sz.h,
      rx: sz.h / 3, ry: sz.h / 3,
      style: { fill: COLOR_FILL, stroke: COLOR_LINE, strokeWidth: 1 },
    },
    ...drawStereotypeAndName(node, pos, sz),
  ];
}

function drawQueue(node: ContainerNode, pos: Position, sz: BoxSize): Shape[] {
  const rx = 10;
  const ry = sz.h / 2;
  const left = pos.x;
  const right = pos.x + sz.w;
  const top = pos.y;
  const bot = pos.y + sz.h;
  return [
    {
      type: 'path',
      d:
        `M ${left + rx} ${top} L ${right - rx} ${top} ` +
        `A ${rx} ${ry} 0 0 1 ${right - rx} ${bot} ` +
        `L ${left + rx} ${bot} ` +
        `A ${rx} ${ry} 0 0 1 ${left + rx} ${top} Z`,
      style: { fill: COLOR_FILL, stroke: COLOR_LINE, strokeWidth: 1 },
    },
    {
      type: 'path',
      d: `M ${left + rx} ${top} A ${rx} ${ry} 0 0 0 ${left + rx} ${bot}`,
      style: { fill: 'none', stroke: COLOR_LINE, strokeWidth: 1 },
    },
    ...drawStereotypeAndName(node, pos, sz),
  ];
}

function drawComponent(node: ContainerNode, pos: Position, sz: BoxSize): Shape[] {
  const shapes = drawBoxWithStereotype(node, pos, sz, COLOR_FILL);
  // Small port marks on left/right (decorative)
  const top = pos.y + sz.h * 0.18;
  const bot = pos.y + sz.h * 0.82;
  shapes.push(
    portRect(pos.x - 3, top),
    portRect(pos.x - 3, bot),
  );
  return shapes;
}

function portRect(x: number, y: number): Shape {
  return {
    type: 'rect',
    x, y: y - 4, w: 10, h: 8,
    style: { fill: COLOR_FILL, stroke: COLOR_LINE, strokeWidth: 1 },
  };
}

function drawInterface(name: string, pos: Position, sz: BoxSize): Shape[] {
  const cx = pos.x + sz.w / 2;
  const cy = pos.y + INTERFACE_R;
  return [
    {
      type: 'circle',
      cx, cy, r: INTERFACE_R,
      style: { fill: COLOR_INTERFACE_FILL, stroke: COLOR_LINE, strokeWidth: 1 },
    },
    {
      type: 'text',
      x: cx, y: pos.y + sz.h - 2,
      text: name, anchor: 'middle', baseline: 'alphabetic',
      font: { family: FONT_FAMILY, size: NAME_FONT, color: '#000' },
    },
  ];
}

function drawDeploymentNode(node: ContainerNode, pos: Position, sz: BoxSize): Shape[] {
  const innerW = sz.w - NODE_SHADOW;
  const innerH = sz.h - NODE_SHADOW;
  const back: Shape[] = [
    {
      type: 'polygon',
      points: [
        [pos.x + NODE_SHADOW, pos.y],
        [pos.x + sz.w, pos.y],
        [pos.x + sz.w, pos.y + innerH],
        [pos.x + sz.w - NODE_SHADOW, pos.y + sz.h],
        [pos.x + sz.w - NODE_SHADOW, pos.y + NODE_SHADOW],
        [pos.x + NODE_SHADOW, pos.y + NODE_SHADOW],
      ],
      style: { fill: '#e7e7d4', stroke: COLOR_LINE, strokeWidth: 1 },
    },
  ];
  const front = drawBoxWithStereotype(node, { x: pos.x, y: pos.y + NODE_SHADOW }, { w: innerW, h: innerH }, COLOR_FILL);
  return [...back, ...front];
}

function drawCloud(node: ContainerNode, pos: Position, sz: BoxSize): Shape[] {
  const cx = pos.x + sz.w / 2;
  const cy = pos.y + sz.h / 2;
  return [
    {
      type: 'ellipse',
      cx, cy, rx: sz.w / 2, ry: sz.h / 2,
      style: { fill: COLOR_CLOUD_FILL, stroke: COLOR_LINE, strokeWidth: 1 },
    },
    ...drawStereotypeAndName(node, pos, sz),
  ];
}

function drawDatabase(node: ContainerNode, pos: Position, sz: BoxSize): Shape[] {
  const left = pos.x + 4;
  const right = pos.x + sz.w - 4;
  const top = pos.y + 6;
  const bottom = pos.y + sz.h - 4;
  const rx = (right - left) / 2;
  const ry = 5;
  const midX = (left + right) / 2;
  return [
    {
      type: 'path',
      d: `M ${left} ${top} L ${left} ${bottom} A ${rx} ${ry} 0 0 0 ${right} ${bottom} L ${right} ${top}`,
      style: { fill: COLOR_DATABASE_FILL, stroke: COLOR_LINE, strokeWidth: 1 },
    },
    {
      type: 'ellipse',
      cx: midX, cy: top, rx, ry,
      style: { fill: COLOR_DATABASE_FILL, stroke: COLOR_LINE, strokeWidth: 1 },
    },
    ...drawStereotypeAndName(node, { x: pos.x, y: pos.y + 8 }, { w: sz.w, h: sz.h - 8 }),
  ];
}

function drawFolder(node: ContainerNode, pos: Position, sz: BoxSize): Shape[] {
  const bodyY = pos.y + FOLDER_TAB_H;
  const bodyH = sz.h - FOLDER_TAB_H;
  return [
    {
      type: 'polygon',
      points: [
        [pos.x, pos.y],
        [pos.x + FOLDER_TAB_W, pos.y],
        [pos.x + FOLDER_TAB_W + 6, pos.y + FOLDER_TAB_H],
        [pos.x + sz.w, pos.y + FOLDER_TAB_H],
        [pos.x + sz.w, pos.y + sz.h],
        [pos.x, pos.y + sz.h],
      ],
      style: { fill: COLOR_FILL, stroke: COLOR_LINE, strokeWidth: 1 },
    },
    ...drawStereotypeAndName(node, { x: pos.x, y: bodyY }, { w: sz.w, h: bodyH }),
  ];
}

function drawFrame(node: ContainerNode, pos: Position, sz: BoxSize): Shape[] {
  return drawBoxWithStereotype(node, pos, sz, COLOR_FILL);
}

function drawRectangle(node: ContainerNode, pos: Position, sz: BoxSize): Shape[] {
  return [
    {
      type: 'rect',
      x: pos.x, y: pos.y, w: sz.w, h: sz.h,
      style: { fill: COLOR_FILL, stroke: COLOR_LINE, strokeWidth: 1 },
    },
    ...drawStereotypeAndName(node, pos, sz),
  ];
}

function drawObject(node: ContainerNode, pos: Position, sz: BoxSize): Shape[] {
  const shapes: Shape[] = [
    {
      type: 'rect',
      x: pos.x, y: pos.y, w: sz.w, h: sz.h,
      style: { fill: COLOR_OBJECT_FILL, stroke: COLOR_LINE, strokeWidth: 1 },
    },
    {
      type: 'text',
      x: pos.x + sz.w / 2,
      y: pos.y + PAD_Y + NAME_FONT * 0.9,
      text: node.name,
      anchor: 'middle',
      baseline: 'alphabetic',
      font: { family: FONT_FAMILY, size: NAME_FONT, weight: 'bold', color: '#000' },
    },
  ];
  // Underline
  const labelW = measureText(node.name, NAME_FONT).width;
  const labelCx = pos.x + sz.w / 2;
  shapes.push({
    type: 'line',
    x1: labelCx - labelW / 2,
    y1: pos.y + PAD_Y + NAME_FONT * 1.1,
    x2: labelCx + labelW / 2,
    y2: pos.y + PAD_Y + NAME_FONT * 1.1,
    style: { stroke: '#000', strokeWidth: 1 },
  });
  if (node.attributes.length > 0) {
    const sepY = pos.y + PAD_Y + Math.ceil(NAME_FONT * 1.4) + PAD_Y;
    shapes.push({
      type: 'line',
      x1: pos.x, y1: sepY, x2: pos.x + sz.w, y2: sepY,
      style: { stroke: COLOR_LINE, strokeWidth: 1 },
    });
    let y = sepY + ATTR_LINE_H - 4;
    for (const a of node.attributes) {
      shapes.push({
        type: 'text',
        x: pos.x + PAD_X, y,
        text: a,
        anchor: 'start',
        baseline: 'alphabetic',
        font: { family: FONT_FAMILY, size: ATTR_FONT, color: '#000' },
      });
      y += ATTR_LINE_H;
    }
  }
  return shapes;
}

function drawBoxWithStereotype(
  node: ContainerNode,
  pos: Position,
  sz: BoxSize,
  fill: string,
): Shape[] {
  return [
    {
      type: 'rect',
      x: pos.x, y: pos.y, w: sz.w, h: sz.h,
      style: { fill, stroke: COLOR_LINE, strokeWidth: 1 },
    },
    ...drawStereotypeAndName(node, pos, sz),
  ];
}

function drawStereotypeAndName(node: ContainerNode, pos: Position, sz: BoxSize): Shape[] {
  const stereotype = stereotypeFor(node.nodeKind);
  const cx = pos.x + sz.w / 2;
  const result: Shape[] = [];
  let textY = pos.y + PAD_Y;
  if (stereotype) {
    textY += STEREO_FONT * 0.9;
    result.push({
      type: 'text',
      x: cx, y: textY,
      text: stereotype, anchor: 'middle', baseline: 'alphabetic',
      font: { family: FONT_FAMILY, size: STEREO_FONT, color: '#000' },
    });
    textY += Math.ceil(STEREO_FONT * 0.6);
  }
  result.push({
    type: 'text',
    x: cx, y: textY + NAME_FONT * 1.1,
    text: node.name, anchor: 'middle', baseline: 'alphabetic',
    font: { family: FONT_FAMILY, size: NAME_FONT, weight: 'bold', color: '#000' },
  });
  return result;
}

function emptyScene(kind: ContainerAst['kind']): Scene {
  return {
    width: 240,
    height: 60,
    background: '#fff',
    children: [
      {
        type: 'text',
        x: 120,
        y: 30,
        text: `(empty ${kind} diagram)`,
        anchor: 'middle',
        baseline: 'middle',
        font: { family: FONT_FAMILY, size: 12, color: '#999' },
      },
    ],
  };
}
