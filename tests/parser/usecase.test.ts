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

  it('expands \\n escapes in arrow labels to real newlines', () => {
    const a = ast([
      '@startuml',
      'User -> (Start)',
      'User --> (Use the application) : A small label',
      ':Main Admin: ---> (Use the application) : This is\\nyet another\\nlabel',
      '@enduml',
    ].join('\n'));
    // Third relationship is the one with \n escapes; assert the stored label
    // contains real newlines, not the two-char `\n` sequence.
    const third = a.relationships[2]!;
    expect(third.label).toBe('This is\nyet another\nlabel');
    expect(third.label).not.toContain('\\n');
    expect(third.label.split('\n')).toHaveLength(3);
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
    // Nested-in-block keys are stored with the group as a dotted prefix
    // (`usecase.<prop>`) so a nested `BackgroundColor` doesn't clobber the
    // canvas-level top-level `backgroundcolor`. Top-level `handwritten`
    // remains unprefixed.
    expect(a.skin?.['usecase.backgroundcolor']).toBe('DarkSeaGreen');
    expect(a.skin?.['usecase.bordercolor']).toBe('DarkSlateGray');
    expect(a.skin?.['usecase.arrowcolor']).toBe('Olive');
    expect(a.skin?.['usecase.actorbordercolor']).toBe('black');
    expect(a.skin?.['usecase.actorfontname']).toBe('Courier');
    expect(a.skin?.['handwritten']).toBe('true');
    // The page canvas key MUST NOT be set by a nested `usecase {
    // BackgroundColor X }` — the canvas stays white/transparent.
    expect(a.skin?.['backgroundcolor']).toBeUndefined();
    // Stereotype-scoped overrides carry the same group prefix.
    expect(a.skin?.['usecase.backgroundcolor<<main>>']).toBe('YellowGreen');
    expect(a.skin?.['usecase.bordercolor<<main>>']).toBe('YellowGreen');
    expect(a.skin?.['usecase.actorbackgroundcolor<<human>>']).toBe('Gold');
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

    // Bug-fix regression: the `note right of (Use)` block must preserve the
    // line break between body rows as a literal `\n`, not collapse them into
    // a single space-joined string. The layout renderer splits on `\n` to
    // emit one text shape per line, so flattening here would silently drop
    // a row from the rendered note.
    const useNote = notes.find((n) => n.anchorId === 'Use')!;
    expect(useNote.text).toBe('A note can also\nbe on several lines');
    expect(useNote.text!.split('\n')).toHaveLength(2);

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

  it('keeps pre-declared actors out of a container they are merely referenced in', () => {
    // Regression: `customer` and `clerk` are declared BEFORE
    // `rectangle checkout { ... }`. Inside the block they only appear as
    // relationship endpoints (`customer -- (checkout)` / `(checkout) -- clerk`).
    // The container's `childIds` must therefore include only the use cases
    // declared/auto-promoted inside the braces (`checkout`, `payment`, `help`)
    // — adding `customer` / `clerk` would make the layout treat them as
    // members of the boundary box and render them inside the rectangle.
    const a = ast([
      '@startuml',
      'left to right direction',
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

    expect(a.containers).toHaveLength(1);
    const checkout = a.containers[0]!;
    // Members are ONLY use cases declared / auto-promoted inside the block.
    expect(checkout.childIds).toEqual(['checkout', 'payment', 'help']);
    expect(checkout.childIds).not.toContain('customer');
    expect(checkout.childIds).not.toContain('clerk');
    // Both actors still exist as global nodes; they're just not members.
    const actorIds = a.nodes.filter((n) => n.kind === 'actor').map((n) => n.id);
    expect(actorIds).toEqual(['customer', 'clerk']);
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

  it('expands `\\n` to a real newline in :Display: actor names (with or without `/`)', () => {
    // Bug fix: `:Another\nactor:/ as Man2` and the non-business equivalent
    // must both expose `name` as a string containing a real `\n`, so layout
    // can split the label across rows.
    const business = ast('@startuml\n:Another\\nactor:/ as Man2\n@enduml');
    const m2 = business.nodes.find((n) => n.id === 'Man2');
    expect(m2?.name).toBe('Another\nactor');
    expect(m2?.name.includes('\n')).toBe(true);

    const plain = ast('@startuml\n:Another\\nactor: as Man2\n@enduml');
    const p2 = plain.nodes.find((n) => n.id === 'Man2');
    expect(p2?.name).toBe('Another\nactor');
    expect(p2?.name.includes('\n')).toBe(true);
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

  it('parses inline `#<styleBlock>` between target and label (regression: arrows with style suffix were silently dropped)', () => {
    // The bug: a relationship line whose target was followed by `#…` (the
    // PlantUML inline style block) would fail the relationship regex because
    // the `:` inside `line:red` was mistakenly treated as the label separator,
    // leaving an unparseable `(bar1) #line` tail. Without the fix, only the
    // first arrow (no style block) survives and bar1/bar2/bar3 vanish.
    const a = ast([
      '@startuml',
      'actor foo',
      'foo --> (bar) : normal',
      'foo --> (bar1) #line:red;line.bold;text:red : red bold',
      'foo --> (bar2) #green;line.dashed;text:green : green dashed',
      'foo --> (bar3) #blue;line.dotted;text:blue : blue dotted',
      '@enduml',
    ].join('\n'));

    // All four relationships present (the bug dropped the last three).
    expect(a.relationships).toHaveLength(4);
    const targets = a.relationships.map((r) => r.target);
    expect(targets).toEqual(['bar', 'bar1', 'bar2', 'bar3']);

    // The unadorned arrow carries no style overrides.
    expect(a.relationships[0]).toMatchObject({ target: 'bar', label: 'normal' });
    expect(a.relationships[0]!.lineColor).toBeUndefined();
    expect(a.relationships[0]!.lineStyle).toBeUndefined();
    expect(a.relationships[0]!.textColor).toBeUndefined();

    // `#line:red;line.bold;text:red` → red bold stroke, red label.
    expect(a.relationships[1]).toMatchObject({
      target: 'bar1',
      label: 'red bold',
      lineColor: 'red',
      lineStyle: 'bold',
      textColor: 'red',
    });

    // `#green;line.dashed;text:green` → bare `green` is shorthand for line
    // colour, plus `line.dashed` and `text:green`.
    expect(a.relationships[2]).toMatchObject({
      target: 'bar2',
      label: 'green dashed',
      lineColor: 'green',
      lineStyle: 'dashed',
      textColor: 'green',
    });

    // `#blue;line.dotted;text:blue` → blue dotted stroke, blue label.
    expect(a.relationships[3]).toMatchObject({
      target: 'bar3',
      label: 'blue dotted',
      lineColor: 'blue',
      lineStyle: 'dotted',
      textColor: 'blue',
    });

    // Targets disambiguated by `(…)` are declared as usecases.
    const bar1 = a.nodes.find((n) => n.id === 'bar1');
    expect(bar1?.kind).toBe('usecase');
  });

  it('accepts `allowmixing` and parses an embedded `json NAME { ... }` block', () => {
    const a = ast([
      '@startuml',
      'allowmixing',
      'actor Actor',
      'usecase Usecase',
      'json JSON {',
      '  "fruit":"Apple",',
      '  "size":"Large",',
      '  "color": ["Red", "Green"]',
      '}',
      '@enduml',
    ].join('\n'));

    // The actor and usecase still parse normally — the `allowmixing` line
    // is silently skipped, not pushed into `nodes` as a stray identifier.
    expect(a.nodes).toEqual([
      { id: 'Actor', name: 'Actor', kind: 'actor' },
      { id: 'Usecase', name: 'Usecase', kind: 'usecase' },
    ]);

    // The `json JSON { ... }` block is captured separately and the body is
    // parsed via `JSON.parse` (shared with the standalone JSON diagram path).
    expect(a.jsonNodes).toHaveLength(1);
    expect(a.jsonNodes![0]).toEqual({
      id: 'JSON',
      data: { fruit: 'Apple', size: 'Large', color: ['Red', 'Green'] },
    });
  });
});
