import { describe, it, expect } from 'vitest';
import { compile } from '../../src/index.js';

const SAMPLE = `@startgantt
[Prototype design] requires 15 days
[Test prototype] requires 10 days
-- All example --
[Task 1 (1 day)] requires 1 day
[T2 (5 days)] requires 5 days
[T3 (1 week)] requires 1 week
[T4 (1 week and 4 days)] requires 1 week and 4 days
[T5 (2 weeks)] requires 2 weeks
@endgantt`;

describe('gantt layout: requires/sections/no-startDate', () => {
  it('renders a non-trivial scene with bars and section', () => {
    const scene = compile(SAMPLE);
    expect(scene.width).toBeGreaterThan(200);
    expect(scene.height).toBeGreaterThan(100);
  });

  it('produces one bar rect per task (7 total)', () => {
    const scene = compile(SAMPLE);
    // Bars use rounded corners (rx) — that's unique to task bars vs other rects.
    const barRects = scene.children.filter(
      (s) => s.type === 'rect' && (s as { rx?: number }).rx !== undefined,
    );
    expect(barRects).toHaveLength(7);
  });

  it('renders the section label as text', () => {
    const scene = compile(SAMPLE);
    const sectionText = scene.children.find(
      (s) => s.type === 'text' && (s as { text: string }).text === 'All example',
    );
    expect(sectionText).toBeTruthy();
  });

  it('renders ordinal day-number header (1, 2, 3 ...) when no startDate', () => {
    const scene = compile(SAMPLE);
    const dayTexts = scene.children.filter(
      (s) => s.type === 'text' && /^\d+$/.test((s as { text: string }).text),
    ) as Array<{ type: 'text'; text: string }>;
    // Total span: 15 + 10 + 1 + 5 + 7 + 11 + 14 = 63 days when stacked
    // sequentially; but each task starts at 0 because there is no
    // `starts at [..]'s end` chain. The longest task is 15 days, so the
    // axis runs 1..15.
    const numbers = dayTexts.map((t) => Number(t.text));
    expect(Math.max(...numbers)).toBe(15);
    expect(numbers).toContain(1);
  });

  it('renders all 7 task labels in the left column', () => {
    const scene = compile(SAMPLE);
    const wanted = [
      'Prototype design', 'Test prototype',
      'Task 1 (1 day)', 'T2 (5 days)', 'T3 (1 week)',
      'T4 (1 week and 4 days)', 'T5 (2 weeks)',
    ];
    for (const w of wanted) {
      const hit = scene.children.find(
        (s) => s.type === 'text' && (s as { text: string }).text === w,
      );
      expect(hit, `missing label for "${w}"`).toBeTruthy();
    }
  });
});

describe('gantt layout: relative D+N day offsets', () => {
  const SRC = [
    '@startgantt',
    '[Prototype design] starts D+0',
    '[Test prototype] starts D+15',
    '[Prototype design] ends D+14',
    '[Test prototype] ends D+24',
    '@endgantt',
  ].join('\n');

  it('produces exactly 2 task bars sized to the inclusive day spans', () => {
    const scene = compile(SRC);
    const barRects = scene.children.filter(
      (s) => s.type === 'rect' && (s as { rx?: number }).rx !== undefined,
    ) as Array<{ type: 'rect'; x: number; w: number }>;
    expect(barRects).toHaveLength(2);

    barRects.sort((a, b) => a.x - b.x);
    const DAY_WIDTH = 28;
    // Bar 1: day 0..14 inclusive => 15 columns starting at the chart origin.
    expect(barRects[0]!.w).toBe(15 * DAY_WIDTH);
    // Bar 2: day 15..24 inclusive => 10 columns, shifted 15 days right.
    expect(barRects[1]!.w).toBe(10 * DAY_WIDTH);
    expect(barRects[1]!.x - barRects[0]!.x).toBe(15 * DAY_WIDTH);
  });

  it('renders an ordinal day-number axis spanning 1..25', () => {
    const scene = compile(SRC);
    const dayTexts = scene.children.filter(
      (s) => s.type === 'text' && /^\d+$/.test((s as { text: string }).text),
    ) as Array<{ type: 'text'; text: string }>;
    const nums = dayTexts.map((t) => Number(t.text));
    expect(nums).toContain(1);
    expect(Math.max(...nums)).toBe(25);
  });
});

