import type {
  GanttAst,
  GanttTask,
  WeekdayName,
  GanttDependency,
  GanttResourceAssignment,
  GanttClosedRange,
  GanttColoredRange,
  GanttNamedRange,
} from '../../ast/gantt.js';

const WRAPPER = /^@(start|end)\w+/i;
const LINE_COMMENT = /^\s*'/;
const TITLE = /^title\s+(.+)\s*$/i;

// Project start. Accepts ISO (`YYYY-MM-DD`) or slash (`YYYY/MM/DD`) dates,
// with an optional `on` keyword (`project starts on 2020-07-01`).
const PROJECT_STARTS =
  /^Project\s+starts\s+(?:on\s+)?(\d{4}[-/]\d{2}[-/]\d{2})\s*$/i;
// `Project starts the 6th of July 2020` — English date form (optional `the`,
// optional ordinal suffix). Used by the PlantUML docs for `printscale weekly`
// examples. Normalised to an ISO startDate.
const PROJECT_STARTS_ENGLISH =
  /^Project\s+starts\s+(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+of\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\s*$/i;
// `<weekday> are/is close[d]` — accept both "close" and "closed" spellings.
const WEEKDAY_CLOSED =
  /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+(?:are|is)\s+closed?\s*$/i;
// `YYYY-MM-DD to YYYY-MM-DD is close[d]` — inclusive calendar range.
const DATE_RANGE_CLOSED =
  /^(\d{4}[-/]\d{2}[-/]\d{2})\s+to\s+(\d{4}[-/]\d{2}[-/]\d{2})\s+(?:is|are)\s+closed?\s*$/i;
// `YYYY/MM/DD to YYYY/MM/DD are colored in <color>` — coloured band.
const DATE_RANGE_COLORED =
  /^(\d{4}[-/]\d{2}[-/]\d{2})\s+to\s+(\d{4}[-/]\d{2}[-/]\d{2})\s+(?:are|is)\s+colored\s+in\s+(\S+)\s*$/i;
// `YYYY/MM/DD to YYYY/MM/DD are named [Label]` — labelled band.
const DATE_RANGE_NAMED =
  /^(\d{4}[-/]\d{2}[-/]\d{2})\s+to\s+(\d{4}[-/]\d{2}[-/]\d{2})\s+(?:are|is)\s+named\s+\[([^\]]+)\]\s*$/i;
// `today is N days after start [and is colored in <color>]`.
const TODAY_OFFSET =
  /^today\s+is\s+(\d+)\s+days?\s+after\s+start(?:\s+and\s+is\s+colored\s+in\s+(\S+))?\s*$/i;

const MONTH_NUM: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

// printscale forms. Order matters: most specific first.
const PRINTSCALE_WEEKLY_CAL = /^printscale\s+weekly\s+with\s+calendar\s+date\s*$/i;
const PRINTSCALE_WEEKLY_NUM = /^printscale\s+weekly\s+with\s+week\s+numbering\s+from\s+(-?\d+)\s*$/i;
const PRINTSCALE_WEEKLY = /^printscale\s+weekly\s*$/i;
const PRINTSCALE_DAILY = /^printscale\s+daily\s*$/i;

// `[Display] as [Alias]` form is supported anywhere a task is declared.
// The optional alias becomes the canonical id; the bracket label becomes
// the display name. Without `as`, the bracket label is both id and display.
const TASK_LASTS =
  /^\[([^\]]+)\](?:\s+as\s+\[([^\]]+)\])?\s+lasts\s+(\d+)\s+days?(?:\s+and\s+starts\s+at\s+\[([^\]]+)\]'s\s+end)?(?:\s+and\s+is\s+colored\s+in\s+(\S+))?\s*$/i;
