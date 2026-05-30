import type {
  LabelBlock,
  NoteSide,
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
import { layoutKvTree } from '../json/index.js';

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
// Multi-line / block labels grow taller and wider than a normal usecase. The
// outline is still an ellipse (matching PlantUML), but its rx/ry are inflated
// so the content's bounding box fits inside the inscribed rectangle of the
// ellipse — that is, `rx = innerW * sqrt(2)/2 + pad`, `ry = innerH * sqrt(2)/2
// + pad`. UC_BLOCK_MIN_W keeps short multi-line labels visually balanced.
const UC_BLOCK_MIN_W = 200;
const UC_BLOCK_PAD_X = 14;
const UC_BLOCK_PAD_Y = 10;
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
// Attached-note speech-bubble tail: the tip protrudes ~10 px from the note's
// edge toward the anchor, and the tail's base on the edge spans `NOTE_TAIL_HALF
// × 2` ≈ 10 px.
const NOTE_TAIL_TIP = 10;
const NOTE_TAIL_HALF = 5;
const NOTE_MIN_W = 60;
// Maximum rendered text width (in px) for a single note line before it is
// auto-wrapped on word boundaries by `wrapNoteText`. Matches the wrap behavior
// PlantUML's reference renderer applies so long note bodies render as a
// compact multi-line block instead of one runaway line. Lines split explicitly
// with `\n` are preserved verbatim; only over-long single lines auto-wrap.
const MAX_NOTE_W = 180;
const COLOR_NOTE_FILL = '#FEFFDD';
const COLOR_NOTE_STROKE = '#A0A088';

const EDGE_STYLE: EdgeStyle = {
  color: COLOR_EDGE,
  fontFamily: FONT_FAMILY,
  labelFontSize: EDGE_LABEL_FONT,
};

export function layoutUseCase(ast: UseCaseAst): Scene {
  if (ast.nodes.length === 0) {
    // No actors/usecases declared — but `allowmixing` may have produced
    // standalone `json NAME { ... }` blocks. Render those alone (stacked
    // vertically with the standard page padding) so the diagram isn't
    // silently empty.
    if (ast.jsonNodes && ast.jsonNodes.length > 0) {
      return layoutJsonOnlyScene(ast.jsonNodes);
    }
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

  // Push "external" nodes (referenced inside a container's relationships but
  // declared OUTSIDE — e.g. pre-declared `actor customer` referenced via
  // `customer -- (checkout)` inside `rectangle checkout {…}`) clear of the
  // boundary box. The sugiyama layout would otherwise lay them out in the
  // same column as the in-container members and slot them visually INSIDE
  // the rectangle. We shift their position along the rank axis (X in LR,
  // Y in TB) just past the container edge plus a small gap, then translate
  // the WHOLE scene if eviction pushed anything past x=0 / y=0 so the diagram
  // still anchors at PAGE_PAD on every side.
  evictExternalNodesFromContainers(ast, base.positions, sizes, direction);
  normalizeOrigin(base.positions, sizes, base.centers);

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

  // External nodes may now sit past the canvas's right/bottom edge after the
  // shift; grow the scene to include them with the usual page padding.
  for (const node of ast.nodes) {
    const pos = base.positions.get(node.id);
    const sz = sizes.get(node.id);
    if (!pos || !sz) continue;
    if (pos.x + sz.w + PAGE_PAD > totalWidth) totalWidth = pos.x + sz.w + PAGE_PAD;
    if (pos.y + sz.h + PAGE_PAD > totalHeight) totalHeight = pos.y + sz.h + PAGE_PAD;
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
            // Inline `#<styleBlock>` overrides — passed through verbatim so
            // `drawLayeredEdge`'s `resolveLineStyle` can pick the dasharray
            // and stroke width, and the label text picks up its colour.
            ...(ucRel.lineColor !== undefined ? { lineColor: ucRel.lineColor } : {}),
            ...(ucRel.lineStyle !== undefined ? { lineStyle: ucRel.lineStyle } : {}),
            ...(ucRel.textColor !== undefined ? { textColor: ucRel.textColor } : {}),
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

  // Honour both the nested form (`skinparam usecase { actorStyle awesome }`,
  // stored as `usecase.actorstyle`) and the top-level one-liner.
  const rawActorStyle = (ast.skin?.['usecase.actorstyle'] ?? ast.skin?.actorstyle ?? '').toLowerCase();
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

  // Embedded `json NAME { ... }` blocks introduced by `allowmixing`. Each
  // block renders as a standalone key/value tree (the same primitive used
  // by the dedicated `@startjson` diagram) and is translated into a fresh
  // strip below the existing content. We rely on the shared `layoutKvTree`
  // helper for the table geometry rather than duplicating row-measurement
  // here.
  const JSON_BLOCK_GAP = 24;
  if (ast.jsonNodes && ast.jsonNodes.length > 0) {
    let jsonCursorY = totalHeight - PAGE_PAD + JSON_BLOCK_GAP;
    for (const jn of ast.jsonNodes) {
      const jsonScene = layoutKvTree({
        title: '',
        data: jn.data,
        highlights: [],
        parseError: jn.parseError ?? '',
        errorLabel: 'JSON parse error',
      });
      shapes.push({
        type: 'group',
        transform: `translate(${PAGE_PAD},${jsonCursorY})`,
        children: jsonScene.children,
      });
      const blockBottom = jsonCursorY + jsonScene.height;
      const blockRight = PAGE_PAD + jsonScene.width;
      if (blockRight + PAGE_PAD > totalWidth) totalWidth = blockRight + PAGE_PAD;
      if (blockBottom + PAGE_PAD > totalHeight) totalHeight = blockBottom + PAGE_PAD;
      jsonCursorY = blockBottom + JSON_BLOCK_GAP;
    }
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

/**
 * If any node sits past the left/top edge of the canvas after `eviction`,
 * translate the WHOLE scene (positions + edge waypoint centers) so the
 * leftmost / topmost node lands at PAGE_PAD. This keeps the diagram inside
 * the SVG viewBox without distorting the relative geometry the layered
 * layout produced.
 *
 * Safe no-op when nothing crosses the boundary.
 */
function normalizeOrigin(
  positions: Map<string, Position>,
  sizes: Map<string, BoxSize>,
  centers: Map<string, NodeCenter> | undefined,
): void {
  let minX = Infinity;
  let minY = Infinity;
  for (const [id, pos] of positions) {
    const sz = sizes.get(id);
    if (!sz) continue;
    if (pos.x < minX) minX = pos.x;
    if (pos.y < minY) minY = pos.y;
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return;
  const dx = minX < PAGE_PAD ? PAGE_PAD - minX : 0;
  const dy = minY < PAGE_PAD ? PAGE_PAD - minY : 0;
  if (dx === 0 && dy === 0) return;
  for (const [id, pos] of positions) {
    positions.set(id, { x: pos.x + dx, y: pos.y + dy });
  }
  if (centers) {
    for (const [id, c] of centers) {
      centers.set(id, { cx: c.cx + dx, cy: c.cy + dy });
    }
  }
}

/**
 * Slide nodes that participate in a container's relationships but are NOT
 * members of any container clear of the boundary box.
 *
 * The sugiyama layered layout treats actors and use cases uniformly and packs
 * them into adjacent columns/rows, so a pre-declared external (e.g. `actor
 * customer` referenced inside `rectangle checkout { customer -- (checkout) }`)
 * lands inside the rectangle's bounding box even though it isn't a member.
 *
 * For each container we compute the current member bbox; every external node
 * connected to a member is shifted past the container edge by `EVICTION_GAP`,
 * choosing the side (left/right in LR, top/bottom in TB) by which half of the
 * container the external currently sits in. We translate position only —
 * sizes and edge waypoint centers are unchanged, so edges still terminate
 * cleanly on the moved node's rect via `drawLayeredEdge`'s end-clipping.
 *
 * No-ops when there are no containers, no externals, or when the external is
 * already clear of the container's bbox along the rank axis.
 */
function evictExternalNodesFromContainers(
  ast: UseCaseAst,
  positions: Map<string, Position>,
  sizes: Map<string, BoxSize>,
  direction: 'TB' | 'LR',
): void {
  if (ast.containers.length === 0) return;
  const memberOfAny = new Set<string>();
  for (const c of ast.containers) {
    for (const id of c.childIds) memberOfAny.add(id);
  }
  const EVICTION_GAP = HORIZONTAL_GAP;

  for (const container of ast.containers) {
    const memberSet = new Set(container.childIds);
    if (memberSet.size === 0) continue;
    const bbox = childBoundingBox(container.childIds, positions, sizes);
    if (!bbox) continue;
    // Collect externals connected to at least one member of this container.
    const externals = new Set<string>();
    for (const rel of ast.relationships) {
      const sIn = memberSet.has(rel.source);
      const tIn = memberSet.has(rel.target);
      if (sIn && !tIn && !memberOfAny.has(rel.target)) externals.add(rel.target);
      if (tIn && !sIn && !memberOfAny.has(rel.source)) externals.add(rel.source);
    }
    if (externals.size === 0) continue;

    const cCenterX = (bbox.minX + bbox.maxX) / 2;
    const cCenterY = (bbox.minY + bbox.maxY) / 2;

    for (const id of externals) {
      const pos = positions.get(id);
      const sz = sizes.get(id);
      if (!pos || !sz) continue;
      const cx = pos.x + sz.w / 2;
      const cy = pos.y + sz.h / 2;
      if (direction === 'LR') {
        // Already clear of the container along the X axis? Leave it alone.
        const overlapsX = pos.x + sz.w > bbox.minX && pos.x < bbox.maxX;
        if (!overlapsX) continue;
        if (cx <= cCenterX) {
          positions.set(id, { x: bbox.minX - EVICTION_GAP - sz.w, y: pos.y });
        } else {
          positions.set(id, { x: bbox.maxX + EVICTION_GAP, y: pos.y });
        }
      } else {
        const overlapsY = pos.y + sz.h > bbox.minY && pos.y < bbox.maxY;
        if (!overlapsY) continue;
        if (cy <= cCenterY) {
          positions.set(id, { x: pos.x, y: bbox.minY - EVICTION_GAP - sz.h });
        } else {
          positions.set(id, { x: pos.x, y: bbox.maxY + EVICTION_GAP });
        }
      }
    }
  }
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
    // Labels with embedded `\n` render as stacked rows BELOW the figure, so
    // grow the actor's reserved box by one line-height per extra row to
    // keep the surrounding layout from clipping the lower rows.
    const lineCount = node.name.split('\n').length;
    const extraLabelH = (lineCount - 1) * Math.ceil(FONT_LABEL * 1.25);
    const h = ACTOR_BOX_H + (node.stereotype ? STEREO_LINE_H : 0) + extraLabelH;
    return { w, h };
  }
  if (node.kind === 'note') {
    // Auto-wrap each explicit line so over-long single-line bodies render as
    // a compact multi-line block (matches PlantUML). The wrap is keyed to
    // MAX_NOTE_W so the measured width here matches what `drawUsecaseNote`
    // will later lay out.
    const wrapped = wrapNoteText(node.text ?? node.name);
    const lines = wrapped.split('\n');
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

/**
 * Compute the bounding-box dimensions of the rendered block content (text rows
 * and separators stacked vertically). Pure content size — no padding.
 */
function contentBlockSize(blocks: LabelBlock[]): BoxSize {
  let maxLineW = 0;
  let totalH = 0;
  for (const b of blocks) {
    if (b.kind === 'text') {
      // Per-line measurement so the widest individual line wins, not the
      // joined paragraph width.
      const lines = b.text.split('\n');
      for (const ln of lines) {
        const m = measureText(ln, FONT_LABEL);
        if (m.width > maxLineW) maxLineW = m.width;
        totalH += m.height;
      }
    } else if (b.kind === 'sep-titled') {
      const m = measureText(b.text, FONT_LABEL);
      if (m.width > maxLineW) maxLineW = m.width;
      totalH += UC_BLOCK_SEP_H + m.height;
    } else {
      totalH += UC_BLOCK_SEP_H;
    }
  }
  return { w: maxLineW, h: totalH };
}

/**
 * Size the ellipse that hosts a multi-block usecase label. The content
 * bounding box (`innerW × innerH`) must fit inside the ellipse's inscribed
 * rectangle, which requires `rx = innerW * sqrt(2)/2` and `ry = innerH *
 * sqrt(2)/2`. We add `UC_BLOCK_PAD_*` so the text isn't flush with the curve
 * and clamp to `UC_BLOCK_MIN_W` for very short labels.
 */
function measureBlocks(blocks: LabelBlock[]): BoxSize {
  const inner = contentBlockSize(blocks);
  const SQRT2 = Math.SQRT2;
  const rawW = inner.w * SQRT2 + UC_BLOCK_PAD_X * 2;
  const rawH = inner.h * SQRT2 + UC_BLOCK_PAD_Y * 2;
  return {
    w: Math.max(UC_BLOCK_MIN_W, rawW),
    h: rawH,
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
  /**
   * `strokeDasharray` resolved from a per-node inline `lineStyle`
   * (`dashed` -> `4,2`, `dotted` -> `2,3`). Absent for solid / bold.
   */
  strokeDasharray?: string;
  /**
   * Stroke width override from `lineStyle === 'bold'`. Absent otherwise so
   * per-shape defaults (1, 1.5) still apply.
   */
  strokeWidth?: number;
  /**
   * Label colour override from the inline `text:<color>` token. Layout
   * substitutes this for the hard-coded `#000` label fill when set.
   */
  textColor?: string;
}

/**
 * Translate a node-level `lineStyle` into the matching `strokeDasharray` /
 * `strokeWidth` pair, mirroring the relationship-edge convention used by
 * `drawLayeredEdge` (and the same as state/container nested-style maps).
 * Returns an empty object for `'solid'` / `undefined` so callers can spread
 * the result without overwriting their per-shape defaults.
 */
function lineStyleToStrokeAttrs(
  lineStyle?: 'solid' | 'dashed' | 'dotted' | 'bold',
): { strokeDasharray?: string; strokeWidth?: number } {
  if (lineStyle === 'bold') return { strokeWidth: 2 };
  if (lineStyle === 'dashed') return { strokeDasharray: '4,2' };
  if (lineStyle === 'dotted') return { strokeDasharray: '2,3' };
  return {};
}

function resolveUsecaseTokens(
  node: UCNode,
  ast: UseCaseAst,
  skin: UCSkin,
): NodeStyleTokens {
  const tokens: NodeStyleTokens = {};
  // Ellipse fill comes from the `skinparam usecase { BackgroundColor X }`
  // nested key (stored as `usecase.backgroundcolor`, or
  // `usecase.backgroundcolor<<stereo>>` for scoped overrides). We do NOT
  // fall back to `skin.backgroundColor` — that's the page canvas.
  const fill = lookupStereotypeColor(ast, 'backgroundcolor', node.stereotype) ?? skin.usecaseBackgroundColor;
  if (fill) tokens.fill = fill;
  const stroke = lookupStereotypeColor(ast, 'bordercolor', node.stereotype) ?? skin.borderColor;
  if (stroke) tokens.stroke = stroke;
  // Inline `#<styleBlock>` overrides on the declaration line win over both
  // the skin map and any stereotype-scoped colour.
  if (node.fill) tokens.fill = node.fill;
  if (node.lineColor) tokens.stroke = node.lineColor;
  if (node.textColor) tokens.textColor = node.textColor;
  const lineAttrs = lineStyleToStrokeAttrs(node.lineStyle);
  if (lineAttrs.strokeDasharray) tokens.strokeDasharray = lineAttrs.strokeDasharray;
  if (lineAttrs.strokeWidth) tokens.strokeWidth = lineAttrs.strokeWidth;
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
  // Inline `#<styleBlock>` overrides take precedence over skin defaults.
  if (node.fill) tokens.fill = node.fill;
  if (node.lineColor) tokens.stroke = node.lineColor;
  if (node.textColor) tokens.textColor = node.textColor;
  const lineAttrs = lineStyleToStrokeAttrs(node.lineStyle);
  if (lineAttrs.strokeDasharray) tokens.strokeDasharray = lineAttrs.strokeDasharray;
  if (lineAttrs.strokeWidth) tokens.strokeWidth = lineAttrs.strokeWidth;
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
    return drawUsecaseNote(node.text ?? node.name, pos, sz, node.anchorSide);
  }
  const tokens = resolveUsecaseTokens(node, ast, skin);
  if (node.labelBlocks && node.labelBlocks.length > 0) {
    const shapes = drawUsecaseBlocks(node.labelBlocks, pos, sz, tokens);
    // Multi-block usecases now draw an ellipse outline, so the business chord
    // uses the same ellipse-aware geometry as the single-line variant.
    if (node.business) shapes.splice(1, 0, drawBusinessMarkerEllipse(pos, sz, tokens));
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
 * Business-actor marker — a diagonal slash drawn THROUGH the actor's head
 * circle, from the top-left of the head to the bottom-right (passing through
 * the head's center). This mirrors PlantUML's reference renderer for
 * `actor/` / `:Foo:/`, where the slash crosses the head — not the torso.
 *
 * The endpoints sit at ±0.7r from the head center on both axes, which is
 * exactly at the perimeter of the circle (`0.7 ≈ sqrt(2)/2`), so the slash
 * looks like a diameter drawn at 45°. The line is rendered after the head so
 * it remains visible on top of the head's fill.
 *
 * Head geometry per actor style is taken from the same constants as the
 * corresponding draw function (`drawActor`, `drawActorHollow`,
 * `drawActorAwesome`) so any future tweak to the figure stays in sync.
 */
function drawBusinessMarkerActor(
  pos: Position,
  sz: BoxSize,
  actorStyle: ActorStyle,
  tokens: NodeStyleTokens,
): Shape {
  const cx = pos.x + sz.w / 2;
  let headCy: number;
  let headR: number;
  if (actorStyle === 'awesome') {
    // Matches drawActorAwesome: figureTop = pos.y + 2; headR = 10.
    const figureTop = pos.y + 2;
    headR = 10;
    headCy = figureTop + headR;
  } else if (actorStyle === 'hollow') {
    // Matches drawActorHollow: figureTop = pos.y + 2; headR = 9.
    const figureTop = pos.y + 2;
    headR = 9;
    headCy = figureTop + headR;
  } else {
    // Matches drawActor (stickman): figureTop = pos.y + 4; head at
    // (cx, figureTop + 6) with r = 6.
    const figureTop = pos.y + 4;
    headR = 6;
    headCy = figureTop + 6;
  }
  // Endpoints at ±0.7r from the head center, i.e. on the head perimeter at
  // 45° (sqrt(2)/2 ≈ 0.707). Result is a diameter-length slash crossing the
  // head's center from upper-left to lower-right.
  const off = headR * 0.7;
  return {
    type: 'line',
    x1: cx - off,
    y1: headCy - off,
    x2: cx + off,
    y2: headCy + off,
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
 * Word-wraps a single note line so no resulting line's rendered width exceeds
 * MAX_NOTE_W. Preserves whitespace between words; if a single word is wider
 * than the cap it is kept on its own line (we don't break inside words).
 */
function wrapNoteLine(line: string): string[] {
  if (measureText(line, FONT_LABEL).width <= MAX_NOTE_W) return [line];
  // Split into alternating word/whitespace tokens so we can rejoin without
  // mangling internal spacing.
  const tokens = line.split(/(\s+)/);
  const out: string[] = [];
  let cur = '';
  for (const tok of tokens) {
    if (tok === '') continue;
    if (cur === '') {
      cur = tok;
      continue;
    }
    const candidate = cur + tok;
    if (measureText(candidate, FONT_LABEL).width > MAX_NOTE_W) {
      out.push(cur.replace(/\s+$/, ''));
      // Drop the leading whitespace token that would otherwise start the
      // next line.
      cur = /^\s+$/.test(tok) ? '' : tok;
    } else {
      cur = candidate;
    }
  }
  if (cur !== '' && !/^\s+$/.test(cur)) out.push(cur);
  return out.length > 0 ? out : [line];
}

/**
 * Applies `wrapNoteLine` to each explicit line in `text`, returning the joined
 * (possibly multi-line) result. Original `\n` boundaries are preserved — only
 * single long lines auto-wrap.
 */
function wrapNoteText(text: string): string {
  return text
    .split('\n')
    .flatMap((l) => wrapNoteLine(l))
    .join('\n');
}

/**
 * Folded-corner rectangle for use-case diagram notes. Renders the standard
 * PlantUML "post-it" look: a light-yellow rect with the top-right corner
 * dog-eared. Multi-line bodies (split on `\n`) stack vertically inside.
 */
function drawUsecaseNote(
  text: string,
  pos: Position,
  sz: BoxSize,
  anchorSide?: NoteSide,
): Shape[] {
  const shapes: Shape[] = [];
  const x = pos.x;
  const y = pos.y;
  const w = sz.w;
  const h = sz.h;
  const noteStyle = { fill: COLOR_NOTE_FILL, stroke: COLOR_NOTE_STROKE, strokeWidth: 1 };
  const foldStyle = { fill: 'none', stroke: COLOR_NOTE_STROKE, strokeWidth: 1 };
  // Base outline (clockwise from top-left): top-left, top-right-before-fold,
  // fold-corner, bottom-right, bottom-left. Attached notes splice a small
  // triangular TAIL into the edge facing the anchor so the note reads like a
  // speech bubble (matches PlantUML's reference rendering).
  const points: Array<[number, number]> = [
    [x, y],
    [x + w - NOTE_FOLD, y],
    [x + w, y + NOTE_FOLD],
    [x + w, y + h],
    [x, y + h],
  ];
  if (anchorSide) {
    const tip = NOTE_TAIL_TIP;
    const half = NOTE_TAIL_HALF;
    const midX = x + w / 2;
    const midY = y + h / 2;
    if (anchorSide === 'right') {
      // Note is RIGHT of the anchor → tail on the note's LEFT edge, pointing
      // left toward the anchor. Splice after bottom-left, before closing back
      // to top-left.
      points.push([x, midY + half]);
      points.push([x - tip, midY]);
      points.push([x, midY - half]);
    } else if (anchorSide === 'left') {
      // Tail on the note's RIGHT edge. Splice between fold-corner and
      // bottom-right so the tail sits inside the straight portion of the
      // right edge (below the fold).
      const rightTail: Array<[number, number]> = [
        [x + w, midY - half],
        [x + w + tip, midY],
        [x + w, midY + half],
      ];
      // Insert AFTER index 2 (the fold-corner) so the right edge becomes
      // fold-corner → tail-top → tip → tail-bottom → bottom-right.
      points.splice(3, 0, ...rightTail);
    } else if (anchorSide === 'top') {
      // Tail on the BOTTOM edge, pointing down. The bottom edge is traversed
      // from bottom-right (index 3) to bottom-left (index 4) — splice the
      // three tail vertices between them.
      const bottomTail: Array<[number, number]> = [
        [midX + half, y + h],
        [midX, y + h + tip],
        [midX - half, y + h],
      ];
      points.splice(4, 0, ...bottomTail);
    } else if (anchorSide === 'bottom') {
      // Tail on the TOP edge, pointing up. Splice between top-left (index 0)
      // and top-right-before-fold (index 1).
      const topTail: Array<[number, number]> = [
        [midX - half, y],
        [midX, y - tip],
        [midX + half, y],
      ];
      points.splice(1, 0, ...topTail);
    }
  }
  shapes.push({
    type: 'polygon',
    points,
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
  // Word-wrap each explicit line to MAX_NOTE_W; the same wrap is applied in
  // `measureNode` so the box height computed there matches the row count we
  // emit here.
  const lines = wrapNoteText(text).split('\n');
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

/**
 * Render a (possibly multi-line) actor label as a stack of `text` shapes
 * bottom-aligned to `pos.y + sz.h - 4`. Each `\n` in `name` becomes its own
 * row; rows are stacked upward from the baseline so the lowest line stays at
 * the original anchor and earlier lines climb above it.
 */
function actorLabelShapes(
  name: string,
  cx: number,
  bottomY: number,
  fontFam: string,
  textColor: string = '#000',
): Shape[] {
  const lines = name.split('\n');
  const lineH = Math.ceil(FONT_LABEL * 1.25);
  const out: Shape[] = [];
  for (let i = 0; i < lines.length; i++) {
    // Bottom-most line sits at `bottomY`; earlier lines climb upward by
    // `lineH` so the stack stays anchored to the actor's original label slot.
    const y = bottomY - (lines.length - 1 - i) * lineH;
    out.push({
      type: 'text',
      x: cx,
      y,
      text: lines[i]!,
      anchor: 'middle',
      baseline: 'alphabetic',
      font: { family: fontFam, size: FONT_LABEL, color: textColor },
    });
  }
  return out;
}

function drawActor(name: string, pos: Position, sz: BoxSize, tokens: NodeStyleTokens = {}): Shape[] {
  const cx = pos.x + sz.w / 2;
  const figureTop = pos.y + 4;
  const strokeColor = tokens.stroke ?? COLOR_LINE;
  // Per-node `lineStyle` may bump stroke width (bold) or swap in a dasharray
  // (dashed / dotted). Spread the override AFTER `strokeWidth: 1` so the
  // base default holds when no override is present.
  const strokeWidth = tokens.strokeWidth ?? 1;
  const strokeAttrs = tokens.strokeDasharray
    ? { stroke: strokeColor, strokeWidth, strokeDasharray: tokens.strokeDasharray }
    : { stroke: strokeColor, strokeWidth };
  const headFill = tokens.fill ?? COLOR_FILL_ACTOR;
  const fontFam = tokens.fontFamily ?? FONT_FAMILY;
  return [
    { type: 'circle', cx, cy: figureTop + 6, r: 6, style: { fill: headFill, ...strokeAttrs } },
    { type: 'line', x1: cx, y1: figureTop + 12, x2: cx, y2: figureTop + 32, style: strokeAttrs },
    { type: 'line', x1: cx - 12, y1: figureTop + 20, x2: cx + 12, y2: figureTop + 20, style: strokeAttrs },
    { type: 'line', x1: cx, y1: figureTop + 32, x2: cx - 9, y2: figureTop + 44, style: strokeAttrs },
    { type: 'line', x1: cx, y1: figureTop + 32, x2: cx + 9, y2: figureTop + 44, style: strokeAttrs },
    ...actorLabelShapes(name, cx, pos.y + sz.h - 4, fontFam, tokens.textColor),
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
  const fillStroke: {
    fill: string;
    stroke: string;
    strokeWidth: number;
    strokeDasharray?: string;
  } = {
    fill: tokens.fill ?? COLOR_AWESOME_FILL,
    stroke: tokens.stroke ?? COLOR_AWESOME_STROKE,
    strokeWidth: tokens.strokeWidth ?? 1,
  };
  if (tokens.strokeDasharray) fillStroke.strokeDasharray = tokens.strokeDasharray;
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
    ...actorLabelShapes(name, cx, pos.y + sz.h - 4, fontFam, tokens.textColor),
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
  // Hollow baseline is `strokeWidth: 1.5`; a `lineStyle: 'bold'` override
  // bumps it to 2 (matching the bold-stroke convention used elsewhere).
  const strokeAttrs: {
    stroke: string;
    strokeWidth: number;
    strokeDasharray?: string;
  } = { stroke: strokeColor, strokeWidth: tokens.strokeWidth ?? 1.5 };
  if (tokens.strokeDasharray) strokeAttrs.strokeDasharray = tokens.strokeDasharray;
  const bodyTop = headCy + headR;
  const bodyBottom = bodyTop + 18;
  const fontFam = tokens.fontFamily ?? FONT_FAMILY;
  return [
    {
      type: 'circle',
      cx,
      cy: headCy,
      r: headR,
      style: { fill: tokens.fill ?? '#FFFFFF', ...strokeAttrs },
    },
    { type: 'line', x1: cx, y1: bodyTop, x2: cx, y2: bodyBottom, style: strokeAttrs },
    {
      type: 'line',
      x1: cx - 12,
      y1: bodyTop + 6,
      x2: cx + 12,
      y2: bodyTop + 6,
      style: strokeAttrs,
    },
    {
      type: 'line',
      x1: cx,
      y1: bodyBottom,
      x2: cx - 9,
      y2: bodyBottom + 12,
      style: strokeAttrs,
    },
    {
      type: 'line',
      x1: cx,
      y1: bodyBottom,
      x2: cx + 9,
      y2: bodyBottom + 12,
      style: strokeAttrs,
    },
    ...actorLabelShapes(name, cx, pos.y + sz.h - 4, fontFam, tokens.textColor),
  ];
}

function drawUsecase(name: string, pos: Position, sz: BoxSize, stereotype?: string, tokens: NodeStyleTokens = {}): Shape[] {
  const cx = pos.x + sz.w / 2;
  const cy = pos.y + sz.h / 2;
  // Ellipse style: apply inline `lineStyle` (bold → strokeWidth 2; dashed /
  // dotted → strokeDasharray) and `textColor` overrides resolved upstream.
  const ellipseStyle: {
    fill: string;
    stroke: string;
    strokeWidth: number;
    strokeDasharray?: string;
  } = {
    fill: tokens.fill ?? COLOR_FILL_UC,
    stroke: tokens.stroke ?? COLOR_LINE,
    strokeWidth: tokens.strokeWidth ?? 1,
  };
  if (tokens.strokeDasharray) ellipseStyle.strokeDasharray = tokens.strokeDasharray;
  const labelColor = tokens.textColor ?? '#000';
  const shapes: Shape[] = [
    {
      type: 'ellipse',
      cx,
      cy,
      rx: sz.w / 2,
      ry: sz.h / 2,
      style: ellipseStyle,
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
      font: { family: FONT_FAMILY, size: FONT_LABEL, color: labelColor },
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
    font: { family: FONT_FAMILY, size: FONT_LABEL, color: labelColor },
  });
  return shapes;
}

/**
 * Draws a multi-block usecase: an ELLIPSE outline (matching PlantUML) with
 * text rows and horizontal separator lines stacked vertically inside. The
 * ellipse's rx/ry were sized by `measureBlocks` so the content's inscribed
 * rectangle fits inside.
 *
 * Separator lines are clipped to the ellipse chord at their y position so
 * they don't poke through the curved sides. Each chord half-width is
 * `rx * sqrt(1 - (dy/ry)^2)` where `dy` is the line's vertical offset from
 * the ellipse center.
 */
function drawUsecaseBlocks(
  blocks: LabelBlock[],
  pos: Position,
  sz: BoxSize,
  tokens: NodeStyleTokens = {},
): Shape[] {
  const shapes: Shape[] = [];
  const cx = pos.x + sz.w / 2;
  const cy = pos.y + sz.h / 2;
  const rx = sz.w / 2;
  const ry = sz.h / 2;
  const lineHeight = FONT_LABEL * 1.25;
  // Honour the per-node inline `#<styleBlock>` overrides resolved upstream
  // (fill / lineColor / lineStyle / textColor). The separators below keep
  // their fixed stroke colour — they're structural row dividers, not part of
  // the outline whose colour the user is overriding.
  const ellipseStroke = tokens.stroke ?? COLOR_LINE;
  const ellipseStyle: {
    fill: string;
    stroke: string;
    strokeWidth: number;
    strokeDasharray?: string;
  } = {
    fill: tokens.fill ?? COLOR_FILL_UC,
    stroke: ellipseStroke,
    strokeWidth: tokens.strokeWidth ?? 1,
  };
  if (tokens.strokeDasharray) ellipseStyle.strokeDasharray = tokens.strokeDasharray;
  const labelColor = tokens.textColor ?? '#000';

  shapes.push({
    type: 'ellipse',
    cx,
    cy,
    rx,
    ry,
    style: ellipseStyle,
  });

  // Content is centered vertically inside the ellipse. Total content height
  // is the inner bbox produced by `contentBlockSize`; we start drawing at
  // `cy - contentH/2` so rows balance above and below the center line.
  const inner = contentBlockSize(blocks);
  const contentTop = cy - inner.h / 2;
  // Tiny inner margin so the dotted separators don't visually touch the
  // ellipse's curve.
  const SEP_INSET = 6;

  const chordHalfWidth = (yPos: number): number => {
    const dy = yPos - cy;
    const t = 1 - (dy * dy) / (ry * ry);
    if (t <= 0) return 0;
    return rx * Math.sqrt(t);
  };

  let y = contentTop;
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
          font: { family: FONT_FAMILY, size: FONT_LABEL, color: labelColor },
        });
        y += lineHeight;
      }
    } else if (b.kind === 'sep-solid') {
      const yLine = y + UC_BLOCK_SEP_H / 2;
      const half = Math.max(0, chordHalfWidth(yLine) - SEP_INSET);
      shapes.push({
        type: 'line',
        x1: cx - half,
        y1: yLine,
        x2: cx + half,
        y2: yLine,
        style: { stroke: COLOR_LINE, strokeWidth: 1 },
      });
      y += UC_BLOCK_SEP_H;
    } else if (b.kind === 'sep-double') {
      const yLine = y + UC_BLOCK_SEP_H / 2;
      const half = Math.max(0, chordHalfWidth(yLine) - SEP_INSET);
      shapes.push({
        type: 'line',
        x1: cx - half,
        y1: yLine,
        x2: cx + half,
        y2: yLine,
        style: { stroke: COLOR_LINE, strokeWidth: 2 },
      });
      y += UC_BLOCK_SEP_H;
    } else if (b.kind === 'sep-dotted') {
      const yLine = y + UC_BLOCK_SEP_H / 2;
      const half = Math.max(0, chordHalfWidth(yLine) - SEP_INSET);
      shapes.push({
        type: 'line',
        x1: cx - half,
        y1: yLine,
        x2: cx + half,
        y2: yLine,
        style: { stroke: COLOR_LINE, strokeWidth: 1, strokeDasharray: '2,3' },
      });
      y += UC_BLOCK_SEP_H;
    } else if (b.kind === 'sep-titled') {
      // The title occupies its OWN row band ABOVE the dotted separator line,
      // matching the measurement budget (`UC_BLOCK_SEP_H + lineHeight`). Draw
      // order: title row first (y .. y+lineHeight), then dotted line in the
      // separator strip below.
      shapes.push({
        type: 'text',
        x: cx,
        y: y + lineHeight * 0.8,
        text: b.text,
        anchor: 'middle',
        baseline: 'alphabetic',
        font: { family: FONT_FAMILY, size: FONT_LABEL, color: labelColor },
      });
      y += lineHeight;
      const yLine = y + UC_BLOCK_SEP_H / 2;
      const half = Math.max(0, chordHalfWidth(yLine) - SEP_INSET);
      shapes.push({
        type: 'line',
        x1: cx - half,
        y1: yLine,
        x2: cx + half,
        y2: yLine,
        style: { stroke: COLOR_LINE, strokeWidth: 1, strokeDasharray: '2,3' },
      });
      y += UC_BLOCK_SEP_H;
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

/**
 * Render a use-case diagram that has only `json NAME { ... }` blocks (no
 * actors / use cases). Each block lays out via the shared `layoutKvTree`
 * primitive and is translated into a vertical strip with the standard page
 * padding. Bounding box grows to fit the widest / tallest block.
 */
function layoutJsonOnlyScene(jsonNodes: NonNullable<UseCaseAst['jsonNodes']>): Scene {
  const JSON_BLOCK_GAP = 24;
  const shapes: Shape[] = [];
  let cursorY = PAGE_PAD;
  let totalW = PAGE_PAD * 2;
  for (const jn of jsonNodes) {
    const jsonScene = layoutKvTree({
      title: '',
      data: jn.data,
      highlights: [],
      parseError: jn.parseError ?? '',
      errorLabel: 'JSON parse error',
    });
    shapes.push({
      type: 'group',
      transform: `translate(${PAGE_PAD},${cursorY})`,
      children: jsonScene.children,
    });
    if (PAGE_PAD + jsonScene.width + PAGE_PAD > totalW) {
      totalW = PAGE_PAD + jsonScene.width + PAGE_PAD;
    }
    cursorY += jsonScene.height + JSON_BLOCK_GAP;
  }
  return {
    width: totalW,
    height: cursorY - JSON_BLOCK_GAP + PAGE_PAD,
    background: '#fff',
    children: shapes,
  };
}
