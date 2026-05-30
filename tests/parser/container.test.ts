import { describe, it, expect } from 'vitest';
import { parse } from '../../src/parser/index.js';
import { parseComponent } from '../../src/parser/container/component.js';
import { parseDeployment } from '../../src/parser/container/deployment.js';
import { parseObject } from '../../src/parser/container/object.js';
import type { ContainerAst } from '../../src/ast/container.js';

describe('component parser', () => {
  it('parses component and interface declarations', () => {
    const a = parseComponent('@startuml\ncomponent Foo\ninterface Bar\n@enduml');
    expect(a.kind).toBe('component');
    expect(a.nodes).toEqual([
      { id: 'Foo', name: 'Foo', nodeKind: 'component', attributes: [], children: [] },
      { id: 'Bar', name: 'Bar', nodeKind: 'interface', attributes: [], children: [] },
    ]);
  });

  it('parses [X] shorthand and aliases', () => {
    const a = parseComponent('@startuml\n[App]\ncomponent "Long Name" as L\n@enduml');
    expect(a.nodes[0]).toMatchObject({ id: 'App', name: 'App', nodeKind: 'component' });
    expect(a.nodes[1]).toMatchObject({ id: 'L', name: 'Long Name' });
  });

  it('normalizes [X] in relationship endpoints', () => {
    const a = parseComponent('@startuml\n[A] --> [B]\n@enduml');
    expect(a.nodes.map((n) => n.id)).toEqual(['A', 'B']);
    expect(a.relationships[0]).toMatchObject({ source: 'A', target: 'B' });
  });

  it('parses `() "Name"` and `() "Name" as Alias` interface shorthand', () => {
    const a = parseComponent([
      '@startuml',
      '() "First Interface"',
      '() "Another interface" as Interf2',
      'interface Interf3',
      'interface "Last\\ninterface" as Interf4',
      '[component]',
      'footer //Adding "component" to force diagram to be a **component diagram**//',
      '@enduml',
    ].join('\n'));
    expect(a.kind).toBe('component');
    const interfaces = a.nodes.filter((n) => n.nodeKind === 'interface');
    expect(interfaces.map((n) => ({ id: n.id, name: n.name }))).toEqual([
      { id: 'First Interface', name: 'First Interface' },
      { id: 'Interf2', name: 'Another interface' },
      { id: 'Interf3', name: 'Interf3' },
      { id: 'Interf4', name: 'Last\ninterface' },
    ]);
    const comp = a.nodes.find((n) => n.nodeKind === 'component')!;
    expect(comp).toMatchObject({ id: 'component', name: 'component' });
    expect(a.footer).toBe(
      '//Adding "component" to force diagram to be a **component diagram**//',
    );
  });

  it('parses `component [Display Name] #Color` (bracket name + color)', () => {
    const a = parseComponent('@startuml\ncomponent [Web Server] #Yellow\n@enduml');
    expect(a.kind).toBe('component');
    expect(a.nodes).toHaveLength(1);
    expect(a.nodes[0]).toMatchObject({
      name: 'Web Server',
      nodeKind: 'component',
      color: 'Yellow',
    });
  });

  it('expands `\\n` escapes inside bracket display labels (Bug A)', () => {
    const a = parseComponent([
      '@startuml',
      '[First component]',
      '[Another component] as Comp2',
      'component Comp3',
      'component [Last\\ncomponent] as Comp4',
      '@enduml',
    ].join('\n'));
    expect(a.kind).toBe('component');
    const comp4 = a.nodes.find((n) => n.id === 'Comp4')!;
    expect(comp4).toBeDefined();
    expect(comp4.name).toBe('Last\ncomponent');
    // The expanded label produces a single text block with a real newline so
    // the layout renders one row per segment.
    expect(comp4.labelBlocks).toBeDefined();
    expect(comp4.labelBlocks).toHaveLength(1);
    expect(comp4.labelBlocks![0]).toEqual({ kind: 'text', text: 'Last\ncomponent' });
    // Sanity: bracket forms without `\n` are unaffected.
    const c1 = a.nodes.find((n) => n.id === 'First component')!;
    expect(c1.name).toBe('First component');
    expect(c1.labelBlocks).toBeUndefined();
  });

  it('parses a multi-line bracket label with separators into `labelBlocks`', () => {
    const a = parseComponent([
      '@startuml',
      'folder folder [ This is a <b>folder',
      '---- You can use separator',
      '==== of different kind',
      '.... and style',
      ']',
      '@enduml',
    ].join('\n'));
    expect(a.nodes).toHaveLength(1);
    const n = a.nodes[0]!;
    expect(n.id).toBe('folder');
    expect(n.nodeKind).toBe('folder');
    expect(n.labelBlocks).toBeDefined();
    const kinds = n.labelBlocks!.map((b) => b.kind);
    expect(kinds).toEqual(['text', 'sep-solid', 'text', 'sep-double', 'text', 'sep-dotted', 'text']);
    const textBlocks = n.labelBlocks!.filter(
      (b): b is { kind: 'text'; text: string } => b.kind === 'text',
    );
    expect(textBlocks[0]!.text).toContain('This is a <b>folder');
    expect(textBlocks[1]!.text).toContain('You can use separator');
  });

  it('parses `archimate #Layer "Name" as id <<stereotype>>` with layer color', () => {
    const a = parseComponent([
      '@startuml',
      'archimate #Technology "VPN Server" as vpnServerA <<technology-device>>',
      'rectangle GO #lightgreen',
      'rectangle STOP #red',
      'rectangle WAIT #orange',
      '@enduml',
    ].join('\n'));
    expect(a.kind).toBe('component');
    expect(a.nodes).toHaveLength(4);
    expect(a.nodes[0]).toMatchObject({
      id: 'vpnServerA',
      name: 'VPN Server',
      nodeKind: 'rectangle',
      fill: '#C9E7B7',
      stereotype: 'technology-device',
    });
    // Bare-name + trailing #Color form stores the raw token in `color`.
    expect(a.nodes[1]).toMatchObject({ id: 'GO', name: 'GO', color: 'lightgreen' });
    expect(a.nodes[2]).toMatchObject({ id: 'STOP', name: 'STOP', color: 'red' });
    expect(a.nodes[3]).toMatchObject({ id: 'WAIT', name: 'WAIT', color: 'orange' });
  });

  it('maps all Archimate layer hints to conventional pastel fills', () => {
    const a = parseComponent([
      '@startuml',
      'archimate #Business "B" as B',
      'archimate #Application "A" as A',
      'archimate #Technology "T" as T',
      'archimate #Motivation "M" as M',
      '@enduml',
    ].join('\n'));
    const fillById = new Map(a.nodes.map((n) => [n.id, n.fill]));
    expect(fillById.get('B')).toBe('#FFFFB5');
    expect(fillById.get('A')).toBe('#B5FFFF');
    expect(fillById.get('T')).toBe('#C9E7B7');
    expect(fillById.get('M')).toBe('#E7B7E7');
  });

  it('parses `$`-prefixed bracket ids and accepts a trailing `$tag` decorator', () => {
    // Three forms exercised in PlantUML's component-diagram remove example:
    //   `component [$C1]`            → id is the bracket content (`$C1`)
    //   `component [$C2] $C2`        → trailing `$C2` is a tag-style no-op
    //   `component [$C2] as dollarC2`→ explicit alias becomes the id
    const a = parseComponent([
      '@startuml',
      'component [$C1]',
      'component [$C2] $C2',
      'component [$C2] as dollarC2',
      '@enduml',
    ].join('\n'));
    expect(a.nodes).toHaveLength(3);
    expect(a.nodes[0]).toMatchObject({ id: '$C1', name: '$C1', nodeKind: 'component' });
    expect(a.nodes[1]).toMatchObject({ id: '$C2', name: '$C2', nodeKind: 'component' });
    expect(a.nodes[2]).toMatchObject({ id: 'dollarC2', name: '$C2', nodeKind: 'component' });
  });

  it('drops components mentioned by `remove <id>`', () => {
    // Same input as the class-diagram remove test (Task #30), now exercising
    // the component parser. All three components disappear from the AST.
    const a = parseComponent([
      '@startuml',
      'component [$C1]',
      'component [$C2] $C2',
      'component [$C2] as dollarC2',
      'remove $C1',
      'remove $C2',
      'remove dollarC2',
      '@enduml',
    ].join('\n'));
    expect(a.nodes).toHaveLength(0);
    expect(a.relationships).toHaveLength(0);
  });

  it('drops relationships involving removed components', () => {
    const a = parseComponent([
      '@startuml',
      'component A',
      'component B',
      'component C',
      'A --> B',
      'B --> C',
      'remove B',
      '@enduml',
    ].join('\n'));
    expect(a.nodes.map((n) => n.id)).toEqual(['A', 'C']);
    expect(a.relationships).toHaveLength(0);
  });

  it('silently ignores `remove` for ids that were never declared', () => {
    const a = parseComponent('@startuml\ncomponent A\nremove Ghost\n@enduml');
    expect(a.nodes.map((n) => n.id)).toEqual(['A']);
  });

  it('parses attached `note <side> of X` declarations around a component', () => {
    // The failing input from Task #110: a single component with four
    // attached notes (one per side). Mixes inline single-line notes with
    // block-form `note ... end note` so both pattern branches are covered.
    const a = parseComponent([
      '@startuml',
      '[Component] as C',
      'note top of C: A top note',
      'note bottom of C',
      'A bottom note can also be on several lines',
      'end note',
      'note left of C',
      'A left note can also be on several lines',
      'end note',
      'note right of C: A right note',
      '@enduml',
    ].join('\n'));
    const notes = a.nodes.filter((n) => n.nodeKind === 'note');
    expect(notes).toHaveLength(4);
    // Anchor sides cover all four positions and anchor ids resolve to `C`
    // (the alias of the bracketed component).
    const bySide = new Map(notes.map((n) => [n.anchorSide!, n]));
    expect([...bySide.keys()].sort()).toEqual(['bottom', 'left', 'right', 'top']);
    for (const n of notes) {
      expect(n.anchorId).toBe('C');
    }
    expect(bySide.get('top')!.text).toBe('A top note');
    expect(bySide.get('right')!.text).toBe('A right note');
    expect(bySide.get('bottom')!.text).toBe(
      'A bottom note can also be on several lines',
    );
    expect(bySide.get('left')!.text).toBe(
      'A left note can also be on several lines',
    );
  });

  it('parses a free-standing `note as N` block and binds dashed link by id (Bug A)', () => {
    // PlantUML's free-floating note form: `note as N` ... `end note` declares
    // a folded-corner note with id `N` (no anchor). A later `C .. N` link
    // attaches it via the normal relationship machinery.
    const a = parseComponent([
      '@startuml',
      '[Component] as C',
      'note as N',
      'A floating note can also be on several lines',
      'end note',
      'C .. N',
      '@enduml',
    ].join('\n'));
    const components = a.nodes.filter((n) => n.nodeKind === 'component');
    const notes = a.nodes.filter((n) => n.nodeKind === 'note');
    expect(components).toHaveLength(1);
    expect(components[0]).toMatchObject({ id: 'C', name: 'Component' });
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({
      id: 'N',
      text: 'A floating note can also be on several lines',
    });
    // Free-standing note has NO anchorId/anchorSide — layout treats it as a
    // regular flow node and routes the dashed link to it.
    expect(notes[0]!.anchorId).toBeUndefined();
    expect(notes[0]!.anchorSide).toBeUndefined();
    expect(a.relationships).toHaveLength(1);
    expect(a.relationships[0]).toMatchObject({
      source: 'C',
      target: 'N',
      style: 'dashed',
    });
  });

  it('auto-promotes bare relationship endpoints to interfaces (Bug B2)', () => {
    const a = parseComponent([
      '@startuml',
      '[Component] --> Interface1',
      '[Component] -> Interface2',
      '@enduml',
    ].join('\n'));
    const byId = new Map(a.nodes.map((n) => [n.id, n]));
    expect(byId.get('Component')?.nodeKind).toBe('component');
    expect(byId.get('Interface1')?.nodeKind).toBe('interface');
    expect(byId.get('Interface2')?.nodeKind).toBe('interface');
    expect(a.relationships).toHaveLength(2);
  });

  it('strips brackets in `[First Component]` declaration display (Bug B1)', () => {
    const a = parseComponent('@startuml\n[First Component]\n@enduml');
    expect(a.nodes).toHaveLength(1);
    expect(a.nodes[0]).toMatchObject({
      id: 'First Component',
      name: 'First Component',
      nodeKind: 'component',
    });
    // Brackets must not survive into the rendered name.
    expect(a.nodes[0]!.name).not.toContain('[');
    expect(a.nodes[0]!.name).not.toContain(']');
  });

  it('declared interface stays an interface; HTTP bare endpoint auto-promotes (Bug B)', () => {
    const a = parseComponent([
      '@startuml',
      'interface "Data Access" as DA',
      'DA - [First Component]',
      '[First Component] ..> HTTP : use',
      '@enduml',
    ].join('\n'));
    const byId = new Map(a.nodes.map((n) => [n.id, n]));
    expect(byId.get('DA')).toMatchObject({ name: 'Data Access', nodeKind: 'interface' });
    expect(byId.get('First Component')?.nodeKind).toBe('component');
    expect(byId.get('HTTP')?.nodeKind).toBe('interface');
  });

  it('places bracketed declarations inside their container block (Bug C)', () => {
    const a = parseComponent([
      '@startuml',
      'package "Some Group" {',
      'HTTP - [First Component]',
      '[Another Component]',
      '}',
      'node "Other Groups" {',
      'FTP - [Second Component]',
      '[First Component] --> FTP',
      '}',
      '@enduml',
    ].join('\n'));
    const someGroup = a.nodes.find((n) => n.id === 'Some Group')!;
    const otherGroups = a.nodes.find((n) => n.id === 'Other Groups')!;
    expect(someGroup).toBeDefined();
    expect(otherGroups).toBeDefined();
    // Both bracketed components declared inside "Some Group" live there.
    expect(someGroup.children.map((c) => c.id).sort()).toEqual([
      'Another Component', 'First Component',
    ]);
    // Bracket-declared `[Second Component]` lives inside "Other Groups".
    expect(otherGroups.children.map((c) => c.id)).toEqual(['Second Component']);
    // Bare relationship endpoints (HTTP, FTP) STAY at root and become
    // interfaces under the Bug B2 rule.
    const rootIds = a.nodes.map((n) => n.id);
    expect(rootIds).toContain('HTTP');
    expect(rootIds).toContain('FTP');
    const byId = new Map(a.nodes.map((n) => [n.id, n]));
    expect(byId.get('HTTP')?.nodeKind).toBe('interface');
    expect(byId.get('FTP')?.nodeKind).toBe('interface');
  });
});

