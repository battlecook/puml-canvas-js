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
}

export interface GanttAst {
  kind: 'gantt';
  title: string;
  startDate: string;
  closedDays: WeekdayName[];
  tasks: GanttTask[];
}
