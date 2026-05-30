import type { Token } from '../lexer/types.js';
import type { DiagramKind } from '../ast/index.js';

export type DetectedKind = DiagramKind | 'unknown';

const WRAPPER_TO_KIND: Record<string, DiagramKind> = {
  mindmap: 'mindmap',
  gantt: 'gantt',
  salt: 'salt',
  json: 'json',
  yaml: 'yaml',
  wbs: 'wbs',
  ebnf: 'ebnf',
  regex: 'regex',
  nwdiag: 'nwdiag',
};

const NON_DISCRIMINATING = new Set([
  'title', 'header', 'footer', 'skinparam', 'caption', 'legend',
  'hide', 'show', 'left', 'right', 'top', 'bottom', 'center',
  'scale', 'autonumber', 'package', 'namespace', 'note', 'together',
  'remove', 'restore', 'allowmixing',
]);

const UML_KEYWORD_TO_KIND: Record<string, DiagramKind> = {
  participant: 'sequence',
  boundary: 'sequence',
  control: 'sequence',
  entity: 'sequence',
  collections: 'sequence',
  autonumber: 'sequence',
  hnote: 'sequence',
  rnote: 'sequence',

  class: 'class',
  interface: 'class',
  enum: 'class',
  abstract: 'class',
  annotation: 'class',

  state: 'state',

  usecase: 'usecase',

  component: 'component',
  node: 'deployment',
  cloud: 'deployment',
  folder: 'deployment',
  frame: 'deployment',
  storage: 'deployment',
  artifact: 'deployment',
  agent: 'deployment',
  hexagon: 'deployment',
  stack: 'deployment',
  file: 'deployment',
  card: 'deployment',

  object: 'object',
  map: 'object',

  start: 'activity',

  robust: 'timing',
  concise: 'timing',
  binary: 'timing',
  clock: 'timing',
  analog: 'timing',
};

// Keywords that appear in multiple diagram types. Examples:
// - `database`/`queue`: sequence participant OR deployment shape.
// - `actor`: sequence participant OR usecase actor.
// - `rectangle`: component container OR usecase system boundary OR deployment container.
// Don't commit on first sight; let stronger downstream signals override.
const WEAK_KEYWORD_TO_KIND: Record<string, DiagramKind> = {
  actor: 'sequence',
  database: 'sequence',
  queue: 'sequence',
  rectangle: 'component',
  // `action` / `process` are deployment-shape keywords but also common English
  // words used as activity-bullet labels (`* Action 1`, `* Action 2`). Weak
  // routing lets the bullet-detection or other stronger signals override.
  action: 'deployment',
  process: 'deployment',
};

export interface DetectionResult {
  kind: DetectedKind;
  wrapperStartIndex: number;
  wrapperEndIndex: number;
}