describe('archimate-library graceful degradation', () => {
  // Each input exercises a different "advanced" PlantUML feature we don't
  // implement (preprocessor macros, sprites, legend, stereotype-scoped
  // skinparam blocks, Archimate macro library). The expectation is the
  // parser doesn't crash and returns a usable AST — fully-rendered where
  // possible, otherwise gracefully empty.
  const asContainer = (src: string): ContainerAst => parse(src) as ContainerAst;

  it('parses `!define` + circle + directional arrows (Input 1)', () => {
    const a = asContainer([
      '@startuml',
      '!define Junction_Or circle #black',
      '!define Junction_And circle #whitesmoke',
      'Junction_And JunctionAnd',
      'Junction_Or JunctionOr',
      'archimate #Technology "VPN Server" as vpnServerA <<technology-device>>',
      'rectangle GO #lightgreen',
      'rectangle STOP #red',
      'rectangle WAIT #orange',
      'GO -up-> JunctionOr',
      'STOP -up-> JunctionOr',
      'STOP -down-> JunctionAnd',
      'WAIT -down-> JunctionAnd',
      '@enduml',
    ].join('\n'));
    expect(a.kind).toBe('component');
    // VPN Server + GO/STOP/WAIT + JunctionOr/JunctionAnd (auto-created from
    // relationship endpoints). The `Junction_And/Or` typed declarations
    // before they are referenced are dropped by macro stripping; the arrow
    // endpoints create plain component nodes for them.
    const ids = a.nodes.map((n) => n.id).sort();
    expect(ids).toContain('vpnServerA');
    expect(ids).toContain('JunctionOr');
    expect(ids).toContain('JunctionAnd');
    expect(a.relationships).toHaveLength(4);
  });

  it('skips sprite/legend/stereotype-scoped skinparam and parses surviving rectangles (Input 2)', () => {
    const a = asContainer([
      '@startuml',
      'skinparam rectangle<<behavior>> { roundCorner 25 }',
      'sprite $bProcess jar:archimate/business-process',
      'sprite $aService jar:archimate/application-service',
      'rectangle "Handle claim" as HC <<$bProcess>><<behavior>> #Business',
      'rectangle "Other rect" as OR <<behavior>> #Business',
      'legend left',
      'Example from somewhere',
      'endlegend',
      '@enduml',
    ].join('\n'));
    expect(a.kind).toBe('component');
    // Both rectangles parse — the sprite reference `<<$bProcess>>` has its
    // `$` stripped and merges with the second `<<behavior>>` into one
    // stereotype slot.
    const ids = a.nodes.map((n) => n.id).sort();
    expect(ids).toEqual(['HC', 'OR']);
    const hc = a.nodes.find((n) => n.id === 'HC')!;
    expect(hc.stereotype).toBe('bProcess, behavior');
    expect(hc.color).toBe('Business');
  });

  it('strips `$` sigil from a sprite-style stereotype (Input 3)', () => {
    const a = asContainer([
      '@startuml',
      'skinparam roundcorner 25',
      'rectangle "Capture Information" as CI <<$archimate/business-process>> #Business',
      '@enduml',
    ].join('\n'));
    expect(a.kind).toBe('component');
    expect(a.nodes).toHaveLength(1);
    expect(a.nodes[0]).toMatchObject({
      id: 'CI',
      name: 'Capture Information',
      stereotype: 'archimate/business-process',
      color: 'Business',
    });
  });

  it('accepts an empty `listsprite` body without crashing (Input 4)', () => {
    const ast = parse(['@startuml', 'listsprite', '@enduml'].join('\n'));
    // No content survives preprocessing → detector falls through to the
    // default sequence-diagram routing. Critically, parse() does not throw
    // and returns a well-formed AST.
    expect(ast.kind).not.toBe('unknown');
  });

  it('emits a placeholder AST for the standalone `listsprite` directive', () => {
    // PlantUML's `listsprite` renders a list of every bundled sprite. We
    // don't ship any sprites, so previously the directive was silently
    // stripped by the Archimate pre-pass and the diagram collapsed to empty.
    // Surface a placeholder text instead so the user knows the directive
    // was recognised but has nothing to enumerate.
    const ast = parse(['@startuml', 'listsprite', '@enduml'].join('\n'));
    expect(ast.kind).toBe('placeholder');
    if (ast.kind === 'placeholder') {
      expect(ast.label.toLowerCase()).toContain('sprite');
    }
  });

  it('expands Archimate element + relationship macros (Input 5)', () => {
    const a = asContainer([
      '@startuml',
      '!include <archimate/Archimate>',
      'Motivation_Stakeholder(StakeholderElement, "Stakeholder Description")',
      'Business_Service(BService, "Business Service")',
      'Rel_Composition(StakeholderElement, BService, "Description for the relationship")',
      '@enduml',
    ].join('\n'));
    expect(a.kind).toBe('component');
    expect(a.nodes).toHaveLength(2);
    const stakeholder = a.nodes.find((n) => n.id === 'StakeholderElement')!;
    expect(stakeholder).toMatchObject({
      name: 'Stakeholder Description',
      stereotype: 'Stakeholder',
      color: 'Motivation',
    });
    const service = a.nodes.find((n) => n.id === 'BService')!;
    expect(service).toMatchObject({
      name: 'Business Service',
      stereotype: 'Business Service',
      color: 'Business',
    });
    expect(a.relationships).toHaveLength(1);
    expect(a.relationships[0]!.label).toBe('Description for the relationship');
  });
});

