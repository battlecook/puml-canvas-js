import type {
  ContainerAst,
  ContainerNode,
  ContainerNodeKind,
  ContainerRelationship,
} from '../../ast/container.js';
import type { LabelBlock } from '../../ast/usecase.js';
import type { ClassRelationship } from '../../ast/class.js';
import type { Scene, Shape, Style } from '../../scene/types.js';
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
import {
  parseLabelMarkup,
  drawLabelSpans,
  measureSpansWidth,
} from '../sequence/markup.js';

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
const FOOTER_FONT = 12;
const FOOTER_LINE_H = 16;
const FOOTER_GAP = 12;
const COLOR_FOOTER = '#888';

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

  // `footer <text>` directive — bottom-center, supports Creole markup.
  const footerLines = ast.footer ? ast.footer.split('\n') : [];
  let footerW = 0;
  if (footerLines.length > 0) {
    for (const line of footerLines) {
      const w = measureSpansWidth(parseLabelMarkup(line), FOOTER_FONT);
      if (w > footerW) footerW = w;
    }
  }
  const finalWidth = Math.max(totalWidth, footerW + PAGE_PAD * 2);
  const footerH = footerLines.length > 0
    ? FOOTER_GAP + footerLines.length * FOOTER_LINE_H
    : 0;
  if (footerLines.length > 0) {
    let fy = base.height + FOOTER_GAP + FOOTER_FONT;
    for (const line of footerLines) {
      shapes.push(
        ...drawLabelSpans(
          parseLabelMarkup(line),
          finalWidth / 2,
          fy,
          'middle',
          'alphabetic',
          FOOTER_FONT,
        ).map((s) => recolor(s, COLOR_FOOTER)),
      );
      fy += FOOTER_LINE_H;
    }
  }

  return {
    width: finalWidth,
    height: base.height + footerH,
    background: '#fff',
    children: shapes,
  };
}

