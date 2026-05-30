import { describe, it, expect } from 'vitest';
import { parseClass } from '../../src/parser/class/index.js';

describe('class parser — set separator + namespaced classes', () => {
  it('parses `set separator ::` and splits class names into nested packages', () => {
    const ast = parseClass(
      [
        '@startuml',
        'set separator ::',
        'class X1::X2::foo {',
        '  some info',
        '}',
        '@enduml',
      ].join('\n'),
    );
    expect(ast.separator).toBe('::');
    // Two nested packages: outer X1, inner X2 (parented by X1).
    expect(ast.packages).toHaveLength(2);
    const outer = ast.packages[0]!;
    const inner = ast.packages[1]!;
    expect(outer.name).toBe('X1');
    expect(outer.parentId).toBeUndefined();
    expect(inner).toMatchObject({ name: 'X2', parentId: outer.id });
    expect(inner.classIds).toEqual(['X1::X2::foo']);
    // One class — name is the leaf segment (`foo`), id keeps the full
    // namespaced text so any later relationship can target it verbatim.
    expect(ast.classes).toHaveLength(1);
    const cls = ast.classes[0]!;
    expect(cls).toMatchObject({ id: 'X1::X2::foo', name: 'foo', packageId: inner.id });
  });

  it('parses body members on a namespaced class', () => {
    const ast = parseClass(
      [
        '@startuml',
        'set separator ::',
        'class X1::X2::foo {',
        '  +info: String',
        '}',
        '@enduml',
      ].join('\n'),
    );
    const cls = ast.classes[0]!;
    expect(cls.members).toHaveLength(1);
    expect(cls.members[0]).toMatchObject({ name: 'info', type: 'String', visibility: 'public' });
  });

  it('treats `.` as the default separator when no `set separator` directive ran', () => {
    const ast = parseClass('@startuml\nclass pkg.sub.Foo\n@enduml');
    expect(ast.packages.map((p) => p.name)).toEqual(['pkg', 'sub']);
    expect(ast.classes[0]!.name).toBe('Foo');
    expect(ast.classes[0]!.id).toBe('pkg.sub.Foo');
    expect(ast.classes[0]!.packageId).toBeDefined();
  });

  it('reuses an existing package when multiple classes share a prefix', () => {
    const ast = parseClass(
      [
        '@startuml',
        'set separator ::',
        'class pkg::A',
        'class pkg::B',
        '@enduml',
      ].join('\n'),
    );
    // Only one `pkg` package — both classes live inside it.
    expect(ast.packages).toHaveLength(1);
    expect(ast.packages[0]!.name).toBe('pkg');
    expect(ast.packages[0]!.classIds).toEqual(['pkg::A', 'pkg::B']);
    expect(ast.classes.map((c) => c.name)).toEqual(['A', 'B']);
  });

  it('`set separator none` disables auto packaging', () => {
    const ast = parseClass(
      [
        '@startuml',
        'set separator none',
        'class pkg.Foo',
        '@enduml',
      ].join('\n'),
    );
    expect(ast.separator).toBeNull();
    expect(ast.packages).toHaveLength(0);
    expect(ast.classes[0]!.id).toBe('pkg.Foo');
    expect(ast.classes[0]!.packageId).toBeUndefined();
  });

  it('does not split quoted names even when they contain the separator', () => {
    // Quoting opts out of namespace splitting so users can pick literal dotted
    // names without triggering auto packages.
    const ast = parseClass('@startuml\nclass "pkg.Foo"\n@enduml');
    expect(ast.packages).toHaveLength(0);
    expect(ast.classes[0]!.name).toBe('pkg.Foo');
    expect(ast.classes[0]!.packageId).toBeUndefined();
  });
});
