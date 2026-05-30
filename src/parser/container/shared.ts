import type {
  ContainerAst,
  ContainerLineStyle,
  ContainerNode,
  ContainerNodeKind,
  ContainerRelationship,
} from '../../ast/container.js';
import type { LabelBlock } from '../../ast/usecase.js';
import { parseRelationship } from '../class/relationships.js';

export const WRAPPER = /^@(start|end)\w+/i;
export const LINE_COMMENT = /^\s*'/;
export const TITLE = /^title\s+(.+)\s*$/i;
export const NAME = String.raw`(?:"([^"]+)"|([^\s,"<>{}]+))`;
export const BLOCK_CLOSE = /^\}\s*$/;
// `footer <text>` — single-line diagram footer. Stored verbatim on the AST
// root; layout passes it through the shared Creole markup parser so styles
// like `//italic//` and `**bold**` render correctly.
export const FOOTER_INLINE = /^footer\s+(.+?)\s*$/i;
// `remove <id>` — drops the named node (by id) from the rendered diagram.
// Mirrors the class-diagram form added in Task #30 so component / deployment /
// object diagrams support the same statement. Silently ignored when the id
// was never declared.
export const REMOVE_STMT = /^remove\s+(\S+)\s*$/i;

// `note <side> of <anchor> : <text>` — single-line attached note. The anchor
// accepts a bare id, a `"quoted"` form, or the component shorthand `[Name]`
// (PlantUML treats all three as the same node).
//   m[1] = side, m[2] = anchor, m[3] = body
export const NOTE_OF_INLINE =
  /^note\s+(left|right|top|bottom)\s+of\s+("[^"]+"|\[[^\]]+\]|\S+)\s*:\s*(.*)$/i;
// `note <side> of <anchor>` (with body on following lines, terminated by
// `end note`). Same capture indexes as NOTE_OF_INLINE minus the body.
export const NOTE_OF_BLOCK =
  /^note\s+(left|right|top|bottom)\s+of\s+("[^"]+"|\[[^\]]+\]|\S+)\s*$/i;
// Free-standing inline note with an id: `note "Display" as N : body`.
// Rarely used in practice but accepted for parity with PlantUML. The id is
// captured at m[3] and the body at m[4]; the optional quoted display label
// at m[1] (or the bare form at m[2]) becomes the rendered title prefix.
export const NOTE_AS_INLINE =
  /^note\s+(?:"([^"]+)"|(\S+))\s+as\s+(\S+)\s*:\s*(.*)$/i;
// Free-standing block note with an id: `note as N` ... `end note`. The body
// is collected line-by-line (mirrors NOTE_OF_BLOCK) until the terminator;
// no anchor is attached so layout treats it as a regular flow node.
export const NOTE_AS_BLOCK = /^note\s+as\s+(\S+)\s*$/i;
export const NOTE_END = /^end\s+note\s*$/i;

/**
 * Strip the wrapping characters off a note anchor reference so the result is
 * the same id the corresponding node declaration would have produced. PlantUML
 * allows `note right of C`, `note right of [C]` and `note right of "C"` to
 * point at the same node, so we collapse all three forms here.
 */
export function resolveNoteAnchor(raw: string): string {
  const t = raw.trim();
  if (t.startsWith('[') && t.endsWith(']')) return t.slice(1, -1).trim();
  if (t.startsWith('"') && t.endsWith('"')) return t.slice(1, -1).trim();
  return t;
}

/**
 * Expand `\n` escape sequences in a note body into real newlines so layout
 * can split on `\n` to produce one rendered line per segment.
 */
export function unescapeNoteBody(text: string): string {
  return text.replace(/\\n/g, '\n');
}

/**
 * Expand `\n` escape sequences in a quoted display label into real newlines
 * so layout can split on `\n` to produce one rendered row per segment.
 */
export function unescapeLabel(text: string): string {
  return text.replace(/\\n/g, '\n');
}

