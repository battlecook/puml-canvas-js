import { describe, it, expect } from 'vitest';
import { render, parseToAst, compile } from '../src/index.js';

describe('end-to-end pipeline', () => {
  it('parses @startuml..@enduml and renders an SVG element', () => {
    const svg = render('@startuml\nparticipant Alice\nparticipant Bob\nAlice -> Bob: hi\n@enduml');
    expect(svg.tagName.toLowerCase()).toBe('svg');
    const texts = Array.from(svg.querySelectorAll('text')).map((t) => t.textContent);
    expect(texts).toContain('Alice');
    expect(texts).toContain('Bob');
    expect(texts.some((t) => t === 'hi')).toBe(true);
  });

  it('returns an unknown AST when no wrapper is present', () => {
    const ast = parseToAst('hello world');
    expect(ast.kind).toBe('unknown');
  });

  it('produces a placeholder AST for detected-but-not-implemented kinds', () => {
    const ast = parseToAst('@startsalt\n{ Button1 | Button2 }\n@endsalt');
    expect(ast.kind).toBe('salt');
  });

  it('produces a class AST for class-shaped input', () => {
    const ast = parseToAst('@startuml\nclass Foo\nclass Bar\n@enduml');
    expect(ast.kind).toBe('class');
    if (ast.kind === 'class') {
      expect(ast.classes.map((c) => c.id)).toEqual(['Foo', 'Bar']);
    }
  });

  it('renders an empty class diagram when every class is removed', () => {
    // Regression for the demo gallery entry "Starting names with `$`": three
    // `$`-prefixed classes (one declared via leading-tag form) are all dropped
    // by matching `remove` statements. The SVG should contain no class
    // rectangles — only the empty-diagram placeholder text.
    const svg = render([
      '@startuml',
      'class $C1',
      'class $C2',
      '$C2 class "$C2" as dollarC2',
      'remove $C1',
      'remove $C2',
      'remove dollarC2',
      '@enduml',
    ].join('\n'));
    expect(svg.tagName.toLowerCase()).toBe('svg');
    // The only <rect> in an empty diagram is the canvas background (filled
    // white at the scene origin). No class boxes should be present.
    const rects = Array.from(svg.querySelectorAll('rect'));
    expect(rects).toHaveLength(1);
    expect(rects[0]!.getAttribute('x')).toBe('0');
    expect(rects[0]!.getAttribute('y')).toBe('0');
    const texts = Array.from(svg.querySelectorAll('text')).map((t) => t.textContent);
    expect(texts).toContain('(empty class diagram)');
  });

  it('renders a sprite-list placeholder for the standalone `listsprite` directive', () => {
    // Regression: the Archimate pre-pass stripped `listsprite`, leaving an
    // empty diagram. We now emit a `placeholder` AST whose layout draws a
    // single labeled rectangle so the user gets visible feedback that the
    // directive was recognised but no sprites are bundled.
    const src = ['@startuml', 'listsprite', '@enduml'].join('\n');
    const scene = compile(src);
    const texts = scene.children
      .filter((s) => s.type === 'text')
      .map((s) => (s as { text: string }).text);
    expect(texts.some((t) => t.toLowerCase().includes('sprite'))).toBe(true);
  });

  it('renders a timing diagram with robust/concise/rectangle tracks end-to-end', () => {
    // Regression: the demo's timing samples were previously stored as a single
    // line of whitespace-separated tokens. The timing parser splits on `\n`,
    // so every sample produced an empty AST and a blank preview. This smoke
    // test exercises the full `compile -> render -> SVG` path with the
    // canonical multi-line format to confirm the parser, layout and renderer
    // all emit content for the three task-#54 track kinds.
    const svg = render([
      '@startuml',
      'robust "Web Browser" as WB',
      'concise "Web User" as WU',
      'rectangle "Rect. Web User" as RWU',
      '@0',
      'WU is Idle',
      'RWU is Idle',
      'WB is Idle',
      '@100',
      'WU is Waiting',
      'RWU is Waiting',
      'WB is Processing',
      '@300',
      'WB is Waiting',
      '@enduml',
    ].join('\n'));
    expect(svg.tagName.toLowerCase()).toBe('svg');
    const texts = Array.from(svg.querySelectorAll('text')).map((t) => t.textContent);
    // Track labels must appear (one per declared track).
    expect(texts).toContain('Web Browser');
    expect(texts).toContain('Web User');
    expect(texts).toContain('Rect. Web User');
    // At least one state label per timestamp should be rendered.
    expect(texts).toContain('Idle');
    expect(texts).toContain('Waiting');
    expect(texts).toContain('Processing');
    // The rendered scene must have multiple shapes (not just a blank canvas).
    const rects = Array.from(svg.querySelectorAll('rect'));
    expect(rects.length).toBeGreaterThan(3);
  });

  it('renders an archimate keyword sample with four colored rectangles end-to-end', () => {
    // Regression: the demo's archimate samples were previously stored as a
    // single line of whitespace-separated tokens (newlines collapsed to
    // spaces). With no newlines the component detector mis-classified the
    // source as a class diagram and the preview was empty. This smoke test
    // exercises the full `compile -> render -> SVG` path with the canonical
    // multi-line format to confirm detection, parsing, layout and rendering
    // all emit the four boxes (archimate technology element + three bare
    // `rectangle <Name> #Color` declarations) the docs example shows.
    const svg = render([
      '@startuml',
      'archimate #Technology "VPN Server" as vpnServerA <<technology-device>>',
      'rectangle GO #lightgreen',
      'rectangle STOP #red',
      'rectangle WAIT #orange',
      '@enduml',
    ].join('\n'));
    expect(svg.tagName.toLowerCase()).toBe('svg');
    const texts = Array.from(svg.querySelectorAll('text')).map((t) => t.textContent);
    // All four declared labels render, including the archimate display name
    // and the bare-rectangle ids used as labels.
    expect(texts).toContain('VPN Server');
    expect(texts).toContain('GO');
    expect(texts).toContain('STOP');
    expect(texts).toContain('WAIT');
    // The technology-device stereotype appears above the archimate label.
    expect(texts).toContain('«technology-device»');
    // Fills: the Archimate `#Technology` layer maps to a pastel green
    // (#C9E7B7); the bare-rectangle `#color` tokens pass through as the
    // literal CSS color name.
    const rectFills = Array.from(svg.querySelectorAll('rect'))
      .map((r) => r.getAttribute('fill'));
    expect(rectFills).toContain('#C9E7B7');
    expect(rectFills).toContain('lightgreen');
    expect(rectFills).toContain('red');
    expect(rectFills).toContain('orange');
  });

  it('produces a sequence AST for sequence-shaped input', () => {
    const ast = parseToAst('@startuml\nAlice -> Bob: hi\n@enduml');
    expect(ast.kind).toBe('sequence');
    if (ast.kind === 'sequence') {
      expect(ast.participants.map((p) => p.id)).toEqual(['Alice', 'Bob']);
      expect(ast.statements).toHaveLength(1);
      expect(ast.statements[0]).toMatchObject({
        type: 'message',
        from: 'Alice',
        to: 'Bob',
        text: 'hi',
      });
    }
  });

  // Regression: a sequence diagram whose messages carry the per-message
  // activation suffixes `++` / `--` / `--++` was misclassified as a class
  // diagram. The `-` of the `--` deactivate suffix sits next to the `+` of
  // the `++` activate suffix in the token stream (`--++`), and the
  // `hasClassArrow` adjacency check treated any `-+`/`+-` pair as a class
  // marker. The fix: suppress the symbol-marker heuristic on lines that
  // also carry sequence-arrow characters (`<`, `>`, `[`, `]`). Verifies
  // BOTH the AST routing and that the rendered SVG actually contains all
  // three message labels.
  it('routes activation-suffix sequence to sequence kind and renders 3 messages', () => {
    const src = [
      '@startuml',
      'alice -> bob ++ : hello1',
      'bob -> charlie --++ : hello2',
      'charlie --> alice -- : ok',
      '@enduml',
    ].join('\n');
    const ast = parseToAst(src);
    expect(ast.kind).toBe('sequence');
    if (ast.kind === 'sequence') {
      expect(ast.participants.map((p) => p.id)).toEqual(['alice', 'bob', 'charlie']);
      const msgs = ast.statements.filter((s) => s.type === 'message') as Array<{
        from: string; to: string; text: string;
        activateTarget?: boolean; deactivateSource?: boolean;
      }>;
      expect(msgs).toHaveLength(3);
      expect(msgs[0]).toMatchObject({
        from: 'alice', to: 'bob', text: 'hello1', activateTarget: true,
      });
      expect(msgs[1]).toMatchObject({
        from: 'bob', to: 'charlie', text: 'hello2',
        activateTarget: true, deactivateSource: true,
      });
      expect(msgs[2]).toMatchObject({
        from: 'charlie', to: 'alice', text: 'ok', deactivateSource: true,
      });
    }
    const svg = render(src);
    expect(svg.tagName.toLowerCase()).toBe('svg');
    const texts = Array.from(svg.querySelectorAll('text')).map((t) => t.textContent);
    expect(texts).toContain('hello1');
    expect(texts).toContain('hello2');
    expect(texts).toContain('ok');
  });
});
