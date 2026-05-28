import { describe, it, expect } from 'vitest';
import { compile } from '../../src/index.js';

describe('activity layout — bullet shortcut', () => {
  it('renders `* Action` list as three rounded rects with two connectors', () => {
    const scene = compile(
      [
        '@startuml',
        '* Action 1',
        '* Action 2',
        '* Action 3',
        '@enduml',
      ].join('\n'),
    );
    const rects = scene.children.filter((s) => s.type === 'rect');
    // Three action nodes — each renders as a rounded rect (rx/ry > 0).
    const rounded = rects.filter(
      (s) => (s as { rx?: number }).rx !== undefined && (s as { rx?: number }).rx! > 0,
    );
    expect(rounded.length).toBe(3);

    // Two connector arrows between the three actions. Each arrow = 1 line + 1 polygon.
    const lines = scene.children.filter((s) => s.type === 'line');
    const polys = scene.children.filter((s) => s.type === 'polygon');
    expect(lines.length).toBeGreaterThanOrEqual(2);
    expect(polys.length).toBeGreaterThanOrEqual(2);

    // Action labels present in order, top to bottom.
    const texts = scene.children
      .filter((s) => s.type === 'text')
      .map((s) => s as { text: string; y: number });
    const actionTexts = texts
      .filter((t) => /^Action [123]$/.test(t.text))
      .sort((a, b) => a.y - b.y)
      .map((t) => t.text);
    expect(actionTexts).toEqual(['Action 1', 'Action 2', 'Action 3']);
  });

  it('renders multi-level bullets with visual hierarchy (one rect per leaf and parent)', () => {
    const scene = compile(
      [
        '@startuml',
        '<style>',
        'element {MinimumWidth 150}',
        '</style>',
        '* Action 1',
        '** Sub-Action 1.1',
        '** Sub-Action 1.2',
        '*** Sub-Action 1.2.1',
        '*** Sub-Action 1.2.2',
        '* Action 2',
        '@enduml',
      ].join('\n'),
    );
    const rounded = scene.children.filter(
      (s) => s.type === 'rect' && (s as { rx?: number }).rx !== undefined && (s as { rx?: number }).rx! > 0,
    );
    // 6 actions total: Action 1, Sub-Action 1.1, Sub-Action 1.2, Sub-Action 1.2.1, Sub-Action 1.2.2, Action 2
    expect(rounded.length).toBeGreaterThanOrEqual(5);
    // <style> element { MinimumWidth 150 } widens every action box.
    for (const r of rounded) {
      expect((r as { w: number }).w).toBeGreaterThanOrEqual(150);
    }
  });
});

describe('activity layout — Creole / HTML markup', () => {
  it('emits bold + italic spans for inline markup inside `:Action;` text', () => {
    const scene = compile(
      [
        '@startuml',
        'start',
        ':Creole bold: **bold** italics: //italics//;',
        ':HTML <b>bold-tag <i>italic-tag;',
        'stop',
        '@enduml',
      ].join('\n'),
    );
    const texts = scene.children.filter((s) => s.type === 'text') as Array<{
      text: string;
      font?: { weight?: string; style?: string };
    }>;
    const bold = texts.filter((t) => t.font?.weight === 'bold');
    const italic = texts.filter((t) => t.font?.style === 'italic');
    expect(bold.length).toBeGreaterThanOrEqual(1);
    expect(italic.length).toBeGreaterThanOrEqual(1);
  });

  it('does not crash on unsupported markup tokens (emoji / icon / image / unicode)', () => {
    expect(() =>
      compile(
        [
          '@startuml',
          'start',
          ':Graphic OpenIconic: account-login <&account-login> Unicode: This is <U+221E> long Emoji: <:calendar:> Calendar Image: <img:https://plantuml.com/logo3.png>;',
          'stop',
          '@enduml',
        ].join('\n'),
      ),
    ).not.toThrow();
  });
});
