import { describe, it, expect } from 'vitest';
import { compile } from '../../src/index.js';
import { separatedSplinePoints } from '../../src/layout/common/edges.js';
import type {
  CircleShape,
  LineShape,
  PathShape,
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

describe('state layout — edge-label collision avoidance (Phase 1 Step D3)', () => {
  // A state with a long transition label that would, at the polyline midpoint,
  // visually sit near a nearby state box. With Step D3 the engine slides the
  // labelBox off-midpoint so the rendered text doesn't overlap any node.
  const LONG_LABEL_SRC = [
    '@startuml',
    '[*] --> Open',
    'Open --> Closed : a very long transition label',
    'Closed --> Archived',
    '@enduml',
  ].join('\n');

  function rectFor(scene: ReturnType<typeof compile>, name: string): RectShape | undefined {
    const ts = scene.children.filter((s): s is TextShape => s.type === 'text');
    const rs = scene.children.filter((s): s is RectShape => s.type === 'rect');
    const t = ts.find((tt) => tt.text === name);
    if (!t) return undefined;
    return rs.find(
      (r) => t.x >= r.x && t.x <= r.x + r.w && t.y >= r.y && t.y <= r.y + r.h,
    );
  }

  it('keeps long transition labels clear of unrelated state rectangles', () => {
    const scene = compile(LONG_LABEL_SRC);
    const ts = scene.children.filter((s): s is TextShape => s.type === 'text');
    const label = ts.find((t) => t.text === 'a very long transition label');
    expect(label).toBeDefined();

    // The label's centre point must not fall inside the rectangle of an
    // unrelated state (here, "Archived" — Closed is the edge endpoint
    // and Open is too, but Archived sits below Closed and could overlap
    // the polyline midpoint when the label is long).
    const archivedRect = rectFor(scene, 'Archived');
    expect(archivedRect).toBeDefined();
    const inside =
      label!.x >= archivedRect!.x &&
      label!.x <= archivedRect!.x + archivedRect!.w &&
      label!.y >= archivedRect!.y &&
      label!.y <= archivedRect!.y + archivedRect!.h;
    expect(inside).toBe(false);
  });

  it('does not regress short labels when they already fit at the midpoint', () => {
    // Single short edge label between two well-separated states — the
    // engine should choose the midpoint and the text should sit roughly
    // halfway between the two endpoints.
    const src = [
      '@startuml',
      '[*] --> A',
      'A --> B : go',
      '@enduml',
    ].join('\n');
    const scene = compile(src);
    const ts = scene.children.filter((s): s is TextShape => s.type === 'text');
    const a = ts.find((t) => t.text === 'A');
    const b = ts.find((t) => t.text === 'B');
    const go = ts.find((t) => t.text === 'go');
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(go).toBeDefined();
    // 'go' sits vertically between A and B.
    expect(go!.y).toBeGreaterThan(a!.y);
    expect(go!.y).toBeLessThan(b!.y);
  });
});

describe('state layout — bezier edge curves (Phase 1 Step D1)', () => {
  // A direct A→C edge alongside A→B→C makes A→C span two ranks, so
  // sugiyama threads it through a dummy waypoint. The engine then flags
  // that route as `curve: 'bezier'`, and the flat state renderer emits a
  // smooth cubic-Bezier `<path>` instead of a sharp-cornered `<polyline>`.
  const MULTI_RANK_SRC = [
    '@startuml',
    '[*] --> A',
    'A --> B',
    'B --> C',
    'A --> C',
    '@enduml',
  ].join('\n');

  function paths(shapes: Shape[]): PathShape[] {
    return shapes.filter((s): s is PathShape => s.type === 'path');
  }

  it('emits a path shape for the multi-rank A→C edge', () => {
    const scene = compile(MULTI_RANK_SRC);
    const ps = paths(scene.children);
    // Exactly one multi-rank edge → exactly one bezier path. (Direct
    // single-rank edges stay as `<line>` shapes.)
    expect(ps.length).toBe(1);
    const d = ps[0]!.d;
    // Bezier path starts with `M` and contains at least one `C` command.
    expect(d.startsWith('M ')).toBe(true);
    expect(d).toMatch(/ C /);
  });

  it('keeps single-rank edges as straight lines (no path shape)', () => {
    // A linear chain has no multi-rank edges; every transition is a
    // 2-point straight line. The flat renderer must therefore emit zero
    // `<path>` shapes.
    const src = [
      '@startuml',
      '[*] --> A',
      'A --> B',
      'B --> C',
      '@enduml',
    ].join('\n');
    const scene = compile(src);
    expect(paths(scene.children).length).toBe(0);
  });

  it('positions the arrow marker tip at the end of the bezier path', () => {
    // The end-marker polyline's middle vertex is the arrow tip. For our
    // curve renderer, the tip must coincide with the curve's last control
    // point (the end of the polyline's last `C` command).
    const scene = compile(MULTI_RANK_SRC);
    const ps = paths(scene.children);
    expect(ps.length).toBe(1);
    const d = ps[0]!.d;
    // Last `C cp1, cp2, endX endY` triple — grab `endX endY`.
    const lastC = d.lastIndexOf(' C ');
    expect(lastC).toBeGreaterThan(0);
    const tail = d.slice(lastC + 3).split(',').pop()!.trim();
    const [endXStr, endYStr] = tail.split(/\s+/);
    const endX = Number(endXStr);
    const endY = Number(endYStr);

    // Find the arrow head polyline whose middle vertex is closest to the
    // curve end. The marker polyline has 3 points `[a1, end, a2]`, so the
    // middle point should match (endX, endY).
    const polys = scene.children.filter(
      (s): s is { type: 'polyline'; points: Array<[number, number]> } & Shape =>
        s.type === 'polyline',
    );
    const matching = polys.find((p) => {
      const mid = p.points[1];
      if (!mid) return false;
      return Math.abs(mid[0] - endX) < 1e-3 && Math.abs(mid[1] - endY) < 1e-3;
    });
    expect(matching).toBeDefined();
  });
});

describe('state layout — parallel edges (flat layered path)', () => {
  // Two transitions between the same pair, with different labels. Before the
  // F2a edge-identity refactor the engine keyed edges by `from->to`, so one of
  // these collapsed onto the other and only a single label survived. Now both
  // edges flow through the layered path as distinct entries.
  const PARALLEL = `@startuml
NewValueSelection --> NewValuePreview : EvNewValue
NewValuePreview --> NewValueSelection : EvNewValueRejected
NewValuePreview --> NewValueSelection : EvNewValueSaved
@enduml`;

  it('renders both labels of a doubled NewValuePreview -> NewValueSelection edge', () => {
    const scene = compile(PARALLEL);
    const ts = texts(scene.children);

    const rejected = ts.find((t) => t.text === 'EvNewValueRejected');
    const saved = ts.find((t) => t.text === 'EvNewValueSaved');

    // Both parallel-edge labels must be present (the motivating failure was
    // one of these disappearing entirely).
    expect(rejected).toBeDefined();
    expect(saved).toBeDefined();

    // Their geometry must differ — distinct lateral offsets / label boxes mean
    // the two labels do not stack at the same coordinate.
    const samePoint =
      Math.abs(rejected!.x - saved!.x) < 1e-6 &&
      Math.abs(rejected!.y - saved!.y) < 1e-6;
    expect(samePoint).toBe(false);

    // And separated enough to be visually legible (vertical row gap or a wide
    // horizontal pull-apart).
    const verticalSep = Math.abs(rejected!.y - saved!.y);
    const horizontalSep = Math.abs(rejected!.x - saved!.x);
    expect(verticalSep > 12 || horizontalSep > 40).toBe(true);
  });
});

describe('state layout — composite transition routing + label placement (unified pipeline)', () => {
  function paths(shapes: Shape[]): PathShape[] {
    return shapes.filter((s): s is PathShape => s.type === 'path');
  }
  function lines(shapes: Shape[]): LineShape[] {
    return shapes.filter((s): s is LineShape => s.type === 'line');
  }
  // First (M) point of a bezier `d` string.
  function pathStart(d: string): { x: number; y: number } {
    const m = d.match(/M\s+([-\d.]+)\s+([-\d.]+)/)!;
    return { x: Number(m[1]), y: Number(m[2]) };
  }
  function pathJoin(d: string): { x: number; y: number } | null {
    const firstC = d.indexOf(' C ');
    if (firstC < 0) return null;
    const nextC = d.indexOf(' C ', firstC + 3);
    const seg = nextC < 0 ? d.slice(firstC + 3) : d.slice(firstC + 3, nextC);
    const parts = seg.split(',').pop()!.trim().split(/\s+/);
    return { x: Number(parts[0]), y: Number(parts[1]) };
  }

  // The canonical PlantUML composite sample. Braces on their own lines so the
  // parser builds the real composite nesting (NotShooting / Configuring with
  // children, NewValuePreview nested inside Configuring) and the diagram flows
  // through the nested/composite layout path this pipeline drives. (Inline
  // `state X { ... }` on one line parses flat — a separate parser limitation.)
  const CANONICAL = `@startuml
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

  it('places no edge-label box inside any leaf node box', () => {
    const scene = compile(CANONICAL);
    const rs = rects(scene.children);
    const ts = texts(scene.children);

    // Leaf node boxes = rects that do NOT strictly contain another rect
    // (composite frames DO contain children and legitimately host edge labels).
    const isContainer = (r: RectShape): boolean =>
      rs.some(
        (o) =>
          o !== r &&
          o.x > r.x &&
          o.y > r.y &&
          o.x + o.w < r.x + r.w &&
          o.y + o.h < r.y + r.h,
      );
    const leaves = rs.filter((r) => !isContainer(r));

    const LABEL_HALF_W = 30;
    const LABEL_HALF_H = 7;
    const overlapArea = (
      a: { x: number; y: number; w: number; h: number },
      r: RectShape,
    ): number => {
      const ox = Math.max(0, Math.min(a.x + a.w, r.x + r.w) - Math.max(a.x, r.x));
      const oy = Math.max(0, Math.min(a.y + a.h, r.y + r.h) - Math.max(a.y, r.y));
      return ox * oy;
    };

    // Edge labels = texts whose center is NOT inside a LEAF node box (leaf
    // labels — state names — sit inside their leaf box).
    const insideLeaf = (x: number, y: number): boolean =>
      leaves.some((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
    const edgeLabels = ts.filter((t) => !insideLeaf(t.x, t.y));
    expect(edgeLabels.length).toBeGreaterThan(0);
    for (const t of edgeLabels) {
      const lb = {
        x: t.x - LABEL_HALF_W,
        y: t.y - LABEL_HALF_H,
        w: LABEL_HALF_W * 2,
        h: LABEL_HALF_H * 2,
      };
      for (const r of leaves) {
        expect(overlapArea(lb, r)).toBeLessThan(LABEL_HALF_W * LABEL_HALF_H * 0.8);
      }
    }
  });

  it('separates the two NewValuePreview -> NewValueSelection labels', () => {
    const scene = compile(CANONICAL);
    const ts = texts(scene.children);
    const rejected = ts.find((t) => t.text === 'EvNewValueRejected');
    const saved = ts.find((t) => t.text === 'EvNewValueSaved');
    expect(rejected).toBeDefined();
    expect(saved).toBeDefined();
    const vsep = Math.abs(rejected!.y - saved!.y);
    const hsep = Math.abs(rejected!.x - saved!.x);
    expect(vsep > 12 || hsep > 60).toBe(true);
  });

  it('places the three Ev* labels clear of each other and of the NewValueSelection node', () => {
    // Direct-coordinate gate (the real fidelity check — the structural harness
    // alone fooled us once). We model each Ev* label by its REAL rendered box
    // (chars × fontSize × 0.6 wide, fontSize × 1.2 tall, anchored on its centred
    // <text>), then assert (a) no two of the three label boxes overlap, and
    // (b) none overlaps the NewValueSelection leaf node box.
    const scene = compile(CANONICAL);
    const ts = texts(scene.children);
    const rs = rects(scene.children);

    const FONT = 11; // EDGE_LABEL_FONT in nested.ts
    const CHAR_W = 0.6; // measureText's AVG_CHAR_W_RATIO
    const labelBox = (t: TextShape): {
      x: number;
      y: number;
      x2: number;
      y2: number;
    } => {
      const fs = t.font?.size ?? FONT;
      const w = t.text.length * fs * CHAR_W;
      const h = fs * 1.2;
      return { x: t.x - w / 2, y: t.y - h / 2, x2: t.x + w / 2, y2: t.y + h / 2 };
    };
    const overlaps = (
      a: { x: number; y: number; x2: number; y2: number },
      b: { x: number; y: number; x2: number; y2: number },
    ): boolean => {
      const ox = Math.min(a.x2, b.x2) - Math.max(a.x, b.x);
      const oy = Math.min(a.y2, b.y2) - Math.max(a.y, b.y);
      return ox > 1 && oy > 1; // >1px on both axes = real overlap
    };

    const names = ['EvNewValue', 'EvNewValueRejected', 'EvNewValueSaved'];
    const evBoxes = names.map((n) => {
      const t = ts.find((x) => x.text === n);
      expect(t, `label ${n} should be rendered`).toBeDefined();
      return labelBox(t!);
    });

    // (a) No two of the three label boxes overlap.
    for (let i = 0; i < evBoxes.length; i++) {
      for (let j = i + 1; j < evBoxes.length; j++) {
        expect(
          overlaps(evBoxes[i]!, evBoxes[j]!),
          `${names[i]} overlaps ${names[j]}`,
        ).toBe(false);
      }
    }

    // (b) None overlaps the NewValueSelection leaf node box. The node box is the
    // leaf rect (not strictly containing another rect) that hosts the
    // "NewValueSelection" title text.
    const nvText = ts.find((t) => t.text === 'NewValueSelection');
    expect(nvText).toBeDefined();
    const isContainer = (r: RectShape): boolean =>
      rs.some(
        (o) =>
          o !== r &&
          o.x > r.x &&
          o.y > r.y &&
          o.x + o.w < r.x + r.w &&
          o.y + o.h < r.y + r.h,
      );
    const nvRect = rs
      .filter((r) => !isContainer(r))
      .find(
        (r) =>
          nvText!.x >= r.x &&
          nvText!.x <= r.x + r.w &&
          nvText!.y >= r.y &&
          nvText!.y <= r.y + r.h,
      );
    expect(nvRect, 'NewValueSelection leaf box should be found').toBeDefined();
    const nvBox = {
      x: nvRect!.x,
      y: nvRect!.y,
      x2: nvRect!.x + nvRect!.w,
      y2: nvRect!.y + nvRect!.h,
    };
    for (let i = 0; i < evBoxes.length; i++) {
      expect(
        overlaps(evBoxes[i]!, nvBox),
        `${names[i]} overlaps NewValueSelection node`,
      ).toBe(false);
    }
  });

  it('bows the bidirectional NewValueSelection <-> NewValuePreview pair to opposite sides', () => {
    const scene = compile(CANONICAL);
    // The three transitions between this pair are emitted as bowed bezier
    // paths. Find the curves for this node pair and assert their interior
    // join points fall on opposite sides of the start->end baseline.
    const ps = paths(scene.children).map((p) => p.d);
    const offsets: number[] = [];
    for (const d of ps) {
      const start = pathStart(d);
      const join = pathJoin(d);
      if (!join) continue;
      // recover end: last coordinate pair in the string
      const nums = d.match(/-?[\d.]+/g)!.map(Number);
      const end = { x: nums[nums.length - 2]!, y: nums[nums.length - 1]! };
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const len = Math.hypot(dx, dy) || 1;
      const px = -dy / len;
      const py = dx / len;
      const mx = (start.x + end.x) / 2;
      const my = (start.y + end.y) / 2;
      offsets.push((join.x - mx) * px + (join.y - my) * py);
    }
    // At least one pair of bowed curves on opposite sides (one +, one -).
    const hasPos = offsets.some((o) => o > 1);
    const hasNeg = offsets.some((o) => o < -1);
    expect(hasPos && hasNeg).toBe(true);
  });

  it('keeps each Ev* label hugging a transition arc (not orphaned in the margin)', () => {
    // Orphan-regression gate. The previous fix flung parallel-edge labels out to
    // fixed far-margin positions, visually disconnected from their edges. The
    // labels must instead ride their own bowed arcs: each Ev* label centre must
    // sit within a small tolerance of SOME point on an edge polyline (a bezier
    // path or a straight line). We sample every edge stroke densely and assert
    // the nearest sampled point to each label centre is close.
    const scene = compile(CANONICAL);
    const ts = texts(scene.children);

    // Collect every edge stroke as a dense point sequence.
    const strokes: Array<Array<{ x: number; y: number }>> = [];
    for (const l of lines(scene.children)) {
      strokes.push([{ x: l.x1, y: l.y1 }, { x: l.x2, y: l.y2 }]);
    }
    for (const p of paths(scene.children)) {
      const nums = p.d.match(/-?[\d.]+/g)!.map(Number);
      const ctrl: Array<{ x: number; y: number }> = [];
      for (let i = 0; i + 1 < nums.length; i += 2) ctrl.push({ x: nums[i]!, y: nums[i + 1]! });
      strokes.push(ctrl);
    }
    // Linearly densify each stroke's control hull (the rendered curve lies
    // inside the hull, so hull samples bound the true distance from above).
    const samples: Array<{ x: number; y: number }> = [];
    for (const s of strokes) {
      for (let i = 1; i < s.length; i++) {
        for (let k = 0; k <= 10; k++) {
          const t = k / 10;
          samples.push({
            x: s[i - 1]!.x + (s[i]!.x - s[i - 1]!.x) * t,
            y: s[i - 1]!.y + (s[i]!.y - s[i - 1]!.y) * t,
          });
        }
      }
    }
    const nearestEdgeDist = (cx: number, cy: number): number => {
      let best = Infinity;
      for (const q of samples) {
        const d = Math.hypot(cx - q.x, cy - q.y);
        if (d < best) best = d;
      }
      return best;
    };

    const names = ['EvNewValue', 'EvNewValueRejected', 'EvNewValueSaved'];
    for (const n of names) {
      const t = ts.find((x) => x.text === n);
      expect(t, `label ${n} should be rendered`).toBeDefined();
      const d = nearestEdgeDist(t!.x, t!.y);
      // 30px: the label centre rides just outboard of its own arc apex. A label
      // flung to the far margin (the old regression) lands 100px+ from any edge.
      expect(d, `${n} is ${d.toFixed(1)}px from the nearest edge — orphaned?`).toBeLessThan(30);
    }
  });

  it('routes a straight edge around an intervening sibling node', () => {
    // C sits geometrically between A and D in a single composite row, so the
    // A -> D edge must detour around it rather than pass through it.
    const ROUTE = `@startuml
state Outer {
  A -> B
  B -> C
  C -> D
  A --> D : skip
}
@enduml`;
    const scene = compile(ROUTE);
    const rs = rects(scene.children);
    // Identify leaf node boxes (those not strictly containing another rect).
    const leaves = rs.filter(
      (r) =>
        !rs.some(
          (o) =>
            o !== r &&
            o.x > r.x &&
            o.y > r.y &&
            o.x + o.w < r.x + r.w &&
            o.y + o.h < r.y + r.h,
        ),
    );
    // The A -> D edge: a bezier path (routed) OR a straight line. Gather every
    // edge stroke (lines + path control points) and assert no interior sample
    // of any stroke passes strictly through a leaf box that is not its endpoint.
    const ls = lines(scene.children);
    const strokes: Array<Array<{ x: number; y: number }>> = [];
    for (const l of ls) strokes.push([{ x: l.x1, y: l.y1 }, { x: l.x2, y: l.y2 }]);
    for (const p of paths(scene.children)) {
      const nums = p.d.match(/-?[\d.]+/g)!.map(Number);
      const pts: Array<{ x: number; y: number }> = [];
      for (let i = 0; i + 1 < nums.length; i += 2) pts.push({ x: nums[i]!, y: nums[i + 1]! });
      strokes.push(pts);
    }
    const densify = (pts: Array<{ x: number; y: number }>) => {
      const out: Array<{ x: number; y: number }> = [];
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1]!;
        const b = pts[i]!;
        const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 5));
        for (let k = 0; k <= n; k++) {
          out.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
        }
      }
      return out;
    };
    const strictlyInside = (
      pt: { x: number; y: number },
      r: RectShape,
    ): boolean => pt.x > r.x + 4 && pt.x < r.x + r.w - 4 && pt.y > r.y + 4 && pt.y < r.y + r.h - 4;

    for (const stroke of strokes) {
      if (stroke.length < 2) continue;
      const dense = densify(stroke);
      const first = stroke[0]!;
      const last = stroke[stroke.length - 1]!;
      const interior = dense.slice(1, -1);
      for (const leaf of leaves) {
        const isEndpoint =
          (first.x >= leaf.x - 6 && first.x <= leaf.x + leaf.w + 6 &&
            first.y >= leaf.y - 6 && first.y <= leaf.y + leaf.h + 6) ||
          (last.x >= leaf.x - 6 && last.x <= leaf.x + leaf.w + 6 &&
            last.y >= leaf.y - 6 && last.y <= leaf.y + leaf.h + 6);
        if (isEndpoint) continue;
        const through = interior.some((p) => strictlyInside(p, leaf));
        expect(through).toBe(false);
      }
    }
  });
});

describe('common edges — separatedSplinePoints (F2b helper)', () => {
  it('returns the input unchanged for a zero displacement (single-edge case)', () => {
    const base = [
      { x: 0, y: 0 },
      { x: 0, y: 100 },
    ];
    const out = separatedSplinePoints(base, 0);
    // Same reference / same geometry — byte-identical straight edge.
    expect(out).toBe(base);
  });

  it('keeps endpoints anchored and bows the interior perpendicular to the baseline', () => {
    // Vertical baseline (0,0)->(0,100). A +10 displacement must push the
    // inserted midpoint +10 along the perpendicular (+x), endpoints pinned.
    const base = [
      { x: 0, y: 0 },
      { x: 0, y: 100 },
    ];
    const out = separatedSplinePoints(base, 10);
    expect(out.length).toBe(3);
    expect(out[0]).toEqual({ x: 0, y: 0 });
    expect(out[2]).toEqual({ x: 0, y: 100 });
    // Midpoint bowed out perpendicular to the downward baseline. The perp unit
    // vector is (-dy, dx)/len = (-1, 0), so a +10 displacement lands at x=-10.
    expect(out[1]!.x).toBeCloseTo(-10, 6);
    expect(out[1]!.y).toBeCloseTo(50, 6);
    // Magnitude of the bow equals |displacement|.
    expect(Math.abs(out[1]!.x)).toBeCloseTo(10, 6);
  });

  it('bows opposite-signed displacements to opposite sides', () => {
    const base = [
      { x: 0, y: 0 },
      { x: 0, y: 100 },
    ];
    const plus = separatedSplinePoints(base, 12);
    const minus = separatedSplinePoints(base, -12);
    // Same endpoints, mirror-image interior control point on opposite sides.
    expect(plus[1]!.x).toBeCloseTo(-12, 6);
    expect(minus[1]!.x).toBeCloseTo(12, 6);
    expect(Math.sign(plus[1]!.x)).toBe(-Math.sign(minus[1]!.x));
  });
});

describe('state layout — multi-edge spline separation (F2b)', () => {
  function paths(shapes: Shape[]): PathShape[] {
    return shapes.filter((s): s is PathShape => s.type === 'path');
  }

  // Parse the cubic-Bezier `d` string into its on-curve points: the initial
  // `M` point plus the final point of every `C` segment. The interior control
  // hull (the bowed midpoint) is reflected in the segment count.
  function pathStartEnd(d: string): { start: [number, number]; end: [number, number] } {
    const mMatch = d.match(/M\s+([-\d.]+)\s+([-\d.]+)/)!;
    const start: [number, number] = [Number(mMatch[1]), Number(mMatch[2])];
    const lastC = d.lastIndexOf(' C ');
    const tail = d.slice(lastC + 3).split(',').pop()!.trim();
    const [ex, ey] = tail.split(/\s+/);
    return { start, end: [Number(ex), Number(ey)] };
  }

  // The "bow" of a 2-segment bezier (our N≥2 separated spline) is the
  // perpendicular displacement of the shared interior point from the
  // start→end baseline. We recover it from the join point of the two `C`
  // commands (= the displaced midpoint).
  function bowSignedOffset(d: string): number {
    const { start, end } = pathStartEnd(d);
    // First `C cp1, cp2, joinX joinY` — the join point is the displaced mid.
    const firstC = d.indexOf(' C ');
    const seg = d.slice(firstC + 3, d.indexOf(' C ', firstC + 3));
    const join = seg.split(',').pop()!.trim().split(/\s+/);
    const jx = Number(join[0]);
    const jy = Number(join[1]);
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const len = Math.hypot(dx, dy) || 1;
    // Perpendicular unit vector.
    const px = -dy / len;
    const py = dx / len;
    const mx = (start[0] + end[0]) / 2;
    const my = (start[1] + end[1]) / 2;
    return (jx - mx) * px + (jy - my) * py;
  }

  const PARALLEL = [
    '@startuml',
    '[*] --> A',
    'A --> B : fwd',
    'A --> B : fwd2',
    '@enduml',
  ].join('\n');

  const BIDIR = [
    '@startuml',
    '[*] --> A',
    'A --> B : fwd',
    'B --> A : back',
    '@enduml',
  ].join('\n');

  it('draws two parallel A→B edges as geometrically distinct splines', () => {
    const scene = compile(PARALLEL);
    const ps = paths(scene.children);
    // The two parallel A↔B edges each become a separated bezier path.
    expect(ps.length).toBe(2);
    const off0 = bowSignedOffset(ps[0]!.d);
    const off1 = bowSignedOffset(ps[1]!.d);
    // Their interior control points are displaced from the baseline by a
    // clearly non-trivial gap (not just label offsets) — distinct PATHS.
    expect(Math.abs(off0 - off1)).toBeGreaterThan(10);
  });

  it('keeps parallel edge endpoints anchored on the shared node boundary', () => {
    const scene = compile(PARALLEL);
    const ps = paths(scene.children);
    expect(ps.length).toBe(2);
    const a = pathStartEnd(ps[0]!.d);
    const b = pathStartEnd(ps[1]!.d);
    // Both edges share the same anchored start/end on the node boundaries —
    // only the interior bows out.
    expect(a.start[0]).toBeCloseTo(b.start[0], 6);
    expect(a.start[1]).toBeCloseTo(b.start[1], 6);
    expect(a.end[0]).toBeCloseTo(b.end[0], 6);
    expect(a.end[1]).toBeCloseTo(b.end[1], 6);
  });

  it('bows a bidirectional A↔B pair to opposite sides of the baseline', () => {
    const scene = compile(BIDIR);
    const ps = paths(scene.children);
    expect(ps.length).toBe(2);
    const off0 = bowSignedOffset(ps[0]!.d);
    const off1 = bowSignedOffset(ps[1]!.d);
    // Opposite-signed perpendicular displacements → the two arrows no longer
    // overlap on the same line (problem #4). Both bows are non-trivial.
    expect(Math.sign(off0)).toBe(-Math.sign(off1));
    expect(Math.abs(off0)).toBeGreaterThan(4);
    expect(Math.abs(off1)).toBeGreaterThan(4);
  });

  it('leaves a single edge straight (no curve injected, endpoints on boundary)', () => {
    const src = [
      '@startuml',
      '[*] --> A',
      'A --> B : only',
      '@enduml',
    ].join('\n');
    const scene = compile(src);
    // A single (non-multi-rank) edge stays a straight <line>: no path bowing.
    expect(paths(scene.children).length).toBe(0);
    const lines = scene.children.filter(
      (s): s is LineShape => s.type === 'line',
    );
    // The A→B edge is a straight vertical line between the two node columns
    // (same x for both endpoints since A and B stack vertically).
    const ab = lines.find((l) => Math.abs(l.x1 - l.x2) < 1e-6 && l.y2 > l.y1 + 20);
    expect(ab).toBeDefined();
  });
});
