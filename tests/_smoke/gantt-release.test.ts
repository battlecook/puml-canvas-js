import { describe, it, expect } from 'vitest';
import { compile, parseToAst } from '../../src/index.js';

const RELEASE = `@startgantt
title Release train with resources, constraints, and milestones

Project starts 2026-05-25
saturday are closed
sunday are closed

[Spec freeze] lasts 2 days
[Parser implementation] lasts 5 days and starts at [Spec freeze]'s end
[Golden samples] lasts 3 days and starts at [Spec freeze]'s end
[Renderer fallback] lasts 4 days and starts at [Parser implementation]'s end
[QA sweep] lasts 3 days and starts at [Golden samples]'s end
[QA sweep] starts at [Renderer fallback]'s end
[Store release] happens at [QA sweep]'s end

[Parser implementation] is colored in LightBlue
[Renderer fallback] is colored in LightGreen
[QA sweep] is colored in Salmon

[Parser implementation] requires 2 people
[Golden samples] requires 1 people
[QA sweep] requires 2 people

then [Patch window] lasts 2 days
[Patch window] is colored in Gold
@endgantt`;

describe('gantt release train (user repro)', () => {
  it('parses all task lines', () => {
    const ast = parseToAst(RELEASE);
    expect(ast.kind).toBe('gantt');
    if (ast.kind === 'gantt') {
      expect(ast.startDate).toBe('2026-05-25');
      expect(ast.closedDays).toEqual(['saturday', 'sunday']);
      const ids = ast.tasks.map((t) => t.id);
      expect(ids).toContain('Spec freeze');
      expect(ids).toContain('Parser implementation');
      expect(ids).toContain('Golden samples');
      expect(ids).toContain('Renderer fallback');
      expect(ids).toContain('QA sweep');
      expect(ids).toContain('Store release');
      expect(ids).toContain('Patch window');
    }
  });

  it('identifies Store release as milestone', () => {
    const ast = parseToAst(RELEASE);
    if (ast.kind !== 'gantt') throw new Error('expected gantt');
    const m = ast.tasks.find((t) => t.id === 'Store release');
    expect(m?.isMilestone).toBe(true);
  });

  it('captures color overrides', () => {
    const ast = parseToAst(RELEASE);
    if (ast.kind !== 'gantt') throw new Error('expected gantt');
    expect(ast.tasks.find((t) => t.id === 'Parser implementation')?.color).toBe('LightBlue');
    expect(ast.tasks.find((t) => t.id === 'QA sweep')?.color).toBe('Salmon');
    expect(ast.tasks.find((t) => t.id === 'Patch window')?.color).toBe('Gold');
  });

  it('renders to a non-trivial scene with a calendar and bars', () => {
    const scene = compile(RELEASE);
    expect(scene.width).toBeGreaterThan(500);
    expect(scene.height).toBeGreaterThan(200);
    const rects = scene.children.filter((s) => s.type === 'rect').length;
    expect(rects).toBeGreaterThan(7); // headers + bars + bands
  });
});
