import type {
  ContainerAst,
  ContainerNode,
  ContainerNodeKind,
  ContainerRelationship,
} from '../../ast/container.js';
import type { ClassRelationship } from '../../ast/class.js';
import type { Scene, Shape, Style } from '../../scene/types.js';
import { measureText } from '../sequence/measure.js';
import { drawMarker, markerLength, shortenPolyline, type Vec } from '../class/markers.js';
import { assignLayers, buildLayoutEdges, removeCycles } from '../class/sugiyama.js';
import { computeLateralOffsets } from '../common/edges.js';

const PAGE_PAD = 16;
const TITLE_FONT = 16;
const TITLE_GAP = 10;
const HEADER_H = 24;
const CONTAINER_PAD = 14;
const CHILD_GAP = 16;
const LAYER_GAP = 28;
const MAX_ROW_W = 720;
const STEREO_FONT = 11;

const FONT_FAMILY = 'sans-serif';
const FONT_NAME = 13;
const FONT_LABEL_EDGE = 11;
const COLOR_LINE = '#222';
const COLOR_EDGE = '#444';
const COLOR_LEAF_FILL = '#fefece';

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

export function layoutNested(ast: ContainerAst): Scene {
  const titleHeight = ast.title ? TITLE_FONT + TITLE_GAP : 0;

  // Top-level boxes
  const topBoxes = ast.nodes.map((n) => layoutContainerNode(n, ast.relationships));
  const promotedTop = collectPromotedEdges(ast.nodes, ast.relationships);
  const rows = promotedTop.length > 0
    ? sugiyamaRows(ast.nodes, topBoxes, promotedTop)
    : packIntoRows(topBoxes, MAX_ROW_W);

  let cursorY = PAGE_PAD + titleHeight;
  let maxRowW = 0;
  const rowMeta: Array<{ rowW: number; rowH: number; y: number }> = [];
  for (const row of rows) {
    let rowW = 0;
    let rowH = 0;
    for (let i = 0; i < row.boxes.length; i++) {
      rowW += row.boxes[i]!.w;
      if (i < row.boxes.length - 1) rowW += CHILD_GAP;
      rowH = Math.max(rowH, row.boxes[i]!.h);
    }
    maxRowW = Math.max(maxRowW, rowW);
    rowMeta.push({ rowW, rowH, y: cursorY });
    cursorY += rowH + CHILD_GAP;
  }
  const titleW = ast.title ? measureText(ast.title, TITLE_FONT).width : 0;
  const contentW = Math.max(maxRowW, titleW);
  const totalW = contentW + PAGE_PAD * 2;
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
    let cursorX = PAGE_PAD + (contentW - meta.rowW) / 2;
    for (const box of row.boxes) {
      shapes.push(...box.draw(cursorX, meta.y, positions));
      cursorX += box.w + CHILD_GAP;
    }
  }

  const parentOf = buildParentMap(ast);
  const edgeItems = ast.relationships.map((rel) => ({
    fromId: rel.source,
    toId: rel.target,
    rel,
  }));
  const offsets = computeLateralOffsets(edgeItems);
  for (const item of edgeItems) {
    shapes.push(
      ...drawNestedEdge(item.rel, positions, parentOf, offsets.get(item) ?? 0),
    );
  }

  return {
    width: totalW,
    height: totalH,
    background: '#fff',
    children: shapes,
  };
}

function buildParentMap(ast: ContainerAst): Map<string, string | null> {
  const parentOf = new Map<string, string | null>();
  const walk = (node: ContainerNode, parentId: string | null): void => {
    parentOf.set(node.id, parentId);
    for (const c of node.children) walk(c, node.id);
  };
  for (const top of ast.nodes) walk(top, null);
  return parentOf;
}

function clipBoxId(
  srcId: string,
  tgtId: string,
  parentOf: Map<string, string | null>,
): string {
  const tgtChain = new Set<string>();
  let cur: string | null = tgtId;
  while (cur !== null) {
    tgtChain.add(cur);
    cur = parentOf.get(cur) ?? null;
  }
  if (tgtChain.has(srcId)) return srcId;
  let result = srcId;
  cur = parentOf.get(srcId) ?? null;
  while (cur !== null) {
    if (tgtChain.has(cur)) break;
    result = cur;
    cur = parentOf.get(cur) ?? null;
  }
  return result;
}

