import { describe, it, expect } from 'vitest';
import { compile } from '../../src/index.js';

describe('sequence layout', () => {
  it('produces a scene wider than the sum of participant widths', () => {
    const scene = compile('@startuml\nparticipant Alice\nparticipant Bob\nparticipant Charlie\n@enduml');
    expect(scene.width).toBeGreaterThan(300);
    expect(scene.children.length).toBeGreaterThan(0);
  });

  it('renders header (top and bottom) for each participant', () => {
    const scene = compile('@startuml\nparticipant A\nparticipant B\n@enduml');
    const rects = scene.children.filter((s) => s.type === 'rect');
    // 2 participants × 2 headers = 4 rects (plus maybe background)
    expect(rects.length).toBeGreaterThanOrEqual(4);
  });

  it('adds a message line and arrow head per message', () => {
    const scene = compile('@startuml\nA -> B: hi\n@enduml');
    const polys = scene.children.filter((s) => s.type === 'polygon');
    expect(polys.length).toBeGreaterThanOrEqual(1);
  });

  it('slants `A ->(N) B` arrows downward and slopes `A (N)<- B` likewise', () => {
    const src =
      '@startuml\n' +
      'A ->(10) B: text 10\n' +
      'B ->(10) A: text 10\n' +
      '\n' +
      'A ->(10) B: text 10\n' +
      'A (10)<- B: text 10\n' +
      '@enduml';
    const scene = compile(src);
    // Four messages → four arrow polygons (heads).
    const polys = scene.children.filter((s) => s.type === 'polygon');
    expect(polys.length).toBeGreaterThanOrEqual(4);
    // Message lines now have y2 > y1 (slanted). Filter for short-ish lines that
    // skip the long vertical lifelines. Slanted lines have non-zero |y2 - y1|.
    const slanted = scene.children.filter(
      (s) => s.type === 'line' && Math.abs((s as { y1: number; y2: number }).y2 - (s as { y1: number; y2: number }).y1) > 5,
    );
    expect(slanted.length).toBeGreaterThanOrEqual(4);
    // Each label `text 10` should appear four times.
    const texts = scene.children
      .filter((s) => s.type === 'text')
      .map((s) => (s as { text: string }).text);
    expect(texts.filter((t) => t === 'text 10').length).toBe(4);
  });

  // Regression: combining a slanted arrow with a per-message activation
  // suffix directly attached to the target (`B++` / `A--`, no whitespace)
  // used to fail at the parser layer — `B++` was treated as the participant
  // name and the slope was rendered but the activation never happened.
  it('slants arrows whose target carries a `++` / `--` suffix without whitespace', () => {
    const src = '@startuml\nA ->(40) B++: Rq\nB -->(20) A--: Rs\n@enduml';
    const scene = compile(src);
    // Slanted arrow body lines: large |x2 - x1| (cross-lane) plus non-zero
    // |y2 - y1|. Sort by y so we can pair them with the source order.
    const slanted = scene.children
      .filter((s) => s.type === 'line')
      .map((s) => s as { x1: number; x2: number; y1: number; y2: number })
      .filter((l) => Math.abs(l.x2 - l.x1) > 20 && Math.abs(l.y2 - l.y1) > 5)
      .sort((a, b) => a.y1 - b.y1);
    expect(slanted.length).toBeGreaterThanOrEqual(2);
    // duration=40 → 80px, duration=20 → 40px (DURATION_SCALE = 2).
    expect(Math.abs(slanted[0]!.y2 - slanted[0]!.y1)).toBe(80);
    expect(Math.abs(slanted[1]!.y2 - slanted[1]!.y1)).toBe(40);
  });

  it('keeps plain `A -> B: hi` arrow horizontal (no slant) as a regression', () => {
    const scene = compile('@startuml\nA -> B: hi\n@enduml');
    // The arrow's body line should be perfectly horizontal: y1 === y2.
    const arrowLines = scene.children.filter(
      (s) =>
        s.type === 'line' &&
        Math.abs((s as { x2: number; x1: number }).x2 - (s as { x1: number; x2: number }).x1) > 20,
    );
    expect(arrowLines.length).toBeGreaterThanOrEqual(1);
    for (const line of arrowLines) {
      const l = line as { y1: number; y2: number };
      expect(l.y1).toBe(l.y2);
    }
  });

  it('emits autonumber prefix on message text', () => {
    const scene = compile('@startuml\nautonumber\nA -> B: hi\nA -> B: hello\n@enduml');
    const texts = scene.children.filter((s) => s.type === 'text').map((s) => (s as { text: string }).text);
    expect(texts).toContain('1 hi');
    expect(texts).toContain('2 hello');
  });

  it('handles empty sequence gracefully', () => {
    const scene = compile('@startuml\n@enduml');
    expect(scene.width).toBeGreaterThan(0);
    expect(scene.height).toBeGreaterThan(0);
  });

  it('reorders lanes left-to-right by `participant ... order N` value', () => {
    const scene = compile(
      [
        '@startuml',
        'participant Last order 30',
        'participant Middle order 20',
        'participant First order 10',
        '@enduml',
      ].join('\n'),
    );
    // Header labels are emitted as text shapes — pick the leftmost x for each
    // (each label appears twice: top + bottom header at the same x).
    const xByLabel = (label: string): number => {
      const xs = scene.children
        .filter((s) => s.type === 'text' && (s as { text: string }).text === label)
        .map((s) => (s as { x: number }).x);
      return Math.min(...xs);
    };
    const xFirst = xByLabel('First');
    const xMiddle = xByLabel('Middle');
    const xLast = xByLabel('Last');
    // Lanes are sorted ascending by `order` → First (10) < Middle (20) < Last (30).
    expect(xFirst).toBeLessThan(xMiddle);
    expect(xMiddle).toBeLessThan(xLast);
  });

  it('places participants without `order` after those with `order`, preserving declaration order', () => {
    const scene = compile(
      [
        '@startuml',
        'participant Plain1',
        'participant Sorted order 5',
        'participant Plain2',
        '@enduml',
      ].join('\n'),
    );
    const xByLabel = (label: string): number => {
      const xs = scene.children
        .filter((s) => s.type === 'text' && (s as { text: string }).text === label)
        .map((s) => (s as { x: number }).x);
      return Math.min(...xs);
    };
    // `Sorted` has order=5, the others default to +Infinity → `Sorted` first,
    // then `Plain1` and `Plain2` in declaration order.
    expect(xByLabel('Sorted')).toBeLessThan(xByLabel('Plain1'));
    expect(xByLabel('Plain1')).toBeLessThan(xByLabel('Plain2'));
  });

  it('renders sequence actors as filled silhouettes when actorStyle=awesome', () => {
    const scene = compile([
      '@startuml',
      'skinparam actorStyle awesome',
      'actor Alice',
      'actor Bob',
      'Alice -> Bob : hello',
      'hide footbox',
      '@enduml',
    ].join('\n'));

    // Awesome heads: small filled circles (r=5) with a non-'none' fill. With
    // `hide footbox` only the top header row renders, so we get one head per
    // actor (>= 2 minimum).
    const filledHeads = scene.children.filter(
      (s) =>
        s.type === 'circle' &&
        (s as { r: number }).r === 5 &&
        (s as { style: { fill?: string } }).style.fill !== undefined &&
        (s as { style: { fill?: string } }).style.fill !== 'none',
    );
    expect(filledHeads.length).toBeGreaterThanOrEqual(2);

    // Torsos: rounded-top rects emitted by the awesome variant (rx > 0,
    // filled). Two actors → at least two such rects.
    const torsos = scene.children.filter(
      (s) =>
        s.type === 'rect' &&
        typeof (s as { rx?: number }).rx === 'number' &&
        ((s as { rx: number }).rx) > 0 &&
        (s as { style: { fill?: string } }).style.fill !== undefined &&
        (s as { style: { fill?: string } }).style.fill !== 'none',
    );
    expect(torsos.length).toBeGreaterThanOrEqual(2);

    // No stick-figure body lines drawn with the dark actor stroke. (Lifeline
    // and message lines may exist with other colors / dasharrays.)
    const stickStrokes = scene.children.filter(
      (s) =>
        s.type === 'line' &&
        (s as { style: { stroke?: string; strokeWidth?: number } }).style.stroke === '#222' &&
        ((s as { style: { strokeWidth?: number } }).style.strokeWidth ?? 1) === 1,
    );
    // Lifeline + message → at most a couple of lines, but none of them are the
    // 5 stick-figure segments per actor we'd see in the default rendering.
    // With awesome rendering, we expect significantly fewer dark lines than
    // 4 actors × 5 segments = 20 a stickman would emit per top+bottom header.
    expect(stickStrokes.length).toBeLessThan(8);
  });

  it('renders sequence actors as hollow silhouettes when actorStyle=Hollow', () => {
    const scene = compile([
      '@startuml',
      'skinparam actorStyle Hollow',
      'actor Alice',
      'actor Bob',
      'Alice -> Bob : hello',
      '@enduml',
    ].join('\n'));
    // Larger white-filled head circles distinguish hollow from the default
    // stickman (r=5). Top + bottom headers ×2 actors → at least 4.
    const hollowHeads = scene.children.filter(
      (s) =>
        s.type === 'circle' &&
        (s as { style: { fill?: string } }).style.fill === '#FFFFFF' &&
        (s as { r: number }).r >= 6,
    );
    expect(hollowHeads.length).toBeGreaterThanOrEqual(4);
    // Silhouette torso: a multi-corner polygon (shoulders + hips) per actor
    // header. 2 actors × 2 headers = at least 4 polygons with >=6 corners.
    const torsos = scene.children.filter(
      (s) =>
        s.type === 'polygon' &&
        Array.isArray((s as { points?: [number, number][] }).points) &&
        ((s as { points: [number, number][] }).points).length >= 6 &&
        (s as { style: { fill?: string } }).style.fill === '#FFFFFF',
    );
    expect(torsos.length).toBeGreaterThanOrEqual(4);
  });

  it('renders sequence actors as default stick figures when actorStyle absent', () => {
    const scene = compile([
      '@startuml',
      'actor Alice',
      'actor Bob',
      'Alice -> Bob : hello',
      'hide footbox',
      '@enduml',
    ].join('\n'));
    // Default stickman: r=5 head circles. With `hide footbox` honoured, only
    // the top header row renders — 2 actors × 1 header = 2 heads.
    const heads = scene.children.filter(
      (s) => s.type === 'circle' && (s as { r: number }).r === 5,
    );
    expect(heads.length).toBe(2);
    // Stickman emits 4 body lines per actor-header.
    const stickLines = scene.children.filter(
      (s) =>
        s.type === 'line' &&
        (s as { style: { stroke?: string } }).style.stroke === '#222',
    );
    expect(stickLines.length).toBeGreaterThanOrEqual(8);
  });

  it('renders actor with stick-figure head colored from the directive', () => {
    const scene = compile('@startuml\nactor Bob #red\nBob -> Bob: x\n@enduml');
    const redCircle = scene.children.find(
      (s) =>
        s.type === 'circle' &&
        (s as { style: { fill?: string } }).style.fill === 'red',
    );
    expect(redCircle).toBeTruthy();
  });

  it('renders all four colon-shorthand actor declarations as stick figures', () => {
    const src = [
      '@startuml',
      '',
      ':First Actor:',
      ':Another\\nactor: as Man2',
      'actor Woman3',
      'actor :Last actor: as Person1',
      '',
      '@enduml',
    ].join('\n');
    const scene = compile(src);
    const texts = scene.children
      .filter((s) => s.type === 'text')
      .map((s) => (s as { text: string }).text);
    // Each actor's label appears twice (top + bottom header).
    expect(texts.filter((t) => t === 'First Actor').length).toBe(2);
    expect(texts.filter((t) => t === 'Woman3').length).toBe(2);
    expect(texts.filter((t) => t === 'Last actor').length).toBe(2);
    // Multi-line label of Man2 — two lines, each appearing in top + bottom header.
    expect(texts.filter((t) => t === 'Another').length).toBe(2);
    expect(texts.filter((t) => t === 'actor').length).toBe(2);
    // No literal `\n` rendered.
    expect(texts.some((t) => t.includes('\\n'))).toBe(false);
    // Each actor renders a 5px-radius head circle, on TOP and BOTTOM headers.
    // 4 actors × 2 headers = 8 stick-figure heads.
    const heads = scene.children.filter(
      (s) => s.type === 'circle' && (s as { r: number }).r === 5,
    );
    expect(heads.length).toBe(8);
  });

  it('uses participant color as box fill', () => {
    const scene = compile(
      '@startuml\nparticipant L #99FF99\nL -> L: x\n@enduml',
    );
    const greenRect = scene.children.find(
      (s) =>
        s.type === 'rect' &&
        (s as { style: { fill?: string } }).style.fill === '#99FF99',
    );
    expect(greenRect).toBeTruthy();
  });

  it('renders participant stereotypes (plain label and spot-with-label)', () => {
    const scene = compile(
      [
        '@startuml',
        'participant "Famous Bob" as Bob << Generated >>',
        'participant Alice << (C,#ADD1B2) Testable >>',
        '',
        'Bob->Alice: First message',
        '@enduml',
      ].join('\n'),
    );
    const texts = scene.children
      .filter((s) => s.type === 'text')
      .map((s) => (s as { text: string }).text);
    // Bob's display name appears (id 'Bob' is NOT a header label).
    expect(texts).toContain('Famous Bob');
    expect(texts).not.toContain('Bob');
    // Alice's header shows her id (no alias declared).
    expect(texts).toContain('Alice');
    // Stereotype labels wrapped in guillemets, italicized by the renderer.
    expect(texts).toContain('«Generated»');
    expect(texts).toContain('«Testable»');
    // Spot character.
    expect(texts).toContain('C');
    // Spot circle filled with the directive's color.
    const greenSpot = scene.children.find(
      (s) =>
        s.type === 'circle' &&
        (s as { style: { fill?: string } }).style.fill === '#ADD1B2',
    );
    expect(greenSpot).toBeTruthy();
  });

  it('renders multi-line label as multiple text lines in each header', () => {
    const scene = compile(
      '@startuml\nparticipant "first\\nsecond" as X\nX -> X: hi\n@enduml',
    );
    const texts = scene.children
      .filter((s) => s.type === 'text')
      .map((s) => (s as { text: string }).text);
    expect(texts).toContain('first');
    expect(texts).toContain('second');
    // Both lines appear twice — top header + bottom header
    expect(texts.filter((t) => t === 'first').length).toBe(2);
    expect(texts.filter((t) => t === 'second').length).toBe(2);
  });

  it('renders multi-line self-message with text stacked above the loop arrow', () => {
    const scene = compile(
      '@startuml\nAlice -> Alice: This is line 1.\\nAnd line 2\\nLine 3\n@enduml',
    );
    const texts = scene.children
      .filter((s) => s.type === 'text')
      .map((s) => (s as { text: string }).text);
    expect(texts).toContain('This is line 1.');
    expect(texts).toContain('And line 2');
    expect(texts).toContain('Line 3');
    // No literal `\n` rendered
    expect(texts.some((t) => t.includes('\\n'))).toBe(false);
    // Diagram width must have grown to fit the longest line
    expect(scene.width).toBeGreaterThan(150);
  });

  it('renders distinct marker shapes per arrow variant', () => {
    // Render all 10 user-shown variants in a single diagram.
    const scene = compile(
      [
        '@startuml',
        'Bob ->x Alice',
        'Bob -> Alice',
        'Bob ->> Alice',
        'Bob -\\ Alice',
        'Bob \\\\- Alice',
        'Bob //-- Alice',
        'Bob ->o Alice',
        'Bob o\\\\-- Alice',
        'Bob <-> Alice',
        'Bob <->o Alice',
        '@enduml',
      ].join('\n'),
    );
    // Filled triangle arrowheads — `->`, `<->` (×2), `<->o` (left) = 4
    const filledTriangles = scene.children.filter(
      (s) =>
        s.type === 'polygon' &&
        (s as { style: { fill?: string } }).style.fill === '#222',
    );
    expect(filledTriangles.length).toBeGreaterThanOrEqual(4);
    // Filled circle dots — `->o`, `o\\--`, `<->o` (right) = 3
    const dots = scene.children.filter(
      (s) =>
        s.type === 'circle' &&
        (s as { r: number }).r === 4 &&
        (s as { style: { fill?: string } }).style.fill === '#222',
    );
    expect(dots.length).toBe(3);
    // Dashed lines — `//--`, `o\\--` = 2
    const dashedLines = scene.children.filter(
      (s) =>
        s.type === 'line' &&
        (s as { style: { strokeDasharray?: string } }).style.strokeDasharray,
    );
    // Lifelines and dashed messages both dash-styled; lifelines use '4,4',
    // message dashes use '5,3'. Pick out the message dashes specifically.
    const msgDashes = dashedLines.filter(
      (s) => (s as { style: { strokeDasharray?: string } }).style.strokeDasharray === '5,3',
    );
    expect(msgDashes.length).toBe(2);
  });

  it('substitutes %autonumber% and resolves <U+XXXX> in labels and notes', () => {
    const scene = compile(
      [
        '@startuml',
        'autonumber 10',
        'Alice -> Bob',
        'note right',
        '  the <U+0025>autonumber<U+0025> works everywhere.',
        '  Here, its value is ** %autonumber% **',
        'end note',
        'Bob --> Alice: //This is the response %autonumber%//',
        '@enduml',
      ].join('\n'),
    );
    const texts = scene.children
      .filter((s) => s.type === 'text')
      .map((s) => s as { text: string; font?: { weight?: string; style?: string } });

    // Note line 1: literal %autonumber% (from <U+0025> escapes)
    expect(texts.find((t) => t.text === 'the %autonumber% works everywhere.')).toBeDefined();
    // Note line 2: "Here, its value is" + bold "10"
    expect(texts.find((t) => t.text === 'Here, its value is ')).toBeDefined();
    const bold10 = texts.find((t) => t.text === ' 10 ' && t.font?.weight === 'bold');
    expect(bold10).toBeDefined();
    // Message 1 label uses autonumber 10
    expect(texts.find((t) => t.text === '10 ')).toBeDefined();
    // Message 2: italic "This is the response 11" (11 from %autonumber% subst)
    const italicResponse = texts.find(
      (t) => t.text === 'This is the response 11' && t.font?.style === 'italic',
    );
    expect(italicResponse).toBeDefined();
  });

  it('renders creole `--strike--`, `__underline__`, `~~waved~~` markers', () => {
    const scene = compile(
      [
        '@startuml',
        'participant A',
        'participant B',
        'A -> B : x',
        'note left',
        '  --stroke--',
        '  __under__',
        '  ~~wave~~',
        'end note',
        '@enduml',
      ].join('\n'),
    );
    // Strike + underline render as straight lines; wave renders as a polyline
    // zig-zag. Verify at least one of each (text color #000).
    const lines = scene.children.filter(
      (s) =>
        s.type === 'line' &&
        (s as { style: { stroke?: string } }).style.stroke === '#000',
    );
    const polylines = scene.children.filter(
      (s) =>
        s.type === 'polyline' &&
        (s as { style: { stroke?: string } }).style.stroke === '#000',
    );
    // At least 2 horizontal text lines (strike + underline)
    expect(lines.length).toBeGreaterThanOrEqual(2);
    // At least 1 wave polyline
    expect(polylines.length).toBeGreaterThanOrEqual(1);
  });

  it('renders bare `...` between two sequence arrows as a vertical gap with NO horizontal line', () => {
    const scene = compile(
      [
        '@startuml',
        'Bob -> Alice : hello',
        '...',
        'Alice -> Bob : ok',
        '@enduml',
      ].join('\n'),
    );
    // PlantUML reference: bare `...` produces ONLY a vertical gap. No
    // horizontal dashed line crosses the diagram.
    const arrowPolys = scene.children.filter((s) => s.type === 'polygon');
    expect(arrowPolys.length).toBeGreaterThanOrEqual(2);
    const arrowYs = arrowPolys
      .map((p) => (p as { points: Array<[number, number]> }).points.map((pt) => pt[1]))
      .flat();
    const minArrowY = Math.min(...arrowYs);
    const maxArrowY = Math.max(...arrowYs);
    // No horizontal line that spans the diagram width should sit between the
    // two arrows in the delay region.
    const spanningLines = scene.children.filter((s) => {
      if (s.type !== 'line') return false;
      const l = s as { x1: number; x2: number; y1: number; y2: number };
      if (l.y1 !== l.y2) return false;
      if (l.y1 <= minArrowY || l.y1 >= maxArrowY) return false;
      return l.x2 - l.x1 > scene.width * 0.8;
    });
    expect(spanningLines.length).toBe(0);
  });

  it('renders `... long delay ...` as centered text with NO horizontal line crossing the diagram', () => {
    const scene = compile(
      [
        '@startuml',
        'participant A',
        'participant B',
        'A -> B',
        '... long delay ...',
        'A -> B',
        '@enduml',
      ].join('\n'),
    );
    const texts = scene.children
      .filter((s) => s.type === 'text')
      .map((s) => (s as { text: string }).text);
    expect(texts).toContain('long delay');
    // No '2,3' dashed horizontal line spanning the diagram width — the
    // labeled delay shows only centered text, no line crossing.
    const spanningDashed = scene.children.filter((s) => {
      if (s.type !== 'line') return false;
      const l = s as { x1: number; x2: number; y1: number; y2: number; style: { strokeDasharray?: string } };
      if (l.style.strokeDasharray !== '2,3') return false;
      return l.x2 - l.x1 > scene.width * 0.6;
    });
    expect(spanningDashed.length).toBe(0);
    // The label text sits roughly centered horizontally.
    const labelText = scene.children.find(
      (s) => s.type === 'text' && (s as { text: string }).text === 'long delay',
    ) as { x: number } | undefined;
    expect(labelText).toBeDefined();
    expect(Math.abs(labelText!.x - scene.width / 2)).toBeLessThan(scene.width * 0.1);
  });

  it('renders the failing reference input (Alice/Bob with `...` and `...5 minutes later...`) per PlantUML standard', () => {
    const scene = compile(
      [
        '@startuml',
        'Alice -> Bob: Authentication Request',
        '...',
        'Bob --> Alice: Authentication Response',
        '...5 minutes later...',
        'Bob --> Alice: Good Bye !',
        '@enduml',
      ].join('\n'),
    );
    // No horizontal line spanning the diagram width should be emitted for
    // either delay — bare or labeled. We approximate "in a delay region" by
    // checking no full-width line uses the delay '2,3' dasharray.
    const delayLines = scene.children.filter(
      (s) =>
        s.type === 'line' &&
        (s as { style: { strokeDasharray?: string } }).style.strokeDasharray === '2,3' &&
        ((s as { x2: number; x1: number }).x2 - (s as { x2: number; x1: number }).x1) >
          scene.width * 0.6,
    );
    expect(delayLines.length).toBe(0);
    // The labeled delay text is present and roughly centered.
    const fiveMin = scene.children.find(
      (s) => s.type === 'text' && (s as { text: string }).text === '5 minutes later',
    ) as { x: number } | undefined;
    expect(fiveMin).toBeDefined();
    expect(Math.abs(fiveMin!.x - scene.width / 2)).toBeLessThan(scene.width * 0.1);
  });

  it('renders markup in participant label (`The **Famous** Bob`)', () => {
    const scene = compile(
      '@startuml\nparticipant "The **Famous** Bob" as Bob\nBob -> Bob: x\n@enduml',
    );
    const famous = scene.children.find(
      (s) =>
        s.type === 'text' &&
        (s as { text: string }).text === 'Famous' &&
        (s as { font?: { weight?: string } }).font?.weight === 'bold',
    );
    expect(famous).toBeDefined();
  });

  it('grows the diagram so `note left of <inner lane>` is not clipped', () => {
    const wide = compile(
      [
        '@startuml',
        'participant Alice',
        'participant Bob',
        'Alice -> Bob',
        'note left of Bob',
        '  Some long left note that needs space',
        'end note',
        '@enduml',
      ].join('\n'),
    );
    const narrow = compile('@startuml\nparticipant Alice\nparticipant Bob\nAlice -> Bob\n@enduml');
    // Wide case must be substantially wider because the note pushes the lanes apart.
    expect(wide.width).toBeGreaterThan(narrow.width + 100);
  });

  it('renders `ref over A, B : text` as a tabbed reference box spanning the lanes', () => {
    const scene = compile(
      [
        '@startuml',
        'participant Alice',
        'actor Bob',
        'ref over Alice, Bob : init',
        '@enduml',
      ].join('\n'),
    );
    // The bold "ref" tab text and the body text both exist.
    const texts = scene.children
      .filter((s) => s.type === 'text')
      .map((s) => ({
        text: (s as { text: string }).text,
        weight: (s as { font?: { weight?: string } }).font?.weight,
      }));
    const refTab = texts.find((t) => t.text === 'ref' && t.weight === 'bold');
    expect(refTab).toBeDefined();
    expect(texts.some((t) => t.text === 'init')).toBe(true);
    // The body rect uses the heavier 1.5 stroke that distinguishes refs from notes.
    const refRect = scene.children.find(
      (s) =>
        s.type === 'rect' &&
        (s as { style: { strokeWidth?: number; stroke?: string } }).style.strokeWidth === 1.5,
    );
    expect(refRect).toBeDefined();
  });

  it('renders multi-line `ref over X ... end ref` with each text line', () => {
    const scene = compile(
      [
        '@startuml',
        'actor Bob',
        'ref over Bob',
        '  This can be on',
        '  several lines',
        'end ref',
        '@enduml',
      ].join('\n'),
    );
    const texts = scene.children
      .filter((s) => s.type === 'text')
      .map((s) => (s as { text: string }).text);
    expect(texts).toContain('This can be on');
    expect(texts).toContain('several lines');
  });

  it('renders `partition <label>` as a tabbed group box', () => {
    const scene = compile(
      [
        '@startuml',
        'partition p1',
        'A -> B',
        'end',
        '@enduml',
      ].join('\n'),
    );
    const texts = scene.children
      .filter((s) => s.type === 'text')
      .map((s) => (s as { text: string }).text);
    // Bold tab keyword and bracketed secondary label render as separate text
    // shapes (PlantUML convention: tab = `<kind>`, secondary = `[<label>]`).
    expect(texts).toContain('partition');
    expect(texts).toContain('[p1]');
  });

  it('grows partition rect horizontally to contain attached notes', () => {
    // `note right:` / `note left:` after a message attach to that message's
    // target / source. Inside a partition, the partition rect must grow so
    // the note's bounding box stays inside the frame — and the contained
    // lifelines must remain inside as well.
    const scene = compile(
      [
        '@startuml',
        'participant a',
        'partition p1',
        'b -> c: msg',
        'c --> b: OK',
        'note right: Some right note',
        'end',
        'partition p2',
        'a -> b: msg',
        'note left: Some left note',
        'end',
        '@enduml',
      ].join('\n'),
    );

    type Rect = { type: 'rect'; x: number; y: number; w: number; h: number;
                  style?: { fill?: string; stroke?: string } };
    type Polygon = { type: 'polygon'; points: Array<[number, number]>;
                     style?: { fill?: string } };
    type Line = { type: 'line'; x1: number; y1: number; x2: number; y2: number;
                  style?: { strokeDasharray?: string } };

    // Partition rects: stroke '#888', fill 'none' (the group frame).
    const partitionRects = (scene.children.filter(
      (s) => s.type === 'rect',
    ) as Rect[]).filter(
      (r) => r.style?.stroke === '#888' && r.style?.fill === 'none',
    );
    expect(partitionRects.length).toBe(2);
    // Order in source: p1 then p2; y-sorted gives the same order.
    const sortedRects = partitionRects.slice().sort((a, b) => a.y - b.y);
    const p1 = sortedRects[0]!;
    const p2 = sortedRects[1]!;

    // Note polygons: the default folded-note shape has fill '#fbfb77'.
    const notes = (scene.children.filter(
      (s) => s.type === 'polygon',
    ) as Polygon[]).filter((p) => p.style?.fill === '#fbfb77');
    expect(notes.length).toBe(2);
    const noteBbox = (p: Polygon): Rect => {
      const xs = p.points.map((pt) => pt[0]);
      const ys = p.points.map((pt) => pt[1]);
      return {
        type: 'rect',
        x: Math.min(...xs), y: Math.min(...ys),
        w: Math.max(...xs) - Math.min(...xs),
        h: Math.max(...ys) - Math.min(...ys),
      };
    };
    const sortedNotes = notes.slice().sort((a, b) => noteBbox(a).y - noteBbox(b).y);
    const rightNote = noteBbox(sortedNotes[0]!);
    const leftNote = noteBbox(sortedNotes[1]!);

    // Lifelines are dashed (4,4) vertical lines. Headers have anchor text
    // at the same x as the lifeline.
    const lifelines = (scene.children.filter(
      (s) => s.type === 'line',
    ) as Line[]).filter((l) => l.style?.strokeDasharray === '4,4');
    const laneAt = (txt: string): number => {
      const hdr = (scene.children.find(
        (s) => s.type === 'text' && (s as { text: string }).text === txt,
      ) as { x: number } | undefined);
      expect(hdr).toBeDefined();
      const cx = hdr!.x;
      // Sanity: a lifeline exists at this x.
      expect(lifelines.some((l) => Math.abs(l.x1 - cx) < 0.5)).toBe(true);
      return cx;
    };
    const ax = laneAt('a');
    const bx = laneAt('b');
    const cx = laneAt('c');

    // p1 contains the right note AND the b + c lifelines.
    const inside = (r: Rect, x: number): boolean =>
      x >= r.x && x <= r.x + r.w;
    expect(inside(p1, rightNote.x)).toBe(true);
    expect(inside(p1, rightNote.x + rightNote.w)).toBe(true);
    expect(inside(p1, bx)).toBe(true);
    expect(inside(p1, cx)).toBe(true);

    // p2 contains the left note AND the a + b lifelines.
    expect(inside(p2, leftNote.x)).toBe(true);
    expect(inside(p2, leftNote.x + leftNote.w)).toBe(true);
    expect(inside(p2, ax)).toBe(true);
    expect(inside(p2, bx)).toBe(true);
  });

  it('renders `alt#Gold #LightBlue ... else #Pink ...` with tab + branch fills', () => {
    const scene = compile(
      [
        '@startuml',
        'Alice -> Bob: Authentication Request',
        'alt#Gold #LightBlue Successful case',
        '    Bob -> Alice: Authentication Accepted',
        'else #Pink Failure',
        '    Bob -> Alice: Authentication Rejected',
        'end',
        '@enduml',
      ].join('\n'),
    );
    const rects = scene.children.filter((s) => s.type === 'rect') as Array<{
      style?: { fill?: string; stroke?: string };
    }>;
    // Branch background rects with resolved colors.
    const blueRects = rects.filter((r) => r.style?.fill === '#ADD8E6');
    const pinkRects = rects.filter((r) => r.style?.fill === '#FFC0CB');
    expect(blueRects.length).toBeGreaterThanOrEqual(1);
    expect(pinkRects.length).toBeGreaterThanOrEqual(1);

    // Outer group frame: a rect with stroke '#888' and no fill (i.e. 'none').
    const outerFrame = rects.find(
      (r) => r.style?.stroke === '#888' && r.style?.fill === 'none',
    );
    expect(outerFrame).toBeDefined();

    // Tab polygon filled with the gold-resolved hex.
    const polys = scene.children.filter((s) => s.type === 'polygon') as Array<{
      style?: { fill?: string };
    }>;
    const goldTab = polys.find((p) => p.style?.fill === '#FFD700');
    expect(goldTab).toBeDefined();

    // Branch label texts.
    const texts = scene.children
      .filter((s) => s.type === 'text')
      .map((s) => (s as { text: string }).text);
    expect(texts).toContain('alt');
    expect(texts).toContain('[Successful case]');
    expect(texts).toContain('[Failure]');
  });

  it('renders `group <label> [<label2>]` with label as tab text and label2 as secondary', () => {
    const scene = compile(
      [
        '@startuml',
        'Alice -> Bob: Authentication Request',
        'group My own label [My own label 2]',
        '  Alice -> Bob: DNS Attack',
        'end',
        '@enduml',
      ].join('\n'),
    );
    const texts = scene.children
      .filter((s) => s.type === 'text')
      .map((s) => (s as { text: string }).text);
    // Tab text is the primary label (NOT prefixed by the `group` keyword);
    // the bracketed secondary renders as its own text shape.
    expect(texts).toContain('My own label');
    expect(texts).toContain('[My own label 2]');
    // The raw concatenated form must NOT appear anywhere.
    expect(texts.some((t) => t.includes('group [My own label'))).toBe(false);
  });

  it('renders `loop 1000 times` with `loop` as the tab and `[1000 times]` as secondary', () => {
    const scene = compile(
      [
        '@startuml',
        'Alice -> Bob: ping',
        'loop 1000 times',
        '  Alice -> Bob: poke',
        'end',
        '@enduml',
      ].join('\n'),
    );
    const texts = scene.children
      .filter((s) => s.type === 'text')
      .map((s) => (s as { text: string }).text);
    expect(texts).toContain('loop');
    expect(texts).toContain('[1000 times]');
    expect(texts.some((t) => t === 'loop [1000 times]')).toBe(false);
  });

  it('renders `note across` spanning the full diagram width', () => {
    const scene = compile(
      [
        '@startuml',
        'A -> B',
        'B -> C',
        'note across: spans everything',
        '@enduml',
      ].join('\n'),
    );
    const acrossNote = scene.children.find(
      (s) =>
        s.type === 'polygon' &&
        (s as { style: { fill?: string } }).style.fill === '#fbfb77' &&
        (s as { points: [number, number][] }).points.length === 5,
    ) as { points: [number, number][] };
    expect(acrossNote).toBeDefined();
    const leftX = acrossNote.points[0]![0];
    const rightX = acrossNote.points[2]![0];
    // Note width must be close to full diagram width (small SIDE_BLEED off both edges).
    expect(rightX - leftX).toBeGreaterThan(scene.width * 0.85);
  });

  it('treats `""text""` as monospace creole markup', () => {
    const scene = compile(
      '@startuml\nA -> B : plain ""code"" more\n@enduml',
    );
    const monoText = scene.children.find(
      (s) =>
        s.type === 'text' &&
        (s as { font?: { family?: string } }).font?.family === 'monospace' &&
        (s as { text: string }).text === 'code',
    );
    expect(monoText).toBeDefined();
  });

  it('renders hnote as hexagon (6-point polygon) and rnote as plain rect', () => {
    const scene = compile(
      [
        '@startuml',
        'A -> A',
        'hnote over A : hex',
        'rnote over A : rect',
        '@enduml',
      ].join('\n'),
    );
    const noteFill = '#fbfb77';
    const hexagons = scene.children.filter(
      (s) =>
        s.type === 'polygon' &&
        (s as { style: { fill?: string } }).style.fill === noteFill &&
        (s as { points: [number, number][] }).points.length === 6,
    );
    const plainRects = scene.children.filter(
      (s) =>
        s.type === 'rect' &&
        (s as { style: { fill?: string } }).style.fill === noteFill,
    );
    expect(hexagons.length).toBe(1);
    expect(plainRects.length).toBe(1);
  });

  it('renders note `#color` as fill and grows diagram for side notes', () => {
    const scene = compile(
      [
        '@startuml',
        'participant Alice',
        'participant Bob',
        'note left of Alice #aqua',
        'left aqua',
        'end note',
        'note over Alice, Bob #FFAAAA: pink over both',
        '@enduml',
      ].join('\n'),
    );
    const aquaPolygon = scene.children.find(
      (s) =>
        s.type === 'polygon' &&
        (s as { style: { fill?: string } }).style.fill === 'aqua',
    );
    const pinkPolygon = scene.children.find(
      (s) =>
        s.type === 'polygon' &&
        (s as { style: { fill?: string } }).style.fill === '#FFAAAA',
    );
    expect(aquaPolygon).toBeDefined();
    expect(pinkPolygon).toBeDefined();
    // Diagram width should be wider than the default narrow case (Alice+Bob ~200)
    // to fit the left note on lane 0.
    expect(scene.width).toBeGreaterThan(200);
  });

  it('renders only the first page when `newpage` directives are present', () => {
    // PlantUML's standard single-image preview shows only the FIRST page of a
    // diagram that uses `newpage`. Statements after the first `newpage` —
    // including any title on the directive itself — must NOT appear in the
    // scene.
    const scene = compile(
      [
        '@startuml',
        'Alice -> Bob : message 1',
        'Alice -> Bob : message 2',
        'newpage',
        'Alice -> Bob : message 3',
        'Alice -> Bob : message 4',
        'newpage A title for the\\nlast page',
        'Alice -> Bob : message 5',
        'Alice -> Bob : message 6',
        '@enduml',
      ].join('\n'),
    );
    const texts = scene.children
      .filter((s) => s.type === 'text')
      .map((s) => (s as { text: string }).text);
    // Only the first page's messages render.
    expect(texts).toContain('message 1');
    expect(texts).toContain('message 2');
    expect(texts).not.toContain('message 3');
    expect(texts).not.toContain('message 4');
    expect(texts).not.toContain('message 5');
    expect(texts).not.toContain('message 6');
    // The title carried by the second `newpage` must not leak into the scene.
    expect(texts).not.toContain('A title for the');
    expect(texts).not.toContain('last page');
    // Single page ⇒ each participant header appears 2× (top + bottom).
    expect(texts.filter((t) => t === 'Alice').length).toBe(2);
    expect(texts.filter((t) => t === 'Bob').length).toBe(2);
    // And no dashed page-separator lines should be drawn.
    const dashedHLines = scene.children.filter(
      (s) =>
        s.type === 'line' &&
        (s as { y1: number; y2: number }).y1 === (s as { y1: number; y2: number }).y2 &&
        (s as { style?: { strokeDasharray?: string } }).style?.strokeDasharray === '4,4',
    );
    expect(dashedHLines.length).toBe(0);
  });

  it('renders ALL messages as one page when `ignore newpage` is set', () => {
    // `ignore newpage` overrides the default first-page-only truncation: every
    // `newpage` directive is silently skipped so the diagram becomes a single
    // continuous page with all messages.
    const scene = compile(
      [
        '@startuml',
        '',
        'ignore newpage',
        '',
        'Alice -> Bob : message 1',
        'Alice -> Bob : message 2',
        '',
        'newpage',
        '',
        'Alice -> Bob : message 3',
        'Alice -> Bob : message 4',
        '',
        'newpage A title for the\\nlast page',
        '',
        'Alice -> Bob : message 5',
        'Alice -> Bob : message 6',
        '@enduml',
      ].join('\n'),
    );
    const texts = scene.children
      .filter((s) => s.type === 'text')
      .map((s) => (s as { text: string }).text);
    expect(texts).toContain('message 1');
    expect(texts).toContain('message 2');
    expect(texts).toContain('message 3');
    expect(texts).toContain('message 4');
    expect(texts).toContain('message 5');
    expect(texts).toContain('message 6');
  });

  it('keeps the first-page truncation when `ignore newpage` is absent', () => {
    // Regression for Task #88: without `ignore newpage`, the first `newpage`
    // still stops the diagram, so only message 1 and 2 reach the scene.
    const scene = compile(
      [
        '@startuml',
        'Alice -> Bob : message 1',
        'Alice -> Bob : message 2',
        'newpage',
        'Alice -> Bob : message 3',
        '@enduml',
      ].join('\n'),
    );
    const texts = scene.children
      .filter((s) => s.type === 'text')
      .map((s) => (s as { text: string }).text);
    expect(texts).toContain('message 1');
    expect(texts).toContain('message 2');
    expect(texts).not.toContain('message 3');
  });

  it('renders `header` and `footer` directives as muted gray text', () => {
    const scene = compile(
      [
        '@startuml',
        'header Page Header',
        'title Example Title',
        'A -> B : x',
        'footer Page %page% of %lastpage%',
        '@enduml',
      ].join('\n'),
    );
    const texts = scene.children
      .filter((s) => s.type === 'text')
      .map((s) => s as { text: string; font?: { color?: string; size?: number } });
    const headerT = texts.find((t) => t.text === 'Page Header');
    expect(headerT).toBeDefined();
    expect(headerT!.font!.color).toBe('#999');
    const footerT = texts.find((t) => t.text === 'Page %page% of %lastpage%');
    expect(footerT).toBeDefined();
    expect(footerT!.font!.color).toBe('#999');
    // Title still renders
    expect(texts.find((t) => t.text === 'Example Title')).toBeDefined();
  });

  it('multi-level autonumber: increments last level + `inc A`/`inc B` reset below', () => {
    const scene = compile(
      [
        '@startuml',
        'autonumber 1.1.1',
        'A -> B : m1',
        'A -> B : m2',
        'autonumber inc A',
        'A -> B : m3',
        'A -> B : m4',
        'autonumber inc B',
        'A -> B : m5',
        'A -> B : m6',
        'autonumber inc A',
        'A -> B : m7',
        'autonumber inc B',
        'A -> B : m8',
        '@enduml',
      ].join('\n'),
    );
    const texts = scene.children
      .filter((s) => s.type === 'text')
      .map((s) => (s as { text: string }).text);
    expect(texts).toContain('1.1.1 m1');
    expect(texts).toContain('1.1.2 m2');
    expect(texts).toContain('2.1.1 m3');
    expect(texts).toContain('2.1.2 m4');
    expect(texts).toContain('2.2.1 m5');
    expect(texts).toContain('2.2.2 m6');
    expect(texts).toContain('3.1.1 m7');
    expect(texts).toContain('3.2.1 m8');
  });

  it('handles `autonumber stop` and `resume` (counter preserved across pauses)', () => {
    const scene = compile(
      [
        '@startuml',
        'autonumber 10 10 "<b>[000]"',
        'A -> B : Req',
        'A -> B : Resp',
        'autonumber stop',
        'A -> B : dummy',
        'autonumber resume "<font color=red><b>Message 0  "',
        'A -> B : R1',
        'A -> B : R2',
        'autonumber stop',
        'A -> B : dummy',
        'autonumber resume 1 "<font color=blue><b>Message 0  "',
        'A -> B : R3',
        'A -> B : R4',
        '@enduml',
      ].join('\n'),
    );
    const texts = scene.children
      .filter((s) => s.type === 'text')
      .map((s) => (s as { text: string }).text);
    expect(texts).toContain('[010]');
    expect(texts).toContain('[020]');
    expect(texts).toContain('Message 30  ');
    expect(texts).toContain('Message 40  ');
    expect(texts).toContain('Message 50  ');
    expect(texts).toContain('Message 51  '); // resume 1 ⇒ step=1 after this
    // Both `dummy` messages render without a prefix
    expect(texts.filter((t) => t === 'dummy').length).toBe(2);
  });

  it('auto-closes unclosed `<font>`/`<b>` in autonumber format so message label is unaffected', () => {
    // Regression: format strings like `<font color=red><b>Message 0 ` leave
    // both `<font>` and `<b>` open. The renderer must auto-close them at the
    // prefix/label boundary so the message label renders plain (not bold and
    // not colored).
    const scene = compile(
      [
        '@startuml',
        'autonumber 10 10 "<b>[000]"',
        'Bob -> Alice : Authentication Request',
        'Bob <- Alice : Authentication Response',
        'autonumber stop',
        'Bob -> Alice : dummy',
        'autonumber resume "<font color=red><b>Message 0 "',
        'Bob -> Alice : Yet another authentication Request',
        'Bob <- Alice : Yet another authentication Response',
        'autonumber stop',
        'Bob -> Alice : dummy',
        'autonumber resume 1 "<font color=blue><b>Message 0 "',
        'Bob -> Alice : Yet another authentication Request',
        'Bob <- Alice : Yet another authentication Response',
        '@enduml',
      ].join('\n'),
    );
    const texts = scene.children
      .filter((s) => s.type === 'text')
      .map((s) => s as { text: string; font?: { weight?: string; color?: string } });

    // The colored+bold prefix segments themselves stay styled.
    const redPrefix = texts.find((t) => t.text === 'Message 30 ');
    expect(redPrefix).toBeDefined();
    expect(redPrefix!.font!.weight).toBe('bold');
    expect(redPrefix!.font!.color).toBe('red');

    const bluePrefix = texts.find((t) => t.text === 'Message 50 ');
    expect(bluePrefix).toBeDefined();
    expect(bluePrefix!.font!.weight).toBe('bold');
    expect(bluePrefix!.font!.color).toBe('blue');

    // Crucially, the message label that follows each colored/bold prefix must
    // NOT inherit those styles — it should be plain black with normal weight.
    const labelsAfterColored = [
      ' Yet another authentication Request',
      ' Yet another authentication Response',
    ];
    for (const label of labelsAfterColored) {
      const matches = texts.filter((t) => t.text === label);
      expect(matches.length).toBeGreaterThan(0);
      for (const m of matches) {
        expect(m.font!.weight).toBe('normal');
        expect(m.font!.color).toBe('#000');
      }
    }
  });

  it('formats autonumber prefix with `0`/`#` padding and HTML-like markup', () => {
    const scene = compile(
      [
        '@startuml',
        'autonumber "<b>[000]"',
        'A -> B : Hello',
        'autonumber 15 "<b>(<u>##</u>)"',
        'A -> B : Two',
        'autonumber 40 10 "<font color=red><b>Message 0  "',
        'A -> B : Three',
        '@enduml',
      ].join('\n'),
    );
    const texts = scene.children
      .filter((s) => s.type === 'text')
      .map((s) => s as { text: string; font?: { weight?: string; color?: string } });

    // Zero-padded `[001]` is rendered in bold.
    const bold001 = texts.find((t) => t.text === '[001]');
    expect(bold001).toBeDefined();
    expect(bold001!.font!.weight).toBe('bold');

    // Message text after the closed prefix returns to normal weight.
    const helloMsg = texts.find((t) => t.text === ' Hello');
    expect(helloMsg).toBeDefined();
    expect(helloMsg!.font!.weight).toBe('normal');

    // `(##)` with 15 → bold `(`, underlined bold `15`, bold `)`.
    expect(texts.find((t) => t.text === '15')).toBeDefined();
    const underlines = scene.children.filter(
      (s) =>
        s.type === 'line' &&
        (s as { style: { stroke?: string } }).style.stroke === '#000',
    );
    expect(underlines.length).toBeGreaterThan(0);

    // `Message 0` start=40 step=10 → `Message 40` in red+bold.
    const redText = texts.find(
      (t) => t.text === 'Message 40  ' && t.font?.color === 'red',
    );
    expect(redText).toBeDefined();
    expect(redText!.font!.weight).toBe('bold');
  });

  it('applies per-message color directive to line and marker', () => {
    const scene = compile(
      [
        '@startuml',
        'Bob -[#red]> Alice : hi',
        'Alice -[#0000FF]-> Bob : ok',
        '@enduml',
      ].join('\n'),
    );
    const redLine = scene.children.find(
      (s) =>
        s.type === 'line' &&
        (s as { style: { stroke?: string } }).style.stroke === 'red',
    );
    const redTriangle = scene.children.find(
      (s) =>
        s.type === 'polygon' &&
        (s as { style: { fill?: string } }).style.fill === 'red',
    );
    expect(redLine).toBeTruthy();
    expect(redTriangle).toBeTruthy();

    const blueLine = scene.children.find(
      (s) =>
        s.type === 'line' &&
        (s as { style: { stroke?: string } }).style.stroke === '#0000FF',
    );
    const blueTriangle = scene.children.find(
      (s) =>
        s.type === 'polygon' &&
        (s as { style: { fill?: string } }).style.fill === '#0000FF',
    );
    expect(blueLine).toBeTruthy();
    expect(blueTriangle).toBeTruthy();
  });

  it('mirrors self-message to the LEFT for reverse arrow (`A <- A`)', () => {
    const forward = compile('@startuml\nAlice -> Alice: hello\n@enduml');
    const reverse = compile('@startuml\nAlice <- Alice: hello\n@enduml');

    // Forward case: lifeline at lower x, loop extends to the right
    const fwdPolyline = forward.children.find((s) => s.type === 'polyline') as {
      points: [number, number][];
    } | undefined;
    expect(fwdPolyline).toBeDefined();
    const fwdLifelineX = fwdPolyline!.points[0]![0];
    const fwdLoopEndX = fwdPolyline!.points[1]![0];
    expect(fwdLoopEndX).toBeGreaterThan(fwdLifelineX);

    // Reverse case: loop extends to the LEFT of the lifeline
    const revPolyline = reverse.children.find((s) => s.type === 'polyline') as {
      points: [number, number][];
    } | undefined;
    expect(revPolyline).toBeDefined();
    const revLifelineX = revPolyline!.points[0]![0];
    const revLoopEndX = revPolyline!.points[1]![0];
    expect(revLoopEndX).toBeLessThan(revLifelineX);

    // Reverse case: the participant box shifted to the right to make room
    // for the left-side label/loop. Lifeline x of reverse > forward.
    expect(revLifelineX).toBeGreaterThan(fwdLifelineX);

    // Reverse text uses anchor='end' so it extends leftward from the lifeline.
    const revHelloText = reverse.children.find(
      (s) => s.type === 'text' && (s as { text: string }).text === 'hello',
    ) as { anchor?: string };
    expect(revHelloText.anchor).toBe('end');
  });

  it('renders multi-line regular-message label stacked above the arrow', () => {
    const scene = compile('@startuml\nA -> B: alpha\\nbeta\n@enduml');
    const texts = scene.children
      .filter((s) => s.type === 'text')
      .map((s) => (s as { text: string }).text);
    expect(texts).toContain('alpha');
    expect(texts).toContain('beta');
  });

  it('per-message `++` activates target, auto-declares new lanes, colors bar', () => {
    const scene = compile(
      [
        '@startuml',
        'alice -> bob ++ : hello',
        'bob -> bob ++ : self call',
        'bob -> bib ++  #005500 : hello',
        'bob -> george ** : create',
        'return done',
        'return rc',
        'bob -> george !! : delete',
        'return success',
        '@enduml',
      ].join('\n'),
    );
    const texts = scene.children
      .filter((s) => s.type === 'text')
      .map((s) => (s as { text: string }).text);
    // Four participants in declared order: alice, bob, bib, george.
    // All four get a top + bottom header. george additionally has a
    // created-late top header drawn at its create message y, so it appears
    // three times.
    expect(texts.filter((t) => t === 'alice').length).toBe(2);
    expect(texts.filter((t) => t === 'bob').length).toBe(2);
    expect(texts.filter((t) => t === 'bib').length).toBe(2);
    expect(texts.filter((t) => t === 'george').length).toBe(2);
    // Arrow labels render
    expect(texts).toContain('hello');
    expect(texts).toContain('self call');
    expect(texts).toContain('create');
    expect(texts).toContain('done');
    expect(texts).toContain('rc');
    expect(texts).toContain('delete');
    expect(texts).toContain('success');

    // Activation bars: three `++` messages each push a frame. The three
    // returns each pop one. So at least 3 activation rects render.
    const actRects = scene.children.filter(
      (s) =>
        s.type === 'rect' &&
        ((s as { style: { fill?: string } }).style.fill === '#ffffff' ||
          (s as { style: { fill?: string } }).style.fill === '#005500'),
    );
    expect(actRects.length).toBeGreaterThanOrEqual(3);
    // At least one dark-green activation bar (from the `bob -> bib ++ #005500` line).
    const greenAct = scene.children.find(
      (s) =>
        s.type === 'rect' &&
        (s as { style: { fill?: string } }).style.fill === '#005500',
    );
    expect(greenAct).toBeTruthy();
    // The dark-green arrow line is present too.
    const greenLine = scene.children.find(
      (s) =>
        s.type === 'line' &&
        (s as { style: { stroke?: string } }).style.stroke === '#005500',
    );
    expect(greenLine).toBeTruthy();
    // Destroy marker — red X (two crossing strokes) on george.
    const redLines = scene.children.filter(
      (s) =>
        s.type === 'line' &&
        (s as { style: { stroke?: string } }).style.stroke === '#a00',
    );
    expect(redLines.length).toBe(2);
    // Three dashed return arrows — two cross-lane (return done: bib→bob,
    // return success: bob→alice) drawn as `line` shapes, plus one self-return
    // (return rc: bob→bob self-call pop) drawn as a `polyline` loop.
    const dashedLines = scene.children.filter(
      (s) =>
        s.type === 'line' &&
        (s as { style: { strokeDasharray?: string } }).style.strokeDasharray === '5,3',
    );
    expect(dashedLines.length).toBeGreaterThanOrEqual(2);
    const dashedPolys = scene.children.filter(
      (s) =>
        s.type === 'polyline' &&
        (s as { style: { strokeDasharray?: string } }).style.strokeDasharray === '5,3',
    );
    expect(dashedPolys.length).toBeGreaterThanOrEqual(1);
  });

  it('autoactivate + return + create + destroy: full thread-call diagram', () => {
    const scene = compile(
      [
        '@startuml',
        'autoactivate on',
        'alice -> bob : hello',
        'bob -> bob : self call',
        'bill -> bob #005500 : hello from thread 2',
        'bob -> george ** : create',
        'return done in thread 2',
        'return rc',
        'bob -> george !! : delete',
        'return success',
        '@enduml',
      ].join('\n'),
    );
    const texts = scene.children
      .filter((s) => s.type === 'text')
      .map((s) => (s as { text: string }).text);
    // All four participants appear (each twice — top + bottom header). george
    // is created mid-diagram and destroyed, but per PlantUML the bottom
    // header is still drawn for destroyed participants, so it also appears
    // twice (created-late top header + bottom header).
    expect(texts.filter((t) => t === 'alice').length).toBe(2);
    expect(texts.filter((t) => t === 'bob').length).toBe(2);
    expect(texts.filter((t) => t === 'bill').length).toBe(2);
    expect(texts.filter((t) => t === 'george').length).toBe(2);
    // Arrow labels render
    expect(texts).toContain('hello');
    expect(texts).toContain('self call');
    expect(texts).toContain('hello from thread 2');
    expect(texts).toContain('create');
    expect(texts).toContain('done in thread 2');
    expect(texts).toContain('rc');
    expect(texts).toContain('delete');
    expect(texts).toContain('success');
    // The `#005500` arrow line is rendered in that color.
    const greenLine = scene.children.find(
      (s) =>
        s.type === 'line' &&
        (s as { style: { stroke?: string } }).style.stroke === '#005500',
    );
    expect(greenLine).toBeTruthy();
    // The autoactivate bar created by that message is also dark green.
    const greenAct = scene.children.find(
      (s) =>
        s.type === 'rect' &&
        (s as { style: { fill?: string } }).style.fill === '#005500',
    );
    expect(greenAct).toBeTruthy();
    // Default autoactivate bars are white.
    const whiteAct = scene.children.find(
      (s) =>
        s.type === 'rect' &&
        (s as { style: { fill?: string } }).style.fill === '#ffffff',
    );
    expect(whiteAct).toBeTruthy();
    // Destroy marker — red X (two crossing strokes).
    const redLines = scene.children.filter(
      (s) =>
        s.type === 'line' &&
        (s as { style: { stroke?: string; strokeWidth?: number } }).style.stroke === '#a00',
    );
    expect(redLines.length).toBe(2);
    // Return arrows are dashed.
    const dashedReturns = scene.children.filter(
      (s) =>
        s.type === 'line' &&
        (s as { style: { strokeDasharray?: string } }).style.strokeDasharray === '5,3',
    );
    expect(dashedReturns.length).toBeGreaterThanOrEqual(3);
  });

  it('renders `participant X [...]` block with sections (bold title + mono + divider)', () => {
    const scene = compile(
      [
        '@startuml',
        'participant P [',
        '    =Title',
        '    ----',
        '    ""SubTitle""',
        ']',
        'participant Bob',
        'P -> Bob',
        '@enduml',
      ].join('\n'),
    );
    const texts = scene.children
      .filter((s) => s.type === 'text')
      .map((s) => s as { text: string; font: { weight?: string; family?: string } });
    const titleText = texts.find((t) => t.text === 'Title');
    const subTitleText = texts.find((t) => t.text === 'SubTitle');
    expect(titleText).toBeDefined();
    expect(titleText!.font.weight).toBe('bold');
    expect(subTitleText).toBeDefined();
    expect(subTitleText!.font.family).toBe('monospace');
    // Divider line drawn between sections — solid black line spanning the box
    const lines = scene.children.filter((s) => s.type === 'line');
    const dividers = lines.filter(
      (l) =>
        (l as { style: { stroke?: string; strokeDasharray?: string } }).style.stroke === '#222' &&
        !(l as { style: { strokeDasharray?: string } }).style.strokeDasharray,
    );
    expect(dividers.length).toBeGreaterThan(0);
  });

  it('fills `participant X [...]` block with the same default beige as a plain participant', () => {
    // Regression: the sectioned (multi-line) participant header used to render
    // with a hard-coded gray fill (`#e2e2f0`), giving it a different look from
    // the regular participant on the same diagram. PlantUML uses the same
    // beige (`#fefece`) default for both forms.
    const scene = compile(
      [
        '@startuml',
        'participant Participant [',
        '=Title',
        '----',
        '""SubTitle""',
        ']',
        'participant Bob',
        'Participant -> Bob',
        '@enduml',
      ].join('\n'),
    );
    const rects = scene.children.filter((s) => s.type === 'rect') as Array<{
      style: { fill?: string };
    }>;
    const beigeRects = rects.filter((r) => (r.style.fill ?? '').toLowerCase() === '#fefece');
    // Top + bottom header for Bob (2) and top + bottom header for the
    // sectioned Participant (2) = 4 beige fills.
    expect(beigeRects.length).toBeGreaterThanOrEqual(4);
    // And no gray sectioned rect should sneak through.
    const grayRects = rects.filter((r) => (r.style.fill ?? '').toLowerCase() === '#e2e2f0');
    expect(grayRects.length).toBe(0);
  });

  it('honours `skinparam participantBackgroundColor` for `participant X [...]` sectioned headers', () => {
    const scene = compile(
      [
        '@startuml',
        'skinparam participantBackgroundColor #ADD8E6',
        'participant P [',
        '=Title',
        '----',
        '""SubTitle""',
        ']',
        'participant Bob',
        'P -> Bob',
        '@enduml',
      ].join('\n'),
    );
    const rects = scene.children.filter((s) => s.type === 'rect') as Array<{
      style: { fill?: string };
    }>;
    const skinRects = rects.filter((r) => (r.style.fill ?? '').toUpperCase() === '#ADD8E6');
    expect(skinRects.length).toBeGreaterThanOrEqual(2);
  });
});

