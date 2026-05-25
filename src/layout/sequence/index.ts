import type {
  ArrowMarker,
  DividerStmt,
  GroupKind,
  NoteStmt,
  SequenceAst,
  SequenceStatement,
} from '../../ast/sequence.js';
import type { Scene, Shape } from '../../scene/types.js';
import { measureText } from './measure.js';
import { drawHeader, maxHeaderHeight, participantContentWidth } from './headers.js';

const TOP_PAD = 12;
const BOTTOM_PAD = 12;
const SIDE_PAD = 12;
const HEADER_PAD_X = 16;
const LANE_MIN_WIDTH = 80;
const LANE_GAP = 50;
const MSG_GAP = 36;
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
const TITLE_FONT_SIZE = 16;
const TITLE_GAP = 12;
const PAGE_HEADER_FONT_SIZE = 11;
const PAGE_HEADER_LINE_H = 14;
const PAGE_HEADER_GAP = 8;
const COLOR_PAGE_MARGIN = '#999';
const DIVIDER_HEIGHT = 22;
const DIVIDER_GAP = 8;

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
}

interface FinalizedActivation {
  laneIdx: number;
  level: number;
  yStart: number;
  yEnd: number;
}

export function layoutSequence(ast: SequenceAst): Scene {
  const parts = ast.participants;

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
  const headerTopY = TOP_PAD + pageHeaderH + titleHeight;
  const headerH = maxHeaderHeight(parts);

  const body: Shape[] = [];
  const pageTitleShapes: Shape[] = [];
  const actStack: number[][] = parts.map(() => []);
  const finalizedActs: FinalizedActivation[] = [];
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
            const yStart = actStack[li]!.pop()!;
            finalizedActs.push({
              laneIdx: li, level: actStack[li]!.length, yStart, yEnd: pageBottomY,
            });
          }
        }
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
        actStack[idx]!.push(y - MSG_GAP / 2);
        break;
      }

      case 'deactivate': {
        const idx = laneIdx.get(stmt.target);
        if (idx === undefined) break;
        touch(idx);
        const yStart = actStack[idx]!.pop();
        if (yStart !== undefined) {
          finalizedActs.push({
            laneIdx: idx,
            level: actStack[idx]!.length,
            yStart,
            yEnd: y - MSG_GAP / 2,
          });
        }
        break;
      }

      case 'groupStart':
        groupStack.push({
          kind: stmt.kind,
          label: stmt.label,
          yStart: y - MSG_GAP / 2,
          minLane: parts.length,
          maxLane: -1,
          dividers: [],
        });
        y += GROUP_HEADER_HEIGHT + GROUP_PAD;
        break;

      case 'groupElse': {
        const top = groupStack[groupStack.length - 1];
        if (top) {
          top.dividers.push({ y: y - MSG_GAP / 2, label: stmt.label });
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
        const drawn = drawNote(stmt, y, laneCenters, headerW, laneIdx, labels[i] ?? stmt.text);
        body.push(...drawn.shapes);
        y += drawn.height + NOTE_GAP;
        break;
      }

      case 'message': {
        const fromIdx = laneIdx.get(stmt.from);
        const toIdx = laneIdx.get(stmt.to);
        if (fromIdx === undefined || toIdx === undefined) break;
        touch(fromIdx, toIdx);
        const label = labels[i] ?? '';

        if (fromIdx === toIdx) {
          const self = drawSelfMessage(
            laneCenters[fromIdx]!, y, label, stmt.style, stmt.reverse,
          );
          body.push(...self.shapes);
          y += self.height + MSG_GAP;
        } else {
          const lineCount = label ? label.split('\n').length : 1;
          const labelHeadroom = lineCount > 1 ? (lineCount - 1) * MSG_LINE_H : 0;
          y += labelHeadroom;
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
            ),
          );
          y += MSG_GAP;
        }
        break;
      }
    }
  }

  const bottomY = y;

  for (let i = 0; i < parts.length; i++) {
    while (actStack[i]!.length > 0) {
      const yStart = actStack[i]!.pop()!;
      finalizedActs.push({
        laneIdx: i,
        level: actStack[i]!.length,
        yStart,
        yEnd: bottomY,
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
  const lifelines: Shape[] = [];
  const headers: Shape[] = [];
  for (const page of pages) {
    const pageBottomLine = page.bottomY + 8;
    for (const cx of laneCenters) {
      lifelines.push({
        type: 'line',
        x1: cx, y1: page.topY + headerH,
        x2: cx, y2: pageBottomLine,
        style: { stroke: COLOR_LIFELINE, strokeWidth: 1, strokeDasharray: '4,4' },
      });
    }
    for (let i = 0; i < parts.length; i++) {
      headers.push(...drawHeader(parts[i]!, laneCenters[i]!, headerW[i]!, page.topY, headerH));
      headers.push(...drawHeader(parts[i]!, laneCenters[i]!, headerW[i]!, pageBottomLine, headerH));
    }
  }
  const lifelineBottom = pages[pages.length - 1]!.bottomY + 8;

  const acts: Shape[] = finalizedActs.map((r) => ({
    type: 'rect',
    x: laneCenters[r.laneIdx]! - ACT_WIDTH / 2 + r.level * (ACT_WIDTH / 2),
    y: r.yStart,
    w: ACT_WIDTH,
    h: r.yEnd - r.yStart,
    style: { fill: COLOR_ACTIVATION_FILL, stroke: COLOR_LINE, strokeWidth: 1 },
  }));

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

  return {
    width: diagramWidth,
    height: totalHeight,
    background: '#fff',
    children: [
      ...pageHeaderShapes,
      ...titleShapes,
      ...pageTitleShapes,
      ...lifelines,
      ...acts,
      ...body,
      ...headers,
      ...pageFooterShapes,
    ],
  };
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
  color: string = COLOR_LINE,
): Shape[] {
  const lineStyle =
    style === 'dashed'
      ? { stroke: color, strokeWidth: 1, strokeDasharray: '5,3' }
      : { stroke: color, strokeWidth: 1 };
  const shapes: Shape[] = [
    { type: 'line', x1, y1: y, x2, y2: y, style: lineStyle },
  ];
  const endTipPointsRight = leftToRight;
  const startTipPointsRight = !leftToRight;
  shapes.push(...drawArrowMarker(endMarker, x2, y, endTipPointsRight, color));
  shapes.push(...drawArrowMarker(startMarker, x1, y, startTipPointsRight, color));
  if (text) {
    const lines = text.split('\n');
    const cx = (x1 + x2) / 2;
    const baseY = y - MSG_TEXT_PAD;
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
  const lineStyle =
    style === 'dashed'
      ? { stroke: COLOR_LINE, strokeWidth: 1, fill: 'none', strokeDasharray: '5,3' }
      : { stroke: COLOR_LINE, strokeWidth: 1, fill: 'none' };

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
  shapes.push(arrowHead(x1, loopY + SELF_MSG_H, reverse));

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
  const textW = maxLineW + NOTE_PAD_X * 2;
  const noteH = lines.length * lineH + NOTE_PAD_Y * 2;

  let x: number;
  let noteW = textW;
  const idx1 = laneIdx.get(stmt.targets[0]) ?? 0;
  if (stmt.position === 'over') {
    if (stmt.targets.length === 2) {
      const idx2 = laneIdx.get(stmt.targets[1]) ?? idx1;
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

  const shapes: Shape[] = [
    {
      type: 'polygon',
      points: [
        [x, y],
        [x + noteW - NOTE_FOLD, y],
        [x + noteW, y + NOTE_FOLD],
        [x + noteW, y + noteH],
        [x, y + noteH],
      ],
      style: { fill: COLOR_NOTE_FILL, stroke: COLOR_NOTE_STROKE, strokeWidth: 1 },
    },
    {
      type: 'polyline',
      points: [
        [x + noteW - NOTE_FOLD, y],
        [x + noteW - NOTE_FOLD, y + NOTE_FOLD],
        [x + noteW, y + NOTE_FOLD],
      ],
      style: { stroke: COLOR_NOTE_STROKE, strokeWidth: 1, fill: 'none' },
    },
  ];

  for (let i = 0; i < lines.length; i++) {
    const spans = allSpans[i]!;
    const baseY = y + NOTE_PAD_Y + FONT_SIZE * 0.9 + i * lineH;
    shapes.push(...drawLabelSpans(spans, x + NOTE_PAD_X, baseY, 'start', 'alphabetic'));
  }

  return { shapes, height: noteH };
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

  const shapes: Shape[] = [
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
      style: { fill: COLOR_GROUP_TAB_FILL, stroke: COLOR_GROUP_STROKE, strokeWidth: 1 },
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
  ];

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
  const labelW = measureText(stmt.label, FONT_SIZE).width + 24;
  const cx = totalWidth / 2;
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

interface LabelSpan {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  color: string | undefined;
}

/**
 * Mini HTML-like markup parser for sequence labels.
 *
 * Recognised tags:
 *   `<b>...</b>`                  — bold
 *   `<u>...</u>`                  — underline
 *   `<font color=X>...</font>`    — colored text (X may be quoted or bare)
 *
 * Tags can be left unclosed (PlantUML convention): an open `<b>` carries to
 * the end of the line. Unknown tags are silently dropped. Returns a flat
 * sequence of styled spans.
 */
function parseLabelMarkup(s: string): LabelSpan[] {
  const out: LabelSpan[] = [];
  let bold = false;
  let italic = false;
  let underline = false;
  let color: string | undefined;
  let buf = '';
  const flush = (): void => {
    if (buf.length > 0) {
      out.push({ text: buf, bold, italic, underline, color });
      buf = '';
    }
  };
  let i = 0;
  while (i < s.length) {
    // Creole toggles: `**` for bold, `//` for italic.
    if (s.startsWith('**', i)) { flush(); bold = !bold; i += 2; continue; }
    if (s.startsWith('//', i)) { flush(); italic = !italic; i += 2; continue; }
    if (s[i] === '<') {
      const m = /^<\s*(\/?)([A-Za-z]+)((?:\s+[^>]*)?)>/.exec(s.slice(i));
      if (m) {
        flush();
        const closing = m[1] === '/';
        const tag = m[2]!.toLowerCase();
        const attrs = m[3] ?? '';
        if (tag === 'b') bold = !closing;
        else if (tag === 'i') italic = !closing;
        else if (tag === 'u') underline = !closing;
        else if (tag === 'font') {
          if (closing) {
            color = undefined;
          } else {
            const cm = /color\s*=\s*"?([^"\s>]+)"?/i.exec(attrs);
            if (cm) color = cm[1];
          }
        }
        i += m[0].length;
        continue;
      }
    }
    buf += s[i];
    i++;
  }
  flush();
  return out;
}

function drawLabelSpans(
  spans: LabelSpan[],
  x: number,
  y: number,
  anchor: 'start' | 'middle' | 'end',
  baseline: 'alphabetic' | 'middle' = 'alphabetic',
): Shape[] {
  if (spans.length === 0) return [];
  // Fast path: a plain unstyled label keeps the legacy single-text rendering
  // so plain-message goldens stay byte-identical.
  if (
    spans.length === 1 &&
    !spans[0]!.bold &&
    !spans[0]!.italic &&
    !spans[0]!.underline &&
    !spans[0]!.color
  ) {
    return [{
      type: 'text',
      x, y,
      text: spans[0]!.text,
      anchor,
      baseline,
      font: { family: FONT_FAMILY, size: FONT_SIZE, color: '#000' },
    }];
  }
  const widths = spans.map((sp) => measureText(sp.text, FONT_SIZE).width);
  const totalW = widths.reduce((a, b) => a + b, 0);
  let cursor = x;
  if (anchor === 'middle') cursor = x - totalW / 2;
  else if (anchor === 'end') cursor = x - totalW;
  const out: Shape[] = [];
  for (let i = 0; i < spans.length; i++) {
    const sp = spans[i]!;
    const w = widths[i]!;
    if (sp.text.length > 0) {
      out.push({
        type: 'text',
        x: cursor,
        y,
        text: sp.text,
        anchor: 'start',
        baseline,
        font: {
          family: FONT_FAMILY,
          size: FONT_SIZE,
          weight: sp.bold ? 'bold' : 'normal',
          style: sp.italic ? 'italic' : 'normal',
          color: sp.color ?? '#000',
        },
      });
      if (sp.underline) {
        const underlineY = baseline === 'middle' ? y + FONT_SIZE / 2 : y + 2;
        out.push({
          type: 'line',
          x1: cursor, y1: underlineY, x2: cursor + w, y2: underlineY,
          style: { stroke: sp.color ?? '#000', strokeWidth: 1 },
        });
      }
    }
    cursor += w;
  }
  return out;
}