// Replace the text/line color of a shape produced by `drawLabelSpans`. Used to
// tint the footer in muted gray while preserving Creole markup formatting
// (bold/italic/underline/strike spans the helper inserted).
function recolor(shape: Shape, color: string): Shape {
  if (shape.type === 'text') {
    return { ...shape, font: { ...shape.font, color } };
  }
  if (shape.type === 'line') {
    return { ...shape, style: { ...shape.style, stroke: color } };
  }
  return shape;
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

// Inner padding / spacing constants for `labelBlocks` rendering. Match the
// usecase variant's visual rhythm so the two diagrams look the same when a
// container box and a usecase node both use this feature.
const BLOCK_PAD_X = 12;
const BLOCK_PAD_Y = 8;
const BLOCK_SEP_H = 8;
const BLOCK_LINE_H = NAME_FONT * 1.25;
const BLOCK_MIN_W = 100;

function measureLabelBlocks(blocks: LabelBlock[]): BoxSize {
  let maxW = 0;
  let totalH = 0;
  for (const b of blocks) {
    if (b.kind === 'text') {
      for (const ln of b.text.split('\n')) {
        const w = measureText(ln, NAME_FONT).width;
        if (w > maxW) maxW = w;
        totalH += BLOCK_LINE_H;
      }
    } else if (b.kind === 'sep-titled') {
      const w = measureText(b.text, NAME_FONT).width;
      if (w > maxW) maxW = w;
      totalH += BLOCK_SEP_H + BLOCK_LINE_H;
    } else {
      totalH += BLOCK_SEP_H;
    }
  }
  return {
    w: Math.max(BLOCK_MIN_W, maxW + BLOCK_PAD_X * 2),
    h: totalH + BLOCK_PAD_Y * 2,
  };
}

function measureNode(node: ContainerNode): BoxSize {
  if (node.nodeKind === 'map') return measureMap(node);
  if (node.labelBlocks && node.labelBlocks.length > 0) {
    const inner = measureLabelBlocks(node.labelBlocks);
    let w = inner.w;
    let h = inner.h;
    if (node.nodeKind === 'folder') h += FOLDER_TAB_H;
    if (node.nodeKind === 'node') { w += NODE_SHADOW; h += NODE_SHADOW; }
    if (node.nodeKind === 'database') h += 14;
    return { w: Math.max(MIN_W, w), h: Math.max(MIN_H, h) };
  }
  if (node.nodeKind === 'interface') {
    const lines = node.name.split('\n');
    let labelW = 0;
    for (const ln of lines) {
      const w = measureText(ln, NAME_FONT).width;
      if (w > labelW) labelW = w;
    }
    return {
      w: Math.max(INTERFACE_R * 2, labelW),
      h: INTERFACE_R * 2 + INTERFACE_LABEL_GAP + NAME_FONT * 1.2 * lines.length,
    };
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
  if (node.nodeKind === 'folder' || node.nodeKind === 'package') h += FOLDER_TAB_H;
  if (node.nodeKind === 'node') {
    w += NODE_SHADOW;
    h += NODE_SHADOW;
  }
  if (node.nodeKind === 'database') h += 6;
  if (node.nodeKind === 'hexagon') w += 24; // accommodate side wings
  if (node.nodeKind === 'stack') h += 12; // accommodate stack slivers
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
    case 'card':      return '«card»';
    case 'package':   return '';
    case 'agent':     return '';
    case 'action':    return '';
    case 'process':   return '';
    case 'hexagon':   return '';
    case 'stack':     return '';
    case 'usecase':   return '';
    case 'rectangle': return '';
    case 'object':    return '';
    case 'map':       return '';
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
    case 'map':       return drawMap(node, pos, sz);
    case 'component': return drawComponent(node, pos, sz);
    case 'artifact':  return drawArtifact(node, pos, sz);
    case 'storage':   return drawStorage(node, pos, sz);
    case 'queue':     return drawQueue(node, pos, sz);
    case 'card':      return drawCard(node, pos, sz);
    case 'usecase':   return drawUsecase(node, pos, sz);
    // PlantUML's 17 deployment/component shape keywords. The visuals follow
    // the official PlantUML icons:
    //   - action / process : rounded pill (action is identical to "process"
    //     visually but kept as a distinct kind for source round-tripping).
    //   - agent            : plain rectangle (agent's official icon is a
    //     thin-bordered rect).
    //   - hexagon          : six-sided polygon.
    //   - stack            : three stacked rectangles.
    //   - package          : rectangle with a small folder-style tab.
    case 'action':    return drawAction(node, pos, sz);
    case 'agent':     return drawAgent(node, pos, sz);
    case 'hexagon':   return drawHexagon(node, pos, sz);
    case 'process':   return drawAction(node, pos, sz);
    case 'stack':     return drawStack(node, pos, sz);
    case 'package':   return drawPackage(node, pos, sz);
  }
}

/**
 * Draws a node's container frame (rectangle, rounded rect, folder tab, node
 * shadow, or database cylinder) and stacks `labelBlocks` text rows / separator
 * lines inside the inner content area. Used by every container kind whose
 * declaration carries a `[ multi-line ... ]` payload.
 */
type FrameKind =
  | { kind: 'rect' }
  | { kind: 'rounded'; rx: number }
  | { kind: 'folder' }
  | { kind: 'node' }
  | { kind: 'database' };

function drawShapeWithLabelBlocks(
  node: ContainerNode,
  pos: Position,
  sz: BoxSize,
  fill: string,
  frame: FrameKind,
): Shape[] {
  const shapes: Shape[] = [];
  let innerPos = pos;
  let innerSz = sz;
  if (frame.kind === 'folder') {
    shapes.push({
      type: 'polygon',
      points: [
        [pos.x, pos.y],
        [pos.x + FOLDER_TAB_W, pos.y],
        [pos.x + FOLDER_TAB_W + 6, pos.y + FOLDER_TAB_H],
        [pos.x + sz.w, pos.y + FOLDER_TAB_H],
        [pos.x + sz.w, pos.y + sz.h],
        [pos.x, pos.y + sz.h],
      ],
      style: { fill, stroke: COLOR_LINE, strokeWidth: 1 },
    });
    innerPos = { x: pos.x, y: pos.y + FOLDER_TAB_H };
    innerSz = { w: sz.w, h: sz.h - FOLDER_TAB_H };
  } else if (frame.kind === 'node') {
    const innerW = sz.w - NODE_SHADOW;
    const innerH = sz.h - NODE_SHADOW;
    shapes.push({
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
    });
    shapes.push({
      type: 'rect',
      x: pos.x, y: pos.y + NODE_SHADOW, w: innerW, h: innerH,
      style: { fill, stroke: COLOR_LINE, strokeWidth: 1 },
    });
    innerPos = { x: pos.x, y: pos.y + NODE_SHADOW };
    innerSz = { w: innerW, h: innerH };
  } else if (frame.kind === 'database') {
    const left = pos.x + 4;
    const right = pos.x + sz.w - 4;
    const top = pos.y + 6;
    const bottom = pos.y + sz.h - 4;
    const rx = (right - left) / 2;
    const ry = 5;
    const midX = (left + right) / 2;
    shapes.push({
      type: 'path',
      d: `M ${left} ${top} L ${left} ${bottom} A ${rx} ${ry} 0 0 0 ${right} ${bottom} L ${right} ${top}`,
      style: { fill, stroke: COLOR_LINE, strokeWidth: 1 },
    });
    shapes.push({
      type: 'ellipse',
      cx: midX, cy: top, rx, ry,
      style: { fill, stroke: COLOR_LINE, strokeWidth: 1 },
    });
    innerPos = { x: pos.x, y: pos.y + 14 };
    innerSz = { w: sz.w, h: sz.h - 14 };
  } else if (frame.kind === 'rounded') {
    shapes.push({
      type: 'rect',
      x: pos.x, y: pos.y, w: sz.w, h: sz.h,
      rx: frame.rx, ry: frame.rx,
      style: { fill, stroke: COLOR_LINE, strokeWidth: 1 },
    });
  } else {
    shapes.push({
      type: 'rect',
      x: pos.x, y: pos.y, w: sz.w, h: sz.h,
      style: { fill, stroke: COLOR_LINE, strokeWidth: 1 },
    });
  }
  shapes.push(...drawLabelBlocks(node.labelBlocks!, innerPos, innerSz));
  return shapes;
}

/**
 * Stack text rows and horizontal separators (`----` solid, `====` double,
 * `....` dotted, `..title..` titled) inside the given content area. The
 * usecase-diagram variant lives in `layout/usecase/index.ts`; this is the
 * container-diagram equivalent (smaller padding, font matches container).
 */
function drawLabelBlocks(blocks: LabelBlock[], pos: Position, sz: BoxSize): Shape[] {
  const shapes: Shape[] = [];
  const cx = pos.x + sz.w / 2;
  const innerLeft = pos.x + BLOCK_PAD_X / 2;
  const innerRight = pos.x + sz.w - BLOCK_PAD_X / 2;
  let y = pos.y + BLOCK_PAD_Y;
  for (const b of blocks) {
    if (b.kind === 'text') {
      for (const ln of b.text.split('\n')) {
        shapes.push({
          type: 'text',
          x: cx,
          y: y + BLOCK_LINE_H * 0.8,
          text: ln,
          anchor: 'middle',
          baseline: 'alphabetic',
          font: { family: FONT_FAMILY, size: NAME_FONT, color: '#000' },
        });
        y += BLOCK_LINE_H;
      }
    } else if (b.kind === 'sep-solid') {
      const yLine = y + BLOCK_SEP_H / 2;
      shapes.push({
        type: 'line',
        x1: innerLeft, y1: yLine, x2: innerRight, y2: yLine,
        style: { stroke: COLOR_LINE, strokeWidth: 1 },
      });
      y += BLOCK_SEP_H;
    } else if (b.kind === 'sep-double') {
      const yLine = y + BLOCK_SEP_H / 2;
      shapes.push({
        type: 'line',
        x1: innerLeft, y1: yLine, x2: innerRight, y2: yLine,
        style: { stroke: COLOR_LINE, strokeWidth: 2 },
      });
      y += BLOCK_SEP_H;
    } else if (b.kind === 'sep-dotted') {
      const yLine = y + BLOCK_SEP_H / 2;
      shapes.push({
        type: 'line',
        x1: innerLeft, y1: yLine, x2: innerRight, y2: yLine,
        style: { stroke: COLOR_LINE, strokeWidth: 1, strokeDasharray: '2,3' },
      });
      y += BLOCK_SEP_H;
    } else if (b.kind === 'sep-titled') {
      const yLine = y + BLOCK_SEP_H / 2;
      shapes.push({
        type: 'line',
        x1: innerLeft, y1: yLine, x2: innerRight, y2: yLine,
        style: { stroke: COLOR_LINE, strokeWidth: 1, strokeDasharray: '2,3' },
      });
      shapes.push({
        type: 'text',
        x: cx, y: yLine - 2,
        text: b.text,
        anchor: 'middle', baseline: 'alphabetic',
        font: { family: FONT_FAMILY, size: NAME_FONT, color: '#000' },
      });
      y += BLOCK_SEP_H + BLOCK_LINE_H;
    }
  }
  return shapes;
}

function drawArtifact(node: ContainerNode, pos: Position, sz: BoxSize): Shape[] {
  const fold = 10;
  const style = bodyStyle(node, COLOR_FILL);
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
      style,
    },
    {
      type: 'polyline',
      points: [
        [pos.x + sz.w - fold, pos.y],
        [pos.x + sz.w - fold, pos.y + fold],
        [pos.x + sz.w, pos.y + fold],
      ],
      style: { fill: 'none', stroke: style.stroke ?? COLOR_LINE, strokeWidth: 1 },
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
      style: bodyStyle(node, COLOR_FILL),
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
  const style = bodyStyle(node, COLOR_FILL);
  return [
    {
      type: 'path',
      d:
        `M ${left + rx} ${top} L ${right - rx} ${top} ` +
        `A ${rx} ${ry} 0 0 1 ${right - rx} ${bot} ` +
        `L ${left + rx} ${bot} ` +
        `A ${rx} ${ry} 0 0 1 ${left + rx} ${top} Z`,
      style,
    },
    {
      type: 'path',
      d: `M ${left + rx} ${top} A ${rx} ${ry} 0 0 0 ${left + rx} ${bot}`,
      style: { fill: 'none', stroke: style.stroke ?? COLOR_LINE, strokeWidth: 1 },
    },
    ...drawStereotypeAndName(node, pos, sz),
  ];
}

function drawComponent(node: ContainerNode, pos: Position, sz: BoxSize): Shape[] {
  const fill = node.fill ?? (node.color ? resolveColor(node.color) : COLOR_FILL);
  const shapes = node.labelBlocks && node.labelBlocks.length > 0
    ? drawShapeWithLabelBlocks(node, pos, sz, fill, { kind: 'rect' })
    : drawBoxWithStereotype(node, pos, sz, fill);
  // Small port marks on left/right (decorative)
  const top = pos.y + sz.h * 0.18;
  const bot = pos.y + sz.h * 0.82;
  shapes.push(
    portRect(pos.x - 3, top, fill),
    portRect(pos.x - 3, bot, fill),
  );
  return shapes;
}

// `card` — rounded rectangle. Matches PlantUML's card shape.
function drawCard(node: ContainerNode, pos: Position, sz: BoxSize): Shape[] {
  const style = bodyStyle(node, COLOR_FILL);
  const rx = 10;
  if (node.labelBlocks && node.labelBlocks.length > 0) {
    return drawShapeWithLabelBlocks(node, pos, sz, style.fill ?? COLOR_FILL, { kind: 'rounded', rx });
  }
  return [
    {
      type: 'rect',
      x: pos.x, y: pos.y, w: sz.w, h: sz.h,
      rx, ry: rx,
      style,
    },
    ...drawStereotypeAndName(node, pos, sz),
  ];
}

// `usecase` keyword used inside a component/deployment diagram — render as a
// rounded rectangle (stadium-ish) since the routed parser is component, not
// the usecase parser proper. Honors `labelBlocks` for multi-line content.
function drawUsecase(node: ContainerNode, pos: Position, sz: BoxSize): Shape[] {
  const style = bodyStyle(node, COLOR_FILL);
  const rx = Math.min(sz.h / 2, 18);
  if (node.labelBlocks && node.labelBlocks.length > 0) {
    return drawShapeWithLabelBlocks(node, pos, sz, style.fill ?? COLOR_FILL, { kind: 'rounded', rx });
  }
  return [
    {
      type: 'rect',
      x: pos.x, y: pos.y, w: sz.w, h: sz.h,
      rx, ry: rx,
      style,
    },
    ...drawStereotypeAndName(node, pos, sz),
  ];
}

/**
 * Resolve a `#Color` token from the source (named CSS color like `Yellow` or
 * a hex string like `#FF0000`) to a string the renderer's fill accepts. Named
 * colors pass through as-is (the SVG renderer accepts them via standard CSS
 * color names). Hex tokens are normalized to a leading `#`.
 */
function resolveColor(token: string): string {
  if (token.startsWith('#')) return token;
  // PlantUML allows bare hex without a leading `#` (`#FFAA00`). Detect 3/4/6/8
  // hex digits and prefix `#`; otherwise treat as a named color verbatim.
  if (/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{4}$|^[0-9a-fA-F]{6}$|^[0-9a-fA-F]{8}$/.test(token)) {
    return `#${token}`;
  }
  return token;
}

function portRect(x: number, y: number, fill: string = COLOR_FILL): Shape {
  return {
    type: 'rect',
    x, y: y - 4, w: 10, h: 8,
    style: { fill, stroke: COLOR_LINE, strokeWidth: 1 },
  };
}

function drawInterface(name: string, pos: Position, sz: BoxSize): Shape[] {
  const cx = pos.x + sz.w / 2;
  const cy = pos.y + INTERFACE_R;
  const shapes: Shape[] = [
    {
      type: 'circle',
      cx, cy, r: INTERFACE_R,
      style: { fill: COLOR_INTERFACE_FILL, stroke: COLOR_LINE, strokeWidth: 1 },
    },
  ];
  // Render each `\n`-separated row of the display name as its own text line so
  // multi-line labels like `Last\ninterface` lay out across two rows.
  const lines = name.split('\n');
  const lineH = NAME_FONT * 1.2;
  // Bottom-anchor the last line at `pos.y + sz.h - 2` to preserve single-line
  // pixel positions for back-compat with goldens.
  const lastBaseline = pos.y + sz.h - 2;
  for (let i = 0; i < lines.length; i++) {
    const baseline = lastBaseline - (lines.length - 1 - i) * lineH;
    shapes.push({
      type: 'text',
      x: cx, y: baseline,
      text: lines[i]!, anchor: 'middle', baseline: 'alphabetic',
      font: { family: FONT_FAMILY, size: NAME_FONT, color: '#000' },
    });
  }
  return shapes;
}

function drawDeploymentNode(node: ContainerNode, pos: Position, sz: BoxSize): Shape[] {
  const fill = node.fill ?? (node.color ? resolveColor(node.color) : COLOR_FILL);
  if (node.labelBlocks && node.labelBlocks.length > 0) {
    return drawShapeWithLabelBlocks(node, pos, sz, fill, { kind: 'node' });
  }
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
  const front = drawBoxWithStereotype(node, { x: pos.x, y: pos.y + NODE_SHADOW }, { w: innerW, h: innerH }, fill);
  return [...back, ...front];
}

function drawCloud(node: ContainerNode, pos: Position, sz: BoxSize): Shape[] {
  const cx = pos.x + sz.w / 2;
  const cy = pos.y + sz.h / 2;
  return [
    {
      type: 'ellipse',
      cx, cy, rx: sz.w / 2, ry: sz.h / 2,
      style: bodyStyle(node, COLOR_CLOUD_FILL),
    },
    ...drawStereotypeAndName(node, pos, sz),
  ];
}

function drawDatabase(node: ContainerNode, pos: Position, sz: BoxSize): Shape[] {
  const fill = node.fill ?? (node.color ? resolveColor(node.color) : COLOR_DATABASE_FILL);
  if (node.labelBlocks && node.labelBlocks.length > 0) {
    return drawShapeWithLabelBlocks(node, pos, sz, fill, { kind: 'database' });
  }
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
  const style = bodyStyle(node, COLOR_FILL);
  if (node.labelBlocks && node.labelBlocks.length > 0) {
    return drawShapeWithLabelBlocks(node, pos, sz, style.fill ?? COLOR_FILL, { kind: 'folder' });
  }
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
      style,
    },
    ...drawStereotypeAndName(node, { x: pos.x, y: bodyY }, { w: sz.w, h: bodyH }),
  ];
}

