import type {
  LabelBlock,
  UCContainer,
  UCJsonNode,
  UCNode,
  UCNodeKind,
  UCRelationship,
  UseCaseAst,
} from '../../ast/usecase.js';
import { parseRelationship } from '../class/relationships.js';
import { extractSkinparams } from '../skinparams.js';

/**
 * Glue together lines that fall inside an unterminated quoted string. PlantUML
 * allows the `"..."` content of a usecase declaration to span several physical
 * lines; we want them to look like one logical line to the rest of the parser.
 *
 * Strategy: walk lines counting un-escaped `"` characters. Whenever a line's
 * cumulative count is odd, we are mid-string — concatenate the next line with
 * a real `\n` until the count is even again.
 */
function joinQuotedContinuations(lines: string[]): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    let cur = lines[i]!;
    let quoteCount = countQuotes(cur);
    while (quoteCount % 2 === 1 && i + 1 < lines.length) {
      i++;
      cur = cur + '\n' + lines[i]!;
      quoteCount += countQuotes(lines[i]!);
    }
    out.push(cur);
    i++;
  }
  return out;
}

function countQuotes(s: string): number {
  let n = 0;
  for (let j = 0; j < s.length; j++) if (s[j] === '"') n++;
  return n;
}

const SEP_DASH = /^-{2,}$/;
const SEP_EQUAL = /^={2,}$/;
const SEP_DOT_ONLY = /^\.{2,}$/;
const SEP_DOT_TITLE = /^\.{2,}([^.]+?)\.{2,}$/;

/**
 * Split a `"..."` label that may contain `\n` newlines into structured label
 * blocks. Returns `null` if no separator lines are present and the label has
 * only one line (the caller can keep the plain `name` rendering).
 *
 * Block-folding rule: adjacent text lines collapse into a single `text` block
 * with `\n` between them, so layout can measure them as one paragraph.
 */
function parseLabelBlocks(label: string): LabelBlock[] | null {
  if (!label.includes('\n')) {
    return null;
  }
  const lines = label.split('\n');
  const blocks: LabelBlock[] = [];
  let textBuf: string[] = [];
  const flushText = () => {
    if (textBuf.length > 0) {
      blocks.push({ kind: 'text', text: textBuf.join('\n') });
      textBuf = [];
    }
  };
  for (const ln of lines) {
    const t = ln.trim();
    if (SEP_DASH.test(t)) {
      flushText();
      blocks.push({ kind: 'sep-solid' });
      continue;
    }
    if (SEP_EQUAL.test(t)) {
      flushText();
      blocks.push({ kind: 'sep-double' });
      continue;
    }
    const titled = SEP_DOT_TITLE.exec(t);
    if (titled) {
      flushText();
      blocks.push({ kind: 'sep-titled', text: titled[1]!.trim() });
      continue;
    }
    if (SEP_DOT_ONLY.test(t)) {
      flushText();
      blocks.push({ kind: 'sep-dotted' });
      continue;
    }
    textBuf.push(ln);
  }
  flushText();
  return blocks;
}

