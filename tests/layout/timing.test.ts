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

  it('shows error scene when there are no @time events', () => {
    const scene = compile('@startuml\nrobust A\n@enduml');
    const texts = scene.children
      .filter((s: Shape) => s.type === 'text')
      .map((s) => (s as { text: string }).text);
    expect(texts.some((t) => t.includes('empty') || t.includes('(no'))).toBe(true);
  });
});
