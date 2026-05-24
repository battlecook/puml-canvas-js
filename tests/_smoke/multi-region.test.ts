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

const MULTI_REGION = `@startuml
title Multi-region deployment with artifacts and network boundaries

skinparam componentStyle rectangle

node "User Device" as device {
  artifact "omni-viewer.app" as app
}

cloud "Public Internet" {
  node "CDN Edge\\n{global}" as cdn
}

frame "AWS us-east-1" {
  node "VPC" {
    node "Public Subnet" {
      node "ALB" as alb
    }
    node "Private Subnet A" {
      component "Viewer API" as api1
      database "Metadata\\nPostgreSQL" as db
    }
    node "Private Subnet B" {
      component "Conversion Worker" as worker
      queue "Job Queue" as queue
      storage "Object Store\\nS3" as s3
    }
  }
}

frame "AWS eu-west-1" {
  node "Read Replica Region" {
    database "Metadata Replica" as replica
    storage "S3 Replica" as s3replica
  }
}

app --> cdn : HTTPS
cdn --> alb : origin request
alb --> api1 : mTLS
api1 --> db : SQL
api1 --> queue : enqueue conversion
worker --> queue : poll
worker --> s3 : read/write files
db ..> replica : logical replication
s3 ..> s3replica : CRR
@enduml`;

describe('multi-region deployment (user repro)', () => {
  it('detects deployment kind', () => {
    const ast = parseToAst(MULTI_REGION);
    expect(ast.kind).toBe('deployment');
  });

  it('captures the nested hierarchy: device contains app', () => {
    const ast = parseToAst(MULTI_REGION);
    if (ast.kind !== 'deployment') throw new Error('expected deployment');
    const device = ast.nodes.find((n) => n.id === 'device');
    expect(device).toBeDefined();
    expect(device?.children.map((c) => c.id)).toEqual(['app']);
    expect(device?.children[0]?.nodeKind).toBe('artifact');
  });

  it('captures deeply nested AWS us-east-1 > VPC > Subnets > leaves', () => {
    const ast = parseToAst(MULTI_REGION);
    if (ast.kind !== 'deployment') throw new Error('expected deployment');
    const usEast = ast.nodes.find((n) => n.id === 'AWS us-east-1');
    expect(usEast?.children).toHaveLength(1);
    const vpc = usEast!.children[0]!;
    expect(vpc.id).toBe('VPC');
    expect(vpc.children.map((c) => c.id)).toEqual(['Public Subnet', 'Private Subnet A', 'Private Subnet B']);

    const subnetB = vpc.children[2]!;
    expect(subnetB.children.map((c) => c.id)).toEqual(['worker', 'queue', 's3']);
    expect(subnetB.children[1]?.nodeKind).toBe('queue');
    expect(subnetB.children[2]?.nodeKind).toBe('storage');
  });

  it('assigns the correct kind to every leaf', () => {
    const ast = parseToAst(MULTI_REGION);
    if (ast.kind !== 'deployment') throw new Error('expected deployment');
    const byId = new Map(flatten(ast.nodes).map((n) => [n.id, n]));
    expect(byId.get('app')?.nodeKind).toBe('artifact');
    expect(byId.get('cdn')?.nodeKind).toBe('node');
    expect(byId.get('alb')?.nodeKind).toBe('node');
    expect(byId.get('api1')?.nodeKind).toBe('component');
    expect(byId.get('worker')?.nodeKind).toBe('component');
    expect(byId.get('db')?.nodeKind).toBe('database');
    expect(byId.get('queue')?.nodeKind).toBe('queue');
    expect(byId.get('s3')?.nodeKind).toBe('storage');
    expect(byId.get('replica')?.nodeKind).toBe('database');
    expect(byId.get('s3replica')?.nodeKind).toBe('storage');
  });

  it('records all 9 cross-region relationships', () => {
    const ast = parseToAst(MULTI_REGION);
    if (ast.kind !== 'deployment') throw new Error('expected deployment');
    expect(ast.relationships).toHaveLength(9);
  });

  it('renders to a non-trivial nested scene with edges', () => {
    const scene = compile(MULTI_REGION);
    // With promoted edges, top-level containers stack vertically — width is smaller,
    // height is bigger than the old row-wrap layout.
    expect(scene.width).toBeGreaterThan(250);
    expect(scene.height).toBeGreaterThan(600);
    expect(scene.children.length).toBeGreaterThan(30);
    const edgeCount = scene.children.filter((s) => s.type === 'line').length;
    expect(edgeCount).toBeGreaterThanOrEqual(9);
  });
});