export function detectKind(tokens: Token[]): DetectionResult {
  let startIdx = -1;
  let endIdx = -1;
  let wrapperName = '';

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (t.kind === 'WrapperStart' && startIdx === -1) {
      startIdx = i;
      wrapperName = t.value;
    } else if (t.kind === 'WrapperEnd') {
      endIdx = i;
    }
  }

  if (startIdx === -1) {
    return { kind: 'unknown', wrapperStartIndex: -1, wrapperEndIndex: -1 };
  }

  if (wrapperName !== 'uml') {
    const mapped = WRAPPER_TO_KIND[wrapperName] ?? 'unknown';
    return { kind: mapped, wrapperStartIndex: startIdx, wrapperEndIndex: endIdx };
  }

  let weakKind: DiagramKind | null = null;
  let i = startIdx + 1;
  while (i < tokens.length && (endIdx === -1 || i < endIdx)) {
    const t = tokens[i]!;
    if (t.kind === 'Newline') { i++; continue; }
    if (t.kind === 'Identifier') {
      const lower = t.value.toLowerCase();
      if (NON_DISCRIMINATING.has(lower)) {
        i = skipToNextLine(tokens, i);
        continue;
      }
      const weak = WEAK_KEYWORD_TO_KIND[lower];
      if (weak !== undefined) {
        if (weakKind === null) weakKind = weak;
        i = skipToNextLine(tokens, i);
        continue;
      }
      const k = UML_KEYWORD_TO_KIND[lower];
      if (k) return { kind: k, wrapperStartIndex: startIdx, wrapperEndIndex: endIdx };
      // Unknown identifier (e.g., a participant or class name only referenced
      // via relationships). Defer decision — keep scanning for arrow signatures.
      i = skipToNextLine(tokens, i);
      continue;
    }
    if (t.kind === 'Symbol' && (t.value === '(' || t.value === '[')) {
      if (t.value === '[' && tokens[i + 1]?.kind === 'Symbol' && tokens[i + 1]?.value === '*') {
        return { kind: 'state', wrapperStartIndex: startIdx, wrapperEndIndex: endIdx };
      }
      // Sequence-diagram "found message" shorthand: a line that starts with
      // `[` followed by a sequence arrow (e.g. `[-> Bob`, `[o-> Bob`, `[x<- Bob`)
      // is a boundary message, not a component declaration. Skip the line and
      // keep scanning so a more specific keyword can still win.
      if (t.value === '[' && lineHasBoundaryArrow(tokens, i)) {
        i = skipToNextLine(tokens, i);
        continue;
      }
      // Component interface shorthand `() "Name"` — empty parens followed by a
      // String. Distinct from the usecase `(Name)` form (content between the
      // parens). Commit to `component`.
      if (
        t.value === '(' &&
        tokens[i + 1]?.kind === 'Symbol' && tokens[i + 1]?.value === ')'
      ) {
        return { kind: 'component', wrapperStartIndex: startIdx, wrapperEndIndex: endIdx };
      }
      return {
        kind: t.value === '(' ? 'usecase' : 'component',
        wrapperStartIndex: startIdx,
        wrapperEndIndex: endIdx,
      };
    }
    if (t.kind === 'Colon') {
      // Sequence-diagram actor shorthand: a line that starts with `:Name:`
      // (matching pair of colons, no `;` between them) declares an actor.
      // PlantUML's `:Action;` activity grammar uses a closing `;` instead.
      // Treat the matched-colon form as a weak sequence signal and keep
      // scanning so a stronger keyword (`actor`, `participant`, …) can still
      // confirm or override; bare `:Action` (no closing colon) commits to
      // activity as before.
      if (lineIsColonActorShorthand(tokens, i)) {
        if (weakKind === null) weakKind = 'sequence';
        i = skipToNextLine(tokens, i);
        continue;
      }
      return { kind: 'activity', wrapperStartIndex: startIdx, wrapperEndIndex: endIdx };
    }
    i++;
  }

  // Use-case signals that aren't caught by the per-token scan above (because
  // an earlier weak keyword like `:Name:` skipped past them):
  //   - `(Id)` token sequence on any line — paren-wrapped usecase shorthand
  //   - `as (Id)` — quoted-form bound to a usecase alias
  // Only upgrades a weak `sequence` guess (or unclassified) so it doesn't
  // override activity diagrams whose `if (cond)` / `while (cond)` also have
  // parentheses — those commit to `activity` via the `start` keyword above.
  if (
    (weakKind === null || weakKind === 'sequence') &&
    hasUseCaseSignal(tokens, startIdx, endIdx)
  ) {
    return { kind: 'usecase', wrapperStartIndex: startIdx, wrapperEndIndex: endIdx };
  }

  // Bullet-list activity shorthand (`* Action`, `- Action`, `** Sub-Action`)
  // is checked BEFORE the class-arrow heuristic because a nested bullet like
  // `** Sub-Action 1` contains a dash sandwiched between two identifiers
  // (`Sub-Action`) that the class-arrow scan would otherwise mistake for an
  // `A - B` association. A weak `deployment` guess from seeing the words
  // `action` / `process` (which are also deployment shape keywords) is
  // overridden here when a bullet pattern is also present.
  if (
    (weakKind === null || weakKind === 'deployment') &&
    hasBulletActionLines(tokens, startIdx, endIdx)
  ) {
    return { kind: 'activity', wrapperStartIndex: startIdx, wrapperEndIndex: endIdx };
  }

  if (weakKind === null && hasClassArrow(tokens, startIdx, endIdx)) {
    return { kind: 'class', wrapperStartIndex: startIdx, wrapperEndIndex: endIdx };
  }

  return { kind: weakKind ?? 'sequence', wrapperStartIndex: startIdx, wrapperEndIndex: endIdx };
}

