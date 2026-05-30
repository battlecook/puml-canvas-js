import { describe, it, expect } from 'vitest';
import { parseState } from '../../src/parser/state/index.js';

function ast(src: string) {
  return parseState(src);
}

describe('state parser', () => {
  it('parses plain state declarations', () => {
    const a = ast('@startuml\nstate Active\nstate Inactive\n@enduml');
    expect(a.states.map((s) => ({ id: s.id, kind: s.stateKind }))).toEqual([
      { id: 'Active', kind: 'normal' },
      { id: 'Inactive', kind: 'normal' },
    ]);
  });

  it('maps stereotypes to state kinds', () => {
    const a = ast([
      '@startuml',
      'state C <<choice>>',
      'state F <<fork>>',
      'state J <<join>>',
      'state H <<history>>',
      '@enduml',
    ].join('\n'));
    expect(a.states.map((s) => s.stateKind)).toEqual(['choice', 'fork', 'join', 'history']);
  });

  it('treats [*] as source = initial pseudo-state', () => {
    const a = ast('@startuml\n[*] --> Active\n@enduml');
    const initial = a.states.find((s) => s.stateKind === 'initial');
    expect(initial).toBeDefined();
    expect(a.transitions[0]?.source).toBe(initial?.id);
  });

  it('treats [*] as target = final pseudo-state', () => {
    const a = ast('@startuml\nActive --> [*]\n@enduml');
    const final = a.states.find((s) => s.stateKind === 'final');
    expect(final).toBeDefined();
    expect(a.transitions[0]?.target).toBe(final?.id);
  });

  it('captures transition labels', () => {
    const a = ast('@startuml\nA --> B : event [guard] / action\n@enduml');
    expect(a.transitions[0]?.label).toBe('event [guard] / action');
  });

  it('supports `state X as Y` aliases', () => {
    const a = ast('@startuml\nstate "Long Name" as L\n@enduml');
    expect(a.states[0]).toMatchObject({ id: 'L', name: 'Long Name' });
  });

  it('captures title', () => {
    const a = ast('@startuml\ntitle My state machine\n[*] --> A\n@enduml');
    expect(a.title).toBe('My state machine');
  });

  it('creates a single initial and single final node across multiple uses', () => {
    const a = ast('@startuml\n[*] --> A\n[*] --> B\nA --> [*]\nB --> [*]\n@enduml');
    expect(a.states.filter((s) => s.stateKind === 'initial')).toHaveLength(1);
    expect(a.states.filter((s) => s.stateKind === 'final')).toHaveLength(1);
  });

  it('parses `state X : description` without style fields', () => {
    const a = ast('@startuml\nstate s1 : s1 description\n@enduml');
    const s1 = a.states.find((s) => s.id === 's1');
    expect(s1).toBeDefined();
    expect(s1?.description).toBe('s1 description');
    expect(s1?.fill).toBeUndefined();
    expect(s1?.lineColor).toBeUndefined();
    expect(s1?.lineStyle).toBeUndefined();
    expect(s1?.textColor).toBeUndefined();
  });

  it('accumulates standalone `Name : text` lines as description rows', () => {
    const a = ast([
      '@startuml',
      '[*] --> State1',
      'State1 --> [*]',
      'State1 : this is a string',
      'State1 : this is another string',
      'State1 -> State2',
      'State2 --> [*]',
      '@enduml',
    ].join('\n'));
    const s1 = a.states.find((s) => s.id === 'State1');
    expect(s1).toBeDefined();
    expect(s1?.descriptions).toEqual([
      'this is a string',
      'this is another string',
    ]);
  });

  it('parses inline style suffix on state declarations', () => {
    const src = [
      '@startuml',
      'state s1 : s1 description',
      'state s2 #pink;line:red;line.bold;text:red : s2 description',
      'state s3 #palegreen;line:green;line.dashed;text:green : s3 description',
      'state s4 #aliceblue;line:blue;line.dotted;text:blue : s4 description',
      '@enduml',
    ].join('\n');
    const a = ast(src);
    const byId = new Map(a.states.map((s) => [s.id, s]));

    expect(byId.get('s1')).toMatchObject({
      description: 's1 description',
    });
    expect(byId.get('s1')?.fill).toBeUndefined();

    expect(byId.get('s2')).toMatchObject({
      description: 's2 description',
      fill: 'pink',
      lineColor: 'red',
      lineStyle: 'bold',
      textColor: 'red',
    });
    expect(byId.get('s3')).toMatchObject({
      description: 's3 description',
      fill: 'palegreen',
      lineColor: 'green',
      lineStyle: 'dashed',
      textColor: 'green',
    });
    expect(byId.get('s4')).toMatchObject({
      description: 's4 description',
      fill: 'aliceblue',
      lineColor: 'blue',
      lineStyle: 'dotted',
      textColor: 'blue',
    });
  });

  it('keeps sibling composite states at top level when one references the other before declaration', () => {
    const src = [
      '@startuml',
      '[*] --> NotShooting',
      'state NotShooting {',
      '  [*] --> Idle',
      '  Idle --> Configuring : EvConfig',
      '  Configuring --> Idle : EvConfig',
      '}',
      'state Configuring {',
      '  [*] --> NewValueSelection',
      '  NewValueSelection --> NewValuePreview : EvNewValue',
      '  NewValuePreview --> NewValueSelection : EvNewValueRejected',
      '  NewValuePreview --> NewValueSelection : EvNewValueSaved',
      '  state NewValuePreview {',
      '    State1 -> State2',
      '  }',
      '}',
      '@enduml',
    ].join('\n');
    const a = ast(src);
    const topIds = a.states.map((s) => s.id);
    expect(topIds).toContain('NotShooting');
    expect(topIds).toContain('Configuring');

    const notShooting = a.states.find((s) => s.id === 'NotShooting')!;
    const configuring = a.states.find((s) => s.id === 'Configuring')!;

    // NotShooting should have Idle as a child but NOT Configuring (which is a sibling).
    const notShootingChildIds = notShooting.children.map((c) => c.id);
    expect(notShootingChildIds).toContain('Idle');
    expect(notShootingChildIds).not.toContain('Configuring');

    // Configuring contains NewValueSelection and NewValuePreview.
    const configChildIds = configuring.children.map((c) => c.id);
    expect(configChildIds).toContain('NewValueSelection');
    expect(configChildIds).toContain('NewValuePreview');

    // NewValuePreview is nested inside Configuring with State1+State2.
    const nvp = configuring.children.find((c) => c.id === 'NewValuePreview')!;
    const nvpChildIds = nvp.children.map((c) => c.id);
    expect(nvpChildIds).toEqual(expect.arrayContaining(['State1', 'State2']));
  });

  it('parses [H] and [H*] history pseudo-states inside a composite', () => {
    const src = [
      '@startuml',
      '[*] -> State1',
      'State1 --> State2 : Succeeded',
      'State1 --> [*] : Aborted',
      'State2 --> State3 : Succeeded',
      'State2 --> [*] : Aborted',
      'state State3 {',
      '  state "Accumulate Enough Data" as long1',
      '  long1 : Just a test',
      '  [*] --> long1',
      '  long1 --> long1 : New Data',
      '  long1 --> ProcessData : Enough Data',
      '  State2 --> [H]: Resume',
      '}',
      'State3 --> State2 : Pause',
      'State2 --> State3[H*]: DeepResume',
      'State3 --> State3 : Failed',
      'State3 --> [*] : Succeeded / Save Result',
      'State3 --> [*] : Aborted',
      '@enduml',
    ].join('\n');
    const a = ast(src);
    const state3 = a.states.find((s) => s.id === 'State3');
    expect(state3).toBeDefined();
    const histories = state3!.children.filter((c) => c.stateKind === 'history');
    expect(histories).toHaveLength(2);
    const shallow = histories.find((h) => !h.isDeep);
    const deep = histories.find((h) => h.isDeep === true);
    expect(shallow).toBeDefined();
    expect(deep).toBeDefined();
    // Neither `[H]` nor `State3[H*]` should leak as a literal-id normal state.
    const flat = (function flatten(nodes) {
      const out: typeof nodes = [];
      for (const n of nodes) { out.push(n); out.push(...flatten(n.children)); }
      return out;
    })(a.states);
    expect(flat.find((s) => s.id === '[H]')).toBeUndefined();
    expect(flat.find((s) => s.id === 'State3[H*]')).toBeUndefined();
    expect(flat.find((s) => s.id === '[H*]')).toBeUndefined();
  });

  it('splits a composite into concurrent regions on `--` separator lines', () => {
    const src = [
      '@startuml',
      '[*] --> Active',
      'state Active {',
      '  [*] -> NumLockOff',
      '  NumLockOff --> NumLockOn : EvNumLockPressed',
      '  NumLockOn --> NumLockOff : EvNumLockPressed',
      '  --',
      '  [*] -> CapsLockOff',
      '  CapsLockOff --> CapsLockOn : EvCapsLockPressed',
      '  CapsLockOn --> CapsLockOff : EvCapsLockPressed',
      '  --',
      '  [*] -> ScrollLockOff',
      '  ScrollLockOff --> ScrollLockOn : EvScrollLockPressed',
      '  ScrollLockOn --> ScrollLockOff : EvScrollLockPressed',
      '}',
      '@enduml',
    ].join('\n');
    const a = ast(src);
    const active = a.states.find((s) => s.id === 'Active')!;
    expect(active).toBeDefined();
    expect(active.regions).toBeDefined();
    expect(active.regions!.length).toBe(3);

    // Each region contains its own initial pseudo-state plus the two named
    // states declared in that region (order: initial, then the two states
    // by source-order first-mention).
    const region0Ids = active.regions![0]!;
    const region1Ids = active.regions![1]!;
    const region2Ids = active.regions![2]!;
    expect(region0Ids.filter((id) => id === 'NumLockOff')).toHaveLength(1);
    expect(region0Ids.filter((id) => id === 'NumLockOn')).toHaveLength(1);
    expect(region1Ids.filter((id) => id === 'CapsLockOff')).toHaveLength(1);
    expect(region1Ids.filter((id) => id === 'CapsLockOn')).toHaveLength(1);
    expect(region2Ids.filter((id) => id === 'ScrollLockOff')).toHaveLength(1);
    expect(region2Ids.filter((id) => id === 'ScrollLockOn')).toHaveLength(1);

    // No cross-region bleed: NumLock states are NOT in region 1 or 2, etc.
    expect(region1Ids).not.toContain('NumLockOff');
    expect(region2Ids).not.toContain('CapsLockOff');

    // Each region has its OWN initial pseudo-state. Three distinct initial
    // ids exist as Active's children.
    const initials = active.children.filter((c) => c.stateKind === 'initial');
    expect(initials).toHaveLength(3);
    expect(new Set(initials.map((s) => s.id)).size).toBe(3);
  });

  it('also accepts `||` as a region separator', () => {
    const src = [
      '@startuml',
      'state Active {',
      '  A --> B',
      '  ||',
      '  C --> D',
      '}',
      '@enduml',
    ].join('\n');
    const a = ast(src);
    const active = a.states.find((s) => s.id === 'Active')!;
    expect(active.regions).toBeDefined();
    expect(active.regions!.length).toBe(2);
    expect(active.regions![0]).toEqual(expect.arrayContaining(['A', 'B']));
    expect(active.regions![1]).toEqual(expect.arrayContaining(['C', 'D']));
  });

  it('leaves `regions` undefined for single-region composites (back-compat)', () => {
    const src = [
      '@startuml',
      'state Active {',
      '  A --> B',
      '  B --> C',
      '}',
      '@enduml',
    ].join('\n');
    const a = ast(src);
    const active = a.states.find((s) => s.id === 'Active')!;
    expect(active.regions).toBeUndefined();
    expect(active.regionDirection).toBeUndefined();
  });

  it('records regionDirection="vertical" for composites split by `--`', () => {
    const src = [
      '@startuml',
      'state Active {',
      '  A --> B',
      '  --',
      '  C --> D',
      '}',
      '@enduml',
    ].join('\n');
    const a = ast(src);
    const active = a.states.find((s) => s.id === 'Active')!;
    expect(active.regions).toBeDefined();
    expect(active.regionDirection).toBe('vertical');
  });

  it('records regionDirection="horizontal" for composites split by `||`', () => {
    const src = [
      '@startuml',
      'state Active {',
      '  A --> B',
      '  ||',
      '  C --> D',
      '}',
      '@enduml',
    ].join('\n');
    const a = ast(src);
    const active = a.states.find((s) => s.id === 'Active')!;
    expect(active.regions).toBeDefined();
    expect(active.regionDirection).toBe('horizontal');
  });

  it('captures transition labels for cross-composite arrows', () => {
    const src = [
      '@startuml',
      'state NotShooting {',
      '  Idle --> Configuring : EvConfig',
      '}',
      'state Configuring {',
      '  NewValueSelection --> NewValuePreview : EvNewValue',
      '}',
      '@enduml',
    ].join('\n');
    const a = ast(src);
    const labels = a.transitions.map((t) => t.label);
    expect(labels).toContain('EvConfig');
    expect(labels).toContain('EvNewValue');
  });
});
