import type {
  ClassRelationship,
  EndMarker,
  LabelDirection,
  RelationDirection,
  RelationKind,
} from '../../ast/class.js';
import { ARROW, ARROW_FULL, REL_LEFT, REL_RIGHT } from './patterns.js';

/**
 * Inline direction qualifier embedded in an arrow body, e.g. the `left` in
 * `-left->` or the `u` in `--u->`. PlantUML accepts the four cardinal words
 * (`left`/`right`/`up`/`down`) and their single-letter abbreviations
 * (`l`/`r`/`u`/`d`), lowercased.
 *
 * The pattern requires whitespace (or start/end) on either flank so an inner
 * substring like `:left-side:` in an endpoint isn't mistakenly stripped. The
 * arrow head/tail markers (`<|`, `<`, `o`, `*`, `|>`, `>`) are tolerated on
 * the outside of the dash run so the hint can appear in any of:
 *   `-left->`, `--right->`, `<-up-`, `<|-down-|>`, etc.
 */
const DIRECTION_HINT =
  /(^|\s)((?:<\||<|o|\*)?-+)(left|right|up|down|l|r|u|d)(-+(?:\|>|>|o|\*)?)(?=\s|$)/;

const DIRECTION_LETTER: Record<string, RelationDirection> = {
  l: 'left',
  r: 'right',
  u: 'up',
  d: 'down',
  left: 'left',
  right: 'right',
  up: 'up',
  down: 'down',
};

/**
 * Detect and strip a `-left-` / `--up-` / `-r-` style direction qualifier
 * from the arrow body. Returns the line with the alpha token removed (the
 * surrounding dashes are preserved so the remainder still classifies as a
 * normal arrow) and the resolved direction. Returns `null` on the direction
 * field if no hint is present.
 */
function stripDirectionHint(line: string): { line: string; direction?: RelationDirection } {
  const m = DIRECTION_HINT.exec(line);
  if (!m) return { line };
  const direction = DIRECTION_LETTER[m[3]!.toLowerCase()]!;
  // Remove the alpha token but KEEP the dashes on either side — together they
  // still form a well-formed arrow body for the downstream tokenizer.
  const start = m.index + m[1]!.length + m[2]!.length;
  const end = start + m[3]!.length;
  return { line: line.slice(0, start) + line.slice(end), direction };
}

export function parseRelationship(line: string): ClassRelationship | null {
  const stripped = stripDirectionHint(line);
  const work = stripped.line;
  const found = findArrow(work);
  if (!found) return null;

  const leftRaw = work.slice(0, found.idx).trim();
  let rightRaw = work.slice(found.idx + found.arrow.length).trim();
  let label = '';
  let labelDirection: LabelDirection = 'none';

  const colonIdx = findUnquotedColon(rightRaw);
  if (colonIdx !== -1) {
    label = rightRaw.slice(colonIdx + 1).trim();
    rightRaw = rightRaw.slice(0, colonIdx).trim();
    // PlantUML reading-direction marker: `< label` (right-to-left in source order)
    // or `label >` (left-to-right). Capture and strip; the layout draws a
    // small triangle next to the label oriented to match.
    if (/^<\s+/.test(label)) {
      labelDirection = 'backward';
      label = label.replace(/^<\s+/, '').trim();
    } else if (/\s+>$/.test(label)) {
      labelDirection = 'forward';
      label = label.replace(/\s+>$/, '').trim();
    }
  }

  const left = REL_LEFT.exec(leftRaw);
  const right = REL_RIGHT.exec(rightRaw);
  if (!left || !right) return null;

  const source = unquote(left[1]!);
  const sourceMult = left[2] ?? '';
  const targetMult = right[1] ?? '';
  const target = unquote(right[2]!);

  const cls = classify(found.arrow);

  const rel: ClassRelationship = {
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
    labelDirection,
  };
  if (stripped.direction) rel.direction = stripped.direction;
  return rel;
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
  // If the right-hand side starts with `:Name:` (use-case actor shorthand),
  // the surrounding `:`s are part of the endpoint, not a label separator.
  // Skip past the second `:` of that shorthand so the search for a label
  // colon doesn't latch onto the actor's opening `:`. The shorthand body
  // must not contain `:` itself (matching the REL_RIGHT pattern `:[^:"]+:`).
  let start = 0;
  if (s.startsWith(':')) {
    const close = s.indexOf(':', 1);
    if (close !== -1) {
      const body = s.slice(1, close);
      if (body.length > 0 && !/["\s]/.test(body)) {
        start = close + 1;
      }
    }
  }
  for (let i = start; i < s.length; i++) {
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
  // Any dot in the body of the arrow token makes it dashed. The original
  // grammar only allowed `..` (two-or-more dots); the relaxed grammar also
  // accepts the single-dot shorthand `.>` (PlantUML compat), which must still
  // classify as dashed.
  const style: 'solid' | 'dashed' = arrow.includes('.') ? 'dashed' : 'solid';

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