const TASK_STARTS_AT = /^\[([^\]]+)\]\s+starts\s+at\s+\[([^\]]+)\]'s\s+end\s*$/i;
// `[Task] starts N working day(s) after [Other]'s end (and requires <duration>)?`
// Closed weekdays and closed date ranges are skipped when counting N. The
// optional `and requires <duration>` tail sets the task's duration on the
// same line.
const TASK_STARTS_WORKING_DAYS_AFTER =
  /^\[([^\]]+)\](?:\s+as\s+\[([^\]]+)\])?\s+starts\s+(\d+)\s+working\s+days?\s+after\s+\[([^\]]+)\]'?s?\s+end(?:\s+and\s+requires\s+(\d+\s+(?:day|days|week|weeks|month|months)(?:\s+and\s+\d+\s+(?:day|days|week|weeks|month|months))*))?\s*$/i;
// `[Task] starts YYYY-MM-DD and ends YYYY-MM-DD` — combined start + end on
// one line. Must be checked before the bare `starts` pattern.
const TASK_STARTS_AND_ENDS_DATE =
  /^\[([^\]]+)\](?:\s+as\s+\[([^\]]+)\])?\s+starts\s+(\d{4}-\d{2}-\d{2})\s+and\s+ends\s+(\d{4}-\d{2}-\d{2})\s*$/i;
// `[Task] starts (at)? YYYY-MM-DD and requires <duration>` — combined start +
// duration on one line. Must be checked before the bare `starts` pattern.
const TASK_STARTS_AND_REQUIRES =
  /^\[([^\]]+)\](?:\s+as\s+\[([^\]]+)\])?\s+starts\s+(?:at\s+)?(\d{4}-\d{2}-\d{2})\s+and\s+requires\s+(.+?)\s*$/i;
// `[Task] starts YYYY-MM-DD` — explicit calendar start.
const TASK_STARTS_DATE = /^\[([^\]]+)\](?:\s+as\s+\[([^\]]+)\])?\s+starts\s+(\d{4}-\d{2}-\d{2})\s*$/i;
// `[Task] starts at YYYY-MM-DD` — explicit calendar start with `at`.
const TASK_STARTS_AT_DATE = /^\[([^\]]+)\](?:\s+as\s+\[([^\]]+)\])?\s+starts\s+at\s+(\d{4}-\d{2}-\d{2})\s*$/i;
// `[Task] ends YYYY-MM-DD` — explicit calendar end.
const TASK_ENDS_DATE = /^\[([^\]]+)\]\s+ends\s+(\d{4}-\d{2}-\d{2})\s*$/i;
// `[Task] ends at YYYY-MM-DD` — explicit calendar end with `at`.
const TASK_ENDS_AT_DATE = /^\[([^\]]+)\]\s+ends\s+at\s+(\d{4}-\d{2}-\d{2})\s*$/i;
// `[Task] starts D+N` — relative day offset from project day 0.
const TASK_STARTS_DAY = /^\[([^\]]+)\](?:\s+as\s+\[([^\]]+)\])?\s+starts\s+D\+(\d+)\s*$/i;
// `[Task] ends D+N` — relative end day offset from project day 0.
const TASK_ENDS_DAY = /^\[([^\]]+)\]\s+ends\s+D\+(\d+)\s*$/i;
const TASK_HAPPENS = /^\[([^\]]+)\]\s+happens\s+at\s+\[([^\]]+)\]'s\s+end\s*$/i;
// `[M] happens at YYYY-MM-DD` — milestone at an explicit calendar date.
const TASK_HAPPENS_AT_DATE =
  /^\[([^\]]+)\]\s+happens\s+at\s+(\d{4}[-/]\d{2}[-/]\d{2})\s*$/i;
// `[M] happens YYYY-MM-DD` — milestone at an explicit calendar date (no `at`).
const TASK_HAPPENS_DATE =
  /^\[([^\]]+)\]\s+happens\s+(\d{4}[-/]\d{2}[-/]\d{2})\s*$/i;
// `[M] happens on N day|days|week|weeks after [Other]'s end` — milestone
// offset (in calendar days) from another task's computed end.
const TASK_HAPPENS_AFTER =
  /^\[([^\]]+)\]\s+happens\s+on\s+(\d+)\s+(day|days|week|weeks)\s+after\s+\[([^\]]+)\]'?s?\s+end\s*$/i;
