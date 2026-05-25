import { describe, it, expect } from 'vitest';
import { parseClass } from '../../src/parser/class/index.js';

function ast(src: string) {
  return parseClass(src);
}

describe('class parser — declarations', () => {
  it('parses bare class declarations', () => {
    const a = ast('@startuml\nclass Foo\nclass Bar\n@enduml');
    expect(a.classes).toHaveLength(2);
    expect(a.classes[0]).toMatchObject({ id: 'Foo', name: 'Foo', classKind: 'class' });
    expect(a.classes[1]).toMatchObject({ id: 'Bar', name: 'Bar', classKind: 'class' });
  });

  it('supports all kinds', () => {
    const a = ast([
      '@startuml',
      'class C',
      'interface I',
      'enum E',
      'abstract class AC',
      'abstract A',
      'annotation N',
      '@enduml',
    ].join('\n'));
    expect(a.classes.map((c) => c.classKind)).toEqual([
      'class', 'interface', 'enum', 'abstract', 'abstract', 'annotation',
    ]);
  });

  it('parses quoted names and aliases', () => {
    const a = ast('@startuml\nclass "Long Name" as L\n@enduml');
    expect(a.classes[0]).toMatchObject({ id: 'L', name: 'Long Name' });
  });

  it('captures stereotypes', () => {
    const a = ast('@startuml\nclass Foo <<Service>>\n@enduml');
    expect(a.classes[0]?.stereotype).toBe('Service');
  });

  it('captures title', () => {
    const a = ast('@startuml\ntitle Domain Model\nclass Foo\n@enduml');
    expect(a.title).toBe('Domain Model');
  });
});

describe('class parser — members', () => {
  it('parses fields with visibility and types', () => {
    const a = ast([
      '@startuml',
      'class Foo {',
      '  +pub: int',
      '  -priv: String',
      '  #prot',
      '  ~pkg',
      '  noVis',
      '}',
      '@enduml',
    ].join('\n'));
    const members = a.classes[0]!.members;
    expect(members.map((m) => ({ name: m.name, visibility: m.visibility, type: m.type }))).toEqual([
      { name: 'pub', visibility: 'public', type: 'int' },
      { name: 'priv', visibility: 'private', type: 'String' },
      { name: 'prot', visibility: 'protected', type: '' },
      { name: 'pkg', visibility: 'package', type: '' },
      { name: 'noVis', visibility: 'none', type: '' },
    ]);
  });

  it('parses methods with params and return types', () => {
    const a = ast([
      '@startuml',
      'class Foo {',
      '  +hello()',
      '  +add(x: int, y: int): int',
      '}',
      '@enduml',
    ].join('\n'));
    const members = a.classes[0]!.members;
    expect(members.map((m) => ({ kind: m.memberKind, name: m.name, params: m.params, type: m.type }))).toEqual([
      { kind: 'method', name: 'hello', params: '', type: '' },
      { kind: 'method', name: 'add', params: 'x: int, y: int', type: 'int' },
    ]);
  });

  it('parses {static} and {abstract} modifiers', () => {
    const a = ast([
      '@startuml',
      'class Foo {',
      '  {static} +instance: Foo',
      '  {abstract} +run()',
      '}',
      '@enduml',
    ].join('\n'));
    const members = a.classes[0]!.members;
    expect(members[0]).toMatchObject({ name: 'instance', isStatic: true, isAbstract: false });
    expect(members[1]).toMatchObject({ name: 'run', isStatic: false, isAbstract: true });
  });

  it('parses enum constants', () => {
    const a = ast([
      '@startuml',
      'enum Color {',
      '  RED',
      '  GREEN',
      '  BLUE',
      '}',
      '@enduml',
    ].join('\n'));
    expect(a.classes[0]?.enumConstants.map((e) => e.name)).toEqual(['RED', 'GREEN', 'BLUE']);
  });

  it('supports body opening brace on next line', () => {
    const a = ast([
      '@startuml',
      'class Foo',
      '{',
      '  +x: int',
      '}',
      '@enduml',
    ].join('\n'));
    expect(a.classes[0]?.members).toHaveLength(1);
  });

  it('sets hideEmptyMembers when `hide empty members` directive is present', () => {
    const a = ast('@startuml\nhide empty members\nclass A\n@enduml');
    expect(a.hideEmptyMembers).toBe(true);
  });

  it('leaves hideEmptyMembers false by default', () => {
    const a = ast('@startuml\nclass A\n@enduml');
    expect(a.hideEmptyMembers).toBe(false);
  });

  it('parses relationships using non-standard markers as plain-line associations', () => {
    const a = ast(
      [
        '@startuml',
        'Class21 #-- Class22',
        'Class23 x-- Class24',
        'Class25 }-- Class26',
        'Class27 +-- Class28',
        'Class29 ^-- Class30',
        '@enduml',
      ].join('\n'),
    );
    // All 5 relationships must be created, and all 10 classes auto-registered.
    expect(a.relationships).toHaveLength(5);
    expect(a.classes.map((c) => c.id)).toEqual([
      'Class21', 'Class22', 'Class23', 'Class24',
      'Class25', 'Class26', 'Class27', 'Class28',
      'Class29', 'Class30',
    ]);
    // Unrecognized markers degrade to `none` (rendered as a plain line).
    for (const rel of a.relationships) {
      expect(rel.sourceMarker).toBe('none');
      expect(rel.targetMarker).toBe('none');
      expect(rel.style).toBe('solid');
    }
  });
});
