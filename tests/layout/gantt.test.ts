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
