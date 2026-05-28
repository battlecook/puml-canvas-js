import type {
  LabelBlock,
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
import { buildUCSkin, lookupStereotypeColor, type UCSkin } from './skin.js';
import {
  buildHandwrittenNoticeShapes,
  handwrittenNoticeHeight,
  handwrittenNoticeWidth,
} from '../common/handwritten.js';

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
// Multi-line / block labels grow taller and wider than a normal usecase. We
// use a generous minimum width since multi-line descriptions tend to wrap on
// long sentences, and a stadium / rounded-rect outline instead of an ellipse.
const UC_BLOCK_MIN_W = 200;
const UC_BLOCK_PAD_X = 14;
const UC_BLOCK_PAD_Y = 10;
const UC_BLOCK_RX = 20;
const UC_BLOCK_SEP_H = 10;
const CONTAINER_PAD = 14;
const CONTAINER_HEADER_H = 22;
const CONTAINER_LABEL_FONT = 13;

const FONT_FAMILY = 'sans-serif';
const FONT_LABEL = 12;
const EDGE_LABEL_FONT = 11;
// Stereotype line (`«Foo»`) rendered above the main label of a node. Small,
// italic, slightly muted color to match the sequence-diagram look.
const STEREO_FONT = 10;
const STEREO_LINE_H = Math.ceil(STEREO_FONT * 1.25);
const STEREO_COLOR = '#555';

const COLOR_LINE = '#222';
const COLOR_EDGE = '#444';
const COLOR_FILL_ACTOR = '#fefece';
const COLOR_FILL_UC = '#fefece';
const COLOR_CONTAINER_STROKE = '#999';

// Note (folded-corner rectangle) constants. Matches the sequence-diagram note
// palette (#FEFFDD fill, #A0A088 stroke) so multi-diagram pages share a look.
const NOTE_PAD_X = 8;
const NOTE_PAD_Y = 6;
const NOTE_FOLD = 8;
const NOTE_MIN_W = 60;
const COLOR_NOTE_FILL = '#FEFFDD';
const COLOR_NOTE_STROKE = '#A0A088';

const EDGE_STYLE: EdgeStyle = {
  color: COLOR_EDGE,
  fontFamily: FONT_FAMILY,
  labelFontSize: EDGE_LABEL_FONT,
};

export function layoutUseCase(ast: UseCaseAst): Scene {
  if (ast.nodes.length === 0) {
    return emptyScene();
  }

  // Resolve skin tokens up-front so layout can size the diagram for any
  // top-stacked decorations (handwritten notice) before placing nodes, and
  // so per-node draw helpers can pull stereotype-scoped overrides without
  // re-parsing the flat skin map.
  const skin = buildUCSkin(ast);
  const handwrittenOn = skin.handwritten === true;
  const handwrittenOffsetY = handwrittenOn ? handwrittenNoticeHeight() : 0;

  const edgeStyle: EdgeStyle = skin.arrowColor
    ? { ...EDGE_STYLE, color: skin.arrowColor, markerColor: skin.arrowColor }
    : EDGE_STYLE;

  // Attached notes (those with an anchorId) are pinned next to their anchor
  // and never participate in the sugiyama layered layout — they have no
  // relationships of their own and would only introduce orphan layers. Free
  // standing notes (kind='note' but no anchorId) stay in the main flow so
  // their `..` connectors are drawn as ordinary dashed edges.
  const attachedNotes = ast.nodes.filter((n) => n.kind === 'note' && n.anchorId);
  const attachedNoteIds = new Set(attachedNotes.map((n) => n.id));
  const flowNodes = ast.nodes.filter((n) => !attachedNoteIds.has(n.id));
  const flowAst: UseCaseAst = {
    ...ast,
    nodes: flowNodes,
  };

  const sizes = new Map(ast.nodes.map((n) => [n.id, measureNode(n)]));
  const titleHeight = ast.title ? TITLE_FONT + TITLE_GAP : 0;
  const containerTopReserve = ast.containers.length > 0
    ? CONTAINER_HEADER_H + CONTAINER_PAD
    : 0;
  // The handwritten notice (if any) sits above everything else, so it's part
  // of the top reserve for layout purposes.
  const layoutTitleHeight = titleHeight + containerTopReserve + handwrittenOffsetY;

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

  const direction: 'LR' | 'TB' = ast.direction === 'LR' ? 'LR' : 'TB';
  // Star pattern: every non-loop relationship shares a single source AND
  // carries a direction hint (`-left->`, `-up->`, …). PlantUML's reference
  // renderer pins each target to the named side of the source; sugiyama
  // can't easily express "exactly this side", so we fast-path with a
  // satellite-placement layout. Falls back to sugiyama for mixed / no-hint
  // diagrams.
  const satellite =
    nonLoops.length > 0 && allDirectionStar(nonLoops)
      ? satelliteLayout(flowAst, sizes, layoutTitleHeight, nonLoops)
      : null;
  const base = satellite
    ? satellite
    : nonLoops.length === 0
      ? gridLayout(flowAst, sizes, layoutTitleHeight)
      : layeredLayout(flowAst, sizes, layoutTitleHeight, nonLoops.map(asRel), direction);

  const extraRight = selfLoopExtraWidth(selfLoops, base.positions, sizes);
  let totalWidth = base.width + extraRight;
  let totalHeight = base.height;

  if (ast.title) {
    shapes.push({
      type: 'text',
      x: totalWidth / 2,
      y: PAGE_PAD + handwrittenOffsetY + TITLE_FONT,
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
          style: edgeStyle,
          lateralOffset: offsets.get(edge) ?? 0,
        }),
      );
    }
  }

  for (const rel of selfLoops) {
    const pos = base.positions.get(rel.source);
    const sz = sizes.get(rel.source);
    if (pos && sz) shapes.push(...drawLayeredSelfLoop(rel, pos, sz, edgeStyle));
  }

  // Pin attached notes next to their anchor's bounding box. The anchor must
  // already have a position from the main layout; otherwise we silently drop
  // the note (cleaner than rendering it at (0,0)).
  const NOTE_GAP = 12;
  for (const note of attachedNotes) {
    const anchorPos = base.positions.get(note.anchorId!);
    const anchorSz = sizes.get(note.anchorId!);
    const noteSz = sizes.get(note.id);
    if (!anchorPos || !anchorSz || !noteSz) continue;
    const side = note.anchorSide ?? 'right';
    let nx = anchorPos.x;
    let ny = anchorPos.y;
    if (side === 'right') {
      nx = anchorPos.x + anchorSz.w + NOTE_GAP;
      ny = anchorPos.y + (anchorSz.h - noteSz.h) / 2;
    } else if (side === 'left') {
      nx = anchorPos.x - noteSz.w - NOTE_GAP;
      ny = anchorPos.y + (anchorSz.h - noteSz.h) / 2;
    } else if (side === 'top') {
      nx = anchorPos.x + (anchorSz.w - noteSz.w) / 2;
      ny = anchorPos.y - noteSz.h - NOTE_GAP;
    } else {
      nx = anchorPos.x + (anchorSz.w - noteSz.w) / 2;
      ny = anchorPos.y + anchorSz.h + NOTE_GAP;
    }
    base.positions.set(note.id, { x: nx, y: ny });
    // Extend the scene bounds so the note isn't clipped at the right or
    // bottom edge of the SVG.
    if (nx + noteSz.w + PAGE_PAD > totalWidth) {
      totalWidth = nx + noteSz.w + PAGE_PAD;
    }
    if (ny + noteSz.h + PAGE_PAD > totalHeight) {
      totalHeight = ny + noteSz.h + PAGE_PAD;
    }
    if (nx < 0) {
      // A `left` anchor near the page edge can push the note past x=0. We
      // don't shift the whole scene; instead clamp to a small left pad.
      base.positions.set(note.id, { x: PAGE_PAD, y: ny });
    }
  }

  const rawActorStyle = (ast.skin?.actorstyle ?? '').toLowerCase();
  const actorStyle: ActorStyle =
    rawActorStyle === 'awesome'
      ? 'awesome'
      : rawActorStyle === 'hollow'
        ? 'hollow'
        : 'stickman';
  for (const node of ast.nodes) {
    const pos = base.positions.get(node.id);
    if (!pos) continue;
    shapes.push(...drawNode(node, pos, sizes.get(node.id)!, actorStyle, ast, skin));
  }

  // `skinparam handwritten true` — yellow notice rectangle at the top-left.
  // Built last (after total dimensions are known) so it can grow the diagram
  // width if its body is wider than the rest of the scene.
  if (handwrittenOn) {
    const need = handwrittenNoticeWidth() + PAGE_PAD * 2;
    if (need > totalWidth) totalWidth = need;
    shapes.unshift(...buildHandwrittenNoticeShapes(PAGE_PAD, PAGE_PAD));
  }

  return {
    width: totalWidth,
    height: totalHeight,
    background: skin.backgroundColor ?? '#fff',
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

/**
 * Detect a "directional star": every relationship shares a single source
 * AND carries a direction hint. We restrict the fast-path to this shape so
 * the satellite placement doesn't accidentally clobber more complex graphs.
 */
function allDirectionStar(rels: UCRelationship[]): boolean {
  if (rels.length === 0) return false;
  const src = rels[0]!.source;
  for (const r of rels) {
    if (!r.direction) return false;
    if (r.source !== src) return false;
  }
  return true;
}

/**
 * Place the source node at the center and each direction-hinted target on
 * the named side at a fixed gap. Unrelated flow nodes (those not referenced
 * by any of `rels` as either endpoint) are stacked below the star so the
 * layout stays self-contained when the diagram includes stray declarations.
 */
function satelliteLayout(
  ast: UseCaseAst,
  sizes: Map<string, BoxSize>,
  titleHeight: number,
  rels: UCRelationship[],
): BaseResult {
  const SAT_GAP = 60;
  const sourceId = rels[0]!.source;
  const sourceSz = sizes.get(sourceId);
  if (!sourceSz) {
    // Source is missing a measured size (e.g. only referenced in a note);
    // fall back to grid so we don't crash.
    return gridLayout(ast, sizes, titleHeight);
  }

  // Compute extents on each side based on satellite sizes.
  let leftW = 0;
  let rightW = 0;
  let upH = 0;
  let downH = 0;
  const targetsByDir: Record<'left' | 'right' | 'up' | 'down', string[]> = {
    left: [],
    right: [],
    up: [],
    down: [],
  };
  for (const r of rels) {
    const dir = r.direction!;
    const sz = sizes.get(r.target);
    if (!sz) continue;
    targetsByDir[dir].push(r.target);
    if (dir === 'left') leftW = Math.max(leftW, sz.w);
    else if (dir === 'right') rightW = Math.max(rightW, sz.w);
    else if (dir === 'up') upH = Math.max(upH, sz.h);
    else if (dir === 'down') downH = Math.max(downH, sz.h);
  }

  const sourceCx =
    PAGE_PAD + leftW + (leftW > 0 ? SAT_GAP : 0) + sourceSz.w / 2;
  const sourceCy =
    PAGE_PAD + titleHeight + upH + (upH > 0 ? SAT_GAP : 0) + sourceSz.h / 2;

  const positions = new Map<string, Position>();
  positions.set(sourceId, {
    x: sourceCx - sourceSz.w / 2,
    y: sourceCy - sourceSz.h / 2,
  });

  // Stagger multiple satellites on the same side along the perpendicular
  // axis so they don't overlap. Common case is one-per-side, in which case
  // the stagger is a no-op.
  const stagger = (count: number, idx: number, span: number) =>
    count === 1 ? 0 : (idx - (count - 1) / 2) * span;

  for (const dir of ['left', 'right', 'up', 'down'] as const) {
    const ids = targetsByDir[dir];
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i]!;
      const sz = sizes.get(id)!;
      let cx = sourceCx;
      let cy = sourceCy;
      if (dir === 'left') {
        cx = sourceCx - sourceSz.w / 2 - SAT_GAP - sz.w / 2;
        cy = sourceCy + stagger(ids.length, i, sz.h + 16);
      } else if (dir === 'right') {
        cx = sourceCx + sourceSz.w / 2 + SAT_GAP + sz.w / 2;
        cy = sourceCy + stagger(ids.length, i, sz.h + 16);
      } else if (dir === 'up') {
        cx = sourceCx + stagger(ids.length, i, sz.w + 16);
        cy = sourceCy - sourceSz.h / 2 - SAT_GAP - sz.h / 2;
      } else {
        cx = sourceCx + stagger(ids.length, i, sz.w + 16);
        cy = sourceCy + sourceSz.h / 2 + SAT_GAP + sz.h / 2;
      }
      positions.set(id, { x: cx - sz.w / 2, y: cy - sz.h / 2 });
    }
  }

  // Tail of any nodes not yet positioned (e.g. stray declarations with no
  // relationships) — stack them below the star so they're still visible.
  const placed = new Set(positions.keys());
  let trailingY = 0;
  for (const [id, pos] of positions) {
    const sz = sizes.get(id);
    if (!sz) continue;
    trailingY = Math.max(trailingY, pos.y + sz.h);
  }
  let cursorX = PAGE_PAD;
  for (const node of ast.nodes) {
    if (placed.has(node.id)) continue;
    const sz = sizes.get(node.id);
    if (!sz) continue;
    positions.set(node.id, { x: cursorX, y: trailingY + SAT_GAP });
    cursorX += sz.w + HORIZONTAL_GAP;
  }

  // Bounding box.
  let maxRight = 0;
  let maxBottom = 0;
  let minLeft = Infinity;
  for (const [id, pos] of positions) {
    const sz = sizes.get(id);
    if (!sz) continue;
    if (pos.x < minLeft) minLeft = pos.x;
    if (pos.x + sz.w > maxRight) maxRight = pos.x + sz.w;
    if (pos.y + sz.h > maxBottom) maxBottom = pos.y + sz.h;
  }
  // Shift everything right if a `left` satellite landed at negative x.
  if (minLeft < PAGE_PAD) {
    const dx = PAGE_PAD - minLeft;
    for (const [id, pos] of positions) {
      positions.set(id, { x: pos.x + dx, y: pos.y });
    }
    maxRight += dx;
  }

  // Build centers + drawable so the existing drawLayeredEdge path renders
  // these as straight (waypoint-less) connectors.
  const centers = new Map<string, NodeCenter>();
  for (const [id, pos] of positions) {
    const sz = sizes.get(id);
    if (!sz) continue;
    centers.set(id, { cx: pos.x + sz.w / 2, cy: pos.y + sz.h / 2 });
  }
  const drawable = rels.map((r) => ({
    fromId: r.source,
    toId: r.target,
    waypoints: [] as string[],
    rel: {
      source: r.source,
      target: r.target,
      sourceMult: '',
      targetMult: '',
      arrowToken: r.arrowToken,
      kind: 'association' as const,
      style: r.style,
      sourceMarker: r.sourceMarker,
      targetMarker: r.targetMarker,
      label: r.label,
      labelDirection: 'none' as const,
    },
  }));

  return {
    positions,
    centers,
    drawable,
    width: maxRight + PAGE_PAD,
    height: maxBottom + PAGE_PAD,
  };
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
  direction: 'TB' | 'LR' = 'TB',
): BaseResult {
  const nodeIds = ast.nodes.map((n) => n.id);
  const edges: LayoutEdge[] = buildLayoutEdges(rels);
  removeCycles(nodeIds, edges);
  const baseLayers = assignLayers(nodeIds, edges);
  const dummy = insertDummies(nodeIds, edges, baseLayers);
  const initialGroups = groupByLayer(dummy.extendedNodeIds, dummy.layers);
  const ordered = minimizeCrossings(initialGroups, dummy.segments);

  // In LR mode the rank axis runs left-to-right, so each rank is a column and
  // the per-rank extent is the column's WIDTH (max node width). In TB mode it
  // runs top-to-bottom, so each rank is a row and the per-rank extent is the
  // row's HEIGHT (max node height). Compute both branches off a shared accessor
  // so the sugiyama helpers stay direction-agnostic.
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

  // In LR mode, `assignCoordinates`'s "width" axis becomes the per-node
  // VERTICAL extent (nodes stack vertically within a column), so pass `sz.h`.
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
  const maxInLayer = coords.maxLayerWidth > 0 ? coords.maxLayerWidth : 200;

  const positions = new Map<string, Position>();
  const centers = new Map<string, NodeCenter>();

  // `rankCursor` walks along the rank axis (Y for TB, X for LR). For each
  // node, the rank-axis center is `rankCursor + rankExtent/2`; the within-
  // layer center is taken from `coords.centerX` (translated by PAGE_PAD).
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
        // TB: rank axis is Y, within-layer axis is X (legacy path).
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

/** Width of the rendered `«stereotype»` line at STEREO_FONT, or 0 if absent. */
function stereoWidth(node: UCNode): number {
  if (!node.stereotype) return 0;
  return measureText(`«${node.stereotype}»`, STEREO_FONT).width;
}

function measureNode(node: UCNode): BoxSize {
  if (node.kind === 'actor') {
    const labelW = measureText(node.name, FONT_LABEL).width;
    const sw = stereoWidth(node);
    const w = Math.max(ACTOR_BOX_W, labelW + 8, sw + 8);
    const h = ACTOR_BOX_H + (node.stereotype ? STEREO_LINE_H : 0);
    return { w, h };
  }
  if (node.kind === 'note') {
    const lines = (node.text ?? node.name).split('\n');
    let maxLineW = 0;
    let totalH = 0;
    const lineH = FONT_LABEL * 1.25;
    for (const ln of lines) {
      const m = measureText(ln, FONT_LABEL);
      if (m.width > maxLineW) maxLineW = m.width;
      totalH += lineH;
    }
    return {
      w: Math.max(NOTE_MIN_W, maxLineW + NOTE_PAD_X * 2),
      h: totalH + NOTE_PAD_Y * 2,
    };
  }
  if (node.labelBlocks && node.labelBlocks.length > 0) {
    return measureBlocks(node.labelBlocks);
  }
  const labelW = measureText(node.name, FONT_LABEL).width;
  const labelH = measureText(node.name, FONT_LABEL).height;
  const sw = stereoWidth(node);
  // Ellipse grows in BOTH width and height to keep the stereotype inside.
  // Use slightly more width padding since elliptical curvature eats horizontal
  // space near the top.
  const stereoExtraH = node.stereotype ? STEREO_LINE_H : 0;
  return {
    w: Math.max(UC_MIN_W, labelW + UC_PAD_X * 2, sw + UC_PAD_X * 2),
    h: Math.max(UC_MIN_H, labelH + UC_PAD_Y * 2) + stereoExtraH,
  };
}

function measureBlocks(blocks: LabelBlock[]): BoxSize {
  let maxLineW = 0;
  let totalH = 0;
  for (const b of blocks) {
    if (b.kind === 'text') {
      const m = measureText(b.text, FONT_LABEL);
      if (m.width > maxLineW) maxLineW = m.width;
      totalH += m.height;
    } else if (b.kind === 'sep-titled') {
      const m = measureText(b.text, FONT_LABEL);
      if (m.width > maxLineW) maxLineW = m.width;
      totalH += UC_BLOCK_SEP_H + m.height;
    } else {
      totalH += UC_BLOCK_SEP_H;
    }
  }
  return {
    w: Math.max(UC_BLOCK_MIN_W, maxLineW + UC_BLOCK_PAD_X * 2),
    h: totalH + UC_BLOCK_PAD_Y * 2,
  };
}

type ActorStyle = 'stickman' | 'awesome' | 'hollow';

const COLOR_AWESOME_FILL = '#E0E0E0';
const COLOR_AWESOME_STROKE = '#888';

/**
 * Pull the resolved per-node visual tokens out of the skin map. Stereotype
 * scope wins over the default for each property that's set. Returns
 * `undefined`-filled tokens when nothing is configured so callers can fall
 * back to their hard-coded defaults.
 */
interface NodeStyleTokens {
  fill?: string;
  stroke?: string;
  fontFamily?: string;
}

function resolveUsecaseTokens(
  node: UCNode,
  ast: UseCaseAst,
  skin: UCSkin,
): NodeStyleTokens {
  const tokens: NodeStyleTokens = {};
  const fill = lookupStereotypeColor(ast, 'backgroundcolor', node.stereotype) ?? skin.backgroundColor;
  if (fill) tokens.fill = fill;
  const stroke = lookupStereotypeColor(ast, 'bordercolor', node.stereotype) ?? skin.borderColor;
  if (stroke) tokens.stroke = stroke;
  return tokens;
}

function resolveActorTokens(
  node: UCNode,
  ast: UseCaseAst,
  skin: UCSkin,
): NodeStyleTokens {
  const tokens: NodeStyleTokens = {};
  const fill = lookupStereotypeColor(ast, 'actorbackgroundcolor', node.stereotype) ?? skin.actorBackgroundColor;
  if (fill) tokens.fill = fill;
  const stroke = lookupStereotypeColor(ast, 'actorbordercolor', node.stereotype) ?? skin.actorBorderColor;
  if (stroke) tokens.stroke = stroke;
  if (skin.actorFontName) tokens.fontFamily = skin.actorFontName;
  return tokens;
}

function drawNode(
  node: UCNode,
  pos: Position,
  sz: BoxSize,
  actorStyle: ActorStyle,
  ast: UseCaseAst,
  skin: UCSkin,
): Shape[] {
  if (node.kind === 'actor') {
    // Reserve `STEREO_LINE_H` at the top of the box for the stereotype line,
    // then draw the stick figure / label in the remaining lower area as
    // before. This way the figure geometry stays identical to the no-
    // stereotype case (no spurious shifts in regression snapshots).
    const stereoH = node.stereotype ? STEREO_LINE_H : 0;
    const figPos = { x: pos.x, y: pos.y + stereoH };
    const figSz = { w: sz.w, h: sz.h - stereoH };
    const tokens = resolveActorTokens(node, ast, skin);
    const shapes: Shape[] =
      actorStyle === 'awesome'
        ? drawActorAwesome(node.name, figPos, figSz, tokens)
        : actorStyle === 'hollow'
          ? drawActorHollow(node.name, figPos, figSz, tokens)
          : drawActor(node.name, figPos, figSz, tokens);
    if (node.stereotype) {
      shapes.unshift(makeStereotypeText(node.stereotype, pos.x + sz.w / 2, pos.y));
    }
    if (node.business) {
      shapes.push(drawBusinessMarkerActor(figPos, figSz, actorStyle, tokens));
    }
    return shapes;
  }
  if (node.kind === 'note') {
    return drawUsecaseNote(node.text ?? node.name, pos, sz);
  }
  const tokens = resolveUsecaseTokens(node, ast, skin);
  if (node.labelBlocks && node.labelBlocks.length > 0) {
    const shapes = drawUsecaseBlocks(node.labelBlocks, pos, sz);
    if (node.business) shapes.push(drawBusinessMarkerRect(pos, sz, tokens));
    return shapes;
  }
  const shapes = drawUsecase(node.name, pos, sz, node.stereotype, tokens);
  if (node.business) {
    // Insert the chord right after the ellipse so it sits on top of the fill
    // but below the label text. The ellipse is the first shape produced by
    // drawUsecase, so index 1 is where the marker belongs.
    shapes.splice(1, 0, drawBusinessMarkerEllipse(pos, sz, tokens));
  }
  return shapes;
}

/**
 * Vertical chord inside the use-case ellipse on the LEFT side, marking it
 * as a "business" use case per PlantUML's `(Foo)/` / `usecase/` shorthand.
 *
 * The chord sits at `x = cx - rx * 0.6` (60% of the horizontal radius left
 * of center). Substituting into the ellipse equation
 * `(x-cx)²/rx² + (y-cy)²/ry² = 1` with `(x-cx)/rx = -0.6` gives
 * `(y-cy)/ry = ±sqrt(1 - 0.36) = ±0.8`, so the chord runs from
 * `y = cy - ry*0.8` to `y = cy + ry*0.8`.
 */
function drawBusinessMarkerEllipse(pos: Position, sz: BoxSize, tokens: NodeStyleTokens): Shape {
  const cx = pos.x + sz.w / 2;
  const cy = pos.y + sz.h / 2;
  const rx = sz.w / 2;
  const ry = sz.h / 2;
  const x = cx - rx * 0.6;
  const dy = ry * 0.8;
  return {
    type: 'line',
    x1: x,
    y1: cy - dy,
    x2: x,
    y2: cy + dy,
    style: { stroke: tokens.stroke ?? COLOR_LINE, strokeWidth: 1 },
  };
}

/**
 * Business marker for the multi-block (stadium rect) usecase variant. We
 * draw a near-left vertical line that spans the rect's inner height. The
 * x position mirrors the ellipse case (60% of half-width inset from center).
 */
function drawBusinessMarkerRect(pos: Position, sz: BoxSize, tokens: NodeStyleTokens): Shape {
  const x = pos.x + sz.w * 0.2;
  return {
    type: 'line',
    x1: x,
    y1: pos.y + 4,
    x2: x,
    y2: pos.y + sz.h - 4,
    style: { stroke: tokens.stroke ?? COLOR_LINE, strokeWidth: 1 },
  };
}

/**
 * Business-actor marker — a short diagonal slash drawn at the bottom-right
 * of the stick figure (or torso, for the awesome silhouette) to mirror
 * PlantUML's `actor/` / `:Foo:/` rendering. The slash uses the same stroke
 * color as the rest of the actor and lives entirely within the actor's
 * reserved box so it doesn't perturb the surrounding layout.
 *
 * For the stickman/hollow styles, the figure spans roughly y ∈ [figureTop,
 * figureTop+44]. We anchor the slash near the right foot tip at
 * (cx + 9, figureTop + 44) and extend down-right by ~10px. For the awesome
 * silhouette the torso bottom-right corner sits at (cx + 13, torsoY + 22);
 * we anchor there instead.
 */
function drawBusinessMarkerActor(
  pos: Position,
  sz: BoxSize,
  actorStyle: ActorStyle,
  tokens: NodeStyleTokens,
): Shape {
  const cx = pos.x + sz.w / 2;
  let x1: number;
  let y1: number;
  if (actorStyle === 'awesome') {
    // figureTop = pos.y + 2; head bottom is at figureTop + 2*headR;
    // torsoY = headCy + headR - 2 = figureTop + 3*headR - 2.
    const figureTop = pos.y + 2;
    const headR = 10;
    const torsoH = 22;
    const torsoY = figureTop + 3 * headR - 2;
    x1 = cx + 13;
    y1 = torsoY + torsoH - 4;
  } else {
    // Stickman/hollow share the same overall foot position at figureTop + 44.
    const figureTop = pos.y + 4;
    x1 = cx + 9;
    y1 = figureTop + 44;
  }
  // Short diagonal slash extending down-right by ~10px.
  const len = 10;
  return {
    type: 'line',
    x1,
    y1,
    x2: x1 + len,
    y2: y1 + len,
    style: { stroke: tokens.stroke ?? COLOR_LINE, strokeWidth: 1 },
  };
}

/**
 * Small italic `«stereotype»` text shape sitting above a node's main label.
 * The baseline is positioned so the glyphs occupy the top STEREO_LINE_H
 * pixels of the caller's reserved strip starting at `topY`.
 */
function makeStereotypeText(stereotype: string, cx: number, topY: number): Shape {
  return {
    type: 'text',
    x: cx,
    y: topY + STEREO_FONT,
    text: `«${stereotype}»`,
    anchor: 'middle',
    baseline: 'alphabetic',
    font: {
      family: FONT_FAMILY,
      size: STEREO_FONT,
      style: 'italic',
      color: STEREO_COLOR,
    },
  };
}

/**
 * Folded-corner rectangle for use-case diagram notes. Renders the standard
 * PlantUML "post-it" look: a light-yellow rect with the top-right corner
 * dog-eared. Multi-line bodies (split on `\n`) stack vertically inside.
 */
function drawUsecaseNote(text: string, pos: Position, sz: BoxSize): Shape[] {
  const shapes: Shape[] = [];
  const x = pos.x;
  const y = pos.y;
  const w = sz.w;
  const h = sz.h;
  const noteStyle = { fill: COLOR_NOTE_FILL, stroke: COLOR_NOTE_STROKE, strokeWidth: 1 };
  const foldStyle = { fill: 'none', stroke: COLOR_NOTE_STROKE, strokeWidth: 1 };
  shapes.push({
    type: 'polygon',
    points: [
      [x, y],
      [x + w - NOTE_FOLD, y],
      [x + w, y + NOTE_FOLD],
      [x + w, y + h],
      [x, y + h],
    ],
    style: noteStyle,
  });
  shapes.push({
    type: 'polyline',
    points: [
      [x + w - NOTE_FOLD, y],
      [x + w - NOTE_FOLD, y + NOTE_FOLD],
      [x + w, y + NOTE_FOLD],
    ],
    style: foldStyle,
  });
  const lines = text.split('\n');
  const lineH = FONT_LABEL * 1.25;
  for (let i = 0; i < lines.length; i++) {
    shapes.push({
      type: 'text',
      x: x + NOTE_PAD_X,
      y: y + NOTE_PAD_Y + FONT_LABEL * 0.9 + i * lineH,
      text: lines[i]!,
      anchor: 'start',
      baseline: 'alphabetic',
      font: { family: FONT_FAMILY, size: FONT_LABEL, color: '#000' },
    });
  }
  return shapes;
}

function drawActor(name: string, pos: Position, sz: BoxSize, tokens: NodeStyleTokens = {}): Shape[] {
  const cx = pos.x + sz.w / 2;
  const figureTop = pos.y + 4;
  const strokeColor = tokens.stroke ?? COLOR_LINE;
  const stroke = { stroke: strokeColor, strokeWidth: 1 };
  const headFill = tokens.fill ?? COLOR_FILL_ACTOR;
  const fontFam = tokens.fontFamily ?? FONT_FAMILY;
  return [
    { type: 'circle', cx, cy: figureTop + 6, r: 6, style: { fill: headFill, ...stroke } },
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
      font: { family: fontFam, size: FONT_LABEL, color: '#000' },
    },
  ];
}

