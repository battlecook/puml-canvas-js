import type {
  LabelBlock,
  UCContainer,
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

  const upsert = (n: UCNode, explicit = false): UCNode => {
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
    const top = containerStack[containerStack.length - 1];
    if (top) top.childIds.push(n.id);
    return n;
  };

  for (const raw of lines) {
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

    let m: RegExpExecArray | null;
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
    // Peel the "business" `/` marker too: `(Foo)/` or `usecase/`. Run this
    // after stereotype peeling so a `/` inside `<<…>>` can't accidentally
    // match. The downstream patterns see the slash-stripped form.
    const { stripped, business } = peelBusinessMarker(peeledStereo.stripped);
    const stereotype = peeledStereo.stereotype;
    const applyStereo = (n: UCNode) => {
      if (stereotype) n.stereotype = stereotype;
      // `business` applies to both usecase (`(Foo)/`, `usecase/`) and actor
      // (`:Foo:/`, `actor/`) declarations. Layout decides per-kind how to
      // render the marker (left chord for usecase ellipses; small slash at
      // the bottom-right of actor figures).
      if (business && (n.kind === 'usecase' || n.kind === 'actor')) n.business = true;
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

    const rel = parseRelationship(text);
    if (rel) {
      const left = normalizeEndpoint(rel.source);
      const right = normalizeEndpoint(rel.target);
      if (left.kind) upsert({ id: left.name, name: left.name, kind: left.kind });
      if (right.kind) upsert({ id: right.name, name: right.name, kind: right.kind });
      // PlantUML default: a bare identifier on a relationship endpoint with no
      // prior declaration is treated as an actor. Parens (`(Foo)`) and colons
      // (`:Foo:`) explicitly disambiguate; everything else falls back to actor.
      if (!byId.has(left.name)) upsert({ id: left.name, name: left.name, kind: 'actor' });
      if (!byId.has(right.name)) upsert({ id: right.name, name: right.name, kind: 'actor' });

      // Reverse-direction arrow normalization: when the arrow token leads with
      // a head marker (`<` or `<|`), the source-order endpoints are reversed
      // relative to flow. Swap so `source -> target` always means "tail on
      // source, head on target" in the resulting AST. Style (solid/dashed) is
      // preserved. Class diagrams keep the unswapped form for compatibility
      // with existing tests, so this normalization lives in the use-case
      // parser only.
      const reverse = rel.arrowToken.startsWith('<');
      const ucRel: UCRelationship = reverse
        ? {
            source: right.name,
            target: left.name,
            arrowToken: rel.arrowToken,
            style: rel.style,
            sourceMarker: rel.targetMarker,
            targetMarker: rel.sourceMarker,
            label: rel.label,
          }
        : {
            source: left.name,
            target: right.name,
            arrowToken: rel.arrowToken,
            style: rel.style,
            sourceMarker: rel.sourceMarker,
            targetMarker: rel.targetMarker,
            label: rel.label,
          };
      // Direction hints are layout suggestions on the source -> target axis
      // (PlantUML reads the qualifier as "place the target on this side of
      // the source"). When the source-order arrow is reversed (`<-left-`),
      // the hint still refers to the visual source after normalization, so
      // we preserve it verbatim without flipping.
      if (rel.direction) ucRel.direction = rel.direction;
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
