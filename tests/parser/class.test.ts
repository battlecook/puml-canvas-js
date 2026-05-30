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

  it('captures Java-style `type name` / `type name()` members verbatim', () => {
    // PlantUML accepts both UML-style `name : type` and Java-style
    // `type name` (or `type name(args)`). The parser stores Java-style
    // lines as verbatim displayText so layout renders them as-is.
    const a = ast([
      '@startuml',
      'class Dummy {',
      '  String data',
      '  void methods()',
      '}',
      'class Flight {',
      '  flightNumber : Integer',
      '  departureTime : Date',
      '}',
      '@enduml',
    ].join('\n'));
    const dummy = a.classes.find((c) => c.id === 'Dummy');
    expect(dummy?.members).toHaveLength(2);
    const dummyTexts = dummy!.members.map((m) => m.displayText ?? m.name);
    expect(dummyTexts).toContain('String data');
    expect(dummyTexts).toContain('void methods()');
    // Flight keeps using the existing UML-style parser path.
    const flight = a.classes.find((c) => c.id === 'Flight');
    expect(flight?.members.map((m) => ({ name: m.name, type: m.type }))).toEqual([
      { name: 'flightNumber', type: 'Integer' },
      { name: 'departureTime', type: 'Date' },
    ]);
  });

  it('sets hideEmptyMembers when `hide empty members` directive is present', () => {
    const a = ast('@startuml\nhide empty members\nclass A\n@enduml');
    expect(a.hideEmptyMembers).toBe(true);
  });

  it('leaves hideEmptyMembers false by default', () => {
    const a = ast('@startuml\nclass A\n@enduml');
    expect(a.hideEmptyMembers).toBe(false);
  });

  it('accepts `$`-prefixed class names', () => {
    const a = ast('@startuml\nclass $C1\nclass $C2\n@enduml');
    expect(a.classes.map((c) => c.id)).toEqual(['$C1', '$C2']);
    expect(a.classes.map((c) => c.name)).toEqual(['$C1', '$C2']);
  });

  it('tolerates a leading `$tag` token before the class keyword', () => {
    // PlantUML accepts `$C2 class "$C2" as dollarC2` where `$C2` is a tag-style
    // decorator; the actual declaration is `class "$C2" as dollarC2`.
    const a = ast('@startuml\n$C2 class "$C2" as dollarC2\n@enduml');
    expect(a.classes).toHaveLength(1);
    expect(a.classes[0]).toMatchObject({ id: 'dollarC2', name: '$C2' });
  });

  it('drops classes mentioned by `remove <name>`', () => {
    const a = ast([
      '@startuml',
      'class $C1',
      'class $C2',
      '$C2 class "$C2" as dollarC2',
      'remove $C1',
      'remove $C2',
      'remove dollarC2',
      '@enduml',
    ].join('\n'));
    expect(a.classes).toHaveLength(0);
    expect(a.relationships).toHaveLength(0);
  });

  it('drops relationships involving removed classes', () => {
    const a = ast([
      '@startuml',
      'class A',
      'class B',
      'class C',
      'A --> B',
      'B --> C',
      'remove B',
      '@enduml',
    ].join('\n'));
    expect(a.classes.map((c) => c.id)).toEqual(['A', 'C']);
    expect(a.relationships).toHaveLength(0);
  });

  it('silently ignores `remove` for names that were never declared', () => {
    const a = ast('@startuml\nclass A\nremove Ghost\n@enduml');
    expect(a.classes.map((c) => c.id)).toEqual(['A']);
  });

  it('captures visibility prefix before the `class` keyword', () => {
    const a = ast([
      '@startuml',
      '-class "private Class" {',
      '}',
      '#class "protected Class" {',
      '}',
      '~class "package private Class" {',
      '}',
      '+class "public Class" {',
      '}',
      '@enduml',
    ].join('\n'));
    expect(a.classes.map((c) => c.visibility)).toEqual([
      'private', 'protected', 'package', 'public',
    ]);
    expect(a.classes.map((c) => c.name)).toEqual([
      'private Class', 'protected Class', 'package private Class', 'public Class',
    ]);
  });

  it('leaves visibility undefined when no prefix is present', () => {
    const a = ast('@startuml\nclass A\n@enduml');
    expect(a.classes[0]!.visibility).toBeUndefined();
  });

  it('parses inline directional arrows', () => {
    const a = ast([
      '@startuml',
      'foo -left-> dummyLeft',
      'foo -right-> dummyRight',
      'foo -up-> dummyUp',
      'foo -down-> dummyDown',
      '@enduml',
    ].join('\n'));
    expect(a.relationships.map((r) => r.direction)).toEqual([
      'left', 'right', 'up', 'down',
    ]);
  });

  it('reads `left to right direction` and `top to bottom direction`', () => {
    const lr = ast('@startuml\nleft to right direction\nclass A\n@enduml');
    expect(lr.direction).toBe('LR');
    const tb = ast('@startuml\ntop to bottom direction\nclass A\n@enduml');
    expect(tb.direction).toBe('TB');
  });

  it('leaves direction undefined by default', () => {
    const a = ast('@startuml\nclass A\n@enduml');
    expect(a.direction).toBeUndefined();
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

describe('class parser — inline extends/implements', () => {
  it('parses inline `implements` as a realization relation (dashed open triangle)', () => {
    const a = ast(
      [
        '@startuml',
        'class ArrayList implements List',
        'class ArrayList extends AbstractList',
        '@enduml',
      ].join('\n'),
    );
    // One class declared (the second declaration refines the same class id).
    // Two synthetic relationships: realization from List, inheritance from AbstractList.
    expect(a.classes.map((c) => c.id)).toEqual(['ArrayList', 'List', 'AbstractList']);
    expect(a.relationships).toHaveLength(2);
    const real = a.relationships.find((r) => r.kind === 'realization');
    const inh = a.relationships.find((r) => r.kind === 'inheritance');
    expect(real).toMatchObject({
      source: 'List',
      target: 'ArrayList',
      style: 'dashed',
      sourceMarker: 'triangle',
    });
    expect(inh).toMatchObject({
      source: 'AbstractList',
      target: 'ArrayList',
      style: 'solid',
      sourceMarker: 'triangle',
    });
  });

  it('parses comma-separated `extends` list as multiple inheritance relations', () => {
    const a = ast(
      [
        '@startuml',
        'class A extends B, C {',
        '}',
        '@enduml',
      ].join('\n'),
    );
    expect(a.classes.find((c) => c.id === 'A')?.members).toHaveLength(0);
    expect(a.classes.map((c) => c.id).sort()).toEqual(['A', 'B', 'C']);
    expect(a.relationships).toHaveLength(2);
    expect(a.relationships.every((r) => r.kind === 'inheritance')).toBe(true);
    expect(a.relationships.map((r) => r.source).sort()).toEqual(['B', 'C']);
    expect(a.relationships.every((r) => r.target === 'A')).toBe(true);
  });
});

describe('class parser — inline #style block', () => {
  it('parses `back:<color>` and `line:<color>` (order arbitrary)', () => {
    const a = ast(
      [
        '@startuml',
        'class bar #line:green;back:lightblue',
        'class bar2 #lightblue;line:green',
        '@enduml',
      ].join('\n'),
    );
    expect(a.classes[0]).toMatchObject({ fill: 'lightblue', borderColor: 'green' });
    // bare `#lightblue` is treated as `back:` (fill).
    expect(a.classes[1]).toMatchObject({ fill: 'lightblue', borderColor: 'green' });
  });

  it('normalizes bare hex colors (no leading #)', () => {
    const a = ast('@startuml\nclass Foo1 #back:red;line:00FFFF\n@enduml');
    expect(a.classes[0]).toMatchObject({ fill: 'red', borderColor: '#00FFFF' });
  });

  it('parses `line.dashed:<color>` and `line.dotted:<color>` and `line.bold`', () => {
    const a = ast(
      [
        '@startuml',
        'class FooDashed #line.dashed:blue',
        'class FooDotted #line.dotted:blue',
        'class FooBold #line.bold',
        '@enduml',
      ].join('\n'),
    );
    expect(a.classes[0]).toMatchObject({ borderStyle: 'dashed', borderColor: 'blue' });
    expect(a.classes[1]).toMatchObject({ borderStyle: 'dotted', borderColor: 'blue' });
    expect(a.classes[2]).toMatchObject({ borderStyle: 'bold' });
  });

  it('parses gradient `back:c1|c2` and `header:c1/c2`', () => {
    const a = ast(
      '@startuml\nclass Demo1 #back:lightgreen|yellow;header:blue/red\n@enduml',
    );
    expect(a.classes[0]).toMatchObject({
      fill: 'lightgreen',
      fillGradient: ['lightgreen', 'yellow'],
      headerFill: 'blue',
      headerGradient: ['blue', 'red'],
    });
  });
});