/**
 * Pre-join physical lines that fall inside an unterminated `[...]` block.
 * PlantUML allows the bracket label of `folder X [ ... ]` (and the other
 * container keywords) to span multiple source lines; the parser then sees
 * one logical declaration with `\n`s embedded in the bracket content.
 *
 * Walk lines tracking the bracket nesting: when a line opens `[` without
 * closing it, glue subsequent lines on with real `\n` until balanced.
 * Square brackets that appear inside HTML-style tags (e.g. `<color:blue>`)
 * are not considered — only literal `[` / `]` count.
 */
export function joinBracketContinuations(lines: string[]): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    let cur = lines[i]!;
    let depth = bracketDelta(cur);
    while (depth > 0 && i + 1 < lines.length) {
      i++;
      cur = cur + '\n' + lines[i]!;
      depth += bracketDelta(lines[i]!);
    }
    out.push(cur);
    i++;
  }
  return out;
}

function bracketDelta(s: string): number {
  let d = 0;
  for (let j = 0; j < s.length; j++) {
    const c = s[j];
    if (c === '[') d++;
    else if (c === ']') d--;
  }
  return d;
}

/**
 * Split brace boundaries onto their own lines so a single source line like
 * `cloud vpc { node ec2 { stack stack } }` becomes one logical declaration per
 * line and the per-line parser machinery (open-brace pushes parent, `}` pops
 * the stack) keeps working with arbitrarily deep nesting on one physical line.
 *
 * Braces inside an unterminated `[...]` bracket label are NOT split — they're
 * part of the label content, not a block boundary. Also skips brace-less lines
 * for speed (most diagrams are already one-decl-per-line).
 */
export function splitBraceBoundaries(lines: string[]): string[] {
  const out: string[] = [];
  for (const ln of lines) {
    if (!ln.includes('{') && !ln.includes('}')) {
      out.push(ln);
      continue;
    }
    let buf = '';
    let bracketDepth = 0;
    let inQuote = false;
    for (let j = 0; j < ln.length; j++) {
      const c = ln[j]!;
      if (c === '"') inQuote = !inQuote;
      else if (!inQuote) {
        if (c === '[') bracketDepth++;
        else if (c === ']') bracketDepth = Math.max(0, bracketDepth - 1);
        else if (bracketDepth === 0 && (c === '{' || c === '}')) {
          const trimmed = buf.trim();
          if (trimmed.length > 0) out.push(trimmed + (c === '{' ? ' {' : ''));
          else if (c === '{' && out.length > 0) {
            // Bare `{` continues the previous line's declaration as its opener.
            out[out.length - 1] = out[out.length - 1] + ' {';
          }
          if (c === '}') out.push('}');
          buf = '';
          continue;
        }
      }
      buf += c;
    }
    const tail = buf.trim();
    if (tail.length > 0) out.push(tail);
  }
  // Post-pass: a brace body line that lists multiple `[Comp1] [Comp2]`
  // shorthand declarations side-by-side (PlantUML accepts this for
  // inline component lists) is split so each bracket becomes its own
  // declaration line. We only split when the entire line is a sequence of
  // bracket tokens separated by whitespace — otherwise the line is left
  // intact so `agent a` etc. still pass through.
  const out2: string[] = [];
  for (const ln of out) {
    if (/^\s*(?:\[[^\]]+\]\s+){1,}\[[^\]]+\]\s*$/.test(ln)) {
      const m = ln.match(/\[[^\]]+\]/g);
      if (m) for (const t of m) out2.push(t);
      continue;
    }
    out2.push(ln);
  }
  return out2;
}

