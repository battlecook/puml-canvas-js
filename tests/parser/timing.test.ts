import { describe, it, expect } from 'vitest';
import { parseTiming } from '../../src/parser/timing/index.js';
import { detectKind } from '../../src/parser/detect.js';
import { tokenize } from '../../src/lexer/index.js';

describe('timing parser', () => {
  it('detects as timing when robust/concise/binary appear', () => {
    const src = '@startuml\nrobust "WB" as WB\n@enduml';
    expect(detectKind(tokenize(src)).kind).toBe('timing');
  });

  it('parses track declarations with quoted name and alias', () => {
    const ast = parseTiming(
      [
        '@startuml',
        'robust "Web Browser" as WB',
        'concise "Web User" as WU',
        'binary "Cache" as C',
        '@enduml',
      ].join('\n'),
    );
    expect(ast.parseError).toBe('');
    expect(ast.tracks).toEqual([
      { id: 'WB', name: 'Web Browser', kind: 'robust' },
      { id: 'WU', name: 'Web User', kind: 'concise' },
      { id: 'C', name: 'Cache', kind: 'binary' },
    ]);
  });

  it('parses @time markers and "is" events, ordered by time', () => {
    const ast = parseTiming(
      [
        '@startuml',
        'robust WB',
        'concise WU',
        '@0',
        'WB is Idle',
        'WU is Idle',
        '@100',
        'WB is Processing',
        'WU is Waiting',
        '@enduml',
      ].join('\n'),
    );
    expect(ast.events).toEqual([
      { time: 0, trackId: 'WB', state: 'Idle' },
      { time: 0, trackId: 'WU', state: 'Idle' },
      { time: 100, trackId: 'WB', state: 'Processing' },
      { time: 100, trackId: 'WU', state: 'Waiting' },
    ]);
  });

  it('handles relative @+N time markers', () => {
    const ast = parseTiming(
      [
        '@startuml',
        'robust A',
        '@0',
        'A is X',
        '@+50',
        'A is Y',
        '@+50',
        'A is Z',
        '@enduml',
      ].join('\n'),
    );
    expect(ast.events.map((e) => e.time)).toEqual([0, 50, 100]);
  });

  it('parses quoted multi-word state names', () => {
    const ast = parseTiming(
      [
        '@startuml',
        'robust A',
        '@0',
        'A is "Long State Name"',
        '@enduml',
      ].join('\n'),
    );
    expect(ast.events[0]!.state).toBe('Long State Name');
  });

  it('implicitly declares a referenced but undeclared track as concise', () => {
    const ast = parseTiming(
      [
        '@startuml',
        '@0',
        'X is Hello',
        '@enduml',
      ].join('\n'),
    );
    expect(ast.tracks).toEqual([{ id: 'X', name: 'X', kind: 'concise' }]);
  });
});
