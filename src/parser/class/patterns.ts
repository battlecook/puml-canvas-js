// `$` is allowed at the start of an identifier and inside it: PlantUML accepts
// `$`-prefixed class names (e.g. `class $C1`). Note this is distinct from
// PlantUML's tag-style attribute (`$tagname` AFTER a class name) — that is
// handled separately by stripping leading tag tokens before the `class` keyword.
const CLASS_NAME = String.raw`(?:"([^"]+)"|([A-Za-z_$][\w$.]*(?:<(?:[^<>]|<[^<>]*>)*>)?))`;

// Optional visibility marker BEFORE the `class` keyword:
//   -class Foo  (private)
//   #class Foo  (protected)
//   ~class Foo  (package)
//   +class Foo  (public)
// Captured separately so the rest of the pattern stays unchanged.
//
// Group 7 captures an optional "tail" (between the stereotype and the optional
// opening `{`) that may include `extends`/`implements` clauses and a
// `#<styleBlock>`. It's parsed in code; see `parseDeclTail`.
export const CLASS_DECL = new RegExp(
  String.raw`^(?:([+\-#~])\s*)?(abstract\s+class|abstract|class|interface|enum|annotation|record)\s+` +
    CLASS_NAME +
    String.raw`(?:\s+as\s+(\S+))?` +
    String.raw`(?:\s+<<\s*([^>]+?)\s*>>)?` +
    String.raw`(?:\s+([^{]*?))?` +
    String.raw`\s*(\{)?\s*$`,
  'i',
);

// `remove <name>` — drops the named class (by id) from the rendered diagram.
// Silently ignored when the class was never declared.
export const REMOVE_STMT = /^remove\s+(\S+)\s*$/i;

// `left to right direction` / `top to bottom direction` diagram-level flow hint.
export const DIRECTION_LR = /^left\s+to\s+right\s+direction\s*$/i;
export const DIRECTION_TB = /^top\s+to\s+bottom\s+direction\s*$/i;

// Leading PlantUML tag-style attribute token before the `class` keyword, e.g.
// `$C2 class "$C2" as dollarC2`. We tolerate this as a no-op decorator: peel
// the leading `$tag` (whitespace-bounded) and continue parsing the rest as a
// normal declaration. Note the *value* class-name regex (CLASS_NAME) is what
// allows `$`-prefixed IDs inside a normal `class $X` declaration; this prefix
// only fires when something appears BEFORE the visibility marker / `class`
// keyword.
export const LEADING_TAG = /^(\$\S+)\s+(?=(?:[+\-#~]\s*)?(?:abstract\s+|class\b|interface\b|enum\b|annotation\b|record\b))/i;

export const BODY_OPEN = /^\{\s*$/;
export const BODY_CLOSE = /^\}\s*$/;

export const MEMBER_VISIBILITY = /^([+\-#~])\s*/;
export const MEMBER_MODIFIER = /^\{(static|abstract)\}\s*/i;
export const MEMBER_METHOD = /^([A-Za-z_]\w*)\s*\(([^)]*)\)\s*(?::\s*(.+?))?\s*$/;
export const MEMBER_FIELD = /^([A-Za-z_]\w*)\s*(?::\s*(.+?))?\s*$/;
export const ENUM_CONSTANT = /^([A-Za-z_]\w*)\s*$/;

// Marker characters tolerated by the relationship arrow tokenizer.
// `<|`/`|>` (triangle), `<`/`>` (arrow), `o` (open diamond), `*` (filled diamond)
// are the semantically meaningful ones. The bracketed set (`+ # x } { ^`)
// catches less-common or non-standard markers users sometimes type — we accept
// them so the relationship parses (rendered as a plain line) instead of being
// silently dropped.
// One or more dashes is enough for a class association (PlantUML 본가 compat:
// `A - B` is a valid plain association — the dash count is purely a layout
// length hint, not a semantic difference). Similarly the dashed form accepts
// one-or-more dots (`.>` is the shorter sibling of `..>` in PlantUML); the
// dot count is a length hint, not a semantic distinction.
export const ARROW = /(?:<\||<|o|\*|[+#x}{^])?(?:-+|\.+)(?:\|>|>|o|\*|[+#x}{^])?/g;
export const ARROW_FULL = /^(?:<\||<|o|\*|[+#x}{^])?(?:-+|\.+)(?:\|>|>|o|\*|[+#x}{^])?$/;
export const REL_LEFT = /^("[^"]+"|\[[^\]]+\]|\([^)]+\)|:[^:"]+:|[^\s"]+)(?:\s+"([^"]+)")?\s*$/;
export const REL_RIGHT = /^(?:"([^"]+)"\s+)?("[^"]+"|\[[^\]]+\]|\([^)]+\)|:[^:"]+:|[^\s"]+)\s*$/;

export const NOTE_FLOATING = /^note\s+(?:"([^"]+)"|(\S+))\s+as\s+(\S+)\s*$/i;
export const NOTE_OF_INLINE = /^note\s+(left|right|top|bottom)\s+of\s+(\S+)\s*:\s*(.+)$/i;
export const NOTE_OF_BLOCK = /^note\s+(left|right|top|bottom)\s+of\s+(\S+)\s*$/i;
export const NOTE_AS_BLOCK = /^note\s+as\s+(\S+)\s*$/i;
export const NOTE_END = /^end\s+note\s*$/i;

export function extractName(quoted: string | undefined, bare: string | undefined): string {
  return (quoted ?? bare ?? '').trim();
}