function drawFrame(node: ContainerNode, pos: Position, sz: BoxSize): Shape[] {
  const fill = node.fill ?? (node.color ? resolveColor(node.color) : COLOR_FILL);
  if (node.labelBlocks && node.labelBlocks.length > 0) {
    return drawShapeWithLabelBlocks(node, pos, sz, fill, { kind: 'rect' });
  }
  return drawBoxWithStereotype(node, pos, sz, fill);
}

function drawRectangle(node: ContainerNode, pos: Position, sz: BoxSize): Shape[] {
  const style = bodyStyle(node, COLOR_FILL);
  if (node.labelBlocks && node.labelBlocks.length > 0) {
    return drawShapeWithLabelBlocks(node, pos, sz, style.fill ?? COLOR_FILL, { kind: 'rect' });
  }
  return [
    {
      type: 'rect',
      x: pos.x, y: pos.y, w: sz.w, h: sz.h,
      style,
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

// `map Name { … }` — header bar plus two-column key/value table. Display name
// supports Creole markup via `parseLabelMarkup` so `**bold**` in the header
// renders correctly. Column widths derive from the widest key / widest value.
const MAP_HEADER_FONT = 13;
const MAP_CELL_FONT = 12;
const MAP_HEADER_H = MAP_HEADER_FONT + PAD_Y * 2;
const MAP_ROW_H = MAP_CELL_FONT + PAD_Y * 2;
const MAP_CELL_PAD_X = 8;
const MAP_MIN_COL_W = 50;

interface MapMetrics {
  headerW: number;
  keyW: number;
  valueW: number;
}

function mapMetrics(node: ContainerNode): MapMetrics {
  const entries = node.mapEntries ?? [];
  let keyW = 0;
  let valueW = 0;
  for (const e of entries) {
    keyW = Math.max(keyW, measureText(e.key, MAP_CELL_FONT).width);
    valueW = Math.max(valueW, measureText(e.value, MAP_CELL_FONT).width);
  }
  const headerW = measureSpansWidth(parseLabelMarkup(node.name), MAP_HEADER_FONT);
  return {
    headerW,
    keyW: Math.max(MAP_MIN_COL_W, keyW),
    valueW: Math.max(MAP_MIN_COL_W, valueW),
  };
}

function measureMap(node: ContainerNode): BoxSize {
  const m = mapMetrics(node);
  const columnsW = m.keyW + m.valueW + MAP_CELL_PAD_X * 4;
  const w = Math.max(columnsW, m.headerW + PAD_X * 2);
  const rows = (node.mapEntries ?? []).length;
  const h = MAP_HEADER_H + rows * MAP_ROW_H;
  return { w, h };
}

function drawMap(node: ContainerNode, pos: Position, sz: BoxSize): Shape[] {
  const shapes: Shape[] = [];
  // Outer frame.
  shapes.push({
    type: 'rect',
    x: pos.x, y: pos.y, w: sz.w, h: sz.h,
    style: { fill: COLOR_OBJECT_FILL, stroke: COLOR_LINE, strokeWidth: 1 },
  });
  // Header separator beneath the title bar.
  const headerBottom = pos.y + MAP_HEADER_H;
  shapes.push({
    type: 'line',
    x1: pos.x, y1: headerBottom, x2: pos.x + sz.w, y2: headerBottom,
    style: { stroke: COLOR_LINE, strokeWidth: 1 },
  });
  // Header label — uses the Creole markup parser so `**bold**`, `//italic//`
  // etc. inside the quoted display name render with the right styling.
  const headerCx = pos.x + sz.w / 2;
  const headerBaseline = pos.y + PAD_Y + MAP_HEADER_FONT * 0.9;
  shapes.push(
    ...drawLabelSpans(
      parseLabelMarkup(node.name),
      headerCx,
      headerBaseline,
      'middle',
      'alphabetic',
      MAP_HEADER_FONT,
    ),
  );

  const entries = node.mapEntries ?? [];
  if (entries.length === 0) return shapes;

  // Vertical separator between the key column and the value column. Split the
  // remaining width proportionally to the widest key vs widest value cell so
  // narrow keys don't waste space.
  const m = mapMetrics(node);
  const totalCells = m.keyW + m.valueW;
  const keyColW = totalCells > 0 ? (m.keyW / totalCells) * sz.w : sz.w / 2;
  const dividerX = pos.x + keyColW;
  shapes.push({
    type: 'line',
    x1: dividerX, y1: headerBottom, x2: dividerX, y2: pos.y + sz.h,
    style: { stroke: COLOR_LINE, strokeWidth: 1 },
  });

  // Rows + per-row baseline. Skip the trailing separator so the bottom edge of
  // the outer frame doubles as the last row's bottom line.
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]!;
    const rowTop = headerBottom + i * MAP_ROW_H;
    if (i > 0) {
      shapes.push({
        type: 'line',
        x1: pos.x, y1: rowTop, x2: pos.x + sz.w, y2: rowTop,
        style: { stroke: COLOR_LINE, strokeWidth: 1 },
      });
    }
    const baseline = rowTop + PAD_Y + MAP_CELL_FONT * 0.9;
    shapes.push({
      type: 'text',
      x: pos.x + MAP_CELL_PAD_X,
      y: baseline,
      text: e.key,
      anchor: 'start',
      baseline: 'alphabetic',
      font: { family: FONT_FAMILY, size: MAP_CELL_FONT, color: '#000' },
    });
    shapes.push({
      type: 'text',
      x: dividerX + MAP_CELL_PAD_X,
      y: baseline,
      text: e.value,
      anchor: 'start',
      baseline: 'alphabetic',
      font: { family: FONT_FAMILY, size: MAP_CELL_FONT, color: '#000' },
    });
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
      style: bodyStyle(node, fill),
    },
    ...drawStereotypeAndName(node, pos, sz),
  ];
}