describe('sequence layout — found/lost (boundary) messages', () => {
  const SRC = [
    '@startuml',
    '[-> Bob',
    '[o-> Bob',
    '[o->o Bob',
    '[x-> Bob',
    '',
    '[<- Bob',
    '[x<- Bob',
    '',
    'Bob ->]',
    'Bob ->o]',
    'Bob o->o]',
    'Bob ->x]',
    '',
    'Bob <-]',
    'Bob x<-]',
    '@enduml',
  ].join('\n');

  it('produces a single-lane diagram with Bob and renders all 12 messages', () => {
    const scene = compile(SRC);
    // Each message becomes a horizontal line at its own y. With 12 messages
    // we expect at least 12 message lines (other lines: lifeline, headers).
    const horizontalLines = scene.children.filter((s) => {
      if (s.type !== 'line') return false;
      const ln = s as { y1: number; y2: number };
      return ln.y1 === ln.y2;
    });
    expect(horizontalLines.length).toBeGreaterThanOrEqual(12);
    // Two header rects for Bob (top + bottom) plus possibly more.
    const rects = scene.children.filter((s) => s.type === 'rect');
    expect(rects.length).toBeGreaterThanOrEqual(2);
    // Bob's label appears in both the top and bottom header.
    const bobTexts = scene.children
      .filter((s) => s.type === 'text')
      .filter((s) => (s as { text: string }).text === 'Bob');
    expect(bobTexts.length).toBe(2);
  });

  it('keeps arrow geometry inside the diagram bounds', () => {
    const scene = compile(SRC);
    for (const s of scene.children) {
      if (s.type !== 'line') continue;
      const ln = s as { x1: number; x2: number };
      expect(ln.x1).toBeGreaterThanOrEqual(0);
      expect(ln.x2).toBeGreaterThanOrEqual(0);
      expect(ln.x1).toBeLessThanOrEqual(scene.width);
      expect(ln.x2).toBeLessThanOrEqual(scene.width);
    }
  });

  it('does not create a phantom `[` or `]` participant', () => {
    const scene = compile(SRC);
    const texts = scene.children
      .filter((s) => s.type === 'text')
      .map((s) => (s as { text: string }).text);
    expect(texts).not.toContain('[');
    expect(texts).not.toContain(']');
  });
});

