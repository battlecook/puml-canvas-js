import type {
  StateAst,
  StateKind,
  StateLineStyle,
  StateNode,
  StateTransition,
} from '../../ast/state.js';
import { parseRelationship } from '../class/relationships.js';
import { unescapeLabel } from '../container/shared.js';

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
// Region separator inside a composite block. PlantUML accepts `--` (two
// or more hyphens) or `||` (two pipes) on its own line to start a NEW
// concurrent (orthogonal) region within the enclosing `state X { ... }`.
// Each region has its own start state, children, and transitions; the
// layout renders them stacked with a dashed separator line.
const REGION_SEPARATOR = /^(?:-{2,}|\|{2,})\s*$/;
// Which axis a separator introduces:
//   `--` (or longer) → 'vertical'   (regions stacked above/below;
//                                    horizontal dashed line between them)
//   `||` (or longer) → 'horizontal' (regions side-by-side; vertical
//                                    dashed line between them)
// We only need to detect the `||` form to distinguish; everything else
// that matches REGION_SEPARATOR falls back to 'vertical'.
const REGION_SEPARATOR_HORIZONTAL = /^\|{2,}\s*$/;
const HIDE_DIRECTIVE = /^hide\b/i;
const SKINPARAM_DIRECTIVE = /^skinparam\b/i;
// `left to right direction` / `top to bottom direction` — diagram-level flow
// hint. Stored on the AST as `direction`; consumed by layout to switch
// sibling top-level states between vertical stacking (TB) and horizontal
// packing (LR).
const DIRECTION_LR = /^left\s+to\s+right\s+direction\s*$/i;
const DIRECTION_TB = /^top\s+to\s+bottom\s+direction\s*$/i;
// Matches `Name : description text` on its own line, used to attach a
// description row to an existing (or implicitly declared) state.
const STATE_DESCRIPTION = /^(\S+)\s*:\s*(.+)$/;

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
  // Track each node's current parent (undefined for top-level) so we can
  // reparent a node when a later `state X { ... }` explicitly declares it
  // at a different scope.
  const parentOf = new Map<string, StateNode | undefined>();
  const parentStack: StateNode[] = [];
  // Per-composite region tracking: each composite parent maps to an array
  // of regions, where each region is the list of child node ids attached
  // to that region (in source order). The current region for a composite
  // is always the LAST entry. New regions are pushed when a `--` / `||`
  // separator line is encountered inside the composite. The top-level
  // diagram has no enclosing composite and so isn't tracked here.
  const compositeRegions = new Map<StateNode, string[][]>();
  // Per-composite region-direction tracking. Records the axis of the FIRST
  // `--`/`||` separator seen inside that composite. Mixed-token composites
  // (which PlantUML itself doesn't really define) inherit the first token's
  // direction. Composites with no separator never get an entry here.
  const compositeRegionDirection = new Map<StateNode, 'vertical' | 'horizontal'>();
  const lines = source.split(/\r\n|\r|\n/);

  // Region-aware pseudo-state IDs. Inside a composite, each region owns
  // its own `[*]` (initial/final) pseudo-state, so the IDs are suffixed
  // with the region index. Top-level (no parent) uses the un-suffixed
  // legacy IDs since there's only ever one top-level region.
  const currentRegionIndex = (parent: StateNode | undefined): number => {
    if (!parent) return 0;
    const regions = compositeRegions.get(parent);
    return regions ? regions.length - 1 : 0;
  };
  const initialFor = (parent: StateNode | undefined): string => {
    if (!parent) return '__initial__';
    return `__initial__${parent.id}__r${currentRegionIndex(parent)}`;
  };
  const finalFor = (parent: StateNode | undefined): string => {
    if (!parent) return '__final__';
    return `__final__${parent.id}__r${currentRegionIndex(parent)}`;
  };
  const historyFor = (ownerId: string | undefined, isDeep: boolean): string => {
    const tag = isDeep ? 'deephistory' : 'history';
    return ownerId ? `__${tag}__${ownerId}` : `__${tag}__`;
  };

  // Record `nodeId` as belonging to the current region of its composite
  // parent. No-op for top-level nodes.
  const recordRegionMembership = (parent: StateNode | undefined, nodeId: string): void => {
    if (!parent) return;
    const regions = compositeRegions.get(parent);
    if (!regions) return;
    const current = regions[regions.length - 1]!;
    if (!current.includes(nodeId)) current.push(nodeId);
  };

  const detach = (node: StateNode): void => {
    if (!parentOf.has(node.id)) return;
    const cur = parentOf.get(node.id);
    const siblings = cur ? cur.children : ast.states;
    const idx = siblings.indexOf(node);
    if (idx !== -1) siblings.splice(idx, 1);
    // Drop the node from the old composite's region tracking too, so it
    // doesn't get double-counted when it's re-attached under a new parent.
    if (cur) {
      const regions = compositeRegions.get(cur);
      if (regions) {
        for (const region of regions) {
          const ri = region.indexOf(node.id);
          if (ri !== -1) region.splice(ri, 1);
        }
      }
    }
  };

  const attachTo = (node: StateNode, parent: StateNode | undefined): void => {
    if (parent) parent.children.push(node);
    else ast.states.push(node);
    parentOf.set(node.id, parent);
    recordRegionMembership(parent, node.id);
  };

  const addNode = (node: StateNode, explicitParent?: StateNode | undefined | null): StateNode => {
    const existing = byId.get(node.id);
    if (existing) {
      if (existing.stateKind === 'normal' && node.stateKind !== 'normal') {
        existing.stateKind = node.stateKind;
      }
      if (!existing.name && node.name) existing.name = node.name;
      if (node.isDeep !== undefined) existing.isDeep = node.isDeep;
      return existing;
    }
    byId.set(node.id, node);
    // `explicitParent === null` means "force top-level". `undefined` defaults
    // to the current parent stack top.
    const parent = explicitParent === null
      ? undefined
      : explicitParent ?? parentStack[parentStack.length - 1];
    attachTo(node, parent);
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
      const closed = parentStack.pop();
      if (closed) {
        const regions = compositeRegions.get(closed);
        // Persist `regions` on the AST only when the composite actually had
        // more than one region (i.e. at least one `--`/`||` separator was
        // seen). Single-region composites omit `regions` so layout falls
        // back to the existing flat-children path and back-compat holds.
        if (regions && regions.length > 1) {
          closed.regions = regions;
          closed.regionDirection = compositeRegionDirection.get(closed) ?? 'vertical';
        }
        compositeRegions.delete(closed);
        compositeRegionDirection.delete(closed);
      }
      continue;
    }

    // Region separator `--` or `||` inside a composite. Starts a new
    // concurrent region within the current composite parent. Ignored at
    // top level (no enclosing composite). The token type also fixes the
    // composite's region-stack axis on first occurrence.
    if (REGION_SEPARATOR.test(text)) {
      const top = parentStack[parentStack.length - 1];
      if (top) {
        const regions = compositeRegions.get(top);
        if (regions) {
          regions.push([]);
          if (!compositeRegionDirection.has(top)) {
            const dir: 'vertical' | 'horizontal' =
              REGION_SEPARATOR_HORIZONTAL.test(text) ? 'horizontal' : 'vertical';
            compositeRegionDirection.set(top, dir);
          }
        }
      }
      continue;
    }

    const tm = TITLE.exec(text);
    if (tm) {
      ast.title = tm[1]!.trim();
      continue;
    }

    if (DIRECTION_LR.test(text)) {
      ast.direction = 'LR';
      continue;
    }
    if (DIRECTION_TB.test(text)) {
      ast.direction = 'TB';
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
      const node = addNode({ id, name, stateKind, children: [], descriptions: [] });
      // Carry the raw stereotype token for shape hints (sdlreceive, input,
      // output, task, etc.) when it doesn't resolve to a built-in state kind.
      if (stereotype && !STEREOTYPE_TO_KIND[stereotype]) {
        node.stereotype = stereotype;
      }
      if (description) {
        // Back-compat: the first inline description is mirrored to the
        // singular `description` field.
        if (!node.description) node.description = description;
        node.descriptions.push(description);
      }
      if (styleBlock) applyStyleSuffix(node, styleBlock);
      if (m[7]) {
        // Explicit `state X { ... }` declaration: ensure the node is parented
        // under the current scope, even if it was previously created
        // implicitly (e.g. as a target of an earlier arrow) under a different
        // parent.
        const desiredParent = parentStack[parentStack.length - 1];
        const currentParent = parentOf.get(node.id);
        if (currentParent !== desiredParent) {
          detach(node);
          attachTo(node, desiredParent);
        }
        parentStack.push(node);
        // Start region tracking for this composite. First region is
        // implicit (the source order until the first `--`/`||`).
        if (!compositeRegions.has(node)) {
          compositeRegions.set(node, [[]]);
          // Children previously attached to this composite (e.g. nodes
          // forward-referenced before the `state X { ... }` opening) should
          // be considered part of region 0.
          for (const c of node.children) {
            compositeRegions.get(node)![0]!.push(c.id);
          }
        }
      }
      continue;
    }

    const rel = parseRelationship(text);
    if (rel) {
      const currentParent = parentStack[parentStack.length - 1];
      const src = normalize(rel.source, addNode, currentParent, false, initialFor, finalFor, historyFor, byId);
      const tgt = normalize(rel.target, addNode, currentParent, true, initialFor, finalFor, historyFor, byId);
      if (!byId.has(src)) addNode({ id: src, name: src, stateKind: 'normal', children: [], descriptions: [] });
      if (!byId.has(tgt)) addNode({ id: tgt, name: tgt, stateKind: 'normal', children: [], descriptions: [] });

      // `\n` escapes inside the arrow label should expand to real newlines so
      // layout can split a multi-line label across rows, same as `unescapeLabel`
      // does in other parsers (usecase, sequence, container).
      const trans: StateTransition = {
        source: src,
        target: tgt,
        arrowToken: rel.arrowToken,
        style: rel.style,
        sourceMarker: rel.sourceMarker,
        targetMarker: rel.targetMarker,
        label: unescapeLabel(rel.label),
      };
      ast.transitions.push(trans);
      continue;
    }

    // Standalone `Name : description` line — append a description row to the
    // referenced state (auto-creating it as a normal state if needed).
    if ((m = STATE_DESCRIPTION.exec(text))) {
      const id = m[1]!;
      const description = m[2]!.trim();
      if (!description) continue;
      const node = byId.get(id) ??
        addNode({ id, name: id, stateKind: 'normal', children: [], descriptions: [] });
      node.descriptions.push(description);
      continue;
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

// Matches a transition endpoint that references a history pseudo-state.
// Either `[H]` / `[H*]` alone (history of the enclosing composite) or
// `Name[H]` / `Name[H*]` (history of the named state).
const HISTORY_REF = /^([^\s\[\]]*)\[H(\*)?\]$/;

function normalize(
  raw: string,
  addNode: (n: StateNode, explicitParent?: StateNode | undefined | null) => StateNode,
  parent: StateNode | undefined,
  isTarget: boolean,
  initialFor: (p: StateNode | undefined) => string,
  finalFor: (p: StateNode | undefined) => string,
  historyFor: (ownerId: string | undefined, isDeep: boolean) => string,
  byId: Map<string, StateNode>,
): string {
  if (raw === '[*]') {
    const id = isTarget ? finalFor(parent) : initialFor(parent);
    addNode({ id, name: '', stateKind: isTarget ? 'final' : 'initial', children: [], descriptions: [] });
    return id;
  }
  const hm = HISTORY_REF.exec(raw);
  if (hm) {
    const ownerName = hm[1] ?? '';
    const isDeep = hm[2] === '*';
    // Owner: explicit `Name[H]` form names a state; `[H]` alone inherits the
    // current composite parent. The history node is attached as a child of
    // the owner state (auto-creating the owner as a normal state if it
    // doesn't yet exist). Top-level `[H]` (no current parent, no owner name)
    // falls back to a top-level history node.
    let owner: StateNode | undefined;
    if (ownerName) {
      owner = byId.get(ownerName) ??
        addNode(
          { id: ownerName, name: ownerName, stateKind: 'normal', children: [], descriptions: [] },
          null,
        );
    } else {
      owner = parent;
    }
    const id = historyFor(owner?.id, isDeep);
    addNode(
      { id, name: '', stateKind: 'history', children: [], descriptions: [], isDeep },
      owner ?? null,
    );
    return id;
  }
  return raw;
}