// `[M] happens N days after start` — milestone N days after the project start.
const TASK_HAPPENS_AFTER_START =
  /^\[([^\]]+)\]\s+happens\s+(\d+)\s+(day|days|week|weeks)\s+after\s+start\s*$/i;
// `[Task] requires N days and starts N days after start` — task with
// duration plus a project-relative start offset.
const TASK_REQUIRES_AND_STARTS_AFTER_START =
  /^\[([^\]]+)\](?:\s+as\s+\[([^\]]+)\])?\s+requires\s+(\d+)\s+days?\s+and\s+starts\s+(\d+)\s+(day|days|week|weeks)\s+after\s+start\s*$/i;
// `[Task] requires N days and starts N days after start` — same form with
// the clauses reversed: `starts N days after start and requires N days`.
const TASK_STARTS_AFTER_START_AND_REQUIRES =
  /^\[([^\]]+)\](?:\s+as\s+\[([^\]]+)\])?\s+(?:starts\s+)?(\d+)\s+(day|days|week|weeks)\s+after\s+start\s+and\s+requires\s+(\d+)\s+days?\s*$/i;
// `[Task] occurs from [A] to [B]` — duration defined by two referenced
// tasks/milestones (start at A's end, end at B's end).
const TASK_OCCURS_FROM_TO =
  /^\[([^\]]+)\](?:\s+as\s+\[([^\]]+)\])?\s+occurs\s+from\s+\[([^\]]+)\]\s+to\s+\[([^\]]+)\]\s*$/i;
// `[Task] displays on same row as [Other]` — share the chart row of `Other`.
const TASK_SAME_ROW_AS =
  /^\[([^\]]+)\]\s+displays\s+on\s+same\s+row\s+as\s+\[([^\]]+)\]\s*$/i;
// `note bottom` opens a note block; `end note` closes it. Inner lines are
// stitched into the previous task's `note` field.
const NOTE_BOTTOM_OPEN = /^note\s+bottom\s*$/i;
const NOTE_END = /^end\s+note\s*$/i;
const TASK_COLOR = /^\[([^\]]+)\]\s+is\s+colored\s+in\s+(\S+)\s*$/i;
const TASK_RESOURCES = /^\[([^\]]+)\]\s+requires\s+(\d+)\s+(?:people|person)\s*$/i;
// `[Task] requires <duration>` where duration is a compound time expression
// like `15 days`, `1 week`, or `1 week and 4 days`. Distinguished from
// `requires N people/person` (handled above) by the unit set.
const TASK_REQUIRES_DURATION =
  /^\[([^\]]+)\](?:\s+as\s+\[([^\]]+)\])?\s+requires\s+(\d+\s+(?:day|days|week|weeks|month|months)(?:\s+and\s+\d+\s+(?:day|days|week|weeks|month|months))*)\s*$/i;
// `[Task] on {Name[:N%]} ({Name[:N%]})* (on {...})* requires <duration>` —
// task with one or more resource assignments. Each `on` may be followed by
// one brace group or several space-separated brace groups (e.g.
// `on {Alice} {Bob}`). Multiple `on` clauses may also be chained. The
// trailing duration shares the same compound time-expression grammar as
// TASK_REQUIRES_DURATION.
const TASK_ON_RESOURCES_REQUIRES =
  /^\[([^\]]+)\](?:\s+as\s+\[([^\]]+)\])?\s+((?:on\s+\{[^}]+\}(?:\s+\{[^}]+\})*\s+)+)requires\s+(\d+\s+(?:day|days|week|weeks|month|months)(?:\s+and\s+\d+\s+(?:day|days|week|weeks|month|months))*)\s*(?:then\s+\[([^\]]+)\](?:\s+as\s+\[([^\]]+)\])?\s+((?:on\s+\{[^}]+\}(?:\s+\{[^}]+\})*\s+)*)requires\s+(\d+\s+(?:day|days|week|weeks|month|months)(?:\s+and\s+\d+\s+(?:day|days|week|weeks|month|months))*))?\s*$/i;
