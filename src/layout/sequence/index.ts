import type {
  ArrowMarker,
  DividerStmt,
  GroupKind,
  NoteStmt,
  RefStmt,
  SequenceAst,
  SequenceStatement,
} from '../../ast/sequence.js';
import type { Scene, Shape } from '../../scene/types.js';
import { measureText } from './measure.js';
import { drawHeader, maxHeaderHeight, participantContentWidth } from './headers.js';
import { parseLabelMarkup, drawLabelSpans } from './markup.js';
import {
  buildSkin, setSkin, clearSkin, getSkin,
  buildStyles, setStyles, clearStyles, getStyles,
} from './skin.js';
import {
  buildHandwrittenNoticeShapes,
  handwrittenNoticeHeight,
  handwrittenNoticeWidth,
} from '../common/handwritten.js';

const TOP_PAD = 12;
const BOTTOM_PAD = 12;
const SIDE_PAD = 12;
const HEADER_PAD_X = 16;
const LANE_MIN_WIDTH = 80;
const LANE_GAP = 50;
const MSG_GAP = 36;
// `A ->(N) B` — pixels of vertical slope per N unit. The arrow's head lands
// `N * DURATION_SCALE` pixels below its tail; layout reserves that extra
// space so the next statement starts below the slanted tip.
const DURATION_SCALE = 2;
const MSG_TEXT_PAD = 6;
const MSG_TEXT_HPAD = 8;
const SELF_MSG_W = 40;
const SELF_MSG_H = 24;
const NOTE_PAD_X = 8;
const NOTE_PAD_Y = 6;
const NOTE_FOLD = 6;
const NOTE_GAP = 30;
const NOTE_SIDE_OFFSET = 8;
const ACT_WIDTH = 10;
const GROUP_PAD = 10;
const GROUP_HEADER_HEIGHT = 18;
const GROUP_SIDE_PAD = 8;
const ARROW_HEAD = 8;
// Inset for the boundary end of a found/lost message arrow — keeps the
// head/tail marker a few pixels away from the very edge of the SVG so it
// isn't clipped by anti-aliasing.
const BOUNDARY_INSET = 4;
// Minimum horizontal length for a boundary arrow's visible body. When the
// participant is on the leftmost (or rightmost) lane, the natural distance
// to SIDE_PAD may be near zero; widen the diagram so the arrow is readable.
const BOUNDARY_ARROW_MIN = 40;
// Short-boundary (`?-> X` / `X ->?`) offset from the participant's lane
// center. The stub sits adjacent to the lifeline rather than at the diagram
// edge. Picked small enough to stay within the side pad on edge lanes.
const SHORT_BOUNDARY_OFFSET = 36;
const TITLE_FONT_SIZE = 16;
const TITLE_GAP = 12;
const PAGE_HEADER_FONT_SIZE = 11;
const PAGE_HEADER_LINE_H = 14;
const PAGE_HEADER_GAP = 8;
const COLOR_PAGE_MARGIN = '#999';
const DIVIDER_HEIGHT = 22;
const DIVIDER_GAP = 8;
const REF_PAD_X = 12;
const REF_PAD_Y = 8;
const REF_TAB_FOLD = 6;
const REF_TAB_H = 18;
const REF_GAP = 14;
// `box ... end box` — horizontal pad outside the contained lanes' headers,
// vertical pad below the bottom header row, and a taller "title strip" above
// the top header row that fits the title text without crowding the headers.
const BOX_PAD_X = 8;
const BOX_PAD_Y = 8;
const BOX_TITLE_FONT_SIZE = 13;
const BOX_TITLE_STRIP = 22;

// `skinparam handwritten true` notice box constants are shared with the
// use-case diagram and live in `../common/handwritten.ts`.

// `mainframe <label>` — outer-frame rectangle with a folded-corner tab in the
// top-left. Visually mirrors the `ref` tab: same fold-notch geometry,
// rectangular interior. Vertical pad inside the tab is symmetric so the label
// sits centered. The diagram body is pushed down by MAINFRAME_TAB_H + the
// small gap below the tab so it doesn't crowd the page header / title.
const MAINFRAME_TAB_H = 22;
const MAINFRAME_TAB_FOLD = 6;
const MAINFRAME_TAB_PAD_X = 12;
const MAINFRAME_FRAME_PAD = 4;
const MAINFRAME_GAP = 6;

const FONT_FAMILY = 'sans-serif';
const FONT_SIZE = 12;
const FONT_GROUP = 11;

const COLOR_LINE = '#222';
const COLOR_LIFELINE = '#666';
const COLOR_NOTE_FILL = '#fbfb77';
const COLOR_NOTE_STROKE = '#888';
const COLOR_GROUP_STROKE = '#888';
const COLOR_GROUP_TAB_FILL = '#eeeeee';
const COLOR_ACTIVATION_FILL = '#cccccc';
const COLOR_DIVIDER_FILL = '#dddddd';

interface PendingGroup {
  kind: GroupKind;
  label: string;
  yStart: number;
  minLane: number;
  maxLane: number;
  dividers: Array<{ y: number; label: string }>;
  /** Optional fill for the folded-corner tab. */
  tabColor?: string;
  /** Background fill per branch. branchColors[0] is the first branch (between
   *  the tab strip and the first `else` divider), [1] the second, etc. An
   *  empty string / undefined means "no fill". */
  branchColors: Array<string | undefined>;
}

interface FinalizedActivation {
  laneIdx: number;
  level: number;
  yStart: number;
  yEnd: number;
  color: string;
}

interface ActFrame {
  yStart: number;
  color: string;
  /** Sender lane (for autoactivate-created frames); used by `return`. */
  fromIdx?: number;
}

export function layoutSequence(ast: SequenceAst): Scene {
  setSkin(buildSkin(ast));
  setStyles(buildStyles(ast));
  try {
    return doLayoutSequence(ast);
  } finally {
    clearSkin();
    clearStyles();
  }
}

/**
 * `hide unlinked` predicate: returns true when at least one statement
 * references the given participant id. References include message endpoints
 * (excluding boundary `[` / `]` / `?` which have an empty id), activate /
 * deactivate targets, note `over` / `left` / `right` targets, and ref `over`
 * targets. Boundary stub messages don't have a real participant on one side
 * (the empty-string id never matches a real participant), so they only
 * contribute the non-boundary end.
 */
function isReferenced(id: string, stmts: SequenceStatement[]): boolean {
  for (const s of stmts) {
    switch (s.type) {
      case 'message':
        if (s.from === id || s.to === id) return true;
        break;
      case 'activate':
      case 'deactivate':
        if (s.target === id) return true;
        break;
      case 'note':
      case 'ref':
        if (s.targets.includes(id)) return true;
        break;
    }
  }
  return false;
}