describe('sequence layout — short (`?`) boundary messages + markup', () => {
  const SRC = [
    '@startuml',
    '?-> Alice    : ""?->""\\n**short** to actor1',
    '[-> Alice    : ""[->""\\n**from start** to actor1',
    '[-> Bob      : ""[->""\\n**from start** to actor2',
    '?-> Bob      : ""?->""\\n**short** to actor2',
    'Alice ->]    : ""->]""\\nfrom actor1 **to end**',
    'Alice ->?    : ""->?""\\n**short** from actor1',
    'Alice -> Bob : ""->"" \\nfrom actor1 to actor2',
    '@enduml',
  ].join('\n');

  it('renders Alice and Bob as the only two participants', () => {
    const scene = compile(SRC);
    // Headers draw the participant label as text. Filter Alice/Bob labels.
    const texts = scene.children
      .filter((s) => s.type === 'text')
      .map((s) => (s as { text: string }).text);
    expect(texts.filter((t) => t === 'Alice').length).toBeGreaterThanOrEqual(1);
    expect(texts.filter((t) => t === 'Bob').length).toBeGreaterThanOrEqual(1);
    // No phantom `?` participant header text.
    expect(texts).not.toContain('?');
  });

  it('renders seven message bodies (one per source line)', () => {
    const scene = compile(SRC);
    // Solid (non-dashed) horizontal lines = message bodies. Lifelines are
    // dashed; headers are vertical/rect edges, not single horizontal lines.
    const arrows = scene.children.filter((s) => {
      if (s.type !== 'line') return false;
      const ln = s as { y1: number; y2: number; style?: { strokeDasharray?: string } };
      return ln.y1 === ln.y2 && !ln.style?.strokeDasharray;
    });
    expect(arrows.length).toBe(7);
  });

  it('places short-boundary stubs near the participant lane, not at the diagram edges', () => {
    const scene = compile(SRC);
    const arrows = (
      scene.children.filter((s) => {
        if (s.type !== 'line') return false;
        const ln = s as { y1: number; y2: number; style?: { strokeDasharray?: string } };
        return ln.y1 === ln.y2 && !ln.style?.strokeDasharray;
      }) as Array<{ x1: number; x2: number; y1: number }>
    ).sort((a, b) => a.y1 - b.y1);
    // Sorted top-to-bottom matches source order:
    //   [0] ?-> Alice   (short-left)        — length 36
    //   [1] [-> Alice   (long-left)         — tail at edge
    //   [2] [-> Bob     (long-left)
    //   [3] ?-> Bob     (short-left)        — length 36, between Alice and Bob
    //   [4] Alice ->]   (long-right)        — head at edge
    //   [5] Alice ->?   (short-right)       — length 36, between Alice and Bob
    //   [6] Alice -> Bob
    const short0 = arrows[0]!;
    expect(Math.abs(short0.x2 - short0.x1)).toBeCloseTo(36, 0);

    const longLeft = arrows[1]!;
    // Long boundary's tail sits within a few px of the diagram's left edge.
    expect(longLeft.x1).toBeLessThan(20);

    const shortToBob = arrows[3]!;
    expect(Math.abs(shortToBob.x2 - shortToBob.x1)).toBeCloseTo(36, 0);
    // Short-to-Bob stub sits to the RIGHT of any long-to-left tail (i.e.,
    // it's in the inter-lane gap, not at the diagram edge).
    expect(shortToBob.x1).toBeGreaterThan(longLeft.x1 + 20);

    const longRight = arrows[4]!;
    // Long-right head sits within a few px of the diagram's right edge.
    expect(longRight.x2).toBeGreaterThan(scene.width - 20);

    const shortOutAlice = arrows[5]!;
    expect(Math.abs(shortOutAlice.x2 - shortOutAlice.x1)).toBeCloseTo(36, 0);
    // Short-out from Alice ends well before the diagram's right edge.
    expect(shortOutAlice.x2).toBeLessThan(scene.width - 40);
  });

  it('renders monospace `""..""` content (without the quote marks)', () => {
    const scene = compile(SRC);
    const monoTexts = scene.children
      .filter((s) => s.type === 'text')
      .filter((s) => {
        const t = s as { font?: { family?: string } };
        return t.font?.family === 'monospace';
      })
      .map((s) => (s as { text: string }).text);
    // Each label has a monospace head like `?->`, `[->`, `->]`, `->?`, `->`.
    // The `""` markers must NOT appear in the rendered text.
    expect(monoTexts).toContain('?->');
    expect(monoTexts).toContain('[->');
    expect(monoTexts).toContain('->]');
    expect(monoTexts).toContain('->?');
    expect(monoTexts.some((t) => t.includes('""'))).toBe(false);
  });

  it('renders `**bold**` spans in bold weight', () => {
    const scene = compile(SRC);
    const boldShort = scene.children
      .filter((s) => s.type === 'text')
      .find((s) => {
        const t = s as { text: string; font?: { weight?: string } };
        return t.text === 'short' && t.font?.weight === 'bold';
      });
    expect(boldShort).toBeTruthy();
  });
});

