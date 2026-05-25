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

  it('renders actor with stick-figure head colored from the directive', () => {
    const scene = compile('@startuml\nactor Bob #red\nBob -> Bob: x\n@enduml');
    const redCircle = scene.children.find(
      (s) =>
        s.type === 'circle' &&
        (s as { style: { fill?: string } }).style.fill === 'red',
    );
    expect(redCircle).toBeTruthy();
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

  it('renders `newpage` as separate page sections (own headers + lifelines)', () => {
    const scene = compile(
      [
        '@startuml',
        'Alice -> Bob : message 1',
        'Alice -> Bob : message 2',
        'newpage',
        'Alice -> Bob : message 3',
        'newpage A title for the\\nlast page',
        'Alice -> Bob : message 4',
        '@enduml',
      ].join('\n'),
    );
    const texts = scene.children
      .filter((s) => s.type === 'text')
      .map((s) => (s as { text: string }).text);
    // Each participant header appears 2× per page (top + bottom) × 3 pages = 6
    expect(texts.filter((t) => t === 'Alice').length).toBe(6);
    expect(texts.filter((t) => t === 'Bob').length).toBe(6);
    // All 4 messages render
    expect(texts).toContain('message 1');
    expect(texts).toContain('message 2');
    expect(texts).toContain('message 3');
    expect(texts).toContain('message 4');
    // Page 3 title with `\n` becomes 2 lines
    expect(texts).toContain('A title for the');
    expect(texts).toContain('last page');
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
});
