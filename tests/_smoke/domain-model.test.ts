import { describe, it, expect } from 'vitest';
import { compile, parseToAst, render } from '../../src/index.js';

const DOMAIN = `@startuml
title Domain model with generics, stereotypes, notes, and constraints

hide empty members
skinparam classAttributeIconSize 0

package "ordering.domain" <<Layer>> {
  abstract class AggregateRoot<ID> {
    - id: ID
    + pullEvents(): List<DomainEvent>
  }

  interface Repository<T extends AggregateRoot<ID>, ID> {
    + findById(id: ID): Optional<T>
    + save(entity: T): Unit
  }

  annotation Audited {
    + reason: String
  }

  class Order <<Aggregate>> {
    - lines: List<OrderLine>
    - status: OrderStatus
    + place(command: PlaceOrder): Order
    + cancel(reason: String): void
  }

  class OrderLine <<ValueObject>> {
    + sku: SKU
    + quantity: Quantity
    + price: Money
  }

  enum OrderStatus {
    Draft
    Placed
    Paid
    Cancelled
  }

  record Money {
    amount: BigDecimal
    currency: Currency
  }
}

Repository <|.. OrderRepository
AggregateRoot <|-- Order
Order "1" *-- "1..*" OrderLine : contains >
Order --> OrderStatus
OrderLine --> Money
Audited .. Order

note right of Order
  Invariants:
  * total must be positive
  * cannot cancel after shipment
  * status transitions are monotonic
end note

note "Generic bound and record syntax are intentionally parser-hostile." as N1
N1 .. Repository
@enduml`;

describe('domain model (user repro)', () => {
  it('declares all 8 classes with correct kinds', () => {
    const ast = parseToAst(DOMAIN);
    expect(ast.kind).toBe('class');
    if (ast.kind === 'class') {
      const byId = new Map(ast.classes.map((c) => [c.id, c]));
      expect(byId.get('AggregateRoot<ID>')?.classKind).toBe('abstract');
      expect(byId.get('Repository<T extends AggregateRoot<ID>, ID>')?.classKind).toBe('interface');
      expect(byId.get('Audited')?.classKind).toBe('annotation');
      expect(byId.get('Order')?.classKind).toBe('class');
      expect(byId.get('Order')?.stereotype).toBe('Aggregate');
      expect(byId.get('OrderLine')?.stereotype).toBe('ValueObject');
      expect(byId.get('OrderStatus')?.classKind).toBe('enum');
      expect(byId.get('OrderStatus')?.enumConstants.map((e) => e.name)).toEqual([
        'Draft', 'Placed', 'Paid', 'Cancelled',
      ]);
      expect(byId.get('Money')?.classKind).toBe('record');
    }
  });

  it('parses members on generic-named classes', () => {
    const ast = parseToAst(DOMAIN);
    if (ast.kind !== 'class') throw new Error('expected class');
    const agg = ast.classes.find((c) => c.id === 'AggregateRoot<ID>')!;
    expect(agg.members.map((m) => m.name)).toEqual(['id', 'pullEvents']);
    expect(agg.members[1]?.memberKind).toBe('method');
    expect(agg.members[1]?.type).toBe('List<DomainEvent>');

    const repo = ast.classes.find((c) => c.id === 'Repository<T extends AggregateRoot<ID>, ID>')!;
    expect(repo.members.map((m) => m.name)).toEqual(['findById', 'save']);
  });

  it('does not create stray class for note id N1', () => {
    const ast = parseToAst(DOMAIN);
    if (ast.kind !== 'class') throw new Error('expected class');
    const ids = ast.classes.map((c) => c.id);
    expect(ids).not.toContain('N1');
  });

  it('strips direction hint from relationship label (contains >)', () => {
    const ast = parseToAst(DOMAIN);
    if (ast.kind !== 'class') throw new Error('expected class');
    const rel = ast.relationships.find((r) => r.label.startsWith('contains'));
    expect(rel?.label).toBe('contains');
  });

  it('renders without throwing and produces a non-trivial SVG', () => {
    const scene = compile(DOMAIN);
    expect(scene.width).toBeGreaterThan(400);
    expect(scene.children.length).toBeGreaterThan(20);
    const svg = render(DOMAIN);
    expect(svg.tagName.toLowerCase()).toBe('svg');
  });
});