describe('sequence layout — `box ... end box`', () => {
  const BOX_SRC = [
    '@startuml',
    '',
    'box "Internal Service" #LightBlue',
    'participant Bob',
    'participant Alice',
    'end box',
    'participant Other',
    '',
    'Bob -> Alice : hello',
    'Alice -> Other : hello',
    '',
    '@enduml',
  ].join('\n');

  it('renders a LightBlue rectangle wrapping the boxed participants', () => {
    const scene = compile(BOX_SRC);
    const boxRect = scene.children.find(
      (s) =>
        s.type === 'rect' &&
        (s as { style?: { fill?: string } }).style?.fill === '#ADD8E6',
    );
    expect(boxRect).toBeTruthy();
  });

  it('renders the box title text "Internal Service" near the top-left of the rect', () => {
    const scene = compile(BOX_SRC);
    const titleText = scene.children.find(
      (s) =>
        s.type === 'text' &&
        (s as { text: string }).text === 'Internal Service',
    );
    expect(titleText).toBeTruthy();
    const boxRect = scene.children.find(
      (s) =>
        s.type === 'rect' &&
        (s as { style?: { fill?: string } }).style?.fill === '#ADD8E6',
    ) as { x: number; y: number; w: number; h: number } | undefined;
    expect(boxRect).toBeTruthy();
    const t = titleText as { x: number; y: number };
    // Title sits inside the box, near its top-left.
    expect(t.x).toBeGreaterThanOrEqual(boxRect!.x);
    expect(t.x).toBeLessThan(boxRect!.x + boxRect!.w / 2);
    expect(t.y).toBeGreaterThanOrEqual(boxRect!.y);
    expect(t.y).toBeLessThan(boxRect!.y + 40);
  });

  it('places `Other` outside the box (to the right of its right edge)', () => {
    const scene = compile(BOX_SRC);
    const boxRect = scene.children.find(
      (s) =>
        s.type === 'rect' &&
        (s as { style?: { fill?: string } }).style?.fill === '#ADD8E6',
    ) as { x: number; w: number } | undefined;
    expect(boxRect).toBeTruthy();
    const boxRight = boxRect!.x + boxRect!.w;
    // The Other header text is centered on its lane center; assert that center
    // is to the right of the box's right edge.
    const otherTexts = scene.children
      .filter((s) => s.type === 'text')
      .filter((s) => (s as { text: string }).text === 'Other') as Array<{ x: number }>;
    expect(otherTexts.length).toBeGreaterThan(0);
    for (const t of otherTexts) {
      expect(t.x).toBeGreaterThan(boxRight);
    }
  });
});