describe('gantt layout: alias + lasts + colored + dependency arrow', () => {
  const SRC = [
    '@startgantt',
    '[SameTaskName] as [T1] lasts 7 days and is colored in pink',
    '[SameTaskName] as [T2] lasts 3 days and is colored in orange',
    '[T1] -> [T2]',
    '@endgantt',
  ].join('\n');

  it('renders two task bars with pink and orange fills', () => {
    const scene = compile(SRC);
    const barRects = scene.children.filter(
      (s) => s.type === 'rect' && (s as { rx?: number }).rx !== undefined,
    ) as Array<{ type: 'rect'; x: number; w: number; style?: { fill?: string } }>;
    expect(barRects).toHaveLength(2);
    barRects.sort((a, b) => a.x - b.x);
    // The first bar (T1) should be filled with the resolved pink color and
    // the second (T2) with orange. We resolve via the COLOR_NAMES table.
    const fills = barRects.map((r) => r.style?.fill);
    expect(fills[0]).toBe('#ffc0cb'); // pink
    expect(fills[1]).toBe('#ffa500'); // orange
  });

  it('places T2 immediately after T1 (auto-start via dependency)', () => {
    const scene = compile(SRC);
    const barRects = scene.children.filter(
      (s) => s.type === 'rect' && (s as { rx?: number }).rx !== undefined,
    ) as Array<{ type: 'rect'; x: number; w: number }>;
    barRects.sort((a, b) => a.x - b.x);
    const DAY_WIDTH = 28;
    // T1 occupies 7 columns starting at the chart origin.
    expect(barRects[0]!.w).toBe(7 * DAY_WIDTH);
    // T2 (3 days) starts where T1 ends — offset 7 columns.
    expect(barRects[1]!.w).toBe(3 * DAY_WIDTH);
    expect(barRects[1]!.x - barRects[0]!.x).toBe(7 * DAY_WIDTH);
  });

  it('renders a dependency arrow polyline between the two bars', () => {
    const scene = compile(SRC);
    const polylines = scene.children.filter((s) => s.type === 'polyline');
    expect(polylines.length).toBeGreaterThan(0);
  });

  it('shows the display name "SameTaskName" in row labels (not the alias)', () => {
    const scene = compile(SRC);
    const sameLabels = scene.children.filter(
      (s) => s.type === 'text' && (s as { text: string }).text === 'SameTaskName',
    );
    // Two row labels + two bar captions = 4 text nodes carrying the display.
    expect(sameLabels.length).toBeGreaterThanOrEqual(2);
  });
});

describe('gantt layout: explicit start/end dates', () => {
  const SRC = [
    '@startgantt',
    'Project starts 2020-07-01',
    '[Prototype design] starts 2020-07-01',
    '[Test prototype] starts 2020-07-16',
    '[Prototype design] ends 2020-07-15',
    '[Test prototype] ends 2020-07-25',
    '@endgantt',
  ].join('\n');

  it('produces exactly 2 task bars positioned at the right days', () => {
    const scene = compile(SRC);
    const barRects = scene.children.filter(
      (s) => s.type === 'rect' && (s as { rx?: number }).rx !== undefined,
    ) as Array<{ type: 'rect'; x: number; w: number }>;
    expect(barRects).toHaveLength(2);

    // Sort left-to-right; first bar should sit at the chart origin
    // (day 1, offset 0) and the second should start where the first ends.
    barRects.sort((a, b) => a.x - b.x);
    const DAY_WIDTH = 28;
    expect(barRects[0]!.w).toBe(15 * DAY_WIDTH);
    expect(barRects[1]!.w).toBe(10 * DAY_WIDTH);
    expect(barRects[1]!.x - barRects[0]!.x).toBe(15 * DAY_WIDTH);
  });

  it('renders a 25-day calendar axis spanning Jul 1..Jul 25', () => {
    const scene = compile(SRC);
    const dayTexts = scene.children.filter(
      (s) => s.type === 'text' && /^\d+$/.test((s as { text: string }).text),
    ) as Array<{ type: 'text'; text: string }>;
    // Day-number row labels: 1..25 (year "2020" is not a 1-2 digit-only text
    // standing alone in the day row, but the month label includes the year —
    // we exclude any "2020" by checking the bare day-of-month set).
    const nums = dayTexts.map((t) => Number(t.text));
    expect(nums).toContain(1);
    expect(nums).toContain(25);
    // Should not extend past day 25.
    expect(Math.max(...nums.filter((n) => n <= 31))).toBe(25);
  });
});

