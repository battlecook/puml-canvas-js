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
});