describe('sequence layout — skinparam theming + handwritten notice', () => {
  // Same fixture as the parser test — exercises background color, arrow color,
  // participant theme, actor theme, and the handwritten notice.
  const THEMED_SRC = [
    '@startuml',
    'skinparam backgroundColor #EEEBDC',
    'skinparam handwritten true',
    '',
    'skinparam sequence {',
    'ArrowColor DeepSkyBlue',
    'ActorBorderColor DeepSkyBlue',
    'LifeLineBorderColor blue',
    'LifeLineBackgroundColor #A9DCDF',
    '',
    'ParticipantBorderColor DeepSkyBlue',
    'ParticipantBackgroundColor DodgerBlue',
    'ParticipantFontName Impact',
    'ParticipantFontSize 17',
    'ParticipantFontColor #A9DCDF',
    '',
    'ActorBackgroundColor aqua',
    'ActorFontColor DeepSkyBlue',
    'ActorFontSize 17',
    'ActorFontName Aapex',
    '}',
    '',
    'actor User',
    'participant "First Class" as A',
    'participant "Second Class" as B',
    'participant "Last Class" as C',
    '',
    'User -> A: DoWork',
    'activate A',
    '',
    'A -> B: Create Request',
    'activate B',
    '',
    'B -> C: DoWork',
    'activate C',
    'C --> B: WorkDone',
    'destroy C',
    '',
    'B --> A: Request Created',
    'deactivate B',
    '',
    'A --> User: Done',
    'deactivate A',
    '',
    '@enduml',
  ].join('\n');

  it('places the background fill rect at the back of the children array', () => {
    const scene = compile(THEMED_SRC);
    const first = scene.children[0]!;
    expect(first.type).toBe('rect');
    expect((first as { style?: { fill?: string } }).style?.fill).toBe('#EEEBDC');
    // It covers the whole canvas — width matches scene.width.
    const r = first as { x: number; y: number; w: number; h: number };
    expect(r.x).toBe(0);
    expect(r.y).toBe(0);
    expect(r.w).toBe(scene.width);
    expect(scene.background).toBe('#EEEBDC');
  });

  it('applies DodgerBlue fill to participant header rectangles', () => {
    const scene = compile(THEMED_SRC);
    const fills = scene.children
      .filter((s) => s.type === 'rect')
      .map((s) => (s as { style?: { fill?: string } }).style?.fill);
    // DodgerBlue resolves to its CSS hex.
    expect(fills).toContain('#1E90FF');
  });

  it('strokes arrow lines with DeepSkyBlue from ArrowColor', () => {
    const scene = compile(THEMED_SRC);
    const lineStrokes = scene.children
      .filter((s) => s.type === 'line')
      .map((s) => (s as { style?: { stroke?: string } }).style?.stroke);
    // DeepSkyBlue → #00BFFF. At least one arrow line uses it.
    expect(lineStrokes).toContain('#00BFFF');
  });

  it('emits the handwritten notice text', () => {
    const scene = compile(THEMED_SRC);
    const texts = scene.children
      .filter((s) => s.type === 'text')
      .map((s) => (s as { text: string }).text);
    const notice = texts.find((t) => t.includes("!option handwritten true"));
    expect(notice).toBeDefined();
  });

  it('skips the handwritten notice when no skinparam handwritten directive', () => {
    const scene = compile('@startuml\nA -> B: hi\n@enduml');
    const texts = scene.children
      .filter((s) => s.type === 'text')
      .map((s) => (s as { text: string }).text);
    const notice = texts.find((t) => t.includes('!option handwritten'));
    expect(notice).toBeUndefined();
  });
});

