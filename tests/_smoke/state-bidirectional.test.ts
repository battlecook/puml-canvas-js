import { describe, it, expect } from 'vitest';
import { compile } from '../../src/index.js';

const DOC = `@startuml
title Document Review State
[*] --> Draft
Draft --> InReview: submit
InReview --> Draft: request changes
InReview --> Approved: approve
Approved --> Published: publish
Published --> Archived: archive
Archived --> [*]
@enduml`;

describe('state bidirectional edges (user repro)', () => {
  it('renders without overlapping the two Draft↔InReview labels', () => {
    const scene = compile(DOC);
    const texts = scene.children.filter((s) => s.type === 'text');
    const submit = texts.find((t) => (t as { text: string }).text === 'submit') as { x: number; y: number } | undefined;
    const reqChanges = texts.find((t) => (t as { text: string }).text === 'request changes') as { x: number; y: number } | undefined;
    expect(submit).toBeDefined();
    expect(reqChanges).toBeDefined();
    // The two labels should be separated horizontally (not on the same x)
    // After Phase 9 polish: bigger lateral offset (18) + label perpendicular gap (8) →
    // labels should sit at least ~30px apart horizontally
    expect(Math.abs(submit!.x - reqChanges!.x)).toBeGreaterThan(30);
  });
});