/**
 * `skinparam actorStyle awesome` silhouette: a filled gray head circle sitting
 * on top of a filled "torso" (rounded-top rectangle). Head radius and torso
 * dimensions are tuned so the figure's total vertical footprint matches the
 * stickman variant (ACTOR_BOX_H ≈ 64px including the label below), keeping
 * the layout math unchanged.
 */
function drawActorAwesome(name: string, pos: Position, sz: BoxSize, tokens: NodeStyleTokens = {}): Shape[] {
  const cx = pos.x + sz.w / 2;
  const figureTop = pos.y + 2;
  const headR = 10;
  const headCy = figureTop + headR;
  const torsoW = 26;
  const torsoH = 22;
  const torsoX = cx - torsoW / 2;
  // Overlap top of torso with bottom of head by ~2px so they merge visually.
  const torsoY = headCy + headR - 2;
  const fillStroke = {
    fill: tokens.fill ?? COLOR_AWESOME_FILL,
    stroke: tokens.stroke ?? COLOR_AWESOME_STROKE,
    strokeWidth: 1,
  };
  const fontFam = tokens.fontFamily ?? FONT_FAMILY;
  return [
    { type: 'circle', cx, cy: headCy, r: headR, style: fillStroke },
    {
      type: 'rect',
      x: torsoX,
      y: torsoY,
      w: torsoW,
      h: torsoH,
      rx: torsoW / 2,
      ry: torsoW / 2,
      style: fillStroke,
    },
    {
      type: 'text',
      x: cx,
      y: pos.y + sz.h - 4,
      text: name,
      anchor: 'middle',
      baseline: 'alphabetic',
      font: { family: fontFam, size: FONT_LABEL, color: '#000' },
    },
  ];
}

