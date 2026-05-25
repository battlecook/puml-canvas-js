import type {
  ClassAst,
  ClassDecl,
  ClassKind,
  ClassMember,
  ClassRelationship,
} from '../../ast/class.js';
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
  type DrawableEdge,
} from './sugiyama.js';
import {
  SELF_LOOP_OUT,
  computeLateralOffsets,
  drawLayeredEdge,
  drawLayeredSelfLoop,
} from '../common/edges.js';
import type { BoxSize, EdgeStyle, NodeCenter, Position } from '../common/types.js';

const BOX_PAD_X = 10;
const BOX_PAD_Y = 8;
const ROW_HEIGHT = 18;
const SEP_PAD = 6;
const MIN_BOX_W = 120;
const HORIZONTAL_GAP = 30;
const VERTICAL_GAP = 30;
const LAYER_GAP = 60;
const DUMMY_GAP = 12;
const PAGE_PAD = 16;
const MAX_PAGE_W = 1200;
const TITLE_FONT = 16;
const TITLE_GAP = 8;
const EDGE_LABEL_FONT = 11;

const FONT_FAMILY = 'sans-serif';
const FONT_NAME = 14;
const FONT_MEMBER = 12;
const FONT_STEREO = 11;

const COLOR_LINE = '#222';
const COLOR_EDGE = '#444';
const COLOR_BG_CLASS = '#fefece';
const COLOR_BG_INTERFACE = '#d6ecdb';
const COLOR_BG_ENUM = '#f5d9b8';
const COLOR_BG_ABSTRACT = '#fefece';
const COLOR_BG_ANNOTATION = '#e7d6f0';
const COLOR_BG_RECORD = '#e6f3ff';

const EDGE_STYLE: EdgeStyle = {
  color: COLOR_EDGE,
  fontFamily: FONT_FAMILY,
  labelFontSize: EDGE_LABEL_FONT,
};

