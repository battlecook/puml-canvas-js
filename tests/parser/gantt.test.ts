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

  it('parses relative day offsets D+N for starts/ends and computes inclusive duration', () => {
    const src = [
      '@startgantt',
      '[Prototype design] starts D+0',
      '[Test prototype] starts D+15',
      '[Prototype design] ends D+14',
      '[Test prototype] ends D+24',
      '@endgantt',
    ].join('\n');
    const a = parseGantt(src);
    expect(a.startDate).toBe('');
    expect(a.tasks).toHaveLength(2);
    expect(a.tasks[0]).toMatchObject({
      id: 'Prototype design',
      startDay: 0,
      endDay: 14,
      duration: 15,
    });
    expect(a.tasks[1]).toMatchObject({
      id: 'Test prototype',
      startDay: 15,
      endDay: 24,
      duration: 10,
    });
  });

  it('parses "[Display] as [Alias] starts at YYYY-MM-DD" + "[Alias] ends at YYYY-MM-DD"', () => {
    const src = [
      '@startgantt',
      'Project starts 2020-11-08',
      '[Task 7 days] as [T7] starts at 2020-11-09',
      '[T7] ends at 2020-11-15',
      '[Task 7 days] as [T7bis] starts at 2020-11-09',
      '[T7bis] ends at 2020-11-15',
      '@endgantt',
    ].join('\n');
    const a = parseGantt(src);
    expect(a.startDate).toBe('2020-11-08');
    expect(a.tasks).toHaveLength(2);
    expect(a.tasks[0]).toMatchObject({
      id: 'T7',
      displayName: 'Task 7 days',
      startDate: '2020-11-09',
      endDate: '2020-11-15',
      duration: 7,
    });
    expect(a.tasks[1]).toMatchObject({
      id: 'T7bis',
      displayName: 'Task 7 days',
      startDate: '2020-11-09',
      endDate: '2020-11-15',
      duration: 7,
    });
  });

  it('parses "[Display] as [Alias] lasts N days and is colored in <color>" and dependency arrows', () => {
    const src = [
      '@startgantt',
      '[SameTaskName] as [T1] lasts 7 days and is colored in pink',
      '[SameTaskName] as [T2] lasts 3 days and is colored in orange',
      '[T1] -> [T2]',
      '@endgantt',
    ].join('\n');
    const a = parseGantt(src);
    expect(a.tasks).toHaveLength(2);
    expect(a.tasks[0]).toMatchObject({
      id: 'T1',
      displayName: 'SameTaskName',
      duration: 7,
      color: 'pink',
    });
    expect(a.tasks[1]).toMatchObject({
      id: 'T2',
      displayName: 'SameTaskName',
      duration: 3,
      color: 'orange',
    });
    expect(a.dependencies).toEqual([{ from: 'T1', to: 'T2' }]);
  });

  it('parses combined "[Task] starts DATE and ends DATE" / "starts DATE and requires N days"', () => {
    const src = [
      '@startgantt',
      'Project starts 2020-07-01',
      '[Prototype design] starts 2020-07-01 and ends 2020-07-15',
      '[Test prototype] starts 2020-07-16 and requires 10 days',
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

  describe('printscale weekly + English project start + on-resources', () => {
    // Shared body used by all five printscale variants. The body covers
    // multi-resource `on {…}` clauses and the `then …` chain.
    const BODY = [
      'Project starts the 6th of July 2020',
      '[Task1] on {Alice} requires 2 weeks',
      '[Task2] on {Bob:50%} requires 2 weeks then [Task3] on {Alice:25%} requires 3 days',
    ];

    it('parses `printscale weekly` (no week numbering)', () => {
      const a = parseGantt(['@startgantt', 'printscale weekly', ...BODY, '@endgantt'].join('\n'));
      expect(a.printScale).toEqual({ scale: 'weekly', weekNumberingMode: 'number' });
      expect(a.startDate).toBe('2020-07-06');
      expect(a.tasks.map((t) => t.id)).toEqual(['Task1', 'Task2', 'Task3']);
      expect(a.tasks[0]?.duration).toBe(14);
      expect(a.tasks[1]?.duration).toBe(14);
      expect(a.tasks[2]?.duration).toBe(3);
      expect(a.tasks[2]?.startAfter).toBe('Task2');
      expect(a.tasks[0]?.resourceAssignments).toEqual([{ name: 'Alice' }]);
      expect(a.tasks[1]?.resourceAssignments).toEqual([{ name: 'Bob', percent: 50 }]);
      expect(a.tasks[2]?.resourceAssignments).toEqual([{ name: 'Alice', percent: 25 }]);
    });

    it('parses `printscale weekly with week numbering from 1`', () => {
      const a = parseGantt(
        ['@startgantt', 'printscale weekly with week numbering from 1', ...BODY, '@endgantt'].join('\n'),
      );
      expect(a.printScale).toEqual({
        scale: 'weekly',
        weekNumberingMode: 'number',
        weekNumberingFrom: 1,
      });
      expect(a.startDate).toBe('2020-07-06');
    });

    it('parses `printscale weekly with week numbering from 11`', () => {
      const a = parseGantt(
        ['@startgantt', 'printscale weekly with week numbering from 11', ...BODY, '@endgantt'].join('\n'),
      );
      expect(a.printScale).toEqual({
        scale: 'weekly',
        weekNumberingMode: 'number',
        weekNumberingFrom: 11,
      });
    });

    it('parses `printscale weekly with week numbering from -3` (negative)', () => {
      const a = parseGantt(
        ['@startgantt', 'printscale weekly with week numbering from -3', ...BODY, '@endgantt'].join('\n'),
      );
      expect(a.printScale).toEqual({
        scale: 'weekly',
        weekNumberingMode: 'number',
        weekNumberingFrom: -3,
      });
    });

    it('parses `printscale weekly with calendar date`', () => {
      const a = parseGantt(
        ['@startgantt', 'printscale weekly with calendar date', ...BODY, '@endgantt'].join('\n'),
      );
      expect(a.printScale).toEqual({ scale: 'weekly', weekNumberingMode: 'calendar' });
    });
  });

  it("parses `[M] happens at YYYY-MM-DD` and `[M] happens on N (days|weeks) after [Other]'s end`", () => {
    const a = parseGantt(
      [
        '@startgantt',
        'Project starts 2021-03-29',
        '[Review 01] happens at 2021-03-29',
        "[Review 02 - 3 weeks] happens on 3 weeks after [Review 01]'s end",
        "[Review 02 - 21 days] happens on 21 days after [Review 01]'s end",
        '@endgantt',
      ].join('\n'),
    );
    expect(a.tasks).toHaveLength(3);

    // Milestone with explicit date.
    expect(a.tasks[0]).toMatchObject({
      id: 'Review 01',
      isMilestone: true,
      duration: 0,
      startDate: '2021-03-29',
    });

    // Both relative milestones resolve to 21 days off Review 01's end.
    expect(a.tasks[1]).toMatchObject({
      id: 'Review 02 - 3 weeks',
      isMilestone: true,
      duration: 0,
      milestoneOffset: { after: 'Review 01', days: 21 },
    });
    expect(a.tasks[2]).toMatchObject({
      id: 'Review 02 - 21 days',
      isMilestone: true,
      duration: 0,
      milestoneOffset: { after: 'Review 01', days: 21 },
    });
  });

  it('parses closed weekdays, closed date ranges, and "N working days after"', () => {
    const a = parseGantt(
      [
        '@startgantt',
        'saturday are closed',
        'sunday are closed',
        '2022-07-04 to 2022-07-15 is closed',
        'Project starts 2022-06-27',
        '[task1] starts at 2022-06-27 and requires 1 week',
        "[task2] starts 2 working days after [task1]'s end and requires 3 days",
        '@endgantt',
      ].join('\n'),
    );
    expect(a.startDate).toBe('2022-06-27');
    expect(a.closedDays).toEqual(['saturday', 'sunday']);
    expect(a.closedRanges).toEqual([{ from: '2022-07-04', to: '2022-07-15' }]);
    expect(a.tasks).toHaveLength(2);
    expect(a.tasks[0]).toMatchObject({
      id: 'task1',
      startDate: '2022-06-27',
      duration: 7, // 1 week
    });
    expect(a.tasks[1]).toMatchObject({
      id: 'task2',
      duration: 3,
      workingDaysAfter: { after: 'task1', days: 2 },
    });
  });

  it('parses inline multi-`then` chains on one line', () => {
    const a = parseGantt(
      [
        '@startgantt',
        '[Prototype design] requires 14 days then [Test prototype] requires 4 days then [Deploy prototype] requires 6 days',
        '@endgantt',
      ].join('\n'),
    );
    expect(a.tasks).toHaveLength(3);
    expect(a.tasks[0]).toMatchObject({ id: 'Prototype design', duration: 14, startAfter: '' });
    expect(a.tasks[1]).toMatchObject({
      id: 'Test prototype',
      duration: 4,
      startAfter: 'Prototype design',
    });
    expect(a.tasks[2]).toMatchObject({
      id: 'Deploy prototype',
      duration: 6,
      startAfter: 'Test prototype',
    });
  });

  it('parses multiple resources `on {Alice} {Bob}` on a single task line', () => {
    const a = parseGantt(
      ['@startgantt', '[Task1] on {Alice} {Bob} requires 20 days', '@endgantt'].join('\n'),
    );
    expect(a.tasks).toHaveLength(1);
    expect(a.tasks[0]).toMatchObject({ id: 'Task1', duration: 20 });
    expect(a.tasks[0]?.resourceAssignments).toEqual([{ name: 'Alice' }, { name: 'Bob' }]);
  });

  it('parses lowercase English month + "close" spelling + coloured/named ranges + today + happens after start', () => {
    const a = parseGantt(
      [
        '@startgantt',
        'Project starts the 20th of september 2018',
        'sunday are close',
        '2018/09/21 to 2018/09/23 are colored in salmon',
        '2018/09/21 to 2018/09/30 are named [Vacation in the Bahamas]',
        'today is 30 days after start and is colored in #AAF',
        '[Foo] happens 40 days after start',
        '[Dummy] requires 10 days and starts 10 days after start',
        '@endgantt',
      ].join('\n'),
    );
    expect(a.startDate).toBe('2018-09-20');
    expect(a.closedDays).toEqual(['sunday']);
    expect(a.coloredRanges).toEqual([
      { from: '2018-09-21', to: '2018-09-23', color: 'salmon' },
    ]);
    expect(a.namedRanges).toEqual([
      { from: '2018-09-21', to: '2018-09-30', label: 'Vacation in the Bahamas' },
    ]);
    expect(a.today).toEqual({ dayOffset: 30, color: '#AAF' });
    expect(a.tasks).toHaveLength(2);
    expect(a.tasks[0]).toMatchObject({
      id: 'Foo',
      isMilestone: true,
      duration: 0,
      startOffset: 40,
    });
    expect(a.tasks[1]).toMatchObject({
      id: 'Dummy',
      duration: 10,
      startOffset: 10,
    });
  });

  it('parses "project starts on", bare-date `happens` milestone, and `occurs from .. to ..`', () => {
    const a = parseGantt(
      [
        '@startgantt',
        'project starts on 2020-07-01',
        '[P_start] happens 2020-07-03',
        '[P_end] happens 2020-07-13',
        '[Prototype design] occurs from [P_start] to [P_end]',
        '@endgantt',
      ].join('\n'),
    );
    expect(a.startDate).toBe('2020-07-01');
    expect(a.tasks).toHaveLength(3);
    expect(a.tasks[0]).toMatchObject({
      id: 'P_start',
      isMilestone: true,
      startDate: '2020-07-03',
    });
    expect(a.tasks[1]).toMatchObject({
      id: 'P_end',
      isMilestone: true,
      startDate: '2020-07-13',
    });
    expect(a.tasks[2]).toMatchObject({
      id: 'Prototype design',
      occursFrom: { from: 'P_start', to: 'P_end' },
    });
  });

  it('parses same-row task placement, multi-line then-chains, and note bottom blocks', () => {
    const a = parseGantt(
      [
        '@startgantt',
        'Project starts 2020-09-01',
        '[taskA] starts 2020-09-01 and requires 3 days',
        '[taskB] starts 2020-09-10 and requires 3 days',
        '[taskB] displays on same row as [taskA]',
        '[task01] starts 2020-09-05 and requires 4 days',
        'then [task02] requires 8 days',
        'note bottom',
        'note for task02',
        'more notes',
        'end note',
        'then [task03] requires 7 days',
        'note bottom',
        'note for task03',
        'more notes',
        'end note',
        '-- separator --',
        '[taskC] starts 2020-09-02 and requires 5 days',
        '[taskD] starts 2020-09-09 and requires 5 days',
        '[taskD] displays on same row as [taskC]',
        '[task 10] starts 2020-09-05 and requires 5 days',
        'then [task 11] requires 5 days',
        'note bottom',
        'note for task11',
        'more notes',
        'end note',
        '@endgantt',
      ].join('\n'),
    );

    // taskB shares row with taskA.
    const taskB = a.tasks.find((t) => t.id === 'taskB');
    expect(taskB?.sameRowAs).toBe('taskA');

    // Multi-line then-chain: task02 -> task01, task03 -> task02.
    const task02 = a.tasks.find((t) => t.id === 'task02');
    const task03 = a.tasks.find((t) => t.id === 'task03');
    expect(task02?.startAfter).toBe('task01');
    expect(task03?.startAfter).toBe('task02');

    // Notes attached to the preceding task.
    expect(task02?.note).toBe('note for task02\nmore notes');
    expect(task03?.note).toBe('note for task03\nmore notes');

    // Separator splits sections.
    const taskC = a.tasks.find((t) => t.id === 'taskC');
    const taskD = a.tasks.find((t) => t.id === 'taskD');
    expect(taskC?.section).toBe('separator');
    expect(taskD?.sameRowAs).toBe('taskC');

    // Inner-section then-chain note.
    const task11 = a.tasks.find((t) => t.id === 'task 11');
    expect(task11?.note).toBe('note for task11\nmore notes');
  });
});