/**
 * `skinparam actorStyle Hollow` stick-figure variant: same overall layout as
 * the default stickman, but with a larger empty (white-filled) head and
 * slightly thicker body/arm/leg strokes. ACTOR_BOX_H stays unchanged so the
 * surrounding layout math is unaffected.
 */
function drawActorHollow(name: string, pos: Position, sz: BoxSize, tokens: NodeStyleTokens = {}): Shape[] {
  const cx = pos.x + sz.w / 2;
  const figureTop = pos.y + 2;
  const headR = 9;
  const headCy = figureTop + headR;
  const strokeColor = tokens.stroke ?? COLOR_LINE;
  const stroke = { stroke: strokeColor, strokeWidth: 1.5 };
  const bodyTop = headCy + headR;
  const bodyBottom = bodyTop + 18;
  const fontFam = tokens.fontFamily ?? FONT_FAMILY;
  return [
    {
      type: 'circle',
      cx,
      cy: headCy,
      r: headR,
      style: { fill: tokens.fill ?? '#FFFFFF', ...stroke },
    },
    { type: 'line', x1: cx, y1: bodyTop, x2: cx, y2: bodyBottom, style: stroke },
    {
      type: 'line',
      x1: cx - 12,
      y1: bodyTop + 6,
      x2: cx + 12,
      y2: bodyTop + 6,
      style: stroke,
    },
    {
      type: 'line',
      x1: cx,
      y1: bodyBottom,
      x2: cx - 9,
      y2: bodyBottom + 12,
      style: stroke,
    },
    {
      type: 'line',
      x1: cx,
      y1: bodyBottom,
      x2: cx + 9,
      y2: bodyBottom + 12,
      style: stroke,
    },
    {
      type: 'text',
      x: cx,
      y: pos.y + sz.h - 4,
      text: name,
      anchor: 'middle',
      baseline: 'alphabetic',
      font: { family: fontFam, size: FONT_LABEL, color: '#000' },
    },
  ];
}