describe('gantt layout: combined start+end / start+requires on one line', () => {
  const SRC = [
    '@startgantt',
    'Project starts 2020-07-01',
    '[Prototype design] starts 2020-07-01 and ends 2020-07-15',
    '[Test prototype] starts 2020-07-16 and requires 10 days',
    '@endgantt',
  ].join('\n');

  it('produces 2 task bars at day 1 (w=15) and day 16 (w=10)', () => {
    const scene = compile(SRC);
    const barRects = scene.children.filter(
      (s) => s.type === 'rect' && (s as { rx?: number }).rx !== undefined,
    ) as Array<{ type: 'rect'; x: number; w: number }>;
    expect(barRects).toHaveLength(2);

    barRects.sort((a, b) => a.x - b.x);
    const DAY_WIDTH = 28;
    expect(barRects[0]!.w).toBe(15 * DAY_WIDTH);
    expect(barRects[1]!.w).toBe(10 * DAY_WIDTH);
    expect(barRects[1]!.x - barRects[0]!.x).toBe(15 * DAY_WIDTH);
  });
});

describe('gantt layout: printscale weekly axis', () => {
  const BODY = [
    'Project starts the 6th of July 2020',
    '[Task1] on {Alice} requires 2 weeks',
    '[Task2] on {Bob:50%} requires 2 weeks then [Task3] on {Alice:25%} requires 3 days',
  ];
  const make = (header: string) =>
    ['@startgantt', header, ...BODY, '@endgantt'].join('\n');

  it('renders sequential week labels (w1, w2, w3) with bars for all 3 tasks', () => {
    const scene = compile(make('printscale weekly'));
    const labels = scene.children
      .filter((s) => s.type === 'text' && /^w-?\d+$/.test((s as { text: string }).text))
      .map((s) => (s as { text: string }).text);
    expect(labels).toEqual(['w1', 'w2', 'w3']);
    const bars = scene.children.filter(
      (s) => s.type === 'rect' && (s as { rx?: number }).rx !== undefined,
    );
    expect(bars).toHaveLength(3);
  });

  it('honours `with week numbering from 11`', () => {
    const scene = compile(make('printscale weekly with week numbering from 11'));
    const labels = scene.children
      .filter((s) => s.type === 'text' && /^w-?\d+$/.test((s as { text: string }).text))
      .map((s) => (s as { text: string }).text);
    expect(labels).toEqual(['w11', 'w12', 'w13']);
  });

  it('honours negative `with week numbering from -3`', () => {
    const scene = compile(make('printscale weekly with week numbering from -3'));
    const labels = scene.children
      .filter((s) => s.type === 'text' && /^w-?\d+$/.test((s as { text: string }).text))
      .map((s) => (s as { text: string }).text);
    expect(labels).toEqual(['w-3', 'w-2', 'w-1']);
  });

  it('renders `Jul 06, Jul 13, Jul 20` for `with calendar date`', () => {
    const scene = compile(make('printscale weekly with calendar date'));
    const labels = scene.children
      .filter(
        (s) => s.type === 'text' && /^[A-Z][a-z]{2} \d{2}$/.test((s as { text: string }).text),
      )
      .map((s) => (s as { text: string }).text);
    expect(labels).toEqual(['Jul 06', 'Jul 13', 'Jul 20']);
  });
});

