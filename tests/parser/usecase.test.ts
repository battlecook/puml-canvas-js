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
});