const WRAPPER = /^@(start|end)\w+/i;
const LINE_COMMENT = /^\s*'/;
const TITLE = /^title\s+(.+)\s*$/i;
// `allowmixing` toggles PlantUML's "mix data types" mode that lets a use-case
// diagram embed `json`/`yaml`/etc. blocks. We silently accept the directive
// (it's a no-op flag on its own) and downstream parsing recognises the
// embedded blocks unconditionally — there's no reason to gate on the flag
// once the source has been classified as a use-case diagram.
const ALLOW_MIXING = /^allowmixing\s*$/i;
// `json <Name> {` — opener for an embedded JSON block. The block body runs
// until the matching `}` (with balanced braces inside string-quoted values).
// We capture the block name so the AST node has a stable id; the body is
// consumed by the brace-balance loop below.
const JSON_BLOCK_OPEN = /^json\s+(\S+)\s*\{\s*$/i;
// `left to right direction` / `top to bottom direction` — diagram-level flow
// hint. Stored on the AST as `direction` and consumed by layout to swap the
// rank/within-layer axes of the sugiyama placement.
const DIRECTION_LR = /^left\s+to\s+right\s+direction\s*$/i;
const DIRECTION_TB = /^top\s+to\s+bottom\s+direction\s*$/i;

// Trailing `<< text >>` stereotype block attached to a node declaration.
// We strip this before pattern matching so each declaration pattern can stay
// focused on the id / display / alias capture and only the post-pass below
// needs to understand the stereotype grammar.
const STEREO_TAIL = /\s*<<\s*([^<>]+?)\s*>>\s*$/;

/** Bare identifier line, e.g. `User` after a trailing `<<...>>` was peeled. */
const BARE_ID = /^(\S+)\s*$/;

function peelStereotype(text: string): { stripped: string; stereotype?: string } {
  const m = STEREO_TAIL.exec(text);
  if (!m) return { stripped: text };
  return {
    stripped: text.slice(0, m.index).trimEnd(),
    stereotype: m[1]!.trim(),
  };
}

/**
 * Detect and strip the PlantUML "business" marker `/` from a node declaration
 * line.
 *
 * The marker applies to both use cases and actors, in either of two positions:
 *   - Right after a closing paren of the usecase shorthand form:  `(Foo)/`,
 *     `(Foo)/ as Bar`, `(Foo)/ as (Bar)`.
 *   - Right after a closing colon of the actor shorthand form:  `:Foo:/`,
 *     `:Foo:/ as Bar`.
 *   - Right after the `usecase` keyword:  `usecase/ Foo`,
 *     `usecase/ Foo as Bar`, `usecase/ "Quoted" as Bar`,
 *     `usecase/ (Display) as Bar`.
 *   - Right after the `actor` keyword:  `actor/ Foo`, `actor/ :Foo: as Bar`,
 *     `actor/ "Quoted" as Bar`.
 *
 * Returns the line with the slash removed plus a flag. The downstream regex
 * patterns then match the stripped line exactly as they did before this
 * feature existed, so we don't have to multiply each declaration pattern.
 */
function peelBusinessMarker(text: string): { stripped: string; business: boolean } {
  // `usecase/` / `actor/` keyword form. Slash must be directly adjacent to the
  // keyword and followed by whitespace (otherwise `usecase/Foo` / `actor/Foo`
  // would be unparseable; PlantUML requires the space).
  const kw = /^(usecase|actor)\/(\s)/i.exec(text);
  if (kw) {
    return { stripped: `${kw[1]!}${kw[2]!}` + text.slice(kw[0]!.length), business: true };
  }
  // `)/` form on the usecase shorthand. Slash sits right after `)` and is
  // followed by whitespace, end-of-line, or ` as ...`. We strip exactly the
  // slash so the rest of the line (alias suffix etc.) is unchanged.
  const sh = /\)\/(?=\s|$)/.exec(text);
  if (sh) {
    return {
      stripped: text.slice(0, sh.index + 1) + text.slice(sh.index + 2),
      business: true,
    };
  }
  // `:Display:/` form on the actor shorthand. Slash sits right after the
  // closing colon and is followed by whitespace, end-of-line, or ` as ...`.
  // The leading colon must not be at index 0 only — we need a closing `:`
  // somewhere mid-line. Restricting the lookbehind to a non-space char before
  // the closing `:` prevents matching stray slashes after lone colons.
  const actorSh = /:\/(?=\s|$)/.exec(text);
  if (actorSh && text.startsWith(':')) {
    return {
      stripped: text.slice(0, actorSh.index + 1) + text.slice(actorSh.index + 2),
      business: true,
    };
  }
  return { stripped: text, business: false };
}

/**
 * Expand `\n` escape sequences into real newlines for a parenthesized
 * usecase display label, so `(Last\nusecase)` lays out across two lines.
 */
function unescapeLabel(text: string): string {
  return text.replace(/\\n/g, '\n');
}

const NAME = String.raw`(?:"([^"]+)"|([^\s,"<>{}]+))`;