describe('sequence layout — `<style>` blocks', () => {
  const STYLE_SRC = [
    '@startuml',
    '<style>',
    'lifeLine {',
    '  LineStyle 0',
    '}',
    'delay {',
    '  LineStyle 1-4',
    '}',
    '</style>',
    'Alice -> Bob : hello',
    '...',
    'Alice <- Bob : hello',
    '@enduml',
  ].join('\n');

  it('renders lifelines as solid lines when `lifeLine { LineStyle 0 }`', () => {
    const scene = compile(STYLE_SRC);
    // Lifelines stroke COLOR_LIFELINE (#666). Default would be dasharray '4,4';
    // LineStyle 0 means solid → no dasharray attribute at all.
    const lifelines = scene.children.filter(
      (s) =>
        s.type === 'line' &&
        (s as { style: { stroke?: string } }).style.stroke === '#666',
    );
    expect(lifelines.length).toBeGreaterThanOrEqual(2);
    for (const ll of lifelines) {
      const dash = (ll as { style: { strokeDasharray?: string } }).style.strokeDasharray;
      expect(dash).toBeUndefined();
    }
  });

  it('does not emit a horizontal delay line even when `delay { LineStyle ... }` is configured', () => {
    // PlantUML reference: `...` produces only a vertical gap. The style
    // override has no horizontal line to apply to.
    const scene = compile(STYLE_SRC);
    const delayLines = scene.children.filter(
      (s) =>
        s.type === 'line' &&
        (s as { style: { strokeDasharray?: string } }).style.strokeDasharray === '1,4',
    );
    expect(delayLines.length).toBe(0);
  });

  it('regression: without a style block, lifeline dasharray stays at default `4,4`', () => {
    const scene = compile('@startuml\nAlice -> Bob : hi\n@enduml');
    const lifelines = scene.children.filter(
      (s) =>
        s.type === 'line' &&
        (s as { style: { stroke?: string } }).style.stroke === '#666',
    );
    expect(lifelines.length).toBeGreaterThanOrEqual(2);
    for (const ll of lifelines) {
      const dash = (ll as { style: { strokeDasharray?: string } }).style.strokeDasharray;
      expect(dash).toBe('4,4');
    }
  });
});