function drawStereotypeAndName(node: ContainerNode, pos: Position, sz: BoxSize): Shape[] {
  const stereotype = stereotypeFor(node.nodeKind);
  const cx = pos.x + sz.w / 2;
  const textColor = node.textColor ?? '#000';
  const result: Shape[] = [];
  let textY = pos.y + PAD_Y;
  if (stereotype) {
    textY += STEREO_FONT * 0.9;
    result.push({
      type: 'text',
      x: cx, y: textY,
      text: stereotype, anchor: 'middle', baseline: 'alphabetic',
      font: { family: FONT_FAMILY, size: STEREO_FONT, color: textColor },
    });
    textY += Math.ceil(STEREO_FONT * 0.6);
  }
  result.push({
    type: 'text',
    x: cx, y: textY + NAME_FONT * 1.1,
    text: node.name, anchor: 'middle', baseline: 'alphabetic',
    font: { family: FONT_FAMILY, size: NAME_FONT, weight: 'bold', color: textColor },
  });
  return result;
}

/**
 * Compute the SVG style for a node body, layering the inline-style overrides
 * (`fill`, `lineColor`, `lineStyle`) on top of the kind's default. Used by
 * every shape draw function so styling applies uniformly.
 */
function bodyStyle(node: ContainerNode, defaultFill: string): Style {
  const fill = node.fill ?? (node.color ? resolveColor(node.color) : defaultFill);
  const stroke = node.lineColor ?? COLOR_LINE;
  const style: Style = { fill, stroke, strokeWidth: 1 };
  if (node.lineStyle === 'bold') style.strokeWidth = 2;
  else if (node.lineStyle === 'dashed') style.strokeDasharray = '4,2';
  else if (node.lineStyle === 'dotted') style.strokeDasharray = '2,3';
  return style;
}

