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

  it('renders a multi-line usecase label as a rounded rect with horizontal separators', () => {
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

    // Multi-line usecase becomes a rounded rectangle (stadium) instead of an
    // ellipse. The previous fallback would have produced an ellipse.
    const ellipses = scene.children.filter((s) => s.type === 'ellipse');
    expect(ellipses).toHaveLength(0);
    const roundedRects = scene.children.filter(
      (s) => s.type === 'rect' && typeof s.rx === 'number' && s.rx > 0,
    );
    expect(roundedRects.length).toBeGreaterThanOrEqual(1);

    // All interior separators are emitted as `line` shapes spanning roughly
    // the shape's interior width.
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
});
