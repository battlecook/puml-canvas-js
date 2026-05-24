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
});