const THEN_LASTS = /^then\s+\[([^\]]+)\](?:\s+as\s+\[([^\]]+)\])?\s+lasts\s+(\d+)\s+days?\s*$/i;
// `then [Task] requires <duration>` — used by the inline-then-chain pre-split
// for lines like `[A] requires 14 days then [B] requires 4 days then ...`.
const THEN_REQUIRES_DURATION =
  /^then\s+\[([^\]]+)\](?:\s+as\s+\[([^\]]+)\])?\s+requires\s+(\d+\s+(?:day|days|week|weeks|month|months)(?:\s+and\s+\d+\s+(?:day|days|week|weeks|month|months))*)\s*$/i;
const THEN_COLOR = /^then\s+\[([^\]]+)\]\s+is\s+colored\s+in\s+(\S+)\s*$/i;

// One `{Name[:N%]}` brace group. Used to extract resource assignments out of
// the concatenated resource section captured above. Any `on` keywords in the
// blob are skipped — every brace group in the blob is treated as a resource
// assignment.
const RESOURCE_BRACE_GROUP = /\{([^}]+)\}/g;
const RESOURCE_PERCENT = /^([^:]+?)(?::\s*(\d+)%?)?\s*$/;

function parseResourceClauses(blob: string): GanttResourceAssignment[] {
  const out: GanttResourceAssignment[] = [];
  RESOURCE_BRACE_GROUP.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = RESOURCE_BRACE_GROUP.exec(blob))) {
    const inner = m[1]!.trim();
    const parts = RESOURCE_PERCENT.exec(inner);
    if (parts) {
      const name = parts[1]!.trim();
      const ra: GanttResourceAssignment = { name };
      if (parts[2] !== undefined) ra.percent = Number(parts[2]);
      out.push(ra);
    } else {
      out.push({ name: inner });
    }
  }
  return out;
}
// `[A] -> [B]` — dependency arrow.
const DEPENDENCY = /^\[([^\]]+)\]\s*->\s*\[([^\]]+)\]\s*$/;
// Section separator: `-- Section name --`. Trailing dashes may be one-or-more.
const SECTION_SEPARATOR = /^--+\s*(.+?)\s*--+\s*$/;

// PlantUML uses 1 week = 7 days and 1 month = 30 days by default.
const DURATION_UNIT_DAYS: Record<string, number> = {
  day: 1, days: 1,
  week: 7, weeks: 7,
  month: 30, months: 30,
};

/**
 * Normalise `YYYY/MM/DD` or `YYYY-MM-DD` to ISO `YYYY-MM-DD`. Slash-separated
 * forms are accepted in the wider date-range patterns; per-task patterns are
 * still ISO-only and use this only when the input happens to match either form.
 */