function layoutContainerNode(node: ContainerNode, allRels: ContainerRelationship[]): Box {
  if (node.children.length === 0) {
    return layoutLeaf(node);
  }

  const childBoxes = node.children.map((c) => layoutContainerNode(c, allRels));
  const promoted = collectPromotedEdges(node.children, allRels);

  const arrangement = promoted.length > 0
    ? sugiyamaArrange(node.children, childBoxes, promoted)
    : rowWrapArrange(childBoxes);

  const headerText = node.name;
  const headerW = measureText(headerText, FONT_NAME).width + 28;

  const contentW = Math.max(arrangement.innerW, headerW);
  const w = contentW + CONTAINER_PAD * 2;
  const h = HEADER_H + arrangement.innerH + CONTAINER_PAD;

  return {
    w,
    h,
    draw(x, y, posMap) {
      const shapes: Shape[] = [];
      posMap.set(node.id, { x, y, w, h });
      shapes.push(...drawContainerFrame(node, x, y, w, h, headerText));

      const innerOriginX = x + CONTAINER_PAD;
      const innerOriginY = y + HEADER_H;
      arrangement.place(innerOriginX, innerOriginY, contentW, posMap, shapes);

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
    for (let i = 0; i < row.boxes.length; i++) {
      rowW += row.boxes[i]!.w;
      if (i < row.boxes.length - 1) rowW += CHILD_GAP;
      rowH = Math.max(rowH, row.boxes[i]!.h);
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
        for (const child of row.boxes) {
          out.push(...child.draw(cx, originY + meta.yOffset, posMap));
          cx += child.w + CHILD_GAP;
        }
      }
    },
  };
}

