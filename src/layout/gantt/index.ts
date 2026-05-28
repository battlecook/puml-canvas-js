import type { GanttAst, GanttTask, WeekdayName } from '../../ast/gantt.js';
import type { Scene, Shape } from '../../scene/types.js';
import { measureText } from '../sequence/measure.js';

const PAGE_PAD = 16;
const TITLE_FONT = 16;
const TITLE_GAP = 10;
const HEADER_MONTH_H = 18;
const HEADER_DAY_H = 22;
const HEADER_TOTAL_H = HEADER_MONTH_H + HEADER_DAY_H;
const DAY_WIDTH = 28;
const ROW_HEIGHT = 26;
const LABEL_W_MIN = 140;
const LABEL_PAD_X = 10;
const BAR_PAD_Y = 4;
const SECTION_HEIGHT = 22;
const COLOR_SECTION_FILL = '#eaeaea';
const COLOR_SECTION_TEXT = '#333';
const FONT_FAMILY = 'sans-serif';
const FONT_LABEL = 12;
const FONT_HEADER = 11;
const FONT_BAR = 11;
const COLOR_GRID = '#dcdcdc';
const COLOR_TEXT = '#000';
const COLOR_HEADER_FILL = '#f7f7f7';
const COLOR_CLOSED = '#f0f0f0';
const COLOR_BAR_DEFAULT = '#82b4ff';
const COLOR_BAR_STROKE = '#3a6cb2';
const COLOR_MILESTONE = '#222';

const WEEKDAY_NAMES: WeekdayName[] = [
  'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday',
];
const MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const COLOR_NAMES: Record<string, string> = {
  lightblue: '#add8e6',
  lightgreen: '#90ee90',
  lightcoral: '#f08080',
  salmon: '#fa8072',
  gold: '#ffd700',
  orange: '#ffa500',
  red: '#ff4444',
  green: '#44aa44',
  blue: '#4488ff',
  yellow: '#ffff66',
  pink: '#ffc0cb',
  violet: '#ee82ee',
  grey: '#bbbbbb',
  gray: '#bbbbbb',
};

interface PlannedTask {
  task: GanttTask;
  startOffset: number;
  endOffset: number;
}