/**
 * Looks for use-case-only shapes in the token stream:
 *   `(Id)`         — a `(` Symbol followed by at least one Identifier/String,
 *                    closed by a matching `)` on the same line.
 *   `as (Id)`      — same `(…)` immediately following an `as` keyword.
 *   `actor/`       — the "business actor" marker. The slash sits immediately
 *                    after the `actor` keyword (no whitespace tokens between
 *                    them since `/` is a Symbol token).
 *   `usecase/`     — same, for the `usecase` keyword.
 *   `:Name:/`      — closing-colon-then-slash form of the business actor
 *                    shorthand.
 * All are syntactic forms unique to use-case diagrams; sequence/activity/
 * class/state grammars never use parentheses around participant names nor
 * the `/` business marker.
 */
function hasUseCaseSignal(tokens: Token[], startIdx: number, endIdx: number): boolean {
  const limit = endIdx === -1 ? tokens.length : endIdx;
  for (let i = startIdx + 1; i < limit; i++) {
    const t = tokens[i]!;
    // Business marker forms: `actor/`, `usecase/`, or `:Name:/`. The slash is
    // a lexer Symbol token immediately following either the keyword Identifier
    // or a closing-colon shorthand on the same line.
    if (t.kind === 'Symbol' && t.value === '/') {
      const prev = tokens[i - 1];
      if (prev) {
        if (prev.kind === 'Identifier') {
          const lower = prev.value.toLowerCase();
          if (lower === 'actor' || lower === 'usecase') return true;
        }
        // `:Name:/` — to avoid false-positives on sequence labels like
        // `Bob -> Alice: //italic//` (also a Colon-then-Slash sequence), we
        // require the colon at `i-1` to be the SECOND colon on the line and
        // the line to start with a Colon. That uniquely identifies the
        // actor-shorthand closing colon, not a mid-line label separator.
        if (prev.kind === 'Colon' && isClosingColonOfShorthand(tokens, i - 1)) {
          return true;
        }
      }
    }
    if (t.kind !== 'Symbol' || t.value !== '(') continue;
    // Find a matching `)` on the same line, with at least one
    // Identifier or String token in between.
    let hasInner = false;
    let closed = false;
    for (let j = i + 1; j < limit; j++) {
      const u = tokens[j]!;
      if (u.kind === 'Newline') break;
      if (u.kind === 'Symbol' && u.value === ')') { closed = true; break; }
      if (u.kind === 'Identifier' || u.kind === 'String') hasInner = true;
    }
    if (closed && hasInner) return true;
  }
  return false;
}

/**
 * Returns true when the line containing index `i` is a sequence-diagram
 * "delay" divider — the line BEGINS with three Symbol `.` tokens (`...`).
 * Three accepted forms:
 *   `...`              — bare delay
 *   `... <text>`       — labeled delay, trailing dots optional
 *   `... <text> ...`   — same as above with trailing `...`
 *
 * Used by `hasClassArrow` to avoid mis-classifying a sequence diagram as
 * class just because it contains a `... long delay ...` annotation between
 * sequence arrows. The class dashed-dependency arrow `A .. B` has an anchor
 * (identifier/string) BEFORE the dots, so it won't match this predicate.
 */
