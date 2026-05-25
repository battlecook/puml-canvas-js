import { describe, it, expect } from 'vitest';
import { parseActivity } from '../../src/parser/activity/index.js';

function ast(src: string) {
  return parseActivity(src);
}

describe('activity parser — linear', () => {
  it('parses start / actions / stop', () => {
    const a = ast('@startuml\nstart\n:Hello;\n:World;\nstop\n@enduml');
    expect(a.body.map((n) => n.type)).toEqual(['start', 'action', 'action', 'stop']);
  });

  it('captures action text', () => {
    const a = ast('@startuml\n:Do something with spaces;\n@enduml');
    expect(a.body[0]).toMatchObject({ type: 'action', text: 'Do something with spaces' });
  });

  it('captures title', () => {
    const a = ast('@startuml\ntitle Flow\n:A;\n@enduml');
    expect(a.title).toBe('Flow');
  });

  it('treats `- text` lines as action steps (compat-viewer extension)', () => {
    const a = ast(
      [
        '@startuml',
        '- Action 1',
        '- Action 2',
        '- Action 3',
        '@enduml',
      ].join('\n'),
    );
    expect(a.body).toEqual([
      { type: 'action', text: 'Action 1' },
      { type: 'action', text: 'Action 2' },
      { type: 'action', text: 'Action 3' },
    ]);
  });

  it('allows mixing `- text` with `:text;` action steps', () => {
    const a = ast('@startuml\n- First\n:Second;\n- Third\n@enduml');
    expect(a.body.map((n) => (n.type === 'action' ? n.text : n.type))).toEqual([
      'First', 'Second', 'Third',
    ]);
  });
});

describe('activity parser — if/elseif/else', () => {
  it('parses simple if/else/endif', () => {
    const a = ast([
      '@startuml',
      'if (cond?) then (yes)',
      '  :A;',
      'else (no)',
      '  :B;',
      'endif',
      '@enduml',
    ].join('\n'));
    expect(a.body).toHaveLength(1);
    const n = a.body[0]!;
    expect(n.type).toBe('if');
    if (n.type === 'if') {
      expect(n.condition).toBe('cond?');
      expect(n.branches[0]?.label).toBe('yes');
      expect(n.branches[0]?.body).toHaveLength(1);
      expect(n.elseBranch?.label).toBe('no');
      expect(n.elseBranch?.body).toHaveLength(1);
    }
  });

  it('parses elseif chain', () => {
    const a = ast([
      '@startuml',
      'if (a?) then (yes)',
      '  :X;',
      'elseif (b?) then (yes)',
      '  :Y;',
      'else (no)',
      '  :Z;',
      'endif',
      '@enduml',
    ].join('\n'));
    const n = a.body[0]!;
    expect(n.type).toBe('if');
    if (n.type === 'if') {
      expect(n.branches).toHaveLength(2);
      expect(n.elseBranch).not.toBeNull();
    }
  });
});

describe('activity parser — loops', () => {
  it('parses while/endwhile', () => {
    const a = ast([
      '@startuml',
      'while (more?) is (yes)',
      '  :work;',
      'endwhile (no)',
      '@enduml',
    ].join('\n'));
    const n = a.body[0]!;
    expect(n.type).toBe('while');
    if (n.type === 'while') {
      expect(n.condition).toBe('more?');
      expect(n.yesLabel).toBe('yes');
      expect(n.noLabel).toBe('no');
      expect(n.body).toHaveLength(1);
    }
  });

  it('parses repeat / repeat while', () => {
    const a = ast([
      '@startuml',
      'repeat',
      '  :work;',
      'repeat while (continue?) is (yes) not (no)',
      '@enduml',
    ].join('\n'));
    const n = a.body[0]!;
    expect(n.type).toBe('repeat');
    if (n.type === 'repeat') {
      expect(n.body).toHaveLength(1);
      expect(n.condition).toBe('continue?');
      expect(n.yesLabel).toBe('yes');
      expect(n.noLabel).toBe('no');
    }
  });
});

describe('activity parser — fork', () => {
  it('parses fork/fork again/end fork', () => {
    const a = ast([
      '@startuml',
      'fork',
      '  :A;',
      'fork again',
      '  :B;',
      'fork again',
      '  :C;',
      'end fork',
      '@enduml',
    ].join('\n'));
    const n = a.body[0]!;
    expect(n.type).toBe('fork');
    if (n.type === 'fork') {
      expect(n.branches).toHaveLength(3);
      expect(n.merge).toBe(false);
    }
  });

  it('parses end merge as merging fork', () => {
    const a = ast([
      '@startuml',
      'fork',
      '  :A;',
      'fork again',
      '  :B;',
      'end merge',
      '@enduml',
    ].join('\n'));
    const n = a.body[0]!;
    if (n.type === 'fork') expect(n.merge).toBe(true);
  });
});

describe('activity parser — partition / break / kill', () => {
  it('parses partition with body', () => {
    const a = ast([
      '@startuml',
      'partition "Setup" {',
      '  :Initialize;',
      '  :Configure;',
      '}',
      '@enduml',
    ].join('\n'));
    const n = a.body[0]!;
    expect(n.type).toBe('partition');
    if (n.type === 'partition') {
      expect(n.name).toBe('Setup');
      expect(n.body).toHaveLength(2);
    }
  });

  it('parses kill and break', () => {
    const a = ast([
      '@startuml',
      'if (a?) then (yes)',
      '  kill',
      'else (no)',
      '  break',
      'endif',
      '@enduml',
    ].join('\n'));
    const n = a.body[0]!;
    expect(n.type).toBe('if');
    if (n.type === 'if') {
      expect(n.branches[0]?.body[0]?.type).toBe('kill');
      expect(n.elseBranch?.body[0]?.type).toBe('break');
    }
  });

  it('partition closes on } and works inside fork', () => {
    const a = ast([
      '@startuml',
      'fork',
      '  partition "A" {',
      '    :a1;',
      '  }',
      'fork again',
      '  partition "B" {',
      '    :b1;',
      '  }',
      'end fork',
      '@enduml',
    ].join('\n'));
    const fork = a.body[0]!;
    expect(fork.type).toBe('fork');
    if (fork.type === 'fork') {
      expect(fork.branches).toHaveLength(2);
      const first = fork.branches[0]![0]!;
      expect(first.type).toBe('partition');
    }
  });
});
