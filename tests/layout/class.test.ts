import { describe, it, expect } from 'vitest';
import { compile } from '../../src/index.js';

describe('class layout', () => {
  it('renders a box per class', () => {
    const scene = compile('@startuml\nclass A\nclass B\nclass C\n@enduml');
    const rects = scene.children.filter((s) => s.type === 'rect');
    expect(rects.length).toBeGreaterThanOrEqual(3);
  });

  it('produces a wider box for long member text', () => {
    const small = compile('@startuml\nclass A\n@enduml');
    const big = compile('@startuml\nclass A {\n  +superLongFieldNameThatShouldWiden: string\n}\n@enduml');
    expect(big.width).toBeGreaterThan(small.width);
  });

  it('renders the title above the diagram', () => {
    const scene = compile('@startuml\ntitle Schema\nclass A\n@enduml');
    const texts = scene.children.filter((s) => s.type === 'text').map((s) => (s as { text: string }).text);
    expect(texts).toContain('Schema');
  });

  it('shows «interface» stereotype line for interfaces', () => {
    const scene = compile('@startuml\ninterface I\n@enduml');
    const texts = scene.children.filter((s) => s.type === 'text').map((s) => (s as { text: string }).text);
    expect(texts).toContain('«interface»');
  });

  it('handles empty class diagram gracefully', () => {
    const scene = compile('@startuml\n@enduml');
    expect(scene.width).toBeGreaterThan(0);
  });
});