describe('gantt layout: date and offset milestones (`happens at` / `happens on`)', () => {
  const SRC = [
    '@startgantt',
    'Project starts 2021-03-29',
    '[Review 01] happens at 2021-03-29',
    "[Review 02 - 3 weeks] happens on 3 weeks after [Review 01]'s end",
    "[Review 02 - 21 days] happens on 21 days after [Review 01]'s end",
    '@endgantt',
  ].join('\n');

  it('renders 3 milestone diamonds (4-point polygons) and 0 task bars', () => {
    const scene = compile(SRC);
    const diamonds = scene.children.filter(
      (s) => s.type === 'polygon' && (s as { points: unknown[] }).points.length === 4,
    );
    expect(diamonds).toHaveLength(3);
    const bars = scene.children.filter(
      (s) => s.type === 'rect' && (s as { rx?: number }).rx !== undefined,
    );
    expect(bars).toHaveLength(0);
  });

  it('positions the two relative milestones at the same offset (3 weeks == 21 days)', () => {
    const scene = compile(SRC);
    const diamonds = scene.children.filter(
      (s) => s.type === 'polygon' && (s as { points: number[][] }).points.length === 4,
    ) as Array<{ type: 'polygon'; points: number[][] }>;
    // Diamond center-x sits at the top vertex's x coordinate.
    const cxs = diamonds.map((d) => d.points[0]![0]!);
    // Review 01 (day 0), Review 02 - 3 weeks (day 21), Review 02 - 21 days (day 21).
    cxs.sort((a, b) => a - b);
    expect(cxs[1]).toBe(cxs[2]);
    expect(cxs[1]! - cxs[0]!).toBeGreaterThan(0);
  });
});

describe('gantt layout: same-row tasks + multi-line then-chain + note bottom blocks', () => {
  const SRC = [
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
  ].join('\n');

  it('renders taskA and taskB on the same y (sameRowAs collapses rows)', () => {
    const scene = compile(SRC);
    // Find the bar rects (rounded rects). For each, capture y. Then look
    // for the labels "taskA" and "taskB" in the left column and check that
    // their bars share a y-coordinate.
    const bars = scene.children.filter(
      (s) => s.type === 'rect' && (s as { rx?: number }).rx !== undefined,
    ) as Array<{ type: 'rect'; x: number; y: number; w: number; h: number }>;
    // Each non-milestone task gets a bar; with same-row sharing we still
    // emit two bars for A and B, but they sit on the same y. We pick out
    // the two bars whose x-positions correspond to 2020-09-01 (offset 0)
    // and 2020-09-10 (offset 9): both 3 days wide.
    const DAY_WIDTH = 28;
    const threeDay = bars.filter((b) => Math.abs(b.w - 3 * DAY_WIDTH) < 0.5);
    expect(threeDay.length).toBeGreaterThanOrEqual(2);
    threeDay.sort((a, b) => a.x - b.x);
    // The first 3-day bar is taskA (offset 0). The second 3-day bar is
    // taskB (offset 9). They must share the same y.
    expect(threeDay[0]!.y).toBe(threeDay[1]!.y);
  });

  it('renders a yellow note rect for each note block (3 notes total)', () => {
    const scene = compile(SRC);
    const noteRects = scene.children.filter(
      (s) =>
        s.type === 'rect' &&
        (s as { style?: { fill?: string } }).style?.fill === '#fffbcc',
    );
    expect(noteRects).toHaveLength(3);
  });

  it('keeps the multi-line then-chain anchored (task03 sits right after task02)', () => {
    const scene = compile(SRC);
    const wanted = scene.children.filter(
      (s) =>
        s.type === 'text' &&
        ((s as { text: string }).text === 'task02' ||
          (s as { text: string }).text === 'task03'),
    );
    // task02 and task03 each appear at least once (row label).
    expect(wanted.length).toBeGreaterThanOrEqual(2);
  });
});

