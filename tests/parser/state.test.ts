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
});