// Separator line. May appear alone (`----`) or carry an inline label on the
// right (`---- You can use separator`). Captured trailing text is emitted as
// a `text` block immediately after the separator so the rendered row order
// is `sep-solid` / `text` / `sep-double` / ...
const SEP_DASH = /^-{2,}(?:\s+(.+?))?\s*$/;
const SEP_EQUAL = /^={2,}(?:\s+(.+?))?\s*$/;
// Titled dotted separator (`..Title..`) requires the closing dots to be
// present; check this before SEP_DOT_TRAIL so `..center..` doesn't fall
// through to the plain-dotted branch.
const SEP_DOT_TITLE = /^\.{2,}([^.]+?)\.{2,}\s*$/;
const SEP_DOT_TRAIL = /^\.{2,}(?:\s+(.+?))?\s*$/;

/**
 * Split a multi-line bracket label into structured label blocks. Adjacent
 * text lines collapse into a single `text` block (joined by `\n`) so layout
 * can measure them as a paragraph. Returns `null` when the label is a single
 * line with no separators (caller falls back to plain `name` rendering).
 */
export function parseLabelBlocks(label: string): LabelBlock[] | null {
  if (!label.includes('\n')) return null;
  const lines = label.split('\n');
  const blocks: LabelBlock[] = [];
  let textBuf: string[] = [];
  const flushText = (): void => {
    if (textBuf.length > 0) {
      blocks.push({ kind: 'text', text: textBuf.join('\n') });
      textBuf = [];
    }
  };
  let m: RegExpExecArray | null;
  for (const ln of lines) {
    const t = ln.trim();
    if ((m = SEP_DASH.exec(t))) {
      flushText();
      blocks.push({ kind: 'sep-solid' });
      if (m[1]) textBuf.push(m[1]);
      continue;
    }
    if ((m = SEP_EQUAL.exec(t))) {
      flushText();
      blocks.push({ kind: 'sep-double' });
      if (m[1]) textBuf.push(m[1]);
      continue;
    }
    if ((m = SEP_DOT_TITLE.exec(t))) {
      flushText();
      blocks.push({ kind: 'sep-titled', text: m[1]!.trim() });
      continue;
    }
    if ((m = SEP_DOT_TRAIL.exec(t))) {
      flushText();
      blocks.push({ kind: 'sep-dotted' });
      if (m[1]) textBuf.push(m[1]);
      continue;
    }
    textBuf.push(ln);
  }
  flushText();
  return blocks;
}

export interface DeclResult {
  node: ContainerNode;
  hasOpenBrace: boolean;
}

export interface NormalizedEndpoint {
  name: string;
  nodeKind?: ContainerNodeKind;
  /**
   * `true` when the endpoint token used an explicit declaration form
   * (e.g. `[Name]` in the component parser). Explicit endpoints created from
   * a relationship JOIN the active container (Bug C), whereas bare-id
   * endpoints stay at root and are eligible for the interface auto-promotion
   * post-pass (Bug B2).
   */
  explicit?: boolean;
}

export interface ContainerParserOptions {
  diagramKind: ContainerAst['kind'];
  defaultNodeKind: ContainerNodeKind;
  tryDecl: (text: string) => DeclResult | null;
  normalizeEndpoint?: (raw: string) => NormalizedEndpoint;
  tryAttributeLine?: (text: string, byId: Map<string, ContainerNode>) => boolean;
  /**
   * When `true`, after parsing completes, any node that was implicitly
   * created from a bare-id relationship endpoint (no explicit declaration,
   * no `[brackets]`) is promoted to `nodeKind: 'interface'`. PlantUML uses
   * this rule in component diagrams so `[Comp] --> HTTP` renders `HTTP` as
   * a small lollipop circle when nothing declared it.
   */
  autoInterfaceFromBare?: boolean;
}

