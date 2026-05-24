import { describe, it, expect } from 'vitest';
import { compile } from '../../src/index.js';

describe('sequence layout', () => {
  it('produces a scene wider than the sum of participant widths', () => {
    const scene = compile('@startuml\nparticipant Alice\nparticipant Bob\nparticipant Charlie\n@enduml');
    expect(scene.width).toBeGreaterThan(300);
    expect(scene.children.length).toBeGreaterThan(0);
  });

  it('renders header (top and bottom) for each participant', () => {
    const scene = compile('@startuml\nparticipant A\nparticipant B\n@enduml');
    const rects = scene.children.filter((s) => s.type === 'rect');
    // 2 participants × 2 headers = 4 rects (plus maybe background)
    expect(rects.length).toBeGreaterThanOrEqual(4);
  });

  it('adds a message line and arrow head per message', () => {
    const scene = compile('@startuml\nA -> B: hi\n@enduml');
    const polys = scene.children.filter((s) => s.type === 'polygon');
    expect(polys.length).toBeGreaterThanOrEqual(1);
  });

  it('emits autonumber prefix on message text', () => {
    const scene = compile('@startuml\nautonumber\nA -> B: hi\nA -> B: hello\n@enduml');
    const texts = scene.children.filter((s) => s.type === 'text').map((s) => (s as { text: string }).text);
    expect(texts).toContain('1 hi');
    expect(texts).toContain('2 hello');
  });

  it('handles empty sequence gracefully', () => {
    const scene = compile('@startuml\n@enduml');
    expect(scene.width).toBeGreaterThan(0);
    expect(scene.height).toBeGreaterThan(0);
  });
});