describe('deployment parser', () => {
  it('parses every deployment node kind', () => {
    const a = parseDeployment([
      '@startuml',
      'node N',
      'cloud C',
      'database D',
      'folder F',
      'frame Fr',
      'rectangle R',
      '@enduml',
    ].join('\n'));
    expect(a.kind).toBe('deployment');
    expect(a.nodes.map((n) => n.nodeKind)).toEqual([
      'node', 'cloud', 'database', 'folder', 'frame', 'rectangle',
    ]);
  });

  it('parses quoted names + aliases', () => {
    const a = parseDeployment('@startuml\nnode "Prod Cluster" as PC\n@enduml');
    expect(a.nodes[0]).toMatchObject({ id: 'PC', name: 'Prod Cluster', nodeKind: 'node' });
  });

  it('parses [X] shorthand nested inside container blocks', () => {
    const a = parseDeployment([
      '@startuml',
      'node "Web Server" {',
      '  component Apache',
      '  artifact "config.yml" as Config',
      '}',
      'node "Database Server" {',
      '  [PostgreSQL]',
      '}',
      'cloud "AWS" {',
      '  [Lambda]',
      '}',
      'Apache --> PostgreSQL',
      'Apache --> Config',
      '@enduml',
    ].join('\n'));
    expect(a.nodes.map((n) => n.name)).toEqual(['Web Server', 'Database Server', 'AWS']);
    const db = a.nodes.find((n) => n.name === 'Database Server')!;
    expect(db.children.map((c) => c.id)).toEqual(['PostgreSQL']);
    expect(db.children[0]).toMatchObject({ nodeKind: 'component' });
    const aws = a.nodes.find((n) => n.name === 'AWS')!;
    expect(aws.children.map((c) => c.id)).toEqual(['Lambda']);
    expect(a.relationships.map((r) => `${r.source}->${r.target}`)).toEqual([
      'Apache->PostgreSQL',
      'Apache->Config',
    ]);
  });

  it('normalizes [X] in relationship endpoints', () => {
    const a = parseDeployment('@startuml\nnode N {\n  [A]\n}\n[A] --> [B]\n@enduml');
    expect(a.relationships[0]).toMatchObject({ source: 'A', target: 'B' });
  });

  it('parses multi-line bracket labels across folder/node/database/usecase/card', () => {
    const a = parseDeployment([
      '@startuml',
      'folder folder [ This is a <b>folder',
      '---- You can use separator',
      '==== of different kind',
      '.... and style',
      ']',
      'node node [ This is a <b>node',
      '---- You can use separator',
      '==== of different kind',
      '.... and style',
      ']',
      'database database [ This is a <b>database',
      '---- You can use separator',
      '==== of different kind',
      '.... and style',
      ']',
      'usecase usecase [ This is a <b>usecase',
      '---- You can use separator',
      '==== of different kind',
      '.... and style',
      ']',
      'card card [ This is a <b>card',
      '---- You can use separator',
      '==== of different kind',
      '.... and style',
      '<i><color:blue>(add from V1.2020.7)</color></i>',
      ']',
      '@enduml',
    ].join('\n'));
    expect(a.nodes).toHaveLength(5);
    expect(a.nodes.map((n) => n.nodeKind)).toEqual([
      'folder', 'node', 'database', 'usecase', 'card',
    ]);
    for (const n of a.nodes) {
      expect(n.labelBlocks).toBeDefined();
      const kinds = n.labelBlocks!.map((b) => b.kind);
      expect(kinds).toContain('text');
      expect(kinds).toContain('sep-solid');
      expect(kinds).toContain('sep-double');
      expect(kinds).toContain('sep-dotted');
    }
    // The `card` block has an extra HTML-styled line as its trailing text.
    const cardLast = a.nodes[4]!.labelBlocks!.at(-1)!;
    expect(cardLast.kind).toBe('text');
    expect((cardLast as { text: string }).text).toContain('add from V1.2020.7');
  });
});

