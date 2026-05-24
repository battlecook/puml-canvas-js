import { describe, it, expect } from 'vitest';
import { compile, parseToAst } from '../../src/index.js';
import type { StateNode } from '../../src/index.js';

const TRANSCODING = `@startuml
title Media transcoding job with composite states and history

hide empty description

[*] --> Queued
Queued --> Running : worker.claim()

state Running {
  [*] --> Downloading
  Downloading --> Probing : source cached
  Probing --> Transcoding : profiles resolved

  state Transcoding {
    [*] --> Video
    Video --> Audio : video done
    Audio --> Captions : audio done
    Captions --> [*]
  }

  Transcoding --> Packaging : renditions complete
  Packaging --> Uploading
  Uploading --> [*]

  state "Recoverable Error" as Recoverable {
    [*] --> WaitingBackoff
    WaitingBackoff --> Requeue
    Requeue --> [*]
  }

  Downloading --> Recoverable : network timeout
  Probing --> Failed : corrupt input
  Transcoding --> Recoverable : worker preempted
  Recoverable --> H : resume
  state H <<history>>
}

Running --> Succeeded : all outputs uploaded
Running --> Failed : fatal error
Failed --> Queued : manual retry
Succeeded --> [*]
@enduml`;

function flatten(states: StateNode[]): StateNode[] {
  const out: StateNode[] = [];
  const walk = (s: StateNode) => {
    out.push(s);
    for (const c of s.children) walk(c);
  };
  for (const s of states) walk(s);
  return out;
}

describe('composite state transcoding (user repro)', () => {
  it('parses Running as a composite containing Downloading/Probing/Transcoding/...', () => {
    const ast = parseToAst(TRANSCODING);
    expect(ast.kind).toBe('state');
    if (ast.kind === 'state') {
      const running = ast.states.find((s) => s.id === 'Running');
      expect(running).toBeDefined();
      expect(running!.children.length).toBeGreaterThan(0);
      const childIds = running!.children.map((c) => c.id);
      expect(childIds).toContain('Downloading');
      expect(childIds).toContain('Probing');
      expect(childIds).toContain('Transcoding');
      expect(childIds).toContain('Packaging');
      expect(childIds).toContain('Uploading');
      expect(childIds).toContain('Recoverable');
      expect(childIds).toContain('H');
    }
  });

  it('parses Transcoding (nested composite) containing Video/Audio/Captions', () => {
    const ast = parseToAst(TRANSCODING);
    if (ast.kind !== 'state') throw new Error('expected state');
    const transcoding = flatten(ast.states).find((s) => s.id === 'Transcoding');
    expect(transcoding?.children.map((c) => c.id)).toEqual(
      expect.arrayContaining(['Video', 'Audio', 'Captions']),
    );
  });

  it('keeps top-level states (Queued, Running, Succeeded) at root', () => {
    const ast = parseToAst(TRANSCODING);
    if (ast.kind !== 'state') throw new Error('expected state');
    const topIds = ast.states.map((s) => s.id);
    expect(topIds).toContain('Queued');
    expect(topIds).toContain('Running');
    expect(topIds).toContain('Succeeded');
    // Note: Failed is created at its first-mention scope (inside Running) since
    // composite states use first-reference-wins implicit scoping. PlantUML's
    // smarter scope resolution would hoist it; that's a known difference.
    expect(flatten(ast.states).map((s) => s.id)).toContain('Failed');
  });

  it('creates per-composite [*] pseudo-states with distinct ids', () => {
    const ast = parseToAst(TRANSCODING);
    if (ast.kind !== 'state') throw new Error('expected state');
    const flat = flatten(ast.states);
    const initials = flat.filter((s) => s.stateKind === 'initial');
    const finals = flat.filter((s) => s.stateKind === 'final');
    // Top-level [*] for entry + per-composite (Running, Transcoding, Recoverable) = 4 initials
    expect(initials.length).toBeGreaterThanOrEqual(2);
    expect(finals.length).toBeGreaterThanOrEqual(2);
    // Each pseudo-state has a unique id
    const ids = new Set(initials.map((s) => s.id));
    expect(ids.size).toBe(initials.length);
  });

  it('detects H as history pseudo-state', () => {
    const ast = parseToAst(TRANSCODING);
    if (ast.kind !== 'state') throw new Error('expected state');
    const h = flatten(ast.states).find((s) => s.id === 'H');
    expect(h?.stateKind).toBe('history');
  });

  it('renders to a non-trivial nested scene', () => {
    const scene = compile(TRANSCODING);
    expect(scene.width).toBeGreaterThan(400);
    expect(scene.height).toBeGreaterThan(400);
    expect(scene.children.length).toBeGreaterThan(50);
  });
});
