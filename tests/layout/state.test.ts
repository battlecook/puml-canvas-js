import { describe, it, expect } from 'vitest';
import { compile } from '../../src/index.js';
import type {
  CircleShape,
  LineShape,
  PolygonShape,
  RectShape,
  Shape,
  TextShape,
} from '../../src/scene/types.js';

const STYLED = `@startuml
state s1 : s1 description
state s2 #pink;line:red;line.bold;text:red : s2 description
state s3 #palegreen;line:green;line.dashed;text:green : s3 description
state s4 #aliceblue;line:blue;line.dotted;text:blue : s4 description
@enduml`;

function rects(shapes: Shape[]): RectShape[] {
  return shapes.filter((s): s is RectShape => s.type === 'rect');
}

function texts(shapes: Shape[]): TextShape[] {
  return shapes.filter((s): s is TextShape => s.type === 'text');
}

describe('state layout — inline style suffix', () => {
  it('renders 4 rounded rects with per-state fill, stroke, and stroke style', () => {
    const scene = compile(STYLED);
    const rs = rects(scene.children);
    // 4 state rects, all rounded.
    expect(rs.length).toBe(4);
    for (const r of rs) {
      expect(r.rx).toBeGreaterThan(0);
      expect(r.ry).toBeGreaterThan(0);
    }

    // s1 — default fill, no stroke override.
    const s1Rect = rs[0]!;
    expect(s1Rect.style?.strokeDasharray).toBeUndefined();
    expect(s1Rect.style?.strokeWidth).toBe(1);

    // s2 — pink fill, red stroke, bold (strokeWidth=2).
    const s2Rect = rs[1]!;
    expect(s2Rect.style?.fill).toBe('pink');
    expect(s2Rect.style?.stroke).toBe('red');
    expect(s2Rect.style?.strokeWidth).toBe(2);
    expect(s2Rect.style?.strokeDasharray).toBeUndefined();

    // s3 — palegreen fill, green stroke, dashed.
    const s3Rect = rs[2]!;
    expect(s3Rect.style?.fill).toBe('palegreen');
    expect(s3Rect.style?.stroke).toBe('green');
    expect(s3Rect.style?.strokeDasharray).toBe('4,2');

    // s4 — aliceblue fill, blue stroke, dotted.
    const s4Rect = rs[3]!;
    expect(s4Rect.style?.fill).toBe('aliceblue');
    expect(s4Rect.style?.stroke).toBe('blue');
    expect(s4Rect.style?.strokeDasharray).toBe('2,3');
  });

  it('stacks multiple `Name : text` rows under a horizontal divider inside the state box', () => {
    const src = [
      '@startuml',
      '[*] --> State1',
      'State1 --> [*]',
      'State1 : this is a string',
      'State1 : this is another string',
      'State1 -> State2',
      'State2 --> [*]',
      '@enduml',
    ].join('\n');
    const scene = compile(src);

    // Locate State1's rect — it's the only normal-state rect that contains
    // BOTH description text rows. There are 2 normal states (State1, State2)
    // plus initial/final pseudo-states (circles, not rects).
    const rs = rects(scene.children);
    const ts = texts(scene.children);
    const desc1 = ts.find((t) => t.text === 'this is a string');
    const desc2 = ts.find((t) => t.text === 'this is another string');
    const name = ts.find((t) => t.text === 'State1');
    expect(desc1).toBeDefined();
    expect(desc2).toBeDefined();
    expect(name).toBeDefined();

    // Find State1's box: the rect that encloses all three texts.
    const within = (r: RectShape, t: TextShape) =>
      t.x >= r.x && t.x <= r.x + r.w && t.y >= r.y && t.y <= r.y + r.h;
    const s1Rect = rs.find(
      (r) => within(r, name!) && within(r, desc1!) && within(r, desc2!),
    );
    expect(s1Rect).toBeDefined();

    // Both description rows render at the same x (centered) but at different
    // y values (stacked).
    expect(desc1!.x).toBeCloseTo(desc2!.x, 5);
    expect(desc2!.y).toBeGreaterThan(desc1!.y);
    // Name sits above both description rows.
    expect(name!.y).toBeLessThan(desc1!.y);

    // A horizontal divider line spans the full width of State1's box and
    // sits between the name row and the description rows.
    const lines = scene.children.filter((s): s is LineShape => s.type === 'line');
    const divider = lines.find(
      (l) =>
        l.y1 === l.y2 &&
        Math.abs(l.x1 - s1Rect!.x) < 0.5 &&
        Math.abs(l.x2 - (s1Rect!.x + s1Rect!.w)) < 0.5 &&
        l.y1 > name!.y &&
        l.y1 < desc1!.y,
    );
    expect(divider).toBeDefined();
  });

  it('applies textColor to the name and description text', () => {
    const scene = compile(STYLED);
    const ts = texts(scene.children).map((t) => ({ text: t.text, color: t.font?.color }));
    expect(ts).toEqual(
      expect.arrayContaining([
        { text: 's2', color: 'red' },
        { text: 's2 description', color: 'red' },
        { text: 's3', color: 'green' },
        { text: 's3 description', color: 'green' },
        { text: 's4', color: 'blue' },
        { text: 's4 description', color: 'blue' },
      ]),
    );
    // s1 description renders with default color.
    const s1Desc = ts.find((t) => t.text === 's1 description');
    expect(s1Desc?.color).toBe('#000');
  });
});

