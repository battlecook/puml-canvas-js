import { describe, it, expect } from 'vitest';
import { compile, parseToAst } from '../../src/index.js';
import type { ContainerNode } from '../../src/index.js';

function flatten(nodes: ContainerNode[]): ContainerNode[] {
  const out: ContainerNode[] = [];
  const walk = (n: ContainerNode) => {
    out.push(n);
    for (const c of n.children) walk(c);
  };
  for (const n of nodes) walk(n);
  return out;
}

const CHECKOUT = `@startuml
title Checkout Components
package "Frontend" {
  [Cart UI]
  [Checkout UI]
}
package "Backend" {
  [Order Service]
  [Payment Adapter]
  [Inventory Service]
}
cloud "Payment Gateway" as PG
database "Orders DB" as ODB

[Cart UI] --> [Checkout UI]
[Order Service] --> [Inventory Service]
[Order Service] --> [Payment Adapter]
[Payment Adapter] --> PG
[Order Service] --> ODB
@enduml`;

describe('checkout components (user repro)', () => {
  it('parses all 7 nodes with correct kinds (across nesting)', () => {
    const ast = parseToAst(CHECKOUT);
    expect(ast.kind).toBe('component');
    if (ast.kind === 'component') {
      const byId = new Map(flatten(ast.nodes).map((n) => [n.id, n]));
      expect(byId.get('Cart UI')?.nodeKind).toBe('component');
      expect(byId.get('Checkout UI')?.nodeKind).toBe('component');
      expect(byId.get('Order Service')?.nodeKind).toBe('component');
      expect(byId.get('Payment Adapter')?.nodeKind).toBe('component');
      expect(byId.get('Inventory Service')?.nodeKind).toBe('component');
      expect(byId.get('PG')?.nodeKind).toBe('cloud');
      expect(byId.get('ODB')?.nodeKind).toBe('database');
    }
  });

  it('parses all 5 relationships', () => {
    const ast = parseToAst(CHECKOUT);
    if (ast.kind !== 'component') throw new Error('expected component');
    expect(ast.relationships).toHaveLength(5);
    const pairs = ast.relationships.map((r) => `${r.source}->${r.target}`);
    expect(pairs).toContain('Cart UI->Checkout UI');
    expect(pairs).toContain('Order Service->Inventory Service');
    expect(pairs).toContain('Order Service->Payment Adapter');
    expect(pairs).toContain('Payment Adapter->PG');
    expect(pairs).toContain('Order Service->ODB');
  });

  it('produces edges between nested children', () => {
    const scene = compile(CHECKOUT);
    const lineCount = scene.children.filter((s) => s.type === 'line' || s.type === 'polyline').length;
    expect(lineCount).toBeGreaterThan(0);
  });

  it('lays out Order Service above its dependents (per-container Sugiyama)', () => {
    const scene = compile(CHECKOUT);
    const texts = scene.children.filter((s) => s.type === 'text');
    const findY = (label: string): number => {
      const t = texts.find((s) => (s as { text: string }).text === label) as { y: number } | undefined;
      return t?.y ?? Infinity;
    };
    const osY = findY('Order Service');
    const paY = findY('Payment Adapter');
    const isY = findY('Inventory Service');
    expect(osY).toBeLessThan(paY);
    expect(osY).toBeLessThan(isY);
  });

  it('lays out Cart UI above Checkout UI (intra-Frontend edge)', () => {
    const scene = compile(CHECKOUT);
    const texts = scene.children.filter((s) => s.type === 'text');
    const findY = (label: string): number => {
      const t = texts.find((s) => (s as { text: string }).text === label) as { y: number } | undefined;
      return t?.y ?? Infinity;
    };
    expect(findY('Cart UI')).toBeLessThan(findY('Checkout UI'));
  });
});