describe('sequence layout — `hide unlinked`', () => {
  const HIDE_SRC = [
    '@startuml',
    'hide unlinked',
    'participant Alice',
    'participant Bob',
    'participant Carol',
    '',
    'Alice -> Bob : hello',
    '@enduml',
  ].join('\n');

  it('omits unreferenced participants from the rendered scene', () => {
    const scene = compile(HIDE_SRC);
    const texts = scene.children
      .filter((s) => s.type === 'text')
      .map((s) => (s as { text: string }).text);
    expect(texts).toContain('Alice');
    expect(texts).toContain('Bob');
    expect(texts).not.toContain('Carol');
  });

  it('shrinks the diagram width when an unreferenced trailing participant is hidden', () => {
    const sceneAll = compile(HIDE_SRC.replace('hide unlinked\n', ''));
    const sceneHide = compile(HIDE_SRC);
    expect(sceneHide.width).toBeLessThan(sceneAll.width);
  });

  it('removes a box entirely when all its members are unlinked', () => {
    const src = [
      '@startuml',
      'hide unlinked',
      'box "Internal" #LightBlue',
      'participant Ghost1',
      'participant Ghost2',
      'end box',
      'participant Alice',
      'participant Bob',
      '',
      'Alice -> Bob : hello',
      '@enduml',
    ].join('\n');
    const scene = compile(src);
    // The LightBlue box rect is gone because no surviving lane carries its id.
    const boxRect = scene.children.find(
      (s) =>
        s.type === 'rect' &&
        (s as { style?: { fill?: string } }).style?.fill === '#ADD8E6',
    );
    expect(boxRect).toBeUndefined();
    const texts = scene.children
      .filter((s) => s.type === 'text')
      .map((s) => (s as { text: string }).text);
    expect(texts).not.toContain('Ghost1');
    expect(texts).not.toContain('Ghost2');
    expect(texts).not.toContain('Internal');
    expect(texts).toContain('Alice');
    expect(texts).toContain('Bob');
  });
});

describe('sequence layout — `hide footbox`', () => {
  const FOOTBOX_SRC = [
    '@startuml',
    'skinparam actorStyle Hollow',
    'actor Alice',
    'actor Bob',
    'Alice -> Bob : hello',
    'hide footbox',
    '@enduml',
  ].join('\n');

  it('renders only the top actor head row when `hide footbox` is set', () => {
    const scene = compile(FOOTBOX_SRC);
    // Hollow head circles (r=6, white fill). 2 actors × 1 row = 2.
    const heads = scene.children.filter(
      (s) =>
        s.type === 'circle' &&
        (s as { style: { fill?: string } }).style.fill === '#FFFFFF' &&
        (s as { r: number }).r >= 6,
    );
    expect(heads.length).toBe(2);
  });

  it('renders both top and bottom rows by default', () => {
    const sceneDefault = compile(FOOTBOX_SRC.replace('hide footbox\n', ''));
    const headsDefault = sceneDefault.children.filter(
      (s) =>
        s.type === 'circle' &&
        (s as { style: { fill?: string } }).style.fill === '#FFFFFF' &&
        (s as { r: number }).r >= 6,
    );
    expect(headsDefault.length).toBe(4);
  });

  it('shrinks the diagram height when `hide footbox` is set', () => {
    const sceneDefault = compile(FOOTBOX_SRC.replace('hide footbox\n', ''));
    const sceneHide = compile(FOOTBOX_SRC);
    expect(sceneHide.height).toBeLessThan(sceneDefault.height);
  });
});

describe('sequence layout — `mainframe`', () => {
  it('renders an outer unfilled rect, a folded tab, and bold label text', () => {
    const scene = compile(
      '@startuml\nmainframe This is a **mainframe**\nAlice->Bob : Hello\n@enduml',
    );

    // 1) An outer rect with no fill spanning (nearly) the full diagram.
    const outerRects = scene.children.filter((s) => {
      if (s.type !== 'rect') return false;
      const r = s as { x: number; y: number; w: number; h: number; style?: { fill?: string } };
      return r.style?.fill === 'none' && r.w >= scene.width - 12 && r.h >= scene.height - 12;
    });
    expect(outerRects.length).toBeGreaterThanOrEqual(1);

    // 2) A polygon shape forming the folded tab (5 points: rect + corner fold).
    const tabPolygons = scene.children.filter((s) => {
      if (s.type !== 'polygon') return false;
      const p = s as { points: Array<[number, number]> };
      // Mainframe tab anchors at the very top-left corner (within FRAME_PAD).
      return p.points.length === 5 && p.points[0]![0] < 10 && p.points[0]![1] < 10;
    });
    expect(tabPolygons.length).toBeGreaterThanOrEqual(1);

    // 3) A text shape `mainframe` rendered with bold weight (the **…** span).
    const boldMainframe = scene.children.find(
      (s) =>
        s.type === 'text' &&
        (s as { text: string }).text === 'mainframe' &&
        (s as { font?: { weight?: string } }).font?.weight === 'bold',
    );
    expect(boldMainframe).toBeDefined();

    // 4) Alice / Bob participants sit BELOW the tab's bottom edge.
    const tabBottomY = (tabPolygons[0] as { points: Array<[number, number]> }).points[3]![1];
    const aliceText = scene.children.find(
      (s) => s.type === 'text' && (s as { text: string }).text === 'Alice',
    );
    const bobText = scene.children.find(
      (s) => s.type === 'text' && (s as { text: string }).text === 'Bob',
    );
    expect(aliceText).toBeDefined();
    expect(bobText).toBeDefined();
    expect((aliceText as { y: number }).y).toBeGreaterThan(tabBottomY);
    expect((bobText as { y: number }).y).toBeGreaterThan(tabBottomY);
  });

  it('does not emit a mainframe rect when the directive is absent', () => {
    const scene = compile('@startuml\nAlice->Bob : Hello\n@enduml');
    const outerRects = scene.children.filter((s) => {
      if (s.type !== 'rect') return false;
      const r = s as { w: number; h: number; style?: { fill?: string } };
      return r.style?.fill === 'none' && r.w >= scene.width - 12 && r.h >= scene.height - 12;
    });
    expect(outerRects.length).toBe(0);
  });

  it('places shorthand `note left`/`note right` adjacent to the preceding message arrow and wraps long single-line block-note bodies', () => {
    // Regression for the canonical PlantUML note sample: notes attached via
    // the shorthand `note left` / `note right` form must hug the previous
    // message's arrow (no big vertical gap), and a long single-line block
    // note must wrap onto multiple text shapes instead of one extra-wide
    // line.
    const src = [
      '@startuml',
      'Alice->Bob : hello',
      'note left: this is a first note',
      'Bob->Alice : ok',
      'note right: this is another note',
      'Bob->Bob : I am thinking',
      'note left',
      'a note can also be defined on several lines',
      'end note',
      '@enduml',
    ].join('\n');
    const scene = compile(src);

    // Inter-lane messages render as horizontal lines spanning >= ~half the
    // diagram. Pick those out and identify the two we care about by label.
    type Line = { type: 'line'; x1: number; y1: number; x2: number; y2: number };
    type Text = { type: 'text'; x: number; y: number; text: string };
    const lines = scene.children.filter((s) => s.type === 'line') as Line[];
    const texts = scene.children.filter((s) => s.type === 'text') as Text[];

    // Y of the `hello` arrow body: a line whose y matches the `hello` label.
    const helloLabel = texts.find((t) => t.text === 'hello');
    expect(helloLabel).toBeDefined();
    const helloArrow = lines.find(
      (l) =>
        Math.abs(l.x2 - l.x1) > 40 &&
        l.y1 === l.y2 &&
        Math.abs(l.y1 - helloLabel!.y) < 10,
    );
    expect(helloArrow).toBeDefined();

    const okLabel = texts.find((t) => t.text === 'ok');
    expect(okLabel).toBeDefined();
    const okArrow = lines.find(
      (l) =>
        Math.abs(l.x2 - l.x1) > 40 &&
        l.y1 === l.y2 &&
        Math.abs(l.y1 - okLabel!.y) < 10,
    );
    expect(okArrow).toBeDefined();

    // Notes are folded polygons filled with the default note yellow.
    type Polygon = { type: 'polygon'; points: Array<[number, number]>;
                     style?: { fill?: string } };
    const notes = (scene.children.filter((s) => s.type === 'polygon') as Polygon[])
      .filter((p) => p.style?.fill === '#fbfb77');
    expect(notes.length).toBe(3);
    // Sort notes top-to-bottom; their order matches the source order.
    const noteY = (p: Polygon): number => Math.min(...p.points.map((pt) => pt[1]));
    const sortedNotes = notes.slice().sort((a, b) => noteY(a) - noteY(b));
    const note1Top = noteY(sortedNotes[0]!);
    const note2Top = noteY(sortedNotes[1]!);

    // The first note must be within ~30 px of the hello arrow's y.
    expect(Math.abs(note1Top - helloArrow!.y1)).toBeLessThanOrEqual(30);
    // The second note must be within ~30 px of the ok arrow's y.
    expect(Math.abs(note2Top - okArrow!.y1)).toBeLessThanOrEqual(30);

    // The long block-note line "a note can also be defined on several lines"
    // exceeds MAX_NOTE_W and must wrap to two or more text shapes. The
    // wrapped pieces are emitted as separate text shapes for the third note.
    const note3Bottom = Math.max(
      ...sortedNotes[2]!.points.map((pt) => pt[1]),
    );
    const note3Top = noteY(sortedNotes[2]!);
    // Text shapes whose y falls inside note 3's bbox.
    const note3Texts = texts.filter(
      (t) => t.y >= note3Top - 1 && t.y <= note3Bottom + 1,
    );
    expect(note3Texts.length).toBeGreaterThanOrEqual(2);
    // The original 43-char line must NOT appear verbatim — it was wrapped.
    expect(
      note3Texts.every(
        (t) => t.text !== 'a note can also be defined on several lines',
      ),
    ).toBe(true);
  });

  it('renders an rnote block whose opener carries the first body line', () => {
    const scene = compile(
      [
        '@startuml',
        'caller -> server : conReq',
        'rnote over server "r" as rectangle',
        '"h" as hexagon',
        'endrnote',
        '@enduml',
      ].join('\n'),
    );
    const noteFill = '#fbfb77';
    // rnote → plain rectangle (NOT a polygon).
    const plainRects = scene.children.filter(
      (s) =>
        s.type === 'rect' &&
        (s as { style: { fill?: string } }).style.fill === noteFill,
    );
    expect(plainRects.length).toBe(1);
    const texts = scene.children
      .filter((s) => s.type === 'text')
      .map((s) => (s as { text: string }).text);
    // Both lines of the body must render literally.
    expect(texts).toContain('"r" as rectangle');
    expect(texts).toContain('"h" as hexagon');
  });

  it('grows the diagram so a wide `note over <outer lane>` is not clipped on either side', () => {
    // Repro for the "clipped hnote" bug: an hnote/rnote block whose body
    // is wider than its target lane's header was rendered with a negative x
    // because the diagram width / left margin was computed without
    // considering the note's bbox. The last `hnote over caller` here is the
    // critical case — its body "this is on several lines" overflows lane 0
    // (caller) by ~50px on each side, so it must push the left margin out
    // for the leading text to stay visible.
    const scene = compile(
      [
        '@startuml',
        'caller -> server : conReq',
        'hnote over caller : idle',
        'caller <- server : conConf',
        'rnote over server "r" as rectangle',
        '"h" as hexagon',
        'endrnote',
        'rnote over server',
        'this is on several lines',
        'endrnote',
        'hnote over caller',
        'this is on several lines',
        'endhnote',
        '@enduml',
      ].join('\n'),
    );
    const texts = scene.children.filter(
      (s) => s.type === 'text',
    ) as Array<{ text: string; x: number }>;
    // Both multi-line bodies must appear in full (no clipping).
    const overflowingLines = texts.filter(
      (t) => t.text === 'this is on several lines',
    );
    expect(overflowingLines.length).toBe(2);
    // Every text shape sits inside the diagram (x >= 0). Before the fix the
    // hnote text was at x ≈ -38, clipped past the SVG's left edge.
    for (const t of texts) {
      expect(t.x).toBeGreaterThanOrEqual(0);
    }
    // Every drawn shape's bbox must fit inside the diagram width.
    for (const s of scene.children) {
      if (s.type === 'rect') {
        expect(s.x).toBeGreaterThanOrEqual(0);
        expect(s.x + s.w).toBeLessThanOrEqual(scene.width + 0.5);
      } else if (s.type === 'polygon' || s.type === 'polyline') {
        for (const [px] of (s as { points: [number, number][] }).points) {
          expect(px).toBeGreaterThanOrEqual(0);
          expect(px).toBeLessThanOrEqual(scene.width + 0.5);
        }
      }
    }
  });

  it('`/` directive aligns the following note to the previous note\'s y', () => {
    const scene = compile(
      [
        '@startuml',
        'note over Alice : initial state of Alice',
        '/',
        'note over Bob : initial state of Bob',
        'Bob -> Alice : hello',
        '@enduml',
      ].join('\n'),
    );
    // Two notes → two folded-rectangle polygons (default `note` shape).
    const notePolys = scene.children.filter(
      (s) =>
        s.type === 'polygon' &&
        (s as { style: { fill?: string } }).style.fill === '#fbfb77' &&
        (s as { points: [number, number][] }).points.length === 5,
    ) as Array<{ points: [number, number][] }>;
    expect(notePolys.length).toBe(2);
    const topY = (p: { points: [number, number][] }): number =>
      Math.min(...p.points.map((pt) => pt[1]));
    const ys = notePolys.map(topY).sort((a, b) => a - b);
    // Same y coordinate for both notes (within 1px tolerance).
    expect(Math.abs(ys[0]! - ys[1]!)).toBeLessThan(1);
    // Both note labels must render in full (no clipping).
    const texts = scene.children
      .filter((s) => s.type === 'text')
      .map((s) => (s as { text: string }).text);
    expect(texts).toContain('initial state of Alice');
    expect(texts).toContain('initial state of Bob');
  });

  it('`/` directive keeps a horizontal gap between two side-by-side notes', () => {
    // Regression: long-text `note over A` / `note over B` whose natural bboxes
    // overlap horizontally must not visually merge into one rectangle. The
    // second note is shifted right so its left edge sits at least a few px
    // past the first note's right edge.
    const scene = compile(
      [
        '@startuml',
        'note over Alice : initial state of Alice',
        '/',
        'note over Bob : initial state of Bob',
        'Bob -> Alice : hello',
        '@enduml',
      ].join('\n'),
    );
    const notePolys = scene.children.filter(
      (s) =>
        s.type === 'polygon' &&
        (s as { style: { fill?: string } }).style.fill === '#fbfb77' &&
        (s as { points: [number, number][] }).points.length === 5,
    ) as Array<{ points: [number, number][] }>;
    expect(notePolys.length).toBe(2);
    const xs = (p: { points: [number, number][] }): { min: number; max: number } => {
      const px = p.points.map((pt) => pt[0]);
      return { min: Math.min(...px), max: Math.max(...px) };
    };
    const boxes = notePolys
      .map(xs)
      .sort((a, b) => a.min - b.min);
    // ≥ 4 px gap between the first note's right edge and the second's left.
    expect(boxes[1]!.min - boxes[0]!.max).toBeGreaterThanOrEqual(4);
    // Both notes still sit inside the diagram width — the right-bleed pass
    // must have grown the diagram to fit the shifted second note.
    for (const b of boxes) {
      expect(b.min).toBeGreaterThanOrEqual(0);
      expect(b.max).toBeLessThanOrEqual(scene.width + 0.5);
    }
  });

  it('renders `== title ==` divider with TWO parallel horizontal lines', () => {
    // Regression: the `==` divider used to emit a single horizontal rule.
    // PlantUML's reference output draws it as a double rule (matching the
    // doubled `==` syntax). Each divider block must produce EXACTLY two
    // full-width horizontal lines sharing a common midpoint.
    const scene = compile(
      [
        '@startuml',
        '== Initialization ==',
        'Alice -> Bob: Authentication Request',
        'Bob --> Alice: Authentication Response',
        '== Repetition ==',
        'Alice -> Bob: Another authentication Request',
        'Alice <-- Bob: another authentication Response',
        '@enduml',
      ].join('\n'),
    );
    type LineShape = {
      type: 'line';
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      style: { stroke?: string; strokeDasharray?: string };
    };
    // Both divider labels are present.
    const texts = scene.children
      .filter((s) => s.type === 'text')
      .map((s) => (s as { text: string }).text);
    expect(texts).toContain('Initialization');
    expect(texts).toContain('Repetition');
    // Divider rect: solid fill (#dddddd), spans most of the width.
    const dividerRects = scene.children.filter(
      (s) =>
        s.type === 'rect' &&
        ((s as { style: { fill?: string } }).style.fill ?? '').toLowerCase() === '#dddddd',
    ) as Array<{ y: number; h: number }>;
    expect(dividerRects.length).toBe(2);
    // For each divider rect, count full-width horizontal lines at its mid-y
    // (the two parallel rules of the `==` double-line). They should be
    // straight horizontal (y1 === y2) and span well past the rect itself.
    const horizLines = scene.children.filter(
      (s) =>
        s.type === 'line' &&
        (s as LineShape).y1 === (s as LineShape).y2 &&
        !(s as LineShape).style.strokeDasharray,
    ) as LineShape[];
    for (const rect of dividerRects) {
      const midY = rect.y + rect.h / 2;
      // Lines whose y sits within the rect's vertical extent are the divider
      // rules (the lifeline-crossing arrows live well outside that band).
      const rules = horizLines.filter(
        (l) => Math.abs(l.y1 - midY) <= rect.h / 2 && l.x2 - l.x1 > 100,
      );
      expect(rules.length).toBe(2);
      // The two rules straddle the midline (one above, one below).
      const ys = rules.map((l) => l.y1).sort((a, b) => a - b);
      expect(ys[0]!).toBeLessThan(midY);
      expect(ys[1]!).toBeGreaterThan(midY);
    }
  });
});

