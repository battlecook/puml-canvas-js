import { describe, it, expect } from 'vitest';
import { parseComponent } from '../../src/parser/container/component.js';
import { parseDeployment } from '../../src/parser/container/deployment.js';
import { parseObject } from '../../src/parser/container/object.js';

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
