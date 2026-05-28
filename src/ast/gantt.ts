export type WeekdayName =
  | 'monday' | 'tuesday' | 'wednesday' | 'thursday'
  | 'friday' | 'saturday' | 'sunday';

export interface GanttTask {
  id: string;
  duration: number;
  startAfter: string;
  isMilestone: boolean;
  color: string;
  resources: number;
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
}

export interface GanttAst {
  kind: 'gantt';
  title: string;
  startDate: string;
  closedDays: WeekdayName[];
  tasks: GanttTask[];
}