export function layoutClass(ast: ClassAst): Scene {
  if (ast.classes.length === 0) {
    return {
      width: 220,
      height: 60,
      background: '#fff',
      children: [
        {
          type: 'text',
          x: 110,
          y: 30,
          text: '(empty class diagram)',
          anchor: 'middle',
          baseline: 'middle',
          font: { family: FONT_FAMILY, size: 12, color: '#999' },
        },
      ],
    };
  }

  const sizes = new Map(ast.classes.map((c) => [c.id, measureClass(c)]));
  const titleHeight = ast.title ? TITLE_FONT + TITLE_GAP : 0;

  const selfLoops = ast.relationships.filter((r) => r.source === r.target);
  const nonLoops = ast.relationships.filter((r) => r.source !== r.target);

  const shapes: Shape[] = [];

  const positions = nonLoops.length === 0 ? null : null;
  const base =
    nonLoops.length === 0
      ? layoutGridResult(ast, sizes, titleHeight)
      : layoutLayeredResult(ast, sizes, titleHeight, nonLoops);

  const extraRight = selfLoopExtraWidth(selfLoops, base.positions, sizes);
  const totalWidth = base.width + extraRight;

  appendTitle(ast, shapes, totalWidth);

  if (base.drawable) {
    const offsets = computeLateralOffsets(base.drawable);
    for (const edge of base.drawable) {
      shapes.push(
        ...drawLayeredEdge({
          fromId: edge.fromId,
          toId: edge.toId,
          waypoints: edge.waypoints,
          rel: edge.rel,
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

  for (const c of ast.classes) {
    const pos = base.positions.get(c.id);
    if (!pos) continue;
    shapes.push(...drawClassBox(c, pos.x, pos.y, sizes.get(c.id)!));
  }

  void positions;

  return {
    width: totalWidth,
    height: base.height,
    background: '#fff',
    children: shapes,
  };
}

interface BaseLayoutResult {
  positions: Map<string, Position>;
  width: number;
  height: number;
  drawable?: DrawableEdge[];
  centers?: Map<string, NodeCenter>;
}

function layoutGridResult(
  ast: ClassAst,
  sizes: Map<string, BoxSize>,
  titleHeight: number,
): BaseLayoutResult {
  const grid = layoutGrid(ast, sizes, titleHeight);
  return { positions: grid.positions, width: grid.width, height: grid.height };
}

function layoutLayeredResult(
  ast: ClassAst,
  sizes: Map<string, BoxSize>,
  titleHeight: number,
  rels: ClassRelationship[],
): BaseLayoutResult {
  const layered = layoutLayered(ast, sizes, titleHeight, rels);
  return {
    positions: layered.positions,
    width: layered.width,
    height: layered.height,
    drawable: layered.drawable,
    centers: layered.centers,
  };
}

function selfLoopExtraWidth(
  loops: ClassRelationship[],
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
  return extra > 0 ? Math.max(0, extra - rightMostBox(positions, sizes)) : 0;
}

function rightMostBox(positions: Map<string, Position>, sizes: Map<string, BoxSize>): number {
  let max = 0;
  for (const [id, pos] of positions) {
    const sz = sizes.get(id);
    if (!sz) continue;
    max = Math.max(max, pos.x + sz.w);
  }
  return max;
}

function appendTitle(ast: ClassAst, shapes: Shape[], width: number): void {
  if (!ast.title) return;
  shapes.push({
    type: 'text',
    x: width / 2,
    y: PAGE_PAD + TITLE_FONT,
    text: ast.title,
    anchor: 'middle',
    baseline: 'alphabetic',
    font: { family: FONT_FAMILY, size: TITLE_FONT, weight: 'bold', color: '#000' },
  });
}

interface LayoutResult {
  positions: Map<string, Position>;
  width: number;
  height: number;
}

function layoutGrid(ast: ClassAst, sizes: Map<string, BoxSize>, titleHeight: number): LayoutResult {
  type Row = { startIdx: number; widths: number[]; height: number };
  const rows: Row[] = [];
  let curRow: Row = { startIdx: 0, widths: [], height: 0 };
  let curRowWidth = 0;

  for (let i = 0; i < ast.classes.length; i++) {
    const sz = sizes.get(ast.classes[i]!.id)!;
    const widthIfAdded =
      curRow.widths.length === 0 ? sz.w : curRowWidth + HORIZONTAL_GAP + sz.w;
    if (curRow.widths.length > 0 && widthIfAdded > MAX_PAGE_W - PAGE_PAD * 2) {
      rows.push(curRow);
      curRow = { startIdx: i, widths: [sz.w], height: sz.h };
      curRowWidth = sz.w;
    } else {
      curRow.widths.push(sz.w);
      curRow.height = Math.max(curRow.height, sz.h);
      curRowWidth = widthIfAdded;
    }
  }
  if (curRow.widths.length > 0) rows.push(curRow);

  const positions = new Map<string, Position>();
  let cursorY = PAGE_PAD + titleHeight;
  let totalW = PAGE_PAD * 2;
  for (const row of rows) {
    let cursorX = PAGE_PAD;
    for (let k = 0; k < row.widths.length; k++) {
      const idx = row.startIdx + k;
      positions.set(ast.classes[idx]!.id, { x: cursorX, y: cursorY });
      cursorX += row.widths[k]! + (k < row.widths.length - 1 ? HORIZONTAL_GAP : 0);
    }
    totalW = Math.max(totalW, cursorX + PAGE_PAD);
    cursorY += row.height + VERTICAL_GAP;
  }

  return {
    positions,
    width: totalW,
    height: cursorY - VERTICAL_GAP + PAGE_PAD,
  };
}

interface LayeredResult {
  positions: Map<string, Position>;
  centers: Map<string, NodeCenter>;
  drawable: DrawableEdge[];
  width: number;
  height: number;
}

function layoutLayered(
  ast: ClassAst,
  sizes: Map<string, BoxSize>,
  titleHeight: number,
  relationships: ClassRelationship[],
): LayeredResult {
  const nodeIds = ast.classes.map((c) => c.id);
  const edges = buildLayoutEdges(relationships);
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
  const maxW = coords.maxLayerWidth > 0 ? coords.maxLayerWidth : MIN_BOX_W;
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

function measureClass(c: ClassDecl): BoxSize {
  const stereoLine = computeStereotypeLine(c);
  const stereoH = stereoLine ? Math.ceil(FONT_STEREO * 1.2) : 0;
  const nameW = measureText(c.name, FONT_NAME).width;
  const stereoW = stereoLine ? measureText(stereoLine, FONT_STEREO).width : 0;

  let memberLinesW = 0;
  if (c.classKind === 'enum') {
    for (const ec of c.enumConstants) {
      memberLinesW = Math.max(memberLinesW, measureText(ec.name, FONT_MEMBER).width);
    }
  } else {
    for (const m of c.members) {
      memberLinesW = Math.max(memberLinesW, measureText(formatMember(m), FONT_MEMBER).width);
    }
  }

  const contentW = Math.max(nameW, stereoW, memberLinesW);
  const w = Math.max(MIN_BOX_W, contentW + BOX_PAD_X * 2);
  const titleH = BOX_PAD_Y + stereoH + Math.ceil(FONT_NAME * 1.2) + BOX_PAD_Y;
  const sections = bodySections(c);
  let bodyH = 0;
  for (const count of sections) {
    if (count > 0) bodyH += SEP_PAD + ROW_HEIGHT * count + SEP_PAD;
  }
  return { w, h: titleH + bodyH };
}

function bodySections(c: ClassDecl): number[] {
  if (c.classKind === 'enum') return [c.enumConstants.length];
  const fields = c.members.filter((m) => m.memberKind === 'field').length;
  const methods = c.members.filter((m) => m.memberKind === 'method').length;
  return [fields, methods];
}

function computeStereotypeLine(c: ClassDecl): string {
  if (c.stereotype) return `«${c.stereotype}»`;
  if (c.classKind === 'interface') return '«interface»';
  if (c.classKind === 'enum') return '«enumeration»';
  if (c.classKind === 'abstract') return '«abstract»';
  if (c.classKind === 'annotation') return '«annotation»';
  if (c.classKind === 'record') return '«record»';
  return '';
}

function bgFor(kind: ClassKind): string {
  switch (kind) {
    case 'interface':  return COLOR_BG_INTERFACE;
    case 'enum':       return COLOR_BG_ENUM;
    case 'abstract':   return COLOR_BG_ABSTRACT;
    case 'annotation': return COLOR_BG_ANNOTATION;
    case 'record':     return COLOR_BG_RECORD;
    case 'class':
    default:           return COLOR_BG_CLASS;
  }
}

function formatMember(m: ClassMember): string {
  const visMap: Record<string, string> = {
    public: '+', private: '-', protected: '#', package: '~', none: '',
  };
  const vis = visMap[m.visibility] ?? '';
  const mods: string[] = [];
  if (m.isStatic) mods.push('{static}');
  if (m.isAbstract) mods.push('{abstract}');
  const prefix = (mods.length ? mods.join(' ') + ' ' : '') + vis;
  const body =
    m.memberKind === 'method'
      ? `${m.name}(${m.params})${m.type ? ': ' + m.type : ''}`
      : `${m.name}${m.type ? ': ' + m.type : ''}`;
  return prefix + body;
}

function drawClassBox(c: ClassDecl, x: number, y: number, sz: BoxSize): Shape[] {
  const stereoLine = computeStereotypeLine(c);
  const stereoH = stereoLine ? Math.ceil(FONT_STEREO * 1.2) : 0;
  const titleH = BOX_PAD_Y + stereoH + Math.ceil(FONT_NAME * 1.2) + BOX_PAD_Y;
  const bg = bgFor(c.classKind);
  const shapes: Shape[] = [];

  shapes.push({
    type: 'rect',
    x, y, w: sz.w, h: sz.h,
    style: { fill: bg, stroke: COLOR_LINE, strokeWidth: 1 },
  });

  let textY = y + BOX_PAD_Y + Math.ceil(FONT_STEREO * 0.9);
  if (stereoLine) {
    shapes.push({
      type: 'text',
      x: x + sz.w / 2,
      y: textY,
      text: stereoLine,
      anchor: 'middle',
      baseline: 'alphabetic',
      font: { family: FONT_FAMILY, size: FONT_STEREO, color: '#000' },
    });
    textY += Math.ceil(FONT_STEREO * 1.2);
  }

  const nameFontStyle: 'italic' | 'normal' = c.classKind === 'abstract' ? 'italic' : 'normal';
  shapes.push({
    type: 'text',
    x: x + sz.w / 2,
    y: textY + Math.ceil(FONT_NAME * 0.9),
    text: c.name,
    anchor: 'middle',
    baseline: 'alphabetic',
    font: { family: FONT_FAMILY, size: FONT_NAME, weight: 'bold', style: nameFontStyle, color: '#000' },
  });

  let yCursor = y + titleH;

  if (c.classKind === 'enum') {
    if (c.enumConstants.length > 0) {
      shapes.push(...drawSection(x, yCursor, sz.w, c.enumConstants.map((e) => e.name)));
      yCursor += SEP_PAD + ROW_HEIGHT * c.enumConstants.length + SEP_PAD;
    }
    return shapes;
  }

  const fields = c.members.filter((m) => m.memberKind === 'field');
  const methods = c.members.filter((m) => m.memberKind === 'method');
  if (fields.length > 0) {
    shapes.push(...drawSection(x, yCursor, sz.w, fields.map(formatMember)));
    yCursor += SEP_PAD + ROW_HEIGHT * fields.length + SEP_PAD;
  }
  if (methods.length > 0) {
    shapes.push(...drawSection(x, yCursor, sz.w, methods.map(formatMember)));
  }

  return shapes;
}

function drawSection(x: number, yTop: number, w: number, lines: string[]): Shape[] {
  const shapes: Shape[] = [];
  shapes.push({
    type: 'line',
    x1: x, y1: yTop, x2: x + w, y2: yTop,
    style: { stroke: COLOR_LINE, strokeWidth: 1 },
  });
  let y = yTop + SEP_PAD;
  for (const line of lines) {
    shapes.push({
      type: 'text',
      x: x + BOX_PAD_X,
      y: y + ROW_HEIGHT - 4,
      text: line,
      anchor: 'start',
      baseline: 'alphabetic',
      font: { family: FONT_FAMILY, size: FONT_MEMBER, color: '#000' },
    });
    y += ROW_HEIGHT;
  }
  return shapes;
}
