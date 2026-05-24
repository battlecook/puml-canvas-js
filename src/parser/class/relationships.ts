import type { ClassRelationship, EndMarker, RelationKind } from '../../ast/class.js';
import { ARROW, ARROW_FULL, REL_LEFT, REL_RIGHT } from './patterns.js';

export function parseRelationship(line: string): ClassRelationship | null {
  const found = findArrow(line);
  if (!found) return null;

  const leftRaw = line.slice(0, found.idx).trim();
  let rightRaw = line.slice(found.idx + found.arrow.length).trim();
  let label = '';

  const colonIdx = findUnquotedColon(rightRaw);
  if (colonIdx !== -1) {
    label = rightRaw.slice(colonIdx + 1).trim();
    rightRaw = rightRaw.slice(0, colonIdx).trim();
    label = label.replace(/^[<>]\s+/, '').replace(/\s+[<>]$/, '').trim();
  }

  const left = REL_LEFT.exec(leftRaw);
  const right = REL_RIGHT.exec(rightRaw);
  if (!left || !right) return null;

  const source = unquote(left[1]!);
  const sourceMult = left[2] ?? '';
  const targetMult = right[1] ?? '';
  const target = unquote(right[2]!);

  const cls = classify(found.arrow);

  return {
    source,
    target,
    sourceMult,
    targetMult,
    arrowToken: found.arrow,
    kind: cls.kind,
    style: cls.style,
    sourceMarker: cls.leftMarker,
    targetMarker: cls.rightMarker,
    label,
  };
}

function findArrow(line: string): { idx: number; arrow: string } | null {
  ARROW.lastIndex = 0;
  let m: RegExpExecArray | null;
  let best: { idx: number; arrow: string } | null = null;
  while ((m = ARROW.exec(line)) !== null) {
    if (!ARROW_FULL.test(m[0])) continue;
    if (!best || m[0].length > best.arrow.length) {
      best = { idx: m.index, arrow: m[0] };
    }
  }
  return best;
}

function findUnquotedColon(s: string): number {
  let inQuote = false;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '"') inQuote = !inQuote;
    else if (s[i] === ':' && !inQuote) return i;
  }
  return -1;
}

function unquote(s: string): string {
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
    return s.slice(1, -1);
  }
  return s;
}

function classify(arrow: string): {
  kind: RelationKind;
  style: 'solid' | 'dashed';
  leftMarker: EndMarker;
  rightMarker: EndMarker;
} {
  const style: 'solid' | 'dashed' = arrow.includes('..') ? 'dashed' : 'solid';

  const leftMarker: EndMarker = arrow.startsWith('<|')
    ? 'triangle'
    : arrow.startsWith('<')
      ? 'arrow'
      : arrow.startsWith('o')
        ? 'diamond-open'
        : arrow.startsWith('*')
          ? 'diamond-filled'
          : 'none';

  const rightMarker: EndMarker = arrow.endsWith('|>')
    ? 'triangle'
    : arrow.endsWith('>')
      ? 'arrow'
      : arrow.endsWith('o')
        ? 'diamond-open'
        : arrow.endsWith('*')
          ? 'diamond-filled'
          : 'none';

  const has = (marker: EndMarker): boolean =>
    leftMarker === marker || rightMarker === marker;

  let kind: RelationKind;
  if (has('triangle')) {
    kind = style === 'dashed' ? 'realization' : 'inheritance';
  } else if (has('diamond-filled')) {
    kind = 'composition';
  } else if (has('diamond-open')) {
    kind = 'aggregation';
  } else if (style === 'dashed') {
    kind = 'dependency';
  } else {
    kind = 'association';
  }

  return { kind, style, leftMarker, rightMarker };
}