// ─── PlantUML shape draws (action / agent / hexagon / process / stack /
// package). Each respects the inline `bodyStyle` so colours, line widths and
// dashed/dotted patterns from the source declaration flow through.

// `action` and `process` — rounded pill (a rectangle with corner radius equal
// to half the height). Both use the same drawer; the kind is preserved on the
// node so future per-kind stereotypes can be added.
function drawAction(node: ContainerNode, pos: Position, sz: BoxSize): Shape[] {
  const rx = Math.min(sz.h / 2, 18);
  return [
    {
      type: 'rect',
      x: pos.x, y: pos.y, w: sz.w, h: sz.h,
      rx, ry: rx,
      style: bodyStyle(node, COLOR_FILL),
    },
    ...drawStereotypeAndName(node, pos, sz),
  ];
}

// `agent` — plain rectangle (thin border per PlantUML's icon). Visually
// distinct from `rectangle` only by the absence of the `«rectangle»` stereotype
// (which we already suppress).
function drawAgent(node: ContainerNode, pos: Position, sz: BoxSize): Shape[] {
  return [
    {
      type: 'rect',
      x: pos.x, y: pos.y, w: sz.w, h: sz.h,
      style: bodyStyle(node, COLOR_FILL),
    },
    ...drawStereotypeAndName(node, pos, sz),
  ];
}