function lineIsEllipsisDelay(tokens: Token[], i: number): boolean {
  // Walk backward to the start of the line.
  let start = i;
  while (start > 0 && tokens[start - 1]!.kind !== 'Newline' &&
         tokens[start - 1]!.kind !== 'WrapperStart') {
    start--;
  }
  // The first three tokens of the line must all be Symbol '.'.
  for (let j = 0; j < 3; j++) {
    const t = tokens[start + j];
    if (!t || t.kind !== 'Symbol' || t.value !== '.') return false;
  }
  return true;
}

/**
 * Walks the tokens on the same line as `i` and returns true if any of
 * `<`, `>`, `[`, `]` appears. These chars do NOT occur in class-association
 * arrows (which use `<|`, `|>`, `..`, `o-`, `-o`, `*-`, etc. but never `[`/`]`
 * and never a bare `>`/`<` as the arrowhead). Used to suppress the o/x→dash
 * class signal on sequence boundary arrows like `[o-> Bob` or `Bob o->o]`.
 */
function lineHasSequenceArrowChars(tokens: Token[], i: number): boolean {
  // Walk backward to the start of the line.
  let start = i;
  while (start > 0 && tokens[start - 1]!.kind !== 'Newline') start--;
  for (let j = start; j < tokens.length; j++) {
    const t = tokens[j]!;
    if (t.kind === 'Newline') break;
    if (t.kind === 'Symbol' && (t.value === '<' || t.value === '>' ||
        t.value === '[' || t.value === ']')) {
      return true;
    }
  }
  return false;
}

/**
 * Returns true when the `[` at index `i` opens a sequence "found message"
 * (e.g. `[-> Bob`, `[o-> Bob`, `[x<- Bob`) rather than a component-name
 * bracket. The signal we look for, on the remainder of the current line:
 *   - at least one `-` Symbol (the arrow shaft), AND
 *   - at least one `<` or `>` Symbol (the arrow head),
 *   - with no `]` (which would make `[…]` a component name).
 */
function lineHasBoundaryArrow(tokens: Token[], from: number): boolean {
  let hasDash = false;
  let hasAngle = false;
  for (let j = from + 1; j < tokens.length; j++) {
    const t = tokens[j]!;
    if (t.kind === 'Newline') break;
    if (t.kind === 'Symbol') {
      if (t.value === '-') hasDash = true;
      else if (t.value === '<' || t.value === '>') hasAngle = true;
      else if (t.value === ']') return false;
    }
  }
  return hasDash && hasAngle;
}

/**
 * Recognises the extension `- Action 1` / `- Action 2` markdown-style list, as
 * well as the PlantUML activity-beta bulleted shortcut `* Action 1`, inside
 * `@startuml`. Both are rendered as a vertical sequence of action nodes (the
 * `*` form mirrors `:Action;`, the `-` form is a compatible-viewer extension).
 *
 * The signal we look for is a Symbol `-` or `*` at the start of a line
 * (immediately after a Newline or the wrapper) followed by an Identifier or
 * String. Multi-level bullets (`**`, `***`, …) also match because the run of
 * leading `*` tokens is followed by an Identifier on the same line.
 *
 * Note: a top-level `*` bullet only appears inside `@startmindmap` /
 * `@startwbs` wrappers, which are intercepted by `WRAPPER_TO_KIND` long before
 * this fallback runs — so we don't risk stealing mindmap/wbs roots.
 */
function hasBulletActionLines(tokens: Token[], startIdx: number, endIdx: number): boolean {
  const limit = endIdx === -1 ? tokens.length : endIdx;
  for (let i = startIdx + 1; i < limit - 1; i++) {
    const prev = tokens[i - 1];
    const cur = tokens[i]!;
    const atLineStart =
      prev !== undefined &&
      (prev.kind === 'Newline' || prev.kind === 'WrapperStart');
    if (!atLineStart) continue;
    if (cur.kind !== 'Symbol' || (cur.value !== '-' && cur.value !== '*')) continue;
    // Skip any further bullet chars on the same line (e.g. `**`, `---`) so the
    // next-token check below sees the action text rather than another bullet.
    let j = i;
    while (j < limit && tokens[j]!.kind === 'Symbol' && tokens[j]!.value === cur.value) j++;
    const after = tokens[j];
    if (after && (after.kind === 'Identifier' || after.kind === 'String')) {
      return true;
    }
  }
  return false;
}

