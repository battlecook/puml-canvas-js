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

// Compact-badge mode (when `hide empty members` is set and the class has none)
const BADGE_R = 9;
const BADGE_GAP = 6;
const BADGE_PAD_X = 8;
const BADGE_PAD_Y = 6;
const BADGE_NAME_FONT = 13;
const BADGE_STEREO_FONT = 10;
const BADGE_RADIUS = 5;
const BADGE_COLOR_CLASS = '#7cb098';
const BADGE_COLOR_INTERFACE = '#a78bfa';
const BADGE_COLOR_ABSTRACT = '#7dd3c0';
const BADGE_COLOR_ANNOTATION = '#e07a5f';
const BADGE_COLOR_ENUM = '#e58e7b';
const BADGE_COLOR_RECORD = '#f59e0b';

const EDGE_STYLE: EdgeStyle = {
  color: COLOR_EDGE,
  fontFamily: FONT_FAMILY,
  labelFontSize: EDGE_LABEL_FONT,
};

// Header-corner glyphs for class-level visibility markers (e.g. `-class Foo`).
// `none` is unused — visibility is only drawn when explicitly set on the AST.
const VISIBILITY_GLYPH: Record<string, string> = {
  public: '+',
  private: '-',
  protected: '#',
  package: '~',
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

  const sizes = new Map(
    ast.classes.map((c) => [c.id, measureClass(c, isCompact(c, ast.hideEmptyMembers))]),
  );
  const titleHeight = ast.title ? TITLE_FONT + TITLE_GAP : 0;

  const selfLoops = ast.relationships.filter((r) => r.source === r.target);
  const nonLoops = ast.relationships.filter((r) => r.source !== r.target);

  const shapes: Shape[] = [];

  const direction: 'TB' | 'LR' = ast.direction === 'LR' ? 'LR' : 'TB';

  const positions = nonLoops.length === 0 ? null : null;
  const base =
    nonLoops.length === 0
      ? layoutGridResult(ast, sizes, titleHeight)
      : layoutLayeredResult(ast, sizes, titleHeight, nonLoops, direction);

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
    const compact = isCompact(c, ast.hideEmptyMembers);
    shapes.push(...drawClassBox(c, pos.x, pos.y, sizes.get(c.id)!, compact));
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
  direction: 'TB' | 'LR',
): BaseLayoutResult {
  const layered = layoutLayered(ast, sizes, titleHeight, rels, direction);
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
  direction: 'TB' | 'LR' = 'TB',
): LayeredResult {
  const nodeIds = ast.classes.map((c) => c.id);
  const edges = buildLayoutEdges(relationships);
  removeCycles(nodeIds, edges);
  const baseLayers = assignLayers(nodeIds, edges);

  const dummy = insertDummies(nodeIds, edges, baseLayers);
  const initialGroups = groupByLayer(dummy.extendedNodeIds, dummy.layers);
  const ordered = minimizeCrossings(initialGroups, dummy.segments);

  // In LR mode the rank axis runs left-to-right, so each rank is a column and
  // the per-rank extent is the column's WIDTH (max node width). In TB mode it
  // runs top-to-bottom, so each rank is a row and the per-rank extent is the
  // row's HEIGHT (max node height). Mirrors the usecase layered implementation.
  const lr = direction === 'LR';
  const rankExtent = ordered.map((layer) => {
    let v = 0;
    for (const id of layer) {
      if (dummy.dummyIds.has(id)) continue;
      const sz = sizes.get(id)!;
      const ext = lr ? sz.w : sz.h;
      if (ext > v) v = ext;
    }
    return v;
  });

  // In LR mode the within-layer axis is vertical, so widthOf becomes the
  // per-node HEIGHT (nodes stack vertically within a column).
  const coords = assignCoordinates({
    orderedLayers: ordered,
    segments: dummy.segments,
    widthOf: (id) => {
      const sz = sizes.get(id);
      if (!sz) return 0;
      return lr ? sz.h : sz.w;
    },
    dummyIds: dummy.dummyIds,
    horizontalGap: HORIZONTAL_GAP,
    dummyGap: DUMMY_GAP,
  });
  const maxInLayer = coords.maxLayerWidth > 0 ? coords.maxLayerWidth : MIN_BOX_W;

  const positions = new Map<string, Position>();
  const centers = new Map<string, NodeCenter>();

  // `rankCursor` walks along the rank axis (Y for TB, X for LR).
  let rankCursor = PAGE_PAD + titleHeight;
  for (let l = 0; l < ordered.length; l++) {
    const layer = ordered[l]!;
    const extent = rankExtent[l]!;
    for (const id of layer) {
      const inLayer = PAGE_PAD + coords.centerX.get(id)!;
      const isDummy = dummy.dummyIds.has(id);
      if (lr) {
        // LR: rank axis is X, within-layer axis is Y.
        const cx = rankCursor + extent / 2;
        const cy = inLayer;
        if (isDummy) {
          centers.set(id, { cx, cy });
        } else {
          const sz = sizes.get(id)!;
          positions.set(id, { x: rankCursor + (extent - sz.w) / 2, y: cy - sz.h / 2 });
          centers.set(id, { cx: rankCursor + extent / 2, cy });
        }
      } else {
        const cx = inLayer;
        const cy = rankCursor + extent / 2;
        if (isDummy) {
          centers.set(id, { cx, cy });
        } else {
          const sz = sizes.get(id)!;
          positions.set(id, { x: cx - sz.w / 2, y: rankCursor });
          centers.set(id, { cx, cy: rankCursor + sz.h / 2 });
        }
      }
    }
    rankCursor += extent + LAYER_GAP;
  }

  const rankSpan = rankCursor - LAYER_GAP + PAGE_PAD;
  const inLayerSpan = maxInLayer + PAGE_PAD * 2;
  return {
    positions,
    centers,
    drawable: dummy.drawable,
    width: lr ? rankSpan : inLayerSpan,
    height: lr ? inLayerSpan : rankSpan,
  };
}