function doLayoutSequence(ast: SequenceAst): Scene {
  // `hide unlinked` — filter out participants never referenced by any
  // statement. Box membership rides along: a box with all its members hidden
  // is implicitly removed (no contiguous lanes share its id, so the
  // box-grouping pass emits no run for it). A partially-hidden box shrinks
  // to its surviving lanes.
  // `participant X order N` — explicit column-order hint. Stable-sort on
  // `(order ?? +Infinity)` so participants with an explicit `order` are placed
  // first in ascending order and the rest preserve declaration order. JS's
  // `Array.prototype.sort` is stable per spec. A no-op when no participant
  // carries an `order` (all keys are +Infinity → no swaps).
  const filtered = ast.hideUnlinked === true
    ? ast.participants.filter((p) => isReferenced(p.id, ast.statements))
    : ast.participants;
  const parts = filtered
    .slice()
    .sort(
      (a, b) =>
        (a.order ?? Number.POSITIVE_INFINITY) - (b.order ?? Number.POSITIVE_INFINITY),
    );

  if (parts.length === 0) {
    return {
      width: 220,
      height: 60,
      background: '#fff',
      children: [
        {
          type: 'text',
          x: 110,
          y: 30,
          text: '(empty sequence diagram)',
          anchor: 'middle',
          baseline: 'middle',
          font: { family: FONT_FAMILY, size: FONT_SIZE, color: '#999' },
        },
      ],
    };
  }

  const headerW = parts.map((p) =>
    Math.max(LANE_MIN_WIDTH, participantContentWidth(p) + HEADER_PAD_X * 2),
  );

  const laneIdx = new Map<string, number>(parts.map((p, i) => [p.id, i]));
  const labels = precomputeMessageLabels(ast.statements);
  const gaps = computeLaneGaps(ast.statements, labels, laneIdx, headerW, parts.length);

  // Pre-pass: a reverse self-message (`A <- A`) draws its label and loop on
  // the LEFT of the lifeline, which can push past the diagram's left edge.
  // Measure all reverse self-message labels on lane 0 and add that as a left
  // pad before assigning lane centers. Forward self-messages (`A -> A`) keep
  // extending to the right and are handled afterwards by widening the diagram.
  let leftExtra = 0;
  for (const stmt of ast.statements) {
    if (stmt.type !== 'message' || stmt.from !== stmt.to || !stmt.reverse) continue;
    const idx = laneIdx.get(stmt.from);
    if (idx !== 0) continue;
    const lines = stmt.text ? stmt.text.split('\n') : [];
    let maxLineW = 0;
    for (const line of lines) {
      const w = measureText(line, FONT_SIZE).width;
      if (w > maxLineW) maxLineW = w;
    }
    const needLeftOfCenter = Math.max(6 + maxLineW, SELF_MSG_W);
    const required = needLeftOfCenter - headerW[0]! / 2;
    if (required > leftExtra) leftExtra = required;
  }
  // `note left of X` on lane 0 sits to the left of the lifeline; widen the
  // left margin so the note doesn't get clipped at the SVG edge. drawNote
  // computes the note's x as `laneCenter[0] - headerW[0]/2 - noteW - SIDE_OFFSET`
  // and laneCenter[0] = SIDE_PAD + leftExtra + headerW[0]/2, so we need
  // leftExtra ≥ noteW + SIDE_OFFSET for the note to stay within the SVG.
  for (const stmt of ast.statements) {
    if (stmt.type !== 'note' || stmt.position !== 'left') continue;
    const idx = laneIdx.get(stmt.targets[0]);
    if (idx !== 0) continue;
    const lines = stmt.text ? stmt.text.split('\n') : [];
    let maxLineW = 0;
    for (const line of lines) {
      const w = measureText(line, FONT_SIZE).width;
      if (w > maxLineW) maxLineW = w;
    }
    const noteW = maxLineW + NOTE_PAD_X * 2;
    const required = noteW + NOTE_SIDE_OFFSET;
    if (required > leftExtra) leftExtra = required;
  }
  // Found-message (`[-> X` / `[<- X`) on lane 0 needs enough left padding for
  // the arrow body between the boundary inset and the lane center.
  for (const stmt of ast.statements) {
    if (stmt.type !== 'message') continue;
    const side = stmt.fromBoundary ?? stmt.toBoundary;
    if (side !== 'left') continue;
    const partId = stmt.fromBoundary ? stmt.to : stmt.from;
    if (laneIdx.get(partId) !== 0) continue;
    const required = BOUNDARY_ARROW_MIN + BOUNDARY_INSET - headerW[0]! / 2;
    if (required > leftExtra) leftExtra = required;
  }

  // `box ... end box` on the leftmost lane needs BOX_PAD_X of left margin so
  // the box's left edge stays inside the diagram.
  if (parts[0]?.box) {
    if (BOX_PAD_X > leftExtra) leftExtra = BOX_PAD_X;
  }

  // Single-lane `ref over X` on lane 0 may bleed leftward when the body is
  // wider than the header. Grow leftExtra accordingly.
  for (const stmt of ast.statements) {
    if (stmt.type !== 'ref') continue;
    const idxs = stmt.targets
      .map((t) => laneIdx.get(t))
      .filter((v): v is number => v !== undefined);
    if (idxs.length === 0) continue;
    const lo = Math.min(...idxs);
    const hi = Math.max(...idxs);
    if (lo !== 0 || hi !== 0) continue;
    const lines = stmt.text ? stmt.text.split('\n') : [];
    let maxLineW = 0;
    for (const line of lines) {
      const w = measureText(line, FONT_SIZE).width;
      if (w > maxLineW) maxLineW = w;
    }
    const tabBlockW = measureText('ref', FONT_SIZE).width + 16 + REF_TAB_FOLD + 8;
    const refW = Math.max(maxLineW + REF_PAD_X * 2, tabBlockW);
    const halfOverflow = (refW - headerW[0]!) / 2;
    if (halfOverflow > leftExtra) leftExtra = halfOverflow;
  }

  const laneCenters: number[] = [];
  let cursorX = SIDE_PAD + leftExtra;
  for (let i = 0; i < parts.length; i++) {
    cursorX += headerW[i]! / 2;
    laneCenters.push(cursorX);
    cursorX += headerW[i]! / 2;
    if (i < parts.length - 1) cursorX += gaps[i]!;
  }
  cursorX += SIDE_PAD;
  let diagramWidth = cursorX;

  // Forward self-message labels extend rightward of the lifeline. Grow the
  // diagram width so they aren't clipped at the SVG edge.
  for (const stmt of ast.statements) {
    if (stmt.type !== 'message') continue;
    if (stmt.from !== stmt.to) continue;
    if (stmt.reverse) continue;
    const idx = laneIdx.get(stmt.from);
    if (idx === undefined) continue;
    const lines = stmt.text ? stmt.text.split('\n') : [];
    let maxLineW = 0;
    for (const line of lines) {
      const w = measureText(line, FONT_SIZE).width;
      if (w > maxLineW) maxLineW = w;
    }
    const rightEdge = laneCenters[idx]! + Math.max(6 + maxLineW, SELF_MSG_W) + SIDE_PAD;
    if (rightEdge > diagramWidth) diagramWidth = rightEdge;
  }
  // `note right of X` extends to the right of the lifeline. Grow width.
  for (const stmt of ast.statements) {
    if (stmt.type !== 'note' || stmt.position !== 'right') continue;
    const idx = laneIdx.get(stmt.targets[0]!);
    if (idx === undefined) continue;
    const lines = stmt.text ? stmt.text.split('\n') : [];
    let maxLineW = 0;
    for (const line of lines) {
      const w = measureText(line, FONT_SIZE).width;
      if (w > maxLineW) maxLineW = w;
    }
    const noteW = maxLineW + NOTE_PAD_X * 2;
    const rightEdge =
      laneCenters[idx]! + headerW[idx]! / 2 + NOTE_SIDE_OFFSET + noteW + SIDE_PAD;
    if (rightEdge > diagramWidth) diagramWidth = rightEdge;
  }
  // Single-lane `ref over X` — if the body is wider than X's header, the
  // ref bleeds equally to both sides. Grow the right edge of the diagram
  // for the overflow on the right side. (The left-side overflow on lane 0
  // is handled before laneCenters are computed, via leftExtra.)
  for (const stmt of ast.statements) {
    if (stmt.type !== 'ref') continue;
    const idxs = stmt.targets
      .map((t) => laneIdx.get(t))
      .filter((v): v is number => v !== undefined);
    if (idxs.length === 0) continue;
    const lo = Math.min(...idxs);
    const hi = Math.max(...idxs);
    if (lo !== hi) continue;
    if (hi !== parts.length - 1) continue; // only matters on the rightmost lane
    const lines = stmt.text ? stmt.text.split('\n') : [];
    let maxLineW = 0;
    for (const line of lines) {
      const w = measureText(line, FONT_SIZE).width;
      if (w > maxLineW) maxLineW = w;
    }
    const tabBlockW = measureText('ref', FONT_SIZE).width + 16 + REF_TAB_FOLD + 8;
    const refW = Math.max(maxLineW + REF_PAD_X * 2, tabBlockW);
    const halfOverflow = (refW - headerW[hi]!) / 2;
    if (halfOverflow > 0) {
      const rightEdge = laneCenters[hi]! + headerW[hi]! / 2 + halfOverflow + SIDE_PAD;
      if (rightEdge > diagramWidth) diagramWidth = rightEdge;
    }
  }

  // `box ... end box` on the rightmost lane needs BOX_PAD_X of right margin
  // so the box's right edge stays inside the diagram.
  if (parts[parts.length - 1]?.box) {
    const need = laneCenters[parts.length - 1]! + headerW[parts.length - 1]! / 2 + BOX_PAD_X + SIDE_PAD;
    if (need > diagramWidth) diagramWidth = need;
  }

  // Lost-message (`X ->]` / `X <-]`) on the rightmost lane needs enough
  // padding on the right for the arrow body between the lane center and the
  // boundary inset.
  for (const stmt of ast.statements) {
    if (stmt.type !== 'message') continue;
    const side = stmt.fromBoundary ?? stmt.toBoundary;
    if (side !== 'right') continue;
    const partId = stmt.fromBoundary ? stmt.to : stmt.from;
    const idx = laneIdx.get(partId);
    if (idx === undefined) continue;
    if (idx !== parts.length - 1) continue;
    const need = laneCenters[idx]! + BOUNDARY_ARROW_MIN + BOUNDARY_INSET + SIDE_PAD;
    if (need > diagramWidth) diagramWidth = need;
  }

  // `note across` spans the full diagram. Grow width to fit the text.
  for (const stmt of ast.statements) {
    if (stmt.type !== 'note' || stmt.position !== 'across') continue;
    const lines = stmt.text ? stmt.text.split('\n') : [];
    let maxLineW = 0;
    for (const line of lines) {
      const w = measureText(line, FONT_SIZE).width;
      if (w > maxLineW) maxLineW = w;
    }
    const need = maxLineW + NOTE_PAD_X * 2 + SIDE_PAD * 2;
    if (need > diagramWidth) diagramWidth = need;
  }

  const pageHeaderLines = ast.header ? ast.header.split('\n') : [];
  const pageFooterLines = ast.footer ? ast.footer.split('\n') : [];
  const pageHeaderH = pageHeaderLines.length > 0
    ? pageHeaderLines.length * PAGE_HEADER_LINE_H + PAGE_HEADER_GAP
    : 0;
  const pageFooterH = pageFooterLines.length > 0
    ? pageFooterLines.length * PAGE_HEADER_LINE_H + PAGE_HEADER_GAP
    : 0;

  // Page header / footer text can be wider than the diagram. Grow width to fit.
  for (const line of [...pageHeaderLines, ...pageFooterLines]) {
    const need = measureText(line, PAGE_HEADER_FONT_SIZE).width + SIDE_PAD * 2;
    if (need > diagramWidth) diagramWidth = need;
  }

  const titleHeight = ast.title ? Math.ceil(TITLE_FONT_SIZE * 1.2) + TITLE_GAP : 0;
  // When any participant is inside a `box ... end box`, push the participant
  // headers down so the box's title strip has room to render above them.
  const anyBoxed = parts.some((p) => p.box);
  const boxTopExtra = anyBoxed ? BOX_TITLE_STRIP : 0;
  const handwrittenOn = getSkin().handwritten === true;
  const handwrittenNoticeH = handwrittenOn ? handwrittenNoticeHeight() : 0;
  // `mainframe <label>` reserves a strip at the very top for the folded
  // corner tab. The diagram body is shifted down by tab + gap so the outer
  // bounding rectangle (drawn at the end) doesn't overlap any content.
  const mainframeSpans = ast.mainframe ? parseLabelMarkup(ast.mainframe) : [];
  const mainframeOn = mainframeSpans.length > 0;
  const mainframeTabH = mainframeOn ? MAINFRAME_TAB_H + MAINFRAME_GAP : 0;
  const headerTopY = TOP_PAD + handwrittenNoticeH + mainframeTabH + pageHeaderH + titleHeight + boxTopExtra;
  const headerH = maxHeaderHeight(parts);

  const body: Shape[] = [];
  const pageTitleShapes: Shape[] = [];
  const actStack: ActFrame[][] = parts.map(() => []);
  const finalizedActs: FinalizedActivation[] = [];
  // Lanes participate in the diagram in [bornY, diedY] — created-late
  // participants (`A -> B **`) start at the create message's y; destroyed
  // participants (`A -> B !!`) end at the destroy message's y with a red X.
  const bornY: Array<number | undefined> = parts.map(() => undefined);
  const diedY: Array<number | undefined> = parts.map(() => undefined);
  const destroyMarks: Array<{ laneIdx: number; y: number }> = [];
  // LIFO of (laneIdx, fromIdx) for `return`: pops the most-recent
  // autoactivate-created activation across all lanes.
  const callStack: Array<{ laneIdx: number; fromIdx: number }> = [];
  let autoActive = false;
  const groupStack: PendingGroup[] = [];
  // Each entry tracks the vertical range of a single page so we can draw
  // separate lifelines + top/bottom headers per page.
  const pages: Array<{ topY: number; bottomY: number }> = [];
  let pageTopY = headerTopY;
  const PAGE_GAP = 24;

  let y = headerTopY + headerH + MSG_GAP / 2;

  const touch = (...idxs: number[]): void => {
    for (const g of groupStack) {
      for (const i of idxs) {
        if (i < g.minLane) g.minLane = i;
        if (i > g.maxLane) g.maxLane = i;
      }
    }
  };

  for (let i = 0; i < ast.statements.length; i++) {
    const stmt = ast.statements[i]!;
    switch (stmt.type) {
      case 'autonumber':
        break;

      case 'newpage': {
        // Close any activations and groups still open on the current page.
        const pageBottomY = y;
        for (let li = 0; li < parts.length; li++) {
          while (actStack[li]!.length > 0) {
            const frame = actStack[li]!.pop()!;
            finalizedActs.push({
              laneIdx: li, level: actStack[li]!.length,
              yStart: frame.yStart, yEnd: pageBottomY, color: frame.color,
            });
          }
        }
        callStack.length = 0;
        while (groupStack.length > 0) {
          const g = groupStack.pop()!;
          if (g.minLane > g.maxLane) { g.minLane = 0; g.maxLane = parts.length - 1; }
          body.push(...drawGroup(g, pageBottomY + GROUP_PAD, laneCenters, headerW));
        }
        pages.push({ topY: pageTopY, bottomY: pageBottomY });

        // Start a new page below the previous one.
        y = pageBottomY + headerH + PAGE_GAP;
        if (stmt.title) {
          const titleLines = stmt.title.split('\n');
          const titleLineH = Math.ceil(TITLE_FONT_SIZE * 1.2);
          for (let ti = 0; ti < titleLines.length; ti++) {
            pageTitleShapes.push({
              type: 'text',
              x: diagramWidth / 2,
              y: y + (ti + 1) * titleLineH - 2,
              text: titleLines[ti]!,
              anchor: 'middle',
              baseline: 'alphabetic',
              font: { family: FONT_FAMILY, size: TITLE_FONT_SIZE, weight: 'bold', color: '#000' },
            });
          }
          y += titleLines.length * titleLineH + TITLE_GAP;
        }
        pageTopY = y;
        y += headerH + MSG_GAP / 2;
        break;
      }

      case 'activate': {
        const idx = laneIdx.get(stmt.target);
        if (idx === undefined) break;
        touch(idx);
        actStack[idx]!.push({ yStart: y - MSG_GAP / 2, color: COLOR_ACTIVATION_FILL });
        break;
      }

      case 'deactivate': {
        const idx = laneIdx.get(stmt.target);
        if (idx === undefined) break;
        touch(idx);
        const frame = actStack[idx]!.pop();
        if (frame !== undefined) {
          finalizedActs.push({
            laneIdx: idx,
            level: actStack[idx]!.length,
            yStart: frame.yStart,
            yEnd: y - MSG_GAP / 2,
            color: frame.color,
          });
        }
        break;
      }

      case 'autoactivate':
        autoActive = stmt.enabled;
        break;

      case 'return': {
        // Pop the most recent autoactivate-created frame: draw a dashed arrow
        // from its target lane back to its sender, then finalize its bar.
        const call = callStack.pop();
        if (!call) break;
        const { laneIdx: ti, fromIdx: fi } = call;
        touch(ti, fi);
        const frame = actStack[ti]!.pop();
        if (frame !== undefined) {
          finalizedActs.push({
            laneIdx: ti,
            level: actStack[ti]!.length,
            yStart: frame.yStart,
            yEnd: y - MSG_GAP / 2,
            color: frame.color,
          });
        }
        const label = stmt.text;
        if (ti === fi) {
          const self = drawSelfMessage(laneCenters[ti]!, y, label, 'dashed', false);
          body.push(...self.shapes);
          y += self.height + MSG_GAP;
        } else {
          const lineCount = label ? label.split('\n').length : 1;
          const labelHeadroom = lineCount > 1 ? (lineCount - 1) * MSG_LINE_H : 0;
          y += labelHeadroom;
          body.push(
            ...drawMessage(
              laneCenters[ti]!,
              laneCenters[fi]!,
              y,
              label,
              'dashed',
              ti < fi,
              'none',
              'arrow',
              undefined,
            ),
          );
          y += MSG_GAP;
        }
        break;
      }

      case 'groupStart': {
        const pg: PendingGroup = {
          kind: stmt.kind,
          label: stmt.label,
          yStart: y - MSG_GAP / 2,
          minLane: parts.length,
          maxLane: -1,
          dividers: [],
          branchColors: [stmt.branchColor],
        };
        if (stmt.tabColor) pg.tabColor = stmt.tabColor;
        groupStack.push(pg);
        y += GROUP_HEADER_HEIGHT + GROUP_PAD;
        break;
      }

      case 'groupElse': {
        const top = groupStack[groupStack.length - 1];
        if (top) {
          top.dividers.push({ y: y - MSG_GAP / 2, label: stmt.label });
          top.branchColors.push(stmt.branchColor);
          y += GROUP_PAD;
        }
        break;
      }

      case 'groupEnd': {
        const g = groupStack.pop();
        if (g) {
          const yEnd = y - MSG_GAP / 2 + GROUP_PAD;
          if (g.minLane > g.maxLane) {
            g.minLane = 0;
            g.maxLane = parts.length - 1;
          }
          if (groupStack.length > 0) touch(g.minLane, g.maxLane);
          body.push(...drawGroup(g, yEnd, laneCenters, headerW));
          y = yEnd + MSG_GAP / 2;
        }
        break;
      }

      case 'divider':
        body.push(...drawDivider(stmt, y - MSG_GAP / 2 + DIVIDER_GAP, diagramWidth));
        y += DIVIDER_HEIGHT + DIVIDER_GAP;
        break;

      case 'ref': {
        const idxs = stmt.targets
          .map((t) => laneIdx.get(t))
          .filter((v): v is number => v !== undefined);
        if (idxs.length > 0) {
          touch(Math.min(...idxs), Math.max(...idxs));
        }
        const drawn = drawRef(
          stmt, y, laneCenters, headerW, laneIdx,
          labels[i] ?? stmt.text,
        );
        body.push(...drawn.shapes);
        y += drawn.height + REF_GAP;
        break;
      }

      case 'note': {
        const idx1 = laneIdx.get(stmt.targets[0]);
        if (idx1 !== undefined) {
          if (stmt.targets.length === 2) {
            const idx2 = laneIdx.get(stmt.targets[1]) ?? idx1;
            touch(idx1, idx2);
          } else {
            touch(idx1);
          }
        }
        const drawn = drawNote(
          stmt, y, laneCenters, headerW, laneIdx,
          labels[i] ?? stmt.text, diagramWidth,
        );
        body.push(...drawn.shapes);
        y += drawn.height + NOTE_GAP;
        break;
      }

      case 'message': {
        // Found/lost boundary message — one end is the diagram edge instead
        // of a participant. Drawn as a short horizontal arrow between the
        // participant's lane center and the SIDE_PAD inset on the relevant
        // edge. Reuses drawMessage with the existing marker vocabulary.
        if (stmt.fromBoundary || stmt.toBoundary) {
          const partId = stmt.fromBoundary ? stmt.to : stmt.from;
          const partIdx = laneIdx.get(partId);
          if (partIdx === undefined) break;
          touch(partIdx);
          const label = labels[i] ?? '';
          const lineCount = label ? label.split('\n').length : 1;
          const labelHeadroom = lineCount > 1 ? (lineCount - 1) * MSG_LINE_H : 0;
          y += labelHeadroom;
          const side = stmt.fromBoundary ?? stmt.toBoundary!;
          const partX = laneCenters[partIdx]!;
          // For long boundaries (`[` / `]`), the non-participant end is the
          // diagram's left/right edge minus the inset. For short boundaries
          // (`?`), it's a small fixed offset from the participant's lane
          // center on the appropriate side.
          let edgeX: number;
          if (side === 'left') edgeX = SIDE_PAD + BOUNDARY_INSET;
          else if (side === 'right') edgeX = diagramWidth - SIDE_PAD - BOUNDARY_INSET;
          else if (side === 'short-left') edgeX = partX - SHORT_BOUNDARY_OFFSET;
          else edgeX = partX + SHORT_BOUNDARY_OFFSET; // 'short-right'
          // x1/x2 are the arrow's "from" / "to" x coordinates respectively, so
          // the existing leftToRight = fromX < toX rule still produces the
          // correct head orientation.
          const x1 = stmt.fromBoundary ? edgeX : partX;
          const x2 = stmt.fromBoundary ? partX : edgeX;
          const slopeDy = stmt.duration ? stmt.duration * DURATION_SCALE : 0;
          body.push(
            ...drawMessage(
              x1,
              x2,
              y,
              label,
              stmt.style,
              x1 < x2,
              stmt.startMarker ?? 'none',
              stmt.endMarker ?? 'arrow',
              stmt.color,
              slopeDy > 0 ? y + slopeDy : undefined,
            ),
          );
          y += MSG_GAP + slopeDy;
          break;
        }
        const fromIdx = laneIdx.get(stmt.from);
        const toIdx = laneIdx.get(stmt.to);
        if (fromIdx === undefined || toIdx === undefined) break;
        touch(fromIdx, toIdx);
        const label = labels[i] ?? '';

        // `create` marks the target's lifeline starting point. The header
        // for that lane is drawn at this y instead of at the diagram top.
        if (stmt.create && bornY[toIdx] === undefined) {
          bornY[toIdx] = y - MSG_GAP / 2;
        }

        // Vertical space for the created participant's box (sits just above
        // the arrow tip). Without this, the arrow would pass through the
        // header rectangle.
        const createHeadroom = stmt.create ? headerH + 4 : 0;
        if (createHeadroom > 0) y += createHeadroom;

        // `A -> B --` — deactivate the sender BEFORE the arrow's y is committed
        // so the arrow leaves from the (now-shorter) outer frame.
        if (stmt.deactivateSource) {
          const frame = actStack[fromIdx]!.pop();
          if (frame !== undefined) {
            finalizedActs.push({
              laneIdx: fromIdx,
              level: actStack[fromIdx]!.length,
              yStart: frame.yStart,
              yEnd: y - 2,
              color: frame.color,
            });
            // If the popped frame was tracked by the call stack, drop the
            // matching entry so a later `return` doesn't double-pop it.
            for (let k = callStack.length - 1; k >= 0; k--) {
              if (callStack[k]!.laneIdx === fromIdx) {
                callStack.splice(k, 1);
                break;
              }
            }
          }
        }

        // Whether this message should push an activation frame on the target.
        // Either autoactivate is on, OR the message has a per-message `++`.
        const pushActivation = autoActive || stmt.activateTarget === true;

        if (fromIdx === toIdx) {
          const self = drawSelfMessage(
            laneCenters[fromIdx]!, y, label, stmt.style, stmt.reverse,
          );
          body.push(...self.shapes);
          const msgY = y + (self.height - SELF_MSG_H / 2);
          if (pushActivation) {
            actStack[toIdx]!.push({
              yStart: y - 2,
              color: stmt.color ?? '#ffffff',
              fromIdx,
            });
            callStack.push({ laneIdx: toIdx, fromIdx });
          }
          y += self.height + MSG_GAP;
          void msgY;
        } else {
          const lineCount = label ? label.split('\n').length : 1;
          const labelHeadroom = lineCount > 1 ? (lineCount - 1) * MSG_LINE_H : 0;
          y += labelHeadroom;
          const slopeDy = stmt.duration ? stmt.duration * DURATION_SCALE : 0;
          body.push(
            ...drawMessage(
              laneCenters[fromIdx]!,
              laneCenters[toIdx]!,
              y,
              label,
              stmt.style,
              fromIdx < toIdx,
              stmt.startMarker ?? 'none',
              stmt.endMarker ?? 'arrow',
              stmt.color,
              slopeDy > 0 ? y + slopeDy : undefined,
            ),
          );
          if (pushActivation) {
            actStack[toIdx]!.push({
              yStart: y - 2,
              color: stmt.color ?? '#ffffff',
              fromIdx,
            });
            callStack.push({ laneIdx: toIdx, fromIdx });
          }
          if (stmt.destroy) {
            destroyMarks.push({ laneIdx: toIdx, y });
            diedY[toIdx] = y + 8;
          }
          y += MSG_GAP + slopeDy;
        }
        break;
      }
    }
  }

  const bottomY = y;

  for (let i = 0; i < parts.length; i++) {
    while (actStack[i]!.length > 0) {
      const frame = actStack[i]!.pop()!;
      finalizedActs.push({
        laneIdx: i,
        level: actStack[i]!.length,
        yStart: frame.yStart,
        yEnd: diedY[i] ?? bottomY,
        color: frame.color,
      });
    }
  }

  while (groupStack.length > 0) {
    const g = groupStack.pop()!;
    if (g.minLane > g.maxLane) {
      g.minLane = 0;
      g.maxLane = parts.length - 1;
    }
    body.push(...drawGroup(g, bottomY + GROUP_PAD, laneCenters, headerW));
  }

  // Close the final page.
  pages.push({ topY: pageTopY, bottomY });

  // Per-page lifelines + top/bottom headers. Each page's lifeline spans only
  // its own message range; headers repeat at every page boundary.
  // Lanes with `bornY` set (created mid-diagram) have their top header drawn
  // at the message's y instead of at the page top, and the lifeline starts
  // from there. Lanes with `diedY` set (destroyed mid-diagram) have their
  // lifeline truncated at that y and skip the bottom header.
  const lifelines: Shape[] = [];
  const headers: Shape[] = [];
  for (const page of pages) {
    const pageBottomLine = page.bottomY + 8;
    for (let i = 0; i < parts.length; i++) {
      const cx = laneCenters[i]!;
      const topY = bornY[i] !== undefined
        ? Math.max(page.topY + headerH, bornY[i]!)
        : page.topY + headerH;
      const botY = diedY[i] !== undefined
        ? Math.min(pageBottomLine, diedY[i]!)
        : pageBottomLine;
      if (botY > topY) {
        const lifelineStroke = getSkin().lifelineBorderColor ?? COLOR_LIFELINE;
        // `<style> lifeLine { LineStyle ... }` override. `'none'` means
        // explicit solid (no dasharray); other strings replace the default;
        // `undefined` keeps the default `'4,4'`.
        const styleDash = getStyles().lifelineDasharray;
        const dashStyle: { stroke: string; strokeWidth: number; strokeDasharray?: string } = {
          stroke: lifelineStroke, strokeWidth: 1,
        };
        if (styleDash === undefined) dashStyle.strokeDasharray = '4,4';
        else if (styleDash !== 'none') dashStyle.strokeDasharray = styleDash;
        lifelines.push({
          type: 'line',
          x1: cx, y1: topY, x2: cx, y2: botY,
          style: dashStyle,
        });
      }
    }
    for (let i = 0; i < parts.length; i++) {
      const topHeaderY = bornY[i] !== undefined
        ? Math.max(page.topY, bornY[i]! - headerH)
        : page.topY;
      headers.push(...drawHeader(parts[i]!, laneCenters[i]!, headerW[i]!, topHeaderY, headerH));
      if (diedY[i] === undefined) {
        headers.push(...drawHeader(parts[i]!, laneCenters[i]!, headerW[i]!, pageBottomLine, headerH));
      }
    }
  }
  const lifelineBottom = pages[pages.length - 1]!.bottomY + 8;

  const acts: Shape[] = finalizedActs.map((r) => ({
    type: 'rect',
    x: laneCenters[r.laneIdx]! - ACT_WIDTH / 2 + r.level * (ACT_WIDTH / 2),
    y: r.yStart,
    w: ACT_WIDTH,
    h: r.yEnd - r.yStart,
    style: { fill: r.color, stroke: COLOR_LINE, strokeWidth: 1 },
  }));

  // Red X marker for destroyed participants — drawn on top of the lane at
  // the destroy message's y.
  const destroyShapes: Shape[] = [];
  for (const d of destroyMarks) {
    const cx = laneCenters[d.laneIdx]!;
    const cy = d.y;
    const r = 7;
    const style = { stroke: '#a00', strokeWidth: 2.5 };
    destroyShapes.push(
      { type: 'line', x1: cx - r, y1: cy - r, x2: cx + r, y2: cy + r, style },
      { type: 'line', x1: cx - r, y1: cy + r, x2: cx + r, y2: cy - r, style },
    );
  }

  const pageHeaderShapes: Shape[] = pageHeaderLines.map((line, i) => ({
    type: 'text',
    x: SIDE_PAD,
    y: TOP_PAD + (i + 1) * PAGE_HEADER_LINE_H - 4,
    text: line,
    anchor: 'start',
    baseline: 'alphabetic',
    font: { family: FONT_FAMILY, size: PAGE_HEADER_FONT_SIZE, color: COLOR_PAGE_MARGIN },
  }));

  const titleShapes: Shape[] = ast.title
    ? [
        {
          type: 'text',
          x: diagramWidth / 2,
          y: TOP_PAD + pageHeaderH + TITLE_FONT_SIZE,
          text: ast.title,
          anchor: 'middle',
          baseline: 'alphabetic',
          font: { family: FONT_FAMILY, size: TITLE_FONT_SIZE, weight: 'bold', color: '#000' },
        },
      ]
    : [];

  const bottomBlockY = lifelineBottom + headerH + PAGE_HEADER_GAP;
  const pageFooterShapes: Shape[] = pageFooterLines.map((line, i) => ({
    type: 'text',
    x: SIDE_PAD,
    y: bottomBlockY + (i + 1) * PAGE_HEADER_LINE_H - 4,
    text: line,
    anchor: 'start',
    baseline: 'alphabetic',
    font: { family: FONT_FAMILY, size: PAGE_HEADER_FONT_SIZE, color: COLOR_PAGE_MARGIN },
  }));

  const totalHeight = lifelineBottom + headerH + pageFooterH + BOTTOM_PAD;

  // `box ... end box` rectangles. Built once at the end so we know the full
  // diagram's vertical extent (top of first page header → bottom of last
  // page header). Drawn BEFORE lifelines/acts/headers so they sit behind
  // every other shape (z-order is array order in the renderer).
  const boxShapes = buildBoxShapes(parts, laneCenters, headerW, pages, headerH, lifelineBottom);

  // `skinparam handwritten true` — emit the upstream-PlantUML "use !option"
  // notice at the very top. Built last so we can size the box against the
  // final diagram width if needed.
  const handwrittenShapes: Shape[] = [];
  if (handwrittenOn) {
    const boxW = handwrittenNoticeWidth();
    // If the notice is wider than the diagram, grow the diagram width.
    const need = boxW + SIDE_PAD * 2;
    if (need > diagramWidth) diagramWidth = need;
    handwrittenShapes.push(...buildHandwrittenNoticeShapes(SIDE_PAD, TOP_PAD));
  }

  // `mainframe <label>` — outer bounding rectangle with a folded-corner tab
  // in the top-left. Built last so we can size the frame against the final
  // diagram width / height. Tab geometry reuses the same fold-notch shape as
  // `drawRef`. The label is rendered through `parseLabelMarkup` so `**bold**`
  // (and other inline markup) renders correctly.
  const mainframeShapes: Shape[] = [];
  if (mainframeOn) {
    const spans = mainframeSpans;
    let labelW = 0;
    for (const sp of spans) labelW += measureText(sp.text, FONT_SIZE).width;
    const tabW = labelW + MAINFRAME_TAB_PAD_X * 2;
    // Grow the diagram if the tab plus the fold notch + a tiny right buffer
    // would otherwise spill past the frame's right edge.
    const tabNeed = MAINFRAME_FRAME_PAD + tabW + MAINFRAME_TAB_FOLD + SIDE_PAD;
    if (tabNeed > diagramWidth) diagramWidth = tabNeed;
    const fx = MAINFRAME_FRAME_PAD;
    const fy = MAINFRAME_FRAME_PAD;
    const fw = diagramWidth - MAINFRAME_FRAME_PAD * 2;
    const fh = totalHeight - MAINFRAME_FRAME_PAD * 2;
    // Outer frame — no fill, dark stroke.
    mainframeShapes.push({
      type: 'rect',
      x: fx, y: fy, w: fw, h: fh,
      style: { fill: 'none', stroke: '#000', strokeWidth: 1 },
    });
    // Folded-corner tab anchored to the frame's top-left interior.
    const tx = fx;
    const ty = fy;
    mainframeShapes.push({
      type: 'polygon',
      points: [
        [tx, ty],
        [tx + tabW, ty],
        [tx + tabW + MAINFRAME_TAB_FOLD, ty + MAINFRAME_TAB_FOLD],
        [tx + tabW + MAINFRAME_TAB_FOLD, ty + MAINFRAME_TAB_H],
        [tx, ty + MAINFRAME_TAB_H],
      ],
      style: { fill: '#fff', stroke: '#000', strokeWidth: 1 },
    });
    // Fold notch — the small diagonal that closes the tab's bottom-right.
    mainframeShapes.push({
      type: 'polyline',
      points: [
        [tx + tabW, ty],
        [tx + tabW, ty + MAINFRAME_TAB_FOLD],
        [tx + tabW + MAINFRAME_TAB_FOLD, ty + MAINFRAME_TAB_FOLD],
      ],
      style: { fill: 'none', stroke: '#000', strokeWidth: 1 },
    });
    // Bold-aware label inside the tab, vertically centered.
    mainframeShapes.push(
      ...drawLabelSpans(
        spans,
        tx + tabW / 2,
        ty + MAINFRAME_TAB_H / 2,
        'middle',
        'middle',
        FONT_SIZE,
      ),
    );
  }

  // Background skinparam — emit a full-canvas rect behind everything so the
  // diagram body sits on the configured color instead of the SVG default.
  const skin = getSkin();
  const bgShapes: Shape[] = [];
  if (skin.backgroundColor) {
    bgShapes.push({
      type: 'rect',
      x: 0, y: 0, w: diagramWidth, h: totalHeight,
      style: { fill: skin.backgroundColor, stroke: 'none', strokeWidth: 0 },
    });
  }

  return {
    width: diagramWidth,
    height: totalHeight,
    background: skin.backgroundColor ?? '#fff',
    children: [
      ...bgShapes,
      ...pageHeaderShapes,
      ...titleShapes,
      ...pageTitleShapes,
      ...boxShapes,
      ...lifelines,
      ...acts,
      ...body,
      ...headers,
      ...destroyShapes,
      ...pageFooterShapes,
      ...handwrittenShapes,
      ...mainframeShapes,
    ],
  };
}

