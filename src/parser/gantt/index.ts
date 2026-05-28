import type { GanttAst, GanttTask, WeekdayName } from '../../ast/gantt.js';

const WRAPPER = /^@(start|end)\w+/i;
const LINE_COMMENT = /^\s*'/;
const TITLE = /^title\s+(.+)\s*$/i;

const PROJECT_STARTS = /^Project\s+starts\s+(\d{4}-\d{2}-\d{2})\s*$/i;
const WEEKDAY_CLOSED = /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+(?:are|is)\s+closed\s*$/i;

const TASK_LASTS = /^\[([^\]]+)\]\s+lasts\s+(\d+)\s+days?(?:\s+and\s+starts\s+at\s+\[([^\]]+)\]'s\s+end)?\s*$/i;
const TASK_STARTS_AT = /^\[([^\]]+)\]\s+starts\s+at\s+\[([^\]]+)\]'s\s+end\s*$/i;
// `[Task] starts YYYY-MM-DD` — explicit calendar start.
const TASK_STARTS_DATE = /^\[([^\]]+)\]\s+starts\s+(\d{4}-\d{2}-\d{2})\s*$/i;
// `[Task] ends YYYY-MM-DD` — explicit calendar end.
const TASK_ENDS_DATE = /^\[([^\]]+)\]\s+ends\s+(\d{4}-\d{2}-\d{2})\s*$/i;
const TASK_HAPPENS = /^\[([^\]]+)\]\s+happens\s+at\s+\[([^\]]+)\]'s\s+end\s*$/i;
const TASK_COLOR = /^\[([^\]]+)\]\s+is\s+colored\s+in\s+(\S+)\s*$/i;
const TASK_RESOURCES = /^\[([^\]]+)\]\s+requires\s+(\d+)\s+(?:people|person)\s*$/i;
// `[Task] requires <duration>` where duration is a compound time expression
// like `15 days`, `1 week`, or `1 week and 4 days`. Distinguished from
// `requires N people/person` (handled above) by the unit set.
const TASK_REQUIRES_DURATION =
  /^\[([^\]]+)\]\s+requires\s+(\d+\s+(?:day|days|week|weeks|month|months)(?:\s+and\s+\d+\s+(?:day|days|week|weeks|month|months))*)\s*$/i;
const THEN_LASTS = /^then\s+\[([^\]]+)\]\s+lasts\s+(\d+)\s+days?\s*$/i;
const THEN_COLOR = /^then\s+\[([^\]]+)\]\s+is\s+colored\s+in\s+(\S+)\s*$/i;
// Section separator: `-- Section name --`. Trailing dashes may be one-or-more.
const SECTION_SEPARATOR = /^--+\s*(.+?)\s*--+\s*$/;

// PlantUML uses 1 week = 7 days and 1 month = 30 days by default.
const DURATION_UNIT_DAYS: Record<string, number> = {
  day: 1, days: 1,
  week: 7, weeks: 7,
  month: 30, months: 30,
};

function parseIsoUtcMs(iso: string): number {
  const [y, mo, d] = iso.split('-').map(Number);
  return Date.UTC(y!, mo! - 1, d!);
}

function inclusiveDayCount(startIso: string, endIso: string): number {
  const ms = parseIsoUtcMs(endIso) - parseIsoUtcMs(startIso);
  return Math.floor(ms / 86400000) + 1;
}

function parseDurationDays(expr: string): number {
  let total = 0;
  for (const part of expr.split(/\s+and\s+/i)) {
    const m = /^(\d+)\s+(day|days|week|weeks|month|months)$/i.exec(part.trim());
    if (!m) return Number.NaN;
    total += Number(m[1]) * (DURATION_UNIT_DAYS[m[2]!.toLowerCase()] ?? 0);
  }
  return total;
}

export function parseGantt(source: string): GanttAst {
  const ast: GanttAst = {
    kind: 'gantt',
    title: '',
    startDate: '',
    closedDays: [],
    tasks: [],
  };
  const byId = new Map<string, GanttTask>();
  let previousTaskId = '';
  let currentSection = '';

  const upsert = (id: string): GanttTask => {
    let t = byId.get(id);
    if (!t) {
      t = { id, duration: 1, startAfter: '', isMilestone: false, color: '', resources: 0 };
      if (currentSection) t.section = currentSection;
      byId.set(id, t);
      ast.tasks.push(t);
    }
    return t;
  };

  for (const raw of source.split(/\r\n|\r|\n/)) {
    const text = raw.trim();
    if (!text) continue;
    if (LINE_COMMENT.test(text)) continue;
    if (WRAPPER.test(text)) continue;

    let m: RegExpExecArray | null;
    if ((m = SECTION_SEPARATOR.exec(text))) {
      currentSection = m[1]!.trim();
      continue;
    }
    if ((m = TASK_REQUIRES_DURATION.exec(text))) {
      const days = parseDurationDays(m[2]!);
      if (Number.isFinite(days) && days > 0) {
        const task = upsert(m[1]!.trim());
        task.duration = days;
        previousTaskId = task.id;
        continue;
      }
    }
    if ((m = TITLE.exec(text))) {
      ast.title = m[1]!.trim();
      continue;
    }
    if ((m = PROJECT_STARTS.exec(text))) {
      ast.startDate = m[1]!;
      continue;
    }
    if ((m = WEEKDAY_CLOSED.exec(text))) {
      ast.closedDays.push(m[1]!.toLowerCase() as WeekdayName);
      continue;
    }
    if ((m = TASK_LASTS.exec(text))) {
      const task = upsert(m[1]!.trim());
      task.duration = Number(m[2]);
      if (m[3]) task.startAfter = m[3]!.trim();
      previousTaskId = task.id;
      continue;
    }
    if ((m = TASK_STARTS_DATE.exec(text))) {
      const task = upsert(m[1]!.trim());
      task.startDate = m[2]!;
      if (task.endDate) {
        const d = inclusiveDayCount(task.startDate, task.endDate);
        if (d > 0) task.duration = d;
      }
      previousTaskId = task.id;
      continue;
    }
    if ((m = TASK_ENDS_DATE.exec(text))) {
      const task = upsert(m[1]!.trim());
      task.endDate = m[2]!;
      if (task.startDate) {
        const d = inclusiveDayCount(task.startDate, task.endDate);
        if (d > 0) task.duration = d;
      }
      previousTaskId = task.id;
      continue;
    }
    if ((m = TASK_STARTS_AT.exec(text))) {
      const task = upsert(m[1]!.trim());
      task.startAfter = m[2]!.trim();
      previousTaskId = task.id;
      continue;
    }
    if ((m = TASK_HAPPENS.exec(text))) {
      const task = upsert(m[1]!.trim());
      task.startAfter = m[2]!.trim();
      task.isMilestone = true;
      task.duration = 0;
      previousTaskId = task.id;
      continue;
    }
    if ((m = TASK_COLOR.exec(text))) {
      const task = upsert(m[1]!.trim());
      task.color = m[2]!.trim();
      continue;
    }
    if ((m = TASK_RESOURCES.exec(text))) {
      const task = upsert(m[1]!.trim());
      task.resources = Number(m[2]);
      continue;
    }
    if ((m = THEN_LASTS.exec(text))) {
      const task = upsert(m[1]!.trim());
      task.duration = Number(m[2]);
      task.startAfter = previousTaskId;
      previousTaskId = task.id;
      continue;
    }
    if ((m = THEN_COLOR.exec(text))) {
      const task = upsert(m[1]!.trim());
      task.color = m[2]!.trim();
      continue;
    }
  }

  return ast;
}
