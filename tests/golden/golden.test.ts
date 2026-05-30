import { describe, it } from 'vitest';
import { expectGolden } from './runner.js';

describe('golden — placeholder/unknown', () => {
  it('renders unknown when wrapper is missing', () => {
    expectGolden('phase0/no-wrapper', 'just text');
  });
});

describe('golden — sequence', () => {
  it('renders a hello-world message', () => {
    expectGolden(
      'sequence/hello',
      '@startuml\nAlice -> Bob: hello\nBob --> Alice: hi back\n@enduml',
    );
  });

  it('renders with multiple participants and activations', () => {
    expectGolden(
      'sequence/activations',
      [
        '@startuml',
        'participant Client',
        'participant Server',
        'Client -> Server: request',
        'activate Server',
        'Server --> Client: response',
        'deactivate Server',
        '@enduml',
      ].join('\n'),
    );
  });

  it('renders notes (left/right/over)', () => {
    expectGolden(
      'sequence/notes',
      [
        '@startuml',
        'participant A',
        'participant B',
        'note left of A : memo on left',
        'A -> B: hi',
        'note right of B : memo on right',
        'note over A, B : shared memo',
        '@enduml',
      ].join('\n'),
    );
  });

  it('renders groups (alt/else)', () => {
    expectGolden(
      'sequence/groups',
      [
        '@startuml',
        'A -> B: req',
        'alt success',
        '  B --> A: ok',
        'else failure',
        '  B --> A: err',
        'end',
        '@enduml',
      ].join('\n'),
    );
  });

  it('renders autonumber prefixes', () => {
    expectGolden(
      'sequence/autonumber',
      '@startuml\nautonumber\nA -> B: first\nB -> A: second\n@enduml',
    );
  });

  it('renders self-message', () => {
    expectGolden(
      'sequence/self-message',
      '@startuml\nA -> A: recurse\n@enduml',
    );
  });

  it('renders all participant shapes', () => {
    expectGolden(
      'sequence/shapes',
      [
        '@startuml',
        'participant P',
        'actor A',
        'boundary B',
        'control C',
        'entity E',
        'database D',
        'queue Q',
        'collections X',
        '@enduml',
      ].join('\n'),
    );
  });

  it('renders a title above the diagram', () => {
    expectGolden(
      'sequence/title',
      '@startuml\ntitle Login flow\nA -> B: hi\n@enduml',
    );
  });

  it('renders a divider', () => {
    expectGolden(
      'sequence/divider',
      '@startuml\nA -> B: first\n== checkpoint ==\nA -> B: second\n@enduml',
    );
  });

  it('renders group span limited to involved participants', () => {
    expectGolden(
      'sequence/group-partial-span',
      [
        '@startuml',
        'participant A',
        'participant B',
        'participant C',
        'participant D',
        'group only B-C',
        '  B -> C: ping',
        'end',
        '@enduml',
      ].join('\n'),
    );
  });

  it('widens lanes to fit a long message', () => {
    expectGolden(
      'sequence/auto-fit',
      '@startuml\nA -> B: this is a fairly long message that should widen the lane\n@enduml',
    );
  });
});

