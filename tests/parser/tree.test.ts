import { describe, it, expect } from 'vitest';
import { parseMindmap } from '../../src/parser/mindmap/index.js';
import { parseWbs } from '../../src/parser/wbs/index.js';

describe('tree parser — mindmap', () => {
  it('parses a 3-level tree', () => {
    const a = parseMindmap('@startmindmap\n* Root\n** A\n*** A1\n** B\n@endmindmap');
    expect(a.kind).toBe('mindmap');
    expect(a.root?.text).toBe('Root');
    expect(a.root?.children).toHaveLength(2);
    expect(a.root?.children[0]?.text).toBe('A');
    expect(a.root?.children[0]?.children).toHaveLength(1);
    expect(a.root?.children[0]?.children[0]?.text).toBe('A1');
    expect(a.root?.children[1]?.text).toBe('B');
  });

  it('captures title', () => {
    const a = parseMindmap('@startmindmap\ntitle My map\n* R\n@endmindmap');
    expect(a.title).toBe('My map');
  });

  it('handles skipped levels by attaching to nearest ancestor', () => {
    const a = parseMindmap('@startmindmap\n* Root\n*** Deep\n** Mid\n@endmindmap');
    expect(a.root?.children).toHaveLength(2);
  });

  it('parses Markdown-header (#) form for mindmap nodes', () => {
    const a = parseMindmap([
      '@startmindmap',
      '# root node',
      '## some first level node',
      '### second level node',
      '### another second level node',
      '## another first level node',
      '@endmindmap',
    ].join('\n'));
    expect(a.kind).toBe('mindmap');
    expect(a.root?.text).toBe('root node');
    expect(a.root?.children).toHaveLength(2);
    expect(a.root?.children[0]?.text).toBe('some first level node');
    expect(a.root?.children[0]?.children).toHaveLength(2);
    expect(a.root?.children[0]?.children[0]?.text).toBe('second level node');
    expect(a.root?.children[0]?.children[1]?.text).toBe('another second level node');
    expect(a.root?.children[1]?.text).toBe('another first level node');
    expect(a.root?.children[1]?.children).toHaveLength(0);
  });

  it('parses Markdown-header (+) plus form for mindmap nodes', () => {
    const a = parseMindmap([
      '@startmindmap',
      '+ Root',
      '++ A',
      '+++ A1',
      '++ B',
      '@endmindmap',
    ].join('\n'));
    expect(a.root?.text).toBe('Root');
    expect(a.root?.children.map((c) => c.text)).toEqual(['A', 'B']);
    expect(a.root?.children[0]?.children[0]?.text).toBe('A1');
  });
});

describe('tree parser — wbs', () => {
  it('parses WBS hierarchy', () => {
    const a = parseWbs([
      '@startwbs',
      '* Project',
      '** Phase 1',
      '*** Task A',
      '** Phase 2',
      '@endwbs',
    ].join('\n'));
    expect(a.kind).toBe('wbs');
    expect(a.root?.text).toBe('Project');
    expect(a.root?.children.map((c) => c.text)).toEqual(['Phase 1', 'Phase 2']);
  });

  it('parses WBS arithmetic notation with `_` boxless suffix and side flag (spec input)', () => {
    // Spec Input A: every `+_`/`-_` marker is a SINGLE char. Per the spec's
    // disambiguation fallback, depth-1 markers all become direct children of
    // the root (the first item). `-_` flags `side === 'left'`; `+_` flags
    // `side === 'right'`. The `_` suffix sets `boxless`.
    const a = parseWbs([
      '@startwbs',
      '+_ Project',
      '+_ Part One',
      '+_ Task 1.1',
      '-_ LeftTask 1.2',
      '+_ Task 1.3',
      '+_ Part Two',
      '+_ Task 2.1',
      '+_ Task 2.2',
      '-_ Task 2.2.1 To the left boxless',
      '-_ Task 2.2.2 To the Left boxless',
      '+_ Task 2.2.3 To the right boxless',
      '@endwbs',
    ].join('\n'));
    expect(a.kind).toBe('wbs');
    expect(a.root?.text).toBe('Project');
    expect(a.root?.boxless).toBe(true);
    // All subsequent depth-1 markers become children of Project.
    const childTexts = a.root!.children.map((c) => c.text);
    expect(childTexts).toContain('Part One');
    expect(childTexts).toContain('LeftTask 1.2');
    expect(childTexts).toContain('Task 2.2.3 To the right boxless');
    // Every child has `boxless: true` and either `side: 'left'` or `'right'`.
    for (const c of a.root!.children) {
      expect(c.boxless).toBe(true);
      expect(c.side === 'left' || c.side === 'right').toBe(true);
    }
    // Side flags are derived from the marker char.
    const leftTask = a.root!.children.find((c) => c.text === 'LeftTask 1.2')!;
    expect(leftTask.side).toBe('left');
    const partOne = a.root!.children.find((c) => c.text === 'Part One')!;
    expect(partOne.side).toBe('right');
    const leftBoxless1 = a.root!.children.find((c) =>
      c.text === 'Task 2.2.1 To the left boxless',
    )!;
    expect(leftBoxless1.side).toBe('left');
    const rightBoxless = a.root!.children.find((c) =>
      c.text === 'Task 2.2.3 To the right boxless',
    )!;
    expect(rightBoxless.side).toBe('right');
  });

  it('recurses into nested `++_`/`--_` markers (deeper arithmetic notation)', () => {
    const a = parseWbs([
      '@startwbs',
      '+_ Root',
      '++_ Right child',
      '+++_ Right grandchild',
      '--_ Left child',
      '@endwbs',
    ].join('\n'));
    expect(a.root?.text).toBe('Root');
    expect(a.root?.boxless).toBe(true);
    expect(a.root?.children.map((c) => c.text)).toEqual(['Right child', 'Left child']);
    expect(a.root?.children[0]?.side).toBe('right');
    expect(a.root?.children[0]?.children).toHaveLength(1);
    expect(a.root?.children[0]?.children[0]?.text).toBe('Right grandchild');
    expect(a.root?.children[1]?.side).toBe('left');
  });
});

describe('tree parser — mindmap inline color', () => {
  it('parses `*[#Color] text` and captures color on each node', () => {
    const a = parseMindmap([
      '@startmindmap',
      '*[#Orange] Colors',
      '**[#lightgreen] Green',
      '**[#FFBBCC] Rose',
      '**[#lightblue] Blue',
      '@endmindmap',
    ].join('\n'));
    expect(a.root?.text).toBe('Colors');
    // CSS color names are passed through; hex literals get a `#` prefix
    // re-attached so they survive into SVG fill attributes.
    expect(a.root?.color).toBe('Orange');
    const colors = a.root!.children.map((c) => c.color);
    expect(colors).toEqual(['lightgreen', '#FFBBCC', 'lightblue']);
    const texts = a.root!.children.map((c) => c.text);
    expect(texts).toEqual(['Green', 'Rose', 'Blue']);
  });
});