describe('sequence layout — stereotype markup + standalone destroy', () => {
  const SRC = [
    '@startuml',
    'participant User',
    'User -> A: DoWork',
    'activate A',
    'A -> B: << createRequest >>',
    'activate B',
    'B -> C: DoWork',
    'activate C',
    'C --> B: WorkDone',
    'destroy C',
    'B --> A: RequestCreated',
    'deactivate B',
    'A -> User: Done',
    'deactivate A',
    '@enduml',
  ].join('\n');

  it('renders the `<< createRequest >>` message label as italic guillemets', () => {
    const scene = compile(SRC);
    const texts = scene.children
      .filter((s) => s.type === 'text') as Array<{ text: string; font?: { style?: string } }>;
    const guillemet = texts.find((t) => t.text === '«createRequest»');
    expect(guillemet).toBeDefined();
    expect(guillemet!.font?.style).toBe('italic');
    // No text node leaks the raw `<<` / `>>` source as a literal `<>`.
    const literalAngle = texts.find((t) => t.text === '<>');
    expect(literalAngle).toBeUndefined();
  });

  it('draws a red X marker on C\'s lifeline for standalone `destroy C`', () => {
    const scene = compile(SRC);
    const redLines = scene.children.filter(
      (s) =>
        s.type === 'line' &&
        (s as { style: { stroke?: string } }).style.stroke === '#a00',
    );
    // Two crossing strokes form the X.
    expect(redLines.length).toBe(2);
  });

  it("truncates C's lifeline at the destroy point but keeps the bottom header", () => {
    const scene = compile(SRC);
    // Find the red X y-coordinate.
    const redLines = scene.children.filter(
      (s) =>
        s.type === 'line' &&
        (s as { style: { stroke?: string } }).style.stroke === '#a00',
    ) as Array<{ y1: number; y2: number }>;
    const xCenterY = (redLines[0]!.y1 + redLines[0]!.y2) / 2;

    // Destroyed participants STILL get a bottom header (PlantUML standard) —
    // C has BOTH top and bottom headers.
    const texts = scene.children
      .filter((s) => s.type === 'text') as Array<{ text: string; y: number }>;
    const cTexts = texts.filter((t) => t.text === 'C');
    expect(cTexts.length).toBe(2);

    // Other participants also get both top and bottom headers.
    expect(texts.filter((t) => t.text === 'User').length).toBe(2);
    expect(texts.filter((t) => t.text === 'A').length).toBe(2);
    expect(texts.filter((t) => t.text === 'B').length).toBe(2);

    // The dashed lifeline for C does not extend past the destroy point.
    // Match the lifeline by x ≈ C's top-header text x (centered text on lane
    // center). All other lanes will have different x positions.
    const cTextTop = cTexts.reduce((a, b) => (a.y < b.y ? a : b));
    const cX = (cTextTop as unknown as { x: number }).x;
    const dashedVerticals = scene.children.filter(
      (s) =>
        s.type === 'line' &&
        (s as { x1: number; x2: number }).x1 === (s as { x1: number; x2: number }).x2 &&
        (s as { style: { strokeDasharray?: string } }).style.strokeDasharray !== undefined,
    ) as Array<{ x1: number; y1: number; y2: number }>;
    const cLaneLines = dashedVerticals.filter((l) => Math.abs(l.x1 - cX) < 2);
    expect(cLaneLines.length).toBeGreaterThan(0);
    // Lifeline must terminate at or before destroy y (plus a small slack
    // matching diedY = markY + 8).
    for (const l of cLaneLines) {
      expect(l.y2).toBeLessThanOrEqual(xCenterY + 12);
    }
    // The OTHER lanes' lifelines extend well past the destroy y.
    const otherLanes = dashedVerticals.filter((l) => Math.abs(l.x1 - cX) >= 2);
    expect(otherLanes.length).toBeGreaterThan(0);
    expect(otherLanes.some((l) => l.y2 > xCenterY + 30)).toBe(true);
  });
});

describe('sequence layout — `activate X #color` colored bars', () => {
  it('fills the activation bar with the color from `activate A #FFBBBB`', () => {
    const src = [
      '@startuml',
      'participant User',
      'User -> A: DoWork',
      'activate A #FFBBBB',
      'A -> A: Internal call',
      'activate A #DarkSalmon',
      'A -> B: << createRequest >>',
      'activate B',
      'B --> A: RequestCreated',
      'deactivate B',
      'deactivate A',
      'A -> User: Done',
      'deactivate A',
      '@enduml',
    ].join('\n');
    const scene = compile(src);
    const rectFills = scene.children
      .filter((s) => s.type === 'rect')
      .map((s) => (s as { style?: { fill?: string } }).style?.fill);
    // At least one activation bar uses the #FFBBBB fill.
    expect(rectFills).toContain('#FFBBBB');
    // The second `activate A #DarkSalmon` directive should also tint a bar.
    // We keep the raw token here — layout stores stmt.color verbatim — and
    // assert it appears as the fill on at least one rect.
    expect(rectFills).toContain('#DarkSalmon');
  });
});

describe('sequence layout — destroyed participant still gets bottom header', () => {
  it('keeps the bottom header for `bob -> george !!` destroy', () => {
    const src = [
      '@startuml',
      'autoactivate on',
      'alice -> bob : hello',
      'bob -> bob : self call',
      'bill -> bob #005500 : hello from thread 2',
      'bob -> george ** : create',
      'return done in thread 2',
      'return rc',
      'bob -> george !! : delete',
      'return success',
      '@enduml',
    ].join('\n');
    const scene = compile(src);
    const texts = scene.children
      .filter((s) => s.type === 'text') as Array<{ text: string; y: number; x: number }>;
    // george must appear twice — created-late top header + bottom header.
    const georgeTexts = texts.filter((t) => t.text === 'george');
    expect(georgeTexts.length).toBe(2);
    // The two george text nodes must sit at distinct y coordinates (top
    // header above destroy, bottom header below).
    const ys = georgeTexts.map((t) => t.y).sort((a, b) => a - b);
    expect(ys[1]! - ys[0]!).toBeGreaterThan(20);

    // No lifeline must span the gap between the destroy y and the bottom
    // header. Find george's lane via the destroy X marker x coordinate.
    const redLines = scene.children.filter(
      (s) =>
        s.type === 'line' &&
        (s as { style: { stroke?: string } }).style.stroke === '#a00',
    ) as Array<{ x1: number; x2: number; y1: number; y2: number }>;
    expect(redLines.length).toBe(2);
    const destroyCenterX = (redLines[0]!.x1 + redLines[0]!.x2) / 2;
    const destroyCenterY = (redLines[0]!.y1 + redLines[0]!.y2) / 2;
    const georgeBottomY = ys[1]!;

    // All dashed verticals (lifelines) on george's lane must end at or
    // before the destroy y — no segment runs from the X to the bottom header.
    const dashedVerticals = scene.children.filter(
      (s) =>
        s.type === 'line' &&
        (s as { x1: number; x2: number }).x1 === (s as { x1: number; x2: number }).x2 &&
        (s as { style: { strokeDasharray?: string } }).style.strokeDasharray !== undefined,
    ) as Array<{ x1: number; y1: number; y2: number }>;
    const georgeLane = dashedVerticals.filter((l) => Math.abs(l.x1 - destroyCenterX) < 2);
    expect(georgeLane.length).toBeGreaterThan(0);
    for (const l of georgeLane) {
      const top = Math.min(l.y1, l.y2);
      const bot = Math.max(l.y1, l.y2);
      // Segment must NOT reach the bottom-header area below the destroy y.
      expect(bot).toBeLessThan(georgeBottomY - 5);
      // And it must not start past the destroy y either.
      expect(top).toBeLessThanOrEqual(destroyCenterY + 12);
    }
  });
});
