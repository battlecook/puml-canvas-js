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

  it('parses trailing `order N` suffix as a column-order hint', () => {
    const a = ast(
      '@startuml\nparticipant Last order 30\nparticipant Middle order 20\nparticipant First order 10\n@enduml',
    );
    // Parser keeps DECLARATION order in the participants array; the `order`
    // field is just stored. Layout (not the parser) reorders the lanes.
    expect(a.participants).toEqual([
      { id: 'Last', label: 'Last', shape: 'participant', order: 30 },
      { id: 'Middle', label: 'Middle', shape: 'participant', order: 20 },
      { id: 'First', label: 'First', shape: 'participant', order: 10 },
    ]);
  });

  it('parses `order N` after an alias and a color', () => {
    const a = ast(
      '@startuml\nparticipant "Display Name" as A #99FF99 order 5\n@enduml',
    );
    expect(a.participants[0]).toEqual({
      id: 'A',
      label: 'Display Name',
      shape: 'participant',
      color: '#99FF99',
      order: 5,
    });
  });

  it('parses `:Name:` colon-shorthand as an actor (id = display name)', () => {
    const a = ast('@startuml\n:First Actor:\n@enduml');
    expect(a.participants).toEqual([
      { id: 'First Actor', label: 'First Actor', shape: 'actor' },
    ]);
  });

  it('parses `:Display\\nname: as Id` colon-shorthand with newline expansion', () => {
    const a = ast('@startuml\n:Another\\nactor: as Man2\n@enduml');
    expect(a.participants).toEqual([
      { id: 'Man2', label: 'Another\nactor', shape: 'actor' },
    ]);
  });

  it('parses `actor :Display Name: as Id` keyword + colon form', () => {
    const a = ast('@startuml\nactor :Last actor: as Person1\n@enduml');
    expect(a.participants).toEqual([
      { id: 'Person1', label: 'Last actor', shape: 'actor' },
    ]);
  });

  it('parses a mixed actor declaration block (all colon variants + plain `actor Id`)', () => {
    const a = ast(
      [
        '@startuml',
        '',
        ':First Actor:',
        ':Another\\nactor: as Man2',
        'actor Woman3',
        'actor :Last actor: as Person1',
        '',
        '@enduml',
      ].join('\n'),
    );
    expect(a.participants).toEqual([
      { id: 'First Actor', label: 'First Actor', shape: 'actor' },
      { id: 'Man2', label: 'Another\nactor', shape: 'actor' },
      { id: 'Woman3', label: 'Woman3', shape: 'actor' },
      { id: 'Person1', label: 'Last actor', shape: 'actor' },
    ]);
  });

  it('tags participants declared inside `box ... end box` with a shared box id', () => {
    const a = ast(
      [
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
      ].join('\n'),
    );
    expect(a.participants.map((p) => p.id)).toEqual(['Bob', 'Alice', 'Other']);
    const [bob, alice, other] = a.participants;
    expect(bob!.box).toBeDefined();
    expect(alice!.box).toBeDefined();
    expect(bob!.box!.id).toBe(alice!.box!.id);
    expect(bob!.box!.title).toBe('Internal Service');
    expect(bob!.box!.color).toBe('#ADD8E6');
    expect(other!.box).toBeUndefined();
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

  it('parses forward slanted arrow `A ->(N) B` as duration', () => {
    const a = ast('@startuml\nA ->(10) B: text 10\n@enduml');
    expect(a.statements[0]).toMatchObject({
      type: 'message', from: 'A', to: 'B', text: 'text 10', duration: 10,
    });
  });

  it('parses reverse slanted arrow `A (N)<- B` with swapped from/to', () => {
    const a = ast('@startuml\nA (10)<- B: text 10\n@enduml');
    expect(a.statements[0]).toMatchObject({
      type: 'message', from: 'B', to: 'A', reverse: true, text: 'text 10', duration: 10,
    });
  });

  it('omits `duration` for plain horizontal arrows', () => {
    const a = ast('@startuml\nA -> B: hello\n@enduml');
    expect(a.statements[0]).not.toHaveProperty('duration');
  });

  // Regression: `A ->(40) B++: Rq` combines a slanted-arrow `(N)` group with a
  // trailing `++` activation suffix attached directly to the target name.
  // Previously the bare-name char class accepted `+`, so `B++` was swallowed
  // as the participant id and `activateTarget` was never set. Both suffix
  // forms (`++` on target, `--` on source) must coexist with `duration`.
  it('parses slanted arrow combined with `++` / `--` suffix (no space)', () => {
    const a = ast('@startuml\nA ->(40) B++: Rq\nB -->(20) A--: Rs\n@enduml');
    expect(a.participants.map((p) => p.id)).toEqual(['A', 'B']);
    expect(a.statements[0]).toMatchObject({
      type: 'message', from: 'A', to: 'B', style: 'solid',
      duration: 40, activateTarget: true, text: 'Rq',
    });
    expect(a.statements[1]).toMatchObject({
      type: 'message', from: 'B', to: 'A', style: 'dashed',
      duration: 20, deactivateSource: true, text: 'Rs',
    });
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

  it('parses `alt#Gold #LightBlue label` (tab + branch color)', () => {
    const a = ast(
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
    const starts = a.statements.filter((s) => s.type === 'groupStart');
    const elses = a.statements.filter((s) => s.type === 'groupElse');
    expect(starts[0]).toMatchObject({
      type: 'groupStart',
      kind: 'alt',
      tabColor: '#FFD700',
      branchColor: '#ADD8E6',
      label: 'Successful case',
    });
    expect(elses[0]).toMatchObject({
      type: 'groupElse',
      branchColor: '#FFC0CB',
      label: 'Failure',
    });
  });

  it('parses `alt Just a label` with no colors cleanly', () => {
    const a = ast('@startuml\nalt Just a label\nA -> B\nend\n@enduml');
    const start = a.statements[0] as {
      type: string;
      label: string;
      tabColor?: string;
      branchColor?: string;
    };
    expect(start.type).toBe('groupStart');
    expect(start.label).toBe('Just a label');
    expect(start.tabColor).toBeUndefined();
    expect(start.branchColor).toBeUndefined();
  });

  it('parses `alt #Gold label` with only tab color', () => {
    const a = ast('@startuml\nalt #Gold sole case\nA -> B\nend\n@enduml');
    expect(a.statements[0]).toMatchObject({
      type: 'groupStart',
      kind: 'alt',
      tabColor: '#FFD700',
      label: 'sole case',
    });
    expect(
      (a.statements[0] as { branchColor?: string }).branchColor,
    ).toBeUndefined();
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
    expect(dividers[0]).toEqual({ type: 'divider', label: 'checkpoint', kind: 'divider' });
  });

  it('captures `mainframe <label>` as ast.mainframe and keeps inline markup', () => {
    const a = ast('@startuml\nmainframe This is a **mainframe**\nAlice->Bob : Hello\n@enduml');
    expect(a.mainframe).toBe('This is a **mainframe**');
    // The mainframe directive must be consumed — not surfaced as a phantom
    // message — and the following message must still parse normally.
    expect(a.statements).toHaveLength(1);
    expect(a.statements[0]?.type).toBe('message');
    if (a.statements[0]?.type === 'message') {
      expect(a.statements[0].from).toBe('Alice');
      expect(a.statements[0].to).toBe('Bob');
      expect(a.statements[0].text).toBe('Hello');
    }
  });

  it('mainframe is a one-shot setting — later occurrences overwrite earlier ones', () => {
    const a = ast('@startuml\nmainframe first\nmainframe second\nA -> B\n@enduml');
    expect(a.mainframe).toBe('second');
  });

  it('omits mainframe when the directive is absent', () => {
    const a = ast('@startuml\nA -> B\n@enduml');
    expect(a.mainframe).toBeUndefined();
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

  it('parses `participant "Famous Bob" as Bob << Generated >>` — alias + plain stereotype', () => {
    const a = ast('@startuml\nparticipant "Famous Bob" as Bob << Generated >>\n@enduml');
    expect(a.participants[0]).toMatchObject({
      id: 'Bob',
      label: 'Famous Bob',
      shape: 'participant',
      stereotype: { label: 'Generated' },
    });
    expect(a.participants[0]!.stereotype!.spot).toBeUndefined();
  });

  it('parses `participant Alice << (C,#ADD1B2) Testable >>` — spot + label stereotype', () => {
    const a = ast('@startuml\nparticipant Alice << (C,#ADD1B2) Testable >>\n@enduml');
    expect(a.participants[0]).toMatchObject({
      id: 'Alice',
      label: 'Alice',
      shape: 'participant',
      stereotype: {
        label: 'Testable',
        spot: { char: 'C', color: '#ADD1B2' },
      },
    });
  });

  it('references stereotyped participants by id in messages, not display name', () => {
    const a = ast(
      [
        '@startuml',
        'participant "Famous Bob" as Bob << Generated >>',
        'participant Alice << (C,#ADD1B2) Testable >>',
        'Bob->Alice: First message',
        '@enduml',
      ].join('\n'),
    );
    expect(a.statements[0]).toMatchObject({
      type: 'message', from: 'Bob', to: 'Alice', text: 'First message',
    });
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

  it('captures `#color` on all note forms (inline/block, side/over)', () => {
    const a = ast(
      [
        '@startuml',
        'participant Alice',
        'participant Bob',
        'note left of Alice #aqua',
        'block aqua',
        'end note',
        'note right of Alice #99FF99 : inline green',
        'note over Alice #FFAAAA: inline pink',
        'note over Alice, Bob #lightgray',
        'block over both',
        'end note',
        '@enduml',
      ].join('\n'),
    );
    const notes = a.statements.filter((s) => s.type === 'note') as Array<{
      position: string; color?: string; targets: string[]; text: string;
    }>;
    expect(notes).toHaveLength(4);
    expect(notes[0]).toMatchObject({ position: 'left',  color: 'aqua',      targets: ['Alice'], text: 'block aqua' });
    expect(notes[1]).toMatchObject({ position: 'right', color: '#99FF99',   targets: ['Alice'], text: 'inline green' });
    expect(notes[2]).toMatchObject({ position: 'over',  color: '#FFAAAA',   targets: ['Alice'], text: 'inline pink' });
    expect(notes[3]).toMatchObject({ position: 'over',  color: 'lightgray', targets: ['Alice', 'Bob'], text: 'block over both' });
  });

  it('parses `ref over A, B : text` (inline form)', () => {
    const a = ast('@startuml\nparticipant Alice\nparticipant Bob\nref over Alice, Bob : init\n@enduml');
    const ref = a.statements.find((s) => s.type === 'ref') as {
      targets: string[]; text: string;
    };
    expect(ref).toEqual({ type: 'ref', targets: ['Alice', 'Bob'], text: 'init' });
  });

  it('parses multi-line `ref over X ... end ref` (block form)', () => {
    const a = ast(
      [
        '@startuml',
        'participant Bob',
        'ref over Bob',
        '  line one',
        '  line two',
        'end ref',
        '@enduml',
      ].join('\n'),
    );
    const ref = a.statements.find((s) => s.type === 'ref') as {
      targets: string[]; text: string;
    };
    expect(ref.targets).toEqual(['Bob']);
    expect(ref.text).toContain('line one');
    expect(ref.text).toContain('line two');
  });

  it('parses `... text ...` as a delay-kind divider', () => {
    const a = ast('@startuml\nA -> B\n... long delay ...\nA -> B\n@enduml');
    const div = a.statements.find((s) => s.type === 'divider') as {
      label: string; kind: string;
    };
    expect(div).toMatchObject({ kind: 'delay', label: 'long delay' });
  });

  it('parses bare `...` as a delay-kind divider with empty label', () => {
    const a = ast(
      [
        '@startuml',
        'Bob -> Alice : hello',
        '...',
        'Alice -> Bob : ok',
        '@enduml',
      ].join('\n'),
    );
    // 2 participants (Bob, Alice), inferred from the messages
    expect(a.participants.map((p) => p.id).sort()).toEqual(['Alice', 'Bob']);
    // 2 messages and 1 divider in the statement list, divider in between
    const messages = a.statements.filter((s) => s.type === 'message');
    const dividers = a.statements.filter((s) => s.type === 'divider');
    expect(messages.length).toBe(2);
    expect(dividers.length).toBe(1);
    expect(dividers[0]).toMatchObject({ kind: 'delay', label: '' });
    // Order: message, divider, message
    expect(a.statements.map((s) => s.type)).toEqual(['message', 'divider', 'message']);
  });

  it('parses `... <label>` (no trailing dots) as a delay-kind divider with that label', () => {
    // The trailing `...` is OPTIONAL; the label is whatever follows the leading
    // three dots, with any trailing `...` stripped.
    const a = ast('@startuml\nA -> B\n... lots of time\nA -> B\n@enduml');
    const div = a.statements.find((s) => s.type === 'divider') as {
      label: string; kind: string;
    };
    expect(div).toMatchObject({ kind: 'delay', label: 'lots of time' });
  });

  it('parses `partition <label>` ... `end` as a group', () => {
    const a = ast(
      [
        '@startuml',
        'partition p1',
        'A -> B',
        'end',
        '@enduml',
      ].join('\n'),
    );
    const starts = a.statements.filter((s) => s.type === 'groupStart') as Array<{
      kind: string; label: string;
    }>;
    expect(starts).toHaveLength(1);
    expect(starts[0]).toMatchObject({ kind: 'partition', label: 'p1' });
  });

  it('parses `note across` / `hnote across` / `rnote across`', () => {
    const a = ast(
      [
        '@startuml',
        'A -> B',
        'note across: a inline',
        'hnote across: b inline',
        'rnote across',
        'block',
        'end rnote',
        '@enduml',
      ].join('\n'),
    );
    const notes = a.statements.filter((s) => s.type === 'note') as Array<{
      shape: string; position: string; targets: string[]; text: string;
    }>;
    expect(notes).toHaveLength(3);
    expect(notes[0]).toMatchObject({ shape: 'note',  position: 'across', targets: [], text: 'a inline' });
    expect(notes[1]).toMatchObject({ shape: 'hnote', position: 'across', targets: [], text: 'b inline' });
    expect(notes[2]).toMatchObject({ shape: 'rnote', position: 'across', targets: [], text: 'block' });
  });

  it('parses hnote and rnote variants (inline and block, with end variants)', () => {
    const a = ast(
      [
        '@startuml',
        'A -> A',
        'hnote over A : hex inline',
        'rnote over A : rect inline',
        'hnote over A',
        'h1',
        'endhnote',
        'rnote over A',
        'r1',
        'endrnote',
        '@enduml',
      ].join('\n'),
    );
    const notes = a.statements.filter((s) => s.type === 'note') as Array<{
      shape: string; text: string;
    }>;
    expect(notes).toHaveLength(4);
    expect(notes[0]).toMatchObject({ shape: 'hnote', text: 'hex inline' });
    expect(notes[1]).toMatchObject({ shape: 'rnote', text: 'rect inline' });
    expect(notes[2]).toMatchObject({ shape: 'hnote', text: 'h1' });
    expect(notes[3]).toMatchObject({ shape: 'rnote', text: 'r1' });
  });

  it('unescapes `\\n` in inline note text', () => {
    const a = ast(
      '@startuml\nA -> A\nnote over A: line1\\nline2\n@enduml',
    );
    const note = a.statements.find((s) => s.type === 'note') as { text: string };
    expect(note.text).toBe('line1\nline2');
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

  it('parses per-message `++` / `--` activation suffixes', () => {
    const a = ast(
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
    // Auto-declared participants appear in first-mention order (alice/bob from
    // the first message, then bib from the third message's target, then george
    // from the create message). No explicit `participant` lines declared them.
    expect(a.participants.map((p) => p.id)).toEqual(['alice', 'bob', 'bib', 'george']);
    const types = a.statements.map((s) => s.type);
    expect(types).toEqual([
      'message', 'message', 'message',
      'message', 'return', 'return', 'message', 'return',
    ]);
    const msgs = a.statements.filter((s) => s.type === 'message') as Array<{
      from: string; to: string;
      color?: string;
      create?: boolean;
      destroy?: boolean;
      activateTarget?: boolean;
      deactivateSource?: boolean;
    }>;
    expect(msgs[0]).toMatchObject({ from: 'alice', to: 'bob', activateTarget: true });
    expect(msgs[1]).toMatchObject({ from: 'bob', to: 'bob', activateTarget: true });
    expect(msgs[2]).toMatchObject({
      from: 'bob', to: 'bib', activateTarget: true, color: '#005500',
    });
    expect(msgs[3]).toMatchObject({ from: 'bob', to: 'george', create: true });
    expect(msgs[3].activateTarget).toBeUndefined();
    expect(msgs[4]).toMatchObject({ from: 'bob', to: 'george', destroy: true });
    const returns = a.statements.filter((s) => s.type === 'return') as Array<{ text: string }>;
    expect(returns.map((r) => r.text)).toEqual(['done', 'rc', 'success']);
  });

  it('parses `++--` / `--++` combined suffix in either order', () => {
    const a = ast(
      [
        '@startuml',
        'alice -> bob ++ : start',
        'bob -> alice ++-- : reply1',
        'alice -> bob --++ : reply2',
        '@enduml',
      ].join('\n'),
    );
    const msgs = a.statements.filter((s) => s.type === 'message') as Array<{
      activateTarget?: boolean; deactivateSource?: boolean;
    }>;
    expect(msgs[0]).toMatchObject({ activateTarget: true });
    expect(msgs[0].deactivateSource).toBeUndefined();
    expect(msgs[1]).toMatchObject({ activateTarget: true, deactivateSource: true });
    expect(msgs[2]).toMatchObject({ activateTarget: true, deactivateSource: true });
  });

  // Regression: a dashed forward arrow `-->` followed by a ` -- ` suffix used
  // to be ambiguous with longer arrow alternations. The MESSAGE regex must
  // match the arrow operator, then the target, then the trailing suffix.
  it('disambiguates `-->` arrow from trailing `--` suffix', () => {
    const a = ast(
      [
        '@startuml',
        'alice   ->  bob     ++   : hello1',
        'bob     ->  charlie --++ : hello2',
        'charlie --> alice   --   : ok',
        '@enduml',
      ].join('\n'),
    );
    expect(a.participants.map((p) => p.id)).toEqual(['alice', 'bob', 'charlie']);
    const msgs = a.statements.filter((s) => s.type === 'message') as Array<{
      from: string; to: string; style: string;
      activateTarget?: boolean; deactivateSource?: boolean;
    }>;
    expect(msgs).toHaveLength(3);
    expect(msgs[0]).toMatchObject({ from: 'alice', to: 'bob', style: 'solid', activateTarget: true });
    expect(msgs[0]!.deactivateSource).toBeUndefined();
    expect(msgs[1]).toMatchObject({
      from: 'bob', to: 'charlie', style: 'solid',
      activateTarget: true, deactivateSource: true,
    });
    expect(msgs[2]).toMatchObject({
      from: 'charlie', to: 'alice', style: 'dashed', deactivateSource: true,
    });
    expect(msgs[2]!.activateTarget).toBeUndefined();
  });

  it('parses autoactivate / return / `#color` / `**` / `!!`', () => {
    const a = ast(
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
    expect(a.participants.map((p) => p.id)).toEqual(['alice', 'bob', 'bill', 'george']);
    const types = a.statements.map((s) => s.type);
    expect(types).toEqual([
      'autoactivate', 'message', 'message', 'message',
      'message', 'return', 'return', 'message', 'return',
    ]);
    const msgs = a.statements.filter((s) => s.type === 'message') as Array<{
      from: string; to: string; color?: string; create?: boolean; destroy?: boolean;
    }>;
    expect(msgs[2]).toMatchObject({ from: 'bill', to: 'bob', color: '#005500' });
    expect(msgs[3]).toMatchObject({ from: 'bob', to: 'george', create: true });
    expect(msgs[4]).toMatchObject({ from: 'bob', to: 'george', destroy: true });
    const returns = a.statements.filter((s) => s.type === 'return') as Array<{ text: string }>;
    expect(returns.map((r) => r.text)).toEqual(['done in thread 2', 'rc', 'success']);
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

describe('sequence parser — found/lost (boundary) messages', () => {
  it('parses `[-> Bob` as a found message with left boundary as source', () => {
    const a = ast('@startuml\n[-> Bob\n@enduml');
    expect(a.participants.map((p) => p.id)).toEqual(['Bob']);
    expect(a.statements).toHaveLength(1);
    expect(a.statements[0]).toMatchObject({
      type: 'message',
      from: '',
      to: 'Bob',
      fromBoundary: 'left',
      startMarker: 'none',
      endMarker: 'arrow',
      reverse: false,
    });
  });

  it('parses `[o->o Bob` with circle markers at both ends', () => {
    const a = ast('@startuml\n[o->o Bob\n@enduml');
    expect(a.statements[0]).toMatchObject({
      type: 'message',
      from: '',
      to: 'Bob',
      fromBoundary: 'left',
      startMarker: 'circle',
      endMarker: 'circle',
    });
    // No phantom `[` participant.
    expect(a.participants.map((p) => p.id)).toEqual(['Bob']);
  });

  it('parses `Bob ->x]` as a lost message with x at the right edge', () => {
    const a = ast('@startuml\nBob ->x]\n@enduml');
    expect(a.statements[0]).toMatchObject({
      type: 'message',
      from: 'Bob',
      to: '',
      toBoundary: 'right',
      startMarker: 'none',
      endMarker: 'x',
      reverse: false,
    });
    // No phantom `]` participant.
    expect(a.participants.map((p) => p.id)).toEqual(['Bob']);
  });

  it('parses `[<- Bob` as a reversed found message (head at left edge)', () => {
    const a = ast('@startuml\n[<- Bob\n@enduml');
    expect(a.statements[0]).toMatchObject({
      type: 'message',
      from: 'Bob',
      to: '',
      toBoundary: 'left',
      startMarker: 'none',
      endMarker: 'arrow',
      reverse: true,
    });
  });

  it('parses `Bob <-]` as a reversed lost message (head on Bob)', () => {
    const a = ast('@startuml\nBob <-]\n@enduml');
    expect(a.statements[0]).toMatchObject({
      type: 'message',
      from: '',
      to: 'Bob',
      fromBoundary: 'right',
      startMarker: 'none',
      endMarker: 'arrow',
      reverse: true,
    });
  });

  it('parses `?-> Alice` as a short-left found message', () => {
    const a = ast('@startuml\n?-> Alice\n@enduml');
    // No phantom `?` participant.
    expect(a.participants.map((p) => p.id)).toEqual(['Alice']);
    expect(a.statements[0]).toMatchObject({
      type: 'message',
      from: '',
      to: 'Alice',
      fromBoundary: 'short-left',
      startMarker: 'none',
      endMarker: 'arrow',
      reverse: false,
    });
  });

  it('parses `Alice ->?` as a short-right lost message', () => {
    const a = ast('@startuml\nAlice ->?\n@enduml');
    expect(a.participants.map((p) => p.id)).toEqual(['Alice']);
    expect(a.statements[0]).toMatchObject({
      type: 'message',
      from: 'Alice',
      to: '',
      toBoundary: 'short-right',
      startMarker: 'none',
      endMarker: 'arrow',
      reverse: false,
    });
  });

  it('parses `?<- Alice` (reversed short-left)', () => {
    const a = ast('@startuml\n?<- Alice\n@enduml');
    expect(a.statements[0]).toMatchObject({
      type: 'message',
      from: 'Alice',
      to: '',
      toBoundary: 'short-left',
      reverse: true,
    });
  });

  it('expands `\\n`, monospace `""..""`, and `**bold**` in a short-boundary label', () => {
    const a = ast('@startuml\n?-> Alice : ""?->""\\n**short** to actor1\n@enduml');
    const stmt = a.statements[0] as { text: string; fromBoundary?: string };
    expect(stmt.fromBoundary).toBe('short-left');
    // `\n` in source becomes a real newline.
    expect(stmt.text).toContain('\n');
    expect(stmt.text.split('\n')).toEqual(['""?->""', '**short** to actor1']);
  });
});

describe('sequence parser — skinparam', () => {
  // The "full failing input" from the task spec: a stylised checkout sequence
  // with one-liner + block skinparam directives, handwritten true, and a
  // realistic mix of participants/actors with aliases.
  const fullSource = [
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

  it('captures one-liner + block skinparam values into ast.skin (lower-cased keys)', () => {
    const a = ast(fullSource);
    expect(a.skin).toBeDefined();
    const skin = a.skin!;
    // One-liner forms.
    expect(skin['backgroundcolor']).toBe('#EEEBDC');
    expect(skin['handwritten']).toBe('true');
    // Block-form values (group `sequence` flattened into the same map).
    expect(skin['arrowcolor']).toBe('DeepSkyBlue');
    expect(skin['participantfontname']).toBe('Impact');
    expect(skin['actorfontsize']).toBe('17');
    expect(skin['actorbackgroundcolor']).toBe('aqua');
    expect(skin['lifelinebordercolor']).toBe('blue');
    expect(skin['lifelinebackgroundcolor']).toBe('#A9DCDF');
  });

  it('strips skinparam lines from downstream parsing — participants/messages survive intact', () => {
    const a = ast(fullSource);
    // 1 actor + 3 participants in declared order.
    expect(a.participants.map((p) => p.id)).toEqual(['User', 'A', 'B', 'C']);
    expect(a.participants.map((p) => p.label)).toEqual([
      'User', 'First Class', 'Second Class', 'Last Class',
    ]);
    expect(a.participants[0]!.shape).toBe('actor');
    // The body still has messages + activates + destroy.
    const types = a.statements.map((s) => s.type);
    expect(types).toContain('message');
    expect(types).toContain('activate');
    expect(types).toContain('deactivate');
    const msgs = a.statements.filter((s) => s.type === 'message') as Array<{
      from: string; to: string; text: string; style: string; destroy?: boolean;
    }>;
    expect(msgs.map((m) => m.text)).toEqual([
      'DoWork', 'Create Request', 'DoWork', 'WorkDone', 'Request Created', 'Done',
    ]);
    // Solid vs dashed arrows survive intact through the skinparam strip.
    expect(msgs.map((m) => m.style)).toEqual([
      'solid', 'solid', 'solid', 'dashed', 'dashed', 'dashed',
    ]);
  });

  it('parses a one-liner `skinparam` independently of the block form', () => {
    const a = ast('@startuml\nskinparam backgroundColor #ABCDEF\nA -> B\n@enduml');
    expect(a.skin).toMatchObject({ backgroundcolor: '#ABCDEF' });
    // The message survives.
    expect(a.statements.map((s) => s.type)).toEqual(['message']);
  });
});

describe('sequence parser — `<style>` blocks', () => {
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

  it('captures `<style>` selectors and properties into ast.styles (lower-cased keys)', () => {
    const a = ast(STYLE_SRC);
    expect(a.styles).toBeDefined();
    expect(a.styles!['lifeline']!['linestyle']).toBe('0');
    expect(a.styles!['delay']!['linestyle']).toBe('1-4');
  });

  it('strips style-block lines so downstream parsing sees only the diagram body', () => {
    const a = ast(STYLE_SRC);
    // Two messages + one delay divider.
    expect(a.statements.map((s) => s.type)).toEqual(['message', 'divider', 'message']);
    const msgs = a.statements.filter((s) => s.type === 'message') as Array<{
      from: string; to: string; text: string;
    }>;
    expect(msgs[0]).toMatchObject({ from: 'Alice', to: 'Bob', text: 'hello' });
    expect(msgs[1]).toMatchObject({ from: 'Bob', to: 'Alice', text: 'hello' });
    const delays = a.statements.filter((s) => s.type === 'divider') as Array<{
      kind?: string;
    }>;
    expect(delays[0]!.kind).toBe('delay');
  });

  it('captures non-LineStyle properties too (silently — they are no-ops in render)', () => {
    const a = ast(
      [
        '@startuml',
        '<style>',
        'arrow {',
        '  LineColor red',
        '  LineStyle 5',
        '}',
        '</style>',
        'A -> B',
        '@enduml',
      ].join('\n'),
    );
    expect(a.styles!['arrow']).toEqual({
      linecolor: 'red',
      linestyle: '5',
    });
  });
});

describe('sequence parser — `hide unlinked`', () => {
  it('sets `hideUnlinked` on the AST and keeps the declared participants intact', () => {
    const a = ast(
      [
        '@startuml',
        'hide unlinked',
        'participant Alice',
        'participant Bob',
        'participant Carol',
        '',
        'Alice -> Bob : hello',
        '@enduml',
      ].join('\n'),
    );
    expect(a.hideUnlinked).toBe(true);
    // Parsing preserves all declarations; layout is what filters at render time.
    expect(a.participants.map((p) => p.id)).toEqual(['Alice', 'Bob', 'Carol']);
    // The directive line itself doesn't leak into the statement list.
    expect(a.statements.map((s) => s.type)).toEqual(['message']);
  });

  it('silently accepts other `hide ...` variants without touching `hideUnlinked`', () => {
    const a = ast('@startuml\nhide footbox\nA -> B\n@enduml');
    expect(a.hideUnlinked).toBeUndefined();
    expect(a.statements.map((s) => s.type)).toEqual(['message']);
  });
});