/**
 * Looks for arrow signatures that only appear in class-style diagrams:
 *   `<|`, `|>` — inheritance/realization triangle
 *   `*-`, `-*` — composition diamond (filled)
 *   `..`       — dashed dependency line
 *   `o-`, `-o` — aggregation diamond (open), with `o` as a single-char Identifier
 *
 * Sequence diagrams use `->`, `-->`, `->>`, etc., none of which include `|`, `*`,
 * or a standalone `o` adjacent to dashes. So a hit here is a strong "class" signal
 * when the document has no discriminating keyword.
 */
function hasClassArrow(tokens: Token[], startIdx: number, endIdx: number): boolean {
  const limit = endIdx === -1 ? tokens.length : endIdx;
  // Class-only marker characters. `<` and `|` are intentionally OMITTED — they
  // are part of the multi-char `<|`/`|>` triangle (checked explicitly below)
  // but on their own form sequence arrows (`<-`, `->`).
  const CLASS_ONLY_MARKERS = new Set(['*', '+', '#', '}', '{', '^']);
  for (let i = startIdx + 1; i < limit - 1; i++) {
    const t = tokens[i]!;
    const next = tokens[i + 1]!;
    if (t.kind === 'Symbol' && next.kind === 'Symbol') {
      const a = t.value;
      const b = next.value;
      if (a === '<' && b === '|') return true;
      if (a === '|' && b === '>') return true;
      // `..` is a class dashed-dependency arrow ONLY if it's not part of
      // a sequence "delay" divider line (`...`, `... text`, `... text ...`).
      // A pure-ellipsis line has only dots / identifiers / strings between
      // newlines — no anchor identifier sitting BOTH sides of the `..`.
      if (a === '.' && b === '.' && !lineIsEllipsisDelay(tokens, i)) return true;
      // Dash-adjacent class markers (`*-`, `+-`, `#-`, `}-`, `^-` and their
      // reverses). Suppress on lines that also contain sequence-arrow chars
      // (`<`, `>`, `[`, `]`) — otherwise sequence per-message activation
      // suffixes like `A -> B --++ : msg` (which produce a `-`+`+` token
      // adjacency for the deactivate-source + activate-target combo) and
      // create suffixes like `A -> B ** : msg` would be misread as class.
      if (CLASS_ONLY_MARKERS.has(a) && b === '-' && !lineHasSequenceArrowChars(tokens, i)) return true;
      if (a === '-' && CLASS_ONLY_MARKERS.has(b) && !lineHasSequenceArrowChars(tokens, i)) return true;
    }
    // Identifier-as-marker cases: `o` (aggregation) and `x` (some PlantUML
    // variants). Detected as adjacency to a dash since the lexer treats them
    // as Identifiers. We also require the line not to contain sequence-only
    // chars (`<`, `>`, `[`, `]`) — otherwise this is a sequence "boundary"
    // or open-circle arrow (`A o-> B`, `[o-> Bob`, `Bob o->o]`).
    if (
      t.kind === 'Identifier' && (t.value === 'o' || t.value === 'x') &&
      next.kind === 'Symbol' && next.value === '-' &&
      !lineHasSequenceArrowChars(tokens, i)
    ) return true;
    if (
      t.kind === 'Symbol' && t.value === '-' &&
      next.kind === 'Identifier' && (next.value === 'o' || next.value === 'x') &&
      !lineHasSequenceArrowChars(tokens, i)
    ) return true;
  }
  // Plain dashes with identifier-like endpoints on BOTH sides (`A - B`,
  // `A -- B`) are class associations. Requiring identifiers on both sides
  // avoids false-positives like `- Action 1` (markdown-style list, which is
  // not a valid PlantUML construct anywhere in @startuml).
  for (let i = startIdx + 1; i < limit; i++) {
    if (tokens[i]!.kind !== 'Symbol' || tokens[i]!.value !== '-') continue;
    let j = i;
    while (j < limit && tokens[j]!.kind === 'Symbol' && tokens[j]!.value === '-') j++;
    const prev = i > startIdx + 1 ? tokens[i - 1] : undefined;
    const after = j < limit ? tokens[j] : undefined;
    const prevIsAnchor =
      prev !== undefined && (prev.kind === 'Identifier' || prev.kind === 'String');
    const afterIsAnchor =
      after !== undefined && (after.kind === 'Identifier' || after.kind === 'String');
    if (prevIsAnchor && afterIsAnchor) return true;
    i = j - 1;
  }
  return false;
}