describe('golden — class', () => {
  it('renders a basic class with fields and methods', () => {
    expectGolden(
      'class/basic',
      [
        '@startuml',
        'class User {',
        '  +id: int',
        '  -name: String',
        '  +login(password: String): bool',
        '  +logout()',
        '}',
        '@enduml',
      ].join('\n'),
    );
  });

  it('renders interface with stereotype line', () => {
    expectGolden(
      'class/interface',
      [
        '@startuml',
        'interface Comparable {',
        '  +compareTo(o: Object): int',
        '}',
        '@enduml',
      ].join('\n'),
    );
  });

  it('renders an enum', () => {
    expectGolden(
      'class/enum',
      [
        '@startuml',
        'enum Status {',
        '  ACTIVE',
        '  INACTIVE',
        '  PENDING',
        '}',
        '@enduml',
      ].join('\n'),
    );
  });

  it('renders abstract class with italic name', () => {
    expectGolden(
      'class/abstract',
      '@startuml\nabstract class Shape {\n  {abstract} +area(): double\n}\n@enduml',
    );
  });

  it('renders multiple classes in a grid', () => {
    expectGolden(
      'class/grid',
      [
        '@startuml',
        'title Domain Model',
        'class User { +id: int }',
        'class Order { +total: double }',
        'class Product { +name: String }',
        'interface Payable',
        '@enduml',
      ].join('\n'),
    );
  });

  it('renders class with stereotype', () => {
    expectGolden(
      'class/stereotype',
      '@startuml\nclass UserService <<Service>> {\n  +findUser(id: int): User\n}\n@enduml',
    );
  });

  it('renders inheritance layered with parent on top', () => {
    expectGolden(
      'class/inheritance',
      [
        '@startuml',
        'class Animal',
        'class Dog',
        'class Cat',
        'Animal <|-- Dog',
        'Animal <|-- Cat',
        '@enduml',
      ].join('\n'),
    );
  });

  it('renders mixed relationship types', () => {
    expectGolden(
      'class/relations-mixed',
      [
        '@startuml',
        'interface Storage',
        'class FileStore',
        'class MemoryStore',
        'class Service',
        'Storage <|.. FileStore',
        'Storage <|.. MemoryStore',
        'Service ..> Storage : uses',
        '@enduml',
      ].join('\n'),
    );
  });

  it('renders composition and aggregation with multiplicities', () => {
    expectGolden(
      'class/composition',
      [
        '@startuml',
        'class Order',
        'class LineItem',
        'class Customer',
        'Order "1" *-- "*" LineItem : contains',
        'Customer "1" o-- "*" Order : places',
        '@enduml',
      ].join('\n'),
    );
  });

  it('routes long edges through dummy waypoints', () => {
    expectGolden(
      'class/long-edge',
      [
        '@startuml',
        'class A',
        'class B',
        'class C',
        'class D',
        'A --> B',
        'B --> C',
        'C --> D',
        'A --> D',
        '@enduml',
      ].join('\n'),
    );
  });

  it('reorders layers to reduce crossings', () => {
    expectGolden(
      'class/crossings',
      [
        '@startuml',
        'class A1',
        'class A2',
        'class B1',
        'class B2',
        'A1 --> B2',
        'A2 --> B1',
        '@enduml',
      ].join('\n'),
    );
  });

  it('renders all six marker types (one diagram)', () => {
    expectGolden(
      'class/all-markers',
      [
        '@startuml',
        'class P',
        'class C',
        'interface I',
        'class R',
        'class W',
        'class Pt',
        'class G',
        'class M',
        'class S',
        'class T',
        'class D',
        'class Dep',
        'P <|-- C',
        'I <|.. R',
        'W *-- Pt',
        'G o-- M',
        'S --> T',
        'D ..> Dep',
        '@enduml',
      ].join('\n'),
    );
  });

  it('renders a self-loop on a class', () => {
    expectGolden(
      'class/self-loop',
      [
        '@startuml',
        'class Node {',
        '  +value: int',
        '}',
        'Node --> Node : next',
        '@enduml',
      ].join('\n'),
    );
  });
});

describe('golden — use case', () => {
  it('renders a basic use case diagram', () => {
    expectGolden(
      'usecase/basic',
      [
        '@startuml',
        'actor User',
        'usecase Login',
        'usecase Logout',
        'User --> Login',
        'User --> Logout',
        '@enduml',
      ].join('\n'),
    );
  });

  it('renders shorthand syntax + include stereotype', () => {
    expectGolden(
      'usecase/include',
      [
        '@startuml',
        ':User: --> (Login)',
        '(Login) ..> (Authenticate) : <<include>>',
        '@enduml',
      ].join('\n'),
    );
  });
});

describe('golden — component', () => {
  it('renders components and interface', () => {
    expectGolden(
      'component/basic',
      [
        '@startuml',
        'component Frontend',
        'component Backend',
        'interface API',
        'Frontend --> API',
        'API --> Backend',
        '@enduml',
      ].join('\n'),
    );
  });
});

describe('golden — deployment', () => {
  it('renders all deployment node kinds', () => {
    expectGolden(
      'deployment/all-kinds',
      [
        '@startuml',
        'node Server',
        'cloud Internet',
        'database DB',
        'folder Logs',
        'frame UI',
        'rectangle R',
        'Server --> DB',
        'Internet --> Server',
        '@enduml',
      ].join('\n'),
    );
  });
});

describe('golden — object', () => {
  it('renders objects with attributes', () => {
    expectGolden(
      'object/basic',
      [
        '@startuml',
        'object alice',
        'alice : name = "Alice"',
        'alice : age = 30',
        'object bob',
        'bob : name = "Bob"',
        'alice --> bob : friend',
        '@enduml',
      ].join('\n'),
    );
  });
});

describe('golden — json', () => {
  it('renders a nested JSON tree with a highlight', () => {
    expectGolden(
      'json/basic',
      [
        '@startjson',
        '#highlight "user" / "name"',
        '{',
        '  "user": {',
        '    "name": "Alice",',
        '    "age": 30',
        '  },',
        '  "tags": ["admin", "dev"]',
        '}',
        '@endjson',
      ].join('\n'),
    );
  });
});