describe('object parser', () => {
  it('parses object declarations', () => {
    const a = parseObject('@startuml\nobject foo\nobject "Long" as L\n@enduml');
    expect(a.kind).toBe('object');
    expect(a.nodes[0]).toMatchObject({ id: 'foo', name: 'foo', nodeKind: 'object' });
    expect(a.nodes[1]).toMatchObject({ id: 'L', name: 'Long' });
  });

  it('collects attribute lines on a declared object', () => {
    const a = parseObject([
      '@startuml',
      'object foo',
      'foo : x = 1',
      'foo : y = "hello"',
      '@enduml',
    ].join('\n'));
    expect(a.nodes[0]?.attributes).toEqual(['x = 1', 'y = "hello"']);
  });

  it('parses relationships', () => {
    const a = parseObject('@startuml\nobject A\nobject B\nA --> B : has\n@enduml');
    expect(a.relationships[0]).toMatchObject({ source: 'A', target: 'B', label: 'has' });
  });

  it('parses a bare `map Name { … }` block as a map node with entries', () => {
    const a = parseObject([
      '@startuml',
      'map CapitalCity {',
      '  UK => London',
      '  USA => Washington',
      '  Germany => Berlin',
      '}',
      '@enduml',
    ].join('\n'));
    expect(a.nodes).toHaveLength(1);
    expect(a.nodes[0]).toMatchObject({
      id: 'CapitalCity',
      name: 'CapitalCity',
      nodeKind: 'map',
    });
    expect(a.nodes[0]?.mapEntries).toEqual([
      { key: 'UK', value: 'London' },
      { key: 'USA', value: 'Washington' },
      { key: 'Germany', value: 'Berlin' },
    ]);
  });

  it('parses a quoted display name with `as alias` and preserves markup', () => {
    const a = parseObject([
      '@startuml',
      'map "Map **Contry => CapitalCity**" as CC {',
      '  UK => London',
      '  USA => Washington',
      '  Germany => Berlin',
      '}',
      '@enduml',
    ].join('\n'));
    expect(a.nodes[0]).toMatchObject({
      id: 'CC',
      name: 'Map **Contry => CapitalCity**',
      nodeKind: 'map',
    });
    expect(a.nodes[0]?.mapEntries).toHaveLength(3);
  });

  it('treats angle brackets in the display name as literal text', () => {
    const a = parseObject([
      '@startuml',
      'map "map: Map<Integer, String>" as users {',
      '  1 => Alice',
      '  2 => Bob',
      '  3 => Charlie',
      '}',
      '@enduml',
    ].join('\n'));
    expect(a.nodes[0]).toMatchObject({
      id: 'users',
      name: 'map: Map<Integer, String>',
      nodeKind: 'map',
    });
    expect(a.nodes[0]?.mapEntries).toEqual([
      { key: '1', value: 'Alice' },
      { key: '2', value: 'Bob' },
      { key: '3', value: 'Charlie' },
    ]);
  });
});