function sugiyamaArrange(
  childNodes: ContainerNode[],
  childBoxes: Box[],
  intra: ContainerRelationship[],
): Arrangement {
  const ids = childNodes.map((n) => n.id);
  const idToBox = new Map(childNodes.map((n, i) => [n.id, childBoxes[i]!]));

  const classRels: ClassRelationship[] = intra.map((r) => ({
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
  }));

  const edges = buildLayoutEdges(classRels);
  removeCycles(ids, edges);
  const layers = assignLayers(ids, edges);

  // Group child nodes by layer (preserve declaration order within layer)
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

function layoutLeaf(node: ContainerNode): Box {
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

function collectPromotedEdges(
  children: ContainerNode[],
  allRels: ContainerRelationship[],
): ContainerRelationship[] {
  // Map any descendant id (including a direct child itself) to the direct child id
  // it belongs to.
  const leafToDirectChild = new Map<string, string>();
  const walk = (node: ContainerNode, directChildId: string): void => {
    leafToDirectChild.set(node.id, directChildId);
    for (const c of node.children) walk(c, directChildId);
  };
  for (const child of children) walk(child, child.id);

  const seen = new Set<string>();
  const out: ContainerRelationship[] = [];
  for (const r of allRels) {
    const srcChild = leafToDirectChild.get(r.source);
    const tgtChild = leafToDirectChild.get(r.target);
    if (!srcChild || !tgtChild || srcChild === tgtChild) continue;
    const key = `${srcChild}|${tgtChild}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...r, source: srcChild, target: tgtChild });
  }
  return out;
}

function sugiyamaRows(
  topNodes: ContainerNode[],
  topBoxes: Box[],
  promoted: ContainerRelationship[],
): Array<{ boxes: Box[] }> {
  const ids = topNodes.map((n) => n.id);
  const idToBox = new Map(topNodes.map((n, i) => [n.id, topBoxes[i]!]));
  const classRels: ClassRelationship[] = promoted.map((r) => ({
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
  }));
  const edges = buildLayoutEdges(classRels);
  removeCycles(ids, edges);
  const layers = assignLayers(ids, edges);

  const groups: Box[][] = [];
  for (const n of topNodes) {
    const l = layers.get(n.id) ?? 0;
    while (groups.length <= l) groups.push([]);
    groups[l]!.push(idToBox.get(n.id)!);
  }
  return groups.map((g) => ({ boxes: g }));
}

function packIntoRows<T extends { w: number; h: number }>(
  items: T[],
  maxW: number,
): Array<{ boxes: T[] }> {
  const rows: Array<{ boxes: T[] }> = [];
  let cur: T[] = [];
  let curW = 0;
  for (const it of items) {
    const tryW = cur.length === 0 ? it.w : curW + CHILD_GAP + it.w;
    if (cur.length > 0 && tryW > maxW) {
      rows.push({ boxes: cur });
      cur = [it];
      curW = it.w;
    } else {
      cur.push(it);
      curW = tryW;
    }
  }
  if (cur.length > 0) rows.push({ boxes: cur });
  return rows;
}

interface LeafSize {
  w: number;
  h: number;
}

function measureLeaf(node: ContainerNode): LeafSize {
  const stereo = stereotypeFor(node.nodeKind);
  const nameLines = node.name.split(/\\n|\r\n|\n/);
  const nameMaxLen = nameLines.reduce((a, l) => Math.max(a, l.length), 0);
  const nameW = nameMaxLen * FONT_NAME * 0.6;
  const stereoW = stereo ? measureText(stereo, STEREO_FONT).width : 0;
  const contentW = Math.max(nameW, stereoW);
  const pad = 12;
  const lineH = FONT_NAME * 1.25;
  const nameH = nameLines.length * lineH;
  const stereoH = stereo ? STEREO_FONT * 1.3 : 0;
  const w = Math.max(80, contentW + pad * 2);
  const h = stereoH + nameH + pad;
  if (node.nodeKind === 'interface') {
    return { w: Math.max(40, nameW + 12), h: 28 + Math.max(0, nameLines.length - 1) * lineH };
  }
  if (node.nodeKind === 'artifact') return { w: w + 6, h: h + 4 };
  if (node.nodeKind === 'database' || node.nodeKind === 'storage') return { w, h: h + 8 };
  if (node.nodeKind === 'queue') return { w: w + 8, h };
  return { w, h };
}

function drawLeaf(node: ContainerNode, x: number, y: number, w: number, h: number): Shape[] {
  switch (node.nodeKind) {
    case 'interface':  return drawInterface(node.name, x, y, w, h);
    case 'database':   return drawDatabase(node, x, y, w, h);
    case 'storage':    return drawStorage(node, x, y, w, h);
    case 'queue':      return drawQueue(node, x, y, w, h);
    case 'artifact':   return drawArtifact(node, x, y, w, h);
    case 'cloud':      return drawCloud(node, x, y, w, h);
    case 'component':  return drawComponent(node, x, y, w, h);
    case 'node':       return drawDeploymentNode(node, x, y, w, h);
    case 'folder':     return drawFolder(node, x, y, w, h);
    case 'frame':      return drawFrame(node, x, y, w, h);
    case 'rectangle':  return drawRect(node, x, y, w, h);
    case 'object':     return drawRect(node, x, y, w, h);
  }
}

function drawContainerFrame(
  node: ContainerNode,
  x: number,
  y: number,
  w: number,
  h: number,
  headerText: string,
): Shape[] {
  const kind = node.nodeKind;
  const shapes: Shape[] = [];

  switch (kind) {
    case 'cloud': {
      shapes.push(drawCloudPath(x, y, w, h));
      shapes.push(centeredTitle(headerText, x + w / 2, y + 16));
      break;
    }
    case 'node': {
      const shadow = 6;
      shapes.push({
        type: 'polygon',
        points: [
          [x + shadow, y - shadow],
          [x + w + shadow, y - shadow],
          [x + w + shadow, y + h - shadow],
          [x + w, y + h - shadow],
          [x + w, y],
          [x + shadow, y],
        ],
        style: { fill: '#fff', stroke: COLOR_LINE, strokeWidth: 1 },
      });
      shapes.push({
        type: 'rect',
        x, y, w, h,
        style: { fill: '#fff', stroke: COLOR_LINE, strokeWidth: 1 },
      });
      shapes.push(centeredTitle(headerText, x + w / 2, y + 16));
      break;
    }
    case 'folder': {
      const tabW = Math.min(80, w / 3);
      shapes.push({
        type: 'polygon',
        points: [
          [x, y],
          [x + tabW, y],
          [x + tabW + 8, y + 8],
          [x + w, y + 8],
          [x + w, y + h],
          [x, y + h],
        ],
        style: { fill: '#fff', stroke: COLOR_LINE, strokeWidth: 1 },
      });
      shapes.push(cornerTitle(headerText, x + 6, y + 6));
      break;
    }
    case 'frame':
    case 'rectangle':
    default: {
      shapes.push({
        type: 'rect',
        x, y, w, h,
        style: { fill: '#fff', stroke: COLOR_LINE, strokeWidth: 1 },
      });
      shapes.push(cornerTitle(headerText, x + 10, y + 14));
      break;
    }
  }

  return shapes;
}

function centeredTitle(text: string, cx: number, y: number): Shape {
  return {
    type: 'text',
    x: cx,
    y,
    text,
    anchor: 'middle',
    baseline: 'alphabetic',
    font: { family: FONT_FAMILY, size: FONT_NAME, weight: 'bold', color: '#111' },
  };
}

function cornerTitle(text: string, x: number, y: number): Shape {
  return {
    type: 'text',
    x,
    y,
    text,
    anchor: 'start',
    baseline: 'alphabetic',
    font: { family: FONT_FAMILY, size: FONT_NAME, weight: 'bold', color: '#111' },
  };
}

function drawCloudPath(x: number, y: number, w: number, h: number): Shape {
  // Cloud silhouette drawn so that arc bumps stay strictly within (x, y, w, h).
  // Bumps bulge outward from the polyline by ~bumpR; we shrink anchor radii
  // inward by that amount so the visual extent matches the bounding box.
  const cx = x + w / 2;
  const cy = y + h / 2;
  const bumpR = Math.min(w, h) * 0.16;
  const rw = w / 2 - bumpR * 0.9;
  const rh = h / 2 - bumpR * 0.9;

  const pts: Array<[number, number]> = [
    [cx - rw,                cy - rh * 0.5],
    [cx - rw * 0.55,         cy - rh],
    [cx,                     cy - rh * 1.05 + bumpR * 0.05],
    [cx + rw * 0.55,         cy - rh],
    [cx + rw,                cy - rh * 0.5],
    [cx + rw * 1.02,         cy],
    [cx + rw,                cy + rh * 0.5],
    [cx + rw * 0.45,         cy + rh],
    [cx - rw * 0.45,         cy + rh],
    [cx - rw,                cy + rh * 0.5],
    [cx - rw * 1.02,         cy],
    [cx - rw,                cy - rh * 0.5],
  ];

  let d = `M ${pts[0]![0]} ${pts[0]![1]}`;
  for (let i = 1; i < pts.length; i++) {
    const px = pts[i]![0];
    const py = pts[i]![1];
    d += ` A ${bumpR} ${bumpR} 0 0 1 ${px} ${py}`;
  }
  d += ' Z';

  return {
    type: 'path',
    d,
    style: { fill: '#fff', stroke: COLOR_LINE, strokeWidth: 1 },
  };
}

function drawInterface(name: string, x: number, y: number, w: number, h: number): Shape[] {
  const cx = x + w / 2;
  const r = Math.min(9, h / 3);
  return [
    {
      type: 'circle',
      cx, cy: y + r + 2, r,
      style: { fill: '#fff', stroke: COLOR_LINE, strokeWidth: 1 },
    },
    {
      type: 'text',
      x: cx, y: y + h - 4,
      text: name, anchor: 'middle', baseline: 'alphabetic',
      font: { family: FONT_FAMILY, size: FONT_NAME, color: '#000' },
    },
  ];
}

function drawComponent(node: ContainerNode, x: number, y: number, w: number, h: number): Shape[] {
  return [
    {
      type: 'rect',
      x, y, w, h,
      style: { fill: COLOR_LEAF_FILL, stroke: COLOR_LINE, strokeWidth: 1 },
    },
    portRect(x - 3, y + h * 0.25),
    portRect(x - 3, y + h * 0.75),
    ...drawCenteredStereo(node, '', x, y, w, h),
  ];
}

function portRect(x: number, y: number): Shape {
  return {
    type: 'rect',
    x, y: y - 4, w: 10, h: 8,
    style: { fill: COLOR_LEAF_FILL, stroke: COLOR_LINE, strokeWidth: 1 },
  };
}

function drawDeploymentNode(node: ContainerNode, x: number, y: number, w: number, h: number): Shape[] {
  const shadow = 5;
  return [
    {
      type: 'polygon',
      points: [
        [x + shadow, y - shadow],
        [x + w + shadow, y - shadow],
        [x + w + shadow, y + h - shadow],
        [x + w, y + h - shadow],
        [x + w, y],
        [x + shadow, y],
      ],
      style: { fill: '#e7e7d4', stroke: COLOR_LINE, strokeWidth: 1 },
    },
    {
      type: 'rect',
      x, y, w, h,
      style: { fill: COLOR_LEAF_FILL, stroke: COLOR_LINE, strokeWidth: 1 },
    },
    ...drawCenteredStereo(node, '', x, y, w, h),
  ];
}

function drawCloud(node: ContainerNode, x: number, y: number, w: number, h: number): Shape[] {
  return [
    {
      type: 'ellipse',
      cx: x + w / 2, cy: y + h / 2, rx: w / 2, ry: h / 2,
      style: { fill: '#f4f6fb', stroke: COLOR_LINE, strokeWidth: 1 },
    },
    ...drawCenteredStereo(node, '', x, y, w, h),
  ];
}

function drawDatabase(node: ContainerNode, x: number, y: number, w: number, h: number): Shape[] {
  const left = x + 4;
  const right = x + w - 4;
  const top = y + 6;
  const bottom = y + h - 4;
  const rx = (right - left) / 2;
  const ry = 5;
  const midX = (left + right) / 2;
  return [
    {
      type: 'path',
      d: `M ${left} ${top} L ${left} ${bottom} A ${rx} ${ry} 0 0 0 ${right} ${bottom} L ${right} ${top}`,
      style: { fill: '#f4f6fb', stroke: COLOR_LINE, strokeWidth: 1 },
    },
    {
      type: 'ellipse',
      cx: midX, cy: top, rx, ry,
      style: { fill: '#f4f6fb', stroke: COLOR_LINE, strokeWidth: 1 },
    },
    ...drawCenteredStereo(node, '', x, y + 6, w, h - 6),
  ];
}

function drawStorage(node: ContainerNode, x: number, y: number, w: number, h: number): Shape[] {
  return [
    {
      type: 'rect',
      x, y, w, h,
      rx: h / 3, ry: h / 3,
      style: { fill: COLOR_LEAF_FILL, stroke: COLOR_LINE, strokeWidth: 1 },
    },
    ...drawCenteredStereo(node, '', x, y, w, h),
  ];
}

function drawQueue(node: ContainerNode, x: number, y: number, w: number, h: number): Shape[] {
  const rx = 8;
  const ry = h / 2;
  const left = x;
  const right = x + w;
  const top = y;
  const bot = y + h;
  return [
    {
      type: 'path',
      d:
        `M ${left + rx} ${top} L ${right - rx} ${top} ` +
        `A ${rx} ${ry} 0 0 1 ${right - rx} ${bot} ` +
        `L ${left + rx} ${bot} ` +
        `A ${rx} ${ry} 0 0 1 ${left + rx} ${top} Z`,
      style: { fill: COLOR_LEAF_FILL, stroke: COLOR_LINE, strokeWidth: 1 },
    },
    {
      type: 'path',
      d: `M ${left + rx} ${top} A ${rx} ${ry} 0 0 0 ${left + rx} ${bot}`,
      style: { fill: 'none', stroke: COLOR_LINE, strokeWidth: 1 },
    },
    ...drawCenteredStereo(node, '', x, y, w, h),
  ];
}

function drawArtifact(node: ContainerNode, x: number, y: number, w: number, h: number): Shape[] {
  const fold = 10;
  return [
    {
      type: 'polygon',
      points: [
        [x, y],
        [x + w - fold, y],
        [x + w, y + fold],
        [x + w, y + h],
        [x, y + h],
      ],
      style: { fill: COLOR_LEAF_FILL, stroke: COLOR_LINE, strokeWidth: 1 },
    },
    {
      type: 'polyline',
      points: [
        [x + w - fold, y],
        [x + w - fold, y + fold],
        [x + w, y + fold],
      ],
      style: { fill: 'none', stroke: COLOR_LINE, strokeWidth: 1 },
    },
    ...drawCenteredStereo(node, '', x, y, w, h),
  ];
}

function drawFolder(node: ContainerNode, x: number, y: number, w: number, h: number): Shape[] {
  const tabW = Math.min(50, w / 2);
  const tabH = 8;
  return [
    {
      type: 'polygon',
      points: [
        [x, y],
        [x + tabW, y],
        [x + tabW + 6, y + tabH],
        [x + w, y + tabH],
        [x + w, y + h],
        [x, y + h],
      ],
      style: { fill: COLOR_LEAF_FILL, stroke: COLOR_LINE, strokeWidth: 1 },
    },
    ...drawCenteredStereo(node, '', x, y + tabH, w, h - tabH),
  ];
}

function drawFrame(node: ContainerNode, x: number, y: number, w: number, h: number): Shape[] {
  return [
    {
      type: 'rect',
      x, y, w, h,
      style: { fill: COLOR_LEAF_FILL, stroke: COLOR_LINE, strokeWidth: 1 },
    },
    ...drawCenteredStereo(node, '', x, y, w, h),
  ];
}

function drawRect(node: ContainerNode, x: number, y: number, w: number, h: number): Shape[] {
  return [
    {
      type: 'rect',
      x, y, w, h,
      style: { fill: COLOR_LEAF_FILL, stroke: COLOR_LINE, strokeWidth: 1 },
    },
    ...drawCenteredStereo(node, '', x, y, w, h),
  ];
}

function drawCenteredStereo(
  node: ContainerNode,
  stereo: string,
  x: number,
  y: number,
  w: number,
  _h: number,
): Shape[] {
  const shapes: Shape[] = [];
  let textY = y + 8;
  if (stereo) {
    textY += STEREO_FONT * 0.9;
    shapes.push({
      type: 'text',
      x: x + w / 2, y: textY,
      text: stereo, anchor: 'middle', baseline: 'alphabetic',
      font: { family: FONT_FAMILY, size: STEREO_FONT, color: '#000' },
    });
    textY += STEREO_FONT * 0.6;
  }
  shapes.push(...drawMultilineName(node.name, x + w / 2, textY + FONT_NAME * 0.9, w));
  return shapes;
}

function drawMultilineName(name: string, cx: number, baseY: number, _w: number): Shape[] {
  const lines = name.split(/\\n|\r\n|\n/);
  const lineH = FONT_NAME * 1.25;
  return lines.map((line, i) => ({
    type: 'text',
    x: cx,
    y: baseY + i * lineH,
    text: line,
    anchor: 'middle',
    baseline: 'alphabetic',
    font: { family: FONT_FAMILY, size: FONT_NAME, weight: 'bold', color: '#000' },
  }));
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
    case 'rectangle':
    case 'object':
    case 'interface':
    default:          return '';
  }
}

function drawNestedEdge(
  rel: ContainerRelationship,
  positions: Map<string, AbsPos>,
  parentOf: Map<string, string | null>,
  lateralOffset: number,
): Shape[] {
  const srcClipId = clipBoxId(rel.source, rel.target, parentOf);
  const tgtClipId = clipBoxId(rel.target, rel.source, parentOf);
  const src = positions.get(srcClipId);
  const tgt = positions.get(tgtClipId);
  if (!src || !tgt) return [];

  const sCx = src.x + src.w / 2;
  const sCy = src.y + src.h / 2;
  const tCx = tgt.x + tgt.w / 2;
  const tCy = tgt.y + tgt.h / 2;

  const p1 = rectClip(sCx, sCy, src.w, src.h, tCx, tCy);
  const p2 = rectClip(tCx, tCy, tgt.w, tgt.h, sCx, sCy);

  const start = applyLateralOffset(p1, p2, lateralOffset);
  const end = applyLateralOffset(p2, p1, -lateralOffset);
  const original: Vec[] = [start, end];
  const shortened = shortenPolyline(original, markerLength(rel.sourceMarker), markerLength(rel.targetMarker));

  const lineStyle: Style =
    rel.style === 'dashed'
      ? { stroke: COLOR_EDGE, strokeWidth: 1, strokeDasharray: '5,3', fill: 'none' }
      : { stroke: COLOR_EDGE, strokeWidth: 1, fill: 'none' };

  const shapes: Shape[] = [
    {
      type: 'line',
      x1: shortened[0]!.x, y1: shortened[0]!.y,
      x2: shortened[1]!.x, y2: shortened[1]!.y,
      style: lineStyle,
    },
  ];

  const srcMarker = drawMarker(rel.sourceMarker, start, end);
  if (srcMarker) shapes.push(srcMarker);
  const tgtMarker = drawMarker(rel.targetMarker, end, start);
  if (tgtMarker) shapes.push(tgtMarker);

  if (rel.label) {
    shapes.push({
      type: 'text',
      x: (start.x + end.x) / 2,
      y: (start.y + end.y) / 2 - 4,
      text: rel.label,
      anchor: 'middle',
      baseline: 'alphabetic',
      font: { family: FONT_FAMILY, size: FONT_LABEL_EDGE, color: '#000' },
    });
  }

  return shapes;
}

function applyLateralOffset(point: Vec, other: Vec, offset: number): Vec {
  if (offset === 0) return { x: point.x, y: point.y };
  const dx = other.x - point.x;
  const dy = other.y - point.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return { x: point.x, y: point.y };
  const px = -dy / len;
  const py = dx / len;
  return { x: point.x + px * offset, y: point.y + py * offset };
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
