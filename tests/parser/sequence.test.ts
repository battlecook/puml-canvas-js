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
    expect(a.statements[0]).toEqual({ type: 'autonumber', mode: 'set', start: [1], step: 1 });
  });

  it('parses autonumber with start', () => {
    const a = ast('@startuml\nautonumber 10\n@enduml');
    expect(a.statements[0]).toEqual({ type: 'autonumber', mode: 'set', start: [10], step: 1 });
  });

  it('parses autonumber with start and step', () => {
    const a = ast('@startuml\nautonumber 10 5\n@enduml');
    expect(a.statements[0]).toEqual({ type: 'autonumber', mode: 'set', start: [10], step: 5 });
  });

  it('parses multi-level start (`autonumber 1.1.1`) and `inc <letter>`', () => {
    const a = ast(
      [
        '@startuml',
        'autonumber 1.1.1',
        'autonumber inc A',
        'autonumber inc B',
        '@enduml',
      ].join('\n'),
    );
    expect(a.statements[0]).toEqual({
      type: 'autonumber', mode: 'set', start: [1, 1, 1], step: 1,
    });
    expect(a.statements[1]).toEqual({ type: 'autonumber', mode: 'inc', incLevel: 0 });
    expect(a.statements[2]).toEqual({ type: 'autonumber', mode: 'inc', incLevel: 1 });
  });

  it('parses `autonumber stop` and `autonumber resume`', () => {
    const a = ast(
      [
        '@startuml',
        'autonumber 10 10 "<b>[000]"',
        'A -> B : x',
        'autonumber stop',
        'A -> B : y',
        'autonumber resume "<b>m"',
        'A -> B : z',
        'autonumber stop',
        'A -> B : w',
        'autonumber resume 1 "<b>n"',
        'A -> B : v',
        '@enduml',
      ].join('\n'),
    );
    const auto = a.statements.filter((s) => s.type === 'autonumber') as Array<{
      mode: string; start?: number[]; step?: number; format?: string;
    }>;
    expect(auto).toHaveLength(5);
    expect(auto[0]).toEqual({ type: 'autonumber', mode: 'set', start: [10], step: 10, format: '<b>[000]' });
    expect(auto[1]).toEqual({ type: 'autonumber', mode: 'stop' });
    expect(auto[2]).toEqual({ type: 'autonumber', mode: 'resume', format: '<b>m' });
    expect(auto[3]).toEqual({ type: 'autonumber', mode: 'stop' });
    expect(auto[4]).toEqual({ type: 'autonumber', mode: 'resume', step: 1, format: '<b>n' });
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

describe('sequence parser — participants extended', () => {
  it('parses `actor Bob #red` — color stored, shape = actor', () => {
    const a = ast('@startuml\nactor Bob #red\n@enduml');
    expect(a.participants[0]).toMatchObject({
      id: 'Bob', label: 'Bob', shape: 'actor', color: 'red',
    });
  });

  it('parses `participant "Long" as L #99FF99` — alias, label, hex color', () => {
    const a = ast('@startuml\nparticipant "Long" as L #99FF99\n@enduml');
    expect(a.participants[0]).toMatchObject({
      id: 'L', label: 'Long', shape: 'participant', color: '#99FF99',
    });
  });

  it('converts literal `\\n` in quoted labels to real newlines', () => {
    const a = ast('@startuml\nparticipant "first\\nsecond" as X\n@enduml');
    expect(a.participants[0]!.label).toBe('first\nsecond');
  });

  it("skips block comments `/' ... '/`", () => {
    const a = ast(
      [
        '@startuml',
        "/'",
        '  This is a block comment',
        '  spanning multiple lines',
        "'/",
        'actor A',
        'A -> A: ping',
        '@enduml',
      ].join('\n'),
    );
    expect(a.participants).toHaveLength(1);
    expect(a.statements).toHaveLength(1);
  });

  it('parses `participant X [ ... ]` with creole markers into sections', () => {
    const a = ast(
      [
        '@startuml',
        'participant P [',
        '    =Title',
        '    ----',
        '    ""SubTitle""',
        ']',
        'participant B',
        'P -> B',
        '@enduml',
      ].join('\n'),
    );
    expect(a.participants.map((p) => p.id)).toEqual(['P', 'B']);
    expect(a.participants[0]!.sections).toEqual([
      { lines: [{ text: 'Title', style: 'bold' }] },
      { lines: [{ text: 'SubTitle', style: 'mono' }] },
    ]);
  });

  it('preserves declaration order for sectioned participants', () => {
    // Regression — the block was previously dropped, which would let the
    // message-time auto-registration of the second participant come first.
    const a = ast(
      [
        '@startuml',
        'participant Left [',
        '  =Header',
        ']',
        'participant Right',
        'Left -> Right',
        '@enduml',
      ].join('\n'),
    );
    expect(a.participants.map((p) => p.id)).toEqual(['Left', 'Right']);
  });

  it('parses every arrow marker variant', () => {
    const a = ast(
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
    const msgs = a.statements.filter((s) => s.type === 'message') as Array<{
      startMarker?: string;
      endMarker?: string;
      style: string;
    }>;
    expect(msgs).toHaveLength(10);
    expect(msgs[0]).toMatchObject({ startMarker: 'none',   endMarker: 'x',          style: 'solid' });
    expect(msgs[1]).toMatchObject({ startMarker: 'none',   endMarker: 'arrow',      style: 'solid' });
    expect(msgs[2]).toMatchObject({ startMarker: 'none',   endMarker: 'arrow-open', style: 'solid' });
    expect(msgs[3]).toMatchObject({ startMarker: 'none',   endMarker: 'half-up',    style: 'solid' });
    expect(msgs[4]).toMatchObject({ startMarker: 'half-up',   endMarker: 'none',    style: 'solid' });
    expect(msgs[5]).toMatchObject({ startMarker: 'half-down', endMarker: 'none',    style: 'dashed' });
    expect(msgs[6]).toMatchObject({ startMarker: 'none',   endMarker: 'circle',     style: 'solid' });
    expect(msgs[7]).toMatchObject({ startMarker: 'circle', endMarker: 'none',       style: 'dashed' });
    expect(msgs[8]).toMatchObject({ startMarker: 'arrow',  endMarker: 'arrow',      style: 'solid' });
    expect(msgs[9]).toMatchObject({ startMarker: 'arrow',  endMarker: 'circle',     style: 'solid' });
  });

  it('parses `newpage` (bare and with title, \\n unescaped)', () => {
    const a = ast(
      [
        '@startuml',
        'A -> B',
        'newpage',
        'A -> B',
        'newpage A title for the\\nlast page',
        'A -> B',
        '@enduml',
      ].join('\n'),
    );
    const newpages = a.statements.filter((s) => s.type === 'newpage') as Array<{
      title: string;
    }>;
    expect(newpages).toHaveLength(2);
    expect(newpages[0]).toEqual({ type: 'newpage', title: '' });
    expect(newpages[1]).toEqual({ type: 'newpage', title: 'A title for the\nlast page' });
  });

  it('parses inline `header` and `footer`', () => {
    const a = ast(
      [
        '@startuml',
        'header Page Header',
        'footer Page %page% of %lastpage%',
        '@enduml',
      ].join('\n'),
    );
    expect(a.header).toBe('Page Header');
    expect(a.footer).toBe('Page %page% of %lastpage%');
  });

  it('parses block `header ... endheader` and `footer ... endfooter`', () => {
    const a = ast(
      [
        '@startuml',
        'header',
        'Line A',
        'Line B',
        'endheader',
        'footer',
        'Footer line',
        'endfooter',
        '@enduml',
      ].join('\n'),
    );
    expect(a.header).toBe('Line A\nLine B');
    expect(a.footer).toBe('Footer line');
  });

  it('shorthand `note right` / `note left` (no `of`) attaches to last message', () => {
    const a = ast(
      [
        '@startuml',
        'Alice -> Bob',
        'note right',
        '  text',
        'end note',
        'note left',
        '  left text',
        'end note',
        '@enduml',
      ].join('\n'),
    );
    const notes = a.statements.filter((s) => s.type === 'note') as Array<{
      position: string;
      targets: string[];
    }>;
    expect(notes).toHaveLength(2);
    expect(notes[0]).toMatchObject({ position: 'right', targets: ['Bob'] });
    expect(notes[1]).toMatchObject({ position: 'left',  targets: ['Alice'] });
  });

  it('captures autonumber start/step + format string', () => {
    const a = ast(
      [
        '@startuml',
        'autonumber "<b>[000]"',
        'autonumber 15 "<b>(<u>##</u>)"',
        'autonumber 40 10 "<font color=red><b>Message 0  "',
        '@enduml',
      ].join('\n'),
    );
    const auto = a.statements.filter(
      (s) => s.type === 'autonumber',
    ) as Array<{ start: number[]; step: number; format?: string }>;
    expect(auto).toHaveLength(3);
    expect(auto[0]).toMatchObject({ start: [1], step: 1, format: '<b>[000]' });
    expect(auto[1]).toMatchObject({ start: [15], step: 1, format: '<b>(<u>##</u>)' });
    expect(auto[2]).toMatchObject({
      start: [40], step: 10, format: '<font color=red><b>Message 0  ',
    });
  });

  it('parses inline color directive `-[#color]>`', () => {
    const a = ast(
      [
        '@startuml',
        'Bob -[#red]> Alice : hello',
        'Alice -[#0000FF]->Bob : ok',
        '@enduml',
      ].join('\n'),
    );
    const msgs = a.statements.filter((s) => s.type === 'message') as Array<{
      color?: string;
      style: string;
      endMarker?: string;
    }>;
    expect(msgs).toHaveLength(2);
    expect(msgs[0]).toMatchObject({ color: 'red',     style: 'solid',  endMarker: 'arrow' });
    expect(msgs[1]).toMatchObject({ color: '#0000FF', style: 'dashed', endMarker: 'arrow' });
  });

  it('converts literal `\\n` in message text to actual newlines', () => {
    const a = ast('@startuml\nA -> B: line1\\nline2\\nline3\n@enduml');
    const msg = a.statements.find((s) => s.type === 'message') as { text: string };
    expect(msg.text).toBe('line1\nline2\nline3');
  });

  it('groups multiple lines and multiple sections inside the block', () => {
    const a = ast(
      [
        '@startuml',
        'participant X [',
        '  =One',
        '  plain line',
        '  ----',
        '  ""mono one""',
        '  ""mono two""',
        ']',
        '@enduml',
      ].join('\n'),
    );
    expect(a.participants[0]!.sections).toEqual([
      {
        lines: [
          { text: 'One', style: 'bold' },
          { text: 'plain line', style: 'normal' },
        ],
      },
      {
        lines: [
          { text: 'mono one', style: 'mono' },
          { text: 'mono two', style: 'mono' },
        ],
      },
    ]);
  });
});