const ACTOR_DECL = new RegExp(
  String.raw`^actor\s+` + NAME + String.raw`(?:\s+as\s+(\S+))?\s*$`,
  'i',
);
// `actor :Display: as Alias` — keyword form whose display is wrapped in colons
// (the actor shorthand syntax). Listed before ACTOR_DECL so the colon-wrapped
// display isn't captured verbatim (colons are not excluded from NAME's bare-id
// charset).
//   m[1] = display, m[2] = alias id
const ACTOR_COLON_DISPLAY = /^actor\s+:([^:]+):(?:\s+as\s+(\S+))?\s*$/i;
const USECASE_DECL = new RegExp(
  String.raw`^usecase\s+` + NAME + String.raw`(?:\s+as\s+(\S+))?\s*$`,
  'i',
);
// `usecase ID as "Display can\nspan multiple lines."` — the alias comes
// first, the display label is a quoted multi-line string. Listed before
// the generic USECASE_DECL since the quoted tail would otherwise confuse
// the `(\S+)` alias capture (which would grab `"Display`).
//   m[1] = alias id, m[2] = display label (may contain `\n`)
const USECASE_ID_AS_QUOTED = /^usecase\s+(\S+)\s+as\s+"([\s\S]+?)"\s*$/i;
// `usecase (Display) as Alias` — keyword form whose display is wrapped in
// parens. Listed before USECASE_DECL so the paren-wrapped display isn't
// captured verbatim (parens are not excluded from NAME's bare-id charset).
//   m[1] = display, m[2] = alias id
const USECASE_PAREN_DISPLAY = /^usecase\s+\(([^)]+)\)(?:\s+as\s+(\S+))?\s*$/i;
const ACTOR_SHORT = /^:([^:]+):(?:\s+as\s+(\S+))?\s*$/;
const USECASE_SHORT = /^\(([^)]+)\)(?:\s+as\s+(\S+))?\s*$/;
// `"Quoted text" as (Alias)` — bind a usecase alias to a display label.
//   m[1] = display, m[2] = alias id (between parens)
const QUOTED_AS_USECASE = /^"([^"]+)"\s+as\s+\(([^)]+)\)\s*$/i;
// `(Display text) as (Alias)` — paren-wrapped display bound to an aliased
// usecase. Without this rule, USECASE_SHORT would capture `(Display text)`
// and then greedy-match `(Alias)` (including the parens) as the alias id,
// producing two separate nodes after the relationship parser auto-declares
// the bare alias.
//   m[1] = display, m[2] = alias id
const PAREN_AS_USECASE = /^\(([^)]+)\)\s+as\s+\(([^)]+)\)\s*$/i;
// `"Quoted text" as Alias` — bare quoted form. PlantUML treats this as an
// actor when used in subsequent arrows (default-to-actor when ambiguous).
//   m[1] = display name, m[2] = alias id
const QUOTED_AS_BARE = /^"([^"]+)"\s+as\s+(\S+)\s*$/i;
const CONTAINER_OPEN = new RegExp(
  String.raw`^(rectangle|package|node|frame|cloud|folder)\s+` +
    NAME +
    String.raw`(?:\s+as\s+(\S+))?\s*\{\s*$`,
  'i',
);
const CONTAINER_CLOSE = /^\}\s*$/;

// `note "text\nmore" as Id` — free-standing note with an id. The body text
// may use `\n` escapes which are expanded to real newlines by unescapeNote.
//   m[1] = text, m[2] = id
const NOTE_FREE_AS = /^note\s+"(.+?)"\s+as\s+(\S+)\s*$/i;
// `note <side> of <anchor> : <text>` — single-line attached note.
//   m[1] = side, m[2] = anchor (bare id, "quoted", or (paren)), m[3] = body
const NOTE_OF_INLINE = /^note\s+(left|right|top|bottom)\s+of\s+("[^"]+"|\([^)]+\)|\S+)\s*:\s*(.*)$/i;
// `note <side> of <anchor>` (with body on following lines, terminated by
// `end note`). Same capture indexes as NOTE_OF_INLINE except for the body.
const NOTE_OF_BLOCK = /^note\s+(left|right|top|bottom)\s+of\s+("[^"]+"|\([^)]+\)|\S+)\s*$/i;
const NOTE_END = /^end\s+note\s*$/i;

/**
 * Parsed result of an inline `#<styleBlock>` peeled off a relationship line.
 * Any field is optional; only the keys recognised by the style grammar are
 * populated.
 */
interface InlineStyle {
  /** Raw line with the `#<styleBlock>` removed, ready for arrow parsing. */
  stripped: string;
  lineColor?: string;
  lineStyle?: 'solid' | 'dashed' | 'dotted' | 'bold';
  textColor?: string;
}

/**
 * Same as `InlineStyle` but for NODE declarations, which have a separate
 * "fill" slot (the shape interior) in addition to the stroke. A bare
 * `#<color>` at the head of the block becomes the fill, not the line colour,
 * matching PlantUML's `actor X #pink` form.
 */
interface InlineNodeStyle {
  stripped: string;
  fill?: string;
  lineColor?: string;
  lineStyle?: 'solid' | 'dashed' | 'dotted' | 'bold';
  textColor?: string;
}