export function runContainerParser(source: string, opts: ContainerParserOptions): ContainerAst {
  const ast: ContainerAst = {
    kind: opts.diagramKind,
    title: '',
    nodes: [],
    relationships: [],
  };
  const byId = new Map<string, ContainerNode>();
  const parentStack: ContainerNode[] = [];
  const removedIds = new Set<string>();
  let noteAnonCounter = 0;
  // Tracks ids that were created implicitly by a bare-id relationship
  // endpoint (no `[brackets]`, no explicit declaration). The interface
  // auto-promotion post-pass converts these to `nodeKind: 'interface'` so
  // PlantUML's `[Comp] --> HTTP` shorthand renders `HTTP` as a small
  // lollipop circle when nothing ever declared it.
  const bareEndpointIds = new Set<string>();
  // Ids that received an explicit declaration (`component X`, `interface X`,
  // `[X]`, etc.). Used by the auto-interface post-pass to skip nodes that
  // were declared, even if they were also referenced by a bare relationship.
  const explicitlyDeclaredIds = new Set<string>();
  // Active note block — covers both attached (`note <side> of X` ... `end
  // note`, populated `anchorId`/`anchorSide`) and free-standing
  // (`note as N` ... `end note`, populated `freeId`) forms. The discriminator
  // is `freeId !== undefined`. Mirrors the usecase parser's collection state.
  let activeNoteBlock: {
    anchorId?: string;
    anchorSide?: 'left' | 'right' | 'top' | 'bottom';
    freeId?: string;
    bodyLines: string[];
  } | null = null;
  // Pre-join continuation lines for multi-line bracket labels (`folder X [\n
  // line one\n ---\n line two\n]`) so the per-line declaration matchers see
  // one logical line with `\n`s embedded in the bracket content. Then split
  // any `{` / `}` braces that share a line with their declaration so deeply
  // nested one-liners (`cloud { node { stack { } } }`) reach the per-line
  // loop as one declaration per logical line.
  const lines = splitBraceBoundaries(
    joinBracketContinuations(source.split(/\r\n|\r|\n/)),
  );

  const addNode = (node: ContainerNode): ContainerNode => {
    const existing = byId.get(node.id);
    if (existing) {
      if (existing.nodeKind === opts.defaultNodeKind && node.nodeKind !== opts.defaultNodeKind) {
        existing.nodeKind = node.nodeKind;
      }
      if (!existing.name && node.name) existing.name = node.name;
      return existing;
    }
    byId.set(node.id, node);
    const parent = parentStack[parentStack.length - 1];
    if (parent) {
      parent.children.push(node);
    } else {
      ast.nodes.push(node);
    }
    return node;
  };

  for (const raw of lines) {
    const text = raw.trim();
    // When inside an active `note <side> of X` ... `end note` block, every
    // line (including blank lines) is consumed as body content until the
    // terminator. Body lines are stored trimmed so leading whitespace from
    // indented blocks doesn't leak into the rendered note.
    if (activeNoteBlock) {
      if (NOTE_END.test(text)) {
        const body = activeNoteBlock.bodyLines.join('\n');
        const isFree = activeNoteBlock.freeId !== undefined;
        const id = isFree
          ? activeNoteBlock.freeId!
          : `__container_note_${noteAnonCounter++}`;
        const note: ContainerNode = {
          id,
          name: body,
          nodeKind: 'note',
          attributes: [],
          children: [],
          text: body,
        };
        if (!isFree) {
          note.anchorId = activeNoteBlock.anchorId!;
          note.anchorSide = activeNoteBlock.anchorSide!;
        }
        addNodeAtRoot(ast, byId, note);
        if (isFree) explicitlyDeclaredIds.add(id);
        activeNoteBlock = null;
      } else {
        activeNoteBlock.bodyLines.push(text);
      }
      continue;
    }
    if (!text) continue;
    if (LINE_COMMENT.test(text)) continue;
    if (WRAPPER.test(text)) continue;

    if (BLOCK_CLOSE.test(text)) {
      parentStack.pop();
      continue;
    }

    // Attached-note declarations are checked before the generic decl /
    // relationship parsers since a `note <side> of X` line would otherwise
    // fall through to `parseRelationship` and emit a spurious relationship
    // between `note` and the rest of the line.
    let noteMatch: RegExpExecArray | null;
    if ((noteMatch = NOTE_OF_INLINE.exec(text))) {
      const side = noteMatch[1]!.toLowerCase() as 'left' | 'right' | 'top' | 'bottom';
      const anchorId = resolveNoteAnchor(noteMatch[2]!);
      const body = unescapeNoteBody(noteMatch[3]!.trim());
      const id = `__container_note_${noteAnonCounter++}`;
      addNodeAtRoot(ast, byId, {
        id,
        name: body,
        nodeKind: 'note',
        attributes: [],
        children: [],
        text: body,
        anchorId,
        anchorSide: side,
      });
      continue;
    }
    if ((noteMatch = NOTE_OF_BLOCK.exec(text))) {
      const side = noteMatch[1]!.toLowerCase() as 'left' | 'right' | 'top' | 'bottom';
      const anchorId = resolveNoteAnchor(noteMatch[2]!);
      activeNoteBlock = { anchorId, anchorSide: side, bodyLines: [] };
      continue;
    }
    // Free-standing inline note with an id: `note "Display" as N : body`.
    // The optional display label at m[1]/m[2] is currently unused — the
    // body itself becomes the rendered text. The id is treated as an
    // explicit declaration so a later dashed link (`C .. N`) connects to
    // this node instead of conjuring a fresh component.
    if ((noteMatch = NOTE_AS_INLINE.exec(text))) {
      const id = noteMatch[3]!;
      const body = unescapeNoteBody(noteMatch[4]!.trim());
      addNodeAtRoot(ast, byId, {
        id,
        name: body,
        nodeKind: 'note',
        attributes: [],
        children: [],
        text: body,
      });
      explicitlyDeclaredIds.add(id);
      continue;
    }
    // Free-standing block note with an id: `note as N` ... `end note`.
    // Body lines are collected verbatim until the terminator. The id is
    // recorded as explicitly declared so relationships (`C .. N`) bind to
    // this node and the auto-interface post-pass leaves it alone.
    if ((noteMatch = NOTE_AS_BLOCK.exec(text))) {
      activeNoteBlock = { freeId: noteMatch[1]!, bodyLines: [] };
      continue;
    }

    const tm = TITLE.exec(text);
    if (tm) {
      ast.title = tm[1]!.trim();
      continue;
    }

    const fm = FOOTER_INLINE.exec(text);
    if (fm) {
      ast.footer = fm[1]!.trim();
      continue;
    }

    // `remove <id>` — collect ids to drop in a post-pass. Mirrors the
    // class-diagram form (Task #30); silently ignored when the id was never
    // declared. Checked before `tryDecl` so a node literally named `remove`
    // would still need to be quoted, which matches PlantUML.
    const rmm = REMOVE_STMT.exec(text);
    if (rmm) {
      removedIds.add(rmm[1]!);
      continue;
    }

    const decl = opts.tryDecl(text);
    if (decl) {
      const stored = addNode(decl.node);
      explicitlyDeclaredIds.add(stored.id);
      if (decl.hasOpenBrace) parentStack.push(stored);
      continue;
    }

    if (opts.tryAttributeLine?.(text, byId)) continue;

    const rel = parseRelationship(text);
    if (rel) {
      const left: NormalizedEndpoint =
        opts.normalizeEndpoint?.(rel.source) ?? { name: rel.source };
      const right: NormalizedEndpoint =
        opts.normalizeEndpoint?.(rel.target) ?? { name: rel.target };

      const makeNode = (name: string, nodeKind?: ContainerNodeKind): ContainerNode => ({
        id: name,
        name,
        nodeKind: nodeKind ?? opts.defaultNodeKind,
        attributes: [],
        children: [],
      });

      // Explicit endpoints (e.g. `[Name]` form) are treated as declarations
      // and join the active container (Bug C). Bare-id endpoints stay at
      // root and are recorded for the auto-interface post-pass (Bug B2).
      const placeEndpoint = (ep: NormalizedEndpoint): void => {
        if (byId.has(ep.name)) {
          if (ep.explicit) explicitlyDeclaredIds.add(ep.name);
          return;
        }
        const node = makeNode(ep.name, ep.nodeKind);
        if (ep.explicit) {
          addNode(node);
          explicitlyDeclaredIds.add(ep.name);
        } else {
          addNodeAtRoot(ast, byId, node);
          bareEndpointIds.add(ep.name);
        }
      };

      placeEndpoint(left);
      placeEndpoint(right);
      const cRel: ContainerRelationship = {
        source: left.name,
        target: right.name,
        arrowToken: rel.arrowToken,
        style: rel.style,
        sourceMarker: rel.sourceMarker,
        targetMarker: rel.targetMarker,
        label: rel.label,
      };
      ast.relationships.push(cRel);
    }
  }

  // Auto-interface promotion (Bug B2): in component diagrams, a relationship
  // endpoint that was never declared and never written in bracket form is
  // rendered as an interface (small lollipop circle). Restricted to the
  // component diagram via the `autoInterfaceFromBare` flag because deployment
  // and object diagrams don't have an interface visual.
  if (opts.autoInterfaceFromBare) {
    for (const id of bareEndpointIds) {
      if (explicitlyDeclaredIds.has(id)) continue;
      const node = byId.get(id);
      if (!node) continue;
      // Only promote when the node still carries the parser's default kind —
      // a normalizeEndpoint that already chose a specific kind wins.
      if (node.nodeKind === opts.defaultNodeKind) {
        node.nodeKind = 'interface';
      }
    }
  }

  // Apply `remove <id>` statements: walk the node tree dropping any node
  // (root or nested) whose id is in `removedIds`, then drop relationships
  // that reference a removed endpoint. Unknown ids are silently ignored.
  if (removedIds.size > 0) {
    const filterNodes = (nodes: ContainerNode[]): ContainerNode[] => {
      const kept: ContainerNode[] = [];
      for (const n of nodes) {
        if (removedIds.has(n.id)) continue;
        if (n.children.length > 0) n.children = filterNodes(n.children);
        kept.push(n);
      }
      return kept;
    };
    ast.nodes = filterNodes(ast.nodes);
    ast.relationships = ast.relationships.filter(
      (r) => !removedIds.has(r.source) && !removedIds.has(r.target),
    );
  }

  return ast;
}

