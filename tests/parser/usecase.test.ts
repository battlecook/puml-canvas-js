import { describe, it, expect } from 'vitest';
import { parseUseCase } from '../../src/parser/usecase/index.js';

function ast(src: string) {
  return parseUseCase(src);
}

describe('use case parser', () => {
  it('parses actor and usecase declarations', () => {
    const a = ast('@startuml\nactor User\nusecase Login\n@enduml');
    expect(a.nodes).toEqual([
      { id: 'User', name: 'User', kind: 'actor' },
      { id: 'Login', name: 'Login', kind: 'usecase' },
    ]);
  });

  it('supports quoted names and aliases', () => {
    const a = ast('@startuml\nactor "Power User" as PU\nusecase "Reset Password" as RP\n@enduml');
    expect(a.nodes[0]).toEqual({ id: 'PU', name: 'Power User', kind: 'actor' });
    expect(a.nodes[1]).toEqual({ id: 'RP', name: 'Reset Password', kind: 'usecase' });
  });

  it('supports shorthand :Name: and (Name) declarations on their own line', () => {
    const a = ast('@startuml\n:User:\n(Login)\n@enduml');
    expect(a.nodes).toEqual([
      { id: 'User', name: 'User', kind: 'actor' },
      { id: 'Login', name: 'Login', kind: 'usecase' },
    ]);
  });

  it('parses relationships with shorthand endpoints', () => {
    const a = ast('@startuml\n:User: --> (Login)\n@enduml');
    expect(a.nodes.length).toBe(2);
    expect(a.nodes.find((n) => n.id === 'User')?.kind).toBe('actor');
    expect(a.nodes.find((n) => n.id === 'Login')?.kind).toBe('usecase');
    expect(a.relationships[0]).toMatchObject({ source: 'User', target: 'Login' });
  });

  it('captures arrow markers and label', () => {
    const a = ast('@startuml\n(Login) ..> (Auth) : <<include>>\n@enduml');
    expect(a.relationships[0]).toMatchObject({
      source: 'Login',
      target: 'Auth',
      style: 'dashed',
      targetMarker: 'arrow',
      label: '<<include>>',
    });
  });

  it('captures title', () => {
    const a = ast('@startuml\ntitle Auth flow\nactor U\n@enduml');
    expect(a.title).toBe('Auth flow');
  });

  it('captures rectangle container as a system boundary', () => {
    const a = ast([
      '@startuml',
      'actor User',
      'rectangle System {',
      '  usecase Login as UC1',
      '  usecase Logout as UC2',
      '}',
      'User --> UC1',
      '@enduml',
    ].join('\n'));
    expect(a.containers).toHaveLength(1);
    expect(a.containers[0]).toMatchObject({
      id: 'System',
      label: 'System',
      childIds: ['UC1', 'UC2'],
    });
    expect(a.nodes.map((n) => n.id)).toEqual(['User', 'UC1', 'UC2']);
  });

  it('supports package and quoted container labels', () => {
    const a = ast([
      '@startuml',
      'package "Web Portal" as web {',
      '  usecase Login',
      '}',
      '@enduml',
    ].join('\n'));
    expect(a.containers[0]).toMatchObject({
      id: 'web',
      label: 'Web Portal',
      childIds: ['Login'],
    });
  });

  it('keeps usecases outside container in no container', () => {
    const a = ast([
      '@startuml',
      'rectangle Inside {',
      '  usecase A',
      '}',
      'usecase B',
      '@enduml',
    ].join('\n'));
    expect(a.containers[0]!.childIds).toEqual(['A']);
    expect(a.nodes.find((n) => n.id === 'B')).toBeDefined();
  });

  it('binds a quoted display to a usecase via `as (Alias)`', () => {
    const a = ast('@startuml\n"Use the application" as (Use)\n@enduml');
    expect(a.nodes).toEqual([
      { id: 'Use', name: 'Use the application', kind: 'usecase' },
    ]);
  });

  it('treats bare `"Display" as Alias` as an actor declaration', () => {
    const a = ast('@startuml\n"Main Admin" as Admin\nAdmin --> (Login)\n@enduml');
    expect(a.nodes.find((n) => n.id === 'Admin')).toEqual({
      id: 'Admin',
      name: 'Main Admin',
      kind: 'actor',
    });
  });

  it('captures `skinparam actorStyle awesome` into ast.skin', () => {
    const a = ast([
      '@startuml',
      'skinparam actorStyle awesome',
      ':User: --> (Use)',
      '"Main Admin" as Admin',
      '"Use the application" as (Use)',
      'Admin --> (Admin the application)',
      '@enduml',
    ].join('\n'));
    expect(a.skin?.actorstyle).toBe('awesome');
    // Skinparam line is stripped from the parser stream, so the rest of the
    // AST should still resolve normally.
    const actors = a.nodes.filter((n) => n.kind === 'actor');
    const usecases = a.nodes.filter((n) => n.kind === 'usecase');
    expect(actors.map((n) => n.id)).toEqual(['User', 'Admin']);
    expect(usecases.map((n) => n.id)).toEqual(['Use', 'Admin the application']);
    expect(a.relationships).toHaveLength(2);
  });

  it('captures `skinparam usecase { ... }` block including stereotype-scoped overrides', () => {
    const a = ast([
      '@startuml',
      'skinparam handwritten true',
      '',
      'skinparam usecase {',
      'BackgroundColor DarkSeaGreen',
      'BorderColor DarkSlateGray',
      '',
      'BackgroundColor<< Main >> YellowGreen',
      'BorderColor<< Main >> YellowGreen',
      '',
      'ArrowColor Olive',
      'ActorBorderColor black',
      'ActorFontName Courier',
      '',
      'ActorBackgroundColor<< Human >> Gold',
      '}',
      '',
      'User << Human >>',
      '(Start) << One Shot >>',
      'User -> (Start)',
      '@enduml',
    ].join('\n'));
    // Default (un-scoped) keys are present, lower-cased.
    expect(a.skin?.['backgroundcolor']).toBe('DarkSeaGreen');
    expect(a.skin?.['bordercolor']).toBe('DarkSlateGray');
    expect(a.skin?.['arrowcolor']).toBe('Olive');
    expect(a.skin?.['actorbordercolor']).toBe('black');
    expect(a.skin?.['actorfontname']).toBe('Courier');
    expect(a.skin?.['handwritten']).toBe('true');
    // Stereotype-scoped overrides are preserved as `prop<<stereo>>` keys.
    expect(a.skin?.['backgroundcolor<<main>>']).toBe('YellowGreen');
    expect(a.skin?.['bordercolor<<main>>']).toBe('YellowGreen');
    expect(a.skin?.['actorbackgroundcolor<<human>>']).toBe('Gold');
    // Stereotypes still attach to nodes normally.
    const user = a.nodes.find((n) => n.id === 'User');
    expect(user?.stereotype).toBe('Human');
    const start = a.nodes.find((n) => n.id === 'Start');
    expect(start?.stereotype).toBe('One Shot');
  });

  it('captures a multi-line quoted usecase label and splits separators into blocks', () => {
    const a = ast([
      '@startuml',
      '',
      'usecase UC1 as "You can use',
      'several lines to define your usecase.',
      'You can also use separators.',
      '--',
      'Several separators are possible.',
      '==',
      'And you can add titles:',
      '..Conclusion..',
      'This allows large description."',
      '',
      '@enduml',
    ].join('\n'));
    expect(a.nodes).toHaveLength(1);
    const uc = a.nodes[0]!;
    expect(uc.id).toBe('UC1');
    expect(uc.kind).toBe('usecase');
    // The raw display string keeps the embedded newlines so callers that
    // don't care about block structure can still print it verbatim.
    expect(uc.name).toContain('several lines');
    expect(uc.name).toContain('Conclusion');
    // The structured form is what layout consumes.
    expect(uc.labelBlocks).toBeDefined();
    const kinds = uc.labelBlocks!.map((b) => b.kind);
    // Expected order: text, solid sep, text, double sep, text, titled sep, text.
    expect(kinds).toEqual([
      'text',
      'sep-solid',
      'text',
      'sep-double',
      'text',
      'sep-titled',
      'text',
    ]);
    const titled = uc.labelBlocks!.find((b) => b.kind === 'sep-titled') as {
      kind: 'sep-titled';
      text: string;
    };
    expect(titled.text).toBe('Conclusion');
  });

  it('does not emit labelBlocks for a single-line usecase declaration', () => {
    const a = ast('@startuml\nusecase Login\n@enduml');
    expect(a.nodes[0]!.labelBlocks).toBeUndefined();
  });

  it('parses the four-line mixed declaration form end-to-end', () => {
    const a = ast([
      '@startuml',
      ':User: --> (Use)',
      '"Main Admin" as Admin',
      '"Use the application" as (Use)',
      'Admin --> (Admin the application)',
      '@enduml',
    ].join('\n'));
    const actors = a.nodes.filter((n) => n.kind === 'actor');
    const usecases = a.nodes.filter((n) => n.kind === 'usecase');
    expect(actors).toEqual([
      { id: 'User', name: 'User', kind: 'actor' },
      { id: 'Admin', name: 'Main Admin', kind: 'actor' },
    ]);
    expect(usecases).toEqual([
      { id: 'Use', name: 'Use the application', kind: 'usecase' },
      { id: 'Admin the application', name: 'Admin the application', kind: 'usecase' },
    ]);
    expect(a.relationships).toHaveLength(2);
    expect(a.relationships[0]).toMatchObject({ source: 'User', target: 'Use' });
    expect(a.relationships[1]).toMatchObject({
      source: 'Admin',
      target: 'Admin the application',
    });
  });

  it('binds `(Display) as (Alias)` to a single usecase node', () => {
    const a = ast('@startuml\n(Use the application) as (Use)\n@enduml');
    const usecases = a.nodes.filter((n) => n.kind === 'usecase');
    expect(usecases).toEqual([
      { id: 'Use', name: 'Use the application', kind: 'usecase' },
    ]);
  });

  it('declares a free-standing note via `note "..." as Id` with `\\n` expanded', () => {
    const a = ast('@startuml\nnote "first\\nsecond" as N2\n@enduml');
    const notes = a.nodes.filter((n) => n.kind === 'note');
    expect(notes).toHaveLength(1);
    expect(notes[0]!).toMatchObject({ id: 'N2', kind: 'note', text: 'first\nsecond' });
  });

  it('parses `note right of X : text` as an attached note', () => {
    const a = ast([
      '@startuml',
      'actor Admin',
      'note right of Admin : This is an example.',
      '@enduml',
    ].join('\n'));
    const note = a.nodes.find((n) => n.kind === 'note');
    expect(note).toBeDefined();
    expect(note).toMatchObject({
      kind: 'note',
      text: 'This is an example.',
      anchorId: 'Admin',
      anchorSide: 'right',
    });
  });

  it('parses a multi-line `note right of X` ... `end note` block', () => {
    const a = ast([
      '@startuml',
      '(Use the application) as (Use)',
      'note right of (Use)',
      '  A note can also',
      '  be on several lines',
      'end note',
      '@enduml',
    ].join('\n'));
    const note = a.nodes.find((n) => n.kind === 'note');
    expect(note).toBeDefined();
    expect(note).toMatchObject({
      kind: 'note',
      anchorId: 'Use',
      anchorSide: 'right',
    });
    expect(note!.text).toBe('A note can also\nbe on several lines');
  });

  it('parses `..` between a node and a free-standing note as a dashed relationship', () => {
    const a = ast([
      '@startuml',
      'note "memo" as N2',
      '(Start) .. N2',
      'N2 .. (Use)',
      '@enduml',
    ].join('\n'));
    expect(a.relationships).toHaveLength(2);
    for (const r of a.relationships) {
      expect(r.style).toBe('dashed');
      expect(r.sourceMarker).toBe('none');
      expect(r.targetMarker).toBe('none');
    }
    // N2 stays as a note (the relationship should not have promoted it).
    expect(a.nodes.find((n) => n.id === 'N2')!.kind).toBe('note');
  });

  it('parses the full failing example end-to-end', () => {
    const a = ast([
      '@startuml',
      ':Main Admin: as Admin',
      '(Use the application) as (Use)',
      '',
      'User -> (Start)',
      'User --> (Use)',
      '',
      'Admin ---> (Use)',
      '',
      'note right of Admin : This is an example.',
      '',
      'note right of (Use)',
      '  A note can also',
      '  be on several lines',
      'end note',
      '',
      'note "This note is connected\\nto several objects." as N2',
      '(Start) .. N2',
      'N2 .. (Use)',
      '@enduml',
    ].join('\n'));

    const notes = a.nodes.filter((n) => n.kind === 'note');

    // All four named (non-note) nodes are present. The Admin alias is bound
    // to the actor shorthand `:Main Admin:` and the Use alias to the
    // paren-wrapped display `(Use the application)`. Start and User are
    // auto-declared from the arrow lines.
    const namedIds = a.nodes
      .filter((n) => n.kind !== 'note')
      .map((n) => n.id)
      .sort();
    expect(namedIds).toEqual(['Admin', 'Start', 'Use', 'User']);
    expect(a.nodes.find((n) => n.id === 'Admin')!.kind).toBe('actor');
    expect(a.nodes.find((n) => n.id === 'Admin')!.name).toBe('Main Admin');
    expect(a.nodes.find((n) => n.id === 'Use')!.name).toBe('Use the application');

    // Two attached notes (right-of Admin, right-of Use) + one free standing (N2).
    expect(notes).toHaveLength(3);
    expect(notes.filter((n) => n.anchorId).length).toBe(2);
    expect(notes.find((n) => n.id === 'N2')!.text).toContain('several objects');

    // Three flow arrows + two `..` dashed lines into N2.
    const dashed = a.relationships.filter((r) => r.style === 'dashed');
    expect(dashed.length).toBeGreaterThanOrEqual(2);
    expect(dashed.every((r) => r.source === 'N2' || r.target === 'N2')).toBe(true);
  });

  it('treats bare-id `Foo << Stereo >>` as an actor declaration with stereotype', () => {
    const a = ast('@startuml\nUser << Human >>\n@enduml');
    expect(a.nodes).toEqual([
      { id: 'User', name: 'User', kind: 'actor', stereotype: 'Human' },
    ]);
  });

  it('captures stereotype on actor shorthand with alias and uses display as name', () => {
    const a = ast('@startuml\n:Main Database: as MySql << Application >>\n@enduml');
    expect(a.nodes).toEqual([
      { id: 'MySql', name: 'Main Database', kind: 'actor', stereotype: 'Application' },
    ]);
  });

  it('captures stereotype on usecase shorthand', () => {
    const a = ast('@startuml\n(Start) << One Shot >>\n@enduml');
    expect(a.nodes).toEqual([
      { id: 'Start', name: 'Start', kind: 'usecase', stereotype: 'One Shot' },
    ]);
  });

  it('captures stereotype on paren-as-paren usecase with alias and uses display as name', () => {
    const a = ast('@startuml\n(Use the application) as (Use) << Main >>\n@enduml');
    expect(a.nodes).toEqual([
      { id: 'Use', name: 'Use the application', kind: 'usecase', stereotype: 'Main' },
    ]);
  });

  it('normalizes a reverse dashed arrow `(UC) <.. :actor:` to actor -> UC', () => {
    const a = ast('@startuml\n(Use case 1) <.. :user:\n@enduml');
    expect(a.nodes.find((n) => n.id === 'user')?.kind).toBe('actor');
    expect(a.nodes.find((n) => n.id === 'Use case 1')?.kind).toBe('usecase');
    expect(a.relationships).toHaveLength(1);
    expect(a.relationships[0]).toMatchObject({
      source: 'user',
      target: 'Use case 1',
      style: 'dashed',
      sourceMarker: 'none',
      targetMarker: 'arrow',
    });
  });

  it('normalizes a reverse solid arrow `(UC) <- :actor:` to actor -> UC', () => {
    const a = ast('@startuml\n(Use case 2) <- :user:\n@enduml');
    expect(a.relationships).toHaveLength(1);
    expect(a.relationships[0]).toMatchObject({
      source: 'user',
      target: 'Use case 2',
      style: 'solid',
      sourceMarker: 'none',
      targetMarker: 'arrow',
    });
  });

  it('defaults a bare-id relationship endpoint to actor, paren to usecase', () => {
    // PlantUML's default disambiguation: a bare identifier referenced on a
    // relationship endpoint without a prior declaration is an actor; only
    // `(Foo)` syntax promotes it to a use case.
    const a = ast([
      '@startuml',
      'User -> (Start)',
      'User --> (Use)',
      'Admin --> (Use)',
      '@enduml',
    ].join('\n'));
    const byId = (id: string) => a.nodes.find((n) => n.id === id);
    expect(byId('User')?.kind).toBe('actor');
    expect(byId('Admin')?.kind).toBe('actor');
    expect(byId('Start')?.kind).toBe('usecase');
    expect(byId('Use')?.kind).toBe('usecase');
  });

  it('keeps an explicit `usecase Foo` declaration even when later referenced as a bare id', () => {
    // Explicit declaration must win over the bare-id default-to-actor in any
    // arrow that references the same id later.
    const a = ast([
      '@startuml',
      'usecase Foo',
      'Foo -> (Bar)',
      '@enduml',
    ].join('\n'));
    expect(a.nodes.find((n) => n.id === 'Foo')?.kind).toBe('usecase');
    expect(a.nodes.find((n) => n.id === 'Bar')?.kind).toBe('usecase');
  });

  it('leaves a forward arrow `A -> B` unswapped', () => {
    const a = ast('@startuml\n:user: -> (Use case 1)\n@enduml');
    expect(a.relationships[0]).toMatchObject({
      source: 'user',
      target: 'Use case 1',
      sourceMarker: 'none',
      targetMarker: 'arrow',
    });
  });

  it('parses the checkout / actor-rectangle example end-to-end', () => {
    // Stresses four features in a single source:
    //   1. `left to right direction` — sets ast.direction='LR'.
    //   2. `skinparam packageStyle rectangle` — captured as a flat skin key,
    //      no parser noise.
    //   3. `rectangle Name { ... }` accumulates MULTIPLE member nodes
    //      (`(checkout)`, `(payment)`, `(help)`) as the container's children.
    //   4. The single-dot `.>` shorthand parses as a dashed arrow with an
    //      `arrow` target marker, identical to the more verbose `..>`.
    const a = ast([
      '@startuml',
      'left to right direction',
      'skinparam packageStyle rectangle',
      'actor customer',
      'actor clerk',
      'rectangle checkout {',
      '  customer -- (checkout)',
      '  (checkout) .> (payment) : include',
      '  (help) .> (checkout) : extends',
      '  (checkout) -- clerk',
      '}',
      '@enduml',
    ].join('\n'));

    expect(a.direction).toBe('LR');
    expect(a.skin?.packagestyle).toBe('rectangle');

    const actors = a.nodes.filter((n) => n.kind === 'actor').map((n) => n.id);
    const usecases = a.nodes.filter((n) => n.kind === 'usecase').map((n) => n.id);
    expect(actors).toEqual(['customer', 'clerk']);
    // checkout / payment / help are all auto-promoted to usecase by their
    // paren-wrapped endpoints inside the container.
    expect(usecases).toEqual(['checkout', 'payment', 'help']);

    expect(a.containers).toHaveLength(1);
    expect(a.containers[0]).toMatchObject({
      id: 'checkout',
      label: 'checkout',
      // All three (use case) members declared via arrow endpoints inside the
      // braces land in the container's child list.
      childIds: ['checkout', 'payment', 'help'],
    });

    expect(a.relationships).toHaveLength(4);
    // `--` is solid with neither end marker.
    expect(a.relationships[0]).toMatchObject({
      source: 'customer',
      target: 'checkout',
      style: 'solid',
      sourceMarker: 'none',
      targetMarker: 'none',
    });
    // `.>` is dashed with a target arrow head; label survives the `:`.
    expect(a.relationships[1]).toMatchObject({
      source: 'checkout',
      target: 'payment',
      style: 'dashed',
      targetMarker: 'arrow',
      label: 'include',
    });
    expect(a.relationships[2]).toMatchObject({
      source: 'help',
      target: 'checkout',
      style: 'dashed',
      targetMarker: 'arrow',
      label: 'extends',
    });
    expect(a.relationships[3]).toMatchObject({
      source: 'checkout',
      target: 'clerk',
      style: 'solid',
      sourceMarker: 'none',
      targetMarker: 'none',
    });
  });

  it('captures `top to bottom direction` as the explicit TB default', () => {
    const a = ast([
      '@startuml',
      'top to bottom direction',
      'actor A',
      'usecase B',
      '@enduml',
    ].join('\n'));
    expect(a.direction).toBe('TB');
  });

  it('accepts a single-dot dashed arrow `.>` outside a container too', () => {
    const a = ast('@startuml\n(Login) .> (Auth) : include\n@enduml');
    expect(a.relationships[0]).toMatchObject({
      source: 'Login',
      target: 'Auth',
      style: 'dashed',
      targetMarker: 'arrow',
      label: 'include',
    });
  });

  it('flags business actors declared with the `/` shorthand', () => {
    const a = ast([
      '@startuml',
      '',
      ':First Actor:/',
      ':Another\\nactor:/ as Man2',
      'actor/ Woman3',
      'actor/ :Last actor: as Person1',
      '',
      '@enduml',
    ].join('\n'));
    const actors = a.nodes.filter((n) => n.kind === 'actor');
    expect(actors).toHaveLength(4);
    for (const act of actors) {
      expect(act.business).toBe(true);
    }
    // Identity / display checks for each form.
    const first = actors.find((n) => n.id === 'First Actor');
    expect(first).toMatchObject({ name: 'First Actor', business: true });

    const man2 = actors.find((n) => n.id === 'Man2');
    // Embedded `\n` in source → real newline after unescape.
    expect(man2).toMatchObject({ name: 'Another\nactor', business: true });

    const woman3 = actors.find((n) => n.id === 'Woman3');
    expect(woman3).toMatchObject({ name: 'Woman3', business: true });

    const person1 = actors.find((n) => n.id === 'Person1');
    expect(person1).toMatchObject({ name: 'Last actor', business: true });
  });

  it('flags business use cases declared with the `/` shorthand', () => {
    const a = ast([
      '@startuml',
      '',
      '(First usecase)/',
      '(Another usecase)/ as (UC2)',
      'usecase/ UC3',
      'usecase/ (Last\\nusecase) as UC4',
      '',
      '@enduml',
    ].join('\n'));
    const usecases = a.nodes.filter((n) => n.kind === 'usecase');
    expect(usecases).toHaveLength(4);
    for (const uc of usecases) {
      expect(uc.business).toBe(true);
    }
    // Identity / display checks for each form.
    const first = usecases.find((n) => n.id === 'First usecase');
    expect(first).toMatchObject({ name: 'First usecase', business: true });

    const uc2 = usecases.find((n) => n.id === 'UC2');
    expect(uc2).toMatchObject({ name: 'Another usecase', business: true });

    const uc3 = usecases.find((n) => n.id === 'UC3');
    expect(uc3).toMatchObject({ name: 'UC3', business: true });

    // UC4 keeps the embedded newline from `\n` in the source.
    const uc4 = usecases.find((n) => n.id === 'UC4');
    expect(uc4?.business).toBe(true);
    expect(uc4?.name).toBe('Last\nusecase');
  });

  it('captures inline direction hints (`-left->`, `--right->`, `-u->`) as rel.direction', () => {
    // Each line uses a different qualifier syntax (long word vs. single
    // letter, single-dash vs. double-dash) so we cover the whole grammar.
    const a = ast([
      '@startuml',
      ':user: -left-> (dummyLeft)',
      ':user: --right-> (dummyRight)',
      ':user: -u-> (dummyUp)',
      ':user: --d-> (dummyDown)',
      '@enduml',
    ].join('\n'));
    const dirs = a.relationships.map((r) => r.direction);
    expect(dirs).toEqual(['left', 'right', 'up', 'down']);
    // Stripping the hint must NOT change the arrow's solid/dashed style.
    for (const r of a.relationships) {
      expect(r.style).toBe('solid');
      expect(r.targetMarker).toBe('arrow');
    }
    // Targets are still declared as usecases (paren shorthand wins).
    const dummyLeft = a.nodes.find((n) => n.id === 'dummyLeft');
    expect(dummyLeft?.kind).toBe('usecase');
  });
});
