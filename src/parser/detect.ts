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
      return { kind: weakKind ?? 'sequence', wrapperStartIndex: startIdx, wrapperEndIndex: endIdx };
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

  return { kind: weakKind ?? 'sequence', wrapperStartIndex: startIdx, wrapperEndIndex: endIdx };
}

function skipToNextLine(tokens: Token[], from: number): number {
  let i = from;
  while (i < tokens.length && tokens[i]!.kind !== 'Newline') i++;
  while (i < tokens.length && tokens[i]!.kind === 'Newline') i++;
  return i;
}