/**
 * Recognises the sequence-diagram actor shorthand `:Display Name:` (optionally
 * followed by `as Id` / `#color`) when the leading `Colon` is at index `i`.
 * Returns true iff the same line contains a SECOND `Colon` token before any
 * `;` Symbol or Newline — i.e. `:Name:` rather than `:Action;` activity syntax.
 */
function lineIsColonActorShorthand(tokens: Token[], i: number): boolean {
  // The colon at `i` must be the FIRST token on its line (skip back over the
  // preceding Newline / WrapperStart).
  let start = i;
  while (start > 0 && tokens[start - 1]!.kind !== 'Newline' &&
         tokens[start - 1]!.kind !== 'WrapperStart') {
    start--;
  }
  if (start !== i) return false;
  // If the line contains a `;` ANYWHERE before the newline, it is an
  // activity-style `:Action;` regardless of how many intermediate colons the
  // label text contains (markup like `bold:` / `Image:` is legal inside an
  // activity action). Scan the whole line first to check for `;` before
  // deciding this is sequence-actor shorthand.
  let sawColonAfter = false;
  for (let j = i + 1; j < tokens.length; j++) {
    const t = tokens[j]!;
    if (t.kind === 'Newline') break;
    if (t.kind === 'Symbol' && t.value === ';') return false;
    if (t.kind === 'Colon') sawColonAfter = true;
  }
  return sawColonAfter;
}

/**
 * Returns true when the Colon at index `i` is the CLOSING colon of an
 * actor-shorthand `:Name:` on the current line — i.e. the line starts with
 * a Colon and the colon at `i` is the second one. Used by `hasUseCaseSignal`
 * to distinguish a business-actor `:Name:/` from a sequence-message colon
 * separator (`Bob -> Alice: //italic//`) which also produces a Colon
 * adjacent to a `/` Symbol.
 */
function isClosingColonOfShorthand(tokens: Token[], i: number): boolean {
  // Walk back to line start. The first non-Newline/WrapperStart token must
  // itself be a Colon (the OPENING `:`).
  let start = i;
  while (start > 0 && tokens[start - 1]!.kind !== 'Newline' &&
         tokens[start - 1]!.kind !== 'WrapperStart') {
    start--;
  }
  if (start === i) return false;
  const first = tokens[start];
  if (!first || first.kind !== 'Colon') return false;
  // Between the opening colon and `i`, no other Colon may appear (otherwise
  // `i` would be a third colon, not the matched closing one).
  for (let j = start + 1; j < i; j++) {
    if (tokens[j]!.kind === 'Colon') return false;
  }
  return true;
}

function skipToNextLine(tokens: Token[], from: number): number {
  let i = from;
  while (i < tokens.length && tokens[i]!.kind !== 'Newline') i++;
  while (i < tokens.length && tokens[i]!.kind === 'Newline') i++;
  return i;
}