const SIBLING_COMPOSITES = `@startuml
[*] --> NotShooting
state NotShooting {
  [*] --> Idle
  Idle --> Configuring : EvConfig
  Configuring --> Idle : EvConfig
}
state Configuring {
  [*] --> NewValueSelection
  NewValueSelection --> NewValuePreview : EvNewValue
  NewValuePreview --> NewValueSelection : EvNewValueRejected
  NewValuePreview --> NewValueSelection : EvNewValueSaved
  state NewValuePreview {
    State1 -> State2
  }
}
@enduml`;

describe('state layout — sibling composite states', () => {
  it('renders transition labels as text shapes near arrows', () => {
    const scene = compile(SIBLING_COMPOSITES);
    const ts = texts(scene.children).map((t) => t.text);
    expect(ts).toEqual(expect.arrayContaining([
      'EvConfig',
      'EvNewValue',
      'EvNewValueRejected',
      'EvNewValueSaved',
    ]));
  });

  it('renders NotShooting and Configuring as separate frames (neither contains the other)', () => {
    const scene = compile(SIBLING_COMPOSITES);
    const ts = texts(scene.children);
    const notShootingHeader = ts.find((t) => t.text === 'NotShooting');
    const configuringHeader = ts.find((t) => t.text === 'Configuring');
    expect(notShootingHeader).toBeDefined();
    expect(configuringHeader).toBeDefined();

    const rs = rects(scene.children);
    const encloses = (r: RectShape, tx: number, ty: number): boolean =>
      tx >= r.x && tx <= r.x + r.w && ty >= r.y && ty <= r.y + r.h;

    const ns = notShootingHeader!;
    const cf = configuringHeader!;

    // Composite frame for each header: the SMALLEST rect that encloses the
    // header text. Sibling frames must be smaller than the page and distinct.
    const nsFrame = rs
      .filter((r) => encloses(r, ns.x, ns.y))
      .sort((a, b) => a.w * a.h - b.w * b.h)
      .find((r) => r.w * r.h > 0 && r.w < scene.width);
    const cfFrame = rs
      .filter((r) => encloses(r, cf.x, cf.y))
      .sort((a, b) => a.w * a.h - b.w * b.h)
      .find((r) => r.w * r.h > 0 && r.w < scene.width);

    expect(nsFrame).toBeDefined();
    expect(cfFrame).toBeDefined();

    const strictlyContains = (outer: RectShape, inner: RectShape): boolean =>
      inner.x >= outer.x &&
      inner.y >= outer.y &&
      inner.x + inner.w <= outer.x + outer.w &&
      inner.y + inner.h <= outer.y + outer.h &&
      !(inner.x === outer.x && inner.y === outer.y && inner.w === outer.w && inner.h === outer.h);

    expect(strictlyContains(nsFrame!, cfFrame!)).toBe(false);
    expect(strictlyContains(cfFrame!, nsFrame!)).toBe(false);
  });

  it('spreads parallel transition labels so they do not overlap', () => {
    const scene = compile(SIBLING_COMPOSITES);
    const ts = texts(scene.children);

    // The three transitions between NewValueSelection <-> NewValuePreview
    // share the same node pair and so their labels must be visually distinct.
    const a = ts.find((t) => t.text === 'EvNewValue');
    const b = ts.find((t) => t.text === 'EvNewValueRejected');
    const c = ts.find((t) => t.text === 'EvNewValueSaved');
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(c).toBeDefined();

    const labels = [a!, b!, c!];
    for (let i = 0; i < labels.length; i++) {
      for (let j = i + 1; j < labels.length; j++) {
        const li = labels[i]!;
        const lj = labels[j]!;
        const verticalSep = Math.abs(li.y - lj.y);
        const horizontalSep = Math.abs(li.x - lj.x);
        // Either rows are separated vertically by > 12 px (so 11 px fonts
        // don't visually overlap) or pulled far apart horizontally by > 80
        // px — sufficient to disambiguate them visually.
        expect(verticalSep > 12 || horizontalSep > 80).toBe(true);
      }
    }
  });
});

