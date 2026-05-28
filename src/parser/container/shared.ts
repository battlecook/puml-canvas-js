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

export interface ContainerParserOptions {
  diagramKind: ContainerAst['kind'];
  defaultNodeKind: ContainerNodeKind;
  tryDecl: (text: string) => DeclResult | null;
  normalizeEndpoint?: (raw: string) => { name: string; nodeKind?: ContainerNodeKind };
  tryAttributeLine?: (text: string, byId: Map<string, ContainerNode>) => boolean;
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
    if (!text) continue;
    if (LINE_COMMENT.test(text)) continue;
    if (WRAPPER.test(text)) continue;

    if (BLOCK_CLOSE.test(text)) {
      parentStack.pop();
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

    const decl = opts.tryDecl(text);
    if (decl) {
      const stored = addNode(decl.node);
      if (decl.hasOpenBrace) parentStack.push(stored);
      continue;
    }

    if (opts.tryAttributeLine?.(text, byId)) continue;

    const rel = parseRelationship(text);
    if (rel) {
      const left = (opts.normalizeEndpoint?.(rel.source)) ?? { name: rel.source };
      const right = (opts.normalizeEndpoint?.(rel.target)) ?? { name: rel.target };

      const makeNode = (name: string, nodeKind?: ContainerNodeKind): ContainerNode => ({
        id: name,
        name,
        nodeKind: nodeKind ?? opts.defaultNodeKind,
        attributes: [],
        children: [],
      });

      if (!byId.has(left.name)) {
        addNodeAtRoot(ast, byId, makeNode(left.name, left.nodeKind));
      }
      if (!byId.has(right.name)) {
        addNodeAtRoot(ast, byId, makeNode(right.name, right.nodeKind));
      }
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
