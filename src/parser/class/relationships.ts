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

/**
 * Inline style/colour bracket embedded in an arrow body, e.g. `-[#red]->`,
 * `-left[#yellow]->`, `-up[#red,dashed]->`, `-[dotted]->`.
 *
 * The bracket sits between the dash run and (optionally) a direction word on
 * one side, and a dash run + arrow head on the other. PlantUML allows a
 * comma-separated list of `#color` tokens and style keywords (`dashed`,
 * `dotted`, `bold`, `plain`, `hidden`, …) in any order.
 *
 * Anatomy of the capture:
 *   group 1: leading marker + dash run + optional direction word (e.g. `-left`)
 *   group 2: bracket contents (without the `[` `]`)
 *   group 3: trailing dash run + optional arrow head (e.g. `->`)
 *
 * We KEEP groups 1 and 3 (minus the direction word, which the direction-hint
 * pass handles next) so the remainder is still a well-formed arrow body for
 * the downstream tokenizer; only the bracket itself is excised.
 */
const ARROW_STYLE_BRACKET =
  /(^|\s)((?:<\||<|o|\*)?-+(?:left|right|up|down|l|r|u|d)?)\[([^\]]*)\](-+(?:\|>|>|o|\*)?)(?=\s|$)/;

/**
 * Resolved contents of an inline arrow-style bracket.
 *   - `lineColor`: the first `#color` (or bare colour) token, normalised.
 *   - `lineStyle`: the first recognised style keyword (`dashed`/`dotted`/
 *     `bold`/`solid`/`plain`/`hidden` → mapped). `plain` collapses to
 *     `solid`; `hidden` is kept verbatim so the renderer can suppress the
 *     stroke if it chooses (currently rendered as solid).
 */
const BRACKET_STYLE_KEYS: Record<string, 'solid' | 'dashed' | 'dotted' | 'bold' | 'hidden'> = {
  dashed: 'dashed',
  dotted: 'dotted',
  bold: 'bold',
  solid: 'solid',
  plain: 'solid',
  hidden: 'hidden',
};

function parseBracketContents(raw: string): {
  lineColor?: string;
  lineStyle?: 'solid' | 'dashed' | 'dotted' | 'bold' | 'hidden';
} {
  const result: { lineColor?: string; lineStyle?: 'solid' | 'dashed' | 'dotted' | 'bold' | 'hidden' } = {};
  for (const tokenRaw of raw.split(',')) {
    const token = tokenRaw.trim();
    if (!token) continue;
    if (token.startsWith('#')) {
      if (result.lineColor === undefined) result.lineColor = normalizeArrowColor(token);
      continue;
    }
    const style = BRACKET_STYLE_KEYS[token.toLowerCase()];
    if (style) {
      if (result.lineStyle === undefined) result.lineStyle = style;
      continue;
    }
    // Bare colour name without `#` (e.g. `red`): treat as line colour if no
    // colour seen yet and it isn't a recognised keyword.
    if (result.lineColor === undefined && /^[A-Za-z][\w]*$/.test(token)) {
      result.lineColor = normalizeArrowColor(token);
    }
  }
  return result;
}

function normalizeArrowColor(raw: string): string {
  const trimmed = raw.trim();
  // Strip a leading `#` to inspect the payload: PlantUML uses `#` both for hex
  // colours (`#DD00AA`) and as a named-colour shorthand (`#red`, `#yellow`).
  const body = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed;
  // A run of 3/4/6/8 hex digits is a hex colour — emit it with a single `#`.
  if (/^(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(body)) {
    return `#${body.toLowerCase()}`;
  }
  // Otherwise it's a named CSS colour (`red`, `yellow`, `blue`); the renderer
  // expects the bare lowercase name, so we drop any PlantUML `#` shorthand.
  return body.toLowerCase();
}

/**
 * Detect and strip an inline style/colour bracket (`-[#red,dashed]->`) from
 * the arrow body. Returns the line with the bracket excised (surrounding
 * dashes/markers preserved so it still tokenizes as an arrow) plus the parsed
 * colour/style. No-ops (returns the line unchanged) when no bracket is found.
 */
function stripStyleBracket(line: string): {
  line: string;
  lineColor?: string;
  lineStyle?: 'solid' | 'dashed' | 'dotted' | 'bold' | 'hidden';
} {
  const m = ARROW_STYLE_BRACKET.exec(line);
  if (!m) return { line };
  const bracketStart = m.index + m[1]!.length + m[2]!.length;
  const bracketEnd = bracketStart + m[3]!.length + 2; // include `[` and `]`
  const cleaned = line.slice(0, bracketStart) + line.slice(bracketEnd);
  return { line: cleaned, ...parseBracketContents(m[3]!) };
}

export function parseRelationship(line: string): ClassRelationship | null {
  // Order matters: excise the inline style bracket (`-[#red,dashed]->`) FIRST,
  // because a direction word can sit immediately before it (`-left[...]->`)
  // with no dash in between, which would otherwise hide the direction hint.
  const bracket = stripStyleBracket(line);
  const stripped = stripDirectionHint(bracket.line);
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
  // Inline bracket colour overrides the structural stroke colour.
  if (bracket.lineColor) rel.lineColor = bracket.lineColor;
  // Inline bracket style overrides the structural line style for rendering.
  // `hidden` is mapped to a render hint the renderer may special-case; the
  // structural `style` (solid/dashed) is left intact for semantic kind.
  if (bracket.lineStyle) {
    rel.lineStyle = bracket.lineStyle;
    // Keep the structural `style` in sync for dashed/dotted so downstream
    // consumers that only look at `style` still see a dashed line.
    if (bracket.lineStyle === 'dashed' || bracket.lineStyle === 'dotted') {
      rel.style = 'dashed';
    }
  }
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