function isCompact(c: ClassDecl, hideEmptyMembers: boolean): boolean {
  if (!hideEmptyMembers) return false;
  if (c.members.length > 0) return false;
  if (c.enumConstants.length > 0) return false;
  return true;
}

function measureClass(c: ClassDecl, compact: boolean): BoxSize {
  if (compact) return measureCompact(c);
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

function measureCompact(c: ClassDecl): BoxSize {
  const stereoText = c.stereotype ? `«${c.stereotype}»` : '';
  const nameW = measureText(c.name, BADGE_NAME_FONT).width;
  const stereoW = stereoText ? measureText(stereoText, BADGE_STEREO_FONT).width : 0;
  const labelW = Math.max(nameW, stereoW);
  const w = BADGE_PAD_X + BADGE_R * 2 + BADGE_GAP + labelW + BADGE_PAD_X;
  const nameH = Math.ceil(BADGE_NAME_FONT * 1.3);
  const stereoH = stereoText ? Math.ceil(BADGE_STEREO_FONT * 1.2) : 0;
  const innerH = stereoH + nameH;
  const minInner = BADGE_R * 2;
  const h = BADGE_PAD_Y + Math.max(innerH, minInner) + BADGE_PAD_Y;
  return { w, h };
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

function drawClassBox(c: ClassDecl, x: number, y: number, sz: BoxSize, compact: boolean): Shape[] {
  if (compact) return drawCompactBadge(c, x, y, sz);
  const stereoLine = computeStereotypeLine(c);
  const stereoH = stereoLine ? Math.ceil(FONT_STEREO * 1.2) : 0;
  const titleH = BOX_PAD_Y + stereoH + Math.ceil(FONT_NAME * 1.2) + BOX_PAD_Y;
  const bg = c.fill ?? bgFor(c.classKind);
  const stroke = c.borderColor ?? COLOR_LINE;
  // `bold` → thicker stroke; `dashed` / `dotted` → strokeDasharray patterns.
  // `solid` (default) leaves both unset. Note: gradient fills are not rendered
  // (SVG gradients aren't trivially expressible in the Style shape) — we fall
  // back to the first color stored in `fill`.
  const strokeWidth = c.borderStyle === 'bold' ? 2 : 1;
  const strokeDasharray =
    c.borderStyle === 'dashed' ? '4,2' : c.borderStyle === 'dotted' ? '2,3' : undefined;
  const shapes: Shape[] = [];

  const boxStyle: { fill: string; stroke: string; strokeWidth: number; strokeDasharray?: string } = {
    fill: bg,
    stroke,
    strokeWidth,
  };
  if (strokeDasharray) boxStyle.strokeDasharray = strokeDasharray;
  shapes.push({
    type: 'rect',
    x, y, w: sz.w, h: sz.h,
    style: boxStyle,
  });

  // Inline `header:<color>` style fills the top strip (over the name +
  // stereotype area) before the body separator. Gradients fall back to the
  // first stop.
  if (c.headerFill) {
    shapes.push({
      type: 'rect',
      x, y, w: sz.w, h: titleH,
      style: { fill: c.headerFill, stroke: stroke, strokeWidth },
    });
  }

  // Class-level visibility marker (set by `-class Foo` / `#class Foo` etc.).
  // Drawn as a small glyph in the top-left corner of the header so the
  // existing centered name/stereotype layout is undisturbed.
  if (c.visibility && c.visibility !== 'none') {
    const glyph = VISIBILITY_GLYPH[c.visibility];
    if (glyph) {
      shapes.push({
        type: 'text',
        x: x + BOX_PAD_X,
        y: y + BOX_PAD_Y + Math.ceil(FONT_STEREO * 0.9),
        text: glyph,
        anchor: 'start',
        baseline: 'alphabetic',
        font: { family: FONT_FAMILY, size: FONT_STEREO, weight: 'bold', color: '#000' },
      });
    }
  }

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

function badgeLetterFor(c: ClassDecl): string {
  if (c.stereotype) {
    const ch = c.stereotype.trim()[0];
    if (ch) return ch.toUpperCase();
  }
  switch (c.classKind) {
    case 'class':      return 'C';
    case 'interface':  return 'I';
    case 'enum':       return 'E';
    case 'abstract':   return 'A';
    case 'annotation': return '@';
    case 'record':     return 'R';
  }
}

function badgeColorFor(kind: ClassKind): string {
  switch (kind) {
    case 'class':      return BADGE_COLOR_CLASS;
    case 'interface':  return BADGE_COLOR_INTERFACE;
    case 'enum':       return BADGE_COLOR_ENUM;
    case 'abstract':   return BADGE_COLOR_ABSTRACT;
    case 'annotation': return BADGE_COLOR_ANNOTATION;
    case 'record':     return BADGE_COLOR_RECORD;
  }
}

function drawCompactBadge(c: ClassDecl, x: number, y: number, sz: BoxSize): Shape[] {
  const shapes: Shape[] = [];
  shapes.push({
    type: 'rect',
    x, y, w: sz.w, h: sz.h,
    rx: BADGE_RADIUS, ry: BADGE_RADIUS,
    style: { fill: '#fbfbfa', stroke: COLOR_LINE, strokeWidth: 1 },
  });

  const cx = x + BADGE_PAD_X + BADGE_R;
  const cy = y + sz.h / 2;
  shapes.push({
    type: 'circle',
    cx, cy, r: BADGE_R,
    style: { fill: badgeColorFor(c.classKind), stroke: COLOR_LINE, strokeWidth: 1 },
  });
  shapes.push({
    type: 'text',
    x: cx, y: cy,
    text: badgeLetterFor(c),
    anchor: 'middle',
    baseline: 'middle',
    font: { family: FONT_FAMILY, size: BADGE_NAME_FONT - 1, weight: 'bold', color: '#fff' },
  });

  const stereoText = c.stereotype ? `«${c.stereotype}»` : '';
  const labelX = cx + BADGE_R + BADGE_GAP;
  const stereoH = stereoText ? Math.ceil(BADGE_STEREO_FONT * 1.2) : 0;
  const nameH = Math.ceil(BADGE_NAME_FONT * 1.3);
  const blockH = stereoH + nameH;
  let textY = cy - blockH / 2;

  if (stereoText) {
    textY += Math.ceil(BADGE_STEREO_FONT * 0.9);
    shapes.push({
      type: 'text',
      x: labelX, y: textY,
      text: stereoText,
      anchor: 'start',
      baseline: 'alphabetic',
      font: { family: FONT_FAMILY, size: BADGE_STEREO_FONT, style: 'italic', color: '#555' },
    });
    textY += Math.ceil(BADGE_STEREO_FONT * 0.3);
  }

  const italic = c.classKind === 'abstract' || c.classKind === 'interface';
  shapes.push({
    type: 'text',
    x: labelX, y: textY + Math.ceil(BADGE_NAME_FONT * 0.9),
    text: c.name,
    anchor: 'start',
    baseline: 'alphabetic',
    font: {
      family: FONT_FAMILY,
      size: BADGE_NAME_FONT,
      weight: italic ? 'normal' : 'bold',
      style: italic ? 'italic' : 'normal',
      color: '#000',
    },
  });

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