describe('state layout — direction (TB default vs LR opt-in)', () => {
  const SIBLING_TB = `@startuml
state A {
  state X {
  }
  state Y {
  }
}
state B {
  state Z {
  }
}
X --> Z
Z --> Y
@enduml`;

  it('stacks sibling composite states vertically by default (TB)', () => {
    const scene = compile(SIBLING_TB);
    const ts = texts(scene.children);
    const rs = rects(scene.children);
    const aHeader = ts.find((t) => t.text === 'A');
    const bHeader = ts.find((t) => t.text === 'B');
    expect(aHeader).toBeDefined();
    expect(bHeader).toBeDefined();

    const encloses = (r: RectShape, tx: number, ty: number) =>
      tx >= r.x && tx <= r.x + r.w && ty >= r.y && ty <= r.y + r.h;
    // Smallest rect enclosing each header text = that composite's frame.
    const frameOf = (tx: number, ty: number) =>
      rs
        .filter((r) => encloses(r, tx, ty))
        .filter((r) => r.w * r.h > 0 && r.w < scene.width)
        .sort((a, b) => a.w * a.h - b.w * b.h)[0];

    const aFrame = frameOf(aHeader!.x, aHeader!.y);
    const bFrame = frameOf(bHeader!.x, bHeader!.y);
    expect(aFrame).toBeDefined();
    expect(bFrame).toBeDefined();

    const aCy = aFrame!.y + aFrame!.h / 2;
    const bCy = bFrame!.y + bFrame!.h / 2;
    // A above B: A's center sits strictly above B's center.
    expect(aCy).toBeLessThan(bCy);

    // Children X and Y inside A still flow horizontally (side by side):
    // both share roughly the same y-row inside A.
    const xText = ts.find((t) => t.text === 'X');
    const yText = ts.find((t) => t.text === 'Y');
    expect(xText).toBeDefined();
    expect(yText).toBeDefined();
    expect(Math.abs(xText!.y - yText!.y)).toBeLessThan(8);
  });

  it('packs sibling composite states horizontally when `left to right direction` is set', () => {
    const src = `@startuml
left to right direction
state A {
  state X { }
}
state B {
  state Z {
  }
}
X --> Z
@enduml`;
    const scene = compile(src);
    const ts = texts(scene.children);
    const rs = rects(scene.children);
    const aHeader = ts.find((t) => t.text === 'A');
    const bHeader = ts.find((t) => t.text === 'B');
    expect(aHeader).toBeDefined();
    expect(bHeader).toBeDefined();

    const encloses = (r: RectShape, tx: number, ty: number) =>
      tx >= r.x && tx <= r.x + r.w && ty >= r.y && ty <= r.y + r.h;
    const frameOf = (tx: number, ty: number) =>
      rs
        .filter((r) => encloses(r, tx, ty))
        .filter((r) => r.w * r.h > 0 && r.w < scene.width)
        .sort((a, b) => a.w * a.h - b.w * b.h)[0];

    const aFrame = frameOf(aHeader!.x, aHeader!.y);
    const bFrame = frameOf(bHeader!.x, bHeader!.y);
    expect(aFrame).toBeDefined();
    expect(bFrame).toBeDefined();
    // LR mode: A's right edge sits at or before B's left edge.
    expect(aFrame!.x + aFrame!.w).toBeLessThanOrEqual(bFrame!.x + 1);
  });
});