// `#<token>(;<token>)*` — a hash flush against a token consisting of
// `[\w.:#-]` characters, optionally chained with `;`-separated sub-tokens.
// Sub-tokens may include `:` (`line:red`, `text:red`) and `.` (`line.bold`),
// which is why the character class is more permissive than a bare identifier.
//
// The block must be terminated by whitespace, `:` (start of label), or end of
// line. It also must be space-flanked at the start so a stray `#` inside an
// endpoint can't trigger a spurious match.
const INLINE_STYLE_BLOCK = /(?:^|\s)(#[\w.:#-]+(?:;[\w.:#-]+)*)(?=\s|:|$)/;

/**
 * Detect and strip a PlantUML inline `#<styleBlock>` from a relationship line.
 *
 * Forms recognised (separated by `;`):
 *   - `#<color>`        bare colour — shorthand for `line:<color>`.
 *   - `line:<color>`    line stroke colour.
 *   - `line.bold`       bold (thicker) stroke.
 *   - `line.dashed`     long-dash dasharray.
 *   - `line.dotted`     short-dash dasharray.
 *   - `text:<color>`    label text colour.
 *
 * Returns the original line with the matched block removed (so the downstream
 * arrow parser sees a clean `source <arrow> target [: label]` shape) and the
 * extracted style tokens. If no block is found, `stripped` is the input
 * verbatim and the style fields are absent.
 */
function peelInlineStyle(line: string): InlineStyle {
  const m = INLINE_STYLE_BLOCK.exec(line);
  if (!m) return { stripped: line };
  const blockStart = m.index + (m[0].length - m[1]!.length);
  const blockEnd = blockStart + m[1]!.length;
  // Cut out the block and collapse the resulting double-space so the
  // downstream arrow parser sees a clean `source <arrow> target [: label]`.
  const stripped = (line.slice(0, blockStart) + line.slice(blockEnd))
    .replace(/\s+/g, ' ')
    .trim();
  const body = m[1]!.slice(1); // drop the leading `#`
  const out: InlineStyle = { stripped };
  for (const rawTok of body.split(';')) {
    const tok = rawTok.trim();
    if (!tok) continue;
    if (/^line:/i.test(tok)) {
      out.lineColor = tok.slice(5).trim();
      continue;
    }
    if (/^text:/i.test(tok)) {
      out.textColor = tok.slice(5).trim();
      continue;
    }
    if (/^line\.bold$/i.test(tok)) {
      out.lineStyle = 'bold';
      continue;
    }
    if (/^line\.dashed$/i.test(tok)) {
      out.lineStyle = 'dashed';
      continue;
    }
    if (/^line\.dotted$/i.test(tok)) {
      out.lineStyle = 'dotted';
      continue;
    }
    // Bare colour — apply as line colour if no explicit `line:<…>` was given
    // earlier in the same block. PlantUML treats the first bare colour as the
    // overall colour (line + fill); for relationships there's no fill to set,
    // so we route it to the stroke.
    if (!out.lineColor) out.lineColor = tok;
  }
  return out;
}

/**
 * Variant of `peelInlineStyle` for actor / usecase NODE declarations.
 *
 * Recognises the same `;`-separated token grammar (`line:<color>`,
 * `line.bold|dashed|dotted`, `text:<color>`) but routes a bare colour to the
 * shape's FILL rather than its stroke. That matches PlantUML's node form:
 *   `actor b #pink;line:red;line.bold;text:red`
 * where `#pink` paints the actor's head circle pink and `line:red` paints
 * the strokes red. For relationships there's no fill, which is why the
 * sibling helper routes bare colours to the line instead.
 *
 * Returns the line with the `#<styleBlock>` removed (so the declaration
 * regexes can match the bare `actor b` head) plus the extracted style
 * tokens. If no block is present, `stripped` is the input verbatim.
 */
function peelInlineNodeStyle(line: string): InlineNodeStyle {
  const m = INLINE_STYLE_BLOCK.exec(line);
  if (!m) return { stripped: line };
  const blockStart = m.index + (m[0].length - m[1]!.length);
  const blockEnd = blockStart + m[1]!.length;
  const stripped = (line.slice(0, blockStart) + line.slice(blockEnd))
    .replace(/\s+/g, ' ')
    .trim();
  const body = m[1]!.slice(1); // drop the leading `#`
  const out: InlineNodeStyle = { stripped };
  for (const rawTok of body.split(';')) {
    const tok = rawTok.trim();
    if (!tok) continue;
    if (/^line:/i.test(tok)) {
      out.lineColor = tok.slice(5).trim();
      continue;
    }
    if (/^text:/i.test(tok)) {
      out.textColor = tok.slice(5).trim();
      continue;
    }
    if (/^line\.bold$/i.test(tok)) {
      out.lineStyle = 'bold';
      continue;
    }
    if (/^line\.dashed$/i.test(tok)) {
      out.lineStyle = 'dashed';
      continue;
    }
    if (/^line\.dotted$/i.test(tok)) {
      out.lineStyle = 'dotted';
      continue;
    }
    // Bare colour — node form treats this as the fill (shape interior).
    // Subsequent bare colours are ignored so the FIRST bare colour wins,
    // matching PlantUML's "the leading #colour is the fill" convention.
    if (!out.fill) out.fill = tok;
  }
  return out;
}

export function parseUseCase(source: string): UseCaseAst {
  const ast: UseCaseAst = {
    kind: 'usecase',
    title: '',
    nodes: [],
    containers: [],
    relationships: [],
  };
  const byId = new Map<string, UCNode>();
  const containerStack: UCContainer[] = [];
  let anonCounter = 0;
  let noteAnonCounter = 0;
  // Active multi-line note block. When non-null, every subsequent source line
  // up to `end note` is appended to `bodyLines`. Closing the block creates a
  // single note node with the joined body as its text.
  let activeNoteBlock: {
    anchorId: string;
    anchorSide: 'left' | 'right' | 'top' | 'bottom';
    bodyLines: string[];
  } | null = null;
  const rawLines = source.split(/\r\n|\r|\n/);
  const { lines: skinned, skin } = extractSkinparams(rawLines);
  // Join physical lines that fall inside an unterminated `"..."` so the
  // declaration regexes see one logical line. The joined separator is a real
  // `\n`, which we keep so layout can later split the label into rows.
  const lines = joinQuotedContinuations(skinned);
  if (Object.keys(skin).length > 0) ast.skin = skin;

  const resolveAnchor = (raw: string): string => {
    const t = raw.trim();
    if (t.startsWith('(') && t.endsWith(')')) return t.slice(1, -1).trim();
    if (t.startsWith('"') && t.endsWith('"')) return t.slice(1, -1).trim();
    return t;
  };

  // Tracks which ids were "declared in" the active container vs merely
  // "referenced in" it. Only declared ids populate `container.childIds` (i.e.
  // members rendered inside the boundary box). Declaration sources:
  //   * an explicit declaration line (`actor X`, `usecase Y`, ...);
  //   * an auto-promotion from a parenthesized/colon-disambiguated endpoint
  //     (`(payment)`, `:foo:`) — PlantUML treats these as declarations.
  // Bare-id relationship endpoints (`customer -- (checkout)` where `customer`
  // was declared outside) are REFERENCES only and must NOT join `childIds`,
  // otherwise the layout would treat them as members of the boundary.
  const upsert = (
    n: UCNode,
    explicit = false,
    joinContainer = true,
  ): UCNode => {
    const existing = byId.get(n.id);
    if (existing) {
      // Explicit declarations (`actor X`, `"X" as Y`, `"text" as (Id)`) win
      // over auto-declarations created when an arrow referenced the id first.
      // Promote the placeholder's kind/name so the rendered label is correct.
      if (explicit) {
        existing.name = n.name;
        existing.kind = n.kind;
        if (n.stereotype) existing.stereotype = n.stereotype;
      }
      return existing;
    }
    byId.set(n.id, n);
    ast.nodes.push(n);
    if (joinContainer) {
      const top = containerStack[containerStack.length - 1];
      if (top) top.childIds.push(n.id);
    }
    return n;
  };

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const raw = lines[lineIdx]!;
    const text = raw.trim();
    // When inside a `note <side> of X` ... `end note` block, accumulate body
    // lines verbatim (trimmed) until we hit the terminator. Empty lines are
    // preserved as empty body rows so the user's intended spacing survives.
    if (activeNoteBlock) {
      if (NOTE_END.test(text)) {
        const id = `__uc_note_${noteAnonCounter++}`;
        upsert(
          {
            id,
            name: activeNoteBlock.bodyLines.join('\n'),
            kind: 'note',
            text: activeNoteBlock.bodyLines.join('\n'),
            anchorId: activeNoteBlock.anchorId,
            anchorSide: activeNoteBlock.anchorSide,
          },
          true,
        );
        activeNoteBlock = null;
      } else {
        activeNoteBlock.bodyLines.push(text);
      }
      continue;
    }
    if (!text) continue;
    if (LINE_COMMENT.test(text)) continue;
    if (WRAPPER.test(text)) continue;

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

    // `allowmixing` is a no-op flag — it only signals to PlantUML that the
    // subsequent source may contain JSON / YAML / etc. blocks. We always
    // accept those blocks regardless, so the directive itself is silently
    // dropped here.
    if (ALLOW_MIXING.test(text)) continue;

    let m: RegExpExecArray | null;

    // Embedded `json <Name> { ... }` block (enabled by `allowmixing`).
    // Consume lines until the matching `}` (with brace balance so nested
    // objects don't confuse the terminator), then run the body through
    // `JSON.parse` and stash it under `ast.jsonNodes`. We intentionally
    // share `JSON.parse` with the standalone JSON parser rather than
    // re-implement an embedded-object grammar.
    if ((m = JSON_BLOCK_OPEN.exec(text))) {
      const id = m[1]!.trim();
      // The opening `{` is on the header line; start the body buffer fresh
      // at depth 1 and scan forward for the matching close.
      const bodyLines: string[] = [];
      let depth = 1;
      let inString = false;
      let escape = false;
      let consumed = lineIdx;
      while (++consumed < lines.length && depth > 0) {
        const ln = lines[consumed]!;
        for (let i = 0; i < ln.length; i++) {
          const ch = ln[i]!;
          if (escape) { escape = false; continue; }
          if (inString) {
            if (ch === '\\') { escape = true; continue; }
            if (ch === '"') inString = false;
            continue;
          }
          if (ch === '"') { inString = true; continue; }
          if (ch === '{') depth++;
          else if (ch === '}') {
            depth--;
            if (depth === 0) break;
          }
        }
        if (depth === 0) {
          // Drop a trailing `}` from this final line so the body is pure JSON
          // content (with the outer braces re-added below).
          const closeIdx = ln.lastIndexOf('}');
          if (closeIdx >= 0) bodyLines.push(ln.slice(0, closeIdx));
        } else {
          bodyLines.push(ln);
        }
      }
      const body = `{${bodyLines.join('\n')}}`.trim();
      const node: UCJsonNode = { id, data: null };
      try {
        node.data = JSON.parse(body);
      } catch (e) {
        node.parseError = e instanceof Error ? e.message : String(e);
      }
      if (!ast.jsonNodes) ast.jsonNodes = [];
      ast.jsonNodes.push(node);
      lineIdx = consumed; // resume after the closing brace
      continue;
    }
    // Note declarations are checked before generic node patterns since a
    // `note ...` line otherwise wouldn't match any of the declaration rules
    // and would fall through to the relationship parser (which would emit a
    // spurious relationship between `note` and the rest of the line).
    if ((m = NOTE_FREE_AS.exec(text))) {
      const body = unescapeNote(m[1]!);
      const id = m[2]!.trim();
      upsert({ id, name: body, kind: 'note', text: body }, true);
      continue;
    }
    if ((m = NOTE_OF_INLINE.exec(text))) {
      const side = m[1]!.toLowerCase() as 'left' | 'right' | 'top' | 'bottom';
      const anchorId = resolveAnchor(m[2]!);
      const body = unescapeNote(m[3]!.trim());
      const id = `__uc_note_${noteAnonCounter++}`;
      upsert(
        { id, name: body, kind: 'note', text: body, anchorId, anchorSide: side },
        true,
      );
      continue;
    }
    if ((m = NOTE_OF_BLOCK.exec(text))) {
      const side = m[1]!.toLowerCase() as 'left' | 'right' | 'top' | 'bottom';
      const anchorId = resolveAnchor(m[2]!);
      activeNoteBlock = { anchorId, anchorSide: side, bodyLines: [] };
      continue;
    }
    if ((m = CONTAINER_OPEN.exec(text))) {
      const label = (m[2] ?? m[3] ?? '').trim();
      const id = m[4] ?? (label || `__uc_container_${anonCounter++}`);
      const container: UCContainer = { id, label, childIds: [] };
      ast.containers.push(container);
      containerStack.push(container);
      continue;
    }
    if (CONTAINER_CLOSE.test(text)) {
      containerStack.pop();
      continue;
    }

    // Peel a trailing `<<…>>` stereotype block off node declarations so the
    // pattern matchers below don't each need their own stereotype capture.
    // The original `text` is preserved for fallthrough to the relationship
    // parser, where a trailing `<<…>>` (e.g. `: <<include>>` label) means
    // something entirely different.
    const peeledStereo = peelStereotype(text);
    // Peel an inline `#<styleBlock>` (`#pink;line:red;line.bold;text:red`)
    // off the declaration BEFORE the business `/` marker so the rest of the
    // line that reaches the pattern matchers below ends right after the
    // identifier (or alias) — exactly the shape the declaration regexes
    // expect. Without this peel, an `actor b #pink;…` line would fail every
    // pattern (no regex accepts a `#`-prefixed tail) and silently drop.
    const peeledNodeStyle = peelInlineNodeStyle(peeledStereo.stripped);
    // Peel the "business" `/` marker too: `(Foo)/` or `usecase/`. Run this
    // after stereotype peeling so a `/` inside `<<…>>` can't accidentally
    // match. The downstream patterns see the slash-stripped form.
    const { stripped, business } = peelBusinessMarker(peeledNodeStyle.stripped);
    const stereotype = peeledStereo.stereotype;
    const applyStereo = (n: UCNode) => {
      if (stereotype) n.stereotype = stereotype;
      // `business` applies to both usecase (`(Foo)/`, `usecase/`) and actor
      // (`:Foo:/`, `actor/`) declarations. Layout decides per-kind how to
      // render the marker (left chord for usecase ellipses; small slash at
      // the bottom-right of actor figures).
      if (business && (n.kind === 'usecase' || n.kind === 'actor')) n.business = true;
      // Inline `#<styleBlock>` tokens become per-node visual overrides. Each
      // is optional — only the keys present in the source line are forwarded
      // to the AST, so untouched nodes still get their skin / hard-coded
      // defaults at layout time.
      if (peeledNodeStyle.fill) n.fill = peeledNodeStyle.fill;
      if (peeledNodeStyle.lineColor) n.lineColor = peeledNodeStyle.lineColor;
      if (peeledNodeStyle.lineStyle) n.lineStyle = peeledNodeStyle.lineStyle;
      if (peeledNodeStyle.textColor) n.textColor = peeledNodeStyle.textColor;
      return n;
    };

    if ((m = ACTOR_COLON_DISPLAY.exec(stripped))) {
      const name = unescapeLabel(m[1]!.trim());
      const id = m[2] ?? name;
      upsert(applyStereo({ id, name, kind: 'actor' }), true);
      continue;
    }
    if ((m = ACTOR_DECL.exec(stripped))) {
      const name = (m[1] ?? m[2] ?? '').trim();
      const id = m[3] ?? name;
      upsert(applyStereo({ id, name, kind: 'actor' }), true);
      continue;
    }
    if ((m = USECASE_ID_AS_QUOTED.exec(stripped))) {
      const id = m[1]!.trim();
      const display = m[2]!;
      const blocks = parseLabelBlocks(display);
      const node: UCNode = { id, name: display, kind: 'usecase' };
      if (blocks) node.labelBlocks = blocks;
      upsert(applyStereo(node), true);
      continue;
    }
    if ((m = USECASE_PAREN_DISPLAY.exec(stripped))) {
      const name = unescapeLabel(m[1]!.trim());
      const id = m[2] ?? name;
      upsert(applyStereo({ id, name, kind: 'usecase' }), true);
      continue;
    }
    if ((m = USECASE_DECL.exec(stripped))) {
      const name = (m[1] ?? m[2] ?? '').trim();
      const id = m[3] ?? name;
      upsert(applyStereo({ id, name, kind: 'usecase' }), true);
      continue;
    }
    if ((m = ACTOR_SHORT.exec(stripped))) {
      const name = unescapeLabel(m[1]!.trim());
      const id = m[2] ?? name;
      upsert(applyStereo({ id, name, kind: 'actor' }), true);
      continue;
    }
    // `(Display) as (Id)` — must run before USECASE_SHORT, otherwise the
    // shorthand pattern's `\S+` alias capture would greedily swallow the
    // closing `)` of the alias group, producing two nodes ((Id) and Id).
    if ((m = PAREN_AS_USECASE.exec(stripped))) {
      const name = unescapeLabel(m[1]!.trim());
      const id = m[2]!.trim();
      upsert(applyStereo({ id, name, kind: 'usecase' }), true);
      continue;
    }
    if ((m = USECASE_SHORT.exec(stripped))) {
      const name = unescapeLabel(m[1]!.trim());
      const id = m[2] ?? name;
      upsert(applyStereo({ id, name, kind: 'usecase' }), true);
      continue;
    }
    // `"Display" as (Id)` — usecase whose display label is the quoted text.
    if ((m = QUOTED_AS_USECASE.exec(stripped))) {
      const name = m[1]!.trim();
      const id = m[2]!.trim();
      upsert(applyStereo({ id, name, kind: 'usecase' }), true);
      continue;
    }
    // `"Display" as Id` (no keyword) — bare quoted form. Defaults to actor;
    // a later arrow that wraps the id in `(…)` would override to usecase.
    if ((m = QUOTED_AS_BARE.exec(stripped))) {
      const name = m[1]!.trim();
      const id = m[2]!.trim();
      upsert(applyStereo({ id, name, kind: 'actor' }), true);
      continue;
    }
    // Bare-id with stereotype: `User << Human >>` declares an actor. We
    // require a peeled stereotype here so plain identifier lines without
    // `<<…>>` keep falling through to the relationship / fallback path.
    if (stereotype && (m = BARE_ID.exec(stripped))) {
      const id = m[1]!.trim();
      upsert(applyStereo({ id, name: id, kind: 'actor' }), true);
      continue;
    }

    // Peel an inline `#<styleBlock>` (`#line:red;line.bold;text:red`) off the
    // raw relationship line BEFORE handing it to `parseRelationship`. The
    // block sits between the target and the optional `:` label; without
    // stripping it, the `:` inside `line:red` would be mistaken for the
    // label-separator and the structural endpoint regex would reject the
    // leftover `#line` tail (dropping the entire relationship silently).
    const peeledStyle = peelInlineStyle(text);
    const rel = parseRelationship(peeledStyle.stripped);
    if (rel) {
      const left = normalizeEndpoint(rel.source);
      const right = normalizeEndpoint(rel.target);
      if (left.kind) upsert({ id: left.name, name: left.name, kind: left.kind });
      if (right.kind) upsert({ id: right.name, name: right.name, kind: right.kind });
      // PlantUML default: a bare identifier on a relationship endpoint with no
      // prior declaration is treated as an actor. Parens (`(Foo)`) and colons
      // (`:Foo:`) explicitly disambiguate; everything else falls back to actor.
      // Bare-id references inside a container are NOT promoted to members of
      // that container — they're references to an external (or to-be-declared)
      // node. Without this distinction, lines like `customer -- (checkout)`
      // inside `rectangle checkout { ... }` would incorrectly attach `customer`
      // to the boundary box even when `customer` is declared outside the block.
      if (!byId.has(left.name)) {
        upsert({ id: left.name, name: left.name, kind: 'actor' }, false, false);
      }
      if (!byId.has(right.name)) {
        upsert({ id: right.name, name: right.name, kind: 'actor' }, false, false);
      }

      // Reverse-direction arrow normalization: when the arrow token leads with
      // a head marker (`<` or `<|`), the source-order endpoints are reversed
      // relative to flow. Swap so `source -> target` always means "tail on
      // source, head on target" in the resulting AST. Style (solid/dashed) is
      // preserved. Class diagrams keep the unswapped form for compatibility
      // with existing tests, so this normalization lives in the use-case
      // parser only.
      const reverse = rel.arrowToken.startsWith('<');
      // `\n` escapes inside the arrow label should expand to real newlines so
      // layout can split a multi-line label across rows, same as `unescapeLabel`
      // does for parenthesized usecase displays.
      const label = unescapeLabel(rel.label);
      const ucRel: UCRelationship = reverse
        ? {
            source: right.name,
            target: left.name,
            arrowToken: rel.arrowToken,
            style: rel.style,
            sourceMarker: rel.targetMarker,
            targetMarker: rel.sourceMarker,
            label,
          }
        : {
            source: left.name,
            target: right.name,
            arrowToken: rel.arrowToken,
            style: rel.style,
            sourceMarker: rel.sourceMarker,
            targetMarker: rel.targetMarker,
            label,
          };
      // Direction hints are layout suggestions on the source -> target axis
      // (PlantUML reads the qualifier as "place the target on this side of
      // the source"). When the source-order arrow is reversed (`<-left-`),
      // the hint still refers to the visual source after normalization, so
      // we preserve it verbatim without flipping.
      if (rel.direction) ucRel.direction = rel.direction;
      // Inline `#<styleBlock>` tokens are independent of arrow direction —
      // they describe how the line is drawn, not which end it points at —
      // so the reverse swap above does not affect them.
      if (peeledStyle.lineColor) ucRel.lineColor = peeledStyle.lineColor;
      if (peeledStyle.lineStyle) ucRel.lineStyle = peeledStyle.lineStyle;
      if (peeledStyle.textColor) ucRel.textColor = peeledStyle.textColor;
      ast.relationships.push(ucRel);
    }
  }

  return ast;
}

/**
 * Expand `\n` escape sequences in a quoted note body into real newlines so
 * layout can split on `\n` to produce one rendered line per segment. The
 * quoted source string itself contains a literal backslash-n pair; this
 * function converts it to a `\n` line break.
 */
function unescapeNote(text: string): string {
  return text.replace(/\\n/g, '\n');
}

function normalizeEndpoint(raw: string): { name: string; kind?: UCNodeKind } {
  const t = raw.trim();
  if (t.startsWith('(') && t.endsWith(')')) {
    return { name: t.slice(1, -1).trim(), kind: 'usecase' };
  }
  if (t.startsWith(':') && t.endsWith(':')) {
    return { name: t.slice(1, -1).trim(), kind: 'actor' };
  }
  return { name: t };
}