describe('deployment parser — 17 shape keywords + inline style + nesting', () => {
  it('parses mixed shapes with inline styling, bracket label, and brace body (Input A)', () => {
    const a = parseDeployment([
      '@startuml',
      'agent a',
      'cloud c #pink;line:red;line.bold;text:red [ c cloud description ]',
      'file f #palegreen;line:green;line.dashed;text:green { [c1] [c2] }',
      'frame frame { node n #aliceblue;line:blue;line.dotted;text:blue }',
      '@enduml',
    ].join('\n'));
    // 4 top-level nodes: agent, cloud, file (mapped to artifact), frame.
    expect(a.nodes.map((n) => n.id)).toEqual(['a', 'c', 'f', 'frame']);
    expect(a.nodes.map((n) => n.nodeKind)).toEqual([
      'agent', 'cloud', 'artifact', 'frame',
    ]);
    // Inline style fields on the cloud line.
    const cloud = a.nodes[1]!;
    expect(cloud.fill).toBe('pink');
    expect(cloud.lineColor).toBe('red');
    expect(cloud.lineStyle).toBe('bold');
    expect(cloud.textColor).toBe('red');
    expect(cloud.name).toBe('c cloud description');
    // The file (artifact) contains two `[c1]` and `[c2]` components AND
    // carries inline styling.
    const file = a.nodes[2]!;
    expect(file.fill).toBe('palegreen');
    expect(file.lineStyle).toBe('dashed');
    expect(file.children.map((c) => c.id)).toEqual(['c1', 'c2']);
    expect(file.children.map((c) => c.nodeKind)).toEqual(['component', 'component']);
    // The frame contains a node with inline dotted styling.
    const frame = a.nodes[3]!;
    expect(frame.children).toHaveLength(1);
    const inner = frame.children[0]!;
    expect(inner.nodeKind).toBe('node');
    expect(inner.lineStyle).toBe('dotted');
    expect(inner.fill).toBe('aliceblue');
  });

  it('parses all 17 shape keywords with empty brace bodies (Input B)', () => {
    const a = parseDeployment([
      '@startuml',
      'action action { }',
      'artifact artifact { }',
      'card card { }',
      'cloud cloud { }',
      'component component { }',
      'database database { }',
      'file file { }',
      'folder folder { }',
      'frame frame { }',
      'hexagon hexagon { }',
      'node node { }',
      'package package { }',
      'process process { }',
      'queue queue { }',
      'rectangle rectangle { }',
      'stack stack { }',
      'storage storage { }',
      '@enduml',
    ].join('\n'));
    expect(a.nodes).toHaveLength(17);
    expect(a.nodes.map((n) => n.nodeKind)).toEqual([
      'action', 'artifact', 'card', 'cloud', 'component', 'database',
      // `file` is mapped to `artifact` for visual reuse.
      'artifact', 'folder', 'frame', 'hexagon', 'node', 'package',
      'process', 'queue', 'rectangle', 'stack', 'storage',
    ]);
    for (const n of a.nodes) expect(n.children).toEqual([]);
  });

  it('parses quoted alias display names that override the id (Input C)', () => {
    const a = parseDeployment([
      '@startuml',
      'artifact artifactVeryLOOOOOOOOOOOOOOOOOOOg as "artifact" { file f1 }',
      'card cardVeryLOOOOOOOOOOOOOOOOOOOg as "card" { file f2 }',
      '@enduml',
    ].join('\n'));
    expect(a.nodes).toHaveLength(2);
    expect(a.nodes[0]).toMatchObject({
      id: 'artifactVeryLOOOOOOOOOOOOOOOOOOOg',
      name: 'artifact',
      nodeKind: 'artifact',
    });
    expect(a.nodes[0]!.children.map((c) => c.id)).toEqual(['f1']);
    expect(a.nodes[1]).toMatchObject({
      id: 'cardVeryLOOOOOOOOOOOOOOOOOOOg',
      name: 'card',
      nodeKind: 'card',
    });
  });

  it('parses arbitrary nesting between mixed shape kinds (Input D)', () => {
    const a = parseDeployment([
      '@startuml',
      'artifact Foo1 { folder Foo2 }',
      'folder Foo3 { artifact Foo4 }',
      'frame Foo5 { database Foo6 }',
      'cloud vpc { node ec2 { stack stack } }',
      '@enduml',
    ].join('\n'));
    expect(a.nodes.map((n) => `${n.id}:${n.nodeKind}`)).toEqual([
      'Foo1:artifact', 'Foo3:folder', 'Foo5:frame', 'vpc:cloud',
    ]);
    expect(a.nodes[0]!.children.map((c) => `${c.id}:${c.nodeKind}`)).toEqual(['Foo2:folder']);
    expect(a.nodes[1]!.children.map((c) => `${c.id}:${c.nodeKind}`)).toEqual(['Foo4:artifact']);
    expect(a.nodes[2]!.children.map((c) => `${c.id}:${c.nodeKind}`)).toEqual(['Foo6:database']);
    // Two-level nesting: cloud > node > stack.
    const vpc = a.nodes[3]!;
    expect(vpc.children[0]).toMatchObject({ id: 'ec2', nodeKind: 'node' });
    expect(vpc.children[0]!.children[0]).toMatchObject({ id: 'stack', nodeKind: 'stack' });
  });

  it('parses more mixed shape nesting (Input E)', () => {
    const a = parseDeployment([
      '@startuml',
      'node Foo1 { cloud Foo2 }',
      'cloud Foo3 { frame Foo4 }',
      'database Foo5 { storage Foo6 }',
      'storage Foo7 { storage Foo8 }',
      '@enduml',
    ].join('\n'));
    expect(a.nodes).toHaveLength(4);
    expect(a.nodes[0]!.children[0]).toMatchObject({ id: 'Foo2', nodeKind: 'cloud' });
    expect(a.nodes[1]!.children[0]).toMatchObject({ id: 'Foo4', nodeKind: 'frame' });
    expect(a.nodes[2]!.children[0]).toMatchObject({ id: 'Foo6', nodeKind: 'storage' });
    expect(a.nodes[3]!.children[0]).toMatchObject({ id: 'Foo8', nodeKind: 'storage' });
  });

  it('parses heavily-nested 17-level chain on one source line (Input F)', () => {
    const a = parseDeployment([
      '@startuml',
      'action action { artifact artifact { card card { cloud cloud { component component { database database { file file { folder folder { frame frame { hexagon hexagon { node node { package package { process process { queue queue { rectangle rectangle { stack stack { storage storage { } } } } } } } } } } } } } } } } }',
      '@enduml',
    ].join('\n'));
    expect(a.nodes).toHaveLength(1);
    // Walk the chain and assert each level's kind matches the keyword used.
    const expectedKinds: string[] = [
      'action', 'artifact', 'card', 'cloud', 'component', 'database',
      // `file` maps to `artifact`.
      'artifact', 'folder', 'frame', 'hexagon', 'node', 'package',
      'process', 'queue', 'rectangle', 'stack', 'storage',
    ];
    let cur = a.nodes[0]!;
    for (let depth = 0; depth < expectedKinds.length; depth++) {
      expect(cur.nodeKind).toBe(expectedKinds[depth]);
      if (depth < expectedKinds.length - 1) {
        expect(cur.children).toHaveLength(1);
        cur = cur.children[0]!;
      } else {
        expect(cur.children).toEqual([]);
      }
    }
  });
});