const HISTORY_SRC = `@startuml
[*] -> State1
State1 --> State2 : Succeeded
State1 --> [*] : Aborted
State2 --> State3 : Succeeded
State2 --> [*] : Aborted
state State3 {
  state "Accumulate Enough Data" as long1
  long1 : Just a test
  [*] --> long1
  long1 --> long1 : New Data
  long1 --> ProcessData : Enough Data
  State2 --> [H]: Resume
}
State3 --> State2 : Pause
State2 --> State3[H*]: DeepResume
State3 --> State3 : Failed
State3 --> [*] : Succeeded / Save Result
State3 --> [*] : Aborted
@enduml`;

const CONCURRENT_REGIONS = `@startuml
[*] --> Active
state Active {
  [*] -> NumLockOff
  NumLockOff --> NumLockOn : EvNumLockPressed
  NumLockOn --> NumLockOff : EvNumLockPressed
  --
  [*] -> CapsLockOff
  CapsLockOff --> CapsLockOn : EvCapsLockPressed
  CapsLockOn --> CapsLockOff : EvCapsLockPressed
  --
  [*] -> ScrollLockOff
  ScrollLockOff --> ScrollLockOn : EvScrollLockPressed
  ScrollLockOn --> ScrollLockOff : EvScrollLockPressed
}
@enduml`;

