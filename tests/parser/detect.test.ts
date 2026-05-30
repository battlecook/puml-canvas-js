import { describe, it, expect } from 'vitest';
import { tokenize } from '../../src/lexer/index.js';
import { detectKind } from '../../src/parser/detect.js';

function detect(src: string) {
  return detectKind(tokenize(src)).kind;
}

describe('detectKind', () => {
  it('returns unknown when no wrapper is present', () => {
    expect(detect('just text')).toBe('unknown');
  });

  it('maps non-uml wrappers directly', () => {
    expect(detect('@startmindmap\n* root\n@endmindmap')).toBe('mindmap');
    expect(detect('@startmindmap\n# root\n## child\n@endmindmap')).toBe('mindmap');
    expect(detect('@startgantt\n[task] lasts 5 days\n@endgantt')).toBe('gantt');
    expect(detect('@startjson\n{"a":1}\n@endjson')).toBe('json');
    expect(detect('@startyaml\na: 1\n@endyaml')).toBe('yaml');
    expect(detect('@startwbs\n* root\n@endwbs')).toBe('wbs');
    expect(detect('@startsalt\n{...}\n@endsalt')).toBe('salt');
    expect(detect('@startnwdiag\nnetwork dmz {}\n@endnwdiag')).toBe('nwdiag');
  });

  it('detects sequence from participant keyword', () => {
    expect(detect('@startuml\nparticipant Alice\n@enduml')).toBe('sequence');
    expect(detect('@startuml\nactor User\n@enduml')).toBe('sequence');
    expect(detect('@startuml\nautonumber\nA -> B\n@enduml')).toBe('sequence');
  });

  it('detects class from class/interface/enum keywords', () => {
    expect(detect('@startuml\nclass Foo\n@enduml')).toBe('class');
    expect(detect('@startuml\ninterface I\n@enduml')).toBe('class');
    expect(detect('@startuml\nenum E\n@enduml')).toBe('class');
  });

  it('detects state, activity, component, usecase, object', () => {
    expect(detect('@startuml\nstate S\n@enduml')).toBe('state');
    expect(detect('@startuml\nstart\n:do;\n@enduml')).toBe('activity');
    expect(detect('@startuml\ncomponent C\n@enduml')).toBe('component');
    expect(detect('@startuml\nusecase U\n@enduml')).toBe('usecase');
    expect(detect('@startuml\nobject O\n@enduml')).toBe('object');
  });

  it('falls back to sequence when first token looks like a message', () => {
    expect(detect('@startuml\nAlice -> Bob: hi\n@enduml')).toBe('sequence');
  });

  it('uses ( vs [ to disambiguate usecase vs component', () => {
    expect(detect('@startuml\n(login)\n@enduml')).toBe('usecase');
    expect(detect('@startuml\n[component]\n@enduml')).toBe('component');
  });

  it('detects state when first content is [*]', () => {
    expect(detect('@startuml\n[*] --> Active\n@enduml')).toBe('state');
  });

  it('detects class diagram from class-style arrows when no keyword is present', () => {
    // Inheritance triangle
    expect(detect('@startuml\nA <|-- B\n@enduml')).toBe('class');
    // Composition diamond
    expect(detect('@startuml\nA *-- B\n@enduml')).toBe('class');
    // Aggregation diamond
    expect(detect('@startuml\nA o-- B\n@enduml')).toBe('class');
    // Dashed dependency
    expect(detect('@startuml\nA .. B\n@enduml')).toBe('class');
  });

  it('still picks sequence for plain ->/--> arrows with no class signatures', () => {
    expect(detect('@startuml\nAlice -> Bob\n@enduml')).toBe('sequence');
    expect(detect('@startuml\nAlice --> Bob\n@enduml')).toBe('sequence');
  });

  it('detects class for less-common arrow markers (+/#/x/}/^)', () => {
    expect(detect('@startuml\nA +-- B\n@enduml')).toBe('class');
    expect(detect('@startuml\nA #-- B\n@enduml')).toBe('class');
    expect(detect('@startuml\nA x-- B\n@enduml')).toBe('class');
    expect(detect('@startuml\nA }-- B\n@enduml')).toBe('class');
    expect(detect('@startuml\nA ^-- B\n@enduml')).toBe('class');
  });

  it('detects class for plain dashes with no arrowhead (A - B, A -- B)', () => {
    expect(detect('@startuml\nA - B\n@enduml')).toBe('class');
    expect(detect('@startuml\nA -- B\n@enduml')).toBe('class');
  });

  it('keeps reverse sequence (A <- B) as sequence', () => {
    expect(detect('@startuml\nAlice <- Bob\n@enduml')).toBe('sequence');
    expect(detect('@startuml\nAlice <-- Bob\n@enduml')).toBe('sequence');
  });

  it('classifies found/lost boundary messages (`[-> X`, `X ->]`) as sequence', () => {
    expect(detect('@startuml\n[-> Bob\n@enduml')).toBe('sequence');
    expect(detect('@startuml\nBob ->]\n@enduml')).toBe('sequence');
    // `o->o` shouldn't trigger the class-aggregation heuristic on a boundary line.
    expect(detect('@startuml\n[o->o Bob\nBob o->o]\n@enduml')).toBe('sequence');
    // Reversed forms.
    expect(detect('@startuml\n[<- Bob\nBob <-]\n@enduml')).toBe('sequence');
  });

  it('classifies a sequence diagram with bare `...` delay between arrows as sequence', () => {
    const src = [
      '@startuml',
      'Bob -> Alice : hello',
      '...',
      'Alice -> Bob : ok',
      '@enduml',
    ].join('\n');
    expect(detect(src)).toBe('sequence');
  });

  it('classifies sequence with `... text ...` delay between arrows as sequence', () => {
    const src = [
      '@startuml',
      'Bob -> Alice : hello',
      '... long delay ...',
      'Alice -> Bob : ok',
      '@enduml',
    ].join('\n');
    expect(detect(src)).toBe('sequence');
  });

  it('detects usecase when colon-actor shorthand is paired with a `(usecase)` arrow target', () => {
    // `:User:` alone weakly signals sequence; the `(Use)` on the SAME line is a
    // strong usecase signal and must override.
    expect(detect('@startuml\n:User: --> (Use)\n@enduml')).toBe('usecase');
  });

  it('detects usecase from `"Display" as (Alias)` (bare quoted form bound to a usecase alias)', () => {
    const src = [
      '@startuml',
      ':User: --> (Use)',
      '"Use the application" as (Use)',
      '@enduml',
    ].join('\n');
    expect(detect(src)).toBe('usecase');
  });

  it('treats markdown-style `- Action` lines as activity (compatible-viewer extension)', () => {
    const src = [
      '@startuml',
      '- Action 1',
      '- Action 2',
      '- Action 3',
      '@enduml',
    ].join('\n');
    expect(detect(src)).toBe('activity');
  });

  it('treats `* Action` bullet lines as activity (activity-beta shortcut)', () => {
    const src = [
      '@startuml',
      '* Action 1',
      '* Action 2',
      '* Action 3',
      '@enduml',
    ].join('\n');
    expect(detect(src)).toBe('activity');
  });

  it('treats multi-level `**`/`***` bullets inside @startuml as activity (not class)', () => {
    const src = [
      '@startuml',
      '* Action 1',
      '** Sub-Action 1.1',
      '*** Sub-Action 1.2.1',
      '* Action 2',
      '@enduml',
    ].join('\n');
    expect(detect(src)).toBe('activity');
  });
});
