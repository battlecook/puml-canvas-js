export type WeekdayName =
  | 'monday' | 'tuesday' | 'wednesday' | 'thursday'
  | 'friday' | 'saturday' | 'sunday';

export interface GanttResourceAssignment {
  /** Resource name as written inside `{ ... }`. */
  name: string;
  /** Optional percent allocation (`{Alice:25%}` → 25). */
  percent?: number;
}

export interface GanttTask {
  id: string;
  duration: number;
  startAfter: string;
  isMilestone: boolean;
  color: string;
  resources: number;
  /**
   * Optional display name set via `[Display] as [Alias]`. When present,
   * the layout shows this as the row label and bar caption instead of `id`.
   * The `id` is the alias (used for subsequent references).
   */
  displayName?: string;
  /**
   * Name of the section this task belongs to (set by a preceding
   * `-- Section name --` separator). Empty when the task is declared
   * before any section divider.
   */
  section?: string;
  /**
   * Explicit start date (`[Task] starts YYYY-MM-DD`) as ISO string.
   * When present, overrides dependency-based positioning in calendar mode.
   */
  startDate?: string;
  /**
   * Explicit end date (`[Task] ends YYYY-MM-DD`) as ISO string. When set
   * together with `startDate`, the parser computes `duration` as the
   * inclusive day count.
   */
  endDate?: string;
  /**
   * Relative day offset from project start (`[Task] starts D+N`). Zero-based:
   * `D+0` means project day 1. Used when no calendar `Project starts` date
   * is given; the layout renders an ordinal day axis.
   */
  startDay?: number;
  /**
   * Relative end-day offset (`[Task] ends D+N`). When set together with
   * `startDay`, the parser computes `duration` as the inclusive day count.
   */
  endDay?: number;
  /**
   * Resources assigned to the task via `[Task] on {Name}` or
   * `[Task] on {Name:25%}` clauses. Multiple `on` clauses accumulate.
   * Layout currently uses this only for the row-label suffix.
   */
  resourceAssignments?: GanttResourceAssignment[];
  /**
   * Milestone offset relative to another task's end (`[M] happens on N
   * days|weeks after [Other]'s end`). When set the milestone is positioned
   * `days` days after `after`'s computed end offset.
   */
  milestoneOffset?: {
    after: string;
    days: number;
  };
  /**
   * `[Task] starts N working days after [Other]'s end` — start `days`
   * working days (skipping closed weekdays and closed ranges) after the
   * referenced task's computed end. `after` is the referenced task's id.
   */
  workingDaysAfter?: {
    after: string;
    days: number;
  };
  /**
   * `[Task] happens N days after start` / `[Task] starts N days after start`
   * — relative offset (in calendar days) from the project start. Like
   * `startDay` but measured from project day 0 in calendar terms; the
   * layout treats it the same as `startDay` for positioning.
   */
  startOffset?: number;
  /**
   * `[Task] displays on same row as [Other]` — render this task on the
   * same y as the referenced task, sharing one row in the chart body.
   */
  sameRowAs?: string;
  /**
   * `[Task] occurs from [A] to [B]` — start at A's end, end at B's end.
   * Resolved during layout by looking up the referenced tasks' offsets.
   */
  occursFrom?: {
    from: string;
    to: string;
  };
  /**
   * Free-form note text accumulated from a following
   * `note bottom ... end note` block. Rendered below the task bar.
   * Lines are joined with `\n`.
   */
  note?: string;
}

/**
 * `today is N days after start [and is colored in #color]` — vertical
 * today marker at calendar/day offset N from the project start.
 */
export interface GanttToday {
  dayOffset: number;
  color?: string;
}

/**
 * `YYYY/MM/DD to YYYY/MM/DD are colored in <color>` — coloured band
 * spanning a date range, painted across the body of the chart.
 */
export interface GanttColoredRange {
  from: string;
  to: string;
  color: string;
}

/**
 * `YYYY/MM/DD to YYYY/MM/DD are named [Label]` — labelled band spanning
 * a date range. Layout renders the label centred above the band.
 */
export interface GanttNamedRange {
  from: string;
  to: string;
  label: string;
}

export interface GanttDependency {
  /** Source task id (alias). */
  from: string;
  /** Target task id (alias); cannot start before `from` ends. */
  to: string;
}

/**
 * `printscale` directive. `daily` is the default. `weekly` collapses the day
 * axis into one column per week. `weekNumberingFrom` is the starting number
 * for `with week numbering from N`. `weekNumberingMode` selects how each
 * weekly column is labelled:
 *  - `number` (default for plain `weekly`/`with week numbering from N`):
 *    show `w1`, `w2`, …. When `weekNumberingFrom` is set, use that as the
 *    first number, e.g. `w11`, `w-3`.
 *  - `calendar`: `with calendar date` — show the calendar date of each week's
 *    Monday (e.g. `Jul 06`).
 */
export interface GanttPrintScale {
  scale: 'daily' | 'weekly';
  weekNumberingFrom?: number;
  weekNumberingMode?: 'number' | 'calendar';
}

/**
 * Inclusive calendar date range marked as closed via
 * `YYYY-MM-DD to YYYY-MM-DD is closed`. Days in the range (endpoints
 * included) are treated like closed weekdays: no work is scheduled on
 * them and the layout draws a gray band over the column.
 */
export interface GanttClosedRange {
  from: string;
  to: string;
}

export interface GanttAst {
  kind: 'gantt';
  title: string;
  startDate: string;
  closedDays: WeekdayName[];
  /** Explicit closed calendar ranges (inclusive). Optional / often empty. */
  closedRanges?: GanttClosedRange[];
  tasks: GanttTask[];
  /** Explicit `[A] -> [B]` dependency arrows. Optional / often empty. */
  dependencies?: GanttDependency[];
  /** `printscale` directive. Absent for the default (daily) axis. */
  printScale?: GanttPrintScale;
  /** Today-marker offset from project start (+ optional colour). */
  today?: GanttToday;
  /** Date ranges painted with a background colour band. */
  coloredRanges?: GanttColoredRange[];
  /** Date ranges given a textual label rendered above the band. */
  namedRanges?: GanttNamedRange[];
}