describe('golden — gantt', () => {
  it('renders a simple gantt with closed weekends', () => {
    expectGolden(
      'gantt/basic',
      [
        '@startgantt',
        'title Sprint plan',
        'Project starts 2026-05-25',
        'saturday are closed',
        'sunday are closed',
        '[Design] lasts 3 days',
        '[Implementation] lasts 5 days and starts at [Design]\'s end',
        '[QA] lasts 2 days and starts at [Implementation]\'s end',
        '[Release] happens at [QA]\'s end',
        '[Implementation] is colored in LightBlue',
        '[QA] is colored in Salmon',
        '@endgantt',
      ].join('\n'),
    );
  });
});

describe('golden — mindmap', () => {
  it('renders a mindmap with 3 levels', () => {
    expectGolden(
      'mindmap/basic',
      [
        '@startmindmap',
        'title Roadmap',
        '* Project',
        '** Q1',
        '*** Plan',
        '*** Hire',
        '** Q2',
        '*** Build',
        '*** Ship',
        '@endmindmap',
      ].join('\n'),
    );
  });
});

describe('golden — wbs', () => {
  it('renders a WBS hierarchy', () => {
    expectGolden(
      'wbs/basic',
      [
        '@startwbs',
        '* Release v1.0',
        '** Backend',
        '*** API',
        '*** DB',
        '** Frontend',
        '*** Pages',
        '*** Components',
        '** QA',
        '@endwbs',
      ].join('\n'),
    );
  });
});

describe('golden — activity', () => {
  it('renders linear actions with start/stop', () => {
    expectGolden(
      'activity/linear',
      [
        '@startuml',
        'start',
        ':Read input;',
        ':Process;',
        ':Write output;',
        'stop',
        '@enduml',
      ].join('\n'),
    );
  });

  it('renders if/else branching', () => {
    expectGolden(
      'activity/if-else',
      [
        '@startuml',
        'start',
        'if (valid?) then (yes)',
        '  :Save;',
        'else (no)',
        '  :Reject;',
        'endif',
        'stop',
        '@enduml',
      ].join('\n'),
    );
  });

  it('renders while loop', () => {
    expectGolden(
      'activity/while',
      [
        '@startuml',
        'start',
        'while (more items?) is (yes)',
        '  :Process item;',
        'endwhile (no)',
        'stop',
        '@enduml',
      ].join('\n'),
    );
  });

  it('renders repeat loop', () => {
    expectGolden(
      'activity/repeat',
      [
        '@startuml',
        'start',
        'repeat',
        '  :Try operation;',
        'repeat while (retry?)',
        'stop',
        '@enduml',
      ].join('\n'),
    );
  });

  it('renders fork with merge', () => {
    expectGolden(
      'activity/fork',
      [
        '@startuml',
        'start',
        'fork',
        '  :Fetch user;',
        'fork again',
        '  :Fetch orders;',
        'fork again',
        '  :Fetch settings;',
        'end merge',
        ':Combine;',
        'stop',
        '@enduml',
      ].join('\n'),
    );
  });

  it('renders partition wrapping inner actions', () => {
    expectGolden(
      'activity/partition',
      [
        '@startuml',
        'start',
        'partition "Setup" {',
        '  :Initialize;',
        '  :Configure;',
        '}',
        'partition "Run" {',
        '  :Execute;',
        '}',
        'stop',
        '@enduml',
      ].join('\n'),
    );
  });

  it('omits merge arrow when branch terminates with detach/kill', () => {
    expectGolden(
      'activity/terminating-branch',
      [
        '@startuml',
        'start',
        'if (duplicate?) then (yes)',
        '  :Attach;',
        '  detach',
        'else (no)',
        '  :Create;',
        'endif',
        ':Continue;',
        'stop',
        '@enduml',
      ].join('\n'),
    );
  });
});

describe('golden — state', () => {
  it('renders initial → state → final', () => {
    expectGolden(
      'state/basic',
      [
        '@startuml',
        '[*] --> Active',
        'Active --> Inactive : disable',
        'Inactive --> Active : enable',
        'Active --> [*]',
        '@enduml',
      ].join('\n'),
    );
  });

  it('renders choice/fork/join states', () => {
    expectGolden(
      'state/pseudo-states',
      [
        '@startuml',
        '[*] --> Start',
        'state C <<choice>>',
        'state F <<fork>>',
        'state J <<join>>',
        'Start --> C',
        'C --> Done : success',
        'C --> Failed : error',
        'F --> A',
        'F --> B',
        'A --> J',
        'B --> J',
        '@enduml',
      ].join('\n'),
    );
  });
});
