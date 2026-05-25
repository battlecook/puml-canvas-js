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

  object: 'object',

  start: 'activity',

  robust: 'timing',
  concise: 'timing',
  binary: 'timing',
  clock: 'timing',
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
      return {
        kind: t.value === '(' ? 'usecase' : 'component',
        wrapperStartIndex: startIdx,
        wrapperEndIndex: endIdx,
      };
    }
    if (t.kind === 'Colon') {
      return { kind: 'activity', wrapperStartIndex: startIdx, wrapperEndIndex: endIdx };
    }
    i++;
  }

  if (weakKind === null && hasClassArrow(tokens, startIdx, endIdx)) {
    return { kind: 'class', wrapperStartIndex: startIdx, wrapperEndIndex: endIdx };
  }

  if (weakKind === null && hasDashActionLines(tokens, startIdx, endIdx)) {
    return { kind: 'activity', wrapperStartIndex: startIdx, wrapperEndIndex: endIdx };
  }

  return { kind: weakKind ?? 'sequence', wrapperStartIndex: startIdx, wrapperEndIndex: endIdx };
}

/**
 * Recognises the extension `- Action 1` / `- Action 2` markdown-style list
 * inside `@startuml`. Several PlantUML-compatible viewers render this as a
 * vertical activity flow even though the official syntax is `:Action;`.
 *
 * The signal we look for is: a Symbol `-` at the start of a line (immediately
 * after a Newline or the wrapper) followed by an Identifier / String. We
 * require this on at least one line to switch into activity mode.
 */
function hasDashActionLines(tokens: Token[], startIdx: number, endIdx: number): boolean {
  const limit = endIdx === -1 ? tokens.length : endIdx;
  for (let i = startIdx + 1; i < limit - 1; i++) {
    const prev = tokens[i - 1];
    const cur = tokens[i]!;
    const next = tokens[i + 1]!;
    const atLineStart =
      prev !== undefined &&
      (prev.kind === 'Newline' || prev.kind === 'WrapperStart');
    if (!atLineStart) continue;
    if (cur.kind === 'Symbol' && cur.value === '-' &&
        (next.kind === 'Identifier' || next.kind === 'String')) {
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
      if (a === '.' && b === '.') return true;
      if (CLASS_ONLY_MARKERS.has(a) && b === '-') return true;
      if (a === '-' && CLASS_ONLY_MARKERS.has(b)) return true;
    }
    // Identifier-as-marker cases: `o` (aggregation) and `x` (some PlantUML
    // variants). Detected as adjacency to a dash since the lexer treats them
    // as Identifiers.
    if (
      t.kind === 'Identifier' && (t.value === 'o' || t.value === 'x') &&
      next.kind === 'Symbol' && next.value === '-'
    ) return true;
    if (
      t.kind === 'Symbol' && t.value === '-' &&
      next.kind === 'Identifier' && (next.value === 'o' || next.value === 'x')
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

function skipToNextLine(tokens: Token[], from: number): number {
  let i = from;
  while (i < tokens.length && tokens[i]!.kind !== 'Newline') i++;
  while (i < tokens.length && tokens[i]!.kind === 'Newline') i++;
  return i;
}
