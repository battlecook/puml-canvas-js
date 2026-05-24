import { describe, it, expect } from 'vitest';
import { parseMindmap } from '../../src/parser/mindmap/index.js';
import { parseWbs } from '../../src/parser/wbs/index.js';

describe('tree parser — mindmap', () => {
  it('parses a 3-level tree', () => {
    const a = parseMindmap('@startmindmap\n* Root\n** A\n*** A1\n** B\n@endmindmap');
    expect(a.kind).toBe('mindmap');
    expect(a.root?.text).toBe('Root');
    expect(a.root?.children).toHaveLength(2);
    expect(a.root?.children[0]?.text).toBe('A');
    expect(a.root?.children[0]?.children).toHaveLength(1);
    expect(a.root?.children[0]?.children[0]?.text).toBe('A1');
    expect(a.root?.children[1]?.text).toBe('B');
  });

  it('captures title', () => {
    const a = parseMindmap('@startmindmap\ntitle My map\n* R\n@endmindmap');
    expect(a.title).toBe('My map');
  });

  it('handles skipped levels by attaching to nearest ancestor', () => {
    const a = parseMindmap('@startmindmap\n* Root\n*** Deep\n** Mid\n@endmindmap');
    expect(a.root?.children).toHaveLength(2);
  });
});

describe('tree parser — wbs', () => {
  it('parses WBS hierarchy', () => {
    const a = parseWbs([
      '@startwbs',
      '* Project',
      '** Phase 1',
      '*** Task A',
      '** Phase 2',
      '@endwbs',
    ].join('\n'));
    expect(a.kind).toBe('wbs');
    expect(a.root?.text).toBe('Project');
    expect(a.root?.children.map((c) => c.text)).toEqual(['Phase 1', 'Phase 2']);
  });
});