function drawUsecase(name: string, pos: Position, sz: BoxSize, stereotype?: string, tokens: NodeStyleTokens = {}): Shape[] {
  const cx = pos.x + sz.w / 2;
  const cy = pos.y + sz.h / 2;
  const shapes: Shape[] = [
    {
      type: 'ellipse',
      cx,
      cy,
      rx: sz.w / 2,
      ry: sz.h / 2,
      style: { fill: tokens.fill ?? COLOR_FILL_UC, stroke: tokens.stroke ?? COLOR_LINE, strokeWidth: 1 },
    },
  ];
  if (stereotype) {
    // Stereotype line sits above the main label, both centered horizontally
    // and slightly biased above center vertically so they share the visual
    // middle band of the ellipse.
    shapes.push({
      type: 'text',
      x: cx,
      y: cy - STEREO_LINE_H / 2,
      text: `«${stereotype}»`,
      anchor: 'middle',
      baseline: 'middle',
      font: {
        family: FONT_FAMILY,
        size: STEREO_FONT,
        style: 'italic',
        color: STEREO_COLOR,
      },
    });
    shapes.push({
      type: 'text',
      x: cx,
      y: cy + STEREO_LINE_H / 2,
      text: name,
      anchor: 'middle',
      baseline: 'middle',
      font: { family: FONT_FAMILY, size: FONT_LABEL, color: '#000' },
    });
    return shapes;
  }
  shapes.push({
    type: 'text',
    x: cx,
    y: cy,
    text: name,
    anchor: 'middle',
    baseline: 'middle',
    font: { family: FONT_FAMILY, size: FONT_LABEL, color: '#000' },
  });
  return shapes;
}