function addNodeAtRoot(
  ast: ContainerAst,
  byId: Map<string, ContainerNode>,
  node: ContainerNode,
): void {
  if (byId.has(node.id)) return;
  byId.set(node.id, node);
  ast.nodes.push(node);
}

export function extractName(quoted: string | undefined, bare: string | undefined): string {
  return (quoted ?? bare ?? '').trim();
}

const LINE_STYLE_KEYS = new Set<ContainerLineStyle>(['solid', 'dashed', 'dotted', 'bold']);

/**
 * Parse a multi-property style suffix that begins with a single `#` and apply
 * it to a container node. The grammar is the same as the state-diagram
 * inline-style added in Task #39:
 *
 *   `#fillColor`                                 — bare fill
 *   `#fill;line:red;line.bold;text:white;back:y` — fill + line/text overrides
 *   `#line.dotted;line:gold`                     — leading style with no fill
 *
 * Recognised properties: bare leading fill (or `back:`), `line:<color>`,
 * `line.bold` / `line.dashed` / `line.dotted` / `line.solid`, `text:<color>`.
 * Unknown segments are silently ignored.
 *
 * For backward compatibility with the older `#Color` single-token form, when
 * the suffix carries no `;` separator we ALSO stash the raw token verbatim on
 * `node.color` so existing layout code paths (and goldens) that read
 * `node.color` keep working unchanged.
 */