export function layoutGantt(ast: GanttAst): Scene {
  if (ast.tasks.length === 0) {
    return emptyScene();
  }

  // When `Project starts <date>` is omitted, render an abstract day axis
  // (1, 2, 3 ...) rather than a calendar. Closed-day handling is skipped
  // because we have no real weekdays to map to.
  const hasStartDate = !!ast.startDate;
  const closed = new Set<WeekdayName>(hasStartDate ? ast.closedDays : []);
  const startDate = hasStartDate ? parseDate(ast.startDate) : new Date(Date.UTC(2000, 0, 1));
  const startMs = startDate.getTime();

  const planned = new Map<string, PlannedTask>();
  // Resolve in declaration order; dependencies should resolve in order
  for (const task of ast.tasks) {
    let startOffset: number;
    if (hasStartDate && task.startDate) {
      // Explicit calendar start: distance in days from project start.
      const taskMs = parseDate(task.startDate).getTime();
      startOffset = Math.max(0, Math.round((taskMs - startMs) / 86400000));
    } else if (task.startAfter) {
      const dep = planned.get(task.startAfter);
      if (dep) {
        startOffset = workingDayOffsetAfter(dep.endOffset, startMs, closed);
      } else {
        startOffset = 0;
      }
    } else {
      startOffset = nextWorkingOffset(0, startMs, closed);
    }
    let endOffset: number;
    if (task.isMilestone || task.duration === 0) {
      endOffset = startOffset;
    } else {
      endOffset = endOffsetForDuration(startOffset, task.duration, startMs, closed);
    }
    planned.set(task.id, { task, startOffset, endOffset });
  }

  const maxOffset = Math.max(...Array.from(planned.values()).map((p) => p.endOffset));
  const totalDays = maxOffset + 1;

  const labelW = Math.max(
    LABEL_W_MIN,
    Math.max(...ast.tasks.map((t) => measureText(t.id, FONT_LABEL).width)) + LABEL_PAD_X * 2,
  );

  const titleHeight = ast.title ? TITLE_FONT + TITLE_GAP : 0;
  const gridW = totalDays * DAY_WIDTH;
  const totalW = PAGE_PAD * 2 + labelW + gridW;

  // Pre-compute per-task row offsets, inserting a section-header row each
  // time the section name changes to a non-empty value.
  interface Row {
    kind: 'task' | 'section';
    y: number;
    h: number;
    /** Task index when kind === 'task'. */
    taskIndex?: number;
    /** Section title when kind === 'section'. */
    section?: string;
  }
  const rows: Row[] = [];
  let cursorY = 0;
  let lastSection: string | undefined = undefined;
  for (let r = 0; r < ast.tasks.length; r++) {
    const sec = ast.tasks[r]!.section ?? '';
    if (sec && sec !== lastSection) {
      rows.push({ kind: 'section', y: cursorY, h: SECTION_HEIGHT, section: sec });
      cursorY += SECTION_HEIGHT;
      lastSection = sec;
    } else if (!sec) {
      lastSection = '';
    }
    rows.push({ kind: 'task', y: cursorY, h: ROW_HEIGHT, taskIndex: r });
    cursorY += ROW_HEIGHT;
  }
  const bodyHeight = cursorY;
  const totalH =
    PAGE_PAD + titleHeight + HEADER_TOTAL_H + bodyHeight + PAGE_PAD;

  const originX = PAGE_PAD + labelW;
  const originY = PAGE_PAD + titleHeight + HEADER_TOTAL_H;

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

  // Closed-day background bands (only when we have a real start date and
  // therefore real weekdays to map onto).
  if (hasStartDate) {
    for (let i = 0; i < totalDays; i++) {
      const d = addDays(startDate, i);
      if (closed.has(WEEKDAY_NAMES[d.getUTCDay()]!)) {
        shapes.push({
          type: 'rect',
          x: originX + i * DAY_WIDTH,
          y: originY,
          w: DAY_WIDTH,
          h: bodyHeight,
          style: { fill: COLOR_CLOSED, stroke: 'none' },
        });
      }
    }
  }

  // Header background
  shapes.push({
    type: 'rect',
    x: originX,
    y: PAGE_PAD + titleHeight,
    w: gridW,
    h: HEADER_TOTAL_H,
    style: { fill: COLOR_HEADER_FILL, stroke: COLOR_GRID, strokeWidth: 1 },
  });

  // Month label spans (only meaningful when we have a real calendar date).
  if (hasStartDate) {
    let i = 0;
    while (i < totalDays) {
      const d = addDays(startDate, i);
      const monthStart = i;
      let monthEnd = i;
      while (monthEnd + 1 < totalDays) {
        const next = addDays(startDate, monthEnd + 1);
        if (next.getUTCMonth() !== d.getUTCMonth() || next.getUTCFullYear() !== d.getUTCFullYear()) break;
        monthEnd++;
      }
      const spanW = (monthEnd - monthStart + 1) * DAY_WIDTH;
      const monthLabel = `${MONTH_SHORT[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
      shapes.push({
        type: 'text',
        x: originX + monthStart * DAY_WIDTH + spanW / 2,
        y: PAGE_PAD + titleHeight + HEADER_MONTH_H / 2,
        text: monthLabel,
        anchor: 'middle',
        baseline: 'middle',
        font: { family: FONT_FAMILY, size: FONT_HEADER, weight: 'bold', color: COLOR_TEXT },
      });
      if (monthStart > 0) {
        shapes.push({
          type: 'line',
          x1: originX + monthStart * DAY_WIDTH,
          y1: PAGE_PAD + titleHeight,
          x2: originX + monthStart * DAY_WIDTH,
          y2: PAGE_PAD + titleHeight + HEADER_TOTAL_H,
          style: { stroke: COLOR_GRID, strokeWidth: 1 },
        });
      }
      i = monthEnd + 1;
    }
  }

  // Day number row
  for (let k = 0; k < totalDays; k++) {
    const d = addDays(startDate, k);
    const dayLabel = hasStartDate ? String(d.getUTCDate()) : String(k + 1);
    shapes.push({
      type: 'text',
      x: originX + k * DAY_WIDTH + DAY_WIDTH / 2,
      y: PAGE_PAD + titleHeight + HEADER_MONTH_H + HEADER_DAY_H / 2,
      text: dayLabel,
      anchor: 'middle',
      baseline: 'middle',
      font: { family: FONT_FAMILY, size: FONT_HEADER, color: COLOR_TEXT },
    });
    if (k > 0) {
      shapes.push({
        type: 'line',
        x1: originX + k * DAY_WIDTH,
        y1: PAGE_PAD + titleHeight + HEADER_MONTH_H,
        x2: originX + k * DAY_WIDTH,
        y2: originY + bodyHeight,
        style: { stroke: COLOR_GRID, strokeWidth: 1 },
      });
    }
  }

  // Outer chart border
  shapes.push({
    type: 'rect',
    x: originX,
    y: originY,
    w: gridW,
    h: bodyHeight,
    style: { fill: 'none', stroke: COLOR_GRID, strokeWidth: 1 },
  });

  // Section header rows
  for (const row of rows) {
    if (row.kind !== 'section') continue;
    const ry = originY + row.y;
    shapes.push({
      type: 'rect',
      x: PAGE_PAD,
      y: ry,
      w: totalW - PAGE_PAD * 2,
      h: row.h,
      style: { fill: COLOR_SECTION_FILL, stroke: COLOR_GRID, strokeWidth: 1 },
    });
    shapes.push({
      type: 'text',
      x: PAGE_PAD + LABEL_PAD_X,
      y: ry + row.h / 2,
      text: row.section!,
      anchor: 'start',
      baseline: 'middle',
      font: { family: FONT_FAMILY, size: FONT_LABEL, weight: 'bold', color: COLOR_SECTION_TEXT },
    });
  }

  // Task rows
  let drewSeparatorAbove = false;
  for (const row of rows) {
    if (row.kind === 'section') {
      drewSeparatorAbove = true; // section row visually separates the next task
      continue;
    }
    const r = row.taskIndex!;
    const task = ast.tasks[r]!;
    const rowY = originY + row.y;

    if (r > 0 && !drewSeparatorAbove) {
      shapes.push({
        type: 'line',
        x1: PAGE_PAD, y1: rowY, x2: originX + gridW, y2: rowY,
        style: { stroke: COLOR_GRID, strokeWidth: 1 },
      });
    }
    drewSeparatorAbove = false;

    // Label (left column)
    const labelSuffix = task.resources > 0 ? ` (${task.resources}p)` : '';
    shapes.push({
      type: 'text',
      x: PAGE_PAD + LABEL_PAD_X,
      y: rowY + ROW_HEIGHT / 2,
      text: task.id + labelSuffix,
      anchor: 'start',
      baseline: 'middle',
      font: { family: FONT_FAMILY, size: FONT_LABEL, color: COLOR_TEXT },
    });

    const p = planned.get(task.id);
    if (!p) continue;
    const barX = originX + p.startOffset * DAY_WIDTH;
    const barY = rowY + BAR_PAD_Y;
    const barH = ROW_HEIGHT - BAR_PAD_Y * 2;

    if (task.isMilestone) {
      const cx = barX + DAY_WIDTH / 2;
      const cy = rowY + ROW_HEIGHT / 2;
      const r2 = Math.min(DAY_WIDTH / 2 - 2, barH / 2 - 1);
      shapes.push({
        type: 'polygon',
        points: [
          [cx, cy - r2],
          [cx + r2, cy],
          [cx, cy + r2],
          [cx - r2, cy],
        ],
        style: { fill: COLOR_MILESTONE, stroke: COLOR_MILESTONE, strokeWidth: 1 },
      });
    } else {
      const barEndX = originX + (p.endOffset + 1) * DAY_WIDTH;
      const barW = barEndX - barX;
      const fill = resolveColor(task.color) ?? COLOR_BAR_DEFAULT;
      shapes.push({
        type: 'rect',
        x: barX,
        y: barY,
        w: barW,
        h: barH,
        rx: 3, ry: 3,
        style: { fill, stroke: COLOR_BAR_STROKE, strokeWidth: 1 },
      });
      if (barW > 36) {
        shapes.push({
          type: 'text',
          x: barX + 6,
          y: barY + barH / 2,
          text: task.id,
          anchor: 'start',
          baseline: 'middle',
          font: { family: FONT_FAMILY, size: FONT_BAR, color: '#000' },
        });
      }
    }
  }

  return {
    width: totalW,
    height: totalH,
    background: '#fff',
    children: shapes,
  };
}

function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y!, (m! - 1), d!));
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86400000);
}

function isClosed(date: Date, closed: Set<WeekdayName>): boolean {
  return closed.has(WEEKDAY_NAMES[date.getUTCDay()]!);
}

function nextWorkingOffset(offset: number, startMs: number, closed: Set<WeekdayName>): number {
  let cur = offset;
  while (isClosed(new Date(startMs + cur * 86400000), closed)) cur++;
  return cur;
}

function workingDayOffsetAfter(
  endOffset: number,
  startMs: number,
  closed: Set<WeekdayName>,
): number {
  return nextWorkingOffset(endOffset + 1, startMs, closed);
}

function endOffsetForDuration(
  startOffset: number,
  duration: number,
  startMs: number,
  closed: Set<WeekdayName>,
): number {
  let cur = startOffset;
  let count = 1;
  while (count < duration) {
    cur++;
    if (!isClosed(new Date(startMs + cur * 86400000), closed)) count++;
  }
  return cur;
}

function resolveColor(name: string): string | null {
  if (!name) return null;
  if (name.startsWith('#')) return name;
  const lower = name.toLowerCase();
  return COLOR_NAMES[lower] ?? null;
}

function emptyScene(): Scene {
  return {
    width: 280,
    height: 60,
    background: '#fff',
    children: [
      {
        type: 'text',
        x: 140, y: 30,
        text: '(empty gantt — needs at least one task)',
        anchor: 'middle', baseline: 'middle',
        font: { family: FONT_FAMILY, size: 12, color: '#999' },
      },
    ],
  };
}