describe('state layout — concurrent regions', () => {
  it('renders 2 dashed horizontal separator lines inside Active for 3 regions', () => {
    const scene = compile(CONCURRENT_REGIONS);
    const ts = texts(scene.children);
    const rs = rects(scene.children);
    const activeHeader = ts.find((t) => t.text === 'Active');
    expect(activeHeader).toBeDefined();
    const encloses = (r: RectShape, tx: number, ty: number) =>
      tx >= r.x && tx <= r.x + r.w && ty >= r.y && ty <= r.y + r.h;
    const activeFrame = rs
      .filter((r) => encloses(r, activeHeader!.x, activeHeader!.y))
      .filter((r) => r.w * r.h > 0 && r.w < scene.width)
      .sort((a, b) => a.w * a.h - b.w * b.h)[0];
    expect(activeFrame).toBeDefined();

    // Dashed horizontal lines sitting inside Active's frame (between
    // adjacent regions). For 3 regions we expect exactly 2 such separators.
    const lines = scene.children.filter((s): s is LineShape => s.type === 'line');
    const dashedSeparators = lines.filter((l) => {
      if (l.y1 !== l.y2) return false;
      if (l.style?.strokeDasharray !== '5,3') return false;
      // Inside Active's frame, not the frame's own header divider.
      const insideX = l.x1 >= activeFrame!.x && l.x2 <= activeFrame!.x + activeFrame!.w + 0.5;
      const insideY = l.y1 > activeFrame!.y && l.y1 < activeFrame!.y + activeFrame!.h;
      return insideX && insideY;
    });
    expect(dashedSeparators.length).toBe(2);
  });

  it('stacks 3 regions vertically each with its 2 named states', () => {
    const scene = compile(CONCURRENT_REGIONS);
    const ts = texts(scene.children);

    const numOff = ts.find((t) => t.text === 'NumLockOff');
    const numOn = ts.find((t) => t.text === 'NumLockOn');
    const capsOff = ts.find((t) => t.text === 'CapsLockOff');
    const capsOn = ts.find((t) => t.text === 'CapsLockOn');
    const scrollOff = ts.find((t) => t.text === 'ScrollLockOff');
    const scrollOn = ts.find((t) => t.text === 'ScrollLockOn');
    for (const lbl of [numOff, numOn, capsOff, capsOn, scrollOff, scrollOn]) {
      expect(lbl).toBeDefined();
    }

    // Region 1 (NumLock) sits above region 2 (CapsLock) sits above region 3
    // (ScrollLock). Use the topmost member of each region to compare.
    const region1Top = Math.min(numOff!.y, numOn!.y);
    const region2Top = Math.min(capsOff!.y, capsOn!.y);
    const region3Top = Math.min(scrollOff!.y, scrollOn!.y);
    expect(region1Top).toBeLessThan(region2Top);
    expect(region2Top).toBeLessThan(region3Top);

    // All three region transitions render their labels.
    const labels = ts.map((t) => t.text);
    expect(labels).toContain('EvNumLockPressed');
    expect(labels).toContain('EvCapsLockPressed');
    expect(labels).toContain('EvScrollLockPressed');
  });

  // `||` separator: same three regions, but stacked SIDE-BY-SIDE with
  // VERTICAL dashed lines between them (rather than horizontally with
  // horizontal dashed lines).
  const CONCURRENT_REGIONS_HORIZONTAL = `@startuml
[*] --> Active
state Active {
  [*] -> NumLockOff
  NumLockOff --> NumLockOn : EvNumLockPressed
  NumLockOn --> NumLockOff : EvNumLockPressed
  ||
  [*] -> CapsLockOff
  CapsLockOff --> CapsLockOn : EvCapsLockPressed
  CapsLockOn --> CapsLockOff : EvCapsLockPressed
  ||
  [*] -> ScrollLockOff
  ScrollLockOff --> ScrollLockOn : EvScrollLockPressed
  ScrollLockOn --> ScrollLockOff : EvScrollLockPressed
}
@enduml`;

  it('renders 2 dashed VERTICAL separator lines inside Active for `||` regions', () => {
    const scene = compile(CONCURRENT_REGIONS_HORIZONTAL);
    const ts = texts(scene.children);
    const rs = rects(scene.children);
    const activeHeader = ts.find((t) => t.text === 'Active');
    expect(activeHeader).toBeDefined();
    const encloses = (r: RectShape, tx: number, ty: number) =>
      tx >= r.x && tx <= r.x + r.w && ty >= r.y && ty <= r.y + r.h;
    const activeFrame = rs
      .filter((r) => encloses(r, activeHeader!.x, activeHeader!.y))
      .filter((r) => r.w * r.h > 0 && r.w < scene.width)
      .sort((a, b) => a.w * a.h - b.w * b.h)[0];
    expect(activeFrame).toBeDefined();

    const lines = scene.children.filter((s): s is LineShape => s.type === 'line');
    const dashedVertical = lines.filter((l) => {
      // Vertical line: x1 === x2; dashed; inside Active's frame.
      if (l.x1 !== l.x2) return false;
      if (l.style?.strokeDasharray !== '5,3') return false;
      const insideY = l.y1 >= activeFrame!.y && l.y2 <= activeFrame!.y + activeFrame!.h + 0.5;
      const insideX = l.x1 > activeFrame!.x && l.x1 < activeFrame!.x + activeFrame!.w;
      return insideX && insideY;
    });
    expect(dashedVertical.length).toBe(2);
  });

  it('stacks 3 regions SIDE-BY-SIDE for `||` separator (distinct x, similar y)', () => {
    const scene = compile(CONCURRENT_REGIONS_HORIZONTAL);
    const ts = texts(scene.children);

    const numOff = ts.find((t) => t.text === 'NumLockOff');
    const capsOff = ts.find((t) => t.text === 'CapsLockOff');
    const scrollOff = ts.find((t) => t.text === 'ScrollLockOff');
    for (const lbl of [numOff, capsOff, scrollOff]) expect(lbl).toBeDefined();

    // Distinct x positions — left to right in source order.
    expect(numOff!.x).toBeLessThan(capsOff!.x);
    expect(capsOff!.x).toBeLessThan(scrollOff!.x);

    // Similar y positions — all three regions share the same top edge
    // (within a tight tolerance allowed for sugiyama row centering).
    expect(Math.abs(numOff!.y - capsOff!.y)).toBeLessThan(5);
    expect(Math.abs(capsOff!.y - scrollOff!.y)).toBeLessThan(5);
  });
});