export function applyContainerStyleSuffix(node: ContainerNode, raw: string): void {
  const trimmed = raw.startsWith('#') ? raw.slice(1) : raw;
  const segments = trimmed.split(';').map((s) => s.trim()).filter(Boolean);
  // Single-token form (`#Yellow`, `#FF0000`) — preserve the legacy `color`
  // field so callers reading the AST still see the raw source token.
  if (
    segments.length === 1 &&
    !/^line[:.]/i.test(segments[0]!) &&
    !/^text:/i.test(segments[0]!) &&
    !/^back:/i.test(segments[0]!)
  ) {
    node.color = segments[0]!;
    return;
  }
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    if (
      i === 0 &&
      !/^line[:.]/i.test(seg) &&
      !/^text:/i.test(seg) &&
      !/^back:/i.test(seg)
    ) {
      node.fill = normalizeStyleColor(seg);
      continue;
    }
    const back = /^back\s*:\s*(\S+)$/i.exec(seg);
    if (back) {
      node.fill = normalizeStyleColor(back[1]!);
      continue;
    }
    const lineColor = /^line\s*:\s*(\S+)$/i.exec(seg);
    if (lineColor) {
      node.lineColor = normalizeStyleColor(lineColor[1]!);
      continue;
    }
    const lineStyle = /^line\.(bold|dashed|dotted|solid)$/i.exec(seg);
    if (lineStyle) {
      const style = lineStyle[1]!.toLowerCase() as ContainerLineStyle;
      if (LINE_STYLE_KEYS.has(style)) node.lineStyle = style;
      continue;
    }
    const textColor = /^text\s*:\s*(\S+)$/i.exec(seg);
    if (textColor) {
      node.textColor = normalizeStyleColor(textColor[1]!);
      continue;
    }
  }
}

