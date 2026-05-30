import { describe, it, expect } from 'vitest';
import { compile } from '../../src/index.js';

describe('use case layout', () => {
  it('renders two actors, two usecases, two arrows for the mixed-declaration form', () => {
    const scene = compile([
      '@startuml',
      ':User: --> (Use)',
      '"Main Admin" as Admin',
      '"Use the application" as (Use)',
      'Admin --> (Admin the application)',
      '@enduml',
    ].join('\n'));

    // Two ellipse shapes — one per use case.
    const ellipses = scene.children.filter((s) => s.type === 'ellipse');
    expect(ellipses).toHaveLength(2);

    // Each stick-figure actor is built from circle + 4 lines (no rectangle).
    // With 2 actors we expect at least 2 circles dedicated to the heads.
    const circles = scene.children.filter((s) => s.type === 'circle');
    expect(circles.length).toBeGreaterThanOrEqual(2);

    // Every relationship contributes at least one path/line in the scene.
    // We have two: User→Use, Admin→"Admin the application".
    const edgeShapes = scene.children.filter(
      (s) => s.type === 'path' || s.type === 'line',
    );
    expect(edgeShapes.length).toBeGreaterThanOrEqual(2);

    // Display labels render the human-readable name, not the alias.
    const texts = scene.children
      .filter((s) => s.type === 'text')
      .map((s) => (s as { text: string }).text);
    expect(texts).toContain('User');
    expect(texts).toContain('Main Admin');
    expect(texts).toContain('Use the application');
    expect(texts).toContain('Admin the application');
    // Alias-only strings must NOT leak into the rendered output.
    expect(texts).not.toContain('Admin');
    expect(texts).not.toContain('Use');
  });

  it('renders actors as filled silhouettes when actorStyle=awesome', () => {
    const scene = compile([
      '@startuml',
      'skinparam actorStyle awesome',
      ':User: --> (Use)',
      '"Main Admin" as Admin',
      '"Use the application" as (Use)',
      'Admin --> (Admin the application)',
      '@enduml',
    ].join('\n'));

    // Heads: filled circles (fill must not be 'none' / undefined).
    const filledCircles = scene.children.filter(
      (s) => s.type === 'circle' && s.style?.fill && s.style.fill !== 'none',
    );
    expect(filledCircles.length).toBeGreaterThanOrEqual(2);

    // Torsos: filled rect-or-polygon, one per actor. Filter out other rects
    // (containers, etc.) by requiring a non-'none' fill matching the head's.
    const torsos = scene.children.filter(
      (s) =>
        (s.type === 'rect' || s.type === 'polygon') &&
        s.style?.fill !== undefined &&
        s.style.fill !== 'none',
    );
    expect(torsos.length).toBeGreaterThanOrEqual(2);

    // No stick-figure body lines: the awesome variant emits no `line` shapes
    // styled with the actor stroke color (#222). Layered edges between nodes
    // also use `line` shapes but with the lighter edge color (#444), so we
    // filter on the stick-figure stroke specifically.
    const stickStrokes = scene.children.filter(
      (s) => s.type === 'line' && s.style?.stroke === '#222',
    );
    expect(stickStrokes).toHaveLength(0);

    // Display labels still resolve.
    const texts = scene.children
      .filter((s) => s.type === 'text')
      .map((s) => (s as { text: string }).text);
    expect(texts).toContain('User');
    expect(texts).toContain('Main Admin');
  });

  it('falls back to stick-figure actors when actorStyle is absent (default)', () => {
    const scene = compile([
      '@startuml',
      ':User: --> (Use)',
      '"Main Admin" as Admin',
      '@enduml',
    ].join('\n'));

    // Stick-figure actors emit `line` shapes (body / arms / legs) styled with
    // the dark stroke color. With 2 actors we expect 4 stick lines apiece.
    const stickStrokes = scene.children.filter(
      (s) => s.type === 'line' && s.style?.stroke === '#222',
    );
    expect(stickStrokes.length).toBeGreaterThanOrEqual(4);
  });

  it('renders actors as empty-headed stick figures with thicker strokes when actorStyle=Hollow', () => {
    const scene = compile([
      '@startuml',
      'skinparam actorStyle Hollow',
      ':User: --> (Use)',
      '"Main Admin" as Admin',
      '"Use the application" as (Use)',
      'Admin --> (Admin the application)',
      '@enduml',
    ].join('\n'));

    // Each actor head is an empty (white-filled) circle with r >= 8. With two
    // actors we expect at least two such heads.
    const hollowHeads = scene.children.filter(
      (s) =>
        s.type === 'circle' &&
        (s.style?.fill === '#FFFFFF' || s.style?.fill === 'white') &&
        s.r >= 8,
    );
    expect(hollowHeads.length).toBeGreaterThanOrEqual(2);

    // Stick-figure body/arm/legs: at least 4 line shapes per actor, styled
    // with the actor stroke color (#222) and a strokeWidth > 1 (thicker than
    // the default stickman's 1).
    const thickStickLines = scene.children.filter(
      (s) =>
        s.type === 'line' &&
        s.style?.stroke === '#222' &&
        (s.style?.strokeWidth ?? 0) > 1,
    );
    expect(thickStickLines.length).toBeGreaterThanOrEqual(8);

    // Labels still render below the figures.
    const texts = scene.children
      .filter((s) => s.type === 'text')
      .map((s) => (s as { text: string }).text);
    expect(texts).toContain('User');
    expect(texts).toContain('Main Admin');
  });

  it('renders a multi-line usecase label as an ELLIPSE with horizontal separators', () => {
    const scene = compile([
      '@startuml',
      '',
      'usecase UC1 as "You can use',
      'several lines to define your usecase.',
      'You can also use separators.',
      '--',
      'Several separators are possible.',
      '==',
      'And you can add titles:',
      '..Conclusion..',
      'This allows large description."',
      '',
      '@enduml',
    ].join('\n'));

    // PlantUML always renders a usecase as an ellipse, even when the label
    // spans multiple lines with separators. The ellipse simply grows large
    // enough (rx/ry) to enclose the content's bounding box.
    const ellipses = scene.children.filter((s) => s.type === 'ellipse');
    expect(ellipses).toHaveLength(1);
    const roundedRects = scene.children.filter(
      (s) => s.type === 'rect' && typeof s.rx === 'number' && s.rx > 0,
    );
    expect(roundedRects).toHaveLength(0);

    // All interior separators are emitted as `line` shapes spanning the
    // ellipse's chord at their y position.
    const lines = scene.children.filter((s) => s.type === 'line');
    // `--`, `==`, `..Conclusion..` → 3 separator lines minimum.
    expect(lines.length).toBeGreaterThanOrEqual(3);
    // Solid sep: stroke-width 1, no dasharray.
    const solid = lines.filter(
      (l) => l.style?.strokeWidth === 1 && !l.style?.strokeDasharray,
    );
    expect(solid.length).toBeGreaterThanOrEqual(1);
    // Double sep: stroke-width 2.
    const double = lines.filter((l) => (l.style?.strokeWidth ?? 0) >= 2);
    expect(double.length).toBeGreaterThanOrEqual(1);
    // Dotted sep: has a dasharray.
    const dotted = lines.filter((l) => !!l.style?.strokeDasharray);
    expect(dotted.length).toBeGreaterThanOrEqual(1);

    // The titled separator surfaces the title text in the scene.
    const texts = scene.children
      .filter((s) => s.type === 'text')
      .map((s) => (s as { text: string }).text);
    expect(texts).toContain('Conclusion');
    expect(texts.some((t) => t.includes('large description'))).toBe(true);
  });

  it('stacks multi-line usecase rows without overlap (regression: titled separator drew its title on top of the previous row)', () => {
    const scene = compile([
      '@startuml',
      '',
      'usecase UC1 as "You can use',
      'several lines to define your usecase.',
      'You can also use separators.',
      '--',
      'Several separators are possible.',
      '==',
      'And you can add titles:',
      '..Conclusion..',
      'This allows large description."',
      '',
      '@enduml',
    ].join('\n'));

    // Every text row inside the stadium must sit strictly below the previous
    // one by at least one line height (12px font, 1.25 spacing → ~15px).
    // Before the fix, the `..Conclusion..` title was drawn at the same y-band
    // as the preceding "And you can add titles:" line, producing a visible
    // overlap. We additionally require the dotted separator that follows the
    // title sit below the title's baseline.
    const MIN_GAP = 12; // ≤ FONT_LABEL * 1.25, allows small rounding slack.
    const rowYs = scene.children
      .filter((s) => s.type === 'text')
      .map((s) => (s as { y: number; text: string }))
      .map((s) => ({ y: s.y, text: s.text }));
    // First text row should be inside the stadium, others strictly increasing.
    for (let i = 1; i < rowYs.length; i++) {
      expect(rowYs[i]!.y - rowYs[i - 1]!.y).toBeGreaterThanOrEqual(MIN_GAP);
    }

    // The "Conclusion" title sits ABOVE its dotted separator line, not below
    // the previous row's text. Find both and assert ordering.
    const conclusionText = rowYs.find((r) => r.text === 'Conclusion');
    expect(conclusionText).toBeDefined();
    const priorText = rowYs.find((r) => r.text === 'And you can add titles:');
    expect(priorText).toBeDefined();
    expect(conclusionText!.y - priorText!.y).toBeGreaterThanOrEqual(MIN_GAP);
    // The dotted separator line that pairs with the title comes right after.
    const dotted = scene.children.find(
      (s) => s.type === 'line' && s.style?.strokeDasharray,
    ) as { y1: number } | undefined;
    expect(dotted).toBeDefined();
    expect(dotted!.y1).toBeGreaterThan(conclusionText!.y);
  });

  it('splits an arrow label containing \\n escapes into stacked text shapes', () => {
    const scene = compile([
      '@startuml',
      'User -> (Start)',
      'User --> (Use the application) : A small label',
      ':Main Admin: ---> (Use the application) : This is\\nyet another\\nlabel',
      '@enduml',
    ].join('\n'));

    const texts = scene.children
      .filter((s) => s.type === 'text')
      .map((s) => (s as { text: string }).text);
    // The three lines of the multi-line label render as three separate text
    // shapes — the literal `\n` is gone, the words appear on their own rows.
    expect(texts).toContain('This is');
    expect(texts).toContain('yet another');
    expect(texts).toContain('label');
    // No surviving two-char `\n` sequence in any rendered text.
    for (const t of texts) {
      expect(t).not.toContain('\\n');
    }
  });

  it('keeps a simple single-line usecase as an ellipse (regression)', () => {
    const scene = compile('@startuml\nusecase Login\n@enduml');
    const ellipses = scene.children.filter((s) => s.type === 'ellipse');
    expect(ellipses).toHaveLength(1);
    const roundedRects = scene.children.filter(
      (s) => s.type === 'rect' && typeof s.rx === 'number' && s.rx > 0,
    );
    expect(roundedRects).toHaveLength(0);
    // No separator lines inside a single-line usecase.
    const lines = scene.children.filter((s) => s.type === 'line');
    expect(lines).toHaveLength(0);
  });

  it('treats actorStyle=stickman as the default (no silhouette)', () => {
    const scene = compile([
      '@startuml',
      'skinparam actorStyle stickman',
      ':User: --> (Use)',
      '@enduml',
    ].join('\n'));
    const stickStrokes = scene.children.filter(
      (s) => s.type === 'line' && s.style?.stroke === '#222',
    );
    expect(stickStrokes.length).toBeGreaterThanOrEqual(4);
  });

  it('renders notes as folded-corner polygons with multi-line text and dashed connectors', () => {
    const scene = compile([
      '@startuml',
      ':Main Admin: as Admin',
      '(Use the application) as (Use)',
      'User -> (Start)',
      'User --> (Use)',
      'Admin ---> (Use)',
      'note right of Admin : This is an example.',
      'note right of (Use)',
      '  A note can also',
      '  be on several lines',
      'end note',
      'note "This note is connected\\nto several objects." as N2',
      '(Start) .. N2',
      'N2 .. (Use)',
      '@enduml',
    ].join('\n'));

    // One ellipse per use case node. Start and Use are use cases; User is
    // auto-declared as an actor (bare ids on relationship endpoints default
    // to actor in PlantUML), so it contributes no ellipse. If the alias-merge
    // bug regressed, this count would be one higher (a separate bare `Use`
    // ellipse next to "Use the application").
    const ellipses = scene.children.filter((s) => s.type === 'ellipse');
    expect(ellipses).toHaveLength(2);
    // Crucially, neither of the two `Use*` use cases is rendered twice — the
    // alias-merge fix collapses `(Use the application) as (Use)` into one.
    const useTexts = scene.children
      .filter((s) => s.type === 'text')
      .map((s) => (s as { text: string }).text)
      .filter((t) => t === 'Use' || t === 'Use the application');
    expect(useTexts).toEqual(['Use the application']);

    // Three notes (right-of Admin, right-of Use, free-standing N2). Each
    // contributes a 5-point polygon (the folded-corner outline). Layout may
    // emit other polygons too (awesome-style actor torsos, etc.) so we
    // filter on the polygon's signature: exactly 5 points + the note fill.
    const notePolys = scene.children.filter(
      (s) =>
        s.type === 'polygon' &&
        s.points.length === 5 &&
        s.style?.fill === '#FEFFDD',
    );
    expect(notePolys.length).toBe(3);

    // The fold polyline (3 points: the corner triangle outline) appears once
    // per note.
    const foldLines = scene.children.filter(
      (s) =>
        s.type === 'polyline' &&
        s.points.length === 3 &&
        s.style?.stroke === '#A0A088',
    );
    expect(foldLines.length).toBe(3);

    // Multi-line note body: the block-form `note right of (Use)` contributes
    // two separate text rows.
    const texts = scene.children
      .filter((s) => s.type === 'text')
      .map((s) => (s as { text: string }).text);
    expect(texts).toContain('A note can also');
    expect(texts).toContain('be on several lines');
    // Free-standing note body lines also surface.
    expect(texts).toContain('This note is connected');
    expect(texts).toContain('to several objects.');
    // Single-line attached note body.
    expect(texts).toContain('This is an example.');

    // Display label, not the alias.
    expect(texts).toContain('Use the application');

    // Dashed connectors between N2 and the use cases — `path` shapes whose
    // stroke-dasharray is set (style='dashed' in the relationship).
    const dashedEdges = scene.children.filter(
      (s) =>
        (s.type === 'path' || s.type === 'line') &&
        !!s.style?.strokeDasharray,
    );
    expect(dashedEdges.length).toBeGreaterThanOrEqual(2);

    // Bug-fix regression: `note right of Admin` must be anchored to the
    // Admin actor's bbox, NOT pinned to a global top-of-diagram coordinate.
    // We assert (a) the note's left edge sits to the RIGHT of Admin's right
    // edge with a positive gap, and (b) the note's vertical span overlaps
    // Admin's vertical span (i.e. it's at mid-height, not floating above
    // the actor). Admin's bbox is reconstructed from its head circle (the
    // only Admin-specific shape with a stable identifier — it lives at the
    // same cx as the "Main Admin" label).
    const adminLabel = scene.children.find(
      (s) => s.type === 'text' && (s as { text: string }).text === 'Main Admin',
    ) as { x: number; y: number } | undefined;
    expect(adminLabel).toBeDefined();
    // The stickman head is the circle whose cx matches the label's x; the
    // label sits at the actor box's horizontal center.
    const adminHead = scene.children.find(
      (s) => s.type === 'circle' && Math.abs(s.cx - adminLabel!.x) < 0.5,
    ) as { cx: number; cy: number; r: number } | undefined;
    expect(adminHead).toBeDefined();
    // Reconstruct Admin's bbox: the head sits at the top of the actor box,
    // the label at the bottom. Width is conservatively bounded by the wider
    // of the head diameter and the label width approximation; the assertion
    // only needs Admin's RIGHT EDGE, which is at most label.x + half-width.
    // We use the label's right edge as a tight upper bound for Admin's
    // right edge in this test (the actor figure is narrower than its label).
    const adminRightEdge = adminLabel!.x + 40; // half of widest "Main Admin"
    const adminTop = adminHead!.cy - adminHead!.r;
    const adminBottom = adminLabel!.y;

    // Find the polygon for "This is an example." — it's the note polygon
    // whose enclosed text is that string.
    const exampleText = scene.children.find(
      (s) => s.type === 'text' && (s as { text: string }).text === 'This is an example.',
    ) as { x: number; y: number } | undefined;
    expect(exampleText).toBeDefined();
    const examplePoly = scene.children.find(
      (s) =>
        s.type === 'polygon' &&
        s.style?.fill === '#FEFFDD' &&
        s.points.some(([px, py]) => px <= exampleText!.x && py <= exampleText!.y) &&
        s.points.some(([px, py]) => px >= exampleText!.x && py >= exampleText!.y),
    ) as { points: Array<[number, number]> } | undefined;
    expect(examplePoly).toBeDefined();
    const noteLeftX = Math.min(...examplePoly!.points.map((p) => p[0]));
    const noteTopY = Math.min(...examplePoly!.points.map((p) => p[1]));
    const noteBottomY = Math.max(...examplePoly!.points.map((p) => p[1]));
    // (a) Note left edge sits to the RIGHT of Admin's right edge.
    expect(noteLeftX).toBeGreaterThan(adminRightEdge);
    // (b) Note vertical span OVERLAPS Admin's vertical span — i.e. it is
    // anchored mid-height, not floating above the actor.
    expect(noteTopY).toBeLessThan(adminBottom);
    expect(noteBottomY).toBeGreaterThan(adminTop);

    // Bug-fix regression: the block note `note right of (Use)` must split
    // its body on `\n` and emit ONE text shape per line. The parser joins
    // body lines with `\n`; the renderer splits on the same separator.
    const blockNoteTexts = scene.children.filter(
      (s) =>
        s.type === 'text' &&
        ((s as { text: string }).text === 'A note can also' ||
          (s as { text: string }).text === 'be on several lines'),
    );
    expect(blockNoteTexts).toHaveLength(2);
    // The two lines must NOT be flattened into one joined string.
    expect(
      scene.children.find(
        (s) =>
          s.type === 'text' &&
          (s as { text: string }).text === 'A note can also be on several lines',
      ),
    ).toBeUndefined();
  });

  it('word-wraps a long single-line block note body into multiple text shapes', () => {
    // Bug-fix regression: when a block note's body is a single long line,
    // it must wrap on word boundaries into multiple rendered lines so the
    // note box stays compact instead of extending far past the anchor.
    const scene = compile([
      '@startuml',
      ':Main Admin: as Admin',
      '(Use the application) as (Use)',
      'User -> (Start)',
      'User --> (Use)',
      'Admin ---> (Use)',
      'note right of Admin : This is an example.',
      'note right of (Use)',
      '  A note can also be on several lines',
      'end note',
      'note "This note is connected\\nto several objects." as N2',
      '(Start) .. N2',
      'N2 .. (Use)',
      '@enduml',
    ].join('\n'));

    // The single long line in `note right of (Use)` must wrap into at LEAST
    // two text shapes. We identify wrap fragments by checking that each text
    // shape's content is a non-empty substring of the original body — this
    // is robust against the exact word-boundary the wrap chooses.
    const fullBody = 'A note can also be on several lines';
    const wrapFragments = scene.children.filter(
      (s) =>
        s.type === 'text' &&
        (s as { text: string }).text !== fullBody &&
        (s as { text: string }).text.length > 0 &&
        fullBody.includes((s as { text: string }).text) &&
        // Reject substrings that are also substrings of OTHER body strings in
        // the scene (e.g. the "This is an example." attached note). Each
        // wrap fragment must contain at least one word from the long body
        // that doesn't appear in any other note body.
        ((s as { text: string }).text.includes('A note') ||
          (s as { text: string }).text.includes('several') ||
          (s as { text: string }).text.includes('be on') ||
          (s as { text: string }).text.includes('can also') ||
          (s as { text: string }).text.includes('lines')),
    );
    expect(wrapFragments.length).toBeGreaterThanOrEqual(2);

    // The full unwrapped line must NOT appear as a single text shape.
    expect(
      scene.children.find(
        (s) =>
          s.type === 'text' && (s as { text: string }).text === fullBody,
      ),
    ).toBeUndefined();

    // Short note bodies must still render as a single text shape.
    expect(
      scene.children.find(
        (s) =>
          s.type === 'text' &&
          (s as { text: string }).text === 'This is an example.',
      ),
    ).toBeDefined();
    // Explicit `\n` boundaries in the free-standing note are preserved as
    // separate text shapes (not joined, not further wrapped).
    expect(
      scene.children.find(
        (s) =>
          s.type === 'text' &&
          (s as { text: string }).text === 'This note is connected',
      ),
    ).toBeDefined();
    expect(
      scene.children.find(
        (s) =>
          s.type === 'text' &&
          (s as { text: string }).text === 'to several objects.',
      ),
    ).toBeDefined();
  });

  it('keeps short note bodies on a single line (no spurious wrap)', () => {
    // Regression: short bodies must remain a single text shape — the wrap
    // only kicks in when the rendered line width exceeds MAX_NOTE_W.
    const scene = compile([
      '@startuml',
      ':Admin:',
      '(Use)',
      'Admin --> (Use)',
      'note right of Admin : short body',
      '@enduml',
    ].join('\n'));
    const shortTexts = scene.children.filter(
      (s) => s.type === 'text' && (s as { text: string }).text === 'short body',
    );
    expect(shortTexts).toHaveLength(1);
  });

  it('places generalization parent above child and merges aliased usecases', () => {
    // `A <|-- B` means A is the parent (hollow triangle on A's side). The
    // layered layout should put parent on top (earlier layer) and child below,
    // mirroring conventional UML rendering. Also exercises the Task #14 alias
    // merge: `(Use the application) as (Use)` must collapse into a single
    // ellipse, not produce a separate bare `Use` node.
    const scene = compile([
      '@startuml',
      ':Main Admin: as Admin',
      '(Use the application) as (Use)',
      '',
      'User <|-- Admin',
      '(Start) <|-- (Use)',
      '',
      '@enduml',
    ].join('\n'));

    const texts = scene.children
      .filter((s) => s.type === 'text')
      .map((s) => (s as { text: string }).text);

    // Exactly four named figures — Admin (actor), User/Start/Use-the-application
    // (use cases). No bare `Use` ellipse should leak from the alias merge.
    expect(texts).toContain('User');
    expect(texts).toContain('Main Admin');
    expect(texts).toContain('Start');
    expect(texts).toContain('Use the application');
    expect(texts).not.toContain('Use');

    const ellipses = scene.children.filter((s) => s.type === 'ellipse');
    // Two use-case ellipses: Start, Use-the-application. Admin renders as a
    // stick-figure actor (declared explicitly). User is a bare-id endpoint
    // that auto-declares as an actor too under the PlantUML default.
    expect(ellipses).toHaveLength(2);

    // Locate the User and Admin label texts to compare vertical centers.
    const userText = scene.children.find(
      (s) => s.type === 'text' && (s as { text: string }).text === 'User',
    ) as { y: number } | undefined;
    const adminText = scene.children.find(
      (s) => s.type === 'text' && (s as { text: string }).text === 'Main Admin',
    ) as { y: number } | undefined;
    const startText = scene.children.find(
      (s) => s.type === 'text' && (s as { text: string }).text === 'Start',
    ) as { y: number } | undefined;
    const useText = scene.children.find(
      (s) => s.type === 'text' && (s as { text: string }).text === 'Use the application',
    ) as { y: number } | undefined;
    expect(userText && adminText && startText && useText).toBeTruthy();

    // Parent must sit above child for both generalization edges.
    expect(userText!.y).toBeLessThan(adminText!.y);
    expect(startText!.y).toBeLessThan(useText!.y);

    // Two hollow-triangle arrowheads — 3-point polygons filled white with the
    // dark edge stroke. Other polygons in the scene (e.g. note folds) have a
    // different fill, so the signature is unambiguous.
    const hollowTriangles = scene.children.filter(
      (s) =>
        s.type === 'polygon' &&
        s.points.length === 3 &&
        s.style?.fill === '#fff' &&
        s.style?.stroke === '#222',
    );
    expect(hollowTriangles).toHaveLength(2);
  });

  it('renders stereotypes as italic guillemet-wrapped text above each node label', () => {
    const scene = compile([
      '@startuml',
      'User << Human >>',
      ':Main Database: as MySql << Application >>',
      '(Start) << One Shot >>',
      '(Use the application) as (Use) << Main >>',
      'User -> (Start)',
      'User --> (Use)',
      'MySql --> (Use)',
      '@enduml',
    ].join('\n'));

    // Two actor stick figures (User + MySql). Each contributes one head circle,
    // so we expect at least two circles in the scene.
    const circles = scene.children.filter((s) => s.type === 'circle');
    expect(circles.length).toBeGreaterThanOrEqual(2);

    // Two usecases → two ellipse shapes.
    const ellipses = scene.children.filter((s) => s.type === 'ellipse');
    expect(ellipses).toHaveLength(2);

    // All four stereotypes render as italic guillemet-wrapped text.
    const italicStereo = scene.children.filter(
      (s) =>
        s.type === 'text' &&
        (s as { font?: { style?: string } }).font?.style === 'italic' &&
        /^«.+»$/.test((s as { text: string }).text),
    );
    const stereoTexts = italicStereo
      .map((s) => (s as { text: string }).text)
      .sort();
    expect(stereoTexts).toEqual(['«Application»', '«Human»', '«Main»', '«One Shot»']);

    // Display names render (not the alias).
    const allTexts = scene.children
      .filter((s) => s.type === 'text')
      .map((s) => (s as { text: string }).text);
    expect(allTexts).toContain('Main Database');
    expect(allTexts).not.toContain('MySql');
    expect(allTexts).toContain('Use the application');
    expect(allTexts).not.toContain('Use');
  });

  it('renders reverse-arrow forms `<-` and `<..` from actor to use case', () => {
    // Reverse arrows (`<-`, `<..`) place the head on the source-order LHS.
    // The parser swaps endpoints so layout treats them like forward edges
    // from the actor to the use case, preserving line style (solid/dashed).
    const scene = compile([
      '@startuml',
      '(Use case 1) <.. :user:',
      '(Use case 2) <- :user:',
      '@enduml',
    ].join('\n'));

    // One actor (user) and two use case ellipses.
    const ellipses = scene.children.filter((s) => s.type === 'ellipse');
    expect(ellipses).toHaveLength(2);
    const circles = scene.children.filter((s) => s.type === 'circle');
    expect(circles.length).toBeGreaterThanOrEqual(1);

    // Two edge primitives — one dashed (path/line with strokeDasharray set)
    // and one solid (no dasharray, edge stroke color #444). Filter on edge
    // stroke to ignore actor body lines (#222).
    const dashedEdges = scene.children.filter(
      (s) =>
        (s.type === 'path' || s.type === 'line') &&
        s.style?.stroke === '#444' &&
        !!s.style?.strokeDasharray,
    );
    const solidEdges = scene.children.filter(
      (s) =>
        (s.type === 'path' || s.type === 'line') &&
        s.style?.stroke === '#444' &&
        !s.style?.strokeDasharray,
    );
    expect(dashedEdges.length).toBeGreaterThanOrEqual(1);
    expect(solidEdges.length).toBeGreaterThanOrEqual(1);

    // An arrow head (`>`) renders as a 3-point polyline with the dark marker
    // stroke. With targetMarker=arrow on both edges after the swap, the scene
    // must contain at least two arrowheads landing on the use case ellipses.
    const arrowHeads = scene.children.filter(
      (s) =>
        s.type === 'polyline' &&
        s.points.length === 3 &&
        s.style?.stroke === '#222',
    );
    expect(arrowHeads.length).toBeGreaterThanOrEqual(2);

    // Both arrowhead tips (middle point of the polyline) should land inside
    // the bounding box of an ellipse (i.e. at the use case end of the edge,
    // not at the actor end).
    const ellipseBoxes = ellipses.map((e) => {
      const el = e as { cx: number; cy: number; rx: number; ry: number };
      return {
        minX: el.cx - el.rx,
        maxX: el.cx + el.rx,
        minY: el.cy - el.ry,
        maxY: el.cy + el.ry,
      };
    });
    for (const head of arrowHeads) {
      const points = (head as { points: Array<[number, number]> }).points;
      const tip = points[1]!;
      const inside = ellipseBoxes.some(
        (b) =>
          tip[0] >= b.minX - 2 &&
          tip[0] <= b.maxX + 2 &&
          tip[1] >= b.minY - 8 &&
          tip[1] <= b.maxY + 8,
      );
      expect(inside).toBe(true);
    }
  });

  it('applies skinparam usecase block: default fill/border, stereotype overrides, arrow color, handwritten notice', () => {
    const scene = compile([
      '@startuml',
      'skinparam handwritten true',
      '',
      'skinparam usecase {',
      'BackgroundColor DarkSeaGreen',
      'BorderColor DarkSlateGray',
      '',
      'BackgroundColor<< Main >> YellowGreen',
      'BorderColor<< Main >> YellowGreen',
      '',
      'ArrowColor Olive',
      'ActorBorderColor black',
      'ActorFontName Courier',
      '',
      'ActorBackgroundColor<< Human >> Gold',
      '}',
      '',
      'User << Human >>',
      ':Main Database: as MySql << Application >>',
      '(Start) << One Shot >>',
      '(Use the application) as (Use) << Main >>',
      '',
      'User -> (Start)',
      'User --> (Use)',
      'MySql --> (Use)',
      '@enduml',
    ].join('\n'));

    // Resolved colors used below.
    const DARK_SEA_GREEN = '#8FBC8F';
    const YELLOW_GREEN = '#9ACD32';
    const OLIVE = '#808000';
    const GOLD = '#FFD700';

    // Canvas background MUST stay white — the `BackgroundColor DarkSeaGreen`
    // inside `skinparam usecase { ... }` is the *ellipse* fill, not the page
    // fill. Only a top-level `skinparam backgroundColor X` should tint the
    // canvas.
    expect(scene.background).toBe('#fff');
    const canvasRect = scene.children.find(
      (s) => s.type === 'rect' && s.style?.fill === DARK_SEA_GREEN && (s as { x: number }).x === 0,
    );
    expect(canvasRect).toBeUndefined();

    // Default usecase ellipse fill = DarkSeaGreen for the un-stereotyped
    // (or non-Main) usecases — `Start` here.
    const defaultEllipses = scene.children.filter(
      (s) => s.type === 'ellipse' && s.style?.fill === DARK_SEA_GREEN,
    );
    expect(defaultEllipses.length).toBeGreaterThanOrEqual(1);

    // `<<Main>>` stereotype overrides fill + border — the `Use` ellipse.
    const mainEllipses = scene.children.filter(
      (s): s is typeof s & { style?: { fill?: string; stroke?: string } } =>
        s.type === 'ellipse' && s.style?.fill === YELLOW_GREEN,
    );
    expect(mainEllipses).toHaveLength(1);
    expect(mainEllipses[0]!.style?.stroke).toBe(YELLOW_GREEN);

    // ArrowColor recolors the edge stroke. Filter on Olive specifically so
    // we don't accidentally match unrelated lines.
    const oliveEdges = scene.children.filter(
      (s) => (s.type === 'path' || s.type === 'line') && s.style?.stroke === OLIVE,
    );
    expect(oliveEdges.length).toBeGreaterThanOrEqual(3);

    // Actor `<<Human>>` (User) gets a Gold-filled head; the other actor
    // (MySql, `<<Application>>`) has no override so its head keeps the
    // default actor fill.
    const goldHeads = scene.children.filter(
      (s) => s.type === 'circle' && s.style?.fill === GOLD,
    );
    expect(goldHeads).toHaveLength(1);

    // All actor strokes are `black` (via ActorBorderColor). The skin module
    // normalises the CSS name to `#000000`. Head circle stroke and stick-
    // figure line strokes both pick this up; at least one of each.
    const BLACK = '#000000';
    const blackStrokeCircle = scene.children.find(
      (s) => s.type === 'circle' && s.style?.stroke === BLACK,
    );
    expect(blackStrokeCircle).toBeTruthy();
    const blackStrokeLine = scene.children.find(
      (s) => s.type === 'line' && s.style?.stroke === BLACK,
    );
    expect(blackStrokeLine).toBeTruthy();

    // Actor label font picks up `ActorFontName Courier` — we expect the CSS
    // chain emitted by the skin module to contain `Courier`.
    const userLabel = scene.children.find(
      (s) => s.type === 'text' && (s as { text: string }).text === 'User',
    ) as { font?: { family?: string } } | undefined;
    expect(userLabel?.font?.family ?? '').toMatch(/Courier/);

    // Handwritten notice text is present somewhere in the scene.
    const notice = scene.children.find(
      (s) =>
        s.type === 'text' &&
        /Please use '!option handwritten true'/.test((s as { text: string }).text),
    );
    expect(notice).toBeTruthy();
  });

  it('keeps nested-block usecase BackgroundColor off the canvas while still tinting un-stereotyped ellipses', () => {
    // Regression guard for the canvas-vs-ellipse conflation bug: a nested
    // `skinparam usecase { BackgroundColor X }` directive used to write to
    // the same flat `backgroundcolor` key as a top-level
    // `skinparam backgroundColor X` one-liner, so the whole page picked up
    // the nested color. After the fix the nested key is stored as
    // `usecase.backgroundcolor` and only the per-ellipse fill consumes it.
    const scene = compile([
      '@startuml',
      '!option handwritten true',
      'skinparam usecase {',
      '  BackgroundColor DarkSeaGreen',
      '  BorderColor DarkSlateGray',
      '  BackgroundColor<< Main >> YellowGreen',
      '  BorderColor<< Main >> YellowGreen',
      '  ArrowColor Olive',
      '  ActorBorderColor black',
      '  ActorFontName Courier',
      '  ActorBackgroundColor<< Human >> Gold',
      '}',
      'User << Human >>',
      ':Main Database: as MySql << Application >>',
      '(Start) << One Shot >>',
      '(Use the application) as (Use) << Main >>',
      'User -> (Start)',
      'User --> (Use)',
      'MySql --> (Use)',
      '@enduml',
    ].join('\n'));

    const DARK_SEA_GREEN = '#8FBC8F';
    const YELLOW_GREEN = '#9ACD32';

    // (1) Canvas stays white/transparent — the nested `BackgroundColor`
    // does NOT leak onto the page.
    expect(scene.background).toBe('#fff');

    // (2) The un-stereotyped `Start` ellipse picks up the default nested
    // `BackgroundColor` (DarkSeaGreen).
    const ellipses = scene.children.filter(
      (s): s is typeof s & { style?: { fill?: string } } => s.type === 'ellipse',
    );
    const darkFill = ellipses.find((e) => e.style?.fill === DARK_SEA_GREEN);
    expect(darkFill).toBeTruthy();

    // (3) The `<<Main>>` ellipse `Use` picks up the YellowGreen override.
    const mainFill = ellipses.find((e) => e.style?.fill === YELLOW_GREEN);
    expect(mainFill).toBeTruthy();
  });

  it('renders bare-id endpoints as stick-figure actors and paren endpoints as ellipses', () => {
    // The polish for Task #14: a bare identifier on a relationship endpoint
    // with no prior declaration defaults to actor, not use case. Here `User`
    // and `Admin` are bare → stick-figure actors; `Start` and `Use` are
    // wrapped in parens → ellipses.
    const scene = compile([
      '@startuml',
      'User -> (Start)',
      'User --> (Use)',
      'Admin --> (Use)',
      '@enduml',
    ].join('\n'));
    const ellipses = scene.children.filter((s) => s.type === 'ellipse');
    expect(ellipses).toHaveLength(2);
    // Each stick-figure actor has one head circle, so at least 2 circles for
    // User and Admin.
    const circles = scene.children.filter((s) => s.type === 'circle');
    expect(circles.length).toBeGreaterThanOrEqual(2);
  });

  it('renders the checkout/actor-rectangle scene in LR with the container wrapping all members', () => {
    // End-to-end render check for the multi-feature example:
    //   - `left to right direction` flips sugiyama's rank axis (X), so actors
    //     end up at the diagram's extreme X positions (not stacked vertically).
    //   - `rectangle checkout { ... }` is the system boundary and must enclose
    //     the three use-case ellipses (`checkout`, `payment`, `help`).
    //   - `.>` shorthand renders as a dashed edge with a label.
    //   - `--` renders as a solid line with no end markers (no arrow heads).
    const scene = compile([
      '@startuml',
      'left to right direction',
      'skinparam packageStyle rectangle',
      'actor customer',
      'actor clerk',
      'rectangle checkout {',
      '  customer -- (checkout)',
      '  (checkout) .> (payment) : include',
      '  (help) .> (checkout) : extends',
      '  (checkout) -- clerk',
      '}',
      '@enduml',
    ].join('\n'));

    // Three use cases → three ellipses (checkout/payment/help).
    const ellipses = scene.children.filter((s) => s.type === 'ellipse');
    expect(ellipses).toHaveLength(3);

    // Two actors → at least two stick-figure head circles.
    const circles = scene.children.filter((s) => s.type === 'circle');
    expect(circles.length).toBeGreaterThanOrEqual(2);

    // Exactly one container rect should enclose all three ellipses. Pick the
    // largest rect (container rectangles dwarf any decorative rects) and check
    // every ellipse's center sits inside its bounds.
    const rects = scene.children.filter((s) => s.type === 'rect') as Array<
      { x: number; y: number; w: number; h: number }
    >;
    expect(rects.length).toBeGreaterThanOrEqual(1);
    const container = rects.reduce((a, b) => (a.w * a.h >= b.w * b.h ? a : b));
    for (const e of ellipses as Array<{ cx: number; cy: number }>) {
      expect(e.cx).toBeGreaterThan(container.x);
      expect(e.cx).toBeLessThan(container.x + container.w);
      expect(e.cy).toBeGreaterThan(container.y);
      expect(e.cy).toBeLessThan(container.y + container.h);
    }

    // LR layout: the actors' X positions should occupy the diagram's
    // extremes — one near the left edge, one near the right. We compare each
    // actor head's cx to the midpoint of the scene; one must be < mid and the
    // other must be > mid.
    const heads = circles as Array<{ cx: number; cy: number }>;
    expect(heads.length).toBe(2);
    const midX = scene.width / 2;
    const onLeft = heads.filter((h) => h.cx < midX);
    const onRight = heads.filter((h) => h.cx > midX);
    expect(onLeft.length).toBe(1);
    expect(onRight.length).toBe(1);

    // Edge labels render the verbatim `include` / `extends` text.
    const texts = scene.children
      .filter((s) => s.type === 'text')
      .map((s) => (s as { text: string }).text);
    expect(texts).toContain('include');
    expect(texts).toContain('extends');

    // Two dashed edges (`.>`) → at least two stroked line/polyline shapes with
    // a dashed strokeDasharray. The `--` edges are solid (no dasharray).
    const dashed = scene.children.filter(
      (s) =>
        (s.type === 'line' || s.type === 'polyline' || s.type === 'path') &&
        s.style?.strokeDasharray !== undefined,
    );
    expect(dashed.length).toBeGreaterThanOrEqual(2);

    // The container label "checkout" is rendered in the rect header.
    expect(texts).toContain('checkout');
  });

  it('renders pre-declared actors OUTSIDE the rectangle they are referenced in', () => {
    // Regression: when an actor is declared before a `rectangle X { ... }`
    // block and only REFERENCED inside (e.g. `customer -- (checkout)`), the
    // sugiyama layered layout puts it in the same column as the use cases
    // and slots it visually inside the rectangle's bounding box. The fix
    // shifts those externals past the container edge so the boundary box
    // wraps only its declared members.
    const scene = compile([
      '@startuml',
      'left to right direction',
      'skinparam packageStyle rectangle',
      'actor customer',
      'actor clerk',
      'rectangle checkout {',
      '  customer -- (checkout)',
      '  (checkout) .> (payment) : include',
      '  (help) .> (checkout) : extends',
      '  (checkout) -- clerk',
      '}',
      '@enduml',
    ].join('\n'));

    const rects = scene.children.filter((s) => s.type === 'rect') as Array<
      { x: number; y: number; w: number; h: number }
    >;
    expect(rects.length).toBeGreaterThanOrEqual(1);
    // Largest rect is the container boundary.
    const container = rects.reduce((a, b) => (a.w * a.h >= b.w * b.h ? a : b));

    // Stick-figure heads stay at the same cx as their actor's label text and
    // are the most stable proxy for actor X positions in the scene.
    const heads = scene.children.filter((s) => s.type === 'circle') as Array<
      { cx: number; cy: number }
    >;
    expect(heads).toHaveLength(2);

    // One head sits LEFT of the container, the other RIGHT — neither lands
    // inside the boundary box along the rank axis.
    const leftOfContainer = heads.filter((h) => h.cx < container.x);
    const rightOfContainer = heads.filter((h) => h.cx > container.x + container.w);
    expect(leftOfContainer).toHaveLength(1);
    expect(rightOfContainer).toHaveLength(1);
    for (const h of heads) {
      // Belt-and-braces: no head's cx is strictly inside the boundary.
      const insideX = h.cx > container.x && h.cx < container.x + container.w;
      expect(insideX).toBe(false);
    }

    // Every use-case ellipse, by contrast, stays INSIDE the boundary.
    const ellipses = scene.children.filter((s) => s.type === 'ellipse') as Array<
      { cx: number; cy: number }
    >;
    expect(ellipses).toHaveLength(3);
    for (const e of ellipses) {
      expect(e.cx).toBeGreaterThan(container.x);
      expect(e.cx).toBeLessThan(container.x + container.w);
    }
  });

  it('renders business actors with an extra slash marker on each figure', () => {
    const scene = compile([
      '@startuml',
      ':First Actor:/',
      ':Another\\nactor:/ as Man2',
      'actor/ Woman3',
      'actor/ :Last actor: as Person1',
      '@enduml',
    ].join('\n'));

    // Four stick-figure actors → at least 4 head circles.
    const heads = scene.children.filter((s) => s.type === 'circle');
    expect(heads.length).toBeGreaterThanOrEqual(4);

    // Each business actor contributes one diagonal slash line whose x and y
    // both increase by the same delta (45° down-right). Count those.
    const diagonals = scene.children.filter(
      (s) =>
        s.type === 'line' &&
        Math.abs(s.x2 - s.x1 - (s.y2 - s.y1)) < 0.001 &&
        s.x2 > s.x1 &&
        s.y2 > s.y1,
    );
    expect(diagonals.length).toBeGreaterThanOrEqual(4);
  });

  it('draws the business-actor slash THROUGH each head center, and stacks multi-line actor labels (regression)', () => {
    // Failing input from the bug report. Asserts both the geometry of the
    // slash marker (must pass through every head circle's center) and the
    // multi-line label expansion for `Another\nactor`.
    const scene = compile([
      '@startuml',
      ':First Actor:/',
      ':Another\\nactor:/ as Man2',
      'actor/ Woman3',
      'actor/ :Last actor: as Person1',
      '@enduml',
    ].join('\n'));

    const heads = scene.children.filter(
      (s): s is Extract<typeof s, { type: 'circle' }> => s.type === 'circle',
    );
    expect(heads.length).toBe(4);

    // Each business actor's diagonal slash should pass through its head's
    // (cx, cy). For a line from (x1, y1) to (x2, y2), the distance from a
    // point (cx, cy) to that line is
    //   |(x2-x1)*(y1-cy) - (x1-cx)*(y2-y1)| / sqrt(dx^2 + dy^2).
    // We require this distance < 0.001 (i.e. the line passes through center).
    const diagonals = scene.children.filter(
      (s): s is Extract<typeof s, { type: 'line' }> =>
        s.type === 'line' &&
        Math.abs(s.x2 - s.x1 - (s.y2 - s.y1)) < 0.001 &&
        s.x2 > s.x1 &&
        s.y2 > s.y1,
    );
    expect(diagonals.length).toBeGreaterThanOrEqual(4);

    for (const head of heads) {
      const through = diagonals.some((d) => {
        const dx = d.x2 - d.x1;
        const dy = d.y2 - d.y1;
        const num = Math.abs(dx * (d.y1 - head.cy) - (d.x1 - head.cx) * dy);
        const denom = Math.sqrt(dx * dx + dy * dy);
        return denom > 0 && num / denom < 0.001;
      });
      expect(through).toBe(true);
    }

    // Man2's label rendered as TWO separate text shapes (`Another` and
    // `actor`), since the parser expands `\n` to a real newline.
    const texts = scene.children.filter(
      (s): s is Extract<typeof s, { type: 'text' }> => s.type === 'text',
    );
    const labels = texts.map((t) => t.text);
    expect(labels).toContain('Another');
    expect(labels).toContain('actor');
    // And NO single text shape with the unsplit literal.
    expect(labels.some((l) => l.includes('\n'))).toBe(false);
  });

  it('renders business use cases with an extra vertical chord on each ellipse', () => {
    const scene = compile([
      '@startuml',
      '',
      '(First usecase)/',
      '(Another usecase)/ as (UC2)',
      'usecase/ UC3',
      'usecase/ (Last\\nusecase) as UC4',
      '',
      '@enduml',
    ].join('\n'));

    // Four use-case ellipses — one per business use case node.
    const ellipses = scene.children.filter((s) => s.type === 'ellipse');
    expect(ellipses).toHaveLength(4);

    // Each business use case contributes a near-vertical line chord sitting
    // on the left side of its ellipse. We assert by geometry: a `line` shape
    // whose `x1 === x2` (vertical) and whose `x1` falls strictly left of the
    // ellipse center for some ellipse in the scene. There should be at least
    // four such chords (one per use case).
    const verticalLines = scene.children.filter(
      (s) =>
        s.type === 'line' &&
        Math.abs(s.x1 - s.x2) < 0.001 &&
        s.y2 > s.y1,
    );
    const markers = verticalLines.filter((line) =>
      ellipses.some(
        (e) =>
          e.type === 'ellipse' &&
          line.type === 'line' &&
          line.x1 < e.cx &&
          line.x1 > e.cx - e.rx,
      ),
    );
    expect(markers.length).toBeGreaterThanOrEqual(4);
  });

  it('places direction-hinted satellites on the named side of the source actor', () => {
    const scene = compile([
      '@startuml',
      ':user: -left-> (dummyLeft)',
      ':user: -right-> (dummyRight)',
      ':user: -up-> (dummyUp)',
      ':user: -down-> (dummyDown)',
      '@enduml',
    ].join('\n'));

    // One actor (stick figure: 1 head circle) and four use case ellipses.
    const ellipses = scene.children.filter((s) => s.type === 'ellipse') as Array<{
      type: 'ellipse';
      cx: number;
      cy: number;
    }>;
    expect(ellipses).toHaveLength(4);
    const heads = scene.children.filter((s) => s.type === 'circle');
    expect(heads).toHaveLength(1);
    const userHead = heads[0] as { cx: number; cy: number };

    // Identify each ellipse by its label.
    const texts = scene.children.filter((s) => s.type === 'text') as Array<{
      type: 'text';
      x: number;
      y: number;
      text: string;
    }>;
    const labelPos = (name: string) => {
      const t = texts.find((tx) => tx.text === name);
      if (!t) throw new Error(`label "${name}" not rendered`);
      return { x: t.x, y: t.y };
    };
    const left = labelPos('dummyLeft');
    const right = labelPos('dummyRight');
    const up = labelPos('dummyUp');
    const down = labelPos('dummyDown');

    expect(left.x).toBeLessThan(userHead.cx);
    expect(right.x).toBeGreaterThan(userHead.cx);
    expect(up.y).toBeLessThan(userHead.cy);
    expect(down.y).toBeGreaterThan(userHead.cy);
  });

  it('renders four arrows with per-relationship #<styleBlock> overrides (color, bold, dashed, dotted, label color)', () => {
    const scene = compile([
      '@startuml',
      'actor foo',
      'foo --> (bar) : normal',
      'foo --> (bar1) #line:red;line.bold;text:red : red bold',
      'foo --> (bar2) #green;line.dashed;text:green : green dashed',
      'foo --> (bar3) #blue;line.dotted;text:blue : blue dotted',
      '@enduml',
    ].join('\n'));

    // All four ellipses must be present (bug: only `bar` rendered).
    const ellipses = scene.children.filter((s) => s.type === 'ellipse');
    expect(ellipses).toHaveLength(4);
    const texts = scene.children
      .filter((s) => s.type === 'text')
      .map((s) => (s as { text: string }).text);
    for (const name of ['bar', 'bar1', 'bar2', 'bar3']) {
      expect(texts).toContain(name);
    }

    // Edge line shapes — `drawLayeredEdge` emits one `line` or `polyline`
    // per relationship for the stroke itself. Filter on the per-edge colors
    // to find each styled arrow.
    type LineLike = {
      type: 'line' | 'polyline';
      style?: { stroke?: string; strokeWidth?: number; strokeDasharray?: string };
    };
    const edgeLines = scene.children.filter(
      (s): s is LineLike & typeof s =>
        (s.type === 'line' || s.type === 'polyline'),
    ) as LineLike[];

    // Red bold: stroke red, width >= 2, no dasharray.
    const redBold = edgeLines.find(
      (l) => l.style?.stroke === 'red' && (l.style.strokeWidth ?? 0) >= 2,
    );
    expect(redBold).toBeDefined();
    expect(redBold!.style?.strokeDasharray).toBeUndefined();

    // Green dashed: stroke green, dasharray `5,3`.
    const greenDashed = edgeLines.find(
      (l) => l.style?.stroke === 'green' && l.style?.strokeDasharray === '5,3',
    );
    expect(greenDashed).toBeDefined();

    // Blue dotted: stroke blue, dasharray `2,2`.
    const blueDotted = edgeLines.find(
      (l) => l.style?.stroke === 'blue' && l.style?.strokeDasharray === '2,2',
    );
    expect(blueDotted).toBeDefined();

    // The label text shapes must use the matching `text:<color>`. Locate by
    // exact label content.
    type TextShape = {
      type: 'text';
      text: string;
      font?: { color?: string };
    };
    const labelByText = (s: string) =>
      scene.children.find(
        (sh): sh is TextShape & typeof sh => sh.type === 'text' && (sh as TextShape).text === s,
      ) as TextShape | undefined;

    expect(labelByText('red bold')?.font?.color).toBe('red');
    expect(labelByText('green dashed')?.font?.color).toBe('green');
    expect(labelByText('blue dotted')?.font?.color).toBe('blue');
    // The unstyled `normal` label stays at the default colour.
    expect(labelByText('normal')?.font?.color).toBe('#000');
  });

  it('renders actor, usecase, and an embedded JSON table when `allowmixing` is set', () => {
    const scene = compile([
      '@startuml',
      'allowmixing',
      'actor Actor',
      'usecase Usecase',
      'json JSON {',
      '  "fruit":"Apple",',
      '  "size":"Large",',
      '  "color": ["Red", "Green"]',
      '}',
      '@enduml',
    ].join('\n'));

    // Actor stick figure contributes at least one circle (the head). The
    // usecase contributes an ellipse. Both must survive into the scene.
    const circles = scene.children.filter((s) => s.type === 'circle');
    expect(circles.length).toBeGreaterThanOrEqual(1);
    const ellipses = scene.children.filter((s) => s.type === 'ellipse');
    expect(ellipses.length).toBeGreaterThanOrEqual(1);

    // The embedded JSON block is emitted as a translated <g> group wrapping
    // the key/value table shapes produced by `layoutKvTree`. Locate it and
    // assert it contains the expected key/value text cells.
    const jsonGroup = scene.children.find((s) => s.type === 'group') as
      | { type: 'group'; children: Array<{ type: string; text?: string }> }
      | undefined;
    expect(jsonGroup).toBeDefined();
    const innerTexts = jsonGroup!.children
      .filter((c) => c.type === 'text')
      .map((c) => c.text);
    expect(innerTexts).toContain('fruit');
    expect(innerTexts).toContain('"Apple"');
    expect(innerTexts).toContain('size');
    expect(innerTexts).toContain('"Large"');
    expect(innerTexts).toContain('color');

    // Key/value table is rendered with rectangles for each cell — assert at
    // least a handful are present inside the group (one per key + value).
    const innerRects = jsonGroup!.children.filter((c) => c.type === 'rect');
    expect(innerRects.length).toBeGreaterThanOrEqual(4);

    // Top-level actor and usecase labels are still rendered alongside the
    // JSON block. (They live in the top-level shape list, not inside the
    // translated group.)
    const topTexts = scene.children
      .filter((s) => s.type === 'text')
      .map((s) => (s as { text: string }).text);
    expect(topTexts).toContain('Actor');
    expect(topTexts).toContain('Usecase');
  });
});