/**
 * Builds the visual rectangles for every `box ... end box` declaration in
 * the diagram. Contiguous lanes sharing the same `box.id` are grouped into a
 * single rectangle whose horizontal extent wraps the leftmost lane's header
 * to the rightmost lane's header plus BOX_PAD_X, and whose vertical extent
 * spans every page's top header through bottom header. Returns shapes ready
 * to drop into the scene tree (rectangle + optional title text).
 */
function buildBoxShapes(
  parts: import('../../ast/sequence.js').Participant[],
  laneCenters: number[],
  headerW: number[],
  pages: Array<{ topY: number; bottomY: number }>,
  headerH: number,
  lifelineBottom: number,
): Shape[] {
  if (parts.length === 0 || pages.length === 0) return [];
  // Group contiguous lanes with the same box id. A non-boxed lane breaks the
  // run; lanes inside the same box but with another box between are unlikely
  // (PlantUML rejects nested boxes) but we still group only on contiguous
  // same-id runs.
  type Run = { box: NonNullable<import('../../ast/sequence.js').Participant['box']>; lo: number; hi: number };
  const runs: Run[] = [];
  for (let i = 0; i < parts.length; i++) {
    const b = parts[i]!.box;
    if (!b) continue;
    const last = runs[runs.length - 1];
    if (last && last.box.id === b.id && last.hi === i - 1) {
      last.hi = i;
    } else {
      runs.push({ box: b, lo: i, hi: i });
    }
  }
  if (runs.length === 0) return [];

  // Vertical extent: from just above the first page's top header (with a
  // title strip carved out above) down to just below the bottom header on
  // the last page.
  const top = pages[0]!.topY - BOX_TITLE_STRIP;
  const bottom = lifelineBottom + headerH + BOX_PAD_Y;

  const shapes: Shape[] = [];
  for (const run of runs) {
    const left = laneCenters[run.lo]! - headerW[run.lo]! / 2 - BOX_PAD_X;
    const right = laneCenters[run.hi]! + headerW[run.hi]! / 2 + BOX_PAD_X;
    const fill = run.box.color ?? '#eeeeee';
    shapes.push({
      type: 'rect',
      x: left,
      y: top,
      w: right - left,
      h: bottom - top,
      style: { fill, stroke: '#888', strokeWidth: 1 },
    });
    if (run.box.title) {
      shapes.push({
        type: 'text',
        x: left + 8,
        y: top + BOX_TITLE_STRIP - 6,
        text: run.box.title,
        anchor: 'start',
        baseline: 'alphabetic',
        font: { family: FONT_FAMILY, size: BOX_TITLE_FONT_SIZE, weight: 'bold', color: '#000' },
      });
    }
  }
  return shapes;
}