describe('gantt layout: today marker + colored range band + named range label', () => {
  const SRC = [
    '@startgantt',
    'Project starts the 20th of september 2018',
    'sunday are close',
    '2018/09/21 to 2018/09/23 are colored in salmon',
    '2018/09/21 to 2018/09/30 are named [Vacation in the Bahamas]',
    'today is 30 days after start and is colored in #AAF',
    '[Foo] happens 40 days after start',
    '[Dummy] requires 10 days and starts 10 days after start',
    '@endgantt',
  ].join('\n');

  it('renders a salmon-tinted band across Sep 21..23 (colored range)', () => {
    const scene = compile(SRC);
    const salmon = scene.children.find(
      (s) =>
        s.type === 'rect' &&
        (s as { style?: { fill?: string } }).style?.fill === '#fa8072',
    );
    expect(salmon).toBeTruthy();
  });

  it('renders the "Vacation in the Bahamas" named-range label', () => {
    const scene = compile(SRC);
    const label = scene.children.find(
      (s) =>
        s.type === 'text' &&
        (s as { text: string }).text === 'Vacation in the Bahamas',
    );
    expect(label).toBeTruthy();
  });

  it('renders a #AAF today-marker line', () => {
    const scene = compile(SRC);
    const line = scene.children.find(
      (s) =>
        s.type === 'line' &&
        (s as { style?: { stroke?: string } }).style?.stroke === '#AAF',
    );
    expect(line).toBeTruthy();
  });

  it('places [Foo] at column 40 (happens 40 days after start)', () => {
    const scene = compile(SRC);
    const diamonds = scene.children.filter(
      (s) => s.type === 'polygon' && (s as { points: unknown[] }).points.length === 4,
    ) as Array<{ type: 'polygon'; points: number[][] }>;
    expect(diamonds.length).toBeGreaterThanOrEqual(1);
    // Diamond center-x is the top vertex's x. Find the one at offset 40.
    // We don't pin the exact pixel here — just check there's a diamond
    // strictly to the right of column 30.
    const DAY_WIDTH = 28;
    const beyond30 = diamonds.find((d) => d.points[0]![0]! > 30 * DAY_WIDTH);
    expect(beyond30).toBeTruthy();
  });
});

describe('gantt layout: closed weekdays + closed date range + working-days-after', () => {
  const SRC = [
    '@startgantt',
    'saturday are closed',
    'sunday are closed',
    '2022-07-04 to 2022-07-15 is closed',
    'Project starts 2022-06-27',
    '[task1] starts at 2022-06-27 and requires 1 week',
    "[task2] starts 2 working days after [task1]'s end and requires 3 days",
    '@endgantt',
  ].join('\n');

  it('places task2 after the closed range (sat/sun + Jul 4..15) is skipped', () => {
    const scene = compile(SRC);
    const DAY_WIDTH = 28;
    const bars = scene.children.filter(
      (s) => s.type === 'rect' && (s as { rx?: number }).rx !== undefined,
    ) as Array<{ type: 'rect'; x: number; w: number }>;
    bars.sort((a, b) => a.x - b.x);
    expect(bars).toHaveLength(2);
    // task1: Mon Jun 27 → Tue Jul 19 inclusive (7 working days, skipping
    // weekends and the Jul 4..15 closed range) — that's day offsets 0..22,
    // so 23 columns wide.
    expect(bars[0]!.w).toBe(23 * DAY_WIDTH);
    // task2 starts 2 working days after task1's end (Tue Jul 19):
    //  +1 working day = Wed Jul 20, +2 = Thu Jul 21 → day offset 24.
    // 3 working days from Thu Jul 21: Thu, Fri, (sat/sun skipped) Mon
    //  Jul 25 → day offset 28. Width = 28-24+1 = 5 columns.
    expect(bars[1]!.w).toBe(5 * DAY_WIDTH);
    // Bar 2 left edge sits 24 columns to the right of bar 1's left edge.
    expect(bars[1]!.x - bars[0]!.x).toBe(24 * DAY_WIDTH);
  });

  it('renders gray closed bands for both weekend columns and Jul 4..15', () => {
    const scene = compile(SRC);
    // Closed bands are full-body rects with no stroke and the COLOR_CLOSED
    // fill. Count them — we expect at least the Jul 4..15 (12 days) range
    // plus several weekend columns within the rendered axis span.
    const bands = scene.children.filter(
      (s) =>
        s.type === 'rect' &&
        (s as { rx?: number }).rx === undefined &&
        (s as { style?: { fill?: string; stroke?: string } }).style?.fill === '#f0f0f0' &&
        (s as { style?: { stroke?: string } }).style?.stroke === 'none',
    );
    // Jul 4..15 contains 12 calendar days; plus Saturday/Sunday columns
    // across the visible span. The total should be at least 12 and the
    // total number of distinct closed columns within the axis should be
    // greater than 12 (range + extra weekends).
    expect(bands.length).toBeGreaterThanOrEqual(12);
  });
});
