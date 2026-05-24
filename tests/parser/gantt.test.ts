import { describe, it, expect } from 'vitest';
import { parseGantt } from '../../src/parser/gantt/index.js';

describe('gantt parser', () => {
  it('captures project start and closed weekdays', () => {
    const a = parseGantt([
      '@startgantt',
      'Project starts 2026-05-25',
      'saturday are closed',
      'sunday are closed',
      '@endgantt',
    ].join('\n'));
    expect(a.kind).toBe('gantt');
    expect(a.startDate).toBe('2026-05-25');
    expect(a.closedDays).toEqual(['saturday', 'sunday']);
  });

  it('parses task with duration', () => {
    const a = parseGantt('@startgantt\n[A] lasts 3 days\n@endgantt');
    expect(a.tasks[0]).toMatchObject({ id: 'A', duration: 3, isMilestone: false });
  });

  it('parses task with dependency in same line', () => {
    const a = parseGantt('@startgantt\n[A] lasts 2 days\n[B] lasts 3 days and starts at [A]\'s end\n@endgantt');
    expect(a.tasks[1]).toMatchObject({ id: 'B', startAfter: 'A', duration: 3 });
  });

  it('parses standalone "starts at"', () => {
    const a = parseGantt('@startgantt\n[B] starts at [A]\'s end\n@endgantt');
    expect(a.tasks[0]).toMatchObject({ id: 'B', startAfter: 'A' });
  });

  it('parses milestone via "happens at"', () => {
    const a = parseGantt('@startgantt\n[M] happens at [A]\'s end\n@endgantt');
    expect(a.tasks[0]).toMatchObject({ id: 'M', isMilestone: true, duration: 0, startAfter: 'A' });
  });

  it('parses color and resources', () => {
    const a = parseGantt('@startgantt\n[A] lasts 1 days\n[A] is colored in LightBlue\n[A] requires 2 people\n@endgantt');
    expect(a.tasks[0]).toMatchObject({ color: 'LightBlue', resources: 2 });
  });

  it('parses then-chain', () => {
    const a = parseGantt([
      '@startgantt',
      '[A] lasts 1 days',
      'then [B] lasts 2 days',
      'then [C] lasts 3 days',
      '@endgantt',
    ].join('\n'));
    expect(a.tasks[1]?.startAfter).toBe('A');
    expect(a.tasks[2]?.startAfter).toBe('B');
  });
});