function precomputeMessageLabels(stmts: SequenceStatement[]): string[] {
  const out = new Array<string>(stmts.length);
  let autoEnabled = false;
  let autoLevels: number[] = [];
  let autoStep = 1;
  let autoFormat: string | undefined;
  let lastAutoStr = '';
  for (let i = 0; i < stmts.length; i++) {
    const s = stmts[i]!;
    if (s.type === 'autonumber') {
      if (s.mode === 'stop') {
        autoEnabled = false;
      } else if (s.mode === 'resume') {
        autoEnabled = true;
        if (s.step !== undefined) autoStep = s.step;
        if (s.format !== undefined) autoFormat = s.format;
      } else if (s.mode === 'inc') {
        const lvl = s.incLevel ?? 0;
        if (lvl < autoLevels.length) {
          autoLevels[lvl]! += 1;
          for (let k = lvl + 1; k < autoLevels.length; k++) autoLevels[k] = 1;
        }
      } else {
        autoEnabled = true;
        autoLevels = s.start ? [...s.start] : [1];
        autoStep = s.step ?? 1;
        autoFormat = s.format;
      }
      out[i] = '';
    } else if (s.type === 'message') {
      let body = s.text;
      let prefix = '';
      if (autoEnabled && autoLevels.length > 0) {
        const numStr = autoLevels.join('.');
        body = substituteAutoNumber(body, numStr);
        if (autoFormat) {
          // For multi-level counters with a format string, substitute via the
          // joined dotted string. Single-level formats keep zero-padding via
          // the `0`/`#` placeholder logic.
          const formatted = autoLevels.length > 1
            ? autoFormat.replace(/0+|#+/g, numStr)
            : formatAutoNumber(autoFormat, autoLevels[0]!);
          prefix = closeOpenTags(formatted) + ' ';
        } else {
          prefix = `${numStr} `;
        }
        lastAutoStr = numStr;
        // Advance the last level by step.
        autoLevels[autoLevels.length - 1]! += autoStep;
      }
      out[i] = resolveUnicodeEscapes(prefix + body);
    } else if (s.type === 'note') {
      // Notes substitute `%autonumber%` with the most recently used number
      // (PlantUML本家 behavior). Leading whitespace from indented note lines
      // is trimmed to match the canonical rendering.
      const lines = s.text.split('\n').map((line) =>
        resolveUnicodeEscapes(substituteAutoNumber(line.replace(/^\s+/, ''), lastAutoStr)),
      );
      out[i] = lines.join('\n');
    } else if (s.type === 'ref') {
      const lines = s.text.split('\n').map((line) =>
        resolveUnicodeEscapes(line.replace(/^\s+/, '')),
      );
      out[i] = lines.join('\n');
    } else {
      out[i] = '';
    }
  }
  return out;
}

function substituteAutoNumber(text: string, value: string): string {
  return text.replace(/%autonumber%/g, value);
}

function resolveUnicodeEscapes(text: string): string {
  return text.replace(/<U\+([0-9A-Fa-f]+)>/g, (_, hex) => {
    const code = parseInt(hex, 16);
    if (Number.isFinite(code) && code >= 0 && code <= 0x10FFFF) {
      try { return String.fromCodePoint(code); } catch { return ''; }
    }
    return '';
  });
}

function formatAutoNumber(format: string, n: number): string {
  // Replace runs of `0` or `#` with the number, zero-padded to the run length.
  return format.replace(/0+|#+/g, (run) => String(n).padStart(run.length, '0'));
}

/**
 * Appends closing tags for any open `<b>`/`<u>`/`<font>` left in `s`, so the
 * caller can safely append more content (e.g., the message body) without it
 * inheriting the format prefix's styles.
 */
function closeOpenTags(s: string): string {
  const open: string[] = [];
  let i = 0;
  while (i < s.length) {
    if (s[i] === '<') {
      const m = /^<\s*(\/?)([A-Za-z]+)[^>]*>/.exec(s.slice(i));
      if (m) {
        const closing = m[1] === '/';
        const tag = m[2]!.toLowerCase();
        if (closing) {
          const idx = open.lastIndexOf(tag);
          if (idx !== -1) open.splice(idx, 1);
        } else {
          open.push(tag);
        }
        i += m[0].length;
        continue;
      }
    }
    i++;
  }
  let out = s;
  for (let k = open.length - 1; k >= 0; k--) {
    out += `</${open[k]}>`;
  }
  return out;
}

function computeLaneGaps(
  stmts: SequenceStatement[],
  labels: string[],
  laneIdx: Map<string, number>,
  headerW: number[],
  laneCount: number,
): number[] {
  if (laneCount < 2) return [];
  const gaps = new Array<number>(laneCount - 1).fill(LANE_GAP);

  for (let i = 0; i < stmts.length; i++) {
    const s = stmts[i]!;
    if (s.type !== 'message') continue;
    const fromIdx = laneIdx.get(s.from);
    const toIdx = laneIdx.get(s.to);
    if (fromIdx === undefined || toIdx === undefined || fromIdx === toIdx) continue;
    const text = labels[i]!;
    if (!text) continue;
    const need = measureText(text, FONT_SIZE).width + MSG_TEXT_HPAD * 2;
    const lo = Math.min(fromIdx, toIdx);
    const hi = Math.max(fromIdx, toIdx);
    let cur = (headerW[lo]! + headerW[hi]!) / 2;
    for (let k = lo + 1; k < hi; k++) cur += headerW[k]!;
    for (let k = lo; k < hi; k++) cur += gaps[k]!;
    if (cur < need) {
      const perGap = (need - cur) / (hi - lo);
      for (let k = lo; k < hi; k++) gaps[k]! += perGap;
    }
  }

  // `note left of X` where X is an inner lane (X > 0) needs the gap to the
  // LEFT of X to fit the note's width. `note right of X` for an inner lane
  // (X < laneCount-1) needs the gap to the RIGHT of X to fit. Without this,
  // long side notes overflow into neighbouring participants' area.
  for (const s of stmts) {
    if (s.type !== 'note') continue;
    if (s.position !== 'left' && s.position !== 'right') continue;
    const idx = laneIdx.get(s.targets[0]!);
    if (idx === undefined) continue;
    const lines = s.text ? s.text.split('\n') : [];
    let maxLineW = 0;
    for (const line of lines) {
      const w = measureText(line, FONT_SIZE).width;
      if (w > maxLineW) maxLineW = w;
    }
    const noteW = maxLineW + NOTE_PAD_X * 2;
    const need = noteW + NOTE_SIDE_OFFSET + headerW[idx]! / 2;
    if (s.position === 'left' && idx > 0) {
      // Gap between idx-1 and idx must accommodate the note plus the right
      // half of lane idx-1's header.
      const gapNeed = noteW + NOTE_SIDE_OFFSET + headerW[idx - 1]! / 2;
      if (gaps[idx - 1]! < gapNeed) gaps[idx - 1] = gapNeed;
    } else if (s.position === 'right' && idx < laneCount - 1) {
      const gapNeed = noteW + NOTE_SIDE_OFFSET + headerW[idx + 1]! / 2;
      if (gaps[idx]! < gapNeed) gaps[idx] = gapNeed;
    }
    void need;
  }

  // `ref over A[, B, ...]` — when the box spans multiple lanes, its content
  // (text + tab) must fit between the leftmost and rightmost lane centers.
  // For a single-lane ref, the body sits within that lane's header span, so
  // no gap growth is needed.
  for (const s of stmts) {
    if (s.type !== 'ref') continue;
    const idxs = s.targets
      .map((t) => laneIdx.get(t))
      .filter((v): v is number => v !== undefined);
    if (idxs.length < 2) continue;
    const lo = Math.min(...idxs);
    const hi = Math.max(...idxs);
    const lines = s.text ? s.text.split('\n') : [];
    let maxLineW = 0;
    for (const line of lines) {
      const w = measureText(line, FONT_SIZE).width;
      if (w > maxLineW) maxLineW = w;
    }
    const tabBlockW = measureText('ref', FONT_SIZE).width + 16 + REF_TAB_FOLD + 8;
    const need = Math.max(maxLineW + REF_PAD_X * 2, tabBlockW);
    let cur = (headerW[lo]! + headerW[hi]!) / 2;
    for (let k = lo + 1; k < hi; k++) cur += headerW[k]!;
    for (let k = lo; k < hi; k++) cur += gaps[k]!;
    if (cur < need) {
      const perGap = (need - cur) / (hi - lo);
      for (let k = lo; k < hi; k++) gaps[k]! += perGap;
    }
  }

  return gaps;
}

function drawMessage(
  x1: number,
  x2: number,
  y: number,
  text: string,
  style: 'solid' | 'dashed',
  leftToRight: boolean,
  startMarker: ArrowMarker,
  endMarker: ArrowMarker,
  colorIn?: string,
  // Optional end-y for slanted/timed arrows (`A ->(N) B`). When omitted, the
  // arrow is horizontal (y1 === y2 === y). When provided, the tail sits at
  // (x1, y) and the head at (x2, yEnd); the line slopes accordingly. Arrow
  // heads stay horizontal — the slope is mild, and the head's tip lands at
  // the slanted end so it visually anchors to the receiver's lifeline.
  yEnd?: number,
): Shape[] {
  // Per-message color (from the arrow's `[#color]`) wins; otherwise pick up
  // the diagram-wide skinparam ArrowColor; otherwise the default ink color.
  const color = colorIn ?? getSkin().arrowColor ?? COLOR_LINE;
  const lineStyle =
    style === 'dashed'
      ? { stroke: color, strokeWidth: 1, strokeDasharray: '5,3' }
      : { stroke: color, strokeWidth: 1 };
  const y2 = yEnd ?? y;
  const shapes: Shape[] = [
    { type: 'line', x1, y1: y, x2, y2, style: lineStyle },
  ];
  const endTipPointsRight = leftToRight;
  const startTipPointsRight = !leftToRight;
  shapes.push(...drawArrowMarker(endMarker, x2, y2, endTipPointsRight, color));
  shapes.push(...drawArrowMarker(startMarker, x1, y, startTipPointsRight, color));
  if (text) {
    const lines = text.split('\n');
    const cx = (x1 + x2) / 2;
    // Label rides above the midpoint of the (possibly slanted) line so it
    // tracks the arrow's vertical center for timed messages.
    const midY = (y + y2) / 2;
    const baseY = midY - MSG_TEXT_PAD;
    for (let i = 0; i < lines.length; i++) {
      const offset = (lines.length - 1 - i) * MSG_LINE_H;
      const spans = parseLabelMarkup(lines[i]!);
      shapes.push(...drawLabelSpans(spans, cx, baseY - offset, 'middle'));
    }
  }
  return shapes;
}

const MSG_LINE_H = 14;

function drawSelfMessage(
  cx: number,
  y: number,
  text: string,
  style: 'solid' | 'dashed',
  reverse: boolean,
): { shapes: Shape[]; height: number } {
  // dir = -1 for `A <- A` (loop mirrored to the LEFT of the lifeline),
  // dir = +1 for `A -> A` (loop on the RIGHT, default PlantUML rendering).
  const dir = reverse ? -1 : 1;
  const x1 = cx;
  const x2 = cx + dir * SELF_MSG_W;
  const lines = text ? text.split('\n') : [];
  const textBlockH = lines.length > 0 ? lines.length * MSG_LINE_H + 4 : 0;
  const loopY = y + textBlockH;
  const arrowColor = getSkin().arrowColor ?? COLOR_LINE;
  const lineStyle =
    style === 'dashed'
      ? { stroke: arrowColor, strokeWidth: 1, fill: 'none', strokeDasharray: '5,3' }
      : { stroke: arrowColor, strokeWidth: 1, fill: 'none' };

  const shapes: Shape[] = [];

  for (let i = 0; i < lines.length; i++) {
    const spans = parseLabelMarkup(lines[i]!);
    shapes.push(
      ...drawLabelSpans(
        spans,
        x1 + dir * 6,
        y + (i + 0.5) * MSG_LINE_H + 2,
        reverse ? 'end' : 'start',
        'middle',
      ),
    );
  }

  shapes.push({
    type: 'polyline',
    points: [
      [x1, loopY],
      [x2, loopY],
      [x2, loopY + SELF_MSG_H],
      [x1, loopY + SELF_MSG_H],
    ],
    style: lineStyle,
  });
  // Arrow head sits at the lifeline, pointing back INTO it from the loop side.
  // For `->`, that means pointing left (leftToRight=false flips the polygon).
  // For `<-`, the loop is on the left, so arrow points right (leftToRight=true).
  shapes.push(arrowHead(x1, loopY + SELF_MSG_H, reverse, arrowColor));

  return { shapes, height: textBlockH + SELF_MSG_H };
}

function arrowHead(tipX: number, tipY: number, leftToRight: boolean, color: string = COLOR_LINE): Shape {
  const baseX = leftToRight ? tipX - ARROW_HEAD : tipX + ARROW_HEAD;
  return {
    type: 'polygon',
    points: [
      [tipX, tipY],
      [baseX, tipY - ARROW_HEAD / 2],
      [baseX, tipY + ARROW_HEAD / 2],
    ],
    style: { fill: color, stroke: color, strokeWidth: 1 },
  };
}

function drawArrowMarker(
  marker: ArrowMarker,
  tipX: number,
  tipY: number,
  pointsRight: boolean,
  color: string = COLOR_LINE,
): Shape[] {
  switch (marker) {
    case 'none':
      return [];
    case 'arrow':
      return [arrowHead(tipX, tipY, pointsRight, color)];
    case 'arrow-open':
      return drawArrowOpen(tipX, tipY, pointsRight, color);
    case 'half-up':
      return [drawHalfStroke(tipX, tipY, pointsRight, 'up', color)];
    case 'half-down':
      return [drawHalfStroke(tipX, tipY, pointsRight, 'down', color)];
    case 'x':
      return drawXMark(tipX, tipY, color);
    case 'circle':
      return [drawDot(tipX, tipY, color)];
  }
}

function drawArrowOpen(tipX: number, tipY: number, pointsRight: boolean, color: string): Shape[] {
  const baseX = pointsRight ? tipX - ARROW_HEAD : tipX + ARROW_HEAD;
  const style = { stroke: color, strokeWidth: 1, fill: 'none' };
  return [
    { type: 'line', x1: tipX, y1: tipY, x2: baseX, y2: tipY - ARROW_HEAD / 2, style },
    { type: 'line', x1: tipX, y1: tipY, x2: baseX, y2: tipY + ARROW_HEAD / 2, style },
  ];
}

function drawHalfStroke(
  tipX: number,
  tipY: number,
  pointsRight: boolean,
  half: 'up' | 'down',
  color: string,
): Shape {
  const baseX = pointsRight ? tipX - ARROW_HEAD : tipX + ARROW_HEAD;
  const dy = half === 'up' ? -ARROW_HEAD / 2 : ARROW_HEAD / 2;
  return {
    type: 'line',
    x1: tipX, y1: tipY,
    x2: baseX, y2: tipY + dy,
    style: { stroke: color, strokeWidth: 1 },
  };
}

function drawXMark(cx: number, cy: number, color: string): Shape[] {
  const r = 5;
  const style = { stroke: color, strokeWidth: 1.5 };
  return [
    { type: 'line', x1: cx - r, y1: cy - r, x2: cx + r, y2: cy + r, style },
    { type: 'line', x1: cx - r, y1: cy + r, x2: cx + r, y2: cy - r, style },
  ];
}

function drawDot(cx: number, cy: number, color: string): Shape {
  return {
    type: 'circle',
    cx, cy, r: 4,
    style: { fill: color, stroke: color, strokeWidth: 1 },
  };
}

function drawNote(
  stmt: NoteStmt,
  y: number,
  laneCenters: number[],
  headerW: number[],
  laneIdx: Map<string, number>,
  text: string,
  diagramWidth: number,
): { shapes: Shape[]; height: number } {
  const lines = text.split('\n');
  const allSpans = lines.map(parseLabelMarkup);
  let maxLineW = 0;
  for (const spans of allSpans) {
    let lineW = 0;
    for (const sp of spans) lineW += measureText(sp.text, FONT_SIZE).width;
    if (lineW > maxLineW) maxLineW = lineW;
  }
  const lineH = FONT_SIZE * 1.25;
  // Hexagon ends pinch inward by `inset`; widen the box so text isn't clipped.
  const shapePad = stmt.shape === 'hnote' ? 16 : 0;
  const textW = maxLineW + NOTE_PAD_X * 2 + shapePad;
  const noteH = lines.length * lineH + NOTE_PAD_Y * 2;

  let x: number;
  let noteW = textW;
  const idx1 = stmt.targets[0] !== undefined
    ? laneIdx.get(stmt.targets[0]) ?? 0
    : 0;
  if (stmt.position === 'across') {
    // Spans the full diagram — from SIDE_PAD to diagramWidth - SIDE_PAD.
    const SIDE_BLEED = 4;
    x = SIDE_PAD - SIDE_BLEED;
    noteW = Math.max(textW, diagramWidth - 2 * (SIDE_PAD - SIDE_BLEED));
  } else if (stmt.position === 'over') {
    if (stmt.targets.length === 2) {
      const idx2 = laneIdx.get(stmt.targets[1]!) ?? idx1;
      const left = Math.min(idx1, idx2);
      const right = Math.max(idx1, idx2);
      const spanLeft = laneCenters[left]! - headerW[left]! / 2;
      const spanRight = laneCenters[right]! + headerW[right]! / 2;
      const spanW = spanRight - spanLeft;
      noteW = Math.max(textW, spanW);
      x = (spanLeft + spanRight) / 2 - noteW / 2;
    } else {
      x = laneCenters[idx1]! - noteW / 2;
    }
  } else if (stmt.position === 'left') {
    x = laneCenters[idx1]! - headerW[idx1]! / 2 - noteW - NOTE_SIDE_OFFSET;
  } else {
    x = laneCenters[idx1]! + headerW[idx1]! / 2 + NOTE_SIDE_OFFSET;
  }

  const fill = stmt.color ?? COLOR_NOTE_FILL;
  const noteStyle = { fill, stroke: COLOR_NOTE_STROKE, strokeWidth: 1 };
  const foldStyle = { stroke: COLOR_NOTE_STROKE, strokeWidth: 1, fill: 'none' };
  const shape = stmt.shape ?? 'note';
  const shapes: Shape[] = [];

  if (shape === 'rnote') {
    shapes.push({
      type: 'rect', x, y, w: noteW, h: noteH, style: noteStyle,
    });
  } else if (shape === 'hnote') {
    const inset = 10;
    shapes.push({
      type: 'polygon',
      points: [
        [x + inset, y],
        [x + noteW - inset, y],
        [x + noteW, y + noteH / 2],
        [x + noteW - inset, y + noteH],
        [x + inset, y + noteH],
        [x, y + noteH / 2],
      ],
      style: noteStyle,
    });
  } else {
    // Default folded rectangle.
    shapes.push({
      type: 'polygon',
      points: [
        [x, y],
        [x + noteW - NOTE_FOLD, y],
        [x + noteW, y + NOTE_FOLD],
        [x + noteW, y + noteH],
        [x, y + noteH],
      ],
      style: noteStyle,
    });
    shapes.push({
      type: 'polyline',
      points: [
        [x + noteW - NOTE_FOLD, y],
        [x + noteW - NOTE_FOLD, y + NOTE_FOLD],
        [x + noteW, y + NOTE_FOLD],
      ],
      style: foldStyle,
    });
  }

  // For hnote, push the text inward to clear the pinched ends.
  const textXOffset = shape === 'hnote' ? NOTE_PAD_X + 4 : NOTE_PAD_X;
  for (let i = 0; i < lines.length; i++) {
    const spans = allSpans[i]!;
    const baseY = y + NOTE_PAD_Y + FONT_SIZE * 0.9 + i * lineH;
    shapes.push(...drawLabelSpans(spans, x + textXOffset, baseY, 'start', 'alphabetic'));
  }

  return { shapes, height: noteH };
}

/**
 * `ref over A[, B, ...]` — a folded-corner rectangle spanning the listed
 * lanes (from leftmost lane center − headerW/2 to rightmost lane center +
 * headerW/2, plus a small bleed) with a "ref" tab at the top-left.
 *
 * Returns `{ shapes, height }` so the caller can advance the y-cursor.
 */
function drawRef(
  stmt: RefStmt,
  y: number,
  laneCenters: number[],
  headerW: number[],
  laneIdx: Map<string, number>,
  text: string,
): { shapes: Shape[]; height: number } {
  const idxs = stmt.targets
    .map((t) => laneIdx.get(t))
    .filter((i): i is number => i !== undefined);
  if (idxs.length === 0) return { shapes: [], height: 0 };
  const lo = Math.min(...idxs);
  const hi = Math.max(...idxs);
  const xLeft = laneCenters[lo]! - headerW[lo]! / 2;
  const xRight = laneCenters[hi]! + headerW[hi]! / 2;

  const lines = text ? text.split('\n') : [];
  const allSpans = lines.map(parseLabelMarkup);
  let maxLineW = 0;
  for (const spans of allSpans) {
    let w = 0;
    for (const sp of spans) w += measureText(sp.text, FONT_SIZE).width;
    if (w > maxLineW) maxLineW = w;
  }
  const lineH = FONT_SIZE * 1.25;
  const textBlockH = lines.length > 0 ? lines.length * lineH : 0;

  // "ref" tab — bold, with a small fold notch at its bottom-right.
  const tabLabel = 'ref';
  const tabTextW = measureText(tabLabel, FONT_SIZE).width;
  const tabW = tabTextW + 16;

  const bodyH = textBlockH > 0 ? textBlockH + REF_PAD_Y * 2 : REF_PAD_Y * 2;
  const minBodyW = tabW + REF_TAB_FOLD + 8;
  const textBoxW = maxLineW + REF_PAD_X * 2;
  const naturalW = xRight - xLeft;
  const w = Math.max(naturalW, minBodyW, textBoxW);
  // Center the box if it had to grow beyond the natural lane span.
  const xBoxLeft = (xLeft + xRight) / 2 - w / 2;
  const totalH = REF_TAB_H + bodyH;

  const refBoxStyle = { fill: '#fff', stroke: '#000', strokeWidth: 1.5 };
  const tabFillStyle = { fill: '#eeeeee', stroke: '#000', strokeWidth: 1.5 };
  const foldLineStyle = { fill: 'none', stroke: '#000', strokeWidth: 1.5 };

  const shapes: Shape[] = [];

  // Body rectangle — sits below the tab, full width of the ref.
  shapes.push({
    type: 'rect',
    x: xBoxLeft,
    y: y + REF_TAB_H,
    w,
    h: bodyH,
    style: refBoxStyle,
  });

  // The "ref" tab — a folder-style polygon with a notched bottom-right.
  shapes.push({
    type: 'polygon',
    points: [
      [xBoxLeft, y],
      [xBoxLeft + tabW, y],
      [xBoxLeft + tabW + REF_TAB_FOLD, y + REF_TAB_FOLD],
      [xBoxLeft + tabW + REF_TAB_FOLD, y + REF_TAB_H],
      [xBoxLeft, y + REF_TAB_H],
    ],
    style: tabFillStyle,
  });
  // Fold edge — the diagonal line that closes the notch.
  shapes.push({
    type: 'polyline',
    points: [
      [xBoxLeft + tabW, y],
      [xBoxLeft + tabW, y + REF_TAB_FOLD],
      [xBoxLeft + tabW + REF_TAB_FOLD, y + REF_TAB_FOLD],
    ],
    style: foldLineStyle,
  });
  shapes.push({
    type: 'text',
    x: xBoxLeft + tabW / 2,
    y: y + REF_TAB_H / 2,
    text: tabLabel,
    anchor: 'middle',
    baseline: 'middle',
    font: { family: FONT_FAMILY, size: FONT_SIZE, color: '#000', weight: 'bold' },
  });

  // Body text — centered horizontally in the box, one line per row.
  for (let i = 0; i < allSpans.length; i++) {
    const spans = allSpans[i]!;
    const baseY = y + REF_TAB_H + REF_PAD_Y + FONT_SIZE * 0.9 + i * lineH;
    shapes.push(
      ...drawLabelSpans(spans, xBoxLeft + w / 2, baseY, 'middle', 'alphabetic'),
    );
  }

  return { shapes, height: totalH };
}

function drawGroup(
  g: PendingGroup,
  yEnd: number,
  laneCenters: number[],
  headerW: number[],
): Shape[] {
  const xLeft = laneCenters[g.minLane]! - headerW[g.minLane]! / 2 - GROUP_SIDE_PAD;
  const xRight = laneCenters[g.maxLane]! + headerW[g.maxLane]! / 2 + GROUP_SIDE_PAD;
  const w = xRight - xLeft;
  const tabLabel = g.kind + (g.label ? ` [${g.label}]` : '');
  const tabTextW = measureText(tabLabel, FONT_GROUP).width;
  const tabW = tabTextW + 14;
  const tabH = GROUP_HEADER_HEIGHT;

  const shapes: Shape[] = [];

  // Per-branch background fills, emitted FIRST so they sit behind dividers,
  // arrow content, and the outer frame stroke. Each branch occupies the band
  // from its top y (just below the tab strip for branch 0, just below the
  // previous divider otherwise) to the next divider's y (or `yEnd` for the
  // last branch). Inset by 1px so the fill doesn't overpaint the stroke.
  const branchCount = g.dividers.length + 1;
  for (let i = 0; i < branchCount; i++) {
    const fill = g.branchColors[i];
    if (!fill) continue;
    const yTop = i === 0 ? g.yStart + tabH : g.dividers[i - 1]!.y;
    const yBot = i < g.dividers.length ? g.dividers[i]!.y : yEnd;
    if (yBot <= yTop) continue;
    shapes.push({
      type: 'rect',
      x: xLeft + 1,
      y: yTop,
      w: w - 2,
      h: yBot - yTop - 1,
      style: { fill, stroke: 'none', strokeWidth: 0 },
    });
  }

  shapes.push(
    {
      type: 'rect',
      x: xLeft,
      y: g.yStart,
      w,
      h: yEnd - g.yStart,
      style: { fill: 'none', stroke: COLOR_GROUP_STROKE, strokeWidth: 1 },
    },
    {
      type: 'polygon',
      points: [
        [xLeft, g.yStart],
        [xLeft + tabW, g.yStart],
        [xLeft + tabW + 4, g.yStart + tabH - 4],
        [xLeft + tabW + 4, g.yStart + tabH],
        [xLeft, g.yStart + tabH],
      ],
      style: {
        fill: g.tabColor ?? COLOR_GROUP_TAB_FILL,
        stroke: COLOR_GROUP_STROKE,
        strokeWidth: 1,
      },
    },
    {
      type: 'text',
      x: xLeft + 7,
      y: g.yStart + tabH / 2,
      text: tabLabel,
      anchor: 'start',
      baseline: 'middle',
      font: { family: FONT_FAMILY, size: FONT_GROUP, color: '#000', weight: 'bold' },
    },
  );

  for (const d of g.dividers) {
    shapes.push({
      type: 'line',
      x1: xLeft,
      y1: d.y,
      x2: xLeft + w,
      y2: d.y,
      style: { stroke: COLOR_GROUP_STROKE, strokeWidth: 1, strokeDasharray: '4,3' },
    });
    if (d.label) {
      shapes.push({
        type: 'text',
        x: xLeft + 7,
        y: d.y + 12,
        text: `[${d.label}]`,
        anchor: 'start',
        baseline: 'alphabetic',
        font: { family: FONT_FAMILY, size: FONT_GROUP, color: '#000' },
      });
    }
  }

  return shapes;
}

function drawDivider(stmt: DividerStmt, y: number, totalWidth: number): Shape[] {
  const cx = totalWidth / 2;
  if (stmt.kind === 'delay') {
    // `... long delay ...` — centered italic text with a dotted line through it,
    // no boxed pill.
    const spans = parseLabelMarkup(stmt.label);
    const lineY = y + DIVIDER_HEIGHT / 2;
    // `<style> delay { LineStyle ... }` override. `'none'` means explicit
    // solid (no dasharray); other strings replace the default; `undefined`
    // keeps the default `'2,3'`.
    const delayDash = getStyles().delayDasharray;
    const lineStyle: { stroke: string; strokeWidth: number; strokeDasharray?: string } = {
      stroke: COLOR_GROUP_STROKE, strokeWidth: 1,
    };
    if (delayDash === undefined) lineStyle.strokeDasharray = '2,3';
    else if (delayDash !== 'none') lineStyle.strokeDasharray = delayDash;
    const shapes: Shape[] = [
      {
        type: 'line',
        x1: SIDE_PAD, y1: lineY,
        x2: totalWidth - SIDE_PAD, y2: lineY,
        style: lineStyle,
      },
    ];
    if (stmt.label) {
      // Erase the dashed line under the label with a small white rect.
      const lblW = measureText(stmt.label, FONT_SIZE).width + 12;
      shapes.push({
        type: 'rect',
        x: cx - lblW / 2, y: lineY - FONT_SIZE / 2 - 2,
        w: lblW, h: FONT_SIZE + 4,
        style: { fill: '#fff', stroke: 'none', strokeWidth: 0 },
      });
      shapes.push(
        ...drawLabelSpans(spans, cx, lineY, 'middle', 'middle', FONT_SIZE),
      );
    }
    return shapes;
  }
  const labelW = measureText(stmt.label, FONT_SIZE).width + 24;
  return [
    {
      type: 'line',
      x1: SIDE_PAD,
      y1: y + DIVIDER_HEIGHT / 2,
      x2: totalWidth - SIDE_PAD,
      y2: y + DIVIDER_HEIGHT / 2,
      style: { stroke: COLOR_GROUP_STROKE, strokeWidth: 1 },
    },
    {
      type: 'rect',
      x: cx - labelW / 2,
      y,
      w: labelW,
      h: DIVIDER_HEIGHT,
      style: { fill: COLOR_DIVIDER_FILL, stroke: COLOR_GROUP_STROKE, strokeWidth: 1 },
    },
    {
      type: 'text',
      x: cx,
      y: y + DIVIDER_HEIGHT / 2,
      text: stmt.label,
      anchor: 'middle',
      baseline: 'middle',
      font: { family: FONT_FAMILY, size: FONT_SIZE, color: '#000', weight: 'bold' },
    },
  ];
}
