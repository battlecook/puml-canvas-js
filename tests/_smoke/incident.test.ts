import { describe, it, expect } from 'vitest';
import { compile, parseToAst, render } from '../../src/index.js';

const INCIDENT = `@startuml
title Incident response workflow with partitions, detach, kill, fork, and repeat

start
partition "Detector" {
  :Receive alert;
  if (Duplicate?) then (yes)
    :Attach to existing incident;
    detach
  else (no)
    :Create incident;
  endif
}

partition "Triage" {
  repeat
    :Collect logs;
    :Query metrics;
    if (Signal sufficient?) then (yes)
      break
    else (no)
      :Ask service owner;
    endif
  repeat while (within 10 min?) is (yes)
}

fork
  partition "Comms" {
    :Post status page update;
    :Notify stakeholders;
  }
fork again
  partition "Mitigation" {
    if (Feature flag exists?) then (yes)
      :Disable risky feature;
    else (no)
      :Rollback deployment;
      if (Rollback fails?) then (yes)
        kill
      endif
    endif
  }
fork again
  partition "Evidence" {
    :Snapshot dashboards;
    :Export traces;
  }
end fork

while (Error rate above SLO?) is (yes)
  :Apply next mitigation;
endwhile (no)
:Write postmortem draft;
stop
@enduml`;

describe('incident workflow (user repro)', () => {
  it('parses to activity AST', () => {
    const ast = parseToAst(INCIDENT);
    expect(ast.kind).toBe('activity');
    if (ast.kind === 'activity') {
      const types = ast.body.map((n) => n.type);
      expect(types).toContain('start');
      expect(types).toContain('partition');
      expect(types).toContain('fork');
      expect(types).toContain('while');
      expect(types).toContain('stop');
    }
  });

  it('produces a non-empty scene with reasonable dimensions', () => {
    const scene = compile(INCIDENT);
    expect(scene.width).toBeGreaterThan(300);
    expect(scene.height).toBeGreaterThan(800);
    expect(scene.children.length).toBeGreaterThan(50);
  });

  it('renders to a valid SVG', () => {
    const svg = render(INCIDENT);
    expect(svg.tagName.toLowerCase()).toBe('svg');
    const w = Number(svg.getAttribute('width'));
    const h = Number(svg.getAttribute('height'));
    expect(w).toBeGreaterThan(300);
    expect(h).toBeGreaterThan(800);
  });
});