function normalizeStyleColor(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith('#')) return trimmed;
  // Bare hex (`00FFFF`) → `#00FFFF`. Only treat as hex if it contains a
  // letter, so plain digit-only tokens don't get a `#` prefix.
  if (/^[0-9a-fA-F]{3,8}$/.test(trimmed) && /[a-fA-F]/.test(trimmed)) {
    return `#${trimmed}`;
  }
  return trimmed.toLowerCase();
}

/**
 * Archimate layer-color lookup. PlantUML's archimate diagrams tag each element
 * with a layer hint (`#Business`, `#Application`, `#Technology`, …) that
 * conventionally selects a layer-appropriate pastel fill. The table maps the
 * layer name (case-insensitive) to a CSS color string the renderer accepts.
 * Used by the `archimate` declaration in the component parser; layers not in
 * the table fall through as-is so users can still pass a literal color
 * (`#Yellow`, `#FFAA00`).
 */
export const ARCHIMATE_LAYER_COLORS: Record<string, string> = {
  business:       '#FFFFB5',
  application:    '#B5FFFF',
  technology:     '#C9E7B7',
  motivation:     '#E7B7E7',
  strategy:       '#FFD9B5',
  implementation: '#FFB5C5',
  physical:       '#C9E7B7',
};

/**
 * Resolve a layer hint token (with or without leading `#`) to its conventional
 * pastel fill. Returns `null` when the token is not a known layer name so the
 * caller can fall back to treating it as a literal color.
 */
export function resolveArchimateLayer(raw: string): string | null {
  const trimmed = raw.startsWith('#') ? raw.slice(1) : raw;
  return ARCHIMATE_LAYER_COLORS[trimmed.toLowerCase()] ?? null;
}

/**
 * Common set of shape keywords accepted by both the component and deployment
 * parsers. Centralised so the two parsers stay in sync when a new keyword is
 * added. `interface` is component-only and added separately by that parser.
 */
export const SHAPE_KIND_KEYWORDS =
  'node|cloud|database|folder|frame|rectangle|component|artifact|storage|queue|package|card|usecase|action|agent|hexagon|process|stack|file';

/**
 * Map a raw keyword token (lowercased) to a `ContainerNodeKind`. PlantUML's
 * `file` shape is a folded-corner page icon visually close to `artifact`, so
 * we share the artifact draw function for simplicity (both icons in PlantUML
 * are folded-page silhouettes).
 */
export function mapShapeKind(token: string): ContainerNodeKind {
  if (token === 'file') return 'artifact';
  return token as ContainerNodeKind;
}
