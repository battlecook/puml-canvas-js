import type { GanttAst, GanttTask, WeekdayName } from '../../ast/gantt.js';

const WRAPPER = /^@(start|end)\w+/i;
const LINE_COMMENT = /^\s*'/;
const TITLE = /^title\s+(.+)\s*$/i;

const PROJECT_STARTS = /^Project\s+starts\s+(\d{4}-\d{2}-\d{2})\s*$/i;
const WEEKDAY_CLOSED = /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+(?:are|is)\s+closed\s*$/i;

const TASK_LASTS = /^\[([^\]]+)\]\s+lasts\s+(\d+)\s+days?(?:\s+and\s+starts\s+at\s+\[([^\]]+)\]'s\s+end)?\s*$/i;
const TASK_STARTS_AT = /^\[([^\]]+)\]\s+starts\s+at\s+\[([^\]]+)\]'s\s+end\s*$/i;
const TASK_HAPPENS = /^\[([^\]]+)\]\s+happens\s+at\s+\[([^\]]+)\]'s\s+end\s*$/i;
const TASK_COLOR = /^\[([^\]]+)\]\s+is\s+colored\s+in\s+(\S+)\s*$/i;
const TASK_RESOURCES = /^\[([^\]]+)\]\s+requires\s+(\d+)\s+(?:people|person)\s*$/i;
const THEN_LASTS = /^then\s+\[([^\]]+)\]\s+lasts\s+(\d+)\s+days?\s*$/i;
const THEN_COLOR = /^then\s+\[([^\]]+)\]\s+is\s+colored\s+in\s+(\S+)\s*$/i;

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

  const upsert = (id: string): GanttTask => {
    let t = byId.get(id);
    if (!t) {
      t = { id, duration: 1, startAfter: '', isMilestone: false, color: '', resources: 0 };
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
