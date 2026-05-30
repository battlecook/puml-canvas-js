import { describe, it, expect } from 'vitest';
import { parseNwdiag } from '../../src/parser/nwdiag/index.js';

describe('nwdiag parser', () => {
  it('parses the minimal demo input (outer wrapper + empty network with address)', () => {
    const src = [
      '@startnwdiag',
      'nwdiag {',
      'network dmz {',
      'address = "210.x.x.x/24"',
      '}',
      '}',
      '@endnwdiag',
    ].join('\n');
    const ast = parseNwdiag(src);
    expect(ast.kind).toBe('nwdiag');
    expect(ast.networks).toHaveLength(1);
    expect(ast.networks[0]).toMatchObject({
      id: 'dmz',
      name: 'dmz',
      address: '210.x.x.x/24',
      nodes: [],
    });
  });

  it('parses a network without the outer nwdiag { wrapper', () => {
    const src = [
      '@startnwdiag',
      'network internal {',
      'address = "10.0.0.0/24"',
      'web01',
      'db01',
      '}',
      '@endnwdiag',
    ].join('\n');
    const ast = parseNwdiag(src);
    expect(ast.networks).toHaveLength(1);
    const net = ast.networks[0]!;
    expect(net.id).toBe('internal');
    expect(net.address).toBe('10.0.0.0/24');
    expect(net.nodes.map((n) => n.id)).toEqual(['web01', 'db01']);
  });

  it('parses top-level node with shape, link, and anonymous network with members', () => {
    const src = [
      '@startnwdiag',
      'nwdiag {',
      'inet [shape = cloud];',
      'inet -- router;',
      'network {',
      'router;',
      'web01;',
      'web02;',
      '}',
      '}',
      '@endnwdiag',
    ].join('\n');
    const ast = parseNwdiag(src);
    // Top-level node.
    expect(ast.nodes).toBeDefined();
    expect(ast.nodes).toHaveLength(1);
    expect(ast.nodes![0]).toMatchObject({ id: 'inet', shape: 'cloud' });
    // Link.
    expect(ast.links).toBeDefined();
    expect(ast.links).toHaveLength(1);
    expect(ast.links![0]).toEqual({ from: 'inet', to: 'router' });
    // Anonymous network with 3 members.
    expect(ast.networks).toHaveLength(1);
    const net = ast.networks[0]!;
    expect(net.name).toBe('');
    expect(net.nodes.map((n) => n.id)).toEqual(['router', 'web01', 'web02']);
  });

  it('parses multiple networks', () => {
    const src = [
      '@startnwdiag',
      'nwdiag {',
      'network dmz {',
      'address = "1.0.0.0/24"',
      '}',
      'network lan {',
      'address = "2.0.0.0/24"',
      '}',
      '}',
      '@endnwdiag',
    ].join('\n');
    const ast = parseNwdiag(src);
    expect(ast.networks).toHaveLength(2);
    expect(ast.networks.map((n) => n.id)).toEqual(['dmz', 'lan']);
  });
});
