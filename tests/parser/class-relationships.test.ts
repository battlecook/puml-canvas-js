import { describe, it, expect } from 'vitest';
import { parseClass } from '../../src/parser/class/index.js';
import { parseRelationship } from '../../src/parser/class/relationships.js';

describe('class relationships — parser', () => {
  it('parses inheritance both directions', () => {
    const r1 = parseRelationship('Parent <|-- Child');
    const r2 = parseRelationship('Child --|> Parent');
    expect(r1).toMatchObject({ source: 'Parent', target: 'Child', kind: 'inheritance', style: 'solid', sourceMarker: 'triangle', targetMarker: 'none' });
    expect(r2).toMatchObject({ source: 'Child', target: 'Parent', kind: 'inheritance', sourceMarker: 'none', targetMarker: 'triangle' });
  });

  it('parses realization (dashed triangle)', () => {
    const r = parseRelationship('I <|.. A');
    expect(r).toMatchObject({ kind: 'realization', style: 'dashed', sourceMarker: 'triangle' });
  });

  it('parses composition (filled diamond)', () => {
    const r = parseRelationship('A *-- B');
    expect(r).toMatchObject({ kind: 'composition', sourceMarker: 'diamond-filled' });
  });

  it('parses aggregation (open diamond)', () => {
    const r = parseRelationship('A o-- B');
    expect(r).toMatchObject({ kind: 'aggregation', sourceMarker: 'diamond-open' });
  });

  it('parses directed association', () => {
    const fwd = parseRelationship('A --> B');
    const back = parseRelationship('A <-- B');
    expect(fwd).toMatchObject({ kind: 'association', targetMarker: 'arrow' });
    expect(back).toMatchObject({ kind: 'association', sourceMarker: 'arrow' });
  });

  it('parses dependency (dashed)', () => {
    const r = parseRelationship('A ..> B');
    expect(r).toMatchObject({ kind: 'dependency', style: 'dashed', targetMarker: 'arrow' });
  });

  it('parses undirected association/dependency', () => {
    const a = parseRelationship('A -- B');
    const d = parseRelationship('A .. B');
    expect(a).toMatchObject({ kind: 'association', sourceMarker: 'none', targetMarker: 'none' });
    expect(d).toMatchObject({ kind: 'dependency', style: 'dashed' });
  });

  it('captures multiplicities and labels', () => {
    const r = parseRelationship('A "1" *-- "many" B : owns');
    expect(r).toMatchObject({
      source: 'A',
      target: 'B',
      sourceMult: '1',
      targetMult: 'many',
      label: 'owns',
      kind: 'composition',
    });
  });

  it('parses quoted class names', () => {
    const r = parseRelationship('"Long Name" --> "Another One"');
    expect(r).toMatchObject({ source: 'Long Name', target: 'Another One' });
  });

  it('integrates with class parser and creates implicit classes', () => {
    const ast = parseClass('@startuml\nA --> B\nC --> A\n@enduml');
    expect(ast.classes.map((c) => c.id).sort()).toEqual(['A', 'B', 'C']);
    expect(ast.relationships).toHaveLength(2);
  });

  it('keeps declared classes alongside implicit', () => {
    const src = [
      '@startuml',
      'class A {',
      '  +x: int',
      '}',
      'A --> B',
      '@enduml',
    ].join('\n');
    const ast = parseClass(src);
    expect(ast.classes[0]?.members).toHaveLength(1);
    expect(ast.classes[1]?.id).toBe('B');
  });
});