/**
 * Draws a multi-block usecase: a stadium / rounded-rect outline with text
 * rows and horizontal separator lines stacked vertically inside. The shape
 * choice (rounded rect, not ellipse) matches PlantUML's behavior when the
 * usecase label spans multiple lines.
 */
function drawUsecaseBlocks(blocks: LabelBlock[], pos: Position, sz: BoxSize): Shape[] {
  const shapes: Shape[] = [];
  const cx = pos.x + sz.w / 2;
  const lineHeight = FONT_LABEL * 1.25;
  const innerLeft = pos.x + UC_BLOCK_PAD_X / 2;
  const innerRight = pos.x + sz.w - UC_BLOCK_PAD_X / 2;
  shapes.push({
    type: 'rect',
    x: pos.x,
    y: pos.y,
    w: sz.w,
    h: sz.h,
    rx: UC_BLOCK_RX,
    ry: UC_BLOCK_RX,
    style: { fill: COLOR_FILL_UC, stroke: COLOR_LINE, strokeWidth: 1 },
  });
  let y = pos.y + UC_BLOCK_PAD_Y;
  for (const b of blocks) {
    if (b.kind === 'text') {
      const lines = b.text.split('\n');
      for (const ln of lines) {
        shapes.push({
          type: 'text',
          x: cx,
          y: y + lineHeight * 0.8,
          text: ln,
          anchor: 'middle',
          baseline: 'alphabetic',
          font: { family: FONT_FAMILY, size: FONT_LABEL, color: '#000' },
        });
        y += lineHeight;
      }
    } else if (b.kind === 'sep-solid') {
      const yLine = y + UC_BLOCK_SEP_H / 2;
      shapes.push({
        type: 'line',
        x1: innerLeft,
        y1: yLine,
        x2: innerRight,
        y2: yLine,
        style: { stroke: COLOR_LINE, strokeWidth: 1 },
      });
      y += UC_BLOCK_SEP_H;
    } else if (b.kind === 'sep-double') {
      const yLine = y + UC_BLOCK_SEP_H / 2;
      shapes.push({
        type: 'line',
        x1: innerLeft,
        y1: yLine,
        x2: innerRight,
        y2: yLine,
        style: { stroke: COLOR_LINE, strokeWidth: 2 },
      });
      y += UC_BLOCK_SEP_H;
    } else if (b.kind === 'sep-dotted') {
      const yLine = y + UC_BLOCK_SEP_H / 2;
      shapes.push({
        type: 'line',
        x1: innerLeft,
        y1: yLine,
        x2: innerRight,
        y2: yLine,
        style: { stroke: COLOR_LINE, strokeWidth: 1, strokeDasharray: '2,3' },
      });
      y += UC_BLOCK_SEP_H;
    } else if (b.kind === 'sep-titled') {
      const yLine = y + UC_BLOCK_SEP_H / 2;
      shapes.push({
        type: 'line',
        x1: innerLeft,
        y1: yLine,
        x2: innerRight,
        y2: yLine,
        style: { stroke: COLOR_LINE, strokeWidth: 1, strokeDasharray: '2,3' },
      });
      // Centered title sits just above the dotted line.
      shapes.push({
        type: 'text',
        x: cx,
        y: yLine - 2,
        text: b.text,
        anchor: 'middle',
        baseline: 'alphabetic',
        font: { family: FONT_FAMILY, size: FONT_LABEL, color: '#000' },
      });
      y += UC_BLOCK_SEP_H + lineHeight;
    }
  }
  return shapes;
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