describe('state layout — history pseudo-states', () => {
  function circles(shapes: Shape[]): CircleShape[] {
    return shapes.filter((s): s is CircleShape => s.type === 'circle');
  }

  it('renders [H] and [H*] as small circles with "H" / "H*" text inside State3', () => {
    const scene = compile(HISTORY_SRC);
    const ts = texts(scene.children);
    const rs = rects(scene.children);
    const cs = circles(scene.children);

    // Locate State3's composite frame (the rect that encloses its header text).
    const state3Header = ts.find((t) => t.text === 'State3');
    expect(state3Header).toBeDefined();
    const encloses = (r: RectShape, tx: number, ty: number) =>
      tx >= r.x && tx <= r.x + r.w && ty >= r.y && ty <= r.y + r.h;
    const state3Frame = rs
      .filter((r) => encloses(r, state3Header!.x, state3Header!.y))
      .filter((r) => r.w * r.h > 0 && r.w < scene.width)
      .sort((a, b) => a.w * a.h - b.w * b.h)[0];
    expect(state3Frame).toBeDefined();

    const inFrame = (x: number, y: number) =>
      x >= state3Frame!.x && x <= state3Frame!.x + state3Frame!.w &&
      y >= state3Frame!.y && y <= state3Frame!.y + state3Frame!.h;

    // "H" and "H*" texts both sit inside State3's frame.
    const hText = ts.find((t) => t.text === 'H' && inFrame(t.x, t.y));
    const hStarText = ts.find((t) => t.text === 'H*' && inFrame(t.x, t.y));
    expect(hText).toBeDefined();
    expect(hStarText).toBeDefined();

    // Each is paired with a small white-filled circle (radius ~10).
    const findCircleAt = (tx: number, ty: number) =>
      cs.find((c) =>
        Math.abs(c.cx - tx) < 1 &&
        Math.abs(c.cy - ty) < 1 &&
        c.r >= 8 && c.r <= 14 &&
        c.style?.fill === '#fff',
      );
    expect(findCircleAt(hText!.x, hText!.y)).toBeDefined();
    expect(findCircleAt(hStarText!.x, hStarText!.y)).toBeDefined();

    // No literal-id text leaks ("[H]" / "[H*]" / "State3[H*]").
    expect(ts.find((t) => t.text === '[H]')).toBeUndefined();
    expect(ts.find((t) => t.text === '[H*]')).toBeUndefined();
    expect(ts.find((t) => t.text === 'State3[H*]')).toBeUndefined();
  });
});

describe('state layout — SDL stereotype shapes', () => {
  const SDL_RECEIVE_SRC = `@startuml
state "Req(Id)" as ReqId <<sdlreceive>>
state "Minor(Id)" as MinorId
state "Major(Id)" as MajorId
state c <<choice>>
Idle --> ReqId
ReqId --> c
c --> MinorId : [Id <= 10]
c --> MajorId : [Id > 10]
@enduml`;

  function polygons(shapes: Shape[]): PolygonShape[] {
    return shapes.filter((s): s is PolygonShape => s.type === 'polygon');
  }

  it('renders <<sdlreceive>> as a notched polygon (not a plain rect)', () => {
    const scene = compile(SDL_RECEIVE_SRC);
    const ts = texts(scene.children);
    const polys = polygons(scene.children);

    // Locate ReqId's label so we can find its outline.
    const reqLabel = ts.find((t) => t.text === 'Req(Id)');
    expect(reqLabel).toBeDefined();

    // The ReqId outline is a polygon whose bounding box contains the label.
    // We expect more than 4 vertices (the notch adds one extra vertex on the
    // left edge), distinguishing it from the choice diamond (4 vertices).
    const reqPolygon = polys.find((p) => {
      const xs = p.points.map((pt) => pt[0]);
      const ys = p.points.map((pt) => pt[1]);
      const xMin = Math.min(...xs);
      const xMax = Math.max(...xs);
      const yMin = Math.min(...ys);
      const yMax = Math.max(...ys);
      return (
        reqLabel!.x >= xMin && reqLabel!.x <= xMax &&
        reqLabel!.y >= yMin && reqLabel!.y <= yMax &&
        p.points.length > 4
      );
    });
    expect(reqPolygon).toBeDefined();
    expect(reqPolygon!.points.length).toBe(5);

    // The choice diamond should still be a 4-vertex polygon, distinct from
    // the sdlreceive shape.
    const diamond = polys.find((p) => p.points.length === 4);
    expect(diamond).toBeDefined();
  });

  it('renders <<output>> as a 5-vertex polygon with a right-side chevron', () => {
    const src = [
      '@startuml',
      'state Out <<output>>',
      'Idle --> Out',
      '@enduml',
    ].join('\n');
    const scene = compile(src);
    const polys = polygons(scene.children);
    const outPoly = polys.find((p) => p.points.length === 5);
    expect(outPoly).toBeDefined();
    // Chevron tip is the rightmost vertex and sits at vertical center.
    const xs = outPoly!.points.map((pt) => pt[0]);
    const ys = outPoly!.points.map((pt) => pt[1]);
    const maxX = Math.max(...xs);
    const tip = outPoly!.points.find((pt) => pt[0] === maxX)!;
    const yMid = (Math.min(...ys) + Math.max(...ys)) / 2;
    expect(Math.abs(tip[1] - yMid)).toBeLessThan(0.001);
  });

  it('renders <<task>> as a square-cornered rectangle (no rx/ry)', () => {
    const src = [
      '@startuml',
      'state DoWork <<task>>',
      'Idle --> DoWork',
      '@enduml',
    ].join('\n');
    const scene = compile(src);
    const ts = texts(scene.children);
    const rs = rects(scene.children);
    const taskLabel = ts.find((t) => t.text === 'DoWork');
    expect(taskLabel).toBeDefined();
    // Find the rect containing the DoWork label; it should NOT have rounded
    // corners.
    const taskRect = rs.find((r) =>
      taskLabel!.x >= r.x && taskLabel!.x <= r.x + r.w &&
      taskLabel!.y >= r.y && taskLabel!.y <= r.y + r.h,
    );
    expect(taskRect).toBeDefined();
    expect(taskRect!.rx ?? 0).toBe(0);
    expect(taskRect!.ry ?? 0).toBe(0);
  });
});

