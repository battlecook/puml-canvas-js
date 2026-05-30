import { describe, it, expect } from 'vitest';
import { compile } from '../../src/index.js';
import type { Shape } from '../../src/scene/types.js';

const src = (lines: string[]): string => lines.join('\n');

describe('timing layout', () => {
  it('renders a lane per track and tick labels for each @time', () => {
    const scene = compile(
      src([
        '@startuml',
        'robust "Web Browser" as WB',
        'concise "Web User" as WU',
        '@0',
        'WB is Idle',
        'WU is Idle',
        '@100',
        'WB is Processing',
        'WU is Waiting',
        '@200',
        'WB is Idle',
        'WU is Idle',
        '@enduml',
      ]),
    );
    const texts = scene.children
      .filter((s: Shape) => s.type === 'text')
      .map((s) => (s as { text: string }).text);
    expect(texts).toContain('Web Browser');
    expect(texts).toContain('Web User');
    expect(texts).toContain('0');
    expect(texts).toContain('100');
    expect(texts).toContain('200');
    expect(texts).toContain('Idle');
    expect(texts).toContain('Processing');
    expect(texts).toContain('Waiting');
  });

  it('draws binary signal as line segments, not state boxes', () => {
    const scene = compile(
      src([
        '@startuml',
        'binary C',
        '@0',
        'C is low',
        '@100',
        'C is high',
        '@200',
        'C is low',
        '@enduml',
      ]),
    );
    const lines = scene.children.filter((s: Shape) => s.type === 'line');
    // binary signal should produce several stroke=#1f6feb lines
    const binaryLines = lines.filter(
      (l) => (l as { style: { stroke?: string } }).style.stroke === '#1f6feb',
    );
    expect(binaryLines.length).toBeGreaterThanOrEqual(3);
  });

  it('truncates state labels that do not fit their segment width', () => {
    // A narrow-but-not-tiny first segment (10/100 of lane) should still hold
    // an ellipsised label; the wide final segment fits a full name.
    const scene = compile(
      src([
        '@startuml',
        'robust B',
        '@0',
        'B is "VeryLongStateNameThatWillNotFit"',
        '@10',
        'B is Done',
        '@100',
        'B is End',
        '@enduml',
      ]),
    );
    const texts = scene.children
      .filter((s: Shape) => s.type === 'text')
      .map((s) => (s as { text: string }).text);
    expect(texts).not.toContain('VeryLongStateNameThatWillNotFit');
    expect(texts).toContain('Done');
    expect(texts.some((t) => t.endsWith('…'))).toBe(true);
  });

  it('drops overlapping time tick labels while keeping their tick marks', () => {
    // Times very close together: 0, 5, 10, 1000. The middle two labels would
    // visually collide; we expect labels to be skipped but tick marks stay.
    const scene = compile(
      src([
        '@startuml',
        'robust A',
        '@0',
        'A is X',
        '@5',
        'A is Y',
        '@10',
        'A is Z',
        '@1000',
        'A is W',
        '@enduml',
      ]),
    );
    const texts = scene.children
      .filter((s: Shape) => s.type === 'text')
      .map((s) => (s as { text: string }).text);
    // 0 and 1000 must always be visible (well-separated endpoints).
    expect(texts).toContain('0');
    expect(texts).toContain('1000');
    // Either 5 or 10 should have been pruned to avoid overlap.
    const hasFive = texts.includes('5');
    const hasTen = texts.includes('10');
    expect(hasFive && hasTen).toBe(false);
  });

  it('parses `clock ... with period N` and renders periodic ticks', () => {
    const scene = compile(
      src([
        '@startuml',
        'clock "R" as R with period 100',
        'robust A',
        '@0',
        'A is X',
        '@500',
        'A is Y',
        '@enduml',
      ]),
    );
    // Periodic vertical ticks use the binary blue color (#1f6feb).
    const periodicTicks = scene.children.filter(
      (s: Shape) =>
        s.type === 'line' &&
        (s as { style: { stroke?: string } }).style.stroke === '#1f6feb',
    );
    expect(periodicTicks.length).toBeGreaterThanOrEqual(5);
  });

  it('renders the named-anchor timing diagram with 3 tracks and axis covering 0..11', () => {
    const scene = compile(
      src([
        '@startuml',
        'clock clk with period 1',
        'binary "enable" as EN',
        'concise "dataBus" as db',
        '@0 as :start',
        '@5 as :en_high',
        '@10 as :en_low',
        '@:en_high-2 as :en_highMinus2',
        '@:start',
        'EN is low',
        'db is "0x0000"',
        '@:en_high',
        'EN is high',
        '@:en_low',
        'EN is low',
        '@:en_highMinus2',
        'db is "0xf23a"',
        '@:en_high+6',
        'db is "0x0000"',
        '@enduml',
      ]),
    );
    const texts = scene.children
      .filter((s: Shape) => s.type === 'text')
      .map((s) => (s as { text: string }).text);
    // Three track labels (clk uses its id; EN/db use their quoted names).
    expect(texts).toContain('clk');
    expect(texts).toContain('enable');
    expect(texts).toContain('dataBus');
    // Axis endpoints must be present: 0 (start) and 11 (en_high+6).
    expect(texts).toContain('0');
    expect(texts).toContain('11');
  });

  it('honors `scale N as M pixels` for the time axis width', () => {
    const scene = compile(
      src([
        '@startuml',
        'concise "Web User" as WU',
        'scale 100 as 50 pixels',
        '@WU',
        '0 is Waiting',
        '+500 is ok',
        '@enduml',
      ]),
    );
    // Find the horizontal axis line (the long horizontal stroke at the
    // bottom of the tracks: same y for both endpoints, distinguished from
    // the dashed per-track baselines by being solid).
    const axisLines = scene.children.filter(
      (s: Shape) =>
        s.type === 'line' &&
        (s as { y1: number; y2: number; style: { strokeDasharray?: string } }).y1 ===
          (s as { y1: number; y2: number }).y2 &&
        !(s as { style: { strokeDasharray?: string } }).style.strokeDasharray,
    ) as Array<{ x1: number; x2: number }>;
    expect(axisLines.length).toBeGreaterThan(0);
    const axis = axisLines[axisLines.length - 1]!;
    // span = 500 - 0 = 500 units; pxPerUnit = 50/100; expected width = 250.
    expect(axis.x2 - axis.x1).toBeCloseTo(250, 5);
  });

  it('shows error scene when there are no @time events', () => {
    const scene = compile('@startuml\nrobust A\n@enduml');
    const texts = scene.children
      .filter((s: Shape) => s.type === 'text')
      .map((s) => (s as { text: string }).text);
    expect(texts.some((t) => t.includes('empty') || t.includes('(no'))).toBe(true);
  });

  it('renders date-domain tick labels using `use date format` template', () => {
    const scene = compile(
      src([
        '@startuml',
        'use date format "YY-MM-dd"',
        'concise "Season" as S',
        '@2000/11/01',
        'S is "Winter"',
        '@2001/02/01',
        'S is "Spring"',
        '@enduml',
      ]),
    );
    const texts = scene.children
      .filter((s: Shape) => s.type === 'text')
      .map((s) => (s as { text: string }).text);
    expect(texts).toContain('00-11-01');
    expect(texts).toContain('01-02-01');
  });

  it('omits the time-axis when `hide time-axis` is set', () => {
    const scene = compile(
      src([
        '@startuml',
        'hide time-axis',
        'concise WU',
        '@0',
        'WU is Idle',
        '@100',
        'WU is Busy',
        '@enduml',
      ]),
    );
    const texts = scene.children
      .filter((s: Shape) => s.type === 'text')
      .map((s) => (s as { text: string }).text);
    // Tick labels for 0 / 100 must not be rendered.
    expect(texts).not.toContain('0');
    expect(texts).not.toContain('100');
    // The state labels still render.
    expect(texts).toContain('Idle');
  });

  it('renders inline note text above the segment for `is state : note`', () => {
    const scene = compile(
      src([
        '@startuml',
        'concise WU',
        '@0',
        'WU is Waiting : some note',
        '@100',
        'WU is Idle',
        '@enduml',
      ]),
    );
    const texts = scene.children
      .filter((s: Shape) => s.type === 'text')
      .map((s) => (s as { text: string }).text);
    expect(texts).toContain('some note');
  });

  it('renders no rect/text for a `{hidden}` state', () => {
    const scene = compile(
      src([
        '@startuml',
        'concise OD',
        '@0',
        'OD is {hidden}',
        '@10',
        'OD is Visible',
        '@20',
        'OD is Done',
        '@enduml',
      ]),
    );
    const texts = scene.children
      .filter((s: Shape) => s.type === 'text')
      .map((s) => (s as { text: string }).text);
    expect(texts).not.toContain('{hidden}');
    expect(texts).toContain('Visible');
    // Count rects with the concise lane fill -- the hidden segment must not
    // contribute one. We expect at most the two visible segments.
    const fills = scene.children
      .filter((s: Shape) => s.type === 'rect')
      .map((s) => (s as { style?: { fill?: string } }).style?.fill);
    const conciseRects = fills.filter((f) => f === '#e8f0ff');
    expect(conciseRects.length).toBeLessThanOrEqual(2);
  });

  it('renders an inter-track measurement line with label between two times', () => {
    const scene = compile(
      src([
        '@startuml',
        'concise WB',
        '@0',
        'WB is Idle',
        '@50',
        'WB is Done',
        'WB@0 <-> @50 : {50 ms lag}',
        '@enduml',
      ]),
    );
    const texts = scene.children
      .filter((s: Shape) => s.type === 'text')
      .map((s) => (s as { text: string }).text);
    expect(texts).toContain('50 ms lag');
  });

  it('renders an analog track as a 3-point polyline graph', () => {
    const scene = compile(
      src([
        '@startuml',
        'title Between 0-max (by default)',
        'analog "Analog" as A',
        '@0',
        'A is 350',
        '@100',
        'A is 450',
        '@300',
        'A is 350',
        '@enduml',
      ]),
    );
    const polylines = scene.children.filter(
      (s: Shape) => s.type === 'polyline',
    ) as Array<{ points: Array<[number, number]> }>;
    // One polyline for the analog signal, with one vertex per event.
    expect(polylines.length).toBeGreaterThanOrEqual(1);
    const analog = polylines.find((p) => p.points.length === 3);
    expect(analog).toBeDefined();
    // The middle vertex (value 450, the auto-max) should sit higher
    // (smaller y) than the endpoint vertices (value 350).
    const [p0, p1, p2] = analog!.points;
    expect(p1[1]).toBeLessThan(p0[1]);
    expect(p1[1]).toBeLessThan(p2[1]);
    // And the y-axis tick labels for 0 (min default) and 450 (auto max).
    const texts = scene.children
      .filter((s: Shape) => s.type === 'text')
      .map((s) => (s as { text: string }).text);
    expect(texts).toContain('0');
    expect(texts).toContain('450');
  });

  it('renders an analog track with explicit `between MIN and MAX` y-range', () => {
    const scene = compile(
      src([
        '@startuml',
        'title Between min-max',
        'analog "Analog" between 350 and 450 as A',
        '@0',
        'A is 350',
        '@100',
        'A is 450',
        '@300',
        'A is 350',
        '@enduml',
      ]),
    );
    const polylines = scene.children.filter(
      (s: Shape) => s.type === 'polyline',
    ) as Array<{ points: Array<[number, number]> }>;
    expect(polylines.some((p) => p.points.length === 3)).toBe(true);
    const texts = scene.children
      .filter((s: Shape) => s.type === 'text')
      .map((s) => (s as { text: string }).text);
    expect(texts).toContain('350');
    expect(texts).toContain('450');
  });
});