// `hexagon` — six-sided polygon. Sides extend horizontally with the two
// "wing" vertices outside the bounding box's left and right edges; we inset by
// `wing` so the shape's visual extent matches the measured size.
function drawHexagon(node: ContainerNode, pos: Position, sz: BoxSize): Shape[] {
  const wing = Math.min(sz.h * 0.4, 16);
  const x = pos.x;
  const y = pos.y;
  const w = sz.w;
  const h = sz.h;
  return [
    {
      type: 'polygon',
      points: [
        [x + wing, y],
        [x + w - wing, y],
        [x + w, y + h / 2],
        [x + w - wing, y + h],
        [x + wing, y + h],
        [x, y + h / 2],
      ],
      style: bodyStyle(node, COLOR_FILL),
    },
    ...drawStereotypeAndName(node, pos, sz),
  ];
}

// `stack` — three stacked rectangles, the bottom two visible as slim slivers
// behind the main body to suggest a vertical stack. The name sits on the
// front-most rectangle.
function drawStack(node: ContainerNode, pos: Position, sz: BoxSize): Shape[] {
  const slot = Math.min(6, sz.h * 0.18);
  const style = bodyStyle(node, COLOR_FILL);
  const x = pos.x;
  const y = pos.y;
  const w = sz.w;
  const h = sz.h;
  return [
    // Back-most sliver.
    { type: 'rect', x: x + slot * 2, y, w: w - slot * 2, h: slot, style },
    // Middle sliver.
    { type: 'rect', x: x + slot, y: y + slot, w: w - slot, h: slot, style },
    // Front rectangle holds the label.
    { type: 'rect', x, y: y + slot * 2, w, h: h - slot * 2, style },
    ...drawStereotypeAndName(
      node,
      { x, y: y + slot * 2 },
      { w, h: h - slot * 2 },
    ),
  ];
}

// `package` — rectangle with a small folder-style tab spanning a portion of
// the top edge. Visually similar to `folder` but with a narrower tab.
function drawPackage(node: ContainerNode, pos: Position, sz: BoxSize): Shape[] {
  const tabW = Math.min(60, sz.w * 0.4);
  const tabH = 10;
  return [
    {
      type: 'polygon',
      points: [
        [pos.x, pos.y],
        [pos.x + tabW, pos.y],
        [pos.x + tabW + 6, pos.y + tabH],
        [pos.x + sz.w, pos.y + tabH],
        [pos.x + sz.w, pos.y + sz.h],
        [pos.x, pos.y + sz.h],
      ],
      style: bodyStyle(node, COLOR_FILL),
    },
    ...drawStereotypeAndName(
      node,
      { x: pos.x, y: pos.y + tabH },
      { w: sz.w, h: sz.h - tabH },
    ),
  ];
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