describe('state layout — multi-line transition labels and pseudo-state shapes', () => {
  const MULTI_KIND_SRC = `@startuml
state start1 <<start>>
state choice1 <<choice>>
state fork1 <<fork>>
state join2 <<join>>
state end3 <<end>>
[*] --> choice1 : from start\\nto choice
start1 --> choice1 : from start stereo\\nto choice
choice1 --> fork1 : from choice\\nto fork
choice1 --> join2 : from choice\\nto join
choice1 --> end3 : from choice\\nto end stereo
fork1 ---> State1 : from fork\\nto state
fork1 --> State2 : from fork\\nto state
State2 --> join2 : from state\\nto join
State1 --> [*] : from state\\nto end
join2 --> [*] : from join\\nto end
@enduml`;

  it('splits transition labels with \\n into multiple text rows (no literal \\n)', () => {
    const scene = compile(MULTI_KIND_SRC);
    const ts = texts(scene.children);

    // No text shape may contain a literal `\n` — that would mean the escape
    // wasn't expanded by the parser before reaching the layout.
    for (const t of ts) {
      expect(t.text.includes('\\n')).toBe(false);
    }

    // For at least one transition the two halves of the label must both appear
    // as distinct text shapes (proves the layout split them onto separate rows).
    const top = ts.find((t) => t.text === 'from start');
    const bottom = ts.find((t) => t.text === 'to choice');
    expect(top).toBeDefined();
    expect(bottom).toBeDefined();
    // The two rows for the same label should share an x position and stack
    // vertically with the bottom row below the top row.
    expect(Math.abs(top!.x - bottom!.x)).toBeLessThan(1);
    expect(bottom!.y).toBeGreaterThan(top!.y);
  });

  it('renders <<fork>>/<<join>> as small black-filled rectangles (no rx/ry, no label text)', () => {
    const scene = compile(MULTI_KIND_SRC);
    const rs = rects(scene.children);
    const ts = texts(scene.children);

    // Black-filled bars: filled with the pseudo-state color, no rounded
    // corners, wide-and-short rectangles. There must be at least two — one
    // for fork1 and one for join2.
    const bars = rs.filter((r) =>
      (r.style?.fill === '#222' || r.style?.fill === '#000' || r.style?.fill === 'black') &&
      (r.rx ?? 0) === 0 &&
      (r.ry ?? 0) === 0 &&
      r.w >= r.h * 2 &&
      r.h <= 12,
    );
    expect(bars.length).toBeGreaterThanOrEqual(2);

    // The fork/join bars must NOT be labelled with their id; PlantUML omits
    // the name on these pseudo-states.
    expect(ts.find((t) => t.text === 'fork1')).toBeUndefined();
    expect(ts.find((t) => t.text === 'join2')).toBeUndefined();
  });
});
