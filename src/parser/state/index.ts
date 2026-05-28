import type {
  StateAst,
  StateKind,
  StateLineStyle,
  StateNode,
  StateTransition,
} from '../../ast/state.js';
import { parseRelationship } from '../class/relationships.js';

const WRAPPER = /^@(start|end)\w+/i;
const LINE_COMMENT = /^\s*'/;
const TITLE = /^title\s+(.+)\s*$/i;

const NAME = String.raw`(?:"([^"]+)"|([^\s,"<>{}]+))`;
const STATE_DECL = new RegExp(
  String.raw`^state\s+` + NAME +
    String.raw`(?:\s+as\s+(\S+))?` +
    String.raw`(?:\s+<<\s*([^>]+?)\s*>>)?` +
    String.raw`(?:\s+(#\S+))?` +
    String.raw`(?:\s*:\s*(.+?))?` +
    String.raw`\s*(\{)?\s*$`,
  'i',
);
const BLOCK_CLOSE = /^\}\s*$/;
const HIDE_DIRECTIVE = /^hide\b/i;
const SKINPARAM_DIRECTIVE = /^skinparam\b/i;

const STEREOTYPE_TO_KIND: Record<string, StateKind> = {
  choice: 'choice',
  fork: 'fork',
  join: 'join',
  history: 'history',
  deepHistory: 'history',
  'deep history': 'history',
  start: 'initial',
  end: 'final',
};

export function parseState(source: string): StateAst {
  const ast: StateAst = { kind: 'state', title: '', states: [], transitions: [] };
  const byId = new Map<string, StateNode>();
  const parentStack: StateNode[] = [];
  const lines = source.split(/\r\n|\r|\n/);

  const initialFor = (parent: StateNode | undefined): string =>
    parent ? `__initial__${parent.id}` : '__initial__';
  const finalFor = (parent: StateNode | undefined): string =>
    parent ? `__final__${parent.id}` : '__final__';

  const addNode = (node: StateNode): StateNode => {
    const existing = byId.get(node.id);
    if (existing) {
      if (existing.stateKind === 'normal' && node.stateKind !== 'normal') {
        existing.stateKind = node.stateKind;
      }
      if (!existing.name && node.name) existing.name = node.name;
      return existing;
    }
    byId.set(node.id, node);
    const parent = parentStack[parentStack.length - 1];
    if (parent) parent.children.push(node);
    else ast.states.push(node);
    return node;
  };

  for (const raw of lines) {
    const text = raw.trim();
    if (!text) continue;
    if (LINE_COMMENT.test(text)) continue;
    if (WRAPPER.test(text)) continue;
    if (HIDE_DIRECTIVE.test(text)) continue;
    if (SKINPARAM_DIRECTIVE.test(text)) continue;
    if (BLOCK_CLOSE.test(text)) {
      parentStack.pop();
      continue;
    }

    const tm = TITLE.exec(text);
    if (tm) {
      ast.title = tm[1]!.trim();
      continue;
    }

    let m: RegExpExecArray | null;
    if ((m = STATE_DECL.exec(text))) {
      const name = (m[1] ?? m[2] ?? '').trim();
      const id = m[3] ?? name;
      const stereotype = (m[4] ?? '').trim().toLowerCase();
      const styleBlock = m[5];
      const description = m[6]?.trim();
      const stateKind = STEREOTYPE_TO_KIND[stereotype] ?? 'normal';
      const node = addNode({ id, name, stateKind, children: [] });
      if (description) node.description = description;
      if (styleBlock) applyStyleSuffix(node, styleBlock);
      if (m[7]) parentStack.push(node);
      continue;
    }

    const rel = parseRelationship(text);
    if (rel) {
      const currentParent = parentStack[parentStack.length - 1];
      const src = normalize(rel.source, addNode, currentParent, false, initialFor, finalFor);
      const tgt = normalize(rel.target, addNode, currentParent, true, initialFor, finalFor);
      if (!byId.has(src)) addNode({ id: src, name: src, stateKind: 'normal', children: [] });
      if (!byId.has(tgt)) addNode({ id: tgt, name: tgt, stateKind: 'normal', children: [] });

      const trans: StateTransition = {
        source: src,
        target: tgt,
        arrowToken: rel.arrowToken,
        style: rel.style,
        sourceMarker: rel.sourceMarker,
        targetMarker: rel.targetMarker,
        label: rel.label,
      };
      ast.transitions.push(trans);
    }
  }

  return ast;
}

const LINE_STYLE_KEYS = new Set<StateLineStyle>(['solid', 'dashed', 'dotted', 'bold']);

function applyStyleSuffix(node: StateNode, raw: string): void {
  // Strip a single leading '#'; the block as a whole may start with '#fill'
  // (e.g. '#pink;line:red') or with a bare style token (e.g. '#line.dotted;line:gold').
  const trimmed = raw.startsWith('#') ? raw.slice(1) : raw;
  const segments = trimmed.split(';').map((s) => s.trim()).filter(Boolean);
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    // First segment without a known prefix is the fill.
    if (i === 0 && !/^line[:.]/i.test(seg) && !/^text:/i.test(seg)) {
      node.fill = normalizeColor(seg);
      continue;
    }
    const lineColor = /^line\s*:\s*(\S+)$/i.exec(seg);
    if (lineColor) {
      node.lineColor = normalizeColor(lineColor[1]!);
      continue;
    }
    const lineStyle = /^line\.(bold|dashed|dotted|solid)$/i.exec(seg);
    if (lineStyle) {
      const style = lineStyle[1]!.toLowerCase() as StateLineStyle;
      if (LINE_STYLE_KEYS.has(style)) node.lineStyle = style;
      continue;
    }
    const textColor = /^text\s*:\s*(\S+)$/i.exec(seg);
    if (textColor) {
      node.textColor = normalizeColor(textColor[1]!);
      continue;
    }
  }
}

function normalizeColor(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith('#')) return trimmed;
  // Hex without '#' (e.g. '00FFFF') becomes '#00FFFF'.
  if (/^[0-9a-fA-F]{3,8}$/.test(trimmed) && /[a-fA-F]/.test(trimmed)) {
    return `#${trimmed}`;
  }
  return trimmed.toLowerCase();
}

function normalize(
  raw: string,
  addNode: (n: StateNode) => StateNode,
  parent: StateNode | undefined,
  isTarget: boolean,
  initialFor: (p: StateNode | undefined) => string,
  finalFor: (p: StateNode | undefined) => string,
): string {
  if (raw === '[*]') {
    const id = isTarget ? finalFor(parent) : initialFor(parent);
    addNode({ id, name: '', stateKind: isTarget ? 'final' : 'initial', children: [] });
    return id;
  }
  return raw;
}
