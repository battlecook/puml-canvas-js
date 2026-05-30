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
const NOTE_LINE_H = 14;
const NOTE_PAD_Y = 4;
const NOTE_PAD_X = 6;
const COLOR_NOTE_FILL = '#fffbcc';
const COLOR_NOTE_STROKE = '#c0b754';
const COLOR_NOTE_TEXT = '#333';
const NAMED_RANGE_LABEL_H = 16;
const COLOR_TODAY_DEFAULT = '#d33';
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
const COLOR_DEP_ARROW = '#666';

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
  // Inclusive ms ranges marked closed via `YYYY-MM-DD to YYYY-MM-DD is closed`.
  // Only meaningful when a calendar start date is in play (otherwise the day
  // axis is abstract and has no real calendar dates to compare against).
  const closedRanges: Array<{ fromMs: number; toMs: number }> = [];
  if (hasStartDate && ast.closedRanges) {
    for (const r of ast.closedRanges) {
      closedRanges.push({
        fromMs: parseDate(r.from).getTime(),
        toMs: parseDate(r.to).getTime(),
      });
    }
  }

  const byId = new Map<string, GanttTask>();
  for (const t of ast.tasks) byId.set(t.id, t);

  // `[A] -> [B]` dependency: auto-position B after A's end when B has no
  // explicit start of its own. Mutates the task in place (cheap and only
  // affects positioning; the AST is not exposed back to the caller here).
  if (ast.dependencies) {
    for (const dep of ast.dependencies) {
      const to = byId.get(dep.to);
      if (!to) continue;
      const hasOwnStart =
        !!to.startDate || to.startDay !== undefined || !!to.startAfter;
      if (!hasOwnStart) to.startAfter = dep.from;
    }
  }

  const planned = new Map<string, PlannedTask>();
  // Resolve in declaration order; dependencies should resolve in order
  for (const task of ast.tasks) {
    let startOffset: number;
    let endOverride: number | undefined;
    if (task.occursFrom) {
      // `[T] occurs from [A] to [B]` — A's end starts, B's end ends.
      const a = planned.get(task.occursFrom.from);
      const b = planned.get(task.occursFrom.to);
      startOffset = a ? a.endOffset : 0;
      if (b) endOverride = b.endOffset;
    } else if (task.milestoneOffset) {
      // Milestone with `happens on N days|weeks after [Other]'s end`.
      // Position N calendar days past the dep's end offset. Closed days are
      // intentionally ignored here — PlantUML treats the offset as raw
      // calendar days off another task's computed end.
      const dep = planned.get(task.milestoneOffset.after);
      const base = dep ? dep.endOffset : 0;
      startOffset = base + task.milestoneOffset.days;
    } else if (task.startOffset !== undefined) {
      // `[T] happens N days after start` / `... starts N days after start`.
      // Treat as a project-relative day offset (project day 0 == column 0).
      startOffset = Math.max(0, task.startOffset);
    } else if (hasStartDate && task.startDate) {
      // Explicit calendar start: distance in days from project start.
      const taskMs = parseDate(task.startDate).getTime();
      startOffset = Math.max(0, Math.round((taskMs - startMs) / 86400000));
    } else if (task.startDay !== undefined) {
      // Relative `D+N` offset: project day 0 maps to chart column 0.
      startOffset = Math.max(0, task.startDay);
    } else if (task.workingDaysAfter) {
      // `[Task] starts N working days after [Other]'s end` — walk N working
      // days (skipping closed weekdays + closed ranges) from the dep's end+1.
      const dep = planned.get(task.workingDaysAfter.after);
      const base = dep ? dep.endOffset : -1;
      startOffset = offsetAfterNWorkingDays(
        base,
        task.workingDaysAfter.days,
        startMs,
        closed,
        closedRanges,
      );
    } else if (task.startAfter) {
      const dep = planned.get(task.startAfter);
      if (dep) {
        startOffset = workingDayOffsetAfter(dep.endOffset, startMs, closed, closedRanges);
      } else {
        startOffset = 0;
      }
    } else {
      startOffset = nextWorkingOffset(0, startMs, closed, closedRanges);
    }
    let endOffset: number;
    if (endOverride !== undefined) {
      // `occurs from [A] to [B]` resolved B's end above; honour it as-is.
      endOffset = Math.max(startOffset, endOverride);
    } else if (task.isMilestone || task.duration === 0) {
      endOffset = startOffset;
    } else if (task.endDay !== undefined && task.startDay !== undefined) {
      // Both relative endpoints set: anchor end exactly at endDay.
      endOffset = Math.max(startOffset, task.endDay);
    } else {
      endOffset = endOffsetForDuration(
        startOffset,
        task.duration,
        startMs,
        closed,
        closedRanges,
      );
    }
    planned.set(task.id, { task, startOffset, endOffset });
  }

  const isWeekly = ast.printScale?.scale === 'weekly';
  let maxOffset = Math.max(...Array.from(planned.values()).map((p) => p.endOffset));
  // Widen the axis to fit the today marker and any colored/named date
  // ranges declared by the source (so a today marker beyond the last task
  // still has a column to land on).
  if (ast.today) maxOffset = Math.max(maxOffset, ast.today.dayOffset);
  if (hasStartDate) {
    for (const r of ast.coloredRanges ?? []) {
      const toOff = Math.round((parseDate(r.to).getTime() - startMs) / 86400000);
      maxOffset = Math.max(maxOffset, toOff);
    }
    for (const r of ast.namedRanges ?? []) {
      const toOff = Math.round((parseDate(r.to).getTime() - startMs) / 86400000);
      maxOffset = Math.max(maxOffset, toOff);
    }
  }
  // In weekly mode round the axis up to a whole-week boundary so each
  // 7-day week column is fully drawn.
  const rawTotalDays = maxOffset + 1;
  const totalDays = isWeekly ? Math.ceil(rawTotalDays / 7) * 7 : rawTotalDays;

  const labelW = Math.max(
    LABEL_W_MIN,
    Math.max(...ast.tasks.map((t) => measureText(t.id, FONT_LABEL).width)) + LABEL_PAD_X * 2,
  );

  const titleHeight = ast.title ? TITLE_FONT + TITLE_GAP : 0;
  const gridW = totalDays * DAY_WIDTH;
  const totalW = PAGE_PAD * 2 + labelW + gridW;

  // Pre-compute per-task row offsets, inserting a section-header row each
  // time the section name changes to a non-empty value. Tasks marked with
  // `sameRowAs` reuse the y of the referenced task — no new row is added.
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
  const taskYById = new Map<string, number>();
  let cursorY = 0;
  let lastSection: string | undefined = undefined;
  for (let r = 0; r < ast.tasks.length; r++) {
    const t = ast.tasks[r]!;
    if (t.sameRowAs) {
      // Share the referenced task's row y. Skip section-change emission for
      // this task — same-row tasks visually belong to their primary row.
      const sharedY = taskYById.get(t.sameRowAs);
      if (sharedY !== undefined) {
        rows.push({ kind: 'task', y: sharedY, h: ROW_HEIGHT, taskIndex: r });
        taskYById.set(t.id, sharedY);
        continue;
      }
    }
    const sec = t.section ?? '';
    if (sec && sec !== lastSection) {
      rows.push({ kind: 'section', y: cursorY, h: SECTION_HEIGHT, section: sec });
      cursorY += SECTION_HEIGHT;
      lastSection = sec;
    } else if (!sec) {
      lastSection = '';
    }
    rows.push({ kind: 'task', y: cursorY, h: ROW_HEIGHT, taskIndex: r });
    taskYById.set(t.id, cursorY);
    cursorY += ROW_HEIGHT;
    // Reserve vertical space below the bar for a note (one line per `\n`).
    if (t.note) {
      const lineCount = t.note.split('\n').length;
      cursorY += NOTE_LINE_H * lineCount + NOTE_PAD_Y * 2;
    }
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
  // therefore real weekdays to map onto). Both closed weekdays and explicit
  // closed date ranges produce a gray column.
  if (hasStartDate) {
    for (let i = 0; i < totalDays; i++) {
      const d = addDays(startDate, i);
      const isWeekClosed = closed.has(WEEKDAY_NAMES[d.getUTCDay()]!);
      const isRangeClosed =
        closedRanges.length > 0 && isInClosedRange(d.getTime(), closedRanges);
      if (isWeekClosed || isRangeClosed) {
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

  // Colored date-range bands. These cover the whole chart body for the
  // given inclusive range; drawn before the header so they don't overlap
  // the axis labels. Only meaningful when a calendar `Project starts` is set.
  if (hasStartDate && ast.coloredRanges && ast.coloredRanges.length > 0) {
    for (const r of ast.coloredRanges) {
      const fromOff = Math.round((parseDate(r.from).getTime() - startMs) / 86400000);
      const toOff = Math.round((parseDate(r.to).getTime() - startMs) / 86400000);
      if (toOff < 0 || fromOff >= totalDays) continue;
      const lo = Math.max(0, fromOff);
      const hi = Math.min(totalDays - 1, toOff);
      const fill = resolveColor(r.color) ?? r.color;
      shapes.push({
        type: 'rect',
        x: originX + lo * DAY_WIDTH,
        y: originY,
        w: (hi - lo + 1) * DAY_WIDTH,
        h: bodyHeight,
        style: { fill, stroke: 'none', opacity: 0.4 },
      });
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

  if (isWeekly) {
    // Weekly axis: one label per 7-day group. Mode controls the label:
    // `number` → w1/w2/… (offset by weekNumberingFrom when set);
    // `calendar` → Mon-of-week formatted as `MMM DD` (uses startDate when
    // present, else falls back to numeric labels).
    const mode = ast.printScale?.weekNumberingMode ?? 'number';
    const fromN = ast.printScale?.weekNumberingFrom ?? 1;
    const weekCount = Math.ceil(totalDays / 7);
    for (let w = 0; w < weekCount; w++) {
      const wx = originX + w * 7 * DAY_WIDTH;
      const ww = 7 * DAY_WIDTH;
      let label: string;
      if (mode === 'calendar' && hasStartDate) {
        const d = addDays(startDate, w * 7);
        label = `${MONTH_SHORT[d.getUTCMonth()]} ${String(d.getUTCDate()).padStart(2, '0')}`;
      } else {
        label = `w${fromN + w}`;
      }
      shapes.push({
        type: 'text',
        x: wx + ww / 2,
        y: PAGE_PAD + titleHeight + HEADER_TOTAL_H / 2,
        text: label,
        anchor: 'middle',
        baseline: 'middle',
        font: { family: FONT_FAMILY, size: FONT_HEADER, weight: 'bold', color: COLOR_TEXT },
      });
      if (w > 0) {
        shapes.push({
          type: 'line',
          x1: wx, y1: PAGE_PAD + titleHeight,
          x2: wx, y2: originY + bodyHeight,
          style: { stroke: COLOR_GRID, strokeWidth: 1 },
        });
      }
    }
  } else {
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

    // Label (left column). Prefer the display name when an alias was used
    // (`[Display] as [Alias]`), so the row reads `Display` not `Alias`.
    const labelSuffix = task.resources > 0 ? ` (${task.resources}p)` : '';
    const labelText = (task.displayName ?? task.id) + labelSuffix;
    shapes.push({
      type: 'text',
      x: PAGE_PAD + LABEL_PAD_X,
      y: rowY + ROW_HEIGHT / 2,
      text: labelText,
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
          text: task.displayName ?? task.id,
          anchor: 'start',
          baseline: 'middle',
          font: { family: FONT_FAMILY, size: FONT_BAR, color: '#000' },
        });
      }
    }

    // Notes are rendered as a yellow note block below the task bar (just
    // below its row), spanning a few day-columns starting at the bar's
    // left edge. One text line per `\n` in `task.note`.
    if (task.note) {
      const noteLines = task.note.split('\n');
      const noteH = NOTE_LINE_H * noteLines.length + NOTE_PAD_Y * 2;
      const noteY = rowY + ROW_HEIGHT + NOTE_PAD_Y;
      const noteW = Math.max(
        160,
        ...noteLines.map((ln) => measureText(ln, FONT_LABEL).width + NOTE_PAD_X * 2),
      );
      const noteX = barX;
      shapes.push({
        type: 'rect',
        x: noteX,
        y: noteY,
        w: noteW,
        h: noteH,
        style: { fill: COLOR_NOTE_FILL, stroke: COLOR_NOTE_STROKE, strokeWidth: 1 },
      });
      for (let i = 0; i < noteLines.length; i++) {
        shapes.push({
          type: 'text',
          x: noteX + NOTE_PAD_X,
          y: noteY + NOTE_PAD_Y + i * NOTE_LINE_H + NOTE_LINE_H / 2,
          text: noteLines[i]!,
          anchor: 'start',
          baseline: 'middle',
          font: { family: FONT_FAMILY, size: FONT_LABEL, color: COLOR_NOTE_TEXT },
        });
      }
    }
  }

  // Dependency arrows: thin gray line from right edge of `from` bar's row
  // to left edge of `to` bar's row, with a small arrowhead. Drawn last so
  // it sits above the bars.
  if (ast.dependencies && ast.dependencies.length > 0) {
    const rowYByTask = new Map<number, number>();
    for (const row of rows) {
      if (row.kind === 'task') rowYByTask.set(row.taskIndex!, originY + row.y);
    }
    const taskIndexById = new Map<string, number>();
    for (let i = 0; i < ast.tasks.length; i++) taskIndexById.set(ast.tasks[i]!.id, i);

    for (const dep of ast.dependencies) {
      const fromIdx = taskIndexById.get(dep.from);
      const toIdx = taskIndexById.get(dep.to);
      if (fromIdx === undefined || toIdx === undefined) continue;
      const fromPlan = planned.get(dep.from);
      const toPlan = planned.get(dep.to);
      if (!fromPlan || !toPlan) continue;
      const fromRowY = rowYByTask.get(fromIdx);
      const toRowY = rowYByTask.get(toIdx);
      if (fromRowY === undefined || toRowY === undefined) continue;

      const fromEndX = originX + (fromPlan.endOffset + 1) * DAY_WIDTH;
      const fromMidY = fromRowY + ROW_HEIGHT / 2;
      const toStartX = originX + toPlan.startOffset * DAY_WIDTH;
      const toMidY = toRowY + ROW_HEIGHT / 2;

      // Simple L-shaped polyline: horizontal step out from `from`, vertical
      // to target row, horizontal into `to`'s start.
      const midX = (fromEndX + toStartX) / 2;
      shapes.push({
        type: 'polyline',
        points: [
          [fromEndX, fromMidY],
          [midX, fromMidY],
          [midX, toMidY],
          [toStartX, toMidY],
        ],
        style: { fill: 'none', stroke: COLOR_DEP_ARROW, strokeWidth: 1 },
      });
      // Arrowhead at `to`'s start.
      const ah = 4;
      shapes.push({
        type: 'polygon',
        points: [
          [toStartX, toMidY],
          [toStartX - ah, toMidY - ah / 2],
          [toStartX - ah, toMidY + ah / 2],
        ],
        style: { fill: COLOR_DEP_ARROW, stroke: COLOR_DEP_ARROW, strokeWidth: 1 },
      });
    }
  }

  // Named date-range labels: small text drawn at the top of the chart body
  // centred over the band. Only meaningful with a calendar start date.
  if (hasStartDate && ast.namedRanges && ast.namedRanges.length > 0) {
    for (const r of ast.namedRanges) {
      const fromOff = Math.round((parseDate(r.from).getTime() - startMs) / 86400000);
      const toOff = Math.round((parseDate(r.to).getTime() - startMs) / 86400000);
      if (toOff < 0 || fromOff >= totalDays) continue;
      const lo = Math.max(0, fromOff);
      const hi = Math.min(totalDays - 1, toOff);
      const cx = originX + (lo + (hi - lo + 1) / 2) * DAY_WIDTH;
      shapes.push({
        type: 'text',
        x: cx,
        y: originY + NAMED_RANGE_LABEL_H / 2 + 2,
        text: r.label,
        anchor: 'middle',
        baseline: 'middle',
        font: { family: FONT_FAMILY, size: FONT_LABEL, weight: 'bold', color: COLOR_TEXT },
      });
    }
  }

  // Today marker: a vertical line at the today day-offset, coloured per the
  // source declaration (or a default red). Sits above bars so it's visible.
  if (ast.today) {
    const tx = originX + ast.today.dayOffset * DAY_WIDTH + DAY_WIDTH / 2;
    const stroke = resolveColor(ast.today.color ?? '') ?? ast.today.color ?? COLOR_TODAY_DEFAULT;
    shapes.push({
      type: 'line',
      x1: tx,
      y1: originY,
      x2: tx,
      y2: originY + bodyHeight,
      style: { stroke, strokeWidth: 2 },
    });
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

interface ClosedRangeMs {
  fromMs: number;
  toMs: number;
}

function isInClosedRange(ms: number, ranges: ClosedRangeMs[]): boolean {
  for (const r of ranges) {
    if (ms >= r.fromMs && ms <= r.toMs) return true;
  }
  return false;
}

function isClosed(
  date: Date,
  closed: Set<WeekdayName>,
  ranges: ClosedRangeMs[],
): boolean {
  if (closed.has(WEEKDAY_NAMES[date.getUTCDay()]!)) return true;
  if (ranges.length > 0 && isInClosedRange(date.getTime(), ranges)) return true;
  return false;
}

function nextWorkingOffset(
  offset: number,
  startMs: number,
  closed: Set<WeekdayName>,
  ranges: ClosedRangeMs[],
): number {
  let cur = offset;
  while (isClosed(new Date(startMs + cur * 86400000), closed, ranges)) cur++;
  return cur;
}

function workingDayOffsetAfter(
  endOffset: number,
  startMs: number,
  closed: Set<WeekdayName>,
  ranges: ClosedRangeMs[],
): number {
  return nextWorkingOffset(endOffset + 1, startMs, closed, ranges);
}

/**
 * Advance N working days from `startOffset+1`. Each step that lands on a
 * non-closed day counts toward N; closed weekdays and closed ranges are
 * skipped. Returns the offset of the Nth working day. When `n` is 0, returns
 * `startOffset + 1` (the very next calendar day) — caller decides whether
 * that semantics is right.
 */
function offsetAfterNWorkingDays(
  startOffset: number,
  n: number,
  startMs: number,
  closed: Set<WeekdayName>,
  ranges: ClosedRangeMs[],
): number {
  let cur = startOffset;
  let count = 0;
  while (count < n) {
    cur++;
    if (!isClosed(new Date(startMs + cur * 86400000), closed, ranges)) count++;
  }
  return cur;
}

function endOffsetForDuration(
  startOffset: number,
  duration: number,
  startMs: number,
  closed: Set<WeekdayName>,
  ranges: ClosedRangeMs[],
): number {
  let cur = startOffset;
  let count = 1;
  while (count < duration) {
    cur++;
    if (!isClosed(new Date(startMs + cur * 86400000), closed, ranges)) count++;
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
