import { describe, it, expect } from 'vitest';
import { parseSequence } from '../../src/parser/sequence/index.js';

function ast(src: string) {
  return parseSequence(src);
}

describe('sequence parser — participants', () => {
  it('parses bare participant declarations', () => {
    const a = ast('@startuml\nparticipant Alice\nactor Bob\n@enduml');
    expect(a.participants).toEqual([
      { id: 'Alice', label: 'Alice', shape: 'participant' },
      { id: 'Bob', label: 'Bob', shape: 'actor' },
    ]);
  });

  it('parses quoted labels', () => {
    const a = ast('@startuml\nparticipant "Alice the Great"\n@enduml');
    expect(a.participants[0]).toEqual({
      id: 'Alice the Great',
      label: 'Alice the Great',
      shape: 'participant',
    });
  });

  it('parses alias with `as`', () => {
    const a = ast('@startuml\nparticipant "Alice the Great" as A\n@enduml');
    expect(a.participants[0]).toEqual({
      id: 'A',
      label: 'Alice the Great',
      shape: 'participant',
    });
  });

  it('supports all 8 participant shapes', () => {
    const a = ast(
      '@startuml\nparticipant P\nactor A\nboundary B\ncontrol C\nentity E\ndatabase D\nqueue Q\ncollections X\n@enduml',
    );
    expect(a.participants.map((p) => p.shape)).toEqual([
      'participant', 'actor', 'boundary', 'control', 'entity', 'database', 'queue', 'collections',
    ]);
  });

  it('adds implicit participants from messages in declaration order', () => {
    const a = ast('@startuml\nAlice -> Bob: hi\nCharlie -> Alice: yo\n@enduml');
    expect(a.participants.map((p) => p.id)).toEqual(['Alice', 'Bob', 'Charlie']);
  });
});

describe('sequence parser — messages', () => {
  it('parses solid right arrow', () => {
    const a = ast('@startuml\nA -> B: hello\n@enduml');
    expect(a.statements[0]).toMatchObject({ type: 'message', from: 'A', to: 'B', text: 'hello', style: 'solid', reverse: false });
  });

  it('parses dashed right arrow', () => {
    const a = ast('@startuml\nA --> B: reply\n@enduml');
    expect(a.statements[0]).toMatchObject({ type: 'message', from: 'A', to: 'B', style: 'dashed' });
  });

  it('parses left arrows by swapping from/to and setting reverse', () => {
    const a = ast('@startuml\nA <- B: pull\n@enduml');
    expect(a.statements[0]).toMatchObject({ type: 'message', from: 'B', to: 'A', reverse: true });
  });

  it('handles quoted names in messages', () => {
    const a = ast('@startuml\n"Alice 1" -> "Bob 2": hi\n@enduml');
    expect(a.statements[0]).toMatchObject({ from: 'Alice 1', to: 'Bob 2' });
  });

  it('parses message without text', () => {
    const a = ast('@startuml\nA -> B\n@enduml');
    expect(a.statements[0]).toMatchObject({ type: 'message', text: '' });
  });
});

describe('sequence parser — notes', () => {
  it('parses inline note left/right of', () => {
    const a = ast('@startuml\nparticipant A\nnote left of A : memo\nnote right of A : memo2\n@enduml');
    expect(a.statements).toMatchObject([
      { type: 'note', position: 'left', targets: ['A'], text: 'memo' },
      { type: 'note', position: 'right', targets: ['A'], text: 'memo2' },
    ]);
  });

  it('parses inline note over single and two participants', () => {
    const a = ast('@startuml\nnote over A : single\nnote over A, B : both\n@enduml');
    expect(a.statements[0]).toMatchObject({ type: 'note', position: 'over', targets: ['A'], text: 'single' });
    expect(a.statements[1]).toMatchObject({ type: 'note', position: 'over', targets: ['A', 'B'], text: 'both' });
  });

  it('parses multi-line note with end note', () => {
    const src = '@startuml\nnote over A\nline 1\nline 2\nend note\n@enduml';
    const a = ast(src);
    expect(a.statements[0]).toMatchObject({ type: 'note', position: 'over', text: 'line 1\nline 2' });
  });
});

describe('sequence parser — activations', () => {
  it('parses activate/deactivate', () => {
    const a = ast('@startuml\nactivate A\ndeactivate A\n@enduml');
    expect(a.statements).toMatchObject([
      { type: 'activate', target: 'A' },
      { type: 'deactivate', target: 'A' },
    ]);
  });
});

describe('sequence parser — groups', () => {
  it('parses group/end', () => {
    const a = ast('@startuml\ngroup My label\nA -> B\nend\n@enduml');
    expect(a.statements[0]).toMatchObject({ type: 'groupStart', kind: 'group', label: 'My label' });
    expect(a.statements[2]).toMatchObject({ type: 'groupEnd' });
  });

  it('parses alt/else/end', () => {
    const a = ast('@startuml\nalt success\nA -> B\nelse failure\nA -> C\nend\n@enduml');
    const types = a.statements.map((s) => s.type);
    expect(types).toEqual(['groupStart', 'message', 'groupElse', 'message', 'groupEnd']);
    expect(a.statements[0]).toMatchObject({ kind: 'alt', label: 'success' });
    expect(a.statements[2]).toMatchObject({ type: 'groupElse', label: 'failure' });
  });

  it('parses all group kinds', () => {
    const kinds = ['group', 'alt', 'opt', 'loop', 'par', 'break', 'critical'] as const;
    for (const k of kinds) {
      const a = ast(`@startuml\n${k} cond\nA -> B\nend\n@enduml`);
      expect(a.statements[0]).toMatchObject({ type: 'groupStart', kind: k });
    }
  });
});

describe('sequence parser — autonumber', () => {
  it('parses bare autonumber', () => {
    const a = ast('@startuml\nautonumber\n@enduml');
    expect(a.statements[0]).toEqual({ type: 'autonumber', start: 1, step: 1 });
  });

  it('parses autonumber with start', () => {
    const a = ast('@startuml\nautonumber 10\n@enduml');
    expect(a.statements[0]).toEqual({ type: 'autonumber', start: 10, step: 1 });
  });

  it('parses autonumber with start and step', () => {
    const a = ast('@startuml\nautonumber 10 5\n@enduml');
    expect(a.statements[0]).toEqual({ type: 'autonumber', start: 10, step: 5 });
  });
});

describe('sequence parser — misc', () => {
  it('skips blank lines and line comments', () => {
    const a = ast("@startuml\n\n'a comment\nA -> B: hi\n@enduml");
    expect(a.statements).toHaveLength(1);
  });

  it('captures title (not as a statement)', () => {
    const a = ast('@startuml\ntitle My Title\nA -> B\n@enduml');
    expect(a.title).toBe('My Title');
    expect(a.statements).toHaveLength(1);
    expect(a.statements[0]?.type).toBe('message');
  });

  it('defaults title to empty string when absent', () => {
    const a = ast('@startuml\nA -> B\n@enduml');
    expect(a.title).toBe('');
  });

  it('parses == text == as a divider', () => {
    const a = ast('@startuml\nA -> B\n== checkpoint ==\nA -> B\n@enduml');
    const dividers = a.statements.filter((s) => s.type === 'divider');
    expect(dividers).toHaveLength(1);
    expect(dividers[0]).toEqual({ type: 'divider', label: 'checkpoint' });
  });
});
