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

  it('resolves named time anchors and offsets in event times', () => {
    const ast = parseTiming(
      [
        '@startuml',
        'clock clk with period 1',
        'binary "enable" as EN',
        'concise "dataBus" as db',
        '@0 as :start',
        '@5 as :en_high',
        '@10 as :en_low',
        '@:en_high-2 as :en_highMinus2',
        '@:start',
        'EN is low',
        'db is "0x0000"',
        '@:en_high',
        'EN is high',
        '@:en_low',
        'EN is low',
        '@:en_highMinus2',
        'db is "0xf23a"',
        '@:en_high+6',
        'db is "0x0000"',
        '@enduml',
      ].join('\n'),
    );
    expect(ast.parseError).toBe('');
    expect(ast.anchors).toEqual({
      start: 0,
      en_high: 5,
      en_low: 10,
      en_highMinus2: 3,
    });
    // Events sorted by time; verify each expected (time, trackId, state).
    expect(ast.events).toEqual([
      { time: 0, trackId: 'EN', state: 'low' },
      { time: 0, trackId: 'db', state: '0x0000' },
      { time: 3, trackId: 'db', state: '0xf23a' },
      { time: 5, trackId: 'EN', state: 'high' },
      { time: 10, trackId: 'EN', state: 'low' },
      { time: 11, trackId: 'db', state: '0x0000' },
    ]);
  });

  it('resolves track-scoped events with absolute and relative offsets', () => {
    const ast = parseTiming(
      [
        '@startuml',
        'robust "Web Browser" as WB',
        'concise "Web User" as WU',
        '@WB',
        '0 is idle',
        '+200 is Proc.',
        '+100 is Waiting',
        '@WU',
        '0 is Waiting',
        '+500 is ok',
        '@enduml',
      ].join('\n'),
    );
    expect(ast.parseError).toBe('');
    expect(ast.events).toEqual([
      { time: 0, trackId: 'WB', state: 'idle' },
      { time: 0, trackId: 'WU', state: 'Waiting' },
      { time: 200, trackId: 'WB', state: 'Proc.' },
      { time: 300, trackId: 'WB', state: 'Waiting' },
      { time: 500, trackId: 'WU', state: 'ok' },
    ]);
  });

  it('parses `scale N as M pixels` directive onto ast.scale', () => {
    const ast = parseTiming(
      [
        '@startuml',
        'concise "Web User" as WU',
        'scale 100 as 50 pixels',
        '@WU',
        '0 is Waiting',
        '+500 is ok',
        '@enduml',
      ].join('\n'),
    );
    expect(ast.parseError).toBe('');
    expect(ast.scale).toEqual({ units: 100, pixels: 50 });
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

  it('parses @YYYY/MM/DD date stamps as UTC epoch seconds and sets date domain', () => {
    const ast = parseTiming(
      [
        '@startuml',
        'concise "Season" as S',
        '@2000/11/01',
        'S is "Winter"',
        '@2001/02/01',
        'S is "Spring"',
        '@enduml',
      ].join('\n'),
    );
    expect(ast.parseError).toBe('');
    expect(ast.domain).toBe('date');
    const t0 = Math.floor(Date.UTC(2000, 10, 1) / 1000);
    const t1 = Math.floor(Date.UTC(2001, 1, 1) / 1000);
    expect(ast.events).toEqual([
      { time: t0, trackId: 'S', state: 'Winter' },
      { time: t1, trackId: 'S', state: 'Spring' },
    ]);
  });

  it('parses @HH:MM:SS clock stamps as seconds-since-midnight and sets clock domain', () => {
    const ast = parseTiming(
      [
        '@startuml',
        'concise WU',
        '@1:15:00',
        'WU is Idle',
        '@1:16:30',
        'WU is Waiting',
        '@enduml',
      ].join('\n'),
    );
    expect(ast.parseError).toBe('');
    expect(ast.domain).toBe('clock');
    expect(ast.events).toEqual([
      { time: 1 * 3600 + 15 * 60, trackId: 'WU', state: 'Idle' },
      { time: 1 * 3600 + 16 * 60 + 30, trackId: 'WU', state: 'Waiting' },
    ]);
  });

  it('captures `use date format "..."` directive', () => {
    const ast = parseTiming(
      [
        '@startuml',
        'use date format "YY-MM-dd"',
        'concise "Season" as S',
        '@2000/11/01',
        'S is "Winter"',
        '@enduml',
      ].join('\n'),
    );
    expect(ast.parseError).toBe('');
    expect(ast.dateFormat).toBe('YY-MM-dd');
    expect(ast.domain).toBe('date');
  });

  it('captures `hide time-axis` and `manual time-axis` flags', () => {
    const a = parseTiming(['@startuml', 'hide time-axis', '@enduml'].join('\n'));
    expect(a.hideTimeAxis).toBe(true);
    const b = parseTiming(['@startuml', 'manual time-axis', '@enduml'].join('\n'));
    expect(b.manualTimeAxis).toBe(true);
  });

  it('parses `is state : note` and stores note on the event', () => {
    const ast = parseTiming(
      [
        '@startuml',
        'concise WU',
        '@0',
        'WU is Waiting : some note',
        '@enduml',
      ].join('\n'),
    );
    expect(ast.parseError).toBe('');
    expect(ast.events).toEqual([
      { time: 0, trackId: 'WU', state: 'Waiting', note: 'some note' },
    ]);
  });

  it('parses `is {hidden}` and represents the segment as a hidden state', () => {
    const ast = parseTiming(
      [
        '@startuml',
        'concise OD',
        '@0',
        'OD is {hidden}',
        '@10',
        'OD is Visible',
        '@enduml',
      ].join('\n'),
    );
    expect(ast.parseError).toBe('');
    expect(ast.events[0]).toEqual({ time: 0, trackId: 'OD', state: '{hidden}' });
  });

  it('parses inter-track measurements with absolute and relative endpoints', () => {
    const ast = parseTiming(
      [
        '@startuml',
        'concise WB',
        'WB@0 <-> @50 : {50 ms lag}',
        '@200 <-> @+150 : {150 ms}',
        '@enduml',
      ].join('\n'),
    );
    expect(ast.parseError).toBe('');
    expect(ast.measurements).toEqual([
      { track1: 'WB', time1: 0, time2: 50, label: '50 ms lag' },
      { time1: 200, time2: 350, label: '150 ms' },
    ]);
  });

  it('parses `analog "Name" as Id` with no explicit y-range', () => {
    const ast = parseTiming(
      [
        '@startuml',
        'title Between 0-max (by default)',
        'analog "Analog" as A',
        '@0',
        'A is 350',
        '@100',
        'A is 450',
        '@300',
        'A is 350',
        '@enduml',
      ].join('\n'),
    );
    expect(ast.parseError).toBe('');
    expect(ast.tracks).toEqual([
      { id: 'A', name: 'Analog', kind: 'analog' },
    ]);
    // Numeric coercion when track is analog.
    expect(ast.events).toEqual([
      { time: 0, trackId: 'A', state: 350 },
      { time: 100, trackId: 'A', state: 450 },
      { time: 300, trackId: 'A', state: 350 },
    ]);
  });

  it('parses `analog "Name" between MIN and MAX as Id` with explicit range', () => {
    const ast = parseTiming(
      [
        '@startuml',
        'title Between min-max',
        'analog "Analog" between 350 and 450 as A',
        '@0',
        'A is 350',
        '@100',
        'A is 450',
        '@300',
        'A is 350',
        '@enduml',
      ].join('\n'),
    );
    expect(ast.parseError).toBe('');
    expect(ast.tracks).toEqual([
      { id: 'A', name: 'Analog', kind: 'analog', min: 350, max: 450 },
    ]);
    expect(ast.events).toEqual([
      { time: 0, trackId: 'A', state: 350 },
      { time: 100, trackId: 'A', state: 450 },
      { time: 300, trackId: 'A', state: 350 },
    ]);
  });
});
