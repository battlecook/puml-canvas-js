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

  it('parses explicit [Task] starts/ends date pairs and computes inclusive duration', () => {
    const src = [
      '@startgantt',
      'Project starts 2020-07-01',
      '[Prototype design] starts 2020-07-01',
      '[Test prototype] starts 2020-07-16',
      '[Prototype design] ends 2020-07-15',
      '[Test prototype] ends 2020-07-25',
      '@endgantt',
    ].join('\n');
    const a = parseGantt(src);
    expect(a.startDate).toBe('2020-07-01');
    expect(a.tasks).toHaveLength(2);
    expect(a.tasks[0]).toMatchObject({
      id: 'Prototype design',
      startDate: '2020-07-01',
      endDate: '2020-07-15',
      duration: 15,
    });
    expect(a.tasks[1]).toMatchObject({
      id: 'Test prototype',
      startDate: '2020-07-16',
      endDate: '2020-07-25',
      duration: 10,
    });
  });

  it('parses [Task] requires N days|weeks plus compound durations and sections', () => {
    const src = [
      '@startgantt',
      '[Prototype design] requires 15 days',
      '[Test prototype] requires 10 days',
      '-- All example --',
      '[Task 1 (1 day)] requires 1 day',
      '[T2 (5 days)] requires 5 days',
      '[T3 (1 week)] requires 1 week',
      '[T4 (1 week and 4 days)] requires 1 week and 4 days',
      '[T5 (2 weeks)] requires 2 weeks',
      '@endgantt',
    ].join('\n');
    const a = parseGantt(src);

    expect(a.tasks).toHaveLength(7);
    expect(a.tasks.map((t) => t.duration)).toEqual([15, 10, 1, 5, 7, 11, 14]);

    // Section: first two tasks have no section, last five all in "All example".
    expect(a.tasks[0]?.section).toBeUndefined();
    expect(a.tasks[1]?.section).toBeUndefined();
    for (let i = 2; i < 7; i++) {
      expect(a.tasks[i]?.section).toBe('All example');
    }
  });
});