function toIso(date: string): string {
  return date.replace(/\//g, '-');
}

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
  // Fallback display-name -> id index for resolving references that use a
  // display name on a task that was originally declared with an alias.
  const byDisplay = new Map<string, string>();
  const dependencies: GanttDependency[] = [];
  let previousTaskId = '';
  let currentSection = '';

  /**
   * Get-or-create a task. When `alias` is provided the canonical id is the
   * alias and `display` is recorded as the displayName; otherwise `display`
   * doubles as the id.
   */
  const upsert = (display: string, alias?: string): GanttTask => {
    const id = (alias && alias.trim()) || display;
    let t = byId.get(id);
    if (!t) {
      t = { id, duration: 1, startAfter: '', isMilestone: false, color: '', resources: 0 };
      if (alias && alias.trim()) t.displayName = display;
      if (currentSection) t.section = currentSection;
      byId.set(id, t);
      if (display && display !== id && !byDisplay.has(display)) {
        byDisplay.set(display, id);
      }
      ast.tasks.push(t);
    } else if (alias && alias.trim() && !t.displayName && display && display !== id) {
      // Backfill display name on a task that was first referenced without
      // its alias form (unlikely in normal usage but harmless).
      t.displayName = display;
    }
    return t;
  };

  /**
   * Resolve a bare bracket reference: prefer alias/id match, then fall
   * back to display-name index. Used by reference-only lines such as
   * `[X] ends 2020-…`, `[X] -> [Y]`, etc.
   */
  const resolveRef = (label: string): string => {
    const trimmed = label.trim();
    if (byId.has(trimmed)) return trimmed;
    const viaDisplay = byDisplay.get(trimmed);
    return viaDisplay ?? trimmed;
  };

  /**
   * Pre-split a line at every ` then [` boundary into multiple pseudo-lines
   * so an inline chain like
   *   `[A] requires 14 days then [B] requires 4 days then [C] requires 6 days`
   * is processed as three logical lines (the first stays as-is; later ones
   * keep their leading `then`). The TASK_ON_RESOURCES_REQUIRES pattern still
   * handles a single inline `then` natively, so this pre-split only fires
   * when there are two or more ` then [` boundaries on one line.
   */
  const splitThenChain = (text: string): string[] => {
    const parts = text.split(/\s+then\s+(?=\[)/i);
    if (parts.length <= 2) return [text];
    return parts.map((p, i) => (i === 0 ? p : `then ${p}`));
  };

  /**
   * Pre-pass: collect lines, drop wrappers/comments, and detect
   * `note bottom ... end note` blocks. Each completed note block emits a
   * synthetic `__note__` pseudo-line whose body is the joined inner text;
   * the main loop attaches it to the previous task.
   */
  const lines: string[] = [];
  let inNote = false;
  let noteLines: string[] = [];
  for (const raw of source.split(/\r\n|\r|\n/)) {
    const trimmed = raw.trim();
    if (inNote) {
      if (NOTE_END.test(trimmed)) {
        const body = noteLines.join('\n');
        lines.push(`__note__:${body}`);
        noteLines = [];
        inNote = false;
        continue;
      }
      // Preserve original (non-leading/trailing-whitespace) content.
      noteLines.push(raw.trim());
      continue;
    }
    if (!trimmed) continue;
    if (LINE_COMMENT.test(trimmed)) continue;
    if (WRAPPER.test(trimmed)) continue;
    if (NOTE_BOTTOM_OPEN.test(trimmed)) {
      inNote = true;
      noteLines = [];
      continue;
    }
    for (const sub of splitThenChain(trimmed)) lines.push(sub);
  }

  for (const text of lines) {
    // Synthetic `__note__:<body>` injected by the pre-pass for completed
    // `note bottom ... end note` blocks. Attach to the previous task.
    if (text.startsWith('__note__:')) {
      const body = text.slice('__note__:'.length);
      if (previousTaskId) {
        const prev = byId.get(previousTaskId);
        if (prev) prev.note = prev.note ? `${prev.note}\n${body}` : body;
      }
      continue;
    }

    let m: RegExpExecArray | null;
    if ((m = SECTION_SEPARATOR.exec(text))) {
      currentSection = m[1]!.trim();
      continue;
    }
    if (PRINTSCALE_WEEKLY_CAL.test(text)) {
      ast.printScale = { scale: 'weekly', weekNumberingMode: 'calendar' };
      continue;
    }
    if ((m = PRINTSCALE_WEEKLY_NUM.exec(text))) {
      ast.printScale = {
        scale: 'weekly',
        weekNumberingMode: 'number',
        weekNumberingFrom: Number(m[1]),
      };
      continue;
    }
    if (PRINTSCALE_WEEKLY.test(text)) {
      ast.printScale = { scale: 'weekly', weekNumberingMode: 'number' };
      continue;
    }
    if (PRINTSCALE_DAILY.test(text)) {
      ast.printScale = { scale: 'daily' };
      continue;
    }
    if ((m = TASK_ON_RESOURCES_REQUIRES.exec(text))) {
      const days1 = parseDurationDays(m[4]!);
      if (Number.isFinite(days1) && days1 > 0) {
        const t1 = upsert(m[1]!.trim(), m[2]?.trim());
        t1.duration = days1;
        const r1 = parseResourceClauses(m[3]!);
        if (r1.length > 0) {
          t1.resourceAssignments = (t1.resourceAssignments ?? []).concat(r1);
        }
        previousTaskId = t1.id;

        // Optional `then [...] (on {...})* requires <duration>` tail.
        if (m[5]) {
          const days2 = parseDurationDays(m[8]!);
          if (Number.isFinite(days2) && days2 > 0) {
            const t2 = upsert(m[5]!.trim(), m[6]?.trim());
            t2.duration = days2;
            t2.startAfter = t1.id;
            if (m[7]) {
              const r2 = parseResourceClauses(m[7]);
              if (r2.length > 0) {
                t2.resourceAssignments = (t2.resourceAssignments ?? []).concat(r2);
              }
            }
            previousTaskId = t2.id;
          }
        }
        continue;
      }
    }
    if ((m = TASK_REQUIRES_DURATION.exec(text))) {
      const days = parseDurationDays(m[3]!);
      if (Number.isFinite(days) && days > 0) {
        const task = upsert(m[1]!.trim(), m[2]?.trim());
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
      ast.startDate = toIso(m[1]!);
      continue;
    }
    if ((m = PROJECT_STARTS_ENGLISH.exec(text))) {
      const day = Number(m[1]);
      const month = MONTH_NUM[m[2]!.toLowerCase()]!;
      const year = Number(m[3]);
      ast.startDate =
        `${year.toString().padStart(4, '0')}-` +
        `${String(month).padStart(2, '0')}-` +
        `${String(day).padStart(2, '0')}`;
      continue;
    }
    if ((m = WEEKDAY_CLOSED.exec(text))) {
      ast.closedDays.push(m[1]!.toLowerCase() as WeekdayName);
      continue;
    }
    if ((m = DATE_RANGE_CLOSED.exec(text))) {
      const range: GanttClosedRange = { from: toIso(m[1]!), to: toIso(m[2]!) };
      (ast.closedRanges ??= []).push(range);
      continue;
    }
    if ((m = DATE_RANGE_COLORED.exec(text))) {
      const range: GanttColoredRange = {
        from: toIso(m[1]!),
        to: toIso(m[2]!),
        color: m[3]!.trim(),
      };
      (ast.coloredRanges ??= []).push(range);
      continue;
    }
    if ((m = DATE_RANGE_NAMED.exec(text))) {
      const range: GanttNamedRange = {
        from: toIso(m[1]!),
        to: toIso(m[2]!),
        label: m[3]!.trim(),
      };
      (ast.namedRanges ??= []).push(range);
      continue;
    }
    if ((m = TODAY_OFFSET.exec(text))) {
      ast.today = { dayOffset: Number(m[1]) };
      if (m[2]) ast.today.color = m[2]!.trim();
      continue;
    }
    if ((m = TASK_LASTS.exec(text))) {
      const task = upsert(m[1]!.trim(), m[2]?.trim());
      task.duration = Number(m[3]);
      if (m[4]) task.startAfter = resolveRef(m[4]);
      if (m[5]) task.color = m[5]!.trim();
      previousTaskId = task.id;
      continue;
    }
    if ((m = TASK_STARTS_DAY.exec(text))) {
      const task = upsert(m[1]!.trim(), m[2]?.trim());
      task.startDay = Number(m[3]);
      if (task.endDay !== undefined && task.endDay >= task.startDay) {
        task.duration = task.endDay - task.startDay + 1;
      }
      previousTaskId = task.id;
      continue;
    }
    if ((m = TASK_ENDS_DAY.exec(text))) {
      const id = resolveRef(m[1]!);
      const task = byId.get(id) ?? upsert(m[1]!.trim());
      task.endDay = Number(m[2]);
      if (task.startDay !== undefined && task.endDay >= task.startDay) {
        task.duration = task.endDay - task.startDay + 1;
      }
      previousTaskId = task.id;
      continue;
    }
    if ((m = TASK_STARTS_AND_ENDS_DATE.exec(text))) {
      const task = upsert(m[1]!.trim(), m[2]?.trim());
      task.startDate = m[3]!;
      task.endDate = m[4]!;
      const d = inclusiveDayCount(task.startDate, task.endDate);
      if (d > 0) task.duration = d;
      previousTaskId = task.id;
      continue;
    }
    if ((m = TASK_STARTS_AND_REQUIRES.exec(text))) {
      const days = parseDurationDays(m[4]!);
      if (Number.isFinite(days) && days > 0) {
        const task = upsert(m[1]!.trim(), m[2]?.trim());
        task.startDate = m[3]!;
        task.duration = days;
        previousTaskId = task.id;
        continue;
      }
    }
    if ((m = TASK_STARTS_AT_DATE.exec(text))) {
      const task = upsert(m[1]!.trim(), m[2]?.trim());
      task.startDate = m[3]!;
      if (task.endDate) {
        const d = inclusiveDayCount(task.startDate, task.endDate);
        if (d > 0) task.duration = d;
      }
      previousTaskId = task.id;
      continue;
    }
    if ((m = TASK_STARTS_DATE.exec(text))) {
      const task = upsert(m[1]!.trim(), m[2]?.trim());
      task.startDate = m[3]!;
      if (task.endDate) {
        const d = inclusiveDayCount(task.startDate, task.endDate);
        if (d > 0) task.duration = d;
      }
      previousTaskId = task.id;
      continue;
    }
    if ((m = TASK_ENDS_AT_DATE.exec(text))) {
      const id = resolveRef(m[1]!);
      const task = byId.get(id) ?? upsert(m[1]!.trim());
      task.endDate = m[2]!;
      if (task.startDate) {
        const d = inclusiveDayCount(task.startDate, task.endDate);
        if (d > 0) task.duration = d;
      }
      previousTaskId = task.id;
      continue;
    }
    if ((m = TASK_ENDS_DATE.exec(text))) {
      const id = resolveRef(m[1]!);
      const task = byId.get(id) ?? upsert(m[1]!.trim());
      task.endDate = m[2]!;
      if (task.startDate) {
        const d = inclusiveDayCount(task.startDate, task.endDate);
        if (d > 0) task.duration = d;
      }
      previousTaskId = task.id;
      continue;
    }
    if ((m = TASK_STARTS_WORKING_DAYS_AFTER.exec(text))) {
      const task = upsert(m[1]!.trim(), m[2]?.trim());
      const n = Number(m[3]);
      const afterId = resolveRef(m[4]!);
      task.workingDaysAfter = { after: afterId, days: n };
      // Carry startAfter too so layout fallbacks (e.g. dep chains) still
      // reason about ordering; the layout uses workingDaysAfter when set.
      task.startAfter = afterId;
      if (m[5]) {
        const days = parseDurationDays(m[5]);
        if (Number.isFinite(days) && days > 0) task.duration = days;
      }
      previousTaskId = task.id;
      continue;
    }
    if ((m = TASK_STARTS_AT.exec(text))) {
      const task = upsert(m[1]!.trim());
      task.startAfter = resolveRef(m[2]!);
      previousTaskId = task.id;
      continue;
    }
    if ((m = TASK_HAPPENS.exec(text))) {
      const task = upsert(m[1]!.trim());
      task.startAfter = resolveRef(m[2]!);
      task.isMilestone = true;
      task.duration = 0;
      previousTaskId = task.id;
      continue;
    }
    if ((m = TASK_HAPPENS_AT_DATE.exec(text))) {
      const task = upsert(m[1]!.trim());
      task.startDate = toIso(m[2]!);
      task.isMilestone = true;
      task.duration = 0;
      previousTaskId = task.id;
      continue;
    }
    if ((m = TASK_HAPPENS_AFTER.exec(text))) {
      const task = upsert(m[1]!.trim());
      const n = Number(m[2]);
      const unit = m[3]!.toLowerCase();
      const unitDays = DURATION_UNIT_DAYS[unit] ?? 1;
      task.isMilestone = true;
      task.duration = 0;
      task.milestoneOffset = { after: resolveRef(m[4]!), days: n * unitDays };
      previousTaskId = task.id;
      continue;
    }
    if ((m = TASK_HAPPENS_AFTER_START.exec(text))) {
      const task = upsert(m[1]!.trim());
      const n = Number(m[2]);
      const unit = m[3]!.toLowerCase();
      const unitDays = DURATION_UNIT_DAYS[unit] ?? 1;
      task.isMilestone = true;
      task.duration = 0;
      task.startOffset = n * unitDays;
      previousTaskId = task.id;
      continue;
    }
    if ((m = TASK_HAPPENS_DATE.exec(text))) {
      const task = upsert(m[1]!.trim());
      task.startDate = toIso(m[2]!);
      task.isMilestone = true;
      task.duration = 0;
      previousTaskId = task.id;
      continue;
    }
    if ((m = TASK_REQUIRES_AND_STARTS_AFTER_START.exec(text))) {
      const task = upsert(m[1]!.trim(), m[2]?.trim());
      task.duration = Number(m[3]);
      const n = Number(m[4]);
      const unit = m[5]!.toLowerCase();
      const unitDays = DURATION_UNIT_DAYS[unit] ?? 1;
      task.startOffset = n * unitDays;
      previousTaskId = task.id;
      continue;
    }
    if ((m = TASK_STARTS_AFTER_START_AND_REQUIRES.exec(text))) {
      const task = upsert(m[1]!.trim(), m[2]?.trim());
      const n = Number(m[3]);
      const unit = m[4]!.toLowerCase();
      const unitDays = DURATION_UNIT_DAYS[unit] ?? 1;
      task.startOffset = n * unitDays;
      task.duration = Number(m[5]);
      previousTaskId = task.id;
      continue;
    }
    if ((m = TASK_OCCURS_FROM_TO.exec(text))) {
      const task = upsert(m[1]!.trim(), m[2]?.trim());
      task.occursFrom = { from: resolveRef(m[3]!), to: resolveRef(m[4]!) };
      previousTaskId = task.id;
      continue;
    }
    if ((m = TASK_SAME_ROW_AS.exec(text))) {
      const id = resolveRef(m[1]!);
      const task = byId.get(id) ?? upsert(m[1]!.trim());
      task.sameRowAs = resolveRef(m[2]!);
      // Don't reset previousTaskId here — same-row directives shouldn't
      // break a `then ...` chain or note-block attachment.
      continue;
    }
    if ((m = TASK_COLOR.exec(text))) {
      const id = resolveRef(m[1]!);
      const task = byId.get(id) ?? upsert(m[1]!.trim());
      task.color = m[2]!.trim();
      continue;
    }
    if ((m = TASK_RESOURCES.exec(text))) {
      const id = resolveRef(m[1]!);
      const task = byId.get(id) ?? upsert(m[1]!.trim());
      task.resources = Number(m[2]);
      continue;
    }
    if ((m = THEN_LASTS.exec(text))) {
      const task = upsert(m[1]!.trim(), m[2]?.trim());
      task.duration = Number(m[3]);
      task.startAfter = previousTaskId;
      previousTaskId = task.id;
      continue;
    }
    if ((m = THEN_REQUIRES_DURATION.exec(text))) {
      const days = parseDurationDays(m[3]!);
      if (Number.isFinite(days) && days > 0) {
        const task = upsert(m[1]!.trim(), m[2]?.trim());
        task.duration = days;
        task.startAfter = previousTaskId;
        previousTaskId = task.id;
        continue;
      }
    }
    if ((m = THEN_COLOR.exec(text))) {
      const id = resolveRef(m[1]!);
      const task = byId.get(id) ?? upsert(m[1]!.trim());
      task.color = m[2]!.trim();
      continue;
    }
    if ((m = DEPENDENCY.exec(text))) {
      const from = resolveRef(m[1]!);
      const to = resolveRef(m[2]!);
      dependencies.push({ from, to });
      continue;
    }
  }

  if (dependencies.length > 0) ast.dependencies = dependencies;
  return ast;
}
